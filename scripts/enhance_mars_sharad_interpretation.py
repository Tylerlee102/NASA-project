"""Create interpretation-safe enhanced views of the Mars SHARAD radargram.

These products are not recovered measurements. They are display and
signal-conditioning views meant to make real structures easier to inspect:
surface flattening, destriping, local contrast, mild despeckling, and a
reflector-strength overlay.
"""

from __future__ import annotations

import csv
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data" / "sharad_s_01294501"
OUTPUT_ROOT = ROOT / "outputs" / "mars_sharad_s_01294501"
COMPLEX_DIR = OUTPUT_ROOT / "raw_complex_reprocess"
OUT_DIR = OUTPUT_ROOT / "enhanced_interpretation"

USRDR_IMG = DATA_DIR / "radargram" / "s_01294501_rgram.img"
RETURN_CSV = DATA_DIR / "clutter_simulation" / "s_01294501_rtrn.csv"
COMPLEX_NPZ = COMPLEX_DIR / "rdr_complex_reprocessed_radargrams.npz"

USRDR_LINES = 3600
USRDR_COLUMNS = 4719


def require_file(path: Path) -> None:
    if not path.exists():
        raise FileNotFoundError(path)


def font(name: str, size: int) -> ImageFont.ImageFont:
    try:
        return ImageFont.truetype(name, size)
    except OSError:
        return ImageFont.load_default()


def robust_db_from_power(power: np.ndarray) -> np.ndarray:
    positive = power[np.isfinite(power) & (power > 0)]
    if positive.size == 0:
        return np.zeros(power.shape, dtype=np.float32)
    floor = float(np.percentile(positive, 0.05))
    if not math.isfinite(floor) or floor <= 0:
        floor = float(positive.min())
    db = 10.0 * np.log10(np.maximum(power, floor))
    db[~np.isfinite(db)] = 10.0 * math.log10(floor)
    return db.astype(np.float32)


def read_usrdr_db() -> np.ndarray:
    require_file(USRDR_IMG)
    data = np.fromfile(USRDR_IMG, dtype="<f4", count=USRDR_LINES * USRDR_COLUMNS)
    if data.size != USRDR_LINES * USRDR_COLUMNS:
        raise ValueError(f"Expected {USRDR_LINES * USRDR_COLUMNS} floats, read {data.size}")
    return robust_db_from_power(data.reshape((USRDR_LINES, USRDR_COLUMNS)))


def read_nadir_lines() -> np.ndarray:
    require_file(RETURN_CSV)
    rows: list[float] = []
    with RETURN_CSV.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            rows.append(float(row["NadirLine"]))
    return np.asarray(rows, dtype=np.float32)


def surface_aligned_crop(values: np.ndarray, surface_lines: np.ndarray, above: int, below: int) -> np.ndarray:
    crop = np.full((above + below, values.shape[1]), np.nan, dtype=np.float32)
    for col in range(values.shape[1]):
        surface = int(round(float(surface_lines[min(col, len(surface_lines) - 1)]))) - 1
        src_start = max(0, surface - above)
        src_end = min(values.shape[0], surface + below)
        dst_start = src_start - (surface - above)
        dst_end = dst_start + (src_end - src_start)
        if src_end > src_start:
            crop[dst_start:dst_end, col] = values[src_start:src_end, col]
    finite = crop[np.isfinite(crop)]
    fill = float(np.percentile(finite, 1.0)) if finite.size else 0.0
    crop[~np.isfinite(crop)] = fill
    return crop


def fixed_surface_crop(values: np.ndarray, above: int, below: int) -> tuple[np.ndarray, int]:
    surface = int(np.median(np.argmax(values, axis=0)))
    start = max(0, surface - above)
    end = min(values.shape[0], surface + below)
    return values[start:end].astype(np.float32), surface


def box_mean(values: np.ndarray, radius_y: int, radius_x: int) -> np.ndarray:
    if radius_y <= 0 and radius_x <= 0:
        return values.astype(np.float32, copy=True)
    padded = np.pad(values.astype(np.float32), ((radius_y, radius_y), (radius_x, radius_x)), mode="edge")
    integral = np.pad(padded, ((1, 0), (1, 0)), mode="constant").cumsum(axis=0).cumsum(axis=1)
    h = radius_y * 2 + 1
    w = radius_x * 2 + 1
    total = integral[h:, w:] - integral[:-h, w:] - integral[h:, :-w] + integral[:-h, :-w]
    return (total / float(h * w)).astype(np.float32)


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


def destripe(values: np.ndarray) -> np.ndarray:
    work = values.astype(np.float32, copy=True)
    col_bias = np.median(work, axis=0, keepdims=True)
    work = work - col_bias + float(np.median(col_bias))
    row_background = box_mean(np.median(work, axis=1, keepdims=True), radius_y=19, radius_x=0)
    work = work - row_background + float(np.median(row_background))
    return work.astype(np.float32)


def local_contrast(values: np.ndarray, mean_radius_y: int, mean_radius_x: int) -> np.ndarray:
    base = destripe(values)
    mean = box_mean(base, mean_radius_y, mean_radius_x)
    second = box_mean(base * base, mean_radius_y, mean_radius_x)
    std = np.sqrt(np.maximum(second - mean * mean, 1e-5))
    z = (base - mean) / (std + 1e-4)
    global_view = robust_scale(base, low_pct=1.0, high_pct=99.7)
    local_view = robust_scale(z, low_pct=0.5, high_pct=99.4)
    return np.clip(0.42 * global_view + 0.58 * local_view, 0.0, 1.0).astype(np.float32)


def despeckle(display: np.ndarray) -> np.ndarray:
    image = Image.fromarray(np.uint8(np.clip(display, 0, 1) * 255), mode="L")
    image = image.filter(ImageFilter.MedianFilter(size=3))
    image = image.filter(ImageFilter.UnsharpMask(radius=1.2, percent=115, threshold=3))
    return (np.asarray(image, dtype=np.float32) / 255.0).astype(np.float32)


def reflector_strength(values: np.ndarray) -> np.ndarray:
    base = destripe(values)
    narrow = box_mean(base, radius_y=1, radius_x=9)
    broad = box_mean(base, radius_y=17, radius_x=37)
    ridge = np.maximum(narrow - broad, 0.0)
    ridge = box_mean(ridge, radius_y=0, radius_x=15)
    return robust_scale(ridge, low_pct=65.0, high_pct=99.65)


def overlay_reflectors(gray: np.ndarray, strength: np.ndarray) -> np.ndarray:
    gray = np.clip(gray, 0.0, 1.0)
    strength = np.clip(strength, 0.0, 1.0)
    rgb = np.dstack([gray, gray, gray]).astype(np.float32)
    gold = np.asarray([1.0, 0.76, 0.24], dtype=np.float32)
    cyan = np.asarray([0.38, 0.78, 0.96], dtype=np.float32)
    color = 0.72 * gold + 0.28 * cyan
    alpha = 0.58 * strength[..., None]
    return np.clip(rgb * (1.0 - alpha) + color * alpha, 0.0, 1.0).astype(np.float32)


def save_gray(path: Path, display: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.uint8(np.clip(display, 0, 1) * 255), mode="L").save(path)


def save_rgb(path: Path, display: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.uint8(np.clip(display, 0, 1) * 255), mode="RGB").save(path)


def resize_for_panel(display: np.ndarray, width: int, height: int) -> Image.Image:
    if display.ndim == 2:
        image = Image.fromarray(np.uint8(np.clip(display, 0, 1) * 255), mode="L").convert("RGB")
    else:
        image = Image.fromarray(np.uint8(np.clip(display, 0, 1) * 255), mode="RGB")
    return image.resize((width, height), Image.Resampling.BILINEAR)


def render_sheet(path: Path, panels: list[tuple[str, str, np.ndarray]]) -> None:
    width = 1800
    margin = 22
    header_h = 92
    label_h = 50
    panel_w = (width - margin * 3) // 2
    panel_h = 450
    rows = math.ceil(len(panels) / 2)
    height = header_h + rows * (panel_h + label_h + margin) + margin + 26
    canvas = Image.new("RGB", (width, height), "#fbfaf6")
    draw = ImageDraw.Draw(canvas, "RGBA")
    title_font = font("segoeuib.ttf", 26)
    body_font = font("segoeui.ttf", 14)
    label_font = font("segoeuib.ttf", 15)
    note_font = font("segoeui.ttf", 12)

    draw.text((margin, 20), "Mars SHARAD enhanced interpretation views", fill=(31, 36, 48, 255), font=title_font)
    draw.text(
        (margin, 56),
        "These are display improvements only: flattened surface, destriped background, local contrast, and reflector-strength overlay.",
        fill=(92, 99, 115, 255),
        font=body_font,
    )

    for index, (title, subtitle, display) in enumerate(panels):
        col = index % 2
        row = index // 2
        x = margin + col * (panel_w + margin)
        y = header_h + margin + row * (panel_h + label_h + margin)
        canvas.paste(resize_for_panel(display, panel_w, panel_h), (x, y))
        draw.rectangle((x, y, x + panel_w - 1, y + panel_h - 1), outline=(210, 214, 224, 255), width=1)
        draw.line((x, y + int(panel_h * 0.10), x + panel_w, y + int(panel_h * 0.10)), fill=(246, 223, 86, 210), width=3)
        draw.text((x, y + panel_h + 8), title, fill=(31, 36, 48, 255), font=label_font)
        draw.text((x, y + panel_h + 29), subtitle, fill=(96, 102, 116, 255), font=note_font)

    draw.text(
        (margin, height - 22),
        "Yellow line marks the aligned surface reference. Use enhanced views to inspect candidates, not as replacement measurements.",
        fill=(100, 105, 116, 255),
        font=note_font,
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(path)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    usrdr_db = read_usrdr_db()
    nadir_lines = read_nadir_lines()
    require_file(COMPLEX_NPZ)
    complex_npz = np.load(COMPLEX_NPZ)
    complex_db = complex_npz["baseline_complex_power_db"].astype(np.float32)

    usrdr_crop = surface_aligned_crop(usrdr_db, nadir_lines, above=110, below=990)
    complex_crop, complex_surface_sample = fixed_surface_crop(complex_db, above=24, below=220)

    flattened = robust_scale(usrdr_crop, low_pct=1.0, high_pct=99.85)
    destriped_display = robust_scale(destripe(usrdr_crop), low_pct=1.0, high_pct=99.75)
    local_display = local_contrast(usrdr_crop, mean_radius_y=23, mean_radius_x=115)
    despeckled_display = despeckle(local_display)
    ridge = reflector_strength(usrdr_crop)
    overlay = overlay_reflectors(despeckled_display, ridge)

    complex_local = despeckle(local_contrast(complex_crop, mean_radius_y=9, mean_radius_x=115))
    complex_ridge = reflector_strength(complex_crop)
    complex_overlay = overlay_reflectors(complex_local, complex_ridge)

    outputs = {
        "01_surface_flattened_usrdr.png": flattened,
        "02_destriped_surface_flattened_usrdr.png": destriped_display,
        "03_local_contrast_despeckled_usrdr.png": despeckled_display,
        "04_reflector_strength_overlay_usrdr.png": overlay,
        "05_complex_local_contrast.png": complex_local,
        "06_complex_reflector_overlay.png": complex_overlay,
    }
    for name, display in outputs.items():
        path = OUT_DIR / name
        if display.ndim == 2:
            save_gray(path, display)
        else:
            save_rgb(path, display)

    sheet_path = OUT_DIR / "enhancement_comparison_sheet.png"
    render_sheet(
        sheet_path,
        [
            ("Surface-flattened original", "Raw power display, aligned to the surface.", flattened),
            ("Destriped background", "Column and row background removed; no synthetic signal added.", destriped_display),
            ("Local contrast + despeckle", "Best single view for inspecting weak continuous structures.", despeckled_display),
            ("Reflector-strength overlay", "Gold/cyan highlights continuous bright ridges in the same data.", overlay),
            ("Complex local contrast", "Same idea applied to RDR complex-derived power.", complex_local),
            ("Complex reflector overlay", "Cross-check: features should be treated more seriously when they appear here too.", complex_overlay),
        ],
    )

    summary = {
        "purpose": "Improve interpretability of messy Mars SHARAD data without inventing missing signal.",
        "best_single_view": str((OUT_DIR / "03_local_contrast_despeckled_usrdr.png").relative_to(ROOT)),
        "best_overlay_view": str((OUT_DIR / "04_reflector_strength_overlay_usrdr.png").relative_to(ROOT)),
        "comparison_sheet": str(sheet_path.relative_to(ROOT)),
        "inputs": {
            "usrdr_numeric_img": str(USRDR_IMG.relative_to(ROOT)),
            "rdr_complex_npz": str(COMPLEX_NPZ.relative_to(ROOT)),
            "nadir_geometry_csv": str(RETURN_CSV.relative_to(ROOT)),
        },
        "methods": [
            "Surface flattening aligns the nadir/surface return so dipping and weak subsurface patterns are easier to compare.",
            "Destriping subtracts robust column and range backgrounds to reduce acquisition/display artifacts.",
            "Local contrast uses a moving-window z-score blended with global power so weak structure is not crushed by the surface echo.",
            "Mild median despeckling and unsharp masking improve readability but are marked as display-only conditioning.",
            "Reflector-strength overlay highlights laterally continuous bright ridges; it is a candidate-finding aid, not proof of geology.",
        ],
        "limits": [
            "These views do not recover signal that is absent or non-separable in the raw/complex measurements.",
            "Do not digitize layer depths from the enhanced images; use the original numeric data for measurements.",
            "Treat colored overlay features as candidates that need cross-track/crossover or clutter-simulation support.",
        ],
        "complex_surface_sample": complex_surface_sample,
        "outputs": {name: str((OUT_DIR / name).relative_to(ROOT)) for name in outputs},
    }
    summary_path = OUT_DIR / "enhanced_interpretation_summary.json"
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"Wrote {sheet_path}")
    print(f"Wrote {OUT_DIR / '03_local_contrast_despeckled_usrdr.png'}")
    print(f"Wrote {OUT_DIR / '04_reflector_strength_overlay_usrdr.png'}")
    print(f"Wrote {summary_path}")


if __name__ == "__main__":
    main()
