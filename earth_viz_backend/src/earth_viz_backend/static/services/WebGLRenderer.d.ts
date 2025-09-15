/**
 * WebGL Renderer - Unified rendering system for planets and overlays
 *
 * Clean architecture with setup/render separation:
 * 1. setup() - heavy operations done once (texture upload, shader compilation)
 * 2. render() - lightweight operations done every frame
 */
export interface RenderItem {
    type: 'planet' | 'overlay';
    shader: WebGLProgram;
    textures: Map<string, WebGLTexture>;
    scaleBounds?: [number, number];
    useInterpolatedLookup?: boolean;
    textureSize?: [number, number];
}
export interface WebGLContext {
    gl: WebGL2RenderingContext | WebGLRenderingContext;
    isWebGL2: boolean;
    maxTextureSize: number;
}
export interface ShaderUniforms {
    [key: string]: WebGLUniformLocation;
}
export interface ShaderAttributes {
    [key: string]: number;
}
export declare class WebGLRenderer {
    private gl;
    private context;
    private canvas;
    private isInitialized;
    private items;
    private vertexBuffer;
    constructor();
    initialize(canvas: HTMLCanvasElement): boolean;
    /**
     * Setup a render item (heavy operation - done once)
     */
    setup(type: 'planet' | 'overlay', data: any, id: string, globe?: any, useInterpolatedLookup?: boolean): boolean;
    /**
     * Render a setup item (lightweight operation - done every frame)
     */
    render(id: string, globe: any, view: any): boolean;
    private compileShader;
    private createProgram;
    private createShader;
    private createImageTexture;
    private createWeatherTexture;
    private packFloatToRGBA;
    private createGradientTexture;
    private getProjectionType;
    private qe;
    private setProjectionUniforms;
    private setGridUniforms;
    private setOverlayUniforms;
    private setUniform;
    dispose(): void;
    getCanvas(): HTMLCanvasElement | null;
}
//# sourceMappingURL=WebGLRenderer.d.ts.map