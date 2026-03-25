import { state } from './state';

/** @typedef {'easy' | 'medium' | 'hard'} GameDifficulty */

const PROFILES = {
  easy: {
    badgeExponent: 0.95,
    repLiftWeight: 0.5,
    repSlopeWeight: 0.5,
    servicePenaltyMin: 0.85,
    sizeCostThreshold: Infinity,
    sizeCostMaxExtra: 0,
    sizeCostSpan: 1,
  },
  medium: {
    badgeExponent: 0.85,
    repLiftWeight: 0.45,
    repSlopeWeight: 0.55,
    servicePenaltyMin: 0.75,
    sizeCostThreshold: Infinity,
    sizeCostMaxExtra: 0,
    sizeCostSpan: 1,
  },
  hard: {
    badgeExponent: 0.75,
    repLiftWeight: 0.4,
    repSlopeWeight: 0.6,
    servicePenaltyMin: 0.65,
    sizeCostThreshold: 3500,
    sizeCostMaxExtra: 0.25,
    sizeCostSpan: 7000,
  },
};

/**
 * @returns {GameDifficulty}
 */
export function getGameDifficulty() {
  const d = state.gameDifficulty;
  return d === 'easy' || d === 'hard' ? d : 'medium';
}

export function getBalanceProfile() {
  return PROFILES[getGameDifficulty()];
}

