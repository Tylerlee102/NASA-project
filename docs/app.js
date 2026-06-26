(function () {
  const sourceData = window.V19_RESULTS;
  const v30Data = window.V30_RESULTS;
  const liveModel = window.V19_LIVE_MODEL;
  const v30Model = window.V30_LIVE_MODEL;
  let liveParams = liveModel ? { ...liveModel.defaults } : {};
  let data = liveModel ? liveModel.compute(liveParams) : sourceData;
  let v30Params = v30Model ? { ...v30Model.defaults } : {};
  let v30ViewData = v30Model && v30Data ? v30Model.compute(v30Params, v30Data) : v30Data;
  const colors = ['#1f6b70', '#9b4e2f', '#5f4f8f', '#3f7a55', '#9b3d3f', '#315f88', '#7a641f', '#59615d'];
  const tooltip = document.getElementById('chart-tooltip');

  if (!sourceData) {
    document.body.innerHTML = '<main><h1>Site data did not load.</h1></main>';
    return;
  }

  function formatValue(value, digits = 2) {
    if (value === null || value === undefined || value === '') return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    const abs = Math.abs(value);
    if (abs >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: digits });
    if (abs >= 100) return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
    if (abs >= 10) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (abs >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
    return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }

  function formatAxisValue(value) {
    if (value === null || value === undefined || value === '') return '';
    if (typeof value !== 'number') return String(value);
    const abs = Math.abs(value);
    if (abs >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (abs >= 1000) return `${(value / 1000).toFixed(1)}k`;
    return formatValue(value, 1);
  }

  function metricValue(row) {
    const unit = row.unit ? `<span class="metric-unit">${row.unit}</span>` : '';
    return `<p class="metric-value"><span class="metric-number">${formatValue(row.value)}</span>${unit}</p>`;
  }

  function makeMetric(row) {
    return `
      <article class="metric">
        <p class="metric-label">${escapeHtml(row.label)}</p>
        ${metricValue(row)}
        <p class="metric-note">${escapeHtml(row.meaning || '')}</p>
      </article>
    `;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function humanizeId(value) {
    return String(value || 'data')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  const CORE_QUESTION = 'Can a bright deep radar return be trusted as the ice-ocean boundary?';

  const SECTION_CAVEATS = {
    'Surface and motion': 'This is a synthetic geometry and terrain sensitivity test, not a reconstruction of an actual Europa flyby.',
    'Subsurface model': 'These layers and echo strengths are generated sensitivity cases; they do not prove real Europa geology.',
    'False-layer response': 'The false reflectors are synthetic receiver stress tests, not mission-validated detections of internal Europa layers.',
    'Doppler depth correction': 'This is a controlled browser-side correction demonstration with simplified residual error, not a full radar inversion.',
    'Advanced sensitivity': 'The v30 charts are workbook-derived and browser-adjusted sensitivity views, not a mission-validated Europa radar processor.'
  };

  function finiteSeriesPointsFor(series) {
    return (series && series.points ? series.points : []).filter((point) => Number.isFinite(point[1]));
  }

  function findSeries(chart, matcher) {
    const series = chart.series || [];
    if (!matcher) return series[0];
    if (matcher instanceof RegExp) return series.find((item) => matcher.test(item.name || ''));
    const needle = String(matcher).toLowerCase();
    return series.find((item) => String(item.name || '').toLowerCase() === needle)
      || series.find((item) => String(item.name || '').toLowerCase().includes(needle));
  }

  function pointLabel(point, chart) {
    const raw = point[2] ?? point[0];
    return typeof raw === 'number' ? formatWithAxis(raw, chart.xLabel, 2) : String(raw);
  }

  function seriesRangeSentence(chart, matcher, label) {
    const series = findSeries(chart, matcher);
    const points = finiteSeriesPointsFor(series);
    if (!series || !points.length) return '';
    const values = points.map((point) => point[1]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const display = label || series.name;
    return `${display} ranges from ${formatWithAxis(min, chart.yLabel, 2)} to ${formatWithAxis(max, chart.yLabel, 2)}.`;
  }

  function allSeriesRangeSentence(chart, limit = 4) {
    const bits = (chart.series || []).slice(0, limit)
      .map((series) => seriesRangeSentence(chart, series.name))
      .filter(Boolean);
    const remaining = Math.max((chart.series || []).length - limit, 0);
    return `${bits.join(' ')}${remaining ? ` ${remaining} additional series are included in the same units.` : ''}`;
  }

  function pairedDifferenceSentence(chart, matcherA, matcherB, label) {
    const a = findSeries(chart, matcherA);
    const b = findSeries(chart, matcherB);
    const aPoints = finiteSeriesPointsFor(a);
    const bPoints = finiteSeriesPointsFor(b);
    const n = Math.min(aPoints.length, bPoints.length);
    if (!a || !b || !n) return '';
    const diffs = [];
    for (let i = 0; i < n; i += 1) {
      diffs.push(aPoints[i][1] - bPoints[i][1]);
    }
    const min = Math.min(...diffs);
    const max = Math.max(...diffs);
    return `${label || `${a.name} minus ${b.name}`} ranges from ${formatWithAxis(min, chart.yLabel, 2)} to ${formatWithAxis(max, chart.yLabel, 2)}.`;
  }

  function thresholdSentence(chart, matcher, threshold = 0, label) {
    const series = findSeries(chart, matcher);
    const points = finiteSeriesPointsFor(series);
    if (!series || !points.length) return '';
    const count = points.filter((point) => point[1] >= threshold).length;
    const display = label || series.name;
    return `${display} is at or above ${formatWithAxis(threshold, chart.yLabel, 2)} in ${count} of ${points.length} plotted samples.`;
  }

  function zeroBehaviorSentence(chart, matcher, label) {
    const series = findSeries(chart, matcher);
    const points = finiteSeriesPointsFor(series);
    if (!series || !points.length) return '';
    const values = points.map((point) => point[1]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const display = label || series.name;
    if (min < 0 && max > 0) return `${display} crosses the zero reference, so the sign changes along the track.`;
    if (max <= 0) return `${display} stays at or below zero throughout this run.`;
    return `${display} stays at or above zero throughout this run.`;
  }

  function dominanceSentence(chart, matcherA, matcherB, labelA, labelB) {
    const a = findSeries(chart, matcherA);
    const b = findSeries(chart, matcherB);
    const aPoints = finiteSeriesPointsFor(a);
    const bPoints = finiteSeriesPointsFor(b);
    const n = Math.min(aPoints.length, bPoints.length);
    if (!a || !b || !n) return '';
    let count = 0;
    for (let i = 0; i < n; i += 1) {
      if (aPoints[i][1] > bPoints[i][1]) count += 1;
    }
    return `${labelA || a.name} is stronger or higher than ${labelB || b.name} in ${count} of ${n} paired samples.`;
  }

  function categoryExtremaSentence(chart, matcher, label) {
    const series = findSeries(chart, matcher);
    const points = finiteSeriesPointsFor(series);
    if (!series || !points.length) return '';
    let minPoint = points[0];
    let maxPoint = points[0];
    points.forEach((point) => {
      if (point[1] < minPoint[1]) minPoint = point;
      if (point[1] > maxPoint[1]) maxPoint = point;
    });
    const display = label || series.name;
    return `${display} is highest for ${pointLabel(maxPoint, chart)} (${formatWithAxis(maxPoint[1], chart.yLabel, 2)}) and lowest for ${pointLabel(minPoint, chart)} (${formatWithAxis(minPoint[1], chart.yLabel, 2)}).`;
  }

  function meanAbsFor(chart, matcher) {
    const series = findSeries(chart, matcher);
    const values = finiteSeriesPointsFor(series).map((point) => Math.abs(point[1]));
    if (!values.length) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function correctionSentence(chart, beforeMatcher, afterMatcher) {
    const before = meanAbsFor(chart, beforeMatcher);
    const after = meanAbsFor(chart, afterMatcher);
    if (!Number.isFinite(before) || !Number.isFinite(after)) return '';
    const direction = after < before ? 'reduces' : 'does not reduce';
    return `Mean absolute error changes from ${formatWithAxis(before, chart.yLabel, 2)} before correction to ${formatWithAxis(after, chart.yLabel, 2)} after correction, so the correction ${direction} the modeled error.`;
  }

  function trendSentence(chart, matcher, label) {
    const series = findSeries(chart, matcher);
    const points = finiteSeriesPointsFor(series);
    if (!series || points.length < 2) return '';
    const first = points[0];
    const last = points[points.length - 1];
    const display = label || series.name;
    const direction = last[1] > first[1] ? 'increases' : last[1] < first[1] ? 'decreases' : 'stays flat';
    return `${display} ${direction} from ${formatWithAxis(first[1], chart.yLabel, 2)} at ${pointLabel(first, chart)} to ${formatWithAxis(last[1], chart.yLabel, 2)} at ${pointLabel(last, chart)}.`;
  }

  function decisionCodeSentence(chart) {
    const series = findSeries(chart, /weak|ocean|ambiguous|false/i);
    const points = finiteSeriesPointsFor(series);
    if (!series || !points.length) return '';
    const counts = new Map([[0, 0], [1, 0], [2, 0], [3, 0]]);
    points.forEach((point) => {
      const code = Math.round(point[1]);
      counts.set(code, (counts.get(code) || 0) + 1);
    });
    return `Code counts are 0=${counts.get(0) || 0}, 1=${counts.get(1) || 0}, 2=${counts.get(2) || 0}, and 3=${counts.get(3) || 0} out of ${points.length} samples.`;
  }

  function sectionCaveat(chart) {
    return SECTION_CAVEATS[chart.section] || 'This chart is part of a synthetic browser-side sensitivity model, not mission-validated Europa evidence.';
  }

  const CHART_EXPLANATIONS = {
    'Surface Height: Off-Nadir Target vs Nadir Reference Terrain': {
      question: 'Do the side-looking target terrain and the nadir reference terrain differ enough to bias the radar range?',
      xAxis: 'Along-track position (km): distance along the modeled flyby path, with 0 km near mid-pass.',
      yAxis: 'Surface elevation (m): positive values are raised terrain and lower values are depressions relative to the synthetic reference.',
      series: 'Off-nadir target terrain is the side-offset surface the radar is aimed toward. Nadir terrain is the surface directly below the spacecraft and acts as the reference range.',
      notice: (chart) => `${seriesRangeSentence(chart, 'Off-nadir target terrain')} ${seriesRangeSentence(chart, 'Nadir terrain')} ${pairedDifferenceSentence(chart, 'Off-nadir target terrain', 'Nadir terrain', 'Target minus nadir terrain')}`,
      takeaway: 'If target and nadir terrain separate, a side-looking return can carry a terrain bias that looks like a range or depth change.',
      whyItMatters: `The ${CORE_QUESTION} question depends on knowing whether a bright return is deep, or whether geometry and relief made it appear deep.`
    },
    'Apparent Depth: Spacecraft Motion Distortion by Run': {
      question: 'Does flyby geometry make a flat surface look like a deeper reflector?',
      xAxis: 'Along-track position (km): each scenario spans its modeled flyby length, so wider curves represent longer passes.',
      yAxis: 'Apparent depth (m): higher values mean more extra slant range has been converted into a depth-like number, which is riskier for boundary interpretation.',
      series: 'Each line is a different altitude and track-length scenario, including the active custom pass and paper-derived comparison passes.',
      notice: (chart) => allSeriesRangeSentence(chart),
      takeaway: 'Different passes can create very different apparent-depth distortion even before adding real subsurface structure.',
      whyItMatters: `A bright deep-looking return is only trustworthy if geometry alone cannot explain a similar depth-like shift.`
    },
    'Terrain Baseline: Surface-Height Equivalent Error': {
      question: 'How much apparent elevation or depth error is created by generated terrain?',
      xAxis: 'Along-track position (km): location along the active custom pass.',
      yAxis: 'Surface-height equivalent error (m): positive and negative signs show which direction the terrain bias pushes the interpreted surface-height equivalent.',
      series: 'Total radar elevation error converts the topography-driven apparent-depth change back into meters of surface-height-equivalent error.',
      notice: (chart) => `${seriesRangeSentence(chart, /elevation error|surface-height/i)} ${zeroBehaviorSentence(chart, /elevation error|surface-height/i, 'The terrain error')}`,
      takeaway: 'The sign and size of this error show where topography can pull a radar interpretation shallower or deeper.',
      whyItMatters: `If terrain can create a comparable bias, the project cannot treat a bright deep return as automatically proving the ice-ocean boundary.`
    },
    'Terrain Baseline: Total Radar Elevation Error': {
      question: 'How much radar elevation error remains after the v30 generated-terrain pass is applied?',
      xAxis: 'Along-track position (km): location along the active custom pass.',
      yAxis: 'Surface-height equivalent error (m): positive and negative values show the direction of the terrain-driven radar elevation bias, and larger absolute values mean more geometry/topography bias.',
      series: 'Total radar elevation error is the v30 workbook-derived version of the terrain-baseline error curve.',
      notice: (chart) => `${seriesRangeSentence(chart, /elevation error/i)} ${zeroBehaviorSentence(chart, /elevation error/i, 'The elevation error')}`,
      takeaway: 'The v30 terrain baseline keeps the same warning: generated terrain can move the radar interpretation before any ocean claim is considered.',
      whyItMatters: `The ${CORE_QUESTION} question needs this terrain-bias check as a guardrail.`
    },
    'Doppler: Flat Geometry vs Topography': {
      question: 'How do flat geometry and generated topography change the expected HF and VHF Doppler shift?',
      xAxis: 'Along-track position (km): location along the flyby, with sign changes often occurring around the closest part of the pass.',
      yAxis: 'Doppler shift (Hz): positive and negative signs represent opposite range-rate directions; larger absolute values require more careful sampling.',
      series: 'Flat VHF and flat HF use the smooth geometry only. Topo VHF and topo HF include generated terrain in the range-rate estimate.',
      notice: (chart) => `${allSeriesRangeSentence(chart)} ${pairedDifferenceSentence(chart, 'Topo VHF', 'Flat VHF', 'Topo VHF minus flat VHF')}`,
      takeaway: 'Topography can perturb the Doppler signature, and VHF has larger shifts than HF because of its shorter wavelength.',
      whyItMatters: 'Doppler shift affects angle and depth correction, so a biased Doppler estimate can make a deep return look more or less trustworthy than it is.'
    },
    'Scenario Two-Way Extra Delay: Flat Surface': {
      question: 'How much extra round-trip timing does off-nadir geometry create on a flat surface?',
      xAxis: 'Along-track position (km): distance along each scenario flyby.',
      yAxis: 'Two-way extra delay (us): larger values mean the radar echo traveled a longer extra path before returning.',
      series: 'Each line is a different flyby scenario, using the same flat-surface delay formula for comparison.',
      notice: (chart) => allSeriesRangeSentence(chart),
      takeaway: 'Longer or lower-altitude passes can produce larger timing shifts that should not be mistaken for subsurface delay by themselves.',
      whyItMatters: 'The ice-ocean boundary interpretation depends on separating timing caused by geometry from timing caused by real depth.'
    },
    'Custom Pass Two-Way Extra Delay: Flat vs Generated Topography': {
      question: 'How does generated terrain change the extra round-trip delay for the active custom pass?',
      xAxis: 'Along-track position (km): location along the active custom pass.',
      yAxis: 'Two-way extra delay (us): larger values mean a longer radar path; small timing differences can still map into apparent-depth differences.',
      series: 'Flat surface pass uses no terrain. Topography-adjusted pass includes generated surface height at the target and nadir reference.',
      notice: (chart) => `${seriesRangeSentence(chart, 'Flat surface pass')} ${seriesRangeSentence(chart, 'Topography-adjusted pass')} ${pairedDifferenceSentence(chart, 'Topography-adjusted pass', 'Flat surface pass', 'Topography delay minus flat delay')}`,
      takeaway: 'Generated terrain shifts the timing curve relative to the flat case, which is another route from surface relief to apparent depth.',
      whyItMatters: 'A deep-looking return is less convincing if surface geometry can move the timing in a similar direction.'
    },
    'Nadir Radar Delay by Flyby: Without Topography': {
      question: 'What round-trip delay is expected directly below the spacecraft when the surface is flat?',
      xAxis: 'Along-track position (km): each flyby scenario is plotted over its own modeled path length.',
      yAxis: 'Delay (us): larger values mean a longer spacecraft-to-surface round trip.',
      series: 'Each line is a flyby altitude and track-length scenario before topography is included.',
      notice: (chart) => allSeriesRangeSentence(chart),
      takeaway: 'The flat nadir delay sets the timing baseline for each flyby before terrain or side-looking geometry adds complexity.',
      whyItMatters: 'The baseline matters because apparent deep returns must be interpreted relative to the surface timing reference.'
    },
    'Nadir Radar Delay by Flyby: With Generated Topography': {
      question: 'How does generated terrain change the nadir surface timing for each flyby?',
      xAxis: 'Along-track position (km): each scenario follows its modeled pass length.',
      yAxis: 'Delay (us): larger values mean a longer surface round trip; terrain highs shorten the delay and lows lengthen it.',
      series: 'Each line is a flyby scenario with generated topography added to the nadir range.',
      notice: (chart) => allSeriesRangeSentence(chart),
      takeaway: 'Topography turns a smooth surface-timing baseline into a locally varying reference.',
      whyItMatters: 'A trustworthy ice-ocean read needs a stable surface reference, or at least a correction for how terrain moves that reference.'
    },
    'Off-Nadir Radar Delay by Flyby: Without Topography': {
      question: 'How much timing delay does side-looking geometry create before topography is added?',
      xAxis: 'Along-track position (km): each scenario is plotted across its flyby path.',
      yAxis: 'Delay (us): larger values mean a longer off-nadir radar path.',
      series: 'Each line is a flyby scenario using flat off-nadir geometry.',
      notice: (chart) => allSeriesRangeSentence(chart),
      takeaway: 'Off-nadir paths can be substantially longer than nadir paths, especially across long low-altitude passes.',
      whyItMatters: 'That longer path can mimic depth unless the model separates slant geometry from true subsurface delay.'
    },
    'Off-Nadir Radar Delay by Flyby: With Generated Topography': {
      question: 'How does generated terrain modify off-nadir timing across different flybys?',
      xAxis: 'Along-track position (km): location along each scenario pass.',
      yAxis: 'Delay (us): larger values mean a longer off-nadir round trip after terrain is included.',
      series: 'Each line is a flyby scenario with generated target terrain included in the off-nadir range.',
      notice: (chart) => allSeriesRangeSentence(chart),
      takeaway: 'The off-nadir delay is controlled by both path geometry and local terrain height.',
      whyItMatters: 'A bright echo can only support the boundary interpretation if this geometry-plus-terrain timing has been separated from real in-ice delay.'
    },
    'Subsurface Truth Model: Icy Layers': {
      question: 'Where are the synthetic surface, shallow layer, briny lens, and possible ice-ocean boundary placed?',
      xAxis: 'Along-track position (km): location along the modeled pass.',
      yAxis: 'Elevation or depth (m): the surface is near positive elevation, while more negative layer elevations mean deeper modeled reflectors.',
      series: 'Icy top surface is the generated surface. Shallow ice layer is a near-surface internal reflector. Warm/briny lens is a possible mid-shell reflector. Ice-ocean boundary is the deepest modeled reflector.',
      notice: (chart) => allSeriesRangeSentence(chart),
      takeaway: 'The model intentionally includes multiple internal reflectors before the deepest boundary so the receiver has something to confuse with the ocean.',
      whyItMatters: 'The core risk is not just seeing a deep return; it is deciding whether that return is the true deepest boundary or a competing internal layer.'
    },
    'Scenario Comparison: Thin / Medium / Thick Ice': {
      question: 'How sensitive is the possible boundary depth to assumed ice-shell thickness?',
      xAxis: 'Along-track position (km): location along the modeled pass.',
      yAxis: 'Depth (m): higher values are deeper boundaries and generally harder radar paths because the signal travels farther through ice.',
      series: 'Thin shell, medium shell, and thick shell scale the same boundary shape to different thickness assumptions.',
      notice: (chart) => allSeriesRangeSentence(chart),
      takeaway: 'The same geometry can imply very different boundary depths once shell-thickness assumptions change.',
      whyItMatters: 'Trusting a bright deep return requires knowing whether the modeled shell depth is plausible and whether the signal should still be detectable there.'
    },
    'Boundary Uncertainty Band': {
      question: 'How wide is the possible range around the modeled ice-ocean boundary?',
      xAxis: 'Along-track position (km): location along the modeled pass.',
      yAxis: 'Depth (m): higher values are deeper; the band shows shallower and deeper alternatives around the mean boundary.',
      series: 'Lower bound is the shallower edge of the uncertainty band. Mean boundary is the central modeled depth. Upper bound is the deeper edge.',
      notice: (chart) => allSeriesRangeSentence(chart),
      takeaway: 'The boundary should be read as a band of possible depths, not a single exact line.',
      whyItMatters: 'A bright return inside or near the band is still not proof of an ocean unless false layers, clutter, and attenuation are checked.'
    },
    'Ocean Model vs No-Ocean Control': {
      question: 'Does the modeled ocean reflector clear the threshold more strongly than a no-ocean control?',
      xAxis: 'Along-track position (km): location along the modeled pass.',
      yAxis: 'Relative power / margin (dB): values above 0 dB clear the simplified detection threshold; below 0 dB is weak or risky.',
      series: 'Ocean model margin is the possible boundary echo minus threshold. No-ocean control margin is a weak control case. The 0 dB line marks the detection threshold.',
      notice: (chart) => `${thresholdSentence(chart, 'Ocean model margin', 0)} ${thresholdSentence(chart, 'No-ocean control margin', 0)} ${dominanceSentence(chart, 'Ocean model margin', 'No-ocean control margin', 'Ocean model margin', 'No-ocean control margin')}`,
      takeaway: 'The ocean model is only meaningful if it separates from the no-ocean control under the current threshold.',
      whyItMatters: 'This is a sanity check against treating any deep-ish return as boundary evidence.'
    },
    'Radargram-Style Return Timing With Clutter': {
      question: 'When do clutter, shallow layers, a briny lens, and the ocean boundary return in time?',
      xAxis: 'Along-track position (km): location along the modeled pass.',
      yAxis: 'Delay (us): lower delays arrive earlier and are usually shallower; larger delays arrive later and usually represent deeper paths.',
      series: 'Surface clutter upper is the near-surface clutter band. Shallow ice return is the upper internal layer. Warm/briny lens return is a mid-shell echo where present. Ocean boundary return is the deepest modeled echo.',
      notice: (chart) => allSeriesRangeSentence(chart),
      takeaway: 'Earlier internal echoes can appear before the ocean echo, so timing alone does not identify the correct boundary.',
      whyItMatters: 'A bright deep return must be interpreted in the full return sequence, not as an isolated line.'
    },
    'Detectability Margin vs Threshold': {
      question: 'Do the lens and ocean echoes clear the simplified detection threshold?',
      xAxis: 'Along-track position (km): location along the modeled pass.',
      yAxis: 'Relative power / margin (dB): positive values are above threshold and easier to detect; negative values are below threshold and risky.',
      series: 'Lens echo margin is the briny-lens echo minus threshold. Ocean echo margin is the boundary echo minus threshold. The 0 dB line is the threshold.',
      notice: (chart) => `${thresholdSentence(chart, 'Lens echo margin', 0)} ${thresholdSentence(chart, 'Ocean echo margin', 0)} ${dominanceSentence(chart, 'Lens echo margin', 'Ocean echo margin', 'Lens echo margin', 'Ocean echo margin')}`,
      takeaway: 'If an internal lens margin rivals or exceeds the ocean margin, a simple strongest-return interpretation becomes ambiguous.',
      whyItMatters: 'The project question hinges on whether the boundary echo is uniquely detectable, not merely detectable.'
    },
    'Reflection Strength by Material / Interface': {
      question: 'Which synthetic material or interface assumptions produce stronger modeled reflections?',
      xAxis: 'Material / interface: categorical assumptions for different ice and boundary contrasts.',
      yAxis: 'Relative power / margin (dB): higher or less-negative values represent stronger assumed reflectors.',
      series: 'Material/interface strength is the relative dB assumption used to compare cold clean ice, salt-rich ice, briny lens, dirty ice mix, and the ice-ocean boundary.',
      notice: (chart) => categoryExtremaSentence(chart, 'Material/interface strength'),
      takeaway: 'Internal briny or dirty interfaces can be bright enough to compete with the boundary in this simplified sensitivity model.',
      whyItMatters: 'A bright echo is not automatically the ice-ocean boundary if another material contrast can also be bright.'
    },
    'Cross-Instrument Evidence Score': {
      question: 'How much support comes from radar versus other contextual evidence channels?',
      xAxis: 'Instrument: radar, thermal, composition, and magnetic/plasma support channels.',
      yAxis: 'Support (%): higher values mean stronger modeled support, but this is a project scoring aid rather than mission evidence.',
      series: 'Evidence support score assigns a simple support value to each instrument channel.',
      notice: (chart) => categoryExtremaSentence(chart, 'Evidence support score'),
      takeaway: 'Radar should be read with supporting context; this page does not let radar alone prove the boundary.',
      whyItMatters: 'The ice-ocean interpretation is safer when independent evidence channels agree, and riskier when radar is isolated.'
    },
    'Competing Echo Margins: Receiver Signal Strength': {
      question: 'Does the false-layer echo beat the ocean echo at the receiver?',
      xAxis: 'Along-track position (km): location along the modeled pass.',
      yAxis: 'Margin above threshold (dB): positive clears the threshold; higher values are stronger receiver candidates.',
      series: 'Surface clutter margin is near-surface interference. False layer margin is the synthetic internal reflector. Ocean boundary margin is the possible true boundary. The 0 dB line marks detectability.',
      notice: (chart) => `${thresholdSentence(chart, 'False layer margin', 0)} ${thresholdSentence(chart, 'Ocean boundary margin', 0)} ${dominanceSentence(chart, 'False layer margin', 'Ocean boundary margin', 'False layer margin', 'Ocean boundary margin')}`,
      takeaway: 'Where the false layer is above threshold and stronger than the ocean, a strongest-echo rule can choose the wrong reflector.',
      whyItMatters: 'This is the central ambiguity test for whether a bright deep return should be trusted.'
    },
    'Picked Boundary Depth vs True Ocean Depth': {
      question: 'Does the receiver-selected boundary follow the true modeled ocean or the false internal layer?',
      xAxis: 'Along-track position (km): location along the modeled pass.',
      yAxis: 'Depth below local surface (m): higher values are deeper; a shallower selected depth means the receiver is underestimating the boundary.',
      series: 'True ocean boundary is the modeled deepest reflector. False layer depth is the synthetic internal reflector. Receiver selected boundary is what the simplified receiver picks.',
      notice: (chart) => `${seriesRangeSentence(chart, 'True ocean boundary')} ${seriesRangeSentence(chart, 'False layer depth')} ${pairedDifferenceSentence(chart, 'Receiver selected boundary', 'True ocean boundary', 'Selected minus true-ocean depth')}`,
      takeaway: 'If the selected boundary tracks the false-layer curve, the receiver is reporting an internal reflector as the bottom.',
      whyItMatters: 'The site is asking whether the brightest selected return is reliable, and this graph shows when the answer is no.'
    },
    'Return Timing: False Layer Arrives Before Ocean': {
      question: 'Does the shallower false layer return before the ocean echo?',
      xAxis: 'Along-track position (km): location along the modeled pass.',
      yAxis: 'Two-way delay in ice (us): lower values arrive earlier; larger values arrive later and usually correspond to deeper reflectors.',
      series: 'False layer return is the synthetic internal reflector timing. Ocean boundary return is the possible true boundary timing. Receiver selected return is the timing the simplified rule chooses.',
      notice: (chart) => `${seriesRangeSentence(chart, 'False layer return')} ${seriesRangeSentence(chart, 'Ocean boundary return')} ${pairedDifferenceSentence(chart, 'Ocean boundary return', 'False layer return', 'Ocean delay minus false-layer delay')}`,
      takeaway: 'The false layer arrives earlier because it is shallower, but it can still be strong enough to affect the selected boundary.',
      whyItMatters: 'Timing order helps diagnose ambiguity: a strong earlier return should not automatically be labeled as the ice-ocean boundary.'
    },
    'Depth Error If the Receiver Picks the Wrong Layer': {
      question: 'How wrong is the interpreted boundary if the receiver selects the false layer?',
      xAxis: 'Along-track position (km): location along the modeled pass.',
      yAxis: 'Depth error (m): zero means correct; negative means the interpreted boundary is too shallow; positive would mean too deep.',
      series: 'Selected minus true ocean is the receiver-picked depth error. No error line is the zero reference.',
      notice: (chart) => `${seriesRangeSentence(chart, 'Selected minus true ocean')} ${zeroBehaviorSentence(chart, 'Selected minus true ocean', 'The selected-depth error')}`,
      takeaway: 'Negative error is the key warning: the model has picked something shallower than the true ocean boundary.',
      whyItMatters: 'A large shallow bias would make a bright return look like an ocean boundary when it is really an internal feature in the simulation.'
    },
    'Satellite Receiver Decision Along Track': {
      question: 'How does the simplified receiver classify each along-track sample?',
      xAxis: 'Along-track position (km): location along the modeled pass.',
      yAxis: 'Decision code: 0 means weak/no deep detection, 1 means ocean likely, 2 means ambiguous, and 3 means false layer selected.',
      series: 'The single decision-code series converts the receiver classification into numeric codes so changes along the track are visible.',
      notice: (chart) => decisionCodeSentence(chart),
      takeaway: 'Long stretches of code 2 or 3 are direct ambiguity warnings; code 1 is the safer ocean-likely case under this model.',
      whyItMatters: 'The project needs a classification, not just a bright line, because the same echo strength can imply different interpretation risk.'
    },
    'Receiver Outcome Share for This Flyby': {
      question: 'What percentage of this flyby falls into each receiver-outcome category?',
      xAxis: 'Receiver outcome: categorical summary of ocean likely, ambiguous, false picked, and weak/no deep detection.',
      yAxis: 'Percent of along-track samples: higher bars mean that outcome happens more often in the current run.',
      series: 'Share of samples is the percent of along-track points assigned to each receiver outcome.',
      notice: (chart) => categoryExtremaSentence(chart, 'Share of samples'),
      takeaway: 'This graph turns the along-track decision code into an easy risk summary for the whole pass.',
      whyItMatters: 'A flyby with a large ambiguous or false-picked share should not be summarized as a clean ocean-boundary detection.'
    },
    'Doppler-Inverted Look Angle vs Existing Geometry': {
      question: 'Can Doppler shift recover the look angle implied by the existing geometry?',
      xAxis: 'Along-track position (km): location along the modeled pass.',
      yAxis: 'Look angle (deg): larger values mean the radar path is farther from nadir; angle error creates depth error.',
      series: 'Doppler angle from VHF shift is the inferred angle. Angle used after residual adds controlled residual error. Existing model geometry angle is the baseline geometry angle.',
      notice: (chart) => `${allSeriesRangeSentence(chart)} ${pairedDifferenceSentence(chart, 'Angle used after residual', 'Existing model geometry angle', 'Residual angle minus geometry angle')}`,
      takeaway: 'The Doppler-derived angle tracks the geometry but is intentionally not perfect.',
      whyItMatters: 'Angle matters because slant depth must be corrected before a deep return can be compared with a vertical ice-ocean boundary depth.'
    },
    'Raw Slant Depth vs Doppler-Corrected Ocean Depth': {
      question: 'Does Doppler correction move raw slant depth closer to the true modeled ocean depth?',
      xAxis: 'Along-track position (km): location along the modeled pass.',
      yAxis: 'Depth below local surface (m): higher values are deeper; closer agreement with the true simulated ocean depth is safer.',
      series: 'True simulated ocean depth is the reference. Raw slant depth comes from angled echo delay. Doppler-corrected depth estimate applies the angle correction.',
      notice: (chart) => `${pairedDifferenceSentence(chart, 'Raw slant depth', 'True simulated ocean depth', 'Raw slant minus true ocean')} ${pairedDifferenceSentence(chart, 'Doppler-corrected depth estimate', 'True simulated ocean depth', 'Corrected minus true ocean')}`,
      takeaway: 'Correction should pull the slant-depth curve toward the true simulated boundary, while residual differences remain visible.',
      whyItMatters: 'A corrected deep return is more useful than a raw slant return, but this controlled improvement is not proof of real Europa structure.'
    },
    'Depth Error Before and After Angle Correction': {
      question: 'How much does Doppler angle correction reduce depth error?',
      xAxis: 'Along-track position (km): location along the modeled pass.',
      yAxis: 'Depth error (m): zero is ideal; lower absolute error means the correction helped.',
      series: 'Uncorrected slant-depth error is the raw geometry error. Corrected depth residual is the remaining error after Doppler correction.',
      notice: (chart) => correctionSentence(chart, 'Uncorrected slant-depth error', 'Corrected depth residual'),
      takeaway: 'The useful result is not a perfect line; it is whether the corrected residual is much smaller than the raw slant-depth error.',
      whyItMatters: 'If correction cannot reduce error, a bright deep return may be positioned at the wrong depth.'
    },
    'Corrected Layer Depths From Doppler Angle': {
      question: 'Where do the upper layer, briny lens, and ocean boundary land after Doppler-angle correction?',
      xAxis: 'Along-track position (km): location along the modeled pass.',
      yAxis: 'Depth below local surface (m): higher values are deeper corrected estimates.',
      series: 'Corrected upper-layer depth, corrected briny lens depth, and corrected ocean boundary depth are the layer estimates after the angle correction.',
      notice: (chart) => allSeriesRangeSentence(chart),
      takeaway: 'Corrected depth still preserves layer separation, which helps keep shallow, lens, and boundary interpretations distinct.',
      whyItMatters: 'The boundary is more trustworthy when correction does not collapse different layers into one ambiguous depth.'
    },
    'Pulse compression gain vs pulse length': {
      question: 'How does pulse length affect the simplified pulse-compression gain?',
      xAxis: 'Pulse length (us): the modeled transmit pulse duration in microseconds.',
      yAxis: 'dB: higher gain means stronger modeled signal after this simplified pulse-compression proxy.',
      series: 'HF pulse gain and VHF pulse gain show the band-specific gain proxy. Selected pulse setting marks the current control value.',
      notice: (chart) => `${trendSentence(chart, 'HF pulse gain')} ${trendSentence(chart, 'VHF pulse gain')} ${seriesRangeSentence(chart, 'Selected pulse setting')}`,
      takeaway: 'Longer pulses increase this simplified gain proxy, but that does not replace a full radar processing model.',
      whyItMatters: 'Signal gain affects whether ocean and false-layer echoes clear threshold, so it changes confidence in a bright deep return.'
    },
    'Geometric spreading power dB': {
      question: 'How much power is lost or gained through two-way geometric spreading along the pass?',
      xAxis: 'Along-track position (km): location along the modeled pass.',
      yAxis: 'dB: more negative values mean more geometric power loss; less negative values are stronger.',
      series: 'HF geometric power and VHF topo geometric power are the range-spreading terms used in the advanced signal sensitivity view.',
      notice: (chart) => allSeriesRangeSentence(chart),
      takeaway: 'Even small dB changes matter because they add to attenuation, pulse gain, and reflectivity assumptions.',
      whyItMatters: 'A deep echo near threshold can become trusted or rejected depending on the combined signal budget.'
    },
    'Coherent Fresnel-zone gain': {
      question: 'How much simplified coherent gain is available along the modeled track?',
      xAxis: 'Along-track position (km): location along the modeled pass.',
      yAxis: 'dB: higher values mean more modeled coherent gain in this simplified power-ratio sensitivity.',
      series: 'HF coherent gain and VHF coherent gain are simplified coherent-gain terms; they are not a full aperture synthesis model.',
      notice: (chart) => allSeriesRangeSentence(chart),
      takeaway: 'The chart shows a sensitivity term, not a complete physical aperture model.',
      whyItMatters: 'Overstating coherent gain could make a weak or ambiguous deep return look more reliable than it is.'
    },
    'Total VHF dB: constant vs frequency-dependent response': {
      question: 'How does the combined VHF signal budget change under constant versus frequency-dependent reflectivity?',
      xAxis: 'Along-track position (km): location along the modeled pass.',
      yAxis: 'dB: higher values mean a stronger combined modeled signal; lower values mean weaker confidence.',
      series: 'Constant reflectivity combines geometry, coherent gain, pulse gain, and attenuation with no frequency slope. Frequency-dependent reflectivity adds the selected frequency-response term.',
      notice: (chart) => `${seriesRangeSentence(chart, 'Constant reflectivity')} ${seriesRangeSentence(chart, 'Frequency-dependent reflectivity')} ${pairedDifferenceSentence(chart, 'Frequency-dependent reflectivity', 'Constant reflectivity', 'Frequency-dependent minus constant response')}`,
      takeaway: 'Frequency-response assumptions can shift the total VHF signal budget enough to change a threshold read.',
      whyItMatters: 'The boundary interpretation is only as strong as the signal assumptions that keep the deep return above threshold.'
    },
    'HF 9 MHz Mid-Shell Confidence vs Ambiguity': {
      question: 'Under dirty-ice and clutter scenarios, does HF confidence drop while ambiguity rises?',
      xAxis: 'Scenario: clean, dirty, briny, stacked, complex, and clutter stress cases.',
      yAxis: 'Percent / score (0-100): higher confidence is safer; higher ambiguous/false percent is riskier.',
      series: 'Median confidence is the model confidence score. Ambiguous/false % is the share converted to percent for comparison.',
      notice: (chart) => `${categoryExtremaSentence(chart, 'Median confidence')} ${categoryExtremaSentence(chart, 'Ambiguous/false %')}`,
      takeaway: 'Dirty and complex cases can lower confidence while raising ambiguity in the sensitivity model.',
      whyItMatters: 'A bright return in a dirty-ice case is less trustworthy if the model says ambiguity is also high.'
    },
    'HF 9 MHz Workbook-Depth Outcomes': {
      question: 'How often does the workbook-depth sensitivity view produce clear ocean, false-risk, or weak outcomes?',
      xAxis: 'Scenario: the dirty-ice and clutter cases being compared.',
      yAxis: 'Percent (0-100): higher values mean a larger share of modeled samples in that outcome.',
      series: 'Clear ocean is the safer boundary interpretation. Deep false risk marks ambiguity from internal reflectors. Weak/no deep means no reliable deep return.',
      notice: (chart) => `${categoryExtremaSentence(chart, 'Clear ocean')} ${categoryExtremaSentence(chart, 'Deep false risk')} ${categoryExtremaSentence(chart, 'Weak/no deep')}`,
      takeaway: 'The safest scenarios are those with high clear-ocean share and low false-risk or weak/no-deep share.',
      whyItMatters: 'The project should not trust a bright return where the same assumptions produce high false-risk outcomes.'
    },
    'VHF 60 MHz Shallow Clutter Stress Test': {
      question: 'Does VHF shallow clutter dominate the interpretation under dirty or rough cases?',
      xAxis: 'Scenario: clean, near-surface brine, rough clutter, and complex clutter cases.',
      yAxis: 'Percent (0-100): higher bars show which outcome dominates that scenario.',
      series: 'Surface clutter is near-surface interference. Internal feature is a shallow reflector. Outside shallow window is not in the target shallow window. Weak/no detection means no reliable detection.',
      notice: (chart) => `${categoryExtremaSentence(chart, 'Surface clutter')} ${categoryExtremaSentence(chart, 'Internal feature')} ${categoryExtremaSentence(chart, 'Weak/no detection')}`,
      takeaway: 'VHF shallow returns can be dominated by clutter or internal features, especially in rough or complex cases.',
      whyItMatters: 'A shallow bright return should not be treated as deep boundary evidence, and clutter can still affect confidence.'
    }
  };

  function explanationValue(value, chart) {
    if (typeof value === 'function') {
      const result = value(chart);
      return result || '';
    }
    return value || '';
  }

  function fallbackChartExplanation(chart) {
    const seriesNames = (chart.series || []).map((series) => series.name).filter(Boolean).join(', ');
    return {
      fallback: true,
      question: `What does "${chart.title}" show under the current sensitivity settings?`,
      xAxis: `${chart.xLabel}: ${axisName(chart.xLabel).toLowerCase()} in the units shown on the axis.`,
      yAxis: `${chart.yLabel}: ${axisName(chart.yLabel).toLowerCase()} in the units shown on the axis. Higher, lower, positive, or negative values should be read with the chart note and threshold lines when present.`,
      series: seriesNames ? `The plotted series are: ${seriesNames}.` : 'No plotted series are available for this chart.',
      notice: `${chartTextSummary(chart)} ${chart.note || ''}`,
      takeaway: chart.note || 'Use the axes, legend, and plotted values to compare the current model settings.',
      whyItMatters: `This graph supports the project question: ${CORE_QUESTION}`,
      caveat: sectionCaveat(chart)
    };
  }

  function chartExplanationFor(chart) {
    const custom = CHART_EXPLANATIONS[chart.id] || CHART_EXPLANATIONS[chart.title] || null;
    const fallback = fallbackChartExplanation(chart);
    const merged = custom ? { ...fallback, ...custom, fallback: false } : fallback;
    const resolved = {};
    ['question', 'xAxis', 'yAxis', 'series', 'notice', 'takeaway', 'whyItMatters', 'caveat'].forEach((key) => {
      resolved[key] = explanationValue(merged[key], chart);
    });
    resolved.fallback = merged.fallback;
    if (!resolved.caveat) resolved.caveat = sectionCaveat(chart);
    return resolved;
  }

  function renderChartExplanation(chart) {
    const explanation = chartExplanationFor(chart);
    return `
      <aside class="chart-explanation ${explanation.fallback ? 'is-fallback' : ''}" data-explanation-source="${explanation.fallback ? 'fallback' : 'custom'}">
        <details class="explanation-details" open>
          <summary>How to read this graph</summary>
          <dl class="explanation-list">
            <div>
              <dt>Question</dt>
              <dd>${escapeHtml(explanation.question)}</dd>
            </div>
            <div>
              <dt>X-axis</dt>
              <dd>${escapeHtml(explanation.xAxis)}</dd>
            </div>
            <div>
              <dt>Y-axis</dt>
              <dd>${escapeHtml(explanation.yAxis)}</dd>
            </div>
            <div>
              <dt>Lines / bars</dt>
              <dd>${escapeHtml(explanation.series)}</dd>
            </div>
            <div>
              <dt>What to notice</dt>
              <dd>${escapeHtml(explanation.notice)}</dd>
            </div>
          </dl>
        </details>
        <div class="explanation-cardlets">
          <section>
            <h4>Main takeaway</h4>
            <p>${escapeHtml(explanation.takeaway)}</p>
          </section>
          <section>
            <h4>Why it matters</h4>
            <p>${escapeHtml(explanation.whyItMatters)}</p>
            <p class="model-caveat"><strong>Model limitation:</strong> ${escapeHtml(explanation.caveat)}</p>
          </section>
        </div>
      </aside>
    `;
  }

  function renderTable(targetId, rows, columns, limit) {
    const target = document.getElementById(targetId);
    if (!target) return;
    const label = humanizeId(targetId);
    const shown = limit ? rows.slice(0, limit) : rows;
    const head = columns.map((col) => `<th scope="col">${escapeHtml(col.label)}</th>`).join('');
    const body = shown.map((row) => {
      const cells = columns.map((col) => {
        const raw = row[col.key];
        const value = col.format ? col.format(raw, row) : formatValue(raw);
        const className = col.className ? ` class="${col.className(raw, row)}"` : '';
        return `<td${className}>${escapeHtml(value)}</td>`;
      }).join('');
      return `<tr>${cells}</tr>`;
    }).join('');
    target.innerHTML = `<div class="table-wrap" tabindex="0" role="region" aria-label="${escapeHtml(label)} table"><table><caption class="sr-only">${escapeHtml(label)}</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  function statusClass(value) {
    const text = String(value ?? '').toLowerCase();
    if (text.includes('ok') || text.includes('pass')) return 'status-ok';
    if (text.includes('below') || text.includes('review') || text.includes('check')) return 'status-warn';
    return '';
  }

  function controlGroup(key) {
    if (['z0', 'y', 'deltaZEdge', 'topographyOn', 'terrainSeed', 'ridgeHeight', 'craterDepth'].includes(key)) return 'Geometry';
    if (['nominalIceShell', 'lensMeanDepth', 'boundaryUncertainty', 'dirtyIceLevel', 'surfaceClutterLevel'].includes(key)) return 'Subsurface';
    if (['falseLayerEnabled', 'falseLayerCount', 'falseLayerDepthFraction', 'falseLayerStrength', 'receiverAmbiguityDb'].includes(key)) return 'False layer';
    if (['attenuation', 'detectionThreshold', 'iceIndex', 'alongTrackSpacingM', 'pulseLengthUs', 'windowLossDb', 'baseReflectivityDb', 'frequencySlopeDbPerOctave', 'referenceFrequencyMhz'].includes(key)) return 'Radar signal';
    return 'Model';
  }

  function controlMarkup(control, value, dataKey) {
    const dataAttr = dataKey === 'v30' ? 'data-v30-key' : 'data-live-key';
    if (control.type === 'checkbox') {
      return `
        <label class="control control-toggle">
          <span>${escapeHtml(control.label)}</span>
          <input type="checkbox" ${dataAttr}="${control.key}" ${value ? 'checked' : ''}>
        </label>
      `;
    }
    return `
      <label class="control">
        <span>${escapeHtml(control.label)}</span>
        <input type="range" min="${control.min}" max="${control.max}" step="${control.step}" value="${value}" ${dataAttr}="${control.key}">
        <output>${formatValue(value)}${control.unit ? ` ${escapeHtml(control.unit)}` : ''}</output>
      </label>
    `;
  }

  function groupedControls(controls, params, dataKey) {
    const groups = [];
    controls.forEach((control) => {
      const group = controlGroup(control.key);
      let target = groups.find((item) => item.group === group);
      if (!target) {
        target = { group, controls: [] };
        groups.push(target);
      }
      target.controls.push(control);
    });
    return groups.map((group) => `
      <fieldset class="control-group">
        <legend>${escapeHtml(group.group)}</legend>
        <div class="control-group-grid">
          ${group.controls.map((control) => controlMarkup(control, params[control.key], dataKey)).join('')}
        </div>
      </fieldset>
    `).join('');
  }

  function initTabs() {
    const tabs = document.querySelectorAll('.tab');
    const sections = document.querySelectorAll('.page-section');
    const validTargets = new Set(Array.from(sections).map((section) => section.id));
    function setActive(target, updateHash) {
      const next = validTargets.has(target) ? target : 'overview';
      tabs.forEach((t) => {
        const active = t.dataset.target === next;
        t.classList.toggle('is-active', active);
        t.setAttribute('aria-selected', active ? 'true' : 'false');
        t.setAttribute('tabindex', active ? '0' : '-1');
      });
      sections.forEach((section) => {
        const active = section.id === next;
        section.classList.toggle('is-active', active);
        section.setAttribute('role', 'tabpanel');
        section.hidden = !active;
      });
      if (updateHash) history.replaceState(null, '', `#${next}`);
    }
    tabs.forEach((tab, index) => {
      tab.setAttribute('role', 'tab');
      tab.id = `tab-${tab.dataset.target}`;
      const panel = document.getElementById(tab.dataset.target);
      if (panel) {
        tab.setAttribute('aria-controls', panel.id);
        panel.setAttribute('aria-labelledby', tab.id);
      }
      tab.addEventListener('click', () => {
        setActive(tab.dataset.target, true);
      });
      tab.addEventListener('keydown', (event) => {
        if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        let nextIndex = index;
        if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
        if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
        if (event.key === 'Home') nextIndex = 0;
        if (event.key === 'End') nextIndex = tabs.length - 1;
        tabs[nextIndex].focus();
        setActive(tabs[nextIndex].dataset.target, true);
      });
    });
    document.querySelectorAll('[data-tab-jump]').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        setActive(link.dataset.tabJump, true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
    setActive(window.location.hash.replace('#', ''), false);
    if (window.location.hash) {
      window.requestAnimationFrame(() => window.scrollTo(0, 0));
      window.setTimeout(() => window.scrollTo(0, 0), 100);
      window.setTimeout(() => window.scrollTo(0, 0), 350);
    }
  }

  function renderLiveControls() {
    const target = document.getElementById('live-controls');
    if (!target || !liveModel) return;
    target.innerHTML = groupedControls(liveModel.controls, liveParams, 'live');
    target.querySelectorAll('[data-live-key]').forEach((input) => {
      input.addEventListener('input', () => {
        const key = input.dataset.liveKey;
        liveParams[key] = input.type === 'checkbox' ? input.checked : Number(input.value);
        const output = input.parentElement.querySelector('output');
        const def = liveModel.controls.find((item) => item.key === key);
        if (output) output.textContent = `${formatValue(liveParams[key])}${def && def.unit ? ` ${def.unit}` : ''}`;
        updateLiveData();
      });
    });
    const reset = document.getElementById('reset-live-model');
    if (reset && !reset.dataset.bound) {
      reset.dataset.bound = 'true';
      reset.addEventListener('click', () => {
        liveParams = { ...liveModel.defaults };
        data = liveModel.compute(liveParams);
        renderLiveControls();
        renderLiveSections();
      });
    }
  }

  function renderV30Controls() {
    const target = document.getElementById('v30-controls');
    if (!target || !v30Model) return;
    target.innerHTML = groupedControls(v30Model.controls, v30Params, 'v30');
    target.querySelectorAll('[data-v30-key]').forEach((input) => {
      input.addEventListener('input', () => {
        const key = input.dataset.v30Key;
        v30Params[key] = input.type === 'checkbox' ? input.checked : Number(input.value);
        const output = input.parentElement.querySelector('output');
        const def = v30Model.controls.find((item) => item.key === key);
        if (output) output.textContent = `${formatValue(v30Params[key])}${def && def.unit ? ` ${def.unit}` : ''}`;
        updateV30Data();
      });
    });
    const reset = document.getElementById('reset-v30-model');
    if (reset && !reset.dataset.bound) {
      reset.dataset.bound = 'true';
      reset.addEventListener('click', () => {
        v30Params = { ...v30Model.defaults };
        v30ViewData = v30Model.compute(v30Params, v30Data);
        renderV30Controls();
        renderV30();
      });
    }
  }

  function updateLiveData() {
    if (!liveModel) return;
    data = liveModel.compute(liveParams);
    renderLiveSections();
  }

  function updateV30Data() {
    if (!v30Model || !v30Data) return;
    v30ViewData = v30Model.compute(v30Params, v30Data);
    renderV30();
  }

  function renderOverview() {
    document.getElementById('source-note').textContent = `Source: ${data.source.workbook}`;
    document.getElementById('caveat').textContent = data.overview.caveat;
    const summaryPicks = [
      'Flat apparent depth at mid-pass',
      'Topo apparent depth at mid-pass',
      'Depth change from topography',
      'Simple minimum PRF with topo',
      'Average bottom depth',
      'Best ocean echo margin',
      'Likely visible ocean samples',
      'False-boundary selected',
      'Mean raw slant error',
    ];
    const allRows = [...data.summary, ...data.subsurface, ...data.doppler];
    const picked = summaryPicks.map((label) => allRows.find((row) => row.label === label)).filter(Boolean);
    document.getElementById('metric-grid').innerHTML = picked.map(makeMetric).join('');
    renderDecisionLadder();
    renderTable('prf-table', data.prf, [
      { key: 'prfHz', label: 'PRF (Hz)' },
      { key: 'pulseIntervalMs', label: 'Pulse interval (ms)' },
      { key: 'spacingM', label: 'Spacing (m)' },
      { key: 'unambiguousRangeKm', label: 'Range (km)' },
      { key: 'status', label: 'Status', className: statusClass },
    ]);
    renderTable('realism-table', data.realism, [
      { key: 'score', label: 'Score' },
      { key: 'value', label: 'Value' },
      { key: 'meaning', label: 'Meaning' },
      { key: 'improveBy', label: 'Improve by' },
    ]);
  }

  function responseValue(label) {
    const row = (data.falseResponse || []).find((item) => item.label === label);
    return row ? row.value : 0;
  }

  function renderDecisionLadder() {
    const target = document.getElementById('decision-ladder');
    if (!target || !data.falseResponse) return;
    const decision = data.falseResponse[0] || {};
    const score = responseValue('Mid-pass heuristic score');
    const outcomes = [
      ['Ocean-boundary likely', responseValue('Ocean-boundary likely')],
      ['Ambiguous double return', responseValue('Ambiguous double return')],
      ['False-boundary selected', responseValue('False-boundary selected')],
      ['Weak/no deep detection', responseValue('Weak/no deep detection')]
    ];
    target.innerHTML = `
      <div class="decision-status">
        <span>Mid-pass classification</span>
        <strong>${escapeHtml(decision.value || 'Unavailable')}</strong>
        <p>${escapeHtml(decision.meaning || '')}</p>
        <small>Heuristic score: ${escapeHtml(formatValue(score))}%</small>
      </div>
      <div class="decision-bars" aria-label="Receiver outcome shares">
        ${outcomes.map(([label, value]) => `
          <div class="decision-bar">
            <span>${escapeHtml(label)}</span>
            <div><i style="width:${Math.max(0, Math.min(100, Number(value) || 0))}%"></i></div>
            <b>${escapeHtml(formatValue(value))}%</b>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderDetails() {
    renderTable('subsurface-summary', data.subsurface, [
      { key: 'label', label: 'Output' },
      { key: 'value', label: 'Value' },
      { key: 'unit', label: 'Unit' },
      { key: 'meaning', label: 'What it means' },
    ]);
    renderTable('doppler-table', data.doppler, [
      { key: 'label', label: 'Output' },
      { key: 'value', label: 'Value' },
      { key: 'unit', label: 'Unit' },
    ]);
    renderTable('doppler-input-table', data.dopplerInputs, [
      { key: 'label', label: 'Input' },
      { key: 'value', label: 'Value' },
      { key: 'unit', label: 'Unit' },
    ]);
    renderTable('false-response-summary', data.falseResponse, [
      { key: 'label', label: 'Output' },
      { key: 'value', label: 'Value' },
      { key: 'unit', label: 'Unit' },
      { key: 'meaning', label: 'What it means' },
    ]);
    renderTable('false-response-steps', data.falseSteps, [
      { key: 'step', label: 'Step' },
      { key: 'satelliteResponse', label: 'Satellite response' },
      { key: 'result', label: 'Result' },
    ]);
    renderTable('input-table', data.inputs, [
      { key: 'parameter', label: 'Parameter' },
      { key: 'value', label: 'Value' },
      { key: 'unit', label: 'Unit' },
    ], 24);
    renderTable('sub-input-table', data.subsurfaceInputs, [
      { key: 'section', label: 'Section' },
      { key: 'parameter', label: 'Parameter' },
      { key: 'value', label: 'Value' },
      { key: 'unit', label: 'Unit' },
    ], 24);
    const checkRows = [...data.checks, ...data.subsurfaceChecks];
    const checkColumns = [
      { key: 'check', label: 'Check' },
      { key: 'status', label: 'Status', className: statusClass },
      { key: 'formula', label: 'Formula / reason', format: (v, row) => v || row.why || '' },
    ];
    renderTable('checks-table', checkRows, checkColumns);
    renderTable('checks-table-full', checkRows, checkColumns);
  }

  function renderV30() {
    if (!v30ViewData) return;
    renderChartSet(v30ViewData.charts, 'v30-charts');
    renderAudit();
  }

  function renderCharts(section, targetId) {
    const target = document.getElementById(targetId);
    const charts = data.charts.filter((chart) => chart.section === section);
    renderChartSet(charts, targetId, target);
  }

  function chartPointValues(chart) {
    const values = [];
    chart.series.forEach((series) => {
      series.points.forEach((point) => {
        if (Number.isFinite(point[1])) values.push(point[1]);
      });
    });
    return values;
  }

  function seriesSignature(series) {
    return series.points.map((point) => point.map((value) => value == null ? 'null' : String(value)).join(':')).join('|');
  }

  function validateChart(chart) {
    const findings = [];
    const required = ['id', 'title', 'xLabel', 'yLabel', 'sourceSheet', 'note'];
    required.forEach((key) => {
      if (!chart[key]) findings.push({ level: 'serious', message: `Missing ${key}` });
    });
    if (!chart.series || !chart.series.length) findings.push({ level: 'serious', message: 'No plotted series' });

    const seenSeries = new Map();
    (chart.series || []).forEach((series) => {
      const points = series.points || [];
      if (!series.name) findings.push({ level: 'serious', message: 'Series is missing a label' });
      if (!points.length) findings.push({ level: 'warning', message: `${series.name || 'Series'} has no points` });
      if (/!\$?[A-Z]+\$?\d+/i.test(series.name || '')) findings.push({ level: 'warning', message: `${series.name} looks like a raw workbook range` });
      const finiteCount = points.filter((point) => Number.isFinite(point[1])).length;
      const nullCount = points.filter((point) => point[1] === null).length;
      if (finiteCount === 0 && nullCount === 0) findings.push({ level: 'serious', message: `${series.name || 'Series'} has no numeric y-values` });
      points.forEach((point) => {
        const x = point[0];
        const y = point[1];
        const xOk = typeof x === 'string' || Number.isFinite(x);
        const yOk = y === null || Number.isFinite(y);
        if (!xOk || !yOk) findings.push({ level: 'serious', message: `${series.name || 'Series'} contains a non-finite point` });
      });
      const signature = seriesSignature(series);
      if (seenSeries.has(signature)) {
        findings.push({ level: 'serious', message: `${series.name || 'Series'} duplicates ${seenSeries.get(signature)}` });
      } else {
        seenSeries.set(signature, series.name || 'another series');
      }
      if ((chart.kind || 'line') === 'line' && finiteCount === 1) {
        findings.push({ level: 'info', message: `${series.name || 'Series'} is rendered as a marker` });
      }
      if (nullCount && /radargram|lens/i.test(chart.title)) {
        findings.push({ level: 'info', message: 'Null lens-return gaps are treated as intentional' });
      }
    });

    const values = chartPointValues(chart);
    const labelText = `${chart.title || ''} ${chart.yLabel || ''} ${(chart.series || []).map((series) => series.name).join(' ')}`.toLowerCase();
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (values.length && /percent|%|score|support/.test(labelText) && max <= 1.05 && min >= 0) {
      findings.push({ level: 'serious', message: 'Percent-style chart appears to use 0-1 shares' });
    }
    const yLabelText = String(chart.yLabel || '').toLowerCase();
    if (values.length && /\(us\)|delay/.test(yLabelText) && /depth/.test(labelText)) {
      findings.push({ level: 'serious', message: 'Delay chart text still references depth values' });
    }
    if ((chart.kind || 'line') === 'bar' && chart.xLabel && /scenario|material|instrument|interface/i.test(chart.xLabel)) {
      const firstSeries = chart.series && chart.series[0];
      const numericCategories = firstSeries && firstSeries.points.every((point) => Number.isFinite(point[0]));
      if (numericCategories) findings.push({ level: 'warning', message: 'Categorical bar chart uses numeric category indices' });
    }
    return findings;
  }

  function validateChartSet(label, charts) {
    const titleCounts = new Map();
    (charts || []).forEach((chart) => {
      titleCounts.set(chart.title, (titleCounts.get(chart.title) || 0) + 1);
    });
    const rows = [];
    let serious = 0;
    let warnings = 0;
    (charts || []).forEach((chart) => {
      const findings = validateChart(chart);
      if (titleCounts.get(chart.title) > 1) findings.push({ level: 'serious', message: 'Duplicate chart title in this dataset' });
      findings.forEach((finding) => {
        if (finding.level === 'serious') serious += 1;
        if (finding.level === 'warning') warnings += 1;
      });
      const visibleFindings = findings.filter((finding) => finding.level !== 'info');
      rows.push({
        chart: chart.title,
        scope: label,
        status: visibleFindings.length ? 'Review' : 'OK',
        notes: visibleFindings.length ? visibleFindings.map((finding) => finding.message).join('; ') : 'Metadata, units, series, and values look consistent.'
      });
    });
    return { label, rows, serious, warnings };
  }

  function renderAudit() {
    const sets = [
      validateChartSet('Baseline live model', data.charts || []),
      validateChartSet('Advanced sensitivity model', (v30ViewData && v30ViewData.charts) || [])
    ];
    const serious = sets.reduce((sum, item) => sum + item.serious, 0);
    const warnings = sets.reduce((sum, item) => sum + item.warnings, 0);
    const rows = sets.flatMap((item) => item.rows);
    const summary = `
      <div class="audit-score-grid">
        <article class="audit-score ${serious ? 'is-warn' : 'is-ok'}">
          <span>${serious ? 'Review' : 'Clean'}</span>
          <strong>${serious}</strong>
          <p>serious chart issues</p>
        </article>
        <article class="audit-score">
          <span>Warnings</span>
          <strong>${warnings}</strong>
          <p>non-blocking items</p>
        </article>
        <article class="audit-score">
          <span>Charts</span>
          <strong>${rows.length}</strong>
          <p>rendered and checked</p>
        </article>
      </div>
    `;
    const columns = [
      { key: 'scope', label: 'Scope' },
      { key: 'chart', label: 'Chart' },
      { key: 'status', label: 'Status', className: statusClass },
      { key: 'notes', label: 'Audit note' }
    ];
    const overview = document.getElementById('graph-audit');
    if (overview) {
      const reviewRows = rows.filter((row) => row.status !== 'OK');
      overview.innerHTML = summary + (reviewRows.length ? '<div id="graph-audit-table-inline"></div>' : '') + `<p class="audit-note">${serious ? 'Open the Audit tab for details.' : 'No serious chart issues detected after live recalculation.'}</p>`;
      if (reviewRows.length) renderTable('graph-audit-table-inline', reviewRows, columns, 5);
    }
    const full = document.getElementById('graph-audit-full');
    if (full) {
      full.innerHTML = summary + '<div id="graph-audit-table-full"></div>';
      renderTable('graph-audit-table-full', rows, columns);
    }
  }

  function chartBadges(chart) {
    return validateChart(chart).filter((finding) => finding.level !== 'info');
  }

  function chartHint(chart) {
    const text = `${chart.title} ${chart.yLabel}`.toLowerCase();
    if (text.includes('decision code')) return 'Decision code: 0 means weak/no lock, 1 means ocean likely, 2 means ambiguous, and 3 means the false layer is selected.';
    if (text.includes('false layer') || text.includes('picked boundary')) return 'Use this to see whether the receiver follows the true ocean boundary or gets pulled to an internal false reflector.';
    if (text.includes('delay')) return 'Read as round-trip timing: larger values mean longer extra path or deeper in-ice travel time.';
    if (text.includes('doppler')) return 'Compare angle or depth curves; residual error is expected because the live correction includes a small deterministic angle offset.';
    if (text.includes('margin') || text.includes('threshold')) return 'Values above the zero reference are easier to detect in this simplified threshold model.';
    if (text.includes('percent') || text.includes('support') || text.includes('confidence')) return 'Percent-style series are scaled 0-100 so scenario bars can be compared directly.';
    if (text.includes('surface') || text.includes('terrain')) return 'Use this to compare the target terrain path against the nadir reference used by the range equations.';
    return 'Use the axes and legend to compare each modeled series under the current live assumptions.';
  }

  function chartTextSummary(chart) {
    const values = chartPointValues(chart);
    const series = (chart.series || []).map((item) => item.name).join(', ');
    if (!values.length) return `Series: ${series || 'none'}. No numeric values are available.`;
    const min = Math.min(...values);
    const max = Math.max(...values);
    return `Series: ${series}. Value range: ${formatValue(min)} to ${formatValue(max)} ${axisUnit(chart.yLabel) || axisName(chart.yLabel)}.`;
  }

  function renderChartSet(charts, targetId, knownTarget) {
    const target = knownTarget || document.getElementById(targetId);
    if (!target) return;
    target.innerHTML = charts.map((chart) => {
      const badges = chartBadges(chart);
      return `
      <article class="chart-card ${badges.length ? 'has-warning' : ''}">
        <div class="chart-title-row">
          <div>
            <h3>${escapeHtml(chart.title)}</h3>
            <p class="chart-note">${escapeHtml(chart.note)}</p>
          </div>
          <span class="chart-source">${escapeHtml(chart.sourceSheet)}</span>
        </div>
        ${badges.length ? `<div class="chart-badges">${badges.map((badge) => `<span>${escapeHtml(badge.message)}</span>`).join('')}</div>` : ''}
        <div class="chart-frame" id="${chart.id}"></div>
        <p class="chart-explainer">${escapeHtml(chartHint(chart))}</p>
        ${renderChartExplanation(chart)}
        <details class="chart-data-summary">
          <summary>Text summary</summary>
          <p>${escapeHtml(chartTextSummary(chart))}</p>
        </details>
        ${chart.formulaNote ? `<p class="formula-note">${escapeHtml(chart.formulaNote)}</p>` : ''}
        <div class="legend">${chart.series.map((series, index) => `
          <span class="legend-item"><span class="legend-swatch" style="background:${colors[index % colors.length]}"></span>${escapeHtml(series.name)}</span>
        `).join('')}</div>
      </article>
    `;
    }).join('');
    charts.forEach((chart) => drawChart(document.getElementById(chart.id), chart));
  }

  function finitePoints(chart) {
    const points = [];
    chart.series.forEach((series, seriesIndex) => {
      series.points.forEach((point) => {
        const x = point[0];
        const y = point[1];
        const label = point[2] ?? point[0];
        if (Number.isFinite(x) && Number.isFinite(y)) {
          points.push({ x, y, label, seriesIndex, seriesName: series.name });
        }
      });
    });
    return points;
  }

  function normalizeChart(chart) {
    const labels = [];
    const labelToIndex = new Map();
    const hasCategory = chart.series.some((series) => series.points.some((point) => typeof point[0] === 'string'));
    if (!hasCategory) return { ...chart, categories: null };
    const series = chart.series.map((item) => ({
      ...item,
      points: item.points.map((point) => {
        const raw = String(point[0]);
        if (!labelToIndex.has(raw)) {
          labels.push(raw);
          labelToIndex.set(raw, labels.length);
        }
        return [labelToIndex.get(raw), point[1], raw];
      }),
    }));
    return { ...chart, series, categories: labels };
  }

  function extent(values, options) {
    const config = options || {};
    let min = Infinity;
    let max = -Infinity;
    values.forEach((value) => {
      if (Number.isFinite(value)) {
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
    });
    if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
    if (config.percentScale) {
      min = Math.min(0, min);
      max = Math.max(100, max);
    }
    if (config.includeZero) {
      min = Math.min(0, min);
      max = Math.max(0, max);
    }
    if (min === max) return [min - 1, max + 1];
    const pad = (max - min) * 0.08;
    return [min - pad, max + pad];
  }

  function ticks(min, max, count) {
    const span = max - min || 1;
    const rawStep = span / Math.max(count - 1, 1);
    const magnitude = 10 ** Math.floor(Math.log10(Math.abs(rawStep) || 1));
    const residual = rawStep / magnitude;
    const niceResidual = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10;
    const step = niceResidual * magnitude;
    const start = Math.ceil(min / step) * step;
    const out = [];
    for (let value = start; value <= max + step * 0.5; value += step) {
      out.push(Number(value.toFixed(10)));
    }
    if (!out.length) return [min, max];
    return out;
  }

  function chartUsesPercent(chart) {
    const text = `${chart.title || ''} ${chart.yLabel || ''}`.toLowerCase();
    const values = chartPointValues(chart);
    const max = Math.max(...values);
    return /percent|%|support|score/.test(text) && max <= 105 && max >= 0;
  }

  function drawChart(container, chart) {
    if (!container) return;
    const prepared = normalizeChart(chart);
    const width = 760;
    const height = 420;
    const rotateLabels = prepared.categories && prepared.categories.some((label) => String(label).length > 12);
    const margin = { top: 24, right: 30, bottom: prepared.categories ? (rotateLabels ? 92 : 68) : 58, left: 82 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const points = finitePoints(prepared);
    const [xMin, xMax] = extent(points.map((p) => p.x));
    const yValues = points.map((p) => p.y);
    const [rawYMin, rawYMax] = extent(yValues);
    const [yMin, yMax] = extent(yValues, {
      includeZero: prepared.kind === 'bar' || rawYMin < 0 && rawYMax > 0 || /margin|error|residual/i.test(prepared.yLabel),
      percentScale: chartUsesPercent(prepared)
    });
    const sx = (x) => margin.left + ((x - xMin) / (xMax - xMin || 1)) * plotWidth;
    const sy = (y) => margin.top + plotHeight - ((y - yMin) / (yMax - yMin || 1)) * plotHeight;

    const xTicks = prepared.categories
      ? categoryTicks(prepared.categories.length)
      : ticks(xMin, xMax, 6);
    const yTicks = ticks(yMin, yMax, 5);
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(prepared.title)}">`;
    yTicks.forEach((tick) => {
      const y = sy(tick);
      svg += `<line class="grid-line" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line>`;
      svg += `<text class="axis" x="${margin.left - 10}" y="${y + 4}" text-anchor="end">${formatAxisValue(tick)}</text>`;
    });
    xTicks.forEach((tick) => {
      const x = sx(tick);
      svg += `<line class="grid-line" x1="${x}" y1="${margin.top}" x2="${x}" y2="${height - margin.bottom}"></line>`;
      const label = prepared.categories ? shortenAxisLabel(prepared.categories[Math.round(tick) - 1] || '') : formatAxisValue(tick);
      if (rotateLabels) {
        svg += `<text class="axis" x="${x - 4}" y="${height - margin.bottom + 22}" text-anchor="end" transform="rotate(-28 ${x - 4} ${height - margin.bottom + 22})">${escapeHtml(label)}</text>`;
      } else {
        svg += `<text class="axis" x="${x}" y="${height - margin.bottom + 22}" text-anchor="middle">${escapeHtml(label)}</text>`;
      }
    });
    svg += `<line class="axis-line" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"></line>`;
    svg += `<line class="axis-line" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>`;
    svg += `<text class="axis-label" x="${margin.left + plotWidth / 2}" y="${height - 12}" text-anchor="middle">${escapeHtml(prepared.xLabel)}</text>`;
    svg += `<text class="axis-label" transform="translate(16 ${margin.top + plotHeight / 2}) rotate(-90)" text-anchor="middle">${escapeHtml(prepared.yLabel)}</text>`;
    if (yMin < 0 && yMax > 0) {
      const zeroY = sy(0);
      const zeroLabel = /db|margin|threshold/i.test(prepared.yLabel) ? '0 dB' : '0';
      svg += `<line class="reference-line" x1="${margin.left}" y1="${zeroY}" x2="${width - margin.right}" y2="${zeroY}"></line>`;
      svg += `<text class="reference-label" x="${width - margin.right}" y="${zeroY - 6}" text-anchor="end">${zeroLabel}</text>`;
    }

    if (prepared.kind === 'bar') {
      svg += drawBars(prepared, sx, sy, yMin, height - margin.bottom, plotWidth, margin.left);
    } else {
      prepared.series.forEach((series, index) => {
        const path = linePath(series.points, sx, sy);
        if (path) {
          svg += `<path d="${path}" fill="none" stroke="${colors[index % colors.length]}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path>`;
        }
        const finiteSeriesPoints = series.points.filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
        const markerSeries = finiteSeriesPoints.length <= 20 || /selected|setting|residual/i.test(series.name);
        if (markerSeries) {
          finiteSeriesPoints.forEach((point) => {
            svg += `<circle class="series-marker" cx="${sx(point[0])}" cy="${sy(point[1])}" r="4" fill="${colors[index % colors.length]}"></circle>`;
          });
        }
      });
    }
    svg += `<rect x="${margin.left}" y="${margin.top}" width="${plotWidth}" height="${plotHeight}" fill="transparent" data-hit="true"></rect>`;
    svg += '</svg>';
    container.innerHTML = svg;
    const hit = container.querySelector('[data-hit="true"]');
    hit.addEventListener('mousemove', (event) => showTooltip(event, chart, points, sx, sy));
    hit.addEventListener('mouseleave', hideTooltip);
  }

  function categoryTicks(count) {
    if (count <= 8) return Array.from({ length: count }, (_, index) => index + 1);
    const step = Math.ceil(count / 6);
    const ticksOut = [];
    for (let i = 1; i <= count; i += step) ticksOut.push(i);
    if (ticksOut[ticksOut.length - 1] !== count) ticksOut.push(count);
    return ticksOut;
  }

  function shortenAxisLabel(value) {
    const text = String(value);
    return text.length > 20 ? `${text.slice(0, 18)}...` : text;
  }

  function drawBars(chart, sx, sy, yMin, baseY, plotWidth, left) {
    const categoryCount = chart.categories ? chart.categories.length : Math.max(...chart.series.map((series) => series.points.length));
    const groupWidth = Math.max(18, Math.min(58, plotWidth / Math.max(categoryCount * 1.5, 1)));
    const barWidth = Math.max(3, groupWidth / Math.max(chart.series.length, 1));
    const zeroY = sy(0);
    const baseline = yMin < 0 ? zeroY : baseY;
    let rects = '';
    chart.series.forEach((series, seriesIndex) => {
      series.points.forEach((point) => {
        if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) return;
        const x = sx(point[0]) - groupWidth / 2 + seriesIndex * barWidth;
        const y = sy(point[1]);
        const h = Math.max(1, Math.abs(baseline - y));
        rects += `<rect x="${x}" y="${Math.min(y, baseline)}" width="${Math.max(2, barWidth - 1)}" height="${h}" fill="${colors[seriesIndex % colors.length]}"></rect>`;
      });
    });
    return rects;
  }

  function linePath(points, sx, sy) {
    let path = '';
    let active = false;
    points.forEach((point) => {
      const x = point[0];
      const y = point[1];
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        active = false;
        return;
      }
      path += `${active ? 'L' : 'M'}${sx(x).toFixed(2)} ${sy(y).toFixed(2)} `;
      active = true;
    });
    return path.trim();
  }

  function axisName(label) {
    return String(label || '').replace(/\s*\([^)]*\)/g, '').trim() || 'Value';
  }

  function axisUnit(label) {
    const text = String(label || '');
    const match = text.match(/\(([^)]+)\)/);
    if (match) {
      const unit = match[1].trim();
      if (/^0\s*-\s*100$/i.test(unit) && /percent|score|confidence/i.test(text)) return /percent/i.test(text) ? '%' : '';
      return unit;
    }
    if (/\bdb\b/i.test(text)) return 'dB';
    if (/%|percent/i.test(text)) return '%';
    return '';
  }

  function formatWithAxis(value, label, digits) {
    const unit = axisUnit(label);
    const formatted = typeof value === 'number' ? formatValue(value, digits) : String(value);
    if (!unit) return formatted;
    return `${formatted} ${unit}`;
  }

  function showTooltip(event, chart, points, sx, sy) {
    if (!points.length) return;
    const rect = event.currentTarget.ownerSVGElement.getBoundingClientRect();
    const scaleX = 760 / rect.width;
    const scaleY = 420 / rect.height;
    const localX = (event.clientX - rect.left) * scaleX;
    const localY = (event.clientY - rect.top) * scaleY;
    let best = points[0];
    let bestDist = Infinity;
    points.forEach((point) => {
      const dx = sx(point.x) - localX;
      const dy = sy(point.y) - localY;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        best = point;
      }
    });
    tooltip.innerHTML = `
      <p class="tooltip-title">${escapeHtml(best.seriesName)}</p>
      <p class="tooltip-line">${escapeHtml(axisName(chart.xLabel))}: ${escapeHtml(formatWithAxis(best.label, chart.xLabel, 3))}</p>
      <p class="tooltip-line">${escapeHtml(axisName(chart.yLabel))}: ${escapeHtml(formatWithAxis(best.y, chart.yLabel, 3))}</p>
    `;
    tooltip.hidden = false;
    tooltip.style.left = `${Math.min(window.innerWidth - 300, event.clientX + 14)}px`;
    tooltip.style.top = `${event.clientY + 14}px`;
  }

  function hideTooltip() {
    tooltip.hidden = true;
  }

  function renderLiveSections() {
    renderOverview();
    renderDetails();
    renderCharts('Surface and motion', 'surface-charts');
    renderCharts('Subsurface model', 'subsurface-charts');
    renderCharts('False-layer response', 'false-layer-charts');
    renderCharts('Doppler depth correction', 'doppler-charts');
    renderAudit();
  }

  function renderAll() {
    renderLiveSections();
    renderV30();
  }

  initTabs();
  renderLiveControls();
  renderV30Controls();
  renderAll();
})();
