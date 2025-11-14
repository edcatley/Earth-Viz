/**
 * OverlaySystem - Standardized rendering system pattern
 * 
 * Rendering system using the common pattern:
 * - initialize() - Main entry point, decides WebGL vs 2D
 * - initializeWebGL() - Attempts WebGL setup
 * - initialize2D() - Sets up 2D fallback
 * - generateFrame() - Produces final canvas output
 */

import { WebGLRenderer } from '../renderers/WebGLRenderer';
import { OverlayRenderer2D } from '../renderers/2dOverlayRenderer';
import { Globe, ViewportSize } from '../core/Globes';

// Debug logging
function debugLog(category: string, message: string, data?: any): void {
    console.log(`[${category}] ${message}`, data || '');
}



export class OverlaySystem {
    private useWebGL: boolean = false;
    private webglRenderer: WebGLRenderer | null = null;
    private renderer2D: OverlayRenderer2D;

    constructor() {
        this.renderer2D = new OverlayRenderer2D();
        debugLog('OVERLAY', 'OverlaySystem created');
    }

    /**
     * Initialize WebGL renderer with shared GL context
     */
    public initializeGL(gl: WebGLRenderingContext): void {
        if (this.webglRenderer) {
            debugLog('OVERLAY', 'WebGL renderer already initialized');
            return;
        }

        debugLog('OVERLAY', 'Initializing WebGL renderer with shared context');
        this.webglRenderer = new WebGLRenderer();
        const success = this.webglRenderer.initialize(gl);

        if (!success) {
            debugLog('OVERLAY', 'WebGL initialization failed');
            this.webglRenderer.dispose();
            this.webglRenderer = null;
            this.useWebGL = false;
        } else {
            debugLog('OVERLAY', 'WebGL renderer initialized successfully');
            // useWebGL will be set to true in setup() when data is ready
        }
    }

    /**
     * Check if this system can render directly to a shared GL context
     */
    public canRenderDirect(): boolean {
        return this.webglRenderer !== null;
    }

    /**
     * Render directly to provided GL context (fast path)
     * No-op if no data has been setup yet
     */
    public renderDirect(gl: WebGLRenderingContext, globe: any, view: any): void {
        if (!this.webglRenderer) {
            return; // No WebGL renderer
        }
        
        if (!this.useWebGL) {
            return; // No data setup yet
        }

        this.webglRenderer.render(gl, globe, view);
    }

    /**
     * Render directly to provided 2D context (2D path)
     */
    public render2DDirect(ctx: CanvasRenderingContext2D): void {
        ctx.drawImage(this.renderer2D.getCanvas(), 0, 0);
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
        this.renderer2D.initialize(view);
        this.renderer2D.setup(overlayProduct);
    }

    // ===== UTILITY METHODS =====

    /**
     * Clear current setup (but don't dispose renderers)
     */
    private clearSetup(): void {
        this.renderer2D.clear();
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

        this.renderer2D.dispose();
    }

    // ===== PUBLIC API =====

    /**
     * Handle rotation changes - updates 2D canvas
     */
    public handleRotation(globe: any, mask: any, view: any, config: any, overlayProduct: any): void {
        if (!this.useWebGL) {
            this.renderer2D.render(globe, mask, view);
        }
    }

    /**
     * Handle data changes - re-setup and update 2D canvas
     */
    public handleDataChange(overlayProduct: any, globe: any, view: any, mask: any, config: any): void {
        this.setup(overlayProduct, globe, view);
        if (!this.useWebGL) {
            this.renderer2D.render(globe, mask, view);
        }
    }
}