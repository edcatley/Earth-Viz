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

    @staticmethod
    async def compare_format_sizes(parameter: str = "UGRD", level: str = "10_m_above_ground", date: str = "current", hour: str = "00") -> dict:
        """
        Download the same data in all three formats and compare file sizes.
        Returns a dict with size comparisons.
        """
        # Handle current date/hour
        if date == "current":
            now = datetime.utcnow()
            from datetime import timedelta
            yesterday = now - timedelta(days=1)
            date_str = yesterday.strftime("%Y%m%d")
            hour_str = "18"
        else:
            date_str = date.replace("/", "").replace("-", "")
            hour_str = hour[:2]
        
        # Build URLs for all three formats
        # 1. GRIB2 (filtered)
        grib2_url = f"https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl"
        grib2_url += f"?dir=%2Fgfs.{date_str}%2F{hour_str}%2Fatmos"
        grib2_url += f"&file=gfs.t{hour_str}z.pgrb2.0p25.f000"
        grib2_url += f"&var_{parameter}=on"
        grib2_url += f"&lev_{level}=on"
        
        # 2. OpenDAP Binary (.dods)
        opendap_binary_url = f"https://nomads.ncep.noaa.gov/dods/gfs_0p25/gfs{date_str}/gfs_0p25_{hour_str}z.dods"
        
        # 3. OpenDAP ASCII (.ascii)
        opendap_ascii_url = f"https://nomads.ncep.noaa.gov/dods/gfs_0p25/gfs{date_str}/gfs_0p25_{hour_str}z.ascii"
        
        logger.info("=" * 80)
        logger.info("COMPARING DATA FORMAT SIZES")
        logger.info(f"Parameter: {parameter}, Level: {level}")
        logger.info(f"Date: {date_str}, Hour: {hour_str}Z")
        logger.info("=" * 80)
        
        results = {}
        timeout = httpx.Timeout(120.0)
        
        # Download GRIB2
        try:
            logger.info(f"\n1. Downloading GRIB2 (filtered)...")
            logger.info(f"   URL: {grib2_url}")
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.get(grib2_url)
                response.raise_for_status()
                grib2_size = len(response.content)
                results['grib2'] = {
                    'size_bytes': grib2_size,
                    'size_mb': round(grib2_size / 1024 / 1024, 2),
                    'url': grib2_url
                }
                logger.info(f"   ✓ Size: {grib2_size:,} bytes ({results['grib2']['size_mb']} MB)")
        except Exception as e:
            logger.error(f"   ✗ Failed: {e}")
            results['grib2'] = {'error': str(e)}
        
        # Download OpenDAP Binary
        # Note: For OpenDAP, we need to specify which variable to download
        # Let's try to get the variable name (simplified mapping)
        var_map = {
            'UGRD': 'ugrd10m',
            'VGRD': 'vgrd10m',
            'TMP': 'tmp2m',
            'PRMSL': 'prmslmsl'
        }
        var_name = var_map.get(parameter, parameter.lower() + '10m')
        
        try:
            logger.info(f"\n2. Downloading OpenDAP Binary (.dods)...")
            # OpenDAP binary requires specific variable selection with dimension constraints
            # Format: variable[time][lat][lon] - get first time step, all lat/lon
            # For surface variables: var[0][0:720][0:1439] (time=0, all lat, all lon)
            binary_var_url = f"https://nomads.ncep.noaa.gov/dods/gfs_0p25/gfs{date_str}/gfs_0p25_{hour_str}z.dods?{var_name}[0][0:720][0:1439]"
            logger.info(f"   URL: {binary_var_url}")
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.get(binary_var_url)
                response.raise_for_status()
                binary_size = len(response.content)
                results['opendap_binary'] = {
                    'size_bytes': binary_size,
                    'size_mb': round(binary_size / 1024 / 1024, 2),
                    'url': binary_var_url
                }
                logger.info(f"   ✓ Size: {binary_size:,} bytes ({results['opendap_binary']['size_mb']} MB)")
        except Exception as e:
            logger.error(f"   ✗ Failed: {e}")
            results['opendap_binary'] = {'error': str(e)}
        
        # Download OpenDAP ASCII
        try:
            logger.info(f"\n3. Downloading OpenDAP ASCII (.ascii)...")
            # OpenDAP ASCII requires specific variable selection with dimension constraints
            # Format: variable[time][lat][lon] - get first time step, all lat/lon
            ascii_var_url = f"https://nomads.ncep.noaa.gov/dods/gfs_0p25/gfs{date_str}/gfs_0p25_{hour_str}z.ascii?{var_name}[0][0:720][0:1439]"
            logger.info(f"   URL: {ascii_var_url}")
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.get(ascii_var_url)
                response.raise_for_status()
                ascii_size = len(response.content)
                results['opendap_ascii'] = {
                    'size_bytes': ascii_size,
                    'size_mb': round(ascii_size / 1024 / 1024, 2),
                    'url': ascii_var_url
                }
                logger.info(f"   ✓ Size: {ascii_size:,} bytes ({results['opendap_ascii']['size_mb']} MB)")
        except Exception as e:
            logger.error(f"   ✗ Failed: {e}")
            results['opendap_ascii'] = {'error': str(e)}
        
        # Print comparison summary
        logger.info("\n" + "=" * 80)
        logger.info("SIZE COMPARISON SUMMARY")
        logger.info("=" * 80)
        
        if 'grib2' in results and 'size_mb' in results['grib2']:
            logger.info(f"GRIB2 (filtered):      {results['grib2']['size_mb']:>8} MB")
        
        if 'opendap_binary' in results and 'size_mb' in results['opendap_binary']:
            logger.info(f"OpenDAP Binary:        {results['opendap_binary']['size_mb']:>8} MB")
            if 'grib2' in results and 'size_mb' in results['grib2']:
                ratio = results['opendap_binary']['size_mb'] / results['grib2']['size_mb']
                logger.info(f"  vs GRIB2:            {ratio:>8.2f}x")
        
        if 'opendap_ascii' in results and 'size_mb' in results['opendap_ascii']:
            logger.info(f"OpenDAP ASCII:         {results['opendap_ascii']['size_mb']:>8} MB")
            if 'grib2' in results and 'size_mb' in results['grib2']:
                ratio = results['opendap_ascii']['size_mb'] / results['grib2']['size_mb']
                logger.info(f"  vs GRIB2:            {ratio:>8.2f}x")
            if 'opendap_binary' in results and 'size_mb' in results['opendap_binary']:
                ratio = results['opendap_ascii']['size_mb'] / results['opendap_binary']['size_mb']
                logger.info(f"  vs Binary:           {ratio:>8.2f}x")
        
        logger.info("=" * 80)
        
        return results