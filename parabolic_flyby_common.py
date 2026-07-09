from __future__ import annotations

import numpy as np


def altitude_profile_km(
    x_km: np.ndarray,
    closest_altitude_km: float = 400.0,
    altitude_rise_at_edge_km: float = 4.0,
    edge_x_km: float = 60.0,
) -> np.ndarray:
    x = np.asarray(x_km, dtype=float)
    return closest_altitude_km + altitude_rise_at_edge_km * (x / edge_x_km) ** 2


def vertical_speed_km_s(
    x_km: np.ndarray,
    along_speed_km_s: float,
    altitude_rise_at_edge_km: float = 4.0,
    edge_x_km: float = 60.0,
) -> np.ndarray:
    x = np.asarray(x_km, dtype=float)
    return 2.0 * altitude_rise_at_edge_km * x * along_speed_km_s / edge_x_km**2


def slant_range_m(x_km: np.ndarray, y_km: float, z_km: np.ndarray) -> np.ndarray:
    x = np.asarray(x_km, dtype=float)
    z = np.asarray(z_km, dtype=float)
    return 1000.0 * np.sqrt(x**2 + y_km**2 + z**2)


def apparent_depth_m(x_km: np.ndarray, y_km: float, z_km: np.ndarray, ice_index: float) -> np.ndarray:
    return (slant_range_m(x_km, y_km, z_km) - np.asarray(z_km, dtype=float) * 1000.0) / ice_index


def look_angle_deg(x_km: np.ndarray, y_km: float, z_km: np.ndarray) -> np.ndarray:
    x = np.asarray(x_km, dtype=float)
    z = np.asarray(z_km, dtype=float)
    horizontal_km = np.sqrt(x**2 + y_km**2)
    return np.degrees(np.arctan2(horizontal_km, z))


def range_rate_m_s(
    x_km: np.ndarray,
    y_km: float,
    z_km: np.ndarray,
    dx_dt_km_s: float,
    dz_dt_km_s: np.ndarray,
) -> np.ndarray:
    x = np.asarray(x_km, dtype=float)
    z = np.asarray(z_km, dtype=float)
    dz_dt = np.asarray(dz_dt_km_s, dtype=float)
    range_km = np.sqrt(x**2 + y_km**2 + z**2)
    return 1000.0 * (x * dx_dt_km_s + z * dz_dt) / range_km


def doppler_hz(range_rate_m_s: np.ndarray, wavelength_m: float) -> np.ndarray:
    return -2.0 * np.asarray(range_rate_m_s, dtype=float) / wavelength_m
