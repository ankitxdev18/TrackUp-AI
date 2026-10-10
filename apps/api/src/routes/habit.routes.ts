import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { requireAuth } from "../auth/authenticate.js";
import { IdentityError, resolveUserIdentity } from "../auth/dev-user.js";
import { db } from "../db/index.js";
import { habitCompletions, habits } from "../db/schema.js";
import {
  addCalendarDays,
  assertValidIanaTimeZone,
  formatCalendarDateInTimeZone,
  getUserLocalToday,
} from "../habits/habit.date.js";
import { calculateStreaks } from "../habits/habit.streak.js";
import {
  createCompletionSchema,
  createHabitSchema,
  habitCompletionDateParamSchema,
  habitHistoryQuerySchema,
  habitIdParamSchema,
  habitStatusQuerySchema,
  updateHabitSchema,
} from "../habits/habit.schema.js";
import {
  buildDedupeKey,
  createNotification,
} from "../notifications/notification.service.js";

export const habitRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  // Enforce session authentication across all habit endpoints
  server.addHook("preHandler", requireAuth);

  // ========================================================
  // GET /api/habits — List current user's habits with streak metrics
  // ========================================================
  server.get("/", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);
      assertValidIanaTimeZone(user.timezone);
      const userLocalToday = getUserLocalToday(user.timezone);

      const queryResult = habitStatusQuerySchema.safeParse(request.query ?? {});
      if (!queryResult.success) {
        return reply.status(400).send({
          error: "Invalid status filter. Must be one of: ACTIVE, ARCHIVED",
          code: "INVALID_STATUS",
        });
      }

      const { status } = queryResult.data;

      // Query user's habits filtered by status
      const userHabits = await db
        .select()
        .from(habits)
        .where(and(eq(habits.userId, user.id), eq(habits.status, status)))
        .orderBy(desc(habits.createdAt), habits.id);

      if (userHabits.length === 0) {
        return reply.status(200).send({
          habits: [],
        });
      }

      const habitIds = userHabits.map((h) => h.id);

      // Single efficient query to fetch completions for all returned habits
      const allCompletions = await db
        .select({
          habitId: habitCompletions.habitId,
          completedDate: habitCompletions.completedDate,
        })
        .from(habitCompletions)
        .where(inArray(habitCompletions.habitId, habitIds))
        .orderBy(habitCompletions.completedDate);

      // Group completions by habitId
      const completionsByHabit = new Map<string, string[]>();
      for (const c of allCompletions) {
        let list = completionsByHabit.get(c.habitId);
        if (!list) {
          list = [];
          completionsByHabit.set(c.habitId, list);
        }
        list.push(c.completedDate);
      }

      // Format response with derived streaks and todayCompleted
      const formattedHabits = userHabits.map((habit) => {
        const dates = completionsByHabit.get(habit.id) || [];
        const streaks = calculateStreaks(dates, userLocalToday);
        const todayCompleted = dates.includes(userLocalToday);

        return {
          id: habit.id,
          userId: habit.userId,
          title: habit.title,
          description: habit.description,
          frequency: habit.frequency,
          status: habit.status,
          currentStreak: streaks.currentStreak,
          longestStreak: streaks.longestStreak,
          todayCompleted,
          createdAt: habit.createdAt.toISOString(),
          updatedAt: habit.updatedAt.toISOString(),
        };
      });

      return reply.status(200).send({
        habits: formattedHabits,
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

  // ========================================================
  // GET /api/habits/:id — Get single habit by ID
  // ========================================================
  server.get("/:id", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);
      assertValidIanaTimeZone(user.timezone);
      const userLocalToday = getUserLocalToday(user.timezone);

      const paramResult = habitIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.status(400).send({
          error: "Invalid habit ID format",
          code: "INVALID_ID",
        });
      }

      const habitId = paramResult.data.id;

      // Ownership-scoped query: 404 for cross-user or missing
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

      // Query complete completion history for this habit
      const completions = await db
        .select({ completedDate: habitCompletions.completedDate })
        .from(habitCompletions)
        .where(eq(habitCompletions.habitId, habitId))
        .orderBy(habitCompletions.completedDate);

      const dates = completions.map((c) => c.completedDate);
      const streaks = calculateStreaks(dates, userLocalToday);
      const todayCompleted = dates.includes(userLocalToday);

      return reply.status(200).send({
        habit: {
          id: habit.id,
          userId: habit.userId,
          title: habit.title,
          description: habit.description,
          frequency: habit.frequency,
          status: habit.status,
          currentStreak: streaks.currentStreak,
          longestStreak: streaks.longestStreak,
          todayCompleted,
          createdAt: habit.createdAt.toISOString(),
          updatedAt: habit.updatedAt.toISOString(),
        },
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error(err, "Failed to retrieve habit");
      return reply.status(500).send({
        error: "An unexpected error occurred while retrieving the habit",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // ========================================================
  // POST /api/habits — Create a new habit
  // ========================================================
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
        habit: {
          id: newHabit.id,
          userId: newHabit.userId,
          title: newHabit.title,
          description: newHabit.description,
          frequency: newHabit.frequency,
          status: newHabit.status,
          currentStreak: 0,
          longestStreak: 0,
          todayCompleted: false,
          createdAt: newHabit.createdAt.toISOString(),
          updatedAt: newHabit.updatedAt.toISOString(),
        },
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

  // ========================================================
  // PATCH /api/habits/:id — Update habit metadata or status
  // ========================================================
  server.patch("/:id", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);
      assertValidIanaTimeZone(user.timezone);
      const userLocalToday = getUserLocalToday(user.timezone);

      const paramResult = habitIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.status(400).send({
          error: "Invalid habit ID format",
          code: "INVALID_ID",
        });
      }

      const habitId = paramResult.data.id;

      // Ownership check: must exist and belong to authenticated user
      const [existingHabit] = await db
        .select()
        .from(habits)
        .where(and(eq(habits.id, habitId), eq(habits.userId, user.id)))
        .limit(1);

      if (!existingHabit) {
        return reply.status(404).send({
          error: "Habit not found",
          code: "NOT_FOUND",
        });
      }

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

      const updates: {
        title?: string;
        description?: string | null;
        status?: "ACTIVE" | "ARCHIVED";
        updatedAt: Date;
      } = {
        updatedAt: new Date(),
      };

      if (parseResult.data.title !== undefined) {
        updates.title = parseResult.data.title;
      }
      if (parseResult.data.description !== undefined) {
        updates.description = parseResult.data.description;
      }
      if (parseResult.data.status !== undefined) {
        updates.status = parseResult.data.status;
      }

      const [updated] = await db
        .update(habits)
        .set(updates)
        .where(and(eq(habits.id, habitId), eq(habits.userId, user.id)))
        .returning();

      // Recalculate streaks and todayCompleted
      const completions = await db
        .select({ completedDate: habitCompletions.completedDate })
        .from(habitCompletions)
        .where(eq(habitCompletions.habitId, habitId))
        .orderBy(habitCompletions.completedDate);

      const dates = completions.map((c) => c.completedDate);
      const streaks = calculateStreaks(dates, userLocalToday);
      const todayCompleted = dates.includes(userLocalToday);

      return reply.status(200).send({
        habit: {
          id: updated.id,
          userId: updated.userId,
          title: updated.title,
          description: updated.description,
          frequency: updated.frequency,
          status: updated.status,
          currentStreak: streaks.currentStreak,
          longestStreak: streaks.longestStreak,
          todayCompleted,
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
        },
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

  // ========================================================
  // DELETE /api/habits/:id — Permanently delete habit (cascade)
  // ========================================================
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

      return reply.status(204).send();
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

  // ========================================================
  // POST /api/habits/:id/completions — Idempotently record completion
  // ========================================================
  server.post("/:id/completions", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);
      assertValidIanaTimeZone(user.timezone);
      const userLocalToday = getUserLocalToday(user.timezone);

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

      // Business rule: Archived habits cannot be completed
      if (habit.status !== "ACTIVE") {
        return reply.status(400).send({
          error: "Cannot complete an archived habit",
          code: "HABIT_ARCHIVED",
        });
      }

      const parseResult = createCompletionSchema.safeParse(request.body ?? {});
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

      // Business rule: Cannot complete future calendar dates relative to userLocalToday
      if (date > userLocalToday) {
        return reply.status(400).send({
          error: "Completion date cannot be in the future",
          code: "CANNOT_COMPLETE_FUTURE_DATE",
        });
      }

      // Business rule: Cannot complete before habitEligibilityStartDate (local creation date)
      const habitEligibilityStartDate = formatCalendarDateInTimeZone(
        habit.createdAt,
        user.timezone
      );

      if (date < habitEligibilityStartDate) {
        return reply.status(400).send({
          error: "Completion date cannot precede habit creation date",
          code: "CANNOT_COMPLETE_BEFORE_HABIT_CREATION",
        });
      }

      // Concurrency and idempotency handling
      try {
        const [inserted] = await db
          .insert(habitCompletions)
          .values({
            habitId,
            completedDate: date,
          })
          .onConflictDoNothing({
            target: [habitCompletions.habitId, habitCompletions.completedDate],
          })
          .returning();

        if (inserted) {
          // Check if current streak reaches a milestone threshold
          try {
            const allCompletions = await db
              .select({ completedDate: habitCompletions.completedDate })
              .from(habitCompletions)
              .where(eq(habitCompletions.habitId, habitId));

            const completedDates = allCompletions.map((c) => c.completedDate);
            const { currentStreak } = calculateStreaks(
              completedDates,
              userLocalToday
            );

            const STREAK_MILESTONES = [7, 30, 100];
            if (STREAK_MILESTONES.includes(currentStreak)) {
              await createNotification(user.id, {
                type: "HABIT_STREAK_MILESTONE",
                title: `${currentStreak}-Day Streak: ${habit.title}`,
                body: `You've maintained your streak for ${currentStreak} consecutive days!`,
                resourceType: "habit",
                resourceId: habit.id,
                dedupeKey: buildDedupeKey(
                  "HABIT_STREAK_MILESTONE",
                  habit.id,
                  String(currentStreak)
                ),
              });
            }
          } catch (notifErr) {
            server.log.warn(notifErr, "Failed to create habit streak notification");
          }

          return reply.status(201).send({
            completion: {
              id: inserted.id,
              habitId: inserted.habitId,
              completedDate: inserted.completedDate,
              completedAt: inserted.completedAt.toISOString(),
            },
          });
        }

        // Already exists: return existing record with 200 OK
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
          completion: {
            id: existing.id,
            habitId: existing.habitId,
            completedDate: existing.completedDate,
            completedAt: existing.completedAt.toISOString(),
          },
        });
      } catch (dbErr: any) {
        // Safe handling of concurrent race condition (23505 unique_violation)
        if (dbErr?.code === "23505" || dbErr?.cause?.code === "23505") {
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

          if (existing) {
            return reply.status(200).send({
              completion: {
                id: existing.id,
                habitId: existing.habitId,
                completedDate: existing.completedDate,
                completedAt: existing.completedAt.toISOString(),
              },
            });
          }
        }
        throw dbErr;
      }
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

  // ========================================================
  // DELETE /api/habits/:id/completions/:date — Idempotently undo completion
  // ========================================================
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

      // Idempotently delete completion record
      await db
        .delete(habitCompletions)
        .where(
          and(
            eq(habitCompletions.habitId, habitId),
            eq(habitCompletions.completedDate, date)
          )
        );

      return reply.status(204).send();
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error(err, "Failed to delete habit completion");
      return reply.status(500).send({
        error: "An unexpected error occurred while deleting the completion",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // ========================================================
  // GET /api/habits/:id/history — Bounded history with full lifetime streaks
  // ========================================================
  server.get("/:id/history", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);
      assertValidIanaTimeZone(user.timezone);
      const userLocalToday = getUserLocalToday(user.timezone);

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

      const queryResult = habitHistoryQuerySchema.safeParse(request.query ?? {});
      if (!queryResult.success) {
        const details = queryResult.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        }));

        return reply.status(400).send({
          error: "Invalid history query parameters",
          code: "VALIDATION_ERROR",
          details,
        });
      }

      const { days } = queryResult.data;

      // Fetch complete completion history for accurate lifetime streak calculations
      const allCompletions = await db
        .select({
          completedDate: habitCompletions.completedDate,
          completedAt: habitCompletions.completedAt,
        })
        .from(habitCompletions)
        .where(eq(habitCompletions.habitId, habitId))
        .orderBy(habitCompletions.completedDate);

      const allDates = allCompletions.map((c) => c.completedDate);
      const streaks = calculateStreaks(allDates, userLocalToday);

      const habitEligibilityStartDate = formatCalendarDateInTimeZone(
        habit.createdAt,
        user.timezone
      );

      const completionMap = new Map(
        allCompletions.map((c) => [c.completedDate, c.completedAt])
      );

      // Generate bounded history window of requested length ending on userLocalToday (descending order)
      const history = [];
      const startDate = addCalendarDays(userLocalToday, -(days - 1));

      for (let i = 0; i < days; i++) {
        const curDate = addCalendarDays(userLocalToday, -i);
        const completedAt = completionMap.get(curDate);
        const isCompleted = !!completedAt;
        const isEligible = curDate >= habitEligibilityStartDate;

        history.push({
          date: curDate,
          completed: isCompleted,
          eligible: isEligible,
          completedAt: completedAt ? completedAt.toISOString() : null,
        });
      }

      return reply.status(200).send({
        habitId: habit.id,
        days,
        startDate,
        endDate: userLocalToday,
        currentStreak: streaks.currentStreak,
        longestStreak: streaks.longestStreak,
        eligibilityStartDate: habitEligibilityStartDate,
        history,
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
