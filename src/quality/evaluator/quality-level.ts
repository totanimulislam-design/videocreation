import type { QualityLevel } from "../types.ts";

/** Classification bands from DESIGN_QUALITY_METRICS.md §2. */
const LEVELS: Array<{ min: number; level: QualityLevel }> = [
  { min: 95, level: "Exceptional" },
  { min: 90, level: "Excellent" },
  { min: 85, level: "Professional" },
  { min: 80, level: "Good" },
  { min: 70, level: "Acceptable" },
  { min: 60, level: "Weak" },
  { min: 40, level: "Poor" },
  { min: 0, level: "Failed" },
];

export function qualityLevelFor(score: number): QualityLevel {
  const clamped = Math.max(0, Math.min(100, score));
  return LEVELS.find((entry) => clamped >= entry.min)?.level ?? "Failed";
}

export const QUALITY_LEVEL_BANDS = LEVELS;
