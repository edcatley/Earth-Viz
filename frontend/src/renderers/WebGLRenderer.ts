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
    scaleBounds?: [number, number]; // for overlays
    useInterpolatedLookup?: boolean; // for overlays
    textureSize?: [number, number]; // for interpolated lookup
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

// Shader fragments
const VERTEX_SHADER = `
attribute vec2 a_position;
attribute vec2 a_texCoord;
varying vec2 v_texCoord;

void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
}`;

const SHADER_CONSTANTS = `
precision mediump float;
const float PI = 3.14159265;
const float NIL = -999999.0;
varying vec2 v_texCoord;
`;

const ORTHOGRAPHIC_PROJECTION = `
uniform vec2 u_translate;
uniform float u_R2;
uniform float u_lon0;
uniform float u_sinlat0;
uniform float u_Rcoslat0;
uniform float u_coslat0dR;
uniform float u_flip;

float arcsin(in float v) {
    float x = abs(v);
    float ret = -0.0187293;
    ret *= x; ret += 0.0742610;
    ret *= x; ret -= 0.2121144;
    ret *= x; ret += 1.5707288;
    ret = PI / 2.0 - sqrt(1.0 - x) * ret;
    return sign(v) * ret;
}

vec2 invert(in vec2 point) {
    vec2 p = (point - u_translate) * u_flip;
    float d = 1.0 - dot(p, p) / u_R2;
    if (d >= 0.0) {
        float cosc = sqrt(d);
        float lon = u_lon0 + atan(p.x, cosc * u_Rcoslat0 - p.y * u_sinlat0);
        float lat = arcsin(cosc * u_sinlat0 + p.y * u_coslat0dR);
        return vec2(lon, lat);
    }
    return vec2(NIL);
}`;

const EQUIRECTANGULAR_PROJECTION = `
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
}`;


const GRID_TRANSFORM = `
uniform vec2 u_Low;
uniform vec2 u_Size;

vec2 grid(in vec2 coord) {
    vec2 tex = (coord - u_Low) / u_Size;
    float s = tex.s;
    float t = 1.0 - tex.t; // Flip Y for WebGL
    if (t < 0.0 || 1.0 < t) discard;
    return vec2(fract(s), t);
}`;

const TEXTURE_SAMPLER = `
uniform sampler2D u_Texture;

vec4 sampleTexture(in vec2 st) {
    return texture2D(u_Texture, st);
}`;

const DATA_SAMPLER = `
uniform sampler2D u_Data;

float scalarize(in vec4 h) {
    if (h.r == 1.0 && h.g == 0.0 && h.b == 0.0 && h.a == 0.0) {
        return NIL;
    } else {
        float absValue = (h.r * 255.0 * 65536.0 + h.g * 255.0 * 256.0 + h.b * 255.0) / 1000.0;
        return h.a == 1.0 ? absValue : -absValue;
    }
}

float lookup(in vec2 st) {
    vec4 h = texture2D(u_Data, st);
    return scalarize(h);
}`;

const INTERPOLATED_DATA_SAMPLER = `
uniform sampler2D u_Data;
uniform vec2 u_TextureSize;

float scalarize(in vec4 h) {
    if (h.r == 1.0 && h.g == 0.0 && h.b == 0.0 && h.a == 0.0) {
        return NIL;
    } else {
        float absValue = (h.r * 255.0 * 65536.0 + h.g * 255.0 * 256.0 + h.b * 255.0) / 1000.0;
        return h.a == 1.0 ? absValue : -absValue;
    }
}

float getSample(in vec2 st) {
    vec4 h = texture2D(u_Data, vec2(fract(st.s), st.t));
    return scalarize(h);
}

float lookup(in vec2 st) {
    // Simple bilinear interpolation with NIL handling
    vec2 uv = st * u_TextureSize - 0.5;
    vec2 iuv = floor(uv);
    vec2 fuv = fract(uv);

    float a = getSample((iuv + vec2(0.5, 0.5)) / u_TextureSize);  // LL
    float b = getSample((iuv + vec2(1.5, 0.5)) / u_TextureSize);  // LR
    float c = getSample((iuv + vec2(0.5, 1.5)) / u_TextureSize);  // UL
    float d = getSample((iuv + vec2(1.5, 1.5)) / u_TextureSize);  // UR

    // Check which values are valid (not NIL)
    bool validA = a > NIL;
    bool validB = b > NIL;
    bool validC = c > NIL;
    bool validD = d > NIL;
    
    // Count valid samples
    int validCount = 0;
    if (validA) validCount++;
    if (validB) validCount++;
    if (validC) validCount++;
    if (validD) validCount++;
    
    if (validCount == 0) {
        return NIL;
    } else if (validCount == 4) {
        // All 4 values valid - standard bilinear interpolation
        return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
    } else {
        // Fallback: weighted average of valid samples based on distance
        float totalWeight = 0.0;
        float weightedSum = 0.0;
        
        if (validA) {
            float weight = (1.0 - fuv.x) * (1.0 - fuv.y);
            weightedSum += a * weight;
            totalWeight += weight;
        }
        if (validB) {
            float weight = fuv.x * (1.0 - fuv.y);
            weightedSum += b * weight;
            totalWeight += weight;
        }
        if (validC) {
            float weight = (1.0 - fuv.x) * fuv.y;
            weightedSum += c * weight;
            totalWeight += weight;
        }
        if (validD) {
            float weight = fuv.x * fuv.y;
            weightedSum += d * weight;
            totalWeight += weight;
        }
        
        return totalWeight > 0.0 ? weightedSum / totalWeight : NIL;
    }
}`;

const COLORIZE = `
uniform vec2 u_Range;
uniform sampler2D u_Palette;
uniform float u_Alpha;

vec4 colorize(in float v) {
    vec2 st = vec2((v - u_Range.x) / u_Range.y, 0.5);
    vec4 color = texture2D(u_Palette, st);
    float alpha = step(NIL, v) * u_Alpha;
    return vec4(color.rgb * alpha, alpha);
}`;

// Main shader templates
const PLANET_MAIN = `
uniform vec2 u_canvasSize;
void main() {
    vec2 screenCoord = v_texCoord * u_canvasSize;
    vec2 coord = invert(screenCoord);
    if (coord.x == NIL || coord.y == NIL) discard;
    vec2 coordDegrees = coord * 180.0 / PI;
    vec2 texCoord = grid(coordDegrees);
    gl_FragColor = sampleTexture(texCoord);
}`;

const OVERLAY_MAIN = `
uniform vec2 u_canvasSize;
void main() {
    vec2 screenCoord = v_texCoord * u_canvasSize;
    vec2 coord = invert(screenCoord);
    if (coord.x == NIL || coord.y == NIL) discard;
    vec2 coordDegrees = coord * 180.0 / PI;
    vec2 texCoord = grid(coordDegrees);
    float value = lookup(texCoord);
    if (value == NIL) discard;
    gl_FragColor = colorize(value);
}`;

export class WebGLRenderer {
    private gl: WebGL2RenderingContext | WebGLRenderingContext | null = null;
    private context: WebGLContext | null = null;
    private isInitialized = false;

    // Current render item (only one at a time)
    private currentItem: RenderItem | null = null;

    // Vertex buffer for screen quad
    private vertexBuffer: WebGLBuffer | null = null;

    constructor() { }

    public initialize(gl: WebGL2RenderingContext | WebGLRenderingContext): boolean {
        try {
            this.gl = gl;
            if (!this.gl) return false;

            this.context = {
                gl: this.gl,
                isWebGL2: this.gl instanceof WebGL2RenderingContext,
                maxTextureSize: this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE)
            };

            // Diagnostic logging
            console.log('[WebGLRenderer] WebGL Diagnostics:');
            console.log('  - Context:', this.context.isWebGL2 ? 'WebGL2' : 'WebGL1');
            console.log('  - Renderer:', this.gl.getParameter(this.gl.RENDERER));
            console.log('  - Vendor:', this.gl.getParameter(this.gl.VENDOR));
            console.log('  - Max Texture Size:', this.context.maxTextureSize);

            // Create screen quad vertex buffer
            const vertices = new Float32Array([
                -1, -1, 0, 0,  // bottom-left
                1, -1, 1, 0,  // bottom-right
                -1, 1, 0, 1,  // top-left
                1, 1, 1, 1   // top-right
            ]);

            this.vertexBuffer = this.gl.createBuffer();
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
            this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);

            this.isInitialized = true;
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Setup a render item (heavy operation - done once)
     */
    public setup(type: 'planet' | 'overlay', data: any, globe: any, useInterpolatedLookup = false): boolean {
        // Determine projection type from globe
        const projectionType = this.getProjectionType(globe);
        
        if (!projectionType) {
            console.log(`[WebGLRenderer] Setup failed: Unsupported projection '${globe.projectionType}'`);
            return false;
        }
        
        console.log(`[WebGLRenderer] Setup called: type=${type}, projectionType=${projectionType}`);

        if (!this.gl || !this.isInitialized) {
            console.log(`[WebGLRenderer] Setup failed: gl=${!!this.gl}, initialized=${this.isInitialized}`);
            return false;
        }

        try {
            const textures = new Map<string, WebGLTexture>();
            let scaleBounds: [number, number] | undefined;
            let weatherTextureResult: { texture: WebGLTexture; width: number; height: number } | null = null;

            if (type === 'planet') {
                // Planet: upload image texture
                console.log(`[WebGLRenderer] Creating planet texture`);
                const texture = this.createImageTexture(data as HTMLImageElement);
                if (!texture) {
                    console.log(`[WebGLRenderer] Failed to create planet texture`);
                    return false;
                }
                textures.set('u_Texture', texture);
                console.log(`[WebGLRenderer] Planet texture created successfully`);
            } else {
                // Overlay: upload weather data + gradient textures
                console.log(`[WebGLRenderer] Creating overlay textures`);
                weatherTextureResult = this.createWeatherTexture(data);
                const gradientTexture = this.createGradientTexture(data.scale);
                if (!weatherTextureResult || !gradientTexture) {
                    console.log(`[WebGLRenderer] Failed to create overlay textures`);
                    return false;
                }

                textures.set('u_Data', weatherTextureResult.texture);
                textures.set('u_Palette', gradientTexture);
                scaleBounds = data.scale.bounds;
                console.log(`[WebGLRenderer] Overlay textures created successfully`);
            }

            // Compile shader
            console.log(`[WebGLRenderer] Compiling ${projectionType} shader for ${type} (interpolated: ${useInterpolatedLookup})`);
            const shader = this.compileShader(type, projectionType, useInterpolatedLookup);
            if (!shader) {
                console.log(`[WebGLRenderer] Failed to compile ${projectionType} shader for ${type}`);
                return false;
            }
            console.log(`[WebGLRenderer] ${projectionType} shader compiled successfully for ${type}`);

            // Store render item
            const renderItem: RenderItem = {
                type,
                shader,
                textures,
                scaleBounds
            };

            // Add interpolation info for overlays
            if (type === 'overlay') {
                renderItem.useInterpolatedLookup = useInterpolatedLookup;
                if (useInterpolatedLookup && weatherTextureResult) {
                    renderItem.textureSize = [weatherTextureResult.width, weatherTextureResult.height];
                }
            }

            // Clean up old item if it exists
            if (this.currentItem) {
                this.gl.deleteProgram(this.currentItem.shader);
                for (const texture of this.currentItem.textures.values()) {
                    this.gl.deleteTexture(texture);
                }
            }

            this.currentItem = renderItem;

            console.log(`[WebGLRenderer] Setup completed successfully`);
            return true;
        } catch (error) {
            console.log(`[WebGLRenderer] Setup failed with error:`, error);
            return false;
        }
    }

    /**
     * Render a setup item (lightweight operation - done every frame)
     */
    public render(gl: WebGL2RenderingContext | WebGLRenderingContext, globe: any, view: any): boolean {
        console.log(`[WebGLRenderer] Render called`);

        if (!this.isInitialized) {
            console.log(`[WebGLRenderer] Render failed: initialized=${this.isInitialized}`);
            return false;
        }

        if (!this.currentItem) {
            console.log(`[WebGLRenderer] Render failed: no item setup`);
            return false;
        }

        const item = this.currentItem;
        console.log(`[WebGLRenderer] Rendering ${item.type}`);

        try {
            // Setup viewport (don't clear - RenderSystem handles that)
            gl.viewport(0, 0, view.width, view.height);

            // Use shader
            gl.useProgram(item.shader);

            // Setup vertex attributes
            gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);

            const posLoc = gl.getAttribLocation(item.shader, 'a_position');
            if (posLoc >= 0) {
                gl.enableVertexAttribArray(posLoc);
                gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
            }

            const texLoc = gl.getAttribLocation(item.shader, 'a_texCoord');
            if (texLoc >= 0) {
                gl.enableVertexAttribArray(texLoc);
                gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 16, 8);
            }

            // Set projection uniforms
            this.setProjectionUniforms(gl, item.shader, globe, view);

            // Set grid uniforms
            this.setGridUniforms(gl, item.shader, item.type);

            // Set type-specific uniforms
            if (item.type === 'overlay' && item.scaleBounds) {
                this.setOverlayUniforms(gl, item.shader, item.scaleBounds, item.textureSize);
            }

            // Bind textures
            let textureUnit = 0;
            for (const [name, texture] of item.textures) {
                gl.activeTexture(gl.TEXTURE0 + textureUnit);
                gl.bindTexture(gl.TEXTURE_2D, texture);

                const loc = gl.getUniformLocation(item.shader, name);
                if (loc) {
                    gl.uniform1i(loc, textureUnit);
                }
                textureUnit++;
            }

            // Draw screen quad
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

            // Check for WebGL errors
            const error = gl.getError();
            if (error !== gl.NO_ERROR) {
                console.log(`[WebGLRenderer] WebGL error during render: ${error}`);
                return false;
            }

            console.log(`[WebGLRenderer] Render completed successfully`);
            return true;

        } catch (error) {
            console.log(`[WebGLRenderer] Render failed with error:`, error);
            return false;
        }
    }

    private compileShader(type: 'planet' | 'overlay', projectionType: 'orthographic' | 'equirectangular', useInterpolatedLookup = false): WebGLProgram | null {
        if (!this.gl) return null;

        // Choose projection shader
        let projectionShader: string;
        switch (projectionType) {
            case 'equirectangular':
                projectionShader = EQUIRECTANGULAR_PROJECTION;
                break;
            case 'orthographic':
            default:
                projectionShader = ORTHOGRAPHIC_PROJECTION;
                break;
        }

        // Build fragment shader based on type
        let fragmentShader = SHADER_CONSTANTS + projectionShader + GRID_TRANSFORM;

        if (type === 'planet') {
            fragmentShader += TEXTURE_SAMPLER + PLANET_MAIN;
        } else {
            // Choose data sampler based on interpolation preference
            const dataSampler = useInterpolatedLookup ? INTERPOLATED_DATA_SAMPLER : DATA_SAMPLER;
            fragmentShader += dataSampler + COLORIZE + OVERLAY_MAIN;
        }

        return this.createProgram(VERTEX_SHADER, fragmentShader);
    }

    private createProgram(vertexSource: string, fragmentSource: string): WebGLProgram | null {
        if (!this.gl) return null;

        const vertexShader = this.createShader(vertexSource, this.gl.VERTEX_SHADER);
        const fragmentShader = this.createShader(fragmentSource, this.gl.FRAGMENT_SHADER);

        if (!vertexShader || !fragmentShader) return null;

        const program = this.gl.createProgram();
        if (!program) return null;

        this.gl.attachShader(program, vertexShader);
        this.gl.attachShader(program, fragmentShader);
        this.gl.linkProgram(program);

        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            const error = this.gl.getProgramInfoLog(program);
            console.error('[WebGLRenderer] Program linking error:', error);
            this.gl.deleteProgram(program);
            return null;
        }

        return program;
    }

    private createShader(source: string, type: number): WebGLShader | null {
        if (!this.gl) return null;

        const shader = this.gl.createShader(type);
        if (!shader) return null;

        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);

        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            const error = this.gl.getShaderInfoLog(shader);
            console.error('[WebGLRenderer] Shader compilation error:', error);
            console.error('[WebGLRenderer] Shader source:', source);
            this.gl.deleteShader(shader);
            return null;
        }

        return shader;
    }

    private createImageTexture(image: HTMLImageElement): WebGLTexture | null {
        if (!this.gl) return null;

        const texture = this.gl.createTexture();
        if (!texture) return null;

        this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, image);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);

        return texture;
    }

    private createWeatherTexture(overlayProduct: any): { texture: WebGLTexture; width: number; height: number } | null {
        if (!this.gl || !overlayProduct?.forEachPoint) return null;

        // Collect data points
        const dataPoints: Array<{ lon: number; lat: number; value: number }> = [];
        let minLon = Infinity, maxLon = -Infinity;
        let minLat = Infinity, maxLat = -Infinity;

        overlayProduct.forEachPoint((lon: number, lat: number, value: number) => {
            if (value != null && isFinite(value)) {
                dataPoints.push({ lon, lat, value });
                minLon = Math.min(minLon, lon);
                maxLon = Math.max(maxLon, lon);
                minLat = Math.min(minLat, lat);
                maxLat = Math.max(maxLat, lat);
            }
        });

        if (dataPoints.length === 0) return null;

        // Create grid
        const uniqueLons = [...new Set(dataPoints.map(p => p.lon))].sort((a, b) => a - b);
        const uniqueLats = [...new Set(dataPoints.map(p => p.lat))].sort((a, b) => b - a);
        const width = uniqueLons.length;
        const height = uniqueLats.length;

        if (width === 0 || height === 0) return null;

        // Fill grid data
        const gridData = new Float32Array(width * height);
        gridData.fill(-999999); // NIL value

        const lonIndexMap = new Map<number, number>();
        const latIndexMap = new Map<number, number>();
        uniqueLons.forEach((lon, i) => lonIndexMap.set(lon, i));
        uniqueLats.forEach((lat, i) => latIndexMap.set(lat, i));

        for (const point of dataPoints) {
            const x = lonIndexMap.get(point.lon);
            const y = latIndexMap.get(point.lat);
            if (x !== undefined && y !== undefined) {
                gridData[y * width + x] = point.value;
            }
        }

        // Create float texture (proper format)
        const texture = this.gl.createTexture();
        if (!texture) return null;

        this.gl.bindTexture(this.gl.TEXTURE_2D, texture);

        console.log(`[WebGL] Float textures not supported, using RGBA encoding. Sample values:`,
            gridData.slice(0, 5), '...', gridData.slice(-5));

        // Fallback to RGBA encoding since float textures aren't supported
        const rgbaData = this.packFloatToRGBA(gridData);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, width, height, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, rgbaData);

        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);

        return { texture, width, height };

    }

    private packFloatToRGBA(gridData: Float32Array): Uint8Array {
        const rgbaData = new Uint8Array(gridData.length * 4);
        for (let i = 0; i < gridData.length; i++) {
            const value = gridData[i];
            const baseIndex = i * 4;

            if (value === -999999) {
                // NIL encoding
                rgbaData[baseIndex] = 255;
                rgbaData[baseIndex + 1] = 0;
                rgbaData[baseIndex + 2] = 0;
                rgbaData[baseIndex + 3] = 0;
            } else {
                // Improved float encoding - handle larger ranges properly
                const absValue = Math.abs(value);
                const sign = value < 0 ? 0 : 255;

                // Scale to use full 24-bit range (16777215 = 2^24 - 1)
                // This allows values up to ~16777 with reasonable precision
                const scaled = Math.min(Math.floor(absValue * 1000), 16777215);

                rgbaData[baseIndex] = (scaled >> 16) & 255;
                rgbaData[baseIndex + 1] = (scaled >> 8) & 255;
                rgbaData[baseIndex + 2] = scaled & 255;
                rgbaData[baseIndex + 3] = sign;
            }
        }
        return rgbaData;
    }

    private createGradientTexture(scale: any): WebGLTexture | null {
        if (!this.gl || !scale?.gradient) return null;

        const width = 256;
        const imageData = new ImageData(width, 1);
        const data = imageData.data;

        for (let i = 0; i < width; i++) {
            const t = i / (width - 1);
            const value = scale.bounds[0] + t * (scale.bounds[1] - scale.bounds[0]);
            const color = scale.gradient(value, 255);

            const idx = i * 4;
            data[idx] = color[0] || 0;
            data[idx + 1] = color[1] || 0;
            data[idx + 2] = color[2] || 0;
            data[idx + 3] = color[3] || 255;
        }

        const texture = this.gl.createTexture();
        if (!texture) return null;

        this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, imageData);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);

        return texture;
    }

    private getProjectionType(globe: any): 'orthographic' | 'equirectangular' | null {
        if (globe.projectionType) {
            switch (globe.projectionType) {
                case 'equirectangular':
                    return 'equirectangular';
                case 'orthographic':
                    return 'orthographic';
                // Unsupported projections return null
                case 'azimuthal_equidistant':
                case 'stereographic':
                case 'conic_equidistant':
                case 'waterman':
                case 'winkel3':
                case 'atlantis':
                default:
                    return null;
            }
        }
        return 'orthographic'; // Default if no projection type specified
    }

    private qe(value: number, range: number): number {
        const normalized = value % range;
        return normalized < 0 ? normalized + range : normalized;
    }

    private setProjectionUniforms(gl: WebGL2RenderingContext | WebGLRenderingContext, program: WebGLProgram, globe: any, view: any): void {
        if (!globe.projection) return;

        const rotate = globe.projection.rotate() || [0, 0, 0];
        const scale = globe.projection.scale() || 150;
        const translate = globe.projection.translate() || [view.width / 2, view.height / 2];
        const projectionType = this.getProjectionType(globe);

        this.setUniform(gl, program, 'u_canvasSize', [view.width, view.height]);
        this.setUniform(gl, program, 'u_translate', translate);

        if (projectionType === 'orthographic') {
            // Orthographic projection with pole-crossing logic
            let λ0 = rotate[0];
            let φ0 = rotate[1];

            let i = this.qe(φ0 + 90, 360);
            let flip = 180 < i ? -1 : 1;

            if (flip < 0) {
                φ0 = 270 - i;
                λ0 += 180;
            } else {
                φ0 = i - 90;
            }

            φ0 *= Math.PI / 180;
            λ0 = (this.qe(λ0 + 180, 360) - 180) * Math.PI / 180;

            const sinlat0 = Math.sin(-φ0);
            const coslat0 = Math.cos(-φ0);

            this.setUniform(gl, program, 'u_R2', scale * scale);
            this.setUniform(gl, program, 'u_lon0', -λ0);
            this.setUniform(gl, program, 'u_sinlat0', sinlat0);
            this.setUniform(gl, program, 'u_Rcoslat0', scale * coslat0);
            this.setUniform(gl, program, 'u_coslat0dR', coslat0 / scale);
            this.setUniform(gl, program, 'u_flip', flip);

        } else if (projectionType === 'equirectangular') {
            // Equirectangular projection (rotated orthographic) - match old WebGLSystem
            const λ0 = rotate[0] * Math.PI / 180;  // longitude rotation
            const φ0 = rotate[1] * Math.PI / 180;  // latitude rotation
            const γ0 = rotate[2] * Math.PI / 180;  // gamma rotation

            this.setUniform(gl, program, 'u_R', scale);
            this.setUniform(gl, program, 'u_lon0', λ0);  // Try positive for equirectangular
            this.setUniform(gl, program, 'u_sinlat0', Math.sin(φ0));
            this.setUniform(gl, program, 'u_coslat0', Math.cos(φ0));
            this.setUniform(gl, program, 'u_singam0', Math.sin(γ0));
            this.setUniform(gl, program, 'u_cosgam0', Math.cos(γ0));

        }
    }

    private setGridUniforms(gl: WebGL2RenderingContext | WebGLRenderingContext, program: WebGLProgram, type?: string): void {
        // Grid uniforms - different for planet vs overlay due to longitude conventions
        if (type === 'overlay') {
            // Overlay data: shift longitude by 180° to match planet
            this.setUniform(gl, program, 'u_Low', [0.0, -90.0]);
            this.setUniform(gl, program, 'u_Size', [360.0, 180.0]);
        } else {
            // Planet: standard grid
            this.setUniform(gl, program, 'u_Low', [-180.0, -90.0]);
            this.setUniform(gl, program, 'u_Size', [360.0, 180.0]);
        }
    }

    private setOverlayUniforms(gl: WebGL2RenderingContext | WebGLRenderingContext, program: WebGLProgram, scaleBounds: [number, number], textureSize?: [number, number]): void {
        this.setUniform(gl, program, 'u_Range', [scaleBounds[0], scaleBounds[1] - scaleBounds[0]]);
        this.setUniform(gl, program, 'u_Alpha', 0.6);

        // Set texture size for interpolated lookup
        if (textureSize) {
            this.setUniform(gl, program, 'u_TextureSize', textureSize);
        }
    }

    private setUniform(gl: WebGL2RenderingContext | WebGLRenderingContext, program: WebGLProgram, name: string, value: number | number[]): void {
        const location = gl.getUniformLocation(program, name);
        if (!location) return;

        if (Array.isArray(value)) {
            if (value.length === 2) {
                gl.uniform2f(location, value[0], value[1]);
            } else if (value.length === 3) {
                gl.uniform3f(location, value[0], value[1], value[2]);
            } else if (value.length === 4) {
                gl.uniform4f(location, value[0], value[1], value[2], value[3]);
            }
        } else {
            gl.uniform1f(location, value);
        }
    }

    /**
     * Clear the canvas
     */
    public clear(): void {
        if (!this.gl) return;
        this.gl.clearColor(0.0, 0.0, 0.0, 0.0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
    }

    public dispose(): void {
        if (!this.gl) return;

        // Clean up current item
        if (this.currentItem) {
            this.gl.deleteProgram(this.currentItem.shader);
            for (const texture of this.currentItem.textures.values()) {
                this.gl.deleteTexture(texture);
            }
            this.currentItem = null;
        }

        if (this.vertexBuffer) {
            this.gl.deleteBuffer(this.vertexBuffer);
            this.vertexBuffer = null;
        }

        this.gl = null;
        this.context = null;
        this.isInitialized = false;
    }

} 