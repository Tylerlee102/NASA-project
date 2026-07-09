"""Second-pass Mars SHARAD readability enhancement.

This builds on the section-aware v1 product, but aims for a cleaner visual:
stronger stripe suppression, softer speckle handling, and a zoomed comparison.
The outputs are display products and are not treated as recovered measurements.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from adaptive_sectional_mars_readability import (
    METHODS,
    OUT_DIR as V1_OUT_DIR,
    OUTPUT_ROOT,
    RETURN_CSV,
    ROOT,
    USRDR_IMG,
    box_mean,
    classify_columns,
    confidence_overlay,
    destripe,
    font,
    image_panel,
    pooled_repair_columns,
    read_nadir_lines,
    read_usrdr_db,
    robust_scale,
    save_gray,
    save_rgb,
    surface_aligned_crop,
)


OUT_DIR = OUTPUT_ROOT / "adaptive_sectional_readability_v2"


def despeckle_soft(display: np.ndarray, radius: float = 1.0, percent: int = 62) -> np.ndarray:
    image = Image.fromarray(np.uint8(np.clip(display, 0, 1) * 255), mode="L")
    image = image.filter(ImageFilter.MedianFilter(size=3))
    image = image.filter(ImageFilter.UnsharpMask(radius=radius, percent=percent, threshold=4))
    return (np.asarray(image, dtype=np.float32) / 255.0).astype(np.float32)


def tone_map(display: np.ndarray, gamma: float = 0.84) -> np.ndarray:
    display = np.clip(display, 0.0, 1.0).astype(np.float32)
    low, high = np.percentile(display, [0.4, 99.65])
    if high <= low:
        return display
    mapped = np.clip((display - low) / (high - low), 0.0, 1.0)
    mapped = mapped ** gamma
    mapped = mapped * mapped * (3.0 - 2.0 * mapped)
    return mapped.astype(np.float32)


def suppress_depth_varying_stripes(values: np.ndarray) -> np.ndarray:
    base = destripe(values)
    local_x = box_mean(base, radius_y=0, radius_x=31)
    residual = base - local_x
    stripe_template = box_mean(residual, radius_y=31, radius_x=2)
    finite = stripe_template[np.isfinite(stripe_template)]
    if finite.size:
        limit = float(np.percentile(np.abs(finite - np.median(finite)), 98.0))
        if limit > 0:
            stripe_template = np.clip(stripe_template, -limit, limit)
    return (base - 0.52 * stripe_template).astype(np.float32)


def local_contrast_from_conditioned(values: np.ndarray, radius_y: int, radius_x: int) -> np.ndarray:
    mean = box_mean(values, radius_y, radius_x)
    second = box_mean(values * values, radius_y, radius_x)
    std = np.sqrt(np.maximum(second - mean * mean, 1e-5))
    z = (values - mean) / (std + 1e-4)
    global_view = robust_scale(values, low_pct=1.0, high_pct=99.75)
    local_view = robust_scale(z, low_pct=0.7, high_pct=99.25)
    return np.clip(0.50 * global_view + 0.50 * local_view, 0.0, 1.0).astype(np.float32)


def reflector_continuity(conditioned: np.ndarray) -> np.ndarray:
    short = box_mean(conditioned, radius_y=1, radius_x=13)
    broad = box_mean(conditioned, radius_y=16, radius_x=73)
    ridge = np.maximum(short - broad, 0.0)
    ridge = box_mean(ridge, radius_y=0, radius_x=11)
    return robust_scale(ridge, low_pct=68.0, high_pct=99.75)


def build_v2_display(crop: np.ndarray, method: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    conditioned = suppress_depth_varying_stripes(crop)
    repaired, repair_confidence, _ = pooled_repair_columns(conditioned, method)

    detail = despeckle_soft(local_contrast_from_conditioned(repaired, radius_y=13, radius_x=65), radius=0.9, percent=76)
    soft = despeckle_soft(local_contrast_from_conditioned(repaired, radius_y=25, radius_x=145), radius=1.2, percent=46)
    wide = despeckle_soft(local_contrast_from_conditioned(repaired, radius_y=36, radius_x=235), radius=1.0, percent=28)
    ridge = reflector_continuity(repaired)

    base = 0.36 * detail + 0.44 * soft + 0.20 * ridge
    rough = 0.16 * detail + 0.54 * soft + 0.30 * wide
    muted = 0.08 * detail + 0.36 * soft + 0.56 * wide

    display = np.empty_like(base)
    for code in METHODS:
        cols = method == code
        if not np.any(cols):
            continue
        if code == 0:
            display[:, cols] = base[:, cols]
        elif code == 1:
            display[:, cols] = 0.54 * base[:, cols] + 0.46 * rough[:, cols]
        elif code == 2:
            display[:, cols] = rough[:, cols]
        else:
            display[:, cols] = muted[:, cols]

    method_confidence = np.asarray([METHODS[int(code)]["confidence"] for code in method], dtype=np.float32)
    confidence = np.minimum(method_confidence, repair_confidence)
    confidence_2d = np.tile(confidence[np.newaxis, :], (crop.shape[0], 1))
    return tone_map(display), tone_map(ridge, gamma=0.72), confidence_2d, tone_map(soft)


def overlay_reflector_guidance(gray: np.ndarray, ridge: np.ndarray, confidence: np.ndarray) -> np.ndarray:
    rgb = np.dstack([gray, gray, gray]).astype(np.float32)
    gold = np.asarray([1.0, 0.74, 0.24], dtype=np.float32)
    blue = np.asarray([0.50, 0.72, 1.0], dtype=np.float32)
    color = 0.72 * gold + 0.28 * blue
    alpha = np.clip((ridge - 0.42) / 0.58, 0.0, 1.0) * 0.44
    alpha *= np.clip(confidence, 0.25, 1.0)
    rgb = rgb * (1.0 - alpha[..., None]) + color * alpha[..., None]
    return np.clip(rgb, 0, 1).astype(np.float32)


def crop_display(display: np.ndarray, col_start: int, col_end: int, row_start: int, row_end: int) -> np.ndarray:
    return display[row_start:row_end, col_start:col_end]


def render_comparison_sheet(
    path: Path,
    original: np.ndarray,
    v1: np.ndarray,
    v2: np.ndarray,
    v2_overlay: np.ndarray,
) -> None:
    width = 1800
    margin = 22
    header_h = 108
    label_h = 48
    panel_w = (width - margin * 3) // 2
    panel_h = 425
    height = header_h + 2 * (panel_h + label_h + margin) + margin + 18
    canvas = Image.new("RGB", (width, height), "#fbfaf6")
    draw = ImageDraw.Draw(canvas, "RGBA")
    title_font = font("segoeuib.ttf", 26)
    body_font = font("segoeui.ttf", 14)
    label_font = font("segoeuib.ttf", 15)
    note_font = font("segoeui.ttf", 12)

    draw.text((margin, 18), "Mars SHARAD readability comparison", fill=(31, 36, 48, 255), font=title_font)
    draw.text(
        (margin, 54),
        "Original, adaptive v1, and a stronger v2 pass with stripe suppression plus reflector-continuity enhancement.",
        fill=(92, 99, 115, 255),
        font=body_font,
    )
    draw.text(
        (margin, 81),
        "V2 is still an interpretation/display product. The overlay highlights candidate continuity, not confirmed geology.",
        fill=(128, 65, 38, 255),
        font=body_font,
    )

    panels = [
        ("Original surface-aligned radargram", "Raw power display after surface alignment.", robust_scale(original, 1.0, 99.85)),
        ("Adaptive v1", "Section-aware pooling and low-confidence repair.", v1),
        ("Adaptive v2 best readable", "Cleaner texture with stronger stripe suppression.", v2),
        ("V2 reflector-guided overlay", "Subtle color marks the most continuous bright ridges.", v2_overlay),
    ]
    for index, (title, subtitle, display) in enumerate(panels):
        col = index % 2
        row = index // 2
        x = margin + col * (panel_w + margin)
        y = header_h + margin + row * (panel_h + label_h + margin)
        canvas.paste(image_panel(display, panel_w, panel_h), (x, y))
        draw.rectangle((x, y, x + panel_w - 1, y + panel_h - 1), outline=(210, 214, 224, 255), width=1)
        draw.line((x, y + int(panel_h * 0.10), x + panel_w, y + int(panel_h * 0.10)), fill=(246, 223, 86, 170), width=2)
        draw.text((x, y + panel_h + 8), title, fill=(31, 36, 48, 255), font=label_font)
        draw.text((x, y + panel_h + 29), subtitle, fill=(96, 102, 116, 255), font=note_font)
    path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(path)


def render_zoom_sheet(
    path: Path,
    original: np.ndarray,
    v1: np.ndarray,
    v2: np.ndarray,
    overlay: np.ndarray,
    crop_box: tuple[int, int, int, int],
) -> None:
    col_start, col_end, row_start, row_end = crop_box
    width = 1800
    margin = 22
    header_h = 96
    label_h = 44
    panel_w = (width - margin * 3) // 2
    panel_h = 430
    height = header_h + 2 * (panel_h + label_h + margin) + margin + 18
    canvas = Image.new("RGB", (width, height), "#fbfaf6")
    draw = ImageDraw.Draw(canvas, "RGBA")
    title_font = font("segoeuib.ttf", 26)
    body_font = font("segoeui.ttf", 14)
    label_font = font("segoeuib.ttf", 15)
    note_font = font("segoeui.ttf", 12)

    draw.text((margin, 18), "Zoomed problem-area comparison", fill=(31, 36, 48, 255), font=title_font)
    draw.text(
        (margin, 54),
        f"Columns {col_start}-{col_end}, rows {row_start}-{row_end} in the surface-aligned crop.",
        fill=(92, 99, 115, 255),
        font=body_font,
    )

    panels = [
        ("Original zoom", "Surface-aligned raw display.", robust_scale(crop_display(original, *crop_box), 1.0, 99.85)),
        ("Adaptive v1 zoom", "Earlier section-aware version.", crop_display(v1, *crop_box)),
        ("Adaptive v2 zoom", "Cleaner texture and more continuous layer visibility.", crop_display(v2, *crop_box)),
        ("V2 overlay zoom", "Candidate continuity overlay for inspection only.", crop_display(overlay, *crop_box)),
    ]
    for index, (title, subtitle, display) in enumerate(panels):
        col = index % 2
        row = index // 2
        x = margin + col * (panel_w + margin)
        y = header_h + margin + row * (panel_h + label_h + margin)
        canvas.paste(image_panel(display, panel_w, panel_h), (x, y))
        draw.rectangle((x, y, x + panel_w - 1, y + panel_h - 1), outline=(210, 214, 224, 255), width=1)
        draw.text((x, y + panel_h + 8), title, fill=(31, 36, 48, 255), font=label_font)
        draw.text((x, y + panel_h + 28), subtitle, fill=(96, 102, 116, 255), font=note_font)
    path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(path)


def load_v1_display(shape: tuple[int, int]) -> np.ndarray:
    path = V1_OUT_DIR / "adaptive_best_readable_radargram.png"
    if not path.exists():
        return np.zeros(shape, dtype=np.float32)
    image = Image.open(path).convert("L")
    if image.size != (shape[1], shape[0]):
        image = image.resize((shape[1], shape[0]), Image.Resampling.BILINEAR)
    return (np.asarray(image, dtype=np.float32) / 255.0).astype(np.float32)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    usrdr_db = read_usrdr_db()
    nadir_lines = read_nadir_lines()
    above_surface = 110
    crop = surface_aligned_crop(usrdr_db, nadir_lines, above=above_surface, below=990)
    diagnostics = classify_columns(crop, above_surface=above_surface)
    method = diagnostics["method"]
    v1 = load_v1_display(crop.shape)
    v2, ridge, confidence, soft = build_v2_display(crop, method)
    overlay = overlay_reflector_guidance(v2, ridge, confidence)
    confidence_view = confidence_overlay(v2, method, confidence)

    best_png = OUT_DIR / "v2_best_readable_radargram.png"
    overlay_png = OUT_DIR / "v2_reflector_guided_overlay.png"
    confidence_png = OUT_DIR / "v2_confidence_overlay.png"
    ridge_png = OUT_DIR / "v2_reflector_continuity_score.png"
    soft_png = OUT_DIR / "v2_soft_texture_reference.png"
    comparison_png = OUT_DIR / "original_vs_adaptive_v1_vs_v2.png"
    zoom_png = OUT_DIR / "zoom_original_vs_v1_vs_v2.png"
    npz_path = OUT_DIR / "v2_readable_data.npz"

    save_gray(best_png, v2)
    save_rgb(overlay_png, overlay)
    save_rgb(confidence_png, confidence_view)
    save_gray(ridge_png, ridge)
    save_gray(soft_png, soft)
    render_comparison_sheet(comparison_png, crop, v1, v2, overlay)
    zoom_box = (1780, 3420, 70, 780)
    render_zoom_sheet(zoom_png, crop, v1, v2, overlay, zoom_box)
    np.savez_compressed(
        npz_path,
        v2_display=v2.astype(np.float32),
        reflector_continuity=ridge.astype(np.float32),
        confidence=confidence.astype(np.float32),
        method=method.astype(np.int16),
        soft_texture_reference=soft.astype(np.float32),
    )

    counts = {METHODS[code]["name"]: int(np.sum(method == code)) for code in METHODS}
    summary = {
        "purpose": "Cleaner second-pass Mars SHARAD readability product using section-aware repair plus stripe suppression and continuity enhancement.",
        "important_limit": (
            "This is still display conditioning. It can make coherent reflectors easier to inspect, but it cannot prove or recover "
            "signals that are absent, aliased, or non-separable in the measured data."
        ),
        "input": {
            "usrdr_numeric_img": str(USRDR_IMG.relative_to(ROOT)),
            "surface_geometry_csv": str(RETURN_CSV.relative_to(ROOT)),
            "surface_aligned_crop_shape": list(crop.shape),
        },
        "method_counts": counts,
        "v2_steps": [
            "Surface align to the modeled nadir/surface return.",
            "Suppress depth-varying vertical stripe templates.",
            "Use the v1 section quality classifier to choose sharper or softer treatment by column.",
            "Blend detail, soft texture, wide-pool, and reflector-continuity views.",
            "Export a confidence overlay and a reflector-guided overlay so display changes are visible.",
        ],
        "outputs": {
            "comparison_sheet_png": str(comparison_png.relative_to(ROOT)),
            "zoom_comparison_png": str(zoom_png.relative_to(ROOT)),
            "best_readable_png": str(best_png.relative_to(ROOT)),
            "reflector_guided_overlay_png": str(overlay_png.relative_to(ROOT)),
            "confidence_overlay_png": str(confidence_png.relative_to(ROOT)),
            "reflector_continuity_score_png": str(ridge_png.relative_to(ROOT)),
            "v2_data_npz": str(npz_path.relative_to(ROOT)),
        },
        "recommended_use": [
            "Use original_vs_adaptive_v1_vs_v2.png to show the improvement path.",
            "Use v2_best_readable_radargram.png for the cleanest grayscale inspection image.",
            "Use v2_reflector_guided_overlay.png only as a candidate-finding guide, not as proof.",
        ],
    }
    summary_path = OUT_DIR / "v2_readability_summary.json"
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print(f"Wrote {comparison_png}")
    print(f"Wrote {zoom_png}")
    print(f"Wrote {best_png}")
    print(f"Wrote {overlay_png}")
    print(f"Wrote {summary_path}")


if __name__ == "__main__":
    main()
