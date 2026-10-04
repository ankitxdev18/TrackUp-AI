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
 * TrackUp Project Entity Schema (Milestone 3)
 *
 * Implements high-level project initiatives grouping tasks:
 * - id: UUIDv4 primary key
 * - userId: Foreign key reference to users.id with cascade on delete
 * - name: Required project name (1-255 chars)
 * - description: Optional narrative description (<= 1000 chars)
 * - status: 'ACTIVE' | 'ARCHIVED' (default: 'ACTIVE')
 * - createdAt: Timestamp of creation
 * - updatedAt: Timestamp of last modification
 */
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: varchar("description", { length: 1000 }),
    status: varchar("status", { length: 20 }).default("ACTIVE").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("projects_user_id_idx").on(table.userId),
    index("projects_user_status_idx").on(table.userId, table.status),
  ]
);

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

/**
 * TrackUp Task Entity Schema (Milestone 2 & 3)
 *
 * Implements the core Life OS execution model:
 * - id: UUIDv4 primary key
 * - userId: Foreign key reference to users.id with cascade on delete
 * - projectId: Optional foreign key reference to projects.id (set null on delete)
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
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
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
    index("tasks_user_project_idx").on(table.userId, table.projectId),
  ]
);

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;

