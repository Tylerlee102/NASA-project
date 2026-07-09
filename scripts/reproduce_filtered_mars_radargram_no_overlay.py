"""Reproduce a clean Mars SHARAD radargram with filters applied directly.

This script creates plain grayscale radargram products only. It does not draw
surface picks, candidate reflectors, confidence colors, or interpretation
overlays on top of the radargram.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from adaptive_sectional_mars_readability import (
    DATA_DIR,
    METHODS,
    OUTPUT_ROOT,
    box_mean,
    classify_columns,
    font,
    image_panel,
    pooled_repair_columns,
    read_nadir_lines,
    read_usrdr_db,
    robust_db_from_power,
    robust_scale,
    save_gray,
    surface_aligned_crop,
)
from adaptive_sectional_mars_readability_v2 import (
    despeckle_soft,
    local_contrast_from_conditioned,
    suppress_depth_varying_stripes,
    tone_map,
)


OUT_DIR = OUTPUT_ROOT / "corrected_filtered_radargram_no_overlay"
CLUTTER_IMG = DATA_DIR / "clutter_simulation" / "s_01294501_sim.img"

LINES = 3600
COLUMNS = 4719
SURFACE_ROW = 110
COMBINED_CLUTTER_OFFSET = 135_907_200


def require_file(path: Path) -> None:
    if not path.exists():
        raise FileNotFoundError(path)


def read_combined_clutter_db() -> np.ndarray:
    require_file(CLUTTER_IMG)
    data = np.memmap(CLUTTER_IMG, dtype="<f4", mode="r", offset=COMBINED_CLUTTER_OFFSET, shape=(LINES, COLUMNS))
    return robust_db_from_power(np.asarray(data, dtype=np.float32))


def ridge_score(values: np.ndarray) -> np.ndarray:
    short = box_mean(values, radius_y=1, radius_x=11)
    broad = box_mean(values, radius_y=15, radius_x=69)
    ridge = np.maximum(short - broad, 0.0)
    ridge = box_mean(ridge, radius_y=0, radius_x=13)
    return robust_scale(ridge, low_pct=66.0, high_pct=99.7)


def display_from_conditioned(values: np.ndarray, *, gamma: float = 0.84) -> np.ndarray:
    detail = despeckle_soft(local_contrast_from_conditioned(values, radius_y=13, radius_x=65), radius=0.8, percent=72)
    soft = despeckle_soft(local_contrast_from_conditioned(values, radius_y=26, radius_x=145), radius=1.1, percent=38)
    ridge = tone_map(ridge_score(values), gamma=0.72)
    display = 0.44 * detail + 0.36 * soft + 0.20 * ridge
    return tone_map(display, gamma=gamma)


def dark_radargram_grade(display: np.ndarray) -> np.ndarray:
    work = np.clip(display, 0.0, 1.0).astype(np.float32)
    low, high = np.percentile(work, [0.35, 99.86])
    if not math.isfinite(float(low)) or not math.isfinite(float(high)) or high <= low:
        return work
    graded = np.clip((work - low) / (high - low), 0.0, 1.0)
    graded = graded**1.58
    graded = np.clip((graded - 0.035) * 1.08, 0.0, 1.0)
    return graded.astype(np.float32)


def original_display(crop: np.ndarray) -> np.ndarray:
    display = robust_scale(crop, low_pct=1.0, high_pct=99.85)
    return tone_map(despeckle_soft(display, radius=0.65, percent=18), gamma=0.9)


def build_section_corrected(crop: np.ndarray, method: np.ndarray) -> tuple[np.ndarray, np.ndarray, list[dict[str, object]]]:
    conditioned = suppress_depth_varying_stripes(crop)
    repaired, confidence, operations = pooled_repair_columns(conditioned, method)
    return repaired.astype(np.float32), confidence.astype(np.float32), operations


def smoothstep(values: np.ndarray, edge0: float, edge1: float) -> np.ndarray:
    if edge1 <= edge0:
        return (values >= edge1).astype(np.float32)
    x = np.clip((values - edge0) / (edge1 - edge0), 0.0, 1.0)
    return (x * x * (3.0 - 2.0 * x)).astype(np.float32)


def surface_aligned_valid_mask(surface_lines: np.ndarray, *, above: int, below: int) -> np.ndarray:
    rows = above + below
    cols = min(COLUMNS, surface_lines.size)
    mask = np.zeros((rows, cols), dtype=bool)
    for col in range(cols):
        surface = int(round(float(surface_lines[col]))) - 1
        src_start = max(0, surface - above)
        src_end = min(LINES, surface + below)
        dst_start = src_start - (surface - above)
        dst_end = dst_start + (src_end - src_start)
        if src_end > src_start:
            mask[dst_start:dst_end, col] = True
    return mask


def common_valid_row_limit(valid_mask: np.ndarray, *, min_coverage: float = 0.995) -> int:
    coverage = np.mean(valid_mask, axis=1)
    below_surface = coverage[SURFACE_ROW:]
    first_low = np.where(below_surface < min_coverage)[0]
    if first_low.size == 0:
        return int(valid_mask.shape[0])
    return max(SURFACE_ROW + int(first_low[0]), SURFACE_ROW + 1)


def clutter_match_mask(radar_values: np.ndarray, clutter_values: np.ndarray) -> np.ndarray:
    radar_ridge = ridge_score(radar_values)
    clutter_ridge = ridge_score(suppress_depth_varying_stripes(clutter_values))

    radar_cut = float(np.percentile(radar_ridge, 91.0))
    clutter_cut = float(np.percentile(clutter_ridge, 88.5))
    raw_match = ((radar_ridge >= radar_cut) & (clutter_ridge >= clutter_cut)).astype(np.float32)
    match = box_mean(raw_match, radius_y=2, radius_x=17)

    rows = np.arange(match.shape[0], dtype=np.float32)
    depth_gate = smoothstep(rows, SURFACE_ROW + 16, SURFACE_ROW + 68)[:, np.newaxis]
    match = np.clip(match * depth_gate, 0.0, 1.0)
    return box_mean(match, radius_y=1, radius_x=9).astype(np.float32)


def attenuate_simulated_clutter(radar_values: np.ndarray, clutter_values: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    match = clutter_match_mask(radar_values, clutter_values)
    local_background = box_mean(radar_values, radius_y=8, radius_x=45)
    bright_excess = np.maximum(radar_values - local_background, 0.0)

    attenuated = radar_values - 0.82 * match * bright_excess
    attenuated = (1.0 - 0.24 * match) * attenuated + (0.24 * match) * local_background
    return attenuated.astype(np.float32), match.astype(np.float32)


def shift_edge(values: np.ndarray, row_shift: int, col_shift: int) -> np.ndarray:
    rows, cols = values.shape
    padded = np.pad(values, ((abs(row_shift), abs(row_shift)), (abs(col_shift), abs(col_shift))), mode="edge")
    row_start = abs(row_shift) + row_shift
    col_start = abs(col_shift) + col_shift
    return padded[row_start : row_start + rows, col_start : col_start + cols]


def directional_mean(values: np.ndarray, *, slope: float, half_width: int = 18, step: int = 3) -> np.ndarray:
    accum = np.zeros_like(values, dtype=np.float32)
    count = 0
    for dx in range(-half_width, half_width + 1, step):
        dy = int(round(slope * dx))
        accum += shift_edge(values, row_shift=dy, col_shift=dx)
        count += 1
    return (accum / float(max(count, 1))).astype(np.float32)


def suppress_skewed_artifacts(values: np.ndarray, clutter_match: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Reduce steep diagonal/upward bands while retaining flatter horizons."""
    horizontal = directional_mean(values, slope=0.0, half_width=24, step=3)
    diagonal_responses = [
        directional_mean(values, slope=slope, half_width=21, step=3)
        for slope in (-0.70, -0.48, -0.30, 0.30, 0.48, 0.70)
    ]
    diagonal = np.maximum.reduce(diagonal_responses)
    diagonal_excess = np.maximum(diagonal - horizontal, 0.0)

    ridge = ridge_score(values)
    slope_signal = robust_scale(diagonal_excess, low_pct=74.0, high_pct=99.75)
    ridge_gate = smoothstep(ridge, 0.34, 0.78)
    rows = np.arange(values.shape[0], dtype=np.float32)
    depth_gate = smoothstep(rows, SURFACE_ROW + 24, SURFACE_ROW + 82)[:, np.newaxis]
    clutter_gate = np.clip(0.55 + 0.85 * box_mean(clutter_match, radius_y=3, radius_x=19), 0.0, 1.0)

    mask = slope_signal * ridge_gate * depth_gate * clutter_gate
    mask = np.clip(box_mean(mask, radius_y=1, radius_x=7), 0.0, 1.0)

    local_background = box_mean(values, radius_y=8, radius_x=55)
    horizon_background = 0.68 * horizontal + 0.32 * local_background
    alpha = np.clip(0.82 * mask, 0.0, 0.82)
    suppressed = values * (1.0 - alpha) + horizon_background * alpha
    return suppressed.astype(np.float32), mask.astype(np.float32)


def horizon_dip_filter(values: np.ndarray) -> np.ndarray:
    """Frequency-domain fan filter that favors flatter radargram events."""
    background = box_mean(values, radius_y=18, radius_x=105)
    work = values - background
    rows, cols = work.shape

    taper_y = np.hanning(rows).astype(np.float32)
    taper_x = np.hanning(cols).astype(np.float32)
    taper = np.sqrt(np.outer(taper_y, taper_x)).astype(np.float32)
    tapered = work * taper

    spectrum = np.fft.fft2(tapered)
    ky = np.fft.fftfreq(rows).astype(np.float32)[:, np.newaxis]
    kx = np.fft.fftfreq(cols).astype(np.float32)[np.newaxis, :]
    dip = np.abs(kx) / (np.abs(ky) + 1e-4)

    keep_flat = 1.0 - smoothstep(dip, 0.075, 0.235)
    low_frequency = np.exp(-((kx / 0.020) ** 2 + (ky / 0.020) ** 2)).astype(np.float32)
    fan = np.clip(0.10 + 0.90 * keep_flat, 0.10, 1.0)
    fan = np.maximum(fan, 0.42 * low_frequency)

    filtered = np.fft.ifft2(spectrum * fan).real.astype(np.float32)
    taper_floor = np.maximum(taper, 0.18)
    filtered = filtered / taper_floor
    return (background + filtered).astype(np.float32)


def along_track_frequency_filter(values: np.ndarray) -> np.ndarray:
    row_mean = np.mean(values, axis=1, keepdims=True)
    work = values - row_mean
    spectrum = np.fft.rfft(work, axis=1)
    freq = np.fft.rfftfreq(values.shape[1]).astype(np.float32)

    low_weight = np.clip(freq / 0.012, 0.38, 1.0)
    high_weight = 1.0 / (1.0 + np.exp((freq - 0.43) / 0.035))
    weights = (low_weight * high_weight).astype(np.float32)
    weights[0] = 0.0

    filtered = np.fft.irfft(spectrum * weights[np.newaxis, :], n=values.shape[1], axis=1)
    return (filtered + row_mean).astype(np.float32)


def render_comparison_sheet(
    path: Path,
    original: np.ndarray,
    section_corrected: np.ndarray,
    clutter_attenuated: np.ndarray,
    final: np.ndarray,
) -> None:
    width = 1800
    margin = 22
    header_h = 96
    label_h = 48
    panel_w = (width - margin * 3) // 2
    panel_h = 430
    height = header_h + 2 * (panel_h + label_h + margin) + margin

    canvas = Image.new("RGB", (width, height), "#fbfaf6")
    draw = ImageDraw.Draw(canvas, "RGBA")
    title_font = font("segoeuib.ttf", 26)
    body_font = font("segoeui.ttf", 14)
    label_font = font("segoeuib.ttf", 15)
    note_font = font("segoeui.ttf", 12)

    draw.text((margin, 18), "Mars SHARAD corrected/filter-only radargram", fill=(31, 36, 48, 255), font=title_font)
    draw.text(
        (margin, 55),
        "Each panel is a plain grayscale radargram. The processing changes the pixels; no interpretation overlays are drawn.",
        fill=(92, 99, 115, 255),
        font=body_font,
    )

    panels = [
        ("Original surface-aligned", "Baseline display from the SHARAD radargram product.", original),
        ("Section-corrected", "Column repair plus stripe suppression.", section_corrected),
        ("Clutter-attenuated", "Matched simulated-clutter texture reduced in the radargram.", clutter_attenuated),
        ("Final corrected + filtered", "Clutter attenuation plus along-track frequency filtering.", final),
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

    path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(path)


def render_zoom_sheet(path: Path, panels: dict[str, np.ndarray], crop_box: tuple[int, int, int, int]) -> None:
    col0, col1, row0, row1 = crop_box
    width = 1800
    margin = 22
    header_h = 88
    label_h = 44
    panel_w = (width - margin * 3) // 2
    panel_h = 420
    height = header_h + 2 * (panel_h + label_h + margin) + margin

    canvas = Image.new("RGB", (width, height), "#fbfaf6")
    draw = ImageDraw.Draw(canvas, "RGBA")
    title_font = font("segoeuib.ttf", 26)
    body_font = font("segoeui.ttf", 14)
    label_font = font("segoeuib.ttf", 15)

    draw.text((margin, 18), "Zoomed no-overlay comparison", fill=(31, 36, 48, 255), font=title_font)
    draw.text(
        (margin, 55),
        f"Columns {col0}-{col1}, surface-aligned rows {row0}-{row1}. Nothing is drawn on top of the radargram panels.",
        fill=(92, 99, 115, 255),
        font=body_font,
    )

    for index, (title, display) in enumerate(panels.items()):
        col = index % 2
        row = index // 2
        x = margin + col * (panel_w + margin)
        y = header_h + margin + row * (panel_h + label_h + margin)
        zoom = display[row0:row1, col0:col1]
        canvas.paste(image_panel(zoom, panel_w, panel_h), (x, y))
        draw.rectangle((x, y, x + panel_w - 1, y + panel_h - 1), outline=(210, 214, 224, 255), width=1)
        draw.text((x, y + panel_h + 8), title, fill=(31, 36, 48, 255), font=label_font)

    path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(path)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    nadir_lines = read_nadir_lines()
    radar_db = read_usrdr_db()
    clutter_db = read_combined_clutter_db()

    crop = surface_aligned_crop(radar_db, nadir_lines, above=SURFACE_ROW, below=990)
    clutter_crop = surface_aligned_crop(clutter_db, nadir_lines, above=SURFACE_ROW, below=990)
    valid_mask = surface_aligned_valid_mask(nadir_lines, above=SURFACE_ROW, below=990)
    valid_row_limit = common_valid_row_limit(valid_mask, min_coverage=0.995)
    valid_slice = slice(0, valid_row_limit)

    diagnostics = classify_columns(crop, above_surface=SURFACE_ROW)
    method = diagnostics["method"].astype(np.int16)

    section_values, confidence_1d, operations = build_section_corrected(crop, method)
    clutter_attenuated_values, clutter_match = attenuate_simulated_clutter(section_values, clutter_crop)
    frequency_filtered_values = along_track_frequency_filter(clutter_attenuated_values)
    skew_suppressed_values, skew_mask = suppress_skewed_artifacts(frequency_filtered_values, clutter_match)
    dip_filtered_values = horizon_dip_filter(skew_suppressed_values)

    original = original_display(crop)
    section_display = display_from_conditioned(section_values)
    clutter_display = display_from_conditioned(clutter_attenuated_values)
    doppler_display = display_from_conditioned(frequency_filtered_values)
    skew_display = display_from_conditioned(skew_suppressed_values)
    dip_display = display_from_conditioned(dip_filtered_values)
    final_light = tone_map(
        0.08 * section_display + 0.10 * clutter_display + 0.14 * doppler_display + 0.20 * skew_display + 0.48 * dip_display,
        gamma=0.86,
    )
    final = dark_radargram_grade(final_light)
    aggressive_light = tone_map(0.10 * skew_display + 0.90 * dip_display, gamma=0.88)
    aggressive = dark_radargram_grade(aggressive_light)

    original_valid = original[valid_slice]
    section_valid = section_display[valid_slice]
    clutter_valid = clutter_display[valid_slice]
    doppler_valid = doppler_display[valid_slice]
    skew_valid = skew_display[valid_slice]
    dip_valid = dip_display[valid_slice]
    final_valid = final[valid_slice]
    aggressive_valid = aggressive[valid_slice]

    save_gray(OUT_DIR / "00_original_full_depth_surface_aligned_reference.png", original)
    save_gray(OUT_DIR / "00_final_full_depth_corrected_filtered_reference.png", final)
    save_gray(OUT_DIR / "00_final_lighter_tone_reference.png", final_light[valid_slice])
    save_gray(OUT_DIR / "01_original_surface_aligned_radargram.png", original_valid)
    save_gray(OUT_DIR / "02_section_corrected_filtered_radargram.png", section_valid)
    save_gray(OUT_DIR / "03_clutter_attenuated_radargram.png", clutter_valid)
    save_gray(OUT_DIR / "04_along_track_frequency_filtered_radargram.png", doppler_valid)
    save_gray(OUT_DIR / "04b_skew_suppressed_radargram.png", skew_valid)
    save_gray(OUT_DIR / "04c_dip_filtered_radargram.png", dip_valid)
    save_gray(OUT_DIR / "05_final_corrected_filtered_radargram.png", final_valid)
    save_gray(OUT_DIR / "05b_aggressive_deskewed_radargram.png", aggressive_valid)
    save_gray(OUT_DIR / "clutter_match_reference_no_overlay.png", tone_map(clutter_match, gamma=0.7))
    save_gray(OUT_DIR / "skew_suppression_mask_reference_no_overlay.png", tone_map(skew_mask, gamma=0.74))

    render_comparison_sheet(
        OUT_DIR / "06_original_vs_corrected_filters_no_overlay.png",
        original_valid,
        section_valid,
        clutter_valid,
        final_valid,
    )
    render_zoom_sheet(
        OUT_DIR / "07_zoom_original_vs_final_no_overlay.png",
        {
            "Original surface-aligned": original_valid,
            "Before skew suppression": doppler_valid,
            "Balanced final": final_valid,
            "Aggressive de-skewed": aggressive_valid,
        },
        crop_box=(1480, 4320, 70, 670),
    )

    method_counts = {METHODS[int(code)]["name"]: int(np.sum(method == code)) for code in sorted(METHODS)}
    summary = {
        "orbit": "S_01294501",
        "product": "plain corrected/filter-only grayscale radargram",
        "shape_rows_cols": [int(final_valid.shape[0]), int(final_valid.shape[1])],
        "full_depth_shape_rows_cols": [int(final.shape[0]), int(final.shape[1])],
        "surface_aligned_row": SURFACE_ROW,
        "common_valid_row_limit": int(valid_row_limit),
        "common_valid_depth_coverage": 0.995,
        "steps_applied": [
            "surface alignment using return-table nadir line",
            "common valid-depth crop to remove bottom no-data areas without inventing signal",
            "section-aware column quality repair",
            "depth-varying stripe suppression",
            "display-domain attenuation of texture matching the simulated cluttergram",
            "along-track frequency filtering on the radargram before final tone mapping",
            "directional skew suppression that weakens steep diagonal bands while keeping flatter horizons",
            "frequency-domain dip filtering that favors flatter events over steep upward-skewing bands",
            "darker radargram tone grade for black-background readability",
        ],
        "important_limit": (
            "This is a corrected/filter-only radargram display. It improves readability but does not recover Doppler "
            "information that was never sampled or prove that weak subsurface-looking returns are real geology."
        ),
        "column_method_counts": method_counts,
        "repaired_column_count": int(np.sum(method == 3)),
        "repair_operation_count": len(operations),
        "mean_clutter_match_strength": float(np.mean(clutter_match)),
        "max_clutter_match_strength": float(np.max(clutter_match)),
        "outputs": {
            "final": str(OUT_DIR / "05_final_corrected_filtered_radargram.png"),
            "aggressive_deskewed": str(OUT_DIR / "05b_aggressive_deskewed_radargram.png"),
            "skew_suppressed": str(OUT_DIR / "04b_skew_suppressed_radargram.png"),
            "dip_filtered": str(OUT_DIR / "04c_dip_filtered_radargram.png"),
            "full_depth_reference": str(OUT_DIR / "00_final_full_depth_corrected_filtered_reference.png"),
            "lighter_tone_reference": str(OUT_DIR / "00_final_lighter_tone_reference.png"),
            "comparison": str(OUT_DIR / "06_original_vs_corrected_filters_no_overlay.png"),
            "zoom": str(OUT_DIR / "07_zoom_original_vs_final_no_overlay.png"),
        },
    }

    with (OUT_DIR / "correction_filter_summary.json").open("w", encoding="utf-8") as handle:
        json.dump(summary, handle, indent=2)

    np.savez_compressed(
        OUT_DIR / "corrected_filtered_radargram_data.npz",
        original_display=original_valid.astype(np.float32),
        section_corrected_display=section_valid.astype(np.float32),
        clutter_attenuated_display=clutter_valid.astype(np.float32),
        frequency_filtered_display=doppler_valid.astype(np.float32),
        skew_suppressed_display=skew_valid.astype(np.float32),
        dip_filtered_display=dip_valid.astype(np.float32),
        final_display=final_valid.astype(np.float32),
        aggressive_deskewed_display=aggressive_valid.astype(np.float32),
        final_display_lighter_reference=final_light[valid_slice].astype(np.float32),
        final_display_full_depth=final.astype(np.float32),
        section_corrected_db=section_values.astype(np.float32),
        clutter_attenuated_db=clutter_attenuated_values.astype(np.float32),
        frequency_filtered_db=frequency_filtered_values.astype(np.float32),
        skew_suppressed_db=skew_suppressed_values.astype(np.float32),
        dip_filtered_db=dip_filtered_values.astype(np.float32),
        clutter_match=clutter_match.astype(np.float32),
        skew_suppression_mask=skew_mask.astype(np.float32),
        column_method=method.astype(np.int16),
        confidence_1d=confidence_1d.astype(np.float32),
        valid_row_limit=np.asarray(valid_row_limit, dtype=np.int32),
    )

    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
