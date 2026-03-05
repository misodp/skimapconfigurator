/**
 * Config export/import, sidebar lists, budget display, and central refresh().
 */

import { state, DOM, getSlopeType, getDiffColor } from './state';
import { draw } from './draw.js';
import { escapeHtml, formatCurrency, formatNumber } from './utils.js';
import { getDailyVisitors } from './economics.js';
import { getSlopePathLengthM, getLiftLengthM, fromNormalized } from './geometry.js';
import { getTotalLiftCapacity, getTotalSlopeCapacity, getLiftWaitBucket, getSlopeCrowdBucket, getTotalGroomingDemand, getTotalGroomingCapacity, getSlopeQualityBucket } from './experience-simulator';

export function updateBudgetDisplay() {
  const el = document.getElementById('budgetAmount');
  if (el) el.textContent = formatCurrency(state.budget);
}

export function updateVisitorsDisplay() {
  if (DOM.visitorsDisplay) {
    DOM.visitorsDisplay.textContent = formatNumber(state.dailyVisitors);
  }
}

export function updateDailyFinanceDisplay() {
  if (DOM.salesDisplay) {
    DOM.salesDisplay.textContent = formatCurrency(state.dailySales);
  }
  if (DOM.operatingCostsDisplay) {
    DOM.operatingCostsDisplay.textContent = formatCurrency(state.dailyCost);
  }
  const profitEl = DOM.profitDisplay;
  if (profitEl) {
    const profit = state.dailyProfit;
    profitEl.textContent = (profit >= 0 ? '+' : '') + formatCurrency(profit);
    profitEl.classList.remove('profit', 'loss');
    if (profit > 0) profitEl.classList.add('profit');
    else if (profit < 0) profitEl.classList.add('loss');
  }
}

export function updateSnowDepthDisplay() {
  if (DOM.snowDepthDisplay) {
    DOM.snowDepthDisplay.textContent = formatNumber(state.snowDepth) + ' cm';
  }
}

/** Update lift wait, slope crowd and slope quality bucket bars in the stats panel. */
export function updateExperienceDisplay() {
  const buckets = ['good', 'medium', 'bad'];
  if (DOM.liftExperienceDisplay) {
    buckets.forEach((b) => {
      const seg = DOM.liftExperienceDisplay.querySelector(`[data-bucket="${b}"]`);
      if (seg) seg.classList.toggle('active', state.liftExperienceBucket === b);
    });
  }
  if (DOM.slopeExperienceDisplay) {
    buckets.forEach((b) => {
      const seg = DOM.slopeExperienceDisplay.querySelector(`[data-bucket="${b}"]`);
      if (seg) seg.classList.toggle('active', state.slopeCrowdBucket === b);
    });
  }
  if (DOM.slopeQualityDisplay) {
    buckets.forEach((b) => {
      const seg = DOM.slopeQualityDisplay.querySelector(`[data-bucket="${b}"]`);
      if (seg) seg.classList.toggle('active', state.slopeQualityBucket === b);
    });
  }
}

/** Update overall satisfaction bar and percentage in the stats panel. Fill color reflects value (low=red, mid=amber, high=green). */
export function updateSatisfactionDisplay() {
  if (!DOM.satisfactionDisplay) return;
  const fill = DOM.satisfactionDisplay.querySelector('.satisfaction-fill');
  const valueEl = DOM.satisfactionDisplay.querySelector('.satisfaction-value');
  const pct = Math.round(state.satisfaction);
  if (fill) {
    fill.style.width = `${state.satisfaction}%`;
    fill.classList.remove('satisfaction-fill-low', 'satisfaction-fill-mid', 'satisfaction-fill-high');
    if (state.satisfaction < 34) fill.classList.add('satisfaction-fill-low');
    else if (state.satisfaction < 67) fill.classList.add('satisfaction-fill-mid');
    else fill.classList.add('satisfaction-fill-high');
  }
  if (valueEl) valueEl.textContent = `${pct}%`;
}

/** Redraw canvas, update lists, refresh budget and visitors. Call after any state change. */
export function refresh() {
  draw();
  renderLists();
  state.dailyVisitors = getDailyVisitors();
  const liftCap = getTotalLiftCapacity();
  const slopeCap = getTotalSlopeCapacity();
  state.liftExperienceBucket = getLiftWaitBucket(state.dailyVisitors, liftCap);
  state.slopeCrowdBucket = getSlopeCrowdBucket(state.dailyVisitors, slopeCap);
  const groomingDemand = getTotalGroomingDemand();
  const groomingCapacity = getTotalGroomingCapacity();
  state.slopeQualityBucket = getSlopeQualityBucket(groomingDemand, groomingCapacity);
  updateBudgetDisplay();
  updateVisitorsDisplay();
  updateExperienceDisplay();
  updateSatisfactionDisplay();
}

export function renderLists() {
  DOM.liftList.innerHTML = state.lifts
    .map(
      (lift, i) => {
        const name = (lift.name || `Lift ${i + 1}`).trim();
        const typeId = lift.type || (state.liftTypes[0] && state.liftTypes[0].id);
        const liftType = state.liftTypes.find((l) => l.id === typeId);
        const typeLabel = (liftType || {}).name || typeId || 'Lift';
        const bottomImage = fromNormalized(lift.bottomStation.x, lift.bottomStation.y);
        const topImage = fromNormalized(lift.topStation.x, lift.topStation.y);
        const lengthM = getLiftLengthM(bottomImage, topImage);
        const lengthText = lengthM != null ? `Length: ${formatNumber(lengthM)} m` : '';
        const cap = liftType && liftType.capacity != null ? Number(liftType.capacity) : null;
        const capText = cap != null ? `Capacity: ${formatNumber(cap)}` : '';
        const metaParts = [lengthText, capText].filter(Boolean).map((t) => `<div class="lift-list-meta">${escapeHtml(t)}</div>`).join('');
        return `<li class="lift-list-item"><div class="lift-list-content"><span class="lift-list-name editable-lift-name" data-idx="${i}" title="${escapeHtml(typeLabel)} – click to edit name">${escapeHtml(name)}</span>${metaParts}</div><button type="button" class="remove-btn" data-type="lift" data-idx="${i}">Remove</button></li>`;
      }
    )
    .join('');
  DOM.slopeList.innerHTML = state.slopes
    .map(
      (s, i) => {
        const st = getSlopeType(s);
        const label = st?.difficulty ?? s.difficulty ?? 'Slope';
        let lengthM = null;
        let cap = typeof s.capacity === 'number' ? s.capacity : null;
        if (s.points && s.points.length >= 2) {
          const imagePoints = s.points.map((p) => fromNormalized(p.x, p.y));
          lengthM = getSlopePathLengthM(imagePoints);
          if (cap == null && st && st.capacity_per_meter != null) {
            cap = Math.round(lengthM * Number(st.capacity_per_meter));
          }
        }
        const lengthText = lengthM != null ? `Length: ${formatNumber(lengthM)} m` : '';
        const capText = cap != null ? `Capacity: ${formatNumber(cap)}` : '';
        const metaParts = [lengthText, capText].filter(Boolean).map((t) => `<div class="slope-list-meta">${escapeHtml(t)}</div>`).join('');
        return `<li class="slope-list-item"><div class="slope-list-content"><div><span class="diff-dot" style="color:${getDiffColor(s)}">●</span> ${escapeHtml(String(label))} ${i + 1}</div>${metaParts}</div><button type="button" class="remove-btn" data-type="slope" data-idx="${i}">Remove</button></li>`;
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

/** Save format version for future migrations. */
const SAVE_VERSION = 1;

export function exportConfig() {
  const config = {
    version: SAVE_VERSION,
    currentDate: state.currentDate,
    currentWeather: state.currentWeather,
    dailyVisitors: state.dailyVisitors,
    dailySales: state.dailySales,
    dailyCost: state.dailyCost,
    dailyProfit: state.dailyProfit,
    snowDepth: state.snowDepth,
    dailySnowfall: state.dailySnowfall,
    dailyTempLow: state.dailyTempLow,
    dailyTempHigh: state.dailyTempHigh,
    simulationSpeed: state.simulationSpeed,
    liftExperienceBucket: state.liftExperienceBucket,
    slopeCrowdBucket: state.slopeCrowdBucket,
    slopeQualityBucket: state.slopeQualityBucket,
    satisfaction: state.satisfaction,
    mode: state.mode,
    liftType: state.liftType,
    difficulty: state.difficulty,
    groomerType: state.groomerType,
    slopeDrawMode: state.slopeDrawMode,
    imageWidth: state.imageWidth,
    imageHeight: state.imageHeight,
    lifts: state.lifts,
    slopes: state.slopes,
    cottages: state.cottages,
    groomers: state.groomers,
    budget: state.budget,
  };
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'ski-map-save.json';
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

      // Map/layout
      if (config.imageWidth != null) state.imageWidth = config.imageWidth;
      if (config.imageHeight != null) state.imageHeight = config.imageHeight;
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

      // Full game state (only when present, for backward compatibility with old saves)
      if (config.budget != null) state.budget = config.budget;
      if (config.currentDate && typeof config.currentDate.year === 'number') {
        state.currentDate = {
          year: config.currentDate.year,
          month: config.currentDate.month ?? state.currentDate.month,
          day: config.currentDate.day ?? state.currentDate.day,
        };
      }
      const validWeather = ['sunny', 'snowy', 'blizzard', 'cloudy', 'icy'];
      if (validWeather.includes(config.currentWeather)) state.currentWeather = config.currentWeather;
      if (config.dailyVisitors != null) state.dailyVisitors = config.dailyVisitors;
      if (config.dailySales != null) state.dailySales = config.dailySales;
      if (config.dailyCost != null) state.dailyCost = config.dailyCost;
      if (config.dailyProfit != null) state.dailyProfit = config.dailyProfit;
      if (config.snowDepth != null) state.snowDepth = config.snowDepth;
      if (config.dailySnowfall != null) state.dailySnowfall = config.dailySnowfall;
      if (config.dailyTempLow != null) state.dailyTempLow = config.dailyTempLow;
      if (config.dailyTempHigh != null) state.dailyTempHigh = config.dailyTempHigh;
      if (config.simulationSpeed != null) state.simulationSpeed = config.simulationSpeed;
      const validBucket = ['good', 'medium', 'bad'];
      if (validBucket.includes(config.liftExperienceBucket)) state.liftExperienceBucket = config.liftExperienceBucket;
      if (validBucket.includes(config.slopeCrowdBucket)) state.slopeCrowdBucket = config.slopeCrowdBucket;
      if (validBucket.includes(config.slopeQualityBucket)) state.slopeQualityBucket = config.slopeQualityBucket;
      if (config.satisfaction != null) state.satisfaction = Math.max(0, Math.min(100, config.satisfaction));
      const validMode = ['lift', 'slope', 'cottage', 'groomer'];
      if (validMode.includes(config.mode)) state.mode = config.mode;
      if (config.liftType != null) state.liftType = config.liftType;
      if (config.difficulty != null) state.difficulty = config.difficulty;
      if (config.groomerType != null) state.groomerType = config.groomerType;
      if (config.slopeDrawMode === 'points' || config.slopeDrawMode === 'pen') state.slopeDrawMode = config.slopeDrawMode;

      refresh();
      if (typeof window.onGameStateRestored === 'function') window.onGameStateRestored();
    } catch (err) {
      alert('Invalid config file: ' + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}
