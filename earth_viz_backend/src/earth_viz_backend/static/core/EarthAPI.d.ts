/**
 * EarthAPI - External API interface for controlling Earth visualization
 * Exposes methods on window.EarthAPI for external systems to use
 */
import { ConfigManager, EarthConfig } from '../config/ConfigManager';
export declare class EarthAPI {
    private configManager;
    constructor(configManager: ConfigManager);
    /**
     * Connect to WebSocket bridge for external command handling
     */
    private connectToCommandBridge;
    /**
     * Execute external command received via WebSocket
     */
    private executeExternalCommand;
    /**
     * Switch to air mode and configure its properties.
     */
    setAirMode(level?: string, particleType?: string, overlayType?: string): void;
    /**
     * Switch to ocean mode and configure its properties.
     */
    setOceanMode(particleType?: string, overlayType?: string): void;
    /**
     * Switch to planet mode
     */
    setPlanetMode(planetType?: string): void;
    /**
     * Enable full screen mode
     */
    enableFullScreen(): void;
    /**
     * Disable full screen mode
     */
    disableFullScreen(): void;
    /**
     * Set the map projection
     */
    setProjection(projection: string): void;
    /**
     * Set the overlay type
     */
    setOverlay(overlayType: string): void;
    /**
     * Set the pressure level or surface type.
     * @param level - The pressure level (e.g., '500hPa') or the string 'surface'.
     */
    setLevel(level: string): void;
    /**
     * Show the coordinate grid
     */
    showGrid(): void;
    /**
     * Hide the coordinate grid
     */
    hideGrid(): void;
    /**
     * Set wind units
     */
    setWindUnits(units: string): void;
    /**
     * Set the date
     */
    setDate(date: string): void;
    /**
     * Set the hour
     */
    setHour(hour: string): void;
    /**
     * Navigate time by specified hours
     */
    navigateTime(hours: number): void;
    /**
     * Go to current time
     */
    goToNow(): void;
    /**
     * Set multiple configuration options at once
     */
    setConfig(config: Partial<EarthConfig>): void;
    /**
     * Get current configuration
     */
    getConfig(): EarthConfig;
    /**
     * Reset configuration to defaults
     */
    resetConfig(): void;
    /**
     * Add a listener for configuration changes
     */
    onConfigChange(callback: (event: CustomEvent) => void): void;
    /**
     * Remove a configuration change listener
     */
    offConfigChange(callback: (event: CustomEvent) => void): void;
    /**
     * Show the Earth UI (menus, controls, etc.)
     */
    showUI(): void;
    /**
     * Hide the Earth UI (menus, controls, etc.) for clean visualization
     */
    hideUI(): void;
}
declare global {
    interface Window {
        EarthAPI: {
            setAirMode(level?: string, particleType?: string, overlayType?: string): void;
            setOceanMode(particleType?: string, overlayType?: string): void;
            /**
             * Set the planet to display.
             * @param planetType - one of: 'earth', 'earth-clouds', 'earth-live', 'mercury', 'venus', 'moon', 'mars', 'jupiter', 'saturn', 'sun'
             */
            setPlanetMode(planetType?: string): void;
            setFullScreen(): void;
            /**
             * Set the map projection.
             * @param projection - one of: 'atlantis', 'azimuthal_equidistant', 'conic_equidistant', 'equirectangular', 'orthographic', 'stereographic', 'waterman', 'winkel3'
             */
            setProjection(projection: string): void;
            /**
             * Set the weather overlay.
             * @param overlayType - one of: 'off', 'wind', 'temp', 'relative_humidity', 'mean_sea_level_pressure', 'total_precipitable_water', 'total_cloud_water'
             */
            setOverlay(overlayType: string): void;
            /**
             * Set the atmospheric pressure level.
             * @param level - one of: 'surface', '1000hPa', '850hPa', '700hPa', '500hPa', '250hPa', '70hPa', '10hPa'
             */
            setLevel(level: string): void;
            showGrid(): void;
            hideGrid(): void;
            setWindUnits(units: string): void;
            setDate(date: string): void;
            setHour(hour: string): void;
            navigateTime(hours: number): void;
            goToNow(): void;
            setConfig(config: Partial<EarthConfig>): void;
            getConfig(): EarthConfig;
            resetConfig(): void;
            onConfigChange(callback: (event: CustomEvent) => void): void;
            offConfigChange(callback: (event: CustomEvent) => void): void;
            enableFullScreen(): void;
            disableFullScreen(): void;
            showUI(): void;
            hideUI(): void;
        };
    }
}
//# sourceMappingURL=EarthAPI.d.ts.map