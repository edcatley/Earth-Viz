"""
Standalone Development Server for Earth-Viz
This file is excluded from NPM packaging via .npmignore

This server is used for development and testing of the earth-viz backend
independently from any parent application.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import uvicorn
import logging
import os
from earth_viz_backend import create_earth_viz_router, startup_earth_viz, shutdown_earth_viz

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events"""
    # Startup
    logger.info("Starting Earth-Viz standalone server...")
    await startup_earth_viz()
    yield
    # Shutdown
    logger.info("Shutting down Earth-Viz standalone server...")
    await shutdown_earth_viz()

app = FastAPI(
    title="Earth-Viz Standalone Server",
    description="Development server for earth-viz backend",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000", 
        "http://localhost:5173", 
        "http://localhost:8080",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173", 
        "http://127.0.0.1:8080"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount the earth-viz router with standard prefix
earth_router = create_earth_viz_router()
app.include_router(earth_router)

# Mount the earth control router for external API
from earth_viz_backend.earth_control import create_earth_control_router
earth_control_router = create_earth_control_router()
app.include_router(earth_control_router)

# Serve static frontend files (production deployment)
frontend_dist_path = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.exists(frontend_dist_path):
    app.mount("/", StaticFiles(directory=frontend_dist_path, html=True), name="static")
    logger.info(f"Serving static files from: {frontend_dist_path}")
else:
    logger.warning(f"Frontend dist directory not found: {frontend_dist_path}")
    logger.info("Run 'npm run build' in frontend/ to create production bundle")

if __name__ == "__main__":
    logger.info("Starting Earth-Viz standalone development server on http://localhost:8000")
    uvicorn.run(
        "standalone_server:app",  # Use import string for reload
        host="0.0.0.0", 
        port=8000,
        reload=True,  # Now works with import string
        log_level="info"
    )
