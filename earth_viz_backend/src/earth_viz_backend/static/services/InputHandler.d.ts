/**
 * InputHandler - handles all mouse/touch interactions with the display
 * Emits events for the main application to respond to
 */
import * as d3 from 'd3';
import { Globe, Point, GeoPoint } from '../core/Globes';
export interface InputEvents {
    zoomStart: (event: d3.D3ZoomEvent<HTMLElement, unknown>) => void;
    zoom: (event: d3.D3ZoomEvent<HTMLElement, unknown>) => void;
    rotate: (event: d3.D3ZoomEvent<HTMLElement, unknown>) => void;
    zoomEnd: (event: d3.D3ZoomEvent<HTMLElement, unknown>) => void;
    rotateEnd: (event: d3.D3ZoomEvent<HTMLElement, unknown>) => void;
    click: (point: Point, coord: GeoPoint | null) => void;
    locationRequest: () => void;
    locationFound: (coord: GeoPoint) => void;
    locationError: (error: GeolocationPositionError) => void;
}
export declare class InputHandler {
    private operation;
    private globe;
    private events;
    private mouseThrottler;
    constructor();
    setGlobe(globe: Globe | null): void;
    on<K extends keyof InputEvents>(event: K, handler: InputEvents[K]): void;
    private emit;
    private setupInput;
    private handleZoomStart;
    private handleZoom;
    private handleZoomEnd;
    private handleClick;
    private handleLocationRequest;
    private handleLocationFound;
}
//# sourceMappingURL=InputHandler.d.ts.map