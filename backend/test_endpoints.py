#!/usr/bin/env python3
"""
Test script to verify all backend endpoints are working correctly
"""

import asyncio
import httpx
import json
from datetime import datetime

BASE_URL = "http://localhost:8000"

async def test_endpoint(client, endpoint, description):
    """Test a single endpoint"""
    print(f"Testing {description}...")
    try:
        response = await client.get(f"{BASE_URL}{endpoint}")
        print(f"  Status: {response.status_code}")
        
        if response.status_code == 200:
            if endpoint.endswith('/status'):
                # JSON response
                data = response.json()
                print(f"  Response: {json.dumps(data, indent=2)}")
            else:
                # Image response
                content_type = response.headers.get('content-type', 'unknown')
                content_length = len(response.content)
                print(f"  Content-Type: {content_type}")
                print(f"  Content-Length: {content_length} bytes")
        else:
            print(f"  Error: {response.text}")
            
    except Exception as e:
        print(f"  Exception: {e}")
    
    print()

async def main():
    """Test all endpoints"""
    print("Backend API Endpoint Test")
    print("=" * 40)
    print()
    
    timeout = httpx.Timeout(30.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        # Test all endpoints
        await test_endpoint(client, "/health", "Health Check")
        await test_endpoint(client, "/api/v1/live-earth/status", "Status Endpoint")
        await test_endpoint(client, "/api/v1/live-earth", "Live Earth (Realtime)")
        await test_endpoint(client, "/api/v1/earth-clouds", "Earth with Clouds")
        await test_endpoint(client, "/api/v1/earth", "Plain Earth")
        await test_endpoint(client, "/api/v1/live-clouds", "Cloud Map")
        
        # Test GRIB proxy
        print("Testing GRIB proxy (this may take a while)...")
        try:
            response = await client.get(
                f"{BASE_URL}/cgi-bin/filter_gfs_0p25.pl",
                params={
                    "dir": "/gfs.20241201/00/atmos",
                    "file": "gfs.t00z.pgrb2.0p25.f000",
                    "var_UGRD": "on",
                    "lev_10_m_above_ground": "on",
                    "subregion": "",
                    "leftlon": "-10",
                    "rightlon": "10", 
                    "toplat": "10",
                    "bottomlat": "-10"
                }
            )
            print(f"  GRIB Status: {response.status_code}")
            if response.status_code == 200:
                print(f"  GRIB Content-Length: {len(response.content)} bytes")
            else:
                print(f"  GRIB Error: {response.text}")
        except Exception as e:
            print(f"  GRIB Exception: {e}")
    
    print("Test completed!")

if __name__ == "__main__":
    asyncio.run(main())