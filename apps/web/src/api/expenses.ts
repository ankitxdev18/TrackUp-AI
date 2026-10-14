import {
  Car,
  Film,
  GraduationCap,
  HeartPulse,
  Home,
  ShoppingBag,
  Tag,
  Utensils,
  type LucideIcon,
} from "lucide-react";

export type CanonicalCategory =
  | "food"
  | "housing"
  | "transport"
  | "shopping"
  | "entertainment"
  | "health"
  | "education"
  | "other";

export interface CategoryMeta {
  id: CanonicalCategory;
  name: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
}

export const CATEGORY_MAP: Record<CanonicalCategory, CategoryMeta> = {
  food: {
    id: "food",
    name: "Food & Dining",
    icon: Utensils,
    color: "#e6a83a",
    bgColor: "rgba(230, 168, 58, 0.14)",
  },
  housing: {
    id: "housing",
    name: "Housing & Utilities",
    icon: Home,
    color: "#7c6ff6",
    bgColor: "rgba(124, 111, 246, 0.14)",
  },
  transport: {
    id: "transport",
    name: "Transportation",
    icon: Car,
    color: "#3b82f6",
    bgColor: "rgba(59, 130, 246, 0.14)",
  },
  shopping: {
    id: "shopping",
    name: "Shopping & Goods",
    icon: ShoppingBag,
    color: "#a855f7",
    bgColor: "rgba(168, 85, 247, 0.14)",
  },
  entertainment: {
    id: "entertainment",
    name: "Entertainment & Leisure",
    icon: Film,
    color: "#ec4899",
    bgColor: "rgba(236, 72, 153, 0.14)",
  },
  health: {
    id: "health",
    name: "Health & Wellness",
    icon: HeartPulse,
    color: "#35c982",
    bgColor: "rgba(53, 201, 130, 0.14)",
  },
  education: {
    id: "education",
    name: "Work & Education",
    icon: GraduationCap,
    color: "#06b6d4",
    bgColor: "rgba(6, 182, 212, 0.14)",
  },
  other: {
    id: "other",
    name: "Miscellaneous",
    icon: Tag,
    color: "#71717a",
    bgColor: "rgba(113, 113, 122, 0.14)",
  },
};

export const CANONICAL_CATEGORIES = Object.keys(CATEGORY_MAP) as CanonicalCategory[];

export function getCategoryMeta(categoryId: string): CategoryMeta {
  return CATEGORY_MAP[categoryId as CanonicalCategory] || CATEGORY_MAP.other;
}

export const MAX_SUPPORTED_PAISE = 2147483647; // PostgreSQL signed 32-bit integer maximum

export function formatCents(cents: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function parseCurrencyInputToCents(val: string): number | null {
  if (typeof val !== "string") return null;
  const trimmed = val.trim();
  if (!trimmed) return null;

  // Split into whole integer rupees and optional fractional paise
  const parts = trimmed.split(".");
  if (parts.length > 2) return null; // Reject multiple decimal points
  const wholePart = parts[0]!;
  const fractionStr = parts[1];

  // If grouping commas are present, enforce strict grouping patterns
  if (wholePart.includes(",")) {
    // Valid Indian format: e.g. 1,000 or 12,000 or 1,25,000 or 12,50,000
    const isIndianGrouping = /^\d{1,2}(,\d{2})*,\d{3}$/.test(wholePart);
    // Valid Western format: e.g. 1,000 or 12,000 or 125,000 or 1,250,000
    const isWesternGrouping = /^\d{1,3}(,\d{3})+$/.test(wholePart);
    if (!isIndianGrouping && !isWesternGrouping) {
      return null;
    }
  } else {
    // No commas: whole rupees must consist exclusively of one or more digits
    if (!/^\d+$/.test(wholePart)) return null;
  }

  // Reject excess fractional precision (more than 2 decimal digits) or invalid fraction characters
  if (fractionStr !== undefined) {
    if (fractionStr.length > 2 || !/^\d+$/.test(fractionStr)) {
      return null;
    }
  }

  // Bound check whole rupees digit count to prevent integer overflow
  const cleanWhole = wholePart.replace(/,/g, "");
  if (cleanWhole.length > 10) return null;
  const whole = parseInt(cleanWhole, 10);
  if (isNaN(whole)) return null;

  const fraction = fractionStr
    ? parseInt(fractionStr.padEnd(2, "0"), 10)
    : 0;
  if (isNaN(fraction)) return null;

  const totalPaise = whole * 100 + fraction;

  // Must be strictly greater than zero and within signed 32-bit integer bounds
  if (totalPaise <= 0 || totalPaise > MAX_SUPPORTED_PAISE) {
    return null;
  }

  return totalPaise;
}

export interface Expense {
  id: string;
  userId: string;
  amountCents: number;
  date: string;
  categoryId: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateExpenseInput {
  amountCents: number;
  date: string;
  categoryId: string;
  description?: string | null;
}

export interface UpdateExpenseInput {
  amountCents?: number;
  date?: string;
  categoryId?: string;
  description?: string | null;
}

export interface ListExpensesParams {
  startDate?: string;
  endDate?: string;
  categoryId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface ExpensesListResponse {
  expenses: Expense[];
  total: number;
}

export interface CategorySummaryItem {
  categoryId: string;
  totalAmountCents: number;
  transactionCount: number;
  percentage: number;
}

export interface ExpenseSummaryResponse {
  startDate: string;
  endDate: string;
  totalAmountCents: number;
  transactionCount: number;
  byCategory: CategorySummaryItem[];
}

export class ExpenseApiError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = "ExpenseApiError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export async function fetchExpenses(
  params: ListExpensesParams = {}
): Promise<ExpensesListResponse> {
  const query = new URLSearchParams();
  if (params.startDate) query.set("startDate", params.startDate);
  if (params.endDate) query.set("endDate", params.endDate);
  if (params.categoryId) query.set("categoryId", params.categoryId);
  if (params.search) query.set("search", params.search);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));

  const url = query.toString() ? `/api/expenses?${query.toString()}` : "/api/expenses";

  const response = await fetch(url, {
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    let errorData: any = {};
    try {
      errorData = await response.json();
    } catch {
      // ignore parse failure
    }
    throw new ExpenseApiError(
      response.status,
      errorData.code || "FETCH_FAILED",
      errorData.error || "Failed to retrieve expenses"
    );
  }

  return response.json();
}

export async function fetchExpenseSummary(
  startDate: string,
  endDate: string
): Promise<ExpenseSummaryResponse> {
  const response = await fetch(
    `/api/expenses/summary?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
    {
      credentials: "include",
      headers: {
        Accept: "application/json",
      },
    }
  );

  if (!response.ok) {
    let errorData: any = {};
    try {
      errorData = await response.json();
    } catch {
      // ignore parse failure
    }
    throw new ExpenseApiError(
      response.status,
      errorData.code || "SUMMARY_FETCH_FAILED",
      errorData.error || "Failed to retrieve expense summary"
    );
  }

  return response.json();
}

export async function createExpense(
  input: CreateExpenseInput
): Promise<Expense> {
  const response = await fetch("/api/expenses", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    let errorData: any = {};
    try {
      errorData = await response.json();
    } catch {
      // ignore parse failure
    }
    throw new ExpenseApiError(
      response.status,
      errorData.code || "CREATE_FAILED",
      errorData.error || "Failed to create expense"
    );
  }

  const data = await response.json();
  return data.expense;
}

export async function updateExpense(
  id: string,
  updates: UpdateExpenseInput
): Promise<Expense> {
  const response = await fetch(`/api/expenses/${encodeURIComponent(id)}`, {
    method: "PATCH",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    let errorData: any = {};
    try {
      errorData = await response.json();
    } catch {
      // ignore parse failure
    }
    throw new ExpenseApiError(
      response.status,
      errorData.code || "UPDATE_FAILED",
      errorData.error || "Failed to update expense"
    );
  }

  const data = await response.json();
  return data.expense;
}

export async function deleteExpense(
  id: string
): Promise<{ success: boolean; id: string }> {
  const response = await fetch(`/api/expenses/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    let errorData: any = {};
    try {
      errorData = await response.json();
    } catch {
      // ignore parse failure
    }
    throw new ExpenseApiError(
      response.status,
      errorData.code || "DELETE_FAILED",
      errorData.error || "Failed to delete expense"
    );
  }

  return response.json();
}

export interface MonthlyBudget {
  id: string;
  userId: string;
  month: string;
  amountCents: number;
  createdAt: string;
  updatedAt: string;
}

export interface MonthlyBudgetSummary {
  budget: MonthlyBudget | null;
  month: string;
  startDate: string;
  endDate: string;
  budgetAmountCents: number | null;
  spentAmountCents: number;
  remainingAmountCents: number;
  overBudgetAmountCents: number;
  utilizationPercent: number;
  transactionCount: number;
  isExceeded: boolean;
}

export interface SetBudgetInput {
  month: string;
  amountCents: number;
}

export async function fetchMonthlyBudget(
  month?: string
): Promise<MonthlyBudgetSummary> {
  const query = month ? `?month=${encodeURIComponent(month)}` : "";
  const response = await fetch(`/api/expenses/budget${query}`, {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    let errorData: any = {};
    try {
      errorData = await response.json();
    } catch {
      // ignore
    }
    throw new ExpenseApiError(
      response.status,
      errorData.code || "FETCH_BUDGET_FAILED",
      errorData.error || "Failed to fetch monthly budget"
    );
  }

  return response.json();
}

export async function createMonthlyBudget(
  input: SetBudgetInput
): Promise<MonthlyBudget> {
  const response = await fetch("/api/expenses/budget", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    let errorData: any = {};
    try {
      errorData = await response.json();
    } catch {
      // ignore
    }
    throw new ExpenseApiError(
      response.status,
      errorData.code || "CREATE_BUDGET_FAILED",
      errorData.error || "Failed to create monthly budget"
    );
  }

  const data = await response.json();
  return data.budget;
}

export async function updateMonthlyBudget(
  input: SetBudgetInput
): Promise<MonthlyBudget> {
  const response = await fetch("/api/expenses/budget", {
    method: "PUT",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    let errorData: any = {};
    try {
      errorData = await response.json();
    } catch {
      // ignore
    }
    throw new ExpenseApiError(
      response.status,
      errorData.code || "UPDATE_BUDGET_FAILED",
      errorData.error || "Failed to update monthly budget"
    );
  }

  const data = await response.json();
  return data.budget;
}

export async function saveMonthlyBudget(
  input: SetBudgetInput
): Promise<MonthlyBudget> {
  let response = await fetch("/api/expenses/budget", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(input),
  });

  if (response.status === 409) {
    response = await fetch("/api/expenses/budget", {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(input),
    });
  }

  if (!response.ok) {
    let errorData: any = {};
    try {
      errorData = await response.json();
    } catch {
      // ignore
    }
    throw new ExpenseApiError(
      response.status,
      errorData.code || "SAVE_BUDGET_FAILED",
      errorData.error || "Failed to save monthly budget"
    );
  }

  const data = await response.json();
  return data.budget;
}

/**
 * Returns canonical ISO year-month string 'YYYY-MM' for the user's active calendar month.
 */
export function getCurrentCalendarMonth(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

export async function deleteMonthlyBudget(
  month: string
): Promise<{ success: boolean; message: string; month: string }> {
  const response = await fetch(
    `/api/expenses/budget?month=${encodeURIComponent(month)}`,
    {
      method: "DELETE",
      credentials: "include",
      headers: {
        Accept: "application/json",
      },
    }
  );

  if (!response.ok) {
    let errorData: any = {};
    try {
      errorData = await response.json();
    } catch {
      // ignore
    }
    throw new ExpenseApiError(
      response.status,
      errorData.code || "DELETE_BUDGET_FAILED",
      errorData.error || "Failed to delete monthly budget"
    );
  }

  return response.json();
}
