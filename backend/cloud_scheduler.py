"""
Cloud Map Scheduler
Runs the Node.js cloud generation script periodically
"""

import asyncio
import subprocess
import logging
import os
import signal
import sys
import threading
from datetime import datetime, timedelta
from typing import Optional

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
        self.current_process: Optional[subprocess.Popen] = None
        
    async def start(self):
        """Start the scheduler"""
        if self.running:
            logger.warning("Scheduler is already running")
            return
            
        self.running = True
        logger.info(f"Starting cloud scheduler with {self.interval_minutes} minute intervals")
        
        # Run immediately on start
        await self.generate_clouds()
        
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
                
        # Kill any running cloud generation process
        if self.current_process:
            try:
                self.current_process.terminate()
                await asyncio.sleep(5)  # Give it time to terminate gracefully
                if self.current_process.poll() is None:
                    self.current_process.kill()
            except Exception as e:
                logger.error(f"Error stopping cloud generation process: {e}")
                
        logger.info("Cloud scheduler stopped")
        
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
        """Run the cloud generation script"""
        if self.current_process and self.current_process.poll() is None:
            logger.warning("Cloud generation already in progress, skipping this run")
            return
            
        def run_in_thread():
            """Run cloud generation in a separate thread to avoid asyncio issues"""
            try:
                logger.info("Starting cloud generation...")
                start_time = datetime.now()
                
                # Check if Python is available
                try:
                    result = subprocess.run(['python', '--version'], 
                                          capture_output=True, text=True, timeout=10)
                    if result.returncode != 0:
                        logger.error("Python not found. Please ensure Python is in PATH.")
                        return
                    logger.info(f"Python is available: {result.stdout.strip()}")
                    
                except FileNotFoundError:
                    logger.error("Python executable not found in PATH")
                    return
                except subprocess.TimeoutExpired:
                    logger.error("Timeout checking Python version")
                    return
                except Exception as e:
                    logger.error(f"Error checking Python: {e}")
                    return
                
                # Check if cloud_generator.py exists
                if not os.path.exists('cloud_generator.py'):
                    logger.error("cloud_generator.py not found in current directory")
                    return
                    
                logger.info("Running cloud generation script...")
                
                # Run the cloud generation script
                self.current_process = subprocess.Popen(
                    ['python', 'cloud_generator.py'],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    bufsize=1,
                    universal_newlines=True
                )
                
                # Stream output
                for line in iter(self.current_process.stdout.readline, ''):
                    if line:
                        logger.info(f"CloudGen: {line.strip()}")
                
                # Wait for completion
                self.current_process.wait()
                
                duration = datetime.now() - start_time
                
                if self.current_process.returncode == 0:
                    logger.info(f"Cloud generation completed successfully in {duration}")
                else:
                    logger.error(f"Cloud generation failed with return code {self.current_process.returncode}")
                    
            except Exception as e:
                logger.error(f"Error running cloud generation: {e}", exc_info=True)
            finally:
                self.current_process = None
        
        # Run in a separate thread to avoid blocking the event loop
        thread = threading.Thread(target=run_in_thread)
        thread.daemon = True
        thread.start()
            
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