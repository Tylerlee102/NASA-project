from __future__ import annotations

import csv
import json
from pathlib import Path

import numpy as np

from plot_clean_question_graphs import chart
from plot_reason_paper_graphs import bar_comparison
from reason_common import C_M_PER_S


PARAMS = Path("paper_data/reason_instrument_parameters.json")
OUT = Path("pulse_operation_graphs")


def write_data_csv(path: Path, rows: list[dict[str, str]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["variable", "value", "units", "kind", "notes"])
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    data = json.loads(PARAMS.read_text(encoding="utf-8"))
    hf = data["radar_system_actuals_table_7"]["hf"]
    vhf = data["radar_system_actuals_table_7"]["vhf"]
    shared = data["radar_system_actuals_table_7"]["shared"]
    processing = data["onboard_processing"]
    sounding = data["sounding_products"]

    rows = [
        {
            "variable": "HF center frequency",
            "value": str(hf["center_frequency_mhz"]),
            "units": "MHz",
            "kind": "paper value",
            "notes": "REASON HF center frequency",
        },
        {
            "variable": "VHF center frequency",
            "value": str(vhf["center_frequency_mhz"]),
            "units": "MHz",
            "kind": "paper value",
            "notes": "REASON VHF center frequency",
        },
        {
            "variable": "HF bandwidth",
            "value": str(hf["bandwidth_mhz"]),
            "units": "MHz",
            "kind": "paper value",
            "notes": "Paper gives bandwidth, not one fixed pulse length",
        },
        {
            "variable": "VHF bandwidth",
            "value": str(vhf["bandwidth_mhz"]),
            "units": "MHz",
            "kind": "paper value",
            "notes": "Paper gives bandwidth, not one fixed pulse length",
        },
        {
            "variable": "HF resolution in ice",
            "value": str(sounding["hf_full_depth"]["resolution_in_ice_m"]),
            "units": "m",
            "kind": "paper value",
            "notes": "Full-depth sounding",
        },
        {
            "variable": "VHF resolution in ice",
            "value": str(sounding["vhf_shallow"]["resolution_in_ice_m"]),
            "units": "m",
            "kind": "paper value",
            "notes": "Shallow sounding",
        },
        {
            "variable": "PRF minimum",
            "value": str(shared["pulse_repetition_frequency_min_hz"]),
            "units": "Hz",
            "kind": "paper value",
            "notes": "Pulse repetition frequency range",
        },
        {
            "variable": "PRF maximum",
            "value": str(shared["pulse_repetition_frequency_max_hz"]),
            "units": "Hz",
            "kind": "paper value",
            "notes": "Pulse repetition frequency range",
        },
        {
            "variable": "receive coherent sum maximum",
            "value": str(processing["coherently_summed_echoes_receive_max"]),
            "units": "echoes",
            "kind": "paper value",
            "notes": "Maximum commandable receive echoes coherently summed",
        },
        {
            "variable": "transmit loopback coherent sum maximum",
            "value": str(processing["coherently_summed_echoes_transmit_loopback_max"]),
            "units": "echoes",
            "kind": "paper value",
            "notes": "Maximum commandable transmit loopback echoes",
        },
        {
            "variable": "receive coherent sum ideal gain at 40",
            "value": f"{10.0 * np.log10(processing['coherently_summed_echoes_receive_max']):.2f}",
            "units": "dB",
            "kind": "derived",
            "notes": "Ideal 10 log10(N) gain",
        },
        {
            "variable": "VHF BFPQ input data rate",
            "value": str(processing["vhf_bfpq_example_input_mbps"]),
            "units": "Mbps",
            "kind": "paper value",
            "notes": "Data compression example, not pulse compression",
        },
        {
            "variable": "VHF BFPQ output data rate",
            "value": str(processing["vhf_bfpq_example_output_mbps"]),
            "units": "Mbps",
            "kind": "paper value",
            "notes": "Data compression example, not pulse compression",
        },
    ]
    write_data_csv(OUT / "pulse_operation_data.csv", rows)

    bar_comparison(
        OUT / "01_frequency_data.png",
        ["HF", "VHF"],
        [hf["center_frequency_mhz"], vhf["center_frequency_mhz"]],
        title="REASON radar frequencies from the paper",
        y_label="Center frequency (MHz)",
        units="MHz",
    )

    bar_comparison(
        OUT / "02_bandwidth_data_not_fixed_pulse_length.png",
        ["HF", "VHF"],
        [hf["bandwidth_mhz"], vhf["bandwidth_mhz"]],
        title="Pulse/chirp data: paper gives bandwidth, not fixed pulse length",
        y_label="Bandwidth (MHz)",
        units="MHz",
    )

    bar_comparison(
        OUT / "03_resolution_from_bandwidth_data.png",
        ["HF", "VHF"],
        [
            sounding["hf_full_depth"]["resolution_in_ice_m"],
            sounding["vhf_shallow"]["resolution_in_ice_m"],
        ],
        title="Resulting in-ice resolution listed in the paper",
        y_label="Resolution in ice (m)",
        units="m",
    )

    prf = np.linspace(shared["pulse_repetition_frequency_min_hz"], shared["pulse_repetition_frequency_max_hz"], 800)
    pulse_interval_ms = 1000.0 / prf
    chart(
        OUT / "04_prf_vs_time_between_pulses.png",
        prf,
        {"time between pulses": pulse_interval_ms},
        title="PRF data: higher PRF means shorter spacing between pulses",
        x_label="Pulse repetition frequency, PRF (Hz)",
        y_label="Time between pulses (ms)",
        xlim=(50, 3000),
        ylim=(0, 22),
        vlines=[(50, "50 Hz"), (3000, "3 kHz")],
    )

    unambiguous_range_km = C_M_PER_S / (2.0 * prf) / 1000.0
    chart(
        OUT / "05_prf_vs_unambiguous_range.png",
        prf,
        {"unambiguous range": unambiguous_range_km},
        title="PRF effect: higher PRF lowers unambiguous range",
        x_label="Pulse repetition frequency, PRF (Hz)",
        y_label="Unambiguous range (km)",
        xlim=(50, 3000),
        ylim=(0, 3200),
        hlines=[(1000, "1000 km max operating altitude")],
    )

    n_receive = np.arange(1, processing["coherently_summed_echoes_receive_max"] + 1)
    gain_receive = 10.0 * np.log10(n_receive)
    n_loopback = np.arange(1, processing["coherently_summed_echoes_transmit_loopback_max"] + 1)
    gain_loopback = 10.0 * np.log10(n_loopback)
    chart(
        OUT / "06_coherent_sum_pulses_vs_ideal_gain.png",
        n_loopback,
        {
            "transmit loopback sum limit": gain_loopback,
            "receive sum limit": np.where(n_loopback <= n_receive[-1], 10.0 * np.log10(n_loopback), np.nan),
        },
        title="Coherent sum pulses: ideal gain grows as 10 log10(N)",
        x_label="Number of coherently summed echoes",
        y_label="Ideal gain (dB)",
        xlim=(1, 255),
        ylim=(0, 25),
        vlines=[(40, "receive max 40"), (255, "loopback max 255")],
    )

    bins = np.linspace(-8.0, 8.0, 800)
    response_db = 10.0 * np.log10(np.maximum(np.sinc(bins) ** 2, 1.0e-6))
    chart(
        OUT / "07_pulse_compression_sidelobes_concept.png",
        bins,
        {"compressed-pulse response concept": response_db},
        title="Pulse compression: narrow main peak with sidelobes",
        x_label="Range bins around target",
        y_label="Relative response (dB)",
        xlim=(-8, 8),
        ylim=(-60, 2),
        hlines=[(-13, "example sidelobe level")],
    )

    bar_comparison(
        OUT / "08_data_compression_not_pulse_compression.png",
        ["VHF input", "after BFPQ"],
        [processing["vhf_bfpq_example_input_mbps"], processing["vhf_bfpq_example_output_mbps"]],
        title="Paper data compression example: BFPQ reduces VHF data rate",
        y_label="Data rate (Mbps)",
        units="Mbps",
    )

    summary = {
        "source_data": str(PARAMS.resolve()),
        "data_csv": str((OUT / "pulse_operation_data.csv").resolve()),
        "notes": {
            "pulse_length": "The paper does not provide a single fixed pulse length. It provides bandwidths and says chirp/transmit pulse is adjustable.",
            "pulse_compression": "Pulse compression graph is conceptual because the paper says compression causes sidelobes but does not give the exact waveform/window.",
            "data_compression": "BFPQ is data compression, not pulse compression.",
        },
        "graphs": [str(path.resolve()) for path in sorted(OUT.glob("*.png"))],
    }
    (OUT / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
