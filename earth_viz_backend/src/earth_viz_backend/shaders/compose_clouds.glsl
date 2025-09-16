#version 430 core

in vec2 v_uv;
out vec4 f_color;

// Input textures for the two hemispheres
uniform sampler2D u_ir_map_left;
uniform sampler2D u_ir_map_right;
uniform sampler2D u_dust_map_left;
uniform sampler2D u_dust_map_right;
uniform sampler2D u_visible_map_left;
uniform sampler2D u_visible_map_right;

// --- Reusable GLSL utility functions ---

// Screen blend mode: 1 - (1 - a) * (1 - b)
float screen(float a, float b) {
    return 1.0 - (1.0 - a) * (1.0 - b);
}

// Linear interpolation (from GLSL's mix)
float interpolate(float from_a, float to_a, float from_b, float to_b, float input_val) {
    float proportion = clamp((input_val - from_a) / (to_a - from_a), 0.0, 1.0);
    return mix(from_b, to_b, proportion);
}

// Gamma correction
float apply_gamma(float val, float gamma_val) {
    return pow(val, 1.0 / gamma_val);
}

void main() {
    // The original script swaps the hemispheres and then swaps them back.
    // We can handle this directly by sampling from the correct texture based on UV coordinates.
    // v_uv.x from 0.0 to 0.5 is the left side of the final map (which uses the RIGHT source textures).
    // v_uv.x from 0.5 to 1.0 is the right side of the final map (which uses the LEFT source textures).

    vec2 sample_uv = v_uv;
    
    vec4 ir_color;
    vec4 dust_color;
    vec4 visible_color;

    if (v_uv.x < 0.5) {
        // Left side of output map -> sample from RIGHT textures
        sample_uv.x = v_uv.x * 2.0; // Remap 0->0.5 to 0->1
        ir_color = texture(u_ir_map_right, sample_uv);
        dust_color = texture(u_dust_map_right, sample_uv);
        visible_color = texture(u_visible_map_right, sample_uv);
    } else {
        // Right side of output map -> sample from LEFT textures
        sample_uv.x = (v_uv.x - 0.5) * 2.0; // Remap 0.5->1 to 0->1
        ir_color = texture(u_ir_map_left, sample_uv);
        dust_color = texture(u_dust_map_left, sample_uv);
        visible_color = texture(u_visible_map_left, sample_uv);
    }

    // --- GPU-based Antimeridian Gap Filling ---
    // The gap is where the two source images meet, in the middle of our output texture (v_uv.x = 0.5)
    // The original script identified this as a red line (pixel value 255).
    // We check if the IR map pixel is pure red, which indicates the gap.
    const float GAP_WIDTH = 0.01; // Width of the gap to smooth, as a fraction of total width
    if (v_uv.x > 0.5 - GAP_WIDTH && v_uv.x < 0.5 + GAP_WIDTH) {
        if (ir_color.r > 0.99 && ir_color.g < 0.01 && ir_color.b < 0.01) {
            float blend_factor = smoothstep(0.5 - GAP_WIDTH, 0.5 + GAP_WIDTH, v_uv.x);

            // Sample from just outside the gap on both sides
            vec2 left_uv = vec2(0.5 - GAP_WIDTH, v_uv.y);
            vec2 right_uv = vec2(0.5 + GAP_WIDTH, v_uv.y);

            vec4 left_ir_val = texture(u_ir_map_right, vec2(1.0 - (GAP_WIDTH*2.0), left_uv.y));
            vec4 right_ir_val = texture(u_ir_map_left, vec2(GAP_WIDTH*2.0, right_uv.y));

            ir_color = mix(left_ir_val, right_ir_val, blend_factor);
            // Repeat for dust and visible if they also have gaps
            vec4 left_dust_val = texture(u_dust_map_right, vec2(1.0 - (GAP_WIDTH*2.0), left_uv.y));
            vec4 right_dust_val = texture(u_dust_map_left, vec2(GAP_WIDTH*2.0, right_uv.y));
            dust_color = mix(left_dust_val, right_dust_val, blend_factor);

            vec4 left_vis_val = texture(u_visible_map_right, vec2(1.0 - (GAP_WIDTH*2.0), left_uv.y));
            vec4 right_vis_val = texture(u_visible_map_left, vec2(GAP_WIDTH*2.0, right_uv.y));
            visible_color = mix(left_vis_val, right_vis_val, blend_factor);
        }
    }

    // --- Dust Channel Processing ---
    float dust_r = dust_color.r;
    float dust_b_inv = 1.0 - dust_color.b;
    float dust_r_masked = dust_r * dust_b_inv;
    float dust = screen(dust_r_masked, 0.5 * dust_b_inv);

    // --- IR Channel Processing ---
    float ir_raw = ir_color.r;
    float ir = interpolate(72.0/255.0, 178.0/255.0, 0.0, 1.0, ir_raw);
    float ir_gamma = apply_gamma(ir, 1.46);

    // --- Combine IR and Dust ---
    float ir_scaled = ir_gamma * 0.77;
    float combined = screen(dust, ir_scaled);
    float output_values = apply_gamma(combined, 2.0);

    // --- Visible Light Processing ---
    float vis_r = visible_color.r;
    float vis_g = visible_color.g;
    float vis_b = visible_color.b;

    float vis_max = max(vis_r, max(vis_g, vis_b));
    float vis_min = min(vis_r, min(vis_g, vis_b));
    float vis_diff = vis_max - vis_min;
    float vis_gb_diff = abs(vis_g - vis_b);

    bool use_visible = (vis_diff < 25.0/255.0) || ((vis_r < vis_g) && (vis_gb_diff < 11.0/255.0) && (vis_g > 150.0/255.0));
    float visible_values = apply_gamma(vis_max, 1.5);

    // --- Final Combination ---
    float final_val = output_values;
    if (use_visible) {
        final_val = max(visible_values, output_values);
    }

    final_val = clamp(final_val, 0.0, 1.0);

    // Output greyscale cloud map
    f_color = vec4(final_val, final_val, final_val, 1.0);
}
