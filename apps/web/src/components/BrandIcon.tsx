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
 * 2. An upward power/progress stem representing personal activation, momentum, and the "Up" in TrackUp.
 * 3. TrackUp signature lavender accent (#7c6ff6) on the momentum stem.
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
        {/* Sleek rounded-square squircle tile */}
        <rect
          width="24"
          height="24"
          rx="5.5"
          fill="#0e1015"
          stroke="rgba(255, 255, 255, 0.12)"
          strokeWidth="0.8"
        />
        {/* Circular tracking ring */}
        <path
          d="M9.3 7.2A5.8 5.8 0 1 0 14.7 7.2"
          stroke="#f4f4f5"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        {/* Vertical upward power/momentum stem */}
        <path
          d="M12 5.2V11.2"
          stroke={stemColor}
          strokeWidth="1.8"
          strokeLinecap="round"
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
        d="M8.2 5.2A8 8 0 1 0 15.8 5.2"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* TrackUp upward power/momentum stem */}
      <path
        d="M12 2.5V11"
        stroke={stemColor}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
