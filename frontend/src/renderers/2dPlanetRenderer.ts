// 2D Planet Renderer
// Handles rendering of the planet in 2D mode

import { Globe, ViewportSize } from '../core/Globes';

export class PlanetRenderer2D {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private planetImage: HTMLImageElement | null = null;
    private planetImageData: ImageData | null = null;

    constructor() {
        this.canvas = document.createElement("canvas");
        this.ctx = this.canvas.getContext("2d")!;
    }

    /**
     * Initialize the renderer
     */
    public initialize(view: ViewportSize): void {
        this.canvas.width = view.width;
        this.canvas.height = view.height;
        this.planetImageData = this.ctx.createImageData(view.width, view.height);
    }
    
    /**
     * Get the canvas for blitting
     */
    public getCanvas(): HTMLCanvasElement {
        return this.canvas;
    }

    /**
     * Setup planet image - store reference for rendering
     */
    public setup(planetImage: HTMLImageElement): void {
        this.planetImage = planetImage;
    }

    /**
     * Render planet image to internal canvas
     */
    public render(globe: Globe, mask: any, view: ViewportSize): void {
        if (!this.planetImage) return;

        // Recreate ImageData if size changed
        if (!this.planetImageData || 
            this.planetImageData.width !== view.width || 
            this.planetImageData.height !== view.height) {
            this.canvas.width = view.width;
            this.canvas.height = view.height;
            this.planetImageData = this.ctx.createImageData(view.width, view.height);
        }

        // Clear and generate
        const planetData = this.planetImageData.data;
        planetData.fill(0);
        const bounds = globe.bounds(view);
        this.generatePlanetData(this.planetImage, globe, view, mask, bounds, planetData);
        
        // Put onto internal canvas
        this.ctx.putImageData(this.planetImageData, 0, 0);
    }

    /**
     * Generate 2D planet data by sampling from planet image
     */
    private generatePlanetData(
        planetImage: HTMLImageElement,
        globe: Globe,
        view: ViewportSize,
        mask: any,
        bounds: any,
        planetData: Uint8ClampedArray
    ): void {
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
     * Clear the canvas
     */
    public clear(): void {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.planetImageData = null;
    }

    /**
     * Dispose of resources
     */
    public dispose(): void {
        this.planetImage = null;
        this.planetImageData = null;
    }
}
