/**
 * TrackUp Savings API Client (Milestone 5.4C)
 *
 * Implements typed frontend communication with the Savings backend endpoints:
 * - GET  /api/savings/active
 * - POST /api/savings
 * - POST /api/savings/:id/contributions
 * - GET  /api/savings/:id/contributions
 * - PATCH /api/savings/:id/status
 */

export type SavingsGoalStatus = "ACTIVE" | "COMPLETED" | "ARCHIVED";

/**
 * Monetary integer amount represented in minor units (paise).
 * The backend serializes values <= Number.MAX_SAFE_INTEGER as `number`
 * and falls back to exact decimal `string` if values exceed safe JS integer precision.
 */
export type MonetaryPaise = number | string;

export interface ActiveSavingsGoal {
  id: string;
  name: string;
  targetAmountCents: number;
  status: SavingsGoalStatus;
  savedAmountCents: MonetaryPaise;
  remainingAmountCents: MonetaryPaise;
  progressPercent: number;
  contributionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SavingsContribution {
  id: string;
  savingsGoalId: string;
  userId: string;
  amountCents: number;
  note: string | null;
  createdAt: string;
}

export interface CreateSavingsGoalInput {
  name: string;
  targetAmountCents: number;
}

export interface AddContributionInput {
  amountCents: number;
  note?: string | null;
}

export interface ListContributionsParams {
  limit?: number;
  offset?: number;
}

export interface ListContributionsResponse {
  contributions: SavingsContribution[];
  total: number;
}

export interface AddContributionResponse {
  contribution: SavingsContribution;
  goal: {
    id: string;
    name: string;
    targetAmountCents: number;
    status: SavingsGoalStatus;
    savedAmountCents: MonetaryPaise;
    remainingAmountCents: MonetaryPaise;
    progressPercent: number;
    contributionCount: number;
    updatedAt: string;
  };
}

export interface UpdateGoalStatusResponse {
  goal: {
    id: string;
    userId: string;
    name: string;
    targetAmountCents: number;
    status: SavingsGoalStatus;
    createdAt: string;
    updatedAt: string;
  };
}

export class SavingsApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: Array<{ field: string; message: string }>;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: Array<{ field: string; message: string }>
  ) {
    super(message);
    this.name = "SavingsApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

/**
 * Converts a MonetaryPaise value (number or string) to BigInt without floating-point drift.
 */
export function toSafePaise(val: MonetaryPaise): bigint {
  if (typeof val === "bigint") return val;
  if (typeof val === "number") {
    if (!Number.isSafeInteger(val)) {
      throw new RangeError(
        `Monetary value ${val} is not a safe integer in JavaScript.`
      );
    }
    return BigInt(val);
  }
  const trimmed = String(val).trim();
  if (!/^-?\d+$/.test(trimmed)) {
    throw new TypeError(`Invalid decimal integer string: "${val}"`);
  }
  return BigInt(trimmed);
}

/**
 * Checks whether a MonetaryPaise value is safely representable as a standard JavaScript number.
 */
export function isPaiseSafeInteger(val: MonetaryPaise): boolean {
  try {
    const bi = toSafePaise(val);
    return (
      bi >= BigInt(Number.MIN_SAFE_INTEGER) &&
      bi <= BigInt(Number.MAX_SAFE_INTEGER)
    );
  } catch {
    return false;
  }
}

/**
 * Formats a MonetaryPaise value into standard Indian Rupee format (₹) with Indian digit grouping
 * and exactly two decimal places, preserving exact integer precision.
 */
export function formatSavingsPaise(cents: MonetaryPaise, _currency = "INR"): string {
  const bi = toSafePaise(cents);
  const isNegative = bi < 0n;
  const absBi = isNegative ? -bi : bi;

  const wholeRupees = absBi / 100n;
  const remainderPaise = absBi % 100n;

  // Format whole rupees using en-IN grouping
  const wholeFormatted = new Intl.NumberFormat("en-IN", {
    useGrouping: true,
  }).format(wholeRupees);

  const paiseStr = remainderPaise.toString().padStart(2, "0");
  const prefix = isNegative ? "-₹" : "₹";
  return `${prefix}${wholeFormatted}.${paiseStr}`;
}

async function handleApiResponse<T>(response: Response, defaultMessage: string): Promise<T> {
  if (!response.ok) {
    let errorData: any = {};
    try {
      errorData = await response.json();
    } catch {
      // Non-JSON server error response
    }

    const message =
      (errorData.details && Array.isArray(errorData.details) && errorData.details.length > 0
        ? errorData.details.map((d: any) => d.message).join(", ")
        : errorData.error) || defaultMessage;

    throw new SavingsApiError(
      response.status,
      errorData.code || "SAVINGS_API_ERROR",
      message,
      errorData.details
    );
  }

  return response.json();
}

/**
 * Fetch the authenticated user's current active savings goal with derived metrics.
 * Returns null if the user currently has no active savings goal.
 */
export async function fetchActiveSavingsGoal(): Promise<ActiveSavingsGoal | null> {
  const response = await fetch("/api/savings/active", {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });

  const data = await handleApiResponse<{ goal: ActiveSavingsGoal | null }>(
    response,
    "Failed to retrieve active savings goal"
  );

  return data.goal;
}

/**
 * Create a new active savings goal for the current user.
 * Rejects with 409 ACTIVE_GOAL_EXISTS if an active goal already exists.
 */
export async function createSavingsGoal(
  input: CreateSavingsGoalInput
): Promise<ActiveSavingsGoal> {
  const response = await fetch("/api/savings", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(input),
  });

  const data = await handleApiResponse<{ goal: ActiveSavingsGoal }>(
    response,
    "Failed to create savings goal"
  );

  return data.goal;
}

/**
 * Record an immutable monetary deposit towards a savings goal.
 */
export async function addSavingsContribution(
  goalId: string,
  input: AddContributionInput
): Promise<AddContributionResponse> {
  const response = await fetch(
    `/api/savings/${encodeURIComponent(goalId)}/contributions`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(input),
    }
  );

  return handleApiResponse<AddContributionResponse>(
    response,
    "Failed to record savings contribution"
  );
}

/**
 * Retrieve chronological contribution history for an owned savings goal.
 */
export async function fetchSavingsContributions(
  goalId: string,
  params: ListContributionsParams = {}
): Promise<ListContributionsResponse> {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));

  const qs = query.toString();
  const url = qs
    ? `/api/savings/${encodeURIComponent(goalId)}/contributions?${qs}`
    : `/api/savings/${encodeURIComponent(goalId)}/contributions`;

  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });

  return handleApiResponse<ListContributionsResponse>(
    response,
    "Failed to retrieve savings contributions"
  );
}

/**
 * Complete or archive an existing savings goal.
 */
export async function updateSavingsGoalStatus(
  goalId: string,
  status: "COMPLETED" | "ARCHIVED"
): Promise<UpdateGoalStatusResponse> {
  const response = await fetch(
    `/api/savings/${encodeURIComponent(goalId)}/status`,
    {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ status }),
    }
  );

  return handleApiResponse<UpdateGoalStatusResponse>(
    response,
    "Failed to update savings goal status"
  );
}
