"""Flat point-target Doppler aliasing demo.

This is the stripped-down version of the whiteboard idea in the transcript:

* a flat surface is represented by many point targets,
* a nadir subsurface reflector is represented by one point target,
* surface points have larger delay and larger Doppler as look angle increases,
* PRF folding maps true Doppler into the sampled Doppler band.

The goal is not to make a flight processor. It is to show exactly when
same-delay surface clutter is merely aliased, and when it aliases all the way
onto the zero-Doppler nadir subsurface echo.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
from pathlib import Path
from typing import Iterable

import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "outputs" / "flat_point_target_aliasing.png"
DEFAULT_SUMMARY = ROOT / "outputs" / "flat_point_target_alias_summary.csv"
DEFAULT_CURVE = ROOT / "outputs" / "flat_point_target_alias_curve.csv"

C_M_S = 299_792_458.0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="PNG plot output path")
    parser.add_argument("--summary-csv", type=Path, default=DEFAULT_SUMMARY, help="Threshold summary CSV output")
    parser.add_argument("--curve-csv", type=Path, default=DEFAULT_CURVE, help="Surface-curve CSV output")
    parser.add_argument("--altitude-km", type=float, default=25.0, help="Spacecraft altitude above flat surface")
    parser.add_argument("--speed-km-s", type=float, default=4.6, help="Along-track spacecraft speed")
    parser.add_argument("--wavelength-m", type=float, default=5.0, help="Radar wavelength; 5 m is about 60 MHz")
    parser.add_argument("--frequency-mhz", type=float, default=None, help="Optional frequency override; computes wavelength")
    parser.add_argument("--ice-index", type=float, default=1.78, help="Ice refractive index")
    parser.add_argument("--target-depth-km", type=float, default=6.0, help="Nadir subsurface reflector depth")
    parser.add_argument("--max-depth-km", type=float, default=10.0, help="Maximum apparent depth shown")
    parser.add_argument("--pulse-us", type=float, default=200.0, help="Transmit pulse duration")
    parser.add_argument("--guard-us", type=float, default=5.0, help="Listen-window guard time")
    parser.add_argument("--dead-time-us", type=float, default=10.0, help="Receiver/transmit dead time")
    parser.add_argument("--max-usable-prf-hz", type=float, default=3000.0, help="Instrument PRF cap")
    parser.add_argument(
        "--current-prf-hz",
        type=float,
        default=None,
        help="Override current PRF. If omitted, the timing-limited effective PRF is used.",
    )
    parser.add_argument("--samples", type=int, default=801, help="Number of depth samples on the curve")
    return parser.parse_args()


def wavelength_from_args(args: argparse.Namespace) -> float:
    if args.frequency_mhz is None:
        return args.wavelength_m
    return C_M_S / (args.frequency_mhz * 1_000_000.0)


def alias_frequency(f_hz: np.ndarray | float, prf_hz: float) -> np.ndarray | float:
    """Map true frequency into [-PRF/2, PRF/2)."""

    return ((np.asarray(f_hz) + prf_hz / 2.0) % prf_hz) - prf_hz / 2.0


def same_delay_geometry(
    altitude_km: float,
    depth_km: float,
    ice_index: float,
    speed_km_s: float,
    wavelength_m: float,
) -> dict[str, float]:
    """Return the flat-surface point that has the same delay as a nadir bed point."""

    h_m = altitude_km * 1000.0
    d_m = depth_km * 1000.0
    speed_m_s = speed_km_s * 1000.0
    range_m = h_m + ice_index * d_m
    offset_m = math.sqrt(max(range_m * range_m - h_m * h_m, 0.0))
    sin_theta = offset_m / range_m if range_m else 0.0
    doppler_hz = 2.0 * speed_m_s * sin_theta / wavelength_m
    return {
        "one_way_optical_path_m": range_m,
        "surface_offset_km": offset_m / 1000.0,
        "look_angle_deg": math.degrees(math.asin(max(-1.0, min(1.0, sin_theta)))),
        "same_delay_doppler_hz": doppler_hz,
        "alias_starts_below_prf_hz": 2.0 * doppler_hz,
        "first_zero_overlap_prf_hz": doppler_hz,
    }


def timing_limited_prf(
    altitude_km: float,
    depth_km: float,
    ice_index: float,
    pulse_us: float,
    guard_us: float,
    dead_time_us: float,
    max_usable_prf_hz: float,
) -> dict[str, float]:
    h_m = altitude_km * 1000.0
    d_m = depth_km * 1000.0
    one_way_path_m = h_m + ice_index * d_m
    two_way_us = 2.0 * one_way_path_m / C_M_S * 1_000_000.0
    listen_window_us = pulse_us + guard_us + dead_time_us + two_way_us
    pulse_limited_prf_hz = 1_000_000.0 / listen_window_us
    effective_prf_hz = min(max_usable_prf_hz, pulse_limited_prf_hz)
    return {
        "two_way_target_time_us": two_way_us,
        "listen_window_us": listen_window_us,
        "pulse_limited_prf_hz": pulse_limited_prf_hz,
        "effective_prf_hz": effective_prf_hz,
    }


def surface_curve(
    altitude_km: float,
    max_depth_km: float,
    ice_index: float,
    speed_km_s: float,
    wavelength_m: float,
    samples: int,
) -> dict[str, np.ndarray]:
    depths_km = np.linspace(0.0, max_depth_km, samples)
    h_m = altitude_km * 1000.0
    speed_m_s = speed_km_s * 1000.0
    path_m = h_m + ice_index * depths_km * 1000.0
    offset_m = np.sqrt(np.maximum(path_m**2 - h_m**2, 0.0))
    sin_theta = np.divide(offset_m, path_m, out=np.zeros_like(offset_m), where=path_m != 0.0)
    doppler_hz = 2.0 * speed_m_s * sin_theta / wavelength_m
    return {
        "apparent_depth_km": depths_km,
        "surface_offset_km": offset_m / 1000.0,
        "positive_doppler_hz": doppler_hz,
        "negative_doppler_hz": -doppler_hz,
    }


def font(name: str, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    fonts = Path("C:/Windows/Fonts")
    path = fonts / name
    if path.exists():
        return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def draw_line_points(
    draw: ImageDraw.ImageDraw,
    points: Iterable[tuple[float, float]],
    fill: tuple[int, int, int],
    width: int = 3,
    max_jump_px: float | None = None,
) -> None:
    pts = list(points)
    if len(pts) < 2:
        return

    segment: list[tuple[float, float]] = []
    last: tuple[float, float] | None = None
    for point in pts:
        if last is not None and max_jump_px is not None and abs(point[0] - last[0]) > max_jump_px:
            if len(segment) >= 2:
                draw.line(segment, fill=fill, width=width, joint="curve")
            segment = []
        segment.append(point)
        last = point
    if len(segment) >= 2:
        draw.line(segment, fill=fill, width=width, joint="curve")


def render_plot(
    output: Path,
    curve: dict[str, np.ndarray],
    scenarios: list[dict[str, float | str]],
    summary: dict[str, float],
) -> None:
    width, height = 1800, 1100
    margin = 58
    header_h = 112
    panel_gap = 36
    panel_w = (width - 2 * margin - 2 * panel_gap) // 3
    panel_h = 720
    panel_top = header_h + 38
    footer_top = panel_top + panel_h + 34

    img = Image.new("RGB", (width, height), "#0b0f14")
    draw = ImageDraw.Draw(img, "RGBA")
    title_font = font("segoeuib.ttf", 34)
    label_font = font("segoeui.ttf", 20)
    small_font = font("segoeui.ttf", 16)
    tiny_font = font("segoeui.ttf", 14)
    bold_font = font("segoeuib.ttf", 18)

    draw.text(
        (margin, 32),
        "Flat Point-Target Doppler Folding",
        fill=(245, 247, 250, 255),
        font=title_font,
        anchor="la",
    )
    draw.text(
        (margin, 76),
        (
            "A flat surface point at the same delay as the nadir subsurface target "
            "has true Doppler +/-fD. PRF folding decides where that energy appears."
        ),
        fill=(190, 200, 212, 255),
        font=label_font,
        anchor="la",
    )

    depth_values = curve["apparent_depth_km"]
    pos_true = curve["positive_doppler_hz"]
    neg_true = curve["negative_doppler_hz"]
    max_depth = float(depth_values.max())
    target_depth = summary["target_depth_km"]

    for idx, scenario in enumerate(scenarios):
        prf_hz = float(scenario["prf_hz"])
        title = str(scenario["title"])
        sub = str(scenario["subtitle"])
        alias_pos = alias_frequency(pos_true, prf_hz)
        alias_neg = alias_frequency(neg_true, prf_hz)

        x0 = margin + idx * (panel_w + panel_gap)
        y0 = panel_top
        x1 = x0 + panel_w
        y1 = y0 + panel_h
        pad_l, pad_r, pad_t, pad_b = 62, 24, 58, 58
        plot = (x0 + pad_l, y0 + pad_t, x1 - pad_r, y1 - pad_b)
        band = prf_hz / 2.0

        draw.rounded_rectangle((x0, y0, x1, y1), radius=7, fill=(16, 22, 30, 255), outline=(64, 74, 86, 255), width=1)
        draw.text((x0 + 18, y0 + 18), title, fill=(242, 246, 250, 255), font=bold_font, anchor="la")
        draw.text((x0 + 18, y0 + 43), sub, fill=(175, 186, 198, 255), font=tiny_font, anchor="la")

        draw.rectangle(plot, fill=(7, 10, 15, 255), outline=(85, 98, 112, 255), width=1)

        def px(f_hz: float) -> float:
            return plot[0] + (f_hz + band) / (2.0 * band) * (plot[2] - plot[0])

        def py(depth_km: float) -> float:
            return plot[1] + depth_km / max_depth * (plot[3] - plot[1])

        # Grid.
        for frac in (0.25, 0.5, 0.75):
            gx = plot[0] + frac * (plot[2] - plot[0])
            draw.line((gx, plot[1], gx, plot[3]), fill=(43, 50, 61, 180), width=1)
        for depth_tick in np.linspace(0.0, max_depth, 6):
            gy = py(float(depth_tick))
            draw.line((plot[0], gy, plot[2], gy), fill=(43, 50, 61, 180), width=1)
            draw.text((plot[0] - 8, gy), f"{depth_tick:g}", fill=(158, 168, 180, 255), font=tiny_font, anchor="rm")

        # Zero Doppler and target depth.
        zero_x = px(0.0)
        target_y = py(target_depth)
        draw.line((zero_x, plot[1], zero_x, plot[3]), fill=(225, 235, 245, 105), width=2)
        draw.line((plot[0], target_y, plot[2], target_y), fill=(90, 210, 225, 125), width=2)

        # Aliased surface point curves, positive and negative side.
        pos_pts = [(px(float(f)), py(float(d))) for f, d in zip(alias_pos, depth_values)]
        neg_pts = [(px(float(f)), py(float(d))) for f, d in zip(alias_neg, depth_values)]
        max_wrap_jump = 0.45 * (plot[2] - plot[0])
        draw_line_points(draw, pos_pts, fill=(255, 171, 76, 235), width=3, max_jump_px=max_wrap_jump)
        draw_line_points(draw, neg_pts, fill=(255, 104, 91, 235), width=3, max_jump_px=max_wrap_jump)

        # Mark the nadir subsurface echo.
        sx, sy = px(0.0), target_y
        draw.ellipse((sx - 8, sy - 8, sx + 8, sy + 8), outline=(87, 226, 236, 255), width=3)
        draw.text((sx + 10, sy - 10), "nadir subsurface", fill=(87, 226, 236, 255), font=tiny_font, anchor="la")

        # Mark the same-delay surface points at the target depth.
        f_same = summary["same_delay_doppler_hz"]
        f_alias_pos = float(alias_frequency(f_same, prf_hz))
        f_alias_neg = float(alias_frequency(-f_same, prf_hz))
        for fx in (f_alias_pos, f_alias_neg):
            cx = px(fx)
            draw.ellipse((cx - 7, sy - 7, cx + 7, sy + 7), fill=(246, 222, 90, 255))
        draw.text((plot[0] + 8, plot[1] + 8), f"observed band: +/-{band:.0f} Hz", fill=(155, 167, 180, 255), font=tiny_font, anchor="la")
        draw.text((plot[0], plot[3] + 24), "folded Doppler frequency (Hz)", fill=(175, 186, 198, 255), font=tiny_font, anchor="la")
        draw.text((plot[0] - 42, plot[1] - 6), "apparent\nice depth\n(km)", fill=(175, 186, 198, 255), font=tiny_font, anchor="ma")

        for ftick in (-band, 0.0, band):
            draw.line((px(ftick), plot[3], px(ftick), plot[3] + 6), fill=(155, 167, 180, 255), width=1)
            draw.text((px(ftick), plot[3] + 10), f"{ftick:.0f}", fill=(155, 167, 180, 255), font=tiny_font, anchor="mt")

    # Summary band.
    box = (margin, footer_top, width - margin, height - 44)
    draw.rounded_rectangle(box, radius=7, fill=(16, 22, 30, 255), outline=(64, 74, 86, 255), width=1)
    left = box[0] + 24
    top = box[1] + 22
    lines = [
        f"Inputs: h={summary['altitude_km']:.1f} km, depth={summary['target_depth_km']:.1f} km, n={summary['ice_index']:.2f}, v={summary['speed_km_s']:.1f} km/s, lambda={summary['wavelength_m']:.3g} m.",
        f"Same-delay surface point: offset={summary['surface_offset_km']:.2f} km, look angle={summary['look_angle_deg']:.2f} deg, true Doppler=+/-{summary['same_delay_doppler_hz']:.2f} Hz.",
        f"Alias starts below PRF={summary['alias_starts_below_prf_hz']:.2f} Hz; first exact zero-Doppler overlap is PRF={summary['first_zero_overlap_prf_hz']:.2f} Hz.",
        f"Current timing-limited PRF={summary['current_prf_hz']:.2f} Hz, so the same-delay clutter folds to +/-{abs(summary['current_same_delay_alias_hz']):.2f} Hz, not to zero.",
    ]
    for i, text in enumerate(lines):
        draw.text((left, top + i * 31), text, fill=(224, 231, 238, 255), font=small_font, anchor="la")

    output.parent.mkdir(parents=True, exist_ok=True)
    img.save(output)


def write_summary(path: Path, values: dict[str, float]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["metric", "value"])
        for key, value in values.items():
            writer.writerow([key, value])


def write_curve(path: Path, curve: dict[str, np.ndarray], current_prf_hz: float, zero_prf_hz: float) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(
            [
                "apparent_depth_km",
                "surface_offset_km",
                "positive_true_doppler_hz",
                "negative_true_doppler_hz",
                "positive_alias_current_prf_hz",
                "negative_alias_current_prf_hz",
                "positive_alias_zero_overlap_prf_hz",
                "negative_alias_zero_overlap_prf_hz",
            ]
        )
        for i in range(len(curve["apparent_depth_km"])):
            pos = float(curve["positive_doppler_hz"][i])
            neg = float(curve["negative_doppler_hz"][i])
            writer.writerow(
                [
                    float(curve["apparent_depth_km"][i]),
                    float(curve["surface_offset_km"][i]),
                    pos,
                    neg,
                    float(alias_frequency(pos, current_prf_hz)),
                    float(alias_frequency(neg, current_prf_hz)),
                    float(alias_frequency(pos, zero_prf_hz)),
                    float(alias_frequency(neg, zero_prf_hz)),
                ]
            )


def main() -> None:
    args = parse_args()
    wavelength_m = wavelength_from_args(args)
    geom = same_delay_geometry(
        args.altitude_km,
        args.target_depth_km,
        args.ice_index,
        args.speed_km_s,
        wavelength_m,
    )
    timing = timing_limited_prf(
        args.altitude_km,
        args.target_depth_km,
        args.ice_index,
        args.pulse_us,
        args.guard_us,
        args.dead_time_us,
        args.max_usable_prf_hz,
    )
    current_prf_hz = args.current_prf_hz if args.current_prf_hz is not None else timing["effective_prf_hz"]
    current_alias = float(alias_frequency(geom["same_delay_doppler_hz"], current_prf_hz))

    summary = {
        "altitude_km": args.altitude_km,
        "target_depth_km": args.target_depth_km,
        "ice_index": args.ice_index,
        "speed_km_s": args.speed_km_s,
        "wavelength_m": wavelength_m,
        "max_usable_prf_hz": args.max_usable_prf_hz,
        "pulse_us": args.pulse_us,
        "guard_us": args.guard_us,
        "dead_time_us": args.dead_time_us,
        **timing,
        **geom,
        "current_prf_hz": current_prf_hz,
        "current_same_delay_alias_hz": current_alias,
    }

    max_depth_km = max(args.max_depth_km, args.target_depth_km * 1.35)
    curve = surface_curve(
        args.altitude_km,
        max_depth_km,
        args.ice_index,
        args.speed_km_s,
        wavelength_m,
        max(51, args.samples),
    )

    high_prf_hz = max(4000.0, summary["alias_starts_below_prf_hz"] * 1.35)
    zero_prf_hz = summary["first_zero_overlap_prf_hz"]
    scenarios = [
        {
            "title": f"No alias example: PRF {high_prf_hz:.0f} Hz",
            "subtitle": "surface curve stays at its true Doppler",
            "prf_hz": high_prf_hz,
        },
        {
            "title": f"Current timing PRF: {current_prf_hz:.0f} Hz",
            "subtitle": "same-delay surface is aliased, but not at zero Doppler",
            "prf_hz": current_prf_hz,
        },
        {
            "title": f"First zero-overlap: PRF {zero_prf_hz:.0f} Hz",
            "subtitle": "same-delay surface clutter lands on the nadir echo",
            "prf_hz": zero_prf_hz,
        },
    ]

    render_plot(args.output, curve, scenarios, summary)
    write_summary(args.summary_csv, summary)
    write_curve(args.curve_csv, curve, current_prf_hz, zero_prf_hz)

    print(json.dumps({k: round(v, 6) for k, v in summary.items()}, indent=2))
    print(args.output)
    print(args.summary_csv)
    print(args.curve_csv)


if __name__ == "__main__":
    main()
