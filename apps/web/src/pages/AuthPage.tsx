import { useState } from "react";
import { AlertCircle, ArrowLeft, CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";
import { registerApi } from "../api/auth";
import { BrandIcon } from "../components/BrandIcon";
import { getSafeReturnTo } from "../components/ProtectedRoute";
import { useAuth } from "../context/AuthContext";
import { Link, useRouter } from "../router/Router";
import "./AuthPage.css";

interface AuthPageProps {
  mode: "login" | "signup";
}

export function AuthPage({ mode }: AuthPageProps) {
  const { navigate } = useRouter();
  const { login } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
        await registerApi({ name: name.trim(), email: email.trim(), password });
        setSuccess("Account created successfully! Redirecting to sign in...");
        setTimeout(() => {
          navigate("/login");
        }, 1200);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Registration failed.";
        if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
          setError("We couldn't connect to TrackUp. Please check your connection and try again.");
        } else if (msg.includes("EMAIL_ALREADY_EXISTS") || msg.toLowerCase().includes("already registered")) {
          setError("This email may already be registered. Try signing in.");
        } else {
          setError(msg || "We couldn't create your account. Please try again.");
        }
      } finally {
        setLoading(false);
      }
    } else {
      // Login mode
      if (!email.trim() || !email.includes("@")) {
        setError("Please enter your email address.");
        return;
      }
      if (!password) {
        setError("Please enter your password.");
        return;
      }

      setLoading(true);
      try {
        await login({ email: email.trim(), password });
        setSuccess("Logged in successfully! Loading workspace...");
        const searchParams = new URLSearchParams(
          typeof window !== "undefined" ? window.location.search : ""
        );
        const rawReturnTo = searchParams.get("returnTo");
        const destination = getSafeReturnTo(rawReturnTo, "/dashboard");
        setTimeout(() => {
          navigate(destination);
        }, 400);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Invalid email or password.";
        if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
          setError("We couldn't connect to TrackUp. Please check your connection and try again.");
        } else {
          setError(msg || "Invalid email or password.");
        }
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-header">
          <Link to="/" className="auth-logo" aria-label="TrackUp Home">
            <BrandIcon size={28} />
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

        {error && (
          <div className="auth-message error" role="alert" aria-live="assertive">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="auth-message success" role="status" aria-live="polite">
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
                disabled={loading}
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
              disabled={loading}
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label htmlFor="auth-password" className="form-label">
              Password
            </label>
            <div className="password-input-wrapper">
              <input
                id="auth-password"
                type={showPassword ? "text" : "password"}
                className="form-input password-input"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                aria-describedby={mode === "signup" ? "password-helper-text" : undefined}
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide" : "Show"}
                tabIndex={0}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {mode === "signup" && (
              <span id="password-helper-text" className="form-helper">
                Minimum 10 characters. Full Unicode supported.
              </span>
            )}
          </div>

          <button
            type="submit"
            className="btn-auth-submit"
            disabled={loading}
          >
            {loading ? (
              <span className="btn-loading-content">
                <Loader2 size={16} className="btn-spinner" />
                <span>{mode === "signup" ? "Creating Account..." : "Signing In..."}</span>
              </span>
            ) : mode === "signup" ? (
              "Create Account"
            ) : (
              "Log In"
            )}
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
