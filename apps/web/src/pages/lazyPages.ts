import { lazy } from "react";

export const AnalyticsPage = lazy(() =>
  import("./AnalyticsPage").then((m) => ({ default: m.AnalyticsPage }))
);
export const CalendarPage = lazy(() =>
  import("./CalendarPage").then((m) => ({ default: m.CalendarPage }))
);
export const DashboardView = lazy(() =>
  import("./DashboardView").then((m) => ({ default: m.DashboardView }))
);
export const FeaturePlaceholder = lazy(() =>
  import("./FeaturePlaceholder").then((m) => ({ default: m.FeaturePlaceholder }))
);
export const GoalDetailPage = lazy(() =>
  import("./GoalDetailPage").then((m) => ({ default: m.GoalDetailPage }))
);
export const GoalsPage = lazy(() =>
  import("./GoalsPage").then((m) => ({ default: m.GoalsPage }))
);
export const HabitsPage = lazy(() =>
  import("./HabitsPage").then((m) => ({ default: m.HabitsPage }))
);
export const IdeasPage = lazy(() =>
  import("./IdeasPage").then((m) => ({ default: m.IdeasPage }))
);
export const JournalPage = lazy(() =>
  import("./journal/JournalPage").then((m) => ({ default: m.JournalPage }))
);
export const ProjectDetailPage = lazy(() =>
  import("./ProjectDetailPage").then((m) => ({ default: m.ProjectDetailPage }))
);
export const ProjectsPage = lazy(() =>
  import("./ProjectsPage").then((m) => ({ default: m.ProjectsPage }))
);
export const ExpensesPage = lazy(() =>
  import("./ExpensesPage").then((m) => ({ default: m.ExpensesPage }))
);
export const SavingsPage = lazy(() =>
  import("./SavingsPage").then((m) => ({ default: m.SavingsPage }))
);
export const SettingsPage = lazy(() =>
  import("./SettingsPage").then((m) => ({ default: m.SettingsPage }))
);
export const TasksPage = lazy(() =>
  import("./TasksPage").then((m) => ({ default: m.TasksPage }))
);
