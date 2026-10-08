import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDatabasePool, db } from "../src/db/index.js";
import { calendarEvents, users } from "../src/db/schema.js";

describe("Calendar Events Schema & Database Foundation (Milestone C02)", () => {
  const TEST_DOMAIN = "calendar_db_test.trackup.local";
  let testUserId: string;
  let secondaryUserId: string;

  const cleanup = async () => {
    await db.execute(
      sql`DELETE FROM users WHERE email LIKE ${`%@${TEST_DOMAIN}`}`
    );
  };

  beforeAll(async () => {
    await cleanup();

    // Create primary test user
    const [userA] = await db
      .insert(users)
      .values({
        email: `calendar_owner_${Date.now()}@${TEST_DOMAIN}`,
        passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$dummyhash",
        name: "Calendar Primary User",
      })
      .returning();

    testUserId = userA.id;

    // Create secondary test user for isolation checks
    const [userB] = await db
      .insert(users)
      .values({
        email: `calendar_secondary_${Date.now()}@${TEST_DOMAIN}`,
        passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$dummyhash",
        name: "Calendar Secondary User",
      })
      .returning();

    secondaryUserId = userB.id;
  });

  afterAll(async () => {
    await cleanup();
    await closeDatabasePool();
  });

  // ==========================================
  // METADATA, STRUCTURE & SCOPE BOUNDARIES
  // ==========================================
  describe("Table Metadata, Structure & Scope Isolation", () => {
    it("verifies the calendar_events table exists in the public schema", async () => {
      const result = await db.execute(
        sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'calendar_events'`
      );
      expect(result.rows.length).toBe(1);
      expect(result.rows[0]?.table_name).toBe("calendar_events");
    });

    it("verifies expected columns, data types, nullability, and absence of speculative fields", async () => {
      const result = await db.execute(
        sql`SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'calendar_events' 
            ORDER BY ordinal_position`
      );

      const columns = new Map(
        result.rows.map((r) => [
          r.column_name as string,
          {
            dataType: r.data_type as string,
            isNullable: r.is_nullable as string,
            columnDefault: r.column_default as string | null,
          },
        ])
      );

      // Verify all 14 MVP columns
      expect(columns.has("id")).toBe(true);
      expect(columns.get("id")?.dataType).toBe("uuid");
      expect(columns.get("id")?.isNullable).toBe("NO");

      expect(columns.has("user_id")).toBe(true);
      expect(columns.get("user_id")?.dataType).toBe("uuid");
      expect(columns.get("user_id")?.isNullable).toBe("NO");

      expect(columns.has("title")).toBe(true);
      expect(columns.get("title")?.dataType).toBe("character varying");
      expect(columns.get("title")?.isNullable).toBe("NO");

      expect(columns.has("description")).toBe(true);
      expect(columns.get("description")?.dataType).toBe("text");
      expect(columns.get("description")?.isNullable).toBe("YES");

      expect(columns.has("location")).toBe(true);
      expect(columns.get("location")?.dataType).toBe("character varying");
      expect(columns.get("location")?.isNullable).toBe("YES");

      expect(columns.has("color")).toBe(true);
      expect(columns.get("color")?.dataType).toBe("character varying");
      expect(columns.get("color")?.isNullable).toBe("NO");
      expect(columns.get("color")?.columnDefault).toContain("indigo");

      expect(columns.has("is_all_day")).toBe(true);
      expect(columns.get("is_all_day")?.dataType).toBe("boolean");
      expect(columns.get("is_all_day")?.isNullable).toBe("NO");
      expect(columns.get("is_all_day")?.columnDefault).toContain("false");

      expect(columns.has("start_time")).toBe(true);
      expect(columns.get("start_time")?.dataType).toBe("timestamp with time zone");
      expect(columns.get("start_time")?.isNullable).toBe("YES");

      expect(columns.has("end_time")).toBe(true);
      expect(columns.get("end_time")?.dataType).toBe("timestamp with time zone");
      expect(columns.get("end_time")?.isNullable).toBe("YES");

      expect(columns.has("time_zone")).toBe(true);
      expect(columns.get("time_zone")?.dataType).toBe("character varying");
      expect(columns.get("time_zone")?.isNullable).toBe("YES");

      expect(columns.has("start_date")).toBe(true);
      expect(columns.get("start_date")?.dataType).toBe("character varying");
      expect(columns.get("start_date")?.isNullable).toBe("YES");

      expect(columns.has("end_date")).toBe(true);
      expect(columns.get("end_date")?.dataType).toBe("character varying");
      expect(columns.get("end_date")?.isNullable).toBe("YES");

      expect(columns.has("created_at")).toBe(true);
      expect(columns.get("created_at")?.dataType).toBe("timestamp with time zone");
      expect(columns.get("created_at")?.isNullable).toBe("NO");

      expect(columns.has("updated_at")).toBe(true);
      expect(columns.get("updated_at")?.dataType).toBe("timestamp with time zone");
      expect(columns.get("updated_at")?.isNullable).toBe("NO");

      // Verify strict absence of speculative fields (scope boundary)
      expect(columns.has("project_id")).toBe(false);
      expect(columns.has("task_id")).toBe(false);
      expect(columns.has("status")).toBe(false);
      expect(columns.has("completed")).toBe(false);
      expect(columns.has("archived")).toBe(false);
      expect(columns.has("cancelled")).toBe(false);
      expect(columns.has("draft")).toBe(false);
      expect(columns.has("recurrence")).toBe(false);
      expect(columns.has("reminder")).toBe(false);
    });

    it("verifies required indexes exist on calendar_events", async () => {
      const result = await db.execute(
        sql`SELECT indexname, indexdef 
            FROM pg_indexes 
            WHERE tablename = 'calendar_events'`
      );

      const indexes = new Map(
        result.rows.map((r) => [r.indexname as string, r.indexdef as string])
      );

      // Primary key index
      expect(indexes.has("calendar_events_pkey")).toBe(true);

      // Timed events index: (user_id, start_time, end_time)
      expect(indexes.has("calendar_events_user_timed_idx")).toBe(true);
      const timedDef = indexes.get("calendar_events_user_timed_idx");
      expect(timedDef).toContain("user_id");
      expect(timedDef).toContain("start_time");
      expect(timedDef).toContain("end_time");

      // All-day events index: (user_id, start_date, end_date)
      expect(indexes.has("calendar_events_user_allday_idx")).toBe(true);
      const alldayDef = indexes.get("calendar_events_user_allday_idx");
      expect(alldayDef).toContain("user_id");
      expect(alldayDef).toContain("start_date");
      expect(alldayDef).toContain("end_date");
    });
  });

  // ==========================================
  // MANDATORY SPECIFICATION TESTS (1 to 30)
  // ==========================================
  describe("Specification Test Requirements (1–30)", () => {
    it("1. Calendar event can be inserted", async () => {
      const start = new Date("2026-11-01T09:00:00Z");
      const end = new Date("2026-11-01T10:00:00Z");

      const [event] = await db
        .insert(calendarEvents)
        .values({
          userId: testUserId,
          title: "Sprint Planning",
          startTime: start,
          endTime: end,
        })
        .returning();

      expect(event).toBeDefined();
      expect(event.title).toBe("Sprint Planning");
    });

    it("2. UUID is generated", async () => {
      const start = new Date("2026-11-01T10:00:00Z");
      const end = new Date("2026-11-01T11:00:00Z");

      const [event] = await db
        .insert(calendarEvents)
        .values({
          userId: testUserId,
          title: "Architecture Review",
          startTime: start,
          endTime: end,
        })
        .returning();

      expect(event.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it("3. userId FK works", async () => {
      const fakeUserId = "00000000-0000-0000-0000-000000000000";
      const start = new Date("2026-11-01T11:00:00Z");
      const end = new Date("2026-11-01T12:00:00Z");

      try {
        await db.insert(calendarEvents).values({
          userId: fakeUserId,
          title: "Orphan Event",
          startTime: start,
          endTime: end,
        });
        expect.unreachable("Should have failed foreign key constraint on user_id");
      } catch (err: unknown) {
        const pgError = (err as { cause?: { code?: string } })?.cause;
        expect(pgError?.code).toBe("23503"); // foreign_key_violation
      }
    });

    it("4. User deletion cascades calendar events", async () => {
      // Create ephemeral user
      const [ephemeralUser] = await db
        .insert(users)
        .values({
          email: `cascade_user_${Date.now()}@${TEST_DOMAIN}`,
          passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$dummyhash",
          name: "Cascade User",
        })
        .returning();

      // Insert 2 events for ephemeral user
      await db.insert(calendarEvents).values({
        userId: ephemeralUser.id,
        title: "Ephemeral Event 1",
        startTime: new Date("2026-11-01T13:00:00Z"),
        endTime: new Date("2026-11-01T14:00:00Z"),
      });

      await db.insert(calendarEvents).values({
        userId: ephemeralUser.id,
        title: "Ephemeral Event 2",
        isAllDay: true,
        startDate: "2026-11-02",
        endDate: "2026-11-02",
      });

      const beforeDelete = await db
        .select()
        .from(calendarEvents)
        .where(sql`user_id = ${ephemeralUser.id}`);
      expect(beforeDelete.length).toBe(2);

      // Delete user
      await db.delete(users).where(sql`id = ${ephemeralUser.id}`);

      // Verify cascade
      const afterDelete = await db
        .select()
        .from(calendarEvents)
        .where(sql`user_id = ${ephemeralUser.id}`);
      expect(afterDelete.length).toBe(0);
    });

    it("5. Title is required", async () => {
      try {
        await db.execute(
          sql`INSERT INTO calendar_events (user_id, is_all_day, start_date, end_date) 
              VALUES (${testUserId}, true, '2026-11-03', '2026-11-03')`
        );
        expect.unreachable("Should have failed NOT NULL violation on title");
      } catch (err: unknown) {
        const pgError = (err as { cause?: { code?: string } })?.cause;
        expect(pgError?.code).toBe("23502"); // not_null_violation
      }
    });

    it("6. Description may be null", async () => {
      const [event] = await db
        .insert(calendarEvents)
        .values({
          userId: testUserId,
          title: "No Description Event",
          description: null,
          startTime: new Date("2026-11-01T15:00:00Z"),
          endTime: new Date("2026-11-01T16:00:00Z"),
        })
        .returning();

      expect(event.description).toBeNull();
    });

    it("7. Location may be null", async () => {
      const [event] = await db
        .insert(calendarEvents)
        .values({
          userId: testUserId,
          title: "No Location Event",
          location: null,
          startTime: new Date("2026-11-01T16:00:00Z"),
          endTime: new Date("2026-11-01T17:00:00Z"),
        })
        .returning();

      expect(event.location).toBeNull();
    });

    it("8. Default color is indigo", async () => {
      const [event] = await db
        .insert(calendarEvents)
        .values({
          userId: testUserId,
          title: "Default Color Event",
          startTime: new Date("2026-11-01T17:00:00Z"),
          endTime: new Date("2026-11-01T18:00:00Z"),
        })
        .returning();

      expect(event.color).toBe("indigo");
    });

    it("9. Default isAllDay is false", async () => {
      const [event] = await db
        .insert(calendarEvents)
        .values({
          userId: testUserId,
          title: "Default isAllDay Event",
          startTime: new Date("2026-11-01T18:00:00Z"),
          endTime: new Date("2026-11-01T19:00:00Z"),
        })
        .returning();

      expect(event.isAllDay).toBe(false);
    });

    it("10. Timed event stores startTime/endTime correctly", async () => {
      const start = new Date("2026-11-05T08:30:00.000Z");
      const end = new Date("2026-11-05T09:45:00.000Z");

      const [event] = await db
        .insert(calendarEvents)
        .values({
          userId: testUserId,
          title: "Precision Timed Event",
          startTime: start,
          endTime: end,
        })
        .returning();

      expect(event.startTime).toBeInstanceOf(Date);
      expect(event.endTime).toBeInstanceOf(Date);
      expect(event.startTime?.toISOString()).toBe(start.toISOString());
      expect(event.endTime?.toISOString()).toBe(end.toISOString());
    });

    it("11. Timed event stores timeZone correctly", async () => {
      const start = new Date("2026-11-05T10:00:00Z");
      const end = new Date("2026-11-05T11:00:00Z");
      const tz = "Asia/Kolkata";

      const [event] = await db
        .insert(calendarEvents)
        .values({
          userId: testUserId,
          title: "Timezone Annotated Event",
          startTime: start,
          endTime: end,
          timeZone: tz,
        })
        .returning();

      expect(event.timeZone).toBe("Asia/Kolkata");
    });

    it("12. All-day event stores startDate/endDate exactly", async () => {
      const [event] = await db
        .insert(calendarEvents)
        .values({
          userId: testUserId,
          title: "Multi-Day Conference",
          isAllDay: true,
          startDate: "2026-11-10",
          endDate: "2026-11-12",
        })
        .returning();

      expect(event.isAllDay).toBe(true);
      expect(event.startDate).toBe("2026-11-10");
      expect(event.endDate).toBe("2026-11-12");
      expect(event.startTime).toBeNull();
      expect(event.endTime).toBeNull();
    });

    it("13. All-day dates do not undergo timezone conversion", async () => {
      const [event] = await db
        .insert(calendarEvents)
        .values({
          userId: testUserId,
          title: "Year End Boundary Event",
          isAllDay: true,
          startDate: "2026-12-31",
          endDate: "2027-01-01",
        })
        .returning();

      // Query raw text values directly from PostgreSQL
      const rawRes = await db.execute(
        sql`SELECT start_date, end_date FROM calendar_events WHERE id = ${event.id}`
      );
      expect(rawRes.rows[0]?.start_date).toBe("2026-12-31");
      expect(rawRes.rows[0]?.end_date).toBe("2027-01-01");

      // Verify no timestamp shifting occurred
      expect(event.startDate).toBe("2026-12-31");
      expect(event.endDate).toBe("2027-01-01");
    });

    it("14. Timed event cannot have missing startTime", async () => {
      try {
        await db.insert(calendarEvents).values({
          userId: testUserId,
          title: "Missing Start Time",
          isAllDay: false,
          endTime: new Date("2026-11-01T10:00:00Z"),
        });
        expect.unreachable("Should have failed check constraint on missing startTime");
      } catch (err: unknown) {
        const pgError = (err as { cause?: { code?: string } })?.cause;
        expect(pgError?.code).toBe("23514"); // check_violation
      }
    });

    it("15. Timed event cannot have missing endTime", async () => {
      try {
        await db.insert(calendarEvents).values({
          userId: testUserId,
          title: "Missing End Time",
          isAllDay: false,
          startTime: new Date("2026-11-01T09:00:00Z"),
        });
        expect.unreachable("Should have failed check constraint on missing endTime");
      } catch (err: unknown) {
        const pgError = (err as { cause?: { code?: string } })?.cause;
        expect(pgError?.code).toBe("23514"); // check_violation
      }
    });

    it("16. Timed event cannot have startTime >= endTime", async () => {
      const sameTime = new Date("2026-11-01T10:00:00Z");

      // Test equality (startTime = endTime)
      try {
        await db.insert(calendarEvents).values({
          userId: testUserId,
          title: "Zero Duration Event",
          isAllDay: false,
          startTime: sameTime,
          endTime: sameTime,
        });
        expect.unreachable("Should have failed check constraint on startTime = endTime");
      } catch (err: unknown) {
        const pgError = (err as { cause?: { code?: string } })?.cause;
        expect(pgError?.code).toBe("23514"); // check_violation
      }

      // Test negative duration (startTime > endTime)
      try {
        await db.insert(calendarEvents).values({
          userId: testUserId,
          title: "Negative Duration Event",
          isAllDay: false,
          startTime: new Date("2026-11-01T11:00:00Z"),
          endTime: new Date("2026-11-01T10:00:00Z"),
        });
        expect.unreachable("Should have failed check constraint on startTime > endTime");
      } catch (err: unknown) {
        const pgError = (err as { cause?: { code?: string } })?.cause;
        expect(pgError?.code).toBe("23514"); // check_violation
      }
    });

    it("17. Timed event cannot contain startDate/endDate", async () => {
      try {
        await db.insert(calendarEvents).values({
          userId: testUserId,
          title: "Timed Event With startDate",
          isAllDay: false,
          startTime: new Date("2026-11-01T09:00:00Z"),
          endTime: new Date("2026-11-01T10:00:00Z"),
          startDate: "2026-11-01",
        });
        expect.unreachable("Should have failed check constraint when timed event contains startDate");
      } catch (err: unknown) {
        const pgError = (err as { cause?: { code?: string } })?.cause;
        expect(pgError?.code).toBe("23514"); // check_violation
      }

      try {
        await db.insert(calendarEvents).values({
          userId: testUserId,
          title: "Timed Event With endDate",
          isAllDay: false,
          startTime: new Date("2026-11-01T09:00:00Z"),
          endTime: new Date("2026-11-01T10:00:00Z"),
          endDate: "2026-11-01",
        });
        expect.unreachable("Should have failed check constraint when timed event contains endDate");
      } catch (err: unknown) {
        const pgError = (err as { cause?: { code?: string } })?.cause;
        expect(pgError?.code).toBe("23514"); // check_violation
      }
    });

    it("18. All-day event cannot contain startTime/endTime", async () => {
      try {
        await db.insert(calendarEvents).values({
          userId: testUserId,
          title: "All-Day Event With startTime",
          isAllDay: true,
          startDate: "2026-11-01",
          endDate: "2026-11-01",
          startTime: new Date("2026-11-01T09:00:00Z"),
        });
        expect.unreachable("Should have failed check constraint when all-day event contains startTime");
      } catch (err: unknown) {
        const pgError = (err as { cause?: { code?: string } })?.cause;
        expect(pgError?.code).toBe("23514"); // check_violation
      }

      try {
        await db.insert(calendarEvents).values({
          userId: testUserId,
          title: "All-Day Event With endTime",
          isAllDay: true,
          startDate: "2026-11-01",
          endDate: "2026-11-01",
          endTime: new Date("2026-11-01T10:00:00Z"),
        });
        expect.unreachable("Should have failed check constraint when all-day event contains endTime");
      } catch (err: unknown) {
        const pgError = (err as { cause?: { code?: string } })?.cause;
        expect(pgError?.code).toBe("23514"); // check_violation
      }
    });

    it("19. All-day event cannot have missing startDate", async () => {
      try {
        await db.insert(calendarEvents).values({
          userId: testUserId,
          title: "Missing startDate",
          isAllDay: true,
          endDate: "2026-11-01",
        });
        expect.unreachable("Should have failed check constraint on missing startDate");
      } catch (err: unknown) {
        const pgError = (err as { cause?: { code?: string } })?.cause;
        expect(pgError?.code).toBe("23514"); // check_violation
      }
    });

    it("20. All-day event cannot have missing endDate", async () => {
      try {
        await db.insert(calendarEvents).values({
          userId: testUserId,
          title: "Missing endDate",
          isAllDay: true,
          startDate: "2026-11-01",
        });
        expect.unreachable("Should have failed check constraint on missing endDate");
      } catch (err: unknown) {
        const pgError = (err as { cause?: { code?: string } })?.cause;
        expect(pgError?.code).toBe("23514"); // check_violation
      }
    });

    it("21. All-day event cannot have endDate before startDate", async () => {
      try {
        await db.insert(calendarEvents).values({
          userId: testUserId,
          title: "Inverted Date Order",
          isAllDay: true,
          startDate: "2026-11-05",
          endDate: "2026-11-04",
        });
        expect.unreachable("Should have failed check constraint on endDate < startDate");
      } catch (err: unknown) {
        const pgError = (err as { cause?: { code?: string } })?.cause;
        expect(pgError?.code).toBe("23514"); // check_violation
      }

      // Exact single day (startDate = endDate) is valid
      const [singleDay] = await db
        .insert(calendarEvents)
        .values({
          userId: testUserId,
          title: "Single Day All-Day",
          isAllDay: true,
          startDate: "2026-11-05",
          endDate: "2026-11-05",
        })
        .returning();
      expect(singleDay.startDate).toBe("2026-11-05");
      expect(singleDay.endDate).toBe("2026-11-05");
    });

    it("22. Two different users may create events with identical titles and times", async () => {
      const start = new Date("2026-11-15T14:00:00Z");
      const end = new Date("2026-11-15T15:00:00Z");

      const [userAEvent] = await db
        .insert(calendarEvents)
        .values({
          userId: testUserId,
          title: "Global Team Sync",
          startTime: start,
          endTime: end,
        })
        .returning();

      const [userBEvent] = await db
        .insert(calendarEvents)
        .values({
          userId: secondaryUserId,
          title: "Global Team Sync",
          startTime: start,
          endTime: end,
        })
        .returning();

      expect(userAEvent.id).not.toBe(userBEvent.id);
      expect(userAEvent.title).toBe(userBEvent.title);
      expect(userAEvent.startTime?.toISOString()).toBe(userBEvent.startTime?.toISOString());
      expect(userAEvent.userId).toBe(testUserId);
      expect(userBEvent.userId).toBe(secondaryUserId);
    });

    it("23. Events belonging to different users remain isolated", async () => {
      const userAEvents = await db
        .select()
        .from(calendarEvents)
        .where(sql`user_id = ${testUserId}`);

      const userBEvents = await db
        .select()
        .from(calendarEvents)
        .where(sql`user_id = ${secondaryUserId}`);

      const userAIds = userAEvents.map((e) => e.id);
      const userBIds = userBEvents.map((e) => e.id);

      expect(userAIds.length).toBeGreaterThan(0);
      expect(userBIds.length).toBeGreaterThan(0);

      // Verify complete partition
      for (const id of userAIds) {
        expect(userBIds).not.toContain(id);
      }
      for (const id of userBIds) {
        expect(userAIds).not.toContain(id);
      }
    });

    it("24. Unicode title/description/location values are preserved", async () => {
      const unicodeTitle = "वार्षिक समीक्षा & 전략 회의 🎯";
      const unicodeLocation = "कमरा 402, 渋谷スクランブルスクエア (Tokyo & Online)";
      const unicodeDescription = "Café & Crêpes discussion: « L'excellence n'est pas un acte, c'est une habitude »";

      const [event] = await db
        .insert(calendarEvents)
        .values({
          userId: testUserId,
          title: unicodeTitle,
          location: unicodeLocation,
          description: unicodeDescription,
          isAllDay: true,
          startDate: "2026-12-01",
          endDate: "2026-12-01",
        })
        .returning();

      const [fetched] = await db
        .select()
        .from(calendarEvents)
        .where(sql`id = ${event.id}`);

      expect(fetched?.title).toBe(unicodeTitle);
      expect(fetched?.location).toBe(unicodeLocation);
      expect(fetched?.description).toBe(unicodeDescription);
    });

    it("25. Multiline description is preserved", async () => {
      const multilineText = [
        "### Meeting Agenda",
        "1. Welcome & Icebreaker",
        "2. Technical Roadmap Review",
        "   - Postgres Check Constraints",
        "   - Calendar MVP Invariants",
        "3. Action Items Allocation",
        "",
        "Notes from last week: All systems operational.",
      ].join("\n");

      const [event] = await db
        .insert(calendarEvents)
        .values({
          userId: testUserId,
          title: "Agenda Meeting",
          description: multilineText,
          startTime: new Date("2026-11-20T10:00:00Z"),
          endTime: new Date("2026-11-20T11:00:00Z"),
        })
        .returning();

      const [fetched] = await db
        .select()
        .from(calendarEvents)
        .where(sql`id = ${event.id}`);

      expect(fetched?.description).toBe(multilineText);
    });

    it("26. createdAt is generated", async () => {
      const before = new Date(Date.now() - 1000);

      const [event] = await db
        .insert(calendarEvents)
        .values({
          userId: testUserId,
          title: "Created At Verification",
          isAllDay: true,
          startDate: "2026-11-22",
          endDate: "2026-11-22",
        })
        .returning();

      const after = new Date(Date.now() + 1000);

      expect(event.createdAt).toBeInstanceOf(Date);
      expect(event.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(event.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it("27. updatedAt is generated", async () => {
      const before = new Date(Date.now() - 1000);

      const [event] = await db
        .insert(calendarEvents)
        .values({
          userId: testUserId,
          title: "Updated At Verification",
          isAllDay: true,
          startDate: "2026-11-23",
          endDate: "2026-11-23",
        })
        .returning();

      const after = new Date(Date.now() + 1000);

      expect(event.updatedAt).toBeInstanceOf(Date);
      expect(event.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(event.updatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it("28. Updating an event does not automatically modify createdAt", async () => {
      const [initialEvent] = await db
        .insert(calendarEvents)
        .values({
          userId: testUserId,
          title: "Original Title For Update Check",
          isAllDay: true,
          startDate: "2026-11-24",
          endDate: "2026-11-24",
        })
        .returning();

      const initialCreatedAt = initialEvent.createdAt.getTime();

      const [updatedEvent] = await db
        .update(calendarEvents)
        .set({ title: "Updated Title After Edit" })
        .where(sql`id = ${initialEvent.id}`)
        .returning();

      expect(updatedEvent.title).toBe("Updated Title After Edit");
      expect(updatedEvent.createdAt.getTime()).toBe(initialCreatedAt);
    });

    it("29. updatedAt can be explicitly updated by later application logic", async () => {
      const [initialEvent] = await db
        .insert(calendarEvents)
        .values({
          userId: testUserId,
          title: "Title Before Timestamp Update",
          isAllDay: true,
          startDate: "2026-11-25",
          endDate: "2026-11-25",
        })
        .returning();

      const newTimestamp = new Date(Date.now() + 60000);

      const [updatedEvent] = await db
        .update(calendarEvents)
        .set({
          title: "Title After Explicit Timestamp Update",
          updatedAt: newTimestamp,
        })
        .where(sql`id = ${initialEvent.id}`)
        .returning();

      expect(updatedEvent.updatedAt.getTime()).toBe(newTimestamp.getTime());
    });

    it("30. Database constraints reject invalid temporal states", async () => {
      // 1. Missing both timed timestamps and all-day dates (when isAllDay = false)
      try {
        await db.execute(
          sql`INSERT INTO calendar_events (user_id, title, is_all_day) 
              VALUES (${testUserId}, 'Empty Temporal Event', false)`
        );
        expect.unreachable("Should have failed timed invariant check");
      } catch (err: unknown) {
        const pgError = (err as { cause?: { code?: string } })?.cause;
        expect(pgError?.code).toBe("23514"); // check_violation
      }

      // 2. Missing both timed timestamps and all-day dates (when isAllDay = true)
      try {
        await db.execute(
          sql`INSERT INTO calendar_events (user_id, title, is_all_day) 
              VALUES (${testUserId}, 'Empty AllDay Event', true)`
        );
        expect.unreachable("Should have failed allday invariant check");
      } catch (err: unknown) {
        const pgError = (err as { cause?: { code?: string } })?.cause;
        expect(pgError?.code).toBe("23514"); // check_violation
      }

      // 3. Mixing both timed timestamps and all-day dates (when isAllDay = false)
      try {
        await db.execute(
          sql`INSERT INTO calendar_events (user_id, title, is_all_day, start_time, end_time, start_date, end_date) 
              VALUES (${testUserId}, 'Mixed State Event', false, NOW(), NOW() + interval '1 hour', '2026-11-01', '2026-11-01')`
        );
        expect.unreachable("Should have failed timed invariant check due to non-null start_date/end_date");
      } catch (err: unknown) {
        const pgError = (err as { cause?: { code?: string } })?.cause;
        expect(pgError?.code).toBe("23514"); // check_violation
      }

      // 4. Mixing both timed timestamps and all-day dates (when isAllDay = true)
      try {
        await db.execute(
          sql`INSERT INTO calendar_events (user_id, title, is_all_day, start_time, end_time, start_date, end_date) 
              VALUES (${testUserId}, 'Mixed State Event AllDay', true, NOW(), NOW() + interval '1 hour', '2026-11-01', '2026-11-01')`
        );
        expect.unreachable("Should have failed allday invariant check due to non-null start_time/end_time");
      } catch (err: unknown) {
        const pgError = (err as { cause?: { code?: string } })?.cause;
        expect(pgError?.code).toBe("23514"); // check_violation
      }
    });
  });
});
