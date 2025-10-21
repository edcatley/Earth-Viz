"""
Earth Viz Backend Package
FastAPI router for weather data and earth imagery
"""

from .earth_viz_api import create_earth_viz_router
from .earth_control import (
    create_earth_control_router,
    # Direct control functions for integrated mode
    set_projection,
    set_overlay,
    set_config,
    set_air_mode,
    set_ocean_mode,
    set_planet_mode,
    set_level,
    show_grid,
    hide_grid,
    set_wind_units,
    set_date,
    set_hour,
    navigate_time,
    go_to_now,
    reset_config,
    hideUI,
    showUI,
    enable_full_screen,
    disable_full_screen,
    get_status,
    await_earth_connection
)


__version__ = "0.1.0"
__all__ = [
    "create_earth_viz_router", 
    "create_earth_control_router",
    # Control functions
    "set_projection",
    "set_overlay",
    "set_config",
    "set_air_mode",
    "set_ocean_mode",
    "set_planet_mode",
    "set_level",
    "show_grid",
    "hide_grid",
    "set_wind_units",
    "set_date",
    "set_hour",
    "navigate_time",
    "go_to_now",
    "reset_config",
    "hideUI",
    "showUI",
    "enable_full_screen",
    "disable_full_screen",
    "get_status",
    "await_earth_connection"
]