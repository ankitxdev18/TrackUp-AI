import { z } from "zod";

export const PROJECT_STATUS_VALUES = ["ACTIVE", "ARCHIVED"] as const;

export const projectStatusEnum = z.enum(PROJECT_STATUS_VALUES, {
  message: "Status must be one of: ACTIVE, ARCHIVED",
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
 * Project Creation Validation Schema
 * Client cannot supply userId. The server sets ownership strictly from the identity provider.
 */
export const createProjectSchema = z
  .object({
    name: z
      .string({
        message: "Project name is required and must be a string",
      })
      .trim()
      .min(1, "Project name cannot be empty")
      .max(255, "Project name must not exceed 255 characters"),
    description: z
      .string()
      .trim()
      .max(1000, "Description must not exceed 1000 characters")
      .nullable()
      .optional(),
  })
  .strict();

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

/**
 * Project Update Validation Schema
 * At least one field must be provided.
 */
export const updateProjectSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Project name cannot be empty")
      .max(255, "Project name must not exceed 255 characters")
      .optional(),
    description: z
      .string()
      .trim()
      .max(1000, "Description must not exceed 1000 characters")
      .nullable()
      .optional(),
    status: projectStatusEnum.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
  });

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

/**
 * Project ID Parameter Schema
 */
export const projectIdParamSchema = z.object({
  id: projectIdSchema,
});

export type ProjectIdParam = z.infer<typeof projectIdParamSchema>;
