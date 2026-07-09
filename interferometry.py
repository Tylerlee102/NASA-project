from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np

from reason_common import (
    axes_from_config,
    altitude_m,
    candidate_box,
    candidate_mask,
    cfg_get,
    circular_mean,
    load_config,
    output_dir,
    read_array,
    render_heatmap,
    resolve_path,
    result_payload,
    save_array_pair,
    wavelength_m,
    write_json,
)


def _simulate_channels(config: dict, depth_m: np.ndarray, along_m: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(int(cfg_get(config, "simulation.random_seed", 7)) + 11)
    candidate_depth = float(cfg_get(config, "candidate.apparent_depth_m", 440.0))
    depth_sigma = float(cfg_get(config, "candidate.depth_tolerance_m", 80.0)) / 2.4
    start = float(cfg_get(config, "candidate.along_start_km", 10.0)) * 1000.0
    end = float(cfg_get(config, "candidate.along_end_km", 110.0)) * 1000.0
    along_center = 0.5 * (start + end)
    along_sigma = max((end - start) / 2.8, 1.0)

    depth_weight = np.exp(-0.5 * ((depth_m[:, None] - candidate_depth) / depth_sigma) ** 2)
    along_weight = np.exp(-0.5 * ((along_m[None, :] - along_center) / along_sigma) ** 2)
    signal = depth_weight * along_weight

    surface = np.exp(-depth_m[:, None] / 90.0)
    amplitude = 0.18 * surface + 1.2 * signal
    expected_offset = float(cfg_get(config, "candidate.expected_offset_km", 25.0)) * 1000.0
    theta = math.atan2(expected_offset, altitude_m(config))
    phase = (2.0 * math.pi / wavelength_m(config)) * float(cfg_get(config, "geometry.baseline_m", 5.0)) * math.sin(theta)

    noise_scale = 0.035
    noise1 = noise_scale * (rng.normal(size=amplitude.shape) + 1j * rng.normal(size=amplitude.shape))
    noise2 = noise_scale * (rng.normal(size=amplitude.shape) + 1j * rng.normal(size=amplitude.shape))
    ch1 = amplitude + noise1
    ch2 = 0.18 * surface + 1.2 * signal * np.exp(-1j * phase) + noise2
    return ch1.astype(np.complex128), ch2.astype(np.complex128)


def run(config_path: Path) -> dict:
    config, resolved_config = load_config(config_path)
    out = output_dir(config, resolved_config)
    along_m, _, depth_m = axes_from_config(config)

    ch1_path = resolve_path(resolved_config, cfg_get(config, "paths.channel1_npy"))
    ch2_path = resolve_path(resolved_config, cfg_get(config, "paths.channel2_npy"))
    if ch1_path and ch2_path and ch1_path.exists() and ch2_path.exists():
        ch1 = read_array(ch1_path)
        ch2 = read_array(ch2_path)
    else:
        ch1, ch2 = _simulate_channels(config, depth_m, along_m)

    cross = ch1 * np.conj(ch2)
    phase = np.angle(cross)
    coherence_weight = np.abs(cross)
    baseline = float(cfg_get(config, "geometry.baseline_m", 5.0))
    wave = wavelength_m(config)
    angle_arg = np.clip(phase * wave / (2.0 * math.pi * baseline), -1.0, 1.0)
    offnadir_angle = np.arcsin(angle_arg)
    lateral_offset = altitude_m(config) * np.tan(offnadir_angle)

    save_array_pair(out / "test2_interferometric_phase_rad", phase)
    save_array_pair(out / "test2_offnadir_angle_deg", np.degrees(offnadir_angle))
    save_array_pair(out / "test2_lateral_offset_km", lateral_offset / 1000.0)
    render_heatmap(out / "test2_interferometric_phase_abs.png", np.abs(phase), box=candidate_box(config, along_m, depth_m))
    render_heatmap(out / "test2_lateral_offset_abs_km.png", np.abs(lateral_offset) / 1000.0, box=candidate_box(config, along_m, depth_m))

    mask = candidate_mask(config, along_m, depth_m)
    mean_phase = circular_mean(phase[mask], coherence_weight[mask])
    mean_offset_km = float(np.average(lateral_offset[mask] / 1000.0, weights=np.maximum(coherence_weight[mask], 1.0e-12)))
    abs_mean_offset_km = abs(mean_offset_km)
    expected_offset_km = float(cfg_get(config, "candidate.expected_offset_km", 25.0))
    phase_threshold = float(cfg_get(config, "thresholds.phase_zero_threshold_rad", 0.06))
    offset_threshold = float(cfg_get(config, "thresholds.phase_offset_match_km", 8.0))

    if abs(mean_phase) <= phase_threshold:
        result = "subsurface"
        rationale = "Candidate-bin interferometric phase is statistically near zero."
    elif abs(abs_mean_offset_km - expected_offset_km) <= offset_threshold:
        result = "clutter"
        rationale = "Candidate-bin phase is nonzero and maps to the expected off-nadir surface offset."
    else:
        result = "ambiguous"
        rationale = "Candidate-bin phase is nonzero, but the inferred offset does not match the configured surface feature."

    payload = result_payload(
        "2_interferometry",
        result,
        {
            "candidate_mean_phase_rad": mean_phase,
            "candidate_mean_phase_deg": math.degrees(mean_phase),
            "candidate_mean_offset_km": mean_offset_km,
            "expected_offset_km": expected_offset_km,
        },
        rationale,
    )
    write_json(out / "test2_interferometry_result.json", payload)
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Test 2: dual-channel interferometric phase.")
    parser.add_argument("--config", type=Path, default=Path("config.yaml"))
    args = parser.parse_args()
    payload = run(args.config)
    print(f"Test 2 result: {payload['result']} - {payload['rationale']}")


if __name__ == "__main__":
    main()
