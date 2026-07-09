from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from reason_common import (
    apparent_depth_from_offset,
    axes_from_config,
    cfg_get,
    candidate_window,
    load_config,
    n_ice,
    read_array,
    required_offset_for_depth,
)


OUTPUT = Path("question_graphs")


def font(size: int) -> ImageFont.ImageFont:
    candidates = [
        "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/calibri.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size=size)
    return ImageFont.load_default()


FONT_SM = font(18)
FONT_MD = font(24)
FONT_LG = font(32)


def text_center(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, fill: tuple[int, int, int], fnt: ImageFont.ImageFont) -> None:
    bbox = draw.textbbox((0, 0), text, font=fnt)
    draw.text((xy[0] - (bbox[2] - bbox[0]) // 2, xy[1] - (bbox[3] - bbox[1]) // 2), text, fill=fill, font=fnt)


def heatmap_rgb(array: np.ndarray, percentile: float = 99.5) -> Image.Image:
    data = np.nan_to_num(array, nan=0.0, posinf=0.0, neginf=0.0)
    vmax = float(np.percentile(data, percentile))
    if vmax <= 0.0:
        vmax = 1.0
    scaled = np.clip(data / vmax, 0.0, 1.0)
    r = np.clip((scaled - 0.20) / 0.50, 0.0, 1.0)
    g = np.clip((scaled - 0.08) / 0.55, 0.0, 1.0)
    b = np.clip(1.0 - (scaled - 0.55) / 0.45, 0.0, 1.0)
    return Image.fromarray((np.dstack([r, g, b]) * 255.0).astype(np.uint8), mode="RGB")


def line_plot(
    path: Path,
    x: np.ndarray,
    series: dict[str, np.ndarray],
    *,
    title: str,
    x_label: str,
    y_label: str,
    hlines: list[tuple[float, str]] | None = None,
    vlines: list[tuple[float, str]] | None = None,
    invert_y: bool = False,
) -> None:
    width, height = 1300, 820
    left, right, top, bottom = 220, 72, 96, 132
    image = Image.new("RGB", (width, height), (250, 251, 252))
    draw = ImageDraw.Draw(image)

    clean_series = {name: np.asarray(values, dtype=float) for name, values in series.items()}
    x = np.asarray(x, dtype=float)
    y_values = np.concatenate([values[np.isfinite(values)] for values in clean_series.values()])
    if hlines:
        y_values = np.concatenate([y_values, np.asarray([v for v, _ in hlines], dtype=float)])
    x_min, x_max = float(np.nanmin(x)), float(np.nanmax(x))
    y_min, y_max = float(np.nanmin(y_values)), float(np.nanmax(y_values))
    positive_floor = y_min >= 0.0
    if math.isclose(y_min, y_max):
        y_min -= 1.0
        y_max += 1.0
    y_pad = 0.08 * (y_max - y_min)
    y_min -= y_pad
    y_max += y_pad
    if positive_floor:
        y_min = 0.0

    plot_left, plot_top = left, top
    plot_right, plot_bottom = width - right, height - bottom

    def px(value: float) -> int:
        return int(plot_left + (value - x_min) / (x_max - x_min) * (plot_right - plot_left))

    def py(value: float) -> int:
        frac = (value - y_min) / (y_max - y_min)
        if invert_y:
            return int(plot_top + frac * (plot_bottom - plot_top))
        return int(plot_bottom - frac * (plot_bottom - plot_top))

    draw.rectangle([plot_left, plot_top, plot_right, plot_bottom], fill=(255, 255, 255), outline=(92, 101, 116), width=2)
    for frac in np.linspace(0.0, 1.0, 6):
        gx = int(plot_left + frac * (plot_right - plot_left))
        gy = int(plot_top + frac * (plot_bottom - plot_top))
        draw.line([gx, plot_top, gx, plot_bottom], fill=(225, 229, 235), width=1)
        draw.line([plot_left, gy, plot_right, gy], fill=(225, 229, 235), width=1)

    for tick in np.linspace(x_min, x_max, 6):
        tx = px(float(tick))
        draw.line([tx, plot_bottom, tx, plot_bottom + 8], fill=(55, 65, 81), width=2)
        text_center(draw, (tx, plot_bottom + 30), f"{tick:g}", (55, 65, 81), FONT_SM)

    for tick in np.linspace(y_min, y_max, 6):
        ty = py(float(tick))
        draw.line([plot_left - 8, ty, plot_left, ty], fill=(55, 65, 81), width=2)
        draw.text((78, ty - 10), f"{tick:g}", fill=(55, 65, 81), font=FONT_SM)

    palette = [
        (28, 88, 165),
        (201, 84, 57),
        (51, 132, 91),
        (125, 80, 167),
        (214, 144, 36),
    ]
    for idx, (name, values) in enumerate(clean_series.items()):
        points = [(px(float(xv)), py(float(yv))) for xv, yv in zip(x, values) if np.isfinite(xv) and np.isfinite(yv)]
        if len(points) > 1:
            draw.line(points, fill=palette[idx % len(palette)], width=4)
        lx = plot_left + 28
        ly = plot_top + 24 + idx * 32
        draw.line([lx, ly + 10, lx + 42, ly + 10], fill=palette[idx % len(palette)], width=5)
        draw.text((lx + 54, ly), name, fill=(35, 42, 52), font=FONT_SM)

    if hlines:
        for value, label in hlines:
            y = py(value)
            draw.line([plot_left, y, plot_right, y], fill=(126, 69, 69), width=3)
            draw.text((plot_right - 310, y - 30), label, fill=(112, 56, 56), font=FONT_SM)
    if vlines:
        for value, label in vlines:
            x_pix = px(value)
            draw.line([x_pix, plot_top, x_pix, plot_bottom], fill=(75, 85, 99), width=3)
            draw.text((x_pix + 12, plot_bottom - 34), label, fill=(55, 65, 81), font=FONT_SM)

    draw.text((left, 34), title, fill=(20, 29, 44), font=FONT_LG)
    text_center(draw, ((plot_left + plot_right) // 2, height - 58), x_label, (31, 41, 55), FONT_MD)

    label_layer = Image.new("RGBA", (620, 70), (0, 0, 0, 0))
    label_draw = ImageDraw.Draw(label_layer)
    label_draw.text((0, 12), y_label, fill=(31, 41, 55), font=FONT_MD)
    rotated = label_layer.rotate(90 if invert_y else 270, expand=True)
    image.paste(rotated, (18, (height - rotated.height) // 2), rotated)
    image.save(path)


def radargram_axes_plot(path: Path, radargram: np.ndarray, along_m: np.ndarray, depth_m: np.ndarray, window: dict[str, float]) -> None:
    width, height = 1400, 900
    left, right, top, bottom = 220, 74, 96, 132
    plot_left, plot_top = left, top
    plot_right, plot_bottom = width - right, height - bottom

    image = Image.new("RGB", (width, height), (250, 251, 252))
    draw = ImageDraw.Draw(image)
    heat = heatmap_rgb(radargram)
    heat = heat.resize((plot_right - plot_left, plot_bottom - plot_top), Image.Resampling.BILINEAR)
    image.paste(heat, (plot_left, plot_top))
    draw.rectangle([plot_left, plot_top, plot_right, plot_bottom], outline=(55, 65, 81), width=2)

    x_min, x_max = along_m[0] / 1000.0, along_m[-1] / 1000.0
    y_min, y_max = depth_m[0], depth_m[-1]

    def px(along_km: float) -> int:
        return int(plot_left + (along_km - x_min) / (x_max - x_min) * (plot_right - plot_left))

    def py(depth: float) -> int:
        return int(plot_top + (depth - y_min) / (y_max - y_min) * (plot_bottom - plot_top))

    for tick in np.linspace(x_min, x_max, 7):
        x = px(float(tick))
        draw.line([x, plot_top, x, plot_bottom], fill=(255, 255, 255), width=1)
        draw.line([x, plot_bottom, x, plot_bottom + 8], fill=(55, 65, 81), width=2)
        text_center(draw, (x, plot_bottom + 30), f"{tick:g}", (55, 65, 81), FONT_SM)

    for tick in np.linspace(y_min, y_max, 7):
        y = py(float(tick))
        draw.line([plot_left, y, plot_right, y], fill=(255, 255, 255), width=1)
        draw.line([plot_left - 8, y, plot_left, y], fill=(55, 65, 81), width=2)
        draw.text((84, y - 10), f"{tick:g}", fill=(55, 65, 81), font=FONT_SM)

    x0 = px(window["along_start_km"])
    x1 = px(window["along_end_km"])
    y0 = py(window["apparent_depth_m"] - window["depth_tolerance_m"])
    y1 = py(window["apparent_depth_m"] + window["depth_tolerance_m"])
    draw.rectangle([x0, y0, x1, y1], outline=(255, 80, 80), width=5)
    draw.text((x0 + 16, max(plot_top + 12, y0 - 34)), "candidate band", fill=(255, 245, 245), font=FONT_MD)

    draw.text((left, 34), "Radargram: left-right motion vs up-down apparent depth", fill=(20, 29, 44), font=FONT_LG)
    text_center(draw, ((plot_left + plot_right) // 2, height - 58), "Along-track distance left to right (km)", (31, 41, 55), FONT_MD)

    label_layer = Image.new("RGBA", (420, 60), (0, 0, 0, 0))
    label_draw = ImageDraw.Draw(label_layer)
    label_draw.text((0, 12), "Apparent depth / radar delay downward (m)", fill=(31, 41, 55), font=FONT_MD)
    rotated = label_layer.rotate(90, expand=True)
    image.paste(rotated, (16, (height - rotated.height) // 2), rotated)

    draw.line([plot_left + 30, plot_top + 42, plot_left + 170, plot_top + 42], fill=(255, 255, 255), width=4)
    draw.polygon([(plot_left + 170, plot_top + 42), (plot_left + 154, plot_top + 32), (plot_left + 154, plot_top + 52)], fill=(255, 255, 255))
    draw.text((plot_left + 180, plot_top + 25), "spacecraft moves left to right", fill=(255, 255, 255), font=FONT_SM)
    draw.line([plot_left + 30, plot_top + 70, plot_left + 30, plot_top + 170], fill=(255, 255, 255), width=4)
    draw.polygon([(plot_left + 30, plot_top + 170), (plot_left + 20, plot_top + 154), (plot_left + 40, plot_top + 154)], fill=(255, 255, 255))
    draw.text((plot_left + 48, plot_top + 142), "delay/depth grows downward", fill=(255, 255, 255), font=FONT_SM)
    image.save(path)


def pulse_concept_plot(path: Path) -> None:
    width, height = 1400, 860
    image = Image.new("RGB", (width, height), (250, 251, 252))
    draw = ImageDraw.Draw(image)
    draw.text((80, 36), "Pulse settings: what the notes are asking you to show", fill=(20, 29, 44), font=FONT_LG)

    panels = [
        (80, 120, 640, 360, "Pulse length: wider pulse = more energy, poorer raw range resolution"),
        (760, 120, 1320, 360, "PRF: closer pulses = higher pulse repetition frequency"),
        (80, 470, 640, 760, "Summing more pulses: signal averages up, random noise averages down"),
        (760, 470, 1320, 760, "Pulse compression: narrow main lobe, but sidelobes can rise"),
    ]
    for x0, y0, x1, y1, title in panels:
        draw.rounded_rectangle([x0, y0, x1, y1], radius=8, fill=(255, 255, 255), outline=(194, 201, 211), width=2)
        draw.text((x0 + 22, y0 + 18), title, fill=(31, 41, 55), font=FONT_SM)
        draw.line([x0 + 48, y1 - 42, x1 - 36, y1 - 42], fill=(74, 85, 104), width=2)
        draw.line([x0 + 48, y1 - 42, x0 + 48, y0 + 62], fill=(74, 85, 104), width=2)

    # Pulse length panel.
    x0, y0, x1, y1, _ = panels[0]
    base = y1 - 42
    for start, width_px, color in [(x0 + 100, 78, (28, 88, 165)), (x0 + 285, 165, (201, 84, 57))]:
        draw.line([start, base, start, base - 120, start + width_px, base - 120, start + width_px, base], fill=color, width=5)
    draw.text((x0 + 92, base + 12), "short", fill=(28, 88, 165), font=FONT_SM)
    draw.text((x0 + 318, base + 12), "long", fill=(201, 84, 57), font=FONT_SM)

    # PRF panel.
    x0, y0, x1, y1, _ = panels[1]
    base = y1 - 42
    for start in [x0 + 90, x0 + 205, x0 + 320, x0 + 435]:
        draw.line([start, base, start, base - 120, start + 26, base - 120, start + 26, base], fill=(28, 88, 165), width=5)
    for start in [x0 + 90, x0 + 320]:
        draw.arc([start, base - 168, start + 230, base - 78], 200, 340, fill=(201, 84, 57), width=3)
    draw.text((x0 + 112, base + 12), "short spacing = high PRF", fill=(31, 41, 55), font=FONT_SM)

    # Summing panel.
    x0, y0, x1, y1, _ = panels[2]
    xs = np.linspace(x0 + 58, x1 - 36, 220)
    rng = np.random.default_rng(7)
    signal = np.sin(np.linspace(0, 4.5 * math.pi, len(xs))) * 34
    noisy = signal + rng.normal(0, 32, len(xs))
    averaged = signal + rng.normal(0, 10, len(xs))
    for values, color, offset in [(noisy, (201, 84, 57), 84), (averaged, (28, 88, 165), 178)]:
        points = [(int(x), int(y0 + offset - v)) for x, v in zip(xs, values)]
        draw.line(points, fill=color, width=3)
    draw.text((x0 + 76, y0 + 88), "few pulses", fill=(201, 84, 57), font=FONT_SM)
    draw.text((x0 + 76, y0 + 182), "many pulses", fill=(28, 88, 165), font=FONT_SM)

    # Compression panel.
    x0, y0, x1, y1, _ = panels[3]
    xs = np.linspace(-6.0, 6.0, 280)
    envelope = np.sinc(xs) ** 2
    raised = envelope + 0.04 * (np.sinc(xs / 0.7) ** 2)
    plot_x = np.linspace(x0 + 58, x1 - 36, len(xs))
    base = y1 - 42
    points = [(int(x), int(base - 190 * y)) for x, y in zip(plot_x, raised)]
    draw.line(points, fill=(28, 88, 165), width=4)
    draw.text((x0 + 206, y0 + 86), "main lobe", fill=(28, 88, 165), font=FONT_SM)
    draw.text((x0 + 382, y0 + 170), "sidelobes", fill=(201, 84, 57), font=FONT_SM)
    for lx in [x0 + 215, x0 + 475]:
        draw.line([lx, y0 + 192, lx + 58, y0 + 192], fill=(201, 84, 57), width=4)
    image.save(path)


def main() -> None:
    config, config_path = load_config("config.yaml")
    along_m, cross_m, depth_m = axes_from_config(config)
    output_dir = Path(cfg_get(config, "paths.output_dir", "reason_outputs"))
    OUTPUT.mkdir(parents=True, exist_ok=True)

    terrain = read_array(output_dir / "flat_compare_terrain_radargram.npy")
    flat_beam = read_array(output_dir / "flat_compare_flat_beam_radargram.npy")
    nadir_flat = read_array(output_dir / "flat_compare_nadir_only_flat_radargram.npy")
    clutter = read_array(output_dir / "test1_cluttergram.npy")
    phase = read_array(output_dir / "test2_interferometric_phase_rad.npy")
    lateral_offset = read_array(output_dir / "test2_lateral_offset_km.npy")

    window = candidate_window(config)
    radargram_axes_plot(OUTPUT / "01_left_right_up_down_radargram.png", terrain, along_m, depth_m, window)

    depth_sel = np.abs(depth_m - window["apparent_depth_m"]) <= window["depth_tolerance_m"]
    line_plot(
        OUTPUT / "02_candidate_power_left_to_right.png",
        along_m / 1000.0,
        {
            "terrain radargram": np.nanmean(terrain[depth_sel, :], axis=0),
            "DEM cluttergram": np.nanmean(clutter[depth_sel, :], axis=0),
            "flat beam baseline": np.nanmean(flat_beam[depth_sel, :], axis=0),
            "nadir-only flat baseline": np.nanmean(nadir_flat[depth_sel, :], axis=0),
        },
        title="Candidate-band power across the left-right flight path",
        x_label="Along-track distance left to right (km)",
        y_label="Mean power in 440 m candidate band",
        vlines=[
            (window["along_start_km"], "candidate start"),
            (window["along_end_km"], "candidate end"),
        ],
    )

    along_sel = (along_m / 1000.0 >= window["along_start_km"]) & (along_m / 1000.0 <= window["along_end_km"])
    line_plot(
        OUTPUT / "03_depth_profile_up_down.png",
        depth_m,
        {
            "terrain radargram": np.nanmean(terrain[:, along_sel], axis=1),
            "DEM cluttergram": np.nanmean(clutter[:, along_sel], axis=1),
            "flat beam baseline": np.nanmean(flat_beam[:, along_sel], axis=1),
        },
        title="Power changes as apparent depth moves up-down",
        x_label="Apparent depth / radar delay (m)",
        y_label="Mean power across candidate along-track span",
        vlines=[
            (window["apparent_depth_m"] - window["depth_tolerance_m"], "candidate top"),
            (window["apparent_depth_m"] + window["depth_tolerance_m"], "candidate bottom"),
        ],
    )

    offsets_km = np.linspace(-40.0, 40.0, 401)
    depth_curve = apparent_depth_from_offset(offsets_km * 1000.0, float(cfg_get(config, "geometry.altitude_km", 400.0)) * 1000.0, n_ice(config))
    required_km = required_offset_for_depth(window["apparent_depth_m"], float(cfg_get(config, "geometry.altitude_km", 400.0)) * 1000.0, n_ice(config)) / 1000.0
    line_plot(
        OUTPUT / "04_left_right_offset_to_depth_curve.png",
        offsets_km,
        {"apparent depth from off-nadir surface echo": depth_curve},
        title="Why the sketch is U-shaped: left/right offset maps to apparent depth",
        x_label="Surface feature offset left/right from nadir (km)",
        y_label="Apparent depth / delay (m)",
        hlines=[(window["apparent_depth_m"], "candidate depth 440 m")],
        vlines=[(-required_km, "-required offset"), (required_km, "+required offset")],
    )

    pulse_concept_plot(OUTPUT / "05_pulse_length_prf_compression_concepts.png")

    candidate_phase = phase[np.ix_(depth_sel, along_sel)]
    candidate_offset = lateral_offset[np.ix_(depth_sel, along_sel)]
    summary = {
        "answer": "The axes should be plotted as along-track left-to-right and apparent depth/radar delay up-down. The U shape in the sketch is the off-nadir surface echo relationship: equal left/right offsets map to the same apparent depth.",
        "generated_graphs": [
            str((OUTPUT / "01_left_right_up_down_radargram.png").resolve()),
            str((OUTPUT / "02_candidate_power_left_to_right.png").resolve()),
            str((OUTPUT / "03_depth_profile_up_down.png").resolve()),
            str((OUTPUT / "04_left_right_offset_to_depth_curve.png").resolve()),
            str((OUTPUT / "05_pulse_length_prf_compression_concepts.png").resolve()),
        ],
        "candidate_window": window,
        "required_left_or_right_offset_km_for_candidate_depth": required_km,
        "mean_candidate_phase_deg": float(np.degrees(np.nanmean(candidate_phase))),
        "mean_candidate_lateral_offset_km": float(np.nanmean(candidate_offset)),
    }
    (OUTPUT / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
