/**
 * WebGLParticleSystem - GPU-accelerated particle evolution
 * 
 * Handles particle position updates using WebGL.
 * Does NOT handle rendering - just evolves particle positions.
 */

import { Particle } from '../renderers/Particles';

const MAX_PARTICLE_AGE = 50;

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
    
    // Select corner (6 vertices = 2 triangles)
    vec2 pos;
    if (corner < 0.5) pos = posA - perp;
    else if (corner < 1.5) pos = posA + perp;
    else if (corner < 2.5) pos = posB + perp;
    else if (corner < 3.5) pos = posA - perp;
    else if (corner < 4.5) pos = posB + perp;
    else pos = posB - perp;
    
    gl_Position = u_projection * vec4(pos, 0.0, 1.0);
}
`;

const RENDER_FRAGMENT_SHADER = `
precision highp float;

void main() {
    gl_FragColor = vec4(1.0, 1.0, 1.0, 0.9);
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

    // Previous frame data for merging old + new positions
    private previousFrameData: Float32Array | null = null;

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

        // Create shader program
        if (!this.createShaderProgram()) {
            console.error('[WebGLParticleSystem] Failed to create shader program');
            return false;
        }

        // Get shader locations
        this.getShaderLocations();

        // Create render shader program
        if (!this.createRenderShaderProgram()) {
            console.error('[WebGLParticleSystem] Failed to create render shader program');
            return false;
        }

        // Get render shader locations
        this.getRenderShaderLocations();

        this.isInitialized = true;
        console.log('[WebGLParticleSystem] Initialized');
        return true;
    }

    /**
     * Create and compile shader program
     */
    private createShaderProgram(): boolean {
        if (!this.gl) return false;

        const vertexShader = this.createShader(this.gl.VERTEX_SHADER, VERTEX_SHADER);
        const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, FRAGMENT_SHADER);

        if (!vertexShader || !fragmentShader) {
            return false;
        }

        this.program = this.gl.createProgram();
        if (!this.program) {
            console.error('[WebGLParticleSystem] Failed to create program');
            return false;
        }

        this.gl.attachShader(this.program, vertexShader);
        this.gl.attachShader(this.program, fragmentShader);
        this.gl.linkProgram(this.program);

        if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
            console.error('[WebGLParticleSystem] Program link error:', this.gl.getProgramInfoLog(this.program));
            return false;
        }

        return true;
    }

    /**
     * Create and compile a shader
     */
    private createShader(type: number, source: string): WebGLShader | null {
        if (!this.gl) return null;

        const shader = this.gl.createShader(type);
        if (!shader) return null;

        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);

        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error('[WebGLParticleSystem] Shader compile error:', this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            return null;
        }

        return shader;
    }

    /**
     * Get shader attribute and uniform locations
     */
    private getShaderLocations(): void {
        if (!this.gl || !this.program) return;

        this.locations = {
            attributes: {
                position: this.gl.getAttribLocation(this.program, 'a_position')
            },
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
    }

    /**
     * Setup particle system with data
     */
    public setup(
        particleCount: number,
        windData: Float32Array,
        windBounds: WindBounds,
    ): boolean {
        if (!this.gl || !this.isInitialized) {
            console.error('[WebGLParticleSystem] Not initialized');
            return false;
        }

        this.windBounds = windBounds;
        this.particleCount = particleCount;

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

        console.log('[WebGLParticleSystem] Setup complete', {
            particles: particleCount,
            windSamples: windBounds.width * windBounds.height,
        });

        return true;
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
        this.gl.texImage2D(
            this.gl.TEXTURE_2D,
            0,
            this.gl.RGBA,
            width,
            height,
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

            // Check framebuffer status
            const status = this.gl.checkFramebufferStatus(this.gl.FRAMEBUFFER);
            if (status !== this.gl.FRAMEBUFFER_COMPLETE) {
                const statusNames: { [key: number]: string } = {
                    [this.gl.FRAMEBUFFER_COMPLETE]: 'COMPLETE',
                    [this.gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT]: 'INCOMPLETE_ATTACHMENT',
                    [this.gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT]: 'INCOMPLETE_MISSING_ATTACHMENT',
                    [this.gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS]: 'INCOMPLETE_DIMENSIONS',
                    [this.gl.FRAMEBUFFER_UNSUPPORTED]: 'UNSUPPORTED'
                };
                console.error('[WebGLParticleSystem] Framebuffer incomplete:', statusNames[status] || status);
                console.error('[WebGLParticleSystem] This means float texture rendering to framebuffer is not supported');
                return false;
            }

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

        // Fullscreen quad: two triangles covering [-1, 1] in NDC
        const vertices = new Float32Array([
            -1, -1,  // bottom-left
            1, -1,  // bottom-right
            -1, 1,  // top-left
            1, 1   // top-right
        ]);

        this.quadBuffer = this.gl.createBuffer();
        if (!this.quadBuffer) {
            console.error('[WebGLParticleSystem] Failed to create quad buffer');
            return false;
        }

        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);

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

        //console.log('[WebGLParticleSystem] Evolved particles, swapped to texture', writeIndex);
    }

    /**
     * Get current particle data (reads back from GPU)
     * Returns Float32Array with stride 6: [x, y, age, xt, yt, magnitude]
     * Merges previous frame (old position) with current frame (new position)
     */
    public getParticleData(): Float32Array {
        if (!this.gl || !this.isInitialized) {
            console.error('[WebGLParticleSystem] Not ready to read particles');
            return new Float32Array(0);
        }

        // Read current frame from GPU (stride 4: [xt, yt, age, magnitude])
        const newData = this.readPixelsFromGPU();

        // First frame: no previous data to merge
        if (!this.previousFrameData) {
            this.previousFrameData = newData.slice();
            // Return with duplicated positions (can't draw lines on first frame)
            return this.mergeFrameData(newData, newData);
        }

        // Merge previous frame (old positions) with current frame (new positions)
        const merged = this.mergeFrameData(this.previousFrameData, newData);

        // Save current frame for next iteration
        this.previousFrameData = newData;

        return merged;
    }

    /**
     * Read pixels from GPU framebuffer
     * Returns Float32Array with stride 4: [x, y, age, magnitude]
     * Decodes 2-pixel particle state back to floats
     */
    private readPixelsFromGPU(): Float32Array {
        if (!this.gl) return new Float32Array(0);

        // Bind the current particle state framebuffer
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffers[this.currentTextureIndex]);

        // Allocate buffer for readback (RGBA bytes)
        const pixels = new Uint8Array(this.particleTexSize * this.particleTexSize * 4);

        // Read pixels from framebuffer
        this.gl.readPixels(
            0,
            0,
            this.particleTexSize,
            this.particleTexSize,
            this.gl.RGBA,
            this.gl.UNSIGNED_BYTE,
            pixels
        );

        // Unbind framebuffer
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);

        // Decode 2-pixel particle state back to floats
        const decoded = new Float32Array(this.particleCount * 4);

        for (let i = 0; i < this.particleCount; i++) {
            const pixelIndex = i * 2;

            // Decode pixel 0: position (12.4 fixed point)
            const xHigh = pixels[pixelIndex * 4];
            const xLow = pixels[pixelIndex * 4 + 1];
            const yHigh = pixels[pixelIndex * 4 + 2];
            const yLow = pixels[pixelIndex * 4 + 3];

            // Reconstruct fixed point and convert to float
            const xFixed = xHigh * 256 + xLow;
            const yFixed = yHigh * 256 + yLow;
            const x = xFixed / 16;
            const y = yFixed / 16;

            // Decode pixel 1: age
            const age = pixels[(pixelIndex + 1) * 4];

            decoded[i * 4] = x;
            decoded[i * 4 + 1] = y;
            decoded[i * 4 + 2] = age;
            decoded[i * 4 + 3] = 0; // magnitude (unused)
        }

        return decoded;
    }

    /**
     * Merge old and new frame data into stride 6 format
     * Input: stride 4 [x, y, age, magnitude]
     * Output: stride 6 [old_x, old_y, age, new_x, new_y, magnitude]
     */
    private mergeFrameData(oldData: Float32Array, newData: Float32Array): Float32Array {
        const merged = new Float32Array(this.particleCount * 6);

        for (let i = 0; i < this.particleCount; i++) {
            const oldIdx = i * 4;
            const newIdx = i * 4;
            const mergedIdx = i * 6;

            merged[mergedIdx + 0] = oldData[oldIdx + 0]; // x (old position)
            merged[mergedIdx + 1] = oldData[oldIdx + 1]; // y (old position)
            merged[mergedIdx + 2] = oldData[oldIdx + 2]; // age (OLD - for draw filtering)
            merged[mergedIdx + 3] = newData[newIdx + 0]; // xt (new position)
            merged[mergedIdx + 4] = newData[newIdx + 1]; // yt (new position)
            merged[mergedIdx + 5] = newData[newIdx + 3]; // magnitude (current)
        }

        return merged;
    }

    /**
     * Create render shader program
     */
    private createRenderShaderProgram(): boolean {
        if (!this.gl) return false;

        const vertexShader = this.createShader(this.gl.VERTEX_SHADER, RENDER_VERTEX_SHADER);
        const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, RENDER_FRAGMENT_SHADER);

        if (!vertexShader || !fragmentShader) {
            return false;
        }

        this.renderProgram = this.gl.createProgram();
        if (!this.renderProgram) {
            console.error('[WebGLParticleSystem] Failed to create render program');
            return false;
        }

        this.gl.attachShader(this.renderProgram, vertexShader);
        this.gl.attachShader(this.renderProgram, fragmentShader);
        this.gl.linkProgram(this.renderProgram);

        if (!this.gl.getProgramParameter(this.renderProgram, this.gl.LINK_STATUS)) {
            console.error('[WebGLParticleSystem] Render program link error:', this.gl.getProgramInfoLog(this.renderProgram));
            return false;
        }

        return true;
    }

    /**
     * Get render shader locations
     */
    private getRenderShaderLocations(): void {
        if (!this.gl || !this.renderProgram) return;

        this.renderLocations = {
            attributes: {
                particleCorner: this.gl.getAttribLocation(this.renderProgram, 'a_particleCorner')
            },
            uniforms: {
                prevPos: this.gl.getUniformLocation(this.renderProgram, 'u_prevPos'),
                currPos: this.gl.getUniformLocation(this.renderProgram, 'u_currPos'),
                projection: this.gl.getUniformLocation(this.renderProgram, 'u_projection'),
                lineWidth: this.gl.getUniformLocation(this.renderProgram, 'u_lineWidth'),
                textureSize: this.gl.getUniformLocation(this.renderProgram, 'u_textureSize')
            }
        };
    }

    /**
     * Create render vertex buffer
     */
    private createRenderVertexBuffer(): boolean {
        if (!this.gl) return false;

        // 6 vertices per particle (2 triangles = 1 quad)
        // Each vertex: (particleIndex, corner)
        const vertexData = new Float32Array(this.particleCount * 6 * 2);

        for (let i = 0; i < this.particleCount; i++) {
            for (let corner = 0; corner < 6; corner++) {
                const idx = (i * 6 + corner) * 2;
                vertexData[idx + 0] = i;        // Particle index
                vertexData[idx + 1] = corner;   // Corner ID (0-5)
            }
        }

        this.renderVertexBuffer = this.gl.createBuffer();
        if (!this.renderVertexBuffer) {
            return false;
        }

        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.renderVertexBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, vertexData, this.gl.STATIC_DRAW);

        console.log('[WebGLParticleSystem] Created render vertex buffer with', this.particleCount * 6, 'vertices');
        return true;
    }

    /**
     * Render particles as lines (no ReadPixels!)
     */
    public render(projectionMatrix: Float32Array, lineWidth: number = 5.0): void {
        if (!this.gl || !this.renderProgram || !this.renderLocations || !this.renderVertexBuffer) {
            console.error('[WebGLParticleSystem] Not ready to render');
            return;
        }

        const prevIndex = 1 - this.currentTextureIndex;
        const currIndex = this.currentTextureIndex;

        // Set viewport to match canvas
        const canvas = this.gl.canvas as HTMLCanvasElement;
        this.gl.viewport(0, 0, canvas.width, canvas.height);

        // Clear canvas
        this.gl.clearColor(0.0, 0.0, 0.0, 1.0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);

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

        // Set uniforms
        this.gl.uniformMatrix4fv(this.renderLocations.uniforms.projection, false, projectionMatrix);
        this.gl.uniform1f(this.renderLocations.uniforms.lineWidth, lineWidth);
        this.gl.uniform1f(this.renderLocations.uniforms.textureSize, this.particleTexSize);

        // Enable blending
        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

        // Draw all particles as triangles
        this.gl.drawArrays(this.gl.TRIANGLES, 0, this.particleCount * 6);

        // Disable blending
        this.gl.disable(this.gl.BLEND);
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

        // Clear previous frame data
        this.previousFrameData = null;

        this.isInitialized = false;
    }
}
