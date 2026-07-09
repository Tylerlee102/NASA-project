"""Trace downsampling simulation for PRF aliasing and false layers.

This script demonstrates the exact workflow described in the transcript:

1. Start with fake high-PRF radar traces from flat-surface point targets.
2. Keep every trace, every 2nd trace, and every 4th trace.
3. FFT along slow time to show Doppler folding.
4. Display the surface-only zero-Doppler FFT slice to show when folded surface
   clutter becomes a false subsurface layer.

The model is intentionally flat and educational. It is not a mission radar
processor.
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
DEFAULT_OUTPUT = ROOT / "outputs" / "trace_downsampling_false_layer_clean.png"
DEFAULT_SUMMARY = ROOT / "outputs" / "trace_downsampling_false_layer_summary.csv"

C_M_S = 299_792_458.0


@dataclass(frozen=True)
class Target:
    depth_km: float
    doppler_hz: float
    amplitude: float
    kind: str


@dataclass(frozen=True)
class Scenario:
    name: str
    keep_every: int
    explanation: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--summary-csv", type=Path, default=DEFAULT_SUMMARY)
    parser.add_argument("--altitude-km", type=float, default=25.0)
    parser.add_argument("--speed-km-s", type=float, default=4.6)
    parser.add_argument("--wavelength-m", type=float, default=5.0)
    parser.add_argument("--frequency-mhz", type=float, default=None)
    parser.add_argument("--ice-index", type=float, default=1.78)
    parser.add_argument("--target-depth-km", type=float, default=6.0)
    parser.add_argument("--max-depth-km", type=float, default=10.0)
    parser.add_argument("--surface-point-count", type=int, default=135)
    parser.add_argument("--depth-bins", type=int, default=480)
    parser.add_argument("--pulse-count", type=int, default=2048)
    parser.add_argument("--surface-amplitude", type=float, default=0.28)
    parser.add_argument("--subsurface-amplitude", type=float, default=0.45)
    parser.add_argument("--range-sigma-bins", type=float, default=0.82)
    parser.add_argument(
        "--noise",
        type=float,
        default=0.0,
        help="Optional complex receiver noise amplitude. Default is 0 for a clean aliasing-only proof.",
    )
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


def surface_doppler(depth_km: np.ndarray, altitude_km: float, ice_index: float, speed_km_s: float, wavelength_m: float) -> np.ndarray:
    h_m = altitude_km * 1000.0
    path_m = h_m + ice_index * depth_km * 1000.0
    offset_m = np.sqrt(np.maximum(path_m * path_m - h_m * h_m, 0.0))
    sin_theta = np.divide(offset_m, path_m, out=np.zeros_like(offset_m), where=path_m > 0.0)
    return 2.0 * speed_km_s * 1000.0 * sin_theta / wavelength_m


def same_delay_summary(args: argparse.Namespace, wavelength_m: float) -> dict[str, float]:
    h_m = args.altitude_km * 1000.0
    d_m = args.target_depth_km * 1000.0
    path_m = h_m + args.ice_index * d_m
    offset_m = math.sqrt(max(path_m * path_m - h_m * h_m, 0.0))
    sin_theta = offset_m / path_m
    fd_hz = 2.0 * args.speed_km_s * 1000.0 * sin_theta / wavelength_m
    return {
        "same_delay_surface_offset_km": offset_m / 1000.0,
        "same_delay_look_angle_deg": math.degrees(math.asin(max(-1.0, min(1.0, sin_theta)))),
        "same_delay_doppler_hz": fd_hz,
        "base_prf_hz": 4.0 * fd_hz,
        "keep_2_prf_hz": 2.0 * fd_hz,
        "keep_4_prf_hz": fd_hz,
    }


def depth_axis_with_target(max_depth_km: float, depth_bins: int, target_depth_km: float) -> np.ndarray:
    axis = np.linspace(0.0, max_depth_km, depth_bins)
    axis[int(np.argmin(np.abs(axis - target_depth_km)))] = target_depth_km
    return np.sort(np.unique(axis))


def make_targets(args: argparse.Namespace, wavelength_m: float) -> list[Target]:
    depths = np.linspace(0.18, args.max_depth_km, args.surface_point_count)
    depths = np.unique(np.append(depths, args.target_depth_km))
    fd = surface_doppler(depths, args.altitude_km, args.ice_index, args.speed_km_s, wavelength_m)
    targets: list[Target] = []
    for depth_km, doppler_hz in zip(depths, fd):
        amp = args.surface_amplitude * math.exp(-0.045 * depth_km)
        targets.append(Target(float(depth_km), float(doppler_hz), amp, "surface"))
        targets.append(Target(float(depth_km), float(-doppler_hz), amp, "surface"))
    targets.append(Target(args.target_depth_km, 0.0, args.subsurface_amplitude, "subsurface"))
    return targets


def range_weights(depth_km: float, depth_axis_km: np.ndarray, sigma_bins: float) -> tuple[np.ndarray, np.ndarray]:
    spacing_km = float(np.median(np.diff(depth_axis_km)))
    sigma_km = max(spacing_km * sigma_bins, spacing_km * 0.25)
    center = int(np.argmin(np.abs(depth_axis_km - depth_km)))
    lo = max(0, center - 5)
    hi = min(len(depth_axis_km), center + 6)
    idx = np.arange(lo, hi)
    weights = np.exp(-0.5 * ((depth_axis_km[idx] - depth_km) / sigma_km) ** 2)
    weights = weights / max(float(weights.sum()), 1e-12)
    return idx, weights


def simulate_high_prf_raw(
    targets: list[Target],
    depth_axis_km: np.ndarray,
    base_prf_hz: float,
    pulse_count: int,
    range_sigma_bins: float,
    noise: float,
) -> np.ndarray:
    rng = np.random.default_rng(20260708)
    time_s = np.arange(pulse_count, dtype=float) / base_prf_hz
    raw = noise * (rng.normal(size=(len(depth_axis_km), pulse_count)) + 1j * rng.normal(size=(len(depth_axis_km), pulse_count)))
    for target in targets:
        phase = rng.uniform(0.0, 2.0 * math.pi)
        tone = target.amplitude * np.exp(1j * (2.0 * math.pi * target.doppler_hz * time_s + phase))
        indices, weights = range_weights(target.depth_km, depth_axis_km, range_sigma_bins)
        raw[indices, :] += weights[:, None] * tone[None, :]
    return raw


def delay_doppler(raw: np.ndarray, prf_hz: float) -> tuple[np.ndarray, np.ndarray]:
    window = np.hanning(raw.shape[1])
    spectrum = np.fft.fftshift(np.fft.fft(raw * window[None, :], axis=1), axes=1)
    spectrum = spectrum / max(float(window.sum()), 1e-12)
    freq_hz = np.fft.fftshift(np.fft.fftfreq(raw.shape[1], d=1.0 / prf_hz))
    return freq_hz, np.abs(spectrum) ** 2


def zero_doppler_surface_profile(
    surface_power: np.ndarray,
    freq_hz: np.ndarray,
    depth_axis_km: np.ndarray,
) -> np.ndarray:
    """Surface-only clutter power in the Doppler bin closest to 0 Hz.

    This intentionally uses the sampled FFT output instead of a smoothed
    analytic curve. Any nonzero deep response comes from PRF folding plus the
    finite range/Doppler binning already present in the simulation.
    """

    zero_idx = int(np.argmin(np.abs(freq_hz)))
    profile = np.asarray(surface_power[:, zero_idx], dtype=float).copy()
    profile[(depth_axis_km < 4.5) | (depth_axis_km > 7.5)] = 0.0
    return profile


def heatmap_image(power: np.ndarray, size: tuple[int, int]) -> Image.Image:
    db = 10.0 * np.log10(power + 1e-13)
    hi = np.percentile(db, 99.85)
    lo = hi - 52.0
    norm = np.clip((db - lo) / (hi - lo), 0.0, 1.0) ** 0.72
    r = np.uint8(8 + 242 * norm)
    g = np.uint8(13 + 216 * np.minimum(norm * 1.08, 1.0))
    b = np.uint8(24 + 92 * (1.0 - norm) + 112 * norm)
    return Image.fromarray(np.dstack([r, g, b]), mode="RGB").resize(size, Image.Resampling.BICUBIC)


def radargram_image(profile: np.ndarray, depth_axis_km: np.ndarray, target_depth_km: float, size: tuple[int, int]) -> Image.Image:
    width, height = size
    depths = np.linspace(4.5, 7.5, height)
    base_profile = np.interp(depths, depth_axis_km, profile)
    clutter = np.repeat(base_profile[:, None], width, axis=1)
    clutter = np.clip(clutter, 0.0, 1.0)

    rgb = np.zeros((height, width, 3), dtype=float)
    rgb[..., 0] = 0.02 + 0.95 * clutter
    rgb[..., 1] = 0.04 + 0.78 * clutter
    rgb[..., 2] = 0.07 + 0.12 * clutter
    rgb = np.clip(rgb, 0.0, 1.0)
    return Image.fromarray(np.uint8(rgb * 255.0), mode="RGB")


def font(name: str, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    path = Path("C:/Windows/Fonts") / name
    if path.exists():
        return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def render_trace_strip(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], keep_every: int, base_prf_hz: float) -> None:
    x0, y0, x1, y1 = box
    draw.rectangle(box, fill=(7, 11, 17, 255), outline=(87, 101, 118, 255), width=1)
    count = 44
    for i in range(count):
        x = x0 + 14 + i * (x1 - x0 - 28) / (count - 1)
        retained = i % keep_every == 0
        color = (255, 224, 64, 255) if retained else (70, 83, 99, 210)
        h = 24 if retained else 12
        draw.line((x, (y0 + y1) / 2 - h / 2, x, (y0 + y1) / 2 + h / 2), fill=color, width=3 if retained else 1)
    prf = base_prf_hz / keep_every
    label = "keep all traces" if keep_every == 1 else f"keep every {keep_every} traces"
    draw.text((x0 + 10, y0 + 8), f"{label}: PRF {prf:.0f} Hz", fill=(218, 226, 236, 255), font=font("segoeui.ttf", 14), anchor="la")


def draw_panel(
    canvas: Image.Image,
    draw: ImageDraw.ImageDraw,
    result: dict[str, object],
    summary: dict[str, float],
    depth_axis_km: np.ndarray,
    box: tuple[int, int, int, int],
) -> None:
    title_font = font("segoeuib.ttf", 18)
    small_font = font("segoeui.ttf", 13)
    tiny_font = font("segoeui.ttf", 12)
    x0, y0, x1, y1 = box
    scenario = result["scenario"]
    assert isinstance(scenario, Scenario)
    prf_hz = float(result["prf_hz"])
    freq_hz = result["freq_hz"]
    power = result["power"]
    false_profile = result["false_profile"]
    assert isinstance(freq_hz, np.ndarray)
    assert isinstance(power, np.ndarray)
    assert isinstance(false_profile, np.ndarray)

    draw.rounded_rectangle(box, radius=8, fill=(15, 22, 31, 255), outline=(66, 78, 92, 255), width=1)
    draw.text((x0 + 18, y0 + 16), scenario.name, fill=(244, 248, 252, 255), font=title_font, anchor="la")
    draw.text((x0 + 18, y0 + 40), scenario.explanation, fill=(176, 188, 200, 255), font=tiny_font, anchor="la")

    trace_box = (x0 + 18, y0 + 68, x1 - 18, y0 + 128)
    render_trace_strip(draw, trace_box, scenario.keep_every, summary["base_prf_hz"])

    dd_box = (x0 + 56, y0 + 164, x1 - 18, y0 + 542)
    dd = heatmap_image(power, (dd_box[2] - dd_box[0], dd_box[3] - dd_box[1]))
    canvas.paste(dd, (dd_box[0], dd_box[1]))
    draw.rectangle(dd_box, outline=(95, 110, 128, 255), width=1)

    def dd_px(f_hz: float) -> float:
        return dd_box[0] + (f_hz - float(freq_hz.min())) / float(freq_hz.max() - freq_hz.min()) * (dd_box[2] - dd_box[0])

    def dd_py(depth_km: float) -> float:
        return dd_box[1] + depth_km / float(depth_axis_km.max()) * (dd_box[3] - dd_box[1])

    zero_x = dd_px(0.0)
    target_y = dd_py(summary["target_depth_km"])
    draw.line((zero_x, dd_box[1], zero_x, dd_box[3]), fill=(235, 241, 248, 110), width=2)
    draw.ellipse((zero_x - 7, target_y - 7, zero_x + 7, target_y + 7), outline=(82, 217, 234, 255), width=3)
    for f in (summary["same_delay_doppler_hz"], -summary["same_delay_doppler_hz"]):
        folded = float(alias_frequency(f, prf_hz))
        fx = dd_px(folded)
        draw.ellipse((fx - 6, target_y - 6, fx + 6, target_y + 6), fill=(255, 224, 64, 255))
    draw.text((dd_box[0], dd_box[1] - 12), "delay-Doppler after FFT", fill=(194, 204, 215, 255), font=small_font, anchor="la")
    for tick in (0, 2, 4, 6, 8, 10):
        yy = dd_py(tick)
        draw.line((dd_box[0], yy, dd_box[2], yy), fill=(44, 54, 67, 135), width=1)
        draw.text((dd_box[0] - 7, yy), str(tick), fill=(150, 163, 176, 255), font=tiny_font, anchor="rm")
    half = prf_hz / 2.0
    for ftick in (-half, 0.0, half):
        xx = dd_px(ftick)
        draw.text((xx, dd_box[3] + 8), f"{ftick:.0f}", fill=(150, 163, 176, 255), font=tiny_font, anchor="mt")

    radar_box = (x0 + 56, y0 + 606, x1 - 18, y0 + 875)
    radar = radargram_image(false_profile, depth_axis_km, summary["target_depth_km"], (radar_box[2] - radar_box[0], radar_box[3] - radar_box[1]))
    canvas.paste(radar, (radar_box[0], radar_box[1]))
    draw.rectangle(radar_box, outline=(95, 110, 128, 255), width=1)
    draw.text((radar_box[0], radar_box[1] - 13), "surface-only zero-Doppler slice, no added noise", fill=(194, 204, 215, 255), font=small_font, anchor="la")
    for depth_tick in (4.5, 5.5, 6.0, 6.5, 7.5):
        yy = radar_box[1] + (depth_tick - 4.5) / 3.0 * (radar_box[3] - radar_box[1])
        if abs(depth_tick - 6.0) >= 0.01:
            draw.line((radar_box[0], yy, radar_box[2], yy), fill=(44, 54, 67, 135), width=1)
        draw.text((radar_box[0] - 7, yy), f"{depth_tick:g}", fill=(150, 163, 176, 255), font=tiny_font, anchor="rm")
    draw.text((radar_box[0], radar_box[3] + 12), "retained trace index / along-track", fill=(150, 163, 176, 255), font=tiny_font, anchor="la")

    false_at_target = float(np.interp(summary["target_depth_km"], depth_axis_km, false_profile))
    status = "FALSE LAYER" if false_at_target > 0.65 else ("weak edge" if false_at_target > 0.20 else "no deep false layer")
    color = (255, 224, 64, 255) if false_at_target > 0.65 else ((255, 176, 80, 255) if false_at_target > 0.20 else (146, 215, 163, 255))
    draw.text((x0 + 18, y1 - 38), f"Result: {status}", fill=color, font=title_font, anchor="la")
    draw.text((x0 + 18, y1 - 14), f"surface clutter at 6 km zero-Doppler = {false_at_target:.2f}", fill=(176, 188, 200, 255), font=tiny_font, anchor="la")


def write_summary(path: Path, summary: dict[str, float], results: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["metric", "value"])
        for key, value in summary.items():
            writer.writerow([key, value])
        for result in results:
            scenario = result["scenario"]
            assert isinstance(scenario, Scenario)
            writer.writerow([f"{scenario.name}_prf_hz", result["prf_hz"]])
            writer.writerow([f"{scenario.name}_clutter_at_target_zero_doppler", result["clutter_at_target"]])


def render(output: Path, results: list[dict[str, object]], summary: dict[str, float], depth_axis_km: np.ndarray) -> None:
    width, height = 2020, 1180
    margin = 42
    gap = 26
    panel_w = (width - 2 * margin - 2 * gap) // 3
    panel_h = 970
    panel_top = 138
    canvas = Image.new("RGB", (width, height), "#080d13")
    draw = ImageDraw.Draw(canvas, "RGBA")
    title_font = font("segoeuib.ttf", 35)
    label_font = font("segoeui.ttf", 19)
    small_font = font("segoeui.ttf", 15)

    draw.text((margin, 34), "Trace Removal Can Create a False Layer", fill=(245, 248, 252, 255), font=title_font, anchor="la")
    draw.text(
        (margin, 80),
        "Flat point targets, then keep fewer slow-time traces. No random noise or cosmetic smoothing is added.",
        fill=(188, 199, 211, 255),
        font=label_font,
        anchor="la",
    )
    draw.text(
        (margin, 110),
        f"Setup: 6 km nadir target, same-delay surface Doppler +/-{summary['same_delay_doppler_hz']:.2f} Hz; false layer uses the actual surface-only zero-Doppler FFT bin.",
        fill=(154, 168, 182, 255),
        font=small_font,
        anchor="la",
    )

    for i, result in enumerate(results):
        x0 = margin + i * (panel_w + gap)
        draw_panel(canvas, draw, result, summary, depth_axis_km, (x0, panel_top, x0 + panel_w, panel_top + panel_h))

    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output)


def main() -> None:
    args = parse_args()
    wavelength_m = wavelength_from_args(args)
    summary = {
        "altitude_km": args.altitude_km,
        "target_depth_km": args.target_depth_km,
        "ice_index": args.ice_index,
        "speed_km_s": args.speed_km_s,
        "wavelength_m": wavelength_m,
        "noise_amplitude": args.noise,
        **same_delay_summary(args, wavelength_m),
    }
    depth_axis_km = depth_axis_with_target(args.max_depth_km, args.depth_bins, args.target_depth_km)
    targets = make_targets(args, wavelength_m)
    surface_targets = [target for target in targets if target.kind == "surface"]
    base_prf_hz = summary["base_prf_hz"]
    raw_all = simulate_high_prf_raw(targets, depth_axis_km, base_prf_hz, args.pulse_count, args.range_sigma_bins, args.noise)
    raw_surface = simulate_high_prf_raw(surface_targets, depth_axis_km, base_prf_hz, args.pulse_count, args.range_sigma_bins, 0.0)

    scenarios = [
        Scenario("Original high PRF", 1, "all traces retained; Doppler stays separated"),
        Scenario("Remove every other trace", 2, "effective PRF halves; clutter reaches Nyquist edge"),
        Scenario("Keep every 4th trace", 4, "bad PRF; surface clutter folds onto zero Doppler"),
    ]

    results: list[dict[str, object]] = []
    for scenario in scenarios:
        prf_hz = base_prf_hz / scenario.keep_every
        raw_dec = raw_all[:, ::scenario.keep_every]
        surf_dec = raw_surface[:, ::scenario.keep_every]
        freq_hz, power = delay_doppler(raw_dec, prf_hz)
        _, surf_power = delay_doppler(surf_dec, prf_hz)
        false_profile = zero_doppler_surface_profile(surf_power, freq_hz, depth_axis_km)
        results.append(
            {
                "scenario": scenario,
                "prf_hz": prf_hz,
                "freq_hz": freq_hz,
                "power": power,
                "false_profile": false_profile,
                "clutter_at_target": 0.0,
            }
        )

    false_profile_scale = max(float(np.max(result["false_profile"])) for result in results)
    if false_profile_scale > 0.0:
        for result in results:
            profile = np.asarray(result["false_profile"], dtype=float) / false_profile_scale
            result["false_profile"] = profile
            result["clutter_at_target"] = float(np.interp(args.target_depth_km, depth_axis_km, profile))

    render(args.output, results, summary, depth_axis_km)
    write_summary(args.summary_csv, summary, results)
    print(json.dumps({key: round(value, 6) for key, value in summary.items()}, indent=2))
    print(args.output)
    print(args.summary_csv)


if __name__ == "__main__":
    main()
