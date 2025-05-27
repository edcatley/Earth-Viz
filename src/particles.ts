/**
 * particles - particle system for wind visualization
 * Class-based approach with internal data storage
 */

import * as d3 from 'd3';
import µ from './micro';
import { products } from './products';
import { ViewportSize, Vector, Bounds } from './types/types';
import { Globe } from './globes';

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
    overlay?: any;
}

export class ParticleSystem {
    private field: Field | null = null;
    private particles: Particle[] = [];
    private colorStyles: any = null;
    private buckets: Particle[][] = [];
    private config: any;
    private products: any[] = [];

    constructor(
        config: any,
        globe: Globe,
        mask: any,
        view: ViewportSize
    ) {
        this.config = config;
        this.reinitialize(config, globe, mask, view);
    }

    public async reinitialize(
        config: any,
        globe: Globe,
        mask: any,
        view: ViewportSize
    ): Promise<void> {
        this.config = config;
        await this.loadProducts();
        
        const windProduct = this.products.find(p => p && p.field === "vector");
        const overlayProduct = this.config.overlayType && this.config.overlayType !== "off" ? 
            this.products.find(p => p && p.field === "scalar" && p.type === this.config.overlayType) : null;
        
        if (windProduct) {
            this.initialize(windProduct, globe, mask, view, overlayProduct);
        }
    }

    private initialize(
        windProduct: any,
        globe: Globe,
        mask: any,
        view: ViewportSize,
        overlayProduct?: any
    ): void {
        debugLog('PARTICLES', 'Creating particle system from wind data');
        
        const bounds = globe.bounds(view);
        const velocityScale = bounds.height * (windProduct.particles?.velocityScale || 1/60000);
        
        debugLog('PARTICLES', `Bounds: x=${bounds.x}, y=${bounds.y}, width=${bounds.width}, height=${bounds.height}`);
        debugLog('PARTICLES', `Velocity scale: ${velocityScale}`);
        
        // Pre-compute wind vectors for all visible pixels
        const columns: any[] = [];
        const validPositions: Array<[number, number]> = [];
        const OVERLAY_ALPHA = Math.floor(0.4 * 255);
        
        let totalPixels = 0;
        let visiblePixels = 0;
        let windDataPixels = 0;
        
        for (let x = bounds.x; x <= bounds.xMax; x += 2) {
            const column: any[] = [];
            
            for (let y = bounds.y; y <= bounds.yMax; y += 2) {
                totalPixels++;
                let wind: Vector = [NaN, NaN, null];
                let overlayColor = [0, 0, 0, 0];
                
                if (mask.isVisible(x, y)) {
                    visiblePixels++;
                    const coord = globe.projection?.invert?.([x, y]);
                    if (coord) {
                        const λ = coord[0], φ = coord[1];
                        if (isFinite(λ)) {
                            const rawWind = windProduct.interpolate(λ, φ);
                            if (rawWind && rawWind[0] != null && rawWind[1] != null) {
                                windDataPixels++;
                                const u = rawWind[0] * velocityScale;
                                const v = rawWind[1] * velocityScale;
                                
                                if (globe.projection) {
                                    const distortion = µ.distortion(globe.projection, λ, φ, x, y);
                                    
                                    wind = [
                                        distortion[0] * u + distortion[2] * v,
                                        distortion[1] * u + distortion[3] * v,
                                        rawWind[2]
                                    ];
                                    
                                    validPositions.push([x, y]);
                                }
                            }
                            
                            // Generate overlay color if overlay product exists
                            if (overlayProduct && overlayProduct.scale) {
                                const overlayValue = overlayProduct.interpolate(λ, φ);
                                if (overlayValue != null) {
                                    overlayColor = overlayProduct.scale.gradient(overlayValue, OVERLAY_ALPHA);
                                }
                            }
                        }
                    }
                    
                    // Set overlay color in mask
                    if (mask.set) {
                        mask.set(x, y, overlayColor).set(x+1, y, overlayColor)
                            .set(x, y+1, overlayColor).set(x+1, y+1, overlayColor);
                    }
                }
                
                column[y+1] = column[y] = wind;
            }
            columns[x+1] = columns[x] = column;
        }
        
        debugLog('PARTICLES', `Pixel statistics: total=${totalPixels}, visible=${visiblePixels}, withWindData=${windDataPixels}`);
        debugLog('PARTICLES', `Valid positions for particles: ${validPositions.length}`);
        
        // Create field function
        this.field = this.createField(columns, bounds, mask, validPositions);
        
        // Setup color system
        this.colorStyles = windProduct.particles ? 
            µ.windIntensityColorScale(INTENSITY_SCALE_STEP, windProduct.particles.maxIntensity) : null;
        this.buckets = this.colorStyles ? this.colorStyles.map(() => []) : [];
        
        // Initialize particles
        this.initializeParticles(bounds);
        
        debugLog('PARTICLES', `Created ${this.particles.length} particles`);
    }

    private createField(columns: any[][], bounds: Bounds, mask: any, validPositions: Array<[number, number]>): Field {
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

        field.overlay = {
            scale: (overlayType: string) => (value: number) => [255, 255, 255] as const,
            interpolate: (x: number, y: number) => null
        };

        // Store overlay imageData if available
        if (mask.overlayImageData) {
            field.overlay = mask.overlayImageData;
        }

        return field;
    }

    private initializeParticles(bounds: Bounds): void {
        let particleCount = Math.round(bounds.width * PARTICLE_MULTIPLIER);
        if (µ.isMobile()) {
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
    }

    private reportStatus(message: string): void {
        debugLog('PARTICLES', `Status: ${message}`);
        // Could emit events or call callbacks here if needed
    }

    private reportProgress(amount: number): void {
        debugLog('PARTICLES', `Progress: ${(amount * 100).toFixed(1)}%`);
        // Could emit events or call callbacks here if needed
    }

    private async loadProducts(): Promise<void> {
        debugLog('APP', 'Loading products');
        this.reportStatus("Loading weather data...");
        
        try {
            // Use the products module to get weather data
            debugLog('APP', 'Calling products.productsFor with config:', this.config);
            const productPromises = products.productsFor(this.config);
            debugLog('APP', 'Product promises received:', productPromises.length);
            
            this.products = await Promise.all(productPromises.filter(p => p !== null));
            debugLog('APP', 'Products resolved:', this.products.length);
            
            // Load the actual data
            if (this.products.length > 0) {
                debugLog('APP', 'Loading product data...');
                for (const product of this.products) {
                    if (product && product.load) {
                        debugLog('APP', 'Loading product:', product.type || 'unknown');
                        await product.load({ requested: false });
                        debugLog('APP', 'Product loaded successfully:', product.type || 'unknown');
                    }
                }
            } else {
                debugLog('APP', 'No products found to load');
            }
            
            this.reportProgress(1.0);
            debugLog('APP', 'Products loaded successfully', this.products.length);
            
        } catch (error) {
            debugLog('APP', 'Failed to load products', error);
            // Don't fail completely if weather data fails
            this.products = [];
        }
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
