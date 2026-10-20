import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requestOrigin } from "@/lib/email/gmail";

const MS_AUTH_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const MS_TOKEN_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const MS_GRAPH_ME_URL = "https://graph.microsoft.com/v1.0/me";
const MS_SEND_MAIL_URL = "https://graph.microsoft.com/v1.0/me/sendMail";

export const OUTLOOK_MAIL_SEND_SCOPE =
  "https://graph.microsoft.com/Mail.Send";
const OUTLOOK_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "User.Read",
  OUTLOOK_MAIL_SEND_SCOPE,
].join(" ");

function appUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

function hasMailSendScope(scope: string | null | undefined) {
  if (!scope) return false;
  const parts = scope.split(/[\s,]+/);
  return (
    parts.includes(OUTLOOK_MAIL_SEND_SCOPE) ||
    parts.includes("Mail.Send") ||
    parts.some((part) => part.toLowerCase().includes("mail.send"))
  );
}

export function isOutlookOAuthConfigured() {
  return Boolean(
    process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET
  );
}

export { requestOrigin };

export function getOutlookRedirectUri(origin?: string | null) {
  const normalizedOrigin = (origin || "").replace(/\/$/, "");
  const configured = appUrl();

  if (
    normalizedOrigin.startsWith("http://localhost:") ||
    normalizedOrigin.startsWith("http://127.0.0.1:")
  ) {
    return `${normalizedOrigin}/api/outlook/callback`;
  }

  if (configured && !configured.includes("localhost")) {
    return `${configured}/api/outlook/callback`;
  }

  if (normalizedOrigin) {
    return `${normalizedOrigin}/api/outlook/callback`;
  }

  const fromEnv = process.env.MICROSOFT_OUTLOOK_REDIRECT_URI?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  return `${configured}/api/outlook/callback`;
}

export function buildOutlookAuthUrl(state: string, redirectUri: string) {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  if (!clientId) {
    throw new Error("MICROSOFT_CLIENT_ID is not set.");
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    response_mode: "query",
    scope: OUTLOOK_SCOPES,
    state,
    prompt: "select_account",
  });

  return `${MS_AUTH_URL}?${params.toString()}`;
}

type MicrosoftTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
};

async function exchangeCodeForTokens(
  code: string,
  redirectUri: string
): Promise<MicrosoftTokenResponse> {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Microsoft OAuth is not configured.");
  }

  const res = await fetch(MS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      scope: OUTLOOK_SCOPES,
    }),
  });

  const json = (await res.json()) as MicrosoftTokenResponse & {
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(
      json.error_description || json.error || "Failed to exchange Microsoft auth code."
    );
  }
  return json;
}

async function refreshAccessToken(
  refreshToken: string
): Promise<MicrosoftTokenResponse> {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Microsoft OAuth is not configured.");
  }

  const res = await fetch(MS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: OUTLOOK_SCOPES,
    }),
  });

  const json = (await res.json()) as MicrosoftTokenResponse & {
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(
      json.error_description ||
        json.error ||
        "Failed to refresh Outlook access token."
    );
  }
  return json;
}

async function fetchMicrosoftEmail(accessToken: string) {
  const res = await fetch(
    `${MS_GRAPH_ME_URL}?$select=mail,userPrincipalName,displayName`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  const json = (await res.json()) as {
    mail?: string | null;
    userPrincipalName?: string | null;
    error?: { message?: string };
  };
  const email = json.mail?.trim() || json.userPrincipalName?.trim();
  if (!res.ok || !email) {
    throw new Error(
      json.error?.message || "Could not read Outlook email address."
    );
  }
  return email;
}

export async function saveOutlookConnection(options: {
  userId: string;
  organizationId?: string | null;
  code: string;
  redirectUri: string;
}) {
  const tokens = await exchangeCodeForTokens(options.code, options.redirectUri);
  if (!tokens.refresh_token) {
    throw new Error(
      "Microsoft did not return a refresh token. Remove Rebban from your Microsoft account permissions and try again."
    );
  }

  if (!hasMailSendScope(tokens.scope)) {
    throw new Error(
      "Microsoft did not grant Mail.Send permission. In Azure App Registration → API permissions, add Microsoft Graph Mail.Send (delegated), then reconnect."
    );
  }

  const email = await fetchMicrosoftEmail(tokens.access_token);
  const expiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  const supabase = await createClient();

  const { error } = await supabase.from("outlook_connections").upsert(
    {
      user_id: options.userId,
      organization_id: options.organizationId || null,
      email,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expiry: expiry,
      scope: tokens.scope || OUTLOOK_SCOPES,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      revoked_at: null,
    },
    { onConflict: "user_id" }
  );

  if (error) throw new Error(error.message);
  return { email };
}

export async function getOutlookConnectionStatus(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("outlook_connections")
    .select("email, connected_at, revoked_at, scope")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .maybeSingle();

  if (!data) return null;
  return {
    email: data.email,
    connectedAt: data.connected_at,
    canSend: hasMailSendScope(data.scope),
    scope: data.scope,
  };
}

export async function disconnectOutlook(userId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("outlook_connections")
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
    .from("outlook_connections")
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
    .from("outlook_connections")
    .update({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token || data.refresh_token,
      token_expiry: expiry,
      updated_at: new Date().toISOString(),
    })
    .eq("id", data.id);

  return { accessToken: refreshed.access_token, email: data.email };
}

export async function sendEmailViaOutlook(options: {
  userId: string;
  to: string;
  subject: string;
  html: string;
  fromName?: string | null;
  useAdmin?: boolean;
}) {
  const supabase = options.useAdmin
    ? createAdminClient()
    : await createClient();
  const { data: connection, error: connectionError } = await supabase
    .from("outlook_connections")
    .select("scope")
    .eq("user_id", options.userId)
    .is("revoked_at", null)
    .maybeSingle();

  if (connectionError) {
    console.error("[outlook] connection lookup failed", connectionError);
    throw new Error(
      connectionError.message || "Could not read Outlook connection."
    );
  }

  if (!connection) return null;

  if (!hasMailSendScope(connection.scope)) {
    throw new Error(
      "Outlook is connected without send permission. Disconnect, add Mail.Send in Azure, then reconnect."
    );
  }

  const token = await getValidAccessTokenForUser(
    options.userId,
    options.useAdmin
  );
  if (!token) {
    throw new Error(
      "Outlook is connected but no valid access token was found."
    );
  }

  const res = await fetch(MS_SEND_MAIL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject: options.subject,
        body: {
          contentType: "HTML",
          content: options.html,
        },
        toRecipients: [
          {
            emailAddress: {
              address: options.to,
            },
          },
        ],
        ...(options.fromName?.trim()
          ? {
              from: {
                emailAddress: {
                  address: token.email,
                  name: options.fromName.trim(),
                },
              },
            }
          : {}),
      },
      saveToSentItems: true,
    }),
  });

  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(
      json.error?.message ||
        `Outlook send failed (${res.status}). Check Mail.Send permission in Azure.`
    );
  }

  return {
    provider: "outlook" as const,
    id: null as string | null,
    from: token.email,
  };
}
