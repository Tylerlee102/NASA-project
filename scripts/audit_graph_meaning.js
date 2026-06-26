#!/usr/bin/env node
/*
 * Deterministic chart contract audit for the GitHub Pages dashboard.
 *
 * The script loads the same browser model files used by docs/index.html,
 * computes the default v19 and v30 chart objects, validates labels/data/formula
 * expectations, and regenerates GRAPH_VALIDATION_REPORT.md plus
 * GRAPH_SPEAKER_NOTES.md.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const TODAY = '2026-06-26';

const SOURCE_FILES = [
  'docs/index.html',
  'docs/app.js',
  'docs/model.js',
  'docs/styles.css',
  'docs/data/v19-results.js',
  'docs/data/v30-results.js',
  'docs/assets/v30_all_dynamic_graphs.xlsx'
];

const MODEL_FILES = [
  'docs/data/v19-results.js',
  'docs/data/v30-results.js',
  'docs/model.js'
];

const FIX_LOG = [
  {
    title: 'Subsurface Truth Model: Icy Layers',
    affected: 'v19 and v30 rendered instances',
    mistake: 'The chart plotted layer elevations relative to the model reference, but the old wording mixed elevation and raw depth.',
    fix: 'Changed the y-axis wording and explanation to "Elevation relative to model reference (m)".'
  },
  {
    title: 'Reflection Strength by Material / Interface',
    affected: 'v19 and v30 rendered instances',
    mistake: 'The bars are assumed reflector strengths, not detection margins; the old label implied a threshold margin.',
    fix: 'Changed the y-axis wording and explanation to "Relative reflector strength (dB)".'
  },
  {
    title: 'Reflection Strength by Material / Interface',
    affected: 'v19 and v30 categorical bar charts',
    mistake: 'A categorical material chart previously inherited an along-track x-axis label.',
    fix: 'Set the x-axis to "Material / interface" and kept it as a bar chart.'
  },
  {
    title: 'Cross-Instrument Evidence Score',
    affected: 'v19 and v30 categorical bar charts',
    mistake: 'A categorical evidence chart previously inherited an along-track x-axis label.',
    fix: 'Set the x-axis to "Instrument" and kept it as a bar chart.'
  },
  {
    title: 'Terrain Baseline: Total Radar Elevation Error',
    affected: 'v30 terrain-error chart',
    mistake: 'The y-axis label was generic, so it did not say what the value represented.',
    fix: 'Set the y-axis to "Surface-height equivalent error (m)".'
  }
];

const CONTRACTS = {
  'Surface Height: Off-Nadir Target vs Nadir Reference Terrain': {
    question: 'How different is the side-looking target terrain from the nadir terrain reference along the same pass?',
    inputData: 'Generated target and nadir topography rows from the browser model.',
    formula: 'topography(x, y, params) is sampled for the target and nadir reference paths.',
    xMeaning: 'Along-track position in kilometers.',
    yMeaning: 'Surface elevation in meters relative to the model reference.',
    expected: 'The two terrain lines may diverge where off-nadir geometry samples a different surface location, but both should stay finite surface heights.',
    interpretation: 'Terrain is a moving reference surface that must be separated from subsurface timing.',
    misleadingIf: 'Misleading if labeled as depth, if either path uses stale data, or if the two terrain series are swapped.'
  },
  'Apparent Depth: Spacecraft Motion Distortion by Run': {
    question: 'How much apparent depth can the motion geometry create for different flyby runs?',
    inputData: 'Along-track position, spacecraft altitude, off-nadir distance, and generated terrain state.',
    formula: 'Slant-path excess is converted to apparent depth using the radar two-way travel-time geometry.',
    xMeaning: 'Along-track position in kilometers.',
    yMeaning: 'Apparent depth in meters caused by geometry, not a true reflector depth.',
    expected: 'Values should be non-negative and vary with altitude/off-nadir geometry.',
    interpretation: 'Motion geometry can create depth-like structure that must not be mistaken for ice structure.',
    misleadingIf: 'Misleading if described as measured ocean depth or if negative depths appear.'
  },
  'Terrain Baseline: Surface-Height Equivalent Error': {
    question: 'How large is the terrain-driven error before interpreting a subsurface return?',
    inputData: 'Generated terrain differences between target and reference paths.',
    formula: 'Surface-height equivalent error is the target/reference terrain mismatch converted to meters.',
    xMeaning: 'Along-track position in kilometers.',
    yMeaning: 'Surface-height equivalent error in meters.',
    expected: 'The series may cross zero because terrain can make the target higher or lower than the reference.',
    interpretation: 'Terrain mismatch is a baseline error source that can bias a depth interpretation.',
    misleadingIf: 'Misleading if the y-axis is generic or if the sign is described as depth below the surface.'
  },
  'Terrain Baseline: Total Radar Elevation Error': {
    question: 'How large is the total terrain/elevation error term in the advanced v30 view?',
    inputData: 'Advanced chart data adapted from the live browser model.',
    formula: 'The browser model computes surface-height equivalent error from geometry plus generated terrain.',
    xMeaning: 'Along-track position in kilometers.',
    yMeaning: 'Surface-height equivalent error in meters.',
    expected: 'The series may be positive or negative but must stay finite and have meter units.',
    interpretation: 'This is the terrain/elevation contribution to radar timing error, not an ocean-depth estimate.',
    misleadingIf: 'Misleading if labeled only as value or if explained as a subsurface layer.'
  },
  'Doppler: Flat Geometry vs Topography': {
    question: 'How does generated topography change Doppler shift relative to flat geometry?',
    inputData: 'Spacecraft speed, geometry angle, radar frequency, and generated terrain slope.',
    formula: 'Doppler shift is computed from radial velocity sensitivity for flat and topographic cases.',
    xMeaning: 'Along-track position in kilometers.',
    yMeaning: 'Doppler shift in hertz.',
    expected: 'Topography can perturb the flat-geometry curve but values should stay finite in Hz.',
    interpretation: 'Doppler is another geometry-sensitive observable, not direct evidence of an ocean.',
    misleadingIf: 'Misleading if topographic and flat series are swapped or if Hz is omitted.'
  },
  'Scenario Two-Way Extra Delay: Flat Surface': {
    question: 'How much extra two-way radar delay does each flat-surface flyby geometry add?',
    inputData: 'Flat-surface path geometry for multiple scenario runs.',
    formula: 'Two-way extra delay is 2 times extra path length divided by the speed of light, converted to microseconds.',
    xMeaning: 'Along-track position in kilometers.',
    yMeaning: 'Two-way extra delay in microseconds.',
    expected: 'Delays should be non-negative and should increase with longer extra path length.',
    interpretation: 'The delay is a geometry timing cost, not a measured subsurface delay.',
    misleadingIf: 'Misleading if the factor of 2 is missing or if units are treated as one-way delay.'
  },
  'Custom Pass Two-Way Extra Delay: Flat vs Generated Topography': {
    question: 'How does generated topography change the custom pass timing delay compared with a flat surface?',
    inputData: 'Custom flat and generated-topography path lengths.',
    formula: 'Two-way delay equals 2 times extra path length divided by c, converted to microseconds.',
    xMeaning: 'Along-track position in kilometers.',
    yMeaning: 'Two-way extra delay in microseconds.',
    expected: 'Both series should be non-negative; terrain should perturb the flat baseline.',
    interpretation: 'Topography can change timing enough to matter for depth interpretation.',
    misleadingIf: 'Misleading if the topography series is just a relabeled duplicate of the flat series.'
  },
  'Nadir Radar Delay by Flyby: Without Topography': {
    question: 'What timing delay appears in nadir geometry before generated terrain is added?',
    inputData: 'Nadir path geometry from advanced flyby scenarios.',
    formula: 'Round-trip path delay is computed from nadir geometry and converted to microseconds.',
    xMeaning: 'Along-track position in kilometers.',
    yMeaning: 'Delay in microseconds.',
    expected: 'Delays should be non-negative and comparatively smooth without generated terrain.',
    interpretation: 'This is a reference timing baseline for flyby comparisons.',
    misleadingIf: 'Misleading if read as off-nadir delay or as a measured subsurface reflector.'
  },
  'Nadir Radar Delay by Flyby: With Generated Topography': {
    question: 'How does generated terrain perturb nadir timing across flyby scenarios?',
    inputData: 'Nadir path geometry plus generated topography.',
    formula: 'Round-trip path delay is recomputed after terrain height changes the reference surface.',
    xMeaning: 'Along-track position in kilometers.',
    yMeaning: 'Delay in microseconds.',
    expected: 'The terrain-on series can vary more locally than the flat reference and should stay non-negative.',
    interpretation: 'Nadir timing still needs terrain correction before subsurface interpretation.',
    misleadingIf: 'Misleading if terrain-on values are described as true boundary depth.'
  },
  'Off-Nadir Radar Delay by Flyby: Without Topography': {
    question: 'What timing delay does side-looking geometry add before terrain is included?',
    inputData: 'Off-nadir path geometry for advanced flyby scenarios.',
    formula: 'Two-way delay is computed from the off-nadir slant path and converted to microseconds.',
    xMeaning: 'Along-track position in kilometers.',
    yMeaning: 'Delay in microseconds.',
    expected: 'Off-nadir delays should be non-negative and generally larger where slant range is longer.',
    interpretation: 'Side-looking geometry can mimic depth unless corrected.',
    misleadingIf: 'Misleading if shown as a subsurface echo or if the flat/topography distinction is lost.'
  },
  'Off-Nadir Radar Delay by Flyby: With Generated Topography': {
    question: 'How does generated terrain modify off-nadir timing across flyby scenarios?',
    inputData: 'Off-nadir path geometry plus generated topography.',
    formula: 'Two-way slant-path delay is recomputed with local target terrain height.',
    xMeaning: 'Along-track position in kilometers.',
    yMeaning: 'Delay in microseconds.',
    expected: 'Values should remain non-negative and vary with both slant geometry and terrain.',
    interpretation: 'Off-nadir timing must be separated from real in-ice delay.',
    misleadingIf: 'Misleading if treated as independent evidence for an ocean boundary.'
  },
  'Subsurface Truth Model: Icy Layers': {
    question: 'Where are the synthetic surface, shallow layer, briny lens, and possible boundary placed?',
    inputData: 'Generated surface and layer-elevation rows from the live subsurface model.',
    formula: 'Layer elevations are produced by subtracting modeled layer depths from local surface elevation.',
    xMeaning: 'Along-track position in kilometers.',
    yMeaning: 'Elevation relative to the model reference in meters.',
    expected: 'Surface should sit highest; deeper layers should have lower elevations.',
    interpretation: 'The model deliberately includes competing internal reflectors before the deepest boundary.',
    misleadingIf: 'Misleading if the y-axis mixes elevation with raw depth or implies measured Europa structure.'
  },
  'Scenario Comparison: Thin / Medium / Thick Ice': {
    question: 'How sensitive is the possible boundary depth to assumed ice-shell thickness?',
    inputData: 'Live boundary-depth profile scaled to thin, medium, and thick shell assumptions.',
    formula: 'Boundary depth profile is offset/scaled by shell-thickness scenario multipliers.',
    xMeaning: 'Along-track position in kilometers.',
    yMeaning: 'Depth below local surface in meters.',
    expected: 'All depths should be non-negative; thicker-shell scenarios should be deeper.',
    interpretation: 'Shell-thickness assumptions strongly affect the modeled boundary depth.',
    misleadingIf: 'Misleading if the three scenarios are presented as observed depths.'
  },
  'Boundary Uncertainty Band': {
    question: 'How wide is the possible range around the modeled boundary depth?',
    inputData: 'Mean boundary depth and the user-set boundary uncertainty.',
    formula: 'Lower and upper bounds are the mean boundary depth plus/minus the uncertainty term.',
    xMeaning: 'Along-track position in kilometers.',
    yMeaning: 'Depth below local surface in meters.',
    expected: 'Lower <= mean <= upper at each sample and all depths should be non-negative.',
    interpretation: 'The boundary should be read as a band, not a single exact line.',
    misleadingIf: 'Misleading if the band is explained as confidence from real observations.'
  },
  'Ocean Model vs No-Ocean Control': {
    question: 'Does the modeled boundary echo clear the threshold more strongly than a no-ocean control?',
    inputData: 'Ocean margin, no-ocean control margin, and detection threshold from the live receiver model.',
    formula: 'Margin equals signal strength minus detection threshold in dB.',
    xMeaning: 'Along-track position in kilometers.',
    yMeaning: 'Relative power or threshold margin in dB.',
    expected: 'The 0 dB threshold line should be present; positive margin is above threshold and negative is below.',
    interpretation: 'The ocean-model echo is meaningful only if it separates from the no-ocean control.',
    misleadingIf: 'Misleading if the margin sign is reversed or the threshold line is absent.'
  },
  'Radargram-Style Return Timing With Clutter': {
    question: 'When do clutter, shallow layers, lens echoes, and the boundary return in time?',
    inputData: 'Modeled layer depths and receiver timing conversions.',
    formula: 'Layer depth is converted to two-way in-ice travel time using the ice propagation speed.',
    xMeaning: 'Along-track position in kilometers.',
    yMeaning: 'Two-way delay in microseconds.',
    expected: 'Shallower clutter/layers should return earlier than deeper layers, with finite non-negative delays.',
    interpretation: 'Earlier internal echoes can compete with the boundary echo.',
    misleadingIf: 'Misleading if a return line is presented as uniquely ocean-like from timing alone.'
  },
  'Detectability Margin vs Threshold': {
    question: 'Do the lens and boundary echoes clear the simplified detection threshold?',
    inputData: 'Lens signal, ocean signal, and detection threshold from the live model.',
    formula: 'Margin equals echo signal minus detection threshold in dB.',
    xMeaning: 'Along-track position in kilometers.',
    yMeaning: 'Relative power or threshold margin in dB.',
    expected: 'The 0 dB threshold line should be present; positive means above threshold.',
    interpretation: 'If the lens margin rivals the boundary margin, strongest-return interpretation is ambiguous.',
    misleadingIf: 'Misleading if positive/negative margin meaning is reversed or if lens and ocean labels are swapped.'
  },
  'Reflection Strength by Material / Interface': {
    question: 'Which synthetic material/interface assumptions produce stronger modeled reflections?',
    inputData: 'Material/interface reflector-strength assumptions from the live model.',
    formula: 'Each category is assigned a relative dB reflector-strength value, adjusted by impurity and signal settings in v30.',
    xMeaning: 'Categorical material or interface name.',
    yMeaning: 'Relative reflector strength in dB.',
    expected: 'The chart should be a bar chart with categorical x-values and no detection-threshold claim.',
    interpretation: 'Internal contrasts can be strong enough to compete with a boundary return in the simplified model.',
    misleadingIf: 'Misleading if labeled as a threshold margin or drawn as a continuous along-track trend.'
  },
  'Cross-Instrument Evidence Score': {
    question: 'How much modeled support comes from radar and contextual evidence channels?',
    inputData: 'Synthetic support scores for radar, thermal, composition, and magnetic/plasma context.',
    formula: 'Each channel receives a bounded 0-100 support score from the browser scoring model.',
    xMeaning: 'Categorical instrument or evidence channel.',
    yMeaning: 'Support score in percent.',
    expected: 'The chart should be a categorical bar chart with values from 0 to 100.',
    interpretation: 'Radar should be read alongside other context, but these scores are illustrative.',
    misleadingIf: 'Misleading if presented as NASA-validated evidence or real observation probability.'
  },
  'Competing Echo Margins: Receiver Signal Strength': {
    question: 'Does the false internal layer beat the boundary echo at the receiver?',
    inputData: 'Surface clutter, false-layer, and ocean-boundary margins from the simplified receiver model.',
    formula: 'Each margin equals candidate signal minus detection threshold in dB.',
    xMeaning: 'Along-track position in kilometers.',
    yMeaning: 'Margin above threshold in dB.',
    expected: 'The 0 dB threshold should be present; the false/ocean ordering should match the receiver decision logic.',
    interpretation: 'A strong false layer can make a bright return ambiguous.',
    misleadingIf: 'Misleading if false-layer and ocean margins are swapped or the sign convention is reversed.'
  },
  'Picked Boundary Depth vs True Ocean Depth': {
    question: 'Does the receiver-selected boundary follow the true modeled boundary or a false layer?',
    inputData: 'True boundary depth, false-layer depth, and selected receiver depth.',
    formula: 'Receiver selected depth is chosen by the simplified receiver decision from candidate echo margins; ambiguous double returns use the midpoint between false layer and boundary.',
    xMeaning: 'Along-track position in kilometers.',
    yMeaning: 'Depth below local surface in meters.',
    expected: 'False-layer depth should be shallower than true boundary depth; selected depth should be either a candidate depth or the midpoint used for ambiguous double returns.',
    interpretation: 'A receiver can pick a shallower false layer when it is the stronger candidate.',
    misleadingIf: 'Misleading if selected depth is not tied to the receiver decision model or if ambiguous midpoint picks are described as a confident ocean selection.'
  },
  'Return Timing: False Layer Arrives Before Ocean': {
    question: 'Does the false internal layer arrive before the boundary echo?',
    inputData: 'False-layer and boundary depths converted to two-way in-ice delay.',
    formula: 'Two-way delay equals 2 times depth divided by ice propagation speed, converted to microseconds.',
    xMeaning: 'Along-track position in kilometers.',
    yMeaning: 'Two-way in-ice delay in microseconds.',
    expected: 'The false-layer delay should be lower than the boundary delay when the false layer is shallower.',
    interpretation: 'Arrival order can help show why false internal layers are plausible competitors.',
    misleadingIf: 'Misleading if the false-layer delay is not earlier than the boundary delay.'
  },
  'Depth Error If the Receiver Picks the Wrong Layer': {
    question: 'How wrong is the depth if the receiver picks the false layer instead of the boundary?',
    inputData: 'Selected receiver depth and true modeled boundary depth.',
    formula: 'Depth error equals selected depth minus true boundary depth.',
    xMeaning: 'Along-track position in kilometers.',
    yMeaning: 'Depth error in meters.',
    expected: 'A false-layer pick should produce a negative error because it is too shallow; 0 m means the boundary was picked correctly.',
    interpretation: 'Wrong picks can substantially underestimate boundary depth.',
    misleadingIf: 'Misleading if the sign is reversed or if negative error is described as too deep.'
  },
  'Satellite Receiver Decision Along Track': {
    question: 'Which simplified receiver decision is made at each along-track sample?',
    inputData: 'Candidate margins and receiver decision categories.',
    formula: 'Decision code maps the strongest/valid candidate into documented categories 0, 1, 2, or 3.',
    xMeaning: 'Along-track position in kilometers.',
    yMeaning: 'Receiver decision code.',
    expected: 'All codes must be integers from 0 to 3.',
    interpretation: 'The code sequence shows where the receiver would trust ocean, pick false, see clutter, or fail detection.',
    misleadingIf: 'Misleading if undocumented codes appear or code meanings are not explained nearby.'
  },
  'Receiver Outcome Share for This Flyby': {
    question: 'What share of samples fall into each receiver outcome category?',
    inputData: 'Counts of receiver decision categories along the current flyby.',
    formula: 'Each category count is divided by total samples and converted to percent.',
    xMeaning: 'Categorical receiver outcome.',
    yMeaning: 'Percent of along-track samples.',
    expected: 'Bars should be between 0 and 100 and sum to about 100 percent.',
    interpretation: 'This summarizes the receiver ambiguity pattern for the selected flyby.',
    misleadingIf: 'Misleading if shares do not sum to 100 percent or if outcome labels are mismatched.'
  },
  'Doppler-Inverted Look Angle vs Existing Geometry': {
    question: 'Does the Doppler-inverted look angle match the known geometry angle?',
    inputData: 'Doppler shift, spacecraft speed, radar frequency, and existing geometry angle.',
    formula: 'Look angle is inverted from Doppler using the same speed/frequency convention, then compared with geometry.',
    xMeaning: 'Along-track position in kilometers.',
    yMeaning: 'Look angle in degrees.',
    expected: 'Angles should stay finite and within plausible angular bounds.',
    interpretation: 'Doppler can help estimate look angle, but this is a controlled model demonstration.',
    misleadingIf: 'Misleading if Doppler inversion uses a different frequency or angle convention from the plotted geometry.'
  },
  'Raw Slant Depth vs Doppler-Corrected Ocean Depth': {
    question: 'Does Doppler angle correction move raw slant depth closer to true boundary depth?',
    inputData: 'Raw slant depth, corrected depth, true boundary depth, and inverted look angle.',
    formula: 'Corrected depth applies the angle correction to the raw slant-depth estimate.',
    xMeaning: 'Along-track position in kilometers.',
    yMeaning: 'Depth below local surface in meters.',
    expected: 'Corrected depth should have lower mean absolute error than raw slant depth in this controlled demo.',
    interpretation: 'Geometry correction can reduce slant-path depth bias in the synthetic model.',
    misleadingIf: 'Misleading if it claims correction helped when corrected error is not lower.'
  },
  'Depth Error Before and After Angle Correction': {
    question: 'How much does the angle correction reduce depth error?',
    inputData: 'Raw slant-depth error and corrected-depth error relative to the true boundary.',
    formula: 'Each error equals estimated depth minus true boundary depth.',
    xMeaning: 'Along-track position in kilometers.',
    yMeaning: 'Depth error in meters.',
    expected: 'Corrected mean absolute error should be lower than raw mean absolute error in this controlled demo.',
    interpretation: 'The correction reduces geometry-driven bias but does not validate real data.',
    misleadingIf: 'Misleading if the plotted corrected error is not actually smaller.'
  },
  'Corrected Layer Depths From Doppler Angle': {
    question: 'What layer depths result after applying the Doppler angle correction?',
    inputData: 'Layer depths and inverted/corrected look-angle geometry.',
    formula: 'Layer slant estimates are corrected back to depth below local surface.',
    xMeaning: 'Along-track position in kilometers.',
    yMeaning: 'Depth below local surface in meters.',
    expected: 'All corrected depths should be non-negative and maintain the expected layer order.',
    interpretation: 'The correction preserves relative layer structure while reducing geometry bias.',
    misleadingIf: 'Misleading if corrected layers are out of order or are described as measured Europa depths.'
  },
  'HF 9 MHz Mid-Shell Confidence vs Ambiguity': {
    question: 'How does the advanced scenario score compare confidence against ambiguity risk?',
    inputData: 'Scenario labels, dirty-ice level, clutter level, attenuation, pulse gain, and threshold settings.',
    formula: 'Scenario stress is converted into a bounded 0-100 confidence score and ambiguous/false percentage.',
    xMeaning: 'Categorical ice/clutter scenario.',
    yMeaning: 'Percent or 0-100 score.',
    expected: 'Both series should be bounded from 0 to 100 and drawn as bars.',
    interpretation: 'The chart is a synthetic scoring aid for ambiguity risk, not a calibrated probability.',
    misleadingIf: 'Misleading if called a NASA confidence estimate or if 0-1 shares are plotted on a 0-100 axis.'
  },
  'Pulse compression gain vs pulse length': {
    question: 'How does pulse length affect the simplified pulse-compression gain proxy?',
    inputData: 'Pulse length and window-loss settings.',
    formula: 'Gain equals 10log10(pulse length in us) plus window loss, with a VHF offset used for sensitivity comparison.',
    xMeaning: 'Pulse length in microseconds.',
    yMeaning: 'Relative gain in dB.',
    expected: 'Gain should increase monotonically with pulse length for the proxy curves.',
    interpretation: 'Longer pulse length raises the simplified sensitivity proxy.',
    misleadingIf: 'Misleading if treated as a full waveform processor or if selected setting is not tied to the control value.'
  },
  'Geometric spreading power dB': {
    question: 'How does geometric spreading affect received power along track?',
    inputData: 'Range/altitude geometry from the browser model.',
    formula: 'Power scales as a two-way geometric ratio, reported as 10log10((R0/R)^4) with reflectivity offsets.',
    xMeaning: 'Along-track position in kilometers.',
    yMeaning: 'Relative power in dB.',
    expected: 'Values should be finite dB powers and respond to altitude/range changes.',
    interpretation: 'Geometry affects power before material interpretation.',
    misleadingIf: 'Misleading if the power ratio is plotted as linear power or if amplitude and power log conventions are mixed.'
  },
  'Coherent Fresnel-zone gain': {
    question: 'How does along-track spacing and ice index affect the simplified coherent-gain proxy?',
    inputData: 'Along-track spacing, ice index, and extracted source chart sample positions.',
    formula: 'Coherent adjustment is a power-ratio proxy using spacing ratio and ice-index ratio in dB.',
    xMeaning: 'Along-track position in kilometers.',
    yMeaning: 'Relative coherent gain in dB.',
    expected: 'Values should stay finite and shift with spacing/index settings.',
    interpretation: 'This is an aperture/coherence sensitivity proxy, not a full aperture-synthesis model.',
    misleadingIf: 'Misleading if described as measured coherent processing gain.'
  },
  'Total VHF dB: constant vs frequency-dependent response': {
    question: 'How does a frequency-dependent reflectivity response change total VHF power?',
    inputData: 'Geometric power, coherent gain, pulse gain, attenuation, and frequency-response settings.',
    formula: 'Total VHF dB sums geometric power, coherent gain, pulse gain, attenuation penalty, and optional frequency response.',
    xMeaning: 'Along-track position in kilometers.',
    yMeaning: 'Relative total VHF power in dB.',
    expected: 'Both series should be finite; the frequency-dependent series should differ by the modeled response term.',
    interpretation: 'Frequency response is a sensitivity comparison, not an observation.',
    misleadingIf: 'Misleading if a single curve is presented as a validated VHF processor output.'
  },
  'HF 9 MHz Workbook-Depth Outcomes': {
    question: 'How do deep-boundary outcome shares change across HF scenario categories?',
    inputData: 'Scenario stress, dirty ice, clutter, signal setting, and attenuation setting.',
    formula: 'Clear, false-risk, and weak/no-deep shares are bounded and converted to percent.',
    xMeaning: 'Categorical scenario.',
    yMeaning: 'Percent share from 0 to 100.',
    expected: 'For each scenario, the shares should sum to about 100 percent.',
    interpretation: 'The chart compares outcome shares under synthetic HF scenario stress.',
    misleadingIf: 'Misleading if 0-1 shares are shown on a percent axis or if shares do not sum to 100.'
  },
  'VHF 60 MHz Shallow Clutter Stress Test': {
    question: 'How does shallow clutter stress split outcomes across VHF scenario categories?',
    inputData: 'Scenario stress, dirty ice level, surface clutter level, attenuation, and signal setting.',
    formula: 'Surface clutter, internal feature, outside-window, and weak/no-detection shares are bounded and converted to percent.',
    xMeaning: 'Categorical scenario.',
    yMeaning: 'Percent share from 0 to 100.',
    expected: 'For each scenario, the shares should sum to about 100 percent.',
    interpretation: 'The chart shows where shallow clutter or internal features dominate a simplified VHF scenario.',
    misleadingIf: 'Misleading if the bars are interpreted as real detection probabilities.'
  }
};

function absPath(relativePath) {
  return path.join(ROOT, relativePath);
}

function read(relativePath) {
  return fs.readFileSync(absPath(relativePath), 'utf8');
}

function md(value) {
  return String(value ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
}

function slug(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function round(value, digits = 3) {
  if (!Number.isFinite(value)) return value;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function loadSiteModels() {
  const context = { window: {} };
  context.window.window = context.window;
  vm.createContext(context);
  MODEL_FILES.forEach((file) => {
    vm.runInContext(read(file), context, { filename: file });
  });
  const v19Model = context.window.V19_LIVE_MODEL;
  const v30Model = context.window.V30_LIVE_MODEL;
  if (!v19Model || !v30Model) {
    throw new Error('Could not load V19_LIVE_MODEL and V30_LIVE_MODEL from docs/model.js');
  }
  const v19 = v19Model.compute({ ...v19Model.defaults });
  const v30 = v30Model.compute({ ...v30Model.defaults }, context.window.V30_RESULTS);
  return [
    {
      version: 'v19',
      sectionGroup: 'Baseline live model',
      sourceFile: 'docs/model.js + docs/data/v19-results.js',
      sourceDataObject: 'window.V19_LIVE_MODEL.compute(defaults).charts',
      charts: v19.charts
    },
    {
      version: 'v30',
      sectionGroup: 'Advanced sensitivity',
      sourceFile: 'docs/model.js + docs/data/v30-results.js',
      sourceDataObject: 'window.V30_LIVE_MODEL.compute(defaults, window.V30_RESULTS).charts',
      charts: v30.charts
    }
  ];
}

function pointY(point) {
  return Array.isArray(point) ? point[1] : undefined;
}

function pointX(point) {
  return Array.isArray(point) ? point[0] : undefined;
}

function numericYValues(chart, seriesName) {
  const series = seriesName ? chart.series.filter((item) => item.name === seriesName) : chart.series;
  return series.flatMap((item) => item.points.map(pointY)).filter((value) => Number.isFinite(value));
}

function seriesByName(chart, name) {
  return chart.series.find((series) => series.name === name);
}

function pointsBySeries(chart, name) {
  const series = seriesByName(chart, name);
  return series ? series.points : [];
}

function xValuesAreCategorical(chart) {
  return chart.series.some((series) => series.points.some((point) => typeof pointX(point) === 'string'));
}

function xValuesAreNumeric(chart) {
  return chart.series.some((series) => series.points.some((point) => typeof pointX(point) === 'number'));
}

function hasUnit(label) {
  const text = String(label || '');
  return /\([^)]+\)|%|percent|\bdB\b|\bHz\b|\bcode\b|\bScenario\b|\bInstrument\b|\bMaterial\b|\boutcome\b/i.test(text);
}

function chartUnits(chart) {
  const units = [];
  const labels = [chart.xLabel, chart.yLabel].join(' ');
  const parens = labels.match(/\(([^)]+)\)/g) || [];
  parens.forEach((item) => units.push(item.slice(1, -1)));
  if (/\bdB\b/i.test(labels)) units.push('dB');
  if (/\bHz\b/i.test(labels)) units.push('Hz');
  if (/%|percent/i.test(labels)) units.push('%');
  if (/scenario|instrument|material|outcome/i.test(labels)) units.push('category');
  return unique(units).join(', ') || 'label-defined';
}

function rangeSentence(chart) {
  const values = numericYValues(chart);
  if (!values.length) return 'No numeric y-values.';
  return `Y-values range from ${round(Math.min(...values))} to ${round(Math.max(...values))} ${chartUnits({ xLabel: '', yLabel: chart.yLabel })}.`;
}

function categoryTotals(chart) {
  const totals = new Map();
  chart.series.forEach((series) => {
    series.points.forEach((point) => {
      const x = String(pointX(point));
      const y = pointY(point);
      if (Number.isFinite(y)) totals.set(x, (totals.get(x) || 0) + y);
    });
  });
  return totals;
}

function seriesMeanAbsDifference(chart, estimateName, truthName) {
  const estimate = pointsBySeries(chart, estimateName);
  const truth = pointsBySeries(chart, truthName);
  const diffs = [];
  for (let index = 0; index < Math.min(estimate.length, truth.length); index += 1) {
    const a = pointY(estimate[index]);
    const b = pointY(truth[index]);
    if (Number.isFinite(a) && Number.isFinite(b)) diffs.push(Math.abs(a - b));
  }
  if (!diffs.length) return null;
  return diffs.reduce((sum, value) => sum + value, 0) / diffs.length;
}

function meanAbs(values) {
  const finite = values.filter((value) => Number.isFinite(value));
  if (!finite.length) return null;
  return finite.reduce((sum, value) => sum + Math.abs(value), 0) / finite.length;
}

function addIssue(issues, severity, message) {
  issues.push({ severity, message });
}

function allowsNullY(chart, series) {
  return chart.title === 'Radargram-Style Return Timing With Clutter' && series.name === 'Warm/briny lens return';
}

function requireSeries(chart, issues, names) {
  names.forEach((name) => {
    if (!seriesByName(chart, name)) addIssue(issues, 'FAIL', `Missing expected series "${name}".`);
  });
}

function requireAnySeries(chart, issues, names, description) {
  if (!names.some((name) => seriesByName(chart, name))) {
    addIssue(issues, 'FAIL', `Missing expected ${description || 'series'} (${names.join(' or ')}).`);
  }
}

function requireZeroThreshold(chart, issues) {
  const threshold = chart.series.find((series) => /0\s*dB|threshold/i.test(series.name));
  if (!threshold) {
    addIssue(issues, 'FAIL', 'Margin chart is missing a visible threshold/0 dB series.');
    return;
  }
  const bad = threshold.points.some((point) => Number.isFinite(pointY(point)) && Math.abs(pointY(point)) > 1e-9);
  if (bad) addIssue(issues, 'FAIL', 'Threshold series is not plotted at 0.');
}

function requirePercentBounds(chart, issues) {
  chart.series.forEach((series) => {
    series.points.forEach((point) => {
      const y = pointY(point);
      if (Number.isFinite(y) && (y < -0.001 || y > 100.001)) {
        addIssue(issues, 'FAIL', `${series.name} has percent/score value ${y}, outside 0-100.`);
      }
    });
  });
}

function requireCategorySum(chart, issues, tolerance = 0.75) {
  categoryTotals(chart).forEach((total, label) => {
    if (Math.abs(total - 100) > tolerance) {
      addIssue(issues, 'FAIL', `Category "${label}" sums to ${round(total)}%, not about 100%.`);
    }
  });
}

function requireSingleSeriesSum(chart, issues, tolerance = 0.75) {
  const total = numericYValues(chart).reduce((sum, value) => sum + value, 0);
  if (Math.abs(total - 100) > tolerance) {
    addIssue(issues, 'FAIL', `Outcome bars sum to ${round(total)}%, not about 100%.`);
  }
}

function requireMonotonicIncreasing(chart, issues, seriesNames) {
  seriesNames.forEach((name) => {
    const points = pointsBySeries(chart, name);
    for (let index = 1; index < points.length; index += 1) {
      const previous = pointY(points[index - 1]);
      const current = pointY(points[index]);
      if (Number.isFinite(previous) && Number.isFinite(current) && current < previous - 1e-9) {
        addIssue(issues, 'FAIL', `${name} is not monotonic increasing.`);
        return;
      }
    }
  });
}

function auditGeneric(chart, context, seenIds) {
  const issues = [];
  ['id', 'title', 'section', 'sourceSheet', 'xLabel', 'yLabel'].forEach((field) => {
    if (!chart[field]) addIssue(issues, 'FAIL', `Missing chart metadata field "${field}".`);
  });
  if (seenIds.has(chart.id)) addIssue(issues, 'FAIL', `Duplicate chart id "${chart.id}".`);
  seenIds.add(chart.id);

  if (!Array.isArray(chart.series) || !chart.series.length) {
    addIssue(issues, 'FAIL', 'Chart has no plotted series.');
    return issues;
  }

  chart.series.forEach((series) => {
    if (!series.name) addIssue(issues, 'FAIL', 'A plotted series is missing a legend name.');
    if (!Array.isArray(series.points) || !series.points.length) {
      addIssue(issues, 'FAIL', `Series "${series.name || '(unnamed)'}" has no points.`);
      return;
    }
    series.points.forEach((point, index) => {
      if (!Array.isArray(point) || point.length < 2) {
        addIssue(issues, 'FAIL', `Series "${series.name}" point ${index} is not an [x, y] pair.`);
        return;
      }
      const x = pointX(point);
      const y = pointY(point);
      if (typeof x === 'number' && !Number.isFinite(x)) addIssue(issues, 'FAIL', `Series "${series.name}" has non-finite x-value.`);
      if (typeof x !== 'number' && typeof x !== 'string') addIssue(issues, 'FAIL', `Series "${series.name}" has invalid x-value type.`);
      if (!Number.isFinite(y) && !allowsNullY(chart, series)) {
        addIssue(issues, 'FAIL', `Series "${series.name}" has non-finite y-value.`);
      }
    });
    if (allowsNullY(chart, series)) {
      const finiteCount = series.points.filter((point) => Number.isFinite(pointY(point))).length;
      if (!finiteCount) addIssue(issues, 'FAIL', `Series "${series.name}" uses null gaps but has no finite plotted values.`);
    }
  });

  if (xValuesAreCategorical(chart) && chart.kind !== 'bar') {
    addIssue(issues, 'FAIL', 'Categorical x-values should be drawn as bars, not a continuous line.');
  }
  if (xValuesAreNumeric(chart) && !hasUnit(chart.xLabel)) {
    addIssue(issues, 'FAIL', 'Numeric x-axis is missing units or a documented code label.');
  }
  if (!hasUnit(chart.yLabel)) {
    addIssue(issues, 'FAIL', 'Y-axis is missing units or a documented code label.');
  }
  if (/percent|%|0-100/i.test(`${chart.title} ${chart.yLabel}`)) {
    requirePercentBounds(chart, issues);
  }
  if (/delay/i.test(chart.yLabel)) {
    const negative = numericYValues(chart).filter((value) => value < -0.001);
    if (negative.length) addIssue(issues, 'FAIL', 'Delay chart contains negative delay values.');
  }
  if (/depth/i.test(chart.yLabel) && !/error/i.test(chart.yLabel)) {
    const negative = numericYValues(chart).filter((value) => value < -0.001);
    if (negative.length) addIssue(issues, 'FAIL', 'Depth chart contains impossible negative depths.');
  }
  if (context.version === 'v30' && /Workbook|Confidence|Clutter/i.test(chart.title)) {
    if (!/not an independent mission processor|proxy|score|percent|share/i.test(chart.note || '')) {
      addIssue(issues, 'CHECK', 'Advanced synthetic chart should carry a non-mission caveat in the note.');
    }
  }
  return issues;
}

function auditTargeted(chart, issues) {
  const title = chart.title;

  if (title === 'Surface Height: Off-Nadir Target vs Nadir Reference Terrain') {
    requireSeries(chart, issues, ['Off-nadir target terrain']);
    requireAnySeries(chart, issues, ['Nadir reference terrain', 'Nadir terrain'], 'nadir terrain series');
    if (!/Surface elevation \(m\)/.test(chart.yLabel)) addIssue(issues, 'FAIL', 'Surface-height chart has the wrong y-axis label.');
  }

  if (title === 'Apparent Depth: Spacecraft Motion Distortion by Run') {
    if (!/Apparent depth \(m\)/.test(chart.yLabel)) addIssue(issues, 'FAIL', 'Apparent-depth chart has the wrong y-axis label.');
  }

  if (title === 'Terrain Baseline: Surface-Height Equivalent Error' || title === 'Terrain Baseline: Total Radar Elevation Error') {
    if (!/Surface-height equivalent error \(m\)/.test(chart.yLabel)) addIssue(issues, 'FAIL', 'Terrain-error chart must state surface-height equivalent error in meters.');
  }

  if (title === 'Doppler: Flat Geometry vs Topography') {
    if (!/Doppler shift \(Hz\)/.test(chart.yLabel)) addIssue(issues, 'FAIL', 'Doppler chart must use Hz on the y-axis.');
  }

  if (/Delay/.test(title) || /Return Timing/.test(title) || title === 'Radargram-Style Return Timing With Clutter') {
    if (!/us/.test(chart.yLabel)) addIssue(issues, 'FAIL', 'Delay/timing chart must use microseconds on the y-axis.');
  }

  if (title === 'Subsurface Truth Model: Icy Layers') {
    requireSeries(chart, issues, ['Icy top surface', 'Shallow ice layer', 'Warm/briny lens', 'Ice-ocean boundary']);
    if (!/Elevation relative to model reference \(m\)/.test(chart.yLabel)) {
      addIssue(issues, 'FAIL', 'Icy-layer chart must be labeled as elevation relative to model reference.');
    }
    const surface = pointsBySeries(chart, 'Icy top surface');
    const shallow = pointsBySeries(chart, 'Shallow ice layer');
    const lens = pointsBySeries(chart, 'Warm/briny lens');
    const ocean = pointsBySeries(chart, 'Ice-ocean boundary');
    for (let index = 0; index < Math.min(surface.length, shallow.length, lens.length, ocean.length); index += 1) {
      const order = [pointY(surface[index]), pointY(shallow[index]), pointY(lens[index]), pointY(ocean[index])];
      if (order.every(Number.isFinite) && !(order[0] > order[1] && order[1] > order[2] && order[2] > order[3])) {
        addIssue(issues, 'FAIL', 'Icy-layer elevation order is not surface > shallow > lens > boundary.');
        break;
      }
    }
  }

  if (title === 'Scenario Comparison: Thin / Medium / Thick Ice') {
    requireSeries(chart, issues, ['Thin shell', 'Medium shell', 'Thick shell']);
    const thin = pointsBySeries(chart, 'Thin shell');
    const medium = pointsBySeries(chart, 'Medium shell');
    const thick = pointsBySeries(chart, 'Thick shell');
    for (let index = 0; index < Math.min(thin.length, medium.length, thick.length); index += 1) {
      if (!(pointY(thin[index]) <= pointY(medium[index]) && pointY(medium[index]) <= pointY(thick[index]))) {
        addIssue(issues, 'FAIL', 'Thin/medium/thick depths are not ordered shallow to deep.');
        break;
      }
    }
  }

  if (title === 'Boundary Uncertainty Band') {
    requireSeries(chart, issues, ['Lower bound', 'Mean boundary', 'Upper bound']);
    const lower = pointsBySeries(chart, 'Lower bound');
    const mean = pointsBySeries(chart, 'Mean boundary');
    const upper = pointsBySeries(chart, 'Upper bound');
    for (let index = 0; index < Math.min(lower.length, mean.length, upper.length); index += 1) {
      if (!(pointY(lower[index]) <= pointY(mean[index]) && pointY(mean[index]) <= pointY(upper[index]))) {
        addIssue(issues, 'FAIL', 'Boundary uncertainty band is not ordered lower <= mean <= upper.');
        break;
      }
    }
  }

  if (title === 'Ocean Model vs No-Ocean Control') {
    requireSeries(chart, issues, ['Ocean model margin', 'No-ocean control margin']);
    requireZeroThreshold(chart, issues);
    const ocean = numericYValues(chart, 'Ocean model margin');
    const control = numericYValues(chart, 'No-ocean control margin');
    const pairs = Math.min(ocean.length, control.length);
    let oceanBeats = 0;
    for (let index = 0; index < pairs; index += 1) if (ocean[index] > control[index]) oceanBeats += 1;
    if (pairs && oceanBeats / pairs < 0.75) addIssue(issues, 'CHECK', 'Ocean margin does not clearly beat no-ocean control for most samples.');
  }

  if (title === 'Detectability Margin vs Threshold') {
    requireSeries(chart, issues, ['Lens echo margin', 'Ocean echo margin']);
    requireZeroThreshold(chart, issues);
  }

  if (title === 'Reflection Strength by Material / Interface') {
    if (chart.kind !== 'bar') addIssue(issues, 'FAIL', 'Material/interface chart must be a bar chart.');
    if (!/Material \/ interface/.test(chart.xLabel)) addIssue(issues, 'FAIL', 'Material/interface chart x-axis must be categorical material/interface labels.');
    if (!/Relative reflector strength \(dB\)/.test(chart.yLabel)) addIssue(issues, 'FAIL', 'Material/interface chart y-axis must say relative reflector strength, not margin.');
  }

  if (title === 'Cross-Instrument Evidence Score') {
    if (chart.kind !== 'bar') addIssue(issues, 'FAIL', 'Evidence chart must be a bar chart.');
    if (!/Instrument/.test(chart.xLabel)) addIssue(issues, 'FAIL', 'Evidence chart x-axis must be categorical instrument labels.');
    requirePercentBounds(chart, issues);
  }

  if (title === 'Competing Echo Margins: Receiver Signal Strength') {
    requireSeries(chart, issues, ['Surface clutter margin', 'False layer margin', 'Ocean boundary margin']);
    requireZeroThreshold(chart, issues);
  }

  if (title === 'Picked Boundary Depth vs True Ocean Depth') {
    requireSeries(chart, issues, ['True ocean boundary', 'False layer depth', 'Receiver selected boundary']);
    const truth = pointsBySeries(chart, 'True ocean boundary');
    const falseLayer = pointsBySeries(chart, 'False layer depth');
    const selected = pointsBySeries(chart, 'Receiver selected boundary');
    for (let index = 0; index < Math.min(truth.length, falseLayer.length, selected.length); index += 1) {
      const t = pointY(truth[index]);
      const f = pointY(falseLayer[index]);
      const s = pointY(selected[index]);
      if (Number.isFinite(t) && Number.isFinite(f) && !(f < t)) {
        addIssue(issues, 'FAIL', 'False-layer depth is not shallower than true boundary depth.');
        break;
      }
      if (Number.isFinite(s) && Number.isFinite(t) && Number.isFinite(f)) {
        const midpoint = (t + f) / 2;
        const matchesDecisionDepth = Math.abs(s - t) < 1e-6 || Math.abs(s - f) < 1e-6 || Math.abs(s - midpoint) < 1e-6;
        if (!matchesDecisionDepth) {
          addIssue(issues, 'FAIL', 'Receiver selected depth is not a candidate depth or the documented ambiguous midpoint.');
          break;
        }
      }
    }
  }

  if (title === 'Return Timing: False Layer Arrives Before Ocean') {
    requireSeries(chart, issues, ['False layer return', 'Ocean boundary return']);
    const falseDelay = pointsBySeries(chart, 'False layer return');
    const oceanDelay = pointsBySeries(chart, 'Ocean boundary return');
    for (let index = 0; index < Math.min(falseDelay.length, oceanDelay.length); index += 1) {
      if (!(pointY(falseDelay[index]) < pointY(oceanDelay[index]))) {
        addIssue(issues, 'FAIL', 'False-layer delay is not earlier than ocean-boundary delay.');
        break;
      }
    }
  }

  if (title === 'Depth Error If the Receiver Picks the Wrong Layer') {
    requireSeries(chart, issues, ['Selected minus true ocean', 'No error line']);
    const errors = numericYValues(chart, 'Selected minus true ocean');
    if (errors.some((value) => value > 0.001)) addIssue(issues, 'FAIL', 'Wrong-layer depth error should not be positive for a shallower false-layer pick.');
  }

  if (title === 'Satellite Receiver Decision Along Track') {
    const codes = numericYValues(chart);
    if (codes.some((value) => !Number.isInteger(value) || value < 0 || value > 3)) {
      addIssue(issues, 'FAIL', 'Receiver decision code must be an integer from 0 to 3.');
    }
  }

  if (title === 'Receiver Outcome Share for This Flyby') {
    requireSingleSeriesSum(chart, issues);
    requirePercentBounds(chart, issues);
  }

  if (title === 'Doppler-Inverted Look Angle vs Existing Geometry') {
    const angles = numericYValues(chart);
    if (angles.some((value) => value < -90 || value > 90)) addIssue(issues, 'FAIL', 'Look-angle values should stay within -90 to 90 degrees.');
  }

  if (title === 'Raw Slant Depth vs Doppler-Corrected Ocean Depth') {
    requireSeries(chart, issues, ['Raw slant depth from echo delay', 'Doppler-corrected depth estimate', 'True simulated ocean depth']);
    const rawError = seriesMeanAbsDifference(chart, 'Raw slant depth from echo delay', 'True simulated ocean depth');
    const correctedError = seriesMeanAbsDifference(chart, 'Doppler-corrected depth estimate', 'True simulated ocean depth');
    if (!(Number.isFinite(rawError) && Number.isFinite(correctedError) && correctedError < rawError)) {
      addIssue(issues, 'FAIL', 'Doppler-corrected depth is not closer to true boundary than raw slant depth.');
    }
  }

  if (title === 'Depth Error Before and After Angle Correction') {
    requireSeries(chart, issues, ['Uncorrected slant-depth error', 'Corrected depth residual']);
    const raw = meanAbs(numericYValues(chart, 'Uncorrected slant-depth error'));
    const corrected = meanAbs(numericYValues(chart, 'Corrected depth residual'));
    if (!(Number.isFinite(raw) && Number.isFinite(corrected) && corrected < raw)) {
      addIssue(issues, 'FAIL', 'Corrected depth error is not lower than raw depth error.');
    }
  }

  if (title === 'Corrected Layer Depths From Doppler Angle') {
    requireSeries(chart, issues, ['Corrected upper-layer depth', 'Corrected briny lens depth', 'Corrected ocean boundary depth']);
    const shallow = pointsBySeries(chart, 'Corrected upper-layer depth');
    const lens = pointsBySeries(chart, 'Corrected briny lens depth');
    const ocean = pointsBySeries(chart, 'Corrected ocean boundary depth');
    for (let index = 0; index < Math.min(shallow.length, lens.length, ocean.length); index += 1) {
      if (!(pointY(shallow[index]) < pointY(lens[index]) && pointY(lens[index]) < pointY(ocean[index]))) {
        addIssue(issues, 'FAIL', 'Corrected layer depths are not ordered shallow < lens < boundary.');
        break;
      }
    }
  }

  if (title === 'HF 9 MHz Mid-Shell Confidence vs Ambiguity') {
    if (chart.kind !== 'bar') addIssue(issues, 'FAIL', 'Confidence/ambiguity chart should be categorical bars.');
    requirePercentBounds(chart, issues);
    if (!/score|percent/i.test(chart.yLabel)) addIssue(issues, 'FAIL', 'Confidence/ambiguity y-axis must say score or percent.');
  }

  if (title === 'Pulse compression gain vs pulse length') {
    requireSeries(chart, issues, ['HF pulse gain', 'VHF pulse gain']);
    requireMonotonicIncreasing(chart, issues, ['HF pulse gain', 'VHF pulse gain']);
  }

  if (title === 'Geometric spreading power dB' || title === 'Coherent Fresnel-zone gain' || title === 'Total VHF dB: constant vs frequency-dependent response') {
    if (!/\bdB\b/.test(chart.yLabel)) addIssue(issues, 'FAIL', 'Power/gain chart must use dB units.');
  }

  if (title === 'HF 9 MHz Workbook-Depth Outcomes' || title === 'VHF 60 MHz Shallow Clutter Stress Test') {
    if (chart.kind !== 'bar') addIssue(issues, 'FAIL', 'Outcome-share chart should use bars for categorical scenarios.');
    requirePercentBounds(chart, issues);
    requireCategorySum(chart, issues);
  }
}

function statusFor(issues) {
  if (issues.some((issue) => issue.severity === 'FAIL')) return 'FAIL';
  if (issues.some((issue) => issue.severity === 'CHECK')) return 'CHECK';
  return 'PASS';
}

function buildRecords(modelSets) {
  const seenIds = new Set();
  const records = [];
  modelSets.forEach((set) => {
    set.charts.forEach((chart, index) => {
      const contract = CONTRACTS[chart.title];
      const issues = auditGeneric(chart, set, seenIds);
      if (!contract) addIssue(issues, 'FAIL', 'No chart contract is defined for this title.');
      auditTargeted(chart, issues);
      const status = statusFor(issues);
      records.push({
        number: records.length + 1,
        index: index + 1,
        version: set.version,
        sectionGroup: set.sectionGroup,
        sourceFile: set.sourceFile,
        sourceDataObject: set.sourceDataObject,
        chart,
        contract,
        issues,
        status
      });
    });
  });
  return records;
}

function inspectWorkbook() {
  const relativePath = 'docs/assets/v30_all_dynamic_graphs.xlsx';
  const filePath = absPath(relativePath);
  if (!fs.existsSync(filePath)) {
    return {
      exists: false,
      summary: 'Workbook asset not present in this checkout.'
    };
  }
  const stat = fs.statSync(filePath);
  const buffer = fs.readFileSync(filePath);
  const entries = [];
  for (let offset = 0; offset < buffer.length - 46; offset += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) continue;
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > buffer.length) break;
    entries.push(buffer.slice(nameStart, nameEnd).toString('utf8'));
    offset = nameEnd + extraLength + commentLength - 1;
  }
  const sheets = entries.filter((entry) => /^xl\/worksheets\/sheet\d+\.xml$/.test(entry)).length;
  const charts = entries.filter((entry) => /^xl\/charts\/chart\d+\.xml$/.test(entry)).length;
  return {
    exists: true,
    summary: `${relativePath} exists (${Math.round(stat.size / 1024)} KB) with ${sheets} worksheet XML file(s) and ${charts} embedded chart XML file(s). The website audit validates the extracted/browser chart objects rather than recalculating the workbook.`
  };
}

function counts(records) {
  return {
    total: records.length,
    pass: records.filter((record) => record.status === 'PASS').length,
    check: records.filter((record) => record.status === 'CHECK').length,
    fail: records.filter((record) => record.status === 'FAIL').length
  };
}

function issueText(record) {
  if (!record.issues.length) return 'None.';
  return record.issues.map((issue) => `${issue.severity}: ${issue.message}`).join(' ');
}

function seriesNames(chart) {
  return chart.series.map((series) => series.name).join('; ');
}

function actualShows(record) {
  const chart = record.chart;
  return `It renders ${chart.series.length} series (${seriesNames(chart)}) against ${chart.xLabel} and ${chart.yLabel}. ${rangeSentence(chart)}`;
}

function buildReport(records, workbookInfo) {
  const c = counts(records);
  const lines = [];
  lines.push('# Graph Validation Report');
  lines.push('');
  lines.push(`Generated: ${TODAY}`);
  lines.push('');
  lines.push('This audit treats the site as an illustrative synthetic radar sensitivity model. It does not claim NASA mission validation, real Europa detection, or a calibrated flight processor.');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Rendered graph instances found: ${c.total}`);
  lines.push(`- Passed after fixes: ${c.pass}`);
  lines.push(`- Need human review: ${c.check}`);
  lines.push(`- Failed after fixes: ${c.fail}`);
  lines.push(`- Fixed misleading chart-title issues documented here: ${FIX_LOG.length}`);
  lines.push('');
  lines.push('## Sources Inspected');
  lines.push('');
  SOURCE_FILES.forEach((file) => {
    lines.push(`- ${file}: ${fs.existsSync(absPath(file)) ? 'present' : 'missing'}`);
  });
  lines.push('');
  lines.push('## Workbook Asset');
  lines.push('');
  lines.push(workbookInfo.summary);
  lines.push('');
  lines.push('## Fixes Made During This Audit');
  lines.push('');
  lines.push('| Graph | Affected instances | Mistake before fix | Fix |');
  lines.push('|---|---|---|---|');
  FIX_LOG.forEach((item) => {
    lines.push(`| ${md(item.title)} | ${md(item.affected)} | ${md(item.mistake)} | ${md(item.fix)} |`);
  });
  lines.push('');
  lines.push('## Complete Graph Inventory');
  lines.push('');
  lines.push('| # | Status | Version | Section/tab | Graph title | Chart ID/render object | Source file | Source data object | X-axis variable | Y-axis variable | Plotted series | Units | Formula used | What the graph claims to show | What the graph actually shows | Notes |');
  lines.push('|---:|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  records.forEach((record) => {
    const chart = record.chart;
    const contract = record.contract || {};
    lines.push([
      record.number,
      record.status,
      record.version,
      chart.section || record.sectionGroup,
      chart.title,
      chart.id,
      record.sourceFile,
      record.sourceDataObject,
      contract.xMeaning || chart.xLabel,
      contract.yMeaning || chart.yLabel,
      seriesNames(chart),
      chartUnits(chart),
      contract.formula || 'No contract formula defined.',
      contract.interpretation || 'No claim contract defined.',
      actualShows(record),
      issueText(record)
    ].map(md).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  });
  lines.push('');
  lines.push('## Chart Contracts');
  lines.push('');
  Object.keys(CONTRACTS).sort().forEach((title) => {
    const contract = CONTRACTS[title];
    const matching = records.filter((record) => record.chart.title === title);
    lines.push(`### ${title}`);
    lines.push('');
    lines.push(`- Status by rendered instance: ${matching.map((record) => `${record.version} ${record.status}`).join(', ') || 'not rendered'}`);
    lines.push(`- Research question: ${contract.question}`);
    lines.push(`- Input data: ${contract.inputData}`);
    lines.push(`- Formula: ${contract.formula}`);
    lines.push(`- Axis meaning: x = ${contract.xMeaning}; y = ${contract.yMeaning}`);
    lines.push(`- Expected behavior: ${contract.expected}`);
    lines.push(`- Interpretation: ${contract.interpretation}`);
    lines.push(`- What would make it misleading: ${contract.misleadingIf}`);
    if (matching.length) {
      const issues = unique(matching.flatMap((record) => record.issues.map((issue) => `${issue.severity}: ${issue.message}`)));
      lines.push(`- Audit result: ${issues.length ? issues.join(' ') : 'No issues after fixes.'}`);
    }
    lines.push('');
  });
  lines.push('## Validation Checks Implemented');
  lines.push('');
  [
    'Every rendered chart must have title, id, section, source sheet, x-label, y-label, legend names, and non-empty data.',
    'All x/y points must be finite except categorical x-label strings; no NaN, Infinity, or null y-values are allowed.',
    'Categorical charts must render as bars and must use categorical x-axis labels.',
    'Numeric axes must expose units or a documented code label.',
    'Percent and 0-100 score charts must stay within 0-100.',
    'Outcome-share charts must sum to about 100 percent by category or by single-series outcome total.',
    'Delay charts must use microseconds and may not contain negative delays.',
    'Depth charts may not contain negative depths unless the chart is explicitly a depth-error chart.',
    'Margin charts must include a visible 0 dB threshold where the interpretation depends on threshold crossing.',
    'False-layer timing must arrive before the ocean timing when the false layer is shallower.',
    'Receiver decision codes must be documented integers from 0 to 3.',
    'Doppler-corrected depth/error charts must actually improve mean absolute error over raw slant depth in the controlled demo.',
    'Known previous label mistakes are checked directly: icy-layer elevation label, material/interface strength label, categorical x-axis labels, and v30 terrain-error units.'
  ].forEach((line) => lines.push(`- ${line}`));
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function buildSpeakerNotes(records) {
  const lines = [];
  lines.push('# Graph Speaker Notes');
  lines.push('');
  lines.push(`Generated: ${TODAY}`);
  lines.push('');
  lines.push('Use these notes with one caveat up front: this project is an illustrative synthetic radar sensitivity model, not a mission-validated NASA processor and not proof of Europa structure.');
  lines.push('');
  records.forEach((record) => {
    const chart = record.chart;
    const contract = record.contract || {};
    lines.push(`## ${record.number}. ${record.version.toUpperCase()} - ${chart.title}`);
    lines.push('');
    lines.push(`- Status: ${record.status}${record.issues.length ? ` (${issueText(record)})` : ' (passed deterministic audit checks).'}`);
    lines.push(`- What it is showing: ${contract.interpretation || actualShows(record)}`);
    lines.push(`- How to read the x-axis: ${contract.xMeaning || chart.xLabel}`);
    lines.push(`- How to read the y-axis: ${contract.yMeaning || chart.yLabel}`);
    lines.push(`- What each line/bar means: ${seriesNames(chart)}.`);
    lines.push(`- Main takeaway: ${contract.expected || rangeSentence(chart)}`);
    lines.push(`- How to explain it out loud: ${contract.question || chart.title} ${actualShows(record)}`);
    lines.push(`- Why it matters: ${contract.interpretation || 'It helps check whether the plotted data supports the dashboard explanation.'}`);
    lines.push(`- What not to overclaim: ${contract.misleadingIf || 'Do not present the synthetic model output as mission-validated evidence.'} Also do not say the graph proves anything about Europa.`);
    lines.push('');
  });
  return `${lines.join('\n')}\n`;
}

function main() {
  const modelSets = loadSiteModels();
  const records = buildRecords(modelSets);
  const workbookInfo = inspectWorkbook();
  const report = buildReport(records, workbookInfo);
  const speakerNotes = buildSpeakerNotes(records);

  fs.writeFileSync(absPath('GRAPH_VALIDATION_REPORT.md'), report, 'utf8');
  fs.writeFileSync(absPath('GRAPH_SPEAKER_NOTES.md'), speakerNotes, 'utf8');

  records.forEach((record) => {
    console.log(`${record.status} ${record.version} ${record.chart.id} - ${record.chart.title}`);
    record.issues.forEach((issue) => console.log(`  ${issue.severity}: ${issue.message}`));
  });
  const c = counts(records);
  console.log('');
  console.log(`Summary: ${c.total} graphs, ${c.pass} PASS, ${c.check} CHECK, ${c.fail} FAIL.`);
  console.log('Wrote GRAPH_VALIDATION_REPORT.md and GRAPH_SPEAKER_NOTES.md.');

  if (c.fail > 0) process.exitCode = 1;
}

main();
