import React, { useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "../router/Router";
import "./ProtectedRoute.css";

export function isValidInternalRedirect(path: string | null | undefined): boolean {
  if (!path || typeof path !== "string") return false;
  const trimmed = path.trim();
  // Must start with exactly one leading slash
  if (!trimmed.startsWith("/")) return false;
  // Prevent protocol-relative URLs (e.g. //evil.com) and Windows-style (/\evil.com)
  if (trimmed.startsWith("//") || trimmed.startsWith("/\\")) return false;
  // Prevent scheme evasion (e.g. /http://evil.com or javascript:)
  if (/^[/][^/]*:[^/]*[/]/.test(trimmed)) return false;
  // Prevent redirect loops back to auth pages
  const pathname = trimmed.split("?")[0].toLowerCase();
  if (pathname === "/login" || pathname === "/signup") return false;
  return true;
}

export function getSafeReturnTo(target: string | null | undefined, fallback: string = "/dashboard"): string {
  if (isValidInternalRedirect(target)) {
    return target!.trim();
  }
  return fallback;
}

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const { path, navigate } = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      const currentTarget =
        typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search}`
          : path;
      const safeReturnTo = isValidInternalRedirect(currentTarget)
        ? currentTarget
        : isValidInternalRedirect(path)
        ? path
        : "/dashboard";
      navigate(`/login?returnTo=${encodeURIComponent(safeReturnTo)}`);
    }
  }, [loading, user, path, navigate]);

  if (loading) {
    return (
      <div className="auth-loading-screen" role="status" aria-label="Loading workspace">
        <div className="auth-loading-spinner" />
        <p>Loading workspace...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}
