from __future__ import annotations

import html
import json
import math
import textwrap
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image, ImageDraw, ImageFont


BASE_DIR = Path(__file__).resolve().parent
PACK_DIR = BASE_DIR / "presentation_pack"
CHART_DIR = PACK_DIR / "charts"

SUMMARY_CSV = BASE_DIR / "paper_calibrated_v2_summary.csv"
RESULTS_CSV = BASE_DIR / "paper_calibrated_v2_results.csv"
MATERIALS_CSV = BASE_DIR / "paper_material_library.csv"
SENSITIVITY_CSV = BASE_DIR / "paper_calibrated_v2_attenuation_sensitivity.csv"
VALIDATION_CSV = BASE_DIR / "physics_validation_checks.csv"

W = 1600
H = 940

TOKENS = {
    "surface": "#FCFCFD",
    "panel": "#FFFFFF",
    "ink": "#1F2430",
    "muted": "#6F768A",
    "grid": "#E6E8F0",
    "axis": "#D7DBE7",
    "neutral_xlight": "#F4F5F7",
    "neutral_light": "#E2E5EA",
    "neutral_base": "#C5CAD3",
    "neutral_mid": "#7A828F",
    "neutral_dark": "#464C55",
}

COLORS = {
    "blue_xlight": "#EAF1FE",
    "blue_light": "#CEDFFE",
    "blue_base": "#A3BEFA",
    "blue_mid": "#5477C4",
    "blue_dark": "#2E4780",
    "gold_xlight": "#FFF4C2",
    "gold_light": "#FFEA8F",
    "gold_base": "#FFE15B",
    "gold_mid": "#B8A037",
    "gold_dark": "#736422",
    "orange_xlight": "#FFEDDE",
    "orange_light": "#FFBDA1",
    "orange_base": "#F0986E",
    "orange_mid": "#CC6F47",
    "orange_dark": "#804126",
    "olive_xlight": "#D8ECBD",
    "olive_light": "#BEEB96",
    "olive_base": "#A3D576",
    "olive_mid": "#71B436",
    "olive_dark": "#386411",
    "pink_xlight": "#FCDAD6",
    "pink_light": "#F5BACC",
    "pink_base": "#F390CA",
    "pink_mid": "#BD569B",
    "pink_dark": "#8A3A6F",
}

SCENARIO_LABELS = {
    "clean_ice_control": "Clean ice",
    "salt_layers_reason": "Salt layers",
    "near_surface_brine": "Near-surface brine",
    "warm_impure_ice": "Warm impure ice",
    "briny_mushy_lens": "Briny/mushy lens",
    "stacked_dirty_layers": "Stacked dirty layers",
    "complex_paper_calibrated": "Complex dirty ice",
    "rough_surface_clutter": "Rough surface clutter",
    "complex_with_clutter": "Complex + clutter",
}

HF_SCENARIO_ORDER = [
    "clean_ice_control",
    "salt_layers_reason",
    "near_surface_brine",
    "warm_impure_ice",
    "briny_mushy_lens",
    "stacked_dirty_layers",
    "complex_paper_calibrated",
]

CLUTTER_SCENARIO_ORDER = [
    "clean_ice_control",
    "rough_surface_clutter",
    "complex_paper_calibrated",
    "complex_with_clutter",
]

BAND_LABELS = {
    "HF_9MHz_full_depth": "HF 9 MHz full depth",
    "VHF_60MHz_full_depth_lowDR": "VHF 60 MHz full depth",
    "VHF_60MHz_shallow": "VHF 60 MHz shallow",
}

SHELL_LABELS = {
    "thin_3km_reason_mode": "Thin 3 km",
    "workbook_mid_shell": "Workbook-depth",
    "thick_30km_reason_mode": "Thick 30 km",
}


def rgb(hex_color: str) -> tuple[int, int, int]:
    value = hex_color.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def blend(a: str, b: str, t: float) -> str:
    ar, ag, ab = rgb(a)
    br, bg, bb = rgb(b)
    t = max(0.0, min(1.0, t))
    return "#{:02X}{:02X}{:02X}".format(
        round(ar + (br - ar) * t),
        round(ag + (bg - ag) * t),
        round(ab + (bb - ab) * t),
    )


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = []
    if bold:
        candidates.extend(
            [
                "C:/Windows/Fonts/segoeuib.ttf",
                "C:/Windows/Fonts/arialbd.ttf",
                "C:/Windows/Fonts/calibrib.ttf",
            ]
        )
    candidates.extend(
        [
            "C:/Windows/Fonts/segoeui.ttf",
            "C:/Windows/Fonts/arial.ttf",
            "C:/Windows/Fonts/calibri.ttf",
        ]
    )
    for path in candidates:
        try:
            return ImageFont.truetype(path, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


FONT_TITLE = load_font(42, True)
FONT_SUBTITLE = load_font(24)
FONT_SECTION = load_font(28, True)
FONT_LABEL = load_font(22)
FONT_LABEL_BOLD = load_font(22, True)
FONT_SMALL = load_font(18)
FONT_SMALL_BOLD = load_font(18, True)
FONT_TINY = load_font(15)


def text_size(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont) -> tuple[int, int]:
    if text == "":
        return 0, 0
    box = draw.textbbox((0, 0), text, font=font)
    return box[2] - box[0], box[3] - box[1]


def draw_wrapped(
    draw: ImageDraw.ImageDraw,
    text: str,
    xy: tuple[int, int],
    font: ImageFont.ImageFont,
    fill: str,
    max_width: int,
    line_gap: int = 6,
) -> int:
    words = str(text).split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = word if not current else f"{current} {word}"
        if text_size(draw, candidate, font)[0] <= max_width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    x, y = xy
    for line in lines:
        draw.text((x, y), line, font=font, fill=rgb(fill))
        y += text_size(draw, line, font)[1] + line_gap
    return y


def draw_header(
    draw: ImageDraw.ImageDraw,
    title: str,
    subtitle: str,
    *,
    left: int = 70,
    top: int = 48,
    width: int = 1320,
) -> None:
    y = draw_wrapped(draw, title, (left, top), FONT_TITLE, TOKENS["ink"], width, 8)
    draw_wrapped(draw, subtitle, (left, y + 6), FONT_SUBTITLE, TOKENS["muted"], width, 7)


def save_chart(img: Image.Image, name: str) -> Path:
    CHART_DIR.mkdir(parents=True, exist_ok=True)
    path = CHART_DIR / name
    img.save(path, optimize=True)
    return path


def make_canvas(width: int = W, height: int = H) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    img = Image.new("RGB", (width, height), rgb(TOKENS["surface"]))
    draw = ImageDraw.Draw(img)
    draw.rectangle((30, 30, width - 30, height - 30), fill=rgb(TOKENS["panel"]), outline=rgb(TOKENS["grid"]))
    return img, draw


def fmt_pct(value: float, digits: int = 1) -> str:
    if pd.isna(value):
        return "n/a"
    if abs(value - round(value)) < 0.05:
        return f"{value:.0f}%"
    return f"{value:.{digits}f}%"


def fmt_db(value: float, digits: int = 1) -> str:
    if pd.isna(value):
        return "n/a"
    return f"{value:+.{digits}f} dB"


def nice_min_max(values: list[float], pad: float = 0.08) -> tuple[float, float]:
    finite = [float(v) for v in values if pd.notna(v) and math.isfinite(float(v))]
    if not finite:
        return -1.0, 1.0
    lo = min(finite)
    hi = max(finite)
    if lo == hi:
        lo -= 1.0
        hi += 1.0
    span = hi - lo
    lo -= span * pad
    hi += span * pad
    if lo > 0:
        lo = 0.0
    if hi < 0:
        hi = 0.0
    return lo, hi


def chart_outcome_mix(summary: pd.DataFrame) -> Path:
    data = (
        summary.query("shell_mode == 'workbook_mid_shell' and band == 'HF_9MHz_full_depth'")
        .set_index("scenario")
        .reindex(HF_SCENARIO_ORDER)
        .reset_index()
    )
    img, draw = make_canvas()
    draw_header(
        draw,
        "Dirty ice changes the interpretation outcome, not only the echo strength",
        "Workbook-depth shell, HF 9 MHz full-depth mode; each bar is the share of 241 along-track points in the v2 sensitivity run.",
    )

    left = 410
    right = 1450
    top = 240
    row_h = 72
    bar_h = 36
    scale_w = right - left
    label_x = 86
    segment_cols = [
        ("clear_ocean_pct", "Clear ocean", COLORS["olive_base"], COLORS["olive_dark"]),
        ("deep_false_risk_pct", "Deep false-risk", COLORS["orange_base"], COLORS["orange_dark"]),
        ("weak_no_deep_detection_pct", "Weak/no deep", TOKENS["neutral_light"], TOKENS["neutral_mid"]),
    ]

    legend_x = left
    legend_y = 175
    for _, label, fill, edge in segment_cols:
        draw.rounded_rectangle((legend_x, legend_y, legend_x + 28, legend_y + 18), radius=4, fill=rgb(fill), outline=rgb(edge))
        draw.text((legend_x + 38, legend_y - 3), label, font=FONT_SMALL, fill=rgb(TOKENS["ink"]))
        legend_x += text_size(draw, label, FONT_SMALL)[0] + 85

    for tick in range(0, 101, 25):
        x = left + scale_w * tick / 100
        draw.line((x, top - 20, x, top + row_h * len(data) - 28), fill=rgb(TOKENS["grid"]), width=1)
        tw, _ = text_size(draw, f"{tick}%", FONT_TINY)
        draw.text((x - tw // 2, top + row_h * len(data) - 18), f"{tick}%", font=FONT_TINY, fill=rgb(TOKENS["muted"]))

    for i, row in data.iterrows():
        y = top + i * row_h
        label = SCENARIO_LABELS.get(row["scenario"], row["scenario"])
        draw.text((label_x, y + 3), label, font=FONT_LABEL_BOLD if row["scenario"] in {"stacked_dirty_layers", "complex_paper_calibrated"} else FONT_LABEL, fill=rgb(TOKENS["ink"]))
        draw.text((label_x, y + 31), f"median ocean margin {fmt_db(row['median_ocean_snr_margin_db'])}", font=FONT_TINY, fill=rgb(TOKENS["muted"]))

        x0 = left
        for col, _, fill, edge in segment_cols:
            val = 0.0 if pd.isna(row[col]) else float(row[col])
            w = scale_w * val / 100.0
            if w > 0.5:
                draw.rounded_rectangle((x0, y, x0 + w, y + bar_h), radius=8, fill=rgb(fill), outline=rgb(edge))
                if w > 78:
                    label_txt = fmt_pct(val)
                    tw, th = text_size(draw, label_txt, FONT_SMALL_BOLD)
                    draw.text((x0 + w / 2 - tw / 2, y + bar_h / 2 - th / 2 - 1), label_txt, font=FONT_SMALL_BOLD, fill=rgb(TOKENS["ink"]))
            x0 += w

    draw.text((left, H - 68), "Detection threshold: 0 dB SNR margin; deep false-risk includes ambiguous, false-stronger, and hidden-false-visible cases.", font=FONT_TINY, fill=rgb(TOKENS["muted"]))
    return save_chart(img, "01_hf_scenario_outcomes.png")


def line_points(
    xs: list[float],
    ys: list[float],
    x_min: float,
    x_max: float,
    y_min: float,
    y_max: float,
    plot: tuple[int, int, int, int],
) -> list[tuple[int, int]]:
    left, top, right, bottom = plot
    points = []
    for x, y in zip(xs, ys):
        if pd.isna(y) or not math.isfinite(float(y)):
            continue
        px = left + (float(x) - x_min) / (x_max - x_min) * (right - left)
        py = bottom - (float(y) - y_min) / (y_max - y_min) * (bottom - top)
        points.append((round(px), round(py)))
    return points


def chart_false_layer_track(results: pd.DataFrame) -> Path:
    data = results.query(
        "shell_mode == 'workbook_mid_shell' and band == 'HF_9MHz_full_depth' and scenario == 'stacked_dirty_layers'"
    ).sort_values("x_km")
    img, draw = make_canvas()
    draw_header(
        draw,
        "A stacked dirty layer can track as the stronger deep return",
        "Along-track HF 9 MHz example; positive SNR margin is detectable, and the orange line is the strongest internal false reflector.",
    )

    plot = (135, 220, 1450, 760)
    left, top, right, bottom = plot
    x_min, x_max = float(data["x_km"].min()), float(data["x_km"].max())
    y_min, y_max = nice_min_max(
        list(data["ocean_snr_margin_db"]) + list(data["false_snr_margin_db"]) + [0.0],
        pad=0.12,
    )

    risk = (data["false_snr_margin_db"] > data["ocean_snr_margin_db"]) & (data["false_snr_margin_db"] >= 0)
    if risk.any():
        x_values = data["x_km"].to_numpy()
        for x0, x1, is_risk in zip(x_values[:-1], x_values[1:], risk.to_numpy()[:-1]):
            if is_risk:
                px0 = left + (x0 - x_min) / (x_max - x_min) * (right - left)
                px1 = left + (x1 - x_min) / (x_max - x_min) * (right - left)
                draw.rectangle((px0, top, px1, bottom), fill=rgb(COLORS["orange_xlight"]))

    for frac in np.linspace(0, 1, 6):
        y = top + frac * (bottom - top)
        draw.line((left, y, right, y), fill=rgb(TOKENS["grid"]), width=1)
        val = y_max - frac * (y_max - y_min)
        draw.text((58, y - 10), f"{val:.0f}", font=FONT_TINY, fill=rgb(TOKENS["muted"]))

    for tick in [-60, -30, 0, 30, 60]:
        x = left + (tick - x_min) / (x_max - x_min) * (right - left)
        draw.line((x, bottom, x, bottom + 8), fill=rgb(TOKENS["axis"]), width=2)
        tw, _ = text_size(draw, str(tick), FONT_TINY)
        draw.text((x - tw // 2, bottom + 18), str(tick), font=FONT_TINY, fill=rgb(TOKENS["muted"]))

    zero_y = bottom - (0 - y_min) / (y_max - y_min) * (bottom - top)
    draw.line((left, zero_y, right, zero_y), fill=rgb(TOKENS["ink"]), width=2)
    draw.text((right + 10, zero_y - 12), "0 dB threshold", font=FONT_SMALL, fill=rgb(TOKENS["ink"]))

    ocean_pts = line_points(list(data["x_km"]), list(data["ocean_snr_margin_db"]), x_min, x_max, y_min, y_max, plot)
    false_pts = line_points(list(data["x_km"]), list(data["false_snr_margin_db"]), x_min, x_max, y_min, y_max, plot)
    if len(ocean_pts) > 1:
        draw.line(ocean_pts, fill=rgb(COLORS["blue_mid"]), width=4)
    if len(false_pts) > 1:
        draw.line(false_pts, fill=rgb(COLORS["orange_mid"]), width=4)

    draw.rectangle((left, top, right, bottom), outline=rgb(TOKENS["axis"]), width=2)
    draw.text((left, bottom + 52), "Along-track position, x_km", font=FONT_SMALL, fill=rgb(TOKENS["ink"]))
    draw.text((48, top - 34), "SNR margin, dB", font=FONT_SMALL, fill=rgb(TOKENS["ink"]))

    lx = left
    ly = 170
    legend = [
        ("True ocean boundary", COLORS["blue_mid"]),
        ("Internal false reflector", COLORS["orange_mid"]),
        ("false reflector stronger", COLORS["orange_xlight"]),
    ]
    for label, color in legend:
        if "stronger" in label:
            draw.rounded_rectangle((lx, ly, lx + 35, ly + 18), radius=3, fill=rgb(color), outline=rgb(COLORS["orange_light"]))
        else:
            draw.line((lx, ly + 8, lx + 35, ly + 8), fill=rgb(color), width=5)
        draw.text((lx + 45, ly - 3), label, font=FONT_SMALL, fill=rgb(TOKENS["ink"]))
        lx += text_size(draw, label, FONT_SMALL)[0] + 94

    last_false = data.iloc[-1]
    draw.text((1050, 790), f"End-track false margin: {fmt_db(last_false['false_snr_margin_db'])}", font=FONT_SMALL_BOLD, fill=rgb(COLORS["orange_dark"]))
    draw.text((1050, 820), f"End-track ocean margin: {fmt_db(last_false['ocean_snr_margin_db'])}", font=FONT_SMALL_BOLD, fill=rgb(COLORS["blue_dark"]))
    return save_chart(img, "02_false_layer_track_example.png")


def chart_band_shell_margin(summary: pd.DataFrame) -> Path:
    data = summary.query("scenario == 'clean_ice_control'").copy()
    img, draw = make_canvas()
    draw_header(
        draw,
        "Radar band and shell thickness set the clean-ice depth limit",
        "Median true-ocean SNR margin for the clean control; missing bars mean the ocean is outside the shallow-mode window or no deep margin is defined.",
    )
    plot = (150, 230, 1450, 770)
    left, top, right, bottom = plot
    shells = ["thin_3km_reason_mode", "workbook_mid_shell", "thick_30km_reason_mode"]
    bands = ["HF_9MHz_full_depth", "VHF_60MHz_full_depth_lowDR", "VHF_60MHz_shallow"]
    values = []
    for shell in shells:
        for band in bands:
            row = data[(data["shell_mode"] == shell) & (data["band"] == band)]
            values.append(float(row["median_ocean_snr_margin_db"].iloc[0]) if len(row) and pd.notna(row["median_ocean_snr_margin_db"].iloc[0]) else np.nan)
    y_min, y_max = nice_min_max(values + [0.0], pad=0.18)

    for frac in np.linspace(0, 1, 6):
        y = top + frac * (bottom - top)
        draw.line((left, y, right, y), fill=rgb(TOKENS["grid"]), width=1)
        val = y_max - frac * (y_max - y_min)
        draw.text((70, y - 10), f"{val:.0f}", font=FONT_TINY, fill=rgb(TOKENS["muted"]))

    zero_y = bottom - (0 - y_min) / (y_max - y_min) * (bottom - top)
    draw.line((left, zero_y, right, zero_y), fill=rgb(TOKENS["ink"]), width=2)
    draw.text((right + 10, zero_y - 11), "0 dB", font=FONT_SMALL, fill=rgb(TOKENS["ink"]))

    band_styles = {
        "HF_9MHz_full_depth": (COLORS["blue_base"], COLORS["blue_dark"]),
        "VHF_60MHz_full_depth_lowDR": (COLORS["gold_base"], COLORS["gold_dark"]),
        "VHF_60MHz_shallow": (COLORS["pink_base"], COLORS["pink_dark"]),
    }
    group_w = (right - left) / len(shells)
    bar_w = 92
    for si, shell in enumerate(shells):
        cx = left + group_w * (si + 0.5)
        draw.text((cx - text_size(draw, SHELL_LABELS[shell], FONT_LABEL_BOLD)[0] / 2, bottom + 45), SHELL_LABELS[shell], font=FONT_LABEL_BOLD, fill=rgb(TOKENS["ink"]))
        for bi, band in enumerate(bands):
            row = data[(data["shell_mode"] == shell) & (data["band"] == band)]
            val = float(row["median_ocean_snr_margin_db"].iloc[0]) if len(row) and pd.notna(row["median_ocean_snr_margin_db"].iloc[0]) else np.nan
            x0 = cx + (bi - 1) * (bar_w + 18) - bar_w / 2
            fill, edge = band_styles[band]
            if pd.isna(val):
                y0 = zero_y - 8
                draw.rounded_rectangle((x0, y0, x0 + bar_w, y0 + 16), radius=4, fill=rgb(TOKENS["panel"]), outline=rgb(TOKENS["neutral_mid"]), width=2)
                draw.text((x0 + 20, y0 - 28), "n/a", font=FONT_TINY, fill=rgb(TOKENS["muted"]))
                continue
            y_val = bottom - (val - y_min) / (y_max - y_min) * (bottom - top)
            y0, y1 = (y_val, zero_y) if val >= 0 else (zero_y, y_val)
            draw.rounded_rectangle((x0, y0, x0 + bar_w, y1), radius=8, fill=rgb(fill), outline=rgb(edge), width=2)
            label = fmt_db(val)
            tw, _ = text_size(draw, label, FONT_TINY)
            draw.text((x0 + bar_w / 2 - tw / 2, min(y0, y1) - 28 if val >= 0 else max(y0, y1) + 8), label, font=FONT_TINY, fill=rgb(TOKENS["ink"]))

    lx = left
    ly = 178
    for band in bands:
        fill, edge = band_styles[band]
        draw.rounded_rectangle((lx, ly, lx + 30, ly + 18), radius=4, fill=rgb(fill), outline=rgb(edge))
        label = BAND_LABELS[band]
        draw.text((lx + 40, ly - 3), label, font=FONT_SMALL, fill=rgb(TOKENS["ink"]))
        lx += text_size(draw, label, FONT_SMALL)[0] + 85

    draw.rectangle(plot, outline=rgb(TOKENS["axis"]), width=2)
    draw.text((54, top - 34), "Median ocean SNR margin, dB", font=FONT_SMALL, fill=rgb(TOKENS["ink"]))
    return save_chart(img, "03_band_shell_margin.png")


def chart_vhf_clutter(summary: pd.DataFrame) -> Path:
    data = (
        summary.query("shell_mode == 'workbook_mid_shell' and band == 'VHF_60MHz_shallow'")
        .set_index("scenario")
        .reindex(CLUTTER_SCENARIO_ORDER)
        .reset_index()
    )
    img, draw = make_canvas()
    draw_header(
        draw,
        "Clutter is a shallow-window ambiguity, not a fake ocean echo",
        "Workbook-depth shell, VHF 60 MHz shallow mode; surface clutter is tracked separately from internal dirty-layer false boundaries.",
    )

    left = 410
    right = 1450
    top = 250
    row_h = 104
    bar_h = 42
    scale_w = right - left
    label_x = 86
    segment_cols = [
        ("surface_clutter_pct", "Surface clutter", COLORS["pink_base"], COLORS["pink_dark"]),
        ("internal_feature_only_pct", "Internal feature", COLORS["gold_base"], COLORS["gold_dark"]),
        ("outside_band_depth_window_pct", "Outside shallow window", TOKENS["neutral_light"], TOKENS["neutral_mid"]),
        ("weak_no_deep_detection_pct", "Weak/no detection", TOKENS["neutral_base"], TOKENS["neutral_dark"]),
    ]

    legend_x = left
    legend_y = 180
    for _, label, fill, edge in segment_cols:
        draw.rounded_rectangle((legend_x, legend_y, legend_x + 28, legend_y + 18), radius=4, fill=rgb(fill), outline=rgb(edge))
        draw.text((legend_x + 38, legend_y - 3), label, font=FONT_SMALL, fill=rgb(TOKENS["ink"]))
        legend_x += text_size(draw, label, FONT_SMALL)[0] + 80

    for tick in range(0, 101, 25):
        x = left + scale_w * tick / 100
        draw.line((x, top - 22, x, top + row_h * len(data) - 34), fill=rgb(TOKENS["grid"]), width=1)
        tw, _ = text_size(draw, f"{tick}%", FONT_TINY)
        draw.text((x - tw // 2, top + row_h * len(data) - 18), f"{tick}%", font=FONT_TINY, fill=rgb(TOKENS["muted"]))

    for i, row in data.iterrows():
        y = top + i * row_h
        scenario = str(row["scenario"])
        label = SCENARIO_LABELS.get(scenario, scenario)
        draw_wrapped(draw, label, (label_x, y - 2), FONT_LABEL_BOLD, TOKENS["ink"], 285, 4)

        clutter_margin = row.get("median_surface_clutter_snr_margin_db", np.nan)
        clutter_pct = float(row["surface_clutter_pct"]) if pd.notna(row["surface_clutter_pct"]) else 0.0
        note = "no clutter stressor"
        if clutter_pct > 0:
            note = f"median clutter margin {fmt_db(float(clutter_margin))}"
        elif scenario == "complex_paper_calibrated":
            note = "internal features, no clutter"
        draw_wrapped(draw, note, (label_x, y + 45), FONT_TINY, TOKENS["muted"], 285, 4)

        x0 = left
        for col, _, fill, edge in segment_cols:
            val = 0.0 if pd.isna(row[col]) else float(row[col])
            w = scale_w * val / 100.0
            if w > 0.5:
                draw.rounded_rectangle((x0, y, x0 + w, y + bar_h), radius=8, fill=rgb(fill), outline=rgb(edge))
                if w > 82:
                    label_txt = fmt_pct(val)
                    tw, th = text_size(draw, label_txt, FONT_SMALL_BOLD)
                    draw.text((x0 + w / 2 - tw / 2, y + bar_h / 2 - th / 2 - 1), label_txt, font=FONT_SMALL_BOLD, fill=rgb(TOKENS["ink"]))
            x0 += w

    draw.text((left, H - 70), "REASON's VHF interferometry is designed to help discriminate cross-track clutter; this v2 chart only stress-tests where clutter could appear.", font=FONT_TINY, fill=rgb(TOKENS["muted"]))
    return save_chart(img, "07_vhf_clutter_stress.png")


def chart_material_library(materials: pd.DataFrame) -> Path:
    data = materials[materials["key"] != "liquid_ocean"].copy()
    data = data.sort_values("eps_real").reset_index(drop=True)
    img, draw = make_canvas(1600, 1080)
    draw_header(
        draw,
        "The v2 material library separates dielectric contrast from radar loss",
        "Paper-anchored epsilon values set reflectivity; attenuation brackets control how strongly layers and the ocean survive through warm or dirty ice.",
        width=1360,
    )
    y0 = 230
    row_h = 112
    label_left = 80
    eps_left, eps_right = 520, 900
    att_left, att_right = 1060, 1460
    max_eps = max(10.0, float(data["eps_real"].max()))
    max_att = max(20.0, float(data["attenuation_db_km_hf_max"].max()))

    for title, x in [("epsilon real", eps_left), ("HF attenuation bracket, dB/km", att_left)]:
        draw.text((x, 176), title, font=FONT_LABEL_BOLD, fill=rgb(TOKENS["ink"]))
    for tick in [0, 2, 4, 6, 8, 10]:
        x = eps_left + (tick / max_eps) * (eps_right - eps_left)
        draw.line((x, y0 - 22, x, y0 + row_h * len(data) - 28), fill=rgb(TOKENS["grid"]), width=1)
        draw.text((x - 8, y0 + row_h * len(data) - 18), str(tick), font=FONT_TINY, fill=rgb(TOKENS["muted"]))
    for tick in [0, 5, 10, 15, 20]:
        x = att_left + (tick / max_att) * (att_right - att_left)
        draw.line((x, y0 - 22, x, y0 + row_h * len(data) - 28), fill=rgb(TOKENS["grid"]), width=1)
        draw.text((x - 8, y0 + row_h * len(data) - 18), str(tick), font=FONT_TINY, fill=rgb(TOKENS["muted"]))

    families = [COLORS["blue_base"], COLORS["gold_base"], COLORS["olive_base"], COLORS["pink_base"], COLORS["orange_base"], TOKENS["neutral_base"]]
    edges = [COLORS["blue_dark"], COLORS["gold_dark"], COLORS["olive_dark"], COLORS["pink_dark"], COLORS["orange_dark"], TOKENS["neutral_dark"]]
    for i, row in data.iterrows():
        y = y0 + i * row_h
        fill = families[i % len(families)]
        edge = edges[i % len(edges)]
        label_bottom = draw_wrapped(draw, str(row["label"]), (label_left, y - 4), FONT_LABEL_BOLD, TOKENS["ink"], 380, 5)
        draw_wrapped(draw, str(row["source_status"]), (label_left, label_bottom + 4), FONT_TINY, TOKENS["muted"], 390, 4)

        eps = float(row["eps_real"])
        ex = eps_left + (eps / max_eps) * (eps_right - eps_left)
        draw.line((eps_left, y + 20, ex, y + 20), fill=rgb(fill), width=15)
        draw.ellipse((ex - 10, y + 10, ex + 10, y + 30), fill=rgb(fill), outline=rgb(edge), width=2)
        draw.text((ex + 16, y + 7), f"{eps:.1f}", font=FONT_SMALL_BOLD, fill=rgb(TOKENS["ink"]))

        att_min = float(row["attenuation_db_km_hf_min"])
        att_max = float(row["attenuation_db_km_hf_max"])
        ax0 = att_left + (att_min / max_att) * (att_right - att_left)
        ax1 = att_left + (att_max / max_att) * (att_right - att_left)
        draw.line((ax0, y + 20, ax1, y + 20), fill=rgb(fill), width=16)
        draw.ellipse((ax0 - 7, y + 13, ax0 + 7, y + 27), fill=rgb(TOKENS["panel"]), outline=rgb(edge), width=2)
        draw.ellipse((ax1 - 7, y + 13, ax1 + 7, y + 27), fill=rgb(fill), outline=rgb(edge), width=2)
        draw.text((ax1 + 16, y + 7), f"{att_min:.1f}-{att_max:.1f}", font=FONT_SMALL_BOLD, fill=rgb(TOKENS["ink"]))

    draw.text((80, 1015), "Liquid ocean is excluded from this chart because it is used only as the bottom-boundary endmember in this v2 sensitivity model.", font=FONT_TINY, fill=rgb(TOKENS["muted"]))
    return save_chart(img, "04_material_library.png")


def chart_attenuation_sensitivity(sens: pd.DataFrame) -> Path:
    data = sens[np.isclose(sens["eps"], 9.0)].copy()
    pivot = data.pivot_table(
        index="dirty_layer_attenuation_db_km_hf",
        columns="dirty_layer_thickness_m",
        values="deep_false_risk_pct",
    ).sort_index(ascending=True).sort_index(axis=1)
    img, draw = make_canvas()
    draw_header(
        draw,
        "For brine-like epsilon, false-risk depends on both thickness and loss",
        "Sensitivity grid for epsilon = 9.0; cell values show deep false-boundary risk percentage for the HF 9 MHz workbook-depth setup.",
    )
    left, top, right, bottom = 245, 285, 1390, 810
    rows = list(pivot.index)
    cols = list(pivot.columns)
    cell_w = (right - left) / len(cols)
    cell_h = (bottom - top) / len(rows)
    max_val = float(np.nanmax(pivot.to_numpy())) if pivot.size else 1.0
    max_val = max(max_val, 1.0)

    for ci, col in enumerate(cols):
        x = left + ci * cell_w
        label = f"{col:g} m"
        tw, _ = text_size(draw, label, FONT_TINY)
        draw.text((x + cell_w / 2 - tw / 2, top - 34), label, font=FONT_TINY, fill=rgb(TOKENS["ink"]))
    for ri, row in enumerate(rows):
        y = top + ri * cell_h
        label = f"{row:g}"
        draw.text((180, y + cell_h / 2 - 9), label, font=FONT_TINY, fill=rgb(TOKENS["ink"]))
        for ci, col in enumerate(cols):
            val = pivot.loc[row, col]
            t = 0.0 if pd.isna(val) else float(val) / max_val
            fill = blend(TOKENS["panel"], COLORS["orange_base"], t)
            x = left + ci * cell_w
            draw.rectangle((x, y, x + cell_w, y + cell_h), fill=rgb(fill), outline=rgb(TOKENS["panel"]))
            label_val = fmt_pct(0.0 if pd.isna(val) else float(val), 0)
            tw, th = text_size(draw, label_val, FONT_SMALL_BOLD)
            text_color = TOKENS["ink"] if t < 0.65 else "#FFFFFF"
            draw.text((x + cell_w / 2 - tw / 2, y + cell_h / 2 - th / 2), label_val, font=FONT_SMALL_BOLD, fill=rgb(text_color))

    draw.rectangle((left, top, right, bottom), outline=rgb(TOKENS["axis"]), width=2)
    draw.text((left, bottom + 42), "Dirty layer thickness", font=FONT_SMALL, fill=rgb(TOKENS["ink"]))
    draw.text((78, top - 38), "HF attenuation, dB/km", font=FONT_SMALL, fill=rgb(TOKENS["ink"]))

    legend_left = 1425
    legend_top = 270
    legend_h = 320
    for i in range(legend_h):
        t = 1 - i / legend_h
        draw.line((legend_left, legend_top + i, legend_left + 32, legend_top + i), fill=rgb(blend(TOKENS["panel"], COLORS["orange_base"], t)))
    draw.rectangle((legend_left, legend_top, legend_left + 32, legend_top + legend_h), outline=rgb(TOKENS["axis"]))
    draw.text((legend_left + 45, legend_top - 8), f"{max_val:.0f}%", font=FONT_TINY, fill=rgb(TOKENS["muted"]))
    draw.text((legend_left + 45, legend_top + legend_h - 12), "0%", font=FONT_TINY, fill=rgb(TOKENS["muted"]))
    draw.text((legend_left - 20, legend_top + legend_h + 28), "false-risk", font=FONT_TINY, fill=rgb(TOKENS["muted"]))
    return save_chart(img, "05_attenuation_sensitivity.png")


def chart_validation(validation: pd.DataFrame) -> Path:
    img, draw = make_canvas()
    draw_header(
        draw,
        "Physics sanity checks pass before interpretation is trusted",
        "The v2 normal-incidence thin-layer solver is checked against two simple cases: one Fresnel interface and no dielectric contrast.",
    )
    card_left = 130
    card_right = 1470
    card_top = 235
    card_h = 210
    for i, row in validation.iterrows():
        top = card_top + i * (card_h + 46)
        passed = str(row["passed"]).lower() == "true"
        fill = COLORS["olive_xlight"] if passed else COLORS["orange_xlight"]
        edge = COLORS["olive_dark"] if passed else COLORS["orange_dark"]
        draw.rounded_rectangle((card_left, top, card_right, top + card_h), radius=14, fill=rgb(fill), outline=rgb(edge), width=2)
        badge = "PASS" if passed else "CHECK"
        draw.rounded_rectangle((card_left + 28, top + 28, card_left + 128, top + 68), radius=8, fill=rgb(edge), outline=rgb(edge))
        draw.text((card_left + 53, top + 37), badge, font=FONT_SMALL_BOLD, fill=(255, 255, 255))
        draw.text((card_left + 160, top + 28), str(row["check"]), font=FONT_SECTION, fill=rgb(TOKENS["ink"]))
        observed = float(row["observed"])
        expected = float(row["expected"])
        abs_error = float(row["abs_error"])
        metrics = [
            ("observed", f"{observed:.12g}"),
            ("expected", f"{expected:.12g}"),
            ("abs error", f"{abs_error:.3g}"),
        ]
        x = card_left + 160
        y = top + 104
        for label, value in metrics:
            draw.text((x, y), label, font=FONT_TINY, fill=rgb(TOKENS["muted"]))
            draw.text((x, y + 26), value, font=FONT_LABEL_BOLD, fill=rgb(TOKENS["ink"]))
            x += 310
    draw.text((130, 800), "These are smoke tests, not full instrument validation. They guard against two basic numerical mistakes in the layer solver.", font=FONT_SMALL, fill=rgb(TOKENS["muted"]))
    return save_chart(img, "06_physics_validation.png")


def metric(summary: pd.DataFrame, scenario: str, band: str, shell: str, column: str) -> float:
    row = summary[(summary["scenario"] == scenario) & (summary["band"] == band) & (summary["shell_mode"] == shell)]
    if row.empty:
        return float("nan")
    return float(row[column].iloc[0])


def html_img(path: Path, alt: str) -> str:
    rel = path.relative_to(PACK_DIR).as_posix()
    return f'<img src="{html.escape(rel)}" alt="{html.escape(alt)}" loading="lazy">'


def material_table(materials: pd.DataFrame) -> str:
    cols = [
        "label",
        "eps_real",
        "attenuation_db_km_hf_min",
        "attenuation_db_km_hf_max",
        "source_status",
    ]
    rows = []
    for _, row in materials[materials["key"] != "liquid_ocean"].iterrows():
        rows.append(
            "<tr>"
            f"<td>{html.escape(str(row['label']))}</td>"
            f"<td>{float(row['eps_real']):.2g}</td>"
            f"<td>{float(row['attenuation_db_km_hf_min']):.1f}</td>"
            f"<td>{float(row['attenuation_db_km_hf_max']):.1f}</td>"
            f"<td>{html.escape(str(row['source_status']))}</td>"
            "</tr>"
        )
    return (
        "<table><thead><tr>"
        "<th>Material</th><th>epsilon real</th><th>HF loss min</th><th>HF loss max</th><th>Status</th>"
        "</tr></thead><tbody>"
        + "".join(rows)
        + "</tbody></table>"
    )


def build_html_report(summary: pd.DataFrame, materials: pd.DataFrame, chart_paths: dict[str, Path]) -> Path:
    clean_margin = metric(summary, "clean_ice_control", "HF_9MHz_full_depth", "workbook_mid_shell", "median_ocean_snr_margin_db")
    stacked_risk = metric(summary, "stacked_dirty_layers", "HF_9MHz_full_depth", "workbook_mid_shell", "deep_false_risk_pct")
    complex_weak = metric(summary, "complex_paper_calibrated", "HF_9MHz_full_depth", "workbook_mid_shell", "weak_no_deep_detection_pct")
    rough_clutter = metric(summary, "rough_surface_clutter", "VHF_60MHz_shallow", "workbook_mid_shell", "surface_clutter_pct")
    complex_clutter = metric(summary, "complex_with_clutter", "VHF_60MHz_shallow", "workbook_mid_shell", "surface_clutter_pct")
    material_count = len(materials)

    css = """
    :root {
      --surface: #FCFCFD;
      --panel: #FFFFFF;
      --ink: #1F2430;
      --muted: #6F768A;
      --grid: #E6E8F0;
      --blue: #5477C4;
      --orange: #CC6F47;
      --olive: #71B436;
      --gold: #B8A037;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--surface);
      color: var(--ink);
      font-family: "Segoe UI", Arial, sans-serif;
      line-height: 1.55;
    }
    main {
      max-width: 1120px;
      margin: 0 auto;
      padding: 48px 24px 72px;
    }
    header { margin-bottom: 32px; }
    h1 { font-size: clamp(2rem, 4vw, 3.5rem); line-height: 1.05; margin: 0 0 16px; letter-spacing: 0; }
    h2 { font-size: 1.55rem; line-height: 1.2; margin: 44px 0 14px; letter-spacing: 0; }
    h3 { font-size: 1.1rem; margin: 24px 0 8px; }
    p { margin: 0 0 14px; }
    a { color: var(--blue); }
    .lede { font-size: 1.15rem; max-width: 850px; color: #323849; }
    .summary {
      border-left: 5px solid var(--blue);
      padding: 18px 22px;
      background: #F4F7FE;
      margin: 24px 0;
    }
    .metrics {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 14px;
      margin: 24px 0 8px;
    }
    .metric {
      background: var(--panel);
      border: 1px solid var(--grid);
      border-radius: 8px;
      padding: 16px;
    }
    .metric strong { display: block; font-size: 1.7rem; line-height: 1.05; margin-bottom: 8px; }
    .metric span { color: var(--muted); font-size: 0.92rem; }
    figure {
      margin: 20px 0 30px;
      padding: 0;
    }
    figure img {
      width: 100%;
      height: auto;
      border: 1px solid var(--grid);
      background: var(--panel);
      border-radius: 8px;
    }
    figcaption { color: var(--muted); font-size: 0.92rem; margin-top: 8px; }
    .note {
      background: #FFF7E8;
      border-left: 5px solid var(--gold);
      padding: 16px 18px;
      margin: 20px 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 18px 0 30px;
      font-size: 0.94rem;
      background: var(--panel);
    }
    th, td {
      border-bottom: 1px solid var(--grid);
      padding: 10px 12px;
      vertical-align: top;
      text-align: left;
    }
    th { background: #F4F5F7; }
    ul, ol { padding-left: 1.35rem; }
    li { margin-bottom: 8px; }
    .source-list li { overflow-wrap: anywhere; }
    @media (max-width: 800px) {
      main { padding: 28px 16px 48px; }
      .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 520px) {
      .metrics { grid-template-columns: 1fr; }
    }
    """

    body = f"""
    <main>
      <header>
        <h1>Europa Dirty-Ice Radar Simulation v2</h1>
        <p class="lede">A paper-calibrated sensitivity simulation for testing when Europa radar-bright layers or clutter could mimic, compete with, or hide the echoes used to interpret Europa's ice shell.</p>
      </header>

      <section>
        <h2>Technical Summary</h2>
        <div class="summary">
          <p><strong>Main result:</strong> v2 now separates three radar interpretation problems: attenuation can weaken the true deep return, internal dirty/briny layers can create deep false-boundary risk, and VHF off-nadir clutter can confuse shallow-window returns. This is a sensitivity simulation, not a claim about Europa's actual subsurface.</p>
          <p>The clean-ice HF control remains easy to interpret in the workbook-depth shell, with a median true-ocean SNR margin of <strong>{clean_margin:.1f} dB</strong>. In contrast, the stacked dirty-layer scenario reaches <strong>{stacked_risk:.0f}% deep false-boundary risk</strong>, the complex dirty-ice scenario is dominated by <strong>{complex_weak:.1f}% weak or no deep detection</strong>, and the rough-surface clutter stress test produces <strong>{rough_clutter:.1f}% shallow-window clutter ambiguity</strong> in VHF.</p>
        </div>
        <div class="metrics">
          <div class="metric"><strong>{stacked_risk:.0f}%</strong><span>deep false-boundary risk in stacked dirty layers</span></div>
          <div class="metric"><strong>{complex_weak:.1f}%</strong><span>weak/no deep detection in complex dirty ice</span></div>
          <div class="metric"><strong>{rough_clutter:.1f}%</strong><span>VHF shallow clutter ambiguity in rough terrain</span></div>
          <div class="metric"><strong>{clean_margin:.1f} dB</strong><span>clean-control median ocean SNR margin</span></div>
        </div>
      </section>

      <section>
        <h2>Dirty-Ice Outcomes Split Into Clear, False-Risk, And Weak Cases</h2>
        <p>The headline comparison uses the workbook-depth shell and HF 9 MHz full-depth mode because that is the clearest stress test for bottom-echo interpretation. Clean ice, salt layers, near-surface brine, and warm impure ice can still preserve a clear ocean interpretation under these settings. The stacked dirty-layer case is different: the internal reflector becomes the stronger deep return. The complex case mostly weakens the deep interpretation instead of replacing it with a strong false layer.</p>
        <figure>{html_img(chart_paths["outcomes"], "Stacked horizontal bars showing clear ocean, deep false-risk, and weak/no deep detection shares by scenario.")}
          <figcaption>Percent of along-track points by interpretation class. Detection threshold is 0 dB SNR margin; deep false-risk uses the v2 3 dB ambiguity rule.</figcaption>
        </figure>
      </section>

      <section>
        <h2>The False-Reflector Failure Mode Is Visible Along Track</h2>
        <p>The stacked dirty-layer example shows why a single bright deep return is not enough to prove that the deepest interface has been identified. The orange internal return remains above the true ocean return across the track, so a simplified strongest-echo interpretation would infer the wrong boundary depth.</p>
        <figure>{html_img(chart_paths["track"], "Line chart comparing true ocean and internal false reflector SNR margins along track.")}
          <figcaption>Along-track SNR margin for the workbook-depth HF run. The shaded region marks where the internal false reflector is stronger and detectable.</figcaption>
        </figure>
      </section>

      <section>
        <h2>REASON Band Choice And Shell Thickness Matter Before Dirty Ice Is Added</h2>
        <p>The clean-control comparison keeps the material model simple and changes only the shell mode and radar band. It shows why HF 9 MHz is the main deep sounding stress test, while the VHF shallow mode should not be treated as a failed ocean detector when the ocean is outside its shallow depth window.</p>
        <figure>{html_img(chart_paths["band_shell"], "Grouped bars showing median ocean SNR margin by shell mode and radar band.")}
          <figcaption>Clean ice only. Values are median true-ocean SNR margins in dB; n/a marks depth-window cases where a deep margin is not defined.</figcaption>
        </figure>
      </section>

      <section>
        <h2>VHF Clutter Is Now A Separate Stress Test</h2>
        <p>Clutter is not counted as deep false-ocean risk. In v2 it is a separate shallow-window class that represents off-nadir surface echoes arriving at similar delay to shallow nadir targets. The rough-surface clutter case reaches {rough_clutter:.1f}% shallow-window clutter ambiguity, and the complex-plus-clutter case reaches {complex_clutter:.1f}%, while the complex dirty-ice case without clutter is mostly internal-feature interpretation rather than surface clutter.</p>
        <figure>{html_img(chart_paths["clutter"], "Stacked bars showing VHF shallow clutter, internal-feature, outside-window, and weak/no detection shares.")}
          <figcaption>Workbook-depth, VHF 60 MHz shallow mode. REASON's VHF interferometry is designed to help separate cross-track clutter; this simulation only flags the ambiguity.</figcaption>
        </figure>
      </section>

      <section>
        <h2>The Material Library Makes The Simulation More Audit-Friendly</h2>
        <p>v2 separates mechanisms that were too blurred in the first fake model: dielectric contrast controls reflection strength, attenuation controls how much signal survives through the ice, and clutter is tracked as a separate VHF shallow-window ambiguity. Brine-filled and dirty mixed ice have both stronger dielectric contrast and higher loss brackets, which is why they can create bright internal returns while also hiding deeper returns.</p>
        <figure>{html_img(chart_paths["materials"], "Material library chart showing epsilon and HF attenuation brackets.")}
          <figcaption>Material endmembers and brackets pulled from paper-anchored REASON values plus sensitivity ranges where lab constraints remain uncertain.</figcaption>
        </figure>
        {material_table(materials)}
      </section>

      <section>
        <h2>Attenuation Sensitivity Shows Where The Claim Is Fragile</h2>
        <p>The brine-like epsilon grid is useful because it makes the model's dependence on thickness and loss visible. When future paper values change the attenuation range, this grid is the first place to update before changing the conclusion.</p>
        <figure>{html_img(chart_paths["sensitivity"], "Heatmap showing deep false-boundary risk across dirty layer thickness and attenuation.")}
          <figcaption>Heatmap cells show deep false-boundary risk percentage for epsilon = 9.0 in the HF workbook-depth setup.</figcaption>
        </figure>
      </section>

      <section>
        <h2>The Thin-Layer Solver Passes Basic Physics Smoke Tests</h2>
        <p>The validation checks do not make the model mission-grade, but they do reduce two simple numerical risks: the solver reproduces a single-interface Fresnel amplitude, and it returns zero reflection when there is no dielectric contrast.</p>
        <figure>{html_img(chart_paths["validation"], "Validation cards showing two passing physics checks.")}
          <figcaption>Basic solver checks generated from the v2 run.</figcaption>
        </figure>
      </section>

      <section>
        <h2>Scope, Data, And Metric Definitions</h2>
        <p><strong>Scope:</strong> Synthetic along-track radar sensitivity model, not real Europa subsurface data and not a NASA mission-grade processor. The model tests whether plausible dirty-ice structures can confuse a bottom/ocean interpretation and whether rough-surface clutter can confuse shallow VHF returns.</p>
        <p><strong>Primary cohort:</strong> Workbook-depth shell, HF 9 MHz full-depth radar mode, 241 along-track points per scenario. Supporting views compare REASON shell modes and VHF 60 MHz behavior.</p>
        <p><strong>Clear ocean percent:</strong> share of points where the true ocean boundary is the clear strongest deep interpretation. <strong>Deep false-boundary risk:</strong> share classified as ambiguous, false stronger, or hidden-false-visible under the v2 3 dB ambiguity window. <strong>Weak/no deep detection:</strong> share where no clear deep ocean interpretation is available. <strong>Surface clutter percent:</strong> share of VHF shallow points where off-nadir surface clutter is detectable enough to confuse the shallow-window interpretation.</p>
      </section>

      <section>
        <h2>Methodology And Validation</h2>
        <p>v2 uses REASON-aligned 9 MHz and 60 MHz modes, separate shell-depth modes, a paper-anchored dielectric material library, depth-varying attenuation, a normal-incidence transfer-matrix solver for unresolved thin-layer packets, and a VHF off-nadir clutter stress-test proxy. Echo interpretation is then summarized with a 0 dB SNR detection threshold and a 3 dB ambiguity window.</p>
        <p>Compared with the original fake simulation, v2 is better because major knobs are now traceable: radar band, depth window, material epsilon, attenuation bracket, scenario layer count, clutter mechanism, and solver sanity checks. It is still simplified because it does not model full spacecraft geometry, antenna pattern, interferometric phase processing, Europa-specific thermal history, or real REASON processing.</p>
      </section>

      <section>
        <h2>Limitations, Uncertainty, And Robustness</h2>
        <div class="note">
          <p><strong>Do not overclaim this result.</strong> The current evidence supports "dirty ice can plausibly create ambiguity under these assumptions." It does not prove that Europa has these layers, that REASON will see these exact patterns, or that an ocean echo would be misread in final mission analysis.</p>
        </div>
        <ul>
          <li>Attenuation in warm or impure ice is the biggest uncertainty and can change the depth at which the ocean becomes hidden.</li>
          <li>The thin-layer interference model is a useful first-order upgrade but should eventually be checked against a fuller radar forward model.</li>
          <li>The clutter model is a stress-test proxy. It flags VHF shallow-window ambiguity but does not simulate REASON's antenna pattern or cross-track interferometric phase retrieval.</li>
          <li>False-boundary risk depends on the 3 dB ambiguity rule, the 0 dB detection threshold, and the layer-depth logic used to decide whether a reflector is a deep confuser.</li>
          <li>Laboratory dielectric values for mixed salts, brines, voids, hydrates, and radiolytic products remain incomplete for all Europa-relevant temperatures and radar frequencies.</li>
        </ul>
      </section>

      <section>
        <h2>Recommended Next Steps</h2>
        <ol>
          <li>Add more paper-backed attenuation curves by temperature and impurity type, then rerun the sensitivity grid.</li>
          <li>Separate shallow science reflectors from deep bottom-confusers more explicitly, so bright shallow features do not inflate the ocean-ambiguity claim.</li>
          <li>Upgrade the clutter proxy into a beam-pattern and interferometric-phase model, because REASON is specifically designed to help discriminate cross-track clutter.</li>
          <li>Keep Excel untouched until the Python model stabilizes; then export only the validated scenario summaries and chart-ready tables.</li>
        </ol>
      </section>

      <section>
        <h2>Further Questions</h2>
        <ul>
          <li>Which impurity mixtures are most plausible at Europa temperatures for REASON frequencies?</li>
          <li>How sensitive is the false-risk conclusion to layer roughness and non-normal incidence?</li>
          <li>How much of the VHF shallow clutter stress test would REASON's cross-track interferometry reject in practice?</li>
          <li>Should the model promote temperature-dependent conductivity from a sensitivity bracket to an explicit thermal profile?</li>
          <li>What exact threshold should be used for a student project: 0 dB detection, 3 dB ambiguity, or a more conservative margin?</li>
        </ul>
      </section>

      <section>
        <h2>Source Anchors</h2>
        <ul class="source-list">
          <li><a href="https://science.nasa.gov/mission/europa-clipper/spacecraft-instruments/">NASA Europa Clipper spacecraft instruments</a> - mission instrument context for REASON and the Europa Clipper payload.</li>
          <li><a href="https://link.springer.com/article/10.1007/s11214-024-01072-3">Blankenship et al. 2024, REASON</a> - dual-frequency REASON design, 9 MHz and 60 MHz modes, shell-mode framing, detection threshold, and paper-anchored dielectric assumptions used in v2.</li>
          <li><a href="https://arxiv.org/abs/2107.03497">Lalich et al. 2021</a> - Mars radar analog showing how bright basal-like reflections can arise from interference between layer boundaries without requiring liquid water.</li>
          <li><a href="https://doi.org/10.1109/TGRS.2017.2721433">Castelletti et al. 2017</a> and <a href="https://doi.org/10.1017/aog.2020.20">Scanlan et al. 2020</a> - supporting cross-track clutter discrimination context cited by the REASON paper.</li>
          <li><a href="https://doi.org/10.1002/2014RG000463">Pettinelli et al. 2015 review</a> - supporting context for dielectric contrasts in icy planetary materials and analog endmembers.</li>
        </ul>
      </section>
    </main>
    """

    html_text = "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>Europa Dirty-Ice Radar Simulation v2</title><style>" + css + "</style></head><body>" + body + "</body></html>"
    PACK_DIR.mkdir(parents=True, exist_ok=True)
    path = PACK_DIR / "europa_dirty_ice_v2_technical_report.html"
    path.write_text(html_text, encoding="utf-8")
    return path


def build_methods_brief(summary: pd.DataFrame, materials: pd.DataFrame, chart_paths: dict[str, Path]) -> Path:
    clean_margin = metric(summary, "clean_ice_control", "HF_9MHz_full_depth", "workbook_mid_shell", "median_ocean_snr_margin_db")
    stacked_risk = metric(summary, "stacked_dirty_layers", "HF_9MHz_full_depth", "workbook_mid_shell", "deep_false_risk_pct")
    complex_weak = metric(summary, "complex_paper_calibrated", "HF_9MHz_full_depth", "workbook_mid_shell", "weak_no_deep_detection_pct")
    lens_clear = metric(summary, "briny_mushy_lens", "HF_9MHz_full_depth", "workbook_mid_shell", "clear_ocean_pct")
    rough_clutter = metric(summary, "rough_surface_clutter", "VHF_60MHz_shallow", "workbook_mid_shell", "surface_clutter_pct")
    complex_clutter = metric(summary, "complex_with_clutter", "VHF_60MHz_shallow", "workbook_mid_shell", "surface_clutter_pct")

    lines = [
        "# Europa Dirty-Ice Radar Simulation v2 - Methods And Claims Brief",
        "",
        "## What v2 can claim",
        "",
        "- This is a paper-calibrated sensitivity simulation, not real Europa radar data and not a NASA mission processor.",
        f"- In the workbook-depth, HF 9 MHz run, clean ice has a median true-ocean SNR margin of {clean_margin:.1f} dB.",
        f"- The stacked dirty-layer scenario reaches {stacked_risk:.0f}% deep false-boundary risk, which means the internal reflector competes with or exceeds the true ocean return under the v2 rule set.",
        f"- The complex dirty-ice scenario reaches {complex_weak:.1f}% weak/no deep detection, which supports the separate failure mode that dirty or warm ice can hide the deep return.",
        f"- The briny/mushy lens case preserves a clear ocean interpretation at {lens_clear:.1f}% of workbook-depth HF points in this version, so not every dirty or briny scenario creates a false bottom.",
        f"- The rough-surface clutter scenario reaches {rough_clutter:.1f}% VHF shallow-window clutter ambiguity, and the complex-plus-clutter scenario reaches {complex_clutter:.1f}%. This is separate from deep false-ocean risk.",
        "",
        "## What changed from the original fake model",
        "",
        "- REASON-aligned radar bands: 9 MHz and 60 MHz.",
        "- Separate shell modes for thin 3 km, workbook-depth, and thick 30 km cases.",
        "- Paper-anchored material library with epsilon and attenuation brackets.",
        "- Normal-incidence transfer-matrix solver for unresolved thin-layer packets.",
        "- Explicit interpretation classes: clear ocean, deep false-risk, weak/no deep detection, internal feature only, surface clutter in the shallow window, and outside depth window.",
        "- VHF off-nadir clutter stress test based on the REASON paper's clutter/interferometry discussion.",
        "- Basic physics checks for single-interface reflection and no-contrast zero reflection.",
        "",
        "## Main problems still visible",
        "",
        "- Attenuation remains the largest scientific uncertainty; warm, salty, or otherwise impure ice can change echo strength more than any single clean dielectric contrast.",
        "- The false-reflector conclusion depends on the 3 dB ambiguity window and the 0 dB detection threshold.",
        "- The clutter model is a stress-test proxy; it does not include spacecraft geometry, VHF antenna patterns, interferometric phase retrieval, real radar processing, or a full thermal evolution model.",
        "- Mixed dirty-ice dielectric properties are still bracketed from paper-supported families rather than fully measured Europa-specific materials.",
        "",
        "## Best next improvement",
        "",
        "Upgrade the clutter proxy into a beam-pattern/interferometric-phase model, then add temperature-dependent attenuation curves by impurity family. Only move the stabilized outputs into Excel after those checks.",
        "",
        "## Report artifacts",
        "",
    ]
    for key, path in chart_paths.items():
        lines.append(f"- {key}: {path.relative_to(PACK_DIR).as_posix()}")
    lines.extend(
        [
            "",
            "## Source anchors",
            "",
            "- NASA Europa Clipper instruments: https://science.nasa.gov/mission/europa-clipper/spacecraft-instruments/",
            "- Blankenship et al. 2024 REASON: https://link.springer.com/article/10.1007/s11214-024-01072-3",
            "- Lalich et al. 2021 radar interference analog: https://arxiv.org/abs/2107.03497",
            "- Castelletti et al. 2017 cross-track clutter detection: https://doi.org/10.1109/TGRS.2017.2721433",
            "- Scanlan et al. 2020 cross-track bed clutter discrimination: https://doi.org/10.1017/aog.2020.20",
            "- Pettinelli et al. 2015 dielectric review: https://doi.org/10.1002/2014RG000463",
            "",
            f"Material endmembers in v2: {len(materials)}.",
        ]
    )
    path = PACK_DIR / "methods_and_claims_brief.md"
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def build_chart_map(chart_paths: dict[str, Path]) -> Path:
    chart_map = [
        {
            "id": "outcomes",
            "file": chart_paths["outcomes"].relative_to(PACK_DIR).as_posix(),
            "section": "Dirty-Ice Outcomes Split Into Clear, False-Risk, And Weak Cases",
            "analytical_question": "How do scenario outcomes differ in the workbook-depth HF stress test?",
            "family": "composition",
            "chart_type": "stacked horizontal bars",
            "fields": ["scenario", "clear_ocean_pct", "deep_false_risk_pct", "weak_no_deep_detection_pct"],
            "supported_claim": "Dirty-ice scenarios separate into clear, false-risk, and weak/no deep detection failure modes.",
            "palette_policy": "relaxed multi-category with olive, orange, and neutral marks",
        },
        {
            "id": "track",
            "file": chart_paths["track"].relative_to(PACK_DIR).as_posix(),
            "section": "The False-Reflector Failure Mode Is Visible Along Track",
            "analytical_question": "Does the stacked dirty-layer false reflector exceed the true ocean echo along track?",
            "family": "trend",
            "chart_type": "highlighted multi-series line",
            "fields": ["x_km", "ocean_snr_margin_db", "false_snr_margin_db"],
            "supported_claim": "The internal false reflector is detectable and stronger than the ocean return in the stacked dirty-layer example.",
            "palette_policy": "hard two-root cap with blue for ocean and orange for false reflector",
        },
        {
            "id": "band_shell",
            "file": chart_paths["band_shell"].relative_to(PACK_DIR).as_posix(),
            "section": "REASON Band Choice And Shell Thickness Matter Before Dirty Ice Is Added",
            "analytical_question": "How do clean-ice ocean margins change by radar band and shell mode?",
            "family": "comparison",
            "chart_type": "grouped bars",
            "fields": ["shell_mode", "band", "median_ocean_snr_margin_db"],
            "supported_claim": "HF is the cleaner deep-ocean stress test, while VHF shallow mode should not be treated as a deep-ocean failure when out of window.",
            "palette_policy": "relaxed multi-category with explicit band colors",
        },
        {
            "id": "clutter",
            "file": chart_paths["clutter"].relative_to(PACK_DIR).as_posix(),
            "section": "VHF Clutter Is Now A Separate Stress Test",
            "analytical_question": "How much shallow-window ambiguity comes from off-nadir surface clutter rather than dirty internal layers?",
            "family": "composition",
            "chart_type": "stacked horizontal bars",
            "fields": ["scenario", "surface_clutter_pct", "internal_feature_only_pct", "outside_band_depth_window_pct", "weak_no_deep_detection_pct"],
            "supported_claim": "The clutter stress test creates VHF shallow ambiguity without being counted as deep false-ocean risk.",
            "palette_policy": "relaxed multi-category with pink clutter, gold internal-feature, and neutral depth-window states",
        },
        {
            "id": "materials",
            "file": chart_paths["materials"].relative_to(PACK_DIR).as_posix(),
            "section": "The Material Library Makes The Simulation More Audit-Friendly",
            "analytical_question": "What material properties drive reflection and loss in v2?",
            "family": "comparison and uncertainty",
            "chart_type": "paired horizontal dot and interval",
            "fields": ["label", "eps_real", "attenuation_db_km_hf_min", "attenuation_db_km_hf_max"],
            "supported_claim": "v2 separates dielectric contrast from attenuation, making paper-backed assumptions easier to audit.",
            "palette_policy": "relaxed multi-category for material identities",
        },
        {
            "id": "sensitivity",
            "file": chart_paths["sensitivity"].relative_to(PACK_DIR).as_posix(),
            "section": "Attenuation Sensitivity Shows Where The Claim Is Fragile",
            "analytical_question": "Where does brine-like epsilon create false-boundary risk across thickness and attenuation?",
            "family": "matrix",
            "chart_type": "heatmap",
            "fields": ["dirty_layer_thickness_m", "dirty_layer_attenuation_db_km_hf", "deep_false_risk_pct"],
            "supported_claim": "The false-risk claim is sensitive to dirty-layer thickness and attenuation assumptions.",
            "palette_policy": "single-root orange sequential scale",
        },
        {
            "id": "validation",
            "file": chart_paths["validation"].relative_to(PACK_DIR).as_posix(),
            "section": "The Thin-Layer Solver Passes Basic Physics Smoke Tests",
            "analytical_question": "Did the v2 solver pass simple known-answer checks?",
            "family": "scorecards",
            "chart_type": "validation cards",
            "fields": ["check", "observed", "expected", "abs_error", "passed"],
            "supported_claim": "The solver passes two basic physics smoke tests before interpretation.",
            "palette_policy": "single-root olive pass state",
        },
    ]
    path = PACK_DIR / "chart_map.json"
    path.write_text(json.dumps(chart_map, indent=2), encoding="utf-8")
    return path


def build_readme(report_path: Path, brief_path: Path, chart_map_path: Path) -> Path:
    lines = [
        "# Europa Dirty-Ice v2 Presentation Pack",
        "",
        "Open the technical report first:",
        f"- {report_path.name}",
        "",
        "Supporting files:",
        f"- {brief_path.name}",
        f"- {chart_map_path.name}",
        "- charts/",
        "",
        "This pack was generated from the v2 CSV outputs in the parent folder. It does not edit the Excel workbook.",
    ]
    path = PACK_DIR / "README.md"
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def main() -> None:
    PACK_DIR.mkdir(parents=True, exist_ok=True)
    CHART_DIR.mkdir(parents=True, exist_ok=True)

    summary = pd.read_csv(SUMMARY_CSV)
    results = pd.read_csv(RESULTS_CSV)
    materials = pd.read_csv(MATERIALS_CSV)
    sens = pd.read_csv(SENSITIVITY_CSV)
    validation = pd.read_csv(VALIDATION_CSV)

    chart_paths = {
        "outcomes": chart_outcome_mix(summary),
        "track": chart_false_layer_track(results),
        "band_shell": chart_band_shell_margin(summary),
        "clutter": chart_vhf_clutter(summary),
        "materials": chart_material_library(materials),
        "sensitivity": chart_attenuation_sensitivity(sens),
        "validation": chart_validation(validation),
    }
    report_path = build_html_report(summary, materials, chart_paths)
    brief_path = build_methods_brief(summary, materials, chart_paths)
    chart_map_path = build_chart_map(chart_paths)
    readme_path = build_readme(report_path, brief_path, chart_map_path)

    print("Presentation pack created")
    print(f"Report: {report_path}")
    print(f"Brief: {brief_path}")
    print(f"Chart map: {chart_map_path}")
    print(f"Readme: {readme_path}")
    for name, path in chart_paths.items():
        print(f"Chart {name}: {path}")


if __name__ == "__main__":
    main()
