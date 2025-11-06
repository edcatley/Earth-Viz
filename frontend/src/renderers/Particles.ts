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
import { ViewportSize, Vector, Bounds, Globe } from '../core/Globes';
import { WebGLParticleSystem } from '../services/WebGLParticleSystem';

// Debug logging
function debugLog(category: string, message: string, data?: any): void {
    console.log(`[${category}] ${message}`, data || '');
}

// Constants
const MAX_PARTICLE_AGE = 50;
const PARTICLE_MULTIPLIER = 7;
const PARTICLE_REDUCTION = 0.75;
const PARTICLE_LINE_WIDTH = 1.0;


export interface Particle {
    age: number;
    x: number;
    y: number;
    xt?: number;
    yt?: number;
}

export interface Field {
    (x: number, y: number): Vector;
    randomize(): { x: number; y: number; age: number };
    isDefined(x: number, y: number): boolean;
}

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

    // WebGL particle system
    private webglParticleSystem: WebGLParticleSystem | null = null;

    // Particle system data
    private field: Field | null = null;
    private particleData: Float32Array | null = null; // [x, y, age, xt, yt, magnitude, x, y, age, xt, yt, magnitude, ...]
    private particleCount = 0;

    // Wind field storage (flat typed array for efficiency)
    private windData: Float32Array | null = null;
    private windBounds: { x: number; y: number; width: number; height: number; spacing: number } | null = null;


    // External state references
    private stateProvider: any = null;

    // Cached config values (updated in handleDataChange)
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

        // Bind animate once to avoid creating new closures every frame
        this.boundAnimate = this.animateFrame.bind(this);

        debugLog('PARTICLES', 'particles created with standardized pattern');
    }

    // ===== MAIN PATTERN METHODS =====

    /**
     * Main initialization - decides WebGL vs 2D based on projection and data availability
     */
    public initialize(): void {
        debugLog('PARTICLES', 'Starting initialization');

        // Reset everything
        this.reset();

        // Get common state needed for both WebGL and 2D
        const view = this.stateProvider?.getView();
        const globe = this.stateProvider?.getGlobe();
        const mask = this.stateProvider?.getMask();
        const config = this.stateProvider?.getConfig();
        const particleProduct = this.stateProvider?.getParticleProduct();

        // Cache particleType to avoid creating config objects in hot path
        this.cachedParticleType = config?.particleType || 'off';

        // Validate required data
        if (!globe || !mask || !view || !config || !particleProduct) {
            debugLog('PARTICLES', 'Initialization skipped - missing required data');
            return;
        }

        // Skip if particles are disabled
        if (!config.particleType || config.particleType === 'off') {
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
        if (this.initializeWebGL()) {
            this.useWebGL = true;
            this.field = null;
            this.startAnimation();
            debugLog('PARTICLES', 'WebGL initialization successful - animation started');
            return;
        }
        debugLog('PARTICLES', 'WebGL initialization failed, falling back to 2D');

        // Fallback to 2D
        this.initialize2D(view, globe.bounds(view), validPositions);
        this.useWebGL = false;
        this.startAnimation();
        debugLog('PARTICLES', '2D initialization complete');
    }

    /**
     * Attempt WebGL initialization - returns true if successful
     * Assumes particle field has already been initialized
     */
    private initializeWebGL(): boolean {
        debugLog('PARTICLES', 'Attempting WebGL particle system initialization');

        // Validate wind data is available
        if (!this.windData || !this.windBounds) {
            debugLog('PARTICLES', 'WebGL init skipped - no wind data');
            return false;
        }

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
    private initialize2D(view: ViewportSize, _bounds: Bounds, validPositions: Array<[number, number]>): void {
        debugLog('PARTICLES', 'Initializing 2D particle system');

        // Ensure canvas is properly sized
        this.canvas2D.width = view.width;
        this.canvas2D.height = view.height;

        // Create field function (2D only)
        this.field = this.createField(validPositions);

        // Initialize particle data with random positions and staggered ages
        this.particleData = new Float32Array(this.particleCount * 6);
        for (let i = 0; i < this.particleCount * 6; i += 6) {
            const { x, y, age } = this.field.randomize();
            this.particleData[i] = x;
            this.particleData[i + 1] = y;
            this.particleData[i + 2] = age;
            // xt, yt, magnitude default to 0
        }

        debugLog('PARTICLES', `2D system initialized with ${this.particleCount} particles`);
    }

    /**
     * Generate frame using appropriate rendering system
     */
    public generateFrame(): HTMLCanvasElement | null {
        if (this.useWebGL && this.webglParticleSystem) {
            // WebGL path - pure GPU rendering
            this.webglParticleSystem.evolve();
            this.renderWebGL();
            return this.webglCanvas;
        } else {
            // CPU path - evolve and render on CPU
            this.evolveParticles();
            this.render2D();
            return this.canvas2D;
        }
    }

    // ===== RENDERING IMPLEMENTATIONS =====

    /**
     * Render particles using WebGL (no ReadPixels!)
     */
    private renderWebGL(): boolean {
        if (!this.webglParticleSystem) {
            debugLog('PARTICLES', 'WebGL render failed - no system');
            return false;
        }

        const view = this.stateProvider.getView();

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
    private render2D(): boolean {
        const globe = this.stateProvider.getGlobe();
        const view = this.stateProvider.getView();

        // Ensure canvas is properly sized
        if (this.canvas2D.width !== view.width || this.canvas2D.height !== view.height) {
            this.canvas2D.width = view.width;
            this.canvas2D.height = view.height;
        }

        // Fade existing particle trails
        const bounds = globe.bounds(view);
        const prev = this.ctx2D!.globalCompositeOperation;
        this.ctx2D!.globalCompositeOperation = "destination-in";
        this.ctx2D!.fillStyle = "rgba(0, 0, 0, 0.95)";
        this.ctx2D!.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
        this.ctx2D!.globalCompositeOperation = prev;

        // Draw particles to canvas
        this.drawParticles();

        return true;
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

    /**
     * Create the particle field function using typed array
     */
    private createField(validPositions: Array<[number, number]>): Field {
        const NULL_WIND_VECTOR: Vector = [NaN, NaN, null];
        const windData = this.windData!;
        const wb = this.windBounds!;

        function field(x: number, y: number): Vector {
            // Convert pixel coordinates to sample indices
            const sx = Math.round((x - wb.x) / wb.spacing);
            const sy = Math.round((y - wb.y) / wb.spacing);

            // Bounds check
            if (sx < 0 || sx >= wb.width || sy < 0 || sy >= wb.height) {
                return NULL_WIND_VECTOR;
            }

            // Calculate flat array index: (sx * height + sy) * 3
            const idx = (sx * wb.height + sy) * 3;
            const u = windData[idx];
            const v = windData[idx + 1];
            const magnitude = windData[idx + 2];

            // Return null for magnitude if NaN (invalid wind)
            return [u, v, isNaN(magnitude) ? null : magnitude];
        }

        field.randomize = (): { x: number; y: number; age: number } => {
            const randomIndex = Math.floor(Math.random() * validPositions.length);
            const [x, y] = validPositions[randomIndex];

            // Add random sub-pixel offset within the spacing block to avoid grid artifacts
            return {
                x: x + Math.floor(Math.random() * wb.spacing),
                y: y + Math.floor(Math.random() * wb.spacing),
                age: Math.floor(Math.random() * MAX_PARTICLE_AGE)
            };
        };

        field.isDefined = function (x: number, y: number): boolean {
            return field(x, y)[2] !== null;
        };

        return field;
    }



    /**
     * Evolve particles for one frame (CPU only)
     */
    private evolveParticles(): void {
        if (!this.field || !this.particleData) {
            debugLog('PARTICLES', 'Cannot evolve particles - missing field');
            return;
        }

        for (let i = 0; i < this.particleCount * 6; i += 6) {
            const x = this.particleData[i];
            const y = this.particleData[i + 1];
            let age = this.particleData[i + 2];

            if (age > MAX_PARTICLE_AGE) {
                // Respawn at random position with age 0
                const { x: newX, y: newY } = this.field!.randomize();
                this.particleData[i] = newX;
                this.particleData[i + 1] = newY;
                this.particleData[i + 2] = 0; // Reset age to 0 on respawn
                // Set xt, yt to same as x, y so no line is drawn on first frame after respawn
                this.particleData[i + 3] = newX;
                this.particleData[i + 4] = newY;
                this.particleData[i + 5] = 0; // magnitude
            } else {
                const v = this.field!(x, y);
                const m = v[2];

                if (m === null) {
                    this.particleData[i + 2] = MAX_PARTICLE_AGE;
                } else {
                    const xt = x + v[0];
                    const yt = y + v[1];

                    if (this.field!.isDefined(xt, yt)) {
                        // Valid move - store next position and magnitude
                        this.particleData[i + 3] = xt;
                        this.particleData[i + 4] = yt;
                        this.particleData[i + 5] = m;
                    } else {
                        // Invalid move - just update position
                        this.particleData[i] = xt;
                        this.particleData[i + 1] = yt;
                    }
                }
            }
            // Increment age
            this.particleData[i + 2] += 1;
        }
    }



    /**
     * Draw particles to the 2D canvas
     */
    private drawParticles(): void {
        if (!this.ctx2D || !this.particleData) {
            return;
        }

        // Draw all particles with single color
        this.ctx2D.lineWidth = PARTICLE_LINE_WIDTH;
        this.ctx2D.globalAlpha = 0.9;
        this.ctx2D.strokeStyle = 'white';

        this.ctx2D.beginPath();

        for (let i = 0; i < this.particleCount; i++) {
            const idx = i * 6;
            const x = this.particleData[idx];
            const y = this.particleData[idx + 1];
            const age = this.particleData[idx + 2];
            const xt = this.particleData[idx + 3];
            const yt = this.particleData[idx + 4];

            // Skip particles that are about to respawn (age >= 29)
            // This prevents drawing long lines from death position to random new position
            if (age >= MAX_PARTICLE_AGE - 1) {
                continue;
            }

            // Draw line from current to next position
            this.ctx2D.moveTo(x, y);
            this.ctx2D.lineTo(xt, yt);

            // Update position for next frame
            this.particleData[idx] = xt;
            this.particleData[idx + 1] = yt;
        }

        this.ctx2D.stroke();

        // Reset alpha
        this.ctx2D.globalAlpha = 1.0;
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

        // Clear particle data
        this.field = null;
        this.particleData = null;
        this.particleCount = 0;
        this.windData = null;
        this.windBounds = null;

        // Reset state
        this.useWebGL = false;
    }

    /**
     * Set external state provider (no longer subscribing to events)
     */
    setStateProvider(stateProvider: any): void {
        this.stateProvider = stateProvider;
        debugLog('PARTICLES', 'State provider set');
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
    public handleDataChange(): void {
        debugLog('PARTICLES', 'Handling data change - reinitializing system');

        this.clearCanvas();
        this.initialize();
        this.regenerateParticles(); // Generate initial frame

    }



    /**
     * Generate particles and emit result
     */
    private regenerateParticles(): void {
        const canvas = this.generateFrame();

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
        if (!this.boundAnimate) return;
        
        try {
            // Generate new frame (evolve particles and draw to canvas)
            const canvas = this.generateFrame();

            if (canvas) {
                // Use cached particleType instead of calling getConfig() every frame
                const result: ParticleResult = {
                    canvas: canvas,
                    particleType: this.cachedParticleType
                };

                this.emit('particlesChanged', result);
            }

            // Schedule next frame using pre-bound function (no new closure)
            this.animationId = setTimeout(this.boundAnimate, 1000) as any;

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
        this.stateProvider = null;
    }
}