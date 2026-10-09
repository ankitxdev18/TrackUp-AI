import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  Circle,
  Flame,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
  Trophy,
} from "lucide-react";
import {
  completeHabit,
  deleteHabit,
  fetchHabit,
  fetchHabitHistory,
  fetchHabits,
  getLocalTodayDateString,
  type Habit,
  type HabitHistoryResponse,
  undoHabitCompletion,
  updateHabit,
} from "../api/habits";
import { HabitModal } from "../components/HabitModal";
import { DeleteHabitModal } from "../components/DeleteHabitModal";
import "./HabitsPage.css";

type TabFilter = "active" | "archived";

export function HabitsPage() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabFilter>("active");

  // Today date string strictly in user's local timezone (YYYY-MM-DD)
  const todayStr = useMemo(() => getLocalTodayDateString(), []);

  // Completion state map: habitId -> boolean
  const [todayCompletions, setTodayCompletions] = useState<Record<string, boolean>>({});

  // History state map: habitId -> HabitHistoryResponse
  // History state map: habitId -> HabitHistoryResponse
  const [histories, setHistories] = useState<Record<string, HabitHistoryResponse>>({});

  // History fetch timestamp map to track cache freshness and detect midnight rollover: habitId -> timestamp (ms)
  const historyFetchedAt = useRef<Record<string, number>>({});

  // Set of habit IDs currently undergoing an optimistic toggle
  const [togglingHabitIds, setTogglingHabitIds] = useState<Set<string>>(new Set());

  // Set of habit IDs currently undergoing archive/restore transition
  const [transitioningHabitIds, setTransitioningHabitIds] = useState<Set<string>>(new Set());

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [deletingHabit, setDeletingHabit] = useState<Habit | null>(null);
  const [isDeleteLoading, setIsDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Active open menu dropdown
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Close menu dropdown on outside click
  useEffect(() => {
    const handleDocumentClick = () => setOpenMenuId(null);
    document.addEventListener("click", handleDocumentClick);
    return () => document.removeEventListener("click", handleDocumentClick);
  }, []);

  // Fetch habits and their 7-day histories
  const loadHabits = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setActionError(null);

      // Load both active and archived habits to support active/archived tabs with accurate counts
      let allHabits: Habit[] = [];
      try {
        const [activeList, archivedList] = await Promise.all([
          fetchHabits("ACTIVE"),
          fetchHabits("ARCHIVED"),
        ]);
        const habitMap = new Map<string, Habit>();
        activeList.forEach((h) => habitMap.set(h.id, h));
        archivedList.forEach((h) => habitMap.set(h.id, h));
        allHabits = Array.from(habitMap.values());
      } catch {
        allHabits = await fetchHabits();
      }

      setHabits(allHabits);

      // Pre-populate today's completion state directly from server-returned habit flags
      const initialCompletions: Record<string, boolean> = {};
      allHabits.forEach((h) => {
        if (typeof h.todayCompleted === "boolean") {
          initialCompletions[h.id] = h.todayCompleted;
        }
      });

      // Fetch 7-day history for all active habits
      const activeHabits = allHabits.filter((h) => h.status === "ACTIVE");
      const historyResults = await Promise.allSettled(
        activeHabits.map((h) => fetchHabitHistory(h.id, 7))
      );

      const newHistories: Record<string, HabitHistoryResponse> = {};
      const newCompletions: Record<string, boolean> = { ...initialCompletions };

      historyResults.forEach((result, idx) => {
        const habit = activeHabits[idx];
        if (result.status === "fulfilled") {
          const hist = result.value;
          newHistories[habit.id] = hist;
          historyFetchedAt.current[habit.id] = Date.now();
          // Check if today is completed using server-authoritative endDate (derived from users.timezone)
          const habitToday = hist.endDate || todayStr;
          const todayItem = hist.history.find((item) => item.date === habitToday);
          if (todayItem && todayItem.completed) {
            newCompletions[habit.id] = true;
          } else if (todayItem && !todayItem.completed) {
            newCompletions[habit.id] = false;
          }
        }
      });

      setHistories(newHistories);
      setTodayCompletions(newCompletions);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load habits");
    } finally {
      setLoading(false);
    }
  }, [todayStr]);

  useEffect(() => {
    loadHabits();
  }, [loadHabits]);

  // Toggle completion with optimistic update, rollback on failure, and server reconciliation
  const handleToggleCompletion = async (habit: Habit, specificDate?: string) => {
    if (togglingHabitIds.has(habit.id)) return; // Prevent race conditions

    const currentlyCompleted = Boolean(todayCompletions[habit.id]);
    const nextCompleted = !currentlyCompleted;
    const prevHabits = [...habits];
    const prevHistories = { ...histories };

    // 1. Optimistic UI update (immediate user feedback)
    setTogglingHabitIds((prev) => new Set(prev).add(habit.id));
    setTodayCompletions((prev) => ({ ...prev, [habit.id]: nextCompleted }));

    // Optimistically update habit streak and todayCompleted on the card
    setHabits((prev) =>
      prev.map((h) => {
        if (h.id !== habit.id) return h;
        const newStreak = nextCompleted
          ? h.currentStreak + 1
          : Math.max(0, h.currentStreak - 1);
        return {
          ...h,
          todayCompleted: nextCompleted,
          currentStreak: newStreak,
          longestStreak: nextCompleted ? Math.max(h.longestStreak, newStreak) : h.longestStreak,
        };
      })
    );

    try {
      // 2. Authoritative date resolution:
      // If specificDate provided (preserving historical completion behavior), use it.
      // Otherwise, never assume a cached date remains fresh across midnight—always fetch fresh authoritative history.
      let targetDate = specificDate;
      if (!targetDate) {
        try {
          const freshHistory = await fetchHabitHistory(habit.id, 7);
          historyFetchedAt.current[habit.id] = Date.now();
          setHistories((prev) => ({ ...prev, [habit.id]: freshHistory }));
          targetDate = freshHistory.endDate;
        } catch {
          throw new Error("Authoritative completion date is unavailable. Please check your connection and try again.");
        }
      }

      if (!targetDate) {
        throw new Error("Authoritative completion date is unavailable.");
      }

      // Optimistically update history dot for the authoritative targetDate
      setHistories((prev) => {
        const existing = prev[habit.id];
        if (!existing) return prev;
        return {
          ...prev,
          [habit.id]: {
            ...existing,
            history: existing.history.map((item) =>
              item.date === targetDate
                ? {
                    ...item,
                    completed: nextCompleted,
                    completedAt: nextCompleted ? new Date().toISOString() : null,
                  }
                : item
            ),
          },
        };
      });

      if (nextCompleted) {
        // Complete habit for authoritative target date
        await completeHabit(habit.id, targetDate);
      } else {
        // Undo completion for authoritative target date
        await undoHabitCompletion(habit.id, targetDate);
      }

      // Targeted refresh to reconcile server-authoritative streaks and completion indicators
      try {
        const [refreshedHabit, refreshedHistory] = await Promise.all([
          fetchHabit(habit.id),
          fetchHabitHistory(habit.id, 7),
        ]);
        if (refreshedHabit && typeof refreshedHabit === "object") {
          setHabits((prev) => prev.map((h) => (h.id === habit.id ? refreshedHabit : h)));
          if (typeof refreshedHabit.todayCompleted === "boolean") {
            setTodayCompletions((prev) => ({ ...prev, [habit.id]: refreshedHabit.todayCompleted }));
          }
        }
        if (refreshedHistory && Array.isArray(refreshedHistory.history)) {
          historyFetchedAt.current[habit.id] = Date.now();
          setHistories((prev) => ({ ...prev, [habit.id]: refreshedHistory }));
        }
      } catch {
        // Keep optimistic state if targeted refresh call fails
      }

      setActionError(null);
    } catch (err: unknown) {
      // Rollback on failure
      setTodayCompletions((prev) => ({ ...prev, [habit.id]: currentlyCompleted }));
      setHabits(prevHabits);
      setHistories(prevHistories);
      setActionError(
        err instanceof Error
          ? `Could not update "${habit.title}": ${err.message}`
          : "Failed to update habit completion. Please try again."
      );
    } finally {
      setTogglingHabitIds((prev) => {
        const next = new Set(prev);
        next.delete(habit.id);
        return next;
      });
    }
  };

  // Archive / Restore habit with transition guard to prevent duplicate clicks
  const handleToggleArchive = async (habit: Habit) => {
    if (transitioningHabitIds.has(habit.id)) return;

    const nextStatus = habit.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE";
    try {
      setTransitioningHabitIds((prev) => new Set(prev).add(habit.id));
      const updated = await updateHabit(habit.id, { status: nextStatus });
      setHabits((prev) => prev.map((h) => (h.id === habit.id ? updated : h)));
      setOpenMenuId(null);
      setActionError(null);
    } catch (err: unknown) {
      setActionError(
        err instanceof Error
          ? err.message
          : "Failed to change habit status. Please try again."
      );
    } finally {
      setTransitioningHabitIds((prev) => {
        const next = new Set(prev);
        next.delete(habit.id);
        return next;
      });
    }
  };

  // Open edit modal
  const handleOpenEdit = (habit: Habit) => {
    setEditingHabit(habit);
    setIsModalOpen(true);
    setOpenMenuId(null);
  };

  // Habit created or updated callback
  const handleHabitSaved = (savedHabit: Habit) => {
    setHabits((prev) => {
      const index = prev.findIndex((h) => h.id === savedHabit.id);
      if (index >= 0) {
        const updated = [...prev];
        updated[index] = savedHabit;
        return updated;
      }
      return [savedHabit, ...prev];
    });

    // If new habit, fetch its initial history
    if (!histories[savedHabit.id]) {
      fetchHabitHistory(savedHabit.id, 7)
        .then((hist) => {
          historyFetchedAt.current[savedHabit.id] = Date.now();
          setHistories((prev) => ({ ...prev, [savedHabit.id]: hist }));
        })
        .catch(() => {});
    }
    setEditingHabit(null);
  };

  // Delete habit
  const handleConfirmDelete = async () => {
    if (!deletingHabit) return;
    try {
      setIsDeleteLoading(true);
      setDeleteError(null);
      await deleteHabit(deletingHabit.id);

      setHabits((prev) => prev.filter((h) => h.id !== deletingHabit.id));
      setHistories((prev) => {
        const next = { ...prev };
        delete next[deletingHabit.id];
        return next;
      });
      setTodayCompletions((prev) => {
        const next = { ...prev };
        delete next[deletingHabit.id];
        return next;
      });

      setDeletingHabit(null);
      setActionError(null);
    } catch (err: unknown) {
      setDeleteError(
        err instanceof Error ? err.message : "Failed to delete habit"
      );
    } finally {
      setIsDeleteLoading(false);
    }
  };

  // Filtered habits
  const activeHabits = useMemo(
    () => habits.filter((h) => h.status === "ACTIVE"),
    [habits]
  );
  const archivedHabits = useMemo(
    () => habits.filter((h) => h.status === "ARCHIVED"),
    [habits]
  );

  const displayedHabits = activeTab === "active" ? activeHabits : archivedHabits;

  // Completion metrics
  const completedTodayCount = activeHabits.filter(
    (h) => todayCompletions[h.id]
  ).length;
  const totalActiveCount = activeHabits.length;

  return (
    <div className="habits-page">
      {/* Page Header */}
      <header className="habits-header">
        <div className="habits-header-main">
          <div className="habits-title-wrap">
            <h1 className="habits-title">Habits</h1>
            <p className="habits-subtitle">
              Build consistent daily routines and track continuous execution.
            </p>
          </div>
          <button
            type="button"
            className="btn-new-habit"
            onClick={() => {
              setEditingHabit(null);
              setIsModalOpen(true);
            }}
            aria-label="Create new habit"
          >
            <Plus size={16} aria-hidden="true" />
            <span>New Habit</span>
          </button>
        </div>

        {/* Action Error Banner */}
        {actionError && (
          <div className="habits-action-error" role="alert">
            <AlertCircle size={16} aria-hidden="true" />
            <span>{actionError}</span>
            <button
              type="button"
              className="btn-dismiss-error"
              onClick={() => setActionError(null)}
              aria-label="Dismiss error"
            >
              &times;
            </button>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      {loading ? (
        <div className="habits-loading-container" aria-label="Loading habits">
          <Loader2 size={24} className="spinner" aria-hidden="true" />
          <span>Loading habits...</span>
        </div>
      ) : error ? (
        <div className="habits-error-container" role="alert">
          <AlertCircle size={28} className="error-icon" aria-hidden="true" />
          <div className="error-content">
            <h3>Unable to load habits</h3>
            <p>{error}</p>
          </div>
          <button
            type="button"
            className="btn-retry"
            onClick={loadHabits}
          >
            <RefreshCw size={14} aria-hidden="true" />
            <span>Try Again</span>
          </button>
        </div>
      ) : (
        <div className="habits-content">
          {/* Section 1: Today's Overview & Progress Summary (when in Active view) */}
          {activeTab === "active" && totalActiveCount > 0 && (
            <section className="habits-summary-card" aria-label="Today's progress">
              <div className="summary-info">
                <span className="summary-label">Today's Focus</span>
                <span className="summary-count">
                  <strong>{completedTodayCount}</strong> of{" "}
                  <strong>{totalActiveCount}</strong> completed
                </span>
              </div>
              <div
                className="summary-progress-bar"
                role="progressbar"
                aria-valuenow={completedTodayCount}
                aria-valuemin={0}
                aria-valuemax={totalActiveCount}
                aria-label="Today's habit completion progress"
              >
                <div
                  className="progress-fill"
                  style={{
                    width: `${
                      totalActiveCount > 0
                        ? (completedTodayCount / totalActiveCount) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </section>
          )}

          {/* Section 2: Tab Filtering */}
          <div className="habits-nav-tabs" role="tablist" aria-label="Habits view">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "active"}
              className={`tab-btn ${activeTab === "active" ? "active" : ""}`}
              onClick={() => setActiveTab("active")}
            >
              <span>Active</span>
              <span className="tab-badge">{activeHabits.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "archived"}
              className={`tab-btn ${activeTab === "archived" ? "active" : ""}`}
              onClick={() => setActiveTab("archived")}
            >
              <span>Archived</span>
              <span className="tab-badge">{archivedHabits.length}</span>
            </button>
          </div>

          {/* Section 3: Habits List */}
          {displayedHabits.length === 0 ? (
            <div className="habits-empty-state">
              {activeTab === "active" ? (
                <>
                  <div className="empty-icon-wrap" aria-hidden="true">
                    <Sparkles size={28} />
                  </div>
                  <h3>Build your first daily habit</h3>
                  <p>
                    Start small. Anchor an intentional routine into your day to
                    spark sustained momentum.
                  </p>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => {
                      setEditingHabit(null);
                      setIsModalOpen(true);
                    }}
                  >
                    <Plus size={16} aria-hidden="true" />
                    <span>Create Habit</span>
                  </button>
                </>
              ) : (
                <>
                  <div className="empty-icon-wrap" aria-hidden="true">
                    <Archive size={28} />
                  </div>
                  <h3>No archived habits</h3>
                  <p>
                    Habits you archive will appear here. Archiving pauses a routine
                    without losing any of its completion history.
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="habits-grid" role="list">
              {displayedHabits.map((habit) => {
                const isCompleted = Boolean(todayCompletions[habit.id]);
                const isToggling = togglingHabitIds.has(habit.id);
                const habitHistory = histories[habit.id]?.history || [];

                return (
                  <article
                    key={habit.id}
                    className={`habit-card ${isCompleted ? "is-completed" : ""}`}
                    role="listitem"
                  >
                    <div className="habit-card-main">
                      {/* Interactive Completion Toggle */}
                      {habit.status === "ACTIVE" ? (
                        <button
                          type="button"
                          role="checkbox"
                          className={`btn-check-toggle ${
                            isCompleted ? "checked" : ""
                          }`}
                          onClick={() => handleToggleCompletion(habit)}
                          disabled={isToggling}
                          aria-label={
                            isCompleted
                              ? `Mark "${habit.title}" as incomplete`
                              : `Mark "${habit.title}" as complete`
                          }
                          aria-checked={isCompleted}
                          aria-pressed={isCompleted}
                        >
                          {isToggling ? (
                            <Loader2
                              size={20}
                              className="spinner toggle-spinner"
                              aria-hidden="true"
                            />
                          ) : isCompleted ? (
                            <CheckCircle2
                              size={22}
                              className="check-icon-completed"
                              aria-hidden="true"
                            />
                          ) : (
                            <Circle
                              size={22}
                              className="check-icon-uncompleted"
                              aria-hidden="true"
                            />
                          )}
                        </button>
                      ) : (
                        <div
                          className="archived-status-indicator"
                          aria-label="Archived habit"
                        >
                          <Archive size={16} aria-hidden="true" />
                        </div>
                      )}

                      {/* Habit Details */}
                      <div className="habit-info">
                        <div className="habit-title-row">
                          <h2
                            className={`habit-name ${
                              isCompleted && habit.status === "ACTIVE"
                                ? "completed-name"
                                : ""
                            }`}
                          >
                            {habit.title}
                          </h2>
                          <span className="cadence-tag">Daily</span>
                        </div>

                        {/* Current and Longest Streak Metrics */}
                        <div
                          className="habit-streaks-row"
                          aria-label={`Current streak: ${habit.currentStreak ?? 0} days, Best streak: ${habit.longestStreak ?? 0} days`}
                        >
                          <div
                            className={`habit-current-streak ${
                              (habit.currentStreak ?? 0) > 0 ? "has-streak" : ""
                            }`}
                            title="Current consecutive days streak"
                          >
                            <Flame
                              size={13}
                              className="streak-flame-icon"
                              aria-hidden="true"
                            />
                            <span>
                              {habit.currentStreak ?? 0}{" "}
                              {(habit.currentStreak ?? 0) === 1 ? "day" : "days"} streak
                            </span>
                          </div>
                          <span className="streak-dot-divider" aria-hidden="true">
                            •
                          </span>
                          <div
                            className="habit-longest-streak"
                            title="Longest streak achieved"
                          >
                            <Trophy
                              size={13}
                              className="longest-streak-icon"
                              aria-hidden="true"
                            />
                            <span>
                              Best: {habit.longestStreak ?? 0}{" "}
                              {(habit.longestStreak ?? 0) === 1 ? "day" : "days"}
                            </span>
                          </div>
                        </div>

                        {habit.description && (
                          <p className="habit-desc">{habit.description}</p>
                        )}
                      </div>

                      {/* Row Action Menu */}
                      <div
                        className="habit-menu-wrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="btn-card-menu"
                          onClick={() =>
                            setOpenMenuId(
                              openMenuId === habit.id ? null : habit.id
                            )
                          }
                          aria-label={`Options for ${habit.title}`}
                          aria-expanded={openMenuId === habit.id}
                        >
                          <MoreVertical size={16} />
                        </button>

                        {openMenuId === habit.id && (
                          <div className="habit-dropdown-menu" role="menu">
                            <button
                              type="button"
                              role="menuitem"
                              className="dropdown-item"
                              onClick={() => handleOpenEdit(habit)}
                            >
                              <Pencil size={14} aria-hidden="true" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              className="dropdown-item"
                              onClick={() => handleToggleArchive(habit)}
                              disabled={transitioningHabitIds.has(habit.id)}
                            >
                              {habit.status === "ACTIVE" ? (
                                <>
                                  <Archive size={14} aria-hidden="true" />
                                  <span>Archive</span>
                                </>
                              ) : (
                                <>
                                  <RotateCcw size={14} aria-hidden="true" />
                                  <span>Restore</span>
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              className="dropdown-item delete-item"
                              onClick={() => {
                                setOpenMenuId(null);
                                setDeletingHabit(habit);
                              }}
                            >
                              <Trash2 size={14} aria-hidden="true" />
                              <span>Delete</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Section: Compact 7-Day Trailing History */}
                    <div
                      className="habit-history-row"
                      aria-label="7-day completion history"
                    >
                      <span className="history-label">Last 7 Days</span>
                      <div className="history-dots-container">
                        {habitHistory.length > 0 ? (
                          // Render trailing days chronologically (reverse descending backend response for left-to-right timeline)
                          [...habitHistory].reverse().map((dayItem) => {
                            const habitAuthoritativeToday = histories[habit.id]?.endDate || todayStr;
                            const isToday = dayItem.date === habitAuthoritativeToday;
                            const isCompleted = Boolean(dayItem.completed);
                            const isEligible = dayItem.eligible !== false;

                            let statusClass = "is-missed not-done";
                            let dotClass = "dot-missed dot-empty";
                            let statusLabel = "Missed";

                            if (isCompleted) {
                              statusClass = "is-completed is-done";
                              dotClass = "dot-done";
                              statusLabel = "Completed";
                            } else if (!isEligible) {
                              statusClass = "is-ineligible not-done";
                              dotClass = "dot-ineligible";
                              statusLabel = "Ineligible (before habit creation)";
                            } else if (isToday) {
                              statusClass = "is-pending not-done";
                              dotClass = "dot-pending";
                              statusLabel = "Pending";
                            }

                            const d = new Date(dayItem.date + "T00:00:00");
                            const dayLetter = ["S", "M", "T", "W", "T", "F", "S"][
                              d.getDay()
                            ];
                            const accessibleLabel = `${dayItem.date}${
                              isToday ? " (Today)" : ""
                            }: ${statusLabel}`;

                            return (
                              <div
                                key={dayItem.date}
                                className={`history-day-chip ${statusClass} ${
                                  isToday ? "is-today" : ""
                                }`}
                                title={accessibleLabel}
                                aria-label={accessibleLabel}
                              >
                                <span className="day-letter">{dayLetter}</span>
                                <span
                                  className={`day-dot ${dotClass}`}
                                  aria-hidden="true"
                                />
                              </div>
                            );
                          })
                        ) : (
                          <div className="history-placeholder">
                            <span>No history recorded yet</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Habit Create / Edit Modal */}
      <HabitModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingHabit(null);
        }}
        onHabitSaved={handleHabitSaved}
        habitToEdit={editingHabit}
      />

      {/* Destructive Delete Confirmation Modal */}
      <DeleteHabitModal
        isOpen={Boolean(deletingHabit)}
        onClose={() => setDeletingHabit(null)}
        onConfirm={handleConfirmDelete}
        habitTitle={deletingHabit?.title || ""}
        loading={isDeleteLoading}
        error={deleteError}
      />
    </div>
  );
}
