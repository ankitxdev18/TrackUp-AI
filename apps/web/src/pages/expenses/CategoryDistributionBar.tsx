import {
  formatCents,
  getCategoryMeta,
  type CategorySummaryItem,
} from "../../api/expenses";

interface CategoryDistributionBarProps {
  byCategory: CategorySummaryItem[];
  totalAmountCents: number;
  selectedCategory: string;
  onSelectCategory: (categoryId: string) => void;
}

export function CategoryDistributionBar({
  byCategory,
  totalAmountCents,
  selectedCategory,
  onSelectCategory,
}: CategoryDistributionBarProps) {
  if (byCategory.length === 0 || totalAmountCents === 0) {
    return null;
  }

  return (
    <section className="category-distribution-card" aria-label="Category spending breakdown">
      <div className="category-dist-header">
        <span className="category-dist-title">Category Distribution</span>
        <span className="category-dist-meta">
          {byCategory.length} {byCategory.length === 1 ? "active category" : "active categories"}
        </span>
      </div>

      {/* Proportional Multi-Segment Bar */}
      <div className="dist-multi-bar" role="progressbar" aria-label="Spending distribution by category">
        {byCategory.map((cat) => {
          const meta = getCategoryMeta(cat.categoryId);
          return (
            <div
              key={cat.categoryId}
              className="dist-bar-segment"
              style={{
                width: `${cat.percentage}%`,
                backgroundColor: meta.color,
              }}
              title={`${meta.name}: ${formatCents(cat.totalAmountCents)} (${cat.percentage}%)`}
            />
          );
        })}
      </div>

      {/* Legend Grid / Pills */}
      <div className="dist-legend-grid">
        {byCategory.map((cat) => {
          const meta = getCategoryMeta(cat.categoryId);
          const isSelected = selectedCategory === cat.categoryId;

          return (
            <button
              key={cat.categoryId}
              type="button"
              className={`legend-item-pill ${isSelected ? "is-selected" : ""}`}
              onClick={() =>
                onSelectCategory(isSelected ? "" : cat.categoryId)
              }
              aria-label={`Filter by ${meta.name}, ${formatCents(cat.totalAmountCents)}`}
            >
              <div
                className="legend-color-dot"
                style={{ backgroundColor: meta.color }}
                aria-hidden="true"
              />
              <span className="legend-name">{meta.name}</span>
              <span className="legend-amount font-tabular">
                {formatCents(cat.totalAmountCents)}
              </span>
              <span className="legend-percent font-tabular">
                {cat.percentage}%
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
