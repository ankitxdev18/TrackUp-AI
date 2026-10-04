import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { registerSchema } from "../auth/auth.schema.js";
import { hashPassword } from "../auth/password.js";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";

interface DatabaseError extends Error {
  code?: string;
  constraint?: string;
  cause?: {
    code?: string;
    constraint?: string;
  };
}

export const authRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  server.post("/register", async (request, reply) => {
    // 1. Validate request body against registration schema
    const parseResult = registerSchema.safeParse(request.body);

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

    const { name, email, password } = parseResult.data;

    try {
      // 2. Hash plaintext password using Argon2id with a fresh 16-byte salt
      const passwordHash = await hashPassword(password);

      // 3. Atomically persist user with normalized email
      const [newUser] = await db
        .insert(users)
        .values({
          name,
          email, // Normalized (trimmed and lowercased by registerSchema)
          passwordHash,
        })
        .returning({
          id: users.id,
          email: users.email,
          name: users.name,
        });

      // 4. Return successful account creation response with safe user payload
      return reply.status(201).send({
        user: {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
        },
      });
    } catch (err: unknown) {
      const dbErr = err as DatabaseError;
      const errorCode = dbErr.cause?.code ?? dbErr.code;
      const constraintName = dbErr.cause?.constraint ?? dbErr.constraint;

      // Handle duplicate email collision cleanly via unique constraint
      if (
        errorCode === "23505" ||
        constraintName === "users_email_unique_idx"
      ) {
        return reply.status(409).send({
          error: "An account with this email address already exists.",
          code: "EMAIL_ALREADY_EXISTS",
        });
      }

      // Safe fallback for unexpected server/database errors
      server.log.error("Registration failed due to an unexpected error");
      return reply.status(500).send({
        error: "An unexpected error occurred during registration",
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  });
};
