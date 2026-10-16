"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { GoogleAuthButton } from "@/components/GoogleAuthButton";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code) {
      window.location.replace(`/auth/callback?code=${encodeURIComponent(code)}`);
      return;
    }
    if (params.get("error") === "auth") {
      setError("Google sign-in failed. Try again, or use email and password.");
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    // Full navigation so middleware + session cookies are applied cleanly.
    window.location.assign("/");
  }

  return (
    <main className="min-h-full w-full bg-[#F0F1F3] flex items-start sm:items-center justify-center p-6 py-10">
      <div className="w-full max-w-[440px] bg-white rounded-3xl border border-line p-8 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="mb-8">
          <div className="w-10 h-10 rounded-xl bg-gray-950 text-white flex items-center justify-center mb-5">
            <span className="text-[15px] font-semibold tracking-tight">R.</span>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
            Welcome back
          </h1>
          <p className="text-sm text-gray-500 mt-1.5">
            Log in to your Rebban workspace.
          </p>
        </div>

        <div className="space-y-4">
          <GoogleAuthButton label="Continue with Google" />

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-line" />
            <span className="text-[12px] font-medium text-gray-400">or</span>
            <div className="h-px flex-1 bg-line" />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <label className="block">
            <span className="block text-[13px] font-medium text-gray-700 mb-1.5">
              Email
            </span>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-line rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-gray-300"
              placeholder="you@company.com"
            />
          </label>

          <label className="block">
            <span className="flex items-center justify-between gap-3 mb-1.5">
              <span className="text-[13px] font-medium text-gray-700">
                Password
              </span>
              <Link
                href={
                  email.trim()
                    ? `/forgot-password?email=${encodeURIComponent(email.trim())}`
                    : "/forgot-password"
                }
                className="text-[13px] font-medium text-[#2563EB] hover:text-[#1d4ed8]"
              >
                Forgot password?
              </Link>
            </span>
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-line rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-gray-300"
              placeholder="Your password"
            />
          </label>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full rounded-xl py-3 text-sm mt-2"
          >
            {loading ? "Logging in…" : "Log in"}
          </button>
        </form>

        <p className="text-sm text-gray-500 text-center mt-6">
          New to Rebban?{" "}
          <Link href="/signup" className="text-[#2563EB] font-medium hover:text-[#1d4ed8]">
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}
