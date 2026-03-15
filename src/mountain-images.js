/**
 * Snow-based mountain background images.
 * All threshold images are overlaid; opacity of each layer is set from snow depth for smooth transitions.
 */

import { state, DOM } from './state';
import { syncCanvasSize } from './canvas.js';

const mountainModules = import.meta.glob('../assets/images/mountain/*.webp', { eager: true, import: 'default' });

/** @type { { threshold: number, url: string }[] } sorted by threshold ascending */
let snowThresholds = [];
/** @type { HTMLImageElement[] } one img per threshold, same order as snowThresholds */
let layerImages = [];
let stackBuilt = false;

function parseThresholdFromPath(path) {
  const match = path.match(/_(\d+)\.webp$/i) || path.match(/_(\d+)\.png$/i) || path.match(/_(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

function buildThresholds() {
  if (snowThresholds.length > 0) return;
  snowThresholds = Object.entries(mountainModules)
    .map(([path, url]) => ({ threshold: parseThresholdFromPath(path), url: /** @type {string} */ (url) }))
    .filter((e) => !Number.isNaN(e.threshold))
    .sort((a, b) => a.threshold - b.threshold);
}

/** Returns the URL for the image at the given threshold. */
function getUrlForThreshold(threshold) {
  buildThresholds();
  const entry = snowThresholds.find((e) => e.threshold === threshold);
  return entry ? entry.url : (snowThresholds[0]?.url ?? null);
}

/**
 * Returns the URL for the mountain image that would be shown at the given snow depth (for save/load).
 */
export function getMountainUrlForSnowDepth(snowDepth) {
  buildThresholds();
  if (snowThresholds.length === 0) return null;
  let chosen = snowThresholds[0].threshold;
  for (const entry of snowThresholds) {
    if (entry.threshold <= snowDepth) chosen = entry.threshold;
    else break;
  }
  return getUrlForThreshold(chosen);
}

/**
 * Compute opacity for layer i (threshold t_i) at snow depth s.
 * Smooth interpolation between consecutive thresholds.
 */
function opacityForLayer(snowDepth, i, thresholds) {
  const n = thresholds.length;
  const t = thresholds[i];
  if (n === 1) return 1;
  if (i === 0) {
    const t1 = thresholds[1];
    if (snowDepth < t) return 1;
    if (snowDepth >= t1) return 0;
    return (t1 - snowDepth) / (t1 - t);
  }
  if (i === n - 1) {
    const tPrev = thresholds[n - 2];
    if (snowDepth < tPrev) return 0;
    if (snowDepth >= t) return 1;
    return (snowDepth - tPrev) / (t - tPrev);
  }
  const tPrev = thresholds[i - 1];
  const tNext = thresholds[i + 1];
  if (snowDepth <= tPrev) return 0;
  if (snowDepth < t) return (snowDepth - tPrev) / (t - tPrev);
  if (snowDepth < tNext) return (tNext - snowDepth) / (tNext - t);
  return 0;
}

/**
 * Ensure the stack container has one img per threshold; create and load if needed.
 */
function ensureMountainStack() {
  buildThresholds();
  const stack = document.getElementById('mountainImageStack');
  if (!stack || snowThresholds.length === 0) return null;
  if (stackBuilt && layerImages.length === snowThresholds.length) return layerImages[0];

  stack.innerHTML = '';
  layerImages = [];
  let firstLoaded = 0;
  const toLoad = snowThresholds.length;

  for (let i = 0; i < snowThresholds.length; i++) {
    const entry = snowThresholds[i];
    const img = new Image();
    img.alt = '';
    img.className = 'mountain-img mountain-layer';
    img.dataset.threshold = String(entry.threshold);
    img.style.opacity = '0';
    stack.appendChild(img);
    layerImages.push(img);
    img.onload = () => {
      firstLoaded += 1;
      if (firstLoaded === toLoad && !state.customMountainUrl) {
        state.image = layerImages[0];
        syncCanvasSize();
        if (DOM.canvas) DOM.canvas.classList.remove('no-image');
      }
    };
    img.onerror = () => {
      img.style.opacity = '0';
      img.style.visibility = 'hidden';
      img.style.pointerEvents = 'none';
    };
    img.src = entry.url;
  }
  stackBuilt = true;
  return layerImages[0];
}

/**
 * Show custom mountain image (uploaded) and hide the snow stack, or show stack and hide custom.
 */
export function setMountainMode(useCustom) {
  const stack = document.getElementById('mountainImageStack');
  const customImg = DOM.mountainImage;
  if (!stack || !customImg) return;
  if (useCustom) {
    stack.hidden = true;
    stack.setAttribute('aria-hidden', 'true');
    customImg.hidden = false;
    customImg.removeAttribute('aria-hidden');
    state.image = customImg;
  } else {
    customImg.hidden = true;
    customImg.setAttribute('aria-hidden', 'true');
    stack.hidden = false;
    stack.removeAttribute('aria-hidden');
    if (layerImages.length > 0) state.image = layerImages[0];
  }
  syncCanvasSize();
}

/**
 * Update mountain display: when using snow layers, set each layer's opacity from current snow depth.
 * No-op if custom mountain image is set.
 */
export function updateMountainImage() {
  if (state.customMountainUrl) return;
  buildThresholds();
  if (snowThresholds.length === 0) return;

  const first = ensureMountainStack();
  if (!first) return;

  const snowDepth = state.snowDepth ?? 0;
  const thresholds = snowThresholds.map((e) => e.threshold);

  for (let i = 0; i < layerImages.length; i++) {
    const opacity = opacityForLayer(snowDepth, i, thresholds);
    layerImages[i].style.opacity = String(Math.max(0, Math.min(1, opacity)));
  }

  if (state.image !== first && !state.customMountainUrl) {
    state.image = first;
    syncCanvasSize();
  }
}
