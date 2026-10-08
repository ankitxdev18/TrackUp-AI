import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { and, asc, eq, gt, gte, lt, lte, or, sql } from "drizzle-orm";
import { requireAuth } from "../auth/authenticate.js";
import { IdentityError, resolveUserIdentity } from "../auth/dev-user.js";
import { db } from "../db/index.js";
import { calendarEvents } from "../db/schema.js";
import {
  calendarEventIdParamSchema,
  calendarRangeQuerySchema,
  createCalendarEventSchema,
  deriveAllDayBoundsFromTemporalRange,
  isValidIanaTimeZone,
  updateCalendarEventSchema,
  validateFinalEventState,
} from "../calendar/calendar.schema.js";

export const calendarRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  // Enforce session authentication across all calendar endpoints
  server.addHook("preHandler", requireAuth);

  // GET /api/calendar/events?start=...&end=... — Query events within an ISO temporal range
  server.get("/", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const queryResult = calendarRangeQuerySchema.safeParse(request.query);
      if (!queryResult.success) {
        const details = queryResult.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        }));

        return reply.status(400).send({
          error: "Invalid calendar range query parameters",
          code: "VALIDATION_ERROR",
          details,
        });
      }

      const { start, end, timeZone } = queryResult.data;
      const queryStart = new Date(start);
      const queryEnd = new Date(end);

      // Derive calendar date boundaries for inclusive all-day date queries
      // Respect explicit timeZone query parameter, or timezone offset from ISO timestamp if present, otherwise UTC.
      // Crucially, queryEnd is an exclusive temporal boundary [queryStart, queryEnd), so all-day inclusive bounds
      // are derived from the latest included instant (queryEnd - 1ms) in the user's timezone.
      let effectiveTimeZone = timeZone;
      if (!effectiveTimeZone) {
        const offsetMatch = start.match(/([+-]\d{2}:?\d{2})$/);
        if (offsetMatch && isValidIanaTimeZone(offsetMatch[1])) {
          effectiveTimeZone = offsetMatch[1];
        } else {
          effectiveTimeZone = "UTC";
        }
      }

      const { queryStartDate, queryEndDate } = deriveAllDayBoundsFromTemporalRange(
        queryStart,
        queryEnd,
        effectiveTimeZone
      );

      // Query database scoped strictly by user_id and temporal intersection
      // Timed events: [startTime, endTime) overlaps [queryStart, queryEnd) iff startTime < queryEnd AND endTime > queryStart
      // All-day events: [startDate, endDate] inclusive overlaps [queryStartDate, queryEndDate] iff startDate <= queryEndDate AND endDate >= queryStartDate
      const userEvents = await db
        .select()
        .from(calendarEvents)
        .where(
          and(
            eq(calendarEvents.userId, user.id),
            or(
              and(
                eq(calendarEvents.isAllDay, false),
                lt(calendarEvents.startTime, queryEnd),
                gt(calendarEvents.endTime, queryStart)
              ),
              and(
                eq(calendarEvents.isAllDay, true),
                lte(calendarEvents.startDate, queryEndDate),
                gte(calendarEvents.endDate, queryStartDate)
              )
            )
          )
        )
        .orderBy(
          sql`COALESCE(${calendarEvents.startDate}, to_char(${calendarEvents.startTime} AT TIME ZONE 'UTC', 'YYYY-MM-DD')) ASC`,
          sql`CASE WHEN ${calendarEvents.isAllDay} = true THEN 0 ELSE 1 END ASC`,
          asc(calendarEvents.startTime),
          asc(calendarEvents.id)
        );

      return reply.status(200).send({
        events: userEvents,
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error(err, "Failed to query calendar events range");
      return reply.status(500).send({
        error: "An unexpected error occurred while retrieving calendar events",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // GET /api/calendar/events/:id — Retrieve single calendar event detail strictly scoped to user
  server.get("/:id", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const paramResult = calendarEventIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.status(400).send({
          error: "Invalid calendar event ID format",
          code: "INVALID_ID",
        });
      }

      const { id } = paramResult.data;

      const [event] = await db
        .select()
        .from(calendarEvents)
        .where(
          and(
            eq(calendarEvents.id, id),
            eq(calendarEvents.userId, user.id)
          )
        )
        .limit(1);

      if (!event) {
        return reply.status(404).send({
          error: "Calendar event not found",
          code: "NOT_FOUND",
        });
      }

      return reply.status(200).send({
        event,
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error(err, "Failed to get calendar event by id");
      return reply.status(500).send({
        error: "An unexpected error occurred while retrieving the calendar event",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // POST /api/calendar/events — Create a new calendar event
  server.post("/", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const parseResult = createCalendarEventSchema.safeParse(request.body);
      if (!parseResult.success) {
        const details = parseResult.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        }));

        return reply.status(400).send({
          error: "Validation failed",
          code: "VALIDATION_ERROR",
          details,
        });
      }

      const data = parseResult.data;

      const [newEvent] = await db
        .insert(calendarEvents)
        .values({
          userId: user.id, // Strictly server-assigned ownership
          title: data.title,
          description: data.description ?? null,
          location: data.location ?? null,
          color: data.color,
          isAllDay: data.isAllDay,
          startTime: data.startTime ? new Date(data.startTime) : null,
          endTime: data.endTime ? new Date(data.endTime) : null,
          timeZone: data.timeZone ?? null,
          startDate: data.startDate ?? null,
          endDate: data.endDate ?? null,
        })
        .returning();

      return reply.status(201).send({
        event: newEvent,
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error(err, "Failed to create calendar event");
      return reply.status(500).send({
        error: "An unexpected error occurred while creating the calendar event",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // PATCH /api/calendar/events/:id — Update existing calendar event with composite final-state validation
  server.patch("/:id", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const paramResult = calendarEventIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.status(400).send({
          error: "Invalid calendar event ID format",
          code: "INVALID_ID",
        });
      }

      const { id } = paramResult.data;

      const parseResult = updateCalendarEventSchema.safeParse(request.body);
      if (!parseResult.success) {
        const details = parseResult.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        }));

        return reply.status(400).send({
          error: "Validation failed",
          code: "VALIDATION_ERROR",
          details,
        });
      }

      const patchData = parseResult.data;

      // Ownership-scoped existence lookup
      const [existing] = await db
        .select()
        .from(calendarEvents)
        .where(
          and(
            eq(calendarEvents.id, id),
            eq(calendarEvents.userId, user.id)
          )
        )
        .limit(1);

      if (!existing) {
        return reply.status(404).send({
          error: "Calendar event not found",
          code: "NOT_FOUND",
        });
      }

      // Construct candidate final event state in memory
      const candidate = {
        title: patchData.title !== undefined ? patchData.title : existing.title,
        description:
          patchData.description !== undefined ? patchData.description : existing.description,
        location:
          patchData.location !== undefined ? patchData.location : existing.location,
        color: patchData.color !== undefined ? patchData.color : existing.color,
        isAllDay:
          patchData.isAllDay !== undefined ? patchData.isAllDay : existing.isAllDay,
        startTime:
          patchData.startTime !== undefined
            ? patchData.startTime
              ? new Date(patchData.startTime)
              : null
            : existing.startTime,
        endTime:
          patchData.endTime !== undefined
            ? patchData.endTime
              ? new Date(patchData.endTime)
              : null
            : existing.endTime,
        timeZone:
          patchData.timeZone !== undefined ? patchData.timeZone : existing.timeZone,
        startDate:
          patchData.startDate !== undefined ? patchData.startDate : existing.startDate,
        endDate:
          patchData.endDate !== undefined ? patchData.endDate : existing.endDate,
      };

      // Validate the composite final state before database update
      const validationResult = validateFinalEventState(candidate);
      if (!validationResult.valid) {
        return reply.status(400).send({
          error: validationResult.message,
          code: "VALIDATION_ERROR",
          details: [
            {
              field: validationResult.field ?? "event",
              message: validationResult.message,
            },
          ],
        });
      }

      const [updatedEvent] = await db
        .update(calendarEvents)
        .set({
          title: candidate.title,
          description: candidate.description,
          location: candidate.location,
          color: candidate.color,
          isAllDay: candidate.isAllDay,
          startTime: candidate.startTime,
          endTime: candidate.endTime,
          timeZone: candidate.timeZone,
          startDate: candidate.startDate,
          endDate: candidate.endDate,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(calendarEvents.id, id),
            eq(calendarEvents.userId, user.id)
          )
        )
        .returning();

      return reply.status(200).send({
        event: updatedEvent,
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error(err, "Failed to update calendar event");
      return reply.status(500).send({
        error: "An unexpected error occurred while updating the calendar event",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // DELETE /api/calendar/events/:id — Delete calendar event permanently
  server.delete("/:id", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const paramResult = calendarEventIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.status(400).send({
          error: "Invalid calendar event ID format",
          code: "INVALID_ID",
        });
      }

      const { id } = paramResult.data;

      const deleted = await db
        .delete(calendarEvents)
        .where(
          and(
            eq(calendarEvents.id, id),
            eq(calendarEvents.userId, user.id)
          )
        )
        .returning({ id: calendarEvents.id });

      if (deleted.length === 0) {
        return reply.status(404).send({
          error: "Calendar event not found",
          code: "NOT_FOUND",
        });
      }

      return reply.status(200).send({
        success: true,
        message: "Calendar event deleted successfully",
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error(err, "Failed to delete calendar event");
      return reply.status(500).send({
        error: "An unexpected error occurred while deleting the calendar event",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });
};
