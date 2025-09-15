"""
Config Provider for earth-viz backend

This module uses an explicit initialization pattern. The parent application
that imports this package is responsible for calling `init_config` at startup
and providing its own configuration module.
"""

import logging
from types import ModuleType
from typing import Optional

logger = logging.getLogger(__name__)

# This global variable will hold the configuration module provided by the parent app.
_config: Optional[ModuleType] = None

def init_config(app_config: ModuleType):
    """
    Initializes the configuration for the earth_viz_backend package.

    This function must be called by the parent application at startup.

    Args:
        app_config: A loaded configuration module from the parent application.
                    It must contain OUTPUT_DIR, TEMP_DIR, and STATIC_IMAGES_DIR.
    """
    global _config
    logger.info(f"Initializing earth_viz_backend config with module: {app_config.__name__}")
    
    # Validate that the provided config has the necessary attributes
    required_attrs = ['OUTPUT_DIR', 'TEMP_DIR', 'STATIC_IMAGES_DIR']
    for attr in required_attrs:
        if not hasattr(app_config, attr):
            raise AttributeError(
                f"The provided config module '{app_config.__name__}' is missing the required attribute: {attr}"
            )
            
    _config = app_config
    logger.info("earth_viz_backend config initialized successfully.")

def get_config() -> ModuleType:
    """
    Returns the initialized configuration module.

    Raises:
        RuntimeError: If init_config() has not been called yet.
    """
    if _config is None:
        raise RuntimeError(
            "Configuration for earth_viz_backend has not been initialized. "
            "Please call init_config(your_config_module) from your main application at startup."
        )
    return _config

# For convenience, you can access the config properties directly after initialization.
# Any module that needs config can do: from . import config_loader
# and then access config_loader.OUTPUT_DIR

class ConfigProxy:
    def __getattr__(self, name):
        return getattr(get_config(), name)

_proxy = ConfigProxy()

# By assigning to globals(), other modules can import these names directly
# e.g., from .config_loader import OUTPUT_DIR
# This will only work after init_config is called.

# To avoid this complexity, the recommended pattern is for other modules
# to call get_config() to retrieve the full config object when needed.

# Example of how another module would use this:
# from . import config_loader
#
# def my_function():
#     config = config_loader.get_config()
#     image_path = config.STATIC_IMAGES_DIR / 'my_image.png'
#     # ... do something with the path
