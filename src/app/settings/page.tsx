"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  User,
  Building2,
  Bell,
  CreditCard,
  Palette,
  Link2,
  Shield,
  Check,
  Sparkles,
  ImageIcon,
  Percent,
  Trash2,
} from "lucide-react";
import { TAX_RATE_PRESETS } from "@/lib/invoices/totals";
import {
  normalizeBankgiro,
  normalizeIban,
} from "@/lib/invoices/payment-details";
import {
  ORG_REMINDER_SEQUENCES,
  asOrgReminderSequence,
  formatReminderOffsetLabel,
  type ReminderSequenceKey,
} from "@/lib/invoices/reminders";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import { useBilling } from "@/components/BillingContext";
import { UserAvatar } from "@/components/UserAvatar";
import {
  COUNTRY_OPTIONS,
  CURRENCY_OPTIONS,
  INDUSTRY_OPTIONS,
  normalizeWebsite,
} from "@/lib/onboarding";
import { FancySelect } from "@/components/onboarding/FancySelect";

type SectionId =
  | "profile"
  | "business"
  | "branding"
  | "notifications"
  | "billing"
  | "tax"
  | "preferences"
  | "integrations";

type NavSection = {
  id: SectionId;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
};

const inputClass =
  "w-full border border-line rounded-xl px-3.5 py-2.5 text-sm text-gray-900 bg-white outline-none focus:border-gray-300 placeholder:text-gray-400";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="px-4 py-8 md:px-8 md:py-10 text-sm text-gray-500">
          Loading settings…
        </div>
      }
    >
      <SettingsPageInner />
    </Suspense>
  );
}

function SettingsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    userId,
    fullName,
    email,
    avatarUrl,
    organizationId,
    organizationType,
    organizationDescription,
    logoUrl,
    loading: profileLoading,
    refresh,
  } = useProfile();
  const { openUpgradeModal, refreshBilling } = useBilling();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const isSolo = organizationType !== "agency";

  const sections: NavSection[] = [
    {
      id: "profile",
      label: "Profile",
      description: "Your name and contact details",
      icon: User,
    },
    {
      id: "branding",
      label: "Branding",
      description: "Your bio, logo, and website",
      icon: Sparkles,
    },
    {
      id: "business",
      label: "Business",
      description: isSolo
        ? "Address, country, and currency"
        : "Company info on invoices",
      icon: Building2,
    },
    {
      id: "notifications",
      label: "Notifications",
      description: "Alerts and reminders",
      icon: Bell,
    },
    {
      id: "billing",
      label: "Billing",
      description: "Plan and payment method",
      icon: CreditCard,
    },
    {
      id: "tax",
      label: "Tax",
      description: "Default invoice tax rate",
      icon: Percent,
    },
    {
      id: "preferences",
      label: "Preferences",
      description: "Time tracking and invoice defaults",
      icon: Palette,
    },
    {
      id: "integrations",
      label: "Integrations",
      description: "Stripe, calendar, and more",
      icon: Link2,
    },
  ];

  const initialSection = (searchParams.get("section") as SectionId | null) || "profile";
  const [section, setSection] = useState<SectionId>(
    [
      "profile",
      "business",
      "branding",
      "notifications",
      "billing",
      "tax",
      "preferences",
      "integrations",
    ].includes(initialSection)
      ? initialSection
      : "profile"
  );
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gmailConfigured, setGmailConfigured] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailCanSend, setGmailCanSend] = useState(false);
  const [gmailEmail, setGmailEmail] = useState<string | null>(null);
  const [gmailBusy, setGmailBusy] = useState(false);
  const [gmailNotice, setGmailNotice] = useState<string | null>(null);
  const [outlookConfigured, setOutlookConfigured] = useState(false);
  const [outlookConnected, setOutlookConnected] = useState(false);
  const [outlookCanSend, setOutlookCanSend] = useState(false);
  const [outlookEmail, setOutlookEmail] = useState<string | null>(null);
  const [outlookBusy, setOutlookBusy] = useState(false);
  const [outlookNotice, setOutlookNotice] = useState<string | null>(null);
  const [stripeConfigured, setStripeConfigured] = useState(false);
  const [stripeConnected, setStripeConnected] = useState(false);
  const [stripeReady, setStripeReady] = useState(false);
  const [stripeBusy, setStripeBusy] = useState(false);
  const [stripeNotice, setStripeNotice] = useState<string | null>(null);
  const [billingConfigured, setBillingConfigured] = useState(false);
  const [billingActive, setBillingActive] = useState(false);
  const [billingPlanLabel, setBillingPlanLabel] = useState("Free");
  const [billingStatus, setBillingStatus] = useState<string | null>(null);
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingNotice, setBillingNotice] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [profile, setProfile] = useState({
    name: "",
    email: "",
    title: "",
    industry: "",
  });

  const [branding, setBranding] = useState({
    description: "",
    website: "",
  });

  const [business, setBusiness] = useState({
    company: "",
    orgNumber: "",
    address: "",
    country: "SE",
    currency: "USD",
    taxId: "",
    paymentIban: "",
    paymentBankgiro: "",
  });

  const [notifications, setNotifications] = useState({
    invoiceOverdue: true,
    proposalViewed: true,
    paymentReceived: true,
    weeklyDigest: false,
  });

  const [preferences, setPreferences] = useState({
    defaultHourlyRate: "95",
    reminderSequence: "standard" as Exclude<ReminderSequenceKey, "none">,
  });

  const [taxSettings, setTaxSettings] = useState({
    enabled: false,
    rate: 25,
    pricesIncludeTax: false,
    customRates: [] as number[],
    customDraft: "",
  });

  useEffect(() => {
    if (profileLoading) return;
    setProfile((prev) => ({
      ...prev,
      name: fullName ?? "",
      email: email ?? "",
    }));
    setBranding((prev) => ({
      ...prev,
      description: organizationDescription ?? "",
    }));
  }, [profileLoading, fullName, email, organizationDescription]);

  useEffect(() => {
    if (!userId || profileLoading) return;
    let cancelled = false;
    async function loadProfileExtras() {
      const supabase = createClient();
      const { data } = await supabase
        .from("profiles")
        .select("title, industry, notification_prefs")
        .eq("id", userId!)
        .maybeSingle();
      if (cancelled || !data) return;
      setProfile((prev) => ({
        ...prev,
        title: data.title || "",
        industry: data.industry || "",
      }));
      const prefs = (data.notification_prefs || {}) as Record<string, unknown>;
      setNotifications({
        invoiceOverdue: prefs.invoice_overdue !== false,
        proposalViewed: prefs.proposal_viewed !== false,
        paymentReceived: prefs.payment_received !== false,
        weeklyDigest: prefs.weekly_digest === true,
      });
    }
    void loadProfileExtras();
    return () => {
      cancelled = true;
    };
  }, [userId, profileLoading]);

  useEffect(() => {
    if (!organizationId || profileLoading) return;
    let cancelled = false;
    async function loadOrgSettings() {
      const supabase = createClient();
      const { data } = await supabase
        .from("organizations")
        .select(
          "name, legal_name, address, country, website, org_number, default_tax_rate, default_tax_enabled, default_prices_include_tax, custom_tax_rates, tax_id, currency, default_hourly_rate, default_reminder_sequence, payment_iban, payment_bankgiro"
        )
        .eq("id", organizationId!)
        .maybeSingle();
      if (cancelled || !data) return;
      setTaxSettings((prev) => ({
        ...prev,
        enabled: Boolean(data.default_tax_enabled),
        rate: Number(data.default_tax_rate || 0) || 25,
        pricesIncludeTax: Boolean(data.default_prices_include_tax),
        customRates: (data.custom_tax_rates || []).map((n) => Number(n)),
      }));
      setBusiness((prev) => ({
        ...prev,
        company: data.legal_name || data.name || prev.company,
        orgNumber: data.org_number || "",
        address: data.address || prev.address,
        country: data.country || "SE",
        taxId: data.tax_id || prev.taxId,
        currency: data.currency || prev.currency,
        paymentIban: data.payment_iban || "",
        paymentBankgiro: data.payment_bankgiro || "",
      }));
      setBranding((prev) => ({
        ...prev,
        website: data.website || "",
      }));
      setPreferences({
        defaultHourlyRate: String(Number(data.default_hourly_rate || 95)),
        reminderSequence: asOrgReminderSequence(data.default_reminder_sequence),
      });
    }
    void loadOrgSettings();
    return () => {
      cancelled = true;
    };
  }, [organizationId, profileLoading]);

  useEffect(() => {
    const gmail = searchParams.get("gmail");
    const outlook = searchParams.get("outlook");
    const stripe = searchParams.get("stripe");
    const billing = searchParams.get("billing");
    if (!gmail && !outlook && !stripe && !billing) return;

    if (gmail === "connected") {
      setGmailNotice("Gmail connected. Proposal emails will send from your account.");
      setSection("integrations");
    } else if (gmail === "error") {
      const reason = searchParams.get("reason") || "Could not connect Gmail.";
      setGmailNotice(reason);
      setSection("integrations");
    }

    if (outlook === "connected") {
      setOutlookNotice(
        "Outlook connected. Proposal emails will send from your account."
      );
      setSection("integrations");
    } else if (outlook === "error") {
      const reason =
        searchParams.get("reason") || "Could not connect Outlook.";
      setOutlookNotice(reason);
      setSection("integrations");
    }

    if (stripe === "return" || stripe === "refresh") {
      setSection("integrations");
      setStripeNotice(
        stripe === "return"
          ? "Checking your Stripe account…"
          : "Stripe onboarding link expired — start again to continue."
      );
      void (async () => {
        const res = await fetch("/api/stripe/connect/refresh", { method: "POST" });
        const json = await res.json();
        if (res.ok) {
          setStripeConnected(Boolean(json.connected));
          setStripeReady(Boolean(json.ready));
          setStripeNotice(
            json.ready
              ? "Stripe is ready. You can collect invoice payments."
              : "Stripe connected — finish any remaining steps in Stripe to accept payments."
          );
        }
      })();
    }

    if (billing === "success") {
      setSection("billing");
      setBillingNotice("Subscription updated. It can take a moment to sync.");
      void refreshBilling();
    } else if (billing === "cancelled") {
      setSection("billing");
      setBillingNotice("Checkout cancelled.");
    }

    const nextSection = billing ? "billing" : "integrations";
    router.replace(`/settings?section=${nextSection}`, { scroll: false });
  }, [searchParams, router, refreshBilling]);

  useEffect(() => {
    if (section !== "integrations") return;
    let cancelled = false;
    async function loadIntegrations() {
      const [gmailRes, outlookRes, stripeRes] = await Promise.all([
        fetch("/api/gmail/status"),
        fetch("/api/outlook/status"),
        fetch("/api/stripe/connect/status"),
      ]);
      if (cancelled) return;
      if (gmailRes.ok) {
        const json = (await gmailRes.json()) as {
          configured?: boolean;
          connected?: boolean;
          email?: string | null;
          canSend?: boolean;
          needsReconnect?: boolean;
        };
        setGmailConfigured(Boolean(json.configured));
        setGmailConnected(Boolean(json.connected));
        setGmailCanSend(Boolean(json.canSend));
        setGmailEmail(json.email || null);
        if (json.needsReconnect) {
          setGmailNotice(
            "Gmail is connected, but send permission is missing. Disconnect, add the gmail.send scope in Google Cloud, then reconnect."
          );
        }
      }
      if (outlookRes.ok) {
        const json = (await outlookRes.json()) as {
          configured?: boolean;
          connected?: boolean;
          email?: string | null;
          canSend?: boolean;
          needsReconnect?: boolean;
        };
        setOutlookConfigured(Boolean(json.configured));
        setOutlookConnected(Boolean(json.connected));
        setOutlookCanSend(Boolean(json.canSend));
        setOutlookEmail(json.email || null);
        if (json.needsReconnect) {
          setOutlookNotice(
            "Outlook is connected, but send permission is missing. Disconnect, add Mail.Send in Azure, then reconnect."
          );
        }
      }
      if (stripeRes.ok) {
        const json = (await stripeRes.json()) as {
          configured?: boolean;
          connected?: boolean;
          ready?: boolean;
        };
        setStripeConfigured(Boolean(json.configured));
        setStripeConnected(Boolean(json.connected));
        setStripeReady(Boolean(json.ready));
      }
    }
    void loadIntegrations();
    return () => {
      cancelled = true;
    };
  }, [section]);

  useEffect(() => {
    if (section !== "billing") return;
    let cancelled = false;
    async function loadBilling() {
      const res = await fetch("/api/stripe/billing/status");
      if (!res.ok || cancelled) return;
      const json = await res.json();
      if (cancelled) return;
      setBillingConfigured(Boolean(json.configured));
      setBillingActive(Boolean(json.active));
      setBillingPlanLabel(json.planLabel || "Free");
      setBillingStatus(json.status || null);
    }
    void loadBilling();
    return () => {
      cancelled = true;
    };
  }, [section]);

  async function handleGmailDisconnect() {
    setGmailBusy(true);
    setGmailNotice(null);
    const res = await fetch("/api/gmail/disconnect", { method: "POST" });
    setGmailBusy(false);
    if (!res.ok) {
      const json = await res.json();
      setGmailNotice(json.error || "Failed to disconnect Gmail.");
      return;
    }
    setGmailConnected(false);
    setGmailCanSend(false);
    setGmailEmail(null);
    setGmailNotice("Gmail disconnected. Emails will use Rebban’s sender again.");
  }

  async function handleOutlookDisconnect() {
    setOutlookBusy(true);
    setOutlookNotice(null);
    const res = await fetch("/api/outlook/disconnect", { method: "POST" });
    setOutlookBusy(false);
    if (!res.ok) {
      const json = await res.json();
      setOutlookNotice(json.error || "Failed to disconnect Outlook.");
      return;
    }
    setOutlookConnected(false);
    setOutlookCanSend(false);
    setOutlookEmail(null);
    setOutlookNotice(
      "Outlook disconnected. Emails will use Rebban’s sender again."
    );
  }

  async function handleStripeConnect() {
    setStripeBusy(true);
    setStripeNotice(null);
    try {
      const res = await fetch("/api/stripe/connect/onboard", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.url || typeof json.url !== "string") {
        setStripeNotice(json.error || "Could not start Stripe onboarding.");
        return;
      }
      const next = new URL(json.url);
      window.location.assign(next.toString());
    } catch (err) {
      setStripeNotice(
        err instanceof Error ? err.message : "Could not start Stripe onboarding."
      );
    } finally {
      setStripeBusy(false);
    }
  }

  async function handleStripeDashboard() {
    setStripeBusy(true);
    setStripeNotice(null);
    const res = await fetch("/api/stripe/connect/dashboard", { method: "POST" });
    const json = await res.json();
    setStripeBusy(false);
    if (!res.ok || !json.url) {
      setStripeNotice(json.error || "Could not open Stripe Dashboard.");
      return;
    }
    window.open(json.url as string, "_blank", "noopener,noreferrer");
  }

  async function handleBillingPortal() {
    setBillingBusy(true);
    setBillingNotice(null);
    const res = await fetch("/api/stripe/billing/portal", { method: "POST" });
    const json = await res.json();
    setBillingBusy(false);
    if (!res.ok || !json.url) {
      setBillingNotice(json.error || "Could not open billing portal.");
      return;
    }
    window.location.href = json.url as string;
  }

  function flashSaved() {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  }

  async function handleAvatarChange(file: File | null) {
    if (!file || !userId) return;

    if (!file.type.startsWith("image/")) {
      setError("Please choose a PNG or JPG image.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Image must be 2MB or smaller.");
      return;
    }

    setUploading(true);
    setError(null);

    const supabase = createClient();
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${userId}/avatar.${ext === "jpeg" ? "jpg" : ext}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      setError(uploadError.message);
      setUploading(false);
      return;
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_url: path })
      .eq("id", userId);

    if (updateError) {
      setError(updateError.message);
      setUploading(false);
      return;
    }

    await refresh();
    setUploading(false);
    flashSaved();
  }

  async function handleLogoChange(file: File | null) {
    if (!file || !organizationId) return;

    if (!file.type.startsWith("image/")) {
      setError("Please choose a PNG or JPG image.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Image must be 2MB or smaller.");
      return;
    }

    setUploading(true);
    setError(null);

    const supabase = createClient();
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${organizationId}/logo.${ext === "jpeg" ? "jpg" : ext}`;

    const { error: uploadError } = await supabase.storage
      .from("org-assets")
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      setError(uploadError.message);
      setUploading(false);
      return;
    }

    const { error: updateError } = await supabase
      .from("organizations")
      .update({ logo_url: path })
      .eq("id", organizationId);

    if (updateError) {
      setError(updateError.message);
      setUploading(false);
      return;
    }

    await refresh();
    setUploading(false);
    flashSaved();
  }

  async function handleDeleteAccount() {
    if (deleteConfirm.trim().toLowerCase() !== "delete") {
      setDeleteError('Type "delete" to confirm.');
      return;
    }
    setDeletingAccount(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: deleteConfirm.trim() }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) {
        setDeleteError(json.error || "Could not delete your account.");
        setDeletingAccount(false);
        return;
      }
      const supabase = createClient();
      await supabase.auth.signOut();
      router.replace("/login");
    } catch {
      setDeleteError("Could not delete your account.");
      setDeletingAccount(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);

    const supabase = createClient();

    if (section === "profile" && userId) {
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          full_name: profile.name.trim() || null,
          title: profile.title.trim() || null,
          industry: profile.industry || null,
        })
        .eq("id", userId);

      if (updateError) {
        setError(updateError.message);
        setSaving(false);
        return;
      }

      await refresh();
    } else if (section === "branding" && organizationId) {
      const { error: updateError } = await supabase
        .from("organizations")
        .update({
          description: branding.description.trim() || null,
          website: normalizeWebsite(branding.website),
          updated_at: new Date().toISOString(),
        })
        .eq("id", organizationId);

      if (updateError) {
        setError(updateError.message);
        setSaving(false);
        return;
      }

      await refresh();
    } else if (section === "business" && organizationId) {
      const { error: updateError } = await supabase
        .from("organizations")
        .update({
          address: business.address.trim() || null,
          country: business.country || null,
          currency: business.currency || "USD",
          tax_id: business.taxId.trim() || null,
          payment_iban: normalizeIban(business.paymentIban),
          payment_bankgiro: normalizeBankgiro(business.paymentBankgiro),
          updated_at: new Date().toISOString(),
          ...(!isSolo
            ? {
                legal_name: business.company.trim() || null,
                org_number: business.orgNumber.trim() || null,
                ...(business.company.trim()
                  ? { name: business.company.trim() }
                  : {}),
              }
            : {}),
        })
        .eq("id", organizationId);

      if (updateError) {
        setError(updateError.message);
        setSaving(false);
        return;
      }

      await refresh();
    } else if (section === "notifications" && userId) {
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          notification_prefs: {
            invoice_overdue: notifications.invoiceOverdue,
            proposal_viewed: notifications.proposalViewed,
            payment_received: notifications.paymentReceived,
            weekly_digest: notifications.weeklyDigest,
          },
        })
        .eq("id", userId);

      if (updateError) {
        setError(updateError.message);
        setSaving(false);
        return;
      }
    } else if (section === "preferences" && organizationId) {
      const rate = Number(preferences.defaultHourlyRate);
      if (!Number.isFinite(rate) || rate < 0) {
        setError("Enter a valid hourly rate.");
        setSaving(false);
        return;
      }
      const { error: updateError } = await supabase
        .from("organizations")
        .update({
          default_hourly_rate: Math.round(rate * 100) / 100,
          default_reminder_sequence: preferences.reminderSequence,
          updated_at: new Date().toISOString(),
        })
        .eq("id", organizationId);

      if (updateError) {
        setError(updateError.message);
        setSaving(false);
        return;
      }
    } else if (section === "tax" && organizationId) {
      const rate = Math.max(0, Number(taxSettings.rate) || 0);
      const { error: updateError } = await supabase
        .from("organizations")
        .update({
          default_tax_enabled: taxSettings.enabled,
          default_tax_rate: rate,
          default_prices_include_tax: taxSettings.pricesIncludeTax,
          custom_tax_rates: taxSettings.customRates,
          tax_id: business.taxId.trim() || null,
        })
        .eq("id", organizationId);

      if (updateError) {
        setError(updateError.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    flashSaved();
  }

  function selectSection(id: SectionId) {
    setSection(id);
    setError(null);
    router.replace(`/settings?section=${id}`, { scroll: false });
  }

  return (
    <main className="w-full px-4 pt-6 pb-10 md:px-8 md:pt-10 md:pb-8 md:pr-36 max-w-7xl mx-auto">
      <div className="mb-5 md:mb-8">
        <h1 className="text-2xl md:text-3xl font-semibold text-gray-900 tracking-tight">
          Settings
        </h1>
        <p className="text-gray-500 mt-1 md:mt-1.5 text-[14px] md:text-[15px]">
          Manage your profile, branding, and workspace defaults.
        </p>
      </div>

      {/* Mobile: horizontal section tabs */}
      <nav className="lg:hidden flex gap-1 overflow-x-auto no-scrollbar mb-5 border-b border-line -mx-4 px-4">
        {sections.map(({ id, label, icon: Icon }) => {
          const active = section === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => selectSection(id)}
              className={`inline-flex items-center gap-2 px-3.5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                active
                  ? "border-[#2563EB] text-[#2563EB]"
                  : "border-transparent text-gray-500"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" strokeWidth={1.75} />
              {label}
            </button>
          );
        })}
      </nav>

      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-start">
        <aside className="hidden lg:block w-[240px] shrink-0 sticky top-8">
          <nav className="space-y-1">
            {sections.map(({ id, label, description, icon: Icon }) => {
              const active = section === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => selectSection(id)}
                  className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                    active
                      ? "bg-[#EFF6FF] text-[#2563EB]"
                      : "text-gray-700 hover:bg-[#FAFBFC]"
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 mt-0.5 shrink-0 ${active ? "text-[#2563EB]" : "text-gray-400"}`}
                    strokeWidth={1.75}
                  />
                  <span className="min-w-0">
                    <span
                      className={`block text-[14px] ${active ? "font-semibold" : "font-medium"}`}
                    >
                      {label}
                    </span>
                    <span
                      className={`block text-[12px] mt-0.5 leading-snug ${
                        active ? "text-blue-600/70" : "text-gray-400"
                      }`}
                    >
                      {description}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="flex-1 min-w-0 w-full max-w-2xl">
          <div className="surface-panel p-4 sm:p-6 md:p-7">
            {section === "profile" && (
              <Section
                title="Profile"
                subtitle="Shown on proposals and when you comment on tasks."
              >
                <div className="flex items-center gap-4 mb-6">
                  <UserAvatar
                    src={avatarUrl}
                    alt={profile.name || "Profile"}
                    size="md"
                  />
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        void handleAvatarChange(e.target.files?.[0] ?? null);
                        e.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      disabled={uploading || !userId}
                      onClick={() => fileInputRef.current?.click()}
                      className="text-sm font-medium text-[#2563EB] hover:text-[#1d4ed8] transition-colors disabled:opacity-50"
                    >
                      {uploading ? "Uploading…" : avatarUrl ? "Change photo" : "Upload photo"}
                    </button>
                    <p className="text-[12px] text-gray-400 mt-0.5">PNG or JPG up to 2MB</p>
                  </div>
                </div>
                {error && (
                  <p className="mb-4 text-[13px] text-red-600">{error}</p>
                )}
                <div className="space-y-4">
                  <Field label="Full name">
                    <input
                      value={profile.name}
                      onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Email">
                    <input
                      type="email"
                      value={profile.email}
                      readOnly
                      className={`${inputClass} bg-[#FAFBFC] text-gray-500`}
                    />
                  </Field>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Title">
                      <input
                        value={profile.title}
                        onChange={(e) =>
                          setProfile({ ...profile, title: e.target.value })
                        }
                        className={inputClass}
                        placeholder="e.g. Independent designer"
                      />
                    </Field>
                    <Field label="Industry">
                      <FancySelect
                        value={profile.industry}
                        onChange={(value) =>
                          setProfile({ ...profile, industry: value })
                        }
                        options={INDUSTRY_OPTIONS.map((option) => ({
                          value: option.value,
                          label: option.label,
                        }))}
                        placeholder="Select industry"
                        searchable
                        searchPlaceholder="Search industries…"
                      />
                    </Field>
                  </div>
                </div>

                <div className="mt-10 rounded-2xl border border-red-100 bg-red-50/60 p-4">
                  <div className="text-[14px] font-semibold text-red-900">
                    Delete account
                  </div>
                  <p className="text-[13px] text-red-800/80 mt-1 leading-relaxed">
                    Permanently delete your account and personal data. Workspaces
                    you own are soft-deleted and any active subscription is
                    canceled. This cannot be undone.
                  </p>
                  {deleteError && (
                    <p className="mt-2 text-[13px] text-red-700">{deleteError}</p>
                  )}
                  <label className="block mt-3">
                    <span className="block text-[12px] font-medium text-red-900 mb-1.5">
                      Type delete to confirm
                    </span>
                    <input
                      value={deleteConfirm}
                      onChange={(e) => setDeleteConfirm(e.target.value)}
                      className="w-full border border-red-200 rounded-xl px-3 py-2.5 text-sm bg-white outline-none focus:border-red-300"
                      placeholder="delete"
                      autoComplete="off"
                      disabled={deletingAccount}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={deletingAccount || !userId}
                    onClick={() => void handleDeleteAccount()}
                    className="mt-3 w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    {deletingAccount ? "Deleting…" : "Delete my account"}
                  </button>
                </div>
              </Section>
            )}

            {section === "branding" && (
              <Section
                title="Branding"
                subtitle="Shown on proposals and client-facing pages."
              >
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-14 h-14 rounded-xl border border-line bg-[#FAFBFC] overflow-hidden flex items-center justify-center shrink-0">
                    {logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={logoUrl}
                        alt="Logo"
                        className="w-full h-full object-contain p-1.5"
                      />
                    ) : (
                      <ImageIcon className="w-6 h-6 text-gray-300" strokeWidth={1.5} />
                    )}
                  </div>
                  <div>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                      className="hidden"
                      onChange={(e) => {
                        void handleLogoChange(e.target.files?.[0] ?? null);
                        e.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      disabled={uploading || !organizationId}
                      onClick={() => logoInputRef.current?.click()}
                      className="text-sm font-medium text-[#2563EB] hover:text-[#1d4ed8] transition-colors disabled:opacity-50"
                    >
                      {uploading ? "Uploading…" : logoUrl ? "Change logo" : "Upload logo"}
                    </button>
                    <p className="text-[12px] text-gray-400 mt-0.5">PNG, JPG, or SVG up to 2MB</p>
                  </div>
                </div>
                {error && section === "branding" && (
                  <p className="mb-4 text-[13px] text-red-600">{error}</p>
                )}
                <div className="space-y-4">
                  <Field label="Website">
                    <input
                      type="url"
                      value={branding.website}
                      onChange={(e) =>
                        setBranding({ ...branding, website: e.target.value })
                      }
                      placeholder="https://yourstudio.com"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="About you">
                    <textarea
                      value={branding.description}
                      onChange={(e) =>
                        setBranding({ ...branding, description: e.target.value })
                      }
                      rows={5}
                      placeholder="A short description clients see on your proposals…"
                      className={`${inputClass} resize-none`}
                    />
                  </Field>
                </div>
              </Section>
            )}

            {section === "business" && (
              <Section
                title="Business"
                subtitle="Used on invoices, proposals, and tax documents."
              >
                <div className="space-y-4">
                  {!isSolo && (
                    <>
                      <Field label="Company name">
                        <input
                          value={business.company}
                          onChange={(e) =>
                            setBusiness({ ...business, company: e.target.value })
                          }
                          className={inputClass}
                        />
                      </Field>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label="Org number">
                          <input
                            value={business.orgNumber}
                            onChange={(e) =>
                              setBusiness({
                                ...business,
                                orgNumber: e.target.value,
                              })
                            }
                            className={inputClass}
                          />
                        </Field>
                        <Field label="Tax ID / VAT">
                          <input
                            value={business.taxId}
                            onChange={(e) =>
                              setBusiness({ ...business, taxId: e.target.value })
                            }
                            className={inputClass}
                          />
                        </Field>
                      </div>
                    </>
                  )}
                  {isSolo && (
                    <Field label="Tax ID / VAT">
                      <input
                        value={business.taxId}
                        onChange={(e) =>
                          setBusiness({ ...business, taxId: e.target.value })
                        }
                        className={inputClass}
                        placeholder="Optional"
                      />
                    </Field>
                  )}
                  <Field label="Address">
                    <textarea
                      value={business.address}
                      onChange={(e) =>
                        setBusiness({ ...business, address: e.target.value })
                      }
                      rows={2}
                      className={`${inputClass} resize-none`}
                    />
                  </Field>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Country">
                      <FancySelect
                        value={business.country}
                        onChange={(value) =>
                          setBusiness({ ...business, country: value })
                        }
                        options={COUNTRY_OPTIONS.map((option) => ({
                          value: option.code,
                          label: option.label,
                        }))}
                        placeholder="Select country"
                        searchable
                        searchPlaceholder="Search countries…"
                      />
                    </Field>
                    <Field label="Default currency">
                      <FancySelect
                        value={business.currency}
                        onChange={(value) =>
                          setBusiness({ ...business, currency: value })
                        }
                        options={CURRENCY_OPTIONS.map((code) => ({
                          value: code,
                          label: code,
                        }))}
                        placeholder="Select currency"
                      />
                    </Field>
                  </div>
                  <div className="pt-2 border-t border-line">
                    <div className="text-[13px] font-medium text-gray-900 mb-1">
                      Bank transfer details
                    </div>
                    <p className="text-[12px] text-gray-400 mb-3">
                      Shown on invoices when Stripe isn’t connected, so clients
                      can pay by transfer.
                    </p>
                    <div className="space-y-4">
                      <Field label="IBAN">
                        <input
                          value={business.paymentIban}
                          onChange={(e) =>
                            setBusiness({
                              ...business,
                              paymentIban: e.target.value,
                            })
                          }
                          className={inputClass}
                          placeholder="SE45 5000 0000 0583 9825 7466"
                          autoComplete="off"
                          spellCheck={false}
                        />
                      </Field>
                      {(business.country === "SE" ||
                        business.paymentBankgiro) && (
                        <Field label="Bankgiro">
                          <input
                            value={business.paymentBankgiro}
                            onChange={(e) =>
                              setBusiness({
                                ...business,
                                paymentBankgiro: e.target.value,
                              })
                            }
                            className={inputClass}
                            placeholder="123-4567"
                            autoComplete="off"
                            spellCheck={false}
                          />
                          <p className="text-[12px] text-gray-400 mt-1.5">
                            Optional — common for Swedish freelancers.
                          </p>
                        </Field>
                      )}
                    </div>
                  </div>
                </div>
              </Section>
            )}

            {section === "notifications" && (
              <Section
                title="Notifications"
                subtitle="Choose which alerts show in the sidebar and email."
              >
                <div className="space-y-1">
                  <ToggleRow
                    label="Invoice overdue"
                    description="When a client invoice passes its due date"
                    active={notifications.invoiceOverdue}
                    onChange={(v) =>
                      setNotifications({ ...notifications, invoiceOverdue: v })
                    }
                  />
                  <ToggleRow
                    label="Proposal viewed"
                    description="When a client opens a sent proposal"
                    active={notifications.proposalViewed}
                    onChange={(v) =>
                      setNotifications({ ...notifications, proposalViewed: v })
                    }
                  />
                  <ToggleRow
                    label="Payment received"
                    description="When Stripe confirms a payment"
                    active={notifications.paymentReceived}
                    onChange={(v) =>
                      setNotifications({ ...notifications, paymentReceived: v })
                    }
                  />
                  <ToggleRow
                    label="Weekly digest"
                    description="Monday summary of unbilled time and open work"
                    active={notifications.weeklyDigest}
                    onChange={(v) =>
                      setNotifications({ ...notifications, weeklyDigest: v })
                    }
                  />
                </div>
              </Section>
            )}

            {section === "tax" && (
              <Section
                title="Tax"
                subtitle="Tell Rebban whether you charge tax or VAT. When enabled, new invoices turn tax options on by default."
              >
                <div className="space-y-5">
                  <ToggleRow
                    label="I charge tax / VAT"
                    description="Turn this on if your invoices need tax. Off hides tax on new invoices."
                    active={taxSettings.enabled}
                    onChange={(v) =>
                      setTaxSettings((prev) => ({
                        ...prev,
                        enabled: v,
                        rate: v && !prev.rate ? 25 : prev.rate,
                      }))
                    }
                  />

                  {!taxSettings.enabled ? (
                    <div className="rounded-2xl border border-line bg-[#FAFBFC] px-4 py-3.5 text-[13px] text-gray-500 leading-relaxed">
                      Tax is off. Invoices won’t add tax or show a VAT number in
                      the footer unless you enable it per invoice.
                    </div>
                  ) : (
                    <>
                      <ToggleRow
                        label="Prices include tax by default"
                        description="Line item rates are tax-inclusive on new invoices"
                        active={taxSettings.pricesIncludeTax}
                        onChange={(v) =>
                          setTaxSettings((prev) => ({
                            ...prev,
                            pricesIncludeTax: v,
                          }))
                        }
                      />
                      <div>
                        <div className="text-[13px] font-medium text-gray-700 mb-2">
                          Default rate
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {TAX_RATE_PRESETS.filter((r) => r > 0).map((rate) => (
                            <button
                              key={rate}
                              type="button"
                              onClick={() =>
                                setTaxSettings((prev) => ({ ...prev, rate }))
                              }
                              className={`px-3.5 py-2 rounded-full text-sm font-medium border transition-colors ${
                                taxSettings.rate === rate
                                  ? "border-[#2563EB] bg-[#EFF6FF] text-[#2563EB]"
                                  : "border-line bg-white text-gray-700 hover:bg-gray-50"
                              }`}
                            >
                              {rate}%
                            </button>
                          ))}
                          {taxSettings.customRates.map((rate) => (
                            <button
                              key={`custom-${rate}`}
                              type="button"
                              onClick={() =>
                                setTaxSettings((prev) => ({ ...prev, rate }))
                              }
                              className={`px-3.5 py-2 rounded-full text-sm font-medium border transition-colors ${
                                taxSettings.rate === rate
                                  ? "border-[#2563EB] bg-[#EFF6FF] text-[#2563EB]"
                                  : "border-line bg-white text-gray-700 hover:bg-gray-50"
                              }`}
                            >
                              {rate}%
                            </button>
                          ))}
                        </div>
                        <p className="mt-2 text-[13px] text-gray-500">
                          Selected default:{" "}
                          <span className="font-medium text-gray-800">
                            {taxSettings.rate}%
                          </span>
                        </p>
                      </div>
                      <Field label="Add custom rate (%)">
                        <div className="flex gap-2">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.01}
                            value={taxSettings.customDraft}
                            onChange={(e) =>
                              setTaxSettings((prev) => ({
                                ...prev,
                                customDraft: e.target.value,
                              }))
                            }
                            placeholder="e.g. 12.5"
                            className={inputClass}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const value = Number(taxSettings.customDraft);
                              if (
                                !Number.isFinite(value) ||
                                value < 0 ||
                                value > 100
                              ) {
                                setError("Enter a tax rate between 0 and 100.");
                                return;
                              }
                              const rounded = Math.round(value * 100) / 100;
                              setTaxSettings((prev) => ({
                                ...prev,
                                rate: rounded,
                                customRates: prev.customRates.includes(rounded)
                                  ? prev.customRates
                                  : [...prev.customRates, rounded].sort(
                                      (a, b) => b - a
                                    ),
                                customDraft: "",
                              }));
                              setError(null);
                            }}
                            className="shrink-0 px-4 py-2.5 rounded-xl text-sm font-medium border border-line bg-white hover:bg-gray-50"
                          >
                            Add & use
                          </button>
                        </div>
                      </Field>
                      <Field label="Tax / VAT number">
                        <input
                          value={business.taxId}
                          onChange={(e) =>
                            setBusiness({ ...business, taxId: e.target.value })
                          }
                          placeholder="TAX-123456"
                          className={inputClass}
                        />
                        <p className="mt-1.5 text-[12px] text-gray-400">
                          Shown in the invoice footer when tax is active.
                        </p>
                      </Field>
                      <div className="rounded-2xl border border-line bg-[#FAFBFC] px-4 py-3.5 text-[13px] text-gray-500 leading-relaxed">
                        New invoices will enable Apply tax, Display Tax / VAT ID,
                        and your default rate automatically.
                      </div>
                    </>
                  )}
                </div>
              </Section>
            )}

            {section === "billing" && (
              <Section
                title="Billing"
                subtitle="Your Rebban plan and payment method."
              >
                {billingNotice && (
                  <p className="mb-4 text-[13px] text-gray-600 bg-[#FAFBFC] border border-line rounded-xl px-3.5 py-2.5">
                    {billingNotice}
                  </p>
                )}
                <div className="rounded-2xl border border-line bg-[#FAFBFC] p-4 sm:p-5 mb-5">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-gray-500">Current plan</div>
                      <div className="text-xl font-semibold text-gray-900 mt-1">
                        {billingPlanLabel}
                      </div>
                      <p className="text-[13px] text-gray-500 mt-1">
                        {billingActive
                          ? `Status: ${billingStatus || "active"}`
                          : "7-day free trial, then upgrade to Pro to keep full access."}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={billingBusy || (!billingActive && !billingConfigured)}
                      onClick={() => {
                        if (billingActive) {
                          void handleBillingPortal();
                          return;
                        }
                        openUpgradeModal();
                      }}
                      className="btn-primary w-full sm:w-auto px-4 py-2.5 rounded-full text-sm disabled:opacity-50"
                    >
                      {billingBusy
                        ? "Please wait…"
                        : billingActive
                          ? "Manage plan"
                          : "Upgrade"}
                    </button>
                  </div>
                </div>
                <div className="rounded-2xl border border-line p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600 shrink-0">
                      <CreditCard className="w-5 h-5" strokeWidth={1.75} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[14px] font-medium text-gray-900">
                        {billingActive ? "Payment method on file" : "No payment method"}
                      </div>
                      <div className="text-[12px] text-gray-400 mt-0.5">
                        {billingConfigured
                          ? "Managed securely in the Stripe Customer Portal"
                          : "Add STRIPE_PRICE_ID to enable paid plans"}
                      </div>
                    </div>
                  </div>
                  {billingActive && (
                    <button
                      type="button"
                      disabled={billingBusy}
                      onClick={() => void handleBillingPortal()}
                      className="text-sm font-medium text-[#2563EB] hover:text-[#1d4ed8] transition-colors self-start sm:self-auto disabled:opacity-50"
                    >
                      Update
                    </button>
                  )}
                </div>
              </Section>
            )}

            {section === "preferences" && (
              <Section
                title="Preferences"
                subtitle="Defaults for tracking time and sending invoices."
              >
                <div className="space-y-6">
                  <Field label="Default hourly rate">
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                        {business.currency || "USD"}
                      </span>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={preferences.defaultHourlyRate}
                        onChange={(e) =>
                          setPreferences({
                            ...preferences,
                            defaultHourlyRate: e.target.value,
                          })
                        }
                        className={`${inputClass} pl-14`}
                      />
                    </div>
                    <p className="text-[12px] text-gray-400 mt-1.5">
                      Used when you start a timer or add time without a custom rate.
                    </p>
                  </Field>

                  <div>
                    <div className="text-[13px] font-medium text-gray-700 mb-1.5">
                      Invoice payment reminders
                    </div>
                    <p className="text-[12px] text-gray-400 mb-3">
                      Used when you turn automation on while sending an invoice.
                      New accounts start on Standard.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {ORG_REMINDER_SEQUENCES.map((option) => {
                        const selected =
                          preferences.reminderSequence === option.key;
                        return (
                          <button
                            key={option.key}
                            type="button"
                            onClick={() =>
                              setPreferences({
                                ...preferences,
                                reminderSequence: asOrgReminderSequence(
                                  option.key
                                ),
                              })
                            }
                            className={`text-left rounded-2xl border p-3.5 transition-all ${
                              selected
                                ? "border-emerald-500 bg-emerald-50/50 ring-1 ring-emerald-200"
                                : "border-gray-200 hover:border-gray-300 bg-white"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="text-[14px] font-semibold text-gray-900">
                                {option.label}
                              </div>
                              {selected && (
                                <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
                                  <Check
                                    className="w-3 h-3"
                                    strokeWidth={2.5}
                                  />
                                </span>
                              )}
                            </div>
                            <p className="text-[12px] text-gray-500 mt-1 leading-snug">
                              {option.description}
                            </p>
                            <p className="text-[11px] font-medium text-gray-400 mt-2">
                              {option.steps
                                .map((s) =>
                                  formatReminderOffsetLabel(s.offsetDays)
                                )
                                .join(" · ")}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </Section>
            )}

            {section === "integrations" && (
              <Section
                title="Integrations"
                subtitle="Connect tools you already use to get paid and stay in sync."
              >
                {(gmailNotice || outlookNotice || stripeNotice) && (
                  <p className="mb-4 text-[13px] text-gray-600 bg-[#FAFBFC] border border-line rounded-xl px-3.5 py-2.5">
                    {stripeNotice || outlookNotice || gmailNotice}
                  </p>
                )}
                <div className="space-y-3">
                  <IntegrationRow
                    name="Gmail"
                    description={
                      gmailConnected && gmailEmail
                        ? gmailCanSend
                          ? `Sending proposals from ${gmailEmail}`
                          : `Connected as ${gmailEmail}, but missing send permission. Reconnect required.`
                        : "Send proposals and follow-ups from your Gmail"
                    }
                    connected={gmailConnected && gmailCanSend}
                    actionLabel={
                      !gmailConfigured
                        ? "Not configured"
                        : gmailBusy
                          ? "Working…"
                          : gmailConnected && !gmailCanSend
                            ? "Reconnect"
                            : undefined
                    }
                    onConnect={
                      gmailConfigured && !gmailBusy
                        ? () => {
                            window.location.href = "/api/gmail/connect";
                          }
                        : undefined
                    }
                    onDisconnect={
                      gmailConfigured && gmailConnected && !gmailBusy
                        ? () => {
                            void handleGmailDisconnect();
                          }
                        : undefined
                    }
                  />
                  <IntegrationRow
                    name="Outlook"
                    description={
                      outlookConnected && outlookEmail
                        ? outlookCanSend
                          ? `Sending proposals from ${outlookEmail}`
                          : `Connected as ${outlookEmail}, but missing send permission. Reconnect required.`
                        : "Send proposals and follow-ups from Outlook or Microsoft 365"
                    }
                    connected={outlookConnected && outlookCanSend}
                    actionLabel={
                      !outlookConfigured
                        ? "Not configured"
                        : outlookBusy
                          ? "Working…"
                          : outlookConnected && !outlookCanSend
                            ? "Reconnect"
                            : undefined
                    }
                    onConnect={
                      outlookConfigured && !outlookBusy
                        ? () => {
                            window.location.href = "/api/outlook/connect";
                          }
                        : undefined
                    }
                    onDisconnect={
                      outlookConfigured && outlookConnected && !outlookBusy
                        ? () => {
                            void handleOutlookDisconnect();
                          }
                        : undefined
                    }
                  />
                  <IntegrationRow
                    name="Stripe"
                    description={
                      !stripeConfigured
                        ? "Add STRIPE_SECRET_KEY to enable payouts"
                        : stripeReady
                          ? "Ready to collect invoice payments to your bank account"
                          : stripeConnected
                            ? "Finish onboarding to accept card payments"
                            : "Get paid to your bank account when clients pay invoices"
                    }
                    connected={stripeReady}
                    actionLabel={
                      !stripeConfigured
                        ? "Not configured"
                        : stripeBusy
                          ? "Please wait…"
                          : stripeReady
                            ? "Open dashboard"
                            : stripeConnected
                              ? "Continue setup"
                              : "Connect"
                    }
                    onConnect={
                      stripeConfigured && !stripeBusy
                        ? () => {
                            void (stripeReady
                              ? handleStripeDashboard()
                              : handleStripeConnect());
                          }
                        : undefined
                    }
                    onDisconnect={
                      stripeConfigured && stripeConnected && !stripeBusy
                        ? () => {
                            void handleStripeDashboard();
                          }
                        : undefined
                    }
                  />
                  <IntegrationRow
                    name="Google Calendar"
                    description="Block time for tracked work"
                    connected={false}
                  />
                  <IntegrationRow
                    name="Slack"
                    description="Post invoice and proposal alerts"
                    connected={false}
                  />
                </div>
                <div className="mt-6 flex items-start gap-2.5 rounded-xl bg-[#FAFBFC] border border-line px-3.5 py-3">
                  <Shield className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                  <p className="text-[13px] text-gray-500 leading-relaxed">
                    Gmail and Outlook use OAuth with send-only access. Rebban
                    never stores your password, and we only send emails you
                    choose to send. If neither mailbox is connected, emails
                    still send via Rebban.
                  </p>
                </div>
              </Section>
            )}

            {section !== "integrations" && section !== "billing" && (
              <div className="mt-6 md:mt-8 pt-5 border-t border-line flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3">
                {saved && (
                  <span className="inline-flex items-center justify-center gap-1.5 text-[13px] font-medium text-emerald-600">
                    <Check className="w-3.5 h-3.5" />
                    Saved
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving || uploading}
                  className="btn-primary w-full sm:w-auto px-5 py-3 sm:py-2.5 rounded-xl text-sm disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-base sm:text-lg font-semibold text-gray-900 tracking-tight">
        {title}
      </h2>
      <p className="text-sm text-gray-500 mt-1 mb-5 sm:mb-6">{subtitle}</p>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[13px] font-medium text-gray-700 mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function ToggleRow({
  label,
  description,
  active,
  onChange,
}: {
  label: string;
  description: string;
  active: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-1 py-3.5 border-b border-line last:border-0">
      <div className="min-w-0">
        <div className="text-[14px] font-medium text-gray-900">{label}</div>
        <div className="text-[13px] text-gray-500 mt-0.5">{description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={active}
        onClick={() => onChange(!active)}
        className={`w-11 h-6 rounded-full flex items-center p-0.5 transition-colors shrink-0 ${
          active ? "bg-[#2563EB]" : "bg-gray-300"
        }`}
      >
        <span
          className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${
            active ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

function IntegrationRow({
  name,
  description,
  connected,
  actionLabel,
  onConnect,
  onDisconnect,
}: {
  name: string;
  description: string;
  connected: boolean;
  actionLabel?: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-line px-4 py-3.5">
      <div className="min-w-0">
        <div className="text-[14px] font-medium text-gray-900">{name}</div>
        <div className="text-[13px] text-gray-500 mt-0.5 leading-snug">{description}</div>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
        {connected ? (
          <>
            <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-emerald-700 bg-[#F3FAF6] px-3 py-1.5 rounded-full">
              <Check className="w-3.5 h-3.5" />
              Connected
            </span>
            {onDisconnect && (
              <button
                type="button"
                onClick={onDisconnect}
                className="text-sm font-medium text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-full hover:bg-gray-50 transition-colors"
              >
                {actionLabel || "Disconnect"}
              </button>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={onConnect}
            disabled={!onConnect}
            className="text-sm font-medium text-[#2563EB] hover:text-[#1d4ed8] px-3 py-2 sm:py-1.5 rounded-full hover:bg-[#EFF6FF] transition-colors disabled:opacity-50 disabled:hover:bg-transparent"
          >
            {actionLabel || "Connect"}
          </button>
        )}
      </div>
    </div>
  );
}
