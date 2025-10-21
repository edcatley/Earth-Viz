"""
Earth visualization control via WebSocket bridge
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import JSONResponse
from typing import Dict, List, Any
import json
import logging
from datetime import datetime
import asyncio

logger = logging.getLogger(__name__)

class EarthWebSocketManager:
    """Manages WebSocket connections to Earth frontend clients"""
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.connection_event = asyncio.Event()  

        
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        self.connection_event.set()  
        logger.info(f"Earth client connected. Total connections: {len(self.active_connections)}")
    
    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        if not self.active_connections:
            self.connection_event.clear()  
        logger.info(f"Earth client disconnected. Total connections: {len(self.active_connections)}")
    
    async def wait_for_connection(self, timeout: float = 30.0):  
        """Wait for at least one client to connect"""
        try:
            await asyncio.wait_for(self.connection_event.wait(), timeout=timeout)
            return True
        except asyncio.TimeoutError:
            return False
    
    async def send_command_to_earth(self, command: str, params: List[Any] = None):
        """Send command to all connected Earth clients"""
        if not self.active_connections:
            raise HTTPException(status_code=503, detail="No Earth clients connected")
        
        message = {
            "type": "EARTH_COMMAND",
            "command": command,
            "params": params or [],
            "timestamp": datetime.now().isoformat()
        }
        
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_text(json.dumps(message))
            except Exception as e:
                logger.error(f"Failed to send command to client: {e}")
                disconnected.append(connection)
        
        # Remove disconnected clients
        for conn in disconnected:
            self.disconnect(conn)
        
        return {
            "status": "sent",
            "clients_notified": len(self.active_connections),
            "command": command,
            "params": params
        }

# Global WebSocket manager
earth_ws_manager = EarthWebSocketManager()

# Direct control functions for integrated mode
async def set_projection(projection: str):
    """Set projection"""
    return await earth_ws_manager.send_command_to_earth("setProjection", [projection])

async def set_overlay(overlay_type: str):
    """Set overlay"""
    return await earth_ws_manager.send_command_to_earth("setOverlay", [overlay_type])

async def set_config(config: dict):
    """Set configuration"""
    return await earth_ws_manager.send_command_to_earth("setConfig", [config])

# Mode variants
async def set_air_mode(level: str = None, particle_type: str = None, overlay_type: str = None):
    """Set air mode with optional parameters"""
    params = [p for p in [level, particle_type, overlay_type] if p is not None]
    return await earth_ws_manager.send_command_to_earth("setAirMode", params)

async def set_ocean_mode(particle_type: str = None, overlay_type: str = None):
    """Set ocean mode with optional parameters"""
    params = [p for p in [particle_type, overlay_type] if p is not None]
    return await earth_ws_manager.send_command_to_earth("setOceanMode", params)

async def set_planet_mode(planet_type: str = "earth"):
    """Set planet mode"""
    return await earth_ws_manager.send_command_to_earth("setPlanetMode", [planet_type])
    
async def set_level(level: str):
    """Set level"""
    return await earth_ws_manager.send_command_to_earth("setLevel", [level])

# Grid controls
async def show_grid():
    """Show grid"""
    return await earth_ws_manager.send_command_to_earth("showGrid", [])

async def hide_grid():
    """Hide grid"""
    return await earth_ws_manager.send_command_to_earth("hideGrid", [])

# Units
async def set_wind_units(units: str):
    """Set wind units"""
    return await earth_ws_manager.send_command_to_earth("setWindUnits", [units])

# Time navigation
async def set_date(date: str):
    """Set date"""
    return await earth_ws_manager.send_command_to_earth("setDate", [date])

async def set_hour(hour: str):
    """Set hour"""
    return await earth_ws_manager.send_command_to_earth("setHour", [hour])

async def navigate_time(hours: int):
    """Navigate time by a number of hours"""
    return await earth_ws_manager.send_command_to_earth("navigateTime", [hours])

async def go_to_now():
    """Reset time to current"""
    return await earth_ws_manager.send_command_to_earth("goToNow", [])

# Config management
async def reset_config():
    """Reset configuration to defaults"""
    return await earth_ws_manager.send_command_to_earth("resetConfig", [])

# API mode controls
async def hideUI():
    """Hide UI"""
    return await earth_ws_manager.send_command_to_earth("hideUI", [])

async def showUI():
    """Show UI"""
    return await earth_ws_manager.send_command_to_earth("showUI", [])

async def enable_full_screen():
    """Enable full screen mode"""
    return await earth_ws_manager.send_command_to_earth("enableFullScreen", [])

async def disable_full_screen():
    """Disable full screen mode"""
    return await earth_ws_manager.send_command_to_earth("disableFullScreen", [])

async def get_status():
    """Get connection status"""
    return {
        "status": "ok",
        "client_count": len(earth_ws_manager.active_connections)
    }
async def await_earth_connection(timeout: float = 30.0) -> bool:
    """Wait for earth-viz frontend to connect. Returns True if connected, False if timeout."""
    return await earth_ws_manager.wait_for_connection(timeout)


def create_earth_control_router() -> APIRouter:
    """Create FastAPI router for Earth control endpoints"""
    router = APIRouter(prefix="/earth-viz", tags=["earth-control"])
    
    @router.websocket("/ws")
    async def earth_websocket_endpoint(websocket: WebSocket):
        """WebSocket endpoint for Earth frontend to connect"""
        await earth_ws_manager.connect(websocket)
        try:
            while True:
                # Keep connection alive and listen for any client messages
                data = await websocket.receive_text()
                logger.debug(f"Received from Earth client: {data}")
                # Could handle client-to-server messages here if needed
        except WebSocketDisconnect:
            earth_ws_manager.disconnect(websocket)
    
    return router
