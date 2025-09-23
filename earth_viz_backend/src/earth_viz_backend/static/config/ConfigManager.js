/**
 * ConfigManager - Centralized configuration management for Earth visualization
 * Handles both UI-driven and API-driven configuration changes
 */
export class ConfigManager {
    constructor(initialConfig) {
        Object.defineProperty(this, "config", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "listeners", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        this.config = { ...initialConfig };
        console.log('[CONFIG] ConfigManager initialized with config:', this.config);
    }
    /**
     * Update configuration
     */
    updateConfig(changes) {
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
    updateFromUI(changes) {
        console.log('[CONFIG] Updating config from UI:', changes);
        this.processUIChanges(changes);
        this.notifyListeners(changes);
    }
    /**
     * Get current configuration (read-only copy)
     */
    getConfig() {
        return { ...this.config };
    }
    /**
     * Add a listener for configuration changes
     */
    addListener(callback) {
        this.listeners.push(callback);
    }
    /**
     * Remove a configuration change listener
     */
    removeListener(callback) {
        const index = this.listeners.indexOf(callback);
        if (index > -1) {
            this.listeners.splice(index, 1);
        }
    }
    /**
     * Process UI-specific changes and convert them to config updates
     */
    processUIChanges(changes) {
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
    notifyListeners(changes) {
        this.listeners.forEach(callback => {
            try {
                callback(this.config, changes);
            }
            catch (error) {
                console.error('[CONFIG] Error in config change listener:', error);
            }
        });
    }
}
//# sourceMappingURL=ConfigManager.js.map