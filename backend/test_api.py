#!/usr/bin/env python3
"""
Simple test script for the Weather Data API
"""

import asyncio
import httpx
import json
from datetime import datetime

BASE_URL = "http://localhost:8000"

async def test_health():
    """Test health endpoint"""
    print("Testing health endpoint...")
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{BASE_URL}/health")
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
        print()

async def test_parameters():
    """Test parameters endpoint"""
    print("Testing parameters endpoint...")
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{BASE_URL}/api/v1/parameters")
        print(f"Status: {response.status_code}")
        data = response.json()
        print(f"Available parameters: {len(data['parameters'])}")
        for param in data['parameters'][:3]:  # Show first 3
            print(f"  - {param['code']}: {param['name']} ({param['units']})")
        print()

async def test_levels():
    """Test levels endpoint"""
    print("Testing levels endpoint...")
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{BASE_URL}/api/v1/levels")
        print(f"Status: {response.status_code}")
        data = response.json()
        print(f"Available levels: {len(data['levels'])}")
        for level in data['levels'][:3]:  # Show first 3
            print(f"  - {level['code']}: {level['name']}")
        print()

async def test_weather_data():
    """Test weather data endpoint"""
    print("Testing weather data endpoint...")
    print("Fetching wind U-component at 10m above ground...")
    
    async with httpx.AsyncClient(timeout=120.0) as client:  # 2 minute timeout
        try:
            response = await client.get(
                f"{BASE_URL}/api/v1/data/weather/UGRD",
                params={"level": "10_m_above_ground"}
            )
            print(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                print(f"Source: {data['source']}")
                print(f"Parameter: {data['parameter']}")
                print(f"Level: {data['level']}")
                print(f"Reference time: {data['reference_time']}")
                print(f"Grid: {data['grid']['nx']}x{data['grid']['ny']}")
                print(f"Data points: {len(data['values'])}")
                print(f"Units: {data['units']}")
                print(f"Value range: {min(data['values']):.2f} to {max(data['values']):.2f}")
            else:
                print(f"Error: {response.text}")
                
        except Exception as e:
            print(f"Error: {e}")
        
        print()

async def main():
    """Run all tests"""
    print("Weather Data API Test Suite")
    print("=" * 40)
    print()
    
    await test_health()
    await test_parameters()
    await test_levels()
    await test_weather_data()
    
    print("Test suite completed!")

if __name__ == "__main__":
    asyncio.run(main())