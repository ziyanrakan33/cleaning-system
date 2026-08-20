import { describe, expect, it } from "vitest";
import { normalizeStreetName } from "./importParsing";

describe("normalizeStreetName", () => {
  it("collapses repeated/extra whitespace", () => {
    expect(normalizeStreetName("רחוב   הרצל")).toBe("רחוב הרצל");
    expect(normalizeStreetName("  רחוב הרצל  ")).toBe("רחוב הרצל");
  });

  it("normalizes Hebrew final letters to their non-final form as a matching key (not a spelling correction)", () => {
    // Every final letter (ך/ם/ן/ף/ץ) becomes its regular-form counterpart —
    // this is purely a comparison key; the original spelling is still what
    // gets stored. The point is that two names differing only in whether a
    // word-final letter was typed in final form still normalize identically.
    expect(normalizeStreetName("שדרות בן גוריון")).toBe("שדרות בנ גוריונ");
    expect(normalizeStreetName("רחוב יוסף ץ")).toBe("רחוב יוספ צ");
  });

  it("makes two names that differ only in final-letter typing compare equal", () => {
    expect(normalizeStreetName("רחוב שלום")).toBe(normalizeStreetName("רחוב שלומ"));
  });

  it("treats two differently-typed but equivalent names as the same key", () => {
    const a = normalizeStreetName("רחוב  שלום  ");
    const b = normalizeStreetName("רחוב שלום");
    expect(a).toBe(b);
  });

  it("does not merge genuinely different street names", () => {
    expect(normalizeStreetName("רחוב הרצל")).not.toBe(normalizeStreetName("רחוב ויצמן"));
  });
});
