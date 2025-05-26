/**
 * earth-modern - modernized earth visualization using existing modules
 * 
 * This version properly uses globes.ts, micro.ts, products.ts and the
 * well-designed interfaces from types.ts
 */

import * as d3 from 'd3';
import { globes } from './globes';
import { products } from './products';
import µ from './micro';
import { 
    Globe, 
    ViewportSize, 
    ConfigurationOptions, 
    DisplayOptions, 
    Field, 
    Vector,
    Point,
    GeoPoint,
    Bounds
} from './types/types';

// Debug logging
const DEBUG = true;
function debugLog(section: string, message: string, data?: any): void {
    if (DEBUG) {
        console.log(`[EARTH-MODERN] ${section}: ${message}`, data || '');
    }
}

// Global topojson declaration
declare global {
    interface Window {
        topojson: {
            feature: (topology: any, object: any) => any;
        };
    }
}

// ===== CONSTANTS =====
const MAX_PARTICLE_AGE = 100;
const PARTICLE_MULTIPLIER = 7;
const PARTICLE_REDUCTION = 0.75;
const FRAME_RATE = 40;
const PARTICLE_LINE_WIDTH = 1.0;
const INTENSITY_SCALE_STEP = 10;

class EarthModernApp {
    private config: any; // Use the actual configuration object from µ.buildConfiguration
    private display: DisplayOptions;
    private globe: Globe | null = null;
    private mesh: any = null;
    private field: any = null;
    private products: any[] = [];
    
    // Animation
    private particles: Array<{age: number; x: number; y: number; xt?: number; yt?: number}> = [];
    private animationId: number | null = null;
    private canvas: HTMLCanvasElement | null = null;
    private context: CanvasRenderingContext2D | null = null;
    private colorStyles: string[] & { indexFor: (m: number) => number } | null = null;
    private buckets: Array<Array<{age: number; x: number; y: number; xt?: number; yt?: number}>> = [];

    constructor() {
        debugLog('APP', 'Initializing EarthModernApp');
        
        // Use proper configuration system from µ
        this.config = µ.buildConfiguration(globes.keys(), products.overlayTypes);
        
        // Add required parameters for products system
        this.config.param = "wind";
        this.config.surface = "surface";
        this.config.level = "level";
        this.config.date = "current";
        this.config.hour = "0000";
        
        // Initialize display options properly
        const view = µ.view();
        this.display = {
            width: view.width,
            height: view.height,
            projection: null as any, // Will be set when globe is created
            orientation: [0, 0, 0]
        };
        
        debugLog('APP', 'App initialized', { config: this.config, display: this.display });
    }

    async start(): Promise<void> {
        debugLog('APP', 'Starting application');
        
        try {
            this.setupReporting();
            this.setupUI();
            this.setupInput();
            
            // Load initial data
            await this.loadMesh();
            this.createGlobe();
            await this.loadProducts();
            
            // Setup rendering
            this.setupCanvas();
            this.render();
            
            // Start field and animation
            if (this.products.length > 0) {
                await this.buildField();
                if (this.config.animate !== false) {
                    this.startAnimation();
                }
            }
            
            this.reportStatus("Ready");
            debugLog('APP', 'Application started successfully');
            
        } catch (error) {
            debugLog('APP', 'Failed to start application', error);
            this.reportError(error as Error);
            throw error;
        }
    }

    private setupReporting(): void {
        debugLog('APP', 'Setting up reporting');
        // The reporting is handled by µ and DOM elements
    }

    private reportStatus(message: string): void {
        debugLog('APP', `Status: ${message}`);
        d3.select("#status").text(message);
    }

    private reportError(error: Error): void {
        debugLog('APP', `Error: ${error.message}`, error);
        d3.select("#status").classed("bad", true).text(error.message);
    }

    private reportProgress(amount: number): void {
        debugLog('APP', `Progress: ${(amount * 100).toFixed(1)}%`);
        const total = 22; // Length of progress bar
        if (0 <= amount && amount < 1) {
            const completed = "▪".repeat(Math.ceil(amount * total));
            const remaining = "▫".repeat(total - Math.ceil(amount * total));
            d3.select("#progress").classed("invisible", false).text(completed + remaining);
        } else {
            d3.select("#progress").classed("invisible", true).text("");
        }
    }

    private setupUI(): void {
        debugLog('APP', 'Setting up UI');
        
        // Set viewport dimensions
        d3.selectAll(".fill-screen")
            .attr("width", this.display.width)
            .attr("height", this.display.height);

        // Handle device-specific styling
        if (µ.isFF()) {
            d3.select("#display").classed("firefox", true);
        }
        
        if ("ontouchstart" in document.documentElement) {
            d3.select(document).on("touchstart", function() {});
        } else {
            d3.select(document.documentElement).classed("no-touch", true);
        }

        // Set sponsor link target for iframes
        if (µ.isEmbeddedInIFrame()) {
            d3.select("#sponsor-link").attr("target", "_new");
        }
    }

    private setupInput(): void {
        debugLog('APP', 'Setting up input handling');
        
        const display = d3.select("#display");
        if (display.empty()) {
            debugLog('APP', 'Warning: #display element not found');
            return;
        }

        // Setup zoom behavior
        const zoom = d3.zoom<HTMLElement, unknown>()
            .scaleExtent([50, 3000])
            .on("start", (event) => this.handleZoomStart(event))
            .on("zoom", (event) => this.handleZoom(event))
            .on("end", (event) => this.handleZoomEnd(event));

        (display as any).call(zoom);

        // Setup menu button
        d3.select("#show-menu").on("click", () => {
            if (µ.isEmbeddedInIFrame()) {
                window.open("http://earth.nullschool.net/" + window.location.hash, "_blank");
            } else {
                d3.select("#menu").classed("invisible", !d3.select("#menu").classed("invisible"));
            }
        });

        // Setup location button
        d3.select("#show-location").on("click", () => {
            this.handleLocationRequest();
        });
    }

    private operation: any = null;

    private handleZoomStart(event: d3.D3ZoomEvent<HTMLElement, unknown>): void {
        debugLog('INPUT', 'Zoom start');
        if (!this.globe) return;

        const mouse = d3.pointer(event, event.target as any) as Point;
        const scale = event.transform.k;
        
        this.operation = {
            type: "click",
            startMouse: mouse,
            startScale: scale,
            manipulator: this.globe.manipulator(mouse, scale)
        };
    }

    private handleZoom(event: d3.D3ZoomEvent<HTMLElement, unknown>): void {
        if (!this.operation) return;

        const mouse = d3.pointer(event, event.target as any) as Point;
        const scale = event.transform.k;
        
        // Determine operation type
        const distanceMoved = µ.distance(mouse, this.operation.startMouse);
        if (scale !== this.operation.startScale) {
            this.operation.type = "zoom";
        } else if (distanceMoved > 4) {
            this.operation.type = "drag";
        }

        // Apply manipulation
        if (this.operation.manipulator) {
            this.operation.manipulator.move(
                this.operation.type === "zoom" ? null : mouse,
                scale
            );
        }

        // Update display projection
        if (this.globe?.projection) {
            this.display.projection = this.globe.projection;
        }

        // Re-render immediately during manipulation
        this.render();
    }

    private handleZoomEnd(event: d3.D3ZoomEvent<HTMLElement, unknown>): void {
        debugLog('INPUT', 'Zoom end');
        
        if (!this.operation) return;

        if (this.operation.manipulator) {
            this.operation.manipulator.end();
        }

        if (this.operation.type === "click") {
            this.handleClick();
        }

        this.operation = null;
        
        // Update configuration and regenerate field after manipulation
        this.updateConfigurationFromGlobe();
        this.buildField(); // Regenerate field with new projection
    }

    private handleClick(): void {
        if (!this.globe?.projection?.invert || !this.operation) return;
        
        try {
            const coord = this.globe.projection.invert(this.operation.startMouse) as GeoPoint;
            if (coord) {
                debugLog('INPUT', 'Clicked coordinates', coord);
                this.drawLocationMark(this.operation.startMouse, coord);
            }
        } catch (error) {
            debugLog('INPUT', 'Error handling click', error);
        }
    }

    private handleLocationRequest(): void {
        debugLog('INPUT', 'Location request');
        
        if (!navigator.geolocation) {
            this.reportError(new Error("Geolocation not available"));
            return;
        }

        this.reportStatus("Finding your location...");
        
        navigator.geolocation.getCurrentPosition(
            (pos) => this.handleLocationFound(pos),
            (error) => {
                debugLog('INPUT', 'Geolocation error', error);
                this.reportError(new Error("Unable to find your location"));
            }
        );
    }

    private handleLocationFound(pos: GeolocationPosition): void {
        debugLog('INPUT', 'Location found', pos.coords);
        
        if (!this.globe) return;

        const coord: GeoPoint = [pos.coords.longitude, pos.coords.latitude];
        const rotate = this.globe.locate(coord);
        
        if (rotate && this.globe.projection) {
            this.globe.projection.rotate(rotate);
            this.display.projection = this.globe.projection;
            this.display.orientation = rotate;
            this.render();
            this.updateConfigurationFromGlobe();
        }
        
        this.reportStatus("Ready");
    }

    private async loadMesh(): Promise<void> {
        debugLog('APP', 'Loading mesh data');
        this.reportStatus("Loading map data...");
        
        try {
            const topology = µ.isMobile() ? 
                "/data/earth-topo-mobile.json?v2" : 
                "/data/earth-topo.json?v2";
            
            const topo = await µ.loadJson(topology);
            const o = topo.objects;
            
            this.mesh = {
                coastLo: window.topojson.feature(topo, µ.isMobile() ? o.coastline_tiny : o.coastline_110m),
                coastHi: window.topojson.feature(topo, µ.isMobile() ? o.coastline_110m : o.coastline_50m),
                lakesLo: window.topojson.feature(topo, µ.isMobile() ? o.lakes_tiny : o.lakes_110m),
                lakesHi: window.topojson.feature(topo, µ.isMobile() ? o.lakes_110m : o.lakes_50m)
            };
            
            this.reportProgress(0.33);
            debugLog('APP', 'Mesh loaded successfully');
            
        } catch (error) {
            debugLog('APP', 'Failed to load mesh', error);
            throw new Error("Failed to load map data");
        }
    }

    private createGlobe(): void {
        debugLog('APP', 'Creating globe');
        this.reportStatus("Building globe...");
        
        try {
            // Use the proper globes module
            const projectionName = this.config.projection || 'orthographic';
            const globeBuilder = globes.get(projectionName);
            if (!globeBuilder) {
                throw new Error(`Unknown projection: ${projectionName}`);
            }
            
            const view: ViewportSize = { width: this.display.width, height: this.display.height };
            this.globe = globeBuilder();
            
            // Update display with globe's projection
            if (this.globe.projection) {
                this.display.projection = this.globe.projection;
            }
            
            // Set orientation if specified
            const orientation = this.config.orientation;
            if (orientation && this.globe) {
                this.globe.orientation(orientation, view);
                const orientationArray = orientation.split(',').map(Number);
                this.display.orientation = [orientationArray[0] || 0, orientationArray[1] || 0, orientationArray[2] || 0];
            }
            
            this.reportProgress(0.67);
            debugLog('APP', 'Globe created successfully');
            
        } catch (error) {
            debugLog('APP', 'Failed to create globe', error);
            throw error;
        }
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

    private render(): void {
        debugLog('RENDER', 'Rendering');
        
        if (!this.globe || !this.mesh) {
            debugLog('RENDER', 'Cannot render - missing globe or mesh');
            return;
        }

        try {
            // Clear previous render
            const mapNode = d3.select("#map").node();
            const foregroundNode = d3.select("#foreground").node();
            if (mapNode) (mapNode as Element).replaceChildren();
            if (foregroundNode) (foregroundNode as Element).replaceChildren();

            // Setup SVG
            const mapSvg = d3.select("#map");
            const foregroundSvg = d3.select("#foreground");
            
            // Let the globe define its map structure
            this.globe.defineMap(mapSvg, foregroundSvg);
            
            // Render mesh data
            const path = d3.geoPath(this.globe.projection);
            
            mapSvg.select(".coastline")
                .datum(this.mesh.coastLo)
                .attr("d", path);
                
            mapSvg.select(".lakes")
                .datum(this.mesh.lakesLo)
                .attr("d", path);
            
            debugLog('RENDER', 'Render completed');
            
        } catch (error) {
            debugLog('RENDER', 'Render failed', error);
        }
    }

    private async buildField(): Promise<void> {
        debugLog('FIELD', 'Building field');
        
        if (!this.globe || this.products.length === 0) {
            debugLog('FIELD', 'Cannot build field - missing globe or products');
            return;
        }

        try {
            this.reportStatus("Generating wind field...");
            
            // Get the wind product
            const windProduct = this.products.find(p => p && p.field === "vector");
            if (!windProduct) {
                debugLog('FIELD', 'No wind product found');
                return;
            }

            // Create mask and pre-compute field like the original
            const mask = this.createMask();
            if (!mask) {
                debugLog('FIELD', 'Failed to create mask');
                return;
            }

            const view: ViewportSize = { width: this.display.width, height: this.display.height };
            const bounds = this.globe.bounds(view);
            const velocityScale = bounds.height * (windProduct.particles?.velocityScale || 1/60000);
            
            debugLog('FIELD', `Pre-computing field with velocity scale: ${velocityScale}`);
            
            // Pre-compute wind vectors for all visible pixels (like original interpolateField)
            const columns: any[] = [];
            const validPositions: Array<[number, number]> = [];  // Collect valid positions
            
            for (let x = bounds.x; x <= bounds.xMax; x += 2) {
                const column: any[] = [];
                
                for (let y = bounds.y; y <= bounds.yMax; y += 2) {
                    let wind: Vector = [NaN, NaN, null];
                    
                    if (mask.isVisible(x, y)) {
                        const coord = this.globe.projection?.invert?.([x, y]);
                        if (coord) {
                            const λ = coord[0], φ = coord[1];
                            if (Number.isFinite(λ)) {
                                // Skip coordinates too close to projection singularities
                                if (Math.abs(λ) > 89|| Math.abs(φ) > 179) {
                                    // Skip this coordinate - too close to singularity
                                } else {
                                    const rawWind = windProduct.interpolate(λ, φ);
                                    if (rawWind && rawWind[0] != null && rawWind[1] != null) {
                                        // Apply distortion like the original distort function
                                        const u = rawWind[0] * velocityScale;
                                        const v = rawWind[1] * velocityScale;
                                        
                                        if (this.globe.projection) {
                                            const distortion = µ.distortion(this.globe.projection, λ, φ, x, y);
                                            
                                            wind = [
                                                distortion[0] * u + distortion[2] * v,
                                                distortion[1] * u + distortion[3] * v,
                                                rawWind[2]
                                            ];
                                            
                                            // This position has valid wind data - add to valid positions
                                            validPositions.push([x, y]);
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
            
            debugLog('FIELD', `Collected ${validPositions.length} valid positions for particle spawning`);
            
            // Create field function that looks up pre-computed values
            this.field = this.createPrecomputedField(columns, bounds, mask, validPositions);
            
            // Setup color system like original earth.js
            if (windProduct && windProduct.particles) {
                this.colorStyles = µ.windIntensityColorScale(INTENSITY_SCALE_STEP, windProduct.particles.maxIntensity);
                this.buckets = this.colorStyles.map(() => []);
                debugLog('FIELD', `Color system initialized with ${this.colorStyles.length} color buckets, maxIntensity: ${windProduct.particles.maxIntensity}`);
            }
            
            this.initializeParticles();
            
            debugLog('FIELD', 'Field built successfully');
            
        } catch (error) {
            debugLog('FIELD', 'Failed to build field', error);
        }
    }

    private createPrecomputedField(columns: any[][], bounds: Bounds, mask: any, validPositions: Array<[number, number]>): any {
        const NULL_WIND_VECTOR: Vector = [NaN, NaN, null];
        
        function field(x: number, y: number): Vector {
            const column = columns[Math.round(x)];
            return column && column[Math.round(y)] || NULL_WIND_VECTOR;
        }

        field.randomize = (): { x: number; y: number; age: number } => {
            if (validPositions.length === 0) {
                debugLog('FIELD', 'ERROR: No valid positions available for particle spawning!');
                return { x: bounds.x, y: bounds.y, age: Math.random() * MAX_PARTICLE_AGE };
            }
            
            // Pick a random valid position - guaranteed to be valid!
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

        return field;
    }

    private setupCanvas(): void {
        debugLog('ANIMATION', 'Setting up canvas');
        
        this.canvas = d3.select("#animation").node() as HTMLCanvasElement;
        if (this.canvas) {
            this.context = this.canvas.getContext("2d");
            this.canvas.width = this.display.width;
            this.canvas.height = this.display.height;
        }
    }

    private initializeParticles(): void {
        debugLog('ANIMATION', 'Initializing particles');
        
        if (!this.field) return;

        // Use original particle count formula: bounds.width * PARTICLE_MULTIPLIER
        const bounds = this.globe?.bounds({ width: this.display.width, height: this.display.height });
        if (!bounds) return;
        
        let particleCount = Math.round(bounds.width * PARTICLE_MULTIPLIER);
        if (µ.isMobile()) {
            particleCount *= PARTICLE_REDUCTION;
        }
        
        this.particles = [];
        for (let i = 0; i < particleCount; i++) {
            const particle = this.field.randomize();
            this.particles.push({
                age: particle.age,
                x: particle.x,
                y: particle.y
            });
        }
        
        debugLog('ANIMATION', `Initialized ${particleCount} particles (bounds.width: ${bounds.width})`);
    }

    private startAnimation(): void {
        debugLog('ANIMATION', 'Starting animation');
        
        if (this.animationId || !this.field || !this.context) {
            return;
        }
        
        this.animate();
    }

    private stopAnimation(): void {
        debugLog('ANIMATION', 'Stopping animation');
        
        if (this.animationId) {
            clearTimeout(this.animationId);
            this.animationId = null;
        }
    }

    private animate(): void {
        try {
            this.evolveParticles();
            this.drawParticles();
            
            this.animationId = setTimeout(() => {
                if (this.animationId) {
                    this.animate();
                }
            }, FRAME_RATE) as any;
            
        } catch (error) {
            debugLog('ANIMATION', 'Animation error', error);
            this.stopAnimation();
        }
    }

    private evolveParticles(): void {
        if (!this.field || !this.colorStyles) return;

        // Clear buckets like original
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
                const v = this.field!(x, y);  // vector at current position
                const m = v[2];  // magnitude
                
                // Debug: Check for extreme wind vectors
                if (Math.abs(v[0]) > 200 || Math.abs(v[1]) > 200) {
                    debugLog('PARTICLE', `EXTREME WIND VECTOR at (${x.toFixed(1)}, ${y.toFixed(1)}): [${v[0].toFixed(2)}, ${v[1].toFixed(2)}, ${m}]`);
                }
                
                if (m === null) {
                    particle.age = MAX_PARTICLE_AGE;  // particle has escaped the grid, never to return...
                } else {
                    const xt = x + v[0];
                    const yt = y + v[1];
                    
                    // Debug: Check for large distance jumps
                    const distance = Math.sqrt((xt - x) * (xt - x) + (yt - y) * (yt - y));
                    if (distance > 200) {
                        debugLog('PARTICLE', `LARGE JUMP: (${x.toFixed(1)}, ${y.toFixed(1)}) → (${xt.toFixed(1)}, ${yt.toFixed(1)}) distance: ${distance.toFixed(1)}, wind: [${v[0].toFixed(2)}, ${v[1].toFixed(2)}]`);
                    }
                    
                    if (this.field!.isDefined(xt, yt)) {
                        // Path from (x,y) to (xt,yt) is visible, so add this particle to the appropriate draw bucket.
                        particle.xt = xt;
                        particle.yt = yt;
                        this.buckets[this.colorStyles!.indexFor(m)].push(particle);
                    } else {
                        // Particle isn't visible, but it still moves through the field.
                        particle.x = xt;
                        particle.y = yt;
                    }
                }
                particle.age += 1;
            }
        });
    }

    private drawParticles(): void {
        if (!this.context || !this.colorStyles) return;

        // Get bounds for fade effect
        const bounds = this.globe?.bounds({ width: this.display.width, height: this.display.height });
        if (!bounds) return;

        // Fade existing particle trails like original
        const prev = this.context.globalCompositeOperation;
        this.context.globalCompositeOperation = "destination-in";
        this.context.fillStyle = µ.isFF() ? "rgba(0, 0, 0, 0.95)" : "rgba(0, 0, 0, 0.97)";  // FF Mac alpha behaves oddly
        this.context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
        this.context.globalCompositeOperation = prev;

        // Draw new particle trails using buckets like original
        this.context.lineWidth = PARTICLE_LINE_WIDTH;
        
        this.buckets.forEach((bucket, i) => {
            if (bucket.length > 0) {
                this.context!.beginPath();
                this.context!.strokeStyle = this.colorStyles![i];  // Use color from bucket index
                bucket.forEach(particle => {
                    if (particle.xt !== undefined && particle.yt !== undefined) {
                        this.context!.moveTo(particle.x, particle.y);
                        this.context!.lineTo(particle.xt, particle.yt);
                        particle.x = particle.xt;
                        particle.y = particle.yt;
                        delete particle.xt;
                        delete particle.yt;
                    }
                });
                this.context!.stroke();
            }
        });
    }

    private drawLocationMark(point: Point, coord: GeoPoint): void {
        debugLog('RENDER', 'Drawing location mark', {point, coord});
        
        const foregroundSvg = d3.select("#foreground");
        foregroundSvg.selectAll(".location-mark").remove();
        
        foregroundSvg.append("circle")
            .attr("class", "location-mark")
            .attr("cx", point[0])
            .attr("cy", point[1])
            .attr("r", 5)
            .style("fill", "red")
            .style("stroke", "white")
            .style("stroke-width", 2);
    }

    private updateConfigurationFromGlobe(): void {
        if (!this.globe) return;
        
        const orientation = this.globe.orientation();
        if (typeof orientation === 'string') {
            this.config.orientation = orientation;
            const orientationArray = orientation.split(',').map(Number);
            this.display.orientation = [orientationArray[0] || 0, orientationArray[1] || 0, orientationArray[2] || 0];
        }
    }

    private createMask(): any {
        if (!this.globe) return null;

        debugLog('MASK', 'Creating visibility mask');
        
        // Create a detached canvas for the mask
        const canvas = document.createElement("canvas");
        canvas.width = this.display.width;
        canvas.height = this.display.height;
        
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        
        // Let the globe define its mask polygon
        const context = this.globe.defineMask(ctx);
        if (!context) return null;
        
        context.fillStyle = "rgba(255, 0, 0, 1)";
        context.fill();

        const imageData = context.getImageData(0, 0, this.display.width, this.display.height);
        const data = imageData.data;
        
        return {
            imageData: imageData,
            isVisible: (x: number, y: number): boolean => {
                const i = (y * this.display.width + x) * 4;
                return data[i + 3] > 0;  // non-zero alpha means pixel is visible
            }
        };
    }
}

// ===== MAIN INITIALIZATION =====
async function startEarthModern(): Promise<void> {
    debugLog('MAIN', 'Starting Earth Modern application');
    
    try {
        const app = new EarthModernApp();
        await app.start();
        
        debugLog('MAIN', 'Application started successfully');
        console.log('Earth Modern: Application started successfully');
        
    } catch (error) {
        debugLog('MAIN', 'Failed to start application', error);
        console.error('Earth Modern: Failed to start application:', error);
    }
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startEarthModern);
} else {
    startEarthModern();
} 