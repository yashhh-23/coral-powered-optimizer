# 🏴‍☠️ GSoC & Open-Source Matchmaker Agent

> **Built for the [Pirates of the Coral-bean Hackathon](https://www.wemakedevs.org/hackathons/coral) | Track 2: Personal Agent**

Transitioning from competitive programming (LeetCode, CodeChef) to open-source contribution can feel like jumping into uncharted waters. Many developers have elite problem-solving skills but struggle to find relevant codebases to apply them.

The **GSoC & Open-Source Matchmaker Agent** acts as a personalized technical recruiter. Powered by **Coral** and an LLM reasoning engine, it maps your algorithmic strengths directly to active "good first issues" across targeted Google Summer of Code (GSoC) organizations. 

## ✨ Core Features

* **Algorithmic Skill Mapping:** Inspects your accepted competitive programming submisison tags (e.g., Dynamic Programming, Graphs, Tries).
* **Cross-Source Matchmaking:** Executes unified SQL queries across local profiles and external open-source codebases simultaneously.
* **Resilient LLM Execution:** Dual-model architecture featuring **Google Gemini 1.5 Pro** for deep contextual tool analysis, with an automated fallback to **Groq (Llama 3 70B)** for lightning-fast SQL execution redundancy.
* **Interactive Recruiter Dashboard:** A clean Next.js UI providing a chat interface alongside an "Opportunity Matrix" grid displaying tailored issues.

## 🛠️ Tech Stack & Architecture

* **Data Layer:** [Coral](https://github.com/withcoral/coral) (Running locally via WSL Ubuntu)
* **Reasoning Engine:** Google Gemini 1.5 Pro (Primary) & Groq Llama 3 70B (Fallback)
* **Frontend Interface:** Next.js & TailwindCSS (Deployed via Vercel)
* **Secure Bridge:** Ngrok (Tunnels production frontend queries to local Coral MCP instance)

---

## ⚓ The Magic: Cross-Source SQL Joins

Instead of context-stuffing an LLM with massive JSON payloads from multiple APIs, the agent offloads data synchronization to Coral. Here is the exact query the agent uses to match repository issues to your highest-performing DSA concepts:

```sql
SELECT 
    ext_issues.html_url AS issue_url,
    ext_issues.title AS issue_title,
    ext_issues.labels,
    my_subs.topic_tag AS matching_skill
FROM 
    github.issues ext_issues
JOIN 
    leetcode.submissions my_subs
ON 
    ext_issues.title LIKE CONCAT('%', my_subs.topic_tag, '%')
    OR ext_issues.body LIKE CONCAT('%', my_subs.topic_tag, '%')
WHERE 
    ext_issues.repository_owner IN ('cncf', 'asyncapi', 'zulip', 'layer5io')
    AND ext_issues.state = 'open'
    AND (ext_issues.labels LIKE '%good first issue%' OR ext_issues.labels LIKE '%help wanted%')
ORDER BY 
    my_subs.acceptance_rate DESC
LIMIT 8;
💻 Local Installation & Setup
1. Set Up Coral in WSL (Ubuntu)
Install Coral locally to host the data layer:

Bash
curl -fsSL [https://withcoral.com/install.sh](https://withcoral.com/install.sh) | sh
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
2. Connect Your Profiles
Authenticate your native GitHub connection and add the custom LeetCode connector:

Bash
coral source add --interactive github
coral source add --spec ./sources/leetcode.yaml
3. Initialize Next.js App
Install dependencies and run the development environment:

Bash
npm install
npm run dev
4. Configure Environment Variables (.env.local)
Bash
GEMINI_API_KEY=your_gemini_api_key
GROQ_API_KEY=your_groq_api_key
CORAL_BACKEND_URL=your_ngrok_forwarding_url