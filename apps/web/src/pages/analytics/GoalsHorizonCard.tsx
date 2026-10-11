import { Calendar, Target } from "lucide-react";
import type { AnalyticsOverviewData } from "../../api/analytics";
import { Link } from "../../router/Router";

interface GoalsHorizonCardProps {
  goals: AnalyticsOverviewData["goals"];
  statusSummary: AnalyticsOverviewData["summary"]["activeGoals"];
}

export function GoalsHorizonCard({
  goals,
  statusSummary,
}: GoalsHorizonCardProps) {
  const activeGoals = goals.filter((g) => g.status === "ACTIVE");

  return (
    <div className="analytics-card" role="region" aria-label="Goals horizon progress">
      <div className="analytics-card-header">
        <div className="analytics-card-title-group">
          <div className="card-header-icon" aria-hidden="true">
            <Target size={16} />
          </div>
          <div>
            <h2 className="analytics-card-title">Goals Horizon</h2>
            <span className="analytics-card-caption">
              {statusSummary.activeCount} active, {statusSummary.completedCount} completed
            </span>
          </div>
        </div>

        {statusSummary.activeCount > 0 && (
          <div className="card-header-badge">
            <span>Avg {statusSummary.averageProgress}%</span>
          </div>
        )}
      </div>

      <div className="analytics-card-body">
        {activeGoals.length === 0 ? (
          <div className="empty-sub-state">
            <span>No active goals defined. Add goals in the Goals module to track milestones.</span>
          </div>
        ) : (
          <div className="goal-items-container">
            {activeGoals.map((g) => (
              <Link
                key={g.id}
                to={`/goals/${g.id}`}
                className="goal-analytics-item"
                style={{ textDecoration: "none" }}
                aria-label={`Goal ${g.title}, ${g.progress} percent complete`}
              >
                <div className="goal-item-header">
                  <span className="goal-item-title">{g.title}</span>
                  <span className="goal-item-pct">{g.progress}%</span>
                </div>

                <div className="linear-track">
                  <div
                    className="linear-bar goal-bar"
                    style={{ width: `${Math.min(100, Math.max(0, g.progress))}%` }}
                  />
                </div>

                {g.targetDate && (
                  <div className="goal-item-meta">
                    <Calendar size={11} aria-hidden="true" />
                    <span>Target: {g.targetDate}</span>
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
