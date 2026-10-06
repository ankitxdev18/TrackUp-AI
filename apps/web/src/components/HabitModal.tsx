import React, { useState, useEffect, useRef } from "react";
import { AlertCircle, Loader2, Sparkles, X } from "lucide-react";
import { createHabit, updateHabit, type Habit } from "../api/habits";
import "./HabitModal.css";

interface HabitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onHabitSaved: (habit: Habit) => void;
  habitToEdit?: Habit | null;
}

export function HabitModal({
  isOpen,
  onClose,
  onHabitSaved,
  habitToEdit,
}: HabitModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleInputRef = useRef<HTMLInputElement>(null);
  const isEditing = Boolean(habitToEdit);

  useEffect(() => {
    if (isOpen) {
      if (habitToEdit) {
        setTitle(habitToEdit.title);
        setDescription(habitToEdit.description || "");
      } else {
        setTitle("");
        setDescription("");
      }
      setError(null);
      setLoading(false);
      setTimeout(() => titleInputRef.current?.focus(), 50);
    }
  }, [isOpen, habitToEdit]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !loading) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Habit title is required.");
      return;
    }

    if (trimmedTitle.length > 255) {
      setError("Title must not exceed 255 characters.");
      return;
    }

    if (description.length > 1000) {
      setError("Description must not exceed 1000 characters.");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      if (isEditing && habitToEdit) {
        const updated = await updateHabit(habitToEdit.id, {
          title: trimmedTitle,
          description: description.trim() || null,
        });
        onHabitSaved(updated);
      } else {
        const created = await createHabit({
          title: trimmedTitle,
          description: description.trim() || null,
          frequency: "DAILY",
        });
        onHabitSaved(created);
      }
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save habit");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="habit-modal-backdrop"
      onClick={() => !loading && onClose()}
      role="presentation"
    >
      <div
        className="habit-modal-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="habit-modal-title"
      >
        <div className="habit-modal-header">
          <div className="habit-modal-header-text">
            <h2 id="habit-modal-title">
              {isEditing ? "Edit Habit" : "Create New Habit"}
            </h2>
            <p className="habit-modal-subtitle">
              {isEditing
                ? "Update your daily routine details"
                : "Add an enduring practice to your daily command center"}
            </p>
          </div>
          <button
            type="button"
            className="btn-modal-close"
            onClick={onClose}
            disabled={loading}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="habit-modal-error" role="alert">
            <AlertCircle size={16} className="error-icon" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="habit-modal-form">
          <div className="form-group">
            <label htmlFor="habit-title">
              Habit Title <span className="required-star">*</span>
            </label>
            <input
              id="habit-title"
              ref={titleInputRef}
              type="text"
              className="form-input"
              placeholder="e.g., Read 20 pages, Morning meditation, 30m DSA"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={loading}
              maxLength={255}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="habit-description">
              Context & Motivation <span className="optional-tag">(Optional)</span>
            </label>
            <textarea
              id="habit-description"
              className="form-textarea"
              placeholder="Why does this habit matter? When or where do you plan to do it?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={loading}
              rows={3}
              maxLength={1000}
            />
          </div>

          <div className="form-group frequency-preview">
            <span className="field-label">Cadence</span>
            <div className="frequency-badge">
              <Sparkles size={14} className="frequency-icon" aria-hidden="true" />
              <span>Daily Routine</span>
            </div>
          </div>

          <div className="habit-modal-footer">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="spinner" aria-hidden="true" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>{isEditing ? "Save Changes" : "Create Habit"}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
