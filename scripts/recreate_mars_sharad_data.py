"""Ingest and graph the downloaded Mars SHARAD radargram data.

This script uses the local MRO SHARAD orbit S_01294501 files and makes raw
data products only. It does not generate synthetic clutter and it does not read
the companion clutter-simulation image.

Outputs:
  outputs/mars_sharad_s_01294501/track_geometry.csv
  outputs/mars_sharad_s_01294501/radargram_column_diagnostics.csv
  outputs/mars_sharad_s_01294501/filtered_radargram_column_diagnostics.csv
  outputs/mars_sharad_s_01294501/radargram_downsample.npz
  outputs/mars_sharad_s_01294501/filtered_radargram_downsample.npz
  outputs/mars_sharad_s_01294501/custom_radargram_numeric_img_fullres.png
  outputs/mars_sharad_s_01294501/observed_radargram_preview.png
  outputs/mars_sharad_s_01294501/filtered_radargram_preview.png
  outputs/mars_sharad_s_01294501/radargram_filter_comparison.png
  outputs/mars_sharad_s_01294501/doppler_spectrum_preview.png
  outputs/mars_sharad_s_01294501/point_target_alias_model.png
  outputs/mars_sharad_s_01294501/alias_risk_overlay.png
  outputs/mars_sharad_s_01294501/alias_risk_bands.csv
  outputs/mars_sharad_s_01294501/point_target_alias_model.csv
  outputs/mars_sharad_s_01294501/track_geometry_plot.png
  outputs/mars_sharad_s_01294501/summary.json
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import math
from pathlib import Path
from typing import Iterable

import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data" / "sharad_s_01294501"
RADARGRAM_IMG = DATA_DIR / "radargram" / "s_01294501_rgram.img"
RADARGRAM_TIFF = DATA_DIR / "radargram" / "s_01294501_tiff.tif"
RETURN_CSV = DATA_DIR / "clutter_simulation" / "s_01294501_rtrn.csv"
OUTPUT_DIR = ROOT / "outputs" / "mars_sharad_s_01294501"

LINES = 3600
SAMPLES = 4719
FLOAT_DTYPE = "<f4"
DEFAULT_DOPPLER_CUTOFF = 0.012
DEFAULT_DOPPLER_TRANSITION = 0.010
DEFAULT_FILTER_STRENGTH = 0.90
LIGHT_SPEED_M_S = 299_792_458.0
SHARAD_CENTER_FREQUENCY_HZ = 20_000_000.0
SHARAD_NOMINAL_PRF_HZ = 700.28
DEFAULT_PRESUM_FACTOR = 8.0
DEFAULT_PRODUCT_DOPPLER_BANDWIDTH_HZ = 0.4
DEFAULT_RANGE_BIN_M = 15.0
DEFAULT_ALIAS_LINE_PAD = 18
START_TIME_UTC = "2009-05-01T04:51:19.135Z"
STOP_TIME_UTC = "2009-05-01T05:02:58.981Z"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    parser.add_argument("--max-preview-width", type=int, default=1400)
    parser.add_argument(
        "--allow-browse-tiff-fallback",
        action="store_true",
        help="Use the PDS browse TIFF only if the numeric float IMG cannot be read.",
    )
    parser.add_argument(
        "--doppler-cutoff",
        type=float,
        default=DEFAULT_DOPPLER_CUTOFF,
        help=(
            "Along-track cycles per trace where the zero-Doppler clutter notch starts. "
            "Lower values remove only broader, slower patterns."
        ),
    )
    parser.add_argument(
        "--doppler-transition",
        type=float,
        default=DEFAULT_DOPPLER_TRANSITION,
        help="Width of the smooth transition from rejected to retained along-track frequencies.",
    )
    parser.add_argument(
        "--filter-strength",
        type=float,
        default=DEFAULT_FILTER_STRENGTH,
        help="Strength of low-Doppler attenuation from 0.0 to 1.0.",
    )
    parser.add_argument(
        "--raw-prf-hz",
        type=float,
        default=SHARAD_NOMINAL_PRF_HZ,
        help="Nominal SHARAD raw pulse repetition frequency used by the point-target alias model.",
    )
    parser.add_argument(
        "--presum-factor",
        type=float,
        default=DEFAULT_PRESUM_FACTOR,
        help="Assumed PRF reduction factor for the professor-style alias model.",
    )
    parser.add_argument(
        "--alias-model-prf-hz",
        type=float,
        default=None,
        help="Override the alias model PRF. If omitted, raw PRF divided by presum factor is used.",
    )
    parser.add_argument(
        "--center-frequency-hz",
        type=float,
        default=SHARAD_CENTER_FREQUENCY_HZ,
        help="Radar center frequency used by the point-target alias model.",
    )
    parser.add_argument(
        "--range-bin-m",
        type=float,
        default=DEFAULT_RANGE_BIN_M,
        help="Approximate free-space meters per radargram line for plotting delay/depth risk bands.",
    )
    parser.add_argument(
        "--product-doppler-bandwidth-hz",
        type=float,
        default=DEFAULT_PRODUCT_DOPPLER_BANDWIDTH_HZ,
        help="Centered Doppler bandwidth used to mark folded clutter risk.",
    )
    parser.add_argument(
        "--alias-line-pad",
        type=int,
        default=DEFAULT_ALIAS_LINE_PAD,
        help="Extra radargram lines added around each modeled alias-risk band for display.",
    )
    return parser.parse_args()


def require_file(path: Path) -> None:
    if not path.exists():
        raise FileNotFoundError(path)


def read_float_plane(path: Path) -> np.ndarray:
    require_file(path)
    with path.open("rb") as handle:
        data = np.fromfile(handle, dtype=FLOAT_DTYPE, count=LINES * SAMPLES)
    if data.size != LINES * SAMPLES:
        raise ValueError(f"Expected {LINES * SAMPLES} float samples in {path}, read {data.size}")
    return data.reshape((LINES, SAMPLES))


def read_observed_radargram(allow_browse_tiff_fallback: bool) -> tuple[np.ndarray, dict[str, object]]:
    try:
        return read_float_plane(RADARGRAM_IMG), {
            "observed_source": str(RADARGRAM_IMG.relative_to(ROOT)),
            "observed_source_type": "PDS float IMG",
            "radargram_generated_from": "numeric float IMG",
        }
    except ValueError as exc:
        if not allow_browse_tiff_fallback:
            raise ValueError(
                f"Cannot build the custom radargram because the numeric float IMG is unreadable: {exc}"
            ) from exc
        require_file(RADARGRAM_TIFF)
        image = Image.open(RADARGRAM_TIFF).convert("L")
        if image.size != (SAMPLES, LINES):
            raise ValueError(f"Expected TIFF size {(SAMPLES, LINES)}, got {image.size}") from exc
        return np.asarray(image, dtype=np.float32), {
            "observed_source": str(RADARGRAM_TIFF.relative_to(ROOT)),
            "observed_source_type": "PDS browse TIFF",
            "radargram_generated_from": "PDS browse TIFF fallback",
            "observed_source_note": str(exc),
        }


def robust_normalize(values: np.ndarray, low_pct: float = 1.0, high_pct: float = 99.7) -> np.ndarray:
    finite = np.asarray(values[np.isfinite(values)], dtype=np.float32)
    if finite.size == 0:
        return np.zeros(values.shape, dtype=np.float32)
    low, high = np.percentile(finite, [low_pct, high_pct])
    if not math.isfinite(float(low)) or not math.isfinite(float(high)) or high <= low:
        low, high = float(np.nanmin(finite)), float(np.nanmax(finite))
    if high <= low:
        return np.zeros(values.shape, dtype=np.float32)
    clipped = np.clip(values, low, high)
    normalized = (clipped - low) / (high - low)
    normalized[~np.isfinite(normalized)] = 0.0
    return normalized.astype(np.float32)


def display_scale_radargram(values: np.ndarray, use_log_power: bool) -> tuple[np.ndarray, str]:
    array = np.asarray(values, dtype=np.float32)
    if use_log_power:
        positive = array[np.isfinite(array) & (array > 0)]
        if positive.size == 0:
            return robust_normalize(array), "linear contrast"
        floor = float(np.percentile(positive, 0.05))
        if not math.isfinite(floor) or floor <= 0:
            floor = float(np.nanmin(positive))
        db_values = 10.0 * np.log10(np.maximum(array, floor))
        return robust_normalize(db_values, low_pct=1.0, high_pct=99.85), "log-power contrast"
    return robust_normalize(array), "linear contrast"


def smooth_highpass_mask(freqs: np.ndarray, cutoff: float, transition: float) -> np.ndarray:
    if cutoff < 0:
        raise ValueError("doppler cutoff must be non-negative")
    if transition <= 0:
        raise ValueError("doppler transition must be positive")
    mask = np.ones(freqs.shape, dtype=np.float32)
    mask[freqs <= cutoff] = 0.0
    ramp_zone = (freqs > cutoff) & (freqs < cutoff + transition)
    ramp = (freqs[ramp_zone] - cutoff) / transition
    mask[ramp_zone] = ramp * ramp * (3.0 - 2.0 * ramp)
    return mask


def suppress_zero_doppler_clutter(
    radargram: np.ndarray,
    cutoff: float,
    transition: float,
    strength: float,
) -> tuple[np.ndarray, dict[str, object]]:
    if not 0.0 <= strength <= 1.0:
        raise ValueError("filter strength must be between 0.0 and 1.0")

    work = robust_normalize(np.asarray(radargram, dtype=np.float32), low_pct=0.2, high_pct=99.8)
    work = np.nan_to_num(work, nan=0.0, posinf=0.0, neginf=0.0)
    freqs = np.fft.rfftfreq(work.shape[1], d=1.0)
    highpass = smooth_highpass_mask(freqs, cutoff, transition)
    attenuation = 1.0 - strength * (1.0 - highpass)

    spectrum = np.fft.rfft(work, axis=1)
    filtered = np.fft.irfft(spectrum * attenuation[np.newaxis, :], n=work.shape[1], axis=1)
    filtered = np.clip(filtered.astype(np.float32), 0.0, None)
    filtered = robust_normalize(filtered, low_pct=0.2, high_pct=99.8)

    metadata = {
        "method": "along-track zero-Doppler attenuation",
        "input": "observed radargram only",
        "doppler_cutoff_cycles_per_trace": cutoff,
        "doppler_transition_cycles_per_trace": transition,
        "filter_strength": strength,
        "cutoff_equivalent_trace_period": None if cutoff == 0 else 1.0 / cutoff,
        "transition_end_cycles_per_trace": cutoff + transition,
        "limitation": (
            "This is a display-domain clutter suppression filter on detected radargram power, not "
            "complex radar echoes. It can reduce slow along-track clutter but cannot recover a real "
            "reflector that perfectly overlaps clutter in both delay and Doppler."
        ),
    }
    return filtered, metadata


def resized_display(array: np.ndarray, out_height: int, out_width: int, normalize: bool = True) -> np.ndarray:
    normalized = robust_normalize(np.asarray(array, dtype=np.float32)) if normalize else np.asarray(array, dtype=np.float32)
    image = Image.fromarray(np.uint8(np.clip(normalized, 0, 1) * 255), mode="L")
    image = image.resize((out_width, out_height), Image.Resampling.BILINEAR)
    return np.asarray(image, dtype=np.float32) / 255.0


def save_plain_radargram(path: Path, radargram_display: np.ndarray) -> None:
    """Save a full-resolution grayscale radargram generated from numeric data."""
    image = Image.fromarray(np.uint8(np.clip(radargram_display, 0, 1) * 255), mode="L")
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path)


def load_return_rows(path: Path) -> list[dict[str, float]]:
    require_file(path)
    rows: list[dict[str, float]] = []
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for raw in reader:
            row: dict[str, float] = {}
            for key, value in raw.items():
                row[key] = int(value) if key == "Column" else float(value)
            rows.append(row)
    return rows


def safe_value(row: dict[str, float], key: str) -> float | None:
    value = row.get(key)
    if value is None or not math.isfinite(float(value)):
        return None
    return float(value)


def write_dict_rows(path: Path, rows: Iterable[dict[str, object]]) -> None:
    rows = list(rows)
    if not rows:
        raise ValueError(f"No rows to write to {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = list(rows[0].keys())
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def write_optional_dict_rows(path: Path, rows: Iterable[dict[str, object]], fieldnames: list[str]) -> None:
    rows = list(rows)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        if rows:
            writer.writerows(rows)


def track_geometry_rows(rows: list[dict[str, float]]) -> list[dict[str, object]]:
    output: list[dict[str, object]] = []
    for row in rows:
        nadir_line = safe_value(row, "NadirLine")
        output.append(
            {
                "column": int(row["Column"]),
                "spacecraft_lon_deg": safe_value(row, "SpacecraftLon"),
                "spacecraft_lat_deg": safe_value(row, "SpacecraftLat"),
                "spacecraft_height_m": safe_value(row, "SpacecraftHgt"),
                "nadir_height_m": safe_value(row, "NadirHgt"),
                "nadir_line": nadir_line,
                "nadir_areoid_radius_m": safe_value(row, "NadirAreoidRad"),
                "nadir_ellipsoid_radius_m": safe_value(row, "NadirEllipsoidRad"),
            }
        )
    return output


def radargram_diagnostics(radargram: np.ndarray, rows: list[dict[str, float]]) -> list[dict[str, object]]:
    peak_lines = np.nanargmax(radargram, axis=0)
    peak_power = radargram[peak_lines, np.arange(radargram.shape[1])]
    output: list[dict[str, object]] = []
    for index, row in enumerate(rows[: radargram.shape[1]]):
        nadir_line = safe_value(row, "NadirLine")
        observed_peak_line = int(peak_lines[index]) + 1
        output.append(
            {
                "column": int(row["Column"]),
                "spacecraft_lon_deg": safe_value(row, "SpacecraftLon"),
                "spacecraft_lat_deg": safe_value(row, "SpacecraftLat"),
                "spacecraft_height_m": safe_value(row, "SpacecraftHgt"),
                "nadir_height_m": safe_value(row, "NadirHgt"),
                "nadir_line": nadir_line,
                "observed_peak_line": observed_peak_line,
                "observed_peak_power": float(peak_power[index]),
                "observed_peak_minus_nadir_line": None if nadir_line is None else observed_peak_line - nadir_line,
            }
        )
    return output


def parse_utc(value: str) -> dt.datetime:
    return dt.datetime.fromisoformat(value.replace("Z", "+00:00"))


def wrapped_lon_delta_rad(lon2_deg: float, lon1_deg: float) -> float:
    delta = math.radians(lon2_deg - lon1_deg)
    if delta > math.pi:
        delta -= 2.0 * math.pi
    if delta < -math.pi:
        delta += 2.0 * math.pi
    return delta


def surface_distance_m(row_a: dict[str, float], row_b: dict[str, float]) -> float:
    lat1 = math.radians(float(row_a["SpacecraftLat"]))
    lat2 = math.radians(float(row_b["SpacecraftLat"]))
    delta_lat = lat2 - lat1
    delta_lon = wrapped_lon_delta_rad(float(row_b["SpacecraftLon"]), float(row_a["SpacecraftLon"]))
    radius = (
        float(row_a["NadirAreoidRad"])
        + float(row_b["NadirAreoidRad"])
        + float(row_a["SpacecraftHgt"])
        + float(row_b["SpacecraftHgt"])
    ) / 2.0
    hav = math.sin(delta_lat / 2.0) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lon / 2.0) ** 2
    return 2.0 * radius * math.asin(min(1.0, math.sqrt(max(0.0, hav))))


def track_motion_stats(rows: list[dict[str, float]]) -> dict[str, float]:
    duration_s = (parse_utc(STOP_TIME_UTC) - parse_utc(START_TIME_UTC)).total_seconds()
    distance_m = sum(surface_distance_m(rows[index - 1], rows[index]) for index in range(1, len(rows)))
    mean_height_m = float(np.mean([float(row["SpacecraftHgt"]) for row in rows]))
    mean_nadir_line = float(np.mean([float(row["NadirLine"]) for row in rows]))
    return {
        "duration_s": duration_s,
        "track_distance_m": distance_m,
        "spacecraft_speed_m_s": distance_m / duration_s,
        "radargram_trace_rate_hz": len(rows) / duration_s,
        "mean_spacecraft_height_m": mean_height_m,
        "mean_nadir_line": mean_nadir_line,
    }


def folded_frequency_hz(freq_hz: np.ndarray | float, prf_hz: float) -> np.ndarray | float:
    return ((freq_hz + prf_hz / 2.0) % prf_hz) - prf_hz / 2.0


def surface_point_alias_model(
    rows: list[dict[str, float]],
    range_bin_m: float,
    center_frequency_hz: float,
    model_prf_hz: float,
    product_doppler_bandwidth_hz: float,
) -> tuple[dict[str, float], list[dict[str, object]], list[dict[str, object]]]:
    motion = track_motion_stats(rows)
    wavelength_m = LIGHT_SPEED_M_S / center_frequency_hz
    max_offset_line = max(1, int(LINES - motion["mean_nadir_line"] - 1))
    offsets = np.arange(0, max_offset_line + 1, dtype=np.float32)
    delta_range_m = offsets * range_bin_m
    height_m = motion["mean_spacecraft_height_m"]
    slant_range_m = height_m + delta_range_m
    along_track_offset_m = np.sqrt(np.maximum(0.0, slant_range_m * slant_range_m - height_m * height_m))
    doppler_hz = 2.0 * motion["spacecraft_speed_m_s"] * along_track_offset_m / (wavelength_m * slant_range_m)
    folded_hz = folded_frequency_hz(doppler_hz, model_prf_hz)
    risk_half_band_hz = product_doppler_bandwidth_hz / 2.0
    risk = np.abs(folded_hz) <= risk_half_band_hz

    point_rows: list[dict[str, object]] = []
    for index, offset in enumerate(offsets):
        point_rows.append(
            {
                "offset_line_below_nadir": int(offset),
                "approx_free_space_range_below_nadir_m": float(delta_range_m[index]),
                "surface_along_track_offset_km": float(along_track_offset_m[index] / 1000.0),
                "surface_doppler_hz": float(doppler_hz[index]),
                "folded_doppler_hz": float(folded_hz[index]),
                "inside_center_doppler_band": bool(risk[index]),
            }
        )

    bands: list[dict[str, object]] = []
    min_offset_for_band = 3
    start: int | None = None
    for index, is_risk in enumerate(risk):
        offset_line = int(offsets[index])
        if offset_line < min_offset_for_band:
            is_risk = False
        if is_risk and start is None:
            start = offset_line
        if start is not None and (not is_risk or index == len(risk) - 1):
            end = offset_line if is_risk and index == len(risk) - 1 else int(offsets[index - 1])
            center_offset = int(round((start + end) / 2.0))
            center_index = min(center_offset, len(point_rows) - 1)
            bands.append(
                {
                    "offset_line_start": start,
                    "offset_line_end": end,
                    "approx_free_space_range_start_m": start * range_bin_m,
                    "approx_free_space_range_end_m": end * range_bin_m,
                    "surface_along_track_offset_km_center": point_rows[center_index]["surface_along_track_offset_km"],
                    "surface_doppler_hz_center": point_rows[center_index]["surface_doppler_hz"],
                    "folded_doppler_hz_center": point_rows[center_index]["folded_doppler_hz"],
                }
            )
            start = None

    model_metadata = {
        **motion,
        "wavelength_m": wavelength_m,
        "center_frequency_hz": center_frequency_hz,
        "model_prf_hz": model_prf_hz,
        "range_bin_m": range_bin_m,
        "product_doppler_bandwidth_hz": product_doppler_bandwidth_hz,
        "risk_half_band_hz": risk_half_band_hz,
        "max_modeled_offset_line": max_offset_line,
        "risk_band_count": len(bands),
        "model_note": (
            "Flat-surface point-target diagnostic: surface points farther from nadir get larger "
            "Doppler shifts; the shifts are folded by the assumed PRF to find where surface energy "
            "can land back near zero Doppler."
        ),
    }
    return model_metadata, point_rows, bands


def compute_image_doppler_spectrum(
    radargram_display: np.ndarray,
    out_height: int,
    out_width: int,
    trace_rate_hz: float,
) -> tuple[np.ndarray, dict[str, object]]:
    working_height = min(900, radargram_display.shape[0])
    work = resized_display(radargram_display, working_height, radargram_display.shape[1], normalize=False)
    work = work - np.median(work, axis=1, keepdims=True)
    window = np.hanning(work.shape[1]).astype(np.float32)
    spectrum = np.fft.fftshift(np.fft.fft(work * window[np.newaxis, :], axis=1), axes=1)
    magnitude = np.log1p(np.abs(spectrum)).astype(np.float32)
    normalized = robust_normalize(magnitude, low_pct=5.0, high_pct=99.8)
    spectrum_down = resized_display(normalized, out_height, out_width, normalize=False)
    return spectrum_down, {
        "method": "FFT along radargram columns after row-median removal",
        "axis": "image-domain along-track frequency from processed detected-power radargram",
        "radargram_trace_rate_hz": trace_rate_hz,
        "nyquist_hz": trace_rate_hz / 2.0,
        "limitation": "This is not raw complex-echo Doppler processing; it is a diagnostic FFT of the processed radargram image.",
    }


def font(name: str, size: int) -> ImageFont.ImageFont:
    path = Path("C:/Windows/Fonts") / name
    if path.exists():
        return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def draw_nadir_line(
    draw: ImageDraw.ImageDraw,
    source_rows: list[dict[str, float]],
    scale_x: float,
    scale_y: float,
    y_offset: float,
    color: tuple[int, int, int, int],
    step: int = 7,
) -> None:
    points: list[tuple[float, float]] = []
    for row in source_rows[::step]:
        line = safe_value(row, "NadirLine")
        if line is None:
            continue
        x = (float(row["Column"]) - 1.0) * scale_x
        y = y_offset + (line - 1.0) * scale_y
        points.append((x, y))
    if len(points) > 1:
        draw.line(points, fill=color, width=2)


def render_radargram_preview(
    path: Path,
    radar_down: np.ndarray,
    source_rows: list[dict[str, float]],
    title: str = "Mars SHARAD orbit S_01294501 observed radargram",
    subtitle: str = "Yellow line = nadir return line from the downloaded PDS return table. No synthetic clutter is plotted.",
    footer: str = "Contrast-normalized preview of the observed radargram data.",
) -> None:
    width = radar_down.shape[1]
    panel_h = radar_down.shape[0]
    label_h = 76
    footer_h = 42
    total_h = label_h + panel_h + footer_h
    canvas = Image.new("RGB", (width, total_h), "#080808")
    draw = ImageDraw.Draw(canvas, "RGBA")
    title_font = font("segoeuib.ttf", 22)
    body_font = font("segoeui.ttf", 14)
    small_font = font("segoeui.ttf", 12)

    radar_img = Image.fromarray(np.uint8(np.clip(radar_down, 0, 1) * 255), mode="L").convert("RGB")
    panel_y = label_h
    canvas.paste(radar_img, (0, panel_y))
    draw.rectangle((0, panel_y, width - 1, panel_y + panel_h - 1), outline=(235, 235, 235, 180), width=1)

    scale_x = width / SAMPLES
    scale_y = panel_h / LINES
    draw_nadir_line(draw, source_rows, scale_x, scale_y, panel_y, (246, 223, 86, 220))

    draw.text((18, 15), title, fill=(245, 245, 245, 245), font=title_font)
    draw.text((18, 45), subtitle, fill=(190, 190, 190, 245), font=body_font)
    draw.text((18, total_h - 24), footer, fill=(170, 170, 170, 235), font=small_font)
    path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(path)


def paste_radar_panel(
    canvas: Image.Image,
    draw: ImageDraw.ImageDraw,
    radar_down: np.ndarray,
    source_rows: list[dict[str, float]],
    y: int,
    label: str,
    label_font: ImageFont.ImageFont,
    small_font: ImageFont.ImageFont,
) -> None:
    width = radar_down.shape[1]
    panel_h = radar_down.shape[0]
    radar_img = Image.fromarray(np.uint8(np.clip(radar_down, 0, 1) * 255), mode="L").convert("RGB")
    canvas.paste(radar_img, (0, y))
    draw.rectangle((0, y, width - 1, y + panel_h - 1), outline=(235, 235, 235, 170), width=1)
    draw.rectangle((10, y + 10, 342, y + 35), fill=(0, 0, 0, 150))
    draw.text((18, y + 13), label, fill=(245, 245, 245, 245), font=label_font)
    draw.text((18, y + panel_h - 23), "Yellow line = nadir return", fill=(220, 210, 120, 235), font=small_font)
    draw_nadir_line(
        draw,
        source_rows,
        width / SAMPLES,
        panel_h / LINES,
        y,
        (246, 223, 86, 220),
    )


def render_filter_comparison(
    path: Path,
    original_down: np.ndarray,
    filtered_down: np.ndarray,
    source_rows: list[dict[str, float]],
) -> None:
    width = original_down.shape[1]
    panel_h = original_down.shape[0]
    header_h = 82
    gap_h = 18
    footer_h = 42
    total_h = header_h + panel_h * 2 + gap_h + footer_h
    canvas = Image.new("RGB", (width, total_h), "#080808")
    draw = ImageDraw.Draw(canvas, "RGBA")
    title_font = font("segoeuib.ttf", 22)
    body_font = font("segoeui.ttf", 14)
    label_font = font("segoeuib.ttf", 15)
    small_font = font("segoeui.ttf", 12)

    draw.text((18, 15), "Mars SHARAD radargram before and after clutter suppression", fill=(245, 245, 245, 245), font=title_font)
    draw.text(
        (18, 45),
        "Filter uses only the observed radargram and attenuates slow along-track / near-zero Doppler energy.",
        fill=(190, 190, 190, 245),
        font=body_font,
    )
    paste_radar_panel(canvas, draw, original_down, source_rows, header_h, "Original observed radargram", label_font, small_font)
    filtered_y = header_h + panel_h + gap_h
    paste_radar_panel(canvas, draw, filtered_down, source_rows, filtered_y, "Clutter-suppressed radargram", label_font, small_font)
    draw.text(
        (18, total_h - 24),
        "This suppresses likely folded surface clutter visually; it does not prove overlapped subsurface echoes are recoverable.",
        fill=(170, 170, 170, 235),
        font=small_font,
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(path)


def render_doppler_spectrum_preview(
    path: Path,
    spectrum_down: np.ndarray,
    spectrum_metadata: dict[str, object],
    product_doppler_bandwidth_hz: float,
) -> None:
    panel_w = spectrum_down.shape[1]
    panel_h = spectrum_down.shape[0]
    header_h = 86
    footer_h = 58
    axis_h = 34
    width = panel_w
    total_h = header_h + panel_h + axis_h + footer_h
    canvas = Image.new("RGB", (width, total_h), "#080808")
    draw = ImageDraw.Draw(canvas, "RGBA")
    title_font = font("segoeuib.ttf", 22)
    body_font = font("segoeui.ttf", 14)
    small_font = font("segoeui.ttf", 12)

    image = Image.fromarray(np.uint8(np.clip(spectrum_down, 0, 1) * 255), mode="L").convert("RGB")
    panel_y = header_h
    canvas.paste(image, (0, panel_y))
    draw.rectangle((0, panel_y, width - 1, panel_y + panel_h - 1), outline=(235, 235, 235, 180), width=1)

    nyquist_hz = float(spectrum_metadata["nyquist_hz"])
    center_x = width / 2.0
    band_half_px = 0.0 if nyquist_hz <= 0 else (product_doppler_bandwidth_hz / 2.0) / nyquist_hz * (width / 2.0)
    draw.rectangle((center_x - band_half_px, panel_y, center_x + band_half_px, panel_y + panel_h), fill=(240, 152, 70, 70))
    draw.line((center_x, panel_y, center_x, panel_y + panel_h), fill=(255, 225, 120, 230), width=2)

    draw.text((18, 15), "Mars SHARAD along-track Doppler diagnostic", fill=(245, 245, 245, 245), font=title_font)
    draw.text(
        (18, 45),
        "FFT across radargram columns. Orange = centered Doppler band used for alias-risk checks.",
        fill=(190, 190, 190, 245),
        font=body_font,
    )
    axis_y = panel_y + panel_h + 8
    for x, label, anchor in [
        (30, f"-{nyquist_hz:.2f} Hz", "la"),
        (center_x, "0 Hz", "ma"),
        (width - 30, f"+{nyquist_hz:.2f} Hz", "ra"),
    ]:
        draw.line((x, panel_y + panel_h, x, panel_y + panel_h + 7), fill=(210, 210, 210, 200), width=1)
        draw.text((x, axis_y), label, fill=(190, 190, 190, 245), font=small_font, anchor=anchor)
    draw.text((width / 2, total_h - 31), "Along-track frequency from the processed radargram trace spacing", fill=(170, 170, 170, 235), font=small_font, anchor="mm")
    draw.text((18, total_h - 18), str(spectrum_metadata["limitation"]), fill=(150, 150, 150, 235), font=small_font)
    path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(path)


def render_point_target_alias_model(
    path: Path,
    point_rows: list[dict[str, object]],
    bands: list[dict[str, object]],
    model_metadata: dict[str, float],
) -> None:
    width, height = 1400, 720
    margin_l, margin_r, margin_t, margin_b = 92, 42, 104, 92
    plot_w = width - margin_l - margin_r
    plot_h = height - margin_t - margin_b
    canvas = Image.new("RGB", (width, height), "#fbfaf6")
    draw = ImageDraw.Draw(canvas, "RGBA")
    title_font = font("segoeuib.ttf", 24)
    body_font = font("segoeui.ttf", 14)
    small_font = font("segoeui.ttf", 12)

    x_values = [float(row["offset_line_below_nadir"]) for row in point_rows]
    y_values = [float(row["folded_doppler_hz"]) for row in point_rows]
    x_min, x_max = min(x_values), max(x_values)
    prf = float(model_metadata["model_prf_hz"])
    y_min, y_max = -prf / 2.0, prf / 2.0

    def x_at(value: float) -> float:
        return margin_l + (value - x_min) / (x_max - x_min) * plot_w

    def y_at(value: float) -> float:
        return margin_t + (y_max - value) / (y_max - y_min) * plot_h

    draw.rectangle((margin_l, margin_t, margin_l + plot_w, margin_t + plot_h), fill=(255, 255, 255, 255), outline=(215, 204, 187, 230), width=1)
    for i in range(7):
        y = margin_t + plot_h * i / 6.0
        draw.line((margin_l, y, margin_l + plot_w, y), fill=(225, 220, 211, 180), width=1)
    for i in range(6):
        x = margin_l + plot_w * i / 5.0
        draw.line((x, margin_t, x, margin_t + plot_h), fill=(235, 231, 224, 120), width=1)

    risk_half = float(model_metadata["risk_half_band_hz"])
    draw.rectangle(
        (margin_l, y_at(risk_half), margin_l + plot_w, y_at(-risk_half)),
        fill=(240, 152, 70, 58),
    )
    draw.line((margin_l, y_at(0.0), margin_l + plot_w, y_at(0.0)), fill=(31, 36, 48, 220), width=1)

    for band in bands:
        x0 = x_at(float(band["offset_line_start"]))
        x1 = x_at(float(band["offset_line_end"]))
        draw.rectangle((x0, margin_t, max(x1, x0 + 2), margin_t + plot_h), fill=(240, 152, 70, 64))

    points = [(x_at(x_values[i]), y_at(y_values[i])) for i in range(0, len(x_values), 2)]
    if len(points) > 1:
        draw.line(points, fill=(84, 119, 196, 235), width=2)

    for value in [0, round(x_max / 4), round(x_max / 2), round(x_max * 3 / 4), round(x_max)]:
        x = x_at(value)
        draw.line((x, margin_t + plot_h, x, margin_t + plot_h + 8), fill=(110, 104, 93, 220), width=1)
        draw.text((x, margin_t + plot_h + 14), f"{int(value)}", fill=(80, 75, 66, 255), font=small_font, anchor="ma")
    for value in [-prf / 2.0, -prf / 4.0, 0.0, prf / 4.0, prf / 2.0]:
        y = y_at(value)
        draw.line((margin_l - 8, y, margin_l, y), fill=(110, 104, 93, 220), width=1)
        draw.text((margin_l - 12, y), f"{value:.1f}", fill=(80, 75, 66, 255), font=small_font, anchor="rm")

    draw.text((margin_l, 25), "Point-target Doppler alias model", fill=(31, 29, 25, 255), font=title_font)
    draw.text(
        (margin_l, 56),
        (
            f"Assumed PRF {prf:.3f} Hz, center frequency {float(model_metadata['center_frequency_hz']) / 1e6:.1f} MHz, "
            f"spacecraft speed {float(model_metadata['spacecraft_speed_m_s']) / 1000:.2f} km/s."
        ),
        fill=(91, 85, 75, 255),
        font=body_font,
    )
    draw.line((margin_l, 86, margin_l + 34, 86), fill=(84, 119, 196, 235), width=3)
    draw.text((margin_l + 43, 78), "Folded surface-point Doppler", fill=(61, 57, 50, 255), font=small_font)
    draw.rectangle((margin_l + 316, 78, margin_l + 344, 94), fill=(240, 152, 70, 82), outline=(204, 111, 59, 180))
    draw.text((margin_l + 353, 78), "Near-zero alias risk", fill=(61, 57, 50, 255), font=small_font)
    draw.text((margin_l + plot_w / 2, height - 34), "Radargram lines below the nadir return", fill=(91, 85, 75, 255), font=small_font, anchor="mm")
    draw.text(
        (margin_l, height - 16),
        "This is a simple flat-geometry point-target diagnostic, not a replacement for raw complex SAR processing.",
        fill=(106, 99, 86, 255),
        font=small_font,
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(path)


def render_alias_risk_overlay(
    path: Path,
    radar_down: np.ndarray,
    source_rows: list[dict[str, float]],
    bands: list[dict[str, object]],
    model_metadata: dict[str, float],
    alias_line_pad: int,
) -> None:
    width = radar_down.shape[1]
    panel_h = radar_down.shape[0]
    header_h = 86
    footer_h = 54
    total_h = header_h + panel_h + footer_h
    canvas = Image.new("RGB", (width, total_h), "#080808")
    draw = ImageDraw.Draw(canvas, "RGBA")
    title_font = font("segoeuib.ttf", 22)
    body_font = font("segoeui.ttf", 14)
    small_font = font("segoeui.ttf", 12)

    radar_img = Image.fromarray(np.uint8(np.clip(radar_down, 0, 1) * 255), mode="L").convert("RGB")
    panel_y = header_h
    canvas.paste(radar_img, (0, panel_y))
    draw.rectangle((0, panel_y, width - 1, panel_y + panel_h - 1), outline=(235, 235, 235, 180), width=1)

    scale_x = width / SAMPLES
    scale_y = panel_h / LINES
    step = 3
    rect_w = max(1.0, step * scale_x + 1.0)
    for row in source_rows[::step]:
        nadir_line = safe_value(row, "NadirLine")
        if nadir_line is None:
            continue
        x0 = (float(row["Column"]) - 1.0) * scale_x
        for band in bands:
            start = max(0, int(band["offset_line_start"]) - alias_line_pad)
            end = int(band["offset_line_end"]) + alias_line_pad
            y0 = panel_y + (nadir_line + start - 1.0) * scale_y
            y1 = panel_y + (nadir_line + end - 1.0) * scale_y
            if y1 < panel_y or y0 > panel_y + panel_h:
                continue
            draw.rectangle((x0, max(panel_y, y0), x0 + rect_w, min(panel_y + panel_h, y1)), fill=(240, 152, 70, 78))

    draw_nadir_line(draw, source_rows, scale_x, scale_y, panel_y, (246, 223, 86, 230))

    draw.text((18, 15), "Mars SHARAD alias-risk overlay", fill=(245, 245, 245, 245), font=title_font)
    draw.text(
        (18, 45),
        (
            f"Orange bands = point-target model says folded surface energy can land near zero Doppler "
            f"(PRF {float(model_metadata['model_prf_hz']):.3f} Hz)."
        ),
        fill=(190, 190, 190, 245),
        font=body_font,
    )
    legend_y = total_h - 34
    draw.line((18, legend_y, 48, legend_y), fill=(246, 223, 86, 230), width=4)
    draw.text((58, legend_y - 9), "nadir return", fill=(185, 185, 185, 235), font=small_font)
    draw.rectangle((190, legend_y - 9, 220, legend_y + 8), fill=(240, 152, 70, 90), outline=(240, 152, 70, 160))
    draw.text((230, legend_y - 9), "modeled alias-risk band, not filled data", fill=(185, 185, 185, 235), font=small_font)
    draw.text(
        (18, total_h - 12),
        "Use this to avoid overinterpreting dark zones; it does not reconstruct missing signal.",
        fill=(150, 150, 150, 235),
        font=small_font,
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(path)


def scale(values: list[float], y0: float, y1: float) -> tuple[list[float], float, float]:
    low = min(values)
    high = max(values)
    if high <= low:
        high = low + 1.0
    scaled = [y1 - (value - low) / (high - low) * (y1 - y0) for value in values]
    return scaled, low, high


def render_track_geometry_plot(path: Path, rows: list[dict[str, float]]) -> None:
    width, height = 1400, 640
    margin_l, margin_r, margin_t, margin_b = 80, 34, 72, 74
    plot_w = width - margin_l - margin_r
    plot_h = height - margin_t - margin_b
    canvas = Image.new("RGB", (width, height), "#fbfaf6")
    draw = ImageDraw.Draw(canvas, "RGBA")
    title_font = font("segoeuib.ttf", 24)
    body_font = font("segoeui.ttf", 14)
    small_font = font("segoeui.ttf", 12)

    columns = [float(row["Column"]) for row in rows]
    lat = [float(row["SpacecraftLat"]) for row in rows]
    height_km = [float(row["SpacecraftHgt"]) / 1000.0 for row in rows]
    nadir_line = [float(row["NadirLine"]) for row in rows]

    lat_y, lat_low, lat_high = scale(lat, margin_t, margin_t + plot_h)
    height_y, height_low, height_high = scale(height_km, margin_t, margin_t + plot_h)
    line_y, line_low, line_high = scale(nadir_line, margin_t, margin_t + plot_h)

    def x_at(col: float) -> float:
        return margin_l + (col - columns[0]) / (columns[-1] - columns[0]) * plot_w

    for i in range(6):
        y = margin_t + plot_h * i / 5
        draw.line((margin_l, y, margin_l + plot_w, y), fill=(215, 204, 187, 160), width=1)
    draw.rectangle((margin_l, margin_t, margin_l + plot_w, margin_t + plot_h), outline=(184, 170, 149, 230), width=1)

    series = [
        ("Spacecraft latitude", lat_y, (31, 107, 112, 235), f"{lat_low:.2f} to {lat_high:.2f} deg"),
        ("Spacecraft height", height_y, (155, 78, 47, 235), f"{height_low:.1f} to {height_high:.1f} km"),
        ("Nadir line", line_y, (95, 79, 143, 235), f"{line_low:.0f} to {line_high:.0f}"),
    ]
    for _, y_values, color, _ in series:
        points = [(x_at(columns[i]), y_values[i]) for i in range(0, len(columns), 4)]
        if len(points) > 1:
            draw.line(points, fill=color, width=2)

    draw.text((margin_l, 24), "Mars SHARAD S_01294501 track data", fill=(31, 29, 25, 255), font=title_font)
    draw.text((margin_l, 51), "Direct graph of the downloaded return/geometry table, aligned by radargram column.", fill=(91, 85, 75, 255), font=body_font)
    legend_x = margin_l
    legend_y = height - 48
    for label, _, color, range_text in series:
        draw.line((legend_x, legend_y, legend_x + 26, legend_y), fill=color, width=4)
        draw.text((legend_x + 34, legend_y - 9), f"{label}: {range_text}", fill=(61, 57, 50, 255), font=small_font)
        legend_x += 360
    draw.text((margin_l + plot_w / 2, height - 16), "Radargram column", fill=(91, 85, 75, 255), font=small_font, anchor="mm")
    canvas.save(path)


def summary_stats(
    radargram: np.ndarray,
    radargram_display: np.ndarray,
    filtered_radargram: np.ndarray,
    rows: list[dict[str, float]],
    diagnostics: list[dict[str, object]],
    filtered_diagnostics: list[dict[str, object]],
    observed_source: dict[str, object],
    filter_metadata: dict[str, object],
    display_transform: str,
    doppler_spectrum_metadata: dict[str, object],
    alias_model_metadata: dict[str, object],
    alias_risk_bands: list[dict[str, object]],
) -> dict[str, object]:
    lat_values = [float(row["SpacecraftLat"]) for row in rows]
    lon_values = [float(row["SpacecraftLon"]) for row in rows]
    height_values = [float(row["SpacecraftHgt"]) for row in rows]
    peak_delta = [
        float(row["observed_peak_minus_nadir_line"])
        for row in diagnostics
        if row["observed_peak_minus_nadir_line"] is not None
    ]
    filtered_peak_delta = [
        float(row["observed_peak_minus_nadir_line"])
        for row in filtered_diagnostics
        if row["observed_peak_minus_nadir_line"] is not None
    ]
    limitations = [
        "The preview is contrast-normalized for display.",
        "No synthetic clutter or modeled clutter image is generated or plotted.",
        "The clutter-suppressed radargram is a filter of the observed radargram, not a synthetic correction.",
        "The Doppler spectrum is computed from the processed detected-power radargram, not raw complex radar echoes.",
        "The alias-risk overlay is a flat-geometry point-target diagnostic; orange bands flag risk zones and are not recovered measurements.",
    ]
    if observed_source.get("observed_source_type") == "PDS browse TIFF":
        limitations.append(
            "The observed radargram uses the browse TIFF when the checked-out float IMG size does not match the PDS label."
        )
    return {
        "source": {
            "mission": "Mars Reconnaissance Orbiter",
            "instrument": "SHARAD",
            "target": "Mars",
            "product_id": "S_01294501",
            "start_time_utc": START_TIME_UTC,
            "stop_time_utc": STOP_TIME_UTC,
            **observed_source,
            "return_table_source": str(RETURN_CSV.relative_to(ROOT)),
        },
        "array_shape": {
            "lines": LINES,
            "samples": SAMPLES,
        },
        "track": {
            "rows": len(rows),
            "spacecraft_latitude_deg_min": min(lat_values),
            "spacecraft_latitude_deg_max": max(lat_values),
            "spacecraft_longitude_deg_min": min(lon_values),
            "spacecraft_longitude_deg_max": max(lon_values),
            "spacecraft_height_m_min": min(height_values),
            "spacecraft_height_m_max": max(height_values),
        },
        "observed_radargram": {
            "min": float(np.nanmin(radargram)),
            "max": float(np.nanmax(radargram)),
            "display_transform": display_transform,
            "display_min": float(np.nanmin(radargram_display)),
            "display_max": float(np.nanmax(radargram_display)),
            "diagnostic_columns": len(diagnostics),
            "median_observed_peak_minus_nadir_line": float(np.median(peak_delta)) if peak_delta else None,
        },
        "filtered_radargram": {
            "min": float(np.nanmin(filtered_radargram)),
            "max": float(np.nanmax(filtered_radargram)),
            "diagnostic_columns": len(filtered_diagnostics),
            "median_filtered_peak_minus_nadir_line": float(np.median(filtered_peak_delta)) if filtered_peak_delta else None,
            **filter_metadata,
        },
        "doppler_spectrum": doppler_spectrum_metadata,
        "point_target_alias_model": {
            **alias_model_metadata,
            "alias_risk_bands": len(alias_risk_bands),
            "first_alias_risk_bands": alias_risk_bands[:8],
        },
        "limitations": limitations,
    }


def main() -> None:
    args = parse_args()
    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    radargram, observed_source = read_observed_radargram(args.allow_browse_tiff_fallback)
    rows = load_return_rows(RETURN_CSV)
    radargram_display, display_transform = display_scale_radargram(
        radargram,
        use_log_power=observed_source["observed_source_type"] == "PDS float IMG",
    )
    filtered_radargram, filter_metadata = suppress_zero_doppler_clutter(
        radargram_display,
        cutoff=args.doppler_cutoff,
        transition=args.doppler_transition,
        strength=args.filter_strength,
    )
    alias_model_prf_hz = args.alias_model_prf_hz if args.alias_model_prf_hz is not None else args.raw_prf_hz / args.presum_factor
    alias_model_metadata, point_model_rows, alias_risk_bands = surface_point_alias_model(
        rows,
        range_bin_m=args.range_bin_m,
        center_frequency_hz=args.center_frequency_hz,
        model_prf_hz=alias_model_prf_hz,
        product_doppler_bandwidth_hz=args.product_doppler_bandwidth_hz,
    )
    alias_model_metadata["raw_prf_hz"] = args.raw_prf_hz
    alias_model_metadata["presum_factor"] = args.presum_factor
    alias_model_metadata["alias_model_prf_source"] = (
        "explicit --alias-model-prf-hz" if args.alias_model_prf_hz is not None else "raw PRF divided by assumed presumming factor"
    )

    track_csv = output_dir / "track_geometry.csv"
    diagnostics_csv = output_dir / "radargram_column_diagnostics.csv"
    filtered_diagnostics_csv = output_dir / "filtered_radargram_column_diagnostics.csv"
    alias_risk_bands_csv = output_dir / "alias_risk_bands.csv"
    point_model_csv = output_dir / "point_target_alias_model.csv"
    downsample_npz = output_dir / "radargram_downsample.npz"
    filtered_downsample_npz = output_dir / "filtered_radargram_downsample.npz"
    custom_fullres_png = output_dir / "custom_radargram_numeric_img_fullres.png"
    preview_png = output_dir / "observed_radargram_preview.png"
    filtered_preview_png = output_dir / "filtered_radargram_preview.png"
    comparison_png = output_dir / "radargram_filter_comparison.png"
    doppler_spectrum_png = output_dir / "doppler_spectrum_preview.png"
    point_model_png = output_dir / "point_target_alias_model.png"
    alias_overlay_png = output_dir / "alias_risk_overlay.png"
    track_plot_png = output_dir / "track_geometry_plot.png"
    summary_json = output_dir / "summary.json"

    track_rows = track_geometry_rows(rows)
    diagnostics = radargram_diagnostics(radargram, rows)
    filtered_diagnostics = radargram_diagnostics(filtered_radargram, rows)
    write_dict_rows(track_csv, track_rows)
    write_dict_rows(diagnostics_csv, diagnostics)
    write_dict_rows(filtered_diagnostics_csv, filtered_diagnostics)
    write_dict_rows(point_model_csv, point_model_rows)
    write_optional_dict_rows(
        alias_risk_bands_csv,
        alias_risk_bands,
        [
            "offset_line_start",
            "offset_line_end",
            "approx_free_space_range_start_m",
            "approx_free_space_range_end_m",
            "surface_along_track_offset_km_center",
            "surface_doppler_hz_center",
            "folded_doppler_hz_center",
        ],
    )

    preview_width = max(500, min(args.max_preview_width, SAMPLES))
    preview_height = max(320, round(preview_width * LINES / SAMPLES * 0.58))
    radar_down = resized_display(radargram_display, preview_height, preview_width, normalize=False)
    filtered_down = resized_display(filtered_radargram, preview_height, preview_width, normalize=False)
    doppler_down, doppler_spectrum_metadata = compute_image_doppler_spectrum(
        radargram_display,
        preview_height,
        preview_width,
        trace_rate_hz=float(alias_model_metadata["radargram_trace_rate_hz"]),
    )
    save_plain_radargram(custom_fullres_png, radargram_display)
    np.savez_compressed(downsample_npz, radargram=radar_down)
    np.savez_compressed(filtered_downsample_npz, radargram=filtered_down)
    render_radargram_preview(
        preview_png,
        radar_down,
        rows,
        footer=f"{display_transform.title()} preview of the observed radargram data.",
    )
    render_radargram_preview(
        filtered_preview_png,
        filtered_down,
        rows,
        title="Mars SHARAD orbit S_01294501 clutter-suppressed radargram",
        subtitle="Observed data filtered along-track to weaken near-zero Doppler clutter. No synthetic clutter is plotted.",
        footer=f"{display_transform.title()} plus along-track suppression; use with the original radargram for interpretation.",
    )
    render_filter_comparison(comparison_png, radar_down, filtered_down, rows)
    render_doppler_spectrum_preview(
        doppler_spectrum_png,
        doppler_down,
        doppler_spectrum_metadata,
        product_doppler_bandwidth_hz=args.product_doppler_bandwidth_hz,
    )
    render_point_target_alias_model(point_model_png, point_model_rows, alias_risk_bands, alias_model_metadata)
    render_alias_risk_overlay(alias_overlay_png, radar_down, rows, alias_risk_bands, alias_model_metadata, args.alias_line_pad)
    render_track_geometry_plot(track_plot_png, rows)

    summary = summary_stats(
        radargram,
        radargram_display,
        filtered_radargram,
        rows,
        diagnostics,
        filtered_diagnostics,
        observed_source,
        filter_metadata,
        display_transform,
        doppler_spectrum_metadata,
        alias_model_metadata,
        alias_risk_bands,
    )
    summary["derived_outputs"] = {
        "track_geometry_csv": str(track_csv.relative_to(ROOT)),
        "radargram_column_diagnostics_csv": str(diagnostics_csv.relative_to(ROOT)),
        "filtered_radargram_column_diagnostics_csv": str(filtered_diagnostics_csv.relative_to(ROOT)),
        "alias_risk_bands_csv": str(alias_risk_bands_csv.relative_to(ROOT)),
        "point_target_alias_model_csv": str(point_model_csv.relative_to(ROOT)),
        "custom_radargram_numeric_img_fullres_png": str(custom_fullres_png.relative_to(ROOT)),
        "downsample_npz": str(downsample_npz.relative_to(ROOT)),
        "filtered_downsample_npz": str(filtered_downsample_npz.relative_to(ROOT)),
        "observed_radargram_preview_png": str(preview_png.relative_to(ROOT)),
        "filtered_radargram_preview_png": str(filtered_preview_png.relative_to(ROOT)),
        "radargram_filter_comparison_png": str(comparison_png.relative_to(ROOT)),
        "doppler_spectrum_preview_png": str(doppler_spectrum_png.relative_to(ROOT)),
        "point_target_alias_model_png": str(point_model_png.relative_to(ROOT)),
        "alias_risk_overlay_png": str(alias_overlay_png.relative_to(ROOT)),
        "track_geometry_plot_png": str(track_plot_png.relative_to(ROOT)),
    }
    summary_json.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print(f"Wrote {track_csv}")
    print(f"Wrote {diagnostics_csv}")
    print(f"Wrote {filtered_diagnostics_csv}")
    print(f"Wrote {alias_risk_bands_csv}")
    print(f"Wrote {point_model_csv}")
    print(f"Wrote {custom_fullres_png}")
    print(f"Wrote {downsample_npz}")
    print(f"Wrote {filtered_downsample_npz}")
    print(f"Wrote {preview_png}")
    print(f"Wrote {filtered_preview_png}")
    print(f"Wrote {comparison_png}")
    print(f"Wrote {doppler_spectrum_png}")
    print(f"Wrote {point_model_png}")
    print(f"Wrote {alias_overlay_png}")
    print(f"Wrote {track_plot_png}")
    print(f"Wrote {summary_json}")


if __name__ == "__main__":
    main()
