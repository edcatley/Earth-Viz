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
import { MeshRenderer2D } from '../renderers/2dMeshRenderer';

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
    private canvas2D: HTMLCanvasElement;
    private ctx2D: CanvasRenderingContext2D | null = null;
    private useWebGL: boolean = false;

    // Renderer delegates
    private webglMeshRenderer: WebGLMeshRenderer | null = null;
    private renderer2D: MeshRenderer2D | null = null;

    // Event callbacks
    private eventHandlers: { [key: string]: Function[] } = {};

    constructor() {
        // Create canvas for 2D fallback
        this.canvas2D = document.createElement("canvas");

        const ctx = this.canvas2D.getContext("2d");
        if (!ctx) {
            throw new Error("Failed to create 2D canvas context for MeshSystem");
        }
        this.ctx2D = ctx;

        // Create 2D renderer (always available)
        this.renderer2D = new MeshRenderer2D();
        debugLog('MESH', '2D renderer created');

        // webglMeshRenderer will be created in initializeGL()
        debugLog('MESH', 'MeshSystem created');
    }

    /**
     * Initialize WebGL renderer with shared GL context
     */
    public initializeGL(gl: WebGLRenderingContext): void {
        if (this.webglMeshRenderer) {
            debugLog('MESH', 'WebGL renderer already initialized');
            return;
        }

        debugLog('MESH', 'Initializing WebGL renderer with shared context');
        this.webglMeshRenderer = new WebGLMeshRenderer();
        const success = this.webglMeshRenderer.initialize(gl);

        if (!success) {
            debugLog('MESH', 'WebGL initialization failed');
            this.webglMeshRenderer.dispose();
            this.webglMeshRenderer = null;
            this.useWebGL = false;
        } else {
            debugLog('MESH', 'WebGL renderer initialized successfully');
            // useWebGL will be set to true in setup() when data is ready
        }
    }

    /**
     * Check if this system can render directly to a shared GL context
     */
    public canRenderDirect(): boolean {
        return this.useWebGL && this.webglMeshRenderer !== null;
    }

    /**
     * Render directly to provided GL context (fast path)
     */
    public renderDirect(gl: WebGLRenderingContext, globe: any, view: any): void {
        if (!this.canRenderDirect()) {
            throw new Error('MeshSystem not ready for direct rendering');
        }

        this.webglMeshRenderer!.render(gl, globe, [view.width, view.height]);
    }

    /**
     * Render directly to provided 2D context (2D path)
     */
    public render2DDirect(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, globe: any): boolean {
        if (!this.renderer2D) {
            debugLog('MESH', '2D render failed - no renderer');
            return false;
        }

        if (!globe) {
            debugLog('MESH', '2D render failed - missing state');
            return false;
        }

        try {
            // Delegate to 2D renderer with provided context
            return this.renderer2D.render(ctx, canvas, globe);
        } catch (error) {
            debugLog('MESH', '2D render error:', error);
            return false;
        }
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

        // Try WebGL first (if available) - let the renderer decide if it can handle the projection
        if (this.webglMeshRenderer) {
            debugLog('MESH', 'Attempting WebGL setup');
            if (this.setupWebGL(globe, mesh)) {
                this.useWebGL = true;
                debugLog('MESH', 'WebGL setup successful');
                return;
            }
            debugLog('MESH', 'WebGL setup failed, falling back to 2D');
        } else {
            debugLog('MESH', 'WebGL not available, using 2D');
        }

        // Fallback to 2D
        this.setup2D(mesh, view);
        this.useWebGL = false;
        debugLog('MESH', '2D setup complete');
    }

    /**
     * Attempt WebGL setup - returns true if successful
     */
    private setupWebGL(globe: any, mesh: any): boolean {
        if (!this.webglMeshRenderer) {
            return false;
        }

        try {
            debugLog('MESH', 'Attempting WebGL setup');
            
            // Setup WebGL renderer with mesh data (includes shader compilation)
            const setupSuccess = this.webglMeshRenderer.setup(mesh, globe);

            if (!setupSuccess) {
                debugLog('MESH', 'WebGL mesh setup failed (likely unsupported projection)');
                return false;
            }

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

    // ===== UTILITY METHODS =====

    /**
     * Clear current setup (but don't dispose renderers)
     */
    private clearSetup(): void {
        debugLog('MESH', 'Clearing current setup');

        // Clear 2D canvas only
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
    public handleRotation(globe: any): void {
        debugLog('MESH', 'Handling rotation change - regenerating frame');
        this.regenerateMesh(globe);
    }

    /**
     * Handle data changes that require re-setup
     * Now called directly from Earth.ts centralized functions
     */
    public handleDataChange(globe: any, mesh: any, view: any): void {
        debugLog('MESH', 'Handling data change - re-setting up system');
        this.setup(globe, mesh, view);
        this.regenerateMesh(globe);
    }

    /**
     * Emit ready signal for mesh
     */
    public regenerateMesh(globe: any): void {
        const result: MeshResult = {
            canvas: null,  // No longer generating canvases
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