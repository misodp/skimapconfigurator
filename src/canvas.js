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
import { refresh } from './config.js';
import { formatCurrency } from './utils.js';
import { updateCancelLiftButton } from './ui/lifts.js';

const PEN_SMOOTH_SAMPLES = 24;
const PEN_MIN_DIST_SQ = 16;
const SNAP_DIST_SQ = 50 * 50;

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

export function onCanvasMouseDown(e) {
  if (!state.image || state.mode !== 'slope' || state.slopeDrawMode !== 'pen') return;
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
    state.mouseImage = { x: pt.x, y: pt.y };
    refresh();
  }
  if (!state.penDrawing) return;
  const last = state.slopePoints[state.slopePoints.length - 1];
  if (last) {
    const dx = pt.x - last.x;
    const dy = pt.y - last.y;
    if (dx * dx + dy * dy < PEN_MIN_DIST_SQ) return;
  }
  state.slopePoints.push({ x: pt.x, y: pt.y });
  refresh();
}

export function onCanvasMouseUp() {
  if (!state.penDrawing || !state.image) return;
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
    state.groomers.push({ position: norm, groomerTypeId: typeId });
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
