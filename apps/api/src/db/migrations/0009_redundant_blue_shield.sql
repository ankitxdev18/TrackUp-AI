ALTER TABLE "habit_completions" DROP CONSTRAINT "habit_completions_user_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "habit_completions_user_date_idx";--> statement-breakpoint
DROP INDEX "habit_completions_habit_id_idx";--> statement-breakpoint
ALTER TABLE "habit_completions" ALTER COLUMN "completed_date" SET DATA TYPE date USING "completed_date"::date;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "timezone" varchar(100) DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
ALTER TABLE "habit_completions" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "habits" ADD CONSTRAINT "habits_frequency_check" CHECK ("habits"."frequency" = 'DAILY');--> statement-breakpoint
ALTER TABLE "habits" ADD CONSTRAINT "habits_status_check" CHECK ("habits"."status" IN ('ACTIVE', 'ARCHIVED'));