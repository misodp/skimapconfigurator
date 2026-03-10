/**
 * Achievement badge unlock logic. Computes which badges are unlocked from lifts and slopes,
 * updates state.achievements, and updates the badge DOM (show only unlocked badges).
 */

import { state, getSlopeType } from './state';
import { getSlopePathLengthM, fromNormalized } from './geometry.js';

/** Lift type ids that count as two-seater (duo or agamatic) for Family achievement. */
const TWO_SEATER_LIFT_IDS = ['graffer_double', 'agamatic_duo'];

/** Normalized y: top of image = 0, bottom = 1. Top third = y < 1/3. */
const TOP_THIRD_Y = 1 / 3;
/** Top 1/5th for Top of the World: lift top station y < 0.2. */
const TOP_FIFTH_Y = 0.2;

function hasTwoSeaterLift() {
  return state.lifts.some((lift) => TWO_SEATER_LIFT_IDS.includes(lift.type));
}

function getSlopeLengthByDifficulty(difficulty) {
  let totalM = 0;
  for (const slope of state.slopes) {
    const st = getSlopeType(slope);
    if (!st || st.difficulty !== difficulty) continue;
    const imagePoints = slope.points.map((p) => fromNormalized(p.x, p.y));
    totalM += getSlopePathLengthM(imagePoints);
  }
  return totalM;
}

function getFreerideLengthAndCount() {
  let totalM = 0;
  let slopeCount = 0;
  for (const slope of state.slopes) {
    const st = getSlopeType(slope);
    if (!st || st.difficulty !== 'Freeride') continue;
    slopeCount += 1;
    const imagePoints = slope.points.map((p) => fromNormalized(p.x, p.y));
    totalM += getSlopePathLengthM(imagePoints);
  }
  return { totalM, count: slopeCount };
}

/** Family: ≥3 lifts, one two-seater (duo/agamatic), >2000m blue, >1000m green, >500m red. */
function checkFamily() {
  if (state.lifts.length < 3) return false;
  if (!hasTwoSeaterLift()) return false;
  if (getSlopeLengthByDifficulty('Blue') <= 2000) return false;
  if (getSlopeLengthByDifficulty('Green') <= 1000) return false;
  if (getSlopeLengthByDifficulty('Red') <= 500) return false;
  return true;
}

/** High Alpine: at least one lift and one slope in the top third of the image. */
function checkHighAlpine() {
  const liftInTopThird = state.lifts.some((lift) => {
    const topY = lift.topStation.y;
    const bottomY = lift.bottomStation.y;
    const minY = Math.min(topY, bottomY);
    return minY < TOP_THIRD_Y;
  });
  if (!liftInTopThird) return false;
  const slopeInTopThird = state.slopes.some((slope) =>
    slope.points.some((p) => p.y < TOP_THIRD_Y)
  );
  return slopeInTopThird;
}

/** Freeride: >3000m of freeride slopes and at least two different (freeride) slopes. */
function checkFreeride() {
  const { totalM, count } = getFreerideLengthAndCount();
  return totalM > 3000 && count >= 2;
}

/** Top of the World: at least one lift whose top station is in the top 1/5th of the image. */
function checkTopOfWorld() {
  return state.lifts.some((lift) => lift.topStation.y < TOP_FIFTH_Y);
}

/**
 * Recompute all achievements from current state and update state.achievements.
 */
export function computeAchievements() {
  state.achievements = {
    family: checkFamily(),
    highAlpine: checkHighAlpine(),
    freeride: checkFreeride(),
    topOfWorld: checkTopOfWorld(),
  };
}

const BADGE_IDS = {
  family: 'badgeFamily',
  highAlpine: 'badgeAlpine',
  freeride: 'badgeFreeride',
  topOfWorld: 'badgeTopWorld',
};

/**
 * Update badge visibility from state.achievements. Unlocked badges are shown;
 * locked ones hidden. Container loses --locked if at least one badge is unlocked.
 */
export function updateAchievementBadges() {
  computeAchievements();
  const container = document.querySelector('.mountain-badges');
  if (!container) return;

  const anyUnlocked =
    state.achievements.family ||
    state.achievements.highAlpine ||
    state.achievements.freeride ||
    state.achievements.topOfWorld;

  container.classList.toggle('mountain-badges--locked', !anyUnlocked);

  for (const [key, id] of Object.entries(BADGE_IDS)) {
    const el = document.getElementById(id);
    if (el) {
      el.style.visibility = state.achievements[key] ? 'visible' : 'hidden';
      el.style.display = state.achievements[key] ? '' : 'none';
    }
  }
}
