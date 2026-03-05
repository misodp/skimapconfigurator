/**
 * Resort economics: operating costs, visitors, ticket sales.
 */

import { state } from './state';
import { fromNormalized, getLiftLengthM } from './geometry.js';
import { WEATHER_VISITOR_MODIFIERS, SEASON_VISITOR_MODIFIERS, getSeason } from './weather-simulation';

/** Ticket price in ski dollars per visitor per day. */
export const TICKET_PRICE = 1.0;

/**
 * Total daily operating cost for all built lifts and groomers.
 * Lifts: base_operating_cost + (length in m × op_cost_per_meter).
 * Groomers: base_operating_cost each.
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
    total += base + lengthM * perM;
  }
  for (const g of state.groomers) {
    const type = state.groomerTypes.find((t) => t.id === g.groomerTypeId);
    if (!type) continue;
    total += Number(type.base_operating_cost) || 0;
  }
  return Math.round(total);
}

/** Randomness: ±10% multiplier (0.9 to 1.1). */
const VISITOR_RANDOMNESS = 0.1;

/** Satisfaction modifier: 0% → 0.6× visitors, 100% → 1.4× visitors. */
function getSatisfactionVisitorFactor() {
  const s = Math.max(0, Math.min(100, state.satisfaction));
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
 * Snow: none below 20 cm, full effect 20–200 cm, slight boost above 200 cm.
 */
export function getDailyVisitors() {
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
  const randomFactor = 1 + (Math.random() * 2 - 1) * VISITOR_RANDOMNESS; // 0.9 to 1.1
  return Math.round(potentialVisitors * snowFactor * seasonFactor * weatherFactor * satisfactionFactor * randomFactor);
}
