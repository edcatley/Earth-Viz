/**
 * WebGLParticleSystem - GPU-accelerated particle evolution
 * 
 * Handles particle position updates using WebGL.
 * Does NOT handle rendering - just evolves particle positions.
 */

const MAX_PARTICLE_AGE = 50;

// Fullscreen quad vertices (NDC coordinates: -1 to 1)
// Used for both simulation and fade rendering
const FULLSCREEN_QUAD_VERTICES = new Float32Array([
    -1, -1,  // bottom-left
    1, -1,   // bottom-right
    -1, 1,   // top-left
    1, 1     // top-right
]);

// ===== RENDERING SHADERS =====

const RENDER_VERTEX_SHADER = `
precision highp float;

attribute vec2 a_particleCorner; // x = particle index (0 to N-1), y = corner (0-5)

uniform sampler2D u_prevPos;
uniform sampler2D u_currPos;
uniform mat4 u_projection;
uniform float u_lineWidth;
uniform float u_textureSize;  // Size of particle texture (e.g., 128)

void main() {
    float particleIndex = a_particleCorner.x;
    float corner = a_particleCorner.y;
    
    // Each particle uses 2 pixels, so pixel index = particleIndex * 2
    float posPixelIndex = particleIndex * 2.0;
    float agePixelIndex = posPixelIndex + 1.0;
    
    // Convert linear pixel index to 2D texture coordinates
    float posX = mod(posPixelIndex, u_textureSize);
    float posY = floor(posPixelIndex / u_textureSize);
    vec2 posTexCoord = (vec2(posX, posY) + 0.5) / u_textureSize;
    
    float ageX = mod(agePixelIndex, u_textureSize);
    float ageY = floor(agePixelIndex / u_textureSize);
    vec2 ageTexCoord = (vec2(ageX, ageY) + 0.5) / u_textureSize;
    
    // Read data
    vec4 prevData = texture2D(u_prevPos, posTexCoord);
    vec4 currData = texture2D(u_currPos, posTexCoord);
    vec4 prevAgeData = texture2D(u_prevPos, ageTexCoord);
    vec4 currAgeData = texture2D(u_currPos, ageTexCoord);
    
    // Unpack positions (12.4 fixed point)
    float prevX = (prevData.r * 255.0 * 256.0 + prevData.g * 255.0) / 16.0;
    float prevY = (prevData.b * 255.0 * 256.0 + prevData.a * 255.0) / 16.0;
    float currX = (currData.r * 255.0 * 256.0 + currData.g * 255.0) / 16.0;
    float currY = (currData.b * 255.0 * 256.0 + currData.a * 255.0) / 16.0;
    float prevAge = prevAgeData.r * 255.0;
    float currAge = currAgeData.r * 255.0;
    
    // Hide if EITHER position is uninitialized or dead
    if (prevAge < 1.0 || prevAge > 126.0 || currAge < 1.0 || currAge > 126.0) {
        gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }
    
    vec2 posA = vec2(prevX, prevY);
    vec2 posB = vec2(currX, currY);
    
    // Calculate perpendicular for line thickness
    vec2 dir = posB - posA;
    float len = length(dir);
    if (len < 0.1) {
        gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }
    
    vec2 dirNorm = dir / len;
    vec2 perp = vec2(-dirNorm.y, dirNorm.x) * u_lineWidth;
    
    // Select corner (4 vertices = triangle strip)
    // Strip order: 0→1→2→3 creates two triangles: (0,1,2) and (1,3,2)
    vec2 pos;
    if (corner < 0.5) pos = posA - perp;      // 0: bottom-left
    else if (corner < 1.5) pos = posA + perp; // 1: top-left
    else if (corner < 2.5) pos = posB - perp; // 2: bottom-right
    else pos = posB + perp;                   // 3: top-right
    
    gl_Position = u_projection * vec4(pos, 0.0, 1.0);
}
`;

const RENDER_FRAGMENT_SHADER = `
precision highp float;

void main() {
    gl_FragColor = vec4(1.0, 1.0, 1.0, 0.6);
}
`;

// ===== FADE QUAD SHADERS =====

const FADE_VERTEX_SHADER = `
attribute vec2 a_position;

void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FADE_FRAGMENT_SHADER = `
precision highp float;

void main() {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.02);
}
`;

// ===== BLIT SHADERS (copy trail texture to main canvas) =====

const BLIT_VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_texCoord;

void main() {
    v_texCoord = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const BLIT_FRAGMENT_SHADER = `
precision highp float;
uniform sampler2D u_texture;
varying vec2 v_texCoord;

void main() {
    gl_FragColor = texture2D(u_texture, v_texCoord);
}
`;

// ===== SIMULATION SHADERS =====

// Vertex shader - evolves particle positions
// Vertex shader - simple passthrough for fullscreen quad
const VERTEX_SHADER = `
precision highp float;

attribute vec2 a_position; // Quad vertex position
varying vec2 v_uv; // Pass UV to fragment shader

void main() {
    // Convert quad position to texture coordinates
    v_uv = a_position * 0.5 + 0.5; // [-1,1] -> [0,1]
    
    // Output position for rasterization (renders fullscreen quad)
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

// Fragment shader - does all the particle evolution work (runs once per particle)
const FRAGMENT_SHADER = `
precision highp float;

uniform sampler2D u_particleState; // Current particle state texture
uniform sampler2D u_windField;
uniform vec2 u_windBounds;    // [x, y] offset
uniform vec2 u_windSize;      // [width, height] in samples  
uniform float u_windSpacing;
uniform float u_randomSeed;
uniform float u_textureSize;  // Particle texture size (for 2-pixel indexing)

varying vec2 v_uv; // UV coordinates from vertex shader

// Pack/unpack functions for 2-pixel particle state
// Pixel 0: x (16-bit), y (16-bit)
// Pixel 1: age (8-bit), unused, unused, unused

vec4 packPosition(float x, float y) {
    // Convert to 12.4 fixed point (multiply by 16)
    // Range: 0 to 4095.9375 pixels
    float xFixed = floor(x * 16.0);
    float yFixed = floor(y * 16.0);
    
    // Split into high and low bytes
    float xHigh = floor(xFixed / 256.0);
    float xLow = mod(xFixed, 256.0);
    float yHigh = floor(yFixed / 256.0);
    float yLow = mod(yFixed, 256.0);
    
    return vec4(xHigh / 255.0, xLow / 255.0, yHigh / 255.0, yLow / 255.0);
}

vec4 packAge(float age) {
    return vec4(age / 255.0, 0.0, 0.0, 0.5);
}

vec2 unpackPosition(vec4 rgba) {
    float xHigh = rgba.r * 255.0;
    float xLow = rgba.g * 255.0;
    float yHigh = rgba.b * 255.0;
    float yLow = rgba.a * 255.0;
    
    // Reconstruct 16-bit fixed point values
    float xFixed = xHigh * 256.0 + xLow;
    float yFixed = yHigh * 256.0 + yLow;
    
    // Convert back to float (divide by 16)
    float x = xFixed / 16.0;
    float y = yFixed / 16.0;
    
    return vec2(x, y);
}

float unpackAge(vec4 rgba) {
    return rgba.r * 255.0;
}

// Pack/unpack functions for wind vectors (8.4 fixed point)
// Encodes two velocities (u, v) into RGBA with validity flag
vec3 unpackWind(vec4 rgba) {
    // Check validity first
    if (rgba.a < 0.5) {
        return vec3(0.0, 0.0, -1.0); // Invalid
    }
    
    // Decode from 8.4 fixed point
    // R: u[11:4], G: u[3:0] << 4 | v[11:8], B: v[7:0]
    float uHigh = rgba.r * 255.0;                    // u[11:4]
    float uLow = floor(rgba.g * 255.0 / 16.0);       // u[3:0]
    float vHigh = mod(rgba.g * 255.0, 16.0);         // v[11:8]
    float vLow = rgba.b * 255.0;                     // v[7:0]
    
    // Reconstruct 12-bit fixed point values
    float uFixed = uHigh * 16.0 + uLow;  // 0-4095
    float vFixed = vHigh * 256.0 + vLow; // 0-4095
    
    // Convert back to float: divide by 16, subtract 128 offset
    float u = (uFixed / 16.0) - 128.0;
    float v = (vFixed / 16.0) - 128.0;
    
    // Calculate magnitude
    float mag = sqrt(u * u + v * v);
    
    return vec3(u, v, mag);
}

// Simple pseudo-random function
float random(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233)) + u_randomSeed) * 43758.5453);
}

// Look up wind at pixel position (x, y)
vec3 lookupWind(float x, float y) {
    // Convert pixel coordinates to sample indices
    //offset the bounds top left position to get
    float sample_x = (x - u_windBounds.x) / u_windSpacing;
    float sample_y = (y - u_windBounds.y) / u_windSpacing;
    
    // Bounds check
    if (sample_x < 0.0 || sample_x >= u_windSize.x || sample_y < 0.0 || sample_y >= u_windSize.y) {
        return vec3(0.0, 0.0, -1.0); // Invalid
    }
    
    // Sample wind field texture (RGBA byte encoded)
    // Data is stored column-major (X-major), so swap UV to compensate
    vec2 uv = vec2(sample_y / u_windSize.y, sample_x / u_windSize.x);

    // look up windfield at sample position and unpack
    vec4 rgba = texture2D(u_windField, uv);
    return unpackWind(rgba);
}

void main() {
    // Each particle uses 2 pixels: determine which one we're rendering. Pixel 0 holds X, Y values, pixel 1 holds age and magnitude.

    // v_uv - varying UV value, our "current" shader value pixel, ranges 0 to 1
    // pixelX - the x pixel value normalised to our texture width
    // isParticleAge  - 0 for XY, 1 for age
    // particlePairIndex - the particle pair index. 
    float pixelX = floor(v_uv.x * u_textureSize);  //e.g. 5.0, the age component of the 3rd pixel
    float isParticleAge  = mod(pixelX, 2.0); //e.g. 1.0
    float particlePairIndex = floor(pixelX / 2.0); //e.g. 2.0
    
    // Calculate UV for pixel 0 and pixel 1 of this particle
    //turn the particle pair into a texture lookup value e.g 4.5 and 5.5 respectively (using centres, not sure why) then divided by the texture size. And straight up v_uv.y
    vec2 positionPixelUV  = vec2((particlePairIndex * 2.0 + 0.5) / u_textureSize, v_uv.y); 
    vec2 agePixelUV  = vec2((particlePairIndex * 2.0 + 1.5) / u_textureSize, v_uv.y);
    
    // Read both pixels
    vec4 positionPixel = texture2D(u_particleState, positionPixelUV);
    vec4 agePixel = texture2D(u_particleState, agePixelUV );
    
    // Unpack state
    vec2 pos = unpackPosition(positionPixel);
    float x = pos.x;
    float y = pos.y;
    float age = unpackAge(agePixel);
    
    // Update particle
    float newX, newY, newAge;
    
    if (age > 126.0) {
        // Initialize or out-of-bounds: randomize position AND age
        // random provides 0.0-1.0 using random seed.
        // multiply that by field size and spacing to cover full field
        // offset by bounds left and top position
        newX = u_windBounds.x + random(positionPixelUV) * u_windSize.x * u_windSpacing;
        newY = u_windBounds.y + random(agePixelUV.yx) * u_windSize.y * u_windSpacing;
        newAge = floor(random(positionPixelUV.yx) * 51.0); // Random age 0-50
    } else if (age > float(${MAX_PARTICLE_AGE})) {
        // Aged out naturally: respawn at age 0 (maintains flow coherence)
        newX = u_windBounds.x + random(positionPixelUV) * u_windSize.x * u_windSpacing;
        newY = u_windBounds.y + random(agePixelUV.yx) * u_windSize.y * u_windSpacing;
        newAge = 0.0;
    } else {
        // Evolve
        vec3 wind = lookupWind(x, y);
        
        if (wind.z < 0.0) {
            // Current position invalid: mark for re-initialization
            newX = x;
            newY = y;
            newAge = 127.0;
        } else {
            newX = x + wind.x;
            newY = y + wind.y;
            vec3 windAtNew = lookupWind(newX, newY);
            // If new position invalid, mark for re-initialization (not just aged out)
            newAge = (windAtNew.z < 0.0) ? 127.0 : age + 1.0;
        }
    }
    
    // Write to appropriate pixel
    if (isParticleAge  < 0.5) {
        gl_FragColor = packPosition(newX, newY);
    } else {
        gl_FragColor = packAge(newAge);
    }
}
`;

interface WindBounds {
    x: number;
    y: number;
    width: number;
    height: number;
    spacing: number;
}

export class WebGLParticleSystem {
    private gl: WebGLRenderingContext | null = null;
    private canvas: HTMLCanvasElement | null = null;
    private program: WebGLProgram | null = null;
    private isInitialized = false;

    // Textures and buffers
    private windTexture: WebGLTexture | null = null;
    private windBounds: WindBounds | null = null;
    private particleCount = 0;

    // Ping-pong textures for particle state
    private particleTextures: [WebGLTexture | null, WebGLTexture | null] = [null, null];
    private framebuffers: [WebGLFramebuffer | null, WebGLFramebuffer | null] = [null, null];
    private currentTextureIndex = 0;
    private particleTexSize = 0; // Square texture size to fit all particles

    // Fullscreen quad for rendering
    private quadBuffer: WebGLBuffer | null = null;

    // Rendering system
    private renderProgram: WebGLProgram | null = null;
    private renderVertexBuffer: WebGLBuffer | null = null;
    private renderLocations: any = null;

    // Fade quad system
    private fadeProgram: WebGLProgram | null = null;
    private fadeQuadBuffer: WebGLBuffer | null = null;
    private fadeLocations: any = null;
    
    // Internal framebuffer for particle trails
    private trailFramebuffer: WebGLFramebuffer | null = null;
    private trailTexture: WebGLTexture | null = null;
    
    // Blit program to copy trail texture to main canvas
    private blitProgram: WebGLProgram | null = null;
    private blitLocations: any = null;

    // Cached projection matrix to avoid allocation every frame
    private projectionMatrix: Float32Array = new Float32Array(16);
    
    // Rendering configuration (set during setup)
    private canvasWidth: number = 0;
    private canvasHeight: number = 0;
    private lineWidth: number = 0.5;

    // Shader locations
    private locations: {
        attributes: {
            position: number;
        };
        uniforms: {
            particleState: WebGLUniformLocation | null;
            windField: WebGLUniformLocation | null;
            windBounds: WebGLUniformLocation | null;
            windSize: WebGLUniformLocation | null;
            windSpacing: WebGLUniformLocation | null;
            randomSeed: WebGLUniformLocation | null;
            textureSize: WebGLUniformLocation | null;
        };
    } | null = null;

    constructor() {
        console.log('[WebGLParticleSystem] Created');
    }

    /**
     * Initialize WebGL context
     */
    public initialize(canvas: HTMLCanvasElement): boolean {
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl');

        if (!this.gl) {
            console.error('[WebGLParticleSystem] WebGL not supported');
            return false;
        }

        // Diagnostic: Check WebGL capabilities
        console.log('[WebGLParticleSystem] WebGL Diagnostics:');
        console.log('  - Renderer:', this.gl.getParameter(this.gl.RENDERER));
        console.log('  - Vendor:', this.gl.getParameter(this.gl.VENDOR));
        console.log('  - Version:', this.gl.getParameter(this.gl.VERSION));
        console.log('  - Max Texture Size:', this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE));

        // Check extensions
        const floatExt = this.gl.getExtension('OES_texture_float');
        const floatLinearExt = this.gl.getExtension('OES_texture_float_linear');
        const colorBufferFloat = this.gl.getExtension('WEBGL_color_buffer_float');
        const halfFloatExt = this.gl.getExtension('OES_texture_half_float');
        const halfFloatLinearExt = this.gl.getExtension('OES_texture_half_float_linear');

        console.log('  - OES_texture_float:', !!floatExt);
        console.log('  - OES_texture_float_linear:', !!floatLinearExt);
        console.log('  - WEBGL_color_buffer_float:', !!colorBufferFloat);
        console.log('  - OES_texture_half_float:', !!halfFloatExt);
        console.log('  - OES_texture_half_float_linear:', !!halfFloatLinearExt);

        // Check shader precision
        const vertexPrecision = this.gl.getShaderPrecisionFormat(this.gl.VERTEX_SHADER, this.gl.HIGH_FLOAT);
        const fragmentPrecision = this.gl.getShaderPrecisionFormat(this.gl.FRAGMENT_SHADER, this.gl.HIGH_FLOAT);
        console.log('  - Vertex highp:', vertexPrecision ? `${vertexPrecision.precision} bits` : 'not supported');
        console.log('  - Fragment highp:', fragmentPrecision ? `${fragmentPrecision.precision} bits` : 'not supported');

        // Create evolution shader program
        this.program = this.createProgram(VERTEX_SHADER, FRAGMENT_SHADER);
        if (!this.program) return false;
        
        this.locations = {
            attributes: { position: this.gl.getAttribLocation(this.program, 'a_position') },
            uniforms: {
                particleState: this.gl.getUniformLocation(this.program, 'u_particleState'),
                windField: this.gl.getUniformLocation(this.program, 'u_windField'),
                windBounds: this.gl.getUniformLocation(this.program, 'u_windBounds'),
                windSize: this.gl.getUniformLocation(this.program, 'u_windSize'),
                windSpacing: this.gl.getUniformLocation(this.program, 'u_windSpacing'),
                randomSeed: this.gl.getUniformLocation(this.program, 'u_randomSeed'),
                textureSize: this.gl.getUniformLocation(this.program, 'u_textureSize')
            }
        };

        // Create render shader program
        this.renderProgram = this.createProgram(RENDER_VERTEX_SHADER, RENDER_FRAGMENT_SHADER);
        if (!this.renderProgram) return false;
        
        this.renderLocations = {
            attributes: { particleCorner: this.gl.getAttribLocation(this.renderProgram, 'a_particleCorner') },
            uniforms: {
                prevPos: this.gl.getUniformLocation(this.renderProgram, 'u_prevPos'),
                currPos: this.gl.getUniformLocation(this.renderProgram, 'u_currPos'),
                projection: this.gl.getUniformLocation(this.renderProgram, 'u_projection'),
                lineWidth: this.gl.getUniformLocation(this.renderProgram, 'u_lineWidth'),
                textureSize: this.gl.getUniformLocation(this.renderProgram, 'u_textureSize')
            }
        };

        // Create fade shader program
        this.fadeProgram = this.createProgram(FADE_VERTEX_SHADER, FADE_FRAGMENT_SHADER);
        if (!this.fadeProgram) return false;
        
        this.fadeLocations = {
            attributes: { position: this.gl.getAttribLocation(this.fadeProgram, 'a_position') }
        };
        
        // Create fade quad buffer
        this.fadeQuadBuffer = this.gl.createBuffer();
        if (!this.fadeQuadBuffer) return false;
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.fadeQuadBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, FULLSCREEN_QUAD_VERTICES, this.gl.STATIC_DRAW);
        
        // Create blit shader program
        this.blitProgram = this.createProgram(BLIT_VERTEX_SHADER, BLIT_FRAGMENT_SHADER);
        if (!this.blitProgram) return false;
        
        this.blitLocations = {
            attributes: { position: this.gl.getAttribLocation(this.blitProgram, 'a_position') },
            uniforms: { texture: this.gl.getUniformLocation(this.blitProgram, 'u_texture') }
        };

        this.isInitialized = true;
        console.log('[WebGLParticleSystem] Initialized');
        return true;
    }

    /**
     * Create and compile shader program
     */
    private createProgram(vertexSource: string, fragmentSource: string): WebGLProgram | null {
        if (!this.gl) return null;

        const vs = this.gl.createShader(this.gl.VERTEX_SHADER);
        const fs = this.gl.createShader(this.gl.FRAGMENT_SHADER);
        if (!vs || !fs) return null;

        this.gl.shaderSource(vs, vertexSource);
        this.gl.compileShader(vs);
        if (!this.gl.getShaderParameter(vs, this.gl.COMPILE_STATUS)) {
            console.error('[WebGLParticleSystem] Vertex shader error:', this.gl.getShaderInfoLog(vs));
            return null;
        }

        this.gl.shaderSource(fs, fragmentSource);
        this.gl.compileShader(fs);
        if (!this.gl.getShaderParameter(fs, this.gl.COMPILE_STATUS)) {
            console.error('[WebGLParticleSystem] Fragment shader error:', this.gl.getShaderInfoLog(fs));
            return null;
        }

        const program = this.gl.createProgram();
        if (!program) return null;

        this.gl.attachShader(program, vs);
        this.gl.attachShader(program, fs);
        this.gl.linkProgram(program);

        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            console.error('[WebGLParticleSystem] Program link error:', this.gl.getProgramInfoLog(program));
            return null;
        }

        return program;
    }

    /**
     * Setup particle system with data
     * 
     * @param canvasWidth - Width of the rendering canvas
     * @param canvasHeight - Height of the rendering canvas
     * @param windBounds - Pixel bounds where particles exist (subset of canvas)
     */
    public setup(
        particleCount: number,
        windData: Float32Array,
        windBounds: WindBounds,
        canvasWidth: number,
        canvasHeight: number,
        lineWidth: number = 1.0
    ): boolean {
        if (!this.gl || !this.isInitialized) {
            console.error('[WebGLParticleSystem] Not initialized');
            return false;
        }

        this.windBounds = windBounds;
        this.particleCount = particleCount;
        this.lineWidth = lineWidth;
        
        // Store canvas dimensions for viewport and projection
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;

        // Create wind field texture
        if (!this.createWindTexture(windData, windBounds)) {
            return false;
        }

        // Create ping-pong textures and framebuffers
        if (!this.createParticlePingPongTextures(particleCount)) {
            return false;
        }

        // Create fullscreen quad
        if (!this.createQuadBuffer()) {
            return false;
        }

        // Initialize particle data on GPU
        if (!this.initializeParticleTexture(particleCount)) {
            return false;
        }

        // Create render vertex buffer
        if (!this.createRenderVertexBuffer()) {
            return false;
        }
        
        // Create trail framebuffer for particle trails
        if (!this.createTrailFramebuffer(canvasWidth, canvasHeight)) {
            return false;
        }
        
        // Pre-calculate projection matrix from particle coordinate space
        this.updateProjectionMatrix();

        console.log('[WebGLParticleSystem] Setup complete', {
            particles: particleCount,
            windSamples: windBounds.width * windBounds.height,
            canvas: `${canvasWidth}x${canvasHeight}`,
            particleBounds: `${windBounds.x},${windBounds.y} to ${windBounds.x + windBounds.width * windBounds.spacing},${windBounds.y + windBounds.height * windBounds.spacing}`,
            lineWidth
        });

        return true;
    }
    
    /**
     * Update projection matrix to map canvas pixel coordinates to clip space
     * Simple orthographic projection: [0, canvasWidth] x [0, canvasHeight] → [-1, 1] x [1, -1]
     */
    private updateProjectionMatrix(): void {
        // Map canvas pixels to clip space
        // X: [0, width] → [-1, 1]
        // Y: [0, height] → [1, -1] (inverted because canvas Y goes down, clip Y goes up)
        this.projectionMatrix[0] = 2.0 / this.canvasWidth;
        this.projectionMatrix[1] = 0;
        this.projectionMatrix[2] = 0;
        this.projectionMatrix[3] = 0;
        this.projectionMatrix[4] = 0;
        this.projectionMatrix[5] = -2.0 / this.canvasHeight;
        this.projectionMatrix[6] = 0;
        this.projectionMatrix[7] = 0;
        this.projectionMatrix[8] = 0;
        this.projectionMatrix[9] = 0;
        this.projectionMatrix[10] = 1;
        this.projectionMatrix[11] = 0;
        this.projectionMatrix[12] = -1;
        this.projectionMatrix[13] = 1;
        this.projectionMatrix[14] = 0;
        this.projectionMatrix[15] = 1;
    }

    /**
     * Create wind field texture from Float32Array
     */
    private createWindTexture(windData: Float32Array, windBounds: WindBounds): boolean {
        if (!this.gl) return false;

        const width = windBounds.width;
        const height = windBounds.height;

        // Encode wind data as RGBA bytes using 8.4 fixed point
        // R: u[11:4], G: u[3:0] << 4 | v[11:8], B: v[7:0], A: validity
        const rgbaData = new Uint8Array(width * height * 4);

        for (let i = 0; i < width * height; i++) {
            const u = windData[i * 3];
            const v = windData[i * 3 + 1];

            const baseIdx = i * 4;

            if (isNaN(u) || isNaN(v)) {
                // Invalid wind
                rgbaData[baseIdx] = 0;
                rgbaData[baseIdx + 1] = 0;
                rgbaData[baseIdx + 2] = 0;
                rgbaData[baseIdx + 3] = 0; // validity flag
            } else {
                // Convert to 8.4 fixed point (12 bits total, signed)
                // Clamp to valid range: -128 to 127.9375
                const uClamped = Math.max(-128, Math.min(127.9375, u));
                const vClamped = Math.max(-128, Math.min(127.9375, v));

                // Convert to fixed point: multiply by 16 (shift left 4 bits)
                // Then add 2048 to make unsigned (12-bit range: 0-4095)
                const uFixed = Math.floor((uClamped + 128) * 16); // 0-4095
                const vFixed = Math.floor((vClamped + 128) * 16); // 0-4095

                // Pack into RGBA
                rgbaData[baseIdx] = (uFixed >> 4) & 0xFF;           // u[11:4]
                rgbaData[baseIdx + 1] = ((uFixed & 0x0F) << 4) | ((vFixed >> 8) & 0x0F); // u[3:0] | v[11:8]
                rgbaData[baseIdx + 2] = vFixed & 0xFF;              // v[7:0]
                rgbaData[baseIdx + 3] = 255; // validity flag
            }
        }

        this.windTexture = this.gl.createTexture();
        if (!this.windTexture) {
            console.error('[WebGLParticleSystem] Failed to create wind texture');
            return false;
        }

        this.gl.bindTexture(this.gl.TEXTURE_2D, this.windTexture);
        // Data is stored column-major, so swap dimensions to match UV swap in shader
        this.gl.texImage2D(
            this.gl.TEXTURE_2D,
            0,
            this.gl.RGBA,
            height,  // swap: texture width = data height
            width,   // swap: texture height = data width
            0,
            this.gl.RGBA,
            this.gl.UNSIGNED_BYTE,
            rgbaData
        );

        // Set texture parameters
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);

        console.log('[WebGLParticleSystem] Created wind texture:', width, 'x', height);
        return true;
    }

    /**
     * Create ping-pong textures and framebuffers for particle state
     * Each particle uses 2 pixels (position + age)
     */
    private createParticlePingPongTextures(particleCount: number): boolean {
        if (!this.gl) return false;

        // Calculate square texture size to fit all particles (2 pixels each)
        // MUST be even since each particle uses 2 pixels (position + age)
        const minSize = Math.ceil(Math.sqrt(particleCount * 2));
        this.particleTexSize = minSize % 2 === 0 ? minSize : minSize + 1;

        console.log('[WebGLParticleSystem] Creating', this.particleTexSize, 'x', this.particleTexSize, 'particle textures (2 pixels per particle, RGBA bytes)');

        // Create two textures and framebuffers for ping-pong (RGBA bytes, no float needed)
        for (let i = 0; i < 2; i++) {
            // Create texture
            const texture = this.gl.createTexture();
            if (!texture) {
                console.error('[WebGLParticleSystem] Failed to create particle texture', i);
                return false;
            }

            this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
            this.gl.texImage2D(
                this.gl.TEXTURE_2D,
                0,
                this.gl.RGBA,
                this.particleTexSize,
                this.particleTexSize,
                0,
                this.gl.RGBA,
                this.gl.UNSIGNED_BYTE,
                null
            );

            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);

            this.particleTextures[i] = texture;

            // Create framebuffer
            const framebuffer = this.gl.createFramebuffer();
            if (!framebuffer) {
                console.error('[WebGLParticleSystem] Failed to create framebuffer', i);
                return false;
            }

            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, framebuffer);
            this.gl.framebufferTexture2D(
                this.gl.FRAMEBUFFER,
                this.gl.COLOR_ATTACHMENT0,
                this.gl.TEXTURE_2D,
                texture,
                0
            );

            this.framebuffers[i] = framebuffer;
        }

        // Unbind
        this.gl.bindTexture(this.gl.TEXTURE_2D, null);
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);

        return true;
    }

    /**
     * Create fullscreen quad buffer for rendering
     */
    private createQuadBuffer(): boolean {
        if (!this.gl) return false;

        this.quadBuffer = this.gl.createBuffer();
        if (!this.quadBuffer) {
            console.error('[WebGLParticleSystem] Failed to create quad buffer');
            return false;
        }

        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, FULLSCREEN_QUAD_VERTICES, this.gl.STATIC_DRAW);

        return true;
    }

    /**
     * Initialize particle texture with random positions
     */
    private initializeParticleTexture(particleCount: number): boolean {
        if (!this.gl || !this.windBounds) return false;

        // Create initial particle data: 2 pixels per particle, all aged out
        const data = new Uint8Array(this.particleTexSize * this.particleTexSize * 4);

        for (let i = 0; i < particleCount; i++) {
            const pixelIndex = i * 2;

            // Pixel 0: position (0, 0) encoded as 16-bit
            data[pixelIndex * 4] = 0;     // x high
            data[pixelIndex * 4 + 1] = 0; // x low
            data[pixelIndex * 4 + 2] = 0; // y high
            data[pixelIndex * 4 + 3] = 0; // y low

            // Pixel 1: age (127 = uninitialized sentinel value)
            // First evolve() will initialize with random positions and ages
            data[(pixelIndex + 1) * 4] = 127;
            data[(pixelIndex + 1) * 4 + 1] = 0;
            data[(pixelIndex + 1) * 4 + 2] = 0;
            data[(pixelIndex + 1) * 4 + 3] = 255;
        }

        // Upload to first texture
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.particleTextures[0]);
        this.gl.texImage2D(
            this.gl.TEXTURE_2D,
            0,
            this.gl.RGBA,
            this.particleTexSize,
            this.particleTexSize,
            0,
            this.gl.RGBA,
            this.gl.UNSIGNED_BYTE,
            data
        );

        console.log('[WebGLParticleSystem] Initialized', particleCount, 'particles on GPU (2 pixels each, RGBA bytes)');
        return true;
    }

    /**
     * Evolve particles for one frame (GPU-accelerated)
     * Uses ping-pong rendering: read from one texture, write to the other
     */
    public evolve(): void {
        if (!this.gl || !this.program || !this.locations || !this.windBounds) {
            console.error('[WebGLParticleSystem] Not ready to evolve');
            return;
        }

        // Determine read and write textures
        const readIndex = this.currentTextureIndex;
        const writeIndex = 1 - this.currentTextureIndex;

        // Bind framebuffer to write to
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffers[writeIndex]);
        this.gl.viewport(0, 0, this.particleTexSize, this.particleTexSize);

        // Disable blending - we're writing data, not rendering visuals
        this.gl.disable(this.gl.BLEND);

        // Use shader program
        this.gl.useProgram(this.program);

        // Bind quad buffer
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadBuffer);
        this.gl.enableVertexAttribArray(this.locations.attributes.position);
        this.gl.vertexAttribPointer(
            this.locations.attributes.position,
            2, // 2 components: x, y
            this.gl.FLOAT,
            false,
            0,
            0
        );

        // Bind particle state texture (read from)
        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.particleTextures[readIndex]);
        this.gl.uniform1i(this.locations.uniforms.particleState, 0);

        // Bind wind field texture
        this.gl.activeTexture(this.gl.TEXTURE1);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.windTexture);
        this.gl.uniform1i(this.locations.uniforms.windField, 1);

        // Set uniforms
        this.gl.uniform2f(this.locations.uniforms.windBounds, this.windBounds.x, this.windBounds.y);
        this.gl.uniform2f(this.locations.uniforms.windSize, this.windBounds.width, this.windBounds.height);
        this.gl.uniform1f(this.locations.uniforms.windSpacing, this.windBounds.spacing);
        this.gl.uniform1f(this.locations.uniforms.randomSeed, Math.random());
        this.gl.uniform1f(this.locations.uniforms.textureSize, this.particleTexSize);

        // Draw fullscreen quad (renders to framebuffer texture)
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);

        // Check for GL errors
        const error = this.gl.getError();
        if (error !== this.gl.NO_ERROR) {
            console.error('[WebGLParticleSystem] GL error during evolve:', error);
        }

        // Unbind framebuffer
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);

        // Swap textures for next frame
        this.currentTextureIndex = writeIndex;
    }

    
    /**
     * Create trail framebuffer for particle trails
     */
    private createTrailFramebuffer(width: number, height: number): boolean {
        if (!this.gl) return false;

        // Create texture
        this.trailTexture = this.gl.createTexture();
        if (!this.trailTexture) {
            console.error('[WebGLParticleSystem] Failed to create trail texture');
            return false;
        }

        this.gl.bindTexture(this.gl.TEXTURE_2D, this.trailTexture);
        this.gl.texImage2D(
            this.gl.TEXTURE_2D,
            0,
            this.gl.RGBA,
            width,
            height,
            0,
            this.gl.RGBA,
            this.gl.UNSIGNED_BYTE,
            null
        );

        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);

        // Create framebuffer
        this.trailFramebuffer = this.gl.createFramebuffer();
        if (!this.trailFramebuffer) {
            console.error('[WebGLParticleSystem] Failed to create trail framebuffer');
            return false;
        }

        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.trailFramebuffer);
        this.gl.framebufferTexture2D(
            this.gl.FRAMEBUFFER,
            this.gl.COLOR_ATTACHMENT0,
            this.gl.TEXTURE_2D,
            this.trailTexture,
            0
        );

        // Check framebuffer status
        const status = this.gl.checkFramebufferStatus(this.gl.FRAMEBUFFER);
        if (status !== this.gl.FRAMEBUFFER_COMPLETE) {
            console.error('[WebGLParticleSystem] Trail framebuffer incomplete:', status);
            return false;
        }

        // Clear the trail texture to transparent
        this.gl.clearColor(0.0, 0.0, 0.0, 0.0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);

        // Unbind
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
        this.gl.bindTexture(this.gl.TEXTURE_2D, null);

        console.log('[WebGLParticleSystem] Created trail framebuffer:', width, 'x', height);
        return true;
    }

    /**
     * Render fade quad to create trail effect
     */
    private renderFadeQuad(): void {
        if (!this.gl || !this.fadeProgram || !this.fadeLocations || !this.fadeQuadBuffer) {
            return;
        }

        gl.useProgram(this.fadeProgram);

        // Bind fade quad buffer
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.fadeQuadBuffer);
        this.gl.enableVertexAttribArray(this.fadeLocations.attributes.position);
        this.gl.vertexAttribPointer(
            this.fadeLocations.attributes.position,
            2,
            this.gl.FLOAT,
            false,
            0,
            0
        );

        // Enable blending for fade effect
        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

        // Draw fullscreen quad
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);

        // Disable blending (will be re-enabled for particle rendering)
        this.gl.disable(this.gl.BLEND);
    }

    /**
     * Create render vertex buffer
     */
    private createRenderVertexBuffer(): boolean {
        if (!this.gl) return false;

        // 4 vertices per particle (triangle strip = 1 quad)
        // Each vertex: (particleIndex, corner)
        const vertexData = new Float32Array(this.particleCount * 4 * 2);

        for (let i = 0; i < this.particleCount; i++) {
            for (let corner = 0; corner < 4; corner++) {
                const idx = (i * 4 + corner) * 2;
                vertexData[idx + 0] = i;        // Particle index
                vertexData[idx + 1] = corner;   // Corner ID (0-3)
            }
        }

        this.renderVertexBuffer = this.gl.createBuffer();
        if (!this.renderVertexBuffer) {
            return false;
        }

        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.renderVertexBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, vertexData, this.gl.STATIC_DRAW);

        console.log('[WebGLParticleSystem] Created render vertex buffer with', this.particleCount * 4, 'vertices');
        return true;
    }

    /**
     * Render particles - just draws with pre-configured settings
     */
    public render(gl: WebGLRenderingContext): void {
        if (!this.renderProgram || !this.renderLocations || !this.renderVertexBuffer || !this.trailFramebuffer) {
            console.error('[WebGLParticleSystem] Not ready to render');
            return;
        }

        const prevIndex = 1 - this.currentTextureIndex;
        const currIndex = this.currentTextureIndex;

        // === STEP 1: Render to internal trail framebuffer ===
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.trailFramebuffer);
        gl.viewport(0, 0, this.canvasWidth, this.canvasHeight);

        // Render fade quad to create trails
        this.renderFadeQuad();

        this.gl.useProgram(this.renderProgram);

        // Bind vertex buffer
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.renderVertexBuffer);
        this.gl.enableVertexAttribArray(this.renderLocations.attributes.particleCorner);
        this.gl.vertexAttribPointer(
            this.renderLocations.attributes.particleCorner,
            2, // 2 components: particleIndex, corner
            this.gl.FLOAT,
            false,
            0,
            0
        );

        // Bind textures
        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.particleTextures[prevIndex]);
        this.gl.uniform1i(this.renderLocations.uniforms.prevPos, 0);

        this.gl.activeTexture(this.gl.TEXTURE1);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.particleTextures[currIndex]);
        this.gl.uniform1i(this.renderLocations.uniforms.currPos, 1);

        // Set uniforms (all pre-calculated during setup)
        gl.uniformMatrix4fv(this.renderLocations.uniforms.projection, false, this.projectionMatrix);
        gl.uniform1f(this.renderLocations.uniforms.lineWidth, this.lineWidth);
        gl.uniform1f(this.renderLocations.uniforms.textureSize, this.particleTexSize);

        // Enable blending
        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

        // Draw all particles as triangle strips (4 vertices per particle)
        for (let i = 0; i < this.particleCount; i++) {
            gl.drawArrays(gl.TRIANGLE_STRIP, i * 4, 4);
        }

        // Disable blending
        gl.disable(gl.BLEND);
        
        // === STEP 2: Blit trail framebuffer to main canvas ===
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.canvasWidth, this.canvasHeight);
        
        this.blitTrailTexture(gl);
    }
    
    /**
     * Blit the trail texture to the main canvas
     */
    private blitTrailTexture(gl: WebGLRenderingContext): void {
        if (!this.blitProgram || !this.blitLocations || !this.fadeQuadBuffer || !this.trailTexture) {
            return;
        }
        
        gl.useProgram(this.blitProgram);
        
        // Bind quad buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, this.fadeQuadBuffer);
        gl.enableVertexAttribArray(this.blitLocations.attributes.position);
        gl.vertexAttribPointer(
            this.blitLocations.attributes.position,
            2,
            gl.FLOAT,
            false,
            0,
            0
        );
        
        // Bind trail texture
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.trailTexture);
        gl.uniform1i(this.blitLocations.uniforms.texture, 0);
        
        // Enable blending to composite with existing canvas content
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        
        // Draw fullscreen quad
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        
        gl.disable(gl.BLEND);
    }

    /**
     * Get particle count
     */
    public getParticleCount(): number {
        return this.particleCount;
    }

    /**
     * Check if system is ready
     */
    public isReady(): boolean {
        return this.isInitialized && this.gl !== null;
    }

    /**
     * Clean up resources
     */
    public dispose(): void {
        if (!this.gl) return;

        if (this.quadBuffer) {
            this.gl.deleteBuffer(this.quadBuffer);
            this.quadBuffer = null;
        }

        // Clean up ping-pong textures and framebuffers
        for (let i = 0; i < 2; i++) {
            if (this.particleTextures[i]) {
                this.gl.deleteTexture(this.particleTextures[i]!);
                this.particleTextures[i] = null;
            }
            if (this.framebuffers[i]) {
                this.gl.deleteFramebuffer(this.framebuffers[i]!);
                this.framebuffers[i] = null;
            }
        }

        if (this.windTexture) {
            this.gl.deleteTexture(this.windTexture);
            this.windTexture = null;
        }

        if (this.program) {
            this.gl.deleteProgram(this.program);
            this.program = null;
        }

        if (this.renderProgram) {
            this.gl.deleteProgram(this.renderProgram);
            this.renderProgram = null;
        }

        if (this.renderVertexBuffer) {
            this.gl.deleteBuffer(this.renderVertexBuffer);
            this.renderVertexBuffer = null;
        }

        if (this.fadeProgram) {
            this.gl.deleteProgram(this.fadeProgram);
            this.fadeProgram = null;
        }

        if (this.fadeQuadBuffer) {
            this.gl.deleteBuffer(this.fadeQuadBuffer);
            this.fadeQuadBuffer = null;
        }
        
        if (this.blitProgram) {
            this.gl.deleteProgram(this.blitProgram);
            this.blitProgram = null;
        }
        
        if (this.trailTexture) {
            this.gl.deleteTexture(this.trailTexture);
            this.trailTexture = null;
        }
        
        if (this.trailFramebuffer) {
            this.gl.deleteFramebuffer(this.trailFramebuffer);
            this.trailFramebuffer = null;
        }

        this.isInitialized = false;
    }
}
