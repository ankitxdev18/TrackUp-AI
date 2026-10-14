import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ProjectDetailPage } from "../pages/ProjectDetailPage";
import { GoalModal } from "../components/GoalModal";
import { BudgetModal } from "../pages/expenses/BudgetModal";
import { ExpenseModal } from "../pages/expenses/ExpenseModal";
import * as projectsApi from "../api/projects";
import * as tasksApi from "../api/tasks";

vi.mock("../api/projects");
vi.mock("../api/tasks");
vi.mock("../api/goals");

describe("Milestone 1 — Critical Layout Defects & Modal Hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================
  // STEP A: Project Details Task Row Layout
  // ==========================================
  describe("Step A: Project Details Task Rows", () => {
    it("renders task rows with the required layout classes and elements", async () => {
      vi.mocked(projectsApi.fetchProject).mockResolvedValue({
        project: {
          id: "proj-1",
          userId: "user-1",
          name: "Website Redesign",
          description: "Overhaul landing page",
          status: "ACTIVE",
          taskCount: 2,
          completedTaskCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        tasks: [
          {
            id: "task-1",
            userId: "user-1",
            title: "Design high-fidelity mockups for landing page and mobile breakpoints",
            status: "TODO",
            priority: "HIGH",
            dueDate: "2026-10-15",
            projectId: "proj-1",
            completedAt: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: "task-2",
            userId: "user-1",
            title: "Super extremely long title that wraps gracefully without breaking layout across small viewports or colliding with action buttons or due date pills",
            status: "COMPLETED",
            priority: "LOW",
            dueDate: null,
            projectId: "proj-1",
            completedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      });

      render(<ProjectDetailPage projectId="proj-1" />);

      await waitFor(() => {
        expect(screen.getByText("Website Redesign")).toBeInTheDocument();
      });

      // Assert presence of task list container and row cards
      const taskList = document.querySelector(".tasks-items-list");
      expect(taskList).toBeInTheDocument();

      const taskCards = document.querySelectorAll(".task-row-card");
      expect(taskCards.length).toBe(2);

      // Card 1 assertions
      const card1 = taskCards[0]!;
      expect(card1).not.toHaveClass("task-completed");
      expect(card1.querySelector(".task-checkbox-circle")).toBeInTheDocument();
      expect(card1.querySelector(".task-row-content")).toBeInTheDocument();
      expect(card1.querySelector(".task-row-title")).toHaveTextContent(
        "Design high-fidelity mockups"
      );
      expect(card1.querySelector(".task-row-meta")).toBeInTheDocument();
      expect(card1.querySelector(".task-priority-badge")).toHaveTextContent("High");
      expect(card1.querySelector(".task-priority-badge")).toHaveClass("priority-high");
      expect(card1.querySelector(".task-btn-delete")).toBeInTheDocument();

      // Card 2 assertions (completed state)
      const card2 = taskCards[1]!;
      expect(card2).toHaveClass("task-completed");
      expect(card2.querySelector(".task-row-title")).toHaveClass("done");
      expect(card2.querySelector(".task-checkbox-circle")).toHaveClass("completed");
      expect(card2.querySelector(".task-priority-badge")).toHaveClass("priority-low");
    });

    it("handles toggling task completion and deletion correctly", async () => {
      vi.mocked(projectsApi.fetchProject).mockResolvedValue({
        project: {
          id: "proj-1",
          userId: "user-1",
          name: "Website Redesign",
          description: null,
          status: "ACTIVE",
          taskCount: 1,
          completedTaskCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        tasks: [
          {
            id: "task-1",
            userId: "user-1",
            title: "Update typography",
            status: "TODO",
            priority: "MEDIUM",
            dueDate: null,
            projectId: "proj-1",
            completedAt: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      });

      vi.mocked(tasksApi.updateTask).mockResolvedValue({
        id: "task-1",
        userId: "user-1",
        title: "Update typography",
        status: "COMPLETED",
        priority: "MEDIUM",
        dueDate: null,
        projectId: "proj-1",
        completedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      render(<ProjectDetailPage projectId="proj-1" />);

      await waitFor(() => {
        expect(screen.getByText("Update typography")).toBeInTheDocument();
      });

      const checkbox = screen.getByRole("checkbox", { name: /mark update typography as complete/i });
      fireEvent.click(checkbox);

      await waitFor(() => {
        expect(tasksApi.updateTask).toHaveBeenCalledWith("task-1", { status: "COMPLETED" });
      });
    });
  });

  // ==========================================
  // STEP B: Goal Creation Modal
  // ==========================================
  describe("Step B: Goal Creation Modal", () => {
    it("renders modal with viewport overlay backdrop and dialog semantics", () => {
      render(
        <GoalModal
          isOpen={true}
          onClose={vi.fn()}
          onGoalSaved={vi.fn()}
        />
      );

      const backdrop = screen.getByTestId("goal-modal-backdrop");
      expect(backdrop).toBeInTheDocument();
      expect(backdrop).toHaveClass("goal-modal-backdrop");

      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveAttribute("aria-modal", "true");
      expect(dialog).toHaveAttribute("aria-labelledby", "goal-modal-title");
      expect(dialog).toHaveClass("goal-modal-content");
    });

    it("closes on Escape key press", () => {
      const handleClose = vi.fn();
      render(
        <GoalModal
          isOpen={true}
          onClose={handleClose}
          onGoalSaved={vi.fn()}
        />
      );

      fireEvent.keyDown(window, { key: "Escape" });
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it("closes when clicking the backdrop outside the dialog", () => {
      const handleClose = vi.fn();
      render(
        <GoalModal
          isOpen={true}
          onClose={handleClose}
          onGoalSaved={vi.fn()}
        />
      );

      const backdrop = screen.getByTestId("goal-modal-backdrop");
      fireEvent.click(backdrop);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it("does not close when clicking inside the modal dialog", () => {
      const handleClose = vi.fn();
      render(
        <GoalModal
          isOpen={true}
          onClose={handleClose}
          onGoalSaved={vi.fn()}
        />
      );

      const dialog = screen.getByRole("dialog");
      fireEvent.click(dialog);
      expect(handleClose).not.toHaveBeenCalled();
    });

    it("traps focus between first and last interactive elements", () => {
      render(
        <GoalModal
          isOpen={true}
          onClose={vi.fn()}
          onGoalSaved={vi.fn()}
        />
      );

      const closeBtn = screen.getByRole("button", { name: /close modal/i });
      const submitBtn = screen.getByRole("button", { name: /create goal/i });

      // Focus last element and press Tab -> should wrap to first element (closeBtn)
      submitBtn.focus();
      expect(document.activeElement).toBe(submitBtn);

      fireEvent.keyDown(window, { key: "Tab" });
      expect(document.activeElement).toBe(closeBtn);

      // Focus first element and press Shift+Tab -> should wrap to last element (submitBtn)
      fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
      expect(document.activeElement).toBe(submitBtn);
    });
  });

  // ==========================================
  // STEP C: Monthly Budget Modal
  // ==========================================
  describe("Step C: Monthly Budget Modal", () => {
    it("renders with budget-modal-overlay class and dialog semantics", () => {
      render(
        <BudgetModal
          isOpen={true}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
          currentMonth="2026-10"
        />
      );

      const overlay = screen.getByTestId("budget-modal-overlay");
      expect(overlay).toBeInTheDocument();
      expect(overlay).toHaveClass("budget-modal-overlay");

      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveAttribute("aria-modal", "true");
      expect(dialog).toHaveClass("budget-modal-container");
    });

    it("closes BudgetModal on Escape key", () => {
      const handleClose = vi.fn();
      render(
        <BudgetModal
          isOpen={true}
          onClose={handleClose}
          onSubmit={vi.fn()}
          currentMonth="2026-10"
        />
      );

      fireEvent.keyDown(document, { key: "Escape" });
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it("validates empty input and shows error message", async () => {
      render(
        <BudgetModal
          isOpen={true}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
          currentMonth="2026-10"
        />
      );

      const saveBtn = screen.getByRole("button", { name: /save budget/i });
      fireEvent.click(saveBtn);

      expect(screen.getByRole("alert")).toHaveTextContent(
        /Please enter a valid positive budget amount in INR/i
      );
    });
  });

  // ==========================================
  // STEP D: Expense Modal Viewport & Escape
  // ==========================================
  describe("Step D: Expense Modal", () => {
    it("renders expense modal with dialog semantics and close button", () => {
      render(
        <ExpenseModal
          isOpen={true}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
        />
      );

      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveClass("expense-modal-card");

      const closeBtn = screen.getByRole("button", { name: /close dialog/i });
      expect(closeBtn).toBeInTheDocument();
    });

    it("closes ExpenseModal on Escape key", () => {
      const handleClose = vi.fn();
      render(
        <ExpenseModal
          isOpen={true}
          onClose={handleClose}
          onSubmit={vi.fn()}
        />
      );

      fireEvent.keyDown(window, { key: "Escape" });
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });
});
