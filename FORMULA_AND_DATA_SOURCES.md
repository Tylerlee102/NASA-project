# Formula And Data Sources

This file documents where the Europa radar dashboard formulas and plotted data come from. The model is an illustrative sensitivity model, not a NASA flight processor, not a calibrated REASON pipeline, and not a detection of real Europa layers.

## Data Artifacts

| ID | Artifact | What it contains | Used by |
| --- | --- | --- | --- |
| D1 | `docs/assets/v19.xlsx` | Baseline workbook artifact for the v19 geometry, topography, subsurface, false-layer, and Doppler correction model. | Download link and extracted baseline data. |
| D2 | `docs/data/v19-results.js` | Static browser data extracted from `v19.xlsx`; includes source metadata, summary rows, inputs, formula guides, and chart series. | `docs/app.js`, `docs/model.js`, graph audit. |
| D3 | `docs/assets/v30_all_dynamic_graphs.xlsx` | Expanded v30 workbook with advanced dirty-ice, signal, ambiguity, and graph-gallery outputs. | Download link and extracted advanced data. |
| D4 | `docs/data/v30-results.js` | Static browser data extracted from `v30_all_dynamic_graphs.xlsx`; includes source metadata, assumptions, risk rows, signal assumptions, and chart series. | `docs/app.js`, `docs/model.js`, graph audit. |
| D5 | `docs/model.js` | Live browser formulas that recompute v19 and v30 chart data when controls change. | Interactive model and charts. |
| D6 | `scripts/audit_graph_meaning.js` | Chart-contract audit. It checks chart labels, data ranges, expected series, units, formula notes, and regenerates the validation reports. | `GRAPH_VALIDATION_REPORT.md`, `GRAPH_SPEAKER_NOTES.md`. |

## External Reference Basis

| ID | Source | Used for |
| --- | --- | --- |
| S1 | NASA REASON instrument page: https://science.nasa.gov/mission/europa-clipper/spacecraft-instruments-reason/ | Project context for ice-penetrating radar, round-trip time delay, depth inference from radio propagation through material, and REASON studying Europa ice structure to about 30 km. |
| S2 | NASA Europa Clipper instruments page: https://science.nasa.gov/mission/europa-clipper/spacecraft-instruments/ | Mission context for REASON, E-THEMIS, MISE, ECM, PIMS, and the idea that multiple instruments should be interpreted together. |
| S3 | JPL Solar System Dynamics planetary satellite physical parameters: https://ssd.jpl.nasa.gov/sats/phys_par/ | Europa mean radius of 1560.80 km, used as the default spherical-geometry radius. |
| S4 | NIST/CODATA fundamental constants: https://physics.nist.gov/constants | Speed of light in vacuum, `c = 299792458 m/s`, used in all delay and range conversions. |
| S5 | Standard monostatic radar equation, e.g. Skolnik, *Radar Handbook*, and Balanis, *Advanced Engineering Electromagnetics*. | Two-way geometric spreading and the `R^-4` received-power dependence used in the v30 geometric-spreading sensitivity term. |
| S6 | Standard pulse-compression radar relationship. | Pulse-compression gain proportional to the time-bandwidth product, implemented as `10*log10(pulse_length * bandwidth) + window_loss`. |
| S7 | Standard Fresnel-zone wave-propagation geometry. | First-Fresnel-zone radius/diameter and coherent-look count used as a simplified aperture/coherence proxy. |
| S8 | Standard signal-processing windowing practice. | Hamming weighting for the v30 windowed chirp-frequency response. |

## Core Formula Index

| Formula area | Formula as implemented | Data inputs | Local source | Reference/provenance |
| --- | --- | --- | --- | --- |
| Along-track sample grid | `x = xMin + i*(xMax - xMin)/(rowCount - 1)` for 241 rows. | `xMin`, `xMax`, `rowCount`. | D5, `computeModelRows`. | Project sampling choice. |
| Parabolic altitude path | `z(x) = z0 + deltaZEdge*(x/xEdge)^2`. | `z0`, `deltaZEdge`, `xEdge`, `x`. | D5, `computeModelRows`; D2 formula guide. | Project flyby-shape assumption for comparing scenarios. |
| Europa surface central angle | `theta = sqrt(x^2 + y^2) / europaRadius`. | Along-track `x`, side offset `y`, Europa radius. | D5, `slantRange`; D2 formula guide. | S3 for Europa radius; spherical geometry. |
| Spherical slant range | `R = sqrt(spacecraftRadius^2 + targetRadius^2 - 2*spacecraftRadius*targetRadius*cos(theta))`. | Europa radius, altitude, target height, central angle. | D5, `slantRange`; D2 formula guide. | Spherical law of cosines; S3 for radius. |
| Nadir range | `R_nadir = z`; with topography, `R_nadir_topo = z - h_nadir/1000`. | Altitude, nadir terrain height. | D5, `computeModelRows`; D2 formula guide. | Project geometry assumption. |
| Extra path length | `Delta_R = (R_off - R_nadir)*1000`. | Off-nadir range, nadir range. | D5, `computeModelRows`; D2 formula guide. | Radar path geometry. |
| Apparent in-ice depth | `d_app = Delta_R / n`. | Extra path length, ice refractive index. | D5, `computeModelRows`, `scenarioRows`; D2 formula guide. | S1 for radar using propagation speed in material; `n` is a model input. |
| Two-way delay in vacuum/free path | `delay_us = 2*path_m/c*1e6`. | Path length, speed of light. | D5, `delayUsFromPathM`; D2 formula guide. | S1, S4. |
| Two-way delay in ice | `delay_us = 2*n*depth_m/c*1e6`. | Depth, ice refractive index, speed of light. | D5, `delayUsInIce`, `computeSubsurface`; D2 formula guide. | S1, S4; `n` is a project/default ice propagation parameter. |
| Look angle | `look_angle = atan(horizontal/z)` in degrees. | Horizontal offset, altitude. | D5, `computeModelRows`; D2 formula guide. | Right-triangle geometry. |
| Topographic look angle | `topoLookAngle = atan(horizontal/(z - h_target/1000))` in degrees. | Horizontal offset, altitude, target height. | D5, `computeModelRows`. | Project terrain-adjusted geometry assumption. |
| Interferometric phase proxy | `phase_deg = deg((2*pi/lambdaVhf)*baseline*sin(theta))`. | Wavelength, interferometer baseline, look angle. | D5, `computeModelRows`; D2 formula guide. | Standard phase path-difference relationship; used here as a simplified proxy. |
| Range rate | `dR/dt` is approximated from adjacent off-nadir ranges and multiplied by spacecraft speed. | Adjacent slant ranges, along-track step, speed. | D5, `computeModelRows`; D2 formula guide. | Numerical derivative of range over time. |
| Two-way Doppler shift | `fD = -2*rangeRate/lambda`. | Range rate, radar wavelength. | D5, `computeModelRows`; D2 formula guide. | Standard monostatic radar Doppler relationship. |
| Simple PRF sampling floor | `PRF_min = 2*max(abs(VHF Doppler))`. | Maximum absolute modeled VHF Doppler. | D5, `compute`; D2 summary/checks. | Nyquist-style sampling rule; marked in the UI as a simple floor, not full radar PRF design. |
| PRF pulse interval | `pulseIntervalMs = 1000/prf`. | PRF. | D5, `compute`; D2 PRF table. | Unit conversion. |
| PRF along-track spacing | `spacingM = speed*1000/prf`. | Spacecraft speed, PRF. | D5, `compute`; D2 PRF table. | Distance traveled per pulse. |
| PRF unambiguous range | `unambiguousRangeKm = c/(2*prf)/1000`. | Speed of light, PRF. | D5, `compute`; D2 PRF table. | Standard pulse radar range ambiguity relationship. |
| Pulses in air | `pulsesInAir = (2*z0*1000/c)*prf`. | Closest altitude, speed of light, PRF. | D5, `compute`; D2 PRF table. | Round-trip light-time count. |

## Topography Formulas

All topography terms are synthetic stress-test terrain, not an imported Europa DEM.

| Formula area | Formula as implemented | Data inputs | Local source | Reference/provenance |
| --- | --- | --- | --- | --- |
| Topography toggle | If `topographyOn` is false, return `0`. | `topographyOn`. | D5, `topography`; D2 topography formula guide. | Project control. |
| Project DEM-style surface | Sum of exponential ridges/scallops and sine waves, scaled by `demScale`. | `x`, `y`, `demScale`. | D5, `topography`; D2 topography formula guide. | Project synthetic terrain pattern. |
| Raised ridge | `ridgeHeight*exp(-((x-x0)^2)/(2*sigmaX^2))*exp(-((y-y0)^2)/(2*sigmaY^2))`. | Ridge height, center, width/length sigmas. | D5, `topography`; D2 topography formula guide. | Gaussian feature chosen as a representative raised band/ridge stress case. |
| Crater/depression | `-craterDepth*exp(-(((x-x0)^2)+((y-y0)^2))/(2*sigma^2))`. | Crater depth, center, sigma. | D5, `topography`; D2 topography formula guide. | Gaussian depression chosen as a representative low terrain stress case. |
| Chaos terrain | Weighted mixture of sine/cosine terms. | Chaos amplitude, roughness wavelengths, `x`, `y`. | D5, `topography`; D2 topography formula guide. | Project synthetic irregular terrain. |
| Fine roughness | `roughAmplitude*sin(2*pi*x/roughLx)*sin(2*pi*y/roughLy)`. | Roughness amplitude and wavelengths. | D5, `topography`; D2 topography formula guide. | Project synthetic roughness term. |
| Trough/fracture | `-troughDepth*exp(-((y-y0)^2)/(2*sigmaY^2))*exp(-((x-x0)^2)/(2*sigmaX^2))`. | Trough depth, center, width/length sigmas. | D5, `topography`; D2 topography formula guide. | Project synthetic trough stress case. |
| Seeded terrain | Weighted smooth waves plus deterministic hash using `terrainSeed`. | Seed, amplitudes, scales, `x`, `y`. | D5, `topography`; D2 topography formula guide. | Project repeatable random-looking terrain. |
| Topographic apparent depth | `d_app_topo = (R_off_topo - R_nadir_topo)*1000/n`. | Topographic ranges, refractive index. | D5, `computeModelRows`; D2 formula guide. | Radar path geometry plus project terrain. |
| Surface-height equivalent error | `apparentSurfaceHeight = -n*(topoDepth - flatDepth)`. | Flat apparent depth, topographic apparent depth, refractive index. | D5, `computeModelRows`; D2 formula guide. | Project conversion back to surface-height-equivalent meters for interpretation. |

## Subsurface And Echo Formulas

All layers, echoes, materials, evidence scores, and thresholds in this section are synthetic sensitivity assumptions.

| Formula area | Formula as implemented | Data inputs | Local source | Reference/provenance |
| --- | --- | --- | --- | --- |
| Shallow upper-layer depth | `upperMeanDepth + sine + cosine + surfaceCoupling*(hTarget - avgSurface)`. | Upper-layer mean, amplitudes, wavelengths, phase, terrain. | D5, `computeSubsurface`; D2 subsurface formula guide. | Project synthetic internal ice layer. |
| Gaussian helper | `gaussian(x, mu, sigma) = exp(-0.5*((x-mu)/sigma)^2)`. | Along-track position, center, width. | D5, `gaussian`. | Standard Gaussian shape used as a project lens profile. |
| Lens strength | `clamp(lensA*gaussianA + lensB*gaussianB, 0, 1)`. | Lens strengths, centers, widths. | D5, `computeSubsurface`; D2 subsurface formula guide. | Project warm/briny lens stress-test profile. |
| Lens depth | `lensMeanDepth + waveAmplitude*sin(...) - lensUplift*lensStrength`. | Lens mean, wave, phase, uplift, strength. | D5, `computeSubsurface`; D2 subsurface formula guide. | Project synthetic internal lens depth. |
| Ocean/boundary depth | `nominalIceShell + sine + cosine - oceanSurfaceAntiCoupling*(hTarget - avgSurface)`. | Nominal shell thickness, basal waves, terrain coupling. | D5, `computeSubsurface`; D2 subsurface formula guide. | Project possible ice-ocean boundary profile. |
| Layer elevation | `elevation = surface_height - depth`. | Surface elevation, layer depth. | D5, `computeSubsurface`; D2 formula guide. | Geometry conversion for plotting. |
| Shallow echo | `upperEcho = shallowEcho - 2*attenuation*(upperDepth/1000)`. | Base echo, attenuation, upper-layer depth. | D5, `computeSubsurface`; D2 subsurface formula guide. | Simplified two-way attenuation model. |
| Lens echo | `lensEcho = lensEchoBase + lensEchoBonus*lensStrength - 2*attenuation*(lensDepth/1000)`. | Lens base echo, lens strength, bonus, attenuation, depth. | D5, `computeSubsurface`; D2 formula guide. | Project contrast plus two-way attenuation. |
| Ocean echo | `oceanEcho = oceanEchoBase - 2*attenuation*(oceanDepth/1000) - basalRoughnessPenalty*abs(oceanElevation - avgOceanElevation)`. | Ocean base echo, attenuation, depth, roughness penalty. | D5, `computeSubsurface`; D2 formula guide. | Project echo-strength stress term; not calibrated radar backscatter. |
| Detectability margin | `margin = echo_dB - detectionThreshold`. | Echo strength, detection threshold. | D5, `computeSubsurface`, `computeFalseLayerResponse`; D2 formula guide. | dB comparison convention. |
| No-ocean control margin | `noOceanControlEcho - detectionThreshold + 1.5*sin(2*pi*x/45)`. | No-ocean control echo, detection threshold, along-track `x`. | D5, `computeSubsurface`. | Project synthetic control case. |
| Radargram clutter | `surfaceClutterBand + 1.5*sin(2*pi*x/35)`. | Clutter band, along-track `x`. | D5, `computeSubsurface`. | Project synthetic clutter timing band. |
| Radargram layer timing | `layerDelay + radargramJitter*sin(...)`; lens blanks when `lensStrength < lensDisplayThreshold`. | Layer delay, jitter, lens threshold. | D5, `computeSubsurface`; D2 subsurface formula guide. | Project radargram-style display rule. |
| Thin/medium/thick shell comparison | `thin = oceanDepth*thinShellMultiplier`; `medium = oceanDepth`; `thick = oceanDepth*thickShellMultiplier`. | Boundary depth and scenario multipliers. | D5, `buildCharts`; D2 formula guide. | Project scenario scaling. |
| Boundary uncertainty band | `lower = oceanDepth - boundaryUncertainty`; `upper = oceanDepth + boundaryUncertainty`. | Boundary depth, uncertainty input. | D5, `buildCharts`; D2 formula guide. | Project uncertainty display. |
| Evidence weighted average | `sum(score*weight)/sum(weight)`. | Radar, thermal, composition, magnetic/plasma scores and weights. | D5, `compute`; D2 formula guide. | Project scoring assumption, with S2 instrument context. |

## False-Layer Receiver Formulas

These formulas model a simplified receiver decision so the site can show how an internal layer could fool a strongest-echo interpretation. They are not a flight algorithm.

| Formula area | Formula as implemented | Data inputs | Local source | Reference/provenance |
| --- | --- | --- | --- | --- |
| False-layer stack gain | `stackGain = 2.2*log2(falseLayerCount + 1)` if enabled. | False layer count. | D5, `computeFalseLayerResponse`. | Project heuristic for multiple internal reflectors. |
| False-layer depth fraction | `fraction = clamp(falseLayerDepthFraction + ripple, 0.22, 0.94)`. | Depth fraction, deterministic sine/cosine ripple. | D5, `computeFalseLayerResponse`. | Project heuristic. |
| False-layer depth | `falseDepth = clamp(oceanDepth*fraction, lensDepth + 350, oceanDepth - 450)`. | Ocean depth, lens depth, fraction. | D5, `computeFalseLayerResponse`. | Project constraint ensuring the false layer stays internal and shallower than boundary. |
| False-layer delay | `falseDelay = 2*n*falseDepth/c*1e6`. | False depth, refractive index, speed of light. | D5, `computeFalseLayerResponse`. | S1, S4. |
| False-layer echo | `falseLayerStrength + stackGain + interference - 2*attenuation*(falseDepth/1000)`. | Base strength, stack gain, deterministic interference, attenuation, depth. | D5, `computeFalseLayerResponse`. | Project relative echo model. |
| Surface clutter margin | `shallowEcho + surfaceClutterBand*0.28 + 2*sin(2*pi*x/28) - detectionThreshold`. | Shallow echo, clutter band, detection threshold. | D5, `computeFalseLayerResponse`. | Project clutter heuristic. |
| False minus ocean | `falseMinusOcean = falseEcho - oceanEcho`. | False echo, ocean echo. | D5, `computeFalseLayerResponse`. | dB comparison convention. |
| Decision: false selected | If false return is detected and `falseMinusOcean > receiverAmbiguityDb`, select false depth. | False margin, ocean margin, ambiguity window. | D5, `computeFalseLayerResponse`. | Project receiver decision rule. |
| Decision: ambiguous | If both are detected and `abs(falseMinusOcean) <= receiverAmbiguityDb`, select midpoint for display and label ambiguous. | Margins, false/ocean depths, ambiguity window. | D5, `computeFalseLayerResponse`. | Project receiver decision rule. |
| Decision: ocean likely | If ocean is detected and not beaten/ambiguous, select ocean depth. | Ocean margin, false margin. | D5, `computeFalseLayerResponse`. | Project receiver decision rule. |
| Decision share | `100*count(decision category)/row_count`. | Along-track decision codes. | D5, `buildCharts`. | Percent summary of project decision outputs. |
| Confidence heuristics | Bounded expressions such as `clamp(70 + (-falseMinusOcean)*1.7 + oceanMargin*0.35, 0, 100)`. | Margins and decision state. | D5, `computeFalseLayerResponse`. | Project confidence display, not calibrated probability. |

## Doppler Correction Formulas

| Formula area | Formula as implemented | Data inputs | Local source | Reference/provenance |
| --- | --- | --- | --- | --- |
| Radial velocity from Doppler | `radialVelocity = abs(vhfDoppler)*lambdaVhf/2`. | VHF Doppler shift, VHF wavelength. | D5, `computeDoppler`; D2 formula guide. | Standard two-way monostatic Doppler relationship. |
| Doppler-inverted angle | `dopplerAngle = asin(clamp(radialVelocity/(speed*1000), 0, 1))`. | Radial velocity, spacecraft speed. | D5, `computeDoppler`; D2 formula guide. | Geometry from radial speed component. |
| Residual angle term | `0.18*sin(2*pi*x/37) + 0.05*cos(2*pi*x/19)`. | Along-track position. | D5, `computeDoppler`. | Project deterministic residual so correction is illustrative, not perfect. |
| Raw slant depth | `rawDepth = trueDepth/cos(dopplerAngle)`. | True modeled depth, Doppler angle. | D5, `computeDoppler`; D2 formula guide. | Right-triangle slant/vertical correction. |
| Corrected vertical depth | `correctedDepth = rawSlantDepth*cos(measuredDopplerAngle)`. | Raw slant depth, measured Doppler angle. | D5, `computeDoppler`; D2 formula guide. | Simplified angle correction. |
| Depth error | `error = estimate - trueDepth`. | Estimated depth, true modeled depth. | D5, `computeDoppler`; D2 formula guide. | Model validation metric. |

## V30 Signal And Advanced Sensitivity Formulas

These are live browser sensitivity overlays on the v30 workbook data. The workbook data remain the source artifact; the browser formulas let the side controls update selected graph series.

| Formula area | Formula as implemented | Data inputs | Local source | Reference/provenance |
| --- | --- | --- | --- | --- |
| Power-ratio dB conversion | `db(value) = 10*log10(max(value, 1e-12))`. | Positive power-like ratio. | D5, v30 helper `db`. | Standard power dB conversion. |
| Pulse-compression gain proxy | `10*log10(pulseLengthUs*bandwidthMhz) + windowLossDb`. | Pulse length, bandwidth, window loss. | D5, `pulseGain`, `buildPulseChart`; D4 signal assumptions. | S6; simplified time-bandwidth sensitivity proxy. |
| Geometric spreading shift | `10*log10((1/rangeScale)^4)`. | Current altitude scale relative to default altitude. | D5, `buildGeometricChart`. | S5; monostatic two-way spreading power scales as `R^-4`. |
| Wavelength in ice | `wavelengthIce = c/(frequencyMhz*1e6)/iceIndex`. | Speed of light, frequency, ice index. | D5, `fresnelMetrics`. | Wave speed in material from refractive index. |
| First-Fresnel-zone radius proxy | `radius = sqrt(wavelengthIce*depth/2)`. | Wavelength in ice, depth. | D5, `fresnelMetrics`. | S7; simplified near-normal sounding geometry. |
| Fresnel look count | `fresnelLooks = floor((2*radius)/alongTrackSpacingM) + 1`. | Fresnel diameter, along-track spacing. | D5, `fresnelMetrics`. | Project discretization of Fresnel-zone footprint. |
| Aperture cap | `apertureLooks = floor(max(coherenceApertureM, spacingM)/spacingM) + 1`. | Aperture cap, spacing. | D5, `fresnelMetrics`. | Project coherence-aperture limit. |
| Phase coherence factor | `coherence = exp(-0.5*phaseSigmaRad^2)`. | Phase decorrelation in radians. | D5, `fresnelMetrics`. | Gaussian phase-error coherence model. |
| Effective coherent looks | `effectiveLooks = 1 + (rawLooks - 1)*coherence`. | Raw look count, coherence factor. | D5, `fresnelMetrics`. | Project coherent-look proxy. |
| Coherent gain | `gainDb = 10*log10(effectiveLooks)`. | Effective coherent looks. | D5, `fresnelMetrics`, `buildCoherentChart`. | Standard power dB conversion applied to project look count. |
| Frequency slope offset | `slopeDbPerOctave*log2(frequencyMhz/referenceFrequencyMhz)`. | Frequency, reference frequency, slope. | D5, `frequencySlopeOffsetDb`. | Project reflectivity sensitivity assumption. |
| Hamming weight | `0.54 - 0.46*cos(2*pi*t)`. | Normalized sample position. | D5, `hammingWeight`. | S8. |
| Windowed frequency response | Weighted linear-power average of `10^(responseDb/10)`, converted back with `10*log10`. | Center frequency, bandwidth, frequency slope, Hamming weights. | D5, `windowedFrequencyResponse`; D4 signal assumptions. | S8 plus project frequency-slope assumption. |
| Total VHF dB | `geometric + coherentGain + pulseGain + twoWayAttenuation + frequencyResponse`. | Geometric chart, coherent chart, pulse inputs, attenuation, frequency response. | D5, `buildTotalVhfChart`. | Combines S5, S6, S7, S8 with project attenuation and reflectivity assumptions. |
| Scenario stress | Scenario labels scale dirty-ice and clutter levels; signal term uses pulse gain, threshold relief, and attenuation stress. | Scenario label text, dirty level, clutter level, pulse gain, threshold, attenuation. | D5, `scenarioStress`. | Project categorical stress rule. |
| Confidence vs ambiguity | `ambiguity = clamp(0.08 + dirty*0.72 + clutter*0.44 - signal*0.22)`; `score = clamp(1 - ambiguity + signal*0.18, 0, 1)*100`. | Scenario stress terms. | D5, `buildConfidenceChart`. | Project scoring aid, not calibrated probability. |
| HF workbook-depth shares | `falseShare`, `weakShare`, and `clearShare` are bounded functions of dirty, clutter, signal, and attenuation. | Scenario stress terms. | D5, `buildWorkbookDepthChart`. | Project outcome-share heuristic. |
| VHF clutter-stress shares | Surface clutter, internal feature, weak detection, and outside-window shares are bounded functions of clutter, dirty, signal, and attenuation. | Scenario stress terms. | D5, `buildClutterStressChart`. | Project outcome-share heuristic. |
| Material reflector strengths | Category dB values are adjusted by dirty penalty, clutter penalty, and pulse signal boost. | Dirty level, clutter level, pulse gain. | D5, `buildMaterialChart`; D4 signal assumptions. | Project material/interface sensitivity assumption. |
| V30 evidence scores | Radar, thermal, composition, and magnetic/plasma scores are bounded functions of dirty level, clutter level, and signal boost. | Dirty level, clutter level, pulse gain. | D5, `buildEvidenceChart`; D4 signal assumptions. | Project evidence scoring with S2 mission-context categories. |

## Chart And Data Source Map

| Chart group | Chart titles | Data source | Formula source |
| --- | --- | --- | --- |
| Geometry and surface | Surface Height; Apparent Depth; Terrain Baseline; Doppler Flat vs Topography; Scenario Two-Way Extra Delay; Custom Pass Delay | D2 for baseline, D4 for v30 extracted charts, recomputed by D5 when live controls change | Core geometry and topography formulas above |
| Subsurface interpretation | Subsurface Truth Model; Thin/Medium/Thick Ice; Boundary Uncertainty; Ocean Model vs No-Ocean Control; Radargram Timing; Detectability Margin; Material Strength; Evidence Score | D2 baseline and D5 live recomputation; D4 charts adapted through D5 for v30 | Subsurface and echo formulas above |
| False-layer response | Competing Echo Margins; Picked Boundary; False Layer Delay; Depth Error; Decision Code; Outcome Share | D5 live false-layer rows | False-layer receiver formulas above |
| Doppler correction | Doppler-Inverted Look Angle; Raw Slant vs Corrected Depth; Depth Error Before/After; Corrected Layer Depths | D5 live Doppler rows, with v30 adapted from live chart titles | Doppler correction formulas above |
| Advanced signal response | Pulse Compression; Geometric Spreading; Coherent Fresnel Gain; Fresnel Look Count; Windowed Chirp Response; Total VHF dB | D4 extracted workbook series plus D5 live replacements/overlays | V30 signal formulas above |
| Advanced outcome stress tests | HF 9 MHz Confidence vs Ambiguity; HF 9 MHz Workbook-Depth Outcomes; VHF 60 MHz Shallow Clutter Stress Test | D4 extracted categories plus D5 live scenario stress calculations | V30 scenario stress formulas above |

## Important Provenance Notes

- The website source metadata says the v19 extracted data came from `outputs/europa_ice_subsurface_simulation/v19.xlsx`, generated on 2026-06-24, and is served from `docs/assets/v19.xlsx` plus `docs/data/v19-results.js`.
- The v30 extracted data came from `outputs/europa_ice_subsurface_simulation/v30_all_dynamic_graphs.xlsx` and is served from `docs/assets/v30_all_dynamic_graphs.xlsx` plus `docs/data/v30-results.js`.
- `scripts/audit_graph_meaning.js` validates 53 rendered chart objects from the browser model. It checks chart metadata, expected series, units, thresholds, layer ordering, percent bounds, delay/depth signs, and Doppler correction improvement.
- Synthetic topography, layer depths, reflector strengths, detection thresholds, dirty-ice categories, confidence scores, evidence scores, and false-layer receiver decisions are project assumptions. They are useful for stress-testing interpretation, but they should not be cited as measured Europa properties.
- Physical constants and mission context come from external sources listed above; formulas that depend on scenario scores or synthetic reflectors come from the project code and workbook artifacts.
