import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import * as analyticsApi from "../api/analytics";
import { AnalyticsPage } from "../pages/AnalyticsPage";

const mockAnalyticsData: analyticsApi.AnalyticsOverviewData = {
  period: {
    code: "7d",
    startDate: "2026-10-05",
    endDate: "2026-10-11",
    timeZone: "America/New_York",
    daysCount: 7,
  },
  summary: {
    tasksCompleted: {
      current: 12,
      prior: 8,
      delta: 4,
      deltaPercent: 50,
    },
    taskCompletionRate: {
      rate: 80,
      scheduledTotal: 15,
      scheduledCompleted: 12,
    },
    habitConsistency: {
      rate: 85,
      totalCompletions: 17,
      totalEligibleDays: 20,
    },
    activeGoals: {
      activeCount: 2,
      completedCount: 1,
      averageProgress: 70,
    },
    journalReflections: {
      daysJournaled: 5,
      consistencyPercent: 71,
      priorDaysJournaled: 4,
    },
  },
  tasks: {
    byPriority: {
      high: 5,
      medium: 5,
      low: 2,
    },
    currentOverdueCount: 2,
  },
  habits: {
    habitsList: [
      {
        id: "h-1",
        title: "Morning Meditation",
        currentStreak: 4,
        longestStreak: 10,
        periodCompletions: 6,
        periodRate: 86,
      },
    ],
    dailyGrid: [
      { date: "2026-10-05", completedCount: 1, totalActiveHabits: 1 },
      { date: "2026-10-06", completedCount: 1, totalActiveHabits: 1 },
      { date: "2026-10-07", completedCount: 1, totalActiveHabits: 1 },
      { date: "2026-10-08", completedCount: 0, totalActiveHabits: 1 },
      { date: "2026-10-09", completedCount: 1, totalActiveHabits: 1 },
      { date: "2026-10-10", completedCount: 1, totalActiveHabits: 1 },
      { date: "2026-10-11", completedCount: 1, totalActiveHabits: 1 },
    ],
  },
  goals: [
    {
      id: "g-1",
      title: "Launch Analytics Feature",
      status: "ACTIVE",
      progress: 75,
      targetDate: "2026-10-25",
    },
    {
      id: "g-2",
      title: "Write Architecture Docs",
      status: "ACTIVE",
      progress: 65,
      targetDate: null,
    },
  ],
  projects: [
    {
      id: "p-1",
      name: "Life OS V1",
      taskCount: 10,
      completedTaskCount: 7,
      progressPercent: 70,
    },
  ],
};

describe("Frontend Analytics Experience (Phase 3.7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders loading skeleton initially", () => {
    // Return unresolved promise to simulate pending network request
    vi.spyOn(analyticsApi, "fetchAnalyticsOverview").mockImplementation(
      () => new Promise(() => {})
    );

    render(<AnalyticsPage />);
    expect(
      screen.getByRole("status", { name: /loading analytics data/i })
    ).toBeInTheDocument();
  });

  it("renders complete analytics dashboard upon successful fetch", async () => {
    vi.spyOn(analyticsApi, "fetchAnalyticsOverview").mockResolvedValue(
      mockAnalyticsData
    );

    render(<AnalyticsPage />);

    // Header & Timezone
    await waitFor(() => {
      expect(screen.getByText("Execution Analytics")).toBeInTheDocument();
    });
    expect(screen.getByText("2026-10-05 to 2026-10-11")).toBeInTheDocument();
    expect(screen.getByText("America/New_York")).toBeInTheDocument();

    // Summary Pulse Cards
    expect(screen.getByText("12")).toBeInTheDocument(); // Tasks completed
    expect(screen.getByText(/\+4 vs prior/)).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument(); // Scheduled rate
    expect(screen.getByText("85%")).toBeInTheDocument(); // Habit consistency
    const journalCard = screen.getByRole("region", {
      name: /journal reflection consistency/i,
    });
    expect(journalCard).toHaveTextContent("5");
    expect(journalCard).toHaveTextContent("/ 7d");

    // Task Execution Breakdown
    expect(screen.getByText("Task Execution")).toBeInTheDocument();
    expect(screen.getByText("2 Overdue Tasks")).toBeInTheDocument();

    // Habits Matrix
    expect(screen.getAllByText("Habit Consistency").length).toBe(2);
    expect(
      screen.getByRole("region", { name: /habit consistency matrix/i })
    ).toBeInTheDocument();
    expect(screen.getByText("Morning Meditation")).toBeInTheDocument();
    expect(screen.getByText("4d streak")).toBeInTheDocument();
    expect(screen.getByText("10d best")).toBeInTheDocument();

    // Goals & Projects
    expect(screen.getByText("Goals Horizon")).toBeInTheDocument();
    expect(screen.getByText("Launch Analytics Feature")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("Projects Execution")).toBeInTheDocument();
    expect(screen.getByText("Life OS V1")).toBeInTheDocument();
    expect(screen.getByText("7 / 10 tasks (70%)")).toBeInTheDocument();
  });

  it("handles period toggle to 30D and calls API with 30d param", async () => {
    const fetchSpy = vi
      .spyOn(analyticsApi, "fetchAnalyticsOverview")
      .mockResolvedValue(mockAnalyticsData);

    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText("Execution Analytics")).toBeInTheDocument();
    });

    const btn30d = screen.getByRole("radio", { name: "30D" });
    fireEvent.click(btn30d);

    expect(fetchSpy).toHaveBeenCalledWith("30d");
  });

  it("handles period toggle to Month and calls API with month param", async () => {
    const fetchSpy = vi
      .spyOn(analyticsApi, "fetchAnalyticsOverview")
      .mockResolvedValue(mockAnalyticsData);

    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText("Execution Analytics")).toBeInTheDocument();
    });

    const btnMonth = screen.getByRole("radio", { name: "Month" });
    fireEvent.click(btnMonth);

    expect(fetchSpy).toHaveBeenCalledWith("month");
  });

  it("displays error banner and handles retry successfully", async () => {
    const fetchSpy = vi
      .spyOn(analyticsApi, "fetchAnalyticsOverview")
      .mockRejectedValueOnce(new Error("Network connection lost"))
      .mockResolvedValueOnce(mockAnalyticsData);

    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(
      screen.getByText(/Network connection lost/i)
    ).toBeInTheDocument();

    // Click retry
    const retryBtn = screen.getByRole("button", { name: /retry/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText("Execution Analytics")).toBeInTheDocument();
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("renders clean empty states for new user with zero records", async () => {
    const emptyData: analyticsApi.AnalyticsOverviewData = {
      period: {
        code: "7d",
        startDate: "2026-10-05",
        endDate: "2026-10-11",
        timeZone: "UTC",
        daysCount: 7,
      },
      summary: {
        tasksCompleted: { current: 0, prior: null, delta: null, deltaPercent: null },
        taskCompletionRate: { rate: null, scheduledTotal: 0, scheduledCompleted: 0 },
        habitConsistency: { rate: null, totalCompletions: 0, totalEligibleDays: 0 },
        activeGoals: { activeCount: 0, completedCount: 0, averageProgress: 0 },
        journalReflections: { daysJournaled: 0, consistencyPercent: 0, priorDaysJournaled: null },
      },
      tasks: {
        byPriority: { high: 0, medium: 0, low: 0 },
        currentOverdueCount: 0,
      },
      habits: {
        habitsList: [],
        dailyGrid: [],
      },
      goals: [],
      projects: [],
    };

    vi.spyOn(analyticsApi, "fetchAnalyticsOverview").mockResolvedValue(emptyData);

    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText("Execution Analytics")).toBeInTheDocument();
    });

    // Zero / null indicators
    expect(screen.getAllByText("N/A").length).toBeGreaterThan(0);
    expect(screen.getByText("No prior period data")).toBeInTheDocument();
    expect(screen.getByText("Zero Overdue Tasks")).toBeInTheDocument();
    expect(screen.getByText(/No active habits tracked/i)).toBeInTheDocument();
    expect(screen.getByText(/No active goals defined/i)).toBeInTheDocument();
    expect(screen.getByText(/No active projects/i)).toBeInTheDocument();
  });
});
