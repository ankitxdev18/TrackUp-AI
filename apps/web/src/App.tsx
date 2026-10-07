import {
  BookOpen,
  Calendar,
  Compass,
  HeartPulse,
  Receipt,
  Settings,
} from "lucide-react";

import { AppShell } from "./components/AppShell";
import { AuthPage } from "./pages/AuthPage";
import { DashboardView } from "./pages/DashboardView";
import { FeaturePlaceholder } from "./pages/FeaturePlaceholder";
import { GoalDetailPage } from "./pages/GoalDetailPage";
import { GoalsPage } from "./pages/GoalsPage";
import { HabitsPage } from "./pages/HabitsPage";
import { JournalPage } from "./pages/journal/JournalPage";
import { LandingPage } from "./pages/LandingPage";
import { ProjectDetailPage } from "./pages/ProjectDetailPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { TasksPage } from "./pages/TasksPage";
import { RouterProvider, useRouter } from "./router/Router";

function AppRoutes() {
  const { path } = useRouter();

  if (path.startsWith("/projects/")) {
    const projectId = path.replace("/projects/", "").split("/")[0];
    return (
      <AppShell>
        <ProjectDetailPage projectId={projectId} />
      </AppShell>
    );
  }

  if (path.startsWith("/goals/")) {
    const goalId = path.replace("/goals/", "").split("/")[0];
    return (
      <AppShell>
        <GoalDetailPage goalId={goalId} />
      </AppShell>
    );
  }

  switch (path) {
    case "/":
      return <LandingPage />;

    case "/login":
      return <AuthPage mode="login" />;

    case "/signup":
      return <AuthPage mode="signup" />;

    case "/dashboard":
      return (
        <AppShell>
          <DashboardView />
        </AppShell>
      );

    case "/tasks":
      return (
        <AppShell>
          <TasksPage />
        </AppShell>
      );

    case "/projects":
      return (
        <AppShell>
          <ProjectsPage />
        </AppShell>
      );

    case "/goals":
      return (
        <AppShell>
          <GoalsPage />
        </AppShell>
      );

    case "/habits":
      return (
        <AppShell>
          <HabitsPage />
        </AppShell>
      );

    case "/journal":
      return (
        <AppShell>
          <JournalPage />
        </AppShell>
      );

    case "/calendar":
      return (
        <AppShell>
          <FeaturePlaceholder
            title="Calendar & Agenda"
            description="Unified schedule view integrating time-blocked focus sessions, upcoming deadlines, and daily agenda timelines."
            icon={Calendar}
            plannedMilestone="Phase 3 Milestone"
          />
        </AppShell>
      );

    case "/notes":
      return (
        <AppShell>
          <FeaturePlaceholder
            title="Notes & Focus Journal"
            description="Distraction-free quick capture, markdown thinking pads, and contextual project documentation."
            icon={BookOpen}
            plannedMilestone="Phase 4 Milestone"
          />
        </AppShell>
      );

    case "/expenses":
      return (
        <AppShell>
          <FeaturePlaceholder
            title="Expenses & Budgeting"
            description="Log financial transactions, track monthly budgets, and analyze spending habits without bloated spreadsheet complexity."
            icon={Receipt}
            plannedMilestone="Phase 4 Milestone"
          />
        </AppShell>
      );

    case "/health":
      return (
        <AppShell>
          <FeaturePlaceholder
            title="Health & Recovery"
            description="Monitor sleep consistency, workout streaks, and daily wellness habits unified inside your personal Life OS."
            icon={HeartPulse}
            plannedMilestone="Phase 5 Milestone"
          />
        </AppShell>
      );

    case "/settings":
      return (
        <AppShell>
          <FeaturePlaceholder
            title="Workspace Settings"
            description="Manage personal preferences, notifications, theme density, and account details."
            icon={Settings}
            plannedMilestone="Phase 5 Milestone"
          />
        </AppShell>
      );

    default:
      return (
        <AppShell>
          <FeaturePlaceholder
            title="Page Not Found"
            description="The requested page does not exist in the TrackUp Life OS application."
            icon={Compass}
            plannedMilestone="404 Status"
          />
        </AppShell>
      );
  }
}

import { AuthProvider } from "./context/AuthContext";

export function App() {
  return (
    <AuthProvider>
      <RouterProvider>
        <AppRoutes />
      </RouterProvider>
    </AuthProvider>
  );
}

export default App;

