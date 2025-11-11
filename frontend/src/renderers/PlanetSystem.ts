/**
 * PlanetSystem - Standardized rendering system pattern
 * 
 * Rendering system using the common pattern:
 * - initialize() - Main entry point, decides WebGL vs 2D
 * - initializeWebGL() - Attempts WebGL setup
 * - initialize2D() - Sets up 2D fallback
 * - generateFrame() - Produces final canvas output
 */

import { Globe, ViewportSize } from '../core/Globes';
import { WebGLRenderer } from '../services/WebGLRenderer';
import { DayNightBlender } from '../services/DayNightBlender';
import { PlanetRenderer2D } from './2dPlanetRenderer';
import { PlanetRenderer2D } from './2dPlanetRenderer';
import { PlanetRenderer2D } from './2dPlanetRenderer';

// --- Constants ---
// Available planet types (day versions)
// Night variants are automatically loaded when useDayNight=true by appending '-night'
// e.g., 'earth' + '-night' = 'earth-night'
export const AVAILABLE_PLANETS = [
    'earth',           // Plain earth, no clouds
    'earth-clouds',    // Earth with clouds
    'mercury',
    'venus',
    'moon',
    'mars',
    'jupiter',
    'saturn',
    'sun'
];
const PLANETS_API_ENDPOINT = '/earth-viz/api/planets';

// --- Debug logging ---
function debugLog(category: string, message: string, data?: any): void {
    console.log(`[${category}] ${message}`, data || '');
}

export interface PlanetResult {
    canvas: HTMLCanvasElement | null;  // Single canvas output
    planetType: string;
}

export class PlanetSystem {
    // Common rendering system properties
    private webglCanvas: HTMLCanvasElement;
    private canvas2D: HTMLCanvasElement;
    private ctx2D: CanvasRenderingContext2D | null = null;
    private useWebGL: boolean = false;

    // Renderer delegates
    private webglRenderer: WebGLRenderer | null = null;
    private renderer2D: PlanetRenderer2D | null = null;

    // External state references
    private stateProvider: any = null;

    // Event callbacks
    private eventHandlers: { [key: string]: Function[] } = {};

    // Planet image cache
    private imageCache: { [key: string]: HTMLImageElement } = {};

    // Day/night blender (lazy initialized)
    private dayNightBlender: DayNightBlender | null = null;

    constructor() {
        // Create canvases
        this.webglCanvas = document.createElement("canvas");
        this.canvas2D = document.createElement("canvas");

        const ctx = this.canvas2D.getContext("2d");
        if (!ctx) {
            throw new Error("Failed to create 2D canvas context for PlanetSystem");
        }
        this.ctx2D = ctx;

        // Initialize renderers once - check what's available
        debugLog('PLANET', 'Initializing renderers');

        // Try to initialize WebGL renderer
        this.webglRenderer = new WebGLRenderer();
        const webglAvailable = this.webglRenderer.initialize(this.webglCanvas);

        if (!webglAvailable) {
            debugLog('PLANET', 'WebGL not available on this system');
            this.webglRenderer.dispose();
            this.webglRenderer = null;
        } else {
            debugLog('PLANET', 'WebGL renderer initialized');
        }

        // Create 2D renderer (always available)
        this.renderer2D = new PlanetRenderer2D();
        debugLog('PLANET', '2D renderer created');

        debugLog('PLANET', 'PlanetSystem created');
    }

    // ===== MAIN PATTERN METHODS =====

    /**
     * Setup renderers with current data
     * Tries WebGL first (if available), falls back to 2D
     */
    public setup(): void {
        debugLog('PLANET', 'Starting setup');

        // Clear any existing setup
        this.clearSetup();

        // Try WebGL first (if available)
        if (this.webglRenderer) {
            debugLog('PLANET', 'Attempting WebGL setup');
            if (this.setupWebGL()) {
                this.useWebGL = true;
                debugLog('PLANET', 'WebGL setup successful');
                return;
            }
            debugLog('PLANET', 'WebGL setup failed, falling back to 2D');
        } else {
            debugLog('PLANET', 'WebGL not available, using 2D');
        }

        // Fallback to 2D
        this.setup2D();
        this.useWebGL = false;
        debugLog('PLANET', '2D setup complete');
    }

    /**
     * Attempt WebGL setup - returns true if successful
     */
    private setupWebGL(): boolean {
        if (!this.webglRenderer) {
            return false;
        }

        try {
            // Get current state
            const config = this.stateProvider?.getConfig();
            const globe = this.stateProvider?.getGlobe();
            const planetType = config?.planetType || 'earth';

            if (!config || !globe || config.mode !== 'planet') {
                debugLog('PLANET', 'WebGL setup skipped - not in planet mode or missing data');
                return false;
            }

            // Load planet image and setup WebGL
            // Use same cache key logic as loadPlanetImage
            const useDayNight = config?.useDayNight || false;
            const cacheKey = useDayNight ? `${planetType}_daynight` : planetType;
            const planetImage = this.imageCache[cacheKey];
            debugLog('PLANET', `Looking for cached image with key: ${cacheKey}, found: ${!!planetImage}, type: ${planetImage instanceof HTMLCanvasElement ? 'Canvas' : 'Image'}`);
            if (planetImage) {
                const setupSuccess = this.webglRenderer.setup('planet', planetImage, globe);

                if (!setupSuccess) {
                    debugLog('PLANET', 'WebGL planet setup failed');
                    return false;
                }
            } else {
                debugLog('PLANET', 'Planet image not loaded yet, WebGL setup deferred');
                return false;
            }

            debugLog('PLANET', 'WebGL setup successful');
            return true;

        } catch (error) {
            debugLog('PLANET', 'WebGL setup error:', error);
            return false;
        }
    }

    /**
     * Setup 2D rendering system
     */
    private setup2D(): void {
        debugLog('PLANET', 'Setting up 2D rendering system');

        const view = this.stateProvider?.getView();
        if (!view || !this.ctx2D || !this.renderer2D) {
            return;
        }

        // Size canvas
        this.canvas2D.width = view.width;
        this.canvas2D.height = view.height;

        // Initialize 2D renderer
        this.renderer2D.initialize(this.ctx2D, view);

        // Load the appropriate planet image for 2D rendering
        const config = this.stateProvider?.getConfig();
        const planetType = config?.planetType || 'earth';
        const useDayNight = config?.useDayNight || false;
        const cacheKey = useDayNight ? `${planetType}_daynight` : planetType;
        
        const planetImage = this.imageCache[cacheKey];
        
        if (!planetImage) {
            debugLog('PLANET', `2D setup: planet image not loaded yet (${cacheKey})`);
        } else {
            this.renderer2D.setup(planetImage);
            debugLog('PLANET', `2D setup: using cached planet image (${cacheKey})`);
        }

        debugLog('PLANET', '2D setup complete');
    }

    /**
     * Generate frame using appropriate rendering system
     */
    public generateFrame(): HTMLCanvasElement | null {
        const config = this.stateProvider?.getConfig();

        // Skip if not in planet mode
        if (!config || config.mode !== 'planet') {
            debugLog('PLANET', `Skipping test generation - not in planet mode: ${config?.mode}`);
            return null;
        }

        debugLog('PLANET', `Generating using ${this.useWebGL ? 'WebGL' : '2D'}`);

        if (this.useWebGL) {
            return this.renderWebGL() ? this.webglCanvas : null;
        } else {
            return this.render2D() ? this.canvas2D : null;
        }
    }

    // ===== RENDERING IMPLEMENTATIONS =====

    /**
     * Render using WebGL system
     */
    private renderWebGL(): boolean {
        if (!this.webglRenderer) {
            debugLog('PLANET', 'WebGL render failed - no renderer');
            return false;
        }

        try {
            const globe = this.stateProvider?.getGlobe();
            const view = this.stateProvider?.getView();

            if (!globe || !view) {
                debugLog('PLANET', 'WebGL render failed - missing state');
                return false;
            }

            // Ensure canvas is properly sized
            if (this.webglCanvas.width !== view.width || this.webglCanvas.height !== view.height) {
                this.webglCanvas.width = view.width;
                this.webglCanvas.height = view.height;
            }

            // Render the planet 
            const renderSuccess = this.webglRenderer.render(globe, view);

            if (renderSuccess) {
                debugLog('PLANET', 'WebGL render successful');
                return true;
            } else {
                debugLog('PLANET', 'WebGL render failed');
                return false;
            }

        } catch (error) {
            debugLog('PLANET', 'WebGL render error:', error);
            return false;
        }
    }

    /**
     * Render using 2D system - delegates to PlanetRenderer2D
     */
    private render2D(): boolean {
        if (!this.ctx2D || !this.renderer2D) {
            debugLog('PLANET', '2D render failed - no renderer');
            return false;
        }

        try {
            const globe = this.stateProvider?.getGlobe();
            const mask = this.stateProvider?.getMask();
            const view = this.stateProvider?.getView();

            if (!globe || !mask || !view) {
                debugLog('PLANET', '2D render failed - missing state');
                return false;
            }

            // Delegate to 2D renderer
            return this.renderer2D.render(this.ctx2D, globe, mask, view);

        } catch (error) {
            debugLog('PLANET', '2D render error:', error);
            return false;
        }
    }

    // ===== UTILITY METHODS =====

    /**
     * Clear current setup (but don't dispose renderers)
     */
    private clearSetup(): void {
        debugLog('PLANET', 'Clearing current setup');

        // Clear canvases
        if (this.webglRenderer) {
            this.webglRenderer.clear();
        }

        if (this.renderer2D && this.ctx2D) {
            this.renderer2D.clear(this.ctx2D, this.canvas2D);
        }

        // Reset state
        this.useWebGL = false;
    }

    // ===== PUBLIC API (same as original) =====

    /**
     * Set external state provider (no longer subscribing to events)
     */
    setStateProvider(stateProvider: any): void {
        this.stateProvider = stateProvider;
        debugLog('PLANET', 'State provider set');
    }

    /**
     * Handle rotation changes that require re-rendering (not re-initialization)
     * Now called directly from Earth.ts centralized functions
     */
    public handleRotation(): void {
        debugLog('PLANET', 'Handling rotation change - regenerating frame');
        this.regeneratePlanet();
    }

    /**
     * Handle data changes that require re-initialization
     * Now called directly from Earth.ts centralized functions
     */
    public handleDataChange(): void {
        debugLog('PLANET', 'Handling data change - re-setting up system');

        // Load planet image first, then setup
        const config = this.stateProvider?.getConfig();
        const planetType = config?.planetType || 'earth';
        const useDayNight = config?.useDayNight || false;

        this.loadPlanetImage(planetType, useDayNight).then(() => {
            this.setup();
            this.regeneratePlanet();
        }).catch(error => {
            debugLog('PLANET', 'Failed to load planet image:', error);
            // Still setup without image
            this.setup();
            this.regeneratePlanet();
        });
    }

    /**
     * Generate planet and emit result
     */
    private regeneratePlanet(): void {
        const canvas = this.generateFrame();
        const config = this.stateProvider?.getConfig();

        const result: PlanetResult = {
            canvas: canvas,
            planetType: config?.planetType || 'earth'
        };

        this.emit('planetChanged', result);
    }

    /**
     * Load planet image from URL
     * @param planetType The planet to load (e.g., 'earth', 'mars')
     * @param useDayNight If true, loads both day and night versions and blends them
     * @returns HTMLImageElement with planet texture
     */
    private async loadPlanetImage(planetType: string, useDayNight: boolean = false): Promise<HTMLImageElement> {
        // Generate cache key based on day/night mode
        const cacheKey = useDayNight ? `${planetType}_daynight` : planetType;
        
        // Check cache first
        if (this.imageCache[cacheKey]) {
            return this.imageCache[cacheKey];
        }

        if (!AVAILABLE_PLANETS.includes(planetType)) {
            throw new Error(`Unknown planet type: ${planetType}`);
        }

        // Load image(s)
        let image: HTMLImageElement;
        console.log("using day/night blending: ", useDayNight);
        if (useDayNight) {
            // Load both day and night images and blend them
            image = await this.loadAndBlendDayNight(planetType);
        } else {
            // Standard single image load
            const url = `${PLANETS_API_ENDPOINT}/${planetType}`;
            image = await this.loadSingleImage(url, planetType);
        }

        // Cache the result
        this.imageCache[cacheKey] = image;

        // Setup WebGL for this planet if WebGL is available
        if (this.useWebGL && this.webglRenderer) {
            const globe = this.stateProvider?.getGlobe();
            if (globe) {
                const setupSuccess = this.webglRenderer.setup('planet', image, globe);
                if (setupSuccess) {
                    debugLog('PLANET', `WebGL setup completed for ${planetType}${useDayNight ? ' (day/night)' : ''}`);
                } else {
                    debugLog('PLANET', `WebGL setup failed for ${planetType}${useDayNight ? ' (day/night)' : ''}`);
                }
            }
        }

        return image;
    }

    /**
     * Load day and night versions of a planet and blend them with real-time terminator
     * Returns the blended image - caller handles caching and WebGL setup
     */
    private async loadAndBlendDayNight(planetType: string): Promise<HTMLImageElement> {
        debugLog('PLANET', `Loading day/night blend for ${planetType}`);

        // Load both day and night images in parallel
        const dayUrl = `${PLANETS_API_ENDPOINT}/${planetType}`;
        const nightUrl = `${PLANETS_API_ENDPOINT}/${planetType}-night`;

        const [dayImg, nightImg] = await Promise.all([
            this.loadSingleImage(dayUrl, `${planetType} (day)`),
            this.loadSingleImage(nightUrl, `${planetType} (night)`)
        ]);

        // Initialize blender if needed
        if (!this.dayNightBlender) {
            const width = dayImg.naturalWidth;
            const height = dayImg.naturalHeight;
            this.dayNightBlender = new DayNightBlender(width, height);
            debugLog('PLANET', `Initialized DayNightBlender at ${width}x${height}`);
        }

        // Blend the images and return
        const blendedImage = await this.dayNightBlender.blend(dayImg, nightImg);
        debugLog('PLANET', `Day/night blend complete for ${planetType}`);

        return blendedImage;
    }

    /**
     * Helper to load a single image
     */
    private async loadSingleImage(url: string, description: string): Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';

            img.onload = () => {
                debugLog('PLANET', `Image loaded: ${description}`, {
                    url,
                    width: img.naturalWidth,
                    height: img.naturalHeight
                });
                resolve(img);
            };

            img.onerror = () => {
                const error = `Failed to load image: ${description} from ${url}`;
                debugLog('PLANET', error);
                reject(new Error(error));
            };

            img.src = url;
        });
    }

    /**
     * Subscribe to planet change events
     */
    on(event: string, handler: Function): void {
        if (!this.eventHandlers[event]) {
            this.eventHandlers[event] = [];
        }
        this.eventHandlers[event].push(handler);
    }

    /**
     * Emit events to subscribers
     */
    private emit(event: string, ...args: any[]): void {
        if (this.eventHandlers[event]) {
            this.eventHandlers[event].forEach(handler => handler(...args));
        }
    }


    /**
     * Clean up resources
     */
    dispose(): void {
        if (this.webglRenderer) {
            this.webglRenderer.dispose();
            this.webglRenderer = null;
        }

        // Clear image cache
        this.imageCache = {};

        this.eventHandlers = {};
        this.stateProvider = null;
    }
}