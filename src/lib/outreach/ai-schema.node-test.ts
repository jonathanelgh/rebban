import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseOutreachAiAnalysis } from "./ai-schema.ts";

describe("parseOutreachAiAnalysis", () => {
  it("accepts a valid hot reply", () => {
    const result = parseOutreachAiAnalysis({
      temperature: "hot",
      score: 88,
      intent: "trial_request",
      sentiment: "positive",
      summary: "Wants to try Rebban",
      current_tools: ["Notion", "Toggl"],
      pain_points: ["tool fragmentation"],
      competitors_mentioned: [],
      feature_requests: [],
      objections: [],
      positive_signals: ["asks for access"],
      recommended_action: "Send trial link",
      suggested_reply: "Happy to share a look — what would help most?",
      confidence: 80,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.temperature, "hot");
      assert.equal(result.data.score, 88);
      assert.deepEqual(result.data.current_tools, ["Notion", "Toggl"]);
    }
  });

  it("rejects missing suggested_reply", () => {
    const result = parseOutreachAiAnalysis({
      temperature: "warm",
      score: 50,
      intent: "curious",
      sentiment: "neutral",
      summary: "ok",
      suggested_reply: "",
    });
    assert.equal(result.ok, false);
  });

  it("forces unsubscribe to do-not-contact style output", () => {
    const result = parseOutreachAiAnalysis({
      temperature: "hot",
      score: 90,
      intent: "unsubscribe",
      sentiment: "negative",
      summary: "Please stop emailing me",
      suggested_reply: "Thanks, I won't reach out again.",
      confidence: 95,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.temperature, "cold");
      assert.equal(result.data.score, 0);
      assert.equal(result.data.intent, "unsubscribe");
    }
  });

  it("rejects invalid temperature", () => {
    const result = parseOutreachAiAnalysis({
      temperature: "boiling",
      score: 10,
      suggested_reply: "hi",
    });
    assert.equal(result.ok, false);
  });
});
