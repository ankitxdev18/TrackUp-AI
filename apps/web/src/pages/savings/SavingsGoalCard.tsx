import {
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  PiggyBank,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { formatSavingsPaise, type ActiveSavingsGoal } from "../../api/savings";

interface SavingsGoalCardProps {
  goal: ActiveSavingsGoal;
  onAddDeposit: () => void;
  onCompleteGoal: () => void;
}

export function SavingsGoalCard({
  goal,
  onAddDeposit,
  onCompleteGoal,
}: SavingsGoalCardProps) {
  // Clamped strictly between 0 and 100 for visual progress-bar width
  const visualProgressWidth = Math.min(
    100,
    Math.max(0, isNaN(goal.progressPercent) ? 0 : goal.progressPercent)
  );

  const isTargetReached = goal.progressPercent >= 100;

  const formattedCreatedDate = (() => {
    try {
      const d = new Date(goal.createdAt);
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return "Recently";
    }
  })();

  return (
    <div className="savings-hero-card" role="region" aria-label="Active Savings Goal Details">
      {/* Header Row: Title, Status Pill, Created Date */}
      <div className="savings-card-top-row">
        <div className="savings-title-area">
          <div className="savings-icon-container" aria-hidden="true">
            <PiggyBank size={24} />
          </div>
          <div>
            <div className="savings-badge-row">
              <span className="status-badge status-badge-active" aria-label="Goal status: Active">
                <span className="status-indicator-dot" aria-hidden="true" />
                Active Goal
              </span>
              {isTargetReached && (
                <span className="status-badge status-badge-reached">
                  <Sparkles size={12} />
                  Target Reached
                </span>
              )}
            </div>
            <h2 className="savings-goal-name">{goal.name}</h2>
          </div>
        </div>

        <div className="savings-meta-pill" title={`Created on ${formattedCreatedDate}`}>
          <Calendar size={13} aria-hidden="true" />
          <span>Started {formattedCreatedDate}</span>
        </div>
      </div>

      {/* Main Amounts Display */}
      <div className="savings-amount-display">
        <div className="amount-primary-block">
          <span className="amount-caption">Current Saved Amount</span>
          <div className="amount-headline-row">
            <span className="amount-headline" aria-label={`Saved ${formatSavingsPaise(goal.savedAmountCents)}`}>
              {formatSavingsPaise(goal.savedAmountCents)}
            </span>
            <span className="amount-target-subtext">
              of {formatSavingsPaise(goal.targetAmountCents)} target
            </span>
          </div>
        </div>

        <div className="savings-progress-badge" aria-label={`Progress: ${goal.progressPercent}%`}>
          <TrendingUp size={14} aria-hidden="true" />
          <span>{goal.progressPercent}%</span>
        </div>
      </div>

      {/* Progress Track */}
      <div
        className="savings-progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={visualProgressWidth}
        aria-label={`${goal.name} savings progress: ${goal.progressPercent}%`}
      >
        <div
          className={`savings-progress-fill ${isTargetReached ? "fill-success" : ""}`}
          style={{ width: `${visualProgressWidth}%` }}
        />
      </div>

      {/* Metrics Row */}
      <div className="savings-metrics-grid">
        <div className="savings-metric-box">
          <span className="metric-label">Target Amount</span>
          <strong className="metric-value">
            {formatSavingsPaise(goal.targetAmountCents)}
          </strong>
        </div>

        <div className="savings-metric-box">
          <span className="metric-label">Remaining to Save</span>
          <strong
            className={`metric-value ${
              isTargetReached ? "text-success" : "text-primary"
            }`}
          >
            {isTargetReached ? "₹0.00" : formatSavingsPaise(goal.remainingAmountCents)}
          </strong>
        </div>

        <div className="savings-metric-box">
          <span className="metric-label">Contributions</span>
          <strong className="metric-value">
            {goal.contributionCount}{" "}
            <span className="metric-unit">
              {goal.contributionCount === 1 ? "deposit" : "deposits"}
            </span>
          </strong>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="savings-actions-bar">
        <button
          id="btn-open-add-deposit"
          type="button"
          className="btn btn-primary btn-deposit"
          onClick={onAddDeposit}
        >
          <ArrowUpRight size={16} />
          <span>Add Deposit</span>
        </button>

        <button
          id="btn-open-complete-goal"
          type="button"
          className="btn btn-secondary btn-complete"
          onClick={onCompleteGoal}
        >
          <CheckCircle2 size={16} />
          <span>Complete Goal</span>
        </button>
      </div>
    </div>
  );
}
