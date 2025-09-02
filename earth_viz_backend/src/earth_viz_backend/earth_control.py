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

def create_earth_control_router() -> APIRouter:
    """Create FastAPI router for Earth control endpoints"""
    router = APIRouter(prefix="/api/earth", tags=["earth-control"])
    
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
    async def set_mode(mode: str):
        """Set Earth visualization mode"""
        return await earth_ws_manager.send_command_to_earth("setMode", [mode])
    
    @router.post("/setProjection")
    async def set_projection(projection: str):
        """Set Earth projection"""
        return await earth_ws_manager.send_command_to_earth("setProjection", [projection])
    
    @router.post("/setOverlay")
    async def set_overlay(overlay_type: str):
        """Set Earth overlay"""
        return await earth_ws_manager.send_command_to_earth("setOverlay", [overlay_type])
    
    @router.post("/setConfig")
    async def set_config(config: Dict[str, Any]):
        """Set Earth configuration"""
        return await earth_ws_manager.send_command_to_earth("setConfig", [config])
    
    @router.get("/status")
    async def get_earth_status():
        """Get Earth control status"""
        return {
            "status": "active" if earth_ws_manager.active_connections else "no_clients",
            "connected_clients": len(earth_ws_manager.active_connections),
            "timestamp": datetime.now().isoformat()
        }
    
    return router
