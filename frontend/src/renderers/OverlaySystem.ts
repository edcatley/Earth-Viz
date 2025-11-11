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

    // External state references
    private stateProvider: any = null;

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

        debugLog('OVERLAY', 'OverlaySystem created with standardized pattern');
    }

    // ===== MAIN PATTERN METHODS =====

    /**
     * Main initialization - tries WebGL first, falls back to 2D
     * Centralized data gathering - all stateProvider access happens here
     */
    public initialize(): void {
        debugLog('OVERLAY', 'Starting initialization');

        // Reset everything
        this.reset();

        // Gather all required state in one place
        const config = this.stateProvider?.getConfig();
        const overlayProduct = this.stateProvider?.getOverlayProduct();
        const globe = this.stateProvider?.getGlobe();
        const view = this.stateProvider?.getView();
        const overlayType = config?.overlayType || 'off';

        // Check if we have required data
        if (!config || !overlayProduct || !globe || !view || overlayType === 'off') {
            debugLog('OVERLAY', 'Initialization skipped - missing required data');
            return;
        }

        // Try WebGL first
        debugLog('OVERLAY', 'Attempting WebGL initialization');
        if (this.initializeWebGL(overlayProduct, globe, view)) {
            this.useWebGL = true;
            debugLog('OVERLAY', 'WebGL initialization successful');
            return;
        }

        // Fallback to 2D
        debugLog('OVERLAY', 'WebGL failed, falling back to 2D');
        this.initialize2D(overlayProduct, view);
        this.useWebGL = false;
        debugLog('OVERLAY', '2D initialization complete');
    }

    /**
     * Attempt WebGL initialization - returns true if successful
     */
    private initializeWebGL(overlayProduct: any, globe: any, view: any): boolean {
        try {
            // Create WebGL renderer
            this.webglRenderer = new WebGLRenderer();
            const webglInitialized = this.webglRenderer.initialize(this.webglCanvas);

            if (!webglInitialized) {
                debugLog('OVERLAY', 'WebGL renderer initialization failed - check console for WebGL diagnostics');
                return false;
            }

            // Setup overlay with current data
            const useInterpolatedLookup = true;
            const setupSuccess = this.webglRenderer.setup('overlay', overlayProduct, globe, useInterpolatedLookup);

            if (!setupSuccess) {
                debugLog('OVERLAY', 'WebGL overlay setup failed');
                this.webglRenderer.dispose();
                this.webglRenderer = null;
                return false;
            }

            debugLog('OVERLAY', 'WebGL system initialized successfully');
            return true;

        } catch (error) {
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
    private initialize2D(overlayProduct: any, view: any): void {
        debugLog('OVERLAY', 'Initializing 2D rendering system');

        if (!this.ctx2D) {
            return;
        }

        // Size canvas
        this.canvas2D.width = view.width;
        this.canvas2D.height = view.height;

        // Create 2D renderer
        this.renderer2D = new OverlayRenderer2D();
        this.renderer2D.initialize(this.ctx2D, view);
        this.renderer2D.setup(overlayProduct);

        debugLog('OVERLAY', '2D system initialized');
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
     * Reset system state
     */
    private reset(): void {
        debugLog('OVERLAY', 'Resetting system state');

        // Clear and dispose renderers
        if (this.webglRenderer) {
            this.webglRenderer.clear();
            this.webglRenderer.dispose();
            this.webglRenderer = null;
        }

        if (this.renderer2D && this.ctx2D) {
            this.renderer2D.clear(this.ctx2D, this.canvas2D);
            this.renderer2D.dispose();
            this.renderer2D = null;
        }

        // Reset state
        this.useWebGL = false;
    }

    // ===== PUBLIC API (same as original) =====

    /**
     * Set external state provider (no longer subscribing to events)
     */
    setStateProvider(stateProvider: any): void {
        this.stateProvider = stateProvider;
        debugLog('OVERLAY', 'State provider set');
    }

    /**
     * Handle rotation changes that require re-rendering (not re-initialization)
     * Now called directly from Earth.ts centralized functions
     */
    public handleRotation(): void {
        debugLog('OVERLAY', 'Handling rotation change - regenerating frame');
        this.regenerateOverlay();
    }

    /**
     * Handle data changes that require re-initialization
     * Now called directly from Earth.ts centralized functions
     */
    public handleDataChange(): void {
        debugLog('OVERLAY', 'Handling data change - reinitializing system');
        this.initialize();
        this.regenerateOverlay();
    }

    /**
     * Generate overlay and emit result
     * Centralized data gathering - all stateProvider access happens here
     */
    private regenerateOverlay(): void {
        // Gather all required state in one place
        const globe = this.stateProvider?.getGlobe();
        const mask = this.stateProvider?.getMask();
        const view = this.stateProvider?.getView();
        const config = this.stateProvider?.getConfig();
        const overlayProduct = this.stateProvider?.getOverlayProduct();

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