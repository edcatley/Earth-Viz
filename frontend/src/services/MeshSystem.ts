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
        } else {
            debugLog('MESH', 'WebGL renderer initialized successfully');
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
     */
    public renderDirect(gl: WebGLRenderingContext, globe: any, view: any): void {
        if (!this.webglMeshRenderer) return;
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

        this.clearSetup();

        if (!globe || !mesh || !view) {
            debugLog('MESH', 'Setup skipped - missing required data');
            return;
        }

        // Try WebGL first (if available)
        if (this.webglMeshRenderer && this.setupWebGL(globe, mesh)) {
            debugLog('MESH', 'WebGL setup successful');
            return;
        }

        // Fallback to 2D
        debugLog('MESH', this.webglMeshRenderer ? 'WebGL setup failed, using 2D' : 'WebGL not available, using 2D');
        this.setup2D(mesh, view);
    }

    /**
     * Attempt WebGL setup - returns true if successful
     */
    private setupWebGL(globe: any, mesh: any): boolean {
        if (!this.webglMeshRenderer) return false;

        try {
            const setupSuccess = this.webglMeshRenderer.setup(mesh, globe);

            if (!setupSuccess) {
                debugLog('MESH', 'WebGL mesh setup failed (likely unsupported projection)');
                return false;
            }

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
        this.renderer2D.clear();
    }

    // ===== PUBLIC API =====

    /**
     * Handle rotation changes - updates 2D canvas
     */
    public handleRotation(globe: any): void {
        this.renderer2D.render(globe);
    }

    /**
     * Handle data changes - re-setup and update 2D canvas
     */
    public handleDataChange(globe: any, mesh: any, view: any): void {
        debugLog('MESH', 'Handling data change - re-setting up system');
        this.setup(globe, mesh, view);
        this.renderer2D.render(globe);
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