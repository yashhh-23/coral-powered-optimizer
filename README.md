#  GSoC & Open-Source Matchmaker Agent

> **Built for the [Pirates of the Coral-bean Hackathon](https://www.wemakedevs.org/hackathons/coral) | Track 2: Personal Agent**

Transitioning from competitive programming (LeetCode, CodeChef) to open-source contribution can feel like jumping into uncharted waters. Many developers have elite problem-solving skills but struggle to find relevant codebases to apply them.

The **GSoC & Open-Source Matchmaker Agent** acts as a personalized technical recruiter. Powered by **Coral** and an LLM reasoning engine, it maps your algorithmic strengths directly to active "good first issues" across targeted Google Summer of Code (GSoC) organizations.

---

## ✨ Core Features

* **Algorithmic Skill Mapping:** Inspects your accepted competitive programming submission tags (e.g., Dynamic Programming, Graphs, Tries) via a custom LeetCode Coral source spec.
* **Cross-Source SQL Matchmaking:** Executes federated SQL `JOIN` queries across LeetCode skill profiles and GitHub issues simultaneously.
* **Resilient LLM Execution:** Dual-model architecture — **Gemini 2.5 Flash** (primary) with automatic failover to **Groq Llama 3.3 70B** (fallback).
* **Schema Learning & Caching:** Dynamically discovers database schemas via MCP and caches them locally for fast repeated queries.
* **Interactive Recruiter Dashboard:** A dark-mode Next.js UI with chat interface and live Schema Explorer.
* **Custom Source Spec:** Hand-built Coral YAML spec wrapping LeetCode's public GraphQL API into SQL-queryable tables.

---

## 🛠️ Tech Stack & Architecture

| Layer | Technology |
|---|---|
| **Data Layer** | [Coral](https://github.com/withcoral/coral) (WSL Ubuntu) |
| **Reasoning Engine** | Gemini 2.5 Flash (Primary) + Groq Llama 3.3 70B (Fallback) |
| **Agent Transport** | Model Context Protocol (MCP) over STDIO |
| **Frontend** | Next.js + TailwindCSS v4 |
| **Deployment** | Vercel (Frontend) + Ngrok (Agent tunnel) |
| **Data Sources** | GitHub (Native Coral) + LeetCode (Custom Source Spec) |

---

## ⚓ Coral Features Used

| Feature | How It's Used |
|---|---|
| **SQL Interface** | `coral sql` for direct queries against GitHub and LeetCode |
| **Cross-Source Joins** | `JOIN leetcode.fundamental_skills ON github.issues` |
| **Schema Learning** | `list_tables` + `describe_table` via MCP to auto-discover schemas |
| **Query Caching** | Local `.cache/` folder stores learned schemas and generated SQL |
| **MCP Integration** | Agent connects via `coral mcp-stdio` over STDIO transport |
| **Custom Source Spec** | `sources/leetcode.yaml` wraps LeetCode GraphQL as SQL tables |
| **Rate Limiting** | Source spec configures 403 retry for LeetCode's Cloudflare protection |
| **JSON Column Functions** | `json_get_str()` for parsing nested API responses |
| **Source Test Queries** | `coral source test leetcode` validates connectivity |
| **Filters** | GitHub issues filtered by `owner`, `repo`, `state` at API level |

---

## ⚓ The Magic: Cross-Source SQL Joins

Instead of context-stuffing an LLM with massive JSON payloads from multiple APIs, the agent offloads data synchronization to Coral. Here is the exact query the agent uses to match repository issues to your highest-performing DSA concepts:

```sql
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
LIMIT 8;
```

---

## 📦 Project Structure

```
coral-powered-optimizer/
├── agent/                     # Node.js agent (MCP + LLM)
│   ├── src/
│   │   ├── mcpAgent.js        # Core: schema learning, SQL gen, fallback
│   │   ├── server.js          # Express API for frontend
│   │   ├── cli.js             # CLI entry point
│   │   └── cache.js           # Schema + query caching layer
│   ├── .env                   # API keys (gitignored)
│   └── package.json
├── frontend/                  # Next.js recruiter dashboard
│   └── src/app/
│       ├── page.tsx           # Main dashboard UI
│       ├── layout.tsx         # App shell + metadata
│       └── globals.css        # Dark theme + glassmorphism
├── sources/
│   └── leetcode.yaml          # Custom Coral source spec (LeetCode GraphQL)
├── phase2_sandbox.sql         # Standalone matchmaking SQL queries
├── run_query.sh               # Quick runner for sandbox SQL
├── .env                       # Root credentials reference
└── README.md
```

---

## 💻 Local Installation & Setup

### Prerequisites

- Windows Subsystem for Linux (WSL) running Ubuntu
- Node.js 18+ and npm
- Coral CLI installed in WSL

### 1. Install Coral in WSL

```bash
curl -fsSL https://withcoral.com/install.sh | sh
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

### 2. Connect Data Sources

```bash
# GitHub (native Coral source — requires a GitHub PAT)
coral source add --interactive github

# LeetCode (custom source spec)
coral source add --file ./sources/leetcode.yaml
```

### 3. Test Sources

```bash
coral source test github
coral source test leetcode
```

### 4. Set Up the Agent

```bash
cd agent
npm install
cp .env.example .env
# Edit .env with your GEMINI_API_KEY and GROQ_API_KEY
```

### 5. Set Up the Frontend

```bash
cd frontend
npm install
```

---

## 🚀 Running

### Agent API (Terminal 1)

```bash
cd agent
npm start
# Runs on http://localhost:3001
```

### Frontend (Terminal 2)

```bash
cd frontend
npm run dev
# Runs on http://localhost:3000
```

### CLI Mode (Alternative)

```bash
cd agent
node src/cli.js "Find issues matching my graph algorithm skills"
```

### Clear Cache

```bash
cd agent
npm run clear-cache
```

---

## 🌐 Deployment

### Frontend → Vercel

```bash
cd frontend
npx vercel --name open-source-matchmaker
```

Set the environment variable on Vercel:
- `NEXT_PUBLIC_AGENT_URL` → your ngrok forwarding URL (e.g., `https://abc123.ngrok-free.app`)

### Agent → Ngrok Tunnel

```bash
ngrok http 3001
```

Copy the forwarding URL and set it as `NEXT_PUBLIC_AGENT_URL` in Vercel project settings.

---

## 📝 Notes

- The LeetCode GraphQL API is public but unofficial. Rate limits apply.
- Caching creates a local `.cache/` folder storing learned database schemas and generated SQL.
- The system prompt in `agent/src/mcpAgent.js` is tuned for matchmaking queries.
- If Coral uses a different MCP endpoint, update `agent/src/mcpAgent.js`.