/**
 * ConfigManager - Centralized configuration management for Earth visualization
 * Handles both UI-driven and API-driven configuration changes
 */

export interface EarthConfig {
    mode: 'air' | 'ocean' | 'planet';
    projection: string;
    overlayType: string;
    planetType?: string;
    useDayNight?: boolean;  // Enable real-time day/night blending for planets
    level: string;
    showGridPoints: boolean;
    windUnits: string;
    particleType: string;
    date: string;
    hour: string;
    orientation?: string;
    // Navigation and display options
    navigateHours?: number;
    toggleGrid?: boolean;
    toggleWindUnits?: boolean;
    toggleValueUnits?: boolean;
    // UI visibility
    showUI?: boolean;
    isFullScreen?: boolean;
}

export type ConfigChangeCallback = (config: EarthConfig, changes?: Partial<EarthConfig>) => void;

export class ConfigManager {
    private config: EarthConfig;
    private listeners: ConfigChangeCallback[] = [];

    constructor(initialConfig: EarthConfig) {
        this.config = { ...initialConfig };
        console.log('[CONFIG] ConfigManager initialized with config:', this.config);
    }

    /**
     * Update configuration
     */
    updateConfig(changes: Partial<EarthConfig>): void {
        console.log('[CONFIG] Updating config:', changes);
        const previousConfig = { ...this.config };
        Object.assign(this.config, changes);
        
        this.notifyListeners(changes);
        
        // Dispatch custom event for external systems
        window.dispatchEvent(new CustomEvent('earth:configChanged', { 
            detail: { 
                config: this.config, 
                changes,
                previousConfig 
            } 
        }));
    }

    /**
     * Update configuration from UI interactions
     * Used by MenuSystem for user interactions
     */
    updateFromUI(changes: any): void {
        console.log('[CONFIG] Updating config from UI:', changes);
        this.processUIChanges(changes);
        this.notifyListeners(changes);
    }

    /**
     * Get current configuration (read-only copy)
     */
    getConfig(): EarthConfig {
        return { ...this.config };
    }

    /**
     * Add a listener for configuration changes
     */
    addListener(callback: ConfigChangeCallback): void {
        this.listeners.push(callback);
    }

    /**
     * Remove a configuration change listener
     */
    removeListener(callback: ConfigChangeCallback): void {
        const index = this.listeners.indexOf(callback);
        if (index > -1) {
            this.listeners.splice(index, 1);
        }
    }

    /**
     * Process UI-specific changes and convert them to config updates
     */
    private processUIChanges(changes: any): void {
        // Handle special UI actions
        if (changes.toggleGrid) {
            this.config.showGridPoints = !this.config.showGridPoints;
            return;
        }

        if (changes.toggleWindUnits) {
            // Cycle through wind units: m/s -> km/h -> mph -> kt -> m/s
            const units = ['m/s', 'km/h', 'mph', 'kt'];
            const currentIndex = units.indexOf(this.config.windUnits);
            this.config.windUnits = units[(currentIndex + 1) % units.length];
            return;
        }

        if (changes.navigateHours) {
            // Handle time navigation - this would need to be implemented based on current date/time logic
            console.log(`[CONFIG] Navigate time by ${changes.navigateHours} hours`);
            // TODO: Implement time navigation logic
            return;
        }

        // Handle direct config changes
        Object.assign(this.config, changes);
    }

    /**
     * Notify all listeners of configuration changes
     * @param changes Optional parameter with specific changes that were made
     */
    private notifyListeners(changes?: Partial<EarthConfig>): void {
        this.listeners.forEach(callback => {
            try {
                callback(this.config, changes);
            } catch (error) {
                console.error('[CONFIG] Error in config change listener:', error);
            }
        });
    }

}