"""
Cloud Map Scheduler
Runs the Python cloud generation script periodically
"""

import asyncio
import logging
import os
import signal
import sys
from datetime import datetime, timedelta
from typing import Optional

from .cloud_generator import run_generation

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class CloudScheduler:
    def __init__(self, interval_minutes: int = 30):
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
        """Run the cloud generation function in a non-blocking thread."""
        if self.generation_in_progress:
            logger.warning("Cloud generation already in progress, skipping this run.")
            return

        try:
            self.generation_in_progress = True
            logger.info("Starting cloud generation in a background thread...")
            start_time = datetime.now()

            # Run the synchronous, CPU-bound code in a separate thread to avoid blocking the event loop.
            # asyncio.to_thread is available in Python 3.9+
            await asyncio.to_thread(run_generation)

            duration = datetime.now() - start_time
            logger.info(f"Cloud generation completed successfully in {duration}.")

        except Exception as e:
            logger.error(f"Error during cloud generation: {e}", exc_info=True)
        finally:
            self.generation_in_progress = False
            
    async def force_generate(self):
        """Force immediate cloud generation (for manual triggers)"""
        logger.info("Force generating clouds...")
        await self.generate_clouds()

# Global scheduler instance
scheduler = CloudScheduler()

async def main():
    """Main function for running as standalone script"""
    
    # Handle shutdown signals
    def signal_handler(signum, frame):
        logger.info(f"Received signal {signum}, shutting down...")
        asyncio.create_task(scheduler.stop())
        
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    try:
        await scheduler.start()
        
        # Keep running until stopped
        while scheduler.running:
            await asyncio.sleep(1)
            
    except KeyboardInterrupt:
        logger.info("Keyboard interrupt received")
    finally:
        await scheduler.stop()

if __name__ == "__main__":
    asyncio.run(main())