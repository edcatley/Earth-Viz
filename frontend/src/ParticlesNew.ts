/**
 * ParticlesNew - Standardized rendering system pattern
 * 
 * Rendering system using the common pattern:
 * - initialize() - Main entry point, decides WebGL vs 2D
 * - initializeWebGL() - Attempts WebGL setup
 * - initialize2D() - Sets up 2D fallback
 * - generateFrame() - Produces final canvas output
 */

import { Utils } from './utils/Utils';
import { ViewportSize, Vector, Bounds, Globe } from './Globes';

// Debug logging
function debugLog(category: string, message: string, data?: any): void {
    console.log(`[${category}] ${message}`, data || '');
}

// Constants
const MAX_PARTICLE_AGE = 100;
const PARTICLE_MULTIPLIER = 7;
const PARTICLE_REDUCTION = 0.75;
const INTENSITY_SCALE_STEP = 10;

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

export class ParticlesNew {
    // Common rendering system properties
    private webglCanvas: HTMLCanvasElement;
    private canvas2D: HTMLCanvasElement;
    private ctx2D: CanvasRenderingContext2D | null = null;
    private useWebGL: boolean = false;

    // Particle system data
    private field: Field | null = null;
    private particles: Particle[] = [];
    private colorStyles: any = null;
    private buckets: Particle[][] = [];

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
            throw new Error("Failed to create 2D canvas context for ParticlesNew");
        }
        this.ctx2D = ctx;

        debugLog('PARTICLES', 'ParticlesNew created with standardized pattern');
    }

    // ===== MAIN PATTERN METHODS =====

    /**
     * Main initialization - decides WebGL vs 2D based on projection and data availability
     */
    public initialize(): void {
        debugLog('PARTICLES', 'Starting initialization');

        // Reset everything
        this.reset();

        // Check if we should attempt WebGL (for future WebGL particle rendering)
        if (this.shouldUseWebGL()) {
            debugLog('PARTICLES', 'Attempting WebGL initialization');
            if (this.initializeWebGL()) {
                this.useWebGL = true;
                debugLog('PARTICLES', 'WebGL initialization successful');
                return;
            }
            debugLog('PARTICLES', 'WebGL initialization failed, falling back to 2D');
        } else {
            debugLog('PARTICLES', 'WebGL not suitable for current projection, using 2D');
        }

        // Fallback to 2D (current implementation)
        this.initialize2D();
        this.useWebGL = false;
        debugLog('PARTICLES', '2D initialization complete');
    }

    /**
     * Attempt WebGL initialization - returns true if successful
     * For now, this is a placeholder for future WebGL particle rendering
     */
    private initializeWebGL(): boolean {
        debugLog('PARTICLES', 'WebGL particle rendering not yet implemented');
        return false;
    }

    /**
     * Initialize 2D particle system
     */
    private initialize2D(): void {
        debugLog('PARTICLES', 'Initializing 2D particle system');

        // 2D system is always ready since we created the canvas in constructor
        // Just ensure canvas is properly sized
        const view = this.stateProvider?.getView();
        if (view) {
            this.canvas2D.width = view.width;
            this.canvas2D.height = view.height;
        }

        // Get current state
        const globe = this.stateProvider?.getGlobe();
        const mask = this.stateProvider?.getMask();
        const config = this.stateProvider?.getConfig();
        const particleProduct = this.stateProvider?.getParticleProduct();

        if (!globe || !mask || !view || !config || !particleProduct) {
            debugLog('PARTICLES', '2D init skipped - missing required data');
            return;
        }

        // Skip if particles are disabled
        if (!config.particleType || config.particleType === 'off') {
            debugLog('PARTICLES', '2D init skipped - particles disabled');
            return;
        }

        // Initialize particle field and particles
        this.initializeParticleField(particleProduct, globe, mask, view);

        debugLog('PARTICLES', '2D system initialized');
    }

    /**
     * Generate frame using appropriate rendering system
     */
    public generateFrame(): HTMLCanvasElement | null {
        const config = this.stateProvider?.getConfig();

        // Skip if particles are disabled
        if (!config || !config.particleType || config.particleType === 'off') {
            debugLog('PARTICLES', `Skipping frame generation - particles disabled: ${config?.particleType}`);
            return null;
        }

        debugLog('PARTICLES', `Generating frame using ${this.useWebGL ? 'WebGL' : '2D'}`);

        if (this.useWebGL) {
            return this.renderWebGL() ? this.webglCanvas : null;
        } else {
            return this.render2D() ? this.canvas2D : null;
        }
    }

    // ===== DECISION LOGIC =====

    /**
     * Determine if WebGL should be used based on projection and data availability
     */
    private shouldUseWebGL(): boolean {
        // For now, always use 2D until WebGL particle rendering is implemented
        return false;
    }

    // ===== RENDERING IMPLEMENTATIONS =====

    /**
     * Render using WebGL system (placeholder)
     */
    private renderWebGL(): boolean {
        debugLog('PARTICLES', 'WebGL particle rendering not yet implemented');
        return false;
    }

    /**
     * Render using 2D system (evolve particles and draw them)
     */
    private render2D(): boolean {
        if (!this.ctx2D) {
            debugLog('PARTICLES', '2D render failed - no context');
            return false;
        }

        if (!this.field || !this.colorStyles) {
            debugLog('PARTICLES', '2D render failed - missing field or colorStyles');
            return false;
        }

        try {
            const globe = this.stateProvider?.getGlobe();
            const view = this.stateProvider?.getView();

            if (!globe || !view) {
                debugLog('PARTICLES', '2D render failed - missing state');
                return false;
            }

            // Ensure canvas is properly sized
            if (this.canvas2D.width !== view.width || this.canvas2D.height !== view.height) {
                this.canvas2D.width = view.width;
                this.canvas2D.height = view.height;
            }

            // Clear the canvas
            this.ctx2D.clearRect(0, 0, this.canvas2D.width, this.canvas2D.height);

            // Evolve particles
            this.evolveParticles();

            // Draw particles to canvas
            this.drawParticles();

            debugLog('PARTICLES', '2D render successful');
            return true;

        } catch (error) {
            debugLog('PARTICLES', '2D render error:', error);
            return false;
        }
    }

    // ===== PARTICLE SYSTEM IMPLEMENTATION =====

    /**
     * Initialize the particle field and particles
     */
    private initializeParticleField(
        windProduct: any,
        globe: Globe,
        mask: any,
        view: ViewportSize
    ): void {
        debugLog('PARTICLES', 'Creating particle system from wind data');

        const bounds = globe.bounds(view);
        const velocityScale = bounds.height * (windProduct.particles?.velocityScale || 1 / 60000);

        debugLog('PARTICLES', `Bounds: x=${bounds.x}, y=${bounds.y}, width=${bounds.width}, height=${bounds.height}`);
        debugLog('PARTICLES', `Velocity scale: ${velocityScale}`);

        // Pre-compute wind vectors for all visible pixels
        const columns: any[] = [];
        const validPositions: Array<[number, number]> = [];

        let totalPixels = 0;
        let visiblePixels = 0;
        let windDataPixels = 0;
        let filteredPixels = 0;

        for (let x = bounds.x; x <= bounds.xMax; x += 2) {
            const column: any[] = [];

            for (let y = bounds.y; y <= bounds.yMax; y += 2) {
                totalPixels++;
                let wind: Vector = [NaN, NaN, null];

                if (mask.isVisible(x, y)) {
                    visiblePixels++;
                    const coord = globe.projection?.invert?.([x, y]);
                    if (coord != null) {
                        const λ = coord[0], φ = coord[1];

                        if (isFinite(λ) && isFinite(φ)) {
                            const rawWind = windProduct.interpolate(λ, φ);
                            if (rawWind && rawWind[0] != null && rawWind[1] != null) {
                                windDataPixels++;
                                if (globe.projection) {
                                    const distortedWind = this.distort(globe.projection, λ, φ, x, y, velocityScale, rawWind);
                                    if (distortedWind != null && distortedWind[2] != null) {
                                        // Calculate vector magnitude from x,y components (pixels per frame)
                                        const vectorMagnitude = Math.sqrt(distortedWind[0] * distortedWind[0] + distortedWind[1] * distortedWind[1]);

                                        if (vectorMagnitude < 200) {
                                            wind = distortedWind;
                                            validPositions.push([x, y]);
                                            filteredPixels++;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                column[y + 1] = column[y] = wind;
            }
            columns[x + 1] = columns[x] = column;
        }

        debugLog('PARTICLES', `Pixel statistics: total=${totalPixels}, visible=${visiblePixels}, withWindData=${windDataPixels}, filtered=${filteredPixels}`);
        debugLog('PARTICLES', `Valid positions for particles: ${validPositions.length}`);

        // Create field function
        this.field = this.createField(columns, bounds, validPositions);

        // Setup color system
        this.colorStyles = windProduct.particles ?
            Utils.windIntensityColorScale(INTENSITY_SCALE_STEP, windProduct.particles.maxIntensity) : null;
        this.buckets = this.colorStyles ? this.colorStyles.map(() => []) : [];

        // Initialize particles
        this.initializeParticles(bounds);

        debugLog('PARTICLES', `Created ${this.particles.length} particles`);
    }

    /**
     * Distort wind vector based on projection
     */
    private distort(projection: any, λ: number, φ: number, x: number, y: number, scale: number, wind: Vector): Vector | null {
        const u = wind[0] * scale;
        const v = wind[1] * scale;
        const d = Utils.distortion(projection, λ, φ, x, y);

        if (!d || d.length < 4) {
            return null;
        }

        // Scale distortion vectors by u and v, then add.
        wind[0] = d[0] * u + d[2] * v;
        wind[1] = d[1] * u + d[3] * v;

        return wind;
    }

    /**
     * Create the particle field function
     */
    private createField(columns: any[][], bounds: Bounds, validPositions: Array<[number, number]>): Field {
        const NULL_WIND_VECTOR: Vector = [NaN, NaN, null];

        function field(x: number, y: number): Vector {
            const column = columns[Math.round(x)];
            return column && column[Math.round(y)] || NULL_WIND_VECTOR;
        }

        field.randomize = (): { x: number; y: number; age: number } => {
            if (validPositions.length === 0) {
                debugLog('PARTICLES', 'ERROR: No valid positions available for particle spawning!');
                return { x: bounds.x, y: bounds.y, age: Math.random() * MAX_PARTICLE_AGE };
            }

            const randomIndex = Math.floor(Math.random() * validPositions.length);
            const [x, y] = validPositions[randomIndex];

            return { x, y, age: Math.random() * MAX_PARTICLE_AGE };
        };

        field.isDefined = function (x: number, y: number): boolean {
            return field(x, y)[2] !== null;
        };

        return field;
    }

    /**
     * Initialize particles array
     */
    private initializeParticles(bounds: Bounds): void {
        let particleCount = Math.round(bounds.width * PARTICLE_MULTIPLIER);
        if (Utils.isMobile()) {
            particleCount *= PARTICLE_REDUCTION;
        }

        this.particles = [];
        for (let i = 0; i < particleCount; i++) {
            const particle = this.field!.randomize();
            this.particles.push({
                age: particle.age,
                x: particle.x,
                y: particle.y
            });
        }
    }

    /**
     * Evolve particles for one frame
     */
    private evolveParticles(): void {
        if (!this.field || !this.colorStyles) {
            debugLog('PARTICLES', 'Cannot evolve particles - missing field or colorStyles');
            return;
        }

        // Clear buckets
        this.buckets.forEach(bucket => { bucket.length = 0; });

        this.particles.forEach(particle => {
            if (particle.age > MAX_PARTICLE_AGE) {
                const newParticle = this.field!.randomize();
                particle.x = newParticle.x;
                particle.y = newParticle.y;
                particle.age = newParticle.age;
            } else {
                const x = particle.x;
                const y = particle.y;
                const v = this.field!(x, y);
                const m = v[2];

                if (m === null) {
                    particle.age = MAX_PARTICLE_AGE;
                } else {
                    const xt = x + v[0];
                    const yt = y + v[1];

                    if (this.field!.isDefined(xt, yt)) {
                        particle.xt = xt;
                        particle.yt = yt;
                        this.buckets[this.colorStyles!.indexFor(m)].push(particle);
                    } else {
                        particle.x = xt;
                        particle.y = yt;
                    }
                }
            }
            particle.age += 1;
        });
    }

    /**
     * Draw particles to the 2D canvas
     * Uses normal blending - RenderSystem will handle inter-layer blending
     */
    private drawParticles(): void {
        if (!this.ctx2D || !this.colorStyles) {
            return;
        }

        // Draw each bucket with its color using normal blending
        this.ctx2D.lineWidth = 1.0;
        this.ctx2D.globalAlpha = 0.9;
        // Use default globalCompositeOperation ("source-over")
        // RenderSystem will handle how this canvas blends with others

        this.buckets.forEach((bucket, i) => {
            if (bucket.length > 0) {
                const color = this.colorStyles.colorAt ? this.colorStyles.colorAt(i) : this.colorStyles[i];
                this.ctx2D!.strokeStyle = color;

                this.ctx2D!.beginPath();
                bucket.forEach(particle => {
                    if (particle.xt !== undefined && particle.yt !== undefined) {
                        this.ctx2D!.moveTo(particle.x, particle.y);
                        this.ctx2D!.lineTo(particle.xt, particle.yt);
                        particle.x = particle.xt;
                        particle.y = particle.yt;
                        delete particle.xt;
                        delete particle.yt;
                    }
                });
                this.ctx2D!.stroke();
            }
        });

        // Reset alpha
        this.ctx2D.globalAlpha = 1.0;
    }

    // ===== UTILITY METHODS =====

    /**
     * Reset system state
     */
    private reset(): void {
        debugLog('PARTICLES', 'Resetting system state');

        // Clear WebGL canvas
        if (this.webglCanvas) {
            const ctx = this.webglCanvas.getContext('webgl') || this.webglCanvas.getContext('webgl2');
            if (ctx) {
                ctx.clearColor(0.0, 0.0, 0.0, 0.0);
                ctx.clear(ctx.COLOR_BUFFER_BIT | ctx.DEPTH_BUFFER_BIT);
            }
        }

        // Clear 2D canvas
        if (this.ctx2D) {
            this.ctx2D.clearRect(0, 0, this.canvas2D.width, this.canvas2D.height);
        }

        // Clear particle data
        this.field = null;
        this.particles = [];
        this.colorStyles = null;
        this.buckets = [];

        // Reset state
        this.useWebGL = false;
    }

    // ===== PUBLIC API (same as original) =====

    /**
     * Set external state provider (no longer subscribing to events)
     */
    setStateProvider(stateProvider: any): void {
        this.stateProvider = stateProvider;
        debugLog('PARTICLES', 'State provider set');
    }

    /**
     * Handle state changes that require re-rendering (not re-initialization)
     * Now called directly from Earth.ts centralized functions
     */
    public handleStateChange(): void {
        debugLog('PARTICLES', 'Handling state change - regenerating frame');
        this.regenerateParticles();
    }

    /**
     * Handle data changes that require re-initialization
     * Now called directly from Earth.ts centralized functions
     */
    public handleDataChange(): void {
        debugLog('PARTICLES', 'Handling data change - reinitializing system');
        this.initialize();
        this.regenerateParticles();
    }

    /**
     * Generate particles and emit result
     */
    private regenerateParticles(): void {
        const canvas = this.generateFrame();
        const config = this.stateProvider?.getConfig();

        const result: ParticleResult = {
            canvas: canvas,
            particleType: config?.particleType || 'off'
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

    // ===== ADDITIONAL PARTICLE-SPECIFIC METHODS =====

    /**
     * Check if the system is ready
     */
    isReady(): boolean {
        const config = this.stateProvider?.getConfig();
        if (!config || !config.particleType || config.particleType === 'off') {
            return true; // Ready when particles are disabled
        }

        return !!this.field && !!this.colorStyles;
    }

    /**
     * Get current particle count
     */
    getParticleCount(): number {
        return this.particles.length;
    }

    /**
     * Clean up resources
     */
    dispose(): void {
        this.reset();
        this.eventHandlers = {};
        this.stateProvider = null;
    }
}