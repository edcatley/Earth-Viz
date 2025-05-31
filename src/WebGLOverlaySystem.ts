// WebGL Overlay System - Based on nullschool's exact implementation
// Reverse-engineered from main~CIEWGMF2.js

interface WebGLContext {
    getContext(type: string, options?: any): WebGLRenderingContext | WebGL2RenderingContext | null;
}

interface DisplayInfo {
    width: number;
    height: number;
    pixelDensity: number;
}

interface ShaderSource {
    shaderSource: string[];
    textures: Record<string, any>;
    uniforms: Record<string, any>;
}

interface WebGLHelper {
    display: DisplayInfo;
    maxTextureSize: number;
    makeShader(type: number, source: string): WebGLShader;
    makeProgram(shaders: WebGLShader[]): WebGLProgram;
    makeTexture2D(params: any, pixels: any): WebGLTexture;
    attribs(program: WebGLProgram): { set(data: any): void };
    uniforms(program: WebGLProgram, cache: any): { set(uniforms: any): void };
    updateTexture2D(texture: WebGLTexture, params: any, pixels: any): void;
    updateTexture2DParams(texture: WebGLTexture, newParams: any, oldParams: any): boolean;
}

// Vertex shader - exactly as in their code
const VERTEX_SHADER = `
attribute vec2 a_Position;
attribute vec2 a_TexCoord;
varying vec2 v_TexCoord;

void main() {
    gl_Position = vec4(a_Position, 0.0, 1.0);
    v_TexCoord = a_TexCoord;
}
`;

// Fragment shader prefix and suffix - exactly as in their code
const FRAGMENT_PREFIX = `
precision highp float;
varying vec2 v_TexCoord;
const float NIL = -999999.0;
`;

const FRAGMENT_SUFFIX = `
void main() {
    gl_FragColor = colorize(lookup(grid(v_TexCoord)));
}
`;

// Get WebGL context - exactly as in their gc function
function getWebGLContext(canvas: HTMLCanvasElement, options?: any): WebGLRenderingContext | WebGL2RenderingContext | null {
    console.log('WebGL: Attempting to get WebGL context', {
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        canvasId: canvas.id || 'no-id'
    });
    
    try {
        const webgl2 = canvas.getContext("webgl2", options) as WebGL2RenderingContext | null;
        const webgl = canvas.getContext("webgl", options) as WebGLRenderingContext | null;
        const context = webgl2 || webgl;
        
        if (context) {
            console.log('WebGL: Context created successfully', {
                type: webgl2 ? 'webgl2' : 'webgl',
                isContextLost: context.isContextLost(),
                vendor: context.getParameter(context.VENDOR),
                renderer: context.getParameter(context.RENDERER)
            });
        } else {
            console.warn('WebGL: Failed to create context');
        }
        
        console.log('WebGL: Checking canvas state', {
            hasExisting2D: !!canvas.getContext('2d', { willReadFrequently: true }),
            // ... other checks
        });
        
        return context;
    } catch (error) {
        console.error('WebGL: Exception while creating context:', error);
        return null;
    }
}

// Create WebGL helper - exactly as in their Fx function
function createWebGLHelper(gl: WebGLRenderingContext | WebGL2RenderingContext, getDisplay: () => DisplayInfo): WebGLHelper {
    const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) || -1;
    
    const pixelStoreParams = {
        PACK_ALIGNMENT: 1,
        UNPACK_ALIGNMENT: 1,
        UNPACK_FLIP_Y_WEBGL: false,
        UNPACK_PREMULTIPLY_ALPHA_WEBGL: false,
        UNPACK_COLORSPACE_CONVERSION_WEBGL: gl.BROWSER_DEFAULT_WEBGL
    };

    // Set pixel store parameters
    Object.entries(pixelStoreParams).forEach(([key, value]) => {
        if (key in gl) {
            gl.pixelStorei((gl as any)[key], value as any);
        }
    });

    function checkError(operation: string) {
        const error = gl.getError();
        if (error !== gl.NO_ERROR) {
            console.warn(`WebGL error in ${operation}: ${error}`);
        }
    }

    return {
        get display() { return getDisplay(); },
        get maxTextureSize() { return maxTextureSize; },

        makeShader(type: number, source: string): WebGLShader {
            const shader = gl.createShader(type);
            checkError(`createShader:${type}`);
            if (!shader) throw new Error("createShader: null");
            
            gl.shaderSource(shader, source);
            checkError(`shaderSource:${type}`);
            gl.compileShader(shader);
            checkError(`compileShader:${type}`);
            
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                const log = gl.getShaderInfoLog(shader);
                gl.deleteShader(shader);
                throw new Error(`Shader compile error: ${log}`);
            }
            return shader;
        },

        makeProgram(shaders: WebGLShader[]): WebGLProgram {
            const program = gl.createProgram();
            checkError("createProgram");
            if (!program) throw new Error("createProgram: null");
            
            shaders.forEach(shader => {
                gl.attachShader(program, shader);
                checkError("attachShader");
            });
            
            gl.linkProgram(program);
            checkError("linkProgram");
            
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                const log = gl.getProgramInfoLog(program);
                gl.deleteProgram(program);
                throw new Error(`Program link error: ${log}`);
            }
            return program;
        },

        makeTexture2D(params: any, pixels: any): WebGLTexture {
            const texture = gl.createTexture();
            checkError("createTexture");
            if (!texture) throw new Error("createTexture: null");
            
            gl.activeTexture(gl.TEXTURE0);
            checkError("activeTexture");
            gl.bindTexture(gl.TEXTURE_2D, texture);
            checkError("bindTexture");
            
            // Set texture parameters
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            
            // Upload texture data
            gl.texImage2D(
                gl.TEXTURE_2D, 0, 
                params.internalFormat, 
                params.width, params.height, 0,
                params.format, params.type, 
                pixels
            );
            checkError("texImage2D");
            
            return texture;
        },

        attribs(program: WebGLProgram) {
            return {
                set(data: any) {
                    Object.entries(data).forEach(([name, values]) => {
                        const location = gl.getAttribLocation(program, name);
                        if (location >= 0) {
                            const buffer = gl.createBuffer();
                            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
                            gl.bufferData(gl.ARRAY_BUFFER, values as Float32Array, gl.STATIC_DRAW);
                            gl.enableVertexAttribArray(location);
                            gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
                            checkError(`assign-attrib:${name}`);
                        }
                    });
                }
            };
        },

        uniforms(program: WebGLProgram, cache: any) {
            return {
                set(uniforms: any) {
                    Object.entries(uniforms).forEach(([name, value]) => {
                        const location = gl.getUniformLocation(program, name);
                        if (location) {
                            if (Array.isArray(value)) {
                                if (value.length === 2) {
                                    gl.uniform2fv(location, value);
                                } else if (value.length === 3) {
                                    gl.uniform3fv(location, value);
                                } else if (value.length === 4) {
                                    gl.uniform4fv(location, value);
                                }
                            } else if (typeof value === 'number') {
                                gl.uniform1f(location, value);
                            } else if (typeof value === 'string') {
                                // Texture uniform - find texture unit
                                const textureUnit = cache[value]?.unit;
                                if (textureUnit !== undefined) {
                                    gl.uniform1i(location, textureUnit);
                                }
                            }
                            checkError(`uniform:${name}`);
                        }
                    });
                }
            };
        },

        updateTexture2D(texture: WebGLTexture, params: any, pixels: any) {
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texSubImage2D(
                gl.TEXTURE_2D, 0, 0, 0,
                params.width, params.height,
                params.format, params.type,
                pixels
            );
            checkError("texSubImage2D");
        },

        updateTexture2DParams(texture: WebGLTexture, newParams: any, oldParams: any): boolean {
            // Check if we can reuse the texture with new parameters
            return newParams.width === oldParams.width &&
                   newParams.height === oldParams.height &&
                   newParams.format === oldParams.format &&
                   newParams.type === oldParams.type;
        }
    };
}

// Main WebGL overlay system - exactly as in their yc function
export function createWebGLOverlaySystem(
    canvas: HTMLCanvasElement,
    fallbackCanvas?: HTMLCanvasElement,
    getAlpha: () => number = () => 1,
    getDisplay: () => DisplayInfo = () => ({ width: 800, height: 600, pixelDensity: 1 }),
    getShaderSources: (helper: WebGLHelper) => ShaderSource[] = () => [],
    onContextLoss?: () => void
) {
    console.log('WebGL: Creating WebGL overlay system', {
        canvasId: canvas.id || 'no-id',
        canvasSize: [canvas.width, canvas.height],
        hasFallback: !!fallbackCanvas
    });
    
    const hasOffscreen = fallbackCanvas !== undefined;
    const renderTarget = hasOffscreen ? fallbackCanvas : canvas;
    const ctx2d = hasOffscreen ? canvas.getContext("2d") : undefined;
    
    console.log('WebGL: Getting WebGL context for render target');
    const glContext = getWebGLContext(renderTarget);
    if (!glContext) {
        console.error('WebGL: No WebGL context available');
        return { draw: () => ({ pass: false, err: "no context" }) };
    }

    // Assert that gl is not null for the rest of the function
    const gl = glContext as WebGLRenderingContext | WebGL2RenderingContext;
    console.log('WebGL: WebGL context obtained successfully');
    
    // Add context loss handling
    let contextLost = false;
    
    canvas.addEventListener('webglcontextlost', (event) => {
        console.error('WebGL: Context lost event fired', {
            canvasId: canvas.id || 'no-id',
            canvasSize: [canvas.width, canvas.height],
            timestamp: Date.now()
        });
        event.preventDefault(); // Prevent default handling
        contextLost = true;
        if (onContextLoss) {
            onContextLoss();
        }
    });
    
    canvas.addEventListener('webglcontextrestored', () => {
        console.log('WebGL: Context restored event fired - but system needs to be recreated');
        // Don't try to restore here - let the parent system recreate everything
        if (onContextLoss) {
            onContextLoss();
        }
    });
    
    const helper = createWebGLHelper(gl, getDisplay);
    
    // Get WebGL extensions
    gl.getExtension("EXT_color_buffer_float");
    gl.getExtension("OES_texture_float_linear");
    
    // Set up WebGL state
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);

    // Create vertex shader
    const vertexShader = helper.makeShader(gl.VERTEX_SHADER, VERTEX_SHADER);
    
    // Vertex data - exactly as in their code
    const vertexData = {
        a_Position: new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        a_TexCoord: new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1])
    };

    // State tracking
    const textureCache: Record<string, any> = {};
    const textureSlots = new Array(8).fill(null);
    let textureUnit = 1;
    let currentShaders: string[] = [];
    let uniformSetter: any;

    // Set initial canvas size based on display
    const initialDisplay = getDisplay();
    const initialWidth = Math.round(initialDisplay.width * initialDisplay.pixelDensity);
    const initialHeight = Math.round(initialDisplay.height * initialDisplay.pixelDensity);
    
    console.log('WebGL: Setting canvas size', {
        displaySize: [initialDisplay.width, initialDisplay.height],
        pixelDensity: initialDisplay.pixelDensity,
        targetSize: [initialWidth, initialHeight],
        currentCanvasSize: [canvas.width, canvas.height],
        needsResize: canvas.width !== initialWidth || canvas.height !== initialHeight
    });
    
    canvas.width = renderTarget.width = initialWidth;
    canvas.height = renderTarget.height = initialHeight;
    gl.viewport(0, 0, initialWidth, initialHeight);
    
    console.log('WebGL: Canvas resized, checking context state', {
        afterResize: [canvas.width, canvas.height],
        isContextLost: gl.isContextLost(),
        glError: gl.getError()
    });

    function compileShaderProgram(shaderSources: string[]) {
        console.log('WebGL: Compiling shader program', { shaderCount: shaderSources.length });
        const fragmentSource = FRAGMENT_PREFIX + shaderSources.join("") + FRAGMENT_SUFFIX;
        const fragmentShader = helper.makeShader(gl.FRAGMENT_SHADER, fragmentSource);
        const program = helper.makeProgram([vertexShader, fragmentShader]);
        
        helper.attribs(program).set(vertexData);
        currentShaders = shaderSources;
        uniformSetter = helper.uniforms(program, textureCache);
        gl.useProgram(program);
        console.log('WebGL: Shader program compiled successfully');
    }

    function updateTexture(name: string, params: any, cached?: any) {
        if (!params) throw new Error(`unknown texture '${name}'`);
        
        params = { ...params };
        const { pixels } = params;
        if (!pixels) throw new Error(`texture '${name}' has no pixels`);
        
        params.pixels = null; // Remove pixels from params for caching
        
        if (cached) {
            const { def, texture } = cached;
            if (params.hash === def.hash) {
                return helper.updateTexture2DParams(texture, params, def) ? 
                    { def: params, texture } : cached;
            }
            
            if (helper.updateTexture2DParams(texture, params, def)) {
                helper.updateTexture2D(texture, params, pixels);
                return { def: params, texture };
            }
            
            gl.deleteTexture(texture);
        }

        const texture = helper.makeTexture2D(params, pixels);
        return { def: params, texture };
    }

    function updateTextures(textures: Record<string, any> = {}) {
        return Object.keys(textures).map(name => 
            textureCache[name] = updateTexture(name, textures[name], textureCache[name])
        );
    }

    function bindTextures(textures: any[]) {
        textures.forEach(tex => {
            const { texture } = tex;
            if (textureSlots[textureUnit] !== texture) {
                textureSlots[textureUnit] = texture;
                gl.activeTexture(gl.TEXTURE0 + textureUnit);
                gl.bindTexture(gl.TEXTURE_2D, texture);
            }
            tex.unit = textureUnit++;
        });
    }

    function clearCanvas() {
        gl.clear(gl.COLOR_BUFFER_BIT);
        if (ctx2d) {
            ctx2d.clearRect(0, 0, ctx2d.canvas.width, ctx2d.canvas.height);
        }
    }

    function checkGLError(operation: string) {
        const error = gl.getError();
        if (error !== 0) {
            throw new Error(`${error}:${operation}`);
        }
    }

    function render(): boolean {
        // Check for context loss
        if (contextLost || gl.isContextLost()) {
            console.error('WebGL: Render aborted - context lost', {
                contextLostFlag: contextLost,
                glIsContextLost: gl.isContextLost(),
                timestamp: Date.now()
            });
            return false;
        }
        
        console.log('WebGL: Starting render', {
            contextLost: contextLost,
            glIsContextLost: gl.isContextLost(),
            canvasSize: [canvas.width, canvas.height]
        });
        
        const currentDisplay = getDisplay();
        
        clearCanvas();
        checkGLError("fast_clear");

        const shaderSources = getShaderSources(helper);
        if (shaderSources.length === 0) {
            console.warn('WebGL: No shader sources provided');
            return false;
        }

        console.log('WebGL: Got shader sources', { count: shaderSources.length });

        const shaderCode = shaderSources.map(s => s.shaderSource).flat(Infinity) as string[];
        
        // Check if we need to recompile shaders
        if (!arraysEqual(currentShaders, shaderCode)) {
            console.log('WebGL: Recompiling shaders');
            compileShaderProgram(shaderCode);
            checkGLError("fast_program");
        }

        // Reset texture unit counter
        textureUnit = 1;
        
        // Update and bind textures
        console.log('WebGL: Updating textures');
        shaderSources.forEach(source => {
            bindTextures(updateTextures(source.textures));
        });
        
        // Clear unused texture slots
        while (textureUnit < textureSlots.length) {
            textureSlots[textureUnit++] = null;
        }
        
        checkGLError("fast_textures");

        // Set uniforms
        console.log('WebGL: Setting uniforms');
        shaderSources.forEach(source => {
            uniformSetter.set(source.uniforms);
        });
        
        uniformSetter.set({
            u_PixelDensity: helper.display.pixelDensity,
            u_Alpha: getAlpha()
        });
        
        checkGLError("fast_uniforms");

        // Draw
        console.log('WebGL: Drawing');
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        checkGLError("fast_draw");

        // Copy to main canvas if using offscreen rendering
        if (hasOffscreen && ctx2d) {
            ctx2d.drawImage(renderTarget, 0, 0);
        }

        console.log('WebGL: Render completed successfully');
        return true;
    }

    return {
        draw() {
            try {
                const success = render();
                checkGLError("fast_done");
                return { pass: success };
            } catch (error) {
                console.error(error);
                return { pass: false, err: `${error}` };
            }
        }
    };
}

// Utility function to compare arrays
function arraysEqual<T>(a: T[], b: T[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

// Test system - exactly as in their jx function
export function testWebGLSystem(container?: any, testWidth: number = 300, testHeight: number = 300) {
    const pixelDensity = 1;
    
    console.time("glTest");
    const result: any = { pass: false };
    
    console.log('WebGL: Testing WebGL system', {
        testSize: [testWidth, testHeight],
        pixelDensity: pixelDensity
    });
    
    try {
        const canvas = document.createElement("canvas");
        canvas.width = testWidth;
        canvas.height = testHeight;
        
        console.log('WebGL: Created test canvas', {
            actualSize: [canvas.width, canvas.height]
        });
        
        if (container) {
            canvas.style.width = `${testWidth / pixelDensity}px`;
            canvas.style.height = `${testHeight / pixelDensity}px`;
            canvas.style.position = "absolute";
            canvas.style.top = "0";
            canvas.style.left = "0";
            container.appendChild(canvas);
        }

        const gl = getWebGLContext(canvas);
        if (!gl) {
            console.warn('WebGL: Test failed - no context');
            result.hasContext = false;
            return result;
        }

        const maxTexSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) || -1;
        if (maxTexSize < 4096) {
            console.warn('WebGL: Test failed - texture size too small:', maxTexSize);
            result.maxTexSize = maxTexSize;
            return result;
        }

        const precision = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)?.precision || -1;
        if (precision < 23) {
            console.warn('WebGL: Test failed - precision too low:', precision);
            result.precision = precision;
            return result;
        }

        result.scenario = 1;
        
        console.log('WebGL: Creating test system for render test');
        // Create test system and run a test render
        const system = createWebGLOverlaySystem(
            canvas,
            undefined,
            () => 1,
            () => ({ width: testWidth, height: testHeight, pixelDensity }),
            () => [] // Empty shader sources for basic test
        );
        
        console.log('WebGL: Running test render');
        const testResult = system.draw();
        if (testResult.err) {
            console.warn('WebGL: Test render failed:', testResult.err);
            result.err = testResult.err;
            return result;
        }

        const error = gl.getError();
        if (error !== 0) {
            console.warn('WebGL: Test failed - GL error:', error);
            result.err = error;
        } else {
            console.log('WebGL: Test passed successfully');
            result.pass = true;
        }
        
    } catch (error) {
        console.error('WebGL: Test exception:', error);
        result.err = `${error}`;
    } finally {
        console.timeEnd("glTest");
    }
    
    return result;
} 