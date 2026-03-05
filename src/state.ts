/**
 * Application state and DOM references.
 * Typed for simulation and UI; getSlopeType / getDiffColor used by draw, config, canvas.
 */

import type {
  AppMode,
  ExperienceBucket,
  SlopeDrawMode,
  LiftType,
  SlopeType,
  GroomerType,
  PlacedLift,
  PlacedSlope,
  PlacedCottage,
  PlacedGroomer,
  ImagePoint,
  SimulationDate,
  DOMRefs,
} from './types';
import type { WeatherType } from './weather-simulation';

export interface AppState {
  /** Current simulation date (starts Nov 1, 1960). */
  currentDate: SimulationDate;
  /** Current weather (updated each simulation day). */
  currentWeather: WeatherType;
  /** Daily visitors (recalculated each day from lift capacity and weather). */
  dailyVisitors: number;
  /** Last day's ticket sales (visitors × ticket price). */
  dailySales: number;
  /** Last day's operating costs (lifts + groomers). */
  dailyCost: number;
  /** Last day's profit (sales − operating cost). */
  dailyProfit: number;
  /** Snow depth in cm (0–450). Recalculated daily from weather snowfall. */
  snowDepth: number;
  /** Today's snowfall in cm (for display). */
  dailySnowfall: number;
  /** Today's temp range in °C (for display). */
  dailyTempLow: number;
  dailyTempHigh: number;
  /** Simulation speed: 0 = paused, 1 = 1x, 2 = 2x, 3 = 3x days per tick. */
  simulationSpeed: number;
  /** Lift wait experience bucket (good/medium/bad). */
  liftExperienceBucket: ExperienceBucket;
  /** Slope crowd experience bucket (good/medium/bad). */
  slopeCrowdBucket: ExperienceBucket;
  /** Slope quality experience bucket (grooming capacity vs demand). */
  slopeQualityBucket: ExperienceBucket;
  /** Overall visitor satisfaction 0–100%, drifts daily from experience buckets. */
  satisfaction: number;
  mode: AppMode;
  liftType: string | null;
  liftTypes: LiftType[];
  slopeTypes: SlopeType[];
  difficulty: string | null;
  groomerType: string | null;
  groomerTypes: GroomerType[];
  image: HTMLImageElement | null;
  imageWidth: number;
  imageHeight: number;
  lifts: PlacedLift[];
  slopes: PlacedSlope[];
  cottages: PlacedCottage[];
  groomers: PlacedGroomer[];
  budget: number;
  liftBottom: ImagePoint | null;
  liftTop: ImagePoint | null;
  mouseImage: { x: number; y: number } | null;
  slopePoints: { x: number; y: number }[];
  slopeDrawing: boolean;
  slopeDrawMode: SlopeDrawMode;
  penDrawing: boolean;
  spriteSheet: HTMLImageElement | null;
  cottageIcon: HTMLImageElement | null;
  groomerImages: Record<string, HTMLImageElement>;
}

const START_DATE: SimulationDate = { year: 1960, month: 11, day: 1 };

export const state: AppState = {
  currentDate: { ...START_DATE },
  currentWeather: 'cloudy',
  dailyVisitors: 0,
  dailySales: 0,
  dailyCost: 0,
  dailyProfit: 0,
  snowDepth: 50,
  dailySnowfall: 0,
  dailyTempLow: 0,
  dailyTempHigh: 0,
  simulationSpeed: 1,
  liftExperienceBucket: 'good',
  slopeCrowdBucket: 'good',
  slopeQualityBucket: 'good',
  satisfaction: 20,
  mode: 'lift',
  liftType: null,
  liftTypes: [],
  slopeTypes: [],
  difficulty: null,
  groomerType: null,
  groomerTypes: [],
  image: null,
  imageWidth: 0,
  imageHeight: 0,
  lifts: [],
  slopes: [],
  cottages: [],
  groomers: [],
  budget: 15_000,
  liftBottom: null,
  liftTop: null,
  mouseImage: null,
  slopePoints: [],
  slopeDrawing: false,
  slopeDrawMode: 'points',
  penDrawing: false,
  spriteSheet: null,
  cottageIcon: null,
  groomerImages: {},
};

export const DOM: DOMRefs = {
  mountainImage: null,
  canvas: null,
  ctx: null,
  imageInput: null,
  saveBtn: null,
  loadBtn: null,
  importInput: null,
  liftList: null,
  slopeList: null,
  cottageList: null,
  modeBtns: null,
  slopeOptions: null,
  liftHint: null,
  slopeHint: null,
  cottageHint: null,
  groomerHint: null,
  groomerList: null,
  groomerOptions: null,
  currentDateDisplay: null,
  seasonDisplay: null,
  weatherDisplay: null,
  visitorsDisplay: null,
  salesDisplay: null,
  operatingCostsDisplay: null,
  profitDisplay: null,
  snowDepthDisplay: null,
  simSpeedButtons: null,
  liftExperienceDisplay: null,
  slopeExperienceDisplay: null,
  slopeQualityDisplay: null,
  satisfactionDisplay: null,
};

type SlopeOrId = string | PlacedSlope;

export function getSlopeType(slopeOrId: SlopeOrId): SlopeType | null {
  if (!state.slopeTypes.length) return null;
  if (typeof slopeOrId === 'string') {
    return state.slopeTypes.find((t) => t.id === slopeOrId) ?? null;
  }
  const s = slopeOrId;
  if (s.slopeTypeId) return state.slopeTypes.find((t) => t.id === s.slopeTypeId) ?? null;
  if (s.difficulty != null) {
    const key = String(s.difficulty).toLowerCase();
    return state.slopeTypes.find((t) => t.difficulty.toLowerCase() === key) ?? null;
  }
  return null;
}

export function getDiffColor(slopeOrId: SlopeOrId): string {
  const st = getSlopeType(slopeOrId);
  if (st?.color) return st.color;
  if (st) return st.difficulty;
  return '#4285f4';
}
