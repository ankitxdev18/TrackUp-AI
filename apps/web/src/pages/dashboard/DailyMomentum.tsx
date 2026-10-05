import { AlertTriangle, CheckCircle2, Clock, Sparkles } from "lucide-react";

interface DailyMomentumProps {
  todayTotal: number;
  todayCompleted: number;
  todayRemaining: number;
  overdueCount: number;
  progressPercent: number;
}

export function DailyMomentum({
  todayTotal,
  todayCompleted,
  todayRemaining,
  overdueCount,
  progressPercent,
}: DailyMomentumProps) {
  return (
    <div className="daily-momentum-strip" role="region" aria-label="Daily momentum summary">
      {/* 1. Completed / Progress */}
      <div className="momentum-card">
        <div className="momentum-icon-wrap icon-completed" aria-hidden="true">
          <CheckCircle2 size={15} />
        </div>
        <div className="momentum-info">
          <div className="momentum-label">Completed</div>
          <div className="momentum-value">
            {todayCompleted} of {todayTotal} completed
          </div>
          <div className="momentum-sub">
            {todayTotal === 0
              ? "No tasks today"
              : `${progressPercent}%`}
          </div>
        </div>
      </div>

      {/* 2. Remaining */}
      <div className="momentum-card">
        <div className="momentum-icon-wrap icon-remaining" aria-hidden="true">
          <Clock size={15} />
        </div>
        <div className="momentum-info">
          <div className="momentum-label">Remaining</div>
          <div className="momentum-value">{todayRemaining}</div>
          <div className="momentum-sub">To do today</div>
        </div>
      </div>

      {/* 3. Attention (Overdue) */}
      <div className={`momentum-card ${overdueCount > 0 ? "card-attention" : ""}`}>
        <div
          className={`momentum-icon-wrap ${
            overdueCount > 0 ? "icon-overdue" : "icon-clear"
          }`}
          aria-hidden="true"
        >
          {overdueCount > 0 ? <AlertTriangle size={15} /> : <Sparkles size={15} />}
        </div>
        <div className="momentum-info">
          <div className="momentum-label">Attention</div>
          <div className={`momentum-value ${overdueCount > 0 ? "text-danger" : ""}`}>
            {overdueCount}
          </div>
          <div className={`momentum-sub ${overdueCount > 0 ? "text-danger" : ""}`}>
            {overdueCount > 0 ? "Needs action" : "Zero overdue"}
          </div>
        </div>
      </div>
    </div>
  );
}
