/**
 * Visitor experience: lift wait times and slope crowds as a function of
 * visitors vs installed capacity. Bucketed into good / medium / bad.
 */

import type { ExperienceBucket } from './types';
import { state, getSlopeType } from './state';
import { fromNormalized, getSlopePathLengthM } from './geometry.js';

export type { ExperienceBucket };

/** Utilization thresholds: below goodMax = good, below badMin = medium, else bad. */
const GOOD_UTILIZATION_MAX = 0.8;
const BAD_UTILIZATION_MIN = 1.2;

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

/**
 * Lift wait experience from visitors vs lift capacity.
 * Low utilization = good, high = bad.
 */
export function getLiftWaitBucket(visitors: number, liftCapacity: number): ExperienceBucket {
  if (liftCapacity <= 0) return 'bad';
  const utilization = visitors / liftCapacity;
  if (utilization < GOOD_UTILIZATION_MAX) return 'good';
  if (utilization >= BAD_UTILIZATION_MIN) return 'bad';
  return 'medium';
}

/**
 * Slope crowd experience from visitors vs slope capacity.
 */
export function getSlopeCrowdBucket(visitors: number, slopeCapacity: number): ExperienceBucket {
  if (slopeCapacity <= 0) return visitors > 0 ? 'bad' : 'good';
  const utilization = visitors / slopeCapacity;
  if (utilization < GOOD_UTILIZATION_MAX) return 'good';
  if (utilization >= BAD_UTILIZATION_MIN) return 'bad';
  return 'medium';
}

/** 1 grooming_capacity point = 100 m of slope with grooming_load 1. */
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
 * Total grooming demand in capacity units: sum over slopes of (length_m / 100) * grooming_load,
 * multiplied by a weather factor (bad weather increases demand).
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
 * Slope quality from grooming capacity vs demand, adjusted by snow depth.
 * Too little snow reduces quality; lots of snow improves it.
 */
export function getSlopeQualityBucket(demand: number, capacity: number): ExperienceBucket {
  if (demand <= 0) return 'bad'; // no slopes → no terrain to ski, quality is bad
  const baseRatio = capacity / demand;
  const snowFactor = getSnowQualityFactor(state.snowDepth);
  const effectiveRatio = baseRatio * snowFactor;
  if (effectiveRatio >= 1) return 'good';
  if (effectiveRatio >= 0.5) return 'medium';
  return 'bad';
}

export const EXPERIENCE_BUCKET_LABELS: Record<ExperienceBucket, string> = {
  good: 'Good',
  medium: 'Medium',
  bad: 'Bad',
};

/** Contribution per metric to target satisfaction. Bad is penalized so one "bad" pulls satisfaction down. */
function bucketToScore(b: ExperienceBucket): number {
  switch (b) {
    case 'good': return 50;
    case 'medium': return 15;
    case 'bad': return -40;
  }
}

/**
 * Target satisfaction 0–100 from the three experience buckets (lift wait, slope crowds, slope quality).
 * Any "bad" metric strongly lowers the target so satisfaction drifts down.
 */
export function getTargetSatisfaction(
  liftBucket: ExperienceBucket,
  crowdBucket: ExperienceBucket,
  qualityBucket: ExperienceBucket
): number {
  const sum =
    bucketToScore(liftBucket) + bucketToScore(crowdBucket) + bucketToScore(qualityBucket);
  return Math.round(Math.max(0, Math.min(100, sum)));
}

/** Max satisfaction drift per day when visitor factor is 1 (0–1). */
const SATISFACTION_DRIFT_RATE = 0.12;

/**
 * Drift state.satisfaction toward the target implied by current experience buckets.
 * Scaled by visitors: no visitors → no change; more visitors (relative to lift capacity) → stronger drift.
 * Call once per simulation day.
 */
export function driftSatisfaction(): void {
  const visitors = state.dailyVisitors;
  const capacity = getTotalLiftCapacity();
  const visitorFactor =
    visitors === 0 ? 0 : capacity > 0 ? Math.min(1, visitors / capacity) : 1;
  if (visitorFactor <= 0) return;

  const target = getTargetSatisfaction(
    state.liftExperienceBucket,
    state.slopeCrowdBucket,
    state.slopeQualityBucket
  );
  const current = state.satisfaction;
  const effectiveRate = SATISFACTION_DRIFT_RATE * visitorFactor;
  state.satisfaction = Math.max(
    0,
    Math.min(100, current + effectiveRate * (target - current))
  );
  state.satisfaction = Math.round(state.satisfaction * 10) / 10;
}
