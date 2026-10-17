import React from "react";

export interface BrandIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  className?: string;
}

/**
 * TrackUp Brand Mark Component
 *
 * Minimal, high-contrast circular target icon featuring:
 * - A dark outer circle with subtle crisp border for dark/light contrast
 * - A white concentric circular ring
 * - A dark center bullseye
 *
 * Scalable vector geometry strictly preserving the TrackUp brand reference.
 */
export function BrandIcon({
  size = 24,
  className = "",
  style,
  ...props
}: BrandIconProps) {
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
      {/* Outer dark circle with subtle high-contrast border definition */}
      <circle
        cx="12"
        cy="12"
        r="11"
        fill="#09080e"
        stroke="rgba(255, 255, 255, 0.2)"
        strokeWidth="0.8"
      />
      {/* White concentric circular area */}
      <circle cx="12" cy="12" r="7.2" fill="#ffffff" />
      {/* Dark center bullseye */}
      <circle cx="12" cy="12" r="3.6" fill="#09080e" />
    </svg>
  );
}
