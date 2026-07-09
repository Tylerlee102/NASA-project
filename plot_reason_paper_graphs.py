from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from plot_clean_question_graphs import COLORS, FONT_LG, FONT_MD, FONT_SM, center_text, chart
from reason_common import C_M_PER_S


OUT = Path("paper_graphs")
DATA_PATH = Path("paper_data/reason_instrument_parameters.json")


def bar_comparison(path: Path, labels: list[str], values: list[float], *, title: str, y_label: str, units: str) -> None:
    width, height = 1400, 900
    left, right, top, bottom = 215, 85, 105, 135
    plot_left, plot_right = left, width - right
    plot_top, plot_bottom = top, height - bottom
    image = Image.new("RGB", (width, height), (250, 251, 252))
    draw = ImageDraw.Draw(image)
    draw.rectangle([plot_left, plot_top, plot_right, plot_bottom], fill=(255, 255, 255), outline=(84, 94, 108), width=2)

    ymax = max(values) * 1.15

    def py(value: float) -> int:
        return int(plot_bottom - value / ymax * (plot_bottom - plot_top))

    for value in np.linspace(0, ymax, 6):
        y = py(float(value))
        draw.line([plot_left, y, plot_right, y], fill=(224, 229, 236), width=1)
        draw.text((80, y - 11), f"{value:.0f}", fill=(55, 65, 81), font=FONT_SM)

    slot = (plot_right - plot_left) / len(values)
    for idx, (label, value) in enumerate(zip(labels, values)):
        color = COLORS[idx % len(COLORS)]
        cx = int(plot_left + slot * (idx + 0.5))
        bar_w = int(slot * 0.35)
        y = py(value)
        draw.rectangle([cx - bar_w, y, cx + bar_w, plot_bottom], fill=color)
        center_text(draw, (cx, plot_bottom + 34), label, (31, 41, 55), FONT_SM)
        center_text(draw, (cx, y - 24), f"{value:g} {units}", (31, 41, 55), FONT_SM)

    draw.text((left, 37), title, fill=(20, 29, 44), font=FONT_LG)
    center_text(draw, ((plot_left + plot_right) // 2, height - 58), "Paper table value", (31, 41, 55), FONT_MD)

    label_layer = Image.new("RGBA", (700, 70), (0, 0, 0, 0))
    label_draw = ImageDraw.Draw(label_layer)
    label_draw.text((0, 16), y_label, fill=(31, 41, 55), font=FONT_MD)
    rotated = label_layer.rotate(270, expand=True)
    image.paste(rotated, (20, (height - rotated.height) // 2), rotated)
    image.save(path)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    hf = data["radar_system_actuals_table_7"]["hf"]
    vhf = data["radar_system_actuals_table_7"]["vhf"]
    shared = data["radar_system_actuals_table_7"]["shared"]
    processing = data["onboard_processing"]

    bandwidth = np.asarray([hf["bandwidth_mhz"], vhf["bandwidth_mhz"]], dtype=float)
    resolution = np.asarray(
        [
            data["sounding_products"]["hf_full_depth"]["resolution_in_ice_m"],
            data["sounding_products"]["vhf_shallow"]["resolution_in_ice_m"],
        ],
        dtype=float,
    )
    chart(
        OUT / "01_bandwidth_vs_resolution_from_paper.png",
        bandwidth,
        {"HF 9 MHz to VHF 60 MHz": resolution},
        title="REASON bandwidth and vertical resolution from the paper",
        x_label="Bandwidth (MHz)",
        y_label="Resolution in ice (m)",
        xlim=(0, 11),
        ylim=(0, 330),
        vlines=[(hf["bandwidth_mhz"], "HF"), (vhf["bandwidth_mhz"], "VHF")],
    )

    prf = np.linspace(shared["pulse_repetition_frequency_min_hz"], shared["pulse_repetition_frequency_max_hz"], 300)
    unambiguous_range_km = C_M_PER_S / (2.0 * prf) / 1000.0
    chart(
        OUT / "02_prf_vs_unambiguous_range_from_paper.png",
        prf,
        {"free-space unambiguous range": unambiguous_range_km},
        title="Paper PRF range: 50 Hz to 3 kHz",
        x_label="Pulse repetition frequency, PRF (Hz)",
        y_label="Unambiguous range (km)",
        xlim=(50, 3000),
        ylim=(0, 3200),
        hlines=[(shared["operational_altitude_max_km"], "1000 km max operating altitude")],
    )

    receive_pulses = np.arange(1, processing["coherently_summed_echoes_receive_max"] + 1)
    snr_gain_db = 10.0 * np.log10(receive_pulses)
    chart(
        OUT / "03_receive_presummed_pulses_snr_gain_from_paper.png",
        receive_pulses,
        {"receive echoes summed": snr_gain_db},
        title="Receive echoes can be coherently summed up to 40",
        x_label="Number of receive echoes coherently summed",
        y_label="Theoretical SNR gain (dB)",
        xlim=(1, 40),
        ylim=(0, 17),
        vlines=[(40, "paper max")],
    )

    bar_comparison(
        OUT / "04_vhf_bfpq_data_rate_reduction_from_paper.png",
        ["input", "after BFPQ"],
        [processing["vhf_bfpq_example_input_mbps"], processing["vhf_bfpq_example_output_mbps"]],
        title="Paper example: VHF BFPQ reduces data rate by about 6x",
        y_label="VHF data rate (Mbps)",
        units="Mbps",
    )

    bar_comparison(
        OUT / "05_hf_vhf_center_frequency_from_paper.png",
        ["HF", "VHF"],
        [hf["center_frequency_mhz"], vhf["center_frequency_mhz"]],
        title="REASON uses two radar center frequencies",
        y_label="Center frequency (MHz)",
        units="MHz",
    )

    summary = {
        "source_data": str(DATA_PATH.resolve()),
        "graphs": [str(path.resolve()) for path in sorted(OUT.glob("*.png"))],
        "paper_values_used": {
            "hf_center_frequency_mhz": hf["center_frequency_mhz"],
            "vhf_center_frequency_mhz": vhf["center_frequency_mhz"],
            "hf_bandwidth_mhz": hf["bandwidth_mhz"],
            "vhf_bandwidth_mhz": vhf["bandwidth_mhz"],
            "hf_resolution_in_ice_m": resolution[0],
            "vhf_resolution_in_ice_m": resolution[1],
            "prf_min_hz": shared["pulse_repetition_frequency_min_hz"],
            "prf_max_hz": shared["pulse_repetition_frequency_max_hz"],
            "receive_echoes_summed_max": processing["coherently_summed_echoes_receive_max"],
            "vhf_bfpq_input_mbps": processing["vhf_bfpq_example_input_mbps"],
            "vhf_bfpq_output_mbps": processing["vhf_bfpq_example_output_mbps"],
        },
    }
    (OUT / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
