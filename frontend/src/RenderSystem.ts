/**
 * RenderSystem - handles all rendering operations for the earth visualization
 * Manages canvases, particles, overlays, and SVG map rendering
 */

import * as d3 from 'd3';
import { Utils } from './utils/Utils';
import { Globe, DisplayOptions, Point, GeoPoint, ViewportSize } from './Globes';

// Debug logging - enabled
function debugLog(section: string, message: string, data?: any): void {
    console.debug(`[${section}] ${message}`, data || '');
}

// Constants from original
const PARTICLE_LINE_WIDTH = 1.0;

export interface RenderData {
    globe: Globe;
    overlayGrid?: any;  // For color scale
    buckets?: Array<Array<{ age: number; x: number; y: number; xt?: number; yt?: number }>>;
    colorStyles?: string[] & { indexFor: (m: number) => number };

    // Single canvas per system - each system decides internally whether to use WebGL or 2D
    meshCanvas?: HTMLCanvasElement | null;     // Single mesh canvas output
    overlayCanvas?: HTMLCanvasElement | null;  // Single overlay canvas output  
    planetCanvas?: HTMLCanvasElement | null;   // Single planet canvas output
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
                this.context.lineWidth = PARTICLE_LINE_WIDTH;
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

            // Set scale canvas dimensions dynamically like earth.js does
            this.setSizeScale();
        }
    }

    /**
     * Set scale canvas size dynamically like the original earth.js
     * Width: (menu width - label width) * 0.97
     * Height: label height / 2
     */
    private setSizeScale(): void {
        if (!this.scaleCanvas) return;

        const label = d3.select("#scale-label").node() as HTMLElement;
        const menu = d3.select("#menu").node() as HTMLElement;

        if (label && menu) {
            const width = (menu.offsetWidth - label.offsetWidth) * 0.97;
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

        try {
            // 1. Clear everything
            this.clearAnimationCanvas();
            Utils.clearCanvas(this.overlayCanvas!);
            if (this.scaleCanvas) {
                Utils.clearCanvas(this.scaleCanvas);
            }

            // Setup map SVG structure (graticule, etc.)
            this.setupMapStructure(data.globe);

            // 2. Draw planet canvas (if provided)
            if (data.planetCanvas) {
                this.overlayContext!.drawImage(data.planetCanvas, 0, 0);
            }

            // 3. Draw overlay canvas (if provided)
            if (data.overlayCanvas) {
                this.overlayContext!.drawImage(data.overlayCanvas, 0, 0);
            }

            // 4. Draw mesh canvas (if provided)
            if (data.meshCanvas) {
                this.overlayContext!.drawImage(data.meshCanvas, 0, 0);
            }

            // 5. Draw particles (if provided)
            if (data.buckets && data.colorStyles && data.globe) {
                this.drawParticles(data.buckets, data.colorStyles, data.globe);
            }

            // 6. Mask visualization removed - mask is used internally for particle calculations only

            // 7. Draw color scale (if provided)
            if (data.overlayGrid) {
                this.drawColorScale(data.overlayGrid);
            }

        } catch (error) {
            console.error('Frame render failed:', error);
            throw error;
        }
    }

    /**
     * Setup the basic SVG map structure (graticule, etc.)
     * MeshSystem handles the actual mesh rendering
     */
    private setupMapStructure(globe: Globe): void {
        // Clear and setup SVG elements
        const mapNode = d3.select("#map").node();
        const foregroundNode = d3.select("#foreground").node();
        if (mapNode) (mapNode as Element).replaceChildren();
        if (foregroundNode) (foregroundNode as Element).replaceChildren();

        const mapSvg = d3.select("#map");
        const foregroundSvg = d3.select("#foreground");

        // Let the globe define its map structure (includes graticule)
        globe.defineMap(mapSvg, foregroundSvg);
    }





    /**
     * Draw particles on the animation canvas
     */
    public drawParticles(buckets: Array<Array<{ age: number; x: number; y: number; xt?: number; yt?: number }>>,
        colorStyles: string[] & { indexFor: (m: number) => number },
        globe: Globe): void {
        if (!this.context || !colorStyles) {
            console.log('[RENDER] Cannot draw particles - missing context or colorStyles');
            return;
        }

        // Get bounds for drawing particles
        const bounds = globe.bounds({ width: this.display.width, height: this.display.height });
        if (!bounds) {
            console.log('[RENDER] Cannot draw particles - no bounds');
            return;
        }


        // Fade existing particle trails - only clear the bounds area like the original
        const prev = this.context.globalCompositeOperation;
        this.context.globalCompositeOperation = "destination-in";
        this.context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
        this.context.globalCompositeOperation = prev;

        // Draw new particle trails using buckets like original
        this.context.lineWidth = PARTICLE_LINE_WIDTH;

        buckets.forEach((bucket, i) => {
            if (bucket.length > 0) {
                this.context!.beginPath();
                this.context!.strokeStyle = colorStyles[i];  // Use color from bucket index
                bucket.forEach(particle => {
                    if (particle.xt !== undefined && particle.yt !== undefined) {
                        this.context!.moveTo(particle.x, particle.y);
                        this.context!.lineTo(particle.xt, particle.yt);
                        particle.x = particle.xt;
                        particle.y = particle.yt;

                        delete particle.xt;
                        delete particle.yt;
                    }
                });
                this.context!.stroke();
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

        const width = canvas.width - 1;

        // Draw gradient bar
        for (let i = 0; i <= width; i++) {
            const value = Utils.spread(i / width, bounds[0], bounds[1]);
            const rgb = scale.gradient(value, 1); // Full opacity for scale
            ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
            ctx.fillRect(i, 0, 1, canvas.height);
        }

        // Add tooltip functionality like the original
        const colorBar = d3.select("#scale");
        colorBar.on("mousemove", (event) => {
            const [x] = d3.pointer(event);
            const pct = Utils.clamp((Math.round(x) - 2) / (width - 2), 0, 1);
            const value = Utils.spread(pct, bounds[0], bounds[1]);

            // Use proper unit formatting like the original earth.js
            if (overlayGrid.units && overlayGrid.units[0]) {
                const units = overlayGrid.units[0];
                const convertedValue = units.conversion(value);
                const formattedValue = convertedValue.toFixed(units.precision);

                colorBar.attr("title", `${formattedValue} ${units.label}`);
            } else {
                // Fallback for products without units
                colorBar.attr("title", `${value.toFixed(1)}`);
            }
        });


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