/**
 * earth.ts - Clean callback-driven earth visualization
 *
 * This is how Earth.ts SHOULD be structured:
 * - Simple callback interfaces between systems
 * - Clear data flow with no circular dependencies
 * - Minimal coupling - each system only knows what it needs
 * - Earth app is just the wiring, not the orchestrator
 */
import '../styles/styles.css';
import { Globe, ViewportSize } from '../core/Globes';
import { EarthConfig } from '../config/ConfigManager';
declare class EarthModernApp {
    private view;
    private configManager;
    private earthAPI;
    private products;
    private globe;
    private menuSystem;
    private particleSystem;
    private overlaySystem;
    private planetSystem;
    private inputHandler;
    private renderSystem;
    private meshSystem;
    private meshCanvas;
    private mesh;
    private mask;
    private planetCanvas;
    private particleCanvas;
    private overlayProduct;
    private particleProduct;
    private overlayCanvas;
    constructor();
    /**
     * Setup SVG map structure (graticule, sphere, etc.)
     * Called only when projection or view changes
     */
    private setupMapStructure;
    /**
     * Setup window resize handling
     */
    private setupResizeHandling;
    /**
     * Update UI elements for new view size
     */
    private updateUIForNewView;
    /**
     * Wire up all the callbacks - this is the ONLY place systems talk to each other
     */
    private wireCallbacks;
    /**
     * Setup RenderSystem to listen to actual visual state changes
     */
    private setupRenderSubscriptions;
    /**
     * Render current state - only pass data that should actually be rendered
     */
    private performRender;
    private eventHandlers;
    private on;
    private emit;
    /**
     * Start the application - just the bootstrap sequence
     */
    start(): Promise<void>;
    /**
     * Centralized function to call handleDataChange on all systems
     * This replaces scattered calls from data providers
     */
    private updateSystemsOnDataChange;
    /**
     * Centralized function to call handleRotation on all systems
     * This is only triggered by globe rotation events
     */
    private updateSystemsOnRotation;
    /**
     * Handle configuration changes - trigger the reactive chain
     */
    private handleConfigChange;
    /**
     * Create globe - single responsibility
     */
    private createGlobe;
    /**
     * Load weather data - clean separation of particle and overlay products
     */
    private loadWeatherData;
    private createInitialConfig;
    private setupUI;
    private loadMesh;
    getGlobe(): Globe | null;
    getMask(): any;
    getView(): ViewportSize;
    getConfig(): EarthConfig;
    getParticleProduct(): any;
    getOverlayProduct(): any;
    getMesh(): any;
    /**
     * Get the Earth API for external configuration
     */
    getAPI(): any;
}
export { EarthModernApp };
//# sourceMappingURL=Earth.d.ts.map