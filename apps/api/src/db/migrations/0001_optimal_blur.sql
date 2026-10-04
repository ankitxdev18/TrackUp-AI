CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" varchar(500) NOT NULL,
	"status" varchar(20) DEFAULT 'TODO' NOT NULL,
	"priority" varchar(10) DEFAULT 'MEDIUM' NOT NULL,
	"due_date" varchar(10),
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_user_id_idx" ON "tasks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tasks_user_status_idx" ON "tasks" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "tasks_user_due_date_idx" ON "tasks" USING btree ("user_id","due_date");