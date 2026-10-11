import { AlertTriangle, CheckSquare, ShieldCheck } from "lucide-react";
import type { AnalyticsOverviewData } from "../../api/analytics";
import { Link } from "../../router/Router";

interface TasksBreakdownCardProps {
  tasks: AnalyticsOverviewData["tasks"];
  summary: AnalyticsOverviewData["summary"]["tasksCompleted"];
}

export function TasksBreakdownCard({ tasks, summary }: TasksBreakdownCardProps) {
  const { byPriority, currentOverdueCount } = tasks;
  const totalCompleted = summary.current;

  const highCount = byPriority.high || 0;
  const mediumCount = byPriority.medium || 0;
  const lowCount = byPriority.low || 0;

  const highPct = totalCompleted > 0 ? (highCount / totalCompleted) * 100 : 0;
  const mediumPct =
    totalCompleted > 0 ? (mediumCount / totalCompleted) * 100 : 0;
  const lowPct = totalCompleted > 0 ? (lowCount / totalCompleted) * 100 : 0;

  return (
    <div className="analytics-card" role="region" aria-label="Task execution breakdown">
      <div className="analytics-card-header">
        <div className="analytics-card-title-group">
          <div className="card-header-icon" aria-hidden="true">
            <CheckSquare size={16} />
          </div>
          <div>
            <h2 className="analytics-card-title">Task Execution</h2>
            <span className="analytics-card-caption">
              {totalCompleted} tasks completed in period
            </span>
          </div>
        </div>
      </div>

      <div className="analytics-card-body">
        {/* Priority Stacked Distribution Bar */}
        <div className="priority-section">
          <div className="priority-section-header">
            <span className="section-label">Priority Breakdown</span>
            <span className="section-meta">
              {totalCompleted === 0 ? "No completed tasks" : `${totalCompleted} total`}
            </span>
          </div>

          <div
            className="stacked-bar-track"
            role="progressbar"
            aria-label="Completed tasks by priority"
            aria-valuenow={totalCompleted}
          >
            {totalCompleted > 0 ? (
              <>
                {highPct > 0 && (
                  <div
                    className="stacked-segment segment-high"
                    style={{ width: `${highPct}%` }}
                    title={`High Priority: ${highCount} (${Math.round(highPct)}%)`}
                  />
                )}
                {mediumPct > 0 && (
                  <div
                    className="stacked-segment segment-medium"
                    style={{ width: `${mediumPct}%` }}
                    title={`Medium Priority: ${mediumCount} (${Math.round(mediumPct)}%)`}
                  />
                )}
                {lowPct > 0 && (
                  <div
                    className="stacked-segment segment-low"
                    style={{ width: `${lowPct}%` }}
                    title={`Low Priority: ${lowCount} (${Math.round(lowPct)}%)`}
                  />
                )}
              </>
            ) : (
              <div className="stacked-segment segment-empty" style={{ width: "100%" }} />
            )}
          </div>

          {/* Legend Items */}
          <div className="priority-legend">
            <div className="legend-item">
              <span className="legend-dot dot-high" aria-hidden="true" />
              <span className="legend-name">High:</span>
              <span className="legend-value">{highCount}</span>
            </div>
            <div className="legend-item">
              <span className="legend-dot dot-medium" aria-hidden="true" />
              <span className="legend-name">Medium:</span>
              <span className="legend-value">{mediumCount}</span>
            </div>
            <div className="legend-item">
              <span className="legend-dot dot-low" aria-hidden="true" />
              <span className="legend-name">Low:</span>
              <span className="legend-value">{lowCount}</span>
            </div>
          </div>
        </div>

        {/* Attention / Overdue Snapshot Banner with Deep Link */}
        {currentOverdueCount > 0 ? (
          <Link
            to="/tasks"
            className="overdue-status-box has-overdue"
            style={{ textDecoration: "none" }}
            aria-label={`${currentOverdueCount} overdue tasks. Click to triage in Tasks module.`}
          >
            <div className="overdue-icon-wrap" aria-hidden="true">
              <AlertTriangle size={15} />
            </div>
            <div className="overdue-content">
              <span className="overdue-title">
                {currentOverdueCount} Overdue Task{currentOverdueCount > 1 ? "s" : ""}
              </span>
              <span className="overdue-desc">
                Tasks scheduled before today require attention. Click to triage.
              </span>
            </div>
          </Link>
        ) : (
          <div className="overdue-status-box all-clear">
            <div className="clear-icon-wrap" aria-hidden="true">
              <ShieldCheck size={15} />
            </div>
            <div className="overdue-content">
              <span className="overdue-title">Zero Overdue Tasks</span>
              <span className="overdue-desc">
                All scheduled tasks are up-to-date with current timeline.
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
