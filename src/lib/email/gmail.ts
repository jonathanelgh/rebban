import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const GMAIL_SEND_URL =
  "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const GMAIL_SCOPES = [
  GMAIL_SEND_SCOPE,
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
].join(" ");

function hasGmailSendScope(scope: string | null | undefined) {
  if (!scope) return false;
  return scope.split(/[\s,]+/).includes(GMAIL_SEND_SCOPE);
}

function appUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export function isGmailOAuthConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  );
}

/** Public origin for the current request (honours Vercel forwarded host). */
export function requestOrigin(request: Request) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedHost) {
    const host = forwardedHost.split(",")[0]?.trim();
    const proto =
      forwardedProto?.split(",")[0]?.trim() ||
      (host?.includes("localhost") ? "http" : "https");
    if (host) return `${proto}://${host}`;
  }
  return new URL(request.url).origin.replace(/\/$/, "");
}

export function getGmailRedirectUri(origin?: string | null) {
  // Always prefer the browser/request origin so production never picks up a
  // leftover localhost GOOGLE_GMAIL_REDIRECT_URI from env.
  const normalizedOrigin = origin?.replace(/\/$/, "") || "";
  if (normalizedOrigin) {
    return `${normalizedOrigin}/api/gmail/callback`;
  }

  const fromEnv = process.env.GOOGLE_GMAIL_REDIRECT_URI?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  return `${appUrl()}/api/gmail/callback`;
}

export function buildGmailAuthUrl(state: string, redirectUri: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error("GOOGLE_CLIENT_ID is not set.");
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPES,
    access_type: "offline",
    prompt: "consent",
    // Don't use include_granted_scopes — it can keep an old email-only grant
    // and skip gmail.send when reconnecting.
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

async function refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
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
    throw new Error(json.error || "Failed to refresh Gmail access token.");
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

export async function saveGmailConnection(options: {
  userId: string;
  organizationId?: string | null;
  code: string;
  redirectUri: string;
}) {
  const tokens = await exchangeCodeForTokens(options.code, options.redirectUri);
  if (!tokens.refresh_token) {
    throw new Error(
      "Google did not return a refresh token. Disconnect the app in your Google Account permissions and try again."
    );
  }

  if (!hasGmailSendScope(tokens.scope)) {
    throw new Error(
      "Google did not grant Gmail send permission. In Google Cloud → OAuth consent screen, add the scope https://www.googleapis.com/auth/gmail.send, enable Gmail API, then disconnect and reconnect."
    );
  }

  const email = await fetchGoogleEmail(tokens.access_token);
  const expiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  const supabase = await createClient();

  const { error } = await supabase.from("gmail_connections").upsert(
    {
      user_id: options.userId,
      organization_id: options.organizationId || null,
      email,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expiry: expiry,
      scope: tokens.scope || GMAIL_SCOPES,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      revoked_at: null,
    },
    { onConflict: "user_id" }
  );

  if (error) throw new Error(error.message);
  return { email };
}

export async function getGmailConnectionStatus(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("gmail_connections")
    .select("email, connected_at, revoked_at, scope")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .maybeSingle();

  if (!data) return null;
  return {
    email: data.email,
    connectedAt: data.connected_at,
    canSend: hasGmailSendScope(data.scope),
    scope: data.scope,
  };
}

export async function disconnectGmail(userId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("gmail_connections")
    .update({
      revoked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .is("revoked_at", null);

  if (error) throw new Error(error.message);
}

async function getValidAccessTokenForUser(
  userId: string,
  useAdmin = false
): Promise<{ accessToken: string; email: string } | null> {
  const supabase = useAdmin ? createAdminClient() : await createClient();
  const { data } = await supabase
    .from("gmail_connections")
    .select("id, email, access_token, refresh_token, token_expiry")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .maybeSingle();

  if (!data) return null;

  const expiresAt = new Date(data.token_expiry).getTime();
  const stillValid = expiresAt - Date.now() > 60_000;

  if (stillValid) {
    return { accessToken: data.access_token, email: data.email };
  }

  const refreshed = await refreshAccessToken(data.refresh_token);
  const expiry = new Date(
    Date.now() + refreshed.expires_in * 1000
  ).toISOString();

  await supabase
    .from("gmail_connections")
    .update({
      access_token: refreshed.access_token,
      token_expiry: expiry,
      updated_at: new Date().toISOString(),
    })
    .eq("id", data.id);

  return { accessToken: refreshed.access_token, email: data.email };
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

function htmlToPlainText(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, "$2 ($1)")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildRawMimeMessage(options: {
  from: string;
  fromName?: string | null;
  to: string;
  subject: string;
  html: string;
}) {
  const fromName = options.fromName?.trim();
  const fromHeader = fromName
    ? `${encodeRfc2047(fromName)} <${options.from}>`
    : options.from;
  const boundary = `rebban_${Date.now().toString(36)}`;
  const plain = htmlToPlainText(options.html);

  const mime = [
    `From: ${fromHeader}`,
    `To: ${options.to}`,
    `Subject: ${encodeRfc2047(options.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${Date.now().toString(36)}.${Math.random().toString(36).slice(2)}@mail.gmail.com>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    plain,
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    options.html,
    "",
    `--${boundary}--`,
  ].join("\r\n");

  return toBase64Url(mime);
}

export async function sendEmailViaGmail(options: {
  userId: string;
  to: string;
  subject: string;
  html: string;
  fromName?: string | null;
  useAdmin?: boolean;
}) {
  const supabase = options.useAdmin ? createAdminClient() : await createClient();
  const { data: connection } = await supabase
    .from("gmail_connections")
    .select("scope")
    .eq("user_id", options.userId)
    .is("revoked_at", null)
    .maybeSingle();

  if (!connection) return null;

  if (!hasGmailSendScope(connection.scope)) {
    throw new Error(
      "Gmail is connected without send permission. Disconnect, add gmail.send in Google Cloud OAuth scopes, then reconnect."
    );
  }

  const token = await getValidAccessTokenForUser(
    options.userId,
    options.useAdmin
  );
  if (!token) {
    throw new Error("Gmail is connected but no valid access token was found.");
  }

  const raw = buildRawMimeMessage({
    from: token.email,
    fromName: options.fromName,
    to: options.to,
    subject: options.subject,
    html: options.html,
  });

  const res = await fetch(GMAIL_SEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });

  const json = (await res.json()) as {
    id?: string;
    error?: { message?: string; status?: string };
  };
  if (!res.ok) {
    throw new Error(
      json.error?.message ||
        `Gmail send failed (${res.status}). Check Gmail API is enabled and gmail.send scope is granted.`
    );
  }

  return {
    provider: "gmail" as const,
    id: json.id || null,
    from: token.email,
  };
}
