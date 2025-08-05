/**
 * EarthAPI - External API interface for controlling Earth visualization
 * Exposes methods on window.EarthAPI for external systems to use
 */

import { ConfigManager, EarthConfig } from './ConfigManager';

export class EarthAPI {
    private configManager: ConfigManager;

    constructor(configManager: ConfigManager) {
        this.configManager = configManager;

        console.log('[API] Initializing EarthAPI');

        // Expose API methods on window object for external systems
        (window as any).EarthAPI = {
            // Mode control
            setMode: this.setMode.bind(this),
            setAirMode: this.setAirMode.bind(this),
            setOceanMode: this.setOceanMode.bind(this),
            setPlanetMode: this.setPlanetMode.bind(this),

            // Display control
            setProjection: this.setProjection.bind(this),
            setOverlay: this.setOverlay.bind(this),
            setPlanet: this.setPlanet.bind(this),
            setSurface: this.setSurface.bind(this),
            setLevel: this.setLevel.bind(this),

            // Grid and units
            showGrid: this.showGrid.bind(this),
            hideGrid: this.hideGrid.bind(this),
            toggleGrid: this.toggleGrid.bind(this),
            setWindUnits: this.setWindUnits.bind(this),

            // Time navigation
            setDate: this.setDate.bind(this),
            setHour: this.setHour.bind(this),
            navigateTime: this.navigateTime.bind(this),
            goToNow: this.goToNow.bind(this),

            // Bulk operations
            setConfig: this.setConfig.bind(this),
            getConfig: this.getConfig.bind(this),
            resetConfig: this.resetConfig.bind(this),

            // API mode control
            enableApiMode: this.enableApiMode.bind(this),
            disableApiMode: this.disableApiMode.bind(this),
            isApiMode: this.isApiMode.bind(this),

            // Event helpers
            onConfigChange: this.onConfigChange.bind(this),
            offConfigChange: this.offConfigChange.bind(this)
        };

        console.log('[API] EarthAPI exposed on window.EarthAPI');
    }

    // === Mode Control Methods ===

    /**
     * Set the visualization mode
     */
    setMode(mode: 'air' | 'ocean' | 'planet'): void {
        console.log(`[API] Setting mode: ${mode}`);

        const config: Partial<EarthConfig> = { mode };

        // Set appropriate defaults for each mode
        switch (mode) {
            case 'air':
                config.particleType = 'wind';
                config.overlayType = 'off';
                break;
            case 'ocean':
                config.particleType = 'oceancurrent';
                config.overlayType = 'off';
                break;
            case 'planet':
                config.particleType = 'off';
                config.overlayType = 'off';
                config.planetType = config.planetType || 'earth';
                break;
        }

        this.configManager.updateConfig(config);
    }

    /**
     * Switch to air mode with wind particles
     */
    setAirMode(): void {
        this.setMode('air');
    }

    /**
     * Switch to ocean mode with current particles
     */
    setOceanMode(): void {
        this.setMode('ocean');
    }

    /**
     * Switch to planet mode
     */
    setPlanetMode(planetType: string = 'earth'): void {
        this.configManager.updateConfig({
            mode: 'planet',
            particleType: 'off',
            overlayType: 'off',
            planetType
        });
    }

    // === Display Control Methods ===

    /**
     * Set the map projection
     */
    setProjection(projection: string): void {
        console.log(`[API] Setting projection: ${projection}`);
        this.configManager.updateConfig({ projection });
    }

    /**
     * Set the overlay type
     */
    setOverlay(overlayType: string): void {
        console.log(`[API] Setting overlay: ${overlayType}`);
        this.configManager.updateConfig({ overlayType });
    }

    /**
     * Set the planet type (for planet mode)
     */
    setPlanet(planetType: string): void {
        console.log(`[API] Setting planet: ${planetType}`);
        this.configManager.updateConfig({
            mode: 'planet',
            planetType,
            particleType: 'off',
            overlayType: 'off'
        });
    }

    /**
     * Set the surface type
     */
    setSurface(surface: string): void {
        console.log(`[API] Setting surface: ${surface}`);
        this.configManager.updateConfig({ surface });
    }

    /**
     * Set the pressure level
     */
    setLevel(level: string): void {
        console.log(`[API] Setting level: ${level}`);
        this.configManager.updateConfig({ level });
    }

    // === Grid and Units Methods ===

    /**
     * Show the coordinate grid
     */
    showGrid(): void {
        console.log('[API] Showing grid');
        this.configManager.updateConfig({ showGridPoints: true });
    }

    /**
     * Hide the coordinate grid
     */
    hideGrid(): void {
        console.log('[API] Hiding grid');
        this.configManager.updateConfig({ showGridPoints: false });
    }

    /**
     * Toggle the coordinate grid
     */
    toggleGrid(): void {
        const currentConfig = this.configManager.getConfig();
        console.log(`[API] Toggling grid (currently: ${currentConfig.showGridPoints})`);
        this.configManager.updateConfig({ showGridPoints: !currentConfig.showGridPoints });
    }

    /**
     * Set wind units
     */
    setWindUnits(units: string): void {
        console.log(`[API] Setting wind units: ${units}`);
        this.configManager.updateConfig({ windUnits: units });
    }

    // === Time Navigation Methods ===

    /**
     * Set the date
     */
    setDate(date: string): void {
        console.log(`[API] Setting date: ${date}`);
        this.configManager.updateConfig({ date });
    }

    /**
     * Set the hour
     */
    setHour(hour: string): void {
        console.log(`[API] Setting hour: ${hour}`);
        this.configManager.updateConfig({ hour });
    }

    /**
     * Navigate time by specified hours
     */
    navigateTime(hours: number): void {
        console.log(`[API] Navigating time by ${hours} hours`);
        this.configManager.updateConfig({ navigateHours: hours });
    }

    /**
     * Go to current time
     */
    goToNow(): void {
        console.log('[API] Going to current time');
        this.configManager.updateConfig({ date: 'current', hour: '0000' });
    }

    // === Bulk Operations ===

    /**
     * Set multiple configuration options at once
     */
    setConfig(config: Partial<EarthConfig>): void {
        console.log('[API] Setting bulk config:', config);
        this.configManager.updateConfig(config);
    }

    /**
     * Get current configuration
     */
    getConfig(): EarthConfig {
        return this.configManager.getConfig();
    }

    /**
     * Reset configuration to defaults
     */
    resetConfig(): void {
        console.log('[API] Resetting config to defaults');
        const defaultConfig: Partial<EarthConfig> = {
            mode: 'air',
            projection: 'orthographic',
            overlayType: 'off',
            surface: 'surface',
            level: 'level',
            showGridPoints: false,
            windUnits: 'm/s',
            particleType: 'wind',
            date: 'current',
            hour: '0000'
        };
        this.configManager.updateConfig(defaultConfig);
    }

    // === API Mode Control ===

    /**
     * Enable API control mode (hides UI menu)
     */
    enableApiMode(): void {
        console.log('[API] Enabling API mode');
        this.configManager.setApiMode(true);
    }

    /**
     * Disable API control mode (shows UI menu)
     */
    disableApiMode(): void {
        console.log('[API] Disabling API mode');
        this.configManager.setApiMode(false);
    }

    /**
     * Check if currently in API mode
     */
    isApiMode(): boolean {
        return this.configManager.isApiMode();
    }

    // === Event Helpers ===

    /**
     * Add a listener for configuration changes
     */
    onConfigChange(callback: (event: CustomEvent) => void): void {
        window.addEventListener('earth:configChanged', callback as EventListener);
    }

    /**
     * Remove a configuration change listener
     */
    offConfigChange(callback: (event: CustomEvent) => void): void {
        window.removeEventListener('earth:configChanged', callback as EventListener);
    }
}

// Type definitions for external systems
declare global {
    interface Window {
        EarthAPI: {
            // Mode control
            setMode(mode: 'air' | 'ocean' | 'planet'): void;
            setAirMode(): void;
            setOceanMode(): void;
            setPlanetMode(planetType?: string): void;

            // Display control
            setProjection(projection: string): void;
            setOverlay(overlayType: string): void;
            setPlanet(planetType: string): void;
            setSurface(surface: string): void;
            setLevel(level: string): void;

            // Grid and units
            showGrid(): void;
            hideGrid(): void;
            toggleGrid(): void;
            setWindUnits(units: string): void;

            // Time navigation
            setDate(date: string): void;
            setHour(hour: string): void;
            navigateTime(hours: number): void;
            goToNow(): void;

            // Bulk operations
            setConfig(config: Partial<EarthConfig>): void;
            getConfig(): EarthConfig;
            resetConfig(): void;

            // API mode control
            enableApiMode(): void;
            disableApiMode(): void;
            isApiMode(): boolean;

            // Event helpers
            onConfigChange(callback: (event: CustomEvent) => void): void;
            offConfigChange(callback: (event: CustomEvent) => void): void;
        };
    }
}