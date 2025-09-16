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
     * Set the visualization mode
     */
    /**
     * Switch to air mode and configure its properties.
     *
     * @param {string} [level='1000hPa'] - The atmospheric pressure level.
     *   Permissible values: '1000hPa', '850hPa', '700hPa', '500hPa', '250hPa', '70hPa', '10hPa'.
     * @param {string} [particleType='wind'] - The particle animation type.
     *   Permissible values: 'wind', 'off'.
     * @param {string} [overlayType='off'] - The data overlay to display.
     *   Permissible values: 'off', 'wind', 'temp', 'relative_humidity', 'mean_sea_level_pressure', 'total_precipitable_water', 'total_cloud_water'.
     */
    setAirMode(level?: string, particleType?: string, overlayType?: string): void;
    /**
     * Switch to ocean mode and configure its properties.
     *
     * @param {string} [particleType='oceancurrent'] - The particle animation type.
     *   Permissible values: 'oceancurrent', 'wave', 'off'.
     * @param {string} [overlayType='off'] - The data overlay to display.
     *   Permissible values: 'off', 'currents'. (Note: Ocean overlays are limited).
     */
    setOceanMode(particleType?: string, overlayType?: string): void;
    /**
     * Switch to planet mode
     */
    setPlanetMode(planetType?: string): void;
    /**
     * Set the full screen mode
     */
    setFullScreen(): void;
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
     * Enable API control mode (hides UI menu)
     */
    enableApiMode(): void;
    /**
     * Disable API control mode (shows UI menu)
     */
    disableApiMode(): void;
    /**
     * Add a listener for configuration changes
     */
    onConfigChange(callback: (event: CustomEvent) => void): void;
    /**
     * Remove a configuration change listener
     */
    offConfigChange(callback: (event: CustomEvent) => void): void;
}
declare global {
    interface Window {
        EarthAPI: {
            setAirMode(level?: string, particleType?: string, overlayType?: string): void;
            setOceanMode(particleType?: string, overlayType?: string): void;
            setPlanetMode(planetType?: string): void;
            setFullScreen(): void;
            setProjection(projection: string): void;
            setOverlay(overlayType: string): void;
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
            enableApiMode(): void;
            disableApiMode(): void;
            onConfigChange(callback: (event: CustomEvent) => void): void;
            offConfigChange(callback: (event: CustomEvent) => void): void;
        };
    }
}
//# sourceMappingURL=EarthAPI.d.ts.map