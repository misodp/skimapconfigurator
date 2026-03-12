/**
 * Config export/import, sidebar lists, budget display, and central refresh().
 */

import { state, DOM, getSlopeType, getDiffColor } from './state';
import { draw } from './draw.js';
import { escapeHtml, formatCurrency, formatNumber } from './utils.js';
import { getDailyVisitors } from './economics.js';
import { getSlopePathLengthM, getLiftLengthM, fromNormalized } from './geometry.js';
import { getTotalLiftCapacity, getTotalSlopeCapacity, getTotalGroomingDemand, getTotalGroomingCapacity } from './experience-simulator';
import { updateAchievementBadges, getEffectiveSatisfaction } from './achievements.js';

export function updateBudgetDisplay() {
  const el = document.getElementById('budgetAmount');
  if (el) el.textContent = formatCurrency(state.budget);
  const dailyEl = document.getElementById('headerDailyProfit');
  if (dailyEl) {
    const profit = state.dailyProfit;
    dailyEl.textContent = (profit >= 0 ? '+' : '') + formatCurrency(profit);
    dailyEl.classList.remove('profit', 'loss');
    if (profit > 0) dailyEl.classList.add('profit');
    else if (profit < 0) dailyEl.classList.add('loss');
  }
}

export function updateVisitorsDisplay() {
  if (DOM.visitorsDisplay) {
    DOM.visitorsDisplay.textContent = formatNumber(state.dailyVisitors);
  }
  const headerEl = document.getElementById('headerVisitorsDisplay');
  if (headerEl) {
    headerEl.textContent = formatNumber(state.dailyVisitors) + ' visitors';
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

function experienceFillClass(value) {
  if (value < 34) return 'experience-fill-low';
  if (value < 67) return 'experience-fill-mid';
  return 'experience-fill-high';
}

function experienceStateLabel(value) {
  if (value < 34) return 'Bad';
  if (value < 67) return 'Medium';
  return 'Good';
}

function changeSymbol(change) {
  if (change === 'up') return '↑';
  if (change === 'down') return '↓';
  return '−';
}

/** Update lift wait, slope crowd and slope quality. Lift/crowds: shorter bar = better; slope quality: longer bar = better. Single color by state (red/amber/green). */
export function updateExperienceDisplay() {
  const metrics = [
    { el: DOM.liftExperienceDisplay, value: state.liftExperience, change: state.liftExperienceChange, inverted: true },
    { el: DOM.slopeExperienceDisplay, value: state.slopeCrowdExperience, change: state.slopeCrowdChange, inverted: true },
    { el: DOM.slopeQualityDisplay, value: state.slopeQualityExperience, change: state.slopeQualityChange, inverted: false },
  ];
  metrics.forEach(({ el, value, change, inverted }) => {
    if (!el) return;
    const metric = el.closest('.experience-metric');
    const fill = el.querySelector('.experience-fill');
    const changeEl = metric?.querySelector('.experience-change');
    const stateLabelEl = metric?.querySelector('.experience-state-label');
    const pct = Math.max(0, Math.min(100, value));
    const fillPct = inverted ? 100 - pct : pct;
    if (fill) {
      fill.style.width = `${fillPct}%`;
      fill.classList.remove('experience-fill-low', 'experience-fill-mid', 'experience-fill-high');
      fill.classList.add(experienceFillClass(pct));
    }
    if (changeEl) {
      changeEl.textContent = changeSymbol(change);
      changeEl.classList.remove('change-up', 'change-down', 'change-stable');
      changeEl.classList.add('change-' + change);
    }
    if (stateLabelEl) stateLabelEl.textContent = experienceStateLabel(pct);
  });
}

/** Update overall satisfaction bar and percentage in the stats panel. Uses effective satisfaction (capped by unlocked badges). */
export function updateSatisfactionDisplay() {
  if (!DOM.satisfactionDisplay) return;
  const effective = getEffectiveSatisfaction();
  const fill = DOM.satisfactionDisplay.querySelector('.satisfaction-fill');
  const valueEl = DOM.satisfactionDisplay.querySelector('.satisfaction-value');
  const pct = Math.round(effective);
  if (fill) {
    fill.style.width = `${effective}%`;
    fill.classList.remove('satisfaction-fill-low', 'satisfaction-fill-mid', 'satisfaction-fill-high');
    if (effective < 34) fill.classList.add('satisfaction-fill-low');
    else if (effective < 67) fill.classList.add('satisfaction-fill-mid');
    else fill.classList.add('satisfaction-fill-high');
  }
  if (valueEl) valueEl.textContent = `${pct}%`;
}

/** Redraw canvas, update lists, refresh budget and visitors. Call after any state change. */
export function refresh() {
  draw();
  renderLists();
  state.dailyVisitors = getDailyVisitors();
  updateBudgetDisplay();
  updateVisitorsDisplay();
  updateExperienceDisplay();
  updateSatisfactionDisplay();
  updateAchievementBadges();
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
          const displayName = g.name || `${typeLabel} ${i + 1}`;
          return `<li><span class="groomer-list-name" title="${escapeHtml(displayName)}">${escapeHtml(displayName)}</span> <button type="button" class="remove-btn" data-type="groomer" data-idx="${i}">Remove</button></li>`;
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
    liftExperience: state.liftExperience,
    slopeCrowdExperience: state.slopeCrowdExperience,
    slopeQualityExperience: state.slopeQualityExperience,
    satisfaction: state.satisfaction,
    mode: state.mode,
    liftType: state.liftType,
    difficulty: state.difficulty,
    groomerType: state.groomerType,
    slopeDrawMode: state.slopeDrawMode,
    resortOpen: state.resortOpen,
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
        health: Math.max(0, Math.min(100, l.health ?? 100)),
        installedDate: l.installedDate && typeof l.installedDate.year === 'number'
          ? { year: l.installedDate.year, month: l.installedDate.month ?? 1, day: l.installedDate.day ?? 1 }
          : { ...state.currentDate },
        broken: l.broken === true ? true : undefined,
        repairCost: typeof l.repairCost === 'number' && l.repairCost > 0 ? l.repairCost : undefined,
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
      state.groomers = (config.groomers ?? []).map((g, i) => ({
        position: g.position,
        groomerTypeId: (state.groomerTypes.some((t) => t.id === g.groomerTypeId) && g.groomerTypeId) ? g.groomerTypeId : defaultGroomerId,
        name: g.name || `Groomer ${i + 1}`,
        health: Math.max(0, Math.min(100, g.health ?? 100)),
        installedDate: g.installedDate && typeof g.installedDate.year === 'number'
          ? { year: g.installedDate.year, month: g.installedDate.month ?? 1, day: g.installedDate.day ?? 1 }
          : { ...state.currentDate },
        broken: g.broken === true ? true : undefined,
        repairCost: typeof g.repairCost === 'number' && g.repairCost > 0 ? g.repairCost : undefined,
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
      if (config.liftExperience != null) state.liftExperience = Math.max(0, Math.min(100, Number(config.liftExperience)));
      else if (config.liftExperienceBucket != null) state.liftExperience = config.liftExperienceBucket === 'good' ? 80 : config.liftExperienceBucket === 'medium' ? 50 : 20;
      if (config.slopeCrowdExperience != null) state.slopeCrowdExperience = Math.max(0, Math.min(100, Number(config.slopeCrowdExperience)));
      else if (config.slopeCrowdBucket != null) state.slopeCrowdExperience = config.slopeCrowdBucket === 'good' ? 80 : config.slopeCrowdBucket === 'medium' ? 50 : 20;
      if (config.slopeQualityExperience != null) state.slopeQualityExperience = Math.max(0, Math.min(100, Number(config.slopeQualityExperience)));
      else if (config.slopeQualityBucket != null) state.slopeQualityExperience = config.slopeQualityBucket === 'good' ? 80 : config.slopeQualityBucket === 'medium' ? 50 : 20;
      if (config.satisfaction != null) state.satisfaction = Math.max(0, Math.min(100, config.satisfaction));
      const validMode = ['lift', 'slope', 'cottage', 'groomer'];
      if (validMode.includes(config.mode)) state.mode = config.mode;
      if (config.liftType != null) state.liftType = config.liftType;
      if (config.difficulty != null) state.difficulty = config.difficulty;
      if (config.groomerType != null) state.groomerType = config.groomerType;
      if (config.slopeDrawMode === 'points' || config.slopeDrawMode === 'pen') state.slopeDrawMode = config.slopeDrawMode;
      if (config.resortOpen !== undefined) state.resortOpen = Boolean(config.resortOpen);

      refresh();
      if (typeof window.onGameStateRestored === 'function') window.onGameStateRestored();
    } catch (err) {
      alert('Invalid config file: ' + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}
