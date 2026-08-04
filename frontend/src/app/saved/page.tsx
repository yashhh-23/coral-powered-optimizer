"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

type SavedMatch = {
  id: string;
  issueUrl: string;
  pitch: string;
  org: string;
  tags: string[];
  savedAt: string;
};

const API_URL = process.env.NEXT_PUBLIC_AGENT_URL || "http://localhost:3001";

function BookmarkFilledIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </svg>
  );
}

export default function SavedMatchesPage() {
  const [matches, setMatches] = useState<SavedMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchMatches = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/saved-matches`, {
        credentials: "include",
        headers: {
          "Bypass-Tunnel-Reminder": "true",
          "ngrok-skip-browser-warning": "true",
        },
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      setMatches(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message || "Failed to load saved matches.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMatches();
  }, []);

  const deleteMatch = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`${API_URL}/api/saved-matches/${id}`, {
        method: "DELETE",
        credentials: "include",
        headers: {
          "Bypass-Tunnel-Reminder": "true",
          "ngrok-skip-browser-warning": "true",
        },
      });
      if (!res.ok) throw new Error("Failed to delete match.");
      setMatches((prev) => prev.filter((m) => m.id !== id));
    } catch (err: any) {
      setError(err.message || "Failed to delete match.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-primary)",
        color: "var(--text-primary)",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* Header */}
      <header
        style={{
          borderBottom: "1px solid var(--border)",
          padding: "0 2rem",
          height: "56px",
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          background: "var(--bg-sidebar)",
        }}
      >
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            color: "var(--text-secondary)",
            textDecoration: "none",
            fontSize: "13px",
            fontWeight: 500,
          }}
        >
          <ArrowLeftIcon />
          Back
        </Link>
        <div
          style={{
            width: "1px",
            height: "20px",
            background: "var(--border)",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ color: "var(--accent-text)" }}>
            <BookmarkFilledIcon />
          </span>
          <h1
            style={{
              fontSize: "15px",
              fontWeight: 600,
              color: "var(--text-primary)",
              margin: 0,
            }}
          >
            Saved Matches
          </h1>
        </div>
        <span
          style={{
            marginLeft: "auto",
            fontSize: "11px",
            color: "var(--text-faint)",
          }}
        >
          {matches.length} {matches.length === 1 ? "match" : "matches"}
        </span>
      </header>

      {/* Content */}
      <main
        style={{
          maxWidth: "768px",
          margin: "0 auto",
          padding: "2rem 1.5rem",
        }}
      >
        {loading && (
          <div style={{ color: "var(--text-faint)", fontSize: "14px", textAlign: "center", marginTop: "3rem" }}>
            Loading saved matches...
          </div>
        )}

        {!loading && error && (
          <div
            style={{
              background: "rgba(239,68,68,0.08)",
              border: "1px solid var(--error)",
              borderRadius: "8px",
              padding: "12px 16px",
              color: "var(--error)",
              fontSize: "13px",
            }}
          >
            {error}
          </div>
        )}

        {!loading && !error && matches.length === 0 && (
          <div
            style={{
              textAlign: "center",
              marginTop: "5rem",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "48px",
                height: "48px",
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: "12px",
                color: "var(--text-faint)",
                marginBottom: "16px",
              }}
            >
              <BookmarkFilledIcon />
            </div>
            <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginBottom: "6px" }}>
              No saved matches yet.
            </p>
            <p style={{ color: "var(--text-faint)", fontSize: "12px" }}>
              Use the Save button on any agent response in the chat.
            </p>
            <Link
              href="/"
              style={{
                display: "inline-block",
                marginTop: "20px",
                padding: "8px 20px",
                background: "var(--accent)",
                color: "#000",
                borderRadius: "8px",
                fontSize: "12px",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Go to chat
            </Link>
          </div>
        )}

        {!loading && !error && matches.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {matches.map((match) => (
              <div
                key={match.id}
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: "10px",
                  padding: "16px 18px",
                }}
              >
                {/* Row 1: Org + Tags */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    flexWrap: "wrap",
                    marginBottom: "8px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "var(--accent-text)",
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid var(--border)",
                      borderRadius: "4px",
                      padding: "1px 8px",
                    }}
                  >
                    {match.org}
                  </span>
                  {match.tags.map((tag) => (
                    <span
                      key={tag}
                      style={{
                        fontSize: "10px",
                        color: "var(--text-faint)",
                        background: "var(--bg-hover)",
                        borderRadius: "4px",
                        padding: "1px 6px",
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: "10px",
                      color: "var(--text-faint)",
                    }}
                  >
                    {new Date(match.savedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>

                {/* Row 2: Pitch */}
                {match.pitch && (
                  <p
                    style={{
                      fontSize: "13px",
                      color: "var(--text-secondary)",
                      lineHeight: "1.5",
                      marginBottom: "12px",
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical",
                    }}
                  >
                    {match.pitch}
                  </p>
                )}

                {/* Row 3: Actions */}
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <a
                    href={match.issueUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      fontSize: "11px",
                      fontWeight: 500,
                      color: "var(--accent-text)",
                      padding: "3px 10px",
                      borderRadius: "6px",
                      border: "1px solid var(--border)",
                      textDecoration: "none",
                      background: "transparent",
                    }}
                  >
                    Open issue
                    <ExternalLinkIcon />
                  </a>

                  <button
                    type="button"
                    onClick={() => deleteMatch(match.id)}
                    disabled={deletingId === match.id}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      fontSize: "11px",
                      fontWeight: 500,
                      color: "var(--error)",
                      padding: "3px 10px",
                      borderRadius: "6px",
                      border: "1px solid var(--border)",
                      background: "transparent",
                      cursor: deletingId === match.id ? "not-allowed" : "pointer",
                      opacity: deletingId === match.id ? 0.5 : 1,
                    }}
                  >
                    <TrashIcon />
                    {deletingId === match.id ? "Removing..." : "Remove"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
