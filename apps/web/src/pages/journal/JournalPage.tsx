import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  AlertCircle,
  Loader2,
  Plus,
  RefreshCw,
} from "lucide-react";
import {
  createJournalEntry,
  deleteJournalEntry,
  fetchJournalEntries,
  getLocalTodayDateString,
  type CreateJournalEntryInput,
  type JournalEntry,
  type UpdateJournalEntryInput,
  updateJournalEntry,
  JournalApiError,
} from "../../api/journal";
import { JournalTimeline } from "./JournalTimeline";
import { JournalReader } from "./JournalReader";
import { JournalEditor } from "./JournalEditor";
import { DeleteJournalModal } from "./DeleteJournalModal";
import "./JournalPage.css";

type ViewMode = "reader" | "editor";
type EditorMode = "create" | "edit";

export const JournalPage: React.FC = () => {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Selected entry ID (null when no entry is selected or on initial empty today)
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>("reader");
  const [editorMode, setEditorMode] = useState<EditorMode>("create");
  const [editorTargetEntry, setEditorTargetEntry] = useState<JournalEntry | null>(null);
  const [editorDefaultDate, setEditorDefaultDate] = useState<string>("");

  // Mobile navigation view: "timeline" or "content"
  const [mobileView, setMobileView] = useState<"timeline" | "content">("timeline");

  // Mutation states
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isDuplicateDateError, setIsDuplicateDateError] = useState(false);

  // Delete modal state
  const [deletingEntry, setDeletingEntry] = useState<JournalEntry | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Page-level action error (e.g. general notification)
  const [actionError, setActionError] = useState<string | null>(null);

  // Today's calendar date strictly in user's local timezone
  const todayStr = useMemo(() => getLocalTodayDateString(), []);

  // Check if today has an entry
  const todayEntry = useMemo(() => {
    return entries.find((e) => e.entryDate === todayStr) || null;
  }, [entries, todayStr]);

  const hasTodayEntry = Boolean(todayEntry);

  // Currently selected entry object
  const selectedEntry = useMemo(() => {
    if (!selectedEntryId) return null;
    return entries.find((e) => e.id === selectedEntryId) || null;
  }, [entries, selectedEntryId]);

  // Load entries from server
  const loadEntries = useCallback(async () => {
    try {
      setLoading(true);
      setFetchError(null);
      setActionError(null);

      const serverEntries = await fetchJournalEntries();
      setEntries(serverEntries);

      // Requirement 7: Today Experience
      // If today's entry exists: select today's entry by default.
      // If today's entry does not exist: do NOT select an entry, show clear empty state.
      const foundToday = serverEntries.find((e) => e.entryDate === todayStr);
      if (foundToday) {
        setSelectedEntryId(foundToday.id);
        setViewMode("reader");
      } else {
        setSelectedEntryId(null);
        setViewMode("reader");
      }
    } catch (err: unknown) {
      if (err instanceof JournalApiError) {
        setFetchError(err.message);
      } else {
        setFetchError("Unable to load journal entries. Please check your connection.");
      }
    } finally {
      setLoading(false);
    }
  }, [todayStr]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  // Handle entry selection from timeline
  const handleSelectEntry = (entry: JournalEntry) => {
    setSelectedEntryId(entry.id);
    setViewMode("reader");
    setMobileView("content");
  };

  // Open editor for creating today's entry or a new entry
  const handleOpenCreate = (targetDate: string = todayStr) => {
    setEditorMode("create");
    setEditorTargetEntry(null);
    setEditorDefaultDate(targetDate);
    setSaveError(null);
    setIsDuplicateDateError(false);
    setViewMode("editor");
    setMobileView("content");
  };

  // Open editor for modifying an existing entry
  const handleOpenEdit = (entry: JournalEntry) => {
    setEditorMode("edit");
    setEditorTargetEntry(entry);
    setEditorDefaultDate(entry.entryDate);
    setSaveError(null);
    setIsDuplicateDateError(false);
    setViewMode("editor");
    setMobileView("content");
  };

  // Cancel editor and return to reader view
  const handleCancelEditor = () => {
    setViewMode("reader");
    setSaveError(null);
    setIsDuplicateDateError(false);
  };

  // Switch to viewing existing entry if duplicate date was hit
  const handleSwitchToExistingDateEntry = (date: string) => {
    const existing = entries.find((e) => e.entryDate === date);
    if (existing) {
      setSelectedEntryId(existing.id);
      setViewMode("reader");
      setSaveError(null);
      setIsDuplicateDateError(false);
    }
  };

  // Save new entry (POST /api/journal)
  const handleSaveCreate = async (input: CreateJournalEntryInput) => {
    try {
      setIsSaving(true);
      setSaveError(null);
      setIsDuplicateDateError(false);

      const created = await createJournalEntry(input);

      // Insert into local state maintaining entryDate DESC order
      setEntries((prev) => {
        const next = [created, ...prev.filter((e) => e.id !== created.id)];
        return next.sort((a, b) => b.entryDate.localeCompare(a.entryDate));
      });

      setSelectedEntryId(created.id);
      setViewMode("reader");
    } catch (err: unknown) {
      if (err instanceof JournalApiError) {
        if (err.code === "DUPLICATE_ENTRY_DATE" || err.statusCode === 409) {
          setIsDuplicateDateError(true);
          setSaveError("An entry already exists for this date.");
        } else {
          setSaveError(err.message);
        }
      } else {
        setSaveError("Failed to save journal entry. Please try again.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Update existing entry (PATCH /api/journal/:id)
  const handleSaveUpdate = async (id: string, input: UpdateJournalEntryInput) => {
    try {
      setIsSaving(true);
      setSaveError(null);

      const updated = await updateJournalEntry(id, input);

      // Update in local state
      setEntries((prev) =>
        prev.map((e) => (e.id === updated.id ? updated : e))
      );

      setSelectedEntryId(updated.id);
      setViewMode("reader");
    } catch (err: unknown) {
      if (err instanceof JournalApiError) {
        setSaveError(err.message);
      } else {
        setSaveError("Failed to update journal entry. Please try again.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Open delete confirmation modal
  const handleOpenDelete = (entry: JournalEntry) => {
    setDeletingEntry(entry);
    setDeleteError(null);
  };

  // Confirm delete (DELETE /api/journal/:id)
  const handleConfirmDelete = async () => {
    if (!deletingEntry) return;

    try {
      setIsDeleting(true);
      setDeleteError(null);

      await deleteJournalEntry(deletingEntry.id);

      // Remove from local list
      const remaining = entries.filter((e) => e.id !== deletingEntry.id);
      setEntries(remaining);

      // After deletion: select another entry if available, otherwise show empty state
      if (remaining.length > 0) {
        // Prefer today's entry if it exists among remaining, else first entry
        const remainingToday = remaining.find((e) => e.entryDate === todayStr);
        setSelectedEntryId(remainingToday ? remainingToday.id : remaining[0].id);
      } else {
        setSelectedEntryId(null);
      }

      setDeletingEntry(null);
      setViewMode("reader");
    } catch (err: unknown) {
      if (err instanceof JournalApiError) {
        setDeleteError(err.message);
      } else {
        setDeleteError("Failed to delete journal entry. Please try again.");
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="journal-workspace-page">
      {/* Page Header */}
      <header className="journal-page-header">
        <div className="journal-header-titles">
          <h1 className="journal-page-title">Journal</h1>
          <p className="journal-page-subtitle">
            A quiet space for daily reflection and clarity
          </p>
        </div>

        <div className="journal-header-actions">
          <button
            type="button"
            className="btn-primary btn-new-entry"
            onClick={() => handleOpenCreate(todayStr)}
            aria-label="New Entry"
          >
            <Plus size={16} aria-hidden="true" />
            <span>New Entry</span>
          </button>
        </div>
      </header>

      {/* Action Error Banner */}
      {actionError && (
        <div className="journal-action-error-banner" role="alert">
          <AlertCircle size={16} className="error-icon" aria-hidden="true" />
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

      {/* Main Workspace Layout */}
      {loading ? (
        <div className="journal-loading-container" aria-label="Loading journal">
          <Loader2 size={24} className="spinner" aria-hidden="true" />
          <span>Loading journal...</span>
        </div>
      ) : fetchError ? (
        <div className="journal-error-container" role="alert">
          <AlertCircle size={32} className="error-icon" aria-hidden="true" />
          <div className="error-content">
            <h2>Unable to load journal</h2>
            <p>{fetchError}</p>
          </div>
          <button
            type="button"
            className="btn-primary btn-retry"
            onClick={loadEntries}
          >
            <RefreshCw size={14} aria-hidden="true" />
            <span>Try Again</span>
          </button>
        </div>
      ) : (
        <div className={`journal-workspace-layout mobile-view-${mobileView}`}>
          {/* Left Column: Timeline */}
          <div className="journal-timeline-column">
            <JournalTimeline
              entries={entries}
              selectedEntryId={selectedEntryId}
              onSelectEntry={handleSelectEntry}
              onNewEntry={() => handleOpenCreate(todayStr)}
              todayStr={todayStr}
              hasTodayEntry={hasTodayEntry}
            />
          </div>

          {/* Right Column: Reader or Editor */}
          <main className="journal-content-column" role="region" aria-label="Journal Content Area">
            {viewMode === "editor" ? (
              <JournalEditor
                mode={editorMode}
                initialEntry={editorTargetEntry}
                defaultDate={editorDefaultDate}
                todayStr={todayStr}
                isSaving={isSaving}
                saveError={saveError}
                isDuplicateDateError={isDuplicateDateError}
                onSaveCreate={handleSaveCreate}
                onSaveUpdate={handleSaveUpdate}
                onCancel={handleCancelEditor}
                onSwitchToExistingDateEntry={handleSwitchToExistingDateEntry}
              />
            ) : (
              <JournalReader
                entry={selectedEntry}
                totalEntriesCount={entries.length}
                todayStr={todayStr}
                hasTodayEntry={hasTodayEntry}
                onEdit={handleOpenEdit}
                onDelete={handleOpenDelete}
                onNewTodayEntry={() => handleOpenCreate(todayStr)}
                onBackToTimeline={() => setMobileView("timeline")}
              />
            )}
          </main>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <DeleteJournalModal
        isOpen={Boolean(deletingEntry)}
        onClose={() => !isDeleting && setDeletingEntry(null)}
        onConfirm={handleConfirmDelete}
        entry={deletingEntry}
        loading={isDeleting}
        error={deleteError}
      />
    </div>
  );
};
