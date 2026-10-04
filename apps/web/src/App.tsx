import {
  BookOpen,
  Calendar,
  Compass,
  FolderKanban,
  HeartPulse,
  Receipt,
  Settings,
  Sparkles,
  Target,
} from "lucide-react";
import { AppShell } from "./components/AppShell";
import { AuthPage } from "./pages/AuthPage";
import { DashboardView } from "./pages/DashboardView";
import { FeaturePlaceholder } from "./pages/FeaturePlaceholder";
import { LandingPage } from "./pages/LandingPage";
import { TasksPage } from "./pages/TasksPage";
import { RouterProvider, useRouter } from "./router/Router";

function AppRoutes() {
  const { path } = useRouter();

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
          <FeaturePlaceholder
            title="Projects & Roadmaps"
            description="Group related tasks into strategic initiatives, manage completion velocity, and organize milestones with timeline clarity."
            icon={FolderKanban}
            plannedMilestone="Phase 2 Milestone"
          />
        </AppShell>
      );

    case "/goals":
      return (
        <AppShell>
          <FeaturePlaceholder
            title="Goals & Objectives"
            description="Set high-level annual and quarterly targets, track milestone percentages, and tie day-to-day actions directly to strategic objectives."
            icon={Target}
            plannedMilestone="Phase 2 Milestone"
          />
        </AppShell>
      );

    case "/habits":
      return (
        <AppShell>
          <FeaturePlaceholder
            title="Atomic Habits"
            description="Build frictionless routines, monitor consistency streaks, and stack daily habits to sustain compounded growth."
            icon={Sparkles}
            plannedMilestone="Phase 3 Milestone"
          />
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

export function App() {
  return (
    <RouterProvider>
      <AppRoutes />
    </RouterProvider>
  );
}

export default App;
