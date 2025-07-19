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
import * as topojson from 'topojson-client';
import { Globes, Globe, ViewportSize } from './Globes';
import { Products } from './Products';
import { Utils } from './utils/Utils';
import { MenuSystem } from './MenuSystem';
import { ParticleSystem } from './Particles';
import { InputHandler } from './InputHandler';
import { RenderSystem } from './RenderSystem';
import { OverlaySystem } from './OverlaySystem';
import { PlanetSystem } from './Planets';
import { MeshSystem } from './MeshSystem';

// Import geo-maps data
import * as coastlines10kmModule from '@geo-maps/earth-coastlines-10km';
import * as coastlines5kmModule from '@geo-maps/earth-coastlines-5km';
import * as coastlines2km5Module from '@geo-maps/earth-coastlines-2km5';
import * as coastlines250mModule from '@geo-maps/earth-coastlines-250m';
import * as lakes10kmModule from '@geo-maps/earth-lakes-10km';
import * as rivers10kmModule from '@geo-maps/earth-rivers-10km';

// Extract the actual data from modules (they might be wrapped in default exports)
const coastlines10km = (coastlines10kmModule as any).default || coastlines10kmModule;
const coastlines5km = (coastlines5kmModule as any).default || coastlines5kmModule;
const coastlines2km5 = (coastlines2km5Module as any).default || coastlines2km5Module;
const coastlines250m = (coastlines250mModule as any).default || coastlines250mModule;
const lakes10km = (lakes10kmModule as any).default || lakes10kmModule;
const rivers10km = (rivers10kmModule as any).default || rivers10kmModule;

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
    private meshSystem: MeshSystem;

    // Mesh data - support both CPU and GPU paths
    private meshWebGLCanvas: HTMLCanvasElement | null = null;
    private meshData: HTMLCanvasElement | null = null;

    // Mesh data (loaded once)
    private mesh: any = null;

    // Mask data (regenerated when globe changes)
    private mask: any = null;

    // Planet data - support both CPU and GPU paths
    private planetData: ImageData | null = null;
    private planetWebGLCanvas: HTMLCanvasElement | null = null;

    // Weather data - cleanly separated
    private overlayProduct: any = null;
    private particleProduct: any = null;
    private overlayData: ImageData | null = null;
    private overlayWebGLCanvas: HTMLCanvasElement | null = null;

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
        this.particleSystem = new ParticleSystem();
        this.renderSystem = new RenderSystem({
            width: this.view.width,
            height: this.view.height,
            projection: null as any,
            orientation: [0, 0, 0]
        });
        this.meshSystem = new MeshSystem();

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
            () => { } // Menu changes don't directly trigger renders
        );

        // 2. Input changes → Globe manipulation
        this.inputHandler.on('zoomStart', () => {
            this.stopAnimation();
        });
        this.inputHandler.on('zoom', () => {
            // Globe is changing during drag - emit globe changed event for immediate redraw
            this.emit('globeChanged');
        });
        this.inputHandler.on('rotate', () => {
            // Globe is rotating - emit rotate event for overlay/planet regeneration
            this.emit('rotate');
        });
        this.inputHandler.on('zoomEnd', () => {
            // No need for handleGlobeChange - mask regeneration and animation restart 
            // will happen via zoomEnd -> maskChanged -> startAnimation
            this.emit('zoomEnd');
        });
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
            console.log('[EARTH-DEBUG] Received overlayChanged event:', {
                hasImageData: !!result.imageData,
                hasWebGLCanvas: !!result.webglCanvas,
                overlayType: result.overlayType,
                webglCanvasSize: result.webglCanvas ? [result.webglCanvas.width, result.webglCanvas.height] : null
            });

            this.overlayData = result.imageData;
            this.overlayWebGLCanvas = result.webglCanvas;
            this.overlayProduct = result.overlayProduct;
            console.log(`[EARTH] Received overlay result: type=${result.overlayType}, hasWebGLCanvas=${!!result.webglCanvas}, canvasSize=${result.webglCanvas?.width}x${result.webglCanvas?.height}`);
            this.emit('overlayChanged');
        });

        // 4. PlanetSystem → Pure observer of state changes
        this.planetSystem.observeState(this);
        this.planetSystem.on('planetChanged', (result: any) => {
            this.planetData = result.imageData;
            this.planetWebGLCanvas = result.webglCanvas;
            this.emit('planetChanged');
        });

        // 5. ParticleSystem → Pure observer of state changes
        if (this.particleSystem) {
            this.particleSystem.observeState(this);
            this.particleSystem.on('particlesEvolved', (buckets, colorStyles, globe) => {
                this.renderSystem.drawParticles(buckets, colorStyles, globe);
            });
        }

        // 6. MeshSystem → Pure observer of state changes
        this.meshSystem.observeState(this);
        this.meshSystem.on('meshChanged', (meshResult: any) => {
            console.log('[EARTH-MODERN] Received mesh change:', meshResult);
            // Store mesh data internally like other systems
            this.meshWebGLCanvas = meshResult.webglCanvas;
            this.meshData = meshResult.canvas2D;
            this.emit('meshChanged');
        });



        // 7. Subscribe RenderSystem to actual visual state changes
        this.setupRenderSubscriptions();
    }

    /**
     * Setup RenderSystem to listen to actual visual state changes
     */
    private setupRenderSubscriptions(): void {
        // Any visual state change just triggers a render of current state

        this.on('overlayChanged', () => this.performRender());
        this.on('planetChanged', () => this.performRender());
        this.on('meshChanged', () => this.performRender());
        this.on('systemsReady', () => this.performRender());

        // Only regenerate mask on zoom end (scale changes)
        this.on('zoomEnd', () => {
            if (this.globe) {
                this.mask = Utils.createMask(this.globe, this.view);
                // Emit maskChanged after mask is updated
                this.emit('maskChanged');
            }
        });

        // Restart animation when mask changes (after zoom/projection changes are complete)
        this.on('maskChanged', () => {
            this.performRender(); // Render immediately to show new mask
            this.startAnimation();
        });
    }

    /**
     * Render current state - only pass data that should actually be rendered
     */
    private performRender(): void {
        if (!this.globe) return;

        // Determine what should be rendered based on current mode and overlay state
        const mode = this.config.mode || 'air';
        const overlayType = this.config.overlayType || 'off';

        // Determine what data to pass based on mode
        let planetData = null;
        let planetWebGLCanvas = null;
        let overlayGrid = null;
        let overlayData = null;
        let overlayWebGLCanvas = null;
        let meshWebGLCanvas = null;
        let meshData = null;

        // Planet mode: only show planet surface, no mesh or overlay
        if (mode === 'planet') {
            planetData = this.planetData;
            planetWebGLCanvas = this.planetWebGLCanvas;
            // No overlay or mesh in planet mode - pure planet view
        }
        // Air/Ocean modes: show mesh and overlay if enabled, no planet
        else if (mode === 'air' || mode === 'ocean') {
            // Always show mesh (coastlines, etc.) in air/ocean modes
            meshData = this.meshData;
            meshWebGLCanvas = this.meshWebGLCanvas;

            if (overlayType !== 'off') {
                overlayGrid = this.overlayProduct;
                overlayData = this.overlayData;
                overlayWebGLCanvas = this.overlayWebGLCanvas;
            }
        }
        // Future modes can be added here

        console.log('[EARTH-DEBUG] Render decision:', {
            mode,
            overlayType,
            willShowPlanet: !!planetData || !!planetWebGLCanvas,
            willShowOverlay: !!overlayData || !!overlayWebGLCanvas,
            hasPlanetData: !!this.planetData,
            hasPlanetWebGLCanvas: !!this.planetWebGLCanvas,
            hasOverlayData: !!this.overlayData,
            hasOverlayWebGLCanvas: !!this.overlayWebGLCanvas
        });

        // Pass only the determined data to render system
        this.renderSystem.renderFrame({
            globe: this.globe,
            planetData: planetData,
            planetWebGLCanvas: planetWebGLCanvas,
            overlayGrid: overlayGrid,
            overlayData: overlayData,
            overlayWebGLCanvas: overlayWebGLCanvas,
            meshWebGLCanvas: meshWebGLCanvas,
            meshData: meshData,
            maskData: this.mask?.imageData || null  // Include mask visualization
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

            // Setup rendering first (initializes canvases)
            this.renderSystem.setupCanvases();

            // Setup mesh system (needs to run after canvas setup)
            this.setupMeshSystem();

            // Load static data (mesh) - now MeshSystem is ready
            await this.loadMesh();

            // Create initial globe
            this.createGlobe();

            // Load weather data
            await this.loadWeatherData();

            // Update menu to reflect initial configuration
            this.menuSystem.updateMenuState(this.config);

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
            // Regenerate mask for new projection
            if (this.globe) {
                this.mask = Utils.createMask(this.globe, this.view);
                this.emit('maskChanged');
            }
        }

        // Reload weather data if parameters changed
        if (changes.date || changes.particleType || changes.surface || changes.level || changes.overlayType) {
            this.loadWeatherData().then(() => {
                // Weather data loaded - now it's safe to emit config changed for overlay systems
                console.log('[EARTH-MODERN] Weather data loaded, emitting events');
                this.emit('configChanged');
                this.emit('weatherDataChanged');
                this.emit('systemsReady');
                this.startAnimation();
            }).catch(error => {
                console.error('[EARTH-MODERN] Failed to reload weather data:', error);
                // Even on error, emit events so systems don't get stuck
                this.emit('configChanged');
                this.startAnimation();
            });
        } else {
            // No data reload needed, safe to emit immediately
            this.emit('configChanged');
            this.emit('systemsReady');
            this.startAnimation();
        }
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

        // Always set orientation to ensure proper scaling and positioning
        if (this.globe) {
            this.globe.orientation(this.config.orientation, this.view);

            // Create initial mask for this globe/view combination
            this.mask = Utils.createMask(this.globe, this.view);
            console.log('[EARTH-MODERN] Initial mask created');
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
            orientation: "0,0,NaN",  // NaN scale will trigger fit() calculation
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

    private setupMeshSystem(): void {
        // Get the canvas from MeshSystem (WebGL or 2D) and set its size
        const meshCanvas = this.meshSystem.getWebGLCanvas();
        if (meshCanvas) {
            meshCanvas.width = this.view.width;
            meshCanvas.height = this.view.height;

            // Insert the mesh canvas into the DOM structure
            const existingWebglMesh = d3.select("#webgl-mesh").node() as HTMLCanvasElement;
            if (existingWebglMesh && existingWebglMesh.parentNode) {
                existingWebglMesh.parentNode.replaceChild(meshCanvas, existingWebglMesh);
                meshCanvas.id = "webgl-mesh";
            }
        }

        console.log('[EARTH-MODERN] MeshSystem setup complete');
    }

    private async loadMesh(): Promise<void> {
        console.log('[EARTH-MODERN] Loading mesh from geo-maps packages');

        // Load consistent mesh data (no LOD switching)
        // IMPORTANT: These are functions that need to be called to get the actual GeoJSON data
        const coastlinesData = typeof coastlines10km === 'function' ? coastlines10km() : coastlines10km;
        const lakesData = typeof lakes10km === 'function' ? lakes10km() : lakes10km;
        const riversData = typeof rivers10km === 'function' ? rivers10km() : rivers10km;

        console.log('[MESH] Loaded mesh data sources:');
        console.log('  - Coastlines: 10km, type:', coastlinesData?.type, 'features:', coastlinesData?.features?.length || 0);
        console.log('  - Lakes: 10km, type:', lakesData?.type, 'features:', lakesData?.features?.length || 0);
        console.log('  - Rivers: 10km, type:', riversData?.type, 'features:', riversData?.features?.length || 0);

        // Create mesh object with consistent data for all scenarios
        this.mesh = {
            coastLo: coastlinesData,
            coastHi: coastlinesData,  // Same data for both LOD levels
            lakesLo: lakesData,
            lakesHi: lakesData,       // Same data for both LOD levels
            riversLo: riversData,
            riversHi: riversData      // Same data for both LOD levels
        };

        // Mesh data changed - emit event
        this.emit('meshDataChanged');

        console.log('[EARTH-MODERN] Mesh loaded - all features available at all times');
    }

    // ===== STATE ACCESS METHODS (for observers) =====

    getGlobe(): Globe | null {
        return this.globe;
    }

    getMask(): any {
        return this.mask;
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

    getMesh(): any {
        return this.mesh;
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