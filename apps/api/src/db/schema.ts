import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
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

/**
 * TrackUp Session Entity Schema (Milestone 2.5)
 *
 * Implements server-side session persistence:
 * - id: UUIDv4 primary key
 * - userId: Foreign key reference to users.id with cascade on delete
 * - tokenHash: SHA-256 hash of the 32-byte cryptographically secure random session token (hex, 64 chars)
 * - expiresAt: Expiration timestamp with timezone
 * - createdAt: Creation timestamp with timezone
 * - userAgent: Optional User-Agent metadata
 * - ipAddress: Optional client IP address
 */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    userAgent: varchar("user_agent", { length: 500 }),
    ipAddress: varchar("ip_address", { length: 45 }),
  },
  (table) => [
    uniqueIndex("sessions_token_hash_unique_idx").on(table.tokenHash),
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ]
);

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

/**
 * TrackUp Goal Entity Schema (Milestone 4)
 *
 * Implements high-level outcomes:
 * - id: UUIDv4 primary key
 * - userId: Foreign key reference to users.id with cascade on delete
 * - title: Required goal outcome summary (1-500 chars)
 * - description: Optional narrative description (<= 2000 chars)
 * - status: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED' (default: 'ACTIVE')
 * - progress: Integer 0-100 (default: 0)
 * - targetDate: ISO calendar date 'YYYY-MM-DD' (nullable)
 * - createdAt: Timestamp of creation
 * - updatedAt: Timestamp of last modification
 */
export const goals = pgTable(
  "goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 500 }).notNull(),
    description: varchar("description", { length: 2000 }),
    status: varchar("status", { length: 20 }).default("ACTIVE").notNull(),
    progress: integer("progress").default(0).notNull(),
    targetDate: varchar("target_date", { length: 10 }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("goals_user_id_idx").on(table.userId),
    index("goals_user_status_idx").on(table.userId, table.status),
  ]
);

export type Goal = typeof goals.$inferSelect;
export type NewGoal = typeof goals.$inferInsert;

/**
 * TrackUp Habit Entity Schema (Habits Milestone 1 / H01-A)
 *
 * Implements the enduring habit definition:
 * - id: UUIDv4 primary key
 * - userId: Foreign key reference to users.id with cascade on delete
 * - title: Required habit name (1-255 chars)
 * - description: Optional habit notes/description (<= 1000 chars)
 * - frequency: 'DAILY' (default: 'DAILY')
 * - status: 'ACTIVE' | 'ARCHIVED' (default: 'ACTIVE')
 * - createdAt: Timestamp of creation
 * - updatedAt: Timestamp of last modification
 */
export const habits = pgTable(
  "habits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    description: varchar("description", { length: 1000 }),
    frequency: varchar("frequency", { length: 20 }).default("DAILY").notNull(),
    status: varchar("status", { length: 20 }).default("ACTIVE").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("habits_user_id_idx").on(table.userId),
    index("habits_user_status_idx").on(table.userId, table.status),
  ]
);

export type Habit = typeof habits.$inferSelect;
export type NewHabit = typeof habits.$inferInsert;

/**
 * TrackUp Habit Completion Entity Schema (Habits Milestone 1 / H01-A)
 *
 * Implements discrete calendar-day completion events:
 * - id: UUIDv4 primary key
 * - habitId: Foreign key reference to habits.id with cascade on delete
 * - userId: Foreign key reference to users.id with cascade on delete
 * - completedDate: ISO calendar date string 'YYYY-MM-DD'
 * - completedAt: Timestamp of completion with timezone
 * - createdAt: Timestamp of record creation
 */
export const habitCompletions = pgTable(
  "habit_completions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    habitId: uuid("habit_id")
      .notNull()
      .references(() => habits.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    completedDate: varchar("completed_date", { length: 10 }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("habit_completions_habit_date_unique_idx").on(
      table.habitId,
      table.completedDate
    ),
    index("habit_completions_user_date_idx").on(
      table.userId,
      table.completedDate
    ),
    index("habit_completions_habit_id_idx").on(table.habitId),
  ]
);

export type HabitCompletion = typeof habitCompletions.$inferSelect;
export type NewHabitCompletion = typeof habitCompletions.$inferInsert;

/**
 * TrackUp Journal Entry Entity Schema (Journal Milestone 1 / H02-B)
 *
 * Implements daily reflection and narrative log capture:
 * - id: UUIDv4 primary key
 * - userId: Foreign key reference to users.id with cascade on delete
 * - entryDate: ISO calendar date string 'YYYY-MM-DD' (user-local calendar date)
 * - title: Optional narrative headline/title (<= 255 chars)
 * - content: Markdown/plain text journal narrative body
 * - createdAt: Timestamp of record creation with timezone
 * - updatedAt: Timestamp of last modification with timezone
 */
export const journalEntries = pgTable(
  "journal_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entryDate: varchar("entry_date", { length: 10 }).notNull(),
    title: varchar("title", { length: 255 }),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("journal_entries_user_date_unique_idx").on(
      table.userId,
      table.entryDate
    ),
    index("journal_entries_user_id_idx").on(table.userId),
  ]
);

export type JournalEntry = typeof journalEntries.$inferSelect;
export type NewJournalEntry = typeof journalEntries.$inferInsert;

