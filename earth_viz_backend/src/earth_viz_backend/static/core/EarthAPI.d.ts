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
    setMode(mode: 'air' | 'ocean' | 'planet'): void;
    /**
     * Switch to air mode with wind particles
     */
    setAirMode(): void;
    /**
     * Switch to ocean mode with current particles
     */
    setOceanMode(): void;
    /**
     * Switch to planet mode
     */
    setPlanetMode(planetType?: string): void;
    /**
     * Set the map projection
     */
    setProjection(projection: string): void;
    /**
     * Set the overlay type
     */
    setOverlay(overlayType: string): void;
    /**
     * Set the planet type (for planet mode)
     */
    setPlanet(planetType: string): void;
    /**
     * Set the surface type
     */
    setSurface(surface: string): void;
    /**
     * Set the pressure level
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
     * Toggle the coordinate grid
     */
    toggleGrid(): void;
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
     * Check if currently in API mode
     */
    isApiMode(): boolean;
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
            setMode(mode: 'air' | 'ocean' | 'planet'): void;
            setAirMode(): void;
            setOceanMode(): void;
            setPlanetMode(planetType?: string): void;
            setProjection(projection: string): void;
            setOverlay(overlayType: string): void;
            setPlanet(planetType: string): void;
            setSurface(surface: string): void;
            setLevel(level: string): void;
            showGrid(): void;
            hideGrid(): void;
            toggleGrid(): void;
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
            isApiMode(): boolean;
            onConfigChange(callback: (event: CustomEvent) => void): void;
            offConfigChange(callback: (event: CustomEvent) => void): void;
        };
    }
}
//# sourceMappingURL=EarthAPI.d.ts.map