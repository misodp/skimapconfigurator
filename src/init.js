/**
 * Application init: DOM wiring, tech tree load, mode and toolbar, asset loading.
 */

import cottageIconUrl from '../assets/images/cottage.webp';
import spriteSheetUrl from '../assets/images/SpriteSheet.webp';
import skidollarg2mUrl from '../assets/images/Skidollar_g2m.webp';
import animalsH1Url from '../assets/images/skiers/animals_h1.webp';
import animalsH2Url from '../assets/images/skiers/animals_h2.webp';
import animalsA1Url from '../assets/images/skiers/animals_a1.webp';
import animalsA2Url from '../assets/images/skiers/animals_a2.webp';
import badgeTopWorldUrl from '../assets/images/badges/top_world_at.webp';
import badgeFamilyUrl from '../assets/images/badges/family_friendly_at.webp';
import badgeAlpineUrl from '../assets/images/badges/high_alpine_at.webp';
import badgeFreerideUrl from '../assets/images/badges/freeride_paradise_at.webp';
import techTreeData from '../assets/data/techTree.json';
import { state, DOM } from './state';
import { refresh, updateBudgetDisplay, exportConfig, onConfigImported } from './config.js';
import { startSimulation, updateDateDisplay, applySimulationSpeed } from './simulation';
import { updateWeatherDisplay } from './weather-icon';
import { syncCanvasSize, onCanvasClick, onCanvasMouseDown, onCanvasMouseMove, onCanvasMouseUp, onCanvasDblClick, hideLiftHoverPopup, hideGroomerHoverPopup, hideSlopeHoverPopup, handleLiftPopupClick, handleGroomerPopupClick, handleSlopePopupClick } from './canvas.js';
import { renderLiftTypeDropdown, setLiftType, updateCancelLiftButton } from './ui/lifts.js';
import { renderSlopeTypeButtons, setDifficulty } from './ui/slopes.js';
import { renderGroomerTypeDropdown, getGroomerImageUrls, getGroomerMapImageUrls, setGroomerType } from './ui/groomers.js';
import { initInvestCompactSidebar } from './ui/invest-inventory.js';
import { updateMountainImage, setMountainMode } from './mountain-images.js';
import { initNewsFeed } from './news-feed.js';
import { updateTicketPriceDisplay } from './config.js';

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
  const urls = getGroomerMapImageUrls();
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
  state.customMountainUrl = url;
  DOM.mountainImage.onload = () => {
    URL.revokeObjectURL(url);
    setMountainMode(true);
    syncCanvasSize();
    DOM.canvas.classList.remove('no-image');
  };
  DOM.mountainImage.src = url;
}

export function init() {
  DOM.mountainImage = document.getElementById('mountainImage');
  DOM.canvas = document.getElementById('drawCanvas');
  DOM.ctx = DOM.canvas.getContext('2d');
  DOM.imageInput = document.getElementById('imageInput');
  DOM.saveBtn = document.getElementById('saveBtn');
  DOM.loadBtn = document.getElementById('loadBtn');
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
  DOM.currentDateDisplay = document.getElementById('currentDateDisplay');
  DOM.seasonDisplay = document.getElementById('seasonDisplay');
  DOM.weatherDisplay = document.getElementById('weatherDisplay');
  DOM.visitorsDisplay = document.getElementById('visitorsDisplay');
  DOM.salesDisplay = document.getElementById('salesDisplay');
  DOM.operatingCostsDisplay = document.getElementById('operatingCostsDisplay');
  DOM.profitDisplay = document.getElementById('profitDisplay');
  DOM.snowDepthDisplay = document.getElementById('snowDepthDisplay');
  DOM.simSpeedButtons = document.querySelectorAll('.sim-speed-btn');
  DOM.liftExperienceDisplay = document.getElementById('liftExperienceDisplay');
  DOM.slopeExperienceDisplay = document.getElementById('slopeExperienceDisplay');
  DOM.slopeQualityDisplay = document.getElementById('slopeQualityDisplay');
  DOM.satisfactionDisplay = document.getElementById('satisfactionDisplay');

  DOM.imageInput.addEventListener('change', onImageSelected);
  if (DOM.saveBtn) DOM.saveBtn.addEventListener('click', exportConfig);
  if (DOM.loadBtn && DOM.importInput) DOM.loadBtn.addEventListener('click', () => DOM.importInput.click());
  DOM.importInput.addEventListener('change', onConfigImported);
  window.onGameStateRestored = () => {
    state.customMountainUrl = null;
    state.displayedMountainThreshold = null;
    state.mountainPendingThreshold = null;
    state.mountainDaysAtPending = 0;
    setMountainMode(false);
    updateMountainImage();
    const openBtn = document.getElementById('resortOpenBtn');
    const closedBtn = document.getElementById('resortClosedBtn');
    const open = state.resortOpen === true;
    if (openBtn) { openBtn.classList.toggle('active', open); openBtn.setAttribute('aria-pressed', String(open)); }
    if (closedBtn) { closedBtn.classList.toggle('active', !open); closedBtn.setAttribute('aria-pressed', String(!open)); }
    setMode(state.mode);
    renderLiftTypeDropdown({ skipPanelBlank: true });
    renderGroomerTypeDropdown({ skipPanelBlank: true });
    renderSlopeTypeButtons({ skipPanelBlank: true });
    updateDateDisplay();
    updateWeatherDisplay();
    applySimulationSpeed();
  };

  DOM.modeBtns.forEach((btn) => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
  });

  const resortOpenBtn = document.getElementById('resortOpenBtn');
  const resortClosedBtn = document.getElementById('resortClosedBtn');
  function updateResortButtons() {
    const open = state.resortOpen === true;
    if (resortOpenBtn) {
      resortOpenBtn.classList.toggle('active', open);
      resortOpenBtn.setAttribute('aria-pressed', String(open));
    }
    if (resortClosedBtn) {
      resortClosedBtn.classList.toggle('active', !open);
      resortClosedBtn.setAttribute('aria-pressed', String(!open));
    }
  }
  if (resortOpenBtn) resortOpenBtn.addEventListener('click', () => { state.resortOpen = true; updateResortButtons(); });
  if (resortClosedBtn) resortClosedBtn.addEventListener('click', () => { state.resortOpen = false; updateResortButtons(); });
  updateResortButtons();

  const ticketSlider = /** @type {HTMLInputElement | null} */ (document.getElementById('ticketPriceSlider'));
  if (ticketSlider) {
    const steps = [1.0, 1.25, 1.5, 1.75, 2.0];
    ticketSlider.addEventListener('input', () => {
      const idx = Math.max(0, Math.min(steps.length - 1, Number(ticketSlider.value) || 0));
      state.ticketPrice = steps[idx];
      updateTicketPriceDisplay();
    });
  }

  if (DOM.simSpeedButtons) {
    DOM.simSpeedButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const speed = Number(btn.dataset.speed ?? '1') || 0;
        state.simulationSpeed = Math.max(0, Math.min(3, speed));
        DOM.simSpeedButtons.forEach((b) => b.classList.toggle('active', b === btn));
        applySimulationSpeed();
      });
    });
  }

  initInvestCompactSidebar();
  document.addEventListener('invest-inventory-select', (e) => {
    const { mode, typeId } = e.detail || {};
    if (mode === 'lift' && typeId) {
      setLiftType(typeId);
      renderLiftTypeDropdown({ skipPanelBlank: true });
    } else if (mode === 'slope' && typeId) {
      setDifficulty(typeId);
      renderSlopeTypeButtons({ skipPanelBlank: true });
    } else if (mode === 'groomer' && typeId) {
      setGroomerType(typeId);
      renderGroomerTypeDropdown({ skipPanelBlank: true });
    }
    if (mode) {
      setMode(mode);
      state.buildArmed = true;
      state.mouseImage = null;
      const cancelBuildBtn = document.getElementById('cancelBuildBtn');
      if (cancelBuildBtn) cancelBuildBtn.classList.remove('hidden');
    }
  });

  const cancelBuildBtn = document.getElementById('cancelBuildBtn');
  if (cancelBuildBtn) {
    cancelBuildBtn.addEventListener('click', () => {
      if (state.mode === 'lift' && state.liftBottom) cancelLift();
      else cancelSlope();
      state.buildArmed = false;
      state.mouseImage = null;
      updateCancelLiftButton();
      cancelBuildBtn.classList.add('hidden');
      const cancelSlopeEl = document.getElementById('cancelSlopeBtn');
      if (cancelSlopeEl) cancelSlopeEl.classList.add('hidden');
      refresh();
    });
  }

  const sidebarTabs = document.querySelectorAll('.sidebar-tab');
  const investPanel = document.getElementById('investPanel');
  const statisticsPanel = document.getElementById('statisticsPanel');
  sidebarTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      sidebarTabs.forEach((t) => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      if (investPanel) {
        investPanel.classList.toggle('active', tabName === 'invest');
      }
      if (statisticsPanel) {
        statisticsPanel.classList.toggle('active', tabName === 'statistics');
      }
      if (tabName === 'invest') {
        hideLiftHoverPopup();
      }
      if (tabName === 'statistics') {
        if (typeof window.liftDetailSetBlank === 'function') window.liftDetailSetBlank();
        if (typeof window.groomerDetailSetBlank === 'function') window.groomerDetailSetBlank();
        if (typeof window.slopeDetailSetBlank === 'function') window.slopeDetailSetBlank();
        const fp = document.getElementById('liftDetailFloating');
        if (fp) {
          fp.hidden = true;
          fp.setAttribute('aria-hidden', 'true');
        }
      }
    });
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
    const popup = document.getElementById('liftHoverPopup');
    if (!popup || !popup.contains(e.relatedTarget)) hideLiftHoverPopup();
    const groomerPopup = document.getElementById('groomerHoverPopup');
    if (!groomerPopup || !groomerPopup.contains(e.relatedTarget)) hideGroomerHoverPopup();
    const slopePopup = document.getElementById('slopeHoverPopup');
    if (!slopePopup || !slopePopup.contains(e.relatedTarget)) hideSlopeHoverPopup();
    onCanvasMouseUp(e);
  });
  document.addEventListener('click', handleLiftPopupClick);
  document.addEventListener('click', handleGroomerPopupClick);
  document.addEventListener('click', handleSlopePopupClick);

  document.getElementById('cancelSlopeBtn').addEventListener('click', cancelSlope);
  document.getElementById('cancelLiftBtn').addEventListener('click', cancelLift);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (state.mode === 'lift' && state.liftBottom) cancelLift();
      else cancelSlope();
      state.buildArmed = false;
      state.mouseImage = null;
      const cancelBuildBtn = document.getElementById('cancelBuildBtn');
      if (cancelBuildBtn) cancelBuildBtn.classList.add('hidden');
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
  initNewsFeed([animalsH1Url, animalsH2Url], [animalsA1Url, animalsA2Url]);
  renderLiftTypeDropdown();
  renderSlopeTypeButtons();
  renderGroomerTypeDropdown();
  setMode('lift');
  if (state.liftType) setLiftType(state.liftType);
  if (state.difficulty) setDifficulty(state.difficulty);
  refresh();

  const budgetIcon = document.getElementById('budgetIcon');
  if (budgetIcon) budgetIcon.src = skidollarg2mUrl;
  document.querySelectorAll('.stat-skidollar-icon').forEach((img) => {
    img.src = skidollarg2mUrl;
  });

  const badgeTopWorld = document.getElementById('badgeTopWorld');
  const badgeFamily = document.getElementById('badgeFamily');
  const badgeAlpine = document.getElementById('badgeAlpine');
  const badgeFreeride = document.getElementById('badgeFreeride');
  if (badgeTopWorld) badgeTopWorld.src = badgeTopWorldUrl;
  if (badgeFamily) badgeFamily.src = badgeFamilyUrl;
  if (badgeAlpine) badgeAlpine.src = badgeAlpineUrl;
  if (badgeFreeride) badgeFreeride.src = badgeFreerideUrl;

  DOM.mountainImage.onload = () => {
    state.image = DOM.mountainImage;
    syncCanvasSize();
    DOM.canvas.classList.remove('no-image');
  };
  updateMountainImage();

  window.addEventListener('resize', () => {
    if (state.image) syncCanvasSize();
  });

  updateDateDisplay();
  startSimulation();

  initSplash();
}

const SPLASH_DURATION_MS = 2800;

function initSplash() {
  const overlay = document.getElementById('splashOverlay');
  if (!overlay) return;

  function dissolve() {
    overlay.classList.add('splash-dissolve');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.addEventListener('transitionend', () => {
      overlay.style.visibility = 'hidden';
    }, { once: true });
  }

  overlay.addEventListener('click', () => dissolve(), { once: true });
  setTimeout(dissolve, SPLASH_DURATION_MS);
}
