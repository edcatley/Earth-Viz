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