import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import os from "os";
import { execFileSync } from "child_process";
import { buildSchemaContext, connectCoral, generateSql, runQuery, getSchemaDetails, generateInsights } from "./mcpAgent.js";
import { clearCache } from "./cache.js";

const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 3001;

let coralClient = null;
let activeConfig = {
  githubToken: process.env.GITHUB_TOKEN || "",
  leetcodeUsername: process.env.LEETCODE_USERNAME || ""
};

function resolveCoralPaths() {
  const configDir = process.env.CORAL_CONFIG_DIR || path.join(os.homedir(), ".config", "coral");
  const dataDir = process.env.CORAL_DATA_DIR || path.join(os.homedir(), ".local", "share", "coral");
  return { configDir, dataDir };
}

function findLeetcodeYaml() {
  const candidates = [
    process.env.LEETCODE_YAML_PATH,
    path.resolve(process.cwd(), "sources", "leetcode.yaml"),
    path.resolve(process.cwd(), "..", "sources", "leetcode.yaml"),
    "/app/sources/leetcode.yaml"
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function writeCoralConfig({ githubToken, leetcodeUsername }) {
  const { configDir, dataDir } = resolveCoralPaths();
  fs.mkdirSync(path.join(configDir, "workspaces", "default", "sources"), { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });

  const username = leetcodeUsername || process.env.LEETCODE_USERNAME || "";
  const configToml = `version = 1

[workspaces.default.sources.github]
variables = { GITHUB_API_BASE = "https://api.github.com" }
secrets = ["GITHUB_TOKEN"]
origin = "bundled"

[workspaces.default.sources.leetcode]
version = "0.1.0"
variables = { LEETCODE_USERNAME = "${username || ""}" }
secrets = []
origin = "imported"
`;

  fs.writeFileSync(path.join(configDir, "config.toml"), configToml, "utf8");

  if (githubToken) {
    process.env.GITHUB_TOKEN = githubToken;
  }
  if (username) {
    process.env.LEETCODE_USERNAME = username;
  }
}

function registerLeetcodeSource() {
  const yamlPath = findLeetcodeYaml();
  if (!yamlPath) {
    throw new Error("leetcode.yaml not found in container. Ensure /sources/leetcode.yaml is copied into the build context.");
  }

  if (process.platform === "win32") {
    console.warn("Skipping coral source add on Windows. Configure sources in WSL or container runtime.");
    return;
  }

  execFileSync("coral", ["source", "add", "--file", yamlPath], {
    stdio: "inherit",
    env: process.env
  });
}

function updateCoralConfig({ githubToken, leetcodeUsername }) {
  const nextConfig = {
    githubToken: githubToken && githubToken.trim() !== "" ? githubToken.trim() : activeConfig.githubToken,
    leetcodeUsername: leetcodeUsername && leetcodeUsername.trim() !== "" ? leetcodeUsername.trim() : activeConfig.leetcodeUsername
  };

  const changed =
    nextConfig.githubToken !== activeConfig.githubToken ||
    nextConfig.leetcodeUsername !== activeConfig.leetcodeUsername;

  if (!changed) {
    return;
  }

  writeCoralConfig(nextConfig);
  if (nextConfig.leetcodeUsername) {
    try {
      registerLeetcodeSource();
    } catch (err) {
      console.warn("Failed to register LeetCode source dynamically:", err.message);
    }
  }
  activeConfig = nextConfig;
  coralClient = null;
}

function extractConfigFromRequest(req) {
  const githubToken = req.body?.githubToken || req.headers["x-github-token"];
  const leetcodeUsername = req.body?.leetcodeUsername || req.headers["x-leetcode-username"];

  return {
    githubToken: githubToken ? String(githubToken).trim() : "",
    leetcodeUsername: leetcodeUsername ? String(leetcodeUsername).trim() : ""
  };
}

// Initialize Coral connection
async function initCoral() {
  if (!coralClient) {
    console.log("Starting Coral MCP via STDIO...");
    try {
      coralClient = await connectCoral();
    } catch (err) {
      console.error("Failed to connect to Coral MCP:", err.message);
      throw new Error("Could not start Coral MCP. Ensure Coral is installed in WSL.");
    }
  }
  return coralClient;
}

app.get("/", (req, res) => {
  res.send(`
    <html>
      <body style="font-family: system-ui, sans-serif; padding: 2rem; color: #333; background: #0f0d1a; color: #e0dfe4;">
        <h2> GSoC Matchmaker Agent API</h2>
        <p>Available endpoints:</p>
        <ul>
          <li>POST <code>/api/chat</code> — Ask the matchmaker a question</li>
          <li>GET <code>/api/schema</code> — Inspect the full Coral schema</li>
          <li>GET <code>/api/matches</code> — Quick skill → issue match</li>
          <li>POST <code>/api/cache/clear</code> — Clear local caches</li>
        </ul>
      </body>
    </html>
  `);
});

// ── Schema inspection endpoint ───────────────────────────────────
app.get("/api/schema", async (req, res) => {
  try {
    const { githubToken, leetcodeUsername } = extractConfigFromRequest(req);
    if (githubToken || leetcodeUsername) {
      updateCoralConfig({ githubToken, leetcodeUsername });
    }
    const leetcodeEnabled = req.query.leetcodeEnabled === 'true' || req.query.leetcodeEnabled === undefined;
    const client = await initCoral();
    const details = await getSchemaDetails(client, leetcodeEnabled);
    res.json(details);
  } catch (error) {
    console.error("Error in /api/schema:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

app.post("/api/schema", async (req, res) => {
  try {
    const { githubToken, leetcodeUsername } = extractConfigFromRequest(req);
    if (githubToken || leetcodeUsername) {
      updateCoralConfig({ githubToken, leetcodeUsername });
    }
    const leetcodeEnabled = req.body?.leetcodeEnabled === false ? false : true;
    const client = await initCoral();
    const details = await getSchemaDetails(client, leetcodeEnabled);
    res.json(details);
  } catch (error) {
    console.error("Error in /api/schema:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

app.post("/api/config", async (req, res) => {
  try {
    const { githubToken, leetcodeUsername } = extractConfigFromRequest(req);
    if (!githubToken) {
      return res.status(400).json({ error: "GitHub token is required." });
    }

    updateCoralConfig({ githubToken, leetcodeUsername });
    res.json({ ok: true });
  } catch (error) {
    console.error("Error in /api/config:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// ── Cache clear endpoint ─────────────────────────────────────────
app.post("/api/cache/clear", (req, res) => {
  clearCache();
  res.json({ ok: true, message: "Cache cleared." });
});

// ── Chat endpoint (LLM-powered SQL generation + execution) ──────
app.post("/api/chat", async (req, res) => {
  try {
    const { question, leetcodeEnabled = true, responseFormat = 'text' } = req.body;
    const { githubToken, leetcodeUsername } = extractConfigFromRequest(req);
    if (githubToken || leetcodeUsername) {
      updateCoralConfig({ githubToken, leetcodeUsername });
    }
    if (!question) {
      return res.status(400).json({ error: "Question is required." });
    }

    const client = await initCoral();
    const schema = await buildSchemaContext(client, leetcodeEnabled);
    const sql = await generateSql({ question, schema, leetcodeEnabled });

    if (!sql) {
      return res.status(500).json({ error: "Failed to generate SQL." });
    }

    const result = await runQuery(client, sql);

    let textResponse = null;
    if (responseFormat === 'text') {
      textResponse = await generateInsights({ question, sql, result });
    }

    res.json({ sql, result, textResponse });
  } catch (error) {
    console.error("Error in /api/chat:", error);

    let errorMessage = error.message || "Internal server error";
    if (error?.message?.includes("ECONNREFUSED") || error?.event?.message?.includes("ECONNREFUSED")) {
      errorMessage = "Could not connect to Coral MCP. Make sure the Coral server is running in WSL.";
    }

    res.status(500).json({ error: errorMessage });
  }
});

// ── Quick match endpoint (hardcoded cross-source join) ───────────
app.get("/api/matches", async (req, res) => {
  try {
    const client = await initCoral();

    const sql = `
      SELECT
          skills.tag_name            AS your_skill,
          skills.problems_solved     AS solved_count,
          issues.title               AS issue_title,
          issues.html_url            AS issue_url
      FROM
          leetcode.fundamental_skills skills
      JOIN
          github.issues issues
      ON
          LOWER(issues.title) LIKE CONCAT('%', LOWER(skills.tag_name), '%')
      WHERE
          issues.owner = 'asyncapi'
          AND issues.repo = 'website'
          AND issues.state = 'open'
          AND skills.problems_solved > 3
      ORDER BY
          skills.problems_solved DESC
      LIMIT 8
    `;

    const result = await runQuery(client, sql);
    res.json(result);
  } catch (error) {
    console.error("Error in /api/matches:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// ── Diag endpoint ─────────────────────────────────────────────────
app.get("/api/diag", async (req, res) => {
  try {
    const client = await initCoral();
    const queryResult = await runQuery(client, "SELECT DISTINCT schema_name FROM coral.tables");
    const { configDir } = resolveCoralPaths();
    const configPath = path.join(configDir, "config.toml");
    let configContents = "";
    if (fs.existsSync(configPath)) {
      configContents = fs.readFileSync(configPath, "utf8");
    }

    res.json({
      process: {
        platform: process.platform,
        env: {
          GITHUB_TOKEN_exists: !!process.env.GITHUB_TOKEN,
          GITHUB_TOKEN_length: process.env.GITHUB_TOKEN ? process.env.GITHUB_TOKEN.length : 0,
          GITHUB_TOKEN_prefix: process.env.GITHUB_TOKEN ? process.env.GITHUB_TOKEN.substring(0, 4) : "",
          LEETCODE_USERNAME: process.env.LEETCODE_USERNAME || "",
          CORAL_CONFIG_DIR: process.env.CORAL_CONFIG_DIR || "",
          CORAL_DATA_DIR: process.env.CORAL_DATA_DIR || ""
        }
      },
      activeConfig: {
        githubToken_exists: !!activeConfig.githubToken,
        githubToken_length: activeConfig.githubToken ? activeConfig.githubToken.length : 0,
        leetcodeUsername: activeConfig.leetcodeUsername
      },
      configToml: configContents,
      schemas: queryResult
    });
  } catch (error) {
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

app.listen(port, () => {
  console.log(`GSoC Matchmaker API running on http://localhost:${port}`);
  console.log("API Server is ready.");
});

// Prevent Node.js from exiting prematurely on certain environments
setInterval(() => {}, 1000 * 60 * 60);