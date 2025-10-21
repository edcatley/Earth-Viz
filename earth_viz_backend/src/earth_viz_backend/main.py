"""
Earth-Viz Backend Main Application
Simple, straightforward FastAPI app with all the earth-viz functionality
"""

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import os
import logging
import asyncio
from pathlib import Path

from .earth_viz_api import create_earth_viz_router
from .earth_control import create_earth_control_router
from .services.cloud_scheduler import scheduler

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def create_app() -> FastAPI:
    """
    Create the FastAPI application with all earth-viz functionality
    All paths auto-detected from ~/.earth_viz/
    
    Returns:
        FastAPI: Configured application
    """
    
    from pathlib import Path
    static_images_dir = Path.home() / ".earth_viz" / "static_images"
    
    logger.info(f"Using static images from: {static_images_dir}")
    
    # Create FastAPI app
    app = FastAPI(title="Earth-Viz Backend", version="1.0.0")
    
    # Add CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # Mount API routers
    weather_router = create_earth_viz_router()
    app.include_router(weather_router)
    
    control_router = create_earth_control_router()
    control_router.prefix = "/earth-viz"
    app.include_router(control_router)
    
    # Mount static files under /earth-viz-app/
    current_dir = os.path.dirname(__file__)
    static_path = os.path.join(current_dir, "static")
    
    if os.path.exists(static_path):
        # Mount entire static directory at /earth-viz-app/
        app.mount("/earth-viz-app", StaticFiles(directory=static_path, html=True), name="static")
        logger.info(f"Static files mounted at /earth-viz-app/ from: {static_path}")
    else:
        logger.warning(f"Static files not found at: {static_path}")
    
    # Startup/shutdown handlers
    @app.on_event("startup")
    async def startup():
        logger.info("Starting earth-viz services...")
        asyncio.create_task(scheduler.start())
        logger.info("Earth-viz services started")
    
    @app.on_event("shutdown")
    async def shutdown():
        logger.info("Stopping earth-viz services...")
        await scheduler.stop()
        logger.info("Earth-viz services stopped")
    
    return app
