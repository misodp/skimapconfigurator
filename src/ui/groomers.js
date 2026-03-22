/**
 * Groomer type dropdown and detail panel.
 */

import skidollarg2mUrl from '../../assets/images/Skidollar_gold.webp';
import { state } from '../state';
import { escapeHtml, formatNumber, formatCurrency, isTechBuyable } from '../utils.js';

const groomerModules = import.meta.glob('../../assets/images/groomers/*.webp', { eager: true, import: 'default' });

/** @type {Record<string, string>} */
const allByBase = {};
Object.entries(groomerModules).forEach(([path, url]) => {
  const m = path.match(/\/([^/]+)\.webp$/);
  if (!m || !m[1]) return;
  allByBase[m[1]] = url;
});

/** @type {Record<string, string>} */
const GROOMER_IMAGE_URLS = {};
/** @type {Record<string, string>} */
const GROOMER_IMAGE_URLS_MAP = {};

// Split to normal vs transparent variants.
Object.entries(allByBase).forEach(([base, url]) => {
  // Transparent convention in this project is suffix "t" before extension:
  // e.g. Prinoth_p15t.webp, OldChuffyt.webp.
  if (base.endsWith('t') && allByBase[base.slice(0, -1)]) {
    GROOMER_IMAGE_URLS_MAP[base.slice(0, -1)] = url;
  } else {
    GROOMER_IMAGE_URLS[base] = url;
  }
});

function normalizeImageKey(key) {
  return String(key || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function findClosestImageKey(rawKey, sourceMap) {
  if (!rawKey) return '';
  if (sourceMap[rawKey]) return rawKey;
  const targetNorm = normalizeImageKey(rawKey);
  if (!targetNorm) return '';
  const exactNorm = Object.keys(sourceMap).find((k) => normalizeImageKey(k) === targetNorm);
  if (exactNorm) return exactNorm;
  // Small typo tolerance (e.g. OldCuffy vs OldChuffy).
  const near = Object.keys(sourceMap).find((k) => {
    const n = normalizeImageKey(k);
    return n.includes(targetNorm) || targetNorm.includes(n);
  });
  return near || '';
}

export function getGroomerImageUrl(groomer) {
  const filename = groomer && groomer.image;
  if (!filename) return '';
  const key = findClosestImageKey(filename, GROOMER_IMAGE_URLS);
  return (key && GROOMER_IMAGE_URLS[key]) || '';
}

export function setGroomerType(id) {
  if (!state.groomerTypes.some((g) => g.id === id)) return;
  state.groomerType = id;
}

/**
 * @param { { skipPanelBlank?: boolean } } [opts] - If skipPanelBlank is true, do not clear the detail panel (e.g. when refreshing for unlock year).
 */
export function renderGroomerTypeDropdown(opts) {
  const container = document.getElementById('groomerTypeDropdown');
  const floatingPanel = document.getElementById('liftDetailFloating');
  if (!container || !state.groomerTypes.length) return;

  const currentG = state.groomerTypes.find((g) => g.id === state.groomerType);
  if (!currentG || !isTechBuyable(currentG)) {
    const first = state.groomerTypes.find(isTechBuyable);
    state.groomerType = first?.id ?? state.groomerTypes[0]?.id ?? null;
  }

  function setPanelBlank() {
    if (!floatingPanel) return;
    floatingPanel.innerHTML = '';
    floatingPanel.hidden = true;
    floatingPanel.setAttribute('aria-hidden', 'true');
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

  const currentYear = state.currentDate ? state.currentDate.year : 0;
  container.innerHTML = state.groomerTypes
    .filter(isTechBuyable)
    .map((g) => {
      const unlockYear = g.unlock_year != null ? Number(g.unlock_year) : null;
      const locked = unlockYear != null && currentYear < unlockYear;
      const lockedClass = locked ? ' locked' : '';
      const isActive = state.groomerType === g.id ? ' active' : '';
      const title = locked ? 'Unlocks in ' + unlockYear : '';
      const imgUrl = getGroomerImageUrl(g);
      const iconStyle = imgUrl ? `style="background-image:url(${imgUrl})"` : '';
      return `<button type="button" data-groomer-type="${escapeHtml(g.id)}" class="groomer-type-btn${isActive}${lockedClass}"${title ? ` title="${escapeHtml(title)}"` : ''}>
        <span class="groomer-type-icon" ${iconStyle}></span>
        <span class="groomer-type-label">${escapeHtml(g.name)}</span>
      </button>`;
    })
    .join('');

  container.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-groomer-type]');
    if (!btn || btn.classList.contains('locked')) return;
    const id = btn.dataset.groomerType;
    state.groomerType = id;
    container.querySelectorAll('.groomer-type-btn').forEach((b) => b.classList.toggle('active', b.dataset.groomerType === id));
    showGroomerDetail(id);
  });

  window.groomerDetailSetBlank = setPanelBlank;
  window.groomerDetailShowById = showGroomerDetail;
}

export function getGroomerImageUrls() {
  /** @type {Record<string, string>} */
  const resolved = {};
  state.groomerTypes.forEach((g) => {
    const requested = g?.image;
    if (!requested) return;
    const key = findClosestImageKey(requested, GROOMER_IMAGE_URLS);
    if (key && GROOMER_IMAGE_URLS[key]) resolved[requested] = GROOMER_IMAGE_URLS[key];
  });
  return { ...GROOMER_IMAGE_URLS, ...resolved };
}

/** Returns URLs for groomer images with transparent background (for drawing on the map). Falls back to original if no transparent version. */
export function getGroomerMapImageUrls() {
  /** @type {Record<string, string>} */
  const resolved = {};
  state.groomerTypes.forEach((g) => {
    const requested = g?.image;
    if (!requested) return;
    const mapKey = findClosestImageKey(requested, GROOMER_IMAGE_URLS_MAP);
    const baseKey = findClosestImageKey(requested, GROOMER_IMAGE_URLS);
    if (mapKey && GROOMER_IMAGE_URLS_MAP[mapKey]) resolved[requested] = GROOMER_IMAGE_URLS_MAP[mapKey];
    else if (baseKey && GROOMER_IMAGE_URLS[baseKey]) resolved[requested] = GROOMER_IMAGE_URLS[baseKey];
  });
  return { ...GROOMER_IMAGE_URLS_MAP, ...resolved };
}
