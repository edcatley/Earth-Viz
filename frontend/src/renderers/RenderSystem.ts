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
    private lastOverlayScale: any = null;
    private lastOverlayUnits: any = null;
    
    // Cached D3 selections
    private foregroundSvg: d3.Selection<SVGSVGElement, unknown, HTMLElement, any> | null = null;

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
     * Main rendering method - renders the complete frame
     * Uses direct parameters to avoid object allocation in hot path
     */
    public renderFrame(
        globe: Globe,
        planetCanvas: HTMLCanvasElement | null,
        overlayCanvas: HTMLCanvasElement | null,
        meshCanvas: HTMLCanvasElement | null,
        particleCanvas: HTMLCanvasElement | null,
        overlayScale: any,
        overlayUnits: any
    ): void {
        if (!globe) {
            return;
        }

        try {
            // 1. Clear all canvases
            if (this.context) {
                this.context.clearRect(0, 0, this.display.width, this.display.height);
            }
            if (this.overlayContext) {
                this.overlayContext.clearRect(0, 0, this.display.width, this.display.height);
            }
            if (this.scaleContext && this.scaleCanvas) {
                this.scaleContext.clearRect(0, 0, this.scaleCanvas.width, this.scaleCanvas.height);
            }

            // SVG map structure is now handled by Earth.ts lifecycle

            // 2. Draw planet canvas (if provided)
            if (planetCanvas) {
                this.overlayContext!.drawImage(planetCanvas, 0, 0);
            }

            // 3. Draw overlay canvas (if provided)
            if (overlayCanvas) {
                this.overlayContext!.drawImage(overlayCanvas, 0, 0);
            }

            // 4. Draw mesh canvas (if provided)
            if (meshCanvas) {
                this.overlayContext!.drawImage(meshCanvas, 0, 0);
            }

            // 5. Draw particle canvas (if provided) with special blending
            if (particleCanvas) {
                // Use "lighter" blending for particles to create glowing effect
                const prevCompositeOperation = this.overlayContext!.globalCompositeOperation;
                this.overlayContext!.globalCompositeOperation = "lighter";
                this.overlayContext!.drawImage(particleCanvas, 0, 0);
                this.overlayContext!.globalCompositeOperation = prevCompositeOperation;
            }

            // 6. Draw color scale (if provided)
            if (overlayScale) {
                this.drawColorScale(overlayScale, overlayUnits);
            }

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
            if (!this.lastOverlayScale) return;

            const [x] = d3.pointer(event);
            const pct = Utils.clamp((Math.round(x) - 2) / (width - 2), 0, 1);
            const bounds = this.lastOverlayScale.bounds;
            if (!bounds) return;

            const value = Utils.spread(pct, bounds[0], bounds[1]);

            if (this.lastOverlayUnits?.[0]) {
                const units = this.lastOverlayUnits[0];
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
    private drawColorScale(scale: any, units: any): void {
        if (!this.scaleContext || !scale) {
            return;
        }

        const canvas = this.scaleCanvas!;
        const ctx = this.scaleContext;
        const bounds = scale.bounds;

        if (!bounds) return;

        // Setup tooltip listener on first call
        if (!this.scaleListenerSetup) {
            this.setupScaleTooltip();
            this.scaleListenerSetup = true;
        }

        // Store current scale/units for tooltip handler
        this.lastOverlayScale = scale;
        this.lastOverlayUnits = units;

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

        // Cache the foreground SVG selection
        if (!this.foregroundSvg) {
            this.foregroundSvg = d3.select("#foreground") as d3.Selection<SVGSVGElement, unknown, HTMLElement, any>;
        }

        this.foregroundSvg.selectAll(".location-mark").remove();

        this.foregroundSvg.append("circle")
            .attr("class", "location-mark")
            .attr("cx", point[0])
            .attr("cy", point[1])
            .attr("r", 5)
            .style("fill", "red")
            .style("stroke", "white")
            .style("stroke-width", 2);
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