/**
 * Coordinate conversion and path/length/cost helpers.
 */

import { state, getSlopeType } from './state';
import { WEATHER_VISITOR_MODIFIERS } from './weather-simulation';

/** Ticket price in ski dollars per visitor per day. */
export const TICKET_PRICE = 1.5;

export function toNormalized(px, py) {
  return {
    x: state.imageWidth ? px / state.imageWidth : 0,
    y: state.imageHeight ? py / state.imageHeight : 0,
  };
}

export function fromNormalized(nx, ny) {
  return {
    x: nx * state.imageWidth,
    y: ny * state.imageHeight,
  };
}

export function getLiftLengthM(bottomImage, topImage) {
  if (!state.imageWidth || !state.imageHeight) return 0;
  const normDist = Math.sqrt(
    Math.pow((topImage.x - bottomImage.x) / state.imageWidth, 2) +
    Math.pow((topImage.y - bottomImage.y) / state.imageHeight, 2)
  );
  return Math.round((normDist / 0.1) * 450);
}

export function getSlopePathLengthM(points) {
  if (!state.imageWidth || !state.imageHeight || points.length < 2) return 0;
  let normLen = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    normLen += Math.sqrt(
      Math.pow((b.x - a.x) / state.imageWidth, 2) + Math.pow((b.y - a.y) / state.imageHeight, 2)
    );
  }
  return Math.round((normLen / 0.1) * 450);
}

export function getSlopeCost(lengthM) {
  const st = getSlopeType(state.difficulty);
  if (!st || st.cost_per_meter == null) return 0;
  return Math.round(lengthM * Number(st.cost_per_meter));
}

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

/**
 * Potential visitors = installed lift capacity (for daily ticket sales).
 * Daily visitors = potential visitors × weather factor × (1 ± 10% random).
 */
export function getDailyVisitors() {
  let potentialVisitors = 0;
  for (const lift of state.lifts) {
    const type = state.liftTypes.find((t) => t.id === lift.type);
    if (!type || type.capacity == null) continue;
    potentialVisitors += Number(type.capacity) || 0;
  }
  const weatherFactor = WEATHER_VISITOR_MODIFIERS[state.currentWeather] ?? 0.85;
  const randomFactor = 1 + (Math.random() * 2 - 1) * VISITOR_RANDOMNESS; // 0.9 to 1.1
  return Math.round(potentialVisitors * weatherFactor * randomFactor);
}
