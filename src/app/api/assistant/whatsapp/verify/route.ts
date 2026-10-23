import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { formatPhoneDisplay } from "@/lib/whatsapp/phone";
import { sendWhatsAppMessage } from "@/lib/whatsapp/client";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { code?: string };
    const code = String(body.code || "")
      .replace(/\s+/g, "")
      .trim();

    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json(
        { error: "Enter the 6-digit code from WhatsApp." },
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

    const { data: link } = await supabase
      .from("assistant_whatsapp_links")
      .select(
        "id, phone_e164, verification_code, verification_expires_at, verified_at"
      )
      .eq("user_id", user.id)
      .maybeSingle();

    if (!link) {
      return NextResponse.json(
        { error: "Start linking your phone number first." },
        { status: 400 }
      );
    }

    if (link.verified_at) {
      return NextResponse.json({
        ok: true,
        alreadyVerified: true,
        phone: formatPhoneDisplay(link.phone_e164),
      });
    }

    if (
      link.verification_expires_at &&
      new Date(link.verification_expires_at).getTime() < Date.now()
    ) {
      return NextResponse.json(
        { error: "Code expired. Request a new one." },
        { status: 400 }
      );
    }

    if (link.verification_code !== code) {
      return NextResponse.json(
        { error: "Incorrect code. Check WhatsApp and try again." },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("assistant_whatsapp_links")
      .update({
        verified_at: new Date().toISOString(),
        verification_code: null,
        verification_expires_at: null,
      })
      .eq("id", link.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await sendWhatsAppMessage({
      to: link.phone_e164,
      message:
        "You're connected to Rebban Assistant. Message me anytime to add leads, draft invoices, or check who owes you.",
    });

    return NextResponse.json({
      ok: true,
      phone: formatPhoneDisplay(link.phone_e164),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Verification failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
