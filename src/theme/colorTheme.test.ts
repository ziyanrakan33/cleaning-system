import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

function hexToRgb(hex: string): [number, number, number] {
  const cleanHex = hex.replace("#", "");
  const num = parseInt(cleanHex, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const sRGB = [r, g, b].map((val) => {
    const v = val / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];
}

function contrastRatio(hex1: string, hex2: string): number {
  const lum1 = relativeLuminance(hexToRgb(hex1));
  const lum2 = relativeLuminance(hexToRgb(hex2));
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("Dark Theme Tokens & Accessibility Contrast (WCAG AA)", () => {
  const colors = {
    background: "#07111F",
    surface: "#0F1B2D",
    inputBackground: "#111D30",
    popoverBackground: "#111827",
    foreground: "#F8FAFC",
    secondaryForeground: "#CBD5E1",
    mutedForeground: "#A8B4C5",
    border: "#334155",
    primary: "#3B82F6",
    primaryHover: "#2563EB",
    selected: "#1D4ED8",
    focusRing: "#60A5FA",
    danger: "#F87171",
    success: "#4ADE80",
    warning: "#FBBF24",
    white: "#FFFFFF",
  };

  it("ensures main text on background meets WCAG AA (>= 4.5:1)", () => {
    const ratio = contrastRatio(colors.foreground, colors.background);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("ensures main text on surface/panel meets WCAG AA (>= 4.5:1)", () => {
    const ratio = contrastRatio(colors.foreground, colors.surface);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("ensures text on input background meets WCAG AA (>= 4.5:1)", () => {
    const ratio = contrastRatio(colors.foreground, colors.inputBackground);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("ensures select option text on dropdown popover background meets WCAG AA (>= 4.5:1)", () => {
    const ratio = contrastRatio(colors.foreground, colors.popoverBackground);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("ensures muted text on surface meets WCAG AA (>= 4.5:1)", () => {
    const ratio = contrastRatio(colors.mutedForeground, colors.surface);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("ensures white text on selected background meets WCAG AA (>= 4.5:1)", () => {
    const ratio = contrastRatio(colors.white, colors.selected);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("ensures white text on hover background meets WCAG AA (>= 4.5:1)", () => {
    const ratio = contrastRatio(colors.white, colors.primaryHover);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("ensures focus ring on input background meets WCAG AA for UI controls (>= 3.0:1)", () => {
    const ratio = contrastRatio(colors.focusRing, colors.inputBackground);
    expect(ratio).toBeGreaterThanOrEqual(3.0);
  });

  it("verifies globals.css contains strict select and option dark background rules", () => {
    const globalsCss = fs.readFileSync(path.resolve(__dirname, "../app/globals.css"), "utf8");
    expect(globalsCss).toContain("select option");
    expect(globalsCss).toContain("background-color: #111827 !important;");
    expect(globalsCss).toContain("color: #F8FAFC !important;");
    expect(globalsCss).toContain("color-scheme: dark;");
  });
});
