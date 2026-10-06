import { z } from "zod";
import { isValidCalendarDate, isFutureDate } from "../habits/habit.schema.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export { isValidCalendarDate, isFutureDate };

/**
 * Journal Entry ID parameter validation schema
 */
export const journalIdParamSchema = z.object({
  id: z
    .string({ message: "Journal ID is required and must be a string" })
    .trim()
    .refine((val) => UUID_REGEX.test(val), {
      message: "Journal entry ID must be a valid UUIDv4 string",
    }),
});

export type JournalIdParam = z.infer<typeof journalIdParamSchema>;

/**
 * Journal Entry Date parameter validation schema
 * Used for GET /api/journal/by-date/:date
 */
export const journalDateParamSchema = z.object({
  date: z
    .string({ message: "Date is required and must be a string" })
    .trim()
    .refine(isValidCalendarDate, {
      message: "Date must be a valid calendar date in YYYY-MM-DD format",
    })
    .refine((val) => !isValidCalendarDate(val) || !isFutureDate(val), {
      message: "Date cannot be in the future",
    }),
});

export type JournalDateParam = z.infer<typeof journalDateParamSchema>;

/**
 * Journal Entry Creation Validation Schema (H02-C)
 *
 * Rules:
 * - entryDate: required valid calendar date string (YYYY-MM-DD), today or past (future rejected)
 * - title: optional string, max 255 chars, whitespace-only normalizes to null
 * - content: required string, 1 to 20,000 chars, whitespace-only rejected,
 *            trims only surrounding whitespace while preserving internal formatting/newlines
 * - strict(): rejects client-provided id, userId, createdAt, updatedAt, or extra fields
 */
export const createJournalEntrySchema = z
  .object({
    entryDate: z
      .string({ message: "Entry date is required and must be a string" })
      .trim()
      .min(1, "Entry date is required")
      .refine(isValidCalendarDate, {
        message: "Entry date must be a valid calendar date in YYYY-MM-DD format",
      })
      .refine((val) => !isValidCalendarDate(val) || !isFutureDate(val), {
        message: "Entry date cannot be in the future",
      }),
    title: z
      .string({ message: "Title must be a string" })
      .trim()
      .max(255, "Title must not exceed 255 characters")
      .transform((val) => (val.length > 0 ? val : null))
      .nullable()
      .optional(),
    content: z
      .string({ message: "Content is required and must be a string" })
      .transform((val) => val.trim())
      .refine((val) => val.length > 0, {
        message: "Content cannot be empty",
      })
      .refine((val) => val.length <= 20000, {
        message: "Content must not exceed 20,000 characters",
      }),
  })
  .strict();

export type CreateJournalEntryInput = z.infer<typeof createJournalEntrySchema>;

/**
 * Journal Entry Update Validation Schema (H02-C)
 *
 * Rules:
 * - title: optional string, max 255 chars, nullable (allows removing title),
 *          whitespace-only normalizes to null
 * - content: optional string, 1 to 20,000 chars, whitespace-only rejected
 * - entryDate: NOT allowed (entryDate is immutable)
 * - strict(): rejects client-provided id, userId, entryDate, timestamps, or unexpected fields
 * - refine(): at least one field (title or content) must be supplied
 */
export const updateJournalEntrySchema = z
  .object({
    title: z
      .string({ message: "Title must be a string" })
      .trim()
      .max(255, "Title must not exceed 255 characters")
      .transform((val) => (val.length > 0 ? val : null))
      .nullable()
      .optional(),
    content: z
      .string({ message: "Content must be a string" })
      .transform((val) => val.trim())
      .refine((val) => val.length > 0, {
        message: "Content cannot be empty",
      })
      .refine((val) => val.length <= 20000, {
        message: "Content must not exceed 20,000 characters",
      })
      .optional(),
  })
  .strict()
  .refine(
    (data) => data.title !== undefined || data.content !== undefined,
    {
      message: "At least one field (title or content) must be provided for update",
    }
  );

export type UpdateJournalEntryInput = z.infer<typeof updateJournalEntrySchema>;
