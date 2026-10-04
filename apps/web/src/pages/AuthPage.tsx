import { useState } from "react";
import { AlertCircle, ArrowLeft, CheckCircle2 } from "lucide-react";
import { Link, useRouter } from "../router/Router";
import "./AuthPage.css";

interface AuthPageProps {
  mode: "login" | "signup";
}

export function AuthPage({ mode }: AuthPageProps) {
  const { navigate } = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (mode === "signup") {
      if (!name.trim()) {
        setError("Please enter your name.");
        return;
      }
      if (!email.trim() || !email.includes("@")) {
        setError("Please enter a valid email address.");
        return;
      }
      if (password.length < 10) {
        setError("Password must be at least 10 characters in length.");
        return;
      }

      setLoading(true);
      try {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password }),
        });

        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Registration failed.");
        } else {
          setSuccess("Account created successfully! Redirecting to workspace...");
          setTimeout(() => {
            navigate("/dashboard");
          }, 1200);
        }
      } catch {
        setError("Unable to connect to the server. Please check your backend.");
      } finally {
        setLoading(false);
      }
    } else {
      // Login mode informational handling (scheduled for next auth milestone)
      setError("Login sessions are scheduled for the next authentication milestone. You can explore the workspace shell via the Dashboard Preview.");
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-header">
          <Link to="/" className="auth-logo" aria-label="TrackUp Home">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </Link>
          <h1 className="auth-title">
            {mode === "signup" ? "Create your account" : "Welcome back"}
          </h1>
          <p className="auth-subtitle">
            {mode === "signup"
              ? "Start your journey with TrackUp Life OS."
              : "Good to see you again. Enter your credentials."}
          </p>
        </div>

        {mode === "login" && (
          <div className="auth-info-note">
            <strong>Architecture Notice:</strong> The backend registration API is active. Full cookie session persistence and login authentication will be integrated in the upcoming milestone.
          </div>
        )}

        {error && (
          <div className="auth-message error" role="alert">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="auth-message success" role="status">
            <CheckCircle2 size={16} />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          {mode === "signup" && (
            <div className="form-group">
              <label htmlFor="reg-name" className="form-label">
                Full Name
              </label>
              <input
                id="reg-name"
                type="text"
                className="form-input"
                placeholder="Alex Mercer"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="auth-email" className="form-label">
              Email Address
            </label>
            <input
              id="auth-email"
              type="email"
              className="form-input"
              placeholder="alex@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label htmlFor="auth-password" className="form-label">
              Password
            </label>
            <input
              id="auth-password"
              type="password"
              className="form-input"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
            {mode === "signup" && (
              <span className="form-helper">
                Minimum 10 characters. Full Unicode supported.
              </span>
            )}
          </div>

          <button
            type="submit"
            className="btn-auth-submit"
            disabled={loading}
          >
            {loading
              ? "Creating Account..."
              : mode === "signup"
              ? "Create Account"
              : "Log In"}
          </button>
        </form>

        <div className="auth-footer">
          {mode === "signup" ? (
            <span>
              Already have an account?
              <Link to="/login" className="auth-link">
                Sign In
              </Link>
            </span>
          ) : (
            <span>
              Don't have an account?
              <Link to="/signup" className="auth-link">
                Sign Up
              </Link>
            </span>
          )}
        </div>

        <div style={{ textAlign: "center" }}>
          <Link
            to="/dashboard"
            style={{
              fontSize: "0.8125rem",
              color: "var(--text-muted)",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <ArrowLeft size={14} />
            <span>Explore Dashboard Preview</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
