/**
 * Groomer type dropdown and detail panel.
 */

import skidollarg2mUrl from '../../assets/images/Skidollar_g2m.webp';
import groomerPrinothP15 from '../../assets/images/groomers/Prinoth_p15.webp';
import groomerRatracS from '../../assets/images/groomers/Ratrac_s.webp';
import groomerPb145 from '../../assets/images/groomers/PistenBully_145.webp';
import groomerPb170 from '../../assets/images/groomers/PistenBully_170.webp';
import groomerPrinothP15t from '../../assets/images/groomers/Prinoth_p15t.webp';
import groomerRatracSt from '../../assets/images/groomers/Ratrac_st.webp';
import groomerPb145t from '../../assets/images/groomers/PistenBully_145t.webp';
import groomerPb170t from '../../assets/images/groomers/PistenBully_170t.webp';
import { state } from '../state';
import { escapeHtml, formatNumber, formatCurrency } from '../utils.js';

const GROOMER_IMAGE_URLS = {
  'Prinoth_p15': groomerPrinothP15,
  'Ratrac_s': groomerRatracS,
  'PistenBully_145': groomerPb145,
  'PistenBully_170': groomerPb170,
};

/** Transparent-background images for drawing groomers on the map (keyed by same name as GROOMER_IMAGE_URLS). */
const GROOMER_IMAGE_URLS_MAP = {
  'Prinoth_p15': groomerPrinothP15t,
  'Ratrac_s': groomerRatracSt,
  'PistenBully_145': groomerPb145t,
  'PistenBully_170': groomerPb170t,
};

export function getGroomerImageUrl(groomer) {
  const filename = groomer && groomer.image;
  return (filename && GROOMER_IMAGE_URLS[filename]) || '';
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
  return { ...GROOMER_IMAGE_URLS };
}

/** Returns URLs for groomer images with transparent background (for drawing on the map). Falls back to original if no transparent version. */
export function getGroomerMapImageUrls() {
  return { ...GROOMER_IMAGE_URLS_MAP };
}
