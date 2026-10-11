export type AnalyticsPeriod = "7d" | "30d" | "month";

export interface TaskPriorityBreakdown {
  high: number;
  medium: number;
  low: number;
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
  date: string;
  completedCount: number;
  totalActiveHabits: number;
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

export class AnalyticsApiError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = "AnalyticsApiError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Fetches analytics overview metrics for the authenticated user.
 */
export async function fetchAnalyticsOverview(
  period: AnalyticsPeriod = "7d"
): Promise<AnalyticsOverviewData> {
  const response = await fetch(`/api/analytics/overview?period=${period}`, {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    let errorData: any = {};
    try {
      errorData = await response.json();
    } catch {
      // ignore JSON parse failure
    }

    throw new AnalyticsApiError(
      response.status,
      errorData.code || "ANALYTICS_FETCH_FAILED",
      errorData.error || "Failed to retrieve analytics overview"
    );
  }

  return response.json();
}
