/**
 * particles - Standardized rendering system pattern
 * 
 * Rendering system using the common pattern:
 * - initialize() - Main entry point, decides WebGL vs 2D
 * - initializeWebGL() - Attempts WebGL setup
 * - initialize2D() - Sets up 2D fallback
 * - generateFrame() - Produces final canvas output
 */

import { Utils } from '../utils/Utils';
import { ViewportSize, Globe } from '../core/Globes';
import { WebGLParticleSystem } from '../services/WebGLParticleSystem';
import { ParticleRenderer2D } from './2dParticleRenderer';

// Debug logging
function debugLog(category: string, message: string, data?: any): void {
    console.log(`[${category}] ${message}`, data || '');
}

// Constants
const PARTICLE_MULTIPLIER = 7;
const PARTICLE_REDUCTION = 0.75;
const PARTICLE_LINE_WIDTH = 1.0;

export interface ParticleResult {
    canvas: HTMLCanvasElement | null;  // Single canvas output
    particleType: string;
}

export class ParticleSystem {
    // Common rendering system properties
    private webglCanvas: HTMLCanvasElement;
    private canvas2D: HTMLCanvasElement;
    private ctx2D: CanvasRenderingContext2D | null = null;
    private useWebGL: boolean = false;

    // Renderer delegates
    private webglParticleSystem: WebGLParticleSystem | null = null;
    private renderer2D: ParticleRenderer2D | null = null;

    // Particle count
    private particleCount = 0;

    // Wind field storage (flat typed array for efficiency)
    private windData: Float32Array | null = null;
    private windBounds: { x: number; y: number; width: number; height: number; spacing: number } | null = null;

    // Cached state for animation (updated in handleDataChange)
    private cachedGlobe: Globe | null = null;
    private cachedView: ViewportSize | null = null;
    private cachedParticleType: string = 'off';

    // Event callbacks
    private eventHandlers: { [key: string]: Function[] } = {};

    // Animation
    private animationId: number | null = null;
    private boundAnimate: (() => void) | null = null;

    constructor() {
        // Create canvases
        this.webglCanvas = document.createElement("canvas");
        this.canvas2D = document.createElement("canvas");

        const ctx = this.canvas2D.getContext("2d");
        if (!ctx) {
            throw new Error("Failed to create 2D canvas context for particles");
        }
        this.ctx2D = ctx;

        // Create 2D renderer
        this.renderer2D = new ParticleRenderer2D();

        // Bind animate once to avoid creating new closures every frame
        this.boundAnimate = this.animateFrame.bind(this);

        debugLog('PARTICLES', 'particles created with standardized pattern');
    }

    // ===== MAIN PATTERN METHODS =====

    /**
     * Main initialization - decides WebGL vs 2D based on projection and data availability
     */
    public initialize(
        globe: Globe,
        mask: any,
        view: ViewportSize,
        particleProduct: any,
        particleType: string
    ): void {
        debugLog('PARTICLES', 'Starting initialization');

        // Reset everything
        this.reset();

        // Cache particleType to avoid creating config objects in hot path
        this.cachedParticleType = particleType;

        // Validate required data
        if (!globe || !mask || !view || !particleProduct) {
            debugLog('PARTICLES', 'Initialization skipped - missing required data');
            return;
        }

        // Skip if particles are disabled
        if (!particleType || particleType === 'off') {
            debugLog('PARTICLES', 'Initialization skipped - particles disabled');
            return;
        }

        // Initialize wind field data (common for both WebGL and 2D)
        const validPositions = this.initializeParticleField(particleProduct, globe, mask, view);

        // Calculate particle count based on viewport size
        const bounds = globe.bounds(view);
        this.particleCount = Math.round(bounds.width * PARTICLE_MULTIPLIER);
        if (Utils.isMobile()) {
            this.particleCount *= PARTICLE_REDUCTION;
        }
        debugLog('PARTICLES', `Calculated particle count: ${this.particleCount} for viewport width ${bounds.width}`);

        // Attempt WebGL initialization
        debugLog('PARTICLES', 'Attempting WebGL initialization');
        if (this.initializeWebGL(view)) {
            this.useWebGL = true;
            this.startAnimation();
            debugLog('PARTICLES', 'WebGL initialization successful - animation started');
            return;
        }
        debugLog('PARTICLES', 'WebGL initialization failed, falling back to 2D');

        // Fallback to 2D
        this.initialize2D(view, validPositions);
        this.useWebGL = false;
        this.startAnimation();
        debugLog('PARTICLES', '2D initialization complete');
    }

    /**
     * Attempt WebGL initialization - returns true if successful
     * Assumes particle field has already been initialized
     */
    private initializeWebGL(view: ViewportSize): boolean {
        debugLog('PARTICLES', 'Attempting WebGL particle system initialization');

        // Validate wind data is available
        if (!this.windData || !this.windBounds) {
            debugLog('PARTICLES', 'WebGL init skipped - no wind data');
            return false;
        }

        // Ensure canvas is properly sized
        this.webglCanvas.width = view.width;
        this.webglCanvas.height = view.height;

        // Create WebGL particle system only if it doesn't exist (initialize once)
        if (!this.webglParticleSystem) {
            this.webglParticleSystem = new WebGLParticleSystem();

            // Initialize WebGL context (only on first creation)
            if (!this.webglParticleSystem.initialize(this.webglCanvas)) {
                debugLog('PARTICLES', 'WebGL context initialization failed');
                this.webglParticleSystem = null;
                return false;
            }
            debugLog('PARTICLES', 'WebGL context initialized');
        } else {
            debugLog('PARTICLES', 'Reusing existing WebGL context');
        }

        // Setup WebGL particle system with data (can be called multiple times)
        if (!this.webglParticleSystem.setup(this.particleCount, this.windData, this.windBounds)) {
            debugLog('PARTICLES', 'WebGL setup failed');
            return false;
        }

        // Free CPU wind data after GPU upload - no longer needed
        debugLog('PARTICLES', `Freeing wind data (${(this.windData.byteLength / 1048576).toFixed(2)} MB)`);
        this.windData = null;
        this.windBounds = null;

        debugLog('PARTICLES', 'WebGL particle system setup successfully');
        return true;
    }

    /**
     * Initialize 2D particle system
     * Assumes wind field data has already been initialized
     */
    private initialize2D(view: ViewportSize, validPositions: Array<[number, number]>): void {
        debugLog('PARTICLES', 'Initializing 2D particle system');

        if (!this.renderer2D || !this.windData || !this.windBounds) {
            debugLog('PARTICLES', '2D init failed - missing renderer or wind data');
            return;
        }

        // Ensure canvas is properly sized
        this.canvas2D.width = view.width;
        this.canvas2D.height = view.height;

        // Delegate to 2D renderer
        this.renderer2D.initialize(this.particleCount, this.windData, this.windBounds, validPositions);

        debugLog('PARTICLES', `2D system initialized with ${this.particleCount} particles`);
    }

    /**
     * Generate frame using appropriate rendering system
     */
    public generateFrame(globe: Globe, view: ViewportSize): HTMLCanvasElement | null {
        if (this.useWebGL && this.webglParticleSystem) {
            // WebGL path - pure GPU rendering
            this.webglParticleSystem.evolve();
            this.renderWebGL(view);
            return this.webglCanvas;
        } else if (this.renderer2D) {
            // CPU path - evolve and render on CPU
            this.renderer2D.evolve();
            this.render2D(globe, view);
            return this.canvas2D;
        }
        return null;
    }

    // ===== RENDERING IMPLEMENTATIONS =====

    /**
     * Render particles using WebGL (no ReadPixels!)
     */
    private renderWebGL(view: ViewportSize): boolean {
        if (!this.webglParticleSystem) {
            debugLog('PARTICLES', 'WebGL render failed - no system');
            return false;
        }

        // Ensure canvas is properly sized
        if (this.webglCanvas.width !== view.width || this.webglCanvas.height !== view.height) {
            this.webglCanvas.width = view.width;
            this.webglCanvas.height = view.height;
        }

        // Render particles (pass half width for quad rendering)
        this.webglParticleSystem.render(PARTICLE_LINE_WIDTH / 2);
        return true;
    }

    /**
     * Render particles using 2D canvas (CPU)
     */
    private render2D(globe: Globe, view: ViewportSize): boolean {
        if (!this.renderer2D || !this.ctx2D) {
            debugLog('PARTICLES', '2D render failed - no renderer');
            return false;
        }

        if (!globe || !view) {
            debugLog('PARTICLES', '2D render failed - missing state');
            return false;
        }

        // Ensure canvas is properly sized
        if (this.canvas2D.width !== view.width || this.canvas2D.height !== view.height) {
            this.canvas2D.width = view.width;
            this.canvas2D.height = view.height;
        }

        // Delegate to 2D renderer
        return this.renderer2D.render(this.ctx2D, globe, view);
    }

    // ===== PARTICLE SYSTEM IMPLEMENTATION =====

    /**
     * Initialize the wind field data (common for both WebGL and 2D)
     * Returns valid positions for 2D particle initialization
     */
    private initializeParticleField(
        windProduct: any,
        globe: Globe,
        mask: any,
        view: ViewportSize
    ): Array<[number, number]> {
        debugLog('PARTICLES', 'Creating particle system from wind data');

        const bounds = globe.bounds(view);
        const velocityScale = bounds.height * (windProduct.particles?.velocityScale || 1 / 60000);

        debugLog('PARTICLES', `Bounds: x=${bounds.x}, y=${bounds.y}, width=${bounds.width}, height=${bounds.height}`);
        debugLog('PARTICLES', `Velocity scale: ${velocityScale}`);


        // Pre-compute wind vectors for visible pixels
        // Sampling every 4 pixels to reduce memory
        const spacing = 4;
        const samplesX = Math.ceil((bounds.xMax - bounds.x + 1) / spacing);
        const samplesY = Math.ceil((bounds.yMax - bounds.y + 1) / spacing);

        // Allocate flat typed array: [u, v, magnitude, u, v, magnitude, ...]
        // 3 values per sample point
        this.windData = new Float32Array(samplesX * samplesY * 3);
        this.windBounds = {
            x: bounds.x,
            y: bounds.y,
            width: samplesX,
            height: samplesY,
            spacing: spacing
        };

        const validPositions: Array<[number, number]> = [];
        let dataIndex = 0;

        for (let sx = 0; sx < samplesX; sx++) {
            for (let sy = 0; sy < samplesY; sy++) {
                const x = bounds.x + sx * spacing;
                const y = bounds.y + sy * spacing;

                let u = NaN, v = NaN, magnitude = NaN;

                if (mask.isVisible(x, y)) {
                    const coord = globe.projection?.invert?.([x, y]);
                    if (coord != null) {
                        const λ = coord[0], φ = coord[1];

                        if (isFinite(λ) && isFinite(φ)) {
                            const rawWind = windProduct.interpolate(λ, φ);
                            if (rawWind && rawWind[0] != null && rawWind[1] != null) {
                                if (globe.projection) {
                                    const distortedWind = Utils.distortWind(globe.projection, λ, φ, x, y, velocityScale, rawWind);
                                    if (distortedWind != null && distortedWind[2] != null) {
                                        u = distortedWind[0];
                                        v = distortedWind[1];
                                        magnitude = distortedWind[2];
                                        validPositions.push([x, y]);
                                    }
                                }
                            }
                        }
                    }
                }

                // Store in flat array
                this.windData[dataIndex++] = u;
                this.windData[dataIndex++] = v;
                this.windData[dataIndex++] = magnitude;
            }
        }

        const memoryMB = (this.windData.byteLength / 1048576).toFixed(2);
        debugLog('PARTICLES', `Created wind field: ${samplesX}x${samplesY} samples (${memoryMB} MB), ${validPositions.length} valid positions`);

        // Return valid positions for 2D initialization
        return validPositions;
    }



    // ===== UTILITY METHODS =====

    /**
     * Clear the particle canvas and emit empty result
     */
    private clearCanvas(): void {
        debugLog('PARTICLES', 'Clearing particle canvas');

        // Clear 2D canvas
        if (this.ctx2D) {
            this.ctx2D.clearRect(0, 0, this.canvas2D.width, this.canvas2D.height);
        }

        // Clear WebGL canvas
        if (this.webglCanvas) {
            const ctx = this.webglCanvas.getContext('webgl') || this.webglCanvas.getContext('webgl2');
            if (ctx) {
                ctx.clearColor(0.0, 0.0, 0.0, 0.0);
                ctx.clear(ctx.COLOR_BUFFER_BIT | ctx.DEPTH_BUFFER_BIT);
            }
        }

        // Emit cleared canvas
        const result: ParticleResult = {
            canvas: this.canvas2D,
            particleType: this.cachedParticleType
        };
        this.emit('particlesChanged', result);
    }

    /**
     * Reset system state
     */
    private reset(): void {
        debugLog('PARTICLES', 'Resetting system state');

        this.clearCanvas();

        // Dispose WebGL resources
        if (this.webglParticleSystem) {
            this.webglParticleSystem.dispose();
            this.webglParticleSystem = null;
        }

        // Dispose 2D renderer
        if (this.renderer2D) {
            this.renderer2D.dispose();
        }

        // Clear particle data
        this.particleCount = 0;
        this.windData = null;
        this.windBounds = null;

        // Clear cached state
        this.cachedGlobe = null;
        this.cachedView = null;

        // Reset state
        this.useWebGL = false;
    }



    /**
     * Handle rotation changes that require re-rendering (not re-initialization)
     * Now called directly from Earth.ts centralized functions
     */
    public handleRotation(): void {
        debugLog('PARTICLES', 'Handling rotation change');

        if (this.isAnimating()) {
            // We were animating, so stop and clear, then restart
            debugLog('PARTICLES', 'Stopping animation and clearing canvas during rotation');
            this.stopAnimation();
            this.clearCanvas();
        }
    }

    /**
     * Handle data changes that require re-initialization
     * Now called directly from Earth.ts centralized functions
     */
    public handleDataChange(
        globe: Globe,
        mask: any,
        view: ViewportSize,
        particleProduct: any,
        particleType: string
    ): void {
        debugLog('PARTICLES', 'Handling data change - reinitializing system');

        // Cache state for animation
        this.cachedGlobe = globe;
        this.cachedView = view;

        this.clearCanvas();
        this.initialize(globe, mask, view, particleProduct, particleType);
        this.regenerateParticles(globe, view); // Generate initial frame
    }



    /**
     * Generate particles and emit result
     */
    private regenerateParticles(globe: Globe, view: ViewportSize): void {
        const canvas = this.generateFrame(globe, view);

        const result: ParticleResult = {
            canvas: canvas,
            particleType: this.cachedParticleType
        };

        this.emit('particlesChanged', result);
    }

    /**
     * Subscribe to particle change events
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


    /**
     * Start the particle animation loop
     */
    startAnimation(): void {
        if (this.animationId) return; // Already running
        debugLog('PARTICLES', 'Starting particle animation');
        this.animate();
    }

    /**
     * Stop the particle animation loop
     */
    stopAnimation(): void {
        debugLog('PARTICLES', 'Stop animation called');
        if (this.animationId) {
            clearTimeout(this.animationId);
            this.animationId = null;
            debugLog('PARTICLES', 'Particle animation stopped');
        }

        // Clear the particle canvas when stopping animation
        this.clearCanvas();
    }

    /**
     * Internal animation loop - evolves particles and emits canvas
     */
    private animate(): void {
        if (!this.boundAnimate || !this.cachedGlobe || !this.cachedView) return;
        
        try {
            // Generate new frame (evolve particles and draw to canvas)
            const canvas = this.generateFrame(this.cachedGlobe, this.cachedView);

            if (canvas) {
                // Use cached particleType instead of calling getConfig() every frame
                const result: ParticleResult = {
                    canvas: canvas,
                    particleType: this.cachedParticleType
                };

                this.emit('particlesChanged', result);
            }

            // Schedule next frame using pre-bound function (no new closure)
            this.animationId = setTimeout(this.boundAnimate, 40) as any;

        } catch (error) {
            debugLog('PARTICLES', 'Animation error:', error);
            this.stopAnimation();
        }
    }
    
    /**
     * Animation frame wrapper for setTimeout
     */
    private animateFrame(): void {
        if (this.animationId) {
            this.animate();
        }
    }

    /**
     * Check if animation is running
     */
    isAnimating(): boolean {
        return this.animationId !== null;
    }

    /**
     * Clean up resources
     */
    dispose(): void {
        this.stopAnimation();

        if (this.webglParticleSystem) {
            this.webglParticleSystem.dispose();
            this.webglParticleSystem = null;
        }

        this.reset();
        this.eventHandlers = {};
    }
}