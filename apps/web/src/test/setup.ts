import "@testing-library/jest-dom/vitest";
import { beforeEach } from "vitest";
import { setTestAuthOverride } from "../context/AuthContext";

beforeEach(() => {
  // By default in unit/component tests, simulate authenticated user so feature test suites
  // (tasks, projects, calendar, ideas, journal, etc.) can test feature components without auth interruption.
  // Dedicated auth suites (auth.test.tsx, protected-routes.test.tsx) explicitly reset this to null.
  setTestAuthOverride({
    user: { id: "test-user-id", email: "test@example.com", name: "Workspace" },
    loading: false,
  });
});

