import { FolderKanban, Plus } from "lucide-react";
import { type Project } from "../../api/projects";
import { Link, useRouter } from "../../router/Router";

interface ProjectsWidgetProps {
  projects: Project[];
  loading: boolean;
}

export function ProjectsWidget({ projects, loading }: ProjectsWidgetProps) {
  const { navigate } = useRouter();

  return (
    <section className="dashboard-panel" aria-labelledby="active-projects-heading">
      <div className="panel-title-bar">
        <h2 id="active-projects-heading" className="panel-heading">
          Active Projects
        </h2>
        <Link
          to="/projects"
          className="panel-link-all"
        >
          View all →
        </Link>
      </div>

      {loading ? (
        <div className="dash-skeleton-list" role="status" aria-label="Loading projects">
          <div className="dash-skeleton-card" />
          <div className="dash-skeleton-card" />
        </div>
      ) : projects.length === 0 ? (
        <div className="dash-empty-compact">
          <FolderKanban size={20} className="dash-empty-icon" />
          <p className="dash-empty-text">No active projects yet.</p>
          <Link to="/projects" className="btn-dash-create-sm">
            <Plus size={12} />
            <span>Create project</span>
          </Link>
        </div>
      ) : (
        <div className="dash-projects-list">
          {projects.slice(0, 3).map((project) => {
            const total = project.taskCount ?? 0;
            const completed = project.completedTaskCount ?? 0;
            const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

            return (
              <div
                key={project.id}
                className="dash-project-item"
                onClick={() => navigate(`/projects/${project.id}`)}
                role="link"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter") navigate(`/projects/${project.id}`);
                }}
                aria-label={`Open project ${project.name}`}
              >
                <div className="dash-project-meta-row">
                  <span className="dash-project-name">{project.name}</span>
                  <span className="dash-project-ratio">
                    {total === 0 ? "0 tasks" : `${completed}/${total} (${percent}%)`}
                  </span>
                </div>
                <div
                  className="dash-project-track"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={percent}
                  aria-label={`${project.name} progress: ${percent}%`}
                >
                  <div
                    className="dash-project-fill"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
