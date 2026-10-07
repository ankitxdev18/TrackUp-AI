import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import { requireAuth } from "../auth/authenticate.js";
import { IdentityError, resolveUserIdentity } from "../auth/dev-user.js";
import { db } from "../db/index.js";
import { ideas } from "../db/schema.js";
import {
  createIdeaSchema,
  ideaIdParamSchema,
  ideaListQuerySchema,
  updateIdeaSchema,
} from "../ideas/idea.schema.js";

export const ideasRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  // Enforce session authentication on all ideas endpoints
  server.addHook("preHandler", requireAuth);

  // GET /api/ideas — List current user's ideas with status filtering (defaults to ACTIVE)
  server.get("/", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const queryResult = ideaListQuerySchema.safeParse(request.query);
      if (!queryResult.success) {
        return reply.status(400).send({
          error: "Invalid status filter. Must be one of: ACTIVE, ARCHIVED",
          code: "INVALID_STATUS",
        });
      }

      const statusFilter = queryResult.data.status ?? "ACTIVE";

      const userIdeas = await db
        .select()
        .from(ideas)
        .where(
          and(
            eq(ideas.userId, user.id),
            eq(ideas.status, statusFilter)
          )
        )
        .orderBy(desc(ideas.createdAt));

      return reply.status(200).send({
        ideas: userIdeas,
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error("Failed to list ideas");
      return reply.status(500).send({
        error: "An unexpected error occurred while retrieving ideas",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // GET /api/ideas/:id — Retrieve single idea details strictly scoped to current user
  server.get("/:id", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const paramResult = ideaIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.status(400).send({
          error: "Invalid idea ID format",
          code: "INVALID_ID",
        });
      }

      const { id } = paramResult.data;

      const [idea] = await db
        .select()
        .from(ideas)
        .where(
          and(
            eq(ideas.id, id),
            eq(ideas.userId, user.id)
          )
        )
        .limit(1);

      if (!idea) {
        return reply.status(404).send({
          error: "Idea not found",
          code: "NOT_FOUND",
        });
      }

      return reply.status(200).send({
        idea,
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error("Failed to get idea by id");
      return reply.status(500).send({
        error: "An unexpected error occurred while retrieving the idea",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // POST /api/ideas — Create a new idea strictly owned by current user
  server.post("/", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const parseResult = createIdeaSchema.safeParse(request.body);
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

      const [newIdea] = await db
        .insert(ideas)
        .values({
          userId: user.id, // Strictly server-assigned ownership
          title,
          description: description ?? null,
          status: "ACTIVE", // Strictly server-enforced initial status
        })
        .returning();

      return reply.status(201).send({
        idea: newIdea,
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error("Failed to create idea");
      return reply.status(500).send({
        error: "An unexpected error occurred while creating the idea",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // PATCH /api/ideas/:id — Update existing idea strictly owned by current user
  server.patch("/:id", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const paramResult = ideaIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.status(400).send({
          error: "Invalid idea ID format",
          code: "INVALID_ID",
        });
      }

      const { id } = paramResult.data;

      const parseResult = updateIdeaSchema.safeParse(request.body);
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

      const { title, description, status } = parseResult.data;

      // Ownership-scoped existence verification
      const [existing] = await db
        .select({ id: ideas.id })
        .from(ideas)
        .where(
          and(
            eq(ideas.id, id),
            eq(ideas.userId, user.id)
          )
        )
        .limit(1);

      if (!existing) {
        return reply.status(404).send({
          error: "Idea not found",
          code: "NOT_FOUND",
        });
      }

      const updateData: {
        title?: string;
        description?: string | null;
        status?: "ACTIVE" | "ARCHIVED";
        updatedAt: Date;
      } = {
        updatedAt: new Date(),
      };

      if (title !== undefined) {
        updateData.title = title;
      }

      if (description !== undefined) {
        updateData.description = description;
      }

      if (status !== undefined) {
        updateData.status = status;
      }

      const [updatedIdea] = await db
        .update(ideas)
        .set(updateData)
        .where(
          and(
            eq(ideas.id, id),
            eq(ideas.userId, user.id)
          )
        )
        .returning();

      return reply.status(200).send({
        idea: updatedIdea,
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error("Failed to update idea");
      return reply.status(500).send({
        error: "An unexpected error occurred while updating the idea",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // DELETE /api/ideas/:id — Delete existing idea strictly owned by current user
  server.delete("/:id", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const paramResult = ideaIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.status(400).send({
          error: "Invalid idea ID format",
          code: "INVALID_ID",
        });
      }

      const { id } = paramResult.data;

      const deleted = await db
        .delete(ideas)
        .where(
          and(
            eq(ideas.id, id),
            eq(ideas.userId, user.id)
          )
        )
        .returning({ id: ideas.id });

      if (deleted.length === 0) {
        return reply.status(404).send({
          error: "Idea not found",
          code: "NOT_FOUND",
        });
      }

      return reply.status(200).send({
        success: true,
        message: "Idea deleted successfully",
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error("Failed to delete idea");
      return reply.status(500).send({
        error: "An unexpected error occurred while deleting the idea",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });
};
