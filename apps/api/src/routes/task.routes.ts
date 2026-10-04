import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { and, desc, eq, asc } from "drizzle-orm";
import { IdentityError, resolveUserIdentity } from "../auth/dev-user.js";
import { db } from "../db/index.js";
import { tasks } from "../db/schema.js";
import {
  createTaskSchema,
  taskIdParamSchema,
  updateTaskSchema,
} from "../tasks/task.schema.js";

export const taskRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  // GET /api/tasks — Retrieve current user's tasks
  server.get("/", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const userTasks = await db
        .select()
        .from(tasks)
        .where(eq(tasks.userId, user.id))
        .orderBy(
          desc(tasks.status), // 'TODO' comes before 'COMPLETED' in descending alphabetical order
          asc(tasks.dueDate),
          desc(tasks.createdAt)
        );

      return reply.status(200).send({
        tasks: userTasks,
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error(err, "Failed to list tasks");
      return reply.status(500).send({
        error: "An unexpected error occurred while retrieving tasks",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // POST /api/tasks — Create a new task owned by current user
  server.post("/", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const parseResult = createTaskSchema.safeParse(request.body);
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

      const { title, priority, dueDate } = parseResult.data;

      const [newTask] = await db
        .insert(tasks)
        .values({
          userId: user.id, // Strictly server-assigned ownership
          title,
          priority,
          dueDate: dueDate ?? null,
          status: "TODO",
        })
        .returning();

      return reply.status(201).send({
        task: newTask,
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error(err, "Failed to create task");
      return reply.status(500).send({
        error: "An unexpected error occurred while creating the task",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // PATCH /api/tasks/:id — Update completion or metadata with strict ownership check
  server.patch("/:id", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const paramResult = taskIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.status(400).send({
          error: "Invalid task ID format",
          code: "INVALID_ID",
        });
      }

      const bodyResult = updateTaskSchema.safeParse(request.body);
      if (!bodyResult.success) {
        const details = bodyResult.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        }));

        return reply.status(400).send({
          error: "Validation failed",
          code: "VALIDATION_ERROR",
          details,
        });
      }

      const taskId = paramResult.data.id;
      const updates = bodyResult.data;

      const valuesToUpdate: Partial<typeof tasks.$inferInsert> = {
        updatedAt: new Date(),
      };

      if (updates.title !== undefined) {
        valuesToUpdate.title = updates.title;
      }
      if (updates.priority !== undefined) {
        valuesToUpdate.priority = updates.priority;
      }
      if (updates.dueDate !== undefined) {
        valuesToUpdate.dueDate = updates.dueDate;
      }
      if (updates.status !== undefined) {
        valuesToUpdate.status = updates.status;
        valuesToUpdate.completedAt =
          updates.status === "COMPLETED" ? new Date() : null;
      }

      // Safe update scoped strictly to both task ID and current user ID (prevents IDOR)
      const [updatedTask] = await db
        .update(tasks)
        .set(valuesToUpdate)
        .where(and(eq(tasks.id, taskId), eq(tasks.userId, user.id)))
        .returning();

      if (!updatedTask) {
        return reply.status(404).send({
          error: "Task not found",
          code: "TASK_NOT_FOUND",
        });
      }

      return reply.status(200).send({
        task: updatedTask,
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error(err, "Failed to update task");
      return reply.status(500).send({
        error: "An unexpected error occurred while updating the task",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // DELETE /api/tasks/:id — Delete task with strict ownership check
  server.delete("/:id", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const paramResult = taskIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.status(400).send({
          error: "Invalid task ID format",
          code: "INVALID_ID",
        });
      }

      const taskId = paramResult.data.id;

      // Safe delete scoped strictly to both task ID and current user ID
      const [deletedTask] = await db
        .delete(tasks)
        .where(and(eq(tasks.id, taskId), eq(tasks.userId, user.id)))
        .returning({ id: tasks.id });

      if (!deletedTask) {
        return reply.status(404).send({
          error: "Task not found",
          code: "TASK_NOT_FOUND",
        });
      }

      return reply.status(200).send({
        success: true,
        id: deletedTask.id,
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error(err, "Failed to delete task");
      return reply.status(500).send({
        error: "An unexpected error occurred while deleting the task",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });
};
