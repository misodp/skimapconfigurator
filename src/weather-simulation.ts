/**
 * Standalone weather simulation for alpine/ski resort contexts.
 * Copy this file into another project – it has no dependencies.
 *
 * Usage:
 *   import { getSeason, generateWeatherForecast, type WeatherType, type WeatherForecast } from './weather-simulation'
 *   const season = getSeason(12)        // month 1-12 → 'winter' | 'spring' | 'summer' | 'autumn'
 *   const forecast = generateWeatherForecast(12)  // 4-week forecast for that month
 */

// ── Types ───────────────────────────────────────────────────────────────────

export type WeatherType = "sunny" | "snowy" | "blizzard" | "cloudy" | "icy"
export type Season = "winter" | "spring" | "summer" | "autumn"

export interface WeatherForecast {
  week: number
  type: WeatherType
  tempHigh: number
  tempLow: number
  snowfall: number // cm
}

// ── Constants ───────────────────────────────────────────────────────────────

/** Month (1–12) to season. */
export const SEASON_BY_MONTH: Record<number, Season> = {
  1: "winter", 2: "winter", 3: "spring", 4: "spring", 5: "spring",
  6: "summer", 7: "summer", 8: "summer", 9: "autumn", 10: "autumn", 11: "autumn", 12: "winter",
}

/** Base temp ranges [low, high] °C by season (before weather modifiers). */
export const BASE_TEMP_RANGES: Record<Season, [number, number]> = {
  winter: [-15, -2],
  spring: [-5, 10],
  summer: [5, 22],
  autumn: [-3, 8],
}

/** Weights per weather type by season (higher = more likely). Sum is normalized. */
export const WEATHER_WEIGHTS: Record<Season, Record<WeatherType, number>> = {
  winter: { snowy: 35, cloudy: 25, blizzard: 15, icy: 15, sunny: 10 },
  spring: { cloudy: 30, sunny: 30, snowy: 20, icy: 10, blizzard: 10 },
  summer: { sunny: 50, cloudy: 30, snowy: 5, icy: 5, blizzard: 10 },
  autumn: { cloudy: 35, sunny: 20, snowy: 20, icy: 15, blizzard: 10 },
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min
}

function randInt(min: number, max: number): number {
  return Math.floor(rand(min, max + 1))
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the season for a given month (1–12).
 */
export function getSeason(month: number): Season {
  if (month >= 12 || month <= 2) return "winter"
  if (month >= 3 && month <= 5) return "spring"
  if (month >= 6 && month <= 8) return "summer"
  return "autumn"
}

/**
 * Picks a random weather type for the given season (weighted).
 */
export function generateWeatherForSeason(season: Season): WeatherType {
  const w = WEATHER_WEIGHTS[season]
  const total = Object.values(w).reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  for (const [type, weight] of Object.entries(w)) {
    r -= weight
    if (r <= 0) return type as WeatherType
  }
  return "cloudy"
}

/**
 * Returns [tempLow, tempHigh] in °C for the given season and weather type.
 * Includes small random variation and weather-based modifiers.
 */
export function getTempRange(season: Season, weather: WeatherType): [number, number] {
  const [baseLow, baseHigh] = BASE_TEMP_RANGES[season]
  let low = baseLow + randInt(-3, 3)
  let high = baseHigh + randInt(-3, 3)
  if (weather === "blizzard") {
    low -= 5
    high -= 5
  }
  if (weather === "icy") {
    low -= 3
    high -= 3
  }
  if (weather === "sunny") {
    high += 2
  }
  if (high <= low) high = low + 2
  return [low, high]
}

/**
 * Generates a 4-week weather forecast for the given month (1–12).
 * Each week has type, tempHigh, tempLow, and snowfall (cm).
 */
export function generateWeatherForecast(month: number): WeatherForecast[] {
  const season = getSeason(month)
  return [1, 2, 3, 4].map((week) => {
    const type = generateWeatherForSeason(season)
    const [tempLow, tempHigh] = getTempRange(season, type)
    const snowfall =
      type === "blizzard" ? randInt(20, 50) :
      type === "snowy" ? randInt(5, 25) :
      type === "icy" ? randInt(0, 5) :
      0
    return { week, type, tempHigh, tempLow, snowfall }
  })
}

/**
 * Visitor multiplier by weather (ski resort: sunny/snowy attract, blizzard/icy deter).
 */
export const WEATHER_VISITOR_MODIFIERS: Record<WeatherType, number> = {
  sunny: 1.15,
  snowy: 1.0,
  cloudy: 0.85,
  blizzard: 0.25,
  icy: 0.55,
}

/**
 * Human-readable labels for each weather type (for UI).
 */
export const WEATHER_LABELS: Record<WeatherType, string> = {
  sunny: "Sunny",
  snowy: "Snowy",
  cloudy: "Cloudy",
  blizzard: "Blizzard",
  icy: "Icy",
}

export function getWeatherLabel(type: WeatherType): string {
  return WEATHER_LABELS[type]
}
