import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { SettingsPage } from "../pages/SettingsPage";
import { AuthProvider, setTestAuthOverride } from "../context/AuthContext";
import * as authApi from "../api/auth";

describe("Phase 4.6: Settings & Profile Frontend Slice", () => {
  const mockUser: authApi.AuthUser = {
    id: "user-123",
    name: "Alex Morgan",
    email: "alex.morgan@trackup.dev",
    timezone: "America/New_York",
    createdAt: "2026-01-15T10:00:00.000Z",
  };

  beforeEach(() => {
    setTestAuthOverride({ user: mockUser, loading: false });
    vi.restoreAllMocks();
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    setTestAuthOverride(null);
    vi.restoreAllMocks();
  });

  function renderSettings() {
    return render(
      <AuthProvider>
        <SettingsPage />
      </AuthProvider>
    );
  }

  describe("1. Layout & Panel Rendering", () => {
    it("renders page title and all 3 panels", () => {
      renderSettings();

      expect(screen.getByRole("heading", { name: "Settings & Account" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Profile & Regional Identity" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Appearance & Theme" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Account Security" })).toBeInTheDocument();
    });

    it("displays initial user information", () => {
      renderSettings();

      expect(screen.getByDisplayValue("Alex Morgan")).toBeInTheDocument();
      expect(screen.getByText("alex.morgan@trackup.dev")).toBeInTheDocument();
      expect(screen.getByText(/Member since .*January.*2026/i)).toBeInTheDocument();
      expect(screen.getByDisplayValue(/America\/New York/i)).toBeInTheDocument();
    });
  });

  describe("2. Profile & Regional Identity Updates", () => {
    it("keeps Save Profile disabled when form is pristine", () => {
      renderSettings();

      const saveBtn = screen.getByRole("button", { name: /Save Profile/i });
      expect(saveBtn).toBeDisabled();
    });

    it("enables Save Profile when name is edited and submits successfully", async () => {
      const updateProfileSpy = vi.spyOn(authApi, "updateProfileApi").mockResolvedValueOnce({
        ...mockUser,
        name: "Alex M. Updated",
      });

      renderSettings();

      const nameInput = screen.getByDisplayValue("Alex Morgan");
      fireEvent.change(nameInput, { target: { value: "Alex M. Updated" } });

      const saveBtn = screen.getByRole("button", { name: /Save Profile/i });
      expect(saveBtn).not.toBeDisabled();

      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(updateProfileSpy).toHaveBeenCalledWith({
          name: "Alex M. Updated",
          timezone: "America/New_York",
        });
      });

      expect(
        await screen.findByText(/Profile and regional preferences saved successfully/i)
      ).toBeInTheDocument();
    });

    it("detects local timezone via quick button", () => {
      renderSettings();

      const detectBtn = screen.getByRole("button", { name: /Use Local/i });
      expect(detectBtn).toBeInTheDocument();
      fireEvent.click(detectBtn);

      // Should keep select valid
      const select = screen.getByLabelText(/Scheduling Timezone/i) as HTMLSelectElement;
      expect(select.value).toBeTruthy();
    });
  });

  describe("3. Appearance & Theme Selection", () => {
    it("switches theme immediately and persists to document attribute and localStorage", () => {
      renderSettings();

      const lightCard = screen.getByRole("radio", { name: /Light \(Clean\)/i });
      fireEvent.click(lightCard);

      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
      expect(localStorage.getItem("trackup_theme")).toBe("light");

      const darkCard = screen.getByRole("radio", { name: /Dark \(Obsidian\)/i });
      fireEvent.click(darkCard);

      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
      expect(localStorage.getItem("trackup_theme")).toBe("dark");
    });
  });

  describe("4. Account Security & Password Rotation", () => {
    it("keeps Update Password disabled until all policy criteria are met", () => {
      renderSettings();

      const submitBtn = screen.getByRole("button", { name: /Update Password/i });
      expect(submitBtn).toBeDisabled();

      const [currentInput, newPasswordInput, confirmInput] = screen.getAllByPlaceholderText(/••••••••••••/i);

      // Too short
      fireEvent.change(currentInput, { target: { value: "OldPassword123!" } });
      fireEvent.change(newPasswordInput, { target: { value: "short" } });
      fireEvent.change(confirmInput, { target: { value: "short" } });
      expect(submitBtn).toBeDisabled();

      // Mismatched
      fireEvent.change(newPasswordInput, { target: { value: "ValidNewPass456!" } });
      fireEvent.change(confirmInput, { target: { value: "DifferentPass789!" } });
      expect(submitBtn).toBeDisabled();

      // Identical to current password
      fireEvent.change(newPasswordInput, { target: { value: "OldPassword123!" } });
      fireEvent.change(confirmInput, { target: { value: "OldPassword123!" } });
      expect(submitBtn).toBeDisabled();

      // Fully valid
      fireEvent.change(newPasswordInput, { target: { value: "ValidNewPass456!" } });
      fireEvent.change(confirmInput, { target: { value: "ValidNewPass456!" } });
      expect(submitBtn).not.toBeDisabled();
    });

    it("submits password change and clears inputs upon success", async () => {
      const changePasswordSpy = vi.spyOn(authApi, "changePasswordApi").mockResolvedValueOnce({
        message: "Password changed successfully",
        sessionsRevoked: true,
      });

      renderSettings();

      const passwordInputs = screen.getAllByPlaceholderText(/••••••••••••/i);
      fireEvent.change(passwordInputs[0], { target: { value: "CurrentSecret123!" } });
      fireEvent.change(passwordInputs[1], { target: { value: "BrandNewSecret456!" } });
      fireEvent.change(passwordInputs[2], { target: { value: "BrandNewSecret456!" } });

      const submitBtn = screen.getByRole("button", { name: /Update Password/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(changePasswordSpy).toHaveBeenCalledWith({
          currentPassword: "CurrentSecret123!",
          newPassword: "BrandNewSecret456!",
        });
      });

      expect(
        await screen.findByText(/All other active sessions have been signed out/i)
      ).toBeInTheDocument();

      // Inputs should be cleared
      expect(passwordInputs[0]).toHaveValue("");
      expect(passwordInputs[1]).toHaveValue("");
      expect(passwordInputs[2]).toHaveValue("");
    });
  });
});
