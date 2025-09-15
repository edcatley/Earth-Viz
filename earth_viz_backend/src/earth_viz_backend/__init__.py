"""
Earth Viz Backend Package
FastAPI router for weather data and earth imagery
"""

from .earth_viz_api import create_earth_viz_router
from .earth_control import create_earth_control_router


__version__ = "0.1.0"
__all__ = [
    "create_earth_viz_router", 
    "create_earth_control_router"
]