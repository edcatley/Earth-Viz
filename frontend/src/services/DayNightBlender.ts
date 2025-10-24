/**
 * DayNightBlender - WebGL-based real-time day/night terminator blending
 * 
 * Takes pre-loaded day and night earth images and blends them based on current solar position.
 * Uses GPU for efficient blending, outputs a canvas that can be used as a texture.
 * 
 * Usage:
 * ```typescript
 * const blender = new DayNightBlender(2048, 1024);
 * 
 * // Load images separately (caller's responsibility)
 * const dayImg = await loadImage('https://clouds.matteason.co.uk/images/2048x1024/earth.jpg');
 * const nightImg = await loadImage('https://clouds.matteason.co.uk/images/2048x1024/earth-night.jpg');
 * 
 * // Blend with current solar position
 * const blendedCanvas = blender.blend(dayImg, nightImg);
 * 
 * // Use as texture source
 * renderer.setup('planet', blendedCanvas, 'earth-realtime', globe);
 * 
 * // Clean up
 * blender.dispose();
 * ```
 */

export class DayNightBlender {
    private canvas: HTMLCanvasElement;
    private gl: WebGL2RenderingContext | null = null;
    private program: WebGLProgram | null = null;
    private vertexBuffer: WebGLBuffer | null = null;
    private dayTexture: WebGLTexture | null = null;
    private nightTexture: WebGLTexture | null = null;

    constructor(width: number = 2048, height: number = 1024) {
        this.canvas = document.createElement('canvas');
        this.canvas.width = width;
        this.canvas.height = height;
        
        const gl = this.canvas.getContext('webgl2');
        if (!gl) {
            throw new Error('WebGL2 not supported');
        }
        this.gl = gl;
        
        this.initialize();
    }

    private initialize(): void {
        if (!this.gl) return;

        const gl = this.gl;

        // Vertex shader - simple fullscreen quad
        const vertexShaderSource = `#version 300 es
            in vec2 a_position;
            out vec2 v_texCoord;
            
            void main() {
                v_texCoord = vec2(a_position.x * 0.5 + 0.5, 1.0 - (a_position.y * 0.5 + 0.5));
                gl_Position = vec4(a_position, 0.0, 1.0);
            }
        `;

        // Fragment shader - terminator blending
        const fragmentShaderSource = `#version 300 es
            precision highp float;
            
            in vec2 v_texCoord;
            out vec4 fragColor;
            
            uniform sampler2D u_dayTexture;
            uniform sampler2D u_nightTexture;
            uniform float u_solarLat;  // Solar latitude in radians
            uniform float u_solarLon;  // Solar longitude in radians
            
            const float PI = 3.14159265359;
            
            void main() {
                // Convert texture coordinates to lat/lon
                float lon = (v_texCoord.x * 2.0 - 1.0) * PI;  // -PI to PI
                float lat = (0.5 - v_texCoord.y) * PI;        // -PI/2 to PI/2
                
                // Calculate solar zenith angle using spherical law of cosines
                float cosZenith = sin(lat) * sin(u_solarLat) + 
                                  cos(lat) * cos(u_solarLat) * cos(lon - u_solarLon);
                
                float zenith = acos(clamp(cosZenith, -1.0, 1.0));
                
                // Create smooth transition around terminator (90 degrees = PI/2)
                // Full day when zenith < 80°, full night when zenith > 100°
                float dayFactor = smoothstep(1.745, 1.396, zenith);  // 100° to 80° in radians
                
                // Sample both textures
                vec4 dayColor = texture(u_dayTexture, v_texCoord);
                vec4 nightColor = texture(u_nightTexture, v_texCoord);
                
                // Blend based on day factor
                fragColor = mix(nightColor, dayColor, dayFactor);
            }
        `;

        // Compile shaders
        const vertexShader = this.compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = this.compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
        
        if (!vertexShader || !fragmentShader) {
            throw new Error('Failed to compile shaders');
        }

        // Create program
        const program = gl.createProgram();
        if (!program) {
            throw new Error('Failed to create program');
        }
        
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            const info = gl.getProgramInfoLog(program);
            throw new Error('Failed to link program: ' + info);
        }

        this.program = program;

        // Create fullscreen quad
        const vertices = new Float32Array([
            -1, -1,
             1, -1,
            -1,  1,
             1,  1
        ]);

        this.vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    }

    private compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
        const shader = gl.createShader(type);
        if (!shader) return null;

        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }

        return shader;
    }

    private createTextureFromImage(gl: WebGL2RenderingContext, image: HTMLImageElement | HTMLCanvasElement): WebGLTexture | null {
        const texture = gl.createTexture();
        if (!texture) return null;

        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        
        // Use linear filtering for smooth blending
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        return texture;
    }

    private calculateSolarPosition(date: Date): { lat: number; lon: number } {
        // Days since J2000.0 (January 1, 2000, 12:00 UTC)
        const j2000 = new Date(Date.UTC(2000, 0, 1, 12, 0, 0));
        const n = (date.getTime() - j2000.getTime()) / 86400000;

        // Mean longitude of the Sun
        const L = (280.460 + 0.9856474 * n) % 360;

        // Mean anomaly
        const g = (357.528 + 0.9856003 * n) % 360;
        const gRad = (g * Math.PI) / 180;

        // Ecliptic longitude
        const lambda = L + 1.915 * Math.sin(gRad) + 0.020 * Math.sin(2 * gRad);
        const lambdaRad = (lambda * Math.PI) / 180;

        // Obliquity of the ecliptic
        const epsilon = 23.439 - 0.0000004 * n;
        const epsilonRad = (epsilon * Math.PI) / 180;

        // Solar declination (latitude)
        const solarLat = Math.asin(Math.sin(epsilonRad) * Math.sin(lambdaRad));

        // Solar right ascension
        const ra = Math.atan2(Math.cos(epsilonRad) * Math.sin(lambdaRad), Math.cos(lambdaRad));

        // Greenwich Mean Sidereal Time
        const gmst = ((18.697374558 + 24.06570982441908 * n) % 24) * 15 * (Math.PI / 180);

        // Solar longitude
        let solarLon = ra - gmst;

        // Normalize to -PI to PI
        while (solarLon > Math.PI) solarLon -= 2 * Math.PI;
        while (solarLon < -Math.PI) solarLon += 2 * Math.PI;

        return { lat: solarLat, lon: solarLon };
    }

    /**
     * Blend day and night textures with real-time terminator
     * @param dayImage Pre-loaded day earth image or canvas
     * @param nightImage Pre-loaded night earth image or canvas
     * @param date Optional date for solar position (defaults to now)
     * @returns Promise<HTMLImageElement> with blended result
     */
    public async blend(dayImage: HTMLImageElement | HTMLCanvasElement, nightImage: HTMLImageElement | HTMLCanvasElement, date?: Date): Promise<HTMLImageElement> {
        if (!this.gl || !this.program) {
            throw new Error('WebGL not initialized');
        }

        const gl = this.gl;

        // Create textures from images
        console.log('Creating textures from images...');
        const dayTexture = this.createTextureFromImage(gl, dayImage);
        const nightTexture = this.createTextureFromImage(gl, nightImage);

        if (!dayTexture || !nightTexture) {
            throw new Error('Failed to create textures');
        }

        this.dayTexture = dayTexture;
        this.nightTexture = nightTexture;

        // Calculate solar position
        const currentDate = date || new Date();
        const solar = this.calculateSolarPosition(currentDate);
        console.log(`Solar position: ${(solar.lat * 180 / Math.PI).toFixed(2)}° lat, ${(solar.lon * 180 / Math.PI).toFixed(2)}° lon`);

        // Render
        gl.useProgram(this.program);

        // Set up vertex attributes
        const positionLoc = gl.getAttribLocation(this.program, 'a_position');
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.enableVertexAttribArray(positionLoc);
        gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

        // Set uniforms
        const dayTexLoc = gl.getUniformLocation(this.program, 'u_dayTexture');
        const nightTexLoc = gl.getUniformLocation(this.program, 'u_nightTexture');
        const solarLatLoc = gl.getUniformLocation(this.program, 'u_solarLat');
        const solarLonLoc = gl.getUniformLocation(this.program, 'u_solarLon');

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, dayTexture);
        gl.uniform1i(dayTexLoc, 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, nightTexture);
        gl.uniform1i(nightTexLoc, 1);

        gl.uniform1f(solarLatLoc, solar.lat);
        gl.uniform1f(solarLonLoc, solar.lon);

        // Draw
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        console.log('Day/night blend complete');
        
        // Convert canvas to image
        return new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = this.canvas.toDataURL('image/png');
        });
    }

    /**
     * Clean up WebGL resources
     */
    public dispose(): void {
        if (!this.gl) return;

        if (this.dayTexture) this.gl.deleteTexture(this.dayTexture);
        if (this.nightTexture) this.gl.deleteTexture(this.nightTexture);
        if (this.vertexBuffer) this.gl.deleteBuffer(this.vertexBuffer);
        if (this.program) this.gl.deleteProgram(this.program);

        this.gl = null;
    }
}
