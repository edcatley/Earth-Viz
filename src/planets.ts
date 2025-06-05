/**
 * PlanetSystem - Renders planet surface imagery as overlays
 * 
 * Similar to OverlaySystem but handles image-based overlays instead of computed data.
 * Loads planet surface images and maps them onto the globe projection.
 */

import * as d3 from 'd3';
import { Utils } from './utils/Utils';
import { WebGLSystem, WebGLLayer, buildShader } from './services/WebGLSystem';

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
    private webglSystem: WebGLSystem | null = null;
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
        debugLog('PLANET-WEBGL', 'Attempting to initialize WebGL system');
        
        try {
            // Create separate invisible canvas for WebGL
            this.webglCanvas = document.createElement("canvas");
            
            this.webglSystem = new WebGLSystem();
            const webglInitialized = this.webglSystem.initialize(this.webglCanvas);
            
            if (webglInitialized) {
                // Test WebGL with a simple render
                const testResult = this.webglSystem.testRender([512, 512]);
                
                if (testResult.success) {
                    this.useWebGL = true;
                    debugLog('PLANET-WEBGL', `WebGL test passed! Render time: ${testResult.renderTime.toFixed(2)}ms`);
                    debugLog('PLANET-WEBGL', 'WebGL acceleration enabled');
                } else {
                    debugLog('PLANET-WEBGL', `WebGL test failed: ${testResult.error}`);
                    this.webglSystem.dispose();
                    this.webglSystem = null;
                    this.webglCanvas = null;
                }
            } else {
                debugLog('PLANET-WEBGL', 'WebGL initialization failed');
                this.webglSystem = null;
                this.webglCanvas = null;
            }
        } catch (error) {
            debugLog('PLANET-WEBGL', 'WebGL setup error:', error);
            if (this.webglSystem) {
                this.webglSystem.dispose();
                this.webglSystem = null;
            }
            this.webglCanvas = null;
        }
        
        if (!this.useWebGL) {
            debugLog('PLANET-WEBGL', 'Falling back to 2D canvas rendering');
        }
    }
    
    /**
     * Subscribe to external state provider - becomes a pure observer
     */
    observeState(stateProvider: any): void {
        this.stateProvider = stateProvider;
        
        // Subscribe to all relevant state changes
        stateProvider.on('globeChanged', () => this.regeneratePlanet());
        stateProvider.on('configChanged', () => this.reinitializeWebGL());
        stateProvider.on('systemsReady', () => this.regeneratePlanet());
        
        debugLog('PLANET', 'Now observing external state changes');
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
     * Automatically regenerate planet when observed state changes
     */
    private regeneratePlanet(): void {
        if (!this.stateProvider) return;
        
        // Get current state from provider
        const globe = this.stateProvider.getGlobe();
        const mask = this.stateProvider.getMask();
        const view = this.stateProvider.getView();
        const config = this.stateProvider.getConfig();
        
        // Need all required state to generate planet
        if (!globe || !mask || !view || !config) {
            return;
        }
        
        // Get planet type from config (default to earth)
        const planetType = config.planetType || 'earth';
        
        this.generatePlanet(planetType, globe, mask, view).then(result => {
            this.planetImageData = result.imageData;
            
            // Emit change event
            this.emit('planetChanged', result);
        }).catch(error => {
            console.error('[PLANET] Failed to generate planet:', error);
        });
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
                debugLog('PLANET', `Planet image loaded: ${planetType}`, {
                    url,
                    width: img.naturalWidth,
                    height: img.naturalHeight,
                    complete: img.complete
                });
                this.imageCache[planetType] = img;
                resolve(img);
            };
            
            img.onerror = () => {
                debugLog('PLANET', `Failed to load planet image: ${url}`);
                reject(new Error(`Failed to load planet image: ${url}`));
            };
            
            debugLog('PLANET', `Loading planet image: ${planetType} from ${url}`);
            img.src = url;
        });
    }
    
    /**
     * Generate planet surface overlay from image
     */
    private async generatePlanet(
        planetType: string,
        globe: Globe,
        mask: any,
        view: ViewportSize
    ): Promise<PlanetResult> {
        debugLog('PLANET', `Generating ${planetType} surface`);
        
        try {
            // Load planet image
            const planetImage = await this.loadPlanetImage(planetType);

            const bounds = globe.bounds(view);
            
            // Resize canvas if needed and create/reuse ImageData
            if (this.canvas.width !== view.width || this.canvas.height !== view.height) {
                this.canvas.width = view.width;
                this.canvas.height = view.height;
                
                // Also resize WebGL canvas if using WebGL
                if (this.useWebGL && this.webglCanvas) {
                    this.webglCanvas.width = view.width;
                    this.webglCanvas.height = view.height;
                }
                
                this.planetImageData = null; // Force recreation
            }

            // Handle WebGL vs 2D rendering
            if (this.useWebGL && this.webglSystem && this.webglCanvas) {
                debugLog('PLANET-WEBGL', 'Using WebGL rendering path');
                
                try {
                    // Simple high-level API - WebGLSystem handles all complexity internally
                    const renderSuccess = this.webglSystem.renderPlanet(planetImage, globe, view);
                    
                    if (renderSuccess) {
                        debugLog('PLANET-WEBGL', 'WebGL planet rendering completed successfully');
                        
                        // Return WebGL canvas directly - no ImageData conversion needed!
                        return {
                            imageData: null,  // No ImageData when using WebGL
                            planetType,
                            webglCanvas: this.webglCanvas
                        };
                    } else {
                        debugLog('PLANET-WEBGL', 'WebGL planet rendering failed');
                        // Fall through to 2D rendering
                    }
                    
                } catch (error) {
                    debugLog('PLANET-WEBGL', 'WebGL rendering failed, falling back to 2D:', error);
                    // Fall through to 2D rendering
                }
            }
            
            // 2D fallback rendering
            debugLog('PLANET', 'Using 2D canvas fallback rendering');
            
            if (!this.ctx) {
                throw new Error("2D context not available for fallback rendering");
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
        } catch (error) {
            console.error('[PLANET] Error generating planet surface:', error);
            return {
                imageData: null,
                planetType,
                webglCanvas: null
            };
        }
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
    public reinitializeWebGL(): void {
        if (this.webglSystem) {
            debugLog('PLANET-WEBGL', 'Reinitializing WebGL system due to projection change');
            
            // Dispose the old WebGL system completely
            this.webglSystem.dispose();
            this.webglSystem = null;
            this.useWebGL = false;
            
            // Recreate WebGL system from scratch
            this.initializeWebGL();
            this.regeneratePlanet();
            debugLog('PLANET-WEBGL', `WebGL reinitialization complete. Using WebGL: ${this.useWebGL}`);
        }
    }
} 