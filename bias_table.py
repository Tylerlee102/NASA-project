from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np

from reason_common import (
    apparent_depth_from_offset,
    axes_from_config,
    altitude_m,
    cfg_get,
    load_config,
    load_or_make_dem,
    n_ice,
    output_dir,
    render_line_plot,
    required_offset_for_depth,
    result_payload,
    write_csv,
    write_json,
)


def run(config_path: Path) -> dict:
    config, resolved_config = load_config(config_path)
    out = output_dir(config, resolved_config)
    along_m, cross_m, _ = axes_from_config(config)
    dem = load_or_make_dem(config, resolved_config, along_m, cross_m)

    altitude = altitude_m(config)
    ice_index = n_ice(config)
    candidate_depth = float(cfg_get(config, "candidate.apparent_depth_m", 440.0))
    required_offset_m = required_offset_for_depth(candidate_depth, altitude, ice_index)
    required_offset_km = required_offset_m / 1000.0
    beam_half_angle = math.radians(float(cfg_get(config, "geometry.beam_half_angle_deg", 5.0)))
    beam_limit_km = altitude * math.tan(beam_half_angle) / 1000.0

    max_offset_km = max(float(cfg_get(config, "geometry.cross_track_km", 80.0)), required_offset_km + 10.0)
    offsets_km = np.arange(0.0, max_offset_km + 0.001, 5.0)
    depths_m = apparent_depth_from_offset(offsets_km * 1000.0, altitude, ice_index)
    rows = [
        {"offset_km": float(offset), "apparent_depth_m": float(depth)}
        for offset, depth in zip(offsets_km, depths_m)
    ]
    write_csv(out / "test5_bias_table.csv", rows)

    start = float(cfg_get(config, "candidate.along_start_km", 10.0)) * 1000.0
    end = float(cfg_get(config, "candidate.along_end_km", 110.0)) * 1000.0
    along_sel = (along_m >= start) & (along_m <= end)
    if not np.any(along_sel):
        along_sel = np.ones_like(along_m, dtype=bool)

    tolerance_km = float(cfg_get(config, "candidate.offset_tolerance_km", 6.0))
    feature_threshold_m = float(cfg_get(config, "thresholds.dem_feature_relief_m", 35.0))
    candidates = []
    for sign in (1.0, -1.0):
        target = sign * required_offset_m
        cross_sel = np.abs(cross_m - target) <= tolerance_km * 1000.0
        if not np.any(cross_sel):
            relief = 0.0
            mean_height = float("nan")
        else:
            patch = dem[np.ix_(along_sel, cross_sel)]
            relief = float(np.max(patch) - np.min(patch))
            mean_height = float(np.mean(patch))
        candidates.append(
            {
                "side": "positive" if sign > 0.0 else "negative",
                "target_offset_km": sign * required_offset_km,
                "relief_m": relief,
                "mean_height_m": mean_height,
            }
        )
    write_csv(out / "test5_dem_lookup.csv", candidates)

    mean_profile = np.mean(dem[along_sel, :], axis=0)
    render_line_plot(
        out / "test5_dem_cross_section.png",
        cross_m / 1000.0,
        {"mean DEM height m": mean_profile},
        vlines=[(required_offset_km, "+required"), (-required_offset_km, "-required")],
        title="Candidate-offset DEM lookup",
    )

    best = max(candidates, key=lambda item: item["relief_m"])
    in_beam = required_offset_km <= beam_limit_km
    if in_beam and best["relief_m"] >= feature_threshold_m:
        result = "clutter"
        rationale = "A DEM feature exists at the lateral offset required by the observed apparent depth."
    elif not in_beam:
        result = "subsurface"
        rationale = "The required lateral offset is outside the configured antenna beam footprint."
    else:
        result = "subsurface"
        rationale = "No DEM feature exceeded the relief threshold at the required lateral offset."

    payload = result_payload(
        "5_bias_table",
        result,
        {
            "candidate_depth_m": candidate_depth,
            "required_offset_km": required_offset_km,
            "beam_limit_km": beam_limit_km,
            "best_feature_side": best["side"],
            "best_feature_relief_m": best["relief_m"],
            "feature_threshold_m": feature_threshold_m,
            "in_beam": in_beam,
        },
        rationale,
    )
    write_json(out / "test5_bias_table_result.json", payload)
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Test 5: range/height bias correction and DEM lookup.")
    parser.add_argument("--config", type=Path, default=Path("config.yaml"))
    args = parser.parse_args()
    payload = run(args.config)
    print(f"Test 5 result: {payload['result']} - {payload['rationale']}")


if __name__ == "__main__":
    main()
