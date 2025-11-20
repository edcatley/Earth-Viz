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
        const webglAvailable = this.webglRenderer.initialize(this.webglCanvas);
        
        if (!webglAvailable) {
            debugLog('OVERLAY', 'WebGL not available on this system');
            this.webglRenderer.dispose();
            this.webglRenderer = null;
        } else {
            debugLog('OVERLAY', 'WebGL renderer initialized successfully');
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
     */
    public renderDirect(gl: WebGLRenderingContext, globe: any, view: any): void {
        if (!this.webglRenderer) return;
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

        this.clearSetup();

        if (!overlayProduct || !globe || !view) {
            debugLog('OVERLAY', 'Setup skipped - missing required data');
            return;
        }

        // Try WebGL first (if available)
        if (this.webglRenderer && this.setupWebGL(overlayProduct, globe, view)) {
            debugLog('OVERLAY', 'WebGL setup successful');
            return;
        }

        // Fallback to 2D
        debugLog('OVERLAY', this.webglRenderer ? 'WebGL setup failed, using 2D' : 'WebGL not available, using 2D');
        this.setup2D(overlayProduct, view);
    }

    /**
     * Attempt WebGL setup - returns true if successful
     */
    private setupWebGL(overlayProduct: any, globe: any, view: any): boolean {
        if (!this.webglRenderer) return false;

        try {
            const useInterpolatedLookup = true;
            const setupSuccess = this.webglRenderer.setup('overlay', overlayProduct, globe, useInterpolatedLookup);

            if (!setupSuccess) {
                debugLog('OVERLAY', 'WebGL overlay setup failed (likely unsupported projection)');
                return false;
            }

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
        this.renderer2D.clear();
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
        this.renderer2D.render(globe, mask, view);
    }

    /**
     * Handle data changes - re-setup and update 2D canvas
     */
    public handleDataChange(overlayProduct: any, globe: any, view: any, mask: any, config: any): void {
        this.setup(overlayProduct, globe, view);
        this.renderer2D.render(globe, mask, view);
    }
}