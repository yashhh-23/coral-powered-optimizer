import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { execFileSync, execSync } from "child_process";
import { buildSchemaContext, connectCoral, generateSql, runQuery, getSchemaDetails, generateInsights } from "./mcpAgent.js";
import { clearCache } from "./cache.js";

const app = express();
const port = process.env.PORT || 3001;
const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
const backendUrl = process.env.BACKEND_URL || `http://localhost:${port}`;
const githubClientId = process.env.GITHUB_CLIENT_ID || "";
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET || "";
const githubRedirectUri = process.env.GITHUB_OAUTH_REDIRECT_URI || `${backendUrl}/auth/github/callback`;

const pendingGithubStates = new Map();

// FIX: Cache of resolved GitHub usernames keyed by token to avoid repeated API calls
const githubUsernameCache = new Map();

app.use(
  cors({
    origin: frontendUrl,
    credentials: true
  })
);
app.use(express.json());

let coralClient = null;
let activeConfig = {
  githubToken: process.env.GITHUB_TOKEN || "",
  leetcodeUsername: process.env.LEETCODE_USERNAME || ""
};

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  return header.split(";").reduce((acc, part) => {
    const [rawKey, ...rest] = part.trim().split("=");
    const key = decodeURIComponent(rawKey);
    const value = decodeURIComponent(rest.join("="));
    acc[key] = value;
    return acc;
  }, {});
}

function getCookieOptions() {
  const isLocalhost = frontendUrl.includes("localhost");
  return {
    httpOnly: true,
    sameSite: isLocalhost ? "Lax" : "None",
    secure: !isLocalhost,
    path: "/"
  };
}

function setCookie(res, name, value, options = {}) {
  const opts = { ...getCookieOptions(), ...options };
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  if (opts.path) parts.push(`Path=${opts.path}`);
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
  res.setHeader("Set-Cookie", parts.join("; "));
}

function safeReturnUrl(returnUrl) {
  if (!returnUrl) return frontendUrl;
  if (returnUrl.startsWith(frontendUrl)) return returnUrl;
  return frontendUrl;
}

function resolveCoralPaths() {
  const configDir = process.env.CORAL_CONFIG_DIR || path.join(os.homedir(), ".config", "coral");
  const dataDir = process.env.CORAL_DATA_DIR || path.join(os.homedir(), ".local", "share", "coral");
  return { configDir, dataDir };
}

function syncFileToWsl(windowsFilePath, wslDestPath) {
  if (process.platform !== "win32") return;
  try {
    const wslSrcPath = execFileSync("wsl", ["wslpath", windowsFilePath.replace(/\\/g, "/")]).toString().trim();
    execFileSync("wsl", [
      "-e", "bash", "-l", "-c",
      `mkdir -p "$(dirname "${wslDestPath}")" && cp "${wslSrcPath}" "${wslDestPath}"`
    ]);
    console.log(`[WSL Sync] Synced ${windowsFilePath} -> ${wslDestPath}`);
  } catch (err) {
    console.error(`[WSL Sync Failed] for ${windowsFilePath}:`, err.message);
  }
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

function writeDotEnv(token, username) {
  const envLines = [];
  const gToken = token || process.env.GITHUB_TOKEN || "";
  const lUser = username || process.env.LEETCODE_USERNAME || "";

  if (gToken) {
    envLines.push(`GITHUB_TOKEN=${gToken}`);
  }
  if (lUser) {
    envLines.push(`LEETCODE_USERNAME=${lUser}`);
  }

  if (envLines.length > 0) {
    const envContent = envLines.join("\n") + "\n";
    try {
      fs.writeFileSync(path.resolve(process.cwd(), ".env"), envContent, "utf8");
    } catch (e) {
      console.warn("Failed to write .env to CWD:", e.message);
    }
    try {
      const { configDir } = resolveCoralPaths();
      const dotEnvPath = path.join(configDir, ".env");
      fs.writeFileSync(dotEnvPath, envContent, "utf8");
      syncFileToWsl(dotEnvPath, "~/.config/coral/.env");
    } catch (e) {
      console.warn("Failed to write .env to CORAL_CONFIG_DIR:", e.message);
    }
  }
}

function writeCoralSecrets(githubToken) {
  try {
    const { configDir } = resolveCoralPaths();
    const token = githubToken || process.env.GITHUB_TOKEN || "";
    if (token) {
      const githubSourceDir = path.join(configDir, "workspaces", "default", "sources", "github");
      fs.mkdirSync(githubSourceDir, { recursive: true });
      const secretsPath = path.join(githubSourceDir, "secrets.env");
      fs.writeFileSync(secretsPath, `GITHUB_TOKEN=${token}\n`, "utf8");
      console.log("Successfully wrote Coral GITHUB_TOKEN to workspaces/default/sources/github/secrets.env");
      syncFileToWsl(secretsPath, "~/.config/coral/workspaces/default/sources/github/secrets.env");
    }
  } catch (e) {
    console.error("Failed to write Coral secrets:", e.message);
  }
}

// Call on startup
writeDotEnv(process.env.GITHUB_TOKEN, process.env.LEETCODE_USERNAME);
writeCoralSecrets(process.env.GITHUB_TOKEN);
try {
  const { configDir } = resolveCoralPaths();
  const configPath = path.join(configDir, "config.toml");
  if (fs.existsSync(configPath)) {
    syncFileToWsl(configPath, "~/.config/coral/config.toml");
  } else {
    writeCoralConfig({ githubToken: process.env.GITHUB_TOKEN, leetcodeUsername: process.env.LEETCODE_USERNAME });
  }
} catch (e) {
  console.warn("Failed to sync config on startup:", e.message);
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

  const configPath = path.join(configDir, "config.toml");
  fs.writeFileSync(configPath, configToml, "utf8");
  syncFileToWsl(configPath, "~/.config/coral/config.toml");

  if (githubToken) {
    process.env.GITHUB_TOKEN = githubToken;
  }
  if (username) {
    process.env.LEETCODE_USERNAME = username;
  }
  writeDotEnv(githubToken, username);
  writeCoralSecrets(githubToken);
}

function registerLeetcodeSource() {
  const yamlPath = findLeetcodeYaml();
  if (!yamlPath) {
    throw new Error("leetcode.yaml not found in container. Ensure /sources/leetcode.yaml is copied into the build context.");
  }

  if (process.platform === "win32") {
    try {
      const wslYamlPath = execFileSync("wsl", ["wslpath", yamlPath.replace(/\\/g, "/")]).toString().trim();
      execFileSync("wsl", ["-e", "bash", "-l", "-c", `coral source add --file "${wslYamlPath}"`], { stdio: "inherit" });
      console.log("[WSL] Successfully registered LeetCode source inside WSL");
    } catch (err) {
      console.warn("Failed to register LeetCode source inside WSL:", err.message);
    }
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
  const cookies = parseCookies(req);
  const githubToken = req.body?.githubToken || req.headers["x-github-token"] || cookies.gh_token;
  const leetcodeUsername = req.body?.leetcodeUsername || req.headers["x-leetcode-username"];

  return {
    githubToken: githubToken ? String(githubToken).trim() : "",
    leetcodeUsername: leetcodeUsername ? String(leetcodeUsername).trim() : ""
  };
}

async function exchangeGithubCode(code) {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      client_id: githubClientId,
      client_secret: githubClientSecret,
      code,
      redirect_uri: githubRedirectUri
    })
  });

  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(data.error_description || data.error || "GitHub OAuth failed");
  }
  return data.access_token;
}

// FIX: Resolve the GitHub login (username) for a given personal access token.
// This replaces the hardcoded 'your_username' placeholder that caused empty results.
async function resolveGithubUsername(token) {
  if (!token) return "";
  if (githubUsernameCache.has(token)) return githubUsernameCache.get(token);
  try {
    const resp = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json"
      }
    });
    if (!resp.ok) return "";
    const data = await resp.json();
    const login = data.login || "";
    if (login) githubUsernameCache.set(token, login);
    return login;
  } catch (e) {
    console.warn("[GitHub] Failed to resolve username:", e.message);
    return "";
  }
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

app.get("/auth/github", (req, res) => {
  if (!githubClientId || !githubClientSecret) {
    return res.status(500).send("GitHub OAuth credentials are missing. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.");
  }

  const state = crypto.randomBytes(16).toString("hex");
  const returnUrl = safeReturnUrl(req.query.return);
  pendingGithubStates.set(state, { returnUrl, createdAt: Date.now() });

  const params = new URLSearchParams({
    client_id: githubClientId,
    redirect_uri: githubRedirectUri,
    state,
    scope: "repo read:org"
  });

  res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
});

app.get("/auth/github/callback", async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code || !state) {
      return res.redirect(`${frontendUrl}?auth=error`);
    }

    const record = pendingGithubStates.get(String(state));
    if (!record) {
      return res.redirect(`${frontendUrl}?auth=error`);
    }

    pendingGithubStates.delete(String(state));
    const token = await exchangeGithubCode(String(code));
    setCookie(res, "gh_token", token);
    updateCoralConfig({ githubToken: token, leetcodeUsername: activeConfig.leetcodeUsername });

    // FIX: Pre-warm the username cache as soon as OAuth succeeds
    resolveGithubUsername(token).catch(() => {});

    res.redirect(`${record.returnUrl}?auth=success`);
  } catch (error) {
    console.error("GitHub OAuth callback failed:", error.message);
    res.redirect(`${frontendUrl}?auth=error`);
  }
});

app.get("/api/auth/status", (req, res) => {
  const cookies = parseCookies(req);
  res.json({ connected: Boolean(cookies.gh_token) });
});

app.post("/api/auth/logout", (req, res) => {
  setCookie(res, "gh_token", "", { maxAge: 0 });
  res.json({ ok: true });
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

    // FIX: Resolve the real GitHub username from the token so the LLM
    // can substitute it into queries on github.commits instead of using
    // the broken 'your_username' placeholder.
    const githubUsername = await resolveGithubUsername(githubToken || activeConfig.githubToken);

    const client = await initCoral();
    const schema = await buildSchemaContext(client, leetcodeEnabled, githubUsername);
    const sql = await generateSql({ question, schema, leetcodeEnabled, githubUsername });

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
      schemas: queryResult,
      coralInfoGithub: (() => {
        try {
          if (process.platform === "win32") return "Skipped on windows";
          return execSync("coral info github", { encoding: "utf8", env: process.env });
        } catch (err) {
          return err.message;
        }
      })(),
      coralSourceList: (() => {
        try {
          if (process.platform === "win32") return "Skipped on windows";
          return execSync("coral source list", { encoding: "utf8", env: process.env });
        } catch (err) {
          return err.message;
        }
      })(),
      envOutput: (() => {
        try {
          if (process.platform === "win32") return "Skipped on windows";
          return execSync("env", { encoding: "utf8", env: process.env });
        } catch (err) {
          return err.message;
        }
      })(),
      coralSourceTestGithub: (() => {
        try {
          if (process.platform === "win32") return "Skipped on windows";
          const stdout = execSync("coral source test github", { encoding: "utf8", env: process.env });
          return { ok: true, stdout };
        } catch (err) {
          return { ok: false, message: err.message, stdout: err.stdout?.toString(), stderr: err.stderr?.toString() };
        }
      })()
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
