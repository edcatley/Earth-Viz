/**
 * PlanetSystem - Renders planet surface imagery as overlays
 * 
 * Similar to OverlaySystem but handles image-based overlays instead of computed data.
 * Loads planet surface images and maps them onto the globe projection.
 */

import * as d3 from 'd3';
import { Utils } from './utils/Utils';
import { WebGLRenderer } from './services/WebGLRenderer';

// Debug logging
function debugLog(category: string, message: string, data?: any): void {
    console.log(`[${category}] ${message}`, data || '');
}

import { Globe, ViewportSize, Bounds } from './Globes';

export interface PlanetResult {
    imageData: ImageData | null;
    planetType: string;
    webglCanvas?: HTMLCanvasElement | null;  // WebGL canvas for direct rendering
}

export class PlanetSystem {
    private canvas: HTMLCanvasElement;  // 2D canvas for ImageData operations
    private ctx: CanvasRenderingContext2D | null = null;
    private webglCanvas: HTMLCanvasElement | null = null;  // Invisible WebGL canvas
    private planetImageData: ImageData | null = null;
    
    // WebGL system for GPU acceleration
    private webglRenderer: WebGLRenderer | null = null;
    private useWebGL: boolean = false;
    
    // External state references (we observe these)
    private stateProvider: any = null;
    
    // Event callbacks
    private eventHandlers: { [key: string]: Function[] } = {};
    
    // Planet image cache
    private imageCache: { [key: string]: HTMLImageElement } = {};
    
    constructor() {
        // Create 2D canvas for ImageData operations
        this.canvas = document.createElement("canvas");
        const ctx = this.canvas.getContext("2d");
        if (!ctx) {
            throw new Error("Failed to create 2D canvas context for PlanetSystem");
        }
        this.ctx = ctx;
        
        // Try to initialize WebGL system with separate canvas
        this.initializeWebGL();
    }
    
    /**
     * Initialize WebGL system with testing
     */
    private initializeWebGL(): void {
        console.log('[PLANET-WEBGL] Attempting to initialize WebGL system');
        
        // Only initialize if we're actually in planet mode
        const config = this.stateProvider?.getConfig();
        
        if (!config || config.mode !== "planet") {
            console.log(`[PLANET-WEBGL] Skipping WebGL init - not in planet mode (mode: ${config?.mode})`);
            return;
        }
        
        try {
            // Create separate invisible canvas for WebGL (only if we don't have one)
            if (!this.webglCanvas) {
                this.webglCanvas = document.createElement("canvas");
            }
            
            this.webglRenderer = new WebGLRenderer();
            const webglInitialized = this.webglRenderer.initialize(this.webglCanvas);
            
            if (webglInitialized) {
                this.useWebGL = true;
                console.log('[PLANET-WEBGL] WebGL renderer initialized successfully');
                
                // Setup all cached planets in WebGL
                for (const planetType in this.imageCache) {
                    const planetImage = this.imageCache[planetType];
                    const planetId = `planet_${planetType}`;
                    const setupSuccess = this.webglRenderer.setup('planet', planetImage, planetId);
                    if (setupSuccess) {
                        console.log(`[PLANET-WEBGL] Setup completed for ${planetType}`);
                    } else {
                        console.log(`[PLANET-WEBGL] Setup failed for ${planetType}`);
                    }
                }
                
                console.log('[PLANET-WEBGL] WebGL acceleration enabled');
            } else {
                console.log('[PLANET-WEBGL] WebGL renderer initialization failed');
                this.webglRenderer = null;
                this.webglCanvas = null;
            }
        } catch (error) {
            console.log('[PLANET-WEBGL] WebGL setup error:', error);
            if (this.webglRenderer) {
                this.webglRenderer.dispose();
                this.webglRenderer = null;
            }
            this.webglCanvas = null;
        }
        
        if (!this.useWebGL) {
            console.log('[PLANET-WEBGL] Falling back to 2D canvas rendering');
        }
    }
    
    /**
     * Subscribe to external state provider - becomes a pure observer
     */
    observeState(stateProvider: any): void {
        this.stateProvider = stateProvider;
        
        // Initialize WebGL once when we first get state provider
        this.initializeWebGL();
        
        // Subscribe to state changes that require re-rendering only
        stateProvider.on('rotate', () => this.generatePlanet()); // Listen to rotate
        
        // Subscribe to data changes that require planet re-initialization
        stateProvider.on('maskChanged', () => this.reinitializePlanet()); // Listen maskChanged
        stateProvider.on('configChanged', () => this.reinitializePlanet());
        stateProvider.on('systemsReady', () => this.reinitializePlanet());
        
        console.log('[PLANET] Now observing external state changes');
    }
    
    /**
     * Get current planet data
     */
    getPlanetData(): ImageData | null {
        return this.planetImageData;
    }
    
    /**
     * Subscribe to planet change events
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
    
    /**
     * Reinitialize planet system - call when data/config changes
     */
    public reinitializePlanet(): void {
        if (!this.stateProvider) return;
        
        const config = this.stateProvider.getConfig();
        const planetType = config?.planetType || 'earth';
        
        console.log(`[PLANET] Reinitializing planet system for ${planetType}`);
        
        // 1. Load the new planet data (if changed)
        this.loadPlanetImage(planetType).then((planetImage) => {
            // 2. Decide whether to reinitialize WebGL if we are using it
            //if (this.useWebGL) {
                console.log('[PLANET] Reinitializing WebGL due to planet data change');
                this.reinitializeWebGL();
            //}
            
            // 4. Generate the planet with new data
            this.generatePlanet();
        }).catch(error => {
            console.error('[PLANET] Failed to reinitialize planet:', error);
        });
    }

    /**
     * Generate planet - lightweight render with already-loaded data
     */
    private generatePlanet(): void {
        if (!this.stateProvider) return;
        
        const globe = this.stateProvider.getGlobe();
        const mask = this.stateProvider.getMask();
        const view = this.stateProvider.getView();
        const config = this.stateProvider.getConfig();
        
        // Need all required state
        if (!globe || !mask || !view || !config) {
            return;
        }
        
        // Skip if not in planet mode - emit null result
        if (config.mode !== "planet") {
            console.log(`[PLANET] Skipping planet - not in planet mode: ${config.mode}`);
            this.planetImageData = null;
            this.emit('planetChanged', {
                imageData: null,
                planetType: 'off',
                webglCanvas: null
            });
            return;
        }

        console.log(`[PLANET] Generating planet`);
        
        const planetType = config.planetType || 'earth';
        const bounds = globe.bounds(view);
        
        // Resize canvases if needed
        if (this.canvas.width !== view.width || this.canvas.height !== view.height) {
            this.canvas.width = view.width;
            this.canvas.height = view.height;
            this.planetImageData = null; // Force recreation
            
            // Also resize WebGL canvas if using WebGL
            if (this.useWebGL && this.webglCanvas) {
                this.webglCanvas.width = view.width;
                this.webglCanvas.height = view.height;
            }
        }

        // Use already-loaded image from cache
        const planetImage = this.imageCache[planetType];
        if (!planetImage) {
            console.log(`[PLANET] Planet image not loaded yet: ${planetType}`);
            return;
        }

        // Generate planet with cached image
        const result = this.useWebGL 
            ? this.generatePlanetWebGL(planetType, planetImage, globe, view, mask, bounds)
            : this.generatePlanet2D(planetType, planetImage, globe, view, mask, bounds);

        this.planetImageData = result.imageData;
        this.emit('planetChanged', result);
    }
    
    /**
     * Load planet image from URL
     */
    private async loadPlanetImage(planetType: string): Promise<HTMLImageElement> {
        // Check cache first
        if (this.imageCache[planetType]) {
            return this.imageCache[planetType];
        }
        
        // Planet image URLs - you can customize these paths
        const planetUrls: { [key: string]: string } = {
            earth: '/data/earth-surface.jpg',
            mars: '/data/mars-surface.jpg',
            moon: '/data/moon-surface.jpg',
            venus: '/data/venus-surface.jpg',
            jupiter: '/data/jupiter-surface.jpg'
        };
        
        const url = planetUrls[planetType];
        if (!url) {
            throw new Error(`Unknown planet type: ${planetType}`);
        }
        
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous'; // Handle CORS if needed
            
            img.onload = () => {
                console.log(`[PLANET] Planet image loaded: ${planetType}`, {
                    url,
                    width: img.naturalWidth,
                    height: img.naturalHeight,
                    complete: img.complete
                });
                this.imageCache[planetType] = img;
                
                // Setup WebGL for this planet if WebGL is available
                if (this.useWebGL && this.webglRenderer) {
                    const planetId = `planet_${planetType}`;
                    const setupSuccess = this.webglRenderer.setup('planet', img, planetId);
                    if (setupSuccess) {
                        console.log(`[PLANET-WEBGL] WebGL setup completed for ${planetType}`);
                    } else {
                        console.log(`[PLANET-WEBGL] WebGL setup failed for ${planetType}`);
                    }
                }
                
                resolve(img);
            };
            
            img.onerror = () => {
                console.log(`[PLANET] Failed to load planet image: ${url}`);
                reject(new Error(`Failed to load planet image: ${url}`));
            };
            
            console.log(`[PLANET] Loading planet image: ${planetType} from ${url}`);
            img.src = url;
        });
    }
    


    /**
     * Generate planet using WebGL acceleration
     */
    private generatePlanetWebGL(
        planetType: string,
        planetImage: HTMLImageElement,
        globe: Globe,
        view: ViewportSize,
        mask: any,
        bounds: any
    ): PlanetResult {
        console.log('[PLANET-WEBGL] Using WebGL rendering path for planet');
        
        try {
            // Just render - setup was done during initialization
            const planetId = `planet_${planetType}`;
            const renderSuccess = this.webglRenderer!.render(planetId, globe, view);
            
            if (renderSuccess) {
                console.log('[PLANET-WEBGL] WebGL planet rendering completed successfully');
                
                return {
                    imageData: null,  // No ImageData when using WebGL
                    planetType,
                    webglCanvas: this.webglCanvas
                };
            } else {
                console.log('[PLANET-WEBGL] WebGL planet render failed, falling back to 2D');
            }
            
        } catch (error) {
            console.log('[PLANET-WEBGL] WebGL planet rendering failed, falling back to 2D:', error);
        }
        
        // Fall back to 2D rendering
        return this.generatePlanet2D(planetType, planetImage, globe, view, mask, bounds);
    }

    /**
     * Generate planet using 2D canvas rendering
     */
    private generatePlanet2D(
        planetType: string,
        planetImage: HTMLImageElement,
        globe: Globe,
        view: ViewportSize,
        mask: any,
        bounds: any
    ): PlanetResult {
        console.log('[PLANET] Using 2D canvas rendering for planet');
        
        if (!this.ctx) {
            throw new Error("2D context not available for planet rendering");
        }
        
        if (!this.planetImageData) {
            this.planetImageData = this.ctx.createImageData(view.width, view.height);
        }
        
        // Clear the ImageData for reuse
        const planetData = this.planetImageData.data;
        planetData.fill(0); // Clear to transparent
        
        // Create a temporary canvas to sample from the planet image
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = planetImage.width;
        tempCanvas.height = planetImage.height;
        const tempCtx = tempCanvas.getContext('2d')!;
        tempCtx.drawImage(planetImage, 0, 0);
        const imageData = tempCtx.getImageData(0, 0, planetImage.width, planetImage.height);
        
        // Iterate through visible pixels and map planet surface
        for (let x = bounds.x; x <= bounds.xMax; x += 1) {
            for (let y = bounds.y; y <= bounds.yMax; y += 1) {
                if (mask.isVisible(x, y)) {
                    const coord = globe.projection?.invert?.([x, y]);
                    
                    if (coord) {
                        const λ = coord[0], φ = coord[1];
                        
                        if (isFinite(λ) && isFinite(φ)) {
                            // Convert lat/lon to image coordinates
                            // Longitude: -180 to 180 → 0 to imageWidth
                            // Latitude: 90 to -90 → 0 to imageHeight
                            const imgX = Math.floor(((λ + 180) / 360) * planetImage.width) % planetImage.width;
                            const imgY = Math.floor(((90 - φ) / 180) * planetImage.height);
                            
                            // Ensure coordinates are within bounds
                            if (imgX >= 0 && imgX < planetImage.width && imgY >= 0 && imgY < planetImage.height) {
                                // Sample color from planet image
                                const imgIndex = (imgY * planetImage.width + imgX) * 4;
                                const r = imageData.data[imgIndex];
                                const g = imageData.data[imgIndex + 1];
                                const b = imageData.data[imgIndex + 2];
                                const a = imageData.data[imgIndex + 3];
                                
                                // Set pixel color in output
                                this.setPixelColor(planetData, view.width, x, y, [r, g, b, a]);
                            }
                        }
                    }
                }
            }
        }
        
        return {
            imageData: this.planetImageData,
            planetType,
            webglCanvas: null
        };
    }
    
    /**
     * Helper to set RGBA color at specific pixel coordinates
     */
    private setPixelColor(
        data: Uint8ClampedArray, 
        width: number, 
        x: number, 
        y: number, 
        rgba: number[]
    ): void {
        if (x >= 0 && x < width && y >= 0) {
            const i = (Math.floor(y) * width + Math.floor(x)) * 4;
            data[i] = rgba[0] || 0;     // red
            data[i + 1] = rgba[1] || 0; // green
            data[i + 2] = rgba[2] || 0; // blue
            data[i + 3] = rgba[3] || 255; // alpha (default to opaque)
        }
    }
    
    /**
     * Reinitialize WebGL system - call when projection changes
     * Completely disposes and recreates the WebGL system for clean state
     */
    private reinitializeWebGL(): void {
        if (this.webglRenderer) {
            console.log('[PLANET-WEBGL] Reinitializing WebGL system due to projection change');
            
            // Dispose the old WebGL system completely
            this.webglRenderer.dispose();
            this.webglRenderer = null;
            this.useWebGL = false;
        }
            // Recreate WebGL system from scratch
            this.initializeWebGL();
            console.log(`[PLANET-WEBGL] WebGL reinitialization complete. Using WebGL: ${this.useWebGL}`);
        
    }
} 