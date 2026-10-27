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
      "go ahead",
      "Go for it",
      "invoice them all",
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
      "maybe later tomorrow please and also fix the rate",
      "",
    ]) {
      assert.equal(isPendingSendAffirmation(text), false, text);
    }
  });
});

describe("isPendingSendDecline", () => {
  it("accepts short no replies", () => {
    for (const text of [
      "no",
      "cancel",
      "nej",
      "wait",
      "Wait a bit",
      "not now",
      "later",
      "hold on",
    ]) {
      assert.equal(isPendingSendDecline(text), true, text);
    }
  });

  it("rejects unrelated text", () => {
    assert.equal(isPendingSendDecline("yes"), false);
    assert.equal(isPendingSendDecline("750usd"), false);
  });
});
