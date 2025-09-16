/**
 * Products - Clean separation of particle and overlay configurations
 */
export interface GridHeader {
    lo1: number;
    la1: number;
    dx: number;
    dy: number;
    nx: number;
    ny: number;
    refTime: string;
    forecastTime: number;
    center?: number;
    centerName?: string;
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
export interface Product {
    description: string;
    paths: string[];
    date: Date | null;
    navigate: (step: number) => Date;
    load: (cancel: {
        requested: boolean;
    }) => Promise<any>;
    field?: string;
    type?: string;
    builder: Function;
    units?: Array<{
        label: string;
        conversion: (x: number) => number;
        precision: number;
    }>;
    scale?: {
        bounds: [number, number];
        gradient: Function;
    };
    particles?: {
        velocityScale: number;
        maxIntensity: number;
        style?: string;
    };
}
export declare class Products {
    static readonly particleTypes: string[];
    static readonly overlayTypes: string[];
    private static dataManager;
    private static gfsDate;
    private static gfsStep;
    private static describeLevel;
    private static localize;
    static bilinearInterpolateScalar(x: number, y: number, g00: number, g10: number, g01: number, g11: number): number;
    static bilinearInterpolateVector(x: number, y: number, g00: [number, number], g10: [number, number], g01: [number, number], g11: [number, number]): [number, number, number];
    private static buildGrid;
    static createParticleProduct(particleName: string, attr: any): Product;
    static createOverlayProduct(overlayName: string, attr: any): Product;
}
//# sourceMappingURL=Products.d.ts.map