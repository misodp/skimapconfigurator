/**
 * Ski Map Configurator - Main application
 * Configure ski lifts (bottom → top) and slopes (curved lines with difficulty) on a mountain image.
 * Config is stored as JSON with normalized coordinates (0–1) relative to image dimensions.
 */

import defaultMountainUrl from '../assets/images/mountain1.png';
import cottageIconUrl from '../assets/images/cottage.png';
import spriteSheetUrl from '../assets/images/SpriteSheet.png';
import techTreeData from '../assets/data/techTree.json';

const state = {
  mode: 'lift', // 'lift' | 'slope' | 'cottage'
  liftType: null, // lift id from techTree (set after load)
  liftTypes: [], // [{ id, name, frame, ... }, ...] from techTree.lifts
  difficulty: 'blue',
  image: null,
  imageWidth: 0,
  imageHeight: 0,
  lifts: [],
  slopes: [],
  cottages: [],
  // Lift placement
  liftBottom: null,
  liftTop: null,
  mouseImage: null, // current mouse position in image coords (for ghost line)
  // Slope drawing
  slopePoints: [],
  slopeDrawing: false,
  slopeDrawMode: 'points', // 'points' = click points, 'pen' = freehand drag
  penDrawing: false,
};

const DOM = {
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
  diffBtns: null,
  slopeOptions: null,
  liftHint: null,
  slopeHint: null,
  cottageHint: null,
};

let spriteSheet = null; // HTMLImageElement (loaded async)
let cottageIcon = null; // HTMLImageElement

function init() {
  DOM.mountainImage = document.getElementById('mountainImage');
  DOM.canvas = document.getElementById('drawCanvas');
  DOM.ctx = DOM.canvas.getContext('2d');
  DOM.imageInput = document.getElementById('imageInput');
  DOM.exportBtn = document.getElementById('exportBtn');
  DOM.importBtn = document.getElementById('importBtn');
  DOM.importInput = document.getElementById('importInput');
  DOM.liftList = document.getElementById('liftList');
  DOM.slopeList = document.getElementById('slopeList');
  DOM.cottageList = document.getElementById('cottageList');
  DOM.modeBtns = document.querySelectorAll('.mode-btn');
  DOM.diffBtns = document.querySelectorAll('.diff-btn');
  DOM.slopeOptions = document.querySelector('.slope-options');
  DOM.liftOptions = document.querySelector('.lift-options');
  DOM.liftHint = document.querySelector('.lift-hint');
  DOM.slopeHint = document.querySelector('.slope-hint');
  DOM.cottageHint = document.querySelector('.cottage-hint');

  DOM.imageInput.addEventListener('change', onImageSelected);
  DOM.exportBtn.addEventListener('click', exportConfig);
  DOM.importBtn.addEventListener('click', () => DOM.importInput.click());
  DOM.importInput.addEventListener('change', onConfigImported);

  DOM.modeBtns.forEach((btn) => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
  });
  DOM.diffBtns.forEach((btn) => {
    btn.addEventListener('click', () => setDifficulty(btn.dataset.difficulty));
  });

  document.querySelectorAll('.slope-mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => setSlopeDrawMode(btn.dataset.slopeMode));
  });

  DOM.canvas.addEventListener('click', onCanvasClick);
  DOM.canvas.addEventListener('dblclick', onCanvasDblClick);
  DOM.canvas.addEventListener('mousedown', onCanvasMouseDown);
  DOM.canvas.addEventListener('mousemove', onCanvasMouseMove);
  DOM.canvas.addEventListener('mouseup', onCanvasMouseUp);
  DOM.canvas.addEventListener('mouseleave', (e) => {
    if (state.mode === 'lift') state.mouseImage = null;
    onCanvasMouseUp(e);
  });

  document.getElementById('cancelSlopeBtn').addEventListener('click', cancelSlope);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cancelSlope(); });

  state.liftTypes = (techTreeData && techTreeData.lifts) ? [...techTreeData.lifts] : [];
  state.liftType = state.liftTypes.length > 0 ? state.liftTypes[0].id : null;
  loadSpriteSheet();
  loadCottageIcon();
  renderLiftTypeDropdown();
  setMode('lift');
  if (state.liftType) setLiftType(state.liftType);
  setDifficulty('blue');
  renderLists();

  // Load default mountain image from assets on startup
  DOM.mountainImage.onload = () => {
    state.image = DOM.mountainImage;
    syncCanvasSize();
    draw();
  };
  DOM.mountainImage.src = defaultMountainUrl;
  DOM.canvas.classList.remove('no-image');
}

function loadSpriteSheet() {
  if (!spriteSheetUrl) return;
  const img = new Image();
  img.onload = () => { spriteSheet = img; renderLiftTypeDropdown(); draw(); };
  img.src = spriteSheetUrl;
}

const COLS = 3;
const ROWS = 2;

function getLiftSpriteStyle(lift) {
  const col = lift.frame % COLS;
  const row = Math.floor(lift.frame / COLS);
  const posX = COLS > 1 ? (col / (COLS - 1)) * 100 : 0;
  const posY = ROWS > 1 ? (row / (ROWS - 1)) * 100 : 0;
  return `background-image:url(${spriteSheetUrl}); background-size:${COLS * 100}% ${ROWS * 100}%; background-position:${posX}% ${posY}%;`;
}

const LIFT_DETAIL_BLANK_HTML = '';

/** Build lift type section: list in menu; floating panel over canvas shows blank until a lift is selected (click), then that lift's details; collapse to blank on close. */
function renderLiftTypeDropdown() {
  const container = document.getElementById('liftTypeDropdown');
  const floatingPanel = document.getElementById('liftDetailFloating');
  if (!container || !state.liftTypes.length) return;

  container.innerHTML = `<div class="lift-type-buttons" data-lift-list></div>`;
  const listContainer = container.querySelector('[data-lift-list]');

  function setPanelBlank() {
    if (!floatingPanel) return;
    floatingPanel.innerHTML = LIFT_DETAIL_BLANK_HTML;
  }

  function fillFloatingDetail(lift) {
    if (!floatingPanel || !lift) return;
    const style = getLiftSpriteStyle(lift);
    floatingPanel.innerHTML = `
      <button type="button" class="lift-detail-close" title="Close" aria-label="Close">×</button>
      <div class="lift-type-detail-icon" style="${style}"></div>
      <dl class="lift-type-detail-fields">
        <dt>Brand</dt><dd>${escapeHtml(lift.brand || '—')}</dd>
        <dt>Name</dt><dd>${escapeHtml(lift.name || '—')}</dd>
        <dt>Cost</dt><dd>${formatNumber(lift.base_cost)}</dd>
        <dt>Maintenance</dt><dd>${formatNumber(lift.base_maintenance)}</dd>
        <dt>Speed</dt><dd>${formatNumber(lift.speed)}</dd>
        <dt>Capacity</dt><dd>${formatNumber(lift.capacity)}</dd>
        <dt>Description</dt><dd class="lift-detail-description">${escapeHtml(lift.description || '—')}</dd>
      </dl>
    `;
    const closeBtn = floatingPanel.querySelector('.lift-detail-close');
    if (closeBtn) closeBtn.addEventListener('click', () => setPanelBlank());
  }

  function showFloatingPanel(liftId) {
    const lift = state.liftTypes.find((l) => l.id === liftId) || state.liftTypes[0];
    fillFloatingDetail(lift);
    if (floatingPanel) {
      floatingPanel.hidden = false;
      floatingPanel.setAttribute('aria-hidden', 'false');
    }
  }

  listContainer.innerHTML = state.liftTypes
    .map((lift) => {
      const isActive = state.liftType === lift.id ? ' active' : '';
      return `<button type="button" data-lift-type="${escapeHtml(lift.id)}" class="lift-type-btn${isActive}">
        <span class="lift-type-icon" style="${getLiftSpriteStyle(lift)}"></span>
        <span class="lift-type-label">${escapeHtml(lift.name)}</span>
      </button>`;
    })
    .join('');

  listContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-lift-type]');
    if (!btn) return;
    const id = btn.dataset.liftType;
    setLiftType(id);
    listContainer.querySelectorAll('.lift-type-btn').forEach((b) => b.classList.toggle('active', b.dataset.liftType === id));
    showFloatingPanel(id);
  });

  setPanelBlank();
  if (floatingPanel && state.mode === 'lift') {
    floatingPanel.hidden = false;
    floatingPanel.setAttribute('aria-hidden', 'false');
  }

  window.liftDropdownUpdateTrigger = () => {};
  window.liftDetailSetBlank = setPanelBlank;
}

function formatNumber(n) {
  if (n === undefined || n === null) return '—';
  if (Number.isInteger(n)) return String(n);
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function loadCottageIcon() {
  if (!cottageIconUrl) return;
  const img = new Image();
  img.onload = () => { cottageIcon = img; draw(); };
  img.src = cottageIconUrl;
}

function setMode(mode) {
  state.mode = mode;
  state.liftBottom = null;
  state.liftTop = null;
  state.slopePoints = [];
  state.slopeDrawing = false;

  DOM.modeBtns.forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  DOM.slopeOptions.classList.toggle('hidden', mode !== 'slope');
  if (DOM.liftOptions) DOM.liftOptions.classList.toggle('hidden', mode !== 'lift');
  DOM.liftHint.classList.toggle('hidden', mode !== 'lift');
  const floatingPanel = document.getElementById('liftDetailFloating');
  if (floatingPanel) {
    if (mode === 'lift') {
      floatingPanel.hidden = false;
      floatingPanel.setAttribute('aria-hidden', 'false');
      if (typeof window.liftDetailSetBlank === 'function') window.liftDetailSetBlank();
    } else {
      floatingPanel.hidden = true;
      floatingPanel.setAttribute('aria-hidden', 'true');
    }
  }
  DOM.slopeHint.classList.toggle('hidden', mode !== 'slope');
  if (DOM.cottageHint) DOM.cottageHint.classList.toggle('hidden', mode !== 'cottage');
  const cancelBtn = document.getElementById('cancelSlopeBtn');
  if (cancelBtn) cancelBtn.classList.toggle('hidden', mode !== 'slope');
  state.penDrawing = false;
  updateSlopeHints();

  draw();
}

function setSlopeDrawMode(slopeMode) {
  state.slopeDrawMode = slopeMode;
  state.slopePoints = [];
  state.slopeDrawing = false;
  state.penDrawing = false;
  document.querySelectorAll('.slope-mode-btn').forEach((b) => b.classList.toggle('active', b.dataset.slopeMode === slopeMode));
  updateSlopeHints();
  const cancelBtn = document.getElementById('cancelSlopeBtn');
  if (cancelBtn) cancelBtn.classList.add('hidden');
  draw();
}

function updateSlopeHints() {
  const pointsHint = document.querySelector('.points-hint');
  const penHint = document.querySelector('.pen-hint');
  if (pointsHint) pointsHint.classList.toggle('hidden', state.mode !== 'slope' || state.slopeDrawMode !== 'points');
  if (penHint) penHint.classList.toggle('hidden', state.mode !== 'slope' || state.slopeDrawMode !== 'pen');
}

function cancelSlope() {
  state.slopePoints = [];
  state.slopeDrawing = false;
  const btn = document.getElementById('cancelSlopeBtn');
  if (btn) btn.classList.add('hidden');
  draw();
}

function setLiftType(type) {
  if (!state.liftTypes.some((l) => l.id === type)) return;
  state.liftType = type;
  if (typeof window.liftDropdownUpdateTrigger === 'function') window.liftDropdownUpdateTrigger();
}

function setDifficulty(d) {
  state.difficulty = d;
  DOM.diffBtns.forEach((b) => b.classList.toggle('selected', b.dataset.difficulty === d));
}

function onImageSelected(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  DOM.mountainImage.onload = () => {
    URL.revokeObjectURL(url);
    state.image = DOM.mountainImage;
    syncCanvasSize();
    draw();
  };
  DOM.mountainImage.src = url;
  DOM.canvas.classList.remove('no-image');
}

function syncCanvasSize() {
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
  draw();
}

/** (x, y) are in canvas-relative CSS pixels. Returns image pixel coords. */
function canvasToImage(x, y) {
  const rect = DOM.canvas.getBoundingClientRect();
  const scaleX = state.imageWidth / rect.width;
  const scaleY = state.imageHeight / rect.height;
  return { x: x * scaleX, y: y * scaleY };
}

/** Image pixel (px, py) to canvas-relative CSS pixels. */
function imageToCanvas(px, py) {
  const rect = DOM.canvas.getBoundingClientRect();
  const scaleX = rect.width / state.imageWidth;
  const scaleY = rect.height / state.imageHeight;
  return { x: px * scaleX, y: py * scaleY };
}

/** Normalized coords 0–1 relative to image size (for config). */
function toNormalized(px, py) {
  return {
    x: state.imageWidth ? px / state.imageWidth : 0,
    y: state.imageHeight ? py / state.imageHeight : 0,
  };
}

function fromNormalized(nx, ny) {
  return {
    x: nx * state.imageWidth,
    y: ny * state.imageHeight,
  };
}

/** Length in meters: normalized distance * 300 per 0.1 (same as ghost line display). */
function getLiftLengthM(bottomImage, topImage) {
  if (!state.imageWidth || !state.imageHeight) return 0;
  const normDist = Math.sqrt(
    Math.pow((topImage.x - bottomImage.x) / state.imageWidth, 2) +
    Math.pow((topImage.y - bottomImage.y) / state.imageHeight, 2)
  );
  return Math.round((normDist / 0.1) * 450);
}

function getCanvasPoint(e) {
  const rect = DOM.canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

/** Resample polyline to numSamples points evenly spaced by path length. Smooths jagged pen input. */
function resamplePolylineByPathLength(points, numSamples) {
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

const PEN_SMOOTH_SAMPLES = 24; // number of points after resampling pen-drawn slopes

function onCanvasMouseDown(e) {
  if (!state.image || state.mode !== 'slope' || state.slopeDrawMode !== 'pen') return;
  const { x, y } = getCanvasPoint(e);
  const pt = canvasToImage(x, y);
  state.slopePoints = [{ x: pt.x, y: pt.y }];
  state.penDrawing = true;
  document.getElementById('cancelSlopeBtn').classList.remove('hidden');
  draw();
}

const PEN_MIN_DIST_SQ = 16; // min distance squared (image px) between pen points

// How close (image pixels) a slope start/end must be to snap to an existing line.
const SNAP_DIST_SQ = 50 * 50;

function closestPointOnSegment(px, py, ax, ay, bx, by) {
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
function findSnapPoint(px, py) {
  let best = null;
  let bestDistSq = SNAP_DIST_SQ;

  // Check all lift segments (bottom → top)
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

  // Check all slope segments
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

function onCanvasMouseMove(e) {
  if (!state.image) return;
  const { x, y } = getCanvasPoint(e);
  const pt = canvasToImage(x, y);
  if (state.mode === 'lift' && state.liftBottom && !state.liftTop) {
    state.mouseImage = { x: pt.x, y: pt.y };
    draw();
  }
  if (!state.penDrawing) return;
  const last = state.slopePoints[state.slopePoints.length - 1];
  if (last) {
    const dx = pt.x - last.x;
    const dy = pt.y - last.y;
    if (dx * dx + dy * dy < PEN_MIN_DIST_SQ) return;
  }
  state.slopePoints.push({ x: pt.x, y: pt.y });
  draw();
}

function onCanvasMouseUp() {
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
    state.slopes.push({
      difficulty: state.difficulty,
      points: pts.map((p) => toNormalized(p.x, p.y)),
    });
    renderLists();
  }
  state.slopePoints = [];
  document.getElementById('cancelSlopeBtn').classList.add('hidden');
  draw();
}

function onCanvasClick(e) {
  if (!state.image) return;
  const { x, y } = getCanvasPoint(e);

  if (state.mode === 'lift') {
    const pt = canvasToImage(x, y);
    const norm = toNormalized(pt.x, pt.y);
    if (!state.liftBottom) {
      state.liftBottom = { x: pt.x, y: pt.y, norm };
    } else if (!state.liftTop) {
      const lengthM = getLiftLengthM(state.liftBottom, pt);
      const typeId = state.liftType || (state.liftTypes[0] && state.liftTypes[0].id);
      const liftDef = state.liftTypes.find((l) => l.id === typeId);
      const maxLength = (liftDef && liftDef.max_length != null) ? liftDef.max_length : Infinity;
      if (lengthM > maxLength) {
        window.alert(`Line is too long for this lift type. Maximum length: ${maxLength} m. Calculated: ${lengthM} m.`);
        draw();
        return;
      }
      state.liftTop = { x: pt.x, y: pt.y, norm };
      const nextNum = state.lifts.length + 1;
      state.lifts.push({
        bottomStation: state.liftBottom.norm,
        topStation: state.liftTop.norm,
        type: typeId,
        name: `Lift ${nextNum}`,
      });
      state.liftBottom = null;
      state.liftTop = null;
      renderLists();
      if (typeof window.liftDetailSetBlank === 'function') window.liftDetailSetBlank();
    }
  } else if (state.mode === 'cottage') {
    const pt = canvasToImage(x, y);
    const norm = toNormalized(pt.x, pt.y);
    const nextNum = state.cottages.length + 1;
    const name = window.prompt('Cottage name (optional)', `Cottage ${nextNum}`) || `Cottage ${nextNum}`;
    state.cottages.push({ position: norm, name: name.trim() || `Cottage ${nextNum}` });
    renderLists();
  } else if (state.mode === 'slope' && state.slopeDrawMode === 'points') {
    const pt = canvasToImage(x, y);
    state.slopePoints.push({ x: pt.x, y: pt.y });
    state.slopeDrawing = true;
    document.getElementById('cancelSlopeBtn').classList.remove('hidden');
  }

  draw();
}

function onCanvasDblClick(e) {
  if (state.mode !== 'slope' || state.slopeDrawMode !== 'points' || !state.image) return;
  e.preventDefault();
  if (state.slopePoints.length >= 2) {
    // Optionally snap start and end of point-drawn slope
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
    state.slopes.push({
      difficulty: state.difficulty,
      points: state.slopePoints.map((p) => toNormalized(p.x, p.y)),
    });
    state.slopePoints = [];
    state.slopeDrawing = false;
    document.getElementById('cancelSlopeBtn').classList.add('hidden');
    renderLists();
  }
  draw();
}

function draw() {
  const ctx = DOM.ctx;
  const rect = DOM.canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);
  if (!state.image || !state.imageWidth || !state.imageHeight) return;

  const scaleX = rect.width / state.imageWidth;
  const scaleY = rect.height / state.imageHeight;

  const LIFT_LINE_WIDTH = 3;
  const LIFT_DOT_RADIUS = 5; // slightly thicker than the line
  const SLOPE_LINE_WIDTH = 2; // a bit thinner than lift lines

  function drawLine(ax, ay, bx, by, color, lineWidth = LIFT_LINE_WIDTH) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ax * scaleX, ay * scaleY);
    ctx.lineTo(bx * scaleX, by * scaleY);
    ctx.stroke();
  }

  function drawLiftStationDot(px, py) {
    ctx.fillStyle = liftColor;
    ctx.beginPath();
    ctx.arc(px * scaleX, py * scaleY, LIFT_DOT_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Return angle in (-π/2, π/2] so rotated content (icon/text) is never upside down. */
  function normalizeAngleForDisplay(angle) {
    let a = angle;
    while (a > Math.PI / 2) a -= Math.PI;
    while (a <= -Math.PI / 2) a += Math.PI;
    return a;
  }

  /** Draw lift type icon from sprite sheet. Positioned towards upper station (70% from bottom) so it doesn't overlap the name. */
  const LIFT_ICON_TOWARDS_TOP = 0.7; // 0 = at bottom, 1 = at top
  const LIFT_ICON_SIZE = 24; // pixels on canvas

  function drawLiftIcon(ax, ay, bx, by, typeId) {
    const sx = (x) => x * scaleX;
    const sy = (y) => y * scaleY;
    const cx = ax + (bx - ax) * LIFT_ICON_TOWARDS_TOP;
    const cy = ay + (by - ay) * LIFT_ICON_TOWARDS_TOP;
    const liftDef = state.liftTypes.find((l) => l.id === typeId);
    const frame = liftDef ? liftDef.frame : 0;
    if (spriteSheet && spriteSheet.complete && spriteSheet.naturalWidth) {
      // Sprite sheet is 3 columns x 2 rows; frame index is row-major
      const COLS = 3;
      const ROWS = 2;
      const fw = spriteSheet.naturalWidth / COLS;
      const fh = spriteSheet.naturalHeight / ROWS;
      const col = frame % COLS;
      const row = Math.floor(frame / COLS);
      const srcX = col * fw;
      const srcY = row * fh;
      const w = LIFT_ICON_SIZE;
      const h = (fh / fw) * w;
      ctx.save();
      ctx.translate(sx(cx), sy(cy));
      ctx.drawImage(spriteSheet, srcX, srcY, fw, fh, -w / 2, -h / 2, w, h);
      ctx.restore();
    } else {
      ctx.save();
      ctx.translate(sx(cx), sy(cy));
      ctx.strokeStyle = liftColor;
      ctx.fillStyle = liftColor;
      ctx.lineWidth = 2;
      ctx.strokeRect(-6, -4, 12, 8);
      ctx.restore();
    }
  }

  /** Draw lift name parallel to the line, offset to the right of the direction. Never upside down. */
  function drawLiftLabel(name, ax, ay, bx, by) {
    if (!name) return;
    const midX = (ax + bx) / 2;
    const midY = (ay + by) / 2;
    const angle = Math.atan2(by - ay, bx - ax);
    const drawAngle = normalizeAngleForDisplay(angle);
    const offset = 22;
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

  /** Draw a smooth curve through all points (Catmull-Rom style with cubic Bezier). dashed: use dotted line (e.g. for freeride). */
  function drawSmoothCurve(points, color, lineWidth = SLOPE_LINE_WIDTH, dashed = false) {
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

  // Draw saved slopes (smooth curves) - BELOW lifts
  const diffColors = { green: '#34a853', blue: '#4285f4', red: '#ea4335', black: '#1f1f1f', freeride: '#2d1b4e' };
  const SLOPE_NUMBER_RADIUS = 10;

  /** Get point at a fraction (0–1) along the polyline by path length. */
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

  /** Draw slope number in a circle or, for freeride, in a black diamond. */
  function drawSlopeNumber(pts, color, number, difficulty) {
    if (pts.length === 0) return;
    const mid = getPointAtPathFraction(pts, 0.5);
    if (!mid) return;
    const cx = mid.x * scaleX;
    const cy = mid.y * scaleY;
    const isFreeride = difficulty === 'freeride';
    ctx.save();
    if (isFreeride) {
      // Black diamond (same size as circle: half-width/height = SLOPE_NUMBER_RADIUS)
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

  state.slopes.forEach((slope, i) => {
    const pts = slope.points.map((p) => fromNormalized(p.x, p.y));
    const color = diffColors[slope.difficulty] || slope.difficulty;
    const isFreeride = slope.difficulty === 'freeride';
    drawSmoothCurve(pts, color, SLOPE_LINE_WIDTH, isFreeride);
    drawSlopeNumber(pts, color, i + 1, slope.difficulty);
  });

  // Draw current slope in progress
  if (state.slopePoints.length > 0) {
    const c = diffColors[state.difficulty] || state.difficulty;
    const isFreeride = state.difficulty === 'freeride';
    drawSmoothCurve(state.slopePoints, c, SLOPE_LINE_WIDTH, isFreeride);
    if (state.slopeDrawMode === 'points') {
      state.slopePoints.forEach((p, i) => {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(p.x * scaleX, p.y * scaleY, i === 0 ? 6 : 4, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }

  // Draw saved lifts (black line + dots + type icon + name) - ABOVE slopes
  const liftColor = '#1a1a1a';
  state.lifts.forEach((lift, i) => {
    const a = fromNormalized(lift.bottomStation.x, lift.bottomStation.y);
    const b = fromNormalized(lift.topStation.x, lift.topStation.y);
    drawLine(a.x, a.y, b.x, b.y, liftColor);
    drawLiftStationDot(a.x, a.y);
    drawLiftStationDot(b.x, b.y);
    const typeId = lift.type || (state.liftTypes[0] && state.liftTypes[0].id);
    if (typeId) drawLiftIcon(a.x, a.y, b.x, b.y, typeId);
    drawLiftLabel(lift.name || `Lift ${i + 1}`, a.x, a.y, b.x, b.y);
  });

  // Draw current lift in progress
  if (state.liftBottom) {
    const a = state.liftBottom;
    drawLiftStationDot(a.x, a.y);
    if (state.liftTop) {
      drawLine(a.x, a.y, state.liftTop.x, state.liftTop.y, liftColor);
      drawLiftStationDot(state.liftTop.x, state.liftTop.y);
    } else if (state.mouseImage) {
      const mx = state.mouseImage.x;
      const my = state.mouseImage.y;
      const lengthM = getLiftLengthM(a, { x: mx, y: my });
      const typeId = state.liftType || (state.liftTypes[0] && state.liftTypes[0].id);
      const liftDef = state.liftTypes.find((l) => l.id === typeId);
      const maxLength = (liftDef && liftDef.max_length != null) ? liftDef.max_length : Infinity;
      const tooLong = lengthM > maxLength;
      ctx.save();
      ctx.strokeStyle = tooLong ? 'rgba(180, 0, 0, 0.9)' : 'rgba(26, 26, 26, 0.5)';
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
      ctx.fillStyle = tooLong ? 'rgba(120, 0, 0, 0.95)' : 'rgba(0, 0, 0, 0.75)';
      ctx.font = 'bold 12px "DM Sans", system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const msg = tooLong
        ? `Too long for this lift (max ${maxLength} m)`
        : `${lengthM} m`;
      ctx.fillText(msg, (mx + offsetX) * scaleX, (my + offsetY) * scaleY);
      ctx.restore();
    }
  }

  // Draw cottages (icon at position, above lifts)
  const COTTAGE_ICON_SIZE = 64;
  state.cottages.forEach((cottage, i) => {
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
/*     // Optional: draw cottage name below icon
    const name = cottage.name || `Cottage ${i + 1}`;
    if (name) {
      ctx.save();
      ctx.translate(cx, cy + COTTAGE_ICON_SIZE / 2 + 10);
      ctx.fillStyle = liftColor;
      ctx.font = 'bold 11px "DM Sans", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(name, 0, 0);
      ctx.restore();
    } */
  });
}

function renderLists() {
  DOM.liftList.innerHTML = state.lifts
    .map(
      (lift, i) => {
        const name = (lift.name || `Lift ${i + 1}`).trim();
        const typeId = lift.type || (state.liftTypes[0] && state.liftTypes[0].id);
        const typeLabel = (state.liftTypes.find((l) => l.id === typeId) || {}).name || typeId || 'Lift';
        return `<li><span class="lift-list-name editable-lift-name" data-idx="${i}" title="${escapeHtml(typeLabel)} – click to edit name">${escapeHtml(name)}</span> <button type="button" class="remove-btn" data-type="lift" data-idx="${i}">Remove</button></li>`;
      }
    )
    .join('');
  DOM.slopeList.innerHTML = state.slopes
    .map(
      (s, i) =>
        `<li><span class="diff-dot" style="color:${getDiffColor(s.difficulty)}">●</span> ${s.difficulty} ${i + 1} <button type="button" class="remove-btn" data-type="slope" data-idx="${i}">Remove</button></li>`
    )
    .join('');
  DOM.cottageList.innerHTML = state.cottages
    .map(
      (c, i) =>
        `<li><span class="cottage-list-name" title="${escapeHtml(c.name || '')}">${escapeHtml(c.name || `Cottage ${i + 1}`)}</span> <button type="button" class="remove-btn" data-type="cottage" data-idx="${i}">Remove</button></li>`
    )
    .join('');

  DOM.liftList.querySelectorAll('.editable-lift-name').forEach((el) => {
    el.addEventListener('click', () => {
      const idx = Number(el.dataset.idx);
      const lift = state.lifts[idx];
      const current = (lift && (lift.name || `Lift ${idx + 1}`)) || `Lift ${idx + 1}`;
      const newName = window.prompt('Lift name', current);
      if (newName !== null && lift) {
        lift.name = newName.trim() || `Lift ${idx + 1}`;
        renderLists();
        draw();
      }
    });
  });
  DOM.liftList.querySelectorAll('.remove-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.lifts.splice(Number(btn.dataset.idx), 1);
      renderLists();
      draw();
    });
  });
  DOM.slopeList.querySelectorAll('.remove-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.slopes.splice(Number(btn.dataset.idx), 1);
      renderLists();
      draw();
    });
  });
  DOM.cottageList.querySelectorAll('.remove-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.cottages.splice(Number(btn.dataset.idx), 1);
      renderLists();
      draw();
    });
  });
}

function getDiffColor(d) {
  const map = { green: '#34a853', blue: '#4285f4', red: '#ea4335', black: '#1f1f1f', freeride: '#2d1b4e' };
  return map[d] || d;
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function exportConfig() {
  const config = {
    imageWidth: state.imageWidth,
    imageHeight: state.imageHeight,
    lifts: state.lifts,
    slopes: state.slopes,
    cottages: state.cottages,
  };
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'ski-map-config.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

function onConfigImported(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const config = JSON.parse(reader.result);
      const defaultTypeId = state.liftTypes[0] ? state.liftTypes[0].id : null;
      state.lifts = (config.lifts ?? []).map((l, i) => ({
        bottomStation: l.bottomStation,
        topStation: l.topStation,
        type: (state.liftTypes.some((lt) => lt.id === l.type) && l.type) ? l.type : defaultTypeId,
        name: l.name || `Lift ${i + 1}`,
      }));
      state.slopes = config.slopes ?? [];
      state.cottages = (config.cottages ?? []).map((c, i) => ({
        position: c.position,
        name: c.name || `Cottage ${i + 1}`,
      }));
      if (config.imageWidth) state.imageWidth = config.imageWidth;
      if (config.imageHeight) state.imageHeight = config.imageHeight;
      renderLists();
      draw();
    } catch (err) {
      alert('Invalid config file: ' + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

window.addEventListener('resize', () => {
  if (state.image) syncCanvasSize();
});

init();
