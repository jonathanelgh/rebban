import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteUserAccount } from "@/lib/account/delete-account";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      confirmation?: string;
    };
    const confirmation = (body.confirmation || "").trim().toLowerCase();
    if (confirmation !== "delete") {
      return NextResponse.json(
        { error: 'Type "delete" to confirm account deletion.' },
        { status: 400 }
      );
    }

    await deleteUserAccount(user.id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[account/delete] failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not delete your account.",
      },
      { status: 500 }
    );
  }
}
