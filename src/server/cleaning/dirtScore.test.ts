import { describe, expect, it } from "vitest";
import { computeDirtScore, resolveDataMode, type DirtScoreInput } from "./dirtScore";
import { DEFAULT_DIRT_SCORE_THRESHOLDS, DEFAULT_DIRT_SCORE_WEIGHTS } from "@/server/settings/service";

const EMPTY_INPUT: DirtScoreInput = {
  dirtBaseLevel: null,
  dirtDynamicLevel: null,
  daysSinceLastClean: null,
  recommendedIntervalDays: null,
  openComplaints: 0,
  pedestrianTraffic: null,
  nearSchool: null,
  nearCommerce: null,
  nearBusStop: null,
  leafFallLevel: null,
  seasonalSensitivity: null,
  hasSpecialEvent: false,
  sampleCount: 0,
  lastUpdatedAt: null,
  hasSurvey: false,
  profileComplete: false,
  month: 6,
};

describe("computeDirtScore", () => {
  it("never fabricates a score for a component that has no data — 0 complaints is the only always-present component", () => {
    const result = computeDirtScore(EMPTY_INPUT, DEFAULT_DIRT_SCORE_WEIGHTS, DEFAULT_DIRT_SCORE_THRESHOLDS);
    // openComplaints is always present (0 is a real observation), so score is
    // a real number here, not null — but every other component is missing.
    expect(result.score).not.toBeNull();
    expect(result.missingComponents.map((c) => c.key).sort()).toEqual(
      ["historicalDirt", "pedestrianTraffic", "proximity", "seasonalAndEvents", "supervisorEstimate", "timeSinceLastClean"].sort()
    );
  });

  it("redistributes a missing component's weight over the present ones instead of zeroing the score", () => {
    // Only historicalDirt (weight 25) and openComplaints (weight 15, always present) are present.
    const input: DirtScoreInput = { ...EMPTY_INPUT, dirtBaseLevel: 5 };
    const result = computeDirtScore(input, DEFAULT_DIRT_SCORE_WEIGHTS, DEFAULT_DIRT_SCORE_THRESHOLDS);
    expect(result.score).not.toBeNull();
    const presentWeightSum = result.factors.reduce((sum, f) => sum + f.effectiveWeight, 0);
    // Redistributed weights across present components must still sum to ~100.
    expect(presentWeightSum).toBeGreaterThan(99);
    expect(presentWeightSum).toBeLessThan(101);
  });

  it("a maximally dirty, fully-observed street scores at the top of the range", () => {
    const input: DirtScoreInput = {
      ...EMPTY_INPUT,
      dirtBaseLevel: 5,
      dirtDynamicLevel: 5,
      daysSinceLastClean: 30,
      recommendedIntervalDays: 7,
      openComplaints: 100,
      pedestrianTraffic: 5,
      nearSchool: true,
      nearCommerce: true,
      nearBusStop: true,
      leafFallLevel: 5,
      hasSpecialEvent: true,
    };
    const result = computeDirtScore(input, DEFAULT_DIRT_SCORE_WEIGHTS, DEFAULT_DIRT_SCORE_THRESHOLDS);
    expect(result.score).toBeGreaterThan(95);
  });

  it("stamps every result with the current formula version for later comparability", () => {
    const result = computeDirtScore(EMPTY_INPUT, DEFAULT_DIRT_SCORE_WEIGHTS, DEFAULT_DIRT_SCORE_THRESHOLDS);
    expect(result.formulaVersion).toBeGreaterThanOrEqual(1);
  });
});

describe("resolveDataMode", () => {
  const thresholds = DEFAULT_DIRT_SCORE_THRESHOLDS;

  it("starts at REQUIRES_REVIEW with no survey at all", () => {
    expect(resolveDataMode({ hasSurvey: false, profileComplete: false, sampleCount: 0 }, thresholds)).toBe("REQUIRES_REVIEW");
  });

  it("moves to MANUAL_BASELINE once surveyed but incomplete", () => {
    expect(resolveDataMode({ hasSurvey: true, profileComplete: false, sampleCount: 0 }, thresholds)).toBe("MANUAL_BASELINE");
  });

  it("moves to RULE_BASED once the profile is complete", () => {
    expect(resolveDataMode({ hasSurvey: true, profileComplete: true, sampleCount: 0 }, thresholds)).toBe("RULE_BASED");
  });

  it("only reaches DATA_INFORMED on enough real completed samples, never on form-filling alone", () => {
    expect(
      resolveDataMode({ hasSurvey: true, profileComplete: true, sampleCount: thresholds.dataInformedMinSamples - 1 }, thresholds)
    ).toBe("RULE_BASED");
    expect(
      resolveDataMode({ hasSurvey: true, profileComplete: true, sampleCount: thresholds.dataInformedMinSamples }, thresholds)
    ).toBe("DATA_INFORMED");
  });

  it("reaches DATA_INFORMED purely on sample count, even without a completed profile", () => {
    expect(
      resolveDataMode({ hasSurvey: false, profileComplete: false, sampleCount: thresholds.dataInformedMinSamples }, thresholds)
    ).toBe("DATA_INFORMED");
  });
});
