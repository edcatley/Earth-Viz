/**
 * WebGLParticleSystem - GPU-accelerated particle evolution
 * 
 * Handles particle position updates using WebGL.
 * Does NOT handle rendering - just evolves particle positions.
 */

import { Particle } from '../renderers/Particles';

const MAX_PARTICLE_AGE = 30;

// Vertex shader - evolves particle positions
const VERTEX_SHADER = `
precision highp float;

attribute vec3 a_particle; // [x, y, age]

uniform sampler2D u_windField;
uniform vec2 u_windBounds;    // [x, y] offset
uniform vec2 u_windSize;      // [width, height] in samples  
uniform float u_windSpacing;
uniform float u_randomSeed;

varying vec3 v_particle; // Output: [new_x, new_y, new_age]

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
    float x = a_particle.x;
    float y = a_particle.y;
    float age = a_particle.z;
    
    // Check if particle needs randomization
    if (age > float(${MAX_PARTICLE_AGE})) {
        // Randomize: pick random position in wind field bounds
        float rx = u_windBounds.x + random(vec2(x, y)) * u_windSize.x * u_windSpacing;
        float ry = u_windBounds.y + random(vec2(y, x)) * u_windSize.y * u_windSpacing;
        float newAge = random(vec2(x + y, y - x)) * float(${MAX_PARTICLE_AGE});
        
        v_particle = vec3(rx, ry, newAge);
    } else {
        // Evolve: lookup wind and move
        vec3 wind = lookupWind(x, y);
        
        if (wind.z < 0.0) {
            // Invalid position, age out
            v_particle = vec3(x, y, float(${MAX_PARTICLE_AGE}) + 1.0);
        } else {
            // Valid move
            float xt = x + wind.x;
            float yt = y + wind.y;
            
            // Check if new position is valid
            vec3 windAtNew = lookupWind(xt, yt);
            
            if (windAtNew.z < 0.0) {
                // New position invalid
                v_particle = vec3(xt, yt, age + 1.0);
            } else {
                // Valid move
                v_particle = vec3(xt, yt, age + 1.0);
            }
        }
    }
    
    // Output (not used for actual rendering, just for transform feedback)
    gl_Position = vec4(v_particle, 1.0);
    gl_PointSize = 1.0;
}
`;

// Fragment shader - minimal, just passes through
const FRAGMENT_SHADER = `
precision mediump float;

varying vec3 v_particle;

void main() {
    // Output particle state as color
    gl_FragColor = vec4(v_particle, 1.0);
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
    private particleBuffer: WebGLBuffer | null = null;
    private particleCount = 0;

    // Shader locations
    private locations: {
        attributes: {
            particle: number;
        };
        uniforms: {
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
                particle: this.gl.getAttribLocation(this.program, 'a_particle')
            },
            uniforms: {
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
        validPositions: Array<[number, number]>
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

        // Create particle buffer
        if (!this.createParticleBuffer(particleCount)) {
            return false;
        }

        console.log('[WebGLParticleSystem] Setup complete', {
            particles: particleCount,
            windSamples: windBounds.width * windBounds.height,
            validPositions: validPositions.length
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
     * Create particle buffer with initial random positions
     */
    private createParticleBuffer(particleCount: number): boolean {
        if (!this.gl) return false;

        // Initialize all particles with age > MAX to force randomization on first frame
        const data = new Float32Array(particleCount * 3);
        for (let i = 0; i < particleCount; i++) {
            data[i * 3] = 0;     // x (will be randomized)
            data[i * 3 + 1] = 0; // y (will be randomized)
            data[i * 3 + 2] = MAX_PARTICLE_AGE + 1; // age (force randomization)
        }

        this.particleBuffer = this.gl.createBuffer();
        if (!this.particleBuffer) {
            console.error('[WebGLParticleSystem] Failed to create particle buffer');
            return false;
        }

        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.particleBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, data, this.gl.DYNAMIC_DRAW);

        console.log('[WebGLParticleSystem] Created particle buffer:', particleCount, 'particles');
        return true;
    }

    /**
     * Evolve particles for one frame (GPU-accelerated)
     */
    public evolve(): void {
        if (!this.gl || !this.program || !this.locations || !this.windBounds) {
            console.error('[WebGLParticleSystem] Not ready to evolve');
            return;
        }

        // Use shader program
        this.gl.useProgram(this.program);

        // Bind particle buffer
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.particleBuffer);
        this.gl.enableVertexAttribArray(this.locations.attributes.particle);
        this.gl.vertexAttribPointer(
            this.locations.attributes.particle,
            3, // 3 components: x, y, age
            this.gl.FLOAT,
            false,
            0,
            0
        );

        // Bind wind texture
        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.windTexture);
        this.gl.uniform1i(this.locations.uniforms.windField, 0);

        // Set uniforms
        this.gl.uniform2f(this.locations.uniforms.windBounds, this.windBounds.x, this.windBounds.y);
        this.gl.uniform2f(this.locations.uniforms.windSize, this.windBounds.width, this.windBounds.height);
        this.gl.uniform1f(this.locations.uniforms.windSpacing, this.windBounds.spacing);
        this.gl.uniform1f(this.locations.uniforms.randomSeed, Math.random());

        // Draw particles (this runs the vertex shader for each particle)
        this.gl.drawArrays(this.gl.POINTS, 0, this.particleCount);
    }

    /**
     * Get current particle positions (reads back from GPU)
     */
    public getParticles(): Particle[] {
        if (!this.gl || !this.isInitialized) {
            console.error('[WebGLParticleSystem] Not ready to read particles');
            return [];
        }

        // TODO: Implement
        return [];
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

        if (this.particleBuffer) {
            this.gl.deleteBuffer(this.particleBuffer);
            this.particleBuffer = null;
        }

        if (this.windTexture) {
            this.gl.deleteTexture(this.windTexture);
            this.windTexture = null;
        }

        if (this.program) {
            this.gl.deleteProgram(this.program);
            this.program = null;
        }

        this.isInitialized = false;
    }
}
