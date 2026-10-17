import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { BrandIcon } from "../components/BrandIcon";

describe("TrackUp Brand Identity & BrandIcon Component", () => {
  it("renders the scalable vector mark with default 24px dimensions", () => {
    const { container } = render(<BrandIcon />);
    const svg = container.querySelector("svg");

    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("width", "24");
    expect(svg).toHaveAttribute("height", "24");
    expect(svg).toHaveAttribute("viewBox", "0 0 24 24");
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("renders custom size when specified", () => {
    const { container } = render(<BrandIcon size={36} />);
    const svg = container.querySelector("svg");

    expect(svg).toHaveAttribute("width", "36");
    expect(svg).toHaveAttribute("height", "36");
  });

  it("contains all 4 concentric target/tracker elements: outer tracking circle, white progress band, dark core, and lavender momentum node", () => {
    const { container } = render(<BrandIcon />);
    const circles = container.querySelectorAll("circle");

    // Must have 4 concentric circles
    expect(circles.length).toBe(4);

    // 1. Outer dark tracking ring
    expect(circles[0]).toHaveAttribute("r", "11");
    expect(circles[0]).toHaveAttribute("fill", "#09080e");

    // 2. White concentric progress band
    expect(circles[1]).toHaveAttribute("r", "7.2");
    expect(circles[1]).toHaveAttribute("fill", "#ffffff");

    // 3. Precision dark focal core
    expect(circles[2]).toHaveAttribute("r", "3.8");
    expect(circles[2]).toHaveAttribute("fill", "#09080e");

    // 4. TrackUp signature lavender node
    expect(circles[3]).toHaveAttribute("r", "1.6");
    expect(circles[3]).toHaveAttribute("fill", "#7c6ff6");
  });

  it("renders monochrome variant with white focal node", () => {
    const { container } = render(<BrandIcon variant="monochrome" />);
    const circles = container.querySelectorAll("circle");

    expect(circles[3]).toHaveAttribute("fill", "#ffffff");
  });
});
