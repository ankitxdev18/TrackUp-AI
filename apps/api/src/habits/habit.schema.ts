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
