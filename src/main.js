/**
 * Ski Map Configurator - Main application
 * Configure ski lifts (bottom → top) and slopes (curved lines with difficulty) on a mountain image.
 * Config is stored as JSON with normalized coordinates (0–1) relative to image dimensions.
 */

import defaultMountainUrl from '../assets/images/mountain1.png';
import cottageIconUrl from '../assets/images/cottage.png';
import spriteSheetUrl from '../assets/images/SpriteSheet.png';
import skidollarg2mUrl from '../assets/images/Skidollar_g2m.png';
import techTreeData from '../assets/data/techTree.json';
import groomerPrinothP15 from '../assets/images/Prinoth_p15.png';
import groomerRatracS from '../assets/images/Ratrac_s.png';
import groomerPb145 from '../assets/images/PistenBully_145.png';
import groomerPb170 from '../assets/images/PistenBully_170.png';

const GROOMER_IMAGE_URLS = {
  'Prinoth_p15.png': groomerPrinothP15,
  'Ratrac_s.png': groomerRatracS,
  'PistenBully_145.png': groomerPb145,
  'PistenBully_170.png': groomerPb170,
};

/** Difficulty display name -> icon/emoji for slope type buttons. */
const SLOPE_DIFFICULTY_ICONS = { Green: '🟢', Blue: '🔵', Red: '🔴', Black: '⚫', Freeride: '◆' };

const state = {
  mode: 'lift', // 'lift' | 'slope' | 'cottage' | 'groomer'
  liftType: null,
  liftTypes: [],
  slopeTypes: [],
  difficulty: null,
  groomerType: null, // selected groomer type id
  groomerTypes: [], // from techTree.groomers
  image: null,
  imageWidth: 0,
  imageHeight: 0,
  lifts: [],
  slopes: [],
  cottages: [],
  groomers: [], // [{ position: {x,y}, groomerTypeId }]
  budget: 100000,
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
  groomerHint: null,
  groomerList: null,
  groomerOptions: null,
};

let spriteSheet = null; // HTMLImageElement (loaded async)
let cottageIcon = null; // HTMLImageElement
const groomerImages = {}; // groomerTypeId -> HTMLImageElement

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
  DOM.slopeOptions = document.querySelector('.slope-options');
  DOM.liftOptions = document.querySelector('.lift-options');
  DOM.liftHint = document.querySelector('.lift-hint');
  DOM.slopeHint = document.querySelector('.slope-hint');
  DOM.cottageHint = document.querySelector('.cottage-hint');
  DOM.groomerHint = document.querySelector('.groomer-hint');
  DOM.groomerList = document.getElementById('groomerList');
  DOM.groomerOptions = document.querySelector('.groomer-options');

  DOM.imageInput.addEventListener('change', onImageSelected);
  DOM.exportBtn.addEventListener('click', exportConfig);
  DOM.importBtn.addEventListener('click', () => DOM.importInput.click());
  DOM.importInput.addEventListener('change', onConfigImported);

  DOM.modeBtns.forEach((btn) => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
  });
  const difficultyContainer = document.getElementById('difficultyButtons');
  if (difficultyContainer) {
    difficultyContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-difficulty]');
      if (btn) setDifficulty(btn.dataset.difficulty);
    });
  }

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
  document.getElementById('cancelLiftBtn').addEventListener('click', cancelLift);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (state.mode === 'lift' && state.liftBottom) cancelLift();
      else cancelSlope();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
      e.preventDefault();
      state.budget += 10000;
      updateBudgetDisplay();
    }
  });

  state.liftTypes = (techTreeData && techTreeData.lifts) ? [...techTreeData.lifts] : [];
  state.liftType = state.liftTypes.length > 0 ? state.liftTypes[0].id : null;
  state.slopeTypes = (techTreeData && techTreeData.slopes) ? [...techTreeData.slopes] : [];
  state.difficulty = state.slopeTypes.length > 0 ? state.slopeTypes[0].id : null;
  state.groomerTypes = (techTreeData && techTreeData.groomers) ? [...techTreeData.groomers] : [];
  state.groomerType = state.groomerTypes.length > 0 ? state.groomerTypes[0].id : null;
  loadSpriteSheet();
  loadCottageIcon();
  loadGroomerImages();
  renderLiftTypeDropdown();
  renderSlopeTypeButtons();
  renderGroomerTypeDropdown();
  setMode('lift');
  if (state.liftType) setLiftType(state.liftType);
  if (state.difficulty) setDifficulty(state.difficulty);
  renderLists();
  const budgetIcon = document.getElementById('budgetIcon');
  if (budgetIcon) budgetIcon.src = skidollarg2mUrl;
  updateBudgetDisplay();

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
    const lifts = state.liftTypes;
    const costs = lifts.map((l) => (l.base_cost != null ? Number(l.base_cost) : 0));
    const opCosts = lifts.map((l) => {
      const v = l.base_operating_cost != null ? l.base_operating_cost : l.base_maintenance;
      return v != null ? Number(v) : 0;
    });
    const minCost = Math.min(...costs);
    const maxCost = Math.max(...costs);
    const minOp = Math.min(...opCosts);
    const maxOp = Math.max(...opCosts);
    const opCost = lift.base_operating_cost != null ? lift.base_operating_cost : lift.base_maintenance;
    const costScale = scale1to3(lift.base_cost, minCost, maxCost);
    const opScale = scale1to3(opCost, minOp, maxOp);
    const costIcons = skidollarIconsHtml(costScale, skidollarg2mUrl);
    const opIcons = skidollarIconsHtml(opScale, skidollarg2mUrl);
    const prosCons = Array.isArray(lift.pros_cons) ? lift.pros_cons : [];
    const prosConsHtml = prosCons
      .map((item) => {
        const s = String(item).trim();
        const isPro = s.startsWith('+');
        const cls = isPro ? 'lift-detail-pro' : 'lift-detail-con';
        return `<li class="${cls}">${escapeHtml(s)}</li>`;
      })
      .join('');
    floatingPanel.innerHTML = `
      <button type="button" class="lift-detail-close" title="Close" aria-label="Close">×</button>
      <div class="lift-type-detail-icon" style="${style}"></div>
      <dl class="lift-type-detail-fields">
        <dt>Brand</dt><dd>${escapeHtml(lift.brand || '—')}</dd>
        <dt>Name</dt><dd>${escapeHtml(lift.name || '—')}</dd>
        <dt>Cost</dt><dd class="lift-detail-skidollars">${costIcons}</dd>
        <dt>Operating cost</dt><dd class="lift-detail-skidollars">${opIcons}</dd>
        <dt>Max length</dt><dd>${lift.max_length != null ? formatNumber(lift.max_length) + ' m' : '—'}</dd>
        <dt>Speed</dt><dd>${formatNumber(lift.speed)} m/s</dd>
        <dt>Capacity</dt><dd>${formatNumber(lift.capacity)} p./hour</dd>
        <dt>Description</dt><dd class="lift-detail-description">${escapeHtml(lift.description || '—')}${prosConsHtml ? `<ul class="lift-detail-pros-cons">${prosConsHtml}</ul>` : ''}</dd>
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

/** Groomer type list and floating detail panel (reuses liftDetailFloating when in groomer mode). */
function renderGroomerTypeDropdown() {
  const container = document.getElementById('groomerTypeDropdown');
  const floatingPanel = document.getElementById('liftDetailFloating');
  if (!container || !state.groomerTypes.length) return;

  function setPanelBlank() {
    if (!floatingPanel) return;
    floatingPanel.innerHTML = '';
  }

  function getGroomerImageUrl(groomer) {
    const filename = groomer && groomer.image;
    return (filename && GROOMER_IMAGE_URLS[filename]) || '';
  }

  function fillFloatingDetail(groomer) {
    if (!floatingPanel || !groomer) return;
    const imgUrl = getGroomerImageUrl(groomer);
    const imgHtml = imgUrl ? `<div class="groomer-detail-icon" style="background-image:url(${imgUrl})"></div>` : '';
    floatingPanel.innerHTML = `
      <button type="button" class="lift-detail-close" title="Close" aria-label="Close">×</button>
      ${imgHtml}
      <dl class="lift-type-detail-fields">
        <dt>Brand</dt><dd>${escapeHtml(groomer.brand || '—')}</dd>
        <dt>Name</dt><dd>${escapeHtml(groomer.name || '—')}</dd>
        <dt>Cost</dt><dd class="lift-detail-skidollars"><img src="${skidollarg2mUrl}" alt="" class="skidollar-icon" /> ${formatCurrency(groomer.purchase_cost)}</dd>
        <dt>Operating cost</dt><dd class="lift-detail-skidollars"><img src="${skidollarg2mUrl}" alt="" class="skidollar-icon" /> ${formatNumber(groomer.base_operating_cost)}</dd>
        <dt>Capacity</dt><dd>${formatNumber(groomer.grooming_capacity)}</dd>
        <dt>Description</dt><dd class="lift-detail-description">${escapeHtml(groomer.description || '—')}</dd>
      </dl>
    `;
    const closeBtn = floatingPanel.querySelector('.lift-detail-close');
    if (closeBtn) closeBtn.addEventListener('click', () => setPanelBlank());
  }

  function showGroomerDetail(groomerId) {
    const groomer = state.groomerTypes.find((g) => g.id === groomerId) || state.groomerTypes[0];
    fillFloatingDetail(groomer);
    if (floatingPanel) {
      floatingPanel.hidden = false;
      floatingPanel.setAttribute('aria-hidden', 'false');
    }
  }

  container.innerHTML = state.groomerTypes
    .map((g) => {
      const isActive = state.groomerType === g.id ? ' active' : '';
      const imgUrl = getGroomerImageUrl(g);
      const iconStyle = imgUrl ? `style="background-image:url(${imgUrl})"` : '';
      return `<button type="button" data-groomer-type="${escapeHtml(g.id)}" class="groomer-type-btn${isActive}">
        <span class="groomer-type-icon" ${iconStyle}></span>
        <span class="groomer-type-label">${escapeHtml(g.name)}</span>
      </button>`;
    })
    .join('');

  container.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-groomer-type]');
    if (!btn) return;
    const id = btn.dataset.groomerType;
    state.groomerType = id;
    container.querySelectorAll('.groomer-type-btn').forEach((b) => b.classList.toggle('active', b.dataset.groomerType === id));
    showGroomerDetail(id);
  });

  window.groomerDetailSetBlank = setPanelBlank;
}

function setGroomerType(id) {
  if (!state.groomerTypes.some((g) => g.id === id)) return;
  state.groomerType = id;
}

function formatNumber(n) {
  if (n === undefined || n === null) return '—';
  if (Number.isInteger(n)) return String(n);
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** Format as currency (Ski dollars): locale grouping and 2 decimal places. */
function formatCurrency(n) {
  if (n === undefined || n === null) return '—';
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function updateBudgetDisplay() {
  const el = document.getElementById('budgetAmount');
  if (el) el.textContent = formatCurrency(state.budget);
}

/** Map value to relative scale 1–3 given min/max (for cost / operating cost display). */
function scale1to3(value, min, max) {
  if (value === undefined || value === null || max === min) return 2;
  const t = (Number(value) - min) / (max - min);
  return Math.max(1, Math.min(3, Math.round(1 + t * 2)));
}

/** Render 1–3 Skidollar icons for relative cost display. */
function skidollarIconsHtml(count, url) {
  if (!url || count < 1) return '—';
  const n = Math.max(1, Math.min(3, Math.round(count)));
  return Array.from({ length: n }, () => `<img src="${url}" alt="" class="skidollar-icon" />`).join('');
}

function loadCottageIcon() {
  if (!cottageIconUrl) return;
  const img = new Image();
  img.onload = () => { cottageIcon = img; draw(); };
  img.src = cottageIconUrl;
}

function loadGroomerImages() {
  if (!state.groomerTypes.length) return;
  state.groomerTypes.forEach((g) => {
    const url = GROOMER_IMAGE_URLS[g.image];
    if (url) {
      const img = new Image();
      img.onload = () => draw();
      img.src = url;
      groomerImages[g.id] = img;
    }
  });
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
  if (DOM.groomerOptions) DOM.groomerOptions.classList.toggle('hidden', mode !== 'groomer');
  if (DOM.groomerHint) DOM.groomerHint.classList.toggle('hidden', mode !== 'groomer');
  if (mode !== 'lift') state.liftBottom = null;
  state.liftTop = null;
  state.mouseImage = null;
  updateCancelLiftButton();
  const floatingPanel = document.getElementById('liftDetailFloating');
  if (floatingPanel) {
    if (mode === 'lift') {
      floatingPanel.hidden = false;
      floatingPanel.setAttribute('aria-hidden', 'false');
      if (typeof window.liftDetailSetBlank === 'function') window.liftDetailSetBlank();
    } else if (mode === 'groomer') {
      floatingPanel.hidden = false;
      floatingPanel.setAttribute('aria-hidden', 'false');
      if (typeof window.groomerDetailSetBlank === 'function') window.groomerDetailSetBlank();
    } else if (mode === 'slope') {
      floatingPanel.hidden = false;
      floatingPanel.setAttribute('aria-hidden', 'false');
      if (typeof window.slopeDetailSetBlank === 'function') window.slopeDetailSetBlank();
    } else {
      floatingPanel.hidden = true;
      floatingPanel.setAttribute('aria-hidden', 'true');
      floatingPanel.innerHTML = '';
    }
  }
  DOM.slopeHint.classList.toggle('hidden', mode !== 'slope');
  if (DOM.cottageHint) DOM.cottageHint.classList.toggle('hidden', mode !== 'cottage');
  const cancelBtn = document.getElementById('cancelSlopeBtn');
  if (cancelBtn) cancelBtn.classList.toggle('hidden', mode !== 'slope' || state.slopePoints.length === 0);
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

function cancelLift() {
  state.liftBottom = null;
  state.liftTop = null;
  state.mouseImage = null;
  const btn = document.getElementById('cancelLiftBtn');
  if (btn) btn.classList.add('hidden');
  draw();
}

function updateCancelLiftButton() {
  const btn = document.getElementById('cancelLiftBtn');
  if (btn) btn.classList.toggle('hidden', !(state.mode === 'lift' && state.liftBottom));
}

function setLiftType(type) {
  if (!state.liftTypes.some((l) => l.id === type)) return;
  state.liftType = type;
  if (typeof window.liftDropdownUpdateTrigger === 'function') window.liftDropdownUpdateTrigger();
}

function setDifficulty(slopeTypeId) {
  state.difficulty = slopeTypeId;
  const container = document.getElementById('difficultyButtons');
  if (container) {
    container.querySelectorAll('[data-difficulty]').forEach((b) => b.classList.toggle('active', b.dataset.difficulty === slopeTypeId));
  }
}

/** Return background-position style for slope sprite (3×2 grid, frame from tech tree). Used for list icon and detail panel. */
function getSlopeSpritePositionStyle(slopeType) {
  const frame = Math.min(COLS * ROWS - 1, Math.max(0, Number(slopeType.frame) ?? 0));
  const col = frame % COLS;
  const row = Math.floor(frame / COLS);
  const posX = COLS > 1 ? (col / (COLS - 1)) * 100 : 0;
  const posY = ROWS > 1 ? (row / (ROWS - 1)) * 100 : 0;
  return `background-position:${posX}% ${posY}%`;
}

/** Build slope type list and wire detail panel (same pattern as lifts: click type → show floating detail). */
function renderSlopeTypeButtons() {
  const container = document.getElementById('difficultyButtons');
  const floatingPanel = document.getElementById('liftDetailFloating');
  if (!container || !state.slopeTypes.length) return;

  function setPanelBlank() {
    if (!floatingPanel) return;
    floatingPanel.innerHTML = '';
  }

  function fillSlopeDetailFloating(st) {
    if (!floatingPanel || !st) return;
    const posStyle = getSlopeSpritePositionStyle(st);
    const costPerMeterHtml = st.cost_per_meter != null
      ? `<span class="lift-detail-skidollars"><img src="${skidollarg2mUrl}" alt="" class="skidollar-icon" /> ${formatNumber(st.cost_per_meter)} / m</span>`
      : '—';
    floatingPanel.innerHTML = `
      <button type="button" class="lift-detail-close" title="Close" aria-label="Close">×</button>
      <div class="lift-type-detail-icon slope-type-icon" style="${posStyle}"></div>
      <dl class="lift-type-detail-fields">
        <dt>Difficulty</dt><dd>${escapeHtml(st.difficulty || '—')}</dd>
        <dt>Cost per meter</dt><dd>${costPerMeterHtml}</dd>
        <dt>Description</dt><dd class="lift-detail-description">${escapeHtml(st.description || '—')}</dd>
      </dl>
    `;
    const closeBtn = floatingPanel.querySelector('.lift-detail-close');
    if (closeBtn) closeBtn.addEventListener('click', () => setPanelBlank());
  }

  function showSlopeFloatingPanel(slopeTypeId) {
    const st = state.slopeTypes.find((s) => s.id === slopeTypeId) || state.slopeTypes[0];
    fillSlopeDetailFloating(st);
    if (floatingPanel) {
      floatingPanel.hidden = false;
      floatingPanel.setAttribute('aria-hidden', 'false');
    }
  }

  container.innerHTML = `<div class="slope-type-buttons" data-slope-list></div>`;
  const listContainer = container.querySelector('[data-slope-list]');
  listContainer.innerHTML = state.slopeTypes
    .map((st) => {
      const isSelected = state.difficulty === st.id ? ' active' : '';
      const posStyle = getSlopeSpritePositionStyle(st);
      return `<button type="button" data-difficulty="${escapeHtml(st.id)}" class="lift-type-btn${isSelected}" title="${escapeHtml(st.difficulty)}"><span class="lift-type-icon slope-type-icon" style="${posStyle}"></span><span class="lift-type-label">${escapeHtml(st.difficulty)}</span></button>`;
    })
    .join('');

  listContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-difficulty]');
    if (!btn) return;
    const id = btn.dataset.difficulty;
    setDifficulty(id);
    listContainer.querySelectorAll('[data-difficulty]').forEach((b) => b.classList.toggle('active', b.dataset.difficulty === id));
    showSlopeFloatingPanel(id);
  });

  setPanelBlank();
  window.slopeDetailSetBlank = setPanelBlank;
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

/** Path length in meters for a polyline (image coords). Uses same scale as lifts. */
function getSlopePathLengthM(points) {
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

/** Cost for a slope from path length and current slope type's cost_per_meter. */
function getSlopeCost(lengthM) {
  const st = getSlopeType(state.difficulty);
  if (!st || st.cost_per_meter == null) return 0;
  return Math.round(lengthM * Number(st.cost_per_meter));
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
    const lengthM = getSlopePathLengthM(pts);
    const totalCost = getSlopeCost(lengthM);
    if (state.budget < totalCost) {
      window.alert(`Not enough budget to build this slope. Cost: ${formatCurrency(totalCost)}. Available: ${formatCurrency(state.budget)}.`);
      state.slopePoints = [];
      document.getElementById('cancelSlopeBtn').classList.add('hidden');
      draw();
      return;
    }
    state.budget -= totalCost;
    state.slopes.push({
      slopeTypeId: state.difficulty,
      points: pts.map((p) => toNormalized(p.x, p.y)),
    });
    updateBudgetDisplay();
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
      state.mouseImage = null;
      updateCancelLiftButton();
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
      const baseCost = (liftDef && liftDef.base_cost != null) ? Number(liftDef.base_cost) : 0;
      const costPerMeter = (liftDef && liftDef.cost_per_meter != null) ? Number(liftDef.cost_per_meter) : 0;
      const totalCost = Math.round(baseCost + lengthM * costPerMeter);
      if (state.budget < totalCost) {
        window.alert(`Not enough budget to build this lift. Cost: ${formatCurrency(totalCost)}. Available: ${formatCurrency(state.budget)}.`);
        draw();
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
      renderLists();
      updateBudgetDisplay();
      if (typeof window.liftDetailSetBlank === 'function') window.liftDetailSetBlank();
    }
  } else if (state.mode === 'cottage') {
    const pt = canvasToImage(x, y);
    const norm = toNormalized(pt.x, pt.y);
    const nextNum = state.cottages.length + 1;
    const name = window.prompt('Cottage name (optional)', `Cottage ${nextNum}`) || `Cottage ${nextNum}`;
    state.cottages.push({ position: norm, name: name.trim() || `Cottage ${nextNum}` });
    renderLists();
  } else if (state.mode === 'groomer') {
    const pt = canvasToImage(x, y);
    const norm = toNormalized(pt.x, pt.y);
    const typeId = state.groomerType || (state.groomerTypes[0] && state.groomerTypes[0].id);
    const groomerDef = state.groomerTypes.find((g) => g.id === typeId);
    const cost = (groomerDef && groomerDef.purchase_cost != null) ? Number(groomerDef.purchase_cost) : 0;
    if (state.budget < cost) {
      window.alert(`Not enough budget to buy this groomer. Cost: ${formatCurrency(cost)}. Available: ${formatCurrency(state.budget)}.`);
      draw();
      return;
    }
    state.budget -= cost;
    state.groomers.push({ position: norm, groomerTypeId: typeId });
    if (typeof window.groomerDetailSetBlank === 'function') window.groomerDetailSetBlank();
    updateBudgetDisplay();
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
      draw();
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
    updateBudgetDisplay();
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

  /** Draw a smooth curve through all points (Catmull-Rom style with cubic Bezier). dashed: use dotted line when slope type has linetype "dotted". */
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

  /** Draw slope number in a circle or, for diamond symbol, in a black diamond. */
  function drawSlopeNumber(pts, color, number, useDiamond) {
    if (pts.length === 0) return;
    const mid = getPointAtPathFraction(pts, 0.5);
    if (!mid) return;
    const cx = mid.x * scaleX;
    const cy = mid.y * scaleY;
    ctx.save();
    if (useDiamond) {
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
    const color = getDiffColor(slope);
    const st = getSlopeType(slope);
    const useDotted = st?.linetype === 'dotted';
    const useDiamond = st?.symbol === 'Diamond';
    drawSmoothCurve(pts, color, SLOPE_LINE_WIDTH, useDotted);
    drawSlopeNumber(pts, color, i + 1, useDiamond);
  });

  // Draw current slope in progress
  if (state.slopePoints.length > 0) {
    const currentSt = getSlopeType(state.difficulty);
    const useDotted = currentSt?.linetype === 'dotted';
    const useDiamond = currentSt?.symbol === 'Diamond';
    const lengthM = getSlopePathLengthM(state.slopePoints);
    const totalCost = getSlopeCost(lengthM);
    const insufficientFunds = state.budget < totalCost;
    const c = insufficientFunds ? 'rgba(180, 0, 0, 0.95)' : getDiffColor(state.difficulty);
    drawSmoothCurve(state.slopePoints, c, SLOPE_LINE_WIDTH, useDotted);
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
      const costStr = `${formatNumber(totalCost)} $`;
      const costLineY = labelY + lineHeight;
      ctx.fillText(costStr, labelX, costLineY);
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
  });

  // Draw groomers (icon at position)
  const GROOMER_ICON_SIZE = 48;
  state.groomers.forEach((groomer, i) => {
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
      ctx.restore();
    } else {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.fillStyle = '#4a5568';
      ctx.strokeStyle = '#2d3748';
      ctx.lineWidth = 2;
      ctx.fillRect(-12, -10, 24, 20);
      ctx.strokeRect(-12, -10, 24, 20);
      ctx.restore();
    }
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
      (s, i) => {
        const label = getSlopeType(s)?.difficulty ?? s.difficulty ?? 'Slope';
        return `<li><span class="diff-dot" style="color:${getDiffColor(s)}">●</span> ${escapeHtml(String(label))} ${i + 1} <button type="button" class="remove-btn" data-type="slope" data-idx="${i}">Remove</button></li>`;
      }
    )
    .join('');
  DOM.cottageList.innerHTML = state.cottages
    .map(
      (c, i) =>
        `<li><span class="cottage-list-name" title="${escapeHtml(c.name || '')}">${escapeHtml(c.name || `Cottage ${i + 1}`)}</span> <button type="button" class="remove-btn" data-type="cottage" data-idx="${i}">Remove</button></li>`
    )
    .join('');
  if (DOM.groomerList) {
    DOM.groomerList.innerHTML = state.groomers
      .map(
        (g, i) => {
          const typeLabel = (state.groomerTypes.find((t) => t.id === g.groomerTypeId) || {}).name || g.groomerTypeId || 'Groomer';
          return `<li><span class="groomer-list-name" title="${escapeHtml(typeLabel)}">${escapeHtml(typeLabel)} ${i + 1}</span> <button type="button" class="remove-btn" data-type="groomer" data-idx="${i}">Remove</button></li>`;
        }
      )
      .join('');
  }

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
  if (DOM.groomerList) {
    DOM.groomerList.querySelectorAll('.remove-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.type === 'groomer') {
          state.groomers.splice(Number(btn.dataset.idx), 1);
          renderLists();
          draw();
        }
      });
    });
  }
}

/** Resolve slope type from a slope object (with slopeTypeId or difficulty) or from a slope type id string. */
function getSlopeType(slopeOrId) {
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

function getDiffColor(slopeOrId) {
  const st = getSlopeType(slopeOrId);
  if (st && st.color) return st.color;
  if (st) return st.difficulty;
  return '#4285f4';
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
    groomers: state.groomers,
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
      state.slopes = (config.slopes ?? []).map((s) => {
        const points = s.points ?? [];
        let slopeTypeId = s.slopeTypeId;
        if (!slopeTypeId && s.difficulty != null && state.slopeTypes.length) {
          const key = String(s.difficulty).toLowerCase();
          const st = state.slopeTypes.find((t) => t.difficulty.toLowerCase() === key || t.id === s.difficulty);
          slopeTypeId = st?.id ?? null;
        }
        return { slopeTypeId: slopeTypeId ?? state.slopeTypes[0]?.id, points };
      });
      state.cottages = (config.cottages ?? []).map((c, i) => ({
        position: c.position,
        name: c.name || `Cottage ${i + 1}`,
      }));
      const defaultGroomerId = state.groomerTypes[0] ? state.groomerTypes[0].id : null;
      state.groomers = (config.groomers ?? []).map((g) => ({
        position: g.position,
        groomerTypeId: (state.groomerTypes.some((t) => t.id === g.groomerTypeId) && g.groomerTypeId) ? g.groomerTypeId : defaultGroomerId,
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
