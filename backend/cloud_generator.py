#!/usr/bin/env python3
"""
1:1 Python translation of the original JavaScript cloud generator
"""

import os
import requests
import numpy as np
from PIL import Image, ImageFilter
from datetime import datetime, timezone
import time
import math

print("Generating cloud maps...")

SOURCE_WIDTH = 8192
SOURCE_HEIGHT = SOURCE_WIDTH // 2

OUTPUT_DIR = './out/images'
TEMP_DIR = './tmp'

month_number = datetime.now().month

images_to_load = [
    {
        'type': 'IR_MAP_LEFT',
        'path': f'https://view.eumetsat.int/geoserver/ows?service=WMS&request=GetMap&version=1.3.0&layers=mumi:worldcloudmap_ir108&styles=&format=image/png&crs=EPSG:4326&bbox=-90,-180,90,0&width={SOURCE_HEIGHT}&height={SOURCE_HEIGHT}',
        'loaded': False,
        'image_data': None
    },
    {
        'type': 'IR_MAP_RIGHT',
        'path': f'https://view.eumetsat.int/geoserver/ows?service=WMS&request=GetMap&version=1.3.0&layers=mumi:worldcloudmap_ir108&styles=&format=image/png&crs=EPSG:4326&bbox=-90,0,90,180&width={SOURCE_HEIGHT}&height={SOURCE_HEIGHT}',
        'loaded': False,
        'image_data': None
    },
    {
        'type': 'DUST_MAP_LEFT',
        'path': f'https://view.eumetsat.int/geoserver/ows?service=WMS&request=GetMap&version=1.3.0&layers=mumi:wideareacoverage_rgb_dust&styles=&format=image/png&crs=EPSG:4326&bbox=-90,-180,90,0&width={SOURCE_HEIGHT}&height={SOURCE_HEIGHT}',
        'loaded': False,
        'image_data': None
    },
    {
        'type': 'DUST_MAP_RIGHT',
        'path': f'https://view.eumetsat.int/geoserver/ows?service=WMS&request=GetMap&version=1.3.0&layers=mumi:wideareacoverage_rgb_dust&styles=&format=image/png&crs=EPSG:4326&bbox=-90,0,90,180&width={SOURCE_HEIGHT}&height={SOURCE_HEIGHT}',
        'loaded': False,
        'image_data': None
    },
    {
        'type': 'VISIBLE_MAP_LEFT',
        'path': f'https://view.eumetsat.int/geoserver/ows?service=WMS&request=GetMap&version=1.3.0&layers=mumi:wideareacoverage_rgb_natural&styles=&format=image/png&crs=EPSG:4326&bbox=-90,-180,90,0&width={SOURCE_HEIGHT}&height={SOURCE_HEIGHT}',
        'loaded': False,
        'image_data': None
    },
    {
        'type': 'VISIBLE_MAP_RIGHT',
        'path': f'https://view.eumetsat.int/geoserver/ows?service=WMS&request=GetMap&version=1.3.0&layers=mumi:wideareacoverage_rgb_natural&styles=&format=image/png&crs=EPSG:4326&bbox=-90,0,90,180&width={SOURCE_HEIGHT}&height={SOURCE_HEIGHT}',
        'loaded': False,
        'image_data': None
    },
    {
        'type': 'FRAME',
        'path': 'static_images/frame.png',
        'loaded': False,
        'image_data': None
    },
    {
        'type': 'EARTH_WITHOUT_CLOUDS',
        'path': f'static_images/monthly/earth/{month_number}.jpg',
        'loaded': False,
        'image_data': None
    },
    {
        'type': 'EARTH_WITHOUT_CLOUDS_NIGHT',
        'path': f'static_images/monthly/earth-night/{month_number}.jpg',
        'loaded': False,
        'image_data': None
    },
    {
        'type': 'SPECULAR_BASE',
        'path': f'static_images/monthly/specular-base/{month_number}.jpg',
        'loaded': False,
        'image_data': None
    }
]


def load_image(img):
    """Load an image from URL or local path"""
    print(f"Loading {img['type']} from '{img['path']}'...")
    
    if img['path'].startswith('https://'):
        # Download image from URL
        response = requests.get(img['path'])
        print(f"Downloaded {img['type']} from '{img['path']}'")
        
        # Ensure temp directory exists
        os.makedirs(TEMP_DIR, exist_ok=True)
        
        # Save to temp file
        temp_path = os.path.join(TEMP_DIR, f"{img['type']}.png")
        with open(temp_path, 'wb') as f:
            f.write(response.content)
        
        # Load image
        img['image_data'] = Image.open(temp_path)
    else:
        # Load image from local path
        img['image_data'] = Image.open(img['path'])
    
    img['loaded'] = True
    check_if_all_loaded(img)


def image_data_for_type(image_type):
    """Get image data for a specific type"""
    for img in images_to_load:
        if img['type'] == image_type:
            return img['image_data']
    return None


def check_if_all_loaded(img):
    """Check if all images are loaded and start processing if so"""
    print(f"Finished loading {img['type']} from '{img['path']}'")
    
    # Return if there are any images which haven't loaded
    for image in images_to_load:
        if not image['loaded']:
            return
    
    print('All images loaded')
    process_images()


def interpolate(from_a, to_a, from_b, to_b, input_val):
    """Linear interpolation between two ranges"""
    if input_val < from_a:
        return from_b
    if input_val > to_a:
        return to_b
    
    proportion_of_range = (input_val - from_a) / (to_a - from_a)
    return from_b + (to_b - from_b) * proportion_of_range


def screen(a, b):
    """Screen blend mode: 1 - (1-A) * (1-B)"""
    ax = a / 255.0
    bx = b / 255.0
    return (1 - (1 - ax) * (1 - bx)) * 255


def multiply(a, b):
    """Multiply blend mode: A * B"""
    ax = a / 255.0
    bx = b / 255.0
    return ax * bx * 255


def gamma(gamma_val, input_val):
    """Apply gamma correction"""
    gamma_correction = 1 / gamma_val
    return 255 * pow(input_val / 255, gamma_correction)


def process_images():
    """Main image processing function - 1:1 translation of JavaScript"""
    ir_map_left = image_data_for_type('IR_MAP_LEFT')
    ir_map_right = image_data_for_type('IR_MAP_RIGHT')
    dust_map_left = image_data_for_type('DUST_MAP_LEFT')
    dust_map_right = image_data_for_type('DUST_MAP_RIGHT')
    visible_map_left = image_data_for_type('VISIBLE_MAP_LEFT')
    visible_map_right = image_data_for_type('VISIBLE_MAP_RIGHT')
    frame = image_data_for_type('FRAME')
    earth_without_clouds = image_data_for_type('EARTH_WITHOUT_CLOUDS')
    earth_without_clouds_night = image_data_for_type('EARTH_WITHOUT_CLOUDS_NIGHT')
    specular_base = image_data_for_type('SPECULAR_BASE')

    print('Creating cloud map')

    # When we combine these images, we do them the wrong way round (left on the right, right on the left).
    # This is to make it easier to fix the gap at the antimeridian later on. We'll swap them back later.

    # Combine the left and right IR images
    ir_map = Image.new('RGB', (SOURCE_WIDTH, SOURCE_HEIGHT))
    ir_map.paste(ir_map_right, (0, 0))
    ir_map.paste(ir_map_left, (SOURCE_WIDTH // 2, 0))

    # Combine the left and right dust images
    dust_map = Image.new('RGB', (SOURCE_WIDTH, SOURCE_HEIGHT))
    dust_map.paste(dust_map_right, (0, 0))
    dust_map.paste(dust_map_left, (SOURCE_WIDTH // 2, 0))

    # Combine the left and right visible images
    visible_map = Image.new('RGB', (SOURCE_WIDTH, SOURCE_HEIGHT))
    visible_map.paste(visible_map_right, (0, 0))
    visible_map.paste(visible_map_left, (SOURCE_WIDTH // 2, 0))

    # Create a blank canvas for our cloud map (red background like JavaScript)
    cloud_map = Image.new('RGBA', (SOURCE_WIDTH, SOURCE_HEIGHT), (255, 0, 0, 255))

    # Convert to arrays for pixel manipulation
    ir_array = np.array(ir_map)
    dust_array = np.array(dust_map)
    visible_array = np.array(visible_map)
    cloud_array = np.array(cloud_map)

    gap_start_x = None
    gap_end_x = None
    gap_start_val = None
    gap_end_val = None
    after_gap_counter = 0

    # VECTORIZED cloud processing - much faster!
    print('Processing dust channel...')
    dust_r = dust_array[:, :, 0].astype(np.float32)
    dust_b = 255 - dust_array[:, :, 2].astype(np.float32)
    dust_r_masked = (dust_r / 255.0) * (dust_b / 255.0) * 255
    # Vectorized screen blend
    dust = 255 * (1 - (1 - dust_r_masked/255.0) * (1 - 0.5 * dust_b/255.0))
    
    print('Processing IR channel...')
    ir_raw = ir_array[:, :, 0].astype(np.float32)
    # Vectorized interpolation
    ir = np.where(ir_raw < 72, 0, 
                  np.where(ir_raw > 178, 255, 
                          (ir_raw - 72) / (178 - 72) * 255))
    # Vectorized gamma correction
    ir_gamma_corrected = 255 * np.power(np.clip(ir / 255, 0, 1), 1/1.46)
    
    print('Combining IR and dust...')
    # Vectorized screen blend
    ir_scaled = ir_gamma_corrected * 0.77
    combined = 255 * (1 - (1 - dust/255.0) * (1 - ir_scaled/255.0))
    # Vectorized gamma correction
    output_values = 255 * np.power(np.clip(combined / 255, 0, 1), 1/2.0)
    
    print('Processing visible light...')
    visible_r = visible_array[:, :, 0].astype(np.float32)
    visible_g = visible_array[:, :, 1].astype(np.float32)
    visible_b = visible_array[:, :, 2].astype(np.float32)
    
    visible_max = np.maximum(np.maximum(visible_r, visible_g), visible_b)
    visible_min = np.minimum(np.minimum(visible_r, visible_g), visible_b)
    visible_diff = visible_max - visible_min
    visible_gb_diff = np.abs(visible_g - visible_b)
    
    # Vectorized conditions
    use_visible = (visible_diff < 25) | ((visible_r < visible_g) & (visible_gb_diff < 11) & (visible_g > 150))
    visible_values = 255 * np.power(np.clip(visible_max / 255, 0, 1), 1/1.5)
    
    # Final values: use visible where appropriate, otherwise use IR-based
    final_values = np.where(use_visible, np.maximum(visible_values, output_values), output_values)
    final_values = np.clip(final_values, 0, 255).astype(np.uint8)
    
    # Set all RGB channels to the same value (greyscale)
    cloud_array[:, :, 0] = final_values
    cloud_array[:, :, 1] = final_values
    cloud_array[:, :, 2] = final_values

    # Gap filling - process row by row (can't easily vectorize this part)
    print('Processing antimeridian gap filling...')
    for y in range(SOURCE_HEIGHT // 8, SOURCE_HEIGHT - SOURCE_HEIGHT // 8):
        if y % 500 == 0:  # Progress indicator
            print(f'Gap filling row {y}/{SOURCE_HEIGHT}')
            
        gap_start_x = None
        gap_end_x = None
        gap_start_val = None
        gap_end_val = None
        after_gap_counter = 0
        GAP_BUFFER = 3
        
        for x in range(SOURCE_WIDTH):
            this_pixel_val = cloud_array[y, x, 0]
            
            if this_pixel_val == 255 and gap_start_x is None:
                gap_start_x = x - GAP_BUFFER
                if x >= GAP_BUFFER:
                    gap_start_val = cloud_array[y, x - GAP_BUFFER, 0]
                else:
                    gap_start_val = cloud_array[y, 0, 0]
                    
            elif gap_start_x is not None and this_pixel_val < 255 and after_gap_counter < GAP_BUFFER:
                after_gap_counter += 1
                
            elif this_pixel_val < 255 and gap_start_x is not None and after_gap_counter == GAP_BUFFER:
                gap_end_x = x
                gap_end_val = this_pixel_val

                if gap_end_x > gap_start_x and gap_start_x >= 0 and gap_end_x < SOURCE_WIDTH:
                    # Vectorized gap filling for this row
                    gap_width = gap_end_x - gap_start_x + 1
                    if gap_width > 0:
                        gap_values = np.linspace(gap_start_val, gap_end_val, gap_width)
                        gap_values = np.clip(gap_values, 0, 255).astype(np.uint8)
                        
                        # Ensure we don't go out of bounds
                        start_idx = max(0, gap_start_x)
                        end_idx = min(SOURCE_WIDTH, gap_end_x + 1)
                        actual_width = end_idx - start_idx
                        
                        if actual_width > 0:
                            cloud_array[y, start_idx:end_idx, 0] = gap_values[:actual_width]
                            cloud_array[y, start_idx:end_idx, 1] = gap_values[:actual_width]
                            cloud_array[y, start_idx:end_idx, 2] = gap_values[:actual_width]

                gap_start_x = None
                gap_end_x = None
                gap_start_val = None
                gap_end_val = None
                after_gap_counter = 0

    # Convert back to PIL Image
    cloud_map = Image.fromarray(cloud_array, 'RGBA')

    # Move the left half to the right and right to left (swap halves)
    cloud_map_right = cloud_map.crop((0, 0, SOURCE_WIDTH // 2, SOURCE_HEIGHT))
    cloud_map_left_part = cloud_map.crop((SOURCE_WIDTH // 2, 0, SOURCE_WIDTH, SOURCE_HEIGHT))
    cloud_map.paste(cloud_map_left_part, (0, 0))
    cloud_map.paste(cloud_map_right, (SOURCE_WIDTH // 2, 0))

    # Mirror the poles
    cloud_map_flipped = cloud_map.transpose(Image.FLIP_TOP_BOTTOM)
    height_to_mirror = SOURCE_HEIGHT // 8
    
    # Copy the bottom of the mirrored image to the top
    top_section = cloud_map_flipped.crop((0, SOURCE_HEIGHT - height_to_mirror * 2, SOURCE_WIDTH, SOURCE_HEIGHT - height_to_mirror))
    cloud_map.paste(top_section, (0, 0))
    
    # Copy the top of the mirrored image to the bottom
    bottom_section = cloud_map_flipped.crop((0, height_to_mirror, SOURCE_WIDTH, height_to_mirror * 2))
    cloud_map.paste(bottom_section, (0, SOURCE_HEIGHT - height_to_mirror))

    # Add frame to cover edges
    frame_resized = frame.resize((SOURCE_WIDTH, SOURCE_HEIGHT), Image.LANCZOS)
    cloud_map = Image.alpha_composite(cloud_map.convert('RGBA'), frame_resized.convert('RGBA'))

    # Save the cloud map
    print('Saving cloud map image')
    save_image_resolutions(cloud_map.convert('RGB'), 'clouds', ['jpg'])

    # Create version with alpha channel
    cloud_map_with_alpha = cloud_map.copy()

    # Create blurred version for edge shading - FIXED VERSION
    cloud_map_edges = cloud_map.convert('RGB').filter(ImageFilter.GaussianBlur(radius=3))
    # Apply brightness adjustment - Jimp's .brightness(0.5) BRIGHTENS by 50% (additive)
    cloud_map_edges = Image.eval(cloud_map_edges, lambda x: min(255, int(x + 0.5 * 255)))

    # VECTORIZED alpha processing
    cloud_alpha_array = np.array(cloud_map_with_alpha)
    edges_array = np.array(cloud_map_edges)

    # Copy red channel to alpha (vectorized)
    cloud_alpha_array[:, :, 3] = cloud_alpha_array[:, :, 0]
    
    # Set RGB channels to edge values (vectorized)
    edge_values = edges_array[:, :, 0]
    cloud_alpha_array[:, :, 0] = edge_values
    cloud_alpha_array[:, :, 1] = edge_values
    cloud_alpha_array[:, :, 2] = edge_values

    cloud_map_with_alpha = Image.fromarray(cloud_alpha_array, 'RGBA')

    # Save the cloud map with alpha
    print('Saving cloud map with alpha image')
    save_image_resolutions(cloud_map_with_alpha, 'clouds-alpha', ['png'])

    # Create inverted cloud map for shadows and night image
    inverted_cloud_map = Image.eval(cloud_map_with_alpha, lambda x: 255 - x)
    shadow_map = inverted_cloud_map.filter(ImageFilter.GaussianBlur(radius=3))

    # Save the earth image
    print('Saving earth image')
    earth_resized = earth_without_clouds.resize((SOURCE_WIDTH, SOURCE_HEIGHT), Image.LANCZOS).convert('RGBA')
    
    # Apply shadow with multiply blend and 0.55 opacity - SIMPLIFIED
    shadow_array = np.array(shadow_map).astype(np.float32)
    earth_array = np.array(earth_resized).astype(np.float32)
    
    # VECTORIZED shadow application
    shadow_alpha = shadow_array[:, :, 3] / 255.0
    darkening_factor = (1 - shadow_alpha) * 0.55
    
    # Apply to all RGB channels at once (vectorized)
    earth_array[:, :, :3] = earth_array[:, :, :3] * (1 - darkening_factor)[:, :, np.newaxis]
    
    earth_with_shadows = Image.fromarray(np.clip(earth_array, 0, 255).astype(np.uint8), 'RGBA')
    
    # Composite clouds on top (default blend mode)
    earth_final = Image.alpha_composite(earth_with_shadows, cloud_map_with_alpha)
    
    save_image_resolutions(earth_final.convert('RGB'), 'earth', ['jpg'])

    # Save the night earth image
    print('Saving night earth image')
    # Resize night earth to match cloud map dimensions (like JavaScript)
    night_earth = earth_without_clouds_night.resize((SOURCE_WIDTH, SOURCE_HEIGHT), Image.LANCZOS).convert('RGBA')
    
    # Apply multiply blend using alpha channel (same as specular fix)
    night_array = np.array(night_earth).astype(np.float32)
    inverted_array = np.array(inverted_cloud_map).astype(np.float32)
    
    # VECTORIZED night earth processing
    multiply_factor = inverted_array[:, :, 3] / 255.0
    
    # Apply to all RGB channels at once (vectorized)
    night_array[:, :, :3] = night_array[:, :, :3] * multiply_factor[:, :, np.newaxis]
    
    night_earth_final = Image.fromarray(np.clip(night_array[:, :, :3], 0, 255).astype(np.uint8), 'RGB')
    save_image_resolutions(night_earth_final, 'earth-night', ['jpg'])

    # Save the specular map
    print('Saving specular map image')
    # Resize specular base to match cloud map dimensions (like JavaScript)
    specular_resized = specular_base.resize((SOURCE_WIDTH, SOURCE_HEIGHT), Image.LANCZOS).convert('RGBA')
    
    # Use PIL's built-in multiply composite (matching JavaScript's BLEND_MULTIPLY)
    # Convert inverted_cloud_map to RGBA if it isn't already
    if inverted_cloud_map.mode != 'RGBA':
        inverted_cloud_map = inverted_cloud_map.convert('RGBA')
    
    # Apply multiply blend using PIL's composite method
    specular_final = Image.new('RGBA', (SOURCE_WIDTH, SOURCE_HEIGHT))
    specular_final.paste(specular_resized, (0, 0))
    
    # Manual multiply blend to match Jimp's BLEND_MULTIPLY exactly
    specular_array = np.array(specular_resized).astype(np.float32)
    inverted_array = np.array(inverted_cloud_map).astype(np.float32)
    
    # VECTORIZED specular processing
    multiply_factor = inverted_array[:, :, 3] / 255.0
    
    # Apply to all RGB channels at once (vectorized)
    specular_array[:, :, :3] = specular_array[:, :, :3] * multiply_factor[:, :, np.newaxis]
    
    specular_final = Image.fromarray(np.clip(specular_array[:, :, :3], 0, 255).astype(np.uint8), 'RGB')
    save_image_resolutions(specular_final, 'specular', ['jpg'])


def save_image_resolutions(image, filename, formats):
    """Save image at multiple resolutions - exact JavaScript translation"""
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    for format_ext in formats:
        # JavaScript: for (let i = 0; i < 4; i++)
        for i in range(4):
            scale = 2 ** i
            width = SOURCE_WIDTH // scale
            height = SOURCE_HEIGHT // scale
            
            output_subdir = os.path.join(OUTPUT_DIR, f'{width}x{height}')
            os.makedirs(output_subdir, exist_ok=True)
            
            resized_image = image.resize((width, height), Image.LANCZOS)
            output_path = os.path.join(output_subdir, f'{filename}.{format_ext}')
            
            if format_ext == 'jpg':
                resized_image.save(output_path, 'JPEG', quality=80)
            else:
                resized_image.save(output_path)


# Start loading images
for img in images_to_load:
    load_image(img)

def calculate_solar_position(dt):
    """Calculate sun's subsolar point (latitude, longitude) for given datetime"""
    # More accurate solar position calculation
    
    # Days since J2000.0 epoch (January 1, 2000, 12:00 UTC)
    j2000 = datetime(2000, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    days_since_j2000 = (dt - j2000).total_seconds() / 86400.0
    
    # Solar declination (latitude where sun is directly overhead)
    # This varies from +23.44° to -23.44° throughout the year
    day_of_year = dt.timetuple().tm_yday
    solar_declination = 23.44 * math.sin(math.radians(360 * (284 + day_of_year) / 365.25))
    
    # Solar longitude (where the sun is directly overhead longitude-wise)
    # This is based on the equation of time and hour of day
    
    # Mean solar time
    hours_since_midnight = dt.hour + dt.minute/60.0 + dt.second/3600.0
    
    # Equation of time correction (simplified)
    B = math.radians(360 * (day_of_year - 81) / 365.25)
    equation_of_time = 9.87 * math.sin(2 * B) - 7.53 * math.cos(B) - 1.5 * math.sin(B)
    
    # Solar hour angle (0° at solar noon, 15° per hour)
    solar_time = hours_since_midnight + equation_of_time / 60.0
    hour_angle = 15.0 * (solar_time - 12.0)  # 15° per hour from solar noon
    
    # Solar longitude is opposite to the hour angle
    solar_longitude = -hour_angle
    
    # Normalize to -180 to +180
    while solar_longitude > 180:
        solar_longitude -= 360
    while solar_longitude < -180:
        solar_longitude += 360
    
    return solar_declination, solar_longitude


def create_terminator_mask(width, height, solar_lat, solar_lon):
    """Create a mask where 1.0 = day, 0.0 = night, with smooth transition"""
    print(f'Creating terminator mask for solar position: {solar_lat:.2f}°, {solar_lon:.2f}°')
    
    # Create coordinate grids
    lon_grid = np.linspace(-180, 180, width)
    lat_grid = np.linspace(90, -90, height)
    lon_mesh, lat_mesh = np.meshgrid(lon_grid, lat_grid)
    
    # Calculate solar zenith angle for each pixel
    lat_rad = np.radians(lat_mesh)
    lon_rad = np.radians(lon_mesh)
    solar_lat_rad = np.radians(solar_lat)
    solar_lon_rad = np.radians(solar_lon)
    
    # Spherical trigonometry to find sun angle
    cos_zenith = (np.sin(lat_rad) * np.sin(solar_lat_rad) + 
                  np.cos(lat_rad) * np.cos(solar_lat_rad) * 
                  np.cos(lon_rad - solar_lon_rad))
    
    # Convert to day/night mask with smooth transition
    # cos_zenith > 0 = day, cos_zenith < 0 = night
    # Add smooth transition around terminator (±6 degrees = civil twilight)
    twilight_angle = np.radians(6)  # Civil twilight
    day_mask = np.clip((cos_zenith + np.sin(twilight_angle)) / (2 * np.sin(twilight_angle)), 0, 1)
    
    return day_mask


def create_day_night_blend():
    """Create blended day/night earth image with real-time terminator"""
    print('Creating day/night blend with real-time terminator...')
    
    # Get current time (UTC)
    current_time = datetime.now(timezone.utc)
    print(f'Current UTC time: {current_time.strftime("%Y-%m-%d %H:%M:%S")}')
    
    # Calculate solar position
    solar_lat, solar_lon = calculate_solar_position(current_time)
    print(f'Solar position: {solar_lat:.2f}° latitude, {solar_lon:.2f}° longitude')
    
    # Create terminator mask
    day_mask = create_terminator_mask(SOURCE_WIDTH, SOURCE_HEIGHT, solar_lat, solar_lon)
    
    # Save the mask for debugging
    print('Saving terminator mask for debugging...')
    mask_image = Image.fromarray((day_mask * 255).astype(np.uint8), 'L')  # Grayscale
    save_image_resolutions(mask_image, 'terminator-mask', ['png'])
    
    # Load the day and night earth images we just created
    print('Loading day and night earth images...')
    
    # We need to load from the largest resolution we created
    day_earth_path = None
    night_earth_path = None
    
    # Find the largest resolution directory that exists
    for i in range(1, 4):  # We skip i=0 (8192x4096)
        scale = 2 ** i
        width = SOURCE_WIDTH // scale
        height = SOURCE_HEIGHT // scale
        
        day_path = os.path.join(OUTPUT_DIR, f'{width}x{height}', 'earth.jpg')
        night_path = os.path.join(OUTPUT_DIR, f'{width}x{height}', 'earth-night.jpg')
        
        if os.path.exists(day_path) and os.path.exists(night_path):
            day_earth_path = day_path
            night_earth_path = night_path
            print(f'Using {width}x{height} resolution for blending')
            break
    
    if not day_earth_path or not night_earth_path:
        print('Error: Could not find day/night earth images for blending')
        return
    
    # Load and resize images to match our processing resolution
    day_earth_img = Image.open(day_earth_path).resize((SOURCE_WIDTH, SOURCE_HEIGHT), Image.LANCZOS)
    night_earth_img = Image.open(night_earth_path).resize((SOURCE_WIDTH, SOURCE_HEIGHT), Image.LANCZOS)
    
    day_earth = np.array(day_earth_img).astype(np.float32)
    night_earth = np.array(night_earth_img).astype(np.float32)
    
    print('Blending day and night images...')
    
    # Blend based on terminator mask
    blended = day_earth * day_mask[:, :, np.newaxis] + night_earth * (1 - day_mask[:, :, np.newaxis])
    
    # Create final image
    blended_image = Image.fromarray(np.clip(blended, 0, 255).astype(np.uint8))
    
    # Save the blended result
    print('Saving real-time earth image...')
    save_image_resolutions(blended_image, 'earth-realtime', ['jpg'])
    
    print(f'Day/night blend complete! Solar subsolar point: {solar_lat:.2f}°N, {solar_lon:.2f}°E')


# Create the day/night blend after all other processing is complete
create_day_night_blend()