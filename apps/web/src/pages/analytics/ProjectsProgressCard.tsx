import { FolderKanban } from "lucide-react";
import type { AnalyticsOverviewData } from "../../api/analytics";
import { Link } from "../../router/Router";

interface ProjectsProgressCardProps {
  projects: AnalyticsOverviewData["projects"];
}

export function ProjectsProgressCard({ projects }: ProjectsProgressCardProps) {
  return (
    <div className="analytics-card" role="region" aria-label="Projects execution progress">
      <div className="analytics-card-header">
        <div className="analytics-card-title-group">
          <div className="card-header-icon" aria-hidden="true">
            <FolderKanban size={16} />
          </div>
          <div>
            <h2 className="analytics-card-title">Projects Execution</h2>
            <span className="analytics-card-caption">
              {projects.length} active project{projects.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      </div>

      <div className="analytics-card-body">
        {projects.length === 0 ? (
          <div className="empty-sub-state">
            <span>No active projects. Group tasks into projects to track initiatives.</span>
          </div>
        ) : (
          <div className="project-items-container">
            {projects.map((p) => (
              <Link
                key={p.id}
                to={`/projects/${p.id}`}
                className="project-analytics-item"
                style={{ textDecoration: "none" }}
                aria-label={`Project ${p.name}, ${p.completedTaskCount} of ${p.taskCount} tasks completed`}
              >
                <div className="project-item-header">
                  <span className="project-item-title">{p.name}</span>
                  <span className="project-item-fraction">
                    {p.completedTaskCount} / {p.taskCount} tasks ({p.progressPercent}%)
                  </span>
                </div>

                <div className="linear-track">
                  <div
                    className="linear-bar project-bar"
                    style={{ width: `${Math.min(100, Math.max(0, p.progressPercent))}%` }}
                  />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
