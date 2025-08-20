/**
 * Earth Visualization Package
 * 
 * This is the main entry point for the Earth visualization package.
 * It exports the core EarthModernApp class and related types.
 */

// Export the main Earth application class
export { EarthModernApp } from './core/Earth';

// Export configuration types
export type { EarthAppConfig } from './config/EarthAppConfig';

// Export projection types
export { ProjectionType } from './types/ProjectionType';

// Export utility functions
export { default as colorScales } from './utils/colorScales';
export { default as products } from './utils/products';

// Export version
export const version = '0.1.0';
