import React, { useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  Check,
  Loader2,
  X,
} from "lucide-react";
import {
  type JournalEntry,
  type CreateJournalEntryInput,
  type UpdateJournalEntryInput,
  formatJournalFullDate,
} from "../../api/journal";

interface JournalEditorProps {
  mode: "create" | "edit";
  initialEntry?: JournalEntry | null;
  defaultDate: string;
  todayStr: string;
  isSaving: boolean;
  saveError: string | null;
  isDuplicateDateError?: boolean;
  onSaveCreate: (input: CreateJournalEntryInput) => Promise<void>;
  onSaveUpdate: (id: string, input: UpdateJournalEntryInput) => Promise<void>;
  onCancel: () => void;
  onSwitchToExistingDateEntry?: (date: string) => void;
}

const MAX_TITLE_LENGTH = 255;
const MAX_CONTENT_LENGTH = 20000;

export const JournalEditor: React.FC<JournalEditorProps> = ({
  mode,
  initialEntry,
  defaultDate,
  todayStr,
  isSaving,
  saveError,
  isDuplicateDateError = false,
  onSaveCreate,
  onSaveUpdate,
  onCancel,
  onSwitchToExistingDateEntry,
}) => {
  const [entryDate, setEntryDate] = useState<string>(
    mode === "edit" && initialEntry ? initialEntry.entryDate : defaultDate
  );
  const [title, setTitle] = useState<string>(
    mode === "edit" && initialEntry ? initialEntry.title || "" : ""
  );
  const [content, setContent] = useState<string>(
    mode === "edit" && initialEntry ? initialEntry.content : ""
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  const isCreate = mode === "create";

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val.length <= MAX_TITLE_LENGTH) {
      setTitle(val);
      if (validationError) setValidationError(null);
    }
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    if (val.length <= MAX_CONTENT_LENGTH) {
      setContent(val);
      if (validationError) setValidationError(null);
    }
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setEntryDate(val);
    if (val > todayStr) {
      setValidationError("Date cannot be in the future");
    } else {
      if (validationError) setValidationError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    const trimmedContent = content.trim();

    if (!trimmedContent) {
      setValidationError("Content cannot be empty");
      return;
    }

    if (trimmedContent.length > MAX_CONTENT_LENGTH) {
      setValidationError(`Content must not exceed ${MAX_CONTENT_LENGTH.toLocaleString()} characters`);
      return;
    }

    if (isCreate) {
      if (!entryDate) {
        setValidationError("Entry date is required");
        return;
      }
      if (entryDate > todayStr) {
        setValidationError("Date cannot be in the future");
        return;
      }
    }

    setValidationError(null);

    if (isCreate) {
      await onSaveCreate({
        entryDate,
        title: title.trim().length > 0 ? title.trim() : null,
        content,
      });
    } else if (initialEntry) {
      await onSaveUpdate(initialEntry.id, {
        title: title.trim().length > 0 ? title.trim() : null,
        content,
      });
    }
  };

  const activeError = validationError || saveError;
  const isContentEmpty = content.trim().length === 0;
  const isDateFuture = isCreate && entryDate > todayStr;
  const isSubmitDisabled = isSaving || isContentEmpty || isDateFuture;

  return (
    <form className="journal-editor-container" onSubmit={handleSubmit} noValidate>
      {/* Editor Top Bar */}
      <div className="editor-toolbar">
        <button
          type="button"
          className="btn-editor-cancel"
          onClick={onCancel}
          disabled={isSaving}
          aria-label="Cancel editing"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          <span>Cancel</span>
        </button>

        <div className="editor-status-indicator">
          <span className="editor-mode-badge">
            {isCreate ? "New Entry" : "Editing Entry"}
          </span>
        </div>

        <div className="editor-actions">
          <button
            type="submit"
            className="btn-primary btn-editor-save"
            disabled={isSubmitDisabled}
            aria-label={isCreate ? "Create entry" : "Save changes"}
          >
            {isSaving ? (
              <>
                <Loader2 size={15} className="spinner" aria-hidden="true" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Check size={15} aria-hidden="true" />
                <span>{isCreate ? "Save Entry" : "Save Changes"}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {activeError && (
        <div className="editor-error-banner" role="alert">
          <AlertCircle size={16} className="error-icon" aria-hidden="true" />
          <div className="error-text-wrap">
            <span>{activeError}</span>
            {isDuplicateDateError && onSwitchToExistingDateEntry && (
              <button
                type="button"
                className="btn-switch-entry"
                onClick={() => onSwitchToExistingDateEntry(entryDate)}
              >
                View entry for this date
              </button>
            )}
          </div>
          {validationError && (
            <button
              type="button"
              className="btn-dismiss-error"
              onClick={() => setValidationError(null)}
              aria-label="Dismiss error"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {/* Form Fields Area */}
      <div className="editor-form-body">
        {/* Date Selector Row */}
        <div className="editor-date-row">
          <label htmlFor="journal-entry-date" className="editor-field-label">
            <Calendar size={14} aria-hidden="true" />
            <span>Date</span>
          </label>

          {isCreate ? (
            <div className="date-input-wrap">
              <input
                id="journal-entry-date"
                type="date"
                className={`editor-date-input ${entryDate > todayStr ? "input-error" : ""}`}
                value={entryDate}
                max={todayStr}
                onChange={handleDateChange}
                disabled={isSaving}
                required
                aria-describedby="date-help-text"
              />
              <span id="date-help-text" className="editor-helper-text">
                {entryDate === todayStr
                  ? "Today"
                  : formatJournalFullDate(entryDate) || "Past date"}
              </span>
            </div>
          ) : (
            <div className="date-immutable-badge" title="Entry date cannot be changed">
              <span className="immutable-date-text">{initialEntry?.entryDate}</span>
              <span className="immutable-help">
                ({formatJournalFullDate(initialEntry?.entryDate || "")}) · Immutable
              </span>
            </div>
          )}
        </div>

        {/* Title Input */}
        <div className="editor-title-row">
          <div className="field-label-header">
            <label htmlFor="journal-entry-title" className="editor-field-label">
              Title
            </label>
            <span
              className="char-counter"
              aria-live="polite"
              aria-label={`${title.length} of ${MAX_TITLE_LENGTH} characters`}
            >
              {title.length} / {MAX_TITLE_LENGTH}
            </span>
          </div>
          <input
            id="journal-entry-title"
            type="text"
            className="editor-title-input"
            placeholder="Headline or title (optional)"
            value={title}
            maxLength={MAX_TITLE_LENGTH}
            onChange={handleTitleChange}
            disabled={isSaving}
          />
        </div>

        {/* Content Textarea */}
        <div className="editor-content-row">
          <div className="field-label-header">
            <label htmlFor="journal-entry-content" className="editor-field-label">
              Content
            </label>
            <span
              className="char-counter"
              aria-live="polite"
              aria-label={`${content.length} of ${MAX_CONTENT_LENGTH} characters`}
            >
              {content.length.toLocaleString()} / {MAX_CONTENT_LENGTH.toLocaleString()}
            </span>
          </div>
          <textarea
            id="journal-entry-content"
            className="editor-content-textarea"
            placeholder="What's on your mind? Capture your thoughts, daily reflections, or ideas..."
            value={content}
            maxLength={MAX_CONTENT_LENGTH}
            onChange={handleContentChange}
            disabled={isSaving}
            required
            rows={14}
            aria-describedby="content-counter-help"
          />
        </div>
      </div>
    </form>
  );
};
