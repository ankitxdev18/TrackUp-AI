import { AlertTriangle, CheckCircle2, CheckCheck, Clock, Sparkles } from "lucide-react";

interface DailyMomentumProps {
  todayTotal: number;
  todayCompleted: number;
  todayRemaining: number;
  overdueCount: number;
  progressPercent: number;
  completedTodayCount?: number;
}

export function DailyMomentum({
  todayTotal,
  todayCompleted,
  todayRemaining,
  overdueCount,
  progressPercent,
  completedTodayCount = 0,
}: DailyMomentumProps) {
  return (
    <div className="daily-momentum-strip" role="region" aria-label="Daily momentum summary">
      {/* 1. Today's Scheduled Progress */}
      <div className="momentum-card" data-testid="momentum-card-progress">
        <div className="momentum-icon-wrap icon-completed" aria-hidden="true">
          <CheckCircle2 size={14} />
        </div>
        <div className="momentum-info">
          <span className="momentum-label">Today's Progress</span>
          <div className="momentum-value">
            {todayCompleted} of {todayTotal} completed
          </div>
          <span className="momentum-sub">
            {todayTotal === 0 ? "No tasks today" : `${progressPercent}%`}
          </span>
        </div>
      </div>

      {/* 2. Actual Daily Completed Metric (Option C) */}
      <div className="momentum-card" data-testid="momentum-card-completed-today">
        <div className="momentum-icon-wrap icon-completed-today" aria-hidden="true">
          <CheckCheck size={14} />
        </div>
        <div className="momentum-info">
          <span className="momentum-label">Completed Today</span>
          <div className="momentum-value">
            {completedTodayCount} {completedTodayCount === 1 ? "task" : "tasks"}
          </div>
          <span className="momentum-sub">
            {completedTodayCount === 0 ? "No completions yet" : "Total done today"}
          </span>
        </div>
      </div>

      {/* 3. Remaining */}
      <div className="momentum-card" data-testid="momentum-card-remaining">
        <div className="momentum-icon-wrap icon-remaining" aria-hidden="true">
          <Clock size={14} />
        </div>
        <div className="momentum-info">
          <span className="momentum-label">Remaining</span>
          <div className="momentum-value">{todayRemaining}</div>
          <span className="momentum-sub">To do today</span>
        </div>
      </div>

      {/* 4. Attention (Overdue) */}
      <div className={`momentum-card ${overdueCount > 0 ? "card-attention" : ""}`} data-testid="momentum-card-attention">
        <div
          className={`momentum-icon-wrap ${
            overdueCount > 0 ? "icon-overdue" : "icon-clear"
          }`}
          aria-hidden="true"
        >
          {overdueCount > 0 ? <AlertTriangle size={14} /> : <Sparkles size={14} />}
        </div>
        <div className="momentum-info">
          <span className="momentum-label">Attention</span>
          <div className={`momentum-value ${overdueCount > 0 ? "text-danger" : ""}`}>
            {overdueCount > 0 ? `${overdueCount} overdue` : "0"}
          </div>
          <span className={`momentum-sub ${overdueCount > 0 ? "text-danger" : ""}`}>
            {overdueCount > 0 ? "Needs action" : "Zero overdue"}
          </span>
        </div>
      </div>
    </div>
  );
}

