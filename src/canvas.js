/**
 * Canvas size, coordinate conversion, and mouse/click handlers.
 */

import { state, DOM, getSlopeType } from './state';
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
import { COLS, ROWS } from './constants';
import { getLiftHealthZone, getLiftServiceCost } from './maintenance_simulator';
import skidollarg2mUrl from '../assets/images/Skidollar_g2m.png';

const PEN_SMOOTH_SAMPLES = 24;
const PEN_MIN_DIST_SQ = 16;
const SNAP_DIST_SQ = 50 * 50;
/** Image-space distance threshold (px) to consider cursor over a lift line. */
const LIFT_HOVER_THRESHOLD_SQ = 24 * 24;

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
  if (!state.image) return;
  const img = state.image;
  const rect = img.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  state.imageWidth = img.naturalWidth;
  state.imageHeight = img.naturalHeight;

  DOM.canvas.width = rect.width * dpr;
  DOM.canvas.height = rect.height * dpr;
  DOM.canvas.style.width = rect.width + 'px';
  DOM.canvas.style.height = rect.height + 'px';
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
    for (let i = 0; i < slope.points.length - 1; i++) {
      const aN = slope.points[i];
      const bN = slope.points[i + 1];
      const a = fromNormalized(aN.x, aN.y);
      const b = fromNormalized(bN.x, bN.y);
      const p = closestPointOnSegment(px, py, a.x, a.y, b.x, b.y);
      const dx = px - p.x;
      const dy = py - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDistSq) {
        bestDistSq = d2;
        best = p;
      }
    }
  });

  return best;
}

/** Return index of lift at image point (px, py), or null if none within threshold. */
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

function getLiftPopupHtml(lift, liftType, lengthM, liftIndex) {
  const name = escapeHtml(lift.name || 'Lift');
  const speedStr = liftType && liftType.speed != null ? formatNumber(liftType.speed) + ' m/s' : '—';
  const capacity = liftType && liftType.capacity != null ? formatNumber(liftType.capacity) : '—';
  const lengthStr = lengthM != null ? formatNumber(lengthM) + ' m' : '—';
  const health = Math.max(0, Math.min(100, lift.health ?? 100));
  const healthPct = Math.round(health);
  const reliability = (liftType && liftType.reliability != null) ? Number(liftType.reliability) : 0.85;
  const zone = getLiftHealthZone(health, reliability);
  const zoneClass = 'lift-hover-popup-health-fill--' + zone;
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
  const serviceCost = health < 100 ? getLiftServiceCost(health, initialInvestment) : 0;
  let serviceRow = '';
  if (health < 100 && serviceCost > 0) {
    serviceRow = '<div class="lift-hover-popup-service">' +
      '<button type="button" class="lift-popup-service-btn" data-lift-index="' + String(liftIndex) + '" title="Restore lift to 100% health">Service – <img src="' + escapeHtml(skidollarg2mUrl) + '" alt="" class="lift-popup-skidollar-icon" /> ' + escapeHtml(formatCurrency(serviceCost)) + '</button></div>';
  }
  return (
    '<button type="button" class="lift-popup-close-btn" aria-label="Close" title="Close">×</button>' +
    '<div class="lift-hover-popup-icon" style="' + iconStyle + '"></div>' +
    '<div class="lift-hover-popup-name">' + name + '</div>' +
    '<div class="lift-hover-popup-health" aria-label="Health ' + healthPct + '%">' +
    '<span class="lift-hover-popup-health-label">Health</span>' +
    '<div class="lift-hover-popup-health-track"><div class="lift-hover-popup-health-fill ' + zoneClass + '" style="width:' + healthPct + '%"></div></div>' +
    '<span class="lift-hover-popup-health-value">' + healthPct + '%</span></div>' +
    serviceRow +
    '<div class="lift-hover-popup-meta">Speed: ' + speedStr + '</div>' +
    '<div class="lift-hover-popup-meta">Capacity: ' + capacity + '</div>' +
    '<div class="lift-hover-popup-meta">Length: ' + lengthStr + '</div>'
  );
}

let lastHoveredLiftIndex = null;
let lastHoveredClientX = 0;
let lastHoveredClientY = 0;
let isPopupPinned = false;

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

/**
 * Refresh the lift hover popup content if it is currently visible (e.g. after simulation day advance).
 */
export function refreshLiftHoverPopupIfOpen() {
  const popup = document.getElementById('liftHoverPopup');
  if (!popup || popup.hidden || lastHoveredLiftIndex == null) return;
  updateLiftHoverPopup(lastHoveredLiftIndex, lastHoveredClientX, lastHoveredClientY);
}

/**
 * Handle click on lift popup (close button, pin, or Service button). Use event delegation from document.
 */
export function handleLiftPopupClick(e) {
  const popup = document.getElementById('liftHoverPopup');
  if (!popup || popup.hidden || !isOperateTabActive()) return;
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

  if (isInsidePopup) {
    e.preventDefault();
    e.stopPropagation();
    if (!isPopupPinned) {
      isPopupPinned = true;
      popup.setAttribute('data-pinned', 'true');
    }
  }

  const btn = e.target && e.target.closest && e.target.closest('.lift-popup-service-btn');
  if (!btn) return;
  const idx = parseInt(btn.getAttribute('data-lift-index'), 10);
  if (Number.isNaN(idx) || idx < 0 || idx >= state.lifts.length) return;
  const lift = state.lifts[idx];
  const liftType = state.liftTypes.find((l) => l.id === lift.type) || state.liftTypes[0];
  const a = fromNormalized(lift.bottomStation.x, lift.bottomStation.y);
  const b = fromNormalized(lift.topStation.x, lift.topStation.y);
  const lengthM = getLiftLengthM(a, b);
  const baseCost = (liftType && liftType.base_cost != null) ? Number(liftType.base_cost) : 0;
  const costPerMeter = (liftType && liftType.cost_per_meter != null) ? Number(liftType.cost_per_meter) : 0;
  const initialInvestment = baseCost + costPerMeter * lengthM;
  const health = Math.max(0, Math.min(100, lift.health ?? 100));
  const cost = getLiftServiceCost(health, initialInvestment);
  if (cost <= 0) return;
  if (state.budget < cost) {
    window.alert(`Not enough budget to service this lift. Cost: ${formatCurrency(cost)}. Available: ${formatCurrency(state.budget)}.`);
    return;
  }
  state.budget -= cost;
  lift.health = 100;
  updateBudgetDisplay();
  isPopupPinned = false;
  popup.removeAttribute('data-pinned');
  popup.hidden = true;
  popup.setAttribute('aria-hidden', 'true');
  lastHoveredLiftIndex = null;
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

export function onCanvasMouseDown(e) {
  if (!state.image || state.mode !== 'slope' || state.slopeDrawMode !== 'pen') return;
  if (!isInvestTabActive()) return;
  const { x, y } = getCanvasPoint(e);
  const pt = canvasToImage(x, y);
  state.slopePoints = [{ x: pt.x, y: pt.y }];
  state.penDrawing = true;
  document.getElementById('cancelSlopeBtn').classList.remove('hidden');
  refresh();
}

export function onCanvasMouseMove(e) {
  if (!state.image) return;
  const { x, y } = getCanvasPoint(e);
  const pt = canvasToImage(x, y);
  if (state.mode === 'lift' && state.liftBottom && !state.liftTop) {
    if (!isInvestTabActive()) return;
    state.mouseImage = { x: pt.x, y: pt.y };
    refresh();
    hideLiftHoverPopup();
    return;
  }
  if (state.penDrawing) {
    const last = state.slopePoints[state.slopePoints.length - 1];
    if (last) {
      const dx = pt.x - last.x;
      const dy = pt.y - last.y;
      if (dx * dx + dy * dy < PEN_MIN_DIST_SQ) return;
    }
    state.slopePoints.push({ x: pt.x, y: pt.y });
    refresh();
    return;
  }
  if (!isOperateTabActive()) {
    hideLiftHoverPopup();
    return;
  }
  if (isPopupPinned) return;
  const liftIdx = getLiftIndexAtImage(pt.x, pt.y);
  updateLiftHoverPopup(liftIdx, e.clientX, e.clientY);
}

export function onCanvasMouseUp() {
  if (!state.penDrawing || !state.image) return;
  if (!isInvestTabActive()) {
    state.penDrawing = false;
    state.slopePoints = [];
    document.getElementById('cancelSlopeBtn')?.classList.add('hidden');
    refresh();
    return;
  }
  state.penDrawing = false;
  if (state.slopePoints.length >= 2) {
    let pts = state.slopePoints;
    pts = resamplePolylineByPathLength(pts, PEN_SMOOTH_SAMPLES);
    const first = pts[0];
    const last = pts[pts.length - 1];
    const snapStart = findSnapPoint(first.x, first.y);
    const snapEnd = findSnapPoint(last.x, last.y);
    if (snapStart) {
      first.x = snapStart.x;
      first.y = snapStart.y;
    }
    if (snapEnd) {
      last.x = snapEnd.x;
      last.y = snapEnd.y;
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
  refresh();
}

export function onCanvasClick(e) {
  if (!state.image) return;
  const { x, y } = getCanvasPoint(e);

  if (isOperateTabActive()) {
    const popup = document.getElementById('liftHoverPopup');
    if (popup && !popup.hidden && !isPopupPinned) {
      const pt = canvasToImage(x, y);
      const liftIdx = getLiftIndexAtImage(pt.x, pt.y);
      const placingLiftTop = state.mode === 'lift' && state.liftBottom && !state.liftTop;
      if (liftIdx >= 0 && !placingLiftTop) {
        isPopupPinned = true;
        popup.setAttribute('data-pinned', 'true');
        return;
      }
    }
  }

  const isBuildMode = state.mode === 'lift' || state.mode === 'cottage' || state.mode === 'groomer' || (state.mode === 'slope' && state.slopeDrawMode === 'points');
  if (isBuildMode && !isInvestTabActive()) return;

  if (state.mode === 'lift') {
    const pt = canvasToImage(x, y);
    const norm = toNormalized(pt.x, pt.y);
    if (!state.liftBottom) {
      state.liftBottom = { x: pt.x, y: pt.y, norm };
      state.mouseImage = null;
      updateCancelLiftButton();
    } else if (!state.liftTop) {
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
    }
  } else if (state.mode === 'cottage') {
    const pt = canvasToImage(x, y);
    const norm = toNormalized(pt.x, pt.y);
    const nextNum = state.cottages.length + 1;
    const name = window.prompt('Cottage name (optional)', `Cottage ${nextNum}`) || `Cottage ${nextNum}`;
    state.cottages.push({ position: norm, name: name.trim() || `Cottage ${nextNum}` });
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
    state.groomers.push({
      position: norm,
      groomerTypeId: typeId,
      health: 100,
      installedDate: { ...state.currentDate },
    });
    if (typeof window.groomerDetailSetBlank === 'function') window.groomerDetailSetBlank();
  } else if (state.mode === 'slope' && state.slopeDrawMode === 'points') {
    const pt = canvasToImage(x, y);
    state.slopePoints.push({ x: pt.x, y: pt.y });
    state.slopeDrawing = true;
    document.getElementById('cancelSlopeBtn').classList.remove('hidden');
  }

  refresh();
}

export function onCanvasDblClick(e) {
  if (state.mode !== 'slope' || state.slopeDrawMode !== 'points' || !state.image) return;
  if (!isInvestTabActive()) return;
  e.preventDefault();
  if (state.slopePoints.length >= 2) {
    const first = state.slopePoints[0];
    const last = state.slopePoints[state.slopePoints.length - 1];
    const snapStart = findSnapPoint(first.x, first.y);
    const snapEnd = findSnapPoint(last.x, last.y);
    if (snapStart) {
      first.x = snapStart.x;
      first.y = snapStart.y;
    }
    if (snapEnd) {
      last.x = snapEnd.x;
      last.y = snapEnd.y;
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
    refresh();
  }
  refresh();
}
