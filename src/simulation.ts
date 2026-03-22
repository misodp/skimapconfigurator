/**
 * Tycoon game loop: advances simulation date every TICK_MS, updates header display.
 */

import { state, DOM, recordPeakDailyVisitors } from './state';
import type { SimulationDate } from './types';
import { getSeason, generateWeatherForSeason, getDailySnowfall, getDailyMelt, getTempRange } from './weather-simulation';
import { updateWeatherDisplay } from './weather-icon';
import { getDailyOperatingCost, getDailyVisitors, getTicketPrice } from './economics.js';
import { getTotalSlopeCapacity, getLiftWaitRawScore, getSlopeCrowdRawScore, getTotalGroomingDemand, getSlopeQualityRawScore, driftLiftExperience, driftSlopeCrowdExperience, driftSlopeQualityExperience, driftSatisfaction } from './experience-simulator';
import { updateBudgetDisplay, updateVisitorsDisplay, updateDailyFinanceDisplay, updateSnowDepthDisplay, updateExperienceDisplay, updateSatisfactionDisplay, updateLiftInfoPanel } from './config.js';
import { renderLiftTypeDropdown } from './ui/lifts.js';
import { renderGroomerTypeDropdown } from './ui/groomers.js';
import { updateMountainImage } from './mountain-images.js';
import { updateMaintenance, getEffectiveLiftCapacity, getEffectiveGroomingCapacity } from './maintenance_simulator';
import { refreshLiftHoverPopupIfOpen, refreshGroomerHoverPopupIfOpen } from './canvas.js';
import { draw } from './draw.js';
import { updateNewsFeed } from './news-feed.js';

const BASE_TICK_MS = 3000; // one game day per 3 seconds at 1x

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function daysInMonth(month: number, year: number): number {
  if (month === 2) {
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return isLeap ? 29 : 28;
  }
  if ([4, 6, 9, 11].includes(month)) return 30;
  return 31;
}

/**
 * Advance state.currentDate by one day and simulate weather for the new day.
 */
function advanceDay(): void {
  const d = state.currentDate;
  const maxDay = daysInMonth(d.month, d.year);
  d.day += 1;
  if (d.day > maxDay) {
    d.day = 1;
    d.month += 1;
    if (d.month > 12) {
      d.month = 1;
      d.year += 1;
    }
  }
  const season = getSeason(d.month);
  state.currentWeather = generateWeatherForSeason(season);
  const dailySnowfall = getDailySnowfall(state.currentWeather);
  const [dailyTempLow, dailyTempHigh] = getTempRange(season, state.currentWeather);
  state.dailySnowfall = dailySnowfall;
  state.dailyTempLow = dailyTempLow;
  state.dailyTempHigh = dailyTempHigh;
  const dailyMelt = getDailyMelt(season, state.currentWeather);
  state.snowDepth = Math.max(0, Math.min(450, state.snowDepth + dailySnowfall - dailyMelt));
  state.dailyVisitors = getDailyVisitors();
  recordPeakDailyVisitors(state.dailyVisitors);
  const effectiveLiftCap = getEffectiveLiftCapacity();
  const slopeCap = getTotalSlopeCapacity();
  const groomingDemand = getTotalGroomingDemand();
  const effectiveGroomingCap = getEffectiveGroomingCapacity();
  driftLiftExperience(getLiftWaitRawScore(state.dailyVisitors, effectiveLiftCap));
  driftSlopeCrowdExperience(getSlopeCrowdRawScore(state.dailyVisitors, slopeCap));
  driftSlopeQualityExperience(getSlopeQualityRawScore(groomingDemand, effectiveGroomingCap));
  driftSatisfaction();
  updateMaintenance(groomingDemand);
    draw();
    state.dailySales = state.dailyVisitors * getTicketPrice();
  state.dailyCost = getDailyOperatingCost();
  state.dailyProfit = state.dailySales - state.dailyCost;
  state.budget = Math.max(0, state.budget + state.dailyProfit);
}

/**
 * Format simulation date for display, e.g. "November 1, 1960".
 */
export function formatSimulationDate(date: SimulationDate | null | undefined): string {
  if (!date) return '';
  const name = MONTH_NAMES[Math.max(0, date.month - 1)] ?? '?';
  return `${name} ${date.day}, ${date.year}`;
}

function formatSeasonLabel(season: string): string {
  return season.charAt(0).toUpperCase() + season.slice(1);
}

/**
 * Update the header date and season display elements.
 */
export function updateDateDisplay(): void {
  if (DOM.currentDateDisplay) {
    DOM.currentDateDisplay.textContent = formatSimulationDate(state.currentDate);
  }
  if (DOM.seasonDisplay) {
    const season = getSeason(state.currentDate.month);
    DOM.seasonDisplay.textContent = formatSeasonLabel(season);
  }
}

let intervalId: ReturnType<typeof setInterval> | null = null;
let lastRenderedDropdownYear: number | null = null;
let simulationTickCount = 0;

function getIntervalMsFromSpeed(): number | null {
  const speed = Number.isFinite(state.simulationSpeed) ? Math.max(0, Math.min(3, state.simulationSpeed)) : 1;
  if (speed <= 0) return null; // paused
  return BASE_TICK_MS / speed;
}

function clearLoop() {
  if (intervalId != null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function startLoopWithCurrentSpeed() {
  clearLoop();
  const intervalMs = getIntervalMsFromSpeed();
  if (intervalMs == null) return; // paused
  intervalId = setInterval(() => {
    advanceDay(); // always one in‑game day per tick
    simulationTickCount += 1;
    updateDateDisplay();
    updateWeatherDisplay();
    updateMountainImage();
    updateVisitorsDisplay();
    updateDailyFinanceDisplay();
    updateSnowDepthDisplay();
    updateExperienceDisplay();
    updateSatisfactionDisplay();
    updateBudgetDisplay();
    updateLiftInfoPanel();
    updateNewsFeed(simulationTickCount);
    if (state.budget <= 0) {
      clearLoop();
      window.dispatchEvent(new CustomEvent('gameover'));
      return;
    }
    const year = state.currentDate.year;
    if (lastRenderedDropdownYear !== year) {
      lastRenderedDropdownYear = year;
      renderLiftTypeDropdown({ skipPanelBlank: true });
      renderGroomerTypeDropdown({ skipPanelBlank: true });
    }
    refreshLiftHoverPopupIfOpen();
    refreshGroomerHoverPopupIfOpen();
  }, intervalMs);
}

/**
 * Start the game loop. Each tick advances the date by one day; speed changes the tick interval.
 */
export function startSimulation(): void {
  if (intervalId != null) return;
  // Set initial weather and visitors for start date
  const startSeason = getSeason(state.currentDate.month);
  state.currentWeather = generateWeatherForSeason(startSeason);
  state.dailySnowfall = getDailySnowfall(state.currentWeather);
  const [tLow, tHigh] = getTempRange(startSeason, state.currentWeather);
  state.dailyTempLow = tLow;
  state.dailyTempHigh = tHigh;
  state.dailyVisitors = getDailyVisitors();
  recordPeakDailyVisitors(state.dailyVisitors);
  const effectiveLiftCap = getEffectiveLiftCapacity();
  const slopeCap = getTotalSlopeCapacity();
  const groomingDemand = getTotalGroomingDemand();
  const effectiveGroomingCap = getEffectiveGroomingCapacity();
  state.liftExperience = getLiftWaitRawScore(state.dailyVisitors, effectiveLiftCap);
  state.slopeCrowdExperience = getSlopeCrowdRawScore(state.dailyVisitors, slopeCap);
  state.slopeQualityExperience = getSlopeQualityRawScore(groomingDemand, effectiveGroomingCap);
  state.liftExperienceChange = state.slopeCrowdChange = state.slopeQualityChange = 'stable';
  updateDateDisplay();
  updateWeatherDisplay();
  updateMountainImage();
  updateVisitorsDisplay();
  updateDailyFinanceDisplay();
  updateSnowDepthDisplay();
  updateExperienceDisplay();
  updateSatisfactionDisplay();
  startLoopWithCurrentSpeed();
}

/**
 * Apply the current simulationSpeed (pause / 1x / 2x / 3x) to the loop.
 */
export function applySimulationSpeed(): void {
  startLoopWithCurrentSpeed();
}

/**
 * Stop the game loop (e.g. for pause menu).
 */
export function stopSimulation(): void {
  clearLoop();
}
