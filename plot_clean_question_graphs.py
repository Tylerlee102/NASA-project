from __future__ import annotations

import csv
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from interferometry import _simulate_channels
from reason_common import (
    C_M_PER_S,
    apparent_depth_from_offset,
    axes_from_config,
    altitude_m as config_altitude_m,
    cfg_get,
    candidate_window,
    load_config,
    n_ice,
    read_array,
    required_offset_for_depth,
    wavelength_m,
)


OUT = Path("question_graphs_clean")


def get_font(size: int) -> ImageFont.ImageFont:
    for candidate in (
        "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/calibri.ttf",
    ):
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size=size)
    return ImageFont.load_default()


FONT_SM = get_font(18)
FONT_MD = get_font(24)
FONT_LG = get_font(32)


COLORS = [
    (28, 88, 165),
    (200, 84, 56),
    (46, 125, 83),
    (126, 87, 194),
    (214, 144, 36),
]


def center_text(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, fill: tuple[int, int, int], font: ImageFont.ImageFont) -> None:
    box = draw.textbbox((0, 0), text, font=font)
    draw.text((xy[0] - (box[2] - box[0]) // 2, xy[1] - (box[3] - box[1]) // 2), text, fill=fill, font=font)


def fmt_tick(value: float) -> str:
    if abs(value) >= 1000:
        return f"{value:.0f}"
    if abs(value) >= 100:
        return f"{value:.0f}"
    if abs(value) >= 10:
        return f"{value:.1f}".rstrip("0").rstrip(".")
    return f"{value:.2f}".rstrip("0").rstrip(".")


def finite(values: np.ndarray) -> np.ndarray:
    values = np.asarray(values, dtype=float)
    return values[np.isfinite(values)]


def chart(
    path: Path,
    x: np.ndarray,
    series: dict[str, np.ndarray],
    *,
    title: str,
    x_label: str,
    y_label: str,
    xlim: tuple[float, float] | None = None,
    ylim: tuple[float, float] | None = None,
    hlines: list[tuple[float, str]] | None = None,
    vlines: list[tuple[float, str]] | None = None,
    y_zero: bool = False,
) -> None:
    width, height = 1400, 900
    left, right, top, bottom = 215, 85, 105, 135
    plot_left, plot_right = left, width - right
    plot_top, plot_bottom = top, height - bottom

    x = np.asarray(x, dtype=float)
    clean = {name: np.asarray(y, dtype=float) for name, y in series.items()}
    y_all = np.concatenate([finite(y) for y in clean.values()])
    if hlines:
        y_all = np.concatenate([y_all, np.asarray([v for v, _ in hlines], dtype=float)])

    if xlim:
        x_min, x_max = xlim
    else:
        x_min, x_max = float(np.nanmin(x)), float(np.nanmax(x))
    if ylim:
        y_min, y_max = ylim
    else:
        y_min, y_max = float(np.nanmin(y_all)), float(np.nanmax(y_all))
        if math.isclose(y_min, y_max):
            y_min -= 1.0
            y_max += 1.0
        pad = 0.08 * (y_max - y_min)
        y_min -= pad
        y_max += pad
        if y_zero and y_min > 0:
            y_min = 0.0

    image = Image.new("RGB", (width, height), (250, 251, 252))
    draw = ImageDraw.Draw(image)
    draw.rectangle([plot_left, plot_top, plot_right, plot_bottom], fill=(255, 255, 255), outline=(84, 94, 108), width=2)

    def px(v: float) -> int:
        return int(plot_left + (v - x_min) / (x_max - x_min) * (plot_right - plot_left))

    def py(v: float) -> int:
        return int(plot_bottom - (v - y_min) / (y_max - y_min) * (plot_bottom - plot_top))

    for value in np.linspace(x_min, x_max, 6):
        xpix = px(float(value))
        draw.line([xpix, plot_top, xpix, plot_bottom], fill=(224, 229, 236), width=1)
        draw.line([xpix, plot_bottom, xpix, plot_bottom + 8], fill=(55, 65, 81), width=2)
        center_text(draw, (xpix, plot_bottom + 31), fmt_tick(float(value)), (55, 65, 81), FONT_SM)

    for value in np.linspace(y_min, y_max, 6):
        ypix = py(float(value))
        draw.line([plot_left, ypix, plot_right, ypix], fill=(224, 229, 236), width=1)
        draw.line([plot_left - 8, ypix, plot_left, ypix], fill=(55, 65, 81), width=2)
        draw.text((80, ypix - 11), fmt_tick(float(value)), fill=(55, 65, 81), font=FONT_SM)

    if hlines:
        for value, label in hlines:
            ypix = py(value)
            draw.line([plot_left, ypix, plot_right, ypix], fill=(132, 70, 70), width=3)
            draw.text((plot_right - 315, ypix - 29), label, fill=(112, 56, 56), font=FONT_SM)

    if vlines:
        for value, label in vlines:
            xpix = px(value)
            draw.line([xpix, plot_top, xpix, plot_bottom], fill=(75, 85, 99), width=3)
            label_box = draw.textbbox((0, 0), label, font=FONT_SM)
            label_width = label_box[2] - label_box[0]
            label_x = xpix + 12
            if label_x + label_width > plot_right:
                label_x = xpix - label_width - 12
            draw.text((label_x, plot_bottom - 34), label, fill=(55, 65, 81), font=FONT_SM)

    for idx, (name, y) in enumerate(clean.items()):
        color = COLORS[idx % len(COLORS)]
        points = []
        for xv, yv in zip(x, y):
            if np.isfinite(xv) and np.isfinite(yv) and x_min <= xv <= x_max and y_min <= yv <= y_max:
                points.append((px(float(xv)), py(float(yv))))
        if len(points) > 1:
            draw.line(points, fill=color, width=4)

        lx = plot_left + 28
        ly = plot_top + 26 + idx * 32
        draw.line([lx, ly + 11, lx + 44, ly + 11], fill=color, width=5)
        draw.text((lx + 56, ly), name, fill=(31, 41, 55), font=FONT_SM)

    draw.text((left, 37), title, fill=(20, 29, 44), font=FONT_LG)
    center_text(draw, ((plot_left + plot_right) // 2, height - 58), x_label, (31, 41, 55), FONT_MD)

    label_layer = Image.new("RGBA", (700, 70), (0, 0, 0, 0))
    label_draw = ImageDraw.Draw(label_layer)
    label_draw.text((0, 16), y_label, fill=(31, 41, 55), font=FONT_MD)
    rotated = label_layer.rotate(270, expand=True)
    image.paste(rotated, (20, (height - rotated.height) // 2), rotated)
    image.save(path)


def power_db(power: np.ndarray) -> np.ndarray:
    return 10.0 * np.log10(np.maximum(power, 0.0) + 1.0)


def smooth(values: np.ndarray, window: int = 9) -> np.ndarray:
    if window <= 1:
        return values
    pad = window // 2
    padded = np.pad(values, (pad, pad), mode="edge")
    kernel = np.ones(window, dtype=float) / window
    return np.convolve(padded, kernel, mode="valid")


def read_csv_rows(path: Path) -> list[dict[str, float]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return [{k: float(v) for k, v in row.items()} for row in csv.DictReader(handle)]


def main() -> None:
    config, _ = load_config("config.yaml")
    along_m, _, depth_m = axes_from_config(config)
    along_km = along_m / 1000.0
    window = candidate_window(config)
    out_dir = Path(cfg_get(config, "paths.output_dir", "reason_outputs"))
    OUT.mkdir(parents=True, exist_ok=True)

    terrain = read_array(out_dir / "flat_compare_terrain_radargram.npy")
    clutter = read_array(out_dir / "test1_cluttergram.npy")
    flat = read_array(out_dir / "flat_compare_flat_beam_radargram.npy")
    nadir = read_array(out_dir / "flat_compare_nadir_only_flat_radargram.npy")

    candidate_depth = window["apparent_depth_m"]
    candidate_tol = window["depth_tolerance_m"]
    depth_sel = np.abs(depth_m - candidate_depth) <= candidate_tol
    along_sel = (along_km >= window["along_start_km"]) & (along_km <= window["along_end_km"])

    altitude_m = float(cfg_get(config, "geometry.altitude_km", 400.0)) * 1000.0
    required_km = required_offset_for_depth(candidate_depth, altitude_m, n_ice(config)) / 1000.0

    offsets_km = np.linspace(-40.0, 40.0, 401)
    depth_curve = apparent_depth_from_offset(offsets_km * 1000.0, altitude_m, n_ice(config))
    chart(
        OUT / "01_depth_vs_left_right_offset.png",
        offsets_km,
        {"apparent depth from off-nadir surface echo": depth_curve},
        title="Left/right surface offset produces apparent depth",
        x_label="Surface feature offset left/right from nadir (km)",
        y_label="Apparent depth / radar delay (m)",
        ylim=(0, 1250),
        hlines=[(candidate_depth, "candidate depth 440 m")],
        vlines=[(-required_km, "-25.0 km"), (required_km, "+25.0 km")],
    )

    band_terrain = np.nanmean(terrain[depth_sel, :], axis=0)
    band_clutter = np.nanmean(clutter[depth_sel, :], axis=0)
    band_flat = np.nanmean(flat[depth_sel, :], axis=0)
    band_nadir = np.nanmean(nadir[depth_sel, :], axis=0)
    chart(
        OUT / "02_candidate_band_power_along_track_db.png",
        along_km,
        {
            "terrain radargram": power_db(band_terrain),
            "DEM cluttergram": power_db(band_clutter),
            "flat-surface beam": power_db(band_flat),
            "nadir-only flat": power_db(band_nadir),
        },
        title="Candidate-band power along the left-right flight path",
        x_label="Along-track distance (km)",
        y_label="Power in candidate band (dB, relative)",
        ylim=(0, 50),
        vlines=[(window["along_start_km"], "candidate start"), (window["along_end_km"], "candidate end")],
    )

    profile_depth = depth_m[depth_m <= 900.0]
    profile_slice = depth_m <= 900.0
    chart(
        OUT / "03_power_vs_apparent_depth_db.png",
        profile_depth,
        {
            "terrain radargram": power_db(np.nanmean(terrain[profile_slice][:, along_sel], axis=1)),
            "DEM cluttergram": power_db(np.nanmean(clutter[profile_slice][:, along_sel], axis=1)),
            "flat-surface beam": power_db(np.nanmean(flat[profile_slice][:, along_sel], axis=1)),
        },
        title="Power by apparent depth inside the candidate along-track span",
        x_label="Apparent depth / radar delay (m)",
        y_label="Mean power (dB, relative)",
        ylim=(0, 50),
        vlines=[(candidate_depth - candidate_tol, "candidate top"), (candidate_depth + candidate_tol, "candidate bottom")],
    )

    ch1, ch2 = _simulate_channels(config, depth_m, along_m)
    cross = ch1 * np.conj(ch2)
    phase = np.angle(cross)
    coherence_weight = np.abs(cross)
    baseline = float(cfg_get(config, "geometry.baseline_m", 5.0))
    angle_arg = np.clip(phase * wavelength_m(config) / (2.0 * math.pi * baseline), -1.0, 1.0)
    lateral_offset = config_altitude_m(config) * np.tan(np.arcsin(angle_arg)) / 1000.0
    mean_offset = np.average(lateral_offset[depth_sel, :], weights=np.maximum(coherence_weight[depth_sel, :], 1.0e-12), axis=0)
    mean_offset = smooth(mean_offset, window=9)
    chart(
        OUT / "04_interferometry_offset_along_track.png",
        along_km,
        {"measured lateral offset": mean_offset},
        title="Interferometry maps the candidate band to a left/right offset",
        x_label="Along-track distance (km)",
        y_label="Mean lateral offset in candidate band (km)",
        ylim=(0, 45),
        hlines=[(25.0, "expected offset 25 km"), (19.0, "lower tolerance"), (31.0, "upper tolerance")],
        vlines=[(window["along_start_km"], "candidate start"), (window["along_end_km"], "candidate end")],
    )

    ratio_db = 10.0 * np.log10((band_terrain + 1.0) / (band_flat + 1.0))
    chart(
        OUT / "05_terrain_excess_over_flat_baseline_db.png",
        along_km,
        {"terrain / flat-surface beam ratio": ratio_db},
        title="Terrain echo is much stronger than the flat-surface baseline",
        x_label="Along-track distance (km)",
        y_label="Excess power over flat baseline (dB)",
        ylim=(0, 30),
        hlines=[(0.0, "no excess")],
        vlines=[(window["along_start_km"], "candidate start"), (window["along_end_km"], "candidate end")],
    )

    crossover = read_csv_rows(out_dir / "test3_crossover_depth_discrepancies.csv")
    idx = np.asarray([row["crossover_id"] for row in crossover])
    depth_a = np.asarray([row["depth_a_m"] for row in crossover])
    depth_b = np.asarray([row["depth_b_m"] for row in crossover])
    chart(
        OUT / "06_crossover_apparent_depths.png",
        idx,
        {"track A apparent depth": depth_a, "track B apparent depth": depth_b},
        title="Crossover depths disagree when the same area is viewed from different sides",
        x_label="Crossover number",
        y_label="Apparent depth (m)",
        ylim=(300, 1050),
    )

    pulse_us = np.linspace(0.1, 10.0, 250)
    raw_blur_m = C_M_PER_S * pulse_us * 1e-6 / (2.0 * n_ice(config))
    chart(
        OUT / "07_pulse_length_vs_range_blur.png",
        pulse_us,
        {"uncompressed range blur": raw_blur_m},
        title="Longer pulse length blurs range unless compressed",
        x_label="Pulse length (microseconds)",
        y_label="Raw range blur in ice (m)",
        ylim=(0, float(np.max(raw_blur_m)) * 1.05),
    )

    prf_hz = np.linspace(100.0, 5000.0, 250)
    unambiguous_km = C_M_PER_S / (2.0 * prf_hz) / 1000.0
    chart(
        OUT / "08_prf_vs_unambiguous_range.png",
        prf_hz,
        {"maximum unambiguous range": unambiguous_km},
        title="Higher PRF reduces unambiguous range",
        x_label="Pulse repetition frequency, PRF (Hz)",
        y_label="Unambiguous range in free space (km)",
        ylim=(0, 1600),
    )

    pulse_count = np.arange(1, 257)
    snr_gain = 10.0 * np.log10(pulse_count)
    chart(
        OUT / "09_number_of_pulses_vs_snr_gain.png",
        pulse_count,
        {"coherent/incoherent averaging gain": snr_gain},
        title="Summing more pulses improves signal-to-noise ratio",
        x_label="Number of pulses summed",
        y_label="SNR gain (dB)",
        ylim=(0, 25),
    )

    bins = np.linspace(-8.0, 8.0, 700)
    response = np.sinc(bins) ** 2
    response_db = 10.0 * np.log10(np.maximum(response, 1e-6))
    chart(
        OUT / "10_pulse_compression_sidelobes.png",
        bins,
        {"compressed-pulse response": response_db},
        title="Pulse compression narrows the main lobe but leaves sidelobes",
        x_label="Range bins around the target",
        y_label="Relative response (dB)",
        ylim=(-60, 2),
        hlines=[(-13.0, "typical first sidelobe")],
    )

    summary = {
        "meaning": "These are cleaned normal line graphs. The data-supported result is that the 440 m candidate maps to about +/-25 km off nadir, and the candidate-band power is much stronger for terrain clutter than for the flat baseline.",
        "candidate_depth_m": candidate_depth,
        "candidate_along_km": [window["along_start_km"], window["along_end_km"]],
        "required_left_right_offset_km": required_km,
        "mean_interferometry_offset_km": float(np.nanmean(mean_offset[along_sel])),
        "median_terrain_over_flat_db": float(np.nanmedian(ratio_db[along_sel])),
        "graphs": [str(path.resolve()) for path in sorted(OUT.glob("*.png"))],
    }
    (OUT / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
