import { addCalendarDays, diffCalendarDays } from "./habit.date.js";

/**
 * Habit Streak Engine (Milestone H03)
 *
 * Implements pure, derived streak calculation from completion dates.
 *
 * Invariants:
 * - currentStreak and longestStreak are strictly derived values, never stored in the DB.
 * - When no completions exist: currentStreak = 0, longestStreak = 0.
 * - currentStreak:
 *     - If today (T) is completed: contiguous completed chain ending at T.
 *     - If today (T) is NOT completed, but yesterday (Y) is completed: today is pending (grace period);
 *       currentStreak equals contiguous completed chain ending at Y.
 *     - If neither T nor Y is completed: currentStreak = 0.
 *     - The chain extends backward through the entire lifetime of the habit (NOT capped by the UI history window).
 * - longestStreak:
 *     - Maximum contiguous run of completed calendar days across the habit's entire lifetime.
 *     - NOT capped by the 7-30 day history window.
 */

export interface StreakMetrics {
  currentStreak: number;
  longestStreak: number;
}

export function calculateStreaks(
  completedDates: string[],
  userLocalToday: string
): StreakMetrics {
  if (!completedDates || completedDates.length === 0) {
    return {
      currentStreak: 0,
      longestStreak: 0,
    };
  }

  // Deduplicate and sort dates ascending
  const datesSet = new Set(completedDates);
  const sortedDates = Array.from(datesSet).sort();

  if (sortedDates.length === 0) {
    return {
      currentStreak: 0,
      longestStreak: 0,
    };
  }

  // 1. Calculate currentStreak
  const T = userLocalToday;
  const Y = addCalendarDays(userLocalToday, -1);

  let currentStreak = 0;

  if (datesSet.has(T)) {
    // Today is completed; count consecutive completed days ending at T
    let count = 0;
    let cursor = T;
    while (datesSet.has(cursor)) {
      count++;
      cursor = addCalendarDays(cursor, -1);
    }
    currentStreak = count;
  } else if (datesSet.has(Y)) {
    // Today is pending / not yet completed, but yesterday was completed
    let count = 0;
    let cursor = Y;
    while (datesSet.has(cursor)) {
      count++;
      cursor = addCalendarDays(cursor, -1);
    }
    currentStreak = count;
  } else {
    // Neither today nor yesterday was completed; active streak is broken
    currentStreak = 0;
  }

  // 2. Calculate longestStreak across the complete history
  let longestStreak = 0;
  let currentRun = 0;
  let prevDate: string | null = null;

  for (const date of sortedDates) {
    if (prevDate === null) {
      currentRun = 1;
    } else {
      const diff = diffCalendarDays(prevDate, date);
      if (diff === 1) {
        currentRun++;
      } else {
        // Gap in completion dates; reset run to 1 for this date
        currentRun = 1;
      }
    }

    if (currentRun > longestStreak) {
      longestStreak = currentRun;
    }
    prevDate = date;
  }

  if (longestStreak === 0 && sortedDates.length > 0) {
    longestStreak = 1;
  }

  return {
    currentStreak,
    longestStreak,
  };
}
