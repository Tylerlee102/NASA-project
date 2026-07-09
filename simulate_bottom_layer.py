from pathlib import Path
import math

import numpy as np
import openpyxl
from PIL import Image

from make_python_graph_previews import (
    COLORS,
    draw_line_chart,
    numeric_array,
    sheet_to_columns,
)


INPUT_XLSX = Path(
    r"C:\Users\tyboy\Downloads\parabolic-motion-radar-model-baseline-and-runs-dashboard-native-excel-charts-fixed (1).xlsx"
)
OUTPUT_DIR = Path(r"C:\Users\tyboy\OneDrive\Documents\Nasa project\outputs\bottom_layer_simulation")


def spherical_range_km(x_km, y_km, spacecraft_alt_km, reflector_height_km, europa_radius_km):
    theta = np.sqrt(x_km**2 + y_km**2) / europa_radius_km
    return np.sqrt(
        (europa_radius_km + spacecraft_alt_km) ** 2
        + (europa_radius_km + reflector_height_km) ** 2
        - 2
        * (europa_radius_km + spacecraft_alt_km)
        * (europa_radius_km + reflector_height_km)
        * np.cos(theta)
    )


def simulate_bottom_layer():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    wb = openpyxl.load_workbook(INPUT_XLSX, data_only=True, read_only=True)
    model = {name: numeric_array(values) for name, values in sheet_to_columns(wb["Model_Data"]).items()}
    inputs_ws = wb["Inputs"]

    x = model["x_km"]
    z = model["z_km"]
    target_surface_m = model["h_target_m"]
    y_km = float(inputs_ws["C6"].value)
    n_ice = float(inputs_ws["C12"].value)
    europa_radius_km = float(inputs_ws["C52"].value)

    # Hypothesis knobs for the preview. These are intentionally simple and easy to tune.
    nominal_ice_thickness_m = 15000.0
    basal_relief_m = (
        650.0 * np.sin(2 * np.pi * (x + 18.0) / 120.0)
        + 280.0 * np.cos(2 * np.pi * (x - 8.0) / 58.0)
        + 0.12 * (target_surface_m - np.nanmean(target_surface_m))
    )
    bottom_interface_m = target_surface_m - nominal_ice_thickness_m + basal_relief_m
    true_ice_thickness_m = target_surface_m - bottom_interface_m

    surface_range_km = spherical_range_km(x, y_km, z, target_surface_m / 1000.0, europa_radius_km)
    bottom_range_km = spherical_range_km(x, y_km, z, bottom_interface_m / 1000.0, europa_radius_km)
    ice_path_km = bottom_range_km - surface_range_km

    c_m_s = 299_792_458.0
    bottom_two_way_delay_us = 2.0 * n_ice * ice_path_km * 1000.0 / c_m_s * 1e6
    workbook_style_apparent_bottom_m = ice_path_km * 1000.0 / n_ice

    # Simple relative bottom echo estimate: spreading loss plus two-way ice attenuation.
    # This is not a mission-grade radar equation; it is a quick "what shape should I expect?" preview.
    attenuation_db_per_km_one_way = 1.0
    spreading_loss_db = -40.0 * np.log10(bottom_range_km / surface_range_km)
    ice_loss_db = -2.0 * attenuation_db_per_km_one_way * np.maximum(ice_path_km, 0)
    bottom_echo_relative_db = spreading_loss_db + ice_loss_db

    cross_section = Image.new("RGBA", (1400, 820), COLORS["background"] + (255,))
    draw_line_chart(
        cross_section,
        (54, 36, 1348, 785),
        "Simulated Bottom Layer Cross-Section",
        "Hypothesis: deeper, smoother interface below the generated top surface.",
        [
            {
                "label": "Top surface at off-nadir target path",
                "x": x,
                "y": target_surface_m / 1000.0,
                "color": COLORS["orange"],
            },
            {
                "label": "Simulated bottom layer / basal reflector",
                "x": x,
                "y": bottom_interface_m / 1000.0,
                "color": COLORS["purple"],
            },
        ],
        "Along-track position x (km)",
        "Elevation relative to reference (km)",
        hlines=[{"y": 0, "color": COLORS["axis"], "width": 2, "label": "Reference elevation"}],
    )
    cross_section_path = OUTPUT_DIR / "01_bottom_layer_cross_section.png"
    cross_section.convert("RGB").save(cross_section_path, quality=95)

    depth_chart = Image.new("RGBA", (1400, 820), COLORS["background"] + (255,))
    draw_line_chart(
        depth_chart,
        (54, 36, 1348, 785),
        "Bottom Layer Depth Response",
        "Compares true modeled ice thickness with the workbook-style apparent bottom return.",
        [
            {
                "label": "True ice thickness to bottom layer",
                "x": x,
                "y": true_ice_thickness_m,
                "color": COLORS["green"],
            },
            {
                "label": "Workbook-style apparent bottom return",
                "x": x,
                "y": workbook_style_apparent_bottom_m,
                "color": COLORS["purple"],
            },
        ],
        "Along-track position x (km)",
        "Depth / apparent return (m)",
    )
    depth_path = OUTPUT_DIR / "02_bottom_layer_depth_response.png"
    depth_chart.convert("RGB").save(depth_path, quality=95)

    echo_chart = Image.new("RGBA", (1400, 1050), COLORS["background"] + (255,))
    draw_line_chart(
        echo_chart,
        (54, 30, 1348, 505),
        "Bottom Return Two-Way Delay",
        "Delay increases because the signal travels through ice before reflecting from the lower layer.",
        [
            {
                "label": "Bottom layer delay after surface return",
                "x": x,
                "y": bottom_two_way_delay_us,
                "color": COLORS["blue"],
            }
        ],
        "Along-track position x (km)",
        "Two-way delay (microseconds)",
    )
    draw_line_chart(
        echo_chart,
        (54, 535, 1348, 1015),
        "Estimated Bottom Echo Strength",
        "Simple preview using spreading loss plus 1 dB/km one-way ice attenuation.",
        [
            {
                "label": "Bottom echo relative to surface return",
                "x": x,
                "y": bottom_echo_relative_db,
                "color": COLORS["red"],
            }
        ],
        "Along-track position x (km)",
        "Relative echo strength (dB)",
    )
    echo_path = OUTPUT_DIR / "03_bottom_delay_and_echo_strength.png"
    echo_chart.convert("RGB").save(echo_path, quality=95)

    print("Generated bottom-layer simulation graphs:")
    for path in [cross_section_path, depth_path, echo_path]:
        print(path)
    print("Assumptions:")
    print(f"nominal_ice_thickness_m={nominal_ice_thickness_m}")
    print(f"target_y_km={y_km}")
    print(f"n_ice={n_ice}")
    print(f"attenuation_db_per_km_one_way={attenuation_db_per_km_one_way}")


if __name__ == "__main__":
    simulate_bottom_layer()
