/**
 * Coordinate conversion and path/length/cost helpers.
 */

import { state, getSlopeType } from './state.js';

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
