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
const PARTICLE_LINE_WIDTH = 1.0;  // Increased from 1.0 for better visibility

export interface ParticleResult {
    canvas: HTMLCanvasElement | null;  // Single canvas output
    particleType: string;
}

export class ParticleSystem {
    private webglParticleSystem: WebGLParticleSystem | null = null;
    private renderer2D: ParticleRenderer2D;

    // Particle count
    private particleCount = 0;

    // Wind field storage (flat typed array for efficiency)
    private windData: Float32Array | null = null;
    private windBounds: { x: number; y: number; width: number; height: number; spacing: number } | null = null;

    constructor() {
        this.renderer2D = new ParticleRenderer2D();
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
        } else {
            debugLog('PARTICLES', 'WebGL renderer initialized successfully');
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
     */
    public renderDirect(gl: WebGLRenderingContext): void {
        if (!this.webglParticleSystem) return;
        this.webglParticleSystem.render(gl);
        this.webglParticleSystem.evolve();
    }

    /**
     * Render directly to provided 2D context (2D path)
     */
    public render2DDirect(ctx: CanvasRenderingContext2D, globe: any, view: any): void {
        this.renderer2D.evolve();
        this.renderer2D.render(globe, view);
        ctx.drawImage(this.renderer2D.getCanvas(), 0, 0);
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

        this.clearSetup();

        if (!globe || !mask || !view || !particleProduct) {
            debugLog('PARTICLES', 'Setup skipped - missing required data');
            return;
        }

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
        if (this.webglParticleSystem && this.setupWebGL(view)) {
            debugLog('PARTICLES', 'WebGL setup successful');
            return;
        }

        // Fallback to 2D
        debugLog('PARTICLES', this.webglParticleSystem ? 'WebGL setup failed, using 2D' : 'WebGL not available, using 2D');
        this.setup2D(view, validPositions);
    }

    /**
     * Attempt WebGL setup - returns true if successful
     * Assumes particle field has already been initialized
     */
    private setupWebGL(view: ViewportSize): boolean {
        if (!this.webglParticleSystem) return false;

        try {
            if (!this.windData || !this.windBounds) {
                debugLog('PARTICLES', 'WebGL setup skipped - no wind data');
                return false;
            }

            if (!this.webglParticleSystem.setup(
                this.particleCount, 
                this.windData, 
                this.windBounds,
                view.width,
                view.height,
                PARTICLE_LINE_WIDTH /2  // Removed /2 division for proper line width
            )) {
                debugLog('PARTICLES', 'WebGL setup failed');
                return false;
            }

            // Free CPU wind data after GPU upload - no longer needed
            debugLog('PARTICLES', `Freeing wind data (${(this.windData.byteLength / 1048576).toFixed(2)} MB)`);
            this.windData = null;
            this.windBounds = null;

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

        if (!this.windData || !this.windBounds) {
            debugLog('PARTICLES', '2D setup failed - missing wind data');
            return;
        }

        this.renderer2D.initializeCanvas(view);
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
     * Clear current setup (but don't dispose renderers)
     */
    private clearSetup(): void {
        this.renderer2D.clear();
        this.renderer2D.dispose();

        // Clear particle data
        this.particleCount = 0;
        this.windData = null;
        this.windBounds = null;
    }



    /**
     * Handle rotation changes - clears 2D canvas
     */
    public handleRotation(): void {
        this.renderer2D.clear();
    }

    /**
     * Handle data changes - re-setup system
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
        debugLog('PARTICLES', 'Disposing ParticleSystem');

        if (this.webglParticleSystem) {
            this.webglParticleSystem.dispose();
            this.webglParticleSystem = null;
        }

        this.renderer2D.dispose();

        this.windData = null;
        this.windBounds = null;
    }
}