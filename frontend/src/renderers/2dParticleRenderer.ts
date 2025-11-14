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
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    
    // Particle system data
    private field: Field | null = null;
    private particleData: Float32Array | null = null; // [x, y, age, xt, yt, magnitude, ...]
    private particleCount = 0;

    // Wind field storage (flat typed array for efficiency)
    private windData: Float32Array | null = null;
    private windBounds: { x: number; y: number; width: number; height: number; spacing: number } | null = null;

    constructor() {
        this.canvas = document.createElement("canvas");
        this.ctx = this.canvas.getContext("2d")!;
    }

    /**
     * Initialize canvas size
     */
    public initializeCanvas(view: ViewportSize): void {
        this.canvas.width = view.width;
        this.canvas.height = view.height;
    }

    /**
     * Get the canvas for blitting
     */
    public getCanvas(): HTMLCanvasElement {
        return this.canvas;
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
     * Render particles to internal canvas
     */
    public render(globe: Globe, view: ViewportSize): void {
        if (!this.particleData) return;

        // Fade existing particle trails
        const bounds = globe.bounds(view);
        const prev = this.ctx.globalCompositeOperation;
        this.ctx.globalCompositeOperation = "destination-in";
        this.ctx.fillStyle = "rgba(0, 0, 0, 0.95)";
        this.ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
        this.ctx.globalCompositeOperation = prev;

        // Draw particles
        this.drawParticles();
    }

    /**
     * Draw particles to internal canvas
     */
    private drawParticles(): void {
        // Draw all particles with single color
        this.ctx.lineWidth = PARTICLE_LINE_WIDTH;
        this.ctx.globalAlpha = 0.9;
        this.ctx.strokeStyle = 'white';

        this.ctx.beginPath();

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
            this.ctx.moveTo(x, y);
            this.ctx.lineTo(xt, yt);

            // Update position for next frame
            this.particleData![idx] = xt;
            this.particleData![idx + 1] = yt;
        }

        this.ctx.stroke();

        // Reset alpha
        this.ctx.globalAlpha = 1.0;
    }

    /**
     * Clear the canvas
     */
    public clear(): void {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
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
