/**
 * Application init: DOM wiring, tech tree load, mode and toolbar, asset loading.
 */

import defaultMountainUrl from '../assets/images/mountain1.png';
import cottageIconUrl from '../assets/images/cottage.png';
import spriteSheetUrl from '../assets/images/SpriteSheet.png';
import skidollarg2mUrl from '../assets/images/Skidollar_g2m.png';
import techTreeData from '../assets/data/techTree.json';
import { state, DOM } from './state';
import { refresh, updateBudgetDisplay, exportConfig, onConfigImported } from './config.js';
import { syncCanvasSize, onCanvasClick, onCanvasMouseDown, onCanvasMouseMove, onCanvasMouseUp, onCanvasDblClick } from './canvas.js';
import { renderLiftTypeDropdown, setLiftType, updateCancelLiftButton } from './ui/lifts.js';
import { renderSlopeTypeButtons, setDifficulty } from './ui/slopes.js';
import { renderGroomerTypeDropdown, getGroomerImageUrls } from './ui/groomers.js';

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

  refresh();
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
  refresh();
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
  refresh();
}

function cancelLift() {
  state.liftBottom = null;
  state.liftTop = null;
  state.mouseImage = null;
  const btn = document.getElementById('cancelLiftBtn');
  if (btn) btn.classList.add('hidden');
  refresh();
}

function loadSpriteSheet() {
  if (!spriteSheetUrl) return;
  const img = new Image();
  img.onload = () => {
    state.spriteSheet = img;
    renderLiftTypeDropdown();
    refresh();
  };
  img.src = spriteSheetUrl;
}

function loadCottageIcon() {
  if (!cottageIconUrl) return;
  const img = new Image();
  img.onload = () => {
    state.cottageIcon = img;
    refresh();
  };
  img.src = cottageIconUrl;
}

function loadGroomerImages() {
  const urls = getGroomerImageUrls();
  if (!state.groomerTypes.length) return;
  state.groomerTypes.forEach((g) => {
    const url = urls[g.image];
    if (url) {
      const img = new Image();
      img.onload = () => refresh();
      img.src = url;
      state.groomerImages[g.id] = img;
    }
  });
}

function onImageSelected(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  DOM.mountainImage.onload = () => {
    URL.revokeObjectURL(url);
    state.image = DOM.mountainImage;
    syncCanvasSize();
  };
  DOM.mountainImage.src = url;
  DOM.canvas.classList.remove('no-image');
}

export function init() {
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
  state.difficulty = state.slopeTypes.length > 0
    ? (state.slopeTypes.find((s) => s.difficulty === 'Blue' || s.id === 'blue_easy') || state.slopeTypes[0]).id
    : null;
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
  refresh();

  const budgetIcon = document.getElementById('budgetIcon');
  if (budgetIcon) budgetIcon.src = skidollarg2mUrl;

  DOM.mountainImage.onload = () => {
    state.image = DOM.mountainImage;
    syncCanvasSize();
  };
  DOM.mountainImage.src = defaultMountainUrl;
  DOM.canvas.classList.remove('no-image');

  window.addEventListener('resize', () => {
    if (state.image) syncCanvasSize();
  });
}
