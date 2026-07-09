from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

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
    render_heatmap,
    render_line_plot,
    save_array_pair,
    synthetic_observed_radargram,
    write_csv,
    write_json,
)


def _surface_only_flat_radargram(depth_m: np.ndarray, n_along: int, config: dict) -> np.ndarray:
    blind_zone = float(cfg_get(config, "blind_zone.max_cells", 7.0)) * float(
        cfg_get(config, "blind_zone.range_resolution_m", 30.0)
    )
    radargram = np.zeros((len(depth_m), n_along), dtype=float)
    surface = np.exp(-depth_m[:, None] / max(blind_zone / 2.5, 1.0))
    surface[depth_m[:, None] > blind_zone] *= 0.12
    radargram += 2.5 * surface
    radargram[0, :] += 8.0
    return radargram


def _combine_heatmaps(
    out_path: Path,
    images: list[Path],
    labels: list[str],
) -> None:
    opened = [Image.open(path).convert("RGB") for path in images]
    label_height = 30
    width = sum(image.width for image in opened)
    height = max(image.height for image in opened) + label_height
    canvas = Image.new("RGB", (width, height), (246, 248, 251))
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default()

    x = 0
    for image, label in zip(opened, labels):
        canvas.paste(image, (x, label_height))
        draw.text((x + 10, 9), label, fill=(30, 35, 42), font=font)
        x += image.width
    canvas.save(out_path)


def run(config_path: Path) -> dict:
    config, resolved_config = load_config(config_path)
    out = output_dir(config, resolved_config)
    along_m, cross_m, depth_m = axes_from_config(config)

    terrain_dem = load_or_make_dem(config, resolved_config, along_m, cross_m)
    flat_dem = np.zeros_like(terrain_dem)

    terrain_clutter, _, _ = compute_cluttergram(terrain_dem, along_m, cross_m, depth_m, config)
    flat_clutter, _, _ = compute_cluttergram(flat_dem, along_m, cross_m, depth_m, config)
    terrain_radar = synthetic_observed_radargram(terrain_clutter, depth_m, config)
    flat_radar = synthetic_observed_radargram(flat_clutter, depth_m, config)
    nadir_flat = _surface_only_flat_radargram(depth_m, len(along_m), config)
    enhancement = np.maximum(terrain_radar - flat_radar, 0.0)

    save_array_pair(out / "flat_compare_terrain_radargram", terrain_radar)
    save_array_pair(out / "flat_compare_flat_beam_radargram", flat_radar)
    save_array_pair(out / "flat_compare_nadir_only_flat_radargram", nadir_flat)
    save_array_pair(out / "flat_compare_enhancement", enhancement)

    box = candidate_box(config, along_m, depth_m)
    render_heatmap(out / "flat_compare_terrain_radargram.png", terrain_radar, box=box)
    render_heatmap(out / "flat_compare_flat_beam_radargram.png", flat_radar, box=box)
    render_heatmap(out / "flat_compare_nadir_only_flat_radargram.png", nadir_flat, box=box)
    render_heatmap(out / "flat_compare_enhancement.png", enhancement, box=box)
    _combine_heatmaps(
        out / "flat_compare_side_by_side.png",
        [
            out / "flat_compare_terrain_radargram.png",
            out / "flat_compare_flat_beam_radargram.png",
            out / "flat_compare_nadir_only_flat_radargram.png",
            out / "flat_compare_enhancement.png",
        ],
        [
            "terrain + clutter",
            "flat surface, same beam",
            "flat nadir-only radar",
            "terrain minus flat beam",
        ],
    )

    mean_terrain = np.mean(terrain_radar, axis=1)
    mean_flat = np.mean(flat_radar, axis=1)
    mean_nadir = np.mean(nadir_flat, axis=1)
    mean_enhancement = np.mean(enhancement, axis=1)
    candidate_depth = float(cfg_get(config, "candidate.apparent_depth_m", 440.0))
    render_line_plot(
        out / "flat_compare_depth_profiles.png",
        depth_m,
        {
            "terrain radar mean": mean_terrain,
            "flat beam mean": mean_flat,
            "flat nadir-only mean": mean_nadir,
            "terrain-flat excess": mean_enhancement,
        },
        vlines=[(candidate_depth, "candidate")],
        title="Mean power vs apparent depth",
    )

    window = candidate_window(config)
    mask = candidate_mask(config, along_m, depth_m)
    depth_sel = np.any(mask, axis=1)
    terrain_band = np.mean(terrain_radar[depth_sel, :], axis=0)
    flat_band = np.mean(flat_radar[depth_sel, :], axis=0)
    nadir_band = np.mean(nadir_flat[depth_sel, :], axis=0)
    excess_band = np.maximum(terrain_band - flat_band, 0.0)
    render_line_plot(
        out / "flat_compare_candidate_band_along_track.png",
        along_m / 1000.0,
        {
            "terrain candidate band": terrain_band,
            "flat beam candidate band": flat_band,
            "flat nadir-only band": nadir_band,
            "terrain-flat excess": excess_band,
        },
        vlines=[(window["along_start_km"], "start"), (window["along_end_km"], "end")],
        title="Candidate-depth band power along track",
    )

    band_rows = [
        {
            "along_km": float(along / 1000.0),
            "terrain_candidate_band": float(terrain),
            "flat_beam_candidate_band": float(flat),
            "nadir_only_flat_band": float(nadir),
            "terrain_minus_flat_excess": float(excess),
        }
        for along, terrain, flat, nadir, excess in zip(along_m, terrain_band, flat_band, nadir_band, excess_band)
    ]
    write_csv(out / "flat_compare_candidate_band_along_track.csv", band_rows)

    candidate_values_terrain = terrain_radar[mask]
    candidate_values_flat = flat_radar[mask]
    candidate_values_nadir = nadir_flat[mask]
    terrain_candidate_mean = float(np.mean(candidate_values_terrain))
    flat_candidate_mean = float(np.mean(candidate_values_flat))
    nadir_candidate_mean = float(np.mean(candidate_values_nadir))
    excess_candidate_mean = float(np.mean(np.maximum(candidate_values_terrain - candidate_values_flat, 0.0)))

    payload = {
        "comparison": "terrain radargram vs flat-surface radar baselines",
        "metrics": {
            "candidate_window": window,
            "terrain_candidate_mean_power": terrain_candidate_mean,
            "flat_beam_candidate_mean_power": flat_candidate_mean,
            "flat_nadir_only_candidate_mean_power": nadir_candidate_mean,
            "terrain_minus_flat_candidate_mean_excess": excess_candidate_mean,
            "terrain_to_flat_beam_ratio": terrain_candidate_mean / max(flat_candidate_mean, 1.0e-12),
            "terrain_to_nadir_only_ratio": terrain_candidate_mean / max(nadir_candidate_mean, 1.0e-12),
        },
        "outputs": {
            "side_by_side_png": str(out / "flat_compare_side_by_side.png"),
            "depth_profiles_png": str(out / "flat_compare_depth_profiles.png"),
            "candidate_band_png": str(out / "flat_compare_candidate_band_along_track.png"),
            "candidate_band_csv": str(out / "flat_compare_candidate_band_along_track.csv"),
        },
    }
    write_json(out / "flat_compare_result.json", payload)
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Compare the clutter radargram against flat-radar baselines.")
    parser.add_argument("--config", type=Path, default=Path("config.yaml"))
    args = parser.parse_args()
    payload = run(args.config)
    metrics = payload["metrics"]
    print("Flat radar comparison complete")
    print(f"Terrain / flat-beam candidate ratio: {metrics['terrain_to_flat_beam_ratio']:.3f}")
    print(f"Terrain / nadir-only candidate ratio: {metrics['terrain_to_nadir_only_ratio']:.3f}")


if __name__ == "__main__":
    main()
