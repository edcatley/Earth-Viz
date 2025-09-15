/**
 * InputHandler - handles all mouse/touch interactions with the display
 * Emits events for the main application to respond to
 */
import * as d3 from 'd3';
import { Utils } from '../utils/Utils';
/**
 * Simple throttle utility to prevent event flooding
 */
class MouseThrottler {
    constructor() {
        Object.defineProperty(this, "isProcessing", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "pendingUpdate", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "lastUpdateTime", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "targetFPS", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 60
        });
        Object.defineProperty(this, "frameTime", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 1000 / this.targetFPS
        });
    }
    requestUpdate(updateFn) {
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
    executeUpdate(updateFn) {
        this.isProcessing = true;
        this.pendingUpdate = false;
        this.lastUpdateTime = performance.now();
        try {
            updateFn();
        }
        finally {
            this.isProcessing = false;
        }
    }
}
export class InputHandler {
    constructor() {
        Object.defineProperty(this, "operation", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "globe", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "events", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        Object.defineProperty(this, "mouseThrottler", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new MouseThrottler()
        });
        this.setupInput();
    }
    setGlobe(globe) {
        this.globe = globe;
        // Initialize D3 zoom transform to match globe's scale
        if (globe && globe.projection) {
            const display = d3.select("#display");
            const initialScale = globe.projection.scale();
            // Set the initial zoom transform to match the globe's scale
            display.call(d3.zoom().transform, d3.zoomIdentity.scale(initialScale));
            console.log('[INPUT] Initialized zoom transform with globe scale:', initialScale);
        }
    }
    on(event, handler) {
        this.events[event] = handler;
    }
    emit(event, ...args) {
        const handler = this.events[event];
        if (handler) {
            handler(...args);
        }
    }
    setupInput() {
        const display = d3.select("#display");
        if (display.empty()) {
            console.warn('InputHandler: #display element not found');
            return;
        }
        // Setup zoom behavior
        const zoom = d3.zoom()
            .scaleExtent([50, 3000])
            .on("start", (event) => this.handleZoomStart(event))
            .on("zoom", (event) => this.handleZoom(event))
            .on("end", (event) => this.handleZoomEnd(event));
        display.call(zoom);
        // Setup menu button
        d3.select("#show-menu").on("click", () => {
            if (Utils.isEmbeddedInIFrame()) {
                window.open("http://earth.nullschool.net/" + window.location.hash, "_blank");
            }
            else {
                d3.select("#menu").classed("invisible", !d3.select("#menu").classed("invisible"));
            }
        });
        // Setup location button
        d3.select("#show-location").on("click", () => {
            this.handleLocationRequest();
        });
    }
    handleZoomStart(event) {
        if (!this.globe)
            return;
        const mouse = d3.pointer(event, event.target);
        const scale = event.transform.k;
        this.operation = {
            type: "click",
            startMouse: mouse,
            startScale: scale,
            manipulator: this.globe.manipulator(mouse, scale)
        };
        this.emit('zoomStart', event);
    }
    handleZoom(event) {
        if (!this.operation)
            return;
        const mouse = d3.pointer(event, event.target);
        const scale = event.transform.k;
        // Use throttler to prevent event flooding
        this.mouseThrottler.requestUpdate(() => {
            if (!this.operation)
                return; // Operation might have ended during throttling
            // Determine operation type
            const distanceMoved = Utils.distance(mouse, this.operation.startMouse);
            if (scale !== this.operation.startScale) {
                this.operation.type = "zoom";
            }
            else if (distanceMoved > 4) {
                this.operation.type = "drag";
            }
            // Apply manipulation
            if (this.operation.manipulator) {
                this.operation.manipulator.move(this.operation.type === "zoom" ? null : mouse, scale);
            }
            // Emit appropriate event based on operation type
            if (this.operation.type === "zoom") {
                this.emit('zoom', event); // Scale change - actual zoom
            }
            else if (this.operation.type === "drag") {
                this.emit('rotate', event); // Mouse drag - rotation
            }
        });
    }
    handleZoomEnd(event) {
        if (!this.operation)
            return;
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
    handleClick() {
        if (!this.globe?.projection?.invert || !this.operation)
            return;
        try {
            const coord = this.globe.projection.invert(this.operation.startMouse);
            this.emit('click', this.operation.startMouse, coord);
        }
        catch (error) {
            console.error('InputHandler: Error handling click', error);
            this.emit('click', this.operation.startMouse, null);
        }
    }
    handleLocationRequest() {
        if (!navigator.geolocation) {
            this.emit('locationError', {
                code: 2,
                message: "Geolocation not available"
            });
            return;
        }
        this.emit('locationRequest');
        navigator.geolocation.getCurrentPosition((pos) => this.handleLocationFound(pos), (error) => this.emit('locationError', error));
    }
    handleLocationFound(pos) {
        const coord = [pos.coords.longitude, pos.coords.latitude];
        this.emit('locationFound', coord);
    }
}
//# sourceMappingURL=InputHandler.js.map