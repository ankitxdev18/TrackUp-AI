import {
  BookOpen,
  Compass,
  HeartPulse,
  Receipt,
} from "lucide-react";

import { AppShell } from "./components/AppShell";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AuthPage } from "./pages/AuthPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { CalendarPage } from "./pages/CalendarPage";
import { DashboardView } from "./pages/DashboardView";
import { FeaturePlaceholder } from "./pages/FeaturePlaceholder";
import { GoalDetailPage } from "./pages/GoalDetailPage";
import { GoalsPage } from "./pages/GoalsPage";
import { HabitsPage } from "./pages/HabitsPage";
import { IdeasPage } from "./pages/IdeasPage";
import { JournalPage } from "./pages/journal/JournalPage";
import { LandingPage } from "./pages/LandingPage";
import { ProjectDetailPage } from "./pages/ProjectDetailPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TasksPage } from "./pages/TasksPage";
import { RouterProvider, useRouter } from "./router/Router";

function AppRoutes() {
  const { path } = useRouter();

  // Public unauthenticated routes
  if (path === "/") {
    return <LandingPage />;
  }

  if (path === "/login") {
    return <AuthPage mode="login" />;
  }

  if (path === "/signup") {
    return <AuthPage mode="signup" />;
  }

  // All other routes are private workspace routes guarded by ProtectedRoute
  if (path.startsWith("/projects/")) {
    const projectId = path.replace("/projects/", "").split("/")[0];
    return (
      <ProtectedRoute>
        <AppShell>
          <ProjectDetailPage projectId={projectId} />
        </AppShell>
      </ProtectedRoute>
    );
  }

  if (path.startsWith("/goals/")) {
    const goalId = path.replace("/goals/", "").split("/")[0];
    return (
      <ProtectedRoute>
        <AppShell>
          <GoalDetailPage goalId={goalId} />
        </AppShell>
      </ProtectedRoute>
    );
  }

  const renderPrivateContent = () => {
    switch (path) {
      case "/dashboard":
        return <DashboardView />;

      case "/tasks":
        return <TasksPage />;

      case "/projects":
        return <ProjectsPage />;

      case "/goals":
        return <GoalsPage />;

      case "/habits":
        return <HabitsPage />;

      case "/analytics":
        return <AnalyticsPage />;

      case "/journal":
        return <JournalPage />;

      case "/ideas":
        return <IdeasPage />;

      case "/calendar":
        return <CalendarPage />;

      case "/notes":
        return (
          <FeaturePlaceholder
            title="Notes & Focus Journal"
            description="Distraction-free quick capture, markdown thinking pads, and contextual project documentation."
            icon={BookOpen}
            plannedMilestone="Phase 4 Milestone"
          />
        );

      case "/expenses":
        return (
          <FeaturePlaceholder
            title="Expenses & Budgeting"
            description="Log financial transactions, track monthly budgets, and analyze spending habits without bloated spreadsheet complexity."
            icon={Receipt}
            plannedMilestone="Phase 4 Milestone"
          />
        );

      case "/health":
        return (
          <FeaturePlaceholder
            title="Health & Recovery"
            description="Monitor sleep consistency, workout streaks, and daily wellness habits unified inside your personal Life OS."
            icon={HeartPulse}
            plannedMilestone="Phase 5 Milestone"
          />
        );

      case "/settings":
        return <SettingsPage />;

      default:
        return (
          <FeaturePlaceholder
            title="Page Not Found"
            description="The requested page does not exist in the TrackUp Life OS application."
            icon={Compass}
            plannedMilestone="404 Status"
          />
        );
    }
  };

  return (
    <ProtectedRoute>
      <AppShell>{renderPrivateContent()}</AppShell>
    </ProtectedRoute>
  );
}

import { AuthProvider } from "./context/AuthContext";
import { NotificationProvider } from "./context/NotificationContext";

export function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <RouterProvider>
          <AppRoutes />
        </RouterProvider>
      </NotificationProvider>
    </AuthProvider>
  );
}

export default App;

