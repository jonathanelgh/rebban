import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ token: string }> };

function createAnonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase public env vars are not configured.");
  }
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Signed org logo for a valid public proposal share link. */
export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  if (!token) {
    return NextResponse.json({ error: "Missing token." }, { status: 400 });
  }

  const anon = createAnonClient();
  const { data: payload, error } = await anon.rpc("get_public_proposal", {
    p_token: token,
  });

  if (error || !payload) {
    return NextResponse.json(
      { error: error?.message || "Invalid proposal link." },
      { status: 404 }
    );
  }

  const logoPath = (
    payload as {
      organization?: { logo_url?: string | null };
    }
  ).organization?.logo_url;

  if (!logoPath) {
    return NextResponse.json({ url: null });
  }

  if (/^https?:\/\//i.test(logoPath)) {
    return NextResponse.json({ url: logoPath });
  }

  const { data, error: signError } = await anon.storage
    .from("org-assets")
    .createSignedUrl(logoPath, 60 * 60 * 24);

  if (signError || !data?.signedUrl) {
    return NextResponse.json(
      { error: signError?.message || "Could not resolve logo." },
      { status: 500 }
    );
  }

  return NextResponse.json({ url: data.signedUrl });
}
