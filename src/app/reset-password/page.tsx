"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function checkSession() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        setError(
          "This reset link is invalid or expired. Request a new one from the login page."
        );
        setReady(false);
        return;
      }
      setReady(true);
    }
    void checkSession();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don’t match.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setDone(true);
  }

  return (
    <main className="min-h-full w-full bg-[#F0F1F3] flex items-start sm:items-center justify-center p-6 py-10">
      <div className="w-full max-w-[440px] bg-white rounded-3xl border border-line p-8 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="mb-8">
          <div className="w-10 h-10 rounded-xl bg-gray-950 text-white flex items-center justify-center mb-5">
            <span className="text-[15px] font-semibold tracking-tight">R.</span>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
            Choose a new password
          </h1>
          <p className="text-sm text-gray-500 mt-1.5">
            Pick something you’ll remember. At least 8 characters.
          </p>
        </div>

        {done ? (
          <div className="space-y-5">
            <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-3.5 py-3">
              Password updated. You’re signed in and can continue to your
              workspace.
            </p>
            <Link
              href="/"
              className="btn-primary inline-flex w-full items-center justify-center rounded-xl py-3 text-sm"
            >
              Go to dashboard
            </Link>
          </div>
        ) : !ready ? (
          <div className="space-y-5">
            {error ? (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                {error}
              </p>
            ) : (
              <p className="text-sm text-gray-500">Checking reset link…</p>
            )}
            <Link
              href="/forgot-password"
              className="text-sm font-medium text-[#2563EB] hover:text-[#1d4ed8]"
            >
              Request a new reset link
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="block text-[13px] font-medium text-gray-700 mb-1.5">
                New password
              </span>
              <input
                required
                type="password"
                minLength={8}
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-line rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-gray-300"
                placeholder="At least 8 characters"
              />
            </label>

            <label className="block">
              <span className="block text-[13px] font-medium text-gray-700 mb-1.5">
                Confirm password
              </span>
              <input
                required
                type="password"
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full border border-line rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-gray-300"
                placeholder="Repeat password"
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
              {loading ? "Saving…" : "Update password"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
