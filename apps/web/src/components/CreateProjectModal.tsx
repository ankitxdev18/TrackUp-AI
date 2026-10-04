import { useState, useEffect, useRef } from "react";
import { AlertCircle, Check, Loader2, X } from "lucide-react";
import {
  createProject,
  updateProject,
  type Project,
  ProjectApiError,
} from "../api/projects";
import "./CreateProjectModal.css";

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectSaved: (project: Project) => void;
  projectToEdit?: Project | null;
}

export function CreateProjectModal({
  isOpen,
  onClose,
  onProjectSaved,
  projectToEdit,
}: CreateProjectModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"ACTIVE" | "ARCHIVED">("ACTIVE");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const isEditing = Boolean(projectToEdit);

  useEffect(() => {
    if (isOpen) {
      if (projectToEdit) {
        setName(projectToEdit.name);
        setDescription(projectToEdit.description || "");
        setStatus(projectToEdit.status);
      } else {
        setName("");
        setDescription("");
        setStatus("ACTIVE");
      }
      setError(null);
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, projectToEdit]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();

    if (!trimmedName) {
      setError("Please enter a project name.");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      if (isEditing && projectToEdit) {
        const updated = await updateProject(projectToEdit.id, {
          name: trimmedName,
          description: description.trim() ? description.trim() : null,
          status,
        });
        onProjectSaved({
          ...updated,
          taskCount: projectToEdit.taskCount,
          completedTaskCount: projectToEdit.completedTaskCount,
        });
      } else {
        const created = await createProject({
          name: trimmedName,
          description: description.trim() ? description.trim() : null,
        });
        onProjectSaved(created);
      }
      onClose();
    } catch (err: unknown) {
      if (err instanceof ProjectApiError) {
        setError(err.message);
      } else {
        setError("Failed to save project. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-modal-heading"
      >
        <div className="modal-header">
          <div className="modal-title-group">
            <h2 id="project-modal-heading" className="modal-title">
              {isEditing ? "Edit Project" : "Create New Project"}
            </h2>
            <span className="modal-subtitle">
              {isEditing
                ? "Update your project initiative details"
                : "Group related tasks into a strategic initiative"}
            </span>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="modal-error-alert" role="alert">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label htmlFor="project-name-input" className="form-label">
              Project Name <span className="required-star">*</span>
            </label>
            <input
              ref={inputRef}
              id="project-name-input"
              type="text"
              className="modal-input"
              placeholder="e.g., Q4 Product Launch, Fitness Routine"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
              maxLength={255}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="project-desc-input" className="form-label">
              Description (Optional)
            </label>
            <textarea
              id="project-desc-input"
              className="modal-input modal-textarea"
              placeholder="What is the high-level objective and vision for this project?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={loading}
              maxLength={1000}
              rows={3}
            />
          </div>

          {isEditing && (
            <div className="form-group">
              <label className="form-label">Project Status</label>
              <div
                className="priority-pill-selector"
                role="radiogroup"
                aria-label="Project Status"
              >
                {(["ACTIVE", "ARCHIVED"] as const).map((s) => {
                  const isSelected = status === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      className={`priority-pill ${
                        s === "ACTIVE" ? "priority-pill-low" : "priority-pill-medium"
                      } ${isSelected ? "selected" : ""}`}
                      onClick={() => setStatus(s)}
                      disabled={loading}
                    >
                      {isSelected && <Check size={12} strokeWidth={3} />}
                      <span>{s === "ACTIVE" ? "Active" : "Archived"}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="modal-footer">
            <button
              type="button"
              className="btn-modal-cancel"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-modal-submit"
              disabled={loading || !name.trim()}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="spin-icon" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>{isEditing ? "Save Changes" : "Create Project"}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
