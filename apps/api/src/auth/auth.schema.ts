import { z } from "zod";
import { PASSWORD_POLICY } from "./password.js";

/**
 * Registration Input Validation Schema
 *
 * Rules:
 * - name: String, trimmed, 1-255 characters.
 * - email: String, trimmed, lowercased, valid RFC email format, <= 255 characters.
 * - password: String, 10-128 Unicode code points, strictly NOT mutated.
 */
export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name cannot be empty")
    .max(255, "Name must not exceed 255 characters"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Invalid email format")
    .max(255, "Email must not exceed 255 characters"),
  password: z
    .string()
    .refine(
      (val) => {
        const count = [...val].length;
        return (
          count >= PASSWORD_POLICY.minLength &&
          count <= PASSWORD_POLICY.maxLength
        );
      },
      {
        message: `Password must be between ${PASSWORD_POLICY.minLength} and ${PASSWORD_POLICY.maxLength} characters in length.`,
      }
    ),
});

export type RegisterInput = z.infer<typeof registerSchema>;
