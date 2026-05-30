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

// Tables from the github.* source that are allowed through the schema filter.
// github.commits requires owner+repo filters per Coral's GitHub source spec.
// github.user_repos is needed to discover the user's own repos for commit queries.
const ALLOWED_GITHUB_TABLES = new Set([
  "github.issues",
  "github.commits",
  "github.user_repos"
]);

function getSystemPrompt(leetcodeEnabled, githubUsername) {
  const resolvedUsername = githubUsername || "your_github_username";

  const commonInstructions = `
CRITICAL REQUIREMENTS:
1. When querying 'github.issues', you MUST ALWAYS filter by 'owner' AND 'repo' for EVERY row — querying without both will return only issues assigned to the authenticated user (empty). You MUST query multiple repos using UNION ALL as shown in the examples below.
2. NEVER use UNNEST, JSON_EXTRACT_ARRAY, JSON_EXTRACT_SCALAR, json_get_array, json_get, json_extract, or any other JSON functions. The 'labels' column is a plain JSON string (Utf8 type). Query it using LIKE only: LOWER(labels) LIKE '%"name":"good first issue"%'
3. Always include state = 'open' in every github.issues sub-query.
4. You MUST always select 'html_url' and 'title' in your final SELECT when querying issues. Do NOT hallucinate or guess URLs.
5. NEVER return a query that only targets one single repo. Always use UNION ALL across at least 4-6 repos.
6. NEVER use GROUP BY, COUNT(*), or any aggregate functions when querying github.issues. Your final result MUST always contain INDIVIDUAL issue rows with their 'title' and 'html_url' columns. Summarization is done later — your job is to return the raw issue rows.

QUERYING THE AUTHENTICATED USER'S COMMITS (github.commits table):
IMPORTANT — Coral's GitHub source flattens nested JSON fields using double-underscores (__).
The github.commits table columns are:
  sha                      — commit SHA (Utf8)
  commit__message          — commit message text (Utf8)  ← NOT "message"
  commit__author__login    — author GitHub login (Utf8)  ← NOT "author" or "author_login"
  commit__author__date     — author date (Utf8)          ← NOT "committed_at"
  commit__committer__date  — committer date (Utf8)
  html_url                 — URL to the commit on GitHub (Utf8)
  owner                    — repo owner (Utf8)  [REQUIRED FILTER]
  repo                     — repo name  (Utf8)  [REQUIRED FILTER]

CRITICAL: github.commits REQUIRES both 'owner' AND 'repo' filters. You CANNOT query it without them.
To get the authenticated user's recent commits across their repos, use UNION ALL across their known repos:

Example — fetch 2 recent commits by '${resolvedUsername}':
\`\`\`sql
SELECT sha, commit__message, commit__author__login, commit__author__date, html_url, owner, repo
FROM github.commits
WHERE owner = '${resolvedUsername}' AND repo = 'YOUR_REPO_NAME'
  AND commit__author__login = '${resolvedUsername}'
ORDER BY commit__author__date DESC
LIMIT 2;
\`\`\`

If the user asks for commits across all their repos, first query github.user_repos to get repo names,
then build a UNION ALL across those repos. Example for known repos:
\`\`\`sql
SELECT sha, commit__message, commit__author__login, commit__author__date, html_url, owner, repo
FROM github.commits
WHERE owner = '${resolvedUsername}' AND repo = 'repo1'
  AND commit__author__login = '${resolvedUsername}'
UNION ALL
SELECT sha, commit__message, commit__author__login, commit__author__date, html_url, owner, repo
FROM github.commits
WHERE owner = '${resolvedUsername}' AND repo = 'repo2'
  AND commit__author__login = '${resolvedUsername}'
ORDER BY commit__author__date DESC
LIMIT 5;
\`\`\`

If you do not know the user's repo names, query github.user_repos first:
\`\`\`sql
SELECT name FROM github.user_repos ORDER BY updated_at DESC LIMIT 10;
\`\`\`
Then use those repo names in the UNION ALL commits query above.

GSoC repos to query for issues (use UNION ALL across ALL of these unless the user specifies a repo):
- owner='asyncapi', repo='website'
- owner='zulip', repo='zulip'
- owner='layer5io', repo='meshery'
- owner='fossasia', repo='open-event-server'
- owner='oppia', repo='oppia'
- owner='sugarlabs', repo='musicblocks'
- owner='CircuitVerse', repo='CircuitVerse'
- owner='RocketChat', repo='Rocket.Chat'
- owner='checkstyle', repo='checkstyle'

IMPORTANT: Do NOT include owner='cncf', repo='landscape' — it is known to time out.

Return clean, executable SQL wrapped in \`\`\`sql code fences.
GitHub issues columns: title, html_url, body, state, labels, number, owner, repo
`;

  if (leetcodeEnabled) {
    return `You are an assistant that maps developer skills to open-source opportunities. You have access to:

1. **LeetCode skill stats** — user's solved problem tags (tables: leetcode.fundamental_skills, leetcode.intermediate_skills, leetcode.advanced_skills, leetcode.recent_submissions).
2. **GitHub issues** — open issues from GSoC repositories (table: github.issues).
3. **GitHub commits** — the authenticated user's own commit history (table: github.commits, requires owner+repo filters).
4. **GitHub user repos** — list of the authenticated user's repositories (table: github.user_repos).

Your job is to find "good first issue" or "help wanted" issues across multiple GSoC repos that relate to the user's skills, OR to answer questions about the user's own GitHub commit history.

${commonInstructions}

SKILL MATCHING STRATEGY:
- Collect the user's top skills using UNION ALL across all three skill tables.
- Match skills against issue labels OR body (NOT just title — issue titles rarely contain algo names like "Dynamic Programming").
- Use a LEFT JOIN so results appear even if no exact skill match exists in labels/body.

Example pattern — adapt repos and filter to the user's question:

\`\`\`sql
WITH all_skills AS (
  SELECT tag_name, problems_solved FROM leetcode.fundamental_skills
  UNION ALL
  SELECT tag_name, problems_solved FROM leetcode.intermediate_skills
  UNION ALL
  SELECT tag_name, problems_solved FROM leetcode.advanced_skills
),
top_skills AS (
  SELECT tag_name, problems_solved FROM all_skills ORDER BY problems_solved DESC LIMIT 10
),
all_issues AS (
  SELECT title, html_url, labels, body, owner, repo FROM github.issues WHERE owner = 'asyncapi' AND repo = 'website' AND state = 'open' AND (LOWER(labels) LIKE '%"name":"good first issue"%' OR LOWER(labels) LIKE '%"name":"help wanted"%')
  UNION ALL
  SELECT title, html_url, labels, body, owner, repo FROM github.issues WHERE owner = 'zulip' AND repo = 'zulip' AND state = 'open' AND (LOWER(labels) LIKE '%"name":"good first issue"%' OR LOWER(labels) LIKE '%"name":"help wanted"%')
  UNION ALL
  SELECT title, html_url, labels, body, owner, repo FROM github.issues WHERE owner = 'layer5io' AND repo = 'meshery' AND state = 'open' AND (LOWER(labels) LIKE '%"name":"good first issue"%' OR LOWER(labels) LIKE '%"name":"help wanted"%')
  UNION ALL
  SELECT title, html_url, labels, body, owner, repo FROM github.issues WHERE owner = 'fossasia' AND repo = 'open-event-server' AND state = 'open' AND (LOWER(labels) LIKE '%"name":"good first issue"%' OR LOWER(labels) LIKE '%"name":"help wanted"%')
  UNION ALL
  SELECT title, html_url, labels, body, owner, repo FROM github.issues WHERE owner = 'oppia' AND repo = 'oppia' AND state = 'open' AND (LOWER(labels) LIKE '%"name":"good first issue"%' OR LOWER(labels) LIKE '%"name":"help wanted"%')
  UNION ALL
  SELECT title, html_url, labels, body, owner, repo FROM github.issues WHERE owner = 'sugarlabs' AND repo = 'musicblocks' AND state = 'open' AND (LOWER(labels) LIKE '%"name":"good first issue"%' OR LOWER(labels) LIKE '%"name":"help wanted"%')
  UNION ALL
  SELECT title, html_url, labels, body, owner, repo FROM github.issues WHERE owner = 'CircuitVerse' AND repo = 'CircuitVerse' AND state = 'open' AND (LOWER(labels) LIKE '%"name":"good first issue"%' OR LOWER(labels) LIKE '%"name":"help wanted"%')
  UNION ALL
  SELECT title, html_url, labels, body, owner, repo FROM github.issues WHERE owner = 'RocketChat' AND repo = 'Rocket.Chat' AND state = 'open' AND (LOWER(labels) LIKE '%"name":"good first issue"%' OR LOWER(labels) LIKE '%"name":"help wanted"%')
  UNION ALL
  SELECT title, html_url, labels, body, owner, repo FROM github.issues WHERE owner = 'checkstyle' AND repo = 'checkstyle' AND state = 'open' AND (LOWER(labels) LIKE '%"name":"good first issue"%' OR LOWER(labels) LIKE '%"name":"help wanted"%')
)
SELECT i.title, i.html_url, i.owner, i.repo, s.tag_name, s.problems_solved
FROM all_issues i
LEFT JOIN top_skills s ON LOWER(i.labels) LIKE CONCAT('%', LOWER(s.tag_name), '%')
                       OR LOWER(i.body) LIKE CONCAT('%', LOWER(s.tag_name), '%')
ORDER BY s.problems_solved DESC NULLS LAST
LIMIT 15;
\`\`\``;
  }

  return `You are an assistant that helps developers find open-source opportunities in GSoC repositories and review their own GitHub activity.

Your job is to find open "good first issue" or "help wanted" issues across multiple GSoC repos, OR to answer questions about the user's own GitHub commit history.

${commonInstructions}

Example pattern — always UNION ALL across multiple repos:

\`\`\`sql
SELECT title, html_url, owner, repo, labels FROM github.issues WHERE owner = 'asyncapi' AND repo = 'website' AND state = 'open' AND (LOWER(labels) LIKE '%"name":"good first issue"%' OR LOWER(labels) LIKE '%"name":"help wanted"%')
UNION ALL
SELECT title, html_url, owner, repo, labels FROM github.issues WHERE owner = 'zulip' AND repo = 'zulip' AND state = 'open' AND (LOWER(labels) LIKE '%"name":"good first issue"%' OR LOWER(labels) LIKE '%"name":"help wanted"%')
UNION ALL
SELECT title, html_url, owner, repo, labels FROM github.issues WHERE owner = 'layer5io' AND repo = 'meshery' AND state = 'open' AND (LOWER(labels) LIKE '%"name":"good first issue"%' OR LOWER(labels) LIKE '%"name":"help wanted"%')
UNION ALL
SELECT title, html_url, owner, repo, labels FROM github.issues WHERE owner = 'fossasia' AND repo = 'open-event-server' AND state = 'open' AND (LOWER(labels) LIKE '%"name":"good first issue"%' OR LOWER(labels) LIKE '%"name":"help wanted"%')
UNION ALL
SELECT title, html_url, owner, repo, labels FROM github.issues WHERE owner = 'oppia' AND repo = 'oppia' AND state = 'open' AND (LOWER(labels) LIKE '%"name":"good first issue"%' OR LOWER(labels) LIKE '%"name":"help wanted"%')
UNION ALL
SELECT title, html_url, owner, repo, labels FROM github.issues WHERE owner = 'sugarlabs' AND repo = 'musicblocks' AND state = 'open' AND (LOWER(labels) LIKE '%"name":"good first issue"%' OR LOWER(labels) LIKE '%"name":"help wanted"%')
UNION ALL
SELECT title, html_url, owner, repo, labels FROM github.issues WHERE owner = 'CircuitVerse' AND repo = 'CircuitVerse' AND state = 'open' AND (LOWER(labels) LIKE '%"name":"good first issue"%' OR LOWER(labels) LIKE '%"name":"help wanted"%')
UNION ALL
SELECT title, html_url, owner, repo, labels FROM github.issues WHERE owner = 'RocketChat' AND repo = 'Rocket.Chat' AND state = 'open' AND (LOWER(labels) LIKE '%"name":"good first issue"%' OR LOWER(labels) LIKE '%"name":"help wanted"%')
UNION ALL
SELECT title, html_url, owner, repo, labels FROM github.issues WHERE owner = 'checkstyle' AND repo = 'checkstyle' AND state = 'open' AND (LOWER(labels) LIKE '%"name":"good first issue"%' OR LOWER(labels) LIKE '%"name":"help wanted"%')
LIMIT 15;
\`\`\``;
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

async function fetchAllTables(client, leetcodeEnabled) {
  let tables = [];

  if (toolMap.listTables === "list_catalog") {
    let offset = 0;
    const limit = 200;
    while (true) {
      console.log(`[Schema] Fetching catalog items (offset: ${offset})...`);
      const rawResult = await callTool(client, "list_catalog", { limit, offset });
      const parsed = parseMcpResult(rawResult);
      const items = parsed?.items || (Array.isArray(parsed) ? parsed : null);
      
      if (!items || items.length === 0) {
        break;
      }
      
      const pageTables = items
        .filter(item => item.kind === "table")
        .map(item => item.sql_reference || `${item.schema_name}.${item.name}`);
      
      tables.push(...pageTables);
      
      if (items.length < limit) {
        break;
      }
      offset += limit;
    }
  } else {
    const rawResult = await callTool(client, toolMap.listTables, {});
    const tablesResult = parseMcpResult(rawResult);
    if (Array.isArray(tablesResult)) {
      tables = tablesResult;
    } else if (tablesResult?.tables) {
      tables = tablesResult.tables;
    }
  }

  // Allow only the specific github tables needed; reject all other github.* tables.
  // Also reject leetcode.* if leetcode is disabled.
  return tables.filter(t => {
    if (typeof t !== "string") return false;
    if (t.startsWith("github.") && !ALLOWED_GITHUB_TABLES.has(t)) return false;
    if (!leetcodeEnabled && t.startsWith("leetcode.")) return false;
    return true;
  });
}

async function fetchTableColumns(client, schema, table) {
  try {
    const rawResult = await callTool(client, "list_columns", { schema, table, limit: 200 });
    const parsed = parseMcpResult(rawResult);
    let columns = [];
    if (Array.isArray(parsed)) {
      columns = parsed;
    } else if (parsed?.columns) {
      columns = parsed.columns;
    } else if (parsed?.items) {
      columns = parsed.items;
    }

    let filtered = columns;
    if (schema === "github" && table === "issues") {
      const allowed = ["title", "html_url", "body", "state", "labels", "number", "owner", "repo"];
      filtered = columns.filter(c => allowed.includes(c.column_name));
    } else if (schema === "github" && table === "commits") {
      // Coral flattens nested JSON with double-underscores per official spec:
      // commit.message        → commit__message
      // commit.author.login   → commit__author__login
      // commit.author.date    → commit__author__date
      // commit.committer.date → commit__committer__date
      const allowed = [
        "sha",
        "commit__message",
        "commit__author__login",
        "commit__author__date",
        "commit__committer__date",
        "html_url",
        "owner",
        "repo"
      ];
      filtered = columns.filter(c => allowed.includes(c.column_name));
    } else if (schema === "github" && table === "user_repos") {
      const allowed = ["name", "full_name", "html_url", "updated_at", "pushed_at", "private"];
      filtered = columns.filter(c => allowed.includes(c.column_name));
    }

    return filtered.map(c => `${c.column_name} (${c.data_type})`);
  } catch (err) {
    console.warn(`[Schema] Failed to fetch columns for ${schema}.${table}:`, err.message);
    return [];
  }
}

export async function buildSchemaContext(client, leetcodeEnabled = true, githubUsername = "") {
  const cachedSchema = getSchemaCache();
  if (cachedSchema && !leetcodeEnabled) {
    // Basic cache invalidation if params change
  } else if (cachedSchema) {
    console.log("[Cache] Schema read from local cache.");
    return cachedSchema;
  }

  console.log("[Schema] Fetching schema from Coral MCP...");
  const tables = await fetchAllTables(client, leetcodeEnabled);

  if (tables.length === 0) {
    return "No tables returned from Coral MCP.";
  }

  const descriptions = [];
  for (const table of tables) {
    if (typeof table !== "string") continue;
    let describeArgs = { table };
    let parts = [null, table];
    if (table.includes(".")) {
      parts = table.split(".");
      describeArgs = { schema: parts[0], table: parts[1] };
    }
    let describeResult = await callTool(client, toolMap.describeTable, describeArgs);
    describeResult = parseMcpResult(describeResult);
    
    console.log(`[Schema] Fetching columns for table ${table}...`);
    const cols = await fetchTableColumns(client, parts[0], parts[1]);
    
    descriptions.push(`Table: ${table}\nDescription: ${JSON.stringify(describeResult, null, 2)}\nColumns: ${cols.join(", ")}`);
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
  const tables = await fetchAllTables(client, leetcodeEnabled);

  const details = [];
  for (const table of tables) {
    if (typeof table !== "string") continue;
    let describeArgs = { table };
    let parts = [null, table];
    if (table.includes(".")) {
      parts = table.split(".");
      describeArgs = { schema: parts[0], table: parts[1] };
    }
    let describeResult = await callTool(client, toolMap.describeTable, describeArgs);
    describeResult = parseMcpResult(describeResult);
    
    const cols = await fetchTableColumns(client, parts[0], parts[1]);
    details.push({ table, description: describeResult, columns: cols });
  }

  const payload = { tables, details };
  setSchemaDetailsCache(payload);
  return payload;
}

export async function generateSql({ question, schema, leetcodeEnabled = true, githubUsername = "" }) {
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
          { role: "system", content: `${getSystemPrompt(leetcodeEnabled, githubUsername)}\n\nSchema:\n${schema}` },
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
  try {
    const result = await callTool(client, toolMap.query, { sql });
    const parsed = parseMcpResult(result);

    // Detect upstream API errors from Coral (e.g. GitHub rate-limit / timeouts).
    // These show up as a string containing "upstream API could not be reached".
    const resultStr = typeof parsed === "string" ? parsed : JSON.stringify(parsed);
    if (resultStr.includes("upstream API could not be reached") || resultStr.includes("rate limit")) {
      console.warn("[Query] Upstream API error detected, attempting retry without failing repos...");

      // Try to identify and remove failing UNION ALL sub-queries
      const retried = await retryWithoutFailingRepos(client, sql, resultStr);
      if (retried !== null) return retried;
    }

    return result;
  } catch (err) {
    console.error("[Query] Error executing query:", err.message);
    throw err;
  }
}

// When a UNION ALL query fails because one repo's API is unreachable,
// parse the failing repo from the error, remove that sub-query, and retry.
async function retryWithoutFailingRepos(client, sql, errorStr) {
  // Extract the failing repo path: e.g. /repos/cncf/landscape/issues
  const repoMatch = errorStr.match(/\/repos\/([^/]+)\/([^/]+)\/issues/);
  if (!repoMatch) return null;

  const failOwner = repoMatch[1];
  const failRepo = repoMatch[2];
  console.log(`[Query] Removing failing repo ${failOwner}/${failRepo} and retrying...`);

  // Remove the UNION ALL block that references the failing owner+repo.
  // Match: optional leading "UNION ALL\n" + SELECT ... WHERE owner = 'X' AND repo = 'Y' ...
  // up to the next UNION ALL or closing paren.
  const escapedOwner = failOwner.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedRepo = failRepo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `\\s*(?:UNION\\s+ALL\\s+)?SELECT[^)]*?owner\\s*=\\s*'${escapedOwner}'\\s+AND\\s+repo\\s*=\\s*'${escapedRepo}'[^)]*?(?=UNION\\s+ALL|\\)|LIMIT|ORDER|$)`,
    'i'
  );

  let newSql = sql.replace(pattern, '');
  // Clean up any leading UNION ALL that might remain after removal
  newSql = newSql.replace(/(\(\s*)UNION\s+ALL\s+/i, '$1');
  newSql = newSql.replace(/UNION\s+ALL\s*\)/i, ')');

  if (newSql === sql) {
    console.warn("[Query] Could not surgically remove the failing sub-query.");
    return null;
  }

  try {
    console.log(`[Query] Retrying SQL without ${failOwner}/${failRepo}`);
    return await callTool(client, toolMap.query, { sql: newSql });
  } catch (retryErr) {
    console.error("[Query] Retry also failed:", retryErr.message);
    return null;
  }
}

export function extractSql(content) {
  const fenced = content.match(/```sql\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  return content.trim();
}

// Extract html_url values from raw query results so we can inject them
// directly into the insights prompt. This guarantees the LLM has the
// exact URLs and cannot hallucinate them.
function extractIssueUrls(result) {
  const urls = [];
  try {
    let rows = [];
    const input = typeof result === "string" ? JSON.parse(result) : result;

    // Coral MCP returns: [{type:"text", text:"JSON_STRING"}]
    // callTool strips the outer wrapper so we get the content array.
    if (Array.isArray(input) && input.length > 0 && input[0]?.text) {
      // This is Coral's format — parse the inner JSON text
      try {
        const inner = JSON.parse(input[0].text);
        rows = Array.isArray(inner) ? inner : [];
      } catch {
        rows = [];
      }
    } else if (Array.isArray(input)) {
      // Already an array of row objects
      rows = input;
    } else if (input?.content?.[0]?.text) {
      // Full MCP response with content wrapper still present
      try {
        const inner = JSON.parse(input.content[0].text);
        rows = Array.isArray(inner) ? inner : [];
      } catch {
        rows = [];
      }
    } else if (Array.isArray(input?.rows)) {
      rows = input.rows;
    }

    if (!Array.isArray(rows)) rows = [];

    // Deduplicate by URL
    const seen = new Set();
    for (const row of rows) {
      const url = row?.html_url || row?.issue_url;
      if (url && typeof url === "string" && url.startsWith("http") && !seen.has(url)) {
        seen.add(url);
        urls.push({
          title: row.title || row.issue_title || "Issue",
          url,
          owner: row.owner || "",
          repo: row.repo || ""
        });
      }
    }
  } catch (e) {
    console.warn("[extractIssueUrls] Failed to parse result:", e.message);
  }
  return urls;
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

  // Pre-extract issue URLs from raw results so we can explicitly feed them to the LLM
  const issueUrls = extractIssueUrls(result);
  const urlBlock = issueUrls.length > 0
    ? `\n\nEXACT ISSUE URLS EXTRACTED FROM RESULTS (you MUST use these verbatim):\n${issueUrls.map((u, i) => `${i + 1}. [${u.title}](${u.url})`).join("\n")}`
    : "\n\nNo issue URLs were found in the query results.";

  const prompt = `You are a helpful assistant analyzing open-source issues and GitHub activity.
The user asked: "${question}"

I queried the database with this SQL:
${sql}

And got these results:
${JSON.stringify(result, null, 2)}
${urlBlock}

Task: Write a professional, friendly markdown response.
1. Start with a **Match Score: X%** based on how well the results match the user's question.
2. Write a brief **Proposal Pitch** (2-3 sentences) the user can use for GSoC or open source.
3. CRITICAL — You MUST include a "### Matching Issues" section listing ALL the issue links from the EXACT ISSUE URLS section above. Copy each URL EXACTLY as-is into a markdown link. Do NOT shorten, modify, or hallucinate any URLs.
4. If no issue URLs were found, clearly state that no matching issues were found and do NOT fabricate any links.

Output ONLY the final markdown response. No raw JSON.`;

  for (const provider of providers) {
    try {
      console.log(`[Agent] Generating insights using ${provider.name}...`);
      const openai = new OpenAI({
        apiKey: provider.apiKey,
        ...(provider.baseURL ? { baseURL: provider.baseURL } : {})
      });

      const response = await openai.chat.completions.create({
        model: provider.model,
        temperature: 0.4,
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
