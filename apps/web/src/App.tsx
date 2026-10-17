import { Suspense } from "react";
import {
  BookOpen,
  Compass,
  HeartPulse,
} from "lucide-react";

import { AppShell } from "./components/AppShell";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AuthPage } from "./pages/AuthPage";
import { LandingPage } from "./pages/LandingPage";
import {
  AnalyticsPage,
  CalendarPage,
  DashboardView,
  FeaturePlaceholder,
  GoalDetailPage,
  GoalsPage,
  HabitsPage,
  IdeasPage,
  JournalPage,
  ProjectDetailPage,
  ProjectsPage,
  ExpensesPage,
  SavingsPage,
  SettingsPage,
  TasksPage,
} from "./pages/lazyPages";
import { RouterProvider, useRouter } from "./router/Router";
import { AuthProvider } from "./context/AuthContext";
import { NotificationProvider } from "./context/NotificationContext";

function RouteLoadingFallback() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "40vh",
        color: "var(--text-muted)",
      }}
      role="status"
      aria-label="Loading page content"
    >
      <div
        style={{
          width: 28,
          height: 28,
          border: "2px solid rgba(124, 111, 246, 0.15)",
          borderTopColor: "var(--primary)",
          borderRadius: "50%",
          animation: "spin 0.6s linear infinite",
        }}
      />
    </div>
  );
}

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
          <Suspense fallback={<RouteLoadingFallback />}>
            <ProjectDetailPage projectId={projectId} />
          </Suspense>
        </AppShell>
      </ProtectedRoute>
    );
  }

  if (path.startsWith("/goals/")) {
    const goalId = path.replace("/goals/", "").split("/")[0];
    return (
      <ProtectedRoute>
        <AppShell>
          <Suspense fallback={<RouteLoadingFallback />}>
            <GoalDetailPage goalId={goalId} />
          </Suspense>
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
        return <ExpensesPage />;

      case "/savings":
        return <SavingsPage />;

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
      <AppShell>
        <Suspense fallback={<RouteLoadingFallback />}>
          {renderPrivateContent()}
        </Suspense>
      </AppShell>
    </ProtectedRoute>
  );
}

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
