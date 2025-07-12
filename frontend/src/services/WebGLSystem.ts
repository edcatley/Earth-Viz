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
    shaderSource: [string, string];  // [vertexShader, fragmentShader]
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

// Constants
const NIL = -999999;

/**
 * Core WebGL shader constants from main.js
 */
export const SHADER_CONSTANTS = `
    const float PI = 3.14159265;
    const float Ae = PI / 180.0;
    const float rr = 180.0 / PI;
    const float vr = 2.0 * PI;
    const float bt = PI;
    const float NIL = -999999.0;
`;

/**
 * Projection Shaders - Direct ports from main.js
 */

// Orthographic projection shader (main.js: V0)
export const ORTHOGRAPHIC_PROJECTION_SHADER = `
uniform vec2 u_translate;   // screen coords translation (x0, y0)
uniform float u_R2;         // scale R, squared
uniform float u_lon0;       // origin longitude
uniform float u_sinlat0;    // sin(lat0)
uniform float u_Rcoslat0;   // R * cos(lat0)
uniform float u_coslat0dR;  // cos(lat0) / R
uniform float u_flip;       // 1.0 if lat0 in range [-90deg, +90deg], otherwise -1.0

// Handbook of Mathematical Functions, M. Abramowitz and I.A. Stegun, Ed. For input on range [-1, +1]
float arcsin(in float v) {
    float x = abs(v);
    float ret = -0.0187293;
    ret *= x;
    ret += 0.0742610;
    ret *= x;
    ret -= 0.2121144;
    ret *= x;
    ret += 1.5707288;
    ret = PI / 2.0 - sqrt(1.0 - x) * ret;
    return sign(v) * ret;
}

/** @returns [lon, lat] in radians for the specified point [x, y], or [NIL, NIL] if the point is unprojectable. */
vec2 invert(in vec2 point) {
    vec2 p = (point - u_translate) * u_flip;
    float d = 1.0 - dot(p, p) / u_R2;
    if (d >= 0.0) {
        float cosc = sqrt(d);
        float lon = u_lon0 + atan(p.x, cosc * u_Rcoslat0 - p.y * u_sinlat0);
        float lat = arcsin(cosc * u_sinlat0 + p.y * u_coslat0dR);
        return vec2(lon, lat);
    }
    return vec2(NIL);  // outside of projection
}
`;



// Rotated orthographic projection shader (main.js: G0)
export const EQUIRECTANGULAR_PROJECTION_SHADER = `
uniform vec2 u_translate;
uniform float u_R;
uniform float u_lon0;
uniform float u_sinlat0;
uniform float u_coslat0;
uniform float u_singam0;
uniform float u_cosgam0;

const vec2 BOUNDS = vec2(PI, PI / 2.0);

/** @returns (lon, lat) in radians for the specified point (x, y), or (NIL, NIL) if the point is unprojectable. */
vec2 invert(in vec2 point) {
    // translate and scale
    vec2 p = (point - u_translate) / u_R;
    if (all(lessThanEqual(abs(p), BOUNDS))) {
        // project
        float lambda = p.x;
        float phi = p.y;
        // rotate (formulas pulled from d3-geo)
        float cosphi = cos(phi);
        float q = cos(lambda) * cosphi;
        float r = sin(lambda) * cosphi;
        float s = sin(phi);
        float t = s * u_cosgam0 - r * u_singam0;
        float u = r * u_cosgam0 + s * u_singam0;
        float v = q * u_coslat0 + t * u_sinlat0;
        float w = t * u_coslat0 - q * u_sinlat0;
        float lon = atan(u, v) - u_lon0;
        float lat = asin(clamp(w, -1.0, 1.0));  // keep holes from forming at poles
        return vec2(lon, lat);
    }
    return vec2(NIL);  // outside of projection
}
`;

/**
 * Grid transformation shader (main.js: yg)
 */
export const GRID_SHADER = `
uniform vec2 u_Low;
uniform vec2 u_Size;

vec2 grid(in vec2 coord) {
    vec2 tex = (coord - u_Low) / u_Size;
    float s = tex.s;
    float t = tex.t;

    if (t < 0.0 || 1.0 < t) discard;  // lat out of bounds, so nothing to draw

    // Fix texture coordinate flipping - WebGL textures are upside down compared to images
    t = 1.0 - t;  // Flip Y coordinate

    return vec2(fract(s), t);  // fract used here only because lon is circular.
}
`;

/**
 * Texture sampling shaders (main.js: xg, bg)
 */

// Simple texture lookup with RGBA unpacking
export const SIMPLE_LOOKUP_SHADER = `
uniform sampler2D u_Data;

float scalarize(in vec4 h) {
    // Unpack float from RGBA (reverse of packFloatToRGBA)
    if (h.r == 1.0 && h.g == 0.0 && h.b == 0.0 && h.a == 0.0) {
        return NIL;  // Special NIL encoding
    } else {
        float absValue = (h.r * 255.0 * 65536.0 + h.g * 255.0 * 256.0 + h.b * 255.0) / 65535.0;
        return h.a == 1.0 ? absValue : -absValue;
    }
}

float lookup(in vec2 st) {
    vec4 h = texture2D(u_Data, st);
    return scalarize(h);
}
`;

// Interpolated texture lookup
export const INTERPOLATED_LOOKUP_SHADER = `
uniform sampler2D u_Data;
uniform vec2 u_TextureSize;

float scalarize(in vec4 h) {
    return h.x;
}

vec4 getSample(in vec2 st) {
    // Use of fract below assumes cylindrical x axis (usually lon) and non-cylindrical y axis (usually lat).
    return texture2D(u_Data, vec2(fract(st.s), st.t));
}

float lookup(in vec2 st) {
    // adapted from http://www.iquilezles.org/www/articles/hwinterpolation/hwinterpolation.htm
    vec2 uv = st * u_TextureSize - 0.5;
    vec2 iuv = floor(uv);
    vec2 fuv = fract(uv);
    vec2 ruv = 1.0 - fuv;

    vec4 a = getSample((iuv + vec2(0.5, 0.5)) / u_TextureSize);  // LL
    vec4 b = getSample((iuv + vec2(1.5, 0.5)) / u_TextureSize);  // LR
    vec4 c = getSample((iuv + vec2(0.5, 1.5)) / u_TextureSize);  // UL
    vec4 d = getSample((iuv + vec2(1.5, 1.5)) / u_TextureSize);  // UR
    vec4 h;

    int tag = int(dot(step(NIL, vec4(a.x, b.x, c.x, d.x)), vec4(1.0, 2.0, 4.0, 8.0)));
    if (tag == 0) {
        // a b c d
        h = mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
    } else if (tag == 1 && ruv.y < fuv.x) {
        // d b c
        h = d + ruv.x * (c - d) + ruv.y * (b - d);
    } else if (tag == 2 && fuv.x < fuv.y) {
        // c a d
        h = c + fuv.x * (d - c) + ruv.y * (a - c);
    } else if (tag == 4 && fuv.x >= fuv.y) {
        // b a d
        h = b + ruv.x * (a - b) + fuv.y * (d - b);
    } else if (tag == 8 && fuv.x <= ruv.y) {
        // a b c
        h = a + fuv.x * (b - a) + fuv.y * (c - a);
    } else {
        // not enough points to interpolate
        h = vec4(NIL);
    }

    return scalarize(h);
}
`;

/**
 * Color mapping shader (main.js: Cg)
 */
export const COLORIZE_SHADER = `
uniform vec2 u_Range;  // [min, size]
uniform lowp sampler2D u_Palette;
uniform lowp float u_Alpha;

float fmap(in float v) {
    return v;
}

lowp vec4 colorize(in float v) {
    vec2 st = vec2((fmap(v) - u_Range.x) / u_Range.y, 0.5);
    lowp vec4 color = texture2D(u_Palette, st);
    lowp float alpha = step(NIL, v) * u_Alpha;
    return vec4(color.rgb * alpha, alpha);  // premultiply alpha
}
`;

/**
 * Default vertex shader
 */
export const DEFAULT_VERTEX_SHADER = `
attribute vec2 a_position;
attribute vec2 a_texCoord;

varying vec2 v_texCoord;

void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
}
`;

/**
 * Configuration for building shaders
 */
export interface ShaderConfig {
    projectionType: 'orthographic' | 'equirectangular' | 'rotated_orthographic';
    renderType: 'texture' | 'data';  // texture = direct copy, data = colorize values
    samplingType?: 'simple' | 'interpolated';
}

/**
 * Build a complete shader from modular pieces
 */
export function compositeShader(config: ShaderConfig): [string, string] {
    // Choose projection shader based on type
    let projectionShader: string;
    switch (config.projectionType) {
        case 'orthographic':
            projectionShader = ORTHOGRAPHIC_PROJECTION_SHADER;
            break;
        case 'equirectangular':
            projectionShader = EQUIRECTANGULAR_PROJECTION_SHADER;
            break;

        default:
            throw new Error(`Unknown projection type: ${config.projectionType}`);
    }
    
    // Choose sampling method
    const samplingShader = config.samplingType === 'interpolated' 
        ? INTERPOLATED_LOOKUP_SHADER 
        : SIMPLE_LOOKUP_SHADER;
    
    // Build fragment shader based on render type
    let mainShaderCode: string;
    let uniforms: string;
    
    if (config.renderType === 'texture') {
        // Planet/texture rendering - direct color copy
        uniforms = `
            uniform sampler2D u_Texture;
            uniform vec2 u_canvasSize;
        `;
        
        mainShaderCode = `
            void main() {
                vec2 screenCoord = v_texCoord * u_canvasSize;
                vec2 coord = invert(screenCoord);
                
                if (coord.x == NIL || coord.y == NIL) {
                    discard;
                }
                
                // Convert from radians to degrees for grid function
                vec2 coordDegrees = coord * 180.0 / PI;
                vec2 texCoord = grid(coordDegrees);
                
                vec4 color = texture2D(u_Texture, texCoord);
                gl_FragColor = color;
            }
        `;
    } else {
        // Data rendering with colorization
        uniforms = `
            uniform vec2 u_canvasSize;
        `;
        
        mainShaderCode = `
            void main() {
                vec2 screenCoord = v_texCoord * u_canvasSize;
                vec2 coord = invert(screenCoord);
                
                if (coord.x == NIL || coord.y == NIL) {
                    discard;
                }
                // Convert from radians to degrees for grid function
                vec2 coordDegrees = coord * 180.0 / PI;
                vec2 texCoord = grid(coordDegrees);
                float value = lookup(texCoord);
                
                if (value == NIL) {
                    discard;
                }
            
                gl_FragColor = colorize(value);
            }
        `;
    }
    
    // Build final fragment shader by combining pieces
    const fragmentShader = `
        precision mediump float;
        
        varying vec2 v_texCoord;
        
        ${SHADER_CONSTANTS}
        ${projectionShader}
        ${GRID_SHADER}
        ${samplingShader}
        ${config.renderType === 'data' ? COLORIZE_SHADER : ''}
        ${uniforms}
        ${mainShaderCode}
    `;
    
    return [DEFAULT_VERTEX_SHADER, fragmentShader];
}


/**
 * Main WebGL System class
 */
export class WebGLSystem {
    private gl: WebGL2RenderingContext | WebGLRenderingContext | null = null;
    private context: WebGLContext | null = null;
    private programs: Map<string, ShaderProgram> = new Map();
    private textures: Map<string, WebGLTexture> = new Map();
    private canvas: HTMLCanvasElement | null = null;  // Store canvas reference
    private isInitialized = false;
    private DEBUG = false;
    
    // Texture caching by image source
    private textureCache: Map<string, { texture: WebGLTexture; timestamp: number; bounds?: any }> = new Map();

    // Store prepared overlays
    private overlays: Map<string, {
        shader: ShaderProgram;
        dataTexture: WebGLTexture;
        gradientTexture: WebGLTexture;
        dataBounds: any;
        scaleBounds: [number, number];
    }> = new Map();

    constructor() {
        this.DEBUG = !!(window as any).DEBUG;
    }

    /**
     * Initialize WebGL context and capabilities
     */
    public initialize(canvas: HTMLCanvasElement): boolean {
        try {
            // Store canvas reference
            this.canvas = canvas;
            
            // Try WebGL2 first, then WebGL1
            this.gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
            
            if (!this.gl) {
                console.warn('WebGL not supported');
                return false;
            }

            const isWebGL2 = this.gl instanceof WebGL2RenderingContext;
            
            // Get extensions
            const extensions: Record<string, any> = {};
            if (!isWebGL2) {
                extensions.OES_texture_float = this.gl.getExtension('OES_texture_float');
                extensions.OES_texture_float_linear = this.gl.getExtension('OES_texture_float_linear');
            }

            this.context = {
                gl: this.gl,
                isWebGL2,
                maxTextureSize: this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE),
                extensions
            };

            // Set up viewport
            this.gl.viewport(0, 0, canvas.width, canvas.height);

            // Enable blending for transparency
            this.gl.enable(this.gl.BLEND);
            this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

            this.isInitialized = true;

            return true;
        } catch (error) {
            console.error('WebGLSystem: Failed to initialize:', error);
            return false;
        }
    }

    /**
     * Check if WebGL is available and initialized
     */
    public isAvailable(): boolean {
        return this.isInitialized && this.gl !== null;
    }

    /**
     * Compile a shader
     */
    public buildShader(source: string, type: number): WebGLShader | null {
        if (!this.gl) return null;

        const shader = this.gl.createShader(type);
        if (!shader) return null;

        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);

        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            const error = this.gl.getShaderInfoLog(shader);
            console.error('Shader compilation error:', error);
            console.error('Shader source:', source);
            this.gl.deleteShader(shader);
            return null;
        }

        return shader;
    }

    /**
     * Create a shader program
     */
    public buildProgram(vertexSource: string, fragmentSource: string, name: string): ShaderProgram | null {
        console.log('WebGLSystem: Building program', { vertexSource, fragmentSource, name });
        if (!this.gl) return null;

        const vertexShader = this.buildShader(vertexSource, this.gl.VERTEX_SHADER);
        const fragmentShader = this.buildShader(fragmentSource, this.gl.FRAGMENT_SHADER);

        if (!vertexShader || !fragmentShader) {
            return null;
        }

        const program = this.gl.createProgram();
        if (!program) return null;

        this.gl.attachShader(program, vertexShader);
        this.gl.attachShader(program, fragmentShader);
        this.gl.linkProgram(program);

        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            const error = this.gl.getProgramInfoLog(program);
            console.error('Program linking error:', error);
            this.gl.deleteProgram(program);
            return null;
        }

        // Get uniform and attribute locations
        const uniforms: Record<string, WebGLUniformLocation> = {};
        const attributes: Record<string, number> = {};

        const numUniforms = this.gl.getProgramParameter(program, this.gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < numUniforms; i++) {
            const uniformInfo = this.gl.getActiveUniform(program, i);
            if (uniformInfo) {
                const location = this.gl.getUniformLocation(program, uniformInfo.name);
                if (location) {
                    uniforms[uniformInfo.name] = location;
                }
            }
        }

        const numAttributes = this.gl.getProgramParameter(program, this.gl.ACTIVE_ATTRIBUTES);
        for (let i = 0; i < numAttributes; i++) {
            const attributeInfo = this.gl.getActiveAttrib(program, i);
            if (attributeInfo) {
                attributes[attributeInfo.name] = this.gl.getAttribLocation(program, attributeInfo.name);
            }
        }

        const shaderProgram: ShaderProgram = {
            program,
            uniforms,
            attributes
        };

        this.programs.set(name, shaderProgram);

        if (this.DEBUG) {
            console.log(`WebGLSystem: Created program '${name}'`, {
                uniforms: Object.keys(uniforms),
                attributes: Object.keys(attributes)
            });
        }

        return shaderProgram;
    }

    /**
     * Create a texture from ImageData or image
     */
    public createTexture(data: ImageData | HTMLImageElement, config?: Partial<TextureConfig>): WebGLTexture | null {
        if (!this.gl) return null;

        const texture = this.gl.createTexture();
        if (!texture) return null;

        this.gl.bindTexture(this.gl.TEXTURE_2D, texture);

        // Set default texture parameters
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, config?.wrapS ?? this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, config?.wrapT ?? this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, config?.minFilter ?? this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, config?.magFilter ?? this.gl.LINEAR);

        // Upload texture data
        if (data instanceof ImageData) {
            this.gl.texImage2D(
                this.gl.TEXTURE_2D,
                0,
                this.gl.RGBA,
                data.width,
                data.height,
                0,
                this.gl.RGBA,
                this.gl.UNSIGNED_BYTE,
                data.data
            );
        } else {
            this.gl.texImage2D(
                this.gl.TEXTURE_2D,
                0,
                this.gl.RGBA,
                this.gl.RGBA,
                this.gl.UNSIGNED_BYTE,
                data
            );
        }

        if (this.DEBUG) {
            console.log('WebGLSystem: Created texture', {
                width: data instanceof ImageData ? data.width : data.naturalWidth,
                height: data instanceof ImageData ? data.height : data.naturalHeight,
                config
            });
        }

        return texture;
    }

    /**
     * Update existing texture data
     */
    public updateTexture(texture: WebGLTexture, data: ImageData | HTMLImageElement): boolean {
        if (!this.gl) return false;

        this.gl.bindTexture(this.gl.TEXTURE_2D, texture);

        try {
            if (data instanceof ImageData) {
                this.gl.texSubImage2D(
                    this.gl.TEXTURE_2D,
                    0,
                    0,
                    0,
                    data.width,
                    data.height,
                    this.gl.RGBA,
                    this.gl.UNSIGNED_BYTE,
                    data.data
                );
            } else {
                this.gl.texSubImage2D(
                    this.gl.TEXTURE_2D,
                    0,
                    0,
                    0,
                    this.gl.RGBA,
                    this.gl.UNSIGNED_BYTE,
                    data
                );
            }
            return true;
        } catch (error) {
            console.error('WebGLSystem: Failed to update texture:', error);
            return false;
        }
    }

    /**
     * Render multiple layers
     */
    public render(layers: WebGLLayer[], canvasSize: [number, number]): boolean {
        if (!this.gl || !this.isInitialized) return false;

        if (this.DEBUG) {
            console.log('WebGLSystem: Rendering layers', { count: layers.length, canvasSize });
        }

        // Update viewport to match canvas size
        this.gl.viewport(0, 0, canvasSize[0], canvasSize[1]);
        
        // Update canvas size if needed
        if (this.canvas && (this.canvas.width !== canvasSize[0] || this.canvas.height !== canvasSize[1])) {
            this.canvas.width = canvasSize[0];
            this.canvas.height = canvasSize[1];
            if (this.DEBUG) {
                console.log('WebGLSystem: Updated canvas size to', canvasSize);
            }
        }

        // Clear canvas
        this.gl.clearColor(0, 0, 0, 0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);

        // Set up screen quad vertices
        const vertices = new Float32Array([
            -1, -1,  0, 0,  // bottom-left
             1, -1,  1, 0,  // bottom-right
            -1,  1,  0, 1,  // top-left
             1,  1,  1, 1   // top-right
        ]);

        const buffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);

        // Render each layer
        for (const layer of layers) {
            if (!this.renderLayer(layer, buffer, canvasSize)) {
                console.warn('WebGLSystem: Failed to render layer');
            }
        }

        // Cleanup
        this.gl.deleteBuffer(buffer);

        return true;
    }

    /**
     * Render a single layer
     */
    private renderLayer(layer: WebGLLayer, vertexBuffer: WebGLBuffer, canvasSize: [number, number]): boolean {
        if (!this.gl) return false;

        const [vertexSource, fragmentSource] = layer.shaderSource;
        
        // Create or get program
        const programKey = `${vertexSource}_${fragmentSource}`;
        let program = this.programs.get(programKey);
        
        if (!program) {
            const newProgram = this.buildProgram(vertexSource, fragmentSource, programKey);
            if (!newProgram) return false;
            program = newProgram;
        }

        this.gl.useProgram(program.program);

        // Set up vertex attributes
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, vertexBuffer);
        
        if (program.attributes.a_position !== undefined) {
            this.gl.enableVertexAttribArray(program.attributes.a_position);
            this.gl.vertexAttribPointer(program.attributes.a_position, 2, this.gl.FLOAT, false, 16, 0);
        }
        
        if (program.attributes.a_texCoord !== undefined) {
            this.gl.enableVertexAttribArray(program.attributes.a_texCoord);
            this.gl.vertexAttribPointer(program.attributes.a_texCoord, 2, this.gl.FLOAT, false, 16, 8);
        }

        // Set uniforms
        for (const [name, value] of Object.entries(layer.uniforms)) {
            const location = program.uniforms[name];
            if (!location) continue;

            if (Array.isArray(value)) {
                if (value.length === 2) {
                    this.gl.uniform2f(location, value[0], value[1]);
                } else if (value.length === 3) {
                    this.gl.uniform3f(location, value[0], value[1], value[2]);
                } else if (value.length === 4) {
                    this.gl.uniform4f(location, value[0], value[1], value[2], value[3]);
                }
            } else if (typeof value === 'number') {
                this.gl.uniform1f(location, value);
            }
        }

        // Bind textures
        let textureUnit = 0;
        for (const [name, config] of Object.entries(layer.textures)) {
            const texture = this.textures.get(name);
            // Debug texture binding issues
            if (this.DEBUG) {
                console.log(`WebGL: Binding texture '${name}' to unit ${textureUnit}`);
            }
            
            if (texture) {
                this.gl.activeTexture(this.gl.TEXTURE0 + textureUnit);
                this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
                
                // Validate texture before binding
                if (this.DEBUG && !this.gl.isTexture(texture)) {
                    console.warn(`WebGL: Invalid texture object for '${name}'`);
                }
                
                const location = program.uniforms[name];
                if (location) {
                    this.gl.uniform1i(location, textureUnit);
                } else if (this.DEBUG) {
                    console.warn(`WebGL: No uniform location found for texture '${name}'`);
                }
                textureUnit++;
            } else if (this.DEBUG) {
                console.warn(`WebGL: No texture found in storage for '${name}'`);
            }
        }

        // Set canvas size uniform if present
        if (program.uniforms.u_canvasSize) {
            this.gl.uniform2f(program.uniforms.u_canvasSize, canvasSize[0], canvasSize[1]);
        }

        // Draw
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);

        return true;
    }

    /**
     * Store a texture with a name for later use
     */
    public storeTexture(name: string, texture: WebGLTexture): void {
        this.textures.set(name, texture);
        
        if (this.DEBUG) {
            console.log(`WebGLSystem: Stored texture '${name}'`);
        }
    }

    /**
     * Clean up WebGL resources
     */
    public dispose(): void {
        if (!this.gl) return;

        // Delete programs
        for (const program of this.programs.values()) {
            this.gl.deleteProgram(program.program);
        }
        this.programs.clear();

        // Delete textures
        for (const texture of this.textures.values()) {
            this.gl.deleteTexture(texture);
        }
        this.textures.clear();
        
        // Clear texture cache as well
        this.textureCache.clear();

        this.gl = null;
        this.context = null;
        this.isInitialized = false;

        if (this.DEBUG) {
            console.log('WebGLSystem: Disposed');
        }
    }



    /**
     * Test function - renders a simple pattern to verify WebGL is working
     */
    public testRender(canvasSize: [number, number]): { success: boolean; renderTime: number; error?: string } {
        const startTime = performance.now();
        
        if (!this.gl || !this.isInitialized) {
            return { success: false, renderTime: 0, error: 'WebGL not initialized' };
        }
        
        try {
            // Simple test fragment shader that creates a gradient pattern
            const testFragmentShader = `
                precision mediump float;
                varying vec2 v_texCoord;
                uniform vec2 u_canvasSize;
                
                void main() {
                    vec2 pos = v_texCoord;
                    
                    // Create a simple gradient pattern
                    float r = pos.x;
                    float g = pos.y;
                    float b = sin(pos.x * 10.0) * 0.5 + 0.5;
                    
                    gl_FragColor = vec4(r, g, b, 1.0);
                }
            `;
            
            // Create test layer
            const testLayer: WebGLLayer = {
                shaderSource: [DEFAULT_VERTEX_SHADER, testFragmentShader],
                textures: {},
                uniforms: {
                    u_canvasSize: canvasSize
                }
            };
            
            // Render the test layer
            const renderSuccess = this.render([testLayer], canvasSize);
            
            const endTime = performance.now();
            const renderTime = endTime - startTime;
            
            if (this.DEBUG) {
                console.log(`WebGLSystem: Test render completed in ${renderTime.toFixed(2)}ms`);
            }
            
            return { 
                success: renderSuccess, 
                renderTime,
                error: renderSuccess ? undefined : 'Render failed'
            };
            
        } catch (error) {
            const endTime = performance.now();
            const renderTime = endTime - startTime;
            
            console.error('WebGLSystem: Test render failed:', error);
            return { 
                success: false, 
                renderTime,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Get the WebGL canvas for reading back pixel data
     */
    public getCanvas(): HTMLCanvasElement | null {
        return this.canvas;
    }

    /**
     * Smart texture management - automatically cache and reuse textures
     */
    public setTextureFromImage(name: string, image: HTMLImageElement, config?: Partial<TextureConfig>): boolean {
        if (!this.gl) return false;
        
        // Generate cache key from image source
        const cacheKey = `${name}_${image.src}_${image.width}x${image.height}`;
        
        // Check if we already have this texture cached
        const cached = this.textureCache.get(cacheKey);
        if (cached) {
            // Reuse cached texture
            this.textures.set(name, cached.texture);
            if (this.DEBUG) {
                console.log(`WebGLSystem: Reusing cached texture '${name}'`);
            }
            return true;
        }
        
        // Create new texture
        const texture = this.createTexture(image, config);
        if (!texture) return false;
        
        // Cache the texture
        this.textureCache.set(cacheKey, {
            texture,
            timestamp: Date.now()
        });
        
        // Store for immediate use
        this.textures.set(name, texture);
        
        if (this.DEBUG) {
            console.log(`WebGLSystem: Created and cached new texture '${name}'`);
        }
        
        return true;
    }

    /**
     * High-level planet rendering - handles all WebGL complexity internally
     */
    public renderPlanet(image: HTMLImageElement, globe: any, view: any): boolean {
        if (!this.gl || !this.isInitialized) return false;

        try {
            // Set texture using smart caching
            if (!this.setTextureFromImage('u_Texture', image)) {
                return false;
            }

            // Determine projection type from globe
            const projectionType = this.getProjectionType(globe);
            
            // Build appropriate shader
            const [vertexShader, fragmentShader] = compositeShader({
                projectionType,
                renderType: 'texture',
                samplingType: 'simple'
            });

            // Get projection uniforms from globe
            const projectionUniforms = this.getProjectionUniforms(globe, view);

            console.log('WebGL DEBUG: Projection uniforms check:', {
                type: projectionType,
                uniforms: projectionUniforms,
                canvasSize: [view.width, view.height],
                expectedTranslate: `Should be around [${view.width/2}, ${view.height/2}]`,
                expectedScale: 'Should be positive number > 50'
            });

            // Standard grid uniforms for coordinate transformation
            const gridUniforms = {
                u_Low: [-180.0, -90.0],  // [min_lon, min_lat] in degrees
                u_Size: [360.0, 180.0]   // [lon_range, lat_range] in degrees
            };

            // Create layer internally
            const planetLayer: WebGLLayer = {
                shaderSource: [vertexShader, fragmentShader],
                textures: {
                    'u_Texture': {
                        internalFormat: 6408, // GL_RGBA
                        format: 6408, // GL_RGBA
                        type: 5121, // GL_UNSIGNED_BYTE
                        width: image.width,
                        height: image.height
                    }
                },
                uniforms: {
                    u_canvasSize: [view.width, view.height],
                    ...projectionUniforms,
                    ...gridUniforms
                }
            };

            // Render internally
            return this.render([planetLayer], [view.width, view.height]);

        } catch (error) {
            if (this.DEBUG) {
                console.error('WebGLSystem: Planet rendering failed:', error);
            }
            return false;
        }
    }

    /**
     * Determine projection type from globe object
     */
    private getProjectionType(globe: any): 'orthographic' | 'equirectangular' | 'rotated_orthographic' {
        // Simply read the projectionType from the globe object
        if (globe.projectionType) {
            console.log('WebGLSystem: Using projection type from globe:', globe.projectionType);
            
            // Map known projection types to WebGL shader types
            switch (globe.projectionType) {
                case 'equirectangular':
                    return 'equirectangular';
                case 'orthographic':
                    return 'orthographic';
                // For now, map other projections to reasonable defaults
                case 'azimuthal_equidistant':
                case 'stereographic':
                    return 'orthographic';  // Similar sphere-like projections
                case 'conic_equidistant':
                case 'waterman':
                case 'winkel3':
                case 'atlantis':
                    return 'equirectangular';  // Flat map-like projections
                default:
                    console.warn('WebGLSystem: Unknown projection type:', globe.projectionType);
                    return 'orthographic';
            }
        }
        
        console.log('WebGLSystem: No projectionType found, defaulting to orthographic');
        return 'orthographic';
    }

    /**
     * Normalize a value to the range [0, range)
     * Equivalent to the qe function in main.js
     */
    private qe(value: number, range: number): number {
        const normalized = value % range;
        return normalized < 0 ? normalized + range : normalized;
    }

    /**
     * Extract projection uniforms from globe and view
     */
    private getProjectionUniforms(globe: any, view: any): { [key: string]: any } {
        const uniforms: { [key: string]: any } = {};
        
        // Get projection parameters
        if (globe.projection) {
            // Get basic D3 projection parameters
            const rotate = globe.projection.rotate ? globe.projection.rotate() : [0, 0, 0];
            const scale = globe.projection.scale ? globe.projection.scale() : 150;
            const translate = globe.projection.translate ? globe.projection.translate() : [view.width / 2, view.height / 2];
            
            // Determine projection type and compute specific uniforms
            const projectionType = this.getProjectionType(globe);
            console.log('projectionType', projectionType);
            
            if (projectionType === 'orthographic') {
                // Implement the EXACT pole-crossing logic from Ws function in main.js (lines 7447-7507)
                let λ0 = rotate[0];  // longitude rotation (degrees)
                let φ0 = rotate[1];  // latitude rotation (degrees)
                let γ0 = rotate[2];  // gamma rotation (degrees)
                
                // Pole-crossing transformation logic from main.js Ws function
                let i = this.qe(φ0 + 90, 360);
                let flip = 180 < i ? -1 : 1;
                
                if (flip < 0) {
                    // Crossing pole - adjust coordinates
                    φ0 = 270 - i;
                    λ0 += 180;
                } else {
                    φ0 = i - 90;
                }
                
                // Convert to radians
                φ0 *= Math.PI / 180;
                λ0 = (this.qe(λ0 + 180, 360) - 180) * Math.PI / 180;
                
                // Calculate derived values
                const sinlat0 = Math.sin(-φ0);
                const coslat0 = Math.cos(-φ0);
                
                // Orthographic projection uniforms (exactly matching Ws function)
                uniforms.u_translate = translate;
                uniforms.u_R2 = scale * scale;
                uniforms.u_lon0 = -λ0;
                uniforms.u_sinlat0 = sinlat0;
                uniforms.u_Rcoslat0 = scale * coslat0;
                uniforms.u_coslat0dR = coslat0 / scale;
                uniforms.u_flip = flip;
                
            } else {
                // Convert to radians
                const λ0 = rotate[0] * Math.PI / 180;  // longitude rotation
                const φ0 = rotate[1] * Math.PI / 180;  // latitude rotation
                
                // Rotated orthographic or other projections
                uniforms.u_translate = translate;
                uniforms.u_R = scale;
                uniforms.u_lon0 = -λ0;  // Negate longitude to match D3 behavior
                uniforms.u_sinlat0 = Math.sin(-φ0);
                uniforms.u_coslat0 = Math.cos(-φ0);
                // For rotated orthographic, we'd need gamma rotation too
                uniforms.u_singam0 = Math.sin(rotate[2] * Math.PI / 180);
                uniforms.u_cosgam0 = Math.cos(rotate[2] * Math.PI / 180);
            }
        }
        
        return uniforms;
    }

    /**
     * Setup overlay for rendering (one-time heavy computation)
     * Returns overlay ID for use in renderOverlay
     */
    public setupOverlay(overlayProduct: any, overlayId: string): boolean {
        if (!this.gl || !this.isInitialized || !overlayProduct || !overlayProduct.scale) {
            return false;
        }

        try {
            // Upload weather data to GPU as texture (heavy operation)
            const weatherDataResult = this.createWeatherDataTexture(overlayProduct);
            if (!weatherDataResult || !weatherDataResult.texture) {
                console.warn('WebGL overlay: Failed to create weather data texture');
                return false;
            }

            // Create gradient texture from overlay product's color scale (heavy operation)
            const gradientTexture = this.createGradientTexture(overlayProduct.scale);
            if (!gradientTexture) {
                return false;
            }

            // Build shader for data overlay rendering (heavy operation)
            const [vertexShader, fragmentShader] = compositeShader({
                projectionType: 'orthographic',  // Default, can be changed per frame
                renderType: 'data',
                samplingType: 'simple'
            });

            // Compile shader program
            const shader = this.buildProgram(vertexShader, fragmentShader, `overlay_${overlayId}`);
            if (!shader) {
                return false;
            }

            // Store overlay configuration
            this.overlays.set(overlayId, {
                shader,
                dataTexture: weatherDataResult.texture,
                gradientTexture,
                dataBounds: weatherDataResult.bounds,
                scaleBounds: overlayProduct.scale.bounds
            });

            console.log(`WebGL: Setup overlay '${overlayId}'`, {
                dataBounds: weatherDataResult.bounds,
                scaleBounds: overlayProduct.scale.bounds
            });

            return true;

        } catch (error) {
            console.error(`WebGL: Failed to setup overlay '${overlayId}':`, error);
            return false;
        }
    }

    /**
     * Render a previously setup overlay (lightweight per-frame operation)
     */
    public renderOverlay(overlayId: string, globe: any, view: any): boolean {
        if (!this.gl || !this.isInitialized) {
            return false;
        }

        const overlay = this.overlays.get(overlayId);
        if (!overlay) {
            console.warn(`WebGL: Overlay '${overlayId}' not found. Call setupOverlay first.`);
            return false;
        }

        try {
            // Get current projection uniforms (frame-dependent)
            const projectionType = this.getProjectionType(globe);
            const projectionUniforms = this.getProjectionUniforms(globe, view);

            // Grid uniforms (static for this overlay)
            const dataBounds = overlay.dataBounds;
            const gridUniforms = {
                u_Low: [dataBounds.west, dataBounds.south],
                u_Size: [dataBounds.east - dataBounds.west, dataBounds.north - dataBounds.south],
                u_TextureSize: [dataBounds.width, dataBounds.height]
            };

            // Color scale uniforms (static for this overlay)
            const colorUniforms = {
                u_Range: [overlay.scaleBounds[0], overlay.scaleBounds[1] - overlay.scaleBounds[0]],
                u_Alpha: 0.6  // Semi-transparent overlay
            };

            // Store textures for rendering
            this.textures.set('u_Data', overlay.dataTexture);
            this.textures.set('u_Palette', overlay.gradientTexture);

            // Create lightweight layer for rendering
            const overlayLayer: WebGLLayer = {
                shaderSource: ['', ''], // Not used since we have compiled shader
                textures: {
                    'u_Data': {
                        internalFormat: this.context?.isWebGL2 ? 33326 : 6408,
                        format: this.context?.isWebGL2 ? 6403 : 6408,
                        type: this.context?.isWebGL2 ? 5126 : 5121,
                        width: dataBounds.width,
                        height: dataBounds.height
                    },
                    'u_Palette': {
                        internalFormat: 6408,
                        format: 6408,
                        type: 5121,
                        width: 256,
                        height: 1
                    }
                },
                uniforms: {
                    u_canvasSize: [view.width, view.height],
                    ...projectionUniforms,
                    ...gridUniforms,
                    ...colorUniforms
                }
            };

            // Use pre-compiled shader
            this.programs.set('overlay_layer', overlay.shader);

            // Render the overlay (fast)
            return this.render([overlayLayer], [view.width, view.height]);

        } catch (error) {
            console.error(`WebGL: Failed to render overlay '${overlayId}':`, error);
            return false;
        }
    }

    /**
     * Convert weather data grid to GPU texture format using forEachPoint
     */
    private createWeatherDataTexture(overlayProduct: any): { texture: WebGLTexture | null, bounds: any } | null {
        if (!this.gl || !overlayProduct?.forEachPoint) return null;

        // Collect all data points
        const dataPoints: Array<{ lon: number; lat: number; value: number }> = [];
        let minLon = Infinity, maxLon = -Infinity;
        let minLat = Infinity, maxLat = -Infinity;
        let minValue = Infinity, maxValue = -Infinity;

        overlayProduct.forEachPoint((lon: number, lat: number, value: number) => {
            if (value != null && isFinite(value)) {
                dataPoints.push({ lon, lat, value });
                minLon = Math.min(minLon, lon);
                maxLon = Math.max(maxLon, lon);
                minLat = Math.min(minLat, lat);
                maxLat = Math.max(maxLat, lat);
                minValue = Math.min(minValue, value);
                maxValue = Math.max(maxValue, value);
            }
        });

        if (dataPoints.length === 0) return null;

        // Find grid dimensions
        const uniqueLons = [...new Set(dataPoints.map(p => p.lon))].sort((a, b) => a - b);
        const uniqueLats = [...new Set(dataPoints.map(p => p.lat))].sort((a, b) => b - a);
        const width = uniqueLons.length;
        const height = uniqueLats.length;

        if (width === 0 || height === 0) return null;

        // Create index maps
        const lonIndexMap = new Map<number, number>();
        const latIndexMap = new Map<number, number>();
        uniqueLons.forEach((lon, i) => lonIndexMap.set(lon, i));
        uniqueLats.forEach((lat, i) => latIndexMap.set(lat, i));

        // Fill grid
        const gridData = new Float32Array(width * height);
        gridData.fill(NIL);
        
        for (const point of dataPoints) {
            const x = lonIndexMap.get(point.lon);
            const y = latIndexMap.get(point.lat);
            if (x !== undefined && y !== undefined) {
                gridData[y * width + x] = point.value;
            }
        }

        // DEBUG: Sample 10 random points from the filled grid
        console.log('Grid sampling after fill:');
        for (let i = 0; i < 10; i++) {
            const randomIndex = Math.floor(Math.random() * gridData.length);
            const x = randomIndex % width;
            const y = Math.floor(randomIndex / width);
            const lon = uniqueLons[x];
            const lat = uniqueLats[y];
            const value = gridData[randomIndex];
            console.log(`  Sample ${i + 1}: grid[${randomIndex}] = ${value} at (${lon}°, ${lat}°) [x=${x}, y=${y}]`);
        }

        // Create texture
        const texture = this.gl.createTexture();
        if (!texture) return null;

        if (this.DEBUG) {
            console.log('WebGL: Created weather data texture', { width, height });
        }

        this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);

        // Upload data
        // Use RGBA format for all texture uploads (R32F had issues)
        console.log('Using RGBA texture format for weather data');
        const rgbaData = this.packFloatToRGBA(gridData);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, 
                         width, height, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, rgbaData);
        
        const uploadError = this.gl.getError();
        if (uploadError !== 0) {
            console.warn('Texture upload error:', uploadError);
        }

        const bounds = {
            west: minLon, east: maxLon, south: minLat, north: maxLat,
            width, height, valueRange: [minValue, maxValue]
        };

        // Skip texture readback for now - format issues with RGBA vs RED
        console.log('Texture upload completed - skipping readback verification');

        console.log('WebGL: Created texture', { width, height, valueRange: [minValue, maxValue] });
        return { texture, bounds };
    }

        /**
     * Create a gradient texture from overlay scale data
     */
        public createGradientTexture(scale: { bounds: [number, number]; gradient: (value: number, alpha: number) => number[] }): WebGLTexture | null {
            const width = 256;  // 256 color steps should be smooth
            const height = 1;   // 1D texture
            
            // Create ImageData with gradient colors
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return null;
            
            const imageData = ctx.createImageData(width, height);
            const [minValue, maxValue] = scale.bounds;
            
            console.log('DEBUG: Creating gradient texture with bounds:', scale.bounds);
            
            for (let i = 0; i < width; i++) {
                const value = minValue + (i / (width - 1)) * (maxValue - minValue);
                const [r, g, b, a] = scale.gradient(value, 255);  // Full opacity
                
                const index = i * 4;
                imageData.data[index] = r;
                imageData.data[index + 1] = g;
                imageData.data[index + 2] = b;
                imageData.data[index + 3] = a || 255;  // Default to full opacity if not provided
                
                // Debug first few and last few gradient steps
                if (i < 5 || i >= width - 5) {
                    console.log(`  Gradient[${i}]: value=${value.toFixed(2)} -> RGBA(${r},${g},${b},${a || 255})`);
                }
            }
            
            console.log('DEBUG: Gradient imageData created, first 20 bytes:', Array.from(imageData.data.slice(0, 20)));
            
            const texture = this.createTexture(imageData);
            
            if (this.DEBUG && texture) {
                console.log('WebGLSystem: Created gradient texture', {
                    bounds: scale.bounds,
                    width,
                    height
                });
            }
            
            return texture;
        }
    /**
     * Pack float values into RGBA bytes for WebGL1 compatibility
     */
    private packFloatToRGBA(floatData: Float32Array): Uint8Array {
        const rgbaData = new Uint8Array(floatData.length * 4);
        
        for (let i = 0; i < floatData.length; i++) {
            const value = floatData[i];
            const baseIndex = i * 4;
            
            if (value === NIL) {
                // Special encoding for NIL values
                rgbaData[baseIndex] = 255;     // R = 255 indicates NIL
                rgbaData[baseIndex + 1] = 0;   // G
                rgbaData[baseIndex + 2] = 0;   // B  
                rgbaData[baseIndex + 3] = 0;   // A
            } else {
                // Pack float into 3 bytes (RGB), use A for sign
                const absValue = Math.abs(value);
                const sign = value < 0 ? 0 : 255;
                
                const scaled = Math.min(absValue * 65535, 16777215); // 24-bit max
                rgbaData[baseIndex] = (scaled >> 16) & 255;     // R - high byte
                rgbaData[baseIndex + 1] = (scaled >> 8) & 255;  // G - mid byte
                rgbaData[baseIndex + 2] = scaled & 255;         // B - low byte
                rgbaData[baseIndex + 3] = sign;                 // A - sign
            }
        }
        
        return rgbaData;
    }
} 