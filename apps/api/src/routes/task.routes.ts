import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { and, desc, eq, asc, isNull } from "drizzle-orm";
import { requireAuth } from "../auth/authenticate.js";
import { IdentityError, resolveUserIdentity } from "../auth/dev-user.js";
import { db } from "../db/index.js";
import { projects, tasks } from "../db/schema.js";
import {
  createTaskSchema,
  taskIdParamSchema,
  updateTaskSchema,
} from "../tasks/task.schema.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const taskRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  server.addHook("preHandler", requireAuth);

  // GET /api/tasks — Retrieve current user's tasks with optional project filtering
  server.get("/", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);
      const query = request.query as { projectId?: string };

      let whereCondition = eq(tasks.userId, user.id);

      if (query.projectId) {
        if (query.projectId === "none") {
          whereCondition = and(eq(tasks.userId, user.id), isNull(tasks.projectId))!;
        } else {
          if (!UUID_REGEX.test(query.projectId)) {
            return reply.status(400).send({
              error: "Invalid project ID format",
              code: "INVALID_ID",
            });
          }
          whereCondition = and(
            eq(tasks.userId, user.id),
            eq(tasks.projectId, query.projectId)
          )!;
        }
      }

      const userTasks = await db
        .select({
          id: tasks.id,
          userId: tasks.userId,
          projectId: tasks.projectId,
          projectName: projects.name,
          title: tasks.title,
          status: tasks.status,
          priority: tasks.priority,
          dueDate: tasks.dueDate,
          completedAt: tasks.completedAt,
          createdAt: tasks.createdAt,
          updatedAt: tasks.updatedAt,
        })
        .from(tasks)
        .leftJoin(projects, eq(tasks.projectId, projects.id))
        .where(whereCondition)
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

      const { title, priority, dueDate, projectId } = parseResult.data;

      // SECURITY RULE: Verify that target project belongs to the authenticated user
      let verifiedProjectName: string | null = null;
      if (projectId) {
        const [targetProject] = await db
          .select({ id: projects.id, name: projects.name })
          .from(projects)
          .where(and(eq(projects.id, projectId), eq(projects.userId, user.id)))
          .limit(1);

        if (!targetProject) {
          return reply.status(400).send({
            error: "Project not found or not owned by user",
            code: "INVALID_PROJECT",
          });
        }
        verifiedProjectName = targetProject.name;
      }

      const [newTask] = await db
        .insert(tasks)
        .values({
          userId: user.id, // Strictly server-assigned ownership
          projectId: projectId ?? null,
          title,
          priority,
          dueDate: dueDate ?? null,
          status: "TODO",
        })
        .returning();

      return reply.status(201).send({
        task: {
          ...newTask,
          projectName: verifiedProjectName,
        },
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

      // SECURITY RULE: Verify project ownership if updating projectId
      if (updates.projectId) {
        const [targetProject] = await db
          .select({ id: projects.id })
          .from(projects)
          .where(
            and(
              eq(projects.id, updates.projectId),
              eq(projects.userId, user.id)
            )
          )
          .limit(1);

        if (!targetProject) {
          return reply.status(400).send({
            error: "Project not found or not owned by user",
            code: "INVALID_PROJECT",
          });
        }
      }

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
      if (updates.projectId !== undefined) {
        valuesToUpdate.projectId = updates.projectId;
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

      // Fetch projectName if associated
      let projectName: string | null = null;
      if (updatedTask.projectId) {
        const [proj] = await db
          .select({ name: projects.name })
          .from(projects)
          .where(eq(projects.id, updatedTask.projectId))
          .limit(1);
        projectName = proj?.name ?? null;
      }

      return reply.status(200).send({
        task: {
          ...updatedTask,
          projectName,
        },
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
