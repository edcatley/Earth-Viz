/**
 * EarthAPI - External API interface for controlling Earth visualization
 * Exposes methods on window.EarthAPI for external systems to use
 */

import { ConfigManager, EarthConfig } from '../config/ConfigManager';

export class EarthAPI {
    private configManager: ConfigManager;

    constructor(configManager: ConfigManager) {
        this.configManager = configManager;

        console.log('[API] Initializing EarthAPI');

        // Expose API methods on window object for external systems
        (window as any).EarthAPI = {
            // Mode control
            setAirMode: this.setAirMode.bind(this),
            setOceanMode: this.setOceanMode.bind(this),
            /**
             * Set the planet to display.
             * @param planetType - one of: 'earth', 'earth-clouds', 'earth-live', 'mercury', 'venus', 'moon', 'mars', 'jupiter', 'saturn', 'sun'
             */
            setPlanetMode: this.setPlanetMode.bind(this),

            enableFullScreen: this.enableFullScreen.bind(this),
            disableFullScreen: this.disableFullScreen.bind(this),

            // Display control
            /**
             * Set the map projection.
             * @param projection - one of: 'atlantis', 'azimuthal_equidistant', 'conic_equidistant', 'equirectangular', 'orthographic', 'stereographic', 'waterman', 'winkel3'
             */
            setProjection: this.setProjection.bind(this),
            /**
             * Set the weather overlay.
             * @param overlayType - one of: 'off', 'wind', 'temp', 'relative_humidity', 'mean_sea_level_pressure', 'total_precipitable_water', 'total_cloud_water'
             */
            setOverlay: this.setOverlay.bind(this),
            /**
             * Set the atmospheric pressure level.
             * @param level - one of: 'surface', '1000hPa', '850hPa', '700hPa', '500hPa', '250hPa', '70hPa', '10hPa'
             */
            setLevel: this.setLevel.bind(this),

            // Grid and units
            showGrid: this.showGrid.bind(this),
            hideGrid: this.hideGrid.bind(this),
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

            // Event helpers
            onConfigChange: this.onConfigChange.bind(this),
            offConfigChange: this.offConfigChange.bind(this),
            
            // UI visibility
            showUI: this.showUI.bind(this),
            hideUI: this.hideUI.bind(this)
        };

        console.log('[API] EarthAPI exposed on window.EarthAPI');
        
        // Connect to WebSocket for external command bridge
        this.connectToCommandBridge();

    }

    /**
     * Connect to WebSocket bridge for external command handling
     */
    private connectToCommandBridge(): void {
        const wsUrl = `ws://${window.location.hostname}:8000/earth-viz/ws`;
        console.log(`[API] Connecting to command bridge: ${wsUrl}`);
        
        const ws = new WebSocket(wsUrl);
        
        ws.onopen = () => {
            console.log('[API] Connected to Earth command bridge');
        };
        
        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                if (message.type === 'EARTH_COMMAND') {
                    console.log(`[API] Received external command: ${message.command}`, message.params);
                    this.executeExternalCommand(message.command, message.params || []);
                }
            } catch (error) {
                console.error('[API] Failed to parse WebSocket message:', error);
            }
        };
        
        ws.onclose = () => {
            console.log('[API] Disconnected from command bridge, attempting reconnect in 5s');
            setTimeout(() => this.connectToCommandBridge(), 5000);
        };
        
        ws.onerror = (error) => {
            console.error('[API] WebSocket error:', error);
        };
    }

    /**
     * Execute external command received via WebSocket
     */
    private executeExternalCommand(command: string, params: any[]): void {
        const api = (window as any).EarthAPI;
        if (typeof api[command] === 'function') {
            try {
                api[command](...params);
                console.log(`[API] Executed external command: ${command}`, params);
            } catch (error) {
                console.error(`[API] Failed to execute command ${command}:`, error);
            }
        } else {
            console.error(`[API] Unknown command: ${command}`);
        }
    }

    // === Mode Control Methods ===

  
    /**
     * Switch to air mode and configure its properties.
     */
    setAirMode(level: string = '1000hPa', particleType: string = 'wind', overlayType: string = 'off'): void {
        console.log(`[API] Setting mode: air, level: ${level}, particles: ${particleType}, overlay: ${overlayType}`);
        this.configManager.updateConfig({
            mode: 'air',
            level,
            particleType,
            overlayType
        });
    }

    /**
     * Switch to ocean mode and configure its properties.
     */
    setOceanMode(particleType: string = 'oceancurrent', overlayType: string = 'off'): void {
        console.log(`[API] Setting mode: ocean, particles: ${particleType}, overlay: ${overlayType}`);
        this.configManager.updateConfig({
            mode: 'ocean',
            particleType,
            overlayType,
            level: '1000hPa' // Ocean data is always at the surface
        });
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
    
    /**
     * Enable full screen mode
     */
    enableFullScreen(): void {
        console.log('[API] Enabling full screen');
        this.configManager.updateConfig({ isFullScreen: true });
    }
    
    /**
     * Disable full screen mode
     */
    disableFullScreen(): void {
        console.log('[API] Disabling full screen');
        this.configManager.updateConfig({ isFullScreen: false });
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
     * Set the pressure level or surface type.
     * @param level - The pressure level (e.g., '500hPa') or the string 'surface'.
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
            level: '1000hPa',
            showGridPoints: false,
            windUnits: 'm/s',
            particleType: 'wind',
            date: 'current',
            hour: '0000'
        };
        this.configManager.updateConfig(defaultConfig);
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

    // === UI Visibility Methods ===

    /**
     * Show the Earth UI (menus, controls, etc.)
     */
    showUI(): void {
        console.log('[API] Showing Earth UI');
        this.configManager.updateConfig({ showUI: true });
        
        // Show main menu button
        const earthElement = document.getElementById('earth');
        if (earthElement) earthElement.style.display = '';
        
        // Show menu if it was previously visible
        const menuElement = document.getElementById('menu');
        // Only show menu if it doesn't have 'invisible' class
        // This preserves the menu state (open/closed)
        if (menuElement && !menuElement.classList.contains('invisible')) {
            menuElement.style.display = '';
        }
        
        // Show location info
        const locationElement = document.getElementById('location');
        if (locationElement) locationElement.style.display = '';
    }

    /**
     * Hide the Earth UI (menus, controls, etc.) for clean visualization
     */
    hideUI(): void {
        console.log('[API] Hiding Earth UI');
        this.configManager.updateConfig({ showUI: false });
        
        // Hide main menu button
        const earthElement = document.getElementById('earth');
        if (earthElement) earthElement.style.display = 'none';
        
        // Hide menu
        const menuElement = document.getElementById('menu');
        if (menuElement) menuElement.style.display = 'none';
        
        // Hide location info
        const locationElement = document.getElementById('location');
        if (locationElement) locationElement.style.display = 'none';
    }
}

// Type definitions for external systems
declare global {
    interface Window {
        EarthAPI: {
            // Mode control
            setAirMode(level?: string, particleType?: string, overlayType?: string): void;
            setOceanMode(particleType?: string, overlayType?: string): void;
            /**
             * Set the planet to display.
             * @param planetType - one of: 'earth', 'earth-clouds', 'earth-live', 'mercury', 'venus', 'moon', 'mars', 'jupiter', 'saturn', 'sun'
             */
            setPlanetMode(planetType?: string): void;
            setFullScreen(): void;

            // Display control
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

            // Grid and units
            showGrid(): void;
            hideGrid(): void;
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


            // Event helpers
            onConfigChange(callback: (event: CustomEvent) => void): void;
            offConfigChange(callback: (event: CustomEvent) => void): void;

            // Fullscreen
            enableFullScreen(): void;
            disableFullScreen(): void;
            
            // UI visibility
            showUI(): void;
            hideUI(): void;
        };
    }
}