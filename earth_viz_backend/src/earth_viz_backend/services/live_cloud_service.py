import moderngl
import numpy as np
from PIL import Image
import asyncio
import aiohttp
import io
from datetime import datetime
from pathlib import Path

# Static images location
STATIC_IMAGES_DIR = Path.home() / ".earth_viz" / "static_images"

class LiveCloudService:
    """
    A service to generate live cloud imagery on-demand using GPU acceleration.
    """
    def __init__(self, source_width=8192, source_height=4096):
        self.source_width = source_width
        self.source_height = source_height

        # Create a headless OpenGL context
        try:
            self.ctx = moderngl.create_standalone_context(require=430)
            print("Successfully created standalone ModernGL context.")
        except Exception as e:
            print(f"Error creating ModernGL context: {e}")
            print("Please ensure your system has drivers supporting OpenGL 4.3+")
            raise

        # --- Shader Loading ---
        shader_dir = Path(__file__).parent.parent / 'shaders'

        # Basic vertex shader for drawing a full-screen quad
        with open(shader_dir / 'fullscreen.vert', 'r') as f:
            self.vertex_shader = f.read()

        # Cloud composition fragment shader
        with open(shader_dir / 'compose_clouds.glsl', 'r') as f:
            self.compose_clouds_shader = f.read()

        self.compose_prog = self.ctx.program(
            vertex_shader=self.vertex_shader,
            fragment_shader=self.compose_clouds_shader
        )
        print("Successfully compiled cloud composition shader.")

        # Second pass shader for pole mirroring and framing
        with open(shader_dir / 'process_clouds.glsl', 'r') as f:
            self.process_clouds_shader = f.read()

        self.process_prog = self.ctx.program(
            vertex_shader=self.vertex_shader,
            fragment_shader=self.process_clouds_shader
        )
        print("Successfully compiled cloud processing shader.")

        # --- Vertex Array Object for a fullscreen quad ---
        vertices = np.array([
            -1.0, -1.0, 0.0, 0.0,
             1.0, -1.0, 1.0, 0.0,
            -1.0,  1.0, 0.0, 1.0,
             1.0,  1.0, 1.0, 1.0,
        ], dtype='f4')

        self.vbo = self.ctx.buffer(vertices)
        # A single VAO can be used for multiple shader programs if the vertex attributes match
        self.vao = self.ctx.simple_vertex_array(self.compose_prog, self.vbo, 'in_vert', 'in_uv')

        # Create two framebuffers for multi-pass rendering (ping-pong)
        self.fbo1 = self.ctx.framebuffer(
            color_attachments=[self.ctx.texture((self.source_width, self.source_height), 4)]
        )
        self.fbo2 = self.ctx.framebuffer(
            color_attachments=[self.ctx.texture((self.source_width, self.source_height), 4)]
        )
        print(f"Created two framebuffers with size: {self.fbo1.size}")

    def _get_image_sources(self):
        """Defines the URLs and local paths for all source images."""
        month_number = datetime.now().month
        req_height = self.source_height

        return {
            'IR_MAP_LEFT': f'https://view.eumetsat.int/geoserver/ows?service=WMS&request=GetMap&version=1.3.0&layers=mumi:worldcloudmap_ir108&styles=&format=image/png&crs=EPSG:4326&bbox=-90,-180,90,0&width={req_height}&height={req_height}',
            'IR_MAP_RIGHT': f'https://view.eumetsat.int/geoserver/ows?service=WMS&request=GetMap&version=1.3.0&layers=mumi:worldcloudmap_ir108&styles=&format=image/png&crs=EPSG:4326&bbox=-90,0,90,180&width={req_height}&height={req_height}',
            'DUST_MAP_LEFT': f'https://view.eumetsat.int/geoserver/ows?service=WMS&request=GetMap&version=1.3.0&layers=mumi:wideareacoverage_rgb_dust&styles=&format=image/png&crs=EPSG:4326&bbox=-90,-180,90,0&width={req_height}&height={req_height}',
            'DUST_MAP_RIGHT': f'https://view.eumetsat.int/geoserver/ows?service=WMS&request=GetMap&version=1.3.0&layers=mumi:wideareacoverage_rgb_dust&styles=&format=image/png&crs=EPSG:4326&bbox=-90,0,90,180&width={req_height}&height={req_height}',
            'VISIBLE_MAP_LEFT': f'https://view.eumetsat.int/geoserver/ows?service=WMS&request=GetMap&version=1.3.0&layers=mumi:wideareacoverage_rgb_natural&styles=&format=image/png&crs=EPSG:4326&bbox=-90,-180,90,0&width={req_height}&height={req_height}',
            'VISIBLE_MAP_RIGHT': f'https://view.eumetsat.int/geoserver/ows?service=WMS&request=GetMap&version=1.3.0&layers=mumi:wideareacoverage_rgb_natural&styles=&format=image/png&crs=EPSG:4326&bbox=-90,0,90,180&width={req_height}&height={req_height}',
            'FRAME': str(STATIC_IMAGES_DIR / 'frame.png'),
            'EARTH_WITHOUT_CLOUDS': str(STATIC_IMAGES_DIR / 'monthly' / 'earth' / f'{month_number}.jpg'),
            'EARTH_WITHOUT_CLOUDS_NIGHT': str(STATIC_IMAGES_DIR / 'monthly' / 'earth-night' / f'{month_number}.jpg'),
            'SPECULAR_BASE': str(STATIC_IMAGES_DIR / 'monthly' / 'specular-base' / f'{month_number}.jpg'),
        }

    async def _fetch_image(self, session, url):
        """Fetches a single image from a URL."""
        try:
            async with session.get(url) as response:
                response.raise_for_status()
                return await response.read()
        except Exception as e:
            print(f"Error fetching {url}: {e}")
            return None

    async def _read_local_image(self, path):
        """Reads a single image from a local file path."""
        try:
            with open(path, 'rb') as f:
                return f.read()
        except Exception as e:
            print(f"Error reading {path}: {e}")
            return None

    async def _fetch_source_images_async(self):
        """Fetches all source images concurrently."""
        sources = self._get_image_sources()
        tasks = {}
        async with aiohttp.ClientSession() as session:
            for key, path in sources.items():
                if path.startswith('https://'):
                    tasks[key] = asyncio.create_task(self._fetch_image(session, path))
                else:
                    tasks[key] = asyncio.create_task(self._read_local_image(path))
            
            results = await asyncio.gather(*tasks.values())
            
        return {key: result for key, result in zip(tasks.keys(), results)}

    def _load_textures(self, image_data):
        """Loads raw image data into GPU textures."""
        textures = {}
        for key, data in image_data.items():
            if data:
                try:
                    img = Image.open(io.BytesIO(data)).convert('RGBA')
                    textures[key] = self.ctx.texture(img.size, 4, img.tobytes())
                    print(f"Loaded texture: {key} ({img.width}x{img.height})")
                except Exception as e:
                    print(f"Failed to load texture for {key}: {e}")
                    textures[key] = None
        return textures

    async def generate_live_clouds(self):
        """The main method to generate and return the cloud image."""
        print("Fetching source images asynchronously...")
        image_data = await self._fetch_source_images_async()

        for key, data in image_data.items():
            if data is None:
                print(f"Failed to load source image: {key}. Aborting generation.")
                return None
        
        print("All source images fetched successfully.")

        print("Loading images into GPU textures...")
        textures = self._load_textures(image_data)

        if any(tex is None for tex in textures.values()):
            print("One or more textures failed to load. Aborting generation.")
            return None

        # --- Pass 1: Cloud Composition ---
        print("Pass 1: Rendering cloud composition shader...")
        self.fbo1.use()
        self.ctx.clear(0.0, 0.0, 0.0, 1.0)

        textures['IR_MAP_LEFT'].use(location=0)
        textures['IR_MAP_RIGHT'].use(location=1)
        textures['DUST_MAP_LEFT'].use(location=2)
        textures['DUST_MAP_RIGHT'].use(location=3)
        textures['VISIBLE_MAP_LEFT'].use(location=4)
        textures['VISIBLE_MAP_RIGHT'].use(location=5)

        self.compose_prog['u_ir_map_left'].value = 0
        self.compose_prog['u_ir_map_right'].value = 1
        self.compose_prog['u_dust_map_left'].value = 2
        self.compose_prog['u_dust_map_right'].value = 3
        self.compose_prog['u_visible_map_left'].value = 4
        self.compose_prog['u_visible_map_right'].value = 5

        self.vao.render(moderngl.TRIANGLE_STRIP)

        # --- Pass 2: Pole Mirroring and Framing ---
        print("Pass 2: Processing clouds (poles and frame)...")
        self.fbo2.use()
        self.ctx.clear(0.0, 0.0, 0.0, 1.0)

        self.fbo1.color_attachments[0].use(location=0)
        textures['FRAME'].use(location=1)

        self.process_prog['u_cloud_map'].value = 0
        self.process_prog['u_frame'].value = 1

        self.vao.program = self.process_prog
        self.vao.render(moderngl.TRIANGLE_STRIP)

        print("Reading final image from framebuffer...")
        image_bytes = self.fbo2.read(components=4, alignment=1)
        img = Image.frombytes('RGBA', self.fbo2.size, image_bytes, 'raw', 'RGBA')
        img = img.transpose(Image.FLIP_TOP_BOTTOM)

        return img

# Example of how to use the service (for testing)
if __name__ == '__main__':
    from pathlib import Path
    import sys

    project_root = Path(__file__).resolve().parents[3]
    sys.path.insert(0, str(project_root))

    class DummyConfig:
        _base_dir = Path(__file__).resolve().parents[3]
        STATIC_IMAGES_DIR = _base_dir / 'earth_viz_backend' / 'static_images'
        OUTPUT_DIR = _base_dir / 'output'
        TEMP_DIR = _base_dir / 'temp'

    config_loader.init_config(DummyConfig)

    async def main():
        try:
            service = LiveCloudService()
            image = await service.generate_live_clouds()
            if image:
                DummyConfig.OUTPUT_DIR.mkdir(exist_ok=True)
                output_path = DummyConfig.OUTPUT_DIR / "live_clouds_output.png"
                image.save(output_path)
                print(f"Saved generated image to {output_path}")
            print("LiveCloudService finished.")
        except Exception as e:
            print(f"Failed to initialize or run LiveCloudService: {e}")

    asyncio.run(main())