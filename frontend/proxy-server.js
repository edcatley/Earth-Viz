import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import cors from 'cors';

const app = express();
const PORT = 3001;

// Enable CORS for all routes
app.use(cors());

// Add request timeout and size limits
app.use(express.json({ limit: '50mb' }));
app.use(express.raw({ limit: '50mb', type: 'application/octet-stream' }));

// Proxy middleware for NOAA NOMADS - handle ALL routes
const nomadsProxy = createProxyMiddleware({
    target: 'https://nomads.ncep.noaa.gov',
    changeOrigin: true,
    timeout: 60000, // 60 second timeout
    proxyTimeout: 60000,
    onProxyReq: (proxyReq, req, res) => {
        console.log(`[PROXY] ${req.method} ${req.url} -> ${proxyReq.getHeader('host')}${proxyReq.path}`);
    },
    onProxyRes: (proxyRes, req, res) => {
        console.log(`[PROXY] Response: ${proxyRes.statusCode} for ${req.url}`);
    },
    onError: (err, req, res) => {
        console.error('[PROXY] Error:', err.message);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Proxy error', message: err.message });
        }
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Use the proxy for ALL routes except health check
app.use('/', (req, res, next) => {
    if (req.path === '/health') {
        next();
    } else {
        nomadsProxy(req, res, next);
    }
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('[PROXY] Unhandled error:', err);
    if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Handle process crashes gracefully
process.on('uncaughtException', (err) => {
    console.error('[PROXY] Uncaught Exception:', err);
    // Don't exit, just log the error
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[PROXY] Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit, just log the error
});

const server = app.listen(PORT, () => {
    console.log(`[PROXY] GRIB2 proxy server running on http://localhost:${PORT}`);
    console.log(`[PROXY] NOAA NOMADS data available at: http://localhost:${PORT}/...`);
});

// Set server timeout
server.timeout = 120000; // 2 minutes 