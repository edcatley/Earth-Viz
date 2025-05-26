/**
 * Core type definitions for the earth visualization project
 */

import * as d3 from 'd3';

// Module declarations
declare module 'topojson-client' {
    export function feature(topology: any, object: any): any;
}


// Basic types used throughout the application
export type Point = [number, number];  // [x, y] coordinates
export type GeoPoint = [number, number];  // [longitude, latitude]
export type Vector = [number, number, number | null];  // [u, v, magnitude]
export type RGB = [number, number, number];
export type RGBA = [number, number, number, number];
export type EulerAngles = [number, number, number];  // [λ, φ, γ]

// Grid related types
export interface GridHeader {
    lo1: number;       // Starting longitude
    la1: number;       // Starting latitude
    dx: number;        // Longitude step size
    dy: number;        // Latitude step size
    nx: number;        // Number of points in longitude
    ny: number;        // Number of points in latitude
    refTime: string;   // Reference time
    forecastTime: number;  // Forecast offset in hours
    center?: number;   // Center ID
    centerName?: string;  // Center name
}

export interface GridBuilder {
    header: GridHeader;
    data: (index: number) => number | [number, number] | null;
    interpolate: (x: number, y: number, g00: any, g10: any, g01: any, g11: any) => number | [number, number, number] | null;
}

export interface Grid {
    source: string;
    date: Date;
    interpolate: (λ: number, φ: number) => number | [number, number, number] | null;
    forEachPoint: (callback: (λ: number, φ: number, value: any) => void) => void;
}

export interface GridPoint {
    x: number;
    y: number;
    value: number | null;
}

// Date and Configuration types
export interface DateConfig {
    date: string;  // in format yyyy/mm/dd
    hour: string;  // in format HH00
}

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
    bounds: (view: ViewportSize) => Bounds;
    fit: (view: ViewportSize) => number;
    center: (view: ViewportSize) => [number, number];
    scaleExtent: () => [number, number];
    orientation: (o?: string, view?: ViewportSize) => string | Globe;
    manipulator: (startMouse: [number, number], startScale: number) => Manipulator;
    locate: (coord: [number, number]) => [number, number, number] | null;
    defineMask: (context: CanvasRenderingContext2D) => CanvasRenderingContext2D;
    defineMap: (mapSvg: any, foregroundSvg: any) => void;
}

// Field types
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

// Logger and Reporter interfaces
export interface Logger {
    debug: (s: unknown) => void;
    info: (s: unknown) => void;
    error: (e: unknown) => void;
    time: (s: unknown) => void;
    timeEnd: (s: unknown) => void;
}

export interface Reporter {
    status: (msg: string) => Reporter;
    error: (err: Error | { status?: number; message?: string }) => Reporter;
    reset: () => Reporter;
    progress: (amount: number) => Reporter;
}

// µ utility types
export interface µ {
    view: () => ViewportSize;
    log: () => Logger;
    loadJson: (url: string) => Promise<any>;
    isMobile: () => boolean;
    distortion: (projection: d3.GeoProjection, λ: number, φ: number, x: number, y: number) => [number, number, number, number];
    isValue: (x: any) => boolean;
    clearCanvas: (canvas: HTMLCanvasElement | null) => void;
    spread: (n: number, min: number, max: number) => number;
    clamp: (x: number, min: number, max: number) => number;
    formatVector: (v: number[], units: { label: string }) => string;
    formatScalar: (n: number, units: { label: string }) => string;
    toLocalISO: (date: Date) => string;
    toUTCISO: (date: Date) => string;
    windIntensityColorScale: (step: number, maxIntensity: number) => string[] & { indexFor: (m: number) => number };
    isFF: () => boolean;
    isEmbeddedInIFrame: () => boolean;
    dateToConfig: (date: Date) => Record<string, any>;
    distance: (a: Point, b: Point) => number;
    removeChildren: (node: Element | null) => void;
    formatCoordinates: (λ: number, φ: number) => string;
    buildConfiguration: (globes: any, overlayTypes: any) => {
        attributes: Record<string, any>;
        get: (key: string) => any;
        save: (attrs: Record<string, any>, options?: { source?: string }) => void;
        on: (event: string, callback: Function) => void;
        fetch: (options?: { trigger?: string }) => void;
        changedAttributes: () => string[];
    };
} 