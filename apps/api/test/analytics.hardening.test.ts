import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "../src/db/index.js";
import {
  goals,
  habitCompletions,
  habits,
  journalEntries,
  projects,
  tasks,
  users,
} from "../src/db/schema.js";
import {
  derivePeriodBounds,
  getZonedStartOfDayUtc,
} from "../src/analytics/analytics.date.js";
import { getAnalyticsOverview } from "../src/analytics/analytics.service.js";

describe("Phase 3.9: Analytics Hardening, Boundaries & Edge Cases", () => {
  describe("Temporal & Calendar Edge Cases", () => {
    it("handles Month-to-Date on March 31 on non-leap year (caps Feb at 28 days)", () => {
      const bounds = derivePeriodBounds("month", "UTC", "2026-03-31");
      expect(bounds.startDate).toBe("2026-03-01");
      expect(bounds.endDate).toBe("2026-03-31");
      expect(bounds.daysCount).toBe(31);

      // Prior month (February 2026) has 28 days - must cap at 2026-02-28 without overflowing
      expect(bounds.priorStartDate).toBe("2026-02-01");
      expect(bounds.priorEndDate).toBe("2026-02-28");
      expect(bounds.priorEndUtc.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    });

    it("handles Month-to-Date on March 31 on leap year (caps Feb at 29 days)", () => {
      const bounds = derivePeriodBounds("month", "UTC", "2024-03-31");
      expect(bounds.startDate).toBe("2024-03-01");
      expect(bounds.endDate).toBe("2024-03-31");
      expect(bounds.daysCount).toBe(31);

      // Prior month (February 2024) has 29 days
      expect(bounds.priorStartDate).toBe("2024-02-01");
      expect(bounds.priorEndDate).toBe("2024-02-29");
      expect(bounds.priorEndUtc.toISOString()).toBe("2024-03-01T00:00:00.000Z");
    });

    it("handles Month-to-Date on January traversing year boundary into December", () => {
      const bounds = derivePeriodBounds("month", "UTC", "2026-01-15");
      expect(bounds.startDate).toBe("2026-01-01");
      expect(bounds.endDate).toBe("2026-01-15");
      expect(bounds.daysCount).toBe(15);

      expect(bounds.priorStartDate).toBe("2025-12-01");
      expect(bounds.priorEndDate).toBe("2025-12-15");
    });

    it("handles extreme timezone offsets across the International Date Line", () => {
      // UTC+14 (Line Islands, Pacific/Kiritimati)
      const kiritimati = getZonedStartOfDayUtc("2026-10-11", "Pacific/Kiritimati");
      // 00:00 on 2026-10-11 at UTC+14 is 10:00 UTC on 2026-10-10
      expect(kiritimati.toISOString()).toBe("2026-10-10T10:00:00.000Z");

      // UTC-11 (Pacific/Pago_Pago)
      const pagopago = getZonedStartOfDayUtc("2026-10-11", "Pacific/Pago_Pago");
      // 00:00 on 2026-10-11 at UTC-11 is 11:00 UTC on 2026-10-11
      expect(pagopago.toISOString()).toBe("2026-10-11T11:00:00.000Z");
    });
  });

  describe("Boundary Half-Open Timestamp Invariant [startUtc, endUtc)", () => {
    const userH = "90000000-0000-0000-0000-000000000001";

    const cleanUserH = async () => {
      await db.delete(tasks).where(eq(tasks.userId, userH));
      await db.delete(users).where(eq(users.id, userH));
    };

    beforeEach(async () => {
      await cleanUserH();

      await db.insert(users).values({
        id: userH,
        email: "hardening@trackup.dev",
        passwordHash: "dummy-hash",
        name: "Hardening User",
        timezone: "UTC",
      });
    });

    afterEach(async () => {
      await cleanUserH();
    });

    it("strictly includes tasks completed at start instant and strictly excludes tasks completed at end instant", async () => {
      const bounds = derivePeriodBounds("7d", "UTC", "2026-10-11");
      // currentStartUtc is 2026-10-05T00:00:00.000Z
      // currentEndUtc is 2026-10-12T00:00:00.000Z

      await db.insert(tasks).values([
        {
          id: "90000000-0000-0000-0000-000000000010",
          userId: userH,
          title: "Exact Start Task",
          status: "COMPLETED",
          completedAt: bounds.currentStartUtc, // Included
        },
        {
          id: "90000000-0000-0000-0000-000000000011",
          userId: userH,
          title: "1ms Before End Task",
          status: "COMPLETED",
          completedAt: new Date(bounds.currentEndUtc.getTime() - 1), // Included
        },
        {
          id: "90000000-0000-0000-0000-000000000012",
          userId: userH,
          title: "Exact End Instant Task",
          status: "COMPLETED",
          completedAt: bounds.currentEndUtc, // EXCLUDED (half-open <)
        },
        {
          id: "90000000-0000-0000-0000-000000000013",
          userId: userH,
          title: "1ms Before Start Task",
          status: "COMPLETED",
          completedAt: new Date(bounds.currentStartUtc.getTime() - 1), // Prior period
        },
      ]);

      const res = await getAnalyticsOverview(userH, "UTC", "7d", "2026-10-11");

      expect(res.summary.tasksCompleted.current).toBe(2); // exact-start and before-end
      expect(res.summary.tasksCompleted.prior).toBe(1); // just-before-start
    });
  });

  describe("Sparse Datasets & Dormant Entities", () => {
    const userS = "90000000-0000-0000-0000-000000000002";

    const cleanUserS = async () => {
      await db.delete(habitCompletions).where(
        inArray(
          habitCompletions.habitId,
          db
            .select({ id: habits.id })
            .from(habits)
            .where(eq(habits.userId, userS))
        )
      );
      await db.delete(tasks).where(eq(tasks.userId, userS));
      await db.delete(habits).where(eq(habits.userId, userS));
      await db.delete(goals).where(eq(goals.userId, userS));
      await db.delete(projects).where(eq(projects.userId, userS));
      await db.delete(journalEntries).where(eq(journalEntries.userId, userS));
      await db.delete(users).where(eq(users.id, userS));
    };

    beforeEach(async () => {
      await cleanUserS();

      await db.insert(users).values({
        id: userS,
        email: "sparse@trackup.dev",
        passwordHash: "dummy-hash",
        name: "Sparse User",
        timezone: "UTC",
      });
    });

    afterEach(async () => {
      await cleanUserS();
    });

    it("gracefully processes archived habits, archived projects, and completed goals without degradation", async () => {
      // Archived habit with historical completions
      await db.insert(habits).values({
        id: "90000000-0000-0000-0000-000000000020",
        userId: userS,
        title: "Archived Habit",
        status: "ARCHIVED",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      });
      await db.insert(habitCompletions).values({
        id: "90000000-0000-0000-0000-000000000021",
        habitId: "90000000-0000-0000-0000-000000000020",
        completedDate: "2026-10-10",
      });

      // Archived project with tasks
      await db.insert(projects).values({
        id: "90000000-0000-0000-0000-000000000030",
        userId: userS,
        name: "Archived Project",
        status: "ARCHIVED",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      });
      await db.insert(tasks).values({
        id: "90000000-0000-0000-0000-000000000031",
        userId: userS,
        projectId: "90000000-0000-0000-0000-000000000030",
        title: "Archived project task",
        status: "COMPLETED",
        completedAt: new Date("2026-10-10T12:00:00Z"),
      });

      // Goals: 1 completed, 0 active
      await db.insert(goals).values({
        id: "90000000-0000-0000-0000-000000000040",
        userId: userS,
        title: "Finished Goal",
        status: "COMPLETED",
        progress: 100,
        createdAt: new Date("2026-01-01T00:00:00Z"),
      });

      const res = await getAnalyticsOverview(userS, "UTC", "7d", "2026-10-11");

      // Active habits should be empty, overall rate null
      expect(res.habits.habitsList).toHaveLength(0);
      expect(res.summary.habitConsistency.rate).toBeNull();

      // Active projects should be empty
      expect(res.projects).toHaveLength(0);

      // Goals: activeCount is 0, completedCount is 1, averageProgress is 0
      expect(res.summary.activeGoals.activeCount).toBe(0);
      expect(res.summary.activeGoals.completedCount).toBe(1);
      expect(res.summary.activeGoals.averageProgress).toBe(0);
      expect(res.goals).toHaveLength(1);
    });
  });

  describe("High Concurrency & Multi-Tenant Parallelism", () => {
    const user1 = "90000000-0000-0000-0000-000000000003";
    const user2 = "90000000-0000-0000-0000-000000000004";

    const cleanParallelUsers = async () => {
      await db.delete(tasks).where(inArray(tasks.userId, [user1, user2]));
      await db.delete(habits).where(inArray(habits.userId, [user1, user2]));
      await db.delete(users).where(inArray(users.id, [user1, user2]));
    };

    beforeEach(async () => {
      await cleanParallelUsers();

      await db.insert(users).values([
        {
          id: user1,
          email: "parallel1@trackup.dev",
          passwordHash: "dummy-hash",
          name: "Parallel User 1",
          timezone: "UTC",
        },
        {
          id: user2,
          email: "parallel2@trackup.dev",
          passwordHash: "dummy-hash",
          name: "Parallel User 2",
          timezone: "America/New_York",
        },
      ]);

      await db.insert(tasks).values([
        {
          id: "90000000-0000-0000-0000-000000000050",
          userId: user1,
          title: "User 1 Task",
          status: "COMPLETED",
          completedAt: new Date("2026-10-10T10:00:00Z"),
        },
        {
          id: "90000000-0000-0000-0000-000000000051",
          userId: user2,
          title: "User 2 Task",
          status: "COMPLETED",
          completedAt: new Date("2026-10-10T10:00:00Z"),
        },
      ]);
    });

    afterEach(async () => {
      await cleanParallelUsers();
    });

    it("executes 10 concurrent requests across distinct users and periods without race conditions or crosstalk", async () => {
      const calls = Array.from({ length: 10 }).map((_, i) => {
        const targetUser = i % 2 === 0 ? user1 : user2;
        const targetTz = i % 2 === 0 ? "UTC" : "America/New_York";
        const period = i % 3 === 0 ? "month" : i % 3 === 1 ? "30d" : "7d";
        return getAnalyticsOverview(targetUser, targetTz, period, "2026-10-11");
      });

      const results = await Promise.all(calls);

      expect(results).toHaveLength(10);
      for (let i = 0; i < 10; i++) {
        const res = results[i];
        // Each user only has 1 completed task
        expect(res.summary.tasksCompleted.current).toBe(1);
      }
    });
  });
});
