"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Clock, Globe } from "lucide-react";
import {
  addDaysYmd,
  formatInZone,
  getZonedParts,
} from "@/lib/booking/timezone";
import {
  detectBrowserTimeZone,
  enumerateMonthDays,
  monthGridStartYmd,
  timeZonesForPicker,
  type SlotOption,
} from "@/lib/booking/slots";

type LinkInfo = {
  title: string;
  description: string | null;
  duration_minutes: number;
  timezone: string;
  host_timezone?: string;
  location_type?: "in_person" | "online" | null;
  online_provider?: "google_meet" | "zoom" | null;
  location_details?: string | null;
  host?: { name: string | null; avatar_url: string | null };
  organization: { name: string | null; logo_url: string | null };
};

type Step = "date" | "time" | "details" | "done";

function SkeletonBar({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-gray-200/80 ${className}`}
      aria-hidden
    />
  );
}

function BookingPageSkeleton() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F8FAFC] px-4 py-8 sm:py-12">
      <div
        className="flex h-[40rem] w-full max-w-4xl overflow-hidden rounded-[1.75rem] border border-gray-200 bg-white sm:rounded-[2rem]"
        aria-busy="true"
        aria-label="Loading booking page"
      >
        <div className="grid h-full w-full sm:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          <div className="border-b border-gray-100 p-6 sm:border-b-0 sm:border-r sm:p-8">
            <div className="h-14 w-14 animate-pulse rounded-full bg-gray-200/80" />
            <SkeletonBar className="mt-5 h-3 w-28" />
            <SkeletonBar className="mt-3 h-6 w-44 max-w-full" />
            <SkeletonBar className="mt-3 h-3 w-full max-w-[90%]" />
            <SkeletonBar className="mt-2 h-3 w-3/4 max-w-[70%]" />
            <div className="mt-5 space-y-2">
              <SkeletonBar className="h-3 w-20" />
              <SkeletonBar className="h-3 w-32" />
            </div>
          </div>
          <div className="flex h-full flex-col p-5 sm:p-8">
            <SkeletonBar className="mb-4 h-4 w-28" />
            <div className="mb-4 flex items-center justify-between">
              <SkeletonBar className="h-4 w-32" />
              <div className="flex gap-1">
                <div className="h-7 w-7 animate-pulse rounded-lg bg-gray-100" />
                <div className="h-7 w-7 animate-pulse rounded-lg bg-gray-100" />
              </div>
            </div>
            <div className="mb-1 grid grid-cols-7 gap-1">
              {Array.from({ length: 7 }).map((_, i) => (
                <SkeletonBar key={i} className="mx-auto h-2.5 w-6" />
              ))}
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 gap-1">
              {Array.from({ length: 42 }).map((_, i) => (
                <div
                  key={i}
                  className="animate-pulse rounded-lg bg-gray-100"
                />
              ))}
            </div>
          </div>
        </div>
      </div>
      <p className="mt-6 text-center text-xs text-gray-400">Powered by Rebban</p>
    </div>
  );
}

function TimeSlotsSkeleton() {
  return (
    <div
      className="grid max-h-72 grid-cols-2 gap-2 sm:max-h-96"
      aria-busy="true"
      aria-label="Loading times"
    >
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="h-10 animate-pulse rounded-xl bg-gray-100"
        />
      ))}
    </div>
  );
}

export default function PublicBookingPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [link, setLink] = useState<LinkInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [guestTimezone, setGuestTimezone] = useState(() =>
    detectBrowserTimeZone()
  );

  const nowParts = getZonedParts(new Date(), guestTimezone);
  const [viewYear, setViewYear] = useState(() =>
    Number(nowParts.date.slice(0, 4))
  );
  const [viewMonth, setViewMonth] = useState(
    () => Number(nowParts.date.slice(5, 7)) - 1
  );
  const [availableDates, setAvailableDates] = useState<Set<string>>(new Set());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<SlotOption[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<SlotOption | null>(null);

  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestNotes, setGuestNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<Step>("date");
  const [confirmed, setConfirmed] = useState<{
    starts_at: string;
    ends_at: string;
    title: string;
    meeting_url?: string | null;
    location_type?: string | null;
    online_provider?: string | null;
    location_details?: string | null;
  } | null>(null);

  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        month: "long",
        year: "numeric",
      }).format(new Date(Date.UTC(viewYear, viewMonth, 1))),
    [viewYear, viewMonth]
  );

  const gridDays = useMemo(() => {
    const start = monthGridStartYmd(viewYear, viewMonth);
    const days: string[] = [];
    for (let i = 0; i < 42; i++) days.push(addDaysYmd(start, i));
    return days;
  }, [viewYear, viewMonth]);

  const loadMonthAvailability = useCallback(async () => {
    if (!token) return;
    const days = enumerateMonthDays(viewYear, viewMonth);
    const from = days[0];
    const to = days[days.length - 1];
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/b/${encodeURIComponent(token)}/slots?from=${from}&to=${to}`
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Booking link not found");
        setLink(null);
        setLoading(false);
        return;
      }
      setLink(data.link);
      setAvailableDates(new Set(data.available_dates || []));
    } catch {
      setError("Could not load booking page");
    }
    setLoading(false);
  }, [token, viewYear, viewMonth]);

  useEffect(() => {
    void loadMonthAvailability();
  }, [loadMonthAvailability]);

  async function selectDate(ymd: string) {
    if (!availableDates.has(ymd)) return;
    setSelectedDate(ymd);
    setSelectedSlot(null);
    setStep("time");
    setSlotsLoading(true);
    try {
      const res = await fetch(
        `/api/b/${encodeURIComponent(token)}/slots?date=${ymd}`
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not load times");
        setSlots([]);
      } else {
        setSlots(data.slots || []);
        if (data.link) setLink(data.link);
      }
    } catch {
      setError("Could not load times");
      setSlots([]);
    }
    setSlotsLoading(false);
  }

  function selectSlot(slot: SlotOption) {
    setSelectedSlot(slot);
    setStep("details");
  }

  async function submitBooking(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSlot) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/b/${encodeURIComponent(token)}/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          starts_at: selectedSlot.starts_at,
          guest_name: guestName,
          guest_email: guestEmail,
          guest_notes: guestNotes,
          guest_timezone: guestTimezone,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not book");
        setSubmitting(false);
        return;
      }
      setConfirmed({
        starts_at: data.starts_at,
        ends_at: data.ends_at,
        title: data.title || link?.title || "Meeting",
        meeting_url: data.meeting_url || null,
        location_type: data.location_type || link?.location_type || null,
        online_provider: data.online_provider || link?.online_provider || null,
        location_details:
          data.location_details || link?.location_details || null,
      });
      setStep("done");
    } catch {
      setError("Could not book");
    }
    setSubmitting(false);
  }

  function shiftMonth(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setViewYear(y);
    setViewMonth(m);
    setSelectedDate(null);
    setSelectedSlot(null);
    setSlots([]);
    setStep("date");
  }

  const hostTimezone =
    link?.host_timezone || link?.timezone || "Europe/Stockholm";
  const todayLocal = getZonedParts(new Date(), guestTimezone).date;
  const timezoneOptions = useMemo(
    () => timeZonesForPicker(guestTimezone, hostTimezone),
    [guestTimezone, hostTimezone]
  );
  const showHostTimezoneHint = guestTimezone !== hostTimezone;

  if (loading && !link) {
    return <BookingPageSkeleton />;
  }

  if (error && !link) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] px-4">
        <div className="max-w-md rounded-[1.75rem] border border-gray-200 bg-white p-8 text-center">
          <p className="text-sm font-medium text-gray-900">{error}</p>
          <p className="mt-2 text-sm text-gray-500">
            This booking link may be inactive or invalid.
          </p>
        </div>
      </div>
    );
  }

  if (!link) return null;

  const hostLabel =
    link.host?.name || link.organization.name || "Book a meeting";
  const hostInitial = hostLabel.slice(0, 1).toUpperCase();

  const meetingInfo = (
    <div className="border-b border-gray-100 p-6 sm:h-full sm:border-b-0 sm:border-r sm:p-8">
      {step === "details" && selectedSlot ? (
        <button
          type="button"
          onClick={() => {
            setStep("time");
            setError(null);
          }}
          className="mb-5 inline-flex items-center gap-1 text-xs font-medium text-[#2563EB] hover:underline"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Back
        </button>
      ) : null}

      {link.host?.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={link.host.avatar_url}
          alt={hostLabel}
          className="h-14 w-14 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#EFF6FF] text-base font-semibold text-[#2563EB]">
          {hostInitial}
        </div>
      )}

      <p className="mt-5 text-sm font-medium text-gray-500">{hostLabel}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-900">
        {link.title}
      </h1>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
        <span className="inline-flex items-center gap-1.5">
          <Clock className="h-4 w-4 text-gray-400" />
          {link.duration_minutes} min
        </span>
        <label className="inline-flex min-w-0 items-center gap-1.5">
          <Globe className="h-4 w-4 shrink-0 text-gray-400" />
          <select
            value={guestTimezone}
            onChange={(e) => setGuestTimezone(e.target.value)}
            className="max-w-[11rem] truncate rounded-md border-0 bg-transparent py-0.5 pr-1 text-sm text-gray-600 outline-none hover:text-gray-900 focus:ring-0"
            aria-label="Your timezone"
          >
            {timezoneOptions.map((tz) => (
              <option key={tz} value={tz}>
                {tz.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <span className="inline-flex items-center gap-1.5">
          {link.location_type === "in_person" ? (
            "In person"
          ) : link.online_provider === "zoom" ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/zoom.svg" alt="" className="h-4 w-4 rounded-sm" />
              Zoom
            </>
          ) : (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/google-meet.svg" alt="" className="h-4 w-4" />
              Google Meet
            </>
          )}
        </span>
      </div>
      {link.location_type === "in_person" && link.location_details ? (
        <p className="mt-2 text-sm text-gray-500">{link.location_details}</p>
      ) : null}
      {link.description ? (
        <p className="mt-3 text-sm leading-relaxed text-gray-500">
          {link.description}
        </p>
      ) : null}
      {selectedSlot && (step === "time" || step === "details") ? (
        <div className="mt-4">
          <p className="text-sm font-medium text-gray-900">
            {formatInZone(selectedSlot.starts_at, guestTimezone, {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
          {showHostTimezoneHint ? (
            <p className="mt-0.5 text-xs text-gray-500">
              {formatInZone(selectedSlot.starts_at, hostTimezone, {
                weekday: "short",
                hour: "numeric",
                minute: "2-digit",
              })}{" "}
              for host ({hostTimezone.replace(/_/g, " ")})
            </p>
          ) : null}
        </div>
      ) : selectedDate && step === "time" ? (
        <p className="mt-4 text-sm font-medium text-gray-900">
          {new Intl.DateTimeFormat(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
            timeZone: "UTC",
          }).format(new Date(`${selectedDate}T12:00:00Z`))}
        </p>
      ) : null}
      {showHostTimezoneHint ? (
        <p className="mt-3 text-xs text-gray-400">
          Times shown in your timezone
        </p>
      ) : null}
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F8FAFC] px-4 py-8 sm:py-12">
      <div className="flex h-[40rem] w-full max-w-4xl overflow-hidden rounded-[1.75rem] border border-gray-200 bg-white sm:rounded-[2rem]">
        {step === "done" && confirmed ? (
          <div className="flex h-full w-full flex-col items-center justify-center px-6 py-12 text-center sm:px-8">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <Check className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-gray-900">
              You&apos;re booked
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              {confirmed.title}
              <br />
              {formatInZone(confirmed.starts_at, guestTimezone, {
                weekday: "long",
                month: "long",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
              <span className="mt-1 block text-xs text-gray-500">
                {guestTimezone.replace(/_/g, " ")}
              </span>
            </p>
            <p className="mt-4 text-sm text-gray-500">
              A confirmation email was sent to {guestEmail}.
            </p>
            {confirmed.meeting_url ? (
              <a
                href={confirmed.meeting_url}
                target="_blank"
                rel="noreferrer"
                className="mt-6 inline-flex rounded-full bg-[#2563EB] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1d4ed8]"
              >
                {confirmed.online_provider === "zoom"
                  ? "Join Zoom"
                  : "Join Google Meet"}
              </a>
            ) : confirmed.location_type === "in_person" &&
              confirmed.location_details ? (
              <p className="mt-4 text-sm text-gray-700">
                Location: {confirmed.location_details}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="grid h-full w-full sm:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
            {meetingInfo}

            {step === "details" && selectedSlot ? (
              <form
                onSubmit={(e) => void submitBooking(e)}
                className="flex h-full flex-col space-y-4 overflow-y-auto p-6 sm:p-8"
              >
                <div>
                  <h2 className="text-base font-semibold text-gray-900">
                    Enter your details
                  </h2>
                  <p className="mt-1 text-sm text-gray-500">
                    We&apos;ll use these to confirm your booking.
                  </p>
                </div>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-gray-700">
                    Your name
                  </span>
                  <input
                    required
                    autoFocus
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-gray-700">
                    Email
                  </span>
                  <input
                    required
                    type="email"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-gray-700">
                    Notes (optional)
                  </span>
                  <textarea
                    value={guestNotes}
                    onChange={(e) => setGuestNotes(e.target.value)}
                    rows={3}
                    className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                  />
                </label>
                {error ? <p className="text-sm text-red-600">{error}</p> : null}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-full bg-[#2563EB] py-2.5 text-sm font-medium text-white hover:bg-[#1d4ed8] disabled:opacity-60"
                >
                  {submitting ? "Booking…" : "Confirm booking"}
                </button>
              </form>
            ) : step === "time" ? (
              <div className="flex h-full min-h-0 flex-col p-6 sm:p-8">
                <button
                  type="button"
                  onClick={() => {
                    setStep("date");
                    setSelectedSlot(null);
                    setSlots([]);
                  }}
                  className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-[#2563EB] hover:underline"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Change date
                </button>
                <h2 className="mb-4 text-sm font-semibold text-gray-900">
                  {selectedDate
                    ? new Intl.DateTimeFormat(undefined, {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                        timeZone: "UTC",
                      }).format(new Date(`${selectedDate}T12:00:00Z`))
                    : "Select a time"}
                </h2>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {slotsLoading ? (
                    <TimeSlotsSkeleton />
                  ) : slots.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      No times left this day.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {slots.map((slot) => {
                        const isOpen = slot.available !== false;
                        const label = formatInZone(
                          slot.starts_at,
                          guestTimezone,
                          {
                            hour: "numeric",
                            minute: "2-digit",
                          }
                        );
                        return (
                          <button
                            key={slot.starts_at}
                            type="button"
                            disabled={!isOpen}
                            onClick={() => {
                              if (isOpen) selectSlot(slot);
                            }}
                            className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                              isOpen
                                ? "border-gray-200 text-gray-800 hover:border-[#2563EB]/40 hover:bg-[#EFF6FF]"
                                : "cursor-not-allowed border-gray-100 bg-gray-50 text-gray-400 line-through"
                            }`}
                          >
                            {label}
                            {!isOpen ? (
                              <span className="ml-1 text-xs font-normal no-underline">
                                Booked
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-0 flex-col p-6 sm:p-8">
                <h2 className="mb-4 shrink-0 text-sm font-semibold text-gray-900">
                  Select a date
                </h2>
                <div className="mb-3 flex shrink-0 items-center justify-between">
                  <p className="text-sm font-medium text-gray-800">
                    {monthLabel}
                  </p>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => shiftMonth(-1)}
                      className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
                      aria-label="Previous month"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => shiftMonth(1)}
                      className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
                      aria-label="Next month"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="mb-1 grid shrink-0 grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase tracking-wide text-gray-400">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                    (d) => (
                      <div key={d}>{d}</div>
                    )
                  )}
                </div>
                <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 gap-1">
                  {gridDays.map((ymd) => {
                    const inMonth =
                      Number(ymd.slice(5, 7)) - 1 === viewMonth &&
                      Number(ymd.slice(0, 4)) === viewYear;
                    if (!inMonth) {
                      return <div key={ymd} aria-hidden className="h-full w-full" />;
                    }
                    const available =
                      availableDates.has(ymd) && ymd >= todayLocal;
                    const selected = selectedDate === ymd;
                    return (
                      <button
                        key={ymd}
                        type="button"
                        disabled={!available}
                        onClick={() => void selectDate(ymd)}
                        className={`flex h-full w-full items-center justify-center rounded-lg text-sm transition ${
                          available
                            ? selected
                              ? "bg-[#2563EB] font-semibold text-white"
                              : "font-medium text-gray-900 hover:bg-[#EFF6FF]"
                            : "text-gray-300"
                        }`}
                      >
                        {Number(ymd.slice(8, 10))}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <p className="mt-6 text-center text-xs text-gray-400">
        Powered by Rebban
      </p>
    </div>
  );
}
