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
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import { UserAvatar } from "@/components/UserAvatar";

type SectionId =
  | "profile"
  | "business"
  | "branding"
  | "notifications"
  | "billing"
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
    <Suspense fallback={<div className="px-8 py-10 text-sm text-gray-500">Loading settings…</div>}>
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
    isSolo
      ? {
          id: "branding",
          label: "Branding",
          description: "Your bio and logo",
          icon: Sparkles,
        }
      : {
          id: "business",
          label: "Business",
          description: "Company info on invoices",
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
      id: "preferences",
      label: "Preferences",
      description: "Defaults for time and currency",
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
    ["profile", "business", "branding", "notifications", "billing", "preferences", "integrations"].includes(initialSection)
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
  const [gmailRedirectUri, setGmailRedirectUri] = useState<string | null>(null);
  const [gmailBusy, setGmailBusy] = useState(false);
  const [gmailNotice, setGmailNotice] = useState<string | null>(null);

  const [profile, setProfile] = useState({
    name: "",
    email: "",
    title: "",
  });

  const [branding, setBranding] = useState({
    description: "",
  });

  const [business, setBusiness] = useState({
    company: "",
    orgNumber: "",
    address: "",
    currency: "USD",
    taxId: "",
  });

  const [notifications, setNotifications] = useState({
    invoiceOverdue: true,
    proposalViewed: true,
    paymentReceived: true,
    weeklyDigest: false,
  });

  const [preferences, setPreferences] = useState({
    defaultHourlyRate: "95",
    weekStartsOn: "Monday",
    timeRounding: "15 minutes",
    theme: "Light",
  });

  useEffect(() => {
    if (profileLoading) return;
    setProfile((prev) => ({
      ...prev,
      name: fullName ?? "",
      email: email ?? "",
    }));
    setBranding({ description: organizationDescription ?? "" });
  }, [profileLoading, fullName, email, organizationDescription]);

  useEffect(() => {
    if (section === "business" && isSolo) setSection("branding");
    if (section === "branding" && !isSolo) setSection("business");
  }, [isSolo, section]);

  useEffect(() => {
    const gmail = searchParams.get("gmail");
    if (!gmail) return;
    if (gmail === "connected") {
      setGmailNotice("Gmail connected. Proposal emails will send from your account.");
      setSection("integrations");
    } else if (gmail === "error") {
      const reason = searchParams.get("reason") || "Could not connect Gmail.";
      setGmailNotice(reason);
      setSection("integrations");
    }
    router.replace("/settings?section=integrations", { scroll: false });
  }, [searchParams, router]);

  useEffect(() => {
    if (section !== "integrations") return;
    let cancelled = false;
    async function loadGmail() {
      const res = await fetch("/api/gmail/status");
      if (!res.ok || cancelled) return;
      const json = (await res.json()) as {
        configured?: boolean;
        connected?: boolean;
        email?: string | null;
        canSend?: boolean;
        needsReconnect?: boolean;
        redirectUri?: string | null;
      };
      if (cancelled) return;
      setGmailConfigured(Boolean(json.configured));
      setGmailConnected(Boolean(json.connected));
      setGmailCanSend(Boolean(json.canSend));
      setGmailEmail(json.email || null);
      setGmailRedirectUri(json.redirectUri || null);
      if (json.needsReconnect) {
        setGmailNotice(
          "Gmail is connected, but send permission is missing. Disconnect, add the gmail.send scope in Google Cloud, then reconnect."
        );
      }
    }
    void loadGmail();
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
    setGmailEmail(null);
    setGmailNotice("Gmail disconnected. Emails will use Rebban’s sender again.");
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

  async function handleSave() {
    setSaving(true);
    setError(null);

    const supabase = createClient();

    if (section === "profile" && userId) {
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ full_name: profile.name.trim() || null })
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
        .update({ description: branding.description.trim() || null })
        .eq("id", organizationId);

      if (updateError) {
        setError(updateError.message);
        setSaving(false);
        return;
      }

      await refresh();
    }

    setSaving(false);
    flashSaved();
  }

  return (
    <main className="w-full px-8 pt-10 pb-8 pr-36 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">Settings</h1>
        <p className="text-gray-500 mt-1.5 text-[15px]">
          Manage your profile, branding, and workspace defaults.
        </p>
      </div>

      <div className="flex gap-8 items-start">
        <aside className="w-[240px] shrink-0 sticky top-8">
          <nav className="space-y-1">
            {sections.map(({ id, label, description, icon: Icon }) => {
              const active = section === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSection(id)}
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

        <div className="flex-1 min-w-0 max-w-2xl">
          <div className="surface-panel p-7">
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
                  <Field label="Title">
                    <input
                      value={profile.title}
                      onChange={(e) => setProfile({ ...profile, title: e.target.value })}
                      className={inputClass}
                      placeholder="e.g. Independent designer"
                    />
                  </Field>
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
                <Field label="About you">
                  <textarea
                    value={branding.description}
                    onChange={(e) =>
                      setBranding({ description: e.target.value })
                    }
                    rows={5}
                    placeholder="A short description clients see on your proposals…"
                    className={`${inputClass} resize-none`}
                  />
                </Field>
              </Section>
            )}

            {section === "business" && (
              <Section
                title="Business"
                subtitle="Used on invoices, proposals, and tax documents."
              >
                <div className="space-y-4">
                  <Field label="Company name">
                    <input
                      value={business.company}
                      onChange={(e) => setBusiness({ ...business, company: e.target.value })}
                      className={inputClass}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Org number">
                      <input
                        value={business.orgNumber}
                        onChange={(e) =>
                          setBusiness({ ...business, orgNumber: e.target.value })
                        }
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Tax ID / VAT">
                      <input
                        value={business.taxId}
                        onChange={(e) => setBusiness({ ...business, taxId: e.target.value })}
                        className={inputClass}
                      />
                    </Field>
                  </div>
                  <Field label="Address">
                    <textarea
                      value={business.address}
                      onChange={(e) => setBusiness({ ...business, address: e.target.value })}
                      rows={2}
                      className={`${inputClass} resize-none`}
                    />
                  </Field>
                  <Field label="Default currency">
                    <select
                      value={business.currency}
                      onChange={(e) => setBusiness({ ...business, currency: e.target.value })}
                      className={inputClass}
                    >
                      <option value="USD">USD — US Dollar</option>
                      <option value="EUR">EUR — Euro</option>
                      <option value="SEK">SEK — Swedish Krona</option>
                      <option value="GBP">GBP — British Pound</option>
                    </select>
                  </Field>
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

            {section === "billing" && (
              <Section
                title="Billing"
                subtitle="Your Rebban plan and payment method."
              >
                <div className="rounded-2xl border border-line bg-[#FAFBFC] p-5 mb-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-[13px] font-medium text-gray-500">Current plan</div>
                      <div className="text-xl font-semibold text-gray-900 mt-1">Basic</div>
                      <p className="text-[13px] text-gray-500 mt-1">
                        $19/month · Renews Nov 12, 2026
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn-primary px-4 py-2 rounded-full text-sm"
                    >
                      Upgrade
                    </button>
                  </div>
                </div>
                <div className="rounded-2xl border border-line p-5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600">
                      <CreditCard className="w-5 h-5" strokeWidth={1.75} />
                    </div>
                    <div>
                      <div className="text-[14px] font-medium text-gray-900">
                        Visa ending in 4242
                      </div>
                      <div className="text-[12px] text-gray-400 mt-0.5">Expires 08/28</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="text-sm font-medium text-[#2563EB] hover:text-[#1d4ed8] transition-colors"
                  >
                    Update
                  </button>
                </div>
              </Section>
            )}

            {section === "preferences" && (
              <Section
                title="Preferences"
                subtitle="Defaults for tracking time and new work."
              >
                <div className="space-y-4">
                  <Field label="Default hourly rate">
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                        $
                      </span>
                      <input
                        value={preferences.defaultHourlyRate}
                        onChange={(e) =>
                          setPreferences({
                            ...preferences,
                            defaultHourlyRate: e.target.value,
                          })
                        }
                        className={`${inputClass} pl-7`}
                      />
                    </div>
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Week starts on">
                      <select
                        value={preferences.weekStartsOn}
                        onChange={(e) =>
                          setPreferences({ ...preferences, weekStartsOn: e.target.value })
                        }
                        className={inputClass}
                      >
                        <option>Monday</option>
                        <option>Sunday</option>
                      </select>
                    </Field>
                    <Field label="Time rounding">
                      <select
                        value={preferences.timeRounding}
                        onChange={(e) =>
                          setPreferences({ ...preferences, timeRounding: e.target.value })
                        }
                        className={inputClass}
                      >
                        <option>None</option>
                        <option>6 minutes</option>
                        <option>15 minutes</option>
                        <option>30 minutes</option>
                      </select>
                    </Field>
                  </div>
                  <Field label="Theme">
                    <select
                      value={preferences.theme}
                      onChange={(e) =>
                        setPreferences({ ...preferences, theme: e.target.value })
                      }
                      className={inputClass}
                    >
                      <option>Light</option>
                      <option>System</option>
                    </select>
                  </Field>
                </div>
              </Section>
            )}

            {section === "integrations" && (
              <Section
                title="Integrations"
                subtitle="Connect tools you already use to get paid and stay in sync."
              >
                {gmailNotice && (
                  <p className="mb-4 text-[13px] text-gray-600 bg-[#FAFBFC] border border-line rounded-xl px-3.5 py-2.5">
                    {gmailNotice}
                  </p>
                )}
                {gmailConfigured && !gmailConnected && gmailRedirectUri && (
                  <p className="mb-4 text-[12px] text-gray-500 bg-[#FAFBFC] border border-line rounded-xl px-3.5 py-2.5 break-all">
                    Google Cloud → Credentials → your OAuth client → Authorized
                    redirect URIs must include exactly:{" "}
                    <span className="font-medium text-ink">{gmailRedirectUri}</span>
                  </p>
                )}
                <div className="space-y-3">
                  <IntegrationRow
                    name="Gmail"
                    description={
                      gmailConnected && gmailEmail
                        ? gmailCanSend
                          ? `Sending proposals from ${gmailEmail}`
                          : `Connected as ${gmailEmail}, but missing send permission — reconnect required`
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
                    name="Stripe"
                    description="Collect invoice payments"
                    connected
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
                    Gmail uses Google OAuth with send-only access. Rebban never stores your password.
                    If Gmail isn’t connected, emails still send via Rebban.
                  </p>
                </div>
              </Section>
            )}

            {section !== "integrations" && section !== "billing" && (
              <div className="mt-8 pt-5 border-t border-line flex items-center justify-end gap-3">
                {saved && (
                  <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-emerald-600">
                    <Check className="w-3.5 h-3.5" />
                    Saved
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving || uploading}
                  className="btn-primary px-5 py-2.5 rounded-xl text-sm disabled:opacity-50"
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
      <h2 className="text-lg font-semibold text-gray-900 tracking-tight">{title}</h2>
      <p className="text-sm text-gray-500 mt-1 mb-6">{subtitle}</p>
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
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-line px-4 py-3.5">
      <div className="min-w-0">
        <div className="text-[14px] font-medium text-gray-900">{name}</div>
        <div className="text-[13px] text-gray-500 mt-0.5">{description}</div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
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
            className="text-sm font-medium text-[#2563EB] hover:text-[#1d4ed8] px-3 py-1.5 rounded-full hover:bg-[#EFF6FF] transition-colors disabled:opacity-50 disabled:hover:bg-transparent"
          >
            {actionLabel || "Connect"}
          </button>
        )}
      </div>
    </div>
  );
}
