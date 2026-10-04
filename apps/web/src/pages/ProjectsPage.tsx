import { useState, useEffect } from "react";
import {
  AlertCircle,
  Archive,
  ArrowRight,
  FolderKanban,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";

import {
  deleteProject,
  fetchProjects,
  type Project,
  updateProject,
} from "../api/projects";
import { CreateProjectModal } from "../components/CreateProjectModal";
import { Link, useRouter } from "../router/Router";
import "./ProjectsPage.css";

type ProjectFilterType = "all" | "active" | "archived";

export function ProjectsPage() {
  const { navigate } = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<ProjectFilterType>("active");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const loadProjects = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchProjects();
      setProjects(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const handleProjectSaved = (savedProject: Project) => {
    setProjects((prev) => {
      const exists = prev.some((p) => p.id === savedProject.id);
      if (exists) {
        return prev.map((p) => (p.id === savedProject.id ? savedProject : p));
      }
      return [savedProject, ...prev];
    });
    setEditingProject(null);
  };

  const handleToggleArchive = async (project: Project) => {
    const nextStatus = project.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE";
    try {
      const updated = await updateProject(project.id, { status: nextStatus });
      setProjects((prev) =>
        prev.map((p) =>
          p.id === project.id
            ? {
                ...updated,
                taskCount: project.taskCount,
                completedTaskCount: project.completedTaskCount,
              }
            : p
        )
      );
      setMenuOpenId(null);
    } catch (err: unknown) {
      alert("Failed to update project status. Please try again.");
    }
  };

  const handleDeleteProject = async (project: Project) => {
    setMenuOpenId(null);
    const confirmed = confirm(
      `Are you sure you want to delete "${project.name}"?\n\nNote: All associated tasks will remain safe and be detached from this project.`
    );
    if (!confirmed) return;

    try {
      await deleteProject(project.id);
      setProjects((prev) => prev.filter((p) => p.id !== project.id));
    } catch (err: unknown) {
      alert("Failed to delete project. Please try again.");
    }
  };

  const filteredProjects = projects.filter((p) => {
    if (activeFilter === "active") return p.status === "ACTIVE";
    if (activeFilter === "archived") return p.status === "ARCHIVED";
    return true;
  });

  return (
    <div className="projects-page-container">
      {/* Header */}
      <div className="projects-page-header">
        <div className="projects-header-text">
          <h1 className="projects-title">Projects & Initiatives</h1>
          <p className="projects-subtitle">
            Group related tasks into strategic initiatives and build momentum across milestones.
          </p>
        </div>

        <button
          type="button"
          className="btn-create-project"
          onClick={() => {
            setEditingProject(null);
            setIsModalOpen(true);
          }}
        >
          <Plus size={16} />
          <span>New Project</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div
        className="projects-filter-bar"
        role="tablist"
        aria-label="Project Status Filters"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeFilter === "active"}
          className={`filter-tab ${activeFilter === "active" ? "active" : ""}`}
          onClick={() => setActiveFilter("active")}
        >
          <span>Active</span>
          <span className="filter-count">
            {projects.filter((p) => p.status === "ACTIVE").length}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeFilter === "all"}
          className={`filter-tab ${activeFilter === "all" ? "active" : ""}`}
          onClick={() => setActiveFilter("all")}
        >
          <span>All Projects</span>
          <span className="filter-count">{projects.length}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeFilter === "archived"}
          className={`filter-tab ${activeFilter === "archived" ? "active" : ""}`}
          onClick={() => setActiveFilter("archived")}
        >
          <span>Archived</span>
          <span className="filter-count">
            {projects.filter((p) => p.status === "ARCHIVED").length}
          </span>
        </button>
      </div>

      {/* Error State */}
      {error && (
        <div className="tasks-error-banner" role="alert">
          <AlertCircle size={18} />
          <div className="error-text">
            <strong>Unable to load projects:</strong> {error}
          </div>
          <button type="button" className="btn-retry" onClick={loadProjects}>
            Retry
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && !error && (
        <div
          className="projects-loading-skeleton"
          role="status"
          aria-label="Loading projects"
        >
          <div className="loading-spinner-wrap">
            <Loader2 size={24} className="spin-icon" />
            <span>Loading projects...</span>
          </div>
        </div>
      )}

      {/* Projects Grid or Empty State */}
      {!loading && !error && (
        <div className="projects-list-content">
          {filteredProjects.length === 0 ? (
            <div className="projects-empty-state">
              <div className="empty-icon-wrap" aria-hidden="true">
                <FolderKanban size={36} />
              </div>
              <h3 className="empty-title">
                {projects.length === 0
                  ? "You don't have any projects yet."
                  : activeFilter === "archived"
                  ? "No archived projects."
                  : "No active projects found."}
              </h3>
              <p className="empty-desc">
                {activeFilter === "archived"
                  ? "Completed or retired projects will appear here when archived."
                  : "Organize tasks and track progress by creating your first strategic initiative."}
              </p>
              {activeFilter !== "archived" && (
                <button
                  type="button"
                  className="btn-empty-action"
                  onClick={() => {
                    setEditingProject(null);
                    setIsModalOpen(true);
                  }}
                >
                  <Plus size={16} />
                  <span>Create Project</span>
                </button>
              )}
            </div>
          ) : (
            <div className="projects-grid">
              {filteredProjects.map((project) => {
                const total = project.taskCount ?? 0;
                const completed = project.completedTaskCount ?? 0;
                const percent =
                  total > 0 ? Math.round((completed / total) * 100) : 0;
                const isMenuOpen = menuOpenId === project.id;

                return (
                  <div
                    key={project.id}
                    className={`project-card ${
                      project.status === "ARCHIVED" ? "project-archived" : ""
                    }`}
                  >
                    <div className="project-card-header">
                      <div className="project-card-badge-row">
                        <span
                          className={`project-status-badge ${
                            project.status === "ACTIVE"
                              ? "badge-active"
                              : "badge-archived"
                          }`}
                        >
                          {project.status === "ACTIVE" ? "Active" : "Archived"}
                        </span>

                        <div className="project-actions-dropdown">
                          <button
                            type="button"
                            className="btn-project-more"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuOpenId(isMenuOpen ? null : project.id);
                            }}
                            aria-label={`Options for project ${project.name}`}
                          >
                            <MoreVertical size={16} />
                          </button>

                          {isMenuOpen && (
                            <div
                              className="project-menu-popover"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                className="menu-popover-item"
                                onClick={() => {
                                  setMenuOpenId(null);
                                  setEditingProject(project);
                                  setIsModalOpen(true);
                                }}
                              >
                                <Pencil size={14} />
                                <span>Edit Project</span>
                              </button>
                              <button
                                type="button"
                                className="menu-popover-item"
                                onClick={() => handleToggleArchive(project)}
                              >
                                {project.status === "ACTIVE" ? (
                                  <>
                                    <Archive size={14} />
                                    <span>Archive Project</span>
                                  </>
                                ) : (
                                  <>
                                    <RefreshCw size={14} />
                                    <span>Restore Project</span>
                                  </>
                                )}
                              </button>
                              <button
                                type="button"
                                className="menu-popover-item item-danger"
                                onClick={() => handleDeleteProject(project)}
                              >
                                <Trash2 size={14} />
                                <span>Delete Project</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      <h2
                        className="project-card-title"
                        onClick={() => navigate(`/projects/${project.id}`)}
                        tabIndex={0}
                        role="link"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") navigate(`/projects/${project.id}`);
                        }}
                      >
                        {project.name}
                      </h2>

                      {project.description && (
                        <p className="project-card-desc">{project.description}</p>
                      )}
                    </div>

                    <div className="project-card-footer">
                      <div className="project-progress-meta">
                        <span className="project-progress-label">Progress</span>
                        <span className="project-progress-val">
                          {total === 0 ? "0 tasks" : `${completed}/${total} tasks (${percent}%)`}
                        </span>
                      </div>

                      <div className="project-progress-track">
                        <div
                          className="project-progress-fill"
                          style={{ width: `${percent}%` }}
                        />
                      </div>

                      <div className="project-card-bottom-bar">
                        <span className="project-date">
                          Created{" "}
                          {new Date(project.createdAt).toLocaleDateString(
                            undefined,
                            { month: "short", day: "numeric" }
                          )}
                        </span>

                        <Link
                          to={`/projects/${project.id}`}
                          className="link-open-project"
                          aria-label={`Open details for ${project.name}`}
                        >
                          <span>Open details</span>
                          <ArrowRight size={13} />
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Creation & Edit Modal */}
      <CreateProjectModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingProject(null);
        }}
        onProjectSaved={handleProjectSaved}
        projectToEdit={editingProject}
      />
    </div>
  );
}
