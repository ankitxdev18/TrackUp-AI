import { CreditCard, Hash, PieChart } from "lucide-react";
import {
  formatCents,
  getCategoryMeta,
  type CategorySummaryItem,
} from "../../api/expenses";

interface SpendingPulseCardsProps {
  totalAmountCents: number;
  transactionCount: number;
  byCategory: CategorySummaryItem[];
}

export function SpendingPulseCards({
  totalAmountCents,
  transactionCount,
  byCategory,
}: SpendingPulseCardsProps) {
  const topCategoryItem = byCategory.length > 0 ? byCategory[0] : null;
  const topCategoryMeta = topCategoryItem
    ? getCategoryMeta(topCategoryItem.categoryId)
    : null;

  return (
    <section className="spending-pulse-grid" aria-label="Spending overview summary">
      {/* Card 1: Total Spent */}
      <div className="pulse-card">
        <div className="pulse-card-header">
          <span className="pulse-card-label">Total Spent</span>
          <div className="pulse-card-icon-wrap" aria-hidden="true">
            <CreditCard size={15} />
          </div>
        </div>
        <div className="pulse-card-value font-tabular">
          {formatCents(totalAmountCents)}
        </div>
        <div className="pulse-card-meta">
          Net expenditures in selected window
        </div>
      </div>

      {/* Card 2: Transactions Count */}
      <div className="pulse-card">
        <div className="pulse-card-header">
          <span className="pulse-card-label">Transactions</span>
          <div className="pulse-card-icon-wrap" aria-hidden="true">
            <Hash size={15} />
          </div>
        </div>
        <div className="pulse-card-value font-tabular">
          {transactionCount}
        </div>
        <div className="pulse-card-meta">
          {transactionCount === 1 ? "1 expense recorded" : `${transactionCount} expenses recorded`}
        </div>
      </div>

      {/* Card 3: Top Category */}
      <div className="pulse-card">
        <div className="pulse-card-header">
          <span className="pulse-card-label">Top Category</span>
          <div className="pulse-card-icon-wrap" aria-hidden="true">
            <PieChart size={15} />
          </div>
        </div>
        {topCategoryMeta && topCategoryItem ? (
          <>
            <div className="pulse-card-value pulse-top-cat">
              <span
                className="top-cat-pill"
                style={{
                  backgroundColor: topCategoryMeta.bgColor,
                  color: topCategoryMeta.color,
                }}
              >
                <topCategoryMeta.icon size={14} />
                <span>{topCategoryMeta.name}</span>
              </span>
            </div>
            <div className="pulse-card-meta font-tabular">
              {formatCents(topCategoryItem.totalAmountCents)} ({topCategoryItem.percentage}%)
            </div>
          </>
        ) : (
          <>
            <div className="pulse-card-value pulse-empty-cat">None</div>
            <div className="pulse-card-meta">No category activity recorded</div>
          </>
        )}
      </div>
    </section>
  );
}
