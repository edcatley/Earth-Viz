#!/usr/bin/env python3
"""
Simple test script to download GRIB2 data and display JSON output
"""

import requests
import tempfile
import os
import json
import numpy as np
from datetime import datetime

try:
    import eccodes
except ImportError as e:
    print(f"Error: eccodes not available: {e}")
    print("Install with: pip install eccodes")
    exit(1)

def download_and_parse(parameter: str, level: str) -> dict:
    """Download GRIB2 data and parse to JSON"""
    
    # Use yesterday's 18Z cycle - guaranteed to be available
    from datetime import timedelta
    yesterday = datetime.utcnow() - timedelta(days=1)
    date_str = yesterday.strftime("%Y%m%d")
    hour_str = "18"  # 18Z is usually the most reliable cycle
    
    # Use the actual NOAA URL to test direct download
    # Build the URL EXACTLY like Grib2Service.ts does
    url = f"https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl"
    url += f"?dir=%2Fgfs.{date_str}%2F{hour_str}%2Fatmos"
    url += f"&file=gfs.t{hour_str}z.pgrb2.0p25.f000"  # Use f000 like TypeScript service
    url += f"&var_{parameter}=on"
    url += f"&lev_{level}=on"
    url += "&subregion="
    url += "&leftlon=-10"
    url += "&rightlon=10" 
    url += "&toplat=10"
    url += "&bottomlat=-10"
    
    print(f"Downloading {parameter} at {level}...")
    print(f"URL: {url}")
    
    # Download
    response = requests.get(url, timeout=60)
    response.raise_for_status()
    
    # Parse with eccodes - ensure file is properly closed before reading
    print(f"Downloaded {len(response.content)} bytes")
    print(f"Response headers: {dict(response.headers)}")
    
    with tempfile.NamedTemporaryFile(suffix='.grib2', delete=False) as temp_file:
        temp_file.write(response.content)
        temp_file.flush()  # Ensure data is written to disk
        temp_path = temp_file.name
    
    # Add a small delay to ensure file is fully closed on Windows
    import time
    time.sleep(0.1)
    
    # Check what we actually downloaded
    file_size = os.path.getsize(temp_path)
    print(f"Temp file size: {file_size} bytes")
    
    # Read first few bytes to see what we got
    with open(temp_path, 'rb') as f:
        first_bytes = f.read(100)
        print(f"First 100 bytes: {first_bytes}")
        print(f"First 100 bytes as text: {first_bytes.decode('utf-8', errors='ignore')}")
    
    try:
        # Open file and process GRIB data
        with open(temp_path, 'rb') as f:
            gid = eccodes.codes_grib_new_from_file(f)
            
            if gid is None:
                raise ValueError("No GRIB message found - file may not be valid GRIB2 format")
            
            try:
                # Extract data
                metadata = {
                    'parameter': parameter,
                    'name': eccodes.codes_get(gid, 'name'),
                    'units': eccodes.codes_get(gid, 'units'),
                    'level': eccodes.codes_get(gid, 'level'),
                    'dataDate': eccodes.codes_get(gid, 'dataDate'),
                    'dataTime': eccodes.codes_get(gid, 'dataTime')
                }
                
                grid_info = {
                    'nx': eccodes.codes_get(gid, 'Nx'),
                    'ny': eccodes.codes_get(gid, 'Ny'),
                    'lat_first': eccodes.codes_get(gid, 'latitudeOfFirstGridPointInDegrees'),
                    'lon_first': eccodes.codes_get(gid, 'longitudeOfFirstGridPointInDegrees'),
                    'dx': eccodes.codes_get(gid, 'iDirectionIncrementInDegrees'),
                    'dy': eccodes.codes_get(gid, 'jDirectionIncrementInDegrees')
                }
                
                values = eccodes.codes_get_values(gid)
                
                result = {
                    'metadata': metadata,
                    'grid': grid_info,
                    'values': values.tolist(),
                    'value_count': len(values),
                    'value_range': [float(np.min(values)), float(np.max(values))]
                }
                
            finally:
                eccodes.codes_release(gid)
        
        return result
        
    finally:
        # Try to delete, but don't fail if we can't
        try:
            os.unlink(temp_path)
        except (OSError, PermissionError) as e:
            print(f"Warning: Could not delete temp file {temp_path}: {e}")

def main():
    """Test temperature data"""
    try:
        result = download_and_parse("TMP", "2_m_above_ground")
        print("\nJSON Output:")
        print(json.dumps(result, indent=2))
        print(f"\nSuccess! Downloaded {result['value_count']} data points")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()