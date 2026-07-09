"""Recreate trace-decimation PRF blur with NASA/REASON-like parameters.

This is not returned Europa Clipper radar data. Europa Clipper has not yet
returned Europa radar sounding data, so this script uses public REASON-like
mission parameters: HF 9 MHz, VHF 60 MHz, and a 0-30 km sounding goal.

The recreated failure mode is:
  remove traces -> lower effective PRF -> lose Doppler margin -> folded
  off-nadir surface clutter can smear into a false subsurface-looking layer.

Outputs:
  outputs/nasa_trace_decimation_prf_blur.svg
  outputs/nasa_trace_decimation_prf_blur.csv
"""

from __future__ import annotations

import csv
import html
import math
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_SVG = ROOT / "outputs" / "nasa_trace_decimation_prf_blur.svg"
OUTPUT_CSV = ROOT / "outputs" / "nasa_trace_decimation_prf_blur.csv"

C_M_S = 299_792_458.0
ALTITUDE_KM = 25.0
SPEED_KM_S = 4.6
ICE_INDEX = 1.78
PULSE_US = 200.0
GUARD_US = 5.0
DEAD_TIME_US = 10.0
SAFETY_FACTOR = 1.25


@dataclass(frozen=True)
class Band:
    name: str
    frequency_mhz: float

    @property
    def wavelength_m(self) -> float:
        return C_M_S / (self.frequency_mhz * 1_000_000.0)


@dataclass(frozen=True)
class Case:
    title: str
    band: Band
    depth_label: str
    depths_km: tuple[float, ...]
    keep_every_values: tuple[int, ...]


BANDS = {
    "HF": Band("HF", 9.0),
    "VHF": Band("VHF", 60.0),
}

CASES = (
    Case("HF selected target", BANDS["HF"], "6 km", (6.0,), (1, 2, 3, 4, 5, 6)),
    Case("HF full-depth sweep", BANDS["HF"], "0-30 km", tuple(i * 0.25 for i in range(121)), (1, 2, 3, 4)),
    Case("VHF shallow edge", BANDS["VHF"], "2.25 km", (2.25,), (1, 2, 3, 4)),
    Case("VHF deep target", BANDS["VHF"], "6 km", (6.0,), (1, 2, 3, 4)),
)


def esc(value: object) -> str:
    return html.escape(str(value), quote=True)


def same_delay_sin_theta(depth_km: float) -> float:
    altitude_m = ALTITUDE_KM * 1000.0
    depth_m = depth_km * 1000.0
    one_way_path_m = altitude_m + ICE_INDEX * depth_m
    if one_way_path_m <= 0.0:
        return 0.0
    offset_m = math.sqrt(max(one_way_path_m * one_way_path_m - altitude_m * altitude_m, 0.0))
    return max(0.0, min(1.0, offset_m / one_way_path_m))


def doppler_edge_hz(band: Band, depth_km: float) -> float:
    return 2.0 * SPEED_KM_S * 1000.0 * same_delay_sin_theta(depth_km) / band.wavelength_m


def timing_ceiling_hz(depth_km: float) -> float:
    one_way_path_m = ALTITUDE_KM * 1000.0 + ICE_INDEX * depth_km * 1000.0
    two_way_us = 2.0 * one_way_path_m / C_M_S * 1_000_000.0
    listen_window_us = PULSE_US + GUARD_US + DEAD_TIME_US + two_way_us
    return 1_000_000.0 / listen_window_us


def alias_frequency(frequency_hz: float, prf_hz: float) -> float:
    return ((frequency_hz + prf_hz / 2.0) % prf_hz) - prf_hz / 2.0


def case_window(case: Case) -> dict[str, float | bool]:
    max_doppler = max(doppler_edge_hz(case.band, depth_km) for depth_km in case.depths_km)
    max_depth = max(case.depths_km)
    min_prf_hz = 2.0 * max_doppler * SAFETY_FACTOR
    raw_alias_threshold_hz = 2.0 * max_doppler
    max_prf_hz = min(timing_ceiling_hz(depth_km) for depth_km in case.depths_km)
    return {
        "doppler_edge_hz": max_doppler,
        "raw_alias_threshold_hz": raw_alias_threshold_hz,
        "min_safe_prf_hz": min_prf_hz,
        "max_prf_hz": max_prf_hz,
        "max_depth_km": max_depth,
        "usable": min_prf_hz <= max_prf_hz,
    }


def status_for(effective_prf_hz: float, min_safe_prf_hz: float, raw_alias_threshold_hz: float) -> str:
    if effective_prf_hz >= min_safe_prf_hz:
        return "clean"
    if effective_prf_hz >= raw_alias_threshold_hz:
        return "margin gone"
    return "folding blur"


def status_color(status: str) -> str:
    if status == "clean":
        return "#1f6b70"
    if status == "margin gone":
        return "#a45f3f"
    return "#9b3d3f"


def fmt_hz(value: float | None) -> str:
    if value is None:
        return "none"
    if value >= 1000:
        return f"{value:,.0f} Hz"
    return f"{value:.0f} Hz"


def ordinal(value: int) -> str:
    if 10 <= value % 100 <= 20:
      suffix = "th"
    else:
      suffix = {1: "st", 2: "nd", 3: "rd"}.get(value % 10, "th")
    return f"{value}{suffix}"


def rows_for_case(case: Case) -> list[dict[str, object]]:
    window = case_window(case)
    base_prf_hz = float(window["max_prf_hz"])
    doppler_hz = float(window["doppler_edge_hz"])
    rows = []
    for keep_every in case.keep_every_values:
        effective_prf_hz = base_prf_hz / keep_every
        status = status_for(
            effective_prf_hz,
            float(window["min_safe_prf_hz"]),
            float(window["raw_alias_threshold_hz"]),
        )
        alias_hz = alias_frequency(doppler_hz, effective_prf_hz)
        rows.append(
            {
                "case": case.title,
                "band": case.band.name,
                "frequency_mhz": case.band.frequency_mhz,
                "depth_label": case.depth_label,
                "base_prf_hz": base_prf_hz,
                "min_safe_prf_hz": window["min_safe_prf_hz"],
                "raw_alias_threshold_hz": window["raw_alias_threshold_hz"],
                "keep_every": keep_every,
                "removed_percent": 100.0 * (1.0 - 1.0 / keep_every),
                "effective_prf_hz": effective_prf_hz,
                "along_track_spacing_m": SPEED_KM_S * 1000.0 / effective_prf_hz,
                "alias_landing_hz": alias_hz,
                "zero_fold_gap_hz": abs(alias_hz),
                "status": status,
                "window_usable_before_removal": window["usable"],
            }
        )
    return rows


def write_csv(path: Path, rows: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "case",
        "band",
        "frequency_mhz",
        "depth_label",
        "base_prf_hz",
        "min_safe_prf_hz",
        "raw_alias_threshold_hz",
        "keep_every",
        "removed_percent",
        "effective_prf_hz",
        "along_track_spacing_m",
        "alias_landing_hz",
        "zero_fold_gap_hz",
        "status",
        "window_usable_before_removal",
    ]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def svg_text(x: float, y: float, text: str, size: int = 14, weight: int = 400, fill: str = "#1f1d19") -> str:
    return (
        f'<text x="{x:.1f}" y="{y:.1f}" fill="{fill}" font-size="{size}" '
        f'font-weight="{weight}" font-family="Segoe UI, Arial, sans-serif">{esc(text)}</text>'
    )


def svg_line(x1: float, y1: float, x2: float, y2: float, stroke: str, width: float = 1.0, dash: str | None = None) -> str:
    dash_attr = f' stroke-dasharray="{dash}"' if dash else ""
    return f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{stroke}" stroke-width="{width}"{dash_attr}/>'


def svg_case(case: Case, x0: int, y0: int, w: int, h: int) -> str:
    window = case_window(case)
    rows = rows_for_case(case)
    parts = [
        f'<rect x="{x0}" y="{y0}" width="{w}" height="{h}" rx="8" fill="#fbfaf6" stroke="#b8aa95"/>',
        svg_text(x0 + 22, y0 + 32, case.title, 19, 800),
        svg_text(x0 + 22, y0 + 57, f"{case.band.name} {case.band.frequency_mhz:g} MHz, depth {case.depth_label}", 14, 400, "#6f6a60"),
    ]
    parts.append(
        svg_text(
            x0 + 22,
            y0 + 79,
            f"safe floor {fmt_hz(float(window['min_safe_prf_hz']))} | raw fold floor {fmt_hz(float(window['raw_alias_threshold_hz']))} | timing max {fmt_hz(float(window['max_prf_hz']))}",
            13,
            400,
            "#6f6a60",
        )
    )

    cx0, cy0, cx1, cy1 = x0 + 76, y0 + 116, x0 + w - 34, y0 + 316
    parts.append(f'<rect x="{cx0}" y="{cy0}" width="{cx1 - cx0}" height="{cy1 - cy0}" fill="#fffefa" stroke="#d7ccbb"/>')
    y_max = max(
        float(window["max_prf_hz"]),
        float(window["min_safe_prf_hz"]),
        max(float(row["effective_prf_hz"]) for row in rows),
    ) * 1.18

    def sy(value: float) -> float:
        return cy1 - value / y_max * (cy1 - cy0)

    for frac in (0.25, 0.5, 0.75, 1.0):
        y = cy1 - frac * (cy1 - cy0)
        parts.append(svg_line(cx0, y, cx1, y, "#e7ddcc", 1))

    safe_y = sy(float(window["min_safe_prf_hz"]))
    raw_y = sy(float(window["raw_alias_threshold_hz"]))
    parts.append(svg_line(cx0, safe_y, cx1, safe_y, "#315f88", 2))
    parts.append(svg_line(cx0, raw_y, cx1, raw_y, "#a45f3f", 2, "7 5"))
    parts.append(svg_text(cx1 - 112, safe_y - 8, "safe floor", 12, 800, "#315f88"))
    parts.append(svg_text(cx1 - 138, raw_y + 16, "raw fold floor", 12, 800, "#a45f3f"))

    slot = (cx1 - cx0) / max(len(rows), 1)
    bar_w = min(54, slot * 0.52)
    for index, row in enumerate(rows):
        center_x = cx0 + slot * (index + 0.5)
        eff = float(row["effective_prf_hz"])
        y_top = sy(eff)
        color = status_color(str(row["status"]))
        parts.append(
            f'<rect x="{center_x - bar_w / 2:.1f}" y="{y_top:.1f}" width="{bar_w:.1f}" height="{cy1 - y_top:.1f}" rx="3" fill="{color}"/>'
        )
        keep_label = "all" if int(row["keep_every"]) == 1 else f"{row['keep_every']}x"
        parts.append(svg_text(center_x - 12, cy1 + 22, keep_label, 12, 400, "#6f6a60"))

    parts.append(svg_text(x0 + 21, cy0 + 5, "PRF", 12, 800, "#6f6a60"))
    parts.append(svg_text(cx0, cy1 + 46, "all = keep all traces; 2x = keep every 2nd trace", 12, 400, "#6f6a60"))

    table_y = y0 + 375
    parts.append(svg_text(x0 + 22, table_y, "Trace removal result", 15, 800, "#17494d"))
    table_y += 26
    for row in rows[:4]:
        keep = "all" if int(row["keep_every"]) == 1 else f"every {row['keep_every']}th"
        line_text = (
            f"keep {keep:<9}  {fmt_hz(float(row['effective_prf_hz'])):<9}  "
            f"spacing {float(row['along_track_spacing_m']):.1f} m  {row['status']}"
        )
        parts.append(svg_text(x0 + 22, table_y, line_text, 13, 700, status_color(str(row["status"]))))
        table_y += 21
    if len(rows) > 4:
        row = rows[4]
        parts.append(
            svg_text(
                x0 + 22,
                table_y,
                f"next: keep every {row['keep_every']}th -> {fmt_hz(float(row['effective_prf_hz']))}, {row['status']}",
                13,
                700,
                status_color(str(row["status"])),
            )
        )

    return "\n".join(parts)


def render_svg(path: Path) -> None:
    width, height = 1800, 1420
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}" role="img">',
        '<rect width="1800" height="1420" fill="#f5f1e8"/>',
        svg_text(54, 62, "NASA/REASON-like trace decimation PRF blur recreation", 34, 800),
        svg_text(
            56,
            96,
            "Uses public mission-like parameters, not returned Europa radar data: HF 9 MHz, VHF 60 MHz, 25 km altitude, 4.6 km/s, 0-30 km sounding goal.",
            18,
            400,
            "#6f6a60",
        ),
        svg_text(
            56,
            126,
            "Green bars keep Doppler margin. Copper loses safety margin. Red means Doppler folding blur can create false subsurface-looking clutter.",
            18,
            400,
            "#6f6a60",
        ),
        svg_case(CASES[0], 54, 168, 818, 590),
        svg_case(CASES[1], 928, 168, 818, 590),
        svg_case(CASES[2], 54, 812, 818, 530),
        svg_case(CASES[3], 928, 812, 818, 530),
        "</svg>",
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(parts), encoding="utf-8")


def main() -> None:
    all_rows: list[dict[str, object]] = []
    for case in CASES:
        all_rows.extend(rows_for_case(case))
    write_csv(OUTPUT_CSV, all_rows)
    render_svg(OUTPUT_SVG)
    print(f"Wrote {OUTPUT_SVG}")
    print(f"Wrote {OUTPUT_CSV}")
    for case in CASES:
        rows = rows_for_case(case)
        first_bad = next((row for row in rows if row["status"] != "clean"), None)
        bad_text = "no bad point in tested removals"
        if first_bad:
            keep_every = int(first_bad["keep_every"])
            keep = "all traces" if keep_every == 1 else f"every {ordinal(keep_every)} trace"
            bad_text = f"{fmt_hz(float(first_bad['effective_prf_hz']))}, keep {keep}"
        print(f"{case.title}: blur/risk starts at {bad_text}")


if __name__ == "__main__":
    main()
