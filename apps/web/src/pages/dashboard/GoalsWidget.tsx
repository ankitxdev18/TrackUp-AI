import { AlertCircle, Clock, Plus, RefreshCw, Target } from "lucide-react";
import { formatTargetDate, type Goal } from "../../api/goals";
import { Link, useRouter } from "../../router/Router";

interface GoalsWidgetProps {
  goals: Goal[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

export function GoalsWidget({
  goals,
  loading,
  error,
  onRetry,
}: GoalsWidgetProps) {
  const { navigate } = useRouter();

  return (
    <section className="dashboard-panel" aria-labelledby="active-goals-heading">
      <div className="panel-title-bar">
        <h2 id="active-goals-heading" className="panel-heading">
          Active Goals
        </h2>
        <Link
          to="/goals"
          className="panel-link-all"
        >
          View all →
        </Link>
      </div>

      {loading ? (
        <div className="dash-skeleton-list" role="status" aria-label="Loading goals">
          <div className="dash-skeleton-card" />
          <div className="dash-skeleton-card" />
        </div>
      ) : error ? (
        <div
          className="dash-empty-upcoming"
          style={{
            minHeight: "80px",
            borderColor: "var(--border-danger, #ef4444)",
            color: "var(--danger, #ef4444)",
          }}
          role="alert"
        >
          <AlertCircle size={18} />
          <p className="dash-empty-text" style={{ color: "var(--danger, #ef4444)" }}>
            {error}
          </p>
          <button
            id="btn-dash-goals-retry"
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onRetry}
            style={{ marginTop: "4px" }}
            aria-label="Retry goals"
          >
            <RefreshCw size={12} />
            <span>Retry goals</span>
          </button>
        </div>
      ) : goals.length === 0 ? (
        <div className="dash-empty-compact">
          <Target size={20} className="dash-empty-icon" />
          <p className="dash-empty-text">No active goals yet.</p>
          <Link to="/goals" className="btn-dash-create-sm">
            <Plus size={12} />
            <span>Create goal</span>
          </Link>
        </div>
      ) : (
        <div className="dash-projects-list">
          {goals.slice(0, 3).map((goal) => {
            const clamped = Math.min(
              100,
              Math.max(
                0,
                isNaN(Number(goal.progress)) ? 0 : Math.round(Number(goal.progress))
              )
            );
            const formattedTarget = formatTargetDate(goal.targetDate);

            return (
              <div
                key={goal.id}
                className="dash-project-item"
                onClick={() => navigate(`/goals/${goal.id}`)}
                role="link"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter") navigate(`/goals/${goal.id}`);
                }}
                aria-label={`Open goal ${goal.title}`}
              >
                <div className="dash-project-meta-row">
                  <span className="dash-project-name">{goal.title}</span>
                  <span className="dash-project-ratio">{clamped}%</span>
                </div>
                <div
                  className="dash-project-track"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={clamped}
                  aria-label={`${goal.title} progress: ${clamped}%`}
                >
                  <div
                    className="dash-project-fill"
                    style={{
                      width: `${clamped}%`,
                      backgroundColor:
                        clamped === 100 ? "var(--color-success)" : "var(--primary)",
                    }}
                  />
                </div>
                {formattedTarget && (
                  <div className="dash-target-pill">
                    <Clock size={11} />
                    <span>Target: {formattedTarget}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
