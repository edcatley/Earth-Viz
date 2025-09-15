/**
 * WebGL System - GPU-accelerated rendering for coordinate transforms and texture sampling
 *
 * This mirrors the approach in main.js where WebGL is used for:
 * 1. Coordinate transformations (replacing slow CPU projection.invert() calls)
 * 2. Texture sampling (planet images, weather data)
 * 3. Color mapping (scales and overlays)
 *
 * Based on the actual shader code from earth.nullschool.net
 */
export interface WebGLLayer {
    shaderSource: [string, string];
    textures: Record<string, TextureConfig>;
    uniforms: Record<string, any>;
}
export interface TextureConfig {
    internalFormat: number;
    format: number;
    type: number;
    width: number;
    height: number;
    data?: ArrayBufferView | null;
    minFilter?: number;
    magFilter?: number;
    wrapS?: number;
    wrapT?: number;
}
export interface WebGLContext {
    gl: WebGL2RenderingContext | WebGLRenderingContext;
    isWebGL2: boolean;
    maxTextureSize: number;
    extensions: Record<string, any>;
}
export interface ShaderProgram {
    program: WebGLProgram;
    uniforms: Record<string, WebGLUniformLocation>;
    attributes: Record<string, number>;
}
/**
 * Core WebGL shader constants from main.js
 */
export declare const SHADER_CONSTANTS = "\n    const float PI = 3.14159265;\n    const float Ae = PI / 180.0;\n    const float rr = 180.0 / PI;\n    const float vr = 2.0 * PI;\n    const float bt = PI;\n    const float NIL = -999999.0;\n";
/**
 * Projection Shaders - Direct ports from main.js
 */
export declare const ORTHOGRAPHIC_PROJECTION_SHADER = "\nuniform vec2 u_translate;   // screen coords translation (x0, y0)\nuniform float u_R2;         // scale R, squared\nuniform float u_lon0;       // origin longitude\nuniform float u_sinlat0;    // sin(lat0)\nuniform float u_Rcoslat0;   // R * cos(lat0)\nuniform float u_coslat0dR;  // cos(lat0) / R\nuniform float u_flip;       // 1.0 if lat0 in range [-90deg, +90deg], otherwise -1.0\n\n// Handbook of Mathematical Functions, M. Abramowitz and I.A. Stegun, Ed. For input on range [-1, +1]\nfloat arcsin(in float v) {\n    float x = abs(v);\n    float ret = -0.0187293;\n    ret *= x;\n    ret += 0.0742610;\n    ret *= x;\n    ret -= 0.2121144;\n    ret *= x;\n    ret += 1.5707288;\n    ret = PI / 2.0 - sqrt(1.0 - x) * ret;\n    return sign(v) * ret;\n}\n\n/** @returns [lon, lat] in radians for the specified point [x, y], or [NIL, NIL] if the point is unprojectable. */\nvec2 invert(in vec2 point) {\n    vec2 p = (point - u_translate) * u_flip;\n    float d = 1.0 - dot(p, p) / u_R2;\n    if (d >= 0.0) {\n        float cosc = sqrt(d);\n        float lon = u_lon0 + atan(p.x, cosc * u_Rcoslat0 - p.y * u_sinlat0);\n        float lat = arcsin(cosc * u_sinlat0 + p.y * u_coslat0dR);\n        return vec2(lon, lat);\n    }\n    return vec2(NIL);  // outside of projection\n}\n";
export declare const EQUIRECTANGULAR_PROJECTION_SHADER = "\nuniform vec2 u_translate;\nuniform float u_R;\nuniform float u_lon0;\nuniform float u_sinlat0;\nuniform float u_coslat0;\nuniform float u_singam0;\nuniform float u_cosgam0;\n\nconst vec2 BOUNDS = vec2(PI, PI / 2.0);\n\n/** @returns (lon, lat) in radians for the specified point (x, y), or (NIL, NIL) if the point is unprojectable. */\nvec2 invert(in vec2 point) {\n    // translate and scale\n    vec2 p = (point - u_translate) / u_R;\n    if (all(lessThanEqual(abs(p), BOUNDS))) {\n        // project\n        float lambda = p.x;\n        float phi = p.y;\n        // rotate (formulas pulled from d3-geo)\n        float cosphi = cos(phi);\n        float q = cos(lambda) * cosphi;\n        float r = sin(lambda) * cosphi;\n        float s = sin(phi);\n        float t = s * u_cosgam0 - r * u_singam0;\n        float u = r * u_cosgam0 + s * u_singam0;\n        float v = q * u_coslat0 + t * u_sinlat0;\n        float w = t * u_coslat0 - q * u_sinlat0;\n        float lon = atan(u, v) - u_lon0;\n        float lat = asin(clamp(w, -1.0, 1.0));  // keep holes from forming at poles\n        return vec2(lon, lat);\n    }\n    return vec2(NIL);  // outside of projection\n}\n";
/**
 * Grid transformation shader (main.js: yg)
 */
export declare const GRID_SHADER = "\nuniform vec2 u_Low;\nuniform vec2 u_Size;\n\nvec2 grid(in vec2 coord) {\n    vec2 tex = (coord - u_Low) / u_Size;\n    float s = tex.s;\n    float t = tex.t;\n\n    if (t < 0.0 || 1.0 < t) discard;  // lat out of bounds, so nothing to draw\n\n    // Fix texture coordinate flipping - WebGL textures are upside down compared to images\n    t = 1.0 - t;  // Flip Y coordinate\n\n    return vec2(fract(s), t);  // fract used here only because lon is circular.\n}\n";
/**
 * Texture sampling shaders (main.js: xg, bg)
 */
export declare const SIMPLE_LOOKUP_SHADER = "\nuniform sampler2D u_Data;\n\nfloat scalarize(in vec4 h) {\n    // Unpack float from RGBA (reverse of packFloatToRGBA)\n    if (h.r == 1.0 && h.g == 0.0 && h.b == 0.0 && h.a == 0.0) {\n        return NIL;  // Special NIL encoding\n    } else {\n        float absValue = (h.r * 255.0 * 65536.0 + h.g * 255.0 * 256.0 + h.b * 255.0) / 65535.0;\n        return h.a == 1.0 ? absValue : -absValue;\n    }\n}\n\nfloat lookup(in vec2 st) {\n    vec4 h = texture2D(u_Data, st);\n    return scalarize(h);\n}\n";
export declare const INTERPOLATED_LOOKUP_SHADER = "\nuniform sampler2D u_Data;\nuniform vec2 u_TextureSize;\n\nfloat scalarize(in vec4 h) {\n    return h.x;\n}\n\nvec4 getSample(in vec2 st) {\n    // Use of fract below assumes cylindrical x axis (usually lon) and non-cylindrical y axis (usually lat).\n    return texture2D(u_Data, vec2(fract(st.s), st.t));\n}\n\nfloat lookup(in vec2 st) {\n    // adapted from http://www.iquilezles.org/www/articles/hwinterpolation/hwinterpolation.htm\n    vec2 uv = st * u_TextureSize - 0.5;\n    vec2 iuv = floor(uv);\n    vec2 fuv = fract(uv);\n    vec2 ruv = 1.0 - fuv;\n\n    vec4 a = getSample((iuv + vec2(0.5, 0.5)) / u_TextureSize);  // LL\n    vec4 b = getSample((iuv + vec2(1.5, 0.5)) / u_TextureSize);  // LR\n    vec4 c = getSample((iuv + vec2(0.5, 1.5)) / u_TextureSize);  // UL\n    vec4 d = getSample((iuv + vec2(1.5, 1.5)) / u_TextureSize);  // UR\n    vec4 h;\n\n    int tag = int(dot(step(NIL, vec4(a.x, b.x, c.x, d.x)), vec4(1.0, 2.0, 4.0, 8.0)));\n    if (tag == 0) {\n        // a b c d\n        h = mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);\n    } else if (tag == 1 && ruv.y < fuv.x) {\n        // d b c\n        h = d + ruv.x * (c - d) + ruv.y * (b - d);\n    } else if (tag == 2 && fuv.x < fuv.y) {\n        // c a d\n        h = c + fuv.x * (d - c) + ruv.y * (a - c);\n    } else if (tag == 4 && fuv.x >= fuv.y) {\n        // b a d\n        h = b + ruv.x * (a - b) + fuv.y * (d - b);\n    } else if (tag == 8 && fuv.x <= ruv.y) {\n        // a b c\n        h = a + fuv.x * (b - a) + fuv.y * (c - a);\n    } else {\n        // not enough points to interpolate\n        h = vec4(NIL);\n    }\n\n    return scalarize(h);\n}\n";
/**
 * Color mapping shader (main.js: Cg)
 */
export declare const COLORIZE_SHADER = "\nuniform vec2 u_Range;  // [min, size]\nuniform lowp sampler2D u_Palette;\nuniform lowp float u_Alpha;\n\nfloat fmap(in float v) {\n    return v;\n}\n\nlowp vec4 colorize(in float v) {\n    vec2 st = vec2((fmap(v) - u_Range.x) / u_Range.y, 0.5);\n    lowp vec4 color = texture2D(u_Palette, st);\n    lowp float alpha = step(NIL, v) * u_Alpha;\n    return vec4(color.rgb * alpha, alpha);  // premultiply alpha\n}\n";
/**
 * Default vertex shader
 */
export declare const DEFAULT_VERTEX_SHADER = "\nattribute vec2 a_position;\nattribute vec2 a_texCoord;\n\nvarying vec2 v_texCoord;\n\nvoid main() {\n    gl_Position = vec4(a_position, 0.0, 1.0);\n    v_texCoord = a_texCoord;\n}\n";
/**
 * Configuration for building shaders
 */
export interface ShaderConfig {
    projectionType: 'orthographic' | 'equirectangular' | 'rotated_orthographic';
    renderType: 'texture' | 'data';
    samplingType?: 'simple' | 'interpolated';
}
/**
 * Build a complete shader from modular pieces
 */
export declare function compositeShader(config: ShaderConfig): [string, string];
/**
 * Main WebGL System class
 */
export declare class WebGLSystem {
    private gl;
    private context;
    private programs;
    private textures;
    private canvas;
    private isInitialized;
    private DEBUG;
    private textureCache;
    private overlays;
    constructor();
    /**
     * Initialize WebGL context and capabilities
     */
    initialize(canvas: HTMLCanvasElement): boolean;
    /**
     * Check if WebGL is available and initialized
     */
    isAvailable(): boolean;
    /**
     * Compile a shader
     */
    buildShader(source: string, type: number): WebGLShader | null;
    /**
     * Create a shader program
     */
    buildProgram(vertexSource: string, fragmentSource: string, name: string): ShaderProgram | null;
    /**
     * Create a texture from ImageData or image
     */
    createTexture(data: ImageData | HTMLImageElement, config?: Partial<TextureConfig>): WebGLTexture | null;
    /**
     * Update existing texture data
     */
    updateTexture(texture: WebGLTexture, data: ImageData | HTMLImageElement): boolean;
    /**
     * Render multiple layers
     */
    render(layers: WebGLLayer[], canvasSize: [number, number]): boolean;
    /**
     * Render a single layer
     */
    private renderLayer;
    /**
     * Store a texture with a name for later use
     */
    storeTexture(name: string, texture: WebGLTexture): void;
    /**
     * Clean up WebGL resources
     */
    dispose(): void;
    /**
     * Test function - renders a simple pattern to verify WebGL is working
     */
    testRender(canvasSize: [number, number]): {
        success: boolean;
        renderTime: number;
        error?: string;
    };
    /**
     * Get the WebGL canvas for reading back pixel data
     */
    getCanvas(): HTMLCanvasElement | null;
    /**
     * Smart texture management - automatically cache and reuse textures
     */
    setTextureFromImage(name: string, image: HTMLImageElement, config?: Partial<TextureConfig>): boolean;
    /**
     * High-level planet rendering - handles all WebGL complexity internally
     */
    renderPlanet(image: HTMLImageElement, globe: any, view: any): boolean;
    /**
     * Determine projection type from globe object
     */
    private getProjectionType;
    /**
     * Normalize a value to the range [0, range)
     * Equivalent to the qe function in main.js
     */
    private qe;
    /**
     * Extract projection uniforms from globe and view
     */
    private getProjectionUniforms;
    /**
     * Setup overlay for rendering (one-time heavy computation)
     * Returns overlay ID for use in renderOverlay
     */
    setupOverlay(overlayProduct: any, overlayId: string): boolean;
    /**
     * Render a previously setup overlay (lightweight per-frame operation)
     */
    renderOverlay(overlayId: string, globe: any, view: any): boolean;
    /**
     * Convert weather data grid to GPU texture format using forEachPoint
     */
    private createWeatherDataTexture;
    /**
 * Create a gradient texture from overlay scale data
 */
    createGradientTexture(scale: {
        bounds: [number, number];
        gradient: (value: number, alpha: number) => number[];
    }): WebGLTexture | null;
    /**
     * Pack float values into RGBA bytes for WebGL1 compatibility
     */
    private packFloatToRGBA;
}
//# sourceMappingURL=WebGLSystem.d.ts.map