/**
 * Main entry point for the Earth visualization application.
 * This file initializes the core application and attaches the API to the window.
 */
import { EarthModernApp } from './core/Earth';
document.addEventListener('DOMContentLoaded', () => {
    // Instantiate the main application
    const earthApp = new EarthModernApp();
    // Expose the public API
    window.EarthAPI = earthApp.getAPI();
    // Start the application
    earthApp.start();
});
//# sourceMappingURL=main.js.map