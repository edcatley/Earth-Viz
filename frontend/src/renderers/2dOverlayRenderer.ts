// 2D Overlay Renderer
// Handles rendering of 2D overlay elements

import { Globe, ViewportSize } from '../core/Globes';

// Constants
const OVERLAY_ALPHA = Math.floor(0.4 * 255); // overlay transparency (on scale [0, 255])

export class OverlayRenderer2D {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private overlayImageData: ImageData | null = null;
    private overlayProduct: any = null;

    constructor() {
        this.canvas = document.createElement("canvas");
        this.ctx = this.canvas.getContext("2d")!;
    }

    /**
     * Initialize the renderer with viewport size
     */
    public initialize(view: ViewportSize): void {
        this.canvas.width = view.width;
        this.canvas.height = view.height;
        this.overlayImageData = this.ctx.createImageData(view.width, view.height);
    }
    
    /**
     * Get the canvas for blitting
     */
    public getCanvas(): HTMLCanvasElement {
        return this.canvas;
    }

    /**
     * Setup overlay data (matches WebGL pattern)
     */
    public setup(overlayProduct: any): void {
        this.overlayProduct = overlayProduct;
    }

    /**
     * Render overlay data to internal canvas
     */
    public render(globe: Globe, mask: any, view: ViewportSize): void {
        if (!this.overlayProduct) return;

        // Recreate ImageData if size changed
        if (!this.overlayImageData || 
            this.overlayImageData.width !== view.width || 
            this.overlayImageData.height !== view.height) {
            this.canvas.width = view.width;
            this.canvas.height = view.height;
            this.overlayImageData = this.ctx.createImageData(view.width, view.height);
        }

        // Clear and generate
        const overlayData = this.overlayImageData.data;
        overlayData.fill(0);
        const bounds = globe.bounds(view);
        this.generateOverlayData(this.overlayProduct, globe, view, mask, bounds, overlayData);
        
        // Put onto internal canvas
        this.ctx.putImageData(this.overlayImageData, 0, 0);
    }

    /**
     * Generate 2D overlay data by iterating through visible pixels
     */
    private generateOverlayData(
        overlayProduct: any,
        globe: Globe,
        view: ViewportSize,
        mask: any,
        bounds: any,
        overlayData: Uint8ClampedArray
    ): void {
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
                                // Vector products return [u, v, magnitude], we want magnitude
                                const rawValue = Array.isArray(overlayValue) ? overlayValue[2] : overlayValue;

                                // Skip if no valid value
                                if (rawValue == null || !isFinite(rawValue)) {
                                    continue;
                                }

                                // Convert value to color
                                const overlayColor = overlayProduct.scale.gradient(rawValue, OVERLAY_ALPHA);

                                if (overlayColor && overlayColor.length >= 3) {
                                    // Store color in 2x2 pixel block
                                    this.setPixelColor(overlayData, view.width, x, y, overlayColor);
                                    this.setPixelColor(overlayData, view.width, x + 1, y, overlayColor);
                                    this.setPixelColor(overlayData, view.width, x, y + 1, overlayColor);
                                    this.setPixelColor(overlayData, view.width, x + 1, y + 1, overlayColor);
                                }
                            }
                        }
                    }
                }
            }
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
            data[i + 3] = rgba[3] || 0; // alpha
        }
    }

    /**
     * Clear the canvas
     */
    public clear(): void {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    /**
     * Dispose of resources
     */
    public dispose(): void {
        this.overlayImageData = null;
        this.overlayProduct = null;
    }
}
