import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import * as expensesApi from "../api/expenses";
import { ExpensesPage } from "../pages/ExpensesPage";

const mockExpenses: expensesApi.Expense[] = [
  {
    id: "exp-1",
    userId: "user-1",
    amountCents: 8450, // $84.50
    date: "2026-10-12",
    categoryId: "food",
    description: "Whole Foods groceries",
    createdAt: "2026-10-12T10:00:00.000Z",
    updatedAt: "2026-10-12T10:00:00.000Z",
  },
  {
    id: "exp-2",
    userId: "user-1",
    amountCents: 6500, // $65.00
    date: "2026-10-11",
    categoryId: "transport",
    description: "Metro monthly pass",
    createdAt: "2026-10-11T12:00:00.000Z",
    updatedAt: "2026-10-11T12:00:00.000Z",
  },
  {
    id: "exp-3",
    userId: "user-1",
    amountCents: 15000, // $150.00
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
  totalAmountCents: 29950, // $299.50
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

describe("ExpensesPage Component Integration Suite", () => {
  beforeEach(() => {
    vi.spyOn(expensesApi, "fetchExpenses").mockResolvedValue({
      expenses: mockExpenses,
      total: 3,
    });
    vi.spyOn(expensesApi, "fetchExpenseSummary").mockResolvedValue(mockSummary);
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
      // Total spent: $299.50
      expect(screen.getByText("$299.50")).toBeInTheDocument();
      // Total transactions: 3
      expect(screen.getByText("3")).toBeInTheDocument();
      // Top category
      expect(screen.getAllByText("Housing & Utilities").length).toBeGreaterThan(0);
    });

    // Category distribution bar renders legend pills
    expect(screen.getByText("Category Distribution")).toBeInTheDocument();
    expect(screen.getAllByText("Food & Dining").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Transportation").length).toBeGreaterThan(0);

    // Table renders transactions with correct formatted amounts
    expect(screen.getAllByText("Whole Foods groceries").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$84.50").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Metro monthly pass").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$65.00").length).toBeGreaterThan(0);
  });

  it("2. opens New Expense modal, fills fields, and submits successfully", async () => {
    render(<ExpensesPage />);

    await waitFor(() => {
      expect(screen.getByText("$299.50")).toBeInTheDocument();
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
      expect(screen.getByText("$299.50")).toBeInTheDocument();
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
      expect(screen.getByText("$299.50")).toBeInTheDocument();
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
      expect(screen.getByText("$299.50")).toBeInTheDocument();
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
});
