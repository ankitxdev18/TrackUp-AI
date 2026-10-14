import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AuthProvider, setTestAuthOverride } from "../context/AuthContext";
import * as expensesApi from "../api/expenses";
import { ExpensesPage } from "../pages/ExpensesPage";

const mockExpenses: expensesApi.Expense[] = [
  {
    id: "exp-1",
    userId: "user-1",
    amountCents: 8450, // ₹84.50
    date: "2026-10-12",
    categoryId: "food",
    description: "Whole Foods groceries",
    createdAt: "2026-10-12T10:00:00.000Z",
    updatedAt: "2026-10-12T10:00:00.000Z",
  },
  {
    id: "exp-2",
    userId: "user-1",
    amountCents: 6500, // ₹65.00
    date: "2026-10-11",
    categoryId: "transport",
    description: "Metro monthly pass",
    createdAt: "2026-10-11T12:00:00.000Z",
    updatedAt: "2026-10-11T12:00:00.000Z",
  },
  {
    id: "exp-3",
    userId: "user-1",
    amountCents: 15000, // ₹150.00
    date: "2026-10-05",
    categoryId: "housing",
    description: "Fiber internet bill",
    createdAt: "2026-10-05T09:00:00.000Z",
    updatedAt: "2026-10-05T09:00:00.000Z",
  },
];

const mockSummary: expensesApi.ExpenseSummaryResponse = {
  startDate: "2026-10-01",
  endDate: "2026-10-31",
  totalAmountCents: 29950, // ₹299.50
  transactionCount: 3,
  byCategory: [
    {
      categoryId: "housing",
      totalAmountCents: 15000,
      transactionCount: 1,
      percentage: 50.1,
    },
    {
      categoryId: "food",
      totalAmountCents: 8450,
      transactionCount: 1,
      percentage: 28.2,
    },
    {
      categoryId: "transport",
      totalAmountCents: 6500,
      transactionCount: 1,
      percentage: 21.7,
    },
  ],
};

const mockBudget: expensesApi.MonthlyBudget = {
  id: "budget-1",
  userId: "user-1",
  month: "2026-10",
  amountCents: 50000, // ₹500.00
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

const mockBudgetSummary: expensesApi.MonthlyBudgetSummary = {
  budget: mockBudget,
  month: "2026-10",
  startDate: "2026-10-01",
  endDate: "2026-10-31",
  budgetAmountCents: 50000, // ₹500.00
  spentAmountCents: 29950, // ₹299.50
  remainingAmountCents: 20050, // ₹200.50
  overBudgetAmountCents: 0,
  utilizationPercent: 59.9,
  transactionCount: 3,
  isExceeded: false,
};

describe("ExpensesPage Component Integration Suite", () => {
  beforeEach(() => {
    vi.spyOn(expensesApi, "fetchExpenses").mockResolvedValue({
      expenses: mockExpenses,
      total: 3,
    });
    vi.spyOn(expensesApi, "fetchExpenseSummary").mockResolvedValue(mockSummary);
    vi.spyOn(expensesApi, "fetchMonthlyBudget").mockResolvedValue(mockBudgetSummary);
    vi.spyOn(expensesApi, "saveMonthlyBudget").mockResolvedValue(mockBudget);
    vi.spyOn(expensesApi, "createExpense").mockResolvedValue({
      id: "exp-new",
      userId: "user-1",
      amountCents: 4200,
      date: "2026-10-12",
      categoryId: "entertainment",
      description: "Cinema night",
      createdAt: "2026-10-12T14:00:00.000Z",
      updatedAt: "2026-10-12T14:00:00.000Z",
    });
    vi.spyOn(expensesApi, "updateExpense").mockResolvedValue({
      ...mockExpenses[0]!,
      amountCents: 9000,
      description: "Whole Foods updated",
    });
    vi.spyOn(expensesApi, "deleteExpense").mockResolvedValue({
      success: true,
      id: "exp-1",
    });
    vi.spyOn(expensesApi, "deleteMonthlyBudget").mockResolvedValue({
      success: true,
      message: "Monthly budget deleted successfully",
      month: "2026-10",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("1. renders orientation header, spending pulse cards, and category breakdown bar", async () => {
    render(<ExpensesPage />);

    // Header verification
    expect(screen.getByRole("heading", { name: "Expenses" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log new expense" })).toBeInTheDocument();

    // Await API resolution
    await waitFor(() => {
      // Total spent: ₹299.50 (present in spending pulse card and monthly budget tracker)
      expect(screen.getAllByText("₹299.50").length).toBeGreaterThan(0);
      // Total transactions: 3 (present in summary pulse card and ledger header counter)
      expect(screen.getAllByText("3").length).toBeGreaterThan(0);
      // Top category
      expect(screen.getAllByText("Housing & Utilities").length).toBeGreaterThan(0);
    });

    // Category distribution bar renders legend pills
    expect(screen.getByText("Category Distribution")).toBeInTheDocument();
    expect(screen.getAllByText("Food & Dining").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Transportation").length).toBeGreaterThan(0);

    // Table renders transactions with correct formatted amounts
    expect(screen.getAllByText("Whole Foods groceries").length).toBeGreaterThan(0);
    expect(screen.getAllByText("₹84.50").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Metro monthly pass").length).toBeGreaterThan(0);
    expect(screen.getAllByText("₹65.00").length).toBeGreaterThan(0);
  });

  it("2. opens New Expense modal, fills fields, and submits successfully", async () => {
    render(<ExpensesPage />);

    await waitFor(() => {
      expect(screen.getAllByText("₹299.50").length).toBeGreaterThan(0);
    });

    // Click "New Expense"
    fireEvent.click(screen.getByRole("button", { name: "Log new expense" }));

    // Modal opens
    expect(screen.getByRole("heading", { name: "Log Expense" })).toBeInTheDocument();

    // Fill amount: 42.00
    const amountInput = screen.getByLabelText(/amount/i);
    fireEvent.change(amountInput, { target: { value: "42.00" } });

    // Select category: Entertainment
    const entTile = screen.getByRole("radio", { name: /entertainment/i });
    fireEvent.click(entTile);

    // Fill description
    const descInput = screen.getByLabelText(/description/i);
    fireEvent.change(descInput, { target: { value: "Cinema night" } });

    // Submit
    const saveButton = screen.getByRole("button", { name: /save expense/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(expensesApi.createExpense).toHaveBeenCalledWith({
        amountCents: 4200,
        date: expect.any(String),
        categoryId: "entertainment",
        description: "Cinema night",
      });
    });
  });

  it("3. validates zero or negative amount in modal and displays error banner", async () => {
    render(<ExpensesPage />);

    await waitFor(() => {
      expect(screen.getAllByText("₹299.50").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole("button", { name: "Log new expense" }));

    // Try to save with 0.00
    const amountInput = screen.getByLabelText(/amount/i);
    fireEvent.change(amountInput, { target: { value: "0.00" } });

    const saveButton = screen.getByRole("button", { name: /save expense/i });
    fireEvent.click(saveButton);

    expect(
      screen.getByText(/please enter a valid amount greater than zero/i)
    ).toBeInTheDocument();
    expect(expensesApi.createExpense).not.toHaveBeenCalled();
  });

  it("4. opens Edit modal on row edit click and submits update", async () => {
    render(<ExpensesPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Whole Foods groceries").length).toBeGreaterThan(0);
    });

    // Open row action menu for first row
    const actionBtns = screen.getAllByRole("button", { name: /transaction actions/i });
    fireEvent.click(actionBtns[0]!);

    // Click "Edit"
    const editBtn = screen.getByRole("menuitem", { name: /edit/i });
    fireEvent.click(editBtn);

    // Modal opens in Edit mode
    expect(screen.getByRole("heading", { name: "Edit Expense" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("84.50")).toBeInTheDocument();

    // Modify amount
    const amountInput = screen.getByLabelText(/amount/i);
    fireEvent.change(amountInput, { target: { value: "90.00" } });

    // Save
    const saveButton = screen.getByRole("button", { name: /update expense/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(expensesApi.updateExpense).toHaveBeenCalledWith("exp-1", {
        amountCents: 9000,
        date: "2026-10-12",
        categoryId: "food",
        description: "Whole Foods groceries",
      });
    });
  });

  it("5. opens Delete confirmation dialog and confirms deletion", async () => {
    render(<ExpensesPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Whole Foods groceries").length).toBeGreaterThan(0);
    });

    // Open row action menu
    const actionBtns = screen.getAllByRole("button", { name: /transaction actions/i });
    fireEvent.click(actionBtns[0]!);

    // Click "Delete"
    const deleteBtn = screen.getByRole("menuitem", { name: /delete/i });
    fireEvent.click(deleteBtn);

    // Confirmation dialog opens
    expect(screen.getByRole("heading", { name: "Delete Expense" })).toBeInTheDocument();
    expect(
      screen.getByText(/are you sure you want to delete this expense/i)
    ).toBeInTheDocument();

    // Confirm deletion
    const confirmDeleteBtn = screen.getByRole("button", { name: /^delete expense$/i });
    fireEvent.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(expensesApi.deleteExpense).toHaveBeenCalledWith("exp-1");
    });
  });

  it("6. changes period filter and re-fetches data", async () => {
    render(<ExpensesPage />);

    await waitFor(() => {
      expect(screen.getAllByText("₹299.50").length).toBeGreaterThan(0);
    });

    // Click "Last 30 Days"
    const btn30d = screen.getByRole("button", { name: /last 30 days/i });
    fireEvent.click(btn30d);

    await waitFor(() => {
      expect(expensesApi.fetchExpenses).toHaveBeenCalledTimes(2);
      expect(expensesApi.fetchExpenseSummary).toHaveBeenCalledTimes(2);
    });
  });

  it("7. filters by category select and resets filter cleanly", async () => {
    render(<ExpensesPage />);

    await waitFor(() => {
      expect(screen.getAllByText("₹299.50").length).toBeGreaterThan(0);
    });

    // Change category dropdown to food
    const catSelect = screen.getByLabelText(/filter by category/i);
    fireEvent.change(catSelect, { target: { value: "food" } });

    await waitFor(() => {
      expect(expensesApi.fetchExpenses).toHaveBeenCalledWith(
        expect.objectContaining({ categoryId: "food" })
      );
    });

    // Reset button appears
    const resetBtn = screen.getByRole("button", { name: /reset all filters/i });
    fireEvent.click(resetBtn);

    await waitFor(() => {
      expect(expensesApi.fetchExpenses).toHaveBeenCalledWith(
        expect.objectContaining({ categoryId: undefined })
      );
    });
  });

  it("8. renders empty state when zero expenses exist in period", async () => {
    vi.spyOn(expensesApi, "fetchExpenses").mockResolvedValue({
      expenses: [],
      total: 0,
    });
    vi.spyOn(expensesApi, "fetchExpenseSummary").mockResolvedValue({
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      totalAmountCents: 0,
      transactionCount: 0,
      byCategory: [],
    });

    render(<ExpensesPage />);

    await waitFor(() => {
      expect(screen.getByText(/no expenses recorded yet/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /log your first expense/i })).toBeInTheDocument();
    });
  });

  it("9. renders filtered ratio count and clear filters button in ledger header when active filters are present", async () => {
    // When filtered by food, returns 1 expense out of 3 in the period
    vi.spyOn(expensesApi, "fetchExpenses").mockResolvedValue({
      expenses: [mockExpenses[0]!],
      total: 1,
    });
    vi.spyOn(expensesApi, "fetchExpenseSummary").mockResolvedValue(mockSummary);

    render(<ExpensesPage />);

    // Await initial load and find filter
    const catSelect = await screen.findByLabelText(/filter by category/i);
    fireEvent.change(catSelect, { target: { value: "food" } });

    await waitFor(() => {
      // Period summary pulse card still shows total period count: 3
      expect(screen.getAllByText("3").length).toBeGreaterThan(0);
      // Ledger header displays: Showing 1 of 3 transactions (filtered)
      expect(screen.getByText(/showing/i)).toBeInTheDocument();
      expect(screen.getByText("(filtered)")).toBeInTheDocument();
      // Clear filters button is present in the ledger header
      expect(screen.getByRole("button", { name: "Clear active filters" })).toBeInTheDocument();
    });

    // Clicking clear filters resets category filter
    fireEvent.click(screen.getByRole("button", { name: "Clear active filters" }));

    await waitFor(() => {
      expect(expensesApi.fetchExpenses).toHaveBeenCalledWith(
        expect.objectContaining({ categoryId: undefined })
      );
    });
  });

  it("10. renders monthly budget tracker card with limit, spent, remaining, utilization, and progress bar", async () => {
    render(<ExpensesPage />);

    await waitFor(() => {
      expect(screen.getByText("Monthly Budget Tracker")).toBeInTheDocument();
      // Budget limit ₹500.00
      expect(screen.getByText("₹500.00")).toBeInTheDocument();
      // Remaining: ₹200.50
      expect(screen.getByText("₹200.50")).toBeInTheDocument();
      // Utilization: 59.9%
      expect(screen.getByText("59.9%")).toBeInTheDocument();
      // Progressbar element
      const progressBar = screen.getByRole("progressbar");
      expect(progressBar).toHaveAttribute("aria-valuenow", "59.9");
    });
  });

  it("11. renders empty budget state when no budget exists, opens modal, and sets new budget", async () => {
    vi.spyOn(expensesApi, "fetchMonthlyBudget").mockResolvedValue({
      budget: null,
      month: "2026-10",
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      budgetAmountCents: null,
      spentAmountCents: 29950,
      remainingAmountCents: 0,
      overBudgetAmountCents: 0,
      utilizationPercent: 0,
      transactionCount: 3,
      isExceeded: false,
    });

    render(<ExpensesPage />);

    await waitFor(() => {
      expect(screen.getByText(/no spending limit configured for this month/i)).toBeInTheDocument();
    });

    // Click "Set Monthly Budget"
    fireEvent.click(screen.getByRole("button", { name: /set monthly budget/i }));

    // Budget modal opens
    expect(screen.getByRole("heading", { name: /set monthly budget/i })).toBeInTheDocument();

    // Enter budget amount: 1000.00
    const amountInput = screen.getByLabelText(/monthly budget limit/i);
    fireEvent.change(amountInput, { target: { value: "1000.00" } });

    // Click "Save Budget"
    fireEvent.click(screen.getByRole("button", { name: "Save Budget" }));

    await waitFor(() => {
      expect(expensesApi.saveMonthlyBudget).toHaveBeenCalledWith(
        expect.objectContaining({
          month: "2026-10",
          amountCents: 100000,
        })
      );
    });
  });

  it("12. renders exceeded budget state with over-budget amount and danger alert when spending exceeds limit", async () => {
    vi.spyOn(expensesApi, "fetchMonthlyBudget").mockResolvedValue({
      budget: mockBudget,
      month: "2026-10",
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      budgetAmountCents: 20000, // ₹200.00 limit
      spentAmountCents: 29950, // ₹299.50 spent
      remainingAmountCents: 0,
      overBudgetAmountCents: 9950, // ₹99.50 over budget
      utilizationPercent: 149.8,
      transactionCount: 3,
      isExceeded: true,
    });

    render(<ExpensesPage />);

    await waitFor(() => {
      expect(screen.getByText("Monthly Budget Tracker")).toBeInTheDocument();
      // Over budget metric value
      expect(screen.getByText("+₹99.50")).toBeInTheDocument();
      // Over budget warning text
      expect(screen.getByText(/budget exceeded/i)).toBeInTheDocument();
      // Progressbar is clamped at 100%
      const progressBar = screen.getByRole("progressbar");
      expect(progressBar).toHaveAttribute("aria-valuenow", "100");
    });
  });

  it("13. budget modal validates invalid amounts and closes on Escape", async () => {
    render(<ExpensesPage />);

    await waitFor(() => {
      expect(screen.getByText("Monthly Budget Tracker")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /edit.*budget/i }));

    expect(screen.getByRole("heading", { name: /edit monthly budget/i })).toBeInTheDocument();

    const amountInput = screen.getByLabelText(/monthly budget limit/i);
    fireEvent.change(amountInput, { target: { value: "-100" } });
    fireEvent.click(screen.getByRole("button", { name: "Update Budget" }));

    expect(screen.getByText(/please enter a valid positive budget amount/i)).toBeInTheDocument();

    // Closes on Escape
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: /edit monthly budget/i })).not.toBeInTheDocument();
    });
  });

  it("14. maintains monthly budget target on active calendar month when expenses table toggles to rolling 30d filter", async () => {
    render(<ExpensesPage />);

    await waitFor(() => {
      expect(screen.getByText("Monthly Budget Tracker")).toBeInTheDocument();
      expect(expensesApi.fetchMonthlyBudget).toHaveBeenCalledWith(expensesApi.getCurrentCalendarMonth());
    });

    // Reset calls count
    vi.mocked(expensesApi.fetchMonthlyBudget).mockClear();
    vi.mocked(expensesApi.fetchExpenses).mockClear();

    // Toggle to "Last 30 Days" rolling filter
    const btn30d = screen.getByRole("button", { name: /last 30 days/i });
    fireEvent.click(btn30d);

    await waitFor(() => {
      // Table & summary re-fetch with rolling 30-day range
      expect(expensesApi.fetchExpenses).toHaveBeenCalledTimes(1);
      // But Monthly Budget continues targeting the current active calendar month, not the rolling range's previous month start
      expect(expensesApi.fetchMonthlyBudget).toHaveBeenCalledWith(expensesApi.getCurrentCalendarMonth());
    });
  });

  it("15. removes monthly budget with confirmation and renders unconfigured empty state", async () => {
    render(<ExpensesPage />);

    await waitFor(() => {
      expect(screen.getByText("Monthly Budget Tracker")).toBeInTheDocument();
    });

    // Open Edit Budget modal
    fireEvent.click(screen.getByRole("button", { name: /edit.*budget/i }));

    expect(screen.getByRole("heading", { name: /edit monthly budget/i })).toBeInTheDocument();

    // Find and click "Remove Budget"
    const removeBtn = screen.getByRole("button", { name: /remove budget/i });
    fireEvent.click(removeBtn);

    // Confirmation alert prompt appears
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/your recorded expenses will not be deleted/i)).toBeInTheDocument();

    // Test cancellation of confirmation: click "Keep Budget"
    const keepBtn = screen.getByRole("button", { name: /keep budget/i });
    fireEvent.click(keepBtn);

    // Confirmation dismissed, back to standard actions
    expect(screen.queryByText(/your recorded expenses will not be deleted/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update Budget" })).toBeInTheDocument();

    // Now proceed with removal: click "Remove Budget" then "Confirm Remove"
    fireEvent.click(screen.getByRole("button", { name: /remove budget/i }));

    // Mock fetchMonthlyBudget to return null budget after deletion
    vi.mocked(expensesApi.fetchMonthlyBudget).mockResolvedValueOnce({
      budget: null,
      month: expensesApi.getCurrentCalendarMonth(),
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      budgetAmountCents: null,
      spentAmountCents: 29950,
      remainingAmountCents: 0,
      overBudgetAmountCents: 0,
      utilizationPercent: 0,
      transactionCount: 3,
      isExceeded: false,
    });

    const confirmRemoveBtn = screen.getByRole("button", { name: /confirm remove/i });
    fireEvent.click(confirmRemoveBtn);

    await waitFor(() => {
      expect(expensesApi.deleteMonthlyBudget).toHaveBeenCalledWith(expensesApi.getCurrentCalendarMonth());
      // Modal closed
      expect(screen.queryByRole("heading", { name: /edit monthly budget/i })).not.toBeInTheDocument();
      // Toast message appears
      expect(screen.getByText(/monthly budget removed successfully/i)).toBeInTheDocument();
      // Card shows unconfigured empty state
      expect(screen.getByText(/no spending limit configured for this month/i)).toBeInTheDocument();
    });
  });

  it("16. handles monthly budget deletion failure and shows error message without closing dialog", async () => {
    vi.mocked(expensesApi.deleteMonthlyBudget).mockRejectedValueOnce(
      new Error("Network connection error")
    );

    render(<ExpensesPage />);

    await waitFor(() => {
      expect(screen.getByText("Monthly Budget Tracker")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /edit.*budget/i }));

    // Click Remove Budget -> Confirm Remove
    fireEvent.click(screen.getByRole("button", { name: /remove budget/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm remove/i }));

    await waitFor(() => {
      // Modal remains open and shows error banner
      expect(screen.getByRole("heading", { name: /edit monthly budget/i })).toBeInTheDocument();
      expect(screen.getByText("Network connection error")).toBeInTheDocument();
    });
  });

  it("17. rolls over active calendar month when page remains open across midnight without hard refresh", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 31, 23, 59, 0)); // Oct 31, 2026, 23:59:00

    try {
      render(<ExpensesPage />);

      await waitFor(() => {
        expect(screen.getByText("Monthly Budget Tracker")).toBeInTheDocument();
        expect(expensesApi.fetchMonthlyBudget).toHaveBeenCalledWith("2026-10");
        expect(screen.getByText("October 2026")).toBeInTheDocument();
      });

      // Clear mock calls before advancing
      vi.mocked(expensesApi.fetchMonthlyBudget).mockClear();

      // November summary: empty unconfigured budget for November 2026
      const novBudgetSummary: expensesApi.MonthlyBudgetSummary = {
        budget: null,
        month: "2026-11",
        startDate: "2026-11-01",
        endDate: "2026-11-30",
        budgetAmountCents: null,
        spentAmountCents: 0,
        remainingAmountCents: 0,
        overBudgetAmountCents: 0,
        utilizationPercent: 0,
        transactionCount: 0,
        isExceeded: false,
      };
      vi.mocked(expensesApi.fetchMonthlyBudget).mockResolvedValueOnce(novBudgetSummary);

      // Advance clock past midnight into next month
      vi.setSystemTime(new Date(2026, 10, 1, 0, 1, 0)); // Nov 1, 2026, 00:01:00

      // Trigger supported rollover mechanism (visibility change event)
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });

      await waitFor(() => {
        expect(expensesApi.fetchMonthlyBudget).toHaveBeenCalledWith("2026-11");
        expect(screen.getByText("November 2026")).toBeInTheDocument();
        expect(screen.getByText(/no spending limit configured for this month/i)).toBeInTheDocument();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("18. targets new active month for budget create, edit, and delete after month rollover", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 31, 23, 59, 0));

    try {
      render(<ExpensesPage />);

      await waitFor(() => {
        expect(screen.getByText("Monthly Budget Tracker")).toBeInTheDocument();
        expect(expensesApi.fetchMonthlyBudget).toHaveBeenCalledWith("2026-10");
      });

      // Advance into November 2026
      vi.setSystemTime(new Date(2026, 10, 1, 0, 5, 0));

      const novEmptySummary: expensesApi.MonthlyBudgetSummary = {
        budget: null,
        month: "2026-11",
        startDate: "2026-11-01",
        endDate: "2026-11-30",
        budgetAmountCents: null,
        spentAmountCents: 0,
        remainingAmountCents: 0,
        overBudgetAmountCents: 0,
        utilizationPercent: 0,
        transactionCount: 0,
        isExceeded: false,
      };
      vi.mocked(expensesApi.fetchMonthlyBudget).mockResolvedValue(novEmptySummary);

      // Trigger rollover via focus
      act(() => {
        window.dispatchEvent(new Event("focus"));
      });

      await waitFor(() => {
        expect(expensesApi.fetchMonthlyBudget).toHaveBeenCalledWith("2026-11");
        expect(screen.getByText("November 2026")).toBeInTheDocument();
      });

      // Click Set Monthly Budget
      fireEvent.click(screen.getByRole("button", { name: /set monthly budget/i }));

      // Modal should show November 2026
      expect(screen.getByRole("heading", { name: /set monthly budget/i })).toBeInTheDocument();
      expect(screen.getAllByText("November 2026").length).toBeGreaterThanOrEqual(2);

      // Mock response for save and subsequent fetch
      const novConfiguredSummary: expensesApi.MonthlyBudgetSummary = {
        budget: {
          id: "budget-nov",
          userId: "user-1",
          month: "2026-11",
          amountCents: 60000,
          createdAt: "2026-11-01T00:00:00Z",
          updatedAt: "2026-11-01T00:00:00Z",
        },
        month: "2026-11",
        startDate: "2026-11-01",
        endDate: "2026-11-30",
        budgetAmountCents: 60000,
        spentAmountCents: 0,
        remainingAmountCents: 60000,
        overBudgetAmountCents: 0,
        utilizationPercent: 0,
        transactionCount: 0,
        isExceeded: false,
      };
      vi.mocked(expensesApi.fetchMonthlyBudget).mockResolvedValue(novConfiguredSummary);

      // Enter amount ₹600 (60,000 paise) and submit
      const input = screen.getByLabelText(/monthly budget limit/i);
      fireEvent.change(input, { target: { value: "600" } });
      fireEvent.click(screen.getByRole("button", { name: "Save Budget" }));

      await waitFor(() => {
        expect(expensesApi.saveMonthlyBudget).toHaveBeenCalledWith({
          month: "2026-11",
          amountCents: 60000,
        });
      });

      // Open Edit Budget modal
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /edit.*budget/i })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole("button", { name: /edit.*budget/i }));

      // Click Remove Budget -> Confirm Remove
      fireEvent.click(screen.getByRole("button", { name: /remove budget/i }));
      fireEvent.click(screen.getByRole("button", { name: /confirm remove/i }));

      await waitFor(() => {
        expect(expensesApi.deleteMonthlyBudget).toHaveBeenCalledWith("2026-11");
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("19. discards stale asynchronous budget response when month rolls over during inflight request", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 31, 23, 59, 0));

    try {
      let resolveInitialBudget: (value: expensesApi.MonthlyBudgetSummary) => void = () => {};
      const slowInitialBudgetPromise = new Promise<expensesApi.MonthlyBudgetSummary>((resolve) => {
        resolveInitialBudget = resolve;
      });

      vi.mocked(expensesApi.fetchMonthlyBudget).mockReturnValueOnce(slowInitialBudgetPromise);

      render(<ExpensesPage />);

      // While initial request for 2026-10 is still inflight, rollover to 2026-11 occurs
      vi.setSystemTime(new Date(2026, 10, 1, 0, 1, 0));

      const novSummary: expensesApi.MonthlyBudgetSummary = {
        budget: {
          id: "budget-nov",
          userId: "user-1",
          month: "2026-11",
          amountCents: 75000,
          createdAt: "2026-11-01T00:00:00Z",
          updatedAt: "2026-11-01T00:00:00Z",
        },
        month: "2026-11",
        startDate: "2026-11-01",
        endDate: "2026-11-30",
        budgetAmountCents: 75000,
        spentAmountCents: 0,
        remainingAmountCents: 75000,
        overBudgetAmountCents: 0,
        utilizationPercent: 0,
        transactionCount: 0,
        isExceeded: false,
      };

      vi.mocked(expensesApi.fetchMonthlyBudget).mockResolvedValueOnce(novSummary);

      // Trigger rollover
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });

      await waitFor(() => {
        expect(expensesApi.fetchMonthlyBudget).toHaveBeenCalledWith("2026-11");
        expect(screen.getByText("November 2026")).toBeInTheDocument();
      });

      // Now resolve the old 2026-10 response late
      resolveInitialBudget(mockBudgetSummary);

      // Verify that November 2026 remains rendered and is NOT overwritten by the old October response
      await waitFor(() => {
        expect(screen.getByText("November 2026")).toBeInTheDocument();
        expect(screen.queryByText("October 2026")).not.toBeInTheDocument();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("20. rolls over active month when continuously visible across midnight without any focus or visibilitychange events", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(new Date(2026, 9, 31, 23, 59, 0)); // Oct 31, 2026, 23:59:00

    try {
      render(<ExpensesPage />);

      // Flush mount effects
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(screen.getByText("Monthly Budget Tracker")).toBeInTheDocument();
      expect(expensesApi.fetchMonthlyBudget).toHaveBeenCalledWith("2026-10");
      expect(screen.getByText("October 2026")).toBeInTheDocument();

      vi.mocked(expensesApi.fetchMonthlyBudget).mockClear();

      const novBudgetSummary: expensesApi.MonthlyBudgetSummary = {
        budget: null,
        month: "2026-11",
        startDate: "2026-11-01",
        endDate: "2026-11-30",
        budgetAmountCents: null,
        spentAmountCents: 0,
        remainingAmountCents: 0,
        overBudgetAmountCents: 0,
        utilizationPercent: 0,
        transactionCount: 0,
        isExceeded: false,
      };
      vi.mocked(expensesApi.fetchMonthlyBudget).mockResolvedValue(novBudgetSummary);

      // Advance clock and timers past midnight to 00:00:05 Nov 1, 2026 (65 seconds)
      // The scheduled next-midnight timer must fire without any user interaction or browser events
      await act(async () => {
        await vi.advanceTimersByTimeAsync(65 * 1000);
      });

      expect(expensesApi.fetchMonthlyBudget).toHaveBeenCalledWith("2026-11");
      expect(screen.getByText("November 2026")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("21. derives active calendar month from user timezone prop when browser timezone differs", async () => {
    // Instant: 2026-10-31T20:00:00.000Z
    // In UTC / America/Los_Angeles: October 31, 2026 (month: 2026-10)
    // In Asia/Kolkata (+5:30): November 1, 2026 at 01:30 (month: 2026-11)
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-31T20:00:00.000Z"));

    const novBudgetSummary: expensesApi.MonthlyBudgetSummary = {
      budget: null,
      month: "2026-11",
      startDate: "2026-11-01",
      endDate: "2026-11-30",
      budgetAmountCents: null,
      spentAmountCents: 0,
      remainingAmountCents: 0,
      overBudgetAmountCents: 0,
      utilizationPercent: 0,
      transactionCount: 0,
      isExceeded: false,
    };
    vi.mocked(expensesApi.fetchMonthlyBudget).mockResolvedValue(novBudgetSummary);

    try {
      render(<ExpensesPage timezone="Asia/Kolkata" />);

      await waitFor(() => {
        expect(screen.getByText("Monthly Budget Tracker")).toBeInTheDocument();
        expect(expensesApi.fetchMonthlyBudget).toHaveBeenCalledWith("2026-11");
        expect(screen.getByText("November 2026")).toBeInTheDocument();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("22. adopts authoritative timezone from AuthContext when rendered within AuthProvider", async () => {
    setTestAuthOverride({
      user: {
        id: "test-user-id",
        email: "test@example.com",
        name: "Workspace",
        timezone: "Asia/Kolkata",
      },
      loading: false,
    });

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-31T20:00:00.000Z"));

    const novBudgetSummary: expensesApi.MonthlyBudgetSummary = {
      budget: null,
      month: "2026-11",
      startDate: "2026-11-01",
      endDate: "2026-11-30",
      budgetAmountCents: null,
      spentAmountCents: 0,
      remainingAmountCents: 0,
      overBudgetAmountCents: 0,
      utilizationPercent: 0,
      transactionCount: 0,
      isExceeded: false,
    };
    vi.mocked(expensesApi.fetchMonthlyBudget).mockResolvedValue(novBudgetSummary);

    try {
      render(
        <AuthProvider>
          <ExpensesPage />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByText("Monthly Budget Tracker")).toBeInTheDocument();
        expect(expensesApi.fetchMonthlyBudget).toHaveBeenCalledWith("2026-11");
        expect(screen.getByText("November 2026")).toBeInTheDocument();
      });
    } finally {
      vi.useRealTimers();
      setTestAuthOverride(null);
    }
  });
});

describe("Fixed INR Currency Formatting & Safe Parsing (Milestone 5.3B)", () => {
  describe("formatCents", () => {
    it("formats integer paise to INR with standard Indian digit grouping and 2 decimal places", () => {
      expect(expensesApi.formatCents(15000)).toBe("₹150.00");
      expect(expensesApi.formatCents(15050)).toBe("₹150.50");
      expect(expensesApi.formatCents(12500000)).toBe("₹1,25,000.00");
      expect(expensesApi.formatCents(1)).toBe("₹0.01");
      expect(expensesApi.formatCents(0)).toBe("₹0.00");
    });
  });

  describe("parseCurrencyInputToCents", () => {
    it("parses whole rupees and one or two decimal places into exact paise without drift", () => {
      expect(expensesApi.parseCurrencyInputToCents("150")).toBe(15000);
      expect(expensesApi.parseCurrencyInputToCents("150.5")).toBe(15050);
      expect(expensesApi.parseCurrencyInputToCents("150.50")).toBe(15050);
      expect(expensesApi.parseCurrencyInputToCents("0.01")).toBe(1);
      expect(expensesApi.parseCurrencyInputToCents("1,25,000.00")).toBe(12500000);
      expect(expensesApi.parseCurrencyInputToCents(" 150.50 ")).toBe(15050);
    });

    it("rejects negative values and zero", () => {
      expect(expensesApi.parseCurrencyInputToCents("-150")).toBeNull();
      expect(expensesApi.parseCurrencyInputToCents("-0.01")).toBeNull();
      expect(expensesApi.parseCurrencyInputToCents("0")).toBeNull();
      expect(expensesApi.parseCurrencyInputToCents("0.00")).toBeNull();
      expect(expensesApi.parseCurrencyInputToCents("0.0")).toBeNull();
    });

    it("rejects malformed input and repeated decimal points", () => {
      expect(expensesApi.parseCurrencyInputToCents("abc")).toBeNull();
      expect(expensesApi.parseCurrencyInputToCents("")).toBeNull();
      expect(expensesApi.parseCurrencyInputToCents("   ")).toBeNull();
      expect(expensesApi.parseCurrencyInputToCents("$150")).toBeNull();
      expect(expensesApi.parseCurrencyInputToCents("₹150")).toBeNull();
      expect(expensesApi.parseCurrencyInputToCents("150.50.10")).toBeNull();
      expect(expensesApi.parseCurrencyInputToCents("1.2.3")).toBeNull();
    });

    it("rejects excess fractional digits beyond 2 decimal places", () => {
      expect(expensesApi.parseCurrencyInputToCents("150.505")).toBeNull();
      expect(expensesApi.parseCurrencyInputToCents("0.001")).toBeNull();
      expect(expensesApi.parseCurrencyInputToCents("42.1234")).toBeNull();
    });

    it("enforces maximum supported signed 32-bit integer amount and rejects overflow", () => {
      // MAX_SUPPORTED_PAISE is 2147483647 (₹21,474,836.47)
      expect(expensesApi.parseCurrencyInputToCents("21474836.47")).toBe(2147483647);
      expect(expensesApi.parseCurrencyInputToCents("21474836.48")).toBeNull();
      expect(expensesApi.parseCurrencyInputToCents("999999999999")).toBeNull();
    });
  });

  describe("getCurrentCalendarMonth", () => {
    it("returns ISO year-month string formatted as YYYY-MM", () => {
      const octDate = new Date(2026, 9, 15);
      expect(expensesApi.getCurrentCalendarMonth(octDate)).toBe("2026-10");

      const janDate = new Date(2025, 0, 1);
      expect(expensesApi.getCurrentCalendarMonth(janDate)).toBe("2025-01");
    });
  });

  describe("ExpenseModal invalid input handling", () => {
    beforeEach(() => {
      vi.spyOn(expensesApi, "fetchExpenses").mockResolvedValue({
        expenses: mockExpenses,
        total: mockExpenses.length,
      });
      vi.spyOn(expensesApi, "fetchExpenseSummary").mockResolvedValue(mockSummary);
      vi.spyOn(expensesApi, "createExpense").mockResolvedValue({
        id: "exp-new",
        userId: "user-1",
        amountCents: 5000,
        date: "2026-10-12",
        categoryId: "food",
        description: null,
        createdAt: "2026-10-12T14:00:00.000Z",
        updatedAt: "2026-10-12T14:00:00.000Z",
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("prevents submission and displays validation error when entering excess decimal precision", async () => {
      render(<ExpensesPage />);
      await waitFor(() => {
        expect(screen.getByText("₹299.50")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "Log new expense" }));

      const amountInput = screen.getByLabelText(/amount/i);
      fireEvent.change(amountInput, { target: { value: "50.123" } });

      const saveButton = screen.getByRole("button", { name: /save expense/i });
      fireEvent.click(saveButton);

      expect(
        screen.getByText(/please enter a valid amount greater than zero/i)
      ).toBeInTheDocument();
      expect(expensesApi.createExpense).not.toHaveBeenCalled();
    });

    it("prevents submission and displays validation error on overflow amount", async () => {
      render(<ExpensesPage />);
      await waitFor(() => {
        expect(screen.getByText("₹299.50")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "Log new expense" }));

      const amountInput = screen.getByLabelText(/amount/i);
      fireEvent.change(amountInput, { target: { value: "99999999999" } });

      const saveButton = screen.getByRole("button", { name: /save expense/i });
      fireEvent.click(saveButton);

      expect(
        screen.getByText(/please enter a valid amount greater than zero/i)
      ).toBeInTheDocument();
      expect(expensesApi.createExpense).not.toHaveBeenCalled();
    });

    it("prevents submission and rejects malformed grouping separators such as 1,2,000.00", async () => {
      render(<ExpensesPage />);
      await waitFor(() => {
        expect(screen.getByText("₹299.50")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "Log new expense" }));

      const amountInput = screen.getByLabelText(/amount/i);
      fireEvent.change(amountInput, { target: { value: "1,2,000.00" } });

      const saveButton = screen.getByRole("button", { name: /save expense/i });
      fireEvent.click(saveButton);

      expect(
        screen.getByText(/please enter a valid amount greater than zero/i)
      ).toBeInTheDocument();
      expect(expensesApi.createExpense).not.toHaveBeenCalled();
    });
  });

  describe("Grouping separator validation in parseCurrencyInputToCents", () => {
    it("accepts valid Indian grouping formats", () => {
      expect(expensesApi.parseCurrencyInputToCents("1,000")).toBe(100000);
      expect(expensesApi.parseCurrencyInputToCents("12,000")).toBe(1200000);
      expect(expensesApi.parseCurrencyInputToCents("1,25,000")).toBe(12500000);
      expect(expensesApi.parseCurrencyInputToCents("12,50,000.50")).toBe(125000050);
      expect(expensesApi.parseCurrencyInputToCents("1,00,00,000")).toBe(1000000000);
    });

    it("accepts valid Western grouping formats", () => {
      expect(expensesApi.parseCurrencyInputToCents("125,000")).toBe(12500000);
      expect(expensesApi.parseCurrencyInputToCents("1,250,000.00")).toBe(125000000);
    });

    it("rejects malformed grouping separators such as 1,2,000.00", () => {
      expect(expensesApi.parseCurrencyInputToCents("1,2,000.00")).toBeNull();
      expect(expensesApi.parseCurrencyInputToCents("1,2,000")).toBeNull();
      expect(expensesApi.parseCurrencyInputToCents("12,00")).toBeNull();
      expect(expensesApi.parseCurrencyInputToCents(",150")).toBeNull();
      expect(expensesApi.parseCurrencyInputToCents("150,")).toBeNull();
      expect(expensesApi.parseCurrencyInputToCents("1,,500")).toBeNull();
    });
  });

  describe("CategoryDistributionBar Composition Semantics & Accessibility", () => {
    beforeEach(() => {
      vi.spyOn(expensesApi, "fetchExpenses").mockResolvedValue({
        expenses: mockExpenses,
        total: mockExpenses.length,
      });
      vi.spyOn(expensesApi, "fetchExpenseSummary").mockResolvedValue(mockSummary);
    });

    it("exposes category breakdown as composition image/region rather than false 100% progressbar", async () => {
      render(<ExpensesPage />);
      await waitFor(() => {
        expect(screen.getByText("₹299.50")).toBeInTheDocument();
      });

      // Assert role="progressbar" does NOT exist
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();

      // Assert composition visualization exists with accessible label
      expect(
        screen.getByRole("img", { name: /spending breakdown across 3 categories/i })
      ).toBeInTheDocument();

      // Assert interactive filter pills exist with aria-pressed
      const housingPill = screen.getByRole("button", {
        name: /filter by housing & utilities/i,
      });
      expect(housingPill).toHaveAttribute("aria-pressed", "false");
    });

    it("renders calm zero-data composition placeholder when zero expenses exist", async () => {
      vi.spyOn(expensesApi, "fetchExpenses").mockResolvedValue({
        expenses: [],
        total: 0,
      });
      vi.spyOn(expensesApi, "fetchExpenseSummary").mockResolvedValue({
        startDate: "2026-10-01",
        endDate: "2026-10-31",
        totalAmountCents: 0,
        transactionCount: 0,
        byCategory: [],
      });

      render(<ExpensesPage />);
      await waitFor(() => {
        expect(
          screen.getByText(/no category expenditures recorded in this reporting period/i)
        ).toBeInTheDocument();
      });
    });
  });

  describe("ExpenseModal Accessibility & Keyboard Navigation", () => {
    beforeEach(() => {
      vi.spyOn(expensesApi, "fetchExpenses").mockResolvedValue({
        expenses: mockExpenses,
        total: mockExpenses.length,
      });
      vi.spyOn(expensesApi, "fetchExpenseSummary").mockResolvedValue(mockSummary);
    });

    it("closes modal on Escape key press", async () => {
      render(<ExpensesPage />);
      await waitFor(() => {
        expect(screen.getByText("₹299.50")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "Log new expense" }));
      expect(screen.getByRole("heading", { name: "Log Expense" })).toBeInTheDocument();

      fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.queryByRole("heading", { name: "Log Expense" })).not.toBeInTheDocument();
    });

    it("navigates category radio group using arrow keys", async () => {
      render(<ExpensesPage />);
      await waitFor(() => {
        expect(screen.getByText("₹299.50")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "Log new expense" }));
      const foodTile = screen.getByRole("radio", { name: /food & dining/i });
      expect(foodTile).toHaveAttribute("aria-checked", "true");

      // Press ArrowRight to move to housing
      fireEvent.keyDown(foodTile, { key: "ArrowRight" });
      const housingTile = screen.getByRole("radio", { name: /housing & utilities/i });
      expect(housingTile).toHaveAttribute("aria-checked", "true");
    });
  });
});
