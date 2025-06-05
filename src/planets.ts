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
        stateProvider.on('configChanged', () => this.regeneratePlanet());
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
        const startTime = performance.now();
        debugLog('PLANET', `Generating ${planetType} surface`);
        
        try {
            // Load planet image
            const imageLoadStart = performance.now();
            const planetImage = await this.loadPlanetImage(planetType);
            const imageLoadTime = performance.now() - imageLoadStart;
            debugLog('PLANET-PERF', `Image load time: ${imageLoadTime.toFixed(2)}ms`);

            const bounds = globe.bounds(view);
            
            // Resize canvas if needed and create/reuse ImageData
            const resizeStart = performance.now();
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
            const resizeTime = performance.now() - resizeStart;
            debugLog('PLANET-PERF', `Canvas resize time: ${resizeTime.toFixed(2)}ms`);

            // Handle WebGL vs 2D rendering
            if (this.useWebGL && this.webglSystem && this.webglCanvas) {
                const webglStart = performance.now();
                debugLog('PLANET-WEBGL', 'Using WebGL rendering path');
                debugLog('PLANET-WEBGL', 'Canvas sizes:', {
                    webglCanvas: { width: this.webglCanvas.width, height: this.webglCanvas.height },
                    canvas2D: { width: this.canvas.width, height: this.canvas.height },
                    view: { width: view.width, height: view.height }
                });
                
                try {
                    // Use WebGLSystem's smart texture caching
                    const textureSuccess = this.webglSystem.setTextureFromImage('u_Texture', planetImage);
                    if (!textureSuccess) {
                        throw new Error('Failed to set planet texture');
                    }
                    
                    // Determine current projection type
                    const projectionType = this.getProjectionType(globe);
                    debugLog('PLANET-WEBGL', 'Projection type:', projectionType);
                    
                    // Build shader for current projection
                    const shaderStart = performance.now();
                    const [vertexShader, fragmentShader] = buildShader({
                        projectionType,
                        renderType: 'texture',
                        samplingType: 'simple'
                    });
                    const shaderTime = performance.now() - shaderStart;
                    debugLog('PLANET-PERF', `Shader build time: ${shaderTime.toFixed(2)}ms`);
                    
                    // Get projection uniforms
                    const uniformStart = performance.now();
                    const projectionUniforms = this.getProjectionUniforms(globe, view);
                    debugLog('PLANET-WEBGL', 'Projection uniforms:', projectionUniforms);
                    
                    // Grid uniforms for coordinate transformation
                    const gridUniforms = {
                        u_Low: [-180.0, -90.0],  // [min_lon, min_lat] in degrees
                        u_Size: [360.0, 180.0]   // [lon_range, lat_range] in degrees
                    };
                    debugLog('PLANET-WEBGL', 'Grid uniforms:', gridUniforms);
                    const uniformTime = performance.now() - uniformStart;
                    debugLog('PLANET-PERF', `Uniform setup time: ${uniformTime.toFixed(2)}ms`);
                    
                    // Create WebGL layer
                    const planetLayer: WebGLLayer = {
                        shaderSource: [vertexShader, fragmentShader],
                        textures: {
                            'u_Texture': {
                                internalFormat: this.webglSystem.isAvailable() ? 6408 : 6408, // GL_RGBA
                                format: 6408, // GL_RGBA
                                type: 5121, // GL_UNSIGNED_BYTE
                                width: planetImage.width,
                                height: planetImage.height
                            }
                        },
                        uniforms: {
                            u_canvasSize: [view.width, view.height],
                            ...projectionUniforms,
                            ...gridUniforms
                        }
                    };
                    
                    // Render with WebGL
                    const renderStart = performance.now();
                    const renderSuccess = this.webglSystem.render([planetLayer], [view.width, view.height]);
                    const renderTime = performance.now() - renderStart;
                    debugLog('PLANET-PERF', `WebGL render time: ${renderTime.toFixed(2)}ms`);
                    
                    if (renderSuccess) {
                        debugLog('PLANET-WEBGL', 'WebGL planet rendering completed successfully');
                        
                        // Copy WebGL canvas to 2D canvas and extract ImageData
                        const copyStart = performance.now();
                        if (this.ctx) {
                            this.ctx.clearRect(0, 0, view.width, view.height);
                            this.ctx.drawImage(this.webglCanvas, 0, 0);
                            this.planetImageData = this.ctx.getImageData(0, 0, view.width, view.height);
                            
                            const copyTime = performance.now() - copyStart;
                            debugLog('PLANET-PERF', `Canvas copy time: ${copyTime.toFixed(2)}ms`);
                            debugLog('PLANET-WEBGL', 'WebGL canvas data copied to ImageData');
                            
                            const totalWebGLTime = performance.now() - webglStart;
                            debugLog('PLANET-PERF', `Total WebGL time: ${totalWebGLTime.toFixed(2)}ms`);
                            
                            return {
                                imageData: this.planetImageData,
                                planetType,
                                webglCanvas: this.webglCanvas
                            };
                        } else {
                            debugLog('PLANET-WEBGL', 'No 2D context available for canvas readback');
                        }
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
            
            const fallbackStart = performance.now();
            
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
            const pixelLoopStart = performance.now();
            let pixelCount = 0;
            for (let x = bounds.x; x <= bounds.xMax; x += 1) {
                for (let y = bounds.y; y <= bounds.yMax; y += 1) {
                    if (mask.isVisible(x, y)) {
                        pixelCount++;
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
            const pixelLoopTime = performance.now() - pixelLoopStart;
            const fallbackTime = performance.now() - fallbackStart;
            
            debugLog('PLANET-PERF', `2D pixel loop time: ${pixelLoopTime.toFixed(2)}ms (${pixelCount} pixels)`);
            debugLog('PLANET-PERF', `Total 2D fallback time: ${fallbackTime.toFixed(2)}ms`);
            
            const totalTime = performance.now() - startTime;
            debugLog('PLANET-PERF', `Total planet generation time: ${totalTime.toFixed(2)}ms`);
            
            return {
                imageData: this.planetImageData,
                planetType,
                webglCanvas: null
            };
        } catch (error) {
            const totalTime = performance.now() - startTime;
            debugLog('PLANET-PERF', `Planet generation failed after ${totalTime.toFixed(2)}ms`);
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
     * Determine projection type from globe object
     */
    private getProjectionType(globe: Globe): 'orthographic' | 'equirectangular' | 'rotated_orthographic' {
        // Check the projection type from the globe
        if (globe.projection && globe.projection.constructor) {
            const projectionName = globe.projection.constructor.name;
            
            if (projectionName.includes('orthographic') || projectionName.includes('Orthographic')) {
                return 'orthographic';
            } else if (projectionName.includes('equirectangular') || projectionName.includes('Equirectangular')) {
                return 'equirectangular';
            }
        }
        
        // Default to orthographic
        return 'orthographic';
    }
    
    /**
     * Extract projection uniforms from globe and view
     */
    private getProjectionUniforms(globe: Globe, view: ViewportSize): { [key: string]: any } {
        const uniforms: { [key: string]: any } = {};
        
        // Get projection parameters
        if (globe.projection) {
            // Get basic D3 projection parameters
            const rotate = globe.projection.rotate ? globe.projection.rotate() : [0, 0, 0];
            const scale = globe.projection.scale ? globe.projection.scale() : 150;
            const translate = globe.projection.translate ? globe.projection.translate() : [view.width / 2, view.height / 2];
            
            // Convert to radians
            const λ0 = rotate[0] * Math.PI / 180;  // longitude rotation
            const φ0 = rotate[1] * Math.PI / 180;  // latitude rotation
            
            // Determine projection type and compute specific uniforms
            const projectionType = this.getProjectionType(globe);
            
            if (projectionType === 'orthographic') {
                // Orthographic projection uniforms
                uniforms.u_translate = translate;
                uniforms.u_R2 = scale * scale;
                uniforms.u_lon0 = -λ0;  // Negate longitude to match D3 behavior
                uniforms.u_sinlat0 = Math.sin(-φ0);  // Negate latitude to match D3 behavior
                uniforms.u_Rcoslat0 = scale * Math.cos(-φ0);
                uniforms.u_coslat0dR = Math.cos(-φ0) / scale;
                uniforms.u_flip = (-φ0 >= -Math.PI/2 && -φ0 <= Math.PI/2) ? 1.0 : -1.0;
            } else if (projectionType === 'equirectangular') {
                // Equirectangular projection uniforms
                uniforms.u_translate = translate;
                uniforms.u_R = scale;
                uniforms.u_lon0 = -λ0;  // Negate longitude to match D3 behavior
            } else {
                // Rotated orthographic or other projections
                uniforms.u_translate = translate;
                uniforms.u_R = scale;
                uniforms.u_lon0 = -λ0;  // Negate longitude to match D3 behavior
                uniforms.u_sinlat0 = Math.sin(-φ0);
                uniforms.u_coslat0 = Math.cos(-φ0);
                // For rotated orthographic, we'd need gamma rotation too
                uniforms.u_singam0 = Math.sin(rotate[2] * Math.PI / 180);
                uniforms.u_cosgam0 = Math.cos(rotate[2] * Math.PI / 180);
            }
        }
        
        return uniforms;
    }
} 