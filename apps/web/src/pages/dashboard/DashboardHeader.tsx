import { Calendar, TrendingUp } from "lucide-react";
import { getTimeAwareGreeting } from "../../api/tasks";
import { useAuth } from "../../context/AuthContext";
import { Link } from "../../router/Router";
import { DailyMomentum } from "./DailyMomentum";

interface DashboardHeaderProps {
  todayTotal: number;
  todayCompleted: number;
  todayRemaining: number;
  overdueCount: number;
  progressPercent: number;
}

export function DashboardHeader({
  todayTotal,
  todayCompleted,
  todayRemaining,
  overdueCount,
  progressPercent,
}: DashboardHeaderProps) {
  const { user } = useAuth();

  const greetingPrefix = getTimeAwareGreeting();
  const firstName = user?.name ? user.name.split(" ")[0] : "there";
  const greeting = `${greetingPrefix}, ${firstName} 👋`;

  const formattedDate = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="dashboard-header-zone">
      <div className="dashboard-hero">
        <div className="greeting-block">
          <h1 className="hero-greeting-title">{greeting}</h1>
          <p className="hero-greeting-sub">
            Here's what you need to focus on today.
          </p>
        </div>

        <div className="dashboard-hero-actions">
          <Link
            to="/analytics"
            className="btn-analytics-link"
            aria-label="View Execution Analytics"
          >
            <TrendingUp size={13} aria-hidden="true" />
            <span>Analytics</span>
          </Link>
          <div className="date-pill" aria-label={`Current date: ${formattedDate}`}>
            <Calendar size={13} aria-hidden="true" />
            <span>{formattedDate}</span>
          </div>
        </div>
      </div>

      {/* Daily Momentum Strip */}
      <DailyMomentum
        todayTotal={todayTotal}
        todayCompleted={todayCompleted}
        todayRemaining={todayRemaining}
        overdueCount={overdueCount}
        progressPercent={progressPercent}
      />
    </div>
  );
}
