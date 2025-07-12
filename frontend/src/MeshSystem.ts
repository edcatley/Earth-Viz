/**
 * MeshSystem - Pure observer that automatically manages mesh rendering
 * 
 * This system subscribes to external state changes and automatically
 * handles mesh rendering (coastlines, lakes, rivers) using either WebGL
 * or SVG fallback, without needing explicit method calls.
 * 
 * Emits 'meshChanged' events when mesh data is regenerated.
 */

import * as d3 from 'd3';
import { Globe, ViewportSize } from './Globes';
import { WebGLMeshRenderer } from './services/WebGLMeshRenderer';

// Debug logging
function debugLog(category: string, message: string, data?: any): void {
    console.log(`[${category}] ${message}`, data || '');
}

export interface MeshStyle {
    color: [number, number, number];
    lineWidth: number;
    opacity: number;
}

export interface MeshResult {
    useWebGL: boolean;
    webglCanvas?: HTMLCanvasElement | null;  // WebGL canvas for GPU rendering
    canvas2D?: HTMLCanvasElement | null;     // 2D canvas for CPU fallback
    svgElements?: {  // SVG elements for CPU fallback
        coastlines?: any;
        lakes?: any;
        rivers?: any;
    };
}

export class MeshSystem {
    private webglCanvas: HTMLCanvasElement | null = null;
    private webglMeshRenderer: WebGLMeshRenderer | null = null;
    private canvas2D: HTMLCanvasElement | null = null;
    private context2D: CanvasRenderingContext2D | null = null;
    private useWebGL: boolean = true; // Feature flag - can be disabled for fallback
    
    // External state references (we observe these)
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
        // Try to initialize WebGL system
        this.initializeWebGL();
        // Note: initialize2D() is now called inside initializeWebGL() when needed
    }
    
    /**
     * Initialize 2D canvas for SVG fallback
     */
    private initialize2D(): void {
        debugLog('MESH-2D', 'Initializing 2D canvas for mesh rendering');
        
        this.canvas2D = document.createElement("canvas");
        this.context2D = this.canvas2D.getContext("2d");
        
        if (!this.context2D) {
            debugLog('MESH-2D', 'Failed to get 2D context');
            this.canvas2D = null;
        } else {
            debugLog('MESH-2D', '2D canvas initialized successfully');
        }
    }

    private reinitializeSystem(): void {
        // Try to initialize WebGL system
        this.initializeWebGL();
        if(!this.useWebGL){
        // Always initialize 2D canvas as fallback
        this.initialize2D();
        }
    }

    private reinitializeWebGL(): void {
                    // Dispose the old WebGL system completely
        if(this.webglMeshRenderer) {
        this.webglMeshRenderer.dispose();
        this.webglMeshRenderer = null;
        this.useWebGL = false;
        }
        this.initializeWebGL();
        this.loadMeshData();
    }
    /**
     * Initialize WebGL mesh rendering system
     */
    private initializeWebGL(): void {
        debugLog('MESH-WEBGL', 'Attempting to initialize WebGL mesh system');
        
        // Check if we should use WebGL based on projection type
        const globe = this.stateProvider?.getGlobe();
        if (globe && globe.projectionType !== 'orthographic') {
            debugLog('MESH-WEBGL', `Skipping WebGL for ${globe.projectionType} projection - using SVG fallback`);
            this.useWebGL = false;
            this.webglMeshRenderer = null;
            this.webglCanvas = null;
            // Initialize 2D canvas when WebGL is not available
            this.initialize2D();
            return;
        }

        try {
            // Create WebGL canvas
            this.webglMeshRenderer = new WebGLMeshRenderer();

            if (!this.webglCanvas) {
                this.webglCanvas = document.createElement("canvas");
            }

            const webglInitialized = this.webglMeshRenderer.initialize(this.webglCanvas, globe);
            
            if (webglInitialized) {
                this.useWebGL = true;
                debugLog('MESH-WEBGL', 'WebGL mesh renderer initialized successfully for orthographic projection');
            } else {
                debugLog('MESH-WEBGL', 'WebGL mesh renderer initialization failed - falling back to SVG');
                this.useWebGL = false;
                this.webglMeshRenderer = null;
                this.webglCanvas = null;
                // Initialize 2D canvas when WebGL fails
                this.initialize2D();
            }
        } catch (error) {
            debugLog('MESH-WEBGL', 'WebGL mesh setup error:', error);
            this.useWebGL = false;
            this.webglMeshRenderer = null;
            this.webglCanvas = null;
            // Initialize 2D canvas when WebGL fails
            this.initialize2D();
        }
        
        if (!this.useWebGL) {
            debugLog('MESH-WEBGL', 'Using SVG fallback for mesh rendering');
        }
    }
    
    /**
     * Subscribe to external state provider - becomes a pure observer
     */
    observeState(stateProvider: any): void {
        this.stateProvider = stateProvider;
        
        // Subscribe to state changes that require mesh re-loading
        stateProvider.on('meshDataChanged', () => this.loadMeshData());
        stateProvider.on('systemsReady', () => this.loadMeshData());
        
        // Subscribe to state changes that require re-rendering
        stateProvider.on('rotate', () => this.renderMeshes(true));
        stateProvider.on('projectionChanged', () => this.renderMeshes(false));
        stateProvider.on('configChanged', () => this.reinitializeSystem());

        stateProvider.on('zoomEnd', () => this.renderMeshes(false));
        
        debugLog('MESH', 'Now observing external state changes');
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
    
    /**
     * Load mesh data into the appropriate renderer
     */
    private loadMeshData(): void {
        if (!this.stateProvider) {
            return;
        }
        
        const mesh = this.stateProvider.getMesh();
        if (!mesh) {
            debugLog('MESH', 'No mesh data available');
            return;
        }
        
        if (this.useWebGL && this.webglMeshRenderer) {
            this.loadWebGLMeshData(mesh);
        }
        
        // Emit that mesh data has been loaded
        this.emit('meshDataLoaded', this.getMeshResult());
        this.renderMeshes(false);
    }
    
    /**
     * Load mesh data into WebGL renderer
     */
    private loadWebGLMeshData(mesh: any): void {
        if (!this.webglMeshRenderer) return;
        
        debugLog('MESH-WEBGL', 'Loading mesh data into WebGL renderer');
        
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
        
        debugLog('MESH-WEBGL', `Loaded ${loadedCount} mesh types into WebGL`);
    }
    

    
    /**
     * Get current mesh result
     */
    getMeshResult(): MeshResult {
        if (this.useWebGL && this.webglCanvas) {
            return {
                useWebGL: true,
                webglCanvas: this.webglCanvas,
                canvas2D: null
            };
        } else {
            return {
                useWebGL: false,
                webglCanvas: null,
                canvas2D: this.canvas2D
            };
        }
    }
    
    /**
     * Render meshes (gets state internally)
     */
    renderMeshes(isRotating: boolean = false): boolean {
        console.log('[MeshSystem] renderMeshes called');
        if (!this.stateProvider) return false;
        
        const globe = this.stateProvider.getGlobe();
        const mesh = this.stateProvider.getMesh();
        const view = this.stateProvider.getView();
        
        if (!globe || !mesh || !view) return false;
        
        let success = false;
        if (this.useWebGL && this.webglMeshRenderer) {
            //log the number of elements in the mesh
            debugLog('MESH-WEBGL', 'Mesh', {
                mesh: mesh,
                meshKeys: Object.keys(mesh),
                meshFeatures: mesh?.features?.length || 0
            });
            success = this.renderWebGLMeshes(globe, mesh, [view.width, view.height]);
        }
        else {
            if (isRotating) {
                // During rotation, create a copy of mesh with only coastlines for performance
                const meshForRotation = {
                    ...mesh,
                    lakesLo: null,
                    riversLo: null
                };
                success = this.renderSVGMeshes(globe, meshForRotation);
            }
            else {
                // When not rotating, render all available mesh data
                success = this.renderSVGMeshes(globe, mesh);
            }
        }   
        if (success) {
            // Emit meshChanged event so other systems know the mesh canvas has been updated
            const result = this.getMeshResult();
            this.emit('meshChanged', result);
        }
        
        return success;
    }



    /**
     * Render meshes using WebGL
     */
    private renderWebGLMeshes(globe: Globe, mesh: any, viewport: [number, number]): boolean {
        if (!this.webglMeshRenderer) return false;
        
        // Clear the WebGL canvas
        this.webglMeshRenderer.clear();
        
        // Determine which meshes to render based on available data
        const meshesToRender: string[] = [];
        if (mesh.coastLo) meshesToRender.push('coastlines');
        if (mesh.lakesLo) meshesToRender.push('lakes');
        if (mesh.riversLo) meshesToRender.push('rivers');
        
        // Render the meshes
        const success = this.webglMeshRenderer.render(globe, meshesToRender, viewport);
        
        if (!success) {
            console.warn('WebGL mesh rendering failed - falling back to SVG');
            this.useWebGL = false;
            return false;
        }
        
        return true;
    }

    /**
     * Render meshes using 2D canvas (fallback when WebGL unavailable)
     */
    private renderSVGMeshes(globe: Globe, mesh: any): boolean {
        if (!this.context2D || !this.canvas2D) {
            debugLog('MESH-2D', 'No 2D context available');
            return false;
        }
        
        // Ensure canvas has correct size
        const view = this.stateProvider?.getView();
        if (view && (this.canvas2D.width !== view.width || this.canvas2D.height !== view.height)) {
            this.canvas2D.width = view.width;
            this.canvas2D.height = view.height;
            debugLog('MESH-2D', `Canvas resized to ${view.width}x${view.height}`);
        }
        
        debugLog('MESH-2D', 'render2DMeshes called', {
            hasCoastLo: !!mesh.coastLo,
            hasLakesLo: !!mesh.lakesLo,
            hasRiversLo: !!mesh.riversLo,
            canvasSize: `${this.canvas2D.width}x${this.canvas2D.height}`
        });
        
        // Clear the canvas
        this.context2D.clearRect(0, 0, this.canvas2D.width, this.canvas2D.height);
        
        // Create a path renderer that draws to 2D canvas
        const path = d3.geoPath(globe.projection).context(this.context2D);
        let elementsDrawn = 0;
        // Render coastlines
            //log the number of elements in the mesh
            debugLog('MESH-WEBGL', 'Mesh', {
                mesh: mesh,
                meshKeys: Object.keys(mesh),
                meshFeatures: mesh?.features?.length || 0
            });
        if (mesh.coastLo) {
            this.context2D.beginPath();
            this.context2D.strokeStyle = this.rgbToString(this.meshStyles.coastlines.color);
            this.context2D.lineWidth = this.meshStyles.coastlines.lineWidth / 8; // Scale down for 2D
            this.context2D.globalAlpha = this.meshStyles.coastlines.opacity;
            path(mesh.coastLo);
            this.context2D.stroke();
            elementsDrawn++;
            debugLog('MESH-2D', 'Coastlines rendered to 2D canvas');
        }
        
        // Render lakes
        if (mesh.lakesLo) {
            this.context2D.beginPath();
            this.context2D.strokeStyle = this.rgbToString(this.meshStyles.lakes.color);
            this.context2D.lineWidth = this.meshStyles.lakes.lineWidth / 8; // Scale down for 2D
            this.context2D.globalAlpha = this.meshStyles.lakes.opacity;
            path(mesh.lakesLo);
            this.context2D.stroke();
            debugLog('MESH-2D', 'Lakes rendered to 2D canvas');
            elementsDrawn++;
        }
        
        // Render rivers
        if (mesh.riversLo) {
            this.context2D.beginPath();
            this.context2D.strokeStyle = this.rgbToString(this.meshStyles.rivers.color);
            this.context2D.lineWidth = this.meshStyles.rivers.lineWidth / 8; // Scale down for 2D
            this.context2D.globalAlpha = this.meshStyles.rivers.opacity;
            path(mesh.riversLo);
            this.context2D.stroke();
            debugLog('MESH-2D', 'Rivers rendered to 2D canvas');
            elementsDrawn++;
        }
        //log the number of elements drawn
        debugLog('MESH-2D', `Elements drawn: ${elementsDrawn}`);    
        // Reset alpha
        this.context2D.globalAlpha = 1.0;
        
        return true;
    }
    
    /**
     * Convert RGB array to CSS color string
     */
    private rgbToString(rgb: [number, number, number]): string {
        return `rgb(${Math.round(rgb[0] * 255)}, ${Math.round(rgb[1] * 255)}, ${Math.round(rgb[2] * 255)})`;
    }
    
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
        
        // Reload mesh data with new styles
        this.loadMeshData();
        this.emit('meshStylesChanged', this.meshStyles);
    }
    
    /**
     * Check if the system is ready
     */
    isReady(): boolean {
        return this.useWebGL ? !!this.webglMeshRenderer : true;
    }
    
    /**
     * Get the canvas for external use (WebGL or 2D)
     */
    getWebGLCanvas(): HTMLCanvasElement | null {
        return this.useWebGL ? this.webglCanvas : null;
    }

    getMeshData(): HTMLCanvasElement | null {
        return this.useWebGL ?  null : this.canvas2D;
    }

    /**
     * Clean up resources
     */
    dispose(): void {
        if (this.webglMeshRenderer) {
            this.webglMeshRenderer.dispose();
            this.webglMeshRenderer = null;
        }
        
        this.webglCanvas = null;
        this.canvas2D = null;
        this.context2D = null;
        this.eventHandlers = {};
        this.stateProvider = null;
    }
} 