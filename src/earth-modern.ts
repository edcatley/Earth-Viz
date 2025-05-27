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
import { MenuSystem } from './MenuSystem';
import { ParticleSystem } from './particles';
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
    private menuSystem: MenuSystem;
    private particleSystem: ParticleSystem | null = null;
    
    // Animation
    private particles: Array<{age: number; x: number; y: number; xt?: number; yt?: number}> = [];
    private animationId: number | null = null;
    private canvas: HTMLCanvasElement | null = null;
    private context: CanvasRenderingContext2D | null = null;
    private colorStyles: string[] & { indexFor: (m: number) => number } | null = null;
    private buckets: Array<Array<{age: number; x: number; y: number; xt?: number; yt?: number}>> = [];
    
    // Overlay system
    private overlayCanvas: HTMLCanvasElement | null = null;
    private overlayContext: CanvasRenderingContext2D | null = null;
    private scaleCanvas: HTMLCanvasElement | null = null;
    private scaleContext: CanvasRenderingContext2D | null = null;
    private overlayGrid: any = null;

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
        this.config.overlayType = "off"; // Start with no overlay
        
        // Initialize display options properly
        const view = µ.view();
        this.display = {
            width: view.width,
            height: view.height,
            projection: null as any, // Will be set when globe is created
            orientation: [0, 0, 0]
        };
        
        // Initialize MenuSystem
        this.menuSystem = new MenuSystem(this.config);
        
        debugLog('APP', 'App initialized', { config: this.config, display: this.display });
    }

    async start(): Promise<void> {
        debugLog('APP', 'Starting application');
        
        try {
            this.setupReporting();
            this.setupUI();
            this.setupInput();
            this.setupMenuSystem();
            
            // Load initial data
            await this.loadMesh();
            this.createGlobe();
            
            // Create and initialize particle system
            if (this.globe) {
                const mask = this.createMask();
                const view: ViewportSize = { width: this.display.width, height: this.display.height };
                this.particleSystem = new ParticleSystem(this.config, this.globe, mask, view);
            }
            
            // Setup rendering
            this.setupCanvas();
            this.render();
            
            // Start animation if we have a particle system
            if (this.particleSystem && this.config.animate !== false) {
                this.startAnimation();
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

    private setupMenuSystem(): void {
        debugLog('APP', 'Setting up menu system');
        
        // Set up callbacks for menu interactions
        this.menuSystem.setCallbacks(
            () => this.handleConfigChange(),
            () => this.render()
        );
        
        // Set up all menu event handlers
        this.menuSystem.setupMenuHandlers();
        
        // Update menu state to match current config
        this.menuSystem.updateMenuState();
        
        debugLog('APP', 'Menu system setup complete');
    }

    private handleConfigChange(): void {
        debugLog('APP', 'Configuration changed', this.config);
        
        // Update globe if projection changed
        if (this.globe && this.config.projection) {
            // Stop animation and clear canvas immediately when projection changes
            this.stopAnimation();
            this.clearCanvas();
            
            this.createGlobe();
            this.render();
            
            // Reinitialize particle system with new projection
            if (this.particleSystem) {
                const mask = this.createMask();
                const view: ViewportSize = { width: this.display.width, height: this.display.height };
                this.particleSystem.reinitialize(this.config, this.globe, mask, view).then(() => {
                    if (this.config.animate !== false) {
                        this.startAnimation();
                    }
                }).catch((error: any) => {
                    debugLog('APP', 'Failed to reinitialize particle system after projection change', error);
                });
            }
        }
        
        // Reload products if parameters changed
        if (this.config.param || this.config.surface || this.config.level) {
            if (this.particleSystem && this.globe) {
                const mask = this.createMask();
                const view: ViewportSize = { width: this.display.width, height: this.display.height };
                this.particleSystem.reinitialize(this.config, this.globe, mask, view).then(() => {
                    if (this.config.animate !== false) {
                        this.stopAnimation();
                        this.startAnimation();
                    }
                }).catch((error: any) => {
                    debugLog('APP', 'Error reinitializing particle system after config change', error);
                    this.reportError(error);
                });
            }
        }
        
        // Update menu state to reflect changes
        this.menuSystem.updateMenuState();
    }

    private operation: any = null;

    private handleZoomStart(event: d3.D3ZoomEvent<HTMLElement, unknown>): void {
        debugLog('INPUT', 'Zoom start');
        if (!this.globe) return;

        // Stop animation and clear canvas immediately when manipulation starts
        this.stopAnimation();
        this.clearCanvas();

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

        const operationType = this.operation.type;
        this.operation = null;
        
        // Update configuration and regenerate field after manipulation
        this.updateConfigurationFromGlobe();
        
        debugLog('INPUT', `Rebuilding field after ${operationType} operation`);
        
        // Reinitialize particle system after manipulation
        if (this.particleSystem && this.globe) {
            const mask = this.createMask();
            const view: ViewportSize = { width: this.display.width, height: this.display.height };
            this.particleSystem.reinitialize(this.config, this.globe, mask, view).then(() => {
                debugLog('INPUT', 'Particle system reinitialized successfully after manipulation');
                if (this.config.animate !== false) {
                    this.startAnimation();
                }
            }).catch((error: any) => {
                debugLog('INPUT', 'Failed to reinitialize particle system after manipulation', error);
            });
        }
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
            
            // Draw overlay if available
            this.drawOverlay();
            
            debugLog('RENDER', 'Render completed');
            
        } catch (error) {
            debugLog('RENDER', 'Render failed', error);
        }
    }

    private setupCanvas(): void {
        debugLog('ANIMATION', 'Setting up canvas');
        
        // Setup animation canvas
        this.canvas = d3.select("#animation").node() as HTMLCanvasElement;
        if (this.canvas) {
            this.context = this.canvas.getContext("2d");
            this.canvas.width = this.display.width;
            this.canvas.height = this.display.height;
            
            // Set up canvas properties like the original
            if (this.context) {
                this.context.lineWidth = PARTICLE_LINE_WIDTH;
                this.context.fillStyle = µ.isFF() ? "rgba(0, 0, 0, 0.95)" : "rgba(0, 0, 0, 0.97)";  // FF Mac alpha behaves oddly
            }
        }
        
        // Setup overlay canvas
        this.overlayCanvas = d3.select("#overlay").node() as HTMLCanvasElement;
        if (this.overlayCanvas) {
            this.overlayContext = this.overlayCanvas.getContext("2d");
            this.overlayCanvas.width = this.display.width;
            this.overlayCanvas.height = this.display.height;
            debugLog('OVERLAY', 'Overlay canvas initialized', { width: this.display.width, height: this.display.height });
        }
        
        // Setup scale canvas
        this.scaleCanvas = d3.select("#scale").node() as HTMLCanvasElement;
        if (this.scaleCanvas) {
            this.scaleContext = this.scaleCanvas.getContext("2d");
            debugLog('OVERLAY', 'Scale canvas initialized');
        }
    }

    private clearCanvas(): void {
        if (!this.context) return;
        
        // Completely clear the canvas
        this.context.clearRect(0, 0, this.display.width, this.display.height);
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
            if (!this.particleSystem) return;
            
            this.particleSystem.evolveParticles();
            this.buckets = this.particleSystem.getBuckets();
            this.colorStyles = this.particleSystem.getColorStyles();
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

    private drawParticles(): void {
        if (!this.context || !this.colorStyles) return;

        // Get bounds for drawing particles
        const bounds = this.globe?.bounds({ width: this.display.width, height: this.display.height });
        if (!bounds) return;

        // Fade existing particle trails - only clear the bounds area like the original
        const prev = this.context.globalCompositeOperation;
        this.context.globalCompositeOperation = "destination-in";
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

    private drawOverlay(): void {
        debugLog('OVERLAY', 'Drawing overlay', { overlayType: this.config.overlayType });
        
        if (!this.overlayContext) {
            debugLog('OVERLAY', 'No overlay context available');
            return;
        }

        // Clear overlay canvas
        µ.clearCanvas(this.overlayCanvas!);
        
        // Clear scale canvas
        if (this.scaleCanvas) {
            µ.clearCanvas(this.scaleCanvas);
        }
        this.field = this.particleSystem?.getField();
        // Only draw if overlay is enabled and not "off"
        if (this.config.overlayType && this.config.overlayType !== "off") {
            // For now, just draw the overlay imageData if it exists
            if (this.field && this.field.overlay) {
                debugLog('OVERLAY', 'Putting overlay imageData');
                this.overlayContext.putImageData(this.field.overlay, 0, 0);
            }
            
            // Draw color scale if we have overlay grid
            if (this.overlayGrid) {
                this.drawColorScale();
            }
        }
    }

    private drawColorScale(): void {
        if (!this.scaleContext || !this.overlayGrid || !this.overlayGrid.scale) {
            return;
        }

        const canvas = this.scaleCanvas!;
        const ctx = this.scaleContext;
        const scale = this.overlayGrid.scale;
        const bounds = scale.bounds;
        
        if (!bounds) return;

        const width = canvas.width - 1;
        
        // Draw gradient bar
        for (let i = 0; i <= width; i++) {
            const value = µ.spread(i / width, bounds[0], bounds[1]);
            const rgb = scale.gradient(value, 1); // Full opacity for scale
            ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
            ctx.fillRect(i, 0, 1, canvas.height);
        }
        
        debugLog('OVERLAY', 'Drew color scale', { bounds, width: canvas.width, height: canvas.height });
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
        if (!context) {
            debugLog('MASK', 'Globe.defineMask returned null');
            return null;
        }
        
        context.fillStyle = "rgba(255, 0, 0, 1)";
        context.fill();

        const imageData = context.getImageData(0, 0, this.display.width, this.display.height);
        const data = imageData.data;
        
        // Create overlay imageData for storing overlay colors
        const overlayImageData = context.createImageData(this.display.width, this.display.height);
        const overlayData = overlayImageData.data;
        
        // Count visible pixels for debugging
        let visiblePixels = 0;
        for (let i = 3; i < data.length; i += 4) {
            if (data[i] > 0) visiblePixels++;
        }
        
        debugLog('MASK', `Mask created: ${visiblePixels} visible pixels out of ${this.display.width * this.display.height}`);
        
        const mask = {
            imageData: imageData,
            overlayImageData: overlayImageData,
            isVisible: (x: number, y: number): boolean => {
                if (x < 0 || x >= this.display.width || y < 0 || y >= this.display.height) return false;
                const i = (Math.floor(y) * this.display.width + Math.floor(x)) * 4;
                return data[i + 3] > 0;  // non-zero alpha means pixel is visible
            },
            set: (x: number, y: number, rgba: number[]) => {
                if (x >= 0 && x < this.display.width && y >= 0 && y < this.display.height) {
                    const i = (Math.floor(y) * this.display.width + Math.floor(x)) * 4;
                    overlayData[i] = rgba[0] || 0;     // red
                    overlayData[i + 1] = rgba[1] || 0; // green
                    overlayData[i + 2] = rgba[2] || 0; // blue
                    overlayData[i + 3] = rgba[3] || 0; // alpha
                }
                return mask; // Return self for chaining
            }
        };
        
        return mask;
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