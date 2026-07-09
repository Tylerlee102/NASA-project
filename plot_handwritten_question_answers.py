from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from plot_clean_question_graphs import chart
from plot_reason_paper_graphs import bar_comparison
from reason_common import C_M_PER_S


PARAMS = Path("paper_data/reason_instrument_parameters.json")
OUT = Path("question_answer_graphs")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    data = json.loads(PARAMS.read_text(encoding="utf-8"))
    hf = data["radar_system_actuals_table_7"]["hf"]
    vhf = data["radar_system_actuals_table_7"]["vhf"]
    shared = data["radar_system_actuals_table_7"]["shared"]
    sounding = data["sounding_products"]
    processing = data["onboard_processing"]

    # Question: pulse length / chirp. The paper does not give a fixed pulse length.
    # It does give the bandwidth and resulting in-ice resolutions for the two radars.
    bandwidth_mhz = np.asarray([hf["bandwidth_mhz"], vhf["bandwidth_mhz"]], dtype=float)
    resolution_m = np.asarray(
        [
            sounding["hf_full_depth"]["resolution_in_ice_m"],
            sounding["vhf_shallow"]["resolution_in_ice_m"],
        ],
        dtype=float,
    )
    chart(
        OUT / "01_pulse_chirp_bandwidth_resolution.png",
        bandwidth_mhz,
        {"paper values: HF to VHF": resolution_m},
        title="Pulse/chirp answer: paper gives bandwidth, not one fixed pulse length",
        x_label="Radar bandwidth from paper (MHz)",
        y_label="Resolution in ice from paper (m)",
        xlim=(0, 11),
        ylim=(0, 330),
        vlines=[(hf["bandwidth_mhz"], "HF 1 MHz"), (vhf["bandwidth_mhz"], "VHF 10 MHz")],
    )

    # Question: PRF. Paper range is 50 Hz to 3 kHz. Plot the physical pulse spacing in time.
    prf = np.linspace(shared["pulse_repetition_frequency_min_hz"], shared["pulse_repetition_frequency_max_hz"], 600)
    interval_ms = 1000.0 / prf
    rtt_min_ms = (2.0 * shared["operational_altitude_min_km"] * 1000.0 / C_M_PER_S) * 1000.0
    rtt_max_ms = (2.0 * shared["operational_altitude_max_km"] * 1000.0 / C_M_PER_S) * 1000.0
    high_alt_one_pulse_boundary_hz = 1000.0 / rtt_max_ms
    chart(
        OUT / "02_prf_pulse_interval_vs_echo_time.png",
        prf,
        {"time between transmitted pulses": interval_ms},
        title="PRF answer: higher PRF means less time between pulses",
        x_label="Pulse repetition frequency, PRF (Hz)",
        y_label="Time between pulses (ms)",
        xlim=(50, 3000),
        ylim=(0, 22),
        hlines=[(rtt_max_ms, "1000 km echo time"), (rtt_min_ms, "25 km echo time")],
        vlines=[(high_alt_one_pulse_boundary_hz, "one-pulse boundary at 1000 km")],
    )

    # Question: number of pulses / coherent sum pulses.
    receive_sum = np.arange(1, processing["coherently_summed_echoes_receive_max"] + 1)
    snr_gain_db = 10.0 * np.log10(receive_sum)
    chart(
        OUT / "03_number_of_summed_pulses_snr_gain.png",
        receive_sum,
        {"theoretical gain from summing receive echoes": snr_gain_db},
        title="Number of pulses answer: receive echoes can be summed up to 40",
        x_label="Number of coherently summed receive echoes",
        y_label="Theoretical SNR gain (dB)",
        xlim=(1, 40),
        ylim=(0, 17),
        vlines=[(40, "paper max receive sum")],
    )

    # Question: pulse compression and range sidelobes. The paper says sidelobes result
    # from pulse compression, but does not provide the exact waveform/window.
    bins = np.linspace(-8.0, 8.0, 700)
    response_db = 10.0 * np.log10(np.maximum(np.sinc(bins) ** 2, 1.0e-6))
    chart(
        OUT / "04_pulse_compression_range_sidelobes_concept.png",
        bins,
        {"conceptual compressed-pulse response": response_db},
        title="Pulse compression answer: narrow main peak, sidelobes beside it",
        x_label="Range bins around a target",
        y_label="Relative response (dB)",
        xlim=(-8, 8),
        ylim=(-60, 2),
        hlines=[(-13.0, "example first sidelobe level")],
    )

    # Related compression in the paper: BFPQ data compression is not pulse compression,
    # but it is an actual numeric compression example from the article.
    bar_comparison(
        OUT / "05_data_compression_from_paper_not_pulse_compression.png",
        ["VHF input", "after BFPQ"],
        [processing["vhf_bfpq_example_input_mbps"], processing["vhf_bfpq_example_output_mbps"]],
        title="Separate from pulse compression: paper's VHF data compression example",
        y_label="Data rate (Mbps)",
        units="Mbps",
    )

    summary = {
        "source_data": str(PARAMS.resolve()),
        "answers": {
            "pulse_length": "The paper does not give a single fixed pulse length. It says chirp/transmit pulse is adjustable; paper-backed numeric values are 1 MHz HF bandwidth -> 300 m in-ice resolution and 10 MHz VHF bandwidth -> 30 m in-ice resolution.",
            "prf": "The paper gives PRF as 50 Hz to 3 kHz. Time between pulses is 20 ms at 50 Hz and 0.333 ms at 3 kHz.",
            "number_of_pulses": "The paper gives coherent summing up to 40 receive echoes and up to 255 transmit-loopback echoes.",
            "pulse_compression": "The paper says range sidelobes appear adjacent to the main peak as a result of pulse compression, but does not give the exact waveform or sidelobe level.",
            "data_compression": "The paper's BFPQ example reduces VHF data from 576 Mbps to 99 Mbps, about 6x; this is data compression, not pulse compression.",
        },
        "graphs": [str(path.resolve()) for path in sorted(OUT.glob("*.png"))],
    }
    (OUT / "answers_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
