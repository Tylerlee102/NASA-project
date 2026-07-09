from __future__ import annotations

import csv
import json
from pathlib import Path

import numpy as np

from plot_clean_question_graphs import chart
from plot_nadir_offnadir_bar_charts import grouped_bar_chart


OUT = Path("vertical_motion_doppler_graphs")


def range_m(x_km: np.ndarray, y_km: float, z_km: np.ndarray) -> np.ndarray:
    return 1000.0 * np.sqrt(x_km**2 + y_km**2 + z_km**2)


def radial_velocity_m_s(x_km: np.ndarray, y_km: float, z_km: np.ndarray, vx_km_s: float, vz_km_s: float) -> np.ndarray:
    r_km = np.sqrt(x_km**2 + y_km**2 + z_km**2)
    return 1000.0 * (x_km * vx_km_s + z_km * vz_km_s) / r_km


def doppler_hz(vr_m_s: np.ndarray, wavelength_m: float) -> np.ndarray:
    return -2.0 * vr_m_s / wavelength_m


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    altitude_at_closest_km = 400.0
    cross_track_offset_km = 25.0
    vx_km_s = 4.0
    vertical_speed_km_s = 0.5
    vhf_wavelength_m = 5.0
    hf_wavelength_m = 33.3

    x_km = np.linspace(-60.0, 60.0, 601)
    time_s = x_km / vx_km_s

    normal_z = np.full_like(x_km, altitude_at_closest_km)
    ascending_z = altitude_at_closest_km + vertical_speed_km_s * time_s
    descending_z = altitude_at_closest_km - vertical_speed_km_s * time_s

    normal_vr = radial_velocity_m_s(x_km, cross_track_offset_km, normal_z, vx_km_s, 0.0)
    ascending_vr = radial_velocity_m_s(x_km, cross_track_offset_km, ascending_z, vx_km_s, vertical_speed_km_s)
    descending_vr = radial_velocity_m_s(x_km, cross_track_offset_km, descending_z, vx_km_s, -vertical_speed_km_s)

    normal_vhf = doppler_hz(normal_vr, vhf_wavelength_m)
    ascending_vhf = doppler_hz(ascending_vr, vhf_wavelength_m)
    descending_vhf = doppler_hz(descending_vr, vhf_wavelength_m)

    normal_hf = doppler_hz(normal_vr, hf_wavelength_m)
    ascending_hf = doppler_hz(ascending_vr, hf_wavelength_m)
    descending_hf = doppler_hz(descending_vr, hf_wavelength_m)

    chart(
        OUT / "01_altitude_motion_cases.png",
        x_km,
        {
            "normal left-right only": normal_z,
            "left-right plus upward": ascending_z,
            "left-right plus downward": descending_z,
        },
        title="Motion cases: normal pass compared with up/down motion",
        x_label="Satellite position left-to-right past feature (km)",
        y_label="Spacecraft altitude (km)",
        xlim=(-60, 60),
        ylim=(390, 410),
        vlines=[(0, "closest")],
    )

    chart(
        OUT / "02_radial_velocity_comparison.png",
        x_km,
        {
            "normal radial velocity": normal_vr,
            "upward radial velocity": ascending_vr,
            "downward radial velocity": descending_vr,
        },
        title="Doppler depends on radial velocity, not total speed",
        x_label="Satellite position left-to-right past feature (km)",
        y_label="Radial velocity toward/away from target (m/s)",
        xlim=(-60, 60),
        ylim=(-1100, 1100),
        vlines=[(0, "closest")],
        hlines=[(0, "zero radial velocity")],
    )

    chart(
        OUT / "03_vhf_doppler_normal_vs_updown.png",
        x_km,
        {
            "normal left-right only": normal_vhf,
            "left-right plus upward": ascending_vhf,
            "left-right plus downward": descending_vhf,
        },
        title="VHF Doppler: up/down motion shifts the whole curve",
        x_label="Satellite position left-to-right past feature (km)",
        y_label="VHF Doppler shift (Hz)",
        xlim=(-60, 60),
        ylim=(-500, 500),
        vlines=[(0, "closest")],
        hlines=[(0, "zero Doppler")],
    )

    chart(
        OUT / "04_hf_doppler_normal_vs_updown.png",
        x_km,
        {
            "normal left-right only": normal_hf,
            "left-right plus upward": ascending_hf,
            "left-right plus downward": descending_hf,
        },
        title="HF Doppler changes too, but less because wavelength is longer",
        x_label="Satellite position left-to-right past feature (km)",
        y_label="HF Doppler shift (Hz)",
        xlim=(-60, 60),
        ylim=(-80, 80),
        vlines=[(0, "closest")],
        hlines=[(0, "zero Doppler")],
    )

    at_positions = np.asarray([-60.0, 0.0, 60.0])
    labels = ["left\n-60 km", "closest\n0 km", "right\n+60 km"]
    index = [0, len(x_km) // 2, len(x_km) - 1]
    grouped_bar_chart(
        OUT / "05_vhf_doppler_position_bars.png",
        labels,
        {
            "normal": [float(normal_vhf[i]) for i in index],
            "upward": [float(ascending_vhf[i]) for i in index],
            "downward": [float(descending_vhf[i]) for i in index],
        },
        title="At closest approach, vertical motion creates Doppler but normal motion does not",
        y_label="VHF Doppler shift (Hz)",
        note="Normal horizontal motion has zero Doppler at closest approach; up/down motion does not.",
    )

    max_normal = float(np.max(np.abs(normal_vhf)))
    max_ascending = float(np.max(np.abs(ascending_vhf)))
    max_descending = float(np.max(np.abs(descending_vhf)))
    grouped_bar_chart(
        OUT / "06_prf_requirement_with_vertical_motion.png",
        ["normal\nleft-right", "left-right\nplus upward", "left-right\nplus downward"],
        {
            "max VHF Doppler": [max_normal, max_ascending, max_descending],
            "minimum PRF by Nyquist": [2.0 * max_normal, 2.0 * max_ascending, 2.0 * max_descending],
        },
        title="Up/down motion raises the PRF needed to sample Doppler",
        y_label="Frequency (Hz)",
        note="Simple rule: PRF should be greater than twice the maximum Doppler bandwidth.",
    )

    with (OUT / "vertical_motion_doppler_values.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "position_km",
                "normal_altitude_km",
                "ascending_altitude_km",
                "descending_altitude_km",
                "normal_radial_velocity_m_s",
                "ascending_radial_velocity_m_s",
                "descending_radial_velocity_m_s",
                "normal_vhf_doppler_hz",
                "ascending_vhf_doppler_hz",
                "descending_vhf_doppler_hz",
                "normal_hf_doppler_hz",
                "ascending_hf_doppler_hz",
                "descending_hf_doppler_hz",
            ],
        )
        writer.writeheader()
        for i, x in enumerate(x_km):
            writer.writerow(
                {
                    "position_km": f"{x:.3f}",
                    "normal_altitude_km": f"{normal_z[i]:.6f}",
                    "ascending_altitude_km": f"{ascending_z[i]:.6f}",
                    "descending_altitude_km": f"{descending_z[i]:.6f}",
                    "normal_radial_velocity_m_s": f"{normal_vr[i]:.6f}",
                    "ascending_radial_velocity_m_s": f"{ascending_vr[i]:.6f}",
                    "descending_radial_velocity_m_s": f"{descending_vr[i]:.6f}",
                    "normal_vhf_doppler_hz": f"{normal_vhf[i]:.6f}",
                    "ascending_vhf_doppler_hz": f"{ascending_vhf[i]:.6f}",
                    "descending_vhf_doppler_hz": f"{descending_vhf[i]:.6f}",
                    "normal_hf_doppler_hz": f"{normal_hf[i]:.6f}",
                    "ascending_hf_doppler_hz": f"{ascending_hf[i]:.6f}",
                    "descending_hf_doppler_hz": f"{descending_hf[i]:.6f}",
                }
            )

    summary = {
        "plain_answer": "Normal left-right motion gives a Doppler curve that crosses zero at closest approach. Adding up/down motion shifts that curve because vertical motion is radial motion, so Doppler is nonzero even at closest approach.",
        "assumptions": {
            "closest_altitude_km": altitude_at_closest_km,
            "cross_track_offset_km": cross_track_offset_km,
            "left_right_speed_km_s": vx_km_s,
            "vertical_speed_km_s_for_updown_cases": vertical_speed_km_s,
            "vhf_wavelength_m": vhf_wavelength_m,
            "hf_wavelength_m": hf_wavelength_m,
        },
        "closest_approach_vhf_doppler_hz": {
            "normal": float(normal_vhf[len(x_km) // 2]),
            "upward": float(ascending_vhf[len(x_km) // 2]),
            "downward": float(descending_vhf[len(x_km) // 2]),
        },
        "max_abs_vhf_doppler_hz": {
            "normal": max_normal,
            "upward": max_ascending,
            "downward": max_descending,
        },
        "minimum_prf_by_simple_nyquist_hz": {
            "normal": 2.0 * max_normal,
            "upward": 2.0 * max_ascending,
            "downward": 2.0 * max_descending,
        },
        "graphs": [str(path.resolve()) for path in sorted(OUT.glob("*.png"))],
        "data": str((OUT / "vertical_motion_doppler_values.csv").resolve()),
    }
    (OUT / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
