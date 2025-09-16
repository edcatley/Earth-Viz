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
            setPlanetMode: this.setPlanetMode.bind(this),

            // Display control
            setProjection: this.setProjection.bind(this),
            setOverlay: this.setOverlay.bind(this),
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

            // API mode control
            enableApiMode: this.enableApiMode.bind(this),
            disableApiMode: this.disableApiMode.bind(this),

            // Event helpers
            onConfigChange: this.onConfigChange.bind(this),
            offConfigChange: this.offConfigChange.bind(this)
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
     * Set the full screen mode
     */
    setFullScreen(): void {
        console.log('[API] Setting full screen');
        const currentConfig = this.configManager.getConfig();
        const currentOrientation = currentConfig.orientation || '0,0,0';
        const parts = currentOrientation.split(',');
        const newOrientation = `${parts[0]},${parts[1]},NaN`;
        this.configManager.updateConfig({ orientation: newOrientation });
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
            setAirMode(level?: string, particleType?: string, overlayType?: string): void;
            setOceanMode(particleType?: string, overlayType?: string): void;
            setPlanetMode(planetType?: string): void;
            setFullScreen(): void;

            // Display control
            setProjection(projection: string): void;
            setOverlay(overlayType: string): void;
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

            // API mode control
            enableApiMode(): void;
            disableApiMode(): void;

            // Event helpers
            onConfigChange(callback: (event: CustomEvent) => void): void;
            offConfigChange(callback: (event: CustomEvent) => void): void;
        };
    }
}