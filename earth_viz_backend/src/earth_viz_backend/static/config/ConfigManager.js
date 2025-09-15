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
        Object.defineProperty(this, "apiMode", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        this.config = { ...initialConfig };
        console.log('[CONFIG] ConfigManager initialized with config:', this.config);
    }
    /**
     * Enable or disable API control mode
     * When enabled, UI controls are hidden and only API calls can change config
     */
    setApiMode(enabled) {
        console.log(`[CONFIG] Setting API mode: ${enabled}`);
        this.apiMode = enabled;
        this.toggleMenuVisibility(!enabled);
        // Dispatch custom event for external systems to listen to
        window.dispatchEvent(new CustomEvent('earth:apiModeChanged', {
            detail: { apiMode: enabled }
        }));
    }
    /**
     * Check if currently in API mode
     */
    isApiMode() {
        return this.apiMode;
    }
    /**
     * Update configuration (only works in API mode)
     * Used by external systems via the EarthAPI
     */
    updateConfig(changes) {
        if (!this.apiMode) {
            console.warn('[CONFIG] Attempted to update config via API while not in API mode');
            return;
        }
        console.log('[CONFIG] Updating config via API:', changes);
        const previousConfig = { ...this.config };
        Object.assign(this.config, changes);
        this.notifyListeners();
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
     * Update configuration from UI interactions (only works when not in API mode)
     * Used by MenuSystem for user interactions
     */
    updateFromUI(changes) {
        if (this.apiMode) {
            console.warn('[CONFIG] Attempted to update config from UI while in API mode');
            return;
        }
        console.log('[CONFIG] Updating config from UI:', changes);
        this.processUIChanges(changes);
        this.notifyListeners();
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
     */
    notifyListeners() {
        this.listeners.forEach(callback => {
            try {
                callback(this.config);
            }
            catch (error) {
                console.error('[CONFIG] Error in config change listener:', error);
            }
        });
    }
    /**
     * Show or hide the menu based on API mode
     */
    toggleMenuVisibility(visible) {
        const menu = document.getElementById('menu');
        const showMenuButton = document.getElementById('show-menu');
        if (menu) {
            if (visible) {
                menu.classList.remove('api-hidden');
                menu.style.display = '';
            }
            else {
                menu.classList.add('api-hidden');
                menu.style.display = 'none';
            }
        }
        if (showMenuButton) {
            if (visible) {
                showMenuButton.style.display = '';
            }
            else {
                showMenuButton.style.display = 'none';
            }
        }
        // Add CSS class to body to indicate API mode
        document.body.classList.toggle('api-mode', !visible);
    }
}
//# sourceMappingURL=ConfigManager.js.map