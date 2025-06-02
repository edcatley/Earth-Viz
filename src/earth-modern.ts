/**
 * earth-modern.ts - Clean callback-driven earth visualization
 * 
 * This is how Earth.ts SHOULD be structured:
 * - Simple callback interfaces between systems
 * - Clear data flow with no circular dependencies
 * - Minimal coupling - each system only knows what it needs
 * - Earth app is just the wiring, not the orchestrator
 */

import * as d3 from 'd3';
import { Globes, Globe, ViewportSize } from './Globes';
import { Products } from './Products';
import { Utils } from './utils/Utils';
import { MenuSystem } from './MenuSystem';
import { ParticleSystem } from './Particles';
import { InputHandler } from './InputHandler';
import { RenderSystem } from './RenderSystem';
import { OverlaySystem } from './OverlaySystem';

// ===== CLEAN INTERFACES =====

interface Configuration {
    projection: string;
    orientation: string;
    date: string;
    hour: string;
    param: string;
    surface: string;
    level: string;
    overlayType: string;
}

interface WeatherData {
    wind: any;
    overlay: any;
}

interface SystemCallbacks {
    onConfigChange: (config: Configuration) => void;
    onDataReady: (data: WeatherData) => void;
    onProjectionChange: (projection: d3.GeoProjection, bounds: any) => void;
    onParticlesReady: (particles: any) => void;
    onOverlayReady: (overlay: ImageData | null) => void;
    onRenderReady: () => void;
}

// ===== CLEAN EARTH APP =====

class EarthModernApp {
    // Core state (minimal)
    private config: Configuration;
    private view: ViewportSize;
    
    // Systems (each with single responsibility)
    private products: Products;
    private globe: Globe | null = null;
    private menuSystem: MenuSystem;
    private particleSystem: ParticleSystem | null = null;
    private overlaySystem: OverlaySystem;
    private inputHandler: InputHandler;
    private renderSystem: RenderSystem;
    
    // Mesh data (loaded once)
    private mesh: any = null;
    
    // Weather data and overlay data
    private weatherProducts: any[] = [];
    private overlayData: ImageData | null = null;
    
    // Animation
    private animationId: number | null = null;

    constructor() {
        console.log('[EARTH-MODERN] Initializing clean architecture');
        
        // Initialize core state
        this.view = Utils.view();
        this.config = this.createInitialConfig();
        
        // Initialize systems (no coupling yet)
        this.products = new Products();
        this.menuSystem = new MenuSystem(this.config);
        this.overlaySystem = new OverlaySystem();
        this.inputHandler = new InputHandler();
        this.renderSystem = new RenderSystem({ 
            width: this.view.width, 
            height: this.view.height,
            projection: null as any,
            orientation: [0, 0, 0]
        });
        
        // Wire up the callback chain
        this.wireCallbacks();
    }

    /**
     * Wire up all the callbacks - this is the ONLY place systems talk to each other
     */
    private wireCallbacks(): void {
        console.log('[EARTH-MODERN] Wiring callback chain');
        
        // 1. Menu changes → Configuration updates
        this.menuSystem.setCallbacks(
            () => this.handleConfigChange(),
            () => this.requestRender()
        );
        
        // 2. Input changes → Globe manipulation
        this.inputHandler.on('zoomStart', () => this.stopAnimation());
        this.inputHandler.on('zoom', () => this.requestRender());
        this.inputHandler.on('zoomEnd', () => this.handleGlobeChange());
        this.inputHandler.on('click', (point, coord) => {
            if (coord) this.renderSystem.drawLocationMark(point, coord);
        });
        
        // 3. Products loaded → Systems update
        // (We'll implement this when Products supports callbacks)
        
        // 4. Particle system → Renderer
        // (We'll implement this when ParticleSystem supports callbacks)
    }

    /**
     * Start the application - just the bootstrap sequence
     */
    async start(): Promise<void> {
        console.log('[EARTH-MODERN] Starting application');
        
        try {
            // Setup UI
            this.setupUI();
            
            // Load static data (mesh)
            await this.loadMesh();
            
            // Create initial globe
            this.createGlobe();
            
            // Load weather data
            await this.loadWeatherData();
            
            // Initialize systems that need data
            this.initializeSystems();
            
            // Setup rendering
            this.renderSystem.setupCanvases();
            this.requestRender();
            
            // Start animation
            this.startAnimation();
            
            console.log('[EARTH-MODERN] Application started successfully');
            
        } catch (error) {
            console.error('[EARTH-MODERN] Failed to start:', error);
            throw error;
        }
    }

    // ===== CALLBACK HANDLERS (Clean and focused) =====

    /**
     * Handle configuration changes - trigger the reactive chain
     */
    private handleConfigChange(): void {
        console.log('[EARTH-MODERN] Configuration changed');
        
        // Get the updated config from MenuSystem
        this.config = { ...this.config, ...this.menuSystem.getConfig() };
        
        // Stop current animation
        this.stopAnimation();
        
        // Update globe if projection changed
        if (this.config.projection) {
            this.createGlobe();
        }
        
        // Reload weather data if parameters changed (fire and forget)
        if (this.config.date || this.config.param || this.config.surface || this.config.level) {
            this.loadWeatherData().then(() => {
                // Reinitialize systems after data loads
                this.initializeSystems();
                this.requestRender();
                this.startAnimation();
            }).catch(error => {
                console.error('[EARTH-MODERN] Failed to reload weather data:', error);
            });
        } else {
            // No data reload needed, just reinitialize
            this.initializeSystems();
            this.requestRender();
            this.startAnimation();
        }
    }

    /**
     * Handle globe manipulation - update dependent systems
     */
    private handleGlobeChange(): void {
        console.log('[EARTH-MODERN] Globe changed');
        
        if (!this.globe) return;
        
        // Update configuration with new orientation
        const orientation = this.globe.orientation();
        if (typeof orientation === 'string') {
            this.config.orientation = orientation;
        }
        
        // Reinitialize systems that depend on projection
        this.initializeSystems();
        
        // Restart animation
        this.startAnimation();
    }

    /**
     * Handle render requests - just render, no side effects
     */
    private requestRender(): void {
        if (!this.globe || !this.mesh) return;
        
        const field = this.particleSystem?.getField();
        
        this.renderSystem.renderFrame({
            globe: this.globe,
            mesh: this.mesh,
            field: field,
            overlayGrid: null,
            overlayType: this.config.overlayType,
            overlayData: this.overlayData
        });
    }

    // ===== SYSTEM INITIALIZATION (Clean and focused) =====

    /**
     * Create globe - single responsibility
     */
    private createGlobe(): void {
        console.log('[EARTH-MODERN] Creating globe');
        
        const globeBuilder = Globes.get(this.config.projection);
        if (!globeBuilder) {
            throw new Error(`Unknown projection: ${this.config.projection}`);
        }
        
        this.globe = globeBuilder();
        
        // Set orientation if specified
        if (this.config.orientation && this.globe) {
            this.globe.orientation(this.config.orientation, this.view);
        }
        
        // Update input handler
        this.inputHandler.setGlobe(this.globe);
        
        console.log('[EARTH-MODERN] Globe created');
    }

    /**
     * Load weather data - single responsibility
     */
    private async loadWeatherData(): Promise<void> {
        console.log('[EARTH-MODERN] Loading weather data');
        
        try {
            const productPromises = Products.productsFor(this.config);
            const products = await Promise.all(productPromises.filter(p => p !== null));
            
            // Load the actual data
            for (const product of products) {
                if (product && product.load) {
                    await product.load({ requested: false });
                }
            }
            
            // Store products for systems to use
            this.weatherProducts = products;
            
            console.log('[EARTH-MODERN] Weather data loaded');
            
        } catch (error) {
            console.error('[EARTH-MODERN] Failed to load weather data:', error);
            // Don't fail completely
            this.weatherProducts = [];
        }
    }

    /**
     * Initialize systems that need data - single responsibility
     */
    private initializeSystems(): void {
        console.log('[EARTH-MODERN] Initializing systems');
        
        if (!this.globe) return;
        
        // Create mask for visibility testing
        const mask = this.createMask();
        
        // Initialize particle system
        const windProduct = this.weatherProducts.find((p: any) => p && p.field === "vector");
        if (windProduct) {
            this.particleSystem = new ParticleSystem(this.config, this.globe, mask, this.view, [windProduct]);
            
            // Wire up particle system callbacks
            this.particleSystem.on('particlesEvolved', (buckets, colorStyles, globe) => {
                this.renderSystem.drawParticles(buckets, colorStyles, globe);
            });
        }
        
        // Initialize overlay system
        const overlayProduct = this.weatherProducts.find((p: any) => 
            p && p.type === this.config.overlayType && this.config.overlayType !== 'off'
        );
        
        if (overlayProduct && this.config.overlayType !== 'off') {
            const overlayResult = this.overlaySystem.generateOverlay(
                overlayProduct,
                this.globe,
                mask,
                this.view,
                this.config.overlayType
            );
            
            // Store overlay data for rendering
            this.overlayData = overlayResult.imageData;
        } else {
            // No overlay or overlay is off
            this.overlayData = null;
        }
        
        console.log('[EARTH-MODERN] Systems initialized');
    }

    // ===== ANIMATION (Simple and clean) =====

    private startAnimation(): void {
        if (this.animationId || !this.particleSystem) return;
        
        console.log('[EARTH-MODERN] Starting animation');
        this.animate();
    }

    private stopAnimation(): void {
        if (this.animationId) {
            clearTimeout(this.animationId);
            this.animationId = null;
            console.log('[EARTH-MODERN] Animation stopped');
        }
    }

    private animate(): void {
        try {
            if (!this.particleSystem) return;
            
            this.particleSystem.evolveParticles();
            
            this.animationId = setTimeout(() => {
                if (this.animationId) this.animate();
            }, 40) as any;
            
        } catch (error) {
            console.error('[EARTH-MODERN] Animation error:', error);
            this.stopAnimation();
        }
    }

    // ===== UTILITIES (Simple and focused) =====

    private createInitialConfig(): Configuration {
        return {
            projection: 'orthographic',
            orientation: '0,0,0',
            date: 'current',
            hour: '0000',
            param: 'wind',
            surface: 'surface',
            level: 'level',
            overlayType: 'off'
        };
    }

    private setupUI(): void {
        d3.selectAll(".fill-screen")
            .attr("width", this.view.width)
            .attr("height", this.view.height);
            
        // Setup menu handlers so controls actually work
        this.menuSystem.setupMenuHandlers();
        console.log('[EARTH-MODERN] UI setup complete');
    }

    private async loadMesh(): Promise<void> {
        console.log('[EARTH-MODERN] Loading mesh');
        
        const topology = Utils.isMobile() ? 
            "/data/earth-topo-mobile.json?v2" : 
            "/data/earth-topo.json?v2";
        
        const topo = await Utils.loadJson(topology);
        const o = topo.objects;
        
        this.mesh = {
            coastLo: window.topojson.feature(topo, Utils.isMobile() ? o.coastline_tiny : o.coastline_110m),
            coastHi: window.topojson.feature(topo, Utils.isMobile() ? o.coastline_110m : o.coastline_50m),
            lakesLo: window.topojson.feature(topo, Utils.isMobile() ? o.lakes_tiny : o.lakes_110m),
            lakesHi: window.topojson.feature(topo, Utils.isMobile() ? o.lakes_110m : o.lakes_50m)
        };
        
        console.log('[EARTH-MODERN] Mesh loaded');
    }

    private createMask(): any {
        if (!this.globe) return null;
        
        const canvas = document.createElement("canvas");
        canvas.width = this.view.width;
        canvas.height = this.view.height;
        
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        
        const context = this.globe.defineMask(ctx);
        if (!context) return null;
        
        context.fillStyle = "rgba(255, 0, 0, 1)";
        context.fill();
        
        const imageData = context.getImageData(0, 0, this.view.width, this.view.height);
        const data = imageData.data;
        
        return {
            imageData: imageData,
            isVisible: (x: number, y: number): boolean => {
                if (x < 0 || x >= this.view.width || y < 0 || y >= this.view.height) return false;
                const i = (Math.floor(y) * this.view.width + Math.floor(x)) * 4;
                return data[i + 3] > 0;
            }
        };
    }
}

// ===== BOOTSTRAP =====

async function startEarthModern(): Promise<void> {
    console.log('[EARTH-MODERN] Starting clean earth visualization');
    
    try {
        const app = new EarthModernApp();
        await app.start();
        
        console.log('[EARTH-MODERN] Success!');
        
    } catch (error) {
        console.error('[EARTH-MODERN] Failed to start:', error);
    }
}

// Start when ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startEarthModern);
} else {
    startEarthModern();
} 