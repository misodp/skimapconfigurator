/**
 * Tycoon game loop: advances simulation date every TICK_MS, updates header display.
 */

import { state, DOM } from './state';
import type { SimulationDate } from './types';

const TICK_MS = 3000; // one game day per 3 seconds

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
 * Advance state.currentDate by one day. Handles month/year rollover.
 */
function advanceDay(): void {
  const d = state.currentDate;
  const maxDay = daysInMonth(d.month, d.year);
  d.day += 1;
  if (d.day > maxDay) {
    d.day = 1
    d.month += 1;
    if (d.month > 12) {
      d.month = 1;
      d.year += 1;
    }
  }
}

/**
 * Format simulation date for display, e.g. "November 1, 1960".
 */
export function formatSimulationDate(date: SimulationDate | null | undefined): string {
  if (!date) return '';
  const name = MONTH_NAMES[Math.max(0, date.month - 1)] ?? '?';
  return `${name} ${date.day}, ${date.year}`;
}

/**
 * Update the header date display element.
 */
export function updateDateDisplay(): void {
  if (DOM.currentDateDisplay) {
    DOM.currentDateDisplay.textContent = formatSimulationDate(state.currentDate);
  }
}

let intervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Start the game loop. Each tick advances the date by one day and refreshes the date display.
 */
export function startSimulation(): void {
  if (intervalId != null) return;
  updateDateDisplay();
  intervalId = setInterval(() => {
    advanceDay();
    updateDateDisplay();
    // Future: run daily economics, events, etc. here
  }, TICK_MS);
}

/**
 * Stop the game loop (e.g. for pause menu).
 */
export function stopSimulation(): void {
  if (intervalId != null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
