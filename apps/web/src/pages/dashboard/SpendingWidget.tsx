import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Plus,
  Receipt,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  fetchExpenses,
  fetchMonthlyBudget,
  formatCents,
  formatMonthName,
  getCalendarMonthInTimezone,
  getCategoryMeta,
  type Expense,
  type MonthlyBudgetSummary,
} from "../../api/expenses";
import { useOptionalAuth } from "../../context/AuthContext";
import { Link, useRouter } from "../../router/Router";

function useSafeUserTimezone(): string | undefined {
  const auth = useOptionalAuth();
  return auth?.user?.timezone;
}

function formatExpenseDate(dateStr: string): string {
  try {
    const [year, month, day] = dateStr.split("-").map(Number);
    const d = new Date(Date.UTC(year, month - 1, day));
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return dateStr;
  }
}

export function SpendingWidget() {
  const { navigate } = useRouter();
  const userTimezone = useSafeUserTimezone();

  const currentMonth = useMemo(
    () => getCalendarMonthInTimezone(userTimezone),
    [userTimezone]
  );
  const monthLabel = useMemo(
    () => formatMonthName(currentMonth),
    [currentMonth]
  );

  const [budgetSummary, setBudgetSummary] = useState<MonthlyBudgetSummary | null>(null);
  const [recentExpenses, setRecentExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSpendingData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Concurrent fetch: authoritative monthly spending/budget summary + recent transactions
      const [budgetRes, expensesRes] = await Promise.allSettled([
        fetchMonthlyBudget(currentMonth),
        fetchExpenses({ limit: 3 }),
      ]);

      if (budgetRes.status === "rejected" && expensesRes.status === "rejected") {
        throw new Error(
          budgetRes.reason instanceof Error
            ? budgetRes.reason.message
            : "Failed to load spending data"
        );
      }

      if (budgetRes.status === "fulfilled") {
        setBudgetSummary(budgetRes.value);
      } else {
        setBudgetSummary(null);
      }

      if (expensesRes.status === "fulfilled") {
        setRecentExpenses(expensesRes.value?.expenses ?? []);
      } else {
        setRecentExpenses([]);
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load spending data. Please check your connection and try again."
      );
    } finally {
      setLoading(false);
    }
  }, [currentMonth]);

  useEffect(() => {
    loadSpendingData();
  }, [loadSpendingData]);

  // Visual progress clamped strictly between 0% and 100%
  const clampedBudgetProgress = budgetSummary?.budgetAmountCents
    ? Math.min(
        100,
        Math.max(0, isNaN(budgetSummary.utilizationPercent) ? 0 : budgetSummary.utilizationPercent)
      )
    : 0;

  const hasBudget = budgetSummary?.budget !== null && budgetSummary?.budgetAmountCents !== null;
  const spentAmount = budgetSummary?.spentAmountCents ?? 0;
  const transactionCount = budgetSummary?.transactionCount ?? 0;

  return (
    <section className="dashboard-panel" aria-labelledby="spending-widget-heading">
      {/* Title Bar */}
      <div className="panel-title-bar">
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <Receipt size={16} className="text-muted" aria-hidden="true" />
          <h2 id="spending-widget-heading" className="panel-heading">
            Monthly Spending
          </h2>
        </div>
        <Link
          to="/expenses"
          className="panel-link-all"
          aria-label="View all expenses"
        >
          View all →
        </Link>
      </div>

      {loading ? (
        <div
          className="dash-skeleton-list"
          role="status"
          aria-label="Loading spending data"
        >
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
          <p
            className="dash-empty-text"
            style={{ color: "var(--danger, #ef4444)" }}
          >
            {error}
          </p>
          <button
            id="btn-spending-retry"
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={loadSpendingData}
            style={{ marginTop: "4px" }}
            aria-label="Retry loading spending"
          >
            <RefreshCw size={12} />
            <span>Retry</span>
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {/* Main Spending Headline Row */}
          <div className="dash-spending-headline">
            <div>
              <div
                className="dash-spending-total"
                aria-label={`Total spent this month: ${formatCents(spentAmount)}`}
              >
                {formatCents(spentAmount)}
              </div>
              <span className="dash-spending-period-caption">
                Spent in {monthLabel}
              </span>
            </div>

            <span
              className="dash-spending-count-pill"
              aria-label={`${transactionCount} transactions recorded this month`}
            >
              {transactionCount}{" "}
              {transactionCount === 1 ? "transaction" : "transactions"}
            </span>
          </div>

          {/* Budget Progress or Prompt Card */}
          {hasBudget && budgetSummary ? (
            <div className="dash-spending-budget-card">
              <div className="dash-spending-budget-meta">
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  {budgetSummary.isExceeded ? (
                    <TrendingDown
                      size={13}
                      style={{ color: "var(--color-danger, #ef4444)" }}
                      aria-hidden="true"
                    />
                  ) : (
                    <TrendingUp
                      size={13}
                      className="text-muted"
                      aria-hidden="true"
                    />
                  )}
                  <span>
                    <strong>{budgetSummary.utilizationPercent}%</strong> of{" "}
                    {formatCents(budgetSummary.budgetAmountCents!)}
                  </span>
                </div>

                {budgetSummary.isExceeded ? (
                  <strong style={{ color: "var(--color-danger, #ef4444)" }}>
                    {formatCents(budgetSummary.overBudgetAmountCents)} over budget
                  </strong>
                ) : (
                  <span>
                    {formatCents(budgetSummary.remainingAmountCents)} remaining
                  </span>
                )}
              </div>

              <div
                className="dash-project-track"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={clampedBudgetProgress}
                aria-label={`Budget utilization: ${budgetSummary.utilizationPercent}%`}
              >
                <div
                  className="dash-project-fill"
                  style={{
                    width: `${clampedBudgetProgress}%`,
                    backgroundColor: budgetSummary.isExceeded
                      ? "var(--color-danger, #ef4444)"
                      : "var(--primary)",
                  }}
                />
              </div>
            </div>
          ) : (
            <div
              className="dash-empty-compact"
              style={{ padding: "8px 10px", minHeight: "auto" }}
            >
              <p
                className="dash-empty-text"
                style={{ fontSize: "0.75rem", margin: 0 }}
              >
                No budget set for {monthLabel}.
              </p>
              <Link
                to="/expenses"
                className="btn-dash-create-sm"
                aria-label="Set monthly budget"
              >
                <Plus size={12} />
                <span>Set budget</span>
              </Link>
            </div>
          )}

          {/* Recent Expenses Ledger Slice */}
          {recentExpenses.length > 0 ? (
            <div className="dash-spending-recent-section">
              <span className="dash-spending-recent-title">Recent Expenses</span>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                {recentExpenses.map((exp) => {
                  const categoryMeta = getCategoryMeta(exp.categoryId);
                  const Icon = categoryMeta.icon;
                  const desc = exp.description?.trim() || categoryMeta.name;

                  return (
                    <div
                      key={exp.id}
                      className="dash-expense-mini-item"
                      onClick={() => navigate("/expenses")}
                      role="link"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") navigate("/expenses");
                      }}
                      aria-label={`${desc}: -${formatCents(exp.amountCents)} on ${formatExpenseDate(exp.date)}`}
                      style={{ cursor: "pointer" }}
                    >
                      <div className="dash-expense-mini-left">
                        <div
                          className="dash-expense-icon-badge"
                          style={{
                            backgroundColor: categoryMeta.bgColor,
                            color: categoryMeta.color,
                          }}
                          aria-hidden="true"
                        >
                          <Icon size={12} />
                        </div>
                        <div className="dash-expense-mini-details">
                          <span className="dash-expense-mini-desc" title={desc}>
                            {desc}
                          </span>
                          <span className="dash-expense-mini-date">
                            {formatExpenseDate(exp.date)}
                          </span>
                        </div>
                      </div>

                      <span className="dash-expense-mini-amount">
                        -{formatCents(exp.amountCents)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div
              className="dash-empty-compact"
              style={{ padding: "10px", minHeight: "auto" }}
            >
              <p
                className="dash-empty-text"
                style={{ fontSize: "0.75rem", margin: 0 }}
              >
                No expenses recorded this month.
              </p>
              <Link
                to="/expenses"
                className="btn-dash-create-sm"
                aria-label="Add expense"
              >
                <Plus size={12} />
                <span>Add expense</span>
              </Link>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
