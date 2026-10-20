"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  User,
  Building2,
  Bell,
  CreditCard,
  Zap,
  Link2,
  Shield,
  Check,
  Sparkles,
  ImageIcon,
  Receipt,
  Trash2,
  Download,
  Scale,
  ExternalLink,
  Cookie,
  FileText,
  CircleDollarSign,
} from "lucide-react";
import { openCookiePreferences } from "@/lib/cookies/consent";
import { trackSubscribed } from "@/lib/analytics/track";
import { TAX_RATE_PRESETS } from "@/lib/invoices/totals";
import {
  formatIbanDisplay,
  maskIbanInput,
  maskPaymentPhoneInput,
  normalizeBankgiro,
  normalizeIban,
  normalizePaymentPhone,
} from "@/lib/invoices/payment-details";
import {
  ORG_REMINDER_SEQUENCES,
  asOrgReminderSequence,
  formatReminderOffsetLabel,
  type ReminderSequenceKey,
} from "@/lib/invoices/reminders";
import {
  ORG_FOLLOW_UP_SEQUENCES,
  asOrgFollowUpSequence,
  type FollowUpSequenceKey,
} from "@/lib/proposals/followups";
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
  | "invoicing"
  | "preferences"
  | "integrations"
  | "legal";

const SETTINGS_SECTIONS: SectionId[] = [
  "profile",
  "business",
  "branding",
  "notifications",
  "billing",
  "invoicing",
  "preferences",
  "integrations",
  "legal",
];

function resolveSettingsSection(raw: string | null): SectionId {
  if (raw === "tax") return "invoicing";
  if (raw && (SETTINGS_SECTIONS as string[]).includes(raw)) {
    return raw as SectionId;
  }
  return "profile";
}

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
  const { openUpgradeModal, refreshBilling, pastDue } = useBilling();
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
      id: "invoicing",
      label: "Invoicing",
      description: "Rates, tax, and bank details",
      icon: Receipt,
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
      description: "Your Rebban plan",
      icon: CreditCard,
    },
    {
      id: "preferences",
      label: "Automations",
      description: "Invoice and proposal sequences",
      icon: Zap,
    },
    {
      id: "integrations",
      label: "Integrations",
      description: "Stripe, calendar, and more",
      icon: Link2,
    },
    {
      id: "legal",
      label: "Legal",
      description: "Terms, privacy, and account",
      icon: Scale,
    },
  ];

  const [section, setSection] = useState<SectionId>(() =>
    resolveSettingsSection(searchParams.get("section"))
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
  const [billingPlanLabel, setBillingPlanLabel] = useState("Trial");
  const [billingStatus, setBillingStatus] = useState<string | null>(null);
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingNotice, setBillingNotice] = useState<string | null>(null);
  const [billingCancelAtPeriodEnd, setBillingCancelAtPeriodEnd] =
    useState(false);
  const [billingPeriodEnd, setBillingPeriodEnd] = useState<string | null>(null);
  const [billingPaymentMethod, setBillingPaymentMethod] = useState<
    string | null
  >(null);
  const [billingInvoices, setBillingInvoices] = useState<
    Array<{
      id: string;
      number: string | null;
      status: string;
      amountLabel: string;
      createdAt: string;
      hostedInvoiceUrl: string | null;
      invoicePdf: string | null;
    }>
  >([]);
  const [billingInvoicesLoading, setBillingInvoicesLoading] = useState(false);
  const [billingSectionReady, setBillingSectionReady] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
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
    paymentSwish: "",
    paymentMbway: "",
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
    proposalFollowUpSequence: "standard" as Exclude<
      FollowUpSequenceKey,
      "none"
    >,
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
          "name, legal_name, address, country, website, org_number, default_tax_rate, default_tax_enabled, default_prices_include_tax, custom_tax_rates, tax_id, currency, default_hourly_rate, default_reminder_sequence, default_proposal_followup_sequence, payment_iban, payment_bankgiro, payment_swish, payment_mbway"
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
        paymentIban: formatIbanDisplay(data.payment_iban) || "",
        paymentBankgiro: data.payment_bankgiro || "",
        paymentSwish: normalizePaymentPhone(data.payment_swish) || "",
        paymentMbway: normalizePaymentPhone(data.payment_mbway) || "",
      }));
      setBranding((prev) => ({
        ...prev,
        website: data.website || "",
      }));
      setPreferences({
        defaultHourlyRate: String(Number(data.default_hourly_rate || 95)),
        reminderSequence: asOrgReminderSequence(data.default_reminder_sequence),
        proposalFollowUpSequence: asOrgFollowUpSequence(
          data.default_proposal_followup_sequence
        ),
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
      setBillingNotice("Subscription active. Syncing your plan…");
      const dedupeKey = "rebban_tracked_subscribed";
      if (
        typeof sessionStorage !== "undefined" &&
        !sessionStorage.getItem(dedupeKey)
      ) {
        sessionStorage.setItem(dedupeKey, "1");
        trackSubscribed({ plan: "pro" });
      }
      void (async () => {
        try {
          await fetch("/api/stripe/billing/sync", { method: "POST" });
        } catch {
          // status load still is the source of truth
        }
        await refreshBilling();
        setBillingNotice("You're on Pro. Thanks for subscribing.");
      })();
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
    if (section !== "billing") {
      setBillingSectionReady(false);
      return;
    }
    let cancelled = false;
    async function loadBilling() {
      setBillingSectionReady(false);
      setBillingInvoicesLoading(false);
      try {
        const res = await fetch("/api/stripe/billing/status");
        if (!res.ok || cancelled) return;
        const json = await res.json();
        if (cancelled) return;
        setBillingConfigured(Boolean(json.configured));
        setBillingActive(Boolean(json.active));
        setBillingPlanLabel(json.planLabel || "Trial");
        setBillingStatus(json.status || null);
        setBillingCancelAtPeriodEnd(Boolean(json.cancelAtPeriodEnd));
        setBillingPeriodEnd(json.currentPeriodEnd || null);
        setBillingPaymentMethod(json.paymentMethodLabel || null);

        // Show plan/card UI while invoices continue loading.
        setBillingSectionReady(true);

        if (json.active || json.hasCustomer) {
          setBillingInvoicesLoading(true);
          const invRes = await fetch("/api/stripe/billing/invoices");
          if (!cancelled) {
            if (invRes.ok) {
              const invJson = await invRes.json();
              setBillingInvoices(invJson.invoices || []);
            } else {
              setBillingInvoices([]);
            }
          }
        } else if (!cancelled) {
          setBillingInvoices([]);
        }
      } finally {
        if (!cancelled) {
          setBillingInvoicesLoading(false);
          setBillingSectionReady(true);
        }
      }
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
      setBillingNotice(json.error || "Could not open card update.");
      return;
    }
    window.location.href = json.url as string;
  }

  async function refreshBillingSection() {
    const res = await fetch("/api/stripe/billing/status");
    if (!res.ok) return;
    const json = await res.json();
    setBillingConfigured(Boolean(json.configured));
    setBillingActive(Boolean(json.active));
    setBillingPlanLabel(json.planLabel || "Trial");
    setBillingStatus(json.status || null);
    setBillingCancelAtPeriodEnd(Boolean(json.cancelAtPeriodEnd));
    setBillingPeriodEnd(json.currentPeriodEnd || null);
    setBillingPaymentMethod(json.paymentMethodLabel || null);
    await refreshBilling();
  }

  async function handleCancelSubscription() {
    setBillingBusy(true);
    setBillingNotice(null);
    const res = await fetch("/api/stripe/billing/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const json = await res.json().catch(() => ({}));
    setBillingBusy(false);
    if (!res.ok) {
      setBillingNotice(json.error || "Could not cancel subscription.");
      return;
    }
    setCancelConfirm(false);
    setBillingCancelAtPeriodEnd(true);
    if (json.currentPeriodEnd) setBillingPeriodEnd(json.currentPeriodEnd);
    setBillingNotice(
      json.currentPeriodEnd
        ? `Subscription will end on ${new Date(
            json.currentPeriodEnd
          ).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}. You’ll keep access until then.`
        : "Subscription set to cancel at the end of the billing period."
    );
    await refreshBillingSection();
  }

  async function handleReactivateSubscription() {
    setBillingBusy(true);
    setBillingNotice(null);
    const res = await fetch("/api/stripe/billing/reactivate", {
      method: "POST",
    });
    const json = await res.json().catch(() => ({}));
    setBillingBusy(false);
    if (!res.ok) {
      setBillingNotice(json.error || "Could not reactivate subscription.");
      return;
    }
    setBillingCancelAtPeriodEnd(false);
    setBillingNotice("Subscription reactivated. You’re staying on Pro.");
    await refreshBillingSection();
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
    } else if (section === "invoicing" && organizationId) {
      const hourly = Number(preferences.defaultHourlyRate);
      if (!Number.isFinite(hourly) || hourly < 0) {
        setError("Enter a valid hourly rate.");
        setSaving(false);
        return;
      }
      const taxRate = Math.max(0, Number(taxSettings.rate) || 0);
      const { error: updateError } = await supabase
        .from("organizations")
        .update({
          default_hourly_rate: Math.round(hourly * 100) / 100,
          payment_iban: normalizeIban(business.paymentIban),
          payment_bankgiro:
            business.country === "SE"
              ? normalizeBankgiro(business.paymentBankgiro)
              : null,
          payment_swish:
            business.country === "SE"
              ? normalizePaymentPhone(business.paymentSwish)
              : null,
          payment_mbway:
            business.country === "PT"
              ? normalizePaymentPhone(business.paymentMbway)
              : null,
          default_tax_enabled: taxSettings.enabled,
          default_tax_rate: taxRate,
          default_prices_include_tax: taxSettings.pricesIncludeTax,
          custom_tax_rates: taxSettings.customRates,
          tax_id: business.taxId.trim() || null,
          updated_at: new Date().toISOString(),
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
      const { error: updateError } = await supabase
        .from("organizations")
        .update({
          default_reminder_sequence: preferences.reminderSequence,
          default_proposal_followup_sequence:
            preferences.proposalFollowUpSequence,
          updated_at: new Date().toISOString(),
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
                subtitle="Company identity shown on invoices and proposals."
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

            {section === "invoicing" && (
              <Section
                title="Invoicing"
                subtitle="Defaults for rates, tax, and how clients can pay by bank transfer."
              >
                <div className="space-y-8">
                  <div>
                    <div className="text-[13px] font-semibold text-gray-900 mb-1">
                      Rates
                    </div>
                    <p className="text-[12px] text-gray-400 mb-3">
                      Used when you track time without a custom rate.
                    </p>
                    <Field label="Default hourly rate">
                      <div className="relative max-w-xs">
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
                    </Field>
                  </div>

                  <div className="border-t border-line pt-6">
                    <div className="text-[13px] font-semibold text-gray-900 mb-1">
                      Manual payment details
                    </div>
                    <p className="text-[12px] text-gray-400 mb-3">
                      Shown on invoices so clients can pay you outside Stripe
                      (bank transfer, Swish, MB Way, etc.).
                    </p>
                    <div className="mb-4 rounded-xl border border-amber-100 bg-amber-50/70 px-3.5 py-3 text-[12px] text-amber-900/80 leading-relaxed">
                      These options are not tracked automatically. When a client
                      pays this way, mark the invoice as paid yourself in
                      Rebban.
                    </div>
                    <div className="space-y-4">
                      <Field label="IBAN">
                        <input
                          value={business.paymentIban}
                          onChange={(e) =>
                            setBusiness({
                              ...business,
                              paymentIban: maskIbanInput(e.target.value),
                            })
                          }
                          className={`${inputClass} font-mono tracking-wide`}
                          placeholder="SE45 5000 0000 0583 9825 7466"
                          inputMode="text"
                          autoComplete="off"
                          spellCheck={false}
                          maxLength={42}
                        />
                      </Field>
                      {business.country === "SE" && (
                        <>
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
                          <Field label="Swish">
                            <input
                              value={business.paymentSwish}
                              onChange={(e) =>
                                setBusiness({
                                  ...business,
                                  paymentSwish: maskPaymentPhoneInput(
                                    e.target.value
                                  ),
                                })
                              }
                              className={`${inputClass} font-mono tracking-wide`}
                              placeholder="+46 70 123 45 67"
                              inputMode="tel"
                              autoComplete="tel"
                              spellCheck={false}
                            />
                            <p className="text-[12px] text-gray-400 mt-1.5">
                              Phone number linked to your Swish account.
                            </p>
                          </Field>
                        </>
                      )}
                      {business.country === "PT" && (
                        <Field label="MB Way">
                          <input
                            value={business.paymentMbway}
                            onChange={(e) =>
                              setBusiness({
                                ...business,
                                paymentMbway: maskPaymentPhoneInput(
                                  e.target.value
                                ),
                              })
                            }
                            className={`${inputClass} font-mono tracking-wide`}
                            placeholder="+351 912 345 678"
                            inputMode="tel"
                            autoComplete="tel"
                            spellCheck={false}
                          />
                          <p className="text-[12px] text-gray-400 mt-1.5">
                            Phone number linked to your MB Way account.
                          </p>
                        </Field>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-line pt-6 space-y-5">
                    <div>
                      <div className="text-[13px] font-semibold text-gray-900 mb-1">
                        Tax
                      </div>
                      <p className="text-[12px] text-gray-400">
                        When enabled, new invoices turn tax options on by
                        default.
                      </p>
                    </div>
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
                        Tax is off. Invoices won’t add tax or show a VAT number
                        in the footer unless you enable it per invoice.
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
                            {TAX_RATE_PRESETS.filter((r) => r > 0).map(
                              (rate) => (
                                <button
                                  key={rate}
                                  type="button"
                                  onClick={() =>
                                    setTaxSettings((prev) => ({
                                      ...prev,
                                      rate,
                                    }))
                                  }
                                  className={`px-3.5 py-2 rounded-full text-sm font-medium border transition-colors ${
                                    taxSettings.rate === rate
                                      ? "border-[#2563EB] bg-[#EFF6FF] text-[#2563EB]"
                                      : "border-line bg-white text-gray-700 hover:bg-gray-50"
                                  }`}
                                >
                                  {rate}%
                                </button>
                              )
                            )}
                            {taxSettings.customRates.map((rate) => (
                              <button
                                key={`custom-${rate}`}
                                type="button"
                                onClick={() =>
                                  setTaxSettings((prev) => ({
                                    ...prev,
                                    rate,
                                  }))
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
                                  setError(
                                    "Enter a tax rate between 0 and 100."
                                  );
                                  return;
                                }
                                const rounded = Math.round(value * 100) / 100;
                                setTaxSettings((prev) => ({
                                  ...prev,
                                  rate: rounded,
                                  customRates: prev.customRates.includes(
                                    rounded
                                  )
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
                              setBusiness({
                                ...business,
                                taxId: e.target.value,
                              })
                            }
                            placeholder="TAX-123456"
                            className={inputClass}
                          />
                          <p className="mt-1.5 text-[12px] text-gray-400">
                            Shown in the invoice footer when tax is active.
                          </p>
                        </Field>
                        <div className="rounded-2xl border border-line bg-[#FAFBFC] px-4 py-3.5 text-[13px] text-gray-500 leading-relaxed">
                          New invoices will enable Apply tax, Display Tax / VAT
                          ID, and your default rate automatically.
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </Section>
            )}

            {section === "billing" && (
              <Section
                title="Billing"
                subtitle="Your Rebban plan and subscription."
              >
                {!billingSectionReady ? (
                  <BillingSkeleton />
                ) : (
                  <>
                {billingNotice && (
                  <p className="mb-4 text-[13px] text-gray-600 bg-[#FAFBFC] border border-line rounded-xl px-3.5 py-2.5">
                    {billingNotice}
                  </p>
                )}
                {pastDue && (
                  <p className="mb-4 text-[13px] text-amber-950 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5">
                    Your last payment failed. Update your card below — you keep
                    Pro while Stripe retries.
                  </p>
                )}
                <div className="rounded-2xl border border-line bg-[#FAFBFC] p-4 sm:p-5 mb-5">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-gray-500">
                        Current plan
                      </div>
                      <div className="text-xl font-semibold text-gray-900 mt-1">
                        {billingPlanLabel}
                        {pastDue ? " · Past due" : ""}
                      </div>
                      <p className="text-[13px] text-gray-500 mt-1">
                        {billingActive
                          ? pastDue
                            ? "Payment failed — update your card to avoid losing access."
                            : billingCancelAtPeriodEnd && billingPeriodEnd
                            ? `Cancels ${new Date(
                                billingPeriodEnd
                              ).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })} · access until then`
                            : billingPeriodEnd
                              ? `Renews ${new Date(
                                  billingPeriodEnd
                                ).toLocaleDateString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })}`
                              : `Status: ${billingStatus || "active"}`
                          : billingPlanLabel === "Trial ended"
                            ? "Your 7-day trial has ended. Upgrade to Pro to keep full access."
                            : "You're on a 7-day trial. Upgrade to Pro anytime to keep full access."}
                      </p>
                    </div>
                    {!billingActive && (
                      <button
                        type="button"
                        disabled={billingBusy || !billingConfigured}
                        onClick={() => openUpgradeModal()}
                        className="btn-primary w-full sm:w-auto px-4 py-2.5 rounded-full text-sm disabled:opacity-50"
                      >
                        Upgrade
                      </button>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-line p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-5">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600 shrink-0">
                      <CreditCard className="w-5 h-5" strokeWidth={1.75} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[14px] font-medium text-gray-900">
                        {billingPaymentMethod ||
                          (billingActive
                            ? "Payment method on file"
                            : "No payment method")}
                      </div>
                      <div className="text-[12px] text-gray-400 mt-0.5">
                        {billingConfigured
                          ? "Card updates are handled securely by Stripe"
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
                      Update card
                    </button>
                  )}
                </div>

                {(billingActive ||
                  billingInvoicesLoading ||
                  billingInvoices.length > 0) && (
                  <div className="rounded-2xl border border-line overflow-hidden mb-5 min-w-0">
                    <div className="px-4 sm:px-5 py-3.5 border-b border-line bg-[#FAFBFC]">
                      <div className="text-[14px] font-semibold text-gray-900">
                        Invoices
                      </div>
                      <p className="text-[12px] text-gray-500 mt-0.5">
                        Your Rebban subscription receipts.
                      </p>
                    </div>
                    {billingInvoicesLoading ? (
                      <BillingInvoicesSkeleton />
                    ) : billingInvoices.length === 0 ? (
                      <p className="px-4 sm:px-5 py-8 text-sm text-gray-400 text-center">
                        No invoices yet.
                      </p>
                    ) : (
                      <ul className="divide-y divide-line">
                        {billingInvoices.map((inv) => (
                          <li
                            key={inv.id}
                            className="px-4 sm:px-5 py-3.5 flex items-center gap-3 min-w-0"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="text-[14px] font-medium text-gray-900 truncate">
                                {inv.number || "Invoice"}
                              </div>
                              <div className="text-[12px] text-gray-500 mt-0.5">
                                {new Date(inv.createdAt).toLocaleDateString(
                                  undefined,
                                  {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  }
                                )}
                                {" · "}
                                <span className="capitalize">{inv.status}</span>
                                {" · "}
                                {inv.amountLabel}
                              </div>
                            </div>
                            {(inv.invoicePdf || inv.hostedInvoiceUrl) && (
                              <a
                                href={
                                  inv.invoicePdf || inv.hostedInvoiceUrl || "#"
                                }
                                target="_blank"
                                rel="noreferrer"
                                className="shrink-0 inline-flex items-center gap-1.5 text-sm font-medium text-[#2563EB] hover:text-[#1d4ed8]"
                              >
                                <Download className="w-4 h-4" />
                                PDF
                              </a>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {billingActive && (
                  <div className="rounded-2xl border border-red-100 bg-red-50/40 p-4 sm:p-5">
                    <div className="text-[14px] font-semibold text-gray-900">
                      Cancel subscription
                    </div>
                    <p className="text-[13px] text-gray-600 mt-1 leading-relaxed">
                      {billingCancelAtPeriodEnd
                        ? "Your plan is already set to end after this billing period. You can keep Pro by reactivating."
                        : "You’ll keep Pro until the end of the current billing period. No further charges after that."}
                    </p>
                    {billingCancelAtPeriodEnd ? (
                      <button
                        type="button"
                        disabled={billingBusy}
                        onClick={() => void handleReactivateSubscription()}
                        className="mt-3 btn-primary px-4 py-2.5 rounded-xl text-sm disabled:opacity-50"
                      >
                        {billingBusy ? "Please wait…" : "Keep Pro"}
                      </button>
                    ) : cancelConfirm ? (
                      <div className="mt-3 flex flex-col sm:flex-row gap-2">
                        <button
                          type="button"
                          disabled={billingBusy}
                          onClick={() => void handleCancelSubscription()}
                          className="inline-flex items-center justify-center rounded-xl bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          {billingBusy
                            ? "Canceling…"
                            : "Confirm cancel at period end"}
                        </button>
                        <button
                          type="button"
                          disabled={billingBusy}
                          onClick={() => setCancelConfirm(false)}
                          className="inline-flex items-center justify-center rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          Never mind
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={billingBusy}
                        onClick={() => setCancelConfirm(true)}
                        className="mt-3 inline-flex items-center justify-center rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        Cancel subscription
                      </button>
                    )}
                  </div>
                )}
                  </>
                )}
              </Section>
            )}

            {section === "preferences" && (
              <Section
                title="Automations"
                subtitle="Default sequences when you turn automation on while sending. You can still change them per send."
              >
                <div className="space-y-5">
                  <AutomationPanel
                    icon={CircleDollarSign}
                    iconClassName="bg-emerald-50 text-emerald-600"
                    title="Invoice payment reminders"
                    description="Nudges clients until the invoice is paid."
                    options={ORG_REMINDER_SEQUENCES.map((option) => ({
                      key: option.key,
                      label: option.label,
                      description: option.description,
                      steps: option.steps.map((step) =>
                        formatReminderOffsetLabel(step.offsetDays)
                      ),
                    }))}
                    value={preferences.reminderSequence}
                    onChange={(key) =>
                      setPreferences({
                        ...preferences,
                        reminderSequence: asOrgReminderSequence(key),
                      })
                    }
                  />
                  <AutomationPanel
                    icon={FileText}
                    iconClassName="bg-[#EFF6FF] text-[#2563EB]"
                    title="Proposal follow-ups"
                    description="Follows up if a proposal hasn’t been accepted yet."
                    options={ORG_FOLLOW_UP_SEQUENCES.map((option) => ({
                      key: option.key,
                      label: option.label,
                      description: option.description,
                      steps: option.steps.map(
                        (step) => `Day ${step.delayDays}`
                      ),
                    }))}
                    value={preferences.proposalFollowUpSequence}
                    onChange={(key) =>
                      setPreferences({
                        ...preferences,
                        proposalFollowUpSequence: asOrgFollowUpSequence(key),
                      })
                    }
                  />
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
                    icon={
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src="/gmail.svg" alt="" className="w-6 h-6" />
                    }
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
                    icon={
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src="/outlook.svg" alt="" className="w-6 h-6" />
                    }
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
                    icon={
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src="/stripe.svg" alt="" className="w-6 h-6" />
                    }
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
                    icon={
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src="/google-calendar.svg"
                        alt=""
                        className="w-6 h-6"
                      />
                    }
                    description="Block time for tracked work"
                    connected={false}
                    actionLabel="Coming soon"
                  />
                  <IntegrationRow
                    name="Slack"
                    icon={
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src="/slack.svg" alt="" className="w-6 h-6" />
                    }
                    description="Post invoice and proposal alerts"
                    connected={false}
                    actionLabel="Coming soon"
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

            {section === "legal" && (
              <Section
                title="Legal"
                subtitle="Policies for Rebban and options to remove your account."
              >
                <div className="space-y-2">
                  <a
                    href="https://rebban.com/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3.5 hover:bg-[#FAFBFC] transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-[14px] font-medium text-gray-900">
                        Terms of Service
                      </div>
                      <div className="text-[13px] text-gray-500 mt-0.5">
                        Rules for using Rebban
                      </div>
                    </div>
                    <ExternalLink className="w-4 h-4 text-gray-400 shrink-0" />
                  </a>
                  <a
                    href="https://rebban.com/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3.5 hover:bg-[#FAFBFC] transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-[14px] font-medium text-gray-900">
                        Privacy Policy
                      </div>
                      <div className="text-[13px] text-gray-500 mt-0.5">
                        How we collect and use data, including analytics
                      </div>
                    </div>
                    <ExternalLink className="w-4 h-4 text-gray-400 shrink-0" />
                  </a>
                  <button
                    type="button"
                    onClick={() => openCookiePreferences()}
                    className="w-full flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3.5 hover:bg-[#FAFBFC] transition-colors text-left"
                  >
                    <div className="min-w-0 flex items-start gap-3">
                      <Cookie className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                      <div>
                        <div className="text-[14px] font-medium text-gray-900">
                          Cookie preferences
                        </div>
                        <div className="text-[13px] text-gray-500 mt-0.5">
                          Manage analytics and marketing cookies
                        </div>
                      </div>
                    </div>
                  </button>
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

            {section !== "integrations" &&
              section !== "billing" &&
              section !== "legal" && (
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

function SkeletonBar({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-md bg-gray-200/80 animate-pulse ${className}`}
      aria-hidden
    />
  );
}

function BillingInvoicesSkeleton() {
  return (
    <ul className="divide-y divide-line" aria-busy="true" aria-label="Loading invoices">
      {[0, 1, 2].map((i) => (
        <li
          key={i}
          className="px-4 sm:px-5 py-3.5 flex items-center gap-3 min-w-0"
        >
          <div className="min-w-0 flex-1 space-y-2">
            <SkeletonBar className="h-4 w-28" />
            <SkeletonBar className="h-3 w-44 max-w-full" />
          </div>
          <SkeletonBar className="h-4 w-10 shrink-0" />
        </li>
      ))}
    </ul>
  );
}

function BillingSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading billing">
      <div className="rounded-2xl border border-line bg-[#FAFBFC] p-4 sm:p-5 mb-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
          <div className="min-w-0 flex-1 space-y-2.5">
            <SkeletonBar className="h-3.5 w-24" />
            <SkeletonBar className="h-7 w-20" />
            <SkeletonBar className="h-3.5 w-56 max-w-full" />
          </div>
          <SkeletonBar className="h-10 w-full sm:w-24 rounded-full shrink-0" />
        </div>
      </div>

      <div className="rounded-2xl border border-line p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-5">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-xl bg-gray-100 shrink-0 animate-pulse" />
          <div className="min-w-0 flex-1 space-y-2">
            <SkeletonBar className="h-4 w-36 max-w-full" />
            <SkeletonBar className="h-3 w-48 max-w-full" />
          </div>
        </div>
        <SkeletonBar className="h-4 w-20 shrink-0 self-start sm:self-auto" />
      </div>

      <div className="rounded-2xl border border-line overflow-hidden mb-5 min-w-0">
        <div className="px-4 sm:px-5 py-3.5 border-b border-line bg-[#FAFBFC] space-y-2">
          <SkeletonBar className="h-4 w-20" />
          <SkeletonBar className="h-3 w-44 max-w-full" />
        </div>
        <BillingInvoicesSkeleton />
      </div>

      <div className="rounded-2xl border border-line p-4 sm:p-5 space-y-3">
        <SkeletonBar className="h-4 w-36" />
        <SkeletonBar className="h-3.5 w-full max-w-md" />
        <SkeletonBar className="h-3.5 w-3/4 max-w-sm" />
        <SkeletonBar className="mt-1 h-10 w-40 rounded-xl" />
      </div>
    </div>
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

function AutomationPanel({
  icon: Icon,
  iconClassName,
  title,
  description,
  options,
  value,
  onChange,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  iconClassName: string;
  title: string;
  description: string;
  options: {
    key: string;
    label: string;
    description: string;
    steps: string[];
  }[];
  value: string;
  onChange: (key: string) => void;
}) {
  const selected = options.find((option) => option.key === value) || options[0];

  return (
    <div className="rounded-2xl border border-line bg-white overflow-hidden">
      <div className="flex items-start gap-3 px-4 sm:px-5 pt-4 sm:pt-5 pb-4 border-b border-line bg-[#FAFBFC]">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconClassName}`}
        >
          <Icon className="w-5 h-5" strokeWidth={1.75} />
        </div>
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-gray-900 tracking-tight">
            {title}
          </h3>
          <p className="text-[13px] text-gray-500 mt-0.5 leading-snug">
            {description}
          </p>
        </div>
      </div>

      <div className="p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap gap-2">
          {options.map((option) => {
            const active = option.key === value;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => onChange(option.key)}
                className={`px-3.5 py-2 rounded-full text-sm font-medium border transition-colors ${
                  active
                    ? "border-[#2563EB] bg-[#EFF6FF] text-[#2563EB]"
                    : "border-line bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        {selected ? (
          <div className="rounded-xl border border-line bg-[#FAFBFC] px-4 py-3.5">
            <p className="text-[13px] text-gray-600 leading-relaxed">
              {selected.description}
            </p>
            {selected.steps.length > 0 ? (
              <ol className="mt-3 space-y-2">
                {selected.steps.map((step, index) => (
                  <li
                    key={`${selected.key}-${step}-${index}`}
                    className="flex items-center gap-2.5 text-[13px] text-gray-800"
                  >
                    <span className="w-5 h-5 rounded-full bg-white border border-line text-[11px] font-semibold text-gray-500 flex items-center justify-center shrink-0">
                      {index + 1}
                    </span>
                    <span className="font-medium">{step}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-[12px] text-gray-400">
                No automated messages in this sequence.
              </p>
            )}
          </div>
        ) : null}
      </div>
    </div>
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
  icon,
  description,
  connected,
  actionLabel,
  onConnect,
  onDisconnect,
}: {
  name: string;
  icon?: React.ReactNode;
  description: string;
  connected: boolean;
  actionLabel?: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-line px-4 py-3.5">
      <div className="flex items-start gap-3 min-w-0">
        {icon ? (
          <div className="w-10 h-10 rounded-xl border border-line bg-white flex items-center justify-center shrink-0 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            {icon}
          </div>
        ) : null}
        <div className="min-w-0">
          <div className="text-[14px] font-medium text-gray-900">{name}</div>
          <div className="text-[13px] text-gray-500 mt-0.5 leading-snug">
            {description}
          </div>
        </div>
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
