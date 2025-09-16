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
import '../styles/styles.css';

import { Globes, Globe, ViewportSize } from '../core/Globes';
import { Products } from '../data/Products';
import { Utils } from '../utils/Utils';
import { MenuSystem } from '../components/MenuSystem';
import { ConfigManager, EarthConfig } from '../config/ConfigManager';
import { EarthAPI } from './EarthAPI';
import { ParticleSystem } from '../renderers/Particles';
import { InputHandler } from '../services/InputHandler';
import { RenderSystem } from '../renderers/RenderSystem';
import { OverlaySystem } from '../renderers/OverlaySystem';
import { PlanetSystem } from '../renderers/PlanetSystem';
import { MeshSystem } from '../renderers/MeshSystem';

// Import geo-maps data
import * as coastlines10kmModule from '@geo-maps/earth-coastlines-10km';

import * as lakes10kmModule from '@geo-maps/earth-lakes-10km';
import * as rivers10kmModule from '@geo-maps/earth-rivers-10km';

// Extract the actual data from modules (they might be wrapped in default exports)
const coastlines10km = (coastlines10kmModule as any).default || coastlines10kmModule;
const lakes10km = (lakes10kmModule as any).default || lakes10kmModule;
const rivers10km = (rivers10kmModule as any).default || rivers10kmModule;

// ===== CLEAN INTERFACES =====

type Configuration = EarthConfig;

interface WeatherData {
    wind: any;
    overlay: any;
}



// ===== CLEAN EARTH APP =====

class EarthModernApp {
    // Core state (minimal)
    private config: Configuration;
    private view: ViewportSize;

    // Configuration management
    private configManager: ConfigManager;
    private earthAPI: EarthAPI;

    // Systems (each with single responsibility)
    private products: Products;
    private globe: Globe | null = null;
    private menuSystem: MenuSystem;
    private particleSystem: ParticleSystem;
    private overlaySystem: OverlaySystem;
    private planetSystem: PlanetSystem;
    private inputHandler: InputHandler;
    private renderSystem: RenderSystem;
    private meshSystem: MeshSystem;

    // Mesh data - single canvas (system decides WebGL vs 2D internally)
    private meshCanvas: HTMLCanvasElement | null = null;

    // Mesh data (loaded once)
    private mesh: any = null;

    // Mask data (regenerated when globe changes)
    private mask: any = null;

    // Planet data - single canvas (system decides WebGL vs 2D internally)
    private planetCanvas: HTMLCanvasElement | null = null;

    // Particle data - single canvas (system decides WebGL vs 2D internally)
    private particleCanvas: HTMLCanvasElement | null = null;

    // Weather data - cleanly separated
    private overlayProduct: any = null;
    private particleProduct: any = null;
    private overlayCanvas: HTMLCanvasElement | null = null;



    constructor() {
        console.log('[EARTH-MODERN] Initializing clean architecture');

        // Initialize core state
        this.view = Utils.view();
        this.config = this.createInitialConfig();

        // Initialize configuration management
        const initialEarthConfig: EarthConfig = {
            mode: 'air',
            projection: 'orthographic',
            overlayType: 'off',
            level: 'level',
            showGridPoints: false,
            windUnits: 'm/s',
            particleType: 'wind',
            date: 'current',
            hour: '0000'
        };
        this.configManager = new ConfigManager(initialEarthConfig);
        this.earthAPI = new EarthAPI(this.configManager);

        // Initialize systems (no coupling yet)
        this.products = new Products();
        this.menuSystem = new MenuSystem(this.configManager);
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

        // Setup window resize handling
        this.setupResizeHandling();
    }

    /**
     * Setup SVG map structure (graticule, sphere, etc.)
     * Called only when projection or view changes
     */
    private setupMapStructure(): void {
        if (!this.globe) return;
        
        console.log('[EARTH] Setting up SVG map structure');
        
        // Clear and setup SVG elements
        const mapNode = d3.select("#map").node();
        const foregroundNode = d3.select("#foreground").node();
        if (mapNode) (mapNode as Element).replaceChildren();
        if (foregroundNode) (foregroundNode as Element).replaceChildren();

        const mapSvg = d3.select("#map");
        const foregroundSvg = d3.select("#foreground");

        // Let the globe define its map structure (includes graticule)
        this.globe.defineMap(mapSvg, foregroundSvg);
    }

    /**
     * Setup window resize handling
     */
    private setupResizeHandling(): void {
        let resizeTimeout: number | null = null;

        const handleResize = () => {
            console.log('[EARTH-MODERN] Window resized, updating view');

            // Update view size
            const newView = Utils.view();
            const viewChanged = newView.width !== this.view.width || newView.height !== this.view.height;

            if (viewChanged) {
                this.view = newView;

                // Update UI elements
                this.updateUIForNewView();

                // Recreate globe with new view
                this.createGlobe();
                
                // Setup SVG map structure for new view
                

                // Update render system
                this.renderSystem.updateDisplay({
                    width: this.view.width,
                    height: this.view.height,
                    projection: this.globe?.projection || null as any,
                    orientation: [0, 0, 0]
                });

                // Trigger full system update for view change
                this.updateSystemsOnDataChange();

                console.log('[EARTH-MODERN] View updated to:', this.view);
            }
        };

        // Debounce resize events to avoid excessive updates
        window.addEventListener('resize', () => {
            if (resizeTimeout) {
                clearTimeout(resizeTimeout);
            }
            resizeTimeout = setTimeout(handleResize, 150) as any;
        });
    }

    /**
     * Update UI elements for new view size
     */
    private updateUIForNewView(): void {
        // Update canvas elements to match new view size
        d3.selectAll(".fill-screen")
            .attr("width", this.view.width)
            .attr("height", this.view.height);
    }

    /**
     * Wire up all the callbacks - this is the ONLY place systems talk to each other
     */
    private wireCallbacks(): void {
        console.log('[EARTH-MODERN] Wiring callback chain');

        // 1. Configuration changes → System updates (single source of truth)
        this.configManager.addListener((config) => {
            this.handleConfigChange(config);
        });

        // 2. Input changes → Globe manipulation
        this.inputHandler.on('zoomStart', () => {
            this.particleSystem.stopAnimation();
        });
        this.inputHandler.on('zoom', () => {
            // Globe is changing during drag - emit globe changed event for immediate redraw
            this.emit('globeChanged');
        });
        this.inputHandler.on('rotate', () => {
            // Globe is rotating - trigger centralized state change updates
            this.updateSystemsOnRotation();
        });
        this.inputHandler.on('zoomEnd', () => {
            // No need for handleGlobeChange - mask regeneration will happen via zoomEnd
            this.particleSystem.startAnimation();
            this.emit('zoomEnd');
        });
        this.inputHandler.on('click', (point, coord) => {
            if (coord) {
                this.renderSystem.drawLocationMark(point, coord);
                // Location mark changed - emit location changed event
                this.emit('locationChanged');
            }
        });

        // 3. OverlaySystem → Listen for results (no longer observing state directly)
        this.overlaySystem.on('overlayChanged', (result: any) => {
            this.overlayCanvas = result.canvas;
            this.overlayProduct = result.overlayProduct;
            this.emit('overlayChanged');
        });

        // 4. PlanetSystem → Listen for results (no longer observing state directly)
        this.planetSystem.on('planetChanged', (result: any) => {
            this.planetCanvas = result.canvas;
            this.emit('planetChanged');
        });

        // 5. ParticleSystem → Listen for results
        this.particleSystem.on('particlesChanged', (result: any) => {
            this.particleCanvas = result.canvas;
            this.emit('particlesChanged');
        });

        // 6. MeshSystem → Listen for results (no longer observing state directly)
        this.meshSystem.on('meshChanged', (meshResult: any) => {
            console.log('[EARTH-MODERN] Received mesh change:', meshResult);
            // Store mesh canvas internally
            this.meshCanvas = meshResult.canvas;
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

        // this.on('overlayChanged', () => this.performRender());
        // this.on('planetChanged', () => this.performRender());
        // this.on('meshChanged', () => this.performRender());
        this.on('particlesChanged', () => this.performRender());
        //  this.on('systemsReady', () => this.performRender());

        // Only regenerate mask on zoom end (scale changes)
        this.on('zoomEnd', () => {
            if (this.globe) {
                this.mask = Utils.createMask(this.globe, this.view);
                // Trigger centralized state change updates after mask is updated
                this.updateSystemsOnDataChange();

                // ParticlesNew will handle its own animation restarting via handleStateChange
            }
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

        // Determine what canvases to pass based on mode
        let planetCanvas = null;
        let overlayCanvas = null;
        let meshCanvas = null;
        let particleCanvas = null;
        let overlayGrid = null;

        // Planet mode: only show planet surface, no mesh or overlay or particles
        if (mode === 'planet') {
            planetCanvas = this.planetCanvas;
            // No overlay, mesh, or particles in planet mode - pure planet view
        }
        // Air/Ocean modes: show mesh, overlay, and particles if enabled, no planet
        else if (mode === 'air' || mode === 'ocean') {
            // Always show mesh (coastlines, etc.) in air/ocean modes
            meshCanvas = this.meshCanvas;

            if (overlayType !== 'off') {
                overlayCanvas = this.overlayCanvas;
                overlayGrid = this.overlayProduct;
            }

            // Show particles if enabled
            const particleType = this.config.particleType || 'off';
            if (particleType !== 'off') {
                particleCanvas = this.particleCanvas;
            }
        }

        // Pass single canvases to render system
        this.renderSystem.renderFrame({
            globe: this.globe,
            planetCanvas: planetCanvas,
            overlayCanvas: overlayCanvas,
            meshCanvas: meshCanvas,
            particleCanvas: particleCanvas,
            overlayGrid: overlayGrid
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


            // Load static data (mesh) - now MeshSystem is ready
            await this.loadMesh();

            // Create initial globe
            this.createGlobe();
            
            // Setup initial SVG map structure
            this.setupMapStructure();

            // Load weather data
            await this.loadWeatherData();

            // Update menu to reflect initial configuration
            this.menuSystem.updateMenuState(this.config);

            // Everything ready - trigger centralized system updates
            this.updateSystemsOnDataChange();

            console.log('[EARTH-MODERN] Application started successfully');

        } catch (error) {
            console.error('[EARTH-MODERN] Failed to start:', error);
            throw error;
        }
    }

    // ===== CENTRALIZED SYSTEM UPDATE FUNCTIONS =====

    /**
     * Centralized function to call handleDataChange on all systems
     * This replaces scattered calls from data providers
     */
    private updateSystemsOnDataChange(): void {
        console.log('[EARTH-MODERN] Updating all systems on data change');

        // Set state provider and call handleDataChange on all systems
        this.overlaySystem.setStateProvider(this);
        this.overlaySystem.handleDataChange();

        this.meshSystem.setStateProvider(this);
        this.meshSystem.handleDataChange();

        this.planetSystem.setStateProvider(this);
        this.planetSystem.handleDataChange();

        this.particleSystem.setStateProvider(this);
        this.particleSystem.handleDataChange();
        this.setupMapStructure();
        this.performRender();
    }

    /**
     * Centralized function to call handleRotation on all systems  
     * This is only triggered by globe rotation events
     */
    private updateSystemsOnRotation(): void {
        console.log('[EARTH-MODERN] Updating all systems on rotation');

        // Set state provider and call handleRotation on all systems
        this.overlaySystem.setStateProvider(this);
        this.overlaySystem.handleRotation();

        this.meshSystem.setStateProvider(this);
        this.meshSystem.handleRotation();

        this.planetSystem.setStateProvider(this);
        this.planetSystem.handleRotation();

        this.particleSystem.setStateProvider(this);
        this.particleSystem.handleRotation();
        this.setupMapStructure();
        this.performRender();
    }

    // ===== CALLBACK HANDLERS (Clean and focused) =====

    /**
     * Handle configuration changes - trigger the reactive chain
     */
    private handleConfigChange(config: EarthConfig): void {
        console.log('[EARTH-MODERN] Configuration changed', config);

        // Check if projection changed (need to compare with previous)
        const projectionChanged = this.config.projection !== config.projection;
        const orientationChanged = this.config.orientation !== config.orientation;

        // Update internal config from EarthConfig
        this.config.mode = config.mode;
        this.config.projection = config.projection;
        this.config.overlayType = config.overlayType;
        this.config.level = config.level;
        this.config.showGridPoints = config.showGridPoints;
        this.config.windUnits = config.windUnits;
        this.config.orientation = config.orientation;

        if (config.planetType) {
            this.config.planetType = config.planetType;
        }

        // Update menu display to reflect new state
        this.menuSystem.updateMenuState(config);

        // Update globe if projection or orientation changed
        if (projectionChanged) {
            this.createGlobe();
            this.setupMapStructure();
            if (this.globe) {
                this.mask = Utils.createMask(this.globe, this.view);
            }
        }

        // Always reload weather data and update systems
        // (ConfigManager will only call this when something actually changed)
        this.loadWeatherData().then(() => {
            // Weather data loaded - now trigger centralized system updates
            console.log('[EARTH-MODERN] Weather data loaded, updating systems');
            this.updateSystemsOnDataChange();
        }).catch(error => {
            console.error('[EARTH-MODERN] Failed to reload weather data:', error);
            // Even on error, update systems so they don't get stuck
            this.updateSystemsOnDataChange();
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

    // ===== UTILITIES (Simple and focused) =====

    private createInitialConfig(): Configuration {
        return {
            projection: "orthographic",
            orientation: "0,0,NaN",  // NaN scale will trigger fit() calculation
            date: "current",
            hour: "current",
            mode: "air",
            particleType: "wind",
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

    /**
     * Get the Earth API for external configuration
     */
    getAPI(): any {
        return this.earthAPI;
    }
}

// Export for NPM package
export { EarthModernApp }; 