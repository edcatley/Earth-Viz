export declare const µ: {
    view: () => { width: number; height: number };
    log: () => { 
        time: (msg: string) => void;
        timeEnd: (msg: string) => void;
        debug: (msg: string) => void;
        error: (err: any) => void;
    };
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
    distance: (a: [number, number], b: [number, number]) => number;
    removeChildren: (node: Element | null) => void;
    formatCoordinates: (λ: number, φ: number) => string;
    newAgent: () => {
        on: (handlers: Record<string, Function>) => any;
        cancel: { requested: boolean };
        value: () => any;
        submit: (fn: Function, ...args: any[]) => void;
        listenTo: (obj: any, event: string | Record<string, Function>, callback?: Function, context?: any) => any;
        trigger: (event: string, ...args: any[]) => void;
    };
    buildConfiguration: (globes: any, overlayTypes: any) => {
        attributes: Record<string, any>;
        get: (key: string) => any;
        save: (attrs: Record<string, any>, options?: { source?: string }) => void;
        on: (event: string, callback: Function) => void;
        fetch: (options?: { trigger?: string }) => void;
        changedAttributes: () => string[];
    };
}; 