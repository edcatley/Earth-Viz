/**
 * WebGLParticleSystem - GPU-accelerated particle evolution
 * 
 * Handles particle position updates using WebGL.
 * Does NOT handle rendering - just evolves particle positions.
 */

import { Particle } from '../renderers/Particles';

const MAX_PARTICLE_AGE = 30;

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

varying vec2 v_uv; // UV coordinates from vertex shader

// Simple pseudo-random function
float random(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233)) + u_randomSeed) * 43758.5453);
}

// Look up wind at pixel position (x, y)
vec3 lookupWind(float x, float y) {
    // Convert pixel coordinates to sample indices
    float sx = (x - u_windBounds.x) / u_windSpacing;
    float sy = (y - u_windBounds.y) / u_windSpacing;
    
    // Bounds check
    if (sx < 0.0 || sx >= u_windSize.x || sy < 0.0 || sy >= u_windSize.y) {
        return vec3(0.0, 0.0, -1.0); // Invalid
    }
    
    // Sample wind field texture
    vec2 uv = vec2(sx / u_windSize.x, sy / u_windSize.y);
    vec3 wind = texture2D(u_windField, uv).rgb; // [u, v, magnitude]
    
    return wind;
}

void main() {
    // Read current particle state from texture
    vec4 particle = texture2D(u_particleState, v_uv);
    float x = particle.x;
    float y = particle.y;
    float age = particle.z;
    
    // Check if particle needs randomization
    if (age > float(${MAX_PARTICLE_AGE})) {
        // Randomize: pick random position in wind field bounds
        float rx = u_windBounds.x + random(v_uv) * u_windSize.x * u_windSpacing;
        float ry = u_windBounds.y + random(v_uv.yx) * u_windSize.y * u_windSpacing;
        float newAge = random(v_uv * 1.234) * float(${MAX_PARTICLE_AGE});
        
        gl_FragColor = vec4(rx, ry, newAge, 0.0);
    } else {
        // Evolve: lookup wind and move
        vec3 wind = lookupWind(x, y);
        
        if (wind.z < 0.0) {
            // Invalid position, age out
            gl_FragColor = vec4(x, y, float(${MAX_PARTICLE_AGE}) + 1.0, 0.0);
        } else {
            // Valid move
            float xt = x + wind.x;
            float yt = y + wind.y;
            
            // Check if new position is valid
            vec3 windAtNew = lookupWind(xt, yt);
            
            if (windAtNew.z < 0.0) {
                // New position invalid
                gl_FragColor = vec4(xt, yt, age + 1.0, 0.0);
            } else {
                // Valid move
                gl_FragColor = vec4(xt, yt, age + 1.0, 0.0);
            }
        }
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

        // Create shader program
        if (!this.createShaderProgram()) {
            console.error('[WebGLParticleSystem] Failed to create shader program');
            return false;
        }

        // Get shader locations
        this.getShaderLocations();

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
                randomSeed: this.gl.getUniformLocation(this.program, 'u_randomSeed')
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

        // Convert NaN to -999.0 for GPU
        const textureData = new Float32Array(windData.length);
        for (let i = 0; i < windData.length; i++) {
            textureData[i] = isNaN(windData[i]) ? -999.0 : windData[i];
        }

        // Check for float texture support
        const ext = this.gl.getExtension('OES_texture_float');
        if (!ext) {
            console.error('[WebGLParticleSystem] Float textures not supported');
            return false;
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
            this.gl.RGB,
            width,
            height,
            0,
            this.gl.RGB,
            this.gl.FLOAT,
            textureData
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
     */
    private createParticlePingPongTextures(particleCount: number): boolean {
        if (!this.gl) return false;

        // Calculate square texture size to fit all particles
        this.particleTexSize = Math.ceil(Math.sqrt(particleCount));

        console.log('[WebGLParticleSystem] Creating', this.particleTexSize, 'x', this.particleTexSize, 'particle textures');

        // Check for float texture support
        const floatExt = this.gl.getExtension('OES_texture_float');
        if (!floatExt) {
            console.error('[WebGLParticleSystem] Float textures not supported');
            return false;
        }

        // Create two textures and framebuffers for ping-pong
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
                this.gl.FLOAT,
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
                console.error('[WebGLParticleSystem] Framebuffer incomplete:', status);
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

        // Create initial particle data: all particles aged out to force randomization
        const data = new Float32Array(this.particleTexSize * this.particleTexSize * 4);
        for (let i = 0; i < particleCount; i++) {
            data[i * 4] = 0;     // x
            data[i * 4 + 1] = 0; // y
            data[i * 4 + 2] = MAX_PARTICLE_AGE + 1; // age (force randomization)
            data[i * 4 + 3] = 0; // unused
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
            this.gl.FLOAT,
            data
        );

        console.log('[WebGLParticleSystem] Initialized', particleCount, 'particles on GPU');
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

        console.log('[WebGLParticleSystem] Evolved particles, swapped to texture', writeIndex);
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

        // Debug: Log every 100th particle
        for (let i = 0; i < Math.min(3, this.particleCount); i += 100) {
            const idx = i * 6;
            console.log(`[WebGLParticleSystem] Particle ${i}:`, {
                x: merged[idx],
                y: merged[idx + 1],
                age: merged[idx + 2],
                xt: merged[idx + 3],
                yt: merged[idx + 4],
                magnitude: merged[idx + 5]
            });
        }

        // Save current frame for next iteration
        this.previousFrameData = newData;

        return merged;
    }

    /**
     * Read pixels from GPU framebuffer
     * Returns Float32Array with stride 4: [x, y, age, magnitude]
     */
    private readPixelsFromGPU(): Float32Array {
        if (!this.gl) return new Float32Array(0);

        // Bind the current particle state framebuffer
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffers[this.currentTextureIndex]);

        // Allocate buffer for readback (stride 4: RGBA)
        const pixels = new Float32Array(this.particleTexSize * this.particleTexSize * 4);

        // Read pixels from framebuffer
        this.gl.readPixels(
            0,
            0,
            this.particleTexSize,
            this.particleTexSize,
            this.gl.RGBA,
            this.gl.FLOAT,
            pixels
        );

        // Unbind framebuffer
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);

        return pixels;
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

        // Clear previous frame data
        this.previousFrameData = null;

        this.isInitialized = false;
    }
}
