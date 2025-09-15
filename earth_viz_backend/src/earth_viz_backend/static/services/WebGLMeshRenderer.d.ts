/**
 * WebGL Mesh Renderer - GPU-accelerated rendering of geographic mesh data
 *
 * Handles coastlines, lakes, rivers with GPU projection and LOD support
 */
import { Globe } from '../core/Globes';
export declare class WebGLMeshRenderer {
    private gl;
    private program;
    private canvas;
    private supportsUint32Indices;
    private locations;
    private meshBuffers;
    private isInitialized;
    private currentProjectionType;
    constructor();
    /**
     * Initialize WebGL context and shaders
     */
    initialize(canvas: HTMLCanvasElement, globe?: Globe): boolean;
    /**
     * Load GeoJSON mesh data into WebGL buffers
     */
    loadMeshData(geojson: any, name: string, style: {
        color: [number, number, number];
        lineWidth: number;
        opacity: number;
    }): boolean;
    /**
     * Render all loaded meshes
     */
    render(globe: Globe, meshesToRender: string[], viewport: [number, number]): boolean;
    /**
     * Convert GeoJSON to WebGL geometry - SIMPLIFIED VERSION
     */
    private geojsonToGeometry;
    /**
     * Convert line string coordinates to quad geometry, then triangulate
     * Each line segment becomes a quad (4 vertices) then 2 triangles (6 indices)
     */
    private lineToQuadToTriangle;
    /**
     * Create WebGL buffers for geometry
     */
    private createMeshBuffer;
    /**
     * Render a single mesh buffer
     */
    private renderMeshBuffer;
    /**
     * Set uniforms for rendering
     */
    /**
     * Get the current projection type that was set during initialization
     */
    getCurrentProjectionType(): 'orthographic' | 'equirectangular' | null;
    /**
     * Determine projection type from globe (same logic as other WebGL systems)
     */
    private getProjectionType;
    private setUniforms;
    /**
     * Set mesh-specific uniforms
     */
    private setMeshUniforms;
    /**
     * Create shader program for a specific projection type
     */
    private createShaderProgram;
    /**
     * Create and compile a shader
     */
    private createShader;
    /**
     * Get shader attribute and uniform locations
     */
    private getShaderLocations;
    /**
     * Set up initial WebGL state
     */
    private setupWebGLState;
    /**
     * Clear the canvas
     */
    clear(): void;
    /**
     * Get the canvas element for external rendering
     */
    getCanvas(): HTMLCanvasElement | null;
    /**
     * Check if renderer is ready
     */
    isReady(): boolean;
    /**
     * Clean up resources
     */
    dispose(): void;
}
//# sourceMappingURL=WebGLMeshRenderer.d.ts.map