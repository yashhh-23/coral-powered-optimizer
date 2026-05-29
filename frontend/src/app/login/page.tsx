"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_AGENT_URL || "http://localhost:3001";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if already logged in
    const checkAuth = async () => {
      try {
        const res = await fetch(`${API_URL}/api/auth/status`, {
          credentials: "include",
          headers: {
            "Bypass-Tunnel-Reminder": "true",
            "ngrok-skip-browser-warning": "true",
          },
        });
        const data = await res.json();
        if (data.connected) {
          router.push("/");
        } else {
          setLoading(false);
        }
      } catch (err) {
        console.error("Auth check failed:", err);
        setLoading(false);
      }
    };
    checkAuth();
  }, [router]);

  const connectGithub = () => {
    const returnUrl = encodeURIComponent(window.location.origin);
    window.location.href = `${API_URL}/auth/github?return=${returnUrl}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-pulse text-gray-500">Checking authentication...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0a0a0a]">
      <div className="max-w-md w-full p-8 bg-white dark:bg-[#111111] rounded-xl shadow-lg border border-gray-200 dark:border-gray-800 text-center">
        <h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-gray-100">Welcome to GSoC Matchmaker</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          Please connect your GitHub account to continue.
        </p>
        <button
          onClick={connectGithub}
          className="w-full py-3 px-4 flex items-center justify-center gap-2 bg-black hover:bg-gray-800 dark:bg-white dark:hover:bg-gray-200 text-white dark:text-black font-medium rounded-lg transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.379.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
          </svg>
          Connect GitHub
        </button>
      </div>
    </div>
  );
}