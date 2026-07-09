from __future__ import annotations

import csv
import json
import math
from pathlib import Path

import numpy as np

from parabolic_flyby_common import altitude_profile_km, vertical_speed_km_s
from plot_clean_question_graphs import chart
from plot_nadir_offnadir_bar_charts import grouped_bar_chart
from reason_common import C_M_PER_S


OUT = Path("doppler_prf_graphs")


def slant_range_m(along_km: np.ndarray, altitude_km: float, cross_track_km: float) -> np.ndarray:
    altitude_m = np.asarray(altitude_km, dtype=float) * 1000.0
    along_m = along_km * 1000.0
    cross_m = cross_track_km * 1000.0
    return np.sqrt(altitude_m**2 + along_m**2 + cross_m**2)


def radial_velocity_m_s(
    along_km: np.ndarray,
    altitude_km: np.ndarray,
    cross_track_km: float,
    spacecraft_speed_km_s: float,
    vertical_speed_km_s: np.ndarray,
) -> np.ndarray:
    along = np.asarray(along_km, dtype=float)
    altitude = np.asarray(altitude_km, dtype=float)
    vertical_speed = np.asarray(vertical_speed_km_s, dtype=float)
    slant_km = slant_range_m(along, altitude, cross_track_km) / 1000.0
    return 1000.0 * (along * spacecraft_speed_km_s + altitude * vertical_speed) / slant_km


def doppler_hz(
    along_km: np.ndarray,
    altitude_km: np.ndarray,
    cross_track_km: float,
    spacecraft_speed_km_s: float,
    vertical_speed_km_s: np.ndarray,
    wavelength_m: float,
) -> np.ndarray:
    # Monostatic radar Doppler. Sign flips as the spacecraft passes closest approach.
    radial_velocity = radial_velocity_m_s(along_km, altitude_km, cross_track_km, spacecraft_speed_km_s, vertical_speed_km_s)
    return -2.0 * radial_velocity / wavelength_m


def unambiguous_range_km(prf_hz: np.ndarray) -> np.ndarray:
    return C_M_PER_S / (2.0 * prf_hz) / 1000.0


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    closest_altitude_km = 400.0
    altitude_rise_at_edge_km = 4.0
    cross_track_km = 25.0
    spacecraft_speed_km_s = 4.0
    hf_wavelength_m = 33.3
    vhf_wavelength_m = 5.0
    prf_min_hz = 50.0
    prf_max_hz = 3000.0

    along_km = np.linspace(-60.0, 60.0, 601)
    altitude_km = altitude_profile_km(along_km, closest_altitude_km, altitude_rise_at_edge_km)
    vertical_speed = vertical_speed_km_s(along_km, spacecraft_speed_km_s, altitude_rise_at_edge_km)
    hf_doppler = doppler_hz(along_km, altitude_km, cross_track_km, spacecraft_speed_km_s, vertical_speed, hf_wavelength_m)
    vhf_doppler = doppler_hz(along_km, altitude_km, cross_track_km, spacecraft_speed_km_s, vertical_speed, vhf_wavelength_m)
    max_hf_doppler = float(np.nanmax(np.abs(hf_doppler)))
    max_vhf_doppler = float(np.nanmax(np.abs(vhf_doppler)))

    chart(
        OUT / "01_doppler_shift_vs_satellite_motion.png",
        along_km,
        {
            "HF 9 MHz Doppler": hf_doppler,
            "VHF 60 MHz Doppler": vhf_doppler,
        },
        title="Parabolic flyby Doppler shifts sign at closest approach",
        x_label="Satellite position left-to-right past feature (km)",
        y_label="Doppler shift (Hz)",
        xlim=(-60, 60),
        ylim=(-500, 500),
        vlines=[(0, "closest")],
        hlines=[(0, "zero Doppler")],
    )

    positions_km = np.asarray([0.0, 30.0, 60.0])
    positions_altitude_km = altitude_profile_km(positions_km, closest_altitude_km, altitude_rise_at_edge_km)
    positions_vertical_speed = vertical_speed_km_s(positions_km, spacecraft_speed_km_s, altitude_rise_at_edge_km)
    groups = ["closest\n0 km", "30 km\naway", "60 km\naway"]
    hf_abs = np.abs(doppler_hz(positions_km, positions_altitude_km, cross_track_km, spacecraft_speed_km_s, positions_vertical_speed, hf_wavelength_m))
    vhf_abs = np.abs(doppler_hz(positions_km, positions_altitude_km, cross_track_km, spacecraft_speed_km_s, positions_vertical_speed, vhf_wavelength_m))
    grouped_bar_chart(
        OUT / "02_doppler_shift_bar_comparison.png",
        groups,
        {
            "HF": list(hf_abs),
            "VHF": list(vhf_abs),
        },
        title="VHF Doppler is larger because VHF wavelength is shorter",
        y_label="Absolute Doppler shift (Hz)",
        note="At the bottom of this symmetric parabola, range rate is zero, so Doppler is near zero.",
    )

    prf = np.linspace(prf_min_hz, prf_max_hz, 500)
    nyquist = prf / 2.0
    chart(
        OUT / "03_prf_doppler_sampling_limit.png",
        prf,
        {"PRF/2 Doppler sampling limit": nyquist},
        title="PRF must be high enough to sample Doppler without aliasing",
        x_label="Pulse repetition frequency, PRF (Hz)",
        y_label="Unambiguous Doppler half-bandwidth (Hz)",
        xlim=(prf_min_hz, prf_max_hz),
        ylim=(0, 1600),
        hlines=[
            (max_hf_doppler, "max HF Doppler"),
            (max_vhf_doppler, "max VHF Doppler"),
        ],
    )

    prf_choices = np.asarray([50.0, 500.0, 3000.0])
    grouped_bar_chart(
        OUT / "04_prf_choices_vs_vhf_doppler_requirement.png",
        ["50 Hz", "500 Hz", "3000 Hz"],
        {
            "PRF/2 limit": list(prf_choices / 2.0),
            "max VHF Doppler": [max_vhf_doppler] * 3,
        },
        title="Low PRF can alias VHF Doppler; higher PRF samples it cleanly",
        y_label="Doppler bandwidth (Hz)",
        note="For this parabolic 4 km/s case, VHF needs PRF above about 890 Hz for this +/-60 km aperture.",
    )

    along_spacing_m = spacecraft_speed_km_s * 1000.0 / prf
    chart(
        OUT / "05_prf_vs_along_track_spacing.png",
        prf,
        {"pulse spacing along track": along_spacing_m},
        title="Higher PRF gives denser along-track measurements",
        x_label="Pulse repetition frequency, PRF (Hz)",
        y_label="Along-track pulse spacing (m)",
        xlim=(prf_min_hz, prf_max_hz),
        ylim=(0, 90),
    )

    grouped_bar_chart(
        OUT / "06_prf_choices_along_track_spacing_bar.png",
        ["50 Hz", "500 Hz", "3000 Hz"],
        {"pulse spacing": list(spacecraft_speed_km_s * 1000.0 / prf_choices)},
        title="Pulse spacing for common PRF choices",
        y_label="Along-track spacing between pulses (m)",
        note="This uses an illustrative 4 km/s spacecraft speed.",
    )

    range_km = unambiguous_range_km(prf)
    chart(
        OUT / "07_prf_vs_unambiguous_range.png",
        prf,
        {"simple unambiguous range": range_km},
        title="Higher PRF shortens the simple unambiguous range",
        x_label="Pulse repetition frequency, PRF (Hz)",
        y_label="Simple unambiguous range (km)",
        xlim=(prf_min_hz, prf_max_hz),
        ylim=(0, 3200),
        hlines=[(closest_altitude_km, "400 km closest altitude")],
    )

    round_trip_time_s = 2.0 * closest_altitude_km * 1000.0 / C_M_PER_S
    grouped_bar_chart(
        OUT / "08_prf_pulses_in_air_bar.png",
        ["50 Hz", "500 Hz", "3000 Hz"],
        {"pulses launched before nadir echo returns": list(prf_choices * round_trip_time_s)},
        title="High PRF means multiple pulses can be in the air",
        y_label="Pulses in air before 400 km nadir echo returns",
        note="The REASON paper notes PRF is planned with echo timing and can have more than one pulse in air.",
    )

    with (OUT / "doppler_prf_values.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "position_km",
                "parabolic_altitude_km",
                "parabolic_vertical_speed_km_s",
                "hf_doppler_hz",
                "vhf_doppler_hz",
                "hf_abs_doppler_hz",
                "vhf_abs_doppler_hz",
            ],
        )
        writer.writeheader()
        for idx, x in enumerate(along_km):
            writer.writerow(
                {
                    "position_km": f"{x:.3f}",
                    "parabolic_altitude_km": f"{altitude_km[idx]:.6f}",
                    "parabolic_vertical_speed_km_s": f"{vertical_speed[idx]:.9f}",
                    "hf_doppler_hz": f"{hf_doppler[idx]:.6f}",
                    "vhf_doppler_hz": f"{vhf_doppler[idx]:.6f}",
                    "hf_abs_doppler_hz": f"{abs(hf_doppler[idx]):.6f}",
                    "vhf_abs_doppler_hz": f"{abs(vhf_doppler[idx]):.6f}",
                }
            )

    summary = {
        "plain_answer": "Doppler does not directly change PRF; it constrains what PRF must be. PRF must sample Doppler in slow time, while also meeting along-track spacing and range-timing constraints.",
        "assumptions": {
            "closest_altitude_km": closest_altitude_km,
            "altitude_rise_at_plus_minus_60_km": altitude_rise_at_edge_km,
            "cross_track_offset_km": cross_track_km,
            "spacecraft_speed_km_s": spacecraft_speed_km_s,
            "hf_wavelength_m": hf_wavelength_m,
            "vhf_wavelength_m": vhf_wavelength_m,
            "reason_prf_range_hz": [prf_min_hz, prf_max_hz],
        },
        "derived": {
            "max_hf_doppler_abs_hz_for_aperture": max_hf_doppler,
            "max_vhf_doppler_abs_hz_for_aperture": max_vhf_doppler,
            "minimum_prf_for_vhf_no_alias_hz_simple_nyquist": 2.0 * max_vhf_doppler,
            "pulse_spacing_m_at_50_500_3000_hz": list(spacecraft_speed_km_s * 1000.0 / prf_choices),
            "pulses_in_air_at_50_500_3000_hz": list(prf_choices * round_trip_time_s),
        },
        "graphs": [str(path.resolve()) for path in sorted(OUT.glob("*.png"))],
        "data": str((OUT / "doppler_prf_values.csv").resolve()),
    }
    (OUT / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
