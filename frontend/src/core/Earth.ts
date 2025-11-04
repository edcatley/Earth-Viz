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

// Import Natural Earth data
import coastlines10km from '../data/ne_110m_coastline.json';
import lakes10km from '../data/ne_110m_lakes.json';
import rivers10km from '../data/ne_110m_rivers_lake_centerlines.json';

// ===== CLEAN INTERFACES =====

interface WeatherData {
    wind: any;
    overlay: any;
}



// ===== CLEAN EARTH APP =====

class EarthModernApp {
    // Core state (minimal)
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

        // Initialize configuration management
        this.configManager = new ConfigManager(this.createInitialConfig());
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

        // Clear SVG elements - use D3's remove() to properly clean up selections
        d3.select("#map").selectAll("*").remove();
        d3.select("#foreground").selectAll("*").remove();

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
        this.configManager.addListener((config, changes) => {
            this.handleConfigChange(config, changes);
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
        // Any visual state change triggers a render of current state
        console.log('[EARTH-MODERN] Setting up render subscriptions for all visual systems');

        // Listen for all visual system events and render when any system updates
        this.on('overlayChanged', () => {
            console.log('[EARTH-MODERN] Overlay changed, triggering render');
            this.performRender();
        });

        this.on('planetChanged', () => {
            console.log('[EARTH-MODERN] Planet changed, triggering render');
            this.performRender();
        });

        this.on('meshChanged', () => {
            console.log('[EARTH-MODERN] Mesh changed, triggering render');
            this.performRender();
        });

        this.on('particlesChanged', () => {
            //console.log('[EARTH-MODERN] Particles changed, triggering render');
            this.performRender();
        });

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
     * Render current state - only pass data that should actually be rendered
     */
    private performRender(): void {
        if (!this.globe) return;

        // Determine what should be rendered based on current mode and overlay state
        const config = this.configManager.getConfig();
        const mode = config.mode || 'air';
        const overlayType = config.overlayType || 'off';

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
            const particleType = this.configManager.getConfig().particleType || 'off';
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
            // Load particle data if needed (wind, waves, ocean currents, etc.)
            if (config.particleType && config.particleType !== 'off') {
                console.log('[EARTH-MODERN] Loading particle data:', config.particleType);
                this.particleProduct = Products.createParticleProduct(config.particleType, config);
                await this.particleProduct.load({ requested: false });
            } else {
                this.particleProduct = null;
            }

            // Load overlay data if needed  
            if (config.overlayType && config.overlayType !== 'off' && config.overlayType !== 'default') {
                console.log('[EARTH-MODERN] Loading overlay data:', config.overlayType);
                this.overlayProduct = Products.createOverlayProduct(config.overlayType, config);
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

    private createInitialConfig(): EarthConfig {
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

    /**
     * Simplify GeoJSON using Douglas-Peucker algorithm
     * Reduces number of points while preserving shape
     */
    private simplifyGeoJSON(geojson: any, tolerance: number): any {
        if (!geojson) return geojson;

        // Handle GeometryCollection (geo-maps format)
        if (geojson.type === 'GeometryCollection' && geojson.geometries) {
            return {
                ...geojson,
                geometries: geojson.geometries.map((geometry: any) =>
                    this.simplifyGeometry(geometry, tolerance)
                )
            };
        }

        // Handle FeatureCollection (standard GeoJSON)
        if (geojson.features) {
            return {
                ...geojson,
                features: geojson.features.map((feature: any) => ({
                    ...feature,
                    geometry: this.simplifyGeometry(feature.geometry, tolerance)
                }))
            };
        }

        return geojson;
    }

    /**
     * Simplify a geometry object
     */
    private simplifyGeometry(geometry: any, tolerance: number): any {
        if (!geometry) return geometry;

        if (geometry.type === 'MultiPolygon') {
            return {
                ...geometry,
                coordinates: geometry.coordinates.map((polygon: any) =>
                    polygon.map((ring: any) => this.simplifyLineString(ring, tolerance))
                )
            };
        } else if (geometry.type === 'Polygon') {
            return {
                ...geometry,
                coordinates: geometry.coordinates.map((ring: any) =>
                    this.simplifyLineString(ring, tolerance)
                )
            };
        } else if (geometry.type === 'LineString') {
            return {
                ...geometry,
                coordinates: this.simplifyLineString(geometry.coordinates, tolerance)
            };
        } else if (geometry.type === 'MultiLineString') {
            return {
                ...geometry,
                coordinates: geometry.coordinates.map((line: any) =>
                    this.simplifyLineString(line, tolerance)
                )
            };
        }

        return geometry;
    }

    /**
     * Douglas-Peucker line simplification
     */
    private simplifyLineString(points: number[][], tolerance: number): number[][] {
        if (points.length <= 2) return points;

        const sqTolerance = tolerance * tolerance;

        // Find point with maximum distance from line segment
        let maxDist = 0;
        let maxIndex = 0;

        const first = points[0];
        const last = points[points.length - 1];

        for (let i = 1; i < points.length - 1; i++) {
            const dist = this.perpendicularDistanceSq(points[i], first, last);
            if (dist > maxDist) {
                maxDist = dist;
                maxIndex = i;
            }
        }

        // If max distance is greater than tolerance, recursively simplify
        if (maxDist > sqTolerance) {
            const left = this.simplifyLineString(points.slice(0, maxIndex + 1), tolerance);
            const right = this.simplifyLineString(points.slice(maxIndex), tolerance);
            return left.slice(0, -1).concat(right);
        }

        // Otherwise, just keep endpoints
        return [first, last];
    }

    /**
     * Squared perpendicular distance from point to line segment
     */
    private perpendicularDistanceSq(point: number[], lineStart: number[], lineEnd: number[]): number {
        const [x, y] = point;
        const [x1, y1] = lineStart;
        const [x2, y2] = lineEnd;

        const dx = x2 - x1;
        const dy = y2 - y1;

        if (dx === 0 && dy === 0) {
            // Line segment is a point
            return (x - x1) * (x - x1) + (y - y1) * (y - y1);
        }

        const t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy);

        if (t < 0) {
            // Beyond start point
            return (x - x1) * (x - x1) + (y - y1) * (y - y1);
        } else if (t > 1) {
            // Beyond end point
            return (x - x2) * (x - x2) + (y - y2) * (y - y2);
        }

        // Perpendicular distance
        const projX = x1 + t * dx;
        const projY = y1 + t * dy;
        return (x - projX) * (x - projX) + (y - projY) * (y - projY);
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