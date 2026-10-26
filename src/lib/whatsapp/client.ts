export function isWhatsAppConfigured() {
  return Boolean(
    process.env.WHATSAPP_API_URL?.trim() && process.env.WHATSAPP_API_KEY?.trim()
  );
}

/** Digits-only bot number from env or live microservice /health. */
export async function getWhatsAppBotPhone(): Promise<{
  phone: string | null;
  ready: boolean;
}> {
  const fromEnv =
    process.env.NEXT_PUBLIC_WHATSAPP_BOT_NUMBER?.replace(/[^0-9]/g, "") ||
    process.env.WHATSAPP_BOT_NUMBER?.replace(/[^0-9]/g, "") ||
    "";

  const apiUrl = process.env.WHATSAPP_API_URL?.trim();
  if (!apiUrl) {
    return { phone: fromEnv || null, ready: false };
  }

  try {
    const res = await fetch(`${apiUrl.replace(/\/$/, "")}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ready?: boolean;
      botPhone?: string | null;
    };
    const phone =
      (json.botPhone || "").replace(/[^0-9]/g, "") || fromEnv || null;
    return { phone, ready: Boolean(json.ready) };
  } catch {
    return { phone: fromEnv || null, ready: false };
  }
}

export function whatsAppOpenUrl(botPhoneDigits: string, prefill?: string) {
  const phone = botPhoneDigits.replace(/[^0-9]/g, "");
  if (!phone) return null;
  const text = prefill?.trim()
    ? `?text=${encodeURIComponent(prefill.trim())}`
    : "";
  return `https://wa.me/${phone}${text}`;
}

export async function sendWhatsAppMessage(options: {
  to?: string;
  chatId?: string | null;
  message: string;
  mediaUrl?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiUrl = process.env.WHATSAPP_API_URL?.trim();
  const apiKey = process.env.WHATSAPP_API_KEY?.trim();

  if (!apiUrl || !apiKey) {
    return {
      ok: false,
      error: "WhatsApp is not configured (WHATSAPP_API_URL / WHATSAPP_API_KEY).",
    };
  }

  const chatId = options.chatId?.trim() || "";
  const toDigits = String(options.to || "").replace(/[^0-9]/g, "");
  if (!chatId && !toDigits) {
    return { ok: false, error: "Missing recipient phone number or chat id." };
  }

  const message = options.message?.trim();
  if (!message && !options.mediaUrl) {
    return { ok: false, error: "Missing message." };
  }

  // Prefer E.164 digits over @lid chat ids — whatsapp-web.js often hangs
  // indefinitely on sendMessage to Linked Device (@lid) targets.
  const preferPhone = Boolean(toDigits);
  const payload = preferPhone
    ? {
        to: toDigits,
        message: message || undefined,
        mediaUrl: options.mediaUrl || undefined,
      }
    : {
        chatId: chatId || undefined,
        to: toDigits || undefined,
        message: message || undefined,
        mediaUrl: options.mediaUrl || undefined,
      };

  try {
    const res = await fetch(`${apiUrl.replace(/\/$/, "")}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });

    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      error?: string;
    };

    if (!res.ok || !json.success) {
      return {
        ok: false,
        error: json.error || `WhatsApp send failed (${res.status}).`,
      };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "WhatsApp send failed.",
    };
  }
}
