export interface Task {
  id: string;
  userId: string;
  projectId?: string | null;
  projectName?: string | null;
  title: string;
  status: "TODO" | "COMPLETED";
  priority: "LOW" | "MEDIUM" | "HIGH";
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskInput {
  title: string;
  priority?: "LOW" | "MEDIUM" | "HIGH";
  dueDate?: string | null;
  projectId?: string | null;
}

export interface UpdateTaskInput {
  title?: string;
  status?: "TODO" | "COMPLETED";
  priority?: "LOW" | "MEDIUM" | "HIGH";
  dueDate?: string | null;
  projectId?: string | null;
}

export class TaskApiError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = "TaskApiError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export async function fetchTasks(projectId?: string): Promise<Task[]> {
  const url = projectId
    ? `/api/tasks?projectId=${encodeURIComponent(projectId)}`
    : "/api/tasks";

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
      // ignore parse error
    }
    throw new TaskApiError(
      response.status,
      errorData.code || "FETCH_FAILED",
      errorData.error || "Failed to load tasks from server"
    );
  }

  const data = await response.json();
  return data.tasks || [];
}


export async function createTask(input: CreateTaskInput): Promise<Task> {
  const response = await fetch("/api/tasks", {
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
      // ignore parse error
    }
    throw new TaskApiError(
      response.status,
      errorData.code || "CREATE_FAILED",
      errorData.error || "Failed to create task"
    );
  }

  const data = await response.json();
  return data.task;
}

export async function updateTask(
  id: string,
  updates: UpdateTaskInput
): Promise<Task> {
  const response = await fetch(`/api/tasks/${id}`, {
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
      // ignore parse error
    }
    throw new TaskApiError(
      response.status,
      errorData.code || "UPDATE_FAILED",
      errorData.error || "Failed to update task"
    );
  }

  const data = await response.json();
  return data.task;
}

export async function deleteTask(
  id: string
): Promise<{ success: boolean; id: string }> {
  const response = await fetch(`/api/tasks/${id}`, {
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
      // ignore parse error
    }
    throw new TaskApiError(
      response.status,
      errorData.code || "DELETE_FAILED",
      errorData.error || "Failed to delete task"
    );
  }

  return response.json();
}

import {
  getTodayDateString as getTodayDateStringFromUtils,
  getUserTimeZone,
  utcIsoToLocalDate,
} from "../features/calendar/calendarDateUtils";

/**
 * Returns today's ISO date string 'YYYY-MM-DD' evaluated in the specified timezone
 * (defaults to authenticated user / browser timezone).
 */
export function getTodayDateString(timeZone: string = getUserTimeZone()): string {
  return getTodayDateStringFromUtils(timeZone);
}

/**
 * Evaluates whether a task is marked COMPLETED and has a valid completion timestamp
 * falling on the specified calendar date in the target timezone.
 */
export function isTaskCompletedToday(
  task: { status: string; completedAt: string | null },
  todayDateStr: string = getTodayDateString(),
  timeZone: string = getUserTimeZone()
): boolean {
  if (task.status !== "COMPLETED" || !task.completedAt) {
    return false;
  }
  const date = new Date(task.completedAt);
  if (isNaN(date.getTime())) {
    return false;
  }
  return utcIsoToLocalDate(task.completedAt, timeZone) === todayDateStr;
}

/**
 * Returns tomorrow's ISO date string 'YYYY-MM-DD' in local timezone
 */
export function getTomorrowDateString(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Calculates calendar day overdue count
 */
export function getDaysOverdue(dueDateStr: string, todayDateStr: string = getTodayDateString()): number {
  try {
    const due = new Date(dueDateStr + "T00:00:00");
    const today = new Date(todayDateStr + "T00:00:00");
    const diffMs = today.getTime() - due.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return Math.max(1, diffDays);
  } catch {
    return 1;
  }
}

/**
 * Dynamic time-of-day greeting (00:00–11:59 Good morning, 12:00–16:59 Good afternoon, 17:00–23:59 Good evening)
 */
export function getTimeAwareGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
