/**
 * globes - a set of models of the earth, each having their own kind of projection and onscreen behavior.
 *
 * Copyright (c) 2014 Cameron Beccario
 * The MIT License - http://opensource.org/licenses/MIT
 *
 * https://github.com/cambecc/earth
 */
import { ViewportSize } from './types/types';
import * as d3 from 'd3';
import µ from './micro';

// Add d3.geo type declarations for v3
declare module 'd3' {
    class GeoProjection {
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
        clipExtent(extent: [[number, number], [number, number]]): this;
        bounds(feature: { type: string }): [[number, number], [number, number]];
    }

    export namespace geo {
        export function path(): {
            projection: (projection: GeoProjection | null) => any;
            bounds: (feature: { type: string }) => [[number, number], [number, number]];
            context: (context: any) => any;
        };
        export function graticule(): { 
            minorStep: (step: [number, number]) => any;
            majorStep: (step: [number, number]) => any;
        };
        export function mollweide(): GeoProjection;
        export function azimuthalEquidistant(): GeoProjection;
        export function conicEquidistant(): GeoProjection;
        export function equirectangular(): GeoProjection;
        export function orthographic(): GeoProjection;
        export function stereographic(): GeoProjection;
        export function winkel3(): GeoProjection;
        export namespace polyhedron {
            export function waterman(): GeoProjection;
        }
    }
}

export interface Globe {
    projection: d3.GeoProjection | null;
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

function currentPosition(): [number, number] {
    const λ = µ.floorMod(new Date().getTimezoneOffset() / 4, 360);  // 24 hours * 60 min / 4 === 360 degrees
    return [λ, 0];
}

function ensureNumber(num: number | undefined | null, fallback: number): number {
    return (Number.isFinite(num) || num === Infinity || num === -Infinity ? num : fallback) as number;
}

function clampedBounds(bounds: any, view: ViewportSize) {
    var upperLeft = bounds[0];
    var lowerRight = bounds[1];
    var x = Math.max(Math.floor(ensureNumber(upperLeft[0], 0)), 0);
    var y = Math.max(Math.floor(ensureNumber(upperLeft[1], 0)), 0);
    var xMax = Math.min(Math.ceil(ensureNumber(lowerRight[0], view.width)), view.width - 1);
    var yMax = Math.min(Math.ceil(ensureNumber(lowerRight[1], view.height)), view.height - 1);
    return {x: x, y: y, xMax: xMax, yMax: yMax, width: xMax - x + 1, height: yMax - y + 1};
}

function standardGlobe(): Globe {
    return {
        /**
         * This globe's current D3 projection.
         */
        projection: null as d3.GeoProjection | null,

        /**
         * @param view the size of the view as {width:, height:}.
         * @returns {Object} a new D3 projection of this globe appropriate for the specified view port.
         */
        newProjection: function(view: ViewportSize): d3.GeoProjection {
            throw new Error("method must be overridden");
        },

        /**
         * @param view the size of the view as {width:, height:}.
         * @returns {{x: Number, y: Number, xMax: Number, yMax: Number, width: Number, height: Number}}
         *          the bounds of the current projection clamped to the specified view.
         */
        bounds: function(view: ViewportSize) {
            return clampedBounds(d3.geo.path().projection(this.projection).bounds({type: "Sphere"}), view);
        },

        /**
         * @param view the size of the view as {width:, height:}.
         * @returns {Number} the projection scale at which the entire globe fits within the specified view.
         */
        fit: function(view: ViewportSize) {
            var defaultProjection = this.newProjection(view);
            var bounds = d3.geo.path().projection(defaultProjection).bounds({type: "Sphere"});
            var hScale = (bounds[1][0] - bounds[0][0]) / defaultProjection.scale();
            var vScale = (bounds[1][1] - bounds[0][1]) / defaultProjection.scale();
            return Math.min(view.width / hScale, view.height / vScale) * 0.9;
        },

        /**
         * @param view the size of the view as {width:, height:}.
         * @returns {Array} the projection transform at which the globe is centered within the specified view.
         */
        center: function(view: ViewportSize) {
            return [view.width / 2, view.height / 2];
        },

        /**
         * @returns {Array} the range at which this globe can be zoomed.
         */
        scaleExtent: function() {
            return [25, 3000];
        },

        /**
         * Returns the current orientation of this globe as a string. If the arguments are specified,
         * mutates this globe to match the specified orientation string, usually in the form "lat,lon,scale".
         *
         * @param [o] the orientation string
         * @param [view] the size of the view as {width:, height:}.
         */
        orientation: function(o: string | undefined, view: ViewportSize): string | Globe {
            const projection = this.projection;
            if (!projection) {
                return "0,0,1";  // Default orientation if no projection exists
            }
            const rotate = projection.rotate();
            if (µ.isValue(o) && o !== undefined) {  // Extra check to satisfy TypeScript
                const parts = o.split(",");
                const λ = +parts[0], φ = +parts[1], scale = +parts[2];
                const extent = this.scaleExtent();
                projection.rotate(Number.isFinite(λ) && Number.isFinite(φ) ?
                    [-λ, -φ, rotate[2]] as [number, number, number] :
                    this.newProjection(view).rotate());
                projection.scale(Number.isFinite(scale) ? µ.clamp(scale, extent[0], extent[1]) : this.fit(view));
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
        manipulator: function(startMouse: [number, number], startScale: number) {
            const projection = this.projection;
            if (!projection) {
                return {
                    move: function() {},
                    end: function() {}
                };
            }
            const sensitivity = 60 / startScale;  // seems to provide a good drag scaling factor
            const rotation = [projection.rotate()[0] / sensitivity, -projection.rotate()[1] / sensitivity];
            const original = projection.precision();
            projection.precision(original * 10);
            return {
                move: function(mouse: [number, number] | null, scale: number) {
                    if (mouse) {
                        const xd = mouse[0] - startMouse[0] + rotation[0];
                        const yd = mouse[1] - startMouse[1] + rotation[1];
                        projection.rotate([xd * sensitivity, -yd * sensitivity, projection.rotate()[2]] as [number, number, number]);
                    }
                    projection.scale(scale);
                },
                end: function() {
                    projection.precision(original);
                }
            };
        },

        /**
         * @returns {Array} the transform to apply, if any, to orient this globe to the specified coordinates.
         */
        locate: function(coord: [number, number]): [number, number, number] | null {
            return null;
        },

        /**
         * Draws a polygon on the specified context of this globe's boundary.
         * @param context a Canvas element's 2d context.
         * @returns the context
         */
        defineMask: function(context: CanvasRenderingContext2D): CanvasRenderingContext2D {
            d3.geo.path().projection(this.projection).context(context)({type: "Sphere"});
            return context;
        },

        /**
         * Appends the SVG elements that render this globe.
         * @param mapSvg the primary map SVG container.
         * @param foregroundSvg the foreground SVG container.
         */
        defineMap: function(mapSvg: any, foregroundSvg: any): void {
            var path = d3.geo.path().projection(this.projection);
            var defs = mapSvg.append("defs");
            defs.append("path")
                .attr("id", "sphere")
                .datum({type: "Sphere"})
                .attr("d", path);
            mapSvg.append("use")
                .attr("xlink:href", "#sphere")
                .attr("class", "background-sphere");
            mapSvg.append("path")
                .attr("class", "graticule")
                .datum(d3.geo.graticule())
                .attr("d", path);
            mapSvg.append("path")
                .attr("class", "hemisphere")
                .datum(d3.geo.graticule().minorStep([0, 90]).majorStep([0, 90]))
                .attr("d", path);
            mapSvg.append("path")
                .attr("class", "coastline");
            mapSvg.append("path")
                .attr("class", "lakes");
            foregroundSvg.append("use")
                .attr("xlink:href", "#sphere")
                .attr("class", "foreground-sphere");
        }
    };
}

function newGlobe(source: Partial<Globe>, view: ViewportSize): Globe {
    const result = Object.assign(standardGlobe(), source);
    result.projection = result.newProjection(view);
    return result;
}

function atlantis(): Globe {
    return newGlobe({
        newProjection: function() {
            return d3.geo.mollweide().rotate([30, -45, 90] as [number, number, number]).precision(0.1);
        }
    }, µ.view());
}

function azimuthalEquidistant(): Globe {
    return newGlobe({
        newProjection: function() {
            return d3.geo.azimuthalEquidistant().precision(0.1).rotate([0, -90] as [number, number]).clipAngle(180 - 0.001);
        }
    }, µ.view());
}

function conicEquidistant(): Globe {
    return newGlobe({
        newProjection: function() {
            const pos = currentPosition();
            return d3.geo.conicEquidistant().rotate([pos[0], pos[1], 0] as [number, number, number]).precision(0.1);
        },
        center: function(view: ViewportSize) {
            return [view.width / 2, view.height / 2 + view.height * 0.065];
        }
    }, µ.view());
}

function equirectangular(): Globe {
    return newGlobe({
        newProjection: function() {
            const pos = currentPosition();
            return d3.geo.equirectangular().rotate([pos[0], pos[1], 0] as [number, number, number]).precision(0.1);
        }
    }, µ.view());
}

function orthographic(): Globe {
    return newGlobe({
        newProjection: function() {
            const pos = currentPosition();
            return d3.geo.orthographic().rotate([pos[0], pos[1], 0] as [number, number, number]).precision(0.1).clipAngle(90);
        },
        defineMap: function(mapSvg: any, foregroundSvg: any) {
            const projection = this.projection;
            if (!projection) return;
            
            const path = d3.geo.path().projection(projection);
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
                .datum({type: "Sphere"})
                .attr("d", path);
            mapSvg.append("use")
                .attr("xlink:href", "#sphere")
                .attr("fill", "url(#orthographic-fill)");
            mapSvg.append("path")
                .attr("class", "graticule")
                .datum(d3.geo.graticule())
                .attr("d", path);
            mapSvg.append("path")
                .attr("class", "hemisphere")
                .datum(d3.geo.graticule().minorStep([0, 90]).majorStep([0, 90]))
                .attr("d", path);
            mapSvg.append("path")
                .attr("class", "coastline");
            mapSvg.append("path")
                .attr("class", "lakes");
            foregroundSvg.append("use")
                .attr("xlink:href", "#sphere")
                .attr("class", "foreground-sphere");
        },
        locate: function(coord: [number, number]): [number, number, number] | null {
            const projection = this.projection;
            if (!projection) return null;
            const rotate = projection.rotate();
            return [-coord[0], -coord[1], rotate[2]];
        }
    }, µ.view());
}

function stereographic(): Globe {
    return newGlobe({
        newProjection: function(view: ViewportSize) {
            return d3.geo.stereographic()
                .rotate([-43, -20] as [number, number])
                .precision(1.0)
                .clipAngle(180 - 0.0001)
                .clipExtent([[0, 0], [view.width, view.height]]);
        }
    }, µ.view());
}

function waterman(): Globe {
    return newGlobe({
        newProjection: function() {
            return d3.geo.polyhedron.waterman().rotate([20, 0] as [number, number]).precision(0.1);
        },
        defineMap: function(mapSvg: any, foregroundSvg: any) {
            const projection = this.projection;
            if (!projection) return;
            
            const path = d3.geo.path().projection(projection);
            const defs = mapSvg.append("defs");
            defs.append("path")
                .attr("id", "sphere")
                .datum({type: "Sphere"})
                .attr("d", path);
            defs.append("clipPath")
                .attr("id", "clip")
                .append("use")
                .attr("xlink:href", "#sphere");
            mapSvg.append("use")
                .attr("xlink:href", "#sphere")
                .attr("class", "background-sphere");
            mapSvg.append("path")
                .attr("class", "graticule")
                .attr("clip-path", "url(#clip)")
                .datum(d3.geo.graticule())
                .attr("d", path);
            mapSvg.append("path")
                .attr("class", "coastline")
                .attr("clip-path", "url(#clip)");
            mapSvg.append("path")
                .attr("class", "lakes")
                .attr("clip-path", "url(#clip)");
            foregroundSvg.append("use")
                .attr("xlink:href", "#sphere")
                .attr("class", "foreground-sphere");
        }
    }, µ.view());
}

function winkel3(): Globe {
    return newGlobe({
        newProjection: function() {
            return d3.geo.winkel3().precision(0.1);
        }
    }, µ.view());
}

interface GlobesModule {
    atlantis: () => Globe;
    azimuthalEquidistant: () => Globe;
    conicEquidistant: () => Globe;
    equirectangular: () => Globe;
    orthographic: () => Globe;
    stereographic: () => Globe;
    waterman: () => Globe;
    winkel3: () => Globe;
    get: (name: string) => (() => Globe) | undefined;
    keys: () => string[];
}

const projectionBuilders = {
    atlantis,
    azimuthalEquidistant,
    conicEquidistant,
    equirectangular,
    orthographic,
    stereographic,
    waterman,
    winkel3
};

export const globes: GlobesModule = {
    ...projectionBuilders,
    get: (name: string) => projectionBuilders[name as keyof typeof projectionBuilders],
    keys: () => Object.keys(projectionBuilders)
};
