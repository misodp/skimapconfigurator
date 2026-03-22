/**
 * Visitor experience: lift wait, slope crowds, slope quality as drifting 0–100 scores.
 * Each metric drifts toward a raw daily value; satisfaction is derived from the three scores.
 */

import type { ExperienceChange } from './types';
import { state, getSlopeType } from './state';
import { fromNormalized, getSlopePathLengthM } from './geometry.js';

export type { ExperienceChange };

/**
 * Total lift capacity (sum of each placed lift's type capacity).
 */
export function getTotalLiftCapacity(): number {
  let total = 0;
  for (const lift of state.lifts) {
    const type = state.liftTypes.find((t) => t.id === lift.type);
    if (!type || type.capacity == null) continue;
    total += Number(type.capacity) || 0;
  }
  return total;
}

/**
 * Total slope capacity (sum of each slope's capacity; computed from length × capacity_per_meter if missing).
 */
export function getTotalSlopeCapacity(): number {
  let total = 0;
  for (const s of state.slopes) {
    if (typeof s.capacity === 'number') {
      total += s.capacity;
      continue;
    }
    const st = getSlopeType(s);
    if (!st || st.capacity_per_meter == null || !s.points || s.points.length < 2) continue;
    const imagePoints = s.points.map((p) => fromNormalized(p.x, p.y));
    const lengthM = getSlopePathLengthM(imagePoints);
    total += Math.round(lengthM * Number(st.capacity_per_meter));
  }
  return total;
}

/** Utilization 0 → 100, 1 → 50, 2+ → 0. Low utilization = good (high score). */
function utilizationToScore(utilization: number): number {
  if (utilization <= 0) return 100;
  if (utilization >= 2) return 0;
  return Math.round(Math.max(0, Math.min(100, 100 - 50 * utilization)));
}

/**
 * Raw lift wait score 0–100 from visitors vs lift capacity.
 */
export function getLiftWaitRawScore(visitors: number, liftCapacity: number): number {
  if (liftCapacity <= 0) return visitors > 0 ? 0 : 100;
  return utilizationToScore(visitors / liftCapacity);
}

/**
 * Raw slope crowd score 0–100 from visitors vs slope capacity.
 */
export function getSlopeCrowdRawScore(visitors: number, slopeCapacity: number): number {
  if (slopeCapacity <= 0) return visitors > 0 ? 0 : 100;
  return utilizationToScore(visitors / slopeCapacity);
}

/** 1 grooming_capacity point = 200 m of slope with grooming_load 1. */
const GROOMING_UNITS_PER_100M_LOAD_1 = 0.5;

/** Bad weather increases grooming demand (snow, ice, wind). */
const WEATHER_GROOMING_DEMAND_FACTOR: Record<string, number> = {
  sunny: 0.9,
  cloudy: 1.0,
  snowy: 1.35,
  blizzard: 1.7,
  icy: 1.25,
};

/**
 * Total grooming demand in capacity units.
 */
export function getTotalGroomingDemand(): number {
  let total = 0;
  for (const s of state.slopes) {
    const st = getSlopeType(s);
    if (!st || st.grooming_load == null || !s.points || s.points.length < 2) continue;
    const imagePoints = s.points.map((p) => fromNormalized(p.x, p.y));
    const lengthM = getSlopePathLengthM(imagePoints);
    const load = Number(st.grooming_load) || 0;
    total += (lengthM / 100) * load * GROOMING_UNITS_PER_100M_LOAD_1;
  }
  const weatherFactor = WEATHER_GROOMING_DEMAND_FACTOR[state.currentWeather] ?? 1.0;
  return total * weatherFactor;
}

/**
 * Total grooming capacity: sum of each placed groomer's type grooming_capacity.
 */
export function getTotalGroomingCapacity(): number {
  let total = 0;
  for (const g of state.groomers) {
    const type = state.groomerTypes.find((t) => t.id === g.groomerTypeId);
    if (!type || type.grooming_capacity == null) continue;
    total += Number(type.grooming_capacity) || 0;
  }
  return total;
}

/** Snow depth: < 50 cm hurts quality, 50–150 cm no change, > 150 cm boosts quality. */
function getSnowQualityFactor(snowDepthCm: number): number {
  const depth = Math.max(0, Math.min(450, snowDepthCm));
  if (depth < 20) return 0;
  if (depth < 50) return 0.6;
  if (depth <= 150) return 1.0;
  return 1.4;
}

/**
 * Raw slope quality score 0–100 from grooming capacity vs demand, adjusted by snow.
 */
export function getSlopeQualityRawScore(demand: number, capacity: number): number {
  if (demand <= 0) return 0;
  const baseRatio = capacity / demand;
  const snowFactor = getSnowQualityFactor(state.snowDepth);
  const effectiveRatio = baseRatio * snowFactor;
  return Math.round(Math.max(0, Math.min(100, 100 * effectiveRatio)));
}

const EXPERIENCE_DRIFT_RATE = 0.14;
const CHANGE_THRESHOLD = 0.5;

function driftValue(current: number, target: number, rate: number): number {
  return Math.max(0, Math.min(100, current + rate * (target - current)));
}

function getChange(prev: number, next: number): ExperienceChange {
  const d = next - prev;
  if (d > CHANGE_THRESHOLD) return 'up';
  if (d < -CHANGE_THRESHOLD) return 'down';
  return 'stable';
}

/**
 * Drift lift experience toward raw score and set change indicator. Call once per simulation day.
 */
export function driftLiftExperience(rawScore: number): void {
  const prev = state.liftExperience;
  state.liftExperience = Math.round(driftValue(prev, rawScore, EXPERIENCE_DRIFT_RATE) * 10) / 10;
  state.liftExperienceChange = getChange(prev, state.liftExperience);
}

/**
 * Drift slope crowd experience toward raw score and set change indicator.
 */
export function driftSlopeCrowdExperience(rawScore: number): void {
  const prev = state.slopeCrowdExperience;
  state.slopeCrowdExperience = Math.round(driftValue(prev, rawScore, EXPERIENCE_DRIFT_RATE) * 10) / 10;
  state.slopeCrowdChange = getChange(prev, state.slopeCrowdExperience);
}

/**
 * Drift slope quality experience toward raw score and set change indicator.
 */
export function driftSlopeQualityExperience(rawScore: number): void {
  const prev = state.slopeQualityExperience;
  state.slopeQualityExperience = Math.round(driftValue(prev, rawScore, EXPERIENCE_DRIFT_RATE) * 10) / 10;
  state.slopeQualityChange = getChange(prev, state.slopeQualityExperience);
}

/**
 * Target satisfaction 0–100 from the three experience scores (drift towards the worst of the three).
 */
export function getTargetSatisfactionFromScores(
  liftScore: number,
  crowdScore: number,
  qualityScore: number
): number {
  const worst = Math.min(liftScore, crowdScore, qualityScore);
  return Math.round(Math.max(0, Math.min(100, worst)));
}

/** Max satisfaction drift per day when visitor factor is 1 (0–1). */
const SATISFACTION_DRIFT_RATE = 0.12;

/**
 * Drift state.satisfaction toward the target from the three experience scores.
 * Scaled by visitors. Call once per simulation day after drifting the three metrics.
 */
export function driftSatisfaction(): void {
  const visitors = state.dailyVisitors;
  const capacity = getTotalLiftCapacity();
  const visitorFactor =
    visitors === 0 ? 0 : capacity > 0 ? Math.min(1, visitors / capacity) : 1;
  if (visitorFactor <= 0) return;

  const target = getTargetSatisfactionFromScores(
    state.liftExperience,
    state.slopeCrowdExperience,
    state.slopeQualityExperience
  );
  const current = state.satisfaction;
  const effectiveRate = SATISFACTION_DRIFT_RATE * visitorFactor;
  state.satisfaction = Math.max(
    0,
    Math.min(100, current + effectiveRate * (target - current))
  );
  state.satisfaction = Math.round(state.satisfaction * 10) / 10;
}
