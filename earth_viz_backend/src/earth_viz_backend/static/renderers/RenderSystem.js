/**
 * RenderSystem - handles all rendering operations for the earth visualization
 * Manages canvases, particles, overlays, and SVG map rendering
 */
import * as d3 from 'd3';
import { Utils } from '../utils/Utils';
// Debug logging - enabled
function debugLog(section, message, data) {
    console.debug(`[${section}] ${message}`, data || '');
}
export class RenderSystem {
    constructor(display) {
        Object.defineProperty(this, "display", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        // Canvas elements and contexts
        Object.defineProperty(this, "canvas", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "context", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "overlayCanvas", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "overlayContext", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "scaleCanvas", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "scaleContext", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        this.display = display;
    }
    /**
     * Initialize all canvas elements and contexts
     */
    setupCanvases() {
        // Setup animation canvas
        this.canvas = d3.select("#animation").node();
        if (this.canvas) {
            this.context = this.canvas.getContext("2d");
            this.canvas.width = this.display.width;
            this.canvas.height = this.display.height;
            // Set up canvas properties like the original
            if (this.context) {
                this.context.fillStyle = Utils.isFF() ? "rgba(0, 0, 0, 0.95)" : "rgba(0, 0, 0, 0.97)"; // FF Mac alpha behaves oddly
            }
        }
        // Setup overlay canvas
        this.overlayCanvas = d3.select("#overlay").node();
        if (this.overlayCanvas) {
            this.overlayContext = this.overlayCanvas.getContext("2d");
            this.overlayCanvas.width = this.display.width;
            this.overlayCanvas.height = this.display.height;
        }
        // Setup scale canvas
        this.scaleCanvas = d3.select("#scale").node();
        if (this.scaleCanvas) {
            this.scaleContext = this.scaleCanvas.getContext("2d");
            // Set scale canvas dimensions dynamically
            this.setSizeScale();
        }
    }
    /**
     * Set scale canvas size dynamically
     * Width: (menu width - label width) * 0.97
     * Height: label height / 2
     */
    setSizeScale() {
        if (!this.scaleCanvas)
            return;
        const label = d3.select("#scale-label").node();
        const menu = d3.select("#menu").node();
        if (label && menu) {
            const width = (menu.offsetWidth - label.offsetWidth) * 0.97;
            const height = label.offsetHeight / 2;
            d3.select("#scale")
                .attr("width", width)
                .attr("height", height);
        }
    }
    /**
     * Clear the animation canvas completely
     */
    clearAnimationCanvas() {
        if (!this.context)
            return;
        this.context.clearRect(0, 0, this.display.width, this.display.height);
    }
    /**
     * Main rendering method - renders the complete frame
     */
    renderFrame(data) {
        if (!data.globe) {
            return;
        }
        try {
            // 1. Clear everything
            this.clearAnimationCanvas();
            Utils.clearCanvas(this.overlayCanvas);
            if (this.scaleCanvas) {
                Utils.clearCanvas(this.scaleCanvas);
            }
            // SVG map structure is now handled by Earth.ts lifecycle
            // 2. Draw planet canvas (if provided)
            if (data.planetCanvas) {
                this.overlayContext.drawImage(data.planetCanvas, 0, 0);
            }
            // 3. Draw overlay canvas (if provided)
            if (data.overlayCanvas) {
                this.overlayContext.drawImage(data.overlayCanvas, 0, 0);
            }
            // 4. Draw mesh canvas (if provided)
            if (data.meshCanvas) {
                this.overlayContext.drawImage(data.meshCanvas, 0, 0);
            }
            // 5. Draw particle canvas (if provided) with special blending
            if (data.particleCanvas) {
                // Use "lighter" blending for particles to create glowing effect
                const prevCompositeOperation = this.overlayContext.globalCompositeOperation;
                this.overlayContext.globalCompositeOperation = "lighter";
                this.overlayContext.drawImage(data.particleCanvas, 0, 0);
                this.overlayContext.globalCompositeOperation = prevCompositeOperation;
            }
            // 6. Draw color scale (if provided)
            if (data.overlayGrid) {
                this.drawColorScale(data.overlayGrid);
            }
        }
        catch (error) {
            console.error('Frame render failed:', error);
            throw error;
        }
    }
    /**
     * Draw color scale bar
     */
    drawColorScale(overlayGrid) {
        if (!this.scaleContext || !overlayGrid.scale) {
            return;
        }
        const canvas = this.scaleCanvas;
        const ctx = this.scaleContext;
        const scale = overlayGrid.scale;
        const bounds = scale.bounds;
        if (!bounds)
            return;
        const width = canvas.width - 1;
        // Draw gradient bar
        for (let i = 0; i <= width; i++) {
            const value = Utils.spread(i / width, bounds[0], bounds[1]);
            const rgb = scale.gradient(value, 1); // Full opacity for scale
            ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
            ctx.fillRect(i, 0, 1, canvas.height);
        }
        // Add tooltip functionality like the original
        const colorBar = d3.select("#scale");
        colorBar.on("mousemove", (event) => {
            const [x] = d3.pointer(event);
            const pct = Utils.clamp((Math.round(x) - 2) / (width - 2), 0, 1);
            const value = Utils.spread(pct, bounds[0], bounds[1]);
            if (overlayGrid.units && overlayGrid.units[0]) {
                const units = overlayGrid.units[0];
                const convertedValue = units.conversion(value);
                const formattedValue = convertedValue.toFixed(units.precision);
                colorBar.attr("title", `${formattedValue} ${units.label}`);
            }
            else {
                // Fallback for products without units
                colorBar.attr("title", `${value.toFixed(1)}`);
            }
        });
    }
    /**
     * Draw location marker on foreground SVG
     */
    drawLocationMark(point, coord) {
        debugLog('LOCATION', 'Drawing location mark', { point, coord });
        const foregroundSvg = d3.select("#foreground");
        foregroundSvg.selectAll(".location-mark").remove();
        foregroundSvg.append("circle")
            .attr("class", "location-mark")
            .attr("cx", point[0])
            .attr("cy", point[1])
            .attr("r", 5)
            .style("fill", "red")
            .style("stroke", "white")
            .style("stroke-width", 2);
    }
    /**
     * Check if rendering contexts are available
     */
    isReady() {
        return !!(this.context && this.overlayContext && this.scaleContext);
    }
    /**
     * Update display dimensions (for window resize)
     */
    updateDisplay(display) {
        this.display = display;
        // Update canvas dimensions
        if (this.canvas) {
            this.canvas.width = display.width;
            this.canvas.height = display.height;
        }
        if (this.overlayCanvas) {
            this.overlayCanvas.width = display.width;
            this.overlayCanvas.height = display.height;
        }
        debugLog('UPDATE', 'Display updated', {
            width: display.width,
            height: display.height
        });
    }
}
//# sourceMappingURL=RenderSystem.js.map