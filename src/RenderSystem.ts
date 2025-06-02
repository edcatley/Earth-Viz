/**
 * RenderSystem - handles all rendering operations for the earth visualization
 * Manages canvases, particles, overlays, and SVG map rendering
 */

import * as d3 from 'd3';
import { Utils } from './utils/Utils';
import { Globe, DisplayOptions, Point, GeoPoint, ViewportSize } from './Globes';

// Debug logging
const DEBUG = true;
function debugLog(section: string, message: string, data?: any): void {
    if (DEBUG) {
        console.log(`[RENDER-SYSTEM] ${section}: ${message}`, data || '');
    }
}

// Constants from original
const PARTICLE_LINE_WIDTH = 1.0;

export interface RenderData {
    globe: Globe;
    mesh: any;
    field?: any;
    overlayGrid?: any;
    buckets?: Array<Array<{age: number; x: number; y: number; xt?: number; yt?: number}>>;
    colorStyles?: string[] & { indexFor: (m: number) => number };
    overlayType?: string;
    overlayData?: ImageData | null;  // Direct overlay data - no more smuggling through field!
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
        debugLog('INIT', 'RenderSystem initialized', { 
            width: display.width, 
            height: display.height 
        });
    }

    /**
     * Initialize all canvas elements and contexts
     */
    public setupCanvases(): void {
        debugLog('SETUP', 'Setting up canvases');
        
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
            debugLog('SETUP', 'Animation canvas initialized');
        }
        
        // Setup overlay canvas
        this.overlayCanvas = d3.select("#overlay").node() as HTMLCanvasElement;
        if (this.overlayCanvas) {
            this.overlayContext = this.overlayCanvas.getContext("2d");
            this.overlayCanvas.width = this.display.width;
            this.overlayCanvas.height = this.display.height;
            debugLog('SETUP', 'Overlay canvas initialized', { 
                width: this.display.width, 
                height: this.display.height 
            });
        }
        
        // Setup scale canvas
        this.scaleCanvas = d3.select("#scale").node() as HTMLCanvasElement;
        if (this.scaleCanvas) {
            this.scaleContext = this.scaleCanvas.getContext("2d");
            debugLog('SETUP', 'Scale canvas initialized');
        }
    }

    /**
     * Clear the animation canvas completely
     */
    public clearAnimationCanvas(): void {
        if (!this.context) return;
        
        debugLog('CLEAR', 'Clearing animation canvas');
        this.context.clearRect(0, 0, this.display.width, this.display.height);
    }

    /**
     * Main rendering method - renders the complete frame
     */
    public renderFrame(data: RenderData): void {
        debugLog('FRAME', 'Rendering frame');
        
        if (!data.globe || !data.mesh) {
            debugLog('FRAME', 'Cannot render - missing globe or mesh');
            return;
        }

        try {
            // Render SVG map elements
            this.renderMap(data.globe, data.mesh);
            
            // Render overlay if available
            this.renderOverlay(data);
            
            debugLog('FRAME', 'Frame render completed');
            
        } catch (error) {
            debugLog('FRAME', 'Frame render failed', error);
            throw error;
        }
    }

    /**
     * Render the SVG map (coastlines, lakes)
     */
    private renderMap(globe: Globe, mesh: any): void {
        debugLog('MAP', 'Rendering SVG map');
        
        // Clear previous render
        const mapNode = d3.select("#map").node();
        const foregroundNode = d3.select("#foreground").node();
        if (mapNode) (mapNode as Element).replaceChildren();
        if (foregroundNode) (foregroundNode as Element).replaceChildren();

        // Setup SVG
        const mapSvg = d3.select("#map");
        const foregroundSvg = d3.select("#foreground");
        
        // Let the globe define its map structure
        globe.defineMap(mapSvg, foregroundSvg);
        
        // Render mesh data
        const path = d3.geoPath(globe.projection);
        
        mapSvg.select(".coastline")
            .datum(mesh.coastLo)
            .attr("d", path);
            
        mapSvg.select(".lakes")
            .datum(mesh.lakesLo)
            .attr("d", path);

        debugLog('MAP', 'SVG map rendered');
    }

    /**
     * Render overlay data and color scale
     */
    private renderOverlay(data: RenderData): void {
        debugLog('OVERLAY', 'Rendering overlay', { overlayType: data.overlayType });
        
        if (!this.overlayContext) {
            debugLog('OVERLAY', 'No overlay context available');
            return;
        }

        // Clear overlay canvas
        Utils.clearCanvas(this.overlayCanvas!);
        
        // Clear scale canvas
        if (this.scaleCanvas) {
            Utils.clearCanvas(this.scaleCanvas);
        }

        // Only draw if overlay is enabled and not "off"
        if (data.overlayType && data.overlayType !== "off") {
            // Draw the overlay imageData if it exists
            if (data.overlayData) {
                debugLog('OVERLAY', 'Putting overlay imageData');
                this.overlayContext.putImageData(data.overlayData, 0, 0);
            }
            
            // Draw color scale if we have overlay grid
            if (data.overlayGrid) {
                this.drawColorScale(data.overlayGrid);
            }
        }
    }

    /**
     * Draw particles on the animation canvas
     */
    public drawParticles(buckets: Array<Array<{age: number; x: number; y: number; xt?: number; yt?: number}>>, 
                        colorStyles: string[] & { indexFor: (m: number) => number },
                        globe: Globe): void {
        if (!this.context || !colorStyles) return;

        // Get bounds for drawing particles
        const bounds = globe.bounds({ width: this.display.width, height: this.display.height });
        if (!bounds) return;

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
        
        debugLog('SCALE', 'Drew color scale', { 
            bounds, 
            width: canvas.width, 
            height: canvas.height 
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