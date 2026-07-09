# Europa Dirty-Ice Radar Simulation v2 - Methods And Claims Brief

## What v2 can claim

- This is a paper-calibrated sensitivity simulation, not real Europa radar data and not a NASA mission processor.
- In the workbook-depth, HF 9 MHz run, clean ice has a median true-ocean SNR margin of 13.4 dB.
- The stacked dirty-layer scenario reaches 100% deep false-boundary risk, which means the internal reflector competes with or exceeds the true ocean return under the v2 rule set.
- The complex dirty-ice scenario reaches 98.8% weak/no deep detection, which supports the separate failure mode that dirty or warm ice can hide the deep return.
- The briny/mushy lens case preserves a clear ocean interpretation at 32.4% of workbook-depth HF points in this version, so not every dirty or briny scenario creates a false bottom.
- The rough-surface clutter scenario reaches 98.8% VHF shallow-window clutter ambiguity, and the complex-plus-clutter scenario reaches 100.0%. This is separate from deep false-ocean risk.

## What changed from the original fake model

- REASON-aligned radar bands: 9 MHz and 60 MHz.
- Separate shell modes for thin 3 km, workbook-depth, and thick 30 km cases.
- Paper-anchored material library with epsilon and attenuation brackets.
- Normal-incidence transfer-matrix solver for unresolved thin-layer packets.
- Explicit interpretation classes: clear ocean, deep false-risk, weak/no deep detection, internal feature only, surface clutter in the shallow window, and outside depth window.
- VHF off-nadir clutter stress test based on the REASON paper's clutter/interferometry discussion.
- Basic physics checks for single-interface reflection and no-contrast zero reflection.

## Main problems still visible

- Attenuation remains the largest scientific uncertainty; warm, salty, or otherwise impure ice can change echo strength more than any single clean dielectric contrast.
- The false-reflector conclusion depends on the 3 dB ambiguity window and the 0 dB detection threshold.
- The clutter model is a stress-test proxy; it does not include spacecraft geometry, VHF antenna patterns, interferometric phase retrieval, real radar processing, or a full thermal evolution model.
- Mixed dirty-ice dielectric properties are still bracketed from paper-supported families rather than fully measured Europa-specific materials.

## Best next improvement

Upgrade the clutter proxy into a beam-pattern/interferometric-phase model, then add temperature-dependent attenuation curves by impurity family. Only move the stabilized outputs into Excel after those checks.

## Report artifacts

- outcomes: charts/01_hf_scenario_outcomes.png
- track: charts/02_false_layer_track_example.png
- band_shell: charts/03_band_shell_margin.png
- clutter: charts/07_vhf_clutter_stress.png
- materials: charts/04_material_library.png
- sensitivity: charts/05_attenuation_sensitivity.png
- validation: charts/06_physics_validation.png

## Source anchors

- NASA Europa Clipper instruments: https://science.nasa.gov/mission/europa-clipper/spacecraft-instruments/
- Blankenship et al. 2024 REASON: https://link.springer.com/article/10.1007/s11214-024-01072-3
- Lalich et al. 2021 radar interference analog: https://arxiv.org/abs/2107.03497
- Castelletti et al. 2017 cross-track clutter detection: https://doi.org/10.1109/TGRS.2017.2721433
- Scanlan et al. 2020 cross-track bed clutter discrimination: https://doi.org/10.1017/aog.2020.20
- Pettinelli et al. 2015 dielectric review: https://doi.org/10.1002/2014RG000463

Material endmembers in v2: 7.
