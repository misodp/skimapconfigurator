/**
 * Resort economics: operating costs, visitors, ticket sales.
 */

import { state } from './state';
import { fromNormalized, getLiftLengthM } from './geometry.js';
import { WEATHER_VISITOR_MODIFIERS, SEASON_VISITOR_MODIFIERS, getSeason } from './weather-simulation';
import { getEffectiveSatisfaction } from './achievements.js';
import { getTotalSlopeCapacity } from './experience-simulator';
import { getEffectiveLiftCapacity } from './maintenance_simulator';

/**
 * Total daily operating cost for all built lifts and groomers.
 * Lifts: base_operating_cost + (length in m × op_cost_per_meter).
 * Groomers: base_operating_cost each.
 * Broken equipment costs 30% of normal (reduced maintenance while out of service).
 * When resort is closed, working equipment costs 30% of normal; broken equipment stays at 30% (unchanged).
 */
export function getDailyOperatingCost() {
  let total = 0;
  for (const lift of state.lifts) {
    const type = state.liftTypes.find((t) => t.id === lift.type);
    if (!type) continue;
    const bottomImage = fromNormalized(lift.bottomStation.x, lift.bottomStation.y);
    const topImage = fromNormalized(lift.topStation.x, lift.topStation.y);
    const lengthM = getLiftLengthM(bottomImage, topImage);
    const base = Number(type.base_operating_cost) || 0;
    const perM = Number(type.op_cost_per_meter) || 0;
    const cost = base + lengthM * perM;
    if (lift.broken) {
      total += cost * 0.3;
    } else {
      total += state.resortOpen !== false ? cost : cost * 0.3;
    }
  }
  for (const g of state.groomers) {
    const type = state.groomerTypes.find((t) => t.id === g.groomerTypeId);
    if (!type) continue;
    const cost = Number(type.base_operating_cost) || 0;
    if (g.broken) {
      total += cost * 0.3;
    } else {
      total += state.resortOpen !== false ? cost : cost * 0.3;
    }
  }
  return Math.round(total);
}

/** Randomness: ±10% multiplier (0.9 to 1.1). */
const VISITOR_RANDOMNESS = 0.1;

/** Satisfaction modifier: 0% → 0.6× visitors, 100% → 1.4× visitors. Uses effective satisfaction (capped by unlocked badges). */
function getSatisfactionVisitorFactor() {
  const s = Math.max(0, Math.min(100, getEffectiveSatisfaction()));
  return 0.6 + (s / 100) * 0.8;
}

/** Snow depth (cm): < 20 → no visitors; 20–200 → ramp 0→1; > 200 → slight increase. */
function getSnowVisitorFactor() {
  const snow = state.snowDepth ?? 0;
  if (snow < 20) return 0; //no visitors
  if (snow >= 200) return 1.1; // 10% boost for deep snow
  return 1; // normal interest
}

/**
 * Potential visitors = installed lift capacity (for daily ticket sales).
 * Daily visitors = potential × snow × season × weather × satisfaction × (1 ± 10% random).
 * When resort is closed, returns 0.
 */
export function getDailyVisitors() {
  if (state.resortOpen !== true) return 0;
  let potentialVisitors = 0;
  for (const lift of state.lifts) {
    const type = state.liftTypes.find((t) => t.id === lift.type);
    if (!type || type.capacity == null) continue;
    potentialVisitors += Number(type.capacity) || 0;
  }
  const snowFactor = getSnowVisitorFactor();
  const season = getSeason(state.currentDate.month);
  const seasonFactor = SEASON_VISITOR_MODIFIERS[season] ?? 1;
  const weatherFactor = WEATHER_VISITOR_MODIFIERS[state.currentWeather] ?? 0.85;
  const satisfactionFactor = getSatisfactionVisitorFactor();
  // Price penalty: if percent price increase above base (1.0) is higher than effective satisfaction,
  // visitors drop by double the % difference.
  const price = getTicketPrice();
  const basePrice = 1.0;
  const priceIncreasePct = price <= basePrice ? 0 : ((price - basePrice) / basePrice) * 100;
  const effectiveSatisfaction = Math.max(0, Math.min(100, getEffectiveSatisfaction()));
  let priceVisitorFactor = 1;
  if (priceIncreasePct > effectiveSatisfaction) {
    const diff = priceIncreasePct - effectiveSatisfaction; // percentage points
    const penalty = 2 * (diff / 100); // double the % difference
    priceVisitorFactor = Math.max(0, 1 - penalty);
  }
  const randomFactor = 1 + (Math.random() * 2 - 1) * VISITOR_RANDOMNESS; // 0.9 to 1.1
  const raw = Math.round(
    potentialVisitors *
    snowFactor *
    seasonFactor *
    weatherFactor *
    satisfactionFactor *
    priceVisitorFactor *
    randomFactor
  );

  // Visitors are capped by both lift throughput and slope crowding:
  // - lifts: capped by 2× effective lift capacity
  // - slopes: capped by 2× total slope capacity
  const effectiveLiftCap = getEffectiveLiftCapacity();
  const maxVisitorsByLift = Math.max(0, Math.round(2 * effectiveLiftCap));
  const slopeCap = getTotalSlopeCapacity();
  const maxVisitorsBySlope = Math.max(0, Math.round(2 * (Number.isFinite(slopeCap) ? slopeCap : 0)));
  const maxVisitors = Math.max(0, Math.min(maxVisitorsByLift, maxVisitorsBySlope));
  if (maxVisitors <= 0) return 0;
  return Math.max(0, Math.min(raw, maxVisitors));
}

/** Current ticket price in ski dollars per visitor per day. */
export function getTicketPrice() {
  const p = Number(state.ticketPrice);
  if (!Number.isFinite(p) || p <= 0) return 1.0;
  return Math.max(0.25, Math.min(5, p));
}
