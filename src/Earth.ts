/**
 * earth.ts - Clean callback-driven earth visualization
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
import { PlanetSystem } from './planets';

// ===== CLEAN INTERFACES =====

interface Configuration {
    projection: string;
    orientation: string;
    date: string;
    hour: string;
    mode: string;
    particleType: string;
    surface: string;
    level: string;
    overlayType: string;
    planetType: string;
    showGridPoints: boolean;
    windUnits: string;
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
    private planetSystem: PlanetSystem;
    private inputHandler: InputHandler;
    private renderSystem: RenderSystem;
    
    // Mesh data (loaded once)
    private mesh: any = null;
    
    // Weather data - cleanly separated
    private overlayProduct: any = null;
    private particleProduct: any = null;
    private overlayData: ImageData | null = null;
    private overlayWebGLCanvas: HTMLCanvasElement | null = null;
    
    // Planet data - support both CPU and GPU paths
    private planetData: ImageData | null = null;
    private planetWebGLCanvas: HTMLCanvasElement | null = null;
    
    // Animation
    private animationId: number | null = null;

    constructor() {
        console.log('[EARTH-MODERN] Initializing clean architecture');
        
        // Initialize core state
        this.view = Utils.view();
        this.config = this.createInitialConfig();
        
        // Initialize systems (no coupling yet)
        this.products = new Products();
        this.menuSystem = new MenuSystem(); // No config passed - MenuSystem is stateless
        this.overlaySystem = new OverlaySystem();
        this.planetSystem = new PlanetSystem();
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
        
        // 1. Menu changes → Configuration updates (no direct rendering)
        this.menuSystem.setCallbacks(
            (changes) => this.handleConfigChange(changes),
            () => {} // Menu changes don't directly trigger renders
        );
        
        // 2. Input changes → Globe manipulation
        this.inputHandler.on('zoomStart', () => this.stopAnimation());
        this.inputHandler.on('zoom', () => {
            // Globe is changing - emit globe changed event
            this.emit('globeChanged');
        });
        this.inputHandler.on('zoomEnd', () => this.handleGlobeChange());
        this.inputHandler.on('click', (point, coord) => {
            if (coord) {
                this.renderSystem.drawLocationMark(point, coord);
                // Location mark changed - emit location changed event
                this.emit('locationChanged');
            }
        });
        
        // 3. OverlaySystem → Pure observer of state changes
        this.overlaySystem.observeState(this);
        this.overlaySystem.on('overlayChanged', (result: any) => {
            this.overlayData = result.imageData;
            this.overlayWebGLCanvas = result.webglCanvas;
            this.overlayProduct = result.overlayProduct;
            this.emit('overlayChanged');
        });
        
        // 4. PlanetSystem → Pure observer of state changes
        this.planetSystem.observeState(this);
        this.planetSystem.on('planetChanged', (result: any) => {
            this.planetData = result.imageData;
            this.planetWebGLCanvas = result.webglCanvas;
            this.emit('planetChanged');
        });
        
        // 5. ParticleSystem → Reactive particle updates (handled in initializeSystems)
        
        // 6. Subscribe RenderSystem to actual visual state changes
        this.setupRenderSubscriptions();
    }

    /**
     * Setup RenderSystem to listen to actual visual state changes
     */
    private setupRenderSubscriptions(): void {
        // Any visual state change just triggers a render of current state
        this.on('globeChanged', () => this.performRender());
        this.on('overlayChanged', () => this.performRender());
        this.on('planetChanged', () => this.performRender());
        this.on('meshChanged', () => this.performRender());
        this.on('systemsReady', () => this.performRender());
    }

    /**
     * Render current state - no parameters needed
     */
    private performRender(): void {
        if (!this.globe || !this.mesh) return;
        
        this.renderSystem.renderFrame({
            globe: this.globe,
            mesh: this.mesh,
            field: this.particleSystem?.getField(),
            overlayGrid: this.overlayProduct, // Use stored overlay product
            overlayType: this.config.overlayType,
            overlayData: this.overlayData,
            overlayWebGLCanvas: this.overlayWebGLCanvas,
            planetData: this.planetData,
            planetWebGLCanvas: this.planetWebGLCanvas
        });
    }

    // Simple event emitter for visual state changes
    private eventHandlers: { [key: string]: Function[] } = {};

    private on(event: string, handler: Function): void {
        if (!this.eventHandlers[event]) {
            this.eventHandlers[event] = [];
        }
        this.eventHandlers[event].push(handler);
    }

    private emit(event: string, ...args: any[]): void {
        if (this.eventHandlers[event]) {
            this.eventHandlers[event].forEach(handler => handler(...args));
        }
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
            
            // Everything ready - emit event
            this.emit('systemsReady');
            
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
    private handleConfigChange(changes: any): void {
        console.log('[EARTH-MODERN] Configuration changed', changes);
        
        // Handle special toggle actions
        if (changes.toggleGrid) {
            this.config.showGridPoints = !this.config.showGridPoints;
            delete changes.toggleGrid;
        }
        
        if (changes.toggleWindUnits) {
            const units = ["m/s", "km/h", "kn", "mph"];
            const currentIndex = units.indexOf(this.config.windUnits || "m/s");
            const nextIndex = (currentIndex + 1) % units.length;
            this.config.windUnits = units[nextIndex];
            delete changes.toggleWindUnits;
        }
        
        if (changes.toggleValueUnits) {
            // Handle value units toggle
            delete changes.toggleValueUnits;
        }
        
        if (changes.navigateHours) {
            // Handle time navigation
            console.log(`[EARTH-MODERN] Navigate time by ${changes.navigateHours} hours`);
            // TODO: Implement actual time navigation logic
            delete changes.navigateHours;
        }
        
        // Apply the remaining changes to config
        this.config = { ...this.config, ...changes };
        
        // Update menu display to reflect new state
        this.menuSystem.updateMenuState(this.config);
        
        // Stop current animation
        this.stopAnimation();
        
        // Update globe if projection changed
        if (changes.projection) {
            this.createGlobe();
            // Globe changed - emit event (observers will automatically respond)
            if (this.globe) this.emit('globeChanged');
        }
        
        // Emit config changed event (observers will automatically respond)
        this.emit('configChanged');
        
        // Reload weather data if parameters changed (fire and forget)
        if (changes.date || changes.particleType || changes.surface || changes.level || changes.overlayType) {
            this.loadWeatherData().then(() => {
                // Weather data changed - emit event (observers will automatically respond)
                this.emit('weatherDataChanged');
                // Reinitialize systems after data loads
                this.initializeSystems();
                // Systems ready - emit event
                this.emit('systemsReady');
                this.startAnimation();
            }).catch(error => {
                console.error('[EARTH-MODERN] Failed to reload weather data:', error);
            });
        } else {
            // No data reload needed, just reinitialize
            this.initializeSystems();
            // Systems ready - emit event
            this.emit('systemsReady');
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
        
        // Globe changed - emit event
        this.emit('globeChanged');
        
        // Restart animation
        this.startAnimation();
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
     * Load weather data - clean separation of particle and overlay products
     */
    private async loadWeatherData(): Promise<void> {
        console.log('[EARTH-MODERN] Loading weather data');
        
        try {
            // Load particle data if needed (wind, waves, ocean currents, etc.)
            if (this.config.particleType && this.config.particleType !== 'off') {
                console.log('[EARTH-MODERN] Loading particle data:', this.config.particleType);
                this.particleProduct = Products.createParticleProduct(this.config.particleType, this.config);
                await this.particleProduct.load({ requested: false });
            } else {
                this.particleProduct = null;
            }
            
            // Load overlay data if needed  
            if (this.config.overlayType && this.config.overlayType !== 'off' && this.config.overlayType !== 'default') {
                console.log('[EARTH-MODERN] Loading overlay data:', this.config.overlayType);
                this.overlayProduct = Products.createOverlayProduct(this.config.overlayType, this.config);
                await this.overlayProduct.load({ requested: false });
            } else {
                this.overlayProduct = null;
            }
            
            // Update menu system with weather data metadata
            const products = [this.particleProduct, this.overlayProduct].filter(p => p !== null);
            this.menuSystem.updateWeatherData(products);
            
            console.log('[EARTH-MODERN] Weather data loaded - Particles:', !!this.particleProduct, 'Overlay:', !!this.overlayProduct);
            
            // Emit weather data changed event
            this.emit('weatherDataChanged');
            
        } catch (error) {
            console.error('[EARTH-MODERN] Failed to load weather data:', error);
            // Don't fail completely
            this.particleProduct = null;
            this.overlayProduct = null;
            // Update menu with empty data
            this.menuSystem.updateWeatherData([]);
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
        if (this.particleProduct) {
            this.particleSystem = new ParticleSystem(this.config, this.globe, mask, this.view, [this.particleProduct]);
            
            // Wire up particle system callbacks for continuous animation
            this.particleSystem.on('particlesEvolved', (buckets, colorStyles, globe) => {
                this.renderSystem.drawParticles(buckets, colorStyles, globe);
            });
        } else {
            this.particleSystem = null;
        }
        
        // OverlaySystem is now a pure observer - no manual initialization needed
        // It automatically responds to state changes via the events we emit
        
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
            projection: "orthographic",
            orientation: "0,0,0",
            date: "current",
            hour: "current",
            mode: "air",
            particleType: "wind",
            surface: "surface",
            level: "1000hPa",
            overlayType: "off",
            planetType: "earth",
            showGridPoints: false,
            windUnits: "m/s"
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
        
        // Mesh changed - emit event
        this.emit('meshChanged');
        
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

    // ===== STATE ACCESS METHODS (for observers) =====

    getGlobe(): Globe | null {
        return this.globe;
    }

    getMask(): any {
        return this.createMask();
    }

    getView(): ViewportSize {
        return this.view;
    }

    getConfig(): Configuration {
        return this.config;
    }

    getParticleProduct(): any {
        return this.particleProduct;
    }

    getOverlayProduct(): any {
        return this.overlayProduct;
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