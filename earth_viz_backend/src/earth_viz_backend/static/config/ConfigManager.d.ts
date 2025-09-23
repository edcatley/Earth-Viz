/**
 * ConfigManager - Centralized configuration management for Earth visualization
 * Handles both UI-driven and API-driven configuration changes
 */
export interface EarthConfig {
    mode: 'air' | 'ocean' | 'planet';
    projection: string;
    overlayType: string;
    planetType?: string;
    level: string;
    showGridPoints: boolean;
    windUnits: string;
    particleType: string;
    date: string;
    hour: string;
    orientation?: string;
    navigateHours?: number;
    toggleGrid?: boolean;
    toggleWindUnits?: boolean;
    toggleValueUnits?: boolean;
    showUI?: boolean;
    isFullScreen?: boolean;
}
export type ConfigChangeCallback = (config: EarthConfig, changes?: Partial<EarthConfig>) => void;
export declare class ConfigManager {
    private config;
    private listeners;
    constructor(initialConfig: EarthConfig);
    /**
     * Update configuration
     */
    updateConfig(changes: Partial<EarthConfig>): void;
    /**
     * Update configuration from UI interactions
     * Used by MenuSystem for user interactions
     */
    updateFromUI(changes: any): void;
    /**
     * Get current configuration (read-only copy)
     */
    getConfig(): EarthConfig;
    /**
     * Add a listener for configuration changes
     */
    addListener(callback: ConfigChangeCallback): void;
    /**
     * Remove a configuration change listener
     */
    removeListener(callback: ConfigChangeCallback): void;
    /**
     * Process UI-specific changes and convert them to config updates
     */
    private processUIChanges;
    /**
     * Notify all listeners of configuration changes
     * @param changes Optional parameter with specific changes that were made
     */
    private notifyListeners;
}
//# sourceMappingURL=ConfigManager.d.ts.map