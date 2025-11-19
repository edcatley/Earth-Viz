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
import { WebGLRenderer } from '../renderers/WebGLRenderer';
import { DayNightBlender } from '../renderers/DayNightBlender';
import { PlanetRenderer2D } from '../renderers/2dPlanetRenderer';

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
    private webglRenderer: WebGLRenderer | null = null;
    private renderer2D: PlanetRenderer2D;
    private imageCache: { [key: string]: HTMLImageElement } = {};
    private dayNightBlender: DayNightBlender | null = null;
    private sharedGLContext: WebGLRenderingContext | null = null;

    constructor() {
        this.renderer2D = new PlanetRenderer2D();
        debugLog('PLANET', 'PlanetSystem created');
    }

    /**
     * Initialize WebGL renderer with shared GL context
     */
    public initializeGL(gl: WebGLRenderingContext): void {
        if (this.webglRenderer) {
            debugLog('PLANET', 'WebGL renderer already initialized');
            return;
        }

        debugLog('PLANET', 'Initializing WebGL renderer with shared context');
        
        // Store shared context for DayNightBlender
        this.sharedGLContext = gl;
        
        this.webglRenderer = new WebGLRenderer();
        const success = this.webglRenderer.initialize(gl);

        if (!success) {
            debugLog('PLANET', 'WebGL initialization failed');
            this.webglRenderer.dispose();
            this.webglRenderer = null;
        } else {
            debugLog('PLANET', 'WebGL renderer initialized successfully');
        }
    }

    /**
     * Check if this system can render directly to a shared GL context
     */
    public canRenderDirect(): boolean {
        return this.webglRenderer !== null;
    }

    /**
     * Render directly to provided GL context (fast path)
     */
    public renderDirect(gl: WebGLRenderingContext, globe: Globe, view: ViewportSize): void {
        if (!this.webglRenderer) return;
        this.webglRenderer.render(gl, globe, view);
    }

    /**
     * Render directly to provided 2D context (2D path)
     */
    public render2DDirect(ctx: CanvasRenderingContext2D): void {
        ctx.drawImage(this.renderer2D.getCanvas(), 0, 0);
    }

    // ===== MAIN PATTERN METHODS =====

    /**
     * Setup renderers with current data
     * Tries WebGL first (if available), falls back to 2D
     */
    public setup(globe: Globe, view: ViewportSize, planetType: string, useDayNight: boolean): void {
        debugLog('PLANET', 'Starting setup');

        this.clearSetup();

        // Try WebGL first (if available)
        if (this.webglRenderer && this.setupWebGL(globe, view, planetType, useDayNight)) {
            debugLog('PLANET', 'WebGL setup successful');
            return;
        }

        // Fallback to 2D
        debugLog('PLANET', this.webglRenderer ? 'WebGL setup failed, using 2D' : 'WebGL not available, using 2D');
        this.setup2D(view, planetType, useDayNight);
    }

    /**
     * Attempt WebGL setup - returns true if successful
     */
    private setupWebGL(globe: Globe, view: ViewportSize, planetType: string, useDayNight: boolean): boolean {
        if (!this.webglRenderer) return false;

        try {
            if (!globe || !view) {
                debugLog('PLANET', 'WebGL setup skipped - missing globe or view data');
                return false;
            }

            // Load planet image and setup WebGL
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
    private setup2D(view: ViewportSize, planetType: string, useDayNight: boolean): void {
        debugLog('PLANET', 'Setting up 2D rendering system');

        // Initialize 2D renderer
        this.renderer2D.initialize(view);

        // Load the appropriate planet image for 2D rendering
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

    // ===== UTILITY METHODS =====

    /**
     * Clear current setup (but don't dispose renderers)
     */
    private clearSetup(): void {
        this.renderer2D.clear();
    }

    // ===== PUBLIC API =====

    /**
     * Handle rotation changes - updates 2D canvas
     */
    public handleRotation(globe: Globe, mask: any, view: ViewportSize): void {
        this.renderer2D.render(globe, mask, view);
    }

    /**
     * Handle data changes - re-setup and update 2D canvas
     */
    public async handleDataChange(globe: Globe, mask: any, view: ViewportSize, planetType: string, useDayNight: boolean): Promise<void> {
        debugLog('PLANET', 'Handling data change - re-setting up system');

        try {
            // Load planet image first, then setup
            await this.loadPlanetImage(planetType, useDayNight);
            this.setup(globe, view, planetType, useDayNight);
            this.renderer2D.render(globe, mask, view);
        } catch (error) {
            debugLog('PLANET', 'Failed to load planet image:', error);
            this.setup(globe, view, planetType, useDayNight);
            this.renderer2D.render(globe, mask, view);
        }
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

        // Note: WebGL setup happens in setupWebGL() when setup() is called
        // This just loads and caches the image

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

        // Initialize blender if needed (with shared GL context)
        if (!this.dayNightBlender) {
            const width = dayImg.naturalWidth;
            const height = dayImg.naturalHeight;
            this.dayNightBlender = new DayNightBlender(this.sharedGLContext, width, height);
            debugLog('PLANET', `Initialized DayNightBlender at ${width}x${height} with ${this.sharedGLContext ? 'shared GL context' : 'CPU fallback'}`);
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
     * Clean up resources
     */
    dispose(): void {
        debugLog('PLANET', 'Disposing PlanetSystem');

        if (this.webglRenderer) {
            this.webglRenderer.dispose();
            this.webglRenderer = null;
        }

        this.renderer2D.dispose();

        // Clear image cache
        this.imageCache = {};
    }
}