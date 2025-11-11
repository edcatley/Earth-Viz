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
import { OverlayRenderer2D } from './2dOverlayRenderer';
import { Globe, ViewportSize } from '../core/Globes';

// Debug logging
function debugLog(category: string, message: string, data?: any): void {
    console.log(`[${category}] ${message}`, data || '');
}

export interface OverlayResult {
    canvas: HTMLCanvasElement | null;  // Single canvas output
    overlayType: string;
    overlayProduct: any;
}

export class OverlaySystem {
    // Common rendering system properties
    private webglCanvas: HTMLCanvasElement;
    private canvas2D: HTMLCanvasElement;
    private ctx2D: CanvasRenderingContext2D | null = null;
    private useWebGL: boolean = false;

    // Renderer delegates
    private webglRenderer: WebGLRenderer | null = null;
    private renderer2D: OverlayRenderer2D | null = null;

    // Event callbacks
    private eventHandlers: { [key: string]: Function[] } = {};

    constructor() {
        // Create canvases
        this.webglCanvas = document.createElement("canvas");
        this.canvas2D = document.createElement("canvas");

        const ctx = this.canvas2D.getContext("2d");
        if (!ctx) {
            throw new Error("Failed to create 2D canvas context for OverlaySystem");
        }
        this.ctx2D = ctx;

        // Initialize renderers once - check what's available
        debugLog('OVERLAY', 'Initializing renderers');
        
        // Try to initialize WebGL renderer
        this.webglRenderer = new WebGLRenderer();
        const webglAvailable = this.webglRenderer.initialize(this.webglCanvas);
        
        if (!webglAvailable) {
            debugLog('OVERLAY', 'WebGL not available on this system');
            this.webglRenderer.dispose();
            this.webglRenderer = null;
        } else {
            debugLog('OVERLAY', 'WebGL renderer initialized');
        }

        // Create 2D renderer (always available)
        this.renderer2D = new OverlayRenderer2D();
        debugLog('OVERLAY', '2D renderer created');

        debugLog('OVERLAY', 'OverlaySystem created');
    }

    // ===== MAIN PATTERN METHODS =====

    /**
     * Setup renderers with current data
     * Tries WebGL first (if available and projection supported), falls back to 2D
     */
    public setup(overlayProduct: any, globe: any, view: any): void {
        debugLog('OVERLAY', 'Starting setup');

        // Clear any existing setup
        this.clearSetup();

        // Check if we have required data
        if (!overlayProduct || !globe || !view) {
            debugLog('OVERLAY', 'Setup skipped - missing required data');
            return;
        }

        // Try WebGL first (if available)
        if (this.webglRenderer) {
            debugLog('OVERLAY', 'Attempting WebGL setup');
            if (this.setupWebGL(overlayProduct, globe, view)) {
                this.useWebGL = true;
                debugLog('OVERLAY', 'WebGL setup successful');
                return;
            }
            debugLog('OVERLAY', 'WebGL setup failed, falling back to 2D');
        } else {
            debugLog('OVERLAY', 'WebGL not available, using 2D');
        }

        // Fallback to 2D
        this.setup2D(overlayProduct, view);
        this.useWebGL = false;
        debugLog('OVERLAY', '2D setup complete');
    }

    /**
     * Attempt WebGL setup - returns true if successful
     */
    private setupWebGL(overlayProduct: any, globe: any, view: any): boolean {
        if (!this.webglRenderer) {
            return false;
        }

        try {
            // Size canvas
            this.webglCanvas.width = view.width;
            this.webglCanvas.height = view.height;

            // Setup overlay with current data
            const useInterpolatedLookup = true;
            const setupSuccess = this.webglRenderer.setup('overlay', overlayProduct, globe, useInterpolatedLookup);

            if (!setupSuccess) {
                debugLog('OVERLAY', 'WebGL overlay setup failed (likely unsupported projection)');
                return false;
            }

            debugLog('OVERLAY', 'WebGL setup successful');
            return true;

        } catch (error) {
            debugLog('OVERLAY', 'WebGL setup error:', error);
            return false;
        }
    }

    /**
     * Setup 2D rendering system
     */
    private setup2D(overlayProduct: any, view: any): void {
        debugLog('OVERLAY', 'Setting up 2D rendering system');

        if (!this.ctx2D || !this.renderer2D) {
            return;
        }

        // Size canvas
        this.canvas2D.width = view.width;
        this.canvas2D.height = view.height;

        // Setup 2D renderer
        this.renderer2D.initialize(this.ctx2D, view);
        this.renderer2D.setup(overlayProduct);

        debugLog('OVERLAY', '2D setup complete');
    }

    /**
     * Generate frame using appropriate rendering system
     */
    public generateFrame(globe: any, mask: any, view: any): HTMLCanvasElement | null {
        debugLog('OVERLAY', `Generating frame using ${this.useWebGL ? 'WebGL' : '2D'}`);

        if (this.useWebGL) {
            return this.renderWebGL(globe, view) ? this.webglCanvas : null;
        } else {
            return this.render2D(globe, mask, view) ? this.canvas2D : null;
        }
    }

    // ===== RENDERING IMPLEMENTATIONS =====

    /**
     * Render using WebGL system
     */
    private renderWebGL(globe: any, view: any): boolean {
        if (!this.webglRenderer) {
            debugLog('OVERLAY', 'WebGL render failed - no renderer');
            return false;
        }

        if (!globe || !view) {
            debugLog('OVERLAY', 'WebGL render failed - missing state');
            return false;
        }

        try {
            // Delegate to WebGL renderer
            return this.webglRenderer.render(globe, view);

        } catch (error) {
            debugLog('OVERLAY', 'WebGL render error:', error);
            return false;
        }
    }

    /**
     * Render using 2D system - delegates to OverlayRenderer2D
     */
    private render2D(globe: any, mask: any, view: any): boolean {
        if (!this.ctx2D || !this.renderer2D) {
            debugLog('OVERLAY', '2D render failed - no renderer');
            return false;
        }

        if (!globe || !mask || !view) {
            debugLog('OVERLAY', '2D render failed - missing state');
            return false;
        }

        try {
            // Delegate to 2D renderer
            return this.renderer2D.render(this.ctx2D, globe, mask, view);

        } catch (error) {
            debugLog('OVERLAY', '2D render error:', error);
            return false;
        }
    }

    // ===== UTILITY METHODS =====

    /**
     * Clear current setup (but don't dispose renderers)
     */
    private clearSetup(): void {
        debugLog('OVERLAY', 'Clearing current setup');

        // Clear canvases
        if (this.webglRenderer) {
            this.webglRenderer.clear();
        }

        if (this.renderer2D && this.ctx2D) {
            this.renderer2D.clear(this.ctx2D, this.canvas2D);
        }

        // Reset state
        this.useWebGL = false;
    }

    /**
     * Dispose of all resources (called on destruction)
     */
    public dispose(): void {
        debugLog('OVERLAY', 'Disposing OverlaySystem');

        // Dispose renderers
        if (this.webglRenderer) {
            this.webglRenderer.dispose();
            this.webglRenderer = null;
        }

        if (this.renderer2D) {
            this.renderer2D.dispose();
            this.renderer2D = null;
        }
    }

    // ===== PUBLIC API =====

    /**
     * Handle rotation changes that require re-rendering (not re-initialization)
     * Now called directly from Earth.ts centralized functions
     */
    public handleRotation(globe: any, mask: any, view: any, config: any, overlayProduct: any): void {
        debugLog('OVERLAY', 'Handling rotation change - regenerating frame');
        this.regenerateOverlay(globe, mask, view, config, overlayProduct);
    }

    /**
     * Handle data changes that require re-setup
     * Now called directly from Earth.ts centralized functions
     */
    public handleDataChange(overlayProduct: any, globe: any, view: any, mask: any, config: any): void {
        debugLog('OVERLAY', 'Handling data change - re-setting up system');
        this.setup(overlayProduct, globe, view);
        this.regenerateOverlay(globe, mask, view, config, overlayProduct);
    }

    /**
     * Generate overlay and emit result
     */
    private regenerateOverlay(globe: any, mask: any, view: any, config: any, overlayProduct: any): void {
        // Generate frame with explicit parameters
        const canvas = this.generateFrame(globe, mask, view);

        const result: OverlayResult = {
            canvas: canvas,
            overlayType: config?.overlayType || 'off',
            overlayProduct: overlayProduct
        };

        this.emit('overlayChanged', result);
    }

    /**
     * Subscribe to overlay change events
     */
    on(event: string, handler: Function): void {
        if (!this.eventHandlers[event]) {
            this.eventHandlers[event] = [];
        }
        this.eventHandlers[event].push(handler);
    }

    /**
     * Emit events to subscribers
     */
    private emit(event: string, ...args: any[]): void {
        if (this.eventHandlers[event]) {
            this.eventHandlers[event].forEach(handler => handler(...args));
        }
    }
}