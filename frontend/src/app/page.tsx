"use client";

import { useState, useRef, useEffect, FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Message = {
  role: "agent" | "user";
  content: string;
  isError?: boolean;
};

const API_URL = process.env.NEXT_PUBLIC_AGENT_URL || "http://localhost:3001";

const SAMPLE_QUESTIONS = [
  "Find good first issues that match my DP skills",
  "What open-source projects need graph algorithm help?",
  "Show me my LeetCode skill profile",
  "Which GSoC orgs have issues matching my strengths?",
];

export default function Dashboard() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "agent",
      content:
        "Hi! I'm the GSoC Matchmaker. I'll map your LeetCode skills to open-source opportunities. Ask me anything!",
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "schema">("chat");
  const [schemaData, setSchemaData] = useState<any>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [leetcodeEnabled, setLeetcodeEnabled] = useState(true);
  const [responseFormat, setResponseFormat] = useState<"text" | "json">("text");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;
    const userMessage = inputValue.trim();
    setInputValue("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Bypass-Tunnel-Reminder": "true",
          "ngrok-skip-browser-warning": "true"
        },
        body: JSON.stringify({ question: userMessage, leetcodeEnabled, responseFormat }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch");

      let finalReply = "";
      if (data.textResponse) {
        finalReply = `${data.textResponse}\n\n<details><summary style="cursor: pointer; color: var(--accent-secondary); font-size: 0.8rem; margin-top: 1rem;">🔍 View Background SQL Query</summary>\n\n\`\`\`sql\n${data.sql}\n\`\`\`\n\n**Raw Results:**\n\`\`\`json\n${JSON.stringify(data.result, null, 2)}\n\`\`\`\n</details>`;
      } else {
        finalReply = `**Generated SQL:**\n\`\`\`sql\n${data.sql}\n\`\`\`\n\n**Results:**\n\`\`\`json\n${JSON.stringify(data.result, null, 2)}\n\`\`\``;
      }

      setMessages((prev) => [...prev, { role: "agent", content: finalReply }]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: "agent", content: `Error: ${err.message}`, isError: true },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadSchema = async () => {
    if (schemaData) return;
    setSchemaLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/schema?leetcodeEnabled=${leetcodeEnabled}`, {
        headers: {
          "Bypass-Tunnel-Reminder": "true",
          "ngrok-skip-browser-warning": "true"
        }
      });
      const data = await res.json();
      setSchemaData(data);
    } catch (err: any) {
      setSchemaData({ error: err.message });
    } finally {
      setSchemaLoading(false);
    }
  };

  const handleQuickQuestion = (q: string) => {
    setInputValue(q);
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg-primary)" }}>
      {/* ── Left Sidebar ─────────────────────────────────────────── */}
      <aside
        className="w-72 flex flex-col border-r p-5 gap-5 overflow-y-auto shrink-0"
        style={{
          background: "var(--bg-secondary)",
          borderColor: "var(--border-subtle)",
        }}
      >
        {/* Logo / Title */}
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-xl pulse-glow"
            style={{ background: "var(--accent-primary)" }}
          >
            🔍
          </div>
          <div>
            <h1 className="text-sm font-bold gradient-text">GSoC Matchmaker</h1>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Powered by Coral
            </p>
          </div>
        </div>

        {/* Coral Features Used */}
        <div
          className="glass rounded-xl p-4"
        >
          <h3
            className="text-xs font-semibold uppercase tracking-wider mb-3"
            style={{ color: "var(--text-secondary)" }}
          >
            ⚙️ Coral Features
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {[
              "SQL Interface",
              "Cross-Source Joins",
              "Schema Learning",
              "Query Caching",
              "MCP Integration",
              "Custom Source Spec",
              "Rate Limiting",
              "JSON Columns",
            ].map((f) => (
              <span key={f} className="skill-badge" style={{ fontSize: "0.65rem" }}>
                {f}
              </span>
            ))}
          </div>
        </div>

        {/* Quick Questions */}
        <div>
          <h3
            className="text-xs font-semibold uppercase tracking-wider mb-3"
            style={{ color: "var(--text-secondary)" }}
          >
            💡 Try Asking
          </h3>
          <div className="flex flex-col gap-2">
            {SAMPLE_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => handleQuickQuestion(q)}
                className="text-left text-xs px-3 py-2 rounded-lg transition-all hover:translate-x-1"
                style={{
                  background: "var(--bg-card)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Data Sources */}
        <div>
          <h3
            className="text-xs font-semibold uppercase tracking-wider mb-3"
            style={{ color: "var(--text-secondary)" }}
          >
            🔗 Data Sources
          </h3>
          <div className="flex flex-col gap-2">
            <label
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs cursor-not-allowed opacity-80"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}
            >
              <input type="checkbox" checked disabled className="w-3 h-3 rounded" style={{ accentColor: "var(--accent-primary)" }} />
              <div className="flex flex-col">
                <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>GitHub</span>
                <span style={{ color: "var(--text-muted)", fontSize: "0.6rem" }}>Mandatory Base Source</span>
              </div>
            </label>
            <label
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs cursor-pointer transition-all hover:bg-opacity-80"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}
            >
              <input 
                type="checkbox" 
                checked={leetcodeEnabled} 
                onChange={(e) => setLeetcodeEnabled(e.target.checked)}
                className="w-3 h-3 rounded cursor-pointer" 
                style={{ accentColor: "var(--accent-primary)" }}
              />
              <div className="flex flex-col">
                <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>LeetCode</span>
                <span style={{ color: "var(--text-muted)", fontSize: "0.6rem" }}>Optional (Improves Matching)</span>
              </div>
            </label>
          </div>
        </div>

        {/* Response Format */}
        <div>
          <h3
            className="text-xs font-semibold uppercase tracking-wider mb-3"
            style={{ color: "var(--text-secondary)" }}
          >
            📝 Output Format
          </h3>
          <div className="flex gap-2">
             <button
                onClick={() => setResponseFormat("text")}
                className="flex-1 py-1.5 rounded-lg text-[0.65rem] font-semibold transition-all uppercase tracking-wider"
                style={{
                  background: responseFormat === "text" ? "var(--accent-primary)" : "var(--bg-card)",
                  color: responseFormat === "text" ? "#fff" : "var(--text-secondary)",
                  border: "1px solid var(--border-subtle)"
                }}
             >
               Text (AI Pitch)
             </button>
             <button
                onClick={() => setResponseFormat("json")}
                className="flex-1 py-1.5 rounded-lg text-[0.65rem] font-semibold transition-all uppercase tracking-wider"
                style={{
                  background: responseFormat === "json" ? "var(--accent-primary)" : "var(--bg-card)",
                  color: responseFormat === "json" ? "#fff" : "var(--text-secondary)",
                  border: "1px solid var(--border-subtle)"
                }}
             >
               JSON (Raw Data)
             </button>
          </div>
        </div>

        {/* Tech Stack */}
        <div className="mt-auto pt-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Gemini 2.5 Flash → Groq Fallback
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            MCP over STDIO • Schema Caching
          </p>
        </div>
      </aside>

      {/* ── Main Content ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Tab Header */}
        <header
          className="flex items-center gap-1 px-6 py-3 border-b shrink-0"
          style={{
            background: "var(--bg-secondary)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <button
            onClick={() => setActiveTab("chat")}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background:
                activeTab === "chat" ? "var(--accent-primary)" : "transparent",
              color:
                activeTab === "chat"
                  ? "var(--text-primary)"
                  : "var(--text-secondary)",
            }}
          >
            💬 Chat
          </button>
          <button
            onClick={() => {
              setActiveTab("schema");
              loadSchema();
            }}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background:
                activeTab === "schema" ? "var(--accent-primary)" : "transparent",
              color:
                activeTab === "schema"
                  ? "var(--text-primary)"
                  : "var(--text-secondary)",
            }}
          >
            📊 Schema Explorer
          </button>

          <div className="ml-auto flex items-center gap-2">
            <span
              className="text-xs px-2 py-1 rounded-full"
              style={{
                background: "rgba(0,206,201,0.15)",
                color: "var(--success)",
                border: "1px solid rgba(0,206,201,0.3)",
              }}
            >
              ● Coral Connected
            </span>
          </div>
        </header>

        {/* Chat Tab */}
        {activeTab === "chat" && (
          <>
            <main className="flex-1 overflow-y-auto p-6 space-y-5">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex items-start ${
                    msg.role === "user" ? "justify-end" : ""
                  }`}
                >
                  {msg.role === "agent" && (
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mr-3 mt-1"
                      style={{
                        background: "linear-gradient(135deg, #a29bfe, #6c5ce7)",
                        boxShadow: "0 0 10px var(--accent-glow)",
                      }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m2 10 10-7 10 7-10 7Z"/><path d="m2 14 10 7 10-7"/></svg>
                    </div>
                  )}
                  <div
                    className={`max-w-2xl px-5 py-3.5 text-sm leading-relaxed ${msg.role === "agent" ? "bubble-agent prose prose-invert" : "bubble-user"}`}
                    style={msg.isError ? { borderColor: "var(--danger)", color: "var(--danger)" } : {}}
                  >
                    {msg.role === "agent" && !msg.isError ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </ReactMarkdown>
                    ) : (
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 ml-3 mt-1"
                      style={{
                        background: "var(--bg-card)",
                        border: "1px solid var(--border-subtle)",
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    </div>
                  )}
                </div>
              ))}
              
              {messages.length === 1 && !isLoading && (
                <div className="flex flex-col gap-3 mt-6 ml-11 max-w-2xl">
                  <p className="text-xs font-medium ml-1" style={{ color: "var(--text-secondary)" }}>Try asking about...</p>
                  <div className="flex flex-wrap gap-2">
                    {SAMPLE_QUESTIONS.map((q, i) => (
                      <button
                        key={i}
                        onClick={(e) => {
                          e.preventDefault();
                          setInputValue(q);
                        }}
                        className="text-xs px-4 py-2 rounded-full border transition-all hover:-translate-y-0.5 active:scale-95"
                        style={{
                          background: "var(--bg-card)",
                          borderColor: "var(--border-subtle)",
                          color: "var(--text-primary)"
                        }}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {isLoading && (
                <div className="flex items-start">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mr-3 mt-1"
                    style={{
                      background: "linear-gradient(135deg, #a29bfe, #6c5ce7)",
                      boxShadow: "0 0 10px var(--accent-glow)",
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m2 10 10-7 10 7-10 7Z"/><path d="m2 14 10 7 10-7"/></svg>
                  </div>
                  <div
                    className="bubble-agent px-5 py-4 flex gap-1.5 items-center mt-1"
                  >
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </main>

            {/* Input Bar */}
            <footer
              className="p-4 border-t shrink-0"
              style={{
                background: "var(--bg-secondary)",
                borderColor: "var(--border-subtle)",
              }}
            >
              <form
                onSubmit={handleSubmit}
                className="flex gap-3 max-w-4xl mx-auto items-center"
              >
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Ask the matchmaker... e.g. 'Find issues matching my graph skills'"
                  className="flex-1 rounded-xl px-5 py-3.5 text-sm focus:outline-none transition-all"
                  style={{
                    background: "var(--bg-card)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border-subtle)",
                  }}
                  disabled={isLoading}
                />
                <button
                  type="submit"
                  disabled={isLoading || !inputValue.trim()}
                  className="rounded-xl px-6 py-3.5 text-sm font-semibold transition-all active:scale-95 disabled:opacity-40"
                  style={{
                    background: "var(--accent-primary)",
                    color: "#fff",
                    boxShadow: "0 4px 14px var(--accent-glow)",
                  }}
                >
                  Match 🚀
                </button>
              </form>
            </footer>
          </>
        )}

        {/* Schema Explorer Tab */}
        {activeTab === "schema" && (
          <main className="flex-1 overflow-y-auto p-6">
            <h2
              className="text-lg font-bold mb-4"
              style={{ color: "var(--text-primary)" }}
            >
              📊 Coral Schema Explorer
            </h2>
            <p
              className="text-sm mb-6"
              style={{ color: "var(--text-secondary)" }}
            >
              Live schema discovered via MCP{" "}
              <code
                className="px-1.5 py-0.5 rounded text-xs"
                style={{
                  background: "var(--bg-card)",
                  color: "var(--accent-secondary)",
                }}
              >
                list_tables
              </code>{" "}
              +{" "}
              <code
                className="px-1.5 py-0.5 rounded text-xs"
                style={{
                  background: "var(--bg-card)",
                  color: "var(--accent-secondary)",
                }}
              >
                describe_table
              </code>
            </p>
            {schemaLoading && (
              <p style={{ color: "var(--text-muted)" }}>Loading schema...</p>
            )}
            {schemaData?.error && (
              <p style={{ color: "var(--danger)" }}>
                Error: {schemaData.error}
              </p>
            )}
            {schemaData?.tables && (
              <div className="grid gap-4 md:grid-cols-2">
                {schemaData.details?.map((d: any, i: number) => (
                  <div
                    key={i}
                    className="glass rounded-xl p-4"
                  >
                    <h3
                      className="text-sm font-bold mb-2"
                      style={{ color: "var(--accent-secondary)" }}
                    >
                      {d.table}
                    </h3>
                    <pre
                      className="text-xs overflow-x-auto max-h-48 overflow-y-auto rounded-lg p-3"
                      style={{
                        background: "var(--bg-primary)",
                        color: "var(--text-muted)",
                      }}
                    >
                      {JSON.stringify(d.description, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </main>
        )}
      </div>
    </div>
  );
}
