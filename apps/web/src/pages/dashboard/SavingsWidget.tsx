import { useCallback, useEffect, useState } from "react";
import { AlertCircle, PiggyBank, Plus, RefreshCw, TrendingUp } from "lucide-react";
import {
  fetchActiveSavingsGoal,
  formatSavingsPaise,
  type ActiveSavingsGoal,
} from "../../api/savings";
import { Link, useRouter } from "../../router/Router";

export function SavingsWidget() {
  const { navigate } = useRouter();
  const [goal, setGoal] = useState<ActiveSavingsGoal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSavingsData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const activeGoal = await fetchActiveSavingsGoal();
      setGoal(activeGoal);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to load savings goal"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSavingsData();
  }, [loadSavingsData]);

  const clampedProgress = goal
    ? Math.min(100, Math.max(0, isNaN(goal.progressPercent) ? 0 : goal.progressPercent))
    : 0;

  return (
    <section className="dashboard-panel" aria-labelledby="savings-widget-heading">
      <div className="panel-title-bar">
        <h2 id="savings-widget-heading" className="panel-heading">
          Savings Goal
        </h2>
        <Link to="/savings" className="panel-link-all">
          View all →
        </Link>
      </div>

      {loading ? (
        <div className="dash-skeleton-list" role="status" aria-label="Loading savings goal">
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
            id="btn-dash-savings-retry"
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={loadSavingsData}
            style={{ marginTop: "4px" }}
            aria-label="Retry loading savings"
          >
            <RefreshCw size={12} />
            <span>Retry</span>
          </button>
        </div>
      ) : !goal ? (
        <div className="dash-empty-compact">
          <PiggyBank size={20} className="dash-empty-icon" />
          <p className="dash-empty-text">No active savings goal.</p>
          <Link to="/savings" className="btn-dash-create-sm">
            <Plus size={12} />
            <span>Set goal</span>
          </Link>
        </div>
      ) : (
        <div
          className="dash-project-item"
          onClick={() => navigate("/savings")}
          role="link"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter") navigate("/savings");
          }}
          aria-label={`Open savings goal ${goal.name}`}
          style={{ cursor: "pointer" }}
        >
          <div className="dash-project-meta-row">
            <span className="dash-project-name">{goal.name}</span>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <TrendingUp size={12} className="text-muted" aria-hidden="true" />
              <span className="dash-project-ratio">{goal.progressPercent}%</span>
            </div>
          </div>

          <div
            className="dash-project-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={clampedProgress}
            aria-label={`${goal.name} savings progress: ${goal.progressPercent}%`}
          >
            <div
              className="dash-project-fill"
              style={{
                width: `${clampedProgress}%`,
                backgroundColor:
                  clampedProgress >= 100
                    ? "var(--color-success)"
                    : "var(--primary)",
              }}
            />
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "0.75rem",
              marginTop: "2px",
              color: "var(--text-secondary)",
            }}
          >
            <span>{formatSavingsPaise(goal.savedAmountCents)} saved</span>
            <span style={{ color: "var(--text-muted)" }}>
              Target: {formatSavingsPaise(goal.targetAmountCents)}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
