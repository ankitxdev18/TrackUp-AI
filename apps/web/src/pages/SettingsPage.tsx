import React, { useEffect, useId, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Lock,
  Moon,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Sun,
  User,
} from "lucide-react";
import { changePasswordApi } from "../api/auth";
import { useAuth } from "../context/AuthContext";
import { applyTheme, getStoredTheme, type Theme } from "../utils/theme";
import {
  formatCurrentTimeInZone,
  getLocalDetectedTimezone,
  getTimezoneOptions,
} from "../utils/timezones";
import "./SettingsPage.css";

export function SettingsPage() {
  const { user, updateProfile } = useAuth();

  // IDs for accessibility
  const nameInputId = useId();
  const emailInputId = useId();
  const timezoneSelectId = useId();
  const currentPasswordId = useId();
  const newPasswordId = useId();
  const confirmPasswordId = useId();

  // --- Profile State ---
  const [name, setName] = useState(user?.name || "");
  const [timezone, setTimezone] = useState(user?.timezone || "UTC");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Sync initial state if user loads asynchronously
  useEffect(() => {
    if (user) {
      setName(user.name || "");
      setTimezone(user.timezone || "UTC");
    }
  }, [user]);

  // Live time preview
  const [currentTimeDisplay, setCurrentTimeDisplay] = useState(
    formatCurrentTimeInZone(timezone)
  );

  useEffect(() => {
    setCurrentTimeDisplay(formatCurrentTimeInZone(timezone));
    const timer = setInterval(() => {
      setCurrentTimeDisplay(formatCurrentTimeInZone(timezone));
    }, 1000);
    return () => clearInterval(timer);
  }, [timezone]);

  const timezoneOptions = React.useMemo(() => getTimezoneOptions(), []);

  // Detect local timezone
  const handleDetectTimezone = () => {
    const detected = getLocalDetectedTimezone();
    setTimezone(detected);
  };

  const isProfileDirty =
    (user && name.trim() !== (user.name || "")) ||
    (user && timezone !== (user.timezone || "UTC"));

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSuccess(null);
    setProfileError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setProfileError("Full Name cannot be empty.");
      return;
    }

    if (trimmedName.length > 255) {
      setProfileError("Full Name must not exceed 255 characters.");
      return;
    }

    try {
      setProfileSaving(true);
      await updateProfile({
        name: trimmedName,
        timezone,
      });
      setProfileSuccess("Profile and regional preferences saved successfully.");
      setTimeout(() => setProfileSuccess(null), 4000);
    } catch (err: any) {
      setProfileError(err.message || "Failed to update profile settings.");
    } finally {
      setProfileSaving(false);
    }
  };

  // --- Appearance / Theme State ---
  const [currentTheme, setCurrentTheme] = useState<Theme>(getStoredTheme());

  const handleSelectTheme = (theme: Theme) => {
    setCurrentTheme(theme);
    applyTheme(theme);
  };

  // --- Password Rotation State ---
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Password validation rules
  const isLengthValid = newPassword.length >= 10 && newPassword.length <= 128;
  const isDifferentFromCurrent =
    newPassword.length > 0 &&
    currentPassword.length > 0 &&
    newPassword !== currentPassword;
  const doPasswordsMatch =
    newPassword.length > 0 && newPassword === confirmPassword;
  const isPasswordFormValid =
    currentPassword.length > 0 &&
    isLengthValid &&
    isDifferentFromCurrent &&
    doPasswordsMatch;

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordSuccess(null);
    setPasswordError(null);

    if (!currentPassword) {
      setPasswordError("Please enter your current password.");
      return;
    }

    if (!isLengthValid) {
      setPasswordError("New password must be between 10 and 128 characters.");
      return;
    }

    if (!isDifferentFromCurrent) {
      setPasswordError("New password must be different from your current password.");
      return;
    }

    if (!doPasswordsMatch) {
      setPasswordError("New passwords do not match.");
      return;
    }

    try {
      setPasswordSaving(true);
      await changePasswordApi({
        currentPassword,
        newPassword,
      });

      setPasswordSuccess(
        "Password changed successfully. All other active sessions have been signed out."
      );
      // Reset sensitive form fields
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setPasswordError(err.message || "Failed to change password.");
    } finally {
      setPasswordSaving(false);
    }
  };

  // Formatted join date
  const memberSinceFormatted = React.useMemo(() => {
    if (!user?.createdAt) return "Active Member";
    try {
      const date = new Date(user.createdAt);
      return `Member since ${date.toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
      })}`;
    } catch {
      return "Active Member";
    }
  }, [user?.createdAt]);

  return (
    <div className="settings-container">
      {/* Page Header */}
      <header className="settings-header">
        <div className="settings-header-badge">
          <Sparkles size={12} />
          <span>Workspace Preferences</span>
        </div>
        <h1 className="settings-title">Settings & Account</h1>
        <p className="settings-subtitle">
          Manage your account profile, regional time zone, visual theme, and security credentials.
        </p>
      </header>

      <div className="settings-panels">
        {/* PANEL 1: Profile & Regional Settings */}
        <section className="settings-panel" aria-labelledby="profile-panel-heading">
          <div className="settings-panel-header">
            <div className="settings-panel-title-wrap">
              <div className="settings-panel-icon">
                <User size={18} />
              </div>
              <div>
                <h2 id="profile-panel-heading" className="settings-panel-title">
                  Profile & Regional Identity
                </h2>
                <p className="settings-panel-desc">
                  Update your public display name and authoritative scheduling time zone.
                </p>
              </div>
            </div>
            <div className="form-label-hint">
              <Calendar size={13} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
              {memberSinceFormatted}
            </div>
          </div>

          <form onSubmit={handleProfileSubmit} className="settings-panel-body">
            {profileSuccess && (
              <div className="alert-banner alert-banner-success" role="alert">
                <CheckCircle2 size={16} />
                <span>{profileSuccess}</span>
              </div>
            )}

            {profileError && (
              <div className="alert-banner alert-banner-error" role="alert">
                <AlertCircle size={16} />
                <span>{profileError}</span>
              </div>
            )}

            <div className="form-grid">
              {/* Display Name */}
              <div className="form-group">
                <label htmlFor={nameInputId} className="form-label">
                  <span>Full Name</span>
                  <span className="form-label-hint">{name.length}/255</span>
                </label>
                <div className="form-input-wrap">
                  <input
                    id={nameInputId}
                    type="text"
                    className="form-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={255}
                    required
                    placeholder="e.g. Alex Morgan"
                    disabled={profileSaving}
                  />
                </div>
                <span className="form-help-text">
                  Your name displayed across workspace activities, tasks, and audit logs.
                </span>
              </div>

              {/* Email Address (Read-only) */}
              <div className="form-group">
                <label htmlFor={emailInputId} className="form-label">
                  <span>Email Address</span>
                  <span className="form-label-hint">Read-Only</span>
                </label>
                <div className="form-input-readonly" id={emailInputId}>
                  <span>{user?.email || "loading..."}</span>
                  <span title="Email changes are restricted in this release">
                    <Lock size={14} className="text-muted" />
                  </span>
                </div>
                <span className="form-help-text">
                  Email modification is locked for security in this release.
                </span>
              </div>
            </div>

            {/* Timezone Selector */}
            <div className="form-group">
              <label htmlFor={timezoneSelectId} className="form-label">
                <span>Scheduling Timezone</span>
                <span className="form-label-hint">Authoritative IANA Zone</span>
              </label>
              <div className="form-input-wrap">
                <select
                  id={timezoneSelectId}
                  className="form-input"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  disabled={profileSaving}
                >
                  {timezoneOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label} ({opt.group})
                    </option>
                  ))}
                </select>
              </div>

              <div className="timezone-preview-bar">
                <div className="timezone-clock">
                  <Clock size={14} />
                  <span>Current Time in {timezone}:</span>
                  <span className="timezone-clock-time">{currentTimeDisplay}</span>
                </div>
                <button
                  type="button"
                  className="btn-detect-tz"
                  onClick={handleDetectTimezone}
                  title="Detect and use browser local timezone"
                >
                  <RefreshCw size={12} />
                  <span>Use Local ({getLocalDetectedTimezone()})</span>
                </button>
              </div>
              <span className="form-help-text">
                Habits, analytics streaks, and calendar day resets are calculated strictly in this time zone.
              </span>
            </div>

            <div className="panel-actions">
              <button
                type="submit"
                className="btn-primary-settings"
                disabled={profileSaving || !isProfileDirty}
              >
                {profileSaving ? (
                  <>
                    <RefreshCw size={14} className="spinner-icon" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save Profile</span>
                )}
              </button>
            </div>
          </form>
        </section>

        {/* PANEL 2: Appearance & Theme */}
        <section className="settings-panel" aria-labelledby="appearance-panel-heading">
          <div className="settings-panel-header">
            <div className="settings-panel-title-wrap">
              <div className="settings-panel-icon">
                {currentTheme === "dark" ? <Moon size={18} /> : <Sun size={18} />}
              </div>
              <div>
                <h2 id="appearance-panel-heading" className="settings-panel-title">
                  Appearance & Theme
                </h2>
                <p className="settings-panel-desc">
                  Customize the interface theme and visual contrast to suit your environment.
                </p>
              </div>
            </div>
          </div>

          <div className="settings-panel-body">
            <div className="theme-options-grid" role="radiogroup" aria-label="Visual Theme Selection">
              {/* Dark Theme Card */}
              <div
                className={`theme-card ${currentTheme === "dark" ? "active" : ""}`}
                onClick={() => handleSelectTheme("dark")}
                role="radio"
                aria-checked={currentTheme === "dark"}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") handleSelectTheme("dark");
                }}
              >
                <div className="theme-card-header">
                  <div className="theme-card-title-wrap">
                    <Moon size={16} />
                    <span className="theme-card-title">Dark (Obsidian)</span>
                  </div>
                  {currentTheme === "dark" && (
                    <span className="theme-card-badge">Active</span>
                  )}
                </div>
                <p className="theme-card-desc">
                  Restrained obsidian & slate dark mode. Recommended for reduced eye fatigue.
                </p>
                <div className="theme-preview-box preview-dark" aria-hidden="true">
                  <div className="preview-sidebar" />
                  <div className="preview-content">
                    <div className="preview-accent" />
                    <div className="preview-line" />
                    <div className="preview-line" />
                  </div>
                </div>
              </div>

              {/* Light Theme Card */}
              <div
                className={`theme-card ${currentTheme === "light" ? "active" : ""}`}
                onClick={() => handleSelectTheme("light")}
                role="radio"
                aria-checked={currentTheme === "light"}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") handleSelectTheme("light");
                }}
              >
                <div className="theme-card-header">
                  <div className="theme-card-title-wrap">
                    <Sun size={16} />
                    <span className="theme-card-title">Light (Clean)</span>
                  </div>
                  {currentTheme === "light" && (
                    <span className="theme-card-badge">Active</span>
                  )}
                </div>
                <p className="theme-card-desc">
                  Crisp, high-contrast light palette engineered for daytime clarity and reading.
                </p>
                <div className="theme-preview-box preview-light" aria-hidden="true">
                  <div className="preview-sidebar" />
                  <div className="preview-content">
                    <div className="preview-accent" />
                    <div className="preview-line" />
                    <div className="preview-line" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* PANEL 3: Account Security */}
        <section className="settings-panel" aria-labelledby="security-panel-heading">
          <div className="settings-panel-header">
            <div className="settings-panel-title-wrap">
              <div className="settings-panel-icon">
                <ShieldCheck size={18} />
              </div>
              <div>
                <h2 id="security-panel-heading" className="settings-panel-title">
                  Account Security
                </h2>
                <p className="settings-panel-desc">
                  Rotate your account password and manage authenticated session protection.
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handlePasswordSubmit} className="settings-panel-body">
            {passwordSuccess && (
              <div className="alert-banner alert-banner-success" role="alert">
                <CheckCircle2 size={16} />
                <span>{passwordSuccess}</span>
              </div>
            )}

            {passwordError && (
              <div className="alert-banner alert-banner-error" role="alert">
                <AlertCircle size={16} />
                <span>{passwordError}</span>
              </div>
            )}

            <div className="security-notice">
              <AlertTriangle size={18} className="security-notice-icon" />
              <div>
                <strong>Remote Session Revocation Notice:</strong>
                <div>
                  Updating your password will immediately invalidate all existing sessions across other devices and browsers. Your current session will remain securely active.
                </div>
              </div>
            </div>

            <div className="form-grid">
              {/* Current Password */}
              <div className="form-group">
                <label htmlFor={currentPasswordId} className="form-label">
                  <span>Current Password</span>
                </label>
                <div className="form-input-wrap">
                  <input
                    id={currentPasswordId}
                    type={showCurrentPassword ? "text" : "password"}
                    className="form-input"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    placeholder="••••••••••••"
                    disabled={passwordSaving}
                  />
                  <button
                    type="button"
                    className="form-input-toggle-btn"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    aria-label={showCurrentPassword ? "Hide current password" : "Show current password"}
                  >
                    {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div className="form-group">
                <label htmlFor={newPasswordId} className="form-label">
                  <span>New Password</span>
                  <span className="form-label-hint">Min 10 characters</span>
                </label>
                <div className="form-input-wrap">
                  <input
                    id={newPasswordId}
                    type={showNewPassword ? "text" : "password"}
                    className="form-input"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    placeholder="••••••••••••"
                    disabled={passwordSaving}
                  />
                  <button
                    type="button"
                    className="form-input-toggle-btn"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    aria-label={showNewPassword ? "Hide new password" : "Show new password"}
                  >
                    {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Confirm New Password */}
              <div className="form-group">
                <label htmlFor={confirmPasswordId} className="form-label">
                  <span>Confirm New Password</span>
                </label>
                <div className="form-input-wrap">
                  <input
                    id={confirmPasswordId}
                    type={showConfirmPassword ? "text" : "password"}
                    className="form-input"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    placeholder="••••••••••••"
                    disabled={passwordSaving}
                  />
                  <button
                    type="button"
                    className="form-input-toggle-btn"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>

            {/* Password Validation Requirements */}
            <div className="password-policy-list">
              <div className={`policy-item ${isLengthValid ? "valid" : ""}`}>
                {isLengthValid ? (
                  <Check size={14} className="policy-icon" />
                ) : (
                  <AlertCircle size={14} className="policy-icon" />
                )}
                <span>Between 10 and 128 characters in length</span>
              </div>
              <div
                className={`policy-item ${
                  isDifferentFromCurrent ? "valid" : ""
                }`}
              >
                {isDifferentFromCurrent ? (
                  <Check size={14} className="policy-icon" />
                ) : (
                  <AlertCircle size={14} className="policy-icon" />
                )}
                <span>Different from current password</span>
              </div>
              <div className={`policy-item ${doPasswordsMatch ? "valid" : ""}`}>
                {doPasswordsMatch ? (
                  <Check size={14} className="policy-icon" />
                ) : (
                  <AlertCircle size={14} className="policy-icon" />
                )}
                <span>Passwords match</span>
              </div>
            </div>

            <div className="panel-actions">
              <button
                type="submit"
                className="btn-primary-settings"
                disabled={passwordSaving || !isPasswordFormValid}
              >
                {passwordSaving ? (
                  <>
                    <RefreshCw size={14} className="spinner-icon" />
                    <span>Updating Password...</span>
                  </>
                ) : (
                  <span>Update Password</span>
                )}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}

export default SettingsPage;
