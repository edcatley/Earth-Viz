/**
 * WebGL Mesh Renderer - GPU-accelerated rendering of geographic mesh data
 * 
 * Handles coastlines, lakes, rivers with GPU projection and LOD support
 */

import { Globe } from '../core/Globes';

// Base vertex shader for mesh rendering
// Orthographic projection shader (copy from WebGLRenderer)
const ORTHOGRAPHIC_PROJECTION = `
uniform vec2 u_translate;
uniform float u_R2;
uniform float u_lon0;
uniform float u_sinlat0;
uniform float u_Rcoslat0;
uniform float u_coslat0dR;
uniform float u_flip;

vec2 project(in vec2 coord) {
    float lon = coord.x;
    float lat = coord.y;
    
    // Orthographic forward projection math (same as WebGLRenderer invert, but forward)
    float coslat = cos(lat);
    float sinlat = sin(lat);
    float coslon = cos(lon - u_lon0);
    float sinlon = sin(lon - u_lon0);
    
    // Calculate horizon distance 
    float cosc = u_sinlat0 * sinlat + u_coslat0dR * sqrt(u_R2) * coslat * coslon;
    
    if (cosc < 0.0) {
        return vec2(NIL); // Back-side point
    }
    
    // Forward projection
    float x = sqrt(u_R2) * coslat * sinlon;
    float y = sqrt(u_R2) * (u_coslat0dR * sqrt(u_R2) * sinlat - u_sinlat0 * coslat * coslon);
    
    // Apply flip and translate
    vec2 projected = vec2(x, y) * u_flip + u_translate;
    
    return projected;
}
`;

// Equirectangular projection shader - forward projection with rotation
const EQUIRECTANGULAR_PROJECTION = `
uniform vec2 u_translate;
uniform float u_R;
uniform float u_lon0;
uniform float u_sinlat0;
uniform float u_coslat0;
uniform float u_singam0;
uniform float u_cosgam0;

const vec2 BOUNDS = vec2(PI, PI / 2.0);

vec2 project(in vec2 coord) {
    float lon = coord.x;
    float lat = coord.y;
    
    // Apply rotation
    lon -= u_lon0;
    
    // Apply 3D rotation if gamma is involved (complex equirectangular)
    float coslat = cos(lat);
    float sinlat = sin(lat);
    float coslon = cos(lon);
    float sinlon = sin(lon);
    
    // 3D rotation matrix application
    float x = coslon * coslat;
    float y = sinlon * coslat; 
    float z = sinlat;
    
    // Apply latitude rotation
    float t = z * u_cosgam0 - y * u_singam0;
    float u = y * u_cosgam0 + z * u_singam0;
    float v = x * u_coslat0 + t * u_sinlat0;
    float w = t * u_coslat0 - x * u_sinlat0;
    
    // Convert back to lon/lat
    float rotated_lon = atan(u, v);
    float rotated_lat = asin(clamp(w, -1.0, 1.0));
    

    
    // Simple equirectangular projection: x = R * lon, y = R * lat
    vec2 projected = vec2(
        u_R * rotated_lon + u_translate.x,
        u_translate.y + u_R * rotated_lat  // Flip Y for screen coordinates
    );
    
    return projected;
}
`;

const BASE_VERTEX_SHADER = `
precision mediump float;

attribute vec2 a_lonlat;       // This vertex's longitude/latitude coordinates
attribute vec2 a_lonlat_other; // The other endpoint's longitude/latitude coordinates
attribute vec2 a_offset;       // Local geometry offset for line width
uniform vec2 u_viewport;       // Viewport size [width, height]
uniform float u_lineWidth;     // Line width in pixels

varying vec2 v_lonlat;         // Pass through for debugging
varying float v_cosc;          // Pass horizon distance to fragment shader
varying vec2 v_screenPos;      // Pass screen position to fragment shader

const float PI = 3.14159265;
const float NIL = -999999.0;

@PROJECTION_SHADER@

void main() {
    v_lonlat = a_lonlat;
    
    // Convert lat/lon to radians for projection
    vec2 coord = a_lonlat * PI / 180.0;
    
    // Project coordinate to screen space using selected projection
    vec2 projected = project(coord);
    
    // Check for invalid coordinates (back-side points or out of bounds)
    if (projected.x == NIL || projected.y == NIL) {
        gl_Position = vec4(0.0, 0.0, 0.0, 0.0);
        v_cosc = -1.0;
        return;
    }
    
    // Project the other endpoint to detect wrapping
    vec2 coord_other = a_lonlat_other * PI / 180.0;
    vec2 projected_other = project(coord_other);
    
    // Check if line segment wraps (too long in screen space)
    if (projected_other.x != NIL && projected_other.y != NIL) {
        float segmentLength = distance(projected, projected_other);
        
        // If segment is more than half the screen width, it's wrapping
        if (segmentLength > u_viewport.x * 0.5) {
            // Degenerate this vertex to prevent rendering
            gl_Position = vec4(0.0, 0.0, 0.0, 0.0);
            v_cosc = -1.0;
            return;
        }
    }
    
    // Apply line width offset in screen space
    vec2 finalPos = projected + a_offset * u_lineWidth;
    
    // Pass screen position to fragment shader for primitive discard
    v_screenPos = finalPos;
    
    // Convert to normalized device coordinates [-1, 1]
    vec2 ndc = vec2(
        (finalPos.x / u_viewport.x) * 2.0 - 1.0,
        (finalPos.y / u_viewport.y) * 2.0 - 1.0
    );
    
    gl_Position = vec4(ndc, 0.0, 1.0);
    v_cosc = 1.0; // Set in projection function
}
`;


const MESH_FRAGMENT_SHADER = `
precision mediump float;

uniform vec3 u_color;         // Line/fill color
uniform float u_opacity;      // Opacity
uniform vec2 u_viewport;      // Viewport size for wrapping detection
varying vec2 v_lonlat;        // For debugging
varying float v_cosc;         // Horizon distance from vertex shader
varying vec2 v_screenPos;     // Screen position from vertex shader

void main() {
    if (v_cosc < 0.0) {
        discard;
    }
    
    // Simple brutal approach: discard anything too far outside viewport bounds
    // This catches most wrapping without needing derivatives
    if (v_screenPos.x < -u_viewport.x * 0.2 || v_screenPos.x > u_viewport.x * 1.2 ||
        v_screenPos.y < -u_viewport.y * 0.2 || v_screenPos.y > u_viewport.y * 1.2) {
        discard;
    }
    
    gl_FragColor = vec4(u_color, u_opacity);
}
`;

interface MeshGeometry {
    vertices: Float32Array;     // [lon, lat, offsetX, offsetY, lon, lat, offsetX, offsetY, ...]
    indices: Uint16Array | Uint32Array;       // Triangle indices
    vertexCount: number;
    primitiveType: number;      // GL_LINES, GL_TRIANGLES, etc.
}

interface MeshBuffer {
    vertexBuffer: WebGLBuffer;
    indexBuffer: WebGLBuffer | null;
    geometry: MeshGeometry;
    name: string;
    style: { color: [number, number, number]; lineWidth: number; opacity: number };
}

export class WebGLMeshRenderer {
    private gl: WebGLRenderingContext | null = null;
    private program: WebGLProgram | null = null;
    private supportsUint32Indices: boolean = false;
    
    // Attribute/uniform locations
    private locations: {
        attributes: {
            lonlat: number;
            lonlat_other: number;
            offset: number;
        };
        uniforms: {
            projection: WebGLUniformLocation | null;
            viewport: WebGLUniformLocation | null;
            lineWidth: WebGLUniformLocation | null;
            color: WebGLUniformLocation | null;
            opacity: WebGLUniformLocation | null;
            // Orthographic projection uniforms (same as overlay system)
            translate: WebGLUniformLocation | null;
            R2: WebGLUniformLocation | null;
            lon0: WebGLUniformLocation | null;
            sinlat0: WebGLUniformLocation | null;
            Rcoslat0: WebGLUniformLocation | null;
            coslat0dR: WebGLUniformLocation | null;
            flip: WebGLUniformLocation | null;
            // Equirectangular-specific uniforms
            R: WebGLUniformLocation | null;
            coslat0: WebGLUniformLocation | null;
            singam0: WebGLUniformLocation | null;
            cosgam0: WebGLUniformLocation | null;
        };
    } | null = null;
    
    // Mesh buffers
    private meshBuffers: Map<string, MeshBuffer> = new Map();
    
    // State
    private isInitialized = false;
    private currentProjectionType: 'orthographic' | 'equirectangular' | null = null;


    constructor() {
        console.log('[WebGLMeshRenderer] Created');
    }

    /**
     * Initialize WebGL context and shaders
     */
    public initialize(gl: WebGLRenderingContext): boolean {
        this.gl = gl;
        
        if (!this.gl) {
            console.error('[WebGLMeshRenderer] WebGL not supported');
            return false;
        }

        // Check for 32-bit index support
        const ext = this.gl.getExtension('OES_element_index_uint');
        this.supportsUint32Indices = !!ext;
        console.log('[WebGLMeshRenderer] 32-bit indices supported:', this.supportsUint32Indices);

        this.isInitialized = true;
        console.log('[WebGLMeshRenderer] Initialized (shaders will be compiled during setup)');
        return true;
    }

    /**
     * Check if a projection is supported by this renderer
     */
    private isProjectionSupported(globe?: Globe): boolean {
        if (!globe) return true; // Default to orthographic
        
        const projectionType = (globe as any).projectionType;
        
        // Currently only orthographic is fully supported
        // Equirectangular has wrapping issues that need to be fixed
        const supportedProjections = ['orthographic', 'equirectangular'];
        
        return supportedProjections.includes(projectionType);
    }


    /**
     * Setup mesh renderer with data (heavy operation - done once)
     * Loads all mesh buffers into GPU memory
     */
    public setup(meshData: any, globe: Globe): boolean {
        if (!this.gl || !this.isInitialized) {
            console.error('[WebGLMeshRenderer] Not initialized');
            return false;
        }

        try {
            console.log('[WebGLMeshRenderer] Setting up mesh data');

            // Determine projection type and check if supported
            const projectionType = this.getProjectionType(globe);
            console.log('[WebGLMeshRenderer] Projection type:', projectionType);
            
            // Check if this projection is supported
            if (!this.isProjectionSupported(globe)) {
                console.log('[WebGLMeshRenderer] Projection not supported:', (globe as any).projectionType);
                return false;
            }
            
            // Compile shaders for this projection
            if (!this.createShaderProgram(projectionType)) {
                console.error('[WebGLMeshRenderer] Failed to create shader program');
                return false;
            }
            
            this.currentProjectionType = projectionType;

            // Get attribute and uniform locations
            this.getShaderLocations();

            // Set up WebGL state
            this.setupWebGLState();

            // Get mesh styles (could be passed in or use defaults)
            const styles = {
                coastlines: { color: [0.98, 0.98, 0.98] as [number, number, number], lineWidth: 8.0, opacity: 0.65 },
                lakes: { color: [0.86, 0.86, 0.86] as [number, number, number], lineWidth: 6.0, opacity: 0.65 },
                rivers: { color: [0.86, 0.86, 0.86] as [number, number, number], lineWidth: 4.0, opacity: 0.65 }
            };

            // Load mesh data into buffers
            if (meshData.coastLo) this.loadMeshData(meshData.coastLo, 'coastlines', styles.coastlines);
            if (meshData.lakesLo) this.loadMeshData(meshData.lakesLo, 'lakes', styles.lakes);
            if (meshData.riversLo) this.loadMeshData(meshData.riversLo, 'rivers', styles.rivers);

            console.log('[WebGLMeshRenderer] Setup complete');
            return true;

        } catch (error) {
            console.error('[WebGLMeshRenderer] Setup failed:', error);
            return false;
        }
    }

    /**
     * Load GeoJSON mesh data into WebGL buffers (private - called by setup)
     */
    private loadMeshData(geojson: any, name: string, style: { color: [number, number, number]; lineWidth: number; opacity: number }): boolean {
        if (!this.gl || !this.isInitialized) {
            console.error('[WebGLMeshRenderer] Not initialized');
            return false;
        }

        try {
            // Convert GeoJSON to geometry
            const geometry = this.geojsonToGeometry(geojson);
            
            // Create WebGL buffers
            const buffer = this.createMeshBuffer(geometry, name, style);
            if (!buffer) {
                console.error(`[WebGLMeshRenderer] Failed to create buffer for ${name}`);
                return false;
            }

            this.meshBuffers.set(name, buffer);
            
            console.log(`[WebGLMeshRenderer] Successfully loaded ${name}:`, {
                vertices: geometry.vertexCount,
                primitiveType: geometry.primitiveType === this.gl!.LINES ? 'LINES' : 'TRIANGLES'
            });

            return true;
        } catch (error) {
            console.error(`[WebGLMeshRenderer] Error loading ${name}:`, error);
            if (error instanceof Error) {
                console.error('Stack trace:', error.stack);
            }
            return false;
        }
    }

    /**
     * Render all loaded meshes (lightweight operation - done every frame)
     */
    public render(gl: WebGLRenderingContext, globe: Globe, viewport: [number, number]): boolean {
        if (!this.program || !this.locations || !this.isInitialized) {
            console.error('[WebGLMeshRenderer] Not properly initialized');
            return false;
        }

        if (!globe.projection) {
            console.error('[WebGLMeshRenderer] Globe has no projection');
            return false;
        }

        // Use the shader program
        gl.useProgram(this.program);

        // Set up viewport
        gl.viewport(0, 0, viewport[0], viewport[1]);

        // Set uniforms
        this.setUniforms(gl, globe, viewport);

        // Enable blending for transparency
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        // Render all loaded meshes
        let rendered = 0;
        for (const buffer of this.meshBuffers.values()) {
            this.renderMeshBuffer(gl, buffer);
            rendered++;
        }

        // Clean up: disable blending so we don't affect other systems
        //gl.disable(gl.BLEND);

        return rendered > 0;
    }

    /**
     * Convert GeoJSON to WebGL geometry - SIMPLIFIED VERSION
     */
    private geojsonToGeometry(geojson: any): MeshGeometry {
        const vertices: number[] = [];
        const indices: number[] = [];
        
        // Just get the geometries array, don't be clever
        let geometries: any[] = [];
        if (geojson.features) {
            geometries = geojson.features.map((f: any) => f.geometry).filter((g: any) => g);
        } else if (geojson.geometries) {
            geometries = geojson.geometries;
        } else if (geojson.type && geojson.coordinates) {
            geometries = [geojson];
        }

        let vertexIndex = 0;
        let processedCount = 0;
        let skippedCount = 0;

        // Process each geometry
        for (let i = 0; i < geometries.length; i++) {
            const geometry = geometries[i];
            if (!geometry?.type || !geometry?.coordinates) {
                skippedCount++;
                continue;
            }

            if (geometry.type === 'MultiPolygon') {
                // MultiPolygon: array of polygons
                for (const polygon of geometry.coordinates) {
                    if (polygon.length > 0) {
                        // Just take the exterior ring (first ring)
                        const ring = polygon[0];
                        const result = this.lineToQuadToTriangle(ring, vertices, indices, vertexIndex);
                        vertexIndex = result.newVertexIndex;
                    }
                }
                processedCount++;
            } else if (geometry.type === 'Polygon') {
                // Polygon: take exterior ring
                if (geometry.coordinates.length > 0) {
                    const ring = geometry.coordinates[0];
                    const result = this.lineToQuadToTriangle(ring, vertices, indices, vertexIndex);
                    vertexIndex = result.newVertexIndex;
                }
                processedCount++;
            } else if (geometry.type === 'LineString') {
                // LineString: single line
                const result = this.lineToQuadToTriangle(geometry.coordinates, vertices, indices, vertexIndex);
                vertexIndex = result.newVertexIndex;
                processedCount++;
            } else if (geometry.type === 'MultiLineString') {
                // MultiLineString: array of lines
                for (const line of geometry.coordinates) {
                    const result = this.lineToQuadToTriangle(line, vertices, indices, vertexIndex);
                    vertexIndex = result.newVertexIndex;
                }
                processedCount++;
            } else {
                skippedCount++;
            }
        }

        // Use 32-bit indices if supported
        if (!this.supportsUint32Indices) {
            console.error(`[WebGLMeshRenderer] 32-bit indices not supported, rendering will be broken`);
        }

        return {
            vertices: new Float32Array(vertices),
            indices: new Uint32Array(indices),
            vertexCount: vertices.length / 6,  // 6 floats per vertex now
            primitiveType: this.gl!.TRIANGLES
        };
    }

    /**
     * Convert line string coordinates to quad geometry, then triangulate
     * Each line segment becomes a quad (4 vertices) then 2 triangles (6 indices)
     */
    private lineToQuadToTriangle(coordinates: number[][], vertices: number[], indices: number[], vertexIndex: number): { newVertexIndex: number } {
        if (coordinates.length < 2) return { newVertexIndex: vertexIndex };

        // Make triangles for each line segment with proper line width
        for (let i = 0; i < coordinates.length - 1; i++) {
            const [lon1, lat1] = coordinates[i];
            const [lon2, lat2] = coordinates[i + 1];
            
            // Calculate normalized perpendicular offset (shader will scale by u_lineWidth)
            const dx = lon2 - lon1;
            const dy = lat2 - lat1;
            const len = Math.sqrt(dx * dx + dy * dy);
            
            let perpX, perpY;
            if (len > 1e-10) { // Avoid division by zero
                // Perpendicular vector, normalized to unit length.
                //multiply by 0.1 to make the line width thinner so the passed thickness is dominant factor
                perpX = (-dy / len) * 0.1;
                perpY = (dx / len) * 0.1;
            } else {
                // Degenerate case: identical points
                perpX = 1.0;
                perpY = 0.0;
            }

            const baseIndex = vertexIndex;

            // 4 vertices per line segment (quad)
            // Each vertex: [lon, lat, lon_other, lat_other, offsetX, offsetY]
            
            // Vertices at point 1 (know about point 2)
            vertices.push(lon1, lat1, lon2, lat2, perpX, perpY);      // v0
            vertices.push(lon1, lat1, lon2, lat2, -perpX, -perpY);    // v1
            
            // Vertices at point 2 (know about point 1)
            vertices.push(lon2, lat2, lon1, lat1, perpX, perpY);      // v2
            vertices.push(lon2, lat2, lon1, lat1, -perpX, -perpY);    // v3

            // 2 triangles per quad
            indices.push(
                baseIndex, baseIndex + 1, baseIndex + 2,     // tri 1
                baseIndex + 1, baseIndex + 3, baseIndex + 2  // tri 2
            );
            
            vertexIndex += 4; // Update for next iteration
        }
        
        return { newVertexIndex: vertexIndex };
    }

    /**
     * Create WebGL buffers for geometry
     */
    private createMeshBuffer(geometry: MeshGeometry, name: string, style: { color: [number, number, number]; lineWidth: number; opacity: number }): MeshBuffer | null {
        if (!this.gl) return null;
        // Create vertex buffer
        const vertexBuffer = this.gl.createBuffer();
        if (!vertexBuffer) {
            console.error(`[WebGLMeshRenderer] Failed to create vertex buffer for ${name}`);
            return null;
        }

        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, vertexBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, geometry.vertices, this.gl.STATIC_DRAW);

        // Create index buffer
        let indexBuffer: WebGLBuffer | null = null;
        if (geometry.indices.length > 0) {
            indexBuffer = this.gl.createBuffer();
            if (indexBuffer) {
                this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
                this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, geometry.indices, this.gl.STATIC_DRAW);
            }
        }
        return {
            vertexBuffer,
            indexBuffer,
            geometry,
            name,
            style
        };
    }

    /**
     * Render a single mesh buffer
     */
    private renderMeshBuffer(gl: WebGLRenderingContext, buffer: MeshBuffer): void {
        if (!this.locations) return;

        // Bind vertex buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer.vertexBuffer);

        // Set up vertex attributes
        // Each vertex is now 6 floats: [lon, lat, lon_other, lat_other, offsetX, offsetY]
        const stride = 24; // 6 floats * 4 bytes

        // lonlat attribute (2 floats at offset 0)
        gl.enableVertexAttribArray(this.locations.attributes.lonlat);
        gl.vertexAttribPointer(this.locations.attributes.lonlat, 2, gl.FLOAT, false, stride, 0);

        // lonlat_other attribute (2 floats at offset 8)
        gl.enableVertexAttribArray(this.locations.attributes.lonlat_other);
        gl.vertexAttribPointer(this.locations.attributes.lonlat_other, 2, gl.FLOAT, false, stride, 8);

        // offset attribute (2 floats at offset 16)
        gl.enableVertexAttribArray(this.locations.attributes.offset);
        gl.vertexAttribPointer(this.locations.attributes.offset, 2, gl.FLOAT, false, stride, 16);

        // Set mesh-specific uniforms
        this.setMeshUniforms(gl, buffer);

        // Draw
        if (buffer.indexBuffer && buffer.geometry.indices.length > 0) {
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer.indexBuffer);
            gl.drawElements(buffer.geometry.primitiveType, buffer.geometry.indices.length, gl.UNSIGNED_INT, 0);
        } else {
            gl.drawArrays(buffer.geometry.primitiveType, 0, buffer.geometry.vertexCount);
        }
    }

    /**
     * Set uniforms for rendering
     */
    /**
     * Get the current projection type that was set during initialization
     */
    public getCurrentProjectionType(): 'orthographic' | 'equirectangular' | null {
        return this.currentProjectionType;
    }

    /**
     * Determine projection type from globe (same logic as other WebGL systems)
     */
    private getProjectionType(globe: Globe): 'orthographic' | 'equirectangular' {
        const projectionType = (globe as any).projectionType;
        
        switch (projectionType) {
            case 'equirectangular':
                return 'equirectangular';
            case 'orthographic':
                return 'orthographic';
            case 'azimuthal_equidistant':
            case 'conic_equidistant':
            case 'stereographic':
                return 'orthographic';  // Similar sphere-like projections
            case 'atlantis':
            case 'waterman':
            case 'winkel3':
                return 'equirectangular';  // Flat map-like projections
            default:
                console.log('[WebGLMeshRenderer] Unknown projection type:', projectionType, 'defaulting to orthographic');
                return 'orthographic';
        }
    }

    private setUniforms(gl: WebGLRenderingContext, globe: Globe, viewport: [number, number]): void {
        if (!this.locations || !globe.projection) return;

        const projectionType = this.getProjectionType(globe);
        const rotate = globe.projection.rotate() || [0, 0, 0];
        const scale = globe.projection.scale() || 150;
        const translate = globe.projection.translate() || [viewport[0] / 2, viewport[1] / 2];
        
        // Identity matrix (not used but required by shader)
        const identityMatrix = new Float32Array([
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1
        ]);
        
        // Set common uniforms
        gl.uniformMatrix4fv(this.locations.uniforms.projection, false, identityMatrix);
        gl.uniform2f(this.locations.uniforms.viewport, viewport[0], viewport[1]);
        gl.uniform2f(this.locations.uniforms.translate, translate[0], translate[1]);
        // Projection type will be handled by setting different uniforms for each type
        
        if (projectionType === 'orthographic') {
            // Orthographic projection with pole-crossing logic (same as overlay system)
            let λ0 = rotate[0];
            let φ0 = rotate[1];
            
            // Helper function from overlay system
            const qe = (value: number, range: number) => ((value % range) + range) % range;
            
            let i = qe(φ0 + 90, 360);
            let flip = 180 < i ? -1 : 1;
            
            if (flip < 0) {
                φ0 = 270 - i;
                λ0 += 180;
            } else {
                φ0 = i - 90;
            }
            
            φ0 *= Math.PI / 180;
            λ0 = (qe(λ0 + 180, 360) - 180) * Math.PI / 180;
            
            const sinlat0 = Math.sin(-φ0);
            const coslat0 = Math.cos(-φ0);
            
            gl.uniform1f(this.locations.uniforms.R2, scale * scale);
            gl.uniform1f(this.locations.uniforms.lon0, -λ0);
            gl.uniform1f(this.locations.uniforms.sinlat0, sinlat0);
            gl.uniform1f(this.locations.uniforms.Rcoslat0, scale * coslat0);
            gl.uniform1f(this.locations.uniforms.coslat0dR, coslat0 / scale);
            gl.uniform1f(this.locations.uniforms.flip, flip);
            
        } else if (projectionType === 'equirectangular') {
            // Equirectangular projection - exactly like WebGLRenderer
            const λ0 = rotate[0] * Math.PI / 180;  // longitude rotation
            const φ0 = rotate[1] * Math.PI / 180;  // latitude rotation
            const γ0 = rotate[2] * Math.PI / 180;  // gamma rotation
            
            gl.uniform1f(this.locations.uniforms.R, scale);
            gl.uniform1f(this.locations.uniforms.lon0, -λ0);
            gl.uniform1f(this.locations.uniforms.sinlat0, Math.sin(-φ0));
            gl.uniform1f(this.locations.uniforms.coslat0, Math.cos(-φ0));
            gl.uniform1f(this.locations.uniforms.singam0, Math.sin(γ0));
            gl.uniform1f(this.locations.uniforms.cosgam0, Math.cos(γ0));
        }
    }

    /**
     * Set mesh-specific uniforms
     */
    private setMeshUniforms(gl: WebGLRenderingContext, buffer: MeshBuffer): void {
        if (!this.locations) return;

        // Use the style data stored with the buffer
        const { color, lineWidth, opacity } = buffer.style;

        gl.uniform3f(this.locations.uniforms.color, color[0], color[1], color[2]);
        gl.uniform1f(this.locations.uniforms.opacity, opacity);
        gl.uniform1f(this.locations.uniforms.lineWidth, lineWidth);
    }

    /**
     * Create shader program for a specific projection type
     */
    private createShaderProgram(projectionType: 'orthographic' | 'equirectangular'): boolean {
        if (!this.gl) return false;

        // Select projection shader based on type
        const projectionShader = projectionType === 'orthographic' 
            ? ORTHOGRAPHIC_PROJECTION 
            : EQUIRECTANGULAR_PROJECTION;
        // Build complete vertex shader by replacing placeholder
        const vertexShaderSource = BASE_VERTEX_SHADER.replace('@PROJECTION_SHADER@', projectionShader);

        const vertexShader = this.createShader(this.gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, MESH_FRAGMENT_SHADER);

        if (!vertexShader || !fragmentShader) {
            return false;
        }

        this.program = this.gl.createProgram();
        if (!this.program) {
            console.error('[WebGLMeshRenderer] Failed to create program');
            return false;
        }

        this.gl.attachShader(this.program, vertexShader);
        this.gl.attachShader(this.program, fragmentShader);
        this.gl.linkProgram(this.program);

        if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
            console.error('[WebGLMeshRenderer] Program link error:', this.gl.getProgramInfoLog(this.program));
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
            console.error(`[WebGLMeshRenderer] Shader compile error:`, this.gl.getShaderInfoLog(shader));
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
                lonlat: this.gl.getAttribLocation(this.program, 'a_lonlat'),
                lonlat_other: this.gl.getAttribLocation(this.program, 'a_lonlat_other'),
                offset: this.gl.getAttribLocation(this.program, 'a_offset')
            },
            uniforms: {
                projection: this.gl.getUniformLocation(this.program, 'u_projection'),
                viewport: this.gl.getUniformLocation(this.program, 'u_viewport'),
                lineWidth: this.gl.getUniformLocation(this.program, 'u_lineWidth'),
                color: this.gl.getUniformLocation(this.program, 'u_color'),
                opacity: this.gl.getUniformLocation(this.program, 'u_opacity'),
                // Orthographic projection uniforms (same as overlay system)
                translate: this.gl.getUniformLocation(this.program, 'u_translate'),
                R2: this.gl.getUniformLocation(this.program, 'u_R2'),
                lon0: this.gl.getUniformLocation(this.program, 'u_lon0'),
                sinlat0: this.gl.getUniformLocation(this.program, 'u_sinlat0'),
                Rcoslat0: this.gl.getUniformLocation(this.program, 'u_Rcoslat0'),
                coslat0dR: this.gl.getUniformLocation(this.program, 'u_coslat0dR'),
                flip: this.gl.getUniformLocation(this.program, 'u_flip'),
                // Equirectangular-specific uniforms
                R: this.gl.getUniformLocation(this.program, 'u_R'),
                coslat0: this.gl.getUniformLocation(this.program, 'u_coslat0'),
                singam0: this.gl.getUniformLocation(this.program, 'u_singam0'),
                cosgam0: this.gl.getUniformLocation(this.program, 'u_cosgam0')
            }
        };
    }

    /**
     * Set up initial WebGL state
     */
    private setupWebGLState(): void {
        if (!this.gl) return;

        // Enable depth testing
        this.gl.enable(this.gl.DEPTH_TEST);
        this.gl.depthFunc(this.gl.LEQUAL);

        // Set clear color
        this.gl.clearColor(0.0, 0.0, 0.0, 0.0);
    }

    /**
     * Check if renderer is ready
     */
    public isReady(): boolean {
        return this.isInitialized && this.gl !== null;
    }

    /**
     * Clean up resources
     */
    public dispose(): void {
        if (!this.gl) return;

        // Delete buffers
        for (const buffer of this.meshBuffers.values()) {
            this.gl.deleteBuffer(buffer.vertexBuffer);
            if (buffer.indexBuffer) {
                this.gl.deleteBuffer(buffer.indexBuffer);
            }
        }
        this.meshBuffers.clear();

        // Delete program
        if (this.program) {
            this.gl.deleteProgram(this.program);
            this.program = null;
        }

        this.isInitialized = false;
    }
} 