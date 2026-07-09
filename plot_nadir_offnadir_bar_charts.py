from __future__ import annotations

import csv
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from parabolic_flyby_common import altitude_profile_km
from plot_clean_question_graphs import COLORS, FONT_LG, FONT_MD, FONT_SM, center_text, fmt_tick
from reason_common import C_M_PER_S


OUT = Path("nadir_offnadir_bar_charts")


def slant_range_m(along_km: np.ndarray, altitude_km: float, cross_track_km: float) -> np.ndarray:
    altitude_m = np.asarray(altitude_km, dtype=float) * 1000.0
    along_m = along_km * 1000.0
    cross_m = cross_track_km * 1000.0
    return np.sqrt(altitude_m**2 + along_m**2 + cross_m**2)


def apparent_depth_m(along_km: np.ndarray, altitude_km: float, cross_track_km: float, ice_index: float) -> np.ndarray:
    altitude_m = np.asarray(altitude_km, dtype=float) * 1000.0
    return (slant_range_m(along_km, altitude_km, cross_track_km) - altitude_m) / ice_index


def extra_delay_us(along_km: np.ndarray, altitude_km: float, cross_track_km: float) -> np.ndarray:
    altitude_m = np.asarray(altitude_km, dtype=float) * 1000.0
    return 2.0 * (slant_range_m(along_km, altitude_km, cross_track_km) - altitude_m) / C_M_PER_S * 1.0e6


def relative_power_db(along_km: np.ndarray, altitude_km: float, cross_track_km: float) -> np.ndarray:
    altitude_m = np.asarray(altitude_km, dtype=float) * 1000.0
    slant = slant_range_m(along_km, altitude_km, cross_track_km)
    return 10.0 * np.log10((altitude_m / slant) ** 4)


def phase_deg(along_km: np.ndarray, altitude_km: float, cross_track_km: float, baseline_m: float, wavelength_m: float) -> np.ndarray:
    slant = slant_range_m(along_km, altitude_km, cross_track_km)
    sin_cross_look = (cross_track_km * 1000.0) / slant
    return np.degrees((2.0 * math.pi / wavelength_m) * baseline_m * sin_cross_look)


def look_angle_deg(along_km: np.ndarray, altitude_km: float, cross_track_km: float) -> np.ndarray:
    horizontal_km = np.sqrt(along_km**2 + cross_track_km**2)
    return np.degrees(np.arctan2(horizontal_km, np.asarray(altitude_km, dtype=float)))


def grouped_bar_chart(
    path: Path,
    groups: list[str],
    series: dict[str, list[float]],
    *,
    title: str,
    y_label: str,
    y_min: float | None = None,
    y_max: float | None = None,
    note: str | None = None,
) -> None:
    width, height = 1400, 900
    left, right, top, bottom = 210, 95, 115, 155
    plot_left, plot_right = left, width - right
    plot_top, plot_bottom = top, height - bottom

    values = np.asarray([value for vals in series.values() for value in vals], dtype=float)
    raw_min = float(np.nanmin(values))
    raw_max = float(np.nanmax(values))
    if y_min is None:
        y_min = min(0.0, raw_min)
    if y_max is None:
        y_max = max(0.0, raw_max)
    if math.isclose(y_min, y_max):
        y_min -= 1.0
        y_max += 1.0
    pad = 0.08 * (y_max - y_min)
    if raw_min < 0:
        y_min -= pad
    else:
        y_min = 0.0
    if raw_max > 0:
        y_max += pad
    else:
        y_max = 0.0

    image = Image.new("RGB", (width, height), (250, 251, 252))
    draw = ImageDraw.Draw(image)
    draw.rectangle([plot_left, plot_top, plot_right, plot_bottom], fill=(255, 255, 255), outline=(84, 94, 108), width=2)

    def py(value: float) -> int:
        return int(plot_bottom - (value - y_min) / (y_max - y_min) * (plot_bottom - plot_top))

    for value in np.linspace(y_min, y_max, 6):
        ypix = py(float(value))
        draw.line([plot_left, ypix, plot_right, ypix], fill=(224, 229, 236), width=1)
        draw.line([plot_left - 8, ypix, plot_left, ypix], fill=(55, 65, 81), width=2)
        draw.text((78, ypix - 11), fmt_tick(float(value)), fill=(55, 65, 81), font=FONT_SM)

    if y_min < 0 < y_max:
        ypix = py(0.0)
        draw.line([plot_left, ypix, plot_right, ypix], fill=(75, 85, 99), width=3)

    group_count = len(groups)
    series_names = list(series)
    series_count = len(series_names)
    group_width = (plot_right - plot_left) / group_count
    bar_width = min(72, group_width / (series_count + 1.7))
    zero_y = py(0.0)

    for group_idx, group in enumerate(groups):
        center_x = plot_left + group_width * (group_idx + 0.5)
        center_text(draw, (int(center_x), plot_bottom + 36), group, (55, 65, 81), FONT_SM)
        for series_idx, name in enumerate(series_names):
            value = float(series[name][group_idx])
            color = COLORS[series_idx % len(COLORS)]
            offset = (series_idx - (series_count - 1) / 2.0) * (bar_width + 12)
            x0 = int(center_x + offset - bar_width / 2.0)
            x1 = int(center_x + offset + bar_width / 2.0)
            y_value = py(value)
            top_y = min(y_value, zero_y)
            bottom_y = max(y_value, zero_y)
            draw.rectangle([x0, top_y, x1, bottom_y], fill=color, outline=color)
            label = fmt_tick(value)
            label_box = draw.textbbox((0, 0), label, font=FONT_SM)
            label_x = int((x0 + x1 - (label_box[2] - label_box[0])) / 2)
            if value >= 0:
                label_y = top_y - 27
            else:
                label_y = bottom_y + 7
            draw.text((label_x, label_y), label, fill=(31, 41, 55), font=FONT_SM)

    for idx, name in enumerate(series_names):
        lx = plot_left + 28 + idx * 255
        ly = plot_top + 25
        color = COLORS[idx % len(COLORS)]
        draw.rectangle([lx, ly + 5, lx + 32, ly + 25], fill=color)
        draw.text((lx + 44, ly), name, fill=(31, 41, 55), font=FONT_SM)

    draw.text((left, 38), title, fill=(20, 29, 44), font=FONT_LG)
    if note:
        draw.text((plot_left, height - 58), note, fill=(75, 85, 99), font=FONT_SM)

    label_layer = Image.new("RGBA", (700, 70), (0, 0, 0, 0))
    label_draw = ImageDraw.Draw(label_layer)
    label_draw.text((0, 16), y_label, fill=(31, 41, 55), font=FONT_MD)
    rotated = label_layer.rotate(270, expand=True)
    image.paste(rotated, (18, (height - rotated.height) // 2), rotated)
    image.save(path)


def simple_bar_chart(path: Path, labels: list[str], values: list[float], *, title: str, y_label: str, note: str) -> None:
    grouped_bar_chart(path, labels, {"value": values}, title=title, y_label=y_label, note=note)


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

    along_km = np.asarray([0.0, 30.0, 60.0])
    altitude_km = altitude_profile_km(along_km, closest_altitude_km, altitude_rise_at_edge_km)
    groups = ["closest\n0 km", "30 km\naway", "60 km\naway"]

    nadir_zero = [0.0, 0.0, 0.0]
    off_depth = apparent_depth_m(along_km, altitude_km, offnadir_cross_track_km, ice_index)
    off_delay = extra_delay_us(along_km, altitude_km, offnadir_cross_track_km)
    off_power = relative_power_db(along_km, altitude_km, offnadir_cross_track_km)
    off_phase = phase_deg(along_km, altitude_km, offnadir_cross_track_km, baseline_m, vhf_wavelength_m)
    nadir_angle = [0.0, 0.0, 0.0]
    off_angle = look_angle_deg(along_km, altitude_km, offnadir_cross_track_km)

    simple_bar_chart(
        OUT / "00_geometry_why_25km_vs_400km.png",
        ["spacecraft\naltitude", "side offset\nfrom nadir"],
        [closest_altitude_km, offnadir_cross_track_km],
        title="Why 25 km and 400 km are both in the model",
        y_label="Distance (km)",
        note="400 km is vertical altitude. 25 km is horizontal side offset. Together they form the off-nadir slant path.",
    )

    grouped_bar_chart(
        OUT / "01_apparent_depth_bar_comparison.png",
        groups,
        {"nadir": nadir_zero, "off-nadir": list(off_depth)},
        title="Apparent depth: off-nadir makes a surface echo look buried",
        y_label="Apparent depth (m)",
        note="The off-nadir echo appears deeper as the spacecraft moves farther from closest approach.",
    )

    grouped_bar_chart(
        OUT / "02_extra_delay_bar_comparison.png",
        groups,
        {"nadir": nadir_zero, "off-nadir": list(off_delay)},
        title="Extra delay: off-nadir returns later than nadir",
        y_label="Extra two-way delay (microseconds)",
        note="This is the clearest bar-chart version of the return-time difference.",
    )

    grouped_bar_chart(
        OUT / "03_look_angle_bar_comparison.png",
        groups,
        {"nadir": nadir_angle, "off-nadir": list(off_angle)},
        title="Look angle: moving away from closest approach increases off-nadir angle",
        y_label="Angle from straight down (degrees)",
        note="Nadir stays at 0 degrees; off-nadir grows as total horizontal distance grows.",
    )

    grouped_bar_chart(
        OUT / "04_power_loss_bar_comparison.png",
        groups,
        {"nadir": nadir_zero, "off-nadir": list(off_power)},
        title="Power: off-nadir is weaker because the path is longer",
        y_label="Relative power change (dB)",
        note="Negative dB means weaker than the nadir reference.",
    )

    grouped_bar_chart(
        OUT / "05_vhf_phase_bar_comparison.png",
        groups,
        {"nadir": nadir_zero, "off-nadir": list(off_phase)},
        title="VHF phase: off-nadir gives interferometry a side-looking signal",
        y_label="VHF phase (degrees)",
        note="Phase separates side echoes from straight-down echoes.",
    )

    grouped_bar_chart(
        OUT / "06_resolution_bar_comparison.png",
        ["VHF", "HF"],
        {
            "nadir band": [vhf_resolution_m, hf_resolution_m],
            "off-nadir band": [vhf_resolution_m, hf_resolution_m],
        },
        title="Resolution thickness: VHF is sharper, HF is thicker",
        y_label="Compressed range resolution in ice (m)",
        note="Resolution comes from the radar bandwidth, so it is the same thickness for nadir and off-nadir.",
    )

    grouped_bar_chart(
        OUT / "07_pulse_compression_sidelobe_bar_comparison.png",
        ["nadir\ncenter", "nadir\nsidelobe", "off-nadir\ncenter", "off-nadir\nsidelobe"],
        {
            "apparent depth": [
                0.0,
                vhf_resolution_m,
                float(off_depth[0]),
                float(off_depth[0] + vhf_resolution_m),
            ]
        },
        title="Pulse compression: sidelobes sit beside whichever echo created them",
        y_label="Apparent depth at closest approach (m)",
        note="This uses the VHF 30 m resolution to show the sidelobe offset from each main echo.",
    )

    with (OUT / "bar_chart_values.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "position_label",
                "satellite_distance_from_closest_km",
                "parabolic_altitude_km",
                "nadir_apparent_depth_m",
                "offnadir_apparent_depth_m",
                "offnadir_extra_delay_us",
                "offnadir_look_angle_deg",
                "offnadir_power_loss_db",
                "offnadir_vhf_phase_deg",
            ],
        )
        writer.writeheader()
        for idx, label in enumerate(groups):
            writer.writerow(
                {
                    "position_label": label.replace("\n", " "),
                    "satellite_distance_from_closest_km": f"{along_km[idx]:.1f}",
                    "parabolic_altitude_km": f"{altitude_km[idx]:.3f}",
                    "nadir_apparent_depth_m": "0.000",
                    "offnadir_apparent_depth_m": f"{off_depth[idx]:.3f}",
                    "offnadir_extra_delay_us": f"{off_delay[idx]:.3f}",
                    "offnadir_look_angle_deg": f"{off_angle[idx]:.3f}",
                    "offnadir_power_loss_db": f"{off_power[idx]:.6f}",
                    "offnadir_vhf_phase_deg": f"{off_phase[idx]:.3f}",
                }
            )

    summary = {
        "why_25_km": "25 km was chosen as the cross-track offset because, at the 400 km closest-approach altitude and ice index 1.78, it creates about 438 m apparent depth, matching the 440 m candidate-depth idea.",
        "why_400_km": "400 km is the closest-approach altitude; the updated graphs sample a parabolic flyby altitude at each satellite position.",
        "important_distinction": "25 km is horizontal side offset; altitude is vertical and changes slightly along the parabola.",
        "parabolic_flyby": {
            "closest_altitude_km": closest_altitude_km,
            "altitude_rise_at_plus_minus_60_km": altitude_rise_at_edge_km,
        },
        "closest_approach": {
            "offnadir_apparent_depth_m": float(off_depth[0]),
            "offnadir_extra_delay_us": float(off_delay[0]),
            "offnadir_look_angle_deg": float(off_angle[0]),
            "offnadir_power_loss_db": float(off_power[0]),
            "offnadir_vhf_phase_deg": float(off_phase[0]),
        },
        "graphs": [str(path.resolve()) for path in sorted(OUT.glob("*.png"))],
        "data": str((OUT / "bar_chart_values.csv").resolve()),
    }
    (OUT / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
