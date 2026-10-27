import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_BILLING_SCHEDULE,
  describeBillingSchedule,
  isBillingScheduleWindow,
  parseBillingSchedule,
} from "./billing-schedule.ts";

describe("parseBillingSchedule", () => {
  it("defaults safely", () => {
    assert.deepEqual(parseBillingSchedule(null), DEFAULT_BILLING_SCHEDULE);
  });

  it("parses cadence and hour", () => {
    const s = parseBillingSchedule({
      enabled: true,
      cadence: "biweekly",
      weekday: "Fri",
      hour: 9,
      biweekly_anchor_ymd: "2026-10-24",
    });
    assert.equal(s.cadence, "biweekly");
    assert.equal(s.weekday, "Fri");
    assert.equal(s.hour, 9);
    assert.equal(s.biweekly_anchor_ymd, "2026-10-24");
  });
});

describe("describeBillingSchedule", () => {
  it("describes weekly friday", () => {
    const text = describeBillingSchedule({
      enabled: true,
      cadence: "weekly",
      weekday: "Fri",
      hour: 9,
      biweekly_anchor_ymd: null,
    });
    assert.match(text, /Every Fri at 09:00/);
  });
});

describe("isBillingScheduleWindow", () => {
  const weeklyFri9 = {
    enabled: true,
    cadence: "weekly" as const,
    weekday: "Fri" as const,
    hour: 9,
    biweekly_anchor_ymd: null,
  };

  it("matches Friday 9am Stockholm", () => {
    // 2026-10-30 is Friday; CET UTC+1 → 08:15Z = 09:15 local
    const when = new Date("2026-10-30T08:15:00.000Z");
    assert.equal(
      isBillingScheduleWindow(weeklyFri9, "Europe/Stockholm", when),
      true
    );
  });

  it("rejects wrong weekday", () => {
    const monday = new Date("2026-10-26T08:15:00.000Z");
    assert.equal(
      isBillingScheduleWindow(weeklyFri9, "Europe/Stockholm", monday),
      false
    );
  });

  it("matches first of month", () => {
    const schedule = {
      enabled: true,
      cadence: "monthly_first" as const,
      weekday: "Mon" as const,
      hour: 10,
      biweekly_anchor_ymd: null,
    };
    // 2026-11-01 Sunday 09:10Z = 10:10 Stockholm
    const when = new Date("2026-11-01T09:10:00.000Z");
    assert.equal(
      isBillingScheduleWindow(schedule, "Europe/Stockholm", when),
      true
    );
  });

  it("matches biweekly on-week and skips off-week", () => {
    // Fridays in Stockholm autumn 2026: Oct 30, Nov 6, Nov 13
    const onWeek = {
      enabled: true,
      cadence: "biweekly" as const,
      weekday: "Fri" as const,
      hour: 9,
      biweekly_anchor_ymd: "2026-10-30",
    };
    const friOn = new Date("2026-10-30T08:15:00.000Z");
    const friOff = new Date("2026-11-06T08:15:00.000Z"); // +7 days
    const friOn2 = new Date("2026-11-13T08:15:00.000Z"); // +14 days
    assert.equal(
      isBillingScheduleWindow(onWeek, "Europe/Stockholm", friOn),
      true
    );
    assert.equal(
      isBillingScheduleWindow(onWeek, "Europe/Stockholm", friOff),
      false
    );
    assert.equal(
      isBillingScheduleWindow(onWeek, "Europe/Stockholm", friOn2),
      true
    );
  });
});
