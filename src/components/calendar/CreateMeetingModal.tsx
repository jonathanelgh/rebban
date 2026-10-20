"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import {
  ModalOverlay,
  modalFooterClass,
  modalHeaderClass,
  modalPanelClass,
} from "@/components/ModalFrame";
import { DURATION_OPTIONS } from "@/lib/booking/slots";

export type MeetingContact = {
  id: string;
  kind: "client" | "lead";
  name: string;
  email: string | null;
  company: string | null;
};

export type MeetingLinkOption = {
  id: string;
  title: string;
  duration_minutes: number;
  is_active: boolean;
  location_type: "in_person" | "online";
  online_provider: "google_meet" | "zoom" | null;
  location_details: string | null;
};

type Mode = "send_link" | "schedule";
type LocationType = "in_person" | "online";
type OnlineProvider = "google_meet" | "zoom";

type Props = {
  open: boolean;
  onClose: () => void;
  contacts: MeetingContact[];
  links: MeetingLinkOption[];
  gcalConnected: boolean;
  zoomConnected: boolean;
  onSentLink: () => void;
  onCreatedMeeting: () => void;
};

export function CreateMeetingModal({
  open,
  onClose,
  contacts,
  links,
  gcalConnected,
  zoomConnected,
  onSentLink,
  onCreatedMeeting,
}: Props) {
  const [mode, setMode] = useState<Mode>("send_link");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    null
  );
  const [linkId, setLinkId] = useState("");
  const [title, setTitle] = useState("Meeting");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState(30);
  const [locationType, setLocationType] = useState<LocationType>("online");
  const [onlineProvider, setOnlineProvider] =
    useState<OnlineProvider>("google_meet");
  const [locationDetails, setLocationDetails] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode("send_link");
    setGuestName("");
    setGuestEmail("");
    setSelectedContactId(null);
    setLinkId(links.find((l) => l.is_active)?.id || links[0]?.id || "");
    setTitle("Meeting");
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setDate(tomorrow.toISOString().slice(0, 10));
    setTime("10:00");
    setDuration(30);
    setLocationType("online");
    setOnlineProvider("google_meet");
    setLocationDetails("");
    setError(null);
    setSaving(false);
  }, [open, links]);

  useEffect(() => {
    if (mode !== "send_link" || !linkId) return;
    const link = links.find((l) => l.id === linkId);
    if (!link) return;
    setTitle(link.title);
    setDuration(link.duration_minutes);
    setLocationType(link.location_type);
    if (link.online_provider) setOnlineProvider(link.online_provider);
    setLocationDetails(link.location_details || "");
  }, [mode, linkId, links]);

  function pickContact(contact: MeetingContact | null) {
    if (!contact) {
      setSelectedContactId(null);
      return;
    }
    setSelectedContactId(contact.id);
    setGuestName(contact.name);
    setGuestEmail(contact.email || "");
  }

  async function submit() {
    setError(null);
    const name = guestName.trim();
    const email = guestEmail.trim();
    if (!name) {
      setError("Name is required");
      return;
    }
    if (!email) {
      setError("Email is required");
      return;
    }

    setSaving(true);
    try {
      if (mode === "send_link") {
        if (!linkId) {
          setError("Choose a booking link");
          setSaving(false);
          return;
        }
        const res = await fetch("/api/calendar/send-link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            booking_link_id: linkId,
            guest_name: name,
            guest_email: email,
          }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!res.ok) {
          setError(json.error || "Could not send booking link");
          setSaving(false);
          return;
        }
        onSentLink();
        onClose();
      } else {
        if (locationType === "online" && onlineProvider === "google_meet" && !gcalConnected) {
          setError("Connect Google Calendar first to use Google Meet.");
          setSaving(false);
          return;
        }
        if (locationType === "online" && onlineProvider === "zoom" && !zoomConnected) {
          setError("Connect Zoom first to create Zoom meetings.");
          setSaving(false);
          return;
        }
        const res = await fetch("/api/calendar/create-meeting", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            guest_name: name,
            guest_email: email,
            title: title.trim() || "Meeting",
            date,
            time,
            duration_minutes: duration,
            location_type: locationType,
            online_provider: locationType === "online" ? onlineProvider : null,
            location_details:
              locationType === "in_person" ? locationDetails.trim() || null : null,
          }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!res.ok) {
          setError(json.error || "Could not create meeting");
          setSaving(false);
          return;
        }
        onCreatedMeeting();
        onClose();
      }
    } catch {
      setError("Something went wrong");
    }
    setSaving(false);
  }

  if (!open) return null;

  const activeLinks = links.filter((l) => l.is_active);

  return (
    <ModalOverlay onClose={onClose}>
      <div className={modalPanelClass("max-w-[520px]")}>
        <div className={modalHeaderClass}>
          <h2 className="text-lg font-semibold text-gray-900">Create meeting</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <ContactPicker
            contacts={contacts}
            selectedId={selectedContactId}
            onPick={pickContact}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-gray-700">
                Name
              </span>
              <input
                value={guestName}
                onChange={(e) => {
                  setGuestName(e.target.value);
                  setSelectedContactId(null);
                }}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-gray-700">
                Email
              </span>
              <input
                type="email"
                value={guestEmail}
                onChange={(e) => {
                  setGuestEmail(e.target.value);
                  setSelectedContactId(null);
                }}
                placeholder="name@company.com"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
              />
            </label>
          </div>

          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-gray-700">
              What do you want to do?
            </legend>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode("send_link")}
                className={`rounded-xl border px-3 py-2.5 text-left text-sm ${
                  mode === "send_link"
                    ? "border-[#2563EB] bg-[#EFF6FF] text-[#2563EB]"
                    : "border-gray-200 text-gray-700"
                }`}
              >
                <span className="block font-medium">Send booking link</span>
                <span className="mt-0.5 block text-xs opacity-80">
                  They pick a time
                </span>
              </button>
              <button
                type="button"
                onClick={() => setMode("schedule")}
                className={`rounded-xl border px-3 py-2.5 text-left text-sm ${
                  mode === "schedule"
                    ? "border-[#2563EB] bg-[#EFF6FF] text-[#2563EB]"
                    : "border-gray-200 text-gray-700"
                }`}
              >
                <span className="block font-medium">Schedule meeting</span>
                <span className="mt-0.5 block text-xs opacity-80">
                  You already have a time
                </span>
              </button>
            </div>
          </fieldset>

          {mode === "send_link" ? (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-gray-700">
                Booking link
              </span>
              {activeLinks.length === 0 ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Create an active booking link first on the Booking links tab.
                </p>
              ) : (
                <select
                  value={linkId}
                  onChange={(e) => setLinkId(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                >
                  {activeLinks.map((link) => (
                    <option key={link.id} value={link.id}>
                      {link.title} · {link.duration_minutes} min
                    </option>
                  ))}
                </select>
              )}
            </label>
          ) : (
            <>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-gray-700">
                  Title
                </span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block sm:col-span-1">
                  <span className="mb-1.5 block text-sm font-medium text-gray-700">
                    Date
                  </span>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-gray-700">
                    Time
                  </span>
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-gray-700">
                    Duration
                  </span>
                  <select
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                  >
                    {DURATION_OPTIONS.map((m) => (
                      <option key={m} value={m}>
                        {m} min
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <fieldset>
                <legend className="mb-1.5 text-sm font-medium text-gray-700">
                  Meeting type
                </legend>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setLocationType("online")}
                    className={`rounded-xl border px-3 py-2.5 text-sm font-medium ${
                      locationType === "online"
                        ? "border-[#2563EB] bg-[#EFF6FF] text-[#2563EB]"
                        : "border-gray-200 text-gray-700"
                    }`}
                  >
                    Online
                  </button>
                  <button
                    type="button"
                    onClick={() => setLocationType("in_person")}
                    className={`rounded-xl border px-3 py-2.5 text-sm font-medium ${
                      locationType === "in_person"
                        ? "border-[#2563EB] bg-[#EFF6FF] text-[#2563EB]"
                        : "border-gray-200 text-gray-700"
                    }`}
                  >
                    In person
                  </button>
                </div>
              </fieldset>
              {locationType === "online" ? (
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-gray-700">
                    Video provider
                  </span>
                  <select
                    value={onlineProvider}
                    onChange={(e) =>
                      setOnlineProvider(e.target.value as OnlineProvider)
                    }
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                  >
                    <option value="google_meet">Google Meet</option>
                    <option value="zoom">Zoom</option>
                  </select>
                </label>
              ) : (
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-gray-700">
                    Location
                  </span>
                  <input
                    value={locationDetails}
                    onChange={(e) => setLocationDetails(e.target.value)}
                    placeholder="Address or place"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                  />
                </label>
              )}
            </>
          )}
        </div>

        <div className={modalFooterClass}>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={
              saving || (mode === "send_link" && activeLinks.length === 0)
            }
            className="rounded-full bg-[#2563EB] px-4 py-2 text-sm font-medium text-white hover:bg-[#1d4ed8] disabled:opacity-60"
          >
            {saving
              ? mode === "send_link"
                ? "Sending…"
                : "Creating…"
              : mode === "send_link"
                ? "Send link"
                : "Create meeting"}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function ContactPicker({
  contacts,
  selectedId,
  onPick,
}: {
  contacts: MeetingContact[];
  selectedId: string | null;
  onPick: (contact: MeetingContact | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const selected = contacts.find((c) => c.id === selectedId) || null;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.email || "").toLowerCase().includes(q) ||
        (c.company || "").toLowerCase().includes(q)
    );
  }, [contacts, search]);

  return (
    <div className="relative" ref={rootRef}>
      <span className="mb-1.5 block text-sm font-medium text-gray-700">
        Lead or client (optional)
      </span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left text-sm hover:bg-gray-50"
      >
        <span className="min-w-0 flex-1 truncate text-gray-900">
          {selected ? (
            <>
              {selected.name}
              {selected.email ? (
                <span className="text-gray-500"> · {selected.email}</span>
              ) : null}
            </>
          ) : (
            <span className="text-gray-400">Search leads and clients…</span>
          )}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
      </button>
      {open ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_16px_40px_-12px_rgba(16,24,40,0.18)]">
          <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2.5">
            <Search className="h-4 w-4 text-gray-400" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
            />
          </div>
          <div className="max-h-[220px] overflow-y-auto p-2">
            <button
              type="button"
              onClick={() => {
                onPick(null);
                setOpen(false);
                setSearch("");
              }}
              className="mb-1 w-full rounded-xl px-3 py-2 text-left text-sm text-gray-500 hover:bg-gray-50"
            >
              Type an email instead
            </button>
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-gray-400">
                No matches
              </p>
            ) : (
              filtered.map((contact) => (
                <button
                  key={contact.id}
                  type="button"
                  onClick={() => {
                    onPick(contact);
                    setOpen(false);
                    setSearch("");
                  }}
                  className="flex w-full flex-col rounded-xl px-3 py-2 text-left hover:bg-[#EFF6FF]"
                >
                  <span className="text-sm font-medium text-gray-900">
                    {contact.name}
                    <span className="ml-2 text-xs font-normal text-gray-400">
                      {contact.kind}
                    </span>
                  </span>
                  <span className="truncate text-xs text-gray-500">
                    {[contact.email, contact.company].filter(Boolean).join(" · ") ||
                      "No email"}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
