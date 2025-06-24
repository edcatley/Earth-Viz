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
import { WebGLSystem, WebGLLayer, buildShader } from './services/WebGLSystem';

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
    private webglSystem: WebGLSystem | null = null;
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
        debugLog('OVERLAY-WEBGL', 'Attempting to initialize WebGL system');
        
        try {
            // Create separate invisible canvas for WebGL
            this.webglCanvas = document.createElement("canvas");
            
            this.webglSystem = new WebGLSystem();
            const webglInitialized = this.webglSystem.initialize(this.webglCanvas);
            
            if (webglInitialized) {
                // Test WebGL with a simple render
                const testResult = this.webglSystem.testRender([512, 512]);
                
                if (testResult.success) {
                    //this.useWebGL = true;
                    debugLog('OVERLAY-WEBGL', `WebGL test passed! Render time: ${testResult.renderTime.toFixed(2)}ms`);
                    debugLog('OVERLAY-WEBGL', 'WebGL acceleration enabled for overlays');
                } else {
                    debugLog('OVERLAY-WEBGL', `WebGL test failed: ${testResult.error}`);
                    this.webglSystem.dispose();
                    this.webglSystem = null;
                    this.webglCanvas = null;
                }
            } else {
                debugLog('OVERLAY-WEBGL', 'WebGL initialization failed');
                this.webglSystem = null;
                this.webglCanvas = null;
            }
        } catch (error) {
            debugLog('OVERLAY-WEBGL', 'WebGL setup error:', error);
            if (this.webglSystem) {
                this.webglSystem.dispose();
                this.webglSystem = null;
            }
            this.webglCanvas = null;
        }
        
        if (!this.useWebGL) {
            debugLog('OVERLAY-WEBGL', 'Falling back to 2D canvas rendering for overlays');
        }
    }
    
    /**
     * Subscribe to external state provider - becomes a pure observer
     */
    observeState(stateProvider: any): void {
        this.stateProvider = stateProvider;
        
        // Subscribe to all relevant state changes
        stateProvider.on('globeChanged', () => this.regenerateOverlay());
        stateProvider.on('weatherDataChanged', () => this.regenerateOverlay());
        stateProvider.on('configChanged', () => this.regenerateOverlay());
        stateProvider.on('systemsReady', () => this.regenerateOverlay());
        
        debugLog('OVERLAY', 'Now observing external state changes');
    }
    
    /**
     * Get current overlay data
     */
    getOverlayData(): ImageData | null {
        return this.overlayImageData;
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
     * Automatically regenerate overlay when observed state changes
     */
    private regenerateOverlay(): void {
        if (!this.stateProvider) return;
        
        // Get current state from provider
        const globe = this.stateProvider.getGlobe();
        const mask = this.stateProvider.getMask();
        const view = this.stateProvider.getView();
        const config = this.stateProvider.getConfig();
        const overlayProduct = this.stateProvider.getOverlayProduct();
        
        // Need all required state to generate overlay
        if (!globe || !mask || !view || !config) {
            return;
        }
        
        const result = this.generateOverlay(overlayProduct, globe, mask, view, config.overlayType);
        this.overlayImageData = result.imageData;
        
        // Emit change event with both imageData and overlay product
        this.emit('overlayChanged', result);
    }
    
    /**
     * Internal overlay generation with WebGL support
     */
    private generateOverlay(
        overlayProduct: any,
        globe: Globe,
        mask: any,
        view: ViewportSize,
        overlayType: string
    ): OverlayResult {
        debugLog('OVERLAY', `Generating ${overlayType} overlay`);
        
        // No overlay requested
        if (!overlayProduct || !overlayType || overlayType === "off") {
            debugLog('GENERATE', 'No overlay requested');
            return { imageData: null, overlayType, overlayProduct: null, webglCanvas: null };
        }
        
        // DEBUG: Log overlay product details
        if (overlayProduct.scale) {
            console.log('[OVERLAY-DEBUG] Scale bounds:', overlayProduct.scale.bounds);
            console.log('[OVERLAY-DEBUG] Scale gradient function:', typeof overlayProduct.scale.gradient);
        }
        
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
        
        // Try WebGL rendering first
        if (this.useWebGL && this.webglSystem && this.webglCanvas && overlayProduct.scale) {
            debugLog('OVERLAY-WEBGL', 'Using WebGL rendering path for overlay');
            
            // Debug: Log what we're passing to WebGL
            console.log('[OVERLAY-DEBUG] About to call WebGL renderOverlay with:', {
                overlayProduct,
                hasInterpolate: typeof overlayProduct.interpolate === 'function',
                hasScale: !!overlayProduct.scale,
                scaleBounds: overlayProduct.scale?.bounds,
                overlayType
            });
            
            try {
                // Use WebGL system to render overlay data - similar to planet rendering
                const renderSuccess = this.webglSystem.renderOverlay(overlayProduct, globe, view);
                
                if (renderSuccess) {
                    debugLog('OVERLAY-WEBGL', 'WebGL overlay rendering completed successfully');
                    
                    // Return WebGL canvas directly - no ImageData conversion needed!
                    return {
                        imageData: null,  // No ImageData when using WebGL
                        overlayType,
                        overlayProduct,
                        webglCanvas: this.webglCanvas
                    };
                } else {
                    debugLog('OVERLAY-WEBGL', 'WebGL overlay rendering failed, falling back to 2D');
                    // Fall through to 2D rendering
                }
                
            } catch (error) {
                debugLog('OVERLAY-WEBGL', 'WebGL overlay rendering failed, falling back to 2D:', error);
                // Fall through to 2D rendering
            }
        }
        
        // 2D fallback rendering (existing logic)
        debugLog('OVERLAY', 'Using 2D canvas rendering for overlay');
        
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
                            
                                // Scalar product (temperature, humidity, etc.) - use value directly
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
            overlayType,
            overlayProduct,
            webglCanvas: null  // Will be WebGL canvas when implemented
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
    
    /**
     * Reinitialize WebGL system - call when projection changes
     * Completely disposes and recreates the WebGL system for clean state
     */
    public reinitializeWebGL(): void {
        if (this.webglSystem) {
            debugLog('OVERLAY-WEBGL', 'Reinitializing WebGL system due to projection change');
            
            // Dispose the old WebGL system completely
            this.webglSystem.dispose();
            this.webglSystem = null;
            this.useWebGL = false;
            
            // Recreate WebGL system from scratch
            this.initializeWebGL();
            
            debugLog('OVERLAY-WEBGL', `WebGL reinitialization complete. Using WebGL: ${this.useWebGL}`);
        }
    }
} 