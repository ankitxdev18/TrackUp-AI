import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { and, desc, eq, gte, ilike, lte, sql } from "drizzle-orm";
import { requireAuth } from "../auth/authenticate.js";
import { IdentityError, resolveUserIdentity } from "../auth/dev-user.js";
import { db } from "../db/index.js";
import { expenses, monthlyBudgets } from "../db/schema.js";
import {
  createBudgetSchema,
  createExpenseSchema,
  deleteBudgetQuerySchema,
  expenseIdParamSchema,
  expenseSummaryQuerySchema,
  getBudgetQuerySchema,
  listExpensesQuerySchema,
  updateBudgetSchema,
  updateExpenseSchema,
} from "../expenses/expense.schema.js";

export const expenseRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  // Enforce session authentication on all expenses endpoints
  server.addHook("preHandler", requireAuth);

  // GET /api/expenses — List current user's expenses with period, category, and search filters
  server.get("/", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const queryResult = listExpensesQuerySchema.safeParse(request.query);
      if (!queryResult.success) {
        const details = queryResult.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        }));
        return reply.status(400).send({
          error: "Invalid query parameters",
          code: "VALIDATION_ERROR",
          details,
        });
      }

      const query = queryResult.data;
      let conditions = eq(expenses.userId, user.id);

      if (query.startDate && query.endDate) {
        conditions = and(
          conditions,
          gte(expenses.date, query.startDate),
          lte(expenses.date, query.endDate)
        )!;
      } else if (query.startDate) {
        conditions = and(conditions, gte(expenses.date, query.startDate))!;
      } else if (query.endDate) {
        conditions = and(conditions, lte(expenses.date, query.endDate))!;
      }

      if (query.categoryId) {
        conditions = and(conditions, eq(expenses.categoryId, query.categoryId))!;
      }

      if (query.search) {
        conditions = and(
          conditions,
          ilike(expenses.description, `%${query.search}%`)
        )!;
      }

      const [userExpenses, [totalResult]] = await Promise.all([
        db
          .select()
          .from(expenses)
          .where(conditions)
          .orderBy(desc(expenses.date), desc(expenses.createdAt))
          .limit(query.limit)
          .offset(query.offset),
        db
          .select({
            count: sql<number>`cast(count(${expenses.id}) as integer)`,
          })
          .from(expenses)
          .where(conditions),
      ]);

      return reply.status(200).send({
        expenses: userExpenses,
        total: totalResult?.count ?? 0,
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error(err, "Failed to list expenses");
      return reply.status(500).send({
        error: "An unexpected error occurred while retrieving expenses",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // GET /api/expenses/summary — Period spending totals and category breakdown
  server.get("/summary", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const queryResult = expenseSummaryQuerySchema.safeParse(request.query);
      if (!queryResult.success) {
        const details = queryResult.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        }));
        return reply.status(400).send({
          error: "Invalid summary query parameters",
          code: "VALIDATION_ERROR",
          details,
        });
      }

      const { startDate, endDate } = queryResult.data;

      if (startDate > endDate) {
        return reply.status(400).send({
          error: "startDate must not be after endDate",
          code: "INVALID_PERIOD",
        });
      }

      const [overallResult, categoryRows] = await Promise.all([
        db
          .select({
            totalAmountCents: sql<number>`cast(coalesce(sum(${expenses.amountCents}), 0) as integer)`,
            transactionCount: sql<number>`cast(count(${expenses.id}) as integer)`,
          })
          .from(expenses)
          .where(
            and(
              eq(expenses.userId, user.id),
              gte(expenses.date, startDate),
              lte(expenses.date, endDate)
            )
          ),
        db
          .select({
            categoryId: expenses.categoryId,
            totalAmountCents: sql<number>`cast(coalesce(sum(${expenses.amountCents}), 0) as integer)`,
            transactionCount: sql<number>`cast(count(${expenses.id}) as integer)`,
          })
          .from(expenses)
          .where(
            and(
              eq(expenses.userId, user.id),
              gte(expenses.date, startDate),
              lte(expenses.date, endDate)
            )
          )
          .groupBy(expenses.categoryId)
          .orderBy(desc(sql`sum(${expenses.amountCents})`)),
      ]);

      const totalAmountCents = overallResult[0]?.totalAmountCents ?? 0;
      const transactionCount = overallResult[0]?.transactionCount ?? 0;

      const byCategory = categoryRows.map((cat) => ({
        categoryId: cat.categoryId,
        totalAmountCents: cat.totalAmountCents,
        transactionCount: cat.transactionCount,
        percentage:
          totalAmountCents > 0
            ? Math.round((cat.totalAmountCents / totalAmountCents) * 1000) / 10
            : 0,
      }));

      return reply.status(200).send({
        startDate,
        endDate,
        totalAmountCents,
        transactionCount,
        byCategory,
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error(err, "Failed to compute expense summary");
      return reply.status(500).send({
        error: "An unexpected error occurred while computing expense summary",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // GET /api/expenses/budget — Retrieve current user's monthly budget & authoritative spending calculations
  server.get("/budget", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const queryResult = getBudgetQuerySchema.safeParse(request.query);
      if (!queryResult.success) {
        const details = queryResult.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        }));
        return reply.status(400).send({
          error: "Invalid budget query parameters",
          code: "VALIDATION_ERROR",
          details,
        });
      }

      const now = new Date();
      const defaultMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
      const targetMonth = queryResult.data.month ?? defaultMonth;

      const [yearStr, monthStr] = targetMonth.split("-");
      const year = parseInt(yearStr, 10);
      const monthNum = parseInt(monthStr, 10);
      const lastDay = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
      const startDate = `${targetMonth}-01`;
      const endDate = `${targetMonth}-${String(lastDay).padStart(2, "0")}`;

      const [[budgetRecord], [spendingResult]] = await Promise.all([
        db
          .select()
          .from(monthlyBudgets)
          .where(
            and(
              eq(monthlyBudgets.userId, user.id),
              eq(monthlyBudgets.month, targetMonth)
            )
          )
          .limit(1),
        db
          .select({
            spentAmountCents: sql<number>`cast(coalesce(sum(${expenses.amountCents}), 0) as integer)`,
            transactionCount: sql<number>`cast(count(${expenses.id}) as integer)`,
          })
          .from(expenses)
          .where(
            and(
              eq(expenses.userId, user.id),
              gte(expenses.date, startDate),
              lte(expenses.date, endDate)
            )
          ),
      ]);

      const spentAmountCents = spendingResult?.spentAmountCents ?? 0;
      const transactionCount = spendingResult?.transactionCount ?? 0;

      let remainingAmountCents = 0;
      let overBudgetAmountCents = 0;
      let utilizationPercent = 0;
      let isExceeded = false;
      const budgetAmountCents = budgetRecord ? budgetRecord.amountCents : null;

      if (budgetRecord && budgetAmountCents !== null) {
        if (spentAmountCents > budgetAmountCents) {
          isExceeded = true;
          remainingAmountCents = 0;
          overBudgetAmountCents = spentAmountCents - budgetAmountCents;
        } else {
          isExceeded = false;
          remainingAmountCents = budgetAmountCents - spentAmountCents;
          overBudgetAmountCents = 0;
        }

        if (budgetAmountCents > 0) {
          utilizationPercent =
            Math.round((spentAmountCents / budgetAmountCents) * 1000) / 10;
        }
      }

      return reply.status(200).send({
        budget: budgetRecord ?? null,
        month: targetMonth,
        startDate,
        endDate,
        budgetAmountCents,
        spentAmountCents,
        remainingAmountCents,
        overBudgetAmountCents,
        utilizationPercent,
        transactionCount,
        isExceeded,
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error(err, "Failed to get monthly budget");
      return reply.status(500).send({
        error: "An unexpected error occurred while retrieving monthly budget",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // POST /api/expenses/budget — Create user's monthly budget for a specific month
  server.post("/budget", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const parseResult = createBudgetSchema.safeParse(request.body);
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

      const { month, amountCents } = parseResult.data;

      // Enforce one monthly budget per user per month
      const [existing] = await db
        .select({ id: monthlyBudgets.id })
        .from(monthlyBudgets)
        .where(
          and(
            eq(monthlyBudgets.userId, user.id),
            eq(monthlyBudgets.month, month)
          )
        )
        .limit(1);

      if (existing) {
        return reply.status(409).send({
          error: "A budget has already been configured for this month",
          code: "DUPLICATE_BUDGET",
        });
      }

      try {
        const [newBudget] = await db
          .insert(monthlyBudgets)
          .values({
            userId: user.id,
            month,
            amountCents,
          })
          .returning();

        return reply.status(201).send({
          budget: newBudget,
        });
      } catch (insertErr: any) {
        // Handle race condition caught by PostgreSQL unique constraint: monthly_budgets_user_month_unique_idx
        // Drizzle wraps database driver errors so code/constraint can be on insertErr or insertErr.cause
        const pgCode = insertErr?.code ?? insertErr?.cause?.code;
        const pgConstraint = insertErr?.constraint ?? insertErr?.cause?.constraint;

        if (
          pgCode === "23505" &&
          (pgConstraint === "monthly_budgets_user_month_unique_idx" || !pgConstraint)
        ) {
          return reply.status(409).send({
            error: "A budget has already been configured for this month",
            code: "DUPLICATE_BUDGET",
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

      server.log.error(err, "Failed to create monthly budget");
      return reply.status(500).send({
        error: "An unexpected error occurred while creating monthly budget",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // PUT /api/expenses/budget — Update user's monthly budget for a specific month
  server.put("/budget", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const parseResult = createBudgetSchema.safeParse(request.body);
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

      const { month, amountCents } = parseResult.data;

      const [updatedBudget] = await db
        .update(monthlyBudgets)
        .set({
          amountCents,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(monthlyBudgets.userId, user.id),
            eq(monthlyBudgets.month, month)
          )
        )
        .returning();

      if (!updatedBudget) {
        return reply.status(404).send({
          error: "No budget found for the specified month",
          code: "NOT_FOUND",
        });
      }

      return reply.status(200).send({
        budget: updatedBudget,
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error(err, "Failed to update monthly budget");
      return reply.status(500).send({
        error: "An unexpected error occurred while updating monthly budget",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // PATCH /api/expenses/budget/:id — Update existing monthly budget by ID
  server.patch("/budget/:id", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const paramResult = expenseIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.status(400).send({
          error: "Invalid budget ID format",
          code: "INVALID_ID",
        });
      }

      const { id } = paramResult.data;

      const parseResult = updateBudgetSchema.safeParse(request.body);
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

      const { amountCents } = parseResult.data;

      const [updatedBudget] = await db
        .update(monthlyBudgets)
        .set({
          amountCents,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(monthlyBudgets.id, id),
            eq(monthlyBudgets.userId, user.id)
          )
        )
        .returning();

      if (!updatedBudget) {
        return reply.status(404).send({
          error: "Budget not found",
          code: "NOT_FOUND",
        });
      }

      return reply.status(200).send({
        budget: updatedBudget,
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error(err, "Failed to patch monthly budget");
      return reply.status(500).send({
        error: "An unexpected error occurred while updating monthly budget",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // DELETE /api/expenses/budget — Delete user's monthly budget for a specific month
  server.delete("/budget", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const queryResult = deleteBudgetQuerySchema.safeParse(request.query);
      if (!queryResult.success) {
        const details = queryResult.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        }));
        return reply.status(400).send({
          error: "Invalid budget query parameters",
          code: "VALIDATION_ERROR",
          details,
        });
      }

      const { month } = queryResult.data;

      const deleted = await db
        .delete(monthlyBudgets)
        .where(
          and(
            eq(monthlyBudgets.userId, user.id),
            eq(monthlyBudgets.month, month)
          )
        )
        .returning({ id: monthlyBudgets.id });

      if (deleted.length === 0) {
        return reply.status(404).send({
          error: "No budget found for the specified month",
          code: "NOT_FOUND",
        });
      }

      return reply.status(200).send({
        success: true,
        message: "Monthly budget deleted successfully",
        month,
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error(err, "Failed to delete monthly budget");
      return reply.status(500).send({
        error: "An unexpected error occurred while deleting monthly budget",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // GET /api/expenses/:id — Retrieve single expense details strictly scoped to current user
  server.get("/:id", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const paramResult = expenseIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.status(400).send({
          error: "Invalid expense ID format",
          code: "INVALID_ID",
        });
      }

      const { id } = paramResult.data;

      const [expense] = await db
        .select()
        .from(expenses)
        .where(
          and(
            eq(expenses.id, id),
            eq(expenses.userId, user.id)
          )
        )
        .limit(1);

      if (!expense) {
        return reply.status(404).send({
          error: "Expense not found",
          code: "NOT_FOUND",
        });
      }

      return reply.status(200).send({
        expense,
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error(err, "Failed to get expense by id");
      return reply.status(500).send({
        error: "An unexpected error occurred while retrieving the expense",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // POST /api/expenses — Create a new expense strictly owned by current user
  server.post("/", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const parseResult = createExpenseSchema.safeParse(request.body);
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

      const { amountCents, date, categoryId, description } = parseResult.data;

      const [newExpense] = await db
        .insert(expenses)
        .values({
          userId: user.id, // Strictly server-assigned ownership
          amountCents,
          date,
          categoryId,
          description: description ?? null,
        })
        .returning();

      return reply.status(201).send({
        expense: newExpense,
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error(err, "Failed to create expense");
      return reply.status(500).send({
        error: "An unexpected error occurred while creating the expense",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // PATCH /api/expenses/:id — Update existing expense strictly owned by current user
  server.patch("/:id", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const paramResult = expenseIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.status(400).send({
          error: "Invalid expense ID format",
          code: "INVALID_ID",
        });
      }

      const { id } = paramResult.data;

      const parseResult = updateExpenseSchema.safeParse(request.body);
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

      const updateData = parseResult.data;
      const valuesToUpdate: Partial<typeof expenses.$inferInsert> = {
        updatedAt: new Date(),
      };

      if (updateData.amountCents !== undefined) {
        valuesToUpdate.amountCents = updateData.amountCents;
      }
      if (updateData.date !== undefined) {
        valuesToUpdate.date = updateData.date;
      }
      if (updateData.categoryId !== undefined) {
        valuesToUpdate.categoryId = updateData.categoryId;
      }
      if (updateData.description !== undefined) {
        valuesToUpdate.description = updateData.description;
      }

      const [updatedExpense] = await db
        .update(expenses)
        .set(valuesToUpdate)
        .where(
          and(
            eq(expenses.id, id),
            eq(expenses.userId, user.id)
          )
        )
        .returning();

      if (!updatedExpense) {
        return reply.status(404).send({
          error: "Expense not found",
          code: "NOT_FOUND",
        });
      }

      return reply.status(200).send({
        expense: updatedExpense,
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error(err, "Failed to update expense");
      return reply.status(500).send({
        error: "An unexpected error occurred while updating the expense",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // DELETE /api/expenses/:id — Delete existing expense strictly owned by current user
  server.delete("/:id", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const paramResult = expenseIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.status(400).send({
          error: "Invalid expense ID format",
          code: "INVALID_ID",
        });
      }

      const { id } = paramResult.data;

      const deleted = await db
        .delete(expenses)
        .where(
          and(
            eq(expenses.id, id),
            eq(expenses.userId, user.id)
          )
        )
        .returning({ id: expenses.id });

      if (deleted.length === 0) {
        return reply.status(404).send({
          error: "Expense not found",
          code: "NOT_FOUND",
        });
      }

      return reply.status(200).send({
        success: true,
        message: "Expense deleted successfully",
        id,
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error(err, "Failed to delete expense");
      return reply.status(500).send({
        error: "An unexpected error occurred while deleting the expense",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });
};
