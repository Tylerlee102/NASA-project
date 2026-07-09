from __future__ import annotations

import argparse
import csv
import math
from pathlib import Path

import numpy as np

from reason_common import (
    apparent_depth_from_offset,
    altitude_m,
    cfg_get,
    load_config,
    n_ice,
    output_dir,
    render_line_plot,
    resolve_path,
    result_payload,
    write_csv,
    write_json,
)


def _load_track(path: Path) -> list[dict[str, float]]:
    with path.open("r", newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        rows = []
        for row in reader:
            rows.append(
                {
                    "lat": float(row["lat"]),
                    "lon": float(row["lon"]),
                    "depth_m": float(row["depth_m"]),
                }
            )
        return rows


def _find_crossovers(track_a: list[dict[str, float]], track_b: list[dict[str, float]], tolerance_km: float) -> list[dict[str, float]]:
    if not track_a or not track_b:
        return []
    mean_lat = math.radians(np.mean([row["lat"] for row in track_a + track_b]))
    rows: list[dict[str, float]] = []
    for i, a in enumerate(track_a):
        for j, b in enumerate(track_b):
            dy = 111.32 * (a["lat"] - b["lat"])
            dx = 111.32 * math.cos(mean_lat) * (a["lon"] - b["lon"])
            distance = math.hypot(dx, dy)
            if distance <= tolerance_km:
                rows.append(
                    {
                        "crossover_id": len(rows),
                        "track_a_index": i,
                        "track_b_index": j,
                        "distance_km": distance,
                        "depth_a_m": a["depth_m"],
                        "depth_b_m": b["depth_m"],
                        "delta_depth_m": a["depth_m"] - b["depth_m"],
                    }
                )
    return rows


def _simulate_crossovers(config: dict) -> list[dict[str, float]]:
    rng = np.random.default_rng(int(cfg_get(config, "simulation.random_seed", 7)) + 23)
    count = int(cfg_get(config, "simulation.crossover_count", 12))
    altitude = altitude_m(config)
    ice_index = n_ice(config)
    expected = float(cfg_get(config, "candidate.expected_offset_km", 25.0))
    second = float(cfg_get(config, "simulation.crossover_second_track_offset_km", 34.0))
    resolution = float(cfg_get(config, "blind_zone.range_resolution_m", 30.0))
    rows: list[dict[str, float]] = []

    for idx in range(count):
        phase = 2.0 * math.pi * idx / max(count - 1, 1)
        offset_a = expected + 1.8 * math.sin(phase)
        offset_b = second + 3.5 * math.cos(phase)
        depth_a = float(apparent_depth_from_offset(offset_a * 1000.0, altitude, ice_index))
        depth_b = float(apparent_depth_from_offset(offset_b * 1000.0, altitude, ice_index))
        depth_a += float(rng.normal(0.0, resolution / 5.0))
        depth_b += float(rng.normal(0.0, resolution / 5.0))
        rows.append(
            {
                "crossover_id": idx,
                "track_a_index": idx,
                "track_b_index": idx,
                "distance_km": 0.0,
                "depth_a_m": depth_a,
                "depth_b_m": depth_b,
                "delta_depth_m": depth_a - depth_b,
                "track_a_offset_km": offset_a,
                "track_b_offset_km": offset_b,
            }
        )
    return rows


def run(config_path: Path) -> dict:
    config, resolved_config = load_config(config_path)
    out = output_dir(config, resolved_config)
    track_a_path = resolve_path(resolved_config, cfg_get(config, "paths.track_a_csv"))
    track_b_path = resolve_path(resolved_config, cfg_get(config, "paths.track_b_csv"))

    if track_a_path and track_b_path and track_a_path.exists() and track_b_path.exists():
        tolerance = float(cfg_get(config, "crossovers.tolerance_km", 1.0))
        rows = _find_crossovers(_load_track(track_a_path), _load_track(track_b_path), tolerance)
    else:
        rows = _simulate_crossovers(config)

    write_csv(out / "test3_crossover_depth_discrepancies.csv", rows)
    ids = np.asarray([row["crossover_id"] for row in rows], dtype=float)
    depth_a = np.asarray([row["depth_a_m"] for row in rows], dtype=float)
    depth_b = np.asarray([row["depth_b_m"] for row in rows], dtype=float)
    delta = depth_a - depth_b
    render_line_plot(
        out / "test3_crossover_depths.png",
        ids,
        {"track A depth m": depth_a, "track B depth m": depth_b},
        title="Crossover apparent depths",
    )
    render_line_plot(
        out / "test3_crossover_delta.png",
        ids,
        {"delta depth m": delta},
        hlines=[(0.0, "zero")],
        title="Crossover depth discrepancy",
    )

    resolution = float(cfg_get(config, "blind_zone.range_resolution_m", 30.0))
    consistency_limit = float(cfg_get(config, "thresholds.crossover_consistency_cells", 1.0)) * resolution
    clutter_limit = float(cfg_get(config, "thresholds.crossover_clutter_cells", 3.0)) * resolution
    median_abs_delta = float(np.median(np.abs(delta))) if delta.size else float("nan")

    if median_abs_delta <= consistency_limit:
        result = "subsurface"
        rationale = "Crossover apparent depths agree within the configured range-resolution limit."
    elif median_abs_delta >= clutter_limit:
        result = "clutter"
        rationale = "Crossover apparent depths disagree by several range cells, consistent with view-dependent clutter."
    else:
        result = "ambiguous"
        rationale = "Crossover apparent-depth discrepancies are larger than one cell but not decisive."

    payload = result_payload(
        "3_crossovers",
        result,
        {
            "crossover_count": len(rows),
            "median_abs_delta_m": median_abs_delta,
            "range_resolution_m": resolution,
            "consistency_limit_m": consistency_limit,
            "clutter_limit_m": clutter_limit,
        },
        rationale,
    )
    write_json(out / "test3_crossover_result.json", payload)
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Test 3: crossing-track geometry consistency.")
    parser.add_argument("--config", type=Path, default=Path("config.yaml"))
    args = parser.parse_args()
    payload = run(args.config)
    print(f"Test 3 result: {payload['result']} - {payload['rationale']}")


if __name__ == "__main__":
    main()
