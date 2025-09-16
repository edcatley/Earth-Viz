#version 430 core

in vec2 v_uv;
out vec4 f_color;

uniform sampler2D u_cloud_map; // Input from the first pass
uniform sampler2D u_frame;

const float POLE_MIRROR_HEIGHT = 1.0 / 8.0; // Mirror top and bottom 1/8th of the image

void main() {
    vec2 sample_uv = v_uv;

    // --- Pole Mirroring ---
    // If the pixel is in the top mirror region, sample from the flipped bottom region
    if (v_uv.y > (1.0 - POLE_MIRROR_HEIGHT)) {
        // v_uv.y from 0.875 -> 1.0
        // Remap to sample from 0.125 -> 0.25 (flipped)
        float y_remap = 1.0 - (v_uv.y - (1.0 - POLE_MIRROR_HEIGHT));
        sample_uv.y = POLE_MIRROR_HEIGHT + (y_remap - POLE_MIRROR_HEIGHT);
    }
    // If the pixel is in the bottom mirror region, sample from the flipped top region
    else if (v_uv.y < POLE_MIRROR_HEIGHT) {
        // v_uv.y from 0.0 -> 0.125
        // Remap to sample from 0.875 -> 0.75 (flipped)
        float y_remap = 1.0 - v_uv.y;
        sample_uv.y = (1.0 - POLE_MIRROR_HEIGHT) - (y_remap - (1.0 - POLE_MIRROR_HEIGHT));
    }

    vec4 cloud_color = texture(u_cloud_map, sample_uv);
    vec4 frame_color = texture(u_frame, v_uv);

    // --- Alpha Composite Frame ---
    // Equivalent to Image.alpha_composite in Pillow
    f_color = mix(cloud_color, frame_color, frame_color.a);
}
