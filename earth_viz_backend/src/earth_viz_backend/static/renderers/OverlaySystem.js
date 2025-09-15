/**
 * OverlaySystem - Standardized rendering system pattern
 *
 * Rendering system using the common pattern:
 * - initialize() - Main entry point, decides WebGL vs 2D
 * - initializeWebGL() - Attempts WebGL setup
 * - initialize2D() - Sets up 2D fallback
 * - generateFrame() - Produces final canvas output
 */
import { WebGLRenderer } from '../services/WebGLRenderer';
// Debug logging
function debugLog(category, message, data) {
    console.log(`[${category}] ${message}`, data || '');
}
// Constants
const OVERLAY_ALPHA = Math.floor(0.4 * 255); // overlay transparency (on scale [0, 255])
export class OverlaySystem {
    constructor() {
        // Common rendering system properties
        Object.defineProperty(this, "webglCanvas", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "canvas2D", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "ctx2D", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "useWebGL", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        // WebGL system
        Object.defineProperty(this, "webglRenderer", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        // 2D system
        Object.defineProperty(this, "overlayImageData", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        // External state references
        Object.defineProperty(this, "stateProvider", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        // Event callbacks
        Object.defineProperty(this, "eventHandlers", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        // Create canvases
        this.webglCanvas = document.createElement("canvas");
        this.canvas2D = document.createElement("canvas");
        const ctx = this.canvas2D.getContext("2d");
        if (!ctx) {
            throw new Error("Failed to create 2D canvas context for OverlaySystem");
        }
        this.ctx2D = ctx;
        debugLog('OVERLAY', 'OverlaySystem created with standardized pattern');
    }
    // ===== MAIN PATTERN METHODS =====
    /**
     * Main initialization - decides WebGL vs 2D based on projection and data availability
     */
    initialize() {
        debugLog('OVERLAY', 'Starting initialization');
        // Reset everything
        this.reset();
        // Check if we should attempt WebGL
        if (this.shouldUseWebGL()) {
            debugLog('OVERLAY', 'Attempting WebGL initialization');
            if (this.initializeWebGL()) {
                this.useWebGL = true;
                debugLog('OVERLAY', 'WebGL initialization successful');
                return;
            }
            debugLog('OVERLAY', 'WebGL initialization failed, falling back to 2D');
        }
        else {
            debugLog('OVERLAY', 'WebGL not suitable for current projection, using 2D');
        }
        // Fallback to 2D
        this.initialize2D();
        this.useWebGL = false;
        debugLog('OVERLAY', '2D initialization complete');
    }
    /**
     * Attempt WebGL initialization - returns true if successful
     */
    initializeWebGL() {
        try {
            // Get current state
            const config = this.stateProvider?.getConfig();
            const overlayProduct = this.stateProvider?.getOverlayProduct();
            const globe = this.stateProvider?.getGlobe();
            const overlayType = config?.overlayType || 'off';
            if (!config || !overlayProduct || !globe || overlayType === 'off') {
                debugLog('OVERLAY', 'WebGL init skipped - missing required data');
                return false;
            }
            // Create WebGL renderer
            this.webglRenderer = new WebGLRenderer();
            const webglInitialized = this.webglRenderer.initialize(this.webglCanvas);
            if (!webglInitialized) {
                debugLog('OVERLAY', 'WebGL renderer initialization failed');
                return false;
            }
            // Setup overlay with current data
            const overlayId = `overlay_${overlayType}`;
            const useInterpolatedLookup = true;
            const setupSuccess = this.webglRenderer.setup('overlay', overlayProduct, overlayId, globe, useInterpolatedLookup);
            if (!setupSuccess) {
                debugLog('OVERLAY', 'WebGL overlay setup failed');
                this.webglRenderer.dispose();
                this.webglRenderer = null;
                return false;
            }
            debugLog('OVERLAY', 'WebGL system initialized successfully');
            return true;
        }
        catch (error) {
            debugLog('OVERLAY', 'WebGL initialization error:', error);
            if (this.webglRenderer) {
                this.webglRenderer.dispose();
                this.webglRenderer = null;
            }
            return false;
        }
    }
    /**
     * Initialize 2D rendering system
     */
    initialize2D() {
        debugLog('OVERLAY', 'Initializing 2D rendering system');
        // 2D system is always ready since we created the canvas in constructor
        // Just ensure canvas is properly sized
        const view = this.stateProvider?.getView();
        if (view) {
            this.canvas2D.width = view.width;
            this.canvas2D.height = view.height;
        }
        // Clear any existing ImageData to force recreation
        this.overlayImageData = null;
        debugLog('OVERLAY', '2D system initialized');
    }
    /**
     * Generate frame using appropriate rendering system
     */
    generateFrame() {
        debugLog('OVERLAY', `Generating frame using ${this.useWebGL ? 'WebGL' : '2D'}`);
        if (this.useWebGL) {
            return this.renderWebGL() ? this.webglCanvas : null;
        }
        else {
            return this.render2D() ? this.canvas2D : null;
        }
    }
    // ===== DECISION LOGIC =====
    /**
     * Determine if WebGL should be used based on projection and data availability
     */
    shouldUseWebGL() {
        const config = this.stateProvider?.getConfig();
        const overlayProduct = this.stateProvider?.getOverlayProduct();
        const globe = this.stateProvider?.getGlobe();
        const overlayType = config?.overlayType || 'off';
        // Must have required data
        if (!config || !overlayProduct || !globe || overlayType === 'off') {
            return false;
        }
        // Check projection support
        const projectionType = globe.projectionType;
        const supportedProjections = ['orthographic', 'equirectangular'];
        return supportedProjections.includes(projectionType);
    }
    // ===== RENDERING IMPLEMENTATIONS =====
    /**
     * Render using WebGL system
     */
    renderWebGL() {
        if (!this.webglRenderer) {
            debugLog('OVERLAY', 'WebGL render failed - no renderer');
            return false;
        }
        try {
            const config = this.stateProvider?.getConfig();
            const globe = this.stateProvider?.getGlobe();
            const view = this.stateProvider?.getView();
            const overlayType = config?.overlayType || 'off';
            if (!globe || !view) {
                debugLog('OVERLAY', 'WebGL render failed - missing state');
                return false;
            }
            // Ensure canvas is properly sized
            if (this.webglCanvas.width !== view.width || this.webglCanvas.height !== view.height) {
                this.webglCanvas.width = view.width;
                this.webglCanvas.height = view.height;
            }
            // Render
            const overlayId = `overlay_${overlayType}`;
            const renderSuccess = this.webglRenderer.render(overlayId, globe, view);
            if (renderSuccess) {
                debugLog('OVERLAY', 'WebGL render successful');
                return true;
            }
            else {
                debugLog('OVERLAY', 'WebGL render failed');
                return false;
            }
        }
        catch (error) {
            debugLog('OVERLAY', 'WebGL render error:', error);
            return false;
        }
    }
    /**
     * Render using 2D system
     */
    render2D() {
        if (!this.ctx2D) {
            debugLog('OVERLAY', '2D render failed - no context');
            return false;
        }
        try {
            const globe = this.stateProvider?.getGlobe();
            const mask = this.stateProvider?.getMask();
            const view = this.stateProvider?.getView();
            const config = this.stateProvider?.getConfig();
            const overlayProduct = this.stateProvider?.getOverlayProduct();
            if (!globe || !mask || !view || !config || !overlayProduct) {
                debugLog('OVERLAY', '2D render failed - missing state');
                return false;
            }
            // Ensure canvas is properly sized
            if (this.canvas2D.width !== view.width || this.canvas2D.height !== view.height) {
                this.canvas2D.width = view.width;
                this.canvas2D.height = view.height;
                this.overlayImageData = null; // Force recreation
            }
            // Create ImageData if needed
            if (!this.overlayImageData) {
                this.overlayImageData = this.ctx2D.createImageData(view.width, view.height);
            }
            // Clear ImageData
            const overlayData = this.overlayImageData.data;
            overlayData.fill(0);
            // Generate overlay data
            const bounds = globe.bounds(view);
            this.generate2DOverlayData(overlayProduct, globe, view, mask, bounds, overlayData);
            // Put ImageData onto canvas
            this.ctx2D.putImageData(this.overlayImageData, 0, 0);
            debugLog('OVERLAY', '2D render successful');
            return true;
        }
        catch (error) {
            debugLog('OVERLAY', '2D render error:', error);
            return false;
        }
    }
    /**
     * Generate 2D overlay data (same logic as original)
     */
    generate2DOverlayData(overlayProduct, globe, view, mask, bounds, overlayData) {
        // Iterate through visible pixels and generate overlay colors
        for (let x = bounds.x; x <= bounds.xMax; x += 2) {
            for (let y = bounds.y; y <= bounds.yMax; y += 2) {
                if (mask.isVisible(x, y)) {
                    const coord = globe.projection?.invert?.([x, y]);
                    if (coord) {
                        const λ = coord[0], φ = coord[1];
                        if (isFinite(λ)) {
                            // Get overlay value from weather data
                            const overlayValue = overlayProduct.interpolate(λ, φ);
                            if (overlayValue != null && overlayProduct.scale) {
                                const rawValue = overlayValue;
                                // Skip if no valid value
                                if (rawValue == null || !isFinite(rawValue)) {
                                    continue;
                                }
                                // Convert value to color
                                const overlayColor = overlayProduct.scale.gradient(rawValue, OVERLAY_ALPHA);
                                if (overlayColor && overlayColor.length >= 3) {
                                    // Store color in 2x2 pixel block
                                    this.setPixelColor(overlayData, view.width, x, y, overlayColor);
                                    this.setPixelColor(overlayData, view.width, x + 1, y, overlayColor);
                                    this.setPixelColor(overlayData, view.width, x, y + 1, overlayColor);
                                    this.setPixelColor(overlayData, view.width, x + 1, y + 1, overlayColor);
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    /**
     * Helper to set RGBA color at specific pixel coordinates
     */
    setPixelColor(data, width, x, y, rgba) {
        if (x >= 0 && x < width && y >= 0) {
            const i = (Math.floor(y) * width + Math.floor(x)) * 4;
            data[i] = rgba[0] || 0; // red
            data[i + 1] = rgba[1] || 0; // green
            data[i + 2] = rgba[2] || 0; // blue
            data[i + 3] = rgba[3] || 0; // alpha
        }
    }
    // ===== UTILITY METHODS =====
    /**
     * Reset system state
     */
    reset() {
        debugLog('OVERLAY', 'Resetting system state');
        // Dispose WebGL resources
        if (this.webglRenderer) {
            this.webglRenderer.dispose();
            this.webglRenderer = null;
        }
        // Clear WebGL canvas
        if (this.webglCanvas) {
            const ctx = this.webglCanvas.getContext('webgl') || this.webglCanvas.getContext('webgl2');
            if (ctx) {
                ctx.clearColor(0.0, 0.0, 0.0, 0.0);
                ctx.clear(ctx.COLOR_BUFFER_BIT | ctx.DEPTH_BUFFER_BIT);
            }
        }
        // Clear 2D canvas
        if (this.ctx2D) {
            this.ctx2D.clearRect(0, 0, this.canvas2D.width, this.canvas2D.height);
        }
        // Reset state
        this.useWebGL = false;
        this.overlayImageData = null;
    }
    // ===== PUBLIC API (same as original) =====
    /**
     * Set external state provider (no longer subscribing to events)
     */
    setStateProvider(stateProvider) {
        this.stateProvider = stateProvider;
        debugLog('OVERLAY', 'State provider set');
    }
    /**
     * Handle rotation changes that require re-rendering (not re-initialization)
     * Now called directly from Earth.ts centralized functions
     */
    handleRotation() {
        debugLog('OVERLAY', 'Handling rotation change - regenerating frame');
        this.regenerateOverlay();
    }
    /**
     * Handle data changes that require re-initialization
     * Now called directly from Earth.ts centralized functions
     */
    handleDataChange() {
        debugLog('OVERLAY', 'Handling data change - reinitializing system');
        this.initialize();
        this.regenerateOverlay();
    }
    /**
     * Generate overlay and emit result
     */
    regenerateOverlay() {
        const canvas = this.generateFrame();
        const config = this.stateProvider?.getConfig();
        const overlayProduct = this.stateProvider?.getOverlayProduct();
        const result = {
            canvas: canvas,
            overlayType: config?.overlayType || 'off',
            overlayProduct: overlayProduct
        };
        this.emit('overlayChanged', result);
    }
    /**
     * Subscribe to overlay change events
     */
    on(event, handler) {
        if (!this.eventHandlers[event]) {
            this.eventHandlers[event] = [];
        }
        this.eventHandlers[event].push(handler);
    }
    /**
     * Emit events to subscribers
     */
    emit(event, ...args) {
        if (this.eventHandlers[event]) {
            this.eventHandlers[event].forEach(handler => handler(...args));
        }
    }
}
//# sourceMappingURL=OverlaySystem.js.map