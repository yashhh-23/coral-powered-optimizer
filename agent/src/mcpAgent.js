import OpenAI from "openai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  getSchemaCache,
  setSchemaCache,
  getSchemaDetailsCache,
  setSchemaDetailsCache,
  getQueryCache,
  setQueryCache
} from "./cache.js";

function getSystemPrompt(leetcodeEnabled) {
  if (leetcodeEnabled) {
    return `You are an assistant that maps developer skills to open-source opportunities. You have access to a database containing:

1. **LeetCode skill stats** — the user's solved problem tags from competitive programming (tables: leetcode.fundamental_skills, leetcode.intermediate_skills, leetcode.advanced_skills, leetcode.recent_submissions).
2. **GitHub issues** — open issues from GSoC-targeted repositories (table: github.issues, with filters like owner, repo, state).

Your job is to:
- Understand the user's algorithmic strengths from their LeetCode profile.
- Find open "good first issue" or "help wanted" issues in GSoC repositories.
- Write cross-source SQL JOINs that match the user's DSA skill tags to relevant GitHub issues.
- Return clean, executable SQL. Wrap it in \`\`\`sql code fences.

Key SQL patterns:
- Use github.issues with filters: owner = 'org_name' AND repo = 'repo_name' AND state = 'open'
- Use leetcode.fundamental_skills for core DSA skills
- JOIN on LOWER(issues.title) LIKE CONCAT('%', LOWER(skills.tag_name), '%')
- Common GSoC orgs: asyncapi, zulip, layer5io, cncf, oppia, fossasia
- GitHub columns include: title, html_url, body, state, label_names, number, owner, repo

Always prefer cross-source JOINs over single-source queries when the question involves matching skills to opportunities.`;
  }

  return `You are an assistant that maps developer skills to open-source opportunities. You have access to a database containing open issues from GitHub repositories (table: github.issues).

Your job is to:
- Find open "good first issue" or "help wanted" issues in GSoC repositories based on the user's natural language request.
- Return clean, executable SQL. Wrap it in \`\`\`sql code fences.

Key SQL patterns:
- Use github.issues with filters: owner = 'org_name' AND repo = 'repo_name' AND state = 'open'
- Filter by labels using LIKE or JSON functions where appropriate, e.g., LOWER(label_names) LIKE '%good first issue%'
- Common GSoC orgs: asyncapi, zulip, layer5io, cncf, oppia, fossasia
- GitHub columns include: title, html_url, body, state, label_names, number, owner, repo

Generate SQL to query the github.issues table that best matches the user's request.`;
}

export const toolMap = {
  listTables: "list_tables",
  describeTable: "describe_table",
  query: "query"
};

export async function connectCoral() {
  const client = new Client({
    name: "gsoc-matchmaker-agent",
    version: "0.2.0"
  });

  // Coral runs inside WSL — spawn via wsl.exe on Windows, direct on Linux/macOS
  const transport = new StdioClientTransport({
    command: process.platform === "win32" ? "wsl.exe" : "coral",
    args: process.platform === "win32"
      ? ["-e", "bash", "-l", "-c", "coral mcp-stdio"]
      : ["mcp-stdio"]
  });

  await client.connect(transport);

  // Dynamically map tools based on version
  try {
    const listResult = await client.listTools();
    const tools = listResult?.tools || [];
    if (tools.some(t => t.name === "sql")) {
      toolMap.query = "sql";
    }
    if (tools.some(t => t.name === "list_catalog")) {
      toolMap.listTables = "list_catalog";
    }
  } catch (err) {
    console.warn("Could not list MCP tools, using defaults:", err.message);
  }

  return client;
}

function parseMcpResult(result) {
  if (Array.isArray(result) && result[0]?.text) {
    try {
      return JSON.parse(result[0].text);
    } catch (e) {
      return result[0].text;
    }
  }
  if (result?.content?.[0]?.text) {
    try {
      return JSON.parse(result.content[0].text);
    } catch (e) {
      return result.content[0].text;
    }
  }
  if (typeof result === "string") {
    try {
      return JSON.parse(result);
    } catch (e) {
      return result;
    }
  }
  return result;
}

async function callTool(client, name, args) {
  if (!client?.callTool) {
    throw new Error("MCP client is not connected. Did connectCoral() fail?");
  }

  const result = await client.callTool({
    name,
    arguments: args
  });

  return result?.content ?? result;
}

export async function buildSchemaContext(client, leetcodeEnabled = true) {
  const cachedSchema = getSchemaCache();
  if (cachedSchema && !leetcodeEnabled) {
    // Basic cache invalidation if params change, ideally cache key would include leetcodeEnabled
    // but for simplicity, we just rebuild if leetcode is disabled to ensure it's filtered correctly
  } else if (cachedSchema) {
    console.log("[Cache] Schema read from local cache.");
    return cachedSchema;
  }

  console.log("[Schema] Fetching schema from Coral MCP...");
  const rawResult = await callTool(client, toolMap.listTables, {});
  const tablesResult = parseMcpResult(rawResult);

  let tables = [];
  if (Array.isArray(tablesResult)) {
    tables = tablesResult;
  } else if (tablesResult?.tables) {
    tables = tablesResult.tables;
  } else if (tablesResult?.items) {
    tables = tablesResult.items
      .filter(item => item.kind === "table")
      .map(item => item.sql_reference || `${item.schema_name}.${item.name}`);
  }

  if (!leetcodeEnabled) {
    tables = tables.filter(t => typeof t === "string" && !t.startsWith("leetcode."));
  }

  if (tables.length === 0) {
    return "No tables returned from Coral MCP.";
  }

  const descriptions = [];
  for (const table of tables) {
    if (typeof table !== "string") continue;
    let describeArgs = { table };
    if (toolMap.query === "sql") {
      const parts = table.split(".");
      if (parts.length === 2) {
        describeArgs = { schema: parts[0], table: parts[1] };
      }
    }
    let describeResult = await callTool(client, toolMap.describeTable, describeArgs);
    describeResult = parseMcpResult(describeResult);
    descriptions.push(`Table: ${table}\n${JSON.stringify(describeResult, null, 2)}`);
  }

  const schema = descriptions.join("\n\n");
  setSchemaCache(schema);
  return schema;
}

export async function getSchemaDetails(client, leetcodeEnabled = true) {
  const cachedDetails = getSchemaDetailsCache();
  if (cachedDetails && leetcodeEnabled) {
    console.log("[Cache] Schema details read from local cache.");
    return cachedDetails;
  }

  console.log("[Schema] Fetching schema details from Coral MCP...");
  const rawResult = await callTool(client, toolMap.listTables, {});
  const tablesResult = parseMcpResult(rawResult);

  let tables = [];
  if (Array.isArray(tablesResult)) {
    tables = tablesResult;
  } else if (tablesResult?.tables) {
    tables = tablesResult.tables;
  } else if (tablesResult?.items) {
    tables = tablesResult.items
      .filter(item => item.kind === "table")
      .map(item => item.sql_reference || `${item.schema_name}.${item.name}`);
  }

  if (!leetcodeEnabled) {
    tables = tables.filter(t => typeof t === "string" && !t.startsWith("leetcode."));
  }

  const details = [];
  for (const table of tables) {
    if (typeof table !== "string") continue;
    let describeArgs = { table };
    if (toolMap.query === "sql") {
      const parts = table.split(".");
      if (parts.length === 2) {
        describeArgs = { schema: parts[0], table: parts[1] };
      }
    }
    let describeResult = await callTool(client, toolMap.describeTable, describeArgs);
    describeResult = parseMcpResult(describeResult);
    details.push({ table, description: describeResult });
  }

  const payload = { tables, details };
  setSchemaDetailsCache(payload);
  return payload;
}

export async function generateSql({ question, schema, leetcodeEnabled = true }) {
  const cachedSql = getQueryCache(question);
  if (cachedSql) {
    console.log("[Cache] SQL query read from local cache.");
    return cachedSql;
  }

  const geminiApiKey = process.env.GEMINI_API_KEY;
  const groqApiKey = process.env.GROQ_API_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;

  const geminiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const groqModel = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

  const hasGemini = !!geminiApiKey || (openaiApiKey && !openaiApiKey.startsWith("sk-") && !openaiApiKey.startsWith("gsk_"));
  const hasGroq = !!groqApiKey;

  const providers = [];
  if (hasGemini) {
    providers.push({
      name: "Gemini",
      apiKey: geminiApiKey || openaiApiKey,
      model: geminiModel,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
    });
  }
  if (hasGroq) {
    providers.push({
      name: "Groq",
      apiKey: groqApiKey,
      model: groqModel,
      baseURL: "https://api.groq.com/openai/v1"
    });
  }
  if (openaiApiKey && openaiApiKey.startsWith("sk-")) {
    providers.push({
      name: "OpenAI",
      apiKey: openaiApiKey,
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      baseURL: undefined
    });
  }

  if (providers.length === 0) {
    throw new Error("No API keys found. Please configure GEMINI_API_KEY or GROQ_API_KEY in your environment.");
  }

  let lastError = null;
  for (const provider of providers) {
    try {
      console.log(`[Agent] Trying ${provider.name} with model ${provider.model}...`);
      const openai = new OpenAI({
        apiKey: provider.apiKey,
        ...(provider.baseURL ? { baseURL: provider.baseURL } : {})
      });

      const response = await openai.chat.completions.create({
        model: provider.model,
        temperature: 0.1,
        messages: [
          { role: "system", content: getSystemPrompt(leetcodeEnabled) },
          { role: "system", content: `Schema:\n${schema}` },
          { role: "user", content: question }
        ]
      });

      const content = response.choices?.[0]?.message?.content ?? "";
      const sql = extractSql(content);
      if (sql) {
        console.log(`[Agent] Successfully generated SQL using ${provider.name}.`);
        setQueryCache(question, sql);
        return sql;
      }
    } catch (err) {
      console.warn(`[Agent] ${provider.name} failed:`, err.message || err);
      lastError = err;
    }
  }

  throw new Error(`Failed to generate SQL from any configured provider. Last error: ${lastError?.message || lastError}`);
}

export async function runQuery(client, sql) {
  return callTool(client, toolMap.query, { sql });
}

export function extractSql(content) {
  const fenced = content.match(/```sql\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  return content.trim();
}

export async function generateInsights({ question, sql, result }) {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const groqApiKey = process.env.GROQ_API_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;

  const geminiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const groqModel = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

  const hasGemini = !!geminiApiKey || (openaiApiKey && !openaiApiKey.startsWith("sk-") && !openaiApiKey.startsWith("gsk_"));
  const hasGroq = !!groqApiKey;

  const providers = [];
  if (hasGemini) {
    providers.push({
      name: "Gemini",
      apiKey: geminiApiKey || openaiApiKey,
      model: geminiModel,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
    });
  }
  if (hasGroq) {
    providers.push({
      name: "Groq",
      apiKey: groqApiKey,
      model: groqModel,
      baseURL: "https://api.groq.com/openai/v1"
    });
  }
  if (openaiApiKey && openaiApiKey.startsWith("sk-")) {
    providers.push({
      name: "OpenAI",
      apiKey: openaiApiKey,
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      baseURL: undefined
    });
  }

  if (providers.length === 0) {
    throw new Error("No API keys found.");
  }

  const prompt = `You are a helpful assistant analyzing open-source issues.
The user asked: "${question}"

I queried the database with this SQL:
${sql}

And got these results:
${JSON.stringify(result, null, 2)}

Task: Write a concise, professional, friendly response (under 100 words).
1. Include a very brief "Proposal Pitch" the user can use for GSoC or open source.
2. Provide a "Match Score" out of 100%.
3. You MUST explicitly include 2 to 3 GitHub issue links (URLs) from the results so the user can click them and start contributing.

Output ONLY the final text/markdown response. No raw JSON.`;

  for (const provider of providers) {
    try {
      console.log(`[Agent] Generating insights using ${provider.name}...`);
      const openai = new OpenAI({
        apiKey: provider.apiKey,
        ...(provider.baseURL ? { baseURL: provider.baseURL } : {})
      });

      const response = await openai.chat.completions.create({
        model: provider.model,
        temperature: 0.7,
        messages: [{ role: "user", content: prompt }]
      });

      const content = response.choices?.[0]?.message?.content ?? "";
      if (content) return content;
    } catch (err) {
      console.warn(`[Agent] Insights generation with ${provider.name} failed:`, err.message || err);
    }
  }

  return "Could not generate insights at this time, but you can view the raw results below!";
}