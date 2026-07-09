from __future__ import annotations

import csv
import json
import math
from pathlib import Path

import numpy as np

from parabolic_flyby_common import altitude_profile_km
from plot_clean_question_graphs import chart
from plot_nadir_offnadir_bar_charts import grouped_bar_chart
from reason_common import C_M_PER_S


OUT = Path("corrected_power_sidelobe_graphs")


def slant_range_m(along_km: np.ndarray, altitude_km: float, cross_track_km: float) -> np.ndarray:
    altitude_m = np.asarray(altitude_km, dtype=float) * 1000.0
    along_m = along_km * 1000.0
    cross_m = cross_track_km * 1000.0
    return np.sqrt(altitude_m**2 + along_m**2 + cross_m**2)


def apparent_depth_m(along_km: np.ndarray, altitude_km: float, cross_track_km: float, ice_index: float) -> np.ndarray:
    altitude_m = np.asarray(altitude_km, dtype=float) * 1000.0
    return (slant_range_m(along_km, altitude_km, cross_track_km) - altitude_m) / ice_index


def look_angle_deg(along_km: np.ndarray, altitude_km: float, cross_track_km: float) -> np.ndarray:
    horizontal_km = np.sqrt(along_km**2 + cross_track_km**2)
    return np.degrees(np.arctan2(horizontal_km, np.asarray(altitude_km, dtype=float)))


def spreading_loss_db(along_km: np.ndarray, altitude_km: float, cross_track_km: float) -> np.ndarray:
    altitude_m = np.asarray(altitude_km, dtype=float) * 1000.0
    slant = slant_range_m(along_km, altitude_km, cross_track_km)
    return 10.0 * np.log10((altitude_m / slant) ** 4)


def antenna_two_way_loss_db(angle_deg: np.ndarray, half_power_angle_deg: float) -> np.ndarray:
    # Simple Gaussian beam approximation: -3 dB one-way at the half-power angle,
    # then applied once on transmit and once on receive.
    return -6.0 * (angle_deg / half_power_angle_deg) ** 2


def surface_backscatter_penalty_db(angle_deg: np.ndarray, penalty_db_per_deg2: float) -> np.ndarray:
    # Illustrative smooth-ice/specular penalty. Real values depend on roughness,
    # dielectric properties, wavelength, and local slope.
    return -penalty_db_per_deg2 * angle_deg**2


def total_offnadir_power_db(
    along_km: np.ndarray,
    altitude_km: float,
    cross_track_km: float,
    beam_half_power_angle_deg: float,
    backscatter_penalty_db_per_deg2: float,
) -> dict[str, np.ndarray]:
    angle = look_angle_deg(along_km, altitude_km, cross_track_km)
    spreading = spreading_loss_db(along_km, altitude_km, cross_track_km)
    antenna = antenna_two_way_loss_db(angle, beam_half_power_angle_deg)
    backscatter = surface_backscatter_penalty_db(angle, backscatter_penalty_db_per_deg2)
    return {
        "spreading only": spreading,
        "antenna loss": antenna,
        "surface backscatter loss": backscatter,
        "corrected total": spreading + antenna + backscatter,
    }


def ideal_sinc_power_db(depth_m: np.ndarray, resolution_m: float) -> np.ndarray:
    response = np.sinc(depth_m / resolution_m) ** 2
    return 10.0 * np.log10(np.maximum(response, 1.0e-9))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    closest_altitude_km = 400.0
    altitude_rise_at_edge_km = 4.0
    cross_track_km = 25.0
    ice_index = 1.78
    beam_half_power_angle_deg = 5.0
    backscatter_penalty_db_per_deg2 = 0.6
    vhf_resolution_m = 30.0

    along_line_km = np.linspace(-60.0, 60.0, 601)
    positions_km = np.asarray([0.0, 30.0, 60.0])
    altitude_line_km = altitude_profile_km(along_line_km, closest_altitude_km, altitude_rise_at_edge_km)
    altitude_positions_km = altitude_profile_km(positions_km, closest_altitude_km, altitude_rise_at_edge_km)
    groups = ["closest\n0 km", "30 km\naway", "60 km\naway"]

    line_power = total_offnadir_power_db(
        along_line_km,
        altitude_line_km,
        cross_track_km,
        beam_half_power_angle_deg,
        backscatter_penalty_db_per_deg2,
    )
    pos_power = total_offnadir_power_db(
        positions_km,
        altitude_positions_km,
        cross_track_km,
        beam_half_power_angle_deg,
        backscatter_penalty_db_per_deg2,
    )

    chart(
        OUT / "01_power_model_components_vs_motion.png",
        along_line_km,
        line_power,
        title="Corrected off-nadir power model: geometry plus beam plus surface scattering",
        x_label="Satellite position left-to-right past feature (km)",
        y_label="Relative power vs nadir surface echo (dB)",
        xlim=(-60, 60),
        ylim=(-80, 2),
        vlines=[(0, "closest")],
        hlines=[(-13, "typical first sidelobe")],
    )

    grouped_bar_chart(
        OUT / "02_power_model_components_bar.png",
        groups,
        {
            "spreading only": list(pos_power["spreading only"]),
            "antenna loss": list(pos_power["antenna loss"]),
            "backscatter loss": list(pos_power["surface backscatter loss"]),
            "corrected total": list(pos_power["corrected total"]),
        },
        title="Power losses by source: spreading alone is too optimistic",
        y_label="Power change from nadir reference (dB)",
        note="Antenna and surface terms are illustrative assumptions; geometry is computed directly.",
    )

    apparent_depth = apparent_depth_m(positions_km, altitude_positions_km, cross_track_km, ice_index)
    extra_delay = 2.0 * (slant_range_m(positions_km, altitude_positions_km, cross_track_km) - altitude_positions_km * 1000.0) / C_M_PER_S * 1e6
    angles = look_angle_deg(positions_km, altitude_positions_km, cross_track_km)

    grouped_bar_chart(
        OUT / "03_geometry_still_correct_bar.png",
        groups,
        {
            "apparent depth / 100 m": list(apparent_depth / 100.0),
            "extra delay us": list(extra_delay),
            "look angle deg": list(angles),
        },
        title="Geometry remains the same; power interpretation changes",
        y_label="Scaled value",
        note="Apparent depth is divided by 100 only so it fits beside delay and angle.",
    )

    depth_axis_m = np.linspace(0.0, 900.0, 1801)
    sidelobe_response = ideal_sinc_power_db(depth_axis_m, vhf_resolution_m)
    candidate_depth_m = float(apparent_depth[0])
    candidate_sidelobe_db = float(ideal_sinc_power_db(np.asarray([candidate_depth_m]), vhf_resolution_m)[0])

    chart(
        OUT / "04_range_sidelobe_response_from_nadir_surface.png",
        depth_axis_m,
        {"ideal VHF compressed-pulse sidelobe": sidelobe_response},
        title="Range sidelobes are a separate false-layer source",
        x_label="Apparent depth below strong nadir surface echo (m)",
        y_label="Relative response from nadir surface echo (dB)",
        xlim=(0, 900),
        ylim=(-80, 2),
        vlines=[(candidate_depth_m, "438 m candidate")],
        hlines=[(-13, "first sidelobe level")],
    )

    grouped_bar_chart(
        OUT / "05_false_layer_source_comparison.png",
        ["off-nadir\nclosest", "off-nadir\n30 km", "off-nadir\n60 km", "nadir range\nsidelobe at 438 m"],
        {
            "relative power": [
                float(pos_power["corrected total"][0]),
                float(pos_power["corrected total"][1]),
                float(pos_power["corrected total"][2]),
                candidate_sidelobe_db,
            ]
        },
        title="False-layer sources: off-nadir clutter and nadir range sidelobes",
        y_label="Relative power vs nadir surface echo (dB)",
        note="The sidelobe value is an ideal sinc example; real weighting/windowing changes this level.",
    )

    with (OUT / "corrected_power_values.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "position_label",
                "distance_from_closest_km",
                "parabolic_altitude_km",
                "look_angle_deg",
                "apparent_depth_m",
                "extra_delay_us",
                "spreading_loss_db",
                "antenna_two_way_loss_db",
                "surface_backscatter_loss_db",
                "corrected_total_power_db",
            ],
        )
        writer.writeheader()
        for idx, label in enumerate(groups):
            writer.writerow(
                {
                    "position_label": label.replace("\n", " "),
                    "distance_from_closest_km": f"{positions_km[idx]:.1f}",
                    "parabolic_altitude_km": f"{altitude_positions_km[idx]:.3f}",
                    "look_angle_deg": f"{angles[idx]:.3f}",
                    "apparent_depth_m": f"{apparent_depth[idx]:.3f}",
                    "extra_delay_us": f"{extra_delay[idx]:.3f}",
                    "spreading_loss_db": f"{pos_power['spreading only'][idx]:.6f}",
                    "antenna_two_way_loss_db": f"{pos_power['antenna loss'][idx]:.6f}",
                    "surface_backscatter_loss_db": f"{pos_power['surface backscatter loss'][idx]:.6f}",
                    "corrected_total_power_db": f"{pos_power['corrected total'][idx]:.6f}",
                }
            )

    summary = {
        "correction": "The old power plot only used distance spreading. This version adds an illustrative antenna beam loss and an illustrative surface-backscatter penalty.",
        "geometry": {
            "closest_altitude_km": closest_altitude_km,
            "altitude_rise_at_plus_minus_60_km": altitude_rise_at_edge_km,
            "cross_track_offset_km": cross_track_km,
            "ice_index": ice_index,
            "closest_apparent_depth_m": float(candidate_depth_m),
        },
        "power_model_assumptions": {
            "spreading": "(nadir range / off-nadir slant range)^4",
            "antenna": "Gaussian two-way pattern, -3 dB one-way at 5 degrees, so -6 dB two-way at 5 degrees",
            "surface_backscatter": "-0.6 dB per degree squared, illustrative only",
        },
        "range_sidelobe_model": {
            "vhf_resolution_m": vhf_resolution_m,
            "ideal_sinc_candidate_sidelobe_db": candidate_sidelobe_db,
            "note": "Real sidelobe level depends on chirp weighting/windowing and processing.",
        },
        "graphs": [str(path.resolve()) for path in sorted(OUT.glob("*.png"))],
        "data": str((OUT / "corrected_power_values.csv").resolve()),
    }
    (OUT / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
