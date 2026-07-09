from pathlib import Path

import pandas as pd

try:
    import matplotlib.pyplot as plt
except ModuleNotFoundError as exc:
    raise SystemExit(
        "matplotlib is required to run this script. Install it in the Python environment "
        "you use for this project, then rerun the script."
    ) from exc


BASE_DIR = Path(
    r"C:\Users\tyboy\OneDrive\Documents\Nasa project\outputs\codex-20260608-parabolic-radar-review"
)
WORKBOOK_PATH = BASE_DIR / "parabolic-motion-radar-model-baseline-and-runs-reviewed-geometry-explained.xlsx"
CSV_PATH = BASE_DIR / "Chart_Data.csv"
OUTPUT_PATH = BASE_DIR / "apparent_depth_terrain_baseline.png"


def load_chart_data() -> pd.DataFrame:
    """Load Chart_Data from CSV if present, otherwise from the workbook sheet."""
    if CSV_PATH.exists():
        return pd.read_csv(CSV_PATH)
    return pd.read_excel(WORKBOOK_PATH, sheet_name="Chart_Data")


df = load_chart_data()

# Chart_Data uses staggered chart-helper blocks. These are the requested indices.
x_km = pd.to_numeric(df.iloc[:, 0], errors="coerce")
parabolic_flat_depth_m = pd.to_numeric(df.iloc[:, 3], errors="coerce")
parabolic_topo_depth_m = pd.to_numeric(df.iloc[:, 4], errors="coerce")
nadir_topography_m = pd.to_numeric(df.iloc[:, 9], errors="coerce")

plot_df = pd.DataFrame(
    {
        "x_km": x_km,
        "nadir_topography_m": nadir_topography_m,
        "parabolic_flat_depth_m": parabolic_flat_depth_m,
        "parabolic_topo_depth_m": parabolic_topo_depth_m,
    }
).dropna()

# Transform radar depth into apparent elevation relative to the actual terrain.
plot_df["apparent_elevation_flat_m"] = (
    plot_df["nadir_topography_m"] - plot_df["parabolic_flat_depth_m"]
)
plot_df["apparent_elevation_topo_m"] = (
    plot_df["nadir_topography_m"] - plot_df["parabolic_topo_depth_m"]
)

plt.figure(figsize=(10, 6))

plt.plot(
    plot_df["x_km"],
    plot_df["nadir_topography_m"],
    color="green",
    linewidth=3,
    label="Actual Terrain Surface (Baseline)",
)
plt.plot(
    plot_df["x_km"],
    plot_df["apparent_elevation_flat_m"],
    color="blue",
    linestyle="--",
    linewidth=2,
    label="Apparent Radar Horizon (Flat Geometry)",
)
plt.plot(
    plot_df["x_km"],
    plot_df["apparent_elevation_topo_m"],
    color="orange",
    linewidth=2.5,
    label="Apparent Radar Horizon (Topo-Adjusted)",
)

plt.title("Radar Apparent Elevation Relative to Actual Terrain")
plt.xlabel("Along-track Distance x (km)")
plt.ylabel("Elevation (m)")
plt.grid(True, alpha=0.3)
plt.legend(loc="best")
plt.tight_layout()
plt.savefig(OUTPUT_PATH, dpi=200)
