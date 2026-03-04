/**
 * Slope type dropdown and detail panel.
 */

import skidollarg2mUrl from '../../assets/images/Skidollar_g2m.png';
import { state } from '../state.js';
import { escapeHtml, formatNumber } from '../utils.js';
import { COLS, ROWS } from '../constants.js';

export function getSlopeSpritePositionStyle(slopeType) {
  const frame = Math.min(COLS * ROWS - 1, Math.max(0, Number(slopeType.frame) ?? 0));
  const col = frame % COLS;
  const row = Math.floor(frame / COLS);
  const posX = COLS > 1 ? (col / (COLS - 1)) * 100 : 0;
  const posY = ROWS > 1 ? (row / (ROWS - 1)) * 100 : 0;
  return `background-position:${posX}% ${posY}%`;
}

export function setDifficulty(slopeTypeId) {
  state.difficulty = slopeTypeId;
  const container = document.getElementById('difficultyButtons');
  if (container) {
    container.querySelectorAll('[data-difficulty]').forEach((b) => b.classList.toggle('active', b.dataset.difficulty === slopeTypeId));
  }
}

export function renderSlopeTypeButtons() {
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
