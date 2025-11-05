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

    // WebGL system
    private webglRenderer: WebGLRenderer | null = null;

    // 2D system
    private planetImageData: ImageData | null = null;
    private current2DPlanetImage: HTMLImageElement | null = null;

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

        debugLog('PLANET', 'PlanetSystem created with standardized pattern');
    }

    // ===== MAIN PATTERN METHODS =====

    /**
     * Main initialization - decides WebGL vs 2D based on projection and data availability
     */
    public initialize(): void {
        debugLog('PLANET', 'Starting initialization');

        // Reset everything
        this.reset();

        // Check if we should attempt WebGL
        if (this.shouldUseWebGL()) {
            debugLog('PLANET', 'Attempting WebGL initialization');
            if (this.initializeWebGL()) {
                this.useWebGL = true;
                debugLog('PLANET', 'WebGL initialization successful');
                return;
            }
            debugLog('PLANET', 'WebGL initialization failed, falling back to 2D');
        } else {
            debugLog('PLANET', 'WebGL not suitable for current mode/projection, using 2D');
        }

        // Fallback to 2D
        this.initialize2D();
        this.useWebGL = false;
        debugLog('PLANET', '2D initialization complete');
    }

    /**
     * Attempt WebGL initialization - returns true if successful
     */
    private initializeWebGL(): boolean {
        try {
            // Get current state
            const config = this.stateProvider?.getConfig();
            const globe = this.stateProvider?.getGlobe();
            const planetType = config?.planetType || 'earth';

            if (!config || !globe || config.mode !== 'planet') {
                debugLog('PLANET', 'WebGL init skipped - not in planet mode or missing data');
                return false;
            }

            // Create WebGL renderer
            this.webglRenderer = new WebGLRenderer();
            const webglInitialized = this.webglRenderer.initialize(this.webglCanvas);

            if (!webglInitialized) {
                debugLog('PLANET', 'WebGL renderer initialization failed');
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
                    this.webglRenderer.dispose();
                    this.webglRenderer = null;
                    return false;
                }
            } else {
                debugLog('PLANET', 'Planet image not loaded yet, WebGL setup deferred');
            }

            debugLog('PLANET', 'WebGL system initialized successfully');
            return true;

        } catch (error) {
            debugLog('PLANET', 'WebGL initialization error:', error);
            if (this.webglRenderer) {
                this.webglRenderer.dispose();
                this.webglRenderer = null;
            }
            return false;
        }
    }

    /**
     * Initialize 2D rendering system
     */
    private initialize2D(): void {
        debugLog('PLANET', 'Initializing 2D rendering system');

        // 2D system is always ready since we created the canvas in constructor
        // Just ensure canvas is properly sized
        const view = this.stateProvider?.getView();
        if (view) {
            this.canvas2D.width = view.width;
            this.canvas2D.height = view.height;
        }

        // Clear any existing ImageData to force recreation
        this.planetImageData = null;

        // Load the appropriate planet image for 2D rendering
        const config = this.stateProvider?.getConfig();
        const planetType = config?.planetType || 'earth';
        const useDayNight = config?.useDayNight || false;
        const cacheKey = useDayNight ? `${planetType}_daynight` : planetType;
        
        this.current2DPlanetImage = this.imageCache[cacheKey] || null;
        
        if (!this.current2DPlanetImage) {
            debugLog('PLANET', `2D initialization: planet image not loaded yet (${cacheKey})`);
        } else {
            debugLog('PLANET', `2D initialization: using cached planet image (${cacheKey})`);
        }

        debugLog('PLANET', '2D system initialized');
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

    // ===== DECISION LOGIC =====

    /**
     * Determine if WebGL should be used based on mode, projection and data availability
     */
    private shouldUseWebGL(): boolean {
        const config = this.stateProvider?.getConfig();
        const globe = this.stateProvider?.getGlobe();

        // Must be in planet mode
        if (!config || config.mode !== 'planet') {
            return false;
        }

        // Must have globe
        if (!globe) {
            return false;
        }

        // Check projection support
        const projectionType = globe.projectionType;
        const supportedProjections = ['orthographic', 'equirectangular'];

        return supportedProjections.includes(projectionType);
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
     * Render using 2D system
     */
    private render2D(): boolean {
        if (!this.ctx2D) {
            debugLog('PLANET', '2D render failed - no context');
            return false;
        }

        try {
            const globe = this.stateProvider?.getGlobe();
            const mask = this.stateProvider?.getMask();
            const view = this.stateProvider?.getView();
            const config = this.stateProvider?.getConfig();
            const planetType = config?.planetType || 'earth';

            if (!globe || !mask || !view || !config) {
                debugLog('PLANET', '2D render failed - missing state');
                return false;
            }

            // Ensure canvas is properly sized
            if (this.canvas2D.width !== view.width || this.canvas2D.height !== view.height) {
                this.canvas2D.width = view.width;
                this.canvas2D.height = view.height;
                this.planetImageData = null; // Force recreation
            }

            // Use pre-loaded planet image from initialization
            if (!this.current2DPlanetImage) {
                debugLog('PLANET', '2D render failed - planet image not loaded');
                return false;
            }

            // Create ImageData if needed
            if (!this.planetImageData) {
                this.planetImageData = this.ctx2D.createImageData(view.width, view.height);
            }

            // Clear ImageData
            const planetData = this.planetImageData.data;
            planetData.fill(0);

            // Generate planet data
            const bounds = globe.bounds(view);
            this.generate2DPlanetData(this.current2DPlanetImage, globe, view, mask, bounds, planetData);

            // Put ImageData onto canvas
            this.ctx2D.putImageData(this.planetImageData, 0, 0);

            debugLog('PLANET', '2D render successful');
            return true;

        } catch (error) {
            debugLog('PLANET', '2D render error:', error);
            return false;
        }
    }

    /**
     * Generate 2D planet data (same logic as original)
     */
    private generate2DPlanetData(
        planetImage: HTMLImageElement,
        globe: Globe,
        view: ViewportSize,
        mask: any,
        bounds: any,
        planetData: Uint8ClampedArray
    ): void {
        // Create a temporary canvas to sample from the planet image
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = planetImage.width;
        tempCanvas.height = planetImage.height;
        const tempCtx = tempCanvas.getContext('2d')!;
        tempCtx.drawImage(planetImage, 0, 0);
        const imageData = tempCtx.getImageData(0, 0, planetImage.width, planetImage.height);

        // Iterate through visible pixels and map planet surface
        for (let x = bounds.x; x <= bounds.xMax; x += 1) {
            for (let y = bounds.y; y <= bounds.yMax; y += 1) {
                if (mask.isVisible(x, y)) {
                    const coord = globe.projection?.invert?.([x, y]);

                    if (coord) {
                        const λ = coord[0], φ = coord[1];

                        if (isFinite(λ) && isFinite(φ)) {
                            // Convert lat/lon to image coordinates
                            // Longitude: -180 to 180 → 0 to imageWidth
                            // Latitude: 90 to -90 → 0 to imageHeight
                            const imgX = Math.floor(((λ + 180) / 360) * planetImage.width) % planetImage.width;
                            const imgY = Math.floor(((90 - φ) / 180) * planetImage.height);

                            // Ensure coordinates are within bounds
                            if (imgX >= 0 && imgX < planetImage.width && imgY >= 0 && imgY < planetImage.height) {
                                // Sample color from planet image
                                const imgIndex = (imgY * planetImage.width + imgX) * 4;
                                const r = imageData.data[imgIndex];
                                const g = imageData.data[imgIndex + 1];
                                const b = imageData.data[imgIndex + 2];
                                const a = imageData.data[imgIndex + 3];

                                // Set pixel color in output
                                this.setPixelColor(planetData, view.width, x, y, [r, g, b, a]);
                            }
                        }
                    }
                }
            }
        }
    }

    /**
     * Helper to set RGBA color at specific pixel coordinates
     */
    private setPixelColor(
        data: Uint8ClampedArray,
        width: number,
        x: number,
        y: number,
        rgba: number[]
    ): void {
        if (x >= 0 && x < width && y >= 0) {
            const i = (Math.floor(y) * width + Math.floor(x)) * 4;
            data[i] = rgba[0] || 0;     // red
            data[i + 1] = rgba[1] || 0; // green
            data[i + 2] = rgba[2] || 0; // blue
            data[i + 3] = rgba[3] || 255; // alpha (default to opaque)
        }
    }

    // ===== UTILITY METHODS =====

    /**
     * Reset system state
     */
    private reset(): void {
        debugLog('PLANET', 'Resetting system state');

        // Dispose WebGL resources
        if (this.webglRenderer) {
            this.webglRenderer.dispose();
            this.webglRenderer = null;
        }

        // Clear WebGL canvas
        if (this.webglCanvas) {
            const ctx = this.webglCanvas.getContext('webgl') || this.webglCanvas.getContext('webgl2');
            if (ctx) {
                ctx.clearColor(0.0, 0.0, 0.0, 0.0);
                ctx.clear(ctx.COLOR_BUFFER_BIT | ctx.DEPTH_BUFFER_BIT);
            }
        }

        // Clear 2D canvas
        if (this.ctx2D) {
            this.ctx2D.clearRect(0, 0, this.canvas2D.width, this.canvas2D.height);
        }

        // Reset state
        this.useWebGL = false;
        this.planetImageData = null;
        this.current2DPlanetImage = null;
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
        debugLog('PLANET', 'Handling data change - reinitializing system');

        // Load planet image first, then initialize
        const config = this.stateProvider?.getConfig();
        const planetType = config?.planetType || 'earth';
        const useDayNight = config?.useDayNight || false;

        this.loadPlanetImage(planetType, useDayNight).then(() => {
            this.initialize();
            this.regeneratePlanet();
        }).catch(error => {
            debugLog('PLANET', 'Failed to load planet image:', error);
            // Still initialize without image
            this.initialize();
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