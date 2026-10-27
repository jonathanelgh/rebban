import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_DIGEST_TIMEZONE,
  isDigestSendWindow,
  resolveDigestTimezone,
} from "./digest-schedule.ts";

describe("resolveDigestTimezone", () => {
  it("falls back for empty or invalid zones", () => {
    assert.equal(resolveDigestTimezone(null), DEFAULT_DIGEST_TIMEZONE);
    assert.equal(resolveDigestTimezone(""), DEFAULT_DIGEST_TIMEZONE);
    assert.equal(resolveDigestTimezone("Not/A_Zone"), DEFAULT_DIGEST_TIMEZONE);
  });

  it("keeps valid IANA zones", () => {
    assert.equal(resolveDigestTimezone("America/New_York"), "America/New_York");
  });
});

describe("isDigestSendWindow", () => {
  it("is true for Monday 8am Stockholm", () => {
    // 2026-10-26 is a Monday; after EU DST end → CET (UTC+1), so 07:30Z = 08:30 local
    const mondayMorningUtc = new Date("2026-10-26T07:30:00.000Z");
    assert.equal(
      isDigestSendWindow("Europe/Stockholm", mondayMorningUtc),
      true
    );
  });

  it("is false outside the local hour", () => {
    const mondayAfternoonUtc = new Date("2026-10-26T12:00:00.000Z");
    assert.equal(
      isDigestSendWindow("Europe/Stockholm", mondayAfternoonUtc),
      false
    );
  });

  it("respects a different timezone", () => {
    // Monday 08:30 America/New_York (EDT, UTC-4) = 12:30 UTC
    const nyMorning = new Date("2026-10-26T12:30:00.000Z");
    assert.equal(isDigestSendWindow("America/New_York", nyMorning), true);
    assert.equal(isDigestSendWindow("Europe/Stockholm", nyMorning), false);
  });
});
