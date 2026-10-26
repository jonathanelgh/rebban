const express = require("express");
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const crypto = require("crypto");

const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3001;
const API_KEY = process.env.API_KEY || "your-secret-api-key";
const REBBAN_WEBHOOK_URL = (process.env.REBBAN_WEBHOOK_URL || "").trim();
const REBBAN_WEBHOOK_SECRET = (
  process.env.REBBAN_WEBHOOK_SECRET || ""
).trim();

let clientReady = false;

const authenticate = (req, res, next) => {
  const apiKey = req.headers["x-api-key"];
  if (apiKey !== API_KEY) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
  next();
};

console.log("Initializing WhatsApp Client...");

const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: "./.wwebjs_auth",
  }),
  puppeteer: {
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  },
});

client.on("qr", (qr) => {
  console.log("\n==================================================================");
  console.log("WHATSAPP AUTHENTICATION REQUIRED");
  console.log("Scan this QR code with WhatsApp to link the Rebban bot:");
  console.log("==================================================================\n");
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  clientReady = true;
  console.log("\nWhatsApp Client is ready and connected!\n");
});

client.on("auth_failure", (msg) => {
  clientReady = false;
  console.error("\nWhatsApp Authentication failure:", msg, "\n");
});

client.on("disconnected", (reason) => {
  clientReady = false;
  console.log("\nWhatsApp Client was disconnected:", reason, "\n");
});

/** Prefer full chat ids (@c.us / @lid); otherwise treat as phone digits. */
function resolveChatId(to) {
  const raw = String(to || "").trim();
  if (!raw) return null;
  if (raw.includes("@")) return raw;
  const digits = raw.replace(/[^0-9]/g, "");
  return digits ? `${digits}@c.us` : null;
}

function digitsOnly(value) {
  return String(value || "").replace(/[^0-9]/g, "");
}

function isLidChat(chatId) {
  return String(chatId || "").endsWith("@lid");
}

/** contact.number often returns the LID user id — that is not a phone. */
function isLidDigitsPosingAsPhone(chatId, number) {
  if (!isLidChat(chatId) || !number) return false;
  return digitsOnly(number) === digitsOnly(chatId);
}

function signPayload(body) {
  if (!REBBAN_WEBHOOK_SECRET) return "";
  return crypto
    .createHmac("sha256", REBBAN_WEBHOOK_SECRET)
    .update(body)
    .digest("hex");
}

async function forwardInbound(payload) {
  if (!REBBAN_WEBHOOK_URL) {
    console.warn("REBBAN_WEBHOOK_URL not set — inbound message ignored");
    return;
  }

  const body = JSON.stringify(payload);
  const headers = {
    "Content-Type": "application/json",
    "x-rebban-webhook-secret": REBBAN_WEBHOOK_SECRET,
    "x-rebban-signature": signPayload(body),
  };

  try {
    const res = await fetch(REBBAN_WEBHOOK_URL, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(55000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(
        `Webhook failed (${res.status}):`,
        text.slice(0, 500)
      );
    } else {
      console.log(`Webhook ok for chatId=${payload.chatId || "?"}`);
    }
  } catch (error) {
    console.error("Failed to forward inbound WhatsApp message:", error);
  }
}

async function resolveSenderPhone(message, chatId) {
  try {
    const contact = await message.getContact();
    const number = digitsOnly(contact?.number || "");
    if (number && !isLidDigitsPosingAsPhone(chatId, number)) {
      return number;
    }
  } catch (error) {
    console.warn("getContact failed:", error?.message || error);
  }

  // Only fall back to chat id digits for classic @c.us chats (not @lid).
  if (String(chatId).endsWith("@c.us")) {
    return digitsOnly(chatId);
  }
  return null;
}

client.on("message", async (message) => {
  try {
    if (!message || message.fromMe) return;
    if (message.isStatus) return;

    const chatId = message.from || "";
    if (chatId.endsWith("@g.us")) return;

    const body = typeof message.body === "string" ? message.body.trim() : "";
    if (!body) {
      await message.reply(
        "I can read text messages for now. Voice notes are coming soon — try typing your request."
      );
      return;
    }

    const fromPhone = await resolveSenderPhone(message, chatId);
    console.log(
      `Inbound chatId=${chatId} phone=${fromPhone || "unknown"}: ${body.slice(0, 120)}`
    );

    await forwardInbound({
      from: fromPhone || digitsOnly(chatId) || "unknown",
      phone: fromPhone,
      chatId,
      body,
      messageId: message.id?._serialized || message.id?.id || null,
      timestamp: message.timestamp || Math.floor(Date.now() / 1000),
      type: message.type || "chat",
    });
  } catch (error) {
    console.error("Error handling inbound message:", error);
  }
});

client.initialize();

app.get("/health", (_req, res) => {
  let botPhone = null;
  try {
    const wid = client?.info?.wid?.user;
    if (wid) botPhone = digitsOnly(wid);
  } catch {
    /* ignore */
  }
  res.json({
    success: true,
    ready: clientReady,
    botPhone,
    webhookConfigured: Boolean(REBBAN_WEBHOOK_URL),
  });
});

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${label || "operation"} timed out after ${ms}ms`)),
        ms
      );
    }),
  ]);
}

async function deliverToChat(target, content) {
  if (isLidChat(target)) {
    const chat = await client.getChatById(target);
    if (!chat) {
      throw new Error(`Chat not found for ${target}`);
    }
    return chat.sendMessage(content);
  }
  return client.sendMessage(target, content);
}

/** Build ordered send targets. Never treat @lid digits as @c.us. */
function buildSendTargets({ to, chatId }) {
  const toDigits = digitsOnly(to);
  const resolvedChat = resolveChatId(chatId);
  const lidAlias =
    resolvedChat &&
    isLidChat(resolvedChat) &&
    toDigits &&
    toDigits === digitsOnly(resolvedChat);

  const phoneTarget =
    toDigits && !lidAlias ? `${toDigits}@c.us` : null;

  const targets = [];
  if (resolvedChat && isLidChat(resolvedChat)) {
    targets.push(resolvedChat);
    if (phoneTarget) targets.push(phoneTarget);
  } else if (phoneTarget) {
    targets.push(phoneTarget);
    if (resolvedChat) targets.push(resolvedChat);
  } else if (resolvedChat) {
    targets.push(resolvedChat);
  }
  return [...new Set(targets.filter(Boolean))];
}

app.post("/send", authenticate, async (req, res) => {
  try {
    if (!clientReady) {
      return res.status(503).json({
        success: false,
        error: "WhatsApp client is not ready yet",
      });
    }

    const { to, message, mediaUrl, chatId } = req.body;
    const targets = buildSendTargets({ to, chatId });

    if (!targets.length || (!message && !mediaUrl)) {
      return res.status(400).json({
        success: false,
        error: 'Missing "to"/"chatId", and need "message" and/or "mediaUrl"',
      });
    }

    const SEND_TIMEOUT_MS = 18000;
    let lastError = null;
    let sentVia = null;

    for (const target of targets) {
      try {
        if (message) {
          await withTimeout(
            deliverToChat(target, message),
            SEND_TIMEOUT_MS,
            `sendMessage(${target})`
          );
        }
        if (mediaUrl) {
          const media = await MessageMedia.fromUrl(mediaUrl, {
            unsafeMime: true,
          });
          await withTimeout(
            deliverToChat(target, media),
            SEND_TIMEOUT_MS,
            `sendMedia(${target})`
          );
        }
        sentVia = target;
        break;
      } catch (error) {
        lastError = error;
        console.warn(
          `Send via ${target} failed:`,
          error?.message || error
        );
      }
    }

    if (!sentVia) {
      throw lastError || new Error("All send targets failed");
    }

    console.log(`Message sent via ${sentVia}`);
    res.json({ success: true, via: sentVia });
  } catch (error) {
    console.error("Failed to send WhatsApp message:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Rebban WhatsApp Microservice running on port ${PORT}`);
});
