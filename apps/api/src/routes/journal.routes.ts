import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import { requireAuth } from "../auth/authenticate.js";
import { IdentityError, resolveUserIdentity } from "../auth/dev-user.js";
import { db } from "../db/index.js";
import { journalEntries } from "../db/schema.js";
import {
  createJournalEntrySchema,
  journalDateParamSchema,
  journalIdParamSchema,
  updateJournalEntrySchema,
} from "../journal/journal.schema.js";

export const journalRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  // Enforce authentication on all journal endpoints
  server.addHook("preHandler", requireAuth);

  // GET /api/journal — List current user's journal entries ordered by entryDate DESC
  server.get("/", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const entries = await db
        .select()
        .from(journalEntries)
        .where(eq(journalEntries.userId, user.id))
        .orderBy(desc(journalEntries.entryDate))
        .limit(100);

      return reply.status(200).send({
        entries,
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error("Failed to list journal entries");
      return reply.status(500).send({
        error: "An unexpected error occurred while retrieving journal entries",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // GET /api/journal/by-date/:date — Retrieve entry by calendar date
  server.get("/by-date/:date", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const paramResult = journalDateParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        const hasInvalidFormat = paramResult.error.issues.some((issue) =>
          issue.message.toLowerCase().includes("valid calendar date")
        );
        const isFuture =
          !hasInvalidFormat &&
          paramResult.error.issues.some((issue) =>
            issue.message.toLowerCase().includes("future")
          );

        return reply.status(400).send({
          error: isFuture
            ? "Date cannot be in the future"
            : "Invalid date format. Must be a valid calendar date in YYYY-MM-DD format",
          code: isFuture ? "FUTURE_DATE" : "INVALID_DATE",
        });
      }

      const { date } = paramResult.data;

      const [entry] = await db
        .select()
        .from(journalEntries)
        .where(
          and(
            eq(journalEntries.userId, user.id),
            eq(journalEntries.entryDate, date)
          )
        )
        .limit(1);

      // Absence of a journal entry is a valid state; return 200 with entry: null
      return reply.status(200).send({
        entry: entry ?? null,
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error("Failed to get journal entry by date");
      return reply.status(500).send({
        error: "An unexpected error occurred while retrieving the journal entry",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // GET /api/journal/:id — Retrieve single journal entry details
  server.get("/:id", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const paramResult = journalIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.status(400).send({
          error: "Invalid journal entry ID format",
          code: "INVALID_ID",
        });
      }

      const { id } = paramResult.data;

      const [entry] = await db
        .select()
        .from(journalEntries)
        .where(
          and(
            eq(journalEntries.id, id),
            eq(journalEntries.userId, user.id)
          )
        )
        .limit(1);

      if (!entry) {
        return reply.status(404).send({
          error: "Journal entry not found",
          code: "NOT_FOUND",
        });
      }

      return reply.status(200).send({
        entry,
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error("Failed to get journal entry by id");
      return reply.status(500).send({
        error: "An unexpected error occurred while retrieving the journal entry",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // POST /api/journal — Create a new journal entry strictly owned by current user
  server.post("/", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const parseResult = createJournalEntrySchema.safeParse(request.body);
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

      const { entryDate, title, content } = parseResult.data;

      // Check for existing entry on this calendar date for this user
      const [existing] = await db
        .select({ id: journalEntries.id })
        .from(journalEntries)
        .where(
          and(
            eq(journalEntries.userId, user.id),
            eq(journalEntries.entryDate, entryDate)
          )
        )
        .limit(1);

      if (existing) {
        return reply.status(409).send({
          error: "Journal entry already exists for this date",
          code: "DUPLICATE_ENTRY_DATE",
        });
      }

      try {
        const [newEntry] = await db
          .insert(journalEntries)
          .values({
            userId: user.id, // Strictly server-assigned ownership
            entryDate,
            title: title ?? null,
            content,
          })
          .returning();

        return reply.status(201).send({
          entry: newEntry,
        });
      } catch (insertErr: unknown) {
        const pgError = (insertErr as { cause?: { code?: string } })?.cause;
        if (pgError?.code === "23505") {
          return reply.status(409).send({
            error: "Journal entry already exists for this date",
            code: "DUPLICATE_ENTRY_DATE",
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

      server.log.error("Failed to create journal entry");
      return reply.status(500).send({
        error: "An unexpected error occurred while creating the journal entry",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // PATCH /api/journal/:id — Update existing journal entry
  server.patch("/:id", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const paramResult = journalIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.status(400).send({
          error: "Invalid journal entry ID format",
          code: "INVALID_ID",
        });
      }

      const { id } = paramResult.data;

      const parseResult = updateJournalEntrySchema.safeParse(request.body);
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

      const { title, content } = parseResult.data;

      // Verify existence and ownership
      const [existing] = await db
        .select()
        .from(journalEntries)
        .where(
          and(
            eq(journalEntries.id, id),
            eq(journalEntries.userId, user.id)
          )
        )
        .limit(1);

      if (!existing) {
        return reply.status(404).send({
          error: "Journal entry not found",
          code: "NOT_FOUND",
        });
      }

      const updateData: {
        title?: string | null;
        content?: string;
        updatedAt: Date;
      } = {
        updatedAt: new Date(),
      };

      if (title !== undefined) {
        updateData.title = title;
      }

      if (content !== undefined) {
        updateData.content = content;
      }

      const [updatedEntry] = await db
        .update(journalEntries)
        .set(updateData)
        .where(
          and(
            eq(journalEntries.id, id),
            eq(journalEntries.userId, user.id)
          )
        )
        .returning();

      return reply.status(200).send({
        entry: updatedEntry,
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error("Failed to update journal entry");
      return reply.status(500).send({
        error: "An unexpected error occurred while updating the journal entry",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  // DELETE /api/journal/:id — Delete existing journal entry
  server.delete("/:id", async (request, reply) => {
    try {
      const user = await resolveUserIdentity(request);

      const paramResult = journalIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.status(400).send({
          error: "Invalid journal entry ID format",
          code: "INVALID_ID",
        });
      }

      const { id } = paramResult.data;

      const deleted = await db
        .delete(journalEntries)
        .where(
          and(
            eq(journalEntries.id, id),
            eq(journalEntries.userId, user.id)
          )
        )
        .returning({ id: journalEntries.id });

      if (deleted.length === 0) {
        return reply.status(404).send({
          error: "Journal entry not found",
          code: "NOT_FOUND",
        });
      }

      return reply.status(200).send({
        success: true,
        message: "Journal entry deleted successfully",
      });
    } catch (err: unknown) {
      if (err instanceof IdentityError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        });
      }

      server.log.error("Failed to delete journal entry");
      return reply.status(500).send({
        error: "An unexpected error occurred while deleting the journal entry",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });
};
