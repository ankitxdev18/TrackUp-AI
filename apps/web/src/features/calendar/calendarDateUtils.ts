import type { CalendarView, DayCalendarCell, WeekDayHeader, CalendarRange } from "./calendar.types";

/**
 * Returns the user's active IANA timezone identifier, defaulting to runtime browser timezone or UTC.
 */
export function getUserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * Validates whether an IANA timezone identifier is supported by the JavaScript runtime.
 */
export function isValidIanaTimeZone(tz: string): boolean {
  if (!tz || typeof tz !== "string") return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the current calendar date string (YYYY-MM-DD) evaluated in the specified timezone.
 * Never uses UTC or toISOString() for local calendar date semantics.
 */
export function getTodayDateString(timeZone: string = getUserTimeZone()): string {
  const tz = isValidIanaTimeZone(timeZone) ? timeZone : "UTC";
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

/**
 * Parses YYYY-MM-DD string into integer components without browser timezone shifts.
 */
export function parseDateParts(dateStr: string): { year: number; month: number; day: number } {
  const [yStr, mStr, dStr] = dateStr.split("-");
  return {
    year: parseInt(yStr, 10),
    month: parseInt(mStr, 10),
    day: parseInt(dStr, 10),
  };
}

/**
 * Formats integer year, month, day into YYYY-MM-DD.
 */
export function formatDateParts(year: number, month: number, day: number): string {
  const y = String(year).padStart(4, "0");
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Adds an integer number of calendar days to a YYYY-MM-DD date string.
 * Uses UTC arithmetic so daylight saving time shifts cannot alter the calendar date count.
 */
export function addCalendarDays(dateStr: string, days: number): string {
  const { year, month, day } = parseDateParts(dateStr);
  const utcDate = new Date(Date.UTC(year, month - 1, day + days));
  return formatDateParts(
    utcDate.getUTCFullYear(),
    utcDate.getUTCMonth() + 1,
    utcDate.getUTCDate()
  );
}

/**
 * Adds an integer number of calendar months to a YYYY-MM-DD date string.
 */
export function addCalendarMonths(dateStr: string, months: number): string {
  const { year, month, day } = parseDateParts(dateStr);
  let newYear = year;
  let newMonth = month + months;

  while (newMonth > 12) {
    newMonth -= 12;
    newYear += 1;
  }
  while (newMonth < 1) {
    newMonth += 12;
    newYear -= 1;
  }

  // Handle month length overflow (e.g. Jan 31 + 1 month -> Feb 28/29)
  const maxDays = new Date(Date.UTC(newYear, newMonth, 0)).getUTCDate();
  const newDay = Math.min(day, maxDays);

  return formatDateParts(newYear, newMonth, newDay);
}

/**
 * Returns the day of the week for a YYYY-MM-DD date string, with Monday=1 through Sunday=7.
 */
export function getWeekdayNumber(dateStr: string): number {
  const { year, month, day } = parseDateParts(dateStr);
  const date = new Date(Date.UTC(year, month - 1, day));
  const jsDay = date.getUTCDay(); // 0 is Sunday, 1 is Monday, ..., 6 is Saturday
  return jsDay === 0 ? 7 : jsDay;
}

/**
 * Converts a calendar date (YYYY-MM-DD) and local time (HH:mm) in a specified timezone
 * into an absolute ISO 8601 UTC timestamp string.
 */
export function localDateTimeToUtcIso(
  dateStr: string,
  timeStr: string = "00:00",
  timeZone: string = getUserTimeZone()
): string {
  const tz = isValidIanaTimeZone(timeZone) ? timeZone : "UTC";
  const { year, month, day } = parseDateParts(dateStr);
  const [hStr, mStr] = timeStr.split(":");
  const targetHour = parseInt(hStr || "0", 10);
  const targetMinute = parseInt(mStr || "0", 10);

  // Initial approximation instant assuming UTC
  let candidateMs = Date.UTC(year, month - 1, day, targetHour, targetMinute, 0, 0);

  // Refine using Intl.DateTimeFormat in the target timezone
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  });

  for (let i = 0; i < 3; i++) {
    const parts = dtf.formatToParts(new Date(candidateMs));
    const findPart = (type: string) => {
      const p = parts.find((part) => part.type === type);
      return p ? parseInt(p.value, 10) : 0;
    };

    const curY = findPart("year");
    const curM = findPart("month");
    const curD = findPart("day");
    let curH = findPart("hour");
    if (curH === 24) curH = 0;
    const curMin = findPart("minute");

    const curLocalMs = Date.UTC(curY, curM - 1, curD, curH, curMin, 0, 0);
    const targetLocalMs = Date.UTC(year, month - 1, day, targetHour, targetMinute, 0, 0);
    const diff = targetLocalMs - curLocalMs;

    if (diff === 0) break;
    candidateMs += diff;
  }

  return new Date(candidateMs).toISOString();
}

/**
 * Extracts the calendar date string (YYYY-MM-DD) of a UTC timestamp in a target timezone.
 */
export function utcIsoToLocalDate(
  isoTimestamp: string,
  timeZone: string = getUserTimeZone()
): string {
  const tz = isValidIanaTimeZone(timeZone) ? timeZone : "UTC";
  const date = new Date(isoTimestamp);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

/**
 * Extracts the local time string (HH:mm) of a UTC timestamp in a target timezone.
 */
export function utcIsoToLocalTime(
  isoTimestamp: string,
  timeZone: string = getUserTimeZone()
): string {
  const tz = isValidIanaTimeZone(timeZone) ? timeZone : "UTC";
  const date = new Date(isoTimestamp);
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return formatter.format(date);
}

/**
 * Calculates the number of minutes from 00:00 local time for an ISO timestamp.
 */
export function getMinutesFromDayStart(
  isoTimestamp: string,
  timeZone: string = getUserTimeZone()
): number {
  const timeStr = utcIsoToLocalTime(isoTimestamp, timeZone);
  const [h, m] = timeStr.split(":").map((v) => parseInt(v, 10));
  return h * 60 + m;
}

/**
 * Calculates duration in minutes between two ISO timestamps.
 */
export function getDurationMinutes(startIso: string, endIso: string): number {
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  return Math.max(15, Math.round((endMs - startMs) / (60 * 1000)));
}

/**
 * Formats a local time for human display (e.g. "9:00 AM" or "14:30").
 */
export function formatTimeDisplay(
  isoTimestamp: string,
  timeZone: string = getUserTimeZone()
): string {
  const tz = isValidIanaTimeZone(timeZone) ? timeZone : "UTC";
  const date = new Date(isoTimestamp);
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/**
 * Formats a full calendar date heading (e.g. "Wednesday, October 15, 2026").
 */
export function formatDateHeading(
  dateStr: string,
  timeZone: string = getUserTimeZone()
): string {
  const tz = isValidIanaTimeZone(timeZone) ? timeZone : "UTC";
  const { year, month, day } = parseDateParts(dateStr);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

/**
 * Formats a concise day header (e.g. "Wed 15").
 */
export function formatShortDayHeading(
  dateStr: string,
  timeZone: string = getUserTimeZone()
): { dayName: string; dayNumber: number } {
  const tz = isValidIanaTimeZone(timeZone) ? timeZone : "UTC";
  const { year, month, day } = parseDateParts(dateStr);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const dayName = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
  }).format(date);
  return { dayName, dayNumber: day };
}

/**
 * Computes all 35 or 42 calendar grid cells for a Month view with Monday–Sunday columns.
 */
export function calculateMonthDays(
  anchorDate: string,
  timeZone: string = getUserTimeZone()
): DayCalendarCell[] {
  const todayStr = getTodayDateString(timeZone);
  const { year, month } = parseDateParts(anchorDate);
  const firstOfMonth = formatDateParts(year, month, 1);
  const firstDayWeekday = getWeekdayNumber(firstOfMonth); // 1 (Mon) to 7 (Sun)

  // Start grid from the Monday preceding or on firstOfMonth
  const leadDays = firstDayWeekday - 1;
  const gridStartDate = addCalendarDays(firstOfMonth, -leadDays);

  const totalCells = leadDays + new Date(Date.UTC(year, month, 0)).getUTCDate() > 35 ? 42 : 35;
  const cells: DayCalendarCell[] = [];

  for (let i = 0; i < totalCells; i++) {
    const cellDateStr = addCalendarDays(gridStartDate, i);
    const { month: cellMonth, day: cellDay } = parseDateParts(cellDateStr);
    const weekday = getWeekdayNumber(cellDateStr);

    cells.push({
      dateStr: cellDateStr,
      dayNumber: cellDay,
      isCurrentMonth: cellMonth === month,
      isToday: cellDateStr === todayStr,
      isWeekend: weekday === 6 || weekday === 7,
    });
  }

  return cells;
}

/**
 * Computes the 7 days of the week containing anchorDate (Monday–Sunday).
 */
export function calculateWeekDays(
  anchorDate: string,
  timeZone: string = getUserTimeZone()
): WeekDayHeader[] {
  const todayStr = getTodayDateString(timeZone);
  const weekday = getWeekdayNumber(anchorDate); // 1 (Mon) to 7 (Sun)
  const mondayStr = addCalendarDays(anchorDate, -(weekday - 1));

  const days: WeekDayHeader[] = [];
  for (let i = 0; i < 7; i++) {
    const curDateStr = addCalendarDays(mondayStr, i);
    const { dayName, dayNumber } = formatShortDayHeading(curDateStr, timeZone);
    days.push({
      dateStr: curDateStr,
      dayName,
      dayNumber,
      isToday: curDateStr === todayStr,
    });
  }

  return days;
}

/**
 * Derives temporal range bounds and human labels for the active calendar view.
 * Crucially returns startIso and endIso representing the half-open interval [startIso, endIso).
 */
export function getTemporalBoundsForView(
  view: CalendarView,
  anchorDate: string,
  timeZone: string = getUserTimeZone()
): CalendarRange {
  const tz = isValidIanaTimeZone(timeZone) ? timeZone : "UTC";

  switch (view) {
    case "month": {
      const cells = calculateMonthDays(anchorDate, tz);
      const startDate = cells[0].dateStr;
      const endDate = cells[cells.length - 1].dateStr;
      const nextDayAfterEnd = addCalendarDays(endDate, 1);

      const { year, month } = parseDateParts(anchorDate);
      const date = new Date(Date.UTC(year, month - 1, 15, 12, 0, 0));
      const label = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        month: "long",
        year: "numeric",
      }).format(date);

      return {
        startDate,
        endDate,
        startIso: localDateTimeToUtcIso(startDate, "00:00", tz),
        endIso: localDateTimeToUtcIso(nextDayAfterEnd, "00:00", tz),
        label,
      };
    }

    case "week": {
      const weekDays = calculateWeekDays(anchorDate, tz);
      const startDate = weekDays[0].dateStr;
      const endDate = weekDays[6].dateStr;
      const nextDayAfterEnd = addCalendarDays(endDate, 1);

      const { year: y1, month: m1, day: d1 } = parseDateParts(startDate);
      const { year: y2, month: m2, day: d2 } = parseDateParts(endDate);

      const d1Date = new Date(Date.UTC(y1, m1 - 1, d1, 12, 0, 0));
      const d2Date = new Date(Date.UTC(y2, m2 - 1, d2, 12, 0, 0));

      const monthName1 = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short" }).format(d1Date);
      const monthName2 = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short" }).format(d2Date);

      let label = "";
      if (y1 === y2) {
        if (m1 === m2) {
          label = `${monthName1} ${d1} – ${d2}, ${y1}`;
        } else {
          label = `${monthName1} ${d1} – ${monthName2} ${d2}, ${y1}`;
        }
      } else {
        label = `${monthName1} ${d1}, ${y1} – ${monthName2} ${d2}, ${y2}`;
      }

      return {
        startDate,
        endDate,
        startIso: localDateTimeToUtcIso(startDate, "00:00", tz),
        endIso: localDateTimeToUtcIso(nextDayAfterEnd, "00:00", tz),
        label,
      };
    }

    case "day": {
      const startDate = anchorDate;
      const endDate = anchorDate;
      const nextDay = addCalendarDays(anchorDate, 1);

      const label = formatDateHeading(anchorDate, tz);

      return {
        startDate,
        endDate,
        startIso: localDateTimeToUtcIso(startDate, "00:00", tz),
        endIso: localDateTimeToUtcIso(nextDay, "00:00", tz),
        label,
      };
    }

    case "agenda": {
      const startDate = anchorDate;
      const endDate = addCalendarDays(anchorDate, 29); // 30-day chronological agenda
      const nextDayAfterEnd = addCalendarDays(endDate, 1);

      const { year: y1, month: m1, day: d1 } = parseDateParts(startDate);
      const { year: y2, month: m2, day: d2 } = parseDateParts(endDate);
      const d1Date = new Date(Date.UTC(y1, m1 - 1, d1, 12, 0, 0));
      const d2Date = new Date(Date.UTC(y2, m2 - 1, d2, 12, 0, 0));

      const mName1 = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short" }).format(d1Date);
      const mName2 = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short" }).format(d2Date);

      const label = `${mName1} ${d1} – ${mName2} ${d2}, ${y2}`;

      return {
        startDate,
        endDate,
        startIso: localDateTimeToUtcIso(startDate, "00:00", tz),
        endIso: localDateTimeToUtcIso(nextDayAfterEnd, "00:00", tz),
        label,
      };
    }
  }
}

/**
 * Shifts anchorDate forward or backward based on the active view.
 */
export function shiftAnchorDate(
  anchorDate: string,
  view: CalendarView,
  direction: -1 | 1
): string {
  switch (view) {
    case "month":
      return addCalendarMonths(anchorDate, direction);
    case "week":
      return addCalendarDays(anchorDate, direction * 7);
    case "day":
      return addCalendarDays(anchorDate, direction);
    case "agenda":
      return addCalendarDays(anchorDate, direction * 14);
  }
}
