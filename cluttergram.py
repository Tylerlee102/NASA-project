from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np

from reason_common import (
    axes_from_config,
    candidate_box,
    candidate_mask,
    candidate_window,
    compute_cluttergram,
    cfg_get,
    load_config,
    load_or_make_dem,
    output_dir,
    read_array,
    render_heatmap,
    resolve_path,
    result_payload,
    save_array_pair,
    synthetic_observed_radargram,
    write_json,
)


def run(config_path: Path) -> dict:
    config, resolved_config = load_config(config_path)
    out = output_dir(config, resolved_config)
    along_m, cross_m, depth_m = axes_from_config(config)
    dem = load_or_make_dem(config, resolved_config, along_m, cross_m)

    clutter, phase_proxy, offset_proxy = compute_cluttergram(dem, along_m, cross_m, depth_m, config)
    save_array_pair(out / "dem", dem)
    save_array_pair(out / "test1_cluttergram", clutter)
    save_array_pair(out / "test1_clutter_phase_proxy_rad", np.nan_to_num(phase_proxy, nan=0.0))
    save_array_pair(out / "test1_clutter_offset_proxy_m", np.nan_to_num(offset_proxy, nan=0.0))

    radargram_path = resolve_path(resolved_config, cfg_get(config, "paths.radargram_npy"))
    if radargram_path and radargram_path.exists():
        observed = read_array(radargram_path)
    else:
        observed = synthetic_observed_radargram(clutter, depth_m, config)
    save_array_pair(out / "test1_observed_radargram", observed)

    box = candidate_box(config, along_m, depth_m)
    render_heatmap(out / "test1_cluttergram.png", clutter, box=box)
    render_heatmap(out / "test1_observed_radargram.png", observed, box=box)

    mask = candidate_mask(config, along_m, depth_m)
    background = clutter[~mask & (depth_m[:, None] > 0.0)]
    candidate = clutter[mask]
    candidate_peak = float(np.percentile(candidate, 95)) if candidate.size else 0.0
    background_peak = float(np.percentile(background, 95)) if background.size else 1.0
    alignment_ratio = candidate_peak / max(background_peak, 1.0e-12)

    window = candidate_window(config)
    along_sel = (along_m >= window["along_start_km"] * 1000.0) & (along_m <= window["along_end_km"] * 1000.0)
    depth_sel = np.abs(depth_m - window["apparent_depth_m"]) <= window["depth_tolerance_m"]
    band_peak_by_along = np.max(clutter[depth_sel, :], axis=0)
    strong_threshold = float(np.percentile(clutter[clutter > 0.0], 90)) if np.any(clutter > 0.0) else 0.0
    extent_fraction = float(np.mean(band_peak_by_along[along_sel] >= strong_threshold)) if np.any(along_sel) else 0.0

    required_ratio = float(cfg_get(config, "thresholds.clutter_alignment_ratio", 0.65))
    required_extent = float(cfg_get(config, "thresholds.clutter_extent_fraction", 0.30))
    if alignment_ratio >= required_ratio and extent_fraction >= required_extent:
        result = "clutter"
        rationale = "Candidate window has a coherent counterpart in the DEM-only cluttergram."
    elif alignment_ratio < 0.25 * required_ratio:
        result = "subsurface"
        rationale = "Candidate window has no meaningful DEM-only cluttergram counterpart."
    else:
        result = "ambiguous"
        rationale = "DEM-only cluttergram has weak or incomplete support in the candidate window."

    payload = result_payload(
        "1_cluttergram",
        result,
        {
            "candidate_peak_power": candidate_peak,
            "background_p95_power": background_peak,
            "alignment_ratio": alignment_ratio,
            "extent_fraction": extent_fraction,
            "candidate_window": window,
        },
        rationale,
    )
    write_json(out / "test1_cluttergram_result.json", payload)
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Test 1: DEM ray-trace cluttergram.")
    parser.add_argument("--config", type=Path, default=Path("config.yaml"))
    args = parser.parse_args()
    payload = run(args.config)
    print(f"Test 1 result: {payload['result']} - {payload['rationale']}")


if __name__ == "__main__":
    main()
