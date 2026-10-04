import { ArrowLeft, Clock, type LucideIcon } from "lucide-react";
import { Link } from "../router/Router";
import "./FeaturePlaceholder.css";

interface FeaturePlaceholderProps {
  title: string;
  description: string;
  icon: LucideIcon;
  plannedMilestone?: string;
}

export function FeaturePlaceholder({
  title,
  description,
  icon: Icon,
  plannedMilestone = "Upcoming Milestone",
}: FeaturePlaceholderProps) {
  return (
    <div className="placeholder-card">
      <div className="placeholder-badge">
        <Clock size={14} />
        <span>{plannedMilestone}</span>
      </div>

      <div className="placeholder-icon-wrap" aria-hidden="true">
        <Icon size={32} />
      </div>

      <h1 className="placeholder-title">{title}</h1>
      <p className="placeholder-desc">{description}</p>

      <div className="placeholder-actions">
        <Link to="/dashboard" className="btn-primary">
          <ArrowLeft size={16} />
          <span>Return to Dashboard</span>
        </Link>
        <Link to="/" className="btn-secondary">
          <span>Public Overview</span>
        </Link>
      </div>
    </div>
  );
}
