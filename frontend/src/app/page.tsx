"use client";

import { useState, useRef, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ORG_PRESETS } from "../lib/org-presets";


type Message = {
  role: "agent" | "user";
  content: string;
  isError?: boolean;
  sql?: string;
  rawResults?: any;
  savedId?: string;   // set after user saves this match
  sharedId?: string;  // set after user creates a share link
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

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" x2="20" y1="12" y2="12" />
      <line x1="4" x2="20" y1="6" y2="6" />
      <line x1="4" x2="20" y1="18" y2="18" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

// Bookmark / Save icon
function BookmarkIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
    </svg>
  );
}

// Chain link / Share icon
function LinkIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
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
  const router = useRouter();
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
  const [leetcodeUsername, setLeetcodeUsername] = useState("");
  const [responseFormat, setResponseFormat] = useState<"text" | "json">("text");
  const [githubConnected, setGithubConnected] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [configStatus, setConfigStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [configError, setConfigError] = useState("");
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  // Toast notification for save/share feedback
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  function showToast(msg: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => setToast(null), 2800);
  }


  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedUsername = window.localStorage.getItem("gsoc_leetcode_username") || "";
    setLeetcodeUsername(storedUsername);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncAuth = async () => {
      try {
        const res = await fetch(`${API_URL}/api/auth/status`, {
          credentials: "include",
          headers: {
            "Bypass-Tunnel-Reminder": "true",
            "ngrok-skip-browser-warning": "true"
          }
        });
        const data = await res.json();
        if (!data.connected) {
          router.push("/login");
        } else {
          setGithubConnected(true);
        }
      } catch (err: any) {
        setGithubConnected(false);
        router.push("/login");
        setConfigError(err.message || "Failed to check GitHub auth status");
      } finally {
        setAuthLoading(false);
      }
    };

    syncAuth();
  }, []);

  const missingGithubToken = !githubConnected;
  const missingLeetcodeUsername = leetcodeEnabled && !leetcodeUsername.trim();

  const connectGithub = () => {
    if (typeof window === "undefined") return;
    window.location.href = `${API_URL}/auth/github?return=${encodeURIComponent(window.location.href)}`;
  };

  const disconnectGithub = async () => {
    setConfigError("");
    setConfigStatus("saving");
    try {
      const res = await fetch(`${API_URL}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Bypass-Tunnel-Reminder": "true",
          "ngrok-skip-browser-warning": "true"
        }
      });
      if (!res.ok) throw new Error("Failed to disconnect GitHub");
      setGithubConnected(false);
      setConfigStatus("idle");
    } catch (err: any) {
      setConfigStatus("error");
      setConfigError(err.message || "Failed to disconnect GitHub");
    }
  };
  
  const handleConfirmDisconnect = async () => {
    setShowDisconnectModal(false);
    await disconnectGithub();
    router.push("/login");
  };

  // Save a match (agent message) to the backend
  const saveMatch = async (msgIndex: number) => {
    const msg = messages[msgIndex];
    if (!msg || msg.role !== "agent") return;
    try {
      const res = await fetch(`${API_URL}/api/save-match`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "Bypass-Tunnel-Reminder": "true", "ngrok-skip-browser-warning": "true" },
        body: JSON.stringify({
          issueUrl: window.location.href,
          pitch: msg.content.slice(0, 500),
          org: "unknown",
          tags: [],
        }),
      });
      const data = await res.json();
      if (data.id) {
        setMessages((prev) =>
          prev.map((m, i) => (i === msgIndex ? { ...m, savedId: data.id } : m))
        );
        showToast("Match saved. View it at /saved.");
      }
    } catch {
      showToast("Failed to save match.");
    }
  };

  // Share a match (agent message) and copy link to clipboard
  const shareResult = async (msgIndex: number) => {
    const msg = messages[msgIndex];
    // Find the user question that preceded this message
    const userMsg = messages.slice(0, msgIndex).reverse().find((m) => m.role === "user");
    if (!msg || msg.role !== "agent") return;
    try {
      const res = await fetch(`${API_URL}/api/share`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "Bypass-Tunnel-Reminder": "true", "ngrok-skip-browser-warning": "true" },
        body: JSON.stringify({
          query: userMsg?.content || "",
          results: msg.rawResults || [],
          pitch: msg.content,
        }),
      });
      const data = await res.json();
      if (data.id) {
        const shareUrl = `${window.location.origin}/shared/${data.id}`;
        await navigator.clipboard.writeText(shareUrl).catch(() => {});
        setMessages((prev) =>
          prev.map((m, i) => (i === msgIndex ? { ...m, sharedId: data.id } : m))
        );
        showToast("Share link copied to clipboard.");
      }
    } catch {
      showToast("Failed to create share link.");
    }
  };


  const saveLeetCodeUsername = () => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("gsoc_leetcode_username", leetcodeUsername);
    setConfigStatus("saved");
  };


  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setConfigError("");
    if (missingGithubToken || missingLeetcodeUsername) {
      setConfigStatus("error");
      setConfigError(
        missingGithubToken
          ? "Please connect your GitHub account to fetch issues."
          : "Please add a LeetCode username or disable the LeetCode toggle."
      );
      return;
    }
    if (!inputValue.trim() || isLoading) return;
    const userMessage = inputValue.trim();
    setInputValue("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        credentials: "include",
        headers: { 
          "Content-Type": "application/json",
          "Bypass-Tunnel-Reminder": "true",
          "ngrok-skip-browser-warning": "true"
        },
        body: JSON.stringify({
          question: userMessage,
          leetcodeEnabled,
          responseFormat,
          leetcodeUsername
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch");

      let finalReply = "";
      if (responseFormat === "json") {
        finalReply = `Here is the JSON response representing the matched issues (LLM insights call skipped to save tokens):`;
      } else {
        finalReply = data.textResponse || "Here are the raw results. I couldn't generate a personalized pitch at the moment.";
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "agent",
          content: finalReply,
          sql: data.sql,
          rawResults: data.result,
        },
      ]);
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
    if (missingGithubToken || missingLeetcodeUsername) {
      setConfigStatus("error");
      setConfigError(
        missingGithubToken
          ? "Please connect GitHub to load schema."
          : "Please add a LeetCode username or disable the LeetCode toggle."
      );
      return;
    }
    setSchemaLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/schema`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Bypass-Tunnel-Reminder": "true",
          "ngrok-skip-browser-warning": "true"
        },
        body: JSON.stringify({ leetcodeEnabled, leetcodeUsername })
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

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: "var(--bg-primary)" }}>
        <div style={{ color: "var(--text-secondary)" }}>Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden relative" style={{ background: "var(--bg-primary)" }}>
      {/* Sidebar Backdrop overlay on mobile */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-30 md:hidden transition-opacity"
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.6)",
            backdropFilter: "blur(2px)",
          }}
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* ── Left Sidebar ─────────────────────────────────────────── */}
      <aside
        className={`w-64 flex flex-col border-r p-5 gap-5 overflow-y-auto shrink-0 fixed inset-y-0 left-0 z-40 md:static md:translate-x-0 transition-transform duration-200 ease-in-out ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{
          background: "var(--bg-secondary)",
          borderColor: "var(--border)",
        }}
      >
        {/* Close Button for mobile */}
        <div className="flex md:hidden justify-end">
          <button
            type="button"
            onClick={() => setIsSidebarOpen(false)}
            className="p-1.5 rounded-md transition-colors"
            style={{
              color: "var(--text-secondary)",
              background: "var(--bg-hover)",
              border: "1px solid var(--border)",
            }}
            aria-label="Close sidebar"
          >
            <CloseIcon />
          </button>
        </div>

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

        {/* Response Format */}
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
          <h3
            className="text-[11px] font-medium uppercase tracking-widest mb-3"
            style={{ color: "var(--text-faint)" }}
          >
            Response Format
          </h3>
          <div className="flex gap-2 bg-[var(--bg-card)] p-1 rounded-md border border-[var(--border)]">
            <button
              type="button"
              className="flex-1 py-1 text-center text-[11px] font-semibold rounded transition-colors"
              style={{
                background: responseFormat === "text" ? "var(--accent)" : "transparent",
                color: responseFormat === "text" ? "#000" : "var(--text-secondary)",
              }}
              onClick={() => setResponseFormat("text")}
            >
              Text
            </button>
            <button
              type="button"
              className="flex-1 py-1 text-center text-[11px] font-semibold rounded transition-colors"
              style={{
                background: responseFormat === "json" ? "var(--accent)" : "transparent",
                color: responseFormat === "json" ? "#000" : "var(--text-secondary)",
              }}
              onClick={() => setResponseFormat("json")}
            >
              JSON
            </button>
          </div>
        </div>

        {/* Credentials */}
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
          <h3
            className="text-[11px] font-medium uppercase tracking-widest mb-3"
            style={{ color: "var(--text-faint)" }}
          >
            Credentials
          </h3>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                GitHub (required)
              </label>
              <button
                type="button"
                onClick={githubConnected ? () => setShowDisconnectModal(true) : connectGithub}
                className="rounded-md px-3 py-2 text-xs font-semibold"
                style={{
                  background: githubConnected ? "var(--bg-card)" : "var(--accent)",
                  color: githubConnected ? "var(--text-primary)" : "#000",
                  border: githubConnected ? "1px solid var(--border)" : "none",
                  opacity: authLoading ? 0.6 : 1
                }}
                disabled={authLoading}
              >
                {authLoading ? "Checking..." : githubConnected ? "Disconnect GitHub" : "Connect GitHub"}
              </button>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                LeetCode Username (optional)
              </label>
              <input
                type="text"
                value={leetcodeUsername}
                onChange={(e) => setLeetcodeUsername(e.target.value)}
                placeholder="yashdedhia"
                className="rounded-md px-3 py-2 text-xs"
                style={{
                  background: "var(--bg-card)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border)",
                }}
              />
            </div>
            <button
              type="button"
              onClick={saveLeetCodeUsername}
              className="rounded-md px-3 py-2 text-xs font-semibold"
              style={{
                background: "var(--accent)",
                color: "#000",
                opacity: configStatus === "saving" ? 0.6 : 1,
              }}
              disabled={configStatus === "saving"}
            >
              {configStatus === "saving" ? "Saving..." : "Save LeetCode username"}
            </button>
            {configStatus === "saved" && (
              <span className="text-[11px]" style={{ color: "var(--success)" }}>
                Saved in this browser.
              </span>
            )}
            {configError && (
              <span className="text-[11px]" style={{ color: "var(--error)" }}>
                {configError}
              </span>
            )}
            <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>
              GitHub OAuth runs on the backend. LeetCode username stays in your browser.
            </span>
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
          className="flex items-center gap-3 md:gap-4 px-4 md:px-6 shrink-0"
          style={{
            borderBottom: "1px solid var(--border)",
            background: "transparent",
          }}
        >
          {/* Hamburger Menu for Mobile */}
          <button
            type="button"
            onClick={() => setIsSidebarOpen(true)}
            className="md:hidden p-2 rounded-md transition-colors flex items-center justify-center"
            style={{
              color: "var(--text-primary)",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
            }}
            aria-label="Open sidebar"
          >
            <MenuIcon />
          </button>

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

          <Link
            href="/saved"
            className="py-3 text-sm font-medium transition-colors duration-150 hidden md:block"
            style={{
              color: "var(--text-secondary)",
              borderBottom: "2px solid transparent",
              textDecoration: "none",
            }}
          >
            Saved Matches
          </Link>

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
                        <>
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              a: ({ node, ...props }) => (
                                <a {...props} target="_blank" rel="noopener noreferrer" />
                              ),
                              // Render [confidence: X] markers as colored inline badges
                              p: ({ children }) => {
                                if (children == null || (typeof children !== "string" && !Array.isArray(children))) {
                                  return <p>{children}</p>;
                                }
                                const raw = Array.isArray(children)
                                  ? (children as (string | null)[]).filter(Boolean).join("")
                                  : String(children);
                                const parts = raw.split(
                                  /(\[confidence:\s*(?:high|medium|low)\s*\])/gi
                                );
                                if (parts.length === 1) return <p>{children}</p>;
                                return (
                                  <p>
                                    {parts.map((part, pi) => {
                                      const match = part.match(/\[confidence:\s*(high|medium|low)\s*\]/i);
                                      if (!match) return part;
                                      const level = match[1].toLowerCase() as "high" | "medium" | "low";
                                      const colors: Record<string, { bg: string; text: string; border: string }> = {
                                        high:   { bg: "rgba(34,197,94,0.15)",  text: "#22c55e", border: "#22c55e" },
                                        medium: { bg: "rgba(234,179,8,0.15)",  text: "#eab308", border: "#eab308" },
                                        low:    { bg: "rgba(239,68,68,0.12)",  text: "#ef4444", border: "#ef4444" },
                                      };
                                      const c = colors[level];
                                      return (
                                        <span
                                          key={pi}
                                          style={{
                                            display: "inline-flex",
                                            alignItems: "center",
                                            fontSize: "10px",
                                            fontWeight: 600,
                                            letterSpacing: "0.04em",
                                            textTransform: "uppercase",
                                            padding: "1px 7px",
                                            borderRadius: "999px",
                                            background: c.bg,
                                            color: c.text,
                                            border: `1px solid ${c.border}`,
                                            marginRight: "6px",
                                            verticalAlign: "middle",
                                          }}
                                        >
                                          {level}
                                        </span>
                                      );
                                    })}
                                  </p>
                                );
                              },
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>
                          {msg.sql && (
                            <details style={{ marginTop: "1rem" }}>
                              <summary style={{ cursor: "pointer", color: "var(--accent-text)", fontSize: "0.8rem" }}>
                                View thinking
                              </summary>
                              <div style={{ marginTop: "0.5rem", fontSize: "0.75rem", opacity: 0.9 }}>
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {`\`\`\`sql\n${msg.sql}\n\`\`\``}
                                </ReactMarkdown>
                              </div>
                            </details>
                          )}
                          {msg.rawResults && (
                            <details style={{ marginTop: "0.5rem" }}>
                              <summary style={{ cursor: "pointer", color: "var(--accent-text)", fontSize: "0.8rem" }}>
                                View Raw Results
                              </summary>
                              <div style={{ marginTop: "0.5rem", fontSize: "0.75rem", opacity: 0.9 }}>
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {`\`\`\`json\n${JSON.stringify(msg.rawResults, null, 2)}\n\`\`\``}
                                </ReactMarkdown>
                              </div>
                            </details>
                          )}

                          {/* Save and Share action buttons — only on non-error, non-initial messages */}
                          {idx > 0 && (
                            <div
                              style={{
                                display: "flex",
                                gap: "6px",
                                marginTop: "10px",
                                paddingTop: "8px",
                                borderTop: "1px solid var(--border)",
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => saveMatch(idx)}
                                title={msg.savedId ? "Already saved" : "Save this match"}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  padding: "3px 10px",
                                  fontSize: "11px",
                                  fontWeight: 500,
                                  borderRadius: "6px",
                                  border: "1px solid var(--border)",
                                  background: msg.savedId ? "var(--bg-hover)" : "transparent",
                                  color: msg.savedId ? "var(--accent-text)" : "var(--text-secondary)",
                                  cursor: msg.savedId ? "default" : "pointer",
                                  transition: "all 0.15s",
                                }}
                                disabled={!!msg.savedId}
                              >
                                <BookmarkIcon filled={!!msg.savedId} />
                                {msg.savedId ? "Saved" : "Save"}
                              </button>

                              <button
                                type="button"
                                onClick={() => shareResult(idx)}
                                title={msg.sharedId ? "Link already copied" : "Copy share link"}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  padding: "3px 10px",
                                  fontSize: "11px",
                                  fontWeight: 500,
                                  borderRadius: "6px",
                                  border: "1px solid var(--border)",
                                  background: "transparent",
                                  color: msg.sharedId ? "var(--accent-text)" : "var(--text-secondary)",
                                  cursor: "pointer",
                                  transition: "all 0.15s",
                                }}
                              >
                                <LinkIcon />
                                {msg.sharedId ? "Copied" : "Share"}
                              </button>
                            </div>
                          )}
                        </>
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
                  <div className="ml-10 mt-2 min-w-0">
                    <p className="text-[11px] font-medium mb-2" style={{ color: "var(--text-faint)" }}>Try asking about...</p>
                    <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
                      {SAMPLE_QUESTIONS.map((q, i) => (
                        <button
                          key={i}
                          onClick={(e) => {
                            e.preventDefault();
                            setInputValue(q);
                          }}
                          className="text-xs px-3 py-1.5 whitespace-nowrap shrink-0 transition-colors duration-150"
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

            {/* Input Bar */}
            <div className="p-4 shrink-0" style={{ background: "var(--bg-primary)" }}>
              {/* Org Preset Chips */}
              <div className="max-w-3xl mx-auto mb-2" style={{ overflowX: "auto", scrollbarWidth: "none" }}>
                <div className="flex gap-2 pb-1 flex-nowrap">
                  {Object.entries(ORG_PRESETS).map(([label, orgs]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => {
                        const orgList = orgs.join(", ");
                        setInputValue(`Find good first issues in ${orgList}`);
                      }}
                      className="shrink-0 text-[11px] px-3 py-1 rounded-full font-medium transition-all duration-150"
                      style={{
                        background: "var(--bg-card)",
                        border: "1px solid var(--border)",
                        color: "var(--text-secondary)",
                        whiteSpace: "nowrap",
                        cursor: "pointer",
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
                      {label}
                    </button>
                  ))}
                </div>
              </div>

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
                Live schema discovered via Coral MCP
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
      {showDisconnectModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4 animate-fadeIn" style={{ backgroundColor: "rgba(0, 0, 0, 0.75)", backdropFilter: "blur(4px)" }}>
          <div className="rounded-xl max-w-sm w-full p-6 message-enter" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)" }}>
            <h3 className="text-base font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
              Disconnect GitHub Account?
            </h3>
            <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
              Without GitHub data, matchmaking is not possible.
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setShowDisconnectModal(false)}
                className="w-full rounded-md px-4 py-2.5 text-xs font-semibold transition-colors duration-150"
                style={{
                  background: "var(--bg-hover)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border)"
                }}
              >
                Keep my github account connected
              </button>
              <button
                type="button"
                onClick={handleConfirmDisconnect}
                className="w-full rounded-md px-4 py-2.5 text-xs font-semibold transition-colors duration-150"
                style={{
                  background: "var(--error)",
                  color: "#fff"
                }}
              >
                I want to disconnect
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--bg-card)",
            border: "1px solid var(--border-active)",
            color: "var(--text-primary)",
            padding: "10px 20px",
            borderRadius: "8px",
            fontSize: "13px",
            fontWeight: 500,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            zIndex: 9999,
            whiteSpace: "nowrap",
            animation: "fadeIn 0.2s ease",
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
