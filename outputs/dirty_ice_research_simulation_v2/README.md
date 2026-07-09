# Paper-Calibrated Dirty-Ice Radar Simulation v2

This folder is the first Python-only v2 pass. It does not update the Excel workbook.

Start with:

- `paper_calibrated_v2_report.html` for the readable overview.
- `paper_calibration_parameters.csv` for the paper/source anchors and remaining assumptions.
- `paper_material_library.csv` for the source-backed material values used by the scenarios.
- `paper_calibrated_v2_summary.csv` for headline percentages by shell mode, scenario, and radar band.
- `paper_calibrated_v2_results.csv` for along-track point results.
- `v1_v2_headline_comparison.csv` for the comparison against the previous dirty-ice run.
- `physics_validation_checks.csv` for quick sanity tests on the transfer-matrix solver.

The model uses REASON 9 MHz HF and 60 MHz VHF band modes, a 0 dB SNR-margin detection rule, capped 3 km and 30 km shell modes, dielectric anchors for clean ice, brine-filled ice, and hydrated salts, and a normal-incidence transfer-matrix solver for unresolved thin-layer packets. It is still a sensitivity simulation, not a full REASON link budget or NASA mission processor.

Classification note: `internal feature only` means the true ocean/interface is outside that band mode's interpreted depth window, but a shallower internal reflector is still visible.

To regenerate the outputs, run:

```powershell
& 'C:\Users\tyboy\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' 'outputs\dirty_ice_research_simulation_v2\paper_calibrated_dirty_ice_v2.py'
```
