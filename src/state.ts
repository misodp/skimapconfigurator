/**
 * Application state and DOM references.
 * Typed for simulation and UI; getSlopeType / getDiffColor used by draw, config, canvas.
 */

import type {
  AppMode,
  ExperienceChange,
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
  /** Lift wait experience 0–100, drifts daily. */
  liftExperience: number;
  /** Slope crowd experience 0–100, drifts daily. */
  slopeCrowdExperience: number;
  /** Slope quality experience 0–100, drifts daily. */
  slopeQualityExperience: number;
  /** Change indicator for lift experience. */
  liftExperienceChange: ExperienceChange;
  /** Change indicator for slope crowd experience. */
  slopeCrowdChange: ExperienceChange;
  /** Change indicator for slope quality experience. */
  slopeQualityChange: ExperienceChange;
  /** Overall visitor satisfaction 0–100%, drifts daily from the three experience scores. */
  satisfaction: number;
  /** Ticket price in ski dollars per visitor per day. */
  ticketPrice: number;
  mode: AppMode;
  /** When true, a build action is armed from the right Invest sidebar; next placement consumes it. */
  buildArmed: boolean;
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
  /** When set, mountain image uses this URL instead of snow-based assets. */
  customMountainUrl: string | null;
  /** Resort is open for visitors (true) or closed (no visitors, 30% operating costs). */
  resortOpen: boolean;
  /** Snow threshold (cm) of the currently displayed mountain image; null until first pick. */
  displayedMountainThreshold: number | null;
  /** When snow suggests a different image, threshold we might switch to after 3 days. */
  mountainPendingThreshold: number | null;
  /** Consecutive days the pending threshold has been the target. */
  mountainDaysAtPending: number;
  /** Unlocked achievement badges (computed from lifts/slopes). */
  achievements: { family: boolean; highAlpine: boolean; freeride: boolean; topOfWorld: boolean };
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
  liftExperience: 50,
  slopeCrowdExperience: 50,
  slopeQualityExperience: 50,
  liftExperienceChange: 'stable',
  slopeCrowdChange: 'stable',
  slopeQualityChange: 'stable',
  satisfaction: 20,
  ticketPrice: 1.0,
  mode: 'lift',
  buildArmed: false,
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
  customMountainUrl: null,
  resortOpen: true,
  displayedMountainThreshold: null,
  mountainPendingThreshold: null,
  mountainDaysAtPending: 0,
  achievements: { family: false, highAlpine: false, freeride: false, topOfWorld: false },
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
