"""
Cloud Map Scheduler
Downloads cloud images from matteason's CDN periodically
"""

import asyncio
import logging
import signal
import httpx
import tempfile
import shutil
from pathlib import Path
from typing import Optional

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
RESOLUTION = "2048x1024"
CLOUD_BASE_URL = f"https://clouds.matteason.co.uk/images/{RESOLUTION}"
PLANETS_DIR = Path.home() / ".earth_viz"/ "static_images" / "planets" / f"{RESOLUTION}"

class CloudScheduler:
    def __init__(self, interval_minutes: int = 180):
        self.interval_minutes = interval_minutes
        self.running = False
        self.task: Optional[asyncio.Task] = None
        self.generation_in_progress = False
        
    async def start(self):
        """Start the scheduler"""
        if self.running:
            logger.warning("Scheduler is already running")
            return
            
        self.running = True
        logger.info(f"Starting cloud scheduler with {self.interval_minutes} minute intervals")
        
        # Generate clouds in background (don't block startup)
        asyncio.create_task(self.generate_clouds())
        
        # Then schedule periodic runs
        self.task = asyncio.create_task(self._schedule_loop())
        
    async def stop(self):
        """Stop the scheduler"""
        logger.info("Stopping cloud scheduler...")
        self.running = False
        
        # Cancel the scheduling task
        if self.task:
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
                
        logger.info("Cloud scheduler stopped")
        # Note: Any in-progress generation will continue to run in its thread
        # until completion, but no new tasks will be scheduled.
        
    async def _schedule_loop(self):
        """Main scheduling loop"""
        while self.running:
            try:
                # Wait for the interval
                await asyncio.sleep(self.interval_minutes * 60)
                
                if self.running:  # Check if we're still supposed to be running
                    await self.generate_clouds()
                    
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in scheduler loop: {e}")
                # Continue running even if there's an error
                
    async def generate_clouds(self):
        """Download cloud images from matteason's CDN"""
        if self.generation_in_progress:
            logger.warning("Cloud download already in progress, skipping this run.")
            return

        try:
            self.generation_in_progress = True
            logger.info("Downloading cloud images from matteason's CDN...")
            
            # Ensure directory exists
            PLANETS_DIR.mkdir(parents=True, exist_ok=True)
            
            # Download both images in parallel
            async with httpx.AsyncClient(timeout=120.0) as client:
                day_response, night_response = await asyncio.gather(
                    client.get(f"{CLOUD_BASE_URL}/earth.jpg"),
                    client.get(f"{CLOUD_BASE_URL}/earth-night.jpg")
                )
                day_response.raise_for_status()
                night_response.raise_for_status()
            
            # Atomic writes using temp files
            with tempfile.NamedTemporaryFile(mode='wb', delete=False, suffix='.jpg') as tmp:
                tmp.write(day_response.content)
                tmp.flush()
                tmp.close()
                shutil.move(tmp.name, str(PLANETS_DIR / "earth-clouds.jpg"))
            
            with tempfile.NamedTemporaryFile(mode='wb', delete=False, suffix='.jpg') as tmp:
                tmp.write(night_response.content)
                tmp.flush()
                tmp.close()
                shutil.move(tmp.name, str(PLANETS_DIR / "earth-clouds-night.jpg"))
            
            logger.info("Cloud images downloaded successfully!")

        except Exception as e:
            logger.error(f"Error downloading cloud images: {e}", exc_info=True)
        finally:
            self.generation_in_progress = False
            
    async def force_generate(self):
        """Force immediate cloud generation (for manual triggers)"""
        logger.info("Force generating clouds...")
        await self.generate_clouds()

# Global scheduler instance
scheduler = CloudScheduler()
