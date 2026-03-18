/**
 * Canvas size, coordinate conversion, and mouse/click handlers.
 */

import { state, DOM, getSlopeType, getDiffColor } from './state';
import {
  toNormalized,
  fromNormalized,
  getLiftLengthM,
  getSlopePathLengthM,
  getSlopeCost,
} from './geometry.js';
import { refresh, updateBudgetDisplay } from './config.js';
import { formatCurrency, escapeHtml, formatNumber } from './utils.js';
import { updateCancelLiftButton } from './ui/lifts.js';
import { getGroomerImageUrl } from './ui/groomers.js';
import { getSlopeSpritePositionStyle } from './ui/slopes.js';
import { COLS, ROWS } from './constants';
import { getLiftHealthZone, getLiftServiceCost, getLiftEffectiveCapacityMultiplier, getGroomerHealthZone, getGroomerServiceCost, getGroomerEffectiveCapacityMultiplier } from './maintenance_simulator';
import skidollarg2mUrl from '../assets/images/Skidollar_g2m.webp';
import { isBuildableAtImagePoint } from './build-mask';

const PEN_SMOOTH_SAMPLES = 24;
const PEN_MIN_DIST_SQ = 16;
// Snapping distance to connect to nearby lifts/slopes (image px).
// Keep this fairly small so connections look intentional and clean.
const SNAP_DIST_SQ = 28 * 28;
/** Image-space distance threshold (px) to consider cursor over a lift line. */
const LIFT_HOVER_THRESHOLD_SQ = 24 * 24;
/** Image-space radius (px) to consider cursor over a groomer icon. */
const GROOMER_HOVER_RADIUS_SQ = 35 * 35;
/** Image-space distance squared (px) to consider cursor over a slope line. */
const SLOPE_HOVER_THRESHOLD_SQ = 24 * 24;
/** Allow small upward jitter when placing slope points (image px). */
const SLOPE_UPHILL_TOLERANCE_PX = 15;

function isSlopeNonUphill(points) {
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    if (!prev || !cur) continue;
    // y increases downward, so "uphill" means cur.y is smaller than prev.y.
    // We allow a small tolerance to prevent blocking slight upward jitter.
    if (cur.y < prev.y - SLOPE_UPHILL_TOLERANCE_PX) return false;
  }
  return true;
}

function findSlopeConnectionSnapImpl(px, py, minY = -Infinity) {
  /** @type {{x:number,y:number}|null} */
  let best = null;
  let bestDistSq = SNAP_DIST_SQ;

  // Lift stations only (top/bottom endpoints)
  state.lifts.forEach((lift) => {
    const bottom = fromNormalized(lift.bottomStation.x, lift.bottomStation.y);
    const top = fromNormalized(lift.topStation.x, lift.topStation.y);
    for (const p of [top, bottom]) {
      if (p.y < minY) continue;
      const dx = px - p.x;
      const dy = py - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDistSq) {
        bestDistSq = d2;
        best = { x: p.x, y: p.y };
      }
    }
  });

  // Anywhere along existing slopes (snap to visible smoothed curve)
  state.slopes.forEach((slope) => {
    const pts = slope.points.map((p) => fromNormalized(p.x, p.y));
    if (pts.length < 2) return;

    const considerSegment = (ax, ay, bx, by) => {
      const p = closestPointOnSegment(px, py, ax, ay, bx, by);
      if (p.y < minY) return;
      const dx = px - p.x;
      const dy = py - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDistSq) {
        bestDistSq = d2;
        best = { x: p.x, y: p.y };
      }
    };

    if (pts.length === 2) {
      considerSegment(pts[0].x, pts[0].y, pts[1].x, pts[1].y);
      return;
    }

    const STEPS = 10;
    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i];
      const p0 = (i === pts.length - 2) ? p1 : pts[Math.max(0, i - 1)];
      const p2 = pts[i + 1];
      const p3 = (i === pts.length - 3) ? p2 : pts[Math.min(pts.length - 1, i + 2)];
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      let prevX = p1.x;
      let prevY = p1.y;
      for (let s = 1; s <= STEPS; s++) {
        const t = s / STEPS;
        const mt = 1 - t;
        const x =
          mt * mt * mt * p1.x +
          3 * mt * mt * t * cp1x +
          3 * mt * t * t * cp2x +
          t * t * t * p2.x;
        const y =
          mt * mt * mt * p1.y +
          3 * mt * mt * t * cp1y +
          3 * mt * t * t * cp2y +
          t * t * t * p2.y;
        considerSegment(prevX, prevY, x, y);
        prevX = x;
        prevY = y;
      }
    }
  });

  return best;
}

function findSlopeConnectionSnap(px, py) {
  return findSlopeConnectionSnapImpl(px, py);
}

function findSlopeConnectionSnapForEnd(px, py, minY) {
  return findSlopeConnectionSnapImpl(px, py, minY);
}

function setBuildMaskHintPosition(e) {
  const hint = document.getElementById('buildMaskHint');
  if (!hint) return;
  hint.style.left = `${e.clientX}px`;
  hint.style.top = `${e.clientY}px`;
}

function setBuildMaskHint(visible, text) {
  const hint = document.getElementById('buildMaskHint');
  if (!hint) return;
  if (typeof text === 'string') hint.textContent = text;
  hint.classList.toggle('hidden', !visible);
  hint.setAttribute('aria-hidden', visible ? 'false' : 'true');
}

function updateBuildBlockedAtImagePoint(pt) {
  const shouldCheck =
    state.buildArmed &&
    (state.mode === 'lift' ||
      state.mode === 'groomer' ||
      (state.mode === 'slope' && (state.slopeDrawMode === 'points' || state.slopeDrawMode === 'pen')));
  if (!shouldCheck) {
    state.buildBlocked = false;
    setBuildMaskHint(false);
    if (DOM.canvas) DOM.canvas.style.cursor = '';
    return;
  }
  const ok = isBuildableAtImagePoint(pt.x, pt.y);
  state.buildBlocked = !ok;
  if (state.buildBlocked) setBuildMaskHint(true, 'Cannot build here');
  if (DOM.canvas) DOM.canvas.style.cursor = state.buildBlocked ? 'not-allowed' : '';
}

/** True when Invest tab is active; false when Operate (Statistics) tab is active. Building is only allowed in Invest. */
function isInvestTabActive() {
  const panel = document.getElementById('investPanel');
  return panel ? panel.classList.contains('active') : true;
}

/** True when Operate (Statistics) tab is active. Lift hover popup only works in this tab. */
function isOperateTabActive() {
  const panel = document.getElementById('statisticsPanel');
  return panel ? panel.classList.contains('active') : false;
}

export function syncCanvasSize() {
  if (!state.image || !DOM.canvas) return;
  const img = state.image;
  const imgRect = img.getBoundingClientRect();
  const wrapper = DOM.canvas.parentElement;
  const wrapperRect = wrapper ? wrapper.getBoundingClientRect() : null;
  const dpr = window.devicePixelRatio || 1;
  state.imageWidth = img.naturalWidth;
  state.imageHeight = img.naturalHeight;

  /* With object-fit: contain, the image is letterboxed; compute the actual displayed area. */
  const nw = img.naturalWidth || 1;
  const nh = img.naturalHeight || 1;
  const scale = Math.min(imgRect.width / nw, imgRect.height / nh);
  const displayW = nw * scale;
  const displayH = nh * scale;
  const offsetX = (imgRect.width - displayW) / 2;
  const offsetY = (imgRect.height - displayH) / 2;
  const rect = {
    width: displayW,
    height: displayH,
    left: imgRect.left + offsetX,
    top: imgRect.top + offsetY,
  };

  DOM.canvas.width = rect.width * dpr;
  DOM.canvas.height = rect.height * dpr;
  DOM.canvas.style.width = rect.width + 'px';
  DOM.canvas.style.height = rect.height + 'px';
  if (wrapperRect) {
    DOM.canvas.style.left = (rect.left - wrapperRect.left) + 'px';
    DOM.canvas.style.top = (rect.top - wrapperRect.top) + 'px';
  }
  DOM.ctx.scale(dpr, dpr);
  refresh();
}

/** (x, y) are in canvas-relative CSS pixels. Returns image pixel coords. */
export function canvasToImage(x, y) {
  const rect = DOM.canvas.getBoundingClientRect();
  const scaleX = state.imageWidth / rect.width;
  const scaleY = state.imageHeight / rect.height;
  return { x: x * scaleX, y: y * scaleY };
}

/** Image pixel (px, py) to canvas-relative CSS pixels. */
export function imageToCanvas(px, py) {
  const rect = DOM.canvas.getBoundingClientRect();
  const scaleX = rect.width / state.imageWidth;
  const scaleY = rect.height / state.imageHeight;
  return { x: px * scaleX, y: py * scaleY };
}

export function getCanvasPoint(e) {
  const rect = DOM.canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

/** Resample polyline to numSamples points evenly spaced by path length. Smooths jagged pen input. */
export function resamplePolylineByPathLength(points, numSamples) {
  if (points.length < 2) return points;
  if (points.length === 2) return points;
  let totalLen = 0;
  const segLengths = [];
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    const len = Math.sqrt(dx * dx + dy * dy);
    segLengths.push(len);
    totalLen += len;
  }
  if (totalLen === 0) return points;
  const result = [];
  for (let k = 0; k < numSamples; k++) {
    if (k === numSamples - 1) {
      result.push({ x: points[points.length - 1].x, y: points[points.length - 1].y });
      break;
    }
    const frac = k / (numSamples - 1);
    const targetLen = totalLen * frac;
    let acc = 0;
    for (let i = 0; i < segLengths.length; i++) {
      if (acc + segLengths[i] >= targetLen || i === segLengths.length - 1) {
        const t = segLengths[i] === 0 ? 0 : Math.min(1, (targetLen - acc) / segLengths[i]);
        result.push({
          x: points[i].x + t * (points[i + 1].x - points[i].x),
          y: points[i].y + t * (points[i + 1].y - points[i].y),
        });
        break;
      }
      acc += segLengths[i];
    }
  }
  if (result.length === 0) return points;
  return result;
}

export function closestPointOnSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const lenSq = vx * vx + vy * vy;
  if (!lenSq) return { x: ax, y: ay };
  let t = (vx * wx + vy * wy) / lenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return { x: ax + t * vx, y: ay + t * vy };
}

/** Find a snap point (image coords) near lifts or slopes; returns null if nothing is close enough. */
export function findSnapPoint(px, py) {
  let best = null;
  let bestDistSq = SNAP_DIST_SQ;

  state.lifts.forEach((lift) => {
    const a = fromNormalized(lift.bottomStation.x, lift.bottomStation.y);
    const b = fromNormalized(lift.topStation.x, lift.topStation.y);
    const p = closestPointOnSegment(px, py, a.x, a.y, b.x, b.y);
    const dx = px - p.x;
    const dy = py - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestDistSq) {
      bestDistSq = d2;
      best = p;
    }
  });

  state.slopes.forEach((slope) => {
    const pts = slope.points.map((p) => fromNormalized(p.x, p.y));
    if (pts.length < 2) return;

    const considerSegment = (ax, ay, bx, by) => {
      const p = closestPointOnSegment(px, py, ax, ay, bx, by);
      const dx = px - p.x;
      const dy = py - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDistSq) {
        bestDistSq = d2;
        best = p;
      }
    };

    // If the slope is just a straight segment, snap directly.
    if (pts.length === 2) {
      considerSegment(pts[0].x, pts[0].y, pts[1].x, pts[1].y);
      return;
    }

    // Slopes are rendered as smoothed beziers (see drawSmoothCurve). Snap against a sampled
    // approximation of that curve so snapping matches the visible line.
    const STEPS = 10;
    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i];
      const p0 = (i === pts.length - 2) ? p1 : pts[Math.max(0, i - 1)];
      const p2 = pts[i + 1];
      const p3 = (i === pts.length - 3) ? p2 : pts[Math.min(pts.length - 1, i + 2)];
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      let prevX = p1.x;
      let prevY = p1.y;
      for (let s = 1; s <= STEPS; s++) {
        const t = s / STEPS;
        const mt = 1 - t;
        const x =
          mt * mt * mt * p1.x +
          3 * mt * mt * t * cp1x +
          3 * mt * t * t * cp2x +
          t * t * t * p2.x;
        const y =
          mt * mt * mt * p1.y +
          3 * mt * mt * t * cp1y +
          3 * mt * t * t * cp2y +
          t * t * t * p2.y;
        considerSegment(prevX, prevY, x, y);
        prevX = x;
        prevY = y;
      }
    }
  });

  return best;
}

/** Return index of lift at image point (px, py), or null if none within threshold of the lift line. */
function getLiftIndexAtImage(px, py) {
  let bestIdx = null;
  let bestDistSq = LIFT_HOVER_THRESHOLD_SQ;

  state.lifts.forEach((lift, idx) => {
    const a = fromNormalized(lift.bottomStation.x, lift.bottomStation.y);
    const b = fromNormalized(lift.topStation.x, lift.topStation.y);
    const p = closestPointOnSegment(px, py, a.x, a.y, b.x, b.y);
    const dx = px - p.x;
    const dy = py - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestDistSq) {
      bestDistSq = d2;
      bestIdx = idx;
    }
  });

  return bestIdx;
}

/** Return index of groomer at image point (px, py), or -1 if none within radius. */
function getGroomerIndexAtImage(px, py) {
  for (let i = 0; i < state.groomers.length; i++) {
    const g = state.groomers[i];
    const pos = fromNormalized(g.position.x, g.position.y);
    const dx = px - pos.x;
    const dy = py - pos.y;
    if (dx * dx + dy * dy <= GROOMER_HOVER_RADIUS_SQ) return i;
  }
  return -1;
}

/** Return image position of the slope number indicator (circle/diamond) for a slope. */
function getSlopeNumberPosition(slope) {
  if (!slope.points || slope.points.length === 0) return null;
  if (slope.points.length === 1) {
    const only = slope.points[0];
    const p = fromNormalized(only.x, only.y);
    return { x: p.x, y: p.y };
  }
  const pts = slope.points.map((p) => fromNormalized(p.x, p.y));
  const segLengths = [];
  let totalLen = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x;
    const dy = pts[i + 1].y - pts[i].y;
    const len = Math.sqrt(dx * dx + dy * dy);
    segLengths.push(len);
    totalLen += len;
  }
  if (!totalLen) {
    const p0 = pts[0];
    return { x: p0.x, y: p0.y };
  }
  const target = totalLen * 0.5;
  let acc = 0;
  for (let i = 0; i < segLengths.length; i++) {
    const nextAcc = acc + segLengths[i];
    if (target <= nextAcc) {
      const t = (target - acc) / segLengths[i];
      const ax = pts[i].x;
      const ay = pts[i].y;
      const bx = pts[i + 1].x;
      const by = pts[i + 1].y;
      return {
        x: ax + t * (bx - ax),
        y: ay + t * (by - ay),
      };
    }
    acc = nextAcc;
  }
  const plast = pts[pts.length - 1];
  return { x: plast.x, y: plast.y };
}

/** Return index of slope at image point (px, py), or -1 if none. Only hits when over the slope number indicator. */
function getSlopeIndexAtImage(px, py) {
  let bestIdx = -1;
  let bestDistSq = SLOPE_HOVER_THRESHOLD_SQ;
  state.slopes.forEach((slope, idx) => {
    const pos = getSlopeNumberPosition(slope);
    if (!pos) return;
    const dx = px - pos.x;
    const dy = py - pos.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestDistSq) {
      bestDistSq = d2;
      bestIdx = idx;
    }
  });
  return bestIdx;
}

function getSlopePopupHtml(slope, slopeType, lengthM, capacity, slopeIndex) {
  const difficulty = (slopeType && slopeType.difficulty) ? escapeHtml(slopeType.difficulty) : 'Slope';
  const name = difficulty + ' ' + (slopeIndex + 1);
  const lengthStr = lengthM != null ? formatNumber(lengthM) + ' m' : '—';
  const capacityStr = capacity != null ? formatNumber(capacity) : '—';
  const costPerMeter = (slopeType && slopeType.cost_per_meter != null) ? Number(slopeType.cost_per_meter) : 0;
  const buildCost = (lengthM != null && lengthM > 0) ? Math.round(lengthM * costPerMeter) : 0;
  const scrapCost = Math.round(0.1 * buildCost);
  const iconStyle = slopeType ? getSlopeSpritePositionStyle(slopeType) : '';
  const iconClass = 'lift-hover-popup-icon slope-popup-icon slope-type-icon';
  const serviceRow = '<div class="lift-hover-popup-service">' +
    '<button type="button" class="lift-popup-scrap-btn slope-popup-scrap-btn" data-slope-index="' + String(slopeIndex) + '" title="Scrap slope (pay 10% of build cost for disposal)">Scrap: <img src="' + escapeHtml(skidollarg2mUrl) + '" alt="" class="lift-popup-skidollar-icon" /> ' + escapeHtml(formatCurrency(scrapCost)) + '</button>' +
    '</div>';
  return (
    '<button type="button" class="lift-popup-close-btn slope-popup-close-btn" aria-label="Close" title="Close">×</button>' +
    '<div class="' + iconClass + '" style="' + escapeHtml(iconStyle) + '"></div>' +
    '<div class="lift-hover-popup-name slope-popup-name">' + name + '</div>' +
    '<div class="lift-hover-popup-meta">Difficulty: ' + difficulty + '</div>' +
    '<div class="lift-hover-popup-meta">Capacity: ' + capacityStr + '</div>' +
    '<div class="lift-hover-popup-meta">Length: ' + lengthStr + '</div>' +
    serviceRow
  );
}

function getLiftPopupHtml(lift, liftType, lengthM, liftIndex) {
  const name = escapeHtml(lift.name || 'Lift');
  const speedStr = liftType && liftType.speed != null ? formatNumber(liftType.speed) + ' m/s' : '—';
  const lengthStr = lengthM != null ? formatNumber(lengthM) + ' m' : '—';
  const health = Math.max(0, Math.min(100, lift.health ?? 100));
  const healthPct = Math.round(health);
  const reliability = (liftType && liftType.reliability != null) ? Number(liftType.reliability) : 0.85;
  const zone = getLiftHealthZone(health, reliability);
  const isBroken = lift.broken === true;
  const zoneClass = 'lift-hover-popup-health-fill--' + (isBroken ? 'critical' : zone);
  const sprite = state.spriteSheet;
  const src = sprite && sprite.src ? sprite.src : '';
  let iconStyle = 'background-color: rgba(255,255,255,0.06); border-radius: 4px;';
  if (src && liftType != null) {
    const col = (liftType.frame % COLS) / (COLS - 1 || 1) * 100;
    const row = (Math.floor(liftType.frame / COLS) / (ROWS - 1 || 1)) * 100;
    iconStyle = `background-image: url(${escapeHtml(src)}); background-size: ${COLS * 100}% ${ROWS * 100}%; background-position: ${col}% ${row}%; background-repeat: no-repeat;`;
  }
  const baseCost = (liftType && liftType.base_cost != null) ? Number(liftType.base_cost) : 0;
  const costPerMeter = (liftType && liftType.cost_per_meter != null) ? Number(liftType.cost_per_meter) : 0;
  const initialInvestment = baseCost + costPerMeter * (lengthM || 0);
  const repairCost = (isBroken && lift.repairCost != null) ? Number(lift.repairCost) : 0;
  const serviceCost = !isBroken && health < 100 ? getLiftServiceCost(health, initialInvestment, reliability) : 0;
  const saleValue = !isBroken ? Math.round(0.15 * initialInvestment * (health / 100)) : 0;
  const scrapCost = Math.round(0.1 * initialInvestment);
  let serviceRow = '<div class="lift-hover-popup-service">';
  if (isBroken && repairCost > 0) {
    serviceRow += '<button type="button" class="lift-popup-service-btn" data-lift-index="' + String(liftIndex) + '" data-repair="true" title="Repair broken lift">Repair: <img src="' + escapeHtml(skidollarg2mUrl) + '" alt="" class="lift-popup-skidollar-icon" /> ' + escapeHtml(formatCurrency(repairCost)) + '</button>';
  } else if (!isBroken && health < 100 && serviceCost > 0) {
    serviceRow += '<button type="button" class="lift-popup-service-btn" data-lift-index="' + String(liftIndex) + '" title="Restore lift to 100% health">Service: <img src="' + escapeHtml(skidollarg2mUrl) + '" alt="" class="lift-popup-skidollar-icon" /> ' + escapeHtml(formatCurrency(serviceCost)) + '</button>';
  }
  if (!isBroken) {
    serviceRow += '<button type="button" class="lift-popup-sell-btn" data-lift-index="' + String(liftIndex) + '" title="Sell lift (value scales with health)">Sell: <img src="' + escapeHtml(skidollarg2mUrl) + '" alt="" class="lift-popup-skidollar-icon" /> + ' + escapeHtml(formatCurrency(Math.max(0, saleValue))) + '</button>';
  } else {
    serviceRow += '<button type="button" class="lift-popup-scrap-btn" data-lift-index="' + String(liftIndex) + '" title="Scrap broken lift (pay 10% disposal)">Scrap: <img src="' + escapeHtml(skidollarg2mUrl) + '" alt="" class="lift-popup-skidollar-icon" />' + escapeHtml(formatCurrency(scrapCost)) + '</button>';
  }
  serviceRow += '</div>';
  const installedCap = (liftType && liftType.capacity != null) ? Number(liftType.capacity) : 0;
  const effectiveMult = getLiftEffectiveCapacityMultiplier(health, reliability, isBroken);
  const effectiveCap = Math.round(installedCap * effectiveMult);
  const capacityStr = installedCap > 0 ? (formatNumber(effectiveCap) + ' / ' + formatNumber(installedCap)) : '—';
  const purchaseYear = (lift.installedDate && typeof lift.installedDate.year === 'number') ? String(lift.installedDate.year) : '—';
  return (
    '<button type="button" class="lift-popup-close-btn" aria-label="Close" title="Close">×</button>' +
    '<div class="lift-hover-popup-icon" style="' + iconStyle + '"></div>' +
    '<div class="lift-hover-popup-name lift-popup-name-editable" data-lift-index="' + String(liftIndex) + '" title="Click to rename">' + name + '</div>' +
    (isBroken ? '<div class="lift-hover-popup-broken">Broken</div>' : '') +
    '<div class="lift-hover-popup-health" aria-label="Health ' + healthPct + '%">' +
    '<span class="lift-hover-popup-health-label">Health:</span>' +
    '<div class="lift-hover-popup-health-track"><div class="lift-hover-popup-health-fill ' + zoneClass + '" style="width:' + healthPct + '%"></div></div>' +
    '<span class="lift-hover-popup-health-value">' + healthPct + '%</span></div>' +
    '<div class="lift-hover-popup-meta">Purchased: ' + purchaseYear + '</div>' +
    '<div class="lift-hover-popup-meta">Speed: ' + speedStr + '</div>' +
    '<div class="lift-hover-popup-meta">Capacity: ' + capacityStr + '</div>' +
    '<div class="lift-hover-popup-meta">Length: ' + lengthStr + '</div>' +
    serviceRow
  );
}

function getGroomerPopupHtml(groomer, groomerType, groomerIndex) {
  const name = escapeHtml(groomer.name || groomerType?.name || 'Groomer');
  const health = Math.max(0, Math.min(100, groomer.health ?? 100));
  const healthPct = Math.round(health);
  const reliability = (groomerType && groomerType.reliability != null) ? Number(groomerType.reliability) : 0.9;
  const zone = getGroomerHealthZone(health, reliability);
  const isBroken = groomer.broken === true;
  const zoneClass = 'lift-hover-popup-health-fill--' + (isBroken ? 'critical' : zone);
  let iconStyle = 'background-color: rgba(255,255,255,0.06); border-radius: 4px;';
  const imgUrl = groomerType ? getGroomerImageUrl(groomerType) : '';
  if (imgUrl) {
    iconStyle = 'background-image: url(' + escapeHtml(imgUrl) + '); background-size: contain; background-position: center; background-repeat: no-repeat; background-color: rgba(255,255,255,0.06); border-radius: 4px;';
  }
  const purchaseCost = (groomerType && groomerType.purchase_cost != null) ? Number(groomerType.purchase_cost) : 0;
  const repairCost = (isBroken && groomer.repairCost != null) ? Number(groomer.repairCost) : 0;
  const serviceCost = !isBroken && health < 100 ? getGroomerServiceCost(health, purchaseCost, reliability) : 0;
  const saleValue = !isBroken ? Math.round(0.15 * purchaseCost * (health / 100)) : 0;
  const scrapCost = Math.round(0.1 * purchaseCost);
  let serviceRow = '<div class="lift-hover-popup-service">';
  if (isBroken && repairCost > 0) {
    serviceRow += '<button type="button" class="groomer-popup-service-btn" data-groomer-index="' + String(groomerIndex) + '" data-repair="true" title="Repair broken groomer">Repair: <img src="' + escapeHtml(skidollarg2mUrl) + '" alt="" class="lift-popup-skidollar-icon" /> ' + escapeHtml(formatCurrency(repairCost)) + '</button>';
  } else if (!isBroken && health < 100 && serviceCost > 0) {
    serviceRow += '<button type="button" class="groomer-popup-service-btn" data-groomer-index="' + String(groomerIndex) + '" title="Restore groomer to 100% health">Service: <img src="' + escapeHtml(skidollarg2mUrl) + '" alt="" class="lift-popup-skidollar-icon" /> ' + escapeHtml(formatCurrency(serviceCost)) + '</button>';
  }
  if (!isBroken) {
    serviceRow += '<button type="button" class="groomer-popup-sell-btn" data-groomer-index="' + String(groomerIndex) + '" title="Sell groomer (value scales with health)">Sell: <img src="' + escapeHtml(skidollarg2mUrl) + '" alt="" class="lift-popup-skidollar-icon" /> ' + escapeHtml(formatCurrency(Math.max(0, saleValue))) + '</button>';
  } else {
    serviceRow += '<button type="button" class="groomer-popup-scrap-btn" data-groomer-index="' + String(groomerIndex) + '" title="Scrap broken groomer (pay 10% disposal)">Scrap: <img src="' + escapeHtml(skidollarg2mUrl) + '" alt="" class="lift-popup-skidollar-icon" /> −' + escapeHtml(formatCurrency(scrapCost)) + '</button>';
  }
  serviceRow += '</div>';
  const capacity = (groomerType && groomerType.grooming_capacity != null) ? Number(groomerType.grooming_capacity) : 0;
  const effectiveMult = getGroomerEffectiveCapacityMultiplier(health, reliability, isBroken);
  const effectiveCap = Math.round(capacity * effectiveMult);
  const capacityStr = capacity > 0 ? (formatNumber(effectiveCap) + ' / ' + formatNumber(capacity)) : '—';
  const purchaseYear = (groomer.installedDate && typeof groomer.installedDate.year === 'number') ? String(groomer.installedDate.year) : '—';
  return (
    '<button type="button" class="lift-popup-close-btn groomer-popup-close-btn" aria-label="Close" title="Close">×</button>' +
    '<div class="lift-hover-popup-icon groomer-popup-icon" style="' + iconStyle + '"></div>' +
    '<div class="lift-hover-popup-name lift-popup-name-editable groomer-popup-name-editable" data-groomer-index="' + String(groomerIndex) + '" title="Click to rename">' + name + '</div>' +
    (isBroken ? '<div class="lift-hover-popup-broken">Broken</div>' : '') +
    '<div class="lift-hover-popup-health" aria-label="Health ' + healthPct + '%">' +
    '<span class="lift-hover-popup-health-label">Health:</span>' +
    '<div class="lift-hover-popup-health-track"><div class="lift-hover-popup-health-fill ' + zoneClass + '" style="width:' + healthPct + '%"></div></div>' +
    '<span class="lift-hover-popup-health-value">' + healthPct + '%</span></div>' +
    '<div class="lift-hover-popup-meta">Purchased: ' + purchaseYear + '</div>' +
    '<div class="lift-hover-popup-meta">Capacity: ' + capacityStr + '</div>' +
    serviceRow
  );
}

let lastHoveredLiftIndex = null;
let lastHoveredGroomerIndex = null;
let lastHoveredSlopeIndex = null;
let lastHoveredClientX = 0;
let lastHoveredClientY = 0;
let lastHoveredGroomerClientX = 0;
let lastHoveredGroomerClientY = 0;
let lastHoveredSlopeClientX = 0;
let lastHoveredSlopeClientY = 0;
let isPopupPinned = false;
let isGroomerPopupPinned = false;
let isSlopePopupPinned = false;

function updateLiftHoverPopup(liftIndex, clientX, clientY) {
  const popup = document.getElementById('liftHoverPopup');
  if (!popup) return;
  if (!isOperateTabActive()) return;
  if (liftIndex == null || liftIndex < 0 || liftIndex >= state.lifts.length) {
    if (!isPopupPinned) {
      popup.hidden = true;
      popup.setAttribute('aria-hidden', 'true');
      lastHoveredLiftIndex = null;
    }
    return;
  }
  const groomerPopupEl = document.getElementById('groomerHoverPopup');
  const slopePopupEl = document.getElementById('slopeHoverPopup');
  if (groomerPopupEl) {
    groomerPopupEl.hidden = true;
    groomerPopupEl.setAttribute('aria-hidden', 'true');
    lastHoveredGroomerIndex = null;
    isGroomerPopupPinned = false;
  }
  if (slopePopupEl) {
    slopePopupEl.hidden = true;
    slopePopupEl.setAttribute('aria-hidden', 'true');
    lastHoveredSlopeIndex = null;
    isSlopePopupPinned = false;
  }
  lastHoveredLiftIndex = liftIndex;
  lastHoveredClientX = clientX;
  lastHoveredClientY = clientY;
  const lift = state.lifts[liftIndex];
  const liftType = state.liftTypes.find((l) => l.id === lift.type) || state.liftTypes[0];
  const a = fromNormalized(lift.bottomStation.x, lift.bottomStation.y);
  const b = fromNormalized(lift.topStation.x, lift.topStation.y);
  const lengthM = getLiftLengthM(a, b);
  popup.innerHTML = getLiftPopupHtml(lift, liftType, lengthM, liftIndex);
  popup.hidden = false;
  popup.removeAttribute('aria-hidden');
  if (!isPopupPinned) {
    const offsetX = 4;
    const offsetY = 16;
    popup.style.left = (clientX + offsetX) + 'px';
    popup.style.top = (clientY + offsetY) + 'px';
    const rect = popup.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (rect.right > vw) popup.style.left = (clientX - rect.width - offsetX) + 'px';
    if (rect.bottom > vh) popup.style.top = (clientY - rect.height - offsetY) + 'px';
    if (rect.left < 0) popup.style.left = offsetX + 'px';
    if (rect.top < 0) popup.style.top = offsetY + 'px';
  }
}

function updateGroomerHoverPopup(groomerIndex, clientX, clientY) {
  const popup = document.getElementById('groomerHoverPopup');
  if (!popup) return;
  if (!isOperateTabActive()) return;
  if (groomerIndex == null || groomerIndex < 0 || groomerIndex >= state.groomers.length) {
    if (!isGroomerPopupPinned) {
      popup.hidden = true;
      popup.setAttribute('aria-hidden', 'true');
      lastHoveredGroomerIndex = null;
    }
    return;
  }
  const liftPopupEl = document.getElementById('liftHoverPopup');
  const slopePopupEl = document.getElementById('slopeHoverPopup');
  if (liftPopupEl) {
    // Keep the lift popup visible when user pinned it.
    if (!isPopupPinned) {
      liftPopupEl.hidden = true;
      liftPopupEl.setAttribute('aria-hidden', 'true');
      lastHoveredLiftIndex = null;
    }
  }
  if (slopePopupEl) {
    slopePopupEl.hidden = true;
    slopePopupEl.setAttribute('aria-hidden', 'true');
    lastHoveredSlopeIndex = null;
    isSlopePopupPinned = false;
  }
  lastHoveredGroomerIndex = groomerIndex;
  lastHoveredGroomerClientX = clientX;
  lastHoveredGroomerClientY = clientY;
  const groomer = state.groomers[groomerIndex];
  const groomerType = state.groomerTypes.find((t) => t.id === groomer.groomerTypeId) || state.groomerTypes[0];
  popup.innerHTML = getGroomerPopupHtml(groomer, groomerType, groomerIndex);
  popup.hidden = false;
  popup.removeAttribute('aria-hidden');
  if (!isGroomerPopupPinned) {
    const offsetX = 4;
    const offsetY = 16;
    popup.style.left = (clientX + offsetX) + 'px';
    popup.style.top = (clientY + offsetY) + 'px';
    const rect = popup.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (rect.right > vw) popup.style.left = (clientX - rect.width - offsetX) + 'px';
    if (rect.bottom > vh) popup.style.top = (clientY - rect.height - offsetY) + 'px';
    if (rect.left < 0) popup.style.left = offsetX + 'px';
    if (rect.top < 0) popup.style.top = offsetY + 'px';
  }
}

function updateSlopeHoverPopup(slopeIndex, clientX, clientY) {
  const popup = document.getElementById('slopeHoverPopup');
  if (!popup) return;
  if (!isOperateTabActive()) return;
  if (slopeIndex == null || slopeIndex < 0 || slopeIndex >= state.slopes.length) {
    if (!isSlopePopupPinned) {
      popup.hidden = true;
      popup.setAttribute('aria-hidden', 'true');
      lastHoveredSlopeIndex = null;
    }
    return;
  }
  const liftPopupEl = document.getElementById('liftHoverPopup');
  const groomerPopupEl = document.getElementById('groomerHoverPopup');
  if (liftPopupEl) {
    // Keep the lift popup visible when user pinned it.
    if (!isPopupPinned) {
      liftPopupEl.hidden = true;
      liftPopupEl.setAttribute('aria-hidden', 'true');
      lastHoveredLiftIndex = null;
    }
  }
  if (groomerPopupEl) {
    groomerPopupEl.hidden = true;
    groomerPopupEl.setAttribute('aria-hidden', 'true');
    lastHoveredGroomerIndex = null;
    isGroomerPopupPinned = false;
  }
  lastHoveredSlopeIndex = slopeIndex;
  lastHoveredSlopeClientX = clientX;
  lastHoveredSlopeClientY = clientY;
  const slope = state.slopes[slopeIndex];
  const slopeType = getSlopeType(slope);
  const imagePoints = slope.points.map((p) => fromNormalized(p.x, p.y));
  const lengthM = getSlopePathLengthM(imagePoints);
  let capacity = slope.capacity;
  if (capacity == null && slopeType && slopeType.capacity_per_meter != null) {
    capacity = Math.round(lengthM * Number(slopeType.capacity_per_meter));
  }
  popup.innerHTML = getSlopePopupHtml(slope, slopeType, lengthM, capacity, slopeIndex);
  popup.hidden = false;
  popup.removeAttribute('aria-hidden');
  if (!isSlopePopupPinned) {
    const offsetX = 4;
    const offsetY = 16;
    popup.style.left = (clientX + offsetX) + 'px';
    popup.style.top = (clientY + offsetY) + 'px';
    const rect = popup.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (rect.right > vw) popup.style.left = (clientX - rect.width - offsetX) + 'px';
    if (rect.bottom > vh) popup.style.top = (clientY - rect.height - offsetY) + 'px';
    if (rect.left < 0) popup.style.left = offsetX + 'px';
    if (rect.top < 0) popup.style.top = offsetY + 'px';
  }
}

/**
 * Refresh the groomer hover popup content if it is currently visible.
 */
export function refreshGroomerHoverPopupIfOpen() {
  const popup = document.getElementById('groomerHoverPopup');
  if (!popup || popup.hidden || lastHoveredGroomerIndex == null) return;
  updateGroomerHoverPopup(lastHoveredGroomerIndex, lastHoveredGroomerClientX, lastHoveredGroomerClientY);
}

/**
 * Refresh the lift hover popup content if it is currently visible (e.g. after simulation day advance).
 */
export function refreshLiftHoverPopupIfOpen() {
  const popup = document.getElementById('liftHoverPopup');
  if (!popup || popup.hidden || lastHoveredLiftIndex == null) return;
  updateLiftHoverPopup(lastHoveredLiftIndex, lastHoveredClientX, lastHoveredClientY);
}

/**
 * Refresh the slope hover popup content if it is currently visible.
 */
export function refreshSlopeHoverPopupIfOpen() {
  const popup = document.getElementById('slopeHoverPopup');
  if (!popup || popup.hidden || lastHoveredSlopeIndex == null) return;
  updateSlopeHoverPopup(lastHoveredSlopeIndex, lastHoveredSlopeClientX, lastHoveredSlopeClientY);
}

export function hideSlopeHoverPopup() {
  const popup = document.getElementById('slopeHoverPopup');
  if (!popup) return;
  if (!isOperateTabActive() || !isSlopePopupPinned) {
    isSlopePopupPinned = false;
    popup.removeAttribute('data-pinned');
    popup.hidden = true;
    popup.setAttribute('aria-hidden', 'true');
    lastHoveredSlopeIndex = null;
  }
}

/**
 * Handle click on lift popup (close button, pin, or Service button). Use event delegation from document.
 */
export function handleLiftPopupClick(e) {
  const popup = document.getElementById('liftHoverPopup');
  const groomerPopup = document.getElementById('groomerHoverPopup');
  const slopePopup = document.getElementById('slopeHoverPopup');
  if (!isOperateTabActive()) return;
  const insideLiftPopup = popup && popup.contains(e.target);
  const insideGroomerPopup = groomerPopup && groomerPopup.contains(e.target);
  const insideSlopePopup = slopePopup && slopePopup.contains(e.target);
  const clickOnMapArea = e.target && e.target.closest && (e.target.closest('#drawCanvas') || e.target.closest('.canvas-wrapper'));
  if (!insideLiftPopup && !insideGroomerPopup && !insideSlopePopup && !clickOnMapArea) {
    isPopupPinned = false;
    isGroomerPopupPinned = false;
    isSlopePopupPinned = false;
    if (popup) { popup.removeAttribute('data-pinned'); popup.hidden = true; popup.setAttribute('aria-hidden', 'true'); }
    if (groomerPopup) { groomerPopup.removeAttribute('data-pinned'); groomerPopup.hidden = true; groomerPopup.setAttribute('aria-hidden', 'true'); }
    if (slopePopup) { slopePopup.removeAttribute('data-pinned'); slopePopup.hidden = true; slopePopup.setAttribute('aria-hidden', 'true'); }
    lastHoveredLiftIndex = null;
    lastHoveredGroomerIndex = null;
    lastHoveredSlopeIndex = null;
    return;
  }
  if (!popup || popup.hidden) return;
  const isInsidePopup = popup.contains(e.target);

  if (e.target && e.target.closest && e.target.closest('.lift-popup-close-btn')) {
    e.preventDefault();
    e.stopPropagation();
    isPopupPinned = false;
    popup.removeAttribute('data-pinned');
    popup.hidden = true;
    popup.setAttribute('aria-hidden', 'true');
    lastHoveredLiftIndex = null;
    return;
  }

  const nameEl = e.target && e.target.closest && e.target.closest('.lift-popup-name-editable');
  if (nameEl) {
    e.preventDefault();
    e.stopPropagation();
    const idx = parseInt(nameEl.getAttribute('data-lift-index'), 10);
    if (!Number.isNaN(idx) && idx >= 0 && idx < state.lifts.length) {
      const lift = state.lifts[idx];
      const current = (lift && (lift.name || `Lift ${idx + 1}`)) || `Lift ${idx + 1}`;
      const newName = window.prompt('Lift name', current);
      if (newName !== null && lift) {
        lift.name = newName.trim() || `Lift ${idx + 1}`;
        refresh();
        refreshLiftHoverPopupIfOpen();
      }
    }
    return;
  }

  if (isInsidePopup) {
    e.preventDefault();
    e.stopPropagation();
    if (!isPopupPinned) {
      isPopupPinned = true;
      popup.setAttribute('data-pinned', 'true');
    }
  }

  const sellBtn = e.target && e.target.closest && e.target.closest('.lift-popup-sell-btn');
  if (sellBtn) {
    e.preventDefault();
    e.stopPropagation();
    const idx = parseInt(sellBtn.getAttribute('data-lift-index'), 10);
    if (!Number.isNaN(idx) && idx >= 0 && idx < state.lifts.length) {
      const lift = state.lifts[idx];
      const liftType = state.liftTypes.find((l) => l.id === lift.type) || state.liftTypes[0];
      const a = fromNormalized(lift.bottomStation.x, lift.bottomStation.y);
      const b = fromNormalized(lift.topStation.x, lift.topStation.y);
      const lengthM = getLiftLengthM(a, b);
      const baseCost = (liftType && liftType.base_cost != null) ? Number(liftType.base_cost) : 0;
      const costPerMeter = (liftType && liftType.cost_per_meter != null) ? Number(liftType.cost_per_meter) : 0;
      const initialInvestment = baseCost + costPerMeter * lengthM;
      const health = Math.max(0, Math.min(100, lift.health ?? 100));
      const saleValue = Math.round(0.15 * initialInvestment * (health / 100));
      if (!window.confirm(`Sell this lift for ${formatCurrency(saleValue)}?`)) return;
      state.budget += saleValue;
      state.lifts.splice(idx, 1);
      updateBudgetDisplay();
      isPopupPinned = false;
      popup.removeAttribute('data-pinned');
      popup.hidden = true;
      popup.setAttribute('aria-hidden', 'true');
      lastHoveredLiftIndex = null;
      refresh();
    }
    return;
  }

  const scrapBtn = e.target && e.target.closest && e.target.closest('.lift-popup-scrap-btn');
  if (scrapBtn) {
    e.preventDefault();
    e.stopPropagation();
    const idx = parseInt(scrapBtn.getAttribute('data-lift-index'), 10);
    if (!Number.isNaN(idx) && idx >= 0 && idx < state.lifts.length) {
      const lift = state.lifts[idx];
      const liftType = state.liftTypes.find((l) => l.id === lift.type) || state.liftTypes[0];
      const a = fromNormalized(lift.bottomStation.x, lift.bottomStation.y);
      const b = fromNormalized(lift.topStation.x, lift.topStation.y);
      const lengthM = getLiftLengthM(a, b);
      const baseCost = (liftType && liftType.base_cost != null) ? Number(liftType.base_cost) : 0;
      const costPerMeter = (liftType && liftType.cost_per_meter != null) ? Number(liftType.cost_per_meter) : 0;
      const initialInvestment = baseCost + costPerMeter * lengthM;
      const scrapCost = Math.round(0.1 * initialInvestment);
      if (state.budget < scrapCost) {
        window.alert(`Not enough budget to scrap this lift. Disposal cost: ${formatCurrency(scrapCost)}. Available: ${formatCurrency(state.budget)}.`);
        return;
      }
      if (!window.confirm(`Scrap this broken lift? You will pay ${formatCurrency(scrapCost)} for disposal.`)) return;
      state.budget -= scrapCost;
      state.lifts.splice(idx, 1);
      updateBudgetDisplay();
      isPopupPinned = false;
      popup.removeAttribute('data-pinned');
      popup.hidden = true;
      popup.setAttribute('aria-hidden', 'true');
      lastHoveredLiftIndex = null;
      refresh();
    }
    return;
  }

  const btn = e.target && e.target.closest && e.target.closest('.lift-popup-service-btn');
  if (!btn) return;
  const idx = parseInt(btn.getAttribute('data-lift-index'), 10);
  if (Number.isNaN(idx) || idx < 0 || idx >= state.lifts.length) return;
  const lift = state.lifts[idx];
  const isRepair = lift.broken === true;
  let cost = 0;
  if (isRepair) {
    cost = (lift.repairCost != null) ? Number(lift.repairCost) : 0;
    if (cost <= 0) return;
    if (state.budget < cost) {
      window.alert(`Not enough budget to repair this lift. Cost: ${formatCurrency(cost)}. Available: ${formatCurrency(state.budget)}.`);
      return;
    }
    state.budget -= cost;
    lift.broken = false;
    lift.repairCost = undefined;
    lift.health = 100;
  } else {
    const liftType = state.liftTypes.find((l) => l.id === lift.type) || state.liftTypes[0];
    const a = fromNormalized(lift.bottomStation.x, lift.bottomStation.y);
    const b = fromNormalized(lift.topStation.x, lift.topStation.y);
    const lengthM = getLiftLengthM(a, b);
    const baseCost = (liftType && liftType.base_cost != null) ? Number(liftType.base_cost) : 0;
    const costPerMeter = (liftType && liftType.cost_per_meter != null) ? Number(liftType.cost_per_meter) : 0;
    const initialInvestment = baseCost + costPerMeter * lengthM;
    const health = Math.max(0, Math.min(100, lift.health ?? 100));
    const reliability = (liftType && liftType.reliability != null) ? Number(liftType.reliability) : 0.85;
    cost = getLiftServiceCost(health, initialInvestment, reliability);
    if (cost <= 0) return;
    if (state.budget < cost) {
      window.alert(`Not enough budget to service this lift. Cost: ${formatCurrency(cost)}. Available: ${formatCurrency(state.budget)}.`);
      return;
    }
    state.budget -= cost;
    lift.health = 100;
  }
  updateBudgetDisplay();
  isPopupPinned = false;
  popup.removeAttribute('data-pinned');
  popup.hidden = true;
  popup.setAttribute('aria-hidden', 'true');
  lastHoveredLiftIndex = null;
  refresh();
}

/**
 * Handle click on groomer popup (close, rename, service, repair). Use event delegation from document.
 */
export function handleGroomerPopupClick(e) {
  const popup = document.getElementById('groomerHoverPopup');
  const liftPopup = document.getElementById('liftHoverPopup');
  if (!isOperateTabActive()) return;
  const slopePopup = document.getElementById('slopeHoverPopup');
  const insideLiftPopup = liftPopup && liftPopup.contains(e.target);
  const insideGroomerPopup = popup && popup.contains(e.target);
  const insideSlopePopup = slopePopup && slopePopup.contains(e.target);
  const clickOnMapArea = e.target && e.target.closest && (e.target.closest('#drawCanvas') || e.target.closest('.canvas-wrapper'));
  if (!insideLiftPopup && !insideGroomerPopup && !insideSlopePopup && !clickOnMapArea) {
    isPopupPinned = false;
    isGroomerPopupPinned = false;
    isSlopePopupPinned = false;
    if (liftPopup) { liftPopup.removeAttribute('data-pinned'); liftPopup.hidden = true; liftPopup.setAttribute('aria-hidden', 'true'); }
    if (popup) { popup.removeAttribute('data-pinned'); popup.hidden = true; popup.setAttribute('aria-hidden', 'true'); }
    if (slopePopup) { slopePopup.removeAttribute('data-pinned'); slopePopup.hidden = true; slopePopup.setAttribute('aria-hidden', 'true'); }
    lastHoveredLiftIndex = null;
    lastHoveredGroomerIndex = null;
    lastHoveredSlopeIndex = null;
    return;
  }
  if (!popup || popup.hidden) return;

  if (e.target && e.target.closest && e.target.closest('.groomer-popup-close-btn')) {
    e.preventDefault();
    e.stopPropagation();
    isGroomerPopupPinned = false;
    popup.removeAttribute('data-pinned');
    popup.hidden = true;
    popup.setAttribute('aria-hidden', 'true');
    lastHoveredGroomerIndex = null;
    return;
  }

  const nameEl = e.target && e.target.closest && e.target.closest('.groomer-popup-name-editable');
  if (nameEl) {
    e.preventDefault();
    e.stopPropagation();
    const idx = parseInt(nameEl.getAttribute('data-groomer-index'), 10);
    if (!Number.isNaN(idx) && idx >= 0 && idx < state.groomers.length) {
      const groomer = state.groomers[idx];
      const typeLabel = state.groomerTypes.find((t) => t.id === groomer.groomerTypeId)?.name || 'Groomer';
      const current = groomer.name || typeLabel + ' ' + (idx + 1);
      const newName = window.prompt('Groomer name', current);
      if (newName !== null && groomer) {
        groomer.name = newName.trim() || (typeLabel + ' ' + (idx + 1));
        refresh();
        refreshGroomerHoverPopupIfOpen();
      }
    }
    return;
  }

  if (popup.contains(e.target)) {
    e.preventDefault();
    e.stopPropagation();
    if (!isGroomerPopupPinned) {
      isGroomerPopupPinned = true;
      popup.setAttribute('data-pinned', 'true');
    }
  }

  const sellBtn = e.target && e.target.closest && e.target.closest('.groomer-popup-sell-btn');
  if (sellBtn) {
    e.preventDefault();
    e.stopPropagation();
    const idx = parseInt(sellBtn.getAttribute('data-groomer-index'), 10);
    if (!Number.isNaN(idx) && idx >= 0 && idx < state.groomers.length) {
      const groomer = state.groomers[idx];
      const groomerType = state.groomerTypes.find((t) => t.id === groomer.groomerTypeId);
      const purchaseCost = (groomerType && groomerType.purchase_cost != null) ? Number(groomerType.purchase_cost) : 0;
      const health = Math.max(0, Math.min(100, groomer.health ?? 100));
      const saleValue = Math.round(0.15 * purchaseCost * (health / 100));
      if (!window.confirm(`Sell this groomer for ${formatCurrency(saleValue)}?`)) return;
      state.budget += saleValue;
      state.groomers.splice(idx, 1);
      updateBudgetDisplay();
      isGroomerPopupPinned = false;
      popup.removeAttribute('data-pinned');
      popup.hidden = true;
      popup.setAttribute('aria-hidden', 'true');
      lastHoveredGroomerIndex = null;
      refresh();
    }
    return;
  }

  const scrapBtn = e.target && e.target.closest && e.target.closest('.groomer-popup-scrap-btn');
  if (scrapBtn) {
    e.preventDefault();
    e.stopPropagation();
    const idx = parseInt(scrapBtn.getAttribute('data-groomer-index'), 10);
    if (!Number.isNaN(idx) && idx >= 0 && idx < state.groomers.length) {
      const groomer = state.groomers[idx];
      const groomerType = state.groomerTypes.find((t) => t.id === groomer.groomerTypeId);
      const purchaseCost = (groomerType && groomerType.purchase_cost != null) ? Number(groomerType.purchase_cost) : 0;
      const scrapCost = Math.round(0.1 * purchaseCost);
      if (state.budget < scrapCost) {
        window.alert(`Not enough budget to scrap this groomer. Disposal cost: ${formatCurrency(scrapCost)}. Available: ${formatCurrency(state.budget)}.`);
        return;
      }
      if (!window.confirm(`Scrap this broken groomer? You will pay ${formatCurrency(scrapCost)} for disposal.`)) return;
      state.budget -= scrapCost;
      state.groomers.splice(idx, 1);
      updateBudgetDisplay();
      isGroomerPopupPinned = false;
      popup.removeAttribute('data-pinned');
      popup.hidden = true;
      popup.setAttribute('aria-hidden', 'true');
      lastHoveredGroomerIndex = null;
      refresh();
    }
    return;
  }

  const btn = e.target && e.target.closest && e.target.closest('.groomer-popup-service-btn');
  if (!btn) return;
  const idx = parseInt(btn.getAttribute('data-groomer-index'), 10);
  if (Number.isNaN(idx) || idx < 0 || idx >= state.groomers.length) return;
  const groomer = state.groomers[idx];
  const groomerType = state.groomerTypes.find((t) => t.id === groomer.groomerTypeId);
  const purchaseCost = (groomerType && groomerType.purchase_cost != null) ? Number(groomerType.purchase_cost) : 0;
  const isRepair = groomer.broken === true;
  let cost = 0;
  if (isRepair) {
    cost = (groomer.repairCost != null) ? Number(groomer.repairCost) : 0;
    if (cost <= 0) return;
    if (state.budget < cost) {
      window.alert(`Not enough budget to repair this groomer. Cost: ${formatCurrency(cost)}. Available: ${formatCurrency(state.budget)}.`);
      return;
    }
    state.budget -= cost;
    groomer.broken = false;
    groomer.repairCost = undefined;
    groomer.health = 100;
  } else {
    const health = Math.max(0, Math.min(100, groomer.health ?? 100));
    const reliability = (groomerType && groomerType.reliability != null) ? Number(groomerType.reliability) : 0.9;
    cost = getGroomerServiceCost(health, purchaseCost, reliability);
    if (cost <= 0) return;
    if (state.budget < cost) {
      window.alert(`Not enough budget to service this groomer. Cost: ${formatCurrency(cost)}. Available: ${formatCurrency(state.budget)}.`);
      return;
    }
    state.budget -= cost;
    groomer.health = 100;
  }
  updateBudgetDisplay();
  isGroomerPopupPinned = false;
  popup.removeAttribute('data-pinned');
  popup.hidden = true;
  popup.setAttribute('aria-hidden', 'true');
  lastHoveredGroomerIndex = null;
  refresh();
}

/**
 * Handle click on slope popup (close button or pin). Use event delegation from document.
 */
export function handleSlopePopupClick(e) {
  const popup = document.getElementById('slopeHoverPopup');
  if (!popup || popup.hidden) return;
  if (!isOperateTabActive()) return;
  const insideSlopePopup = popup && popup.contains(e.target);
  if (!insideSlopePopup) return;

  if (e.target && e.target.closest && e.target.closest('.slope-popup-close-btn')) {
    e.preventDefault();
    e.stopPropagation();
    isSlopePopupPinned = false;
    popup.removeAttribute('data-pinned');
    popup.hidden = true;
    popup.setAttribute('aria-hidden', 'true');
    lastHoveredSlopeIndex = null;
    return;
  }

  const scrapBtn = e.target && e.target.closest && e.target.closest('.slope-popup-scrap-btn');
  if (scrapBtn) {
    e.preventDefault();
    e.stopPropagation();
    const idx = parseInt(scrapBtn.getAttribute('data-slope-index'), 10);
    if (!Number.isNaN(idx) && idx >= 0 && idx < state.slopes.length) {
      const slope = state.slopes[idx];
      const slopeType = getSlopeType(slope);
      const imagePoints = slope.points.map((p) => fromNormalized(p.x, p.y));
      const lengthM = getSlopePathLengthM(imagePoints);
      const costPerMeter = (slopeType && slopeType.cost_per_meter != null) ? Number(slopeType.cost_per_meter) : 0;
      const buildCost = (lengthM != null && lengthM > 0) ? Math.round(lengthM * costPerMeter) : 0;
      const scrapCost = Math.round(0.1 * buildCost);
      if (state.budget < scrapCost) {
        window.alert('Not enough budget to scrap this slope. Disposal cost: ' + formatCurrency(scrapCost) + '. Available: ' + formatCurrency(state.budget) + '.');
        return;
      }
      if (!window.confirm('Scrap this slope? You will pay ' + formatCurrency(scrapCost) + ' for disposal (10% of build cost).')) return;
      state.budget -= scrapCost;
      state.slopes.splice(idx, 1);
      updateBudgetDisplay();
      isSlopePopupPinned = false;
      popup.removeAttribute('data-pinned');
      popup.hidden = true;
      popup.setAttribute('aria-hidden', 'true');
      lastHoveredSlopeIndex = null;
      refresh();
    }
    return;
  }

  e.preventDefault();
  e.stopPropagation();
  if (!isSlopePopupPinned) {
    isSlopePopupPinned = true;
    popup.setAttribute('data-pinned', 'true');
  }
}

/**
 * Pin the lift popup so it stops following the cursor. Call when the cursor enters the popup
 * so the user can click the Service button without the menu moving away.
 */
export function pinLiftPopup() {
  const popup = document.getElementById('liftHoverPopup');
  if (popup && !popup.hidden && lastHoveredLiftIndex != null) {
    isPopupPinned = true;
    popup.setAttribute('data-pinned', 'true');
  }
}

export function hideLiftHoverPopup() {
  const popup = document.getElementById('liftHoverPopup');
  if (!popup) return;
  if (!isOperateTabActive() || !isPopupPinned) {
    isPopupPinned = false;
    popup.removeAttribute('data-pinned');
    popup.hidden = true;
    popup.setAttribute('aria-hidden', 'true');
    lastHoveredLiftIndex = null;
  }
}

export function hideGroomerHoverPopup() {
  const popup = document.getElementById('groomerHoverPopup');
  if (!popup) return;
  if (!isOperateTabActive() || !isGroomerPopupPinned) {
    isGroomerPopupPinned = false;
    popup.removeAttribute('data-pinned');
    popup.hidden = true;
    popup.setAttribute('aria-hidden', 'true');
    lastHoveredGroomerIndex = null;
  }
}

export function onCanvasMouseDown(e) {
  if (!state.image || state.mode !== 'slope' || state.slopeDrawMode !== 'pen') return;
  if (!state.buildArmed) return;
  const { x, y } = getCanvasPoint(e);
  const pt = canvasToImage(x, y);
  setBuildMaskHintPosition(e);
  updateBuildBlockedAtImagePoint(pt);
  if (state.buildBlocked) return;
  const snap = findSlopeConnectionSnap(pt.x, pt.y);
  if (!snap) return;
  pt.x = snap.x;
  pt.y = snap.y;
  state.slopePoints = [{ x: pt.x, y: pt.y }];
  state.penDrawing = true;
  document.getElementById('cancelSlopeBtn').classList.remove('hidden');
  refresh();
}

export function onCanvasMouseMove(e) {
  if (!state.image) return;
  const { x, y } = getCanvasPoint(e);
  const pt = canvasToImage(x, y);
  setBuildMaskHintPosition(e);
  updateBuildBlockedAtImagePoint(pt);

  // Before placing the first slope point (points mode), show a start-area hint if not near a snap target.
  if (
    !state.buildBlocked &&
    state.buildArmed &&
    state.mode === 'slope' &&
    state.slopeDrawMode === 'points' &&
    state.slopePoints.length === 0
  ) {
    const snap = findSlopeConnectionSnap(pt.x, pt.y);
    if (!snap) {
      setBuildMaskHint(true, 'Slope must start at a lift station or on an existing slope');
    } else {
      setBuildMaskHint(false);
    }
  } else if (!state.buildBlocked) {
    // If we're not blocked by mask and not in the slope-start case, hide the hint.
    setBuildMaskHint(false);
  }

  // Build-mode previews / ghosts
  if (state.buildArmed && state.mode === 'lift') {
    state.mouseImage = { x: pt.x, y: pt.y };
    refresh();
    hideLiftHoverPopup();
    return;
  }
  if (state.buildArmed && (state.mode === 'groomer' || (state.mode === 'slope' && state.slopeDrawMode === 'points' && !state.penDrawing))) {
    state.mouseImage = { x: pt.x, y: pt.y };
    refresh();
    hideLiftHoverPopup();
    hideGroomerHoverPopup();
    hideSlopeHoverPopup();
    return;
  }
  if (state.penDrawing) {
    if (state.buildBlocked) return;
    const last = state.slopePoints[state.slopePoints.length - 1];
    if (last) {
      const dx = pt.x - last.x;
      const dy = pt.y - last.y;
      if (dx * dx + dy * dy < PEN_MIN_DIST_SQ) return;
      if (pt.y < last.y - SLOPE_UPHILL_TOLERANCE_PX) return;
    }
    state.slopePoints.push({ x: pt.x, y: pt.y });
    refresh();
    return;
  }
  if (!isOperateTabActive()) {
    hideLiftHoverPopup();
    hideGroomerHoverPopup();
    hideSlopeHoverPopup();
    return;
  }
  if (isPopupPinned && isGroomerPopupPinned && isSlopePopupPinned) return;
  const groomerIdx = getGroomerIndexAtImage(pt.x, pt.y);
  if (groomerIdx >= 0 && !isGroomerPopupPinned) {
    updateGroomerHoverPopup(groomerIdx, e.clientX, e.clientY);
    if (!isPopupPinned) {
      const liftPopup = document.getElementById('liftHoverPopup');
      if (liftPopup) { liftPopup.hidden = true; liftPopup.setAttribute('aria-hidden', 'true'); lastHoveredLiftIndex = null; }
    }
    const slopePopupEl = document.getElementById('slopeHoverPopup');
    if (slopePopupEl) { slopePopupEl.hidden = true; slopePopupEl.setAttribute('aria-hidden', 'true'); lastHoveredSlopeIndex = null; }
    return;
  }
  if (isGroomerPopupPinned) return;
  /* When not over a groomer, hide groomer popup so it closes as cursor moves off */
  updateGroomerHoverPopup(-1, e.clientX, e.clientY);
  const slopeIdx = getSlopeIndexAtImage(pt.x, pt.y);
  if (slopeIdx >= 0 && !isSlopePopupPinned) {
    // Do not show a slope popup while a lift popup is pinned.
    if (isPopupPinned) {
      hideSlopeHoverPopup();
      return;
    }

    updateSlopeHoverPopup(slopeIdx, e.clientX, e.clientY);
    const liftPopup = document.getElementById('liftHoverPopup');
    if (liftPopup) { liftPopup.hidden = true; liftPopup.setAttribute('aria-hidden', 'true'); lastHoveredLiftIndex = null; }
    return;
  }
  if (isSlopePopupPinned) return;
  const liftIdx = getLiftIndexAtImage(pt.x, pt.y);
  updateLiftHoverPopup(liftIdx, e.clientX, e.clientY);
  const slopePopupEl = document.getElementById('slopeHoverPopup');
  if (!isPopupPinned && slopePopupEl) {
    isSlopePopupPinned = false;
    slopePopupEl.removeAttribute('data-pinned');
    slopePopupEl.hidden = true;
    slopePopupEl.setAttribute('aria-hidden', 'true');
    lastHoveredSlopeIndex = null;
  }
  if (liftIdx < 0 && !isPopupPinned) {
    const groomerPopup = document.getElementById('groomerHoverPopup');
    if (groomerPopup) { groomerPopup.hidden = true; groomerPopup.setAttribute('aria-hidden', 'true'); lastHoveredGroomerIndex = null; }
  }
}

export function onCanvasMouseUp() {
  if (!state.penDrawing || !state.image) return;
  state.penDrawing = false;
  if (state.slopePoints.length >= 2) {
    // Validate endpoints BEFORE smoothing, so we don't mutate the path if it can't be placed.
    const rawFirst = state.slopePoints[0];
    const rawLast = state.slopePoints[state.slopePoints.length - 1];
    const rawPrev = state.slopePoints[state.slopePoints.length - 2];
    const snapStart = rawFirst ? findSlopeConnectionSnap(rawFirst.x, rawFirst.y) : null;
    const snapEndAny = rawLast ? findSlopeConnectionSnap(rawLast.x, rawLast.y) : null;
    const snapEnd = (rawLast && rawPrev) ? findSlopeConnectionSnapForEnd(rawLast.x, rawLast.y, rawPrev.y) : snapEndAny;
    if (!snapStart || !snapEnd) {
      if (rawPrev && snapEndAny && snapEndAny.y < rawPrev.y - SLOPE_UPHILL_TOLERANCE_PX) {
        window.alert('Slope end point must not be higher than the previous point.');
      } else {
      window.alert('Slope must start/end at a lift station or on an existing slope.');
      }
      state.slopePoints = [];
      document.getElementById('cancelSlopeBtn').classList.add('hidden');
      refresh();
      return;
    }

    let pts = resamplePolylineByPathLength(state.slopePoints, PEN_SMOOTH_SAMPLES);
    const first = pts[0];
    const last = pts[pts.length - 1];
    first.x = snapStart.x;
    first.y = snapStart.y;
    last.x = snapEnd.x;
    last.y = snapEnd.y;
    if (!isSlopeNonUphill(pts)) {
      window.alert('Slope cannot go uphill. Each point must be same height or lower than the previous one.');
      state.slopePoints = [];
      document.getElementById('cancelSlopeBtn').classList.add('hidden');
      refresh();
      return;
    }
    const lengthM = getSlopePathLengthM(pts);
    const totalCost = getSlopeCost(lengthM);
    if (state.budget < totalCost) {
      window.alert(`Not enough budget to build this slope. Cost: ${formatCurrency(totalCost)}. Available: ${formatCurrency(state.budget)}.`);
      state.slopePoints = [];
      document.getElementById('cancelSlopeBtn').classList.add('hidden');
      refresh();
      return;
    }
    state.budget -= totalCost;
    const slopeType = getSlopeType(state.difficulty);
    const capacityPerMeter = slopeType && slopeType.capacity_per_meter != null ? Number(slopeType.capacity_per_meter) : 0;
    const capacity = Math.round(lengthM * capacityPerMeter);
    state.slopes.push({
      slopeTypeId: state.difficulty,
      points: pts.map((p) => toNormalized(p.x, p.y)),
      capacity,
    });
    refresh();
  }
  state.slopePoints = [];
  document.getElementById('cancelSlopeBtn').classList.add('hidden');
  state.buildArmed = false;
  state.mouseImage = null;
  document.getElementById('cancelBuildBtn')?.classList.add('hidden');
  refresh();
}

export function onCanvasClick(e) {
  if (!state.image) return;
  const { x, y } = getCanvasPoint(e);

  if (isOperateTabActive()) {
    const pt = canvasToImage(x, y);
    const groomerIdx = getGroomerIndexAtImage(pt.x, pt.y);
    const slopeIdx = getSlopeIndexAtImage(pt.x, pt.y);
    const liftIdx = getLiftIndexAtImage(pt.x, pt.y);
    const placingLiftTop = state.mode === 'lift' && state.liftBottom && !state.liftTop;
    const groomerPopup = document.getElementById('groomerHoverPopup');
    if (groomerPopup && !groomerPopup.hidden && !isGroomerPopupPinned && groomerIdx >= 0) {
      isGroomerPopupPinned = true;
      groomerPopup.setAttribute('data-pinned', 'true');
      e.stopPropagation();
      return;
    }
    const slopePopup = document.getElementById('slopeHoverPopup');
    if (slopePopup && !slopePopup.hidden && !isSlopePopupPinned && slopeIdx >= 0) {
      isSlopePopupPinned = true;
      slopePopup.setAttribute('data-pinned', 'true');
      e.stopPropagation();
      return;
    }
    const popup = document.getElementById('liftHoverPopup');
    if (popup && !popup.hidden && !isPopupPinned && liftIdx >= 0 && !placingLiftTop) {
      isPopupPinned = true;
      popup.setAttribute('data-pinned', 'true');
      e.stopPropagation();
      return;
    }
    if (liftIdx < 0 && groomerIdx < 0 && slopeIdx < 0) {
      hideLiftHoverPopup();
      hideGroomerHoverPopup();
      hideSlopeHoverPopup();
    }
  }

  const hoverPt = canvasToImage(x, y);
  setBuildMaskHintPosition(e);
  updateBuildBlockedAtImagePoint(hoverPt);
  if (state.buildBlocked && (state.mode === 'lift' || state.mode === 'groomer' || state.mode === 'slope')) {
    refresh();
    return;
  }

  const isBuildMode = state.mode === 'lift' || state.mode === 'cottage' || state.mode === 'groomer' || (state.mode === 'slope' && state.slopeDrawMode === 'points');
  if (isBuildMode && !state.buildArmed) return;

  if (state.mode === 'lift') {
    const pt = canvasToImage(x, y);
    const norm = toNormalized(pt.x, pt.y);
    if (!state.liftBottom) {
      state.liftBottom = { x: pt.x, y: pt.y, norm };
      state.mouseImage = null;
      updateCancelLiftButton();
    } else if (!state.liftTop) {
      if (pt.y >= state.liftBottom.y) {
        window.alert('Top station must be higher than bottom station.');
        refresh();
        return;
      }
      const lengthM = getLiftLengthM(state.liftBottom, pt);
      const typeId = state.liftType || (state.liftTypes[0] && state.liftTypes[0].id);
      const liftDef = state.liftTypes.find((l) => l.id === typeId);
      const maxLength = (liftDef && liftDef.max_length != null) ? liftDef.max_length : Infinity;
      if (lengthM > maxLength) {
        window.alert(`Line is too long for this lift type. Maximum length: ${maxLength} m. Calculated: ${lengthM} m.`);
        refresh();
        return;
      }
      const baseCost = (liftDef && liftDef.base_cost != null) ? Number(liftDef.base_cost) : 0;
      const costPerMeter = (liftDef && liftDef.cost_per_meter != null) ? Number(liftDef.cost_per_meter) : 0;
      const totalCost = Math.round(baseCost + lengthM * costPerMeter);
      if (state.budget < totalCost) {
        window.alert(`Not enough budget to build this lift. Cost: ${formatCurrency(totalCost)}. Available: ${formatCurrency(state.budget)}.`);
        refresh();
        return;
      }
      state.liftTop = { x: pt.x, y: pt.y, norm };
      state.budget -= totalCost;
      const nextNum = state.lifts.length + 1;
      state.lifts.push({
        bottomStation: state.liftBottom.norm,
        topStation: state.liftTop.norm,
        type: typeId,
        name: `Lift ${nextNum}`,
        health: 100,
        installedDate: { ...state.currentDate },
      });
      state.liftBottom = null;
      state.liftTop = null;
      updateCancelLiftButton();
      if (typeof window.liftDetailSetBlank === 'function') window.liftDetailSetBlank();
      state.buildArmed = false;
      state.mouseImage = null;
      document.getElementById('cancelBuildBtn')?.classList.add('hidden');
    }
  } else if (state.mode === 'cottage') {
    const pt = canvasToImage(x, y);
    const norm = toNormalized(pt.x, pt.y);
    const nextNum = state.cottages.length + 1;
    const name = window.prompt('Cottage name (optional)', `Cottage ${nextNum}`) || `Cottage ${nextNum}`;
    state.cottages.push({ position: norm, name: name.trim() || `Cottage ${nextNum}` });
    state.buildArmed = false;
    state.mouseImage = null;
  } else if (state.mode === 'groomer') {
    const pt = canvasToImage(x, y);
    const norm = toNormalized(pt.x, pt.y);
    const typeId = state.groomerType || (state.groomerTypes[0] && state.groomerTypes[0].id);
    const groomerDef = state.groomerTypes.find((g) => g.id === typeId);
    const cost = (groomerDef && groomerDef.purchase_cost != null) ? Number(groomerDef.purchase_cost) : 0;
    if (state.budget < cost) {
      window.alert(`Not enough budget to buy this groomer. Cost: ${formatCurrency(cost)}. Available: ${formatCurrency(state.budget)}.`);
      refresh();
      return;
    }
    state.budget -= cost;
    const nextNum = state.groomers.length + 1;
    state.groomers.push({
      position: norm,
      groomerTypeId: typeId,
      name: `Groomer ${nextNum}`,
      health: 100,
      installedDate: { ...state.currentDate },
    });
    state.buildArmed = false;
    state.mouseImage = null;
    document.getElementById('cancelBuildBtn')?.classList.add('hidden');
    if (typeof window.groomerDetailSetBlank === 'function') window.groomerDetailSetBlank();
  } else if (state.mode === 'slope' && state.slopeDrawMode === 'points') {
    const pt = canvasToImage(x, y);
    if (state.slopePoints.length === 0) {
      const snap = findSlopeConnectionSnap(pt.x, pt.y);
      if (!snap) {
        refresh();
        return;
      }
      pt.x = snap.x;
      pt.y = snap.y;
    }
    state.slopePlaceError = null;
    const last = state.slopePoints[state.slopePoints.length - 1];
    // Allow small upward movement within tolerance.
    if (last && pt.y < last.y - SLOPE_UPHILL_TOLERANCE_PX) {
      refresh();
      return;
    }
    state.slopePoints.push({ x: pt.x, y: pt.y });
    state.slopeDrawing = true;
    document.getElementById('cancelSlopeBtn').classList.remove('hidden');
  }

  refresh();
}

export function onCanvasDblClick(e) {
  if (state.mode !== 'slope' || state.slopeDrawMode !== 'points' || !state.image) return;
  e.preventDefault();
  if (state.slopePoints.length >= 2) {
    const first = state.slopePoints[0];
    const last = state.slopePoints[state.slopePoints.length - 1];
    const prev = state.slopePoints[state.slopePoints.length - 2];
    const snapStart = findSlopeConnectionSnap(first.x, first.y);
    const snapEndAny = findSlopeConnectionSnap(last.x, last.y);
    const snapEnd = prev ? findSlopeConnectionSnapForEnd(last.x, last.y, prev.y) : snapEndAny;
    if (!snapStart || !snapEnd) {
      if (prev && snapEndAny && snapEndAny.y < prev.y - SLOPE_UPHILL_TOLERANCE_PX) {
        state.slopePlaceError = 'Slope end point must not be higher than the previous point.';
      }
      else state.slopePlaceError = 'Slope must start/end at a lift station or on an existing slope.';
      refresh();
      return;
    }
    state.slopePlaceError = null;
    first.x = snapStart.x;
    first.y = snapStart.y;
    last.x = snapEnd.x;
    last.y = snapEnd.y;
    if (!isSlopeNonUphill(state.slopePoints)) {
      window.alert('Slope cannot go uphill. Each point must be same height or lower than the previous one.');
      refresh();
      return;
    }
    const lengthM = getSlopePathLengthM(state.slopePoints);
    const totalCost = getSlopeCost(lengthM);
    if (state.budget < totalCost) {
      window.alert(`Not enough budget to build this slope. Cost: ${formatCurrency(totalCost)}. Available: ${formatCurrency(state.budget)}.`);
      refresh();
      return;
    }
    state.budget -= totalCost;
    state.slopes.push({
      slopeTypeId: state.difficulty,
      points: state.slopePoints.map((p) => toNormalized(p.x, p.y)),
    });
    state.slopePoints = [];
    state.slopeDrawing = false;
    document.getElementById('cancelSlopeBtn').classList.add('hidden');
    state.buildArmed = false;
    state.mouseImage = null;
    document.getElementById('cancelBuildBtn')?.classList.add('hidden');
    refresh();
  }
  refresh();
}
