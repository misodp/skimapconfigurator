/**
 * Optional Supabase leaderboard row when the player saves the game.
 * Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see .env.example and supabase/leaderboard.sql).
 */

import { createClient } from '@supabase/supabase-js';
import { state } from './state';
import { getEffectiveSatisfaction, getReputationMultipliers } from './achievements.js';

const url = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_SUPABASE_URL : '';
const anonKey = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_SUPABASE_ANON_KEY : '';

/** @type {import('@supabase/supabase-js').SupabaseClient | null} */
let client = null;

const LEADERBOARD_CLIENT_ID_KEY = 'summit67_leaderboard_client_id';

function randomLeaderboardClientId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `s67-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

/**
 * Stable id per browser (localStorage). Same "PC" session updates one leaderboard row when score improves.
 * @returns {string | null}
 */
export function getOrCreateLeaderboardClientId() {
  if (typeof localStorage === 'undefined') return null;
  try {
    let id = localStorage.getItem(LEADERBOARD_CLIENT_ID_KEY);
    if (!id || id.length < 8) {
      id = randomLeaderboardClientId();
      localStorage.setItem(LEADERBOARD_CLIENT_ID_KEY, id);
    }
    return id.slice(0, 200);
  } catch {
    return null;
  }
}

function getSupabase() {
  if (!url || !anonKey || typeof url !== 'string' || typeof anonKey !== 'string') return null;
  if (!url.startsWith('http')) return null;
  if (!client) client = createClient(url, anonKey);
  return client;
}

/**
 * Leaderboard sort key: money/10 + satisfaction (clamped 0–100, rounded to whole % e.g. 56) ×1000 + peak daily skiers×5.
 * @param {{ money: number; satisfaction: number; topSkiersInDay: number }} p
 */
export function computeLeaderboardScore(p) {
  const money = Math.max(0, Number(p.money) || 0);
  const sat = Math.round(Math.max(0, Math.min(100, Number(p.satisfaction) || 0)));
  const skiers = Math.max(0, Math.round(Number(p.topSkiersInDay) || 0));
  return money / 10 + sat * 1000 + skiers * 5;
}

/**
 * Insert one leaderboard / archive row. Fails softly (logs only) so local save always works.
 * @param {Record<string, unknown>} saveConfig — same object written to ski-map-save.json
 */
export async function submitLeaderboardFromSave(saveConfig) {
  const supabase = getSupabase();
  if (!supabase) {
    return { skipped: true };
  }

  const rep = getReputationMultipliers();
  const effectiveSat = Math.round(getEffectiveSatisfaction() * 100) / 100;
  const rawSat = Math.round(Math.max(0, Math.min(100, Number(state.satisfaction) || 0)) * 100) / 100;
  const moneyVal = Math.max(0, Math.round(Number(state.budget) || 0));
  const peakSkiersVal = Math.max(0, Math.round(Number(state.peakDailyVisitors) || 0));
  const leaderboardScore = computeLeaderboardScore({
    money: moneyVal,
    satisfaction: rawSat,
    topSkiersInDay: peakSkiersVal,
  });
  /** Stored leaderboard score: raw formula value ÷ 1000, rounded (Hall of Fame sorts on this). */
  const score = Math.round(leaderboardScore / 1000);

  const row = {
    player_name: String(state.playerName || 'Anonymous').trim().slice(0, 200) || 'Anonymous',
    score,
    satisfaction_raw: rawSat,
    satisfaction_effective: effectiveSat,
    achievements: { ...state.achievements },
    reputation_lift: Math.round(rep.lift * 10000) / 10000,
    reputation_slope: Math.round(rep.slope * 10000) / 10000,
    reputation_combined: Math.round(rep.combined * 10000) / 10000,
    top_skiers_in_day: peakSkiersVal,
    money: moneyVal,
    save_json: saveConfig,
  };

  const clientId = getOrCreateLeaderboardClientId();

  if (clientId) {
    const payload = {
      player_client_id: clientId,
      player_name: row.player_name,
      score: row.score,
      satisfaction_raw: row.satisfaction_raw,
      satisfaction_effective: row.satisfaction_effective,
      achievements: row.achievements,
      reputation_lift: row.reputation_lift,
      reputation_slope: row.reputation_slope,
      reputation_combined: row.reputation_combined,
      top_skiers_in_day: row.top_skiers_in_day,
      money: row.money,
      save_json: saveConfig,
    };

    const { data: rpcId, error: rpcError } = await supabase.rpc('upsert_game_save', { p_payload: payload });

    if (!rpcError) {
      const insertedId = rpcId != null ? String(rpcId) : null;
      return { ok: true, insertedId };
    }

    const msg = rpcError.message || '';
    const missingFn =
      rpcError.code === '42883' ||
      /upsert_game_save|function public\.upsert_game_save|does not exist/i.test(msg);
    if (missingFn) {
      console.warn(
        '[Summit leaderboard] upsert_game_save RPC missing — run supabase/upsert_game_save.sql. Falling back to plain insert.',
      );
    } else {
      console.warn('[Summit leaderboard] upsert_game_save failed:', msg);
      return { error: rpcError };
    }
  }

  const { data: inserted, error } = await supabase.from('game_saves').insert(row).select('id').single();

  if (error) {
    console.warn('[Summit leaderboard] Supabase insert failed:', error.message);
    return { error };
  }
  const insertedId = inserted && inserted.id != null ? String(inserted.id) : null;
  return { ok: true, insertedId };
}

/**
 * Top N rows by score (desc) for Hall of Fame UI.
 * @param {number} [limit=10]
 * @returns {Promise<{ rows: Array<Record<string, unknown>>, error?: { message?: string }, skipped?: boolean }>}
 */
export async function fetchTopLeaderboardByScore(limit = 10) {
  const supabase = getSupabase();
  if (!supabase) {
    return { rows: [], skipped: true };
  }

  const { data, error } = await supabase
    .from('game_saves')
    .select('id, player_name, score, satisfaction_effective, top_skiers_in_day, money')
    .order('score', { ascending: false })
    .limit(Math.max(1, Math.min(50, limit)));

  if (error) {
    console.warn('[Summit leaderboard] Supabase select failed:', error.message);
    return { rows: [], error };
  }

  return { rows: data ?? [] };
}
