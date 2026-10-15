import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { SpendingWidget } from "../pages/dashboard/SpendingWidget";
import { FinancialOverview } from "../pages/dashboard/FinancialOverview";
import { DashboardView } from "../pages/DashboardView";
import * as expensesApi from "../api/expenses";
import * as savingsApi from "../api/savings";
import { AuthProvider } from "../context/AuthContext";
import { RouterProvider } from "../router/Router";

describe("Milestone 4: Financial Dashboard Integration Suite", () => {
  const mockBudgetSummaryWithBudget: expensesApi.MonthlyBudgetSummary = {
    budget: {
      id: "b-1",
      userId: "user-1",
      month: "2026-10",
      amountCents: 5000000, // ₹50,000.00
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    },
    month: "2026-10",
    startDate: "2026-10-01",
    endDate: "2026-10-31",
    budgetAmountCents: 5000000,
    spentAmountCents: 1845000, // ₹18,450.00
    remainingAmountCents: 3155000, // ₹31,550.00
    overBudgetAmountCents: 0,
    utilizationPercent: 36.9,
    transactionCount: 8,
    isExceeded: false,
  };

  const mockBudgetSummaryOverBudget: expensesApi.MonthlyBudgetSummary = {
    budget: {
      id: "b-2",
      userId: "user-1",
      month: "2026-10",
      amountCents: 4000000, // ₹40,000.00
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    },
    month: "2026-10",
    startDate: "2026-10-01",
    endDate: "2026-10-31",
    budgetAmountCents: 4000000,
    spentAmountCents: 4500000, // ₹45,000.00
    remainingAmountCents: 0,
    overBudgetAmountCents: 500000, // ₹5,000.00
    utilizationPercent: 112.5,
    transactionCount: 15,
    isExceeded: true,
  };

  const mockBudgetSummaryNoBudget: expensesApi.MonthlyBudgetSummary = {
    budget: null,
    month: "2026-10",
    startDate: "2026-10-01",
    endDate: "2026-10-31",
    budgetAmountCents: null,
    spentAmountCents: 820000, // ₹8,200.00
    remainingAmountCents: 0,
    overBudgetAmountCents: 0,
    utilizationPercent: 0,
    transactionCount: 3,
    isExceeded: false,
  };

  const mockBudgetSummaryZeroExpenses: expensesApi.MonthlyBudgetSummary = {
    budget: null,
    month: "2026-10",
    startDate: "2026-10-01",
    endDate: "2026-10-31",
    budgetAmountCents: null,
    spentAmountCents: 0,
    remainingAmountCents: 0,
    overBudgetAmountCents: 0,
    utilizationPercent: 0,
    transactionCount: 0,
    isExceeded: false,
  };

  const mockRecentExpenses: expensesApi.Expense[] = [
    {
      id: "exp-1",
      userId: "user-1",
      amountCents: 125000, // ₹1,250.00
      categoryId: "food",
      description: "Team Lunch at Bistro",
      date: "2026-10-14",
      createdAt: "2026-10-14T12:30:00.000Z",
      updatedAt: "2026-10-14T12:30:00.000Z",
    },
    {
      id: "exp-2",
      userId: "user-1",
      amountCents: 45000, // ₹450.00
      categoryId: "transport",
      description: "Uber to Client Site",
      date: "2026-10-13",
      createdAt: "2026-10-13T09:15:00.000Z",
      updatedAt: "2026-10-13T09:15:00.000Z",
    },
    {
      id: "exp-3",
      userId: "user-1",
      amountCents: 89900, // ₹899.00
      categoryId: "shopping",
      description: "Ergonomic Mouse",
      date: "2026-10-10",
      createdAt: "2026-10-10T14:00:00.000Z",
      updatedAt: "2026-10-10T14:00:00.000Z",
    },
  ];

  const mockActiveGoal: savingsApi.ActiveSavingsGoal = {
    id: "goal-1",
    name: "Emergency Fund",
    targetAmountCents: 10000000, // ₹1,00,000.00
    savedAmountCents: 5000000, // ₹50,000.00
    remainingAmountCents: 5000000, // ₹50,000.00
    progressPercent: 50.0,
    contributionCount: 2,
    status: "ACTIVE",
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.pushState({}, "", "/dashboard");

    // Standard mock for authenticated user
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes("/api/auth/me")) {
        return {
          ok: true,
          json: async () => ({
            user: { id: "user-1", email: "test@trackup.com", name: "Test User", timezone: "Asia/Kolkata" },
          }),
        } as unknown as Response;
      }

      if (url.includes("/api/expenses/budget")) {
        return {
          ok: true,
          json: async () => mockBudgetSummaryWithBudget,
        } as unknown as Response;
      }

      if (url.includes("/api/expenses")) {
        return {
          ok: true,
          json: async () => ({ expenses: mockRecentExpenses, total: 3 }),
        } as unknown as Response;
      }

      if (url.includes("/api/savings/active")) {
        return {
          ok: true,
          json: async () => ({ goal: mockActiveGoal }),
        } as unknown as Response;
      }

      if (url.includes("/api/tasks")) {
        return {
          ok: true,
          json: async () => ({ tasks: [] }),
        } as unknown as Response;
      }

      if (url.includes("/api/projects")) {
        return {
          ok: true,
          json: async () => ({ projects: [] }),
        } as unknown as Response;
      }

      if (url.includes("/api/goals")) {
        return {
          ok: true,
          json: async () => ({ goals: [] }),
        } as unknown as Response;
      }

      return {
        ok: true,
        json: async () => ({}),
      } as unknown as Response;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. CURRENT-MONTH SPENDING SUMMARY
  // =========================================================================
  describe("1. Current-Month Spending Display", () => {
    it("renders authoritative current-month spending in INR with month and transaction count", async () => {
      vi.spyOn(expensesApi, "fetchMonthlyBudget").mockResolvedValueOnce(mockBudgetSummaryWithBudget);
      vi.spyOn(expensesApi, "fetchExpenses").mockResolvedValueOnce({
        expenses: mockRecentExpenses,
        total: 8,
      });

      render(
        <RouterProvider>
          <SpendingWidget />
        </RouterProvider>
      );

      await waitFor(() => {
        expect(screen.getByText("Monthly Spending")).toBeInTheDocument();
      });

      // Total spent formatted in INR
      expect(screen.getByText("₹18,450.00")).toBeInTheDocument();
      expect(screen.getByText(/Spent in/i)).toBeInTheDocument();
      expect(screen.getByText("8 transactions")).toBeInTheDocument();

      // Navigation link to Expenses
      const viewAllLink = screen.getByRole("link", { name: "View all expenses" });
      expect(viewAllLink).toHaveAttribute("href", "/expenses");
    });
  });

  // =========================================================================
  // 2. BUDGET USAGE & REMAINING BUDGET
  // =========================================================================
  describe("2. Budget Usage & Remaining Budget", () => {
    it("renders budget progress bar and remaining amount when user is within budget", async () => {
      vi.spyOn(expensesApi, "fetchMonthlyBudget").mockResolvedValueOnce(mockBudgetSummaryWithBudget);
      vi.spyOn(expensesApi, "fetchExpenses").mockResolvedValueOnce({
        expenses: mockRecentExpenses,
        total: 8,
      });

      render(
        <RouterProvider>
          <SpendingWidget />
        </RouterProvider>
      );

      await waitFor(() => {
        expect(screen.getByText(/36.9%/)).toBeInTheDocument();
      });

      expect(screen.getByText(/of ₹50,000\.00/i)).toBeInTheDocument();
      expect(screen.getByText("₹31,550.00 remaining")).toBeInTheDocument();

      const progressBar = screen.getByRole("progressbar");
      expect(progressBar).toHaveAttribute("aria-valuenow", "36.9");
      expect(progressBar).toHaveAttribute("aria-valuemin", "0");
      expect(progressBar).toHaveAttribute("aria-valuemax", "100");
    });

    it("renders danger alert styling and over-budget amount when spending exceeds budget", async () => {
      vi.spyOn(expensesApi, "fetchMonthlyBudget").mockResolvedValueOnce(mockBudgetSummaryOverBudget);
      vi.spyOn(expensesApi, "fetchExpenses").mockResolvedValueOnce({
        expenses: mockRecentExpenses,
        total: 15,
      });

      render(
        <RouterProvider>
          <SpendingWidget />
        </RouterProvider>
      );

      await waitFor(() => {
        expect(screen.getByText("₹5,000.00 over budget")).toBeInTheDocument();
      });

      expect(screen.getByText(/112.5%/)).toBeInTheDocument();
      // Progress bar is clamped to max 100 for visual width
      const progressBar = screen.getByRole("progressbar");
      expect(progressBar).toHaveAttribute("aria-valuenow", "100");
    });

    it("renders prompt to set a monthly budget when no budget is configured", async () => {
      vi.spyOn(expensesApi, "fetchMonthlyBudget").mockResolvedValueOnce(mockBudgetSummaryNoBudget);
      vi.spyOn(expensesApi, "fetchExpenses").mockResolvedValueOnce({
        expenses: mockRecentExpenses,
        total: 3,
      });

      render(
        <RouterProvider>
          <SpendingWidget />
        </RouterProvider>
      );

      await waitFor(() => {
        expect(screen.getByText(/No budget set for/i)).toBeInTheDocument();
      });

      const setBudgetLink = screen.getByRole("link", { name: "Set monthly budget" });
      expect(setBudgetLink).toHaveAttribute("href", "/expenses");
    });
  });

  // =========================================================================
  // 3. RECENT EXPENSES LIST
  // =========================================================================
  describe("3. Recent Expenses Transactions", () => {
    it("renders up to 3 recent expense transactions with description, date, and minus amount", async () => {
      vi.spyOn(expensesApi, "fetchMonthlyBudget").mockResolvedValueOnce(mockBudgetSummaryWithBudget);
      vi.spyOn(expensesApi, "fetchExpenses").mockResolvedValueOnce({
        expenses: mockRecentExpenses,
        total: 8,
      });

      render(
        <RouterProvider>
          <SpendingWidget />
        </RouterProvider>
      );

      await waitFor(() => {
        expect(screen.getByText("Recent Expenses")).toBeInTheDocument();
      });

      expect(screen.getByText("Team Lunch at Bistro")).toBeInTheDocument();
      expect(screen.getByText("-₹1,250.00")).toBeInTheDocument();
      expect(screen.getByText("Uber to Client Site")).toBeInTheDocument();
      expect(screen.getByText("-₹450.00")).toBeInTheDocument();
      expect(screen.getByText("Ergonomic Mouse")).toBeInTheDocument();
      expect(screen.getByText("-₹899.00")).toBeInTheDocument();
    });

    it("renders empty expenses placeholder when no transactions exist", async () => {
      vi.spyOn(expensesApi, "fetchMonthlyBudget").mockResolvedValueOnce(mockBudgetSummaryZeroExpenses);
      vi.spyOn(expensesApi, "fetchExpenses").mockResolvedValueOnce({
        expenses: [],
        total: 0,
      });

      render(
        <RouterProvider>
          <SpendingWidget />
        </RouterProvider>
      );

      await waitFor(() => {
        expect(screen.getByText("No expenses recorded this month.")).toBeInTheDocument();
      });

      expect(screen.getByRole("link", { name: "Add expense" })).toHaveAttribute(
        "href",
        "/expenses"
      );
      expect(screen.getByText("₹0.00")).toBeInTheDocument();
      expect(screen.getByText("0 transactions")).toBeInTheDocument();
    });
  });

  // =========================================================================
  // 4. ERROR & RETRY BEHAVIOR
  // =========================================================================
  describe("4. Error Handling and Retry", () => {
    it("renders error box on failure and recovers upon clicking Retry", async () => {
      const budgetSpy = vi
        .spyOn(expensesApi, "fetchMonthlyBudget")
        .mockRejectedValueOnce(new Error("Database connection dropped"))
        .mockResolvedValueOnce(mockBudgetSummaryWithBudget);

      const expensesSpy = vi
        .spyOn(expensesApi, "fetchExpenses")
        .mockRejectedValueOnce(new Error("Network timeout"))
        .mockResolvedValueOnce({ expenses: mockRecentExpenses, total: 8 });

      render(
        <RouterProvider>
          <SpendingWidget />
        </RouterProvider>
      );

      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInTheDocument();
      });

      expect(screen.getByText("Database connection dropped")).toBeInTheDocument();

      // Click retry
      fireEvent.click(screen.getByRole("button", { name: /Retry loading spending/i }));

      await waitFor(() => {
        expect(screen.getByText("₹18,450.00")).toBeInTheDocument();
      });

      expect(budgetSpy).toHaveBeenCalledTimes(2);
      expect(expensesSpy).toHaveBeenCalledTimes(2);
    });

    it("isolates failure in SpendingWidget so it does not affect SavingsWidget in FinancialOverview", async () => {
      vi.spyOn(expensesApi, "fetchMonthlyBudget").mockRejectedValueOnce(
        new Error("Expenses service offline")
      );
      vi.spyOn(expensesApi, "fetchExpenses").mockRejectedValueOnce(
        new Error("Expenses service offline")
      );
      vi.spyOn(savingsApi, "fetchActiveSavingsGoal").mockResolvedValueOnce(mockActiveGoal);

      render(
        <RouterProvider>
          <FinancialOverview />
        </RouterProvider>
      );

      await waitFor(() => {
        expect(screen.getByText("Expenses service offline")).toBeInTheDocument();
      });

      // SavingsWidget continues working normally!
      expect(screen.getByText("Emergency Fund")).toBeInTheDocument();
      expect(screen.getByText("₹50,000.00 saved")).toBeInTheDocument();
      expect(screen.getByText("50%")).toBeInTheDocument();
    });
  });

  // =========================================================================
  // 5. FINANCIAL OVERVIEW WRAPPER & SAVINGS REUSE
  // =========================================================================
  describe("5. FinancialOverview Component & Savings Reuse", () => {
    it("renders both Spending and Savings widgets within an accessible Financial Overview region", async () => {
      vi.spyOn(expensesApi, "fetchMonthlyBudget").mockResolvedValueOnce(mockBudgetSummaryWithBudget);
      vi.spyOn(expensesApi, "fetchExpenses").mockResolvedValueOnce({
        expenses: mockRecentExpenses,
        total: 8,
      });
      vi.spyOn(savingsApi, "fetchActiveSavingsGoal").mockResolvedValueOnce(mockActiveGoal);

      render(
        <RouterProvider>
          <FinancialOverview />
        </RouterProvider>
      );

      await waitFor(() => {
        expect(screen.getByRole("region", { name: "Financial Overview" })).toBeInTheDocument();
      });

      // Spending widget is present
      expect(screen.getByText("Monthly Spending")).toBeInTheDocument();
      expect(screen.getByText("₹18,450.00")).toBeInTheDocument();

      // Savings widget is present
      expect(screen.getByText("Savings Goal")).toBeInTheDocument();
      expect(screen.getByText("Emergency Fund")).toBeInTheDocument();
      expect(screen.getByText("50%")).toBeInTheDocument();
    });
  });

  // =========================================================================
  // 6. TIMEZONE & MONTH-BOUNDARY LOGIC
  // =========================================================================
  describe("6. Timezone & Month-Boundary Helpers", () => {
    it("correctly derives year-month in specified timezone", () => {
      // 2026-10-31 23:30 UTC is 2026-11-01 in Asia/Kolkata
      const testDate = new Date("2026-10-31T23:30:00Z");
      expect(expensesApi.getCalendarMonthInTimezone("Asia/Kolkata", testDate)).toBe("2026-11");
      expect(expensesApi.getCalendarMonthInTimezone("America/New_York", testDate)).toBe("2026-10");
    });

    it("formats canonical month string to human-readable month name", () => {
      expect(expensesApi.formatMonthName("2026-10")).toBe("October 2026");
      expect(expensesApi.formatMonthName("2026-01")).toBe("January 2026");
      expect(expensesApi.formatMonthName("2026-12")).toBe("December 2026");
    });
  });

  // =========================================================================
  // 7. DASHBOARD VIEW INTEGRATION
  // =========================================================================
  describe("7. Full DashboardView Integration", () => {
    it("mounts FinancialOverview with both spending and savings in the horizon column", async () => {
      vi.spyOn(expensesApi, "fetchMonthlyBudget").mockResolvedValueOnce(mockBudgetSummaryWithBudget);
      vi.spyOn(expensesApi, "fetchExpenses").mockResolvedValueOnce({
        expenses: mockRecentExpenses,
        total: 8,
      });
      vi.spyOn(savingsApi, "fetchActiveSavingsGoal").mockResolvedValueOnce(mockActiveGoal);

      render(
        <AuthProvider>
          <RouterProvider>
            <DashboardView />
          </RouterProvider>
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByRole("region", { name: "Financial Overview" })).toBeInTheDocument();
      });

      expect(screen.getByText("Monthly Spending")).toBeInTheDocument();
      expect(screen.getByText("Savings Goal")).toBeInTheDocument();
      expect(screen.getByText("₹18,450.00")).toBeInTheDocument();
      expect(screen.getByText("Emergency Fund")).toBeInTheDocument();
    });
  });
});
