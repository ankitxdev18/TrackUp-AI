import {
  addCalendarDays,
  assertValidIanaTimeZone,
  diffCalendarDays,
  formatCalendarDateInTimeZone,
  getUserLocalToday,
  isValidCalendarDateString,
  isValidIanaTimeZone,
} from "../habits/habit.date.js";
import { AnalyticsPeriod } from "./analytics.schema.js";

export interface PeriodBoundaries {
  periodCode: AnalyticsPeriod;
  startDate: string;
  endDate: string;
  daysCount: number;
  currentStartUtc: Date;
  currentEndUtc: Date;
  priorStartDate: string;
  priorEndDate: string;
  priorStartUtc: Date;
  priorEndUtc: Date;
  timeZone: string;
}

/**
 * Calculates the exact UTC Date instant corresponding to 00:00:00 local time
 * on a given calendar date 'YYYY-MM-DD' in the specified IANA timezone.
 */
export function getZonedStartOfDayUtc(dateStr: string, timeZone: string): Date {
  if (!isValidCalendarDateString(dateStr)) {
    throw new Error(`Invalid calendar date string: "${dateStr}"`);
  }
  const effectiveTz = isValidIanaTimeZone(timeZone) ? timeZone : "UTC";

  const [y, m, d] = dateStr.split("-").map(Number);
  // Initial UTC guess for midnight
  const guessUtc = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: effectiveTz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(guessUtc).map((p) => [p.type, p.value])
  );

  const hour = parts.hour === "24" ? 0 : Number(parts.hour);
  const zonedAsUtc = new Date(
    Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      hour,
      Number(parts.minute),
      Number(parts.second)
    )
  );

  const diffMs = guessUtc.getTime() - zonedAsUtc.getTime();
  return new Date(guessUtc.getTime() + diffMs);
}

/**
 * Computes deterministic date bounds and half-open UTC timestamp intervals
 * for a requested analytics period in the user's authoritative timezone.
 */
export function derivePeriodBounds(
  period: AnalyticsPeriod,
  timeZone: string,
  referenceToday?: string
): PeriodBoundaries {
  const effectiveTz = isValidIanaTimeZone(timeZone) ? timeZone : "UTC";
  const userLocalToday = referenceToday ?? getUserLocalToday(effectiveTz);

  let startDate: string;
  let endDate = userLocalToday;
  let priorStartDate: string;
  let priorEndDate: string;
  let daysCount: number;

  if (period === "30d") {
    daysCount = 30;
    startDate = addCalendarDays(userLocalToday, -29);
    priorEndDate = addCalendarDays(startDate, -1);
    priorStartDate = addCalendarDays(priorEndDate, -29);
  } else if (period === "month") {
    const [yearStr, monthStr] = userLocalToday.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);

    startDate = `${yearStr}-${monthStr}-01`;
    daysCount = diffCalendarDays(startDate, endDate) + 1;

    // Prior month bounds
    const priorYear = month === 1 ? year - 1 : year;
    const priorMonth = month === 1 ? 12 : month - 1;
    const priorMonthStr = String(priorMonth).padStart(2, "0");
    const priorYearStr = String(priorYear);

    priorStartDate = `${priorYearStr}-${priorMonthStr}-01`;
    const daysInPriorMonth = new Date(Date.UTC(priorYear, priorMonth, 0)).getUTCDate();
    const effectivePriorDays = Math.min(daysCount, daysInPriorMonth);
    priorEndDate = addCalendarDays(priorStartDate, effectivePriorDays - 1);
  } else {
    // Default: '7d'
    daysCount = 7;
    startDate = addCalendarDays(userLocalToday, -6);
    priorEndDate = addCalendarDays(startDate, -1);
    priorStartDate = addCalendarDays(priorEndDate, -6);
  }

  const currentStartUtc = getZonedStartOfDayUtc(startDate, effectiveTz);
  const currentEndUtc = getZonedStartOfDayUtc(
    addCalendarDays(endDate, 1),
    effectiveTz
  );
  const priorStartUtc = getZonedStartOfDayUtc(priorStartDate, effectiveTz);
  const priorEndUtc = getZonedStartOfDayUtc(
    addCalendarDays(priorEndDate, 1),
    effectiveTz
  );

  return {
    periodCode: period,
    startDate,
    endDate,
    daysCount,
    currentStartUtc,
    currentEndUtc,
    priorStartDate,
    priorEndDate,
    priorStartUtc,
    priorEndUtc,
    timeZone: effectiveTz,
  };
}
