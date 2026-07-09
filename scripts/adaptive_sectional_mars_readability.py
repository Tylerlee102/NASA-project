"""Build an adaptive, section-aware readable view of the Mars SHARAD radargram.

The goal is not to invent missing signal. This script separates the radargram
into local quality zones, uses different local pooling/fill choices for rough
sections, and marks low-confidence sections that were muted or repaired.
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
OUT_DIR = OUTPUT_ROOT / "adaptive_sectional_readability"

USRDR_IMG = DATA_DIR / "radargram" / "s_01294501_rgram.img"
RETURN_CSV = DATA_DIR / "clutter_simulation" / "s_01294501_rtrn.csv"
USRDR_LINES = 3600
USRDR_COLUMNS = 4719

METHODS = {
    0: {
        "name": "keep/sharp",
        "description": "High-confidence section; keep the locally enhanced data.",
        "confidence": 1.0,
        "color": (84, 119, 196),
    },
    1: {
        "name": "small pool",
        "description": "Mildly unstable section; blend with a short local pool.",
        "confidence": 0.78,
        "color": (113, 180, 54),
    },
    2: {
        "name": "wide pool",
        "description": "Rough section; use a wider local pool to reduce speckle/clutter texture.",
        "confidence": 0.55,
        "color": (255, 190, 69),
    },
    3: {
        "name": "muted/repaired",
        "description": "Worst isolated trace artifacts; replace or mute and mark as low confidence.",
        "confidence": 0.22,
        "color": (204, 111, 59),
    },
}


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


def box_mean(values: np.ndarray, radius_y: int, radius_x: int) -> np.ndarray:
    if radius_y <= 0 and radius_x <= 0:
        return values.astype(np.float32, copy=True)
    padded = np.pad(values.astype(np.float32), ((radius_y, radius_y), (radius_x, radius_x)), mode="edge")
    integral = np.pad(padded, ((1, 0), (1, 0)), mode="constant").cumsum(axis=0).cumsum(axis=1)
    h = radius_y * 2 + 1
    w = radius_x * 2 + 1
    total = integral[h:, w:] - integral[:-h, w:] - integral[h:, :-w] + integral[:-h, :-w]
    return (total / float(h * w)).astype(np.float32)


def rolling_mean(values: np.ndarray, radius: int) -> np.ndarray:
    if radius <= 0:
        return values.astype(np.float32, copy=True)
    padded = np.pad(values.astype(np.float32), (radius, radius), mode="edge")
    kernel = np.ones(radius * 2 + 1, dtype=np.float32) / float(radius * 2 + 1)
    return np.convolve(padded, kernel, mode="valid").astype(np.float32)


def robust_z(values: np.ndarray) -> np.ndarray:
    finite = values[np.isfinite(values)]
    if finite.size == 0:
        return np.zeros(values.shape, dtype=np.float32)
    med = float(np.median(finite))
    mad = float(np.median(np.abs(finite - med)))
    scale = 1.4826 * mad if mad > 1e-7 else float(np.std(finite) + 1e-7)
    if scale <= 0:
        scale = 1.0
    out = (values - med) / scale
    out[~np.isfinite(out)] = 0.0
    return out.astype(np.float32)


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
    global_view = robust_scale(base, low_pct=1.0, high_pct=99.75)
    local_view = robust_scale(z, low_pct=0.5, high_pct=99.4)
    return np.clip(0.42 * global_view + 0.58 * local_view, 0.0, 1.0).astype(np.float32)


def despeckle(display: np.ndarray, *, sharpen: bool = True) -> np.ndarray:
    image = Image.fromarray(np.uint8(np.clip(display, 0, 1) * 255), mode="L")
    image = image.filter(ImageFilter.MedianFilter(size=3))
    if sharpen:
        image = image.filter(ImageFilter.UnsharpMask(radius=1.1, percent=105, threshold=3))
    return (np.asarray(image, dtype=np.float32) / 255.0).astype(np.float32)


def contiguous_runs(mask: np.ndarray) -> list[tuple[int, int]]:
    runs: list[tuple[int, int]] = []
    start: int | None = None
    for i, value in enumerate(mask.astype(bool)):
        if value and start is None:
            start = i
        elif not value and start is not None:
            runs.append((start, i))
            start = None
    if start is not None:
        runs.append((start, len(mask)))
    return runs


def classify_columns(crop: np.ndarray, above_surface: int) -> dict[str, np.ndarray]:
    work = destripe(crop)
    start = min(crop.shape[0] - 1, above_surface + 18)
    end = min(crop.shape[0], above_surface + 760)
    window = work[start:end]

    local_short = box_mean(window, radius_y=0, radius_x=7)
    local_wide = box_mean(window, radius_y=0, radius_x=35)
    residual = np.median(np.abs(window - local_short), axis=0)
    stripe = np.median(window - local_wide, axis=0)
    p90 = np.percentile(window, 90, axis=0)
    p10 = np.percentile(window, 10, axis=0)
    contrast = p90 - p10
    vertical_grad = np.median(np.abs(np.diff(window, axis=0)), axis=0)

    surface_slice = crop[max(0, above_surface - 45) : min(crop.shape[0], above_surface + 65)]
    surface_pick = np.argmax(surface_slice, axis=0).astype(np.float32) + max(0, above_surface - 45)
    surface_jump = np.abs(surface_pick - rolling_mean(surface_pick, radius=21))

    low_signal_z = np.maximum(-robust_z(p90), 0.0)
    stripe_z = np.abs(robust_z(stripe - rolling_mean(stripe, radius=35)))
    neighbor_z = np.maximum(robust_z(residual), 0.0)
    texture_z = np.maximum(robust_z(vertical_grad), 0.0) + 0.45 * np.maximum(-robust_z(contrast), 0.0)
    surface_z = np.maximum(robust_z(surface_jump), 0.0)

    score = (
        0.30 * np.clip(low_signal_z, 0, 8)
        + 0.31 * np.clip(stripe_z, 0, 8)
        + 0.22 * np.clip(neighbor_z, 0, 8)
        + 0.12 * np.clip(texture_z, 0, 8)
        + 0.05 * np.clip(surface_z, 0, 8)
    )
    score = rolling_mean(score, radius=3)

    p65, p86, p975 = np.percentile(score, [65, 86, 97.5])
    method = np.zeros(crop.shape[1], dtype=np.int16)
    method[score > max(0.85, float(p65))] = 1
    method[score > max(1.45, float(p86))] = 2

    # Use an orbit-relative tail cutoff for the worst narrow artifacts. The
    # absolute scores in this product are tightly distributed, so a fixed high
    # threshold can miss the traces a human would still choose to mute.
    tail_cutoff = float(np.percentile(score, 99.15))
    severe = (
        (score >= tail_cutoff)
        | ((stripe_z > 5.6) & (neighbor_z > 2.0))
        | ((low_signal_z > 5.2) & (neighbor_z > 1.6))
    )
    method[severe] = 3

    # Long coherent rough terrain should be treated as low-confidence/wide-pool,
    # not silently removed as if it were a bad trace.
    for start_run, end_run in contiguous_runs(method == 3):
        length = end_run - start_run
        if length > 36 and float(np.median(stripe_z[start_run:end_run])) < 6.5:
            method[start_run:end_run] = 2

    return {
        "method": method,
        "score": score.astype(np.float32),
        "low_signal_z": low_signal_z.astype(np.float32),
        "stripe_z": stripe_z.astype(np.float32),
        "neighbor_z": neighbor_z.astype(np.float32),
        "texture_z": texture_z.astype(np.float32),
        "surface_jitter_z": surface_z.astype(np.float32),
    }


def pooled_repair_columns(values: np.ndarray, method: np.ndarray) -> tuple[np.ndarray, np.ndarray, list[dict[str, object]]]:
    repaired = values.astype(np.float32, copy=True)
    confidence = np.ones(values.shape[1], dtype=np.float32)
    operations: list[dict[str, object]] = []
    repair_mask = method == 3
    good_mask = ~repair_mask

    for start, end in contiguous_runs(repair_mask):
        length = end - start
        if length <= 6:
            pool = 4
            blend = 1.0
            op = "short edge interpolation"
            conf = 0.78
        elif length <= 24:
            pool = 10
            blend = 0.78
            op = "medium pooled interpolation"
            conf = 0.55
        elif length <= 72:
            pool = 24
            blend = 0.48
            op = "wide contextual blend"
            conf = 0.34
        else:
            pool = 42
            blend = 0.0
            op = "muted local background"
            conf = 0.18

        left_pool = np.arange(max(0, start - pool), start)
        right_pool = np.arange(end, min(values.shape[1], end + pool))
        left_pool = left_pool[good_mask[left_pool]]
        right_pool = right_pool[good_mask[right_pool]]

        if left_pool.size and right_pool.size:
            left_anchor = np.median(values[:, left_pool], axis=1)
            right_anchor = np.median(values[:, right_pool], axis=1)
            local_background = np.median(values[:, np.concatenate([left_pool, right_pool])], axis=1)
            for offset, col in enumerate(range(start, end), start=1):
                t = offset / float(length + 1)
                edge_fill = (1.0 - t) * left_anchor + t * right_anchor
                repaired[:, col] = blend * edge_fill + (1.0 - blend) * local_background
        elif left_pool.size or right_pool.size:
            pool_cols = left_pool if left_pool.size else right_pool
            repaired[:, start:end] = np.median(values[:, pool_cols], axis=1, keepdims=True)
        else:
            repaired[:, start:end] = np.median(values, axis=1, keepdims=True)

        confidence[start:end] = conf
        operations.append(
            {
                "start_col": int(start),
                "end_col_exclusive": int(end),
                "length_cols": int(length),
                "operation": op,
                "pool_columns_each_side": int(pool),
                "confidence": float(conf),
            }
        )

    return repaired.astype(np.float32), confidence, operations


def build_adaptive_display(crop: np.ndarray, method: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    conditioned = destripe(crop)
    repaired, repair_confidence, _ = pooled_repair_columns(conditioned, method)

    sharp = despeckle(local_contrast(repaired, mean_radius_y=17, mean_radius_x=65))
    small_pool = despeckle(local_contrast(repaired, mean_radius_y=23, mean_radius_x=105))
    wide_pool = despeckle(local_contrast(repaired, mean_radius_y=33, mean_radius_x=185), sharpen=False)
    muted_background = robust_scale(box_mean(repaired, radius_y=3, radius_x=29), low_pct=1.0, high_pct=99.6)

    adaptive = np.empty_like(sharp)
    for code in METHODS:
        cols = method == code
        if not np.any(cols):
            continue
        if code == 0:
            adaptive[:, cols] = 0.76 * sharp[:, cols] + 0.24 * small_pool[:, cols]
        elif code == 1:
            adaptive[:, cols] = 0.48 * sharp[:, cols] + 0.52 * small_pool[:, cols]
        elif code == 2:
            adaptive[:, cols] = 0.22 * sharp[:, cols] + 0.78 * wide_pool[:, cols]
        else:
            adaptive[:, cols] = 0.12 * sharp[:, cols] + 0.46 * wide_pool[:, cols] + 0.42 * muted_background[:, cols]

    method_confidence = np.asarray([METHODS[int(code)]["confidence"] for code in method], dtype=np.float32)
    confidence = np.minimum(method_confidence, repair_confidence)
    confidence_2d = np.tile(confidence[np.newaxis, :], (crop.shape[0], 1))
    return np.clip(adaptive, 0, 1).astype(np.float32), confidence_2d, sharp, wide_pool


def save_gray(path: Path, display: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.uint8(np.clip(display, 0, 1) * 255), mode="L").save(path)


def save_rgb(path: Path, display: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.uint8(np.clip(display, 0, 1) * 255), mode="RGB").save(path)


def confidence_overlay(gray: np.ndarray, method: np.ndarray, confidence: np.ndarray) -> np.ndarray:
    rgb = np.dstack([gray, gray, gray]).astype(np.float32)
    conf_1d = confidence[0]
    for code, info in METHODS.items():
        cols = method == code
        if not np.any(cols) or code == 0:
            continue
        color = np.asarray(info["color"], dtype=np.float32) / 255.0
        alpha = (1.0 - conf_1d[cols]) * (0.34 if code < 3 else 0.58)
        rgb[:, cols] = rgb[:, cols] * (1.0 - alpha[np.newaxis, :, np.newaxis]) + color * alpha[np.newaxis, :, np.newaxis]
    return np.clip(rgb, 0, 1).astype(np.float32)


def method_strip(method: np.ndarray, height: int) -> np.ndarray:
    strip = np.zeros((height, method.size, 3), dtype=np.float32)
    for code, info in METHODS.items():
        cols = method == code
        color = np.asarray(info["color"], dtype=np.float32) / 255.0
        strip[:, cols, :] = color
    return strip


def image_panel(display: np.ndarray, width: int, height: int) -> Image.Image:
    if display.ndim == 2:
        image = Image.fromarray(np.uint8(np.clip(display, 0, 1) * 255), mode="L").convert("RGB")
    else:
        image = Image.fromarray(np.uint8(np.clip(display, 0, 1) * 255), mode="RGB")
    return image.resize((width, height), Image.Resampling.BILINEAR)


def render_summary_sheet(
    path: Path,
    original: np.ndarray,
    score: np.ndarray,
    method: np.ndarray,
    adaptive: np.ndarray,
    overlay: np.ndarray,
    section_rows: list[dict[str, object]],
) -> None:
    width = 1800
    margin = 22
    header_h = 122
    label_h = 54
    panel_w = (width - margin * 3) // 2
    panel_h = 420
    height = header_h + 2 * (panel_h + label_h + margin) + 116
    canvas = Image.new("RGB", (width, height), "#fbfaf6")
    draw = ImageDraw.Draw(canvas, "RGBA")
    title_font = font("segoeuib.ttf", 26)
    body_font = font("segoeui.ttf", 14)
    label_font = font("segoeuib.ttf", 15)
    note_font = font("segoeui.ttf", 12)
    mono_font = font("consola.ttf", 13)

    draw.text((margin, 18), "Mars SHARAD adaptive sectional readability pass", fill=(31, 36, 48, 255), font=title_font)
    draw.text(
        (margin, 54),
        "The radargram is split into local quality zones. Clean sections stay sharp; rough sections use wider pools; worst trace artifacts are muted/repaired and marked.",
        fill=(92, 99, 115, 255),
        font=body_font,
    )
    draw.text(
        (margin, 82),
        "This is a readable interpretation view, not recovered physics. Use the overlay/method map to see where the data was changed.",
        fill=(128, 65, 38, 255),
        font=body_font,
    )

    method_map = np.vstack(
        [
            method_strip(method, 60),
            np.repeat(robust_scale(score[np.newaxis, :], 1, 99.5), 88, axis=0)[..., None].repeat(3, axis=2),
        ]
    )
    panels = [
        ("Original surface-aligned radargram", "Raw power display aligned to the surface return.", robust_scale(original, 1, 99.85)),
        ("Quality/method map", "Top strip: processing choice. Lower strip: column problem score.", method_map),
        ("Adaptive best readable view", "Section-aware pooling and muted worst traces.", adaptive),
        ("Confidence overlay", "Color marks sections that were pooled or muted; orange means lowest confidence.", overlay),
    ]

    for index, (title, subtitle, display) in enumerate(panels):
        col = index % 2
        row = index // 2
        x = margin + col * (panel_w + margin)
        y = header_h + margin + row * (panel_h + label_h + margin)
        canvas.paste(image_panel(display, panel_w, panel_h), (x, y))
        draw.rectangle((x, y, x + panel_w - 1, y + panel_h - 1), outline=(210, 214, 224, 255), width=1)
        draw.line((x, y + int(panel_h * 0.10), x + panel_w, y + int(panel_h * 0.10)), fill=(246, 223, 86, 190), width=2)
        draw.text((x, y + panel_h + 8), title, fill=(31, 36, 48, 255), font=label_font)
        draw.text((x, y + panel_h + 30), subtitle, fill=(96, 102, 116, 255), font=note_font)

    legend_y = height - 92
    legend_x = margin
    for code, info in METHODS.items():
        color = info["color"]
        draw.rectangle((legend_x, legend_y, legend_x + 20, legend_y + 14), fill=(*color, 255), outline=(31, 36, 48, 140))
        draw.text((legend_x + 28, legend_y - 1), info["name"], fill=(31, 36, 48, 255), font=note_font)
        legend_x += 190

    counts = {int(code): int(np.sum(method == code)) for code in METHODS}
    count_line = " | ".join(f"{METHODS[code]['name']}: {counts[code]} cols" for code in METHODS)
    draw.text((margin, height - 57), count_line, fill=(31, 36, 48, 255), font=mono_font)

    low_conf_sections = [row for row in section_rows if row["dominant_method"] in ("wide pool", "muted/repaired")]
    note = f"Low-confidence/wide sections found: {len(low_conf_sections)} of {len(section_rows)} sections."
    draw.text((margin, height - 28), note, fill=(92, 99, 115, 255), font=note_font)
    path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(path)


def write_column_csv(path: Path, diagnostics: dict[str, np.ndarray]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    method = diagnostics["method"]
    with path.open("w", newline="", encoding="utf-8") as handle:
        fieldnames = [
            "column",
            "method_code",
            "method",
            "problem_score",
            "low_signal_z",
            "stripe_z",
            "neighbor_z",
            "texture_z",
            "surface_jitter_z",
        ]
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for col in range(method.size):
            code = int(method[col])
            writer.writerow(
                {
                    "column": col,
                    "method_code": code,
                    "method": METHODS[code]["name"],
                    "problem_score": f"{float(diagnostics['score'][col]):.6f}",
                    "low_signal_z": f"{float(diagnostics['low_signal_z'][col]):.6f}",
                    "stripe_z": f"{float(diagnostics['stripe_z'][col]):.6f}",
                    "neighbor_z": f"{float(diagnostics['neighbor_z'][col]):.6f}",
                    "texture_z": f"{float(diagnostics['texture_z'][col]):.6f}",
                    "surface_jitter_z": f"{float(diagnostics['surface_jitter_z'][col]):.6f}",
                }
            )


def summarize_sections(method: np.ndarray, score: np.ndarray, width: int = 160) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for start in range(0, method.size, width):
        end = min(method.size, start + width)
        part = method[start:end]
        counts = {code: int(np.sum(part == code)) for code in METHODS}
        dominant = max(counts, key=counts.get)
        rows.append(
            {
                "start_col": int(start),
                "end_col_exclusive": int(end),
                "dominant_method_code": int(dominant),
                "dominant_method": METHODS[int(dominant)]["name"],
                "median_problem_score": float(np.median(score[start:end])),
                "p90_problem_score": float(np.percentile(score[start:end], 90)),
                **{f"{METHODS[code]['name']}_cols": counts[code] for code in METHODS},
            }
        )
    return rows


def write_sections_csv(path: Path, rows: list[dict[str, object]]) -> None:
    if not rows:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    usrdr_db = read_usrdr_db()
    nadir_lines = read_nadir_lines()
    above_surface = 110
    crop = surface_aligned_crop(usrdr_db, nadir_lines, above=above_surface, below=990)

    diagnostics = classify_columns(crop, above_surface=above_surface)
    method = diagnostics["method"]
    repaired_values, repair_confidence, operations = pooled_repair_columns(destripe(crop), method)
    adaptive, confidence, sharp, wide_pool = build_adaptive_display(crop, method)
    overlay = confidence_overlay(adaptive, method, confidence)
    strip = method_strip(method, height=120)

    best_png = OUT_DIR / "adaptive_best_readable_radargram.png"
    overlay_png = OUT_DIR / "adaptive_confidence_overlay.png"
    method_png = OUT_DIR / "adaptive_method_map.png"
    sharp_png = OUT_DIR / "adaptive_sharp_reference.png"
    wide_png = OUT_DIR / "adaptive_wide_pool_reference.png"
    summary_png = OUT_DIR / "adaptive_sectional_summary.png"
    column_csv = OUT_DIR / "adaptive_column_quality.csv"
    section_csv = OUT_DIR / "adaptive_section_summary.csv"
    npz_path = OUT_DIR / "adaptive_readable_data.npz"

    save_gray(best_png, adaptive)
    save_rgb(overlay_png, overlay)
    save_rgb(method_png, strip)
    save_gray(sharp_png, sharp)
    save_gray(wide_png, wide_pool)
    write_column_csv(column_csv, diagnostics)
    section_rows = summarize_sections(method, diagnostics["score"])
    write_sections_csv(section_csv, section_rows)
    render_summary_sheet(summary_png, crop, diagnostics["score"], method, adaptive, overlay, section_rows)

    np.savez_compressed(
        npz_path,
        adaptive_display=adaptive.astype(np.float32),
        confidence=confidence.astype(np.float32),
        method=method.astype(np.int16),
        problem_score=diagnostics["score"].astype(np.float32),
        repaired_conditioned_db=repaired_values.astype(np.float32),
        repair_confidence=repair_confidence.astype(np.float32),
    )

    method_counts = {METHODS[code]["name"]: int(np.sum(method == code)) for code in METHODS}
    summary = {
        "purpose": "Make the Mars SHARAD radargram more readable with section-specific pooling instead of one global interpolation.",
        "important_limit": (
            "This is a display/conditioning product. Low-confidence sections are marked; the script does not claim to recover "
            "Doppler information or geology that is not separable in the measured data."
        ),
        "input": {
            "usrdr_numeric_img": str(USRDR_IMG.relative_to(ROOT)),
            "surface_geometry_csv": str(RETURN_CSV.relative_to(ROOT)),
            "surface_aligned_crop_shape": list(crop.shape),
            "surface_reference_row_in_crop": above_surface,
        },
        "methods": {
            str(code): {
                "name": METHODS[code]["name"],
                "description": METHODS[code]["description"],
                "column_count": method_counts[METHODS[code]["name"]],
            }
            for code in METHODS
        },
        "repair_operations": operations,
        "section_count": len(section_rows),
        "low_confidence_section_count": int(
            sum(1 for row in section_rows if row["dominant_method"] in ("wide pool", "muted/repaired"))
        ),
        "outputs": {
            "summary_sheet_png": str(summary_png.relative_to(ROOT)),
            "best_readable_png": str(best_png.relative_to(ROOT)),
            "confidence_overlay_png": str(overlay_png.relative_to(ROOT)),
            "method_map_png": str(method_png.relative_to(ROOT)),
            "column_quality_csv": str(column_csv.relative_to(ROOT)),
            "section_summary_csv": str(section_csv.relative_to(ROOT)),
            "adaptive_data_npz": str(npz_path.relative_to(ROOT)),
        },
        "recommended_use": [
            "Use adaptive_best_readable_radargram.png when you need the cleanest visual inspection image.",
            "Use adaptive_confidence_overlay.png beside it so you do not mistake muted/repaired zones for original measurements.",
            "Use the CSV files to explain which sections used sharp, small-pool, wide-pool, or muted/repaired processing.",
        ],
    }
    summary_path = OUT_DIR / "adaptive_sectional_summary.json"
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print(f"Wrote {summary_png}")
    print(f"Wrote {best_png}")
    print(f"Wrote {overlay_png}")
    print(f"Wrote {summary_path}")


if __name__ == "__main__":
    main()
