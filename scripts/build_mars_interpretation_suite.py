"""Build interpretation-layer combinations for the Mars SHARAD radargram.

This script does not brighten or invent data. It creates interpretation sheets
that add context layers: surface pick, depth/delay and along-track axes, layer
candidate bands, clutter comparison, topography, A-scope profiles, alias-risk
zones, trace-quality strips, adaptive processing maps, candidate scores, clutter
match masks, FFT/Doppler inset, and a crossover-data availability check.
"""

from __future__ import annotations

import csv
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from adaptive_sectional_mars_readability import (
    METHODS,
    OUTPUT_ROOT,
    RETURN_CSV,
    ROOT,
    USRDR_IMG,
    box_mean,
    classify_columns,
    font,
    read_nadir_lines,
    read_usrdr_db,
    robust_db_from_power,
    robust_scale,
    save_gray,
    save_rgb,
    surface_aligned_crop,
)
from adaptive_sectional_mars_readability_v2 import (
    build_v2_display,
    suppress_depth_varying_stripes,
    tone_map,
)


DATA_DIR = ROOT / "data" / "sharad_s_01294501"
CLUTTER_IMG = DATA_DIR / "clutter_simulation" / "s_01294501_sim.img"
TRACK_CSV = OUTPUT_ROOT / "track_geometry.csv"
ALIAS_BANDS_CSV = OUTPUT_ROOT / "alias_risk_bands.csv"
ADAPTIVE_NPZ = OUTPUT_ROOT / "adaptive_sectional_readability" / "adaptive_readable_data.npz"
OUT_DIR = OUTPUT_ROOT / "interpretation_suite"

LINES = 3600
COLUMNS = 4719
COMBINED_CLUTTER_OFFSET = 135_907_200
RANGE_BIN_M = 15.0
SURFACE_ROW = 110

TOKENS = {
    "surface": "#FCFCFD",
    "panel": "#FFFFFF",
    "ink": "#1F2430",
    "muted": "#6F768A",
    "grid": "#E6E8F0",
    "axis": "#D7DBE7",
    "blue": "#5477C4",
    "gold": "#FFE15B",
    "orange": "#CC6F47",
    "olive": "#71B436",
    "pink": "#BD569B",
    "cyan": "#63B3D7",
}


def require_file(path: Path) -> None:
    if not path.exists():
        raise FileNotFoundError(path)


def read_return_table() -> dict[str, np.ndarray]:
    require_file(RETURN_CSV)
    fields: dict[str, list[float]] = {
        "column": [],
        "lon": [],
        "lat": [],
        "spacecraft_hgt": [],
        "nadir_hgt": [],
        "nadir_line": [],
        "first_line": [],
    }
    with RETURN_CSV.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            fields["column"].append(float(row["Column"]) - 1)
            fields["lon"].append(float(row["SpacecraftLon"]))
            fields["lat"].append(float(row["SpacecraftLat"]))
            fields["spacecraft_hgt"].append(float(row["SpacecraftHgt"]))
            fields["nadir_hgt"].append(float(row["NadirHgt"]))
            fields["nadir_line"].append(float(row["NadirLine"]))
            fields["first_line"].append(float(row["FirstLine"]))
    return {key: np.asarray(value, dtype=np.float32) for key, value in fields.items()}


def cumulative_distance_km(lat_deg: np.ndarray, lon_deg: np.ndarray) -> np.ndarray:
    radius_km = 3389.5
    lat = np.deg2rad(lat_deg.astype(np.float64))
    lon = np.deg2rad(lon_deg.astype(np.float64))
    dlat = np.diff(lat)
    dlon = np.diff(lon)
    a = np.sin(dlat / 2) ** 2 + np.cos(lat[:-1]) * np.cos(lat[1:]) * np.sin(dlon / 2) ** 2
    c = 2 * np.arctan2(np.sqrt(np.maximum(a, 0)), np.sqrt(np.maximum(1 - a, 0)))
    dist = np.concatenate([[0.0], np.cumsum(radius_km * c)])
    return dist.astype(np.float32)


def read_combined_clutter_db() -> np.ndarray:
    require_file(CLUTTER_IMG)
    data = np.memmap(CLUTTER_IMG, dtype="<f4", mode="r", offset=COMBINED_CLUTTER_OFFSET, shape=(LINES, COLUMNS))
    return robust_db_from_power(np.asarray(data, dtype=np.float32))


def load_alias_bands() -> list[dict[str, float]]:
    if not ALIAS_BANDS_CSV.exists():
        return []
    rows: list[dict[str, float]] = []
    with ALIAS_BANDS_CSV.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            rows.append({key: float(value) for key, value in row.items()})
    return rows


def load_method_and_score(crop: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    if ADAPTIVE_NPZ.exists():
        data = np.load(ADAPTIVE_NPZ)
        return data["method"].astype(np.int16), data["problem_score"].astype(np.float32)
    diagnostics = classify_columns(crop, above_surface=SURFACE_ROW)
    return diagnostics["method"].astype(np.int16), diagnostics["score"].astype(np.float32)


def color_to_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def panel_from_array(display: np.ndarray, width: int, height: int) -> Image.Image:
    if display.ndim == 2:
        image = Image.fromarray(np.uint8(np.clip(display, 0, 1) * 255), mode="L").convert("RGBA")
    else:
        image = Image.fromarray(np.uint8(np.clip(display, 0, 1) * 255), mode="RGB").convert("RGBA")
    return image.resize((width, height), Image.Resampling.BILINEAR)


def data_to_panel(x: float, y: float, data_shape: tuple[int, int], width: int, height: int) -> tuple[int, int]:
    rows, cols = data_shape
    px = int(round(np.clip(x / max(cols - 1, 1), 0.0, 1.0) * (width - 1)))
    py = int(round(np.clip(y / max(rows - 1, 1), 0.0, 1.0) * (height - 1)))
    return px, py


def smooth_vector(values: np.ndarray, radius: int) -> np.ndarray:
    if radius <= 0:
        return values.astype(np.float32, copy=True)
    padded = np.pad(values.astype(np.float32), (radius, radius), mode="edge")
    kernel = np.ones(radius * 2 + 1, dtype=np.float32) / float(radius * 2 + 1)
    return np.convolve(padded, kernel, mode="valid").astype(np.float32)


def draw_polyline_data(
    overlay: Image.Image,
    points: list[tuple[float, float]],
    data_shape: tuple[int, int],
    color: tuple[int, int, int, int],
    width: int,
) -> None:
    if len(points) < 2:
        return
    draw = ImageDraw.Draw(overlay, "RGBA")
    panel_points = [data_to_panel(x, y, data_shape, overlay.width, overlay.height) for x, y in points]
    draw.line(panel_points, fill=color, width=width, joint="curve")


def draw_surface_and_axes(
    panel: Image.Image,
    data_shape: tuple[int, int],
    distance_km: np.ndarray,
    *,
    show_depth: bool = True,
    show_along_track: bool = True,
) -> None:
    draw = ImageDraw.Draw(panel, "RGBA")
    small = font("segoeui.ttf", 12)
    bold = font("segoeuib.ttf", 12)
    rows, cols = data_shape
    _, y_surface = data_to_panel(0, SURFACE_ROW, data_shape, panel.width, panel.height)
    draw.line((0, y_surface, panel.width, y_surface), fill=(255, 225, 80, 230), width=2)
    draw.text((8, max(2, y_surface - 18)), "surface pick", fill=(255, 235, 115, 255), font=bold)

    if show_depth:
        ticks_m = [0, 1500, 3000, 4500, 6000, 9000]
        for meters in ticks_m:
            row = SURFACE_ROW + meters / RANGE_BIN_M
            if row < 0 or row >= rows:
                continue
            _, y = data_to_panel(0, row, data_shape, panel.width, panel.height)
            draw.line((0, y, 16, y), fill=(255, 255, 255, 180), width=1)
            label = "0 m" if meters == 0 else f"{meters/1000:.1f} km"
            draw.text((20, y - 7), label, fill=(255, 255, 255, 210), font=small)
        draw.text((10, panel.height - 24), "approx range below surface", fill=(255, 255, 255, 190), font=small)

    if show_along_track and distance_km.size:
        for frac in [0.0, 0.25, 0.5, 0.75, 1.0]:
            col = frac * (cols - 1)
            x, _ = data_to_panel(col, rows - 1, data_shape, panel.width, panel.height)
            idx = min(int(round(col)), distance_km.size - 1)
            draw.line((x, panel.height - 15, x, panel.height), fill=(255, 255, 255, 170), width=1)
            draw.text((x + 3, panel.height - 34), f"{distance_km[idx]:.0f} km", fill=(255, 255, 255, 200), font=small)


def draw_alias_risk(panel: Image.Image, alias_bands: list[dict[str, float]], data_shape: tuple[int, int]) -> None:
    if not alias_bands:
        return
    overlay = Image.new("RGBA", panel.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay, "RGBA")
    small = font("segoeuib.ttf", 12)
    for band in alias_bands:
        y0_row = SURFACE_ROW + band["offset_line_start"]
        y1_row = SURFACE_ROW + band["offset_line_end"]
        _, y0 = data_to_panel(0, y0_row - 8, data_shape, panel.width, panel.height)
        _, y1 = data_to_panel(0, y1_row + 8, data_shape, panel.width, panel.height)
        draw.rectangle((0, min(y0, y1), panel.width, max(y0, y1)), fill=(204, 111, 59, 52))
        draw.text((panel.width - 228, min(y0, y1) + 2), "Doppler alias-risk band", fill=(255, 208, 170, 240), font=small)
    panel.alpha_composite(overlay)


def make_trace_strip(method: np.ndarray, score: np.ndarray, width: int, height: int) -> Image.Image:
    strip = Image.new("RGB", (width, height), color_to_rgb(TOKENS["panel"]))
    draw = ImageDraw.Draw(strip, "RGBA")
    cols = method.size
    method_h = max(10, height // 2)
    for x in range(width):
        col0 = int(x / max(width - 1, 1) * (cols - 1))
        code = int(method[col0])
        color = METHODS.get(code, METHODS[0])["color"]
        draw.line((x, 0, x, method_h), fill=(*color, 255), width=1)
    score_scaled = robust_scale(score[np.newaxis, :], 1.0, 99.5)[0]
    for x in range(width):
        col0 = int(x / max(width - 1, 1) * (cols - 1))
        shade = int(np.clip(score_scaled[col0], 0, 1) * 255)
        draw.line((x, method_h + 1, x, height), fill=(shade, shade, shade, 255), width=1)
    draw.rectangle((0, 0, width - 1, height - 1), outline=(210, 214, 224, 255), width=1)
    return strip


def ridge_score(conditioned: np.ndarray) -> np.ndarray:
    short = box_mean(conditioned, radius_y=1, radius_x=11)
    broad = box_mean(conditioned, radius_y=15, radius_x=69)
    ridge = np.maximum(short - broad, 0.0)
    ridge = box_mean(ridge, radius_y=0, radius_x=13)
    return robust_scale(ridge, low_pct=66.0, high_pct=99.7)


def detect_layer_candidates(
    radar_ridge: np.ndarray,
    clutter_match: np.ndarray,
    *,
    x_step: int = 10,
) -> list[dict[str, object]]:
    windows = [
        ("A", 135, 250, "shallow"),
        ("B", 250, 390, "middle"),
        ("C", 390, 565, "deep"),
        ("D", 565, 760, "very deep"),
    ]
    candidates: list[dict[str, object]] = []
    cols = radar_ridge.shape[1]
    xs = np.arange(0, cols, x_step, dtype=np.float32)
    for label, y0, y1, zone in windows:
        rows = []
        strengths = []
        clutter_values = []
        for x in xs.astype(int):
            col0 = max(0, x - x_step)
            col1 = min(cols, x + x_step + 1)
            profile = np.mean(radar_ridge[y0:y1, col0:col1], axis=1)
            row = int(np.argmax(profile)) + y0
            rows.append(row)
            strengths.append(float(np.max(profile)))
            clutter_values.append(float(np.mean(clutter_match[max(0, row - 5) : min(radar_ridge.shape[0], row + 6), col0:col1])))
        row_arr = smooth_vector(np.asarray(rows, dtype=np.float32), radius=6)
        slopes = np.abs(np.diff(row_arr))
        continuity = float(1.0 / (1.0 + np.median(slopes) / max(x_step, 1)))
        strength = float(np.mean(strengths))
        clutter_overlap = float(np.mean(clutter_values))
        confidence = float(np.clip(0.58 * strength + 0.30 * continuity + 0.12 * (1.0 - clutter_overlap), 0.0, 1.0))
        if confidence >= 0.63 and clutter_overlap < 0.55:
            status = "strong candidate"
        elif confidence >= 0.50:
            status = "uncertain candidate"
        elif clutter_overlap >= 0.52:
            status = "likely clutter/artifact"
        else:
            status = "weak candidate"
        candidates.append(
            {
                "label": label,
                "zone": zone,
                "x": xs.tolist(),
                "row": row_arr.tolist(),
                "mean_range_below_surface_m": float((np.mean(row_arr) - SURFACE_ROW) * RANGE_BIN_M),
                "strength": strength,
                "continuity": continuity,
                "clutter_overlap": clutter_overlap,
                "confidence": confidence,
                "status": status,
            }
        )
    return candidates


def candidate_color(candidate: dict[str, object]) -> tuple[int, int, int, int]:
    status = str(candidate["status"])
    if "strong" in status:
        return (113, 180, 54, 235)
    if "clutter" in status:
        return (204, 111, 59, 235)
    if "uncertain" in status:
        return (255, 225, 91, 230)
    return (84, 119, 196, 220)


def draw_candidates(
    panel: Image.Image,
    candidates: list[dict[str, object]],
    data_shape: tuple[int, int],
    *,
    bands: bool = True,
    lines: bool = True,
) -> None:
    overlay = Image.new("RGBA", panel.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay, "RGBA")
    label_font = font("segoeuib.ttf", 13)
    for candidate in candidates:
        points = list(zip(candidate["x"], candidate["row"]))
        color = candidate_color(candidate)
        if bands:
            upper = [(x, y - 12) for x, y in points]
            lower = [(x, y + 12) for x, y in reversed(points)]
            poly = [data_to_panel(x, y, data_shape, overlay.width, overlay.height) for x, y in upper + lower]
            draw.polygon(poly, fill=(color[0], color[1], color[2], 42))
        if lines:
            draw_polyline_data(overlay, points, data_shape, color, width=3)
        if points:
            x0, y0 = data_to_panel(points[0][0] + 30, points[0][1], data_shape, overlay.width, overlay.height)
            draw.text((x0, y0 - 18), f"{candidate['label']} {candidate['status']}", fill=color, font=label_font)
    panel.alpha_composite(overlay)


def draw_clutter_match_mask(panel: Image.Image, clutter_match: np.ndarray, data_shape: tuple[int, int]) -> None:
    mask = box_mean(clutter_match.astype(np.float32), radius_y=3, radius_x=13)
    overlay_arr = np.zeros((data_shape[0], data_shape[1], 4), dtype=np.uint8)
    alpha = np.clip((mask - 0.38) / 0.62, 0, 1) * 95
    overlay_arr[..., 0] = 204
    overlay_arr[..., 1] = 111
    overlay_arr[..., 2] = 59
    overlay_arr[..., 3] = alpha.astype(np.uint8)
    overlay = Image.fromarray(overlay_arr, mode="RGBA").resize(panel.size, Image.Resampling.BILINEAR)
    panel.alpha_composite(overlay)


def make_radargram_panel(
    display: np.ndarray,
    width: int,
    height: int,
    distance_km: np.ndarray,
    candidates: list[dict[str, object]] | None = None,
    alias_bands: list[dict[str, float]] | None = None,
    clutter_match: np.ndarray | None = None,
    *,
    show_axes: bool = True,
    show_candidates: bool = True,
    show_alias: bool = False,
    show_clutter: bool = False,
) -> Image.Image:
    panel = panel_from_array(display, width, height)
    data_shape = display.shape[:2]
    if show_alias and alias_bands:
        draw_alias_risk(panel, alias_bands, data_shape)
    if show_clutter and clutter_match is not None:
        draw_clutter_match_mask(panel, clutter_match, data_shape)
    if show_candidates and candidates:
        draw_candidates(panel, candidates, data_shape, bands=True, lines=True)
    if show_axes:
        draw_surface_and_axes(panel, data_shape, distance_km)
    return panel.convert("RGB")


def plot_line_panel(
    values: np.ndarray,
    width: int,
    height: int,
    title: str,
    subtitle: str,
    *,
    x_values: np.ndarray | None = None,
    y_label: str = "",
    color: tuple[int, int, int] = (84, 119, 196),
) -> Image.Image:
    canvas = Image.new("RGB", (width, height), TOKENS["panel"])
    draw = ImageDraw.Draw(canvas, "RGBA")
    title_font = font("segoeuib.ttf", 15)
    small = font("segoeui.ttf", 12)
    draw.text((14, 10), title, fill=color_to_rgb(TOKENS["ink"]), font=title_font)
    draw.text((14, 32), subtitle, fill=color_to_rgb(TOKENS["muted"]), font=small)
    box = (52, 62, width - 22, height - 34)
    draw.rectangle(box, outline=color_to_rgb(TOKENS["axis"]), width=1)
    if values.size < 2:
        return canvas
    x = np.arange(values.size, dtype=np.float32) if x_values is None else x_values.astype(np.float32)
    y = values.astype(np.float32)
    finite = np.isfinite(y)
    if not np.any(finite):
        return canvas
    ymin, ymax = np.percentile(y[finite], [2, 98])
    if ymax <= ymin:
        ymax = ymin + 1.0
    xmin, xmax = float(np.nanmin(x)), float(np.nanmax(x))
    if xmax <= xmin:
        xmax = xmin + 1.0
    x0, y0, x1, y1 = box
    for frac in [0.25, 0.5, 0.75]:
        yy = y0 + frac * (y1 - y0)
        draw.line((x0, yy, x1, yy), fill=(230, 232, 238, 255), width=1)
    pts = []
    step = max(1, values.size // 1000)
    for xi, yi in zip(x[::step], y[::step]):
        px = x0 + (float(xi) - xmin) / (xmax - xmin) * (x1 - x0)
        py = y1 - (float(np.clip(yi, ymin, ymax)) - ymin) / (ymax - ymin) * (y1 - y0)
        pts.append((px, py))
    if len(pts) > 1:
        draw.line(pts, fill=(*color, 255), width=2)
    if y_label:
        draw.text((8, y0 + (y1 - y0) // 2), y_label, fill=color_to_rgb(TOKENS["muted"]), font=small)
    draw.rectangle((0, 0, width - 1, height - 1), outline=(210, 214, 224), width=1)
    return canvas


def make_groundtrack_panel(return_table: dict[str, np.ndarray], width: int, height: int) -> Image.Image:
    lon = return_table["lon"].astype(np.float32)
    lat = return_table["lat"].astype(np.float32)
    canvas = Image.new("RGB", (width, height), TOKENS["panel"])
    draw = ImageDraw.Draw(canvas, "RGBA")
    title_font = font("segoeuib.ttf", 15)
    small = font("segoeui.ttf", 12)
    draw.text((14, 10), "Ground-track map", fill=color_to_rgb(TOKENS["ink"]), font=title_font)
    draw.text((14, 32), "Orbit path in spacecraft lon/lat.", fill=color_to_rgb(TOKENS["muted"]), font=small)
    box = (38, 58, width - 24, height - 26)
    draw.rectangle(box, outline=color_to_rgb(TOKENS["axis"]), width=1)
    lon_min, lon_max = float(np.nanmin(lon)), float(np.nanmax(lon))
    lat_min, lat_max = float(np.nanmin(lat)), float(np.nanmax(lat))
    if lon_max <= lon_min:
        lon_max = lon_min + 1
    if lat_max <= lat_min:
        lat_max = lat_min + 1
    pts = []
    step = max(1, lon.size // 900)
    for lo, la in zip(lon[::step], lat[::step]):
        x = box[0] + (float(lo) - lon_min) / (lon_max - lon_min) * (box[2] - box[0])
        y = box[3] - (float(la) - lat_min) / (lat_max - lat_min) * (box[3] - box[1])
        pts.append((x, y))
    if len(pts) > 1:
        draw.line(pts, fill=(*color_to_rgb(TOKENS["blue"]), 255), width=3)
        draw.ellipse((pts[0][0] - 4, pts[0][1] - 4, pts[0][0] + 4, pts[0][1] + 4), fill=(*color_to_rgb(TOKENS["olive"]), 255))
        draw.ellipse((pts[-1][0] - 4, pts[-1][1] - 4, pts[-1][0] + 4, pts[-1][1] + 4), fill=(*color_to_rgb(TOKENS["orange"]), 255))
    draw.text((box[0], height - 22), f"lon {lon_min:.1f} to {lon_max:.1f}, lat {lat_min:.1f} to {lat_max:.1f}", fill=color_to_rgb(TOKENS["muted"]), font=small)
    return canvas


def make_ascope_panel(
    radar_crop: np.ndarray,
    clutter_crop: np.ndarray,
    candidates: list[dict[str, object]],
    selected_cols: list[int],
    width: int,
    height: int,
) -> Image.Image:
    canvas = Image.new("RGB", (width, height), TOKENS["panel"])
    draw = ImageDraw.Draw(canvas, "RGBA")
    title_font = font("segoeuib.ttf", 15)
    small = font("segoeui.ttf", 11)
    draw.text((14, 10), "A-scope profiles", fill=color_to_rgb(TOKENS["ink"]), font=title_font)
    draw.text((14, 31), "Vertical power at selected traces. Blue=data, orange=clutter.", fill=color_to_rgb(TOKENS["muted"]), font=small)
    panel_w = (width - 44) // len(selected_cols)
    y0, y1 = 62, height - 28
    row_start, row_end = 80, 820
    for idx, col in enumerate(selected_cols):
        x0 = 18 + idx * panel_w
        x1 = x0 + panel_w - 10
        draw.rectangle((x0, y0, x1, y1), outline=color_to_rgb(TOKENS["axis"]), width=1)
        data_profile = robust_scale(radar_crop[row_start:row_end, col], 1, 99.5)
        clutter_profile = robust_scale(clutter_crop[row_start:row_end, col], 1, 99.5)
        rows = np.arange(row_start, row_end)
        for prof, color in [(data_profile, color_to_rgb(TOKENS["blue"])), (clutter_profile, color_to_rgb(TOKENS["orange"]))]:
            pts = []
            for value, row in zip(prof[::4], rows[::4]):
                x = x0 + 4 + float(value) * (x1 - x0 - 8)
                y = y0 + (row - row_start) / max(row_end - row_start - 1, 1) * (y1 - y0)
                pts.append((x, y))
            if len(pts) > 1:
                draw.line(pts, fill=(*color, 220), width=2)
        for cand in candidates:
            row = np.interp(col, np.asarray(cand["x"], dtype=np.float32), np.asarray(cand["row"], dtype=np.float32))
            if row_start <= row <= row_end:
                y = y0 + (row - row_start) / max(row_end - row_start - 1, 1) * (y1 - y0)
                draw.line((x0, y, x1, y), fill=candidate_color(cand), width=1)
        draw.text((x0 + 2, y1 + 5), f"trace {col}", fill=color_to_rgb(TOKENS["muted"]), font=small)
    return canvas


def make_fft_panel(radar_display: np.ndarray, width: int, height: int) -> Image.Image:
    region = radar_display[130:790].astype(np.float32)
    region = region - np.mean(region, axis=1, keepdims=True)
    window = np.hanning(region.shape[1]).astype(np.float32)
    spectrum = np.fft.fftshift(np.fft.fft(region * window[np.newaxis, :], axis=1), axes=1)
    power = np.mean(np.abs(spectrum) ** 2, axis=0)
    power_db = 10 * np.log10(np.maximum(power, np.percentile(power[power > 0], 0.1)))
    power_db = power_db - np.max(power_db)
    freq = np.fft.fftshift(np.fft.fftfreq(region.shape[1], d=1.0)).astype(np.float32)
    return plot_line_panel(power_db.astype(np.float32), width, height, "FFT/Doppler inset", "Along-track spectrum from displayed radargram.", x_values=freq, y_label="dB", color=color_to_rgb(TOKENS["pink"]))


def make_candidate_table_panel(candidates: list[dict[str, object]], width: int, height: int) -> Image.Image:
    canvas = Image.new("RGB", (width, height), TOKENS["panel"])
    draw = ImageDraw.Draw(canvas, "RGBA")
    title_font = font("segoeuib.ttf", 15)
    small = font("segoeui.ttf", 12)
    mono = font("consola.ttf", 12)
    draw.text((14, 10), "Candidate reflector score", fill=color_to_rgb(TOKENS["ink"]), font=title_font)
    draw.text((14, 32), "Scores combine brightness, continuity, and clutter overlap.", fill=color_to_rgb(TOKENS["muted"]), font=small)
    headers = ["ID", "zone", "range", "score", "clutter", "status"]
    x_cols = [14, 52, 142, 232, 300, 382]
    y = 66
    for x, h in zip(x_cols, headers):
        draw.text((x, y), h, fill=color_to_rgb(TOKENS["muted"]), font=small)
    y += 24
    for cand in candidates:
        values = [
            str(cand["label"]),
            str(cand["zone"]),
            f"{cand['mean_range_below_surface_m']/1000:.1f} km",
            f"{cand['confidence']:.2f}",
            f"{cand['clutter_overlap']:.2f}",
            str(cand["status"]),
        ]
        for x, value in zip(x_cols, values):
            draw.text((x, y), value, fill=candidate_color(cand), font=mono if x in x_cols[:5] else small)
        y += 27
    draw.rectangle((0, 0, width - 1, height - 1), outline=(210, 214, 224), width=1)
    return canvas


def make_status_panel(width: int, height: int) -> Image.Image:
    canvas = Image.new("RGB", (width, height), TOKENS["panel"])
    draw = ImageDraw.Draw(canvas, "RGBA")
    title_font = font("segoeuib.ttf", 15)
    body = font("segoeui.ttf", 12)
    draw.text((14, 10), "Crossover / nearby-orbit check", fill=color_to_rgb(TOKENS["ink"]), font=title_font)
    lines = [
        "Status: not available in the current local dataset.",
        "Only S_01294501 is loaded, so this panel cannot confirm",
        "whether the same candidate layers appear in another orbit.",
        "",
        "Best next evidence: add a nearby or crossing SHARAD orbit",
        "and re-run this sheet to compare candidate depth/range.",
    ]
    y = 38
    for line in lines:
        color = color_to_rgb(TOKENS["orange"]) if line.startswith("Status") else color_to_rgb(TOKENS["muted"])
        draw.text((14, y), line, fill=color, font=body)
        y += 21
    draw.rectangle((0, 0, width - 1, height - 1), outline=(210, 214, 224), width=1)
    return canvas


def paste_labeled(canvas: Image.Image, panel: Image.Image, xy: tuple[int, int], title: str, subtitle: str = "") -> None:
    x, y = xy
    draw = ImageDraw.Draw(canvas, "RGBA")
    title_font = font("segoeuib.ttf", 15)
    small = font("segoeui.ttf", 12)
    canvas.paste(panel, (x, y))
    draw.rectangle((x, y, x + panel.width - 1, y + panel.height - 1), outline=(210, 214, 224, 255), width=1)
    draw.text((x, y + panel.height + 7), title, fill=color_to_rgb(TOKENS["ink"]), font=title_font)
    if subtitle:
        draw.text((x, y + panel.height + 28), subtitle, fill=color_to_rgb(TOKENS["muted"]), font=small)


def render_interpretation_sheet(
    path: Path,
    title: str,
    subtitle: str,
    panels: list[tuple[Image.Image, str, str]],
    *,
    columns: int = 2,
) -> None:
    width = 1800
    margin = 22
    header_h = 94
    label_h = 52
    panel_w = (width - margin * (columns + 1)) // columns
    rows = math.ceil(len(panels) / columns)
    panel_h = max(panel.height for panel, _, _ in panels)
    height = header_h + rows * (panel_h + label_h + margin) + margin
    canvas = Image.new("RGB", (width, height), TOKENS["surface"])
    draw = ImageDraw.Draw(canvas, "RGBA")
    title_font = font("segoeuib.ttf", 26)
    body_font = font("segoeui.ttf", 14)
    draw.text((margin, 18), title, fill=color_to_rgb(TOKENS["ink"]), font=title_font)
    draw.text((margin, 54), subtitle, fill=color_to_rgb(TOKENS["muted"]), font=body_font)
    for idx, (panel, label, note) in enumerate(panels):
        col = idx % columns
        row = idx // columns
        x = margin + col * (panel_w + margin)
        y = header_h + margin + row * (panel_h + label_h + margin)
        if panel.width != panel_w or panel.height != panel_h:
            panel = panel.resize((panel_w, panel_h), Image.Resampling.BILINEAR)
        paste_labeled(canvas, panel, (x, y), label, note)
    path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(path)


def render_best_combo_sheet(
    path: Path,
    radar_panel: Image.Image,
    clutter_panel: Image.Image,
    topography_panel: Image.Image,
    table_panel: Image.Image,
    strip: Image.Image,
    status_panel: Image.Image,
) -> None:
    width = 1900
    height = 1420
    margin = 24
    canvas = Image.new("RGB", (width, height), TOKENS["surface"])
    draw = ImageDraw.Draw(canvas, "RGBA")
    title_font = font("segoeuib.ttf", 28)
    body_font = font("segoeui.ttf", 14)
    label_font = font("segoeuib.ttf", 15)
    draw.text((margin, 18), "Recommended interpretation combination", fill=color_to_rgb(TOKENS["ink"]), font=title_font)
    draw.text(
        (margin, 58),
        "Best balance: annotated radargram, clutter comparison, topography, confidence strip, candidate table, and crossover status.",
        fill=color_to_rgb(TOKENS["muted"]),
        font=body_font,
    )
    canvas.paste(radar_panel.resize((1240, 720), Image.Resampling.BILINEAR), (margin, 100))
    draw.text((margin, 832), "Annotated radargram: surface, axes, uncertainty bands, clutter-match mask, and alias-risk band", fill=color_to_rgb(TOKENS["ink"]), font=label_font)
    canvas.paste(clutter_panel.resize((590, 345), Image.Resampling.BILINEAR), (1286, 100))
    draw.text((1286, 456), "Cluttergram comparison", fill=color_to_rgb(TOKENS["ink"]), font=label_font)
    canvas.paste(topography_panel.resize((590, 205), Image.Resampling.BILINEAR), (1286, 506))
    canvas.paste(strip.resize((1240, 58), Image.Resampling.NEAREST), (margin, 880))
    draw.text((margin, 948), "Top strip = adaptive processing class. Bottom strip = trace problem score.", fill=color_to_rgb(TOKENS["muted"]), font=body_font)
    canvas.paste(table_panel.resize((880, 250), Image.Resampling.BILINEAR), (margin, 1000))
    canvas.paste(status_panel.resize((590, 250), Image.Resampling.BILINEAR), (1286, 1000))
    draw.text(
        (margin, 1292),
        "This combination is the best for discussion: it adds interpretation evidence without hiding which parts are uncertain.",
        fill=color_to_rgb(TOKENS["orange"]),
        font=body_font,
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(path)


def write_candidate_csv(path: Path, candidates: list[dict[str, object]]) -> None:
    rows = []
    for cand in candidates:
        rows.append(
            {
                "candidate": cand["label"],
                "zone": cand["zone"],
                "mean_range_below_surface_m": f"{cand['mean_range_below_surface_m']:.1f}",
                "strength": f"{cand['strength']:.4f}",
                "continuity": f"{cand['continuity']:.4f}",
                "clutter_overlap": f"{cand['clutter_overlap']:.4f}",
                "confidence": f"{cand['confidence']:.4f}",
                "status": cand["status"],
            }
        )
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def write_scorecard(path: Path) -> list[dict[str, object]]:
    rows = [
        {
            "combination": "Common foundation",
            "layers": "surface, depth axis, along-track axis, topography, layer bands",
            "readability_score": 9,
            "evidence_score": 6,
            "complexity_score": 2,
            "recommendation": "Good first figure.",
        },
        {
            "combination": "Clutter and Doppler check",
            "layers": "cluttergram, clutter-match mask, alias-risk overlay, A-scope, FFT inset",
            "readability_score": 7,
            "evidence_score": 9,
            "complexity_score": 6,
            "recommendation": "Best for explaining the problem.",
        },
        {
            "combination": "Processing confidence",
            "layers": "trace-quality strip, adaptive map, confidence labels, before/after",
            "readability_score": 8,
            "evidence_score": 7,
            "complexity_score": 5,
            "recommendation": "Best for proving you did not hide bad data.",
        },
        {
            "combination": "Everything on",
            "layers": "all 18 interpretation items",
            "readability_score": 5,
            "evidence_score": 10,
            "complexity_score": 9,
            "recommendation": "Useful as an audit sheet, too busy as a main figure.",
        },
        {
            "combination": "Recommended balanced",
            "layers": "surface, axes, layer bands, clutter mask, alias risk, topography, confidence strip, candidate table",
            "readability_score": 9,
            "evidence_score": 9,
            "complexity_score": 4,
            "recommendation": "Best main presentation figure.",
        },
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    return rows


def make_scorecard_panel(rows: list[dict[str, object]], width: int, height: int) -> Image.Image:
    canvas = Image.new("RGB", (width, height), TOKENS["panel"])
    draw = ImageDraw.Draw(canvas, "RGBA")
    title_font = font("segoeuib.ttf", 15)
    small = font("segoeui.ttf", 12)
    mono = font("consola.ttf", 12)
    draw.text((14, 10), "Combination scorecard", fill=color_to_rgb(TOKENS["ink"]), font=title_font)
    draw.text((14, 32), "Higher readability/evidence is better. Lower complexity is better.", fill=color_to_rgb(TOKENS["muted"]), font=small)
    y = 65
    for row in rows:
        draw.text((14, y), str(row["combination"]), fill=color_to_rgb(TOKENS["ink"]), font=small)
        score = f"R {row['readability_score']}  E {row['evidence_score']}  C {row['complexity_score']}"
        draw.text((250, y), score, fill=color_to_rgb(TOKENS["blue"]), font=mono)
        draw.text((390, y), str(row["recommendation"]), fill=color_to_rgb(TOKENS["muted"]), font=small)
        y += 30
    draw.rectangle((0, 0, width - 1, height - 1), outline=(210, 214, 224), width=1)
    return canvas


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    return_table = read_return_table()
    distance_km = cumulative_distance_km(return_table["lat"], return_table["lon"])
    nadir_lines = read_nadir_lines()

    raw_db = read_usrdr_db()
    radar_crop_db = surface_aligned_crop(raw_db, nadir_lines, above=SURFACE_ROW, below=990)
    clutter_db = read_combined_clutter_db()
    clutter_crop_db = surface_aligned_crop(clutter_db, nadir_lines, above=SURFACE_ROW, below=990)
    alias_bands = load_alias_bands()
    method, score = load_method_and_score(radar_crop_db)

    v2_display, _, confidence, _ = build_v2_display(radar_crop_db, method)
    conditioned = suppress_depth_varying_stripes(radar_crop_db)
    radar_ridge = ridge_score(conditioned)
    clutter_display = tone_map(robust_scale(clutter_crop_db, 1.0, 99.8), gamma=0.86)
    clutter_ridge = ridge_score(clutter_crop_db)
    clutter_match = ((radar_ridge > np.percentile(radar_ridge, 91.5)) & (clutter_ridge > np.percentile(clutter_ridge, 90.0))).astype(np.float32)
    candidates = detect_layer_candidates(radar_ridge, clutter_match)

    # Component panels.
    radar_common = make_radargram_panel(v2_display, 1200, 540, distance_km, candidates, alias_bands, clutter_match, show_alias=False, show_clutter=False)
    radar_clutter = make_radargram_panel(v2_display, 1200, 540, distance_km, candidates, alias_bands, clutter_match, show_alias=True, show_clutter=True)
    radar_all = make_radargram_panel(v2_display, 1200, 540, distance_km, candidates, alias_bands, clutter_match, show_alias=True, show_clutter=True)
    original_panel = make_radargram_panel(robust_scale(radar_crop_db, 1.0, 99.85), 1200, 540, distance_km, [], alias_bands, None, show_candidates=False)
    clutter_panel = make_radargram_panel(clutter_display, 1200, 540, distance_km, [], [], None, show_candidates=False)
    topography_panel = plot_line_panel(return_table["nadir_hgt"], 650, 220, "Topography context", "Nadir MOLA height along track.", x_values=distance_km, y_label="m", color=color_to_rgb(TOKENS["olive"]))
    groundtrack_panel = make_groundtrack_panel(return_table, 650, 320)
    ascope_panel = make_ascope_panel(radar_crop_db, clutter_crop_db, candidates, [900, 1900, 2700, 3600], 650, 320)
    fft_panel = make_fft_panel(v2_display, 650, 260)
    table_panel = make_candidate_table_panel(candidates, 650, 230)
    status_panel = make_status_panel(650, 230)
    trace_strip = make_trace_strip(method, score, 1200, 70)

    # Save atomic output panels.
    save_gray(OUT_DIR / "v2_interpretation_base.png", v2_display)
    save_gray(OUT_DIR / "cluttergram_surface_aligned.png", clutter_display)
    save_rgb(OUT_DIR / "trace_quality_and_adaptive_map.png", np.asarray(trace_strip.resize((COLUMNS, 90), Image.Resampling.NEAREST), dtype=np.float32) / 255.0)
    np.savez_compressed(
        OUT_DIR / "interpretation_layers_data.npz",
        v2_display=v2_display.astype(np.float32),
        radar_ridge=radar_ridge.astype(np.float32),
        clutter_display=clutter_display.astype(np.float32),
        clutter_ridge=clutter_ridge.astype(np.float32),
        clutter_match=clutter_match.astype(np.float32),
        confidence=confidence.astype(np.float32),
        method=method.astype(np.int16),
        problem_score=score.astype(np.float32),
    )

    # Sheets.
    common_path = OUT_DIR / "01_common_foundation_sheet.png"
    render_interpretation_sheet(
        common_path,
        "Common interpretation foundation",
        "Surface pick, depth/delay axis, along-track distance, layer uncertainty bands, topography, A-scopes, and ground track.",
        [
            (radar_common, "Annotated radargram", "Surface, axes, and candidate uncertainty bands."),
            (topography_panel, "Topography", "Terrain height context along the orbit."),
            (ascope_panel, "A-scope profiles", "Vertical power checks at selected traces."),
            (groundtrack_panel, "Ground track", "Location context for the orbit."),
        ],
    )

    clutter_path = OUT_DIR / "02_clutter_doppler_sheet.png"
    render_interpretation_sheet(
        clutter_path,
        "Clutter and Doppler interpretation check",
        "Real radargram vs simulated clutter, clutter-match mask, Doppler alias-risk band, A-scope profiles, and FFT inset.",
        [
            (radar_clutter, "Radargram with risk overlays", "Orange haze = clutter match; horizontal band = alias risk."),
            (clutter_panel, "Surface clutter simulation", "Features seen here are less likely to be subsurface."),
            (ascope_panel, "A-scope profiles", "Data and clutter profiles compared trace by trace."),
            (fft_panel, "FFT/Doppler inset", "Along-track frequency structure in the displayed radargram."),
        ],
    )

    processing_path = OUT_DIR / "03_processing_confidence_sheet.png"
    render_interpretation_sheet(
        processing_path,
        "Processing confidence sheet",
        "Before/after interpretation view, trace-quality strip, adaptive processing map, candidate score table, and crossover status.",
        [
            (original_panel, "Original surface-aligned radargram", "Raw display with surface and axes only."),
            (radar_clutter, "Interpreted radargram", "Candidate bands plus risk overlays."),
            (trace_strip.resize((1200, 180), Image.Resampling.NEAREST), "Trace-quality and adaptive map", "Top=color class. Bottom=problem score."),
            (table_panel, "Candidate score table", "How each picked reflector is classified."),
            (status_panel, "Crossover check", "Flags the missing nearby-orbit evidence."),
        ],
    )

    all_path = OUT_DIR / "04_all_layers_interpretation_sheet.png"
    render_interpretation_sheet(
        all_path,
        "All interpretation layers",
        "Every layer from the requested list is included somewhere on this sheet. It is useful as an audit view, but it is busy.",
        [
            (radar_all, "All overlays radargram", "Surface, axes, candidate bands, clutter mask, and alias risk."),
            (clutter_panel, "Cluttergram comparison", "Simulated surface clutter."),
            (topography_panel, "Topography context", "Terrain height along track."),
            (groundtrack_panel, "Ground-track map", "Orbit path context."),
            (ascope_panel, "A-scope profiles", "Trace-level vertical profiles."),
            (fft_panel, "FFT/Doppler inset", "Along-track frequency diagnostic."),
            (trace_strip.resize((1200, 180), Image.Resampling.NEAREST), "Trace quality + adaptive map", "Processing and problem-score strips."),
            (table_panel, "Candidate reflector score", "Confidence and clutter-overlap table."),
            (status_panel, "Crossover consistency check", "Not available until another orbit is added."),
        ],
    )

    score_rows = write_scorecard(OUT_DIR / "combination_scorecard.csv")
    score_panel = make_scorecard_panel(score_rows, 650, 230)
    score_path = OUT_DIR / "06_combination_scorecard.png"
    render_interpretation_sheet(
        score_path,
        "Interpretation combination scorecard",
        "The recommended balanced layout carries the most useful evidence without making the radargram unreadable.",
        [(score_panel, "Scorecard", "R=readability, E=evidence, C=complexity.")],
        columns=1,
    )

    best_path = OUT_DIR / "05_recommended_balanced_interpretation_sheet.png"
    render_best_combo_sheet(best_path, radar_clutter, clutter_panel, topography_panel, table_panel, trace_strip, status_panel)

    write_candidate_csv(OUT_DIR / "candidate_reflector_scores.csv", candidates)

    checklist = [
        "surface pick line",
        "depth/delay axis",
        "along-track distance/trace number",
        "layer picks",
        "cluttergram comparison",
        "ground-track map",
        "topography context",
        "A-scope profiles",
        "confidence/uncertainty labels",
        "Doppler alias-risk overlay",
        "trace-quality strip",
        "adaptive processing map",
        "candidate reflector score",
        "clutter-match mask",
        "before/after interpretation sheet",
        "uncertainty bands instead of single lines",
        "FFT/Doppler inset",
        "crossover/nearby-orbit consistency check",
    ]
    summary = {
        "purpose": "Compare interpretation-layer combinations for Mars SHARAD orbit S_01294501.",
        "important_limit": "These are interpretation overlays. They help judge features but do not recover missing or aliased radar information.",
        "implemented_items": checklist,
        "crossover_status": "Not available locally; only S_01294501 is loaded.",
        "recommended_combination": "05_recommended_balanced_interpretation_sheet.png",
        "outputs": {
            "common_foundation": str(common_path.relative_to(ROOT)),
            "clutter_doppler": str(clutter_path.relative_to(ROOT)),
            "processing_confidence": str(processing_path.relative_to(ROOT)),
            "all_layers": str(all_path.relative_to(ROOT)),
            "recommended_balanced": str(best_path.relative_to(ROOT)),
            "scorecard": str(score_path.relative_to(ROOT)),
            "candidate_scores_csv": str((OUT_DIR / "candidate_reflector_scores.csv").relative_to(ROOT)),
            "combination_scorecard_csv": str((OUT_DIR / "combination_scorecard.csv").relative_to(ROOT)),
        },
        "candidate_count": len(candidates),
    }
    summary_path = OUT_DIR / "interpretation_suite_summary.json"
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print(f"Wrote {best_path}")
    print(f"Wrote {all_path}")
    print(f"Wrote {clutter_path}")
    print(f"Wrote {summary_path}")


if __name__ == "__main__":
    main()
