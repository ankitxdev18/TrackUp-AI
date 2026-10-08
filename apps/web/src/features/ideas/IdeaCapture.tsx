import React, { useState, useRef } from "react";
import { AlertCircle, ChevronDown, ChevronUp, Loader2, Plus } from "lucide-react";
import { createIdea, type Idea, IdeasApiError } from "../../api/ideas";

interface IdeaCaptureProps {
  onIdeaCreated: (idea: Idea) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

export const IdeaCapture: React.FC<IdeaCaptureProps> = ({
  onIdeaCreated,
  inputRef: externalInputRef,
}) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const localInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = externalInputRef || localInputRef;

  const validate = (): string | null => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      return "Title is required";
    }
    if (trimmedTitle.length > 255) {
      return "Title must not exceed 255 characters";
    }
    if (description.length > 5000) {
      return "Description must not exceed 5,000 characters";
    }
    return null;
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSubmitting) return;

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const newIdea = await createIdea({
        title: title.trim(),
        description: description.trim() ? description : undefined,
      });

      // Reset state
      setTitle("");
      setDescription("");
      setIsExpanded(false);
      onIdeaCreated(newIdea);

      // Restore focus to input for immediate next entry
      setTimeout(() => {
        titleInputRef.current?.focus();
      }, 0);
    } catch (err: unknown) {
      if (err instanceof IdeasApiError) {
        setError(err.message);
      } else {
        setError("Couldn't save this idea. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !isExpanded) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleCancel = () => {
    setIsExpanded(false);
    setError(null);
    titleInputRef.current?.focus();
  };

  return (
    <div className={`idea-capture-container ${isExpanded ? "expanded" : ""}`}>
      <form onSubmit={handleSubmit} className="idea-capture-form" noValidate>
        {error && (
          <div className="capture-error" role="alert">
            <AlertCircle size={15} className="error-icon" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {!isExpanded ? (
          /* Inline Fast Capture */
          <div className="capture-inline-row">
            <div className="capture-input-wrap">
              <input
                ref={titleInputRef}
                type="text"
                className="capture-inline-input"
                placeholder="What's on your mind?"
                aria-label="What's on your mind?"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (error) setError(null);
                }}
                onKeyDown={handleKeyDown}
                disabled={isSubmitting}
                maxLength={255}
              />
            </div>

            <div className="capture-inline-actions">
              <button
                type="button"
                className="btn-details-toggle"
                onClick={() => setIsExpanded(true)}
                disabled={isSubmitting}
                aria-label="Add details"
                title="Add details"
              >
                <span>Add details</span>
                <ChevronDown size={14} aria-hidden="true" />
              </button>

              <button
                type="submit"
                className="btn-capture-submit"
                disabled={isSubmitting || !title.trim()}
                aria-label="Add idea"
              >
                {isSubmitting ? (
                  <Loader2 size={15} className="spinner" aria-hidden="true" />
                ) : (
                  <>
                    <Plus size={15} aria-hidden="true" />
                    <span>Add</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* Expanded Capture with Description */
          <div className="capture-expanded-card">
            <div className="capture-field-group">
              <label htmlFor="capture-title-input" className="capture-field-label">
                Title
              </label>
              <input
                ref={titleInputRef}
                id="capture-title-input"
                type="text"
                className="capture-field-input"
                placeholder="What's on your mind?"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (error) setError(null);
                }}
                disabled={isSubmitting}
                maxLength={255}
                autoFocus
              />
              <div className="capture-char-count">{title.length} / 255</div>
            </div>

            <div className="capture-field-group">
              <div className="capture-label-row">
                <label htmlFor="capture-description-input" className="capture-field-label">
                  Description <span className="label-optional">(optional)</span>
                </label>
                <button
                  type="button"
                  className="btn-collapse-details"
                  onClick={handleCancel}
                  aria-label="Collapse details"
                >
                  <ChevronUp size={14} aria-hidden="true" />
                  <span>Hide details</span>
                </button>
              </div>
              <textarea
                id="capture-description-input"
                className="capture-field-textarea"
                placeholder="Add thoughts, context, or notes..."
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  if (error) setError(null);
                }}
                disabled={isSubmitting}
                rows={3}
                maxLength={5000}
              />
              <div className="capture-char-count">{description.length} / 5,000</div>
            </div>

            <div className="capture-expanded-actions">
              <button
                type="button"
                className="btn-capture-cancel"
                onClick={handleCancel}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-capture-save"
                disabled={isSubmitting || !title.trim()}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={15} className="spinner" aria-hidden="true" />
                    <span>Saving idea...</span>
                  </>
                ) : (
                  <span>Save idea</span>
                )}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
};
