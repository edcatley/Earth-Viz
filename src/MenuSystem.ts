/**
 * MenuSystem - handles all menu interactions and UI controls
 */

import * as d3 from 'd3';
import { globes } from './globes';
import { products } from './products';
import µ from './micro';

// Extend d3 with extended projections (same as globes.ts)
declare module 'd3' {
    export function geoMollweide(): d3.GeoProjection;
    export function geoWinkel3(): d3.GeoProjection;
    export function geoPolyhedralWaterman(): d3.GeoProjection;
}

export class MenuSystem {
    private config: any;
    private onConfigChange?: () => void;
    private onRender?: () => void;

    constructor(config: any) {
        this.config = config;
    }

    setCallbacks(onConfigChange: () => void, onRender: () => void): void {
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
            this.config.date = "current";
            this.config.hour = "0000";
            this.triggerConfigChange();
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
            this.config.param = "wind";
            this.updateModeDisplay("wind");
            this.triggerConfigChange();
        });

        // Ocean mode
        d3.select("#ocean-mode-enable").on("click", () => {
            console.log('[MENU] Switch to Ocean mode');
            this.config.param = "currents";
            this.updateModeDisplay("ocean");
            this.triggerConfigChange();
        });
    }

    private setupSurfaceControls(): void {
        // Surface level
        d3.select("#surface-level").on("click", () => {
            console.log('[MENU] Set surface level');
            this.config.surface = "surface";
            this.config.level = "level";
            this.updateSurfaceDisplay("surface");
            this.triggerConfigChange();
        });

        // Pressure levels
        const pressureLevels = ["1000", "850", "700", "500", "250", "70", "10"];
        pressureLevels.forEach(level => {
            d3.select(`#isobaric-${level}hPa`).on("click", () => {
                console.log(`[MENU] Set pressure level: ${level}hPa`);
                this.config.surface = "isobaric";
                this.config.level = `${level}hPa`;
                this.updateSurfaceDisplay(level);
                this.triggerConfigChange();
            });
        });
    }

    private setupOverlayControls(): void {
        // No overlay
        d3.select("#overlay-off").on("click", () => {
            console.log('[MENU] Set overlay: None');
            this.config.overlayType = "off";
            this.updateOverlayDisplay("off");
            this.triggerConfigChange();
        });

        d3.select("#overlay-ocean-off").on("click", () => {
            console.log('[MENU] Set ocean overlay: None');
            this.config.overlayType = "off";
            this.updateOverlayDisplay("off");
            this.triggerConfigChange();
        });

        // Wind overlays
        const windOverlays = [
            "wind", "temp", "relative_humidity", "air_density", "wind_power_density",
            "total_precipitable_water", "total_cloud_water", "mean_sea_level_pressure"
        ];
        
        windOverlays.forEach(overlay => {
            d3.select(`#overlay-${overlay}`).on("click", () => {
                console.log(`[MENU] Set overlay: ${overlay}`);
                this.config.overlayType = overlay;
                this.updateOverlayDisplay(overlay);
                this.triggerConfigChange();
            });
        });

        // Ocean overlays
        d3.select("#overlay-currents").on("click", () => {
            console.log('[MENU] Set overlay: currents');
            this.config.overlayType = "currents";
            this.updateOverlayDisplay("currents");
            this.triggerConfigChange();
        });

        // Ocean animation
        d3.select("#animate-currents").on("click", () => {
            console.log('[MENU] Toggle currents animation');
            this.config.param = "currents";
            this.triggerConfigChange();
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
                this.config.projection = proj;
                this.updateProjectionDisplay(proj);
                this.triggerConfigChange();
            });
        });
    }

    private setupGridControls(): void {
        d3.select("#option-show-grid").on("click", () => {
            console.log('[MENU] Toggle grid display');
            this.config.showGridPoints = !this.config.showGridPoints;
            this.updateGridDisplay();
            this.triggerRender();
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
            // Cycle through wind units: m/s, km/h, kn, mph
            const currentUnits = this.config.windUnits || "m/s";
            const units = ["m/s", "km/h", "kn", "mph"];
            const currentIndex = units.indexOf(currentUnits);
            const nextIndex = (currentIndex + 1) % units.length;
            this.config.windUnits = units[nextIndex];
            this.updateWindUnitsDisplay();
        });

        // Value units toggle (for overlays)
        d3.select("#location-value-units").on("click", () => {
            console.log('[MENU] Toggle value units');
            // This would cycle through units for the current overlay
            this.updateValueUnitsDisplay();
        });
    }

    private navigateTime(hours: number): void {
        // This would implement time navigation logic
        // For now, just log the action
        console.log(`[MENU] Navigate time by ${hours} hours`);
        // TODO: Implement actual time navigation
        this.triggerConfigChange();
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

    private updateGridDisplay(): void {
        // Update grid button state
        d3.select("#option-show-grid").classed("highlighted", this.config.showGridPoints);
    }

    private updateDateDisplay(): void {
        // Update date display format
        const dateElement = d3.select("#data-date");
        const isLocal = dateElement.classed("local");
        d3.select("#toggle-zone").text(isLocal ? "UTC" : "Local");
        // TODO: Update actual date text based on current data
    }

    private updateWindUnitsDisplay(): void {
        const units = this.config.windUnits || "m/s";
        d3.select("#location-wind-units").text(units);
    }

    private updateValueUnitsDisplay(): void {
        // Update value units display based on current overlay
        // TODO: Implement based on overlay type
    }

    private triggerConfigChange(): void {
        if (this.onConfigChange) {
            this.onConfigChange();
        }
    }

    private triggerRender(): void {
        if (this.onRender) {
            this.onRender();
        }
    }

    // Public method to update menu state based on current config
    updateMenuState(): void {
        console.log('[MENU] Updating menu state');
        
        // Update mode display
        const mode = this.config.param === "currents" ? "ocean" : "wind";
        this.updateModeDisplay(mode);
        
        // Update surface display
        if (this.config.surface === "surface") {
            this.updateSurfaceDisplay("surface");
        } else {
            const level = this.config.level?.replace("hPa", "");
            if (level) {
                this.updateSurfaceDisplay(level);
            }
        }
        
        // Update overlay display
        this.updateOverlayDisplay(this.config.overlayType || "off");
        
        // Update projection display
        const currentProjection = this.config.projection || "orthographic";
        this.updateProjectionDisplay(currentProjection);
        
        // Update grid display
        this.updateGridDisplay();
        
        // Update date display
        this.updateDateDisplay();
        
        // Update units displays
        this.updateWindUnitsDisplay();
        this.updateValueUnitsDisplay();
    }
} 