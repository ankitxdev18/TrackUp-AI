import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { BrandIcon } from "../components/BrandIcon";
import { BrandLogo } from "../components/BrandLogo";

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

  it("renders standalone variant with circular tracking ring and upward lavender progress chevron", () => {
    const { container } = render(<BrandIcon variant="standalone" />);
    const paths = container.querySelectorAll("path");

    // Standalone mark contains 2 path elements: tracking ring and progress chevron
    expect(paths.length).toBe(2);

    // 1. Circular tracking progress ring
    expect(paths[0]).toHaveAttribute("stroke", "currentColor");
    expect(paths[0]).toHaveAttribute("stroke-linecap", "round");

    // 2. Upward lavender progress chevron
    expect(paths[1]).toHaveAttribute("stroke", "#7c6ff6");
    expect(paths[1]).toHaveAttribute("stroke-linecap", "round");
    expect(paths[1]).toHaveAttribute("stroke-linejoin", "round");
  });

  it("renders squircle badge variant with rounded tile and scaled tracking geometry", () => {
    const { container } = render(<BrandIcon variant="badge" size={48} />);
    const svg = container.querySelector("svg");
    const rect = container.querySelector("rect");
    const paths = container.querySelectorAll("path");

    expect(svg).toHaveAttribute("width", "48");
    expect(rect).toBeInTheDocument();
    expect(rect).toHaveAttribute("rx", "6");
    expect(rect).toHaveAttribute("fill", "url(#trackup-lavender-tile)");
    expect(paths.length).toBe(2);
    expect(paths[0]).toHaveAttribute("stroke", "#ffffff");
    expect(paths[1]).toHaveAttribute("stroke", "#ffffff");
    expect(paths[1]).toHaveAttribute("stroke-linejoin", "round");
  });

  it("renders monochrome variant with currentColor chevron", () => {
    const { container } = render(<BrandIcon variant="monochrome" />);
    const paths = container.querySelectorAll("path");

    expect(paths[1]).toHaveAttribute("stroke", "currentColor");
  });

  it("supports custom accent color override", () => {
    const { container } = render(<BrandIcon accentColor="#a78bfa" />);
    const paths = container.querySelectorAll("path");

    expect(paths[1]).toHaveAttribute("stroke", "#a78bfa");
  });

  it("renders BrandLogo with wordmark and Life OS badge", () => {
    const { container, getByText } = render(<BrandLogo />);
    const link = container.querySelector("a");

    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/");
    expect(getByText("TrackUp")).toBeInTheDocument();
    expect(getByText("Life OS")).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
