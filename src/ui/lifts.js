/**
 * Lift type dropdown and detail panel.
 */

import spriteSheetUrl from '../../assets/images/SpriteSheet.png';
import skidollarg2mUrl from '../../assets/images/Skidollar_g2m.png';
import { state } from '../state';
import { escapeHtml, formatNumber, scale1to3, skidollarIconsHtml } from '../utils.js';
import { COLS, ROWS } from '../constants';

const LIFT_DETAIL_BLANK_HTML = '';

function getLiftSpriteStyle(lift) {
  const col = lift.frame % COLS;
  const row = Math.floor(lift.frame / COLS);
  const posX = COLS > 1 ? (col / (COLS - 1)) * 100 : 0;
  const posY = ROWS > 1 ? (row / (ROWS - 1)) * 100 : 0;
  return `background-image:url(${spriteSheetUrl}); background-size:${COLS * 100}% ${ROWS * 100}%; background-position:${posX}% ${posY}%;`;
}

export function setLiftType(type) {
  if (!state.liftTypes.some((l) => l.id === type)) return;
  state.liftType = type;
  if (typeof window.liftDropdownUpdateTrigger === 'function') window.liftDropdownUpdateTrigger();
}

export function updateCancelLiftButton() {
  const btn = document.getElementById('cancelLiftBtn');
  if (btn) btn.classList.toggle('hidden', !(state.mode === 'lift' && state.liftBottom));
}

/**
 * @param { { skipPanelBlank?: boolean } } [opts] - If skipPanelBlank is true, do not clear the detail panel (e.g. when refreshing for unlock year).
 */
export function renderLiftTypeDropdown(opts) {
  const skipPanelBlank = opts && opts.skipPanelBlank === true;
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
        return '<li class="' + cls + '">' + escapeHtml(s) + '</li>';
      })
      .join('');
    floatingPanel.innerHTML =
      '<button type="button" class="lift-detail-close" title="Close" aria-label="Close">×</button>' +
      '<div class="lift-type-detail-icon" style="' + style + '"></div>' +
      '<dl class="lift-type-detail-fields">' +
      '<dt>Brand</dt><dd>' + escapeHtml(lift.brand || '—') + '</dd>' +
      '<dt>Name</dt><dd>' + escapeHtml(lift.name || '—') + '</dd>' +
      '<dt>Cost</dt><dd class="lift-detail-skidollars">' + costIcons + '</dd>' +
      '<dt>Operating cost</dt><dd class="lift-detail-skidollars">' + opIcons + '</dd>' +
      '<dt>Max length</dt><dd>' + (lift.max_length != null ? formatNumber(lift.max_length) + ' m' : '—') + '</dd>' +
      '<dt>Speed</dt><dd>' + formatNumber(lift.speed) + ' m/s</dd>' +
      '<dt>Capacity</dt><dd>' + formatNumber(lift.capacity) + ' p./hour</dd>' +
      '<dt>Description</dt><dd class="lift-detail-description">' + escapeHtml(lift.description || '—') + (prosConsHtml ? '<ul class="lift-detail-pros-cons">' + prosConsHtml + '</ul>' : '') + '</dd>' +
      '</dl>';
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

  const currentYear = state.currentDate ? state.currentDate.year : 0;
  listContainer.innerHTML = state.liftTypes
    .map((lift) => {
      const unlockYear = lift.unlock_year != null ? Number(lift.unlock_year) : null;
      const locked = unlockYear != null && currentYear < unlockYear;
      const lockedClass = locked ? ' locked' : '';
      const isActive = state.liftType === lift.id ? ' active' : '';
      const title = locked ? 'Unlocks in ' + unlockYear : '';
      return '<button type="button" data-lift-type="' + escapeHtml(lift.id) + '" class="lift-type-btn' + isActive + lockedClass + '"' + (title ? ' title="' + escapeHtml(title) + '"' : '') + '>' +
        '<span class="lift-type-icon" style="' + getLiftSpriteStyle(lift) + '"></span>' +
        '<span class="lift-type-label">' + escapeHtml(lift.name) + '</span></button>';
    })
    .join('');

  listContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-lift-type]');
    if (!btn || btn.classList.contains('locked')) return;
    const id = btn.dataset.liftType;
    setLiftType(id);
    listContainer.querySelectorAll('.lift-type-btn').forEach((b) => b.classList.toggle('active', b.dataset.liftType === id));
    showFloatingPanel(id);
  });

  if (!skipPanelBlank) setPanelBlank();
  if (floatingPanel && state.mode === 'lift' && !skipPanelBlank) {
    floatingPanel.hidden = false;
    floatingPanel.setAttribute('aria-hidden', 'false');
  }

  window.liftDropdownUpdateTrigger = () => {};
  window.liftDetailSetBlank = setPanelBlank;
}
