import { Calendar, Filter, Search, X } from "lucide-react";
import { CANONICAL_CATEGORIES, getCategoryMeta } from "../../api/expenses";

export type PeriodFilterOption = "month" | "30d" | "last_month";

interface ExpenseFilterToolbarProps {
  period: PeriodFilterOption;
  onPeriodChange: (p: PeriodFilterOption) => void;
  selectedCategory: string;
  onCategoryChange: (cat: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onResetFilters: () => void;
}

export function ExpenseFilterToolbar({
  period,
  onPeriodChange,
  selectedCategory,
  onCategoryChange,
  searchQuery,
  onSearchChange,
  onResetFilters,
}: ExpenseFilterToolbarProps) {
  const hasActiveFilters = selectedCategory !== "" || searchQuery !== "";

  return (
    <div className="expenses-toolbar" role="toolbar" aria-label="Transaction filters">
      {/* Period Quick Select */}
      <div className="toolbar-period-group" role="group" aria-label="Reporting period">
        <button
          type="button"
          className={`toolbar-period-btn ${period === "month" ? "is-active" : ""}`}
          onClick={() => onPeriodChange("month")}
          aria-pressed={period === "month"}
        >
          <Calendar size={13} aria-hidden="true" />
          <span>This Month</span>
        </button>
        <button
          type="button"
          className={`toolbar-period-btn ${period === "30d" ? "is-active" : ""}`}
          onClick={() => onPeriodChange("30d")}
          aria-pressed={period === "30d"}
        >
          <span>Last 30 Days</span>
        </button>
        <button
          type="button"
          className={`toolbar-period-btn ${period === "last_month" ? "is-active" : ""}`}
          onClick={() => onPeriodChange("last_month")}
          aria-pressed={period === "last_month"}
        >
          <span>Last Month</span>
        </button>
      </div>

      <div className="toolbar-filter-controls">
        {/* Category Filter Select */}
        <div className="toolbar-select-wrapper">
          <Filter size={14} className="select-icon" aria-hidden="true" />
          <select
            className="toolbar-category-select"
            value={selectedCategory}
            onChange={(e) => onCategoryChange(e.target.value)}
            aria-label="Filter by category"
          >
            <option value="">All Categories</option>
            {CANONICAL_CATEGORIES.map((catKey) => {
              const meta = getCategoryMeta(catKey);
              return (
                <option key={catKey} value={catKey}>
                  {meta.name}
                </option>
              );
            })}
          </select>
        </div>

        {/* Search Description Input */}
        <div className="toolbar-search-wrapper">
          <Search size={14} className="search-icon" aria-hidden="true" />
          <input
            type="text"
            className="toolbar-search-input"
            placeholder="Search descriptions..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search transactions"
          />
          {searchQuery && (
            <button
              type="button"
              className="btn-clear-search"
              onClick={() => onSearchChange("")}
              aria-label="Clear search query"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Reset Filter Button */}
        {hasActiveFilters && (
          <button
            type="button"
            className="btn-reset-filters"
            onClick={onResetFilters}
            aria-label="Reset all filters"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
