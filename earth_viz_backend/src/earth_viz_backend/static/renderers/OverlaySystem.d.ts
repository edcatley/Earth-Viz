/**
 * OverlaySystem - Standardized rendering system pattern
 *
 * Rendering system using the common pattern:
 * - initialize() - Main entry point, decides WebGL vs 2D
 * - initializeWebGL() - Attempts WebGL setup
 * - initialize2D() - Sets up 2D fallback
 * - generateFrame() - Produces final canvas output
 */
export interface OverlayResult {
    canvas: HTMLCanvasElement | null;
    overlayType: string;
    overlayProduct: any;
}
export declare class OverlaySystem {
    private webglCanvas;
    private canvas2D;
    private ctx2D;
    private useWebGL;
    private webglRenderer;
    private overlayImageData;
    private stateProvider;
    private eventHandlers;
    constructor();
    /**
     * Main initialization - decides WebGL vs 2D based on projection and data availability
     */
    initialize(): void;
    /**
     * Attempt WebGL initialization - returns true if successful
     */
    private initializeWebGL;
    /**
     * Initialize 2D rendering system
     */
    private initialize2D;
    /**
     * Generate frame using appropriate rendering system
     */
    generateFrame(): HTMLCanvasElement | null;
    /**
     * Determine if WebGL should be used based on projection and data availability
     */
    private shouldUseWebGL;
    /**
     * Render using WebGL system
     */
    private renderWebGL;
    /**
     * Render using 2D system
     */
    private render2D;
    /**
     * Generate 2D overlay data (same logic as original)
     */
    private generate2DOverlayData;
    /**
     * Helper to set RGBA color at specific pixel coordinates
     */
    private setPixelColor;
    /**
     * Reset system state
     */
    private reset;
    /**
     * Set external state provider (no longer subscribing to events)
     */
    setStateProvider(stateProvider: any): void;
    /**
     * Handle rotation changes that require re-rendering (not re-initialization)
     * Now called directly from Earth.ts centralized functions
     */
    handleRotation(): void;
    /**
     * Handle data changes that require re-initialization
     * Now called directly from Earth.ts centralized functions
     */
    handleDataChange(): void;
    /**
     * Generate overlay and emit result
     */
    private regenerateOverlay;
    /**
     * Subscribe to overlay change events
     */
    on(event: string, handler: Function): void;
    /**
     * Emit events to subscribers
     */
    private emit;
}
//# sourceMappingURL=OverlaySystem.d.ts.map