import React from "react";
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  Clock,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  formatJournalFullDate,
  formatJournalTimestamp,
  type JournalEntry,
} from "../../api/journal";

interface JournalReaderProps {
  entry: JournalEntry | null;
  totalEntriesCount: number;
  todayStr: string;
  hasTodayEntry: boolean;
  onEdit: (entry: JournalEntry) => void;
  onDelete: (entry: JournalEntry) => void;
  onNewTodayEntry: () => void;
  onBackToTimeline?: () => void;
}

export const JournalReader: React.FC<JournalReaderProps> = ({
  entry,
  totalEntriesCount,
  todayStr,
  hasTodayEntry,
  onEdit,
  onDelete,
  onNewTodayEntry,
  onBackToTimeline,
}) => {
  // Case 1: No entries at all in the journal
  if (totalEntriesCount === 0) {
    return (
      <div className="journal-empty-view" role="region" aria-label="Empty journal state">
        <div className="journal-empty-icon-wrap" aria-hidden="true">
          <BookOpen size={36} />
        </div>
        <h2 className="journal-empty-title">Your journal is empty.</h2>
        <p className="journal-empty-description">
          Start by writing about today.
        </p>
        <button
          type="button"
          className="btn-primary btn-empty-cta"
          onClick={onNewTodayEntry}
          aria-label="Write today's entry"
        >
          <Plus size={16} aria-hidden="true" />
          <span>Write today's entry</span>
        </button>
      </div>
    );
  }

  // Case 2: No entry is currently selected
  if (!entry) {
    if (!hasTodayEntry) {
      return (
        <div className="journal-empty-view" role="region" aria-label="Today missing state">
          <div className="journal-empty-icon-wrap" aria-hidden="true">
            <BookOpen size={36} />
          </div>
          <h2 className="journal-empty-title">Nothing written today.</h2>
          <p className="journal-empty-description">
            Take a moment to pause, reflect, and capture your day.
          </p>
          <button
            type="button"
            className="btn-primary btn-empty-cta"
            onClick={onNewTodayEntry}
            aria-label="Write today's entry"
          >
            <Plus size={16} aria-hidden="true" />
            <span>Write today's entry</span>
          </button>
        </div>
      );
    }

    return (
      <div className="journal-empty-view" role="region" aria-label="No entry selected">
        <div className="journal-empty-icon-wrap" aria-hidden="true">
          <BookOpen size={36} />
        </div>
        <h2 className="journal-empty-title">No entry selected</h2>
        <p className="journal-empty-description">
          Select an entry from the timeline to read or edit.
        </p>
      </div>
    );
  }

  const isToday = entry.entryDate === todayStr;
  const fullDateLabel = formatJournalFullDate(entry.entryDate);
  const displayTitle = entry.title?.trim() || "Untitled Entry";
  const updatedTime = formatJournalTimestamp(entry.updatedAt);
  const createdTime = formatJournalTimestamp(entry.createdAt);

  return (
    <article className="journal-reader-container" aria-label={`Journal entry for ${entry.entryDate}`}>
      {/* Reader Top Action Bar */}
      <div className="reader-toolbar">
        {onBackToTimeline && (
          <button
            type="button"
            className="btn-reader-back mobile-only"
            onClick={onBackToTimeline}
            aria-label="Back to timeline"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            <span>Timeline</span>
          </button>
        )}

        <div className="reader-date-tag-wrap">
          {isToday && <span className="reader-today-badge">Today</span>}
          <span className="reader-date-badge">
            <Calendar size={13} aria-hidden="true" />
            <span>{entry.entryDate}</span>
          </span>
        </div>

        <div className="reader-actions">
          <button
            type="button"
            className="btn-reader-action btn-edit"
            onClick={() => onEdit(entry)}
            aria-label="Edit journal entry"
          >
            <Pencil size={15} aria-hidden="true" />
            <span>Edit</span>
          </button>
          <button
            type="button"
            className="btn-reader-action btn-delete"
            onClick={() => onDelete(entry)}
            aria-label="Delete journal entry"
          >
            <Trash2 size={15} aria-hidden="true" />
            <span>Delete</span>
          </button>
        </div>
      </div>

      {/* Reader Header */}
      <header className="reader-header">
        <span className="reader-full-date">{fullDateLabel}</span>
        <h1 className="reader-title">{displayTitle}</h1>

        <div className="reader-metadata-row">
          <div className="reader-timestamp" title={`Created: ${createdTime}`}>
            <Clock size={12} aria-hidden="true" />
            <span>Last saved {updatedTime}</span>
          </div>
        </div>
      </header>

      {/* Entry Body — Plain text with preserved line breaks, NO HTML parsing */}
      <div className="reader-body">
        <p className="reader-content-text">{entry.content}</p>
      </div>
    </article>
  );
};
