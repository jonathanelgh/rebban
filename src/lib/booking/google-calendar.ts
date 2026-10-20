import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requestOrigin } from "@/lib/email/gmail";
import type { BusyRange } from "@/lib/booking/slots";
import { getZonedParts } from "@/lib/booking/timezone";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const FREEBUSY_URL = "https://www.googleapis.com/calendar/v3/freeBusy";

export const GOOGLE_CALENDAR_EVENTS_SCOPE =
  "https://www.googleapis.com/auth/calendar.events";
export const GOOGLE_CALENDAR_FREEBUSY_SCOPE =
  "https://www.googleapis.com/auth/calendar.freebusy";

const GOOGLE_CALENDAR_SCOPES = [
  GOOGLE_CALENDAR_EVENTS_SCOPE,
  GOOGLE_CALENDAR_FREEBUSY_SCOPE,
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
].join(" ");

function appUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

/** Prefer Calendar-specific OAuth client; fall back to shared Gmail client. */
function googleCalendarClientCredentials() {
  const clientId =
    process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret =
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET ||
    process.env.GOOGLE_CLIENT_SECRET;
  return { clientId, clientSecret };
}

export function isGoogleCalendarOAuthConfigured() {
  const { clientId, clientSecret } = googleCalendarClientCredentials();
  return Boolean(clientId && clientSecret);
}

export function getGoogleCalendarRedirectUri(origin?: string | null) {
  const normalizedOrigin = (origin || "").replace(/\/$/, "");
  const configured = appUrl();

  if (
    normalizedOrigin.startsWith("http://localhost:") ||
    normalizedOrigin.startsWith("http://127.0.0.1:")
  ) {
    return `${normalizedOrigin}/api/google-calendar/callback`;
  }

  if (configured && !configured.includes("localhost")) {
    return `${configured}/api/google-calendar/callback`;
  }

  if (normalizedOrigin) {
    return `${normalizedOrigin}/api/google-calendar/callback`;
  }

  return `${configured}/api/google-calendar/callback`;
}

export { requestOrigin };

export function buildGoogleCalendarAuthUrl(
  state: string,
  redirectUri: string
) {
  const { clientId } = googleCalendarClientCredentials();
  if (!clientId) {
    throw new Error(
      "GOOGLE_CALENDAR_CLIENT_ID (or GOOGLE_CLIENT_ID) is not set."
    );
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
};

async function exchangeCodeForTokens(
  code: string,
  redirectUri: string
): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret } = googleCalendarClientCredentials();
  if (!clientId || !clientSecret) {
    throw new Error("Google Calendar OAuth is not configured.");
  }

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const json = (await res.json()) as GoogleTokenResponse & { error?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error || "Failed to exchange Google auth code.");
  }
  return json;
}

async function refreshAccessToken(
  refreshToken: string
): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret } = googleCalendarClientCredentials();
  if (!clientId || !clientSecret) {
    throw new Error("Google Calendar OAuth is not configured.");
  }

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const json = (await res.json()) as GoogleTokenResponse & { error?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error || "Failed to refresh Google Calendar token.");
  }
  return json;
}

async function fetchGoogleEmail(accessToken: string) {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json()) as { email?: string; error?: string };
  if (!res.ok || !json.email) {
    throw new Error(json.error || "Could not read Google account email.");
  }
  return json.email;
}

function hasRequiredScopes(scope: string | null | undefined) {
  if (!scope) return false;
  const parts = scope.split(/[\s,]+/);
  return (
    parts.includes(GOOGLE_CALENDAR_EVENTS_SCOPE) &&
    parts.includes(GOOGLE_CALENDAR_FREEBUSY_SCOPE)
  );
}

export async function saveGoogleCalendarConnection(options: {
  userId: string;
  organizationId?: string | null;
  code: string;
  redirectUri: string;
}) {
  const tokens = await exchangeCodeForTokens(options.code, options.redirectUri);
  if (!tokens.refresh_token) {
    throw new Error(
      "Google did not return a refresh token. Disconnect Rebban in your Google Account permissions and try again."
    );
  }

  if (!hasRequiredScopes(tokens.scope)) {
    throw new Error(
      "Google did not grant Calendar permission. Enable the Google Calendar API and add calendar.events + calendar.freebusy scopes, then reconnect."
    );
  }

  const email = await fetchGoogleEmail(tokens.access_token);
  const expiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  const supabase = await createClient();

  const { error } = await supabase.from("google_calendar_connections").upsert(
    {
      user_id: options.userId,
      organization_id: options.organizationId || null,
      email,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expiry: expiry,
      scope: tokens.scope || GOOGLE_CALENDAR_SCOPES,
      calendar_id: "primary",
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      revoked_at: null,
    },
    { onConflict: "user_id" }
  );

  if (error) throw new Error(error.message);
  return { email };
}

export async function getGoogleCalendarConnectionStatus(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("google_calendar_connections")
    .select("email, connected_at, revoked_at, scope")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .maybeSingle();

  if (!data) return null;
  return {
    email: data.email,
    connectedAt: data.connected_at,
    canSync: hasRequiredScopes(data.scope),
    scope: data.scope,
  };
}

export async function disconnectGoogleCalendar(userId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("google_calendar_connections")
    .update({
      revoked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .is("revoked_at", null);

  if (error) throw new Error(error.message);
}

function tryAdminClient() {
  try {
    return createAdminClient();
  } catch {
    return null;
  }
}

async function getValidAccessTokenForUser(
  userId: string,
  useAdmin = false
): Promise<{ accessToken: string; email: string; calendarId: string } | null> {
  const admin = useAdmin ? tryAdminClient() : null;
  if (useAdmin && !admin) {
    console.error(
      "[google-calendar] SUPABASE_SERVICE_ROLE_KEY is required to use Calendar from public booking routes."
    );
    return null;
  }
  const supabase = admin || (await createClient());

  const { data } = await supabase
    .from("google_calendar_connections")
    .select(
      "id, email, access_token, refresh_token, token_expiry, calendar_id"
    )
    .eq("user_id", userId)
    .is("revoked_at", null)
    .maybeSingle();

  if (!data) return null;

  const expiresAt = new Date(data.token_expiry).getTime();
  const stillValid = expiresAt - Date.now() > 60_000;

  if (stillValid) {
    return {
      accessToken: data.access_token,
      email: data.email,
      calendarId: data.calendar_id || "primary",
    };
  }

  try {
    const refreshed = await refreshAccessToken(data.refresh_token);
    const expiry = new Date(
      Date.now() + refreshed.expires_in * 1000
    ).toISOString();

    await supabase
      .from("google_calendar_connections")
      .update({
        access_token: refreshed.access_token,
        token_expiry: expiry,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);

    return {
      accessToken: refreshed.access_token,
      email: data.email,
      calendarId: data.calendar_id || "primary",
    };
  } catch (error) {
    console.error("[google-calendar] token refresh failed", error);
    return null;
  }
}

function extractMeetUrl(json: {
  hangoutLink?: string;
  conferenceData?: {
    entryPoints?: Array<{ entryPointType?: string; uri?: string }>;
  };
}) {
  return (
    json.hangoutLink ||
    json.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")
      ?.uri ||
    null
  );
}

/** Format an absolute instant as a floating local dateTime for Google Calendar. */
function toGoogleLocalDateTime(iso: string, timeZone: string) {
  const parts = getZonedParts(new Date(iso), timeZone);
  const hm = `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}:${String(parts.second).padStart(2, "0")}`;
  return `${parts.date}T${hm}`;
}

/** Resolve which org member's Google Calendar to use for a booking link. */
export async function resolveBookingCalendarUserId(options: {
  organizationId: string;
  preferredUserId?: string | null;
}) {
  const admin = tryAdminClient();
  if (!admin) return options.preferredUserId || null;

  if (options.preferredUserId) {
    const { data } = await admin
      .from("google_calendar_connections")
      .select("user_id")
      .eq("user_id", options.preferredUserId)
      .is("revoked_at", null)
      .maybeSingle();
    if (data) return data.user_id;
  }

  const { data: orgConn } = await admin
    .from("google_calendar_connections")
    .select("user_id")
    .eq("organization_id", options.organizationId)
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle();

  return orgConn?.user_id || null;
}

export async function fetchGoogleCalendarBusy(options: {
  userId: string;
  timeMin: string;
  timeMax: string;
}): Promise<BusyRange[]> {
  const auth = await getValidAccessTokenForUser(options.userId, true);
  if (!auth) return [];

  const res = await fetch(FREEBUSY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin: options.timeMin,
      timeMax: options.timeMax,
      items: [{ id: auth.calendarId }],
    }),
  });

  if (!res.ok) {
    console.error("[google-calendar] freeBusy failed", await res.text());
    return [];
  }

  const json = (await res.json()) as {
    calendars?: Record<
      string,
      { busy?: Array<{ start?: string; end?: string }> }
    >;
  };

  const busy =
    json.calendars?.[auth.calendarId]?.busy ||
    json.calendars?.primary?.busy ||
    Object.values(json.calendars || {})[0]?.busy ||
    [];

  return busy
    .map((b) => {
      if (!b.start || !b.end) return null;
      const startMs = new Date(b.start).getTime();
      const endMs = new Date(b.end).getTime();
      if (Number.isNaN(startMs) || Number.isNaN(endMs) || startMs >= endMs) {
        return null;
      }
      return {
        starts_at: new Date(startMs).toISOString(),
        ends_at: new Date(endMs).toISOString(),
      };
    })
    .filter((r): r is BusyRange => r !== null);
}

export async function createGoogleCalendarEvent(options: {
  userId: string;
  summary: string;
  description?: string | null;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  attendeeEmail?: string | null;
  attendeeName?: string | null;
  location?: string | null;
  createGoogleMeet?: boolean;
}): Promise<{ eventId: string; meetUrl: string | null } | null> {
  const auth = await getValidAccessTokenForUser(options.userId, true);
  if (!auth) return null;

  const body: Record<string, unknown> = {
    summary: options.summary,
    description: options.description || undefined,
    location: options.location || undefined,
    start: {
      dateTime: toGoogleLocalDateTime(options.startsAt, options.timeZone),
      timeZone: options.timeZone,
    },
    end: {
      dateTime: toGoogleLocalDateTime(options.endsAt, options.timeZone),
      timeZone: options.timeZone,
    },
  };

  if (options.attendeeEmail) {
    body.attendees = [
      {
        email: options.attendeeEmail,
        displayName: options.attendeeName || undefined,
      },
    ];
  }

  if (options.createGoogleMeet) {
    body.conferenceData = {
      createRequest: {
        requestId: `rebban-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }

  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(auth.calendarId)}/events`
  );
  // Guest gets Meet details from our confirmation email; avoid duplicate Google invites.
  url.searchParams.set("sendUpdates", "none");
  if (options.createGoogleMeet) {
    url.searchParams.set("conferenceDataVersion", "1");
  }

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.error("[google-calendar] create event failed", await res.text());
    return null;
  }

  const json = (await res.json()) as {
    id?: string;
    hangoutLink?: string;
    conferenceData?: {
      entryPoints?: Array<{ entryPointType?: string; uri?: string }>;
      createRequest?: { status?: { statusCode?: string } };
    };
  };

  if (!json.id) return null;

  let meetUrl = extractMeetUrl(json);

  // Meet link can lag the create response — fetch once more.
  if (options.createGoogleMeet && !meetUrl) {
    try {
      const getUrl = new URL(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(auth.calendarId)}/events/${encodeURIComponent(json.id)}`
      );
      getUrl.searchParams.set("conferenceDataVersion", "1");
      const getRes = await fetch(getUrl.toString(), {
        headers: { Authorization: `Bearer ${auth.accessToken}` },
      });
      if (getRes.ok) {
        const full = (await getRes.json()) as typeof json;
        meetUrl = extractMeetUrl(full);
      }
    } catch (error) {
      console.error("[google-calendar] meet url refetch failed", error);
    }
  }

  if (options.createGoogleMeet && !meetUrl) {
    console.error(
      "[google-calendar] event created without Meet link",
      json.conferenceData?.createRequest?.status || json.conferenceData
    );
  }

  return { eventId: json.id, meetUrl };
}

export async function updateGoogleCalendarEvent(options: {
  userId: string;
  eventId: string;
  summary?: string;
  description?: string | null;
  startsAt?: string;
  endsAt?: string;
  timeZone?: string;
  attendeeEmail?: string | null;
  attendeeName?: string | null;
  location?: string | null;
}): Promise<boolean> {
  const auth = await getValidAccessTokenForUser(options.userId, true);
  if (!auth) return false;

  const body: Record<string, unknown> = {};
  if (options.summary !== undefined) body.summary = options.summary;
  if (options.description !== undefined) {
    body.description = options.description || undefined;
  }
  if (options.location !== undefined) {
    body.location = options.location || undefined;
  }
  if (options.startsAt && options.endsAt && options.timeZone) {
    body.start = {
      dateTime: toGoogleLocalDateTime(options.startsAt, options.timeZone),
      timeZone: options.timeZone,
    };
    body.end = {
      dateTime: toGoogleLocalDateTime(options.endsAt, options.timeZone),
      timeZone: options.timeZone,
    };
  }
  if (options.attendeeEmail) {
    body.attendees = [
      {
        email: options.attendeeEmail,
        displayName: options.attendeeName || undefined,
      },
    ];
  }

  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(auth.calendarId)}/events/${encodeURIComponent(options.eventId)}`
  );
  url.searchParams.set("sendUpdates", "none");

  const res = await fetch(url.toString(), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.error("[google-calendar] update event failed", await res.text());
    return false;
  }
  return true;
}

export async function deleteGoogleCalendarEvent(options: {
  userId: string;
  eventId: string;
}): Promise<boolean> {
  const auth = await getValidAccessTokenForUser(options.userId, true);
  if (!auth) return false;

  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(auth.calendarId)}/events/${encodeURIComponent(options.eventId)}`
  );
  url.searchParams.set("sendUpdates", "none");

  const res = await fetch(url.toString(), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${auth.accessToken}` },
  });

  // 404/410 = already gone
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    console.error("[google-calendar] delete event failed", await res.text());
    return false;
  }
  return true;
}

/** Get host user id for a public booking token (created_by or org calendar owner). */
export async function getHostUserIdForBookingToken(token: string) {
  const admin = tryAdminClient();
  if (!admin) return null;

  const { data: link } = await admin
    .from("booking_links")
    .select("id, organization_id, created_by")
    .eq("public_token", token)
    .is("deleted_at", null)
    .eq("is_active", true)
    .maybeSingle();

  if (!link) return null;

  return resolveBookingCalendarUserId({
    organizationId: link.organization_id,
    preferredUserId: link.created_by,
  });
}

export async function mergeGoogleBusyForToken(options: {
  token: string;
  timeMin: string;
  timeMax: string;
  existing: BusyRange[];
}): Promise<BusyRange[]> {
  try {
    const userId = await getHostUserIdForBookingToken(options.token);
    if (!userId) return options.existing;
    const googleBusy = await fetchGoogleCalendarBusy({
      userId,
      timeMin: options.timeMin,
      timeMax: options.timeMax,
    });
    return [...options.existing, ...googleBusy];
  } catch (error) {
    console.error("[google-calendar] merge busy failed", error);
    return options.existing;
  }
}
