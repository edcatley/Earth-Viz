"""
Earth-Viz API Router - Packageable FastAPI Router
This module provides the core earth-viz API as an importable FastAPI router
for integration into larger applications.
"""

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response, JSONResponse, StreamingResponse
from pydantic import BaseModel
import httpx
from datetime import datetime
import logging
import os
import asyncio
from pathlib import Path
from .services.cloud_scheduler import scheduler
from .earth_control import earth_ws_manager

import tempfile

# Hardcoded paths
STATIC_IMAGES_DIR = Path.home() / ".earth_viz" / "static_images"
OUTPUT_DIR = Path.home() / ".earth_viz" / "images"
RESOLUTION = "2048x1024"
# Configure logging
logger = logging.getLogger(__name__)

class HealthResponse(BaseModel):
    status: str
    timestamp: str
    version: str

def create_earth_viz_router(prefix: str = "/earth-viz/api") -> APIRouter:
    """
    Create and configure the Earth-Viz FastAPI router.
    This router can be mounted in any FastAPI application.
    
    Args:
        prefix: URL prefix for the router (default: "/earth-viz/api")
    
    Returns:
        APIRouter: Configured router with all earth-viz endpoints
    """
    router = APIRouter(prefix=prefix, tags=["earth-viz"])

    # Health check endpoint
    @router.get("/health", response_model=HealthResponse)
    async def health_check():
        """Health check endpoint"""
        return HealthResponse(
            status="OK",
            timestamp=datetime.utcnow().isoformat(),
            version="1.0.0"
        )
    
    # Status endpoint with WebSocket connection info
    @router.get("/status")
    async def status():
        """Get API status including WebSocket connections"""
        return {
            "status": "active" if earth_ws_manager.active_connections else "no_clients",
            "connected_clients": len(earth_ws_manager.active_connections),
            "timestamp": datetime.utcnow().isoformat()
        }

    # GRIB proxy endpoint - replaces the localhost:3001 proxy
    @router.get("/cgi-bin/filter_gfs_0p25.pl")
    async def grib_proxy(request: Request):
        """
        Streaming proxy endpoint for GRIB2 data from NOAA NOMADS.
        Relays chunks as they arrive for minimal memory usage.
        """
        try:
            # Get all query parameters from the request
            query_params = dict(request.query_params)
            logger.info(f"GRIB proxy request with params: {query_params}")
            
            # Build the actual NOMADS URL
            base_url = "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl"
            
            # Stream the request to NOMADS
            timeout = httpx.Timeout(120.0)  # 2 minute timeout for GRIB downloads
            async with httpx.AsyncClient(timeout=timeout) as client:
                logger.info(f"Forwarding request to NOMADS: {base_url}")
                response = await client.get(base_url, params=query_params)
                response.raise_for_status()
                
                # Return streaming response
                return StreamingResponse(
                    iter([response.content]),
                    media_type="application/octet-stream",
                    headers={
                        "Content-Type": "application/octet-stream",
                        "Access-Control-Allow-Origin": "*",
                        "Access-Control-Allow-Methods": "GET",
                        "Access-Control-Allow-Headers": "*",
                        "Cache-Control": "no-cache"
                    }
                )
                
        except Exception as e:
            logger.error(f"GRIB proxy error: {str(e)}")
            raise HTTPException(status_code=500, detail=f"GRIB proxy failed: {str(e)}")

    # OpenDAP streaming proxy endpoint
    @router.get("/proxy/opendap")
    async def opendap_streaming_proxy(url: str):
        """
        Streaming proxy for OpenDAP data - relays chunks as they arrive.
        Zero buffering, minimal memory usage, fastest possible transfer.
        
        Usage:
        /proxy/opendap?url=https://nomads.ncep.noaa.gov/dods/gfs_0p25/gfs20241022/gfs_0p25_18z.dods?ugrd10m[0][0:720][0:1439]
        """
        try:
            logger.info(f"OpenDAP streaming proxy request: {url}")
            
            # Stream the response from OpenDAP
            timeout = httpx.Timeout(120.0)
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.get(url)
                response.raise_for_status()
                
                # Return streaming response
                return StreamingResponse(
                    iter([response.content]),
                    media_type="application/octet-stream",
                    headers={
                        "Content-Type": "application/octet-stream",
                        "Access-Control-Allow-Origin": "*",
                        "Access-Control-Allow-Methods": "GET",
                        "Access-Control-Allow-Headers": "*",
                        "Cache-Control": "no-cache"
                    }
                )
                    
        except Exception as e:
            logger.error(f"OpenDAP proxy error: {str(e)}")
            raise HTTPException(status_code=500, detail=f"OpenDAP proxy failed: {str(e)}")

    # Planet image endpoints
    @router.get("/planets/{planet_name}")
    async def get_planet_image(planet_name: str):
        """Serves planet images - simple static file serving."""
        try:
            # All planets are just static files now
            image_path = STATIC_IMAGES_DIR / "planets" / f"{RESOLUTION}" /f"{planet_name}.jpg"

            if not image_path.exists():
                raise HTTPException(status_code=404, detail=f"Image not found for: {planet_name}")
            
            stat = os.stat(image_path)
            last_modified = datetime.fromtimestamp(stat.st_mtime).strftime('%a, %d %b %Y %H:%M:%S GMT')
            
            with open(image_path, "rb") as f:
                content = f.read()
            
            return Response(
                content=content,
                media_type="image/jpeg",
                headers={
                    "Last-Modified": last_modified,
                    "Cache-Control": "public, max-age=86400",  # Cache for 24 hours
                    "Access-Control-Allow-Origin": "*"
                }
            )
        except Exception as e:
            logger.error(f"Error serving planet image {planet_name}: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to serve planet image: {planet_name}")

    # Weather data endpoints removed - frontend now uses OpenDAP directly via proxy

    # Manual cloud generation endpoint
    @router.get("/live-earth/status")
    async def trigger_cloud_generation():
        """Manually trigger cloud generation"""
        try:
            asyncio.create_task(scheduler.force_generate())
            return {"status": "Cloud generation triggered"}
        except Exception as e:
            logger.error(f"Error triggering cloud generation: {str(e)}")
            raise HTTPException(status_code=500, detail="Failed to trigger cloud generation")

    # Format comparison endpoint removed - no longer using GRIB2

    return router
