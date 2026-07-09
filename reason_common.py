from __future__ import annotations

import csv
import json
import math
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw, ImageFont


C_M_PER_S = 299_792_458.0


def _parse_scalar(value: str) -> Any:
    value = value.strip()
    if not value:
        return ""
    if value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    low = value.lower()
    if low in {"true", "false"}:
        return low == "true"
    if low in {"none", "null"}:
        return None
    if value.startswith("[") and value.endswith("]"):
        inner = value[1:-1].strip()
        if not inner:
            return []
        return [_parse_scalar(part) for part in inner.split(",")]
    number = value.replace("_", "")
    try:
        if any(ch in number for ch in ".eE"):
            return float(number)
        return int(number)
    except ValueError:
        return value


def load_config(config_path: str | Path) -> tuple[dict[str, Any], Path]:
    """Load the small YAML subset used by this project without PyYAML."""
    path = Path(config_path).resolve()
    root: dict[str, Any] = {}
    stack: list[tuple[int, dict[str, Any]]] = [(-1, root)]

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.split("#", 1)[0].rstrip()
        if not line.strip():
            continue
        indent = len(line) - len(line.lstrip(" "))
        if ":" not in line:
            raise ValueError(f"Invalid config line: {raw_line}")
        key, value = line.strip().split(":", 1)
        while indent <= stack[-1][0]:
            stack.pop()
        parent = stack[-1][1]
        if value.strip():
            parent[key] = _parse_scalar(value)
        else:
            child: dict[str, Any] = {}
            parent[key] = child
            stack.append((indent, child))
    return root, path


def cfg_get(config: dict[str, Any], dotted: str, default: Any = None) -> Any:
    current: Any = config
    for part in dotted.split("."):
        if not isinstance(current, dict) or part not in current:
            return default
        current = current[part]
    return current


def resolve_path(config_path: Path, maybe_path: str | None) -> Path | None:
    if not maybe_path:
        return None
    path = Path(maybe_path)
    if path.is_absolute():
        return path
    return (config_path.parent / path).resolve()


def output_dir(config: dict[str, Any], config_path: Path) -> Path:
    out = resolve_path(config_path, cfg_get(config, "paths.output_dir", "reason_outputs"))
    assert out is not None
    out.mkdir(parents=True, exist_ok=True)
    return out


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")


def write_csv(path: Path, rows: list[dict[str, Any]] | np.ndarray, header: list[str] | None = None) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        if isinstance(rows, np.ndarray):
            writer = csv.writer(handle)
            writer.writerows(rows)
            return

        if header is None:
            header = list(rows[0].keys()) if rows else []
        writer = csv.DictWriter(handle, fieldnames=header)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def read_array(path: Path) -> np.ndarray:
    if path.suffix.lower() == ".npy":
        return np.load(path)
    return np.loadtxt(path, delimiter=",")


def save_array_pair(base_path: Path, array: np.ndarray) -> None:
    np.save(base_path.with_suffix(".npy"), array)
    write_csv(base_path.with_suffix(".csv"), array)


def axes_from_config(config: dict[str, Any]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    along_step = float(cfg_get(config, "geometry.along_step_m", 500.0))
    cross_step = float(cfg_get(config, "geometry.cross_step_m", 500.0))
    depth_step = float(cfg_get(config, "geometry.depth_step_m", 15.0))
    along_km = float(cfg_get(config, "geometry.along_km", 120.0))
    cross_km = float(cfg_get(config, "geometry.cross_track_km", 80.0))
    max_depth = float(cfg_get(config, "geometry.max_depth_m", 3000.0))

    along_m = np.arange(0.0, along_km * 1000.0 + along_step, along_step)
    cross_m = np.arange(-cross_km * 1000.0, cross_km * 1000.0 + cross_step, cross_step)
    depth_m = np.arange(0.0, max_depth + depth_step, depth_step)
    return along_m, cross_m, depth_m


def make_synthetic_dem(along_m: np.ndarray, cross_m: np.ndarray) -> np.ndarray:
    """Synthetic icy-moon terrain with a clutter-producing off-nadir ridge."""
    y = along_m[:, None]
    x = cross_m[None, :]

    ridge = 115.0 * np.exp(-((x - 25_000.0) / 4_500.0) ** 2)
    scallop = 70.0 * np.exp(-((x + 38_000.0) / 7_000.0) ** 2)
    scallop = scallop * (0.55 + 0.45 * np.sin(2.0 * np.pi * y / 45_000.0))
    chaos = 24.0 * np.sin(2.0 * np.pi * x / 9_000.0 + y / 18_000.0)
    chaos *= np.exp(-((x + 5_000.0) / 22_000.0) ** 2)
    along_bulge = 18.0 * np.sin(2.0 * np.pi * y / 70_000.0)
    return ridge + scallop + chaos + along_bulge


def load_or_make_dem(
    config: dict[str, Any],
    config_path: Path,
    along_m: np.ndarray,
    cross_m: np.ndarray,
) -> np.ndarray:
    dem_path = resolve_path(config_path, cfg_get(config, "paths.dem_csv"))
    if dem_path and dem_path.exists():
        return read_array(dem_path)
    return make_synthetic_dem(along_m, cross_m)


def altitude_m(config: dict[str, Any]) -> float:
    return float(cfg_get(config, "geometry.altitude_km", 400.0)) * 1000.0


def n_ice(config: dict[str, Any]) -> float:
    return float(cfg_get(config, "geometry.n_ice", 1.78))


def wavelength_m(config: dict[str, Any]) -> float:
    explicit = cfg_get(config, "geometry.wavelength_m")
    if explicit:
        return float(explicit)
    frequency_hz = float(cfg_get(config, "geometry.frequency_hz", 33_000_000.0))
    return C_M_PER_S / frequency_hz


def candidate_mask(
    config: dict[str, Any],
    along_m: np.ndarray,
    depth_m: np.ndarray,
) -> np.ndarray:
    start = float(cfg_get(config, "candidate.along_start_km", 10.0)) * 1000.0
    end = float(cfg_get(config, "candidate.along_end_km", 110.0)) * 1000.0
    center = float(cfg_get(config, "candidate.apparent_depth_m", 440.0))
    tol = float(cfg_get(config, "candidate.depth_tolerance_m", 80.0))
    along_sel = (along_m >= start) & (along_m <= end)
    depth_sel = np.abs(depth_m - center) <= tol
    return depth_sel[:, None] & along_sel[None, :]


def candidate_window(config: dict[str, Any]) -> dict[str, float]:
    return {
        "along_start_km": float(cfg_get(config, "candidate.along_start_km", 10.0)),
        "along_end_km": float(cfg_get(config, "candidate.along_end_km", 110.0)),
        "apparent_depth_m": float(cfg_get(config, "candidate.apparent_depth_m", 440.0)),
        "depth_tolerance_m": float(cfg_get(config, "candidate.depth_tolerance_m", 80.0)),
    }


def apparent_depth_from_offset(offset_m: np.ndarray | float, altitude: float, ice_index: float) -> np.ndarray | float:
    return (np.sqrt(altitude * altitude + np.asarray(offset_m) ** 2) - altitude) / ice_index


def required_offset_for_depth(depth_m: float, altitude: float, ice_index: float) -> float:
    return float(np.sqrt((altitude + depth_m * ice_index) ** 2 - altitude * altitude))


def compute_surface_normals(dem: np.ndarray, along_m: np.ndarray, cross_m: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    d_along, d_cross = np.gradient(dem, along_m, cross_m, edge_order=1)
    nx = -d_cross
    ny = -d_along
    nz = np.ones_like(dem)
    norm = np.sqrt(nx * nx + ny * ny + nz * nz)
    return nx / norm, ny / norm, nz / norm


def compute_cluttergram(
    dem: np.ndarray,
    along_m: np.ndarray,
    cross_m: np.ndarray,
    depth_m: np.ndarray,
    config: dict[str, Any],
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    altitude = altitude_m(config)
    ice_index = n_ice(config)
    depth_step = float(depth_m[1] - depth_m[0])
    beam_half_angle = math.radians(float(cfg_get(config, "geometry.beam_half_angle_deg", 5.0)))
    min_offnadir = float(cfg_get(config, "geometry.min_offnadir_km", 5.0)) * 1000.0
    baseline = float(cfg_get(config, "geometry.baseline_m", 5.0))
    wave = wavelength_m(config)

    n_depth = len(depth_m)
    n_along = len(along_m)
    clutter = np.zeros((n_depth, n_along), dtype=float)
    phase_sum = np.zeros_like(clutter)
    offset_sum = np.zeros_like(clutter)
    weight_sum = np.zeros_like(clutter)

    grid_cross, grid_along = np.meshgrid(cross_m, along_m)
    nx, ny, nz = compute_surface_normals(dem, along_m, cross_m)
    nadir_index = int(np.argmin(np.abs(cross_m)))

    for pulse_index, spacecraft_y in enumerate(along_m):
        surface_range = altitude - dem[pulse_index, nadir_index]
        dx = grid_cross
        dy = grid_along - spacecraft_y
        dz = altitude - dem
        horizontal = np.sqrt(dx * dx + dy * dy)
        slant = np.sqrt(horizontal * horizontal + dz * dz)
        depth = (slant - surface_range) / ice_index
        look = np.arctan2(horizontal, dz)

        ray_x = -dx / slant
        ray_y = -dy / slant
        ray_z = dz / slant
        incidence = np.maximum(nx * ray_x + ny * ray_y + nz * ray_z, 0.0)
        roughness = 1.0 + 45.0 * np.sqrt(np.gradient(dem, axis=1) ** 2)
        power = ((surface_range / slant) ** 4) * (incidence ** 2.0) * roughness
        power *= np.exp(-horizontal / 95_000.0)

        valid = (
            (look <= beam_half_angle)
            & (horizontal >= min_offnadir)
            & (depth >= 0.0)
            & (depth <= depth_m[-1])
            & (power > 0.0)
        )
        if not np.any(valid):
            continue

        bins = np.rint(depth[valid] / depth_step).astype(int)
        bins = np.clip(bins, 0, n_depth - 1)
        weights = power[valid]
        cross_offsets = dx[valid]
        sin_theta = np.clip(cross_offsets / slant[valid], -1.0, 1.0)
        phase = (2.0 * math.pi / wave) * baseline * sin_theta

        np.add.at(clutter[:, pulse_index], bins, weights)
        np.add.at(phase_sum[:, pulse_index], bins, weights * phase)
        np.add.at(offset_sum[:, pulse_index], bins, weights * cross_offsets)
        np.add.at(weight_sum[:, pulse_index], bins, weights)

    phase_map = np.full_like(clutter, np.nan)
    offset_map = np.full_like(clutter, np.nan)
    weighted = weight_sum > 0.0
    phase_map[weighted] = phase_sum[weighted] / weight_sum[weighted]
    offset_map[weighted] = offset_sum[weighted] / weight_sum[weighted]
    return clutter, phase_map, offset_map


def synthetic_observed_radargram(
    clutter: np.ndarray,
    depth_m: np.ndarray,
    config: dict[str, Any],
) -> np.ndarray:
    rng = np.random.default_rng(int(cfg_get(config, "simulation.random_seed", 7)))
    radargram = 0.9 * clutter.copy()
    blind_zone = float(cfg_get(config, "blind_zone.max_cells", 7.0)) * float(
        cfg_get(config, "blind_zone.range_resolution_m", 30.0)
    )
    surface = np.exp(-depth_m[:, None] / max(blind_zone / 2.5, 1.0))
    surface[depth_m[:, None] > blind_zone] *= 0.12
    radargram += 2.5 * surface
    radargram += rng.normal(0.0, 0.015, size=radargram.shape)
    np.maximum(radargram, 0.0, out=radargram)
    return radargram


def render_heatmap(path: Path, array: np.ndarray, percentile: float = 99.5, box: dict[str, float] | None = None) -> None:
    data = np.nan_to_num(array, nan=0.0, posinf=0.0, neginf=0.0)
    vmax = float(np.percentile(data, percentile))
    if vmax <= 0.0:
        vmax = 1.0
    scaled = np.clip(data / vmax, 0.0, 1.0)

    r = np.clip((scaled - 0.20) / 0.50, 0.0, 1.0)
    g = np.clip((scaled - 0.08) / 0.55, 0.0, 1.0)
    b = np.clip(1.0 - (scaled - 0.55) / 0.45, 0.0, 1.0)
    rgb = (np.dstack([r, g, b]) * 255.0).astype(np.uint8)
    image = Image.fromarray(rgb).resize((rgb.shape[1] * 3, rgb.shape[0] * 3), Image.Resampling.NEAREST)

    if box:
        draw = ImageDraw.Draw(image)
        width, height = image.size
        x0 = int(max(0.0, min(1.0, box["x0"])) * (width - 1))
        x1 = int(max(0.0, min(1.0, box["x1"])) * (width - 1))
        y0 = int(max(0.0, min(1.0, box["y0"])) * (height - 1))
        y1 = int(max(0.0, min(1.0, box["y1"])) * (height - 1))
        draw.rectangle([x0, y0, x1, y1], outline=(255, 80, 80), width=3)
    image.save(path)


def candidate_box(config: dict[str, Any], along_m: np.ndarray, depth_m: np.ndarray) -> dict[str, float]:
    window = candidate_window(config)
    x0 = (window["along_start_km"] * 1000.0 - along_m[0]) / (along_m[-1] - along_m[0])
    x1 = (window["along_end_km"] * 1000.0 - along_m[0]) / (along_m[-1] - along_m[0])
    y0 = (window["apparent_depth_m"] - window["depth_tolerance_m"] - depth_m[0]) / (depth_m[-1] - depth_m[0])
    y1 = (window["apparent_depth_m"] + window["depth_tolerance_m"] - depth_m[0]) / (depth_m[-1] - depth_m[0])
    return {"x0": x0, "x1": x1, "y0": y0, "y1": y1}


def render_line_plot(
    path: Path,
    x: np.ndarray,
    series: dict[str, np.ndarray],
    *,
    hlines: list[tuple[float, str]] | None = None,
    vlines: list[tuple[float, str]] | None = None,
    title: str = "",
) -> None:
    width, height = 980, 560
    margin_left, margin_right, margin_top, margin_bottom = 74, 28, 42, 70
    image = Image.new("RGB", (width, height), (250, 251, 252))
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default()

    values = [np.asarray(x, dtype=float)]
    values.extend(np.asarray(y, dtype=float) for y in series.values())
    if hlines:
        values.extend(np.asarray([value], dtype=float) for value, _ in hlines)
    all_y = np.concatenate([arr.ravel() for arr in values[1:] if arr.size])
    x_min, x_max = float(np.min(x)), float(np.max(x))
    y_min, y_max = float(np.min(all_y)), float(np.max(all_y))
    if math.isclose(y_min, y_max):
        y_min -= 1.0
        y_max += 1.0
    y_pad = 0.08 * (y_max - y_min)
    y_min -= y_pad
    y_max += y_pad

    def px(x_value: float) -> int:
        return int(margin_left + (x_value - x_min) / (x_max - x_min) * (width - margin_left - margin_right))

    def py(y_value: float) -> int:
        return int(height - margin_bottom - (y_value - y_min) / (y_max - y_min) * (height - margin_top - margin_bottom))

    plot_left, plot_top = margin_left, margin_top
    plot_right, plot_bottom = width - margin_right, height - margin_bottom
    draw.rectangle([plot_left, plot_top, plot_right, plot_bottom], outline=(120, 128, 140), width=1)

    for frac in np.linspace(0.0, 1.0, 6):
        gx = int(plot_left + frac * (plot_right - plot_left))
        gy = int(plot_bottom - frac * (plot_bottom - plot_top))
        draw.line([gx, plot_top, gx, plot_bottom], fill=(225, 229, 235))
        draw.line([plot_left, gy, plot_right, gy], fill=(225, 229, 235))

    palette = [(23, 92, 170), (194, 79, 50), (54, 133, 84), (120, 73, 170)]
    for idx, (name, y) in enumerate(series.items()):
        points = [(px(float(xv)), py(float(yv))) for xv, yv in zip(x, y)]
        if len(points) > 1:
            draw.line(points, fill=palette[idx % len(palette)], width=3)
        draw.text((margin_left + 12, margin_top + 12 + idx * 18), name, fill=palette[idx % len(palette)], font=font)

    if hlines:
        for value, label in hlines:
            ypix = py(value)
            draw.line([plot_left, ypix, plot_right, ypix], fill=(150, 72, 72), width=2)
            draw.text((plot_right - 170, ypix - 16), label, fill=(120, 50, 50), font=font)
    if vlines:
        for value, label in vlines:
            xpix = px(value)
            draw.line([xpix, plot_top, xpix, plot_bottom], fill=(80, 80, 80), width=2)
            draw.text((xpix + 6, plot_top + 8), label, fill=(55, 55, 55), font=font)

    if title:
        draw.text((margin_left, 14), title, fill=(30, 35, 42), font=font)
    draw.text((margin_left, height - 44), f"x: {x_min:.1f} to {x_max:.1f}", fill=(50, 55, 65), font=font)
    draw.text((12, margin_top), f"y: {y_min:.1f} to {y_max:.1f}", fill=(50, 55, 65), font=font)
    image.save(path)


def circular_mean(phases: np.ndarray, weights: np.ndarray | None = None) -> float:
    phases = np.asarray(phases, dtype=float)
    if weights is None:
        weights = np.ones_like(phases)
    z = np.sum(weights * np.exp(1j * phases))
    return float(np.angle(z))


def result_payload(test: str, result: str, metrics: dict[str, Any], rationale: str) -> dict[str, Any]:
    return {"test": test, "result": result, "metrics": metrics, "rationale": rationale}
