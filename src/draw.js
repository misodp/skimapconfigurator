/**
 * Canvas drawing: lifts, slopes, cottages, groomers.
 * Uses state, geometry (fromNormalized, getLiftLengthM, getSlopePathLengthM, getSlopeCost), utils.
 */

import { state, DOM, getSlopeType, getDiffColor } from './state';
import { fromNormalized, getLiftLengthM, getSlopePathLengthM, getSlopeCost } from './geometry.js';
import { formatNumber, formatCurrency } from './utils.js';
import { getLiftHealthZone, getGroomerHealthZone } from './maintenance_simulator';

const LIFT_LINE_WIDTH = 3;
const LIFT_DOT_RADIUS = 5;
const SLOPE_LINE_WIDTH = 2;
const SLOPE_NUMBER_RADIUS = 10;

function drawLine(ctx, scaleX, scaleY, ax, ay, bx, by, color, lineWidth = LIFT_LINE_WIDTH) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(ax * scaleX, ay * scaleY);
  ctx.lineTo(bx * scaleX, by * scaleY);
  ctx.stroke();
}

function drawLiftStationDot(ctx, scaleX, scaleY, px, py, liftColor) {
  ctx.fillStyle = liftColor;
  ctx.beginPath();
  ctx.arc(px * scaleX, py * scaleY, LIFT_DOT_RADIUS, 0, Math.PI * 2);
  ctx.fill();
}

function normalizeAngleForDisplay(angle) {
  let a = angle;
  while (a > Math.PI / 2) a -= Math.PI;
  while (a <= -Math.PI / 2) a += Math.PI;
  return a;
}

function drawLiftLabel(ctx, scaleX, scaleY, name, ax, ay, bx, by, liftColor) {
  if (!name) return;
  const midX = (ax + bx) / 2;
  const midY = (ay + by) / 2;
  const angle = Math.atan2(by - ay, bx - ax);
  const drawAngle = normalizeAngleForDisplay(angle);
  const offset = 20;
  const perpX = -Math.sin(angle) * offset;
  const perpY = Math.cos(angle) * offset;
  const tx = midX + perpX;
  const ty = midY + perpY;
  ctx.save();
  ctx.translate(tx * scaleX, ty * scaleY);
  ctx.rotate(drawAngle);
  ctx.fillStyle = liftColor;
  ctx.font = 'bold 12px "DM Sans", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 0, 0);
  ctx.restore();
}

function drawSmoothCurve(ctx, scaleX, scaleY, points, color, lineWidth = SLOPE_LINE_WIDTH, dashed = false) {
  if (points.length < 2) return;
  const sx = (x) => x * scaleX;
  const sy = (y) => y * scaleY;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (dashed) ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(sx(points[0].x), sy(points[0].y));
  if (points.length === 2) {
    ctx.lineTo(sx(points[1].x), sy(points[1].y));
  } else {
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      ctx.bezierCurveTo(sx(cp1x), sy(cp1y), sx(cp2x), sy(cp2y), sx(p2.x), sy(p2.y));
    }
  }
  ctx.stroke();
  if (dashed) ctx.setLineDash([]);
}

function getPointAtPathFraction(pts, fraction) {
  if (pts.length === 0) return null;
  if (pts.length === 1) return pts[0];
  let totalLen = 0;
  const segLengths = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x;
    const dy = pts[i + 1].y - pts[i].y;
    const len = Math.sqrt(dx * dx + dy * dy);
    segLengths.push(len);
    totalLen += len;
  }
  if (totalLen === 0) return pts[0];
  const targetLen = totalLen * fraction;
  let acc = 0;
  for (let i = 0; i < segLengths.length; i++) {
    if (acc + segLengths[i] >= targetLen) {
      const t = segLengths[i] === 0 ? 0 : (targetLen - acc) / segLengths[i];
      return {
        x: pts[i].x + t * (pts[i + 1].x - pts[i].x),
        y: pts[i].y + t * (pts[i + 1].y - pts[i].y),
      };
    }
    acc += segLengths[i];
  }
  return pts[pts.length - 1];
}

function drawSlopeNumber(ctx, scaleX, scaleY, pts, color, number, useDiamond) {
  if (pts.length === 0) return;
  const mid = getPointAtPathFraction(pts, 0.5);
  if (!mid) return;
  const cx = mid.x * scaleX;
  const cy = mid.y * scaleY;
  ctx.save();
  if (useDiamond) {
    const r = SLOPE_NUMBER_RADIUS;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r, cy);
    ctx.closePath();
    ctx.fillStyle = '#1a1a1a';
    ctx.fill();
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2;
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy, SLOPE_NUMBER_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px "DM Sans", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(number), cx, cy);
  ctx.restore();
}

function drawSlopes(ctx, scaleX, scaleY) {
  state.slopes.forEach((slope, i) => {
    const pts = slope.points.map((p) => fromNormalized(p.x, p.y));
    const color = getDiffColor(slope);
    const st = getSlopeType(slope);
    const useDotted = st?.linetype === 'dotted';
    const useDiamond = st?.symbol === 'Diamond';
    drawSmoothCurve(ctx, scaleX, scaleY, pts, color, SLOPE_LINE_WIDTH, useDotted);
    drawSlopeNumber(ctx, scaleX, scaleY, pts, color, i + 1, useDiamond);
  });

  if (state.slopePoints.length > 0) {
    const currentSt = getSlopeType(state.difficulty);
    const useDotted = currentSt?.linetype === 'dotted';
    const useDiamond = currentSt?.symbol === 'Diamond';
    const lengthM = getSlopePathLengthM(state.slopePoints);
    const totalCost = getSlopeCost(lengthM);
    const insufficientFunds = state.budget < totalCost;
    const c = insufficientFunds ? 'rgba(180, 0, 0, 0.95)' : getDiffColor(state.difficulty);
    drawSmoothCurve(ctx, scaleX, scaleY, state.slopePoints, c, SLOPE_LINE_WIDTH, useDotted);
    if (state.slopeDrawMode === 'points') {
      state.slopePoints.forEach((p, i) => {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(p.x * scaleX, p.y * scaleY, i === 0 ? 6 : 4, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    if (state.slopePoints.length >= 2) {
      const last = state.slopePoints[state.slopePoints.length - 1];
      const offsetX = 0.005 * state.imageWidth;
      const offsetY = 0.005 * state.imageHeight;
      const labelX = (last.x + offsetX) * scaleX;
      let labelY = (last.y + offsetY) * scaleY;
      const lineHeight = 14;
      ctx.save();
      ctx.fillStyle = insufficientFunds ? 'rgba(120, 0, 0, 0.95)' : 'rgba(0, 0, 0, 0.75)';
      ctx.font = 'bold 12px "DM Sans", system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const msg = insufficientFunds ? `Not enough budget (need ${formatCurrency(totalCost)})` : `${lengthM} m`;
      ctx.fillText(msg, labelX, labelY);
      labelY += lineHeight;
      ctx.fillText(`${formatNumber(totalCost)} $`, labelX, labelY);
      ctx.restore();
    }
  }
}

const liftColor = '#1a1a1a';

const LIFT_HEALTH_COLOR = {
  healthy: '#22c55e',
  warning: '#eab308',
  critical: '#dc2626',
};

function isOperateTabActive() {
  const panel = document.getElementById('statisticsPanel');
  return panel ? panel.classList.contains('active') : false;
}

function drawLifts(ctx, scaleX, scaleY) {
  const showHealthDot = isOperateTabActive();
  const brokenColor = LIFT_HEALTH_COLOR.critical;
  state.lifts.forEach((lift, i) => {
    const a = fromNormalized(lift.bottomStation.x, lift.bottomStation.y);
    const b = fromNormalized(lift.topStation.x, lift.topStation.y);
    const isBroken = showHealthDot && (lift.broken === true);
    const lineColor = isBroken ? brokenColor : liftColor;
    drawLine(ctx, scaleX, scaleY, a.x, a.y, b.x, b.y, lineColor);
    let bottomDotColor = liftColor;
    let topDotColor = liftColor;
    if (isBroken) {
      bottomDotColor = brokenColor;
      topDotColor = brokenColor;
    } else if (showHealthDot) {
      const liftType = state.liftTypes.find((t) => t.id === lift.type);
      const rel = (liftType && liftType.reliability != null) ? Number(liftType.reliability) : 0.85;
      const zone = getLiftHealthZone(Math.max(0, Math.min(100, lift.health ?? 100)), rel);
      bottomDotColor = LIFT_HEALTH_COLOR[zone] ?? liftColor;
    }
    drawLiftStationDot(ctx, scaleX, scaleY, a.x, a.y, bottomDotColor);
    drawLiftStationDot(ctx, scaleX, scaleY, b.x, b.y, topDotColor);
    drawLiftLabel(ctx, scaleX, scaleY, lift.name || `Lift ${i + 1}`, a.x, a.y, b.x, b.y, liftColor);
  });

  if (state.liftBottom) {
    const a = state.liftBottom;
    drawLiftStationDot(ctx, scaleX, scaleY, a.x, a.y, liftColor);
    if (state.liftTop) {
      drawLine(ctx, scaleX, scaleY, a.x, a.y, state.liftTop.x, state.liftTop.y, liftColor);
      drawLiftStationDot(ctx, scaleX, scaleY, state.liftTop.x, state.liftTop.y, liftColor);
    } else if (state.mouseImage) {
      const mx = state.mouseImage.x;
      const my = state.mouseImage.y;
      const lengthM = getLiftLengthM(a, { x: mx, y: my });
      const typeId = state.liftType || (state.liftTypes[0] && state.liftTypes[0].id);
      const liftDef = state.liftTypes.find((l) => l.id === typeId);
      const maxLength = (liftDef && liftDef.max_length != null) ? liftDef.max_length : Infinity;
      const baseCost = (liftDef && liftDef.base_cost != null) ? Number(liftDef.base_cost) : 0;
      const costPerMeter = (liftDef && liftDef.cost_per_meter != null) ? Number(liftDef.cost_per_meter) : 0;
      const totalCost = Math.round(baseCost + lengthM * costPerMeter);
      const tooLong = lengthM > maxLength;
      const insufficientFunds = state.budget < totalCost;
      const cannotBuild = tooLong || insufficientFunds;
      ctx.save();
      ctx.strokeStyle = cannotBuild ? 'rgba(180, 0, 0, 0.9)' : 'rgba(26, 26, 26, 0.5)';
      ctx.lineWidth = LIFT_LINE_WIDTH;
      ctx.setLineDash([6, 4]);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(a.x * scaleX, a.y * scaleY);
      ctx.lineTo(mx * scaleX, my * scaleY);
      ctx.stroke();
      ctx.setLineDash([]);
      const offsetX = 0.005 * state.imageWidth;
      const offsetY = 0.005 * state.imageHeight;
      const labelX = (mx + offsetX) * scaleX;
      const labelY = (my + offsetY) * scaleY;
      const lineHeight = 14;
      ctx.fillStyle = cannotBuild ? 'rgba(120, 0, 0, 0.95)' : 'rgba(0, 0, 0, 0.75)';
      ctx.font = 'bold 12px "DM Sans", system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      let msg = `${lengthM} m`;
      if (tooLong) msg = `Too long for this lift (max ${maxLength} m)`;
      else if (insufficientFunds) msg = `Not enough budget (need ${formatCurrency(totalCost)})`;
      ctx.fillText(msg, labelX, labelY);
      ctx.fillText(`${formatNumber(totalCost)} $`, labelX, labelY + lineHeight);
      ctx.restore();
    }
  }
}

const COTTAGE_ICON_SIZE = 64;
const GROOMER_ICON_SIZE = 48;

function drawCottages(ctx, scaleX, scaleY) {
  const cottageIcon = state.cottageIcon;
  state.cottages.forEach((cottage) => {
    const pos = fromNormalized(cottage.position.x, cottage.position.y);
    const cx = pos.x * scaleX;
    const cy = pos.y * scaleY;
    if (cottageIcon && cottageIcon.complete && cottageIcon.naturalWidth) {
      ctx.save();
      ctx.translate(cx, cy);
      const w = COTTAGE_ICON_SIZE;
      const h = (cottageIcon.naturalHeight / cottageIcon.naturalWidth) * w;
      ctx.drawImage(cottageIcon, -w / 2, -h / 2, w, h);
      ctx.restore();
    } else {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.fillStyle = '#8B4513';
      ctx.strokeStyle = '#654321';
      ctx.lineWidth = 2;
      ctx.fillRect(-10, -8, 20, 16);
      ctx.strokeRect(-10, -8, 20, 16);
      ctx.restore();
    }
  });
}

const GROOMER_HEALTH_DOT_RADIUS = 5;
const GROOMER_HEALTH_COLOR = {
  healthy: '#22c55e',
  warning: '#eab308',
  critical: '#dc2626',
};

function drawGroomers(ctx, scaleX, scaleY) {
  const groomerImages = state.groomerImages;
  const showHealthDot = isOperateTabActive();
  state.groomers.forEach((groomer) => {
    const pos = fromNormalized(groomer.position.x, groomer.position.y);
    const cx = pos.x * scaleX;
    const cy = pos.y * scaleY;
    const img = groomerImages[groomer.groomerTypeId];
    if (img && img.complete && img.naturalWidth) {
      ctx.save();
      ctx.translate(cx, cy);
      const w = GROOMER_ICON_SIZE;
      const h = (img.naturalHeight / img.naturalWidth) * w;
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      if (showHealthDot) {
        const groomerType = state.groomerTypes.find((t) => t.id === groomer.groomerTypeId);
        const rel = (groomerType && groomerType.reliability != null) ? Number(groomerType.reliability) : 0.9;
        const zone = getGroomerHealthZone(Math.max(0, Math.min(100, groomer.health ?? 100)), rel);
        const dotColor = groomer.broken ? GROOMER_HEALTH_COLOR.critical : (GROOMER_HEALTH_COLOR[zone] ?? GROOMER_HEALTH_COLOR.healthy);
        const dotY = -h / 2 - GROOMER_HEALTH_DOT_RADIUS - 2;
        ctx.fillStyle = dotColor;
        ctx.beginPath();
        ctx.arc(0, dotY, GROOMER_HEALTH_DOT_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        if (groomer.broken) {
          const r = GROOMER_HEALTH_DOT_RADIUS * 0.75;
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 1.5;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(-r, dotY - r);
          ctx.lineTo(r, dotY + r);
          ctx.moveTo(r, dotY - r);
          ctx.lineTo(-r, dotY + r);
          ctx.stroke();
        }
      }
      ctx.restore();
    } else {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.fillStyle = '#4a5568';
      ctx.strokeStyle = '#2d3748';
      ctx.lineWidth = 2;
      ctx.fillRect(-12, -10, 24, 20);
      ctx.strokeRect(-12, -10, 24, 20);
      if (showHealthDot) {
        const groomerType = state.groomerTypes.find((t) => t.id === groomer.groomerTypeId);
        const rel = (groomerType && groomerType.reliability != null) ? Number(groomerType.reliability) : 0.9;
        const zone = getGroomerHealthZone(Math.max(0, Math.min(100, groomer.health ?? 100)), rel);
        const dotColor = groomer.broken ? GROOMER_HEALTH_COLOR.critical : (GROOMER_HEALTH_COLOR[zone] ?? GROOMER_HEALTH_COLOR.healthy);
        const dotY = -14;
        ctx.fillStyle = dotColor;
        ctx.beginPath();
        ctx.arc(0, dotY, GROOMER_HEALTH_DOT_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        if (groomer.broken) {
          const r = GROOMER_HEALTH_DOT_RADIUS * 0.75;
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 1.5;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(-r, dotY - r);
          ctx.lineTo(r, dotY + r);
          ctx.moveTo(r, dotY - r);
          ctx.lineTo(-r, dotY + r);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  });
}

export function draw() {
  const ctx = DOM.ctx;
  const rect = DOM.canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);
  if (!state.image || !state.imageWidth || !state.imageHeight) return;

  const scaleX = rect.width / state.imageWidth;
  const scaleY = rect.height / state.imageHeight;

  drawSlopes(ctx, scaleX, scaleY);
  drawLifts(ctx, scaleX, scaleY);
  drawCottages(ctx, scaleX, scaleY);
  drawGroomers(ctx, scaleX, scaleY);
}
