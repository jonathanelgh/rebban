import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  isGmailOAuthConfigured,
  requestOrigin,
} from "@/lib/email/gmail";
import type { Database } from "@/types/database";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const GMAIL_SEND_URL =
  "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

type Db = SupabaseClient<Database>;

export const OUTREACH_GMAIL_SEND_SCOPE =
  "https://www.googleapis.com/auth/gmail.send";
/** Needed later for reply sync — request now so reconnect is not required mid-launch. */
export const OUTREACH_GMAIL_READONLY_SCOPE =
  "https://www.googleapis.com/auth/gmail.readonly";

const OUTREACH_GMAIL_SCOPES = [
  OUTREACH_GMAIL_SEND_SCOPE,
  OUTREACH_GMAIL_READONLY_SCOPE,
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

function hasScope(scope: string | null | undefined, needed: string) {
  if (!scope) return false;
  return scope.split(/[\s,]+/).includes(needed);
}

export { isGmailOAuthConfigured as isOutreachGmailOAuthConfigured, requestOrigin };

export function getOutreachGmailRedirectUri(origin?: string | null) {
  const normalizedOrigin = (origin || "").replace(/\/$/, "");
  const configured = appUrl();

  if (
    normalizedOrigin.startsWith("http://localhost:") ||
    normalizedOrigin.startsWith("http://127.0.0.1:")
  ) {
    return `${normalizedOrigin}/api/admin/outreach-gmail/callback`;
  }

  if (configured && !configured.includes("localhost")) {
    return `${configured}/api/admin/outreach-gmail/callback`;
  }

  if (normalizedOrigin) {
    return `${normalizedOrigin}/api/admin/outreach-gmail/callback`;
  }

  return `${configured}/api/admin/outreach-gmail/callback`;
}

export function buildOutreachGmailAuthUrl(state: string, redirectUri: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID is not set.");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: OUTREACH_GMAIL_SCOPES,
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

async function exchangeCodeForTokens(code: string, redirectUri: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth is not configured.");
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

async function refreshAccessToken(refreshToken: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth is not configured.");
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
    throw new Error(json.error || "Failed to refresh outreach Gmail token.");
  }
  return json;
}

async function fetchGoogleEmail(accessToken: string) {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json()) as { email?: string; error?: string };
  if (!res.ok || !json.email) {
    throw new Error(json.error || "Could not read Gmail address.");
  }
  return json.email;
}

export async function saveOutreachGmailConnection(options: {
  userId: string;
  code: string;
  redirectUri: string;
}) {
  const tokens = await exchangeCodeForTokens(options.code, options.redirectUri);
  if (!tokens.refresh_token) {
    throw new Error(
      "Google did not return a refresh token. Remove Rebban from Google Account permissions and reconnect."
    );
  }
  if (!hasScope(tokens.scope, OUTREACH_GMAIL_SEND_SCOPE)) {
    throw new Error(
      "Google did not grant gmail.send. Add it in Google Cloud OAuth scopes, then reconnect."
    );
  }

  const email = await fetchGoogleEmail(tokens.access_token);
  const expiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  const supabase = await createClient();

  const { error } = await supabase.from("outreach_gmail_connections").upsert(
    {
      user_id: options.userId,
      email,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expiry: expiry,
      scope: tokens.scope || OUTREACH_GMAIL_SCOPES,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      revoked_at: null,
    },
    { onConflict: "user_id" }
  );

  if (error) throw new Error(error.message);
  return { email };
}

export async function getOutreachGmailStatus(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("outreach_gmail_connections")
    .select("email, connected_at, revoked_at, scope, last_sync_at")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .maybeSingle();

  if (!data) return null;
  return {
    email: data.email,
    connectedAt: data.connected_at,
    lastSyncAt: data.last_sync_at,
    canSend: hasScope(data.scope, OUTREACH_GMAIL_SEND_SCOPE),
    canRead: hasScope(data.scope, OUTREACH_GMAIL_READONLY_SCOPE),
    scope: data.scope,
  };
}

export async function disconnectOutreachGmail(userId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("outreach_gmail_connections")
    .update({
      revoked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .is("revoked_at", null);

  if (error) throw new Error(error.message);
}

export async function getValidOutreachAccessToken(
  userId: string,
  db?: Db
) {
  const supabase = db || (await createClient());
  const { data } = await supabase
    .from("outreach_gmail_connections")
    .select("id, email, access_token, refresh_token, token_expiry, scope")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .maybeSingle();

  if (!data) return null;

  const expiresAt = new Date(data.token_expiry).getTime();
  if (expiresAt - Date.now() > 60_000) {
    return {
      accessToken: data.access_token,
      email: data.email,
      scope: data.scope,
      connectionId: data.id,
    };
  }

  try {
    const refreshed = await refreshAccessToken(data.refresh_token);
    const expiry = new Date(
      Date.now() + refreshed.expires_in * 1000
    ).toISOString();

    await supabase
      .from("outreach_gmail_connections")
      .update({
        access_token: refreshed.access_token,
        token_expiry: expiry,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);

    return {
      accessToken: refreshed.access_token,
      email: data.email,
      scope: data.scope,
      connectionId: data.id,
    };
  } catch (err) {
    console.error("[outreach] OAuth refresh failed", {
      userId,
      error: err instanceof Error ? err.message : "unknown",
    });
    throw err;
  }
}

async function getValidAccessToken(userId: string, db?: Db) {
  return getValidOutreachAccessToken(userId, db);
}

export type GmailThreadMessage = {
  id: string;
  threadId: string;
  internalDate: string | null;
  from: string | null;
  to: string[];
  subject: string | null;
  bodyText: string | null;
  snippet: string | null;
};

function headerValue(
  headers: { name?: string; value?: string }[] | undefined,
  name: string
) {
  const found = (headers || []).find(
    (h) => (h.name || "").toLowerCase() === name.toLowerCase()
  );
  return found?.value || null;
}

function decodeBase64Url(data: string) {
  const padded = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64").toString("utf8");
}

function extractBodyText(payload: {
  mimeType?: string;
  body?: { data?: string };
  parts?: Array<{
    mimeType?: string;
    body?: { data?: string };
    parts?: unknown[];
  }>;
}): string | null {
  if (!payload) return null;
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  if (payload.parts?.length) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    for (const part of payload.parts) {
      const nested = extractBodyText(part as typeof payload);
      if (nested) return nested;
    }
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        const html = decodeBase64Url(part.body.data);
        return html
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<\/p>/gi, "\n\n")
          .replace(/<[^>]+>/g, "")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .trim();
      }
    }
  }
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  return null;
}

function parseAddressList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => {
      const match = part.match(/<([^>]+)>/);
      return (match?.[1] || part).trim().toLowerCase();
    })
    .filter(Boolean);
}

export async function fetchGmailThreadMessages(options: {
  userId: string;
  threadId: string;
  db?: Db;
}): Promise<GmailThreadMessage[]> {
  const token = await getValidAccessToken(options.userId, options.db);
  if (!token) throw new Error("Outreach Gmail is not connected.");
  if (!hasScope(token.scope, OUTREACH_GMAIL_READONLY_SCOPE)) {
    throw new Error(
      "Outreach Gmail is missing gmail.readonly. Reconnect in Admin → Settings → Outreach."
    );
  }

  const res = await fetch(
    `${GMAIL_API}/threads/${encodeURIComponent(options.threadId)}?format=full`,
    { headers: { Authorization: `Bearer ${token.accessToken}` } }
  );
  const json = (await res.json()) as {
    id?: string;
    messages?: Array<{
      id?: string;
      threadId?: string;
      internalDate?: string;
      snippet?: string;
      payload?: {
        mimeType?: string;
        headers?: { name?: string; value?: string }[];
        body?: { data?: string };
        parts?: Array<{
          mimeType?: string;
          body?: { data?: string };
          parts?: unknown[];
        }>;
      };
    }>;
    error?: { message?: string };
  };

  if (!res.ok) {
    throw new Error(
      json.error?.message || `Gmail thread fetch failed (${res.status}).`
    );
  }

  return (json.messages || [])
    .filter((m) => m.id)
    .map((m) => {
      const headers = m.payload?.headers;
      return {
        id: m.id!,
        threadId: m.threadId || options.threadId,
        internalDate: m.internalDate
          ? new Date(Number(m.internalDate)).toISOString()
          : null,
        from: headerValue(headers, "From"),
        to: parseAddressList(headerValue(headers, "To")),
        subject: headerValue(headers, "Subject"),
        bodyText: extractBodyText(m.payload || {}) || m.snippet || null,
        snippet: m.snippet || null,
      };
    });
}

export async function listActiveOutreachGmailConnections(db: Db) {
  const { data, error } = await db
    .from("outreach_gmail_connections")
    .select("id, user_id, email, scope, last_sync_at")
    .is("revoked_at", null);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function markOutreachGmailSynced(
  db: Db,
  connectionId: string
) {
  await db
    .from("outreach_gmail_connections")
    .update({
      last_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", connectionId);
}

function toBase64Url(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function encodeRfc2047(value: string) {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function textToHtml(text: string) {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;white-space:pre-wrap;line-height:1.5;color:#111827;">${escaped}</div>`;
}

function buildPlainMime(options: {
  from: string;
  fromName?: string | null;
  to: string;
  subject: string;
  bodyText: string;
  threadId?: string | null;
  inReplyTo?: string | null;
  references?: string | null;
}) {
  const fromName = options.fromName?.trim() || "Jonathan";
  const fromHeader = `${encodeRfc2047(fromName)} <${options.from}>`;
  const boundary = `rebban_out_${Date.now().toString(36)}`;
  const html = textToHtml(options.bodyText);

  const headers = [
    `From: ${fromHeader}`,
    `To: ${options.to}`,
    `Subject: ${encodeRfc2047(options.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${Date.now().toString(36)}.${Math.random().toString(36).slice(2)}@rebban.com>`,
    "MIME-Version: 1.0",
  ];
  if (options.inReplyTo) headers.push(`In-Reply-To: ${options.inReplyTo}`);
  if (options.references) headers.push(`References: ${options.references}`);
  headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);

  const mime = [
    ...headers,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    options.bodyText,
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    html,
    "",
    `--${boundary}--`,
  ].join("\r\n");

  return toBase64Url(mime);
}

export async function sendOutreachEmailViaGmail(options: {
  userId: string;
  to: string;
  subject: string;
  bodyText: string;
  fromName?: string | null;
  threadId?: string | null;
  inReplyTo?: string | null;
  references?: string | null;
  db?: Db;
}) {
  const token = await getValidAccessToken(options.userId, options.db);
  if (!token) return null;

  if (!hasScope(token.scope, OUTREACH_GMAIL_SEND_SCOPE)) {
    throw new Error(
      "Outreach Gmail is connected without send permission. Reconnect with gmail.send."
    );
  }

  const raw = buildPlainMime({
    from: token.email,
    fromName: options.fromName,
    to: options.to,
    subject: options.subject,
    bodyText: options.bodyText,
    threadId: options.threadId,
    inReplyTo: options.inReplyTo,
    references: options.references,
  });

  const body: { raw: string; threadId?: string } = { raw };
  if (options.threadId) body.threadId = options.threadId;

  const res = await fetch(GMAIL_SEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as {
    id?: string;
    threadId?: string;
    error?: { message?: string };
  };

  if (!res.ok) {
    throw new Error(
      json.error?.message || `Outreach Gmail send failed (${res.status}).`
    );
  }

  return {
    provider: "gmail" as const,
    messageId: json.id || null,
    threadId: json.threadId || options.threadId || null,
    from: token.email,
  };
}
