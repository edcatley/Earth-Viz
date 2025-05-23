/**
 * Core type definitions for the earth visualization project
 */

import * as d3 from 'd3';
import { Selection } from 'd3';

// Basic types used throughout the application
export type Point = [number, number];  // [x, y] coordinates
export type GeoPoint = [number, number];  // [longitude, latitude]
export type Vector = [number, number, number | null];  // [u, v, magnitude]
export type RGB = [number, number, number];
export type RGBA = [number, number, number, number];
export type EulerAngles = [number, number, number];  // [λ, φ, γ]

// Date related types
export interface DateConfig {
    date: string;  // in format yyyy/mm/dd
    hour: string;  // in format HH00
}

// Configuration related types
export interface ConfigurationOptions {
  orientation: EulerAngles;
  projection: string;
  overlay: string;
  product: string;
  date?: string;
  hour?: string;
  animate?: boolean;
  showGridPoints?: boolean;
}

// Globe related types
export interface Bounds {
  x: number;
  y: number;
  xMax: number;
  yMax: number;
  width: number;
  height: number;
}

export interface Manipulator {
  move: (mouse: Point | null, scale: number) => void;
  end: () => void;
}

export interface Globe {
    projection: d3.GeoProjection | null;
    newProjection: (view: ViewportSize) => d3.GeoProjection;
    bounds: (view: ViewportSize) => { x: number; y: number; xMax: number; yMax: number; width: number; height: number };
    fit: (view: ViewportSize) => number;
    center: (view: ViewportSize) => [number, number];
    scaleExtent: () => [number, number];
    orientation: (o?: string, view?: ViewportSize) => string | Globe;
    manipulator: (startMouse: [number, number], startScale: number) => {
        move: (mouse: [number, number] | null, scale: number) => void;
        end: () => void;
    };
    locate: (coord: [number, number]) => [number, number, number] | null;
    defineMask: (context: CanvasRenderingContext2D) => CanvasRenderingContext2D;
    defineMap: (mapSvg: any, foregroundSvg: any) => void;
}

// Grid and Field types
export interface GridPoint {
  x: number;
  y: number;
  value: number | null;
}

export interface Grid {
  dimensions: {
    width: number;
    height: number;
  };
  data: GridPoint[];
  interpolate: (x: number, y: number) => number | null;
}

export interface Field {
  (x: number, y: number): Vector;
  randomize: () => void;
  overlay: {
    scale: (overlayType: string) => (value: number) => RGB;
    interpolate: (x: number, y: number) => number | null;
  };
}

// Viewport and Display types
export interface ViewportSize {
  width: number;
  height: number;
}

export interface DisplayOptions {
  width: number;
  height: number;
  projection: d3.GeoProjection;
  orientation: EulerAngles;
}

// Event handling types
export interface Dispatch {
  on: (type: string, handler: (...args: any[]) => void) => void;
  off: (type: string, handler: (...args: any[]) => void) => void;
  trigger: (type: string, ...args: any[]) => void;
}

// Agent types for async operations
export interface Agent {
  submit: (task: Function | any, ...args: any[]) => Agent;
  value: () => any;
  when: (success?: (value: any) => void, error?: (err: any) => void) => void;
  cancel: () => void;
}

// Logger interface
export interface Logger {
  debug: (s: unknown) => void;
  info: (s: unknown) => void;
  error: (e: unknown) => void;
  time: (s: unknown) => void;
  timeEnd: (s: unknown) => void;
}

// Reporter interface for user feedback
export interface Reporter {
  status: (msg: string) => Reporter;
  error: (err: Error | { status?: number; message?: string }) => Reporter;
  reset: () => Reporter;
  progress: (amount: number) => Reporter;
} 