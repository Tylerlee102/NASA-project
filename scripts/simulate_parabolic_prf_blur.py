"""Europa-like radargram simulation for parabolic flyby PRF folding.

This script writes a PNG image only. It generates a numeric radar power array
first, then renders that array in a black/white radargram style similar to
planetary radargrams: bright rough surface trace, faint internal layer, and
middle-pass blurring where PRF/Doppler folding risk is highest.

Educational stress test only. This is not a NASA flight product or a full
radar processing model.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "outputs" / "europa_prf_fix_test_radargrams.png"

PARAMS = {
    "closest_altitude_km": 25.0,
    "edge_altitude_km": 1000.0,
    "edge_along_track_km": 500.0,
    "flyby_speed_km_s": 4.6,
    "frequency_mhz": 60.0,
    "ice_refractive_index": 1.78,
    "target_depth_km": 6.0,
    "safety_factor": 1.25,
    "effective_prf_hz": 2207.35,
    "surface_roughness": 1.0,
    "clutter_suppression_db": 0.0,
    "jovian_noise_db": 0.0,
}

REASON_PRESETS = {
    "vhf": {
        "frequency_mhz": 60.0,
        "vertical_resolution_m": 30.0,
        "note": "REASON-like VHF shallow sounding: 60 MHz, 5 m wavelength.",
    },
    "hf": {
        "frequency_mhz": 9.0,
        "vertical_resolution_m": 300.0,
        "note": "REASON-like HF deep sounding: 9 MHz, 33.3 m wavelength.",
    },
}


def load_optional_matlab_data(path: Path | None) -> dict[str, np.ndarray | float]:
    """Load optional .npz or .mat variables.

    The repo currently has no MATLAB files. If MATLAB data is added later,
    easiest path is exporting variables to .npz with names like x_km,
    altitude_km, flyby_speed_km_s, wavelength_m, and effective_prf_hz.
    """

    if path is None:
        return {}
    if not path.exists():
        raise FileNotFoundError(path)
    if path.suffix.lower() == ".npz":
        raw = np.load(path)
        return {key: np.asarray(raw[key]).squeeze() for key in raw.files}
    if path.suffix.lower() == ".mat":
        try:
            from scipy.io import loadmat  # type: ignore
        except ModuleNotFoundError as exc:
            raise RuntimeError(
                "This Python runtime does not have scipy for .mat files. "
                "Export MATLAB variables to .npz or install scipy."
            ) from exc
        raw = loadmat(path)
        return {key: np.asarray(value).squeeze() for key, value in raw.items() if not key.startswith("__")}
    raise ValueError("Optional external data must be .npz or .mat")


def scalar(data: dict[str, np.ndarray | float], key: str, fallback: float) -> float:
    if key not in data:
        return fallback
    return float(np.asarray(data[key]).squeeze())


def wavelength_from_frequency_mhz(frequency_mhz: float) -> float:
    """Return free-space wavelength in meters for a radar center frequency."""

    c_m_s = 299_792_458.0
    return c_m_s / (frequency_mhz * 1_000_000.0)


def get_track(data: dict[str, np.ndarray | float]) -> tuple[np.ndarray, np.ndarray]:
    if "x_km" in data and "altitude_km" in data:
        x_km = np.asarray(data["x_km"], dtype=float).squeeze()
        altitude_km = np.asarray(data["altitude_km"], dtype=float).squeeze()
        if x_km.ndim != 1 or altitude_km.ndim != 1 or len(x_km) != len(altitude_km):
            raise ValueError("x_km and altitude_km must be same-length 1D arrays")
        return x_km, altitude_km

    x_edge = scalar(data, "edge_along_track_km", PARAMS["edge_along_track_km"])
    x_km = np.linspace(-x_edge, x_edge, 1401)
    h0 = scalar(data, "closest_altitude_km", PARAMS["closest_altitude_km"])
    h_edge = scalar(data, "edge_altitude_km", PARAMS["edge_altitude_km"])
    altitude_km = h0 + (h_edge - h0) * (x_km / x_edge) ** 2
    return x_km, altitude_km


def gaussian_kernel(radius: int, sigma: float) -> np.ndarray:
    offsets = np.arange(-radius, radius + 1, dtype=float)
    kernel = np.exp(-(offsets**2) / (2.0 * sigma**2))
    return kernel / kernel.sum()


def smooth_1d(values: np.ndarray, radius: int, sigma: float) -> np.ndarray:
    return np.convolve(values, gaussian_kernel(radius, sigma), mode="same")


def blur_array(data: np.ndarray, radius_x: int, sigma_x: float, radius_y: int, sigma_y: float) -> np.ndarray:
    kx = gaussian_kernel(radius_x, sigma_x)
    ky = gaussian_kernel(radius_y, sigma_y)
    tmp = np.apply_along_axis(lambda row: np.convolve(row, kx, mode="same"), 1, data)
    return np.apply_along_axis(lambda col: np.convolve(col, ky, mode="same"), 0, tmp)


def smoothstep(values: np.ndarray) -> np.ndarray:
    values = np.clip(values, 0.0, 1.0)
    return values * values * (3.0 - 2.0 * values)


def compute_prf_risk(x_km: np.ndarray, altitude_km: np.ndarray, data: dict[str, np.ndarray | float]) -> dict[str, np.ndarray | float]:
    speed_m_s = scalar(data, "flyby_speed_km_s", PARAMS["flyby_speed_km_s"]) * 1000.0
    frequency_mhz = scalar(data, "frequency_mhz", PARAMS["frequency_mhz"])
    wavelength_m = wavelength_from_frequency_mhz(frequency_mhz)
    ice_n = scalar(data, "ice_refractive_index", PARAMS["ice_refractive_index"])
    target_depth_km = scalar(data, "target_depth_km", PARAMS["target_depth_km"])
    safety_factor = scalar(data, "safety_factor", PARAMS["safety_factor"])
    effective_prf_hz = scalar(data, "effective_prf_hz", PARAMS["effective_prf_hz"])

    # Same-delay clutter geometry for the selected subsurface depth.
    # A nadir subsurface target at depth d has an added optical path n*d.
    # Surface clutter with slant range h + n*d lands in the same delay bin.
    same_delay_range_km = altitude_km + ice_n * target_depth_km
    sin_theta = np.sqrt(np.maximum(same_delay_range_km**2 - altitude_km**2, 0.0)) / same_delay_range_km

    max_doppler_hz = 2.0 * speed_m_s * sin_theta / wavelength_m
    required_prf_hz = 2.0 * max_doppler_hz * safety_factor
    margin = effective_prf_hz / np.maximum(required_prf_hz, 1.0)

    # Risk is strongest below margin 1.0 and fades through the warning band.
    risk = smoothstep((1.25 - margin) / 0.55)
    risk = smooth_1d(risk, radius=42, sigma=17.0)
    risk = np.clip(risk, 0.0, 1.0)

    return {
        "target_depth_km": target_depth_km,
        "frequency_mhz": frequency_mhz,
        "wavelength_m": wavelength_m,
        "required_prf_hz": required_prf_hz,
        "effective_prf_hz": effective_prf_hz,
        "margin": margin,
        "risk": risk,
    }


def make_radar_power(data: dict[str, np.ndarray | float]) -> dict[str, np.ndarray | float]:
    rng = np.random.default_rng(20260707)
    x_km, altitude_km = get_track(data)
    prf = compute_prf_risk(x_km, altitude_km, data)
    target_depth_km = float(prf["target_depth_km"])
    risk = np.asarray(prf["risk"])
    surface_roughness = max(0.0, scalar(data, "surface_roughness", PARAMS["surface_roughness"]))
    clutter_suppression_db = max(0.0, scalar(data, "clutter_suppression_db", PARAMS["clutter_suppression_db"]))
    jovian_noise_db = max(0.0, scalar(data, "jovian_noise_db", PARAMS["jovian_noise_db"]))
    clutter_suppression = 10.0 ** (-clutter_suppression_db / 10.0)
    jovian_noise_gain = 10.0 ** (jovian_noise_db / 20.0)

    width = len(x_km)
    height = 430
    y = np.arange(height, dtype=float)[:, None]

    # Raw radargram display coordinate. The spacecraft is lowest at the middle,
    # so the surface delay is smallest there and appears higher in the image.
    altitude_norm = (altitude_km - altitude_km.min()) / max(float(altitude_km.max() - altitude_km.min()), 1e-9)
    surface_y = 56.0 + 122.0 * altitude_norm

    # Add rough terrain-like relief to make the surface echo resemble a real
    # radargram trace rather than a smooth math curve.
    terrain = (
        8.5 * surface_roughness * np.sin(2 * np.pi * (x_km + 40.0) / 210.0)
        + 5.0 * surface_roughness * np.sin(2 * np.pi * x_km / 74.0)
        + 2.8 * surface_roughness * np.sin(2 * np.pi * x_km / 28.0)
    )
    terrain += smooth_1d(rng.normal(0.0, 2.1 * surface_roughness, width), radius=8, sigma=3.0)
    surface_y = np.clip(surface_y + terrain, 34.0, 205.0)

    # The target layer follows the same raw-delay surface trend, because it is
    # a fixed depth below the local surface in this display.
    depth_scale_px_per_km = 15.0
    layer_y = surface_y + target_depth_km * depth_scale_px_per_km
    basal_y = surface_y + 11.5 * depth_scale_px_per_km

    power = np.zeros((height, width), dtype=float)

    # Receiver background, range fading, and old-looking radar speckle.
    power += 0.018 * jovian_noise_gain * rng.random((height, width))
    power += 0.018 * jovian_noise_gain * rng.normal(size=(height, width))

    # Strong rough surface echo.
    surface_sigma = 2.0 + 1.2 * (0.5 + 0.5 * np.sin(x_km / 34.0))
    surface_power = 1.25 * np.exp(-((y - surface_y[None, :]) ** 2) / (2.0 * surface_sigma[None, :] ** 2))
    power += surface_power

    # Surface clutter tail below the bright surface, giving the radargram the
    # grainy vertical haze seen in real radar images.
    below_surface = np.maximum(y - surface_y[None, :], 0.0)
    clutter_tail = (0.22 + 0.12 * surface_roughness) * np.exp(-below_surface / 34.0) * (y > surface_y[None, :])
    clutter_tail *= 0.50 + 0.50 * rng.random((height, width))
    power += clutter_tail

    # Thin true subsurface reflector.
    layer_power = 0.20 * np.exp(-((y - layer_y[None, :]) ** 2) / (2.0 * 2.6**2))
    power += layer_power

    # Weak lower interface, just for visual context.
    basal_power = 0.055 * np.exp(-((y - basal_y[None, :]) ** 2) / (2.0 * 5.8**2))
    power += basal_power

    # PRF folding: surface clutter aliases into the same subsurface depth bin.
    # This is deliberately rendered as a blurred band/bar near the layer depth,
    # strongest around closest approach where margin is lowest.
    display_gain = 0.58 + 0.42 * risk
    folded_sigma_y = 10.0 + 10.0 * risk
    folded = 0.72 * risk[None, :] * display_gain[None, :] * surface_roughness * clutter_suppression
    folded = folded * np.exp(-((y - layer_y[None, :]) ** 2) / (2.0 * folded_sigma_y[None, :] ** 2))
    folded *= 0.78 + 0.22 * rng.random((height, width))
    power += folded

    # Blur only the full image enough to look like range/azimuth processing,
    # while keeping the surface echo recognizably sharp.
    power = blur_array(power, radius_x=3, sigma_x=1.2, radius_y=1, sigma_y=0.65)
    power += 0.10 * surface_power

    power = np.clip(power, 0.0, None)
    power = power / np.percentile(power, 99.65)
    power = np.clip(power, 0.0, 1.0)
    power = power**0.72

    return {
        "x_km": x_km,
        "altitude_km": altitude_km,
        "surface_y": surface_y,
        "layer_y": layer_y,
        "power": power,
        "depth_scale_px_per_km": depth_scale_px_per_km,
        "surface_roughness": surface_roughness,
        "clutter_suppression_db": clutter_suppression_db,
        "jovian_noise_db": jovian_noise_db,
        **prf,
    }


def render(sim: dict[str, np.ndarray | float], output: Path) -> None:
    x_km = np.asarray(sim["x_km"])
    power = np.asarray(sim["power"])
    layer_y = np.asarray(sim["layer_y"])
    depth_scale_px_per_km = float(sim["depth_scale_px_per_km"])
    margin = np.asarray(sim["margin"])
    required_prf = np.asarray(sim["required_prf_hz"])
    effective_prf_hz = float(sim["effective_prf_hz"])
    target_depth_km = float(sim["target_depth_km"])

    # Convert simulated power to black/white radargram pixels.
    img_arr = np.uint8(np.clip(power * 255.0, 0, 255))
    img = Image.fromarray(img_arr, mode="L").convert("RGB")
    img = img.filter(ImageFilter.UnsharpMask(radius=1.1, percent=95, threshold=2))

    # Add a small white/black border and simple radargram annotations.
    pad_left, pad_top, pad_right, pad_bottom = 70, 38, 34, 64
    canvas = Image.new("RGB", (img.width + pad_left + pad_right, img.height + pad_top + pad_bottom), "#080808")
    canvas.paste(img, (pad_left, pad_top))
    draw = ImageDraw.Draw(canvas, "RGBA")

    fonts = Path("C:/Windows/Fonts")
    label_font = ImageFont.truetype(str(fonts / "segoeui.ttf"), 16) if (fonts / "segoeui.ttf").exists() else ImageFont.load_default()
    bold_font = ImageFont.truetype(str(fonts / "segoeuib.ttf"), 17) if (fonts / "segoeuib.ttf").exists() else ImageFont.load_default()
    small_font = ImageFont.truetype(str(fonts / "segoeui.ttf"), 14) if (fonts / "segoeui.ttf").exists() else ImageFont.load_default()

    plot = (pad_left, pad_top, pad_left + img.width, pad_top + img.height)
    draw.rectangle(plot, outline=(230, 230, 230, 210), width=1)

    def x_to_px(value: float) -> float:
        return plot[0] + (value - float(x_km.min())) / float(x_km.max() - x_km.min()) * (plot[2] - plot[0])

    center_idx = int(np.argmin(np.abs(x_km)))
    center_x_px = x_to_px(0.0)
    center_layer_y = plot[1] + float(layer_y[center_idx])

    # Yellow depth marker like the user's reference image.
    marker_color = (225, 230, 77, 245)
    draw.line((center_x_px, center_layer_y - 56, center_x_px, center_layer_y + 56), fill=marker_color, width=3)
    draw.line((center_x_px - 8, center_layer_y, center_x_px + 8, center_layer_y), fill=marker_color, width=2)
    draw.text((center_x_px + 10, center_layer_y + 6), f"{target_depth_km:.0f} km layer", fill=marker_color, font=bold_font, anchor="la")
    draw.text((center_x_px + 10, center_layer_y + 30), "blur strongest here", fill=marker_color, font=small_font, anchor="la")

    # Scale bar in the upper-right. Lengths are tied to the simulated axes.
    horizontal_scale_km = 100.0
    vertical_scale_km = 1.0
    horizontal_scale_px = (horizontal_scale_km / float(x_km.max() - x_km.min())) * (plot[2] - plot[0])
    vertical_scale_px = vertical_scale_km * depth_scale_px_per_km
    scale_x = plot[2] - int(horizontal_scale_px) - 65
    scale_y = plot[1] + 24
    draw.line((scale_x, scale_y, scale_x + horizontal_scale_px, scale_y), fill=(245, 245, 245, 240), width=3)
    draw.line(
        (scale_x + horizontal_scale_px, scale_y, scale_x + horizontal_scale_px, scale_y + vertical_scale_px),
        fill=(245, 245, 245, 240),
        width=3,
    )
    draw.text((scale_x + horizontal_scale_px, scale_y - 6), "100 km", fill=(245, 245, 245, 240), font=small_font, anchor="rb")
    draw.text((scale_x + horizontal_scale_px + 7, scale_y + vertical_scale_px), "1 km", fill=(245, 245, 245, 240), font=small_font, anchor="lm")

    min_idx = int(np.argmin(margin))
    min_x_km = 0.0 if abs(float(x_km[min_idx])) < 0.5 else float(x_km[min_idx])
    caption_1 = (
        f"Parabolic flyby simulation: PRF margin is lowest at x={min_x_km:.0f} km "
        f"({margin[min_idx]:.2f}x)."
    )
    caption_2 = (
        f"At the {target_depth_km:.0f} km delay bin, required PRF {required_prf[min_idx]:.0f} Hz "
        f"> usable PRF {effective_prf_hz:.0f} Hz, so folded clutter becomes a blurred band."
    )
    draw.text((plot[0], plot[3] + 18), caption_1, fill=(230, 230, 230, 235), font=label_font, anchor="la")
    draw.text((plot[0], plot[3] + 42), caption_2, fill=(190, 190, 190, 235), font=label_font, anchor="la")

    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output)


def render_comparison(scenarios: list[tuple[str, dict[str, np.ndarray | float]]], output: Path) -> None:
    """Render a 2x2 fix-test sheet from simulated radargram arrays."""

    panel_w, panel_h = 1050, 380
    margin_x, margin_y = 70, 115
    gap_x, gap_y = 55, 72
    footer_h = 90
    width = margin_x * 2 + panel_w * 2 + gap_x
    height = margin_y + panel_h * 2 + gap_y + footer_h

    canvas = Image.new("RGB", (width, height), "#080808")
    draw = ImageDraw.Draw(canvas, "RGBA")
    fonts = Path("C:/Windows/Fonts")
    title_font = ImageFont.truetype(str(fonts / "segoeuib.ttf"), 32) if (fonts / "segoeuib.ttf").exists() else ImageFont.load_default()
    label_font = ImageFont.truetype(str(fonts / "segoeui.ttf"), 17) if (fonts / "segoeui.ttf").exists() else ImageFont.load_default()
    bold_font = ImageFont.truetype(str(fonts / "segoeuib.ttf"), 18) if (fonts / "segoeuib.ttf").exists() else ImageFont.load_default()
    small_font = ImageFont.truetype(str(fonts / "segoeui.ttf"), 14) if (fonts / "segoeui.ttf").exists() else ImageFont.load_default()

    draw.text((width // 2, 34), "Europa-Like PRF Folding Fix Test", fill=(245, 245, 245, 245), font=title_font, anchor="mt")
    draw.text(
        (width // 2, 75),
        "Each panel is a simulated radar power array. The center blur changes only when the model parameters change.",
        fill=(190, 190, 190, 245),
        font=label_font,
        anchor="mt",
    )

    def make_panel_image(sim: dict[str, np.ndarray | float], size: tuple[int, int]) -> Image.Image:
        power = np.asarray(sim["power"])
        img_arr = np.uint8(np.clip(power * 255.0, 0, 255))
        img = Image.fromarray(img_arr, mode="L").convert("RGB")
        img = img.filter(ImageFilter.UnsharpMask(radius=1.1, percent=95, threshold=2))
        return img.resize(size, Image.Resampling.BICUBIC)

    for index, (label, sim) in enumerate(scenarios[:4]):
        col = index % 2
        row = index // 2
        x0 = margin_x + col * (panel_w + gap_x)
        y0 = margin_y + row * (panel_h + gap_y)
        plot = (x0, y0 + 44, x0 + panel_w, y0 + panel_h)
        plot_w = plot[2] - plot[0]
        plot_h = plot[3] - plot[1]

        x_km = np.asarray(sim["x_km"])
        layer_y = np.asarray(sim["layer_y"])
        margin = np.asarray(sim["margin"])
        required_prf = np.asarray(sim["required_prf_hz"])
        effective_prf_hz = float(sim["effective_prf_hz"])
        frequency_mhz = float(sim["frequency_mhz"])
        wavelength_m = float(sim["wavelength_m"])
        suppression_db = float(sim["clutter_suppression_db"])
        target_depth_km = float(sim["target_depth_km"])

        radar_img = make_panel_image(sim, (plot_w, plot_h))
        canvas.paste(radar_img, (plot[0], plot[1]))
        draw.rectangle(plot, outline=(230, 230, 230, 210), width=1)

        min_idx = int(np.argmin(margin))
        status = "FAIL" if margin[min_idx] < 1.0 else ("WARNING" if margin[min_idx] < 1.25 else "SAFE")
        status_color = (240, 95, 95, 245) if status == "FAIL" else ((255, 217, 92, 245) if status == "WARNING" else (166, 220, 140, 245))
        title = f"{label} | {status}"
        draw.text((x0, y0 + 4), title, fill=(245, 245, 245, 245), font=bold_font, anchor="la")
        sub = (
            f"{frequency_mhz:g} MHz, lambda {wavelength_m:.1f} m, min margin {margin[min_idx]:.2f}x, "
            f"req PRF {required_prf[min_idx]:.0f} Hz, usable {effective_prf_hz:.0f} Hz"
        )
        if suppression_db:
            sub += f", clutter suppression {suppression_db:.0f} dB"
        draw.text((x0, y0 + 27), sub, fill=status_color, font=small_font, anchor="la")

        # Mark closest approach and the target depth bin.
        center_px = plot[0] + (0.0 - float(x_km.min())) / float(x_km.max() - x_km.min()) * plot_w
        layer_px_raw = float(layer_y[int(np.argmin(np.abs(x_km)))])
        layer_px = plot[1] + layer_px_raw / np.asarray(sim["power"]).shape[0] * plot_h
        marker_color = (225, 230, 77, 230)
        draw.line((center_px, plot[1], center_px, plot[3]), fill=(255, 255, 255, 70), width=1)
        draw.line((center_px, layer_px - 28, center_px, layer_px + 28), fill=marker_color, width=2)
        draw.line((center_px - 7, layer_px, center_px + 7, layer_px), fill=marker_color, width=2)
        draw.text((center_px + 9, layer_px + 4), f"{target_depth_km:.0f} km", fill=marker_color, font=small_font, anchor="la")

    draw.text(
        (width // 2, height - 52),
        "More realistic Europa anchors used: 25 km closest approach, REASON-like 60 MHz VHF / 9 MHz HF, and same-delay surface clutter into a 6 km bin.",
        fill=(225, 225, 225, 235),
        font=label_font,
        anchor="mm",
    )
    draw.text(
        (width // 2, height - 25),
        "Still simplified: the surface texture, clutter strength, PRF window, and suppression dB are adjustable assumptions, not official mission products.",
        fill=(170, 170, 170, 235),
        font=label_font,
        anchor="mm",
    )

    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="PNG output path")
    parser.add_argument("--matlab-data", type=Path, default=None, help="Optional .npz or .mat input file")
    parser.add_argument("--mode", choices=["vhf", "hf"], default="vhf", help="REASON-like radar band preset")
    parser.add_argument("--frequency-mhz", type=float, default=None, help="Override center frequency in MHz")
    parser.add_argument("--closest-altitude-km", type=float, default=PARAMS["closest_altitude_km"])
    parser.add_argument("--edge-altitude-km", type=float, default=PARAMS["edge_altitude_km"])
    parser.add_argument("--edge-along-track-km", type=float, default=PARAMS["edge_along_track_km"])
    parser.add_argument("--flyby-speed-km-s", type=float, default=PARAMS["flyby_speed_km_s"])
    parser.add_argument("--target-depth-km", type=float, default=PARAMS["target_depth_km"])
    parser.add_argument("--effective-prf-hz", type=float, default=PARAMS["effective_prf_hz"])
    parser.add_argument("--safety-factor", type=float, default=PARAMS["safety_factor"])
    parser.add_argument("--surface-roughness", type=float, default=PARAMS["surface_roughness"])
    parser.add_argument("--clutter-suppression-db", type=float, default=PARAMS["clutter_suppression_db"])
    parser.add_argument("--jovian-noise-db", type=float, default=PARAMS["jovian_noise_db"])
    parser.add_argument(
        "--single",
        action="store_true",
        help="Write one radargram instead of the default four-panel fix comparison.",
    )
    return parser.parse_args()


def data_from_args(args: argparse.Namespace, external: dict[str, np.ndarray | float]) -> dict[str, np.ndarray | float]:
    data = dict(external)
    preset = REASON_PRESETS[args.mode]
    data.update(
        {
            "closest_altitude_km": args.closest_altitude_km,
            "edge_altitude_km": args.edge_altitude_km,
            "edge_along_track_km": args.edge_along_track_km,
            "flyby_speed_km_s": args.flyby_speed_km_s,
            "frequency_mhz": args.frequency_mhz if args.frequency_mhz is not None else preset["frequency_mhz"],
            "ice_refractive_index": PARAMS["ice_refractive_index"],
            "target_depth_km": args.target_depth_km,
            "safety_factor": args.safety_factor,
            "effective_prf_hz": args.effective_prf_hz,
            "surface_roughness": args.surface_roughness,
            "clutter_suppression_db": args.clutter_suppression_db,
            "jovian_noise_db": args.jovian_noise_db,
        }
    )
    return data


def make_fix_scenarios(base_data: dict[str, np.ndarray | float]) -> list[tuple[str, dict[str, np.ndarray | float]]]:
    """Create a small mitigation suite for the user's PRF-folding problem."""

    scenarios: list[tuple[str, dict[str, np.ndarray | float]]] = []
    scenarios.append(("Baseline VHF", make_radar_power(base_data)))

    higher_prf = dict(base_data)
    higher_prf["effective_prf_hz"] = max(4500.0, scalar(base_data, "effective_prf_hz", PARAMS["effective_prf_hz"]) * 1.75)
    scenarios.append(("Fix: higher usable PRF", make_radar_power(higher_prf)))

    suppressed = dict(base_data)
    suppressed["clutter_suppression_db"] = max(12.0, scalar(base_data, "clutter_suppression_db", 0.0) + 12.0)
    scenarios.append(("Fix: clutter suppression", make_radar_power(suppressed)))

    hf = dict(base_data)
    hf["frequency_mhz"] = REASON_PRESETS["hf"]["frequency_mhz"]
    hf["jovian_noise_db"] = max(6.0, scalar(base_data, "jovian_noise_db", 0.0))
    scenarios.append(("Fix/test: HF band", make_radar_power(hf)))
    return scenarios


def main() -> None:
    args = parse_args()
    external = load_optional_matlab_data(args.matlab_data)
    data = data_from_args(args, external)
    if args.single:
        sim = make_radar_power(data)
        render(sim, args.output)
    else:
        render_comparison(make_fix_scenarios(data), args.output)
    print(args.output)


if __name__ == "__main__":
    main()
