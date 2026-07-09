from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from plot_clean_question_graphs import COLORS, FONT_LG, FONT_MD, FONT_SM, center_text, chart
from reason_common import C_M_PER_S


PARAMS = Path("paper_data/reason_instrument_parameters.json")
OUT = Path("offnadir_wave_prediction_graphs")


def apparent_depth_m(altitude_km: float, along_km: np.ndarray, cross_track_km: float, n_ice: float) -> np.ndarray:
    h = altitude_km * 1000.0
    along = along_km * 1000.0
    cross = cross_track_km * 1000.0
    slant = np.sqrt(h * h + along * along + cross * cross)
    return (slant - h) / n_ice


def two_way_extra_delay_us(altitude_km: float, along_km: np.ndarray, cross_track_km: float) -> np.ndarray:
    h = altitude_km * 1000.0
    along = along_km * 1000.0
    cross = cross_track_km * 1000.0
    slant = np.sqrt(h * h + along * along + cross * cross)
    return 2.0 * (slant - h) / C_M_PER_S * 1.0e6


def relative_power_db(altitude_km: float, along_km: np.ndarray, cross_track_km: float) -> np.ndarray:
    h = altitude_km * 1000.0
    along = along_km * 1000.0
    cross = cross_track_km * 1000.0
    slant = np.sqrt(h * h + along * along + cross * cross)
    slant_min = np.sqrt(h * h + cross * cross)
    ratio = (slant_min / slant) ** 4
    return 10.0 * np.log10(np.maximum(ratio, 1.0e-12))


def vhf_interferometric_phase_deg(
    altitude_km: float,
    along_km: np.ndarray,
    cross_track_km: float,
    baseline_m: float,
    wavelength_m: float,
) -> np.ndarray:
    h = altitude_km * 1000.0
    along = along_km * 1000.0
    cross = cross_track_km * 1000.0
    slant = np.sqrt(h * h + along * along + cross * cross)
    sin_cross_look = cross / slant
    phase_rad = (2.0 * math.pi / wavelength_m) * baseline_m * sin_cross_look
    return np.degrees(phase_rad)


def wrapped_phase_deg(phase_deg: np.ndarray) -> np.ndarray:
    return ((phase_deg + 180.0) % 360.0) - 180.0


def predicted_radargram(path: Path, along_km: np.ndarray, depth_m: np.ndarray, power_db: np.ndarray) -> None:
    width, height = 1400, 900
    left, right, top, bottom = 215, 85, 105, 135
    plot_left, plot_right = left, width - right
    plot_top, plot_bottom = top, height - bottom
    image = Image.new("RGB", (width, height), (250, 251, 252))
    draw = ImageDraw.Draw(image)
    draw.rectangle([plot_left, plot_top, plot_right, plot_bottom], fill=(255, 255, 255), outline=(84, 94, 108), width=2)

    x_min, x_max = float(along_km.min()), float(along_km.max())
    y_min, y_max = 0.0, 3200.0

    def px(value: float) -> int:
        return int(plot_left + (value - x_min) / (x_max - x_min) * (plot_right - plot_left))

    def py(value: float) -> int:
        return int(plot_top + (value - y_min) / (y_max - y_min) * (plot_bottom - plot_top))

    for value in np.linspace(x_min, x_max, 7):
        x = px(float(value))
        draw.line([x, plot_top, x, plot_bottom], fill=(224, 229, 236), width=1)
        center_text(draw, (x, plot_bottom + 31), f"{value:.0f}", (55, 65, 81), FONT_SM)

    for value in np.linspace(y_min, y_max, 5):
        y = py(float(value))
        draw.line([plot_left, y, plot_right, y], fill=(224, 229, 236), width=1)
        draw.text((80, y - 11), f"{value:.0f}", fill=(55, 65, 81), font=FONT_SM)

    # Draw a thick predicted echo trace. Brighter near closest approach.
    p_norm = (power_db - power_db.min()) / max(float(power_db.max() - power_db.min()), 1.0e-9)
    points = [(px(float(x)), py(float(y))) for x, y in zip(along_km, depth_m)]
    for idx in range(len(points) - 1):
        brightness = int(80 + 155 * p_norm[idx])
        color = (brightness, max(40, brightness - 70), 40)
        draw.line([points[idx], points[idx + 1]], fill=color, width=7)

    draw.text((left, 37), "Predicted radargram trace for a 25 km off-nadir surface echo", fill=(20, 29, 44), font=FONT_LG)
    center_text(draw, ((plot_left + plot_right) // 2, height - 58), "Spacecraft motion left-to-right along track (km)", (31, 41, 55), FONT_MD)

    label_layer = Image.new("RGBA", (700, 70), (0, 0, 0, 0))
    label_draw = ImageDraw.Draw(label_layer)
    label_draw.text((0, 16), "Apparent depth / late echo (m)", fill=(31, 41, 55), font=FONT_MD)
    rotated = label_layer.rotate(270, expand=True)
    image.paste(rotated, (20, (height - rotated.height) // 2), rotated)

    draw.text((plot_left + 26, plot_top + 26), "darker = weaker return; brighter = stronger return", fill=(31, 41, 55), font=FONT_SM)
    image.save(path)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    data = json.loads(PARAMS.read_text(encoding="utf-8"))
    vhf = data["radar_system_actuals_table_7"]["vhf"]
    shared = data["radar_system_actuals_table_7"]["shared"]

    n_ice = 1.78
    cross_track_km = 25.0
    baseline_m = 5.0
    vhf_wavelength_m = float(vhf["wavelength_m"])
    along_km = np.linspace(-60.0, 60.0, 601)
    altitudes = [25.0, 400.0, 1000.0]

    depth_series = {
        f"{altitude:g} km altitude": apparent_depth_m(altitude, along_km, cross_track_km, n_ice)
        for altitude in altitudes
    }
    depth_400 = apparent_depth_m(400.0, along_km, cross_track_km, n_ice)
    chart(
        OUT / "00_representative_400km_offnadir_apparent_depth.png",
        along_km,
        {"400 km altitude, 25 km off nadir": depth_400},
        title="Representative prediction: off-nadir echo curves as spacecraft moves",
        x_label="Along-track position relative to closest approach (km)",
        y_label="Apparent depth in ice (m)",
        xlim=(-60, 60),
        ylim=(0, 3200),
        hlines=[(float(depth_400[len(depth_400) // 2]), "closest approach depth")],
        vlines=[(0, "closest approach")],
    )

    chart(
        OUT / "01_offnadir_apparent_depth_vs_along_track.png",
        along_km,
        depth_series,
        title="Altitude changes how deep the same off-nadir echo appears",
        x_label="Along-track position relative to closest approach (km)",
        y_label="Apparent depth in ice (m)",
        xlim=(-60, 60),
        ylim=(0, 26000),
        vlines=[(0, "closest approach")],
    )

    delay_series = {
        f"{altitude:g} km altitude": two_way_extra_delay_us(altitude, along_km, cross_track_km)
        for altitude in altitudes
    }
    chart(
        OUT / "02_offnadir_extra_echo_delay_vs_along_track.png",
        along_km,
        delay_series,
        title="Off-nadir wave path is longer, so the echo arrives late",
        x_label="Along-track position relative to closest approach (km)",
        y_label="Extra two-way travel time (microseconds)",
        xlim=(-60, 60),
        ylim=(0, 155),
        vlines=[(0, "closest approach")],
    )

    power_series = {
        f"{altitude:g} km altitude": relative_power_db(altitude, along_km, cross_track_km)
        for altitude in altitudes
    }
    chart(
        OUT / "03_offnadir_return_power_vs_along_track.png",
        along_km,
        power_series,
        title="Return power peaks near closest approach and weakens away from it",
        x_label="Along-track position relative to closest approach (km)",
        y_label="Relative echo power (dB from closest approach)",
        xlim=(-60, 60),
        ylim=(-12, 1),
        vlines=[(0, "closest approach")],
    )

    phase_unwrapped = vhf_interferometric_phase_deg(
        400.0,
        along_km,
        cross_track_km,
        baseline_m,
        vhf_wavelength_m,
    )
    chart(
        OUT / "04_vhf_interferometric_phase_vs_along_track.png",
        along_km,
        {
            "VHF phase, 400 km altitude": phase_unwrapped,
            "wrapped measured phase": wrapped_phase_deg(phase_unwrapped),
        },
        title="VHF interferometry predicts nonzero phase for off-nadir clutter",
        x_label="Along-track position relative to closest approach (km)",
        y_label="Interferometric phase (degrees)",
        xlim=(-60, 60),
        ylim=(0, 26),
        hlines=[(0, "nadir/subsurface would be near 0")],
        vlines=[(0, "closest approach")],
    )

    power_400 = relative_power_db(400.0, along_km, cross_track_km)
    predicted_radargram(
        OUT / "05_predicted_offnadir_radargram_trace_400km.png",
        along_km,
        depth_400,
        power_400,
    )

    prf = np.linspace(shared["pulse_repetition_frequency_min_hz"], shared["pulse_repetition_frequency_max_hz"], 600)
    pulse_spacing_ms = 1000.0 / prf
    echo_time_400_ms = 2.0 * 400_000.0 / C_M_PER_S * 1000.0
    chart(
        OUT / "06_prf_vs_400km_echo_time_context.png",
        prf,
        {"time between transmitted pulses": pulse_spacing_ms},
        title="At high PRF, another pulse can be sent before a 400 km echo returns",
        x_label="PRF from paper range (Hz)",
        y_label="Time between pulses (ms)",
        xlim=(50, 3000),
        ylim=(0, 22),
        hlines=[(echo_time_400_ms, "400 km nadir echo time")],
    )

    summary = {
        "source_paper_values": str(PARAMS.resolve()),
        "model_assumptions": {
            "offnadir_cross_track_offset_km": cross_track_km,
            "ice_refractive_index": n_ice,
            "vhf_wavelength_m_from_paper": vhf_wavelength_m,
            "interferometry_baseline_m": baseline_m,
            "altitudes_km_shown": altitudes,
            "representative_interferometry_altitude_km": 400,
        },
        "plain_answer": "If the reflecting feature is off nadir, the radar wave travels a longer slant path than a nadir echo. As the spacecraft moves left-to-right, the off-nadir echo appears as a curved/U-shaped false subsurface reflector, arrives late, has nonzero VHF interferometric phase, and is strongest near closest approach.",
        "graphs": [str(path.resolve()) for path in sorted(OUT.glob("*.png"))],
    }
    (OUT / "offnadir_wave_prediction_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
