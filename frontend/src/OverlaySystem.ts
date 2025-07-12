/**
 * OverlaySystem - Pure observer that automatically regenerates overlays
 * 
 * This system subscribes to external state changes and automatically
 * regenerates overlays when relevant state changes, without needing
 * explicit method calls.
 * 
 * Emits 'overlayChanged' events when overlay is regenerated.
 */

import * as d3 from 'd3';
import { Utils } from './utils/Utils';
import { WebGLRenderer } from './services/WebGLRenderer';

// Debug logging
function debugLog(category: string, message: string, data?: any): void {
    console.log(`[${category}] ${message}`, data || '');
}

import { Globe, ViewportSize, Bounds } from './Globes';

// Constants
const OVERLAY_ALPHA = Math.floor(0.4 * 255); // overlay transparency (on scale [0, 255])

export interface OverlayResult {
    imageData: ImageData | null;
    overlayType: string;
    overlayProduct: any;
    webglCanvas?: HTMLCanvasElement | null;  // WebGL canvas for GPU acceleration
}

export class OverlaySystem {
    private canvas: HTMLCanvasElement;  // 2D canvas for ImageData operations
    private ctx: CanvasRenderingContext2D | null = null;
    private webglCanvas: HTMLCanvasElement | null = null;  // Invisible WebGL canvas
    private overlayImageData: ImageData | null = null;
    
    // WebGL system for GPU acceleration
    private webglRenderer: WebGLRenderer | null = null;
    private useWebGL: boolean = false;
    
    // External state references (we observe these)
    private stateProvider: any = null;
    
    // Event callbacks
    private eventHandlers: { [key: string]: Function[] } = {};
    
    constructor() {
        // Create 2D canvas for ImageData operations
        this.canvas = document.createElement("canvas");
        const ctx = this.canvas.getContext("2d");
        if (!ctx) {
            throw new Error("Failed to create 2D canvas context for OverlaySystem");
        }
        this.ctx = ctx;
        
        // Try to initialize WebGL system with separate canvas
        this.initializeWebGL();
    }
    
    /**
     * Initialize WebGL system with testing
     */
    private initializeWebGL(): void {
        console.log('[OVERLAY-WEBGL] Attempting to initialize WebGL system');
        
        // Only initialize if we have overlay data and overlay is actually enabled
        const config = this.stateProvider?.getConfig();
        const overlayProduct = this.stateProvider?.getOverlayProduct();
        const globe = this.stateProvider?.getGlobe();
        const overlayType = config?.overlayType || 'off';
        
        if (!config || !overlayProduct || !globe || overlayType === 'off') {
            console.log(`[OVERLAY-WEBGL] Skipping WebGL init - overlay not active (type: ${overlayType})`);
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
                // Now setup the overlay with current data
                const overlayId = `overlay_${overlayType}`;
                console.log(`[OVERLAY-WEBGL] Setting up WebGL with overlayId: ${overlayId}, overlayType: ${overlayType}`);
                // TODO: Add UI option for interpolated lookup - using true for testing
                const useInterpolatedLookup = true;
                const setupSuccess = this.webglRenderer.setup('overlay', overlayProduct, overlayId, globe, useInterpolatedLookup);
                
                if (setupSuccess) {
                    this.useWebGL = true;
                    console.log('[OVERLAY-WEBGL] WebGL renderer initialized and overlay setup completed');
                    console.log('[OVERLAY-WEBGL] WebGL acceleration enabled for overlays');
                } else {
                    console.log('[OVERLAY-WEBGL] WebGL overlay setup failed');
                    this.webglRenderer = null;
                    this.webglCanvas = null;
                }
            } else {
                console.log('[OVERLAY-WEBGL] WebGL renderer initialization failed');
                this.webglRenderer = null;
                this.webglCanvas = null;
            }
        } catch (error) {
            console.log('[OVERLAY-WEBGL] WebGL setup error:', error);
            if (this.webglRenderer) {
                this.webglRenderer.dispose();
                this.webglRenderer = null;
            }
            this.webglCanvas = null;
        }
        
        if (!this.useWebGL) {
            console.log('[OVERLAY-WEBGL] Falling back to 2D canvas rendering for overlays');
        }
    }

    /**
     * Reinitialize WebGL system - call when data changes
     */
    public reinitializeWebGL(): void {
        if (this.webglRenderer) {
            console.log('[OVERLAY-WEBGL] Reinitializing WebGL system due to data change');
            
            // Dispose the old WebGL system completely
            this.webglRenderer.dispose();
            this.webglRenderer = null;
            this.useWebGL = false;
        }
            // Recreate WebGL system from scratch
            this.initializeWebGL();
            this.generateOverlay();
            console.log(`[OVERLAY-WEBGL] WebGL reinitialization complete. Using WebGL: ${this.useWebGL}`);
    }
    
    /**
     * Subscribe to external state provider - becomes a pure observer
     */
    observeState(stateProvider: any): void {
        this.stateProvider = stateProvider;
        
        // Initialize WebGL once when we first get state provider
        //this.initializeWebGL();
        
        // Subscribe to state changes that require re-rendering (not re-initialization)
        stateProvider.on('maskChanged', () => this.generateOverlay()); // Listen maskChanged
        stateProvider.on('rotate', () => this.generateOverlay()); // Listen to rotate
        
        // Subscribe to data changes that require WebGL re-setup
        stateProvider.on('weatherDataChanged', () => this.reinitializeWebGL());
        stateProvider.on('configChanged', () => this.reinitializeWebGL());
        stateProvider.on('systemsReady', () => this.reinitializeWebGL());
        
        console.log('[OVERLAY] Now observing external state changes');
    }
    
   
    /**
     * Subscribe to overlay change events
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
     * Generate overlay - gets state from provider and delegates to appropriate renderer
     */
    private generateOverlay(): OverlayResult {
        if (!this.stateProvider) {
            return { imageData: null, overlayType: 'off', overlayProduct: null, webglCanvas: null };
        }
        console.log('[OVERLAY] Generating overlay');
        const globe = this.stateProvider.getGlobe();
        const mask = this.stateProvider.getMask();
        const view = this.stateProvider.getView();
        const config = this.stateProvider.getConfig();
        const overlayProduct = this.stateProvider.getOverlayProduct();
        const overlayType = config?.overlayType || 'off';
        
        // Need all required state
        if (!globe || !mask || !view || !config) {
            console.log('[OVERLAY] Skipping overlay - missing required state:', {
                hasGlobe: !!globe,
                hasMask: !!mask, 
                hasView: !!view,
                hasConfig: !!config,
                overlayType: config?.overlayType
            });
            return { imageData: null, overlayType: 'off', overlayProduct: null, webglCanvas: null };
        }
        
        // Skip if overlay is off
        if (config.overlayType === "off") {
            console.log('[OVERLAY] Skipping overlay - type is off');
            return { imageData: null, overlayType: 'off', overlayProduct: null, webglCanvas: null };
        }

        console.log(`[OVERLAY] Generating ${overlayType} overlay`);
        
        const bounds = globe.bounds(view);
        
        // Resize canvases if needed
        if (this.canvas.width !== view.width || this.canvas.height !== view.height) {
            this.canvas.width = view.width;
            this.canvas.height = view.height;
            this.overlayImageData = null; // Force recreation
            
            // Also resize WebGL canvas if using WebGL
            if (this.useWebGL && this.webglCanvas) {
                this.webglCanvas.width = view.width;
                this.webglCanvas.height = view.height;
            }
        }

        // Generate overlay using appropriate renderer
        const result = this.useWebGL 
            ? this.generateOverlayWebGL(overlayProduct, globe, view, mask, bounds, overlayType)
            : this.generateOverlay2D(overlayProduct, globe, view, mask, bounds, overlayType);

        // Update state and emit event
        this.overlayImageData = result.imageData;
        this.emit('overlayChanged', result);

        return result;
    }
        
    /**
     * Generate overlay using WebGL acceleration
     */
    private generateOverlayWebGL(
        overlayProduct: any, 
        globe: Globe, 
        view: ViewportSize, 
        mask: any, 
        bounds: any,
        overlayType: string
    ): OverlayResult {
        console.log('[OVERLAY-WEBGL] Using WebGL rendering path for overlay');
        
        try {
            // Just render - setup was done once in initializeWebGL
            const overlayId = `overlay_${overlayType}`;
            console.log(`[OVERLAY-WEBGL] Attempting to render with overlayId: ${overlayId}, overlayType: ${overlayType}, useWebGL: ${this.useWebGL}`);
            const renderSuccess = this.webglRenderer!.render(overlayId, globe, view);
            
            if (renderSuccess) {
                console.log('[OVERLAY-WEBGL] WebGL overlay rendering completed successfully');
                console.log(`[OVERLAY-WEBGL] Returning WebGL canvas: ${!!this.webglCanvas}, canvas size: ${this.webglCanvas?.width}x${this.webglCanvas?.height}`);
                
                return {
                    imageData: null,  // No ImageData when using WebGL
                    overlayType: overlayType,
                    overlayProduct: overlayProduct,
                    webglCanvas: this.webglCanvas
                };
            } else {
                console.log('[OVERLAY-WEBGL] WebGL overlay render failed - falling back to 2D');
            }
            
            // Fall back to 2D rendering
            console.log('[OVERLAY-WEBGL] WebGL failed, falling back to 2D');
            return this.generateOverlay2D(overlayProduct, globe, view, mask, bounds, overlayType);
            
        } catch (error) {
            console.log('[OVERLAY-WEBGL] WebGL overlay rendering failed, falling back to 2D:', error);
            // Fall back to 2D rendering
            return this.generateOverlay2D(overlayProduct, globe, view, mask, bounds, overlayType);
        }
    }



    /**
     * Generate overlay using 2D canvas rendering
     */
    private generateOverlay2D(
        overlayProduct: any, 
        globe: Globe, 
        view: ViewportSize, 
        mask: any, 
        bounds: any,
        overlayType: string
    ): OverlayResult {
        
        // 2D fallback rendering
        console.log('[OVERLAY] Using 2D canvas rendering for overlay');
        
        if (!this.overlayImageData) {
            if (!this.ctx) {
                throw new Error("2D context not available for overlay generation");
            }
            this.overlayImageData = this.ctx.createImageData(view.width, view.height);
        }
        
        // Clear the ImageData for reuse
        const overlayData = this.overlayImageData.data;
        overlayData.fill(0); // Clear to transparent
        
        // Iterate through visible pixels and generate overlay colors
        for (let x = bounds.x; x <= bounds.xMax; x += 2) {
            for (let y = bounds.y; y <= bounds.yMax; y += 2) {
                if (mask.isVisible(x, y)) {
                    const coord = globe.projection?.invert?.([x, y]);
                    
                    if (coord) {
                        const λ = coord[0], φ = coord[1];
                        
                        if (isFinite(λ)) {
                            // Get overlay value from weather data
                            const overlayValue = overlayProduct.interpolate(λ, φ);
                            if (overlayValue != null && overlayProduct.scale) {
                                // Handle both scalar and vector products
                                let rawValue: number;
                            
                                rawValue = overlayValue;
                                
                                // Skip if no valid value
                                if (rawValue == null || !isFinite(rawValue)) {
                                    continue;
                                }
                                

                                
                                // Convert value to color
                                const overlayColor = overlayProduct.scale.gradient(rawValue, OVERLAY_ALPHA);
                                
                                if (overlayColor && overlayColor.length >= 3) {
                                    // Store color in 2x2 pixel block (matching original behavior)
                                    this.setPixelColor(overlayData, view.width, x, y, overlayColor);
                                    this.setPixelColor(overlayData, view.width, x+1, y, overlayColor);
                                    this.setPixelColor(overlayData, view.width, x, y+1, overlayColor);
                                    this.setPixelColor(overlayData, view.width, x+1, y+1, overlayColor);
                                }
                            }
                        }
                    }
                }
            }
        }
        
        return {
            imageData: this.overlayImageData,
            overlayType: overlayType,
            overlayProduct: overlayProduct,
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
            data[i + 3] = rgba[3] || 0; // alpha
        }
    }
    
} 