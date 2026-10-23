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

function formatChatId(to) {
  return String(to).replace(/[^0-9]/g, "") + "@c.us";
}

function phoneFromChatId(chatId) {
  return String(chatId || "")
    .replace(/@c\.us$/i, "")
    .replace(/@lid$/i, "")
    .replace(/[^0-9]/g, "");
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
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(
        `Webhook failed (${res.status}):`,
        text.slice(0, 500)
      );
    }
  } catch (error) {
    console.error("Failed to forward inbound WhatsApp message:", error);
  }
}

client.on("message", async (message) => {
  try {
    if (!message || message.fromMe) return;
    if (message.isStatus) return;

    const chatId = message.from || "";
    if (chatId.endsWith("@g.us")) return;

    const body = typeof message.body === "string" ? message.body.trim() : "";
    if (!body) {
      // Voice / media without caption — MVP ignores; reply briefly.
      await message.reply(
        "I can read text messages for now. Voice notes are coming soon — try typing your request."
      );
      return;
    }

    const fromPhone = phoneFromChatId(chatId);
    if (!fromPhone) return;

    console.log(`Inbound from ${fromPhone}: ${body.slice(0, 120)}`);

    await forwardInbound({
      from: fromPhone,
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
    if (wid) botPhone = String(wid).replace(/[^0-9]/g, "");
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

app.post("/send", authenticate, async (req, res) => {
  try {
    if (!clientReady) {
      return res.status(503).json({
        success: false,
        error: "WhatsApp client is not ready yet",
      });
    }

    const { to, message, mediaUrl } = req.body;

    if (!to || (!message && !mediaUrl)) {
      return res.status(400).json({
        success: false,
        error: 'Missing "to", and need "message" and/or "mediaUrl"',
      });
    }

    const formattedNumber = formatChatId(to);

    if (message) {
      await client.sendMessage(formattedNumber, message);
      console.log(`Message sent to ${to}`);
    }

    if (mediaUrl) {
      const media = await MessageMedia.fromUrl(mediaUrl, { unsafeMime: true });
      await client.sendMessage(formattedNumber, media);
      console.log(`Media sent to ${to}: ${mediaUrl}`);
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Failed to send WhatsApp message:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Rebban WhatsApp Microservice running on port ${PORT}`);
});
