import {
  BookOpen,
  CheckCircle2,
  Percent,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { AnalyticsOverviewData } from "../../api/analytics";

interface ExecutionPulseProps {
  summary: AnalyticsOverviewData["summary"];
  daysCount: number;
}

export function ExecutionPulse({ summary, daysCount }: ExecutionPulseProps) {
  const {
    tasksCompleted,
    taskCompletionRate,
    habitConsistency,
    journalReflections,
  } = summary;

  // Formatting delta indicator
  const renderDelta = () => {
    if (tasksCompleted.delta === null) {
      return (
        <span className="pulse-sub-muted">
          No prior period data
        </span>
      );
    }

    const isPositive = tasksCompleted.delta > 0;
    const isZero = tasksCompleted.delta === 0;

    if (isZero) {
      return <span className="pulse-sub-neutral">Equal to prior period</span>;
    }

    return (
      <span
        className={`pulse-badge ${isPositive ? "badge-positive" : "badge-negative"}`}
      >
        {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
        <span>
          {isPositive ? `+${tasksCompleted.delta}` : tasksCompleted.delta} vs prior
          {tasksCompleted.deltaPercent !== null && ` (${tasksCompleted.deltaPercent > 0 ? `+${tasksCompleted.deltaPercent}` : tasksCompleted.deltaPercent}%)`}
        </span>
      </span>
    );
  };

  return (
    <section
      className="execution-pulse-strip"
      aria-label="Execution performance pulse"
    >
      {/* 1. Tasks Completed */}
      <div className="pulse-card" role="region" aria-label="Completed tasks summary">
        <div className="pulse-card-header">
          <span className="pulse-card-title">Tasks Completed</span>
          <div className="pulse-icon-wrap icon-tasks" aria-hidden="true">
            <CheckCircle2 size={15} />
          </div>
        </div>
        <div className="pulse-metric-value">{tasksCompleted.current}</div>
        <div className="pulse-card-footer">{renderDelta()}</div>
      </div>

      {/* 2. Scheduled Completion Rate */}
      <div className="pulse-card" role="region" aria-label="Scheduled task completion rate">
        <div className="pulse-card-header">
          <span className="pulse-card-title">Scheduled Completion</span>
          <div className="pulse-icon-wrap icon-rate" aria-hidden="true">
            <Percent size={15} />
          </div>
        </div>
        <div className="pulse-metric-value">
          {taskCompletionRate.rate !== null
            ? `${taskCompletionRate.rate}%`
            : "N/A"}
        </div>
        <div className="pulse-card-footer">
          <span className="pulse-sub-text">
            {taskCompletionRate.scheduledTotal > 0
              ? `${taskCompletionRate.scheduledCompleted} of ${taskCompletionRate.scheduledTotal} scheduled tasks`
              : "No scheduled tasks in period"}
          </span>
        </div>
      </div>

      {/* 3. Habit Consistency */}
      <div className="pulse-card" role="region" aria-label="Habit consistency rate">
        <div className="pulse-card-header">
          <span className="pulse-card-title">Habit Consistency</span>
          <div className="pulse-icon-wrap icon-habits" aria-hidden="true">
            <Sparkles size={15} />
          </div>
        </div>
        <div className="pulse-metric-value">
          {habitConsistency.rate !== null ? `${habitConsistency.rate}%` : "N/A"}
        </div>
        <div className="pulse-card-footer">
          <span className="pulse-sub-text">
            {habitConsistency.totalEligibleDays > 0
              ? `${habitConsistency.totalCompletions} of ${habitConsistency.totalEligibleDays} habit-days`
              : "No active habits"}
          </span>
        </div>
      </div>

      {/* 4. Journal Reflections */}
      <div className="pulse-card" role="region" aria-label="Journal reflection consistency">
        <div className="pulse-card-header">
          <span className="pulse-card-title">Journal Reflections</span>
          <div className="pulse-icon-wrap icon-journal" aria-hidden="true">
            <BookOpen size={15} />
          </div>
        </div>
        <div className="pulse-metric-value">
          {journalReflections.daysJournaled}
          <span className="pulse-metric-sub">/ {daysCount}d</span>
        </div>
        <div className="pulse-card-footer">
          <span className="pulse-sub-text">
            {journalReflections.consistencyPercent}% reflection consistency
          </span>
        </div>
      </div>
    </section>
  );
}
