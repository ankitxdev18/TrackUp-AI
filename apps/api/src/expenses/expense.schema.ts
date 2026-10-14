import { z } from "zod";

export const CANONICAL_CATEGORIES = [
  "food",
  "housing",
  "transport",
  "shopping",
  "entertainment",
  "health",
  "education",
  "other",
] as const;

export type CanonicalCategory = (typeof CANONICAL_CATEGORIES)[number];

export const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const createExpenseSchema = z.object({
  amountCents: z
    .number({ message: "Amount is required" })
    .int("Amount must be an integer number of cents")
    .positive("Amount must be greater than zero")
    .max(2147483647, "Amount exceeds maximum permitted value"),
  date: z
    .string({ message: "Date is required" })
    .regex(ISO_DATE_REGEX, "Date must be formatted as YYYY-MM-DD"),
  categoryId: z.enum(CANONICAL_CATEGORIES, {
    message: "Invalid expense category",
  }),
  description: z
    .string()
    .trim()
    .max(500, "Description must be 500 characters or fewer")
    .optional()
    .nullable()
    .transform((val) => (val && val.length > 0 ? val : null)),
});

export const updateExpenseSchema = createExpenseSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: "At least one field must be provided for update" }
);

export const expenseIdParamSchema = z.object({
  id: z.string().regex(UUID_REGEX, "Invalid expense ID format"),
});

const paginationParam = (
  name: string,
  min: number,
  max: number | undefined,
  defaultValue: number,
  minMessage?: string
) => {
  let schema = z
    .number({
      message: `${name} must be a valid integer`,
    })
    .int(`${name} must be an integer`)
    .min(min, minMessage || `${name} must be at least ${min}`);

  if (max !== undefined) {
    schema = schema.max(max, `${name} cannot exceed ${max}`);
  }

  return z.preprocess((val) => {
    if (val === undefined || val === null) return defaultValue;
    if (typeof val === "number") return val;
    if (typeof val === "string") {
      const trimmed = val.trim();
      if (trimmed === "") return NaN;
      if (!/^-?\d+$/.test(trimmed)) return NaN;
      const num = Number(trimmed);
      return Number.isSafeInteger(num) ? num : NaN;
    }
    return NaN;
  }, schema);
};

export const listExpensesQuerySchema = z.object({
  startDate: z.string().regex(ISO_DATE_REGEX).optional(),
  endDate: z.string().regex(ISO_DATE_REGEX).optional(),
  categoryId: z.enum(CANONICAL_CATEGORIES).optional(),
  search: z.string().trim().max(100).optional(),
  limit: paginationParam("Limit", 1, 200, 50),
  offset: paginationParam("Offset", 0, undefined, 0, "Offset cannot be negative"),
});

export const expenseSummaryQuerySchema = z.object({
  startDate: z.string().regex(ISO_DATE_REGEX, "startDate must be YYYY-MM-DD"),
  endDate: z.string().regex(ISO_DATE_REGEX, "endDate must be YYYY-MM-DD"),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;
export type ExpenseSummaryQuery = z.infer<typeof expenseSummaryQuerySchema>;

export const MONTH_REGEX = /^\d{4}-(?:0[1-9]|1[0-2])$/;

export const createBudgetSchema = z.object({
  month: z
    .string({ message: "Month is required" })
    .regex(MONTH_REGEX, "Month must be formatted as YYYY-MM"),
  amountCents: z
    .number({ message: "Amount is required" })
    .int("Amount must be an integer number of paise")
    .positive("Budget amount must be greater than zero")
    .max(2147483647, "Budget amount exceeds maximum permitted value"),
});

export const updateBudgetSchema = z.object({
  month: z
    .string()
    .regex(MONTH_REGEX, "Month must be formatted as YYYY-MM")
    .optional(),
  amountCents: z
    .number({ message: "Amount is required" })
    .int("Amount must be an integer number of paise")
    .positive("Budget amount must be greater than zero")
    .max(2147483647, "Budget amount exceeds maximum permitted value"),
});

export const getBudgetQuerySchema = z.object({
  month: z
    .string()
    .regex(MONTH_REGEX, "Month must be formatted as YYYY-MM")
    .optional(),
});

export const deleteBudgetQuerySchema = z.object({
  month: z
    .string({ message: "Month is required" })
    .regex(MONTH_REGEX, "Month must be formatted as YYYY-MM"),
});

export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;
export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>;
export type GetBudgetQuery = z.infer<typeof getBudgetQuerySchema>;
export type DeleteBudgetQuery = z.infer<typeof deleteBudgetQuerySchema>;
