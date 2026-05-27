import "dotenv/config";
import express from "express";
import cors from "cors";
import { buildSchemaContext, connectCoral, generateSql, runQuery, getSchemaDetails, generateInsights } from "./mcpAgent.js";
import { clearCache } from "./cache.js";

const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 3001;

let coralClient = null;

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
    const leetcodeEnabled = req.query.leetcodeEnabled === 'true' || req.query.leetcodeEnabled === undefined;
    const client = await initCoral();
    const details = await getSchemaDetails(client, leetcodeEnabled);
    res.json(details);
  } catch (error) {
    console.error("Error in /api/schema:", error);
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

app.listen(port, () => {
  console.log(`GSoC Matchmaker API running on http://localhost:${port}`);
  console.log("API Server is ready.");
});

// Prevent Node.js from exiting prematurely on certain environments
setInterval(() => {}, 1000 * 60 * 60);