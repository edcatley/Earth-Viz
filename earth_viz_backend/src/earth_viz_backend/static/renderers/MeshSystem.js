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
import { WebGLMeshRenderer } from '../services/WebGLMeshRenderer';
// Debug logging
function debugLog(category, message, data) {
    console.log(`[${category}] ${message}`, data || '');
}
export class MeshSystem {
    constructor() {
        // Common rendering system properties
        Object.defineProperty(this, "webglCanvas", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "canvas2D", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "ctx2D", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "useWebGL", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        // WebGL system
        Object.defineProperty(this, "webglMeshRenderer", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        // External state references
        Object.defineProperty(this, "stateProvider", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        // Event callbacks
        Object.defineProperty(this, "eventHandlers", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        // Mesh styling configuration
        Object.defineProperty(this, "meshStyles", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {
                coastlines: { color: [0.98, 0.98, 0.98], lineWidth: 8.0, opacity: 0.65 },
                lakes: { color: [0.86, 0.86, 0.86], lineWidth: 6.0, opacity: 0.65 },
                rivers: { color: [0.86, 0.86, 0.86], lineWidth: 4.0, opacity: 0.65 }
            }
        });
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
    initialize() {
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
        }
        else {
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
    initializeWebGL() {
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
        }
        catch (error) {
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
    initialize2D() {
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
    generateFrame() {
        debugLog('MESH', `Generating frame using ${this.useWebGL ? 'WebGL' : '2D'}`);
        if (this.useWebGL) {
            return this.renderWebGL() ? this.webglCanvas : null;
        }
        else {
            return this.render2D() ? this.canvas2D : null;
        }
    }
    // ===== DECISION LOGIC =====
    /**
     * Determine if WebGL should be used based on projection and data availability
     */
    shouldUseWebGL() {
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
    renderWebGL() {
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
            const meshesToRender = [];
            if (mesh.coastLo)
                meshesToRender.push('coastlines');
            if (mesh.lakesLo)
                meshesToRender.push('lakes');
            if (mesh.riversLo)
                meshesToRender.push('rivers');
            // Render the meshes
            const renderSuccess = this.webglMeshRenderer.render(globe, meshesToRender, [view.width, view.height]);
            if (renderSuccess) {
                debugLog('MESH', 'WebGL render successful');
                return true;
            }
            else {
                debugLog('MESH', 'WebGL render failed');
                return false;
            }
        }
        catch (error) {
            debugLog('MESH', 'WebGL render error:', error);
            return false;
        }
    }
    /**
     * Render using 2D system
     */
    render2D() {
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
        }
        catch (error) {
            debugLog('MESH', '2D render error:', error);
            return false;
        }
    }
    /**
     * Load mesh data into WebGL renderer
     */
    loadWebGLMeshData(mesh) {
        if (!this.webglMeshRenderer)
            return;
        debugLog('MESH', 'Loading mesh data into WebGL renderer');
        let loadedCount = 0;
        // Helper to check if geometry data exists
        const hasGeometryData = (data) => {
            if (!data)
                return false;
            if (data.features && data.features.length > 0)
                return true; // FeatureCollection
            if (data.geometries && data.geometries.length > 0)
                return true; // GeometryCollection
            if (data.type && data.coordinates)
                return true; // Single geometry
            return false;
        };
        // Load coastlines
        if (hasGeometryData(mesh.coastLo)) {
            const success = this.webglMeshRenderer.loadMeshData(mesh.coastLo, 'coastlines', this.meshStyles.coastlines);
            if (success)
                loadedCount++;
        }
        // Load lakes
        if (hasGeometryData(mesh.lakesLo)) {
            const success = this.webglMeshRenderer.loadMeshData(mesh.lakesLo, 'lakes', this.meshStyles.lakes);
            if (success)
                loadedCount++;
        }
        // Load rivers
        if (hasGeometryData(mesh.riversLo)) {
            const success = this.webglMeshRenderer.loadMeshData(mesh.riversLo, 'rivers', this.meshStyles.rivers);
            if (success)
                loadedCount++;
        }
        debugLog('MESH', `Loaded ${loadedCount} mesh types into WebGL`);
    }
    /**
     * Convert RGB array to CSS color string
     */
    rgbToString(rgb) {
        return `rgb(${Math.round(rgb[0] * 255)}, ${Math.round(rgb[1] * 255)}, ${Math.round(rgb[2] * 255)})`;
    }
    // ===== UTILITY METHODS =====
    /**
     * Reset system state
     */
    reset() {
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
     * Set external state provider (no longer subscribing to events)
     */
    setStateProvider(stateProvider) {
        console.log('MESH setStateProvider called');
        this.stateProvider = stateProvider;
        debugLog('MESH', 'State provider set');
    }
    /**
     * Handle rotation changes that require re-rendering (not re-initialization)
     * Now called directly from Earth.ts centralized functions
     */
    handleRotation() {
        debugLog('MESH', 'Handling rotation change - regenerating frame');
        this.regenerateMesh();
    }
    /**
     * Handle data changes that require re-initialization
     * Now called directly from Earth.ts centralized functions
     */
    handleDataChange() {
        debugLog('MESH', 'Handling data change - reinitializing system');
        this.initialize();
        this.regenerateMesh();
    }
    /**
     * Generate mesh and emit result
     */
    regenerateMesh() {
        const canvas = this.generateFrame();
        const result = {
            canvas: canvas,
            meshType: 'standard'
        };
        this.emit('meshChanged', result);
    }
    /**
     * Subscribe to mesh change events
     */
    on(event, handler) {
        if (!this.eventHandlers[event]) {
            this.eventHandlers[event] = [];
        }
        this.eventHandlers[event].push(handler);
    }
    /**
     * Emit events to subscribers
     */
    emit(event, ...args) {
        if (this.eventHandlers[event]) {
            this.eventHandlers[event].forEach(handler => handler(...args));
        }
    }
    // ===== ADDITIONAL MESH-SPECIFIC METHODS =====
    /**
     * Get mesh styles for external use
     */
    getMeshStyles() {
        return { ...this.meshStyles };
    }
    /**
     * Update mesh styles
     */
    updateMeshStyles(styles) {
        for (const [meshType, style] of Object.entries(styles)) {
            if (this.meshStyles[meshType]) {
                this.meshStyles[meshType] = {
                    ...this.meshStyles[meshType],
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
    isReady() {
        return this.useWebGL ? !!this.webglMeshRenderer : true;
    }
    /**
     * Clean up resources
     */
    dispose() {
        if (this.webglMeshRenderer) {
            this.webglMeshRenderer.dispose();
            this.webglMeshRenderer = null;
        }
        this.eventHandlers = {};
        this.stateProvider = null;
    }
}
//# sourceMappingURL=MeshSystem.js.map