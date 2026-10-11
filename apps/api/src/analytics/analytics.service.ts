import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  goals,
  habitCompletions,
  habits,
  journalEntries,
  projects,
  tasks,
} from "../db/schema.js";
import {
  addCalendarDays,
  diffCalendarDays,
  formatCalendarDateInTimeZone,
} from "../habits/habit.date.js";
import { calculateStreaks } from "../habits/habit.streak.js";
import { derivePeriodBounds } from "./analytics.date.js";
import {
  AnalyticsOverviewData,
  AnalyticsPeriod,
  GoalMetricItem,
  HabitItemMetric,
  ProjectMetricItem,
  TaskPriorityBreakdown,
} from "./analytics.schema.js";

/**
 * Computes a comprehensive, multi-domain analytics overview for the authenticated user.
 * Strictly scopes all queries to `userId`.
 */
export async function getAnalyticsOverview(
  userId: string,
  userTimeZone: string,
  period: AnalyticsPeriod = "7d",
  referenceToday?: string
): Promise<AnalyticsOverviewData> {
  const bounds = derivePeriodBounds(period, userTimeZone, referenceToday);

  // Execute database queries concurrently
  const [
    [taskStats],
    priorityRows,
    userGoals,
    projectRows,
    [journalStats],
    activeHabits,
  ] = await Promise.all([
    // 1. Task Execution & Scheduled Aggregations
    db
      .select({
        currentCompleted: sql<number>`cast(count(case when ${tasks.status} = 'COMPLETED' and ${tasks.completedAt} >= ${bounds.currentStartUtc} and ${tasks.completedAt} < ${bounds.currentEndUtc} then 1 end) as integer)`,
        priorCompleted: sql<number>`cast(count(case when ${tasks.status} = 'COMPLETED' and ${tasks.completedAt} >= ${bounds.priorStartUtc} and ${tasks.completedAt} < ${bounds.priorEndUtc} then 1 end) as integer)`,
        scheduledTotal: sql<number>`cast(count(case when ${tasks.dueDate} >= ${bounds.startDate} and ${tasks.dueDate} <= ${bounds.endDate} then 1 end) as integer)`,
        scheduledCompleted: sql<number>`cast(count(case when ${tasks.dueDate} >= ${bounds.startDate} and ${tasks.dueDate} <= ${bounds.endDate} and ${tasks.status} = 'COMPLETED' then 1 end) as integer)`,
        overdueCount: sql<number>`cast(count(case when ${tasks.status} = 'TODO' and ${tasks.dueDate} < ${bounds.endDate} then 1 end) as integer)`,
      })
      .from(tasks)
      .where(eq(tasks.userId, userId)),

    // 2. Completed Tasks by Priority
    db
      .select({
        priority: tasks.priority,
        count: sql<number>`cast(count(${tasks.id}) as integer)`,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          eq(tasks.status, "COMPLETED"),
          gte(tasks.completedAt, bounds.currentStartUtc),
          lt(tasks.completedAt, bounds.currentEndUtc)
        )
      )
      .groupBy(tasks.priority),

    // 3. Goals Snapshot
    db
      .select({
        id: goals.id,
        title: goals.title,
        status: goals.status,
        progress: goals.progress,
        targetDate: goals.targetDate,
        createdAt: goals.createdAt,
      })
      .from(goals)
      .where(eq(goals.userId, userId))
      .orderBy(
        sql`case when ${goals.status} = 'ACTIVE' then 0 when ${goals.status} = 'COMPLETED' then 1 else 2 end`,
        sql`case when ${goals.targetDate} is null then 1 else 0 end`,
        asc(goals.targetDate),
        desc(goals.createdAt)
      ),

    // 4. Active Projects with Aggregated Tasks
    db
      .select({
        id: projects.id,
        name: projects.name,
        taskCount: sql<number>`cast(count(${tasks.id}) as integer)`,
        completedTaskCount: sql<number>`cast(count(case when ${tasks.status} = 'COMPLETED' then 1 end) as integer)`,
      })
      .from(projects)
      .leftJoin(
        tasks,
        and(eq(tasks.projectId, projects.id), eq(tasks.userId, userId))
      )
      .where(and(eq(projects.userId, userId), eq(projects.status, "ACTIVE")))
      .groupBy(projects.id, projects.name, projects.createdAt)
      .orderBy(desc(projects.createdAt))
      .limit(10),

    // 5. Journal Reflection Frequency (counts only, content completely omitted)
    db
      .select({
        currentDays: sql<number>`cast(count(case when ${journalEntries.entryDate} >= ${bounds.startDate} and ${journalEntries.entryDate} <= ${bounds.endDate} then 1 end) as integer)`,
        priorDays: sql<number>`cast(count(case when ${journalEntries.entryDate} >= ${bounds.priorStartDate} and ${journalEntries.entryDate} <= ${bounds.priorEndDate} then 1 end) as integer)`,
      })
      .from(journalEntries)
      .where(eq(journalEntries.userId, userId)),

    // 6. Active Habits
    db
      .select({
        id: habits.id,
        title: habits.title,
        createdAt: habits.createdAt,
      })
      .from(habits)
      .where(and(eq(habits.userId, userId), eq(habits.status, "ACTIVE")))
      .orderBy(desc(habits.createdAt)),
  ]);

  // Habit Completions Query
  const habitIds = activeHabits.map((h) => h.id);
  const habitCompletionsList =
    habitIds.length > 0
      ? await db
          .select({
            habitId: habitCompletions.habitId,
            completedDate: habitCompletions.completedDate,
          })
          .from(habitCompletions)
          .where(inArray(habitCompletions.habitId, habitIds))
          .orderBy(habitCompletions.completedDate)
      : [];

  // Group habit completions by habit ID
  const completionsByHabit = new Map<string, string[]>();
  const completionSetByHabit = new Map<string, Set<string>>();
  for (const c of habitCompletionsList) {
    let list = completionsByHabit.get(c.habitId);
    let set = completionSetByHabit.get(c.habitId);
    if (!list || !set) {
      list = [];
      set = new Set();
      completionsByHabit.set(c.habitId, list);
      completionSetByHabit.set(c.habitId, set);
    }
    list.push(c.completedDate);
    set.add(c.completedDate);
  }

  // --- Process Tasks Metrics ---
  const currentCompleted = taskStats?.currentCompleted ?? 0;
  const priorCompleted = taskStats?.priorCompleted ?? null;
  const delta =
    priorCompleted !== null ? currentCompleted - priorCompleted : null;
  const deltaPercent =
    priorCompleted !== null && priorCompleted > 0
      ? Math.round(((currentCompleted - priorCompleted) / priorCompleted) * 100)
      : null;

  const scheduledTotal = taskStats?.scheduledTotal ?? 0;
  const scheduledCompleted = taskStats?.scheduledCompleted ?? 0;
  const completionRate =
    scheduledTotal > 0
      ? Math.round((scheduledCompleted / scheduledTotal) * 100)
      : null;

  const byPriority: TaskPriorityBreakdown = { high: 0, medium: 0, low: 0 };
  for (const row of priorityRows) {
    const key = row.priority?.toLowerCase() as keyof TaskPriorityBreakdown;
    if (key in byPriority) {
      byPriority[key] = row.count;
    }
  }

  // --- Process Goals Metrics ---
  const activeGoalItems = userGoals.filter((g) => g.status === "ACTIVE");
  const completedGoalCount = userGoals.filter(
    (g) => g.status === "COMPLETED"
  ).length;
  const averageProgress =
    activeGoalItems.length > 0
      ? Math.round(
          activeGoalItems.reduce((acc, g) => acc + g.progress, 0) /
            activeGoalItems.length
        )
      : 0;

  const goalsList: GoalMetricItem[] = userGoals.map((g) => ({
    id: g.id,
    title: g.title,
    status: g.status as GoalMetricItem["status"],
    progress: g.progress,
    targetDate: g.targetDate,
  }));

  // --- Process Projects Metrics ---
  const projectsList: ProjectMetricItem[] = projectRows.map((p) => {
    const taskCount = p.taskCount ?? 0;
    const completedTaskCount = p.completedTaskCount ?? 0;
    return {
      id: p.id,
      name: p.name,
      taskCount,
      completedTaskCount,
      progressPercent:
        taskCount > 0 ? Math.round((completedTaskCount / taskCount) * 100) : 0,
    };
  });

  // --- Process Journal Metrics ---
  const daysJournaled = journalStats?.currentDays ?? 0;
  const journalConsistency =
    bounds.daysCount > 0
      ? Math.round((daysJournaled / bounds.daysCount) * 100)
      : 0;

  // --- Process Habits Metrics ---
  let totalCompletionsAcrossHabits = 0;
  let totalEligibleDaysAcrossHabits = 0;

  const habitsList: HabitItemMetric[] = activeHabits.map((habit) => {
    const allDates = completionsByHabit.get(habit.id) || [];
    const streaks = calculateStreaks(allDates, bounds.endDate);

    const periodDates = allDates.filter(
      (d) => d >= bounds.startDate && d <= bounds.endDate
    );
    const periodCompletions = periodDates.length;

    const habitEligibilityStartDate = formatCalendarDateInTimeZone(
      habit.createdAt,
      bounds.timeZone
    );
    const effectiveStartDate =
      habitEligibilityStartDate > bounds.startDate
        ? habitEligibilityStartDate
        : bounds.startDate;

    const eligibleDays =
      effectiveStartDate <= bounds.endDate
        ? Math.max(0, diffCalendarDays(effectiveStartDate, bounds.endDate) + 1)
        : 0;

    totalCompletionsAcrossHabits += periodCompletions;
    totalEligibleDaysAcrossHabits += eligibleDays;

    const periodRate =
      eligibleDays > 0
        ? Math.round((periodCompletions / eligibleDays) * 100)
        : null;

    return {
      id: habit.id,
      title: habit.title,
      currentStreak: streaks.currentStreak,
      longestStreak: streaks.longestStreak,
      periodCompletions,
      periodRate,
    };
  });

  const overallHabitRate =
    totalEligibleDaysAcrossHabits > 0
      ? Math.round(
          (totalCompletionsAcrossHabits / totalEligibleDaysAcrossHabits) * 100
        )
      : null;

  // Construct daily habit grid
  const dailyGrid = [];
  for (let i = 0; i < bounds.daysCount; i++) {
    const curDate = addCalendarDays(bounds.startDate, i);
    let completedOnDate = 0;
    let activeOnDate = 0;

    for (const habit of activeHabits) {
      const habitEligibleDate = formatCalendarDateInTimeZone(
        habit.createdAt,
        bounds.timeZone
      );
      if (curDate >= habitEligibleDate) {
        activeOnDate++;
        const habitDates = completionSetByHabit.get(habit.id);
        if (habitDates?.has(curDate)) {
          completedOnDate++;
        }
      }
    }

    dailyGrid.push({
      date: curDate,
      completedCount: completedOnDate,
      totalActiveHabits: activeOnDate,
    });
  }

  return {
    period: {
      code: bounds.periodCode,
      startDate: bounds.startDate,
      endDate: bounds.endDate,
      timeZone: bounds.timeZone,
      daysCount: bounds.daysCount,
    },
    summary: {
      tasksCompleted: {
        current: currentCompleted,
        prior: priorCompleted,
        delta,
        deltaPercent,
      },
      taskCompletionRate: {
        rate: completionRate,
        scheduledTotal,
        scheduledCompleted,
      },
      habitConsistency: {
        rate: overallHabitRate,
        totalCompletions: totalCompletionsAcrossHabits,
        totalEligibleDays: totalEligibleDaysAcrossHabits,
      },
      activeGoals: {
        activeCount: activeGoalItems.length,
        completedCount: completedGoalCount,
        averageProgress,
      },
      journalReflections: {
        daysJournaled,
        consistencyPercent: journalConsistency,
        priorDaysJournaled: journalStats?.priorDays ?? null,
      },
    },
    tasks: {
      byPriority,
      currentOverdueCount: taskStats?.overdueCount ?? 0,
    },
    habits: {
      habitsList,
      dailyGrid,
    },
    goals: goalsList,
    projects: projectsList,
  };
}
