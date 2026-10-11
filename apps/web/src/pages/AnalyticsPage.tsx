import { useCallback, useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import {
  fetchAnalyticsOverview,
  type AnalyticsOverviewData,
  type AnalyticsPeriod,
} from "../api/analytics";
import { AnalyticsHeader } from "./analytics/AnalyticsHeader";
import { AnalyticsSkeleton } from "./analytics/AnalyticsSkeleton";
import { ExecutionPulse } from "./analytics/ExecutionPulse";
import { GoalsHorizonCard } from "./analytics/GoalsHorizonCard";
import { HabitMatrixCard } from "./analytics/HabitMatrixCard";
import { ProjectsProgressCard } from "./analytics/ProjectsProgressCard";
import { TasksBreakdownCard } from "./analytics/TasksBreakdownCard";
import "./AnalyticsPage.css";

export function AnalyticsPage() {
  const [period, setPeriod] = useState<AnalyticsPeriod>("7d");
  const [data, setData] = useState<AnalyticsOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (selectedPeriod: AnalyticsPeriod, isInitial: boolean) => {
    try {
      if (isInitial) {
        setLoading(true);
      } else {
        setIsUpdating(true);
      }
      setError(null);
      const res = await fetchAnalyticsOverview(selectedPeriod);
      setData(res);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load analytics metrics"
      );
    } finally {
      setLoading(false);
      setIsUpdating(false);
    }
  }, []);

  useEffect(() => {
    loadData(period, !data);
  }, [period, loadData]);

  const handlePeriodChange = (newPeriod: AnalyticsPeriod) => {
    if (newPeriod === period) return;
    setPeriod(newPeriod);
  };

  return (
    <div className="analytics-page">
      {/* Zone 1: Orientation Header & Period Selection */}
      <AnalyticsHeader
        period={period}
        onSelectPeriod={handlePeriodChange}
        startDate={data?.period.startDate}
        endDate={data?.period.endDate}
        timeZone={data?.period.timeZone}
        loading={isUpdating}
      />

      {/* Error Banner with Retry */}
      {error && (
        <div className="analytics-error-banner" role="alert">
          <AlertCircle size={18} />
          <div className="error-text">
            <strong>Unable to load analytics data:</strong> {error}
          </div>
          <button
            type="button"
            className="btn-retry"
            onClick={() => loadData(period, true)}
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && !data ? (
        <AnalyticsSkeleton />
      ) : data ? (
        <div className={`analytics-content-body ${isUpdating ? "is-refreshing" : ""}`}>
          {/* Zone 2: Execution Pulse Strip */}
          <ExecutionPulse
            summary={data.summary}
            daysCount={data.period.daysCount}
          />

          {/* Zone 3: Main Breakdown Grid */}
          <div className="analytics-main-grid">
            {/* Left Column: Daily Execution Focus */}
            <div className="analytics-col-primary">
              <TasksBreakdownCard
                tasks={data.tasks}
                summary={data.summary.tasksCompleted}
              />
              <HabitMatrixCard
                habits={data.habits}
                overallRate={data.summary.habitConsistency.rate}
              />
            </div>

            {/* Right Column: Horizon Commitments Focus */}
            <div className="analytics-col-horizon">
              <GoalsHorizonCard
                goals={data.goals}
                statusSummary={data.summary.activeGoals}
              />
              <ProjectsProgressCard projects={data.projects} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default AnalyticsPage;
