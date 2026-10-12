import { Edit2, MoreVertical, Plus, Receipt, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  formatCents,
  getCategoryMeta,
  type Expense,
} from "../../api/expenses";

interface ExpenseLedgerTableProps {
  expenses: Expense[];
  onEditExpense: (expense: Expense) => void;
  onDeleteExpense: (expense: Expense) => void;
  onOpenCreateModal: () => void;
  hasFilters: boolean;
  onResetFilters: () => void;
}

export function ExpenseLedgerTable({
  expenses,
  onEditExpense,
  onDeleteExpense,
  onOpenCreateModal,
  hasFilters,
  onResetFilters,
}: ExpenseLedgerTableProps) {
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const formatDate = (isoDate: string) => {
    if (!isoDate) return "";
    const [year, month, day] = isoDate.split("-");
    const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  // Empty state handling
  if (expenses.length === 0) {
    if (hasFilters) {
      return (
        <div className="expenses-empty-card" role="status">
          <div className="empty-icon-wrap" aria-hidden="true">
            <Receipt size={28} />
          </div>
          <h2 className="empty-title">No matching transactions</h2>
          <p className="empty-desc">
            No expenses match your selected category or search filters.
          </p>
          <button
            type="button"
            className="btn-empty-action"
            onClick={onResetFilters}
          >
            Reset Filters
          </button>
        </div>
      );
    }

    return (
      <div className="expenses-empty-card" role="status">
        <div className="empty-icon-wrap" aria-hidden="true">
          <Receipt size={28} />
        </div>
        <h2 className="empty-title">No expenses recorded yet</h2>
        <p className="empty-desc">
          Log your outgoings to track spending distributions and category insights.
        </p>
        <button
          type="button"
          className="btn-empty-action"
          onClick={onOpenCreateModal}
        >
          <Plus size={15} />
          <span>Log Your First Expense</span>
        </button>
      </div>
    );
  }

  return (
    <div className="expenses-ledger-wrapper">
      {/* Desktop Table View */}
      <table className="expenses-table" aria-label="Transaction ledger">
        <thead>
          <tr>
            <th scope="col" className="col-date">Date</th>
            <th scope="col" className="col-category">Category</th>
            <th scope="col" className="col-desc">Description</th>
            <th scope="col" className="col-amount">Amount</th>
            <th scope="col" className="col-actions">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {expenses.map((expense) => {
            const meta = getCategoryMeta(expense.categoryId);
            const CategoryIcon = meta.icon;
            const isMenuOpen = activeMenuId === expense.id;

            return (
              <tr key={expense.id} className="expense-row">
                <td className="cell-date font-tabular">
                  {formatDate(expense.date)}
                </td>
                <td className="cell-category">
                  <span
                    className="category-badge"
                    style={{
                      backgroundColor: meta.bgColor,
                      color: meta.color,
                    }}
                  >
                    <CategoryIcon size={13} aria-hidden="true" />
                    <span>{meta.name}</span>
                  </span>
                </td>
                <td className="cell-desc">
                  {expense.description ? (
                    <span className="desc-text">{expense.description}</span>
                  ) : (
                    <span className="desc-muted">—</span>
                  )}
                </td>
                <td className="cell-amount font-tabular">
                  {formatCents(expense.amountCents)}
                </td>
                <td className="cell-actions">
                  <div className="row-action-menu-wrap">
                    <button
                      type="button"
                      className="btn-row-action"
                      onClick={() =>
                        setActiveMenuId(isMenuOpen ? null : expense.id)
                      }
                      aria-label="Transaction actions"
                      aria-expanded={isMenuOpen}
                    >
                      <MoreVertical size={14} />
                    </button>

                    {isMenuOpen && (
                      <div
                        className="row-action-dropdown"
                        role="menu"
                        onMouseLeave={() => setActiveMenuId(null)}
                      >
                        <button
                          type="button"
                          className="dropdown-item"
                          onClick={() => {
                            setActiveMenuId(null);
                            onEditExpense(expense);
                          }}
                          role="menuitem"
                        >
                          <Edit2 size={13} />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          className="dropdown-item item-danger"
                          onClick={() => {
                            setActiveMenuId(null);
                            onDeleteExpense(expense);
                          }}
                          role="menuitem"
                        >
                          <Trash2 size={13} />
                          <span>Delete</span>
                        </button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Mobile Card Feed View */}
      <div className="expenses-mobile-feed" aria-label="Transactions mobile feed">
        {expenses.map((expense) => {
          const meta = getCategoryMeta(expense.categoryId);
          const CategoryIcon = meta.icon;

          return (
            <div
              key={expense.id}
              className="expense-mobile-card"
              onClick={() => onEditExpense(expense)}
              role="button"
              tabIndex={0}
              aria-label={`Expense: ${meta.name}, ${formatCents(expense.amountCents)}`}
              onKeyDown={(e) => {
                if (e.key === "Enter") onEditExpense(expense);
              }}
            >
              <div
                className="mobile-card-icon"
                style={{
                  backgroundColor: meta.bgColor,
                  color: meta.color,
                }}
                aria-hidden="true"
              >
                <CategoryIcon size={18} />
              </div>

              <div className="mobile-card-content">
                <div className="mobile-card-primary">
                  <span className="mobile-card-desc">
                    {expense.description || meta.name}
                  </span>
                  <span className="mobile-card-amount font-tabular">
                    {formatCents(expense.amountCents)}
                  </span>
                </div>
                <div className="mobile-card-secondary">
                  <span className="mobile-card-category">{meta.name}</span>
                  <span className="mobile-card-dot">•</span>
                  <span className="mobile-card-date font-tabular">
                    {formatDate(expense.date)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
