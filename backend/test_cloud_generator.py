#!/usr/bin/env python3
"""
Test script for the Python cloud generator
"""

import sys
import os

# Add the current directory to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    print("Testing Python cloud generator...")
    import cloud_generator
    print("Cloud generator completed successfully!")
except ImportError as e:
    print(f"Import error: {e}")
    print("Make sure you have installed the required packages:")
    print("pip install Pillow requests numpy")
except Exception as e:
    print(f"Error running cloud generator: {e}")
    import traceback
    traceback.print_exc()