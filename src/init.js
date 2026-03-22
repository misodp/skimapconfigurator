/**
 * Application init: DOM wiring, tech tree load, mode and toolbar, asset loading.
 */

import cottageIconUrl from '../assets/images/cottage.webp';
import spriteSheetUrl from '../assets/images/SpriteSheet.webp';
import skidollarg2mUrl from '../assets/images/Skidollar_g2m.webp';
import skiersH1Url from '../assets/images/skiers/skiers_h1.webp';
import skiersH2Url from '../assets/images/skiers/skiers_h2.webp';
import skiersA1Url from '../assets/images/skiers/skiers_a1.webp';
import skiersA2Url from '../assets/images/skiers/skiers_a2.webp';
import badgeTopWorldUrl from '../assets/images/badges/top_world.webp';
import badgeFamilyUrl from '../assets/images/badges/family_friendly.webp';
import badgeAlpineUrl from '../assets/images/badges/high_alpine.webp';
import badgeFreerideUrl from '../assets/images/badges/freeride_paradise.webp';
import techTreeData from '../assets/data/techTree.json';
import { state, DOM } from './state';
import { refresh, updateBudgetDisplay, exportConfig, onConfigImported, applyImportedConfig, TICKET_STEPS, updateTicketPriceDisplay } from './config.js';
import { startSimulation, stopSimulation, updateDateDisplay, applySimulationSpeed } from './simulation';
import { updateWeatherDisplay } from './weather-icon';
import { syncCanvasSize, onCanvasClick, onCanvasMouseDown, onCanvasMouseMove, onCanvasMouseUp, onCanvasDblClick, hideLiftHoverPopup, hideGroomerHoverPopup, hideSlopeHoverPopup, handleLiftPopupClick, handleGroomerPopupClick, handleSlopePopupClick } from './canvas.js';
import { renderLiftTypeDropdown, setLiftType, updateCancelLiftButton } from './ui/lifts.js';
import { renderSlopeTypeButtons, setDifficulty } from './ui/slopes.js';
import { renderGroomerTypeDropdown, getGroomerImageUrls, getGroomerMapImageUrls, setGroomerType } from './ui/groomers.js';
import { initInvestCompactSidebar } from './ui/invest-inventory.js';
import { isTechBuyable } from './utils.js';
import { updateMountainImage, setMountainMode } from './mountain-images.js';
import { initNewsFeed } from './news-feed.js';
import { initBuildMask } from './build-mask';
import buildMaskUrl from '../assets/images/mountain/mountain1_buildmask.webp';
import introVideoUrl from '../assets/video/Intro.mp4';
import tutorialConfig from '../assets/data/tutorial.json';
import tutorialCharacterUrl from '../assets/images/skiers/Character.png';
import tutorialHansUrl from '../assets/images/skiers/Hans.png';
const musicModules = import.meta.glob('../assets/music/*.{mp3,ogg,wav,m4a}', { eager: true, import: 'default' });

let simulationStarted = false;
let tutorialActive = false;
let tutorialRepairWatcherTimer = null;
let tutorialGroomerWatcherTimer = null;
let tutorialGreenSlopeWatcherTimer = null;
let tutorialOpenResortWatcherTimer = null;
let tutorialDialogueCloseHandler = null;
let tutorialSkipHandler = null;

function clearTutorialWatchers() {
  if (tutorialRepairWatcherTimer != null) {
    window.clearInterval(tutorialRepairWatcherTimer);
    tutorialRepairWatcherTimer = null;
  }
  if (tutorialGroomerWatcherTimer != null) {
    window.clearInterval(tutorialGroomerWatcherTimer);
    tutorialGroomerWatcherTimer = null;
  }
  if (tutorialGreenSlopeWatcherTimer != null) {
    window.clearInterval(tutorialGreenSlopeWatcherTimer);
    tutorialGreenSlopeWatcherTimer = null;
  }
  if (tutorialOpenResortWatcherTimer != null) {
    window.clearInterval(tutorialOpenResortWatcherTimer);
    tutorialOpenResortWatcherTimer = null;
  }
}

/** Exit tutorial immediately: stop scripted steps, clear watchers, resume normal play. */
function endTutorialSkipped() {
  tutorialActive = false;
  clearTutorialWatchers();
  state.simulationSpeed = 1;
  if (DOM.simSpeedButtons) {
    DOM.simSpeedButtons.forEach((b) => b.classList.toggle('active', String(b.dataset.speed ?? '') === '1'));
  }
  applySimulationSpeed();
  hideTutorialDialogue();
}

function hideTutorialDialogue() {
  const el = /** @type {HTMLDivElement | null} */ (document.getElementById('tutorialDialogue'));
  if (!el) return;
  el.classList.remove('visible');
  el.setAttribute('aria-hidden', 'true');
  const onDone = () => {
    el.hidden = true;
    el.removeEventListener('transitionend', onDone);
  };
  el.addEventListener('transitionend', onDone);
  // Fallback in case transitionend doesn't fire.
  window.setTimeout(() => {
    if (!el.classList.contains('visible')) el.hidden = true;
  }, 320);
}

function showTutorialDialogue(message, imageUrl = tutorialCharacterUrl, closable = true, onClose = null, hint = '') {
  const el = /** @type {HTMLDivElement | null} */ (document.getElementById('tutorialDialogue'));
  const textEl = /** @type {HTMLParagraphElement | null} */ (document.getElementById('tutorialDialogueText'));
  const hintEl = /** @type {HTMLParagraphElement | null} */ (document.getElementById('tutorialDialogueHint'));
  const imageEl = /** @type {HTMLImageElement | null} */ (document.getElementById('tutorialCharacterImage'));
  const closeBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('tutorialDialogueCloseBtn'));
  const skipBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('tutorialDialogueSkipBtn'));
  if (!el || !textEl || !imageEl) return;
  const applyContentAndAnimateIn = () => {
    const isHans = imageUrl === tutorialHansUrl;
    el.classList.toggle('is-hans', isHans);
    textEl.textContent = message;
    imageEl.src = imageUrl || tutorialCharacterUrl;
    if (hintEl) {
      const showHint = !!(hint && String(hint).trim());
      hintEl.textContent = showHint ? String(hint) : '';
      hintEl.hidden = !showHint;
      hintEl.setAttribute('aria-hidden', showHint ? 'false' : 'true');
    }
    if (closeBtn) {
      closeBtn.hidden = !closable;
      closeBtn.setAttribute('aria-hidden', closable ? 'false' : 'true');
      if (tutorialDialogueCloseHandler) {
        closeBtn.removeEventListener('click', tutorialDialogueCloseHandler);
      }
      tutorialDialogueCloseHandler = () => {
        if (onClose) onClose();
        else hideTutorialDialogue();
      };
      closeBtn.addEventListener('click', tutorialDialogueCloseHandler);
    }
    if (skipBtn) {
      const showSkip = Boolean(tutorialActive);
      skipBtn.hidden = !showSkip;
      skipBtn.setAttribute('aria-hidden', showSkip ? 'false' : 'true');
      if (tutorialSkipHandler) {
        skipBtn.removeEventListener('click', tutorialSkipHandler);
        tutorialSkipHandler = null;
      }
      if (showSkip) {
        tutorialSkipHandler = () => endTutorialSkipped();
        skipBtn.addEventListener('click', tutorialSkipHandler);
      }
    }
    // Ensure first render animates too: paint once in non-visible state, then transition in.
    el.classList.remove('visible');
    el.hidden = false;
    el.setAttribute('aria-hidden', 'false');
    // Force style flush so the browser commits the pre-animation state.
    void el.offsetWidth;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.classList.add('visible');
      });
    });
  };

  // If a dialog is already visible, animate out first, then swap content and animate in.
  if (!el.hidden && el.classList.contains('visible')) {
    const switchToken = String(Date.now() + Math.random());
    el.dataset.dialogSwitchToken = switchToken;
    el.classList.remove('visible');
    const onOutDone = () => {
      if (el.dataset.dialogSwitchToken !== switchToken) return;
      applyContentAndAnimateIn();
    };
    el.addEventListener('transitionend', onOutDone, { once: true });
    // Fallback in case transitionend doesn't fire.
    window.setTimeout(() => {
      if (el.dataset.dialogSwitchToken === switchToken && !el.classList.contains('visible')) {
        applyContentAndAnimateIn();
      }
    }, 320);
    return;
  }

  applyContentAndAnimateIn();
}

function startRepairInstructionStep() {
  // Keep the first Character dialog visible while waiting for lift repair.
  if (tutorialRepairWatcherTimer != null) window.clearInterval(tutorialRepairWatcherTimer);
  tutorialRepairWatcherTimer = window.setInterval(() => {
    if (!tutorialActive) return;
    const hasBrokenLift = state.lifts.some((l) => l.broken === true);
    if (!hasBrokenLift) {
      window.clearInterval(tutorialRepairWatcherTimer);
      tutorialRepairWatcherTimer = null;
      showTutorialDialogue(
        "Listen to that hum—my beautiful old Poma's got life in her yet! Keep those pulleys greased and the cable tight, kid. A broken lift is a broken promise to your guests, and happy skiers are the only ones who pay the tab. You keep the maintenance up and the queues moving, and maybe—just maybe—one day we’ll see some shiny new chairs reaching all the way to the Summit.",
        tutorialHansUrl,
        true,
        startGroomerInstructionStep,
      );
    }
  }, 220);
}

function startGroomerInstructionStep() {
  showTutorialDialogue(
    "Great! It wasn't cheap but the lift is fixed. Now lets see if I can get that old tractor running too!",
    tutorialCharacterUrl,
    false,
    null,
    "Click on the tractor to get it repaired.",
  );
  if (tutorialGroomerWatcherTimer != null) window.clearInterval(tutorialGroomerWatcherTimer);
  tutorialGroomerWatcherTimer = window.setInterval(() => {
    if (!tutorialActive) return;
    const hasBrokenGroomer = state.groomers.some((g) => g.broken === true);
    if (!hasBrokenGroomer) {
      window.clearInterval(tutorialGroomerWatcherTimer);
      tutorialGroomerWatcherTimer = null;
      showTutorialDialogue(
        "Grooming isn’t just maintenance, kid—it’s respect. It’s giving this mountain and the folks on it what they deserve. Old Chuffy there will do for now, but she’s got more heart than horsepower and eventually, you’re gonna need some more muscle if you want to keep these runs from turning into a mogul field.",
        tutorialHansUrl,
        true,
        () => {
          const initialGreenSlopeCount = state.slopes.filter((s) => {
            const st = state.slopeTypes.find((t) => t.id === s.slopeTypeId);
            if (!st) return false;
            if (String(st.id) === 'green_beginner') return true;
            return String(st.difficulty || '').toLowerCase() === 'green';
          }).length;

          showTutorialDialogue(
            "Unbelievable, the bloody thing actually works! Lets use it to create a new beginners slope.",
            tutorialCharacterUrl,
            false,
            null,
            "Use the build menu on the right to select and build a new Green slope.",
          );

          if (tutorialGreenSlopeWatcherTimer != null) window.clearInterval(tutorialGreenSlopeWatcherTimer);
          tutorialGreenSlopeWatcherTimer = window.setInterval(() => {
            if (!tutorialActive) return;
            const currentGreenSlopeCount = state.slopes.filter((s) => {
              const st = state.slopeTypes.find((t) => t.id === s.slopeTypeId);
              if (!st) return false;
              if (String(st.id) === 'green_beginner') return true;
              return String(st.difficulty || '').toLowerCase() === 'green';
            }).length;
            if (currentGreenSlopeCount > initialGreenSlopeCount) {
              window.clearInterval(tutorialGreenSlopeWatcherTimer);
              tutorialGreenSlopeWatcherTimer = null;
              showTutorialDialogue(
                "Balance is everything, kid. Build enough slopes to keep the crowds from bumping boots, but don't outrun your groomers—they can only handle so much. Green and Blue runs are your bread and butter; they're easy to buff and hold the most people. But if you want the pros to whisper our name, you’ll need the steep Reds and Blacks. And make sure you carve some Freeride lines for the likes of you and me!",
                tutorialHansUrl,
                true,
                () => {
                  showTutorialDialogue(
                    "Yeah baby, we're ready for business! Lets see if the valley still remembers how to ski!",
                    tutorialCharacterUrl,
                    true,
                    startOpenResortStep,
                  );
                },
              );
            }
          }, 220);
        },
      );
    }
  }, 220);
}

function startOpenResortStep() {
  showTutorialDialogue(
    "Watch the books, kid. Every lift and groomer adds to the bill. Your ticket cash is at the mercy of the mountain—weather, the time of year, our reputation, and how many skiers the hill can actually hold will decide who shows up. Manage it smart, and have the sense to shut the gates when the snow runs thin. Now go on—open up and have some fun!",
    tutorialHansUrl,
    false,
    null,
    "Open the hill with a switch in the left menu.",
  );
  if (tutorialOpenResortWatcherTimer != null) window.clearInterval(tutorialOpenResortWatcherTimer);
  tutorialOpenResortWatcherTimer = window.setInterval(() => {
    if (!tutorialActive) return;
    if (state.resortOpen === true) {
      window.clearInterval(tutorialOpenResortWatcherTimer);
      tutorialOpenResortWatcherTimer = null;
      showTutorialDialogue(
        "Yeah! Summit '67 is open for business! I'll keep the ticket prices as low as possible until we get the word out and reputation back up. Now I deserve a quick lap or two on the slopes myself!",
        tutorialCharacterUrl,
        true,
        () => {
          tutorialActive = false;
          state.simulationSpeed = 1;
          if (DOM.simSpeedButtons) {
            DOM.simSpeedButtons.forEach((b) => b.classList.toggle('active', String(b.dataset.speed ?? '') === '1'));
          }
          applySimulationSpeed();
          hideTutorialDialogue();
        },
        'You can control the speed of simulation as well as save or load the game in the status menu.',
      );
    }
  }, 220);
}

function ensureSimulationStarted() {
  if (simulationStarted) return;
  simulationStarted = true;
  startSimulation();
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
  state.penDrawing = false;
  state.mouseImage = null;
  state.buildBlocked = false;
  state.slopePlaceError = null;
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
  function syncSimulationSpeedButtons() {
    if (!DOM.simSpeedButtons) return;
    const target = String(Number.isFinite(state.simulationSpeed) ? state.simulationSpeed : 1);
    DOM.simSpeedButtons.forEach((b) => b.classList.toggle('active', String(b.dataset.speed ?? '') === target));
  }
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
    syncSimulationSpeedButtons();
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
    ticketSlider.addEventListener('input', () => {
      const idx = Math.max(0, Math.min(TICKET_STEPS.length - 1, Number(ticketSlider.value) || 0));
      state.ticketPrice = TICKET_STEPS[idx];
      updateTicketPriceDisplay();
    });
  }

  if (DOM.simSpeedButtons) {
    DOM.simSpeedButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const speed = Number(btn.dataset.speed ?? '1') || 0;
        state.simulationSpeed = Math.max(0, Math.min(3, speed));
        syncSimulationSpeedButtons();
        applySimulationSpeed();
      });
    });
  }
  syncSimulationSpeedButtons();

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
    state.buildBlocked = false;
    const hint = document.getElementById('buildMaskHint');
    if (hint) { hint.classList.add('hidden'); hint.setAttribute('aria-hidden', 'true'); }
    if (DOM.canvas) DOM.canvas.style.cursor = '';
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
  const buyableLifts = state.liftTypes.filter(isTechBuyable);
  state.liftType = buyableLifts[0]?.id ?? state.liftTypes[0]?.id ?? null;
  state.slopeTypes = (techTreeData && techTreeData.slopes) ? [...techTreeData.slopes] : [];
  const buyableSlopes = state.slopeTypes.filter(isTechBuyable);
  state.difficulty = buyableSlopes.length > 0
    ? (buyableSlopes.find((s) => s.difficulty === 'Blue' || s.id === 'blue_easy') || buyableSlopes[0]).id
    : state.slopeTypes[0]?.id ?? null;
  state.groomerTypes = (techTreeData && techTreeData.groomers) ? [...techTreeData.groomers] : [];
  const buyableGroomers = state.groomerTypes.filter(isTechBuyable);
  state.groomerType = buyableGroomers[0]?.id ?? state.groomerTypes[0]?.id ?? null;

  loadSpriteSheet();
  loadCottageIcon();
  loadGroomerImages();
  initBuildMask(buildMaskUrl).catch(() => {
    // Fail open if mask fails to load; building remains allowed.
  });
  initNewsFeed([skiersH1Url, skiersH2Url], [skiersA1Url, skiersA2Url]);
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

  initMusic();
  initIntroVideo();
  initSplash();
  initGameOver();
}

function initMusic() {
  const btn = document.getElementById('soundToggleBtn');
  const tracks = Object.values(musicModules).filter(Boolean);
  if (!tracks.length) return;

  const audio = new Audio();
  audio.preload = 'auto';
  const targetVolume = 0.55;
  audio.volume = 0;
  // Start muted so autoplay is allowed; we fade in on splash dissolve.
  audio.muted = true;

  const storageKey = 'musicMuted';
  const saved = window.localStorage ? window.localStorage.getItem(storageKey) : null;
  let muted = saved === '1';
  let fading = false;
  let autoplayBlocked = false;
  /** @type {string[]} */
  let queue = [];

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function refillQueue() {
    queue = shuffle([...tracks]);
  }

  function nextTrack() {
    if (!queue.length) refillQueue();
    return queue.shift();
  }

  function playNext() {
    const next = nextTrack();
    if (!next) return;
    audio.src = next;
    audio.currentTime = 0;
    void audio.play().then(() => {
      autoplayBlocked = false;
    }).catch(() => {
      autoplayBlocked = true;
    });
  }

  function updateButton() {
    if (!btn) return;
    btn.classList.toggle('is-muted', muted);
    btn.setAttribute('aria-pressed', String(!muted));
    btn.title = muted ? 'Sound off' : 'Sound on';
  }

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function fadeTo(volume, durationMs) {
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      audio.volume = Math.max(0, Math.min(1, volume));
      return;
    }
    const from = audio.volume;
    const to = Math.max(0, Math.min(1, volume));
    const start = performance.now();
    fading = true;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / durationMs);
      const e = easeInOut(t);
      audio.volume = from + (to - from) * e;
      if (t < 1) requestAnimationFrame(tick);
      else fading = false;
    };
    requestAnimationFrame(tick);
  }

  function setMuted(next) {
    muted = !!next;
    if (window.localStorage) window.localStorage.setItem(storageKey, muted ? '1' : '0');
    updateButton();
    if (muted) {
      fadeTo(0, 250);
      window.setTimeout(() => {
        audio.muted = true;
      }, 260);
    } else {
      audio.muted = false;
      void audio.play().catch(() => { });
      fadeTo(targetVolume, 600);
    }
  }

  updateButton();
  refillQueue();
  playNext();
  audio.addEventListener('ended', () => playNext());

  function startBgmFadeIn() {
    if (muted) return;
    audio.muted = false;
    void audio.play().then(() => {
      autoplayBlocked = false;
    }).catch(() => {
      autoplayBlocked = true;
    });
    fadeTo(targetVolume, 1200);
  }

  // New Game path: no intro video, start music right after splash closes.
  window.addEventListener('splashdissolve', (evt) => {
    const playIntro = !(evt && evt.detail && evt.detail.playIntro === false);
    if (playIntro) return;
    startBgmFadeIn();
  });

  // Tutorial path: start music only after intro video finishes.
  window.addEventListener('introfinished', () => {
    startBgmFadeIn();
  });

  // Fade out on game over.
  window.addEventListener('gameover', () => {
    fadeTo(0, 900);
    window.setTimeout(() => {
      audio.muted = true;
    }, 920);
  });

  if (btn) {
    btn.addEventListener('click', () => setMuted(!muted));
  }

  // If autoplay is blocked (even while muted), retry once on first user gesture.
  const unlock = () => {
    if (!autoplayBlocked) return;
    void audio.play().then(() => {
      autoplayBlocked = false;
    }).catch(() => { });
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });

  // Apply initial preference: keep muted until splash dissolves.
  if (muted) {
    audio.muted = true;
    audio.volume = 0;
  }

  // Expose for debugging or future UI
  window.__bgm = audio;
}

function initIntroVideo() {
  const overlay = /** @type {HTMLDivElement | null} */ (document.getElementById('introVideoOverlay'));
  const video = /** @type {HTMLVideoElement | null} */ (document.getElementById('introVideo'));
  const toggleBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('introVideoToggleBtn'));
  if (!overlay || !video || !introVideoUrl) {
    // If intro video is unavailable, still allow "Start Tutorial" path to continue.
    window.addEventListener('splashdissolve', (evt) => {
      const playIntro = !(evt && evt.detail && evt.detail.playIntro === false);
      if (playIntro) {
        ensureSimulationStarted();
        window.dispatchEvent(new CustomEvent('introfinished'));
      }
    });
    return;
  }

  let finished = false;
  let autoplayBlocked = false;
  let tutorialMode = false;
  video.src = introVideoUrl;

  function updateToggleButton() {
    if (!toggleBtn) return;
    const paused = video.paused;
    toggleBtn.textContent = paused ? 'Play' : 'Pause';
    toggleBtn.setAttribute('aria-label', paused ? 'Play intro video' : 'Pause intro video');
  }

  function finishIntro() {
    if (finished) return;
    finished = true;
    video.pause();
    if (tutorialMode) {
      tutorialActive = true;
      try {
        applyImportedConfig(tutorialConfig);
        window.setTimeout(() => {
          if (!tutorialActive) return;
          showTutorialDialogue(
            "Hans was a great guy and he loved his mountain. He wasn't best organized though...that lift is a mess. Lets see if I can get it fixed.",
            tutorialCharacterUrl,
            false,
            null,
            "Click on the lift to get it repaired.",
          );
          startRepairInstructionStep();
        }, 1000);
      } catch (err) {
        window.alert('Failed to load tutorial map: ' + (err?.message || String(err)));
      }
    }
    ensureSimulationStarted();
    window.dispatchEvent(new CustomEvent('introfinished'));
    overlay.classList.add('intro-video-dissolve');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.addEventListener('transitionend', () => {
      overlay.classList.remove('visible', 'intro-video-dissolve');
      overlay.hidden = true;
    }, { once: true });
  }

  function tryPlayIntro() {
    if (finished) return;
    void video.play().then(() => {
      autoplayBlocked = false;
      updateToggleButton();
    }).catch(() => {
      // Keep overlay visible; retry on next user gesture.
      autoplayBlocked = true;
      updateToggleButton();
    });
  }

  window.addEventListener('splashdissolve', (evt) => {
    const playIntro = !(evt && evt.detail && evt.detail.playIntro === false);
    if (!playIntro) return;
    tutorialMode = true;
    finished = false;
    autoplayBlocked = false;
    video.currentTime = 0;
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => overlay.classList.add('visible'));
    updateToggleButton();
    tryPlayIntro();
  });

  video.addEventListener('ended', finishIntro, { once: true });

  const unlockIntroPlayback = () => {
    if (autoplayBlocked) tryPlayIntro();
  };
  window.addEventListener('pointerdown', unlockIntroPlayback);
  window.addEventListener('keydown', unlockIntroPlayback);

  overlay.addEventListener('click', () => {
    // If autoplay was blocked, first click should start playback, not skip.
    if (autoplayBlocked) {
      tryPlayIntro();
      return;
    }
    finishIntro();
  });

  if (toggleBtn) {
    toggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (video.paused) {
        tryPlayIntro();
      } else {
        video.pause();
        autoplayBlocked = false;
        updateToggleButton();
      }
    });
  }

  video.addEventListener('play', updateToggleButton);
  video.addEventListener('pause', updateToggleButton);
}

function initGameOver() {
  window.addEventListener('gameover', () => {
    stopSimulation();
    const overlay = document.getElementById('gameOverOverlay');
    if (overlay) {
      overlay.classList.add('visible');
      overlay.setAttribute('aria-hidden', 'false');
    }
  }, { once: true });
  const overlay = document.getElementById('gameOverOverlay');
  if (overlay) {
    overlay.addEventListener('click', () => window.location.reload());
  }
}

function initSplash() {
  const overlay = document.getElementById('splashOverlay');
  if (!overlay) return;

  const stopBgmIfPlaying = () => {
    const a = window.__bgm;
    if (a && typeof a.pause === 'function' && !a.paused) a.pause();
  };
  stopBgmIfPlaying();
  requestAnimationFrame(() => stopBgmIfPlaying());

  const versionEl = overlay.querySelector('.splash-version');
  if (versionEl) {
    versionEl.textContent = 'v' + (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0');
  }
  const buildDateEl = overlay.querySelector('.splash-build-date');
  if (buildDateEl && typeof __BUILD_DATE__ !== 'undefined') {
    const raw = __BUILD_DATE__;
    const d = raw && raw.length >= 10 ? new Date(raw + 'T00:00:00Z') : null;
    buildDateEl.textContent = d && !isNaN(d.getTime())
      ? 'Built: ' + d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      : 'Built: ' + (raw || '');
  }

  function dissolve(playIntro = true) {
    overlay.classList.add('splash-dissolve');
    overlay.setAttribute('aria-hidden', 'true');
    window.dispatchEvent(new CustomEvent('splashdissolve', { detail: { playIntro } }));
    overlay.addEventListener('transitionend', () => {
      overlay.style.visibility = 'hidden';
      if (!playIntro) ensureSimulationStarted();
    }, { once: true });
  }

  const startTutorialBtn = document.getElementById('startTutorialBtn');
  const newGameBtn = document.getElementById('newGameBtn');
  if (startTutorialBtn) {
    startTutorialBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dissolve(true);
    }, { once: true });
  }
  if (newGameBtn) {
    newGameBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dissolve(false);
    }, { once: true });
  }
}
