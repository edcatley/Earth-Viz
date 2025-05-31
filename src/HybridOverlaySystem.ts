import { OverlaySystem, OverlayResult } from './OverlaySystem';
import { createWebGLOverlaySystem, testWebGLSystem } from './WebGLOverlaySystem';

interface ViewportSize {
    width: number;
    height: number;
}

interface DisplayOptions {
    width: number;
    height: number;
    projection: any;
    orientation: number[];
}

interface RenderSystem {
    getOverlayCanvas(): HTMLCanvasElement | null;
}

export class HybridOverlaySystem {
    private webglSystem: any | null = null;
    private cpuSystem: OverlaySystem;
    private useWebGL: boolean = false;
    
    // Current state for WebGL callbacks
    private currentProduct: any = null;
    private currentOverlayType: string = '';
    private currentGlobe: any = null;
    private currentView: ViewportSize | null = null;
    
    // Track display size for resize detection
    private lastDisplayWidth: number = -1;
    private lastDisplayHeight: number = -1;
    private lastPixelDensity: number = -1;
    
    // Store references for WebGL recreation
    private renderSystem: RenderSystem | null = null;
    private displayOptions: DisplayOptions | null = null;

    constructor(renderSystem: RenderSystem, display: DisplayOptions) {
        console.log('HybridOverlaySystem: Initializing');
        
        // Store references for WebGL recreation
        this.renderSystem = renderSystem;
        this.displayOptions = display;
        
        // Always initialize CPU system as fallback
        this.cpuSystem = new OverlaySystem();
        
        // Get canvas from render system FIRST
        const canvas = renderSystem.getOverlayCanvas();
        if (!canvas) {
            console.warn('HybridOverlaySystem: No overlay canvas available');
            this.useWebGL = false;
            return;
        }

        // Test WebGL capabilities with the actual canvas dimensions
        const testResult = testWebGLSystem(undefined, canvas.width, canvas.height);
        console.log('HybridOverlaySystem: WebGL test result:', testResult);
                
        if (testResult.pass) {
            console.log('HybridOverlaySystem: WebGL available, will use hybrid mode');
            this.useWebGL = true;
            
            // Initialize WebGL system immediately
            try {
                this.initializeWebGL(renderSystem, display, canvas);
            } catch (error) {
                console.error('HybridOverlaySystem: WebGL initialization failed, falling back to CPU-only', error);
                this.useWebGL = false;
                this.webglSystem = null;
            }
        } else {
            console.log('HybridOverlaySystem: WebGL not available, using CPU-only mode');
            this.useWebGL = false;
        }
        
        console.log('HybridOverlaySystem: Initialization complete');
    }

    /**
     * Initialize WebGL overlay system
     * No products needed - they're provided dynamically via callbacks
     */
    private initializeWebGL(renderSystem: RenderSystem, display: DisplayOptions, canvas: HTMLCanvasElement): void {
        console.log('HybridOverlaySystem: Initializing WebGL overlay system');
        
        // Callback functions that provide current state to WebGL system
        const getAlpha = () => this.getCurrentAlpha();
        
        // Cache pixelDensity to prevent WebGL context loss from devicePixelRatio changes
        const cachedPixelDensity = window.devicePixelRatio || 1;
        console.log('HybridOverlaySystem: Caching pixel density:', cachedPixelDensity);
        
        const getDisplay = () => ({
            width: display.width,
            height: display.height,
            pixelDensity: cachedPixelDensity
        });
        
        const getShaderSources = (helper: any) => {
            // Called every frame - returns shaders/textures for current product
            return this.generateShaderSourcesForCurrentProduct(helper);
        };

        // Handle context loss by recreating the WebGL system
        const onContextLoss = () => {
            console.error('HybridOverlaySystem: WebGL context lost, will recreate on next render');
            this.webglSystem = null;
            this.useWebGL = false;
        };

        console.log('HybridOverlaySystem: Creating WebGL overlay system');
        const webglSystem = createWebGLOverlaySystem(
            canvas,
            undefined, // No offscreen canvas for now
            getAlpha,
            getDisplay,
            getShaderSources,
            onContextLoss
        );
        
        // Check if WebGL system was actually created successfully
        // The system returns a fallback object when context creation fails
        const testDraw = webglSystem.draw();
        if (!testDraw.pass) {
            console.error('HybridOverlaySystem: WebGL system creation failed:', testDraw.err);
            this.useWebGL = false;
            this.webglSystem = null;
            return;
        }
        
        // Only set the system if it actually works
        this.webglSystem = webglSystem;
        
        // Track current display dimensions
        this.lastDisplayWidth = display.width;
        this.lastDisplayHeight = display.height;
        this.lastPixelDensity = cachedPixelDensity;
        
        console.log('HybridOverlaySystem: WebGL overlay system initialized successfully');
    }

    /**
     * Check if display has changed and recreate WebGL system if needed
     */
    private checkAndHandleDisplayChanges(): void {
        if (!this.displayOptions || !this.renderSystem) return;
        
        const currentPixelDensity = window.devicePixelRatio || 1;
        const displayChanged = 
            this.displayOptions.width !== this.lastDisplayWidth ||
            this.displayOptions.height !== this.lastDisplayHeight ||
            currentPixelDensity !== this.lastPixelDensity;
            
        if (displayChanged) {
            console.warn('HybridOverlaySystem: Display changed, recreating WebGL system', {
                oldSize: [this.lastDisplayWidth, this.lastDisplayHeight, this.lastPixelDensity],
                newSize: [this.displayOptions.width, this.displayOptions.height, currentPixelDensity],
                changes: {
                    width: this.displayOptions.width !== this.lastDisplayWidth,
                    height: this.displayOptions.height !== this.lastDisplayHeight,
                    pixelDensity: currentPixelDensity !== this.lastPixelDensity
                }
            });
            
            // Dispose old WebGL system
            if (this.webglSystem) {
                console.log('HybridOverlaySystem: Disposing old WebGL system');
                this.webglSystem = null;
            }
            
            // Recreate WebGL system with new dimensions
            if (this.useWebGL) {
                try {
                    console.log('HybridOverlaySystem: Recreating WebGL system');
                    this.initializeWebGL(this.renderSystem, this.displayOptions);
                } catch (error) {
                    console.error('HybridOverlaySystem: Failed to recreate WebGL system after resize:', error);
                    this.useWebGL = false;
                }
            }
        }
    }

    /**
     * Update display options (called when window resizes)
     */
    public updateDisplay(display: DisplayOptions): void {
        console.log('HybridOverlaySystem: Updating display options');
        this.displayOptions = display;
        // Display change will be detected and handled on next generateOverlay call
    }

    /**
     * Generate overlay using the best available method
     * This is the main function that Earth.ts calls with current product
     */
    generateOverlay(
        overlayProduct: any,
        globe: any,
        mask: any,
        view: ViewportSize,
        overlayType: string
    ): OverlayResult {
        console.log('HybridOverlaySystem: generateOverlay called', { 
            overlayType, 
            useWebGL: this.useWebGL,
            hasWebGLSystem: !!this.webglSystem,
            hasProduct: !!overlayProduct,
            productType: overlayProduct?.type
        });
        
        // Check for display changes and recreate WebGL if needed
        this.checkAndHandleDisplayChanges();
        
        if (!this.useWebGL || !this.webglSystem) {
            console.warn('HybridOverlaySystem: WebGL not available, using CPU overlay', {
                useWebGL: this.useWebGL,
                hasWebGLSystem: !!this.webglSystem
            });
            return this.cpuSystem.generateOverlay(overlayProduct, globe, mask, view, overlayType);
        }

        // Store current state for WebGL callbacks
        this.currentProduct = overlayProduct;
        this.currentOverlayType = overlayType;
        this.currentGlobe = globe;
        this.currentView = view;

        try {
            console.log('HybridOverlaySystem: Attempting WebGL overlay generation');
            const webglResult = this.webglSystem.draw();
            
            if (webglResult.pass) {
                console.log('HybridOverlaySystem: WebGL overlay generation successful');
                
                // TODO: Extract imageData from WebGL canvas
                // For now, still fall back to CPU since we need to extract imageData
                const imageData = this.extractImageDataFromWebGL();
                if (imageData) {
                    return { imageData, overlayType };
                }
                
                console.log('HybridOverlaySystem: WebGL succeeded but falling back to CPU for imageData extraction');
            } else {
                console.warn('HybridOverlaySystem: WebGL overlay failed, falling back to CPU:', webglResult.err);
                
                // If WebGL failed, disable it temporarily
                if (webglResult.err && webglResult.err.includes('context')) {
                    console.error('HybridOverlaySystem: WebGL context error detected, disabling WebGL');
                    this.useWebGL = false;
                    this.webglSystem = null;
                }
            }
        } catch (error) {
            console.error('HybridOverlaySystem: WebGL overlay error, falling back to CPU:', error);
            
            // Disable WebGL on exception
            this.useWebGL = false;
            this.webglSystem = null;
        }

        // Use CPU system (either as fallback or primary)
        console.log('HybridOverlaySystem: Using CPU overlay');
        return this.cpuSystem.generateOverlay(overlayProduct, globe, mask, view, overlayType);
    }

    /**
     * Generate shader sources for the current product
     * Called by WebGL system every frame
     */
    private generateShaderSourcesForCurrentProduct(helper: any): any[] {
        if (!this.currentProduct || !this.currentOverlayType) {
            return [];
        }

        console.log('HybridOverlaySystem: Generating shader sources for', {
            productType: this.currentProduct.type,
            overlayType: this.currentOverlayType
        });

        try {
            // Convert current product data into WebGL textures and shaders
            const sources: any[] = [];
            
            // Create weather data texture from current product
            const weatherTexture = this.createWeatherTexture(this.currentProduct);
            if (!weatherTexture) {
                console.warn('HybridOverlaySystem: Failed to create weather texture');
                return [];
            }
            
            // Create color scale texture for current overlay type
            const colorScaleTexture = this.createColorScaleTexture(this.currentOverlayType);
            
            // Generate projection shader based on current globe
            const projectionShader = this.getProjectionShader();
            
            sources.push({
                shaderSource: [
                    projectionShader,
                    this.getGridInterpolationShader(),
                    this.getColorMappingShader(this.currentOverlayType)
                ],
                textures: {
                    u_WeatherData: weatherTexture,
                    u_ColorScale: colorScaleTexture
                },
                uniforms: {
                    u_GridDimensions: [this.currentProduct.width || 360, this.currentProduct.height || 180],
                    u_DataRange: [this.currentProduct.min || 0, this.currentProduct.max || 1],
                    u_Time: Date.now() / 1000 // For animation
                }
            });
            
            console.log('HybridOverlaySystem: Generated shader sources:', sources.length);
            return sources;
            
        } catch (error) {
            console.error('HybridOverlaySystem: Failed to generate shader sources:', error);
            return [];
        }
    }

    /**
     * Create weather data texture from product
     */
    private createWeatherTexture(product: any): any | null {
        if (!product || !product.data) {
            console.warn('HybridOverlaySystem: No product data for texture');
            return null;
        }

        try {
            const { data } = product;
            const width = product.width || product.header?.nx || 360;
            const height = product.height || product.header?.ny || 180;
            
            // Convert to Float32Array if needed
            let floatData: Float32Array;
            if (data instanceof Float32Array) {
                floatData = data;
            } else if (Array.isArray(data)) {
                floatData = new Float32Array(data);
            } else {
                console.warn('HybridOverlaySystem: Unsupported data format for WebGL texture');
                return null;
            }
            
            console.log('HybridOverlaySystem: Creating weather texture', {
                width, height, dataLength: floatData.length
            });
            
            return {
                width: width,
                height: height,
                format: 'LUMINANCE', // Will be converted to GL constant by WebGL system
                type: 'FLOAT',
                pixels: floatData,
                hash: `weather_${product.type}_${product.timestamp || Date.now()}` // For caching
            };
            
        } catch (error) {
            console.error('HybridOverlaySystem: Failed to create weather texture:', error);
            return null;
        }
    }

    /**
     * Create color scale texture for overlay type
     */
    private createColorScaleTexture(overlayType: string): any {
        // TODO: Implement color scale textures based on overlay type
        // For now, return a simple gradient
        const colors = new Uint8Array([
            0, 0, 255, 255,     // Blue
            0, 255, 255, 255,   // Cyan  
            0, 255, 0, 255,     // Green
            255, 255, 0, 255,   // Yellow
            255, 0, 0, 255      // Red
        ]);
        
        return {
            width: 5,
            height: 1,
            format: 'RGBA',
            type: 'UNSIGNED_BYTE',
            pixels: colors,
            hash: `colorscale_${overlayType}`
        };
    }

    /**
     * Get projection shader based on current globe
     */
    private getProjectionShader(): string {
        // TODO: Generate projection shader based on this.currentGlobe
        // For now, return basic orthographic projection
        return `
            vec2 project(vec2 lonlat) {
                // Basic orthographic projection
                float lon = lonlat.x * 3.14159 / 180.0;
                float lat = lonlat.y * 3.14159 / 180.0;
                return vec2(cos(lat) * cos(lon), sin(lat));
            }
        `;
    }

    /**
     * Get grid interpolation shader
     */
    private getGridInterpolationShader(): string {
        return `
            float lookup(vec2 coord) {
                // Bilinear interpolation of weather data
                return texture2D(u_WeatherData, coord).r;
            }
        `;
    }

    /**
     * Get color mapping shader for overlay type
     */
    private getColorMappingShader(overlayType: string): string {
        return `
            vec4 colorize(float value) {
                if (value < -999.0) return vec4(0.0, 0.0, 0.0, 0.0); // Transparent for missing data
                
                // Normalize value to [0,1] range
                float normalized = (value - u_DataRange.x) / (u_DataRange.y - u_DataRange.x);
                normalized = clamp(normalized, 0.0, 1.0);
                
                // Sample color scale texture
                return texture2D(u_ColorScale, vec2(normalized, 0.5));
            }
        `;
    }

    /**
     * Get current alpha value for WebGL
     */
    private getCurrentAlpha(): number {
        // TODO: Make this configurable
        return 1.0;
    }

    /**
     * Extract ImageData from WebGL canvas
     */
    private extractImageDataFromWebGL(): ImageData | null {
        // TODO: Implement extraction of ImageData from WebGL canvas
        // This would read pixels from the WebGL canvas and convert to ImageData
        console.log('HybridOverlaySystem: TODO - Extract ImageData from WebGL canvas');
        return null;
    }

    /**
     * Force CPU-only mode (disable WebGL)
     */
    forceCPUMode(): void {
        console.log('HybridOverlaySystem: Forcing CPU-only mode');
        this.useWebGL = false;
        if (this.webglSystem) {
            // TODO: Dispose WebGL system if needed
            this.webglSystem = null;
        }
    }

    /**
     * Try to re-enable WebGL mode
     */
    tryWebGLMode(): void {
        console.log('HybridOverlaySystem: Attempting to re-enable WebGL mode');
        const webglTest = testWebGLSystem();
        if (webglTest.pass) {
            this.useWebGL = true;
            console.log('HybridOverlaySystem: WebGL mode re-enabled');
        } else {
            console.log('HybridOverlaySystem: WebGL still not available');
        }
    }

    /**
     * Get current rendering mode
     */
    getCurrentMode(): 'webgl' | 'cpu' {
        return this.useWebGL && this.webglSystem ? 'webgl' : 'cpu';
    }

    /**
     * Get system statistics
     */
    getStats() {
        return {
            mode: this.getCurrentMode(),
            webglAvailable: this.useWebGL,
            hasWebGLSystem: !!this.webglSystem,
            hasCurrentProduct: !!this.currentProduct,
            currentOverlayType: this.currentOverlayType
        };
    }

    /**
     * Clean up resources
     */
    dispose(): void {
        console.log('HybridOverlaySystem: Disposing');
        if (this.webglSystem) {
            // TODO: Dispose WebGL system if needed
            this.webglSystem = null;
        }
        this.currentProduct = null;
        this.currentOverlayType = '';
        this.currentGlobe = null;
        this.currentView = null;
    }
} 