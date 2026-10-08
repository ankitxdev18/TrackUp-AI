import { z } from "zod";
import { isValidCalendarDateString } from "./habit.date.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const HABIT_STATUS_VALUES = ["ACTIVE", "ARCHIVED"] as const;
export const HABIT_FREQUENCY_VALUES = ["DAILY"] as const;

/**
 * Re-exported calendar validation helpers for cross-domain schema compatibility
 */
export function isValidCalendarDate(dateStr: string): boolean {
  return isValidCalendarDateString(dateStr);
}

export function isFutureDate(dateStr: string): boolean {
  const now = new Date();
  const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const maxEarthToday = new Date(Date.now() + 14 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const maxAllowedToday = localToday > maxEarthToday ? localToday : maxEarthToday;
  return dateStr > maxAllowedToday;
}

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

export const habitStatusQuerySchema = z.object({
  status: habitStatusEnum.optional().default("ACTIVE"),
});

/**
 * Habit Creation Validation Schema (H03)
 *
 * Rules:
 * - title: required string, trimmed, 1-255 characters
 * - description: optional string, trimmed, <= 1000 characters, nullable
 * - frequency: MVP supports DAILY only
 * - strict(): rejects client-provided id, userId, status, createdAt, updatedAt, streaks, or extra fields
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
    frequency: z.literal("DAILY", {
      message: "Frequency must be DAILY",
    }).optional().default("DAILY"),
  })
  .strict();

export type CreateHabitInput = z.infer<typeof createHabitSchema>;

/**
 * Habit Update Validation Schema (H03)
 *
 * Rules:
 * - title: optional string, trimmed, 1-255 characters
 * - description: optional string, trimmed, <= 1000 characters, nullable
 * - status: optional enum ACTIVE | ARCHIVED
 * - strict(): rejects userId, id, timestamps, frequency, streaks, and unexpected fields
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

/**
 * Habit Completion Creation Validation Schema (H03)
 *
 * Rules:
 * - date: required calendar date string in YYYY-MM-DD format
 * - strict(): rejects client-provided userId, habitId, completedAt, createdAt, or extra fields
 */
export const createCompletionSchema = z
  .object({
    date: z
      .string({
        message: "Date is required and must be a string",
      })
      .trim()
      .min(1, "Date is required")
      .refine(isValidCalendarDateString, {
        message: "Date must be a valid calendar date in YYYY-MM-DD format",
      }),
  })
  .strict();

export type CreateCompletionInput = z.infer<typeof createCompletionSchema>;

/**
 * Habit Completion Route Parameters Schema (H03)
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
    .refine(isValidCalendarDateString, {
      message: "Date must be a valid calendar date in YYYY-MM-DD format",
    }),
});

/**
 * Habit History Query Parameters Schema (H03)
 *
 * Limits: min 7, max 30, default 30
 */
export const habitHistoryQuerySchema = z.object({
  days: z.coerce
    .number({
      message: "days parameter must be a number",
    })
    .int("days parameter must be an integer")
    .min(7, "History window must be at least 7 days")
    .max(30, "History window cannot exceed 30 days")
    .default(30),
});
