/**
 * Ski Map Configurator - Main application
 * Configure ski lifts (bottom → top) and slopes (curved lines with difficulty) on a mountain image.
 * Config is stored as JSON with normalized coordinates (0–1) relative to image dimensions.
 */

const state = {
  mode: 'lift', // 'lift' | 'slope'
  difficulty: 'blue',
  image: null,
  imageWidth: 0,
  imageHeight: 0,
  lifts: [],
  slopes: [],
  // Lift placement
  liftBottom: null,
  liftTop: null,
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
  modeBtns: null,
  diffBtns: null,
  slopeOptions: null,
  liftHint: null,
  slopeHint: null,
};

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
  DOM.modeBtns = document.querySelectorAll('.mode-btn');
  DOM.diffBtns = document.querySelectorAll('.diff-btn');
  DOM.slopeOptions = document.querySelector('.slope-options');
  DOM.liftHint = document.querySelector('.lift-hint');
  DOM.slopeHint = document.querySelector('.slope-hint');

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
  DOM.canvas.addEventListener('mouseleave', onCanvasMouseUp);

  document.getElementById('cancelSlopeBtn').addEventListener('click', cancelSlope);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cancelSlope(); });

  setMode('lift');
  setDifficulty('blue');
  renderLists();
}

function setMode(mode) {
  state.mode = mode;
  state.liftBottom = null;
  state.liftTop = null;
  state.slopePoints = [];
  state.slopeDrawing = false;

  DOM.modeBtns.forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  DOM.slopeOptions.classList.toggle('hidden', mode !== 'slope');
  DOM.liftHint.classList.toggle('hidden', mode !== 'lift');
  DOM.slopeHint.classList.toggle('hidden', mode !== 'slope');
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

function getCanvasPoint(e) {
  const rect = DOM.canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

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

function onCanvasMouseMove(e) {
  if (!state.penDrawing || !state.image) return;
  const { x, y } = getCanvasPoint(e);
  const pt = canvasToImage(x, y);
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
    state.slopes.push({
      difficulty: state.difficulty,
      points: state.slopePoints.map((p) => toNormalized(p.x, p.y)),
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
      state.liftTop = { x: pt.x, y: pt.y, norm };
      state.lifts.push({
        bottomStation: state.liftBottom.norm,
        topStation: state.liftTop.norm,
      });
      state.liftBottom = null;
      state.liftTop = null;
      renderLists();
    }
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

  /** Draw a smooth curve through all points (Catmull-Rom style with cubic Bezier). */
  function drawSmoothCurve(points, color, lineWidth = 4) {
    if (points.length < 2) return;
    const sx = (x) => x * scaleX;
    const sy = (y) => y * scaleY;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
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
  }

  // Draw saved lifts (black line + dots at bottom and top station)
  const liftColor = '#1a1a1a';
  state.lifts.forEach((lift) => {
    const a = fromNormalized(lift.bottomStation.x, lift.bottomStation.y);
    const b = fromNormalized(lift.topStation.x, lift.topStation.y);
    drawLine(a.x, a.y, b.x, b.y, liftColor);
    drawLiftStationDot(a.x, a.y);
    drawLiftStationDot(b.x, b.y);
  });

  // Draw current lift in progress
  if (state.liftBottom) {
    const a = state.liftBottom;
    drawLiftStationDot(a.x, a.y);
    if (state.liftTop) {
      drawLine(a.x, a.y, state.liftTop.x, state.liftTop.y, liftColor);
      drawLiftStationDot(state.liftTop.x, state.liftTop.y);
    }
  }

  // Draw saved slopes (smooth curves)
  const diffColors = { green: '#34a853', blue: '#4285f4', red: '#ea4335', black: '#1f1f1f' };
  state.slopes.forEach((slope) => {
    const pts = slope.points.map((p) => fromNormalized(p.x, p.y));
    drawSmoothCurve(pts, diffColors[slope.difficulty] || slope.difficulty);
  });

  // Draw current slope in progress
  if (state.slopePoints.length > 0) {
    const c = diffColors[state.difficulty] || state.difficulty;
    drawSmoothCurve(state.slopePoints, c);
    if (state.slopeDrawMode === 'points') {
      state.slopePoints.forEach((p, i) => {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(p.x * scaleX, p.y * scaleY, i === 0 ? 6 : 4, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }
}

function renderLists() {
  DOM.liftList.innerHTML = state.lifts
    .map(
      (_, i) =>
        `<li>Lift ${i + 1} <button type="button" class="remove-btn" data-type="lift" data-idx="${i}">Remove</button></li>`
    )
    .join('');
  DOM.slopeList.innerHTML = state.slopes
    .map(
      (s, i) =>
        `<li><span class="diff-dot" style="color:${getDiffColor(s.difficulty)}">●</span> ${s.difficulty} ${i + 1} <button type="button" class="remove-btn" data-type="slope" data-idx="${i}">Remove</button></li>`
    )
    .join('');

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
}

function getDiffColor(d) {
  const map = { green: '#34a853', blue: '#4285f4', red: '#ea4335', black: '#1f1f1f' };
  return map[d] || d;
}

function exportConfig() {
  const config = {
    imageWidth: state.imageWidth,
    imageHeight: state.imageHeight,
    lifts: state.lifts,
    slopes: state.slopes,
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
      state.lifts = config.lifts ?? [];
      state.slopes = config.slopes ?? [];
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
