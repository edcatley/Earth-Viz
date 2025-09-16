/**
 * MenuSystem - handles all menu interactions and UI controls
 * Now works with ConfigManager for centralized configuration management
 */
import * as d3 from 'd3';
import { ConfigManager, EarthConfig } from '../config/ConfigManager';
declare module 'd3' {
    function geoMollweide(): d3.GeoProjection;
    function geoWinkel3(): d3.GeoProjection;
    function geoPolyhedralWaterman(): d3.GeoProjection;
}
export declare class MenuSystem {
    private configManager;
    private currentWeatherData;
    constructor(configManager: ConfigManager);
    setupMenuHandlers(): void;
    private setupDateControls;
    private setupNavigationControls;
    private setupModeControls;
    private setupSurfaceControls;
    private setupOverlayControls;
    private setupProjectionControls;
    private setupGridControls;
    private setupLocationControls;
    private setupPlanetControls;
    private navigateTime;
    private updateModeDisplay;
    private updateLevelDisplay;
    private updateOverlayDisplay;
    private updateProjectionDisplay;
    private updateGridDisplay;
    private updateDateDisplay;
    private updateWindUnitsDisplay;
    private updateValueUnitsDisplay;
    private updatePlanetDisplay;
    private triggerConfigChange;
    updateWeatherData(weatherProducts: any[]): void;
    private updateDataDisplay;
    updateMenuState(config: EarthConfig): void;
}
//# sourceMappingURL=MenuSystem.d.ts.map