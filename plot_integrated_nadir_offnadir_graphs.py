from __future__ import annotations

import csv
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from parabolic_flyby_common import altitude_profile_km
from plot_clean_question_graphs import COLORS, FONT_LG, FONT_MD, FONT_SM, center_text, chart
from reason_common import C_M_PER_S


OUT = Path("integrated_nadir_offnadir_graphs")


def slant_range_m(along_km: np.ndarray, altitude_km: float, cross_track_km: float) -> np.ndarray:
    altitude_m = np.asarray(altitude_km, dtype=float) * 1000.0
    along_m = along_km * 1000.0
    cross_m = cross_track_km * 1000.0
    return np.sqrt(altitude_m**2 + along_m**2 + cross_m**2)


def apparent_depth_m(along_km: np.ndarray, altitude_km: float, cross_track_km: float, ice_index: float) -> np.ndarray:
    altitude_m = np.asarray(altitude_km, dtype=float) * 1000.0
    return (slant_range_m(along_km, altitude_km, cross_track_km) - altitude_m) / ice_index


def two_way_time_ms(range_m: np.ndarray) -> np.ndarray:
    return 2.0 * range_m / C_M_PER_S * 1000.0


def phase_deg(along_km: np.ndarray, altitude_km: float, cross_track_km: float, baseline_m: float, wavelength_m: float) -> np.ndarray:
    slant = slant_range_m(along_km, altitude_km, cross_track_km)
    sin_cross_look = (cross_track_km * 1000.0) / slant
    return np.degrees((2.0 * math.pi / wavelength_m) * baseline_m * sin_cross_look)


def relative_power_db(along_km: np.ndarray, altitude_km: float, cross_track_km: float) -> np.ndarray:
    altitude_m = np.asarray(altitude_km, dtype=float) * 1000.0
    slant = slant_range_m(along_km, altitude_km, cross_track_km)
    ratio = (altitude_m / slant) ** 4
    return 10.0 * np.log10(np.maximum(ratio, 1.0e-12))


def integrated_radargram(path: Path, along_km: np.ndarray, nadir_depth: np.ndarray, off_depth: np.ndarray) -> None:
    width, height = 1400, 900
    left, right, top, bottom = 215, 85, 105, 135
    plot_left, plot_right = left, width - right
    plot_top, plot_bottom = top, height - bottom
    image = Image.new("RGB", (width, height), (250, 251, 252))
    draw = ImageDraw.Draw(image)
    draw.rectangle([plot_left, plot_top, plot_right, plot_bottom], fill=(255, 255, 255), outline=(84, 94, 108), width=2)

    x_min, x_max = -60.0, 60.0
    y_min, y_max = -100.0, 3200.0

    def px(value: float) -> int:
        return int(plot_left + (value - x_min) / (x_max - x_min) * (plot_right - plot_left))

    def py(value: float) -> int:
        return int(plot_top + (value - y_min) / (y_max - y_min) * (plot_bottom - plot_top))

    for value in np.linspace(x_min, x_max, 7):
        x = px(float(value))
        draw.line([x, plot_top, x, plot_bottom], fill=(224, 229, 236), width=1)
        center_text(draw, (x, plot_bottom + 31), f"{value:.0f}", (55, 65, 81), FONT_SM)

    for value in np.linspace(0, 3200, 5):
        y = py(float(value))
        draw.line([plot_left, y, plot_right, y], fill=(224, 229, 236), width=1)
        draw.text((80, y - 11), f"{value:.0f}", fill=(55, 65, 81), font=FONT_SM)

    nadir_points = [(px(float(x)), py(float(y))) for x, y in zip(along_km, nadir_depth)]
    off_points = [(px(float(x)), py(float(y))) for x, y in zip(along_km, off_depth)]
    draw.line(nadir_points, fill=COLORS[0], width=7)
    draw.line(off_points, fill=COLORS[1], width=7)
    draw.line([px(0.0), plot_top, px(0.0), plot_bottom], fill=(75, 85, 99), width=3)
    draw.text((px(0.0) + 12, plot_bottom - 34), "closest approach", fill=(55, 65, 81), font=FONT_SM)

    draw.text((left, 37), "Simulated radargram: nadir stays flat, off-nadir curves late", fill=(20, 29, 44), font=FONT_LG)
    draw.line([plot_left + 28, plot_top + 38, plot_left + 76, plot_top + 38], fill=COLORS[0], width=6)
    draw.text((plot_left + 92, plot_top + 26), "nadir", fill=(31, 41, 55), font=FONT_SM)
    draw.line([plot_left + 190, plot_top + 38, plot_left + 238, plot_top + 38], fill=COLORS[1], width=6)
    draw.text((plot_left + 254, plot_top + 26), "off-nadir", fill=(31, 41, 55), font=FONT_SM)
    center_text(draw, ((plot_left + plot_right) // 2, height - 58), "Satellite position left-to-right past feature (km)", (31, 41, 55), FONT_MD)

    label_layer = Image.new("RGBA", (700, 70), (0, 0, 0, 0))
    label_draw = ImageDraw.Draw(label_layer)
    label_draw.text((0, 16), "Apparent depth / late echo (m)", fill=(31, 41, 55), font=FONT_MD)
    rotated = label_layer.rotate(270, expand=True)
    image.paste(rotated, (20, (height - rotated.height) // 2), rotated)
    image.save(path)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    closest_altitude_km = 400.0
    altitude_rise_at_edge_km = 4.0
    offnadir_cross_track_km = 25.0
    ice_index = 1.78
    vhf_resolution_m = 30.0
    hf_resolution_m = 300.0
    vhf_wavelength_m = 5.0
    baseline_m = 5.0
    along_km = np.linspace(-60.0, 60.0, 601)
    altitude_km = altitude_profile_km(along_km, closest_altitude_km, altitude_rise_at_edge_km)

    nadir_depth = np.zeros_like(along_km)
    off_depth = apparent_depth_m(along_km, altitude_km, offnadir_cross_track_km, ice_index)

    nadir_range = altitude_km * 1000.0
    off_range = slant_range_m(along_km, altitude_km, offnadir_cross_track_km)
    nadir_time = two_way_time_ms(nadir_range)
    off_time = two_way_time_ms(off_range)
    nadir_time_us = nadir_time * 1000.0
    off_time_us = off_time * 1000.0
    off_extra_delay_us = (off_time - nadir_time) * 1000.0

    chart(
        OUT / "00_parabolic_flyby_path.png",
        along_km,
        {"parabolic spacecraft altitude": altitude_km},
        title="Satellite path used by these graphs: one parabolic flyby",
        x_label="Satellite position left-to-right past feature (km)",
        y_label="Spacecraft altitude (km)",
        xlim=(-60, 60),
        ylim=(399, 405),
        vlines=[(0, "closest approach")],
    )

    chart(
        OUT / "01_apparent_depth_nadir_vs_offnadir.png",
        along_km,
        {"nadir echo": nadir_depth, "off-nadir echo": off_depth},
        title="Nadir vs off-nadir apparent depth as the satellite moves",
        x_label="Satellite position left-to-right past feature (km)",
        y_label="Apparent depth / late echo (m)",
        xlim=(-60, 60),
        ylim=(-100, 3200),
        vlines=[(0, "closest approach")],
    )

    chart(
        OUT / "02_echo_return_time_nadir_vs_offnadir.png",
        along_km,
        {"nadir echo return time": nadir_time_us, "off-nadir echo return time": off_time_us},
        title="Off-nadir echo returns later than nadir echo",
        x_label="Satellite position left-to-right past feature (km)",
        y_label="Two-way echo return time (microseconds)",
        xlim=(-60, 60),
        ylim=(2660, 2710),
        vlines=[(0, "closest approach")],
    )

    chart(
        OUT / "03_extra_delay_nadir_vs_offnadir.png",
        along_km,
        {"nadir extra delay": np.zeros_like(along_km), "off-nadir extra delay": off_extra_delay_us},
        title="Off-nadir path adds extra delay relative to nadir",
        x_label="Satellite position left-to-right past feature (km)",
        y_label="Extra two-way delay (microseconds)",
        xlim=(-60, 60),
        ylim=(-1, 37),
        vlines=[(0, "closest approach")],
    )

    chart(
        OUT / "04_relative_power_nadir_vs_offnadir.png",
        along_km,
        {
            "nadir power reference": np.zeros_like(along_km),
            "off-nadir spreading loss": relative_power_db(along_km, altitude_km, offnadir_cross_track_km),
        },
        title="Off-nadir echo is slightly weaker because the path is longer",
        x_label="Satellite position left-to-right past feature (km)",
        y_label="Relative power (dB)",
        xlim=(-60, 60),
        ylim=(-0.5, 0.1),
        vlines=[(0, "closest approach")],
    )

    chart(
        OUT / "05_vhf_phase_nadir_vs_offnadir.png",
        along_km,
        {
            "nadir/subsurface phase": np.zeros_like(along_km),
            "off-nadir VHF phase": phase_deg(along_km, altitude_km, offnadir_cross_track_km, baseline_m, vhf_wavelength_m),
        },
        title="Interferometry: nadir is near zero, off-nadir has phase",
        x_label="Satellite position left-to-right past feature (km)",
        y_label="VHF interferometric phase (degrees)",
        xlim=(-60, 60),
        ylim=(-1, 25),
        vlines=[(0, "closest approach")],
    )

    chart(
        OUT / "06_vhf_resolution_band_nadir_vs_offnadir.png",
        along_km,
        {
            "nadir VHF +15 m": nadir_depth + vhf_resolution_m / 2.0,
            "nadir VHF -15 m": nadir_depth - vhf_resolution_m / 2.0,
            "off-nadir VHF +15 m": off_depth + vhf_resolution_m / 2.0,
            "off-nadir VHF -15 m": off_depth - vhf_resolution_m / 2.0,
        },
        title="VHF compressed resolution band: nadir flat, off-nadir curved",
        x_label="Satellite position left-to-right past feature (km)",
        y_label="Apparent depth / late echo (m)",
        xlim=(-60, 60),
        ylim=(-100, 3200),
        vlines=[(0, "closest approach")],
    )

    chart(
        OUT / "07_hf_resolution_band_nadir_vs_offnadir.png",
        along_km,
        {
            "nadir HF +150 m": nadir_depth + hf_resolution_m / 2.0,
            "nadir HF -150 m": nadir_depth - hf_resolution_m / 2.0,
            "off-nadir HF +150 m": off_depth + hf_resolution_m / 2.0,
            "off-nadir HF -150 m": off_depth - hf_resolution_m / 2.0,
        },
        title="HF compressed resolution band is thicker than VHF",
        x_label="Satellite position left-to-right past feature (km)",
        y_label="Apparent depth / late echo (m)",
        xlim=(-60, 60),
        ylim=(-250, 3300),
        vlines=[(0, "closest approach")],
    )

    chart(
        OUT / "08_pulse_compression_sidelobes_nadir_vs_offnadir.png",
        along_km,
        {
            "nadir compressed echo": nadir_depth,
            "nadir sidelobe below": nadir_depth + vhf_resolution_m,
            "off-nadir compressed echo": off_depth,
            "off-nadir sidelobe below": off_depth + vhf_resolution_m,
        },
        title="Pulse compression sidelobes follow both nadir and off-nadir echoes",
        x_label="Satellite position left-to-right past feature (km)",
        y_label="Apparent depth / late echo (m)",
        xlim=(-60, 60),
        ylim=(-100, 3200),
        vlines=[(0, "closest approach")],
    )

    integrated_radargram(
        OUT / "09_radargram_style_nadir_vs_offnadir.png",
        along_km,
        nadir_depth,
        off_depth,
    )

    with (OUT / "integrated_nadir_offnadir_data.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "satellite_position_km",
                "nadir_apparent_depth_m",
                "offnadir_apparent_depth_m",
                "nadir_return_time_ms",
                "offnadir_return_time_ms",
                "nadir_return_time_us",
                "offnadir_return_time_us",
                "offnadir_extra_delay_us",
                "offnadir_vhf_phase_deg",
            ],
        )
        writer.writeheader()
        for idx, x in enumerate(along_km):
            writer.writerow(
                {
                    "satellite_position_km": f"{x:.3f}",
                    "nadir_apparent_depth_m": f"{nadir_depth[idx]:.6f}",
                    "offnadir_apparent_depth_m": f"{off_depth[idx]:.6f}",
                    "nadir_return_time_ms": f"{nadir_time[idx]:.9f}",
                    "offnadir_return_time_ms": f"{off_time[idx]:.9f}",
                    "nadir_return_time_us": f"{nadir_time_us[idx]:.6f}",
                    "offnadir_return_time_us": f"{off_time_us[idx]:.6f}",
                    "offnadir_extra_delay_us": f"{off_extra_delay_us[idx]:.6f}",
                    "offnadir_vhf_phase_deg": f"{phase_deg(along_km[idx:idx+1], altitude_km[idx:idx+1], offnadir_cross_track_km, baseline_m, vhf_wavelength_m)[0]:.6f}",
                }
            )

    center_idx = len(along_km) // 2
    summary = {
        "plain_answer": "This set integrates nadir and off-nadir into each graph. Nadir remains flat/near-zero in apparent depth, extra delay, and interferometric phase. Off-nadir curves downward in apparent depth, arrives later, has nonzero VHF phase, and its pulse-compressed resolution band and sidelobes move with the curved echo.",
        "model": {
            "closest_altitude_km": closest_altitude_km,
            "altitude_rise_at_plus_minus_60_km": altitude_rise_at_edge_km,
            "offnadir_cross_track_offset_km": offnadir_cross_track_km,
            "ice_index": ice_index,
            "vhf_resolution_m": vhf_resolution_m,
            "hf_resolution_m": hf_resolution_m,
            "vhf_wavelength_m": vhf_wavelength_m,
            "baseline_m": baseline_m,
        },
        "closest_approach": {
            "offnadir_apparent_depth_m": float(off_depth[center_idx]),
            "offnadir_extra_delay_us": float(off_extra_delay_us[center_idx]),
            "offnadir_vhf_phase_deg": float(phase_deg(np.asarray([0.0]), np.asarray([altitude_km[center_idx]]), offnadir_cross_track_km, baseline_m, vhf_wavelength_m)[0]),
        },
        "graphs": [str(path.resolve()) for path in sorted(OUT.glob("*.png"))],
        "data": str((OUT / "integrated_nadir_offnadir_data.csv").resolve()),
    }
    (OUT / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
