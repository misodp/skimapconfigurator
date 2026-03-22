/**
 * Compact invest sidebar (right) and inventory popup for choosing lift/slope/groomer type.
 */

import { state } from '../state';
import { escapeHtml, isTechBuyable } from '../utils.js';
import { getLiftSpriteStyle } from './lifts.js';
import { getSlopeSpritePositionStyle } from './slopes.js';
import { getGroomerImageUrl } from './groomers.js';

const OVERLAY_ID = 'investInventoryOverlay';
const POPUP_ID = 'investInventoryPopup';
const TITLE_ID = 'investInventoryTitle';
const LIST_ID = 'investInventoryList';

const TITLES = {
  lift: 'Choose lift type',
  slope: 'Choose slope type',
  groomer: 'Choose groomer type',
};

const HINTS = {
  lift: 'Select type, then click on the map to place the bottom and the top station. Escape to cancel.',
  slope: 'Select difficulty, then draw the slope by clicking on the map. Double-click to place, Escape to cancel.',
  groomer: 'Select type, then click on the map to place the groomer.',
};

/** @type {HTMLElement | null} */
let lastFocusBeforePopup = null;

/**
 * Fill the popup list with items for the given mode and attach click handlers.
 * @param {'lift'|'slope'|'groomer'} mode
 */
function fillList(mode) {
  const listEl = document.getElementById(LIST_ID);
  const titleEl = document.getElementById(TITLE_ID);
  if (!listEl || !titleEl) return;

  // Keep selected type buyable for list highlighting (same rules as Invest panel renders).
  const curL = state.liftTypes.find((l) => l.id === state.liftType);
  if (!curL || !isTechBuyable(curL)) {
    const first = state.liftTypes.find(isTechBuyable);
    state.liftType = first?.id ?? state.liftTypes[0]?.id ?? null;
  }
  const curS = state.slopeTypes.find((s) => s.id === state.difficulty);
  if (!curS || !isTechBuyable(curS)) {
    const buyable = state.slopeTypes.filter(isTechBuyable);
    const pick = buyable.find((s) => s.difficulty === 'Blue' || s.id === 'blue_easy') || buyable[0];
    state.difficulty = pick?.id ?? state.slopeTypes[0]?.id ?? null;
  }
  const curG = state.groomerTypes.find((g) => g.id === state.groomerType);
  if (!curG || !isTechBuyable(curG)) {
    const first = state.groomerTypes.find(isTechBuyable);
    state.groomerType = first?.id ?? state.groomerTypes[0]?.id ?? null;
  }

  titleEl.textContent = TITLES[mode];
  const currentYear = state.currentDate ? state.currentDate.year : 0;

  if (mode === 'lift' && state.liftTypes.length) {
    listEl.innerHTML = state.liftTypes
      .filter(isTechBuyable)
      .map((lift) => {
        const unlockYear = lift.unlock_year != null ? Number(lift.unlock_year) : null;
        const locked = unlockYear != null && currentYear < unlockYear;
        const lockedClass = locked ? ' locked' : '';
        const isActive = state.liftType === lift.id ? ' active' : '';
        const title = locked ? 'Unlocks in ' + unlockYear : '';
        return (
          '<button type="button" data-invest-id="' +
          escapeHtml(lift.id) +
          '" class="lift-type-btn' +
          isActive +
          lockedClass +
          '"' +
          (title ? ' title="' + escapeHtml(title) + '"' : '') +
          '>' +
          '<span class="lift-type-icon" style="' +
          getLiftSpriteStyle(lift) +
          '"></span>' +
          '<span class="lift-type-label">' +
          escapeHtml(lift.name) +
          '</span></button>'
        );
      })
      .join('');
    return;
  }

  if (mode === 'slope' && state.slopeTypes.length) {
    listEl.innerHTML = state.slopeTypes
      .map((st) => {
        const isSelected = state.difficulty === st.id ? ' active' : '';
        const posStyle = getSlopeSpritePositionStyle(st);
        return (
          '<button type="button" data-invest-id="' +
          escapeHtml(st.id) +
          '" class="lift-type-btn' +
          isSelected +
          '" title="' +
          escapeHtml(st.difficulty) +
          '">' +
          '<span class="lift-type-icon slope-type-icon" style="' +
          posStyle +
          '"></span>' +
          '<span class="lift-type-label">' +
          escapeHtml(st.difficulty) +
          '</span></button>'
        );
      })
      .join('');
    return;
  }

  if (mode === 'groomer' && state.groomerTypes.length) {
    listEl.innerHTML = state.groomerTypes
      .filter(isTechBuyable)
      .map((g) => {
        const unlockYear = g.unlock_year != null ? Number(g.unlock_year) : null;
        const locked = unlockYear != null && currentYear < unlockYear;
        const lockedClass = locked ? ' locked' : '';
        const isActive = state.groomerType === g.id ? ' active' : '';
        const title = locked ? 'Unlocks in ' + unlockYear : '';
        const imgUrl = getGroomerImageUrl(g);
        const iconStyle = imgUrl ? `style="background-image:url(${imgUrl})"` : '';
        return (
          '<button type="button" data-invest-id="' +
          escapeHtml(g.id) +
          '" class="groomer-type-btn' +
          isActive +
          lockedClass +
          '"' +
          (title ? ' title="' + escapeHtml(title) + '"' : '') +
          '>' +
          '<span class="groomer-type-icon" ' +
          iconStyle +
          '></span>' +
          '<span class="groomer-type-label">' +
          escapeHtml(g.name) +
          '</span></button>'
        );
      })
      .join('');
  }
}

/**
 * Open the inventory popup for the given mode (lift, slope, groomer),
 * aligning the top of the popup with the top of the triggering compact button.
 * @param {'lift'|'slope'|'groomer'} mode
 * @param {HTMLElement} [anchorBtn]
 */
export function openInventoryPopup(mode, anchorBtn) {
  const overlay = document.getElementById(OVERLAY_ID);
  const popup = document.getElementById(POPUP_ID);
  if (!overlay || !popup) return;
  const active = document.activeElement;
  lastFocusBeforePopup = (active && active instanceof HTMLElement) ? active : null;
  fillList(mode);
  overlay.hidden = false;
  overlay.setAttribute('aria-hidden', 'false');
  overlay.style.display = '';

  popup.hidden = false;
  popup.setAttribute('aria-hidden', 'false');
  popup.style.display = '';
  popup.dataset.investMode = mode;

  const hintEl = document.getElementById('investInventoryHint');
  if (hintEl && HINTS[mode]) {
    hintEl.textContent = HINTS[mode];
  }

  if (anchorBtn && typeof anchorBtn.getBoundingClientRect === 'function') {
    const rect = anchorBtn.getBoundingClientRect();
    popup.style.top = rect.top + 'px';
    popup.style.transform = 'translateY(0)';
  }
}

/**
 * Close the inventory popup and overlay.
 */
export function closeInventoryPopup() {
  const overlay = document.getElementById(OVERLAY_ID);
  const popup = document.getElementById(POPUP_ID);

  // If focus is inside the popup, move it out BEFORE hiding/aria-hidden.
  const active = document.activeElement;
  if (popup && active && popup.contains(active)) {
    if (lastFocusBeforePopup && document.contains(lastFocusBeforePopup)) {
      lastFocusBeforePopup.focus();
    } else {
      /** @type {HTMLElement | null} */ (document.getElementById('drawCanvas'))?.focus?.();
      /** @type {HTMLElement} */ (document.body).focus?.();
    }
  }

  if (overlay) {
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.display = 'none';
  }
  if (popup) {
    popup.hidden = true;
    popup.setAttribute('aria-hidden', 'true');
    popup.style.display = 'none';
  }
  lastFocusBeforePopup = null;

  // Also hide/reset the shared detail panel when the flyout closes.
  if (typeof window.liftDetailSetBlank === 'function') window.liftDetailSetBlank();
  if (typeof window.groomerDetailSetBlank === 'function') window.groomerDetailSetBlank();
  if (typeof window.slopeDetailSetBlank === 'function') window.slopeDetailSetBlank();
  const detailPanel = document.getElementById('liftDetailFloating');
  if (detailPanel) {
    detailPanel.style.position = '';
    detailPanel.style.top = '';
    detailPanel.style.left = '';
    detailPanel.style.right = '';
    detailPanel.style.zIndex = '';
  }
}

/**
 * Initialize compact sidebar buttons and popup behavior (close on overlay, Escape, item select).
 * When user selects an item, dispatches 'invest-inventory-select' with { mode, typeId }.
 */
export function initInvestCompactSidebar() {
  const overlay = document.getElementById(OVERLAY_ID);
  const popup = document.getElementById(POPUP_ID);
  const listEl = document.getElementById(LIST_ID);
  const closeBtn = popup && popup.querySelector('.invest-inventory-close');

  document.querySelectorAll('.invest-compact-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.investMode;
      if (mode === 'lift' || mode === 'slope' || mode === 'groomer') openInventoryPopup(mode, btn);
    });
  });

  if (overlay) {
    overlay.addEventListener('click', () => closeInventoryPopup());
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => closeInventoryPopup());
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && popup && !popup.hidden) closeInventoryPopup();
  });

  if (popup) {
    popup.addEventListener('click', (e) => e.stopPropagation());
  }

  if (listEl) {
    listEl.addEventListener('mouseover', (e) => {
      const btn = e.target.closest('[data-invest-id]');
      if (!btn || !popup) return;
      const typeId = btn.dataset.investId;
      const mode = popup.dataset.investMode;
      if (!typeId) return;

      if (mode === 'lift' && typeof window.liftDetailShowById === 'function') {
        window.liftDetailShowById(typeId);
      } else if (mode === 'slope' && typeof window.slopeDetailShowById === 'function') {
        window.slopeDetailShowById(typeId);
      } else if (mode === 'groomer' && typeof window.groomerDetailShowById === 'function') {
        window.groomerDetailShowById(typeId);
      }

      // Position the detail panel next to the flyout.
      const detailPanel = document.getElementById('liftDetailFloating');
      const popupEl = document.getElementById(POPUP_ID);
      if (detailPanel && popupEl) {
        const rect = popupEl.getBoundingClientRect();
        const panelWidth = detailPanel.offsetWidth || 220;
        const gap = 0;
        let left = rect.left - panelWidth - gap;
        if (left < 8) left = 8;
        detailPanel.style.position = 'fixed';
        detailPanel.style.top = rect.top + 'px';
        detailPanel.style.left = left + 'px';
        detailPanel.style.right = '';
        detailPanel.style.zIndex = '102';
      }
    });

    listEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-invest-id]');
      if (!btn || btn.classList.contains('locked')) return;
      const typeId = btn.dataset.investId;
      const mode = popup && popup.dataset.investMode;
      if (mode !== 'lift' && mode !== 'slope' && mode !== 'groomer') return;
      closeInventoryPopup();
      document.dispatchEvent(
        new CustomEvent('invest-inventory-select', { detail: { mode, typeId } })
      );
    });
  }
}
