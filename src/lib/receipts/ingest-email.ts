import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import { processReceiptExtraction } from "./process";
import { uploadReceiptOriginal } from "./storage";
import {
  isLikelyDecorativeAttachment,
  validateReceiptBytes,
} from "./validate";

type Db = SupabaseClient<Database>;

function getResend() {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) throw new Error("RESEND_API_KEY is not set.");
  return new Resend(key);
}

export async function processInboundReceiptMessage(
  db: Db,
  inboundMessageId: string
) {
  const { data: message, error } = await db
    .from("receipt_inbound_messages")
    .select("*")
    .eq("id", inboundMessageId)
    .maybeSingle();

  if (error || !message) {
    return { ok: false as const, error: error?.message || "Inbound message not found." };
  }

  if (message.status === "processed") {
    return { ok: true as const, skipped: true as const };
  }

  try {
    const resend = getResend();
    const emailId = message.provider_email_id;

    const { data: attachmentsList, error: attError } =
      await resend.emails.receiving.attachments.list({ emailId });

    if (attError) {
      throw new Error(attError.message || "Failed to list attachments.");
    }

    const attachments = attachmentsList?.data || [];
    let created = 0;
    let skippedDecorative = 0;
    let rejected = 0;

    let index = 0;
    for (const attachment of attachments) {
      index += 1;
      const downloadUrl = (attachment as { download_url?: string }).download_url;
      const filename =
        (attachment as { filename?: string }).filename || `attachment-${index}`;
      const contentType =
        (attachment as { content_type?: string }).content_type || null;
      const contentDisposition =
        (attachment as { content_disposition?: string }).content_disposition ||
        null;
      const size = Number((attachment as { size?: number }).size || 0);

      if (
        isLikelyDecorativeAttachment({
          filename,
          mimeType: contentType,
          bytes: size,
          contentDisposition,
        })
      ) {
        skippedDecorative += 1;
        continue;
      }

      if (!downloadUrl) {
        rejected += 1;
        continue;
      }

      const response = await fetch(downloadUrl);
      if (!response.ok) {
        rejected += 1;
        continue;
      }
      const bytes = Buffer.from(await response.arrayBuffer());

      const validated = validateReceiptBytes({
        bytes,
        filename,
        declaredMime: contentType,
      });
      if (!validated.ok) {
        rejected += 1;
        continue;
      }

      const { data: receipt, error: receiptError } = await db
        .from("receipts")
        .insert({
          organization_id: message.organization_id,
          inbound_message_id: message.id,
          source: "email",
          review_status: "processing",
          original_filename: filename.slice(0, 240),
          attachment_index: index,
        })
        .select("id")
        .single();

      if (receiptError || !receipt) {
        rejected += 1;
        continue;
      }

      await uploadReceiptOriginal({
        db,
        organizationId: message.organization_id,
        receiptId: receipt.id,
        filename,
        bytes,
        mimeType: validated.mimeType,
        role: "original",
      });

      await db.from("receipt_events").insert({
        receipt_id: receipt.id,
        organization_id: message.organization_id,
        event_type: "email_imported",
        new_values: {
          inbound_message_id: message.id,
          filename,
          attachment_index: index,
        } as Json,
      });

      await processReceiptExtraction(db, receipt.id);
      created += 1;
    }

    // Email-body fallback when no useful attachments
    if (created === 0) {
      const { data: email, error: emailError } =
        await resend.emails.receiving.get(emailId);

      if (!emailError && email) {
        const text =
          (email as { text?: string | null }).text ||
          (email as { html?: string | null }).html ||
          "";
        const body = typeof text === "string" ? text.trim() : "";
        if (body.length > 80) {
          const isHtml = Boolean((email as { html?: string | null }).html);
          const filename = isHtml ? "email-body.html" : "email-body.txt";
          const mimeType = isHtml ? "text/html" : "text/plain";
          const bytes = Buffer.from(body, "utf8");

          const { data: receipt } = await db
            .from("receipts")
            .insert({
              organization_id: message.organization_id,
              inbound_message_id: message.id,
              source: "email",
              review_status: "processing",
              original_filename: filename,
              attachment_index: 0,
            })
            .select("id")
            .single();

          if (receipt) {
            await uploadReceiptOriginal({
              db,
              organizationId: message.organization_id,
              receiptId: receipt.id,
              filename,
              bytes,
              mimeType,
              role: "body",
            });
            await processReceiptExtraction(db, receipt.id);
            created += 1;
          }
        }
      }
    }

    await db
      .from("receipt_inbound_messages")
      .update({
        status: created > 0 ? "processed" : rejected > 0 ? "failed" : "processed",
        error:
          created === 0
            ? rejected > 0
              ? "Attachments rejected or unsupported."
              : skippedDecorative > 0 && attachments.length > 0
                ? "Only decorative images found; no receipt created."
                : "No usable attachments or body receipt found."
            : null,
        raw_metadata: {
          ...(typeof message.raw_metadata === "object" &&
          message.raw_metadata &&
          !Array.isArray(message.raw_metadata)
            ? message.raw_metadata
            : {}),
          created_receipts: created,
          skipped_decorative: skippedDecorative,
          rejected,
        } as Json,
      })
      .eq("id", message.id);

    return {
      ok: true as const,
      created,
      skippedDecorative,
      rejected,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Inbound processing failed.";
    await db
      .from("receipt_inbound_messages")
      .update({ status: "failed", error: msg })
      .eq("id", message.id);
    return { ok: false as const, error: msg };
  }
}
