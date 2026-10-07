import { z } from "zod";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const IDEA_STATUS_VALUES = ["ACTIVE", "ARCHIVED"] as const;

export const ideaStatusEnum = z.enum(IDEA_STATUS_VALUES, {
  message: "Status must be one of: ACTIVE, ARCHIVED",
});

/**
 * Route parameter validation schema for /api/ideas/:id
 */
export const ideaIdParamSchema = z.object({
  id: z
    .string({ message: "Idea ID is required and must be a string" })
    .trim()
    .refine((val) => UUID_REGEX.test(val), {
      message: "Idea ID must be a valid UUIDv4 string",
    }),
});

export type IdeaIdParam = z.infer<typeof ideaIdParamSchema>;

/**
 * Query parameter validation schema for GET /api/ideas
 */
export const ideaListQuerySchema = z.object({
  status: z
    .string()
    .optional()
    .refine(
      (val) => val === undefined || IDEA_STATUS_VALUES.includes(val as any),
      {
        message: "Status filter must be one of: ACTIVE, ARCHIVED",
      }
    ),
});

export type IdeaListQuery = z.infer<typeof ideaListQuerySchema>;

/**
 * Creation validation schema for POST /api/ideas
 *
 * Rules:
 * - title: required string, min 1 (trimmed), max 255 chars
 * - description: optional string, max 5,000 chars, whitespace-only normalizes to null
 * - strict(): rejects userId, status, timestamps, project/goal/task IDs, or unexpected fields
 */
export const createIdeaSchema = z
  .object({
    title: z
      .string({ message: "Title is required and must be a string" })
      .trim()
      .min(1, "Title cannot be empty")
      .max(255, "Title must not exceed 255 characters"),
    description: z
      .string({ message: "Description must be a string" })
      .max(5000, "Description must not exceed 5,000 characters")
      .transform((val) => {
        const trimmed = val.trim();
        return trimmed.length > 0 ? val : null;
      })
      .nullable()
      .optional(),
  })
  .strict();

export type CreateIdeaInput = z.infer<typeof createIdeaSchema>;

/**
 * Update validation schema for PATCH /api/ideas/:id
 *
 * Rules:
 * - title: optional string, min 1 (trimmed), max 255 chars
 * - description: optional string, max 5,000 chars, whitespace-only normalizes to null
 * - status: optional enum ACTIVE | ARCHIVED
 * - strict(): rejects id, userId, timestamps, or unexpected fields
 * - refine(): at least one field (title, description, status) must be supplied
 */
export const updateIdeaSchema = z
  .object({
    title: z
      .string({ message: "Title must be a string" })
      .trim()
      .min(1, "Title cannot be empty")
      .max(255, "Title must not exceed 255 characters")
      .optional(),
    description: z
      .string({ message: "Description must be a string" })
      .max(5000, "Description must not exceed 5,000 characters")
      .transform((val) => {
        const trimmed = val.trim();
        return trimmed.length > 0 ? val : null;
      })
      .nullable()
      .optional(),
    status: ideaStatusEnum.optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.title !== undefined ||
      data.description !== undefined ||
      data.status !== undefined,
    {
      message: "At least one field (title, description, or status) must be provided for update",
    }
  );

export type UpdateIdeaInput = z.infer<typeof updateIdeaSchema>;
