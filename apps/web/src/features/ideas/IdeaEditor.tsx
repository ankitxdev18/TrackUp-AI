import React, { useState, useEffect } from "react";
import { AlertCircle, Loader2, X } from "lucide-react";
import { type Idea } from "../../api/ideas";

interface IdeaEditorProps {
  idea: Idea | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    id: string,
    updates: { title?: string; description?: string | null }
  ) => Promise<void>;
}

export const IdeaEditor: React.FC<IdeaEditorProps> = ({
  idea,
  isOpen,
  onClose,
  onSave,
}) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (idea) {
      setTitle(idea.title);
      setDescription(idea.description || "");
      setError(null);
    }
  }, [idea, isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isSaving) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSaving, onClose]);

  if (!isOpen || !idea) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Title is required");
      return;
    }

    if (trimmedTitle.length > 255) {
      setError("Title must not exceed 255 characters");
      return;
    }

    if (description.length > 5000) {
      setError("Description must not exceed 5,000 characters");
      return;
    }

    const updates: { title?: string; description?: string | null } = {};
    if (trimmedTitle !== idea.title) {
      updates.title = trimmedTitle;
    }

    const currentNormalizedDesc = idea.description || null;
    const newNormalizedDesc = description.trim() ? description : null;
    if (newNormalizedDesc !== currentNormalizedDesc) {
      updates.description = newNormalizedDesc;
    }

    // If nothing changed, just close
    if (Object.keys(updates).length === 0) {
      onClose();
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      await onSave(idea.id, updates);
      onClose();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Couldn't save changes. Please try again."
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="idea-modal-backdrop"
      onClick={() => !isSaving && onClose()}
      role="presentation"
    >
      <div
        className="idea-modal-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="idea-editor-title"
      >
        <div className="idea-modal-header">
          <div className="idea-modal-title-wrap">
            <h2 id="idea-editor-title" className="idea-modal-title">
              Edit Idea
            </h2>
            <p className="idea-modal-subtitle">
              Refine your captured thought or add more context.
            </p>
          </div>
          <button
            type="button"
            className="btn-modal-close"
            onClick={onClose}
            disabled={isSaving}
            aria-label="Close editor"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="idea-modal-error" role="alert">
            <AlertCircle size={15} className="error-icon" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="idea-editor-form" noValidate>
          <div className="editor-field-group">
            <label htmlFor="edit-idea-title" className="editor-field-label">
              Title <span className="label-required">*</span>
            </label>
            <input
              id="edit-idea-title"
              type="text"
              className="editor-field-input"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (error) setError(null);
              }}
              disabled={isSaving}
              maxLength={255}
              autoFocus
            />
            <div className="editor-char-count">{title.length} / 255</div>
          </div>

          <div className="editor-field-group">
            <label htmlFor="edit-idea-description" className="editor-field-label">
              Description <span className="label-optional">(optional)</span>
            </label>
            <textarea
              id="edit-idea-description"
              className="editor-field-textarea"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (error) setError(null);
              }}
              disabled={isSaving}
              rows={5}
              maxLength={5000}
            />
            <div className="editor-char-count">{description.length} / 5,000</div>
          </div>

          <div className="idea-modal-footer">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={isSaving || !title.trim()}
            >
              {isSaving ? (
                <>
                  <Loader2 size={15} className="spinner" aria-hidden="true" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save Changes</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
