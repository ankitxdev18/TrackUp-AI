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
    return (
      <section
        className="category-distribution-card is-empty"
        aria-label="Category spending breakdown"
      >
        <div className="category-dist-header">
          <span className="category-dist-title">Category Distribution</span>
          <span className="category-dist-meta">0 active categories</span>
        </div>
        <div className="dist-empty-bar" aria-hidden="true">
          <div className="dist-empty-track" />
        </div>
        <p className="dist-empty-text">
          No category expenditures recorded in this reporting period.
        </p>
      </section>
    );
  }

  return (
    <section
      className="category-distribution-card"
      aria-label="Category spending breakdown"
    >
      <div className="category-dist-header">
        <span className="category-dist-title">Category Distribution</span>
        <span className="category-dist-meta">
          {byCategory.length}{" "}
          {byCategory.length === 1 ? "active category" : "active categories"}
        </span>
      </div>

      {/* Proportional Multi-Segment Composition Bar */}
      <div
        className="dist-multi-bar"
        role="img"
        aria-label={`Spending breakdown across ${byCategory.length} categories`}
      >
        {byCategory.map((cat) => {
          const meta = getCategoryMeta(cat.categoryId);
          const isSelected = selectedCategory === cat.categoryId;
          return (
            <div
              key={cat.categoryId}
              className={`dist-bar-segment ${isSelected ? "is-highlighted" : ""}`}
              style={{
                width: `${cat.percentage}%`,
                backgroundColor: meta.color,
                minWidth: cat.percentage > 0 ? "3px" : "0",
              }}
              title={`${meta.name}: ${formatCents(cat.totalAmountCents)} (${cat.percentage}%)`}
              aria-hidden="true"
            />
          );
        })}
      </div>

      {/* Legend Grid / Interactive Filter Pills */}
      <div
        className="dist-legend-grid"
        role="group"
        aria-label="Filter transactions by category"
      >
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
              aria-pressed={isSelected}
              aria-label={`Filter by ${meta.name}: ${formatCents(cat.totalAmountCents)}, ${cat.percentage}% of period spending`}
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
