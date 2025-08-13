/**
 * Type declarations for grib22json package
 * Since the package doesn't provide its own TypeScript declarations
 */

declare module 'grib22json' {
    /**
     * Decode a GRIB2 file from ArrayBuffer
     * @param buffer - The GRIB2 file as ArrayBuffer
     * @returns Array of decoded GRIB2 messages
     */
    export function decodeGRIB2File(buffer: ArrayBuffer): any[];
    
    /**
     * Other exports from grib22json (add as needed)
     */
    export const GRIB2: any;
}