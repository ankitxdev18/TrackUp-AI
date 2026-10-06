/**
 * Habits API Client Module (Milestone H01-D)
 *
 * Provides typed functions for:
 * - GET /api/habits
 * - POST /api/habits
 * - GET /api/habits/:id
 * - PATCH /api/habits/:id
 * - DELETE /api/habits/:id
 * - POST /api/habits/:id/completions
 * - DELETE /api/habits/:id/completions/:date
 * - GET /api/habits/:id/history
 */

export interface Habit {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  frequency: "DAILY";
  status: "ACTIVE" | "ARCHIVED";
  createdAt: string;
  updatedAt: string;
}

export interface HabitCompletion {
  id: string;
  habitId: string;
  userId: string;
  completedDate: string;
  completedAt: string;
  createdAt: string;
}

export interface HabitHistoryItem {
  date: string;
  completed: boolean;
  completedAt: string | null;
}

export interface HabitHistoryResponse {
  habitId: string;
  days: number;
  startDate: string;
  endDate: string;
  history: HabitHistoryItem[];
}

export interface CreateHabitInput {
  title: string;
  description?: string | null;
  frequency?: "DAILY";
}

export interface UpdateHabitInput {
  title?: string;
  description?: string | null;
  status?: "ACTIVE" | "ARCHIVED";
}

export class HabitApiError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = "HabitApiError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Returns today's ISO date string 'YYYY-MM-DD' strictly using the user's local calendar
 * (never converts through UTC to prevent day shift near midnight).
 */
export function getLocalTodayDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Fetch all habits with optional status filter
 */
export async function fetchHabits(status?: "ACTIVE" | "ARCHIVED"): Promise<Habit[]> {
  const url = status
    ? `/api/habits?status=${encodeURIComponent(status)}`
    : "/api/habits";

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
      // ignore JSON parse error
    }
    throw new HabitApiError(
      response.status,
      errorData.code || "FETCH_FAILED",
      errorData.error || "Failed to load habits from server"
    );
  }

  const data = await response.json();
  return data.habits || [];
}

/**
 * Fetch a single habit by ID
 */
export async function fetchHabit(id: string): Promise<Habit> {
  const response = await fetch(`/api/habits/${encodeURIComponent(id)}`, {
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
    throw new HabitApiError(
      response.status,
      errorData.code || "FETCH_FAILED",
      errorData.error || "Failed to load habit"
    );
  }

  const data = await response.json();
  return data.habit;
}

/**
 * Create a new habit
 */
export async function createHabit(input: CreateHabitInput): Promise<Habit> {
  const response = await fetch("/api/habits", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      title: input.title,
      description: input.description ?? null,
      frequency: input.frequency ?? "DAILY",
    }),
  });

  if (!response.ok) {
    let errorData: any = {};
    try {
      errorData = await response.json();
    } catch {
      // ignore
    }
    throw new HabitApiError(
      response.status,
      errorData.code || "CREATE_FAILED",
      errorData.error || "Failed to create habit"
    );
  }

  const data = await response.json();
  return data.habit;
}

/**
 * Update an existing habit
 */
export async function updateHabit(id: string, input: UpdateHabitInput): Promise<Habit> {
  const response = await fetch(`/api/habits/${encodeURIComponent(id)}`, {
    method: "PATCH",
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
    throw new HabitApiError(
      response.status,
      errorData.code || "UPDATE_FAILED",
      errorData.error || "Failed to update habit"
    );
  }

  const data = await response.json();
  return data.habit;
}

/**
 * Delete a habit (destroys habit and cascaded completions)
 */
export async function deleteHabit(id: string): Promise<{ success: boolean; id: string }> {
  const response = await fetch(`/api/habits/${encodeURIComponent(id)}`, {
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
      // ignore
    }
    throw new HabitApiError(
      response.status,
      errorData.code || "DELETE_FAILED",
      errorData.error || "Failed to delete habit"
    );
  }

  return response.json();
}

/**
 * Mark a habit complete for a calendar date (explicit user-local YYYY-MM-DD)
 */
export async function completeHabit(habitId: string, date: string): Promise<HabitCompletion> {
  const response = await fetch(`/api/habits/${encodeURIComponent(habitId)}/completions`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ date }),
  });

  if (!response.ok) {
    let errorData: any = {};
    try {
      errorData = await response.json();
    } catch {
      // ignore
    }
    throw new HabitApiError(
      response.status,
      errorData.code || "COMPLETE_FAILED",
      errorData.error || "Failed to complete habit"
    );
  }

  const data = await response.json();
  return data.completion;
}

/**
 * Undo completion for a calendar date (uncheck)
 */
export async function undoHabitCompletion(
  habitId: string,
  date: string
): Promise<{ success: boolean; habitId: string; completedDate: string }> {
  const response = await fetch(
    `/api/habits/${encodeURIComponent(habitId)}/completions/${encodeURIComponent(date)}`,
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
    throw new HabitApiError(
      response.status,
      errorData.code || "UNDO_FAILED",
      errorData.error || "Failed to undo habit completion"
    );
  }

  return response.json();
}

/**
 * Fetch bounded trailing history for a habit
 */
export async function fetchHabitHistory(
  habitId: string,
  days: number = 7
): Promise<HabitHistoryResponse> {
  const response = await fetch(
    `/api/habits/${encodeURIComponent(habitId)}/history?days=${days}`,
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
      // ignore
    }
    throw new HabitApiError(
      response.status,
      errorData.code || "HISTORY_FAILED",
      errorData.error || "Failed to load habit history"
    );
  }

  return response.json();
}
