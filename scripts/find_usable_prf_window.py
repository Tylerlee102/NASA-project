"""Find model-usable PRF windows for Europa Clipper REASON-like radar cases.

This script does not use an official NASA flight PRF table. It applies the
same simplified PRF folding math used by the local website model:

1. Minimum PRF comes from a Doppler/Nyquist rule for same-delay surface clutter.
2. Maximum PRF comes from the pulse length plus the two-way listen time.

The default cases are REASON-like:
- HF: 9 MHz
- VHF: 60 MHz
- closest approach altitude: 25 km
- maximum sounded ice depth: 30 km

The speed, ice index, pulse length, guard time, and dead time are model inputs
that can be changed from the command line.
"""

from __future__ import annotations

import argparse
import csv
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


C_M_S = 299_792_458.0


@dataclass(frozen=True)
class Band:
    name: str
    frequency_mhz: float

    @property
    def wavelength_m(self) -> float:
        return C_M_S / (self.frequency_mhz * 1_000_000.0)


@dataclass(frozen=True)
class PrfPoint:
    band: Band
    altitude_km: float
    depth_km: float
    look_angle_deg: float
    doppler_edge_hz: float
    min_prf_hz: float
    max_prf_hz: float
    two_way_us: float
    listen_window_us: float

    @property
    def usable(self) -> bool:
        return self.min_prf_hz <= self.max_prf_hz


@dataclass(frozen=True)
class TraceRemovalPoint:
    case: str
    band: Band
    keep_every: int
    removed_percent: float
    base_prf_hz: float
    effective_prf_hz: float
    min_prf_hz: float

    @property
    def margin(self) -> float:
        if self.min_prf_hz <= 0:
            return math.inf
        return self.effective_prf_hz / self.min_prf_hz

    @property
    def usable(self) -> bool:
        return self.effective_prf_hz >= self.min_prf_hz


DEFAULT_BANDS = (
    Band("HF", 9.0),
    Band("VHF", 60.0),
)


def positive_float(value: str) -> float:
    number = float(value)
    if number <= 0:
        raise argparse.ArgumentTypeError("value must be positive")
    return number


def nonnegative_float(value: str) -> float:
    number = float(value)
    if number < 0:
        raise argparse.ArgumentTypeError("value must be zero or positive")
    return number


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--altitude-km", type=positive_float, default=25.0)
    parser.add_argument("--target-depth-km", type=nonnegative_float, default=6.0)
    parser.add_argument("--max-depth-km", type=positive_float, default=30.0)
    parser.add_argument("--depth-step-km", type=positive_float, default=0.25)
    parser.add_argument("--speed-km-s", type=positive_float, default=4.6)
    parser.add_argument("--ice-index", type=positive_float, default=1.78)
    parser.add_argument("--pulse-us", type=nonnegative_float, default=200.0)
    parser.add_argument("--guard-us", type=nonnegative_float, default=5.0)
    parser.add_argument("--dead-time-us", type=nonnegative_float, default=10.0)
    parser.add_argument("--safety-factor", type=positive_float, default=1.25)
    parser.add_argument(
        "--max-trace-keep-every",
        type=int,
        default=32,
        help="Largest trace-removal factor to test when searching for the first unusable PRF.",
    )
    parser.add_argument(
        "--instrument-cap-hz",
        type=positive_float,
        default=None,
        help="Optional extra PRF ceiling. Omit when only timing sets the max PRF.",
    )
    parser.add_argument(
        "--bands",
        nargs="+",
        default=[f"{band.name}:{band.frequency_mhz}" for band in DEFAULT_BANDS],
        help="Band list as NAME:FREQUENCY_MHZ, for example HF:9 VHF:60.",
    )
    parser.add_argument(
        "--csv-output",
        type=Path,
        default=None,
        help="Optional path for a depth-sweep CSV.",
    )
    parser.add_argument(
        "--trace-csv-output",
        type=Path,
        default=None,
        help="Optional path for the trace-removal CSV.",
    )
    return parser.parse_args()


def parse_bands(values: Iterable[str]) -> list[Band]:
    bands: list[Band] = []
    for value in values:
        if ":" not in value:
            raise ValueError(f"Band must be NAME:FREQUENCY_MHZ, got {value!r}")
        name, frequency = value.split(":", 1)
        bands.append(Band(name.strip(), positive_float(frequency)))
    return bands


def same_delay_sin_theta(altitude_km: float, depth_km: float, ice_index: float) -> float:
    altitude_m = altitude_km * 1000.0
    depth_m = depth_km * 1000.0
    one_way_path_m = altitude_m + ice_index * depth_m
    if one_way_path_m <= 0:
        return 0.0
    offset_m = math.sqrt(max(one_way_path_m * one_way_path_m - altitude_m * altitude_m, 0.0))
    return max(0.0, min(1.0, offset_m / one_way_path_m))


def timing_ceiling_hz(
    altitude_km: float,
    depth_km: float,
    ice_index: float,
    pulse_us: float,
    guard_us: float,
    dead_time_us: float,
    instrument_cap_hz: float | None,
) -> tuple[float, float, float]:
    one_way_path_m = altitude_km * 1000.0 + ice_index * depth_km * 1000.0
    two_way_us = 2.0 * one_way_path_m / C_M_S * 1_000_000.0
    listen_window_us = pulse_us + guard_us + dead_time_us + two_way_us
    timing_max_hz = 1_000_000.0 / listen_window_us if listen_window_us > 0 else math.inf
    max_prf_hz = min(timing_max_hz, instrument_cap_hz) if instrument_cap_hz else timing_max_hz
    return max_prf_hz, two_way_us, listen_window_us


def prf_point(args: argparse.Namespace, band: Band, altitude_km: float, depth_km: float) -> PrfPoint:
    sin_theta = same_delay_sin_theta(altitude_km, depth_km, args.ice_index)
    speed_m_s = args.speed_km_s * 1000.0
    doppler_edge_hz = 2.0 * speed_m_s * sin_theta / band.wavelength_m
    min_prf_hz = 2.0 * doppler_edge_hz * args.safety_factor
    max_prf_hz, two_way_us, listen_window_us = timing_ceiling_hz(
        altitude_km,
        depth_km,
        args.ice_index,
        args.pulse_us,
        args.guard_us,
        args.dead_time_us,
        args.instrument_cap_hz,
    )
    return PrfPoint(
        band=band,
        altitude_km=altitude_km,
        depth_km=depth_km,
        look_angle_deg=math.degrees(math.asin(sin_theta)),
        doppler_edge_hz=doppler_edge_hz,
        min_prf_hz=min_prf_hz,
        max_prf_hz=max_prf_hz,
        two_way_us=two_way_us,
        listen_window_us=listen_window_us,
    )


def depth_values(max_depth_km: float, step_km: float) -> list[float]:
    values = []
    count = int(math.floor(max_depth_km / step_km))
    for index in range(count + 1):
        values.append(round(index * step_km, 10))
    if not math.isclose(values[-1], max_depth_km):
        values.append(max_depth_km)
    return values


def fixed_window(points: list[PrfPoint]) -> tuple[float, float]:
    return max(point.min_prf_hz for point in points), min(point.max_prf_hz for point in points)


def deepest_usable_depth(points: list[PrfPoint]) -> float | None:
    usable_depths = [point.depth_km for point in points if point.usable]
    if not usable_depths:
        return None
    return max(usable_depths)


def trace_removal_rows(
    case: str,
    band: Band,
    base_prf_hz: float,
    min_prf_hz: float,
    max_keep_every: int,
) -> list[TraceRemovalPoint]:
    rows = []
    for keep_every in range(1, max(1, max_keep_every) + 1):
        effective_prf_hz = base_prf_hz / keep_every
        row = TraceRemovalPoint(
            case=case,
            band=band,
            keep_every=keep_every,
            removed_percent=100.0 * (1.0 - 1.0 / keep_every),
            base_prf_hz=base_prf_hz,
            effective_prf_hz=effective_prf_hz,
            min_prf_hz=min_prf_hz,
        )
        rows.append(row)
        if not row.usable:
            break
    return rows


def trace_rows_for_results(
    args: argparse.Namespace,
    bands: list[Band],
    target_points: list[PrfPoint],
    sweep_rows: list[PrfPoint],
) -> list[TraceRemovalPoint]:
    rows: list[TraceRemovalPoint] = []
    for point in target_points:
        rows.extend(
            trace_removal_rows(
                f"{args.target_depth_km:g} km target depth",
                point.band,
                point.max_prf_hz,
                point.min_prf_hz,
                args.max_trace_keep_every,
            )
        )

    for band in bands:
        band_rows = [row for row in sweep_rows if row.band == band]
        min_prf_hz, max_prf_hz = fixed_window(band_rows)
        rows.extend(
            trace_removal_rows(
                f"0-{args.max_depth_km:g} km fixed-depth sweep",
                band,
                max_prf_hz,
                min_prf_hz,
                args.max_trace_keep_every,
            )
        )
    return rows


def fmt_hz(value: float) -> str:
    if value >= 1000:
        return f"{value:,.1f}"
    return f"{value:.1f}"


def fmt_range(low: float, high: float) -> str:
    if low <= high:
        return f"{fmt_hz(low)} to {fmt_hz(high)} Hz"
    return f"no window ({fmt_hz(low)} Hz needed > {fmt_hz(high)} Hz max)"


def write_csv(path: Path, rows: list[PrfPoint]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "band",
                "frequency_mhz",
                "wavelength_m",
                "altitude_km",
                "depth_km",
                "look_angle_deg",
                "doppler_edge_hz",
                "min_prf_hz",
                "max_prf_hz",
                "two_way_us",
                "listen_window_us",
                "usable",
            ],
        )
        writer.writeheader()
        for row in rows:
            writer.writerow(
                {
                    "band": row.band.name,
                    "frequency_mhz": row.band.frequency_mhz,
                    "wavelength_m": row.band.wavelength_m,
                    "altitude_km": row.altitude_km,
                    "depth_km": row.depth_km,
                    "look_angle_deg": row.look_angle_deg,
                    "doppler_edge_hz": row.doppler_edge_hz,
                    "min_prf_hz": row.min_prf_hz,
                    "max_prf_hz": row.max_prf_hz,
                    "two_way_us": row.two_way_us,
                    "listen_window_us": row.listen_window_us,
                    "usable": row.usable,
                }
            )


def write_trace_csv(path: Path, rows: list[TraceRemovalPoint]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "case",
                "band",
                "frequency_mhz",
                "base_prf_hz",
                "min_prf_hz",
                "keep_every",
                "removed_percent",
                "effective_prf_hz",
                "margin",
                "usable",
            ],
        )
        writer.writeheader()
        for row in rows:
            writer.writerow(
                {
                    "case": row.case,
                    "band": row.band.name,
                    "frequency_mhz": row.band.frequency_mhz,
                    "base_prf_hz": row.base_prf_hz,
                    "min_prf_hz": row.min_prf_hz,
                    "keep_every": row.keep_every,
                    "removed_percent": row.removed_percent,
                    "effective_prf_hz": row.effective_prf_hz,
                    "margin": row.margin,
                    "usable": row.usable,
                }
            )


def print_point_table(points: list[PrfPoint]) -> None:
    print("\nSingle target-depth PRF window")
    print("Band  Freq MHz  Lambda m  Look deg  Doppler edge Hz  Min PRF Hz  Max PRF Hz  Result")
    for point in points:
        print(
            f"{point.band.name:<5}"
            f"{point.band.frequency_mhz:>8.1f}"
            f"{point.band.wavelength_m:>10.3f}"
            f"{point.look_angle_deg:>10.2f}"
            f"{fmt_hz(point.doppler_edge_hz):>17}"
            f"{fmt_hz(point.min_prf_hz):>12}"
            f"{fmt_hz(point.max_prf_hz):>12}"
            f"  {'OK' if point.usable else 'NO WINDOW'}"
        )


def print_sweep_summary(args: argparse.Namespace, bands: list[Band], rows: list[PrfPoint]) -> None:
    print(f"\nDepth sweep fixed-PRF check: 0 to {args.max_depth_km:g} km at {args.altitude_km:g} km altitude")
    print("Band  Fixed usable PRF window                         Deepest per-depth usable")
    for band in bands:
        band_rows = [row for row in rows if row.band == band]
        low, high = fixed_window(band_rows)
        deepest = deepest_usable_depth(band_rows)
        deepest_text = "none" if deepest is None else f"{deepest:g} km"
        print(f"{band.name:<5}{fmt_range(low, high):<48}{deepest_text}")


def print_trace_removal_summary(rows: list[TraceRemovalPoint]) -> None:
    print("\nTrace-removal sweep: lower effective PRF until unusable")
    print("Case                         Band  Keep every  Removed   Effective PRF  Margin   Result")
    for row in rows:
        keep_label = "all" if row.keep_every == 1 else str(row.keep_every)
        margin = "inf" if math.isinf(row.margin) else f"{row.margin:.2f}x"
        print(
            f"{row.case:<29}"
            f"{row.band.name:<6}"
            f"{keep_label:>10}"
            f"{row.removed_percent:>8.1f}%"
            f"{fmt_hz(row.effective_prf_hz):>16}"
            f"{margin:>9}"
            f"  {'OK' if row.usable else 'UNUSABLE'}"
        )


def main() -> None:
    args = parse_args()
    bands = parse_bands(args.bands)
    target_points = [prf_point(args, band, args.altitude_km, args.target_depth_km) for band in bands]
    sweep_rows = [
        prf_point(args, band, args.altitude_km, depth_km)
        for band in bands
        for depth_km in depth_values(args.max_depth_km, args.depth_step_km)
    ]
    trace_rows = trace_rows_for_results(args, bands, target_points, sweep_rows)

    print("Europa Clipper REASON-like usable PRF window check")
    print("This is a simplified model window, not an official NASA flight PRF schedule.")
    print(
        "Inputs: "
        f"altitude={args.altitude_km:g} km, speed={args.speed_km_s:g} km/s, "
        f"ice n={args.ice_index:g}, pulse={args.pulse_us:g} us, "
        f"guard+dead={args.guard_us + args.dead_time_us:g} us, "
        f"safety={args.safety_factor:g}x"
    )
    if args.instrument_cap_hz:
        print(f"Extra instrument/model PRF cap: {fmt_hz(args.instrument_cap_hz)} Hz")

    print("\nFormula:")
    print("  min PRF = 2 * (2 * speed * sin(same-delay look angle) / wavelength) * safety")
    print("  max PRF = 1 / (pulse + guard + dead time + 2 * (altitude + n * depth) / c)")

    print_point_table(target_points)
    print_sweep_summary(args, bands, sweep_rows)
    print_trace_removal_summary(trace_rows)

    if args.csv_output:
        write_csv(args.csv_output, sweep_rows)
        print(f"\nWrote depth sweep CSV: {args.csv_output}")
    if args.trace_csv_output:
        write_trace_csv(args.trace_csv_output, trace_rows)
        print(f"Wrote trace-removal CSV: {args.trace_csv_output}")


if __name__ == "__main__":
    main()
