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
import { WebGLParticleSystem } from '../renderers/WebGLParticleSystem';
import { ParticleRenderer2D } from '../renderers/2dParticleRenderer';

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





    constructor() {
        // Create canvas for 2D fallback
        this.canvas2D = document.createElement("canvas");

        const ctx = this.canvas2D.getContext("2d");
        if (!ctx) {
            throw new Error("Failed to create 2D canvas context for particles");
        }
        this.ctx2D = ctx;

        // Create 2D renderer (always available)
        this.renderer2D = new ParticleRenderer2D();
        debugLog('PARTICLES', '2D renderer created');

        // webglParticleSystem will be created in initializeGL()
        debugLog('PARTICLES', 'ParticleSystem created');
    }

    /**
     * Initialize WebGL renderer with shared GL context
     */
    public initializeGL(gl: WebGLRenderingContext): void {
        if (this.webglParticleSystem) {
            debugLog('PARTICLES', 'WebGL renderer already initialized');
            return;
        }

        debugLog('PARTICLES', 'Initializing WebGL renderer with shared context');
        this.webglParticleSystem = new WebGLParticleSystem();
        const success = this.webglParticleSystem.initialize(gl);

        if (!success) {
            debugLog('PARTICLES', 'WebGL initialization failed');
            this.webglParticleSystem.dispose();
            this.webglParticleSystem = null;
            this.useWebGL = false;
        } else {
            debugLog('PARTICLES', 'WebGL renderer initialized successfully');
            // useWebGL will be set to true in setup() when data is ready
        }
    }

    /**
     * Check if this system can render directly to a shared GL context
     */
    public canRenderDirect(): boolean {
        return this.webglParticleSystem !== null;
    }

    /**
     * Render directly to provided GL context (fast path)
     * Note: render() before evolve() to avoid drawing teleport lines when particles respawn
     * No-op if no data has been setup yet
     */
    public renderDirect(gl: WebGLRenderingContext): void {
        if (!this.webglParticleSystem) {
            return; // No WebGL renderer
        }
        
        if (!this.useWebGL) {
            return; // No data setup yet
        }

        this.webglParticleSystem.render(gl);
        this.webglParticleSystem.evolve();
    }

    /**
     * Render directly to provided 2D context (2D path)
     */
    public render2DDirect(ctx: CanvasRenderingContext2D, globe: any, view: any): boolean {
        if (!this.renderer2D) {
            debugLog('PARTICLES', '2D render failed - no renderer');
            return false;
        }

        if (!globe || !view) {
            debugLog('PARTICLES', '2D render failed - missing state');
            return false;
        }

        try {
            // Evolve particles and render to provided context
            this.renderer2D.evolve();
            return this.renderer2D.render(ctx, globe, view);
        } catch (error) {
            debugLog('PARTICLES', '2D render error:', error);
            return false;
        }
    }

    // ===== MAIN PATTERN METHODS =====

    /**
     * Setup renderers with current data
     * Tries WebGL first (if available), falls back to 2D
     */
    public setup(
        globe: Globe,
        mask: any,
        view: ViewportSize,
        particleProduct: any,
        particleType: string
    ): void {
        debugLog('PARTICLES', 'Starting setup');

        // Clear any existing setup
        this.clearSetup();

        // Validate required data
        if (!globe || !mask || !view || !particleProduct) {
            debugLog('PARTICLES', 'Setup skipped - missing required data');
            return;
        }

        // Skip if particles are disabled
        if (!particleType || particleType === 'off') {
            debugLog('PARTICLES', 'Setup skipped - particles disabled');
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

        // Try WebGL first (if available)
        if (this.webglParticleSystem) {
            debugLog('PARTICLES', 'Attempting WebGL setup');
            if (this.setupWebGL(view)) {
                this.useWebGL = true;
                debugLog('PARTICLES', 'WebGL setup successful');
                return;
            }
            debugLog('PARTICLES', 'WebGL setup failed, falling back to 2D');
        } else {
            debugLog('PARTICLES', 'WebGL not available, using 2D');
        }

        // Fallback to 2D
        this.setup2D(view, validPositions);
        this.useWebGL = false;
        debugLog('PARTICLES', '2D setup complete');
    }

    /**
     * Attempt WebGL setup - returns true if successful
     * Assumes particle field has already been initialized
     */
    private setupWebGL(view: ViewportSize): boolean {
        if (!this.webglParticleSystem) {
            return false;
        }

        try {
            // Validate wind data is available
            if (!this.windData || !this.windBounds) {
                debugLog('PARTICLES', 'WebGL setup skipped - no wind data');
                return false;
            }

            // Setup WebGL particle system with data
            if (!this.webglParticleSystem.setup(
                this.particleCount, 
                this.windData, 
                this.windBounds,
                view.width,
                view.height,
                PARTICLE_LINE_WIDTH / 2
            )) {
                debugLog('PARTICLES', 'WebGL setup failed');
                return false;
            }

            // Free CPU wind data after GPU upload - no longer needed
            debugLog('PARTICLES', `Freeing wind data (${(this.windData.byteLength / 1048576).toFixed(2)} MB)`);
            this.windData = null;
            this.windBounds = null;

            debugLog('PARTICLES', 'WebGL setup successful');
            return true;

        } catch (error) {
            debugLog('PARTICLES', 'WebGL setup error:', error);
            return false;
        }
    }

    /**
     * Setup 2D rendering system
     */
    private setup2D(view: ViewportSize, validPositions: Array<[number, number]>): void {
        debugLog('PARTICLES', 'Setting up 2D rendering system');

        if (!this.renderer2D || !this.windData || !this.windBounds) {
            debugLog('PARTICLES', '2D setup failed - missing renderer or wind data');
            return;
        }

        // Ensure canvas is properly sized
        this.canvas2D.width = view.width;
        this.canvas2D.height = view.height;

        // Delegate to 2D renderer
        this.renderer2D.initialize(this.particleCount, this.windData, this.windBounds, validPositions);

        debugLog('PARTICLES', '2D setup complete');
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
     * Clear the particle canvas
     */
    private clearCanvas(): void {
        debugLog('PARTICLES', 'Clearing particle canvas');

        // Clear 2D canvas
        if (this.ctx2D) {
            this.ctx2D.clearRect(0, 0, this.canvas2D.width, this.canvas2D.height);
        }
    }

    /**
     * Clear current setup (but don't dispose renderers)
     */
    private clearSetup(): void {
        debugLog('PARTICLES', 'Clearing current setup');

        // Clear canvases
        this.clearCanvas();

        // Clear 2D renderer state
        if (this.renderer2D) {
            this.renderer2D.dispose();
        }

        // Clear particle data
        this.particleCount = 0;
        this.windData = null;
        this.windBounds = null;

        // Reset state
        this.useWebGL = false;
    }



    /**
     * Handle rotation changes that require re-rendering (not re-setup)
     * Now called directly from Earth.ts centralized functions
     */
    public handleRotation(): void {
        debugLog('PARTICLES', 'Handling rotation change');
        this.clearCanvas();
    }

    /**
     * Handle data changes that require re-setup
     * Now called directly from Earth.ts centralized functions
     */
    public handleDataChange(
        globe: Globe,
        mask: any,
        view: ViewportSize,
        particleProduct: any,
        particleType: string
    ): void {
        debugLog('PARTICLES', 'Handling data change - re-setting up system');

        this.setup(globe, mask, view, particleProduct, particleType);
    }





    /**
     * Clean up resources
     */
    dispose(): void {
        if (this.webglParticleSystem) {
            this.webglParticleSystem.dispose();
            this.webglParticleSystem = null;
        }

        if (this.renderer2D) {
            this.renderer2D.dispose();
            this.renderer2D = null;
        }

        this.windData = null;
        this.windBounds = null;
    }
}