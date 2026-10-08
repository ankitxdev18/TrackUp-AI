/**
 * Habit Date & Authoritative Timezone Utility Service (Milestone H03)
 *
 * Implements strict, server-side calendar-day and timezone logic.
 *
 * Invariants:
 * - Authoritative user timezone comes exclusively from users.timezone.
 * - Client-supplied dates, headers, or query parameters are never trusted to define 'today'.
 * - Calendar days are discrete 'YYYY-MM-DD' dates.
 * - Stored timezone values must be valid IANA identifiers; no silent fallback to UTC.
 */

export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates that a string is a valid IANA timezone identifier supported by the runtime.
 */
export function isValidIanaTimeZone(tz: string): boolean {
  if (!tz || typeof tz !== "string" || tz.trim().length === 0) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Asserts that a timezone string is a valid IANA identifier.
 * Throws a server data-integrity error if invalid.
 */
export function assertValidIanaTimeZone(tz: string): void {
  if (!isValidIanaTimeZone(tz)) {
    throw new Error(`Data integrity violation: user has invalid IANA timezone "${tz}"`);
  }
}

/**
 * Formats a Date instant into a calendar date string 'YYYY-MM-DD' in a specified IANA timezone.
 */
export function formatCalendarDateInTimeZone(date: Date, timeZone: string): string {
  assertValidIanaTimeZone(timeZone);

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error(`Failed to format date in timezone "${timeZone}"`);
  }

  return `${year}-${month}-${day}`;
}

/**
 * Calculates the current local calendar date 'YYYY-MM-DD' for a user based on their authoritative timezone.
 */
export function getUserLocalToday(timeZone: string): string {
  return formatCalendarDateInTimeZone(new Date(), timeZone);
}

/**
 * Performs pure calendar-day addition/subtraction on a 'YYYY-MM-DD' date string.
 * Uses UTC date calculations to avoid DST discontinuities.
 */
export function addCalendarDays(dateStr: string, days: number): string {
  if (!isValidCalendarDateString(dateStr)) {
    throw new Error(`Invalid calendar date string: "${dateStr}"`);
  }

  const [yearStr, monthStr, dayStr] = dateStr.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  const utcDate = new Date(Date.UTC(year, month - 1, day + days));
  const y = utcDate.getUTCFullYear();
  const m = String(utcDate.getUTCMonth() + 1).padStart(2, "0");
  const d = String(utcDate.getUTCDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

/**
 * Calculates the integer difference in calendar days between two 'YYYY-MM-DD' dates: dateB - dateA.
 */
export function diffCalendarDays(dateStrA: string, dateStrB: string): number {
  if (!isValidCalendarDateString(dateStrA) || !isValidCalendarDateString(dateStrB)) {
    throw new Error(`Invalid calendar date string comparison: "${dateStrA}" vs "${dateStrB}"`);
  }

  const [yA, mA, dA] = dateStrA.split("-").map(Number);
  const [yB, mB, dB] = dateStrB.split("-").map(Number);

  const utcA = Date.UTC(yA, mA - 1, dA);
  const utcB = Date.UTC(yB, mB - 1, dB);

  return Math.round((utcB - utcA) / (24 * 60 * 60 * 1000));
}

/**
 * Validates that an ISO date string 'YYYY-MM-DD' is both formatted correctly
 * and represents an authentic calendar date (e.g., handles leap years, rejects Feb 30, April 31).
 */
export function isValidCalendarDateString(dateStr: string): boolean {
  if (!dateStr || typeof dateStr !== "string") return false;
  if (!DATE_REGEX.test(dateStr)) return false;

  const [yearStr, monthStr, dayStr] = dateStr.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
