// 2D Overlay Renderer
// Handles rendering of 2D overlay elements

import { Globe, ViewportSize } from '../core/Globes';

// Constants
const OVERLAY_ALPHA = Math.floor(0.4 * 255); // overlay transparency (on scale [0, 255])

export class OverlayRenderer2D {
    private overlayImageData: ImageData | null = null;
    private overlayProduct: any = null;

    constructor() {
        // Lightweight constructor
    }

    /**
     * Initialize the renderer with canvas context and viewport
     */
    public initialize(ctx: CanvasRenderingContext2D, view: ViewportSize): void {
        // Create ImageData for the current viewport size
        this.overlayImageData = ctx.createImageData(view.width, view.height);
    }

    /**
     * Setup overlay data (matches WebGL pattern)
     */
    public setup(overlayProduct: any): void {
        this.overlayProduct = overlayProduct;
    }

    /**
     * Render overlay data to the canvas
     */
    public render(
        ctx: CanvasRenderingContext2D,
        globe: Globe,
        mask: any,
        view: ViewportSize
    ): boolean {
        if (!this.overlayProduct) {
            console.error('[2D_OVERLAY] Render failed - no overlay product setup');
            return false;
        }

        try {
            // Recreate ImageData if size changed
            if (!this.overlayImageData || 
                this.overlayImageData.width !== view.width || 
                this.overlayImageData.height !== view.height) {
                this.overlayImageData = ctx.createImageData(view.width, view.height);
            }

            // Clear ImageData
            const overlayData = this.overlayImageData.data;
            overlayData.fill(0);

            // Generate overlay data
            const bounds = globe.bounds(view);
            this.generateOverlayData(this.overlayProduct, globe, view, mask, bounds, overlayData);

            // Put ImageData onto canvas
            ctx.putImageData(this.overlayImageData, 0, 0);

            return true;
        } catch (error) {
            console.error('[2D_OVERLAY] Render error:', error);
            return false;
        }
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
                                const rawValue = overlayValue;

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
    public clear(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    /**
     * Dispose of resources
     */
    public dispose(): void {
        this.overlayImageData = null;
        this.overlayProduct = null;
    }
}
