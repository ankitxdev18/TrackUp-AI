/**
 * Calendar API Client (Milestone C04)
 *
 * Interacts with TrackUp Calendar backend endpoints:
 * - GET    /api/calendar/events?start=...&end=...&timeZone=...
 * - GET    /api/calendar/events/:id
 * - POST   /api/calendar/events
 * - PATCH  /api/calendar/events/:id
 * - DELETE /api/calendar/events/:id
 */

export type CalendarColor =
  | "indigo"
  | "emerald"
  | "amber"
  | "rose"
  | "cyan"
  | "slate";

export interface BaseCalendarEvent {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  location: string | null;
  color: CalendarColor;
  isAllDay: boolean;
  startTime: string | null;
  endTime: string | null;
  timeZone: string | null;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TimedCalendarEvent extends BaseCalendarEvent {
  isAllDay: false;
  startTime: string; // ISO 8601 instant
  endTime: string;   // ISO 8601 instant
  startDate: null;
  endDate: null;
}

export interface AllDayCalendarEvent extends BaseCalendarEvent {
  isAllDay: true;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  startTime: null;
  endTime: null;
}

export type CalendarEvent = TimedCalendarEvent | AllDayCalendarEvent;

export interface CreateTimedCalendarEventInput {
  title: string;
  description?: string | null;
  location?: string | null;
  color?: CalendarColor;
  isAllDay?: false;
  startTime: string; // ISO 8601
  endTime: string;   // ISO 8601
  timeZone?: string | null;
}

export interface CreateAllDayCalendarEventInput {
  title: string;
  description?: string | null;
  location?: string | null;
  color?: CalendarColor;
  isAllDay: true;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

export type CreateCalendarEventInput =
  | CreateTimedCalendarEventInput
  | CreateAllDayCalendarEventInput;

export interface UpdateCalendarEventInput {
  title?: string;
  description?: string | null;
  location?: string | null;
  color?: CalendarColor;
  isAllDay?: boolean;
  startTime?: string | null;
  endTime?: string | null;
  timeZone?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

export interface CalendarEventsListApiResponse {
  events: CalendarEvent[];
}

export interface CalendarEventApiResponse {
  event: CalendarEvent;
}

export interface DeleteCalendarEventApiResponse {
  success: boolean;
  message?: string;
}

export class CalendarApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "CalendarApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

/**
 * GET /api/calendar/events?start=...&end=...&timeZone=...
 * Retrieves calendar events intersecting the given half-open temporal range [start, end).
 */
export async function listCalendarEvents(
  start: string,
  end: string,
  timeZone?: string
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({ start, end });
  if (timeZone) {
    params.set("timeZone", timeZone);
  }

  const response = await fetch(`/api/calendar/events?${params.toString()}`, {
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    let errorData: { error?: string; code?: string; details?: unknown } = {};
    try {
      errorData = await response.json();
    } catch {
      // ignore parse failure
    }
    throw new CalendarApiError(
      response.status,
      errorData.code || "FETCH_EVENTS_FAILED",
      errorData.error || "Unable to load calendar events.",
      errorData.details
    );
  }

  const data: CalendarEventsListApiResponse = await response.json();
  return data.events || [];
}

/**
 * GET /api/calendar/events/:id
 * Retrieves single event detail strictly scoped to authenticated user.
 */
export async function getCalendarEvent(id: string): Promise<CalendarEvent> {
  const response = await fetch(`/api/calendar/events/${encodeURIComponent(id)}`, {
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    let errorData: { error?: string; code?: string; details?: unknown } = {};
    try {
      errorData = await response.json();
    } catch {
      // ignore parse failure
    }
    throw new CalendarApiError(
      response.status,
      errorData.code || "GET_EVENT_FAILED",
      errorData.error || "Calendar event not found.",
      errorData.details
    );
  }

  const data: CalendarEventApiResponse = await response.json();
  return data.event;
}

/**
 * POST /api/calendar/events
 * Creates a new timed or all-day calendar event.
 */
export async function createCalendarEvent(
  input: CreateCalendarEventInput
): Promise<CalendarEvent> {
  const response = await fetch("/api/calendar/events", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    let errorData: { error?: string; code?: string; details?: unknown } = {};
    try {
      errorData = await response.json();
    } catch {
      // ignore parse failure
    }
    throw new CalendarApiError(
      response.status,
      errorData.code || "CREATE_EVENT_FAILED",
      errorData.error || "Unable to create calendar event.",
      errorData.details
    );
  }

  const data: CalendarEventApiResponse = await response.json();
  return data.event;
}

/**
 * PATCH /api/calendar/events/:id
 * Updates an existing calendar event with composite validation.
 */
export async function updateCalendarEvent(
  id: string,
  input: UpdateCalendarEventInput
): Promise<CalendarEvent> {
  const response = await fetch(`/api/calendar/events/${encodeURIComponent(id)}`, {
    method: "PATCH",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    let errorData: { error?: string; code?: string; details?: unknown } = {};
    try {
      errorData = await response.json();
    } catch {
      // ignore parse failure
    }
    throw new CalendarApiError(
      response.status,
      errorData.code || "UPDATE_EVENT_FAILED",
      errorData.error || "Unable to update calendar event.",
      errorData.details
    );
  }

  const data: CalendarEventApiResponse = await response.json();
  return data.event;
}

/**
 * DELETE /api/calendar/events/:id
 * Permanently deletes a calendar event.
 */
export async function deleteCalendarEvent(
  id: string
): Promise<DeleteCalendarEventApiResponse> {
  const response = await fetch(`/api/calendar/events/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    let errorData: { error?: string; code?: string; details?: unknown } = {};
    try {
      errorData = await response.json();
    } catch {
      // ignore parse failure
    }
    throw new CalendarApiError(
      response.status,
      errorData.code || "DELETE_EVENT_FAILED",
      errorData.error || "Unable to delete calendar event.",
      errorData.details
    );
  }

  const data: DeleteCalendarEventApiResponse = await response.json();
  return data;
}
