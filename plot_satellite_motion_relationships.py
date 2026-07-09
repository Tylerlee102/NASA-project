from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np

from plot_clean_question_graphs import chart
from reason_common import C_M_PER_S


PARAMS = Path("paper_data/reason_instrument_parameters.json")
OUT = Path("satellite_motion_relationship_graphs")


def offnadir_depth_400km(along_km: np.ndarray, cross_track_km: float = 25.0, n_ice: float = 1.78) -> np.ndarray:
    altitude_m = 400_000.0
    along_m = along_km * 1000.0
    cross_m = cross_track_km * 1000.0
    slant = np.sqrt(altitude_m * altitude_m + along_m * along_m + cross_m * cross_m)
    return (slant - altitude_m) / n_ice


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    data = json.loads(PARAMS.read_text(encoding="utf-8"))
    shared = data["radar_system_actuals_table_7"]["shared"]
    sounding = data["sounding_products"]
    processing = data["onboard_processing"]

    prf_min = float(shared["pulse_repetition_frequency_min_hz"])
    prf_max = float(shared["pulse_repetition_frequency_max_hz"])
    altitude_min_km = float(shared["operational_altitude_min_km"])
    altitude_max_km = float(shared["operational_altitude_max_km"])
    receive_sum_max = float(processing["coherently_summed_echoes_receive_max"])

    # A simple flyby model: left and right edges are high altitude, the middle is closest approach.
    # This is not a published trajectory; it turns the paper's operating range into a movement plot.
    flyby = np.linspace(-1.0, 1.0, 700)
    altitude_km = altitude_min_km + (altitude_max_km - altitude_min_km) * np.abs(flyby) ** 2
    echo_time_ms = (2.0 * altitude_km * 1000.0 / C_M_PER_S) * 1000.0
    one_echo_prf_hz = 1000.0 / echo_time_ms
    modeled_prf_hz = np.clip(one_echo_prf_hz, prf_min, prf_max)
    modeled_pulse_interval_ms = 1000.0 / modeled_prf_hz
    pulses_in_air_at_max_prf = prf_max * (echo_time_ms / 1000.0)
    time_to_collect_40_ms = receive_sum_max / modeled_prf_hz * 1000.0

    chart(
        OUT / "01_satellite_altitude_and_modeled_prf_vs_motion.png",
        flyby,
        {
            "altitude / 10 (km)": altitude_km / 10.0,
            "modeled PRF / 30 (Hz)": modeled_prf_hz / 30.0,
        },
        title="As the satellite moves left-to-right, altitude changes what PRF can do",
        x_label="Flyby position left-to-right (closest approach at 0)",
        y_label="Scaled values: altitude/10 and PRF/30",
        xlim=(-1, 1),
        ylim=(0, 105),
        vlines=[(0, "closest approach")],
    )

    chart(
        OUT / "02_pulse_interval_and_echo_time_vs_motion.png",
        flyby,
        {
            "nadir echo return time": echo_time_ms,
            "modeled time between pulses": modeled_pulse_interval_ms,
        },
        title="Moving closer shortens echo time, allowing pulses closer together",
        x_label="Flyby position left-to-right (closest approach at 0)",
        y_label="Time (milliseconds)",
        xlim=(-1, 1),
        ylim=(0, 8),
        vlines=[(0, "closest approach")],
    )

    chart(
        OUT / "03_pulses_in_air_if_prf_is_high_vs_motion.png",
        flyby,
        {"pulses in air if PRF = 3 kHz": pulses_in_air_at_max_prf},
        title="At high altitude, many pulses can be in the air before echoes return",
        x_label="Flyby position left-to-right (closest approach at 0)",
        y_label="Approximate pulses in air",
        xlim=(-1, 1),
        ylim=(0, 22),
        hlines=[(1, "one pulse in air")],
        vlines=[(0, "closest approach")],
    )

    chart(
        OUT / "04_time_to_collect_40_coherent_sum_echoes_vs_motion.png",
        flyby,
        {"time to collect 40 receive echoes": time_to_collect_40_ms},
        title="Coherent sum: time to collect 40 echoes changes with PRF",
        x_label="Flyby position left-to-right (closest approach at 0)",
        y_label="Time to collect 40 echoes (ms)",
        xlim=(-1, 1),
        ylim=(0, 280),
        vlines=[(0, "closest approach")],
    )

    along_km = np.linspace(-60.0, 60.0, 700)
    main_depth_m = offnadir_depth_400km(along_km)
    vhf_resolution_m = float(sounding["vhf_shallow"]["resolution_in_ice_m"])
    hf_resolution_m = float(sounding["hf_full_depth"]["resolution_in_ice_m"])

    chart(
        OUT / "05_offnadir_false_depth_as_satellite_passes_feature.png",
        along_km,
        {"off-nadir surface echo": main_depth_m},
        title="Off-nadir echo changes apparent depth as satellite moves past it",
        x_label="Satellite position left-to-right past feature (km)",
        y_label="Apparent depth / late echo (m)",
        xlim=(-60, 60),
        ylim=(0, 3200),
        hlines=[(main_depth_m[len(main_depth_m) // 2], "closest approach false depth")],
        vlines=[(0, "closest approach")],
    )

    chart(
        OUT / "06_pulse_bandwidth_resolution_as_echo_moves.png",
        along_km,
        {
            "off-nadir echo center": main_depth_m,
            "VHF compressed width upper": main_depth_m + vhf_resolution_m / 2.0,
            "VHF compressed width lower": main_depth_m - vhf_resolution_m / 2.0,
            "HF compressed width upper": main_depth_m + hf_resolution_m / 2.0,
            "HF compressed width lower": main_depth_m - hf_resolution_m / 2.0,
        },
        title="Pulse/chirp bandwidth changes vertical thickness of the moving echo",
        x_label="Satellite position left-to-right past feature (km)",
        y_label="Apparent depth / late echo (m)",
        xlim=(-60, 60),
        ylim=(0, 3200),
        vlines=[(0, "closest approach")],
    )

    chart(
        OUT / "07_pulse_compression_sidelobes_move_with_echo.png",
        along_km,
        {
            "compressed main echo": main_depth_m,
            "range sidelobe above": main_depth_m - vhf_resolution_m,
            "range sidelobe below": main_depth_m + vhf_resolution_m,
        },
        title="Pulse compression: sidelobes move with the off-nadir echo",
        x_label="Satellite position left-to-right past feature (km)",
        y_label="Apparent depth / late echo (m)",
        xlim=(-60, 60),
        ylim=(0, 3200),
        vlines=[(0, "closest approach")],
    )

    summary = {
        "source_paper_values": str(PARAMS.resolve()),
        "important_limit": "The paper does not publish an exact PRF schedule or exact pulse length during a flyby. These graphs use the paper's operating ranges and a simple closest-approach motion model.",
        "paper_values_used": {
            "altitude_range_km": [altitude_min_km, altitude_max_km],
            "prf_range_hz": [prf_min, prf_max],
            "receive_coherent_sum_max": receive_sum_max,
            "vhf_resolution_m": vhf_resolution_m,
            "hf_resolution_m": hf_resolution_m,
        },
        "model_values_used": {
            "offnadir_cross_track_offset_km": 25,
            "representative_altitude_for_offnadir_echo_km": 400,
            "ice_index": 1.78,
        },
        "plain_answer": "When the satellite moves, altitude changes echo return time and therefore what PRF can do. PRF changes pulse spacing; high PRF can leave multiple pulses in the air at high altitude. Coherent summing is limited to 40 receive echoes, so higher PRF lets those 40 echoes be collected faster. Off-nadir echoes curve in apparent depth as the satellite passes the feature, and pulse compression/sidelobes move along with that curved echo.",
        "graphs": [str(path.resolve()) for path in sorted(OUT.glob("*.png"))],
    }
    (OUT / "satellite_motion_relationship_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
