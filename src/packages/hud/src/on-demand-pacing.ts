import type { Quota } from "@agent-hud/protocol";
import {
  moneyShort,
  type FormatSettings,
  type Language,
} from "@agent-hud/ui/format";

const MS_DAY = 86_400_000;

/** Wall-clock fields in a time zone; weekday 1 = Sunday (matches format.ts). */
function wallClock(instant: number, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      weekday: "short",
      hourCycle: "h23",
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const year = Number(parts.year),
    month = Number(parts.month),
    day = Number(parts.day);
  return {
    dayNumber: Math.floor(Date.UTC(year, month - 1, day) / MS_DAY),
    weekday: weekdays.indexOf(parts.weekday) + 1,
  };
}

const isWeekday = (weekday: number) => weekday >= 2 && weekday <= 6;

/** First instant whose calendar day in `timeZone` equals `dayNumber`. */
function instantOnDay(dayNumber: number, timeZone: string, hint: number) {
  let lo = hint - 400 * MS_DAY;
  let hi = hint + 400 * MS_DAY;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (wallClock(mid, timeZone).dayNumber < dayNumber) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function isCursorOnDemandQuota(row: Quota): boolean {
  return (
    row.vendor === "cursor" &&
    (row.shortLabel === "On-demand" ||
      row.name === "On-demand usage" ||
      !!row.legacyWindowId?.endsWith("/cursor:extra"))
  );
}

/** Calendar days from today until the reset date (local dates). */
export function calendarDaysUntilReset(
  resetAt: string,
  now: number,
  timeZone: string,
): number | null {
  const reset = Date.parse(resetAt);
  if (!Number.isFinite(reset) || reset <= now) return null;
  const today = wallClock(now, timeZone);
  const resetDay = wallClock(reset, timeZone);
  const days = resetDay.dayNumber - today.dayNumber;
  return days > 0 ? days : 0;
}

/** Weekdays from tomorrow through the reset calendar day, excluding today. */
export function weekdaysUntilReset(
  resetAt: string,
  now: number,
  timeZone: string,
): number {
  const reset = Date.parse(resetAt);
  if (!Number.isFinite(reset) || reset <= now) return 0;
  const today = wallClock(now, timeZone);
  const resetDay = wallClock(reset, timeZone);
  if (resetDay.dayNumber <= today.dayNumber) return 0;
  let count = 0;
  for (let day = today.dayNumber + 1; day <= resetDay.dayNumber; day++) {
    const at = instantOnDay(day, timeZone, now);
    if (isWeekday(wallClock(at, timeZone).weekday)) count++;
  }
  return count;
}

export interface OnDemandPacingLines {
  untilReset: string;
  dailyBudget: string;
  todayRatio: string;
}

const say = (language: Language, zh: string, en: string) =>
  language === "zh" ? zh : en;

/** Three derived pacing lines for Cursor on-demand, or null when not applicable. */
export function onDemandPacingLines(
  row: Quota,
  now: number,
  settings: FormatSettings,
): OnDemandPacingLines | null {
  if (!isCursorOnDemandQuota(row) || !row.resetAt) return null;
  const spending = row.spending;
  if (
    !spending ||
    !Number.isFinite(spending.used) ||
    !Number.isFinite(spending.limit) ||
    spending.limit <= 0
  ) {
    return null;
  }
  const { language, calendar } = settings;
  const days =
    calendarDaysUntilReset(row.resetAt, now, calendar.timeZone) ?? 0;
  const weekdays = weekdaysUntilReset(row.resetAt, now, calendar.timeZone);
  const untilReset = say(
    language,
    `距重置还有 ${days} 天，其中工作日 ${weekdays} 天`,
    `${days} day${days === 1 ? "" : "s"} until reset, ${weekdays} weekday${weekdays === 1 ? "" : "s"}`,
  );
  const remaining = Math.max(0, spending.limit - spending.used);
  const dailyBudget =
    weekdays > 0
      ? say(
          language,
          `工作日日均可用 ≈ ${moneyShort(remaining / weekdays, spending.currency, language)}`,
          `Weekday daily budget ≈ ${moneyShort(remaining / weekdays, spending.currency, language)}`,
        )
      : say(
          language,
          "工作日日均可用：N/A",
          "Weekday daily budget: N/A",
        );
  const todayUsed = row.onDemandPacing?.todayUsed;
  const daily =
    weekdays > 0 ? remaining / weekdays : Number.NaN;
  let todayRatio: string;
  if (todayUsed == null || !Number.isFinite(todayUsed) || !(daily > 0)) {
    todayRatio = say(
      language,
      "今日已用 / 日均：不可用",
      "Today / daily budget: unavailable",
    );
  } else {
    const ratio = todayUsed / daily;
    const shown =
      ratio >= 10 ? ratio.toFixed(1) : ratio >= 1 ? ratio.toFixed(2) : ratio.toFixed(2);
    todayRatio = say(
      language,
      `今日已用 / 日均 ≈ ${shown}`,
      `Today / daily budget ≈ ${shown}`,
    );
  }
  return { untilReset, dailyBudget, todayRatio };
}
