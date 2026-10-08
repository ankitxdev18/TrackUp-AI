CREATE TABLE "calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"location" varchar(500),
	"color" varchar(20) DEFAULT 'indigo' NOT NULL,
	"is_all_day" boolean DEFAULT false NOT NULL,
	"start_time" timestamp with time zone,
	"end_time" timestamp with time zone,
	"time_zone" varchar(100),
	"start_date" varchar(10),
	"end_date" varchar(10),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_events_timed_invariant_check" CHECK (("calendar_events"."is_all_day" = true) OR ("calendar_events"."start_time" IS NOT NULL AND "calendar_events"."end_time" IS NOT NULL AND "calendar_events"."start_time" < "calendar_events"."end_time" AND "calendar_events"."start_date" IS NULL AND "calendar_events"."end_date" IS NULL)),
	CONSTRAINT "calendar_events_allday_invariant_check" CHECK (("calendar_events"."is_all_day" = false) OR ("calendar_events"."start_date" IS NOT NULL AND "calendar_events"."end_date" IS NOT NULL AND "calendar_events"."start_date" <= "calendar_events"."end_date" AND "calendar_events"."start_time" IS NULL AND "calendar_events"."end_time" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_events_user_timed_idx" ON "calendar_events" USING btree ("user_id","start_time","end_time");--> statement-breakpoint
CREATE INDEX "calendar_events_user_allday_idx" ON "calendar_events" USING btree ("user_id","start_date","end_date");