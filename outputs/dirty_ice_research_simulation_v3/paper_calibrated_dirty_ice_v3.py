from __future__ import annotations

import json
import math
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd


PROJECT_ROOT = Path("C:/Users/tyboy/OneDrive/Documents/Nasa project")
V2_ROOT = PROJECT_ROOT / "outputs" / "dirty_ice_research_simulation_v2"
ROOT = PROJECT_ROOT / "outputs" / "dirty_ice_research_simulation_v3"

V2_RESULTS_CSV = V2_ROOT / "paper_calibrated_v2_results.csv"
V2_SUMMARY_CSV = V2_ROOT / "paper_calibrated_v2_summary.csv"
V2_CALIBRATION_CSV = V2_ROOT / "paper_calibration_parameters.csv"

POINT_CONFIDENCE_CSV = ROOT / "paper_calibrated_v3_point_confidence.csv"
CONFIDENCE_SUMMARY_CSV = ROOT / "paper_calibrated_v3_confidence_summary.csv"
UNCERTAINTY_CSV = ROOT / "paper_calibrated_v3_uncertainty_ranges.csv"
CROSS_INSTRUMENT_CSV = ROOT / "paper_calibrated_v3_cross_instrument_evidence.csv"
CASE_STUDIES_CSV = ROOT / "paper_calibrated_v3_false_ocean_case_studies.csv"
HEADLINE_CONDITIONING_CSV = ROOT / "paper_calibrated_v3_headline_conditioning.csv"
HEADLINE_CONDITIONING_JSON = ROOT / "paper_calibrated_v3_headline_conditioning.json"
METADATA_JSON = ROOT / "paper_calibrated_v3_run_metadata.json"
README_MD = ROOT / "README.md"


SOURCE_NASA_INSTRUMENTS = "https://science.nasa.gov/mission/europa-clipper/spacecraft-instruments/"
SOURCE_REASON_2024 = "https://link.springer.com/article/10.1007/s11214-024-01072-3"


SCENARIO_LABELS = {
    "clean_ice_control": "Clean ice",
    "salt_layers_reason": "Salt layers",
    "near_surface_brine": "Near-surface brine",
    "warm_impure_ice": "Warm impure ice",
    "briny_mushy_lens": "Briny/mushy lens",
    "stacked_dirty_layers": "Stacked dirty layers",
    "complex_paper_calibrated": "Complex dirty ice",
    "rough_surface_clutter": "Rough surface clutter",
    "complex_with_clutter": "Complex + clutter",
}

SCENARIO_MATERIAL_RISK = {
    "clean_ice_control": 5,
    "salt_layers_reason": 24,
    "near_surface_brine": 45,
    "warm_impure_ice": 55,
    "briny_mushy_lens": 68,
    "stacked_dirty_layers": 74,
    "complex_paper_calibrated": 86,
    "rough_surface_clutter": 32,
    "complex_with_clutter": 92,
}

CLASSIFICATION_ADJUSTMENTS = {
    "clear ocean boundary": 8,
    "ambiguous ocean/false layer": -15,
    "false layer stronger": -38,
    "weak/no deep detection": -32,
    "outside band depth window": -50,
    "internal feature only": -35,
    "surface clutter in shallow window": -55,
}


@dataclass(frozen=True)
class ConfidenceProfile:
    name: str
    ocean_margin_shift_db: float
    false_margin_shift_db: float
    clutter_margin_shift_db: float
    material_risk_shift: float
    note: str


PROFILES = [
    ConfidenceProfile(
        name="optimistic_processing",
        ocean_margin_shift_db=3.0,
        false_margin_shift_db=-2.0,
        clutter_margin_shift_db=-2.0,
        material_risk_shift=-10.0,
        note="Assumes better processing, lower false-layer gain, and less severe dirty-ice loss.",
    ),
    ConfidenceProfile(
        name="nominal_v3",
        ocean_margin_shift_db=0.0,
        false_margin_shift_db=0.0,
        clutter_margin_shift_db=0.0,
        material_risk_shift=0.0,
        note="Uses the v2 signal outputs directly.",
    ),
    ConfidenceProfile(
        name="pessimistic_dirty_ice",
        ocean_margin_shift_db=-6.0,
        false_margin_shift_db=4.0,
        clutter_margin_shift_db=4.0,
        material_risk_shift=12.0,
        note="Assumes warmer/impurer ice, stronger internal false boundaries, and stronger rough-surface clutter.",
    ),
]


def clamp_series(values: pd.Series | np.ndarray, low: float, high: float) -> pd.Series:
    return pd.Series(np.clip(values, low, high))


def numeric(series: pd.Series, default: float = np.nan) -> pd.Series:
    values = pd.to_numeric(series, errors="coerce")
    if not math.isnan(default):
        values = values.fillna(default)
    return values


def bool_series(series: pd.Series) -> pd.Series:
    if series.dtype == bool:
        return series
    return series.astype(str).str.lower().isin(["true", "1", "yes"])


def percent_true(series: pd.Series) -> float:
    if len(series) == 0:
        return 0.0
    return float(100.0 * series.mean())


def finite_or_blank(value: Any, decimals: int = 2) -> Any:
    if value is None:
        return ""
    try:
        value_f = float(value)
    except (TypeError, ValueError):
        return value
    if not math.isfinite(value_f):
        return ""
    return round(value_f, decimals)


def add_cross_band_support(df: pd.DataFrame) -> pd.Series:
    support = pd.Series(45.0, index=df.index)
    class_col = df["classification"].astype(str)
    ocean_window = df["ocean_in_band_window_bool"]

    grouped = df.groupby(["shell_mode", "scenario", "x_km"], sort=False)
    for _, idx in grouped.indices.items():
        subset = df.loc[idx]
        classes = subset["classification"].astype(str)
        bands = subset["band"].astype(str)
        clear_count = int((classes == "clear ocean boundary").sum())
        risk_count = int(classes.isin(["false layer stronger", "surface clutter in shallow window"]).sum())
        hf_clear = bool(((bands == "HF_9MHz_full_depth") & (classes == "clear ocean boundary")).any())
        shallow_clutter = bool((classes == "surface clutter in shallow window").any())

        for row_index in idx:
            row_class = str(df.at[row_index, "classification"])
            row_band = str(df.at[row_index, "band"])
            row_window = bool(ocean_window.loc[row_index])
            value = 45.0
            if clear_count >= 2:
                value = 85.0
            elif row_class == "clear ocean boundary" and hf_clear:
                value = 72.0
            elif row_class == "clear ocean boundary":
                value = 62.0
            elif hf_clear and not row_window:
                value = 48.0
            elif risk_count > 0:
                value = 30.0
            else:
                value = 38.0

            if shallow_clutter:
                value -= 10.0
            if row_band == "VHF_60MHz_shallow" and not row_window:
                value = min(value, 35.0)
            support.at[row_index] = max(0.0, min(100.0, value))
    return support


def compute_confidence(df: pd.DataFrame, profile: ConfidenceProfile, cross_support: pd.Series) -> pd.DataFrame:
    out = df.copy()
    ocean_window = out["ocean_in_band_window_bool"]
    ocean_margin = numeric(out["ocean_snr_margin_db"]) + profile.ocean_margin_shift_db
    false_margin_raw = numeric(out["false_snr_margin_db"])
    false_margin = false_margin_raw.where(false_margin_raw > -900) + profile.false_margin_shift_db
    false_detected = false_margin.notna() & (false_margin >= 0.0)
    false_minus_ocean = false_margin - ocean_margin

    clutter_margin_raw = numeric(out["surface_clutter_snr_margin_db"])
    clutter_margin = clutter_margin_raw.where(clutter_margin_raw > -900) + profile.clutter_margin_shift_db
    clutter_detected = clutter_margin.notna() & (clutter_margin >= 0.0)
    roughness = numeric(out["surface_roughness_index"], default=0.0).clip(0.0, 1.0)
    layer_count = numeric(out["layer_count"], default=0.0).clip(lower=0.0)

    material_base = out["scenario"].map(SCENARIO_MATERIAL_RISK).fillna(55.0)
    material_risk = (material_base + np.minimum(layer_count * 3.0, 18.0) + profile.material_risk_shift).clip(0.0, 100.0)

    false_layer_risk = pd.Series(0.0, index=out.index)
    false_contrast = false_minus_ocean.where(ocean_margin.notna(), false_margin)
    false_layer_risk.loc[false_detected] = (50.0 + 12.0 * false_contrast.loc[false_detected]).clip(0.0, 100.0)
    false_layer_risk.loc[out["classification"].astype(str) == "false layer stronger"] = np.maximum(
        false_layer_risk.loc[out["classification"].astype(str) == "false layer stronger"], 88.0
    )

    clutter_risk = (roughness * 35.0).clip(0.0, 35.0)
    clutter_bonus = (35.0 + 7.0 * clutter_margin.fillna(-6.0)).clip(0.0, 70.0)
    clutter_risk.loc[clutter_detected] = np.maximum(clutter_risk.loc[clutter_detected], clutter_bonus.loc[clutter_detected])
    clutter_risk.loc[out["classification"].astype(str) == "surface clutter in shallow window"] = np.maximum(
        clutter_risk.loc[out["classification"].astype(str) == "surface clutter in shallow window"], 90.0
    )
    clutter_risk = clutter_risk.clip(0.0, 100.0)

    snr_score = ((ocean_margin.fillna(-12.0) + 3.0) / 15.0 * 100.0).clip(0.0, 100.0)
    attenuation_risk = (60.0 - 5.0 * ocean_margin.fillna(-10.0) + 0.12 * material_risk).clip(0.0, 100.0)
    attenuation_risk.loc[out["classification"].astype(str) == "weak/no deep detection"] = np.maximum(
        attenuation_risk.loc[out["classification"].astype(str) == "weak/no deep detection"], 82.0
    )
    band_window_penalty = pd.Series(0.0, index=out.index)
    band_window_penalty.loc[~ocean_window] = 100.0
    band_window_penalty.loc[out["band"].astype(str) == "VHF_60MHz_full_depth_lowDR"] = np.maximum(
        band_window_penalty.loc[out["band"].astype(str) == "VHF_60MHz_full_depth_lowDR"], 25.0
    )

    score = (
        0.40 * snr_score
        + 0.18 * cross_support
        + 0.14 * (100.0 - false_layer_risk)
        + 0.10 * (100.0 - clutter_risk)
        + 0.13 * (100.0 - material_risk)
        + 0.05 * (100.0 - attenuation_risk)
        - 0.45 * band_window_penalty
    )
    class_adjust = out["classification"].astype(str).map(CLASSIFICATION_ADJUSTMENTS).fillna(-10.0)
    score = (score + class_adjust).clip(0.0, 100.0)
    score.loc[~ocean_window] = np.minimum(score.loc[~ocean_window], 20.0)
    score.loc[out["classification"].astype(str) == "outside band depth window"] = np.minimum(
        score.loc[out["classification"].astype(str) == "outside band depth window"], 5.0
    )
    score.loc[out["classification"].astype(str) == "internal feature only"] = np.minimum(
        score.loc[out["classification"].astype(str) == "internal feature only"], 22.0
    )
    score.loc[out["classification"].astype(str) == "surface clutter in shallow window"] = np.minimum(
        score.loc[out["classification"].astype(str) == "surface clutter in shallow window"], 15.0
    )

    broad_outcome = pd.Series("not_interpretable", index=out.index)
    broad_outcome.loc[(ocean_window) & (ocean_margin >= 0.0)] = "ocean_candidate"
    broad_outcome.loc[(ocean_window) & (ocean_margin < 0.0)] = "weak_no_deep_detection"
    broad_outcome.loc[(ocean_window) & (false_detected) & (false_minus_ocean.abs() <= 3.0)] = "ambiguous"
    broad_outcome.loc[(ocean_window) & (false_detected) & (false_minus_ocean > 3.0)] = "likely_false_boundary"
    broad_outcome.loc[~ocean_window] = "outside_band_depth_window"
    broad_outcome.loc[out["classification"].astype(str) == "surface clutter in shallow window"] = "surface_clutter"
    broad_outcome.loc[out["classification"].astype(str) == "internal feature only"] = "internal_feature_only"

    score_band = pd.Series("not_interpretable", index=out.index)
    score_band.loc[score >= 75.0] = "high"
    score_band.loc[(score >= 55.0) & (score < 75.0)] = "moderate"
    score_band.loc[(score >= 35.0) & (score < 55.0)] = "ambiguous"
    score_band.loc[(score >= 15.0) & (score < 35.0)] = "low"
    score_band.loc[score < 15.0] = "not_interpretable"

    interpretation = pd.Series("not enough evidence for an ocean call", index=out.index)
    interpretation.loc[(broad_outcome == "ocean_candidate") & (score >= 75.0)] = "high-confidence ocean candidate"
    interpretation.loc[(broad_outcome == "ocean_candidate") & (score >= 55.0) & (score < 75.0)] = (
        "moderate-confidence ocean candidate"
    )
    interpretation.loc[(broad_outcome == "ocean_candidate") & (score < 55.0)] = "low-confidence ocean candidate"
    interpretation.loc[broad_outcome == "ambiguous"] = "ambiguous ocean vs internal layer"
    interpretation.loc[broad_outcome == "likely_false_boundary"] = "likely false/internal boundary"
    interpretation.loc[broad_outcome == "surface_clutter"] = "likely surface-clutter echo"
    interpretation.loc[broad_outcome == "weak_no_deep_detection"] = "too weak for deep-ocean call"
    interpretation.loc[broad_outcome == "outside_band_depth_window"] = "outside this band's ocean-depth window"
    interpretation.loc[broad_outcome == "internal_feature_only"] = "shallow/internal feature only"

    out["adjusted_ocean_snr_margin_db"] = ocean_margin
    out["adjusted_false_minus_ocean_db"] = false_minus_ocean
    out["attenuation_risk_0_100"] = attenuation_risk.round(2)
    out["false_layer_risk_0_100"] = false_layer_risk.round(2)
    out["surface_clutter_risk_0_100"] = clutter_risk.round(2)
    out["material_ambiguity_risk_0_100"] = material_risk.round(2)
    out["band_window_penalty_0_100"] = band_window_penalty.round(2)
    out["cross_band_support_0_100"] = cross_support.round(2)
    out["ocean_confidence_score_0_100"] = score.round(2)
    out["confidence_band"] = score_band
    out["v3_broad_outcome"] = broad_outcome
    out["v3_interpretation"] = interpretation
    return out


def main_takeaway(group: pd.DataFrame) -> str:
    med_score = float(group["ocean_confidence_score_0_100"].median())
    false_or_ambig = percent_true(group["v3_broad_outcome"].isin(["ambiguous", "likely_false_boundary", "surface_clutter"]))
    no_call = percent_true(group["v3_interpretation"].isin(["too weak for deep-ocean call", "outside this band's ocean-depth window"]))
    if med_score >= 75 and false_or_ambig < 5:
        return "Strong ocean interpretation in this sensitivity run."
    if false_or_ambig >= 50:
        return "High false-boundary or clutter ambiguity; do not treat the brightest echo as automatically ocean."
    if no_call >= 50:
        return "Band or attenuation limits dominate; this is not a reliable ocean-depth call."
    if med_score >= 55:
        return "Moderate ocean interpretation; needs cross-band or cross-instrument support."
    return "Low-confidence interpretation; useful mainly as an ambiguity stress case."


def summarize_confidence(conf: pd.DataFrame) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    group_cols = ["shell_mode", "scenario", "band"]
    for keys, group in conf.groupby(group_cols, sort=True):
        shell_mode, scenario, band = keys
        risk_sort = group.assign(
            risk_rank=(
                (100.0 - group["ocean_confidence_score_0_100"])
                + group["false_layer_risk_0_100"]
                + group["surface_clutter_risk_0_100"]
            )
        ).sort_values("risk_rank", ascending=False)
        strongest = risk_sort.iloc[0]
        rows.append(
            {
                "shell_mode": shell_mode,
                "scenario": scenario,
                "scenario_label": SCENARIO_LABELS.get(str(scenario), str(scenario)),
                "band": band,
                "points": int(len(group)),
                "median_ocean_confidence_score": round(float(group["ocean_confidence_score_0_100"].median()), 2),
                "p10_ocean_confidence_score": round(float(group["ocean_confidence_score_0_100"].quantile(0.10)), 2),
                "p90_ocean_confidence_score": round(float(group["ocean_confidence_score_0_100"].quantile(0.90)), 2),
                "high_confidence_ocean_pct": round(
                    percent_true(group["v3_interpretation"] == "high-confidence ocean candidate"), 2
                ),
                "moderate_or_high_ocean_pct": round(
                    percent_true(
                        group["v3_interpretation"].isin(
                            ["high-confidence ocean candidate", "moderate-confidence ocean candidate"]
                        )
                    ),
                    2,
                ),
                "ambiguous_or_false_pct": round(
                    percent_true(group["v3_broad_outcome"].isin(["ambiguous", "likely_false_boundary", "surface_clutter"])),
                    2,
                ),
                "not_interpretable_pct": round(
                    percent_true(
                        group["v3_interpretation"].isin(
                            [
                                "too weak for deep-ocean call",
                                "outside this band's ocean-depth window",
                                "not enough evidence for an ocean call",
                            ]
                        )
                    ),
                    2,
                ),
                "median_attenuation_risk": round(float(group["attenuation_risk_0_100"].median()), 2),
                "median_false_layer_risk": round(float(group["false_layer_risk_0_100"].median()), 2),
                "median_surface_clutter_risk": round(float(group["surface_clutter_risk_0_100"].median()), 2),
                "median_material_ambiguity_risk": round(float(group["material_ambiguity_risk_0_100"].median()), 2),
                "strongest_risk_x_km": round(float(strongest["x_km"]), 2),
                "strongest_risk_interpretation": strongest["v3_interpretation"],
                "main_takeaway": main_takeaway(group),
            }
        )
    return pd.DataFrame(rows)


def uncertainty_ranges(df: pd.DataFrame, cross_support: pd.Series) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    for profile in PROFILES:
        profiled = compute_confidence(df, profile, cross_support)
        for keys, group in profiled.groupby(["shell_mode", "scenario", "band"], sort=True):
            shell_mode, scenario, band = keys
            rows.append(
                {
                    "assumption_case": profile.name,
                    "assumption_note": profile.note,
                    "shell_mode": shell_mode,
                    "scenario": scenario,
                    "scenario_label": SCENARIO_LABELS.get(str(scenario), str(scenario)),
                    "band": band,
                    "median_ocean_confidence_score": round(float(group["ocean_confidence_score_0_100"].median()), 2),
                    "p10_ocean_confidence_score": round(float(group["ocean_confidence_score_0_100"].quantile(0.10)), 2),
                    "p90_ocean_confidence_score": round(float(group["ocean_confidence_score_0_100"].quantile(0.90)), 2),
                    "moderate_or_high_ocean_pct": round(
                        percent_true(
                            group["v3_interpretation"].isin(
                                ["high-confidence ocean candidate", "moderate-confidence ocean candidate"]
                            )
                        ),
                        2,
                    ),
                    "ambiguous_or_false_pct": round(
                        percent_true(
                            group["v3_broad_outcome"].isin(["ambiguous", "likely_false_boundary", "surface_clutter"])
                        ),
                        2,
                    ),
                    "not_interpretable_pct": round(
                        percent_true(
                            group["v3_interpretation"].isin(
                                [
                                    "too weak for deep-ocean call",
                                    "outside this band's ocean-depth window",
                                    "not enough evidence for an ocean call",
                                ]
                            )
                        ),
                        2,
                    ),
                    "ocean_margin_shift_db": profile.ocean_margin_shift_db,
                    "false_margin_shift_db": profile.false_margin_shift_db,
                    "clutter_margin_shift_db": profile.clutter_margin_shift_db,
                    "material_risk_shift": profile.material_risk_shift,
                }
            )
    return pd.DataFrame(rows)


def cross_instrument_evidence() -> pd.DataFrame:
    rows = [
        {
            "evidence_source": "REASON HF/VHF radar",
            "instrument_or_dataset": "REASON",
            "what_it_constrains": "Subsurface reflectors, ice thickness candidates, internal layers, roughness and elevation context.",
            "improves_confidence_when": "HF deep return is clear, VHF behavior is consistent with band role, and clutter risk is low.",
            "warns_false_positive_when": "A bright internal layer, rough-surface clutter, or band-depth limit explains the echo better than the ocean.",
            "v3_model_use": "Primary source of ocean-confidence score, false-layer risk, and clutter risk.",
            "source_status": "Direct mission/instrument source",
            "source_url": SOURCE_REASON_2024,
        },
        {
            "evidence_source": "Magnetic induction / plasma correction",
            "instrument_or_dataset": "ECM + PIMS",
            "what_it_constrains": "Global conductive ocean evidence through magnetic-field induction, corrected for plasma effects.",
            "improves_confidence_when": "Radar ocean candidates line up with broader evidence for a conductive subsurface ocean.",
            "warns_false_positive_when": "Radar shows a local bright reflector but broader induction evidence does not support the interpretation.",
            "v3_model_use": "Listed as a future cross-check; not numerically simulated yet.",
            "source_status": "NASA instrument-page anchored",
            "source_url": SOURCE_NASA_INSTRUMENTS,
        },
        {
            "evidence_source": "Surface composition",
            "instrument_or_dataset": "MISE",
            "what_it_constrains": "Surface salts, hydrates, acids, organics, and compositional terrain differences.",
            "improves_confidence_when": "Composition helps explain attenuation/risk zones and separates salt-rich false layers from clean ice.",
            "warns_false_positive_when": "Salt/hydrate-rich terrain raises the chance that a bright radar layer is compositional, not ocean.",
            "v3_model_use": "Maps directly to material-ambiguity risk.",
            "source_status": "NASA instrument-page anchored",
            "source_url": SOURCE_NASA_INSTRUMENTS,
        },
        {
            "evidence_source": "Thermal context",
            "instrument_or_dataset": "E-THEMIS",
            "what_it_constrains": "Thermal anomalies, warm ice, and possible recent activity.",
            "improves_confidence_when": "Thermal context supports a physically plausible warm/active region for brine or ocean interaction.",
            "warns_false_positive_when": "Warm dirty ice can increase attenuation and hide/deform the radar ocean return.",
            "v3_model_use": "Future input for attenuation-risk adjustment.",
            "source_status": "NASA instrument-page anchored",
            "source_url": SOURCE_NASA_INSTRUMENTS,
        },
        {
            "evidence_source": "Geology and roughness",
            "instrument_or_dataset": "EIS imaging",
            "what_it_constrains": "Surface morphology, fractures, chaos terrain, slopes, and roughness that affect clutter.",
            "improves_confidence_when": "Smooth or well-characterized terrain lowers the chance of off-nadir clutter confusion.",
            "warns_false_positive_when": "Rough, tilted, or fractured terrain can create clutter that mimics shallow subsurface echoes.",
            "v3_model_use": "Future input for surface-clutter risk and roughness category.",
            "source_status": "NASA instrument-page anchored",
            "source_url": SOURCE_NASA_INSTRUMENTS,
        },
        {
            "evidence_source": "UV activity and plumes",
            "instrument_or_dataset": "Europa-UVS",
            "what_it_constrains": "Possible plume activity and surface/exosphere interactions.",
            "improves_confidence_when": "Activity indicators support local exchange between surface, ice shell, and ocean/brine reservoirs.",
            "warns_false_positive_when": "Activity can also mark complex, heterogeneous ice where radar interpretation is harder.",
            "v3_model_use": "Listed as future context; not numerically simulated yet.",
            "source_status": "NASA instrument-page anchored",
            "source_url": SOURCE_NASA_INSTRUMENTS,
        },
        {
            "evidence_source": "Gravity / radio science",
            "instrument_or_dataset": "Gravity and radio tracking",
            "what_it_constrains": "Large-scale interior structure and ocean/ice-shell constraints.",
            "improves_confidence_when": "Radar-inferred shell thickness agrees with broader geophysical constraints.",
            "warns_false_positive_when": "A local radar boundary conflicts with plausible shell-thickness/geophysical bounds.",
            "v3_model_use": "Future model prior for shell-thickness confidence.",
            "source_status": "Mission-science context",
            "source_url": SOURCE_NASA_INSTRUMENTS,
        },
    ]
    return pd.DataFrame(rows)


def select_case(conf: pd.DataFrame, mask: pd.Series, sort_col: str, ascending: bool = False) -> pd.Series | None:
    subset = conf[mask].copy()
    if subset.empty:
        return None
    subset[sort_col] = pd.to_numeric(subset[sort_col], errors="coerce")
    subset = subset.sort_values(sort_col, ascending=ascending)
    return subset.iloc[0]


def case_row(case_id: str, name: str, question: str, row: pd.Series | None, note: str) -> dict[str, Any]:
    if row is None:
        return {
            "case_id": case_id,
            "case_name": name,
            "scientific_question": question,
            "x_km": "",
            "shell_mode": "",
            "scenario": "",
            "band": "",
            "ocean_depth_m": "",
            "ocean_snr_margin_db": "",
            "false_depth_m": "",
            "false_snr_margin_db": "",
            "false_minus_ocean_db": "",
            "surface_clutter_apparent_depth_m": "",
            "surface_clutter_snr_margin_db": "",
            "v2_classification": "not produced in this run",
            "v3_confidence_score_0_100": "",
            "v3_interpretation": "not applicable",
            "why_it_matters": note,
        }
    return {
        "case_id": case_id,
        "case_name": name,
        "scientific_question": question,
        "x_km": finite_or_blank(row.get("x_km"), 2),
        "shell_mode": row.get("shell_mode", ""),
        "scenario": row.get("scenario", ""),
        "band": row.get("band", ""),
        "ocean_depth_m": finite_or_blank(row.get("ocean_depth_m"), 1),
        "ocean_snr_margin_db": finite_or_blank(row.get("ocean_snr_margin_db"), 2),
        "false_depth_m": finite_or_blank(row.get("false_depth_m"), 1),
        "false_snr_margin_db": finite_or_blank(row.get("false_snr_margin_db"), 2),
        "false_minus_ocean_db": finite_or_blank(row.get("false_minus_ocean_db"), 2),
        "surface_clutter_apparent_depth_m": finite_or_blank(row.get("surface_clutter_apparent_depth_m"), 1),
        "surface_clutter_snr_margin_db": finite_or_blank(row.get("surface_clutter_snr_margin_db"), 2),
        "v2_classification": row.get("classification", ""),
        "v3_confidence_score_0_100": finite_or_blank(row.get("ocean_confidence_score_0_100"), 2),
        "v3_interpretation": row.get("v3_interpretation", ""),
        "why_it_matters": note,
    }


def build_case_studies(conf: pd.DataFrame) -> pd.DataFrame:
    ocean_window = conf["ocean_in_band_window_bool"]
    false_minus = numeric(conf["false_minus_ocean_db"])
    false_snr = numeric(conf["false_snr_margin_db"])
    clutter_snr = numeric(conf["surface_clutter_snr_margin_db"])
    ocean_snr = numeric(conf["ocean_snr_margin_db"])

    rows = [
        case_row(
            "case_01",
            "Clean control, confident ocean return",
            "What does the model look like when the ocean echo is easy to trust?",
            select_case(
                conf,
                (conf["scenario"] == "clean_ice_control")
                & (conf["band"] == "HF_9MHz_full_depth")
                & (conf["shell_mode"] == "workbook_mid_shell")
                & (conf["classification"] == "clear ocean boundary"),
                "ocean_confidence_score_0_100",
                ascending=False,
            ),
            "Provides a baseline for what a strong, uncomplicated ocean candidate looks like.",
        ),
        case_row(
            "case_02",
            "False layer stronger than ocean",
            "Where would trusting the brightest deep echo produce the wrong answer?",
            select_case(
                conf,
                conf["classification"].astype(str).eq("false layer stronger") & false_minus.notna(),
                "false_minus_ocean_db",
                ascending=False,
            ),
            "This is the core research-risk case: a dirty/internal boundary can dominate the true ocean echo.",
        ),
        case_row(
            "case_03",
            "Rough-surface clutter in shallow window",
            "Where can surface roughness mimic a shallow subsurface feature?",
            select_case(
                conf,
                conf["classification"].astype(str).eq("surface clutter in shallow window") & clutter_snr.notna(),
                "surface_clutter_snr_margin_db",
                ascending=False,
            ),
            "Shows why clutter has to be separated from real subsurface reflectors before interpreting VHF echoes.",
        ),
        case_row(
            "case_04",
            "Attenuation hides the ocean",
            "Where is the true ocean too weak for a deep-ocean call?",
            select_case(
                conf,
                conf["classification"].astype(str).eq("weak/no deep detection") & ocean_snr.notna(),
                "ocean_snr_margin_db",
                ascending=True,
            ),
            "Warm/dirty ice can make a non-detection ambiguous: the ocean may be present but hidden by loss.",
        ),
        case_row(
            "case_05",
            "Internal feature only",
            "Where does the band see a feature but not the ocean-depth boundary?",
            select_case(
                conf,
                conf["classification"].astype(str).eq("internal feature only") & false_snr.notna(),
                "false_snr_margin_db",
                ascending=False,
            ),
            "Prevents a shallow/intermediate reflector from being over-read as the ice-ocean interface.",
        ),
        case_row(
            "case_06",
            "Within-3-dB ambiguous boundary",
            "Did this run create a case where ocean and false echo are nearly tied?",
            select_case(
                conf,
                ocean_window & false_snr.ge(0.0) & false_minus.abs().le(3.0),
                "false_minus_ocean_db",
                ascending=False,
            ),
            "This near-tie case is why v3 tracks ambiguity separately from simple detected/not-detected logic.",
        ),
    ]
    return pd.DataFrame(rows)


def headline_conditioning(conf: pd.DataFrame) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []

    def add_row(label: str, denominator: str, group: pd.DataFrame) -> None:
        rows.append(
            {
                "conditioning": label,
                "denominator": denominator,
                "rows": int(len(group)),
                "high_confidence_ocean_pct": round(
                    percent_true(group["v3_interpretation"] == "high-confidence ocean candidate"), 2
                ),
                "moderate_or_high_ocean_pct": round(
                    percent_true(
                        group["v3_interpretation"].isin(
                            ["high-confidence ocean candidate", "moderate-confidence ocean candidate"]
                        )
                    ),
                    2,
                ),
                "ambiguous_false_or_clutter_pct": round(
                    percent_true(group["v3_broad_outcome"].isin(["ambiguous", "likely_false_boundary", "surface_clutter"])),
                    2,
                ),
                "not_interpretable_or_no_deep_call_pct": round(
                    percent_true(
                        group["v3_interpretation"].isin(
                            [
                                "too weak for deep-ocean call",
                                "outside this band's ocean-depth window",
                                "not enough evidence for an ocean call",
                            ]
                        )
                    ),
                    2,
                ),
            }
        )

    add_row(
        "all_point_band_cases",
        "All shell modes, scenarios, bands, and along-track points. This is broad, not band-specific.",
        conf,
    )
    for band, group in conf.groupby("band", sort=True):
        add_row(
            f"band_{band}",
            f"All shell modes, scenarios, and along-track points for {band}.",
            group,
        )
    for shell_mode, group in conf.groupby("shell_mode", sort=True):
        add_row(
            f"shell_{shell_mode}",
            f"All scenarios, bands, and along-track points for {shell_mode}.",
            group,
        )
    return pd.DataFrame(rows)


def prepare_input() -> pd.DataFrame:
    if not V2_RESULTS_CSV.exists():
        raise FileNotFoundError(f"Missing v2 results: {V2_RESULTS_CSV}")
    df = pd.read_csv(V2_RESULTS_CSV)
    df["ocean_in_band_window_bool"] = bool_series(df["ocean_in_band_window"])
    df["scenario_label"] = df["scenario"].map(SCENARIO_LABELS).fillna(df["scenario"])
    for column in [
        "x_km",
        "frequency_mhz",
        "ocean_depth_m",
        "surface_height_m",
        "surface_slope_deg",
        "lens_strength",
        "layer_count",
        "ocean_snr_margin_db",
        "false_snr_margin_db",
        "false_minus_ocean_db",
        "false_depth_m",
        "surface_clutter_snr_margin_db",
        "surface_clutter_minus_ocean_db",
        "surface_clutter_apparent_depth_m",
        "surface_roughness_index",
        "inferred_depth_m",
        "inferred_depth_error_m",
    ]:
        if column in df.columns:
            df[column] = pd.to_numeric(df[column], errors="coerce")
    return df


def markdown_table(df: pd.DataFrame) -> str:
    columns = list(df.columns)
    lines = [
        "| " + " | ".join(columns) + " |",
        "| " + " | ".join(["---"] * len(columns)) + " |",
    ]
    for _, row in df.iterrows():
        lines.append("| " + " | ".join(str(row[col]) for col in columns) + " |")
    return "\n".join(lines)


def write_readme(summary: pd.DataFrame, conf: pd.DataFrame, headline: pd.DataFrame) -> None:
    broad = headline[headline["conditioning"] == "all_point_band_cases"].iloc[0]
    band_rows = headline[headline["conditioning"].str.startswith("band_")].copy()
    table = markdown_table(
        band_rows[
            [
                "conditioning",
                "rows",
                "high_confidence_ocean_pct",
                "moderate_or_high_ocean_pct",
                "ambiguous_false_or_clutter_pct",
                "not_interpretable_or_no_deep_call_pct",
            ]
        ]
    )
    text = f"""# Paper-Calibrated Dirty-Ice Radar Simulation v3

V3 is the interpretation layer on top of the v2 paper-calibrated signal simulation.

It does not claim to be a NASA mission processor. It turns the v2 echo outputs into a transparent confidence score so the workbook can answer: if REASON saw this bright echo, how confident should we be that it is actually the ocean?

Main outputs:

- `paper_calibrated_v3_point_confidence.csv`: one row per v2 radar point with confidence score, risk components, and interpretation label.
- `paper_calibrated_v3_confidence_summary.csv`: scenario x band summary for dashboard use.
- `paper_calibrated_v3_uncertainty_ranges.csv`: optimistic, nominal, and pessimistic interpretation cases.
- `paper_calibrated_v3_cross_instrument_evidence.csv`: how other Europa Clipper measurements could support or weaken a radar interpretation.
- `paper_calibrated_v3_false_ocean_case_studies.csv`: real example points from the simulation, including false-boundary and clutter cases.
- `paper_calibrated_v3_headline_conditioning.csv`: headline percentages with their denominator and conditioning stated explicitly.

Headline checks from this run:

- High-confidence ocean candidate rows across all point/band cases: {broad["high_confidence_ocean_pct"]:.1f}%.
- Ambiguous, false-boundary, or clutter-risk rows across all point/band cases: {broad["ambiguous_false_or_clutter_pct"]:.1f}%.
- Not-interpretable or no-deep-call rows across all point/band cases: {broad["not_interpretable_or_no_deep_call_pct"]:.1f}%.
- Summary rows generated: {len(summary)}.

Band-conditioned headline checks:

{table}

Scoring caveat: the confidence score is a decision aid for a sensitivity simulation. It is not a probability from real REASON Europa data.
"""
    README_MD.write_text(text, encoding="utf-8")


def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    df = prepare_input()
    cross_support = add_cross_band_support(df)

    nominal = compute_confidence(df, PROFILES[1], cross_support)
    confidence_columns = [
        "x_km",
        "shell_mode",
        "scenario",
        "scenario_label",
        "band",
        "frequency_mhz",
        "band_role",
        "ocean_depth_m",
        "surface_height_m",
        "surface_slope_deg",
        "layer_count",
        "layer_source_statuses",
        "ocean_in_band_window",
        "classification",
        "ocean_snr_margin_db",
        "false_snr_margin_db",
        "false_minus_ocean_db",
        "false_depth_m",
        "surface_clutter_snr_margin_db",
        "surface_clutter_apparent_depth_m",
        "surface_roughness_index",
        "attenuation_risk_0_100",
        "false_layer_risk_0_100",
        "surface_clutter_risk_0_100",
        "material_ambiguity_risk_0_100",
        "band_window_penalty_0_100",
        "cross_band_support_0_100",
        "ocean_confidence_score_0_100",
        "confidence_band",
        "v3_broad_outcome",
        "v3_interpretation",
    ]
    point_confidence = nominal[confidence_columns].copy()
    summary = summarize_confidence(nominal)
    uncertainty = uncertainty_ranges(df, cross_support)
    evidence = cross_instrument_evidence()
    cases = build_case_studies(nominal)
    headline = headline_conditioning(nominal)

    point_confidence.to_csv(POINT_CONFIDENCE_CSV, index=False)
    summary.to_csv(CONFIDENCE_SUMMARY_CSV, index=False)
    uncertainty.to_csv(UNCERTAINTY_CSV, index=False)
    evidence.to_csv(CROSS_INSTRUMENT_CSV, index=False)
    cases.to_csv(CASE_STUDIES_CSV, index=False)
    headline.to_csv(HEADLINE_CONDITIONING_CSV, index=False)
    HEADLINE_CONDITIONING_JSON.write_text(json.dumps(headline.to_dict(orient="records"), indent=2), encoding="utf-8")
    write_readme(summary, nominal, headline)

    metadata = {
        "model_name": "paper_calibrated_dirty_ice_v3_confidence_layer",
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "based_on_v2_results": str(V2_RESULTS_CSV),
        "based_on_v2_summary": str(V2_SUMMARY_CSV),
        "based_on_v2_calibration": str(V2_CALIBRATION_CSV),
        "outputs": {
            "point_confidence_csv": str(POINT_CONFIDENCE_CSV),
            "confidence_summary_csv": str(CONFIDENCE_SUMMARY_CSV),
            "uncertainty_csv": str(UNCERTAINTY_CSV),
            "cross_instrument_csv": str(CROSS_INSTRUMENT_CSV),
            "case_studies_csv": str(CASE_STUDIES_CSV),
            "headline_conditioning_csv": str(HEADLINE_CONDITIONING_CSV),
            "headline_conditioning_json": str(HEADLINE_CONDITIONING_JSON),
            "readme": str(README_MD),
        },
        "headline_conditioning": headline.to_dict(orient="records"),
        "scoring_inputs": [
            "ocean_snr_margin_db",
            "false_minus_ocean_db",
            "surface_clutter_snr_margin_db",
            "surface_roughness_index",
            "layer_count",
            "scenario material ambiguity risk",
            "band depth window",
            "cross-band support",
        ],
        "confidence_profiles": [profile.__dict__ for profile in PROFILES],
        "caveat": "V3 is an interpretation-confidence layer for a sensitivity simulation, not a probability calibrated to real Europa REASON data.",
        "source_urls": [SOURCE_NASA_INSTRUMENTS, SOURCE_REASON_2024],
    }
    METADATA_JSON.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print(json.dumps({"rows": len(point_confidence), "summary_rows": len(summary), "outputs": metadata["outputs"]}, indent=2))


if __name__ == "__main__":
    main()
