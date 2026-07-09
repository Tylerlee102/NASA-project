"""Diagnose whether the dark Mars radargram region is recoverable signal.

This is intentionally not a "fix the image" script. It compares the final
USRDR radargram, the same-orbit RDR complex-derived radargram, and the raw EDR
quicklook to decide whether the apparent missing area behaves like a data
dropout, a display problem, or weak/non-separable radar signal.
"""

from __future__ import annotations

import csv
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data" / "sharad_s_01294501"
OUTPUT_ROOT = ROOT / "outputs" / "mars_sharad_s_01294501"
COMPLEX_OUTPUT = OUTPUT_ROOT / "raw_complex_reprocess"
OUT_DIR = OUTPUT_ROOT / "missing_signal_diagnostic"

USRDR_IMG = DATA_DIR / "radargram" / "s_01294501_rgram.img"
RETURN_CSV = DATA_DIR / "clutter_simulation" / "s_01294501_rtrn.csv"
COMPLEX_NPZ = COMPLEX_OUTPUT / "rdr_complex_reprocessed_radargrams.npz"
EDR_NPZ = COMPLEX_OUTPUT / "edr_raw_echo_quicklook.npz"
REPROCESS_SUMMARY = COMPLEX_OUTPUT / "raw_complex_reprocessing_summary.json"

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


def scale_image(values: np.ndarray, low_pct: float = 1.0, high_pct: float = 99.85) -> np.ndarray:
    finite = values[np.isfinite(values)]
    if finite.size == 0:
        return np.zeros(values.shape, dtype=np.float32)
    low, high = np.percentile(finite, [low_pct, high_pct])
    if high <= low:
        low, high = float(finite.min()), float(finite.max())
    if high <= low:
        return np.zeros(values.shape, dtype=np.float32)
    scaled = np.clip((values - low) / (high - low), 0.0, 1.0)
    scaled[~np.isfinite(scaled)] = 0.0
    return scaled.astype(np.float32)


def common_scale(values: list[np.ndarray], low_pct: float = 1.0, high_pct: float = 99.85) -> tuple[float, float]:
    parts: list[np.ndarray] = []
    for value in values:
        finite = value[np.isfinite(value)].ravel()
        if finite.size > 500_000:
            finite = finite[:: max(1, finite.size // 500_000)]
        if finite.size:
            parts.append(finite.astype(np.float32, copy=False))
    if not parts:
        return 0.0, 1.0
    combined = np.concatenate(parts)
    low, high = np.percentile(combined, [low_pct, high_pct])
    if high <= low:
        low, high = float(combined.min()), float(combined.max())
    if high <= low:
        high = low + 1.0
    return float(low), float(high)


def normalize(values: np.ndarray, low: float, high: float) -> np.ndarray:
    scaled = np.clip((values - low) / (high - low), 0.0, 1.0)
    scaled[~np.isfinite(scaled)] = 0.0
    return scaled.astype(np.float32)


def image_from_array(values: np.ndarray, width: int, height: int, *, mode: str = "L") -> Image.Image:
    if values.ndim == 3:
        image = Image.fromarray(np.uint8(np.clip(values, 0, 1) * 255), mode="RGB")
    elif mode == "L":
        image = Image.fromarray(np.uint8(np.clip(values, 0, 1) * 255), mode="L").convert("RGB")
    else:
        image = Image.fromarray(np.uint8(np.clip(values, 0, 1) * 255), mode=mode).convert("RGB")
    return image.resize((width, height), Image.Resampling.BILINEAR)


def read_usrdr_db() -> np.ndarray:
    require_file(USRDR_IMG)
    data = np.fromfile(USRDR_IMG, dtype="<f4", count=USRDR_LINES * USRDR_COLUMNS)
    if data.size != USRDR_LINES * USRDR_COLUMNS:
        raise ValueError(f"USRDR IMG has {data.size} floats, expected {USRDR_LINES * USRDR_COLUMNS}")
    return robust_db_from_power(data.reshape((USRDR_LINES, USRDR_COLUMNS)))


def read_nadir_lines() -> np.ndarray:
    require_file(RETURN_CSV)
    nadir: list[float] = []
    with RETURN_CSV.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            nadir.append(float(row["NadirLine"]))
    return np.asarray(nadir, dtype=np.float32)


def surface_relative_energy_usrdr(db_image: np.ndarray, nadir_lines: np.ndarray) -> np.ndarray:
    values = np.empty(db_image.shape[1], dtype=np.float32)
    for col in range(db_image.shape[1]):
        surface = int(round(float(nadir_lines[min(col, len(nadir_lines) - 1)]))) - 1
        start = max(0, surface + 40)
        end = min(db_image.shape[0], surface + 700)
        if end <= start:
            values[col] = np.nan
        else:
            values[col] = float(np.percentile(db_image[start:end, col], 90.0))
    return values


def energy_by_column(db_image: np.ndarray, start: int | None = None, end: int | None = None) -> np.ndarray:
    subset = db_image if start is None or end is None else db_image[start:end]
    return np.percentile(subset, 90.0, axis=0).astype(np.float32)


def robust_z(values: np.ndarray) -> np.ndarray:
    finite = values[np.isfinite(values)]
    if finite.size == 0:
        return np.zeros(values.shape, dtype=np.float32)
    med = float(np.median(finite))
    mad = float(np.median(np.abs(finite - med)))
    if mad <= 1e-9:
        mad = float(np.std(finite))
    if mad <= 1e-9:
        return np.zeros(values.shape, dtype=np.float32)
    return ((values - med) / (1.4826 * mad)).astype(np.float32)


def low_energy_runs(z_values: np.ndarray, threshold: float = -1.7, min_width: int = 24) -> list[tuple[int, int]]:
    bad = np.asarray(z_values < threshold, dtype=bool)
    runs: list[tuple[int, int]] = []
    start: int | None = None
    for i, value in enumerate(bad):
        if value and start is None:
            start = i
        if start is not None and (not value or i == len(bad) - 1):
            end = i if value and i == len(bad) - 1 else i - 1
            if end - start + 1 >= min_width:
                runs.append((start + 1, end + 1))
            start = None
    return runs


def write_rows(path: Path, rows: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def resample_profile(values: np.ndarray, width: int) -> np.ndarray:
    x_old = np.linspace(0, 1, len(values))
    x_new = np.linspace(0, 1, width)
    finite = np.asarray(values, dtype=np.float32)
    mask = np.isfinite(finite)
    if not np.any(mask):
        return np.zeros(width, dtype=np.float32)
    return np.interp(x_new, x_old[mask], finite[mask]).astype(np.float32)


def draw_profile_panel(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    profiles: dict[str, np.ndarray],
    colors: dict[str, tuple[int, int, int, int]],
    title: str,
    subtitle: str,
    low_runs: list[tuple[int, int]],
) -> None:
    x0, y0, x1, y1 = box
    title_font = font("segoeuib.ttf", 17)
    body_font = font("segoeui.ttf", 12)
    small_font = font("segoeui.ttf", 11)
    draw.rectangle(box, fill=(255, 255, 255, 255), outline=(210, 214, 224, 255), width=1)
    draw.text((x0 + 14, y0 + 12), title, fill=(31, 36, 48, 255), font=title_font)
    draw.text((x0 + 14, y0 + 36), subtitle, fill=(92, 99, 115, 255), font=body_font)

    px0, py0 = x0 + 56, y0 + 72
    px1, py1 = x1 - 18, y1 - 42
    plot_w = px1 - px0
    plot_h = py1 - py0
    for i in range(5):
        y = py0 + i * plot_h / 4
        draw.line((px0, y, px1, y), fill=(230, 232, 238, 255), width=1)
    draw.rectangle((px0, py0, px1, py1), outline=(199, 204, 216, 255), width=1)

    for start_col, end_col in low_runs:
        rx0 = px0 + (start_col - 1) / USRDR_COLUMNS * plot_w
        rx1 = px0 + (end_col - 1) / USRDR_COLUMNS * plot_w
        draw.rectangle((rx0, py0, rx1, py1), fill=(240, 152, 70, 45))

    all_values = np.concatenate([profile[np.isfinite(profile)] for profile in profiles.values()])
    low, high = np.percentile(all_values, [2.0, 98.0])
    if high <= low:
        high = low + 1.0

    def xy(profile: np.ndarray) -> list[tuple[float, float]]:
        sampled = resample_profile(profile, plot_w)
        out: list[tuple[float, float]] = []
        for i, value in enumerate(sampled):
            y = py1 - (float(value) - low) / (high - low) * plot_h
            out.append((px0 + i, y))
        return out

    for label, profile in profiles.items():
        points = xy(profile)
        if len(points) > 1:
            draw.line(points, fill=colors[label], width=2)

    legend_x = px0
    legend_y = y1 - 27
    for label, color in colors.items():
        draw.line((legend_x, legend_y, legend_x + 24, legend_y), fill=color, width=3)
        draw.text((legend_x + 31, legend_y - 8), label, fill=(55, 60, 72, 255), font=small_font)
        legend_x += 180

    draw.text((px0, py1 + 9), "start", fill=(101, 107, 121, 255), font=small_font)
    draw.text((px1, py1 + 9), "end", fill=(101, 107, 121, 255), font=small_font, anchor="ra")


def render_diagnostic(
    path: Path,
    usrdr_display: np.ndarray,
    complex_display: np.ndarray,
    edr_display: np.ndarray,
    problem_display: np.ndarray,
    profiles: dict[str, np.ndarray],
    low_runs: list[tuple[int, int]],
) -> None:
    width = 1800
    margin = 22
    header_h = 92
    panel_w = (width - margin * 3) // 2
    panel_h = 450
    profile_h = 330
    height = header_h + panel_h * 2 + profile_h + margin * 5
    canvas = Image.new("RGB", (width, height), "#fbfaf6")
    draw = ImageDraw.Draw(canvas, "RGBA")
    title_font = font("segoeuib.ttf", 26)
    body_font = font("segoeui.ttf", 14)
    label_font = font("segoeuib.ttf", 15)

    draw.text((margin, 20), "Mars SHARAD missing-signal diagnostic", fill=(31, 36, 48, 255), font=title_font)
    draw.text(
        (margin, 56),
        "This separates display, complex echo power, and raw-data coverage. Orange marks column ranges with unusually low deep echo energy.",
        fill=(92, 99, 115, 255),
        font=body_font,
    )

    panels = [
        ("Final USRDR power radargram", usrdr_display),
        ("RDR complex-derived radargram", complex_display),
        ("Raw EDR echo quicklook, unfocused", edr_display),
        ("Low-energy evidence map", problem_display),
    ]
    for index, (label, array) in enumerate(panels):
        col = index % 2
        row = index // 2
        x = margin + col * (panel_w + margin)
        y = header_h + margin + row * (panel_h + margin + 26)
        image = image_from_array(array, panel_w, panel_h)
        canvas.paste(image, (x, y))
        draw.rectangle((x, y, x + panel_w - 1, y + panel_h - 1), outline=(210, 214, 224, 255), width=1)
        draw.text((x, y + panel_h + 8), label, fill=(31, 36, 48, 255), font=label_font)
        for start_col, end_col in low_runs:
            rx0 = x + (start_col - 1) / USRDR_COLUMNS * panel_w
            rx1 = x + (end_col - 1) / USRDR_COLUMNS * panel_w
            draw.rectangle((rx0, y, rx1, y + panel_h), outline=(240, 152, 70, 210), width=2)

    profile_y = header_h + margin + 2 * (panel_h + margin + 26)
    draw_profile_panel(
        draw,
        (margin, profile_y, width - margin, profile_y + profile_h),
        profiles,
        {
            "USRDR": (84, 119, 196, 255),
            "RDR complex": (184, 160, 55, 255),
            "EDR raw": (113, 180, 54, 255),
        },
        "Column energy profile",
        "Low columns in the final radargram are also weak in the complex product; raw data exists, but focused signal is not separable there.",
        low_runs,
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(path)


def surface_aligned_usrdr_crop(db_image: np.ndarray, nadir_lines: np.ndarray, above: int, below: int) -> np.ndarray:
    crop = np.full((above + below, db_image.shape[1]), np.nan, dtype=np.float32)
    for col in range(db_image.shape[1]):
        surface = int(round(float(nadir_lines[min(col, len(nadir_lines) - 1)]))) - 1
        start = surface - above
        end = surface + below
        src_start = max(0, start)
        src_end = min(db_image.shape[0], end)
        dst_start = src_start - start
        dst_end = dst_start + (src_end - src_start)
        if src_end > src_start:
            crop[dst_start:dst_end, col] = db_image[src_start:src_end, col]
    finite = crop[np.isfinite(crop)]
    fill = float(np.percentile(finite, 1.0)) if finite.size else 0.0
    crop[~np.isfinite(crop)] = fill
    return crop


def fixed_rdr_crop(db_image: np.ndarray, surface_sample: int, above: int, below: int) -> np.ndarray:
    start = max(0, surface_sample - above)
    end = min(db_image.shape[0], surface_sample + below)
    return db_image[start:end].astype(np.float32)


def render_surface_aligned_comparison(
    path: Path,
    usrdr_crop: np.ndarray,
    rdr_crop: np.ndarray,
    filtered_crop: np.ndarray,
    difference_crop: np.ndarray,
) -> None:
    width = 1800
    margin = 22
    header_h = 86
    panel_w = (width - margin * 3) // 2
    panel_h = 490
    height = header_h + panel_h * 2 + margin * 4 + 36
    canvas = Image.new("RGB", (width, height), "#fbfaf6")
    draw = ImageDraw.Draw(canvas, "RGBA")
    title_font = font("segoeuib.ttf", 26)
    body_font = font("segoeui.ttf", 14)
    label_font = font("segoeuib.ttf", 15)
    note_font = font("segoeui.ttf", 12)

    draw.text((margin, 20), "Surface-aligned view of the problem", fill=(31, 36, 48, 255), font=title_font)
    draw.text(
        (margin, 55),
        "The surface is aligned near the top in each radargram. The lower dark zone stays dark because the complex data does not contain a clean separable echo there.",
        fill=(92, 99, 115, 255),
        font=body_font,
    )

    common_low, common_high = common_scale([usrdr_crop, rdr_crop, filtered_crop])
    panels = [
        ("Final USRDR, surface aligned", normalize(usrdr_crop, common_low, common_high)),
        ("RDR complex baseline, surface aligned", normalize(rdr_crop, common_low, common_high)),
        ("Targeted pre-final notch, surface aligned", normalize(filtered_crop, common_low, common_high)),
        ("Absolute filter difference", scale_image(difference_crop, low_pct=2.0, high_pct=99.4)),
    ]
    for index, (label, array) in enumerate(panels):
        col = index % 2
        row = index // 2
        x = margin + col * (panel_w + margin)
        y = header_h + margin + row * (panel_h + margin + 28)
        image = image_from_array(array, panel_w, panel_h)
        canvas.paste(image, (x, y))
        draw.rectangle((x, y, x + panel_w - 1, y + panel_h - 1), outline=(210, 214, 224, 255), width=1)
        draw.line((x, y + int(panel_h * 0.10), x + panel_w, y + int(panel_h * 0.10)), fill=(246, 223, 86, 210), width=3)
        draw.text((x, y + panel_h + 8), label, fill=(31, 36, 48, 255), font=label_font)

    draw.text(
        (margin, height - 24),
        "Yellow line marks the aligned surface reference; the difference panel shows the filter mostly changes texture/power, not a hidden layer.",
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
    require_file(EDR_NPZ)
    complex_npz = np.load(COMPLEX_NPZ)
    edr_npz = np.load(EDR_NPZ)
    complex_db = complex_npz["baseline_complex_power_db"].astype(np.float32)
    filtered_db = complex_npz["alias_range_notch_prefinal_power_db"].astype(np.float32)
    edr_raw = edr_npz["mean_abs_raw_echo"].astype(np.float32)

    usrdr_energy = surface_relative_energy_usrdr(usrdr_db, nadir_lines)
    complex_surface = int(np.median(np.argmax(complex_db, axis=0)))
    complex_energy = energy_by_column(
        complex_db,
        start=min(complex_db.shape[0] - 1, complex_surface + 25),
        end=min(complex_db.shape[0], complex_surface + 170),
    )
    edr_energy = energy_by_column(robust_db_from_power(edr_raw), start=400, end=2600)

    usrdr_z = robust_z(usrdr_energy)
    complex_z = robust_z(complex_energy)
    combined_z = (usrdr_z + complex_z) / 2.0
    low_runs = low_energy_runs(combined_z)

    usrdr_display = scale_image(usrdr_db)
    low, high = common_scale([complex_db])
    complex_display = normalize(complex_db, low, high)
    edr_display = scale_image(robust_db_from_power(edr_raw), low_pct=1.0, high_pct=99.8)

    evidence = np.tile(np.clip((-combined_z + 0.5) / 4.0, 0.0, 1.0), (220, 1)).astype(np.float32)
    problem_display = np.zeros((220, USRDR_COLUMNS, 3), dtype=np.float32)
    problem_display[:, :, 0] = evidence
    problem_display[:, :, 1] = evidence * 0.55
    problem_display[:, :, 2] = 1.0 - evidence * 0.70
    for start_col, end_col in low_runs:
        problem_display[:, start_col - 1 : end_col, 0] = 0.94
        problem_display[:, start_col - 1 : end_col, 1] = 0.60
        problem_display[:, start_col - 1 : end_col, 2] = 0.27

    rows = []
    for col in range(USRDR_COLUMNS):
        rows.append(
            {
                "column": col + 1,
                "usrdr_deep_energy_db": float(usrdr_energy[col]),
                "usrdr_robust_z": float(usrdr_z[col]),
                "rdr_complex_deep_energy_db": float(complex_energy[col]),
                "rdr_complex_robust_z": float(complex_z[col]),
                "edr_raw_deep_energy_db": float(edr_energy[col]),
                "combined_low_signal_score": float(combined_z[col]),
                "low_signal_flag": bool(combined_z[col] < -1.7),
            }
        )
    evidence_csv = OUT_DIR / "column_signal_evidence.csv"
    write_rows(evidence_csv, rows)

    diagnostic_png = OUT_DIR / "missing_signal_diagnostic.png"
    render_diagnostic(
        diagnostic_png,
        usrdr_display,
        complex_display,
        edr_display,
        problem_display,
        profiles={
            "USRDR": usrdr_energy,
            "RDR complex": complex_energy,
            "EDR raw": edr_energy,
        },
        low_runs=low_runs,
    )

    usrdr_aligned = surface_aligned_usrdr_crop(usrdr_db, nadir_lines, above=110, below=990)
    rdr_aligned = fixed_rdr_crop(complex_db, surface_sample=complex_surface, above=24, below=220)
    filtered_aligned = fixed_rdr_crop(filtered_db, surface_sample=complex_surface, above=24, below=220)
    difference_aligned = np.abs(filtered_aligned - rdr_aligned)
    surface_aligned_png = OUT_DIR / "surface_aligned_problem_view.png"
    render_surface_aligned_comparison(
        surface_aligned_png,
        usrdr_crop=usrdr_aligned,
        rdr_crop=rdr_aligned,
        filtered_crop=filtered_aligned,
        difference_crop=difference_aligned,
    )

    summary = {
        "question": "Does the dark/missing radargram region look recoverable from same-orbit raw or complex data?",
        "finding": (
            "The apparent gap is not a full-column file/data-coverage dropout. The same orbit contains valid EDR and RDR records. "
            "When the surface is aligned, the targeted complex-domain filter mostly changes texture and power; it does not reveal a clean hidden reflector."
        ),
        "severity_for_filtering_goal": "high",
        "confidence": "medium",
        "evidence": {
            "usrdr_shape": list(usrdr_db.shape),
            "rdr_complex_shape": list(complex_db.shape),
            "edr_quicklook_shape": list(edr_raw.shape),
            "rdr_surface_sample": complex_surface,
            "low_signal_column_runs": low_runs,
            "low_signal_column_count": int(sum(end - start + 1 for start, end in low_runs)),
            "low_signal_rule": "average of USRDR and RDR-complex robust-z energy below -1.7 for at least 24 consecutive columns",
        },
        "interpretation": [
            "The RDR complex product can be filtered before radargram rendering, but that only suppresses separable Doppler energy.",
            "The raw EDR quicklook confirms records exist; it does not show a simple missing-file hole that can be filled.",
            "The narrow Doppler filters looked worse because they removed broad real signal and amplified speckle/noise appearance.",
            "A single-orbit Doppler filter cannot reconstruct signal that is weak, shadowed, geometrically ambiguous, or overlapped by clutter in the measured complex echoes.",
        ],
        "recommended_next_step": (
            "Use this orbit as the problem example, then compare nearby/crossover SHARAD tracks or true surface-clutter simulation/3D migration. "
            "That is the path that can distinguish clutter from real subsurface reflectors without inventing data."
        ),
        "outputs": {
            "diagnostic_png": str(diagnostic_png.relative_to(ROOT)),
            "surface_aligned_problem_view_png": str(surface_aligned_png.relative_to(ROOT)),
            "column_signal_evidence_csv": str(evidence_csv.relative_to(ROOT)),
        },
    }
    summary_path = OUT_DIR / "missing_signal_diagnostic_summary.json"
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"Wrote {diagnostic_png}")
    print(f"Wrote {surface_aligned_png}")
    print(f"Wrote {evidence_csv}")
    print(f"Wrote {summary_path}")


if __name__ == "__main__":
    main()
