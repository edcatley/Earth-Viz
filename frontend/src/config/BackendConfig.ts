/**
 * Backend Configuration - Smart Detection
 * Automatically detects whether running in standalone development or integrated mode
 */

export class BackendConfig {
    private static _baseUrl: string | null = null;

    /**
     * Get the appropriate backend base URL based on current environment
     */
    static getBaseUrl(): string {
        if (this._baseUrl !== null) {
            return this._baseUrl;
        }

        // Auto-detect based on current location
        const currentPort = window.location.port;

        // Standalone development mode detection
        if (currentPort === '8080' || currentPort === '5173') {
            // Running on Vite dev server - use standalone backend with earth-viz prefix
            this._baseUrl = 'http://localhost:8000/earth-viz';
        } else {
            // Integrated mode - use same origin with earth-viz prefix
            this._baseUrl = `${window.location.origin}/earth-viz`;
        }

        console.log(`[BackendConfig] Detected mode: ${this.getMode()}, using backend: ${this._baseUrl}`);
        return this._baseUrl;
    }

    /**
     * Get API endpoints with proper base URL
     */
    static getApiEndpoints() {
        const baseUrl = this.getBaseUrl();
        
        return {
            // Weather data endpoints
            weather: `${baseUrl}/api/weather`,
            weatherData: `${baseUrl}/api/weather/data`,
            weatherVector: `${baseUrl}/api/weather/vector`,
            
            // Earth image endpoints
            earth: `${baseUrl}/api/earth`,
            earthClouds: `${baseUrl}/api/earth-clouds`,
            earthLive: `${baseUrl}/api/earth-clouds-realtime`,
            
            // Live earth control endpoints
            liveEarthStatus: `${baseUrl}/api/live-earth/status`,
            liveEarthGenerate: `${baseUrl}/api/live-earth/generate`,
            
            // GRIB proxy endpoint
            gribProxy: `${baseUrl}/cgi-bin/filter_gfs_0p25.pl`,
            
            // Planet images
            planets: `${baseUrl}/api/planets`,
            
            // Health check
            health: `${baseUrl}/health`
        };
    }

    /**
     * Get current detected mode
     */
    static getMode(): 'standalone' | 'integrated' {
        const currentPort = window.location.port;
        return (currentPort === '8080' || currentPort === '5173') ? 'standalone' : 'integrated';
    }

    /**
     * Override the base URL (for testing or manual configuration)
     */
    static setBaseUrl(url: string): void {
        this._baseUrl = url;
        console.log(`[BackendConfig] Manual override: ${url}`);
    }

    /**
     * Reset to auto-detection
     */
    static resetToAutoDetect(): void {
        this._baseUrl = null;
    }

    /**
     * Test backend connectivity
     */
    static async testConnection(): Promise<boolean> {
        try {
            const healthUrl = this.getApiEndpoints().health;
            const response = await fetch(healthUrl, { 
                method: 'GET',
                timeout: 5000 
            } as any);
            
            if (response.ok) {
                const data = await response.json();
                console.log(`[BackendConfig] Backend connection OK:`, data);
                return true;
            } else {
                console.warn(`[BackendConfig] Backend responded with status: ${response.status}`);
                return false;
            }
        } catch (error) {
            console.error(`[BackendConfig] Backend connection failed:`, error);
            return false;
        }
    }
}
