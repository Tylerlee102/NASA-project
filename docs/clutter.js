(() => {
  'use strict';

  const C = 299792458;
  const PROCESSING_DEPTH_BINS = 96;
  const PROCESSING_MAX_DEPTH_KM = 24;
  const YOUTUBE_PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
  const model = {
    altitudeKm: 25,
    velocityKmS: 2.5,
    frequencyMhz: 60,
    targetDepthKm: 6.74,
    iceIndex: 1.78,
    pointCount: 17,
    surfaceWindowKm: 24,
    dopplerToleranceHz: 0,
    depthToleranceKm: 0
  };
  const flyby = {
    timeS: 6,
    durationS: 12,
    playbackSpeed: 2
  };

  const prfSlider = document.getElementById('clutter-prf-slider');
  const prfOutput = document.getElementById('clutter-prf-output');
  const prfMinLabel = document.getElementById('clutter-prf-min-label');
  const prfMaxLabel = document.getElementById('clutter-prf-max-label');
  const timeSlider = document.getElementById('clutter-time-slider');
  const timeOutput = document.getElementById('clutter-time-output');
  const playButton = document.getElementById('clutter-play-button');
  const speedButton = document.getElementById('clutter-speed-button');
  const speedOutput = document.getElementById('clutter-speed-output');
  const pointSlider = document.getElementById('clutter-count-slider');
  const pointOutput = document.getElementById('clutter-count-output');
  const modelSpeedSlider = document.getElementById('clutter-speed-slider');
  const altitudeSlider = document.getElementById('clutter-altitude-slider');
  const depthSlider = document.getElementById('clutter-depth-slider');
  const status = document.getElementById('clutter-status');
  const indicator = document.getElementById('clutter-folding-indicator');
  const indicatorText = document.getElementById('clutter-folding-indicator-text');
  const geometryPlot = document.getElementById('clutter-geometry-plot');
  const dopplerPlot = document.getElementById('clutter-doppler-plot');
  const runPlot = document.getElementById('clutter-run-plot');
  const wavelengthM = C / (model.frequencyMhz * 1e6);

  let foldPrfHz = 737.7;
  let playbackFrameId = null;
  let lastPlaybackTime = null;

  const mod = (value, divisor) => ((value % divisor) + divisor) % divisor;
  const alias = (dopplerHz, prfHz) => mod(dopplerHz + prfHz / 2, prfHz) - prfHz / 2;
  const fmt = (value, digits = 0) => Number(value).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
  const signed = (value, digits = 1) => {
    const cleaned = Math.abs(value) < 0.05 ? 0 : value;
    return `${cleaned > 0 ? '+' : ''}${fmt(cleaned, digits)}`;
  };
  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  function formatPlaybackSpeed(value) {
    return value === 1 ? 'Normal' : `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}x`;
  }

  function updateSpeedButton() {
    if (speedOutput) speedOutput.textContent = formatPlaybackSpeed(flyby.playbackSpeed);
    if (speedButton) speedButton.setAttribute('aria-label', `Playback speed ${formatPlaybackSpeed(flyby.playbackSpeed)}`);
  }

  function setPlaybackActive(isActive) {
    if (!playButton) return;
    playButton.textContent = isActive ? 'Pause' : 'Play';
    playButton.classList.toggle('is-playing', isActive);
    playButton.setAttribute('aria-pressed', String(isActive));
  }

  function stopPlayback() {
    if (playbackFrameId !== null) {
      cancelAnimationFrame(playbackFrameId);
      playbackFrameId = null;
    }
    lastPlaybackTime = null;
    setPlaybackActive(false);
  }

  function playbackStep(timestamp) {
    if (lastPlaybackTime === null) lastPlaybackTime = timestamp;
    const elapsedSeconds = Math.min(0.05, (timestamp - lastPlaybackTime) / 1000);
    lastPlaybackTime = timestamp;

    let nextTime = flyby.timeS + flyby.playbackSpeed * elapsedSeconds;
    if (nextTime >= flyby.durationS) nextTime = flyby.durationS;
    flyby.timeS = nextTime;
    if (timeSlider) timeSlider.value = flyby.timeS.toFixed(2);
    draw();

    if (flyby.timeS >= flyby.durationS) {
      stopPlayback();
      return;
    }
    playbackFrameId = requestAnimationFrame(playbackStep);
  }

  function startPlayback() {
    if (flyby.timeS >= flyby.durationS) {
      flyby.timeS = 0;
      if (timeSlider) timeSlider.value = '0';
    }
    lastPlaybackTime = null;
    setPlaybackActive(true);
    playbackFrameId = requestAnimationFrame(playbackStep);
  }

  function planeXAtTime(timeS) {
    return (timeS - flyby.durationS / 2) * model.velocityKmS;
  }

  function targetOpticalHeightKm() {
    return model.altitudeKm + model.iceIndex * model.targetDepthKm;
  }

  function sameDelayOffsetKm() {
    const heightKm = targetOpticalHeightKm();
    return Math.sqrt(Math.max(0, heightKm ** 2 - model.altitudeKm ** 2));
  }

  function dopplerForDx(dxKm, verticalKm = model.altitudeKm) {
    const rangeKm = Math.hypot(verticalKm, dxKm);
    return (2 * model.velocityKmS * 1000 / wavelengthM) * (dxKm / rangeKm);
  }

  function spacingKm() {
    return model.pointCount <= 1 ? 0 : model.surfaceWindowKm / (model.pointCount - 1);
  }

  function equalDistanceSurfacePoints() {
    const count = Math.max(1, Math.round(model.pointCount));
    const centerXKm = sameDelayOffsetKm();
    const startXKm = centerXKm - model.surfaceWindowKm / 2;
    return Array.from({ length: count }, (_, index) => {
      const xKm = count === 1 ? centerXKm : startXKm + spacingKm() * index;
      return { index, xKm };
    });
  }

  function targetState(planeXKm, effectivePrfHz) {
    const targetDxKm = -planeXKm;
    const targetRangeKm = Math.hypot(targetOpticalHeightKm(), targetDxKm);
    const targetTrueDopplerHz = dopplerForDx(targetDxKm, targetOpticalHeightKm());
    return {
      targetDxKm,
      targetRangeKm,
      targetTrueDopplerHz,
      targetAliasHz: alias(targetTrueDopplerHz, effectivePrfHz),
      targetApparentDepthKm: (targetRangeKm - model.altitudeKm) / model.iceIndex
    };
  }

  function clutterStateForPoint(point, planeXKm, effectivePrfHz, target) {
    const surfaceDxKm = point.xKm - planeXKm;
    const surfaceRangeKm = Math.hypot(model.altitudeKm, surfaceDxKm);
    const surfaceTrueDopplerHz = dopplerForDx(surfaceDxKm);
    const surfaceAliasHz = alias(surfaceTrueDopplerHz, effectivePrfHz);
    const surfaceApparentDepthKm = (surfaceRangeKm - model.altitudeKm) / model.iceIndex;
    const dopplerDeltaHz = Math.abs(alias(surfaceAliasHz - target.targetAliasHz, effectivePrfHz));
    const depthDeltaKm = Math.abs(surfaceApparentDepthKm - target.targetApparentDepthKm);
    const normalizedDistance = Math.hypot(
      dopplerDeltaHz / Math.max(1e-6, model.dopplerToleranceHz),
      depthDeltaKm / Math.max(1e-6, model.depthToleranceKm)
    );
    return {
      ...point,
      surfaceDxKm,
      surfaceRangeKm,
      surfaceTrueDopplerHz,
      surfaceAliasHz,
      surfaceApparentDepthKm,
      dopplerDeltaHz,
      depthDeltaKm,
      normalizedDistance,
      foldOrder: Math.round((surfaceTrueDopplerHz - surfaceAliasHz) / effectivePrfHz),
      overlapsTarget: dopplerDeltaHz <= model.dopplerToleranceHz && depthDeltaKm <= model.depthToleranceKm,
      nearTarget: normalizedDistance <= 3
    };
  }

  function stateAt(timeS, effectivePrfHz) {
    const planeXKm = planeXAtTime(timeS);
    const target = targetState(planeXKm, effectivePrfHz);
    const points = equalDistanceSurfacePoints()
      .map((point) => clutterStateForPoint(point, planeXKm, effectivePrfHz, target));
    const overlappingPoints = points.filter((point) => point.overlapsTarget);
    const nearPoints = points.filter((point) => point.nearTarget && !point.overlapsTarget);
    const nearestPoint = points.reduce((best, point) => (
      point.normalizedDistance < best.normalizedDistance ? point : best
    ), points[0]);
    return {
      effectivePrfHz,
      timeS,
      planeXKm,
      target,
      points,
      overlappingPoints,
      nearPoints,
      nearestPoint
    };
  }

  function refreshDerivedModel(resetPrf = false) {
    foldPrfHz = Math.abs(dopplerForDx(sameDelayOffsetKm()));
    model.surfaceWindowKm = Math.max(18, Math.min(54, sameDelayOffsetKm() * 0.9));
    model.dopplerToleranceHz = Math.max(3, foldPrfHz / 32);
    model.depthToleranceKm = PROCESSING_MAX_DEPTH_KM / (PROCESSING_DEPTH_BINS - 1) / 2;

    const sliderHalfWindowHz = Math.max(28, model.dopplerToleranceHz * 1.15);
    const sliderMinHz = Math.max(50, Math.floor(foldPrfHz - sliderHalfWindowHz));
    const sliderMaxHz = Math.ceil(foldPrfHz + sliderHalfWindowHz);
    if (prfSlider) {
      prfSlider.min = String(sliderMinHz);
      prfSlider.max = String(sliderMaxHz);
      if (resetPrf || Number(prfSlider.value) < sliderMinHz || Number(prfSlider.value) > sliderMaxHz) {
        prfSlider.value = foldPrfHz.toFixed(1);
      }
    }
    if (prfMinLabel) prfMinLabel.textContent = `${fmt(sliderMinHz, 0)} Hz`;
    if (prfMaxLabel) prfMaxLabel.textContent = `${fmt(sliderMaxHz, 0)} Hz`;
    if (pointOutput) pointOutput.textContent = fmt(model.pointCount, 0);

    const outputMap = {
      'clutter-model-speed-output': `${fmt(model.velocityKmS, 1)} km/s`,
      'clutter-altitude-output': `${fmt(model.altitudeKm, 0)} km`,
      'clutter-depth-output': `${fmt(model.targetDepthKm, 2)} km`,
      'clutter-given-window': `${fmt(model.surfaceWindowKm, 1)} km`,
      'clutter-given-spacing': model.pointCount <= 1 ? 'single point' : `${fmt(spacingKm(), 2)} km`,
      'clutter-given-doppler': `+/-${fmt(model.dopplerToleranceHz, 1)} Hz`,
      'clutter-given-depth-cell': `+/-${fmt(model.depthToleranceKm, 3)} km`,
      'clutter-given-index': fmt(model.iceIndex, 2)
    };
    Object.entries(outputMap).forEach(([id, text]) => {
      const element = document.getElementById(id);
      if (element) element.textContent = text;
    });
    updateSpeedButton();
  }

  function drawGridLines(svg, xs, ys, sx, sy, margin, width, height) {
    xs.forEach((value) => {
      const x = sx(value);
      svg.push(`<line class="check-grid-line" x1="${x}" y1="${margin.top}" x2="${x}" y2="${height - margin.bottom}"></line>`);
    });
    ys.forEach((value) => {
      const y = sy(value);
      svg.push(`<line class="check-grid-line" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line>`);
    });
  }

  function renderGeometry(state) {
    if (!geometryPlot) return;
    const width = 620;
    const height = 405;
    const left = 64;
    const right = 34;
    const surfaceY = 142;
    const aircraftY = 36;
    const centerXKm = sameDelayOffsetKm();
    const halfWindowKm = model.surfaceWindowKm / 2;
    const halfWidthKm = Math.ceil(Math.max(
      48,
      Math.abs(centerXKm) + halfWindowKm + 10,
      Math.abs(state.planeXKm) + 12
    ) / 10) * 10;
    const depthMaxKm = Math.ceil(Math.max(
      12,
      state.target.targetApparentDepthKm + 1,
      ...state.points.map((point) => point.surfaceApparentDepthKm + 1)
    ));
    const sx = (xKm) => left + ((xKm + halfWidthKm) / (2 * halfWidthKm)) * (width - left - right);
    const depthToY = (depthKm) => surfaceY + (depthKm / depthMaxKm) * 180;
    const aircraftX = sx(state.planeXKm);
    const targetX = sx(0);
    const targetY = depthToY(state.target.targetApparentDepthKm);
    const sameDelayX = sx(centerXKm);
    const nearest = state.overlappingPoints[0] || state.nearestPoint;
    const svg = [`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Equal-distance surface clutter points around the same-delay fold sector">`];
    svg.push(`<line class="geometry-surface" x1="${left}" y1="${surfaceY}" x2="${width - right}" y2="${surfaceY}"></line>`);
    svg.push(`<line class="clutter-surface-window" x1="${sx(centerXKm - halfWindowKm)}" y1="${surfaceY}" x2="${sx(centerXKm + halfWindowKm)}" y2="${surfaceY}"></line>`);
    svg.push(`<line class="clutter-same-delay-marker" x1="${sameDelayX}" y1="${surfaceY - 34}" x2="${sameDelayX}" y2="${surfaceY + 26}"></line>`);
    svg.push(`<line class="geometry-depth-guide" x1="${targetX}" y1="${surfaceY}" x2="${targetX}" y2="${targetY}"></line>`);
    svg.push(`<line class="geometry-target-ray" x1="${aircraftX}" y1="${aircraftY + 10}" x2="${targetX}" y2="${targetY - 10}"></line>`);
    state.overlappingPoints.forEach((point) => {
      svg.push(`<line class="multi-clutter-ray" x1="${aircraftX}" y1="${aircraftY + 10}" x2="${sx(point.xKm)}" y2="${surfaceY - 8}"></line>`);
    });
    svg.push(`<g class="geometry-plane" transform="translate(${aircraftX} ${aircraftY})">
        <path class="geometry-plane-wing" d="M -3 -5 L 9 -25 L 15 -23 L 8 -4 Z"></path>
        <path class="geometry-plane-wing" d="M -3 5 L 9 25 L 15 23 L 8 4 Z"></path>
        <path class="geometry-plane-tail" d="M -15 -4 L -25 -15 L -20 -2 Z"></path>
        <path class="geometry-plane-tail" d="M -15 4 L -25 15 L -20 2 Z"></path>
        <path class="geometry-plane-body" d="M -22 0 C -12 -8 8 -8 23 0 C 8 8 -12 8 -22 0 Z"></path>
        <circle class="geometry-plane-window" cx="10" cy="0" r="2.7"></circle>
      </g>`);
    svg.push(`<text class="geometry-title" x="${left}" y="20">${fmt(model.pointCount, 0)} equal-distance points, ${fmt(spacingKm(), 2)} km spacing</text>`);
    svg.push(`<text class="geometry-value" x="${left}" y="38">same-delay fold center x=${fmt(centerXKm, 1)} km</text>`);
    svg.push(`<text class="geometry-label" x="${sameDelayX + 8}" y="${surfaceY - 18}">fold center</text>`);
    state.points.forEach((point) => {
      const css = point.overlapsTarget ? 'overlap' : point.nearTarget ? 'nearest' : '';
      const radius = point.overlapsTarget ? 7.2 : point.nearTarget ? 6.2 : 4.6;
      svg.push(`<circle class="multi-clutter-point ${css}" cx="${sx(point.xKm)}" cy="${surfaceY}" r="${radius}"><title>Point ${point.index + 1}: x=${fmt(point.xKm, 2)} km, alias ${signed(point.surfaceAliasHz, 1)} Hz, apparent depth ${fmt(point.surfaceApparentDepthKm, 3)} km</title></circle>`);
    });
    svg.push(`<rect class="geometry-target ${state.overlappingPoints.length ? 'overlap' : ''}" x="${targetX - 8}" y="${targetY - 8}" width="16" height="16" transform="rotate(45 ${targetX} ${targetY})"></rect>`);
    svg.push(`<line class="geometry-fold-line" x1="${left}" y1="${depthToY(nearest.surfaceApparentDepthKm)}" x2="${width - right}" y2="${depthToY(nearest.surfaceApparentDepthKm)}"></line>`);
    svg.push(`<text class="${state.overlappingPoints.length ? 'geometry-danger' : 'geometry-value'}" x="${left}" y="${height - 22}">${fmt(state.overlappingPoints.length, 0)} points in target cell; nearest x=${fmt(nearest.xKm, 2)} km</text>`);
    svg.push('</svg>');
    geometryPlot.innerHTML = svg.join('');
  }

  function renderDoppler(state) {
    if (!dopplerPlot) return;
    const width = 620;
    const height = 405;
    const margin = { left: 72, right: 32, top: 52, bottom: 54 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const prf = state.effectivePrfHz;
    const depthMaxKm = Math.ceil(Math.max(
      12,
      state.target.targetApparentDepthKm + 1,
      ...state.points.map((point) => point.surfaceApparentDepthKm + 1)
    ));
    const sx = (value) => margin.left + ((value + prf / 2) / prf) * plotWidth;
    const sy = (value) => margin.top + (value / depthMaxKm) * plotHeight;
    const targetLeft = sx(state.target.targetAliasHz - model.dopplerToleranceHz);
    const targetRight = sx(state.target.targetAliasHz + model.dopplerToleranceHz);
    const targetTop = sy(state.target.targetApparentDepthKm - model.depthToleranceKm);
    const targetBottom = sy(state.target.targetApparentDepthKm + model.depthToleranceKm);
    const nearest = state.overlappingPoints[0] || state.nearestPoint;
    const svg = [`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Equal-distance clutter points by folded Doppler and apparent depth">`];
    drawGridLines(
      svg,
      [-prf / 2, -prf / 4, 0, prf / 4, prf / 2],
      [0, depthMaxKm / 4, depthMaxKm / 2, (3 * depthMaxKm) / 4, depthMaxKm],
      sx,
      sy,
      margin,
      width,
      height
    );
    [-prf / 2, -prf / 4, 0, prf / 4, prf / 2].forEach((value) => {
      svg.push(`<text class="check-label" x="${sx(value)}" y="${height - margin.bottom + 18}" text-anchor="middle">${signed(value, 0)}</text>`);
    });
    [0, depthMaxKm / 4, depthMaxKm / 2, (3 * depthMaxKm) / 4, depthMaxKm].forEach((value) => {
      svg.push(`<text class="check-label" x="${margin.left - 9}" y="${sy(value) + 4}" text-anchor="end">${fmt(value, 1)}</text>`);
    });
    svg.push(`<rect class="clutter-near-cell" x="${sx(state.target.targetAliasHz - model.dopplerToleranceHz * 3)}" y="${sy(state.target.targetApparentDepthKm - model.depthToleranceKm * 3)}" width="${Math.max(2, sx(state.target.targetAliasHz + model.dopplerToleranceHz * 3) - sx(state.target.targetAliasHz - model.dopplerToleranceHz * 3))}" height="${Math.max(2, sy(state.target.targetApparentDepthKm + model.depthToleranceKm * 3) - sy(state.target.targetApparentDepthKm - model.depthToleranceKm * 3))}"></rect>`);
    svg.push(`<rect class="multi-target-cell" x="${Math.min(targetLeft, targetRight)}" y="${targetTop}" width="${Math.max(2, Math.abs(targetRight - targetLeft))}" height="${Math.max(2, targetBottom - targetTop)}"></rect>`);
    svg.push(`<line class="check-target-line" x1="${sx(state.target.targetAliasHz)}" y1="${margin.top}" x2="${sx(state.target.targetAliasHz)}" y2="${height - margin.bottom}"></line>`);
    svg.push(`<line class="check-target-line" x1="${margin.left}" y1="${sy(state.target.targetApparentDepthKm)}" x2="${width - margin.right}" y2="${sy(state.target.targetApparentDepthKm)}"></line>`);
    state.points.forEach((point) => {
      const css = point.overlapsTarget ? 'overlap' : point.nearTarget ? 'nearest' : '';
      const radius = point.overlapsTarget ? 5.8 : point.nearTarget ? 5.1 : 3.5;
      svg.push(`<circle class="multi-clutter-point ${css}" cx="${sx(point.surfaceAliasHz)}" cy="${sy(point.surfaceApparentDepthKm)}" r="${radius}"><title>Point ${point.index + 1}: alias ${signed(point.surfaceAliasHz, 1)} Hz, depth ${fmt(point.surfaceApparentDepthKm, 3)} km</title></circle>`);
    });
    svg.push(`<rect class="check-target-center" x="${sx(state.target.targetAliasHz) - 5}" y="${sy(state.target.targetApparentDepthKm) - 5}" width="10" height="10" transform="rotate(45 ${sx(state.target.targetAliasHz)} ${sy(state.target.targetApparentDepthKm)})"></rect>`);
    svg.push(`<text class="${state.overlappingPoints.length ? 'check-danger' : 'check-title'}" x="${margin.left}" y="21">${fmt(state.overlappingPoints.length, 0)} points folding into target cell</text>`);
    svg.push(`<text class="check-title" x="${margin.left}" y="39">nearest: ${signed(nearest.surfaceAliasHz, 1)} Hz, ${fmt(nearest.surfaceApparentDepthKm, 3)} km</text>`);
    svg.push(`<line class="check-axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>`);
    svg.push(`<line class="check-axis" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"></line>`);
    svg.push(`<text class="check-title" x="${margin.left + plotWidth / 2}" y="${height - 10}" text-anchor="middle">aliased Doppler (Hz)</text>`);
    svg.push(`<text class="check-title" transform="translate(18 ${margin.top + plotHeight / 2}) rotate(-90)" text-anchor="middle">apparent depth (km)</text>`);
    svg.push('</svg>');
    dopplerPlot.innerHTML = svg.join('');
  }

  function pathForRows(rows, xKey, yKey, sx, sy) {
    return rows.map((row, index) => `${index === 0 ? 'M' : 'L'} ${sx(row[xKey])} ${sy(row[yKey])}`).join(' ');
  }

  function renderRun(state) {
    if (!runPlot) return;
    const width = 940;
    const height = 315;
    const margin = { left: 58, right: 26, top: 36, bottom: 44 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const rows = Array.from({ length: 121 }, (_, index) => {
      const timeS = (flyby.durationS * index) / 120;
      const sample = stateAt(timeS, state.effectivePrfHz);
      return {
        timeS,
        overlapCount: sample.overlappingPoints.length,
        nearCount: sample.overlappingPoints.length + sample.nearPoints.length
      };
    });
    const yMax = Math.max(4, ...rows.map((row) => row.nearCount), model.pointCount);
    const sx = (timeS) => margin.left + (timeS / flyby.durationS) * plotWidth;
    const sy = (count) => margin.top + (1 - count / yMax) * plotHeight;
    const svg = [`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Run timeline showing how many equal-distance clutter points fold near or inside the target cell">`];
    [0, 3, 6, 9, 12].forEach((value) => {
      const x = sx(value);
      svg.push(`<line class="check-grid-line" x1="${x}" y1="${margin.top}" x2="${x}" y2="${height - margin.bottom}"></line>`);
      svg.push(`<text class="check-label" x="${x}" y="${height - margin.bottom + 18}" text-anchor="middle">${fmt(value, 0)}s</text>`);
    });
    [0, yMax / 4, yMax / 2, (3 * yMax) / 4, yMax].forEach((value) => {
      const y = sy(value);
      svg.push(`<line class="check-grid-line" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line>`);
      svg.push(`<text class="check-label" x="${margin.left - 8}" y="${y + 4}" text-anchor="end">${fmt(value, 0)}</text>`);
    });
    svg.push(`<path class="clutter-run-near" d="${pathForRows(rows, 'timeS', 'nearCount', sx, sy)}"></path>`);
    svg.push(`<path class="clutter-run-overlap" d="${pathForRows(rows, 'timeS', 'overlapCount', sx, sy)}"></path>`);
    svg.push(`<line class="clutter-current-time" x1="${sx(state.timeS)}" y1="${margin.top}" x2="${sx(state.timeS)}" y2="${height - margin.bottom}"></line>`);
    svg.push(`<circle class="check-clutter-center" cx="${sx(state.timeS)}" cy="${sy(state.overlappingPoints.length)}" r="5"></circle>`);
    svg.push(`<text class="check-title" x="${margin.left}" y="20">red: inside target cell, gold: near target cell</text>`);
    svg.push(`<text class="check-title" x="${margin.left + plotWidth / 2}" y="${height - 9}" text-anchor="middle">flyby time</text>`);
    svg.push(`<text class="check-title" transform="translate(17 ${margin.top + plotHeight / 2}) rotate(-90)" text-anchor="middle">surface clutter points</text>`);
    svg.push(`<line class="check-axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>`);
    svg.push(`<line class="check-axis" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"></line>`);
    svg.push('</svg>');
    runPlot.innerHTML = svg.join('');
  }

  function updateStatus(state) {
    if (timeOutput) timeOutput.textContent = `${fmt(flyby.timeS, 1)} s`;
    if (prfOutput) prfOutput.textContent = `${fmt(state.effectivePrfHz, 1)} Hz`;
    if (pointOutput) pointOutput.textContent = fmt(model.pointCount, 0);
    const nearest = state.overlappingPoints[0] || state.nearestPoint;
    const hasOverlap = state.overlappingPoints.length > 0;
    if (status) {
      status.className = `prf-status${hasOverlap ? ' is-overlap' : ''}`;
      status.textContent = hasOverlap
        ? `${fmt(state.overlappingPoints.length, 0)} equal-distance surface point${state.overlappingPoints.length === 1 ? '' : 's'} ${state.overlappingPoints.length === 1 ? 'folds' : 'fold'} into the subsurface target cell at ${fmt(state.timeS, 1)} s.`
        : `Nearest point is ${fmt(nearest.dopplerDeltaHz, 1)} Hz and ${fmt(nearest.depthDeltaKm, 3)} km from the target cell at ${fmt(state.timeS, 1)} s.`;
    }
    if (indicator && indicatorText) {
      indicator.classList.toggle('is-overlap', hasOverlap);
      indicatorText.textContent = hasOverlap ? 'folding on target' : 'outside target cell';
    }
  }

  function draw() {
    if (!prfSlider) return;
    const effectivePrfHz = Number(prfSlider.value);
    const state = stateAt(flyby.timeS, effectivePrfHz);
    renderGeometry(state);
    renderDoppler(state);
    renderRun(state);
    updateStatus(state);
  }

  if (!prfSlider || !timeSlider || !pointSlider) return;
  refreshDerivedModel(true);
  updateSpeedButton();

  prfSlider.addEventListener('input', () => {
    stopPlayback();
    draw();
  });
  timeSlider.addEventListener('input', () => {
    stopPlayback();
    flyby.timeS = Number(timeSlider.value);
    draw();
  });
  pointSlider.addEventListener('input', () => {
    stopPlayback();
    model.pointCount = Math.round(Number(pointSlider.value));
    refreshDerivedModel(false);
    draw();
  });
  [modelSpeedSlider, altitudeSlider, depthSlider].filter(Boolean).forEach((input) => {
    input.addEventListener('input', () => {
      stopPlayback();
      model.velocityKmS = Number(modelSpeedSlider.value);
      model.altitudeKm = Number(altitudeSlider.value);
      model.targetDepthKm = Number(depthSlider.value);
      refreshDerivedModel(true);
      draw();
    });
  });
  if (playButton) {
    playButton.addEventListener('click', () => {
      if (playbackFrameId === null) startPlayback();
      else stopPlayback();
    });
  }
  if (speedButton) {
    speedButton.addEventListener('click', () => {
      const currentIndex = YOUTUBE_PLAYBACK_SPEEDS.findIndex((speed) => speed === flyby.playbackSpeed);
      const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % YOUTUBE_PLAYBACK_SPEEDS.length;
      flyby.playbackSpeed = YOUTUBE_PLAYBACK_SPEEDS[nextIndex];
      updateSpeedButton();
    });
  }
  draw();
})();
