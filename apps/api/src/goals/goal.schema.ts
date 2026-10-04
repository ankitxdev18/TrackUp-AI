import { z } from "zod";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates that an ISO date string 'YYYY-MM-DD' corresponds to a valid calendar date
 */
function isValidCalendarDate(dateStr: string): boolean {
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

export const GOAL_STATUS_VALUES = ["ACTIVE", "COMPLETED", "ARCHIVED"] as const;

export const goalStatusEnum = z.enum(GOAL_STATUS_VALUES, {
  message: "Status must be one of: ACTIVE, COMPLETED, ARCHIVED",
});

export const targetDateSchema = z
  .string()
  .trim()
  .refine((val) => isValidCalendarDate(val), {
    message: "Target date must be a valid calendar date in YYYY-MM-DD format",
  });

export const progressSchema = z
  .number({
    message: "Progress must be a number",
  })
  .int("Progress must be an integer")
  .min(0, "Progress cannot be negative")
  .max(100, "Progress cannot exceed 100");

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const goalIdParamSchema = z.object({
  id: z
    .string()
    .trim()
    .refine((val) => UUID_REGEX.test(val), {
      message: "Goal ID must be a valid UUIDv4 string",
    }),
});

/**
 * Goal Creation Validation Schema
 * Client cannot supply userId. The server sets ownership strictly from session context.
 */
export const createGoalSchema = z.object({
  title: z
    .string({
      message: "Title is required and must be a string",
    })
    .trim()
    .min(1, "Title cannot be empty")
    .max(500, "Title must not exceed 500 characters"),
  description: z
    .string()
    .trim()
    .max(2000, "Description must not exceed 2000 characters")
    .nullable()
    .optional(),
  status: goalStatusEnum.optional().default("ACTIVE"),
  progress: progressSchema.optional().default(0),
  targetDate: targetDateSchema.nullable().optional(),
});

export type CreateGoalInput = z.infer<typeof createGoalSchema>;

/**
 * Goal Update Validation Schema
 * At least one field must be provided.
 */
export const updateGoalSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Title cannot be empty")
      .max(500, "Title must not exceed 500 characters")
      .optional(),
    description: z
      .string()
      .trim()
      .max(2000, "Description must not exceed 2000 characters")
      .nullable()
      .optional(),
    status: goalStatusEnum.optional(),
    progress: progressSchema.optional(),
    targetDate: targetDateSchema.nullable().optional(),
  })
  .refine(
    (data) => {
      const keys = Object.keys(data).filter((k) => (data as any)[k] !== undefined);
      return keys.length > 0;
    },
    {
      message: "At least one field must be provided for update",
    }
  );

export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;
