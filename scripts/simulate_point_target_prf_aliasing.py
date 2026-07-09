"""Point-target PRF aliasing simulation.

This is the simple simulator suggested in the transcript:

1. Put many point targets on a flat surface.
2. Put one specular point target below the spacecraft at nadir.
3. Give each surface point its delay and Doppler frequency.
4. Sample the slow-time traces at different PRFs.
5. FFT along-track to show where the energy appears in delay-Doppler space.

The purpose is educational. It is intentionally small and flat-earth, so the
PRF folding mechanism is visible without topography, scattering models, or
instrument processing details.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "outputs" / "point_target_prf_aliasing_simulation.png"
DEFAULT_SUMMARY = ROOT / "outputs" / "point_target_prf_aliasing_summary.csv"
DEFAULT_CONFIG = ROOT / "outputs" / "point_target_prf_aliasing_config.json"

C_M_S = 299_792_458.0


@dataclass(frozen=True)
class Target:
    name: str
    depth_km: float
    doppler_hz: float
    amplitude: float
    kind: str


@dataclass(frozen=True)
class Scenario:
    name: str
    prf_hz: float
    note: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--summary-csv", type=Path, default=DEFAULT_SUMMARY)
    parser.add_argument("--config-json", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--altitude-km", type=float, default=25.0)
    parser.add_argument("--speed-km-s", type=float, default=4.6)
    parser.add_argument("--wavelength-m", type=float, default=5.0)
    parser.add_argument("--frequency-mhz", type=float, default=None)
    parser.add_argument("--ice-index", type=float, default=1.78)
    parser.add_argument("--target-depth-km", type=float, default=6.0)
    parser.add_argument("--max-depth-km", type=float, default=10.0)
    parser.add_argument("--surface-points-per-side", type=int, default=80)
    parser.add_argument("--surface-amplitude", type=float, default=0.34)
    parser.add_argument("--subsurface-amplitude", type=float, default=0.55)
    parser.add_argument("--range-sigma-bins", type=float, default=0.75)
    parser.add_argument("--pulse-count", type=int, default=1024)
    parser.add_argument("--depth-bins", type=int, default=420)
    parser.add_argument("--pulse-us", type=float, default=200.0)
    parser.add_argument("--guard-us", type=float, default=5.0)
    parser.add_argument("--dead-time-us", type=float, default=10.0)
    parser.add_argument("--max-usable-prf-hz", type=float, default=3000.0)
    parser.add_argument("--current-prf-hz", type=float, default=None)
    parser.add_argument("--high-prf-hz", type=float, default=6000.0)
    parser.add_argument("--noise", type=float, default=0.006)
    return parser.parse_args()


def wavelength_from_args(args: argparse.Namespace) -> float:
    if args.frequency_mhz is None:
        return args.wavelength_m
    return C_M_S / (args.frequency_mhz * 1_000_000.0)


def alias_frequency(f_hz: float | np.ndarray, prf_hz: float) -> float | np.ndarray:
    values = np.asarray(f_hz)
    aliased = ((values + prf_hz / 2.0) % prf_hz) - prf_hz / 2.0
    if np.isscalar(f_hz):
        return float(aliased)
    return aliased


def same_delay_surface(
    altitude_km: float,
    depth_km: float,
    ice_index: float,
    speed_km_s: float,
    wavelength_m: float,
) -> dict[str, float]:
    h_m = altitude_km * 1000.0
    depth_m = depth_km * 1000.0
    one_way_path_m = h_m + ice_index * depth_m
    offset_m = math.sqrt(max(one_way_path_m * one_way_path_m - h_m * h_m, 0.0))
    sin_theta = offset_m / one_way_path_m if one_way_path_m > 0 else 0.0
    doppler_hz = 2.0 * speed_km_s * 1000.0 * sin_theta / wavelength_m
    return {
        "one_way_path_m": one_way_path_m,
        "surface_offset_km": offset_m / 1000.0,
        "look_angle_deg": math.degrees(math.asin(max(-1.0, min(1.0, sin_theta)))),
        "same_delay_doppler_hz": doppler_hz,
        "alias_start_prf_hz": 2.0 * doppler_hz,
        "zero_overlap_prf_hz": doppler_hz,
    }


def timing_limited_prf(
    altitude_km: float,
    depth_km: float,
    ice_index: float,
    pulse_us: float,
    guard_us: float,
    dead_time_us: float,
    max_usable_prf_hz: float,
) -> dict[str, float]:
    one_way_path_m = altitude_km * 1000.0 + ice_index * depth_km * 1000.0
    two_way_us = 2.0 * one_way_path_m / C_M_S * 1_000_000.0
    listen_window_us = pulse_us + guard_us + dead_time_us + two_way_us
    pulse_limited_prf_hz = 1_000_000.0 / listen_window_us
    return {
        "two_way_target_time_us": two_way_us,
        "listen_window_us": listen_window_us,
        "pulse_limited_prf_hz": pulse_limited_prf_hz,
        "effective_prf_hz": min(max_usable_prf_hz, pulse_limited_prf_hz),
    }


def surface_doppler_for_depth(
    altitude_km: float,
    apparent_depth_km: np.ndarray,
    ice_index: float,
    speed_km_s: float,
    wavelength_m: float,
) -> np.ndarray:
    h_m = altitude_km * 1000.0
    one_way_path_m = h_m + ice_index * apparent_depth_km * 1000.0
    offset_m = np.sqrt(np.maximum(one_way_path_m**2 - h_m**2, 0.0))
    sin_theta = np.divide(offset_m, one_way_path_m, out=np.zeros_like(offset_m), where=one_way_path_m > 0)
    return 2.0 * speed_km_s * 1000.0 * sin_theta / wavelength_m


def make_targets(args: argparse.Namespace, wavelength_m: float) -> list[Target]:
    # Include the target depth exactly, so the overlap test is unambiguous.
    surface_depths = np.linspace(0.25, args.max_depth_km, args.surface_points_per_side)
    surface_depths = np.unique(np.append(surface_depths, args.target_depth_km))
    dopplers = surface_doppler_for_depth(
        args.altitude_km,
        surface_depths,
        args.ice_index,
        args.speed_km_s,
        wavelength_m,
    )

    targets: list[Target] = []
    for depth_km, doppler_hz in zip(surface_depths, dopplers):
        # A mild decay keeps shallow surface power strong while still making
        # the same-delay clutter visible near the subsurface target.
        amplitude = args.surface_amplitude * math.exp(-0.055 * depth_km)
        targets.append(Target("surface +D", float(depth_km), float(doppler_hz), amplitude, "surface"))
        targets.append(Target("surface -D", float(depth_km), float(-doppler_hz), amplitude, "surface"))

    targets.append(Target("nadir subsurface", args.target_depth_km, 0.0, args.subsurface_amplitude, "subsurface"))
    return targets


def depth_axis_with_target(max_depth_km: float, depth_bins: int, target_depth_km: float) -> np.ndarray:
    """Make a display/simulation depth axis that includes the target exactly."""

    axis = np.linspace(0.0, max_depth_km, depth_bins)
    axis[int(np.argmin(np.abs(axis - target_depth_km)))] = target_depth_km
    return np.sort(np.unique(axis))


def range_weights(depth_km: float, depth_axis_km: np.ndarray, sigma_bins: float) -> tuple[np.ndarray, np.ndarray]:
    spacing = depth_axis_km[1] - depth_axis_km[0]
    sigma_km = max(spacing * sigma_bins, spacing * 0.25)
    center = int(np.argmin(np.abs(depth_axis_km - depth_km)))
    lo = max(0, center - 4)
    hi = min(len(depth_axis_km), center + 5)
    indices = np.arange(lo, hi)
    weights = np.exp(-0.5 * ((depth_axis_km[indices] - depth_km) / sigma_km) ** 2)
    weights = weights / max(float(weights.sum()), 1e-12)
    return indices, weights


def simulate_raw(
    targets: list[Target],
    scenario: Scenario,
    depth_axis_km: np.ndarray,
    pulse_count: int,
    range_sigma_bins: float,
    noise: float,
    seed: int = 20260708,
) -> np.ndarray:
    rng = np.random.default_rng(seed)
    time_s = np.arange(pulse_count, dtype=float) / scenario.prf_hz
    raw = noise * (rng.normal(size=(len(depth_axis_km), pulse_count)) + 1j * rng.normal(size=(len(depth_axis_km), pulse_count)))

    for target in targets:
        phase = rng.uniform(0.0, 2.0 * math.pi)
        tone = target.amplitude * np.exp(1j * (2.0 * math.pi * target.doppler_hz * time_s + phase))
        indices, weights = range_weights(target.depth_km, depth_axis_km, range_sigma_bins)
        for idx, weight in zip(indices, weights):
            raw[idx, :] += weight * tone
    return raw


def delay_doppler(raw: np.ndarray, prf_hz: float) -> tuple[np.ndarray, np.ndarray]:
    window = np.hanning(raw.shape[1])
    spectrum = np.fft.fftshift(np.fft.fft(raw * window[None, :], axis=1), axes=1)
    spectrum = spectrum / max(float(window.sum()), 1e-12)
    freq_hz = np.fft.fftshift(np.fft.fftfreq(raw.shape[1], d=1.0 / prf_hz))
    power = np.abs(spectrum) ** 2
    return freq_hz, power


def to_heatmap(power: np.ndarray, out_size: tuple[int, int]) -> Image.Image:
    db = 10.0 * np.log10(power + 1e-12)
    hi = np.percentile(db, 99.8)
    lo = hi - 54.0
    norm = np.clip((db - lo) / (hi - lo), 0.0, 1.0)
    norm = norm**0.7

    # Blue/black background with white-yellow strong returns.
    r = np.uint8(8 + 247 * norm)
    g = np.uint8(13 + 220 * np.minimum(norm * 1.12, 1.0))
    b = np.uint8(22 + 95 * (1.0 - norm) + 110 * norm)
    rgb = np.dstack([r, g, b])
    img = Image.fromarray(rgb, mode="RGB")
    return img.resize(out_size, Image.Resampling.BICUBIC)


def font(name: str, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    path = Path("C:/Windows/Fonts") / name
    if path.exists():
        return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def render_profile(
    draw: ImageDraw.ImageDraw,
    plot: tuple[int, int, int, int],
    depth_axis_km: np.ndarray,
    profile: np.ndarray,
    target_depth_km: float,
    line_color: tuple[int, int, int, int],
) -> None:
    x0, y0, x1, y1 = plot
    profile_db = 10.0 * np.log10(profile + 1e-12)
    hi = float(np.percentile(profile_db, 99.5))
    lo = hi - 42.0

    def px(value_db: float) -> float:
        return x0 + (np.clip((value_db - lo) / (hi - lo), 0.0, 1.0)) * (x1 - x0)

    def py(depth_km: float) -> float:
        return y0 + depth_km / float(depth_axis_km.max()) * (y1 - y0)

    points = [(px(float(v)), py(float(d))) for v, d in zip(profile_db, depth_axis_km)]
    draw.line(points, fill=line_color, width=3)
    target_y = py(target_depth_km)
    draw.line((x0, target_y, x1, target_y), fill=(82, 217, 234, 150), width=2)
    draw.text((x0 + 6, target_y - 7), "6 km target depth", fill=(82, 217, 234, 230), font=font("segoeui.ttf", 13), anchor="la")


def render(
    output: Path,
    results: list[dict[str, object]],
    summary: dict[str, float],
    depth_axis_km: np.ndarray,
) -> None:
    width, height = 2050, 1460
    margin = 56
    gap = 34
    panel_w = (width - 2 * margin - 2 * gap) // 3
    top_h = 740
    bottom_h = 300
    panel_top = 150
    profile_top = panel_top + top_h + 38
    footer_top = profile_top + bottom_h + 42

    img = Image.new("RGB", (width, height), "#080d13")
    draw = ImageDraw.Draw(img, "RGBA")
    title_font = font("segoeuib.ttf", 36)
    label_font = font("segoeui.ttf", 20)
    small_font = font("segoeui.ttf", 15)
    bold_font = font("segoeuib.ttf", 19)
    tiny_font = font("segoeui.ttf", 13)

    draw.text((margin, 36), "Point-Target PRF Aliasing Simulation", fill=(245, 248, 252, 255), font=title_font, anchor="la")
    draw.text(
        (margin, 84),
        "Fake slow-time traces: flat-surface point targets plus one zero-Doppler subsurface point. Each panel is an FFT along track.",
        fill=(188, 199, 211, 255),
        font=label_font,
        anchor="la",
    )

    target_depth = summary["target_depth_km"]
    same_delay_fd = summary["same_delay_doppler_hz"]

    for idx, result in enumerate(results):
        scenario = result["scenario"]
        assert isinstance(scenario, Scenario)
        freq_hz = result["freq_hz"]
        power = result["power"]
        profile = result["surface_zero_profile"]
        assert isinstance(freq_hz, np.ndarray)
        assert isinstance(power, np.ndarray)
        assert isinstance(profile, np.ndarray)

        x0 = margin + idx * (panel_w + gap)
        y0 = panel_top
        x1 = x0 + panel_w
        y1 = y0 + top_h
        draw.rounded_rectangle((x0, y0, x1, y1), radius=7, fill=(15, 22, 31, 255), outline=(66, 78, 92, 255), width=1)
        draw.text((x0 + 18, y0 + 16), scenario.name, fill=(244, 248, 252, 255), font=bold_font, anchor="la")
        draw.text((x0 + 18, y0 + 42), scenario.note, fill=(176, 188, 200, 255), font=tiny_font, anchor="la")

        plot = (x0 + 70, y0 + 76, x1 - 25, y1 - 68)
        heatmap = to_heatmap(power, (plot[2] - plot[0], plot[3] - plot[1]))
        img.paste(heatmap, (plot[0], plot[1]))
        draw.rectangle(plot, outline=(97, 113, 130, 255), width=1)

        def px(f_hz: float) -> float:
            return plot[0] + (f_hz - float(freq_hz.min())) / float(freq_hz.max() - freq_hz.min()) * (plot[2] - plot[0])

        def py(depth_km: float) -> float:
            return plot[1] + depth_km / float(depth_axis_km.max()) * (plot[3] - plot[1])

        zero_x = px(0.0)
        target_y = py(target_depth)
        draw.line((zero_x, plot[1], zero_x, plot[3]), fill=(235, 241, 248, 120), width=2)
        draw.line((plot[0], target_y, plot[2], target_y), fill=(82, 217, 234, 125), width=2)

        # Mark the true subsurface target and the same-delay surface clutter.
        draw.ellipse((zero_x - 8, target_y - 8, zero_x + 8, target_y + 8), outline=(82, 217, 234, 255), width=3)
        for f in (same_delay_fd, -same_delay_fd):
            folded = float(alias_frequency(f, scenario.prf_hz))
            fx = px(folded)
            draw.ellipse((fx - 7, target_y - 7, fx + 7, target_y + 7), fill=(250, 224, 83, 255))

        draw.text((plot[0], plot[1] - 16), "delay-Doppler power", fill=(194, 204, 215, 255), font=small_font, anchor="la")
        draw.text((plot[0], plot[3] + 27), "sampled Doppler frequency (Hz)", fill=(166, 178, 191, 255), font=tiny_font, anchor="la")
        draw.text((plot[0] - 38, plot[1] - 2), "depth\n(km)", fill=(166, 178, 191, 255), font=tiny_font, anchor="ma")

        for depth_tick in np.linspace(0.0, float(depth_axis_km.max()), 6):
            yy = py(float(depth_tick))
            draw.line((plot[0], yy, plot[2], yy), fill=(44, 54, 67, 155), width=1)
            draw.text((plot[0] - 8, yy), f"{depth_tick:g}", fill=(150, 163, 176, 255), font=tiny_font, anchor="rm")

        half_prf = scenario.prf_hz / 2.0
        for ftick in (-half_prf, 0.0, half_prf):
            xx = px(ftick)
            draw.line((xx, plot[3], xx, plot[3] + 6), fill=(150, 163, 176, 255), width=1)
            draw.text((xx, plot[3] + 10), f"{ftick:.0f}", fill=(150, 163, 176, 255), font=tiny_font, anchor="mt")

        p0 = (x0, profile_top, x1, profile_top + bottom_h)
        draw.rounded_rectangle(p0, radius=7, fill=(15, 22, 31, 255), outline=(66, 78, 92, 255), width=1)
        draw.text((x0 + 18, profile_top + 18), "Surface-only zero-Doppler clutter", fill=(244, 248, 252, 255), font=bold_font, anchor="la")
        draw.text((x0 + 18, profile_top + 43), "shows whether surface energy lands on nadir", fill=(176, 188, 200, 255), font=tiny_font, anchor="la")
        profile_plot = (x0 + 70, profile_top + 70, x1 - 28, profile_top + bottom_h - 34)
        draw.rectangle(profile_plot, fill=(7, 11, 17, 255), outline=(97, 113, 130, 255), width=1)
        render_profile(draw, profile_plot, depth_axis_km, profile, target_depth, (250, 224, 83, 245))
        draw.text((profile_plot[0], profile_plot[3] + 10), "relative power", fill=(166, 178, 191, 255), font=tiny_font, anchor="la")

    box = (margin, footer_top, width - margin, height - 45)
    draw.rounded_rectangle(box, radius=7, fill=(15, 22, 31, 255), outline=(66, 78, 92, 255), width=1)
    lines = [
        f"Current givens: h={summary['altitude_km']:.1f} km, depth={summary['target_depth_km']:.1f} km, n={summary['ice_index']:.2f}, v={summary['speed_km_s']:.1f} km/s, lambda={summary['wavelength_m']:.3g} m.",
        f"Same-delay surface clutter: offset={summary['surface_offset_km']:.2f} km, look angle={summary['look_angle_deg']:.2f} deg, true Doppler=+/-{summary['same_delay_doppler_hz']:.2f} Hz.",
        f"Alias begins below PRF={summary['alias_start_prf_hz']:.2f} Hz. Exact first zero-Doppler overlap is PRF={summary['zero_overlap_prf_hz']:.2f} Hz.",
        f"Timing-limited current PRF={summary['current_prf_hz']:.2f} Hz: surface clutter folds to +/-{abs(summary['current_same_delay_alias_hz']):.2f} Hz, so it aliases but does not land on the nadir point yet.",
    ]
    for line_idx, text in enumerate(lines):
        draw.text((box[0] + 24, box[1] + 24 + line_idx * 31), text, fill=(224, 232, 240, 255), font=small_font, anchor="la")

    output.parent.mkdir(parents=True, exist_ok=True)
    img.save(output)


def run_scenario(
    targets: list[Target],
    scenario: Scenario,
    depth_axis_km: np.ndarray,
    args: argparse.Namespace,
) -> dict[str, object]:
    raw = simulate_raw(
        targets,
        scenario,
        depth_axis_km,
        args.pulse_count,
        args.range_sigma_bins,
        args.noise,
        seed=20260708,
    )
    freq_hz, power = delay_doppler(raw, scenario.prf_hz)
    surface_targets = [target for target in targets if target.kind == "surface"]
    surface_raw = simulate_raw(
        surface_targets,
        scenario,
        depth_axis_km,
        args.pulse_count,
        args.range_sigma_bins,
        0.0,
        seed=20260708,
    )
    _, surface_power = delay_doppler(surface_raw, scenario.prf_hz)
    zero_band = np.abs(freq_hz) <= max(scenario.prf_hz / args.pulse_count * 2.5, 4.0)
    surface_zero_profile = surface_power[:, zero_band].mean(axis=1)
    return {
        "scenario": scenario,
        "freq_hz": freq_hz,
        "power": power,
        "surface_zero_profile": surface_zero_profile,
    }


def write_summary(path: Path, summary: dict[str, float], scenarios: list[Scenario]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["metric", "value"])
        for key, value in summary.items():
            writer.writerow([key, value])
        for scenario in scenarios:
            writer.writerow([f"scenario_{scenario.name}_prf_hz", scenario.prf_hz])


def write_config(path: Path, args: argparse.Namespace, summary: dict[str, float], scenarios: list[Scenario]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    inputs = {key: (str(value) if isinstance(value, Path) else value) for key, value in vars(args).items()}
    payload = {
        "inputs": inputs,
        "summary": summary,
        "scenarios": [{"name": s.name, "prf_hz": s.prf_hz, "note": s.note} for s in scenarios],
    }
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def main() -> None:
    args = parse_args()
    wavelength_m = wavelength_from_args(args)
    geom = same_delay_surface(args.altitude_km, args.target_depth_km, args.ice_index, args.speed_km_s, wavelength_m)
    timing = timing_limited_prf(
        args.altitude_km,
        args.target_depth_km,
        args.ice_index,
        args.pulse_us,
        args.guard_us,
        args.dead_time_us,
        args.max_usable_prf_hz,
    )
    current_prf_hz = args.current_prf_hz if args.current_prf_hz is not None else timing["effective_prf_hz"]
    current_alias = float(alias_frequency(geom["same_delay_doppler_hz"], current_prf_hz))

    summary = {
        "altitude_km": args.altitude_km,
        "target_depth_km": args.target_depth_km,
        "ice_index": args.ice_index,
        "speed_km_s": args.speed_km_s,
        "wavelength_m": wavelength_m,
        "max_usable_prf_hz": args.max_usable_prf_hz,
        "pulse_us": args.pulse_us,
        "guard_us": args.guard_us,
        "dead_time_us": args.dead_time_us,
        **timing,
        **geom,
        "current_prf_hz": current_prf_hz,
        "current_same_delay_alias_hz": current_alias,
    }

    scenarios = [
        Scenario("High PRF truth", max(args.high_prf_hz, geom["alias_start_prf_hz"] * 1.5), "wide enough sampled Doppler band; no folding"),
        Scenario("Current PRF", current_prf_hz, "folding exists, but same-delay clutter misses zero Doppler"),
        Scenario("Zero-overlap PRF", geom["zero_overlap_prf_hz"], "same-delay surface clutter folds onto the nadir target"),
    ]

    depth_axis_km = depth_axis_with_target(
        max(args.max_depth_km, args.target_depth_km * 1.25),
        args.depth_bins,
        args.target_depth_km,
    )
    targets = make_targets(args, wavelength_m)
    results = [run_scenario(targets, scenario, depth_axis_km, args) for scenario in scenarios]

    render(args.output, results, summary, depth_axis_km)
    write_summary(args.summary_csv, summary, scenarios)
    write_config(args.config_json, args, summary, scenarios)

    print(json.dumps({k: round(v, 6) for k, v in summary.items()}, indent=2))
    print(args.output)
    print(args.summary_csv)
    print(args.config_json)


if __name__ == "__main__":
    main()
