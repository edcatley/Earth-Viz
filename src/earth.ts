/**
 * earth - a project to visualize global air data.
 *
 * Copyright (c) 2014 Cameron Beccario
 * The MIT License - http://opensource.org/licenses/MIT
 *
 * https://github.com/cambecc/earth
 */

import * as Backbone from 'backbone';
import * as d3 from 'd3';
import { Selection, GeoProjection } from 'd3';
import { Globe, Point, Vector, GeoPoint } from './types/types';
import { globes } from './globes';
import { products } from './products';
import * as topojson from 'topojson-client';
import type { µ } from './types/types';  // Import µ type definitions

// Utility functions to replace underscore
function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout;
    return (...args: Parameters<T>) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

function throttle<T extends (...args: any[]) => any>(
    func: T,
    wait: number,
    options: { leading: boolean } = { leading: true }
): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout | null = null;
    let previous = 0;
    
    return (...args: Parameters<T>) => {
        const now = Date.now();
        if (!previous && !options.leading) {
            previous = now;
        }
        const remaining = wait - (now - previous);
        if (remaining <= 0 || remaining > wait) {
            if (timeout) {
                clearTimeout(timeout);
                timeout = null;
            }
            previous = now;
            func(...args);
        } else if (!timeout) {
            timeout = setTimeout(() => {
                previous = !options.leading ? 0 : Date.now();
                timeout = null;
                func(...args);
            }, remaining);
        }
    };
}

function randomInRange(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function intersection<T>(arr1: T[], arr2: T[]): T[] {
    const set = new Set(arr2);
    return arr1.filter(x => set.has(x));
}

function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
    return keys.reduce((acc, key) => {
        if (obj.hasOwnProperty(key)) {
            acc[key] = obj[key];
        }
        return acc;
    }, {} as Pick<T, K>);
}

function isEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (!isEqual(a[i], b[i])) return false;
        }
        return true;
    }
    if (typeof a === 'object' && typeof b === 'object') {
        const keysA = Object.keys(a);
        const keysB = Object.keys(b);
        if (keysA.length !== keysB.length) return false;
        return keysA.every(key => isEqual(a[key], b[key]));
    }
    return false;
}

// Add after the other utility functions
function extendWithEvents<T extends object>(obj: T): T & typeof Backbone.Events {
    return Object.assign(obj, Backbone.Events);
}

// Add interfaces for our types
interface Report {
    status: (msg: string) => void;
    error: (err: Error | string) => void;
    reset: () => void;
    progress: (amount: number) => void;
}

interface WindVector {
    0: number;  // u component
    1: number;  // v component
    2: number | null;  // magnitude
}

interface Operation {
    type: "click" | "spurious" | "drag" | "zoom";
    startMouse: [number, number];
    startScale: number;
    manipulator: {
        move: (mouse: [number, number] | null, scale: number) => void;
        end: () => void;
    };
}

interface GridProduct {
    date: Date;
    load: (cancel: { requested: boolean }) => Promise<any>;
    interpolate: (λ: number, φ: number) => any;
    particles: {
        velocityScale: number;
        maxIntensity: number;
    };
    type?: string;
    description: (langCode: string) => { name: string; qualifier: string };
    source?: string;
    units: Array<{ label: string }>;
    scale: {
        gradient: (value: number, alpha: number) => number[];
    };
}

interface Grids {
    primaryGrid: GridProduct;
    overlayGrid: GridProduct;
}

interface Configuration {
    attributes: Record<string, any>;
    get: (key: string) => any;
    save: (attrs: Record<string, any>, options?: { source?: string }) => void;
    on: (event: string, callback: (context: any, value: any) => void) => void;
    changedAttributes: () => string[];
}

interface InputController {
    globe: (g: Globe | null) => Globe | null;
}

interface Agent<T> {
    value: () => T;
    cancel: { requested: boolean };
    submit: (fn: (...args: any[]) => any, ...args: any[]) => void;
    trigger: (event: string, ...args: any[]) => void;
    _previous?: any;
}

interface ActiveLocation {
    point?: [number, number];
    coord?: [number, number];
}

declare const ga: ((command: string, ...args: any[]) => void) | undefined;

(function() {
    "use strict";

    var SECOND = 1000;
    var MINUTE = 60 * SECOND;
    var HOUR = 60 * MINUTE;
    var MAX_TASK_TIME = 100;                  // amount of time before a task yields control (millis)
    var MIN_SLEEP_TIME = 25;                  // amount of time a task waits before resuming (millis)
    var MIN_MOVE = 4;                         // slack before a drag operation beings (pixels)
    var MOVE_END_WAIT = 1000;                 // time to wait for a move operation to be considered done (millis)

    var OVERLAY_ALPHA = Math.floor(0.4*255);  // overlay transparency (on scale [0, 255])
    var INTENSITY_SCALE_STEP = 10;            // step size of particle intensity color scale
    var MAX_PARTICLE_AGE = 100;               // max number of frames a particle is drawn before regeneration
    var PARTICLE_LINE_WIDTH = 1.0;            // line width of a drawn particle
    var PARTICLE_MULTIPLIER = 7;              // particle count scalar (completely arbitrary--this values looks nice)
    var PARTICLE_REDUCTION = 0.75;            // reduce particle count to this much of normal for mobile devices
    var FRAME_RATE = 40;                      // desired milliseconds per frame

    var NULL_WIND_VECTOR = [NaN, NaN, null];  // singleton for undefined location outside the vector field [u, v, mag]
    var HOLE_VECTOR = [NaN, NaN, null];       // singleton that signifies a hole in the vector field
    var TRANSPARENT_BLACK = [0, 0, 0, 0];     // singleton 0 rgba
    var REMAINING = "▫▫▫▫▫▫▫▫▫▫▫▫▫▫▫▫▫▫▫▫▫▫";   // glyphs for remaining progress bar
    var COMPLETED = "▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪";   // glyphs for completed progress bar

    var view = µ.view();
    var log = µ.log();

    interface ErrorWithStatus extends Error {
        status?: number;
        message: string;
    }

    /**
     * An object to display various types of messages to the user.
     */
    const report = (function() {
        const s = d3.select("#status");
        const p = d3.select("#progress");
        const total = REMAINING.length;
        
        return {
            status: function(msg: string) {
                return s.classed("bad") ? s : s.text(msg);  // errors are sticky until reset
            },
            error: function(err: ErrorWithStatus | string) {
                let msg: string;
                if (typeof err === 'string') {
                    msg = err;
                } else {
                    msg = err.status ? `${err.status} ${err.message}` : err.message;
                    switch (err.status) {
                        case -1: msg = "Server Down"; break;
                        case 404: msg = "No Data"; break;
                    }
                    log.error(err);
                }
                return s.classed("bad", true).text(msg);
            },
            reset: function() {
                return s.classed("bad", false).text("");
            },
            progress: function(amount: number) {  // amount of progress to report in the range [0, 1]
                if (0 <= amount && amount < 1) {
                    const i = Math.ceil(amount * total);
                    const bar = COMPLETED.substr(0, i) + REMAINING.substr(0, total - i);
                    return p.classed("invisible", false).text(bar);
                }
                return p.classed("invisible", true).text("");  // progress complete
            }
        };
    })();

    function newAgent() {
        return µ.newAgent().on({"reject": report.error, "fail": report.error});
    }

    // Construct the page's main internal components:

    var configuration =
        µ.buildConfiguration(globes, products.overlayTypes);  // holds the page's current configuration settings
    var inputController = buildInputController();             // interprets drag/zoom operations
    var meshAgent = newAgent();      // map data for the earth
    var globeAgent = newAgent();     // the model of the globe
    var gridAgent = newAgent();      // the grid of weather data
    var rendererAgent = newAgent();  // the globe SVG renderer
    var fieldAgent = newAgent();     // the interpolated wind vector field
    var animatorAgent = newAgent();  // the wind animator
    var overlayAgent = newAgent();   // color overlay over the animation

    /**
     * The input controller is an object that translates move operations (drag and/or zoom) into mutations of the
     * current globe's projection, and emits events so other page components can react to these move operations.
     *
     * D3's built-in Zoom behavior is used to bind to the document's drag/zoom events, and the input controller
     * interprets D3's events as move operations on the globe. This method is complicated due to the complex
     * event behavior that occurs during drag and zoom.
     *
     * D3 move operations usually occur as "zoomstart" -> ("zoom")* -> "zoomend" event chain. During "zoom" events
     * the scale and mouse may change, implying a zoom or drag operation accordingly. These operations are quite
     * noisy. What should otherwise be one smooth continuous zoom is usually comprised of several "zoomstart" ->
     * "zoom" -> "zoomend" event chains. A debouncer is used to eliminate the noise by waiting a short period of
     * time to ensure the user has finished the move operation.
     *
     * The "zoom" events may not occur; a simple click operation occurs as: "zoomstart" -> "zoomend". There is
     * additional logic for other corner cases, such as spurious drags which move the globe just a few pixels
     * (most likely unintentional), and the tendency for some touch devices to issue events out of order:
     * "zoom" -> "zoomstart" -> "zoomend".
     *
     * This object emits clean "moveStart" -> ("move")* -> "moveEnd" events for move operations, and "click" events
     * for normal clicks. Spurious moves emit no events.
     */
    function buildInputController() {
        let globe: Globe | null = null;
        let op: Operation | null = null;

        function newOp(startMouse: [number, number], startScale: number): Operation {
            if (!globe) throw new Error("Globe not initialized");
            return {
                type: "click",  // initially assumed to be a click operation
                startMouse: startMouse,
                startScale: startScale,
                manipulator: globe.manipulator(startMouse, startScale)
            };
        }

        const zoom = d3.zoom<HTMLElement, unknown>()
            .on("start", function(event: d3.D3ZoomEvent<HTMLElement, unknown>) {
                op = op || newOp(d3.pointer(event, this), event.transform.k);  // a new operation begins
            })
            .on("zoom", function(event: d3.D3ZoomEvent<HTMLElement, unknown>) {
                const currentMouse = d3.pointer(event, this);
                const currentScale = event.transform.k;
                op = op || newOp(currentMouse, 1);  // Fix bug on some browsers where zoomstart fires out of order.
                if (op && (op.type === "click" || op.type === "spurious")) {
                    const distanceMoved = µ.distance(currentMouse, op.startMouse);
                    if (currentScale === op.startScale && distanceMoved < MIN_MOVE) {
                        // to reduce annoyance, ignore op if mouse has barely moved and no zoom is occurring
                        op.type = distanceMoved > 0 ? "click" : "spurious";
                        return;
                    }
                    dispatch.trigger("moveStart");
                    op.type = "drag";
                }
                if (op && currentScale != op.startScale) {
                    op.type = "zoom";  // whenever a scale change is detected, (stickily) switch to a zoom operation
                }

                // when zooming, ignore whatever the mouse is doing--really cleans up behavior on touch devices
                if (op?.manipulator) {
                    op.manipulator.move(op.type === "zoom" ? null : currentMouse, currentScale);
                }
                dispatch.trigger("move");
            })
            .on("end", function() {
                if (!op) return;
                if (op.manipulator) {
                    op.manipulator.end();
                }
                if (op.type === "click") {
                    const projection = globe?.projection;
                    if (projection?.invert) {
                        const projectedCoord = projection(op.startMouse);
                        dispatch.trigger("click", projectedCoord, op.startMouse);
                    }
                }
                else if (op.type !== "spurious") {
                    signalEnd();
                }
                op = null;  // the drag/zoom/click operation is over
            });

        var signalEnd = debounce(function() {
            if (!op || op.type !== "drag" && op.type !== "zoom") {
                if (globe) {
                    configuration.save({orientation: globe.orientation()}, {source: "moveEnd"});
                }
                dispatch.trigger("moveEnd");
            }
        }, MOVE_END_WAIT);  // wait for a bit to decide if user has stopped moving the globe

        d3.select<HTMLElement, unknown>("#display").call(zoom);
        d3.select("#show-location").on("click", function() {
            if (navigator.geolocation) {
                report.status("Finding current position...");
                navigator.geolocation.getCurrentPosition(function(pos) {
                    report.status("");
                    if (!globe) return;
                    const coord: GeoPoint = [pos.coords.longitude, pos.coords.latitude];
                    const rotate = globe.locate(coord);
                    if (rotate) {
                        const projection = globe.projection;
                        if (projection) {
                            projection.rotate(rotate);
                            configuration.save({orientation: globe.orientation()});  // triggers reorientation
                        }
                    }
                    const projection = globe.projection;
                    if (projection?.invert) {
                        const projectedCoord = projection(coord);
                        dispatch.trigger("click", projectedCoord, coord);
                    }
                }, log.error);
            }
        });

        function reorient() {
            var options = arguments[3] || {};
            if (!globe || options.source === "moveEnd") {
                // reorientation occurred because the user just finished a move operation, so globe is already
                // oriented correctly.
                return;
            }
            dispatch.trigger("moveStart");
            globe.orientation(configuration.get("orientation"), view);
            const projection = globe.projection;
            if (projection) {
                zoom.transform(d3.select<HTMLElement, unknown>("#display"), d3.zoomIdentity.scale(projection.scale()));
            }
            dispatch.trigger("moveEnd");
        }

        var dispatch = extendWithEvents({
            globe: function(g: Globe | null) {
                if (g) {
                    globe = g;
                    zoom.scaleExtent(g.scaleExtent());
                    reorient();
                }
                return g ? this : globe;
            }
        });
        return dispatch.listenTo(configuration, "change:orientation", reorient);
    }

    // Replace when.js defer pattern with a Promise factory
    function createDeferred<T>() {
        let resolve: (value: T | PromiseLike<T>) => void;
        let reject: (reason?: any) => void;
        const promise = new Promise<T>((res, rej) => {
            resolve = res;
            reject = rej;
        });
        return { promise, resolve: resolve!, reject: reject! };
    }

    /**
     * @param resource the GeoJSON resource's URL
     * @returns {Promise<Object>} a promise for GeoJSON topology features: {boundaryLo:, boundaryHi:}
     */
    function buildMesh(this: { cancel: { requested: boolean } }, resource: string): Promise<any> {
        const cancel = this.cancel;
        report.status("Downloading...");
        return µ.loadJson(resource).then(function(topo: any) {
            if (cancel.requested) return null;
            log.time("building meshes");
            const o = topo.objects;
            const coastLo = topojson.feature(topo, µ.isMobile() ? o.coastline_tiny : o.coastline_110m);
            const coastHi = topojson.feature(topo, µ.isMobile() ? o.coastline_110m : o.coastline_50m);
            const lakesLo = topojson.feature(topo, µ.isMobile() ? o.lakes_tiny : o.lakes_110m);
            const lakesHi = topojson.feature(topo, µ.isMobile() ? o.lakes_110m : o.lakes_50m);
            log.timeEnd("building meshes");
            return {
                coastLo: coastLo,
                coastHi: coastHi,
                lakesLo: lakesLo,
                lakesHi: lakesHi
            };
        });
    }

    /**
     * @param {String} projectionName the desired projection's name.
     * @returns {Object} a promise for a globe object.
     */
    function buildGlobe(projectionName: string): Promise<Globe> {
        var builder = globes.get(projectionName);
        if (!builder) {
            return Promise.reject(new Error("Unknown projection: " + projectionName));
        }
        return Promise.resolve(builder());
    }

    // Some hacky stuff to ensure only one download can be in progress at a time.
    var downloadsInProgress = 0;

    function buildGrids(this: { cancel: { requested: boolean } }) {
        report.status("Downloading...");
        log.time("build grids");
        var cancel = this.cancel;
        downloadsInProgress++;
        const loaded = Promise.all(
            products.productsFor(configuration.attributes)
            .map((product: any) => {
                if (product && typeof product.load === 'function') {
                    return product.load(cancel);
                }
                return Promise.resolve(null);
            })
            .filter((p: Promise<any> | null) => p !== null)
        );
        return loaded.then(products => {
            log.time("build grids");
            return {primaryGrid: products[0], overlayGrid: products[1] || products[0]};
        }).finally(() => {
            downloadsInProgress--;
        });
    }

    /**
     * Modifies the configuration to navigate to the chronologically next or previous data layer.
     */
    function navigate(step: number): void {
        if (downloadsInProgress > 0) {
            log.debug("Download in progress--ignoring nav request.");
            return;
        }
        var next = gridAgent.value().primaryGrid.navigate(step);
        if (next) {
            configuration.save(µ.dateToConfig(next));
        }
    }

    function buildRenderer(mesh: any, globe: Globe): string | null {
        if (!mesh || !globe) return null;

        report.status("Rendering Globe...");
        log.time("rendering map");

        // UNDONE: better way to do the following?
        const dispatch = extendWithEvents({});
        if (rendererAgent._previous) {
            rendererAgent._previous.stopListening();
        }
        rendererAgent._previous = dispatch;

        // First clear map and foreground svg contents.
        const mapNode = d3.select("#map").node();
        const foregroundNode = d3.select("#foreground").node();
        if (mapNode instanceof HTMLElement) µ.removeChildren(mapNode);
        if (foregroundNode instanceof HTMLElement) µ.removeChildren(foregroundNode);
        
        // Create new map svg elements.
        globe.defineMap(d3.select("#map"), d3.select("#foreground"));

        const geoPath = d3.geoPath().projection(globe.projection);
        const path = (d: any) => geoPath(d);
        const coastline = d3.select(".coastline");
        const lakes = d3.select(".lakes");
        d3.selectAll("path").attr("d", path);  // do an initial draw -- fixes issue with safari

        function drawLocationMark(point: [number, number], coord: [number, number]) {
            // show the location on the map if defined
            if (fieldAgent.value() && !fieldAgent.value().isInsideBoundary(point[0], point[1])) {
                return;  // outside the field boundary, so ignore.
            }
            if (coord && Number.isFinite(coord[0]) && Number.isFinite(coord[1])) {
                let mark = d3.select<SVGPathElement, unknown>(".location-mark");
                if (!mark.node()) {
                    mark = d3.select<SVGPathElement, unknown>("#foreground")
                        .append<SVGPathElement>("path")
                        .attr("class", "location-mark");
                }
                mark.datum({type: "Point", coordinates: coord}).attr("d", path);
            }
        }

        // Draw the location mark if one is currently visible.
        if (activeLocation.point && activeLocation.coord) {
            drawLocationMark(activeLocation.point, activeLocation.coord);
        }

        // Throttled draw method helps with slow devices that would get overwhelmed by too many redraw events.
        const REDRAW_WAIT = 5;  // milliseconds
        let doDraw_throttled = throttle(doDraw, REDRAW_WAIT, {leading: false});

        function doDraw() {
            d3.selectAll("path").attr("d", path);
            rendererAgent.trigger("redraw");
            doDraw_throttled = throttle(doDraw, REDRAW_WAIT, {leading: false});
        }

        // Attach to map rendering events on input controller.
        dispatch.listenTo(
            inputController,
            "moveStart move moveEnd click",
            function(event: string, ...args: any[]) {
                switch(event) {
                    case "moveStart":
                        coastline.datum(mesh.coastLo);
                        lakes.datum(mesh.lakesLo);
                        rendererAgent.trigger("start");
                        break;
                    case "move":
                        doDraw_throttled();
                        break;
                    case "moveEnd":
                        coastline.datum(mesh.coastHi);
                        lakes.datum(mesh.lakesHi);
                        d3.selectAll("path").attr("d", path);
                        rendererAgent.trigger("render");
                        break;
                    case "click":
                        drawLocationMark(args[0], args[1]);
                        break;
                }
            }
        );

        // Finally, inject the globe model into the input controller. Do it on the next event turn to ensure
        // renderer is fully set up before events start flowing.
        Promise.resolve().then(() => {
            inputController.globe(globe);
        });

        log.timeEnd("rendering map");
        return "ready";
    }

    interface MaskInterface {
        imageData: ImageData;
        isVisible: (x: number, y: number) => boolean;
        set: (x: number, y: number, rgba: number[]) => MaskInterface;
    }

    function createMask(globe: Globe | null): MaskInterface | null {
        if (!globe) return null;

        log.time("render mask");

        // Create a detached canvas, ask the model to define the mask polygon, then fill with an opaque color.
        const width = view.width;
        const height = view.height;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        
        const context = globe.defineMask(ctx);
        if (!context) return null;
        
        context.fillStyle = "rgba(255, 0, 0, 1)";
        context.fill();

        const imageData = context.getImageData(0, 0, width, height);
        const data = imageData.data;  // layout: [r, g, b, a, r, g, b, a, ...]
        log.timeEnd("render mask");
        
        const mask: MaskInterface = {
            imageData: imageData,
            isVisible: function(x: number, y: number): boolean {
                const i = (y * width + x) * 4;
                return data[i + 3] > 0;  // non-zero alpha means pixel is visible
            },
            set: function(x: number, y: number, rgba: number[]): MaskInterface {
                const i = (y * width + x) * 4;
                data[i    ] = rgba[0];
                data[i + 1] = rgba[1];
                data[i + 2] = rgba[2];
                data[i + 3] = rgba[3];
                return this;
            }
        };
        return mask;
    }

    interface Field {
        (x: number, y: number): [number, number, number | null];
        isDefined(x: number, y: number): boolean;
        isInsideBoundary(x: number, y: number): boolean;
        release(): void;
        randomize(o: { x: number; y: number; age: number }): typeof o;
        overlay: ImageData;
    }

    function createField(columns: any[][], bounds: { x: number; y: number; xMax: number; yMax: number }, mask: { imageData: ImageData }): Field {
        function field(x: number, y: number): [number, number, number | null] {
            const column = columns[Math.round(x)];
            return column && column[Math.round(y)] || NULL_WIND_VECTOR;
        }

        field.isDefined = function(x: number, y: number): boolean {
            return field(x, y)[2] !== null;
        };

        field.isInsideBoundary = function(x: number, y: number): boolean {
            return field(x, y) !== NULL_WIND_VECTOR;
        };

        field.release = function(): void {
            columns = [];
        };

        field.randomize = function(o: { x: number; y: number; age: number }): typeof o {
            let x: number, y: number;
            let safetyNet = 0;
            do {
                x = Math.round(randomInRange(bounds.x, bounds.xMax));
                y = Math.round(randomInRange(bounds.y, bounds.yMax));
            } while (!field.isDefined(x, y) && safetyNet++ < 30);
            o.x = x;
            o.y = y;
            return o;
        };

        field.overlay = mask.imageData;

        return field;
    }

    /**
     * Calculate distortion of the wind vector caused by the shape of the projection at point (x, y). The wind
     * vector is modified in place and returned by this function.
     */
    function distort(
        projection: d3.GeoProjection,
        λ: number,
        φ: number,
        x: number,
        y: number,
        scale: number,
        wind: [number, number, number]
    ): [number, number, number] {
        var u = wind[0] * scale;
        var v = wind[1] * scale;
        var d = µ.distortion(projection, λ, φ, x, y);

        // Scale distortion vectors by u and v, then add.
        wind[0] = d[0] * u + d[2] * v;
        wind[1] = d[1] * u + d[3] * v;
        return wind;
    }

    function interpolateField(this: { cancel: { requested: boolean } }, globe: Globe, grids: Grids | null): Promise<any> | null {
        if (!globe || !grids) return null;

        const mask = createMask(globe);
        const primaryGrid = grids.primaryGrid;
        const overlayGrid = grids.overlayGrid;

        log.time("interpolating field");
        const d = createDeferred<any>();
        const cancel = this.cancel;

        const projection = globe.projection;
        const bounds = globe.bounds(view);
        // How fast particles move on the screen (arbitrary value chosen for aesthetics).
        const velocityScale = bounds.height * primaryGrid.particles.velocityScale;

        const columns: any[] = [];
        const point: [number, number] = [0, 0];
        let x = bounds.x;
        const interpolate = primaryGrid.interpolate;
        const overlayInterpolate = overlayGrid.interpolate;
        const hasDistinctOverlay = primaryGrid !== overlayGrid;
        const scale = overlayGrid.scale;

        function interpolateColumn(x: number) {
            const column: any[] = [];
            for (let y = bounds.y; y <= bounds.yMax; y += 2) {
                if (mask?.isVisible(x, y)) {
                    point[0] = x; point[1] = y;
                    const coord = projection?.invert?.(point);
                    let color = TRANSPARENT_BLACK;
                    let wind = null;
                    if (coord) {
                        const λ = coord[0], φ = coord[1];
                        if (Number.isFinite(λ)) {
                            wind = interpolate(λ, φ);
                            let scalar = null;
                            if (wind && projection) {
                                wind = distort(projection as unknown as d3.GeoProjection, λ, φ, x, y, velocityScale, wind);
                                scalar = wind[2];
                            }
                            if (hasDistinctOverlay) {
                                scalar = overlayInterpolate(λ, φ);
                            }
                            if (µ.isValue(scalar)) {
                                color = scale.gradient(scalar, OVERLAY_ALPHA);
                            }
                        }
                    }
                    column[y+1] = column[y] = wind || HOLE_VECTOR;
                    mask.set(x, y, color).set(x+1, y, color).set(x, y+1, color).set(x+1, y+1, color);
                }
            }
            columns[x+1] = columns[x] = column;
        }

        report.status("");

        (function batchInterpolate() {
            try {
                if (!cancel.requested) {
                    const start = Date.now();
                    while (x < bounds.xMax) {
                        interpolateColumn(x);
                        x += 2;
                        if ((Date.now() - start) > MAX_TASK_TIME) {
                            // Interpolation is taking too long. Schedule the next batch for later and yield.
                            report.progress((x - bounds.x) / (bounds.xMax - bounds.x));
                            setTimeout(batchInterpolate, MIN_SLEEP_TIME);
                            return;
                        }
                    }
                }
                if (!mask) {
                    d.reject(new Error("Failed to create mask"));
                    return;
                }
                d.resolve(createField(columns, bounds, mask));
            }
            catch (e) {
                d.reject(e as ErrorWithStatus);
            }
            report.progress(1);  // 100% complete
            log.timeEnd("interpolating field");
        })();

        return d.promise;
    }

    interface Particle {
        age: number;
        x: number;
        y: number;
        xt?: number;
        yt?: number;
    }

    interface ColorStyles extends Array<string> {
        indexFor(m: number): number;
    }

    function animate(this: { cancel: { requested: boolean } }, globe: Globe, field: any, grids: any) {
        if (!globe || !field || !grids) return;

        const cancel = this?.cancel;
        const bounds = globe.bounds(view);
        // maxIntensity is the velocity at which particle color intensity is maximum
        const colorStyles = µ.windIntensityColorScale(INTENSITY_SCALE_STEP, grids.primaryGrid.particles.maxIntensity) as ColorStyles;
        const buckets = colorStyles.map(function() { return [] as Particle[]; });
        let particleCount = Math.round(bounds.width * PARTICLE_MULTIPLIER);
        if (µ.isMobile()) {
            particleCount *= PARTICLE_REDUCTION;
        }
        var fadeFillStyle = µ.isFF() ? "rgba(0, 0, 0, 0.95)" : "rgba(0, 0, 0, 0.97)";  // FF Mac alpha behaves oddly

        log.debug("particle count: " + particleCount);
        var particles: Particle[] = [];
        for (var i = 0; i < particleCount; i++) {
            particles.push(field.randomize({age: randomInRange(0, MAX_PARTICLE_AGE)}));
        }

        function evolve() {
            buckets.forEach(function(bucket) { bucket.length = 0; });
            particles.forEach(function(particle) {
                if (particle.age > MAX_PARTICLE_AGE) {
                    field.randomize(particle).age = 0;
                }
                var x = particle.x;
                var y = particle.y;
                var v = field(x, y);  // vector at current position
                var m = v[2];
                if (m === null) {
                    particle.age = MAX_PARTICLE_AGE;  // particle has escaped the grid, never to return...
                }
                else {
                    var xt = x + v[0];
                    var yt = y + v[1];
                    if (field.isDefined(xt, yt)) {
                        // Path from (x,y) to (xt,yt) is visible, so add this particle to the appropriate draw bucket.
                        particle.xt = xt;
                        particle.yt = yt;
                        buckets[colorStyles.indexFor(m)].push(particle);
                    }
                    else {
                        // Particle isn't visible, but it still moves through the field.
                        particle.x = xt;
                        particle.y = yt;
                    }
                }
                particle.age += 1;
            });
        }

        const canvas = d3.select("#animation").node() as HTMLCanvasElement | null;
        if (!canvas) return;
        const g = canvas.getContext("2d");
        if (!g) return;
        g.lineWidth = PARTICLE_LINE_WIDTH;
        g.fillStyle = fadeFillStyle;

        function draw() {
            if (!g) return;  // Extra safety check
            // Fade existing particle trails.
            const prev = g.globalCompositeOperation;
            g.globalCompositeOperation = "destination-in";
            g.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
            g.globalCompositeOperation = prev;

            // Draw new particle trails.
            buckets.forEach(function(bucket, i) {
                if (bucket.length > 0) {
                    g.beginPath();
                    g.strokeStyle = colorStyles[i];
                    bucket.forEach(function(particle) {
                        if (typeof particle.xt === 'number' && typeof particle.yt === 'number') {
                            g.moveTo(particle.x, particle.y);
                            g.lineTo(particle.xt, particle.yt);
                            particle.x = particle.xt;
                            particle.y = particle.yt;
                        }
                    });
                    g.stroke();
                }
            });
        }

        (function frame() {
            try {
                if (cancel.requested) {
                    field.release();
                    return;
                }
                evolve();
                draw();
                setTimeout(frame, FRAME_RATE);
            }
            catch (e) {
                report.error(e as ErrorWithStatus);
            }
        })();
    }

    function drawGridPoints(ctx: CanvasRenderingContext2D, grid: any, globe: Globe | null) {
        if (!grid || !globe || !configuration.get("showGridPoints")) return;

        ctx.fillStyle = "rgba(255, 255, 255, 1)";
        // Use the clipping behavior of a projection stream to quickly draw visible points.
        const projection = globe.projection;
        if (projection) {
            const stream = projection.stream({
                point: function(x: number, y: number) {
                    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
                },
                lineStart: () => {},
                lineEnd: () => {},
                polygonStart: () => {},
                polygonEnd: () => {}
            });
            grid.forEachPoint(function(λ: number, φ: number, d: any) {
                if (µ.isValue(d)) {
                    stream.point(λ, φ);
                }
            });
        }
    }

    function drawOverlay(field: { overlay: ImageData } | null, overlayType: string | null) {
        if (!field) return;

        const overlayCanvas = d3.select("#overlay").node() as HTMLCanvasElement | null;
        const scaleCanvas = d3.select("#scale").node() as HTMLCanvasElement | null;
        if (!overlayCanvas || !scaleCanvas) return;

        const ctx = overlayCanvas.getContext("2d");
        const scaleCtx = scaleCanvas.getContext("2d");
        if (!ctx || !scaleCtx) return;

        const grid = (gridAgent.value() || {}).overlayGrid;

        µ.clearCanvas(overlayCanvas);
        µ.clearCanvas(scaleCanvas);
        
        if (overlayType) {
            if (overlayType !== "off") {
                ctx.putImageData(field.overlay, 0, 0);
            }
            drawGridPoints(ctx, grid, globeAgent.value());
        }

        if (grid) {
            // Draw color bar for reference.
            const scale = grid.scale;
            const bounds = scale.bounds;
            const width = scaleCanvas.width - 1;
            
            for (let i = 0; i <= width; i++) {
                const rgb = scale.gradient(µ.spread(i / width, bounds[0], bounds[1]), 1);
                scaleCtx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
                scaleCtx.fillRect(i, 0, 1, scaleCanvas.height);
            }

            // Show tooltip on hover.
            d3.select("#scale").on("mousemove", function(event: MouseEvent) {
                const x = d3.pointer(event)[0];
                const pct = µ.clamp((Math.round(x) - 2) / (width - 2), 0, 1);
                const value = µ.spread(pct, bounds[0], bounds[1]);
                const elementId = grid.type === "wind" ? "#location-wind-units" : "#location-value-units";
                const units = createUnitToggle(elementId, grid).value();
                d3.select("#scale").attr("title", µ.formatScalar(value, units) + " " + units.label);
            });
        }
    }

    interface GridData {
        primaryGrid: {
            date: Date;
        };
    }

    function validityDate(grids: GridData | null): number {
        // When the active layer is considered "current", use its time as now, otherwise use current time as
        // now (but rounded down to the nearest three-hour block).
        const THREE_HOURS = 3 * HOUR;
        const now = grids ? grids.primaryGrid.date.getTime() : Math.floor(Date.now() / THREE_HOURS) * THREE_HOURS;
        const parts = configuration.get("date").split("/");  // yyyy/mm/dd or "current"
        const hhmm = configuration.get("hour");
        return parts.length > 1 ?
            Date.UTC(+parts[0], parts[1] - 1, +parts[2], +hhmm.substring(0, 2)) :
            parts[0] === "current" ? now : 0;
    }

    function showDate(grids: GridData | null): void {
        const date = new Date(validityDate(grids));
        const isLocal = d3.select("#data-date").classed("local");
        const formatted = isLocal ? µ.toLocalISO(date) : µ.toUTCISO(date);
        d3.select("#data-date").text(formatted + " " + (isLocal ? "Local" : "UTC"));
        d3.select("#toggle-zone").text("⇄ " + (isLocal ? "UTC" : "Local"));
    }

    interface GridDetails extends GridData {
        primaryGrid: {
            date: Date;
            description: (langCode: string) => { name: string; qualifier: string };
        };
        overlayGrid: {
            description: (langCode: string) => { name: string; qualifier: string };
            source: string;
        };
    }

    interface UnitToggle {
        value: () => { label: string };
        next: () => void;
    }

    function showGridDetails(grids: GridDetails | null): void {
        showDate(grids);
        let description = "";
        let center = "";
        
        if (grids) {
            const langCode = d3.select<HTMLElement, unknown>("body").node()?.getAttribute("data-lang") || "en";
            const pd = grids.primaryGrid.description(langCode);
            const od = grids.overlayGrid.description(langCode);
            description = od.name + od.qualifier;
            if (grids.primaryGrid.description !== grids.overlayGrid.description) {
                // Combine both grid descriptions together with a " + " if their qualifiers are the same.
                description = (pd.qualifier === od.qualifier ? pd.name : pd.name + pd.qualifier) + " + " + description;
            }
            center = grids.overlayGrid.source;
        }
        
        d3.select("#data-layer").text(description);
        d3.select("#data-center").text(center);
    }

    function createUnitToggle(id: string, product: { units: Array<{ label: string }> }): UnitToggle {
        const units = product.units;
        const size = units.length;
        let index = +(d3.select(id).attr("data-index") || 0) % size;
        
        return {
            value: function() {
                return units[index];
            },
            next: function() {
                d3.select(id).attr("data-index", index = ((index + 1) % size));
            }
        };
    }

    interface WindProduct {
        units: Array<{ label: string }>;
    }

    function showWindAtLocation(wind: [number, number, number], product: WindProduct): void {
        const unitToggle = createUnitToggle("#location-wind-units", product);
        const units = unitToggle.value();
        d3.select("#location-wind").text(µ.formatVector(wind, units));
        d3.select("#location-wind-units").text(units.label).on("click", function() {
            unitToggle.next();
            showWindAtLocation(wind, product);
        });
    }

    function showOverlayValueAtLocation(value: number, product: WindProduct): void {
        const unitToggle = createUnitToggle("#location-value-units", product);
        const units = unitToggle.value();
        d3.select("#location-value").text(µ.formatScalar(value, units));
        d3.select("#location-value-units").text(units.label).on("click", function() {
            unitToggle.next();
            showOverlayValueAtLocation(value, product);
        });
    }

    // Stores the point and coordinate of the currently visible location. This is used to update the location
    // details when the field changes.
    let activeLocation: ActiveLocation = {};

    /**
     * Display a local data callout at the given [x, y] point and its corresponding [lon, lat] coordinates.
     * The location may not be valid, in which case no callout is displayed. Display location data for both
     * the primary grid and overlay grid, performing interpolation when necessary.
     */
    function showLocationDetails(point?: [number, number], coord?: [number, number]): void {
        const safePoint = point || [0, 0];
        const safeCoord = coord || [0, 0];
        const grids = gridAgent.value();
        const field = fieldAgent.value();
        const λ = safeCoord[0];
        const φ = safeCoord[1];

        if (!field || !field.isInsideBoundary(safePoint[0], safePoint[1])) {
            return;
        }

        clearLocationDetails(false);  // clean the slate
        activeLocation = {point, coord};  // remember where the current location is

        if (Number.isFinite(λ) && Number.isFinite(φ)) {
            d3.select("#location-coord").text(µ.formatCoordinates(λ, φ));
            d3.select("#location-close").classed("invisible", false);
        }

        if (field.isDefined(safePoint[0], safePoint[1]) && grids) {
            const wind = grids.primaryGrid.interpolate(λ, φ);
            if (µ.isValue(wind)) {
                showWindAtLocation(wind, grids.primaryGrid);
            }
            if (grids.overlayGrid !== grids.primaryGrid) {
                const value = grids.overlayGrid.interpolate(λ, φ);
                if (µ.isValue(value)) {
                    showOverlayValueAtLocation(value, grids.overlayGrid);
                }
            }
        }
    }

    function updateLocationDetails() {
        showLocationDetails(activeLocation.point, activeLocation.coord);
    }

    function clearLocationDetails(clearEverything: boolean): void {
        d3.select("#location-coord").text("");
        d3.select("#location-close").classed("invisible", true);
        d3.select("#location-wind").text("");
        d3.select("#location-wind-units").text("");
        d3.select("#location-value").text("");
        d3.select("#location-value-units").text("");
        if (clearEverything) {
            activeLocation = {};
            d3.select(".location-mark").remove();
        }
    }

    function stopCurrentAnimation(alsoClearCanvas: boolean) {
        animatorAgent.cancel();
        if (alsoClearCanvas) {
            const canvas = d3.select("#animation").node() as HTMLCanvasElement | null;
            µ.clearCanvas(canvas);
        }
    }

    interface ConfigurationModel {
        attributes: Record<string, any>;
    }

    function bindButtonToConfiguration(elementId: string, newAttr: Record<string, any>, keys?: string[]): void {
        keys = keys || Object.keys(newAttr);
        d3.select(elementId).on("click", function() {
            if (d3.select(elementId).classed("disabled")) return;
            configuration.save(newAttr);
        });
        configuration.on("change", function(model: ConfigurationModel) {
            const attr = model.attributes;
            d3.select(elementId).classed("highlighted", isEqual(pick(attr, keys), pick(newAttr, keys)));
        });
    }

    function reportSponsorClick(type: string): void {
        if (typeof ga !== 'undefined') {
            ga("send", "event", "sponsor", type);
        }
    }

    /**
     * Registers all event handlers to bind components and page elements together. There must be a cleaner
     * way to accomplish this...
     */
    function init() {
        report.status("Initializing...");

        d3.select("#sponsor-link")
            .attr("target", µ.isEmbeddedInIFrame() ? "_new" : null)
            .on("click", reportSponsorClick.bind(null, "click"))
            .on("contextmenu", reportSponsorClick.bind(null, "right-click"))
        d3.select("#sponsor-hide").on("click", function() {
            d3.select("#sponsor").classed("invisible", true);
        });

        d3.selectAll(".fill-screen").attr("width", view.width).attr("height", view.height);
        // Adjust size of the scale canvas to fill the width of the menu to the right of the label.
        const label = d3.select("#scale-label").node() as HTMLElement;
        const menu = d3.select("#menu").node() as HTMLElement;
        if (label && menu) {
            d3.select("#scale")
                .attr("width", (menu.offsetWidth - label.offsetWidth) * 0.97)
                .attr("height", label.offsetHeight / 2);
        }

        d3.select("#show-menu").on("click", function() {
            if (µ.isEmbeddedInIFrame()) {
                window.open("http://earth.nullschool.net/" + window.location.hash, "_blank");
            }
            else {
                d3.select("#menu").classed("invisible", !d3.select("#menu").classed("invisible"));
            }
        });

        if (µ.isFF()) {
            // Workaround FF performance issue of slow click behavior on map having thick coastlines.
            d3.select("#display").classed("firefox", true);
        }

        // Tweak document to distinguish CSS styling between touch and non-touch environments. Hacky hack.
        if ("ontouchstart" in document.documentElement) {
            d3.select(document).on("touchstart", function() {});  // this hack enables :active pseudoclass
        }
        else {
            d3.select(document.documentElement).classed("no-touch", true);  // to filter styles problematic for touch
        }

        // Bind configuration to URL bar changes.
        d3.select(window).on("hashchange", function() {
            log.debug("hashchange");
            configuration.fetch({trigger: "hashchange"});
        });

        configuration.on("change", report.reset);

        meshAgent.listenTo(configuration, "change:topology", function(context: ConfigurationModel, attr: { topology: string }) {
            meshAgent.submit(buildMesh, attr);
        });

        globeAgent.listenTo(configuration, "change:projection", function(source: ConfigurationModel, attr: { projection: string }) {
            globeAgent.submit(buildGlobe, attr);
        });

        gridAgent.listenTo(configuration, "change", function() {
            var changed = Object.keys(configuration.changedAttributes()), rebuildRequired = false;

            // Build a new grid if any layer-related attributes have changed.
            if (intersection(changed, ["date", "hour", "param", "surface", "level"]).length > 0) {
                rebuildRequired = true;
            }
            // Build a new grid if the new overlay type is different from the current one.
            var overlayType = configuration.get("overlayType") || "default";
            if (changed.indexOf("overlayType") >= 0 && overlayType !== "off") {
                var grids = (gridAgent.value() || {}), primary = grids.primaryGrid, overlay = grids.overlayGrid;
                if (!overlay) {
                    // Do a rebuild if we have no overlay grid.
                    rebuildRequired = true;
                }
                else if (overlay.type !== overlayType && !(overlayType === "default" && primary === overlay)) {
                    // Do a rebuild if the types are different.
                    rebuildRequired = true;
                }
            }

            if (rebuildRequired) {
                gridAgent.submit(buildGrids);
            }
        });
        gridAgent.on("submit", function() {
            showGridDetails(null);
        });
        gridAgent.on("update", function(grids: GridDetails) {
            showGridDetails(grids);
        });
        d3.select("#toggle-zone").on("click", function() {
            d3.select("#data-date").classed("local", !d3.select("#data-date").classed("local"));
            showDate(gridAgent.cancel.requested ? null : gridAgent.value());
        });

        function startRendering() {
            rendererAgent.submit(buildRenderer, meshAgent.value(), globeAgent.value());
        }
        rendererAgent.listenTo(meshAgent, "update", startRendering);
        rendererAgent.listenTo(globeAgent, "update", startRendering);

        function startInterpolation() {
            fieldAgent.submit(interpolateField, globeAgent.value(), gridAgent.value());
        }
        function cancelInterpolation() {
            fieldAgent.cancel();
        }
        fieldAgent.listenTo(gridAgent, "update", startInterpolation);
        fieldAgent.listenTo(rendererAgent, "render", startInterpolation);
        fieldAgent.listenTo(rendererAgent, "start", cancelInterpolation);
        fieldAgent.listenTo(rendererAgent, "redraw", cancelInterpolation);

        animatorAgent.listenTo(fieldAgent, "update", function(field: Field) {
            animatorAgent.submit(animate, globeAgent.value(), field, gridAgent.value());
        });
        animatorAgent.listenTo(rendererAgent, "start", stopCurrentAnimation.bind(null, true));
        animatorAgent.listenTo(gridAgent, "submit", stopCurrentAnimation.bind(null, false));
        animatorAgent.listenTo(fieldAgent, "submit", stopCurrentAnimation.bind(null, false));

        overlayAgent.listenTo(fieldAgent, "update", function() {
            overlayAgent.submit(drawOverlay, fieldAgent.value(), configuration.get("overlayType"));
        });
        overlayAgent.listenTo(rendererAgent, "start", function() {
            overlayAgent.submit(drawOverlay, fieldAgent.value(), null);
        });
        overlayAgent.listenTo(configuration, "change", function() {
            var changed = Object.keys(configuration.changedAttributes())
            // if only overlay relevant flags have changed...
            if (intersection(changed, ["overlayType", "showGridPoints"]).length > 0) {
                overlayAgent.submit(drawOverlay, fieldAgent.value(), configuration.get("overlayType"));
            }
        });

        // Add event handlers for showing, updating, and removing location details.
        inputController.on("click", showLocationDetails);
        fieldAgent.on("update", updateLocationDetails);
        d3.select("#location-close").on("click", () => clearLocationDetails(true));

        // Modify menu depending on what mode we're in.
        configuration.on("change:param", function(context: ConfigurationModel, mode: string) {
            d3.selectAll(".ocean-mode").classed("invisible", mode !== "ocean");
            d3.selectAll(".wind-mode").classed("invisible", mode !== "wind");
            switch (mode) {
                case "wind":
                    d3.select("#nav-backward-more").attr("title", "-1 Day");
                    d3.select("#nav-backward").attr("title", "-3 Hours");
                    d3.select("#nav-forward").attr("title", "+3 Hours");
                    d3.select("#nav-forward-more").attr("title", "+1 Day");
                    break;
                case "ocean":
                    d3.select("#nav-backward-more").attr("title", "-1 Month");
                    d3.select("#nav-backward").attr("title", "-5 Days");
                    d3.select("#nav-forward").attr("title", "+5 Days");
                    d3.select("#nav-forward-more").attr("title", "+1 Month");
                    break;
            }
        });

        // Add handlers for mode buttons.
        d3.select("#wind-mode-enable").on("click", function() {
            if (configuration.get("param") !== "wind") {
                configuration.save({param: "wind", surface: "surface", level: "level", overlayType: "default"});
            }
        });
        configuration.on("change:param", function(context: ConfigurationModel, param: string) {
            d3.select("#wind-mode-enable").classed("highlighted", param === "wind");
        });
        d3.select("#ocean-mode-enable").on("click", function() {
            if (configuration.get("param") !== "ocean") {
                // When switching between modes, there may be no associated data for the current date. So we need
                // find the closest available according to the catalog. This is not necessary if date is "current".
                // UNDONE: this code is annoying. should be easier to get date for closest ocean product.
                var ocean = {param: "ocean", surface: "surface", level: "currents", overlayType: "default"};
                var attr = {...configuration.attributes};
                if (attr.date === "current") {
                    configuration.save(ocean);
                }
                else {
                    Promise.all(products.productsFor({...attr, ...ocean}))
                        .then(([product]) => {
                            if (product && product.date) {
                                configuration.save({...ocean, ...µ.dateToConfig(product.date)});
                            }
                        })
                        .catch(report.error);
                }
                stopCurrentAnimation(true);  // cleanup particle artifacts over continents
            }
        });
        configuration.on("change:param", function(context: ConfigurationModel, param: string) {
            d3.select("#ocean-mode-enable").classed("highlighted", param === "ocean");
        });

        // Add logic to disable buttons that are incompatible with each other.
        configuration.on("change:overlayType", function(context: ConfigurationModel, ot: string) {
            d3.select("#surface-level").classed("disabled", ot === "air_density" || ot === "wind_power_density");
        });
        configuration.on("change:surface", function(context: ConfigurationModel, s: string) {
            d3.select("#overlay-air_density").classed("disabled", s === "surface");
            d3.select("#overlay-wind_power_density").classed("disabled", s === "surface");
        });

        // Add event handlers for the time navigation buttons.
        d3.select("#nav-backward-more").on("click", navigate.bind(null, -10));
        d3.select("#nav-forward-more" ).on("click", navigate.bind(null, +10));
        d3.select("#nav-backward"     ).on("click", navigate.bind(null, -1));
        d3.select("#nav-forward"      ).on("click", navigate.bind(null, +1));
        d3.select("#nav-now").on("click", function() { configuration.save({date: "current", hour: ""}); });

        d3.select("#option-show-grid").on("click", function() {
            configuration.save({showGridPoints: !configuration.get("showGridPoints")});
        });
        configuration.on("change:showGridPoints", function(context: ConfigurationModel, showGridPoints: boolean) {
            d3.select("#option-show-grid").classed("highlighted", showGridPoints);
        });

        // Add handlers for all wind level buttons.
        d3.selectAll<HTMLElement, unknown>(".surface").each(function(this: HTMLElement) {
            const id = this.id;
            const parts = id.split("-");
            bindButtonToConfiguration("#" + id, {param: "wind", surface: parts[0], level: parts[1]});
        });

        // Add handlers for ocean animation types.
        bindButtonToConfiguration("#animate-currents", {param: "ocean", surface: "surface", level: "currents"});

        // Add handlers for all overlay buttons.
        products.overlayTypes.forEach(function(type: string) {
            bindButtonToConfiguration("#overlay-" + type, {overlayType: type});
        });
        bindButtonToConfiguration("#overlay-wind", {param: "wind", overlayType: "default"});
        bindButtonToConfiguration("#overlay-ocean-off", {overlayType: "off"});
        bindButtonToConfiguration("#overlay-currents", {overlayType: "default"});

        // Add handlers for all projection buttons.
        globes.keys().forEach(function(p: string) {
            bindButtonToConfiguration("#" + p, {projection: p, orientation: ""}, ["projection"]);
        });

        // When touch device changes between portrait and landscape, rebuild globe using the new view size.
        d3.select(window).on("orientationchange", function() {
            view = µ.view();
            globeAgent.submit(buildGlobe, configuration.get("projection"));
        });
    }

    function start() {
        // Everything is now set up, so load configuration from the hash fragment and kick off change events.
        configuration.fetch();
    }

    // Replace the initialization chain
    Promise.resolve()
        .then(init)
        .then(start)
        .catch(report.error);

})();
