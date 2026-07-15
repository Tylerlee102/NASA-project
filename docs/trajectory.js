(() => {
  'use strict';

  const C = 299792458;
  const spiceFlyby = window.CLIPPER_SPICE_FLYBY;
  if (!spiceFlyby || !Array.isArray(spiceFlyby.samples) || spiceFlyby.samples.length < 3) {
    const error = document.getElementById('trajectory-status');
    if (error) {
      error.className = 'trajectory-status is-overlap';
      error.textContent = 'SPICE flyby data did not load. Regenerate docs/data/clipper-flyby.js and reload this page.';
    }
    return;
  }

  const spiceSamples = spiceFlyby.samples;
  const model = {
    europaRadiusKm: spiceFlyby.body.meanRadiusKm,
    closestAltitudeKm: spiceFlyby.closestApproach.altitudeKm,
    frequencyMhz: 60,
    iceIndex: 1.78,
    targetDepthKm: 6.74,
    pointCount: 12,
    dopplerToleranceHz: 25,
    depthToleranceKm: 0.15,
    timeMinS: spiceFlyby.window.startOffsetSeconds,
    timeMaxS: spiceFlyby.window.endOffsetSeconds,
    radarTickS: 0.01,
    blockTicks: 10,
    predictionTicks: 9,
    candidatePrfsHz: [1150, 1325, 1525, 1725],
    clutterArcMinKm: -240,
    clutterArcMaxKm: 240,
    clutterSearchStepKm: 5,
    clutterBandStepKm: 1,
    timelineStepS: 0.05
  };
  model.blockDurationS = model.radarTickS * model.blockTicks;

  const wavelengthM = C / (model.frequencyMhz * 1e6);
  const targetEquivalentRadiusKm = model.europaRadiusKm - model.iceIndex * model.targetDepthKm;
  const requiredSurfaceRangeKm = model.closestAltitudeKm + model.iceIndex * model.targetDepthKm;
  const closestCenterDistanceKm = model.europaRadiusKm + model.closestAltitudeKm;
  const surfaceArcCosine = Math.max(-1, Math.min(1,
    (closestCenterDistanceKm ** 2 + model.europaRadiusKm ** 2 - requiredSurfaceRangeKm ** 2)
      / (2 * closestCenterDistanceKm * model.europaRadiusKm)
  ));
  const targetSurfaceArcKm = model.europaRadiusKm * Math.acos(surfaceArcCosine);
  const clutterSpreadKm = targetSurfaceArcKm * 11 / 5;
  const pointArcsKm = Array.from({ length: model.pointCount }, (_, index) => (
    -clutterSpreadKm + (2 * clutterSpreadKm * index) / (model.pointCount - 1)
  ));
  const clutterSearchArcsKm = Array.from({
    length: Math.round((model.clutterArcMaxKm - model.clutterArcMinKm) / model.clutterSearchStepKm) + 1
  }, (_, index) => model.clutterArcMinKm + index * model.clutterSearchStepKm);

  const radialBasis = spiceFlyby.localBasis.radial;
  const alongTrackBasis = spiceFlyby.localBasis.alongTrack;
  const crossTrackBasis = spiceFlyby.localBasis.crossTrack;

  const slider = document.getElementById('time-slider');
  const timeOutput = document.getElementById('time-output');
  const playButton = document.getElementById('play-button');
  const closestButton = document.getElementById('closest-button');
  const altitudeValue = document.getElementById('altitude-value');
  const trackValue = document.getElementById('track-value');
  const speedValue = document.getElementById('speed-value');
  const prfValue = document.getElementById('prf-value');
  const blockValue = document.getElementById('block-value');
  const clockValue = document.getElementById('clock-value');
  const closestUtcValue = document.getElementById('closest-utc-value');
  const status = document.getElementById('trajectory-status');
  const geometryPlot = document.getElementById('geometry-plot');
  const schedulePlot = document.getElementById('fold-plot');
  const scorePlot = document.getElementById('trace-plot');
  const dopplerPlot = document.getElementById('doppler-plot');
  const fixedRadargramPlot = document.getElementById('fixed-radargram-plot');
  const adaptiveRadargramPlot = document.getElementById('adaptive-radargram-plot');
  const postprocessedRadargramPlot = document.getElementById('postprocessed-radargram-plot');
  const candidateScoreGrid = document.getElementById('candidate-score-grid');
  const sampleTableBody = document.getElementById('spice-sample-table-body');
  const sampleTableWrap = document.getElementById('sample-table-wrap');

  const telemetryIds = [
    'current-utc-value',
    'center-distance-value',
    'radial-speed-value',
    'cross-track-value',
    'target-range-value',
    'target-doppler-value',
    'nearest-alias-value',
    'position-x-value',
    'position-y-value',
    'position-z-value',
    'velocity-x-value',
    'velocity-y-value',
    'velocity-z-value',
    'encounter-number-value',
    'encounter-utc-value',
    'encounter-altitude-value',
    'encounter-location-value',
    'europa-radii-value',
    'sample-cadence-value',
    'state-definition-value',
    'spk-file-value',
    'spk-coverage-value',
    'spk-sha-value',
    'artifact-generated-value'
  ];
  const schedulerIds = [
    'source-interval-value',
    'current-block-value',
    'block-span-value',
    'selected-prf-value',
    'selected-score-value',
    'fixed-prf-value',
    'fixed-overlap-count-value',
    'adaptive-overlap-count-value',
    'switch-count-value',
    'radar-tick-count-value'
  ];
  const telemetry = Object.fromEntries(telemetryIds.map((id) => [id, document.getElementById(id)]));
  const schedulerTelemetry = Object.fromEntries(schedulerIds.map((id) => [id, document.getElementById(id)]));

  const dot3 = (left, right) => left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
  const norm3 = (vector) => Math.hypot(vector[0], vector[1], vector[2]);
  const mix3 = (left, right, fraction) => left.map((value, index) => (
    value + (right[index] - value) * fraction
  ));
  const mod = (value, divisor) => ((value % divisor) + divisor) % divisor;
  const alias = (frequencyHz, prfHz) => mod(frequencyHz + prfHz / 2, prfHz) - prfHz / 2;
  const fmt = (value, digits = 1) => Number(value).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
  const signed = (value, digits = 1) => `${value > 0 ? '+' : ''}${fmt(Math.abs(value) < 0.0005 ? 0 : value, digits)}`;
  const displayUtc = (value) => `${value.replace('T', ' ')} UTC`;
  const closestApproachUtcMs = Date.parse(`${spiceFlyby.closestApproach.utc}Z`);
  const utcAtOffset = (offsetSeconds) => new Date(closestApproachUtcMs + offsetSeconds * 1000)
    .toISOString()
    .replace('T', ' ')
    .replace('Z', ' UTC');
  const prfLabel = (index) => `P${index + 1}`;
  const linePath = (rows, x, y, accessor) => rows.map((row, index) => {
    const point = accessor(row);
    return `${index ? 'L' : 'M'} ${x(point.x).toFixed(2)} ${y(point.y).toFixed(2)}`;
  }).join(' ');

  function spacecraftAt(timeS) {
    const clampedTimeS = Math.max(model.timeMinS, Math.min(model.timeMaxS, timeS));
    const sampleStepS = spiceFlyby.window.stepSeconds;
    const floatingIndex = (clampedTimeS - model.timeMinS) / sampleStepS;
    const lowerIndex = Math.max(0, Math.min(spiceSamples.length - 1, Math.floor(floatingIndex)));
    const upperIndex = Math.min(spiceSamples.length - 1, lowerIndex + 1);
    const fraction = Math.max(0, Math.min(1, floatingIndex - lowerIndex));
    const lower = spiceSamples[lowerIndex];
    const upper = spiceSamples[upperIndex];
    const positionKm = mix3(lower.positionKm, upper.positionKm, fraction);
    const velocityKmS = mix3(lower.velocityKmS, upper.velocityKmS, fraction);
    const centerDistanceKm = norm3(positionKm);
    return {
      positionKm,
      velocityKmS,
      distanceKm: centerDistanceKm,
      xKm: dot3(positionKm, alongTrackBasis),
      crossTrackKm: dot3(positionKm, crossTrackBasis),
      altitudeKm: centerDistanceKm - model.europaRadiusKm,
      speedKmS: norm3(velocityKmS),
      radialSpeedKmS: dot3(positionKm, velocityKmS) / centerDistanceKm
    };
  }

  function measurePoint(spacecraft, radiusKm, surfaceArcKm) {
    const angle = surfaceArcKm / model.europaRadiusKm;
    const pointPositionKm = radialBasis.map((radialValue, index) => (
      radiusKm * (radialValue * Math.cos(angle) + alongTrackBasis[index] * Math.sin(angle))
    ));
    const lineOfSightKm = pointPositionKm.map((value, index) => value - spacecraft.positionKm[index]);
    const rangeKm = norm3(lineOfSightKm);
    const rangeRateKmS = -dot3(lineOfSightKm, spacecraft.velocityKmS) / rangeKm;
    return {
      surfaceArcKm,
      pointPositionKm,
      pointXKm: dot3(pointPositionKm, alongTrackBasis),
      rangeKm,
      apparentDepthKm: (rangeKm - spacecraft.altitudeKm) / model.iceIndex,
      trueDopplerHz: -2 * rangeRateKmS * 1000 / wavelengthM
    };
  }

  function contextAt(timeS) {
    const spacecraft = spacecraftAt(timeS);
    return {
      timeS,
      spacecraft,
      target: measurePoint(spacecraft, targetEquivalentRadiusKm, 0)
    };
  }

  const closestContext = contextAt(0);
  const closestPoints = pointArcsKm.map((surfaceArcKm, index) => ({
    index,
    ...measurePoint(closestContext.spacecraft, model.europaRadiusKm, surfaceArcKm)
  }));
  const foldingIndexes = new Set(
    [...closestPoints]
      .sort((a, b) => Math.abs(a.apparentDepthKm - closestContext.target.apparentDepthKm)
        - Math.abs(b.apparentDepthKm - closestContext.target.apparentDepthKm))
      .slice(0, 2)
      .map((point) => point.index)
  );
  const closestFoldingPair = closestPoints.filter((point) => foldingIndexes.has(point.index));
  const fixedBadPrfHz = closestFoldingPair.reduce((sum, point) => (
    sum + Math.abs(point.trueDopplerHz - closestContext.target.trueDopplerHz)
  ), 0) / closestFoldingPair.length;

  function clutterThreat(context, prfHz) {
    let best = null;
    let overlapPoint = null;
    clutterSearchArcsKm.forEach((surfaceArcKm) => {
      const point = measurePoint(context.spacecraft, model.europaRadiusKm, surfaceArcKm);
      const relativeDopplerHz = point.trueDopplerHz - context.target.trueDopplerHz;
      const aliasHz = alias(relativeDopplerHz, prfHz);
      const depthOffsetKm = point.apparentDepthKm - context.target.apparentDepthKm;
      const jointScore = Math.hypot(
        aliasHz / model.dopplerToleranceHz,
        depthOffsetKm / model.depthToleranceKm
      );
      const candidate = { ...point, aliasHz, depthOffsetKm, jointScore };
      if (!best || candidate.jointScore < best.jointScore) best = candidate;
      if (Math.abs(aliasHz) <= model.dopplerToleranceHz
        && Math.abs(depthOffsetKm) <= model.depthToleranceKm
        && (!overlapPoint || candidate.jointScore < overlapPoint.jointScore)) {
        overlapPoint = candidate;
      }
    });
    return { ...best, overlap: Boolean(overlapPoint), overlapPoint };
  }

  function scoreCandidateBlock(blockStartS, prfHz) {
    let minimumScore = Infinity;
    let overlapTicks = 0;
    for (let tick = 1; tick <= model.predictionTicks; tick += 1) {
      const timeS = Math.min(model.timeMaxS, blockStartS + tick * model.radarTickS);
      const threat = clutterThreat(contextAt(timeS), prfHz);
      minimumScore = Math.min(minimumScore, threat.jointScore);
      if (threat.overlap) overlapTicks += 1;
    }
    return { minimumScore, overlapTicks };
  }

  const blockCount = Math.round((model.timeMaxS - model.timeMinS) / model.blockDurationS);
  const schedule = Array.from({ length: blockCount }, (_, blockIndex) => {
    const startS = model.timeMinS + blockIndex * model.blockDurationS;
    const candidates = model.candidatePrfsHz.map((prfHz) => scoreCandidateBlock(startS, prfHz));
    const selectedIndex = candidates.reduce((bestIndex, candidate, index) => (
      candidate.minimumScore > candidates[bestIndex].minimumScore ? index : bestIndex
    ), 0);
    return {
      blockIndex,
      startS,
      endS: Math.min(model.timeMaxS, startS + model.blockDurationS),
      selectedIndex,
      selectedPrfHz: model.candidatePrfsHz[selectedIndex],
      selectedScore: candidates[selectedIndex].minimumScore,
      candidates
    };
  });

  function blockForTime(timeS) {
    const index = Math.max(0, Math.min(
      schedule.length - 1,
      Math.floor((timeS - model.timeMinS) / model.blockDurationS + 1e-9)
    ));
    return schedule[index];
  }

  function continuousFoldBands(context, prfHz) {
    const groups = [];
    let active = null;
    let activeFoldOrder = null;
    for (let surfaceArcKm = model.clutterArcMinKm;
      surfaceArcKm <= model.clutterArcMaxKm + 1e-9;
      surfaceArcKm += model.clutterBandStepKm) {
      const point = measurePoint(context.spacecraft, model.europaRadiusKm, surfaceArcKm);
      const relativeDopplerHz = point.trueDopplerHz - context.target.trueDopplerHz;
      const foldOrder = Math.round(relativeDopplerHz / prfHz);
      const residualHz = Math.abs(relativeDopplerHz - foldOrder * prfHz);
      const isCandidate = foldOrder !== 0
        && residualHz <= model.dopplerToleranceHz
        && point.apparentDepthKm >= 0
        && point.apparentDepthKm <= 40;
      if (isCandidate) {
        if (!active || activeFoldOrder !== foldOrder) {
          active = [];
          activeFoldOrder = foldOrder;
          groups.push(active);
        }
        active.push({ ...point, foldOrder, residualHz });
      } else {
        active = null;
        activeFoldOrder = null;
      }
    }
    return groups.map((group) => {
      const center = group.reduce((best, point) => point.residualHz < best.residualHz ? point : best);
      return {
        foldOrder: center.foldOrder,
        centerDepthKm: center.apparentDepthKm,
        minDepthKm: Math.min(...group.map((point) => point.apparentDepthKm)),
        maxDepthKm: Math.max(...group.map((point) => point.apparentDepthKm)),
        centerArcKm: center.surfaceArcKm
      };
    });
  }

  function stateAt(timeS, prfHz) {
    const context = contextAt(timeS);
    const points = pointArcsKm.map((surfaceArcKm, index) => {
      const point = measurePoint(context.spacecraft, model.europaRadiusKm, surfaceArcKm);
      return {
        index,
        ...point,
        relativeAliasHz: alias(point.trueDopplerHz - context.target.trueDopplerHz, prfHz)
      };
    });
    return {
      ...context,
      prfHz,
      points,
      foldingPair: points.filter((point) => foldingIndexes.has(point.index)),
      bands: continuousFoldBands(context, prfHz),
      threat: clutterThreat(context, prfHz)
    };
  }

  const radarTickCount = Math.round((model.timeMaxS - model.timeMinS) / model.radarTickS) + 1;
  let fixedOverlapTicks = 0;
  let adaptiveOverlapTicks = 0;
  for (let tickIndex = 0; tickIndex < radarTickCount; tickIndex += 1) {
    const timeS = Math.min(model.timeMaxS, model.timeMinS + tickIndex * model.radarTickS);
    const context = contextAt(timeS);
    if (clutterThreat(context, fixedBadPrfHz).overlap) fixedOverlapTicks += 1;
    if (clutterThreat(context, blockForTime(timeS).selectedPrfHz).overlap) adaptiveOverlapTicks += 1;
  }
  const switchCount = schedule.slice(1).filter((block, index) => (
    block.selectedIndex !== schedule[index].selectedIndex
  )).length;

  function timelineRow(timeS, prfHz, selectedIndex) {
    const context = contextAt(timeS);
    return {
      ...context,
      prfHz,
      selectedIndex,
      bands: continuousFoldBands(context, prfHz)
    };
  }

  const timelineCount = Math.round((model.timeMaxS - model.timeMinS) / model.timelineStepS) + 1;
  const timelineTimes = Array.from({ length: timelineCount }, (_, index) => (
    Math.min(model.timeMaxS, model.timeMinS + index * model.timelineStepS)
  ));
  const fixedTimeline = timelineTimes.map((timeS) => timelineRow(timeS, fixedBadPrfHz, -1));
  const adaptiveTimeline = timelineTimes.map((timeS) => {
    const block = blockForTime(timeS);
    return timelineRow(timeS, block.selectedPrfHz, block.selectedIndex);
  });

  const targetDepthValues = adaptiveTimeline.map((row) => row.target.apparentDepthKm);
  const radarDepthMinKm = Math.max(0, Math.floor((Math.min(...targetDepthValues) - 2.2) * 10) / 10);
  const radarDepthMaxKm = Math.ceil((Math.max(...targetDepthValues) + 3.2) * 10) / 10;
  const geometryXAbsKm = Math.ceil(
    Math.max(...spiceSamples.map((sample) => Math.abs(sample.alongTrackKm))) * 1.18 / 5
  ) * 5;
  const geometryYMaxKm = Math.max(
    30,
    Math.ceil(Math.max(...spiceSamples.map((sample) => sample.altitudeKm)) + 3)
  );

  function bandSegments(rows) {
    const completed = [];
    const active = new Map();
    rows.forEach((row) => {
      const groupedByOrder = new Map();
      row.bands.forEach((band) => {
        if (!groupedByOrder.has(band.foldOrder)) groupedByOrder.set(band.foldOrder, []);
        groupedByOrder.get(band.foldOrder).push(band);
      });
      const seen = new Set();
      groupedByOrder.forEach((bands, order) => {
        bands.sort((left, right) => left.centerDepthKm - right.centerDepthKm).forEach((band, rank) => {
          const key = `${row.prfHz.toFixed(3)}:${order}:${rank}`;
          const nextRow = { ...row, band };
          const segment = active.get(key);
          if (segment
            && row.timeS - segment[segment.length - 1].timeS <= model.timelineStepS * 1.6
            && Math.abs(band.centerDepthKm - segment[segment.length - 1].band.centerDepthKm) <= 1.8) {
            segment.push(nextRow);
          } else {
            if (segment?.length) completed.push(segment);
            active.set(key, [nextRow]);
          }
          seen.add(key);
        });
      });
      [...active.keys()].forEach((key) => {
        if (!seen.has(key)) {
          const segment = active.get(key);
          if (segment?.length) completed.push(segment);
          active.delete(key);
        }
      });
    });
    active.forEach((segment) => {
      if (segment.length) completed.push(segment);
    });
    return completed.filter((segment) => segment.length >= 2);
  }

  const fixedBandSegments = bandSegments(fixedTimeline);
  const adaptiveBandSegments = bandSegments(adaptiveTimeline);

  function chartScales(width, height, margin, xMin, xMax, yMin, yMax) {
    return {
      x: (value) => margin.left + ((value - xMin) / (xMax - xMin)) * (width - margin.left - margin.right),
      y: (value) => margin.top + ((value - yMin) / (yMax - yMin)) * (height - margin.top - margin.bottom)
    };
  }

  function axes(width, height, margin, scales, xTicks, yTicks, xLabel, yLabel, xFormat = String, yFormat = String) {
    let svg = '';
    yTicks.forEach((value) => {
      const y = scales.y(value);
      svg += `<line class="grid" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line>`;
      svg += `<text class="label" x="${margin.left - 9}" y="${y + 4}" text-anchor="end">${yFormat(value)}</text>`;
    });
    xTicks.forEach((value) => {
      const x = scales.x(value);
      svg += `<line class="grid" x1="${x}" y1="${margin.top}" x2="${x}" y2="${height - margin.bottom}"></line>`;
      svg += `<text class="label" x="${x}" y="${height - margin.bottom + 19}" text-anchor="middle">${xFormat(value)}</text>`;
    });
    svg += `<line class="axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>`;
    svg += `<line class="axis" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"></line>`;
    svg += `<text class="label-strong" x="${margin.left + (width - margin.left - margin.right) / 2}" y="${height - 7}" text-anchor="middle">${xLabel}</text>`;
    svg += `<text class="label-strong" transform="translate(17 ${margin.top + (height - margin.top - margin.bottom) / 2}) rotate(-90)" text-anchor="middle">${yLabel}</text>`;
    return svg;
  }

  function areaPath(rows, scales, lowAccessor, highAccessor) {
    const valid = rows.filter((row) => Number.isFinite(lowAccessor(row)) && Number.isFinite(highAccessor(row)));
    const top = valid.map((row, index) => `${index ? 'L' : 'M'} ${scales.x(row.timeS).toFixed(2)} ${scales.y(lowAccessor(row)).toFixed(2)}`).join(' ');
    const bottom = [...valid].reverse().map((row) => `L ${scales.x(row.timeS).toFixed(2)} ${scales.y(highAccessor(row)).toFixed(2)}`).join(' ');
    return `${top} ${bottom} Z`;
  }

  function renderGeometry(state) {
    const width = 600;
    const height = 360;
    const margin = { left: 58, right: 24, top: 42, bottom: 46 };
    const scales = chartScales(width, height, margin, -geometryXAbsKm, geometryXAbsKm, geometryYMaxKm, -10);
    const trajectoryRows = spiceSamples.map((sample) => ({ x: sample.alongTrackKm, y: sample.altitudeKm }));
    const trajectoryPath = linePath(trajectoryRows, scales.x, scales.y, (row) => row);
    const xTicks = [-geometryXAbsKm, -geometryXAbsKm / 2, 0, geometryXAbsKm / 2, geometryXAbsKm];
    const yTicks = [-10, 0, 10, 20, 30].filter((value) => value <= geometryYMaxKm);
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Interpolated Europa Clipper SPICE trajectory above synthetic surface clutter and a fixed subsurface target">`;
    svg += axes(width, height, margin, scales, xTicks, yTicks, 'local along-track distance (km)', 'height above / depth below sphere (km)', signed, signed);
    svg += `<line class="surface" x1="${scales.x(-geometryXAbsKm)}" y1="${scales.y(0)}" x2="${scales.x(geometryXAbsKm)}" y2="${scales.y(0)}"></line>`;
    svg += `<path class="trajectory-line" fill="none" d="${trajectoryPath}"></path>`;
    state.foldingPair.forEach((point) => {
      svg += `<line class="ray" x1="${scales.x(state.spacecraft.xKm)}" y1="${scales.y(state.spacecraft.altitudeKm)}" x2="${scales.x(point.pointXKm)}" y2="${scales.y(0)}"></line>`;
    });
    state.points.forEach((point) => {
      const fold = foldingIndexes.has(point.index) ? ' fold' : '';
      svg += `<circle class="surface-point${fold}" cx="${scales.x(point.pointXKm)}" cy="${scales.y(0)}" r="${fold ? 6.5 : 4.5}"><title>Synthetic clutter point ${point.index + 1}</title></circle>`;
    });
    const targetX = scales.x(0);
    const targetY = scales.y(-model.targetDepthKm);
    svg += `<rect class="target" x="${targetX - 6}" y="${targetY - 6}" width="12" height="12" transform="rotate(45 ${targetX} ${targetY})"></rect>`;
    svg += `<circle class="satellite" cx="${scales.x(state.spacecraft.xKm)}" cy="${scales.y(state.spacecraft.altitudeKm)}" r="8"></circle>`;
    svg += `<text class="label-strong" x="${Math.min(width - margin.right - 105, scales.x(state.spacecraft.xKm) + 11)}" y="${scales.y(state.spacecraft.altitudeKm) - 10}">t = ${signed(state.timeS, 2)} s</text>`;
    svg += `<text class="label" x="${scales.x(-geometryXAbsKm * 0.95)}" y="${scales.y(Math.min(geometryYMaxKm - 1, model.closestAltitudeKm + 3))}">SPICE samples; state interpolated at slider time</text>`;
    svg += `<text class="label-strong" x="${targetX + 12}" y="${targetY + 4}">fixed target: -${fmt(model.targetDepthKm, 2)} km</text>`;
    svg += '</svg>';
    geometryPlot.innerHTML = svg;
  }

  function renderSchedule(state, currentBlock) {
    const width = 720;
    const height = 330;
    const margin = { left: 92, right: 24, top: 38, bottom: 48 };
    const plotWidth = width - margin.left - margin.right;
    const rowGap = 10;
    const rowHeight = (height - margin.top - margin.bottom - rowGap * 3) / 4;
    const x = (timeS) => margin.left + ((timeS - model.timeMinS) / (model.timeMaxS - model.timeMinS)) * plotWidth;
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Best-of-four PRF block schedule over the SPICE flyby">`;
    model.candidatePrfsHz.forEach((candidatePrfHz, index) => {
      const y = margin.top + index * (rowHeight + rowGap);
      svg += `<rect class="schedule-row" x="${margin.left}" y="${y}" width="${plotWidth}" height="${rowHeight}" rx="3"></rect>`;
      svg += `<text class="label-strong" x="${margin.left - 10}" y="${y + rowHeight / 2 + 4}" text-anchor="end">${prfLabel(index)} ${fmt(candidatePrfHz, 0)}</text>`;
    });
    schedule.forEach((block) => {
      const y = margin.top + block.selectedIndex * (rowHeight + rowGap);
      const selected = block.blockIndex === currentBlock.blockIndex;
      svg += `<rect class="schedule-block prf-${block.selectedIndex}" x="${x(block.startS)}" y="${y}" width="${Math.max(1, x(block.endS) - x(block.startS))}" height="${rowHeight}"${selected ? ' style="stroke:#1f211f;stroke-width:2"' : ''}></rect>`;
    });
    [-10, -5, 0, 5, 10].forEach((tick) => {
      svg += `<line class="grid" x1="${x(tick)}" y1="${margin.top}" x2="${x(tick)}" y2="${height - margin.bottom}"></line>`;
      svg += `<text class="label" x="${x(tick)}" y="${height - margin.bottom + 20}" text-anchor="middle">${signed(tick, 0)}</text>`;
    });
    svg += `<line class="current-guide" x1="${x(state.timeS)}" y1="${margin.top}" x2="${x(state.timeS)}" y2="${height - margin.bottom}"></line>`;
    svg += `<text class="label-strong" x="${margin.left}" y="20">${switchCount} PRF changes across ${schedule.length} decision blocks</text>`;
    svg += `<text class="label-strong" x="${margin.left + plotWidth / 2}" y="${height - 7}" text-anchor="middle">time from closest approach (s)</text>`;
    svg += '</svg>';
    schedulePlot.innerHTML = svg;
  }

  function renderCandidateScores(block) {
    const width = 600;
    const height = 360;
    const margin = { left: 90, right: 66, top: 42, bottom: 50 };
    const maxScore = Math.max(1.2, ...block.candidates.map((candidate) => candidate.minimumScore)) * 1.08;
    const x = (score) => margin.left + (score / maxScore) * (width - margin.left - margin.right);
    const barHeight = 42;
    const gap = 17;
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Candidate PRF prediction scores for the current decision block">`;
    block.candidates.forEach((candidate, index) => {
      const y = margin.top + index * (barHeight + gap);
      svg += `<rect class="score-track" x="${margin.left}" y="${y}" width="${width - margin.left - margin.right}" height="${barHeight}" rx="5"></rect>`;
      svg += `<rect class="score-bar prf-${index}${index === block.selectedIndex ? ' is-selected' : ''}" x="${margin.left}" y="${y}" width="${Math.max(1, x(candidate.minimumScore) - margin.left)}" height="${barHeight}" rx="5"></rect>`;
      svg += `<text class="label-strong" x="${margin.left - 10}" y="${y + barHeight / 2 + 4}" text-anchor="end">${prfLabel(index)}</text>`;
      svg += `<text class="label-strong" x="${Math.min(width - margin.right + 7, x(candidate.minimumScore) + 7)}" y="${y + barHeight / 2 + 4}">${fmt(candidate.minimumScore, 2)}</text>`;
      if (index === block.selectedIndex) svg += `<text class="label-danger" x="${width - margin.right + 5}" y="${y + barHeight / 2 + 4}">best</text>`;
    });
    svg += `<line class="basket-threshold" x1="${x(1)}" y1="${margin.top - 7}" x2="${x(1)}" y2="${height - margin.bottom}"></line>`;
    svg += `<text class="label-danger" x="${x(1) + 5}" y="${height - margin.bottom + 18}">1.0 target-cell scale</text>`;
    svg += `<text class="label-strong" x="${margin.left}" y="21">block ${block.blockIndex + 1}: predict ticks +1 through +9</text>`;
    svg += `<text class="label-strong" x="${margin.left + (width - margin.left - margin.right) / 2}" y="${height - 7}" text-anchor="middle">minimum normalized Doppler-depth separation</text>`;
    svg += '</svg>';
    scorePlot.innerHTML = svg;
  }

  function renderDopplerDepth(state, block) {
    const width = 600;
    const height = 360;
    const margin = { left: 70, right: 24, top: 54, bottom: 48 };
    const xAbs = Math.ceil(Math.max(...model.candidatePrfsHz) / 200) * 100;
    const scales = chartScales(width, height, margin, -xAbs, xAbs, radarDepthMinKm, radarDepthMaxKm);
    const yTicks = Array.from({ length: 5 }, (_, index) => radarDepthMinKm + ((radarDepthMaxKm - radarDepthMinKm) * index) / 4);
    const radiusX = Math.abs(scales.x(model.dopplerToleranceHz / 2) - scales.x(0));
    const radiusY = Math.abs(scales.y(state.target.apparentDepthKm + model.depthToleranceKm / 2) - scales.y(state.target.apparentDepthKm));
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Modeled clutter under the selected adaptive PRF in target-relative Doppler and apparent depth">`;
    svg += axes(width, height, margin, scales, [-xAbs, -xAbs / 2, 0, xAbs / 2, xAbs], yTicks, 'aliased Doppler relative to target (Hz)', 'apparent depth (km)', signed, (value) => fmt(value, 1));
    svg += `<rect class="target-cell" x="${scales.x(-model.dopplerToleranceHz)}" y="${scales.y(state.target.apparentDepthKm - model.depthToleranceKm)}" width="${scales.x(model.dopplerToleranceHz) - scales.x(-model.dopplerToleranceHz)}" height="${scales.y(state.target.apparentDepthKm + model.depthToleranceKm) - scales.y(state.target.apparentDepthKm - model.depthToleranceKm)}"></rect>`;
    svg += `<line class="guide" x1="${scales.x(0)}" y1="${margin.top}" x2="${scales.x(0)}" y2="${height - margin.bottom}"></line>`;
    state.points.forEach((point) => {
      if (point.apparentDepthKm < radarDepthMinKm || point.apparentDepthKm > radarDepthMaxKm) return;
      svg += `<ellipse class="response-tail" cx="${scales.x(point.relativeAliasHz)}" cy="${scales.y(point.apparentDepthKm)}" rx="${radiusX}" ry="${radiusY}"></ellipse>`;
      svg += `<circle class="response-center" cx="${scales.x(point.relativeAliasHz)}" cy="${scales.y(point.apparentDepthKm)}" r="4"></circle>`;
    });
    if (state.threat.apparentDepthKm >= radarDepthMinKm && state.threat.apparentDepthKm <= radarDepthMaxKm) {
      svg += `<circle class="threat-center" cx="${scales.x(state.threat.aliasHz)}" cy="${scales.y(state.threat.apparentDepthKm)}" r="7"><title>Nearest dense-footprint clutter threat</title></circle>`;
    }
    svg += `<rect class="target" x="${scales.x(0) - 5}" y="${scales.y(state.target.apparentDepthKm) - 5}" width="10" height="10" transform="rotate(45 ${scales.x(0)} ${scales.y(state.target.apparentDepthKm)})"></rect>`;
    svg += `<text class="${state.threat.overlap ? 'label-danger' : 'label-strong'}" x="${margin.left}" y="21">${state.threat.overlap ? 'OVERLAP' : 'separated'}: ${prfLabel(block.selectedIndex)} = ${fmt(state.prfHz, 0)} Hz</text>`;
    svg += `<text class="label" x="${margin.left}" y="40">gold: nearest threat from 97-point surface search</text>`;
    svg += '</svg>';
    dopplerPlot.innerHTML = svg;
  }

  function renderRadargram(element, rows, segments, state, mode) {
    const width = 880;
    const height = 390;
    const margin = { left: 70, right: 26, top: 44, bottom: 50 };
    const scales = chartScales(width, height, margin, model.timeMinS, model.timeMaxS, radarDepthMinKm, radarDepthMaxKm);
    const yTicks = Array.from({ length: 5 }, (_, index) => radarDepthMinKm + ((radarDepthMaxKm - radarDepthMinKm) * index) / 4);
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const safeMode = mode.replace(/[^a-z]/g, '');
    const isFixed = mode === 'fixed';
    const isPost = mode === 'postprocessed';
    const lineClass = isFixed ? 'radargram-fold-line' : isPost ? 'post-rejected-line' : 'adaptive-fold-line';
    const smearClass = isFixed ? 'radargram-fold-smear' : isPost ? 'post-rejected-smear' : 'adaptive-fold-smear';
    const coreClass = isFixed ? 'radargram-fold-core' : 'adaptive-fold-core';
    const overlapCount = isFixed ? fixedOverlapTicks : adaptiveOverlapTicks;
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${isFixed ? 'Fixed bad PRF' : isPost ? 'Postprocessed multi-PRF' : 'Adaptive best-of-four PRF'} synthetic radargram">
      <defs>
        <filter id="blur-${safeMode}" x="-8%" y="-80%" width="116%" height="260%"><feGaussianBlur stdDeviation="4.5"></feGaussianBlur></filter>
        <clipPath id="clip-${safeMode}"><rect x="${margin.left}" y="${margin.top}" width="${plotWidth}" height="${plotHeight}"></rect></clipPath>
      </defs>`;
    svg += `<rect class="radargram-bg" x="${margin.left}" y="${margin.top}" width="${plotWidth}" height="${plotHeight}"></rect>`;
    svg += `<image class="matlab-radargram-texture" href="assets/fake_radargram_flyby_texture.png?v=adaptive-prf-20260715" x="${margin.left}" y="${margin.top}" width="${plotWidth}" height="${plotHeight}" preserveAspectRatio="none"></image>`;
    svg += `<rect class="radargram-vignette" x="${margin.left}" y="${margin.top}" width="${plotWidth}" height="${plotHeight}"></rect>`;
    svg += axes(width, height, margin, scales, [-10, -5, 0, 5, 10], yTicks, 'time from closest approach (s)', 'apparent depth / fast time (km)', signed, (value) => fmt(value, 1));
    svg += `<g clip-path="url(#clip-${safeMode})">`;
    svg += `<path class="target-cell" d="${areaPath(rows, scales, (row) => row.target.apparentDepthKm - model.depthToleranceKm, (row) => row.target.apparentDepthKm + model.depthToleranceKm)}"></path>`;
    segments.forEach((segment) => {
      const visible = segment.some((row) => row.band.maxDepthKm >= radarDepthMinKm && row.band.minDepthKm <= radarDepthMaxKm);
      if (!visible) return;
      const blurAttribute = isFixed ? ` filter="url(#blur-${safeMode})"` : '';
      svg += `<path class="${smearClass}"${blurAttribute} d="${areaPath(segment, scales, (row) => row.band.minDepthKm - 0.10, (row) => row.band.maxDepthKm + 0.10)}"></path>`;
      if (!isPost) svg += `<path class="${coreClass}" d="${areaPath(segment, scales, (row) => row.band.minDepthKm, (row) => row.band.maxDepthKm)}"></path>`;
      svg += `<path class="${lineClass}" d="${linePath(segment, scales.x, scales.y, (row) => ({ x: row.timeS, y: row.band.centerDepthKm }))}"></path>`;
    });
    if (isPost) {
      svg += `<path class="post-target-halo" d="${linePath(rows, scales.x, scales.y, (row) => ({ x: row.timeS, y: row.target.apparentDepthKm }))}"></path>`;
    }
    svg += `<path class="target-trace" d="${linePath(rows, scales.x, scales.y, (row) => ({ x: row.timeS, y: row.target.apparentDepthKm }))}"></path>`;
    svg += `</g>`;
    svg += `<line class="current-guide" x1="${scales.x(state.timeS)}" y1="${margin.top}" x2="${scales.x(state.timeS)}" y2="${height - margin.bottom}"></line>`;
    svg += `<rect class="target" x="${scales.x(state.timeS) - 5}" y="${scales.y(state.target.apparentDepthKm) - 5}" width="10" height="10" transform="rotate(45 ${scales.x(state.timeS)} ${scales.y(state.target.apparentDepthKm)})"></rect>`;
    if (isFixed) {
      svg += `<text class="label-danger" x="${margin.left + 8}" y="24">all fixed-PRF fold branches retained</text>`;
    } else if (isPost) {
      svg += `<text class="label-strong" x="${margin.left + 8}" y="24">target retained; PRF-inconsistent clutter attenuated</text>`;
    } else {
      svg += `<text class="label-strong" x="${margin.left + 8}" y="24">block changes break and displace clutter branches</text>`;
    }
    svg += `<text class="${overlapCount ? 'label-danger' : 'label-strong'}" x="${width - margin.right}" y="24" text-anchor="end">${overlapCount} / ${radarTickCount} modeled ticks in target basket</text>`;
    svg += '</svg>';
    element.classList.toggle('is-postprocessed', isPost);
    element.innerHTML = svg;
  }

  function createCandidateCards() {
    const fragment = document.createDocumentFragment();
    model.candidatePrfsHz.forEach((candidatePrfHz, index) => {
      const card = document.createElement('article');
      card.className = 'candidate-score-card';
      card.dataset.candidateIndex = String(index);
      const name = document.createElement('p');
      name.className = 'candidate-name';
      name.textContent = `${prfLabel(index)} candidate`;
      const prf = document.createElement('p');
      prf.className = 'candidate-prf';
      prf.textContent = `${fmt(candidatePrfHz, 0)} Hz`;
      const score = document.createElement('p');
      score.className = 'candidate-score';
      const selected = document.createElement('p');
      selected.className = 'candidate-selected-label';
      card.append(name, prf, score, selected);
      fragment.appendChild(card);
    });
    candidateScoreGrid.replaceChildren(fragment);
  }

  function updateSchedulerPanel(block) {
    schedulerTelemetry['current-block-value'].textContent = `Block ${block.blockIndex + 1} of ${schedule.length}`;
    schedulerTelemetry['block-span-value'].textContent = `${signed(block.startS, 2)} to ${signed(block.endS, 2)} s`;
    schedulerTelemetry['selected-prf-value'].textContent = `${prfLabel(block.selectedIndex)} · ${fmt(block.selectedPrfHz, 0)} Hz`;
    schedulerTelemetry['selected-score-value'].textContent = `${fmt(block.selectedScore, 2)} × target-cell scale`;
    [...candidateScoreGrid.children].forEach((card, index) => {
      const selected = index === block.selectedIndex;
      card.classList.toggle('is-selected', selected);
      card.querySelector('.candidate-score').textContent = `score ${fmt(block.candidates[index].minimumScore, 2)}`;
      card.querySelector('.candidate-selected-label').textContent = selected ? 'selected for block' : '';
    });
  }

  function populateStaticData() {
    const encounter = spiceFlyby.closestApproach;
    const search = spiceFlyby.encounterSearch;
    const stateDefinition = spiceFlyby.stateDefinition;
    const spkKernel = spiceFlyby.kernels.find((kernel) => kernel.kind === 'SPK');
    telemetry['encounter-number-value'].textContent = `Encounter ${search.selectedNumber} of ${search.encounterCount}`;
    telemetry['encounter-utc-value'].textContent = displayUtc(encounter.utc);
    telemetry['encounter-altitude-value'].textContent = `${fmt(encounter.altitudeKm, 3)} km above the mean-radius sphere`;
    telemetry['encounter-location-value'].textContent = `${signed(encounter.subSpacecraftLatitudeDeg, 3)}° lat · ${signed(encounter.subSpacecraftLongitudeDeg, 3)}° lon`;
    telemetry['europa-radii-value'].textContent = `${spiceFlyby.body.radiiKm.map((value) => fmt(value, 1)).join(' × ')} km`;
    telemetry['sample-cadence-value'].textContent = `${spiceFlyby.window.sampleCount} states · ${fmt(spiceFlyby.window.stepSeconds, 6)} s spacing`;
    telemetry['state-definition-value'].textContent = `${spiceFlyby.spacecraft.naifId} from ${stateDefinition.observer} · ${stateDefinition.frame} · ${stateDefinition.aberrationCorrection}`;
    telemetry['spk-file-value'].textContent = spkKernel.filename;
    telemetry['spk-coverage-value'].textContent = `${displayUtc(spiceFlyby.spkCoverageUtc.start)} – ${displayUtc(spiceFlyby.spkCoverageUtc.end)}`;
    telemetry['spk-sha-value'].textContent = spkKernel.sha256;
    telemetry['artifact-generated-value'].textContent = new Date(spiceFlyby.generatedAtUtc).toISOString().replace('T', ' ').replace('Z', ' UTC');
    schedulerTelemetry['source-interval-value'].textContent = `${fmt(spiceFlyby.window.stepSeconds * 1000, 3)} ms`;
    schedulerTelemetry['fixed-prf-value'].textContent = `${fmt(fixedBadPrfHz, 1)} Hz`;
    schedulerTelemetry['fixed-overlap-count-value'].textContent = `${fixedOverlapTicks} / ${radarTickCount}`;
    schedulerTelemetry['adaptive-overlap-count-value'].textContent = `${adaptiveOverlapTicks} / ${radarTickCount}`;
    schedulerTelemetry['switch-count-value'].textContent = `${switchCount} across ${schedule.length} blocks`;
    schedulerTelemetry['radar-tick-count-value'].textContent = `${radarTickCount} at ${fmt(model.radarTickS * 1000, 0)} ms`;
  }

  function populateSampleTable() {
    const fragment = document.createDocumentFragment();
    spiceSamples.forEach((sample, index) => {
      const row = document.createElement('tr');
      row.dataset.sampleIndex = String(index);
      const values = [
        signed(sample.offsetSeconds, 3),
        displayUtc(sample.utc),
        fmt(sample.altitudeKm, 3),
        signed(sample.alongTrackKm, 3),
        signed(sample.crossTrackKm, 3),
        fmt(sample.speedKmS, 6),
        signed(sample.radialSpeedKmS, 9)
      ];
      values.forEach((value) => {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.appendChild(cell);
      });
      fragment.appendChild(row);
    });
    sampleTableBody.replaceChildren(fragment);
  }

  let activeSampleIndex = -1;
  function updateActiveSampleRow(timeS, forceScroll = false) {
    const floatingIndex = (timeS - model.timeMinS) / spiceFlyby.window.stepSeconds;
    const nextIndex = Math.max(0, Math.min(spiceSamples.length - 1, Math.round(floatingIndex)));
    if (nextIndex === activeSampleIndex && !forceScroll) return;
    if (activeSampleIndex >= 0) sampleTableBody.children[activeSampleIndex]?.classList.remove('is-current');
    const nextRow = sampleTableBody.children[nextIndex];
    nextRow?.classList.add('is-current');
    activeSampleIndex = nextIndex;
    if (!nextRow || sampleTableWrap.clientHeight <= 0) return;
    const headerAllowance = 34;
    const rowTop = nextRow.offsetTop;
    const rowBottom = rowTop + nextRow.offsetHeight;
    const visibleTop = sampleTableWrap.scrollTop + headerAllowance;
    const visibleBottom = sampleTableWrap.scrollTop + sampleTableWrap.clientHeight;
    if (forceScroll || rowTop < visibleTop || rowBottom > visibleBottom) {
      sampleTableWrap.scrollTop = Math.max(0, rowTop - sampleTableWrap.clientHeight / 2);
    }
  }

  function draw(timeS) {
    const block = blockForTime(timeS);
    const adaptiveState = stateAt(timeS, block.selectedPrfHz);
    const fixedState = stateAt(timeS, fixedBadPrfHz);
    timeOutput.textContent = `${signed(timeS, 2)} s`;
    altitudeValue.textContent = `${fmt(adaptiveState.spacecraft.altitudeKm, 2)} km`;
    trackValue.textContent = `${signed(adaptiveState.spacecraft.xKm, 2)} km`;
    speedValue.textContent = `${fmt(adaptiveState.spacecraft.speedKmS, 3)} km/s`;
    prfValue.textContent = `${prfLabel(block.selectedIndex)} · ${fmt(block.selectedPrfHz, 0)} Hz`;
    blockValue.textContent = `${block.blockIndex + 1} / ${schedule.length}`;
    clockValue.textContent = `${fmt(model.radarTickS * 1000, 0)} ms × ${model.blockTicks}`;
    telemetry['current-utc-value'].textContent = utcAtOffset(timeS);
    telemetry['center-distance-value'].textContent = `${fmt(adaptiveState.spacecraft.distanceKm, 3)} km`;
    telemetry['radial-speed-value'].textContent = `${signed(adaptiveState.spacecraft.radialSpeedKmS, 6)} km/s`;
    telemetry['cross-track-value'].textContent = `${signed(adaptiveState.spacecraft.crossTrackKm, 3)} km`;
    telemetry['target-range-value'].textContent = `${fmt(adaptiveState.target.rangeKm, 3)} km`;
    telemetry['target-doppler-value'].textContent = `${signed(adaptiveState.target.trueDopplerHz, 3)} Hz`;
    telemetry['nearest-alias-value'].textContent = `${signed(adaptiveState.threat.aliasHz, 3)} Hz`;
    adaptiveState.spacecraft.positionKm.forEach((value, index) => {
      telemetry[`position-${'xyz'[index]}-value`].textContent = signed(value, 6);
    });
    adaptiveState.spacecraft.velocityKmS.forEach((value, index) => {
      telemetry[`velocity-${'xyz'[index]}-value`].textContent = signed(value, 9);
    });
    updateActiveSampleRow(timeS);
    updateSchedulerPanel(block);
    status.className = `trajectory-status${adaptiveState.threat.overlap ? ' is-overlap' : ''}`;
    if (adaptiveState.threat.overlap) {
      status.textContent = `Adaptive overlap: ${prfLabel(block.selectedIndex)} still places modeled clutter inside the target basket at ${signed(timeS, 2)} s.`;
    } else {
      const fixedComparison = fixedState.threat.overlap ? ' The fixed bad PRF overlaps at this time.' : '';
      status.textContent = `${prfLabel(block.selectedIndex)} (${fmt(block.selectedPrfHz, 0)} Hz) wins block ${block.blockIndex + 1}; nearest modeled clutter is ${signed(adaptiveState.threat.aliasHz, 1)} Hz and ${signed(adaptiveState.threat.depthOffsetKm, 2)} km from the target.${fixedComparison}`;
    }
    renderGeometry(adaptiveState);
    renderSchedule(adaptiveState, block);
    renderCandidateScores(block);
    renderDopplerDepth(adaptiveState, block);
    renderRadargram(fixedRadargramPlot, fixedTimeline, fixedBandSegments, fixedState, 'fixed');
    renderRadargram(adaptiveRadargramPlot, adaptiveTimeline, adaptiveBandSegments, adaptiveState, 'adaptive');
    renderRadargram(postprocessedRadargramPlot, adaptiveTimeline, adaptiveBandSegments, adaptiveState, 'postprocessed');
  }

  slider.min = String(model.timeMinS);
  slider.max = String(model.timeMaxS);
  slider.step = String(model.radarTickS);
  slider.value = '0';
  closestUtcValue.textContent = displayUtc(spiceFlyby.closestApproach.utc);
  createCandidateCards();
  populateSampleTable();
  populateStaticData();

  let animationTimer = null;
  function stopAnimation() {
    if (animationTimer) window.clearInterval(animationTimer);
    animationTimer = null;
    playButton.textContent = 'Play flyby';
  }

  function startAnimation() {
    stopAnimation();
    if (Number(slider.value) >= model.timeMaxS - 0.001) slider.value = String(model.timeMinS);
    playButton.textContent = 'Pause flyby';
    animationTimer = window.setInterval(() => {
      const next = Math.min(model.timeMaxS, Number(slider.value) + 0.13);
      slider.value = String(next);
      draw(next);
      if (next >= model.timeMaxS) stopAnimation();
    }, 50);
  }

  slider.addEventListener('input', () => {
    stopAnimation();
    draw(Number(slider.value));
  });
  playButton.addEventListener('click', () => animationTimer ? stopAnimation() : startAnimation());
  closestButton.addEventListener('click', () => {
    stopAnimation();
    slider.value = '0';
    draw(0);
  });
  window.addEventListener('resize', () => updateActiveSampleRow(Number(slider.value), true));

  draw(0);
})();
