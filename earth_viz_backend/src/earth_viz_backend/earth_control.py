"""
Earth visualization control via WebSocket bridge
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import JSONResponse
from typing import Dict, List, Any
import json
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

class EarthWebSocketManager:
    """Manages WebSocket connections to Earth frontend clients"""
    
    def __init__(self):
        self.active_connections: List[WebSocket] = []
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"Earth client connected. Total connections: {len(self.active_connections)}")
    
    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(f"Earth client disconnected. Total connections: {len(self.active_connections)}")
    
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
async def set_mode(mode: str):
    """Set visualization mode"""
    return await earth_ws_manager.send_command_to_earth("setMode", [mode])

async def set_projection(projection: str):
    """Set projection"""
    return await earth_ws_manager.send_command_to_earth("setProjection", [projection])

async def set_height(level: str):
    """Set height/level"""
    return await earth_ws_manager.send_command_to_earth("setHeight", [level])

async def set_overlay(overlay_type: str):
    """Set overlay"""
    return await earth_ws_manager.send_command_to_earth("setOverlay", [overlay_type])

async def set_config(config: dict):
    """Set configuration"""
    return await earth_ws_manager.send_command_to_earth("setConfig", [config])

# Mode variants
async def set_air_mode():
    """Set air mode"""
    return await earth_ws_manager.send_command_to_earth("setAirMode", [])

async def set_ocean_mode():
    """Set ocean mode"""
    return await earth_ws_manager.send_command_to_earth("setOceanMode", [])

async def set_planet_mode(planet_type: str = "earth"):
    """Set planet mode"""
    return await earth_ws_manager.send_command_to_earth("setPlanetMode", [planet_type])

# Display controls
async def set_planet(planet_type: str):
    """Set planet type"""
    return await earth_ws_manager.send_command_to_earth("setPlanet", [planet_type])

async def set_surface(surface: str):
    """Set surface type"""
    return await earth_ws_manager.send_command_to_earth("setSurface", [surface])

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

async def toggle_grid():
    """Toggle grid"""
    return await earth_ws_manager.send_command_to_earth("toggleGrid", [])

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
    """Navigate time"""
    return await earth_ws_manager.send_command_to_earth("navigateTime", [hours])

async def go_to_now():
    """Go to current time"""
    return await earth_ws_manager.send_command_to_earth("goToNow", [])

# API mode controls
async def enable_api_mode():
    """Enable API mode"""
    return await earth_ws_manager.send_command_to_earth("enableApiMode", [])

async def disable_api_mode():
    """Disable API mode"""
    return await earth_ws_manager.send_command_to_earth("disableApiMode", [])

async def is_api_mode():
    """Check API mode status"""
    return await earth_ws_manager.send_command_to_earth("isApiMode", [])

def get_status():
    """Get current WebSocket connection status"""
    return {
        "connected_clients": len(earth_ws_manager.active_connections),
        "status": "connected" if earth_ws_manager.active_connections else "disconnected"
    }

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
    
    @router.post("/command/{command}")
    async def send_earth_command(command: str, params: List[Any] = None):
        """Send command to Earth visualization"""
        try:
            result = await earth_ws_manager.send_command_to_earth(command, params)
            return result
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Failed to send Earth command: {e}")
            raise HTTPException(status_code=500, detail=str(e))
    
    @router.post("/setMode")
    async def set_mode_api(mode: str):
        """Set visualization mode via API"""
        return await set_mode(mode)
    
    @router.post("/setProjection")
    async def set_projection_api(projection: str):
        """Set projection via API"""
        return await set_projection(projection)
    
    @router.post("/setOverlay")
    async def set_overlay_api(overlay_type: str):
        """Set overlay via API"""
        return await set_overlay(overlay_type)
    
    @router.post("/setConfig")
    async def set_config_api(config: Dict[str, Any]):
        """Set configuration via API"""
        return await set_config(config)
    
    @router.post("/enableApiMode")
    async def enable_api_mode_api():
        """Enable API mode via API"""
        return await enable_api_mode()
    
    @router.get("/status")
    async def get_status_api():
        """Get control status"""
        return {
            "status": "active" if earth_ws_manager.active_connections else "no_clients",
            "connected_clients": len(earth_ws_manager.active_connections),
            "timestamp": datetime.now().isoformat()
        }
    
    return router
