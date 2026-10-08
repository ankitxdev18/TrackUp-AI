import React, { useState, useEffect, useCallback, useRef } from "react";
import { AlertCircle, Lightbulb } from "lucide-react";
import {
  deleteIdea,
  listIdeas,
  type Idea,
  type IdeaStatus,
  updateIdea,
} from "../../api/ideas";
import { IdeaCapture } from "./IdeaCapture";
import { IdeaList } from "./IdeaList";
import { IdeaEditor } from "./IdeaEditor";
import { DeleteIdeaDialog } from "./DeleteIdeaDialog";
import "./IdeasPage.css";

export const IdeasPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<IdeaStatus>("ACTIVE");
  const [activeIdeas, setActiveIdeas] = useState<Idea[]>([]);
  const [archivedIdeas, setArchivedIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Action states
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingIdeaId, setPendingIdeaId] = useState<string | null>(null);

  // Dialog states
  const [editingIdea, setEditingIdea] = useState<Idea | null>(null);
  const [deletingIdea, setDeletingIdea] = useState<Idea | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const captureInputRef = useRef<HTMLInputElement>(null);

  const loadIdeasForTab = useCallback(async (tab: IdeaStatus) => {
    try {
      setLoading(true);
      setError(null);
      const data = await listIdeas(tab);
      if (tab === "ACTIVE") {
        setActiveIdeas(data);
      } else {
        setArchivedIdeas(data);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to load your ideas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadIdeasForTab(activeTab);
  }, [activeTab, loadIdeasForTab]);

  const handleIdeaCreated = (newIdea: Idea) => {
    setActiveIdeas((prev) => [newIdea, ...prev.filter((i) => i.id !== newIdea.id)]);
    setActionError(null);
  };

  const handleTabChange = (tab: IdeaStatus) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    setActionError(null);
  };

  const handleArchive = async (idea: Idea) => {
    try {
      setPendingIdeaId(idea.id);
      setActionError(null);
      const updated = await updateIdea(idea.id, { status: "ARCHIVED" });

      setActiveIdeas((prev) => prev.filter((i) => i.id !== idea.id));
      setArchivedIdeas((prev) => [updated, ...prev.filter((i) => i.id !== idea.id)]);
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : "Couldn't archive this idea. Please try again."
      );
    } finally {
      setPendingIdeaId(null);
    }
  };

  const handleRestore = async (idea: Idea) => {
    try {
      setPendingIdeaId(idea.id);
      setActionError(null);
      const updated = await updateIdea(idea.id, { status: "ACTIVE" });

      setArchivedIdeas((prev) => prev.filter((i) => i.id !== idea.id));
      setActiveIdeas((prev) => [updated, ...prev.filter((i) => i.id !== idea.id)]);
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : "Couldn't restore this idea. Please try again."
      );
    } finally {
      setPendingIdeaId(null);
    }
  };

  const handleSaveEdit = async (
    id: string,
    updates: { title?: string; description?: string | null }
  ) => {
    const updated = await updateIdea(id, updates);

    if (updated.status === "ACTIVE") {
      setActiveIdeas((prev) => prev.map((i) => (i.id === id ? updated : i)));
    } else {
      setArchivedIdeas((prev) => prev.map((i) => (i.id === id ? updated : i)));
    }
    setActionError(null);
  };

  const handleOpenDelete = (idea: Idea) => {
    setDeletingIdea(idea);
    setDeleteError(null);
  };

  const handleConfirmDelete = async () => {
    if (!deletingIdea) return;

    try {
      setIsDeleting(true);
      setDeleteError(null);
      await deleteIdea(deletingIdea.id);

      setActiveIdeas((prev) => prev.filter((i) => i.id !== deletingIdea.id));
      setArchivedIdeas((prev) => prev.filter((i) => i.id !== deletingIdea.id));
      setDeletingIdea(null);
      setActionError(null);
    } catch (err: unknown) {
      setDeleteError(
        err instanceof Error ? err.message : "Couldn't delete this idea. Please try again."
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const handleFocusCapture = () => {
    if (activeTab !== "ACTIVE") {
      setActiveTab("ACTIVE");
    }
    setTimeout(() => {
      captureInputRef.current?.focus();
    }, 50);
  };

  const currentIdeas = activeTab === "ACTIVE" ? activeIdeas : archivedIdeas;

  return (
    <div className="ideas-page-container">
      <div className="ideas-page-content">
        {/* Header */}
        <header className="ideas-header">
          <div className="ideas-header-title-row">
            <div className="ideas-header-badge" aria-hidden="true">
              <Lightbulb size={20} />
            </div>
            <h1 className="ideas-title">Ideas</h1>
          </div>
          <p className="ideas-subtitle">A quiet space for thoughts worth keeping.</p>
        </header>

        {/* Action Error Banner */}
        {actionError && (
          <div className="ideas-action-error-banner" role="alert">
            <AlertCircle size={15} className="error-icon" aria-hidden="true" />
            <span>{actionError}</span>
            <button
              type="button"
              className="btn-dismiss-error"
              onClick={() => setActionError(null)}
              aria-label="Dismiss error"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="ideas-tabs-wrap" role="tablist" aria-label="Idea views">
          <button
            type="button"
            role="tab"
            id="tab-active-ideas"
            className={`ideas-tab-btn ${activeTab === "ACTIVE" ? "active" : ""}`}
            aria-selected={activeTab === "ACTIVE"}
            aria-controls="tabpanel-ideas"
            onClick={() => handleTabChange("ACTIVE")}
          >
            <span>Active</span>
            {activeIdeas.length > 0 && (
              <span className="tab-count-pill">{activeIdeas.length}</span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            id="tab-archived-ideas"
            className={`ideas-tab-btn ${activeTab === "ARCHIVED" ? "active" : ""}`}
            aria-selected={activeTab === "ARCHIVED"}
            aria-controls="tabpanel-ideas"
            onClick={() => handleTabChange("ARCHIVED")}
          >
            <span>Archived</span>
            {archivedIdeas.length > 0 && (
              <span className="tab-count-pill">{archivedIdeas.length}</span>
            )}
          </button>
        </div>

        {/* Fast Capture — Rendered on Active view */}
        {activeTab === "ACTIVE" && (
          <section className="ideas-capture-section" aria-label="Capture new idea">
            <IdeaCapture
              onIdeaCreated={handleIdeaCreated}
              inputRef={captureInputRef}
            />
          </section>
        )}

        {/* Ideas List Panel */}
        <section
          id="tabpanel-ideas"
          role="tabpanel"
          aria-labelledby={activeTab === "ACTIVE" ? "tab-active-ideas" : "tab-archived-ideas"}
          className="ideas-list-section"
        >
          <IdeaList
            ideas={currentIdeas}
            status={activeTab}
            loading={loading}
            error={error}
            onRetry={() => loadIdeasForTab(activeTab)}
            onEdit={(idea) => setEditingIdea(idea)}
            onArchive={handleArchive}
            onRestore={handleRestore}
            onDelete={handleOpenDelete}
            pendingIdeaId={pendingIdeaId}
            onFocusCapture={handleFocusCapture}
          />
        </section>

        {/* Edit Modal */}
        <IdeaEditor
          idea={editingIdea}
          isOpen={Boolean(editingIdea)}
          onClose={() => setEditingIdea(null)}
          onSave={handleSaveEdit}
        />

        {/* Delete Confirmation Modal */}
        <DeleteIdeaDialog
          idea={deletingIdea}
          isOpen={Boolean(deletingIdea)}
          onClose={() => !isDeleting && setDeletingIdea(null)}
          onConfirm={handleConfirmDelete}
          loading={isDeleting}
          error={deleteError}
        />
      </div>
    </div>
  );
};
