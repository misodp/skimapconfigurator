/**
 * Lift and groomer maintenance simulation.
 * Each unit has health 0–100 that degrades over time based on reliability, age, visitors, and weather.
 */

import type { SimulationDate } from './types';
import { state } from './state';
import type { WeatherType } from './weather-simulation';
import { getTotalLiftCapacity } from './experience-simulator';

/** Base degradation per day at 1.0 reliability, 0 age, 0 visitors, neutral weather. */
const BASE_DEGRADATION_PER_DAY = 0.5;

/** Weather factor: worse weather increases wear. */
const WEATHER_DEGRADATION_FACTOR: Record<WeatherType, number> = {
  sunny: 0.85,
  cloudy: 1.0,
  snowy: 1.2,
  blizzard: 1.5,
  icy: 1.15,
};

/**
 * Count days from start to end (inclusive of start, exclusive of end).
 * Assumes valid month/day; simplified for simulation (no full calendar).
 */
function daysBetween(start: SimulationDate, end: SimulationDate): number {
  let days = 0;
  let y = start.year;
  let m = start.month;
  let d = start.day;
  const dim = (month: number, year: number) => {
    if (month === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
    if ([4, 6, 9, 11].includes(month)) return 30;
    return 31;
  };
  while (y < end.year || (y === end.year && m < end.month) || (y === end.year && m === end.month && d < end.day)) {
    days += 1;
    d += 1;
    if (d > dim(m, y)) {
      d = 1;
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
  }
  return days;
}

/**
 * Daily health degradation for a lift.
 * Higher reliability = slower degradation; older age, higher utilization (visitors/capacity), worse weather = faster degradation.
 */
export function getLiftDailyDegradation(
  installedDate: SimulationDate | undefined,
  reliability: number,
  dailyVisitors: number
): number {
  const rel = Math.max(0.1, Math.min(1, reliability || 0.5));
  const reliabilityFactor = 1 / rel;
  const ageDays = installedDate ? daysBetween(installedDate, state.currentDate) : 0;
  const ageFactor = 1 + ageDays / 3650;
  const liftCapacity = getTotalLiftCapacity();
  const utilization = liftCapacity > 0 ? dailyVisitors / liftCapacity : 1;
  const visitorFactor = utilization < 0.5 ? 1 : Math.min(3, 1 + 2 * (utilization - 0.5));
  const weatherFactor = WEATHER_DEGRADATION_FACTOR[state.currentWeather] ?? 1;
  return BASE_DEGRADATION_PER_DAY * reliabilityFactor * ageFactor * visitorFactor * weatherFactor;
}

export type LiftHealthZone = 'healthy' | 'warning' | 'critical';

/**
 * Warning and critical health thresholds derived from reliability.
 * Linear in reliability: Poma (0.85) → warning 70, critical 35; Duo-68 (0.98) → warning 50, critical 10.
 * Less reliable = higher thresholds (enter warning/critical earlier).
 */
export function getLiftHealthThresholds(reliability: number): { warning: number; critical: number } {
  const rel = Math.max(0.1, Math.min(1, reliability ?? 0.5));
  const warning = Math.max(50, Math.min(85, 70 + (0.85 - rel) * (20 / 0.13)));
  const critical = Math.max(10, Math.min(50, 35 + (0.85 - rel) * (25 / 0.13)));
  return { warning, critical };
}

/**
 * Zone for display: healthy (green), warning (yellow), critical (red).
 */
export function getLiftHealthZone(health: number, reliability: number): LiftHealthZone {
  const { warning, critical } = getLiftHealthThresholds(reliability);
  if (health >= warning) return 'healthy';
  if (health >= critical) return 'warning';
  return 'critical';
}

/**
 * Effective capacity multiplier for a lift: 1.0 when health >= warning threshold;
 * below warning, scales down to 0.5 at 0 health (glitching/breakdowns reduce throughput).
 */
export function getLiftEffectiveCapacityMultiplier(health: number, reliability: number): number {
  const { warning } = getLiftHealthThresholds(reliability);
  const h = Math.max(0, Math.min(100, health));
  if (h >= warning) return 1;
  if (warning <= 0) return 1;
  return 0.5 + 0.5 * (h / warning);
}

/**
 * Service cost to restore a lift to 100% health. Scales with wear:
 * at health 0, cost = 50% of initial investment; at health 100, cost = 0.
 */
export function getLiftServiceCost(health: number, initialInvestment: number): number {
  const h = Math.max(0, Math.min(100, health));
  if (h >= 100) return 0;
  const wear = (100 - h) / 100;
  return Math.round(0.5 * initialInvestment * wear);
}

/**
 * Total effective lift capacity (for wait-time / experience).
 * Visitors are still derived from full installed capacity; using effective capacity here
 * makes wait times worse when lifts are below warning (glitching).
 */
export function getEffectiveLiftCapacity(): number {
  let total = 0;
  for (const lift of state.lifts) {
    const type = state.liftTypes.find((t) => t.id === lift.type);
    if (!type || type.capacity == null) continue;
    const cap = Number(type.capacity) || 0;
    const rel = (type as { reliability?: number }).reliability != null
      ? Number((type as { reliability?: number }).reliability)
      : 0.85;
    const mult = getLiftEffectiveCapacityMultiplier(lift.health ?? 100, rel);
    total += cap * mult;
  }
  return total;
}

/**
 * Daily health degradation for a groomer (same formula, different visitor scaling if desired).
 */
export function getGroomerDailyDegradation(
  installedDate: SimulationDate | undefined,
  reliability: number,
  _dailyVisitors: number
): number {
  const rel = Math.max(0.1, Math.min(1, reliability || 0.9));
  const reliabilityFactor = 1 / rel;
  const ageDays = installedDate ? daysBetween(installedDate, state.currentDate) : 0;
  const ageFactor = 1 + ageDays / 3650;
  const weatherFactor = WEATHER_DEGRADATION_FACTOR[state.currentWeather] ?? 1;
  return BASE_DEGRADATION_PER_DAY * reliabilityFactor * ageFactor * weatherFactor;
}

/**
 * Apply one day of maintenance: update health for all lifts and groomers.
 * Call once per simulation day.
 */
export function updateMaintenance(): void {
  const visitors = state.dailyVisitors;

  for (const lift of state.lifts) {
    const type = state.liftTypes.find((t) => t.id === lift.type);
    const reliability = (type && (type as { reliability?: number }).reliability != null)
      ? Number((type as { reliability?: number }).reliability)
      : 0.85;
    const current = Math.max(0, Math.min(100, lift.health ?? 100));
    const degradation = getLiftDailyDegradation(lift.installedDate, reliability, visitors);
    lift.health = Math.max(0, Math.min(100, current - degradation));
  }

  for (const groomer of state.groomers) {
    const type = state.groomerTypes.find((t) => t.id === groomer.groomerTypeId);
    const reliability = (type && (type as { reliability?: number }).reliability != null)
      ? Number((type as { reliability?: number }).reliability)
      : 0.9;
    const current = Math.max(0, Math.min(100, groomer.health ?? 100));
    const degradation = getGroomerDailyDegradation(groomer.installedDate, reliability, visitors);
    groomer.health = Math.max(0, Math.min(100, current - degradation));
  }
}
