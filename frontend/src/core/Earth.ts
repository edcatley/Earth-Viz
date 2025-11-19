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
import { WeatherProduct } from '../data/WeatherProduct';
import { ProductManager } from '../data/ProductManager';
import { Utils } from '../utils/Utils';
import { MenuSystem } from '../components/MenuSystem';
import { ConfigManager, EarthConfig } from '../config/ConfigManager';
import { EarthAPI } from './EarthAPI';
import { ParticleSystem } from '../services/ParticlesSystem';
import { InputHandler } from '../services/InputHandler';
import { RenderSystem } from '../services/RenderSystem';
import { OverlaySystem } from '../services/OverlaySystem';
import { PlanetSystem } from '../services/PlanetSystem';
import { MeshSystem } from '../services/MeshSystem';

// Import Natural Earth data
import coastlines10km from '../data/ne_110m_coastline.json';
import lakes10km from '../data/ne_110m_lakes.json';
import rivers10km from '../data/ne_110m_rivers_lake_centerlines.json';

// ===== CLEAN EARTH APP =====

class EarthModernApp {
    // Core state (minimal)
    private view: ViewportSize;

    // Configuration management
    private configManager: ConfigManager;
    private earthAPI: EarthAPI;

    // Systems (each with single responsibility)
    private globe: Globe | null = null;
    private menuSystem: MenuSystem;
    private particleSystem: ParticleSystem;
    private overlaySystem: OverlaySystem;
    private planetSystem: PlanetSystem;
    private inputHandler: InputHandler;
    private renderSystem: RenderSystem;
    private meshSystem: MeshSystem;

    // Mesh data (loaded once)
    private mesh: any = null;

    // Mask data (regenerated when globe changes)
    private mask: any = null;

    // Weather data - cleanly separated
    private overlayProduct: WeatherProduct | null = null;
    private particleProduct: WeatherProduct | null = null;
    
    // Product manager - handles caching and creation
    private productManager: ProductManager;
    
    // Particle animation timer
    private particleAnimationId: number | null = null;



    constructor() {
        console.log('[EARTH-MODERN] Initializing clean architecture');

        // Initialize core state
        this.view = Utils.view();

        // Initialize configuration management
        this.configManager = new ConfigManager(this.createInitialConfig());
        this.earthAPI = new EarthAPI(this.configManager);
        
        // Initialize product manager
        this.productManager = ProductManager.getInstance();

        // Initialize systems (no coupling yet)
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

        // Clear SVG elements - use D3's remove() to properly clean up selections
        d3.select("#map").selectAll("*").remove();
        d3.select("#foreground").selectAll("*").remove();

        const mapSvg = d3.select("#map");
        const foregroundSvg = d3.select("#foreground");

        // Let the globe define its map structure (includes graticule)
        this.globe.defineMap(mapSvg, foregroundSvg);
    }

    /**
     * Update graticule on rotation (without recreating DOM)
     */
    private updateGraticule(): void {
        if (!this.globe || !this.globe.projection) return;

        const path = d3.geoPath().projection(this.globe.projection);

        // Update graticule paths
        d3.select("#map .graticule").attr("d", path as any);
        d3.select("#map .hemisphere").attr("d", path as any);
        d3.select("#map #sphere").attr("d", path as any);
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
        this.configManager.addListener((config, changes) => {
            this.handleConfigChange(config, changes);
        });

        // 2. Input changes → Globe manipulation
        this.inputHandler.on('zoomStart', () => {
            this.stopParticleAnimation();
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
            const config = this.configManager.getConfig();
            if (config.particleType && config.particleType !== 'off' && this.particleProduct) {
                this.startParticleAnimation();
            }
            this.emit('zoomEnd');
        });
        this.inputHandler.on('click', (point, coord) => {
            if (coord) {
                this.renderSystem.drawLocationMark(point, coord);
                // Location mark changed - emit location changed event
                this.emit('locationChanged');
            }
        });



        // 7. Subscribe RenderSystem to actual visual state changes
        this.setupRenderSubscriptions();
    }

    /**
     * Setup RenderSystem to listen to actual visual state changes
     */
    private setupRenderSubscriptions(): void {
        // Any visual state change triggers a render of current state
        console.log('[EARTH-MODERN] Setting up render subscriptions for all visual systems');

        // // Listen for all visual system events and render when any system updates
        // this.on('overlayChanged', () => {
        //     console.log('[EARTH-MODERN] Overlay changed, triggering render');
        //     this.performRender();
        // });

        // this.on('planetChanged', () => {
        //     console.log('[EARTH-MODERN] Planet changed, triggering render');
        //     this.performRender();
        // });

        // this.on('meshChanged', () => {
        //     console.log('[EARTH-MODERN] Mesh changed, triggering render');
        //     this.performRender();
        // });

        // this.on('particlesChanged', () => {
        //     //console.log('[EARTH-MODERN] Particles changed, triggering render');
        //     this.performRender();
        // });

        // Only regenerate mask on zoom end (scale changes)
        this.on('zoomEnd', () => {
            if (this.globe) {
                // Dispose old mask before creating new one
                if (this.mask && this.mask.dispose) {
                    this.mask.dispose();
                }
                this.mask = Utils.createMask(this.globe, this.view);
                // Trigger centralized state change updates after mask is updated
                this.updateSystemsOnDataChange();

                // ParticlesNew will handle its own animation restarting via handleStateChange
            }
        });
    }

    /**
     * Render current state - uses direct WebGL rendering when available
     */
    private performRender(): void {
        console.log('[EARTH] performRender called');
        
        if (!this.globe || !this.mask) {
            console.log('[EARTH] No globe/mask, skipping render');
            return;
        }

        // Get config properties
        const mode = this.configManager.get('mode') || 'air';
        const overlayType = this.configManager.get('overlayType') || 'off';
        console.log('[EARTH] Rendering with mode:', mode);
        
        // Decide what to draw
        const drawPlanet = mode === 'planet';
        const drawMesh = !drawPlanet;
        const drawOverlay = overlayType !== 'off' && overlayType !== 'default';
        const drawParticles = !drawPlanet; // Draw particles unless in planet mode
        
        // Get overlay scale/units if available
        let overlayScale = null;
        let overlayUnits = null;
        if (this.overlayProduct) {
            overlayScale = this.overlayProduct.scale;
            overlayUnits = this.overlayProduct.units;
        }

        // Call RenderSystem
        this.renderSystem.render(
            this.globe,
            this.mask,
            drawPlanet,
            drawMesh,
            drawOverlay,
            drawParticles,
            overlayScale,
            overlayUnits
        );
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

            // Setup rendering first (initializes canvases and WebGL context)
            this.renderSystem.setupCanvases();

            // Initialize systems with shared WebGL context
            this.renderSystem.initializeSystems(
                this.planetSystem,
                this.overlaySystem,
                this.meshSystem,
                this.particleSystem
            );

            // Load static data (mesh) - now MeshSystem is ready
            await this.loadMesh();

            // Create initial globe
            this.createGlobe();

            // Setup initial SVG map structure
            this.setupMapStructure();

            // Load weather data
            await this.loadWeatherData();

            // Update menu to reflect initial configuration
            this.menuSystem.updateMenuState(this.configManager.getConfig());

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
    private async updateSystemsOnDataChange(): Promise<void> {
        console.log('[EARTH-MODERN] Updating all systems on data change');

        // Gather all required state in one place
        const globe = this.globe;
        const mesh = this.mesh;
        const view = this.view;
        const mask = this.mask;
        const config = this.configManager.getConfig();
        const overlayProduct = this.overlayProduct;

        // Call handleDataChange on all systems with explicit parameters
        if (overlayProduct && globe && view && mask && config) {
            this.overlaySystem.handleDataChange(overlayProduct, globe, view, mask, config);
        }

        if (globe && mesh && view) {
            this.meshSystem.handleDataChange(globe, mesh, view);
        }

        // Await planet system since it loads images asynchronously
        if (globe && mask && view && config.planetType !== undefined && config.useDayNight !== undefined) {
            await this.planetSystem.handleDataChange(globe, mask, view, config.planetType, config.useDayNight);
        }

        const particleProduct = this.particleProduct;
        if (globe && mask && view && particleProduct && config.particleType !== undefined) {
            // Pass particleProduct even if null - particle system will handle it
            this.particleSystem.handleDataChange(globe, mask, view, particleProduct, config.particleType);
        }
        
        this.renderSystem.setStateProvider(this);
        this.renderSystem.handleDataChange();
        
        // Start/stop particle animation based on whether particles are enabled
        if (config.particleType && config.particleType !== 'off' && particleProduct) {
            this.startParticleAnimation();
            console.log('[EARTH-MODERN] Starting particle animation');
        } else {
            this.stopParticleAnimation();
        }
        
        this.setupMapStructure();
    }

    /**
     * Centralized function to call handleRotation on all systems  
     * This is only triggered by globe rotation events
     */
    private updateSystemsOnRotation(): void {
        console.log('[EARTH-MODERN] Updating all systems on rotation');

        // Update graticule without recreating DOM
        this.updateGraticule();

        // Gather all required state in one place
        const globe = this.globe;
        const mesh = this.mesh;
        const view = this.view;
        const mask = this.mask;
        const config = this.configManager.getConfig();
        const overlayProduct = this.overlayProduct;

        // Call handleRotation on all systems with explicit parameters
        if (globe && mask && view && config && overlayProduct) {
            this.overlaySystem.handleRotation(globe, mask, view, config, overlayProduct);
        }

        if (globe && mesh && view) {
            this.meshSystem.handleRotation(globe);
        }

        if (globe && mask && view && config.planetType !== undefined) {
            this.planetSystem.handleRotation(globe, mask, view);
        }

        // Particle system doesn't need parameters for rotation - just stops/clears animation
        this.particleSystem.handleRotation();
        
        // Stop particle animation during rotation
        this.stopParticleAnimation();
        
        // Trigger render with updated rotation (NO PARTICLES during rotation)
        if (globe && mask) {
            const mode = config.mode || 'planet';
            const overlayType = config.overlayType || 'off';
            const drawPlanet = mode === 'planet';
            const drawMesh = !drawPlanet;
            const drawOverlay = overlayType !== 'off' && overlayType !== 'default';
            const drawParticles = false; // Never draw particles during rotation
            
            this.renderSystem.render(
                globe,
                mask,
                drawPlanet,
                drawMesh,
                drawOverlay,
                drawParticles,
                overlayProduct?.scale,
                overlayProduct?.units
            );
        }
    }
    
    /**
     * Start particle animation loop
     */
    private startParticleAnimation(): void {
        if (this.particleAnimationId) return; // Already running
        
        console.log('[EARTH-MODERN] Starting particle animation loop');
        
        // Set a dummy ID so the first animate() call doesn't exit early
        this.particleAnimationId = -1 as any;
        
        const animate = () => {
            
            // Trigger render (which will evolve and render particles)
            const globe = this.globe;
            const mask = this.mask;
            const config = this.configManager.getConfig();
            const overlayProduct = this.overlayProduct;
            
            if (globe && mask) {
                const mode = config.mode || 'planet';
                const overlayType = config.overlayType || 'off';
                const drawPlanet = mode === 'planet';
                const drawMesh = !drawPlanet;
                const drawOverlay = overlayType !== 'off' && overlayType !== 'default';
                const drawParticles = true; // Always draw particles in animation loop
                this.renderSystem.render(
                    globe,
                    mask,
                    drawPlanet,
                    drawMesh,
                    drawOverlay,
                    drawParticles,
                    overlayProduct?.scale,
                    overlayProduct?.units
                );
            }
            
            // Schedule next frame (40ms = 25fps)
            this.particleAnimationId = setTimeout(animate, 40) as any;
        };
        
        animate();
    }
    
    /**
     * Stop particle animation loop
     */
    private stopParticleAnimation(): void {
        if (this.particleAnimationId) {
            clearTimeout(this.particleAnimationId);
            this.particleAnimationId = null;
        }
    }

    // ===== CALLBACK HANDLERS (Clean and focused) =====

    /**
     * Handle configuration changes - trigger the reactive chain
     */
    private handleConfigChange(config: EarthConfig, changes?: Partial<EarthConfig>): void {
        console.log('[EARTH-MODERN] Configuration changed', changes);

        // Update menu display to reflect new state
        this.menuSystem.updateMenuState(config);

        // If changes is undefined, treat as a complete config update
        const changesObj = changes || {};

        // Check specific properties in changes directly
        if ('projection' in changesObj) {
            console.log('[EARTH-MODERN] Projection changed, recreating globe');
            this.createGlobe();
            this.setupMapStructure();
            if (this.globe) {
                this.mask = Utils.createMask(this.globe, this.view);
            }
        }

        if ('orientation' in changesObj) {
            console.log('[EARTH-MODERN] Orientation changed');
            this.createGlobe();
            this.setupMapStructure();
            if (this.globe) {
                this.mask = Utils.createMask(this.globe, this.view);
            }
        }

        if ('isFullScreen' in changesObj) {
            console.log('[EARTH-MODERN] Full screen changed');
            this.createGlobe();
            this.setupMapStructure();
            if (this.globe) {
                this.mask = Utils.createMask(this.globe, this.view);
            }
        }

        // Only reload weather data if related properties changed
        if ('particleType' in changesObj || 'overlayType' in changesObj || 'level' in changesObj || 'mode' in changesObj) {
            console.log('[EARTH-MODERN] Weather-related config changed, reloading data');
            this.loadWeatherData().then(() => {
                // Weather data loaded - now trigger centralized system updates
                console.log('[EARTH-MODERN] Weather data loaded, updating systems');
                this.updateSystemsOnDataChange();
            }).catch(error => {
                console.error('[EARTH-MODERN] Failed to reload weather data:', error);
                // Even on error, update systems so they don't get stuck
                this.updateSystemsOnDataChange();
            });
        } else {
            // For other changes, just update systems without reloading data
            this.updateSystemsOnDataChange();
        }
    }

    /**
     * Dispose of the current globe and clean up resources
     */
    private disposeGlobe(): void {
        if (this.globe) {
            // Clear projection reference to allow GC
            this.globe.projection = null;
            this.globe = null;
        }

        // Dispose mask
        if (this.mask && this.mask.dispose) {
            this.mask.dispose();
        }
        this.mask = null;

        console.log('[EARTH-MODERN] Globe disposed');
    }

    /**
     * Create globe - single responsibility
     */
    private createGlobe(): void {
        console.log('[EARTH-MODERN] Creating globe');

        // Clean up old globe first
        this.disposeGlobe();

        const config = this.configManager.getConfig();
        const globeBuilder = Globes.get(config.projection);
        if (!globeBuilder) {
            throw new Error(`Unknown projection: ${config.projection}`);
        }

        this.globe = globeBuilder();

        if (this.globe) {
            // Set orientation and apply aesthetic scaling in one sequence
            this.globe.orientation(config.orientation, this.view);

            // Apply 100% or 90% scale based on isFullScreen flag
            const orientation = this.globe.orientation(undefined, this.view) as string;
            const [lat, lon, rawScale] = orientation.split(',');
            const scaleFactor = !!config.isFullScreen ? 1.0 : 0.9;
            const finalScale = Math.round(parseFloat(rawScale) * scaleFactor);

            // Apply final orientation with adjusted scale
            const finalOrientation = `${lat},${lon},${finalScale}`;
            console.log(`[EARTH-MODERN] Applying ${config.isFullScreen ? 'fullscreen' : 'normal'} scale:`, finalOrientation);
            this.globe.orientation(finalOrientation, this.view);

            // Create mask after final orientation is set
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
            const config = this.configManager.getConfig();
            console.log('[EARTH-MODERN] Config:', config);
            
            // Get a date that's guaranteed to have data (yesterday at 18z)
            const dataDate = new Date();
            dataDate.setDate(dataDate.getDate() - 1);  // Yesterday
            dataDate.setUTCHours(18, 0, 0, 0);  // 18z
            
            // Load particle data if needed (wind, waves, ocean currents, etc.)
            if (config.particleType && config.particleType !== 'off') {
                this.particleProduct = await this.productManager.getParticleProduct(
                    config.particleType,
                    config.level,
                    dataDate
                );
            } else {
                this.particleProduct = null;
            }

            // Load overlay data if needed  
            if (config.overlayType && config.overlayType !== 'off' && config.overlayType !== 'default') {
                this.overlayProduct = await this.productManager.getOverlayProduct(
                    config.overlayType,
                    config.level,
                    dataDate
                );
            } else {
                this.overlayProduct = null;
            }

            // Update menu system with weather data metadata
            const products = [this.particleProduct, this.overlayProduct].filter(p => p !== null);
            console.log('[EARTH-MODERN] Products for menu:', products);
            this.menuSystem.updateWeatherData(products);

            console.log('[EARTH-MODERN] Weather data loaded - Particles:', !!this.particleProduct, 'Overlay:', !!this.overlayProduct);

            // Emit weather data changed event
            this.emit('weatherDataChanged');

        } catch (error) {
            console.error('[EARTH-MODERN] Failed to load weather data:', error);
            console.error('[EARTH-MODERN] Error stack:', error instanceof Error ? error.stack : 'No stack');
            // Don't fail completely
            this.particleProduct = null;
            this.overlayProduct = null;
            // Update menu with empty data
            this.menuSystem.updateWeatherData([]);
        }
    }

    // ===== UTILITIES (Simple and focused) =====

    private createInitialConfig(): EarthConfig {
        return {
            projection: "orthographic",
            orientation: "0,0,NaN",  // NaN scale will trigger fit() calculation
            date: "current",
            hour: "current",
            mode: "air",
            particleType: "wind",
            level: "1000hPa",
            overlayType: "wind",
            planetType: "earth",
            useDayNight: false,   // Day/night blending off by default
            showGridPoints: false,
            windUnits: "m/s",
            showUI: true          // UI is visible by default
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
        // Use imported Natural Earth data directly
        const coastlinesData = coastlines10km;
        const lakesData = lakes10km;
        const riversData = rivers10km;

        console.log('[MESH] Loaded mesh data sources:');
        console.log('  - Coastlines: type:', coastlinesData?.type, 'features:', coastlinesData?.features?.length || 0);
        console.log('  - Lakes: type:', lakesData?.type, 'features:', lakesData?.features?.length || 0);
        console.log('  - Rivers: type:', riversData?.type, 'features:', riversData?.features?.length || 0);

        // Use raw data without simplification to see original quality
        console.log('[MESH] Using raw Natural Earth data (no simplification)');

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

    getConfig(): EarthConfig {
        return this.configManager.getConfig();
    }

    getParticleProduct(): WeatherProduct | null {
        return this.particleProduct;
    }

    getOverlayProduct(): WeatherProduct | null {
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