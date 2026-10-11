import { Flame, Sparkles, Trophy } from "lucide-react";
import type { AnalyticsOverviewData } from "../../api/analytics";

interface HabitMatrixCardProps {
  habits: AnalyticsOverviewData["habits"];
  overallRate: number | null;
}

export function HabitMatrixCard({ habits, overallRate }: HabitMatrixCardProps) {
  const { habitsList, dailyGrid } = habits;

  // Format short date for grid cell (e.g., "10/05")
  const formatShortDate = (dateStr: string) => {
    const [, m, d] = dateStr.split("-");
    return `${m}/${d}`;
  };

  const getHeatIntensityClass = (completed: number, total: number) => {
    if (total === 0 || completed === 0) return "heat-0";
    const ratio = completed / total;
    if (ratio >= 1) return "heat-100";
    if (ratio >= 0.5) return "heat-60";
    return "heat-30";
  };

  return (
    <div className="analytics-card" role="region" aria-label="Habit consistency matrix">
      <div className="analytics-card-header">
        <div className="analytics-card-title-group">
          <div className="card-header-icon" aria-hidden="true">
            <Sparkles size={16} />
          </div>
          <div>
            <h2 className="analytics-card-title">Habit Consistency</h2>
            <span className="analytics-card-caption">
              {overallRate !== null ? `${overallRate}% aggregate consistency` : "No active habits"}
            </span>
          </div>
        </div>
      </div>

      <div className="analytics-card-body">
        {/* Daily Habit Activity Heat Grid */}
        <div className="habit-heat-section">
          <div className="section-label-row">
            <span className="section-label">Daily Activity Grid</span>
            <span className="section-meta">
              {dailyGrid.length} days
            </span>
          </div>

          <div
            className="habit-heat-grid"
            role="grid"
            aria-label="Daily habit completion distribution"
          >
            {dailyGrid.map((day) => {
              const intensityClass = getHeatIntensityClass(
                day.completedCount,
                day.totalActiveHabits
              );
              return (
                <div
                  key={day.date}
                  className={`heat-cell ${intensityClass}`}
                  tabIndex={0}
                  role="gridcell"
                  aria-label={`${day.date}: ${day.completedCount} of ${day.totalActiveHabits} habits completed`}
                  title={`${day.date}: ${day.completedCount} of ${day.totalActiveHabits} habits completed`}
                >
                  <span className="heat-date-label">{formatShortDate(day.date)}</span>
                  <span className="heat-count-badge">
                    {day.totalActiveHabits > 0 ? `${day.completedCount}` : "–"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Itemized Habits List */}
        <div className="habits-list-section">
          <span className="section-label">Active Habits ({habitsList.length})</span>

          {habitsList.length === 0 ? (
            <div className="empty-sub-state">
              <span>No active habits tracked. Add habits in the Habits module to view streaks.</span>
            </div>
          ) : (
            <div className="habit-items-container">
              {habitsList.map((h) => (
                <div key={h.id} className="habit-analytics-item">
                  <div className="habit-item-info">
                    <span className="habit-item-name">{h.title}</span>
                    <div className="habit-streaks-pills">
                      <span className="streak-pill current-streak" title="Current streak">
                        <Flame size={12} aria-hidden="true" />
                        <span>{h.currentStreak}d streak</span>
                      </span>
                      <span className="streak-pill longest-streak" title="Longest lifetime streak">
                        <Trophy size={11} aria-hidden="true" />
                        <span>{h.longestStreak}d best</span>
                      </span>
                    </div>
                  </div>

                  <div className="habit-item-progress-col">
                    <div className="progress-fraction-row">
                      <span className="progress-fraction">
                        {h.periodCompletions} completions
                      </span>
                      <span className="progress-pct">
                        {h.periodRate !== null ? `${h.periodRate}%` : "–"}
                      </span>
                    </div>
                    <div className="linear-track">
                      <div
                        className="linear-bar habit-bar"
                        style={{ width: `${Math.min(100, h.periodRate ?? 0)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
