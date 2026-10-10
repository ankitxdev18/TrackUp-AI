import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { requireAuth } from "../auth/authenticate.js";
import { IdentityError, resolveUserIdentity } from "../auth/dev-user.js";
import { db } from "../db/index.js";
import { goals } from "../db/schema.js";
import {
  createGoalSchema,
  goalIdParamSchema,
  GOAL_STATUS_VALUES,
  updateGoalSchema,
} from "../goals/goal.schema.js";
import {
  buildDedupeKey,
  createNotification,
} from "../notifications/notification.service.js";

export const goalRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  server.addHook("preHandler", requireAuth);

  // GET /api/goals — Retrieve current user's goals with optional status filtering
  server.get("/", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);
      const query = request.query as { status?: string };

      let whereCondition = eq(goals.userId, user.id);

      if (query.status) {
        const upperStatus = query.status.toUpperCase();
        if (GOAL_STATUS_VALUES.includes(upperStatus as any)) {
          whereCondition = and(
            eq(goals.userId, user.id),
            eq(goals.status, upperStatus)
          )!;
        } else {
          return reply.status(400).send({
            error: `Invalid status filter. Must be one of: ${GOAL_STATUS_VALUES.join(", ")}`,
            code: "INVALID_STATUS",
          });
        }
      }

      const userGoals = await db
        .select()
        .from(goals)
        .where(whereCondition)
        .orderBy(
          // 'ACTIVE' goals first, then by targetDate ascending (nulls last), then createdAt desc
          sql`case when ${goals.status} = 'ACTIVE' then 0 when ${goals.status} = 'COMPLETED' then 1 else 2 end`,
          sql`case when ${goals.targetDate} is null then 1 else 0 end`,
          asc(goals.targetDate),
          desc(goals.createdAt)
        );

      return reply.status(200).send({
        goals: userGoals,
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error(err, "Failed to list goals");
      return reply.status(500).send({
        error: "An unexpected error occurred while retrieving goals",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // POST /api/goals — Create a new goal owned by current user
  server.post("/", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const parseResult = createGoalSchema.safeParse(request.body);
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

      const { title, description, status, progress, targetDate } = parseResult.data;

      const [newGoal] = await db
        .insert(goals)
        .values({
          userId: user.id, // Strictly server-assigned ownership
          title,
          description: description ?? null,
          status: status ?? "ACTIVE",
          progress: progress ?? 0,
          targetDate: targetDate ?? null,
        })
        .returning();

      return reply.status(201).send({
        goal: newGoal,
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error(err, "Failed to create goal");
      return reply.status(500).send({
        error: "An unexpected error occurred while creating the goal",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // GET /api/goals/:id — Retrieve single goal details
  server.get("/:id", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const paramResult = goalIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.status(400).send({
          error: "Invalid goal ID format",
          code: "INVALID_ID",
        });
      }

      const goalId = paramResult.data.id;

      const [goal] = await db
        .select()
        .from(goals)
        .where(and(eq(goals.id, goalId), eq(goals.userId, user.id)))
        .limit(1);

      if (!goal) {
        return reply.status(404).send({
          error: "Goal not found",
          code: "NOT_FOUND",
        });
      }

      return reply.status(200).send({
        goal,
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error(err, "Failed to retrieve goal");
      return reply.status(500).send({
        error: "An unexpected error occurred while retrieving the goal",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // PATCH /api/goals/:id — Update an existing goal
  server.patch("/:id", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const paramResult = goalIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.status(400).send({
          error: "Invalid goal ID format",
          code: "INVALID_ID",
        });
      }

      const goalId = paramResult.data.id;

      const parseResult = updateGoalSchema.safeParse(request.body);
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

      // Check existence and ownership before updating
      const [existing] = await db
        .select({ id: goals.id })
        .from(goals)
        .where(and(eq(goals.id, goalId), eq(goals.userId, user.id)))
        .limit(1);

      if (!existing) {
        return reply.status(404).send({
          error: "Goal not found",
          code: "NOT_FOUND",
        });
      }

      const updateData: Partial<typeof goals.$inferInsert> = {
        updatedAt: new Date(),
      };

      if (parseResult.data.title !== undefined) updateData.title = parseResult.data.title;
      if (parseResult.data.description !== undefined) updateData.description = parseResult.data.description;
      if (parseResult.data.status !== undefined) updateData.status = parseResult.data.status;
      if (parseResult.data.progress !== undefined) updateData.progress = parseResult.data.progress;
      if (parseResult.data.targetDate !== undefined) updateData.targetDate = parseResult.data.targetDate;

      const updatedGoal = await db.transaction(async (tx) => {
        const [goalResult] = await tx
          .update(goals)
          .set(updateData)
          .where(and(eq(goals.id, goalId), eq(goals.userId, user.id)))
          .returning();

        if (
          goalResult &&
          (goalResult.status === "COMPLETED" || goalResult.progress === 100)
        ) {
          await createNotification(
            user.id,
            {
              type: "GOAL_COMPLETED",
              title: `Goal Achieved: ${goalResult.title}`,
              body: "Congratulations! You completed this goal.",
              resourceType: "goal",
              resourceId: goalResult.id,
              dedupeKey: buildDedupeKey("GOAL_COMPLETED", goalResult.id),
            },
            tx
          );
        }

        return goalResult;
      });

      return reply.status(200).send({
        goal: updatedGoal,
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error(err, "Failed to update goal");
      return reply.status(500).send({
        error: "An unexpected error occurred while updating the goal",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // DELETE /api/goals/:id — Delete a goal
  server.delete("/:id", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const paramResult = goalIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.status(400).send({
          error: "Invalid goal ID format",
          code: "INVALID_ID",
        });
      }

      const goalId = paramResult.data.id;

      // Scoped deletion: only deletes if owned by current user
      const [deleted] = await db
        .delete(goals)
        .where(and(eq(goals.id, goalId), eq(goals.userId, user.id)))
        .returning({ id: goals.id });

      if (!deleted) {
        return reply.status(404).send({
          error: "Goal not found",
          code: "NOT_FOUND",
        });
      }

      return reply.status(200).send({
        success: true,
        id: goalId,
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error(err, "Failed to delete goal");
      return reply.status(500).send({
        error: "An unexpected error occurred while deleting the goal",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });
};
