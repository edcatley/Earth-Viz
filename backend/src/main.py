"""
DEPRECATED: This file is being replaced by the new modular structure.
Use standalone_server.py for development instead.

This file is kept temporarily for reference but will be removed.
"""

# Import the new modular components
from src.earth_viz_api import create_earth_viz_router, startup_earth_viz, shutdown_earth_viz
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create app using the new modular structure
app = FastAPI(
    title="Weather Data Proxy (DEPRECATED)",
    description="DEPRECATED: Use standalone_server.py instead",
    version="1.0.0"
)

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "http://localhost:8080"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount the earth-viz router
earth_router = create_earth_viz_router()
app.include_router(earth_router)

# Startup and shutdown events
@app.on_event("startup")
async def startup_event():
    """Start the earth-viz services"""
    logger.warning("DEPRECATED: Use standalone_server.py for development")
    await startup_earth_viz()

@app.on_event("shutdown")
async def shutdown_event():
    """Stop the earth-viz services"""
    await shutdown_earth_viz()

if __name__ == "__main__":
    import uvicorn
    logger.warning("DEPRECATED: Use 'python standalone_server.py' instead")
    uvicorn.run(app, host="0.0.0.0", port=8000)