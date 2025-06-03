#!/usr/bin/env python3
"""
Setup script for Earth Weather API backend
"""
import subprocess
import sys
import os

def run_command(command, description):
    """Run a command and handle errors."""
    print(f"\n{description}...")
    try:
        result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
        print(f"✓ {description} completed successfully")
        if result.stdout:
            print(result.stdout)
        return True
    except subprocess.CalledProcessError as e:
        print(f"✗ {description} failed")
        print(f"Error: {e.stderr}")
        return False

def main():
    """Main setup function."""
    print("Earth Weather API Backend Setup")
    print("=" * 40)
    
    # Check Python version
    if sys.version_info < (3, 8):
        print("Error: Python 3.8 or higher is required")
        sys.exit(1)
    
    print(f"Python version: {sys.version}")
    
    # Install dependencies
    if not run_command("pip install -r requirements.txt", "Installing dependencies"):
        print("\nSetup failed. Please install dependencies manually:")
        print("pip install -r requirements.txt")
        sys.exit(1)
    
    print("\n" + "=" * 40)
    print("Setup completed successfully!")
    print("\nTo start the server, run:")
    print("python main.py")
    print("\nOr for development with auto-reload:")
    print("uvicorn main:app --reload --host 0.0.0.0 --port 8000")
    print("\nAPI will be available at: http://localhost:8000")
    print("API documentation at: http://localhost:8000/docs")

if __name__ == "__main__":
    main()