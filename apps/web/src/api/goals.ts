export interface Goal {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  status: "ACTIVE" | "COMPLETED" | "ARCHIVED";
  progress: number;
  targetDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGoalInput {
  title: string;
  description?: string | null;
  status?: "ACTIVE" | "COMPLETED" | "ARCHIVED";
  progress?: number;
  targetDate?: string | null;
}

export interface UpdateGoalInput {
  title?: string;
  description?: string | null;
  status?: "ACTIVE" | "COMPLETED" | "ARCHIVED";
  progress?: number;
  targetDate?: string | null;
}

/**
 * Formats a target date (YYYY-MM-DD) into a clean editorial label like "Dec 1, 2026"
 */
export function formatTargetDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  try {
    const [year, month, day] = dateStr.split("-").map(Number);
    if (!year || !month || !day) return dateStr;
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return dateStr;
  }
}

/**
 * Fetch all goals for current user with optional status filter
 */
export async function fetchGoals(status?: string): Promise<Goal[]> {
  const url = status ? `/api/goals?status=${encodeURIComponent(status)}` : "/api/goals";
  const response = await fetch(url, {
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    let errorMsg = "Failed to load goals";
    try {
      const errData = await response.json();
      errorMsg = errData.error || errorMsg;
    } catch {
      // Fallback
    }
    throw new Error(errorMsg);
  }

  const data = await response.json();
  return data.goals || [];
}

/**
 * Fetch a single goal by ID
 */
export async function fetchGoal(id: string): Promise<Goal> {
  const response = await fetch(`/api/goals/${id}`, {
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    let errorMsg = "Failed to load goal";
    try {
      const errData = await response.json();
      errorMsg = errData.error || errorMsg;
    } catch {
      // Fallback
    }
    throw new Error(errorMsg);
  }

  const data = await response.json();
  return data.goal;
}

/**
 * Create a new goal
 */
export async function createGoal(payload: CreateGoalInput): Promise<Goal> {
  const response = await fetch("/api/goals", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errorMsg = "Failed to create goal";
    try {
      const errData = await response.json();
      if (errData.details && Array.isArray(errData.details)) {
        errorMsg = errData.details.map((d: any) => d.message).join(", ");
      } else {
        errorMsg = errData.error || errorMsg;
      }
    } catch {
      // Fallback
    }
    throw new Error(errorMsg);
  }

  const data = await response.json();
  return data.goal;
}

/**
 * Update an existing goal
 */
export async function updateGoal(id: string, payload: UpdateGoalInput): Promise<Goal> {
  const response = await fetch(`/api/goals/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errorMsg = "Failed to update goal";
    try {
      const errData = await response.json();
      if (errData.details && Array.isArray(errData.details)) {
        errorMsg = errData.details.map((d: any) => d.message).join(", ");
      } else {
        errorMsg = errData.error || errorMsg;
      }
    } catch {
      // Fallback
    }
    throw new Error(errorMsg);
  }

  const data = await response.json();
  return data.goal;
}

/**
 * Delete a goal
 */
export async function deleteGoal(id: string): Promise<void> {
  const response = await fetch(`/api/goals/${id}`, {
    method: "DELETE",
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    let errorMsg = "Failed to delete goal";
    try {
      const errData = await response.json();
      errorMsg = errData.error || errorMsg;
    } catch {
      // Fallback
    }
    throw new Error(errorMsg);
  }
}
