import { BrandIcon, type BrandIconProps } from "./BrandIcon";
import { Link } from "../router/Router";

export interface BrandLogoProps {
  size?: number;
  to?: string;
  className?: string;
  showSubtitle?: boolean;
  variant?: BrandIconProps["variant"];
  onClick?: () => void;
}

/**
 * TrackUp Brand Logo with Wordmark
 *
 * Authoritative combination of the TrackUp progress-target symbol and typographic lockup.
 */
export function BrandLogo({
  size = 20,
  to = "/",
  className = "",
  showSubtitle = true,
  variant = "standalone",
  onClick,
}: BrandLogoProps) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`brand-lockup ${className}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.5rem",
        textDecoration: "none",
        color: "inherit",
      }}
      aria-label="TrackUp Home"
    >
      <BrandIcon size={size} variant={variant} />
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.375rem" }}>
        <span
          style={{
            fontWeight: 700,
            fontSize: "1.0625rem",
            letterSpacing: "-0.02em",
            color: "var(--text-primary)",
          }}
        >
          TrackUp
        </span>
        {showSubtitle && (
          <span
            style={{
              fontSize: "0.6875rem",
              fontWeight: 600,
              color: "var(--primary)",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            Life OS
          </span>
        )}
      </div>
    </Link>
  );
}
