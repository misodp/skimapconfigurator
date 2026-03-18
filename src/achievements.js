/**
 * Achievement badge unlock logic. Computes which badges are unlocked from lifts and slopes,
 * updates state.achievements, and updates the badge DOM (show only unlocked badges).
 *
 * Also provides effective satisfaction and lift‑driven reputation modifiers.
 */

import { state, getSlopeType } from './state';
import { getSlopePathLengthM, fromNormalized } from './geometry.js';
import { getLiftHealthZone } from './maintenance_simulator';

/** Lift type ids that count as two-seater (duo or agamatic) for Family achievement. */
const TWO_SEATER_LIFT_IDS = ['graffer_double', 'agamatic_duo'];

/** Normalized y: top of image = 0, bottom = 1. Top half = y < 0.5 (for High Alpine). */
const TOP_HALF_Y = 0.5;
/** Top 1/5th for Top of the World: lift top station y < 0.2. */
const TOP_FIFTH_Y = 0.2;

/**
 * Overall lift reputation multiplier from all built lifts.
 * For each lift, multiply by its type's reputation_boost, adjusted for current health zone:
 * - healthy (green): reputation_boost
 * - warning (yellow): reputation_boost - 0.1
 * - critical (red): reputation_boost - 0.3
 */
function getLiftReputationMultiplier() {
  if (!state.lifts.length || !state.liftTypes.length) return 1;

  let mult = 1;
  for (const lift of state.lifts) {
    const type = state.liftTypes.find((t) => t.id === lift.type);
    if (!type) continue;

    const baseBoostRaw = /** @type {number | undefined} */ (type.reputation_boost);
    if (baseBoostRaw == null) continue;
    let baseBoost = Number(baseBoostRaw);
    if (!Number.isFinite(baseBoost) || baseBoost <= 0) continue;

    const reliabilityRaw = /** @type {number | undefined} */ (type.reliability);
    const reliability = reliabilityRaw != null ? Number(reliabilityRaw) : 0.85;
    const health = Math.max(0, Math.min(100, lift.health ?? 100));
    const broken = lift.broken === true;

    let factor = baseBoost;
    if (!broken) {
      const zone = getLiftHealthZone(health, reliability);
      if (zone === 'warning') {
        factor = baseBoost - 0.05;
      } else if (zone === 'critical') {
        factor = baseBoost - 0.3;
      }
    } else {
      // Broken lifts are reputationally bad: treat as critical.
      factor = baseBoost - 0.5;
    }

    if (factor <= 0) continue;
    mult *= factor;
  }

  return mult;
}

/**
 * Overall slope reputation multiplier from all built slopes.
 * Applies ONLY to slopes longer than 1500 m (map length in meters).
 * For each qualifying slope, multiply by its slope type's reputation_boost.
 */
function getSlopeReputationMultiplier() {
  if (!state.slopes.length || !state.slopeTypes.length) return 1;

  let mult = 1;
  for (const slope of state.slopes) {
    const st = getSlopeType(slope);
    if (!st) continue;
    const baseBoostRaw = /** @type {number | undefined} */ (st.reputation_boost);
    if (baseBoostRaw == null) continue;
    const baseBoost = Number(baseBoostRaw);
    if (!Number.isFinite(baseBoost) || baseBoost <= 0) continue;

    if (!slope.points || slope.points.length < 2) continue;
    const imagePoints = slope.points.map((p) => fromNormalized(p.x, p.y));
    const lengthM = getSlopePathLengthM(imagePoints);
    if (!Number.isFinite(lengthM) || lengthM <= 1500) continue;

    mult *= baseBoost;
  }

  return mult;
}

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

/** High Alpine: at least 3 lifts and 3 slopes with at least one point in the top half of the image. */
function checkHighAlpine() {
  const liftsInTopHalf = state.lifts.filter((lift) => {
    const minY = Math.min(lift.topStation.y, lift.bottomStation.y);
    return minY < TOP_HALF_Y;
  });
  if (liftsInTopHalf.length < 3) return false;
  const slopesInTopHalf = state.slopes.filter((slope) =>
    slope.points.some((p) => p.y < TOP_HALF_Y)
  );
  return slopesInTopHalf.length >= 3;
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

/** Max satisfaction (0–100) by number of unlocked badges: 0→20, 1→40, 2→60, 3→80, 4→100. */
export function getSatisfactionCap() {
  const n = [state.achievements.family, state.achievements.highAlpine, state.achievements.freeride, state.achievements.topOfWorld].filter(Boolean).length;
  return [20, 40, 60, 80, 100][n];
}

/** Raw satisfaction (0–100) from experience, normalized into 0–cap for display and visitors. */
export function getEffectiveSatisfaction() {
  const raw = Math.max(0, Math.min(100, state.satisfaction));
  const cap = getSatisfactionCap();
  const base = (raw / 100) * cap;
  const liftMultiplier = getLiftReputationMultiplier();
  const slopeMultiplier = getSlopeReputationMultiplier();
  return base * liftMultiplier * slopeMultiplier;
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

/** Previous achievement state to detect newly unlocked. */
let previousAchievements = { family: false, highAlpine: false, freeride: false, topOfWorld: false };
/** Skip animation on first run (e.g. load save with existing achievements). */
let hasUpdatedAchievementsOnce = false;

const FLYER_SIZE_PX = 400;
const FLYER_DURATION_MS = 1200;
const CENTER_PAUSE_MS = 2000;

/**
 * Run one badge fly animation, then call onDone.
 */
function playOneBadgeAnimation(key, onDone) {
  const badgeId = BADGE_IDS[key];
  const cornerEl = document.getElementById(badgeId);
  const overlay = document.getElementById('badgeUnlockOverlay');
  const flyer = document.getElementById('badgeUnlockFlyer');
  const mountainEl = document.querySelector('.canvas-wrapper');
  if (!cornerEl || !overlay || !flyer || !cornerEl.src) {
    if (onDone) onDone();
    return;
  }

  const targetRect = cornerEl.getBoundingClientRect();
  flyer.src = cornerEl.src;
  flyer.alt = key + ' achievement';
  cornerEl.style.visibility = 'hidden';
  cornerEl.style.opacity = '0';

  overlay.hidden = false;
  overlay.setAttribute('aria-hidden', 'false');

  const mountainRect = mountainEl ? mountainEl.getBoundingClientRect() : null;
  const startX = mountainRect ? mountainRect.left + mountainRect.width / 2 : window.innerWidth / 2;
  const startY = mountainRect ? mountainRect.top + mountainRect.height / 2 : window.innerHeight / 2;

  flyer.style.transition = 'none';
  flyer.style.left = startX + 'px';
  flyer.style.top = startY + 'px';
  flyer.style.width = FLYER_SIZE_PX + 'px';
  flyer.style.height = FLYER_SIZE_PX + 'px';
  flyer.offsetHeight;

  const goToCorner = () => {
    flyer.style.transition = `left ${FLYER_DURATION_MS / 1000}s ease-out, top ${FLYER_DURATION_MS / 1000}s ease-out, width ${FLYER_DURATION_MS / 1000}s ease-out, height ${FLYER_DURATION_MS / 1000}s ease-out`;
    const endX = targetRect.left + targetRect.width / 2;
    const endY = targetRect.top + targetRect.height / 2;
    flyer.style.left = endX + 'px';
    flyer.style.top = endY + 'px';
    flyer.style.width = targetRect.width + 'px';
    flyer.style.height = targetRect.height + 'px';
  };

  requestAnimationFrame(() => {
    requestAnimationFrame(() => setTimeout(goToCorner, CENTER_PAUSE_MS));
  });

  let finished = false;
  const onEnd = () => {
    if (finished) return;
    finished = true;
    flyer.removeEventListener('transitionend', onEnd);
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    cornerEl.style.visibility = 'visible';
    cornerEl.style.opacity = '';
    if (onDone) onDone();
  };
  flyer.addEventListener('transitionend', onEnd);
  setTimeout(onEnd, CENTER_PAUSE_MS + FLYER_DURATION_MS + 200);
}

/**
 * Play unlock animations for newly unlocked keys, one after another.
 */
function playBadgeUnlockAnimations(newlyUnlocked) {
  if (newlyUnlocked.length === 0) return;
  let i = 0;
  const runNext = () => {
    if (i >= newlyUnlocked.length) return;
    playOneBadgeAnimation(newlyUnlocked[i], () => {
      i += 1;
      runNext();
    });
  };
  runNext();
}

/**
 * Update badge visibility from state.achievements. Unlocked badges are shown;
 * locked ones hidden. Container loses --locked if at least one badge is unlocked.
 * Newly unlocked badges play a center-to-corner animation.
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

  const newlyUnlocked = [];
  for (const [key, id] of Object.entries(BADGE_IDS)) {
    const el = document.getElementById(id);
    if (el) {
      const unlocked = state.achievements[key];
      if (unlocked && !previousAchievements[key]) newlyUnlocked.push(key);
      el.style.visibility = unlocked ? 'visible' : 'hidden';
      el.style.display = unlocked ? '' : 'none';
    }
  }
  previousAchievements = { ...state.achievements };

  if (!hasUpdatedAchievementsOnce) {
    hasUpdatedAchievementsOnce = true;
  } else {
    playBadgeUnlockAnimations(newlyUnlocked);
  }
}
