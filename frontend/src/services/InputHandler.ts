/**
 * InputHandler - handles all mouse/touch interactions with the display
 * Emits events for the main application to respond to
 */

import * as d3 from 'd3';
import { Utils } from '../utils/Utils';
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

/**
 * Simple throttle utility to prevent event flooding
 */
class MouseThrottler {
    private isProcessing = false;
    private pendingUpdate = false;
    private lastUpdateTime = 0;
    private readonly targetFPS = 60;
    private readonly frameTime = 1000 / this.targetFPS;

    public requestUpdate(updateFn: () => void): void {
        // If already processing, just mark that we need another update
        if (this.isProcessing) {
            this.pendingUpdate = true;
            return;
        }

        // Throttle to target FPS
        const now = performance.now();
        const timeSinceLastUpdate = now - this.lastUpdateTime;
        
        if (timeSinceLastUpdate < this.frameTime) {
            // Too soon - schedule for later
            if (!this.pendingUpdate) {
                this.pendingUpdate = true;
                setTimeout(() => {
                    if (this.pendingUpdate) {
                        this.executeUpdate(updateFn);
                    }
                }, this.frameTime - timeSinceLastUpdate);
            }
            return;
        }

        this.executeUpdate(updateFn);
    }

    private executeUpdate(updateFn: () => void): void {
        this.isProcessing = true;
        this.pendingUpdate = false;
        this.lastUpdateTime = performance.now();

        try {
            updateFn();
        } finally {
            this.isProcessing = false;
        }
    }
}

export class InputHandler {
    private operation: any = null;
    private globe: Globe | null = null;
    private events: Partial<InputEvents> = {};
    private mouseThrottler = new MouseThrottler();

    constructor() {
        this.setupInput();
    }

    public setGlobe(globe: Globe | null): void {
        this.globe = globe;
        
        // Initialize D3 zoom transform to match globe's scale
        if (globe && globe.projection) {
            const display = d3.select("#display");
            const initialScale = globe.projection.scale();
            
            // Set the initial zoom transform to match the globe's scale
            display.call(d3.zoom<any, any>().transform, d3.zoomIdentity.scale(initialScale));
            
            console.log('[INPUT] Initialized zoom transform with globe scale:', initialScale);
        }
    }

    public on<K extends keyof InputEvents>(event: K, handler: InputEvents[K]): void {
        this.events[event] = handler;
    }

    private emit<K extends keyof InputEvents>(event: K, ...args: Parameters<InputEvents[K]>): void {
        const handler = this.events[event];
        if (handler) {
            (handler as any)(...args);
        }
    }

    private setupInput(): void {
        const display = d3.select("#display");
        if (display.empty()) {
            console.warn('InputHandler: #display element not found');
            return;
        }

        // Setup zoom behavior
        const zoom = d3.zoom<HTMLElement, unknown>()
            .scaleExtent([50, 3000])
            .on("start", (event) => this.handleZoomStart(event))
            .on("zoom", (event) => this.handleZoom(event))
            .on("end", (event) => this.handleZoomEnd(event));

        (display as any).call(zoom);

        // Setup menu button
        d3.select("#show-menu").on("click", () => {
            d3.select("#menu").classed("invisible", !d3.select("#menu").classed("invisible"));
        });

        // Setup location button
        d3.select("#show-location").on("click", () => {
            this.handleLocationRequest();
        });
    }

    private handleZoomStart(event: d3.D3ZoomEvent<HTMLElement, unknown>): void {
        if (!this.globe) return;

        const mouse = d3.pointer(event, event.target as any) as Point;
        const scale = event.transform.k;
        
        this.operation = {
            type: "click",
            startMouse: mouse,
            startScale: scale,
            manipulator: this.globe.manipulator(mouse, scale)
        };

        this.emit('zoomStart', event);
    }

    private handleZoom(event: d3.D3ZoomEvent<HTMLElement, unknown>): void {
        if (!this.operation) return;

        const mouse = d3.pointer(event, event.target as any) as Point;
        const scale = event.transform.k;
        
        // Use throttler to prevent event flooding
        this.mouseThrottler.requestUpdate(() => {
            if (!this.operation) return; // Operation might have ended during throttling
            
            // Determine operation type
            const distanceMoved = Utils.distance(mouse, this.operation.startMouse);
            if (scale !== this.operation.startScale) {
                this.operation.type = "zoom";
            } else if (distanceMoved > 4) {
                this.operation.type = "drag";
            }

            // Apply manipulation
            if (this.operation.manipulator) {
                this.operation.manipulator.move(
                    this.operation.type === "zoom" ? null : mouse,
                    scale
                );
            }

            // Emit appropriate event based on operation type
            if (this.operation.type === "zoom") {
                this.emit('zoom', event);           // Scale change - actual zoom
            } else if (this.operation.type === "drag") {
                this.emit('rotate', event);         // Mouse drag - rotation
            }
        });
    }

    private handleZoomEnd(event: d3.D3ZoomEvent<HTMLElement, unknown>): void {
        if (!this.operation) return;

        if (this.operation.manipulator) {
            this.operation.manipulator.end();
        }

        if (this.operation.type === "click") {
            this.handleClick();
        }

        const operationType = this.operation.type;
        this.operation = null;
        
        this.emit('zoomEnd', event);
    }

    private handleClick(): void {
        if (!this.globe?.projection?.invert || !this.operation) return;
        
        try {
            const coord = this.globe.projection.invert(this.operation.startMouse) as GeoPoint;
            this.emit('click', this.operation.startMouse, coord);
        } catch (error) {
            console.error('InputHandler: Error handling click', error);
            this.emit('click', this.operation.startMouse, null);
        }
    }

    private handleLocationRequest(): void {
        if (!navigator.geolocation) {
            this.emit('locationError', {
                code: 2,
                message: "Geolocation not available"
            } as GeolocationPositionError);
            return;
        }

        this.emit('locationRequest');
        
        navigator.geolocation.getCurrentPosition(
            (pos) => this.handleLocationFound(pos),
            (error) => this.emit('locationError', error)
        );
    }

    private handleLocationFound(pos: GeolocationPosition): void {
        const coord: GeoPoint = [pos.coords.longitude, pos.coords.latitude];
        this.emit('locationFound', coord);
    }
} 