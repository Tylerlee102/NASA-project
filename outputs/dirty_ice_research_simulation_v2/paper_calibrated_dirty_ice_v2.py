from __future__ import annotations

import html
import json
import math
import sys
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = ROOT.parents[1]
LEGACY_DIR = PROJECT_ROOT / "outputs" / "dirty_ice_research_simulation"
if str(LEGACY_DIR) not in sys.path:
    sys.path.insert(0, str(LEGACY_DIR))

import dirty_ice_simulation as legacy  # noqa: E402


RESULTS_CSV = ROOT / "paper_calibrated_v2_results.csv"
SUMMARY_CSV = ROOT / "paper_calibrated_v2_summary.csv"
BASELINE_CSV = ROOT / "paper_calibrated_v2_baseline.csv"
CALIBRATION_CSV = ROOT / "paper_calibration_parameters.csv"
CALIBRATION_JSON = ROOT / "paper_calibration_parameters.json"
MATERIAL_LIBRARY_CSV = ROOT / "paper_material_library.csv"
MATERIAL_LIBRARY_JSON = ROOT / "paper_material_library.json"
PHYSICS_VALIDATION_CSV = ROOT / "physics_validation_checks.csv"
PHYSICS_VALIDATION_JSON = ROOT / "physics_validation_checks.json"
COMPARISON_CSV = ROOT / "v1_v2_headline_comparison.csv"
SENSITIVITY_CSV = ROOT / "paper_calibrated_v2_attenuation_sensitivity.csv"
REPORT_HTML = ROOT / "paper_calibrated_v2_report.html"
RUN_METADATA = ROOT / "paper_calibrated_v2_run_metadata.json"


ICE_EPS = 3.15
PORE_CLOSE_EPS = 2.8
BRINE_FILLED_ICE_EPS = 9.0
HYDRATED_SALT_EPS = 5.0
VOID_EPS = 1.0
WATER_EPS = 80.0

SNR_DETECTION_THRESHOLD_DB = 0.0
AMBIGUITY_WINDOW_DB = 3.0

SOURCE_REASON = "Blankenship et al. 2024, REASON"
SOURCE_NASA = "NASA Europa Clipper instruments page"
SOURCE_MARS_ANALOG = "Lalich et al. 2021 / Mars analog"
SOURCE_DIELECTRIC_REVIEW = "Pettinelli et al. 2015 review"
SOURCE_MODEL = "v2 sensitivity model"
SOURCE_CLUTTER = "Blankenship et al. 2024 REASON; Castelletti et al. 2017; Scanlan et al. 2020"


@dataclass(frozen=True)
class Material:
    key: str
    label: str
    eps_real: float
    attenuation_db_km_hf_min: float
    attenuation_db_km_hf_max: float
    source: str
    source_status: str
    link: str
    note: str


@dataclass(frozen=True)
class RadarBand:
    name: str
    center_mhz: float
    bandwidth_mhz: float
    wavelength_m: float
    vertical_resolution_m: float
    nominal_depth_limit_m: float
    dynamic_range_db: float
    reference_depth_m: float
    reference_clean_margin_db: float
    radiometric_penalty_db: float
    role: str
    source_status: str
    note: str


@dataclass(frozen=True)
class ScenarioConfig:
    name: str
    description: str
    thermal_mode: str
    include_salt: bool = False
    include_near_surface_brine: bool = False
    include_stacked_dirty_layers: bool = False
    include_briny_lens: bool = False
    include_voids: bool = False
    include_surface_clutter: bool = False
    clutter_strength: float = 0.0


@dataclass(frozen=True)
class Layer:
    top_m: float
    thickness_m: float
    eps: float
    attenuation_db_km_hf: float
    label: str
    source_status: str
    source: str

    @property
    def bottom_m(self) -> float:
        return self.top_m + self.thickness_m


MATERIALS: dict[str, Material] = {
    "clean_ice": Material(
        key="clean_ice",
        label="Clean compact water ice",
        eps_real=ICE_EPS,
        attenuation_db_km_hf_min=0.2,
        attenuation_db_km_hf_max=0.7,
        source=SOURCE_REASON,
        source_status="Directly paper anchored epsilon; attenuation profile modeled",
        link="https://link.springer.com/article/10.1007/s11214-024-01072-3",
        note="REASON uses compact hexagonal ice epsilon near 3.15; low-loss cold ice is represented by the conductive background profile.",
    ),
    "pore_close_ice": Material(
        key="pore_close_ice",
        label="Pore close-off / porous ice endmember",
        eps_real=PORE_CLOSE_EPS,
        attenuation_db_km_hf_min=0.2,
        attenuation_db_km_hf_max=1.2,
        source=SOURCE_REASON,
        source_status="Directly paper anchored epsilon; attenuation bracketed",
        link="https://link.springer.com/article/10.1007/s11214-024-01072-3",
        note="Used as the low-permittivity endmember for porous or void-rich contrasts.",
    ),
    "brine_filled_ice": Material(
        key="brine_filled_ice",
        label="Brine-filled ice",
        eps_real=BRINE_FILLED_ICE_EPS,
        attenuation_db_km_hf_min=5.0,
        attenuation_db_km_hf_max=18.0,
        source=SOURCE_REASON,
        source_status="Directly paper anchored epsilon; high-loss bracket modeled",
        link="https://link.springer.com/article/10.1007/s11214-024-01072-3",
        note="REASON adopts epsilon 9 for brine-filled ice; conductivity and loss depend on brine geometry and temperature.",
    ),
    "hydrated_salt": Material(
        key="hydrated_salt",
        label="Hydrated salt layer",
        eps_real=HYDRATED_SALT_EPS,
        attenuation_db_km_hf_min=0.7,
        attenuation_db_km_hf_max=2.0,
        source=SOURCE_REASON,
        source_status="Directly paper anchored epsilon and layer thicknesses",
        link="https://link.springer.com/article/10.1007/s11214-024-01072-3",
        note="REASON uses epsilon 5 for hydrated salt layers and discusses 1 m and 0.2 m salt-layer cases.",
    ),
    "dirty_mixed_ice": Material(
        key="dirty_mixed_ice",
        label="Mixed dirty ice bracket",
        eps_real=6.2,
        attenuation_db_km_hf_min=1.4,
        attenuation_db_km_hf_max=7.8,
        source=f"{SOURCE_REASON}; {SOURCE_DIELECTRIC_REVIEW}",
        source_status="Sensitivity bracket from paper-supported material families",
        link="https://link.springer.com/article/10.1007/s11214-024-01072-3",
        note="Represents salts, acid hydrates, clathrates, radiolytic products, and mixed inclusions whose lab values remain uncertain.",
    ),
    "void_porous_fracture": Material(
        key="void_porous_fracture",
        label="Void/porous fracture contrast",
        eps_real=2.2,
        attenuation_db_km_hf_min=0.2,
        attenuation_db_km_hf_max=1.2,
        source=SOURCE_DIELECTRIC_REVIEW,
        source_status="Sensitivity bracket",
        link="https://doi.org/10.1002/2014RG000463",
        note="Void space lowers effective permittivity; exact response depends on geometry and volume fraction.",
    ),
    "liquid_ocean": Material(
        key="liquid_ocean",
        label="Liquid water/ocean endmember",
        eps_real=WATER_EPS,
        attenuation_db_km_hf_min=0.0,
        attenuation_db_km_hf_max=0.0,
        source=SOURCE_MODEL,
        source_status="Model endmember",
        link="",
        note="Used only as a high-permittivity ocean boundary endmember; ocean salinity and loss are not modeled internally.",
    ),
}


BANDS: dict[str, RadarBand] = {
    "HF_9MHz_full_depth": RadarBand(
        name="HF_9MHz_full_depth",
        center_mhz=9.0,
        bandwidth_mhz=1.0,
        wavelength_m=33.3,
        vertical_resolution_m=300.0,
        nominal_depth_limit_m=30_000.0,
        dynamic_range_db=40.0,
        reference_depth_m=30_000.0,
        reference_clean_margin_db=6.0,
        radiometric_penalty_db=0.0,
        role="Full-depth, lower-resolution sounding; primary deep-ocean stress test.",
        source_status="Directly paper anchored",
        note="REASON HF uses 9 MHz center frequency, 1 MHz bandwidth, about 300 m vertical resolution in ice, and full-depth sounding to about 30 km.",
    ),
    "VHF_60MHz_shallow": RadarBand(
        name="VHF_60MHz_shallow",
        center_mhz=60.0,
        bandwidth_mhz=10.0,
        wavelength_m=5.0,
        vertical_resolution_m=30.0,
        nominal_depth_limit_m=3_000.0,
        dynamic_range_db=35.0,
        reference_depth_m=3_000.0,
        reference_clean_margin_db=10.0,
        radiometric_penalty_db=0.0,
        role="High-resolution shallow sounding and clutter discrimination support.",
        source_status="Directly paper anchored",
        note="REASON VHF shallow sounding uses 60 MHz center frequency, 10 MHz bandwidth, about 30 m vertical resolution in ice, and shallow sounding to about 3 km.",
    ),
    "VHF_60MHz_full_depth_lowDR": RadarBand(
        name="VHF_60MHz_full_depth_lowDR",
        center_mhz=60.0,
        bandwidth_mhz=10.0,
        wavelength_m=5.0,
        vertical_resolution_m=30.0,
        nominal_depth_limit_m=30_000.0,
        dynamic_range_db=35.0,
        reference_depth_m=30_000.0,
        reference_clean_margin_db=-6.0,
        radiometric_penalty_db=8.0,
        role="Full-depth VHF sensitivity check with reduced radiometric fidelity.",
        source_status="Paper anchored plus model penalty",
        note="The REASON paper describes full-depth VHF to about 30 km as single-bit, low dynamic range; v2 models that as a conservative SNR penalty.",
    ),
}


SCENARIOS: dict[str, ScenarioConfig] = {
    "clean_ice_control": ScenarioConfig(
        name="clean_ice_control",
        description="Clean conductive ice with no internal false reflectors.",
        thermal_mode="cold_conductive",
    ),
    "salt_layers_reason": ScenarioConfig(
        name="salt_layers_reason",
        description="REASON salt-layer target interfaces: 1 m ocean-injected salt layer and 0.2 m melt-derived salt layer where depth allows.",
        thermal_mode="cold_conductive",
        include_salt=True,
    ),
    "near_surface_brine": ScenarioConfig(
        name="near_surface_brine",
        description="Near-surface brine-filled ice modes from the REASON point-model table.",
        thermal_mode="cold_conductive",
        include_near_surface_brine=True,
    ),
    "warm_impure_ice": ScenarioConfig(
        name="warm_impure_ice",
        description="No sharp dirty layer, but warmer/impure ice raises attenuation toward the basal interface.",
        thermal_mode="warm_impure",
    ),
    "stacked_dirty_layers": ScenarioConfig(
        name="stacked_dirty_layers",
        description="A stack of sub-resolution dirty layers to test false bright boundaries.",
        thermal_mode="warm_impure",
        include_stacked_dirty_layers=True,
    ),
    "briny_mushy_lens": ScenarioConfig(
        name="briny_mushy_lens",
        description="Conductive briny/mushy lens that is reflective at the top and lossy below.",
        thermal_mode="warm_impure",
        include_briny_lens=True,
    ),
    "complex_paper_calibrated": ScenarioConfig(
        name="complex_paper_calibrated",
        description="Combined salt, briny lens, stacked dirty layers, void/porosity contrast, and convective dirty attenuation.",
        thermal_mode="dirty_convective",
        include_salt=True,
        include_near_surface_brine=True,
        include_stacked_dirty_layers=True,
        include_briny_lens=True,
        include_voids=True,
    ),
    "rough_surface_clutter": ScenarioConfig(
        name="rough_surface_clutter",
        description="Clean ice plus VHF off-nadir clutter from rough or tilted surface features.",
        thermal_mode="cold_conductive",
        include_surface_clutter=True,
        clutter_strength=0.85,
    ),
    "complex_with_clutter": ScenarioConfig(
        name="complex_with_clutter",
        description="Complex dirty ice plus VHF off-nadir clutter stress test.",
        thermal_mode="dirty_convective",
        include_salt=True,
        include_near_surface_brine=True,
        include_stacked_dirty_layers=True,
        include_briny_lens=True,
        include_voids=True,
        include_surface_clutter=True,
        clutter_strength=1.0,
    ),
}


SHELL_MODES = {
    "thin_3km_reason_mode": {
        "target_ocean_mean_m": 3_000.0,
        "target_ocean_limit_m": 3_000.0,
        "source_status": "Directly paper anchored",
        "note": "REASON point models include a thin ice layer extending to 3 km depth; v2 caps this mode at 3 km.",
    },
    "workbook_mid_shell": {
        "target_ocean_mean_m": None,
        "target_ocean_limit_m": None,
        "source_status": "Current workbook baseline",
        "note": "Keeps the current workbook-derived mean ocean depth for comparison with v1.",
    },
    "thick_30km_reason_mode": {
        "target_ocean_mean_m": 30_000.0,
        "target_ocean_limit_m": 30_000.0,
        "source_status": "Directly paper anchored",
        "note": "REASON full-depth subsurface mode extends to 30 km; v2 caps this mode at 30 km.",
    },
}


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def smoothstep(edge0: float, edge1: float, x: float) -> float:
    if edge0 == edge1:
        return 0.0
    t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def gaussian_patch(x_km: float, center_km: float, width_km: float) -> float:
    return math.exp(-0.5 * ((x_km - center_km) / width_km) ** 2)


def reflection_amplitude(eps_a: float, eps_b: float) -> float:
    na = math.sqrt(max(eps_a, 1e-9))
    nb = math.sqrt(max(eps_b, 1e-9))
    return (nb - na) / (nb + na)


def reflection_power_db(eps_a: float, eps_b: float) -> float:
    return 20.0 * math.log10(max(abs(reflection_amplitude(eps_a, eps_b)), 1e-12))


def transfer_matrix_reflection_amplitude(group: list[dict], band: RadarBand) -> complex:
    interfaces = sorted(group, key=lambda item: float(item["depth_m"]))
    if not interfaces:
        return 0.0 + 0.0j
    if len(interfaces) == 1:
        rec = interfaces[0]
        return complex(reflection_amplitude(float(rec["eps_before"]), float(rec["eps_after"])), 0.0)

    incident_eps = float(interfaces[0]["eps_before"])
    substrate_eps = float(interfaces[-1]["eps_after"])
    layer_eps = [float(rec["eps_after"]) for rec in interfaces[:-1]]
    thicknesses_m = [
        max(0.0, float(interfaces[i + 1]["depth_m"]) - float(interfaces[i]["depth_m"]))
        for i in range(len(interfaces) - 1)
    ]

    matrix = np.identity(2, dtype=complex)
    wavelength_vac_m = 299_792_458.0 / (band.center_mhz * 1_000_000.0)
    for eps, thickness in zip(layer_eps, thicknesses_m):
        n = math.sqrt(max(eps, 1e-9))
        delta = 2.0 * math.pi * n * thickness / wavelength_vac_m
        cos_delta = math.cos(delta)
        sin_delta = math.sin(delta)
        layer_matrix = np.array(
            [
                [cos_delta, 1j * sin_delta / n],
                [1j * n * sin_delta, cos_delta],
            ],
            dtype=complex,
        )
        matrix = matrix @ layer_matrix

    q0 = math.sqrt(max(incident_eps, 1e-9))
    qs = math.sqrt(max(substrate_eps, 1e-9))
    numerator = q0 * matrix[0, 0] + q0 * qs * matrix[0, 1] - matrix[1, 0] - qs * matrix[1, 1]
    denominator = q0 * matrix[0, 0] + q0 * qs * matrix[0, 1] + matrix[1, 0] + qs * matrix[1, 1]
    if abs(denominator) < 1e-12:
        return 0.0 + 0.0j
    return complex(numerator / denominator)


def frequency_loss_scale(band: RadarBand) -> float:
    # Frequency scaling is kept explicit because the paper gives qualitative band behavior,
    # not a single universal attenuation law for every dirty-ice mixture.
    return math.sqrt(band.center_mhz / 9.0)


def clean_hf_rate_db_km(depth_m: float, ocean_depth_m: float, thermal_mode: str) -> float:
    frac = clamp(depth_m / max(ocean_depth_m, 1.0), 0.0, 1.0)
    if thermal_mode == "cold_conductive":
        return 0.20 + 0.50 * smoothstep(0.82, 1.0, frac)
    if thermal_mode == "warm_impure":
        return 0.35 + 1.35 * smoothstep(0.62, 1.0, frac)
    if thermal_mode == "dirty_convective":
        return 0.55 + 2.00 * smoothstep(0.35, 1.0, frac)
    raise ValueError(f"Unknown thermal mode: {thermal_mode}")


def clean_ice_loss_to_depth(depth_m: float, ocean_depth_m: float, band: RadarBand, thermal_mode: str) -> float:
    depth_m = max(float(depth_m), 0.0)
    if depth_m == 0:
        return 0.0
    n = int(clamp(math.ceil(depth_m / 250.0), 12, 160))
    edges = np.linspace(0.0, depth_m, n + 1)
    mids = 0.5 * (edges[:-1] + edges[1:])
    rates = np.array([clean_hf_rate_db_km(float(mid), ocean_depth_m, thermal_mode) for mid in mids])
    return float(np.sum(rates * np.diff(edges) / 1000.0) * frequency_loss_scale(band))


def layer_extra_loss_to_depth(
    depth_m: float,
    ocean_depth_m: float,
    layers: list[Layer],
    band: RadarBand,
    thermal_mode: str,
) -> float:
    extra = 0.0
    scale = frequency_loss_scale(band)
    for layer in layers:
        overlap = max(0.0, min(depth_m, layer.bottom_m) - layer.top_m)
        if overlap <= 0:
            continue
        mid = layer.top_m + 0.5 * overlap
        background = clean_hf_rate_db_km(mid, ocean_depth_m, thermal_mode)
        extra_rate = max(0.0, layer.attenuation_db_km_hf - background)
        extra += extra_rate * scale * overlap / 1000.0
    return extra


def total_one_way_loss_db(
    depth_m: float,
    ocean_depth_m: float,
    layers: list[Layer],
    band: RadarBand,
    thermal_mode: str,
) -> float:
    return clean_ice_loss_to_depth(depth_m, ocean_depth_m, band, thermal_mode) + layer_extra_loss_to_depth(
        depth_m, ocean_depth_m, layers, band, thermal_mode
    )


def band_gain_db(band: RadarBand) -> float:
    reference_loss = clean_ice_loss_to_depth(
        band.reference_depth_m,
        band.reference_depth_m,
        band,
        "cold_conductive",
    )
    water_reflectivity = reflection_power_db(ICE_EPS, WATER_EPS)
    return band.reference_clean_margin_db - water_reflectivity + 2.0 * reference_loss + band.radiometric_penalty_db


BAND_GAINS_DB = {name: band_gain_db(band) for name, band in BANDS.items()}


def roughness_penalty_db(row: pd.Series, band: RadarBand) -> float:
    slope = abs(float(row.surface_slope_deg))
    return slope * (0.05 if band.center_mhz <= 9.0 else 0.14)


def surface_roughness_index(row: pd.Series) -> float:
    """Deterministic along-track roughness proxy for clutter stress testing."""
    x = float(row.x_km)
    slope_component = min(abs(float(row.surface_slope_deg)) / 2.4, 1.0)
    terrain_component = max(
        gaussian_patch(x, -44.0, 16.0),
        0.85 * gaussian_patch(x, 7.0, 21.0),
        0.95 * gaussian_patch(x, 39.0, 15.0),
    )
    waviness = 0.5 + 0.5 * math.sin(2.0 * math.pi * (x + 9.0) / 47.0)
    return clamp(0.18 + 0.42 * slope_component + 0.34 * terrain_component + 0.16 * waviness, 0.0, 1.0)


def surface_clutter_echo(
    row: pd.Series,
    band: RadarBand,
    cfg: ScenarioConfig,
) -> tuple[float, float, str, str, float]:
    if not cfg.include_surface_clutter or band.center_mhz < 60.0:
        return -999.0, math.nan, "none", "none", 0.0

    roughness = surface_roughness_index(row)
    x = float(row.x_km)
    apparent_fraction = clamp(
        0.48 + 0.34 * math.sin(2.0 * math.pi * (x + 12.0) / 83.0) + 0.18 * roughness,
        0.05,
        0.98,
    )
    apparent_depth_m = 150.0 + apparent_fraction * 2_850.0

    # A stress-test proxy for bright off-nadir surface returns in the VHF shallow
    # window. REASON's actual VHF interferometry would use phase to discriminate
    # this clutter; v2 only flags the ambiguity.
    mode_penalty = 0.0 if band.name == "VHF_60MHz_shallow" else 3.0 + 0.25 * band.radiometric_penalty_db
    snr_margin_db = -6.0 + 19.0 * roughness * cfg.clutter_strength - mode_penalty
    label = "off-nadir surface clutter equivalent-depth echo"
    source_status = "Paper anchored as a VHF clutter mechanism; amplitude is sensitivity-modeled"
    return snr_margin_db, apparent_depth_m, label, source_status, roughness


def interface_snr_db(
    depth_m: float,
    eps_before: float,
    eps_after: float,
    row: pd.Series,
    layers: list[Layer],
    band: RadarBand,
    thermal_mode: str,
) -> float:
    one_way_loss = total_one_way_loss_db(depth_m, float(row.ocean_depth_m), layers, band, thermal_mode)
    return (
        BAND_GAINS_DB[band.name]
        + reflection_power_db(eps_before, eps_after)
        - 2.0 * one_way_loss
        - roughness_penalty_db(row, band)
        - band.radiometric_penalty_db
    )


def make_shell_baseline(
    base: pd.DataFrame,
    mode_name: str,
    target_mean_m: float | None,
    target_limit_m: float | None,
) -> pd.DataFrame:
    df = base.copy()
    if target_mean_m is None:
        scale = 1.0
    else:
        scale = target_mean_m / float(base.ocean_depth_m.mean())

    for col in ["upper_depth_m", "lens_depth_m", "ocean_depth_m"]:
        df[col] = df[col].astype(float) * scale

    if target_limit_m is not None:
        df["ocean_depth_m"] = np.minimum(df["ocean_depth_m"], target_limit_m)

    df["upper_depth_m"] = np.clip(df["upper_depth_m"], 80.0, df["ocean_depth_m"] * 0.45)
    df["lens_depth_m"] = np.clip(df["lens_depth_m"], df["upper_depth_m"] + 120.0, df["ocean_depth_m"] - 300.0)
    df["ocean_depth_m"] = np.maximum(df["ocean_depth_m"], 900.0)
    df["shell_mode"] = mode_name
    df["shell_scale_from_workbook"] = scale
    return df


def build_v2_baseline() -> pd.DataFrame:
    workbook_inputs = legacy.load_inputs()
    base = legacy.compute_baseline(workbook_inputs)
    frames = [
        make_shell_baseline(base, mode_name, cfg["target_ocean_mean_m"], cfg["target_ocean_limit_m"])
        for mode_name, cfg in SHELL_MODES.items()
    ]
    return pd.concat(frames, ignore_index=True)


def add_salt_layers(row: pd.Series, layers: list[Layer]) -> None:
    ocean = float(row.ocean_depth_m)
    material = MATERIALS["hydrated_salt"]
    half_depth = clamp(0.50 * ocean, 700.0, max(750.0, ocean - 500.0))
    layers.append(
        Layer(
            top_m=half_depth,
            thickness_m=1.0,
            eps=material.eps_real,
            attenuation_db_km_hf=material.attenuation_db_km_hf_min,
            label="1 m ocean-injected hydrated salt layer",
            source_status=material.source_status,
            source=material.source,
        )
    )
    if ocean > 11_000.0:
        layers.append(
            Layer(
                top_m=min(10_000.0, ocean - 800.0),
                thickness_m=0.2,
                eps=material.eps_real,
                attenuation_db_km_hf=material.attenuation_db_km_hf_min,
                label="0.2 m melt-derived hydrated salt layer near 10 km",
                source_status=material.source_status,
                source=material.source,
            )
        )


def add_near_surface_brine(row: pd.Series, layers: list[Layer]) -> None:
    x = float(row.x_km)
    material = MATERIALS["brine_filled_ice"]
    strength = max(gaussian_patch(x, -18.0, 22.0), 0.8 * gaussian_patch(x, 34.0, 18.0))
    if strength < 0.18:
        return
    thickness = 0.5 if strength < 0.45 else 200.0
    attenuation = material.attenuation_db_km_hf_min + (material.attenuation_db_km_hf_max - material.attenuation_db_km_hf_min) * strength
    layers.append(
        Layer(
            top_m=60.0 + 25.0 * math.sin(2.0 * math.pi * x / 70.0),
            thickness_m=thickness,
            eps=material.eps_real,
            attenuation_db_km_hf=attenuation,
            label=f"{thickness:g} m near-surface brine-filled ice layer",
            source_status=material.source_status,
            source=material.source,
        )
    )


def add_stacked_dirty_layers(row: pd.Series, layers: list[Layer]) -> None:
    x = float(row.x_km)
    ocean = float(row.ocean_depth_m)
    dirty = MATERIALS["dirty_mixed_ice"]
    porous = MATERIALS["pore_close_ice"]
    envelope = max(gaussian_patch(x, -34.0, 18.0), gaussian_patch(x, 24.0, 19.0), 0.55 * gaussian_patch(x, 49.0, 13.0))
    if envelope < 0.22:
        return
    stack_center = 0.72 * ocean + 0.035 * ocean * math.sin(2.0 * math.pi * (x + 14.0) / 78.0)
    offsets = [-260.0, -155.0, -72.0, 24.0, 112.0, 230.0]
    eps_values = [4.1, 6.0, porous.eps_real, 7.7, 4.8, 8.5]
    att_values = [2.3, 4.1, porous.attenuation_db_km_hf_max, 6.4, 3.2, dirty.attenuation_db_km_hf_max]
    thickness_values = [0.5, 1.0, 18.0, 32.0, 85.0, 200.0]
    for off, eps, att, thickness in zip(offsets, eps_values, att_values, thickness_values):
        scaled_top = clamp(stack_center + off, 250.0, ocean - thickness - 250.0)
        layers.append(
            Layer(
                top_m=scaled_top,
                thickness_m=thickness,
                eps=eps,
                attenuation_db_km_hf=att * (0.75 + 0.55 * envelope),
                label="paper-bracketed stacked dirty layer",
                source_status=dirty.source_status,
                source=f"{dirty.source}; {SOURCE_MARS_ANALOG}",
            )
        )


def add_briny_lens(row: pd.Series, layers: list[Layer]) -> None:
    lens_strength = float(row.lens_strength)
    if lens_strength < 0.06:
        return
    material = MATERIALS["brine_filled_ice"]
    ocean = float(row.ocean_depth_m)
    thickness = min(0.18 * ocean, 80.0 + 720.0 * lens_strength)
    eps = material.eps_real + 14.0 * lens_strength
    attenuation = 10.0 + 20.0 * lens_strength
    top = clamp(float(row.lens_depth_m) - thickness / 2.0, 180.0, ocean - thickness - 250.0)
    layers.append(
        Layer(
            top_m=top,
            thickness_m=thickness,
            eps=eps,
            attenuation_db_km_hf=attenuation,
            label="conductive briny/mushy lens",
            source_status=material.source_status,
            source=material.source,
        )
    )


def add_void_layers(row: pd.Series, layers: list[Layer]) -> None:
    x = float(row.x_km)
    ocean = float(row.ocean_depth_m)
    material = MATERIALS["void_porous_fracture"]
    envelope = max(gaussian_patch(x, -8.0, 16.0), 0.6 * gaussian_patch(x, 41.0, 14.0))
    if envelope < 0.25:
        return
    depth = clamp(0.42 * ocean + 0.025 * ocean * math.sin(2.0 * math.pi * x / 55.0), 220.0, ocean - 500.0)
    layers.append(
        Layer(
            top_m=depth,
            thickness_m=45.0 + 80.0 * envelope,
            eps=material.eps_real + 0.35 * envelope,
            attenuation_db_km_hf=material.attenuation_db_km_hf_max,
            label="void/porous fracture contrast",
            source_status=material.source_status,
            source=material.source,
        )
    )


def layers_for_scenario(row: pd.Series, cfg: ScenarioConfig) -> list[Layer]:
    layers: list[Layer] = []
    if cfg.include_salt:
        add_salt_layers(row, layers)
    if cfg.include_near_surface_brine:
        add_near_surface_brine(row, layers)
    if cfg.include_stacked_dirty_layers:
        add_stacked_dirty_layers(row, layers)
    if cfg.include_briny_lens:
        add_briny_lens(row, layers)
    if cfg.include_voids:
        add_void_layers(row, layers)
    return sorted(layers, key=lambda layer: layer.top_m)


def interface_records(layers: list[Layer], ocean_depth_m: float) -> list[dict]:
    records: list[dict] = []
    for layer in layers:
        records.append(
            {
                "depth_m": layer.top_m,
                "eps_before": ICE_EPS,
                "eps_after": layer.eps,
                "label": f"top {layer.label}",
                "source_status": layer.source_status,
            }
        )
        records.append(
            {
                "depth_m": layer.bottom_m,
                "eps_before": layer.eps,
                "eps_after": ICE_EPS,
                "label": f"base {layer.label}",
                "source_status": layer.source_status,
            }
        )
    records.append(
        {
            "depth_m": ocean_depth_m,
            "eps_before": ICE_EPS,
            "eps_after": WATER_EPS,
            "label": "true ice-ocean boundary",
            "source_status": "Physical target interface",
        }
    )
    return sorted(records, key=lambda item: item["depth_m"])


def strongest_false_echo(
    row: pd.Series,
    layers: list[Layer],
    band: RadarBand,
    thermal_mode: str,
) -> tuple[float, float, str, str]:
    records = [
        rec
        for rec in interface_records(layers, float(row.ocean_depth_m))
        if rec["label"] != "true ice-ocean boundary" and rec["depth_m"] <= band.nominal_depth_limit_m
    ]
    if not records:
        return -999.0, math.nan, "none", "none"

    best_snr = -999.0
    best_depth = math.nan
    best_label = "none"
    best_source_status = "none"

    for rec in records:
        center = float(rec["depth_m"])
        group = sorted(
            [r for r in records if abs(float(r["depth_m"]) - center) <= band.vertical_resolution_m / 2.0],
            key=lambda item: float(item["depth_m"]),
        )
        labels = [str(grouped["label"]) for grouped in group]
        statuses = [str(grouped["source_status"]) for grouped in group]
        local_reflection = transfer_matrix_reflection_amplitude(group, band)
        one_way_loss = total_one_way_loss_db(center, float(row.ocean_depth_m), layers, band, thermal_mode)
        combined_snr = (
            BAND_GAINS_DB[band.name]
            + 20.0 * math.log10(max(abs(local_reflection), 1e-12))
            - 2.0 * one_way_loss
            - roughness_penalty_db(row, band)
            - band.radiometric_penalty_db
        )
        if combined_snr > best_snr:
            best_snr = combined_snr
            best_depth = center
            best_label = "; ".join(sorted(set(labels)))[:180]
            best_source_status = "; ".join(sorted(set(statuses)))[:180]
    return best_snr, best_depth, best_label, best_source_status


def classify_echoes(
    ocean_snr_db: float,
    false_snr_db: float,
    false_depth_m: float,
    ocean_depth_m: float,
    ocean_in_band_window: bool,
) -> str:
    false_detected = false_snr_db >= SNR_DETECTION_THRESHOLD_DB
    ocean_detected = ocean_in_band_window and ocean_snr_db >= SNR_DETECTION_THRESHOLD_DB
    if not ocean_in_band_window:
        if false_detected:
            return "internal feature only"
        return "outside band depth window"

    deep_confuser = False
    if math.isfinite(false_depth_m) and ocean_depth_m > 0:
        ratio = false_depth_m / ocean_depth_m
        deep_confuser = 0.62 <= ratio <= 1.05

    if ocean_detected and (not false_detected or false_snr_db < ocean_snr_db - AMBIGUITY_WINDOW_DB):
        return "clear ocean boundary"
    if ocean_detected and false_detected and not deep_confuser:
        return "clear ocean boundary"
    if ocean_detected and false_detected and deep_confuser and abs(false_snr_db - ocean_snr_db) <= AMBIGUITY_WINDOW_DB:
        return "ambiguous"
    if false_detected and deep_confuser and false_snr_db > ocean_snr_db + AMBIGUITY_WINDOW_DB:
        return "false layer stronger"
    if not ocean_detected and false_detected and deep_confuser:
        return "ocean hidden, false layer visible"
    return "weak/no deep detection"


def clutter_confuses_shallow_window(
    clutter_snr_db: float,
    ocean_snr_db: float,
    ocean_in_band_window: bool,
    band: RadarBand,
) -> bool:
    if band.name != "VHF_60MHz_shallow":
        return False
    if clutter_snr_db < SNR_DETECTION_THRESHOLD_DB:
        return False
    if not ocean_in_band_window or not math.isfinite(ocean_snr_db):
        return True
    return clutter_snr_db >= ocean_snr_db - AMBIGUITY_WINDOW_DB


def run_v2_simulation(baseline: pd.DataFrame) -> pd.DataFrame:
    rows: list[dict] = []
    for row in baseline.itertuples(index=False):
        row_s = pd.Series(row._asdict())
        for scenario_name, cfg in SCENARIOS.items():
            layers = layers_for_scenario(row_s, cfg)
            layer_statuses = sorted({layer.source_status for layer in layers})
            layer_sources = sorted({layer.source for layer in layers})
            for band_name, band in BANDS.items():
                ocean_depth = float(row_s.ocean_depth_m)
                ocean_in_window = ocean_depth <= band.nominal_depth_limit_m
                if ocean_in_window:
                    ocean_snr = interface_snr_db(ocean_depth, ICE_EPS, WATER_EPS, row_s, layers, band, cfg.thermal_mode)
                else:
                    ocean_snr = math.nan
                false_snr, false_depth, false_label, false_source_status = strongest_false_echo(row_s, layers, band, cfg.thermal_mode)
                classification = classify_echoes(ocean_snr, false_snr, false_depth, ocean_depth, ocean_in_window)
                clutter_snr, clutter_depth, clutter_label, clutter_source_status, clutter_roughness = surface_clutter_echo(row_s, band, cfg)
                clutter_detected = clutter_snr >= SNR_DETECTION_THRESHOLD_DB
                clutter_minus_ocean = clutter_snr - ocean_snr if clutter_detected and math.isfinite(ocean_snr) else math.nan
                clutter_confused = clutter_confuses_shallow_window(clutter_snr, ocean_snr, ocean_in_window, band)
                if clutter_confused:
                    classification = "surface clutter in shallow window"

                if classification == "clear ocean boundary":
                    inferred_depth = ocean_depth
                elif classification == "surface clutter in shallow window":
                    inferred_depth = clutter_depth
                elif classification in {"ambiguous", "false layer stronger", "ocean hidden, false layer visible", "internal feature only"}:
                    inferred_depth = false_depth
                else:
                    inferred_depth = math.nan

                rows.append(
                    {
                        "x_km": float(row_s.x_km),
                        "shell_mode": str(row_s.shell_mode),
                        "scenario": scenario_name,
                        "band": band_name,
                        "frequency_mhz": band.center_mhz,
                        "band_role": band.role,
                        "ocean_depth_m": ocean_depth,
                        "surface_height_m": float(row_s.surface_height_m),
                        "surface_slope_deg": float(row_s.surface_slope_deg),
                        "lens_strength": float(row_s.lens_strength),
                        "layer_count": len(layers),
                        "layer_source_statuses": "; ".join(layer_statuses) if layer_statuses else "none",
                        "layer_sources": "; ".join(layer_sources) if layer_sources else "none",
                        "ocean_in_band_window": ocean_in_window,
                        "ocean_snr_margin_db": ocean_snr,
                        "false_snr_margin_db": false_snr,
                        "false_minus_ocean_db": false_snr - ocean_snr if math.isfinite(ocean_snr) else math.nan,
                        "false_depth_m": false_depth,
                        "false_label": false_label,
                        "false_source_status": false_source_status,
                        "surface_clutter_snr_margin_db": clutter_snr,
                        "surface_clutter_minus_ocean_db": clutter_minus_ocean,
                        "surface_clutter_apparent_depth_m": clutter_depth,
                        "surface_clutter_label": clutter_label,
                        "surface_clutter_source_status": clutter_source_status,
                        "surface_clutter_detected": clutter_detected,
                        "surface_clutter_confuses_shallow_window": clutter_confused,
                        "surface_roughness_index": clutter_roughness,
                        "classification": classification,
                        "inferred_depth_m": inferred_depth,
                        "inferred_depth_error_m": inferred_depth - ocean_depth if math.isfinite(inferred_depth) else math.nan,
                        "thermal_mode": cfg.thermal_mode,
                        "thin_layer_solver": "normal_incidence_transfer_matrix",
                    }
                )
    return pd.DataFrame(rows)


def summarize(results: pd.DataFrame) -> pd.DataFrame:
    rows: list[dict] = []
    for (shell_mode, scenario, band), g in results.groupby(["shell_mode", "scenario", "band"], sort=True):
        counts = g["classification"].value_counts(normalize=True).mul(100.0)
        rows.append(
            {
                "shell_mode": shell_mode,
                "scenario": scenario,
                "band": band,
                "points": int(len(g)),
                "clear_ocean_pct": counts.get("clear ocean boundary", 0.0),
                "ambiguous_pct": counts.get("ambiguous", 0.0),
                "false_stronger_pct": counts.get("false layer stronger", 0.0),
                "hidden_false_visible_pct": counts.get("ocean hidden, false layer visible", 0.0),
                "internal_feature_only_pct": counts.get("internal feature only", 0.0),
                "surface_clutter_pct": counts.get("surface clutter in shallow window", 0.0),
                "outside_band_depth_window_pct": counts.get("outside band depth window", 0.0),
                "weak_no_deep_detection_pct": counts.get("weak/no deep detection", 0.0),
                "deep_false_risk_pct": counts.get("ambiguous", 0.0)
                + counts.get("false layer stronger", 0.0)
                + counts.get("ocean hidden, false layer visible", 0.0),
                "surface_clutter_detected_pct": 100.0 * float(g["surface_clutter_detected"].mean()),
                "median_surface_clutter_snr_margin_db": float(g["surface_clutter_snr_margin_db"].replace(-999.0, np.nan).median(skipna=True)),
                "max_surface_clutter_minus_ocean_db": float(g["surface_clutter_minus_ocean_db"].max(skipna=True)),
                "median_ocean_snr_margin_db": float(g["ocean_snr_margin_db"].median(skipna=True)),
                "min_ocean_snr_margin_db": float(g["ocean_snr_margin_db"].min(skipna=True)),
                "max_false_minus_ocean_db": float(g["false_minus_ocean_db"].max(skipna=True)),
                "max_abs_inferred_depth_error_m": float(g["inferred_depth_error_m"].abs().max(skipna=True)),
                "median_layer_count": float(g["layer_count"].median()),
            }
        )
    return pd.DataFrame(rows)


def build_sensitivity_grid(baseline: pd.DataFrame) -> pd.DataFrame:
    sample = baseline[baseline["shell_mode"] == "workbook_mid_shell"].iloc[::4].copy()
    band = BANDS["HF_9MHz_full_depth"]
    thicknesses = [0.5, 1.0, 5.0, 30.0, 100.0, 200.0, 500.0]
    attenuations = [0.5, 1.0, 2.0, 4.0, 6.0, 10.0, 16.0, 24.0]
    eps_values = [HYDRATED_SALT_EPS, BRINE_FILLED_ICE_EPS]
    rows: list[dict] = []
    for eps in eps_values:
        for thickness in thicknesses:
            for attenuation in attenuations:
                classifications: list[str] = []
                ocean_margins: list[float] = []
                false_over: list[float] = []
                for _, row in sample.iterrows():
                    ocean = float(row.ocean_depth_m)
                    top = clamp(0.72 * ocean + 0.03 * ocean * math.sin(2.0 * math.pi * float(row.x_km) / 80.0), 250.0, ocean - thickness - 250.0)
                    layers = [
                        Layer(
                            top_m=top,
                            thickness_m=thickness,
                            eps=eps,
                            attenuation_db_km_hf=attenuation,
                            label="single sensitivity dirty layer",
                            source_status="Sensitivity grid",
                            source="v2 parameter sweep",
                        )
                    ]
                    false_snr, false_depth, _, _ = strongest_false_echo(row, layers, band, "warm_impure")
                    ocean_snr = interface_snr_db(ocean, ICE_EPS, WATER_EPS, row, layers, band, "warm_impure")
                    classifications.append(classify_echoes(ocean_snr, false_snr, false_depth, ocean, True))
                    ocean_margins.append(ocean_snr)
                    false_over.append(false_snr - ocean_snr)
                s = pd.Series(classifications)
                rows.append(
                    {
                        "eps": eps,
                        "dirty_layer_thickness_m": thickness,
                        "dirty_layer_attenuation_db_km_hf": attenuation,
                        "deep_false_risk_pct": 100.0
                        * s.isin(["ambiguous", "false layer stronger", "ocean hidden, false layer visible"]).mean(),
                        "weak_or_hidden_ocean_pct": 100.0
                        * s.isin(["weak/no deep detection", "ocean hidden, false layer visible"]).mean(),
                        "median_ocean_snr_margin_db": float(np.nanmedian(ocean_margins)),
                        "median_false_minus_ocean_db": float(np.nanmedian(false_over)),
                    }
                )
    return pd.DataFrame(rows)


def material_library_rows() -> list[dict]:
    rows = []
    for material in MATERIALS.values():
        rows.append(asdict(material))
    return rows


def physics_validation_rows() -> list[dict]:
    band = BANDS["HF_9MHz_full_depth"]
    single_interface = [
        {
            "depth_m": 100.0,
            "eps_before": ICE_EPS,
            "eps_after": HYDRATED_SALT_EPS,
            "label": "single salt interface",
            "source_status": "validation",
        }
    ]
    no_contrast = [
        {
            "depth_m": 100.0,
            "eps_before": ICE_EPS,
            "eps_after": ICE_EPS,
            "label": "no contrast top",
            "source_status": "validation",
        },
        {
            "depth_m": 110.0,
            "eps_before": ICE_EPS,
            "eps_after": ICE_EPS,
            "label": "no contrast base",
            "source_status": "validation",
        },
    ]
    single_amp = abs(transfer_matrix_reflection_amplitude(single_interface, band))
    expected_single_amp = abs(reflection_amplitude(ICE_EPS, HYDRATED_SALT_EPS))
    no_contrast_amp = abs(transfer_matrix_reflection_amplitude(no_contrast, band))
    rows = [
        {
            "check": "single interface matches Fresnel amplitude",
            "evidence_type": "solver sanity check, not independent physical validation",
            "observed": single_amp,
            "expected": expected_single_amp,
            "abs_error": abs(single_amp - expected_single_amp),
            "passed": abs(single_amp - expected_single_amp) < 1e-12,
            "limitation": "Expected value uses the same Fresnel helper as the one-interface solver branch.",
        },
        {
            "check": "no dielectric contrast returns zero reflection",
            "evidence_type": "solver sanity check, not independent physical validation",
            "observed": no_contrast_amp,
            "expected": 0.0,
            "abs_error": abs(no_contrast_amp),
            "passed": no_contrast_amp < 1e-12,
            "limitation": "This catches implementation regressions only; it is not external model validation.",
        },
    ]
    return rows


def calibration_rows() -> list[dict]:
    rows: list[dict] = [
        {
            "parameter": "REASON science role",
            "value": "Probe Europa ice shell, suspected ocean, surface elevation, roughness, composition, and plumes",
            "unit": "",
            "v2_use": "Defines the simulation question as radar ambiguity in ice/ocean interpretation.",
            "source": SOURCE_NASA,
            "source_status": "Directly source anchored",
            "link": "https://science.nasa.gov/mission/europa-clipper/spacecraft-instruments/",
        },
        {
            "parameter": "SNR detection threshold",
            "value": "0",
            "unit": "dB",
            "v2_use": "Primary detectability threshold for echo classifications.",
            "source": SOURCE_REASON,
            "source_status": "Directly paper anchored",
            "link": "https://link.springer.com/article/10.1007/s11214-024-01072-3",
        },
        {
            "parameter": "Clean compact ice permittivity",
            "value": str(ICE_EPS),
            "unit": "relative epsilon",
            "v2_use": "Background ice dielectric constant and interface reflectivity.",
            "source": SOURCE_REASON,
            "source_status": "Directly paper anchored",
            "link": "https://link.springer.com/article/10.1007/s11214-024-01072-3",
        },
        {
            "parameter": "Pore close-off ice permittivity",
            "value": str(PORE_CLOSE_EPS),
            "unit": "relative epsilon",
            "v2_use": "Low-permittivity end member for porous/void-rich sensitivity layers.",
            "source": SOURCE_REASON,
            "source_status": "Directly paper anchored",
            "link": "https://link.springer.com/article/10.1007/s11214-024-01072-3",
        },
        {
            "parameter": "Brine-filled ice permittivity",
            "value": str(BRINE_FILLED_ICE_EPS),
            "unit": "relative epsilon",
            "v2_use": "Briny near-surface and briny lens end member.",
            "source": SOURCE_REASON,
            "source_status": "Directly paper anchored",
            "link": "https://link.springer.com/article/10.1007/s11214-024-01072-3",
        },
        {
            "parameter": "Hydrated salt layer permittivity",
            "value": str(HYDRATED_SALT_EPS),
            "unit": "relative epsilon",
            "v2_use": "Salt-layer target interface reflectivity.",
            "source": SOURCE_REASON,
            "source_status": "Directly paper anchored",
            "link": "https://link.springer.com/article/10.1007/s11214-024-01072-3",
        },
        {
            "parameter": "Salt layer thicknesses",
            "value": "1.0, 0.2",
            "unit": "m",
            "v2_use": "Ocean-injected and melt-derived salt-layer cases.",
            "source": SOURCE_REASON,
            "source_status": "Directly paper anchored",
            "link": "https://link.springer.com/article/10.1007/s11214-024-01072-3",
        },
        {
            "parameter": "Attenuation variability anchor",
            "value": "2",
            "unit": "dB/km",
            "v2_use": "Used to scale warm/dirty ice attenuation modes; exact rates remain sensitivity parameters.",
            "source": SOURCE_REASON,
            "source_status": "Paper anchored as variability example",
            "link": "https://link.springer.com/article/10.1007/s11214-024-01072-3",
        },
        {
            "parameter": "HF clean reference margin",
            "value": "6",
            "unit": "dB at 30 km",
            "v2_use": "Sets the SNR proxy so clean conductive HF can barely-but-clearly see a 30 km ice-ocean interface.",
            "source": "v2 model calibration",
            "source_status": "Model assumption",
            "link": "",
        },
        {
            "parameter": "Frequency attenuation scaling",
            "value": "sqrt(frequency / 9 MHz)",
            "unit": "",
            "v2_use": "Makes VHF more vulnerable to deep attenuation while preserving REASON's complementary band roles.",
            "source": "v2 model calibration",
            "source_status": "Sensitivity assumption",
            "link": "",
        },
        {
            "parameter": "Unresolved thin-layer solver",
            "value": "normal-incidence transfer matrix",
            "unit": "",
            "v2_use": "Computes the effective reflection of interfaces inside one vertical-resolution window.",
            "source": f"{SOURCE_REASON}; {SOURCE_MARS_ANALOG}",
            "source_status": "Physics upgrade anchored by thin-layer interference literature",
            "link": "https://arxiv.org/abs/2107.03497",
        },
        {
            "parameter": "VHF off-nadir clutter mechanism",
            "value": "surface returns can share delay with shallow nadir echoes",
            "unit": "",
            "v2_use": "Adds a separate surface-clutter ambiguity class for VHF shallow stress tests.",
            "source": SOURCE_CLUTTER,
            "source_status": "Paper anchored mechanism; amplitude is sensitivity-modeled",
            "link": "https://link.springer.com/article/10.1007/s11214-024-01072-3",
        },
        {
            "parameter": "VHF clutter discrimination",
            "value": "cross-track interferometric phase",
            "unit": "",
            "v2_use": "Flags that real REASON processing can discriminate some clutter; v2 does not model the phase processor.",
            "source": SOURCE_CLUTTER,
            "source_status": "Paper anchored processing concept",
            "link": "https://doi.org/10.1109/TGRS.2017.2721433",
        },
    ]
    for band in BANDS.values():
        rows.extend(
            [
                {
                    "parameter": f"{band.name} center frequency",
                    "value": band.center_mhz,
                    "unit": "MHz",
                    "v2_use": band.role,
                    "source": SOURCE_REASON,
                    "source_status": band.source_status,
                    "link": "https://link.springer.com/article/10.1007/s11214-024-01072-3",
                },
                {
                    "parameter": f"{band.name} bandwidth",
                    "value": band.bandwidth_mhz,
                    "unit": "MHz",
                    "v2_use": "Controls vertical resolution.",
                    "source": SOURCE_REASON,
                    "source_status": band.source_status,
                    "link": "https://link.springer.com/article/10.1007/s11214-024-01072-3",
                },
                {
                    "parameter": f"{band.name} vertical resolution",
                    "value": band.vertical_resolution_m,
                    "unit": "m in ice",
                    "v2_use": "Controls which interfaces coherently blend into one apparent return.",
                    "source": SOURCE_REASON,
                    "source_status": band.source_status,
                    "link": "https://link.springer.com/article/10.1007/s11214-024-01072-3",
                },
                {
                    "parameter": f"{band.name} nominal depth limit",
                    "value": band.nominal_depth_limit_m,
                    "unit": "m",
                    "v2_use": "Controls whether the ocean is in the interpreted receive window for this band mode.",
                    "source": SOURCE_REASON,
                    "source_status": band.source_status,
                    "link": "https://link.springer.com/article/10.1007/s11214-024-01072-3",
                },
            ]
        )
    for mode, cfg in SHELL_MODES.items():
        rows.append(
            {
                "parameter": f"{mode} mean shell thickness",
                "value": cfg["target_ocean_mean_m"] if cfg["target_ocean_mean_m"] is not None else "workbook mean",
                "unit": "m",
                "v2_use": cfg["note"],
                "source": SOURCE_REASON if "reason" in mode else "current workbook",
                "source_status": cfg["source_status"],
                "link": "https://link.springer.com/article/10.1007/s11214-024-01072-3" if "reason" in mode else "",
            }
        )
        if cfg["target_ocean_limit_m"] is not None:
            rows.append(
                {
                    "parameter": f"{mode} maximum interpreted shell depth",
                    "value": cfg["target_ocean_limit_m"],
                    "unit": "m",
                    "v2_use": "Caps the scaled workbook depth profile at the REASON mode limit.",
                    "source": SOURCE_REASON,
                    "source_status": cfg["source_status"],
                    "link": "https://link.springer.com/article/10.1007/s11214-024-01072-3",
                }
            )
    return rows


def build_v1_v2_comparison(summary: pd.DataFrame) -> pd.DataFrame:
    legacy_summary_path = LEGACY_DIR / "scenario_summary.csv"
    if not legacy_summary_path.exists():
        return pd.DataFrame()
    old = pd.read_csv(legacy_summary_path)
    old["deep_false_risk_pct"] = old["ambiguous_pct"] + old["false_stronger_pct"] + old["hidden_false_visible_pct"]
    mappings = {
        "clean_ice_control": "clean_ice_control",
        "salt_reference": "salt_layers_reason",
        "mixed_dirty_thin_layers": "stacked_dirty_layers",
        "briny_lens_masking": "briny_mushy_lens",
        "complex_dirty_ice": "complex_paper_calibrated",
    }
    band_mappings = {
        "HF_9MHz": "HF_9MHz_full_depth",
        "VHF_60MHz": "VHF_60MHz_full_depth_lowDR",
    }
    rows: list[dict] = []
    focus = summary[summary["shell_mode"] == "workbook_mid_shell"].copy()
    for old_scenario, new_scenario in mappings.items():
        for old_freq, new_band in band_mappings.items():
            old_match = old[(old["scenario"] == old_scenario) & (old["frequency"] == old_freq)]
            new_match = focus[(focus["scenario"] == new_scenario) & (focus["band"] == new_band)]
            if old_match.empty or new_match.empty:
                continue
            o = old_match.iloc[0]
            n = new_match.iloc[0]
            comparison_note = (
                "Closest like-for-like comparison: HF full-depth to HF full-depth."
                if old_freq == "HF_9MHz"
                else "Diagnostic only: v1 used one generic VHF case; v2 separates shallow VHF and low-dynamic-range full-depth VHF."
            )
            rows.append(
                {
                    "v1_scenario": old_scenario,
                    "v2_scenario": new_scenario,
                    "v1_frequency": old_freq,
                    "v2_band": new_band,
                    "comparison_note": comparison_note,
                    "v1_deep_false_risk_pct": float(o.deep_false_risk_pct),
                    "v2_deep_false_risk_pct": float(n.deep_false_risk_pct),
                    "risk_delta_v2_minus_v1_pct": float(n.deep_false_risk_pct - o.deep_false_risk_pct),
                    "v1_clear_ocean_pct": float(o.clear_ocean_pct),
                    "v2_clear_ocean_pct": float(n.clear_ocean_pct),
                    "v1_weak_no_deep_detection_pct": float(o.weak_no_deep_detection_pct),
                    "v2_weak_no_deep_detection_pct": float(n.weak_no_deep_detection_pct),
                    "v2_outside_band_depth_window_pct": float(n.outside_band_depth_window_pct),
                    "v2_internal_feature_only_pct": float(n.internal_feature_only_pct),
                }
            )
    return pd.DataFrame(rows)


def build_report(
    summary: pd.DataFrame,
    comparison: pd.DataFrame,
    calibration: pd.DataFrame,
    material_library: pd.DataFrame,
    physics_validation: pd.DataFrame,
) -> None:
    focus_cols = [
        "shell_mode",
        "scenario",
        "band",
        "clear_ocean_pct",
        "deep_false_risk_pct",
        "weak_no_deep_detection_pct",
        "outside_band_depth_window_pct",
        "internal_feature_only_pct",
        "surface_clutter_pct",
        "median_ocean_snr_margin_db",
        "median_surface_clutter_snr_margin_db",
    ]
    focus = summary[focus_cols].copy()
    for col in focus.select_dtypes(include=[float]).columns:
        focus[col] = focus[col].round(2)

    compare_html = "<p>No v1 summary was available for comparison.</p>"
    if not comparison.empty:
        comp = comparison.copy()
        for col in comp.select_dtypes(include=[float]).columns:
            comp[col] = comp[col].round(2)
        compare_html = comp.to_html(index=False, escape=True)

    cal_focus = calibration[
        calibration["parameter"].isin(
            [
                "SNR detection threshold",
                "Clean compact ice permittivity",
                "Brine-filled ice permittivity",
                "Hydrated salt layer permittivity",
                "Salt layer thicknesses",
                "Attenuation variability anchor",
                "HF clean reference margin",
                "Frequency attenuation scaling",
                "VHF off-nadir clutter mechanism",
                "VHF clutter discrimination",
            ]
        )
    ]

    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Paper-Calibrated Europa Dirty-Ice Radar Simulation v2</title>
  <style>
    body {{ margin: 0; background: #fafafa; color: #20242d; font-family: Aptos, Segoe UI, Arial, sans-serif; line-height: 1.48; }}
    main {{ max-width: 1180px; margin: 0 auto; padding: 34px 28px 56px; }}
    h1 {{ font-size: 30px; margin: 0 0 10px; }}
    h2 {{ font-size: 21px; margin: 30px 0 10px; padding-top: 20px; border-top: 1px solid #e0e3ea; }}
    p, li {{ font-size: 15px; }}
    .summary {{ background: #eef4ff; border-left: 5px solid #4368b0; padding: 14px 18px; border-radius: 6px; }}
    table {{ width: 100%; border-collapse: collapse; margin: 14px 0 22px; font-size: 12.5px; background: #fff; }}
    th, td {{ border: 1px solid #e2e5ec; padding: 7px 8px; vertical-align: top; }}
    th {{ background: #f2f4f8; text-align: left; }}
    code {{ background: #f2f4f8; border-radius: 4px; padding: 1px 4px; }}
  </style>
</head>
<body>
<main>
  <h1>Paper-Calibrated Europa Dirty-Ice Radar Simulation v2</h1>
  <section class="summary">
    <strong>What changed:</strong> v2 moves the model from a fixed relative echo threshold to a paper-aligned SNR-margin threshold, adds REASON HF/VHF band modes, includes 3 km and 30 km shell modes, and writes calibration tables that separate direct paper anchors from sensitivity assumptions.
  </section>

  <h2>Core Calibration Anchors</h2>
  {cal_focus.to_html(index=False, escape=True)}

  <h2>Material Library</h2>
  {material_library.to_html(index=False, escape=True)}

  <h2>Solver Sanity Checks, Not Independent Physics Validation</h2>
  <p>These checks verify simple implementation identities for the transfer-matrix code. They should not be used as evidence that the full Europa radar model is physically validated.</p>
  {physics_validation.to_html(index=False, escape=True)}

  <h2>Scenario Summary</h2>
  {focus.to_html(index=False, escape=True)}

  <h2>Comparison Against Current Dirty-Ice Run</h2>
  {compare_html}

  <h2>Use And Limits</h2>
  <p>This is still a sensitivity simulation, not a NASA mission processor. It is stronger than the previous version because the radar bands, resolutions, shell-depth modes, dielectric constants, salt-layer geometry, SNR detection rule, and VHF clutter mechanism are traceable to sources. The remaining major assumptions are the simplified link-budget offset, the frequency attenuation scaling, the dirty-mixture attenuation ranges, and the simplified clutter amplitude proxy.</p>
</main>
</body>
</html>
"""
    REPORT_HTML.write_text(html_text, encoding="utf-8")


def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    baseline = build_v2_baseline()
    results = run_v2_simulation(baseline)
    summary = summarize(results)
    sensitivity = build_sensitivity_grid(baseline)
    calibration = pd.DataFrame(calibration_rows())
    material_library = pd.DataFrame(material_library_rows())
    physics_validation = pd.DataFrame(physics_validation_rows())
    comparison = build_v1_v2_comparison(summary)

    baseline.to_csv(BASELINE_CSV, index=False)
    results.to_csv(RESULTS_CSV, index=False)
    summary.to_csv(SUMMARY_CSV, index=False)
    sensitivity.to_csv(SENSITIVITY_CSV, index=False)
    calibration.to_csv(CALIBRATION_CSV, index=False)
    CALIBRATION_JSON.write_text(json.dumps(calibration_rows(), indent=2), encoding="utf-8")
    material_library.to_csv(MATERIAL_LIBRARY_CSV, index=False)
    MATERIAL_LIBRARY_JSON.write_text(json.dumps(material_library_rows(), indent=2), encoding="utf-8")
    physics_validation.to_csv(PHYSICS_VALIDATION_CSV, index=False)
    PHYSICS_VALIDATION_JSON.write_text(json.dumps(physics_validation_rows(), indent=2), encoding="utf-8")
    comparison.to_csv(COMPARISON_CSV, index=False)
    build_report(summary, comparison, calibration, material_library, physics_validation)

    metadata = {
        "model_name": "paper_calibrated_dirty_ice_v2",
        "workbook_used": str(legacy.WORKBOOK),
        "legacy_comparison_source": str(LEGACY_DIR / "scenario_summary.csv"),
        "outputs": {
            "baseline_csv": str(BASELINE_CSV),
            "results_csv": str(RESULTS_CSV),
            "summary_csv": str(SUMMARY_CSV),
            "sensitivity_csv": str(SENSITIVITY_CSV),
            "calibration_csv": str(CALIBRATION_CSV),
            "calibration_json": str(CALIBRATION_JSON),
            "material_library_csv": str(MATERIAL_LIBRARY_CSV),
            "material_library_json": str(MATERIAL_LIBRARY_JSON),
            "physics_validation_csv": str(PHYSICS_VALIDATION_CSV),
            "physics_validation_json": str(PHYSICS_VALIDATION_JSON),
            "comparison_csv": str(COMPARISON_CSV),
            "report_html": str(REPORT_HTML),
        },
        "radar_bands": {name: asdict(band) for name, band in BANDS.items()},
        "classification_thresholds": {
            "snr_detection_threshold_db": SNR_DETECTION_THRESHOLD_DB,
            "ambiguity_window_db": AMBIGUITY_WINDOW_DB,
        },
        "surface_clutter_model": {
            "applies_to": "VHF 60 MHz modes; classification effect limited to VHF shallow sounding",
            "mechanism": "off-nadir surface clutter represented as an apparent shallow subsurface echo",
            "source": SOURCE_CLUTTER,
            "caveat": "Amplitude and apparent depth are deterministic sensitivity proxies, not antenna-pattern or interferometric phase simulations.",
        },
        "thin_layer_solver": "normal_incidence_transfer_matrix",
        "caveat": "This is a first-order sensitivity simulation, not a full REASON link budget or processing pipeline.",
    }
    RUN_METADATA.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
