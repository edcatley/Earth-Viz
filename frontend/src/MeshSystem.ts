/**
 * MeshSystem - Standardized rendering system pattern
 * 
 * Rendering system using the common pattern:
 * - initialize() - Main entry point, decides WebGL vs 2D
 * - initializeWebGL() - Attempts WebGL setup
 * - initialize2D() - Sets up 2D fallback
 * - generateFrame() - Produces final canvas output
 */

import * as d3 from 'd3';
import { Globe, ViewportSize } from './Globes';
import { WebGLMeshRenderer } from './services/WebGLMeshRenderer';

// Debug logging
function debugLog(category: string, message: string, data?: any): void {
    console.log(`[${category}] ${message}`, data || '');
}

// Constants
export interface MeshStyle {
    color: [number, number, number];
    lineWidth: number;
    opacity: number;
}

export interface MeshResult {
    canvas: HTMLCanvasElement | null;  // Single canvas output
    meshType: string;
}

export class MeshSystem {
    // Common rendering system properties
    private webglCanvas: HTMLCanvasElement;
    private canvas2D: HTMLCanvasElement;
    private ctx2D: CanvasRenderingContext2D | null = null;
    private useWebGL: boolean = false;
    
    // WebGL system
    private webglMeshRenderer: WebGLMeshRenderer | null = null;
    
    // External state references
    private stateProvider: any = null;
    
    // Event callbacks
    private eventHandlers: { [key: string]: Function[] } = {};
    
    // Mesh styling configuration
    private meshStyles = {
        coastlines: { color: [0.98, 0.98, 0.98] as [number, number, number], lineWidth: 8.0, opacity: 0.65 },
        lakes: { color: [0.86, 0.86, 0.86] as [number, number, number], lineWidth: 6.0, opacity: 0.65 },
        rivers: { color: [0.86, 0.86, 0.86] as [number, number, number], lineWidth: 4.0, opacity: 0.65 }
    };
    
    constructor() {
        // Create canvases
        this.webglCanvas = document.createElement("canvas");
        this.canvas2D = document.createElement("canvas");
        
        const ctx = this.canvas2D.getContext("2d");
        if (!ctx) {
            throw new Error("Failed to create 2D canvas context for MeshSystem");
        }
        this.ctx2D = ctx;
        
        debugLog('MESH', 'MeshSystem created with standardized pattern');
    }
    
    // ===== MAIN PATTERN METHODS =====
    
    /**
     * Main initialization - decides WebGL vs 2D based on projection and data availability
     */
    public initialize(): void {
        debugLog('MESH', 'Starting initialization');
        
        // Reset everything
        this.reset();
        
        // Check if we should attempt WebGL
        if (this.shouldUseWebGL()) {
            debugLog('MESH', 'Attempting WebGL initialization');
            if (this.initializeWebGL()) {
                this.useWebGL = true;
                debugLog('MESH', 'WebGL initialization successful');
                return;
            }
            debugLog('MESH', 'WebGL initialization failed, falling back to 2D');
        } else {
            debugLog('MESH', 'WebGL not suitable for current projection, using 2D');
        }
        
        // Fallback to 2D
        this.initialize2D();
        this.useWebGL = false;
        debugLog('MESH', '2D initialization complete');
    }
    
    /**
     * Attempt WebGL initialization - returns true if successful
     */
    private initializeWebGL(): boolean {
        try {
            // Get current state
            const globe = this.stateProvider?.getGlobe();
            const mesh = this.stateProvider?.getMesh();
            
            if (!globe || !mesh) {
                debugLog('MESH', 'WebGL init skipped - missing required data');
                return false;
            }
            
            // Create WebGL renderer
            this.webglMeshRenderer = new WebGLMeshRenderer();
            const webglInitialized = this.webglMeshRenderer.initialize(this.webglCanvas, globe);
            
            if (!webglInitialized) {
                debugLog('MESH', 'WebGL mesh renderer initialization failed');
                return false;
            }
            
            // Load mesh data into WebGL renderer
            this.loadWebGLMeshData(mesh);
            
            debugLog('MESH', 'WebGL system initialized successfully');
            return true;
            
        } catch (error) {
            debugLog('MESH', 'WebGL initialization error:', error);
            if (this.webglMeshRenderer) {
                this.webglMeshRenderer.dispose();
                this.webglMeshRenderer = null;
            }
            return false;
        }
    }
    
    /**
     * Initialize 2D rendering system
     */
    private initialize2D(): void {
        debugLog('MESH', 'Initializing 2D rendering system');
        
        // 2D system is always ready since we created the canvas in constructor
        // Just ensure canvas is properly sized
        const view = this.stateProvider?.getView();
        if (view) {
            this.canvas2D.width = view.width;
            this.canvas2D.height = view.height;
        }
        
        debugLog('MESH', '2D system initialized');
    }
    
    /**
     * Generate frame using appropriate rendering system
     */
    public generateFrame(): HTMLCanvasElement | null {
        debugLog('MESH', `Generating frame using ${this.useWebGL ? 'WebGL' : '2D'}`);
        
        if (this.useWebGL) {
            return this.renderWebGL() ? this.webglCanvas : null;
        } else {
            return this.render2D() ? this.canvas2D : null;
        }
    }
    
    // ===== DECISION LOGIC =====
    
    /**
     * Determine if WebGL should be used based on projection and data availability
     */
    private shouldUseWebGL(): boolean {
        const globe = this.stateProvider?.getGlobe();
        const mesh = this.stateProvider?.getMesh();
        
        // Must have required data
        if (!globe || !mesh) {
            return false;
        }
        
        // Check projection support - WebGL works best with orthographic
        const projectionType = globe.projectionType;
        return projectionType === 'orthographic';
    }
    
    // ===== RENDERING IMPLEMENTATIONS =====
    
    /**
     * Render using WebGL system
     */
    private renderWebGL(): boolean {
        if (!this.webglMeshRenderer) {
            debugLog('MESH', 'WebGL render failed - no renderer');
            return false;
        }
        
        try {
            const globe = this.stateProvider?.getGlobe();
            const view = this.stateProvider?.getView();
            const mesh = this.stateProvider?.getMesh();
            
            if (!globe || !view || !mesh) {
                debugLog('MESH', 'WebGL render failed - missing state');
                return false;
            }
            
            // Ensure canvas is properly sized
            if (this.webglCanvas.width !== view.width || this.webglCanvas.height !== view.height) {
                this.webglCanvas.width = view.width;
                this.webglCanvas.height = view.height;
            }
            
            // Clear the canvas
            this.webglMeshRenderer.clear();
            
            // Determine which meshes to render based on available data
            const meshesToRender: string[] = [];
            if (mesh.coastLo) meshesToRender.push('coastlines');
            if (mesh.lakesLo) meshesToRender.push('lakes');
            if (mesh.riversLo) meshesToRender.push('rivers');
            
            // Render the meshes
            const renderSuccess = this.webglMeshRenderer.render(globe, meshesToRender, [view.width, view.height]);
            
            if (renderSuccess) {
                debugLog('MESH', 'WebGL render successful');
                return true;
            } else {
                debugLog('MESH', 'WebGL render failed');
                return false;
            }
            
        } catch (error) {
            debugLog('MESH', 'WebGL render error:', error);
            return false;
        }
    }
    
    /**
     * Render using 2D system
     */
    private render2D(): boolean {
        if (!this.ctx2D) {
            debugLog('MESH', '2D render failed - no context');
            return false;
        }
        
        try {
            const globe = this.stateProvider?.getGlobe();
            const mesh = this.stateProvider?.getMesh();
            const view = this.stateProvider?.getView();
            
            if (!globe || !mesh || !view) {
                debugLog('MESH', '2D render failed - missing state');
                return false;
            }
            
            // Ensure canvas is properly sized
            if (this.canvas2D.width !== view.width || this.canvas2D.height !== view.height) {
                this.canvas2D.width = view.width;
                this.canvas2D.height = view.height;
            }
            
            // Clear the canvas
            this.ctx2D.clearRect(0, 0, this.canvas2D.width, this.canvas2D.height);
            
            // Create a path renderer that draws to 2D canvas
            const path = d3.geoPath(globe.projection).context(this.ctx2D);
            
            // Render coastlines
            if (mesh.coastLo) {
                this.ctx2D.beginPath();
                this.ctx2D.strokeStyle = this.rgbToString(this.meshStyles.coastlines.color);
                this.ctx2D.lineWidth = this.meshStyles.coastlines.lineWidth / 8; // Scale down for 2D
                this.ctx2D.globalAlpha = this.meshStyles.coastlines.opacity;
                path(mesh.coastLo);
                this.ctx2D.stroke();
            }
            
            // Render lakes
            if (mesh.lakesLo) {
                this.ctx2D.beginPath();
                this.ctx2D.strokeStyle = this.rgbToString(this.meshStyles.lakes.color);
                this.ctx2D.lineWidth = this.meshStyles.lakes.lineWidth / 8; // Scale down for 2D
                this.ctx2D.globalAlpha = this.meshStyles.lakes.opacity;
                path(mesh.lakesLo);
                this.ctx2D.stroke();
            }
            
            // Render rivers
            if (mesh.riversLo) {
                this.ctx2D.beginPath();
                this.ctx2D.strokeStyle = this.rgbToString(this.meshStyles.rivers.color);
                this.ctx2D.lineWidth = this.meshStyles.rivers.lineWidth / 8; // Scale down for 2D
                this.ctx2D.globalAlpha = this.meshStyles.rivers.opacity;
                path(mesh.riversLo);
                this.ctx2D.stroke();
            }
            
            // Reset alpha
            this.ctx2D.globalAlpha = 1.0;
            
            debugLog('MESH', '2D render successful');
            return true;
            
        } catch (error) {
            debugLog('MESH', '2D render error:', error);
            return false;
        }
    }
    
    /**
     * Load mesh data into WebGL renderer
     */
    private loadWebGLMeshData(mesh: any): void {
        if (!this.webglMeshRenderer) return;
        
        debugLog('MESH', 'Loading mesh data into WebGL renderer');
        
        let loadedCount = 0;
        
        // Helper to check if geometry data exists
        const hasGeometryData = (data: any) => {
            if (!data) return false;
            if (data.features && data.features.length > 0) return true; // FeatureCollection
            if (data.geometries && data.geometries.length > 0) return true; // GeometryCollection
            if (data.type && data.coordinates) return true; // Single geometry
            return false;
        };
        
        // Load coastlines
        if (hasGeometryData(mesh.coastLo)) {
            const success = this.webglMeshRenderer.loadMeshData(mesh.coastLo, 'coastlines', this.meshStyles.coastlines);
            if (success) loadedCount++;
        }
        
        // Load lakes
        if (hasGeometryData(mesh.lakesLo)) {
            const success = this.webglMeshRenderer.loadMeshData(mesh.lakesLo, 'lakes', this.meshStyles.lakes);
            if (success) loadedCount++;
        }
        
        // Load rivers
        if (hasGeometryData(mesh.riversLo)) {
            const success = this.webglMeshRenderer.loadMeshData(mesh.riversLo, 'rivers', this.meshStyles.rivers);
            if (success) loadedCount++;
        }
        
        debugLog('MESH', `Loaded ${loadedCount} mesh types into WebGL`);
    }
    
    /**
     * Convert RGB array to CSS color string
     */
    private rgbToString(rgb: [number, number, number]): string {
        return `rgb(${Math.round(rgb[0] * 255)}, ${Math.round(rgb[1] * 255)}, ${Math.round(rgb[2] * 255)})`;
    }
    
    // ===== UTILITY METHODS =====
    
    /**
     * Reset system state
     */
    private reset(): void {
        debugLog('MESH', 'Resetting system state');
        
        // Dispose WebGL resources
        if (this.webglMeshRenderer) {
            this.webglMeshRenderer.dispose();
            this.webglMeshRenderer = null;
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
    }
    
    // ===== PUBLIC API (same as original) =====
    
    /**
     * Subscribe to external state provider
     */
    observeState(stateProvider: any): void {
        this.stateProvider = stateProvider;
        
        // Subscribe to state changes that require re-rendering
        stateProvider.on('rotate', () => this.handleStateChange());
        stateProvider.on('zoomEnd', () => this.handleStateChange());
        
        // Subscribe to data changes that require re-initialization
        stateProvider.on('meshDataChanged', () => this.handleDataChange());
        stateProvider.on('configChanged', () => this.handleDataChange());
        stateProvider.on('systemsReady', () => this.handleDataChange());
        
        debugLog('MESH', 'Now observing external state changes');
    }
    
    /**
     * Handle state changes that require re-rendering (not re-initialization)
     */
    private handleStateChange(): void {
        debugLog('MESH', 'Handling state change - regenerating frame');
        this.regenerateMesh();
    }
    
    /**
     * Handle data changes that require re-initialization
     */
    private handleDataChange(): void {
        debugLog('MESH', 'Handling data change - reinitializing system');
        this.initialize();
        this.regenerateMesh();
    }
    
    /**
     * Generate mesh and emit result
     */
    private regenerateMesh(): void {
        const canvas = this.generateFrame();
        
        const result: MeshResult = {
            canvas: canvas,
            meshType: 'standard'
        };
        
        this.emit('meshChanged', result);
    }
    
    /**
     * Subscribe to mesh change events
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
    
    // ===== ADDITIONAL MESH-SPECIFIC METHODS =====
    
    /**
     * Get mesh styles for external use
     */
    getMeshStyles(): { [key: string]: MeshStyle } {
        return { ...this.meshStyles };
    }
    
    /**
     * Update mesh styles
     */
    updateMeshStyles(styles: { [key: string]: Partial<MeshStyle> }): void {
        for (const [meshType, style] of Object.entries(styles)) {
            if (this.meshStyles[meshType as keyof typeof this.meshStyles]) {
                this.meshStyles[meshType as keyof typeof this.meshStyles] = {
                    ...this.meshStyles[meshType as keyof typeof this.meshStyles],
                    ...style
                };
            }
        }
        
        // Re-initialize to apply new styles
        this.initialize();
        this.regenerateMesh();
    }
    
    /**
     * Check if the system is ready
     */
    isReady(): boolean {
        return this.useWebGL ? !!this.webglMeshRenderer : true;
    }
    
    /**
     * Clean up resources
     */
    dispose(): void {
        if (this.webglMeshRenderer) {
            this.webglMeshRenderer.dispose();
            this.webglMeshRenderer = null;
        }
        
        this.eventHandlers = {};
        this.stateProvider = null;
    }
}