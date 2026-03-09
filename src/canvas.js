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
import { getGroomerImageUrl } from './ui/groomers.js';
import { COLS, ROWS } from './constants';
import { getLiftHealthZone, getLiftServiceCost, getLiftEffectiveCapacityMultiplier, getGroomerHealthZone, getGroomerServiceCost, getGroomerEffectiveCapacityMultiplier } from './maintenance_simulator';
import skidollarg2mUrl from '../assets/images/Skidollar_g2m.png';

const PEN_SMOOTH_SAMPLES = 24;
const PEN_MIN_DIST_SQ = 16;
const SNAP_DIST_SQ = 50 * 50;
/** Image-space distance threshold (px) to consider cursor over a lift line. */
const LIFT_HOVER_THRESHOLD_SQ = 24 * 24;
/** Image-space radius (px) to consider cursor over a groomer icon. */
const GROOMER_HOVER_RADIUS_SQ = 35 * 35;

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
  const serviceCost = !isBroken && health < 100 ? getLiftServiceCost(health, initialInvestment) : 0;
  const saleValue = !isBroken ? Math.round(0.15 * initialInvestment * (health / 100)) : 0;
  const scrapCost = Math.round(0.1 * initialInvestment);
  let serviceRow = '<div class="lift-hover-popup-service">';
  if (isBroken && repairCost > 0) {
    serviceRow += '<button type="button" class="lift-popup-service-btn" data-lift-index="' + String(liftIndex) + '" data-repair="true" title="Repair broken lift">Repair: <img src="' + escapeHtml(skidollarg2mUrl) + '" alt="" class="lift-popup-skidollar-icon" /> ' + escapeHtml(formatCurrency(repairCost)) + '</button>';
  } else if (!isBroken && health < 100 && serviceCost > 0) {
    serviceRow += '<button type="button" class="lift-popup-service-btn" data-lift-index="' + String(liftIndex) + '" title="Restore lift to 100% health">Service: <img src="' + escapeHtml(skidollarg2mUrl) + '" alt="" class="lift-popup-skidollar-icon" /> ' + escapeHtml(formatCurrency(serviceCost)) + '</button>';
  }
  if (!isBroken) {
    serviceRow += '<button type="button" class="lift-popup-sell-btn" data-lift-index="' + String(liftIndex) + '" title="Sell lift (value scales with health)">Sell: <img src="' + escapeHtml(skidollarg2mUrl) + '" alt="" class="lift-popup-skidollar-icon" /> ' + escapeHtml(formatCurrency(Math.max(0, saleValue))) + '</button>';
  } else {
    serviceRow += '<button type="button" class="lift-popup-scrap-btn" data-lift-index="' + String(liftIndex) + '" title="Scrap broken lift (pay 10% disposal)">Scrap: <img src="' + escapeHtml(skidollarg2mUrl) + '" alt="" class="lift-popup-skidollar-icon" /> ' + escapeHtml(formatCurrency(scrapCost)) + '</button>';
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
  const serviceCost = !isBroken && health < 100 ? getGroomerServiceCost(health, purchaseCost) : 0;
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
    serviceRow += '<button type="button" class="groomer-popup-scrap-btn" data-groomer-index="' + String(groomerIndex) + '" title="Scrap broken groomer (pay 10% disposal)">Scrap: <img src="' + escapeHtml(skidollarg2mUrl) + '" alt="" class="lift-popup-skidollar-icon" /> ' + escapeHtml(formatCurrency(scrapCost)) + '</button>';
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
let lastHoveredClientX = 0;
let lastHoveredClientY = 0;
let lastHoveredGroomerClientX = 0;
let lastHoveredGroomerClientY = 0;
let isPopupPinned = false;
let isGroomerPopupPinned = false;

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
  if (groomerPopupEl) {
    groomerPopupEl.hidden = true;
    groomerPopupEl.setAttribute('aria-hidden', 'true');
    lastHoveredGroomerIndex = null;
    isGroomerPopupPinned = false;
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
  if (liftPopupEl) {
    liftPopupEl.hidden = true;
    liftPopupEl.setAttribute('aria-hidden', 'true');
    lastHoveredLiftIndex = null;
    isPopupPinned = false;
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
 * Handle click on lift popup (close button, pin, or Service button). Use event delegation from document.
 */
export function handleLiftPopupClick(e) {
  const popup = document.getElementById('liftHoverPopup');
  const groomerPopup = document.getElementById('groomerHoverPopup');
  if (!isOperateTabActive()) return;
  const insideLiftPopup = popup && popup.contains(e.target);
  const insideGroomerPopup = groomerPopup && groomerPopup.contains(e.target);
  const clickOnMapArea = e.target && e.target.closest && (e.target.closest('#drawCanvas') || e.target.closest('.canvas-wrapper'));
  if (!insideLiftPopup && !insideGroomerPopup && !clickOnMapArea) {
    isPopupPinned = false;
    isGroomerPopupPinned = false;
    if (popup) { popup.removeAttribute('data-pinned'); popup.hidden = true; popup.setAttribute('aria-hidden', 'true'); }
    if (groomerPopup) { groomerPopup.removeAttribute('data-pinned'); groomerPopup.hidden = true; groomerPopup.setAttribute('aria-hidden', 'true'); }
    lastHoveredLiftIndex = null;
    lastHoveredGroomerIndex = null;
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
    cost = getLiftServiceCost(health, initialInvestment);
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
  const insideLiftPopup = liftPopup && liftPopup.contains(e.target);
  const insideGroomerPopup = popup && popup.contains(e.target);
  const clickOnMapArea = e.target && e.target.closest && (e.target.closest('#drawCanvas') || e.target.closest('.canvas-wrapper'));
  if (!insideLiftPopup && !insideGroomerPopup && !clickOnMapArea) {
    isPopupPinned = false;
    isGroomerPopupPinned = false;
    if (liftPopup) { liftPopup.removeAttribute('data-pinned'); liftPopup.hidden = true; liftPopup.setAttribute('aria-hidden', 'true'); }
    if (popup) { popup.removeAttribute('data-pinned'); popup.hidden = true; popup.setAttribute('aria-hidden', 'true'); }
    lastHoveredLiftIndex = null;
    lastHoveredGroomerIndex = null;
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
    cost = getGroomerServiceCost(health, purchaseCost);
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
    hideGroomerHoverPopup();
    return;
  }
  if (isPopupPinned && isGroomerPopupPinned) return;
  const groomerIdx = getGroomerIndexAtImage(pt.x, pt.y);
  if (groomerIdx >= 0 && !isGroomerPopupPinned) {
    updateGroomerHoverPopup(groomerIdx, e.clientX, e.clientY);
    if (!isPopupPinned) {
      const liftPopup = document.getElementById('liftHoverPopup');
      if (liftPopup) { liftPopup.hidden = true; liftPopup.setAttribute('aria-hidden', 'true'); lastHoveredLiftIndex = null; }
    }
    return;
  }
  if (isGroomerPopupPinned) return;
  const liftIdx = getLiftIndexAtImage(pt.x, pt.y);
  updateLiftHoverPopup(liftIdx, e.clientX, e.clientY);
  if (liftIdx < 0 && !isPopupPinned) {
    const groomerPopup = document.getElementById('groomerHoverPopup');
    if (groomerPopup) { groomerPopup.hidden = true; groomerPopup.setAttribute('aria-hidden', 'true'); lastHoveredGroomerIndex = null; }
  }
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
    const pt = canvasToImage(x, y);
    const groomerIdx = getGroomerIndexAtImage(pt.x, pt.y);
    const liftIdx = getLiftIndexAtImage(pt.x, pt.y);
    const placingLiftTop = state.mode === 'lift' && state.liftBottom && !state.liftTop;
    const groomerPopup = document.getElementById('groomerHoverPopup');
    if (groomerPopup && !groomerPopup.hidden && !isGroomerPopupPinned && groomerIdx >= 0) {
      isGroomerPopupPinned = true;
      groomerPopup.setAttribute('data-pinned', 'true');
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
    if (liftIdx < 0 && groomerIdx < 0) {
      hideLiftHoverPopup();
      hideGroomerHoverPopup();
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
    const nextNum = state.groomers.length + 1;
    state.groomers.push({
      position: norm,
      groomerTypeId: typeId,
      name: `Groomer ${nextNum}`,
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
