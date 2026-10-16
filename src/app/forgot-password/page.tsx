"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get("email");
    if (fromQuery) setEmail(fromQuery);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const origin = (
      process.env.NEXT_PUBLIC_APP_URL || window.location.origin
    ).replace(/\/$/, "");

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      {
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent("/reset-password")}`,
      }
    );

    setLoading(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }

    setSent(true);
  }

  return (
    <main className="min-h-full w-full bg-[#F0F1F3] flex items-start sm:items-center justify-center p-6 py-10">
      <div className="w-full max-w-[440px] bg-white rounded-3xl border border-line p-8 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="mb-8">
          <div className="w-10 h-10 rounded-xl bg-gray-950 text-white flex items-center justify-center mb-5">
            <span className="text-[15px] font-semibold tracking-tight">R.</span>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
            Reset your password
          </h1>
          <p className="text-sm text-gray-500 mt-1.5">
            Enter your email and we&apos;ll send a link to choose a new
            password.
          </p>
        </div>

        {sent ? (
          <div className="space-y-5">
            <p className="text-sm text-gray-700 bg-[#FAFBFC] border border-line rounded-xl px-3.5 py-3 leading-relaxed">
              If an account exists for{" "}
              <span className="font-medium text-gray-900">{email.trim()}</span>,
              you&apos;ll get a reset link shortly. Check spam if you don&apos;t
              see it.
            </p>
            <Link
              href="/login"
              className="btn-primary inline-flex w-full items-center justify-center rounded-xl py-3 text-sm"
            >
              Back to log in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="block text-[13px] font-medium text-gray-700 mb-1.5">
                Email
              </span>
              <input
                required
                type="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-line rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-gray-300"
                placeholder="you@company.com"
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
              {loading ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}

        {!sent && (
          <p className="text-sm text-gray-500 text-center mt-6">
            Remembered it?{" "}
            <Link
              href="/login"
              className="text-[#2563EB] font-medium hover:text-[#1d4ed8]"
            >
              Log in
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
