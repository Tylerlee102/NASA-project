"""Generate browser-ready Europa Clipper flyby states from public SPICE kernels.

The generated JavaScript keeps the GitHub Pages site install-free.  This
script is the reproducible build step: it downloads the named NAIF kernels,
finds Europa closest approaches in the long-horizon reference trajectory,
and samples one encounter in Europa's rotating IAU_EUROPA frame.

Only geometry comes from SPICE.  Radar frequency, PRF candidates, surface
scattering, topography, and REASON timing constraints remain separate model
assumptions in the website.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

try:
    import numpy as np
    import spiceypy as spice
except ImportError as exc:  # pragma: no cover - exercised only without build deps
    raise SystemExit(
        "SpiceyPy is required. Install it with "
        "`python -m pip install -r requirements-spice.txt`."
    ) from exc


ROOT = Path(__file__).resolve().parents[1]
NAIF_ROOT = "https://naif.jpl.nasa.gov/pub/naif/EUROPACLIPPER/kernels"
SPACECRAFT_ID = -159
SPACECRAFT_NAME = "EUROPA CLIPPER"
BODY_NAME = "EUROPA"
BODY_FRAME = "IAU_EUROPA"


@dataclass(frozen=True)
class Kernel:
    kind: str
    filename: str
    relative_url: str

    @property
    def url(self) -> str:
        return f"{NAIF_ROOT}/{self.relative_url}/{self.filename}"


KERNELS = (
    Kernel(
        "SPK",
        "ref_trj_241014_340903_21F31_MEGA_L241014_A300411_LP05_V7_scpse.bsp",
        "spk",
    ),
    Kernel("LSK", "naif0012.tls", "lsk"),
    Kernel("PCK", "pck00010.tpc", "pck"),
)


@dataclass(frozen=True)
class Encounter:
    et: float
    distance_km: float
    altitude_km: float


def default_cache_dir() -> Path:
    if os.name == "nt" and os.environ.get("LOCALAPPDATA"):
        return Path(os.environ["LOCALAPPDATA"]) / "NASA-project" / "spice-kernels"
    base = Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache"))
    return base / "nasa-project" / "spice-kernels"


def positive_float(value: str) -> float:
    number = float(value)
    if number <= 0:
        raise argparse.ArgumentTypeError("value must be positive")
    return number


def positive_int(value: str) -> int:
    number = int(value)
    if number <= 0:
        raise argparse.ArgumentTypeError("value must be a positive integer")
    return number


def odd_sample_count(value: str) -> int:
    number = positive_int(value)
    if number < 3 or number % 2 == 0:
        raise argparse.ArgumentTypeError("sample count must be an odd integer of at least 3")
    return number


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--encounter-number",
        type=positive_int,
        default=10,
        help=(
            "One-based Europa encounter number after --search-start. The default "
            "is encounter 10, whose approximately 24 km altitude preserves the "
            "existing lab's low-altitude scenario while replacing its trajectory."
        ),
    )
    parser.add_argument("--search-start", default="2030-04-01T00:00:00")
    parser.add_argument("--search-end", default="2034-08-01T00:00:00")
    parser.add_argument("--search-step-hours", type=positive_float, default=1.0)
    parser.add_argument(
        "--max-encounter-altitude-km",
        type=positive_float,
        default=5000.0,
        help="Discard local minima above this reference-sphere altitude.",
    )
    parser.add_argument("--half-window-seconds", type=positive_float, default=10.0)
    parser.add_argument("--sample-count", type=odd_sample_count, default=121)
    parser.add_argument("--cache-dir", type=Path, default=default_cache_dir())
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "docs" / "data" / "clipper-flyby.js",
    )
    parser.add_argument(
        "--offline",
        action="store_true",
        help="Use cached kernels only and fail if any are missing.",
    )
    parser.add_argument(
        "--force-download",
        action="store_true",
        help="Download the named kernels again even if cached copies exist.",
    )
    parser.add_argument(
        "--list-encounters",
        action="store_true",
        help="Print all qualifying Europa encounters and exit without writing output.",
    )
    return parser.parse_args()


def download_kernel(kernel: Kernel, cache_dir: Path, offline: bool, force: bool) -> Path:
    cache_dir.mkdir(parents=True, exist_ok=True)
    destination = cache_dir / kernel.filename
    if destination.exists() and destination.stat().st_size > 0 and not force:
        return destination
    if offline:
        raise FileNotFoundError(f"Offline mode: missing kernel {destination}")

    temporary = destination.with_suffix(destination.suffix + ".part")
    request = urllib.request.Request(
        kernel.url,
        headers={"User-Agent": "NASA-project-SPICE-generator/1.0"},
    )
    print(f"Downloading {kernel.kind} {kernel.filename} ...", file=sys.stderr)
    try:
        with urllib.request.urlopen(request, timeout=120) as response, temporary.open("wb") as output:
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
        if temporary.stat().st_size <= 0:
            raise OSError(f"Downloaded kernel is empty: {kernel.url}")
        temporary.replace(destination)
    finally:
        if temporary.exists():
            temporary.unlink()
    return destination


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def norm(vector: np.ndarray) -> float:
    return float(np.linalg.norm(vector))


def unit(vector: np.ndarray) -> np.ndarray:
    length = norm(vector)
    if length <= 0:
        raise ValueError("Cannot normalize a zero-length vector")
    return np.asarray(vector, dtype=float) / length


def distance_to_europa(et: float) -> float:
    state, _ = spice.spkezr(str(SPACECRAFT_ID), float(et), "J2000", "NONE", BODY_NAME)
    return norm(np.asarray(state[:3]))


def refine_minimum(start_et: float, end_et: float, iterations: int = 56) -> tuple[float, float]:
    """Golden-section minimum of spacecraft-to-Europa center distance."""

    inverse_phi = (math.sqrt(5.0) - 1.0) / 2.0
    low = float(start_et)
    high = float(end_et)
    left = high - inverse_phi * (high - low)
    right = low + inverse_phi * (high - low)
    left_distance = distance_to_europa(left)
    right_distance = distance_to_europa(right)

    for _ in range(iterations):
        if left_distance < right_distance:
            high, right, right_distance = right, left, left_distance
            left = high - inverse_phi * (high - low)
            left_distance = distance_to_europa(left)
        else:
            low, left, left_distance = left, right, right_distance
            right = low + inverse_phi * (high - low)
            right_distance = distance_to_europa(right)

    encounter_et = (low + high) / 2.0
    return encounter_et, distance_to_europa(encounter_et)


def find_encounters(
    start_et: float,
    end_et: float,
    step_seconds: float,
    mean_radius_km: float,
    max_altitude_km: float,
) -> list[Encounter]:
    sample_times = np.arange(start_et, end_et + step_seconds, step_seconds, dtype=float)
    states, _ = spice.spkezr(
        str(SPACECRAFT_ID), sample_times, "J2000", "NONE", BODY_NAME
    )
    distances = np.linalg.norm(np.asarray(states)[:, :3], axis=1)
    local_minimum_indexes = np.flatnonzero(
        (distances[1:-1] < distances[:-2])
        & (distances[1:-1] <= distances[2:])
    ) + 1

    # At Europa flyby speeds, a one-hour coarse sample can be tens of thousands
    # of kilometers from the true closest approach. Keep a generous buffer,
    # then apply the exact altitude threshold after refinement.
    candidate_limit_km = mean_radius_km + max_altitude_km + 50_000.0
    encounters: list[Encounter] = []
    for index in local_minimum_indexes:
        if distances[index] > candidate_limit_km:
            continue
        et, distance_km = refine_minimum(sample_times[index - 1], sample_times[index + 1])
        altitude_km = distance_km - mean_radius_km
        if altitude_km <= max_altitude_km:
            encounters.append(Encounter(et, distance_km, altitude_km))
    return sorted(encounters, key=lambda item: item.et)


def et_to_utc(et: float, precision: int = 3) -> str:
    return spice.et2utc(float(et), "ISOC", precision)


def rounded(value: float, digits: int = 9) -> float:
    result = round(float(value), digits)
    return 0.0 if result == 0 else result


def rounded_vector(vector: np.ndarray, digits: int = 9) -> list[float]:
    return [rounded(value, digits) for value in np.asarray(vector)]


def spk_coverage(spk_path: Path) -> tuple[float, float]:
    coverage = spice.spkcov(str(spk_path), SPACECRAFT_ID)
    if spice.wncard(coverage) != 1:
        raise ValueError("Expected one continuous Europa Clipper SPK coverage interval")
    return spice.wnfetd(coverage, 0)


def build_payload(
    args: argparse.Namespace,
    kernel_paths: dict[str, Path],
    encounters: list[Encounter],
    coverage: tuple[float, float],
    radii_km: np.ndarray,
) -> dict[str, object]:
    selected = encounters[args.encounter_number - 1]
    mean_radius_km = float(np.mean(radii_km))
    offsets = np.linspace(
        -args.half_window_seconds,
        args.half_window_seconds,
        args.sample_count,
    )
    sample_times = selected.et + offsets
    states, _ = spice.spkezr(
        str(SPACECRAFT_ID), sample_times, BODY_FRAME, "NONE", BODY_NAME
    )
    states = np.asarray(states, dtype=float)
    center_index = args.sample_count // 2
    closest_state = states[center_index]
    closest_position = closest_state[:3]
    closest_velocity = closest_state[3:]
    radial = unit(closest_position)
    tangential_velocity = closest_velocity - radial * float(np.dot(closest_velocity, radial))
    along_track = unit(tangential_velocity)
    cross_track = unit(np.cross(radial, along_track))

    samples: list[dict[str, object]] = []
    for offset, et, state in zip(offsets, sample_times, states):
        position = state[:3]
        velocity = state[3:]
        distance_km = norm(position)
        radial_speed_km_s = float(np.dot(position, velocity) / distance_km)
        samples.append(
            {
                "offsetSeconds": rounded(offset, 6),
                "utc": et_to_utc(float(et), 3),
                "positionKm": rounded_vector(position),
                "velocityKmS": rounded_vector(velocity),
                "distanceKm": rounded(distance_km, 6),
                "altitudeKm": rounded(distance_km - mean_radius_km, 6),
                "speedKmS": rounded(norm(velocity), 9),
                "radialSpeedKmS": rounded(radial_speed_km_s, 9),
                "alongTrackKm": rounded(float(np.dot(position, along_track)), 6),
                "crossTrackKm": rounded(float(np.dot(position, cross_track)), 6),
            }
        )

    _, longitude_rad, latitude_rad = spice.reclat(closest_position)
    kernel_metadata = []
    for kernel in KERNELS:
        path = kernel_paths[kernel.kind]
        kernel_metadata.append(
            {
                "kind": kernel.kind,
                "filename": kernel.filename,
                "sourceUrl": kernel.url,
                "sha256": sha256(path),
                "sizeBytes": path.stat().st_size,
            }
        )

    selected_speed = norm(closest_velocity)
    selected_radial_speed = float(
        np.dot(closest_position, closest_velocity) / norm(closest_position)
    )
    payload: dict[str, object] = {
        "schemaVersion": 1,
        "generatedAtUtc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "producer": "scripts/generate_spice_flyby_data.py",
        "geometryScope": (
            "Reference trajectory and Europa body-fixed geometry only; radar timing, "
            "PRFs, scattering, topography, and target properties are model assumptions."
        ),
        "spacecraft": {"name": SPACECRAFT_NAME, "naifId": SPACECRAFT_ID},
        "body": {
            "name": BODY_NAME,
            "frame": BODY_FRAME,
            "radiiKm": rounded_vector(radii_km, 6),
            "meanRadiusKm": rounded(mean_radius_km, 6),
        },
        "stateDefinition": {
            "observer": BODY_NAME,
            "frame": BODY_FRAME,
            "aberrationCorrection": "NONE",
            "positionUnits": "km",
            "velocityUnits": "km/s",
        },
        "kernels": kernel_metadata,
        "spkCoverageUtc": {
            "start": et_to_utc(coverage[0], 3),
            "end": et_to_utc(coverage[1], 3),
        },
        "encounterSearch": {
            "startUtc": et_to_utc(spice.str2et(args.search_start), 3),
            "endUtc": et_to_utc(spice.str2et(args.search_end), 3),
            "coarseStepHours": args.search_step_hours,
            "maximumAltitudeKm": args.max_encounter_altitude_km,
            "encounterCount": len(encounters),
            "selectedNumber": args.encounter_number,
        },
        "closestApproach": {
            "utc": et_to_utc(selected.et, 3),
            "ephemerisTime": rounded(selected.et, 6),
            "distanceKm": rounded(selected.distance_km, 6),
            "altitudeKm": rounded(selected.altitude_km, 6),
            "speedKmS": rounded(selected_speed, 9),
            "radialSpeedKmS": rounded(selected_radial_speed, 9),
            "subSpacecraftLongitudeDeg": rounded(math.degrees(longitude_rad), 6),
            "subSpacecraftLatitudeDeg": rounded(math.degrees(latitude_rad), 6),
        },
        "localBasis": {
            "radial": rounded_vector(radial),
            "alongTrack": rounded_vector(along_track),
            "crossTrack": rounded_vector(cross_track),
        },
        "window": {
            "startOffsetSeconds": rounded(float(offsets[0]), 6),
            "endOffsetSeconds": rounded(float(offsets[-1]), 6),
            "sampleCount": args.sample_count,
            "stepSeconds": rounded(float(offsets[1] - offsets[0]), 9),
        },
        "samples": samples,
    }
    validate_payload(payload)
    return payload


def validate_payload(payload: dict[str, object]) -> None:
    samples = payload["samples"]
    assert isinstance(samples, list) and len(samples) >= 3
    offsets = [float(sample["offsetSeconds"]) for sample in samples]
    if offsets != sorted(offsets):
        raise ValueError("Generated sample offsets are not monotonic")
    center = samples[len(samples) // 2]
    if not math.isclose(float(center["offsetSeconds"]), 0.0, abs_tol=1e-9):
        raise ValueError("Generated sample window does not contain closest approach at zero")
    closest = payload["closestApproach"]
    if not math.isclose(
        float(center["altitudeKm"]),
        float(closest["altitudeKm"]),
        abs_tol=1e-3,
    ):
        raise ValueError("Center sample altitude does not match the refined closest approach")
    if abs(float(center["radialSpeedKmS"])) > 1e-4:
        raise ValueError("Center sample is not a radial-distance minimum")


def write_javascript(payload: dict[str, object], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(payload, indent=2, ensure_ascii=False, allow_nan=False)
    output_path.write_text(
        "// Generated by scripts/generate_spice_flyby_data.py; do not edit by hand.\n"
        f"window.CLIPPER_SPICE_FLYBY = {serialized};\n",
        encoding="utf-8",
        newline="\n",
    )


def main() -> int:
    args = parse_args()
    kernel_paths = {
        kernel.kind: download_kernel(kernel, args.cache_dir, args.offline, args.force_download)
        for kernel in KERNELS
    }

    spice.kclear()
    try:
        for kernel in KERNELS:
            spice.furnsh(str(kernel_paths[kernel.kind]))
        coverage = spk_coverage(kernel_paths["SPK"])
        search_start = max(spice.str2et(args.search_start), coverage[0])
        search_end = min(spice.str2et(args.search_end), coverage[1])
        if search_start >= search_end:
            raise ValueError("Requested encounter search does not overlap SPK coverage")

        radii_km = np.asarray(spice.bodvrd(BODY_NAME, "RADII", 3)[1], dtype=float)
        mean_radius_km = float(np.mean(radii_km))
        encounters = find_encounters(
            search_start,
            search_end,
            args.search_step_hours * 3600.0,
            mean_radius_km,
            args.max_encounter_altitude_km,
        )
        if not encounters:
            raise ValueError("No qualifying Europa closest approaches were found")

        if args.list_encounters:
            for number, encounter in enumerate(encounters, start=1):
                print(
                    f"{number:2d}  {et_to_utc(encounter.et, 3)}  "
                    f"altitude={encounter.altitude_km:9.3f} km"
                )
            return 0

        if args.encounter_number > len(encounters):
            raise ValueError(
                f"Encounter {args.encounter_number} requested, but only "
                f"{len(encounters)} qualifying encounters were found"
            )

        payload = build_payload(args, kernel_paths, encounters, coverage, radii_km)
        write_javascript(payload, args.output)
        closest = payload["closestApproach"]
        print(
            f"Wrote {args.output} with encounter {args.encounter_number}/{len(encounters)}: "
            f"{closest['utc']}, altitude {closest['altitudeKm']:.3f} km, "
            f"speed {closest['speedKmS']:.3f} km/s"
        )
        return 0
    finally:
        spice.kclear()


if __name__ == "__main__":
    raise SystemExit(main())
