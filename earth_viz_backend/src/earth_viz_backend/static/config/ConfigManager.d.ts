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
}
export type ConfigChangeCallback = (config: EarthConfig) => void;
export declare class ConfigManager {
    private config;
    private listeners;
    private apiMode;
    constructor(initialConfig: EarthConfig);
    /**
     * Enable or disable API control mode
     * When enabled, UI controls are hidden and only API calls can change config
     */
    setApiMode(enabled: boolean): void;
    /**
     * Check if currently in API mode
     */
    isApiMode(): boolean;
    /**
     * Update configuration (only works in API mode)
     * Used by external systems via the EarthAPI
     */
    updateConfig(changes: Partial<EarthConfig>): void;
    /**
     * Update configuration from UI interactions (only works when not in API mode)
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
     */
    private notifyListeners;
    /**
     * Show or hide the menu based on API mode
     */
    private toggleMenuVisibility;
}
//# sourceMappingURL=ConfigManager.d.ts.map