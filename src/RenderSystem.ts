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
    planetData?: ImageData | null;   // Planet surface image data
    
    // WebGL canvas support - alternative to ImageData for GPU acceleration
    overlayWebGLCanvas?: HTMLCanvasElement | null;  // WebGL-rendered overlay
    planetWebGLCanvas?: HTMLCanvasElement | null;   // WebGL-rendered planet
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
            
            // Set scale canvas dimensions dynamically like earth.js does
            this.setSizeScale();
            
            debugLog('SETUP', 'Scale canvas initialized', { 
                width: this.scaleCanvas.width, 
                height: this.scaleCanvas.height 
            });
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
                
            debugLog('SCALE-SIZE', 'Scale canvas resized', { 
                width, 
                height,
                menuWidth: menu.offsetWidth,
                labelWidth: label.offsetWidth 
            });
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
        const frameStart = performance.now();
        debugLog('FRAME', 'Rendering frame');
        
        if (!data.globe || !data.mesh) {
            debugLog('FRAME', 'Cannot render - missing globe or mesh');
            return;
        }

        try {
            // Clear animation canvas to prevent leftover particles from previous projections/data
            const clearStart = performance.now();
            this.clearAnimationCanvas();
            const clearTime = performance.now() - clearStart;
            debugLog('RENDER-PERF', `Animation canvas clear time: ${clearTime.toFixed(2)}ms`);
            
            // Render SVG map elements
            const mapStart = performance.now();
            this.renderMap(data.globe, data.mesh);
            const mapTime = performance.now() - mapStart;
            debugLog('RENDER-PERF', `SVG map render time: ${mapTime.toFixed(2)}ms`);
            
            // Render overlay if available
            const overlayStart = performance.now();
            this.renderOverlay(data);
            const overlayTime = performance.now() - overlayStart;
            debugLog('RENDER-PERF', `Overlay render time: ${overlayTime.toFixed(2)}ms`);
            
            const totalFrameTime = performance.now() - frameStart;
            debugLog('RENDER-PERF', `Total frame render time: ${totalFrameTime.toFixed(2)}ms`);
            debugLog('FRAME', 'Frame render completed');
            
        } catch (error) {
            const totalFrameTime = performance.now() - frameStart;
            debugLog('RENDER-PERF', `Frame render failed after ${totalFrameTime.toFixed(2)}ms`);
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
        const overlayStart = performance.now();
        debugLog('OVERLAY', 'Rendering overlay', { overlayType: data.overlayType });
        
        if (!this.overlayContext) {
            debugLog('OVERLAY', 'No overlay context available');
            return;
        }

        // Try full WebGL composition first
        const webglComposed = this.renderFullWebGLComposition(data);
        
        if (!webglComposed) {
            // Fall back to smart layer rendering
            debugLog('OVERLAY', 'Using smart layer rendering fallback');
            
            // Clear overlay canvas
            const clearStart = performance.now();
            Utils.clearCanvas(this.overlayCanvas!);
            
            // Clear scale canvas
            if (this.scaleCanvas) {
                Utils.clearCanvas(this.scaleCanvas);
            }
            const clearTime = performance.now() - clearStart;
            debugLog('RENDER-PERF', `Canvas clear time: ${clearTime.toFixed(2)}ms`);

            // First, render planet surface data if available (background layer)
            // Use smart rendering to handle both ImageData and WebGL canvas
            this.renderLayerData(
                this.overlayContext,
                data.planetData || null,
                data.planetWebGLCanvas || null,
                'planet'
            );

            // Then render weather overlay on top if enabled and not "off"
            if (data.overlayType && data.overlayType !== "off") {
                // Use smart rendering for overlay data
                this.renderLayerData(
                    this.overlayContext,
                    data.overlayData || null,
                    data.overlayWebGLCanvas || null,
                    'overlay'
                );
            }
        }
        
        // Draw color scale if we have overlay grid (always needed)
        if (data.overlayGrid && data.overlayType && data.overlayType !== "off") {
            // Clear scale canvas
            if (this.scaleCanvas) {
                Utils.clearCanvas(this.scaleCanvas);
            }
            
            const scaleStart = performance.now();
            this.drawColorScale(data.overlayGrid);
            const scaleTime = performance.now() - scaleStart;
            debugLog('RENDER-PERF', `Color scale draw time: ${scaleTime.toFixed(2)}ms`);
        }
        
        const totalOverlayTime = performance.now() - overlayStart;
        debugLog('RENDER-PERF', `Total overlay render time: ${totalOverlayTime.toFixed(2)}ms`);
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

    /**
     * Smart layer rendering - handles both ImageData (CPU) and WebGL canvas (GPU) sources
     */
    private renderLayerData(
        context: CanvasRenderingContext2D,
        imageData: ImageData | null,
        webglCanvas: HTMLCanvasElement | null,
        layerName: string
    ): number {
        const renderStart = performance.now();
        
        if (webglCanvas) {
            // GPU path: Direct canvas-to-canvas copy (much faster than ImageData)
            debugLog(layerName.toUpperCase(), `Rendering ${layerName} from WebGL canvas`);
            context.drawImage(webglCanvas, 0, 0);
            const renderTime = performance.now() - renderStart;
            debugLog('RENDER-PERF', `${layerName} WebGL canvas copy time: ${renderTime.toFixed(2)}ms`);
            return renderTime;
        } else if (imageData) {
            // CPU path: ImageData (slower but compatible)
            debugLog(layerName.toUpperCase(), `Rendering ${layerName} from ImageData`);
            context.putImageData(imageData, 0, 0);
            const renderTime = performance.now() - renderStart;
            debugLog('RENDER-PERF', `${layerName} putImageData time: ${renderTime.toFixed(2)}ms`);
            return renderTime;
        }
        
        return 0; // No data to render
    }

    /**
     * Full WebGL composition - combines multiple WebGL canvases directly for maximum performance
     */
    private renderFullWebGLComposition(data: RenderData): boolean {
        if (!this.overlayContext) return false;
        
        const hasWebGLPlanet = data.planetWebGLCanvas;
        const hasWebGLOverlay = data.overlayWebGLCanvas;
        
        // Only use full WebGL composition if we have at least one WebGL canvas
        if (!hasWebGLPlanet && !hasWebGLOverlay) {
            return false;
        }
        
        debugLog('WEBGL-COMPOSITION', 'Using full WebGL composition pipeline');
        const compositeStart = performance.now();
        
        // Clear overlay canvas
        Utils.clearCanvas(this.overlayCanvas!);
        
        // Layer 1: Planet surface (background)
        if (hasWebGLPlanet) {
            debugLog('WEBGL-COMPOSITION', 'Compositing planet WebGL canvas');
            this.overlayContext.drawImage(data.planetWebGLCanvas!, 0, 0);
        } else if (data.planetData) {
            debugLog('WEBGL-COMPOSITION', 'Falling back to planet ImageData');
            this.overlayContext.putImageData(data.planetData, 0, 0);
        }
        
        // Layer 2: Weather overlay (foreground)
        if (data.overlayType && data.overlayType !== "off") {
            if (hasWebGLOverlay) {
                debugLog('WEBGL-COMPOSITION', 'Compositing overlay WebGL canvas');
                this.overlayContext.drawImage(data.overlayWebGLCanvas!, 0, 0);
            } else if (data.overlayData) {
                debugLog('WEBGL-COMPOSITION', 'Falling back to overlay ImageData');
                this.overlayContext.putImageData(data.overlayData, 0, 0);
            }
        }
        
        const compositeTime = performance.now() - compositeStart;
        debugLog('RENDER-PERF', `Full WebGL composition time: ${compositeTime.toFixed(2)}ms`);
        
        return true;
    }
} 