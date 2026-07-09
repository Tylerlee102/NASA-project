"""Render a standalone bad-PRF zero-Doppler clutter graph.

This is a cleaner version of the bottom panel from the point-target simulator.
It focuses only on the bad PRF case where same-delay flat-surface clutter folds
onto the zero-Doppler nadir subsurface target.
"""

from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "outputs" / "bad_prf_zero_doppler_clutter_graph.png"


def font(name: str, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    path = Path("C:/Windows/Fonts") / name
    if path.exists():
        return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def alias_frequency(f_hz: np.ndarray, prf_hz: float) -> np.ndarray:
    return ((f_hz + prf_hz / 2.0) % prf_hz) - prf_hz / 2.0


def surface_doppler(depth_km: np.ndarray, altitude_km: float, ice_index: float, speed_km_s: float, wavelength_m: float) -> np.ndarray:
    h_m = altitude_km * 1000.0
    path_m = h_m + ice_index * depth_km * 1000.0
    offset_m = np.sqrt(np.maximum(path_m * path_m - h_m * h_m, 0.0))
    sin_theta = np.divide(offset_m, path_m, out=np.zeros_like(offset_m), where=path_m > 0.0)
    return 2.0 * speed_km_s * 1000.0 * sin_theta / wavelength_m


def main() -> None:
    altitude_km = 25.0
    target_depth_km = 6.0
    ice_index = 1.78
    speed_km_s = 4.6
    wavelength_m = 5.0

    target_fd_hz = float(surface_doppler(np.array([target_depth_km]), altitude_km, ice_index, speed_km_s, wavelength_m)[0])
    bad_prf_hz = target_fd_hz

    depth_km = np.sort(np.unique(np.append(np.linspace(4.5, 7.5, 900), target_depth_km)))
    fd_hz = surface_doppler(depth_km, altitude_km, ice_index, speed_km_s, wavelength_m)
    alias_hz = np.abs(alias_frequency(fd_hz, bad_prf_hz))

    # A narrow zero-Doppler receiver/FFT slice: power is largest where the
    # folded surface Doppler is very close to 0 Hz.
    zero_width_hz = 8.0
    clutter = np.exp(-0.5 * (alias_hz / zero_width_hz) ** 2)
    clutter = clutter / clutter.max()

    width, height = 1100, 760
    margin_l, margin_r = 150, 90
    margin_t, margin_b = 128, 110
    plot = (margin_l, margin_t, width - margin_r, height - margin_b)

    img = Image.new("RGB", (width, height), "#081019")
    draw = ImageDraw.Draw(img, "RGBA")

    title_font = font("segoeuib.ttf", 34)
    label_font = font("segoeui.ttf", 20)
    small_font = font("segoeui.ttf", 17)
    tiny_font = font("segoeui.ttf", 14)
    bold_font = font("segoeuib.ttf", 20)

    draw.text((margin_l, 36), "Bad PRF: Surface Clutter Lands on the Target", fill=(245, 248, 252, 255), font=title_font, anchor="la")
    draw.text(
        (margin_l, 82),
        "Standalone zero-Doppler view for the flat-surface simulation.",
        fill=(188, 199, 211, 255),
        font=label_font,
        anchor="la",
    )

    draw.rectangle(plot, fill=(5, 9, 15, 255), outline=(86, 101, 118, 255), width=1)

    min_depth, max_depth = float(depth_km.min()), float(depth_km.max())

    def px(power: float) -> float:
        return plot[0] + power * (plot[2] - plot[0])

    def py(depth: float) -> float:
        return plot[1] + (depth - min_depth) / (max_depth - min_depth) * (plot[3] - plot[1])

    # Grid and depth labels.
    for depth_tick in np.arange(4.5, 7.51, 0.5):
        y = py(float(depth_tick))
        draw.line((plot[0], y, plot[2], y), fill=(42, 53, 67, 180), width=1)
        draw.text((plot[0] - 12, y), f"{depth_tick:.1f}", fill=(164, 177, 190, 255), font=tiny_font, anchor="rm")

    for power_tick in (0.0, 0.25, 0.5, 0.75, 1.0):
        x = px(power_tick)
        draw.line((x, plot[1], x, plot[3]), fill=(42, 53, 67, 135), width=1)
        draw.text((x, plot[3] + 13), f"{power_tick:.2g}", fill=(164, 177, 190, 255), font=tiny_font, anchor="mt")

    # Cyan target-depth band.
    target_y = py(target_depth_km)
    draw.rectangle((plot[0], target_y - 9, plot[2], target_y + 9), fill=(60, 211, 231, 42))
    draw.line((plot[0], target_y, plot[2], target_y), fill=(72, 221, 236, 235), width=3)
    draw.text((plot[0] + 14, target_y - 15), "6 km nadir target depth", fill=(72, 221, 236, 255), font=bold_font, anchor="la")

    # Yellow clutter curve.
    visible = clutter > 0.015
    points = [(px(float(power)), py(float(depth))) for power, depth, keep in zip(clutter, depth_km, visible) if keep]
    draw.line(points, fill=(255, 224, 64, 255), width=5)

    peak_i = int(np.argmax(clutter))
    peak_x = px(float(clutter[peak_i]))
    peak_y = py(float(depth_km[peak_i]))
    draw.ellipse((peak_x - 9, peak_y - 9, peak_x + 9, peak_y + 9), fill=(255, 224, 64, 255))
    label_x = peak_x - 330
    label_y = peak_y - 86
    draw.line((peak_x - 8, peak_y - 3, label_x + 236, label_y + 34), fill=(255, 224, 64, 230), width=2)
    draw.text((label_x, label_y), "surface clutter peak", fill=(255, 224, 64, 255), font=bold_font, anchor="la")
    draw.text((label_x, label_y + 27), "falls exactly at 6 km", fill=(255, 224, 64, 235), font=small_font, anchor="la")

    draw.text((plot[0], plot[3] + 55), "zero-Doppler surface clutter power", fill=(188, 199, 211, 255), font=small_font, anchor="la")
    draw.text((plot[0] - 92, plot[1] - 5), "apparent\nice depth\n(km)", fill=(188, 199, 211, 255), font=small_font, anchor="ma")

    note = (
        f"Bad PRF = {bad_prf_hz:.2f} Hz. At this PRF, +/-{target_fd_hz:.2f} Hz surface Doppler folds to 0 Hz, "
        "so flat-surface clutter overlaps the nadir echo."
    )
    draw.rounded_rectangle((margin_l, height - 70, width - margin_r, height - 28), radius=7, fill=(15, 22, 31, 255), outline=(66, 78, 92, 255), width=1)
    draw.text((margin_l + 16, height - 49), note, fill=(224, 232, 240, 255), font=tiny_font, anchor="la")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUTPUT)
    print(OUTPUT)


if __name__ == "__main__":
    main()
