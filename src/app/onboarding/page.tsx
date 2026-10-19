"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Building2,
  Camera,
  Check,
  ChevronLeft,
  ImageIcon,
  Loader2,
  Mail,
  PartyPopper,
  Sparkles,
  User,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import {
  GmailIcon,
  OutlookIcon,
  RebbanMark,
  StripeIcon,
} from "@/components/onboarding/BrandIcons";
import { FancySelect } from "@/components/onboarding/FancySelect";
import {
  COUNTRY_OPTIONS,
  CURRENCY_OPTIONS,
  INDUSTRY_OPTIONS,
  ONBOARDING_STEPS,
  currencyForCountry,
  firstNameFrom,
  normalizeOnboardingCountry,
  normalizeWebsite,
  type OnboardingStepId,
} from "@/lib/onboarding";
import { TAX_RATE_PRESETS } from "@/lib/invoices/totals";
import {
  normalizeBankgiro,
  normalizeIban,
} from "@/lib/invoices/payment-details";
import { trackSignUp } from "@/lib/analytics/track";

const INDUSTRY_SELECT_OPTIONS = INDUSTRY_OPTIONS.map((option) => ({
  value: option.value,
  label: option.label,
}));

const COUNTRY_SELECT_OPTIONS = COUNTRY_OPTIONS.map((option) => ({
  value: option.code,
  label: option.label,
}));

const CURRENCY_SELECT_OPTIONS = CURRENCY_OPTIONS.map((code) => ({
  value: code,
  label: code,
}));

const TAX_RATE_CHIP_OPTIONS = TAX_RATE_PRESETS.filter((rate) => rate > 0);

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const inputClass =
  "w-full border border-line rounded-xl px-3.5 py-2.5 text-sm text-gray-900 bg-white outline-none focus:border-gray-300 placeholder:text-gray-400";

function stepFromSearch(): OnboardingStepId {
  if (typeof window === "undefined") return "welcome";
  const raw = new URLSearchParams(window.location.search).get("step");
  if (raw && (ONBOARDING_STEPS as readonly string[]).includes(raw)) {
    return raw as OnboardingStepId;
  }
  return "welcome";
}

export default function OnboardingPage() {
  const {
    userId,
    fullName,
    email,
    avatarUrl,
    organizationId,
    organizationType,
    organizationDescription,
    logoUrl,
    organizationCurrency,
    refresh,
    loading: profileLoading,
  } = useProfile();

  const [step, setStep] = useState<OnboardingStepId>("welcome");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<"avatar" | "logo" | null>(null);

  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [industry, setIndustry] = useState("");
  const [bio, setBio] = useState("");
  const [website, setWebsite] = useState("");
  const [address, setAddress] = useState("");
  const [country, setCountry] = useState("SE");
  const [taxId, setTaxId] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [taxRate, setTaxRate] = useState(25);
  const [taxRateDraft, setTaxRateDraft] = useState("25");
  const [paymentIban, setPaymentIban] = useState("");
  const [paymentBankgiro, setPaymentBankgiro] = useState("");

  const [stripeConnected, setStripeConnected] = useState(false);
  const [stripeReady, setStripeReady] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailEmail, setGmailEmail] = useState<string | null>(null);
  const [outlookConnected, setOutlookConnected] = useState(false);
  const [outlookEmail, setOutlookEmail] = useState<string | null>(null);
  const mailConnected = gmailConnected || outlookConnected;

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const hydratedRef = useRef(false);
  const currencyTouchedRef = useRef(false);

  const stepIndex = ONBOARDING_STEPS.indexOf(step);
  const firstName = firstNameFrom(name) || firstNameFrom(fullName);
  const isSolo = organizationType !== "agency";

  useEffect(() => {
    setStep(stepFromSearch());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("signup") !== "google") return;
    const dedupeKey = "rebban_tracked_sign_up_google";
    if (sessionStorage.getItem(dedupeKey)) return;
    sessionStorage.setItem(dedupeKey, "1");
    trackSignUp("google");
    params.delete("signup");
    const qs = params.toString();
    const next = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState({}, "", next);
  }, []);

  useEffect(() => {
    if (profileLoading || hydratedRef.current) return;
    hydratedRef.current = true;
    setName(fullName || "");
    setBio(organizationDescription || "");
    setCurrency(organizationCurrency || "USD");
  }, [profileLoading, fullName, organizationDescription, organizationCurrency]);

  useEffect(() => {
    if (!userId && !organizationId) return;
    let cancelled = false;

    async function loadProfileExtras() {
      if (!userId) return;
      const supabase = createClient();
      const { data } = await supabase
        .from("profiles")
        .select("title, industry")
        .eq("id", userId)
        .maybeSingle();
      if (cancelled || !data) return;
      setTitle(data.title || "");
      setIndustry(data.industry || "");
    }

    async function loadOrg() {
      if (!organizationId) return;
      const supabase = createClient();
      const { data } = await supabase
        .from("organizations")
        .select(
          "address, country, tax_id, currency, default_tax_enabled, default_tax_rate, description, website, stripe_account_id, stripe_charges_enabled, stripe_details_submitted, payment_iban, payment_bankgiro"
        )
        .eq("id", organizationId)
        .maybeSingle();

      if (cancelled || !data) return;

      setAddress(data.address || "");
      setTaxId(data.tax_id || "");
      setTaxEnabled(Boolean(data.default_tax_enabled));
      {
        const rate = Number(data.default_tax_rate) || 25;
        setTaxRate(rate);
        setTaxRateDraft(String(rate));
      }
      setBio(data.description || "");
      setWebsite(data.website || "");
      setPaymentIban(data.payment_iban || "");
      setPaymentBankgiro(data.payment_bankgiro || "");
      setStripeConnected(Boolean(data.stripe_account_id));
      setStripeReady(
        Boolean(data.stripe_charges_enabled && data.stripe_details_submitted)
      );

      const savedCountry = data.country?.trim() || null;
      // Org currency defaults to USD in the DB until onboarding is saved.
      const savedCurrency = data.currency?.trim() || null;
      const countryWasSet = Boolean(savedCountry);

      if (countryWasSet && savedCountry) {
        setCountry(savedCountry);
        setCurrency(savedCurrency || currencyForCountry(savedCountry));
        currencyTouchedRef.current = Boolean(
          savedCurrency && savedCurrency !== currencyForCountry(savedCountry)
        );
        return;
      }

      let geoCountry: string | null = null;
      try {
        const geoRes = await fetch("/api/geo");
        const geoJson = await geoRes.json().catch(() => ({}));
        if (!cancelled && geoRes.ok) {
          geoCountry = normalizeOnboardingCountry(geoJson.country);
        }
      } catch {
        // Local/dev often has no geo headers — keep fallbacks.
      }
      if (cancelled) return;

      const nextCountry = geoCountry || "SE";
      setCountry(nextCountry);
      setCurrency(
        savedCurrency && savedCurrency !== "USD"
          ? savedCurrency
          : currencyForCountry(nextCountry)
      );
    }

    async function loadMail() {
      const [gmailRes, outlookRes] = await Promise.all([
        fetch("/api/gmail/status"),
        fetch("/api/outlook/status"),
      ]);
      if (cancelled) return;
      if (gmailRes.ok) {
        const json = await gmailRes.json().catch(() => ({}));
        setGmailConnected(Boolean(json.connected));
        setGmailEmail(json.email || null);
      }
      if (outlookRes.ok) {
        const json = await outlookRes.json().catch(() => ({}));
        setOutlookConnected(Boolean(json.connected));
        setOutlookEmail(json.email || null);
      }
    }

    void loadProfileExtras();
    void loadOrg();
    void loadMail();

    return () => {
      cancelled = true;
    };
  }, [userId, organizationId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("gmail") === "connected") {
      setGmailConnected(true);
      setStep("email");
      void fetch("/api/gmail/status")
        .then((r) => r.json())
        .then((json) => {
          if (json.email) setGmailEmail(json.email);
        })
        .catch(() => {});
    }
    if (params.get("outlook") === "connected") {
      setOutlookConnected(true);
      setStep("email");
      void fetch("/api/outlook/status")
        .then((r) => r.json())
        .then((json) => {
          if (json.email) setOutlookEmail(json.email);
        })
        .catch(() => {});
    }
    if (params.get("stripe") === "return" || params.get("stripe") === "refresh") {
      setStep("invoicing");
      void fetch("/api/stripe/connect/refresh", { method: "POST" })
        .then((r) => r.json())
        .then((json) => {
          setStripeConnected(Boolean(json.connected));
          setStripeReady(Boolean(json.ready));
        })
        .catch(() => {});
    }
  }, []);

  function goTo(next: OnboardingStepId) {
    setError(null);
    setStep(next);
    const url = new URL(window.location.href);
    url.searchParams.set("step", next);
    window.history.replaceState({}, "", url.toString());
  }

  function goNext() {
    const next = ONBOARDING_STEPS[Math.min(stepIndex + 1, ONBOARDING_STEPS.length - 1)];
    goTo(next);
  }

  function goBack() {
    const prev = ONBOARDING_STEPS[Math.max(stepIndex - 1, 0)];
    goTo(prev);
  }

  async function markOnboardingDone() {
    if (!userId) return;
    const supabase = createClient();
    await supabase
      .from("profiles")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("id", userId);
  }

  async function handleSkip() {
    setBusy(true);
    setError(null);
    try {
      await markOnboardingDone();
      window.location.assign("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not skip onboarding.");
      setBusy(false);
    }
  }

  async function handleFinish() {
    setBusy(true);
    setError(null);
    try {
      await markOnboardingDone();
      window.location.assign("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not finish onboarding.");
      setBusy(false);
    }
  }

  async function saveProfileStep() {
    if (!userId || !organizationId) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const [{ error: profileError }, { error: orgError }] = await Promise.all([
      supabase
        .from("profiles")
        .update({
          full_name: name.trim() || null,
          title: title.trim() || null,
          industry: industry || null,
        })
        .eq("id", userId),
      supabase
        .from("organizations")
        .update({
          description: bio.trim() || null,
          website: normalizeWebsite(website),
          updated_at: new Date().toISOString(),
        })
        .eq("id", organizationId),
    ]);
    setBusy(false);
    if (profileError || orgError) {
      setError(profileError?.message || orgError?.message || "Could not save.");
      return;
    }
    await refresh();
    goNext();
  }

  async function saveInvoicingStep() {
    if (!organizationId) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: orgError } = await supabase
      .from("organizations")
      .update({
        address: address.trim() || null,
        country: country || null,
        currency,
        payment_iban: normalizeIban(paymentIban),
        payment_bankgiro: normalizeBankgiro(paymentBankgiro),
        updated_at: new Date().toISOString(),
      })
      .eq("id", organizationId);
    setBusy(false);
    if (orgError) {
      setError(orgError.message);
      return;
    }
    goNext();
  }

  async function saveTaxStep() {
    if (!organizationId) return;
    setBusy(true);
    setError(null);

    const supabase = createClient();
    let rateToSave = 0;
    let customRates: number[] | undefined;

    if (taxEnabled) {
      const parsed = Number(taxRateDraft);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
        setError("Enter a tax rate between 0 and 100.");
        setBusy(false);
        return;
      }
      rateToSave = Math.round(parsed * 100) / 100;
      setTaxRate(rateToSave);
      setTaxRateDraft(String(rateToSave));

      const isPreset = (TAX_RATE_PRESETS as readonly number[]).includes(
        rateToSave
      );
      if (!isPreset) {
        const { data: org } = await supabase
          .from("organizations")
          .select("custom_tax_rates")
          .eq("id", organizationId)
          .maybeSingle();
        const existing = (org?.custom_tax_rates || []).map((n) => Number(n));
        customRates = existing.includes(rateToSave)
          ? existing
          : [...existing, rateToSave].sort((a, b) => b - a);
      }
    }

    const { error: orgError } = await supabase
      .from("organizations")
      .update({
        tax_id: taxId.trim() || null,
        default_tax_enabled: taxEnabled,
        default_tax_rate: rateToSave,
        ...(customRates ? { custom_tax_rates: customRates } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", organizationId);
    setBusy(false);
    if (orgError) {
      setError(orgError.message);
      return;
    }
    goNext();
  }

  function applyTaxRate(rate: number) {
    const rounded = Math.round(rate * 100) / 100;
    setTaxRate(rounded);
    setTaxRateDraft(String(rounded));
  }

  async function uploadImage(kind: "avatar" | "logo", file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose a PNG or JPG image.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Image must be 2MB or smaller.");
      return;
    }
    if (kind === "avatar" && !userId) return;
    if (kind === "logo" && !organizationId) return;

    setUploading(kind);
    setError(null);
    const supabase = createClient();
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const safeExt = ext === "jpeg" ? "jpg" : ext;

    if (kind === "avatar") {
      const path = `${userId}/avatar.${safeExt}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) {
        setError(uploadError.message);
        setUploading(null);
        return;
      }
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: path })
        .eq("id", userId!);
      if (updateError) {
        setError(updateError.message);
        setUploading(null);
        return;
      }
    } else {
      const path = `${organizationId}/logo.${safeExt}`;
      const { error: uploadError } = await supabase.storage
        .from("org-assets")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) {
        setError(uploadError.message);
        setUploading(null);
        return;
      }
      const { error: updateError } = await supabase
        .from("organizations")
        .update({ logo_url: path })
        .eq("id", organizationId!);
      if (updateError) {
        setError(updateError.message);
        setUploading(null);
        return;
      }
    }

    await refresh();
    setUploading(null);
  }

  async function connectStripe() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/stripe/connect/onboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        returnPath: "/onboarding?step=invoicing&stripe=return",
        refreshPath: "/onboarding?step=invoicing&stripe=refresh",
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok || !json.url) {
      setError(json.error || "Could not start Stripe onboarding.");
      return;
    }
    window.location.href = json.url as string;
  }

  function connectGmail() {
    window.location.href =
      "/api/gmail/connect?returnTo=" +
      encodeURIComponent("/onboarding?step=email&gmail=connected");
  }

  function connectOutlook() {
    window.location.href =
      "/api/outlook/connect?returnTo=" +
      encodeURIComponent("/onboarding?step=email&outlook=connected");
  }

  const progressLabel = useMemo(() => {
    const labels: Record<OnboardingStepId, string> = {
      welcome: "Welcome",
      profile: "Your profile",
      invoicing: "Invoicing",
      tax: "Tax",
      email: "Email",
      done: "Ready",
    };
    return labels[step];
  }, [step]);

  if (profileLoading) {
    return (
      <main className="min-h-screen w-full bg-[#F0F1F3] flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </main>
    );
  }

  return (
    <main className="min-h-screen w-full bg-[#F0F1F3] flex flex-col">
      <header className="shrink-0 h-14 px-4 sm:px-6 flex items-center justify-between">
        <RebbanMark className="w-9 h-9 text-[14px]" />
        {step !== "done" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleSkip()}
            className="text-[13px] font-medium text-gray-500 hover:text-gray-800 transition-colors disabled:opacity-50"
          >
            Skip for now
          </button>
        ) : (
          <span className="w-20" />
        )}
      </header>

      <div className="flex-1 flex flex-col items-center px-4 pb-10 pt-2 sm:pt-6">
        <div className="w-full max-w-[720px] mb-6">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-gray-400">
              {progressLabel}
            </p>
            <p className="text-[12px] text-gray-400 tabular-nums">
              {stepIndex + 1} / {ONBOARDING_STEPS.length}
            </p>
          </div>
          <div className="flex gap-1.5">
            {ONBOARDING_STEPS.map((id, i) => (
              <div
                key={id}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i <= stepIndex ? "bg-[#2563EB]" : "bg-gray-200"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="w-full max-w-[720px] bg-white rounded-[1.75rem] border border-line shadow-[0_16px_48px_rgba(16,24,40,0.08)]">
          <div className="p-6 sm:p-8">
            {step === "welcome" && (
              <div className="text-center py-4 sm:py-6">
                <div className="mx-auto mb-6 relative">
                  <div className="absolute inset-0 blur-2xl bg-[#2563EB]/15 rounded-full scale-150" />
                  <RebbanMark className="relative w-16 h-16 mx-auto text-[22px]" />
                </div>
                <h1 className="text-2xl sm:text-[1.75rem] font-semibold text-gray-900 tracking-tight">
                  Welcome{firstName ? `, ${firstName}` : ""} to Rebban
                </h1>
                <p className="text-[15px] text-gray-500 mt-3 leading-relaxed max-w-sm mx-auto">
                  You&apos;re in. Let&apos;s set up Rebban in a few quick steps so
                  you can send proposals, invoice clients, and get paid.
                </p>
                <ul className="mt-8 space-y-3 text-left max-w-sm mx-auto">
                  {[
                    "Personalize your profile & brand",
                    "Set up invoicing, tax & payouts",
                    "Connect Gmail or Outlook to send as you",
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-center gap-3 text-[14px] text-gray-700"
                    >
                      <span className="w-6 h-6 rounded-full bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center shrink-0">
                        <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {step === "profile" && (
              <div className="space-y-5">
                <div>
                  <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 tracking-tight">
                    Make it yours
                  </h1>
                  <p className="text-[14px] text-gray-500 mt-1.5">
                    Add your name and visuals so clients recognize you.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                  <UploadTile
                    label="Profile photo"
                    previewUrl={avatarUrl}
                    icon={User}
                    uploading={uploading === "avatar"}
                    onPick={() => avatarInputRef.current?.click()}
                  />
                  <UploadTile
                    label={isSolo ? "Logo" : "Company logo"}
                    previewUrl={logoUrl}
                    icon={ImageIcon}
                    uploading={uploading === "logo"}
                    onPick={() => logoInputRef.current?.click()}
                  />
                </div>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) =>
                    void uploadImage("avatar", e.target.files?.[0] ?? null)
                  }
                />
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) =>
                    void uploadImage("logo", e.target.files?.[0] ?? null)
                  }
                />

                <label className="block">
                  <span className="block text-[12px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                    Your name
                  </span>
                  <input
                    className={inputClass}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Alex Freelancer"
                  />
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="block text-[12px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                      Title
                    </span>
                    <input
                      className={inputClass}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Product designer"
                    />
                  </label>
                  <div className="block">
                    <span className="block text-[12px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                      Industry
                    </span>
                    <FancySelect
                      value={industry}
                      onChange={setIndustry}
                      options={INDUSTRY_SELECT_OPTIONS}
                      placeholder="Select industry"
                      searchable
                      searchPlaceholder="Search industries…"
                    />
                  </div>
                </div>

                <label className="block">
                  <span className="block text-[12px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                    Website
                    <span className="font-medium normal-case tracking-normal text-gray-300">
                      {" "}
                      · optional
                    </span>
                  </span>
                  <input
                    className={inputClass}
                    type="url"
                    inputMode="url"
                    autoComplete="url"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="https://yourstudio.com"
                  />
                </label>

                <label className="block">
                  <span className="block text-[12px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                    Short bio
                    <span className="font-medium normal-case tracking-normal text-gray-300">
                      {" "}
                      · optional
                    </span>
                  </span>
                  <textarea
                    className={`${inputClass} resize-none`}
                    rows={3}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Product designer helping startups ship clearer experiences."
                  />
                </label>
              </div>
            )}

            {step === "invoicing" && (
              <div className="space-y-5">
                <div>
                  <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 tracking-tight">
                    Invoicing setup
                  </h1>
                  <p className="text-[14px] text-gray-500 mt-1.5">
                    Business details and how you collect payments.
                  </p>
                </div>

                <label className="block">
                  <span className="block text-[12px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                    Business address
                  </span>
                  <textarea
                    className={`${inputClass} resize-none`}
                    rows={2}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Street, city, postal code"
                  />
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="block">
                    <span className="block text-[12px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                      Country
                    </span>
                    <FancySelect
                      value={country}
                      onChange={(value) => {
                        setCountry(value);
                        if (!currencyTouchedRef.current) {
                          setCurrency(currencyForCountry(value));
                        }
                      }}
                      options={COUNTRY_SELECT_OPTIONS}
                      placeholder="Select country"
                      searchable
                      searchPlaceholder="Search countries…"
                    />
                  </div>
                  <div className="block">
                    <span className="block text-[12px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                      Currency
                    </span>
                    <FancySelect
                      value={currency}
                      onChange={(value) => {
                        currencyTouchedRef.current = true;
                        setCurrency(value);
                      }}
                      options={CURRENCY_SELECT_OPTIONS}
                      placeholder="Select currency"
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-line p-4 flex items-start gap-3">
                  <StripeIcon className="w-10 h-10 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold text-gray-900">
                      Stripe payouts
                    </div>
                    <p className="text-[13px] text-gray-500 mt-0.5 leading-snug">
                      {stripeReady
                        ? "Stripe is ready. You can collect invoice payments."
                        : stripeConnected
                          ? "Stripe connected. Finish any remaining steps in Stripe when you can."
                          : "Connect Stripe to let clients pay invoices online. You can do this later."}
                    </p>
                    {!stripeReady && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void connectStripe()}
                        className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#635BFF] hover:text-[#4F46E5] disabled:opacity-50"
                      >
                        {stripeConnected ? "Continue setup" : "Connect Stripe"}
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {stripeReady && (
                      <span className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-emerald-700">
                        <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                        Connected
                      </span>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-line p-4 space-y-3">
                  <div>
                    <div className="text-[14px] font-semibold text-gray-900">
                      Bank transfer
                    </div>
                    <p className="text-[13px] text-gray-500 mt-0.5 leading-snug">
                      Add your account details so clients can pay without Stripe.
                      You can change this later in Settings.
                    </p>
                  </div>
                  <label className="block">
                    <span className="block text-[12px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                      IBAN
                      <span className="font-medium normal-case tracking-normal text-gray-300">
                        {" "}
                        · optional
                      </span>
                    </span>
                    <input
                      className={inputClass}
                      value={paymentIban}
                      onChange={(e) => setPaymentIban(e.target.value)}
                      placeholder="SE45 5000 0000 0583 9825 7466"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>
                  {(country === "SE" || paymentBankgiro) && (
                    <label className="block">
                      <span className="block text-[12px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                        Bankgiro
                        <span className="font-medium normal-case tracking-normal text-gray-300">
                          {" "}
                          · optional
                        </span>
                      </span>
                      <input
                        className={inputClass}
                        value={paymentBankgiro}
                        onChange={(e) => setPaymentBankgiro(e.target.value)}
                        placeholder="123-4567"
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </label>
                  )}
                </div>
              </div>
            )}

            {step === "tax" && (
              <div className="space-y-5">
                <div>
                  <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 tracking-tight">
                    Tax settings
                  </h1>
                  <p className="text-[14px] text-gray-500 mt-1.5">
                    Decide whether new invoices include tax by default. You can
                    always change this later.
                  </p>
                </div>

                <div className="rounded-2xl border border-line bg-[#FAFBFC] p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-[15px] font-semibold text-gray-900">
                        Add tax to invoices
                      </div>
                      <p className="text-[13px] text-gray-500 mt-1 leading-snug">
                        Turn this on if you charge VAT, GST, or sales tax.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={taxEnabled}
                      onClick={() => setTaxEnabled((v) => !v)}
                      className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${
                        taxEnabled ? "bg-[#2563EB]" : "bg-gray-200"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${
                          taxEnabled ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {taxEnabled && (
                  <div className="space-y-4">
                    <div className="block">
                      <span className="block text-[12px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                        Default tax rate
                      </span>
                      <div className="relative max-w-[160px]">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.01}
                          className={`${inputClass} pr-9`}
                          value={taxRateDraft}
                          onChange={(e) => {
                            setTaxRateDraft(e.target.value);
                            const parsed = Number(e.target.value);
                            if (Number.isFinite(parsed)) setTaxRate(parsed);
                          }}
                          placeholder="23"
                        />
                        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-400 pointer-events-none">
                          %
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-3">
                        {TAX_RATE_CHIP_OPTIONS.map((rate) => {
                          const selected =
                            Number(taxRateDraft) === rate || taxRate === rate;
                          return (
                            <button
                              key={rate}
                              type="button"
                              onClick={() => applyTaxRate(rate)}
                              className={`px-3 py-1.5 rounded-full text-[13px] font-medium border transition-colors ${
                                selected
                                  ? "border-[#2563EB] bg-[#EFF6FF] text-[#2563EB]"
                                  : "border-line bg-white text-gray-700 hover:bg-gray-50"
                              }`}
                            >
                              {rate}%
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[12px] text-gray-400 mt-2">
                        Type any rate (e.g. 23 for Portugal) or pick a common one.
                      </p>
                    </div>

                    <label className="block">
                      <span className="block text-[12px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                        Tax / VAT ID
                        <span className="font-medium normal-case tracking-normal text-gray-300">
                          {" "}
                          · optional
                        </span>
                      </span>
                      <input
                        className={inputClass}
                        value={taxId}
                        onChange={(e) => setTaxId(e.target.value)}
                        placeholder="SE123456789001"
                      />
                    </label>

                    <p className="text-[13px] text-gray-500 leading-relaxed">
                      New invoices will start with tax enabled at this rate. You
                      can override per invoice anytime.
                    </p>
                  </div>
                )}

                {!taxEnabled && (
                  <p className="text-[13px] text-gray-500 leading-relaxed">
                    No problem. Invoices will go out without tax. You can add a
                    VAT ID and rates later in Settings.
                  </p>
                )}
              </div>
            )}

            {step === "email" && (
              <div className="space-y-5">
                <div>
                  <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 tracking-tight">
                    Send from your email
                  </h1>
                  <p className="text-[14px] text-gray-500 mt-1.5">
                    Connect Gmail or Outlook so proposals and invoices go out as
                    you, not a no-reply address.
                  </p>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-line p-5 flex flex-col items-center text-center">
                    <div className="w-12 h-12 rounded-2xl bg-[#FAFBFC] border border-line flex items-center justify-center mb-3">
                      <GmailIcon className="w-7 h-7" />
                    </div>
                    <div className="text-[15px] font-semibold text-gray-900">
                      Gmail
                    </div>
                    <p className="text-[12px] text-gray-500 mt-1 leading-relaxed">
                      {gmailConnected
                        ? `Connected as ${gmailEmail || email || "your Gmail account"}.`
                        : "Send-only access. We never read your inbox."}
                    </p>
                    {gmailConnected ? (
                      <span className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
                        <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                        Connected
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={connectGmail}
                        className="mt-3 btn-primary inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm"
                      >
                        <GmailIcon className="w-4 h-4" />
                        Connect
                      </button>
                    )}
                  </div>

                  <div className="rounded-2xl border border-line p-5 flex flex-col items-center text-center">
                    <div className="w-12 h-12 rounded-2xl bg-[#FAFBFC] border border-line flex items-center justify-center mb-3">
                      <OutlookIcon className="w-7 h-7" />
                    </div>
                    <div className="text-[15px] font-semibold text-gray-900">
                      Outlook
                    </div>
                    <p className="text-[12px] text-gray-500 mt-1 leading-relaxed">
                      {outlookConnected
                        ? `Connected as ${outlookEmail || "your Outlook account"}.`
                        : "Works with Outlook and Microsoft 365."}
                    </p>
                    {outlookConnected ? (
                      <span className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
                        <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                        Connected
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={connectOutlook}
                        className="mt-3 btn-primary inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm"
                      >
                        <OutlookIcon className="w-4 h-4" />
                        Connect
                      </button>
                    )}
                  </div>
                </div>

                <div className="rounded-xl bg-[#FAFBFC] border border-line px-4 py-3 text-[13px] text-gray-500 flex items-start gap-2.5">
                  <Mail className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                  <span>
                    Prefer to skip? Rebban can still send via our email until you
                    connect a mailbox later in Settings.
                  </span>
                </div>
              </div>
            )}

            {step === "done" && (
              <div className="text-center py-6 sm:py-8">
                <div className="mx-auto w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-5">
                  <PartyPopper className="w-7 h-7" />
                </div>
                <h1 className="text-2xl sm:text-[1.75rem] font-semibold text-gray-900 tracking-tight">
                  You&apos;re ready to start
                </h1>
                <p className="text-[15px] text-gray-500 mt-3 leading-relaxed max-w-sm mx-auto">
                  Great. Your workspace is set up. Create a proposal, track
                  time, or send your first invoice whenever you&apos;re ready.
                </p>
                <div className="mt-8 grid grid-cols-3 gap-2 max-w-sm mx-auto">
                  {[
                    { icon: Sparkles, label: "Proposals" },
                    { icon: Building2, label: "Clients" },
                    { icon: Mail, label: "Invoices" },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-2xl border border-line bg-[#FAFBFC] px-2 py-3"
                    >
                      <item.icon className="w-4 h-4 text-[#2563EB] mx-auto mb-1.5" />
                      <div className="text-[11px] font-medium text-gray-600">
                        {item.label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div className="mt-5 text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">
                {error}
              </div>
            )}
          </div>

          <div className="px-6 sm:px-8 py-4 border-t border-line bg-[#FAFBFC] rounded-b-[1.75rem] flex items-center justify-between gap-3">
            {step === "welcome" ? (
              <span />
            ) : (
              <button
                type="button"
                onClick={goBack}
                disabled={busy}
                className="inline-flex items-center gap-1 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-white hover:border-line border border-transparent disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
            )}

            {step === "welcome" && (
              <button
                type="button"
                onClick={goNext}
                className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm ml-auto"
              >
                Get started
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
            {step === "profile" && (
              <button
                type="button"
                disabled={busy || !name.trim()}
                onClick={() => void saveProfileStep()}
                className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm disabled:opacity-50"
              >
                {busy ? "Saving…" : "Continue"}
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
            {step === "invoicing" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveInvoicingStep()}
                className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm disabled:opacity-50"
              >
                {busy ? "Saving…" : "Continue"}
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
            {step === "tax" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveTaxStep()}
                className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm disabled:opacity-50"
              >
                {busy ? "Saving…" : "Continue"}
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
            {step === "email" && (
              <button
                type="button"
                onClick={goNext}
                className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm"
              >
                {mailConnected ? "Continue" : "Continue without email"}
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
            {step === "done" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleFinish()}
                className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm ml-auto disabled:opacity-50"
              >
                {busy ? "Opening…" : "Go to dashboard"}
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function UploadTile({
  label,
  previewUrl,
  icon: Icon,
  uploading,
  onPick,
}: {
  label: string;
  previewUrl: string | null;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  uploading: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={uploading}
      className="flex-1 rounded-2xl border border-dashed border-line bg-[#FAFBFC] hover:bg-white hover:border-gray-300 transition-colors p-4 text-left disabled:opacity-60"
    >
      <div className="flex items-center gap-3">
        <div className="relative w-14 h-14 rounded-2xl bg-white border border-line overflow-hidden flex items-center justify-center shrink-0">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <Icon className="w-5 h-5 text-gray-400" strokeWidth={1.75} />
          )}
          {uploading && (
            <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-gray-900">{label}</div>
          <div className="text-[12px] text-gray-500 mt-0.5 inline-flex items-center gap-1">
            <Camera className="w-3 h-3" />
            {previewUrl ? "Change" : "Upload"}
          </div>
        </div>
      </div>
    </button>
  );
}
