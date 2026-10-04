import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { and, desc, eq, sql } from "drizzle-orm";
import { IdentityError, resolveUserIdentity } from "../auth/dev-user.js";
import { db } from "../db/index.js";
import { projects, tasks } from "../db/schema.js";
import {
  createProjectSchema,
  projectIdParamSchema,
  updateProjectSchema,
} from "../projects/project.schema.js";

export const projectRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  // GET /api/projects — Retrieve current user's projects with aggregated task metrics
  server.get("/", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      // Single SQL aggregation query avoids N+1 queries for task counts and progress
      const userProjects = await db
        .select({
          id: projects.id,
          userId: projects.userId,
          name: projects.name,
          description: projects.description,
          status: projects.status,
          createdAt: projects.createdAt,
          updatedAt: projects.updatedAt,
          taskCount: sql<number>`cast(count(${tasks.id}) as integer)`,
          completedTaskCount: sql<number>`cast(count(case when ${tasks.status} = 'COMPLETED' then 1 end) as integer)`,
        })
        .from(projects)
        .leftJoin(
          tasks,
          and(eq(tasks.projectId, projects.id), eq(tasks.userId, user.id))
        )
        .where(eq(projects.userId, user.id))
        .groupBy(projects.id)
        .orderBy(
          // 'ACTIVE' projects before 'ARCHIVED'
          sql`case when ${projects.status} = 'ACTIVE' then 0 else 1 end`,
          desc(projects.createdAt)
        );

      return reply.status(200).send({
        projects: userProjects,
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error(err, "Failed to list projects");
      return reply.status(500).send({
        error: "An unexpected error occurred while retrieving projects",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // POST /api/projects — Create a new project owned by current user
  server.post("/", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const parseResult = createProjectSchema.safeParse(request.body);
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

      const { name, description } = parseResult.data;

      const [newProject] = await db
        .insert(projects)
        .values({
          userId: user.id, // Strictly server-assigned ownership
          name,
          description: description ?? null,
          status: "ACTIVE",
        })
        .returning();

      return reply.status(201).send({
        project: {
          ...newProject,
          taskCount: 0,
          completedTaskCount: 0,
        },
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error(err, "Failed to create project");
      return reply.status(500).send({
        error: "An unexpected error occurred while creating the project",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // GET /api/projects/:id — Retrieve single project details with its tasks
  server.get("/:id", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const paramResult = projectIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.status(400).send({
          error: "Invalid project ID format",
          code: "INVALID_ID",
        });
      }

      const projectId = paramResult.data.id;

      // Scoped strictly to both project ID and user ID
      const [project] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.userId, user.id)))
        .limit(1);

      if (!project) {
        return reply.status(404).send({
          error: "Project not found",
          code: "PROJECT_NOT_FOUND",
        });
      }

      // Retrieve tasks belonging to this project (also scoped to user.id)
      const projectTasks = await db
        .select()
        .from(tasks)
        .where(and(eq(tasks.projectId, projectId), eq(tasks.userId, user.id)))
        .orderBy(
          desc(tasks.status),
          desc(tasks.createdAt)
        );

      const taskCount = projectTasks.length;
      const completedTaskCount = projectTasks.filter(
        (t) => t.status === "COMPLETED"
      ).length;

      return reply.status(200).send({
        project: {
          ...project,
          taskCount,
          completedTaskCount,
        },
        tasks: projectTasks,
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error(err, "Failed to get project");
      return reply.status(500).send({
        error: "An unexpected error occurred while retrieving the project",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // PATCH /api/projects/:id — Update project metadata or archive status
  server.patch("/:id", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const paramResult = projectIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.status(400).send({
          error: "Invalid project ID format",
          code: "INVALID_ID",
        });
      }

      const bodyResult = updateProjectSchema.safeParse(request.body);
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

      const projectId = paramResult.data.id;
      const updates = bodyResult.data;

      const valuesToUpdate: Partial<typeof projects.$inferInsert> = {
        updatedAt: new Date(),
      };

      if (updates.name !== undefined) {
        valuesToUpdate.name = updates.name;
      }
      if (updates.description !== undefined) {
        valuesToUpdate.description = updates.description;
      }
      if (updates.status !== undefined) {
        valuesToUpdate.status = updates.status;
      }

      // Safe update scoped strictly to user ID and project ID (prevents IDOR)
      const [updatedProject] = await db
        .update(projects)
        .set(valuesToUpdate)
        .where(and(eq(projects.id, projectId), eq(projects.userId, user.id)))
        .returning();

      if (!updatedProject) {
        return reply.status(404).send({
          error: "Project not found",
          code: "PROJECT_NOT_FOUND",
        });
      }

      return reply.status(200).send({
        project: updatedProject,
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error(err, "Failed to update project");
      return reply.status(500).send({
        error: "An unexpected error occurred while updating the project",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // DELETE /api/projects/:id — Safe delete project: detaches tasks rather than cascading
  server.delete("/:id", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const paramResult = projectIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.status(400).send({
          error: "Invalid project ID format",
          code: "INVALID_ID",
        });
      }

      const projectId = paramResult.data.id;

      // First verify project exists and is owned by this user
      const [existingProject] = await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.userId, user.id)))
        .limit(1);

      if (!existingProject) {
        return reply.status(404).send({
          error: "Project not found",
          code: "PROJECT_NOT_FOUND",
        });
      }

      // Explicitly detach all tasks belonging to this project (setting projectId = NULL)
      // This guarantees no accidental task deletion occurs
      await db
        .update(tasks)
        .set({ projectId: null, updatedAt: new Date() })
        .where(and(eq(tasks.projectId, projectId), eq(tasks.userId, user.id)));

      // Delete the project
      await db
        .delete(projects)
        .where(and(eq(projects.id, projectId), eq(projects.userId, user.id)));

      return reply.status(200).send({
        success: true,
        id: projectId,
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error(err, "Failed to delete project");
      return reply.status(500).send({
        error: "An unexpected error occurred while deleting the project",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });
};
