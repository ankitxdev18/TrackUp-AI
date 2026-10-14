import { AlertTriangle, CheckCircle2, Pencil, Plus, Wallet } from "lucide-react";
import { formatCents, type MonthlyBudgetSummary } from "../../api/expenses";

interface MonthlyBudgetCardProps {
  budgetSummary: MonthlyBudgetSummary | null;
  onOpenBudgetModal: () => void;
  isLoading?: boolean;
}

export function MonthlyBudgetCard({
  budgetSummary,
  onOpenBudgetModal,
  isLoading,
}: MonthlyBudgetCardProps) {
  const hasBudget = Boolean(budgetSummary && budgetSummary.budget);
  const budgetAmount = budgetSummary?.budgetAmountCents ?? 0;
  const spentAmount = budgetSummary?.spentAmountCents ?? 0;
  const remainingAmount = budgetSummary?.remainingAmountCents ?? 0;
  const overBudgetAmount = budgetSummary?.overBudgetAmountCents ?? 0;
  const utilization = budgetSummary?.utilizationPercent ?? 0;
  const isExceeded = budgetSummary?.isExceeded ?? false;

  // Clamped progress bar percentage (0 to 100)
  const clampedProgress = Math.min(Math.max(utilization, 0), 100);

  // Month label formatting, e.g. "October 2026"
  const getMonthLabel = (monthStr?: string) => {
    if (!monthStr) return "Current Month";
    const [year, month] = monthStr.split("-");
    const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  };

  const monthLabel = getMonthLabel(budgetSummary?.month);

  return (
    <section
      className="monthly-budget-card"
      aria-label="Monthly spending budget summary"
    >
      {/* Card Header */}
      <div className="budget-card-header">
        <div className="budget-header-title-group">
          <div className="budget-icon-badge" aria-hidden="true">
            <Wallet size={16} />
          </div>
          <div>
            <h2 className="budget-card-title">Monthly Budget Tracker</h2>
            <span className="budget-month-badge font-tabular">{monthLabel}</span>
          </div>
        </div>

        <button
          type="button"
          className="btn-budget-action"
          onClick={onOpenBudgetModal}
          disabled={isLoading}
          aria-label={hasBudget ? `Edit ${monthLabel} budget` : `Set ${monthLabel} budget`}
        >
          {hasBudget ? (
            <>
              <Pencil size={13} aria-hidden="true" />
              <span>Edit Budget</span>
            </>
          ) : (
            <>
              <Plus size={13} aria-hidden="true" />
              <span>Set Budget</span>
            </>
          )}
        </button>
      </div>

      {/* Content State: Empty (No Budget Configured) */}
      {!hasBudget ? (
        <div className="budget-empty-state">
          <p className="budget-empty-desc">
            No spending limit configured for this month. Set a monthly budget to
            monitor expenses, track spending velocity, and prevent overspending.
          </p>
          <button
            type="button"
            className="btn-budget-set-primary"
            onClick={onOpenBudgetModal}
          >
            <Plus size={14} aria-hidden="true" />
            <span>Set Monthly Budget</span>
          </button>
        </div>
      ) : (
        /* Content State: Configured Budget */
        <div className="budget-active-content">
          {/* Metrics Grid */}
          <div className="budget-metrics-grid">
            <div className="budget-metric-item">
              <span className="metric-label">Monthly Limit</span>
              <span className="metric-value font-tabular">
                {formatCents(budgetAmount)}
              </span>
            </div>

            <div className="budget-metric-item">
              <span className="metric-label">Spent So Far</span>
              <span className="metric-value font-tabular">
                {formatCents(spentAmount)}
              </span>
            </div>

            <div className="budget-metric-item">
              <span className="metric-label">
                {isExceeded ? "Over Budget" : "Remaining"}
              </span>
              <span
                className={`metric-value font-tabular ${
                  isExceeded ? "metric-over-budget" : "metric-remaining"
                }`}
              >
                {isExceeded
                  ? `+${formatCents(overBudgetAmount)}`
                  : formatCents(remainingAmount)}
              </span>
            </div>

            <div className="budget-metric-item">
              <span className="metric-label">Utilization</span>
              <span
                className={`metric-value font-tabular ${
                  isExceeded ? "metric-over-budget" : ""
                }`}
              >
                {utilization}%
              </span>
            </div>
          </div>

          {/* Progress Indicator */}
          <div className="budget-progress-section">
            <div
              className={`budget-progress-track ${
                isExceeded ? "is-exceeded" : utilization >= 85 ? "is-warning" : ""
              }`}
              role="progressbar"
              aria-valuenow={clampedProgress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Monthly budget utilization: ${utilization}% of ${formatCents(
                budgetAmount
              )} spent`}
            >
              <div
                className="budget-progress-fill"
                style={{ width: `${clampedProgress}%` }}
              />
            </div>
          </div>

          {/* Alert / Status Bar */}
          {isExceeded ? (
            <div className="budget-alert-banner alert-danger" role="status">
              <AlertTriangle size={15} aria-hidden="true" />
              <span>
                <strong>Budget Exceeded:</strong> Spending is{" "}
                {formatCents(overBudgetAmount)} above your configured limit (
                {utilization}% utilized).
              </span>
            </div>
          ) : utilization >= 85 ? (
            <div className="budget-alert-banner alert-warning" role="status">
              <AlertTriangle size={15} aria-hidden="true" />
              <span>
                <strong>Approaching Limit:</strong> You have utilized {utilization}% of
                your monthly budget ({formatCents(remainingAmount)} remaining).
              </span>
            </div>
          ) : (
            <div className="budget-alert-banner alert-healthy" role="status">
              <CheckCircle2 size={15} aria-hidden="true" />
              <span>
                On track for {monthLabel} — {formatCents(remainingAmount)} remaining (
                {utilization}% spent).
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
