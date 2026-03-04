/**
 * Config export/import, sidebar lists, budget display, and central refresh().
 */

import { state, DOM, getSlopeType, getDiffColor } from './state.js';
import { draw } from './draw.js';
import { escapeHtml, formatCurrency } from './utils.js';

export function updateBudgetDisplay() {
  const el = document.getElementById('budgetAmount');
  if (el) el.textContent = formatCurrency(state.budget);
}

/** Redraw canvas, update lists, and refresh budget. Call after any state change. */
export function refresh() {
  draw();
  renderLists();
  updateBudgetDisplay();
}

export function renderLists() {
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
        refresh();
      }
    });
  });
  DOM.liftList.querySelectorAll('.remove-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.lifts.splice(Number(btn.dataset.idx), 1);
      refresh();
    });
  });
  DOM.slopeList.querySelectorAll('.remove-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.slopes.splice(Number(btn.dataset.idx), 1);
      refresh();
    });
  });
  DOM.cottageList.querySelectorAll('.remove-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.cottages.splice(Number(btn.dataset.idx), 1);
      refresh();
    });
  });
  if (DOM.groomerList) {
    DOM.groomerList.querySelectorAll('.remove-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.type === 'groomer') {
          state.groomers.splice(Number(btn.dataset.idx), 1);
          refresh();
        }
      });
    });
  }
}

export function exportConfig() {
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

export function onConfigImported(e) {
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
      refresh();
    } catch (err) {
      alert('Invalid config file: ' + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}
