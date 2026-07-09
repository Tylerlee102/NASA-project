from __future__ import annotations

import csv
import json
from pathlib import Path

import numpy as np

from plot_clean_question_graphs import chart
from reason_common import C_M_PER_S


OUT = Path("nadir_offnadir_comparison")


def offnadir_apparent_depth(
    along_km: np.ndarray,
    *,
    altitude_km: float,
    cross_track_offset_km: float,
    ice_index: float,
) -> np.ndarray:
    altitude_m = altitude_km * 1000.0
    along_m = along_km * 1000.0
    cross_m = cross_track_offset_km * 1000.0
    slant_m = np.sqrt(altitude_m**2 + along_m**2 + cross_m**2)
    return (slant_m - altitude_m) / ice_index


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    altitude_km = 400.0
    cross_track_offset_km = 25.0
    ice_index = 1.78
    along_km = np.linspace(-60.0, 60.0, 601)

    nadir_depth_m = np.zeros_like(along_km)
    offnadir_depth_m = offnadir_apparent_depth(
        along_km,
        altitude_km=altitude_km,
        cross_track_offset_km=cross_track_offset_km,
        ice_index=ice_index,
    )
    offnadir_delay_us = 2.0 * offnadir_depth_m * ice_index / C_M_PER_S * 1.0e6

    chart(
        OUT / "nadir_vs_offnadir_apparent_depth.png",
        along_km,
        {
            "nadir surface echo": nadir_depth_m,
            "off-nadir surface echo": offnadir_depth_m,
        },
        title="Nadir vs off-nadir echo as the satellite moves past a feature",
        x_label="Satellite position left-to-right past feature (km)",
        y_label="Apparent depth / late echo (m)",
        xlim=(-60, 60),
        ylim=(-100, 3200),
        vlines=[(0, "closest approach")],
    )

    with (OUT / "nadir_vs_offnadir_data.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "satellite_position_km",
                "nadir_surface_echo_m",
                "offnadir_surface_echo_apparent_depth_m",
                "offnadir_extra_two_way_delay_us",
            ],
        )
        writer.writeheader()
        for x, nadir, offnadir, delay in zip(along_km, nadir_depth_m, offnadir_depth_m, offnadir_delay_us):
            writer.writerow(
                {
                    "satellite_position_km": f"{x:.3f}",
                    "nadir_surface_echo_m": f"{nadir:.6f}",
                    "offnadir_surface_echo_apparent_depth_m": f"{offnadir:.6f}",
                    "offnadir_extra_two_way_delay_us": f"{delay:.6f}",
                }
            )

    summary = {
        "plain_answer": "A nadir surface echo stays at the reference surface line. An off-nadir surface echo travels a longer slant path, so it arrives late and appears as a curved false subsurface feature as the satellite moves left-to-right.",
        "model": {
            "altitude_km": altitude_km,
            "offnadir_cross_track_offset_km": cross_track_offset_km,
            "ice_index": ice_index,
        },
        "closest_approach": {
            "nadir_surface_echo_m": 0.0,
            "offnadir_apparent_depth_m": float(offnadir_depth_m[len(offnadir_depth_m) // 2]),
            "offnadir_extra_two_way_delay_us": float(offnadir_delay_us[len(offnadir_delay_us) // 2]),
        },
        "files": {
            "graph": str((OUT / "nadir_vs_offnadir_apparent_depth.png").resolve()),
            "data": str((OUT / "nadir_vs_offnadir_data.csv").resolve()),
        },
    }
    (OUT / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
