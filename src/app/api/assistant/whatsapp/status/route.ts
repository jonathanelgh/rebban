import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getWhatsAppBotPhone,
  isWhatsAppConfigured,
  whatsAppOpenUrl,
} from "@/lib/whatsapp/client";
import { formatPhoneDisplay } from "@/lib/whatsapp/phone";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: link } = await supabase
    .from("assistant_whatsapp_links")
    .select(
      "id, phone_e164, verified_at, verification_expires_at, organization_id"
    )
    .eq("user_id", user.id)
    .maybeSingle();

  const bot = await getWhatsAppBotPhone();
  const openUrl = bot.phone
    ? whatsAppOpenUrl(
        bot.phone,
        link?.verified_at
          ? "Hi Rebban — what can you help me with?"
          : undefined
      )
    : null;

  return NextResponse.json({
    configured: isWhatsAppConfigured(),
    botReady: bot.ready,
    botPhone: bot.phone ? formatPhoneDisplay(bot.phone) : null,
    botPhoneDigits: bot.phone || null,
    openUrl,
    linked: Boolean(link),
    verified: Boolean(link?.verified_at),
    phone: link?.phone_e164 ? formatPhoneDisplay(link.phone_e164) : null,
    phoneDigits: link?.phone_e164 || null,
    verificationPending: Boolean(
      link && !link.verified_at && link.verification_expires_at
    ),
    verificationExpiresAt: link?.verification_expires_at || null,
  });
}
