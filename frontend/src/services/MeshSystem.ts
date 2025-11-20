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

            if (!webglInitialized) {
                debugLog('MESH', 'WebGL mesh renderer initialization failed');
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