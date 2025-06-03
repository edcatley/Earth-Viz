/**
 * particles - particle system for wind visualization
 * Class-based approach with internal data storage
 */

import { Utils } from './utils/Utils';
import { ViewportSize, Vector, Bounds, Globe } from './Globes';

// Constants
const MAX_PARTICLE_AGE = 100;
const PARTICLE_MULTIPLIER = 7;
const PARTICLE_REDUCTION = 0.75;
const INTENSITY_SCALE_STEP = 10;

// Debug logging
function debugLog(category: string, message: string, data?: any): void {
    if (data) {
        console.log(`[${category}] ${message}`, data);
    } else {
        console.log(`[${category}] ${message}`);
    }
}

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

// Event system for ParticleSystem
export interface ParticleSystemEvents {
    particlesEvolved: (buckets: Particle[][], colorStyles: any, globe: Globe) => void;
}

export class ParticleSystem {
    private field: Field | null = null;
    private particles: Particle[] = [];
    private colorStyles: any = null;
    private buckets: Particle[][] = [];
    private config: any;
    private products: any[] = [];
    private globe: Globe | null = null;
    private events: Partial<ParticleSystemEvents> = {};

    constructor(
        config: any,
        globe: Globe,
        mask: any,
        view: ViewportSize,
        products: any[]  // Accept products from parent instead of loading them
    ) {
        this.config = config;
        this.globe = globe;
        this.products = products;  // Store the products passed from parent
        
        const windProduct = this.products.find(p => p && p.field === "vector");
        if (windProduct) {
            this.initialize(windProduct, globe, mask, view);
        }
    }

    public on<K extends keyof ParticleSystemEvents>(event: K, handler: ParticleSystemEvents[K]): void {
        this.events[event] = handler;
    }

    private emit<K extends keyof ParticleSystemEvents>(event: K, ...args: Parameters<ParticleSystemEvents[K]>): void {
        const handler = this.events[event];
        if (handler) {
            (handler as any)(...args);
        }
    }

    public initialize(
        windProduct: any,
        globe: Globe,
        mask: any,
        view: ViewportSize
    ): void {
        debugLog('PARTICLES', 'Creating particle system from wind data');
        
        const bounds = globe.bounds(view);
        const velocityScale = bounds.height * (windProduct.particles?.velocityScale || 1/60000);
        
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
                    if (coord) {
                        const λ = coord[0], φ = coord[1];
                        if (isFinite(λ) && isFinite(φ)) {
                            const rawWind = windProduct.interpolate(λ, φ);
                            if (rawWind && rawWind[0] != null && rawWind[1] != null) {
                                windDataPixels++;                                
                                if (globe.projection) {
                                    const distortedWind = this.distort(globe.projection, λ, φ, x, y, velocityScale, rawWind);
                                    if (distortedWind) {
                                        // DISGUSTING FUDGE: Check if the distorted wind vector is reasonable
                                        const movementMagnitude = Math.sqrt(distortedWind[0] * distortedWind[0] + distortedWind[1] * distortedWind[1]);
                                        const MAX_REASONABLE_MOVEMENT = 40; // pixels per frame
                                        
                                        if (movementMagnitude <= MAX_REASONABLE_MOVEMENT) {
                                            wind = distortedWind;
                                            validPositions.push([x, y]);
                                        }
                                        // If movement is too large, don't add to validPositions - treat as invalid
                                    }
                                }
                            }
                        }
                    }
                }
                
                column[y+1] = column[y] = wind;
            }
            columns[x+1] = columns[x] = column;
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

    private distort(projection: any, λ: number, φ: number, x: number, y: number, scale: number, wind: Vector): Vector | null {
        var u = wind[0] * scale;
        var v = wind[1] * scale;
        var d = Utils.distortion(projection, λ, φ, x, y);

        if (!d || d.length < 4) {
            return null;
        }

        // Scale distortion vectors by u and v, then add.
        wind[0] = d[0] * u + d[2] * v;
        wind[1] = d[1] * u + d[3] * v;
        return wind;
    
    }

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

        field.isDefined = function(x: number, y: number): boolean {
            return field(x, y)[2] !== null;
        };

        return field;
    }

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

    // Fixed evolveParticles to use internal data properly
    evolveParticles(): void {
        if (!this.field || !this.colorStyles) return;

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

        this.emit('particlesEvolved', this.buckets, this.colorStyles, this.globe!);
    }

    private reportStatus(message: string): void {
        debugLog('PARTICLES', `Status: ${message}`);
        // Could emit events or call callbacks here if needed
    }

    private reportProgress(amount: number): void {
        debugLog('PARTICLES', `Progress: ${(amount * 100).toFixed(1)}%`);
        // Could emit events or call callbacks here if needed
    }

    // Getter methods for accessing internal data
    getParticles(): Particle[] {
        return this.particles;
    }

    getBuckets(): Particle[][] {
        return this.buckets;
    }

    getColorStyles(): any {
        return this.colorStyles;
    }

    getField(): Field | null {
        return this.field;
    }
}
