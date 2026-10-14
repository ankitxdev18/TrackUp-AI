import { z } from "zod";

export const MAX_SUPPORTED_PAISE = 2147483647; // Signed 32-bit integer maximum

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const createSavingsGoalSchema = z.object({
  name: z
    .string({ message: "Name is required" })
    .trim()
    .min(1, "Name cannot be empty")
    .max(100, "Name must not exceed 100 characters"),
  targetAmountCents: z
    .number({ message: "Target amount is required" })
    .int("Target amount must be an integer number of paise")
    .positive("Target amount must be greater than zero")
    .max(MAX_SUPPORTED_PAISE, "Target amount exceeds maximum supported value"),
});

export type CreateSavingsGoalInput = z.infer<typeof createSavingsGoalSchema>;

export const createContributionSchema = z.object({
  amountCents: z
    .number({ message: "Contribution amount is required" })
    .int("Contribution amount must be an integer number of paise")
    .positive("Contribution amount must be greater than zero")
    .max(MAX_SUPPORTED_PAISE, "Contribution amount exceeds maximum supported value"),
  note: z
    .string()
    .trim()
    .max(500, "Note must not exceed 500 characters")
    .optional()
    .nullable()
    .transform((val) => (val && val.length > 0 ? val : null)),
});

export type CreateContributionInput = z.infer<typeof createContributionSchema>;

export const updateSavingsGoalStatusSchema = z.object({
  status: z.enum(["COMPLETED", "ARCHIVED"], {
    message: "Status must be either COMPLETED or ARCHIVED",
  }),
});

export type UpdateSavingsGoalStatusInput = z.infer<
  typeof updateSavingsGoalStatusSchema
>;

export const savingsGoalIdParamSchema = z.object({
  id: z.string().regex(UUID_REGEX, "Invalid savings goal ID format"),
});

export const listContributionsQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1, "Limit must be at least 1")
    .max(100, "Limit cannot exceed 100")
    .default(50),
  offset: z.coerce
    .number()
    .int()
    .min(0, "Offset cannot be negative")
    .default(0),
});

/**
 * Safely serializes an integer BigInt amount to number if within Number.MAX_SAFE_INTEGER,
 * or as a decimal string if it exceeds JavaScript's safe integer precision limit.
 */
export function serializeMonetaryAmount(amount: bigint): number | string {
  if (amount <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(amount);
  }
  return amount.toString();
}

/**
 * Calculates progress percentage strictly clamped to 100.0% max.
 * Maintains one decimal place precision (e.g. 30.5%).
 */
export function calculateClampedProgressPercent(saved: bigint, target: bigint): number {
  if (target <= 0n) return 0;
  if (saved >= target) return 100.0;
  if (saved <= 0n) return 0;

  const scaled = (saved * 10000n) / target;
  const rounded = Number(scaled) / 100;
  const roundedOneDecimal = Math.round(rounded * 10) / 10;
  return Math.min(100.0, Math.max(0, roundedOneDecimal));
}

