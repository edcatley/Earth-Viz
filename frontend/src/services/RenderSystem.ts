/**
 * RenderSystem - handles all rendering operations for the earth visualization
 * Manages canvases, particles, overlays, and SVG map rendering
 */

import * as d3 from 'd3';
import { Utils } from '../utils/Utils';
import { Globe, DisplayOptions, Point, GeoPoint } from '../core/Globes';

// Debug logging - enabled
function debugLog(section: string, message: string, data?: any): void {
    console.log(`[${section}] ${message}`, data || '');
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
    
    // WebGL context (shared across all systems)
    private gl: WebGLRenderingContext | null = null;
    
    // System references (not owned - just references for rendering)
    private planetSystem: any = null;
    private overlaySystem: any = null;
    private meshSystem: any = null;
    private particleSystem: any = null;
    
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

        // Setup overlay canvas - now used for WebGL rendering
        this.overlayCanvas = d3.select("#overlay").node() as HTMLCanvasElement;
        if (this.overlayCanvas) {
            // Try to get WebGL context first
            this.gl = this.overlayCanvas.getContext("webgl") || this.overlayCanvas.getContext("experimental-webgl") as WebGLRenderingContext;
            
            if (this.gl) {
                debugLog('RENDER', 'WebGL context created successfully');
            } else {
                debugLog('RENDER', 'WebGL not available, falling back to 2D');
                this.overlayContext = this.overlayCanvas.getContext("2d");
            }
            
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
     * Initialize systems with shared WebGL context
     * Called by Earth after systems are created
     */
    public initializeSystems(
        planetSystem: any,
        overlaySystem: any,
        meshSystem: any,
        particleSystem: any
    ): void {
        debugLog('RENDER', 'Initializing systems with shared WebGL context');
        
        // Store references to systems
        this.planetSystem = planetSystem;
        this.overlaySystem = overlaySystem;
        this.meshSystem = meshSystem;
        this.particleSystem = particleSystem;
        
        // Initialize systems with shared GL context (if available)
        if (this.gl) {
            planetSystem.initializeGL(this.gl);
            overlaySystem.initializeGL(this.gl);
            meshSystem.initializeGL(this.gl);
            particleSystem.initializeGL(this.gl);
            debugLog('RENDER', 'Systems initialized with WebGL');
        } else {
            debugLog('RENDER', 'Systems will use 2D fallback');
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
     * Uses direct WebGL rendering when available, falls back to 2D compositing
     */
    public renderFrame(
        globe: Globe,
        mode: string,
        overlayScale: any,
        overlayUnits: any
    ): void {
        console.log('[RENDER] renderFrame called, mode:', mode);
        
        if (!globe) {
            console.log('[RENDER] No globe, skipping render');
            return;
        }

        try {
            const view = { width: this.display.width, height: this.display.height };
            
            // Check if we can use WebGL direct rendering
            console.log('[RENDER] Checking WebGL availability:', {
                hasGL: !!this.gl,
                planetReady: this.planetSystem?.canRenderDirect(),
                overlayReady: this.overlaySystem?.canRenderDirect(),
                meshReady: this.meshSystem?.canRenderDirect(),
                particleReady: this.particleSystem?.canRenderDirect()
            });
            
            const canUseWebGL = this.gl && 
                this.planetSystem?.canRenderDirect() &&
                this.overlaySystem?.canRenderDirect() &&
                this.meshSystem?.canRenderDirect() &&
                this.particleSystem?.canRenderDirect();
            
            console.log('[RENDER] Can use WebGL:', canUseWebGL);
            
            if (canUseWebGL && this.gl) {
                // WebGL path: direct rendering to shared context
                console.log('[RENDER] Using WebGL direct rendering');
                
                // Clear WebGL canvas
                this.gl.clearColor(0.0, 0.0, 0.0, 0.0);
                this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
                
                // Render based on mode
                if (mode === 'planet') {
                    // Planet mode: only render planet
                    this.planetSystem.renderDirect(this.gl, globe, view);
                } else {
                    // Air/Ocean modes: render mesh, overlay, particles
                    this.meshSystem.renderDirect(this.gl, globe, view);
                    
                    if (mode === 'air' || mode === 'ocean') {
                        this.overlaySystem.renderDirect(this.gl, globe, view);
                    }
                    
                    this.particleSystem.renderDirect(this.gl);
                }
                
            } else {
                // 2D fallback path: direct rendering to 2D context
                console.log('[RENDER] Using 2D direct rendering');
                
                if (!this.overlayContext) {
                    console.error('[RENDER] No 2D context available');
                    return;
                }
                
                // Clear canvas
                this.overlayContext.clearRect(0, 0, this.display.width, this.display.height);
                
                // Get mask from state provider
                const mask = this.stateProvider?.getMask();
                if (!mask) {
                    console.error('[RENDER] No mask available for 2D rendering');
                    return;
                }
                
                // Render based on mode - systems draw directly to context
                if (mode === 'planet') {
                    // Planet mode: only render planet
                    this.planetSystem.render2DDirect(this.overlayContext, globe, mask, view);
                } else {
                    // Air/Ocean modes: render mesh, overlay, particles
                    this.meshSystem.render2DDirect(this.overlayContext, this.overlayCanvas!, globe);
                    
                    if (mode === 'air' || mode === 'ocean') {
                        this.overlaySystem.render2DDirect(this.overlayContext, globe, mask, view);
                    }
                    
                    this.particleSystem.render2DDirect(this.overlayContext, globe, view);
                }
            }
            
            // Draw color scale (if provided)
            if (overlayScale && this.scaleContext && this.scaleCanvas) {
                this.scaleContext.clearRect(0, 0, this.scaleCanvas.width, this.scaleCanvas.height);
                this.drawColorScale(overlayScale, overlayUnits);
            }

        } catch (error) {
            console.error('Frame render failed:', error);
            throw error;
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
     * Set external state provider
     */
    setStateProvider(stateProvider: any): void {
        this.stateProvider = stateProvider;
    }

    /**
     * Handle data changes - regenerate color scale when overlay data changes
     */
    handleDataChange(): void {
        const overlayProduct = this.stateProvider?.getOverlayProduct();
        
        if (overlayProduct?.scale) {
            this.generateColorScale(overlayProduct.scale, overlayProduct.units);
            this.setupScaleTooltip(overlayProduct.scale, overlayProduct.units);
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