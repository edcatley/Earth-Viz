/**
 * MeshSystem - Standardized rendering system pattern
 * 
 * Rendering system using the common pattern:
 * - initialize() - Main entry point, decides WebGL vs 2D
 * - initializeWebGL() - Attempts WebGL setup
 * - initialize2D() - Sets up 2D fallback
 * - generateFrame() - Produces final canvas output
 */

import { WebGLMeshRenderer } from '../renderers/WebGLMeshRenderer';
import { MeshRenderer2D, MeshStyle } from '../renderers/2dMeshRenderer';

// Debug logging
function debugLog(category: string, message: string, data?: any): void {
    console.log(`[${category}] ${message}`, data || '');
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

    // Renderer delegates
    private webglMeshRenderer: WebGLMeshRenderer | null = null;
    private renderer2D: MeshRenderer2D | null = null;

    // Event callbacks
    private eventHandlers: { [key: string]: Function[] } = {};

    constructor() {
        // Create canvases
        this.webglCanvas = document.createElement("canvas");
        this.canvas2D = document.createElement("canvas");

        const ctx = this.canvas2D.getContext("2d");
        if (!ctx) {
            throw new Error("Failed to create 2D canvas context for MeshSystem");
        }
        this.ctx2D = ctx;

        // Initialize renderers once - check what's available
        debugLog('MESH', 'Initializing renderers');

        // Try to initialize WebGL renderer
        this.webglMeshRenderer = new WebGLMeshRenderer();
        // Note: WebGLMeshRenderer.initialize() needs globe, so we can't call it here
        // We'll initialize it during setup instead
        debugLog('MESH', 'WebGL mesh renderer created');

        // Create 2D renderer (always available)
        this.renderer2D = new MeshRenderer2D();
        debugLog('MESH', '2D renderer created');

        debugLog('MESH', 'MeshSystem created');
    }

    // ===== MAIN PATTERN METHODS =====

    /**
     * Setup renderers with current data
     * Tries WebGL first (if projection supported), falls back to 2D
     */
    public setup(globe: any, mesh: any, view: any): void {
        debugLog('MESH', 'Starting setup');

        // Clear any existing setup
        this.clearSetup();

        // Check if we have required data
        if (!globe || !mesh || !view) {
            debugLog('MESH', 'Setup skipped - missing required data');
            return;
        }

        // Try WebGL first (only for orthographic projection)
        if (globe.projectionType === 'orthographic' && this.webglMeshRenderer) {
            debugLog('MESH', 'Attempting WebGL setup');
            if (this.setupWebGL(globe, mesh, view)) {
                this.useWebGL = true;
                debugLog('MESH', 'WebGL setup successful');
                return;
            }
            debugLog('MESH', 'WebGL setup failed, falling back to 2D');
        } else {
            debugLog('MESH', 'Using 2D (projection not orthographic or WebGL unavailable)');
        }

        // Fallback to 2D
        this.setup2D(mesh, view);
        this.useWebGL = false;
        debugLog('MESH', '2D setup complete');
    }

    /**
     * Attempt WebGL setup - returns true if successful
     */
    private setupWebGL(globe: any, mesh: any, view: any): boolean {
        if (!this.webglMeshRenderer) {
            return false;
        }

        try {
            // Size canvas
            this.webglCanvas.width = view.width;
            this.webglCanvas.height = view.height;

            // Initialize WebGL renderer with globe
            const webglInitialized = this.webglMeshRenderer.initialize(this.webglCanvas, globe);

            if (!webglInitialized) {
                debugLog('MESH', 'WebGL mesh renderer initialization failed');
                return false;
            }

            // Load mesh data into WebGL renderer
            this.loadWebGLMeshData(mesh);

            debugLog('MESH', 'WebGL setup successful');
            return true;

        } catch (error) {
            debugLog('MESH', 'WebGL setup error:', error);
            return false;
        }
    }

    /**
     * Setup 2D rendering system
     */
    private setup2D(mesh: any, view: any): void {
        debugLog('MESH', 'Setting up 2D rendering system');

        if (!this.ctx2D || !this.renderer2D) {
            return;
        }

        // Size canvas
        this.canvas2D.width = view.width;
        this.canvas2D.height = view.height;

        // Setup 2D renderer
        this.renderer2D.initialize();
        this.renderer2D.setup(mesh);

        debugLog('MESH', '2D setup complete');
    }

    /**
     * Generate frame using appropriate rendering system
     */
    public generateFrame(globe: any, view: any): HTMLCanvasElement | null {
        debugLog('MESH', `Generating frame using ${this.useWebGL ? 'WebGL' : '2D'}`);

        if (this.useWebGL) {
            return this.renderWebGL(globe, view) ? this.webglCanvas : null;
        } else {
            return this.render2D(globe) ? this.canvas2D : null;
        }
    }

    // ===== RENDERING IMPLEMENTATIONS =====

    /**
     * Render using WebGL system
     */
    private renderWebGL(globe: any, view: any): boolean {
        if (!this.webglMeshRenderer) {
            debugLog('MESH', 'WebGL render failed - no renderer');
            return false;
        }

        if (!globe || !view) {
            debugLog('MESH', 'WebGL render failed - missing state');
            return false;
        }

        try {
            // Clear the canvas
            this.webglMeshRenderer.clear();

            // Render all loaded meshes
            return this.webglMeshRenderer.render(globe, [view.width, view.height]);

        } catch (error) {
            debugLog('MESH', 'WebGL render error:', error);
            return false;
        }
    }

    /**
     * Render using 2D system - delegates to MeshRenderer2D
     */
    private render2D(globe: any): boolean {
        if (!this.ctx2D || !this.renderer2D) {
            debugLog('MESH', '2D render failed - no renderer');
            return false;
        }

        if (!globe) {
            debugLog('MESH', '2D render failed - missing state');
            return false;
        }

        try {
            // Delegate to 2D renderer
            return this.renderer2D.render(this.ctx2D, this.canvas2D, globe);

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

        // Get mesh styles from 2D renderer (single source of truth)
        const styles = this.renderer2D?.getMeshStyles() || {
            coastlines: { color: [0.98, 0.98, 0.98] as [number, number, number], lineWidth: 8.0, opacity: 0.65 },
            lakes: { color: [0.86, 0.86, 0.86] as [number, number, number], lineWidth: 6.0, opacity: 0.65 },
            rivers: { color: [0.86, 0.86, 0.86] as [number, number, number], lineWidth: 4.0, opacity: 0.65 }
        };

        // Load mesh data (mesh is bundled, always available)
        if (mesh.coastLo) this.webglMeshRenderer.loadMeshData(mesh.coastLo, 'coastlines', styles.coastlines);
        if (mesh.lakesLo) this.webglMeshRenderer.loadMeshData(mesh.lakesLo, 'lakes', styles.lakes);
        if (mesh.riversLo) this.webglMeshRenderer.loadMeshData(mesh.riversLo, 'rivers', styles.rivers);

        debugLog('MESH', 'Mesh data loaded into WebGL');
    }

    // ===== UTILITY METHODS =====

    /**
     * Clear current setup (but don't dispose renderers)
     */
    private clearSetup(): void {
        debugLog('MESH', 'Clearing current setup');

        // Clear canvases
        if (this.webglMeshRenderer) {
            this.webglMeshRenderer.clear();
        }

        if (this.renderer2D && this.ctx2D) {
            this.renderer2D.clear(this.ctx2D, this.canvas2D);
        }

        // Reset state
        this.useWebGL = false;
    }

    // ===== PUBLIC API =====

    /**
     * Handle rotation changes that require re-rendering (not re-initialization)
     * Now called directly from Earth.ts centralized functions
     */
    public handleRotation(globe: any, view: any): void {
        debugLog('MESH', 'Handling rotation change - regenerating frame');
        this.regenerateMesh(globe, view);
    }

    /**
     * Handle data changes that require re-setup
     * Now called directly from Earth.ts centralized functions
     */
    public handleDataChange(globe: any, mesh: any, view: any): void {
        debugLog('MESH', 'Handling data change - re-setting up system');
        this.setup(globe, mesh, view);
        this.regenerateMesh(globe, view);
    }

    /**
     * Generate mesh and emit result
     */
    public regenerateMesh(globe: any, view: any): void {
        // Generate frame with explicit parameters
        const canvas = this.generateFrame(globe,  view);

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




    /**
     * Dispose of all resources (called on destruction)
     */
    public dispose(): void {
        debugLog('MESH', 'Disposing MeshSystem');

        // Dispose renderers
        if (this.webglMeshRenderer) {
            this.webglMeshRenderer.dispose();
            this.webglMeshRenderer = null;
        }

        if (this.renderer2D) {
            this.renderer2D.dispose();
            this.renderer2D = null;
        }

        this.eventHandlers = {};
    }
}