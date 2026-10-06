import { z } from "zod";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const HABIT_STATUS_VALUES = ["ACTIVE", "ARCHIVED"] as const;
export const HABIT_FREQUENCY_VALUES = ["DAILY"] as const;

export const habitStatusEnum = z.enum(HABIT_STATUS_VALUES, {
  message: "Status must be one of: ACTIVE, ARCHIVED",
});

export const habitFrequencyEnum = z.enum(HABIT_FREQUENCY_VALUES, {
  message: "Frequency must be DAILY",
});

export const habitIdParamSchema = z.object({
  id: z
    .string()
    .trim()
    .refine((val) => UUID_REGEX.test(val), {
      message: "Habit ID must be a valid UUIDv4 string",
    }),
});

/**
 * Habit Creation Validation Schema (H01-B)
 *
 * Rules:
 * - title: required string, trimmed, 1-255 characters
 * - description: optional string, trimmed, <= 1000 characters, nullable
 * - frequency: MVP supports DAILY only (defaults to DAILY)
 * - status: creation must strictly be ACTIVE (defaults to ACTIVE)
 * - strict(): rejects client-provided id, userId, createdAt, updatedAt, or extra fields
 */
export const createHabitSchema = z
  .object({
    title: z
      .string({
        message: "Title is required and must be a string",
      })
      .trim()
      .min(1, "Title cannot be empty")
      .max(255, "Title must not exceed 255 characters"),
    description: z
      .string()
      .trim()
      .max(1000, "Description must not exceed 1000 characters")
      .nullable()
      .optional(),
    frequency: habitFrequencyEnum.optional().default("DAILY"),
    status: z.literal("ACTIVE").optional().default("ACTIVE"),
  })
  .strict();

export type CreateHabitInput = z.infer<typeof createHabitSchema>;

/**
 * Habit Update Validation Schema (H01-B)
 *
 * Rules:
 * - title: optional string, trimmed, 1-255 characters
 * - description: optional string, trimmed, <= 1000 characters, nullable
 * - status: optional enum ACTIVE | ARCHIVED
 * - strict(): rejects userId, id, timestamps, frequency, and unexpected fields
 * - refine(): at least one field must be provided
 */
export const updateHabitSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Title cannot be empty")
      .max(255, "Title must not exceed 255 characters")
      .optional(),
    description: z
      .string()
      .trim()
      .max(1000, "Description must not exceed 1000 characters")
      .nullable()
      .optional(),
    status: habitStatusEnum.optional(),
  })
  .strict()
  .refine(
    (data) => {
      const keys = Object.keys(data).filter((k) => (data as any)[k] !== undefined);
      return keys.length > 0;
    },
    {
      message: "At least one field must be provided for update",
    }
  );

export type UpdateHabitInput = z.infer<typeof updateHabitSchema>;

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates that an ISO date string 'YYYY-MM-DD' corresponds to a valid calendar date
 */
export function isValidCalendarDate(dateStr: string): boolean {
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

/**
 * Checks if a valid calendar date is in the future relative to server local and UTC date
 */
export function isFutureDate(dateStr: string): boolean {
  const now = new Date();
  const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const utcToday = now.toISOString().slice(0, 10);
  const maxToday = localToday > utcToday ? localToday : utcToday;
  return dateStr > maxToday;
}

/**
 * Habit Completion Creation Validation Schema (H01-C)
 */
export const createCompletionSchema = z
  .object({
    date: z
      .string({
        message: "Date is required and must be a string",
      })
      .trim()
      .refine(isValidCalendarDate, {
        message: "Date must be a valid calendar date in YYYY-MM-DD format",
      })
      .refine((val) => !isFutureDate(val), {
        message: "Completion date cannot be in the future",
      }),
  })
  .strict();

export type CreateCompletionInput = z.infer<typeof createCompletionSchema>;

/**
 * Habit Completion Route Parameters Schema (H01-C)
 */
export const habitCompletionDateParamSchema = z.object({
  id: z
    .string()
    .trim()
    .refine((val) => UUID_REGEX.test(val), {
      message: "Habit ID must be a valid UUIDv4 string",
    }),
  date: z
    .string()
    .trim()
    .refine(isValidCalendarDate, {
      message: "Date must be a valid calendar date in YYYY-MM-DD format",
    }),
});

/**
 * Habit History Query Parameters Schema (H01-C)
 */
export const habitHistoryQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(30).optional().default(7),
});
