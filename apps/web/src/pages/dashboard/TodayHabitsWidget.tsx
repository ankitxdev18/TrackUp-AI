import { useState, useEffect, useCallback, useMemo } from "react";
import { AlertCircle, Check, Plus, Sparkles } from "lucide-react";
import {
  completeHabit,
  fetchHabitHistory,
  fetchHabits,
  getLocalTodayDateString,
  type Habit,
  type HabitHistoryResponse,
  undoHabitCompletion,
} from "../../api/habits";
import { Link } from "../../router/Router";

export function TodayHabitsWidget() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [todayCompletions, setTodayCompletions] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [togglingHabitIds, setTogglingHabitIds] = useState<Set<string>>(new Set());

  // Strictly user's local calendar date YYYY-MM-DD
  const todayStr = useMemo(() => getLocalTodayDateString(), []);

  const loadHabitsData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setActionError(null);

      const allActive = await fetchHabits("ACTIVE");

      // Deterministic sort: desc(createdAt), then id
      const sorted = [...allActive].sort((a, b) => {
        const timeA = new Date(a.createdAt).getTime();
        const timeB = new Date(b.createdAt).getTime();
        if (timeB !== timeA) return timeB - timeA;
        return a.id.localeCompare(b.id);
      });

      setHabits(sorted);

      // Compact maximum of 4 active habits to display
      const displayed = sorted.slice(0, 4);

      // Bounded history requests strictly for displayed habits
      const historyResults = await Promise.allSettled(
        displayed.map((h) => fetchHabitHistory(h.id, 7))
      );

      const completionsMap: Record<string, boolean> = {};
      historyResults.forEach((res, idx) => {
        const habit = displayed[idx];
        if (res.status === "fulfilled") {
          const hist: HabitHistoryResponse = res.value;
          const todayItem = hist.history?.find((item) => item.date === todayStr);
          completionsMap[habit.id] = !!(todayItem && todayItem.completed);
        } else {
          completionsMap[habit.id] = false;
        }
      });

      setTodayCompletions(completionsMap);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to load habits");
    } finally {
      setLoading(false);
    }
  }, [todayStr]);

  useEffect(() => {
    loadHabitsData();
  }, [loadHabitsData]);

  // Optimistic completion toggle
  const handleToggleHabit = async (habit: Habit) => {
    if (togglingHabitIds.has(habit.id)) return; // Prevent duplicate rapid clicks

    const isCurrentlyCompleted = !!todayCompletions[habit.id];
    const nextState = !isCurrentlyCompleted;

    // Optimistically update widget state
    setTodayCompletions((prev) => ({ ...prev, [habit.id]: nextState }));
    setTogglingHabitIds((prev) => new Set(prev).add(habit.id));
    setActionError(null);

    try {
      if (nextState) {
        await completeHabit(habit.id, todayStr);
      } else {
        await undoHabitCompletion(habit.id, todayStr);
      }
    } catch (err: unknown) {
      // Rollback on failure
      setTodayCompletions((prev) => ({ ...prev, [habit.id]: isCurrentlyCompleted }));
      setActionError(
        err instanceof Error ? err.message : "Failed to update habit completion"
      );
    } finally {
      setTogglingHabitIds((prev) => {
        const updated = new Set(prev);
        updated.delete(habit.id);
        return updated;
      });
    }
  };

  const displayedHabits = habits.slice(0, 4);
  const totalCount = displayedHabits.length;
  const completedCount = displayedHabits.filter((h) => !!todayCompletions[h.id]).length;

  return (
    <section className="dashboard-panel" aria-labelledby="today-habits-heading">
      <div className="panel-title-bar">
        <div className="panel-title-left">
          <h2 id="today-habits-heading" className="panel-heading">
            Today's Habits
          </h2>
          {!loading && !error && totalCount > 0 && (
            <span
              className="panel-counter-badge"
              aria-label={`${completedCount} of ${totalCount} completed`}
            >
              {completedCount} / {totalCount}
            </span>
          )}
        </div>
        <Link to="/habits" className="panel-link-all">
          View all →
        </Link>
      </div>

      {actionError && (
        <div className="dash-error-box" role="alert" style={{ marginBottom: "6px" }}>
          <AlertCircle size={14} />
          <span className="dash-error-msg">{actionError}</span>
        </div>
      )}

      {loading ? (
        <div className="dash-skeleton-list" role="status" aria-label="Loading habits">
          <div className="dash-skeleton-row" />
          <div className="dash-skeleton-row" />
        </div>
      ) : error ? (
        <div className="dash-error-box" role="alert">
          <AlertCircle size={16} />
          <span className="dash-error-msg">{error}</span>
          <button
            type="button"
            className="btn-dash-retry"
            onClick={loadHabitsData}
            aria-label="Retry loading habits"
          >
            Retry
          </button>
        </div>
      ) : totalCount === 0 ? (
        <div className="dash-empty-compact">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Sparkles size={16} className="dash-empty-icon" />
            <p className="dash-empty-text">No habits yet</p>
          </div>
          <Link to="/habits" className="btn-dash-create-sm">
            <Plus size={12} />
            <span>Create habit</span>
          </Link>
        </div>
      ) : (
        <div className="dash-habits-list">
          {displayedHabits.map((habit) => {
            const isCompleted = !!todayCompletions[habit.id];
            const isToggling = togglingHabitIds.has(habit.id);

            return (
              <div
                key={habit.id}
                className={`dash-habit-item ${isCompleted ? "item-completed" : ""}`}
              >
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={isCompleted}
                  aria-label={
                    isCompleted
                      ? `Mark ${habit.title} as incomplete`
                      : `Mark ${habit.title} as complete`
                  }
                  disabled={isToggling}
                  onClick={() => handleToggleHabit(habit)}
                  className={`dash-habit-check ${isCompleted ? "completed" : ""}`}
                >
                  {isCompleted && <Check size={12} strokeWidth={3} />}
                </button>

                <div className="dash-habit-content">
                  <span className={`dash-habit-title ${isCompleted ? "completed" : ""}`}>
                    {habit.title}
                  </span>
                  <span className="dash-habit-pill">Daily</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
