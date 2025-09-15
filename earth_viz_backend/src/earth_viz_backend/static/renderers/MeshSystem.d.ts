/**
 * MeshSystem - Standardized rendering system pattern
 *
 * Rendering system using the common pattern:
 * - initialize() - Main entry point, decides WebGL vs 2D
 * - initializeWebGL() - Attempts WebGL setup
 * - initialize2D() - Sets up 2D fallback
 * - generateFrame() - Produces final canvas output
 */
export interface MeshStyle {
    color: [number, number, number];
    lineWidth: number;
    opacity: number;
}
export interface MeshResult {
    canvas: HTMLCanvasElement | null;
    meshType: string;
}
export declare class MeshSystem {
    private webglCanvas;
    private canvas2D;
    private ctx2D;
    private useWebGL;
    private webglMeshRenderer;
    private stateProvider;
    private eventHandlers;
    private meshStyles;
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
     * Load mesh data into WebGL renderer
     */
    private loadWebGLMeshData;
    /**
     * Convert RGB array to CSS color string
     */
    private rgbToString;
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
     * Generate mesh and emit result
     */
    regenerateMesh(): void;
    /**
     * Subscribe to mesh change events
     */
    on(event: string, handler: Function): void;
    /**
     * Emit events to subscribers
     */
    private emit;
    /**
     * Get mesh styles for external use
     */
    getMeshStyles(): {
        [key: string]: MeshStyle;
    };
    /**
     * Update mesh styles
     */
    updateMeshStyles(styles: {
        [key: string]: Partial<MeshStyle>;
    }): void;
    /**
     * Check if the system is ready
     */
    isReady(): boolean;
    /**
     * Clean up resources
     */
    dispose(): void;
}
//# sourceMappingURL=MeshSystem.d.ts.map