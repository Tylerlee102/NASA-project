from pathlib import Path
import csv
import json
import math

import numpy as np
import openpyxl
from PIL import Image, ImageDraw

from make_python_graph_previews import (
    COLORS,
    FONT_LABEL,
    FONT_NOTE,
    FONT_SUBTITLE,
    FONT_TICK,
    FONT_TITLE,
    color_interp,
    draw_line_chart,
    draw_text,
    numeric_array,
    sheet_to_columns,
)


INPUT_XLSX = Path(
    r"C:\Users\tyboy\Downloads\parabolic-motion-radar-model-baseline-and-runs-dashboard-native-excel-charts-fixed (1).xlsx"
)
OUTPUT_DIR = Path(r"C:\Users\tyboy\OneDrive\Documents\Nasa project\outputs\europa_ice_subsurface_simulation")


def delay_us_from_depth_m(depth_m, refractive_index):
    c_m_s = 299_792_458.0
    return 2.0 * refractive_index * depth_m / c_m_s * 1e6


def radar_color(value):
    value = max(0.0, min(1.0, float(value)))
    stops = [
        (0.00, (8, 16, 36)),
        (0.22, (27, 62, 116)),
        (0.48, (40, 133, 151)),
        (0.70, (235, 170, 55)),
        (1.00, (255, 246, 205)),
    ]
    for idx in range(1, len(stops)):
        if value <= stops[idx][0]:
            t0, c0 = stops[idx - 1]
            t1, c1 = stops[idx]
            return color_interp(c0, c1, (value - t0) / (t1 - t0))
    return stops[-1][1]


def add_gaussian_trace(radar, delay_axis, trace_idx, delay_center, amplitude, width_us):
    if not np.isfinite(delay_center) or not np.isfinite(amplitude):
        return
    radar[:, trace_idx] += amplitude * np.exp(-0.5 * ((delay_axis - delay_center) / width_us) ** 2)


def draw_radargram(path, x, delay_axis, radar_power, layer_curves):
    width, height = 1500, 900
    image = Image.new("RGBA", (width, height), COLORS["background"] + (255,))
    draw = ImageDraw.Draw(image)
    draw_text(draw, (54, 34), "Simulated Europa Ice Radargram", FONT_TITLE)
    draw_text(
        draw,
        (54, 78),
        "Fake radar return from mostly ice: shallow ice structure, possible briny/warm-ice lenses, and a deeper ice-ocean reflector.",
        FONT_SUBTITLE,
        COLORS["muted"],
    )

    plot_box = (120, 140, 1285, 770)
    power = np.asarray(radar_power, dtype=float)
    lo = float(np.nanpercentile(power, 4))
    hi = float(np.nanpercentile(power, 99.4))
    normalized = np.clip((power - lo) / (hi - lo), 0, 1)
    rgb = np.zeros((normalized.shape[0], normalized.shape[1], 3), dtype=np.uint8)
    for row in range(normalized.shape[0]):
        for col in range(normalized.shape[1]):
            rgb[row, col, :] = radar_color(normalized[row, col])
    heat = Image.fromarray(rgb, mode="RGB").resize(
        (plot_box[2] - plot_box[0], plot_box[3] - plot_box[1]),
        Image.Resampling.BILINEAR,
    )
    image.paste(heat.convert("RGBA"), plot_box[:2])
    draw = ImageDraw.Draw(image)
    draw.rectangle(plot_box, outline=COLORS["axis"], width=2)

    x_min, x_max = float(np.nanmin(x)), float(np.nanmax(x))
    d_min, d_max = float(delay_axis.min()), float(delay_axis.max())

    def map_x(xv):
        return plot_box[0] + (xv - x_min) / (x_max - x_min) * (plot_box[2] - plot_box[0])

    def map_delay(delay):
        return plot_box[1] + (delay - d_min) / (d_max - d_min) * (plot_box[3] - plot_box[1])

    for xv in np.linspace(x_min, x_max, 7):
        px = map_x(xv)
        draw.line((px, plot_box[1], px, plot_box[3]), fill=(255, 255, 255, 110), width=1)
        label = f"{xv:.0f}"
        draw_text(draw, (px - draw.textlength(label, font=FONT_TICK) / 2, plot_box[3] + 10), label, FONT_TICK, COLORS["muted"])
    for delay in np.linspace(d_min, d_max, 6):
        py = map_delay(delay)
        draw.line((plot_box[0], py, plot_box[2], py), fill=(255, 255, 255, 115), width=1)
        label = f"{delay:.0f}"
        draw_text(draw, (plot_box[0] - draw.textlength(label, font=FONT_TICK) - 10, py - 8), label, FONT_TICK, COLORS["muted"])

    for label, delay_values, color, dashed in layer_curves:
        pts = [(map_x(xv), map_delay(dv)) for xv, dv in zip(x, delay_values) if np.isfinite(dv)]
        if len(pts) < 2:
            continue
        if dashed:
            for start in range(0, len(pts) - 1, 4):
                if start + 2 < len(pts):
                    draw.line(pts[start : start + 2], fill=color, width=3)
        else:
            draw.line(pts, fill=color, width=3)
        draw_text(draw, (pts[min(len(pts) - 1, max(0, int(len(pts) * 0.72)))][0] + 8, pts[min(len(pts) - 1, max(0, int(len(pts) * 0.72)))][1] - 16), label, FONT_NOTE, color)

    draw_text(draw, ((plot_box[0] + plot_box[2]) / 2 - 110, plot_box[3] + 44), "Along-track position x (km)", FONT_LABEL)
    draw_text(draw, (plot_box[0], plot_box[1] - 30), "Two-way delay after surface return (microseconds)", FONT_LABEL)

    colorbar = (1320, plot_box[1], 1360, plot_box[3])
    for i in range(colorbar[3] - colorbar[1]):
        t = 1 - i / (colorbar[3] - colorbar[1] - 1)
        draw.line((colorbar[0], colorbar[1] + i, colorbar[2], colorbar[1] + i), fill=radar_color(t), width=1)
    draw.rectangle(colorbar, outline=COLORS["axis"], width=1)
    draw_text(draw, (colorbar[2] + 10, colorbar[1] - 4), "strong", FONT_TICK, COLORS["muted"])
    draw_text(draw, (colorbar[2] + 10, colorbar[3] - 16), "weak", FONT_TICK, COLORS["muted"])
    draw_text(draw, (54, 848), "Interpretation: brighter bands are stronger simulated reflectors; the deep band is the possible ice-ocean boundary.", FONT_NOTE, COLORS["muted"])
    image.convert("RGB").save(path, quality=95)


def simulate():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    wb = openpyxl.load_workbook(INPUT_XLSX, data_only=True, read_only=True)
    model = {name: numeric_array(values) for name, values in sheet_to_columns(wb["Model_Data"]).items()}
    inputs = wb["Inputs"]

    x = model["x_km"]
    surface_m = model["h_target_m"]
    n_ice = float(inputs["C12"].value)
    target_y_km = float(inputs["C6"].value)

    # Europa-like assumptions. This is still synthetic, but it keeps the material model mostly ice.
    upper_layer_mean_depth_m = 1150.0
    upper_layer_relief_m = 160.0 * np.sin(2 * np.pi * (x + 10) / 42.0) + 60.0 * np.cos(2 * np.pi * x / 23.0)
    upper_ice_layer_depth_m = upper_layer_mean_depth_m + upper_layer_relief_m + 0.04 * (surface_m - np.nanmean(surface_m))

    lens_center_a = -24.0
    lens_center_b = 30.0
    lens_strength = (
        0.95 * np.exp(-0.5 * ((x - lens_center_a) / 10.0) ** 2)
        + 0.70 * np.exp(-0.5 * ((x - lens_center_b) / 8.0) ** 2)
    )
    lens_strength = np.clip(lens_strength, 0.0, 1.0)
    briny_warm_ice_depth_m = 5100.0 + 520.0 * np.sin(2 * np.pi * (x - 6) / 82.0) - 240.0 * lens_strength

    ice_thickness_m = (
        15000.0
        + 760.0 * np.sin(2 * np.pi * (x + 26.0) / 135.0)
        + 330.0 * np.cos(2 * np.pi * (x - 8.0) / 62.0)
        - 0.14 * (surface_m - np.nanmean(surface_m))
    )
    ocean_boundary_m = surface_m - ice_thickness_m
    smooth_kernel = np.ones(17) / 17
    padded_boundary = np.pad(ocean_boundary_m, (8, 8), mode="edge")
    smoothed_ocean_boundary_m = np.convolve(padded_boundary, smooth_kernel, mode="valid")
    basal_roughness_m = ocean_boundary_m - smoothed_ocean_boundary_m

    upper_delay_us = delay_us_from_depth_m(upper_ice_layer_depth_m, n_ice)
    lens_delay_us = delay_us_from_depth_m(briny_warm_ice_depth_m, n_ice)
    ocean_delay_us = delay_us_from_depth_m(ice_thickness_m, n_ice)

    attenuation_db_per_km_one_way = 0.9
    upper_echo_db = -10.0 - 2.0 * attenuation_db_per_km_one_way * (upper_ice_layer_depth_m / 1000.0)
    lens_echo_db = -24.0 + 9.0 * lens_strength - 2.0 * attenuation_db_per_km_one_way * (briny_warm_ice_depth_m / 1000.0)
    ocean_echo_db = -6.0 - 2.0 * attenuation_db_per_km_one_way * (ice_thickness_m / 1000.0) - 0.004 * np.abs(basal_roughness_m)

    delay_axis = np.linspace(0.0, 220.0, 420)
    radar_power = np.zeros((delay_axis.size, x.size), dtype=float)
    rng = np.random.default_rng(20260609)
    for idx in range(x.size):
        add_gaussian_trace(radar_power, delay_axis, idx, upper_delay_us[idx], 10 ** (upper_echo_db[idx] / 20.0), 1.6)
        add_gaussian_trace(
            radar_power,
            delay_axis,
            idx,
            lens_delay_us[idx],
            10 ** (lens_echo_db[idx] / 20.0) * max(lens_strength[idx], 0.08),
            2.8,
        )
        add_gaussian_trace(radar_power, delay_axis, idx, ocean_delay_us[idx], 10 ** (ocean_echo_db[idx] / 20.0), 4.2)
    radar_power += 0.012 * rng.random(radar_power.shape)
    radar_power += 0.008 * np.exp(-delay_axis[:, None] / 75.0) * rng.random(radar_power.shape)

    rows = []
    for idx in range(x.size):
        rows.append(
            {
                "x_km": float(x[idx]),
                "target_y_km": target_y_km,
                "surface_height_m": float(surface_m[idx]),
                "upper_ice_layer_depth_m": float(upper_ice_layer_depth_m[idx]),
                "briny_warm_ice_lens_depth_m": float(briny_warm_ice_depth_m[idx]),
                "briny_warm_ice_lens_strength_0to1": float(lens_strength[idx]),
                "ice_ocean_boundary_depth_m": float(ice_thickness_m[idx]),
                "ice_ocean_boundary_elevation_m": float(ocean_boundary_m[idx]),
                "upper_ice_layer_delay_us": float(upper_delay_us[idx]),
                "briny_warm_ice_lens_delay_us": float(lens_delay_us[idx]),
                "ice_ocean_boundary_delay_us": float(ocean_delay_us[idx]),
                "upper_ice_layer_echo_db": float(upper_echo_db[idx]),
                "briny_warm_ice_lens_echo_db": float(lens_echo_db[idx]),
                "ice_ocean_boundary_echo_db": float(ocean_echo_db[idx]),
            }
        )

    csv_path = OUTPUT_DIR / "europa_ice_subsurface_model.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    assumptions = {
        "model_type": "Synthetic Europa-like icy subsurface truth model plus radar response preview",
        "surface": "Generated topography is treated as icy surface terrain, not rock.",
        "upper_ice_layer_mean_depth_m": upper_layer_mean_depth_m,
        "possible_briny_warm_lens_depth_m": "approximately 4.4 to 5.7 km where lens strength is high",
        "nominal_ice_ocean_boundary_depth_m": 15000.0,
        "ice_refractive_index": n_ice,
        "attenuation_db_per_km_one_way": attenuation_db_per_km_one_way,
        "note": "Synthetic data for model testing; not a real Europa DEM or measured radar product.",
    }
    assumptions_path = OUTPUT_DIR / "europa_ice_subsurface_assumptions.json"
    assumptions_path.write_text(json.dumps(assumptions, indent=2), encoding="utf-8")

    cross_section = Image.new("RGBA", (1500, 920), COLORS["background"] + (255,))
    draw_line_chart(
        cross_section,
        (54, 36, 1440, 865),
        "Europa-Like Icy Subsurface Truth Model",
        "Synthetic hidden structure under the generated icy topography; mostly ice with possible briny/warm-ice anomalies.",
        [
            {"label": "Icy top surface / topography", "x": x, "y": surface_m / 1000.0, "color": COLORS["orange"]},
            {
                "label": "Shallow internal ice layer",
                "x": x,
                "y": (surface_m - upper_ice_layer_depth_m) / 1000.0,
                "color": COLORS["green"],
            },
            {
                "label": "Possible briny/warm-ice lens",
                "x": x,
                "y": (surface_m - briny_warm_ice_depth_m) / 1000.0,
                "color": COLORS["gold"],
            },
            {"label": "Possible ice-ocean boundary", "x": x, "y": ocean_boundary_m / 1000.0, "color": COLORS["purple"]},
        ],
        "Along-track position x (km)",
        "Elevation relative to reference (km)",
        hlines=[{"y": 0, "color": COLORS["axis"], "width": 2, "label": "Reference elevation"}],
    )
    cross_section_path = OUTPUT_DIR / "01_europa_ice_subsurface_truth.png"
    cross_section.convert("RGB").save(cross_section_path, quality=95)

    radargram_path = OUTPUT_DIR / "02_simulated_ice_radargram.png"
    draw_radargram(
        radargram_path,
        x,
        delay_axis,
        radar_power,
        [
            ("shallow ice", upper_delay_us, COLORS["green"], False),
            ("warm/briny lens", np.where(lens_strength > 0.18, lens_delay_us, np.nan), COLORS["gold"], True),
            ("ice-ocean boundary", ocean_delay_us, COLORS["purple"], False),
        ],
    )

    response = Image.new("RGBA", (1500, 1120), COLORS["background"] + (255,))
    draw_line_chart(
        response,
        (54, 28, 1440, 535),
        "Subsurface Layer Two-Way Delay",
        "Delay is measured after the surface return; deeper layers appear later in time.",
        [
            {"label": "Shallow internal ice layer", "x": x, "y": upper_delay_us, "color": COLORS["green"]},
            {"label": "Possible briny/warm-ice lens", "x": x, "y": np.where(lens_strength > 0.18, lens_delay_us, np.nan), "color": COLORS["gold"]},
            {"label": "Possible ice-ocean boundary", "x": x, "y": ocean_delay_us, "color": COLORS["purple"]},
        ],
        "Along-track position x (km)",
        "Two-way delay (microseconds)",
    )
    draw_line_chart(
        response,
        (54, 575, 1440, 1085),
        "Estimated Echo Strength",
        "Deep returns are weakened by two-way travel through ice; stronger material contrast can still make a visible reflector.",
        [
            {"label": "Shallow internal ice layer", "x": x, "y": upper_echo_db, "color": COLORS["green"]},
            {"label": "Possible briny/warm-ice lens", "x": x, "y": np.where(lens_strength > 0.18, lens_echo_db, np.nan), "color": COLORS["gold"]},
            {"label": "Possible ice-ocean boundary", "x": x, "y": ocean_echo_db, "color": COLORS["purple"]},
        ],
        "Along-track position x (km)",
        "Relative echo strength (dB)",
    )
    response_path = OUTPUT_DIR / "03_layer_delays_and_echo_strength.png"
    response.convert("RGB").save(response_path, quality=95)

    print("Generated Europa ice subsurface simulation:")
    for path in [cross_section_path, radargram_path, response_path, csv_path, assumptions_path]:
        print(path)


if __name__ == "__main__":
    simulate()
