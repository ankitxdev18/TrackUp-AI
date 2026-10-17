import type { SVGProps } from "react";

export interface BrandIconProps extends SVGProps<SVGSVGElement> {
  size?: number | string;
  className?: string;
  variant?: "standalone" | "badge" | "monochrome";
  accentColor?: string;
}

/**
 * TrackUp Progress-Target Brand Mark
 *
 * Distinctive, modern Life OS symbol combining:
 * 1. A circular tracking ring representing daily execution, habit cycles, and consistency.
 * 2. An upward progress chevron representing personal elevation, forward momentum, and the "Up" in TrackUp.
 * 3. TrackUp signature lavender accent (#7c6ff6) on the momentum chevron.
 * 4. An optional rounded-square squircle tile for app icons, favicons, and splash screens.
 *
 * Scalable vector geometry preserving the TrackUp visual identity across desktop, mobile web, and PWA contexts.
 */
export function BrandIcon({
  size = 24,
  className = "",
  variant = "standalone",
  accentColor,
  style,
  ...props
}: BrandIconProps) {
  const isMonochrome = variant === "monochrome";
  const stemColor = accentColor || (isMonochrome ? "currentColor" : "#7c6ff6");
  const isBadge = variant === "badge";

  if (isBadge) {
    const tileStroke = isMonochrome ? "currentColor" : "#ffffff";
    const chevronStroke = accentColor || (isMonochrome ? "currentColor" : "#ffffff");
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0, ...style }}
        aria-hidden="true"
        {...props}
      >
        <defs>
          <linearGradient id="trackup-lavender-tile" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#7c6ff6" />
            <stop offset="100%" stopColor="#5947df" />
          </linearGradient>
        </defs>
        {/* Rounded lavender squircle tile */}
        <rect
          width="24"
          height="24"
          rx="6"
          fill={isMonochrome ? "#0e1015" : "url(#trackup-lavender-tile)"}
        />
        {/* Circular tracking progress ring */}
        <path
          d="M8.2 8.8A5.5 5.5 0 1 0 15.8 8.8"
          stroke={tileStroke}
          strokeWidth="1.85"
          strokeLinecap="round"
        />
        {/* Upward progress chevron */}
        <path
          d="M8.5 12L12 7.2L15.5 12"
          stroke={chevronStroke}
          strokeWidth="2.05"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0, ...style }}
      aria-hidden="true"
      {...props}
    >
      {/* Circular tracking progress ring */}
      <path
        d="M6.8 7.8A7.2 7.2 0 1 0 17.2 7.8"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      {/* Upward progress chevron */}
      <path
        d="M7.2 11.8L12 5.8L16.8 11.8"
        stroke={stemColor}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

