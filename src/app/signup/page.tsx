"use client";

import React, { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { GoogleAuthButton } from "@/components/GoogleAuthButton";
import { trackSignUp } from "@/lib/analytics/track";

export default function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const name = fullName.trim();

    const { error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: name,
          organization_name: name || "My studio",
          organization_type: "solo",
          marketing_consent: marketingConsent,
        },
      },
    });

    setLoading(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    trackSignUp("email");

    // Full navigation so middleware + session cookies are applied cleanly.
    window.location.assign("/onboarding");
  }

  return (
    <main className="min-h-full w-full bg-[#F0F1F3] flex items-start sm:items-center justify-center p-6 py-10">
      <div className="w-full max-w-[440px] bg-white rounded-3xl border border-line p-8 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="mb-8">
          <div className="w-10 h-10 rounded-xl bg-gray-950 text-white flex items-center justify-center mb-5">
            <span className="text-[15px] font-semibold tracking-tight">R.</span>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
            Create your account
          </h1>
          <p className="text-sm text-gray-500 mt-1.5">
            Start free as a freelancer — proposals to paid, in one place.
          </p>
        </div>

        <div className="space-y-4 mb-4">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={marketingConsent}
              onChange={(e) => setMarketingConsent(e.target.checked)}
              className="mt-1 rounded border-gray-300"
            />
            <span className="text-[13px] text-gray-500 leading-snug">
              Send me product updates. You can unsubscribe anytime.
            </span>
          </label>

          <GoogleAuthButton
            label="Sign up with Google"
            next="/onboarding"
            organizationType="solo"
            marketingConsent={marketingConsent}
          />

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-line" />
            <span className="text-[12px] font-medium text-gray-400">or</span>
            <div className="h-px flex-1 bg-line" />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Full name">
            <input
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={inputClass}
              placeholder="Sam Andersson"
            />
          </Field>

          <Field label="Email">
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              placeholder="you@company.com"
            />
          </Field>

          <Field label="Password">
            <input
              required
              type="password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              placeholder="At least 8 characters"
            />
          </Field>

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
            {loading ? "Creating account…" : "Create account"}
          </button>

          <p className="text-[12px] text-gray-500 text-center leading-snug pt-1">
            By creating an account you agree to our{" "}
            <a
              href="https://rebban.com/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#2563EB] font-medium hover:text-[#1d4ed8]"
            >
              Terms
            </a>{" "}
            and{" "}
            <a
              href="https://rebban.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#2563EB] font-medium hover:text-[#1d4ed8]"
            >
              Privacy Policy
            </a>
            .
          </p>
        </form>

        <p className="text-sm text-gray-500 text-center mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-[#2563EB] font-medium hover:text-[#1d4ed8]">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}

const inputClass =
  "w-full border border-line rounded-xl px-3.5 py-2.5 text-sm text-gray-900 bg-white outline-none focus:border-gray-300 placeholder:text-gray-400";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[13px] font-medium text-gray-700 mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}
