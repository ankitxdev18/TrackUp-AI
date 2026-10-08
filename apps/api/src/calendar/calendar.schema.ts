import { z } from "zod";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const ISO_TIMESTAMP_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:?\d{2})$/i;

export const CALENDAR_COLOR_VALUES = [
  "indigo",
  "emerald",
  "amber",
  "rose",
  "cyan",
  "slate",
] as const;

export type CalendarColor = (typeof CALENDAR_COLOR_VALUES)[number];

export const calendarColorEnum = z.enum(CALENDAR_COLOR_VALUES, {
  message: `Color must be one of: ${CALENDAR_COLOR_VALUES.join(", ")}`,
});

/**
 * Validates that an ISO date string 'YYYY-MM-DD' corresponds to a valid calendar date
 * Accounts for leap years and exact calendar day counts.
 */
export function isValidCalendarDate(dateStr: string): boolean {
  if (!DATE_REGEX.test(dateStr)) return false;
  const [yearStr, monthStr, dayStr] = dateStr.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * Validates that a string is a valid ISO 8601 timestamp representing an instant
 */
export function isValidIsoTimestamp(val: string): boolean {
  if (typeof val !== "string") return false;
  if (!ISO_TIMESTAMP_REGEX.test(val)) return false;
  const d = new Date(val);
  return !isNaN(d.getTime());
}

/**
 * Validates that a string is a valid IANA timezone identifier supported by runtime
 */
export function isValidIanaTimeZone(tz: string): boolean {
  if (!tz || typeof tz !== "string") return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Parameter validation schema for /api/calendar/events/:id
 */
export const calendarEventIdParamSchema = z.object({
  id: z
    .string({ message: "Calendar event ID is required and must be a string" })
    .trim()
    .refine((val) => UUID_REGEX.test(val), {
      message: "Calendar event ID must be a valid UUIDv4 string",
    }),
});

export type CalendarEventIdParam = z.infer<typeof calendarEventIdParamSchema>;

/**
 * Query parameter validation schema for GET /api/calendar/events?start=...&end=...
 */
export const calendarRangeQuerySchema = z
  .object({
    start: z
      .string({ message: "Start query parameter is required" })
      .trim()
      .refine(isValidIsoTimestamp, {
        message: "Start parameter must be a valid ISO 8601 timestamp",
      }),
    end: z
      .string({ message: "End query parameter is required" })
      .trim()
      .refine(isValidIsoTimestamp, {
        message: "End parameter must be a valid ISO 8601 timestamp",
      }),
    timeZone: z
      .string({ message: "timeZone must be a string" })
      .trim()
      .refine(isValidIanaTimeZone, {
        message: "timeZone must be a valid IANA timezone identifier",
      })
      .optional(),
  })
  .strict()
  .refine(
    (data) => {
      const startTime = new Date(data.start).getTime();
      const endTime = new Date(data.end).getTime();
      return endTime > startTime;
    },
    {
      message: "End timestamp must be strictly greater than start timestamp",
      path: ["end"],
    }
  );

export type CalendarRangeQuery = z.infer<typeof calendarRangeQuerySchema>;

/**
 * Formats a Date instant into a YYYY-MM-DD calendar date in a specified IANA timezone.
 */
export function formatCalendarDateInTimeZone(date: Date, timeZone: string = "UTC"): string {
  const tz = isValidIanaTimeZone(timeZone) ? timeZone : "UTC";
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

/**
 * Derives the inclusive [queryStartDate, queryEndDate] calendar date range
 * from a half-open temporal range [start, end) respecting the given timezone.
 *
 * Because `end` is strictly exclusive in [start, end), the latest instant inside the range
 * is `end - 1ms`. Evaluating that instant in the user's calendar timezone gives the correct
 * inclusive last calendar date without blindly subtracting 24 hours UTC (which would fail
 * across DST shifts and arbitrary timezone offsets).
 */
export function deriveAllDayBoundsFromTemporalRange(
  queryStart: Date,
  queryEnd: Date,
  timeZone: string = "UTC"
): { queryStartDate: string; queryEndDate: string } {
  const queryStartDate = formatCalendarDateInTimeZone(queryStart, timeZone);
  const lastIncludedInstant = new Date(queryEnd.getTime() - 1);
  const queryEndDate = formatCalendarDateInTimeZone(lastIncludedInstant, timeZone);
  return { queryStartDate, queryEndDate };
}

/**
 * Creation validation schema for POST /api/calendar/events
 */
export const createCalendarEventSchema = z
  .object({
    title: z
      .string({ message: "Title is required and must be a string" })
      .trim()
      .min(1, "Title cannot be empty")
      .max(255, "Title must not exceed 255 characters"),
    description: z
      .string({ message: "Description must be a string" })
      .max(5000, "Description must not exceed 5,000 characters")
      .transform((val) => (val.trim().length > 0 ? val : null))
      .nullable()
      .optional(),
    location: z
      .string({ message: "Location must be a string" })
      .max(500, "Location must not exceed 500 characters")
      .transform((val) => (val.trim().length > 0 ? val : null))
      .nullable()
      .optional(),
    color: calendarColorEnum.optional().default("indigo"),
    isAllDay: z.boolean().optional().default(false),
    startTime: z
      .string({ message: "startTime must be a string" })
      .trim()
      .refine(isValidIsoTimestamp, {
        message: "startTime must be a valid ISO 8601 timestamp",
      })
      .nullable()
      .optional(),
    endTime: z
      .string({ message: "endTime must be a string" })
      .trim()
      .refine(isValidIsoTimestamp, {
        message: "endTime must be a valid ISO 8601 timestamp",
      })
      .nullable()
      .optional(),
    timeZone: z
      .string({ message: "timeZone must be a string" })
      .trim()
      .max(100, "timeZone must not exceed 100 characters")
      .refine((val) => val === "" || isValidIanaTimeZone(val), {
        message: "timeZone must be a valid IANA timezone identifier",
      })
      .transform((val) => (val.trim().length > 0 ? val : null))
      .nullable()
      .optional(),
    startDate: z
      .string({ message: "startDate must be a string" })
      .trim()
      .refine(isValidCalendarDate, {
        message: "startDate must be a valid calendar date in YYYY-MM-DD format",
      })
      .nullable()
      .optional(),
    endDate: z
      .string({ message: "endDate must be a string" })
      .trim()
      .refine(isValidCalendarDate, {
        message: "endDate must be a valid calendar date in YYYY-MM-DD format",
      })
      .nullable()
      .optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.isAllDay) {
      if (!data.startDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "All-day event requires startDate",
          path: ["startDate"],
        });
      }
      if (!data.endDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "All-day event requires endDate",
          path: ["endDate"],
        });
      }
      if (data.startDate && data.endDate && data.endDate < data.startDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "All-day event endDate cannot be before startDate",
          path: ["endDate"],
        });
      }
      if (data.startTime !== undefined && data.startTime !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "All-day event cannot contain startTime",
          path: ["startTime"],
        });
      }
      if (data.endTime !== undefined && data.endTime !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "All-day event cannot contain endTime",
          path: ["endTime"],
        });
      }
    } else {
      if (!data.startTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Timed event requires startTime",
          path: ["startTime"],
        });
      }
      if (!data.endTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Timed event requires endTime",
          path: ["endTime"],
        });
      }
      if (data.startTime && data.endTime) {
        const startMs = new Date(data.startTime).getTime();
        const endMs = new Date(data.endTime).getTime();
        if (endMs <= startMs) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Timed event endTime must be strictly after startTime",
            path: ["endTime"],
          });
        }
      }
      if (data.startDate !== undefined && data.startDate !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Timed event cannot contain startDate",
          path: ["startDate"],
        });
      }
      if (data.endDate !== undefined && data.endDate !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Timed event cannot contain endDate",
          path: ["endDate"],
        });
      }
    }
  });

export type CreateCalendarEventInput = z.infer<typeof createCalendarEventSchema>;

/**
 * Update request body validation schema for PATCH /api/calendar/events/:id
 */
export const updateCalendarEventSchema = z
  .object({
    title: z
      .string({ message: "Title must be a string" })
      .trim()
      .min(1, "Title cannot be empty")
      .max(255, "Title must not exceed 255 characters")
      .optional(),
    description: z
      .string({ message: "Description must be a string" })
      .max(5000, "Description must not exceed 5,000 characters")
      .transform((val) => (val.trim().length > 0 ? val : null))
      .nullable()
      .optional(),
    location: z
      .string({ message: "Location must be a string" })
      .max(500, "Location must not exceed 500 characters")
      .transform((val) => (val.trim().length > 0 ? val : null))
      .nullable()
      .optional(),
    color: calendarColorEnum.optional(),
    isAllDay: z.boolean().optional(),
    startTime: z
      .string({ message: "startTime must be a string" })
      .trim()
      .refine(isValidIsoTimestamp, {
        message: "startTime must be a valid ISO 8601 timestamp",
      })
      .nullable()
      .optional(),
    endTime: z
      .string({ message: "endTime must be a string" })
      .trim()
      .refine(isValidIsoTimestamp, {
        message: "endTime must be a valid ISO 8601 timestamp",
      })
      .nullable()
      .optional(),
    timeZone: z
      .string({ message: "timeZone must be a string" })
      .trim()
      .max(100, "timeZone must not exceed 100 characters")
      .refine((val) => val === "" || isValidIanaTimeZone(val), {
        message: "timeZone must be a valid IANA timezone identifier",
      })
      .transform((val) => (val.trim().length > 0 ? val : null))
      .nullable()
      .optional(),
    startDate: z
      .string({ message: "startDate must be a string" })
      .trim()
      .refine(isValidCalendarDate, {
        message: "startDate must be a valid calendar date in YYYY-MM-DD format",
      })
      .nullable()
      .optional(),
    endDate: z
      .string({ message: "endDate must be a string" })
      .trim()
      .refine(isValidCalendarDate, {
        message: "endDate must be a valid calendar date in YYYY-MM-DD format",
      })
      .nullable()
      .optional(),
  })
  .strict()
  .refine(
    (data) => Object.keys(data).length > 0,
    {
      message: "At least one field must be provided for update",
    }
  );

export type UpdateCalendarEventInput = z.infer<typeof updateCalendarEventSchema>;

export interface CandidateEventState {
  title: string;
  description: string | null;
  location: string | null;
  color: string;
  isAllDay: boolean;
  startTime: Date | null;
  endTime: Date | null;
  timeZone: string | null;
  startDate: string | null;
  endDate: string | null;
}

/**
 * Validates the full composite event state after applying PATCH modifications in memory
 */
export function validateFinalEventState(candidate: CandidateEventState):
  | { valid: true }
  | { valid: false; message: string; field?: string } {
  if (!candidate.title || candidate.title.trim().length === 0) {
    return { valid: false, message: "Title cannot be empty", field: "title" };
  }
  if (candidate.title.length > 255) {
    return { valid: false, message: "Title must not exceed 255 characters", field: "title" };
  }

  if (!CALENDAR_COLOR_VALUES.includes(candidate.color as any)) {
    return {
      valid: false,
      message: `Color must be one of: ${CALENDAR_COLOR_VALUES.join(", ")}`,
      field: "color",
    };
  }

  if (candidate.timeZone && !isValidIanaTimeZone(candidate.timeZone)) {
    return { valid: false, message: "timeZone must be a valid IANA timezone identifier", field: "timeZone" };
  }

  if (candidate.isAllDay) {
    if (!candidate.startDate) {
      return { valid: false, message: "All-day event requires startDate", field: "startDate" };
    }
    if (!isValidCalendarDate(candidate.startDate)) {
      return { valid: false, message: "startDate must be a valid calendar date in YYYY-MM-DD format", field: "startDate" };
    }
    if (!candidate.endDate) {
      return { valid: false, message: "All-day event requires endDate", field: "endDate" };
    }
    if (!isValidCalendarDate(candidate.endDate)) {
      return { valid: false, message: "endDate must be a valid calendar date in YYYY-MM-DD format", field: "endDate" };
    }
    if (candidate.endDate < candidate.startDate) {
      return { valid: false, message: "All-day event endDate cannot be before startDate", field: "endDate" };
    }
    if (candidate.startTime !== null && candidate.startTime !== undefined) {
      return { valid: false, message: "All-day event cannot contain startTime", field: "startTime" };
    }
    if (candidate.endTime !== null && candidate.endTime !== undefined) {
      return { valid: false, message: "All-day event cannot contain endTime", field: "endTime" };
    }
  } else {
    if (!candidate.startTime) {
      return { valid: false, message: "Timed event requires startTime", field: "startTime" };
    }
    if (!candidate.endTime) {
      return { valid: false, message: "Timed event requires endTime", field: "endTime" };
    }
    if (candidate.endTime.getTime() <= candidate.startTime.getTime()) {
      return { valid: false, message: "Timed event endTime must be strictly after startTime", field: "endTime" };
    }
    if (candidate.startDate !== null && candidate.startDate !== undefined) {
      return { valid: false, message: "Timed event cannot contain startDate", field: "startDate" };
    }
    if (candidate.endDate !== null && candidate.endDate !== undefined) {
      return { valid: false, message: "Timed event cannot contain endDate", field: "endDate" };
    }
  }

  return { valid: true };
}
