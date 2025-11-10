/**
 * ProductManager - Single interface for weather product management
 * 
 * Handles:
 * - Product caching (particle: 1 deep, overlay: 3 deep)
 * - Product creation via factory
 * - Config retrieval from catalog
 * 
 * Earth.ts just calls getParticleProduct() or getOverlayProduct()
 * and ProductManager handles all the complexity.
 */

import { WeatherProduct, WeatherProductFactory } from './WeatherProduct';
import { getParticleConfig, getOverlayConfig } from './ProductCatalog';

export class ProductManager {
    private static instance: ProductManager;
    
    // Caches - particle (1 deep), overlay (3 deep)
    private particleCache: Map<string, WeatherProduct> = new Map();
    private overlayCache: Map<string, WeatherProduct> = new Map();
    
    private constructor() {}
    
    public static getInstance(): ProductManager {
        if (!ProductManager.instance) {
            ProductManager.instance = new ProductManager();
        }
        return ProductManager.instance;
    }
    
    /**
     * Get particle product (with caching)
     */
    public async getParticleProduct(name: string, level: string, date: Date): Promise<WeatherProduct> {
        const cacheKey = `${name}-${level}`;
        
        // Check cache
        if (this.particleCache.has(cacheKey)) {
            console.log('[PRODUCT-MANAGER] Using cached particle product:', cacheKey);
            return this.particleCache.get(cacheKey)!;
        }
        
        // Not cached - create it
        console.log('[PRODUCT-MANAGER] Creating particle product:', cacheKey);
        const config = getParticleConfig(name, level, date);
        const product = await WeatherProductFactory.createVector(config);
        
        // Cache it (keep only 1 - most recent)
        this.particleCache.set(cacheKey, product);
        this.limitParticleCacheSize();
        
        return product;
    }
    
    /**
     * Get overlay product (with caching)
     */
    public async getOverlayProduct(name: string, level: string, date: Date): Promise<WeatherProduct> {
        const cacheKey = `${name}-${level}`;
        
        // Check cache
        if (this.overlayCache.has(cacheKey)) {
            console.log('[PRODUCT-MANAGER] Using cached overlay product:', cacheKey);
            return this.overlayCache.get(cacheKey)!;
        }
        
        // Not cached - create it
        console.log('[PRODUCT-MANAGER] Creating overlay product:', cacheKey);
        const config = getOverlayConfig(name, level, date);
        
        // Create based on type
        const product = config.type === 'scalar'
            ? await WeatherProductFactory.createScalar(config)
            : await WeatherProductFactory.createVector(config);
        
        // Cache it (keep last 3)
        this.overlayCache.set(cacheKey, product);
        this.limitOverlayCacheSize();
        
        return product;
    }
    
    /**
     * Limit particle cache to 1 most recent
     */
    private limitParticleCacheSize(): void {
        if (this.particleCache.size > 1) {
            const iterator = this.particleCache.keys();
            const firstResult = iterator.next();
            if (!firstResult.done) {
                this.particleCache.delete(firstResult.value);
                console.log('[PRODUCT-MANAGER] Evicted oldest particle from cache:', firstResult.value);
            }
        }
    }
    
    /**
     * Limit overlay cache to 3 most recent
     */
    private limitOverlayCacheSize(): void {
        if (this.overlayCache.size > 3) {
            const iterator = this.overlayCache.keys();
            const firstResult = iterator.next();
            if (!firstResult.done) {
                this.overlayCache.delete(firstResult.value);
                console.log('[PRODUCT-MANAGER] Evicted oldest overlay from cache:', firstResult.value);
            }
        }
    }
    
    /**
     * Clear all caches
     */
    public clearCaches(): void {
        this.particleCache.clear();
        this.overlayCache.clear();
        console.log('[PRODUCT-MANAGER] All caches cleared');
    }
}
