/**
 * Snow-based mountain background images.
 * Images in assets/images/mountain/ are named mountain1_N.png where N is the snow depth (cm) at which that image is active.
 * We switch images only after the new threshold has been the target for 3 consecutive days, and use a fade transition.
 */

import { state, DOM } from './state';
import { syncCanvasSize } from './canvas.js';

const mountainModules = import.meta.glob('../assets/images/mountain/*.png', { eager: true, import: 'default' });
const FADE_MS = 350;
const DAYS_AT_THRESHOLD_BEFORE_SWITCH = 3;

/** @type { { threshold: number, url: string }[] } sorted by threshold ascending */
let snowThresholds = [];

function parseThresholdFromPath(path) {
  const match = path.match(/_(\d+)\.png$/i) || path.match(/_(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

function buildThresholds() {
  if (snowThresholds.length > 0) return;
  snowThresholds = Object.entries(mountainModules)
    .map(([path, url]) => ({ threshold: parseThresholdFromPath(path), url: /** @type {string} */ (url) }))
    .filter((e) => !Number.isNaN(e.threshold))
    .sort((a, b) => a.threshold - b.threshold);
}

/** Returns the threshold (cm) that should be used for the given snow depth. */
function getThresholdForSnowDepth(snowDepth) {
  buildThresholds();
  if (snowThresholds.length === 0) return 0;
  let chosen = snowThresholds[0].threshold;
  for (const entry of snowThresholds) {
    if (entry.threshold <= snowDepth) chosen = entry.threshold;
    else break;
  }
  return chosen;
}

/** Returns the URL for the image at the given threshold. */
function getUrlForThreshold(threshold) {
  buildThresholds();
  const entry = snowThresholds.find((e) => e.threshold === threshold);
  return entry ? entry.url : (snowThresholds[0]?.url ?? null);
}

/**
 * Returns the URL for the mountain image that would be shown at the given snow depth (ignoring 3-day rule).
 */
export function getMountainUrlForSnowDepth(snowDepth) {
  return getUrlForThreshold(getThresholdForSnowDepth(snowDepth));
}

/**
 * Switches the mountain image with a fade-out → change src → fade-in. Updates state and syncs canvas on load.
 */
function setMountainImageWithTransition(url) {
  const img = DOM.mountainImage;
  if (!img || !url) return;
  img.style.opacity = '0';
  setTimeout(() => {
    img.onload = () => {
      state.image = img;
      syncCanvasSize();
      img.style.opacity = '1';
    };
    img.src = url;
    img.classList.remove('no-image');
  }, FADE_MS);
}

/**
 * Sets the header mountain image based on snow depth. Uses a 3-day rule: switch only after the new
 * threshold has been the target for 3 consecutive days. Applies a fade transition when switching.
 * No-op if a custom mountain image is set (state.customMountainUrl).
 */
export function updateMountainImage() {
  if (!DOM.mountainImage || state.customMountainUrl) return;
  buildThresholds();
  if (snowThresholds.length === 0) return;

  const snowDepth = state.snowDepth ?? 0;
  const targetThreshold = getThresholdForSnowDepth(snowDepth);

  if (state.displayedMountainThreshold === null) {
    state.displayedMountainThreshold = targetThreshold;
    const url = getUrlForThreshold(targetThreshold);
    if (url) {
      DOM.mountainImage.onload = () => {
        state.image = DOM.mountainImage;
        syncCanvasSize();
      };
      DOM.mountainImage.src = url;
      DOM.mountainImage.style.opacity = '1';
      DOM.mountainImage.classList.remove('no-image');
    }
    return;
  }

  if (targetThreshold === state.displayedMountainThreshold) {
    state.mountainPendingThreshold = null;
    state.mountainDaysAtPending = 0;
    return;
  }

  if (targetThreshold === state.mountainPendingThreshold) {
    state.mountainDaysAtPending += 1;
    if (state.mountainDaysAtPending >= DAYS_AT_THRESHOLD_BEFORE_SWITCH) {
      state.displayedMountainThreshold = targetThreshold;
      state.mountainPendingThreshold = null;
      state.mountainDaysAtPending = 0;
      const url = getUrlForThreshold(targetThreshold);
      if (url) setMountainImageWithTransition(url);
    }
    return;
  }

  state.mountainPendingThreshold = targetThreshold;
  state.mountainDaysAtPending = 1;
}
