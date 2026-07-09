from __future__ import annotations

import csv
import json
from pathlib import Path

import numpy as np

from plot_clean_question_graphs import chart
from plot_nadir_offnadir_bar_charts import grouped_bar_chart


OUT = Path("parabolic_motion_doppler_graphs")


def slant_range_km(x_km: np.ndarray, y_km: float, z_km: np.ndarray) -> np.ndarray:
    return np.sqrt(x_km**2 + y_km**2 + z_km**2)


def radial_velocity_m_s(x_km: np.ndarray, y_km: float, z_km: np.ndarray, vx_km_s: float, vz_km_s: np.ndarray) -> np.ndarray:
    r_km = slant_range_km(x_km, y_km, z_km)
    return 1000.0 * (x_km * vx_km_s + z_km * vz_km_s) / r_km


def doppler_hz(radial_velocity: np.ndarray, wavelength_m: float) -> np.ndarray:
    return -2.0 * radial_velocity / wavelength_m


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    closest_altitude_km = 400.0
    edge_altitude_rise_km = 4.0
    cross_track_offset_km = 25.0
    along_speed_km_s = 4.0
    vhf_wavelength_m = 5.0
    hf_wavelength_m = 33.3

    x_km = np.linspace(-60.0, 60.0, 601)
    parabola_coeff = edge_altitude_rise_km / 60.0**2

    normal_z_km = np.full_like(x_km, closest_altitude_km)
    normal_vz_km_s = np.zeros_like(x_km)

    parabola_z_km = closest_altitude_km + parabola_coeff * x_km**2
    parabola_vz_km_s = 2.0 * parabola_coeff * x_km * along_speed_km_s

    normal_vr = radial_velocity_m_s(x_km, cross_track_offset_km, normal_z_km, along_speed_km_s, normal_vz_km_s)
    parabola_vr = radial_velocity_m_s(x_km, cross_track_offset_km, parabola_z_km, along_speed_km_s, parabola_vz_km_s)

    normal_vhf = doppler_hz(normal_vr, vhf_wavelength_m)
    parabola_vhf = doppler_hz(parabola_vr, vhf_wavelength_m)
    normal_hf = doppler_hz(normal_vr, hf_wavelength_m)
    parabola_hf = doppler_hz(parabola_vr, hf_wavelength_m)

    chart(
        OUT / "01_normal_vs_parabolic_path.png",
        x_km,
        {
            "normal constant altitude": normal_z_km,
            "parabolic flyby altitude": parabola_z_km,
        },
        title="Normal path vs one continuous parabolic flyby path",
        x_label="Satellite position left-to-right past feature (km)",
        y_label="Spacecraft altitude (km)",
        xlim=(-60, 60),
        ylim=(399, 405),
        vlines=[(0, "closest")],
    )

    chart(
        OUT / "02_vertical_speed_from_parabolic_path.png",
        x_km,
        {"vertical speed from parabolic path": parabola_vz_km_s},
        title="Parabolic motion: descending before closest, climbing after",
        x_label="Satellite position left-to-right past feature (km)",
        y_label="Vertical speed (km/s)",
        xlim=(-60, 60),
        ylim=(-0.6, 0.6),
        vlines=[(0, "closest")],
        hlines=[(0, "no vertical speed")],
    )

    chart(
        OUT / "03_radial_velocity_normal_vs_parabolic.png",
        x_km,
        {
            "normal radial velocity": normal_vr,
            "parabolic-path radial velocity": parabola_vr,
        },
        title="Parabolic path increases the toward/away motion",
        x_label="Satellite position left-to-right past feature (km)",
        y_label="Radial velocity toward/away from target (m/s)",
        xlim=(-60, 60),
        ylim=(-1200, 1200),
        vlines=[(0, "closest")],
        hlines=[(0, "zero radial velocity")],
    )

    chart(
        OUT / "04_vhf_doppler_normal_vs_parabolic.png",
        x_km,
        {
            "normal VHF Doppler": normal_vhf,
            "parabolic-path VHF Doppler": parabola_vhf,
        },
        title="VHF Doppler from the parabolic flyby motion",
        x_label="Satellite position left-to-right past feature (km)",
        y_label="VHF Doppler shift (Hz)",
        xlim=(-60, 60),
        ylim=(-500, 500),
        vlines=[(0, "closest")],
        hlines=[(0, "zero Doppler")],
    )

    chart(
        OUT / "05_hf_doppler_normal_vs_parabolic.png",
        x_km,
        {
            "normal HF Doppler": normal_hf,
            "parabolic-path HF Doppler": parabola_hf,
        },
        title="HF Doppler has the same shape but smaller size",
        x_label="Satellite position left-to-right past feature (km)",
        y_label="HF Doppler shift (Hz)",
        xlim=(-60, 60),
        ylim=(-80, 80),
        vlines=[(0, "closest")],
        hlines=[(0, "zero Doppler")],
    )

    sample_x = np.asarray([-60.0, -30.0, 0.0, 30.0, 60.0])
    sample_indices = [int((x + 60) / 0.2) for x in sample_x]
    groups = ["left\n-60", "left\n-30", "closest\n0", "right\n+30", "right\n+60"]
    grouped_bar_chart(
        OUT / "06_vhf_doppler_bar_normal_vs_parabolic.png",
        groups,
        {
            "normal": [float(normal_vhf[i]) for i in sample_indices],
            "parabolic": [float(parabola_vhf[i]) for i in sample_indices],
        },
        title="Parabolic motion strengthens Doppler away from closest approach",
        y_label="VHF Doppler shift (Hz)",
        note="This is one continuous parabolic path, not separate upward/downward cases.",
    )

    max_normal_vhf = float(np.max(np.abs(normal_vhf)))
    max_parabola_vhf = float(np.max(np.abs(parabola_vhf)))
    grouped_bar_chart(
        OUT / "07_prf_requirement_normal_vs_parabolic.png",
        ["normal\npath", "parabolic\npath"],
        {
            "max VHF Doppler": [max_normal_vhf, max_parabola_vhf],
            "minimum PRF by Nyquist": [2.0 * max_normal_vhf, 2.0 * max_parabola_vhf],
        },
        title="Parabolic path raises the PRF needed for Doppler sampling",
        y_label="Frequency (Hz)",
        note="Simple sampling rule: PRF should be greater than twice the max Doppler.",
    )

    with (OUT / "parabolic_motion_doppler_values.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "position_km",
                "normal_altitude_km",
                "parabolic_altitude_km",
                "parabolic_vertical_speed_km_s",
                "normal_radial_velocity_m_s",
                "parabolic_radial_velocity_m_s",
                "normal_vhf_doppler_hz",
                "parabolic_vhf_doppler_hz",
                "normal_hf_doppler_hz",
                "parabolic_hf_doppler_hz",
            ],
        )
        writer.writeheader()
        for i, x in enumerate(x_km):
            writer.writerow(
                {
                    "position_km": f"{x:.3f}",
                    "normal_altitude_km": f"{normal_z_km[i]:.6f}",
                    "parabolic_altitude_km": f"{parabola_z_km[i]:.6f}",
                    "parabolic_vertical_speed_km_s": f"{parabola_vz_km_s[i]:.6f}",
                    "normal_radial_velocity_m_s": f"{normal_vr[i]:.6f}",
                    "parabolic_radial_velocity_m_s": f"{parabola_vr[i]:.6f}",
                    "normal_vhf_doppler_hz": f"{normal_vhf[i]:.6f}",
                    "parabolic_vhf_doppler_hz": f"{parabola_vhf[i]:.6f}",
                    "normal_hf_doppler_hz": f"{normal_hf[i]:.6f}",
                    "parabolic_hf_doppler_hz": f"{parabola_hf[i]:.6f}",
                }
            )

    summary = {
        "plain_answer": "This graph uses one continuous parabolic flyby path. The parabolic motion descends before closest approach and climbs after closest approach, so the Doppler curve is steeper than the normal constant-altitude pass.",
        "assumptions": {
            "closest_altitude_km": closest_altitude_km,
            "altitude_rise_at_plus_minus_60_km": edge_altitude_rise_km,
            "cross_track_offset_km": cross_track_offset_km,
            "along_speed_km_s": along_speed_km_s,
            "vhf_wavelength_m": vhf_wavelength_m,
            "hf_wavelength_m": hf_wavelength_m,
        },
        "closest_approach": {
            "normal_vhf_doppler_hz": float(normal_vhf[len(x_km) // 2]),
            "parabolic_vhf_doppler_hz": float(parabola_vhf[len(x_km) // 2]),
            "parabolic_vertical_speed_km_s": float(parabola_vz_km_s[len(x_km) // 2]),
        },
        "max_abs_vhf_doppler_hz": {
            "normal": max_normal_vhf,
            "parabolic": max_parabola_vhf,
        },
        "minimum_prf_by_simple_nyquist_hz": {
            "normal": 2.0 * max_normal_vhf,
            "parabolic": 2.0 * max_parabola_vhf,
        },
        "graphs": [str(path.resolve()) for path in sorted(OUT.glob("*.png"))],
        "data": str((OUT / "parabolic_motion_doppler_values.csv").resolve()),
    }
    (OUT / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
