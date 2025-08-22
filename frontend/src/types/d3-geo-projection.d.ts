/**
 * Type declarations for d3-geo-projection
 * Since @types/d3-geo-projection doesn't exist, we create minimal types
 */

declare module 'd3-geo-projection' {
    import { GeoProjection } from 'd3-geo';

    // Projection functions that return GeoProjection
    export function geoWaterman(): GeoProjection;
    export function geoWinkel3(): GeoProjection;
    export function geoStereographic(): GeoProjection;
    export function geoAzimuthalEquidistant(): GeoProjection;
    export function geoConicEquidistant(): GeoProjection;
    
    // Add other projections as needed
    export function geoAtlantis(): GeoProjection;
}
