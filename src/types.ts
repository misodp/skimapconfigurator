/** Shared types for tech tree, state, and config. */

export type AppMode = 'lift' | 'slope' | 'cottage' | 'groomer';
export type SlopeDrawMode = 'points' | 'pen';

export interface LiftType {
  id: string;
  brand?: string;
  name: string;
  base_cost: number;
  cost_per_meter: number;
  max_length?: number;
  base_operating_cost?: number;
  base_maintenance?: number;
  speed?: number;
  capacity?: number;
  description?: string;
  pros_cons?: string[];
  frame: number;
}

export interface SlopeType {
  id: string;
  difficulty: string;
  symbol?: string;
  linetype?: string;
  color?: string;
  cost_per_meter?: number;
  grooming_load?: number;
  capacity_per_meter?: number;
  description?: string;
  frame: number;
}

export interface GroomerType {
  id: string;
  brand?: string;
  name: string;
  image: string;
  purchase_cost?: number;
  base_operating_cost?: number;
  grooming_capacity?: number;
  description?: string;
}

export interface NormalizedPoint {
  x: number;
  y: number;
}

export interface PlacedLift {
  bottomStation: NormalizedPoint;
  topStation: NormalizedPoint;
  type: string;
  name: string;
}

export interface PlacedSlope {
  slopeTypeId: string;
  points: NormalizedPoint[];
  difficulty?: string;
}

export interface PlacedCottage {
  position: NormalizedPoint;
  name: string;
}

export interface PlacedGroomer {
  position: NormalizedPoint;
  groomerTypeId: string;
}

export interface ImagePoint {
  x: number;
  y: number;
  norm?: NormalizedPoint;
}

/** Game simulation date: month 1–12, day 1–31. */
export interface SimulationDate {
  year: number;
  month: number;
  day: number;
}

export interface DOMRefs {
  mountainImage: HTMLImageElement | null;
  canvas: HTMLCanvasElement | null;
  ctx: CanvasRenderingContext2D | null;
  imageInput: HTMLInputElement | null;
  exportBtn: HTMLButtonElement | null;
  importBtn: HTMLButtonElement | null;
  importInput: HTMLInputElement | null;
  liftList: HTMLUListElement | null;
  slopeList: HTMLUListElement | null;
  cottageList: HTMLUListElement | null;
  modeBtns: NodeListOf<HTMLButtonElement> | null;
  slopeOptions: Element | null;
  liftHint: Element | null;
  slopeHint: Element | null;
  cottageHint: Element | null;
  groomerHint: Element | null;
  groomerList: HTMLUListElement | null;
  groomerOptions: Element | null;
  currentDateDisplay: HTMLElement | null;
}
