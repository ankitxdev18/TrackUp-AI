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

export const PRIORITY_VALUES = ["LOW", "MEDIUM", "HIGH"] as const;
export const STATUS_VALUES = ["TODO", "COMPLETED"] as const;

export const priorityEnum = z.enum(PRIORITY_VALUES, {
  message: "Priority must be one of: LOW, MEDIUM, HIGH",
});

export const statusEnum = z.enum(STATUS_VALUES, {
  message: "Status must be one of: TODO, COMPLETED",
});

export const dueDateSchema = z
  .string()
  .trim()
  .refine((val) => isValidCalendarDate(val), {
    message: "Due date must be a valid calendar date in YYYY-MM-DD format",
  });

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const projectIdSchema = z
  .string()
  .trim()
  .refine((val) => UUID_REGEX.test(val), {
    message: "Project ID must be a valid UUIDv4 string",
  });

/**
 * Task Creation Validation Schema
 * Client cannot supply userId. The server sets ownership strictly from the identity provider.
 */
export const createTaskSchema = z
  .object({
    title: z
      .string({
        message: "Title is required and must be a string",
      })
      .trim()
      .min(1, "Title cannot be empty")
      .max(500, "Title must not exceed 500 characters"),
    priority: priorityEnum.default("MEDIUM"),
    dueDate: dueDateSchema.nullable().optional(),
    projectId: projectIdSchema.nullable().optional(),
  })
  .strict();

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

/**
 * Task Update Validation Schema
 * At least one field must be provided.
 */
export const updateTaskSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Title cannot be empty")
      .max(500, "Title must not exceed 500 characters")
      .optional(),
    status: statusEnum.optional(),
    priority: priorityEnum.optional(),
    dueDate: dueDateSchema.nullable().optional(),
    projectId: projectIdSchema.nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
  });

export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

/**
 * Task ID Parameter Schema
 */
export const taskIdParamSchema = z.object({
  id: z
    .string()
    .trim()
    .refine((val) => UUID_REGEX.test(val), {
      message: "Task ID must be a valid UUIDv4 string",
    }),
});

export type TaskIdParam = z.infer<typeof taskIdParamSchema>;

