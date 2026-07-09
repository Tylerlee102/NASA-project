import argparse
import csv
import math
from pathlib import Path

import numpy as np
from PIL import Image


C = 299_792_458.0


def make_synthetic_dem(along_m, cross_m):
    """Synthetic Europa-like surface: a cross-track curb plus rough terrain."""
    y = along_m[:, None]
    x = cross_m[None, :]

    curb = 110.0 * np.exp(-((x - 25_000.0) / 4_500.0) ** 2)
    ridge = 60.0 * np.exp(-((x + 38_000.0) / 7_000.0) ** 2) * (
        0.5 + 0.5 * np.sin(2.0 * np.pi * y / 45_000.0)
    )
    chaos = 25.0 * np.sin(2.0 * np.pi * x / 9_000.0 + y / 18_000.0)
    chaos *= np.exp(-((x + 5_000.0) / 22_000.0) ** 2)
    return curb + ridge + chaos


def load_dem_csv(path):
    return np.loadtxt(path, delimiter=",")


def save_csv(path, array):
    with path.open("w", newline="") as f:
        writer = csv.writer(f)
        writer.writerows(array)


def render_heatmap(path, array, percentile=99.5):
    data = np.nan_to_num(array, nan=0.0, posinf=0.0, neginf=0.0)
    vmax = float(np.percentile(data, percentile))
    if vmax <= 0.0:
        vmax = 1.0
    scaled = np.clip(data / vmax, 0.0, 1.0)

    # Black-blue-yellow-white heatmap without requiring matplotlib.
    r = np.clip((scaled - 0.25) / 0.50, 0.0, 1.0)
    g = np.clip((scaled - 0.10) / 0.55, 0.0, 1.0)
    b = np.clip(1.0 - (scaled - 0.55) / 0.45, 0.0, 1.0)
    rgb = np.dstack([r, g, b]) * 255.0
    Image.fromarray(rgb.astype(np.uint8)).save(path)


def compute_cluttergram(dem, along_m, cross_m, altitude_m, n_ice, max_depth_m, dz_m, min_offnadir_m):
    n_along = len(along_m)
    n_depth = int(max_depth_m / dz_m) + 1
    clutter = np.zeros((n_depth, n_along), dtype=float)
    phase = np.full((n_depth, n_along), np.nan, dtype=float)

    nadir_index = int(np.argmin(np.abs(cross_m)))
    nadir_height = dem[:, nadir_index]

    for iy in range(n_along):
        surface_range = altitude_m - nadir_height[iy]
        target_range = np.sqrt((altitude_m - dem[iy, :]) ** 2 + cross_m**2)
        apparent_depth = (target_range - surface_range) / n_ice

        # Simple power model: range loss plus a roughness/specularity boost for the curb.
        power = (surface_range / target_range) ** 4
        power *= 1.0 + 0.8 * np.exp(-((cross_m - 25_000.0) / 5_000.0) ** 2)
        power *= np.exp(-np.abs(cross_m) / 90_000.0)

        for ix, depth in enumerate(apparent_depth):
            if abs(cross_m[ix]) < min_offnadir_m:
                continue
            if 0.0 <= depth <= max_depth_m:
                iz = int(round(depth / dz_m))
                clutter[iz, iy] += power[ix]

                # Small-angle interferometric phase proxy: larger for farther off-nadir returns.
                look_angle = math.atan2(float(cross_m[ix]), float(altitude_m - dem[iy, ix]))
                wavelength = C / 60_000_000.0
                baseline_m = 6.0
                ph = (2.0 * math.pi / wavelength) * baseline_m * math.sin(look_angle)
                phase[iz, iy] = ph

    return clutter, phase


def add_blind_zone(radargram, blind_zone_m, dz_m):
    depth_m = np.arange(radargram.shape[0])[:, None] * dz_m
    sidelobe = np.exp(-depth_m / max(blind_zone_m / 2.5, 1.0))
    sidelobe[depth_m > blind_zone_m] *= 0.12
    radargram += 4.0 * sidelobe


def add_true_subsurface_lens(radargram, along_m, depth_m, dz_m):
    lens_center_y = 70_000.0
    lens_width_y = 17_000.0
    lens_depth = 850.0 + 120.0 * np.sin(2.0 * np.pi * along_m / 80_000.0)
    along_weight = np.exp(-((along_m - lens_center_y) / lens_width_y) ** 2)

    for iy, weight in enumerate(along_weight):
        if weight < 0.02:
            continue
        iz = int(round(lens_depth[iy] / dz_m))
        if 0 <= iz < radargram.shape[0]:
            radargram[iz, iy] += 2.5 * weight
            if iz + 1 < radargram.shape[0]:
                radargram[iz + 1, iy] += 1.2 * weight


def summarize(clutter, radargram, phase, dz_m):
    depth_axis = np.arange(clutter.shape[0]) * dz_m
    peak_depth = depth_axis[np.argmax(clutter, axis=0)]
    likely_clutter = np.nanpercentile(peak_depth, [10, 50, 90])

    valid_phase = phase[np.isfinite(phase)]
    phase_deg = np.degrees(valid_phase) if valid_phase.size else np.array([0.0])

    print("Synthetic clutter test complete")
    print(f"Peak clutter apparent depth p10/p50/p90: {likely_clutter[0]:.0f}, {likely_clutter[1]:.0f}, {likely_clutter[2]:.0f} m")
    print(f"Interferometric phase range: {np.nanmin(phase_deg):.1f} to {np.nanmax(phase_deg):.1f} deg")
    print(f"Radargram max power: {float(np.max(radargram)):.3f}")


def main():
    parser = argparse.ArgumentParser(description="Build a simple off-nadir radar cluttergram.")
    parser.add_argument("--dem-csv", type=Path, default=None, help="Optional DEM CSV: rows=along-track, columns=cross-track.")
    parser.add_argument("--out", type=Path, default=Path("clutter_outputs"))
    parser.add_argument("--altitude-km", type=float, default=400.0)
    parser.add_argument("--along-km", type=float, default=120.0)
    parser.add_argument("--cross-track-km", type=float, default=80.0)
    parser.add_argument("--along-step-m", type=float, default=500.0)
    parser.add_argument("--cross-step-m", type=float, default=500.0)
    parser.add_argument("--max-depth-m", type=float, default=3_000.0)
    parser.add_argument("--depth-step-m", type=float, default=15.0)
    parser.add_argument("--min-offnadir-km", type=float, default=15.0)
    parser.add_argument("--n-ice", type=float, default=1.78)
    args = parser.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)

    if args.dem_csv:
        dem = load_dem_csv(args.dem_csv)
        along_m = np.arange(dem.shape[0]) * args.along_step_m
        half_width = 0.5 * (dem.shape[1] - 1) * args.cross_step_m
        cross_m = np.arange(dem.shape[1]) * args.cross_step_m - half_width
    else:
        along_m = np.arange(0.0, args.along_km * 1_000.0 + args.along_step_m, args.along_step_m)
        cross_m = np.arange(
            -args.cross_track_km * 1_000.0,
            args.cross_track_km * 1_000.0 + args.cross_step_m,
            args.cross_step_m,
        )
        dem = make_synthetic_dem(along_m, cross_m)

    clutter, phase = compute_cluttergram(
        dem=dem,
        along_m=along_m,
        cross_m=cross_m,
        altitude_m=args.altitude_km * 1_000.0,
        n_ice=args.n_ice,
        max_depth_m=args.max_depth_m,
        dz_m=args.depth_step_m,
        min_offnadir_m=args.min_offnadir_km * 1_000.0,
    )

    radargram = 0.7 * clutter.copy()
    blind_zone_m = 7.0 * 30.0
    add_blind_zone(radargram, blind_zone_m, args.depth_step_m)
    add_true_subsurface_lens(radargram, along_m, args.max_depth_m, args.depth_step_m)

    save_csv(args.out / "dem.csv", dem)
    save_csv(args.out / "cluttergram.csv", clutter)
    save_csv(args.out / "radargram_with_clutter_and_lens.csv", radargram)
    save_csv(args.out / "interferometric_phase_rad.csv", np.nan_to_num(phase, nan=0.0))

    render_heatmap(args.out / "cluttergram.png", clutter)
    render_heatmap(args.out / "radargram_with_clutter_and_lens.png", radargram)
    render_heatmap(args.out / "interferometric_phase_abs.png", np.abs(np.nan_to_num(phase, nan=0.0)))

    summarize(clutter, radargram, phase, args.depth_step_m)
    print(f"Outputs written to: {args.out.resolve()}")


if __name__ == "__main__":
    main()
