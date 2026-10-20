"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus,
  Copy,
  Check,
  Link2,
  Clock,
  Trash2,
  ExternalLink,
  CalendarDays,
  LayoutList,
  ChevronLeft,
  ChevronRight,
  X,
  MoreHorizontal,
  Mail,
  Pencil,
  Ban,
} from "lucide-react";
import { nanoid } from "nanoid";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import {
  ModalOverlay,
  modalFooterClass,
  modalHeaderClass,
  modalPanelClass,
} from "@/components/ModalFrame";
import {
  CreateMeetingModal,
  type MeetingContact,
} from "@/components/calendar/CreateMeetingModal";
import {
  MeetingDetailsModal,
  type MeetingBooking,
} from "@/components/calendar/MeetingDetailsModal";
import {
  COMMON_TIMEZONES,
  DURATION_OPTIONS,
  WEEKDAY_LABELS,
  defaultWeekdayAvailability,
  type AvailabilityRule,
} from "@/lib/booking/slots";
import {
  BOOKING_EMAIL_PLACEHOLDER_HINT,
  DEFAULT_BOOKING_EMAIL_BODIES,
  DEFAULT_BOOKING_EMAIL_SUBJECTS,
  defaultBookingEmailSettings,
} from "@/lib/booking/email-templates";
import { formatInZone, getZonedParts } from "@/lib/booking/timezone";

type TabId =
  | "bookings"
  | "links"
  | "availability"
  | "emails"
  | "integrations";
type BookingsView = "list" | "calendar";

type LocationType = "in_person" | "online";
type OnlineProvider = "google_meet" | "zoom";

type BookingLinkRow = {
  id: string;
  title: string;
  description: string | null;
  duration_minutes: number;
  public_token: string;
  is_active: boolean;
  created_at: string;
  location_type: LocationType;
  online_provider: OnlineProvider | null;
  location_details: string | null;
};

type BookingRow = MeetingBooking;

function appBaseUrl() {
  if (typeof window !== "undefined") return window.location.origin;
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://rebban.com"
  );
}

function CalendarPageInner() {
  const { organizationId, userId, loading: profileLoading } = useProfile();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: TabId =
    tabParam === "links" ||
    tabParam === "availability" ||
    tabParam === "emails" ||
    tabParam === "integrations"
      ? tabParam
      : "bookings";

  const [timezone, setTimezone] = useState("Europe/Stockholm");
  const [intervalMinutes, setIntervalMinutes] = useState(30);
  const [emailSettings, setEmailSettings] = useState(defaultBookingEmailSettings);
  const [savingEmails, setSavingEmails] = useState(false);
  const [emailsSaved, setEmailsSaved] = useState(false);
  const [rules, setRules] = useState<AvailabilityRule[]>(
    defaultWeekdayAvailability()
  );
  const [links, setLinks] = useState<BookingLinkRow[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [contacts, setContacts] = useState<MeetingContact[]>([]);
  const [bookingsView, setBookingsView] = useState<BookingsView>("list");
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [loading, setLoading] = useState(true);
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [availabilitySaved, setAvailabilitySaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const [meetingModalOpen, setMeetingModalOpen] = useState(false);
  const [detailsBooking, setDetailsBooking] = useState<BookingRow | null>(null);
  const [bookingActionBusyId, setBookingActionBusyId] = useState<string | null>(
    null
  );
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkTitle, setLinkTitle] = useState("Discovery call");
  const [linkDescription, setLinkDescription] = useState("");
  const [linkDuration, setLinkDuration] = useState(30);
  const [linkLocationType, setLinkLocationType] =
    useState<LocationType>("online");
  const [linkOnlineProvider, setLinkOnlineProvider] =
    useState<OnlineProvider>("google_meet");
  const [linkLocationDetails, setLinkLocationDetails] = useState("");
  const [savingLink, setSavingLink] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const [gcalConfigured, setGcalConfigured] = useState(false);
  const [gcalConnected, setGcalConnected] = useState(false);
  const [gcalEmail, setGcalEmail] = useState<string | null>(null);
  const [gcalBusy, setGcalBusy] = useState(false);
  const [gcalNotice, setGcalNotice] = useState<string | null>(null);

  const [zoomConfigured, setZoomConfigured] = useState(false);
  const [zoomConnected, setZoomConnected] = useState(false);
  const [zoomEmail, setZoomEmail] = useState<string | null>(null);
  const [zoomBusy, setZoomBusy] = useState(false);
  const [zoomNotice, setZoomNotice] = useState<string | null>(null);

  const setTab = useCallback(
    (next: TabId) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "bookings") params.delete("tab");
      else params.set("tab", next);
      const qs = params.toString();
      router.replace(qs ? `/calendar?${qs}` : "/calendar");
    },
    [router, searchParams]
  );

  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    if (searchParams.get("tab") === "links") {
      setTab("links");
      setLinkModalOpen(true);
    } else {
      setTab("bookings");
      setMeetingModalOpen(true);
    }
    const params = new URLSearchParams(searchParams.toString());
    params.delete("new");
    const qs = params.toString();
    router.replace(qs ? `/calendar?${qs}` : "/calendar");
  }, [searchParams, router, setTab]);

  const refreshCalendarIntegrations = useCallback(async () => {
    try {
      const [gcalRes, zoomRes] = await Promise.all([
        fetch("/api/google-calendar/status"),
        fetch("/api/zoom/status"),
      ]);
      if (gcalRes.ok) {
        const json = (await gcalRes.json()) as {
          configured?: boolean;
          connected?: boolean;
          email?: string | null;
        };
        setGcalConfigured(Boolean(json.configured));
        setGcalConnected(Boolean(json.connected));
        setGcalEmail(json.email || null);
      }
      if (zoomRes.ok) {
        const json = (await zoomRes.json()) as {
          configured?: boolean;
          connected?: boolean;
          email?: string | null;
        };
        setZoomConfigured(Boolean(json.configured));
        setZoomConnected(Boolean(json.connected));
        setZoomEmail(json.email || null);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void refreshCalendarIntegrations();
  }, [refreshCalendarIntegrations]);

  useEffect(() => {
    const gcal = searchParams.get("gcal");
    const zoom = searchParams.get("zoom");
    if (!gcal && !zoom) return;
    setTab("integrations");
    if (gcal === "connected") {
      setGcalNotice("Google Calendar connected.");
      void refreshCalendarIntegrations();
    } else if (gcal === "error") {
      const reason = searchParams.get("reason");
      setGcalNotice(
        reason
          ? `Could not connect Google Calendar: ${reason}`
          : "Could not connect Google Calendar."
      );
    }
    if (zoom === "connected") {
      setZoomNotice("Zoom connected.");
      void refreshCalendarIntegrations();
    } else if (zoom === "error") {
      const reason = searchParams.get("reason");
      setZoomNotice(
        reason ? `Could not connect Zoom: ${reason}` : "Could not connect Zoom."
      );
    }
    const params = new URLSearchParams(searchParams.toString());
    params.delete("gcal");
    params.delete("zoom");
    params.delete("reason");
    params.set("tab", "integrations");
    router.replace(`/calendar?${params.toString()}`);
  }, [searchParams, router, refreshCalendarIntegrations, setTab]);

  async function disconnectGoogleCalendar() {
    setGcalBusy(true);
    setGcalNotice(null);
    try {
      const res = await fetch("/api/google-calendar/disconnect", {
        method: "POST",
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setGcalNotice(json.error || "Could not disconnect");
      } else {
        setGcalConnected(false);
        setGcalEmail(null);
        setGcalNotice("Google Calendar disconnected.");
      }
    } catch {
      setGcalNotice("Could not disconnect");
    }
    setGcalBusy(false);
  }

  async function disconnectZoomAccount() {
    setZoomBusy(true);
    setZoomNotice(null);
    try {
      const res = await fetch("/api/zoom/disconnect", { method: "POST" });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setZoomNotice(json.error || "Could not disconnect");
      } else {
        setZoomConnected(false);
        setZoomEmail(null);
        setZoomNotice("Zoom disconnected.");
      }
    } catch {
      setZoomNotice("Could not disconnect");
    }
    setZoomBusy(false);
  }

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    const supabase = createClient();

    const [settingsRes, availRes, linksRes, bookingsRes, clientsRes, leadsRes] =
      await Promise.all([
        supabase
          .from("booking_settings")
          .select(
            "timezone, slot_interval_minutes, confirmation_email_subject, confirmation_email_body, reminder_1d_enabled, reminder_1d_subject, reminder_1d_body, reminder_1h_enabled, reminder_1h_subject, reminder_1h_body"
          )
          .eq("organization_id", organizationId)
          .maybeSingle(),
        supabase
          .from("booking_availability")
          .select("weekday, start_time, end_time")
          .eq("organization_id", organizationId)
          .order("weekday")
          .order("start_time"),
        supabase
          .from("booking_links")
          .select(
            "id, title, description, duration_minutes, public_token, is_active, created_at, location_type, online_provider, location_details"
          )
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false }),
        supabase
          .from("bookings")
          .select(
            "id, guest_name, guest_email, guest_notes, starts_at, ends_at, status, booking_link_id, title, meeting_url, location_type, online_provider, location_details"
          )
          .eq("organization_id", organizationId)
          .gte("starts_at", new Date(Date.now() - 7 * 86400000).toISOString())
          .order("starts_at", { ascending: true })
          .limit(200),
        supabase
          .from("clients")
          .select("id, name, email, company")
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .order("name")
          .limit(200),
        supabase
          .from("leads")
          .select("id, name, email, company")
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(200),
      ]);

    if (settingsRes.data) {
      setTimezone(settingsRes.data.timezone || "Europe/Stockholm");
      setIntervalMinutes(settingsRes.data.slot_interval_minutes || 30);
      setEmailSettings({
        confirmation_email_subject:
          settingsRes.data.confirmation_email_subject ||
          DEFAULT_BOOKING_EMAIL_SUBJECTS.confirmation,
        confirmation_email_body:
          settingsRes.data.confirmation_email_body ||
          DEFAULT_BOOKING_EMAIL_BODIES.confirmation,
        reminder_1d_enabled: settingsRes.data.reminder_1d_enabled !== false,
        reminder_1d_subject:
          settingsRes.data.reminder_1d_subject ||
          DEFAULT_BOOKING_EMAIL_SUBJECTS.reminder_1d,
        reminder_1d_body:
          settingsRes.data.reminder_1d_body ||
          DEFAULT_BOOKING_EMAIL_BODIES.reminder_1d,
        reminder_1h_enabled: settingsRes.data.reminder_1h_enabled !== false,
        reminder_1h_subject:
          settingsRes.data.reminder_1h_subject ||
          DEFAULT_BOOKING_EMAIL_SUBJECTS.reminder_1h,
        reminder_1h_body:
          settingsRes.data.reminder_1h_body ||
          DEFAULT_BOOKING_EMAIL_BODIES.reminder_1h,
      });
    }

    if (availRes.data && availRes.data.length > 0) {
      setRules(
        availRes.data.map((r) => ({
          weekday: r.weekday,
          start_time: String(r.start_time).slice(0, 5),
          end_time: String(r.end_time).slice(0, 5),
        }))
      );
    } else {
      setRules(defaultWeekdayAvailability());
    }

    setLinks((linksRes.data as BookingLinkRow[]) || []);

    const bookingRows = (bookingsRes.data || []) as Omit<
      BookingRow,
      "link_title"
    >[];
    const linkMap = new Map(
      ((linksRes.data as BookingLinkRow[]) || []).map((l) => [l.id, l.title])
    );
    setBookings(
      bookingRows.map((b) => ({
        ...b,
        link_title: b.booking_link_id
          ? linkMap.get(b.booking_link_id) || null
          : null,
      }))
    );

    const nextContacts: MeetingContact[] = [
      ...((clientsRes.data || []) as Array<{
        id: string;
        name: string;
        email: string | null;
        company: string | null;
      }>).map((c) => ({
        id: `client:${c.id}`,
        kind: "client" as const,
        name: c.name,
        email: c.email,
        company: c.company,
      })),
      ...((leadsRes.data || []) as Array<{
        id: string;
        name: string;
        email: string | null;
        company: string | null;
      }>).map((l) => ({
        id: `lead:${l.id}`,
        kind: "lead" as const,
        name: l.name,
        email: l.email,
        company: l.company,
      })),
    ];
    setContacts(nextContacts);

    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    if (!profileLoading && organizationId) void load();
  }, [profileLoading, organizationId, load]);

  const enabledWeekdays = useMemo(() => {
    const set = new Set(rules.map((r) => r.weekday));
    return set;
  }, [rules]);

  function toggleWeekday(weekday: number) {
    setAvailabilitySaved(false);
    setRules((prev) => {
      const has = prev.some((r) => r.weekday === weekday);
      if (has) return prev.filter((r) => r.weekday !== weekday);
      return [
        ...prev,
        { weekday, start_time: "09:00", end_time: "17:00" },
      ].sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time));
    });
  }

  function updateRule(
    weekday: number,
    patch: Partial<Pick<AvailabilityRule, "start_time" | "end_time">>
  ) {
    setAvailabilitySaved(false);
    setRules((prev) =>
      prev.map((r) => (r.weekday === weekday ? { ...r, ...patch } : r))
    );
  }

  async function saveAvailability() {
    if (!organizationId) return;
    setSavingAvailability(true);
    setError(null);
    const supabase = createClient();

    const { error: settingsError } = await supabase
      .from("booking_settings")
      .upsert({
        organization_id: organizationId,
        timezone,
        slot_interval_minutes: intervalMinutes,
      });

    if (settingsError) {
      setError(settingsError.message);
      setSavingAvailability(false);
      return;
    }

    await supabase
      .from("booking_availability")
      .delete()
      .eq("organization_id", organizationId);

    if (rules.length) {
      const { error: availError } = await supabase
        .from("booking_availability")
        .insert(
          rules.map((r) => ({
            organization_id: organizationId,
            weekday: r.weekday,
            start_time: r.start_time,
            end_time: r.end_time,
          }))
        );
      if (availError) {
        setError(availError.message);
        setSavingAvailability(false);
        return;
      }
    }

    setAvailabilitySaved(true);
    setSavingAvailability(false);
  }

  async function saveEmailSettings() {
    if (!organizationId) return;
    setSavingEmails(true);
    setError(null);
    const supabase = createClient();

    const { error: settingsError } = await supabase
      .from("booking_settings")
      .upsert({
        organization_id: organizationId,
        timezone,
        slot_interval_minutes: intervalMinutes,
        confirmation_email_subject:
          emailSettings.confirmation_email_subject?.trim() ||
          DEFAULT_BOOKING_EMAIL_SUBJECTS.confirmation,
        confirmation_email_body:
          emailSettings.confirmation_email_body?.trim() ||
          DEFAULT_BOOKING_EMAIL_BODIES.confirmation,
        reminder_1d_enabled: emailSettings.reminder_1d_enabled,
        reminder_1d_subject:
          emailSettings.reminder_1d_subject?.trim() ||
          DEFAULT_BOOKING_EMAIL_SUBJECTS.reminder_1d,
        reminder_1d_body:
          emailSettings.reminder_1d_body?.trim() ||
          DEFAULT_BOOKING_EMAIL_BODIES.reminder_1d,
        reminder_1h_enabled: emailSettings.reminder_1h_enabled,
        reminder_1h_subject:
          emailSettings.reminder_1h_subject?.trim() ||
          DEFAULT_BOOKING_EMAIL_SUBJECTS.reminder_1h,
        reminder_1h_body:
          emailSettings.reminder_1h_body?.trim() ||
          DEFAULT_BOOKING_EMAIL_BODIES.reminder_1h,
      });

    setSavingEmails(false);
    if (settingsError) {
      setError(settingsError.message);
      return;
    }
    setEmailsSaved(true);
  }

  async function createLink() {
    if (!organizationId || !userId) return;
    const title = linkTitle.trim();
    if (!title) {
      setError("Title is required");
      return;
    }
    if (linkLocationType === "online" && linkOnlineProvider === "google_meet" && !gcalConnected) {
      setError("Connect Google Calendar first to use Google Meet.");
      return;
    }
    if (linkLocationType === "online" && linkOnlineProvider === "zoom" && !zoomConnected) {
      setError("Connect Zoom first to create Zoom meetings.");
      return;
    }
    setSavingLink(true);
    setError(null);
    const supabase = createClient();

    // Ensure settings exist so public page has a timezone
    await supabase.from("booking_settings").upsert({
      organization_id: organizationId,
      timezone,
      slot_interval_minutes: intervalMinutes,
    });

    const existing = await supabase
      .from("booking_availability")
      .select("id")
      .eq("organization_id", organizationId)
      .limit(1);
    if (!existing.data?.length) {
      await supabase.from("booking_availability").insert(
        defaultWeekdayAvailability().map((r) => ({
          organization_id: organizationId,
          weekday: r.weekday,
          start_time: r.start_time,
          end_time: r.end_time,
        }))
      );
      setRules(defaultWeekdayAvailability());
    }

    const { data, error: insertError } = await supabase
      .from("booking_links")
      .insert({
        organization_id: organizationId,
        public_token: nanoid(16),
        title,
        description: linkDescription.trim() || null,
        duration_minutes: linkDuration,
        location_type: linkLocationType,
        online_provider:
          linkLocationType === "online" ? linkOnlineProvider : null,
        location_details:
          linkLocationType === "in_person"
            ? linkLocationDetails.trim() || null
            : null,
        created_by: userId,
      })
      .select(
        "id, title, description, duration_minutes, public_token, is_active, created_at, location_type, online_provider, location_details"
      )
      .single();

    setSavingLink(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setLinks((prev) => [data as BookingLinkRow, ...prev]);
    setLinkModalOpen(false);
    setLinkTitle("Discovery call");
    setLinkDescription("");
    setLinkDuration(30);
    setLinkLocationType("online");
    setLinkOnlineProvider("google_meet");
    setLinkLocationDetails("");
    setTab("links");
  }

  async function toggleLinkActive(link: BookingLinkRow) {
    const supabase = createClient();
    const next = !link.is_active;
    const { error: updateError } = await supabase
      .from("booking_links")
      .update({ is_active: next })
      .eq("id", link.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setLinks((prev) =>
      prev.map((l) => (l.id === link.id ? { ...l, is_active: next } : l))
    );
  }

  async function deleteLink(link: BookingLinkRow) {
    if (!confirm(`Delete “${link.title}”? Existing bookings stay in history.`)) {
      return;
    }
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("booking_links")
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq("id", link.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setLinks((prev) => prev.filter((l) => l.id !== link.id));
  }

  function markBookingCancelled(bookingId: string) {
    setBookings((prev) =>
      prev.map((b) =>
        b.id === bookingId ? { ...b, status: "cancelled" } : b
      )
    );
    setDetailsBooking((prev) =>
      prev && prev.id === bookingId ? { ...prev, status: "cancelled" } : prev
    );
  }

  function applyBookingUpdate(updated: BookingRow) {
    setBookings((prev) =>
      prev.map((b) => (b.id === updated.id ? { ...b, ...updated } : b))
    );
    setDetailsBooking((prev) =>
      prev && prev.id === updated.id ? { ...prev, ...updated } : prev
    );
  }

  async function cancelBooking(booking: BookingRow) {
    if (
      !confirm(
        `Cancel meeting with ${booking.guest_name}? They’ll get a cancellation email.`
      )
    ) {
      return;
    }
    setBookingActionBusyId(booking.id);
    setError(null);
    try {
      const res = await fetch(`/api/calendar/bookings/${booking.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notify_guest: true }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error || "Could not cancel meeting");
      } else {
        markBookingCancelled(booking.id);
        setSuccessNotice("Meeting cancelled.");
      }
    } catch {
      setError("Could not cancel meeting");
    }
    setBookingActionBusyId(null);
  }

  async function resendBookingInvite(booking: BookingRow) {
    setBookingActionBusyId(booking.id);
    setError(null);
    try {
      const res = await fetch(`/api/calendar/bookings/${booking.id}/resend`, {
        method: "POST",
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error || "Could not send invite");
      } else {
        setSuccessNotice(`Invite sent to ${booking.guest_email}.`);
      }
    } catch {
      setError("Could not send invite");
    }
    setBookingActionBusyId(null);
  }

  async function copyLink(token: string) {
    const url = `${appBaseUrl()}/b/${token}`;
    await navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  }

  if (profileLoading || loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-gray-500">
        Loading calendar…
      </div>
    );
  }

  if (!organizationId) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-gray-600">
        Finish onboarding to set up your calendar.
      </div>
    );
  }

  return (
    <div className="relative mx-auto w-full max-w-7xl px-4 pb-8 pt-10 md:px-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            Calendar
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            See upcoming meetings, send booking links, or schedule a time yourself.
          </p>
        </div>
        {tab === "links" ? (
          <button
            type="button"
            onClick={() => setLinkModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#2563EB] px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-[#1d4ed8]"
          >
            <Plus className="h-4 w-4" />
            New booking link
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setMeetingModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#2563EB] px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-[#1d4ed8]"
          >
            <Plus className="h-4 w-4" />
            Create meeting
          </button>
        )}
      </div>

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {successNotice ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {successNotice}
        </div>
      ) : null}

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
        {(
          [
            ["bookings", "Bookings"],
            ["links", "Booking links"],
            ["availability", "Availability"],
            ["emails", "Emails"],
            ["integrations", "Integrations"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`inline-flex items-center px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === id
                ? "border-[#2563EB] text-[#2563EB]"
                : "border-transparent text-gray-500 hover:text-gray-900"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "emails" ? (
        <div className="mx-auto max-w-2xl space-y-6">
          <p className="text-sm text-gray-500">
            Customize what guests receive after booking, and control reminder
            emails. Meeting details and join links are always included below
            your message.
          </p>
          <p className="text-xs text-gray-400">{BOOKING_EMAIL_PLACEHOLDER_HINT}</p>

          <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-gray-900">
              Confirmation email
            </h2>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-gray-700">
                Subject
              </span>
              <input
                value={emailSettings.confirmation_email_subject ?? ""}
                onChange={(e) => {
                  setEmailsSaved(false);
                  setEmailSettings((prev) => ({
                    ...prev,
                    confirmation_email_subject: e.target.value,
                  }));
                }}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-gray-700">
                Message
              </span>
              <textarea
                rows={4}
                value={emailSettings.confirmation_email_body ?? ""}
                onChange={(e) => {
                  setEmailsSaved(false);
                  setEmailSettings((prev) => ({
                    ...prev,
                    confirmation_email_body: e.target.value,
                  }));
                }}
                className="w-full resize-y rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
              />
            </label>
          </div>

          <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  Reminder · 1 day before
                </h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  Sent about 24 hours before the meeting.
                </p>
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={emailSettings.reminder_1d_enabled}
                  onChange={(e) => {
                    setEmailsSaved(false);
                    setEmailSettings((prev) => ({
                      ...prev,
                      reminder_1d_enabled: e.target.checked,
                    }));
                  }}
                  className="h-4 w-4 rounded border-gray-300 text-[#2563EB] focus:ring-[#2563EB]"
                />
                On
              </label>
            </div>
            {emailSettings.reminder_1d_enabled ? (
              <>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-gray-700">
                    Subject
                  </span>
                  <input
                    value={emailSettings.reminder_1d_subject ?? ""}
                    onChange={(e) => {
                      setEmailsSaved(false);
                      setEmailSettings((prev) => ({
                        ...prev,
                        reminder_1d_subject: e.target.value,
                      }));
                    }}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-gray-700">
                    Message
                  </span>
                  <textarea
                    rows={3}
                    value={emailSettings.reminder_1d_body ?? ""}
                    onChange={(e) => {
                      setEmailsSaved(false);
                      setEmailSettings((prev) => ({
                        ...prev,
                        reminder_1d_body: e.target.value,
                      }));
                    }}
                    className="w-full resize-y rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                  />
                </label>
              </>
            ) : null}
          </div>

          <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  Reminder · 1 hour before
                </h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  Sent about 60 minutes before the meeting.
                </p>
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={emailSettings.reminder_1h_enabled}
                  onChange={(e) => {
                    setEmailsSaved(false);
                    setEmailSettings((prev) => ({
                      ...prev,
                      reminder_1h_enabled: e.target.checked,
                    }));
                  }}
                  className="h-4 w-4 rounded border-gray-300 text-[#2563EB] focus:ring-[#2563EB]"
                />
                On
              </label>
            </div>
            {emailSettings.reminder_1h_enabled ? (
              <>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-gray-700">
                    Subject
                  </span>
                  <input
                    value={emailSettings.reminder_1h_subject ?? ""}
                    onChange={(e) => {
                      setEmailsSaved(false);
                      setEmailSettings((prev) => ({
                        ...prev,
                        reminder_1h_subject: e.target.value,
                      }));
                    }}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-gray-700">
                    Message
                  </span>
                  <textarea
                    rows={3}
                    value={emailSettings.reminder_1h_body ?? ""}
                    onChange={(e) => {
                      setEmailsSaved(false);
                      setEmailSettings((prev) => ({
                        ...prev,
                        reminder_1h_body: e.target.value,
                      }));
                    }}
                    className="w-full resize-y rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                  />
                </label>
              </>
            ) : null}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void saveEmailSettings()}
              disabled={savingEmails}
              className="rounded-full bg-[#2563EB] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1d4ed8] disabled:opacity-60"
            >
              {savingEmails ? "Saving…" : "Save email settings"}
            </button>
            {emailsSaved ? (
              <span className="inline-flex items-center gap-1 text-sm text-emerald-600">
                <Check className="h-4 w-4" /> Saved
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === "integrations" ? (
        <div className="space-y-3">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/google-calendar.svg"
                    alt=""
                    className="h-5 w-5"
                  />
                  <h2 className="text-sm font-semibold text-gray-900">
                    Google Calendar
                  </h2>
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  Block busy times from other meetings, create Google Meet
                  links, and add bookings to your calendar.
                </p>
                {gcalConnected && gcalEmail ? (
                  <p className="mt-2 text-xs text-emerald-700">
                    Connected as {gcalEmail}
                  </p>
                ) : null}
                {gcalNotice ? (
                  <p className="mt-2 text-xs text-gray-600">{gcalNotice}</p>
                ) : null}
                {!gcalConfigured ? (
                  <p className="mt-2 text-xs text-amber-700">
                    Google OAuth isn&apos;t configured on this environment yet.
                  </p>
                ) : null}
              </div>
              {gcalConnected ? (
                <button
                  type="button"
                  disabled={gcalBusy}
                  onClick={() => void disconnectGoogleCalendar()}
                  className="shrink-0 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  {gcalBusy ? "Working…" : "Disconnect"}
                </button>
              ) : (
                <a
                  href={`/api/google-calendar/connect?returnTo=${encodeURIComponent("/calendar?tab=integrations&gcal=connected")}`}
                  className={`inline-flex shrink-0 items-center justify-center rounded-full bg-[#2563EB] px-4 py-2 text-sm font-medium text-white hover:bg-[#1d4ed8] ${
                    !gcalConfigured ? "pointer-events-none opacity-50" : ""
                  }`}
                >
                  Connect Google Calendar
                </a>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 opacity-80">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/zoom.svg" alt="" className="h-5 w-5 rounded" />
                  <h2 className="text-sm font-semibold text-gray-900">Zoom</h2>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                    Coming soon
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  Create a Zoom meeting automatically when someone books an
                  online Zoom link.
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-400">
                Coming soon
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "availability" ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-gray-700">
                Timezone
              </span>
              <select
                value={timezone}
                onChange={(e) => {
                  setTimezone(e.target.value);
                  setAvailabilitySaved(false);
                }}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-gray-700">
                Slot interval
              </span>
              <select
                value={intervalMinutes}
                onChange={(e) => {
                  setIntervalMinutes(Number(e.target.value));
                  setAvailabilitySaved(false);
                }}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
              >
                <option value={15}>Every 15 minutes</option>
                <option value={30}>Every 30 minutes</option>
                <option value={60}>Every hour</option>
              </select>
            </label>
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
            {WEEKDAY_LABELS.map((label, weekday) => {
              const enabled = enabledWeekdays.has(weekday);
              const rule = rules.find((r) => r.weekday === weekday);
              return (
                <div
                  key={label}
                  className="flex flex-col gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={() => toggleWeekday(weekday)}
                      className="h-4 w-4 rounded border-gray-300 text-[#2563EB] focus:ring-[#2563EB]"
                    />
                    <span
                      className={`text-sm font-medium ${
                        enabled ? "text-gray-900" : "text-gray-400"
                      }`}
                    >
                      {label}
                    </span>
                  </label>
                  {enabled && rule ? (
                    <div className="flex items-center gap-2 pl-7 sm:pl-0">
                      <input
                        type="time"
                        value={rule.start_time}
                        onChange={(e) =>
                          updateRule(weekday, { start_time: e.target.value })
                        }
                        className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                      />
                      <span className="text-sm text-gray-400">to</span>
                      <input
                        type="time"
                        value={rule.end_time}
                        onChange={(e) =>
                          updateRule(weekday, { end_time: e.target.value })
                        }
                        className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                      />
                    </div>
                  ) : (
                    <span className="pl-7 text-sm text-gray-400 sm:pl-0">
                      Unavailable
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void saveAvailability()}
              disabled={savingAvailability}
              className="rounded-full bg-[#2563EB] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1d4ed8] disabled:opacity-60"
            >
              {savingAvailability ? "Saving…" : "Save availability"}
            </button>
            {availabilitySaved ? (
              <span className="inline-flex items-center gap-1 text-sm text-emerald-600">
                <Check className="h-4 w-4" /> Saved
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === "links" ? (
        <div className="space-y-3">
          {links.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-14 text-center">
              <CalendarDays className="mx-auto h-8 w-8 text-gray-300" />
              <p className="mt-3 text-sm font-medium text-gray-900">
                No booking links yet
              </p>
              <p className="mt-1 text-sm text-gray-500">
                Create a link with a title and duration, then send it to clients.
              </p>
              <button
                type="button"
                onClick={() => setLinkModalOpen(true)}
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#2563EB] px-4 py-2 text-sm font-medium text-white"
              >
                <Plus className="h-4 w-4" />
                Create link
              </button>
            </div>
          ) : (
            links.map((link) => {
              const url = `${appBaseUrl()}/b/${link.public_token}`;
              return (
                <div
                  key={link.id}
                  className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-sm font-semibold text-gray-900">
                        {link.title}
                      </h3>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          link.is_active
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {link.is_active ? "Active" : "Paused"}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {link.duration_minutes} min
                      </span>
                      <span>
                        {link.location_type === "in_person"
                          ? "In person"
                          : link.online_provider === "zoom"
                            ? "Zoom"
                            : "Google Meet"}
                      </span>
                      <span className="inline-flex items-center gap-1 truncate">
                        <Link2 className="h-3.5 w-3.5 shrink-0" />
                        {url}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void copyLink(link.public_token)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      {copiedToken === link.public_token ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          Copy link
                        </>
                      )}
                    </button>
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open
                    </a>
                    <button
                      type="button"
                      onClick={() => void toggleLinkActive(link)}
                      className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      {link.is_active ? "Pause" : "Activate"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteLink(link)}
                      className="rounded-full border border-gray-200 p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600"
                      aria-label="Delete link"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : null}

      {tab === "bookings" ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex rounded-xl bg-gray-100 p-1">
              <button
                type="button"
                onClick={() => setBookingsView("list")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${
                  bookingsView === "list"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600"
                }`}
              >
                <LayoutList className="h-3.5 w-3.5" />
                List
              </button>
              <button
                type="button"
                onClick={() => setBookingsView("calendar")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${
                  bookingsView === "calendar"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600"
                }`}
              >
                <CalendarDays className="h-3.5 w-3.5" />
                Calendar
              </button>
            </div>
          </div>

          {bookings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-14 text-center">
              <p className="text-sm font-medium text-gray-900">No meetings yet</p>
              <p className="mt-1 text-sm text-gray-500">
                Create a meeting or share a booking link to get started.
              </p>
              <button
                type="button"
                onClick={() => setMeetingModalOpen(true)}
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#2563EB] px-4 py-2 text-sm font-medium text-white"
              >
                <Plus className="h-4 w-4" />
                Create meeting
              </button>
            </div>
          ) : bookingsView === "list" ? (
            <div className="space-y-3">
              {bookings.map((booking) => (
                <BookingListItem
                  key={booking.id}
                  booking={booking}
                  timezone={timezone}
                  busy={bookingActionBusyId === booking.id}
                  onOpen={() => setDetailsBooking(booking)}
                  onEdit={() => setDetailsBooking(booking)}
                  onSendInvite={() => void resendBookingInvite(booking)}
                  onCancel={() => void cancelBooking(booking)}
                />
              ))}
            </div>
          ) : (
            <BookingsMonthView
              month={calendarMonth}
              onMonthChange={setCalendarMonth}
              bookings={bookings}
              timezone={timezone}
              busyId={bookingActionBusyId}
              onOpen={(booking) => setDetailsBooking(booking)}
              onEdit={(booking) => setDetailsBooking(booking)}
              onSendInvite={(booking) => void resendBookingInvite(booking)}
              onCancel={(booking) => void cancelBooking(booking)}
            />
          )}
        </div>
      ) : null}

      <MeetingDetailsModal
        open={Boolean(detailsBooking)}
        booking={detailsBooking}
        timezone={timezone}
        onClose={() => setDetailsBooking(null)}
        onUpdated={(updated) => applyBookingUpdate(updated)}
        onCancelled={(bookingId) => {
          markBookingCancelled(bookingId);
          setSuccessNotice("Meeting cancelled.");
        }}
      />

      <CreateMeetingModal
        open={meetingModalOpen}
        onClose={() => setMeetingModalOpen(false)}
        contacts={contacts}
        links={links}
        gcalConnected={gcalConnected}
        zoomConnected={zoomConnected}
        onSentLink={() => {
          setSuccessNotice("Booking link email sent.");
          setTab("bookings");
        }}
        onCreatedMeeting={() => {
          setSuccessNotice("Meeting created and confirmation emailed.");
          setTab("bookings");
          void load();
        }}
      />

      {linkModalOpen ? (
        <ModalOverlay onClose={() => setLinkModalOpen(false)}>
          <div className={modalPanelClass("max-w-[480px]")}>
            <div className={modalHeaderClass}>
              <h2 className="text-lg font-semibold text-gray-900">
                New booking link
              </h2>
              <button
                type="button"
                onClick={() => setLinkModalOpen(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 overflow-y-auto px-5 py-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-gray-700">
                  Title
                </span>
                <input
                  value={linkTitle}
                  onChange={(e) => setLinkTitle(e.target.value)}
                  placeholder="e.g. Discovery call"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-gray-700">
                  Description (optional)
                </span>
                <textarea
                  value={linkDescription}
                  onChange={(e) => setLinkDescription(e.target.value)}
                  rows={2}
                  placeholder="What should the client expect?"
                  className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-gray-700">
                  Duration
                </span>
                <select
                  value={linkDuration}
                  onChange={(e) => setLinkDuration(Number(e.target.value))}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                >
                  {DURATION_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {m} minutes
                    </option>
                  ))}
                </select>
              </label>
              <fieldset>
                <legend className="mb-1.5 text-sm font-medium text-gray-700">
                  Meeting type
                </legend>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setLinkLocationType("online")}
                    className={`rounded-xl border px-3 py-2.5 text-sm font-medium ${
                      linkLocationType === "online"
                        ? "border-[#2563EB] bg-[#EFF6FF] text-[#2563EB]"
                        : "border-gray-200 text-gray-700"
                    }`}
                  >
                    Online
                  </button>
                  <button
                    type="button"
                    onClick={() => setLinkLocationType("in_person")}
                    className={`rounded-xl border px-3 py-2.5 text-sm font-medium ${
                      linkLocationType === "in_person"
                        ? "border-[#2563EB] bg-[#EFF6FF] text-[#2563EB]"
                        : "border-gray-200 text-gray-700"
                    }`}
                  >
                    In person
                  </button>
                </div>
              </fieldset>
              {linkLocationType === "online" ? (
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-gray-700">
                    Video provider
                  </span>
                  <select
                    value={linkOnlineProvider}
                    onChange={(e) =>
                      setLinkOnlineProvider(e.target.value as OnlineProvider)
                    }
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                  >
                    <option value="google_meet">Google Meet</option>
                    <option value="zoom">Zoom</option>
                  </select>
                  {linkOnlineProvider === "google_meet" && !gcalConnected ? (
                    <p className="mt-1.5 text-xs text-amber-700">
                      Connect Google Calendar on the Integrations tab first.
                    </p>
                  ) : null}
                  {linkOnlineProvider === "zoom" && !zoomConnected ? (
                    <p className="mt-1.5 text-xs text-amber-700">
                      Connect Zoom on the Integrations tab first.
                    </p>
                  ) : null}
                </label>
              ) : (
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-gray-700">
                    Location
                  </span>
                  <input
                    value={linkLocationDetails}
                    onChange={(e) => setLinkLocationDetails(e.target.value)}
                    placeholder="Address or place"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                  />
                </label>
              )}
            </div>
            <div className={modalFooterClass}>
              <button
                type="button"
                onClick={() => setLinkModalOpen(false)}
                className="rounded-full px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void createLink()}
                disabled={savingLink}
                className="rounded-full bg-[#2563EB] px-4 py-2 text-sm font-medium text-white hover:bg-[#1d4ed8] disabled:opacity-60"
              >
                {savingLink ? "Creating…" : "Create link"}
              </button>
            </div>
          </div>
        </ModalOverlay>
      ) : null}
    </div>
  );
}

function bookingTitle(booking: BookingRow) {
  return booking.title || booking.link_title || "Meeting";
}

function BookingListItem({
  booking,
  timezone,
  busy,
  onOpen,
  onEdit,
  onSendInvite,
  onCancel,
}: {
  booking: BookingRow;
  timezone: string;
  busy?: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onSendInvite: () => void;
  onCancel: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handlePointer(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen]);

  const scheduled = booking.status === "scheduled";

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 text-left"
      >
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-gray-900">
            {booking.guest_name}
          </p>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              booking.status === "scheduled"
                ? "bg-[#EFF6FF] text-[#2563EB]"
                : booking.status === "cancelled"
                  ? "bg-gray-100 text-gray-500"
                  : "bg-emerald-50 text-emerald-700"
            }`}
          >
            {booking.status}
          </span>
        </div>
        <p className="mt-0.5 text-sm text-gray-500">
          {booking.guest_email}
          {` · ${bookingTitle(booking)}`}
        </p>
        <p className="mt-1 text-sm text-gray-700">
          {formatInZone(booking.starts_at, timezone, {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
          {" – "}
          {formatInZone(booking.ends_at, timezone, {
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>
        {booking.guest_notes ? (
          <p className="mt-1 text-xs text-gray-500">{booking.guest_notes}</p>
        ) : null}
      </button>

      <div className="flex shrink-0 items-center gap-2 self-start">
        {booking.meeting_url && scheduled ? (
          <a
            href={booking.meeting_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-1.5 text-xs font-medium text-[#2563EB] hover:bg-[#DBEAFE]"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Go to meeting
          </a>
        ) : null}

        <div
          ref={menuRef}
          className="relative inline-flex"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Meeting actions"
            disabled={busy}
            onClick={() => setMenuOpen((open) => !open)}
            className={`rounded-lg border p-2 transition-colors disabled:opacity-50 ${
              menuOpen
                ? "border-gray-300 bg-gray-50 text-gray-900"
                : "border-transparent text-gray-400 hover:border-gray-200 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-0 z-50 mt-1.5 w-[200px] rounded-2xl border border-gray-200 bg-white py-1.5 shadow-[0_12px_40px_rgba(16,24,40,0.14)]"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onOpen();
                }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-gray-800 hover:bg-gray-50"
              >
                <ExternalLink className="h-4 w-4 shrink-0 text-gray-400" />
                View details
              </button>
              {scheduled ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={busy}
                    onClick={() => {
                      setMenuOpen(false);
                      onSendInvite();
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <Mail className="h-4 w-4 shrink-0 text-[#2563EB]" />
                    Send invite
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onEdit();
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-gray-800 hover:bg-gray-50"
                  >
                    <Pencil className="h-4 w-4 shrink-0 text-gray-400" />
                    Edit
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={busy}
                    onClick={() => {
                      setMenuOpen(false);
                      onCancel();
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    <Ban className="h-4 w-4 shrink-0" />
                    Cancel
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function BookingsMonthView({
  month,
  onMonthChange,
  bookings,
  timezone,
  busyId,
  onOpen,
  onEdit,
  onSendInvite,
  onCancel,
}: {
  month: Date;
  onMonthChange: (next: Date) => void;
  bookings: BookingRow[];
  timezone: string;
  busyId?: string | null;
  onOpen: (booking: BookingRow) => void;
  onEdit: (booking: BookingRow) => void;
  onSendInvite: (booking: BookingRow) => void;
  onCancel: (booking: BookingRow) => void;
}) {
  const [selectedYmd, setSelectedYmd] = useState<string | null>(null);

  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDow = (new Date(year, monthIndex, 1).getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells: Array<number | null> = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const byDay = useMemo(() => {
    const map = new Map<string, BookingRow[]>();
    for (const booking of bookings) {
      if (booking.status === "cancelled") continue;
      const ymd = getZonedParts(new Date(booking.starts_at), timezone).date;
      const list = map.get(ymd) || [];
      list.push(booking);
      map.set(ymd, list);
    }
    return map;
  }, [bookings, timezone]);

  const monthLabel = month.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const selectedBookings = selectedYmd ? byDay.get(selectedYmd) || [] : [];

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <button
            type="button"
            onClick={() =>
              onMonthChange(new Date(year, monthIndex - 1, 1))
            }
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-50"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <p className="text-sm font-semibold text-gray-900">{monthLabel}</p>
          <button
            type="button"
            onClick={() =>
              onMonthChange(new Date(year, monthIndex + 1, 1))
            }
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-50"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-px bg-gray-100 p-px">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div
              key={d}
              className="bg-white px-1 py-2 text-center text-[11px] font-medium text-gray-400"
            >
              {d}
            </div>
          ))}
          {cells.map((day, index) => {
            if (!day) {
              return <div key={`e-${index}`} className="min-h-[72px] bg-white" />;
            }
            const ymd = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const dayBookings = byDay.get(ymd) || [];
            const selected = selectedYmd === ymd;
            return (
              <button
                key={ymd}
                type="button"
                onClick={() => setSelectedYmd(ymd)}
                className={`min-h-[72px] bg-white p-1.5 text-left transition hover:bg-[#FAFBFC] ${
                  selected ? "ring-2 ring-inset ring-[#2563EB]" : ""
                }`}
              >
                <span className="text-xs font-medium text-gray-700">{day}</span>
                <div className="mt-1 space-y-0.5">
                  {dayBookings.slice(0, 2).map((b) => (
                    <div
                      key={b.id}
                      className="truncate rounded bg-[#EFF6FF] px-1 py-0.5 text-[10px] font-medium text-[#2563EB]"
                    >
                      {formatInZone(b.starts_at, timezone, {
                        hour: "numeric",
                        minute: "2-digit",
                      })}{" "}
                      {b.guest_name}
                    </div>
                  ))}
                  {dayBookings.length > 2 ? (
                    <p className="text-[10px] text-gray-400">
                      +{dayBookings.length - 2} more
                    </p>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selectedYmd ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-700">
            {new Date(`${selectedYmd}T12:00:00`).toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
          {selectedBookings.length === 0 ? (
            <p className="text-sm text-gray-500">No meetings this day.</p>
          ) : (
            selectedBookings.map((booking) => (
              <BookingListItem
                key={booking.id}
                booking={booking}
                timezone={timezone}
                busy={busyId === booking.id}
                onOpen={() => onOpen(booking)}
                onEdit={() => onEdit(booking)}
                onSendInvite={() => onSendInvite(booking)}
                onCancel={() => onCancel(booking)}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function CalendarPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-gray-500">
          Loading calendar…
        </div>
      }
    >
      <CalendarPageInner />
    </Suspense>
  );
}
