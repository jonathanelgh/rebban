import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import {
  previewOutreachCsv,
  rowToLeadInsert,
  type CsvImportRow,
} from "@/lib/outreach/import";
import { normalizeEmail } from "@/lib/outreach/constants";

export async function POST(request: Request) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const contentType = request.headers.get("content-type") || "";
  let mode: "preview" | "commit" = "preview";
  let csvText = "";
  let selectedRows: number[] | null = null;

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    mode = form.get("mode") === "commit" ? "commit" : "preview";
    const file = form.get("file");
    if (file instanceof File) {
      csvText = await file.text();
    } else if (typeof form.get("csv") === "string") {
      csvText = String(form.get("csv"));
    }
    const rowsRaw = form.get("rows");
    if (typeof rowsRaw === "string" && rowsRaw) {
      try {
        selectedRows = JSON.parse(rowsRaw) as number[];
      } catch {
        selectedRows = null;
      }
    }
  } else {
    const body = (await request.json().catch(() => null)) as {
      mode?: string;
      csv?: string;
      rows?: number[];
    } | null;
    mode = body?.mode === "commit" ? "commit" : "preview";
    csvText = body?.csv || "";
    selectedRows = Array.isArray(body?.rows) ? body!.rows : null;
  }

  if (!csvText.trim()) {
    return NextResponse.json({ error: "CSV content is required." }, { status: 400 });
  }

  const preview = previewOutreachCsv(csvText);
  if (mode === "preview") {
    return NextResponse.json(preview);
  }

  let candidates: CsvImportRow[] = preview.rows.filter((r) => r.valid);
  if (selectedRows?.length) {
    const allow = new Set(selectedRows);
    candidates = candidates.filter((r) => allow.has(r.rowNumber));
  }

  const emails = candidates.map((r) => normalizeEmail(r.email));
  const uniqueInFile = Array.from(new Set(emails));

  const { data: existing, error: existingError } = uniqueInFile.length
    ? await gate.db
        .from("outreach_leads")
        .select("email_normalized")
        .in("email_normalized", uniqueInFile)
    : { data: [] as { email_normalized: string | null }[], error: null };

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  const existingSet = new Set(
    (existing || []).map((r) => r.email_normalized).filter(Boolean) as string[]
  );

  let imported = 0;
  let skipped = 0;
  let duplicate = 0;
  const invalid = preview.rows.filter((r) => !r.valid).length;
  const errors: { rowNumber: number; error: string }[] = [];
  const seen = new Set<string>();

  for (const row of preview.rows) {
    if (!row.valid) continue;
    if (selectedRows?.length && !selectedRows.includes(row.rowNumber)) {
      skipped += 1;
      continue;
    }

    const email = normalizeEmail(row.email);
    if (seen.has(email) || existingSet.has(email)) {
      duplicate += 1;
      continue;
    }

    seen.add(email);
    const insert = rowToLeadInsert(row, gate.user.id);
    const { error } = await gate.db.from("outreach_leads").insert(insert);
    if (error) {
      if (error.code === "23505") {
        duplicate += 1;
        existingSet.add(email);
      } else {
        errors.push({ rowNumber: row.rowNumber, error: error.message });
        skipped += 1;
      }
      continue;
    }
    imported += 1;
    existingSet.add(email);
  }

  console.info("[outreach] import completed", {
    imported,
    skipped,
    duplicate,
    invalid,
  });

  return NextResponse.json({
    imported,
    skipped,
    duplicate,
    invalid,
    errors,
  });
}
