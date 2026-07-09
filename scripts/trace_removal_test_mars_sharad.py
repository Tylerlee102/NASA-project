"""Run trace-removal and gap-fill tests on the Mars SHARAD radargram.

The test uses the same-orbit RDR complex-derived radargram as the baseline:

1. Start from the baseline radargram.
2. Compute its along-track FFT spectrum.
3. Keep every Nth trace to simulate lowering PRF / trace rate.
4. Fill the missing traces back by interpolation.
5. Compare original, trace-removed, and filled data in image and FFT domains.

This is a diagnostic test. Interpolated traces are display/processing products,
not new measurements.
"""

from __future__ import annotations

import csv
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_ROOT = ROOT / "outputs" / "mars_sharad_s_01294501"
COMPLEX_NPZ = OUTPUT_ROOT / "raw_complex_reprocess" / "rdr_complex_reprocessed_radargrams.npz"
COMPLEX_SUMMARY = OUTPUT_ROOT / "raw_complex_reprocess" / "raw_complex_reprocessing_summary.json"
OUT_DIR = OUTPUT_ROOT / "trace_removal_real_data_test"


def require_file(path: Path) -> None:
    if not path.exists():
        raise FileNotFoundError(path)


def font(name: str, size: int) -> ImageFont.ImageFont:
    try:
        return ImageFont.truetype(name, size)
    except OSError:
        return ImageFont.load_default()


def load_baseline_crop() -> tuple[np.ndarray, dict[str, object]]:
    require_file(COMPLEX_NPZ)
    data = np.load(COMPLEX_NPZ)
    baseline = data["baseline_complex_power_db"].astype(np.float32)
    surface_row = int(np.median(np.argmax(baseline, axis=0)))
    start = max(0, surface_row - 28)
    end = min(baseline.shape[0], surface_row + 250)
    crop = baseline[start:end].astype(np.float32)
    metadata: dict[str, object] = {
        "source_npz": str(COMPLEX_NPZ.relative_to(ROOT)),
        "baseline_shape": list(baseline.shape),
        "crop_shape": list(crop.shape),
        "surface_row": surface_row,
        "crop_start_row": start,
        "crop_end_row": end,
    }
    if COMPLEX_SUMMARY.exists():
        summary = json.loads(COMPLEX_SUMMARY.read_text(encoding="utf-8"))
        layout = summary.get("rdr_complex_layout", {})
        duration_s = float(layout.get("duration_s", 700.02))
        output_cols = int(summary.get("processing", {}).get("output_columns", baseline.shape[1]))
        metadata["duration_s"] = duration_s
        metadata["output_trace_rate_hz"] = output_cols / duration_s
        metadata["rdr_processed_trace_rate_hz"] = layout.get("processed_trace_rate_hz")
    else:
        metadata["duration_s"] = None
        metadata["output_trace_rate_hz"] = None
    return crop, metadata


def robust_scale(values: np.ndarray, low_pct: float = 1.0, high_pct: float = 99.7) -> np.ndarray:
    finite = values[np.isfinite(values)]
    if finite.size == 0:
        return np.zeros(values.shape, dtype=np.float32)
    low, high = np.percentile(finite, [low_pct, high_pct])
    if not math.isfinite(float(low)) or not math.isfinite(float(high)) or high <= low:
        low, high = float(finite.min()), float(finite.max())
    if high <= low:
        return np.zeros(values.shape, dtype=np.float32)
    scaled = np.clip((values - low) / (high - low), 0.0, 1.0)
    scaled[~np.isfinite(scaled)] = 0.0
    return scaled.astype(np.float32)


def normalize_common(arrays: list[np.ndarray], low_pct: float = 1.0, high_pct: float = 99.7) -> list[np.ndarray]:
    parts = []
    for array in arrays:
        finite = array[np.isfinite(array)].ravel()
        if finite.size > 500_000:
            finite = finite[:: max(1, finite.size // 500_000)]
        if finite.size:
            parts.append(finite.astype(np.float32, copy=False))
    if not parts:
        return [np.zeros_like(array, dtype=np.float32) for array in arrays]
    combined = np.concatenate(parts)
    low, high = np.percentile(combined, [low_pct, high_pct])
    if high <= low:
        high = low + 1.0
    return [np.clip((array - low) / (high - low), 0.0, 1.0).astype(np.float32) for array in arrays]


def keep_every_n(values: np.ndarray, factor: int) -> np.ndarray:
    return values[:, ::factor].astype(np.float32)


def missing_grid(values: np.ndarray, factor: int) -> np.ndarray:
    floor = float(np.percentile(values[np.isfinite(values)], 1.0))
    grid = np.full(values.shape, floor, dtype=np.float32)
    grid[:, ::factor] = values[:, ::factor]
    return grid


def linear_fill(decimated: np.ndarray, original_width: int, factor: int) -> np.ndarray:
    x_keep = np.arange(decimated.shape[1], dtype=np.float32) * factor
    x_full = np.arange(original_width, dtype=np.float32)
    filled = np.empty((decimated.shape[0], original_width), dtype=np.float32)
    for row in range(decimated.shape[0]):
        filled[row] = np.interp(x_full, x_keep, decimated[row], left=decimated[row, 0], right=decimated[row, -1])
    return filled


def fft_spectrum(values: np.ndarray, sample_spacing_traces: float) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    work = values.astype(np.float32)
    work = work - np.mean(work, axis=1, keepdims=True)
    if work.shape[1] > 1:
        window = np.hanning(work.shape[1]).astype(np.float32)
        work = work * window[np.newaxis, :]
    spectrum = np.fft.fftshift(np.fft.fft(work, axis=1), axes=1)
    power = np.mean(np.abs(spectrum) ** 2, axis=0).astype(np.float64)
    power_db = 10.0 * np.log10(np.maximum(power, np.percentile(power[power > 0], 0.1) if np.any(power > 0) else 1e-12))
    power_db = power_db - float(np.max(power_db))
    freq = np.fft.fftshift(np.fft.fftfreq(work.shape[1], d=sample_spacing_traces)).astype(np.float64)
    return freq, power_db.astype(np.float32), power.astype(np.float64)


def band_energy(freq: np.ndarray, power: np.ndarray, low: float, high: float) -> float:
    mask = (np.abs(freq) >= low) & (np.abs(freq) < high)
    if not np.any(mask):
        return 0.0
    return float(np.sum(power[mask]))


def total_energy(power: np.ndarray) -> float:
    return float(np.sum(power))


def correlation(a: np.ndarray, b: np.ndarray) -> float:
    aa = a[np.isfinite(a) & np.isfinite(b)].ravel()
    bb = b[np.isfinite(a) & np.isfinite(b)].ravel()
    if aa.size < 2:
        return 0.0
    aa = aa - aa.mean()
    bb = bb - bb.mean()
    denom = float(np.sqrt(np.sum(aa * aa) * np.sum(bb * bb)))
    if denom <= 0:
        return 0.0
    return float(np.sum(aa * bb) / denom)


def interpolate_power_to(freq_source: np.ndarray, power_source: np.ndarray, freq_target: np.ndarray) -> np.ndarray:
    order = np.argsort(freq_source)
    return np.interp(freq_target, freq_source[order], power_source[order], left=np.nan, right=np.nan)


def save_image(path: Path, display: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.uint8(np.clip(display, 0, 1) * 255), mode="L").save(path)


def image_panel(display: np.ndarray, width: int, height: int) -> Image.Image:
    image = Image.fromarray(np.uint8(np.clip(display, 0, 1) * 255), mode="L").convert("RGB")
    return image.resize((width, height), Image.Resampling.BILINEAR)


def render_radargram_comparison(
    path: Path,
    factor: int,
    original: np.ndarray,
    removed_grid: np.ndarray,
    filled: np.ndarray,
    difference: np.ndarray,
) -> None:
    common_original, common_removed, common_filled = normalize_common([original, removed_grid, filled])
    difference_display = robust_scale(difference, low_pct=1.0, high_pct=99.4)

    width = 1800
    margin = 22
    header_h = 88
    panel_w = (width - margin * 3) // 2
    panel_h = 430
    label_h = 46
    height = header_h + 2 * (panel_h + label_h + margin) + margin + 22
    canvas = Image.new("RGB", (width, height), "#fbfaf6")
    draw = ImageDraw.Draw(canvas, "RGBA")
    title_font = font("segoeuib.ttf", 26)
    body_font = font("segoeui.ttf", 14)
    label_font = font("segoeuib.ttf", 15)
    note_font = font("segoeui.ttf", 12)
    draw.text((margin, 18), f"Mars SHARAD trace-removal test: keep every {factor}th trace", fill=(31, 36, 48, 255), font=title_font)
    draw.text(
        (margin, 53),
        "Image-domain comparison: original, artificial trace removal, interpolation fill, and absolute fill error.",
        fill=(92, 99, 115, 255),
        font=body_font,
    )
    panels = [
        ("Original baseline", "RDR complex-derived radargram crop.", common_original),
        ("Trace-removed", f"Only every {factor}th trace retained; missing slots shown dark.", common_removed),
        ("Gap-filled", "Missing traces filled by linear interpolation.", common_filled),
        ("Absolute difference", "What interpolation failed to reproduce from the original.", difference_display),
    ]
    for index, (title, subtitle, display) in enumerate(panels):
        col = index % 2
        row = index // 2
        x = margin + col * (panel_w + margin)
        y = header_h + margin + row * (panel_h + label_h + margin)
        canvas.paste(image_panel(display, panel_w, panel_h), (x, y))
        draw.rectangle((x, y, x + panel_w - 1, y + panel_h - 1), outline=(210, 214, 224, 255), width=1)
        draw.text((x, y + panel_h + 8), title, fill=(31, 36, 48, 255), font=label_font)
        draw.text((x, y + panel_h + 29), subtitle, fill=(96, 102, 116, 255), font=note_font)
    draw.text(
        (margin, height - 22),
        "The filled image can look smoother, but the difference panel shows information that interpolation did not restore.",
        fill=(100, 105, 116, 255),
        font=note_font,
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(path)


def line_points(freq: np.ndarray, power_db: np.ndarray, box: tuple[int, int, int, int], x_min: float, x_max: float, y_min: float, y_max: float) -> list[tuple[float, float]]:
    x0, y0, x1, y1 = box
    mask = (freq >= x_min) & (freq <= x_max) & np.isfinite(power_db)
    f = freq[mask]
    p = power_db[mask]
    if f.size == 0:
        return []
    if f.size > 1000:
        step = max(1, f.size // 1000)
        f = f[::step]
        p = p[::step]
    xs = x0 + (f - x_min) / (x_max - x_min) * (x1 - x0)
    ys = y1 - (p - y_min) / (y_max - y_min) * (y1 - y0)
    return list(zip(xs.tolist(), ys.tolist()))


def render_fft_comparison(
    path: Path,
    factor: int,
    original_fft: tuple[np.ndarray, np.ndarray, np.ndarray],
    decimated_fft: tuple[np.ndarray, np.ndarray, np.ndarray],
    filled_fft: tuple[np.ndarray, np.ndarray, np.ndarray],
    metrics: dict[str, object],
) -> None:
    width, height = 1700, 760
    margin_l, margin_r, margin_t, margin_b = 94, 42, 102, 100
    plot_box = (margin_l, margin_t, width - margin_r, height - margin_b)
    x_min, x_max = -0.5, 0.5
    y_min, y_max = -58.0, 1.5
    new_nyq = 0.5 / factor

    canvas = Image.new("RGB", (width, height), "#fbfaf6")
    draw = ImageDraw.Draw(canvas, "RGBA")
    title_font = font("segoeuib.ttf", 26)
    body_font = font("segoeui.ttf", 14)
    small_font = font("segoeui.ttf", 12)
    legend_font = font("segoeuib.ttf", 13)

    draw.text((26, 18), f"Along-track FFT/Doppler comparison: keep every {factor}th trace", fill=(31, 36, 48, 255), font=title_font)
    draw.text(
        (26, 54),
        "Frequency is cycles per original trace. Dashed lines mark the lower Nyquist limit after trace removal.",
        fill=(92, 99, 115, 255),
        font=body_font,
    )

    x0, y0, x1, y1 = plot_box
    draw.rectangle(plot_box, fill=(255, 255, 255, 255), outline=(210, 214, 224, 255), width=1)
    for frac in np.linspace(0, 1, 6):
        y = y0 + frac * (y1 - y0)
        draw.line((x0, y, x1, y), fill=(230, 232, 238, 255), width=1)
    for value in np.linspace(-0.5, 0.5, 9):
        x = x0 + (value - x_min) / (x_max - x_min) * (x1 - x0)
        draw.line((x, y1, x, y1 + 8), fill=(120, 126, 140, 255), width=1)
        draw.text((x, y1 + 14), f"{value:.2f}", fill=(90, 96, 112, 255), font=small_font, anchor="ma")
    for value in [-50, -40, -30, -20, -10, 0]:
        y = y1 - (value - y_min) / (y_max - y_min) * (y1 - y0)
        draw.line((x0 - 8, y, x0, y), fill=(120, 126, 140, 255), width=1)
        draw.text((x0 - 14, y), f"{value}", fill=(90, 96, 112, 255), font=small_font, anchor="rm")

    for nyq in [-new_nyq, new_nyq]:
        x = x0 + (nyq - x_min) / (x_max - x_min) * (x1 - x0)
        draw.line((x, y0, x, y1), fill=(204, 111, 59, 220), width=2)
    draw.text(
        (x0 + (new_nyq - x_min) / (x_max - x_min) * (x1 - x0) + 8, y0 + 10),
        "new Nyquist",
        fill=(128, 65, 38, 255),
        font=small_font,
    )

    series = [
        ("Original", original_fft, (84, 119, 196, 255)),
        ("Trace-removed", decimated_fft, (204, 111, 59, 255)),
        ("Gap-filled", filled_fft, (113, 180, 54, 255)),
    ]
    for label, (freq, power_db, _), color in series:
        points = line_points(freq, power_db, plot_box, x_min, x_max, y_min, y_max)
        if len(points) > 1:
            draw.line(points, fill=color, width=2)

    legend_x, legend_y = x0, y0 - 28
    for label, _, color in series:
        draw.line((legend_x, legend_y, legend_x + 28, legend_y), fill=color, width=4)
        draw.text((legend_x + 36, legend_y - 9), label, fill=(45, 50, 61, 255), font=legend_font)
        legend_x += 190

    callout = (
        f"Original energy above new Nyquist: {metrics['original_energy_above_new_nyquist_pct']:.1f}%  |  "
        f"Filled recovers high-frequency energy: {metrics['filled_highfreq_recovery_pct']:.1f}%  |  "
        f"Filled/original corr: {metrics['filled_vs_original_corr']:.3f}"
    )
    draw.text((x0, height - 50), callout, fill=(31, 36, 48, 255), font=body_font)
    draw.text((x0 + (x1 - x0) / 2, height - 24), "Along-track spatial frequency (cycles per original trace)", fill=(92, 99, 115, 255), font=small_font, anchor="mm")
    draw.text((30, y0 + (y1 - y0) / 2), "Relative power (dB)", fill=(92, 99, 115, 255), font=small_font, anchor="mm")
    path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(path)


def summarize_factor(original: np.ndarray, decimated: np.ndarray, filled: np.ndarray, factor: int) -> tuple[dict[str, object], tuple[np.ndarray, np.ndarray, np.ndarray], tuple[np.ndarray, np.ndarray, np.ndarray], tuple[np.ndarray, np.ndarray, np.ndarray]]:
    original_fft = fft_spectrum(original, sample_spacing_traces=1.0)
    decimated_fft = fft_spectrum(decimated, sample_spacing_traces=float(factor))
    filled_fft = fft_spectrum(filled, sample_spacing_traces=1.0)
    new_nyq = 0.5 / factor

    original_total = total_energy(original_fft[2])
    filled_total = total_energy(filled_fft[2])
    original_hf = band_energy(original_fft[0], original_fft[2], new_nyq, 0.5)
    filled_hf = band_energy(filled_fft[0], filled_fft[2], new_nyq, 0.5)
    low_band = max(0.015, new_nyq * 0.22)
    original_low = band_energy(original_fft[0], original_fft[2], 0.0, low_band)
    decimated_low = band_energy(decimated_fft[0], decimated_fft[2], 0.0, low_band)
    filled_low = band_energy(filled_fft[0], filled_fft[2], 0.0, low_band)

    filled_rmse = float(np.sqrt(np.mean((filled - original) ** 2)))
    decimated_to_full = linear_fill(decimated, original.shape[1], factor)
    metrics: dict[str, object] = {
        "factor": factor,
        "kept_trace_count": int(decimated.shape[1]),
        "original_trace_count": int(original.shape[1]),
        "kept_trace_fraction": float(decimated.shape[1] / original.shape[1]),
        "new_nyquist_cycles_per_original_trace": float(new_nyq),
        "original_energy_above_new_nyquist_pct": float(100.0 * original_hf / max(original_total, 1e-12)),
        "filled_highfreq_energy_pct": float(100.0 * filled_hf / max(filled_total, 1e-12)),
        "filled_highfreq_recovery_pct": float(100.0 * filled_hf / max(original_hf, 1e-12)),
        "original_lowband_energy": float(original_low),
        "decimated_lowband_energy": float(decimated_low),
        "filled_lowband_energy": float(filled_low),
        "decimated_lowband_vs_original_ratio": float(decimated_low / max(original_low, 1e-12)),
        "filled_lowband_vs_original_ratio": float(filled_low / max(original_low, 1e-12)),
        "filled_vs_original_rmse_db": filled_rmse,
        "filled_vs_original_mae_db": float(np.mean(np.abs(filled - original))),
        "filled_vs_original_corr": correlation(original, filled),
        "decimated_interpolated_vs_original_corr": correlation(original, decimated_to_full),
        "interpretation": (
            "Interpolation smooths the missing columns but cannot restore energy above the lower Nyquist limit; "
            "any aliased low-frequency energy created by trace removal remains in-band after filling."
        ),
    }
    return metrics, original_fft, decimated_fft, filled_fft


def write_metrics_csv(path: Path, rows: list[dict[str, object]]) -> None:
    fieldnames = list(rows[0].keys())
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def render_summary_sheet(path: Path, factor_results: list[dict[str, object]]) -> None:
    width, height = 1500, 760
    margin = 44
    canvas = Image.new("RGB", (width, height), "#fbfaf6")
    draw = ImageDraw.Draw(canvas, "RGBA")
    title_font = font("segoeuib.ttf", 28)
    body_font = font("segoeui.ttf", 15)
    header_font = font("segoeuib.ttf", 17)
    mono_font = font("consola.ttf", 14)
    draw.text((margin, 28), "Trace filling smooths the image, but it does not physically recover Doppler information", fill=(31, 36, 48, 255), font=title_font)
    draw.text(
        (margin, 70),
        "Mars SHARAD RDR complex-derived radargram. Each test removes traces, fills the gaps, then compares image and FFT-domain metrics.",
        fill=(92, 99, 115, 255),
        font=body_font,
    )

    card_w = (width - margin * 2 - 26) // 2
    card_h = 460
    y = 128
    for index, result in enumerate(factor_results):
        x = margin + index * (card_w + 26)
        draw.rounded_rectangle((x, y, x + card_w, y + card_h), radius=8, fill=(255, 255, 255, 255), outline=(210, 214, 224, 255), width=1)
        factor = result["factor"]
        draw.text((x + 22, y + 18), f"Keep every {factor}th trace", fill=(31, 36, 48, 255), font=header_font)
        lines = [
            ("Kept traces", f"{result['kept_trace_count']} of {result['original_trace_count']} ({result['kept_trace_fraction'] * 100:.1f}%)"),
            ("New Nyquist", f"{result['new_nyquist_cycles_per_original_trace']:.3f} cycles/original trace"),
            ("Original above new Nyquist", f"{result['original_energy_above_new_nyquist_pct']:.1f}%"),
            ("Filled high-freq recovery", f"{result['filled_highfreq_recovery_pct']:.1f}%"),
            ("Filled/original corr", f"{result['filled_vs_original_corr']:.3f}"),
            ("Filled/original MAE", f"{result['filled_vs_original_mae_db']:.2f} dB"),
            ("Low-band after removal", f"{result['decimated_lowband_vs_original_ratio']:.2f}x original"),
            ("Low-band after filling", f"{result['filled_lowband_vs_original_ratio']:.2f}x original"),
        ]
        yy = y + 70
        for label, value in lines:
            draw.text((x + 22, yy), label, fill=(92, 99, 115, 255), font=body_font)
            draw.text((x + card_w - 22, yy), value, fill=(31, 36, 48, 255), font=mono_font, anchor="ra")
            yy += 42
        draw.text(
            (x + 22, y + card_h - 70),
            "Conclusion: visually cleaner does not mean Doppler-fixed.",
            fill=(128, 65, 38, 255),
            font=header_font,
        )

    draw.text(
        (margin, height - 92),
        "Result: interpolation can hide missing-column appearance, but it cannot reconstruct frequencies lost by lower trace sampling. "
        "Aliased energy remains inside the lower Nyquist band.",
        fill=(31, 36, 48, 255),
        font=body_font,
    )
    draw.text(
        (margin, height - 48),
        "Use the radargram and FFT comparison PNGs for each factor to show the image-domain and Doppler-domain evidence side by side.",
        fill=(92, 99, 115, 255),
        font=body_font,
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(path)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    baseline, metadata = load_baseline_crop()
    factors = [2, 4]
    rows: list[dict[str, object]] = []
    outputs: dict[str, object] = {}

    for factor in factors:
        decimated = keep_every_n(baseline, factor)
        removed = missing_grid(baseline, factor)
        filled = linear_fill(decimated, baseline.shape[1], factor)
        difference = np.abs(filled - baseline)
        metrics, original_fft, decimated_fft, filled_fft = summarize_factor(baseline, decimated, filled, factor)

        radar_png = OUT_DIR / f"factor{factor}_radargram_trace_removal_comparison.png"
        fft_png = OUT_DIR / f"factor{factor}_fft_doppler_comparison.png"
        render_radargram_comparison(radar_png, factor, baseline, removed, filled, difference)
        render_fft_comparison(fft_png, factor, original_fft, decimated_fft, filled_fft, metrics)

        rows.append({**metrics, "radargram_png": str(radar_png.relative_to(ROOT)), "fft_png": str(fft_png.relative_to(ROOT))})
        outputs[f"factor{factor}"] = {
            "radargram_comparison_png": str(radar_png.relative_to(ROOT)),
            "fft_comparison_png": str(fft_png.relative_to(ROOT)),
        }

    metrics_csv = OUT_DIR / "trace_removal_metrics.csv"
    write_metrics_csv(metrics_csv, rows)
    summary_png = OUT_DIR / "trace_removal_summary_sheet.png"
    render_summary_sheet(summary_png, rows)

    summary = {
        "question": "Does filling missing traces remove Doppler aliasing, or only hide missing-column appearance?",
        "dataset": "Mars SHARAD orbit 12945, same-orbit RDR complex-derived radargram crop",
        "baseline": metadata,
        "method": [
            "Kept every 2nd and every 4th along-track trace to simulate lower trace sampling.",
            "Filled missing traces back to the original grid with linear interpolation.",
            "Compared original, trace-removed, and gap-filled radargrams.",
            "Compared average along-track FFT power spectra using frequency in cycles per original trace.",
        ],
        "results": rows,
        "answer": (
            "Filling missing traces makes the radargram look smoother, but it does not restore the high-frequency Doppler information "
            "that becomes unobservable after trace removal. Aliased energy remains in the lower-frequency band after filling."
        ),
        "outputs": {
            **outputs,
            "summary_sheet_png": str(summary_png.relative_to(ROOT)),
            "metrics_csv": str(metrics_csv.relative_to(ROOT)),
        },
        "limitations": [
            "This test uses a complex-derived radargram crop rather than unfocused raw chirp data.",
            "The trace removal is artificial and regular; real missing traces can be irregular.",
            "Interpolation is linear; better interpolation may look cleaner but still cannot recover information beyond the reduced Nyquist limit.",
        ],
    }
    summary_json = OUT_DIR / "trace_removal_test_summary.json"
    summary_json.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"Wrote {summary_png}")
    print(f"Wrote {metrics_csv}")
    print(f"Wrote {summary_json}")
    for value in outputs.values():
        print(f"Wrote {value['radargram_comparison_png']}")
        print(f"Wrote {value['fft_comparison_png']}")


if __name__ == "__main__":
    main()
