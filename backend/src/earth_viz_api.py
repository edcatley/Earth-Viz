"""
Earth-Viz API Router - Packageable FastAPI Router
This module provides the core earth-viz API as an importable FastAPI router
for integration into larger applications.
"""

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response, JSONResponse
from pydantic import BaseModel
import httpx
from datetime import datetime
import logging
import os
import asyncio
from .services.cloud_scheduler import scheduler
from .services.grib_service import GribService

# Configure logging
logger = logging.getLogger(__name__)

class HealthResponse(BaseModel):
    status: str
    timestamp: str
    version: str

def create_earth_viz_router() -> APIRouter:
    """
    Create and configure the Earth-Viz FastAPI router.
    This router can be mounted in any FastAPI application.
    
    Returns:
        APIRouter: Configured router with all earth-viz endpoints
    """
    router = APIRouter()

    # Health check endpoint
    @router.get("/health", response_model=HealthResponse)
    async def health_check():
        """Health check endpoint"""
        return HealthResponse(
            status="OK",
            timestamp=datetime.utcnow().isoformat(),
            version="1.0.0"
        )

    # GRIB proxy endpoint - replaces the localhost:3001 proxy
    @router.get("/cgi-bin/filter_gfs_0p25.pl")
    async def grib_proxy(request: Request):
        """
        Proxy endpoint for GRIB2 data from NOAA NOMADS
        Replaces the localhost:3001 proxy server
        """
        try:
            # Get all query parameters from the request
            query_params = dict(request.query_params)
            logger.info(f"GRIB proxy request with params: {query_params}")
            
            # Build the actual NOMADS URL
            base_url = "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl"
            
            # Forward the request to NOMADS
            timeout = httpx.Timeout(120.0)  # 2 minute timeout for GRIB downloads
            async with httpx.AsyncClient(timeout=timeout) as client:
                logger.info(f"Forwarding request to NOMADS: {base_url}")
                response = await client.get(base_url, params=query_params)
                response.raise_for_status()
                
                # Return the GRIB2 data with appropriate headers
                return Response(
                    content=response.content,
                    media_type="application/octet-stream",
                    headers={
                        "Content-Type": "application/octet-stream",
                        "Access-Control-Allow-Origin": "*",
                        "Access-Control-Allow-Methods": "GET",
                        "Access-Control-Allow-Headers": "*"
                    }
                )
                
        except Exception as e:
            logger.error(f"GRIB proxy error: {str(e)}")
            raise HTTPException(status_code=500, detail=f"GRIB proxy failed: {str(e)}")

    # Earth image endpoints
    @router.get("/api/v1/earth-clouds")
    async def get_earth_clouds():
        """Get the earth with clouds (static day version)"""
        try:
            image_path = "out/images/4096x2048/earth-clouds.jpg"
            if not os.path.exists(image_path):
                raise HTTPException(status_code=404, detail="Earth with clouds image not available")
            
            stat = os.stat(image_path)
            last_modified = datetime.fromtimestamp(stat.st_mtime).strftime('%a, %d %b %Y %H:%M:%S GMT')
            
            with open(image_path, "rb") as f:
                content = f.read()
            
            return Response(
                content=content,
                media_type="image/jpeg",
                headers={
                    "Last-Modified": last_modified,
                    "Cache-Control": "public, max-age=1800",
                    "Access-Control-Allow-Origin": "*"
                }
            )
        except Exception as e:
            logger.error(f"Error serving earth with clouds image: {str(e)}")
            raise HTTPException(status_code=500, detail="Failed to serve earth with clouds image")

    @router.get("/api/v1/earth-clouds-realtime")
    async def get_earth_clouds_realtime():
        """Get the earth with clouds and real-time day/night cycle"""
        try:
            image_path = "out/images/4096x2048/earth-clouds-realtime.jpg"
            if not os.path.exists(image_path):
                raise HTTPException(status_code=404, detail="Real-time earth with clouds image not available")
            
            stat = os.stat(image_path)
            last_modified = datetime.fromtimestamp(stat.st_mtime).strftime('%a, %d %b %Y %H:%M:%S GMT')
            
            with open(image_path, "rb") as f:
                content = f.read()
            
            return Response(
                content=content,
                media_type="image/jpeg",
                headers={
                    "Last-Modified": last_modified,
                    "Cache-Control": "public, max-age=1800",
                    "Access-Control-Allow-Origin": "*"
                }
            )
        except Exception as e:
            logger.error(f"Error serving real-time earth with clouds image: {str(e)}")
            raise HTTPException(status_code=500, detail="Failed to serve real-time earth with clouds image")

    @router.get("/api/v1/earth")
    async def get_earth():
        """Get the plain earth without clouds"""
        try:
            image_path = "out/images/4096x2048/earth.jpg"
            if not os.path.exists(image_path):
                raise HTTPException(status_code=404, detail="Plain earth image not available")
            
            stat = os.stat(image_path)
            last_modified = datetime.fromtimestamp(stat.st_mtime).strftime('%a, %d %b %Y %H:%M:%S GMT')
            
            with open(image_path, "rb") as f:
                content = f.read()
            
            return Response(
                content=content,
                media_type="image/jpeg",
                headers={
                    "Last-Modified": last_modified,
                    "Cache-Control": "public, max-age=1800",
                    "Access-Control-Allow-Origin": "*"
                }
            )
        except Exception as e:
            logger.error(f"Error serving plain earth image: {str(e)}")
            raise HTTPException(status_code=500, detail="Failed to serve plain earth image")

    # Weather data JSON endpoints
    @router.get("/api/v1/weather/data")
    async def get_weather_data(
        parameter: str,
        level: str,
        date: str = "current",
        hour: str = "00"
    ):
        """Get weather data as JSON (parsed from GRIB2 using eccodes)"""
        try:
            weather_data = await GribService.fetch_and_parse_grib(parameter, level, date, hour)
            return JSONResponse(content=weather_data)
        except Exception as e:
            logger.error(f"Weather data error: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to fetch weather data: {str(e)}")

    @router.get("/api/v1/weather/vector")
    async def get_vector_weather_data(
        u_parameter: str,
        v_parameter: str, 
        level: str,
        date: str = "current",
        hour: str = "00"
    ):
        """Get vector weather data (U,V components) as JSON"""
        try:
            vector_data = await GribService.fetch_vector_data(u_parameter, v_parameter, level, date, hour)
            return JSONResponse(content=vector_data)
        except Exception as e:
            logger.error(f"Vector weather data error: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to fetch vector weather data: {str(e)}")

    # Manual cloud generation endpoint
    @router.post("/api/v1/live-earth/generate")
    async def trigger_cloud_generation():
        """Manually trigger cloud generation"""
        try:
            asyncio.create_task(scheduler.force_generate())
            return {"status": "Cloud generation triggered"}
        except Exception as e:
            logger.error(f"Error triggering cloud generation: {str(e)}")
            raise HTTPException(status_code=500, detail="Failed to trigger cloud generation")

    return router

# Lifecycle management functions for integration
async def startup_earth_viz():
    """
    Start earth-viz services.
    Call this from the main app's startup event.
    """
    logger.info("Starting earth-viz services...")
    asyncio.create_task(scheduler.start())

async def shutdown_earth_viz():
    """
    Stop earth-viz services.
    Call this from the main app's shutdown event.
    """
    logger.info("Stopping earth-viz services...")
    await scheduler.stop()
