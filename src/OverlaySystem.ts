/**
 * OverlaySystem - handles overlay color generation independently from particles
 * 
 * This system generates colored overlays (temperature, pressure, etc.) by:
 * 1. Iterating through visible pixels on the globe
 * 2. Converting screen coordinates to geographic coordinates  
 * 3. Looking up overlay values from weather data
 * 4. Converting values to colors and storing in ImageData
 * 
 * This eliminates the insane data smuggling where overlay data was:
 * mask → particles → field → render system
 * 
 * Now it's clean: OverlaySystem → render system
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
}

export class OverlaySystem {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private overlayImageData: ImageData | null = null;
    
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
     * Generates overlay color data for the specified overlay product
     * 
     * @param overlayProduct Weather data product (temperature, pressure, etc.)
     * @param globe Globe projection and bounds
     * @param mask Visibility mask (only for isVisible testing)
     * @param view Viewport dimensions
     * @param overlayType Type of overlay being generated
     * @returns ImageData with overlay colors, or null if no overlay
     */
    generateOverlay(
        overlayProduct: any,
        globe: Globe,
        mask: any,
        view: ViewportSize,
        overlayType: string
    ): OverlayResult {
        
        console.log(overlayProduct);
        console.log(overlayType);
        // No overlay requested
        if (!overlayProduct || !overlayType || overlayType === "off") {
            debugLog('GENERATE', 'No overlay requested');
            return { imageData: null, overlayType };
        }

        debugLog('GENERATE', `Generating ${overlayType} overlay`);
        
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
        //overlayData.fill(0); // Clear to transparent
        
        let pixelsProcessed = 0;
        let pixelsWithData = 0;
        // Iterate through visible pixels and generate overlay colors
        for (let x = bounds.x; x <= bounds.xMax; x += 2) {
            for (let y = bounds.y; y <= bounds.yMax; y += 2) {
                //pixelsProcessed++;
                
                if (mask.isVisible(x, y)) {
                    const coord = globe.projection?.invert?.([x, y]);
                    
                    if (coord) {
                        const λ = coord[0], φ = coord[1];
                        
                        if (isFinite(λ)) {
                            // Get overlay value from weather data
                            const overlayValue = overlayProduct.interpolate(λ, φ);
                            if (overlayValue[2] != null && overlayProduct.scale) {
                                // Convert value to color
                                const overlayColor = overlayProduct.scale.gradient(overlayValue[2], OVERLAY_ALPHA);
                                
                                // Store color in 2x2 pixel block (matching original behavior)
                                this.setPixelColor(overlayData, view.width, x, y, overlayColor);
                                this.setPixelColor(overlayData, view.width, x+1, y, overlayColor);
                                this.setPixelColor(overlayData, view.width, x, y+1, overlayColor);
                                this.setPixelColor(overlayData, view.width, x+1, y+1, overlayColor);
                                //pixelsWithData++;
                            }
                        }
                    }
                }
            }
        }
        
        //debugLog('GENERATE', `Overlay generated: ${pixelsWithData} pixels with data out of ${pixelsProcessed} processed`);
        
        return {
            imageData: this.overlayImageData,
            overlayType
        };
    }
    
    /**
     * Helper to set RGBA color at specific pixel coordinates
     * 
     * @param data Flat RGBA array from ImageData
     * @param width Canvas width
     * @param x X coordinate
     * @param y Y coordinate  
     * @param rgba Color array [r, g, b, a]
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