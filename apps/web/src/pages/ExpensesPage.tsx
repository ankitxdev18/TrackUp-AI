import { AlertCircle, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createExpense,
  deleteExpense,
  fetchExpenses,
  fetchExpenseSummary,
  updateExpense,
  type Expense,
  type ExpenseSummaryResponse,
} from "../api/expenses";
import { CategoryDistributionBar } from "./expenses/CategoryDistributionBar";
import { DeleteExpenseDialog } from "./expenses/DeleteExpenseDialog";
import {
  ExpenseFilterToolbar,
  type PeriodFilterOption,
} from "./expenses/ExpenseFilterToolbar";
import { ExpenseLedgerTable } from "./expenses/ExpenseLedgerTable";
import { ExpenseModal } from "./expenses/ExpenseModal";
import { ExpensesHeader } from "./expenses/ExpensesHeader";
import { SpendingPulseCards } from "./expenses/SpendingPulseCards";
import "./ExpensesPage.css";

export function ExpensesPage() {
  const [period, setPeriod] = useState<PeriodFilterOption>("month");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<ExpenseSummaryResponse | null>(null);

  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);

  const hasLoadedRef = useRef(false);

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
  }, [period]);

  const loadData = useCallback(
    async (forceInitial?: boolean) => {
      const isInitial = forceInitial ?? !hasLoadedRef.current;
      try {
        if (isInitial) {
          setLoading(true);
        } else {
          setIsRefreshing(true);
        }
        setError(null);

        const [expensesRes, summaryRes] = await Promise.all([
          fetchExpenses({
            startDate,
            endDate,
            categoryId: selectedCategory || undefined,
            search: searchQuery || undefined,
            limit: 200,
          }),
          fetchExpenseSummary(startDate, endDate),
        ]);

        setExpenses(expensesRes.expenses);
        setSummary(summaryRes);
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "Failed to load financial records"
        );
      } finally {
        setLoading(false);
        setIsRefreshing(false);
        hasLoadedRef.current = true;
      }
    },
    [startDate, endDate, selectedCategory, searchQuery]
  );

  useEffect(() => {
    loadData();
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
    } else {
      await createExpense(data);
    }
    // Refresh page data to ensure aggregations reflect update
    await loadData();
  };

  const handleConfirmDelete = async (id: string) => {
    await deleteExpense(id);
    await loadData();
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

      {/* Error Banner with Retry */}
      {error && (
        <div className="expenses-error-banner" role="alert">
          <AlertCircle size={18} />
          <div className="error-text">
            <strong>Unable to load expenses:</strong> {error}
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

      {/* Initial Loading Shimmer */}
      {loading && !summary ? (
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
          />

          <CategoryDistributionBar
            byCategory={summary?.byCategory ?? []}
            totalAmountCents={summary?.totalAmountCents ?? 0}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
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
            onEditExpense={handleEditExpense}
            onDeleteExpense={setDeletingExpense}
            onOpenCreateModal={handleOpenCreateModal}
            hasFilters={selectedCategory !== "" || searchQuery !== ""}
            onResetFilters={handleResetFilters}
          />
        </div>
      )}

      {/* Create / Edit Modal Dialog */}
      <ExpenseModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleModalSubmit}
        initialExpense={editingExpense}
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
