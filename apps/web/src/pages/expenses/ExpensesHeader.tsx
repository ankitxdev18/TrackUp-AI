import { Plus, Receipt } from "lucide-react";

interface ExpensesHeaderProps {
  startDate: string;
  endDate: string;
  onOpenCreateModal: () => void;
}

export function ExpensesHeader({
  startDate,
  endDate,
  onOpenCreateModal,
}: ExpensesHeaderProps) {
  const formatDateLabel = (isoDate: string) => {
    if (!isoDate) return "";
    const [year, month, day] = isoDate.split("-");
    const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const periodLabel = startDate && endDate
    ? `${formatDateLabel(startDate)} – ${formatDateLabel(endDate)}`
    : "Current Period";

  return (
    <header className="expenses-page-header">
      <div className="expenses-header-title-group">
        <div className="expenses-title-row">
          <div className="expenses-title-icon" aria-hidden="true">
            <Receipt size={20} />
          </div>
          <h1 className="expenses-title">Expenses</h1>
        </div>
        <div className="expenses-subtitle-row">
          <p className="expenses-subtitle">
            Track personal spending, audit transactions, and review category breakdowns.
          </p>
          <span
            className="expenses-active-period-badge font-tabular"
            aria-label={`Current reporting window: ${periodLabel}`}
          >
            {periodLabel}
          </span>
        </div>
      </div>

      <div className="expenses-header-actions">
        <button
          type="button"
          className="btn-create-expense"
          onClick={onOpenCreateModal}
          aria-label="Log new expense"
        >
          <Plus size={16} />
          <span>New Expense</span>
        </button>
      </div>
    </header>
  );
}
