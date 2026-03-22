/**
 * Summit '67 Hall of Fame — shown after saving; lists top scores from Supabase.
 */

import skidollarGoldUrl from '../../assets/images/Skidollar_gold.webp';
import skidollarSilverUrl from '../../assets/images/Skidollar_silver.webp';
import skidollarBronzeUrl from '../../assets/images/Skidollar_bronze.webp';
import { escapeHtml, formatNumber, formatCurrency } from '../utils.js';
import { submitLeaderboardFromSave, fetchTopLeaderboardByScore } from '../leaderboard-supabase.js';

/** @param {number} rank 1-based */
function podiumSkidollarUrl(rank) {
  if (rank === 1) return skidollarGoldUrl;
  if (rank === 2) return skidollarSilverUrl;
  if (rank === 3) return skidollarBronzeUrl;
  return '';
}

/** @param {number} rank */
function podiumSkidollarAlt(rank) {
  if (rank === 1) return 'Gold';
  if (rank === 2) return 'Silver';
  if (rank === 3) return 'Bronze';
  return '';
}

function getOverlay() {
  return document.getElementById('hallOfFameOverlay');
}

function getTableWrap() {
  return document.getElementById('hallOfFameTableWrap');
}

function getTbody() {
  return document.getElementById('hallOfFameTbody');
}

function getLoadingEl() {
  return document.getElementById('hallOfFameLoading');
}

function getErrorEl() {
  return document.getElementById('hallOfFameError');
}

/** @type {(() => void) | null} */
let teardownEscape = null;

function closeHallOfFame() {
  const overlay = getOverlay();
  if (!overlay) return;
  overlay.classList.remove('visible');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.hidden = true;
  if (teardownEscape) {
    teardownEscape();
    teardownEscape = null;
  }
}

function bindCloseHandlersOnce() {
  const overlay = getOverlay();
  if (!overlay || overlay.dataset.bound === '1') return;
  overlay.dataset.bound = '1';
  overlay.querySelector('.hall-of-fame-backdrop')?.addEventListener('click', closeHallOfFame);
  overlay.querySelector('.hall-of-fame-close')?.addEventListener('click', closeHallOfFame);
}

function attachEscapeToClose() {
  if (teardownEscape) teardownEscape();
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeHallOfFame();
    }
  };
  document.addEventListener('keydown', onKey);
  teardownEscape = () => document.removeEventListener('keydown', onKey);
}

/** Same as sidebar "Reputation": effective satisfaction 0–100%, rounded (see updateSatisfactionDisplay). */
function formatReputationPercent(val) {
  if (val == null || val === '') return '—';
  const n = Number(val);
  if (!Number.isFinite(n)) return '—';
  return `${Math.round(Math.max(0, Math.min(100, n)))}%`;
}

/**
 * After local save download: submit row, fetch top 10, show panel.
 * @param {Record<string, unknown>} saveConfig
 */
export async function openHallOfFameAfterSave(saveConfig) {
  const overlay = getOverlay();
  const tableWrap = getTableWrap();
  const tbody = getTbody();
  const loadingEl = getLoadingEl();
  const errorEl = getErrorEl();
  if (!overlay || !tableWrap || !tbody || !loadingEl || !errorEl) return;

  bindCloseHandlersOnce();
  attachEscapeToClose();

  overlay.hidden = false;
  overlay.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => overlay.classList.add('visible'));

  loadingEl.classList.remove('hidden');
  loadingEl.hidden = false;
  tableWrap.classList.add('hidden');
  tableWrap.hidden = true;
  tbody.innerHTML = '';
  errorEl.classList.add('hidden');
  errorEl.hidden = true;
  errorEl.textContent = '';

  /** @type {string | null} */
  let insertedId = null;
  try {
    const submitRes = await submitLeaderboardFromSave(saveConfig);
    if (submitRes && typeof submitRes.insertedId === 'string') insertedId = submitRes.insertedId;
  } catch (err) {
    console.warn('[Hall of Fame] submit', err);
  }

  const { rows, error, skipped } = await fetchTopLeaderboardByScore(10);

  loadingEl.classList.add('hidden');
  loadingEl.hidden = true;

  if (skipped) {
    errorEl.textContent =
      'Hall of Fame needs Supabase. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your environment.';
    errorEl.classList.remove('hidden');
    errorEl.hidden = false;
    return;
  }

  if (error) {
    errorEl.textContent =
      error.message ||
      'Could not load the leaderboard. In Supabase, enable SELECT for anonymous users on game_saves (see supabase/leaderboard.sql).';
    errorEl.classList.remove('hidden');
    errorEl.hidden = false;
    return;
  }

  if (!rows.length) {
    tbody.innerHTML = `<tr class="hall-of-fame-empty-row"><td colspan="6" class="hall-of-fame-empty">No entries yet. Be the first on the board!</td></tr>`;
  } else {
    tbody.innerHTML = rows
      .map((row, i) => {
        const name = String(row.player_name || 'Anonymous').trim() || 'Anonymous';
        const score = Number(row.score);
        const scoreText = Number.isFinite(score) ? String(Math.round(score)) : '—';
        const rank = i + 1;
        const rep = formatReputationPercent(row.satisfaction_effective);
        const skiers = row.top_skiers_in_day;
        const skiersText =
          skiers != null && skiers !== '' && Number.isFinite(Number(skiers))
            ? formatNumber(Math.round(Number(skiers)))
            : '—';
        const money = row.money;
        const moneyText =
          money != null && money !== '' && Number.isFinite(Number(money))
            ? formatCurrency(Math.round(Number(money)))
            : '—';
        const rowId = row.id != null ? String(row.id) : '';
        const isYou = Boolean(insertedId && rowId && rowId === insertedId);
        const classes = ['hall-of-fame-data-row'];
        if (i === 0) classes.push('hall-of-fame-row--first');
        if (isYou) classes.push('hall-of-fame-row--you');
        const youLabel = isYou ? '<span class="hall-of-fame-you-badge">You</span>' : '';
        const coinSrc = podiumSkidollarUrl(rank);
        const coinAlt = podiumSkidollarAlt(rank);
        const coinHtml = coinSrc
          ? `<img src="${escapeHtml(coinSrc)}" alt="${escapeHtml(coinAlt)}" class="hall-of-fame-podium-coin" width="22" height="22" />`
          : '';
        return `<tr class="${classes.join(' ')}"${isYou ? ' data-hall-of-fame-you="true"' : ''}>
          <td class="hall-of-fame-td-rank">${rank}</td>
          <td class="hall-of-fame-td-name" title="${escapeHtml(name)}"><span class="hall-of-fame-name-inner">${coinHtml}<span class="hall-of-fame-name-text">${escapeHtml(name)}</span>${youLabel}</span></td>
          <td class="hall-of-fame-td-num hall-of-fame-td-score">${escapeHtml(scoreText)}</td>
          <td class="hall-of-fame-td-num">${escapeHtml(rep)}</td>
          <td class="hall-of-fame-td-num">${escapeHtml(skiersText)}</td>
          <td class="hall-of-fame-td-num">${escapeHtml(moneyText)}</td>
        </tr>`;
      })
      .join('');
  }

  tableWrap.classList.remove('hidden');
  tableWrap.hidden = false;
}
