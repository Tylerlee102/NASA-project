# Graph Validation Report

Generated: 2026-06-26

This audit treats the site as an illustrative synthetic radar sensitivity model. It does not claim NASA mission validation, real Europa detection, or a calibrated flight processor.

## Summary

- Rendered graph instances found: 51
- Passed after fixes: 51
- Need human review: 0
- Failed after fixes: 0
- Fixed misleading chart-title issues documented here: 5

## Sources Inspected

- docs/index.html: present
- docs/app.js: present
- docs/model.js: present
- docs/styles.css: present
- docs/data/v19-results.js: present
- docs/data/v30-results.js: present
- docs/assets/v30_all_dynamic_graphs.xlsx: present

## Workbook Asset

docs/assets/v30_all_dynamic_graphs.xlsx exists (7309 KB) with 41 worksheet XML file(s) and 56 embedded chart XML file(s). The website audit validates the extracted/browser chart objects rather than recalculating the workbook.

## Fixes Made During This Audit

| Graph | Affected instances | Mistake before fix | Fix |
|---|---|---|---|
| Subsurface Truth Model: Icy Layers | v19 and v30 rendered instances | The chart plotted layer elevations relative to the model reference, but the old wording mixed elevation and raw depth. | Changed the y-axis wording and explanation to "Elevation relative to model reference (m)". |
| Reflection Strength by Material / Interface | v19 and v30 rendered instances | The bars are assumed reflector strengths, not detection margins; the old label implied a threshold margin. | Changed the y-axis wording and explanation to "Relative reflector strength (dB)". |
| Reflection Strength by Material / Interface | v19 and v30 categorical bar charts | A categorical material chart previously inherited an along-track x-axis label. | Set the x-axis to "Material / interface" and kept it as a bar chart. |
| Cross-Instrument Evidence Score | v19 and v30 categorical bar charts | A categorical evidence chart previously inherited an along-track x-axis label. | Set the x-axis to "Instrument" and kept it as a bar chart. |
| Terrain Baseline: Total Radar Elevation Error | v30 terrain-error chart | The y-axis label was generic, so it did not say what the value represented. | Set the y-axis to "Surface-height equivalent error (m)". |

## Complete Graph Inventory

| # | Status | Version | Section/tab | Graph title | Chart ID/render object | Source file | Source data object | X-axis variable | Y-axis variable | Plotted series | Units | Formula used | What the graph claims to show | What the graph actually shows | Notes |
|---:|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | PASS | v19 | Surface and motion | Surface Height: Off-Nadir Target vs Nadir Reference Terrain | live-surface-height | docs/model.js + docs/data/v19-results.js | window.V19_LIVE_MODEL.compute(defaults).charts | Along-track position in kilometers. | Surface elevation in meters relative to the model reference. | Off-nadir target terrain; Nadir terrain | km, m | topography(x, y, params) is sampled for the target and nadir reference paths. | Terrain is a moving reference surface that must be separated from subsurface timing. | It renders 2 series (Off-nadir target terrain; Nadir terrain) against Along-track position (km) and Surface elevation (m). Y-values range from -156.935 to 568.644 m. | None. |
| 2 | PASS | v19 | Surface and motion | Apparent Depth: Spacecraft Motion Distortion by Run | live-scenario-depth | docs/model.js + docs/data/v19-results.js | window.V19_LIVE_MODEL.compute(defaults).charts | Along-track position in kilometers. | Apparent depth in meters caused by geometry, not a true reflector depth. | Custom 400 km / 120 km pass; Paper low-altitude 35 km / 800 km pass; Paper ice-ocean 35 km / 1600 km pass; Operating 25 km / 1600 km pass | km, m | Slant-path excess is converted to apparent depth using the radar two-way travel-time geometry. | Motion geometry can create depth-like structure that must not be mistaken for ice structure. | It renders 4 series (Custom 400 km / 120 km pass; Paper low-altitude 35 km / 800 km pass; Paper ice-ocean 35 km / 1600 km pass; Operating 25 km / 1600 km pass) against Along-track position (km) and Apparent depth (m). Y-values range from 550.7 to 238293.574 m. | None. |
| 3 | PASS | v19 | Surface and motion | Terrain Baseline: Surface-Height Equivalent Error | live-terrain-error | docs/model.js + docs/data/v19-results.js | window.V19_LIVE_MODEL.compute(defaults).charts | Along-track position in kilometers. | Surface-height equivalent error in meters. | Total radar elevation error - custom parabolic | km, m | Surface-height equivalent error is the target/reference terrain mismatch converted to meters. | Terrain mismatch is a baseline error source that can bias a depth interpretation. | It renders 1 series (Total radar elevation error - custom parabolic) against Along-track position (km) and Surface-height equivalent error (m). Y-values range from 79.488 to 539.32 m. | None. |
| 4 | PASS | v19 | Surface and motion | Doppler: Flat Geometry vs Topography | live-doppler-flat-topo | docs/model.js + docs/data/v19-results.js | window.V19_LIVE_MODEL.compute(defaults).charts | Along-track position in kilometers. | Doppler shift in hertz. | Flat VHF Doppler (Hz); Topo VHF Doppler (Hz); Flat HF Doppler (Hz); Topo HF Doppler (Hz) | km, Hz | Doppler shift is computed from radial velocity sensitivity for flat and topographic cases. | Doppler is another geometry-sensitive observable, not direct evidence of an ocean. | It renders 4 series (Flat VHF Doppler (Hz); Topo VHF Doppler (Hz); Flat HF Doppler (Hz); Topo HF Doppler (Hz)) against Along-track position (km) and Doppler shift (Hz). Y-values range from -576.664 to 561.993 Hz. | None. |
| 5 | PASS | v19 | Surface and motion | Scenario Two-Way Extra Delay: Flat Surface | live-scenario-delay | docs/model.js + docs/data/v19-results.js | window.V19_LIVE_MODEL.compute(defaults).charts | Along-track position in kilometers. | Two-way extra delay in microseconds. | Custom 400 km / 120 km pass; Paper low-altitude 35 km / 800 km pass; Paper ice-ocean 35 km / 1600 km pass; Operating 25 km / 1600 km pass | km, us | Two-way extra delay is 2 times extra path length divided by the speed of light, converted to microseconds. | The delay is a geometry timing cost, not a measured subsurface delay. | It renders 4 series (Custom 400 km / 120 km pass; Paper low-altitude 35 km / 800 km pass; Paper ice-ocean 35 km / 1600 km pass; Operating 25 km / 1600 km pass) against Along-track position (km) and Two-way extra delay (us). Y-values range from 6.539 to 2829.708 us. | None. |
| 6 | PASS | v19 | Surface and motion | Custom Pass Two-Way Extra Delay: Flat vs Generated Topography | live-delay-flat-topo | docs/model.js + docs/data/v19-results.js | window.V19_LIVE_MODEL.compute(defaults).charts | Along-track position in kilometers. | Two-way extra delay in microseconds. | Flat surface pass; Topography-adjusted pass | km, us | Two-way delay equals 2 times extra path length divided by c, converted to microseconds. | Topography can change timing enough to matter for depth interpretation. | It renders 2 series (Flat surface pass; Topography-adjusted pass) against Along-track position (km) and Two-way extra delay (us). Y-values range from 3.282 to 43.555 us. | None. |
| 7 | PASS | v19 | Subsurface model | Subsurface Truth Model: Icy Layers | live-icy-layers | docs/model.js + docs/data/v19-results.js | window.V19_LIVE_MODEL.compute(defaults).charts | Along-track position in kilometers. | Elevation relative to the model reference in meters. | Icy top surface; Shallow ice layer; Warm/briny lens; Ice-ocean boundary | km, m | Layer elevations are produced by subtracting modeled layer depths from local surface elevation. | The model deliberately includes competing internal reflectors before the deepest boundary. | It renders 4 series (Icy top surface; Shallow ice layer; Warm/briny lens; Ice-ocean boundary) against Along-track position (km) and Elevation relative to model reference (m). Y-values range from -15618.159 to 568.644 m. | None. |
| 8 | PASS | v19 | Subsurface model | Scenario Comparison: Thin / Medium / Thick Ice | live-shell-scenarios | docs/model.js + docs/data/v19-results.js | window.V19_LIVE_MODEL.compute(defaults).charts | Along-track position in kilometers. | Depth below local surface in meters. | Thin shell; Medium shell; Thick shell | km, m | Boundary depth profile is offset/scaled by shell-thickness scenario multipliers. | Shell-thickness assumptions strongly affect the modeled boundary depth. | It renders 3 series (Thin shell; Medium shell; Thick shell) against Along-track position (km) and Depth (m). Y-values range from 7996.089 to 28115.726 m. | None. |
| 9 | PASS | v19 | Subsurface model | Boundary Uncertainty Band | live-uncertainty-band | docs/model.js + docs/data/v19-results.js | window.V19_LIVE_MODEL.compute(defaults).charts | Along-track position in kilometers. | Depth below local surface in meters. | Lower bound; Mean boundary; Upper bound | km, m | Lower and upper bounds are the mean boundary depth plus/minus the uncertainty term. | The boundary should be read as a band, not a single exact line. | It renders 3 series (Lower bound; Mean boundary; Upper bound) against Along-track position (km) and Depth (m). Y-values range from 13038.343 to 17566.129 m. | None. |
| 10 | PASS | v19 | Subsurface model | Ocean Model vs No-Ocean Control | live-ocean-control | docs/model.js + docs/data/v19-results.js | window.V19_LIVE_MODEL.compute(defaults).charts | Along-track position in kilometers. | Relative power or threshold margin in dB. | Ocean model margin; No-ocean control margin; 0 dB threshold | km, dB | Margin equals signal strength minus detection threshold in dB. | The ocean-model echo is meaningful only if it separates from the no-ocean control. | It renders 3 series (Ocean model margin; No-ocean control margin; 0 dB threshold) against Along-track position (km) and Relative power / margin (dB). Y-values range from -16.499 to 11.938 dB. | None. |
| 11 | PASS | v19 | Subsurface model | Radargram-Style Return Timing With Clutter | live-radargram | docs/model.js + docs/data/v19-results.js | window.V19_LIVE_MODEL.compute(defaults).charts | Along-track position in kilometers. | Two-way delay in microseconds. | Surface clutter upper; Shallow ice return; Warm/briny lens return; Ocean boundary return | km, us | Layer depth is converted to two-way in-ice travel time using the ice propagation speed. | Earlier internal echoes can compete with the boundary echo. | It renders 4 series (Surface clutter upper; Shallow ice return; Warm/briny lens return; Ocean boundary return) against Along-track position (km) and Delay (us). Y-values range from 10.502 to 192.253 us. | None. |
| 12 | PASS | v19 | Subsurface model | Detectability Margin vs Threshold | live-detectability | docs/model.js + docs/data/v19-results.js | window.V19_LIVE_MODEL.compute(defaults).charts | Along-track position in kilometers. | Relative power or threshold margin in dB. | Lens echo margin; Ocean echo margin; 0 dB threshold | km, dB | Margin equals echo signal minus detection threshold in dB. | If the lens margin rivals the boundary margin, strongest-return interpretation is ambiguous. | It renders 3 series (Lens echo margin; Ocean echo margin; 0 dB threshold) against Along-track position (km) and Relative power / margin (dB). Y-values range from 0 to 21.491 dB. | None. |
| 13 | PASS | v19 | Subsurface model | Reflection Strength by Material / Interface | live-materials | docs/model.js + docs/data/v19-results.js | window.V19_LIVE_MODEL.compute(defaults).charts | Categorical material or interface name. | Relative reflector strength in dB. | Material/interface strength | dB, category | Each category is assigned a relative dB reflector-strength value, adjusted by impurity and signal settings in v30. | Internal contrasts can be strong enough to compete with a boundary return in the simplified model. | It renders 1 series (Material/interface strength) against Material / interface and Relative reflector strength (dB). Y-values range from -18 to -2 dB. | None. |
| 14 | PASS | v19 | Subsurface model | Cross-Instrument Evidence Score | live-evidence | docs/model.js + docs/data/v19-results.js | window.V19_LIVE_MODEL.compute(defaults).charts | Categorical instrument or evidence channel. | Support score in percent. | Evidence support score | %, category | Each channel receives a bounded 0-100 support score from the browser scoring model. | Radar should be read alongside other context, but these scores are illustrative. | It renders 1 series (Evidence support score) against Instrument and Support (%). Y-values range from 35 to 55 %. | None. |
| 15 | PASS | v19 | False-layer response | Competing Echo Margins: Receiver Signal Strength | live-false-echo-race | docs/model.js + docs/data/v19-results.js | window.V19_LIVE_MODEL.compute(defaults).charts | Along-track position in kilometers. | Margin above threshold in dB. | Surface clutter margin; False layer margin; Ocean boundary margin; 0 dB threshold | km, dB | Each margin equals candidate signal minus detection threshold in dB. | A strong false layer can make a bright return ambiguous. | It renders 4 series (Surface clutter margin; False layer margin; Ocean boundary margin; 0 dB threshold) against Along-track position (km) and Margin above threshold (dB). Y-values range from 0 to 40.36 dB. | None. |
| 16 | PASS | v19 | False-layer response | Picked Boundary Depth vs True Ocean Depth | live-false-picked-depth | docs/model.js + docs/data/v19-results.js | window.V19_LIVE_MODEL.compute(defaults).charts | Along-track position in kilometers. | Depth below local surface in meters. | True ocean boundary; False layer depth; Receiver selected boundary | km, m | Receiver selected depth is chosen by the simplified receiver decision from candidate echo margins; ambiguous double returns use the midpoint between false layer and boundary. | A receiver can pick a shallower false layer when it is the stronger candidate. | It renders 3 series (True ocean boundary; False layer depth; Receiver selected boundary) against Along-track position (km) and Depth below local surface (m). Y-values range from 9419.685 to 16066.129 m. | None. |
| 17 | PASS | v19 | False-layer response | Return Timing: False Layer Arrives Before Ocean | live-false-delay | docs/model.js + docs/data/v19-results.js | window.V19_LIVE_MODEL.compute(defaults).charts | Along-track position in kilometers. | Two-way in-ice delay in microseconds. | False layer return; Ocean boundary return; Receiver selected return | km, us | Two-way delay equals 2 times depth divided by ice propagation speed, converted to microseconds. | Arrival order can help show why false internal layers are plausible competitors. | It renders 3 series (False layer return; Ocean boundary return; Receiver selected return) against Along-track position (km) and Two-way delay in ice (us). Y-values range from 111.858 to 190.783 us. | None. |
| 18 | PASS | v19 | False-layer response | Depth Error If the Receiver Picks the Wrong Layer | live-false-depth-error | docs/model.js + docs/data/v19-results.js | window.V19_LIVE_MODEL.compute(defaults).charts | Along-track position in kilometers. | Depth error in meters. | Selected minus true ocean; No error line | km, m | Depth error equals selected depth minus true boundary depth. | Wrong picks can substantially underestimate boundary depth. | It renders 2 series (Selected minus true ocean; No error line) against Along-track position (km) and Depth error (m). Y-values range from -5894.015 to 0 m. | None. |
| 19 | PASS | v19 | False-layer response | Satellite Receiver Decision Along Track | live-false-decision-code | docs/model.js + docs/data/v19-results.js | window.V19_LIVE_MODEL.compute(defaults).charts | Along-track position in kilometers. | Receiver decision code. | 0 weak, 1 ocean, 2 ambiguous, 3 false | km | Decision code maps the strongest/valid candidate into documented categories 0, 1, 2, or 3. | The code sequence shows where the receiver would trust ocean, pick false, see clutter, or fail detection. | It renders 1 series (0 weak, 1 ocean, 2 ambiguous, 3 false) against Along-track position (km) and Decision code. Y-values range from 2 to 3 label-defined. | None. |
| 20 | PASS | v19 | False-layer response | Receiver Outcome Share for This Flyby | live-false-decision-share | docs/model.js + docs/data/v19-results.js | window.V19_LIVE_MODEL.compute(defaults).charts | Categorical receiver outcome. | Percent of along-track samples. | Share of samples | %, category | Each category count is divided by total samples and converted to percent. | This summarizes the receiver ambiguity pattern for the selected flyby. | It renders 1 series (Share of samples) against Receiver outcome and Percent of along-track samples. Y-values range from 0 to 80.913 %. | None. |
| 21 | PASS | v19 | Doppler depth correction | Doppler-Inverted Look Angle vs Existing Geometry | live-doppler-angle | docs/model.js + docs/data/v19-results.js | window.V19_LIVE_MODEL.compute(defaults).charts | Along-track position in kilometers. | Look angle in degrees. | Doppler angle from VHF shift; Angle used after residual; Existing model geometry angle | km, deg | Look angle is inverted from Doppler using the same speed/frequency convention, then compared with geometry. | Doppler can help estimate look angle, but this is a controlled model demonstration. | It renders 3 series (Doppler angle from VHF shift; Angle used after residual; Existing model geometry angle) against Along-track position (km) and Look angle (deg). Y-values range from 0.077 to 18.471 deg. | None. |
| 22 | PASS | v19 | Doppler depth correction | Raw Slant Depth vs Doppler-Corrected Ocean Depth | live-slant-depth | docs/model.js + docs/data/v19-results.js | window.V19_LIVE_MODEL.compute(defaults).charts | Along-track position in kilometers. | Depth below local surface in meters. | True simulated ocean depth; Raw slant depth from echo delay; Doppler-corrected depth estimate | km, m | Corrected depth applies the angle correction to the raw slant-depth estimate. | Geometry correction can reduce slant-path depth bias in the synthetic model. | It renders 3 series (True simulated ocean depth; Raw slant depth from echo delay; Doppler-corrected depth estimate) against Along-track position (km) and Depth below local surface (m). Y-values range from 14525.531 to 16083.837 m. | None. |
| 23 | PASS | v19 | Doppler depth correction | Depth Error Before and After Angle Correction | live-depth-error | docs/model.js + docs/data/v19-results.js | window.V19_LIVE_MODEL.compute(defaults).charts | Along-track position in kilometers. | Depth error in meters. | Uncorrected slant-depth error; Corrected depth residual | km, m | Each error equals estimated depth minus true boundary depth. | The correction reduces geometry-driven bias but does not validate real data. | It renders 2 series (Uncorrected slant-depth error; Corrected depth residual) against Along-track position (km) and Depth error (m). Y-values range from -12.812 to 780.345 m. | None. |
| 24 | PASS | v19 | Doppler depth correction | Corrected Layer Depths From Doppler Angle | live-corrected-layers | docs/model.js + docs/data/v19-results.js | window.V19_LIVE_MODEL.compute(defaults).charts | Along-track position in kilometers. | Depth below local surface in meters. | Corrected upper-layer depth; Corrected briny lens depth; Corrected ocean boundary depth | km, m | Layer slant estimates are corrected back to depth below local surface. | The correction preserves relative layer structure while reducing geometry bias. | It renders 3 series (Corrected upper-layer depth; Corrected briny lens depth; Corrected ocean boundary depth) against Along-track position (km) and Depth below local surface (m). Y-values range from 945.591 to 16064.362 m. | None. |
| 25 | PASS | v30 | Advanced sensitivity | HF 9 MHz Mid-Shell Confidence vs Ambiguity | v30-1-hf-9-mhz-mid-shell-confidence-vs-ambiguity | docs/model.js + docs/data/v30-results.js | window.V30_LIVE_MODEL.compute(defaults, window.V30_RESULTS).charts | Categorical ice/clutter scenario. | Percent or 0-100 score. | Median confidence; Ambiguous/false % | 0-100, %, category | Scenario stress is converted into a bounded 0-100 confidence score and ambiguous/false percentage. | The chart is a synthetic scoring aid for ambiguity risk, not a calibrated probability. | It renders 2 series (Median confidence; Ambiguous/false %) against Scenario and Percent / score (0-100). Y-values range from 20.17 to 79.83 0-100, %. | None. |
| 26 | PASS | v30 | Advanced sensitivity | Pulse compression gain vs pulse length | v30-2-pulse-compression-gain-vs-pulse-length | docs/model.js + docs/data/v30-results.js | window.V30_LIVE_MODEL.compute(defaults, window.V30_RESULTS).charts | Pulse length in microseconds. | Relative gain in dB. | HF pulse gain; VHF pulse gain; Selected pulse setting | us, dB | Gain equals 10log10(pulse length in us) plus window loss, with a VHF offset used for sensitivity comparison. | Longer pulse length raises the simplified sensitivity proxy. | It renders 3 series (HF pulse gain; VHF pulse gain; Selected pulse setting) against Pulse length (us) and dB. Y-values range from 5.645 to 28.656 dB. | None. |
| 27 | PASS | v30 | Advanced sensitivity | Geometric spreading power dB | v30-3-geometric-spreading-power-db | docs/model.js + docs/data/v30-results.js | window.V30_LIVE_MODEL.compute(defaults, window.V30_RESULTS).charts | Along-track position in kilometers. | Relative power in dB. | HF geometric power; VHF topo geometric power | km, dB | Power scales as a two-way geometric ratio, reported as 10log10((R0/R)^4) with reflectivity offsets. | Geometry affects power before material interpretation. | It renders 2 series (HF geometric power; VHF topo geometric power) against Along-track position (km) and dB. Y-values range from -0.278 to -0.021 dB. | None. |
| 28 | PASS | v30 | Advanced sensitivity | Coherent Fresnel-zone gain | v30-4-coherent-fresnel-zone-gain | docs/model.js + docs/data/v30-results.js | window.V30_LIVE_MODEL.compute(defaults, window.V30_RESULTS).charts | Along-track position in kilometers. | Relative coherent gain in dB. | HF coherent gain; VHF coherent gain | km, dB | Coherent adjustment is a power-ratio proxy using spacing ratio and ice-index ratio in dB. | This is an aperture/coherence sensitivity proxy, not a full aperture-synthesis model. | It renders 2 series (HF coherent gain; VHF coherent gain) against Along-track position (km) and dB. Y-values range from 6.023 to 10.194 dB. | None. |
| 29 | PASS | v30 | Advanced sensitivity | Total VHF dB: constant vs frequency-dependent response | v30-5-total-vhf-db-constant-vs-frequency-dependent-response | docs/model.js + docs/data/v30-results.js | window.V30_LIVE_MODEL.compute(defaults, window.V30_RESULTS).charts | Along-track position in kilometers. | Relative total VHF power in dB. | Constant reflectivity; Frequency-dependent reflectivity | km, dB | Total VHF dB sums geometric power, coherent gain, pulse gain, attenuation penalty, and optional frequency response. | Frequency response is a sensitivity comparison, not an observation. | It renders 2 series (Constant reflectivity; Frequency-dependent reflectivity) against Along-track position (km) and dB. Y-values range from -5.005 to 0.668 dB. | None. |
| 30 | PASS | v30 | Advanced sensitivity | HF 9 MHz Workbook-Depth Outcomes | v30-7-hf-9-mhz-workbook-depth-outcomes | docs/model.js + docs/data/v30-results.js | window.V30_LIVE_MODEL.compute(defaults, window.V30_RESULTS).charts | Categorical scenario. | Percent share from 0 to 100. | Clear ocean; Deep false risk; Weak/no deep | 0-100, %, category | Clear, false-risk, and weak/no-deep shares are bounded and converted to percent. | The chart compares outcome shares under synthetic HF scenario stress. | It renders 3 series (Clear ocean; Deep false risk; Weak/no deep) against Scenario and Percent (0-100). Y-values range from 5.688 to 87.55 0-100, %. | None. |
| 31 | PASS | v30 | Advanced sensitivity | VHF 60 MHz Shallow Clutter Stress Test | v30-8-vhf-60-mhz-shallow-clutter-stress-test | docs/model.js + docs/data/v30-results.js | window.V30_LIVE_MODEL.compute(defaults, window.V30_RESULTS).charts | Categorical scenario. | Percent share from 0 to 100. | Surface clutter; Internal feature; Outside shallow window; Weak/no detection | 0-100, %, category | Surface clutter, internal feature, outside-window, and weak/no-detection shares are bounded and converted to percent. | The chart shows where shallow clutter or internal features dominate a simplified VHF scenario. | It renders 4 series (Surface clutter; Internal feature; Outside shallow window; Weak/no detection) against Scenario and Percent (0-100). Y-values range from 1.513 to 63.825 0-100, %. | None. |
| 32 | PASS | v30 | Advanced sensitivity | Surface Height: Off-Nadir Target vs Nadir Reference Terrain | v30-9-surface-height-generated-topography-reference-floor-target-and-nadir | docs/model.js + docs/data/v30-results.js | window.V30_LIVE_MODEL.compute(defaults, window.V30_RESULTS).charts | Along-track position in kilometers. | Surface elevation in meters relative to the model reference. | Off-nadir target terrain; Nadir terrain | km, m | topography(x, y, params) is sampled for the target and nadir reference paths. | Terrain is a moving reference surface that must be separated from subsurface timing. | It renders 2 series (Off-nadir target terrain; Nadir terrain) against Along-track position (km) and Surface elevation (m). Y-values range from -156.935 to 568.644 m. | None. |
| 33 | PASS | v30 | Advanced sensitivity | Apparent Depth: Spacecraft Motion Distortion by Run | v30-10-apparent-depth-spacecraft-motion-distortion-by-run | docs/model.js + docs/data/v30-results.js | window.V30_LIVE_MODEL.compute(defaults, window.V30_RESULTS).charts | Along-track position in kilometers. | Apparent depth in meters caused by geometry, not a true reflector depth. | Custom 400 km / 120 km pass; Paper low-altitude 35 km / 800 km pass; Paper ice-ocean 35 km / 1600 km pass; Operating 25 km / 1600 km pass | km, m | Slant-path excess is converted to apparent depth using the radar two-way travel-time geometry. | Motion geometry can create depth-like structure that must not be mistaken for ice structure. | It renders 4 series (Custom 400 km / 120 km pass; Paper low-altitude 35 km / 800 km pass; Paper ice-ocean 35 km / 1600 km pass; Operating 25 km / 1600 km pass) against Along-track position (km) and Apparent depth (m). Y-values range from 550.7 to 238293.574 m. | None. |
| 34 | PASS | v30 | Advanced sensitivity | Terrain Baseline: Total Radar Elevation Error | v30-11-terrain-baseline-total-radar-elevation-error | docs/model.js + docs/data/v30-results.js | window.V30_LIVE_MODEL.compute(defaults, window.V30_RESULTS).charts | Along-track position in kilometers. | Surface-height equivalent error in meters. | Total radar elevation error - custom parabolic | km, m | The browser model computes surface-height equivalent error from geometry plus generated terrain. | This is the terrain/elevation contribution to radar timing error, not an ocean-depth estimate. | It renders 1 series (Total radar elevation error - custom parabolic) against Along-track position (km) and Surface-height equivalent error (m). Y-values range from -100.705 to 155.165 m. | None. |
| 35 | PASS | v30 | Advanced sensitivity | Doppler: Flat Geometry vs Topography | v30-12-doppler-flat-geometry-vs-topography | docs/model.js + docs/data/v30-results.js | window.V30_LIVE_MODEL.compute(defaults, window.V30_RESULTS).charts | Along-track position in kilometers. | Doppler shift in hertz. | Flat VHF Doppler (Hz); Topo VHF Doppler (Hz); Flat HF Doppler (Hz); Topo HF Doppler (Hz) | km, Hz | Doppler shift is computed from radial velocity sensitivity for flat and topographic cases. | Doppler is another geometry-sensitive observable, not direct evidence of an ocean. | It renders 4 series (Flat VHF Doppler (Hz); Topo VHF Doppler (Hz); Flat HF Doppler (Hz); Topo HF Doppler (Hz)) against Along-track position (km) and Doppler shift (Hz). Y-values range from -576.664 to 561.993 Hz. | None. |
| 36 | PASS | v30 | Advanced sensitivity | Nadir Radar Delay by Flyby: Without Topography | v30-13-nadir-radar-delay-by-flyby-without-topography | docs/model.js + docs/data/v30-results.js | window.V30_LIVE_MODEL.compute(defaults, window.V30_RESULTS).charts | Along-track position in kilometers. | Delay in microseconds. | Custom 400 km / 120 km pass; Paper low-altitude 35 km / 800 km pass; Paper ice-ocean 35 km / 1600 km pass; Operating 25 km / 1600 km pass | km, us | Round-trip path delay is computed from nadir geometry and converted to microseconds. | This is a reference timing baseline for flyby comparisons. | It renders 4 series (Custom 400 km / 120 km pass; Paper low-altitude 35 km / 800 km pass; Paper ice-ocean 35 km / 1600 km pass; Operating 25 km / 1600 km pass) against Along-track position (km) and Delay (us). Y-values range from 166.782 to 6671.282 us. | None. |
| 37 | PASS | v30 | Advanced sensitivity | Nadir Radar Delay by Flyby: With Generated Topography | v30-14-nadir-radar-delay-by-flyby-with-generated-topography | docs/model.js + docs/data/v30-results.js | window.V30_LIVE_MODEL.compute(defaults, window.V30_RESULTS).charts | Along-track position in kilometers. | Delay in microseconds. | Custom 400 km / 120 km pass; Paper low-altitude 35 km / 800 km pass; Paper ice-ocean 35 km / 1600 km pass; Operating 25 km / 1600 km pass | km, us | Round-trip path delay is recomputed after terrain height changes the reference surface. | Nadir timing still needs terrain correction before subsurface interpretation. | It renders 4 series (Custom 400 km / 120 km pass; Paper low-altitude 35 km / 800 km pass; Paper ice-ocean 35 km / 1600 km pass; Operating 25 km / 1600 km pass) against Along-track position (km) and Delay (us). Y-values range from 166.742 to 6671.248 us. | None. |
| 38 | PASS | v30 | Advanced sensitivity | Off-Nadir Radar Delay by Flyby: Without Topography | v30-15-off-nadir-radar-delay-by-flyby-without-topography | docs/model.js + docs/data/v30-results.js | window.V30_LIVE_MODEL.compute(defaults, window.V30_RESULTS).charts | Along-track position in kilometers. | Delay in microseconds. | Custom 400 km / 120 km pass; Paper low-altitude 35 km / 800 km pass; Paper ice-ocean 35 km / 1600 km pass; Operating 25 km / 1600 km pass | km, us | Two-way delay is computed from the off-nadir slant path and converted to microseconds. | Side-looking geometry can mimic depth unless corrected. | It renders 4 series (Custom 400 km / 120 km pass; Paper low-altitude 35 km / 800 km pass; Paper ice-ocean 35 km / 1600 km pass; Operating 25 km / 1600 km pass) against Along-track position (km) and Delay (us). Y-values range from 236.807 to 9500.99 us. | None. |
| 39 | PASS | v30 | Advanced sensitivity | Off-Nadir Radar Delay by Flyby: With Generated Topography | v30-16-off-nadir-radar-delay-by-flyby-with-generated-topography | docs/model.js + docs/data/v30-results.js | window.V30_LIVE_MODEL.compute(defaults, window.V30_RESULTS).charts | Along-track position in kilometers. | Delay in microseconds. | Custom 400 km / 120 km pass; Paper low-altitude 35 km / 800 km pass; Paper ice-ocean 35 km / 1600 km pass; Operating 25 km / 1600 km pass | km, us | Two-way slant-path delay is recomputed with local target terrain height. | Off-nadir timing must be separated from real in-ice delay. | It renders 4 series (Custom 400 km / 120 km pass; Paper low-altitude 35 km / 800 km pass; Paper ice-ocean 35 km / 1600 km pass; Operating 25 km / 1600 km pass) against Along-track position (km) and Delay (us). Y-values range from 234.579 to 9500.556 us. | None. |
| 40 | PASS | v30 | Advanced sensitivity | Subsurface Truth Model: Icy Layers | v30-17-subsurface-truth-model-icy-layers | docs/model.js + docs/data/v30-results.js | window.V30_LIVE_MODEL.compute(defaults, window.V30_RESULTS).charts | Along-track position in kilometers. | Elevation relative to the model reference in meters. | Icy top surface; Shallow ice layer; Warm/briny lens; Ice-ocean boundary | km, m | Layer elevations are produced by subtracting modeled layer depths from local surface elevation. | The model deliberately includes competing internal reflectors before the deepest boundary. | It renders 4 series (Icy top surface; Shallow ice layer; Warm/briny lens; Ice-ocean boundary) against Along-track position (km) and Elevation relative to model reference (m). Y-values range from -15618.159 to 568.644 m. | None. |
| 41 | PASS | v30 | Advanced sensitivity | Scenario Comparison: Thin / Medium / Thick Ice | v30-18-scenario-comparison-thin-medium-thick-ice | docs/model.js + docs/data/v30-results.js | window.V30_LIVE_MODEL.compute(defaults, window.V30_RESULTS).charts | Along-track position in kilometers. | Depth below local surface in meters. | Thin shell; Medium shell; Thick shell | km, m | Boundary depth profile is offset/scaled by shell-thickness scenario multipliers. | Shell-thickness assumptions strongly affect the modeled boundary depth. | It renders 3 series (Thin shell; Medium shell; Thick shell) against Along-track position (km) and Depth (m). Y-values range from 7996.089 to 28115.726 m. | None. |
| 42 | PASS | v30 | Advanced sensitivity | Boundary Uncertainty Band | v30-19-boundary-uncertainty-band | docs/model.js + docs/data/v30-results.js | window.V30_LIVE_MODEL.compute(defaults, window.V30_RESULTS).charts | Along-track position in kilometers. | Depth below local surface in meters. | Lower bound; Mean boundary; Upper bound | km, m | Lower and upper bounds are the mean boundary depth plus/minus the uncertainty term. | The boundary should be read as a band, not a single exact line. | It renders 3 series (Lower bound; Mean boundary; Upper bound) against Along-track position (km) and Depth (m). Y-values range from 13038.343 to 17566.129 m. | None. |
| 43 | PASS | v30 | Advanced sensitivity | Ocean Model vs No-Ocean Control | v30-20-ocean-model-vs-no-ocean-control | docs/model.js + docs/data/v30-results.js | window.V30_LIVE_MODEL.compute(defaults, window.V30_RESULTS).charts | Along-track position in kilometers. | Relative power or threshold margin in dB. | Ocean model margin; No-ocean control margin; 0 dB threshold | km, dB | Margin equals signal strength minus detection threshold in dB. | The ocean-model echo is meaningful only if it separates from the no-ocean control. | It renders 3 series (Ocean model margin; No-ocean control margin; 0 dB threshold) against Along-track position (km) and Relative power / margin (dB). Y-values range from -16.499 to 11.938 dB. | None. |
| 44 | PASS | v30 | Advanced sensitivity | Radargram-Style Return Timing With Clutter | v30-21-radargram-style-return-timing-with-clutter | docs/model.js + docs/data/v30-results.js | window.V30_LIVE_MODEL.compute(defaults, window.V30_RESULTS).charts | Along-track position in kilometers. | Two-way delay in microseconds. | Surface clutter upper; Shallow ice return; Warm/briny lens return; Ocean boundary return | km, us | Layer depth is converted to two-way in-ice travel time using the ice propagation speed. | Earlier internal echoes can compete with the boundary echo. | It renders 4 series (Surface clutter upper; Shallow ice return; Warm/briny lens return; Ocean boundary return) against Along-track position (km) and Delay (us). Y-values range from 10.502 to 192.253 us. | None. |
| 45 | PASS | v30 | Advanced sensitivity | Detectability Margin vs Threshold | v30-22-detectability-margin-vs-threshold | docs/model.js + docs/data/v30-results.js | window.V30_LIVE_MODEL.compute(defaults, window.V30_RESULTS).charts | Along-track position in kilometers. | Relative power or threshold margin in dB. | Lens echo margin; Ocean echo margin; 0 dB threshold | km, dB | Margin equals echo signal minus detection threshold in dB. | If the lens margin rivals the boundary margin, strongest-return interpretation is ambiguous. | It renders 3 series (Lens echo margin; Ocean echo margin; 0 dB threshold) against Along-track position (km) and Relative power / margin (dB). Y-values range from 0 to 21.491 dB. | None. |
| 46 | PASS | v30 | Advanced sensitivity | Reflection Strength by Material / Interface | v30-23-reflection-strength-by-material-interface | docs/model.js + docs/data/v30-results.js | window.V30_LIVE_MODEL.compute(defaults, window.V30_RESULTS).charts | Categorical material or interface name. | Relative reflector strength in dB. | Material/interface strength | dB, category | Each category is assigned a relative dB reflector-strength value, adjusted by impurity and signal settings in v30. | Internal contrasts can be strong enough to compete with a boundary return in the simplified model. | It renders 1 series (Material/interface strength) against Material / interface and Relative reflector strength (dB). Y-values range from -18.88 to -7.76 dB. | None. |
| 47 | PASS | v30 | Advanced sensitivity | Cross-Instrument Evidence Score | v30-24-cross-instrument-evidence-score | docs/model.js + docs/data/v30-results.js | window.V30_LIVE_MODEL.compute(defaults, window.V30_RESULTS).charts | Categorical instrument or evidence channel. | Support score in percent. | Evidence support score | %, category | Each channel receives a bounded 0-100 support score from the browser scoring model. | Radar should be read alongside other context, but these scores are illustrative. | It renders 1 series (Evidence support score) against Instrument and Support (%). Y-values range from 45.05 to 63.4 %. | None. |
| 48 | PASS | v30 | Advanced sensitivity | Doppler-Inverted Look Angle vs Existing Geometry | v30-25-doppler-inverted-look-angle-vs-existing-geometry | docs/model.js + docs/data/v30-results.js | window.V30_LIVE_MODEL.compute(defaults, window.V30_RESULTS).charts | Along-track position in kilometers. | Look angle in degrees. | Doppler angle from VHF shift; Angle used after residual; Existing model geometry angle | km, deg | Look angle is inverted from Doppler using the same speed/frequency convention, then compared with geometry. | Doppler can help estimate look angle, but this is a controlled model demonstration. | It renders 3 series (Doppler angle from VHF shift; Angle used after residual; Existing model geometry angle) against Along-track position (km) and Look angle (deg). Y-values range from 0.077 to 18.471 deg. | None. |
| 49 | PASS | v30 | Advanced sensitivity | Raw Slant Depth vs Doppler-Corrected Ocean Depth | v30-26-raw-slant-depth-vs-doppler-corrected-ocean-depth | docs/model.js + docs/data/v30-results.js | window.V30_LIVE_MODEL.compute(defaults, window.V30_RESULTS).charts | Along-track position in kilometers. | Depth below local surface in meters. | True simulated ocean depth; Raw slant depth from echo delay; Doppler-corrected depth estimate | km, m | Corrected depth applies the angle correction to the raw slant-depth estimate. | Geometry correction can reduce slant-path depth bias in the synthetic model. | It renders 3 series (True simulated ocean depth; Raw slant depth from echo delay; Doppler-corrected depth estimate) against Along-track position (km) and Depth below local surface (m). Y-values range from 14525.531 to 16083.837 m. | None. |
| 50 | PASS | v30 | Advanced sensitivity | Depth Error Before and After Angle Correction | v30-27-depth-error-before-and-after-angle-correction | docs/model.js + docs/data/v30-results.js | window.V30_LIVE_MODEL.compute(defaults, window.V30_RESULTS).charts | Along-track position in kilometers. | Depth error in meters. | Uncorrected slant-depth error; Corrected depth residual | km, m | Each error equals estimated depth minus true boundary depth. | The correction reduces geometry-driven bias but does not validate real data. | It renders 2 series (Uncorrected slant-depth error; Corrected depth residual) against Along-track position (km) and Depth error (m). Y-values range from -12.812 to 780.345 m. | None. |
| 51 | PASS | v30 | Advanced sensitivity | Corrected Layer Depths From Doppler Angle | v30-28-corrected-layer-depths-from-doppler-angle | docs/model.js + docs/data/v30-results.js | window.V30_LIVE_MODEL.compute(defaults, window.V30_RESULTS).charts | Along-track position in kilometers. | Depth below local surface in meters. | Corrected upper-layer depth; Corrected briny lens depth; Corrected ocean boundary depth | km, m | Layer slant estimates are corrected back to depth below local surface. | The correction preserves relative layer structure while reducing geometry bias. | It renders 3 series (Corrected upper-layer depth; Corrected briny lens depth; Corrected ocean boundary depth) against Along-track position (km) and Depth below local surface (m). Y-values range from 945.591 to 16064.362 m. | None. |

## Chart Contracts

### Apparent Depth: Spacecraft Motion Distortion by Run

- Status by rendered instance: v19 PASS, v30 PASS
- Research question: How much apparent depth can the motion geometry create for different flyby runs?
- Input data: Along-track position, spacecraft altitude, off-nadir distance, and generated terrain state.
- Formula: Slant-path excess is converted to apparent depth using the radar two-way travel-time geometry.
- Axis meaning: x = Along-track position in kilometers.; y = Apparent depth in meters caused by geometry, not a true reflector depth.
- Expected behavior: Values should be non-negative and vary with altitude/off-nadir geometry.
- Interpretation: Motion geometry can create depth-like structure that must not be mistaken for ice structure.
- What would make it misleading: Misleading if described as measured ocean depth or if negative depths appear.
- Audit result: No issues after fixes.

### Boundary Uncertainty Band

- Status by rendered instance: v19 PASS, v30 PASS
- Research question: How wide is the possible range around the modeled boundary depth?
- Input data: Mean boundary depth and the user-set boundary uncertainty.
- Formula: Lower and upper bounds are the mean boundary depth plus/minus the uncertainty term.
- Axis meaning: x = Along-track position in kilometers.; y = Depth below local surface in meters.
- Expected behavior: Lower <= mean <= upper at each sample and all depths should be non-negative.
- Interpretation: The boundary should be read as a band, not a single exact line.
- What would make it misleading: Misleading if the band is explained as confidence from real observations.
- Audit result: No issues after fixes.

### Coherent Fresnel-zone gain

- Status by rendered instance: v30 PASS
- Research question: How does along-track spacing and ice index affect the simplified coherent-gain proxy?
- Input data: Along-track spacing, ice index, and extracted source chart sample positions.
- Formula: Coherent adjustment is a power-ratio proxy using spacing ratio and ice-index ratio in dB.
- Axis meaning: x = Along-track position in kilometers.; y = Relative coherent gain in dB.
- Expected behavior: Values should stay finite and shift with spacing/index settings.
- Interpretation: This is an aperture/coherence sensitivity proxy, not a full aperture-synthesis model.
- What would make it misleading: Misleading if described as measured coherent processing gain.
- Audit result: No issues after fixes.

### Competing Echo Margins: Receiver Signal Strength

- Status by rendered instance: v19 PASS
- Research question: Does the false internal layer beat the boundary echo at the receiver?
- Input data: Surface clutter, false-layer, and ocean-boundary margins from the simplified receiver model.
- Formula: Each margin equals candidate signal minus detection threshold in dB.
- Axis meaning: x = Along-track position in kilometers.; y = Margin above threshold in dB.
- Expected behavior: The 0 dB threshold should be present; the false/ocean ordering should match the receiver decision logic.
- Interpretation: A strong false layer can make a bright return ambiguous.
- What would make it misleading: Misleading if false-layer and ocean margins are swapped or the sign convention is reversed.
- Audit result: No issues after fixes.

### Corrected Layer Depths From Doppler Angle

- Status by rendered instance: v19 PASS, v30 PASS
- Research question: What layer depths result after applying the Doppler angle correction?
- Input data: Layer depths and inverted/corrected look-angle geometry.
- Formula: Layer slant estimates are corrected back to depth below local surface.
- Axis meaning: x = Along-track position in kilometers.; y = Depth below local surface in meters.
- Expected behavior: All corrected depths should be non-negative and maintain the expected layer order.
- Interpretation: The correction preserves relative layer structure while reducing geometry bias.
- What would make it misleading: Misleading if corrected layers are out of order or are described as measured Europa depths.
- Audit result: No issues after fixes.

### Cross-Instrument Evidence Score

- Status by rendered instance: v19 PASS, v30 PASS
- Research question: How much modeled support comes from radar and contextual evidence channels?
- Input data: Synthetic support scores for radar, thermal, composition, and magnetic/plasma context.
- Formula: Each channel receives a bounded 0-100 support score from the browser scoring model.
- Axis meaning: x = Categorical instrument or evidence channel.; y = Support score in percent.
- Expected behavior: The chart should be a categorical bar chart with values from 0 to 100.
- Interpretation: Radar should be read alongside other context, but these scores are illustrative.
- What would make it misleading: Misleading if presented as NASA-validated evidence or real observation probability.
- Audit result: No issues after fixes.

### Custom Pass Two-Way Extra Delay: Flat vs Generated Topography

- Status by rendered instance: v19 PASS
- Research question: How does generated topography change the custom pass timing delay compared with a flat surface?
- Input data: Custom flat and generated-topography path lengths.
- Formula: Two-way delay equals 2 times extra path length divided by c, converted to microseconds.
- Axis meaning: x = Along-track position in kilometers.; y = Two-way extra delay in microseconds.
- Expected behavior: Both series should be non-negative; terrain should perturb the flat baseline.
- Interpretation: Topography can change timing enough to matter for depth interpretation.
- What would make it misleading: Misleading if the topography series is just a relabeled duplicate of the flat series.
- Audit result: No issues after fixes.

### Depth Error Before and After Angle Correction

- Status by rendered instance: v19 PASS, v30 PASS
- Research question: How much does the angle correction reduce depth error?
- Input data: Raw slant-depth error and corrected-depth error relative to the true boundary.
- Formula: Each error equals estimated depth minus true boundary depth.
- Axis meaning: x = Along-track position in kilometers.; y = Depth error in meters.
- Expected behavior: Corrected mean absolute error should be lower than raw mean absolute error in this controlled demo.
- Interpretation: The correction reduces geometry-driven bias but does not validate real data.
- What would make it misleading: Misleading if the plotted corrected error is not actually smaller.
- Audit result: No issues after fixes.

### Depth Error If the Receiver Picks the Wrong Layer

- Status by rendered instance: v19 PASS
- Research question: How wrong is the depth if the receiver picks the false layer instead of the boundary?
- Input data: Selected receiver depth and true modeled boundary depth.
- Formula: Depth error equals selected depth minus true boundary depth.
- Axis meaning: x = Along-track position in kilometers.; y = Depth error in meters.
- Expected behavior: A false-layer pick should produce a negative error because it is too shallow; 0 m means the boundary was picked correctly.
- Interpretation: Wrong picks can substantially underestimate boundary depth.
- What would make it misleading: Misleading if the sign is reversed or if negative error is described as too deep.
- Audit result: No issues after fixes.

### Detectability Margin vs Threshold

- Status by rendered instance: v19 PASS, v30 PASS
- Research question: Do the lens and boundary echoes clear the simplified detection threshold?
- Input data: Lens signal, ocean signal, and detection threshold from the live model.
- Formula: Margin equals echo signal minus detection threshold in dB.
- Axis meaning: x = Along-track position in kilometers.; y = Relative power or threshold margin in dB.
- Expected behavior: The 0 dB threshold line should be present; positive means above threshold.
- Interpretation: If the lens margin rivals the boundary margin, strongest-return interpretation is ambiguous.
- What would make it misleading: Misleading if positive/negative margin meaning is reversed or if lens and ocean labels are swapped.
- Audit result: No issues after fixes.

### Doppler-Inverted Look Angle vs Existing Geometry

- Status by rendered instance: v19 PASS, v30 PASS
- Research question: Does the Doppler-inverted look angle match the known geometry angle?
- Input data: Doppler shift, spacecraft speed, radar frequency, and existing geometry angle.
- Formula: Look angle is inverted from Doppler using the same speed/frequency convention, then compared with geometry.
- Axis meaning: x = Along-track position in kilometers.; y = Look angle in degrees.
- Expected behavior: Angles should stay finite and within plausible angular bounds.
- Interpretation: Doppler can help estimate look angle, but this is a controlled model demonstration.
- What would make it misleading: Misleading if Doppler inversion uses a different frequency or angle convention from the plotted geometry.
- Audit result: No issues after fixes.

### Doppler: Flat Geometry vs Topography

- Status by rendered instance: v19 PASS, v30 PASS
- Research question: How does generated topography change Doppler shift relative to flat geometry?
- Input data: Spacecraft speed, geometry angle, radar frequency, and generated terrain slope.
- Formula: Doppler shift is computed from radial velocity sensitivity for flat and topographic cases.
- Axis meaning: x = Along-track position in kilometers.; y = Doppler shift in hertz.
- Expected behavior: Topography can perturb the flat-geometry curve but values should stay finite in Hz.
- Interpretation: Doppler is another geometry-sensitive observable, not direct evidence of an ocean.
- What would make it misleading: Misleading if topographic and flat series are swapped or if Hz is omitted.
- Audit result: No issues after fixes.

### Geometric spreading power dB

- Status by rendered instance: v30 PASS
- Research question: How does geometric spreading affect received power along track?
- Input data: Range/altitude geometry from the browser model.
- Formula: Power scales as a two-way geometric ratio, reported as 10log10((R0/R)^4) with reflectivity offsets.
- Axis meaning: x = Along-track position in kilometers.; y = Relative power in dB.
- Expected behavior: Values should be finite dB powers and respond to altitude/range changes.
- Interpretation: Geometry affects power before material interpretation.
- What would make it misleading: Misleading if the power ratio is plotted as linear power or if amplitude and power log conventions are mixed.
- Audit result: No issues after fixes.

### HF 9 MHz Mid-Shell Confidence vs Ambiguity

- Status by rendered instance: v30 PASS
- Research question: How does the advanced scenario score compare confidence against ambiguity risk?
- Input data: Scenario labels, dirty-ice level, clutter level, attenuation, pulse gain, and threshold settings.
- Formula: Scenario stress is converted into a bounded 0-100 confidence score and ambiguous/false percentage.
- Axis meaning: x = Categorical ice/clutter scenario.; y = Percent or 0-100 score.
- Expected behavior: Both series should be bounded from 0 to 100 and drawn as bars.
- Interpretation: The chart is a synthetic scoring aid for ambiguity risk, not a calibrated probability.
- What would make it misleading: Misleading if called a NASA confidence estimate or if 0-1 shares are plotted on a 0-100 axis.
- Audit result: No issues after fixes.

### HF 9 MHz Workbook-Depth Outcomes

- Status by rendered instance: v30 PASS
- Research question: How do deep-boundary outcome shares change across HF scenario categories?
- Input data: Scenario stress, dirty ice, clutter, signal setting, and attenuation setting.
- Formula: Clear, false-risk, and weak/no-deep shares are bounded and converted to percent.
- Axis meaning: x = Categorical scenario.; y = Percent share from 0 to 100.
- Expected behavior: For each scenario, the shares should sum to about 100 percent.
- Interpretation: The chart compares outcome shares under synthetic HF scenario stress.
- What would make it misleading: Misleading if 0-1 shares are shown on a percent axis or if shares do not sum to 100.
- Audit result: No issues after fixes.

### Nadir Radar Delay by Flyby: With Generated Topography

- Status by rendered instance: v30 PASS
- Research question: How does generated terrain perturb nadir timing across flyby scenarios?
- Input data: Nadir path geometry plus generated topography.
- Formula: Round-trip path delay is recomputed after terrain height changes the reference surface.
- Axis meaning: x = Along-track position in kilometers.; y = Delay in microseconds.
- Expected behavior: The terrain-on series can vary more locally than the flat reference and should stay non-negative.
- Interpretation: Nadir timing still needs terrain correction before subsurface interpretation.
- What would make it misleading: Misleading if terrain-on values are described as true boundary depth.
- Audit result: No issues after fixes.

### Nadir Radar Delay by Flyby: Without Topography

- Status by rendered instance: v30 PASS
- Research question: What timing delay appears in nadir geometry before generated terrain is added?
- Input data: Nadir path geometry from advanced flyby scenarios.
- Formula: Round-trip path delay is computed from nadir geometry and converted to microseconds.
- Axis meaning: x = Along-track position in kilometers.; y = Delay in microseconds.
- Expected behavior: Delays should be non-negative and comparatively smooth without generated terrain.
- Interpretation: This is a reference timing baseline for flyby comparisons.
- What would make it misleading: Misleading if read as off-nadir delay or as a measured subsurface reflector.
- Audit result: No issues after fixes.

### Ocean Model vs No-Ocean Control

- Status by rendered instance: v19 PASS, v30 PASS
- Research question: Does the modeled boundary echo clear the threshold more strongly than a no-ocean control?
- Input data: Ocean margin, no-ocean control margin, and detection threshold from the live receiver model.
- Formula: Margin equals signal strength minus detection threshold in dB.
- Axis meaning: x = Along-track position in kilometers.; y = Relative power or threshold margin in dB.
- Expected behavior: The 0 dB threshold line should be present; positive margin is above threshold and negative is below.
- Interpretation: The ocean-model echo is meaningful only if it separates from the no-ocean control.
- What would make it misleading: Misleading if the margin sign is reversed or the threshold line is absent.
- Audit result: No issues after fixes.

### Off-Nadir Radar Delay by Flyby: With Generated Topography

- Status by rendered instance: v30 PASS
- Research question: How does generated terrain modify off-nadir timing across flyby scenarios?
- Input data: Off-nadir path geometry plus generated topography.
- Formula: Two-way slant-path delay is recomputed with local target terrain height.
- Axis meaning: x = Along-track position in kilometers.; y = Delay in microseconds.
- Expected behavior: Values should remain non-negative and vary with both slant geometry and terrain.
- Interpretation: Off-nadir timing must be separated from real in-ice delay.
- What would make it misleading: Misleading if treated as independent evidence for an ocean boundary.
- Audit result: No issues after fixes.

### Off-Nadir Radar Delay by Flyby: Without Topography

- Status by rendered instance: v30 PASS
- Research question: What timing delay does side-looking geometry add before terrain is included?
- Input data: Off-nadir path geometry for advanced flyby scenarios.
- Formula: Two-way delay is computed from the off-nadir slant path and converted to microseconds.
- Axis meaning: x = Along-track position in kilometers.; y = Delay in microseconds.
- Expected behavior: Off-nadir delays should be non-negative and generally larger where slant range is longer.
- Interpretation: Side-looking geometry can mimic depth unless corrected.
- What would make it misleading: Misleading if shown as a subsurface echo or if the flat/topography distinction is lost.
- Audit result: No issues after fixes.

### Picked Boundary Depth vs True Ocean Depth

- Status by rendered instance: v19 PASS
- Research question: Does the receiver-selected boundary follow the true modeled boundary or a false layer?
- Input data: True boundary depth, false-layer depth, and selected receiver depth.
- Formula: Receiver selected depth is chosen by the simplified receiver decision from candidate echo margins; ambiguous double returns use the midpoint between false layer and boundary.
- Axis meaning: x = Along-track position in kilometers.; y = Depth below local surface in meters.
- Expected behavior: False-layer depth should be shallower than true boundary depth; selected depth should be either a candidate depth or the midpoint used for ambiguous double returns.
- Interpretation: A receiver can pick a shallower false layer when it is the stronger candidate.
- What would make it misleading: Misleading if selected depth is not tied to the receiver decision model or if ambiguous midpoint picks are described as a confident ocean selection.
- Audit result: No issues after fixes.

### Pulse compression gain vs pulse length

- Status by rendered instance: v30 PASS
- Research question: How does pulse length affect the simplified pulse-compression gain proxy?
- Input data: Pulse length and window-loss settings.
- Formula: Gain equals 10log10(pulse length in us) plus window loss, with a VHF offset used for sensitivity comparison.
- Axis meaning: x = Pulse length in microseconds.; y = Relative gain in dB.
- Expected behavior: Gain should increase monotonically with pulse length for the proxy curves.
- Interpretation: Longer pulse length raises the simplified sensitivity proxy.
- What would make it misleading: Misleading if treated as a full waveform processor or if selected setting is not tied to the control value.
- Audit result: No issues after fixes.

### Radargram-Style Return Timing With Clutter

- Status by rendered instance: v19 PASS, v30 PASS
- Research question: When do clutter, shallow layers, lens echoes, and the boundary return in time?
- Input data: Modeled layer depths and receiver timing conversions.
- Formula: Layer depth is converted to two-way in-ice travel time using the ice propagation speed.
- Axis meaning: x = Along-track position in kilometers.; y = Two-way delay in microseconds.
- Expected behavior: Shallower clutter/layers should return earlier than deeper layers, with finite non-negative delays.
- Interpretation: Earlier internal echoes can compete with the boundary echo.
- What would make it misleading: Misleading if a return line is presented as uniquely ocean-like from timing alone.
- Audit result: No issues after fixes.

### Raw Slant Depth vs Doppler-Corrected Ocean Depth

- Status by rendered instance: v19 PASS, v30 PASS
- Research question: Does Doppler angle correction move raw slant depth closer to true boundary depth?
- Input data: Raw slant depth, corrected depth, true boundary depth, and inverted look angle.
- Formula: Corrected depth applies the angle correction to the raw slant-depth estimate.
- Axis meaning: x = Along-track position in kilometers.; y = Depth below local surface in meters.
- Expected behavior: Corrected depth should have lower mean absolute error than raw slant depth in this controlled demo.
- Interpretation: Geometry correction can reduce slant-path depth bias in the synthetic model.
- What would make it misleading: Misleading if it claims correction helped when corrected error is not lower.
- Audit result: No issues after fixes.

### Receiver Outcome Share for This Flyby

- Status by rendered instance: v19 PASS
- Research question: What share of samples fall into each receiver outcome category?
- Input data: Counts of receiver decision categories along the current flyby.
- Formula: Each category count is divided by total samples and converted to percent.
- Axis meaning: x = Categorical receiver outcome.; y = Percent of along-track samples.
- Expected behavior: Bars should be between 0 and 100 and sum to about 100 percent.
- Interpretation: This summarizes the receiver ambiguity pattern for the selected flyby.
- What would make it misleading: Misleading if shares do not sum to 100 percent or if outcome labels are mismatched.
- Audit result: No issues after fixes.

### Reflection Strength by Material / Interface

- Status by rendered instance: v19 PASS, v30 PASS
- Research question: Which synthetic material/interface assumptions produce stronger modeled reflections?
- Input data: Material/interface reflector-strength assumptions from the live model.
- Formula: Each category is assigned a relative dB reflector-strength value, adjusted by impurity and signal settings in v30.
- Axis meaning: x = Categorical material or interface name.; y = Relative reflector strength in dB.
- Expected behavior: The chart should be a bar chart with categorical x-values and no detection-threshold claim.
- Interpretation: Internal contrasts can be strong enough to compete with a boundary return in the simplified model.
- What would make it misleading: Misleading if labeled as a threshold margin or drawn as a continuous along-track trend.
- Audit result: No issues after fixes.

### Return Timing: False Layer Arrives Before Ocean

- Status by rendered instance: v19 PASS
- Research question: Does the false internal layer arrive before the boundary echo?
- Input data: False-layer and boundary depths converted to two-way in-ice delay.
- Formula: Two-way delay equals 2 times depth divided by ice propagation speed, converted to microseconds.
- Axis meaning: x = Along-track position in kilometers.; y = Two-way in-ice delay in microseconds.
- Expected behavior: The false-layer delay should be lower than the boundary delay when the false layer is shallower.
- Interpretation: Arrival order can help show why false internal layers are plausible competitors.
- What would make it misleading: Misleading if the false-layer delay is not earlier than the boundary delay.
- Audit result: No issues after fixes.

### Satellite Receiver Decision Along Track

- Status by rendered instance: v19 PASS
- Research question: Which simplified receiver decision is made at each along-track sample?
- Input data: Candidate margins and receiver decision categories.
- Formula: Decision code maps the strongest/valid candidate into documented categories 0, 1, 2, or 3.
- Axis meaning: x = Along-track position in kilometers.; y = Receiver decision code.
- Expected behavior: All codes must be integers from 0 to 3.
- Interpretation: The code sequence shows where the receiver would trust ocean, pick false, see clutter, or fail detection.
- What would make it misleading: Misleading if undocumented codes appear or code meanings are not explained nearby.
- Audit result: No issues after fixes.

### Scenario Comparison: Thin / Medium / Thick Ice

- Status by rendered instance: v19 PASS, v30 PASS
- Research question: How sensitive is the possible boundary depth to assumed ice-shell thickness?
- Input data: Live boundary-depth profile scaled to thin, medium, and thick shell assumptions.
- Formula: Boundary depth profile is offset/scaled by shell-thickness scenario multipliers.
- Axis meaning: x = Along-track position in kilometers.; y = Depth below local surface in meters.
- Expected behavior: All depths should be non-negative; thicker-shell scenarios should be deeper.
- Interpretation: Shell-thickness assumptions strongly affect the modeled boundary depth.
- What would make it misleading: Misleading if the three scenarios are presented as observed depths.
- Audit result: No issues after fixes.

### Scenario Two-Way Extra Delay: Flat Surface

- Status by rendered instance: v19 PASS
- Research question: How much extra two-way radar delay does each flat-surface flyby geometry add?
- Input data: Flat-surface path geometry for multiple scenario runs.
- Formula: Two-way extra delay is 2 times extra path length divided by the speed of light, converted to microseconds.
- Axis meaning: x = Along-track position in kilometers.; y = Two-way extra delay in microseconds.
- Expected behavior: Delays should be non-negative and should increase with longer extra path length.
- Interpretation: The delay is a geometry timing cost, not a measured subsurface delay.
- What would make it misleading: Misleading if the factor of 2 is missing or if units are treated as one-way delay.
- Audit result: No issues after fixes.

### Subsurface Truth Model: Icy Layers

- Status by rendered instance: v19 PASS, v30 PASS
- Research question: Where are the synthetic surface, shallow layer, briny lens, and possible boundary placed?
- Input data: Generated surface and layer-elevation rows from the live subsurface model.
- Formula: Layer elevations are produced by subtracting modeled layer depths from local surface elevation.
- Axis meaning: x = Along-track position in kilometers.; y = Elevation relative to the model reference in meters.
- Expected behavior: Surface should sit highest; deeper layers should have lower elevations.
- Interpretation: The model deliberately includes competing internal reflectors before the deepest boundary.
- What would make it misleading: Misleading if the y-axis mixes elevation with raw depth or implies measured Europa structure.
- Audit result: No issues after fixes.

### Surface Height: Off-Nadir Target vs Nadir Reference Terrain

- Status by rendered instance: v19 PASS, v30 PASS
- Research question: How different is the side-looking target terrain from the nadir terrain reference along the same pass?
- Input data: Generated target and nadir topography rows from the browser model.
- Formula: topography(x, y, params) is sampled for the target and nadir reference paths.
- Axis meaning: x = Along-track position in kilometers.; y = Surface elevation in meters relative to the model reference.
- Expected behavior: The two terrain lines may diverge where off-nadir geometry samples a different surface location, but both should stay finite surface heights.
- Interpretation: Terrain is a moving reference surface that must be separated from subsurface timing.
- What would make it misleading: Misleading if labeled as depth, if either path uses stale data, or if the two terrain series are swapped.
- Audit result: No issues after fixes.

### Terrain Baseline: Surface-Height Equivalent Error

- Status by rendered instance: v19 PASS
- Research question: How large is the terrain-driven error before interpreting a subsurface return?
- Input data: Generated terrain differences between target and reference paths.
- Formula: Surface-height equivalent error is the target/reference terrain mismatch converted to meters.
- Axis meaning: x = Along-track position in kilometers.; y = Surface-height equivalent error in meters.
- Expected behavior: The series may cross zero because terrain can make the target higher or lower than the reference.
- Interpretation: Terrain mismatch is a baseline error source that can bias a depth interpretation.
- What would make it misleading: Misleading if the y-axis is generic or if the sign is described as depth below the surface.
- Audit result: No issues after fixes.

### Terrain Baseline: Total Radar Elevation Error

- Status by rendered instance: v30 PASS
- Research question: How large is the total terrain/elevation error term in the advanced v30 view?
- Input data: Advanced chart data adapted from the live browser model.
- Formula: The browser model computes surface-height equivalent error from geometry plus generated terrain.
- Axis meaning: x = Along-track position in kilometers.; y = Surface-height equivalent error in meters.
- Expected behavior: The series may be positive or negative but must stay finite and have meter units.
- Interpretation: This is the terrain/elevation contribution to radar timing error, not an ocean-depth estimate.
- What would make it misleading: Misleading if labeled only as value or if explained as a subsurface layer.
- Audit result: No issues after fixes.

### Total VHF dB: constant vs frequency-dependent response

- Status by rendered instance: v30 PASS
- Research question: How does a frequency-dependent reflectivity response change total VHF power?
- Input data: Geometric power, coherent gain, pulse gain, attenuation, and frequency-response settings.
- Formula: Total VHF dB sums geometric power, coherent gain, pulse gain, attenuation penalty, and optional frequency response.
- Axis meaning: x = Along-track position in kilometers.; y = Relative total VHF power in dB.
- Expected behavior: Both series should be finite; the frequency-dependent series should differ by the modeled response term.
- Interpretation: Frequency response is a sensitivity comparison, not an observation.
- What would make it misleading: Misleading if a single curve is presented as a validated VHF processor output.
- Audit result: No issues after fixes.

### VHF 60 MHz Shallow Clutter Stress Test

- Status by rendered instance: v30 PASS
- Research question: How does shallow clutter stress split outcomes across VHF scenario categories?
- Input data: Scenario stress, dirty ice level, surface clutter level, attenuation, and signal setting.
- Formula: Surface clutter, internal feature, outside-window, and weak/no-detection shares are bounded and converted to percent.
- Axis meaning: x = Categorical scenario.; y = Percent share from 0 to 100.
- Expected behavior: For each scenario, the shares should sum to about 100 percent.
- Interpretation: The chart shows where shallow clutter or internal features dominate a simplified VHF scenario.
- What would make it misleading: Misleading if the bars are interpreted as real detection probabilities.
- Audit result: No issues after fixes.

## Validation Checks Implemented

- Every rendered chart must have title, id, section, source sheet, x-label, y-label, legend names, and non-empty data.
- All x/y points must be finite except categorical x-label strings; no NaN, Infinity, or null y-values are allowed.
- Categorical charts must render as bars and must use categorical x-axis labels.
- Numeric axes must expose units or a documented code label.
- Percent and 0-100 score charts must stay within 0-100.
- Outcome-share charts must sum to about 100 percent by category or by single-series outcome total.
- Delay charts must use microseconds and may not contain negative delays.
- Depth charts may not contain negative depths unless the chart is explicitly a depth-error chart.
- Margin charts must include a visible 0 dB threshold where the interpretation depends on threshold crossing.
- False-layer timing must arrive before the ocean timing when the false layer is shallower.
- Receiver decision codes must be documented integers from 0 to 3.
- Doppler-corrected depth/error charts must actually improve mean absolute error over raw slant depth in the controlled demo.
- Known previous label mistakes are checked directly: icy-layer elevation label, material/interface strength label, categorical x-axis labels, and v30 terrain-error units.

