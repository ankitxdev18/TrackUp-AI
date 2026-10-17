import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOptionalAuth } from "../context/AuthContext";


import {
  createExpense,
  deleteExpense,
  deleteMonthlyBudget,
  fetchExpenses,
  fetchExpenseSummary,
  fetchMonthlyBudget,
  getCalendarMonthInTimezone,
  saveMonthlyBudget,
  updateExpense,
  type Expense,
  type ExpenseSummaryResponse,
  type MonthlyBudgetSummary,
} from "../api/expenses";
import { BudgetModal } from "./expenses/BudgetModal";
import { CategoryDistributionBar } from "./expenses/CategoryDistributionBar";
import { DeleteExpenseDialog } from "./expenses/DeleteExpenseDialog";
import {
  ExpenseFilterToolbar,
  type PeriodFilterOption,
} from "./expenses/ExpenseFilterToolbar";
import { ExpenseLedgerTable } from "./expenses/ExpenseLedgerTable";
import { ExpenseModal } from "./expenses/ExpenseModal";
import { ExpensesHeader } from "./expenses/ExpensesHeader";
import { MonthlyBudgetCard } from "./expenses/MonthlyBudgetCard";
import { SpendingPulseCards } from "./expenses/SpendingPulseCards";
import "./ExpensesPage.css";

/**
 * Calculates milliseconds remaining until the next calendar midnight boundary (plus 1s buffer)
 * evaluated in the target timezone (or local time) so timers fire deterministically across days.
 */
function getMsUntilNextMidnight(timeZone?: string, now = new Date()): number {
  try {
    if (timeZone) {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
        hour12: false,
      });
      const parts = formatter.formatToParts(now);
      const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
      const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
      const second = parseInt(parts.find((p) => p.type === "second")?.value ?? "0", 10);
      const secondsRemaining = (23 - hour) * 3600 + (59 - minute) * 60 + (60 - second) + 1;
      return Math.max(1000, secondsRemaining * 1000);
    }
  } catch {
    // Fall back to local time
  }
  const nextMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    0,
    1
  );
  return Math.max(1000, nextMidnight.getTime() - now.getTime());
}

/**
 * Safe hook to read user timezone from AuthContext without throwing if mounted outside AuthProvider.
 */
function useSafeUserTimezone(): string | undefined {
  const auth = useOptionalAuth();
  return auth?.user?.timezone;
}

export interface ExpensesPageProps {
  timezone?: string;
}

export function ExpensesPage({ timezone: propTimezone }: ExpensesPageProps = {}) {
  const authTimezone = useSafeUserTimezone();
  const effectiveTimezone = propTimezone || authTimezone;

  const [period, setPeriod] = useState<PeriodFilterOption>("month");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<ExpenseSummaryResponse | null>(null);
  const [budgetSummary, setBudgetSummary] = useState<MonthlyBudgetSummary | null>(null);

  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);

  const hasLoadedRef = useRef(false);

  const showFeedback = (msg: string) => {
    setFeedbackMessage(msg);
    setTimeout(() => {
      setFeedbackMessage((current) => (current === msg ? null : current));
    }, 3500);
  };

  // The Monthly Budget tracker always targets the active calendar month,
  // updating dynamically across midnight/month rollovers while remaining
  // independent of table date filters (such as '30d' or 'last_month').
  const [activeCalendarMonth, setActiveCalendarMonth] = useState<string>(() =>
    getCalendarMonthInTimezone(effectiveTimezone)
  );

  const activeRequestIdRef = useRef(0);

  // Synchronize active calendar month if the calendar month has rolled over
  const syncMonthRollover = useCallback((): boolean => {
    const latestMonth = getCalendarMonthInTimezone(effectiveTimezone);
    let hasChanged = false;
    setActiveCalendarMonth((prev) => {
      if (prev !== latestMonth) {
        hasChanged = true;
        return latestMonth;
      }
      return prev;
    });
    return hasChanged;
  }, [effectiveTimezone]);

  // Synchronize active calendar month when authoritative timezone changes
  useEffect(() => {
    if (effectiveTimezone) {
      const targetMonth = getCalendarMonthInTimezone(effectiveTimezone);
      setActiveCalendarMonth((prev) => (prev !== targetMonth ? targetMonth : prev));
    }
  }, [effectiveTimezone]);

  // Listen for window focus, document visibility, and schedule a timeout for the next calendar boundary (midnight)
  // so continuous-visible sessions roll over without polling or hard refresh.
  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const scheduleNextRollover = () => {
      if (timerId) {
        clearTimeout(timerId);
      }
      const delay = getMsUntilNextMidnight(effectiveTimezone);
      timerId = setTimeout(() => {
        syncMonthRollover();
        scheduleNextRollover();
      }, delay);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        syncMonthRollover();
        scheduleNextRollover();
      }
    };

    const handleFocus = () => {
      syncMonthRollover();
      scheduleNextRollover();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    scheduleNextRollover();

    return () => {
      if (timerId) {
        clearTimeout(timerId);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [syncMonthRollover, effectiveTimezone]);

  // Compute period boundaries YYYY-MM-DD
  const { startDate, endDate } = useMemo(() => {
    const today = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const formatYMD = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (period === "30d") {
      const past30 = new Date(today);
      past30.setDate(today.getDate() - 29);
      return {
        startDate: formatYMD(past30),
        endDate: formatYMD(today),
      };
    }

    if (period === "last_month") {
      const firstDayPrevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDayPrevMonth = new Date(today.getFullYear(), today.getMonth(), 0);
      return {
        startDate: formatYMD(firstDayPrevMonth),
        endDate: formatYMD(lastDayPrevMonth),
      };
    }

    // Default "month" (Current Month)
    const firstDayMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDayMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return {
      startDate: formatYMD(firstDayMonth),
      endDate: formatYMD(lastDayMonth),
    };
  }, [period, activeCalendarMonth]);

  const loadData = useCallback(
    async (forceInitial?: boolean) => {
      const isInitial = forceInitial ?? !hasLoadedRef.current;
      const latestMonth = getCalendarMonthInTimezone(effectiveTimezone);
      if (latestMonth !== activeCalendarMonth) {
        setActiveCalendarMonth(latestMonth);
        return;
      }

      const reqId = ++activeRequestIdRef.current;
      try {
        if (isInitial) {
          setLoading(true);
        } else {
          setIsRefreshing(true);
        }
        setError(null);

        const [expensesRes, summaryRes, budgetRes] = await Promise.all([
          fetchExpenses({
            startDate,
            endDate,
            categoryId: selectedCategory || undefined,
            search: searchQuery || undefined,
            limit: 200,
          }),
          fetchExpenseSummary(startDate, endDate),
          fetchMonthlyBudget(activeCalendarMonth).catch(() => null),
        ]);

        if (reqId === activeRequestIdRef.current) {
          setExpenses(expensesRes.expenses);
          setSummary(summaryRes);
          if (budgetRes && budgetRes.month === activeCalendarMonth) {
            setBudgetSummary(budgetRes);
          } else if (!budgetRes) {
            setBudgetSummary(null);
          }
        }
      } catch (err: unknown) {
        if (reqId === activeRequestIdRef.current) {
          setError(
            err instanceof Error ? err.message : "Failed to load financial records"
          );
        }
      } finally {
        if (reqId === activeRequestIdRef.current) {
          setLoading(false);
          setIsRefreshing(false);
          hasLoadedRef.current = true;
        }
      }
    },
    [startDate, endDate, activeCalendarMonth, selectedCategory, searchQuery, effectiveTimezone]
  );

  useEffect(() => {
    loadData();
    return () => {
      // Invalidate in-flight requests on unmount
      activeRequestIdRef.current++;
    };
  }, [loadData]);

  const handleOpenCreateModal = () => {
    setEditingExpense(null);
    setIsModalOpen(true);
  };

  const handleEditExpense = (expense: Expense) => {
    setEditingExpense(expense);
    setIsModalOpen(true);
  };

  const handleModalSubmit = async (data: {
    amountCents: number;
    date: string;
    categoryId: string;
    description: string | null;
  }) => {
    if (editingExpense) {
      await updateExpense(editingExpense.id, data);
      showFeedback("Expense updated successfully");
    } else {
      await createExpense(data);
      showFeedback("Expense logged successfully");
    }
    // Refresh page data to ensure aggregations reflect update
    await loadData();
  };

  const handleConfirmDelete = async (id: string) => {
    await deleteExpense(id);
    showFeedback("Expense deleted successfully");
    await loadData();
  };

  const handleSaveBudget = async (input: { month: string; amountCents: number }) => {
    await saveMonthlyBudget(input);
    showFeedback("Monthly budget saved successfully");
    const updated = await fetchMonthlyBudget(input.month);
    if (input.month === activeCalendarMonth) {
      setBudgetSummary(updated);
    }
  };

  const handleDeleteBudget = async (month: string) => {
    await deleteMonthlyBudget(month);
    showFeedback("Monthly budget removed successfully");
    const updated = await fetchMonthlyBudget(month);
    if (month === activeCalendarMonth) {
      setBudgetSummary(updated);
    }
  };

  const handleResetFilters = () => {
    setSelectedCategory("");
    setSearchQuery("");
  };

  return (
    <div className="expenses-page-container">
      {/* Zone 1: Orientation Header */}
      <ExpensesHeader
        startDate={startDate}
        endDate={endDate}
        onOpenCreateModal={handleOpenCreateModal}
      />

      {/* Mutation Feedback Toast */}
      {feedbackMessage && (
        <div className="expenses-feedback-toast" role="status" aria-live="polite">
          <CheckCircle2 size={16} />
          <span>{feedbackMessage}</span>
        </div>
      )}

      {/* Error Banner with Retry */}
      {error && summary && (
        <div className="expenses-error-banner" role="alert">
          <AlertCircle size={18} />
          <div className="error-text">
            <strong>Unable to update financial records:</strong> {error}
          </div>
          <button
            type="button"
            className="btn-retry"
            onClick={() => loadData(true)}
          >
            Retry
          </button>
        </div>
      )}

      {/* Dedicated Error State when no summary data could be fetched */}
      {error && !summary && expenses.length === 0 ? (
        <div className="expenses-error-card" role="alert">
          <div className="error-icon-wrap" aria-hidden="true">
            <AlertCircle size={28} />
          </div>
          <h2 className="error-title">Unable to Load Financial Data</h2>
          <p className="error-desc">{error}</p>
          <button
            type="button"
            className="btn-retry"
            onClick={() => loadData(true)}
          >
            Retry Connection
          </button>
        </div>
      ) : loading && !summary ? (
        /* Initial Loading Shimmer */
        <div className="expenses-skeleton-wrap" aria-label="Loading expenses">
          <div className="skeleton-cards-grid">
            <div className="skeleton-card shimmer" />
            <div className="skeleton-card shimmer" />
            <div className="skeleton-card shimmer" />
          </div>
          <div className="skeleton-bar shimmer" />
          <div className="skeleton-table shimmer" />
        </div>
      ) : (
        <div className={`expenses-content-body ${isRefreshing ? "is-refreshing" : ""}`}>
          {/* Refreshing Spinner */}
          {isRefreshing && (
            <div className="expenses-refresh-indicator" aria-live="polite">
              <Loader2 size={14} className="spinner" />
              <span>Updating ledger...</span>
            </div>
          )}

          {/* Zone 2: Spending Pulse & Category Breakdown Strip */}
          <SpendingPulseCards
            totalAmountCents={summary?.totalAmountCents ?? 0}
            transactionCount={summary?.transactionCount ?? 0}
            byCategory={summary?.byCategory ?? []}
            isUnavailable={!summary}
          />

          <CategoryDistributionBar
            byCategory={summary?.byCategory ?? []}
            totalAmountCents={summary?.totalAmountCents ?? 0}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
          />

          {/* Zone 2.5: Monthly Spending Budget Tracker */}
          <MonthlyBudgetCard
            budgetSummary={
              budgetSummary && budgetSummary.month === activeCalendarMonth
                ? budgetSummary
                : null
            }
            onOpenBudgetModal={() => setIsBudgetModalOpen(true)}
            isLoading={isRefreshing}
          />

          {/* Zone 3: Filter & Search Toolbar */}
          <ExpenseFilterToolbar
            period={period}
            onPeriodChange={setPeriod}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onResetFilters={handleResetFilters}
          />

          {/* Zone 4: Transaction Ledger */}
          <ExpenseLedgerTable
            expenses={expenses}
            totalPeriodCount={summary?.transactionCount ?? expenses.length}
            onEditExpense={handleEditExpense}
            onDeleteExpense={setDeletingExpense}
            onOpenCreateModal={handleOpenCreateModal}
            hasFilters={selectedCategory !== "" || searchQuery !== ""}
            onResetFilters={handleResetFilters}
          />
        </div>
      )}

      {/* Create / Edit Expense Modal Dialog */}
      <ExpenseModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleModalSubmit}
        initialExpense={editingExpense}
      />

      {/* Set / Edit Budget Dialog */}
      <BudgetModal
        isOpen={isBudgetModalOpen}
        onClose={() => setIsBudgetModalOpen(false)}
        onSubmit={handleSaveBudget}
        onDelete={handleDeleteBudget}
        currentMonth={activeCalendarMonth}
        existingBudgetAmountCents={
          budgetSummary && budgetSummary.month === activeCalendarMonth
            ? budgetSummary.budgetAmountCents
            : null
        }
      />

      {/* Delete Confirmation Dialog */}
      <DeleteExpenseDialog
        isOpen={Boolean(deletingExpense)}
        expense={deletingExpense}
        onClose={() => setDeletingExpense(null)}
        onConfirmDelete={handleConfirmDelete}
      />
    </div>
  );
}
