/**
 * Vanilla weather icon display for the header. Uses same SVG designs as the React component.
 */

import { state, DOM } from './state';
import type { WeatherType } from './weather-simulation';
import { getWeatherLabel } from './weather-simulation';

const WEATHER_COLORS: Record<WeatherType, string> = {
  sunny: '#fbbf24',
  snowy: '#7dd3fc',
  cloudy: '#94a3b8',
  blizzard: '#bfdbfe',
  icy: '#67e8f9',
};

function sunSvg(color: string): string {
  const rays = [0, 45, 90, 135, 180, 225, 270, 315]
    .map((angle) => {
      const rad = (angle * Math.PI) / 180;
      const x1 = 12 + Math.cos(rad) * 6;
      const y1 = 12 + Math.sin(rad) * 6;
      const x2 = 12 + Math.cos(rad) * 8.5;
      const y2 = 12 + Math.sin(rad) * 8.5;
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>`;
    })
    .join('');
  return `<svg viewBox="0 0 24 24" fill="none" width="24" height="24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="${color}" opacity="0.9"/>${rays}</svg>`;
}

function snowflakeSvg(color: string): string {
  const circles = [0, 60, 120, 180, 240, 300]
    .map((angle) => {
      const rad = (angle * Math.PI) / 180;
      const cx = 12 + Math.cos(rad) * 5;
      const cy = 12 + Math.sin(rad) * 5;
      return `<circle cx="${cx}" cy="${cy}" r="1" fill="${color}"/>`;
    })
    .join('');
  return `<svg viewBox="0 0 24 24" fill="none" width="24" height="24" aria-hidden="true"><line x1="12" y1="2" x2="12" y2="22" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/><line x1="2" y1="12" x2="22" y2="12" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/><line x1="19.07" y1="4.93" x2="4.93" y2="19.07" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>${circles}</svg>`;
}

function cloudSvg(color: string): string {
  const path = 'M6.5 17.5a4 4 0 0 1-.88-7.9A6 6 0 0 1 17.5 10a4.5 4.5 0 0 1 .5 8.97';
  return `<svg viewBox="0 0 24 24" fill="none" width="24" height="24" aria-hidden="true"><path d="${path}" fill="${color}" opacity="0.2"/><path d="${path}" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function blizzardSvg(color: string): string {
  const path = 'M6.5 13a4 4 0 0 1-.88-7.9A6 6 0 0 1 17.5 6a4.5 4.5 0 0 1 .5 8.97';
  const flakes = [7, 12, 17]
    .map(
      (x) =>
        `<line x1="${x}" y1="16" x2="${x - 1.5}" y2="21" stroke="${color}" stroke-width="1.2" stroke-linecap="round"/><line x1="${x}" y1="18" x2="${x + 1}" y2="19.5" stroke="${color}" stroke-width="1" stroke-linecap="round"/>`
    )
    .join('');
  return `<svg viewBox="0 0 24 24" fill="none" width="24" height="24" aria-hidden="true"><path d="${path}" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>${flakes}</svg>`;
}

function iceSvg(color: string): string {
  return `<svg viewBox="0 0 24 24" fill="none" width="24" height="24" aria-hidden="true"><path d="M12 2L14.5 9H9.5L12 2Z" fill="${color}" opacity="0.3" stroke="${color}" stroke-width="1"/><path d="M6 8L10 14H2L6 8Z" fill="${color}" opacity="0.3" stroke="${color}" stroke-width="1"/><path d="M18 8L22 14H14L18 8Z" fill="${color}" opacity="0.3" stroke="${color}" stroke-width="1"/><line x1="4" y1="19" x2="20" y2="19" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/><line x1="6" y1="21.5" x2="18" y2="21.5" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/></svg>`;
}

function getWeatherIconSvg(type: WeatherType): string {
  const color = WEATHER_COLORS[type];
  switch (type) {
    case 'sunny':
      return sunSvg(color);
    case 'snowy':
      return snowflakeSvg(color);
    case 'cloudy':
      return cloudSvg(color);
    case 'blizzard':
      return blizzardSvg(color);
    case 'icy':
      return iceSvg(color);
    default:
      return cloudSvg(color);
  }
}

/**
 * Update the header weather display with the current weather icon and label.
 */
export function updateWeatherDisplay(): void {
  const el = DOM.weatherDisplay;
  if (!el) return;
  const type = state.currentWeather;
  const label = getWeatherLabel(type);
  el.innerHTML = getWeatherIconSvg(type);
  el.title = label;
  el.setAttribute('aria-label', `Weather: ${label}`);
}
