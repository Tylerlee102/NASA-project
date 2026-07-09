from __future__ import annotations

import csv
import json
from pathlib import Path

import numpy as np

from plot_clean_question_graphs import chart
from plot_nadir_offnadir_bar_charts import grouped_bar_chart


OUT = Path("calculus_parabolic_flyby_graphs")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    closest_altitude_km = 400.0
    altitude_rise_at_edge_km = 4.0
    cross_track_offset_km = 25.0
    along_speed_km_s = 4.0
    vhf_wavelength_m = 5.0
    hf_wavelength_m = 33.3

    # One continuous parabolic path:
    #   x(t) = v*t
    #   z(x) = z0 + a*x^2
    # The coefficient makes z rise by altitude_rise_at_edge_km at x = +/-60 km.
    x_km = np.linspace(-60.0, 60.0, 601)
    a = altitude_rise_at_edge_km / 60.0**2
    z_km = closest_altitude_km + a * x_km**2

    # Calculus:
    #   dz/dx = 2*a*x
    #   dx/dt = v
    #   dz/dt = dz/dx * dx/dt
    dz_dx = 2.0 * a * x_km
    dz_dt_km_s = dz_dx * along_speed_km_s

    # Range to the reflecting point:
    #   R = sqrt(x^2 + y^2 + z^2)
    # Chain rule:
    #   dR/dt = (x*dx/dt + z*dz/dt) / R
    range_km = np.sqrt(x_km**2 + cross_track_offset_km**2 + z_km**2)
    dR_dt_km_s = (x_km * along_speed_km_s + z_km * dz_dt_km_s) / range_km
    dR_dt_m_s = dR_dt_km_s * 1000.0

    # Monostatic radar Doppler:
    #   fD = -2 * dR/dt / wavelength
    vhf_doppler_hz = -2.0 * dR_dt_m_s / vhf_wavelength_m
    hf_doppler_hz = -2.0 * dR_dt_m_s / hf_wavelength_m

    max_vhf_doppler = float(np.max(np.abs(vhf_doppler_hz)))
    min_prf_hz = 2.0 * max_vhf_doppler

    chart(
        OUT / "01_parabolic_altitude_z_of_x.png",
        x_km,
        {"z(x) = z0 + a*x^2": z_km},
        title="One satellite path: altitude is a parabola",
        x_label="Satellite position left-to-right, x (km)",
        y_label="Altitude z(x) (km)",
        xlim=(-60, 60),
        ylim=(399, 405),
        vlines=[(0, "closest")],
    )

    chart(
        OUT / "02_vertical_velocity_from_derivative.png",
        x_km,
        {"dz/dt from calculus": dz_dt_km_s},
        title="Vertical speed comes from the derivative of the parabola",
        x_label="Satellite position left-to-right, x (km)",
        y_label="Vertical speed dz/dt (km/s)",
        xlim=(-60, 60),
        ylim=(-0.6, 0.6),
        vlines=[(0, "closest")],
        hlines=[(0, "zero vertical speed")],
    )

    chart(
        OUT / "03_range_rate_from_chain_rule.png",
        x_km,
        {"dR/dt from chain rule": dR_dt_m_s},
        title="Range rate combines left-right motion and parabolic vertical motion",
        x_label="Satellite position left-to-right, x (km)",
        y_label="Range rate dR/dt (m/s)",
        xlim=(-60, 60),
        ylim=(-1200, 1200),
        vlines=[(0, "closest")],
        hlines=[(0, "zero range rate")],
    )

    chart(
        OUT / "04_doppler_from_parabolic_motion.png",
        x_km,
        {
            "VHF Doppler from parabola": vhf_doppler_hz,
            "HF Doppler from parabola": hf_doppler_hz,
        },
        title="Doppler is calculated from the parabolic path's range rate",
        x_label="Satellite position left-to-right, x (km)",
        y_label="Doppler shift (Hz)",
        xlim=(-60, 60),
        ylim=(-500, 500),
        vlines=[(0, "closest")],
        hlines=[(0, "zero Doppler")],
    )

    grouped_bar_chart(
        OUT / "05_prf_from_parabolic_doppler.png",
        ["max VHF\nDoppler", "minimum\nPRF"],
        {"calculus parabola": [max_vhf_doppler, min_prf_hz]},
        title="PRF requirement comes from the max Doppler of the parabola",
        y_label="Frequency (Hz)",
        note="Simple sampling rule: PRF should be greater than 2 * max Doppler.",
    )

    with (OUT / "calculus_parabolic_flyby_values.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "x_km",
                "z_km",
                "dz_dx",
                "dz_dt_km_s",
                "range_km",
                "dR_dt_m_s",
                "vhf_doppler_hz",
                "hf_doppler_hz",
            ],
        )
        writer.writeheader()
        for i, x in enumerate(x_km):
            writer.writerow(
                {
                    "x_km": f"{x:.3f}",
                    "z_km": f"{z_km[i]:.6f}",
                    "dz_dx": f"{dz_dx[i]:.9f}",
                    "dz_dt_km_s": f"{dz_dt_km_s[i]:.9f}",
                    "range_km": f"{range_km[i]:.6f}",
                    "dR_dt_m_s": f"{dR_dt_m_s[i]:.6f}",
                    "vhf_doppler_hz": f"{vhf_doppler_hz[i]:.6f}",
                    "hf_doppler_hz": f"{hf_doppler_hz[i]:.6f}",
                }
            )

    summary = {
        "path_equation": "x(t)=v*t; z(x)=z0+a*x^2",
        "derivatives": {
            "dz_dx": "2*a*x",
            "dz_dt": "2*a*x*v",
            "range": "sqrt(x^2 + y^2 + z(x)^2)",
            "range_rate": "(x*dx_dt + z*dz_dt) / range",
            "doppler": "-2*range_rate/wavelength",
        },
        "assumptions": {
            "closest_altitude_km": closest_altitude_km,
            "altitude_rise_at_plus_minus_60_km": altitude_rise_at_edge_km,
            "cross_track_offset_km": cross_track_offset_km,
            "along_speed_km_s": along_speed_km_s,
            "vhf_wavelength_m": vhf_wavelength_m,
            "hf_wavelength_m": hf_wavelength_m,
        },
        "derived": {
            "max_abs_vhf_doppler_hz": max_vhf_doppler,
            "minimum_prf_hz_simple_nyquist": min_prf_hz,
        },
        "graphs": [str(path.resolve()) for path in sorted(OUT.glob("*.png"))],
        "data": str((OUT / "calculus_parabolic_flyby_values.csv").resolve()),
    }
    (OUT / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
