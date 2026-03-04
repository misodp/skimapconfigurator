/**
 * Groomer type dropdown and detail panel.
 */

import skidollarg2mUrl from '../../assets/images/Skidollar_g2m.png';
import groomerPrinothP15 from '../../assets/images/Prinoth_p15.png';
import groomerRatracS from '../../assets/images/Ratrac_s.png';
import groomerPb145 from '../../assets/images/PistenBully_145.png';
import groomerPb170 from '../../assets/images/PistenBully_170.png';
import { state } from '../state';
import { escapeHtml, formatNumber, formatCurrency } from '../utils.js';

const GROOMER_IMAGE_URLS = {
  'Prinoth_p15.png': groomerPrinothP15,
  'Ratrac_s.png': groomerRatracS,
  'PistenBully_145.png': groomerPb145,
  'PistenBully_170.png': groomerPb170,
};

function getGroomerImageUrl(groomer) {
  const filename = groomer && groomer.image;
  return (filename && GROOMER_IMAGE_URLS[filename]) || '';
}

export function setGroomerType(id) {
  if (!state.groomerTypes.some((g) => g.id === id)) return;
  state.groomerType = id;
}

export function renderGroomerTypeDropdown() {
  const container = document.getElementById('groomerTypeDropdown');
  const floatingPanel = document.getElementById('liftDetailFloating');
  if (!container || !state.groomerTypes.length) return;

  function setPanelBlank() {
    if (!floatingPanel) return;
    floatingPanel.innerHTML = '';
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

export function getGroomerImageUrls() {
  return { ...GROOMER_IMAGE_URLS };
}
