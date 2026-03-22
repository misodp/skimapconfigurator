/**
 * Formatting and UI helpers.
 */

/**
 * Tech tree entries may set `can_buy: false` to hide them from the invest UI.
 * Missing or true means the item can be purchased (default).
 * @param {{ can_buy?: boolean } | null | undefined} entry
 * @returns {boolean}
 */
export function isTechBuyable(entry) {
  return Boolean(entry) && entry.can_buy !== false;
}

export function formatNumber(n) {
  if (n === undefined || n === null) return '—';
  if (Number.isInteger(n)) return String(n);
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function formatCurrency(n) {
  if (n === undefined || n === null) return '—';
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

export function scale1to3(value, min, max) {
  if (value === undefined || value === null || max === min) return 2;
  const t = (Number(value) - min) / (max - min);
  return Math.max(1, Math.min(3, Math.round(1 + t * 2)));
}

export function skidollarIconsHtml(count, url) {
  if (!url || count < 1) return '—';
  const n = Math.max(1, Math.min(3, Math.round(count)));
  return Array.from({ length: n }, () => `<img src="${url}" alt="" class="skidollar-icon" />`).join('');
}
