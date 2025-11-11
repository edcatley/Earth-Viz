// 2D Mesh Renderer
// Handles rendering of 2D mesh elements (coastlines, lakes, rivers)

import * as d3 from 'd3';

export interface MeshStyle {
    color: [number, number, number];
    lineWidth: number;
    opacity: number;
}

export class MeshRenderer2D {
    private meshStyles = {
        coastlines: { color: [0.98, 0.98, 0.98] as [number, number, number], lineWidth: 8.0, opacity: 0.65 },
        lakes: { color: [0.86, 0.86, 0.86] as [number, number, number], lineWidth: 6.0, opacity: 0.65 },
        rivers: { color: [0.86, 0.86, 0.86] as [number, number, number], lineWidth: 4.0, opacity: 0.65 }
    };

    private mesh: any = null;

    constructor() {
        // Lightweight constructor
    }

    /**
     * Initialize the renderer (currently no-op for 2D mesh)
     */
    public initialize(): void {
        // 2D mesh rendering doesn't need initialization
    }

    /**
     * Setup mesh data - store reference for rendering
     */
    public setup(mesh: any): void {
        this.mesh = mesh;
    }

    /**
     * Render mesh data to the canvas
     */
    public render(
        ctx: CanvasRenderingContext2D,
        canvas: HTMLCanvasElement,
        globe: any
    ): boolean {
        if (!this.mesh) {
            console.error('[2D_MESH] Render failed - no mesh data setup');
            return false;
        }

        try {
            // Clear the canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Create a path renderer that draws to 2D canvas
            const path = d3.geoPath(globe.projection).context(ctx);

            // Render coastlines
            if (this.mesh.coastLo) {
                ctx.beginPath();
                ctx.strokeStyle = this.rgbToString(this.meshStyles.coastlines.color);
                ctx.lineWidth = this.meshStyles.coastlines.lineWidth / 8; // Scale down for 2D
                ctx.globalAlpha = this.meshStyles.coastlines.opacity;
                path(this.mesh.coastLo);
                ctx.stroke();
            }

            // Render lakes
            if (this.mesh.lakesLo) {
                ctx.beginPath();
                ctx.strokeStyle = this.rgbToString(this.meshStyles.lakes.color);
                ctx.lineWidth = this.meshStyles.lakes.lineWidth / 8; // Scale down for 2D
                ctx.globalAlpha = this.meshStyles.lakes.opacity;
                path(this.mesh.lakesLo);
                ctx.stroke();
            }

            // Render rivers
            if (this.mesh.riversLo) {
                ctx.beginPath();
                ctx.strokeStyle = this.rgbToString(this.meshStyles.rivers.color);
                ctx.lineWidth = this.meshStyles.rivers.lineWidth / 8; // Scale down for 2D
                ctx.globalAlpha = this.meshStyles.rivers.opacity;
                path(this.mesh.riversLo);
                ctx.stroke();
            }

            // Reset alpha
            ctx.globalAlpha = 1.0;

            return true;
        } catch (error) {
            console.error('[2D_MESH] Render error:', error);
            return false;
        }
    }

    /**
     * Convert RGB array to CSS color string
     */
    private rgbToString(rgb: [number, number, number]): string {
        return `rgb(${Math.round(rgb[0] * 255)}, ${Math.round(rgb[1] * 255)}, ${Math.round(rgb[2] * 255)})`;
    }

    /**
     * Clear the canvas
     */
    public clear(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    /**
     * Get mesh styles
     */
    public getMeshStyles(): { [key: string]: MeshStyle } {
        return { ...this.meshStyles };
    }

    /**
     * Update mesh styles
     */
    public updateMeshStyles(styles: { [key: string]: Partial<MeshStyle> }): void {
        for (const [meshType, style] of Object.entries(styles)) {
            if (this.meshStyles[meshType as keyof typeof this.meshStyles]) {
                this.meshStyles[meshType as keyof typeof this.meshStyles] = {
                    ...this.meshStyles[meshType as keyof typeof this.meshStyles],
                    ...style
                };
            }
        }
    }

    /**
     * Dispose of resources
     */
    public dispose(): void {
        this.mesh = null;
    }
}
