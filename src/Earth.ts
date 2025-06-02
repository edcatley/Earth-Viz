/**
 * earth-modern - modernized earth visualization using existing modules
 * 
 * This version properly uses globes.ts, micro.ts, products.ts and the
 * well-designed interfaces from types.ts
 */

import * as d3 from 'd3';
import { Globes, Globe, ViewportSize, DisplayOptions, Point, GeoPoint, Bounds } from './Globes';
import { Products } from './Products';
import { Utils } from './utils/Utils';
import { MenuSystem } from './MenuSystem';
import { ParticleSystem } from './Particles';
import { InputHandler } from './InputHandler';
import { RenderSystem, RenderData } from './RenderSystem';
import { OverlaySystem } from './OverlaySystem';

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
    private config: any; // Use the actual configuration object from Utils.buildConfiguration
    private display: DisplayOptions;
    private globe: Globe | null = null;
    private mesh: any = null;
    private products: any[] = [];
    private menuSystem: MenuSystem;
    private particleSystem: ParticleSystem | null = null;
    private overlaySystem: OverlaySystem;
    private inputHandler: InputHandler;
    private renderSystem: RenderSystem;
    
    // Animation
    private animationId: number | null = null;
    
    // Overlay system
    private overlayGrid: any = null;
    private cachedOverlayResult: { imageData: ImageData | null; overlayType: string } | null = null;

    constructor() {
        debugLog('APP', 'Initializing EarthModernApp');
        
        // Use proper configuration system from Utils
        this.config = Utils.buildConfiguration(Globes.keys(), Products.overlayTypes);
        
        // Add required parameters for products system
        this.config.param = "wind";
        this.config.surface = "surface";
        this.config.level = "level";
        this.config.date = "current";
        this.config.hour = "0000";
        this.config.overlayType = "off"; // Start with no overlay
        
        // Initialize display options properly
        const view = Utils.view();
        this.display = {
            width: view.width,
            height: view.height,
            projection: null as any, // Will be set when globe is created
            orientation: [0, 0, 0]
        };
        
        // Initialize MenuSystem
        this.menuSystem = new MenuSystem(this.config);
        
        // Initialize InputHandler
        this.inputHandler = new InputHandler();
        this.setupInputEventHandlers();
        
        // Initialize RenderSystem
        this.renderSystem = new RenderSystem(this.display);
        
        // Initialize OverlaySystem - clean separation of concerns!
        this.overlaySystem = new OverlaySystem();
        
        debugLog('APP', 'App initialized', { config: this.config, display: this.display });
    }

    async start(): Promise<void> {
        debugLog('APP', 'Starting application');
        
        try {
            this.setupUI();
            this.setupMenuSystem();
            
            // Load products FIRST at the app level
            await this.loadProducts();
            
            // Load initial data
            await this.loadMesh();
            this.createGlobe();
            
            // Create and initialize particle system (pass products to it)
            if (this.globe) {
                const mask = this.createMask();
                const view: ViewportSize = { width: this.display.width, height: this.display.height };
                this.particleSystem = new ParticleSystem(this.config, this.globe, mask, view, this.products);
                
                // Connect ParticleSystem events to RenderSystem
                this.particleSystem.on('particlesEvolved', (buckets, colorStyles, globe) => {
                    this.renderSystem.drawParticles(buckets, colorStyles, globe);
                });
            }
            
            // Setup rendering
            this.renderSystem.setupCanvases();
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
        if (Utils.isFF()) {
            d3.select("#display").classed("firefox", true);
        }
        
        if ("ontouchstart" in document.documentElement) {
            d3.select(document).on("touchstart", function() {});
        } else {
            d3.select(document.documentElement).classed("no-touch", true);
        }

        // Set sponsor link target for iframes
        if (Utils.isEmbeddedInIFrame()) {
            d3.select("#sponsor-link").attr("target", "_new");
        }
    }

    private setupInputEventHandlers(): void {
        debugLog('APP', 'Setting up input event handlers');
        
        // Set up event listeners for InputHandler
        this.inputHandler.on('zoomStart', (event) => this.handleZoomStart(event));
        this.inputHandler.on('zoom', (event) => this.handleZoom(event));
        this.inputHandler.on('zoomEnd', (event) => this.handleZoomEnd(event));
        this.inputHandler.on('click', (point, coord) => this.handleClickFromInput(point, coord));
        this.inputHandler.on('locationFound', (coord) => this.handleLocationFoundFromInput(coord));
        this.inputHandler.on('locationError', (error) => this.handleLocationError(error));
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
        
        
        this.createGlobe();
        
 
        // Stop animation, reload products, then restart everything
        this.stopAnimation();
        this.loadProducts().then(() => {
            // Reinitialize systems with new products
            if (this.globe && this.particleSystem) {
                const mask = this.createMask();
                const view: ViewportSize = { width: this.display.width, height: this.display.height };
                this.particleSystem = new ParticleSystem(this.config, this.globe, mask, view, this.products);
                
                // Reconnect events
                this.particleSystem.on('particlesEvolved', (buckets, colorStyles, globe) => {
                    this.renderSystem.drawParticles(buckets, colorStyles, globe);
                });
            }
            
            this.render();
            this.reinitializeAfterGlobeChange('config change');
            
            // Update menu state to reflect changes
            this.menuSystem.updateMenuState();
        }).catch(error => {
            debugLog('APP', 'Failed to reload products after config change', error);
            this.reportError(error);
        });

    }

    private handleZoomStart(event: d3.D3ZoomEvent<HTMLElement, unknown>): void {
        debugLog('INPUT', 'Zoom start - stopping animation and clearing canvas');
        
        // Stop animation and clear canvas immediately when manipulation starts
        this.stopAnimation();
        this.clearCanvas();
    }

    private handleZoom(event: d3.D3ZoomEvent<HTMLElement, unknown>): void {
        debugLog('INPUT', 'Zoom in progress - updating display projection and rendering');
        
        // InputHandler has already manipulated the globe, we just need to update our display state
        if (this.globe?.projection) {
            this.display.projection = this.globe.projection;
        }

        // Re-render immediately during manipulation
        this.render();
    }

    private handleZoomEnd(event: d3.D3ZoomEvent<HTMLElement, unknown>): void {
        debugLog('INPUT', 'Zoom end - updating configuration and restarting animation');
        
        // InputHandler has already finished the manipulation, we just need to update app state
        this.updateConfigurationFromGlobe();
        this.reinitializeAfterGlobeChange('zoom end');
    }

    private handleClickFromInput(point: Point, coord: GeoPoint | null): void {
        if (coord) {
            debugLog('INPUT', 'Clicked coordinates', coord);
            this.drawLocationMark(point, coord);
        }
    }

    private handleLocationFoundFromInput(coord: GeoPoint): void {
        debugLog('INPUT', 'Location found', coord);
        
        if (!this.globe) return;

        const rotate = this.globe.locate(coord);
        
        if (rotate && this.globe.projection) {
            this.globe.projection.rotate(rotate);
            this.display.projection = this.globe.projection;
            this.display.orientation = rotate;
            this.render();
            this.updateConfigurationFromGlobe();
            
            // Reinitialize particle system for new orientation
            this.reinitializeAfterGlobeChange("globe rotation");
        }
        
        this.reportStatus("Ready");
    }

    private handleLocationError(error: GeolocationPositionError): void {
        debugLog('INPUT', 'Geolocation error', error);
        this.reportError(new Error("Unable to find your location"));
    }

    /**
     * Common reinitialization logic used after globe changes (zoom, config changes, etc.)
     */
    private reinitializeAfterGlobeChange(reason: string): void {
        debugLog('APP', `Reinitializing after ${reason}`);
        
        this.stopAnimation();
        this.clearCanvas();
        
        if (this.particleSystem && this.globe) {
            const mask = this.createMask();
            const view: ViewportSize = { width: this.display.width, height: this.display.height };
            
            try {
                // Find wind product and call initialize directly
                const windProduct = this.products.find(p => p && p.field === "vector");
                if (windProduct) {
                    this.particleSystem.initialize(windProduct, this.globe, mask, view);
                }
                
                if (this.config.animate !== false) {
                    this.startAnimation();
                }
            } catch (error) {
                debugLog('APP', `Failed to reinitialize after ${reason}`, error);
            }
        }
    }

    private async loadMesh(): Promise<void> {
        debugLog('APP', 'Loading mesh data');
        this.reportStatus("Loading map data...");
        
        try {
            const topology = Utils.isMobile() ? 
                "/data/earth-topo-mobile.json?v2" : 
                "/data/earth-topo.json?v2";
            
            const topo = await Utils.loadJson(topology);
            const o = topo.objects;
            
            this.mesh = {
                coastLo: window.topojson.feature(topo, Utils.isMobile() ? o.coastline_tiny : o.coastline_110m),
                coastHi: window.topojson.feature(topo, Utils.isMobile() ? o.coastline_110m : o.coastline_50m),
                lakesLo: window.topojson.feature(topo, Utils.isMobile() ? o.lakes_tiny : o.lakes_110m),
                lakesHi: window.topojson.feature(topo, Utils.isMobile() ? o.lakes_110m : o.lakes_50m)
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
            const globeBuilder = Globes.get(projectionName);
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
            
            // Update InputHandler with new globe reference
            this.inputHandler.setGlobe(this.globe);
            
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
            // Get clean field data (no more overlay smuggling!)
            const field = this.particleSystem?.getField();
            
            // Find the right overlay product based on config.overlayType
            let overlayProduct = null;
            if (this.config.overlayType && this.config.overlayType !== "off") {
                overlayProduct = this.products.find(p => p && p.type === this.config.overlayType);
                if (!overlayProduct) {
                    debugLog('RENDER', `No overlay product found for type: ${this.config.overlayType}`);
                }
            }
            
            // Generate overlay data cleanly and separately
            const mask = this.createMask();
            const overlayResult = this.overlaySystem.generateOverlay(
                overlayProduct,
                this.globe,
                mask,
                { width: this.display.width, height: this.display.height },
                this.config.overlayType
            );

            // Create clean render data object
            const renderData: RenderData = {
                globe: this.globe,
                mesh: this.mesh,
                field: field,
                overlayGrid: this.overlayGrid,
                overlayType: this.config.overlayType,
                overlayData: overlayResult.imageData
            };

            // Render everything through the render system
            this.renderSystem.renderFrame(renderData);

        } catch (error) {
            debugLog('RENDER', 'Render error', error);
        }
    }

    private clearCanvas(): void {
        this.renderSystem.clearAnimationCanvas();
    }

    private startAnimation(): void {
        debugLog('ANIMATION', 'Starting animation');
        
        const field = this.particleSystem?.getField();
        if (this.animationId || !field || !this.renderSystem.isReady()) {
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

    private drawLocationMark(point: Point, coord: GeoPoint): void {
        this.renderSystem.drawLocationMark(point, coord);
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
   

    /**
     * Creates a visibility mask for the globe
     * 
     * UPDATE: Now that we have OverlaySystem, this mask ONLY handles visibility testing!
     * The old overlay storage functionality has been moved to OverlaySystem for clean separation.
     * 
     * This function creates a red globe shape for visibility testing:
     * 1. Draw globe boundary as red shape on hidden canvas
     * 2. Extract pixel data for visibility testing  
     * 3. Return object with isVisible() method
     * 
     * Note: We still create overlayImageData for backward compatibility,
     * but it's no longer used for the data smuggling heresy!
     * 
     * @returns Mask object with visibility testing capability
     */
    private createMask(): any {
        if (!this.globe) return null;

        debugLog('MASK', 'Creating visibility mask');
        
        // STEP 1: Create a hidden canvas to draw the globe boundary
        const canvas = document.createElement("canvas");
        canvas.width = this.display.width;
        canvas.height = this.display.height;
        
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        
        // STEP 2: Draw the globe boundary (sphere outline) using D3 geoPath
        // This creates a path outline of where the globe is visible on screen
        const context = this.globe.defineMask(ctx);
        if (!context) {
            debugLog('MASK', 'Globe.defineMask returned null');
            return null;
        }
        
        // STEP 3: Fill the globe boundary with solid red color
        // Red pixels = inside globe, transparent pixels = outside globe
        context.fillStyle = "rgba(255, 0, 0, 1)";
        context.fill();

        // STEP 4: Extract the pixel data for visibility testing
        // This gives us a flat RGBA array where red pixels indicate visible areas
        const imageData = context.getImageData(0, 0, this.display.width, this.display.height);
        const data = imageData.data; // Flat array: [r,g,b,a,r,g,b,a,...]
        
        // STEP 5: Count visible pixels for debugging
        let visiblePixels = 0;
        for (let i = 3; i < data.length; i += 4) { // i += 4 steps through alpha values only
            if (data[i] > 0) visiblePixels++; // Non-zero alpha = visible pixel
        }
        
        debugLog('MASK', `Mask created: ${visiblePixels} visible pixels out of ${this.display.width * this.display.height}`);
        
        // STEP 6: Return the mask object with visibility testing capability only
        const mask = {
            // The red globe shape (for visibility testing)
            imageData: imageData,
            
            /**
             * Tests if a screen pixel is inside the globe boundary
             * Uses the RED globe shape to check visibility
             * @param x Screen X coordinate
             * @param y Screen Y coordinate  
             * @returns true if pixel is inside globe boundary
             */
            isVisible: (x: number, y: number): boolean => {
                if (x < 0 || x >= this.display.width || y < 0 || y >= this.display.height) return false;
                // Convert (x,y) to flat array index: y * width + x, then * 4 for RGBA
                const i = (Math.floor(y) * this.display.width + Math.floor(x)) * 4;
                return data[i + 3] > 0;  // Check alpha channel of RED globe shape
            }
        };
        
        return mask;
    }

    /**
     * Load weather products at the app level so both ParticleSystem and OverlaySystem can use them
     */
    private async loadProducts(): Promise<void> {
        debugLog('APP', 'Loading products');
        this.reportStatus("Loading weather data...");
        
        try {
            // Use the products module to get weather data
            debugLog('APP', 'Calling products.productsFor with config:', this.config);
            const productPromises = Products.productsFor(this.config);
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