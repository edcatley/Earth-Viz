/**
 * Globes - a set of models of the earth, each having their own kind of projection and onscreen behavior.
 *
 * Copyright (c) 2014 Cameron Beccario
 * The MIT License - http://opensource.org/licenses/MIT
 *
 * https://github.com/cambecc/earth
 */
import * as d3 from 'd3';
import * as d3GeoProjection from 'd3-geo-projection';
import { Utils } from '../utils/Utils';

// Basic types used throughout the application
export type Point = [number, number];  // [x, y] screen coordinates
export type GeoPoint = [number, number];  // [longitude, latitude]
export type Vector = [number, number, number | null];  // [u, v, magnitude]

export interface ViewportSize {
    width: number;
    height: number;
}

export interface Bounds {
    x: number;
    y: number;
    xMax: number;
    yMax: number;
    width: number;
    height: number;
}

export interface DisplayOptions {
    width: number;
    height: number;
    projection: d3.GeoProjection;
    orientation: [number, number, number];
}

// Update type declarations for D3 v7
interface GeoProjection extends d3.GeoProjection {
    rotate(): [number, number, number];
    rotate(angles: [number, number] | [number, number, number]): this;
    scale(): number;
    scale(scale: number): this;
    translate(): [number, number];
    translate(point: [number, number]): this;
    precision(): number;
    precision(precision: number): this;
    clipAngle(): number | null;
    clipAngle(angle: number | null): this;
    clipExtent(): [[number, number], [number, number]] | null;
    clipExtent(extent: [[number, number], [number, number]] | null): this;
}

// Type declarations for d3-geo-projection (separate library)
declare module 'd3-geo-projection' {
    export function geoMollweide(): d3.GeoProjection;
    export function geoWinkel3(): d3.GeoProjection;
    export function geoPolyhedralWaterman(): d3.GeoProjection;
}

export interface Globe {
    projection: d3.GeoProjection | null;
    projectionType: 'orthographic' | 'equirectangular' | 'azimuthal_equidistant' | 'conic_equidistant' | 'stereographic' | 'waterman' | 'winkel3' | 'atlantis';
    newProjection(view: ViewportSize): d3.GeoProjection;
    bounds(view: ViewportSize): { x: number; y: number; xMax: number; yMax: number; width: number; height: number };
    fit(view: ViewportSize): number;
    center(view: ViewportSize): [number, number];
    scaleExtent(): [number, number];
    orientation(o?: string, view?: ViewportSize): string | Globe;
    manipulator(startMouse: [number, number], startScale: number): {
        move(mouse: [number, number] | null, scale: number): void;
        end(): void;
    };
    locate(coord: [number, number]): [number, number, number] | null;
    defineMask(context: CanvasRenderingContext2D): CanvasRenderingContext2D;
    defineMap(mapSvg: any, foregroundSvg: any): void;
}

// Color type definitions
export type RGB = [number, number, number];
export type RGBA = [number, number, number, number];

// Date configuration interface  
export interface DateConfig {
    date: string;
    hour: string;
}

// Logger interface
export interface Logger {
    debug: (s: unknown) => void;
    info: (s: unknown) => void;
    error: (e: unknown) => void;
    time: (s: unknown) => void;
    timeEnd: (s: unknown) => void;
}

export class Globes {
    // Helper functions converted to static methods
    private static currentPosition(): [number, number] {
        const λ = Utils.floorMod(new Date().getTimezoneOffset() / 4, 360);  // 24 hours * 60 min / 4 === 360 degrees
        return [λ, 0];
    }

    private static ensureNumber(num: number | undefined | null, fallback: number): number {
        return (Number.isFinite(num) || num === Infinity || num === -Infinity ? num : fallback) as number;
    }

    /**
     * Ensure the given scale results in even globe dimensions to avoid half-pixel alignment issues
     */
    private static ensureEvenScale(scale: number, projection: d3.GeoProjection): number {
        if (!projection) return scale;

        // Calculate what the globe dimensions would be with this scale
        const bounds = d3.geoPath().projection(projection).bounds({ type: "Sphere" });
        const hScale = (bounds[1][0] - bounds[0][0]) / projection.scale();
        const vScale = (bounds[1][1] - bounds[0][1]) / projection.scale();

        var globeWidth = scale * hScale;
        var globeHeight = scale * vScale;

        // Round to nearest even number
        var evenWidth = Math.round(globeWidth / 2) * 2;
        var evenHeight = Math.round(globeHeight / 2) * 2;

        // Use the more restrictive dimension to maintain aspect ratio
        return Math.min(evenWidth / hScale, evenHeight / vScale);
    }

    private static clampedBounds(bounds: any, view: ViewportSize) {
        var upperLeft = bounds[0];
        var lowerRight = bounds[1];
        var x = Math.max(Math.floor(Globes.ensureNumber(upperLeft[0], 0)), 0);
        var y = Math.max(Math.floor(Globes.ensureNumber(upperLeft[1], 0)), 0);
        var xMax = Math.min(Math.ceil(Globes.ensureNumber(lowerRight[0], view.width)), view.width - 1);
        var yMax = Math.min(Math.ceil(Globes.ensureNumber(lowerRight[1], view.height)), view.height - 1);
        return { x: x, y: y, xMax: xMax, yMax: yMax, width: xMax - x + 1, height: yMax - y + 1 };
    }

    private static standardGlobe(): Globe {
        return {
            /**
             * The type of projection used by this globe.
             */
            projectionType: 'orthographic' as 'orthographic' | 'equirectangular' | 'azimuthal_equidistant' | 'conic_equidistant' | 'stereographic' | 'waterman' | 'winkel3' | 'atlantis',

            /**
             * This globe's current D3 projection.
             */
            projection: null as d3.GeoProjection | null,

            /**
             * @param view the size of the view as {width:, height:}.
             * @returns {Object} a new D3 projection of this globe appropriate for the specified view port.
             */
            newProjection: function (view: ViewportSize): d3.GeoProjection {
                throw new Error("method must be overridden");
            },

            /**
             * @param view the size of the view as {width:, height:}.
             * @returns {{x: Number, y: Number, xMax: Number, yMax: Number, width: Number, height: Number}}
             *          the bounds of the current projection clamped to the specified view.
             */
            bounds: function (view: ViewportSize) {
                return Globes.clampedBounds(d3.geoPath().projection(this.projection).bounds({ type: "Sphere" }), view);
            },

            /**
             * @param view the size of the view as {width:, height:}.
             * @returns {Number} the projection scale at which the entire globe fits within the specified view.
             */
            fit: function (view: ViewportSize) {
                var defaultProjection = this.newProjection(view);
                var bounds = d3.geoPath().projection(defaultProjection).bounds({ type: "Sphere" });
                var hScale = (bounds[1][0] - bounds[0][0]) / defaultProjection.scale();
                var vScale = (bounds[1][1] - bounds[0][1]) / defaultProjection.scale();
                var rawScale = Math.min(view.width / hScale, view.height / vScale) * 0.9;

                // Ensure the globe dimensions are even numbers to avoid half-pixel alignment issues
                var globeWidth = rawScale * hScale;
                var globeHeight = rawScale * vScale;

                // Round to nearest even number
                var evenWidth = Math.round(globeWidth / 2) * 2;
                var evenHeight = Math.round(globeHeight / 2) * 2;

                // Use the more restrictive dimension to maintain aspect ratio
                var evenScale = Math.min(evenWidth / hScale, evenHeight / vScale);

                return evenScale;
            },

            /**
             * @param view the size of the view as {width:, height:}.
             * @returns {Array} the projection transform at which the globe is centered within the specified view.
             */
            center: function (view: ViewportSize) {
                return [view.width / 2, view.height / 2];
            },

            /**
             * @returns {Array} the range at which this globe can be zoomed.
             */
            scaleExtent: function () {
                return [25, 3000];
            },

            /**
             * Returns the current orientation of this globe as a string. If the arguments are specified,
             * mutates this globe to match the specified orientation string, usually in the form "lat,lon,scale".
             *
             * @param [o] the orientation string
             * @param [view] the size of the view as {width:, height:}.
             */
            orientation: function (o: string | undefined, view: ViewportSize): string | Globe {
                const projection = this.projection;
                if (!projection) {
                    return "0,0,1";  // Default orientation if no projection exists
                }
                const rotate = projection.rotate();
                if (o != null && o !== undefined) {  // Check for non-null and non-undefined
                    const parts = o.split(",");
                    const λ = +parts[0], φ = +parts[1], scale = +parts[2];
                    const extent = this.scaleExtent();
                    projection.rotate(Number.isFinite(λ) && Number.isFinite(φ) ?
                        [-λ, -φ, rotate[2]] as [number, number, number] :
                        this.newProjection(view).rotate());
                    const targetScale = Number.isFinite(scale) ? Utils.clamp(scale, extent[0], extent[1]) : this.fit(view);
                    const evenScale = Globes.ensureEvenScale(targetScale, projection);
                    projection.scale(evenScale);
                    projection.translate(this.center(view));
                    return this;
                }
                return [(-rotate[0]).toFixed(2), (-rotate[1]).toFixed(2), Math.round(projection.scale())].join(",");
            },

            /**
             * Returns an object that mutates this globe's current projection during a drag/zoom operation.
             * Each drag/zoom event invokes the move() method, and when the move is complete, the end() method
             * is invoked.
             *
             * @param startMouse starting mouse position.
             * @param startScale starting scale.
             */
            manipulator: function (startMouse: [number, number], startScale: number) {
                const projection = this.projection;
                if (!projection) {
                    return {
                        move: function () { },
                        end: function () { }
                    };
                }
                const sensitivity = 60 / startScale;  // seems to provide a good drag scaling factor
                const rotation = [projection.rotate()[0] / sensitivity, -projection.rotate()[1] / sensitivity];
                const original = projection.precision();
                projection.precision(original * 10);
                return {
                    move: function (mouse: [number, number] | null, scale: number) {
                        if (mouse) {
                            const xd = mouse[0] - startMouse[0] + rotation[0];
                            const yd = mouse[1] - startMouse[1] + rotation[1];
                            projection.rotate([xd * sensitivity, -yd * sensitivity, projection.rotate()[2]] as [number, number, number]);
                        }
                        const evenScale = Globes.ensureEvenScale(scale, projection);
                        projection.scale(evenScale);
                    },
                    end: function () {
                        projection.precision(original);
                    }
                };
            },

            /**
             * @returns {Array} the transform to apply, if any, to orient this globe to the specified coordinates.
             */
            locate: function (coord: [number, number]): [number, number, number] | null {
                return null;
            },

            /**
             * Draws a polygon on the specified context of this globe's boundary.
             * @param context a Canvas element's 2d context.
             * @returns the context
             */
            defineMask: function (context: CanvasRenderingContext2D): CanvasRenderingContext2D {
                context.beginPath();
                d3.geoPath().projection(this.projection).context(context)({ type: "Sphere" });

                // Add inward stroke to shrink the mask by a few pixels
                context.lineWidth = 4; // 4 pixel stroke = 2 pixel inward border
                context.strokeStyle = "rgba(0, 0, 0, 1)"; // Black stroke to "eat into" the shape
                context.globalCompositeOperation = "source-atop"; // Only stroke the filled area
                context.stroke();
                context.globalCompositeOperation = "source-over"; // Reset to normal

                return context;
            },

            /**
             * Appends the SVG elements that render this globe.
             * @param mapSvg the primary map SVG container.
             * @param foregroundSvg the foreground SVG container.
             */
            defineMap: function (mapSvg: any, foregroundSvg: any): void {
                var path = d3.geoPath().projection(this.projection);
                var defs = mapSvg.append("defs");
                defs.append("path")
                    .attr("id", "sphere")
                    .datum({ type: "Sphere" })
                    .attr("d", path);
                mapSvg.append("use")
                    .attr("xlink:href", "#sphere")
                    .attr("class", "background-sphere");

                // Create graticules with different steps
                const standardGraticule = d3.geoGraticule();
                const hemisphereGraticule = d3.geoGraticule()
                    .step([90, 90]); // Use step instead of minorStep/majorStep

                mapSvg.append("path")
                    .attr("class", "graticule")
                    .datum(standardGraticule)
                    .attr("d", path);
                mapSvg.append("path")
                    .attr("class", "hemisphere")
                    .datum(hemisphereGraticule)
                    .attr("d", path);
                mapSvg.append("path")
                    .attr("class", "coastline");
                mapSvg.append("path")
                    .attr("class", "lakes");
                mapSvg.append("path")
                    .attr("class", "rivers");
                foregroundSvg.append("use")
                    .attr("xlink:href", "#sphere")
                    .attr("class", "foreground-sphere");
            }
        };
    }

    private static newGlobe(source: Partial<Globe>, view: ViewportSize): Globe {
        const result = Object.assign(Globes.standardGlobe(), source);
        result.projection = result.newProjection(view);
        return result;
    }

    // Projection builder methods
    static atlantis(): Globe {
        return Globes.newGlobe({
            newProjection: function () {
                return d3GeoProjection.geoMollweide().rotate([30, -45, 90] as [number, number, number]).precision(0.1);
            }
        }, Utils.view());
    }

    static azimuthal_equidistant(): Globe {
        return Globes.newGlobe({
            newProjection: function () {
                return d3.geoAzimuthalEquidistant().precision(0.1).rotate([0, -90] as [number, number]).clipAngle(180 - 0.001);
            }
        }, Utils.view());
    }

    static conic_equidistant(): Globe {
        return Globes.newGlobe({
            newProjection: function () {
                const pos = Globes.currentPosition();
                return d3.geoConicEquidistant().rotate([pos[0], pos[1], 0] as [number, number, number]).precision(0.1);
            },
            center: function (view: ViewportSize) {
                return [view.width / 2, view.height / 2 + view.height * 0.065];
            }
        }, Utils.view());
    }

    static equirectangular(): Globe {
        return Globes.newGlobe({
            projectionType: 'equirectangular',
            newProjection: function () {
                const pos = Globes.currentPosition();
                return d3.geoEquirectangular().rotate([pos[0], pos[1], 0] as [number, number, number]).precision(0.1);
            }
        }, Utils.view());
    }

    static orthographic(): Globe {
        return Globes.newGlobe({
            projectionType: 'orthographic',
            newProjection: function () {
                const pos = Globes.currentPosition();
                return d3.geoOrthographic().rotate([pos[0], pos[1], 0] as [number, number, number]).precision(0.1).clipAngle(90 - 0.001);
            },
            defineMap: function (mapSvg: any, foregroundSvg: any) {
                const projection = this.projection;
                if (!projection) return;

                const path = d3.geoPath().projection(projection);
                const defs = mapSvg.append("defs");
                const gradientFill = defs.append("radialGradient")
                    .attr("id", "orthographic-fill")
                    .attr("gradientUnits", "objectBoundingBox")
                    .attr("cx", "50%").attr("cy", "49%").attr("r", "50%");
                gradientFill.append("stop").attr("stop-color", "#303030").attr("offset", "69%");
                gradientFill.append("stop").attr("stop-color", "#202020").attr("offset", "91%");
                gradientFill.append("stop").attr("stop-color", "#000005").attr("offset", "96%");
                defs.append("path")
                    .attr("id", "sphere")
                    .datum({ type: "Sphere" })
                    .attr("d", path);
                mapSvg.append("use")
                    .attr("xlink:href", "#sphere")
                    .attr("fill", "url(#orthographic-fill)");
                mapSvg.append("path")
                    .attr("class", "graticule")
                    .datum(d3.geoGraticule())
                    .attr("d", path);
                mapSvg.append("path")
                    .attr("class", "hemisphere")
                    .datum(d3.geoGraticule().step([90, 90]))
                    .attr("d", path);
                mapSvg.append("path")
                    .attr("class", "coastline");
                mapSvg.append("path")
                    .attr("class", "lakes");
                mapSvg.append("path")
                    .attr("class", "rivers");
                foregroundSvg.append("use")
                    .attr("xlink:href", "#sphere")
                    .attr("class", "foreground-sphere");
            },
            locate: function (coord: [number, number]): [number, number, number] | null {
                const projection = this.projection;
                if (!projection) return null;
                const rotate = projection.rotate();
                return [-coord[0], -coord[1], rotate[2]];
            }
        }, Utils.view());
    }

    static stereographic(): Globe {
        return Globes.newGlobe({
            newProjection: function (view: ViewportSize) {
                return d3.geoStereographic()
                    .rotate([-43, -20] as [number, number])
                    .precision(1.0)
                    .clipAngle(180 - 0.0001)
                    .clipExtent([[0, 0], [view.width, view.height]]);
            }
        }, Utils.view());
    }

    static waterman(): Globe {
        return Globes.newGlobe({
            newProjection: function () {
                return d3GeoProjection.geoPolyhedralWaterman()
                    .rotate([20, 0] as [number, number])
                    .precision(0.1);
            },
            defineMap: function (mapSvg: any, foregroundSvg: any) {
                const projection = this.projection;
                if (!projection) return;

                const path = d3.geoPath().projection(projection);
                const defs = mapSvg.append("defs");
                defs.append("path")
                    .attr("id", "sphere")
                    .datum({ type: "Sphere" })
                    .attr("d", path);
                defs.append("clipPath")
                    .attr("id", "clip")
                    .append("use")
                    .attr("xlink:href", "#sphere");
                mapSvg.append("use")
                    .attr("xlink:href", "#sphere")
                    .attr("class", "background-sphere");

                // Create graticules with different steps
                const standardGraticule = d3.geoGraticule();
                const hemisphereGraticule = d3.geoGraticule()
                    .step([90, 90]); // Use step instead of minorStep/majorStep

                mapSvg.append("path")
                    .attr("class", "graticule")
                    .attr("clip-path", "url(#clip)")
                    .datum(standardGraticule)
                    .attr("d", path);
                mapSvg.append("path")
                    .attr("class", "coastline")
                    .attr("clip-path", "url(#clip)");
                mapSvg.append("path")
                    .attr("class", "lakes")
                    .attr("clip-path", "url(#clip)");
                mapSvg.append("path")
                    .attr("class", "rivers")
                    .attr("clip-path", "url(#clip)");
                foregroundSvg.append("use")
                    .attr("xlink:href", "#sphere")
                    .attr("class", "foreground-sphere");
            }
        }, Utils.view());
    }

    static winkel3(): Globe {
        return Globes.newGlobe({
            newProjection: function () {
                return d3GeoProjection.geoWinkel3().precision(0.1);
            }
        }, Utils.view());
    }

    // Utility methods for accessing projections
    static get(name: string): (() => Globe) | undefined {
        const projectionBuilders: Record<string, () => Globe> = {
            atlantis: Globes.atlantis,
            azimuthal_equidistant: Globes.azimuthal_equidistant,
            conic_equidistant: Globes.conic_equidistant,
            equirectangular: Globes.equirectangular,
            orthographic: Globes.orthographic,
            stereographic: Globes.stereographic,
            waterman: Globes.waterman,
            winkel3: Globes.winkel3
        };
        return projectionBuilders[name];
    }

    static keys(): string[] {
        return [
            "atlantis",
            "azimuthal_equidistant",
            "conic_equidistant",
            "equirectangular",
            "orthographic",
            "stereographic",
            "waterman",
            "winkel3"
        ];
    }
}
