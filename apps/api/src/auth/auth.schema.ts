import { z } from "zod";
import { isValidIanaTimeZone } from "../habits/habit.date.js";
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

/**
 * Canonical Password Policy:
 * Defined in apps/api/src/auth/password.ts (PASSWORD_POLICY):
 * - minLength: 10 Unicode code points
 * - maxLength: 128 Unicode code points
 *
 * Registration strictly enforces: 10 <= length <= 128.
 * Login schema accepts non-empty strings up to maxLength (128) characters,
 * preventing password policy leakage during credential verification while protecting
 * against algorithmic complexity DoS on Argon2id hashing.
 */
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Invalid email format")
    .max(255, "Email must not exceed 255 characters"),
  password: z
    .string()
    .min(1, "Password cannot be empty")
    .max(PASSWORD_POLICY.maxLength, `Password must not exceed ${PASSWORD_POLICY.maxLength} characters`),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Profile Update Input Validation Schema
 *
 * Rules:
 * - name: String, trimmed, 1-255 characters (optional).
 * - timezone: Valid IANA timezone identifier string (optional).
 * - At least one of name or timezone must be provided.
 */
export const updateProfileSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Name cannot be empty")
      .max(255, "Name must not exceed 255 characters")
      .optional(),
    timezone: z
      .string()
      .trim()
      .refine((tz) => isValidIanaTimeZone(tz), {
        message: "Invalid IANA timezone identifier",
      })
      .optional(),
  })
  .refine((data) => data.name !== undefined || data.timezone !== undefined, {
    message: "At least one field (name or timezone) must be provided",
  });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/**
 * Password Change Input Validation Schema
 *
 * Rules:
 * - currentPassword: String, non-empty, <= 128 characters.
 * - newPassword: String, 10-128 Unicode code points.
 * - newPassword must differ from currentPassword.
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, "Current password is required")
      .max(128, "Password must not exceed 128 characters"),
    newPassword: z.string().refine(
      (val) => {
        const count = [...val].length;
        return (
          count >= PASSWORD_POLICY.minLength &&
          count <= PASSWORD_POLICY.maxLength
        );
      },
      {
        message: `New password must be between ${PASSWORD_POLICY.minLength} and ${PASSWORD_POLICY.maxLength} characters in length.`,
      }
    ),
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "New password must be different from current password",
    path: ["newPassword"],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
