from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np

from reason_common import cfg_get, load_config, output_dir, render_line_plot, result_payload, write_csv, write_json


def _scr_curve(depth_m: np.ndarray, resolution_m: float, blind_cells: float, weak_power: float) -> np.ndarray:
    cells = depth_m / resolution_m
    envelope = 0.68 * np.exp(-cells / 1.8) + 0.04 / (1.0 + cells)
    envelope = np.where(cells > blind_cells, envelope * 0.18, envelope)
    return 10.0 * np.log10(weak_power / np.maximum(envelope, 1.0e-12))


def run(config_path: Path) -> dict:
    config, resolved_config = load_config(config_path)
    out = output_dir(config, resolved_config)

    max_depth = float(cfg_get(config, "geometry.max_depth_m", 3000.0))
    depth_m = np.linspace(1.0, max_depth, 500)
    vhf_resolution = float(cfg_get(config, "blind_zone.range_resolution_m", 30.0))
    hf_resolution = float(cfg_get(config, "blind_zone.hf_range_resolution_m", 300.0))
    blind_cells = float(cfg_get(config, "blind_zone.max_cells", 7.0))
    weak_power = float(cfg_get(config, "blind_zone.weak_reflector_power", 0.35))
    threshold = float(cfg_get(config, "thresholds.detection_scr_db", 6.0))
    candidate_depth = float(cfg_get(config, "candidate.apparent_depth_m", 440.0))

    vhf_scr = _scr_curve(depth_m, vhf_resolution, blind_cells, weak_power)
    hf_scr = _scr_curve(depth_m, hf_resolution, blind_cells, weak_power)
    candidate_scr = float(np.interp(candidate_depth, depth_m, vhf_scr))
    blind_depth_m = blind_cells * vhf_resolution

    rows = [
        {"depth_m": float(depth), "vhf_scr_db": float(vhf), "hf_scr_db": float(hf)}
        for depth, vhf, hf in zip(depth_m, vhf_scr, hf_scr)
    ]
    write_csv(out / "test4_blind_zone_scr.csv", rows)
    render_line_plot(
        out / "test4_blind_zone_scr.png",
        depth_m,
        {"VHF SCR dB": vhf_scr, "HF SCR dB": hf_scr},
        hlines=[(threshold, "detect")],
        vlines=[(candidate_depth, "candidate"), (blind_depth_m, "7 cells VHF")],
        title="Injected-reflector SCR vs depth",
    )

    if candidate_scr < threshold:
        result = "clutter"
        rationale = "Candidate depth is below the configured detection SCR threshold."
    else:
        result = "subsurface"
        rationale = "Candidate depth is outside the measured VHF blind zone and detectable in principle."

    payload = result_payload(
        "4_blind_zone",
        result,
        {
            "candidate_depth_m": candidate_depth,
            "candidate_vhf_scr_db": candidate_scr,
            "detection_threshold_db": threshold,
            "vhf_blind_zone_depth_m": blind_depth_m,
            "vhf_range_resolution_m": vhf_resolution,
            "blind_zone_cells": blind_cells,
        },
        rationale,
    )
    write_json(out / "test4_blind_zone_result.json", payload)
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Test 4: blind-zone characterization.")
    parser.add_argument("--config", type=Path, default=Path("config.yaml"))
    args = parser.parse_args()
    payload = run(args.config)
    print(f"Test 4 result: {payload['result']} - {payload['rationale']}")


if __name__ == "__main__":
    main()
