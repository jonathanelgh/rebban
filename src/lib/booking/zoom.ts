import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requestOrigin } from "@/lib/email/gmail";

const ZOOM_AUTH_URL = "https://zoom.us/oauth/authorize";
const ZOOM_TOKEN_URL = "https://zoom.us/oauth/token";
const ZOOM_API = "https://api.zoom.us/v2";

function appUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export function isZoomOAuthConfigured() {
  return Boolean(process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET);
}

export function getZoomRedirectUri(origin?: string | null) {
  const normalizedOrigin = (origin || "").replace(/\/$/, "");
  const configured = appUrl();

  if (
    normalizedOrigin.startsWith("http://localhost:") ||
    normalizedOrigin.startsWith("http://127.0.0.1:")
  ) {
    return `${normalizedOrigin}/api/zoom/callback`;
  }

  if (configured && !configured.includes("localhost")) {
    return `${configured}/api/zoom/callback`;
  }

  if (normalizedOrigin) {
    return `${normalizedOrigin}/api/zoom/callback`;
  }

  return `${configured}/api/zoom/callback`;
}

export { requestOrigin };

export function buildZoomAuthUrl(state: string, redirectUri: string) {
  const clientId = process.env.ZOOM_CLIENT_ID;
  if (!clientId) throw new Error("ZOOM_CLIENT_ID is not set.");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
  });

  return `${ZOOM_AUTH_URL}?${params.toString()}`;
}

type ZoomTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
};

async function exchangeCodeForTokens(
  code: string,
  redirectUri: string
): Promise<ZoomTokenResponse> {
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Zoom OAuth is not configured.");
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(ZOOM_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  const json = (await res.json()) as ZoomTokenResponse & {
    error?: string;
    reason?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(json.reason || json.error || "Failed to exchange Zoom code.");
  }
  return json;
}

async function refreshAccessToken(
  refreshToken: string
): Promise<ZoomTokenResponse> {
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Zoom OAuth is not configured.");
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(ZOOM_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  const json = (await res.json()) as ZoomTokenResponse & {
    error?: string;
    reason?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(json.reason || json.error || "Failed to refresh Zoom token.");
  }
  return json;
}

async function fetchZoomMe(accessToken: string) {
  const res = await fetch(`${ZOOM_API}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json()) as {
    id?: string;
    email?: string;
    message?: string;
  };
  if (!res.ok || !json.email) {
    throw new Error(json.message || "Could not read Zoom account.");
  }
  return { id: json.id || null, email: json.email };
}

export async function saveZoomConnection(options: {
  userId: string;
  organizationId?: string | null;
  code: string;
  redirectUri: string;
}) {
  const tokens = await exchangeCodeForTokens(options.code, options.redirectUri);
  if (!tokens.refresh_token) {
    throw new Error("Zoom did not return a refresh token. Try reconnecting.");
  }

  const me = await fetchZoomMe(tokens.access_token);
  const expiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  const supabase = await createClient();

  const { error } = await supabase.from("zoom_connections").upsert(
    {
      user_id: options.userId,
      organization_id: options.organizationId || null,
      email: me.email,
      zoom_user_id: me.id,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expiry: expiry,
      scope: tokens.scope || null,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      revoked_at: null,
    },
    { onConflict: "user_id" }
  );

  if (error) throw new Error(error.message);
  return { email: me.email };
}

export async function getZoomConnectionStatus(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("zoom_connections")
    .select("email, connected_at, revoked_at")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .maybeSingle();

  if (!data) return null;
  return {
    email: data.email,
    connectedAt: data.connected_at,
  };
}

export async function disconnectZoom(userId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("zoom_connections")
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

async function getValidAccessTokenForUser(userId: string, useAdmin = false) {
  const supabase = useAdmin
    ? tryAdminClient() || (await createClient())
    : await createClient();

  const { data } = await supabase
    .from("zoom_connections")
    .select("id, email, access_token, refresh_token, token_expiry")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .maybeSingle();

  if (!data) return null;

  const expiresAt = new Date(data.token_expiry).getTime();
  if (expiresAt - Date.now() > 60_000) {
    return { accessToken: data.access_token, email: data.email };
  }

  const refreshed = await refreshAccessToken(data.refresh_token);
  const expiry = new Date(
    Date.now() + refreshed.expires_in * 1000
  ).toISOString();

  await supabase
    .from("zoom_connections")
    .update({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token || data.refresh_token,
      token_expiry: expiry,
      updated_at: new Date().toISOString(),
    })
    .eq("id", data.id);

  return { accessToken: refreshed.access_token, email: data.email };
}

export async function createZoomMeeting(options: {
  userId: string;
  topic: string;
  startsAt: string;
  durationMinutes: number;
  agenda?: string | null;
  timeZone: string;
}) {
  const auth = await getValidAccessTokenForUser(options.userId, true);
  if (!auth) return null;

  const res = await fetch(`${ZOOM_API}/users/me/meetings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      topic: options.topic,
      type: 2,
      start_time: options.startsAt,
      duration: options.durationMinutes,
      timezone: options.timeZone,
      agenda: options.agenda || undefined,
      settings: {
        join_before_host: false,
        waiting_room: true,
      },
    }),
  });

  if (!res.ok) {
    console.error("[zoom] create meeting failed", await res.text());
    return null;
  }

  const json = (await res.json()) as {
    id?: number | string;
    join_url?: string;
  };

  if (!json.join_url) return null;
  return {
    meetingId: json.id != null ? String(json.id) : null,
    joinUrl: json.join_url,
  };
}

export async function updateZoomMeeting(options: {
  userId: string;
  meetingId: string;
  topic?: string;
  startsAt?: string;
  durationMinutes?: number;
  agenda?: string | null;
  timeZone?: string;
}): Promise<boolean> {
  const auth = await getValidAccessTokenForUser(options.userId, true);
  if (!auth) return false;

  const body: Record<string, unknown> = {};
  if (options.topic !== undefined) body.topic = options.topic;
  if (options.startsAt !== undefined) body.start_time = options.startsAt;
  if (options.durationMinutes !== undefined) {
    body.duration = options.durationMinutes;
  }
  if (options.timeZone !== undefined) body.timezone = options.timeZone;
  if (options.agenda !== undefined) {
    body.agenda = options.agenda || undefined;
  }

  const res = await fetch(
    `${ZOOM_API}/meetings/${encodeURIComponent(options.meetingId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    console.error("[zoom] update meeting failed", await res.text());
    return false;
  }
  return true;
}

export async function deleteZoomMeeting(options: {
  userId: string;
  meetingId: string;
}): Promise<boolean> {
  const auth = await getValidAccessTokenForUser(options.userId, true);
  if (!auth) return false;

  const res = await fetch(
    `${ZOOM_API}/meetings/${encodeURIComponent(options.meetingId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${auth.accessToken}` },
    }
  );

  if (!res.ok && res.status !== 404) {
    console.error("[zoom] delete meeting failed", await res.text());
    return false;
  }
  return true;
}
