import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { requireAuth } from "../auth/authenticate.js";
import { IdentityError, resolveUserIdentity } from "../auth/dev-user.js";
import { db } from "../db/index.js";
import { habitCompletions, habits } from "../db/schema.js";
import {
  createCompletionSchema,
  createHabitSchema,
  habitCompletionDateParamSchema,
  habitHistoryQuerySchema,
  habitIdParamSchema,
  HABIT_STATUS_VALUES,
  updateHabitSchema,
} from "../habits/habit.schema.js";

export const habitRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  // Enforce authentication on all habit endpoints
  server.addHook("preHandler", requireAuth);

  // GET /api/habits — List current user's habits with optional status filter
  server.get("/", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);
      const query = request.query as { status?: string };

      let whereCondition = eq(habits.userId, user.id);

      if (query.status) {
        const upperStatus = query.status.toUpperCase();
        if (HABIT_STATUS_VALUES.includes(upperStatus as any)) {
          whereCondition = and(
            eq(habits.userId, user.id),
            eq(habits.status, upperStatus)
          )!;
        } else {
          return reply.status(400).send({
            error: `Invalid status filter. Must be one of: ${HABIT_STATUS_VALUES.join(", ")}`,
            code: "INVALID_STATUS",
          });
        }
      }

      const userHabits = await db
        .select()
        .from(habits)
        .where(whereCondition)
        .orderBy(
          sql`case when ${habits.status} = 'ACTIVE' then 0 else 1 end`,
          desc(habits.createdAt)
        );

      return reply.status(200).send({
        habits: userHabits,
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error(err, "Failed to list habits");
      return reply.status(500).send({
        error: "An unexpected error occurred while retrieving habits",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // POST /api/habits — Create a new habit strictly owned by current user
  server.post("/", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const parseResult = createHabitSchema.safeParse(request.body);
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

      const { title, description } = parseResult.data;

      const [newHabit] = await db
        .insert(habits)
        .values({
          userId: user.id, // Strictly server-assigned ownership
          title,
          description: description ?? null,
          frequency: "DAILY",
          status: "ACTIVE",
        })
        .returning();

      return reply.status(201).send({
        habit: newHabit,
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error(err, "Failed to create habit");
      return reply.status(500).send({
        error: "An unexpected error occurred while creating the habit",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // GET /api/habits/:id — Retrieve single habit details (strictly ownership-scoped)
  server.get("/:id", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const paramResult = habitIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.status(400).send({
          error: "Invalid habit ID format",
          code: "INVALID_ID",
        });
      }

      const habitId = paramResult.data.id;

      const [habit] = await db
        .select()
        .from(habits)
        .where(and(eq(habits.id, habitId), eq(habits.userId, user.id)))
        .limit(1);

      if (!habit) {
        return reply.status(404).send({
          error: "Habit not found",
          code: "NOT_FOUND",
        });
      }

      return reply.status(200).send({
        habit,
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error(err, "Failed to get habit");
      return reply.status(500).send({
        error: "An unexpected error occurred while retrieving the habit",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // PATCH /api/habits/:id — Update an existing habit
  server.patch("/:id", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const paramResult = habitIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.status(400).send({
          error: "Invalid habit ID format",
          code: "INVALID_ID",
        });
      }

      const habitId = paramResult.data.id;

      const parseResult = updateHabitSchema.safeParse(request.body);
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

      // Check existence and ownership before updating (return 404 on missing or IDOR)
      const [existing] = await db
        .select({ id: habits.id })
        .from(habits)
        .where(and(eq(habits.id, habitId), eq(habits.userId, user.id)))
        .limit(1);

      if (!existing) {
        return reply.status(404).send({
          error: "Habit not found",
          code: "NOT_FOUND",
        });
      }

      const updateData: Partial<typeof habits.$inferInsert> = {
        updatedAt: new Date(),
      };

      if (parseResult.data.title !== undefined) updateData.title = parseResult.data.title;
      if (parseResult.data.description !== undefined) updateData.description = parseResult.data.description;
      if (parseResult.data.status !== undefined) updateData.status = parseResult.data.status;

      const [updatedHabit] = await db
        .update(habits)
        .set(updateData)
        .where(and(eq(habits.id, habitId), eq(habits.userId, user.id)))
        .returning();

      return reply.status(200).send({
        habit: updatedHabit,
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error(err, "Failed to update habit");
      return reply.status(500).send({
        error: "An unexpected error occurred while updating the habit",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // DELETE /api/habits/:id — Hard-delete a habit (cascades completions at DB level)
  server.delete("/:id", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const paramResult = habitIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.status(400).send({
          error: "Invalid habit ID format",
          code: "INVALID_ID",
        });
      }

      const habitId = paramResult.data.id;

      // Scoped deletion: only deletes if owned by current user
      const [deleted] = await db
        .delete(habits)
        .where(and(eq(habits.id, habitId), eq(habits.userId, user.id)))
        .returning({ id: habits.id });

      if (!deleted) {
        return reply.status(404).send({
          error: "Habit not found",
          code: "NOT_FOUND",
        });
      }

      return reply.status(200).send({
        success: true,
        id: habitId,
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error(err, "Failed to delete habit");
      return reply.status(500).send({
        error: "An unexpected error occurred while deleting the habit",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // POST /api/habits/:id/completions — Mark habit complete for a calendar date (idempotent)
  server.post("/:id/completions", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const paramResult = habitIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.status(400).send({
          error: "Invalid habit ID format",
          code: "INVALID_ID",
        });
      }

      const habitId = paramResult.data.id;

      // Ownership check: habit must exist and belong to authenticated user
      const [habit] = await db
        .select({ id: habits.id })
        .from(habits)
        .where(and(eq(habits.id, habitId), eq(habits.userId, user.id)))
        .limit(1);

      if (!habit) {
        return reply.status(404).send({
          error: "Habit not found",
          code: "NOT_FOUND",
        });
      }

      const parseResult = createCompletionSchema.safeParse(request.body);
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

      const { date } = parseResult.data;

      // Idempotent insertion using ON CONFLICT DO NOTHING against unique(habitId, completedDate)
      const [inserted] = await db
        .insert(habitCompletions)
        .values({
          habitId,
          userId: user.id,
          completedDate: date,
        })
        .onConflictDoNothing({
          target: [habitCompletions.habitId, habitCompletions.completedDate],
        })
        .returning();

      if (inserted) {
        return reply.status(201).send({
          completion: inserted,
        });
      }

      // Already completed for this date: return existing completion (idempotent HTTP 200)
      const [existing] = await db
        .select()
        .from(habitCompletions)
        .where(
          and(
            eq(habitCompletions.habitId, habitId),
            eq(habitCompletions.completedDate, date)
          )
        )
        .limit(1);

      return reply.status(200).send({
        completion: existing,
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error(err, "Failed to create habit completion");
      return reply.status(500).send({
        error: "An unexpected error occurred while completing the habit",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // DELETE /api/habits/:id/completions/:date — Undo/delete completion for a calendar date
  server.delete("/:id/completions/:date", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const paramResult = habitCompletionDateParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        const isIdIssue = paramResult.error.issues.some((i) => i.path.includes("id"));
        return reply.status(400).send({
          error: isIdIssue ? "Invalid habit ID format" : "Invalid completion date format",
          code: isIdIssue ? "INVALID_ID" : "INVALID_DATE",
        });
      }

      const { id: habitId, date } = paramResult.data;

      // Ownership check: habit must exist and belong to authenticated user
      const [habit] = await db
        .select({ id: habits.id })
        .from(habits)
        .where(and(eq(habits.id, habitId), eq(habits.userId, user.id)))
        .limit(1);

      if (!habit) {
        return reply.status(404).send({
          error: "Habit not found",
          code: "NOT_FOUND",
        });
      }

      // Delete the completion record for this habit, user, and date
      const [deleted] = await db
        .delete(habitCompletions)
        .where(
          and(
            eq(habitCompletions.habitId, habitId),
            eq(habitCompletions.userId, user.id),
            eq(habitCompletions.completedDate, date)
          )
        )
        .returning({ id: habitCompletions.id });

      if (!deleted) {
        return reply.status(404).send({
          error: "Completion not found",
          code: "NOT_FOUND",
        });
      }

      return reply.status(200).send({
        success: true,
        habitId,
        completedDate: date,
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error(err, "Failed to delete habit completion");
      return reply.status(500).send({
        error: "An unexpected error occurred while undoing habit completion",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // GET /api/habits/:id/history — Retrieve completion history for habit (bounded trailing window)
  server.get("/:id/history", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const paramResult = habitIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.status(400).send({
          error: "Invalid habit ID format",
          code: "INVALID_ID",
        });
      }

      const habitId = paramResult.data.id;

      // Ownership check: habit must exist and belong to authenticated user
      const [habit] = await db
        .select({ id: habits.id })
        .from(habits)
        .where(and(eq(habits.id, habitId), eq(habits.userId, user.id)))
        .limit(1);

      if (!habit) {
        return reply.status(404).send({
          error: "Habit not found",
          code: "NOT_FOUND",
        });
      }

      const queryResult = habitHistoryQuerySchema.safeParse(request.query);
      const days = queryResult.success ? queryResult.data.days : 7;

      // Generate the bounded trailing dates array (descending from today)
      const now = new Date();
      const dates: string[] = [];
      for (let i = 0; i < days; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        dates.push(`${year}-${month}-${day}`);
      }

      const oldestDate = dates[dates.length - 1];

      // Query completions for this habit within the window
      const completions = await db
        .select()
        .from(habitCompletions)
        .where(
          and(
            eq(habitCompletions.habitId, habitId),
            eq(habitCompletions.userId, user.id),
            gte(habitCompletions.completedDate, oldestDate)
          )
        )
        .orderBy(desc(habitCompletions.completedDate));

      const completionMap = new Map(
        completions.map((c) => [c.completedDate, c])
      );

      const history = dates.map((dateStr) => {
        const comp = completionMap.get(dateStr);
        return {
          date: dateStr,
          completed: !!comp,
          completedAt: comp ? comp.completedAt : null,
        };
      });

      return reply.status(200).send({
        habitId,
        days,
        history,
        completions,
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error(err, "Failed to retrieve habit history");
      return reply.status(500).send({
        error: "An unexpected error occurred while retrieving habit history",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });
};
