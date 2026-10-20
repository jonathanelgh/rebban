"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ExternalLink, Mail, Trash2, X } from "lucide-react";
import {
  ModalOverlay,
  modalBodyClass,
  modalFooterClass,
  modalHeaderClass,
  modalPanelClass,
} from "@/components/ModalFrame";
import { DURATION_OPTIONS } from "@/lib/booking/slots";
import { formatInZone, getZonedParts } from "@/lib/booking/timezone";

export type MeetingBooking = {
  id: string;
  guest_name: string;
  guest_email: string;
  guest_notes: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  booking_link_id: string | null;
  title: string | null;
  link_title: string | null;
  meeting_url: string | null;
  location_type: "in_person" | "online" | null;
  online_provider: "google_meet" | "zoom" | null;
  location_details: string | null;
};

function meetingTitle(booking: MeetingBooking) {
  return booking.title?.trim() || booking.link_title || "Meeting";
}

function durationFromBooking(booking: MeetingBooking) {
  const mins = Math.round(
    (new Date(booking.ends_at).getTime() -
      new Date(booking.starts_at).getTime()) /
      60_000
  );
  if ((DURATION_OPTIONS as readonly number[]).includes(mins)) return mins;
  return DURATION_OPTIONS.reduce((best, option) =>
    Math.abs(option - mins) < Math.abs(best - mins) ? option : best
  );
}

type Props = {
  open: boolean;
  booking: MeetingBooking | null;
  timezone: string;
  onClose: () => void;
  onUpdated: (booking: MeetingBooking) => void;
  onCancelled: (bookingId: string) => void;
};

export function MeetingDetailsModal({
  open,
  booking,
  timezone,
  onClose,
  onUpdated,
  onCancelled,
}: Props) {
  const [title, setTitle] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestNotes, setGuestNotes] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState(30);
  const [locationDetails, setLocationDetails] = useState("");
  const [notifyGuest, setNotifyGuest] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !booking) return;
    const parts = getZonedParts(new Date(booking.starts_at), timezone);
    setTitle(meetingTitle(booking));
    setGuestName(booking.guest_name);
    setGuestEmail(booking.guest_email);
    setGuestNotes(booking.guest_notes || "");
    setDate(parts.date);
    setTime(
      `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`
    );
    setDuration(durationFromBooking(booking));
    setLocationDetails(booking.location_details || "");
    setNotifyGuest(true);
    setError(null);
    setNotice(null);
    setSaving(false);
    setSending(false);
    setCancelling(false);
  }, [open, booking, timezone]);

  const scheduled = booking?.status === "scheduled";
  const whereLabel = useMemo(() => {
    if (!booking) return "";
    if (booking.location_type === "in_person") {
      return booking.location_details?.trim() || "In person";
    }
    if (booking.online_provider === "zoom") return "Zoom";
    if (booking.online_provider === "google_meet") return "Google Meet";
    return "Online";
  }, [booking]);

  if (!open || !booking) return null;

  async function save() {
    if (!booking || !scheduled) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/calendar/bookings/${booking.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          guest_name: guestName.trim(),
          guest_email: guestEmail.trim(),
          guest_notes: guestNotes.trim() || null,
          date,
          time,
          duration_minutes: duration,
          location_details:
            booking.location_type === "in_person"
              ? locationDetails.trim() || null
              : undefined,
          notify_guest: notifyGuest,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        booking?: MeetingBooking;
      };
      if (!res.ok) {
        setError(json.error || "Could not save changes");
        setSaving(false);
        return;
      }
      if (json.booking) {
        onUpdated({
          ...booking,
          ...json.booking,
          link_title: booking.link_title,
        });
      }
      setNotice(
        notifyGuest ? "Meeting updated and invite sent." : "Meeting updated."
      );
    } catch {
      setError("Could not save changes");
    }
    setSaving(false);
  }

  async function sendInvite() {
    if (!booking || !scheduled) return;
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/calendar/bookings/${booking.id}/resend`, {
        method: "POST",
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error || "Could not send invite");
        setSending(false);
        return;
      }
      setNotice("Invite sent.");
    } catch {
      setError("Could not send invite");
    }
    setSending(false);
  }

  async function cancelMeeting() {
    if (!booking || !scheduled) return;
    if (
      !confirm(
        `Cancel meeting with ${booking.guest_name}? They’ll get a cancellation email.`
      )
    ) {
      return;
    }
    setCancelling(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/calendar/bookings/${booking.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notify_guest: true }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error || "Could not cancel meeting");
        setCancelling(false);
        return;
      }
      onCancelled(booking.id);
      onClose();
    } catch {
      setError("Could not cancel meeting");
      setCancelling(false);
    }
  }

  const busy = saving || sending || cancelling;

  return (
    <ModalOverlay onClose={busy ? undefined : onClose}>
      <div className={modalPanelClass("max-w-[560px]")}>
        <div className={modalHeaderClass}>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900">
              Meeting details
            </h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {formatInZone(booking.starts_at, timezone, {
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
              {" · "}
              {whereLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className={modalBodyClass}>
          {error ? (
            <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          {notice ? (
            <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {notice}
            </div>
          ) : null}

          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">
                Title
              </span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={!scheduled || busy}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#2563EB] disabled:bg-gray-50"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">
                  Guest name
                </span>
                <input
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  disabled={!scheduled || busy}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#2563EB] disabled:bg-gray-50"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">
                  Guest email
                </span>
                <input
                  type="email"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  disabled={!scheduled || busy}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#2563EB] disabled:bg-gray-50"
                />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block sm:col-span-1">
                <span className="mb-1 block text-xs font-medium text-gray-600">
                  Date
                </span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  disabled={!scheduled || busy}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#2563EB] disabled:bg-gray-50"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">
                  Time
                </span>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  disabled={!scheduled || busy}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#2563EB] disabled:bg-gray-50"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">
                  Duration
                </span>
                <select
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  disabled={!scheduled || busy}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#2563EB] disabled:bg-gray-50"
                >
                  {DURATION_OPTIONS.map((mins) => (
                    <option key={mins} value={mins}>
                      {mins} min
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {booking.location_type === "in_person" ? (
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">
                  Location
                </span>
                <input
                  value={locationDetails}
                  onChange={(e) => setLocationDetails(e.target.value)}
                  disabled={!scheduled || busy}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#2563EB] disabled:bg-gray-50"
                  placeholder="Address or place"
                />
              </label>
            ) : null}
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">
                Notes
              </span>
              <textarea
                value={guestNotes}
                onChange={(e) => setGuestNotes(e.target.value)}
                disabled={!scheduled || busy}
                rows={3}
                className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#2563EB] disabled:bg-gray-50"
              />
            </label>

            {booking.meeting_url ? (
              <a
                href={booking.meeting_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-3.5 py-2 text-sm font-medium text-[#2563EB] hover:bg-[#DBEAFE]"
              >
                <ExternalLink className="h-4 w-4" />
                Go to meeting
              </a>
            ) : null}

            {scheduled ? (
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={notifyGuest}
                  onChange={(e) => setNotifyGuest(e.target.checked)}
                  disabled={busy}
                  className="rounded border-gray-300 text-[#2563EB] focus:ring-[#2563EB]"
                />
                Email guest about these changes
              </label>
            ) : (
              <p className="text-sm text-gray-500">
                This meeting is {booking.status}.
              </p>
            )}
          </div>
        </div>

        <div className={modalFooterClass}>
          {scheduled ? (
            <>
              <button
                type="button"
                onClick={() => void cancelMeeting()}
                disabled={busy}
                className="mr-auto inline-flex items-center gap-1.5 rounded-full border border-red-200 px-3.5 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                {cancelling ? "Cancelling…" : "Cancel"}
              </button>
              <button
                type="button"
                onClick={() => void sendInvite()}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <Mail className="h-4 w-4" />
                {sending ? "Sending…" : "Send invite"}
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={busy}
                className="inline-flex items-center justify-center rounded-full bg-[#2563EB] px-4 py-2 text-sm font-medium text-white hover:bg-[#1d4ed8] disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </ModalOverlay>
  );
}
