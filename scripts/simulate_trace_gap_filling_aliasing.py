"""Test whether filling deleted radar traces removes PRF alias blur.

This is a focused version of the whiteboard idea in the transcript:

1. Build a clean high-PRF point-target radargram.
2. Delete traces by keeping only every 4th trace, lowering the effective PRF.
3. Fill the missing traces back in with linear interpolation.
4. Compare the delay-Doppler spectra and zero-Doppler clutter at the target.

The result is educational, not a mission radar processor. It tests the
mechanism: once high-Doppler surface clutter has been undersampled, filling the
blank columns makes a smoother image but cannot recover the missing Doppler
information.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
from dataclasses import dataclass
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "outputs" / "trace_gap_filling_aliasing_test.png"
DEFAULT_SUMMARY_CSV = ROOT / "outputs" / "trace_gap_filling_aliasing_summary.csv"
DEFAULT_SUMMARY_JSON = ROOT / "outputs" / "trace_gap_filling_aliasing_summary.json"

C_M_S = 299_792_458.0


@dataclass(frozen=True)
class Target:
    depth_km: float
    doppler_hz: float
    amplitude: float
    phase_rad: float
    kind: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--summary-csv", type=Path, default=DEFAULT_SUMMARY_CSV)
    parser.add_argument("--summary-json", type=Path, default=DEFAULT_SUMMARY_JSON)
    parser.add_argument("--altitude-km", type=float, default=25.0)
    parser.add_argument("--speed-km-s", type=float, default=4.6)
    parser.add_argument("--frequency-mhz", type=float, default=60.0)
    parser.add_argument("--ice-index", type=float, default=1.78)
    parser.add_argument("--target-depth-km", type=float, default=6.0)
    parser.add_argument("--max-depth-km", type=float, default=10.0)
    parser.add_argument("--surface-point-count", type=int, default=121)
    parser.add_argument("--depth-bins", type=int, default=440)
    parser.add_argument("--pulse-count", type=int, default=2048)
    parser.add_argument("--keep-every", type=int, default=4)
    parser.add_argument("--surface-amplitude", type=float, default=0.32)
    parser.add_argument("--subsurface-amplitude", type=float, default=0.46)
    parser.add_argument("--range-sigma-bins", type=float, default=0.75)
    parser.add_argument("--noise", type=float, default=0.0)
    return parser.parse_args()


def wavelength_m(frequency_mhz: float) -> float:
    return C_M_S / (frequency_mhz * 1_000_000.0)


def alias_frequency(f_hz: float | np.ndarray, prf_hz: float) -> float | np.ndarray:
    values = np.asarray(f_hz)
    folded = ((values + prf_hz / 2.0) % prf_hz) - prf_hz / 2.0
    if np.isscalar(f_hz):
        return float(folded)
    return folded


def same_delay_surface(
    altitude_km: float,
    depth_km: float,
    ice_index: float,
    speed_km_s: float,
    wavelength: float,
) -> dict[str, float]:
    altitude_m = altitude_km * 1000.0
    depth_m = depth_km * 1000.0
    one_way_path_m = altitude_m + ice_index * depth_m
    offset_m = math.sqrt(max(one_way_path_m**2 - altitude_m**2, 0.0))
    sin_theta = offset_m / one_way_path_m
    doppler_hz = 2.0 * speed_km_s * 1000.0 * sin_theta / wavelength
    return {
        "surface_offset_km": offset_m / 1000.0,
        "look_angle_deg": math.degrees(math.asin(max(-1.0, min(1.0, sin_theta)))),
        "same_delay_doppler_hz": doppler_hz,
        "base_prf_hz": 4.0 * doppler_hz,
        "keep_every_2_prf_hz": 2.0 * doppler_hz,
        "keep_every_4_prf_hz": doppler_hz,
    }


def surface_doppler_for_delay_depth(
    depth_km: np.ndarray,
    altitude_km: float,
    ice_index: float,
    speed_km_s: float,
    wavelength: float,
) -> np.ndarray:
    altitude_m = altitude_km * 1000.0
    path_m = altitude_m + ice_index * depth_km * 1000.0
    offset_m = np.sqrt(np.maximum(path_m**2 - altitude_m**2, 0.0))
    sin_theta = np.divide(offset_m, path_m, out=np.zeros_like(offset_m), where=path_m > 0.0)
    return 2.0 * speed_km_s * 1000.0 * sin_theta / wavelength


def depth_axis(max_depth_km: float, depth_bins: int, target_depth_km: float) -> np.ndarray:
    axis = np.linspace(0.0, max_depth_km, depth_bins)
    axis[int(np.argmin(np.abs(axis - target_depth_km)))] = target_depth_km
    return np.sort(np.unique(axis))


def make_targets(args: argparse.Namespace, wavelength: float) -> list[Target]:
    rng = np.random.default_rng(20260709)
    depths = np.linspace(0.2, args.max_depth_km, args.surface_point_count)
    depths = np.unique(np.append(depths, args.target_depth_km))
    dopplers = surface_doppler_for_delay_depth(
        depths,
        args.altitude_km,
        args.ice_index,
        args.speed_km_s,
        wavelength,
    )

    targets: list[Target] = []
    for depth_km, doppler_hz in zip(depths, dopplers):
        amplitude = args.surface_amplitude * math.exp(-0.045 * depth_km)
        # Keep the exact same-delay pair coherent so the false layer is visible
        # instead of depending on an arbitrary cancellation from random phase.
        phase = 0.0 if abs(float(depth_km) - args.target_depth_km) < 1e-10 else float(rng.uniform(0.0, 2.0 * math.pi))
        targets.append(Target(float(depth_km), float(doppler_hz), amplitude, phase, "surface"))
        targets.append(Target(float(depth_km), float(-doppler_hz), amplitude, phase, "surface"))

    targets.append(Target(args.target_depth_km, 0.0, args.subsurface_amplitude, 0.0, "subsurface"))
    return targets


def range_weights(depth_km: float, axis_km: np.ndarray, sigma_bins: float) -> tuple[np.ndarray, np.ndarray]:
    spacing_km = float(np.median(np.diff(axis_km)))
    sigma_km = max(spacing_km * sigma_bins, spacing_km * 0.25)
    center = int(np.argmin(np.abs(axis_km - depth_km)))
    lo = max(0, center - 5)
    hi = min(len(axis_km), center + 6)
    indices = np.arange(lo, hi)
    weights = np.exp(-0.5 * ((axis_km[indices] - depth_km) / sigma_km) ** 2)
    return indices, weights / max(float(weights.sum()), 1e-12)


def simulate_raw(
    targets: list[Target],
    axis_km: np.ndarray,
    prf_hz: float,
    pulse_count: int,
    range_sigma_bins: float,
    noise: float,
) -> np.ndarray:
    rng = np.random.default_rng(20260709)
    time_s = np.arange(pulse_count, dtype=float) / prf_hz
    raw = noise * (rng.normal(size=(len(axis_km), pulse_count)) + 1j * rng.normal(size=(len(axis_km), pulse_count)))

    for target in targets:
        tone = target.amplitude * np.exp(1j * (2.0 * math.pi * target.doppler_hz * time_s + target.phase_rad))
        indices, weights = range_weights(target.depth_km, axis_km, range_sigma_bins)
        raw[indices, :] += weights[:, None] * tone[None, :]
    return raw


def fill_missing_linear(raw: np.ndarray, keep_every: int) -> np.ndarray:
    kept = np.arange(0, raw.shape[1], keep_every)
    all_idx = np.arange(raw.shape[1])
    filled = np.empty_like(raw)
    for row in range(raw.shape[0]):
        real = np.interp(all_idx, kept, raw[row, kept].real)
        imag = np.interp(all_idx, kept, raw[row, kept].imag)
        filled[row, :] = real + 1j * imag
    return filled


def blank_missing(raw: np.ndarray, keep_every: int) -> np.ndarray:
    blanked = np.full(raw.shape, np.nan + 1j * np.nan, dtype=complex)
    blanked[:, ::keep_every] = raw[:, ::keep_every]
    return blanked


def delay_doppler(raw: np.ndarray, prf_hz: float) -> tuple[np.ndarray, np.ndarray]:
    finite_raw = np.nan_to_num(raw)
    window = np.hanning(finite_raw.shape[1])
    spectrum = np.fft.fftshift(np.fft.fft(finite_raw * window[None, :], axis=1), axes=1)
    spectrum = spectrum / max(float(window.sum()), 1e-12)
    freq_hz = np.fft.fftshift(np.fft.fftfreq(finite_raw.shape[1], d=1.0 / prf_hz))
    return freq_hz, np.abs(spectrum) ** 2


def target_depth_index(axis_km: np.ndarray, target_depth_km: float) -> int:
    return int(np.argmin(np.abs(axis_km - target_depth_km)))


def power_at(power: np.ndarray, freq_hz: np.ndarray, axis_km: np.ndarray, depth_km: float, doppler_hz: float) -> float:
    row = target_depth_index(axis_km, depth_km)
    col = int(np.argmin(np.abs(freq_hz - doppler_hz)))
    return float(power[row, col])


def normalized_zero_profiles(
    items: list[tuple[str, np.ndarray, np.ndarray]],
    axis_km: np.ndarray,
) -> dict[str, np.ndarray]:
    profiles: dict[str, np.ndarray] = {}
    for name, freq_hz, power in items:
        zero = int(np.argmin(np.abs(freq_hz)))
        profiles[name] = power[:, zero].astype(float)
    scale = max(float(profile.max()) for profile in profiles.values())
    if scale > 0:
        profiles = {name: profile / scale for name, profile in profiles.items()}
    return profiles


def reconstruction_nmse(truth: np.ndarray, filled: np.ndarray, keep_every: int) -> float:
    missing = np.ones(truth.shape[1], dtype=bool)
    missing[::keep_every] = False
    numerator = np.sum(np.abs(filled[:, missing] - truth[:, missing]) ** 2)
    denominator = np.sum(np.abs(truth[:, missing]) ** 2)
    return float(numerator / max(float(denominator), 1e-12))


def db_image(power: np.ndarray) -> np.ndarray:
    db = 10.0 * np.log10(power + 1e-14)
    hi = float(np.percentile(db, 99.85))
    return np.clip(db, hi - 55.0, hi)


def render(
    output: Path,
    axis_km: np.ndarray,
    panels: dict[str, tuple[np.ndarray, np.ndarray]],
    profiles: dict[str, np.ndarray],
    summary: dict[str, float],
) -> None:
    plt.style.use("dark_background")
    fig = plt.figure(figsize=(16, 10), dpi=180)
    grid = fig.add_gridspec(2, 3, height_ratios=[1.08, 0.92], hspace=0.30, wspace=0.25)
    cmap = "magma"

    titles = [
        ("Clean high PRF", "Surface Doppler stays away from zero"),
        ("Keep every 4th trace", "Effective PRF drops; clutter folds"),
        ("Linear fill after deletion", "Looks filled, but Doppler is still wrong"),
    ]

    for index, (key, subtitle) in enumerate(titles):
        ax = fig.add_subplot(grid[0, index])
        freq_hz, power = panels[key]
        image = db_image(power)
        ax.imshow(
            image,
            extent=[float(freq_hz.min()), float(freq_hz.max()), float(axis_km.max()), float(axis_km.min())],
            aspect="auto",
            cmap=cmap,
            interpolation="nearest",
        )
        ax.axvline(0.0, color="white", lw=1.1, alpha=0.65)
        ax.axhline(summary["target_depth_km"], color="#58d5e8", lw=1.2, alpha=0.85)
        ax.scatter([0.0], [summary["target_depth_km"]], s=50, facecolors="none", edgecolors="#58d5e8", linewidths=1.4)
        ax.set_title(f"{key}\n{subtitle}", fontsize=11, pad=9)
        ax.set_xlabel("Doppler frequency (Hz)", fontsize=9)
        if index == 0:
            ax.set_ylabel("apparent ice depth (km)", fontsize=9)
        ax.tick_params(labelsize=8)

    ax_strip = fig.add_subplot(grid[1, 0])
    strip_labels = ["kept", "missing", "filled"]
    keep_every = int(summary["keep_every"])
    trace_count = 80
    retained = np.zeros(trace_count, dtype=float)
    retained[::keep_every] = 1.0
    missing = 1.0 - retained
    filled = np.ones(trace_count, dtype=float)
    strip = np.vstack([retained, missing, filled])
    ax_strip.imshow(strip, aspect="auto", cmap="viridis", vmin=0, vmax=1, interpolation="nearest")
    ax_strip.set_yticks(range(3), strip_labels)
    ax_strip.set_xlabel("trace index", fontsize=9)
    ax_strip.set_title("Trace removal and gap filling pattern", fontsize=11)
    ax_strip.tick_params(labelsize=8)

    ax_profile = fig.add_subplot(grid[1, 1])
    colors = {
        "Clean high PRF": "#9be7a8",
        "Keep every 4th trace": "#ffcf5a",
        "Linear fill after deletion": "#ff6b6b",
    }
    for name, profile in profiles.items():
        ax_profile.plot(profile, axis_km, label=name, lw=2.0, color=colors.get(name, None))
    ax_profile.axhline(summary["target_depth_km"], color="#58d5e8", lw=1.2, alpha=0.85)
    ax_profile.invert_yaxis()
    ax_profile.set_xlabel("surface-only zero-Doppler power\n(normalized)", fontsize=9)
    ax_profile.set_ylabel("apparent ice depth (km)", fontsize=9)
    ax_profile.set_title("False layer test at zero Doppler", fontsize=11)
    ax_profile.legend(fontsize=7, loc="lower right")
    ax_profile.tick_params(labelsize=8)
    ax_profile.grid(alpha=0.18)

    ax_text = fig.add_subplot(grid[1, 2])
    ax_text.axis("off")
    lines = [
        "Result",
        f"Same-delay surface Doppler: +/-{summary['same_delay_doppler_hz']:.1f} Hz",
        f"Clean base PRF: {summary['base_prf_hz']:.1f} Hz",
        f"After keeping every {keep_every}th trace: {summary['decimated_prf_hz']:.1f} Hz",
        "",
        f"Clean false zero-Doppler clutter: {summary['clean_false_zero_norm']:.3g}",
        f"Deleted-trace false clutter: {summary['decimated_false_zero_norm']:.3g}",
        f"Filled-trace false clutter: {summary['filled_false_zero_norm']:.3g}",
        "",
        f"Surface missing-trace reconstruction NMSE: {summary['surface_missing_trace_nmse']:.2f}",
        f"High-Doppler power recovered after fill: {summary['filled_high_doppler_recovery_pct']:.2f}%",
        "",
        "Interpretation:",
        "Filling columns smooths the radargram, but the",
        "high-Doppler surface signal has already folded",
        "into the wrong frequency band.",
    ]
    y = 0.96
    for i, line in enumerate(lines):
        weight = "bold" if i == 0 else "normal"
        size = 14 if i == 0 else 10
        color = "#ffffff" if i == 0 else "#d8e0e8"
        ax_text.text(0.02, y, line, transform=ax_text.transAxes, fontsize=size, color=color, weight=weight, va="top")
        y -= 0.073 if line else 0.048

    fig.suptitle("Trace Removal + Gap Filling PRF Aliasing Test", fontsize=16, weight="bold", y=0.985)
    output.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(output, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)


def write_summary_csv(path: Path, summary: dict[str, float]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["metric", "value"])
        for key, value in summary.items():
            writer.writerow([key, value])


def main() -> None:
    args = parse_args()
    wavelength = wavelength_m(args.frequency_mhz)
    geometry = same_delay_surface(
        args.altitude_km,
        args.target_depth_km,
        args.ice_index,
        args.speed_km_s,
        wavelength,
    )
    if args.keep_every != 4:
        geometry["base_prf_hz"] = args.keep_every * geometry["same_delay_doppler_hz"]

    axis_km = depth_axis(args.max_depth_km, args.depth_bins, args.target_depth_km)
    targets = make_targets(args, wavelength)
    surface_targets = [target for target in targets if target.kind == "surface"]
    subsurface_targets = [target for target in targets if target.kind == "subsurface"]

    base_prf_hz = geometry["base_prf_hz"]
    decimated_prf_hz = base_prf_hz / args.keep_every

    raw_all = simulate_raw(targets, axis_km, base_prf_hz, args.pulse_count, args.range_sigma_bins, args.noise)
    raw_surface = simulate_raw(surface_targets, axis_km, base_prf_hz, args.pulse_count, args.range_sigma_bins, 0.0)
    raw_subsurface = simulate_raw(subsurface_targets, axis_km, base_prf_hz, args.pulse_count, args.range_sigma_bins, 0.0)

    raw_decimated = raw_all[:, :: args.keep_every]
    raw_surface_decimated = raw_surface[:, :: args.keep_every]
    raw_filled = fill_missing_linear(raw_all, args.keep_every)
    raw_surface_filled = fill_missing_linear(raw_surface, args.keep_every)

    clean_freq, clean_power = delay_doppler(raw_all, base_prf_hz)
    dec_freq, dec_power = delay_doppler(raw_decimated, decimated_prf_hz)
    fill_freq, fill_power = delay_doppler(raw_filled, base_prf_hz)

    clean_surf_freq, clean_surf_power = delay_doppler(raw_surface, base_prf_hz)
    dec_surf_freq, dec_surf_power = delay_doppler(raw_surface_decimated, decimated_prf_hz)
    fill_surf_freq, fill_surf_power = delay_doppler(raw_surface_filled, base_prf_hz)
    sub_freq, sub_power = delay_doppler(raw_subsurface, base_prf_hz)

    true_target_zero_power = power_at(sub_power, sub_freq, axis_km, args.target_depth_km, 0.0)
    clean_false_zero = power_at(clean_surf_power, clean_surf_freq, axis_km, args.target_depth_km, 0.0)
    decimated_false_zero = power_at(dec_surf_power, dec_surf_freq, axis_km, args.target_depth_km, 0.0)
    filled_false_zero = power_at(fill_surf_power, fill_surf_freq, axis_km, args.target_depth_km, 0.0)

    same_delay_doppler = geometry["same_delay_doppler_hz"]
    clean_high_doppler = power_at(clean_surf_power, clean_surf_freq, axis_km, args.target_depth_km, same_delay_doppler)
    filled_high_doppler = power_at(fill_surf_power, fill_surf_freq, axis_km, args.target_depth_km, same_delay_doppler)

    profiles = normalized_zero_profiles(
        [
            ("Clean high PRF", clean_surf_freq, clean_surf_power),
            ("Keep every 4th trace", dec_surf_freq, dec_surf_power),
            ("Linear fill after deletion", fill_surf_freq, fill_surf_power),
        ],
        axis_km,
    )
    depth_i = target_depth_index(axis_km, args.target_depth_km)

    surface_missing_nmse = reconstruction_nmse(raw_surface, raw_surface_filled, args.keep_every)
    all_missing_nmse = reconstruction_nmse(raw_all, raw_filled, args.keep_every)
    high_doppler_recovery_pct = 100.0 * filled_high_doppler / max(clean_high_doppler, 1e-12)

    summary = {
        "altitude_km": args.altitude_km,
        "target_depth_km": args.target_depth_km,
        "frequency_mhz": args.frequency_mhz,
        "wavelength_m": wavelength,
        "ice_index": args.ice_index,
        "speed_km_s": args.speed_km_s,
        "keep_every": float(args.keep_every),
        "surface_offset_km": geometry["surface_offset_km"],
        "look_angle_deg": geometry["look_angle_deg"],
        "same_delay_doppler_hz": same_delay_doppler,
        "base_prf_hz": base_prf_hz,
        "decimated_prf_hz": decimated_prf_hz,
        "true_target_zero_power": true_target_zero_power,
        "clean_false_zero_power": clean_false_zero,
        "decimated_false_zero_power": decimated_false_zero,
        "filled_false_zero_power": filled_false_zero,
        "clean_false_zero_norm": float(profiles["Clean high PRF"][depth_i]),
        "decimated_false_zero_norm": float(profiles["Keep every 4th trace"][depth_i]),
        "filled_false_zero_norm": float(profiles["Linear fill after deletion"][depth_i]),
        "clean_false_zero_vs_true_target_pct": 100.0 * clean_false_zero / max(true_target_zero_power, 1e-12),
        "decimated_false_zero_vs_true_target_pct": 100.0 * decimated_false_zero / max(true_target_zero_power, 1e-12),
        "filled_false_zero_vs_true_target_pct": 100.0 * filled_false_zero / max(true_target_zero_power, 1e-12),
        "surface_missing_trace_nmse": surface_missing_nmse,
        "all_signal_missing_trace_nmse": all_missing_nmse,
        "clean_high_doppler_power": clean_high_doppler,
        "filled_high_doppler_power": filled_high_doppler,
        "filled_high_doppler_recovery_pct": high_doppler_recovery_pct,
    }

    render(
        args.output,
        axis_km,
        {
            "Clean high PRF": (clean_freq, clean_power),
            "Keep every 4th trace": (dec_freq, dec_power),
            "Linear fill after deletion": (fill_freq, fill_power),
        },
        profiles,
        summary,
    )
    write_summary_csv(args.summary_csv, summary)
    args.summary_json.parent.mkdir(parents=True, exist_ok=True)
    args.summary_json.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print(json.dumps({key: round(value, 6) for key, value in summary.items()}, indent=2))
    print(args.output)
    print(args.summary_csv)
    print(args.summary_json)


if __name__ == "__main__":
    main()
