/**
 * RenderSystem - handles all rendering operations for the earth visualization
 * Manages canvases, particles, overlays, and SVG map rendering
 */
import { Globe, DisplayOptions, Point, GeoPoint } from '../core/Globes';
export interface RenderData {
    globe: Globe;
    overlayGrid?: any;
    meshCanvas?: HTMLCanvasElement | null;
    overlayCanvas?: HTMLCanvasElement | null;
    planetCanvas?: HTMLCanvasElement | null;
    particleCanvas?: HTMLCanvasElement | null;
}
export declare class RenderSystem {
    private display;
    private canvas;
    private context;
    private overlayCanvas;
    private overlayContext;
    private scaleCanvas;
    private scaleContext;
    constructor(display: DisplayOptions);
    /**
     * Initialize all canvas elements and contexts
     */
    setupCanvases(): void;
    /**
     * Set scale canvas size dynamically
     * Width: (menu width - label width) * 0.97
     * Height: label height / 2
     */
    private setSizeScale;
    /**
     * Clear the animation canvas completely
     */
    clearAnimationCanvas(): void;
    /**
     * Main rendering method - renders the complete frame
     */
    renderFrame(data: RenderData): void;
    /**
     * Draw color scale bar
     */
    private drawColorScale;
    /**
     * Draw location marker on foreground SVG
     */
    drawLocationMark(point: Point, coord: GeoPoint): void;
    /**
     * Check if rendering contexts are available
     */
    isReady(): boolean;
    /**
     * Update display dimensions (for window resize)
     */
    updateDisplay(display: DisplayOptions): void;
}
//# sourceMappingURL=RenderSystem.d.ts.map