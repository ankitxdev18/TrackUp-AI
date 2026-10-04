import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * TrackUp User Entity Schema
 *
 * Implements the core identity root according to the TrackUp authentication architecture:
 * - id: High-entropy UUIDv4 primary key generated via PostgreSQL gen_random_uuid()
 * - email: Normalized, case-insensitively unique account lookup key (length <= 255)
 * - password_hash: Argon2id hash storage (populated in future authentication slices)
 * - name: Display name of the user
 * - is_active: Suspension/lifecycle flag (default true)
 * - created_at: Creation timestamp with timezone
 * - updated_at: Last modification timestamp with timezone
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 255 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("users_email_unique_idx").on(sql`lower(${table.email})`),
  ]
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

/**
 * TrackUp Task Entity Schema (Milestone 2)
 *
 * Implements the first core Life OS execution model:
 * - id: UUIDv4 primary key
 * - userId: Foreign key reference to users.id with cascade on delete
 * - title: Required task summary (1-500 chars)
 * - status: 'TODO' | 'COMPLETED' (default: 'TODO')
 * - priority: 'LOW' | 'MEDIUM' | 'HIGH' (default: 'MEDIUM')
 * - dueDate: ISO calendar date 'YYYY-MM-DD' (nullable)
 * - completedAt: Timestamp of completion (nullable)
 * - createdAt: Timestamp of creation
 * - updatedAt: Timestamp of last modification
 */
export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 500 }).notNull(),
    status: varchar("status", { length: 20 }).default("TODO").notNull(),
    priority: varchar("priority", { length: 10 }).default("MEDIUM").notNull(),
    dueDate: varchar("due_date", { length: 10 }),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("tasks_user_id_idx").on(table.userId),
    index("tasks_user_status_idx").on(table.userId, table.status),
    index("tasks_user_due_date_idx").on(table.userId, table.dueDate),
  ]
);

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
