import { Globe } from "lucide-react";
import type { AnalyticsPeriod } from "../../api/analytics";

interface AnalyticsHeaderProps {
  period: AnalyticsPeriod;
  onSelectPeriod: (period: AnalyticsPeriod) => void;
  startDate?: string;
  endDate?: string;
  timeZone?: string;
  loading?: boolean;
}

export function AnalyticsHeader({
  period,
  onSelectPeriod,
  startDate,
  endDate,
  timeZone,
  loading = false,
}: AnalyticsHeaderProps) {
  const periodOptions: Array<{ id: AnalyticsPeriod; label: string }> = [
    { id: "7d", label: "7D" },
    { id: "30d", label: "30D" },
    { id: "month", label: "Month" },
  ];

  const handleKeyDown = (
    e: React.KeyboardEvent,
    index: number
  ) => {
    if (e.key === "ArrowRight") {
      const nextIdx = (index + 1) % periodOptions.length;
      onSelectPeriod(periodOptions[nextIdx].id);
    } else if (e.key === "ArrowLeft") {
      const prevIdx = (index - 1 + periodOptions.length) % periodOptions.length;
      onSelectPeriod(periodOptions[prevIdx].id);
    }
  };

  return (
    <header className="analytics-header-zone" aria-label="Analytics controls">
      <div className="analytics-hero">
        <div>
          <h1 className="analytics-title">Execution Analytics</h1>
          <p className="analytics-subtitle">
            {startDate && endDate
              ? `${startDate} to ${endDate}`
              : "Review your performance and execution momentum across all domains."}
          </p>
        </div>

        <div className="analytics-controls">
          {timeZone && (
            <div className="analytics-tz-pill" title={`Timezone: ${timeZone}`}>
              <Globe size={13} aria-hidden="true" />
              <span>{timeZone}</span>
            </div>
          )}

          <div
            className={`analytics-period-selector ${loading ? "is-loading" : ""}`}
            role="radiogroup"
            aria-label="Select analytics timeframe"
          >
            {periodOptions.map((opt, idx) => {
              const isSelected = period === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={isSelected ? 0 : -1}
                  className={`btn-period-pill ${isSelected ? "is-active" : ""}`}
                  onClick={() => onSelectPeriod(opt.id)}
                  onKeyDown={(e) => handleKeyDown(e, idx)}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </header>
  );
}
