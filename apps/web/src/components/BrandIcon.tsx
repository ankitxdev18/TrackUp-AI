import React from "react";

export interface BrandIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  className?: string;
  variant?: "default" | "monochrome";
}

/**
 * TrackUp Progress-Target Brand Mark
 *
 * Distinctive, high-contrast circular tracking symbol featuring:
 * - A crisp dark outer tracking frame with sub-pixel boundary definition
 * - A high-contrast white concentric circular progress band
 * - A precision dark focal core
 * - An integrated TrackUp lavender accent node (#7c6ff6) symbolizing upward momentum and focus
 *
 * Scalable vector geometry preserving the TrackUp visual identity across desktop, mobile web, and PWA contexts.
 */
export function BrandIcon({
  size = 24,
  className = "",
  variant = "default",
  style,
  ...props
}: BrandIconProps) {
  const accentColor = variant === "monochrome" ? "#ffffff" : "#7c6ff6";

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
      {/* Outer dark tracking ring with subtle high-contrast border definition */}
      <circle
        cx="12"
        cy="12"
        r="11"
        fill="#09080e"
        stroke="rgba(255, 255, 255, 0.2)"
        strokeWidth="0.8"
      />
      {/* White concentric progress band */}
      <circle cx="12" cy="12" r="7.2" fill="#ffffff" />
      {/* Precision dark focal core */}
      <circle cx="12" cy="12" r="3.8" fill="#09080e" />
      {/* TrackUp signature lavender momentum node */}
      <circle cx="12" cy="12" r="1.6" fill={accentColor} />
    </svg>
  );
}
