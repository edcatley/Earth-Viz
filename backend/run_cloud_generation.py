#!/usr/bin/env python3
"""
Simple script to run cloud generation and verify output files
"""

import os
import sys
import subprocess
from datetime import datetime

def check_output_files():
    """Check if all expected output files exist"""
    expected_files = [
        "out/images/2048x1024/earth-realtime.jpg",
        "out/images/2048x1024/earth.jpg", 
        "out/images/2048x1024/earth-plain.jpg",
        "out/images/2048x1024/clouds.jpg"
    ]
    
    print("Checking output files...")
    for file_path in expected_files:
        if os.path.exists(file_path):
            stat = os.stat(file_path)
            size = stat.st_size
            modified = datetime.fromtimestamp(stat.st_mtime)
            print(f"  ✓ {file_path} ({size} bytes, modified: {modified})")
        else:
            print(f"  ✗ {file_path} (missing)")
    print()

def main():
    """Run cloud generation and check results"""
    print("Cloud Generation Test")
    print("=" * 40)
    print()
    
    # Check if required directories exist
    if not os.path.exists("static_images"):
        print("Error: static_images directory not found")
        print("Please ensure you have the required static images for cloud generation")
        return
    
    # Run cloud generation
    print("Running cloud generation...")
    try:
        result = subprocess.run([sys.executable, "cloud_generator.py"], 
                              capture_output=True, text=True, timeout=300)
        
        if result.returncode == 0:
            print("Cloud generation completed successfully!")
            print("Output:")
            print(result.stdout)
        else:
            print("Cloud generation failed!")
            print("Error output:")
            print(result.stderr)
            
    except subprocess.TimeoutExpired:
        print("Cloud generation timed out (5 minutes)")
    except Exception as e:
        print(f"Error running cloud generation: {e}")
    
    print()
    
    # Check output files
    check_output_files()

if __name__ == "__main__":
    main()