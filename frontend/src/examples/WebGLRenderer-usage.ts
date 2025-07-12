/**
 * Example usage of the unified WebGLRenderer
 * 
 * This shows how both planets and overlays use the same clean setup/render pattern
 */

import { WebGLRenderer } from '../services/WebGLRenderer';

// Example usage
export class UnifiedRenderingExample {
    private renderer: WebGLRenderer;
    private canvas: HTMLCanvasElement;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.renderer = new WebGLRenderer();
    }

    async initialize(): Promise<boolean> {
        // Initialize WebGL renderer
        if (!this.renderer.initialize(this.canvas)) {
            console.error('Failed to initialize WebGL renderer');
            return false;
        }

        return true;
    }

    async setupPlanet(planetImage: HTMLImageElement): Promise<boolean> {
        // Setup planet (heavy operation - done once)
        return this.renderer.setup('planet', planetImage, 'planet');
    }

    async setupOverlay(overlayProduct: any): Promise<boolean> {
        // Setup overlay (heavy operation - done once)
        return this.renderer.setup('overlay', overlayProduct, 'wind');
    }

    renderFrame(globe: any, view: any): void {
        // Render planet (lightweight - every frame)
        this.renderer.render('planet', globe, view);
        
        // Render overlay on top (lightweight - every frame)
        this.renderer.render('wind', globe, view);
    }

    dispose(): void {
        this.renderer.dispose();
    }
}

/**
 * Comparison with the old messy system:
 * 
 * OLD WAY (1500 lines, inconsistent):
 * 
 * Planet:
 * - renderPlanet() builds shader EVERY FRAME (expensive!)
 * - Creates WebGLLayer objects EVERY FRAME (wasteful!)
 * - Lazy shader compilation in renderLayer()
 * 
 * Overlay:
 * - setupOverlay() builds shader ONCE (good!)
 * - renderOverlay() just renders (good!)
 * - But completely different pattern from planets
 * 
 * NEW WAY (400 lines, consistent):
 * 
 * Both Planet & Overlay:
 * - setup() builds everything ONCE (texture upload, shader compilation)
 * - render() is lightweight EVERY FRAME (just set uniforms and draw)
 * - Same exact pattern for both types
 * - Unified codebase, no duplication
 * 
 * Benefits:
 * ✅ 70% less code (400 vs 1500 lines)
 * ✅ Consistent architecture
 * ✅ Much better performance (no per-frame shader compilation)
 * ✅ Easier to understand and maintain
 * ✅ Extensible (can easily add new render types)
 */ 