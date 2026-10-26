import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isPendingSendAffirmation,
  isPendingSendDecline,
} from "./pending-confirm.ts";

describe("isPendingSendAffirmation", () => {
  it("accepts short yes/send replies", () => {
    for (const text of [
      "Yes!",
      "yes",
      "Yes send",
      "send it",
      "ok",
      "ja",
      "skicka",
    ]) {
      assert.equal(isPendingSendAffirmation(text), true, text);
    }
  });

  it("rejects longer or unrelated messages", () => {
    for (const text of [
      "Yes 750usd",
      "Create a invoice for Sara Connor",
      "maybe later tomorrow please",
      "",
    ]) {
      assert.equal(isPendingSendAffirmation(text), false, text);
    }
  });
});

describe("isPendingSendDecline", () => {
  it("accepts short no replies", () => {
    assert.equal(isPendingSendDecline("no"), true);
    assert.equal(isPendingSendDecline("cancel"), true);
    assert.equal(isPendingSendDecline("nej"), true);
  });

  it("rejects unrelated text", () => {
    assert.equal(isPendingSendDecline("yes"), false);
    assert.equal(isPendingSendDecline("750usd"), false);
  });
});
