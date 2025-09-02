"""
GRIB2 data fetching and parsing service
"""

import httpx
import tempfile
import os
import numpy as np
from datetime import datetime
import logging
import asyncio

try:
    import eccodes
    ECCODES_AVAILABLE = True
except ImportError:
    ECCODES_AVAILABLE = False

logger = logging.getLogger(__name__)

class GribService:
    """Service for fetching and parsing GRIB2 data from NOAA NOMADS"""
    
    @staticmethod
    def build_grib_url(parameter: str, level: str, date: str, hour: str, bbox: dict = None) -> str:
        """Build NOMADS GRIB2 URL for a specific parameter"""
        
        # Handle current date/hour
        if date == "current":
            now = datetime.utcnow()
            # Use yesterday's 18Z cycle for reliability
            from datetime import timedelta
            yesterday = now - timedelta(days=1)
            date_str = yesterday.strftime("%Y%m%d")
            hour_str = "18"
        else:
            # Parse provided date/hour
            date_str = date.replace("/", "").replace("-", "")
            hour_str = hour[:2]
        
        # Build NOMADS URL - get global data by default
        url = f"https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl"
        url += f"?dir=%2Fgfs.{date_str}%2F{hour_str}%2Fatmos"
        url += f"&file=gfs.t{hour_str}z.pgrb2.0p25.f000"
        url += f"&var_{parameter}=on"
        url += f"&lev_{level}=on"
        
        # Only add bounding box if specified (otherwise get global data)
        if bbox:
            url += "&subregion="
            url += f"&leftlon={bbox['west']}"
            url += f"&rightlon={bbox['east']}" 
            url += f"&toplat={bbox['north']}"
            url += f"&bottomlat={bbox['south']}"
        
        return url

    @staticmethod
    async def fetch_and_parse_grib(parameter: str, level: str, date: str = "current", hour: str = "00", bbox: dict = None) -> dict:
        """Fetch GRIB2 data and parse to JSON"""
        
        if not ECCODES_AVAILABLE:
            raise RuntimeError("eccodes not available - install with: pip install eccodes")
        
        # Build URL
        url = GribService.build_grib_url(parameter, level, date, hour, bbox)
        logger.info(f"Fetching GRIB2 data: {url}")
        
        # Download GRIB2 data
        timeout = httpx.Timeout(120.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(url)
            response.raise_for_status()
            
            if len(response.content) == 0:
                raise ValueError(f"Empty GRIB2 file received for {parameter} at {level}")
        
        # Parse with eccodes
        with tempfile.NamedTemporaryFile(suffix='.grib2', delete=False) as temp_file:
            temp_file.write(response.content)
            temp_file.flush()
            temp_path = temp_file.name
        
        # Small delay for Windows file locking
        import time
        time.sleep(0.1)
        
        try:
            with open(temp_path, 'rb') as f:
                gid = eccodes.codes_grib_new_from_file(f)
                
                if gid is None:
                    raise ValueError("No GRIB message found - file may not be valid GRIB2 format")
                
                try:
                    # Extract metadata
                    metadata = {
                        'parameter': parameter,
                        'name': eccodes.codes_get(gid, 'name'),
                        'units': eccodes.codes_get(gid, 'units'),
                        'level': eccodes.codes_get(gid, 'level'),
                        'typeOfLevel': eccodes.codes_get(gid, 'typeOfLevel'),
                        'dataDate': eccodes.codes_get(gid, 'dataDate'),
                        'dataTime': eccodes.codes_get(gid, 'dataTime'),
                        'validityDate': eccodes.codes_get(gid, 'validityDate'),
                        'validityTime': eccodes.codes_get(gid, 'validityTime'),
                        'forecastTime': eccodes.codes_get(gid, 'forecastTime')
                    }
                    
                    # Extract grid information
                    grid_info = {
                        'nx': eccodes.codes_get(gid, 'Nx'),
                        'ny': eccodes.codes_get(gid, 'Ny'),
                        'lat_first': eccodes.codes_get(gid, 'latitudeOfFirstGridPointInDegrees'),
                        'lon_first': eccodes.codes_get(gid, 'longitudeOfFirstGridPointInDegrees'),
                        'lat_last': eccodes.codes_get(gid, 'latitudeOfLastGridPointInDegrees'),
                        'lon_last': eccodes.codes_get(gid, 'longitudeOfLastGridPointInDegrees'),
                        'dx': eccodes.codes_get(gid, 'iDirectionIncrementInDegrees'),
                        'dy': eccodes.codes_get(gid, 'jDirectionIncrementInDegrees')
                    }
                    
                    # Extract values
                    values = eccodes.codes_get_values(gid)
                    
                    # Generate lat/lon arrays
                    nx, ny = grid_info['nx'], grid_info['ny']
                    lat_first, lon_first = grid_info['lat_first'], grid_info['lon_first']
                    dx, dy = grid_info['dx'], grid_info['dy']
                    
                    lons = np.array([lon_first + i * dx for i in range(nx)])
                    lats = np.array([lat_first - j * dy for j in range(ny)])  # Note: subtract for latitude
                    
                    # Create meshgrid
                    lon_grid, lat_grid = np.meshgrid(lons, lats)
                    
                    # Convert to lists for JSON serialization
                    result = {
                        'metadata': metadata,
                        'grid': grid_info,
                        'values': values.tolist(),
                        'lats': lat_grid.flatten().tolist(),
                        'lons': lon_grid.flatten().tolist()
                    }
                    
                    return result
                    
                finally:
                    eccodes.codes_release(gid)
            
        finally:
            # Clean up temp file
            try:
                os.unlink(temp_path)
            except (OSError, PermissionError) as e:
                logger.warning(f"Could not delete temp file {temp_path}: {e}")

    @staticmethod
    async def fetch_vector_data(u_parameter: str, v_parameter: str, level: str, date: str = "current", hour: str = "00", bbox: dict = None) -> dict:
        """Fetch U and V component data and combine into vector data"""
        
        # Fetch both components
        u_data, v_data = await asyncio.gather(
            GribService.fetch_and_parse_grib(u_parameter, level, date, hour, bbox),
            GribService.fetch_and_parse_grib(v_parameter, level, date, hour, bbox)
        )
        
        u_values = np.array(u_data['values'])
        v_values = np.array(v_data['values'])
        
        # Calculate magnitude and direction
        magnitude = np.sqrt(u_values**2 + v_values**2)
        direction = np.degrees(np.arctan2(u_values, v_values)) % 360
        
        return {
            'metadata': {
                'u_parameter': u_data['metadata']['parameter'],
                'v_parameter': v_data['metadata']['parameter'],
                'name': f"{u_data['metadata']['name']} Vector",
                'units': u_data['metadata']['units'],
                'level': u_data['metadata']['level'],
                'typeOfLevel': u_data['metadata']['typeOfLevel'],
                'dataDate': u_data['metadata']['dataDate'],
                'dataTime': u_data['metadata']['dataTime'],
                'validityDate': u_data['metadata']['validityDate'],
                'validityTime': u_data['metadata']['validityTime'],
                'forecastTime': u_data['metadata']['forecastTime']
            },
            'grid': u_data['grid'],
            'u_values': u_values.tolist(),
            'v_values': v_values.tolist(),
            'magnitude': magnitude.tolist(),
            'direction': direction.tolist(),
            'lats': u_data['lats'],
            'lons': u_data['lons']
        }