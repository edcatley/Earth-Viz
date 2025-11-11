// 2D Particle Renderer
// Handles rendering of particles in 2D mode

import { Globe, ViewportSize, Vector } from '../core/Globes';

// Constants
const MAX_PARTICLE_AGE = 50;
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

export class ParticleRenderer2D {
    // Particle system data
    private field: Field | null = null;
    private particleData: Float32Array | null = null; // [x, y, age, xt, yt, magnitude, ...]
    private particleCount = 0;

    // Wind field storage (flat typed array for efficiency)
    private windData: Float32Array | null = null;
    private windBounds: { x: number; y: number; width: number; height: number; spacing: number } | null = null;

    constructor() {
        // Lightweight constructor
    }

    /**
     * Initialize the renderer with particle count and wind field data
     */
    public initialize(
        particleCount: number,
        windData: Float32Array,
        windBounds: { x: number; y: number; width: number; height: number; spacing: number },
        validPositions: Array<[number, number]>
    ): void {
        this.particleCount = particleCount;
        this.windData = windData;
        this.windBounds = windBounds;

        // Create field function
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

        console.log(`[2D_PARTICLES] Initialized with ${this.particleCount} particles`);
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
     * Evolve particles for one frame
     */
    public evolve(): void {
        if (!this.field || !this.particleData) {
            console.error('[2D_PARTICLES] Cannot evolve particles - missing field');
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
     * Render particles to the 2D canvas
     */
    public render(ctx: CanvasRenderingContext2D, globe: Globe, view: ViewportSize): boolean {
        if (!this.particleData) {
            console.error('[2D_PARTICLES] Render failed - no particle data');
            return false;
        }

        try {
            // Fade existing particle trails
            const bounds = globe.bounds(view);
            const prev = ctx.globalCompositeOperation;
            ctx.globalCompositeOperation = "destination-in";
            ctx.fillStyle = "rgba(0, 0, 0, 0.95)";
            ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
            ctx.globalCompositeOperation = prev;

            // Draw particles
            this.drawParticles(ctx);

            return true;
        } catch (error) {
            console.error('[2D_PARTICLES] Render error:', error);
            return false;
        }
    }

    /**
     * Draw particles to the 2D canvas
     */
    private drawParticles(ctx: CanvasRenderingContext2D): void {
        // Draw all particles with single color
        ctx.lineWidth = PARTICLE_LINE_WIDTH;
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = 'white';

        ctx.beginPath();

        for (let i = 0; i < this.particleCount; i++) {
            const idx = i * 6;
            const x = this.particleData![idx];
            const y = this.particleData![idx + 1];
            const age = this.particleData![idx + 2];
            const xt = this.particleData![idx + 3];
            const yt = this.particleData![idx + 4];

            // Skip particles that are about to respawn (age >= 29)
            // This prevents drawing long lines from death position to random new position
            if (age >= MAX_PARTICLE_AGE - 1) {
                continue;
            }

            // Draw line from current to next position
            ctx.moveTo(x, y);
            ctx.lineTo(xt, yt);

            // Update position for next frame
            this.particleData![idx] = xt;
            this.particleData![idx + 1] = yt;
        }

        ctx.stroke();

        // Reset alpha
        ctx.globalAlpha = 1.0;
    }

    /**
     * Clear the canvas
     */
    public clear(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    /**
     * Dispose of resources
     */
    public dispose(): void {
        this.field = null;
        this.particleData = null;
        this.particleCount = 0;
        this.windData = null;
        this.windBounds = null;
    }
}
