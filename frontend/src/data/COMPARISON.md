# Products.ts vs WeatherProduct.ts - Comparison

## Memory Usage Comparison

### OLD SYSTEM (Products.ts)
```
Scalar Overlay (Temperature):
├─ OpenDAP cache: 260KB (Float32Array)
├─ GridBuilder closure: 260KB (captures Float32Array)
├─ 2D grid array: 521KB (JS numbers)
├─ Grid closures: 521KB (captures 2D array)
└─ Total: ~1.5MB

Vector Product (Wind):
├─ OpenDAP cache U: 260KB
├─ OpenDAP cache V: 260KB
├─ OpenDAP cache vector: 1MB (magnitude + direction)
├─ GridBuilder closures: 520KB
├─ 2D grid array: 2.6MB
├─ Grid closures: 2.6MB
└─ Total: ~7.2MB
```

### NEW SYSTEM (WeatherProduct.ts)
```
Scalar Overlay (Temperature):
├─ ScalarWeatherProduct.data: 260KB (Float32Array)
└─ Total: 260KB

Vector Product (Wind):
├─ VectorWeatherProduct.uData: 260KB
├─ VectorWeatherProduct.vData: 260KB
└─ Total: 520KB
```

**Memory Savings:**
- Scalar: 83% reduction (1.5MB → 260KB)
- Vector: 93% reduction (7.2MB → 520KB)

---

## Code Comparison

### OLD SYSTEM - Creating a Temperature Overlay

```typescript
// Step 1: Create product shell
const product = Products.createOverlayProduct('temp', { 
    date: 'current', 
    level: '1000hPa' 
});

// Step 2: Load data (async, complex chain)
await product.load({ requested: false });

// Step 3: Use it
const value = product.interpolate(lon, lat);

// What actually happened:
// 1. WeatherDataManager.buildOverlayGrid()
// 2. fetchParameter() → OpenDAP fetch
// 3. createScalarGridBuilder() → wrap in functions
// 4. buildGrid() → copy to 2D array
// 5. Object.assign() → merge into product
// Result: 3 layers of abstraction, 2 copies of data
```

### NEW SYSTEM - Creating a Temperature Overlay

```typescript
// Step 1: Get config from catalog
const config = getOverlayConfig('temp', '1000hPa', new Date());

// Step 2: Create product (async, direct)
const product = await WeatherProductFactory.createScalar(config);

// Step 3: Use it
const value = product.interpolate(lon, lat);

// What actually happened:
// 1. fetchScalarData() → OpenDAP fetch
// 2. new ScalarWeatherProduct() → store data
// Result: 1 class, 1 copy of data
```

---

## API Comparison

### OLD SYSTEM

```typescript
// Confusing interfaces
interface GridBuilder {
    header: GridHeader;
    data: (index: number) => number | [number, number] | null;
    interpolate: (x, y, g00, g10, g01, g11) => ...;
}

interface Grid {
    source: string;
    date: Date;
    interpolate: (λ, φ) => ...;
    forEachPoint: (callback) => void;
}

interface Product {
    description: string;
    load: (cancel) => Promise<any>;
    // ... plus Grid properties after load()
}

// Usage is unclear
const product = Products.createOverlayProduct('temp', attr);
await product.load({ requested: false });
// Now product has interpolate() and forEachPoint()
// But TypeScript doesn't know that!
```

### NEW SYSTEM

```typescript
// Clear class hierarchy
abstract class WeatherProduct {
    abstract interpolate(lon, lat): ...;
    abstract forEachPoint(callback): void;
}

class ScalarWeatherProduct extends WeatherProduct {
    private readonly data: Float32Array;
    interpolate(lon, lat): number | null { ... }
}

class VectorWeatherProduct extends WeatherProduct {
    private readonly uData: Float32Array;
    private readonly vData: Float32Array;
    interpolate(lon, lat): [number, number, number] | null { ... }
}

// Usage is clear
const config = getOverlayConfig('temp', '1000hPa', new Date());
const product = await WeatherProductFactory.createScalar(config);
const value = product.interpolate(lon, lat);
// TypeScript knows exactly what methods exist!
```

---

## Caching Comparison

### OLD SYSTEM

```typescript
// Cache at OpenDAP level (wrong place)
class OpenDAPAsciiService {
    private cache: Map<string, any> = new Map();
    
    async fetchScalarData(...) {
        if (this.cache.has(key)) return this.cache.get(key);
        // fetch and cache
    }
}

// Problem: Caches raw data, but Products.buildGrid() 
// still creates 2D array every time!
```

### NEW SYSTEM

```typescript
// Cache at Product level (right place)
class ProductCache {
    private cache: Map<string, WeatherProduct> = new Map();
    
    async getOrCreate(name, level, date): Promise<WeatherProduct> {
        const key = `${name}-${level}-${date}`;
        
        if (this.cache.has(key)) {
            return this.cache.get(key)!;  // Instant!
        }
        
        // Create and cache
        const config = getOverlayConfig(name, level, date);
        const product = await WeatherProductFactory.createScalar(config);
        this.cache.set(key, product);
        
        return product;
    }
}

// Cache hit = instant return, no data processing needed
```

---

## Adding New Products

### OLD SYSTEM

```typescript
// Add to OVERLAY_CONFIGS (100+ lines of config)
const OVERLAY_CONFIGS = {
    my_new_overlay: {
        type: 'scalar',
        parameters: [{ 
            name: 'PARAM', 
            levelType: 'surface' 
        }],
        description: "My Overlay",
        units: [...],
        scale: { bounds: [...], gradient: ... }
    }
};

// Hope the WeatherDataManager handles it correctly
// Hope buildGrid() works with it
// Hope the closures don't leak memory
```

### NEW SYSTEM

```typescript
// Add to ProductCatalog (simple, clear)
export const OVERLAY_PRODUCTS = {
    my_new_overlay: {
        name: 'my_new_overlay',
        description: 'My Overlay',
        type: 'scalar',
        parameters: ['PARAM'],
        units: [...],
        scale: { bounds: [...], gradient: ... }
    }
};

// Done! Factory handles creation automatically
```

---

## Summary

| Aspect | OLD (Products.ts) | NEW (WeatherProduct.ts) |
|--------|-------------------|-------------------------|
| **Memory** | 1.5-7MB per product | 260-520KB per product |
| **Abstraction Layers** | 3 (GridBuilder → Grid → Product) | 1 (WeatherProduct) |
| **Data Copies** | 2-3 copies | 1 copy |
| **Code Clarity** | Confusing closures | Clear classes |
| **TypeScript Support** | Poor (dynamic Object.assign) | Excellent (proper types) |
| **Caching** | Wrong level (OpenDAP) | Right level (Product) |
| **Maintainability** | Low (10-year-old patterns) | High (modern patterns) |

**Recommendation: Replace Products.ts with WeatherProduct.ts**
