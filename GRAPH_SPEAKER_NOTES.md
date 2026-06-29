# Graph Speaker Notes

Generated: 2026-06-29

Use these notes with one caveat up front: this project is an illustrative synthetic radar sensitivity model, not a mission-validated NASA processor and not proof of Europa structure.

## 1. V19 - Surface Height: Off-Nadir Target vs Nadir Reference Terrain

- Status: PASS (passed deterministic audit checks).
- What it is showing: Terrain is a moving reference surface that must be separated from subsurface timing.
- How to read the x-axis: Along-track position in kilometers.
- How to read the y-axis: Surface elevation in meters relative to the model reference.
- What each line/bar means: Off-nadir target terrain; Nadir terrain.
- Main takeaway: The two terrain lines may diverge where off-nadir geometry samples a different surface location, but both should stay finite surface heights.
- How to explain it out loud: How different is the side-looking target terrain from the nadir terrain reference along the same pass? It renders 2 series (Off-nadir target terrain; Nadir terrain) against Along-track position (km) and Surface elevation (m). Y-values range from -156.935 to 568.644 m.
- Why it matters: Terrain is a moving reference surface that must be separated from subsurface timing.
- What not to overclaim: Misleading if labeled as depth, if either path uses stale data, or if the two terrain series are swapped. Also do not say the graph proves anything about Europa.

## 2. V19 - Apparent Depth: Spacecraft Motion Distortion by Run

- Status: PASS (passed deterministic audit checks).
- What it is showing: Motion geometry can create depth-like structure that must not be mistaken for ice structure.
- How to read the x-axis: Along-track position in kilometers.
- How to read the y-axis: Apparent depth in meters caused by geometry, not a true reflector depth.
- What each line/bar means: Custom 400 km / 120 km pass; Paper low-altitude 35 km / 800 km pass; Paper ice-ocean 35 km / 1600 km pass; Operating 25 km / 1600 km pass.
- Main takeaway: Values should be non-negative and vary with altitude/off-nadir geometry.
- How to explain it out loud: How much apparent depth can the motion geometry create for different flyby runs? It renders 4 series (Custom 400 km / 120 km pass; Paper low-altitude 35 km / 800 km pass; Paper ice-ocean 35 km / 1600 km pass; Operating 25 km / 1600 km pass) against Along-track position (km) and Apparent depth (m). Y-values range from 550.7 to 238293.574 m.
- Why it matters: Motion geometry can create depth-like structure that must not be mistaken for ice structure.
- What not to overclaim: Misleading if described as measured ocean depth or if negative depths appear. Also do not say the graph proves anything about Europa.

## 3. V19 - Terrain Baseline: Surface-Height Equivalent Error

- Status: PASS (passed deterministic audit checks).
- What it is showing: Terrain mismatch is a baseline error source that can bias a depth interpretation.
- How to read the x-axis: Along-track position in kilometers.
- How to read the y-axis: Surface-height equivalent error in meters.
- What each line/bar means: Total radar elevation error - custom parabolic.
- Main takeaway: The series may cross zero because terrain can make the target higher or lower than the reference.
- How to explain it out loud: How large is the terrain-driven error before interpreting a subsurface return? It renders 1 series (Total radar elevation error - custom parabolic) against Along-track position (km) and Surface-height equivalent error (m). Y-values range from 79.488 to 539.32 m.
- Why it matters: Terrain mismatch is a baseline error source that can bias a depth interpretation.
- What not to overclaim: Misleading if the y-axis is generic or if the sign is described as depth below the surface. Also do not say the graph proves anything about Europa.

## 4. V19 - Doppler: Flat Geometry vs Topography

- Status: PASS (passed deterministic audit checks).
- What it is showing: Doppler is another geometry-sensitive observable, not direct evidence of an ocean.
- How to read the x-axis: Along-track position in kilometers.
- How to read the y-axis: Doppler shift in hertz.
- What each line/bar means: Flat VHF Doppler (Hz); Topo VHF Doppler (Hz); Flat HF Doppler (Hz); Topo HF Doppler (Hz).
- Main takeaway: Topography can perturb the flat-geometry curve but values should stay finite in Hz.
- How to explain it out loud: How does generated topography change Doppler shift relative to flat geometry? It renders 4 series (Flat VHF Doppler (Hz); Topo VHF Doppler (Hz); Flat HF Doppler (Hz); Topo HF Doppler (Hz)) against Along-track position (km) and Doppler shift (Hz). Y-values range from -576.664 to 561.993 Hz.
- Why it matters: Doppler is another geometry-sensitive observable, not direct evidence of an ocean.
- What not to overclaim: Misleading if topographic and flat series are swapped or if Hz is omitted. Also do not say the graph proves anything about Europa.

## 5. V19 - Scenario Two-Way Extra Delay: Flat Surface

- Status: PASS (passed deterministic audit checks).
- What it is showing: The delay is a geometry timing cost, not a measured subsurface delay.
- How to read the x-axis: Along-track position in kilometers.
- How to read the y-axis: Two-way extra delay in microseconds.
- What each line/bar means: Custom 400 km / 120 km pass; Paper low-altitude 35 km / 800 km pass; Paper ice-ocean 35 km / 1600 km pass; Operating 25 km / 1600 km pass.
- Main takeaway: Delays should be non-negative and should increase with longer extra path length.
- How to explain it out loud: How much extra two-way radar delay does each flat-surface flyby geometry add? It renders 4 series (Custom 400 km / 120 km pass; Paper low-altitude 35 km / 800 km pass; Paper ice-ocean 35 km / 1600 km pass; Operating 25 km / 1600 km pass) against Along-track position (km) and Two-way extra delay (us). Y-values range from 6.539 to 2829.708 us.
- Why it matters: The delay is a geometry timing cost, not a measured subsurface delay.
- What not to overclaim: Misleading if the factor of 2 is missing or if units are treated as one-way delay. Also do not say the graph proves anything about Europa.

## 6. V19 - Custom Pass Two-Way Extra Delay: Flat vs Generated Topography

- Status: PASS (passed deterministic audit checks).
- What it is showing: Topography can change timing enough to matter for depth interpretation.
- How to read the x-axis: Along-track position in kilometers.
- How to read the y-axis: Two-way extra delay in microseconds.
- What each line/bar means: Flat surface pass; Topography-adjusted pass.
- Main takeaway: Both series should be non-negative; terrain should perturb the flat baseline.
- How to explain it out loud: How does generated topography change the custom pass timing delay compared with a flat surface? It renders 2 series (Flat surface pass; Topography-adjusted pass) against Along-track position (km) and Two-way extra delay (us). Y-values range from 3.282 to 43.555 us.
- Why it matters: Topography can change timing enough to matter for depth interpretation.
- What not to overclaim: Misleading if the topography series is just a relabeled duplicate of the flat series. Also do not say the graph proves anything about Europa.

## 7. V19 - Subsurface Truth Model: Icy Layers

- Status: PASS (passed deterministic audit checks).
- What it is showing: The model deliberately includes competing internal reflectors before the deepest boundary.
- How to read the x-axis: Along-track position in kilometers.
- How to read the y-axis: Elevation relative to the model reference in meters.
- What each line/bar means: Icy top surface; Shallow ice layer; Warm/briny lens; Ice-ocean boundary.
- Main takeaway: Surface should sit highest; deeper layers should have lower elevations.
- How to explain it out loud: Where are the synthetic surface, shallow layer, briny lens, and possible boundary placed? It renders 4 series (Icy top surface; Shallow ice layer; Warm/briny lens; Ice-ocean boundary) against Along-track position (km) and Elevation relative to model reference (m). Y-values range from -15618.159 to 568.644 m.
- Why it matters: The model deliberately includes competing internal reflectors before the deepest boundary.
- What not to overclaim: Misleading if the y-axis mixes elevation with raw depth or implies measured Europa structure. Also do not say the graph proves anything about Europa.

## 8. V19 - Scenario Comparison: Thin / Medium / Thick Ice

- Status: PASS (passed deterministic audit checks).
- What it is showing: Shell-thickness assumptions strongly affect the modeled boundary depth.
- How to read the x-axis: Along-track position in kilometers.
- How to read the y-axis: Depth below local surface in meters.
- What each line/bar means: Thin shell; Medium shell; Thick shell.
- Main takeaway: All depths should be non-negative; thicker-shell scenarios should be deeper.
- How to explain it out loud: How sensitive is the possible boundary depth to assumed ice-shell thickness? It renders 3 series (Thin shell; Medium shell; Thick shell) against Along-track position (km) and Depth (m). Y-values range from 7996.089 to 28115.726 m.
- Why it matters: Shell-thickness assumptions strongly affect the modeled boundary depth.
- What not to overclaim: Misleading if the three scenarios are presented as observed depths. Also do not say the graph proves anything about Europa.

## 9. V19 - Boundary Uncertainty Band

- Status: PASS (passed deterministic audit checks).
- What it is showing: The boundary should be read as a band, not a single exact line.
- How to read the x-axis: Along-track position in kilometers.
- How to read the y-axis: Depth below local surface in meters.
- What each line/bar means: Lower bound; Mean boundary; Upper bound.
- Main takeaway: Lower <= mean <= upper at each sample and all depths should be non-negative.
- How to explain it out loud: How wide is the possible range around the modeled boundary depth? It renders 3 series (Lower bound; Mean boundary; Upper bound) against Along-track position (km) and Depth (m). Y-values range from 13038.343 to 17566.129 m.
- Why it matters: The boundary should be read as a band, not a single exact line.
- What not to overclaim: Misleading if the band is explained as confidence from real observations. Also do not say the graph proves anything about Europa.

## 10. V19 - Ocean Model vs No-Ocean Control

- Status: PASS (passed deterministic audit checks).
- What it is showing: The ocean-model echo is meaningful only if it separates from the no-ocean control.
- How to read the x-axis: Along-track position in kilometers.
- How to read the y-axis: Relative power or threshold margin in dB.
- What each line/bar means: Ocean model margin; No-ocean control margin; 0 dB threshold.
- Main takeaway: The 0 dB threshold line should be present; positive margin is above threshold and negative is below.
- How to explain it out loud: Does the modeled boundary echo clear the threshold more strongly than a no-ocean control? It renders 3 series (Ocean model margin; No-ocean control margin; 0 dB threshold) against Along-track position (km) and Relative power / margin (dB). Y-values range from -16.499 to 11.938 dB.
- Why it matters: The ocean-model echo is meaningful only if it separates from the no-ocean control.
- What not to overclaim: Misleading if the margin sign is reversed or the threshold line is absent. Also do not say the graph proves anything about Europa.

## 11. V19 - Radargram-Style Return Timing With Clutter

- Status: PASS (passed deterministic audit checks).
- What it is showing: Earlier internal echoes can compete with the boundary echo.
- How to read the x-axis: Along-track position in kilometers.
- How to read the y-axis: Two-way delay in microseconds.
- What each line/bar means: Surface clutter upper; Shallow ice return; Warm/briny lens return; Ocean boundary return.
- Main takeaway: Shallower clutter/layers should return earlier than deeper layers, with finite non-negative delays.
- How to explain it out loud: When do clutter, shallow layers, lens echoes, and the boundary return in time? It renders 4 series (Surface clutter upper; Shallow ice return; Warm/briny lens return; Ocean boundary return) against Along-track position (km) and Delay (us). Y-values range from 10.502 to 192.253 us.
- Why it matters: Earlier internal echoes can compete with the boundary echo.
- What not to overclaim: Misleading if a return line is presented as uniquely ocean-like from timing alone. Also do not say the graph proves anything about Europa.

## 12. V19 - Detectability Margin vs Threshold

- Status: PASS (passed deterministic audit checks).
- What it is showing: If the lens margin rivals the boundary margin, strongest-return interpretation is ambiguous.
- How to read the x-axis: Along-track position in kilometers.
- How to read the y-axis: Relative power or threshold margin in dB.
- What each line/bar means: Lens echo margin; Ocean echo margin; 0 dB threshold.
- Main takeaway: The 0 dB threshold line should be present; positive means above threshold.
- How to explain it out loud: Do the lens and boundary echoes clear the simplified detection threshold? It renders 3 series (Lens echo margin; Ocean echo margin; 0 dB threshold) against Along-track position (km) and Relative power / margin (dB). Y-values range from 0 to 21.491 dB.
- Why it matters: If the lens margin rivals the boundary margin, strongest-return interpretation is ambiguous.
- What not to overclaim: Misleading if positive/negative margin meaning is reversed or if lens and ocean labels are swapped. Also do not say the graph proves anything about Europa.

## 13. V19 - Reflection Strength by Material / Interface

- Status: PASS (passed deterministic audit checks).
- What it is showing: Internal contrasts can be strong enough to compete with a boundary return in the simplified model.
- How to read the x-axis: Categorical material or interface name.
- How to read the y-axis: Relative reflector strength in dB.
- What each line/bar means: Material/interface strength.
- Main takeaway: The chart should be a bar chart with categorical x-values and no detection-threshold claim.
- How to explain it out loud: Which synthetic material/interface assumptions produce stronger modeled reflections? It renders 1 series (Material/interface strength) against Material / interface and Relative reflector strength (dB). Y-values range from -18 to -2 dB.
- Why it matters: Internal contrasts can be strong enough to compete with a boundary return in the simplified model.
- What not to overclaim: Misleading if labeled as a threshold margin or drawn as a continuous along-track trend. Also do not say the graph proves anything about Europa.

## 14. V19 - Cross-Instrument Evidence Score

- Status: PASS (passed deterministic audit checks).
- What it is showing: Radar should be read alongside other context, but these scores are illustrative.
- How to read the x-axis: Categorical instrument or evidence channel.
- How to read the y-axis: Support score in percent.
- What each line/bar means: Evidence support score.
- Main takeaway: The chart should be a categorical bar chart with values from 0 to 100.
- How to explain it out loud: How much modeled support comes from radar and contextual evidence channels? It renders 1 series (Evidence support score) against Instrument and Support (%). Y-values range from 35 to 55 %.
- Why it matters: Radar should be read alongside other context, but these scores are illustrative.
- What not to overclaim: Misleading if presented as NASA-validated evidence or real observation probability. Also do not say the graph proves anything about Europa.

## 15. V19 - Competing Echo Margins: Receiver Signal Strength

- Status: PASS (passed deterministic audit checks).
- What it is showing: A strong false layer can make a bright return ambiguous.
- How to read the x-axis: Along-track position in kilometers.
- How to read the y-axis: Margin above threshold in dB.
- What each line/bar means: Surface clutter margin; False layer margin; Ocean boundary margin; 0 dB threshold.
- Main takeaway: The 0 dB threshold should be present; the false/ocean ordering should match the receiver decision logic.
- How to explain it out loud: Does the false internal layer beat the boundary echo at the receiver? It renders 4 series (Surface clutter margin; False layer margin; Ocean boundary margin; 0 dB threshold) against Along-track position (km) and Margin above threshold (dB). Y-values range from 0 to 40.36 dB.
- Why it matters: A strong false layer can make a bright return ambiguous.
- What not to overclaim: Misleading if false-layer and ocean margins are swapped or the sign convention is reversed. Also do not say the graph proves anything about Europa.

## 16. V19 - Picked Boundary Depth vs True Ocean Depth

- Status: PASS (passed deterministic audit checks).
- What it is showing: A receiver can pick a shallower false layer when it is the stronger candidate.
- How to read the x-axis: Along-track position in kilometers.
- How to read the y-axis: Depth below local surface in meters.
- What each line/bar means: True ocean boundary; False layer depth; Receiver selected boundary.
- Main takeaway: False-layer depth should be shallower than true boundary depth; selected depth should be either a candidate depth or the midpoint used for ambiguous double returns.
- How to explain it out loud: Does the receiver-selected boundary follow the true modeled boundary or a false layer? It renders 3 series (True ocean boundary; False layer depth; Receiver selected boundary) against Along-track position (km) and Depth below local surface (m). Y-values range from 9419.685 to 16066.129 m.
- Why it matters: A receiver can pick a shallower false layer when it is the stronger candidate.
- What not to overclaim: Misleading if selected depth is not tied to the receiver decision model or if ambiguous midpoint picks are described as a confident ocean selection. Also do not say the graph proves anything about Europa.

## 17. V19 - Return Timing: False Layer Arrives Before Ocean

- Status: PASS (passed deterministic audit checks).
- What it is showing: Arrival order can help show why false internal layers are plausible competitors.
- How to read the x-axis: Along-track position in kilometers.
- How to read the y-axis: Two-way in-ice delay in microseconds.
- What each line/bar means: False layer return; Ocean boundary return; Receiver selected return.
- Main takeaway: The false-layer delay should be lower than the boundary delay when the false layer is shallower.
- How to explain it out loud: Does the false internal layer arrive before the boundary echo? It renders 3 series (False layer return; Ocean boundary return; Receiver selected return) against Along-track position (km) and Two-way delay in ice (us). Y-values range from 111.858 to 190.783 us.
- Why it matters: Arrival order can help show why false internal layers are plausible competitors.
- What not to overclaim: Misleading if the false-layer delay is not earlier than the boundary delay. Also do not say the graph proves anything about Europa.

## 18. V19 - Depth Error If the Receiver Picks the Wrong Layer

- Status: PASS (passed deterministic audit checks).
- What it is showing: Wrong picks can substantially underestimate boundary depth.
- How to read the x-axis: Along-track position in kilometers.
- How to read the y-axis: Depth error in meters.
- What each line/bar means: Selected minus true ocean; No error line.
- Main takeaway: A false-layer pick should produce a negative error because it is too shallow; 0 m means the boundary was picked correctly.
- How to explain it out loud: How wrong is the depth if the receiver picks the false layer instead of the boundary? It renders 2 series (Selected minus true ocean; No error line) against Along-track position (km) and Depth error (m). Y-values range from -5894.015 to 0 m.
- Why it matters: Wrong picks can substantially underestimate boundary depth.
- What not to overclaim: Misleading if the sign is reversed or if negative error is described as too deep. Also do not say the graph proves anything about Europa.

## 19. V19 - Satellite Receiver Decision Along Track

- Status: PASS (passed deterministic audit checks).
- What it is showing: The code sequence shows where the receiver would trust ocean, pick false, see clutter, or fail detection.
- How to read the x-axis: Along-track position in kilometers.
- How to read the y-axis: Receiver decision code.
- What each line/bar means: 0 weak, 1 ocean, 2 ambiguous, 3 false.
- Main takeaway: All codes must be integers from 0 to 3.
- How to explain it out loud: Which simplified receiver decision is made at each along-track sample? It renders 1 series (0 weak, 1 ocean, 2 ambiguous, 3 false) against Along-track position (km) and Decision code. Y-values range from 2 to 3 label-defined.
- Why it matters: The code sequence shows where the receiver would trust ocean, pick false, see clutter, or fail detection.
- What not to overclaim: Misleading if undocumented codes appear or code meanings are not explained nearby. Also do not say the graph proves anything about Europa.

## 20. V19 - Receiver Outcome Share for This Flyby

- Status: PASS (passed deterministic audit checks).
- What it is showing: This summarizes the receiver ambiguity pattern for the selected flyby.
- How to read the x-axis: Categorical receiver outcome.
- How to read the y-axis: Percent of along-track samples.
- What each line/bar means: Share of samples.
- Main takeaway: Bars should be between 0 and 100 and sum to about 100 percent.
- How to explain it out loud: What share of samples fall into each receiver outcome category? It renders 1 series (Share of samples) against Receiver outcome and Percent of along-track samples. Y-values range from 0 to 80.913 %.
- Why it matters: This summarizes the receiver ambiguity pattern for the selected flyby.
- What not to overclaim: Misleading if shares do not sum to 100 percent or if outcome labels are mismatched. Also do not say the graph proves anything about Europa.

## 21. V19 - Doppler-Inverted Look Angle vs Existing Geometry

- Status: PASS (passed deterministic audit checks).
- What it is showing: Doppler can help estimate look angle, but this is a controlled model demonstration.
- How to read the x-axis: Along-track position in kilometers.
- How to read the y-axis: Look angle in degrees.
- What each line/bar means: Doppler angle from VHF shift; Angle used after residual; Existing model geometry angle.
- Main takeaway: Angles should stay finite and within plausible angular bounds.
- How to explain it out loud: Does the Doppler-inverted look angle match the known geometry angle? It renders 3 series (Doppler angle from VHF shift; Angle used after residual; Existing model geometry angle) against Along-track position (km) and Look angle (deg). Y-values range from 0.077 to 18.471 deg.
- Why it matters: Doppler can help estimate look angle, but this is a controlled model demonstration.
- What not to overclaim: Misleading if Doppler inversion uses a different frequency or angle convention from the plotted geometry. Also do not say the graph proves anything about Europa.

## 22. V19 - Raw Slant Depth vs Doppler-Corrected Ocean Depth

- Status: PASS (passed deterministic audit checks).
- What it is showing: Geometry correction can reduce slant-path depth bias in the synthetic model.
- How to read the x-axis: Along-track position in kilometers.
- How to read the y-axis: Depth below local surface in meters.
- What each line/bar means: True simulated ocean depth; Raw slant depth from echo delay; Doppler-corrected depth estimate.
- Main takeaway: Corrected depth should have lower mean absolute error than raw slant depth in this controlled demo.
- How to explain it out loud: Does Doppler angle correction move raw slant depth closer to true boundary depth? It renders 3 series (True simulated ocean depth; Raw slant depth from echo delay; Doppler-corrected depth estimate) against Along-track position (km) and Depth below local surface (m). Y-values range from 14525.531 to 16083.837 m.
- Why it matters: Geometry correction can reduce slant-path depth bias in the synthetic model.
- What not to overclaim: Misleading if it claims correction helped when corrected error is not lower. Also do not say the graph proves anything about Europa.

## 23. V19 - Depth Error Before and After Angle Correction

- Status: PASS (passed deterministic audit checks).
- What it is showing: The correction reduces geometry-driven bias but does not validate real data.
- How to read the x-axis: Along-track position in kilometers.
- How to read the y-axis: Depth error in meters.
- What each line/bar means: Uncorrected slant-depth error; Corrected depth residual.
- Main takeaway: Corrected mean absolute error should be lower than raw mean absolute error in this controlled demo.
- How to explain it out loud: How much does the angle correction reduce depth error? It renders 2 series (Uncorrected slant-depth error; Corrected depth residual) against Along-track position (km) and Depth error (m). Y-values range from -12.812 to 780.345 m.
- Why it matters: The correction reduces geometry-driven bias but does not validate real data.
- What not to overclaim: Misleading if the plotted corrected error is not actually smaller. Also do not say the graph proves anything about Europa.

## 24. V19 - Corrected Layer Depths From Doppler Angle

- Status: PASS (passed deterministic audit checks).
- What it is showing: The correction preserves relative layer structure while reducing geometry bias.
- How to read the x-axis: Along-track position in kilometers.
- How to read the y-axis: Depth below local surface in meters.
- What each line/bar means: Corrected upper-layer depth; Corrected briny lens depth; Corrected ocean boundary depth.
- Main takeaway: All corrected depths should be non-negative and maintain the expected layer order.
- How to explain it out loud: What layer depths result after applying the Doppler angle correction? It renders 3 series (Corrected upper-layer depth; Corrected briny lens depth; Corrected ocean boundary depth) against Along-track position (km) and Depth below local surface (m). Y-values range from 945.591 to 16064.362 m.
- Why it matters: The correction preserves relative layer structure while reducing geometry bias.
- What not to overclaim: Misleading if corrected layers are out of order or are described as measured Europa depths. Also do not say the graph proves anything about Europa.

## 25. V30 - HF 9 MHz Mid-Shell Confidence vs Ambiguity

- Status: PASS (passed deterministic audit checks).
- What it is showing: The chart is a synthetic scoring aid for ambiguity risk, not a calibrated probability.
- How to read the x-axis: Categorical ice/clutter scenario.
- How to read the y-axis: Percent or 0-100 score.
- What each line/bar means: Median confidence; Ambiguous/false %.
- Main takeaway: Both series should be bounded from 0 to 100 and drawn as bars.
- How to explain it out loud: How does the advanced scenario score compare confidence against ambiguity risk? It renders 2 series (Median confidence; Ambiguous/false %) against Scenario and Percent / score (0-100). Y-values range from 20.17 to 79.83 0-100, %.
- Why it matters: The chart is a synthetic scoring aid for ambiguity risk, not a calibrated probability.
- What not to overclaim: Misleading if called a NASA confidence estimate or if 0-1 shares are plotted on a 0-100 axis. Also do not say the graph proves anything about Europa.

## 26. V30 - Pulse compression gain vs pulse length

- Status: PASS (passed deterministic audit checks).
- What it is showing: Longer pulse length raises the simplified sensitivity proxy.
- How to read the x-axis: Pulse length in microseconds.
- How to read the y-axis: Relative gain in dB.
- What each line/bar means: HF pulse gain; VHF pulse gain; Selected pulse setting.
- Main takeaway: Gain should increase monotonically with pulse length for the proxy curves.
- How to explain it out loud: How does pulse length affect the simplified pulse-compression gain proxy? It renders 3 series (HF pulse gain; VHF pulse gain; Selected pulse setting) against Pulse length (us) and dB. Y-values range from 5.645 to 28.656 dB.
- Why it matters: Longer pulse length raises the simplified sensitivity proxy.
- What not to overclaim: Misleading if treated as a full waveform processor or if selected setting is not tied to the control value. Also do not say the graph proves anything about Europa.

## 27. V30 - Geometric spreading power dB

- Status: PASS (passed deterministic audit checks).
- What it is showing: Geometry affects power before material interpretation.
- How to read the x-axis: Along-track position in kilometers.
- How to read the y-axis: Relative power in dB.
- What each line/bar means: HF geometric power; VHF topo geometric power.
- Main takeaway: Values should be finite dB powers and respond to altitude/range changes.
- How to explain it out loud: How does geometric spreading affect received power along track? It renders 2 series (HF geometric power; VHF topo geometric power) against Along-track position (km) and dB. Y-values range from -0.278 to -0.021 dB.
- Why it matters: Geometry affects power before material interpretation.
- What not to overclaim: Misleading if the power ratio is plotted as linear power or if amplitude and power log conventions are mixed. Also do not say the graph proves anything about Europa.

## 28. V30 - Coherent Fresnel-zone gain

- Status: PASS (passed deterministic audit checks).
- What it is showing: This is an aperture/coherence sensitivity proxy, not a full aperture-synthesis model.
- How to read the x-axis: Along-track position in kilometers.
- How to read the y-axis: Relative coherent gain in dB.
- What each line/bar means: HF coherent gain from Fresnel looks; VHF coherent gain from Fresnel looks.
- Main takeaway: Values should stay finite and shift with spacing/index settings.
- How to explain it out loud: How does along-track spacing and ice index affect the simplified coherent-gain proxy? It renders 2 series (HF coherent gain from Fresnel looks; VHF coherent gain from Fresnel looks) against Along-track position (km) and dB. Y-values range from 0 to 2.963 dB.
- Why it matters: This is an aperture/coherence sensitivity proxy, not a full aperture-synthesis model.
- What not to overclaim: Misleading if described as measured coherent processing gain. Also do not say the graph proves anything about Europa.

## 29. V30 - Total VHF dB: constant vs frequency-dependent response

- Status: PASS (passed deterministic audit checks).
- What it is showing: Frequency response is a sensitivity comparison, not an observation.
- How to read the x-axis: Along-track position in kilometers.
- How to read the y-axis: Relative total VHF power in dB.
- What each line/bar means: Constant reflectivity; Frequency-dependent reflectivity.
- Main takeaway: Both series should be finite; the frequency-dependent series should differ by the modeled response term.
- How to explain it out loud: How does a frequency-dependent reflectivity response change total VHF power? It renders 2 series (Constant reflectivity; Frequency-dependent reflectivity) against Along-track position (km) and dB. Y-values range from -11.079 to -5.355 dB.
- Why it matters: Frequency response is a sensitivity comparison, not an observation.
- What not to overclaim: Misleading if a single curve is presented as a validated VHF processor output. Also do not say the graph proves anything about Europa.

## 30. V30 - HF 9 MHz Workbook-Depth Outcomes

- Status: PASS (passed deterministic audit checks).
- What it is showing: The chart compares outcome shares under synthetic HF scenario stress.
- How to read the x-axis: Categorical scenario.
- How to read the y-axis: Percent share from 0 to 100.
- What each line/bar means: Clear ocean; Deep false risk; Weak/no deep.
- Main takeaway: For each scenario, the shares should sum to about 100 percent.
- How to explain it out loud: How do deep-boundary outcome shares change across HF scenario categories? It renders 3 series (Clear ocean; Deep false risk; Weak/no deep) against Scenario and Percent (0-100). Y-values range from 5.688 to 87.55 0-100, %.
- Why it matters: The chart compares outcome shares under synthetic HF scenario stress.
- What not to overclaim: Misleading if 0-1 shares are shown on a percent axis or if shares do not sum to 100. Also do not say the graph proves anything about Europa.

## 31. V30 - VHF 60 MHz Shallow Clutter Stress Test

- Status: PASS (passed deterministic audit checks).
- What it is showing: The chart shows where shallow clutter or internal features dominate a simplified VHF scenario.
- How to read the x-axis: Categorical scenario.
- How to read the y-axis: Percent share from 0 to 100.
- What each line/bar means: Surface clutter; Internal feature; Outside shallow window; Weak/no detection.
- Main takeaway: For each scenario, the shares should sum to about 100 percent.
- How to explain it out loud: How does shallow clutter stress split outcomes across VHF scenario categories? It renders 4 series (Surface clutter; Internal feature; Outside shallow window; Weak/no detection) against Scenario and Percent (0-100). Y-values range from 1.513 to 63.825 0-100, %.
- Why it matters: The chart shows where shallow clutter or internal features dominate a simplified VHF scenario.
- What not to overclaim: Misleading if the bars are interpreted as real detection probabilities. Also do not say the graph proves anything about Europa.

## 32. V30 - Surface Height: Off-Nadir Target vs Nadir Reference Terrain

- Status: PASS (passed deterministic audit checks).
- What it is showing: Terrain is a moving reference surface that must be separated from subsurface timing.
- How to read the x-axis: Along-track position in kilometers.
- How to read the y-axis: Surface elevation in meters relative to the model reference.
- What each line/bar means: Off-nadir target terrain; Nadir terrain.
- Main takeaway: The two terrain lines may diverge where off-nadir geometry samples a different surface location, but both should stay finite surface heights.
- How to explain it out loud: How different is the side-looking target terrain from the nadir terrain reference along the same pass? It renders 2 series (Off-nadir target terrain; Nadir terrain) against Along-track position (km) and Surface elevation (m). Y-values range from -156.935 to 568.644 m.
- Why it matters: Terrain is a moving reference surface that must be separated from subsurface timing.
- What not to overclaim: Misleading if labeled as depth, if either path uses stale data, or if the two terrain series are swapped. Also do not say the graph proves anything about Europa.

## 33. V30 - Apparent Depth: Spacecraft Motion Distortion by Run

- Status: PASS (passed deterministic audit checks).
- What it is showing: Motion geometry can create depth-like structure that must not be mistaken for ice structure.
- How to read the x-axis: Along-track position in kilometers.
- How to read the y-axis: Apparent depth in meters caused by geometry, not a true reflector depth.
- What each line/bar means: Custom 400 km / 120 km pass; Paper low-altitude 35 km / 800 km pass; Paper ice-ocean 35 km / 1600 km pass; Operating 25 km / 1600 km pass.
- Main takeaway: Values should be non-negative and vary with altitude/off-nadir geometry.
- How to explain it out loud: How much apparent depth can the motion geometry create for different flyby runs? It renders 4 series (Custom 400 km / 120 km pass; Paper low-altitude 35 km / 800 km pass; Paper ice-ocean 35 km / 1600 km pass; Operating 25 km / 1600 km pass) against Along-track position (km) and Apparent depth (m). Y-values range from 550.7 to 238293.574 m.
- Why it matters: Motion geometry can create depth-like structure that must not be mistaken for ice structure.
- What not to overclaim: Misleading if described as measured ocean depth or if negative depths appear. Also do not say the graph proves anything about Europa.

## 34. V30 - Terrain Baseline: Total Radar Elevation Error

- Status: PASS (passed deterministic audit checks).
- What it is showing: This is the terrain/elevation contribution to radar timing error, not an ocean-depth estimate.
- How to read the x-axis: Along-track position in kilometers.
- How to read the y-axis: Surface-height equivalent error in meters.
- What each line/bar means: Total radar elevation error - custom parabolic.
- Main takeaway: The series may be positive or negative but must stay finite and have meter units.
- How to explain it out loud: How large is the total terrain/elevation error term in the advanced v30 view? It renders 1 series (Total radar elevation error - custom parabolic) against Along-track position (km) and Surface-height equivalent error (m). Y-values range from -100.705 to 155.165 m.
- Why it matters: This is the terrain/elevation contribution to radar timing error, not an ocean-depth estimate.
- What not to overclaim: Misleading if labeled only as value or if explained as a subsurface layer. Also do not say the graph proves anything about Europa.

## 35. V30 - Doppler: Flat Geometry vs Topography

- Status: PASS (passed deterministic audit checks).
- What it is showing: Doppler is another geometry-sensitive observable, not direct evidence of an ocean.
- How to read the x-axis: Along-track position in kilometers.
- How to read the y-axis: Doppler shift in hertz.
- What each line/bar means: Flat VHF Doppler (Hz); Topo VHF Doppler (Hz); Flat HF Doppler (Hz); Topo HF Doppler (Hz).
- Main takeaway: Topography can perturb the flat-geometry curve but values should stay finite in Hz.
- How to explain it out loud: How does generated topography change Doppler shift relative to flat geometry? It renders 4 series (Flat VHF Doppler (Hz); Topo VHF Doppler (Hz); Flat HF Doppler (Hz); Topo HF Doppler (Hz)) against Along-track position (km) and Doppler shift (Hz). Y-values range from -576.664 to 561.993 Hz.
- Why it matters: Doppler is another geometry-sensitive observable, not direct evidence of an ocean.
- What not to overclaim: Misleading if topographic and flat series are swapped or if Hz is omitted. Also do not say the graph proves anything about Europa.

## 36. V30 - Nadir Radar Delay by Flyby: Without Topography

- Status: PASS (passed deterministic audit checks).
- What it is showing: This is a reference timing baseline for flyby comparisons.
- How to read the x-axis: Along-track position in kilometers.
- How to read the y-axis: Delay in microseconds.
- What each line/bar means: Custom 400 km / 120 km pass; Paper low-altitude 35 km / 800 km pass; Paper ice-ocean 35 km / 1600 km pass; Operating 25 km / 1600 km pass.
- Main takeaway: Delays should be non-negative and comparatively smooth without generated terrain.
- How to explain it out loud: What timing delay appears in nadir geometry before generated terrain is added? It renders 4 series (Custom 400 km / 120 km pass; Paper low-altitude 35 km / 800 km pass; Paper ice-ocean 35 km / 1600 km pass; Operating 25 km / 1600 km pass) against Along-track position (km) and Delay (us). Y-values range from 166.782 to 6671.282 us.
- Why it matters: This is a reference timing baseline for flyby comparisons.
- What not to overclaim: Misleading if read as off-nadir delay or as a measured subsurface reflector. Also do not say the graph proves anything about Europa.

## 37. V30 - Nadir Radar Delay by Flyby: With Generated Topography

- Status: PASS (passed deterministic audit checks).
- What it is showing: Nadir timing still needs terrain correction before subsurface interpretation.
- How to read the x-axis: Along-track position in kilometers.
- How to read the y-axis: Delay in microseconds.
- What each line/bar means: Custom 400 km / 120 km pass; Paper low-altitude 35 km / 800 km pass; Paper ice-ocean 35 km / 1600 km pass; Operating 25 km / 1600 km pass.
- Main takeaway: The terrain-on series can vary more locally than the flat reference and should stay non-negative.
- How to explain it out loud: How does generated terrain perturb nadir timing across flyby scenarios? It renders 4 series (Custom 400 km / 120 km pass; Paper low-altitude 35 km / 800 km pass; Paper ice-ocean 35 km / 1600 km pass; Operating 25 km / 1600 km pass) against Along-track position (km) and Delay (us). Y-values range from 166.742 to 6671.248 us.
- Why it matters: Nadir timing still needs terrain correction before subsurface interpretation.
- What not to overclaim: Misleading if terrain-on values are described as true boundary depth. Also do not say the graph proves anything about Europa.

## 38. V30 - Off-Nadir Radar Delay by Flyby: Without Topography

- Status: PASS (passed deterministic audit checks).
- What it is showing: Side-looking geometry can mimic depth unless corrected.
- How to read the x-axis: Along-track position in kilometers.
- How to read the y-axis: Delay in microseconds.
- What each line/bar means: Custom 400 km / 120 km pass; Paper low-altitude 35 km / 800 km pass; Paper ice-ocean 35 km / 1600 km pass; Operating 25 km / 1600 km pass.
- Main takeaway: Off-nadir delays should be non-negative and generally larger where slant range is longer.
- How to explain it out loud: What timing delay does side-looking geometry add before terrain is included? It renders 4 series (Custom 400 km / 120 km pass; Paper low-altitude 35 km / 800 km pass; Paper ice-ocean 35 km / 1600 km pass; Operating 25 km / 1600 km pass) against Along-track position (km) and Delay (us). Y-values range from 236.807 to 9500.99 us.
- Why it matters: Side-looking geometry can mimic depth unless corrected.
- What not to overclaim: Misleading if shown as a subsurface echo or if the flat/topography distinction is lost. Also do not say the graph proves anything about Europa.

## 39. V30 - Off-Nadir Radar Delay by Flyby: With Generated Topography

- Status: PASS (passed deterministic audit checks).
- What it is showing: Off-nadir timing must be separated from real in-ice delay.
- How to read the x-axis: Along-track position in kilometers.
- How to read the y-axis: Delay in microseconds.
- What each line/bar means: Custom 400 km / 120 km pass; Paper low-altitude 35 km / 800 km pass; Paper ice-ocean 35 km / 1600 km pass; Operating 25 km / 1600 km pass.
- Main takeaway: Values should remain non-negative and vary with both slant geometry and terrain.
- How to explain it out loud: How does generated terrain modify off-nadir timing across flyby scenarios? It renders 4 series (Custom 400 km / 120 km pass; Paper low-altitude 35 km / 800 km pass; Paper ice-ocean 35 km / 1600 km pass; Operating 25 km / 1600 km pass) against Along-track position (km) and Delay (us). Y-values range from 234.579 to 9500.556 us.
- Why it matters: Off-nadir timing must be separated from real in-ice delay.
- What not to overclaim: Misleading if treated as independent evidence for an ocean boundary. Also do not say the graph proves anything about Europa.

## 40. V30 - Subsurface Truth Model: Icy Layers

- Status: PASS (passed deterministic audit checks).
- What it is showing: The model deliberately includes competing internal reflectors before the deepest boundary.
- How to read the x-axis: Along-track position in kilometers.
- How to read the y-axis: Elevation relative to the model reference in meters.
- What each line/bar means: Icy top surface; Shallow ice layer; Warm/briny lens; Ice-ocean boundary.
- Main takeaway: Surface should sit highest; deeper layers should have lower elevations.
- How to explain it out loud: Where are the synthetic surface, shallow layer, briny lens, and possible boundary placed? It renders 4 series (Icy top surface; Shallow ice layer; Warm/briny lens; Ice-ocean boundary) against Along-track position (km) and Elevation relative to model reference (m). Y-values range from -15618.159 to 568.644 m.
- Why it matters: The model deliberately includes competing internal reflectors before the deepest boundary.
- What not to overclaim: Misleading if the y-axis mixes elevation with raw depth or implies measured Europa structure. Also do not say the graph proves anything about Europa.

## 41. V30 - Scenario Comparison: Thin / Medium / Thick Ice

- Status: PASS (passed deterministic audit checks).
- What it is showing: Shell-thickness assumptions strongly affect the modeled boundary depth.
- How to read the x-axis: Along-track position in kilometers.
- How to read the y-axis: Depth below local surface in meters.
- What each line/bar means: Thin shell; Medium shell; Thick shell.
- Main takeaway: All depths should be non-negative; thicker-shell scenarios should be deeper.
- How to explain it out loud: How sensitive is the possible boundary depth to assumed ice-shell thickness? It renders 3 series (Thin shell; Medium shell; Thick shell) against Along-track position (km) and Depth (m). Y-values range from 7996.089 to 28115.726 m.
- Why it matters: Shell-thickness assumptions strongly affect the modeled boundary depth.
- What not to overclaim: Misleading if the three scenarios are presented as observed depths. Also do not say the graph proves anything about Europa.

## 42. V30 - Boundary Uncertainty Band

- Status: PASS (passed deterministic audit checks).
- What it is showing: The boundary should be read as a band, not a single exact line.
- How to read the x-axis: Along-track position in kilometers.
- How to read the y-axis: Depth below local surface in meters.
- What each line/bar means: Lower bound; Mean boundary; Upper bound.
- Main takeaway: Lower <= mean <= upper at each sample and all depths should be non-negative.
- How to explain it out loud: How wide is the possible range around the modeled boundary depth? It renders 3 series (Lower bound; Mean boundary; Upper bound) against Along-track position (km) and Depth (m). Y-values range from 13038.343 to 17566.129 m.
- Why it matters: The boundary should be read as a band, not a single exact line.
- What not to overclaim: Misleading if the band is explained as confidence from real observations. Also do not say the graph proves anything about Europa.

## 43. V30 - Ocean Model vs No-Ocean Control

- Status: PASS (passed deterministic audit checks).
- What it is showing: The ocean-model echo is meaningful only if it separates from the no-ocean control.
- How to read the x-axis: Along-track position in kilometers.
- How to read the y-axis: Relative power or threshold margin in dB.
- What each line/bar means: Ocean model margin; No-ocean control margin; 0 dB threshold.
- Main takeaway: The 0 dB threshold line should be present; positive margin is above threshold and negative is below.
- How to explain it out loud: Does the modeled boundary echo clear the threshold more strongly than a no-ocean control? It renders 3 series (Ocean model margin; No-ocean control margin; 0 dB threshold) against Along-track position (km) and Relative power / margin (dB). Y-values range from -16.499 to 11.938 dB.
- Why it matters: The ocean-model echo is meaningful only if it separates from the no-ocean control.
- What not to overclaim: Misleading if the margin sign is reversed or the threshold line is absent. Also do not say the graph proves anything about Europa.

## 44. V30 - Radargram-Style Return Timing With Clutter

- Status: PASS (passed deterministic audit checks).
- What it is showing: Earlier internal echoes can compete with the boundary echo.
- How to read the x-axis: Along-track position in kilometers.
- How to read the y-axis: Two-way delay in microseconds.
- What each line/bar means: Surface clutter upper; Shallow ice return; Warm/briny lens return; Ocean boundary return.
- Main takeaway: Shallower clutter/layers should return earlier than deeper layers, with finite non-negative delays.
- How to explain it out loud: When do clutter, shallow layers, lens echoes, and the boundary return in time? It renders 4 series (Surface clutter upper; Shallow ice return; Warm/briny lens return; Ocean boundary return) against Along-track position (km) and Delay (us). Y-values range from 10.502 to 192.253 us.
- Why it matters: Earlier internal echoes can compete with the boundary echo.
- What not to overclaim: Misleading if a return line is presented as uniquely ocean-like from timing alone. Also do not say the graph proves anything about Europa.

## 45. V30 - Detectability Margin vs Threshold

- Status: PASS (passed deterministic audit checks).
- What it is showing: If the lens margin rivals the boundary margin, strongest-return interpretation is ambiguous.
- How to read the x-axis: Along-track position in kilometers.
- How to read the y-axis: Relative power or threshold margin in dB.
- What each line/bar means: Lens echo margin; Ocean echo margin; 0 dB threshold.
- Main takeaway: The 0 dB threshold line should be present; positive means above threshold.
- How to explain it out loud: Do the lens and boundary echoes clear the simplified detection threshold? It renders 3 series (Lens echo margin; Ocean echo margin; 0 dB threshold) against Along-track position (km) and Relative power / margin (dB). Y-values range from 0 to 21.491 dB.
- Why it matters: If the lens margin rivals the boundary margin, strongest-return interpretation is ambiguous.
- What not to overclaim: Misleading if positive/negative margin meaning is reversed or if lens and ocean labels are swapped. Also do not say the graph proves anything about Europa.

## 46. V30 - Reflection Strength by Material / Interface

- Status: PASS (passed deterministic audit checks).
- What it is showing: Internal contrasts can be strong enough to compete with a boundary return in the simplified model.
- How to read the x-axis: Categorical material or interface name.
- How to read the y-axis: Relative reflector strength in dB.
- What each line/bar means: Material/interface strength.
- Main takeaway: The chart should be a bar chart with categorical x-values and no detection-threshold claim.
- How to explain it out loud: Which synthetic material/interface assumptions produce stronger modeled reflections? It renders 1 series (Material/interface strength) against Material / interface and Relative reflector strength (dB). Y-values range from -18.88 to -7.76 dB.
- Why it matters: Internal contrasts can be strong enough to compete with a boundary return in the simplified model.
- What not to overclaim: Misleading if labeled as a threshold margin or drawn as a continuous along-track trend. Also do not say the graph proves anything about Europa.

## 47. V30 - Cross-Instrument Evidence Score

- Status: PASS (passed deterministic audit checks).
- What it is showing: Radar should be read alongside other context, but these scores are illustrative.
- How to read the x-axis: Categorical instrument or evidence channel.
- How to read the y-axis: Support score in percent.
- What each line/bar means: Evidence support score.
- Main takeaway: The chart should be a categorical bar chart with values from 0 to 100.
- How to explain it out loud: How much modeled support comes from radar and contextual evidence channels? It renders 1 series (Evidence support score) against Instrument and Support (%). Y-values range from 45.05 to 63.4 %.
- Why it matters: Radar should be read alongside other context, but these scores are illustrative.
- What not to overclaim: Misleading if presented as NASA-validated evidence or real observation probability. Also do not say the graph proves anything about Europa.

## 48. V30 - Doppler-Inverted Look Angle vs Existing Geometry

- Status: PASS (passed deterministic audit checks).
- What it is showing: Doppler can help estimate look angle, but this is a controlled model demonstration.
- How to read the x-axis: Along-track position in kilometers.
- How to read the y-axis: Look angle in degrees.
- What each line/bar means: Doppler angle from VHF shift; Angle used after residual; Existing model geometry angle.
- Main takeaway: Angles should stay finite and within plausible angular bounds.
- How to explain it out loud: Does the Doppler-inverted look angle match the known geometry angle? It renders 3 series (Doppler angle from VHF shift; Angle used after residual; Existing model geometry angle) against Along-track position (km) and Look angle (deg). Y-values range from 0.077 to 18.471 deg.
- Why it matters: Doppler can help estimate look angle, but this is a controlled model demonstration.
- What not to overclaim: Misleading if Doppler inversion uses a different frequency or angle convention from the plotted geometry. Also do not say the graph proves anything about Europa.

## 49. V30 - Raw Slant Depth vs Doppler-Corrected Ocean Depth

- Status: PASS (passed deterministic audit checks).
- What it is showing: Geometry correction can reduce slant-path depth bias in the synthetic model.
- How to read the x-axis: Along-track position in kilometers.
- How to read the y-axis: Depth below local surface in meters.
- What each line/bar means: True simulated ocean depth; Raw slant depth from echo delay; Doppler-corrected depth estimate.
- Main takeaway: Corrected depth should have lower mean absolute error than raw slant depth in this controlled demo.
- How to explain it out loud: Does Doppler angle correction move raw slant depth closer to true boundary depth? It renders 3 series (True simulated ocean depth; Raw slant depth from echo delay; Doppler-corrected depth estimate) against Along-track position (km) and Depth below local surface (m). Y-values range from 14525.531 to 16083.837 m.
- Why it matters: Geometry correction can reduce slant-path depth bias in the synthetic model.
- What not to overclaim: Misleading if it claims correction helped when corrected error is not lower. Also do not say the graph proves anything about Europa.

## 50. V30 - Depth Error Before and After Angle Correction

- Status: PASS (passed deterministic audit checks).
- What it is showing: The correction reduces geometry-driven bias but does not validate real data.
- How to read the x-axis: Along-track position in kilometers.
- How to read the y-axis: Depth error in meters.
- What each line/bar means: Uncorrected slant-depth error; Corrected depth residual.
- Main takeaway: Corrected mean absolute error should be lower than raw mean absolute error in this controlled demo.
- How to explain it out loud: How much does the angle correction reduce depth error? It renders 2 series (Uncorrected slant-depth error; Corrected depth residual) against Along-track position (km) and Depth error (m). Y-values range from -12.812 to 780.345 m.
- Why it matters: The correction reduces geometry-driven bias but does not validate real data.
- What not to overclaim: Misleading if the plotted corrected error is not actually smaller. Also do not say the graph proves anything about Europa.

## 51. V30 - Corrected Layer Depths From Doppler Angle

- Status: PASS (passed deterministic audit checks).
- What it is showing: The correction preserves relative layer structure while reducing geometry bias.
- How to read the x-axis: Along-track position in kilometers.
- How to read the y-axis: Depth below local surface in meters.
- What each line/bar means: Corrected upper-layer depth; Corrected briny lens depth; Corrected ocean boundary depth.
- Main takeaway: All corrected depths should be non-negative and maintain the expected layer order.
- How to explain it out loud: What layer depths result after applying the Doppler angle correction? It renders 3 series (Corrected upper-layer depth; Corrected briny lens depth; Corrected ocean boundary depth) against Along-track position (km) and Depth below local surface (m). Y-values range from 945.591 to 16064.362 m.
- Why it matters: The correction preserves relative layer structure while reducing geometry bias.
- What not to overclaim: Misleading if corrected layers are out of order or are described as measured Europa depths. Also do not say the graph proves anything about Europa.

## 52. V30 - Fresnel-zone coherent look count

- Status: PASS (passed deterministic audit checks).
- What it is showing: The chart explains the coherent-gain proxy by showing the sample-count driver behind it.
- How to read the x-axis: Along-track position in kilometers.
- How to read the y-axis: Coherent look count.
- What each line/bar means: HF effective coherent looks; VHF effective coherent looks; Aperture cap in samples.
- Main takeaway: Counts should be finite and non-negative; HF should generally allow more looks than VHF for the same depth and spacing.
- How to explain it out loud: How many coherent along-track samples are available inside the first Fresnel-zone limit? It renders 3 series (HF effective coherent looks; VHF effective coherent looks; Aperture cap in samples) against Along-track position (km) and Coherent looks (count). Y-values range from 1 to 5 count.
- Why it matters: The chart explains the coherent-gain proxy by showing the sample-count driver behind it.
- What not to overclaim: Misleading if described as an actual processed aperture product or if counts become negative. Also do not say the graph proves anything about Europa.

## 53. V30 - Windowed chirp response: frequency washout

- Status: PASS (passed deterministic audit checks).
- What it is showing: The chart separates center-frequency assumptions from the band-averaged response actually used by the v30 sensitivity model.
- How to read the x-axis: Categorical radar band.
- How to read the y-axis: Relative response in dB.
- What each line/bar means: Center-frequency reflectivity offset; Windowed chirp-average reflectivity; Windowed response plus pulse gain; Window washout delta.
- Main takeaway: The chart should be a categorical bar chart in dB with finite values for both HF and VHF bands.
- How to explain it out loud: Does a frequency-dependent response survive chirp window averaging, or does it mostly wash out? It renders 4 series (Center-frequency reflectivity offset; Windowed chirp-average reflectivity; Windowed response plus pulse gain; Window washout delta) against Radar band and dB. Y-values range from -5.474 to 16.195 dB.
- Why it matters: The chart separates center-frequency assumptions from the band-averaged response actually used by the v30 sensitivity model.
- What not to overclaim: Misleading if the band-averaged result is presented as a measured chirp processor or if dB values are averaged directly instead of averaging linear power first. Also do not say the graph proves anything about Europa.

