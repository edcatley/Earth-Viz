"""
Standalone server for earth-viz backend development
Run this for standalone development and testing
"""

import uvicorn
import sys
from pathlib import Path

# Add the src directory to Python path for development
src_path = Path(__file__).parent / "src"
if str(src_path) not in sys.path:
    sys.path.insert(0, str(src_path))

# --- New Config Initialization for Standalone Mode ---
# 1. Import the local config file for standalone mode
import config as standalone_config

# 2. Import the initializer from the package
from earth_viz_backend.config_loader import init_config

# 3. Initialize the package's config with the standalone config
# This MUST be done before any other imports from the package that need config.
init_config(standalone_config)

# 4. Now it's safe to import the app factory
from earth_viz_backend.main import create_app


def main():
    """Main entry point for standalone server"""

    # Since config is now initialized before this, we can't use the uvicorn
    # factory string anymore. We create the app instance directly.
    app = create_app()

    # Run the server with the app instance.
    # Note: Uvicorn's reload can be less reliable with this pattern.
    # If issues arise, consider using an external watcher like `watchfiles`.
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info"
    )

if __name__ == "__main__":
    main()
