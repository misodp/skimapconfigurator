/**
 * Application state and DOM references.
 */

export const state = {
  mode: 'lift',
  liftType: null,
  liftTypes: [],
  slopeTypes: [],
  difficulty: null,
  groomerType: null,
  groomerTypes: [],
  image: null,
  imageWidth: 0,
  imageHeight: 0,
  lifts: [],
  slopes: [],
  cottages: [],
  groomers: [],
  budget: 100000,
  liftBottom: null,
  liftTop: null,
  mouseImage: null,
  slopePoints: [],
  slopeDrawing: false,
  slopeDrawMode: 'points',
  penDrawing: false,
  spriteSheet: null,
  cottageIcon: null,
  groomerImages: {},
};

export const DOM = {
  mountainImage: null,
  canvas: null,
  ctx: null,
  imageInput: null,
  exportBtn: null,
  importBtn: null,
  importInput: null,
  liftList: null,
  slopeList: null,
  cottageList: null,
  modeBtns: null,
  slopeOptions: null,
  liftHint: null,
  slopeHint: null,
  cottageHint: null,
  groomerHint: null,
  groomerList: null,
  groomerOptions: null,
};

export function getSlopeType(slopeOrId) {
  if (!state.slopeTypes.length) return null;
  if (typeof slopeOrId === 'string') {
    return state.slopeTypes.find((t) => t.id === slopeOrId) || null;
  }
  const s = slopeOrId;
  if (s.slopeTypeId) return state.slopeTypes.find((t) => t.id === s.slopeTypeId) || null;
  if (s.difficulty != null) {
    const key = String(s.difficulty).toLowerCase();
    return state.slopeTypes.find((t) => t.difficulty.toLowerCase() === key) || null;
  }
  return null;
}

export function getDiffColor(slopeOrId) {
  const st = getSlopeType(slopeOrId);
  if (st && st.color) return st.color;
  if (st) return st.difficulty;
  return '#4285f4';
}
