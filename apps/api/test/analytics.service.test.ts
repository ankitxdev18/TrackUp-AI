import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getAnalyticsOverview } from "../src/analytics/analytics.service.js";
import { closeDatabasePool, db } from "../src/db/index.js";
import {
  goals,
  habitCompletions,
  habits,
  journalEntries,
  projects,
  tasks,
  users,
} from "../src/db/schema.js";

describe("Analytics Service Database Foundation & Multi-Tenant Aggregations", () => {
  const TEST_DOMAIN = "analytics_service_test.trackup.local";
  const userAEmail = `analytics_usera_${Date.now()}@${TEST_DOMAIN}`;
  const userBEmail = `analytics_userb_${Date.now()}@${TEST_DOMAIN}`;

  let userAId: string;
  let userBId: string;

  const testTimezone = "America/New_York";
  const fixedToday = "2026-10-11"; // Sunday

  const cleanup = async () => {
    await db.execute(
      sql`DELETE FROM users WHERE email LIKE ${`%@${TEST_DOMAIN}`}`
    );
  };

  beforeAll(async () => {
    await cleanup();

    // Create User A
    const [userA] = await db
      .insert(users)
      .values({
        email: userAEmail,
        name: "Alice Analytics",
        passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$dummyhash",
        timezone: testTimezone,
      })
      .returning();
    userAId = userA.id;

    // Create User B (for tenant isolation testing)
    const [userB] = await db
      .insert(users)
      .values({
        email: userBEmail,
        name: "Bob Analytics",
        passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$dummyhash",
        timezone: testTimezone,
      })
      .returning();
    userBId = userB.id;

    // Seed User A Domain Data
    // 1. Projects
    const [project1] = await db
      .insert(projects)
      .values({
        userId: userAId,
        name: "Q4 Launch",
        status: "ACTIVE",
      })
      .returning();

    // 2. Tasks
    // Task 1: Completed in current 7d period (Oct 8, 2026)
    await db.insert(tasks).values({
      userId: userAId,
      projectId: project1.id,
      title: "Design spec",
      status: "COMPLETED",
      priority: "HIGH",
      dueDate: "2026-10-08",
      completedAt: new Date("2026-10-08T14:00:00.000Z"),
    });

    // Task 2: Completed in current 7d period (Oct 10, 2026)
    await db.insert(tasks).values({
      userId: userAId,
      projectId: project1.id,
      title: "API contracts",
      status: "COMPLETED",
      priority: "MEDIUM",
      dueDate: "2026-10-10",
      completedAt: new Date("2026-10-10T16:00:00.000Z"),
    });

    // Task 3: Overdue task (Due Oct 09, still TODO)
    await db.insert(tasks).values({
      userId: userAId,
      projectId: project1.id,
      title: "Write integration tests",
      status: "TODO",
      priority: "HIGH",
      dueDate: "2026-10-09",
    });

    // Task 4: Task completed in PRIOR period (Oct 02, 2026)
    await db.insert(tasks).values({
      userId: userAId,
      title: "Initial research",
      status: "COMPLETED",
      priority: "LOW",
      dueDate: "2026-10-02",
      completedAt: new Date("2026-10-02T10:00:00.000Z"),
    });

    // 3. Habits & Completions for User A
    const [habit1] = await db
      .insert(habits)
      .values({
        userId: userAId,
        title: "Morning Run",
        status: "ACTIVE",
        createdAt: new Date("2026-10-01T00:00:00.000Z"),
      })
      .returning();

    // Completions on Oct 09, 10, 11
    await db.insert(habitCompletions).values([
      { habitId: habit1.id, completedDate: "2026-10-09" },
      { habitId: habit1.id, completedDate: "2026-10-10" },
      { habitId: habit1.id, completedDate: "2026-10-11" },
    ]);

    // 4. Goals for User A
    await db.insert(goals).values([
      {
        userId: userAId,
        title: "Launch TrackUp Analytics",
        status: "ACTIVE",
        progress: 75,
        targetDate: "2026-10-20",
      },
      {
        userId: userAId,
        title: "Complete Security Audit",
        status: "COMPLETED",
        progress: 100,
        targetDate: "2026-10-01",
      },
    ]);

    // 5. Journal Entries for User A (Oct 09 and Oct 10)
    await db.insert(journalEntries).values([
      {
        userId: userAId,
        entryDate: "2026-10-09",
        title: "Friday Retrospective",
        content: "Top secret personal thoughts.",
      },
      {
        userId: userAId,
        entryDate: "2026-10-10",
        title: "Saturday Review",
        content: "More personal reflections.",
      },
    ]);

    // Seed User B Data (to test isolation)
    await db.insert(tasks).values({
      userId: userBId,
      title: "User B Task",
      status: "COMPLETED",
      priority: "HIGH",
      dueDate: "2026-10-08",
      completedAt: new Date("2026-10-08T12:00:00.000Z"),
    });
  });

  afterAll(async () => {
    await cleanup();
    await closeDatabasePool();
  });

  it("calculates accurate 7-day task metrics for User A", async () => {
    const data = await getAnalyticsOverview(
      userAId,
      testTimezone,
      "7d",
      fixedToday
    );

    // Current completed: 2 tasks (Task 1 & Task 2)
    expect(data.summary.tasksCompleted.current).toBe(2);
    // Prior completed: 1 task (Task 4)
    expect(data.summary.tasksCompleted.prior).toBe(1);
    // Delta: +1 (+100%)
    expect(data.summary.tasksCompleted.delta).toBe(1);
    expect(data.summary.tasksCompleted.deltaPercent).toBe(100);

    // Scheduled rate: Tasks due between Oct 05 and Oct 11:
    // Task 1 (Due Oct 8, COMPLETED), Task 2 (Due Oct 10, COMPLETED), Task 3 (Due Oct 9, TODO)
    // Scheduled Total = 3, Scheduled Completed = 2 -> 67%
    expect(data.summary.taskCompletionRate.scheduledTotal).toBe(3);
    expect(data.summary.taskCompletionRate.scheduledCompleted).toBe(2);
    expect(data.summary.taskCompletionRate.rate).toBe(67);

    // Overdue count: 1 task (Task 3 due Oct 09 < Oct 11)
    expect(data.tasks.currentOverdueCount).toBe(1);

    // Priorities of completed tasks in range: 1 HIGH, 1 MEDIUM, 0 LOW
    expect(data.tasks.byPriority.high).toBe(1);
    expect(data.tasks.byPriority.medium).toBe(1);
    expect(data.tasks.byPriority.low).toBe(0);
  });

  it("calculates accurate habit streaks and consistency", async () => {
    const data = await getAnalyticsOverview(
      userAId,
      testTimezone,
      "7d",
      fixedToday
    );

    expect(data.habits.habitsList.length).toBe(1);
    const habit = data.habits.habitsList[0];
    expect(habit.title).toBe("Morning Run");
    // Oct 09, 10, 11 are completed contiguous ending on today (Oct 11) -> currentStreak = 3
    expect(habit.currentStreak).toBe(3);
    expect(habit.longestStreak).toBe(3);
    // 3 completions out of 7 eligible days -> 43%
    expect(habit.periodCompletions).toBe(3);
    expect(habit.periodRate).toBe(43);

    expect(data.summary.habitConsistency.rate).toBe(43);
    expect(data.summary.habitConsistency.totalCompletions).toBe(3);
    expect(data.summary.habitConsistency.totalEligibleDays).toBe(7);

    // Verify daily activity grid contains 7 contiguous days
    expect(data.habits.dailyGrid.length).toBe(7);
    const completedDays = data.habits.dailyGrid.filter((d) => d.completedCount > 0);
    expect(completedDays.length).toBe(3);
  });

  it("calculates active goals and projects execution metrics", async () => {
    const data = await getAnalyticsOverview(
      userAId,
      testTimezone,
      "7d",
      fixedToday
    );

    // Goals: 1 ACTIVE (progress 75), 1 COMPLETED (progress 100)
    expect(data.summary.activeGoals.activeCount).toBe(1);
    expect(data.summary.activeGoals.completedCount).toBe(1);
    expect(data.summary.activeGoals.averageProgress).toBe(75);

    // Projects: 1 active project with 3 associated tasks (2 completed) -> 67%
    expect(data.projects.length).toBe(1);
    expect(data.projects[0].name).toBe("Q4 Launch");
    expect(data.projects[0].taskCount).toBe(3);
    expect(data.projects[0].completedTaskCount).toBe(2);
    expect(data.projects[0].progressPercent).toBe(67);
  });

  it("calculates journal reflections volume without leaking content", async () => {
    const data = await getAnalyticsOverview(
      userAId,
      testTimezone,
      "7d",
      fixedToday
    );

    // 2 entries in the 7-day period -> 29% (2 of 7 days)
    expect(data.summary.journalReflections.daysJournaled).toBe(2);
    expect(data.summary.journalReflections.consistencyPercent).toBe(29);

    // Confirm payload contains no journal content text
    const stringified = JSON.stringify(data);
    expect(stringified).not.toContain("Top secret personal thoughts");
    expect(stringified).not.toContain("More personal reflections");
  });

  it("enforces strict multi-tenant isolation (User B does not see User A's data)", async () => {
    const dataB = await getAnalyticsOverview(
      userBId,
      testTimezone,
      "7d",
      fixedToday
    );

    // User B only has 1 completed task and 0 habits, 0 projects, 0 goals, 0 journals
    expect(dataB.summary.tasksCompleted.current).toBe(1);
    expect(dataB.summary.tasksCompleted.prior).toBe(0);
    // Delta percent is null when prior is 0
    expect(dataB.summary.tasksCompleted.deltaPercent).toBe(null);

    expect(dataB.habits.habitsList.length).toBe(0);
    expect(dataB.summary.habitConsistency.rate).toBe(null);
    expect(dataB.goals.length).toBe(0);
    expect(dataB.projects.length).toBe(0);
    expect(dataB.summary.journalReflections.daysJournaled).toBe(0);
  });
});
