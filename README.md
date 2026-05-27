# GSoC & Open-Source Matchmaker Agent

> **Built for the [Pirates of the Coral-bean Hackathon](https://www.wemakedevs.org/hackathons/coral) | Track 2: Personal Agent**

Transitioning from competitive programming to open-source contribution can be challenging. Many students and developers have strong problem-solving skills but struggle to find relevant codebases to apply them.

The **GSoC & Open-Source Matchmaker Agent** is a tool designed to map your algorithmic skills directly to active issues across targeted Google Summer of Code (GSoC) organizations.

---

## Core Features

* **Algorithmic Skill Mapping:** Queries your competitive programming submission tags (e.g., Dynamic Programming, Graphs) via a custom LeetCode Coral source specification.
* **Cross-Source SQL Matchmaking:** Executes federated SQL `JOIN` queries across LeetCode skill profiles and GitHub issues simultaneously.
* **Model Context Protocol (MCP):** Dynamically discovers database schemas via Coral's MCP integration.
* **Interactive Dashboard:** A Next.js UI with a chat interface and a live Schema Explorer for viewing query logic and results.

---

## APIs and External Services Used

For transparency, this project relies on the following external APIs and open-source repositories:

1. **Coral MCP (Local Execution):** Uses the [Coral](https://github.com/withcoral/coral) CLI to run federated queries across multiple data sources.
2. **GitHub REST API:** Accessed via Coral's native GitHub source integration to query repositories, open issues, and labels.
3. **LeetCode GraphQL API:** Accessed via a custom Coral spec (`sources/leetcode.yaml`) to retrieve the user's skill statistics and solved problems.
4. **Large Language Models (LLMs):**
   * **Primary:** Gemini API (`gemini-2.5-flash`) for SQL generation and response formatting.
   * **Fallbacks:** Groq API (`llama-3.3-70b-versatile`) and OpenAI API (`gpt-4o-mini`).
   * *Note: Data (such as your queried skills and schema metadata) is sent to these LLMs to generate the matchmaking logic and output.*

---

## Tech Stack & Architecture

| Layer | Technology |
|---|---|
| **Data Layer** | Coral (WSL Ubuntu) |
| **Reasoning Engine** | Gemini 2.5 Flash / Groq Llama 3.3 |
| **Agent Transport** | Model Context Protocol (MCP) over STDIO |
| **Frontend** | Next.js + TailwindCSS |
| **Deployment** | Vercel (Frontend) + Ngrok (Agent tunnel) |

---

## Database Queries

The agent generates SQL to match repository issues to your highest-performing Data Structures and Algorithms (DSA) concepts. A typical federated query looks like this:

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

## Project Structure

```
coral-powered-optimizer/
├── agent/                     # Node.js agent (MCP + LLM)
│   ├── src/
│   │   ├── mcpAgent.js        # Core: schema learning, SQL gen, fallback
│   │   ├── server.js          # Express API for frontend
│   │   ├── cli.js             # CLI entry point
│   │   └── cache.js           # Schema + query caching layer
│   ├── .env                   # API keys
│   └── package.json
├── frontend/                  # Next.js dashboard
│   └── src/app/
│       ├── page.tsx           # Main dashboard UI
│       ├── layout.tsx         # App shell
│       └── globals.css        # Styles
├── sources/
│   └── leetcode.yaml          # Custom Coral source spec (LeetCode GraphQL)
└── README.md
```

---

## Local Installation & Setup

### Prerequisites

- Windows Subsystem for Linux (WSL) running Ubuntu (required for Coral)
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
# GitHub (native Coral source — requires a GitHub Personal Access Token)
coral source add --interactive github

# LeetCode (custom source spec)
coral source add --file ./sources/leetcode.yaml
```

### 3. Set Up the Agent

```bash
cd agent
npm install
cp .env.example .env
# Edit .env with your GEMINI_API_KEY and GROQ_API_KEY
```

### 4. Set Up the Frontend

```bash
cd frontend
npm install
```

---

## Running the Application

### Start the Agent API (Terminal 1)

```bash
cd agent
npm start
# Runs on http://localhost:3001
```

### Start the Frontend (Terminal 2)

```bash
cd frontend
npm run dev
# Runs on http://localhost:3000
```

### Clear Cache

The agent caches schemas and generated queries in a local `.cache` folder. To clear this cache:
```bash
cd agent
npm run clear-cache
```

---

## Deployment

### Frontend (Vercel)

```bash
cd frontend
npx vercel --name open-source-matchmaker
```

Set the environment variable on Vercel:
- `NEXT_PUBLIC_AGENT_URL` → your backend URL

### Agent Backend

Use ngrok or a similar tool to tunnel the local port:
```bash
ngrok http 3001
```
Copy the forwarding URL and set it as `NEXT_PUBLIC_AGENT_URL` in your Vercel project settings.

---

## Notes

- The LeetCode GraphQL API is public but unofficial. Rate limits or Cloudflare blocks may apply.
- The system prompt in `agent/src/mcpAgent.js` handles the SQL generation logic.