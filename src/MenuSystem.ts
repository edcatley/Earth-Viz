/**
 * MenuSystem - handles all menu interactions and UI controls
 */

import * as d3 from 'd3';


// Extend d3 with extended projections (same as globes.ts)
declare module 'd3' {
    export function geoMollweide(): d3.GeoProjection;
    export function geoWinkel3(): d3.GeoProjection;
    export function geoPolyhedralWaterman(): d3.GeoProjection;
}

export class MenuSystem {
    private onConfigChange?: (changes: any) => void;
    private onRender?: () => void;
    private currentWeatherData: any = null; // Store current weather data for metadata display

    constructor() {
        console.log('[MENU] MenuSystem initialized');
    }

    setCallbacks(onConfigChange: (changes: any) => void, onRender: () => void): void {
        this.onConfigChange = onConfigChange;
        this.onRender = onRender;
    }

    setupMenuHandlers(): void {
        console.log('[MENU] Setting up menu handlers');
        
        // Date/time controls
        this.setupDateControls();
        
        // Navigation controls
        this.setupNavigationControls();
        
        // Mode controls (Air/Ocean)
        this.setupModeControls();
        
        // Height/Surface controls
        this.setupSurfaceControls();
        
        // Overlay controls
        this.setupOverlayControls();
        
        // Projection controls
        this.setupProjectionControls();
        
        // Grid toggle
        this.setupGridControls();
        
        // Location controls
        this.setupLocationControls();
        
        console.log('[MENU] Menu handlers setup complete');
    }

    private setupDateControls(): void {
        // Toggle between UTC and local time
        d3.select("#toggle-zone").on("click", () => {
            const dateElement = d3.select("#data-date");
            const isLocal = dateElement.classed("local");
            dateElement.classed("local", !isLocal);
            this.updateDateDisplay();
        });
    }

    private setupNavigationControls(): void {
        // Now button - go to current conditions
        d3.select("#nav-now").on("click", () => {
            console.log('[MENU] Navigate to current conditions');
            this.triggerConfigChange({ date: "current", hour: "0000" });
        });

        // Backward navigation
        d3.select("#nav-backward").on("click", () => {
            console.log('[MENU] Navigate backward');
            this.navigateTime(-3); // 3 hours back
        });

        d3.select("#nav-backward-more").on("click", () => {
            console.log('[MENU] Navigate backward more');
            this.navigateTime(-24); // 24 hours back
        });

        // Forward navigation
        d3.select("#nav-forward").on("click", () => {
            console.log('[MENU] Navigate forward');
            this.navigateTime(3); // 3 hours forward
        });

        d3.select("#nav-forward-more").on("click", () => {
            console.log('[MENU] Navigate forward more');
            this.navigateTime(24); // 24 hours forward
        });
    }

    private setupModeControls(): void {
        // Air mode
        d3.select("#wind-mode-enable").on("click", () => {
            console.log('[MENU] Switch to Air mode');
            this.triggerConfigChange({ param: "wind" });
        });

        // Ocean mode
        d3.select("#ocean-mode-enable").on("click", () => {
            console.log('[MENU] Switch to Ocean mode');
            this.triggerConfigChange({ param: "currents" });
        });
    }

    private setupSurfaceControls(): void {
        // Surface level
        d3.select("#surface-level").on("click", () => {
            console.log('[MENU] Set surface level');
            this.triggerConfigChange({ surface: "surface", level: "level" });
        });

        // Pressure levels
        const pressureLevels = ["1000", "850", "700", "500", "250", "70", "10"];
        pressureLevels.forEach(level => {
            d3.select(`#isobaric-${level}hPa`).on("click", () => {
                console.log(`[MENU] Set pressure level: ${level}hPa`);
                this.triggerConfigChange({ surface: "isobaric", level: `${level}hPa` });
            });
        });
    }

    private setupOverlayControls(): void {
        // No overlay
        d3.select("#overlay-off").on("click", () => {
            console.log('[MENU] Set overlay: None');
            this.triggerConfigChange({ overlayType: "off" });
        });

        d3.select("#overlay-ocean-off").on("click", () => {
            console.log('[MENU] Set ocean overlay: None');
            this.triggerConfigChange({ overlayType: "off" });
        });

        // Wind overlays
        const windOverlays = [
            "wind", "temp", "relative_humidity", "air_density", "wind_power_density",
            "total_precipitable_water", "total_cloud_water", "mean_sea_level_pressure"
        ];
        
        windOverlays.forEach(overlay => {
            d3.select(`#overlay-${overlay}`).on("click", () => {
                console.log(`[MENU] Set overlay: ${overlay}`);
                this.triggerConfigChange({ overlayType: overlay });
            });
        });

        // Ocean overlays
        d3.select("#overlay-currents").on("click", () => {
            console.log('[MENU] Set overlay: currents');
            this.triggerConfigChange({ overlayType: "currents" });
        });

        // Ocean animation
        d3.select("#animate-currents").on("click", () => {
            console.log('[MENU] Toggle currents animation');
            this.triggerConfigChange({ param: "currents" });
        });
    }

    private setupProjectionControls(): void {
        // All projections - core D3 and extended ones
        const allProjections = [
            "azimuthal_equidistant", "conic_equidistant", "equirectangular", 
            "orthographic", "stereographic", "atlantis", "waterman", "winkel3"
        ];

        allProjections.forEach(proj => {
            d3.select(`#${proj}`).on("click", () => {
                console.log(`[MENU] Set projection: ${proj}`);
                this.triggerConfigChange({ projection: proj });
            });
        });
    }

    private setupGridControls(): void {
        d3.select("#option-show-grid").on("click", () => {
            console.log('[MENU] Toggle grid display');
            // We can't know current state without config, so just trigger the change
            // The parent will handle the actual toggle logic
            this.triggerConfigChange({ toggleGrid: true });
        });
    }

    private setupLocationControls(): void {
        // Location close button
        d3.select("#location-close").on("click", () => {
            console.log('[MENU] Close location display');
            d3.select("#location").classed("invisible", true);
            d3.select("#location-close").classed("invisible", true);
        });

        // Wind units toggle
        d3.select("#location-wind-units").on("click", () => {
            console.log('[MENU] Toggle wind units');
            // Trigger a units toggle - parent will handle the cycling logic
            this.triggerConfigChange({ toggleWindUnits: true });
        });

        // Value units toggle (for overlays)
        d3.select("#location-value-units").on("click", () => {
            console.log('[MENU] Toggle value units');
            // This would cycle through units for the current overlay
            this.triggerConfigChange({ toggleValueUnits: true });
        });
    }

    private navigateTime(hours: number): void {
        // This would implement time navigation logic
        // For now, just log the action
        console.log(`[MENU] Navigate time by ${hours} hours`);
        // TODO: Implement actual time navigation
        this.triggerConfigChange({ navigateHours: hours });
    }

    private updateModeDisplay(mode: string): void {
        // Update UI to show current mode
        d3.selectAll(".wind-mode").classed("invisible", mode !== "wind");
        d3.selectAll(".ocean-mode").classed("invisible", mode !== "ocean");
        
        // Update button states
        d3.select("#wind-mode-enable").classed("highlighted", mode === "wind");
        d3.select("#ocean-mode-enable").classed("highlighted", mode === "ocean");
    }

    private updateSurfaceDisplay(surface: string): void {
        // Update surface button highlighting
        d3.selectAll(".surface").classed("highlighted", false);
        if (surface === "surface") {
            d3.select("#surface-level").classed("highlighted", true);
        } else {
            d3.select(`#isobaric-${surface}hPa`).classed("highlighted", true);
        }
    }

    private updateOverlayDisplay(overlay: string): void {
        // Update overlay button highlighting
        d3.selectAll("[id^='overlay-']").classed("highlighted", false);
        if (overlay === "off") {
            d3.select("#overlay-off").classed("highlighted", true);
            d3.select("#overlay-ocean-off").classed("highlighted", true);
        } else {
            d3.select(`#overlay-${overlay}`).classed("highlighted", true);
        }
    }

    private updateProjectionDisplay(projection: string): void {
        // Update projection button highlighting
        d3.selectAll(".proj").classed("highlighted", false);
        d3.select(`#${projection}`).classed("highlighted", true);
    }

    private updateGridDisplay(showGrid: boolean): void {
        // Update grid button state
        d3.select("#option-show-grid").classed("highlighted", showGrid);
    }

    private updateDateDisplay(): void {
        // Update date display format
        const dateElement = d3.select("#data-date");
        const isLocal = dateElement.classed("local");
        d3.select("#toggle-zone").text(isLocal ? "UTC" : "Local");
        
        // Update actual date text based on current data
        if (this.currentWeatherData && this.currentWeatherData.date) {
            const date = this.currentWeatherData.date;
            const dateStr = isLocal ? date.toLocaleString() : date.toISOString().replace('T', ' ').replace('.000Z', ' UTC');
            dateElement.text(dateStr);
        } else {
            dateElement.text("No data");
        }
    }

    private updateWindUnitsDisplay(units: string): void {
        d3.select("#location-wind-units").text(units);
    }

    private updateValueUnitsDisplay(): void {
        // Update value units display based on current overlay
        // TODO: Implement based on overlay type
    }

    private triggerConfigChange(changes: any): void {
        if (this.onConfigChange) {
            this.onConfigChange(changes);
        }
    }

    private triggerRender(): void {
        if (this.onRender) {
            this.onRender();
        }
    }

    // New method to update weather data metadata
    updateWeatherData(weatherProducts: any[]): void {
        console.log('[MENU] Updating weather data metadata', weatherProducts);
        
        // Find the primary wind product for metadata
        const windProduct = weatherProducts.find((p: any) => p && p.field === "vector");
        this.currentWeatherData = windProduct;
        
        // Update the display
        this.updateDataDisplay();
    }

    // New method to update all data-related displays
    private updateDataDisplay(): void {
        if (!this.currentWeatherData) {
            // No data available
            d3.select("#data-date").text("No data");
            d3.select("#data-layer").text("No data");
            d3.select("#data-center").text("No data");
            return;
        }

        // Update date
        this.updateDateDisplay();

        // Update data layer (surface/level info) with resolution
        const description = this.currentWeatherData.description;
        let layerText = "Wind";
        
        if (typeof description === 'function') {
            const desc = description('en');
            layerText = desc.name + (desc.qualifier || '');
        } else if (typeof description === 'string') {
            layerText = description;
        }
        
        // Add resolution info to the layer text
        if (this.currentWeatherData.source && this.currentWeatherData.source.includes('GFS')) {
            layerText += " (1.0°)";
        }
        
        d3.select("#data-layer").text(layerText);

        // Update source
        const source = this.currentWeatherData.source || "Unknown source";
        d3.select("#data-center").text(source);
    }

    // Public method to update menu state based on current config
    updateMenuState(config: any): void {
        console.log('[MENU] Updating menu state');
        
        // Update mode display
        const mode = config.param === "currents" ? "ocean" : "wind";
        this.updateModeDisplay(mode);
        
        // Update surface display
        if (config.surface === "surface") {
            this.updateSurfaceDisplay("surface");
        } else {
            const level = config.level?.replace("hPa", "");
            if (level) {
                this.updateSurfaceDisplay(level);
            }
        }
        
        // Update overlay display
        this.updateOverlayDisplay(config.overlayType || "off");
        
        // Update projection display
        const currentProjection = config.projection || "orthographic";
        this.updateProjectionDisplay(currentProjection);
        
        // Update grid display
        this.updateGridDisplay(config.showGridPoints || false);
        
        // Update date display (in case timezone toggle changed)
        this.updateDateDisplay();
        
        // Update units displays
        this.updateWindUnitsDisplay(config.windUnits || "m/s");
        this.updateValueUnitsDisplay();
    }
} 