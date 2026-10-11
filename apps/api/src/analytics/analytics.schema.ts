import { z } from "zod";

export const ANALYTICS_PERIOD_VALUES = ["7d", "30d", "month"] as const;
export type AnalyticsPeriod = (typeof ANALYTICS_PERIOD_VALUES)[number];

export const analyticsPeriodEnum = z.enum(ANALYTICS_PERIOD_VALUES, {
  message: `Period must be one of: ${ANALYTICS_PERIOD_VALUES.join(", ")}`,
});

export const analyticsOverviewQuerySchema = z
  .object({
    period: analyticsPeriodEnum.default("7d"),
  })
  .strict();

export type AnalyticsOverviewQuery = z.infer<typeof analyticsOverviewQuerySchema>;

// Contract Types
export interface TaskPriorityBreakdown {
  high: number;
  medium: number;
  low: number;
}

export interface TaskSummaryMetrics {
  currentCompleted: number;
  priorCompleted: number | null;
  delta: number | null;
  deltaPercent: number | null;
  scheduledTotal: number;
  scheduledCompleted: number;
  completionRate: number | null;
  currentOverdueCount: number;
  byPriority: TaskPriorityBreakdown;
}

export interface HabitItemMetric {
  id: string;
  title: string;
  currentStreak: number;
  longestStreak: number;
  periodCompletions: number;
  periodRate: number | null;
}

export interface DailyHabitActivity {
  date: string; // "YYYY-MM-DD"
  completedCount: number;
  totalActiveHabits: number;
}

export interface HabitSummaryMetrics {
  overallRate: number | null;
  totalCompletions: number;
  totalEligibleDays: number;
  habitsList: HabitItemMetric[];
  dailyGrid: DailyHabitActivity[];
}

export interface GoalMetricItem {
  id: string;
  title: string;
  status: "ACTIVE" | "COMPLETED" | "ARCHIVED";
  progress: number;
  targetDate: string | null;
}

export interface ProjectMetricItem {
  id: string;
  name: string;
  taskCount: number;
  completedTaskCount: number;
  progressPercent: number;
}

export interface JournalSummaryMetrics {
  daysJournaled: number;
  consistencyPercent: number;
  priorDaysJournaled: number | null;
}

export interface AnalyticsOverviewData {
  period: {
    code: AnalyticsPeriod;
    startDate: string;
    endDate: string;
    timeZone: string;
    daysCount: number;
  };
  summary: {
    tasksCompleted: {
      current: number;
      prior: number | null;
      delta: number | null;
      deltaPercent: number | null;
    };
    taskCompletionRate: {
      rate: number | null;
      scheduledTotal: number;
      scheduledCompleted: number;
    };
    habitConsistency: {
      rate: number | null;
      totalCompletions: number;
      totalEligibleDays: number;
    };
    activeGoals: {
      activeCount: number;
      completedCount: number;
      averageProgress: number;
    };
    journalReflections: {
      daysJournaled: number;
      consistencyPercent: number;
      priorDaysJournaled: number | null;
    };
  };
  tasks: {
    byPriority: TaskPriorityBreakdown;
    currentOverdueCount: number;
  };
  habits: {
    habitsList: HabitItemMetric[];
    dailyGrid: DailyHabitActivity[];
  };
  goals: GoalMetricItem[];
  projects: ProjectMetricItem[];
}
