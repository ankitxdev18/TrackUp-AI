/**
 * Journal API Client (H02-D)
 *
 * Provides typed functions to interact with TrackUp Journal backend endpoints:
 * - GET    /api/journal
 * - GET    /api/journal/by-date/:date
 * - GET    /api/journal/:id
 * - POST   /api/journal
 * - PATCH  /api/journal/:id
 * - DELETE /api/journal/:id
 */

export interface JournalEntry {
  id: string;
  userId: string;
  entryDate: string; // ISO calendar date string 'YYYY-MM-DD' in user's local timezone
  title: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateJournalEntryInput {
  entryDate: string;
  title?: string | null;
  content: string;
}

export interface UpdateJournalEntryInput {
  title?: string | null;
  content?: string;
}

export interface DeleteJournalResponse {
  success: boolean;
  message?: string;
}

export class JournalApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "JournalApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
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
 * Returns yesterday's ISO date string 'YYYY-MM-DD' in user's local calendar.
 */
export function getLocalYesterdayDateString(date: Date = new Date()): string {
  const yesterday = new Date(date);
  yesterday.setDate(yesterday.getDate() - 1);
  return getLocalTodayDateString(yesterday);
}

/**
 * Format entry date for compact timeline display.
 * Avoids UTC timezone shifts by extracting YYYY-MM-DD components directly.
 */
export function formatJournalDate(
  dateStr: string,
  todayStr: string = getLocalTodayDateString()
): string {
  if (!dateStr) return "";
  const yesterdayStr = getLocalYesterdayDateString();

  if (dateStr === todayStr) {
    return "Today";
  }
  if (dateStr === yesterdayStr) {
    return "Yesterday";
  }

  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

/**
 * Format entry date for full reader headline display.
 */
export function formatJournalFullDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

/**
 * Format timestamp (createdAt / updatedAt) for readable display.
 */
export function formatJournalTimestamp(isoString: string): string {
  if (!isoString) return "";
  try {
    const dt = new Date(isoString);
    return dt.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}

/**
 * GET /api/journal — List user's journal entries ordered by entryDate DESC
 */
export async function fetchJournalEntries(): Promise<JournalEntry[]> {
  const response = await fetch("/api/journal", {
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
    throw new JournalApiError(
      response.status,
      errorData.code || "FETCH_FAILED",
      errorData.error || "Failed to load journal entries from server",
      errorData.details
    );
  }

  const data = await response.json();
  return data.entries || [];
}

/**
 * GET /api/journal/by-date/:date — Retrieve journal entry for a specific calendar date
 */
export async function fetchJournalEntryByDate(date: string): Promise<JournalEntry | null> {
  const response = await fetch(`/api/journal/by-date/${encodeURIComponent(date)}`, {
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
    throw new JournalApiError(
      response.status,
      errorData.code || "FETCH_BY_DATE_FAILED",
      errorData.error || `Failed to load journal entry for date ${date}`,
      errorData.details
    );
  }

  const data = await response.json();
  return data.entry ?? null;
}

/**
 * GET /api/journal/:id — Retrieve single journal entry details by ID
 */
export async function fetchJournalEntryById(id: string): Promise<JournalEntry> {
  const response = await fetch(`/api/journal/${encodeURIComponent(id)}`, {
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
    throw new JournalApiError(
      response.status,
      errorData.code || "FETCH_BY_ID_FAILED",
      errorData.error || "Failed to load journal entry",
      errorData.details
    );
  }

  const data = await response.json();
  return data.entry;
}

/**
 * POST /api/journal — Create a new journal entry
 */
export async function createJournalEntry(input: CreateJournalEntryInput): Promise<JournalEntry> {
  const response = await fetch("/api/journal", {
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
    throw new JournalApiError(
      response.status,
      errorData.code || "CREATE_FAILED",
      errorData.error || "Failed to create journal entry",
      errorData.details
    );
  }

  const data = await response.json();
  return data.entry;
}

/**
 * PATCH /api/journal/:id — Update existing journal entry (title, content)
 */
export async function updateJournalEntry(
  id: string,
  updates: UpdateJournalEntryInput
): Promise<JournalEntry> {
  const response = await fetch(`/api/journal/${encodeURIComponent(id)}`, {
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
    throw new JournalApiError(
      response.status,
      errorData.code || "UPDATE_FAILED",
      errorData.error || "Failed to update journal entry",
      errorData.details
    );
  }

  const data = await response.json();
  return data.entry;
}

/**
 * DELETE /api/journal/:id — Delete existing journal entry
 */
export async function deleteJournalEntry(id: string): Promise<DeleteJournalResponse> {
  const response = await fetch(`/api/journal/${encodeURIComponent(id)}`, {
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
    throw new JournalApiError(
      response.status,
      errorData.code || "DELETE_FAILED",
      errorData.error || "Failed to delete journal entry",
      errorData.details
    );
  }

  const data = await response.json();
  return data;
}
