import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireAuth } from "../auth/authenticate.js";
import { IdentityError, resolveUserIdentity } from "../auth/dev-user.js";
import { db } from "../db/index.js";
import { savingsContributions, savingsGoals } from "../db/schema.js";
import {
  createContributionSchema,
  createSavingsGoalSchema,
  listContributionsQuerySchema,
  savingsGoalIdParamSchema,
  updateSavingsGoalStatusSchema,
  calculateClampedProgressPercent,
  serializeMonetaryAmount,
} from "../savings/savings.schema.js";

export const savingsRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  // Enforce session authentication across all savings endpoints
  server.addHook("preHandler", requireAuth);

  // GET /api/savings/active — Retrieve current user's active savings goal with derived metrics
  server.get("/active", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const [goal] = await db
        .select()
        .from(savingsGoals)
        .where(
          and(
            eq(savingsGoals.userId, user.id),
            eq(savingsGoals.status, "ACTIVE")
          )
        );

      if (!goal) {
        return reply.status(200).send({ goal: null });
      }

      // Compute ledger aggregates safely from contributions
      const [agg] = await db
        .select({
          totalSavedStr: sql<string>`cast(coalesce(sum(${savingsContributions.amountCents}), 0) as text)`,
          contributionCount: sql<number>`cast(count(${savingsContributions.id}) as integer)`,
        })
        .from(savingsContributions)
        .where(eq(savingsContributions.savingsGoalId, goal.id));

      const totalSaved = BigInt(agg?.totalSavedStr ?? "0");
      const target = BigInt(goal.targetAmountCents);
      const remaining = target > totalSaved ? target - totalSaved : 0n;

      const savedAmountCents = serializeMonetaryAmount(totalSaved);
      const remainingAmountCents = serializeMonetaryAmount(remaining);
      const progressPercent = calculateClampedProgressPercent(totalSaved, target);

      return reply.status(200).send({
        goal: {
          id: goal.id,
          name: goal.name,
          targetAmountCents: goal.targetAmountCents,
          status: goal.status,
          savedAmountCents,
          remainingAmountCents,
          progressPercent,
          contributionCount: agg?.contributionCount ?? 0,
          createdAt: goal.createdAt,
          updatedAt: goal.updatedAt,
        },
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error(err, "Failed to retrieve active savings goal");
      return reply.status(500).send({
        error: "An unexpected error occurred while retrieving active savings goal",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // POST /api/savings — Create a new active savings goal for the current user
  server.post("/", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const bodyResult = createSavingsGoalSchema.safeParse(request.body);
      if (!bodyResult.success) {
        const details = bodyResult.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        }));
        return reply.status(400).send({
          error: "Invalid savings goal data",
          code: "VALIDATION_ERROR",
          details,
        });
      }

      const { name, targetAmountCents } = bodyResult.data;

      // Check whether user already has an active goal
      const [existingActive] = await db
        .select({ id: savingsGoals.id })
        .from(savingsGoals)
        .where(
          and(
            eq(savingsGoals.userId, user.id),
            eq(savingsGoals.status, "ACTIVE")
          )
        );

      if (existingActive) {
        return reply.status(409).send({
          error: "An active savings goal already exists. Complete or archive it before creating a new one.",
          code: "ACTIVE_GOAL_EXISTS",
        });
      }

      try {
        const [newGoal] = await db
          .insert(savingsGoals)
          .values({
            userId: user.id,
            name,
            targetAmountCents,
            status: "ACTIVE",
          })
          .returning();

        return reply.status(201).send({
          goal: {
            id: newGoal.id,
            name: newGoal.name,
            targetAmountCents: newGoal.targetAmountCents,
            status: newGoal.status,
            savedAmountCents: 0,
            remainingAmountCents: newGoal.targetAmountCents,
            progressPercent: 0,
            contributionCount: 0,
            createdAt: newGoal.createdAt,
            updatedAt: newGoal.updatedAt,
          },
        });
      } catch (insertErr: any) {
        // Handle race condition caught by PostgreSQL unique partial index
        if (insertErr.code === "23505") {
          return reply.status(409).send({
            error: "An active savings goal already exists. Complete or archive it before creating a new one.",
            code: "ACTIVE_GOAL_EXISTS",
          });
        }
        throw insertErr;
      }
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error(err, "Failed to create savings goal");
      return reply.status(500).send({
        error: "An unexpected error occurred while creating savings goal",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // POST /api/savings/:id/contributions — Record an immutable deposit towards a savings goal
  server.post("/:id/contributions", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const paramsResult = savingsGoalIdParamSchema.safeParse(request.params);
      if (!paramsResult.success) {
        return reply.status(400).send({
          error: "Invalid savings goal ID",
          code: "VALIDATION_ERROR",
          details: paramsResult.error.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
          })),
        });
      }

      const bodyResult = createContributionSchema.safeParse(request.body);
      if (!bodyResult.success) {
        return reply.status(400).send({
          error: "Invalid contribution data",
          code: "VALIDATION_ERROR",
          details: bodyResult.error.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
          })),
        });
      }

      const goalId = paramsResult.data.id;
      const { amountCents, note } = bodyResult.data;

      // Transactional atomic execution with row-level lock
      const result = await db.transaction(async (tx) => {
        const [goal] = await tx
          .select()
          .from(savingsGoals)
          .where(
            and(
              eq(savingsGoals.id, goalId),
              eq(savingsGoals.userId, user.id)
            )
          )
          .for("update");

        if (!goal) {
          return { error: "NOT_FOUND" as const };
        }

        if (goal.status !== "ACTIVE") {
          return {
            error: "INVALID_GOAL_STATUS" as const,
            status: goal.status,
          };
        }

        const [contribution] = await tx
          .insert(savingsContributions)
          .values({
            savingsGoalId: goal.id,
            userId: user.id,
            amountCents,
            note: note || null,
          })
          .returning();

        // Fresh ledger sum inside the transaction
        const [agg] = await tx
          .select({
            totalSavedStr: sql<string>`cast(coalesce(sum(${savingsContributions.amountCents}), 0) as text)`,
            contributionCount: sql<number>`cast(count(${savingsContributions.id}) as integer)`,
          })
          .from(savingsContributions)
          .where(eq(savingsContributions.savingsGoalId, goal.id));

        const totalSaved = BigInt(agg?.totalSavedStr ?? "0");
        const target = BigInt(goal.targetAmountCents);
        const remaining = target > totalSaved ? target - totalSaved : 0n;

        const savedAmountCents = serializeMonetaryAmount(totalSaved);
        const remainingAmountCents = serializeMonetaryAmount(remaining);
        const progressPercent = calculateClampedProgressPercent(totalSaved, target);

        return {
          contribution,
          goal: {
            id: goal.id,
            name: goal.name,
            targetAmountCents: goal.targetAmountCents,
            status: goal.status,
            savedAmountCents,
            remainingAmountCents,
            progressPercent,
            contributionCount: agg?.contributionCount ?? 0,
            updatedAt: goal.updatedAt,
          },
        };
      });

      if ("error" in result) {
        if (result.error === "NOT_FOUND") {
          return reply.status(404).send({
            error: "Savings goal not found",
            code: "NOT_FOUND",
          });
        }
        if (result.error === "INVALID_GOAL_STATUS") {
          return reply.status(400).send({
            error: `Cannot contribute to a ${result.status.toLowerCase()} savings goal`,
            code: "INVALID_GOAL_STATUS",
          });
        }
      }

      return reply.status(201).send(result);
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error(err, "Failed to record contribution");
      return reply.status(500).send({
        error: "An unexpected error occurred while recording contribution",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // GET /api/savings/:id/contributions — List chronological contributions for an owned goal
  server.get("/:id/contributions", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const paramsResult = savingsGoalIdParamSchema.safeParse(request.params);
      if (!paramsResult.success) {
        return reply.status(400).send({
          error: "Invalid savings goal ID",
          code: "VALIDATION_ERROR",
          details: paramsResult.error.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
          })),
        });
      }

      const queryResult = listContributionsQuerySchema.safeParse(request.query);
      if (!queryResult.success) {
        return reply.status(400).send({
          error: "Invalid query parameters",
          code: "VALIDATION_ERROR",
          details: queryResult.error.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
          })),
        });
      }

      const goalId = paramsResult.data.id;
      const { limit, offset } = queryResult.data;

      // Verify goal ownership
      const [goal] = await db
        .select({ id: savingsGoals.id })
        .from(savingsGoals)
        .where(
          and(
            eq(savingsGoals.id, goalId),
            eq(savingsGoals.userId, user.id)
          )
        );

      if (!goal) {
        return reply.status(404).send({
          error: "Savings goal not found",
          code: "NOT_FOUND",
        });
      }

      const [contributionsList, countResult] = await Promise.all([
        db
          .select()
          .from(savingsContributions)
          .where(
            and(
              eq(savingsContributions.savingsGoalId, goalId),
              eq(savingsContributions.userId, user.id)
            )
          )
          .orderBy(desc(savingsContributions.createdAt))
          .limit(limit)
          .offset(offset),
        db
          .select({
            count: sql<number>`cast(count(${savingsContributions.id}) as integer)`,
          })
          .from(savingsContributions)
          .where(
            and(
              eq(savingsContributions.savingsGoalId, goalId),
              eq(savingsContributions.userId, user.id)
            )
          ),
      ]);

      return reply.status(200).send({
        contributions: contributionsList,
        total: countResult[0]?.count ?? 0,
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error(err, "Failed to list savings contributions");
      return reply.status(500).send({
        error: "An unexpected error occurred while retrieving contributions",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // PATCH /api/savings/:id/status — Complete or archive an existing savings goal
  server.patch("/:id/status", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const paramsResult = savingsGoalIdParamSchema.safeParse(request.params);
      if (!paramsResult.success) {
        return reply.status(400).send({
          error: "Invalid savings goal ID",
          code: "VALIDATION_ERROR",
          details: paramsResult.error.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
          })),
        });
      }

      const bodyResult = updateSavingsGoalStatusSchema.safeParse(request.body);
      if (!bodyResult.success) {
        return reply.status(400).send({
          error: "Invalid status update data",
          code: "VALIDATION_ERROR",
          details: bodyResult.error.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
          })),
        });
      }

      const goalId = paramsResult.data.id;
      const { status } = bodyResult.data;

      const [existingGoal] = await db
        .select()
        .from(savingsGoals)
        .where(
          and(
            eq(savingsGoals.id, goalId),
            eq(savingsGoals.userId, user.id)
          )
        );

      if (!existingGoal) {
        return reply.status(404).send({
          error: "Savings goal not found",
          code: "NOT_FOUND",
        });
      }

      const [updatedGoal] = await db
        .update(savingsGoals)
        .set({
          status,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(savingsGoals.id, goalId),
            eq(savingsGoals.userId, user.id)
          )
        )
        .returning();

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

      server.log.error(err, "Failed to update savings goal status");
      return reply.status(500).send({
        error: "An unexpected error occurred while updating savings goal status",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });
};
