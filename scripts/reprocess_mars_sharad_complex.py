"""Reprocess the matching Mars SHARAD RDR complex echoes into radargrams.

This script uses the same orbit as the downloaded S_01294501 radargram. It
reads the official PDS3 RDR complex-voltage product and creates new radargrams
from the complex echoes, then applies Doppler/aperture filters before detected
power is rendered. It also verifies and quicklooks the matching EDR raw science
file so the raw companion product is present and documented.

Outputs are written under outputs/mars_sharad_s_01294501/raw_complex_reprocess.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import math
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data" / "sharad_s_01294501" / "raw_complex"
RDR_DIR = DATA_DIR / "rdr"
EDR_DIR = DATA_DIR / "edr"
OUTPUT_DIR = ROOT / "outputs" / "mars_sharad_s_01294501" / "raw_complex_reprocess"
ALIAS_BANDS_CSV = ROOT / "outputs" / "mars_sharad_s_01294501" / "alias_risk_bands.csv"

RDR_LABEL = RDR_DIR / "r_1294501_001_ss19_700_a.lbl"
RDR_FORMAT = RDR_DIR / "rdr.fmt"
RDR_DATA = RDR_DIR / "r_1294501_001_ss19_700_a.dat"
EDR_LABEL = EDR_DIR / "e_1294501_001_ss19_700_a.lbl"
EDR_SCIENCE_FORMAT = EDR_DIR / "science8bit.fmt"
EDR_AUX_FORMAT = EDR_DIR / "auxiliary.fmt"
EDR_SCIENCE_DATA = EDR_DIR / "e_1294501_001_ss19_700_a_s.dat"
EDR_AUX_DATA = EDR_DIR / "e_1294501_001_ss19_700_a_a.dat"

PDS_URLS = {
    "rdr_label": "https://pds-geosciences.wustl.edu/mro/mro-m-sharad-4-rdr-v1/mrosh_1001/data/rdr12xxx/rdr1294501/r_1294501_001_ss19_700_a.lbl",
    "rdr_data": "https://pds-geosciences.wustl.edu/mro/mro-m-sharad-4-rdr-v1/mrosh_1001/data/rdr12xxx/rdr1294501/r_1294501_001_ss19_700_a.dat",
    "rdr_format": "https://pds-geosciences.wustl.edu/mro/mro-m-sharad-4-rdr-v1/mrosh_1001/label/rdr.fmt",
    "edr_label": "https://pds-geosciences.wustl.edu/mro/mro-m-sharad-3-edr-v1/mrosh_0001/data/edr12xxx/edr1294501/e_1294501_001_ss19_700_a.lbl",
    "edr_science_data": "https://pds-geosciences.wustl.edu/mro/mro-m-sharad-3-edr-v1/mrosh_0001/data/edr12xxx/edr1294501/e_1294501_001_ss19_700_a_s.dat",
    "edr_aux_data": "https://pds-geosciences.wustl.edu/mro/mro-m-sharad-3-edr-v1/mrosh_0001/data/edr12xxx/edr1294501/e_1294501_001_ss19_700_a_a.dat",
    "edr_science_format": "https://pds-geosciences.wustl.edu/mro/mro-m-sharad-3-edr-v1/mrosh_0001/label/science8bit.fmt",
    "edr_aux_format": "https://pds-geosciences.wustl.edu/mro/mro-m-sharad-3-edr-v1/mrosh_0001/label/auxiliary.fmt",
}

USRDR_LINES = 3600
USRDR_COLUMNS = 4719
RAW_PRF_HZ = 1_000_000.0 / 1428.0
ONBOARD_PRESUM = 4.0
PROFESSOR_ALIAS_PRESUM = 8.0
SHARAD_CENTER_FREQUENCY_HZ = 20_000_000.0


@dataclass(frozen=True)
class ColumnSpec:
    name: str
    number: int | None
    data_type: str
    start_byte: int
    bytes_count: int
    items: int | None = None
    item_bytes: int | None = None

    @property
    def offset(self) -> int:
        return self.start_byte - 1


@dataclass(frozen=True)
class VariantSpec:
    key: str
    label: str
    mode: str
    bandwidth_hz: float
    transition_hz: float
    strength: float
    aperture_traces: int
    assumed_prf_hz: float | None
    alias_only: bool = False


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    parser.add_argument("--output-columns", type=int, default=USRDR_COLUMNS)
    parser.add_argument("--display-lines", type=int, default=USRDR_LINES)
    parser.add_argument("--range-chunk-size", type=int, default=48)
    parser.add_argument("--preview-width", type=int, default=1300)
    parser.add_argument("--skip-edr-quicklook", action="store_true")
    return parser.parse_args()


def require_file(path: Path) -> None:
    if not path.exists():
        raise FileNotFoundError(f"Missing required file: {path}")


def pds_text(path: Path) -> str:
    require_file(path)
    return path.read_text(encoding="utf-8", errors="replace")


def strip_pds_value(raw: str) -> str:
    value = raw.strip()
    if value.startswith('"') and '"' in value[1:]:
        return value.split('"', 2)[1]
    return value.split("<", 1)[0].strip().strip('"')


def label_value(text: str, key: str) -> str:
    pattern = re.compile(rf"^\s*{re.escape(key)}\s*=\s*(.+?)\s*$", re.MULTILINE)
    match = pattern.search(text)
    if not match:
        raise KeyError(key)
    return strip_pds_value(match.group(1))


def label_int(text: str, key: str) -> int:
    value = label_value(text, key)
    number = re.search(r"[-+]?\d+", value)
    if not number:
        raise ValueError(f"No integer value found for {key}: {value}")
    return int(number.group(0))


def label_float(text: str, key: str) -> float:
    value = label_value(text, key)
    number = re.search(r"[-+]?(?:\d+\.\d+|\d+)", value)
    if not number:
        raise ValueError(f"No float value found for {key}: {value}")
    return float(number.group(0))


def parse_pds_time(value: str) -> dt.datetime:
    return dt.datetime.strptime(value, "%Y-%jT%H:%M:%S.%f").replace(tzinfo=dt.timezone.utc)


def parse_column_blocks(fmt_text: str) -> dict[str, ColumnSpec]:
    blocks = re.findall(r"OBJECT\s*=\s*COLUMN(.*?)END_OBJECT\s*=\s*COLUMN", fmt_text, flags=re.DOTALL)
    columns: dict[str, ColumnSpec] = {}
    for block in blocks:
        name_match = re.search(r"^\s*NAME\s*=\s*\"?([^\"\n]+?)\"?\s*$", block, flags=re.MULTILINE)
        number_match = re.search(r"^\s*COLUMN_NUMBER\s*=\s*(\d+)\s*$", block, flags=re.MULTILINE)
        data_type_match = re.search(r"^\s*DATA_TYPE\s*=\s*([A-Z0-9_]+)\s*$", block, flags=re.MULTILINE)
        start_byte_match = re.search(r"^\s*START_BYTE\s*=\s*(\d+)\s*$", block, flags=re.MULTILINE)
        bytes_match = re.search(r"^\s*BYTES\s*=\s*(\d+)\s*$", block, flags=re.MULTILINE)
        if not data_type_match or not start_byte_match or not bytes_match:
            continue
        number = int(number_match.group(1)) if number_match else None
        name = name_match.group(1).strip() if name_match else f"COLUMN_{number}"
        items_match = re.search(r"^\s*ITEMS\s*=\s*(\d+)\s*$", block, flags=re.MULTILINE)
        item_bytes_match = re.search(r"^\s*ITEM_BYTES\s*=\s*(\d+)\s*$", block, flags=re.MULTILINE)
        columns[name] = ColumnSpec(
            name=name,
            number=number,
            data_type=data_type_match.group(1),
            start_byte=int(start_byte_match.group(1)),
            bytes_count=int(bytes_match.group(1)),
            items=int(items_match.group(1)) if items_match else None,
            item_bytes=int(item_bytes_match.group(1)) if item_bytes_match else None,
        )
    return columns


def parse_bit_columns(fmt_text: str) -> dict[str, dict[str, int | str]]:
    blocks = re.findall(r"OBJECT\s*=\s*BIT_COLUMN(.*?)END_OBJECT\s*=\s*BIT_COLUMN", fmt_text, flags=re.DOTALL)
    output: dict[str, dict[str, int | str]] = {}
    for block in blocks:
        name_match = re.search(r"^\s*NAME\s*=\s*\"?([^\"\n]+?)\"?\s*$", block, flags=re.MULTILINE)
        if not name_match:
            continue
        name = name_match.group(1).strip()
        values: dict[str, int | str] = {"name": name}
        for key in ["START_BIT", "BITS", "ITEMS", "ITEM_BITS"]:
            match = re.search(rf"^\s*{key}\s*=\s*(\d+)\s*$", block, flags=re.MULTILINE)
            if match:
                values[key.lower()] = int(match.group(1))
        type_match = re.search(r"^\s*BIT_DATA_TYPE\s*=\s*([A-Z0-9_]+)\s*$", block, flags=re.MULTILINE)
        if type_match:
            values["bit_data_type"] = type_match.group(1)
        output[name] = values
    return output


def file_info(path: Path, expected_size: int | None = None) -> dict[str, Any]:
    require_file(path)
    actual = path.stat().st_size
    return {
        "path": str(path.relative_to(ROOT)),
        "bytes": actual,
        "expected_bytes": expected_size,
        "size_matches_expected": None if expected_size is None else actual == expected_size,
    }


def build_rdr_dtype(columns: dict[str, ColumnSpec], row_bytes: int) -> np.dtype:
    real = columns["ECHO_SAMPLES_REAL"]
    imag = columns["ECHO_SAMPLES_IMAGINARY"]
    doppler_bw = columns["DOPPLER_BW"]
    doppler_centroid = columns["DOPPLER_CENTROID"]
    block_rows = columns["BLOCK_ROWS"]
    whole = columns["SCET_BLOCK_WHOLE"]
    frac = columns["SCET_BLOCK_FRAC"]
    return np.dtype(
        {
            "names": [
                "scet_whole",
                "scet_frac",
                "real",
                "imag",
                "block_rows",
                "doppler_bw",
                "doppler_centroid",
            ],
            "formats": [
                "<u4",
                "<u2",
                ("<f4", (real.items or 1,)),
                ("<f4", (imag.items or 1,)),
                "<u2",
                "<f4",
                "<f4",
            ],
            "offsets": [
                whole.offset,
                frac.offset,
                real.offset,
                imag.offset,
                block_rows.offset,
                doppler_bw.offset,
                doppler_centroid.offset,
            ],
            "itemsize": row_bytes,
        }
    )


def robust_db_from_power(power: np.ndarray) -> np.ndarray:
    finite_positive = power[np.isfinite(power) & (power > 0)]
    if finite_positive.size == 0:
        return np.zeros(power.shape, dtype=np.float32)
    floor = float(np.percentile(finite_positive, 0.05))
    if not math.isfinite(floor) or floor <= 0:
        floor = float(finite_positive.min())
    db = 10.0 * np.log10(np.maximum(power, floor))
    db[~np.isfinite(db)] = 10.0 * math.log10(floor)
    return db.astype(np.float32)


def common_scale(arrays: list[np.ndarray], low_pct: float = 1.0, high_pct: float = 99.85) -> tuple[float, float]:
    sample_values: list[np.ndarray] = []
    for array in arrays:
        flat = array[np.isfinite(array)].ravel()
        if flat.size > 500_000:
            step = max(1, flat.size // 500_000)
            flat = flat[::step]
        if flat.size:
            sample_values.append(flat.astype(np.float32, copy=False))
    if not sample_values:
        return 0.0, 1.0
    combined = np.concatenate(sample_values)
    low, high = np.percentile(combined, [low_pct, high_pct])
    if not math.isfinite(float(low)) or not math.isfinite(float(high)) or high <= low:
        low = float(np.nanmin(combined))
        high = float(np.nanmax(combined))
    if high <= low:
        high = low + 1.0
    return float(low), float(high)


def normalize_for_display(values: np.ndarray, low: float, high: float) -> np.ndarray:
    if high <= low:
        return np.zeros(values.shape, dtype=np.float32)
    scaled = (values - low) / (high - low)
    scaled = np.clip(scaled, 0.0, 1.0)
    scaled[~np.isfinite(scaled)] = 0.0
    return scaled.astype(np.float32)


def save_radargram_png(path: Path, display: np.ndarray, display_lines: int | None) -> None:
    image = Image.fromarray(np.uint8(np.clip(display, 0.0, 1.0) * 255), mode="L")
    if display_lines is not None and display_lines > 0 and display_lines != image.height:
        image = image.resize((image.width, display_lines), Image.Resampling.BILINEAR)
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path)


def downsample_mean_axis1(values: np.ndarray, edges: np.ndarray) -> np.ndarray:
    starts = edges[:-1]
    counts = np.diff(edges).astype(np.float32)
    sums = np.add.reduceat(values, starts, axis=1)[:, : len(starts)]
    return (sums / counts[np.newaxis, :]).astype(np.float32)


def downsample_complex_power(echo: np.ndarray, edges: np.ndarray) -> np.ndarray:
    power = np.square(echo.real, dtype=np.float32) + np.square(echo.imag, dtype=np.float32)
    return downsample_mean_axis1(power, edges)


def moving_average_complex(echo: np.ndarray, width: int) -> np.ndarray:
    if width <= 1:
        return echo
    left = width // 2
    right = width - 1 - left
    padded = np.pad(echo, ((0, 0), (left, right)), mode="edge")
    prefix = np.cumsum(padded, axis=1, dtype=np.complex64)
    zero = np.zeros((echo.shape[0], 1), dtype=np.complex64)
    prefix = np.concatenate([zero, prefix], axis=1)
    return ((prefix[:, width:] - prefix[:, :-width]) / float(width)).astype(np.complex64)


def smooth_lowpass(freq_hz: np.ndarray, half_band_hz: float, transition_hz: float) -> np.ndarray:
    distance = np.abs(freq_hz)
    mask = np.ones(freq_hz.shape, dtype=np.float32)
    mask[distance >= half_band_hz + transition_hz] = 0.0
    ramp_zone = (distance > half_band_hz) & (distance < half_band_hz + transition_hz)
    if np.any(ramp_zone):
        t = (distance[ramp_zone] - half_band_hz) / transition_hz
        mask[ramp_zone] = 1.0 - (t * t * (3.0 - 2.0 * t))
    return mask


def frequency_filter_mask(n_traces: int, spec: VariantSpec, fallback_prf_hz: float) -> np.ndarray:
    assumed_prf = spec.assumed_prf_hz or fallback_prf_hz
    freq_hz = np.fft.fftfreq(n_traces, d=1.0 / assumed_prf)
    half_band = spec.bandwidth_hz / 2.0
    lowpass = smooth_lowpass(freq_hz, half_band, spec.transition_hz)
    if spec.mode == "center_pass":
        return lowpass.astype(np.float32)
    if spec.mode == "zero_notch":
        return (1.0 - spec.strength * lowpass).astype(np.float32)
    raise ValueError(f"Unsupported filter mode: {spec.mode}")


def read_alias_risk_bands(path: Path) -> list[dict[str, float]]:
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as handle:
        return [{key: float(value) for key, value in row.items()} for row in csv.DictReader(handle)]


def alias_rows_from_usrdr_bands(
    alias_bands: list[dict[str, float]],
    surface_sample: int,
    sample_count: int,
    display_lines: int,
) -> list[tuple[int, int]]:
    output: list[tuple[int, int]] = []
    if display_lines <= 0:
        return output
    sample_scale = sample_count / float(display_lines)
    for band in alias_bands:
        start_offset = int(round(float(band["offset_line_start"]) * sample_scale))
        end_offset = int(round(float(band["offset_line_end"]) * sample_scale))
        pad = max(2, int(round(18 * sample_scale)))
        start = max(0, surface_sample + min(start_offset, end_offset) - pad)
        end = min(sample_count - 1, surface_sample + max(start_offset, end_offset) + pad)
        if end >= start:
            output.append((start, end))
    return output


def rows_in_ranges(row_indices: np.ndarray, ranges: list[tuple[int, int]]) -> np.ndarray:
    mask = np.zeros(row_indices.shape, dtype=bool)
    for start, end in ranges:
        mask |= (row_indices >= start) & (row_indices <= end)
    return mask


def load_rdr_arrays(
    rdr_data: Path,
    rdr_dtype: np.dtype,
    rows: int,
) -> np.memmap:
    require_file(rdr_data)
    return np.memmap(rdr_data, dtype=rdr_dtype, mode="r", shape=(rows,))


def build_baseline_power(
    rdr: np.memmap,
    sample_count: int,
    output_cols: int,
    chunk_samples: int,
    trace_edges: np.ndarray,
) -> np.ndarray:
    output = np.empty((sample_count, output_cols), dtype=np.float32)
    for start in range(0, sample_count, chunk_samples):
        end = min(sample_count, start + chunk_samples)
        echo = (rdr["real"][:, start:end].T + 1j * rdr["imag"][:, start:end].T).astype(np.complex64)
        output[start:end] = downsample_complex_power(echo, trace_edges)
    return output


def build_variant_powers(
    rdr: np.memmap,
    variants: list[VariantSpec],
    sample_count: int,
    output_cols: int,
    chunk_samples: int,
    trace_edges: np.ndarray,
    processed_trace_rate_hz: float,
    alias_sample_ranges: list[tuple[int, int]],
) -> dict[str, np.ndarray]:
    outputs = {variant.key: np.empty((sample_count, output_cols), dtype=np.float32) for variant in variants}
    masks = {
        variant.key: frequency_filter_mask(len(rdr), variant, processed_trace_rate_hz)
        for variant in variants
    }
    for start in range(0, sample_count, chunk_samples):
        end = min(sample_count, start + chunk_samples)
        row_indices = np.arange(start, end)
        echo = (rdr["real"][:, start:end].T + 1j * rdr["imag"][:, start:end].T).astype(np.complex64)
        spectrum = np.fft.fft(echo, axis=1)
        for variant in variants:
            filtered = np.fft.ifft(spectrum * masks[variant.key][np.newaxis, :], axis=1).astype(np.complex64)
            if variant.alias_only:
                alias_mask = rows_in_ranges(row_indices, alias_sample_ranges)
                if not np.any(alias_mask):
                    filtered = echo
                else:
                    mixed = echo.copy()
                    mixed[alias_mask] = filtered[alias_mask]
                    filtered = mixed
            if variant.aperture_traces > 1:
                filtered = moving_average_complex(filtered, variant.aperture_traces)
            outputs[variant.key][start:end] = downsample_complex_power(filtered, trace_edges)
    return outputs


def make_edr_raw_quicklook(
    path: Path,
    label_text: str,
    science_columns: dict[str, ColumnSpec],
    output_cols: int,
    output_png: Path,
    output_npz: Path,
) -> dict[str, Any]:
    science_file_rows = label_int(label_text, "FILE_RECORDS")
    science_record_bytes = label_int(label_text, "RECORD_BYTES")
    science_data_col = science_columns["SCIENCE_DATA"]
    sample_count = science_data_col.bytes_count
    expected_bytes = science_file_rows * science_record_bytes
    require_file(path)
    raw = np.memmap(path, dtype=np.uint8, mode="r")
    echo = np.ndarray(
        (science_file_rows, sample_count),
        dtype=np.int8,
        buffer=raw,
        offset=science_data_col.offset,
        strides=(science_record_bytes, 1),
    )
    edges = np.floor(np.linspace(0, science_file_rows, output_cols + 1)).astype(np.int64)
    edges[-1] = science_file_rows
    quicklook = np.empty((sample_count, output_cols), dtype=np.float32)
    for start in range(0, sample_count, 120):
        end = min(sample_count, start + 120)
        amplitude = np.abs(echo[:, start:end].astype(np.float32).T)
        quicklook[start:end] = downsample_mean_axis1(amplitude, edges)
    low, high = common_scale([quicklook], low_pct=1.0, high_pct=99.7)
    display = normalize_for_display(quicklook, low, high)
    save_radargram_png(output_png, display, display_lines=None)
    np.savez_compressed(output_npz, mean_abs_raw_echo=quicklook)
    return {
        "source": str(path.relative_to(ROOT)),
        "record_bytes": science_record_bytes,
        "records": science_file_rows,
        "sample_count": sample_count,
        "expected_bytes": expected_bytes,
        "actual_bytes": path.stat().st_size,
        "quicklook_metric": "mean absolute 8-bit raw echo value, not range-compressed",
        "quicklook_png": str(output_png.relative_to(ROOT)),
        "quicklook_npz": str(output_npz.relative_to(ROOT)),
    }


def font(name: str, size: int) -> ImageFont.ImageFont:
    try:
        return ImageFont.truetype(name, size)
    except OSError:
        return ImageFont.load_default()


def render_comparison(
    path: Path,
    displays: dict[str, np.ndarray],
    labels: dict[str, str],
    scale_note: str,
    panel_width: int,
) -> None:
    keys = list(displays)
    panel_h = max(320, int(panel_width * 0.70))
    header_h = 88
    label_h = 42
    gap = 18
    cols = 2
    rows = math.ceil(len(keys) / cols)
    width = cols * panel_width + (cols + 1) * gap
    height = header_h + rows * (panel_h + label_h) + (rows + 1) * gap + 28
    canvas = Image.new("RGB", (width, height), "#fbfaf6")
    draw = ImageDraw.Draw(canvas, "RGBA")
    title_font = font("segoeuib.ttf", 25)
    body_font = font("segoeui.ttf", 14)
    label_font = font("segoeuib.ttf", 15)
    note_font = font("segoeui.ttf", 12)

    draw.text((gap, 20), "Complex SHARAD radargrams from the same orbit", fill=(31, 36, 48, 255), font=title_font)
    draw.text((gap, 54), scale_note, fill=(90, 96, 112, 255), font=body_font)

    for index, key in enumerate(keys):
        row = index // cols
        col = index % cols
        x = gap + col * (panel_width + gap)
        y = header_h + gap + row * (panel_h + label_h + gap)
        image = Image.fromarray(np.uint8(np.clip(displays[key], 0, 1) * 255), mode="L").convert("RGB")
        image = image.resize((panel_width, panel_h), Image.Resampling.BILINEAR)
        canvas.paste(image, (x, y))
        draw.rectangle((x, y, x + panel_width - 1, y + panel_h - 1), outline=(210, 214, 224, 220), width=1)
        draw.text((x, y + panel_h + 10), labels[key], fill=(31, 36, 48, 255), font=label_font)

    draw.text(
        (gap, height - 20),
        "Filters are applied to complex echoes before detected power is rendered; they do not create missing signal.",
        fill=(100, 105, 116, 255),
        font=note_font,
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(path)


def write_variant_summary(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "variant",
        "label",
        "mode",
        "doppler_bandwidth_hz",
        "transition_hz",
        "filter_strength",
        "aperture_traces",
        "assumed_prf_hz",
        "alias_only",
        "median_power_db",
        "p95_power_db",
        "mean_power_db_in_alias_samples",
        "png",
    ]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def variant_stats(
    key: str,
    label: str,
    spec: VariantSpec | None,
    db_image: np.ndarray,
    alias_sample_ranges: list[tuple[int, int]],
    png_path: Path,
) -> dict[str, Any]:
    alias_values: list[np.ndarray] = []
    for start, end in alias_sample_ranges:
        alias_values.append(db_image[start : end + 1].ravel())
    alias_mean = None
    if alias_values:
        alias_concat = np.concatenate(alias_values)
        alias_mean = float(np.mean(alias_concat[np.isfinite(alias_concat)]))
    return {
        "variant": key,
        "label": label,
        "mode": "none" if spec is None else spec.mode,
        "doppler_bandwidth_hz": None if spec is None else spec.bandwidth_hz,
        "transition_hz": None if spec is None else spec.transition_hz,
        "filter_strength": None if spec is None else spec.strength,
        "aperture_traces": 1 if spec is None else spec.aperture_traces,
        "assumed_prf_hz": None if spec is None else spec.assumed_prf_hz,
        "alias_only": False if spec is None else spec.alias_only,
        "median_power_db": float(np.median(db_image[np.isfinite(db_image)])),
        "p95_power_db": float(np.percentile(db_image[np.isfinite(db_image)], 95.0)),
        "mean_power_db_in_alias_samples": alias_mean,
        "png": str(png_path.relative_to(ROOT)),
    }


def main() -> None:
    args = parse_args()
    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    for required in [
        RDR_LABEL,
        RDR_FORMAT,
        RDR_DATA,
        EDR_LABEL,
        EDR_SCIENCE_FORMAT,
        EDR_AUX_FORMAT,
        EDR_SCIENCE_DATA,
        EDR_AUX_DATA,
    ]:
        require_file(required)

    rdr_label_text = pds_text(RDR_LABEL)
    edr_label_text = pds_text(EDR_LABEL)
    rdr_columns = parse_column_blocks(pds_text(RDR_FORMAT))
    edr_science_columns = parse_column_blocks(pds_text(EDR_SCIENCE_FORMAT))
    edr_bit_columns = parse_bit_columns(pds_text(EDR_SCIENCE_FORMAT))

    rdr_rows = label_int(rdr_label_text, "ROWS")
    rdr_record_bytes = label_int(rdr_label_text, "ROW_BYTES")
    rdr_file_records = label_int(rdr_label_text, "FILE_RECORDS")
    rdr_dtype = build_rdr_dtype(rdr_columns, rdr_record_bytes)
    sample_count = int(rdr_columns["ECHO_SAMPLES_REAL"].items or 0)
    if sample_count <= 0:
        raise ValueError("Could not read RDR complex echo sample count")

    start_time = parse_pds_time(label_value(rdr_label_text, "START_TIME"))
    stop_time = parse_pds_time(label_value(rdr_label_text, "STOP_TIME"))
    duration_s = (stop_time - start_time).total_seconds()
    processed_trace_rate_hz = rdr_rows / duration_s
    expected_rdr_bytes = rdr_file_records * rdr_record_bytes
    if RDR_DATA.stat().st_size != expected_rdr_bytes:
        raise ValueError(f"RDR byte count mismatch: {RDR_DATA.stat().st_size} != {expected_rdr_bytes}")

    rdr = load_rdr_arrays(RDR_DATA, rdr_dtype, rdr_rows)
    trace_edges = np.floor(np.linspace(0, rdr_rows, args.output_columns + 1)).astype(np.int64)
    trace_edges[-1] = rdr_rows

    baseline_power = build_baseline_power(
        rdr,
        sample_count=sample_count,
        output_cols=args.output_columns,
        chunk_samples=args.range_chunk_size,
        trace_edges=trace_edges,
    )
    baseline_db = robust_db_from_power(baseline_power)
    surface_sample = int(np.median(np.argmax(baseline_power, axis=0)))

    alias_bands = read_alias_risk_bands(ALIAS_BANDS_CSV)
    alias_sample_ranges = alias_rows_from_usrdr_bands(
        alias_bands,
        surface_sample=surface_sample,
        sample_count=sample_count,
        display_lines=args.display_lines,
    )

    variants = [
        VariantSpec(
            key="band_0p4hz_short_aperture",
            label="0.4 Hz centered Doppler band, 8-trace aperture",
            mode="center_pass",
            bandwidth_hz=0.4,
            transition_hz=0.15,
            strength=1.0,
            aperture_traces=8,
            assumed_prf_hz=processed_trace_rate_hz,
        ),
        VariantSpec(
            key="band_1p2hz_standard_aperture",
            label="1.2 Hz centered Doppler band, 26-trace aperture",
            mode="center_pass",
            bandwidth_hz=1.2,
            transition_hz=0.25,
            strength=1.0,
            aperture_traces=26,
            assumed_prf_hz=processed_trace_rate_hz,
        ),
        VariantSpec(
            key="zero_doppler_notch_all_ranges",
            label="0.4 Hz zero-Doppler notch, all ranges",
            mode="zero_notch",
            bandwidth_hz=0.4,
            transition_hz=0.15,
            strength=0.92,
            aperture_traces=26,
            assumed_prf_hz=processed_trace_rate_hz,
        ),
        VariantSpec(
            key="alias_range_notch_prefinal",
            label="Targeted pre-final notch at modeled alias range",
            mode="zero_notch",
            bandwidth_hz=0.4,
            transition_hz=0.15,
            strength=0.92,
            aperture_traces=26,
            assumed_prf_hz=processed_trace_rate_hz,
            alias_only=True,
        ),
        VariantSpec(
            key="alias_range_notch_prf87_assumption",
            label="Same targeted notch using PRF 87.535 Hz assumption",
            mode="zero_notch",
            bandwidth_hz=0.4,
            transition_hz=0.15,
            strength=0.92,
            aperture_traces=26,
            assumed_prf_hz=RAW_PRF_HZ / PROFESSOR_ALIAS_PRESUM,
            alias_only=True,
        ),
    ]

    variant_powers = build_variant_powers(
        rdr,
        variants=variants,
        sample_count=sample_count,
        output_cols=args.output_columns,
        chunk_samples=args.range_chunk_size,
        trace_edges=trace_edges,
        processed_trace_rate_hz=processed_trace_rate_hz,
        alias_sample_ranges=alias_sample_ranges,
    )
    db_images = {"baseline_complex": baseline_db}
    db_images.update({key: robust_db_from_power(value) for key, value in variant_powers.items()})
    low, high = common_scale(list(db_images.values()))
    displays = {key: normalize_for_display(value, low, high) for key, value in db_images.items()}

    labels = {
        "baseline_complex": "Baseline complex RDR power",
        **{variant.key: variant.label for variant in variants},
    }
    png_paths: dict[str, Path] = {}
    for key, display in displays.items():
        path = output_dir / f"{key}_radargram.png"
        save_radargram_png(path, display, display_lines=args.display_lines)
        png_paths[key] = path

    npz_path = output_dir / "rdr_complex_reprocessed_radargrams.npz"
    np.savez_compressed(
        npz_path,
        **{f"{key}_power_db": value.astype(np.float32) for key, value in db_images.items()},
        display_low_db=np.array([low], dtype=np.float32),
        display_high_db=np.array([high], dtype=np.float32),
    )

    comparison_path = output_dir / "rdr_complex_filter_comparison.png"
    render_comparison(
        comparison_path,
        displays=displays,
        labels=labels,
        scale_note=(
            f"Same RDR complex echoes, common dB display scale. "
            f"RDR trace rate {processed_trace_rate_hz:.3f} Hz, {sample_count} complex range samples."
        ),
        panel_width=min(args.preview_width, 1100),
    )

    edr_quicklook: dict[str, Any] | None = None
    if not args.skip_edr_quicklook:
        edr_quicklook = make_edr_raw_quicklook(
            EDR_SCIENCE_DATA,
            edr_label_text,
            edr_science_columns,
            output_cols=args.output_columns,
            output_png=output_dir / "edr_raw_echo_quicklook.png",
            output_npz=output_dir / "edr_raw_echo_quicklook.npz",
        )

    variant_rows = [
        variant_stats(
            "baseline_complex",
            labels["baseline_complex"],
            None,
            baseline_db,
            alias_sample_ranges,
            png_paths["baseline_complex"],
        )
    ]
    for variant in variants:
        variant_rows.append(
            variant_stats(
                variant.key,
                variant.label,
                variant,
                db_images[variant.key],
                alias_sample_ranges,
                png_paths[variant.key],
            )
        )
    variant_csv = output_dir / "rdr_complex_variant_summary.csv"
    write_variant_summary(variant_csv, variant_rows)

    columns_used = {
        name: {
            "start_byte": spec.start_byte,
            "bytes": spec.bytes_count,
            "items": spec.items,
            "data_type": spec.data_type,
        }
        for name, spec in rdr_columns.items()
        if name
        in {
            "ECHO_SAMPLES_REAL",
            "ECHO_SAMPLES_IMAGINARY",
            "BLOCK_ROWS",
            "DOPPLER_BW",
            "DOPPLER_CENTROID",
            "SCET_BLOCK_WHOLE",
            "SCET_BLOCK_FRAC",
        }
    }
    manifest = {
        "orbit": 12945,
        "product_ids": {
            "rdr": label_value(rdr_label_text, "PRODUCT_ID"),
            "edr": label_value(edr_label_text, "PRODUCT_ID"),
        },
        "pds_urls": PDS_URLS,
        "files": {
            "rdr_label": file_info(RDR_LABEL),
            "rdr_format": file_info(RDR_FORMAT),
            "rdr_data": file_info(RDR_DATA, expected_rdr_bytes),
            "edr_label": file_info(EDR_LABEL),
            "edr_science_format": file_info(EDR_SCIENCE_FORMAT),
            "edr_aux_format": file_info(EDR_AUX_FORMAT),
            "edr_science_data": file_info(EDR_SCIENCE_DATA, label_int(edr_label_text, "FILE_RECORDS") * label_int(edr_label_text, "RECORD_BYTES")),
            "edr_aux_data": file_info(EDR_AUX_DATA, 122549 * 267),
        },
        "rdr_complex_layout": {
            "record_bytes": rdr_record_bytes,
            "records": rdr_rows,
            "complex_range_samples": sample_count,
            "columns_used": columns_used,
            "processed_trace_rate_hz": processed_trace_rate_hz,
            "start_time_utc": start_time.isoformat(),
            "stop_time_utc": stop_time.isoformat(),
            "duration_s": duration_s,
            "raw_prf_hz_from_1428_microsecond_pri": RAW_PRF_HZ,
            "onboard_presum_from_mode_description": ONBOARD_PRESUM,
            "professor_alias_prf_assumption_hz": RAW_PRF_HZ / PROFESSOR_ALIAS_PRESUM,
            "doppler_bw_median_hz": float(np.median(rdr["doppler_bw"])),
            "doppler_centroid_median_hz": float(np.median(rdr["doppler_centroid"])),
            "block_rows_median": float(np.median(rdr["block_rows"])),
        },
        "edr_raw_layout": {
            "science_data_column": {
                "start_byte": edr_science_columns["SCIENCE_DATA"].start_byte,
                "bytes": edr_science_columns["SCIENCE_DATA"].bytes_count,
                "bit_column": edr_bit_columns.get("ECHO_SAMPLES", {}),
            },
            "raw_quicklook": edr_quicklook,
        },
        "alias_mapping": {
            "source_csv": str(ALIAS_BANDS_CSV.relative_to(ROOT)) if ALIAS_BANDS_CSV.exists() else None,
            "surface_sample_from_baseline_complex": surface_sample,
            "usrdr_alias_bands": alias_bands,
            "mapped_rdr_alias_sample_ranges": alias_sample_ranges,
            "mapping_note": (
                "The point-target model was built on the 3600-line USRDR radargram. "
                "For targeted RDR filtering, those line offsets are scaled onto the "
                "667-sample complex echo window relative to the detected surface sample."
            ),
        },
        "processing": {
            "output_columns": args.output_columns,
            "display_lines": args.display_lines,
            "trace_group_edges": {
                "first": int(trace_edges[0]),
                "last": int(trace_edges[-1]),
                "median_traces_per_output_column": float(np.median(np.diff(trace_edges))),
            },
            "display_scale": {
                "type": "common log-power dB percentile scale",
                "low_db": low,
                "high_db": high,
            },
            "variants": variant_rows,
            "limitations": [
                "This script filters the official RDR complex-voltage echoes before detected power is rendered.",
                "It does not rebuild the full Italian SHARAD Level 1A to Level 1B range-Doppler processor from EDR.",
                "The EDR raw quicklook is raw 8-bit echo amplitude, not a focused radargram.",
                "The targeted alias filter can suppress coherent near-zero-Doppler energy but cannot recover a reflector that was not separable in the measured complex data.",
            ],
        },
        "outputs": {
            "baseline_complex_radargram_png": str(png_paths["baseline_complex"].relative_to(ROOT)),
            "prefinal_filtered_radargram_png": str(png_paths["alias_range_notch_prefinal"].relative_to(ROOT)),
            "prf_assumption_filtered_radargram_png": str(png_paths["alias_range_notch_prf87_assumption"].relative_to(ROOT)),
            "comparison_png": str(comparison_path.relative_to(ROOT)),
            "variant_summary_csv": str(variant_csv.relative_to(ROOT)),
            "reprocessed_npz": str(npz_path.relative_to(ROOT)),
        },
    }
    manifest_path = output_dir / "raw_complex_reprocessing_summary.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    print(f"Wrote {manifest_path}")
    print(f"Wrote {comparison_path}")
    print(f"Wrote {png_paths['alias_range_notch_prefinal']}")
    if edr_quicklook is not None:
        print(f"Wrote {edr_quicklook['quicklook_png']}")


if __name__ == "__main__":
    main()
