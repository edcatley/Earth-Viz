/**
 * RenderSystem - handles all rendering operations for the earth visualization
 * Manages canvases, particles, overlays, and SVG map rendering
 */

import * as d3 from 'd3';
import { Utils } from '../utils/Utils';
import { Globe, DisplayOptions, Point, GeoPoint } from '../core/Globes';

// Debug logging - enabled
function debugLog(section: string, message: string, data?: any): void {
    console.debug(`[${section}] ${message}`, data || '');
}

// Constants from original

export interface RenderData {
    globe: Globe;
    overlayGrid?: any;  // For color scale

    // Single canvas per system - each system decides internally whether to use WebGL or 2D
    meshCanvas?: HTMLCanvasElement | null;     // Single mesh canvas output
    overlayCanvas?: HTMLCanvasElement | null;  // Single overlay canvas output  
    planetCanvas?: HTMLCanvasElement | null;   // Single planet canvas output
    particleCanvas?: HTMLCanvasElement | null; // Single particle canvas output
}

export class RenderSystem {
    private display: DisplayOptions;

    // Canvas elements and contexts
    private canvas: HTMLCanvasElement | null = null;
    private context: CanvasRenderingContext2D | null = null;
    private overlayCanvas: HTMLCanvasElement | null = null;
    private overlayContext: CanvasRenderingContext2D | null = null;
    private scaleCanvas: HTMLCanvasElement | null = null;
    private scaleContext: CanvasRenderingContext2D | null = null;
    
    // Scale listener tracking
    private scaleListenerSetup: boolean = false;
    private lastOverlayGrid: any = null;

    constructor(display: DisplayOptions) {
        this.display = display;
    }

    /**
     * Initialize all canvas elements and contexts
     */
    public setupCanvases(): void {
        // Setup animation canvas
        this.canvas = d3.select("#animation").node() as HTMLCanvasElement;
        if (this.canvas) {
            this.context = this.canvas.getContext("2d");
            this.canvas.width = this.display.width;
            this.canvas.height = this.display.height;

            // Set up canvas properties like the original
            if (this.context) {
                this.context.fillStyle = Utils.isFF() ? "rgba(0, 0, 0, 0.95)" : "rgba(0, 0, 0, 0.97)";  // FF Mac alpha behaves oddly
            }
        }

        // Setup overlay canvas
        this.overlayCanvas = d3.select("#overlay").node() as HTMLCanvasElement;
        if (this.overlayCanvas) {
            this.overlayContext = this.overlayCanvas.getContext("2d");
            this.overlayCanvas.width = this.display.width;
            this.overlayCanvas.height = this.display.height;
        }

        // Setup scale canvas
        this.scaleCanvas = d3.select("#scale").node() as HTMLCanvasElement;
        if (this.scaleCanvas) {
            this.scaleContext = this.scaleCanvas.getContext("2d");

            // Set scale canvas dimensions dynamically
            this.setSizeScale();
        }
    }

    /**
     * Set scale canvas size dynamically 
     * Width: (menu width - label width) * 0.97
     * Height: label height / 2
     */
    private setSizeScale(): void {
        if (!this.scaleCanvas) return;

        const label = d3.select("#scale-label").node() as HTMLElement;
        const menu = d3.select("#menu").node() as HTMLElement;

        if (label && menu) {
            const width = (menu.offsetWidth - label.offsetWidth) * 0.6;
            const height = label.offsetHeight / 2;

            d3.select("#scale")
                .attr("width", width)
                .attr("height", height);
        }
    }



    /**
     * Clear the animation canvas completely
     */
    public clearAnimationCanvas(): void {
        if (!this.context) return;

        this.context.clearRect(0, 0, this.display.width, this.display.height);
    }

    /**
     * Main rendering method - renders the complete frame
     */
    public renderFrame(data: RenderData): void {
        if (!data.globe) {
            return;
        }

        const t0 = performance.now();

        try {
            // 1. Clear everything
            this.clearAnimationCanvas();
            Utils.clearCanvas(this.overlayCanvas!);
            if (this.scaleCanvas) {
                Utils.clearCanvas(this.scaleCanvas);
            }

            const t1 = performance.now();

            // SVG map structure is now handled by Earth.ts lifecycle

            // 2. Draw planet canvas (if provided)
            if (data.planetCanvas) {
                this.overlayContext!.drawImage(data.planetCanvas, 0, 0);
            }

            const t2 = performance.now();

            // 3. Draw overlay canvas (if provided)
            if (data.overlayCanvas) {
                this.overlayContext!.drawImage(data.overlayCanvas, 0, 0);
            }

            const t3 = performance.now();

            // 4. Draw mesh canvas (if provided)
            if (data.meshCanvas) {
                this.overlayContext!.drawImage(data.meshCanvas, 0, 0);
            }

            const t4 = performance.now();

            // 5. Draw particle canvas (if provided) with special blending
            if (data.particleCanvas) {
                // Use "lighter" blending for particles to create glowing effect
                const prevCompositeOperation = this.overlayContext!.globalCompositeOperation;
                this.overlayContext!.globalCompositeOperation = "lighter";
                this.overlayContext!.drawImage(data.particleCanvas, 0, 0);
                this.overlayContext!.globalCompositeOperation = prevCompositeOperation;
            }

            const t5 = performance.now();

            // 6. Draw color scale (if provided)
            if (data.overlayGrid) {
                this.drawColorScale(data.overlayGrid);
            }

            const t6 = performance.now();

            //console.log(`[RENDER-FRAME] Clear: ${(t1-t0).toFixed(2)}ms, Planet: ${(t2-t1).toFixed(2)}ms, Overlay: ${(t3-t2).toFixed(2)}ms, Mesh: ${(t4-t3).toFixed(2)}ms, Particles: ${(t5-t4).toFixed(2)}ms, Scale: ${(t6-t5).toFixed(2)}ms, Total: ${(t6-t0).toFixed(2)}ms`);

        } catch (error) {
            console.error('Frame render failed:', error);
            throw error;
        }
    }








    /**
     * Setup scale tooltip listener (called once)
     */
    private setupScaleTooltip(): void {
        const colorBar = d3.select("#scale");
        const canvas = this.scaleCanvas!;
        const width = canvas.width - 1;

        colorBar.on("mousemove", (event) => {
            if (!this.lastOverlayGrid?.scale) return;

            const [x] = d3.pointer(event);
            const pct = Utils.clamp((Math.round(x) - 2) / (width - 2), 0, 1);
            const bounds = this.lastOverlayGrid.scale.bounds;
            if (!bounds) return;

            const value = Utils.spread(pct, bounds[0], bounds[1]);

            if (this.lastOverlayGrid.units?.[0]) {
                const units = this.lastOverlayGrid.units[0];
                const convertedValue = units.conversion(value);
                const formattedValue = convertedValue.toFixed(units.precision);
                colorBar.attr("title", `${formattedValue} ${units.label}`);
            } else {
                colorBar.attr("title", `${value.toFixed(1)}`);
            }
        });
    }

    /**
     * Draw color scale bar
     */
    private drawColorScale(overlayGrid: any): void {
        if (!this.scaleContext || !overlayGrid.scale) {
            return;
        }

        const canvas = this.scaleCanvas!;
        const ctx = this.scaleContext;
        const scale = overlayGrid.scale;
        const bounds = scale.bounds;

        if (!bounds) return;

        // Setup tooltip listener on first call
        if (!this.scaleListenerSetup) {
            this.setupScaleTooltip();
            this.scaleListenerSetup = true;
        }

        // Store current overlay grid for tooltip handler
        this.lastOverlayGrid = overlayGrid;

        // Draw gradient bar
        const width = canvas.width - 1;
        for (let i = 0; i <= width; i++) {
            const value = Utils.spread(i / width, bounds[0], bounds[1]);
            const rgb = scale.gradient(value, 1);
            ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
            ctx.fillRect(i, 0, 1, canvas.height);
        }
    }

    /**
     * Draw location marker on foreground SVG
     */
    public drawLocationMark(point: Point, coord: GeoPoint): void {
        debugLog('LOCATION', 'Drawing location mark', { point, coord });

        const foregroundSvg = d3.select("#foreground");
        foregroundSvg.selectAll(".location-mark").remove();

        foregroundSvg.append("circle")
            .attr("class", "location-mark")
            .attr("cx", point[0])
            .attr("cy", point[1])
            .attr("r", 5)
            .style("fill", "red")
            .style("stroke", "white")
            .style("stroke-width", 2);
    }

    /**
     * Check if rendering contexts are available
     */
    public isReady(): boolean {
        return !!(this.context && this.overlayContext && this.scaleContext);
    }

    /**
     * Update display dimensions (for window resize)
     */
    public updateDisplay(display: DisplayOptions): void {
        this.display = display;

        // Update canvas dimensions
        if (this.canvas) {
            this.canvas.width = display.width;
            this.canvas.height = display.height;
        }

        if (this.overlayCanvas) {
            this.overlayCanvas.width = display.width;
            this.overlayCanvas.height = display.height;
        }

        debugLog('UPDATE', 'Display updated', {
            width: display.width,
            height: display.height
        });
    }


} 