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
    private useWebGL: boolean = false;
    private webglMeshRenderer: WebGLMeshRenderer | null = null;
    private renderer2D: MeshRenderer2D;

    constructor() {
        this.renderer2D = new MeshRenderer2D();
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
        return this.webglMeshRenderer !== null;
    }

    /**
     * Render directly to provided GL context (fast path)
     * No-op if no data has been setup yet
     */
    public renderDirect(gl: WebGLRenderingContext, globe: any, view: any): void {
        if (!this.webglMeshRenderer) {
            return; // No WebGL renderer
        }
        
        if (!this.useWebGL) {
            return; // No data setup yet
        }

        this.webglMeshRenderer.render(gl, globe, [view.width, view.height]);
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

        this.renderer2D.initialize(view);
        this.renderer2D.setup(mesh);

        debugLog('MESH', '2D setup complete');
    }

    // ===== UTILITY METHODS =====

    /**
     * Clear current setup (but don't dispose renderers)
     */
    private clearSetup(): void {
        debugLog('MESH', 'Clearing current setup');

        this.renderer2D.clear();
        this.useWebGL = false;
    }

    // ===== PUBLIC API =====

    /**
     * Handle rotation changes - updates 2D canvas
     */
    public handleRotation(globe: any): void {
        if (!this.useWebGL) {
            this.renderer2D.render(globe);
        }
    }

    /**
     * Handle data changes - re-setup and update 2D canvas
     */
    public handleDataChange(globe: any, mesh: any, view: any): void {
        debugLog('MESH', 'Handling data change - re-setting up system');
        this.setup(globe, mesh, view);
        if (!this.useWebGL) {
            this.renderer2D.render(globe);
        }
    }

    /**
     * Dispose of all resources (called on destruction)
     */
    public dispose(): void {
        debugLog('MESH', 'Disposing MeshSystem');

        if (this.webglMeshRenderer) {
            this.webglMeshRenderer.dispose();
            this.webglMeshRenderer = null;
        }

        this.renderer2D.dispose();
    }
}