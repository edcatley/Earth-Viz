declare module 'd3' {
    export interface D3 {
        select: typeof select;
        selectAll: typeof selectAll;
        mouse: (container: HTMLElement) => [number, number];
        behavior: {
            zoom: () => Zoom;
        };
        geo: {
            path: () => GeoPath;
            graticule: () => {
                minorStep: (step: [number, number]) => any;
                majorStep: (step: [number, number]) => any;
            };
            mollweide: () => GeoProjection;
            azimuthalEquidistant: () => GeoProjection;
            conicEquidistant: () => GeoProjection;
            equirectangular: () => GeoProjection;
            orthographic: () => GeoProjection;
            stereographic: () => GeoProjection;
            winkel3: () => GeoProjection;
            polyhedron: {
                waterman: () => GeoProjection;
            };
        };
        event: {
            scale: number;
        };
    }

    export interface Selection<T extends Element> {
        node(): T | null;
        attr(name: string, value?: string | number | boolean | null | GeoPath | ((d: any) => string)): this;
        style(name: string, value?: string): this;
        append<K extends keyof ElementTagNameMap>(name: K): Selection<ElementTagNameMap[K]>;
        classed(name: string, value?: boolean): this;
        text(value?: string): this;
        on(type: string, listener?: (this: HTMLElement, ...args: any[]) => void): this;
        datum(value: any): this;
        data(values: any[]): this;
        enter(): Selection<T>;
        exit(): Selection<T>;
        call(func: (selection: this, ...args: any[]) => void, ...args: any[]): this;
        remove(): this;
        each(callback: (this: T, ...args: any[]) => void): this;
    }

    export interface Zoom {
        on(type: string, listener: (this: HTMLElement) => void): this;
        scale(): number;
        scale(value: number): this;
        scaleExtent(extent: [number, number]): this;
    }

    export interface GeoPath {
        projection(projection: GeoProjection | null): this;
        pointRadius(radius: number): this;
        context(context: CanvasRenderingContext2D): this;
        (data: any): string;
        bounds(feature: { type: string }): [[number, number], [number, number]];
    }

    export interface GeoProjection {
        (point: [number, number]): [number, number];
        rotate(): [number, number, number];
        rotate(angles: [number, number] | [number, number, number]): this;
        scale(): number;
        scale(scale: number): this;
        translate(): [number, number];
        translate(point: [number, number]): this;
        precision(): number;
        precision(precision: number): this;
        clipAngle(): number | null;
        clipAngle(angle: number | null): this;
        clipExtent(extent: [[number, number], [number, number]]): this;
        invert?(point: [number, number]): [number, number];
        stream(stream: GeoStream): GeoStream;
        bounds(feature: { type: string }): [[number, number], [number, number]];
        preclip: (clip: any) => this;
        postclip: (clip: any) => this;
        center: (coordinates: [number, number]) => this;
        angle: (angle: number) => this;
    }

    export interface GeoStream {
        point(x: number, y: number): void;
        lineStart(): void;
        lineEnd(): void;
        polygonStart(): void;
        polygonEnd(): void;
        sphere?(): void;
    }

    export function select(selector: string | Window | Document | HTMLElement): Selection<Element>;
    export function selectAll(selector: string): Selection<Element>;
}

// Extend the existing d3 import
declare module 'd3' {
    export default D3;
} 