import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canSendInitialOutreach,
  initialSendIdempotencyKey,
  isValidEmail,
  normalizeEmail,
} from "./safety-core.ts";

function baseLead(
  overrides: Partial<Parameters<typeof canSendInitialOutreach>[0]> = {}
) {
  return {
    email: "joshua@example.com",
    do_not_contact: false,
    bounce_status: null,
    outreach_status: "ready",
    gmail_message_id: null,
    last_contacted_at: null,
    subject_line: "Quick question, Joshua",
    initial_email_body: "Hi Joshua,\n\n…",
    ...overrides,
  };
}

describe("outreach send safety", () => {
  it("normalizes email", () => {
    assert.equal(normalizeEmail("  A@B.COM "), "a@b.com");
    assert.equal(isValidEmail("a@b.co"), true);
  });

  it("allows ready leads", () => {
    assert.deepEqual(canSendInitialOutreach(baseLead()), { ok: true });
  });

  it("blocks do-not-contact", () => {
    const result = canSendInitialOutreach(baseLead({ do_not_contact: true }));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "do_not_contact");
  });

  it("blocks already contacted", () => {
    const result = canSendInitialOutreach(
      baseLead({ gmail_message_id: "x" })
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "already_contacted");
  });

  it("blocks not interested and bounce", () => {
    const interested = canSendInitialOutreach(
      baseLead({ outreach_status: "not_interested" })
    );
    assert.equal(interested.ok, false);
    if (!interested.ok) assert.equal(interested.reason, "not_interested");

    const bounced = canSendInitialOutreach(
      baseLead({ bounce_status: "permanent" })
    );
    assert.equal(bounced.ok, false);
    if (!bounced.ok) assert.equal(bounced.reason, "bounced");
  });

  it("uses stable idempotency keys", () => {
    assert.equal(initialSendIdempotencyKey("abc"), "initial:abc");
  });
});
