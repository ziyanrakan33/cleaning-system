/**
 * §2 — DirtPriorityScore, 0–100.
 *
 * Deliberately a transparent weighted sum, not a model. There is no training
 * data on day one, and a score nobody can explain is worse than a crude score
 * everyone can argue with. Every component reports the raw value it saw, the
 * weight it carried and the points it contributed, and that record is what the
 * UI renders — the explanation is never re-derived at display time from
 * numbers that may since have changed.
 *
 * The one rule that matters most here: **a component with no data at all is
 * dropped and its weight redistributed over the components that do have data.**
 * Feeding a missing value in as zero would say "this street is spotless", when
 * what is actually true is "nobody has told us". The dropped components are
 * returned so the screen can say which ones they were.
 */
import type { ConfidenceLevel, ProfileDataMode } from "@/generated/prisma/enums";
import type { DirtScoreThresholds, DirtScoreWeights } from "@/server/settings/service";

/**
 * Bump this whenever computeDirtScore's logic or component set changes — not
 * when only the *weights* change (that's tracked separately via SystemSetting
 * history). Lets a manager comparing an old score to a new one tell "the
 * street changed" apart from "the formula changed", per §2's transparency
 * requirement. Stored alongside every computed score (dirtScoreFactors.formulaVersion).
 */
export const DIRT_SCORE_FORMULA_VERSION = 1;

export type DirtScoreComponentKey = keyof DirtScoreWeights;

export const COMPONENT_LABELS: Record<DirtScoreComponentKey, string> = {
  historicalDirt: "רמת לכלוך היסטורית",
  timeSinceLastClean: "זמן מאז הניקיון האחרון",
  openComplaints: "פניות תושבים פתוחות",
  pedestrianTraffic: "תנועת הולכי רגל",
  proximity: "קרבה למסחר, בתי ספר ותחנות",
  seasonalAndEvents: "אירועים ועונתיות",
  supervisorEstimate: "הערכת מנהל העבודה",
};

export type DirtScoreFactor = {
  key: DirtScoreComponentKey;
  label: string;
  /** What the raw input was, in its own units, for display. */
  rawValue: string;
  /** 0–1 after normalisation. */
  normalized: number;
  /** The weight actually applied, after redistribution. */
  effectiveWeight: number;
  /** Points this component contributed to the final 0–100 score. */
  contribution: number;
};

export type DirtScoreInput = {
  dirtBaseLevel: number | null;
  dirtDynamicLevel: number | null;
  /** Days since the street was last cleaned; null when it never has been. */
  daysSinceLastClean: number | null;
  /** How often the street is meant to be cleaned, in days. */
  recommendedIntervalDays: number | null;
  openComplaints: number;
  pedestrianTraffic: number | null;
  nearSchool: boolean | null;
  nearCommerce: boolean | null;
  nearBusStop: boolean | null;
  leafFallLevel: number | null;
  /** { "9": 4, "10": 5 } — month number (1–12) → 1–5. */
  seasonalSensitivity: Record<string, number> | null;
  hasSpecialEvent: boolean;
  /** Completed field reports backing the measured figures. */
  sampleCount: number;
  /** When the profile's measured figures were last touched. */
  lastUpdatedAt: Date | null;
  /** True when a survey has been filled in at all. */
  hasSurvey: boolean;
  /** True when the profile carries enough fields to be scored by rule. */
  profileComplete: boolean;
  month: number; // 1–12
};

export type DirtScoreResult = {
  /** null when not a single component had data — never 0, which means "clean". */
  score: number | null;
  factors: DirtScoreFactor[];
  /** Components dropped for lack of data, with their labels, for the UI. */
  missingComponents: { key: DirtScoreComponentKey; label: string }[];
  dataMode: ProfileDataMode;
  confidence: ConfidenceLevel;
  sampleCount: number;
  computedAt: Date;
  formulaVersion: number;
};

/** Maps a 1–5 field rating onto 0–1. */
function fromRating(value: number): number {
  return clamp01((value - 1) / 4);
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

type RawComponent = {
  normalized: number;
  rawValue: string;
};

export function computeDirtScore(
  input: DirtScoreInput,
  weights: DirtScoreWeights,
  thresholds: DirtScoreThresholds
): DirtScoreResult {
  const components = new Map<DirtScoreComponentKey, RawComponent>();

  // -- historical dirt: measured level if crews have reported one, else the survey's --
  const observedDirt = input.dirtDynamicLevel ?? input.dirtBaseLevel;
  if (observedDirt !== null) {
    components.set("historicalDirt", {
      normalized: fromRating(observedDirt),
      rawValue: `${observedDirt.toFixed(1)} מתוך 5`,
    });
  }

  // -- time since last clean, relative to how often it is *supposed* to happen --
  // A street cleaned daily and missed for three days is more overdue than a
  // weekly street missed for three days, so the ratio is what counts, not the
  // raw number of days.
  if (input.daysSinceLastClean !== null && input.recommendedIntervalDays) {
    const ratio = input.daysSinceLastClean / input.recommendedIntervalDays;
    components.set("timeSinceLastClean", {
      normalized: clamp01(ratio),
      rawValue: `${input.daysSinceLastClean} ימים, מול תדירות של ${input.recommendedIntervalDays} ימים`,
    });
  } else if (input.daysSinceLastClean === null && input.recommendedIntervalDays) {
    // Never recorded as cleaned: maximally overdue, and that is a real signal,
    // not a missing one.
    components.set("timeSinceLastClean", {
      normalized: 1,
      rawValue: "לא תועד ניקיון מעולם",
    });
  }

  // -- open complaints --
  // Always present: zero complaints is a genuine observation, not missing data.
  components.set("openComplaints", {
    normalized: clamp01(input.openComplaints / Math.max(1, thresholds.complaintSaturation)),
    rawValue: `${input.openComplaints} פניות פתוחות`,
  });

  // -- pedestrian traffic --
  if (input.pedestrianTraffic !== null) {
    components.set("pedestrianTraffic", {
      normalized: fromRating(input.pedestrianTraffic),
      rawValue: `${input.pedestrianTraffic} מתוך 5`,
    });
  }

  // -- proximity to school / commerce / bus stop --
  const proximityFlags = [input.nearSchool, input.nearCommerce, input.nearBusStop];
  const knownFlags = proximityFlags.filter((f): f is boolean => f !== null);
  if (knownFlags.length > 0) {
    const hits = knownFlags.filter(Boolean).length;
    const names = [
      input.nearSchool ? "בית ספר" : null,
      input.nearCommerce ? "מסחר" : null,
      input.nearBusStop ? "תחנת אוטובוס" : null,
    ].filter(Boolean);
    components.set("proximity", {
      normalized: hits / knownFlags.length,
      rawValue: names.length > 0 ? names.join(", ") : "אין קרבה מיוחדת",
    });
  }

  // -- season and events --
  const monthSensitivity = input.seasonalSensitivity?.[String(input.month)] ?? null;
  const leaf = input.leafFallLevel;
  if (monthSensitivity !== null || leaf !== null || input.hasSpecialEvent) {
    const parts: number[] = [];
    const described: string[] = [];
    if (monthSensitivity !== null) {
      parts.push(fromRating(monthSensitivity));
      described.push(`רגישות עונתית ${monthSensitivity}/5 לחודש ${input.month}`);
    }
    if (leaf !== null) {
      parts.push(fromRating(leaf));
      described.push(`נשירת עלים ${leaf}/5`);
    }
    if (input.hasSpecialEvent) {
      parts.push(1);
      described.push("אירוע מיוחד");
    }
    components.set("seasonalAndEvents", {
      normalized: parts.reduce((a, b) => a + b, 0) / parts.length,
      rawValue: described.join(" · "),
    });
  }

  // -- the supervisor's own baseline judgement, kept separate from the
  //    measured level above so his input still carries weight after the
  //    system starts learning --
  if (input.dirtBaseLevel !== null) {
    components.set("supervisorEstimate", {
      normalized: fromRating(input.dirtBaseLevel),
      rawValue: `${input.dirtBaseLevel} מתוך 5`,
    });
  }

  const presentKeys = [...components.keys()];
  const missingComponents = (Object.keys(weights) as DirtScoreComponentKey[])
    .filter((k) => !components.has(k))
    .map((key) => ({ key, label: COMPONENT_LABELS[key] }));

  const computedAt = new Date();

  if (presentKeys.length === 0) {
    return {
      score: null,
      factors: [],
      missingComponents,
      dataMode: "REQUIRES_REVIEW",
      confidence: "LOW",
      sampleCount: input.sampleCount,
      computedAt,
      formulaVersion: DIRT_SCORE_FORMULA_VERSION,
    };
  }

  // Redistribute: the present components' weights are rescaled to sum to 100,
  // so dropping a component shifts its influence onto the rest rather than
  // silently deflating the whole score.
  const presentWeightSum = presentKeys.reduce((sum, k) => sum + Math.max(0, weights[k]), 0);

  const factors: DirtScoreFactor[] = presentKeys.map((key) => {
    const c = components.get(key)!;
    const effectiveWeight =
      presentWeightSum > 0 ? (Math.max(0, weights[key]) / presentWeightSum) * 100 : 100 / presentKeys.length;
    return {
      key,
      label: COMPONENT_LABELS[key],
      rawValue: c.rawValue,
      normalized: c.normalized,
      effectiveWeight: Math.round(effectiveWeight * 10) / 10,
      contribution: Math.round(effectiveWeight * c.normalized * 10) / 10,
    };
  });

  const score = Math.round(factors.reduce((sum, f) => sum + f.contribution, 0) * 10) / 10;

  return {
    score: Math.max(0, Math.min(100, score)),
    factors,
    missingComponents,
    dataMode: resolveDataMode(input, thresholds),
    confidence: resolveConfidence(input, presentKeys.length, missingComponents.length, thresholds),
    sampleCount: input.sampleCount,
    computedAt,
    formulaVersion: DIRT_SCORE_FORMULA_VERSION,
  };
}

/**
 * The ladder from §2. It only ever climbs on evidence: a profile reaches
 * DATA_INFORMED because enough crews reported on it, never because someone
 * filled the form in thoroughly.
 */
export function resolveDataMode(
  input: Pick<DirtScoreInput, "hasSurvey" | "profileComplete" | "sampleCount">,
  thresholds: DirtScoreThresholds
): ProfileDataMode {
  if (input.sampleCount >= thresholds.dataInformedMinSamples) return "DATA_INFORMED";
  if (!input.hasSurvey) return "REQUIRES_REVIEW";
  if (input.profileComplete) return "RULE_BASED";
  return "MANUAL_BASELINE";
}

function resolveConfidence(
  input: DirtScoreInput,
  presentCount: number,
  missingCount: number,
  thresholds: DirtScoreThresholds
): ConfidenceLevel {
  const total = presentCount + missingCount;
  const coverage = total > 0 ? presentCount / total : 0;

  const ageDays = input.lastUpdatedAt
    ? Math.floor((Date.now() - input.lastUpdatedAt.getTime()) / 86_400_000)
    : Infinity;
  const stale = ageDays > thresholds.staleAfterDays;

  if (input.sampleCount >= thresholds.dataInformedMinSamples && coverage >= 0.8 && !stale) return "HIGH";
  if (input.sampleCount >= Math.ceil(thresholds.dataInformedMinSamples / 2) && coverage >= 0.6 && !stale) {
    return "MEDIUM";
  }
  return "LOW";
}

/** Converts a `cleaningFrequency` JSON value into an interval in days. */
export function frequencyToIntervalDays(freq: unknown): number | null {
  const f = freq as { type?: string; timesPerWeek?: number; days?: string[] } | null;
  switch (f?.type) {
    case "DAILY":
      return 1;
    case "WEEKLY":
      return 7;
    case "TIMES_PER_WEEK":
      return Math.max(1, Math.round(7 / Math.max(1, f.timesPerWeek ?? 1)));
    case "SPECIFIC_DAYS":
      return Math.max(1, Math.round(7 / Math.max(1, (f.days ?? []).length)));
    case "AS_NEEDED":
    default:
      // Not on a schedule, so "overdue" has no meaning — the component is
      // dropped rather than guessed at.
      return null;
  }
}
