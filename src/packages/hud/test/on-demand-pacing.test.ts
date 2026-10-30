import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calendarDaysUntilReset,
  onDemandPacingLines,
  weekdaysUntilReset,
} from "../src/on-demand-pacing.ts";

const utc = {
  language: "en" as const,
  calendar: { timeZone: "UTC", firstWeekday: 1 },
};
const zh = {
  language: "zh" as const,
  calendar: { timeZone: "UTC", firstWeekday: 1 },
};

test("weekdays exclude today and include reset day only when it is Mon–Fri", () => {
  // 2026-10-30 Fri -> 2026-11-02 Mon: days 31-1 Sat/Sun off, Mon counts
  const now = Date.parse("2026-10-30T12:00:00Z");
  const reset = "2026-11-02T18:00:00Z";
  assert.equal(calendarDaysUntilReset(reset, now, "UTC"), 3);
  assert.equal(weekdaysUntilReset(reset, now, "UTC"), 1);
  // Reset on Saturday 2026-11-07: Fri Oct 30 -> Sat Nov 7: Sat reset not counted
  assert.equal(weekdaysUntilReset("2026-11-07T12:00:00Z", now, "UTC"), 5);
  assert.equal(weekdaysUntilReset("2026-11-08T12:00:00Z", now, "UTC"), 5);
  // Reset Friday 2026-11-20 includes that Friday
  const nov = Date.parse("2026-10-30T12:00:00Z");
  assert.equal(weekdaysUntilReset("2026-11-20T00:00:00Z", nov, "UTC"), 15);
});

test("daily budget and today ratio handle zero weekdays and missing today usage", () => {
  const row = {
    id: "x",
    vendor: "cursor",
    name: "On-demand usage",
    shortLabel: "On-demand",
    usedPercent: 21,
    resetAt: "2026-11-02T00:00:00Z",
    status: "normal",
    account: null,
    spending: { used: 2, limit: 10, currency: "USD" },
    onDemandPacing: { todayUsed: null },
  } as const;
  const now = Date.parse("2026-10-31T12:00:00Z"); // Sat; through Sun reset -> 0 weekdays
  const lines = onDemandPacingLines(
    { ...row, resetAt: "2026-11-01T12:00:00Z" },
    now,
    utc,
  )!;
  assert.match(lines.dailyBudget, /N\/A/);
  assert.match(lines.todayRatio, /unavailable/);
});

test("daily budget divides remaining allowance by weekday count", () => {
  const row = {
    id: "x",
    vendor: "cursor",
    name: "On-demand usage",
    shortLabel: "On-demand",
    usedPercent: 21,
    resetAt: "2026-11-04T00:00:00Z",
    status: "normal",
    account: null,
    spending: { used: 2.12, limit: 10, currency: "USD" },
    onDemandPacing: { todayUsed: 0.5 },
  } as const;
  const now = Date.parse("2026-10-30T12:00:00Z");
  const lines = onDemandPacingLines(row, now, utc)!;
  assert.match(lines.untilReset, /5 day/);
  assert.match(lines.untilReset, /3 weekday/);
  assert.match(lines.dailyBudget, /\$2\.63/);
  assert.match(lines.todayRatio, /≈ 0\.19/);
  const cn = onDemandPacingLines(row, now, zh)!;
  assert.match(cn.untilReset, /工作日 3 天/);
  assert.match(cn.dailyBudget, /≈ \$2\.63/);
});

test("a few hundred dollars left is not shown as thousands", () => {
  // $590.70 left over 15 weekdays is about $39.38, which used to read $3,938
  // when dashboard cents were treated as dollars.
  const row = {
    id: "x",
    vendor: "cursor",
    name: "On-demand usage",
    shortLabel: "On-demand",
    usedPercent: 21.24,
    resetAt: "2026-11-20T00:00:00Z",
    status: "normal",
    account: null,
    spending: { used: 159.3, limit: 750, currency: "USD" },
    onDemandPacing: { todayUsed: 0 },
  } as const;
  const lines = onDemandPacingLines(
    row,
    Date.parse("2026-10-30T12:00:00Z"),
    zh,
  )!;
  assert.match(lines.dailyBudget, /\$39\.38/);
  assert.doesNotMatch(lines.dailyBudget, /3,?938/);
  assert.match(lines.todayRatio, /≈ 0\.00/);
});
