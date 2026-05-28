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

const CORAL_FEATURES = [
  "SQL Interface",
  "Cross-Source Joins",
  "Schema Learning",
  "Query Caching",
  "MCP Integration",
  "Custom Source Spec",
  "Rate Limiting",
  "JSON Columns",
];

/* ── Inline SVG Icons ──────────────────────────────────────────── */

function CoralIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m2 10 10-7 10 7-10 7Z"/>
      <path d="m2 14 10 7 10-7"/>
    </svg>
  );
}

function UserIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 12 14-7-7 14-2-7z"/>
    </svg>
  );
}

/* ── Toggle Switch ─────────────────────────────────────────────── */

function Toggle({ checked, onChange, disabled = false }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      className="toggle-track"
      data-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      style={disabled ? { opacity: 0.6, cursor: "not-allowed" } : {}}
      aria-label="Toggle"
    >
      <span className="toggle-thumb" />
    </button>
  );
}

/* ── Main Component ────────────────────────────────────────────── */

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
        body: JSON.stringify({ question: userMessage, leetcodeEnabled, responseFormat: "text" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch");

      let finalReply = "";
      const textPart = data.textResponse || "Here are the raw results. I couldn't generate a personalized pitch at the moment.";
      finalReply = `${textPart}\n\n<details><summary style="cursor: pointer; color: var(--accent-text); font-size: 0.8rem; margin-top: 1rem;">View Background SQL Query</summary>\n\n\`\`\`sql\n${data.sql}\n\`\`\`\n\n**Raw Results:**\n\`\`\`json\n${JSON.stringify(data.result, null, 2)}\n\`\`\`\n</details>`;

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
        className="w-64 flex flex-col border-r p-5 gap-5 overflow-y-auto shrink-0"
        style={{
          background: "var(--bg-secondary)",
          borderColor: "var(--border)",
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 flex items-center justify-center shrink-0"
            style={{
              background: "var(--bg-card)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            <CoralIcon size={16} />
          </div>
          <div>
            <h1 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>GSoC Matchmaker</h1>
            <p className="text-[11px]" style={{ color: "var(--text-faint)" }}>
              Powered by Coral
            </p>
          </div>
        </div>

        {/* Coral Features */}
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
          <h3
            className="text-[11px] font-medium uppercase tracking-widest mb-3"
            style={{ color: "var(--text-faint)" }}
          >
            Coral Features
          </h3>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
            {CORAL_FEATURES.map((f) => (
              <span key={f} className="text-[11px] flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
                <span style={{ color: "var(--accent-text)", fontSize: "10px" }}>&#10003;</span>
                {f}
              </span>
            ))}
          </div>
        </div>

        {/* Quick Questions */}
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
          <h3
            className="text-[11px] font-medium uppercase tracking-widest mb-3"
            style={{ color: "var(--text-faint)" }}
          >
            Try Asking
          </h3>
          <div className="flex flex-col gap-1.5">
            {SAMPLE_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => handleQuickQuestion(q)}
                className="text-left text-xs px-3 py-2 rounded-md transition-colors duration-150"
                style={{
                  color: "var(--text-secondary)",
                  background: "transparent",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--bg-hover)";
                  e.currentTarget.style.color = "var(--text-primary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--text-secondary)";
                }}
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Data Sources */}
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
          <h3
            className="text-[11px] font-medium uppercase tracking-widest mb-3"
            style={{ color: "var(--text-faint)" }}
          >
            Data Sources
          </h3>
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>GitHub</span>
                <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>Required</span>
              </div>
              <Toggle checked={true} onChange={() => {}} disabled={true} />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>LeetCode</span>
                <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>Optional</span>
              </div>
              <Toggle checked={leetcodeEnabled} onChange={setLeetcodeEnabled} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-auto pt-4" style={{ borderTop: "1px solid var(--border)" }}>
          <p className="text-[11px]" style={{ color: "var(--text-faint)" }}>
            Gemini 2.5 Flash / Groq Fallback
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--text-faint)" }}>
            MCP over STDIO
          </p>
        </div>
      </aside>

      {/* ── Main Content ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Tab Header */}
        <header
          className="flex items-center gap-4 px-6 shrink-0"
          style={{
            borderBottom: "1px solid var(--border)",
            background: "transparent",
          }}
        >
          <button
            onClick={() => setActiveTab("chat")}
            className="py-3 text-sm font-medium transition-colors duration-150"
            style={{
              color: activeTab === "chat" ? "var(--text-primary)" : "var(--text-secondary)",
              borderBottom: activeTab === "chat" ? "2px solid var(--accent)" : "2px solid transparent",
            }}
          >
            Chat
          </button>
          <button
            onClick={() => {
              setActiveTab("schema");
              loadSchema();
            }}
            className="py-3 text-sm font-medium transition-colors duration-150"
            style={{
              color: activeTab === "schema" ? "var(--text-primary)" : "var(--text-secondary)",
              borderBottom: activeTab === "schema" ? "2px solid var(--accent)" : "2px solid transparent",
            }}
          >
            Schema Explorer
          </button>

          <div className="ml-auto flex items-center gap-1.5">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: "var(--success)" }}
            />
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
              Live
            </span>
          </div>
        </header>

        {/* Chat Tab */}
        {activeTab === "chat" && (
          <>
            <main className="flex-1 overflow-y-auto p-6" style={{ background: "var(--bg-primary)" }}>
              <div className="max-w-3xl mx-auto flex flex-col gap-6">
                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex items-start message-enter ${
                      msg.role === "user" ? "justify-end" : ""
                    }`}
                  >
                    {msg.role === "agent" && (
                      <div
                        className="flex items-center justify-center shrink-0 mr-3 mt-1"
                        style={{
                          width: 28,
                          height: 28,
                          background: "var(--bg-card)",
                          borderRadius: "var(--radius-sm)",
                        }}
                      >
                        <CoralIcon size={14} />
                      </div>
                    )}
                    <div
                      className={`max-w-2xl text-sm leading-relaxed ${msg.role === "agent" ? "bubble-agent prose prose-invert" : "bubble-user"}`}
                      style={{
                        padding: msg.role === "agent" ? "14px 18px" : "12px 16px",
                        ...(msg.isError ? { borderColor: "var(--error)", color: "var(--error)" } : {}),
                      }}
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
                        className="flex items-center justify-center shrink-0 ml-3 mt-1"
                        style={{
                          width: 28,
                          height: 28,
                          background: "var(--bg-hover)",
                          borderRadius: "var(--radius-sm)",
                        }}
                      >
                        <UserIcon size={14} />
                      </div>
                    )}
                  </div>
                ))}
                
                {/* Suggestion Chips — horizontal scroll */}
                {messages.length === 1 && !isLoading && (
                  <div className="ml-10 mt-2">
                    <p className="text-[11px] font-medium mb-2" style={{ color: "var(--text-faint)" }}>Try asking about...</p>
                    <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
                      {SAMPLE_QUESTIONS.map((q, i) => (
                        <button
                          key={i}
                          onClick={(e) => {
                            e.preventDefault();
                            setInputValue(q);
                          }}
                          className="text-xs px-3 py-1.5 whitespace-nowrap transition-colors duration-150"
                          style={{
                            background: "var(--bg-card)",
                            border: "1px solid var(--border)",
                            borderRadius: "var(--radius-md)",
                            color: "var(--text-secondary)",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = "var(--border-active)";
                            e.currentTarget.style.color = "var(--text-primary)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = "var(--border)";
                            e.currentTarget.style.color = "var(--text-secondary)";
                          }}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Typing Indicator */}
                {isLoading && (
                  <div className="flex items-start message-enter">
                    <div
                      className="flex items-center justify-center shrink-0 mr-3 mt-1"
                      style={{
                        width: 28,
                        height: 28,
                        background: "var(--bg-card)",
                        borderRadius: "var(--radius-sm)",
                      }}
                    >
                      <CoralIcon size={14} />
                    </div>
                    <div
                      className="bubble-agent flex gap-1.5 items-center"
                      style={{ padding: "14px 18px" }}
                    >
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            </main>

            {/* Input Bar — blends into chat area */}
            <div className="p-4 shrink-0" style={{ background: "var(--bg-primary)" }}>
              <form
                onSubmit={handleSubmit}
                className="flex gap-3 max-w-3xl mx-auto items-center"
              >
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Ask the matchmaker..."
                  className="flex-1 rounded-lg px-4 py-3 text-sm transition-colors duration-150 focus:outline-none"
                  style={{
                    background: "var(--bg-card)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border)",
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "var(--border-active)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
                  disabled={isLoading}
                />
                <button
                  type="submit"
                  disabled={isLoading || !inputValue.trim()}
                  className="rounded-md px-5 py-3 text-sm font-semibold transition-all active:scale-95 flex items-center gap-2"
                  style={{
                    background: "var(--accent)",
                    color: "#000",
                    opacity: isLoading || !inputValue.trim() ? 0.35 : 1,
                    cursor: isLoading || !inputValue.trim() ? "not-allowed" : "pointer",
                  }}
                >
                  Match
                  <SendIcon />
                </button>
              </form>
            </div>
          </>
        )}

        {/* Schema Explorer Tab */}
        {activeTab === "schema" && (
          <main className="flex-1 overflow-y-auto p-6" style={{ background: "var(--bg-primary)" }}>
            <div className="max-w-4xl mx-auto">
              <h2
                className="text-lg font-semibold mb-1"
                style={{ color: "var(--text-primary)" }}
              >
                Schema Explorer
              </h2>
              <p
                className="text-sm mb-6"
                style={{ color: "var(--text-secondary)" }}
              >
                Live schema discovered via MCP{" "}
                <code
                  className="px-1.5 py-0.5 rounded text-xs font-mono"
                  style={{
                    background: "var(--bg-card)",
                    color: "var(--accent-text)",
                    border: "1px solid var(--border)",
                  }}
                >
                  list_tables
                </code>{" "}
                +{" "}
                <code
                  className="px-1.5 py-0.5 rounded text-xs font-mono"
                  style={{
                    background: "var(--bg-card)",
                    color: "var(--accent-text)",
                    border: "1px solid var(--border)",
                  }}
                >
                  describe_table
                </code>
              </p>

              {/* Skeleton loading */}
              {schemaLoading && (
                <div className="grid gap-4 md:grid-cols-2">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="rounded-lg p-4"
                      style={{
                        background: "var(--bg-card)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <div className="skeleton mb-3" style={{ width: "40%", height: "0.9em" }} />
                      <div className="skeleton mb-2" style={{ width: "100%", height: "0.75em" }} />
                      <div className="skeleton mb-2" style={{ width: "85%", height: "0.75em" }} />
                      <div className="skeleton" style={{ width: "60%", height: "0.75em" }} />
                    </div>
                  ))}
                </div>
              )}

              {schemaData?.error && (
                <p style={{ color: "var(--error)" }}>
                  Error: {schemaData.error}
                </p>
              )}

              {schemaData?.tables && (
                <div className="grid gap-4 md:grid-cols-2">
                  {schemaData.details?.map((d: any, i: number) => (
                    <div
                      key={i}
                      className="rounded-lg p-4 transition-all duration-200"
                      style={{
                        background: "var(--bg-card)",
                        border: "1px solid var(--border)",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--border-active)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
                    >
                      <h3
                        className="text-sm font-mono font-medium mb-2"
                        style={{ color: "var(--accent-text)" }}
                      >
                        {d.table}
                      </h3>
                      <pre
                        className="text-xs overflow-x-auto max-h-48 overflow-y-auto rounded-md p-3 font-mono"
                        style={{
                          background: "var(--bg-primary)",
                          color: "var(--text-secondary)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        {JSON.stringify(d.description, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
