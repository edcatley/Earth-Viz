"""
Earth-Viz Backend Configuration
Shared paths and settings for the earth-viz backend package
"""

from pathlib import Path
import tempfile

# Get the package directory (works both in development and when installed)
PACKAGE_DIR = Path(__file__).parent

# Static images directory (bundled with package)
STATIC_IMAGES_DIR = PACKAGE_DIR / "static_images"

# Output directories (for generated images)
TEMP_BASE_DIR = Path(tempfile.gettempdir()) / "earth_viz"
OUTPUT_DIR = TEMP_BASE_DIR / "images"
TEMP_DIR = TEMP_BASE_DIR / "tmp"

# Ensure temp directories exist
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
TEMP_DIR.mkdir(parents=True, exist_ok=True)
