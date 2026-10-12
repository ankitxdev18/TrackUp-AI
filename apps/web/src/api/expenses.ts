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

export function formatCents(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

export function parseCurrencyInputToCents(val: string): number {
  const clean = val.replace(/[^0-9.]/g, "");
  const floatVal = parseFloat(clean);
  if (isNaN(floatVal) || floatVal <= 0) return 0;
  return Math.round(floatVal * 100);
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
