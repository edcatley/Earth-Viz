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
    overlayProduct: any; // Include the product for scale information
}

export class OverlaySystem {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private overlayImageData: ImageData | null = null;
    
    // External state references (we observe these)
    private stateProvider: any = null;
    
    // Event callbacks
    private eventHandlers: { [key: string]: Function[] } = {};
    
    constructor() {
        // Create canvas and context once - reuse for all overlay generation
        this.canvas = document.createElement("canvas");
        const ctx = this.canvas.getContext("2d");
        if (!ctx) {
            throw new Error("Failed to create canvas context for OverlaySystem");
        }
        this.ctx = ctx;
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
     * Internal overlay generation (same logic as before)
     */
    private generateOverlay(
        overlayProduct: any,
        globe: Globe,
        mask: any,
        view: ViewportSize,
        overlayType: string
    ): OverlayResult {
        // No overlay requested
        if (!overlayProduct || !overlayType || overlayType === "off") {
            debugLog('GENERATE', 'No overlay requested');
            return { imageData: null, overlayType, overlayProduct: null };
        }

        debugLog('GENERATE', `Generating ${overlayType} overlay`);
        
        // DEBUG: Log overlay product details
        if (overlayProduct.scale) {
            console.log('[OVERLAY-DEBUG] Scale bounds:', overlayProduct.scale.bounds);
            console.log('[OVERLAY-DEBUG] Scale gradient function:', typeof overlayProduct.scale.gradient);
        }
        
        const bounds = globe.bounds(view);
        
        // Resize canvas if needed and create/reuse ImageData
        if (this.canvas.width !== view.width || this.canvas.height !== view.height) {
            this.canvas.width = view.width;
            this.canvas.height = view.height;
            this.overlayImageData = null; // Force recreation
        }
        
        if (!this.overlayImageData) {
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
            overlayProduct
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