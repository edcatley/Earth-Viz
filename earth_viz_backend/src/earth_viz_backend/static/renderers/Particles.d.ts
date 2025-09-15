/**
 * particles - Standardized rendering system pattern
 *
 * Rendering system using the common pattern:
 * - initialize() - Main entry point, decides WebGL vs 2D
 * - initializeWebGL() - Attempts WebGL setup
 * - initialize2D() - Sets up 2D fallback
 * - generateFrame() - Produces final canvas output
 */
import { Vector } from '../core/Globes';
export interface Particle {
    age: number;
    x: number;
    y: number;
    xt?: number;
    yt?: number;
}
export interface Field {
    (x: number, y: number): Vector;
    randomize(): {
        x: number;
        y: number;
        age: number;
    };
    isDefined(x: number, y: number): boolean;
}
export interface ParticleResult {
    canvas: HTMLCanvasElement | null;
    particleType: string;
}
export declare class ParticleSystem {
    private webglCanvas;
    private canvas2D;
    private ctx2D;
    private useWebGL;
    private field;
    private particles;
    private colorStyles;
    private buckets;
    private stateProvider;
    private eventHandlers;
    private animationId;
    constructor();
    /**
     * Main initialization - decides WebGL vs 2D based on projection and data availability
     */
    initialize(): void;
    /**
     * Attempt WebGL initialization - returns true if successful
     * For now, this is a placeholder for future WebGL particle rendering
     */
    private initializeWebGL;
    /**
     * Initialize 2D particle system
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
     * Render using WebGL system (placeholder)
     */
    private renderWebGL;
    /**
     * Render using 2D system (evolve particles and draw them)
     */
    private render2D;
    /**
     * Initialize the particle field and particles
     */
    private initializeParticleField;
    /**
     * Distort wind vector based on projection
     */
    private distort;
    /**
     * Create the particle field function
     */
    private createField;
    /**
     * Initialize particles array
     */
    private initializeParticles;
    /**
     * Evolve particles for one frame
     */
    private evolveParticles;
    /**
     * Draw particles to the 2D canvas
     * Uses normal blending - RenderSystem will handle inter-layer blending
     */
    private drawParticles;
    /**
     * Clear the particle canvas and emit empty result
     */
    private clearCanvas;
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
     * Generate particles and emit result
     */
    private regenerateParticles;
    /**
     * Subscribe to particle change events
     */
    on(event: string, handler: Function): void;
    /**
     * Emit events to subscribers
     */
    private emit;
    /**
     * Check if the system is ready
     */
    isReady(): boolean;
    /**
     * Get current particle count
     */
    getParticleCount(): number;
    /**
     * Start the particle animation loop
     */
    startAnimation(): void;
    /**
     * Stop the particle animation loop
     */
    stopAnimation(): void;
    /**
     * Internal animation loop - evolves particles and emits canvas
     */
    private animate;
    /**
     * Check if animation is running
     */
    isAnimating(): boolean;
    /**
     * Clean up resources
     */
    dispose(): void;
}
//# sourceMappingURL=Particles.d.ts.map