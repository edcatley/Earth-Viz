// 2D Mesh Renderer
// Handles rendering of 2D mesh elements (coastlines, lakes, rivers)

import * as d3 from 'd3';

export interface MeshStyle {
    color: [number, number, number];
    lineWidth: number;
    opacity: number;
}

export class MeshRenderer2D {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private meshStyles = {
        coastlines: { color: [0.98, 0.98, 0.98] as [number, number, number], lineWidth: 8.0, opacity: 0.65 },
        lakes: { color: [0.86, 0.86, 0.86] as [number, number, number], lineWidth: 6.0, opacity: 0.65 },
        rivers: { color: [0.86, 0.86, 0.86] as [number, number, number], lineWidth: 4.0, opacity: 0.65 }
    };

    private mesh: any = null;

    constructor() {
        this.canvas = document.createElement("canvas");
        this.ctx = this.canvas.getContext("2d")!;
    }

    /**
     * Initialize the renderer
     */
    public initialize(view: any): void {
        this.canvas.width = view.width;
        this.canvas.height = view.height;
    }

    /**
     * Get the canvas for blitting
     */
    public getCanvas(): HTMLCanvasElement {
        return this.canvas;
    }

    /**
     * Setup mesh data - store reference for rendering
     */
    public setup(mesh: any): void {
        this.mesh = mesh;
    }

    /**
     * Render mesh data to internal canvas
     */
    public render(globe: any): void {
        if (!this.mesh) return;

        // Clear the canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Create a path renderer that draws to 2D canvas
        const path = d3.geoPath(globe.projection).context(this.ctx);

        // Render coastlines
        if (this.mesh.coastLo) {
            this.ctx.beginPath();
            this.ctx.strokeStyle = this.rgbToString(this.meshStyles.coastlines.color);
            this.ctx.lineWidth = this.meshStyles.coastlines.lineWidth / 8; // Scale down for 2D
            this.ctx.globalAlpha = this.meshStyles.coastlines.opacity;
            path(this.mesh.coastLo);
            this.ctx.stroke();
        }

        // Render lakes
        if (this.mesh.lakesLo) {
            this.ctx.beginPath();
            this.ctx.strokeStyle = this.rgbToString(this.meshStyles.lakes.color);
            this.ctx.lineWidth = this.meshStyles.lakes.lineWidth / 8; // Scale down for 2D
            this.ctx.globalAlpha = this.meshStyles.lakes.opacity;
            path(this.mesh.lakesLo);
            this.ctx.stroke();
        }

        // Render rivers
        if (this.mesh.riversLo) {
            this.ctx.beginPath();
            this.ctx.strokeStyle = this.rgbToString(this.meshStyles.rivers.color);
            this.ctx.lineWidth = this.meshStyles.rivers.lineWidth / 8; // Scale down for 2D
            this.ctx.globalAlpha = this.meshStyles.rivers.opacity;
            path(this.mesh.riversLo);
            this.ctx.stroke();
        }

        // Reset alpha
        this.ctx.globalAlpha = 1.0;
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
    public clear(): void {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
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
