import { useState, useEffect, useCallback, useMemo } from "react";
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  Circle,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  completeHabit,
  deleteHabit,
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
  const [histories, setHistories] = useState<Record<string, HabitHistoryResponse>>({});

  // Set of habit IDs currently undergoing an optimistic toggle
  const [togglingHabitIds, setTogglingHabitIds] = useState<Set<string>>(new Set());

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

      const allHabits = await fetchHabits();
      setHabits(allHabits);

      // Fetch 7-day history for all active habits
      const activeHabits = allHabits.filter((h) => h.status === "ACTIVE");
      const historyResults = await Promise.allSettled(
        activeHabits.map((h) => fetchHabitHistory(h.id, 7))
      );

      const newHistories: Record<string, HabitHistoryResponse> = {};
      const newCompletions: Record<string, boolean> = {};

      historyResults.forEach((result, idx) => {
        const habit = activeHabits[idx];
        if (result.status === "fulfilled") {
          const hist = result.value;
          newHistories[habit.id] = hist;
          // Check if today is completed
          const todayItem = hist.history.find((item) => item.date === todayStr);
          if (todayItem && todayItem.completed) {
            newCompletions[habit.id] = true;
          } else {
            newCompletions[habit.id] = false;
          }
        } else {
          newCompletions[habit.id] = false;
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

  // Toggle completion with optimistic update and rollback
  const handleToggleCompletion = async (habit: Habit) => {
    if (togglingHabitIds.has(habit.id)) return; // Prevent race conditions

    const currentlyCompleted = Boolean(todayCompletions[habit.id]);
    const nextCompleted = !currentlyCompleted;

    // 1. Optimistic UI update
    setTogglingHabitIds((prev) => new Set(prev).add(habit.id));
    setTodayCompletions((prev) => ({ ...prev, [habit.id]: nextCompleted }));

    // Optimistically update history dot
    setHistories((prev) => {
      const existing = prev[habit.id];
      if (!existing) return prev;
      return {
        ...prev,
        [habit.id]: {
          ...existing,
          history: existing.history.map((item) =>
            item.date === todayStr
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

    try {
      if (nextCompleted) {
        // Complete habit for today's user-local date
        await completeHabit(habit.id, todayStr);
      } else {
        // Undo completion
        await undoHabitCompletion(habit.id, todayStr);
      }
      setActionError(null);
    } catch (err: unknown) {
      // Rollback on failure
      setTodayCompletions((prev) => ({ ...prev, [habit.id]: currentlyCompleted }));
      setHistories((prev) => {
        const existing = prev[habit.id];
        if (!existing) return prev;
        return {
          ...prev,
          [habit.id]: {
            ...existing,
            history: existing.history.map((item) =>
              item.date === todayStr
                ? {
                    ...item,
                    completed: currentlyCompleted,
                    completedAt: currentlyCompleted ? new Date().toISOString() : null,
                  }
                : item
            ),
          },
        };
      });
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

  // Archive / Restore habit
  const handleToggleArchive = async (habit: Habit) => {
    const nextStatus = habit.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE";
    try {
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
                            const isToday = dayItem.date === todayStr;
                            const d = new Date(dayItem.date + "T00:00:00");
                            const dayLetter = ["S", "M", "T", "W", "T", "F", "S"][
                              d.getDay()
                            ];

                            return (
                              <div
                                key={dayItem.date}
                                className={`history-day-chip ${
                                  dayItem.completed ? "is-done" : "not-done"
                                } ${isToday ? "is-today" : ""}`}
                                title={`${dayItem.date}${
                                  isToday ? " (Today)" : ""
                                }: ${
                                  dayItem.completed ? "Completed" : "Incomplete"
                                }`}
                                aria-label={`${dayItem.date}: ${
                                  dayItem.completed ? "Completed" : "Incomplete"
                                }`}
                              >
                                <span className="day-letter">{dayLetter}</span>
                                <span
                                  className={`day-dot ${
                                    dayItem.completed ? "dot-done" : "dot-empty"
                                  }`}
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
