import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrganizationId } from "@/lib/stripe/org";
import {
  isWhatsAppConfigured,
  sendWhatsAppMessage,
} from "@/lib/whatsapp/client";
import {
  formatPhoneDisplay,
  isLikelyPhone,
  normalizeWhatsAppPhone,
} from "@/lib/whatsapp/phone";

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(request: Request) {
  try {
    if (!isWhatsAppConfigured()) {
      return NextResponse.json(
        { error: "WhatsApp Assistant is not configured on this server." },
        { status: 503 }
      );
    }

    const body = (await request.json()) as { phone?: string };
    const phone = normalizeWhatsAppPhone(body.phone || "");
    if (!isLikelyPhone(phone)) {
      return NextResponse.json(
        {
          error:
            "Enter a valid phone number with country code (digits only, e.g. 46701234567).",
        },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const organizationId = await getActiveOrganizationId(supabase, user.id);
    if (!organizationId) {
      return NextResponse.json(
        { error: "No active workspace." },
        { status: 400 }
      );
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const { data: existing } = await supabase
      .from("assistant_whatsapp_links")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("assistant_whatsapp_links")
        .update({
          organization_id: organizationId,
          phone_e164: phone,
          verified_at: null,
          verification_code: code,
          verification_expires_at: expiresAt,
        })
        .eq("id", existing.id);
      if (error) {
        if (error.code === "23505") {
          return NextResponse.json(
            {
              error:
                "That WhatsApp number is already linked to another account.",
            },
            { status: 409 }
          );
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else {
      const { error } = await supabase.from("assistant_whatsapp_links").insert({
        user_id: user.id,
        organization_id: organizationId,
        phone_e164: phone,
        verified_at: null,
        verification_code: code,
        verification_expires_at: expiresAt,
      });
      if (error) {
        if (error.code === "23505") {
          return NextResponse.json(
            {
              error:
                "That WhatsApp number is already linked to another account.",
            },
            { status: 409 }
          );
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    const sendResult = await sendWhatsAppMessage({
      to: phone,
      message: `Your Rebban Assistant verification code is ${code}. It expires in 15 minutes.\n\nEnter it in Settings, or reply with this code here.`,
    });

    if (!sendResult.ok) {
      return NextResponse.json(
        {
          error: `Could not send WhatsApp code: ${sendResult.error}`,
          phone: formatPhoneDisplay(phone),
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      phone: formatPhoneDisplay(phone),
      verificationExpiresAt: expiresAt,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start linking";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
