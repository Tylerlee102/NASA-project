"""Advanced complex-domain SHARAD reprocessing experiment for S_01294501.

This starts from the official RDR complex-voltage echoes for the same orbit.
It does not draw interpretation overlays. The point is to test whether a
stronger complex-domain workflow can reduce the steep clutter/focusing artifacts
before detected power is rendered into a radargram.

Implemented stages:
  1. Complex RDR read with geometry/Doppler metadata.
  2. Surface-pick based residual phase autofocus.
  3. Surface-referenced range migration correction.
  4. Doppler/zero-Doppler clutter rejection on complex traces.
  5. Complex f-k fan filtering that suppresses steep events.
  6. Multi-look detected-power radargram rendering.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import reprocess_mars_sharad_complex as base  # noqa: E402
from adaptive_sectional_mars_readability import font, image_panel  # noqa: E402


OUT_DIR = ROOT / "outputs" / "mars_sharad_s_01294501" / "raw_complex_advanced_reprocess"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=OUT_DIR)
    parser.add_argument("--output-columns", type=int, default=base.USRDR_COLUMNS)
    parser.add_argument("--range-chunk-size", type=int, default=48)
    parser.add_argument("--trace-chunk-size", type=int, default=4096)
    parser.add_argument("--keep-intermediate-complex", action="store_true")
    return parser.parse_args()


def build_advanced_dtype(columns: dict[str, base.ColumnSpec], row_bytes: int) -> np.dtype:
    fields: list[tuple[str, str, Any]] = [
        ("real", "<f4", (columns["ECHO_SAMPLES_REAL"].items or 1,)),
        ("imag", "<f4", (columns["ECHO_SAMPLES_IMAGINARY"].items or 1,)),
        ("doppler_bw", "<f4", ()),
        ("doppler_centroid", "<f4", ()),
        ("block_rows", "<u2", ()),
    ]
    optional = {
        "tlp_interpolate": ("TLP_INTERPOLATE", "<f4"),
        "radius_interpolate": ("RADIUS_INTERPOLATE", "<f4"),
        "slope": ("SLOPE", "<f4"),
        "tangential_velocity": ("TANGENTIAL_VELOCITY_INTERPOLATE", "<f4"),
        "radial_velocity": ("RADIAL_VELOCITY_INTERPOLATE", "<f4"),
        "spacecraft_altitude": ("SPACECRAFT_ALTITUDE", "<f8"),
        "sub_sc_lon": ("SUB_SC_EAST_LONGITUDE", "<f8"),
        "sub_sc_lat": ("SUB_SC_PLANETOCENTRIC_LATITUDE", "<f8"),
    }

    names: list[str] = []
    formats: list[Any] = []
    offsets: list[int] = []
    for name, fmt, shape in fields:
        col_name = {
            "real": "ECHO_SAMPLES_REAL",
            "imag": "ECHO_SAMPLES_IMAGINARY",
            "doppler_bw": "DOPPLER_BW",
            "doppler_centroid": "DOPPLER_CENTROID",
            "block_rows": "BLOCK_ROWS",
        }[name]
        col = columns[col_name]
        names.append(name)
        formats.append((fmt, shape) if shape else fmt)
        offsets.append(col.offset)

    for name, (col_name, fmt) in optional.items():
        if col_name in columns:
            names.append(name)
            formats.append(fmt)
            offsets.append(columns[col_name].offset)

    return np.dtype({"names": names, "formats": formats, "offsets": offsets, "itemsize": row_bytes})


def rolling_mean(values: np.ndarray, radius: int) -> np.ndarray:
    if radius <= 0:
        return values.astype(np.float32, copy=True)
    padded = np.pad(values.astype(np.float64), (radius, radius), mode="edge")
    prefix = np.concatenate([[0.0], np.cumsum(padded)])
    width = radius * 2 + 1
    return ((prefix[width:] - prefix[:-width]) / float(width)).astype(np.float32)


def smoothstep(values: np.ndarray, edge0: float, edge1: float) -> np.ndarray:
    if edge1 <= edge0:
        return (values >= edge1).astype(np.float32)
    x = np.clip((values - edge0) / (edge1 - edge0), 0.0, 1.0)
    return (x * x * (3.0 - 2.0 * x)).astype(np.float32)


def dark_radargram_grade(display: np.ndarray) -> np.ndarray:
    work = np.clip(display, 0.0, 1.0).astype(np.float32)
    low, high = np.percentile(work, [0.35, 99.86])
    if not math.isfinite(float(low)) or not math.isfinite(float(high)) or high <= low:
        return work
    graded = np.clip((work - low) / (high - low), 0.0, 1.0)
    graded = graded**1.48
    graded = np.clip((graded - 0.030) * 1.08, 0.0, 1.0)
    return graded.astype(np.float32)


def read_echo_chunk(rdr: np.memmap, start: int, end: int) -> np.ndarray:
    return (rdr["real"][start:end].astype(np.float32) + 1j * rdr["imag"][start:end].astype(np.float32)).astype(np.complex64)


def estimate_surface_and_phase(
    rdr: np.memmap,
    *,
    trace_chunk_size: int,
    search_start: int = 55,
    search_end: int = 280,
) -> dict[str, np.ndarray | int]:
    n_traces = len(rdr)
    picks = np.empty(n_traces, dtype=np.float32)
    amps = np.empty(n_traces, dtype=np.float32)
    surface_complex = np.empty(n_traces, dtype=np.complex64)

    for start in range(0, n_traces, trace_chunk_size):
        end = min(n_traces, start + trace_chunk_size)
        echo = read_echo_chunk(rdr, start, end)
        power = np.square(echo.real, dtype=np.float32) + np.square(echo.imag, dtype=np.float32)
        local_pick = np.argmax(power[:, search_start:search_end], axis=1) + search_start
        rows = np.arange(end - start)
        picks[start:end] = local_pick.astype(np.float32)
        amps[start:end] = np.sqrt(power[rows, local_pick]).astype(np.float32)
        surface_complex[start:end] = echo[rows, local_pick]

    cleaned = picks.copy()
    for radius, cutoff in [(501, 42.0), (1001, 34.0), (1801, 28.0)]:
        smooth = rolling_mean(cleaned, radius)
        bad = np.abs(cleaned - smooth) > cutoff
        cleaned[bad] = smooth[bad]
    smooth_pick = rolling_mean(cleaned, 301)
    target_sample = int(round(float(np.median(smooth_pick))))

    phase = np.unwrap(np.angle(surface_complex).astype(np.float64)).astype(np.float32)
    amp_floor = float(np.percentile(amps[np.isfinite(amps)], 25.0))
    reliable = amps >= amp_floor
    if np.any(~reliable) and np.any(reliable):
        trace_axis = np.arange(n_traces)
        phase[~reliable] = np.interp(trace_axis[~reliable], trace_axis[reliable], phase[reliable]).astype(np.float32)
    phase_smooth = rolling_mean(phase, 19)
    phase_background = rolling_mean(phase_smooth, 1501)
    phase_residual = phase_smooth - phase_background

    centroid = rdr["doppler_centroid"].astype(np.float32)
    centroid = centroid - float(np.median(centroid[np.isfinite(centroid)]))
    centroid = rolling_mean(centroid, 101)
    trace_rate = len(rdr) / 700.02
    centroid_phase = (2.0 * math.pi * np.cumsum(centroid / trace_rate)).astype(np.float32)
    centroid_phase = centroid_phase - rolling_mean(centroid_phase, 2501)

    total_phase = phase_residual + 0.35 * centroid_phase
    phase_correction = np.exp(-1j * total_phase).astype(np.complex64)

    return {
        "raw_surface_pick": picks,
        "smoothed_surface_pick": smooth_pick,
        "surface_amplitude": amps,
        "target_sample": target_sample,
        "phase_correction": phase_correction,
        "phase_residual": phase_residual,
        "centroid_phase": centroid_phase,
    }


def migrate_and_focus_to_memmap(
    rdr: np.memmap,
    output_path: Path,
    *,
    surface_pick: np.ndarray,
    target_sample: int,
    phase_correction: np.ndarray,
    trace_chunk_size: int,
) -> np.memmap:
    sample_count = int(rdr["real"].shape[1])
    n_traces = len(rdr)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    migrated = np.memmap(output_path, dtype=np.complex64, mode="w+", shape=(sample_count, n_traces))
    freq_range = np.fft.fftfreq(sample_count).astype(np.float32)

    for start in range(0, n_traces, trace_chunk_size):
        end = min(n_traces, start + trace_chunk_size)
        echo = read_echo_chunk(rdr, start, end)
        echo *= phase_correction[start:end, np.newaxis]
        shifts = (float(target_sample) - surface_pick[start:end]).astype(np.float32)
        shift_phase = np.exp(-2j * math.pi * shifts[:, np.newaxis] * freq_range[np.newaxis, :]).astype(np.complex64)
        shifted = np.fft.ifft(np.fft.fft(echo, axis=1) * shift_phase, axis=1).astype(np.complex64)
        migrated[:, start:end] = shifted.T

    migrated.flush()
    return migrated


def make_trace_edges(n_traces: int, output_cols: int) -> np.ndarray:
    edges = np.floor(np.linspace(0, n_traces, output_cols + 1)).astype(np.int64)
    edges[-1] = n_traces
    return edges


def downsample_power(power: np.ndarray, edges: np.ndarray) -> np.ndarray:
    starts = edges[:-1]
    counts = np.diff(edges).astype(np.float32)
    sums = np.add.reduceat(power, starts, axis=1)[:, : len(starts)]
    return (sums / counts[np.newaxis, :]).astype(np.float32)


def lowpass_mask(freq_hz: np.ndarray, half_band_hz: float, transition_hz: float) -> np.ndarray:
    distance = np.abs(freq_hz)
    mask = np.ones(freq_hz.shape, dtype=np.float32)
    mask[distance >= half_band_hz + transition_hz] = 0.0
    ramp = (distance > half_band_hz) & (distance < half_band_hz + transition_hz)
    if np.any(ramp):
        t = (distance[ramp] - half_band_hz) / transition_hz
        mask[ramp] = 1.0 - (t * t * (3.0 - 2.0 * t))
    return mask


def aperture_smooth(values: np.ndarray, width: int) -> np.ndarray:
    return base.moving_average_complex(values.astype(np.complex64), width)


def zero_doppler_notch(values: np.ndarray, trace_rate_hz: float, *, half_band_hz: float, transition_hz: float, strength: float) -> np.ndarray:
    freq = np.fft.fftfreq(values.shape[1], d=1.0 / trace_rate_hz).astype(np.float32)
    low = lowpass_mask(freq, half_band_hz, transition_hz)
    mask = (1.0 - strength * low).astype(np.float32)
    return np.fft.ifft(np.fft.fft(values, axis=1) * mask[np.newaxis, :], axis=1).astype(np.complex64)


def centered_doppler_band(values: np.ndarray, trace_rate_hz: float, *, bandwidth_hz: float, transition_hz: float) -> np.ndarray:
    freq = np.fft.fftfreq(values.shape[1], d=1.0 / trace_rate_hz).astype(np.float32)
    mask = lowpass_mask(freq, bandwidth_hz / 2.0, transition_hz)
    return np.fft.ifft(np.fft.fft(values, axis=1) * mask[np.newaxis, :], axis=1).astype(np.complex64)


def fk_steep_clutter_filter(values: np.ndarray) -> np.ndarray:
    rows, cols = values.shape
    spectrum = np.fft.fft2(values)
    ky = np.fft.fftfreq(rows).astype(np.float32)[:, np.newaxis]
    kx = np.fft.fftfreq(cols).astype(np.float32)[np.newaxis, :]
    dip = np.abs(kx) / (np.abs(ky) + 1.0e-4)
    steep = smoothstep(dip, 0.060, 0.220)
    low_frequency = np.exp(-((kx / 0.018) ** 2 + (ky / 0.055) ** 2)).astype(np.float32)
    fan = np.clip(1.0 - 0.72 * steep, 0.20, 1.0)
    fan = np.maximum(fan, 0.36 * low_frequency)
    return np.fft.ifft2(spectrum * fan).astype(np.complex64)


def low_rank_clutter_reject(values: np.ndarray, strength: float = 0.72) -> np.ndarray:
    centered = values - np.mean(values, axis=1, keepdims=True)
    covariance = centered @ centered.conj().T / float(max(centered.shape[1], 1))
    eigvals, eigvecs = np.linalg.eigh(covariance)
    order = np.argsort(eigvals)[::-1]
    components = eigvecs[:, order[:2]]
    clutter = components @ (components.conj().T @ centered)
    return (values - strength * clutter).astype(np.complex64)


def build_advanced_products(
    migrated: np.memmap,
    *,
    output_columns: int,
    range_chunk_size: int,
    trace_rate_hz: float,
) -> dict[str, np.ndarray]:
    sample_count, n_traces = migrated.shape
    trace_edges = make_trace_edges(n_traces, output_columns)
    outputs = {
        "advanced_focus_migration": np.empty((sample_count, output_columns), dtype=np.float32),
        "advanced_doppler_clutter_reject": np.empty((sample_count, output_columns), dtype=np.float32),
        "advanced_fk_migration_clutter_reject": np.empty((sample_count, output_columns), dtype=np.float32),
        "advanced_lowrank_fk_final": np.empty((sample_count, output_columns), dtype=np.float32),
    }

    for start in range(0, sample_count, range_chunk_size):
        end = min(sample_count, start + range_chunk_size)
        block = np.asarray(migrated[start:end], dtype=np.complex64)

        focused = aperture_smooth(centered_doppler_band(block, trace_rate_hz, bandwidth_hz=7.5, transition_hz=0.8), 9)
        notch = aperture_smooth(zero_doppler_notch(focused, trace_rate_hz, half_band_hz=0.55, transition_hz=0.25, strength=0.90), 17)
        fk = aperture_smooth(fk_steep_clutter_filter(notch), 19)
        final = aperture_smooth(fk_steep_clutter_filter(low_rank_clutter_reject(fk, strength=0.58)), 23)

        outputs["advanced_focus_migration"][start:end] = downsample_power(
            np.square(focused.real, dtype=np.float32) + np.square(focused.imag, dtype=np.float32),
            trace_edges,
        )
        outputs["advanced_doppler_clutter_reject"][start:end] = downsample_power(
            np.square(notch.real, dtype=np.float32) + np.square(notch.imag, dtype=np.float32),
            trace_edges,
        )
        outputs["advanced_fk_migration_clutter_reject"][start:end] = downsample_power(
            np.square(fk.real, dtype=np.float32) + np.square(fk.imag, dtype=np.float32),
            trace_edges,
        )
        outputs["advanced_lowrank_fk_final"][start:end] = downsample_power(
            np.square(final.real, dtype=np.float32) + np.square(final.imag, dtype=np.float32),
            trace_edges,
        )

    return outputs


def save_gray(path: Path, display: np.ndarray, *, height: int | None = None) -> None:
    image = Image.fromarray(np.uint8(np.clip(display, 0.0, 1.0) * 255), mode="L")
    if height is not None and height > 0 and height != image.height:
        image = image.resize((image.width, height), Image.Resampling.BILINEAR)
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path)


def render_comparison_sheet(path: Path, displays: dict[str, np.ndarray], labels: dict[str, str]) -> None:
    keys = list(displays)
    width = 1800
    margin = 22
    header_h = 92
    label_h = 44
    panel_w = (width - margin * 3) // 2
    panel_h = 390
    rows = math.ceil(len(keys) / 2)
    height = header_h + rows * (panel_h + label_h + margin) + margin
    canvas = Image.new("RGB", (width, height), "#fbfaf6")
    draw = ImageDraw.Draw(canvas, "RGBA")
    title_font = font("segoeuib.ttf", 26)
    body_font = font("segoeui.ttf", 14)
    label_font = font("segoeuib.ttf", 15)
    note_font = font("segoeui.ttf", 12)

    draw.text((margin, 18), "Raw/complex SHARAD reprocessing test", fill=(31, 36, 48, 255), font=title_font)
    draw.text(
        (margin, 55),
        "These are plain grayscale radargrams made after complex focusing, migration correction, and clutter rejection.",
        fill=(92, 99, 115, 255),
        font=body_font,
    )

    for index, key in enumerate(keys):
        col = index % 2
        row = index // 2
        x = margin + col * (panel_w + margin)
        y = header_h + margin + row * (panel_h + label_h + margin)
        canvas.paste(image_panel(displays[key], panel_w, panel_h), (x, y))
        draw.rectangle((x, y, x + panel_w - 1, y + panel_h - 1), outline=(210, 214, 224, 255), width=1)
        draw.text((x, y + panel_h + 8), labels[key], fill=(31, 36, 48, 255), font=label_font)

    draw.text(
        (margin, height - 21),
        "No overlays or fake fill are drawn. Stronger rejection can remove real dipping returns too.",
        fill=(100, 105, 116, 255),
        font=note_font,
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(path)


def render_zoom_sheet(path: Path, displays: dict[str, np.ndarray], crop_box: tuple[int, int, int, int]) -> None:
    col0, col1, row0, row1 = crop_box
    zooms = {key: value[row0:row1, col0:col1] for key, value in displays.items()}
    render_comparison_sheet(path, zooms, {key: key.replace("_", " ").title() for key in zooms})


def main() -> None:
    args = parse_args()
    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    label_text = base.pds_text(base.RDR_LABEL)
    columns = base.parse_column_blocks(base.pds_text(base.RDR_FORMAT))
    rows = base.label_int(label_text, "ROWS")
    record_bytes = base.label_int(label_text, "ROW_BYTES")
    dtype = build_advanced_dtype(columns, record_bytes)
    rdr = np.memmap(base.RDR_DATA, dtype=dtype, mode="r", shape=(rows,))
    sample_count = int(columns["ECHO_SAMPLES_REAL"].items or 0)
    trace_rate_hz = rows / 700.02

    diagnostics = estimate_surface_and_phase(rdr, trace_chunk_size=args.trace_chunk_size)
    intermediate_path = output_dir / "advanced_surface_migrated_complex.dat"
    migrated = migrate_and_focus_to_memmap(
        rdr,
        intermediate_path,
        surface_pick=diagnostics["smoothed_surface_pick"],
        target_sample=int(diagnostics["target_sample"]),
        phase_correction=diagnostics["phase_correction"],
        trace_chunk_size=args.trace_chunk_size,
    )
    products = build_advanced_products(
        migrated,
        output_columns=args.output_columns,
        range_chunk_size=args.range_chunk_size,
        trace_rate_hz=trace_rate_hz,
    )

    db_images = {key: base.robust_db_from_power(power) for key, power in products.items()}
    low, high = base.common_scale(list(db_images.values()), low_pct=1.0, high_pct=99.88)
    displays = {key: dark_radargram_grade(base.normalize_for_display(db, low, high)) for key, db in db_images.items()}

    labels = {
        "advanced_focus_migration": "Residual focus + migration correction",
        "advanced_doppler_clutter_reject": "Complex Doppler clutter rejection",
        "advanced_fk_migration_clutter_reject": "Recommended balanced f-k clutter rejection",
        "advanced_lowrank_fk_final": "Aggressive low-rank + f-k rejection",
    }

    png_paths: dict[str, str] = {}
    for key, display in displays.items():
        path = output_dir / f"{key}.png"
        save_gray(path, display, height=1100)
        png_paths[key] = str(path)

    recommended_path = output_dir / "recommended_raw_complex_reprocessed_radargram.png"
    aggressive_path = output_dir / "aggressive_raw_complex_reprocessed_radargram.png"
    save_gray(recommended_path, displays["advanced_fk_migration_clutter_reject"], height=1100)
    save_gray(aggressive_path, displays["advanced_lowrank_fk_final"], height=1100)

    comparison_path = output_dir / "advanced_complex_reprocessing_comparison.png"
    render_comparison_sheet(comparison_path, displays, labels)

    zoom_path = output_dir / "advanced_complex_reprocessing_zoom.png"
    render_zoom_sheet(
        zoom_path,
        {
            "Focus + Migration": displays["advanced_focus_migration"],
            "Doppler Reject": displays["advanced_doppler_clutter_reject"],
            "Recommended Balanced": displays["advanced_fk_migration_clutter_reject"],
            "Aggressive": displays["advanced_lowrank_fk_final"],
        },
        crop_box=(1450, 4320, 80, min(sample_count, 520)),
    )

    npz_path = output_dir / "advanced_complex_reprocessed_radargrams.npz"
    np.savez_compressed(
        npz_path,
        **{f"{key}_power_db": value.astype(np.float32) for key, value in db_images.items()},
        raw_surface_pick=diagnostics["raw_surface_pick"].astype(np.float32),
        smoothed_surface_pick=diagnostics["smoothed_surface_pick"].astype(np.float32),
        surface_amplitude=diagnostics["surface_amplitude"].astype(np.float32),
        phase_residual=diagnostics["phase_residual"].astype(np.float32),
        centroid_phase=diagnostics["centroid_phase"].astype(np.float32),
        display_low_db=np.asarray(low, dtype=np.float32),
        display_high_db=np.asarray(high, dtype=np.float32),
    )

    summary = {
        "orbit": "S_01294501 / R_1294501_001_SS19_700_A",
        "source": "official SHARAD RDR complex-voltage product",
        "input_shape": {"complex_traces": int(rows), "complex_range_samples": int(sample_count)},
        "trace_rate_hz": float(trace_rate_hz),
        "target_surface_sample": int(diagnostics["target_sample"]),
        "processing_steps": [
            "estimate surface return per complex trace",
            "residual surface-phase autofocus plus mild Doppler-centroid phase compensation",
            "Fourier range shift to align the surface return and correct range walk/migration",
            "centered Doppler aperture focusing",
            "complex zero-Doppler clutter rejection",
            "complex f-k fan filtering to suppress steep events before detected power",
            "low-rank complex clutter removal in range chunks",
            "multi-look detected-power rendering",
        ],
        "important_limits": [
            "This uses RDR complex-voltage echoes, not only the rendered radargram image.",
            "The available RDR product is already range-compressed and Doppler processed by the official processor.",
            "A complete from-EDR Level-1 processor would also need the full SHARAD reference chirp/calibration chain.",
            "The final rejected product is better for readability, but strong clutter rejection can also suppress real dipping reflectors.",
        ],
        "outputs": {
            **png_paths,
            "recommended_balanced": str(recommended_path),
            "aggressive": str(aggressive_path),
            "comparison": str(comparison_path),
            "zoom": str(zoom_path),
            "data_npz": str(npz_path),
            "intermediate_complex": str(intermediate_path) if args.keep_intermediate_complex else None,
        },
    }
    summary_path = output_dir / "advanced_complex_reprocessing_summary.json"
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    if not args.keep_intermediate_complex:
        migrated._mmap.close()
        try:
            intermediate_path.unlink()
        except OSError:
            pass

    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
