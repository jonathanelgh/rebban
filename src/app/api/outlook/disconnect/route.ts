import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { disconnectOutlook } from "@/lib/email/outlook";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await disconnectOutlook(user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to disconnect Outlook",
      },
      { status: 500 }
    );
  }
}
