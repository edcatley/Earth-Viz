/**
 * RenderSystem - handles all rendering operations for the earth visualization
 * Manages canvases, particles, overlays, and SVG map rendering
 */

import * as d3 from 'd3';
import { Utils } from '../utils/Utils';
import { Globe, DisplayOptions, Point, GeoPoint, ViewportSize } from '../core/Globes';

// Debug logging - enabled
function debugLog(section: string, message: string, data?: any): void {
    console.debug(`[${section}] ${message}`, data || '');
}

// Constants from original

export class RenderSystem {
    private display: DisplayOptions;

    // Canvas elements and contexts
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
    
    // Pre-rendered scale canvas (updated only when data changes)
    private preRenderedScaleCanvas: HTMLCanvasElement | null = null;
    
    // External state provider
    private stateProvider: any = null;

    constructor(display: DisplayOptions) {
        this.display = display;
    }

    /**
     * Initialize all canvas elements and contexts
     */
    public setupCanvases(): void {
        // Setup overlay canvas - used for all rendering (WebGL or 2D)
        this.overlayCanvas = d3.select("#overlay").node() as HTMLCanvasElement;
        if (this.overlayCanvas) {
            this.overlayCanvas.width = this.display.width;
            this.overlayCanvas.height = this.display.height;
            
            // Try WebGL first, fall back to 2D if not available
            this.gl = this.overlayCanvas.getContext("webgl") as WebGLRenderingContext;
            
            if (this.gl) {
                debugLog('RENDER', 'WebGL context created');
            } else {
                debugLog('RENDER', 'WebGL not available, using 2D fallback');
                this.overlayContext = this.overlayCanvas.getContext("2d");
            }
        }

        // Setup scale canvas for color legend
        this.scaleCanvas = d3.select("#scale").node() as HTMLCanvasElement;
        if (this.scaleCanvas) {
            this.scaleContext = this.scaleCanvas.getContext("2d");
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
     * Main rendering method - draws what it's told to draw
     */
    public render(
        globe: Globe,
        mask: any,
        drawPlanet: boolean,
        drawMesh: boolean,
        drawOverlay: boolean,
        drawParticles: boolean,
        overlayScale: any,
        overlayUnits: any
    ): void {

        if (!globe) return;

        const view = { width: this.display.width, height: this.display.height };
        // Decide: WebGL or 2D?
        const canUseWebGL = this.gl && 
            this.planetSystem?.canRenderDirect() &&
            this.overlaySystem?.canRenderDirect() &&
            this.meshSystem?.canRenderDirect() &&
            this.particleSystem?.canRenderDirect();
        if (canUseWebGL && this.gl) {
            this.renderWebGL(globe, view, drawPlanet, drawMesh, drawOverlay, drawParticles);
        } else if (this.overlayContext) {
            this.render2D(globe, mask, view, drawPlanet, drawMesh, drawOverlay, drawParticles);
        }
        
        // Draw color scale
        if (overlayScale && this.scaleContext && this.scaleCanvas) {
            this.scaleContext.clearRect(0, 0, this.scaleCanvas.width, this.scaleCanvas.height);
            this.drawColorScale(overlayScale, overlayUnits);
        }
    }
    
    /**
     * WebGL rendering path - draws what it's told to draw
     */
    private renderWebGL(
        globe: Globe, 
        view: ViewportSize, 
        drawPlanet: boolean,
        drawMesh: boolean,
        drawOverlay: boolean,
        drawParticles: boolean
    ): void {
        if (!this.gl) return;
        // Clear
        this.gl.clearColor(0.0, 0.0, 0.0, 0.0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
        
        // Draw what we're told to draw
        if (drawPlanet) {
            this.planetSystem.renderDirect(this.gl, globe, view);
        }
        
        if (drawMesh) {
            this.meshSystem.renderDirect(this.gl, globe, view);
        }
        
        if (drawOverlay) {
            this.overlaySystem.renderDirect(this.gl, globe, view);
        }
        
        if (drawParticles) {
            this.particleSystem.renderDirect(this.gl);
        }
    }
    
    /**
     * 2D rendering path - draws what it's told to draw
     */
    private render2D(
        globe: Globe, 
        mask: any, 
        view: ViewportSize,
        drawPlanet: boolean,
        drawMesh: boolean,
        drawOverlay: boolean,
        drawParticles: boolean
    ): void {
        if (!this.overlayContext) return;
        // Clear
        this.overlayContext.clearRect(0, 0, this.display.width, this.display.height);
        
        // Draw what we're told to draw
        if (drawPlanet) {
            this.planetSystem.render2DDirect(this.overlayContext, globe, mask, view);
        }
        
        if (drawMesh) {
            this.meshSystem.render2DDirect(this.overlayContext, this.overlayCanvas!, globe);
        }
        
        if (drawOverlay) {
            this.overlaySystem.render2DDirect(this.overlayContext, globe, mask, view);
        }
        
        if (drawParticles) {
            this.particleSystem.render2DDirect(this.overlayContext, globe, view);
        }
    }










    /**
     * Draw color scale bar - just copy the pre-rendered canvas
     */
    private drawColorScale(scale: any, units: any): void {
        if (!this.scaleContext) {
            return;
        }

        // Store current scale/units for tooltip handler
        this.lastOverlayScale = scale;
        this.lastOverlayUnits = units;

        // Just copy the pre-rendered canvas (single drawImage instead of 200 fillRect)
        if (this.preRenderedScaleCanvas) {
            this.scaleContext.drawImage(this.preRenderedScaleCanvas, 0, 0);
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
     * Set external state provider
     */
    setStateProvider(stateProvider: any): void {
        this.stateProvider = stateProvider;
    }

    /**
     * Handle data changes - regenerate color scale and trigger render
     */
    handleDataChange(): void {
        const overlayProduct = this.stateProvider?.getOverlayProduct();
        
        if (overlayProduct?.scale) {
            this.generateColorScale(overlayProduct.scale, overlayProduct.units);
            this.setupScaleTooltip(overlayProduct.scale, overlayProduct.units);
        }
        
        // Trigger render with updated data
        if (this.stateProvider) {
            const globe = this.stateProvider.getGlobe();
            const mask = this.stateProvider.getMask();
            const config = this.stateProvider.getConfig();
            const mode = config?.mode || 'planet';
            const overlayType = config?.overlayType || 'off';
            
            // Decide what to draw based on mode
            const drawPlanet = mode === 'planet';
            const drawMesh = !drawPlanet;
            const drawOverlay = overlayType !== 'off' && overlayType !== 'default';
            const drawParticles = !drawPlanet;
            
            const overlayScale = overlayProduct?.scale;
            const overlayUnits = overlayProduct?.units;
            
            if (globe && mask) {
                this.render(globe, mask, drawPlanet, drawMesh, drawOverlay, drawParticles, overlayScale, overlayUnits);
            }
        }
    }

    /**
     * Generate color scale canvas (called once when data changes)
     */
    private generateColorScale(scale: any, units: any): void {
        if (!this.scaleContext || !scale) {
            return;
        }

        const bounds = scale.bounds;
        if (!bounds) return;

        // Create offscreen canvas for pre-rendering
        if (!this.preRenderedScaleCanvas) {
            this.preRenderedScaleCanvas = document.createElement('canvas');
        }

        // Match the size of the actual scale canvas
        this.preRenderedScaleCanvas.width = this.scaleCanvas!.width;
        this.preRenderedScaleCanvas.height = this.scaleCanvas!.height;

        const ctx = this.preRenderedScaleCanvas.getContext('2d')!;

        // Draw gradient once
        const width = this.preRenderedScaleCanvas.width - 1;
        for (let i = 0; i <= width; i++) {
            const value = Utils.spread(i / width, bounds[0], bounds[1]);
            const rgb = scale.gradient(value, 1);
            ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
            ctx.fillRect(i, 0, 1, this.preRenderedScaleCanvas.height);
        }

        debugLog('RENDER', 'Color scale pre-rendered');
    }

    /**
     * Setup scale tooltip (called once when data changes)
     */
    private setupScaleTooltip(scale: any, units: any): void {
        if (this.scaleListenerSetup) return; // Already setup

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

        this.scaleListenerSetup = true;
        debugLog('RENDER', 'Scale tooltip setup');
    }


} 