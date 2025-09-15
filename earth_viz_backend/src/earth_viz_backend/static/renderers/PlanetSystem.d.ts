/**
 * PlanetSystem - Standardized rendering system pattern
 *
 * Rendering system using the common pattern:
 * - initialize() - Main entry point, decides WebGL vs 2D
 * - initializeWebGL() - Attempts WebGL setup
 * - initialize2D() - Sets up 2D fallback
 * - generateFrame() - Produces final canvas output
 */
export interface PlanetResult {
    canvas: HTMLCanvasElement | null;
    planetType: string;
}
export declare class PlanetSystem {
    private webglCanvas;
    private canvas2D;
    private ctx2D;
    private useWebGL;
    private webglRenderer;
    private planetImageData;
    private stateProvider;
    private eventHandlers;
    private imageCache;
    private apiEndpoints;
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
     * Determine if WebGL should be used based on mode, projection and data availability
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
     * Generate 2D planet data (same logic as original)
     */
    private generate2DPlanetData;
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
     * Generate planet and emit result
     */
    private regeneratePlanet;
    /**
     * Load planet image from URL
     */
    private loadPlanetImage;
    /**
     * Subscribe to planet change events
     */
    on(event: string, handler: Function): void;
    /**
     * Emit events to subscribers
     */
    private emit;
    /**
     * Get available planet types
     */
    getAvailablePlanets(): string[];
    /**
     * Check live earth status
     */
    checkLiveEarthStatus(): Promise<any>;
    /**
     * Trigger manual cloud generation
     */
    triggerCloudGeneration(): Promise<boolean>;
    /**
     * Check if a planet image is loaded
     */
    isPlanetLoaded(planetType: string): boolean;
    /**
     * Preload planet images
     */
    preloadPlanets(planetTypes: string[]): Promise<void>;
    /**
     * Check if the system is ready
     */
    isReady(): boolean;
    /**
     * Clean up resources
     */
    dispose(): void;
}
//# sourceMappingURL=PlanetSystem.d.ts.map