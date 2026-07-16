(() => {
  'use strict';

  const C = 299792458;
  const PROCESSING_TRACE_COUNT = 64;
  const PROCESSING_DEPTH_BINS = 96;
  const PROCESSING_MAX_DEPTH_KM = 24;
  const SIMPLE_LISTEN_MARGIN_US = 25;
  const REASON_PRF_MIN_HZ = 50;
  const REASON_PRF_MAX_HZ = 3000;
  const model = {
    altitudeKm: 25,
    velocityKmS: 2.5,
    frequencyMhz: 60,
    targetDepthKm: 6.74,
    iceIndex: 1.78,
    pointCount: 12,
    spreadKm: 60,
    dopplerToleranceHz: 0,
    depthToleranceKm: 0
  };
  const flyby = {
    timeS: 0,
    halfSpanKm: 40
  };

  const prfSlider = document.getElementById('effective-prf-slider');
  const prfPlayButton = document.getElementById('prf-play-button');
  const timeSlider = document.getElementById('flyby-time-slider');
  const timeOutput = document.getElementById('flyby-time-output');
  const timeMinLabel = document.getElementById('time-min-label');
  const timeMaxLabel = document.getElementById('time-max-label');
  const speedSlider = document.getElementById('model-speed-slider');
  const altitudeSlider = document.getElementById('model-altitude-slider');
  const depthSlider = document.getElementById('model-depth-slider');
  const output = document.getElementById('effective-prf-output');
  const originalPrfText = document.getElementById('original-prf');
  const prfMinLabel = document.getElementById('prf-min-label');
  const prfMaxLabel = document.getElementById('prf-max-label');
  const status = document.getElementById('trace-status');
  const plot = document.getElementById('horizontal-plot');
  const blurPlot = document.getElementById('blur-plot');
  const dopplerBinsPlot = document.getElementById('doppler-bins-plot');
  const liveRadargramPlot = document.getElementById('live-radargram-plot');
  const referenceRadargramPlot = document.getElementById('reference-radargram-plot');
  const traceCheckPlot = document.getElementById('trace-check-plot');
  const dopplerCheckPlot = document.getElementById('doppler-check-plot');
  const radargramPlot = document.getElementById('radargram-plot');
  const fftPlot = document.getElementById('fft-plot');
  const decimatedFftPlot = document.getElementById('decimated-fft-plot');
  const reconstructionPlot = document.getElementById('reconstruction-plot');
  const wavelengthM = C / (model.frequencyMhz * 1e6);
  let processingRendered = false;
  let referenceRadargramCacheKey = '';
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

  function setPlaybackActive(isActive) {
    if (!prfPlayButton) return;
    prfPlayButton.textContent = isActive ? 'Pause' : 'Play';
    prfPlayButton.classList.toggle('is-playing', isActive);
    prfPlayButton.setAttribute('aria-pressed', String(isActive));
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

    const timeMin = Number(timeSlider.min);
    const timeMax = Number(timeSlider.max);
    const sweepSecondsPerSecond = Math.max(1.2, (timeMax - timeMin) / 7.5);
    let nextTime = flyby.timeS + playbackDirection * sweepSecondsPerSecond * elapsedSeconds;

    if (nextTime >= timeMax) {
      nextTime = timeMax;
      playbackDirection = -1;
    } else if (nextTime <= timeMin) {
      nextTime = timeMin;
      playbackDirection = 1;
    }

    flyby.timeS = nextTime;
    timeSlider.value = flyby.timeS.toFixed(2);
    draw(Number(prfSlider.value));
    playbackFrameId = requestAnimationFrame(playbackStep);
  }

  function startPlayback() {
    if (playbackFrameId !== null) return;
    lastPlaybackTime = null;
    setPlaybackActive(true);
    playbackFrameId = requestAnimationFrame(playbackStep);
  }

  let fixedPoints = [];
  let selectedFoldingPoint = null;
  let foldingIndexes = new Set();
  let originalPrfHz = 0;
  let targetEchoUs = 0;
  let basePriUs = 0;
  let simpleTimingPrfMaxHz = 0;
  let safePrfMaxHz = 0;
  let selectedFoldPrfHz = 0;
  let foldDepthScaleKm = { min: 0, max: 1 };
  let playbackFrameId = null;
  let playbackDirection = 1;
  let lastPlaybackTime = null;

  function updateModelControlOutputs() {
    const outputs = {
      'model-speed-output': `${fmt(model.velocityKmS, 1)} km/s`,
      'model-altitude-output': `${fmt(model.altitudeKm, 0)} km`,
      'model-depth-output': `${fmt(model.targetDepthKm, 2)} km`
    };
    Object.entries(outputs).forEach(([id, text]) => {
      const outputEl = document.getElementById(id);
      if (outputEl) outputEl.textContent = text;
    });
  }

  function computeFixedPoints() {
    return Array.from({ length: model.pointCount }, (_, index) => {
      const xKm = -model.spreadKm + (2 * model.spreadKm * index) / (model.pointCount - 1);
      const rangeKm = Math.hypot(model.altitudeKm, xKm);
      return {
        index,
        xKm,
        rangeKm,
        trueDopplerHz: (2 * model.velocityKmS * 1000 / wavelengthM) * (xKm / rangeKm),
        apparentDepthKm: (rangeKm - model.altitudeKm) / model.iceIndex
      };
    });
  }

  function updateFlybyControl(resetTime = false) {
    if (!timeSlider) return;
    const halfTimeS = flyby.halfSpanKm / Math.max(model.velocityKmS, 0.1);
    timeSlider.min = (-halfTimeS).toFixed(2);
    timeSlider.max = halfTimeS.toFixed(2);
    if (resetTime || flyby.timeS < -halfTimeS || flyby.timeS > halfTimeS) {
      flyby.timeS = 0;
    }
    timeSlider.value = flyby.timeS.toFixed(2);
    if (timeOutput) timeOutput.textContent = `${signed(flyby.timeS, 1)} s`;
    if (timeMinLabel) timeMinLabel.textContent = `${signed(-halfTimeS, 0)} s`;
    if (timeMaxLabel) timeMaxLabel.textContent = `${signed(halfTimeS, 0)} s`;
  }

  function movingTwoReturnState(effectivePrfHz) {
    const planeXKm = flyby.timeS * model.velocityKmS;
    const surfaceXKm = selectedFoldingPoint.xKm;
    const surfaceDxKm = surfaceXKm - planeXKm;
    const surfaceRangeKm = Math.hypot(model.altitudeKm, surfaceDxKm);
    const surfaceTrueDopplerHz = (2 * model.velocityKmS * 1000 / wavelengthM) * (surfaceDxKm / surfaceRangeKm);
    const surfaceAliasHz = alias(surfaceTrueDopplerHz, effectivePrfHz);
    const surfaceApparentDepthKm = (surfaceRangeKm - model.altitudeKm) / model.iceIndex;

    const targetDxKm = -planeXKm;
    const targetOpticalHeightKm = model.altitudeKm + model.iceIndex * model.targetDepthKm;
    const targetRangeKm = Math.hypot(targetOpticalHeightKm, targetDxKm);
    const targetTrueDopplerHz = (2 * model.velocityKmS * 1000 / wavelengthM) * (targetDxKm / targetRangeKm);
    const targetAliasHz = alias(targetTrueDopplerHz, effectivePrfHz);
    const targetApparentDepthKm = (targetRangeKm - model.altitudeKm) / model.iceIndex;
    const dopplerDeltaHz = Math.abs(surfaceAliasHz - targetAliasHz);
    const depthDeltaKm = Math.abs(surfaceApparentDepthKm - targetApparentDepthKm);
    const overlapsTarget = dopplerDeltaHz <= model.dopplerToleranceHz && depthDeltaKm <= model.depthToleranceKm;

    return {
      effectivePrfHz,
      planeXKm,
      surfaceXKm,
      surfaceDxKm,
      surfaceRangeKm,
      surfaceTrueDopplerHz,
      surfaceAliasHz,
      surfaceApparentDepthKm,
      targetTrueDopplerHz,
      targetAliasHz,
      targetApparentDepthKm,
      dopplerDeltaHz,
      depthDeltaKm,
      foldOrder: Math.round((surfaceTrueDopplerHz - surfaceAliasHz) / effectivePrfHz),
      overlapsTarget
    };
  }

  function apparentDepthForDopplerHz(dopplerHz) {
    const sinTheta = Math.abs(dopplerHz) * wavelengthM / (2 * model.velocityKmS * 1000);
    if (sinTheta <= 0 || sinTheta >= 1) return null;
    const rangeKm = model.altitudeKm / Math.sqrt(1 - sinTheta ** 2);
    return (rangeKm - model.altitudeKm) / model.iceIndex;
  }

  // Search all physically possible alias orders. A continuous surface return
  // lies at zero aliased Doppler when |fD| = order × effectivePRF. The returned
  // band converts the stated ±Doppler tolerance into an apparent-depth span.
  function continuousFoldBand(effectivePrfHz) {
    const maximumDopplerHz = 2 * model.velocityKmS * 1000 / wavelengthM;
    const maximumOrder = Math.floor((maximumDopplerHz * (1 - 1e-9)) / effectivePrfHz);
    const candidates = [];
    for (let order = 1; order <= maximumOrder; order += 1) {
      const centerDopplerHz = order * effectivePrfHz;
      const centerDepthKm = apparentDepthForDopplerHz(centerDopplerHz);
      const toleranceDepths = [
        apparentDepthForDopplerHz(Math.max(0, centerDopplerHz - model.dopplerToleranceHz)),
        apparentDepthForDopplerHz(centerDopplerHz + model.dopplerToleranceHz)
      ].filter(Number.isFinite);
      if (!Number.isFinite(centerDepthKm) || !toleranceDepths.length) continue;
      candidates.push({
        order,
        centerDepthKm,
        minDepthKm: Math.min(centerDepthKm, ...toleranceDepths),
        maxDepthKm: Math.max(centerDepthKm, ...toleranceDepths)
      });
    }
    if (!candidates.length) return null;
    return candidates.reduce((best, candidate) => (
      Math.abs(candidate.centerDepthKm - model.targetDepthKm) < Math.abs(best.centerDepthKm - model.targetDepthKm)
        ? candidate
        : best
    ));
  }

  function refreshDerivedModel(resetPrf = false) {
    fixedPoints = computeFixedPoints();
    selectedFoldingPoint = [...fixedPoints].sort((a, b) => {
      const depthDelta = Math.abs(a.apparentDepthKm - model.targetDepthKm) - Math.abs(b.apparentDepthKm - model.targetDepthKm);
      if (Math.abs(depthDelta) > 1e-9) return depthDelta;
      return b.xKm - a.xKm;
    })[0];
    foldingIndexes = new Set([selectedFoldingPoint.index]);
    originalPrfHz = 4 * Math.abs(selectedFoldingPoint.trueDopplerHz);
    targetEchoUs = (2 * (model.altitudeKm * 1000 + model.iceIndex * model.targetDepthKm * 1000) / C) * 1e6;
    basePriUs = 1e6 / originalPrfHz;
    simpleTimingPrfMaxHz = 1e6 / (targetEchoUs + SIMPLE_LISTEN_MARGIN_US);
    safePrfMaxHz = Math.min(REASON_PRF_MAX_HZ, simpleTimingPrfMaxHz);
    // A resolution cell is one FFT/range-bin wide, so coincidence is tested
    // against the half width on either side of the cell center.
    model.dopplerToleranceHz = originalPrfHz / PROCESSING_TRACE_COUNT / 2;
    model.depthToleranceKm = PROCESSING_MAX_DEPTH_KM / (PROCESSING_DEPTH_BINS - 1) / 2;

    selectedFoldPrfHz = Math.abs(selectedFoldingPoint.trueDopplerHz);
    const sliderHalfWindowHz = Math.max(28, model.dopplerToleranceHz * 0.55);
    const sliderMinHz = Math.floor(selectedFoldPrfHz - sliderHalfWindowHz);
    const sliderMaxHz = Math.ceil(selectedFoldPrfHz + sliderHalfWindowHz);
    prfSlider.min = String(sliderMinHz);
    prfSlider.max = String(sliderMaxHz);
    if (resetPrf || Number(prfSlider.value) < sliderMinHz || Number(prfSlider.value) > sliderMaxHz) {
      prfSlider.value = selectedFoldPrfHz.toFixed(1);
    }
    if (prfMinLabel) prfMinLabel.textContent = `${fmt(sliderMinHz, 0)} Hz`;
    if (prfMaxLabel) prfMaxLabel.textContent = `${fmt(sliderMaxHz, 0)} Hz`;

    const edgeBands = [Number(prfSlider.min), Number(prfSlider.max)]
      .map(continuousFoldBand)
      .filter(Boolean);
    const rawMin = Math.min(model.targetDepthKm - model.depthToleranceKm, ...edgeBands.map((band) => band.minDepthKm));
    const rawMax = Math.max(model.targetDepthKm + model.depthToleranceKm, ...edgeBands.map((band) => band.maxDepthKm));
    foldDepthScaleKm = {
      min: Math.floor((rawMin - 0.10) * 10) / 10,
      max: Math.ceil((rawMax + 0.10) * 10) / 10
    };

    document.getElementById('given-altitude').textContent = `${fmt(model.altitudeKm, 0)} km`;
    document.getElementById('given-speed').textContent = `${fmt(model.velocityKmS, 1)} km/s`;
    document.getElementById('given-frequency').textContent = `${fmt(model.frequencyMhz, 0)} MHz`;
    document.getElementById('given-depth').textContent = `${fmt(model.targetDepthKm, 2)} km`;
    document.getElementById('given-index').textContent = fmt(model.iceIndex, 2);
    updateModelControlOutputs();
    updateFlybyControl(resetPrf);
  }

  function calculate(effectivePrfHz) {
    const points = fixedPoints.map((point) => ({
      ...point,
      aliasedDopplerHz: alias(point.trueDopplerHz, effectivePrfHz)
    }));
    const foldingReturn = points.find((point) => foldingIndexes.has(point.index));
    const selectedOverlaps = Math.abs(foldingReturn.aliasedDopplerHz) <= model.dopplerToleranceHz
      ? [foldingReturn]
      : [];
    return {
      points,
      foldingReturn,
      selectedOverlaps,
      effectivePrfHz,
      foldBand: continuousFoldBand(effectivePrfHz)
    };
  }

  function renderFoldDepthBlock(effectivePrfHz, movingState) {
    const width = 560;
    const height = 350;
    const margin = { left: 68, right: 25, top: 50, bottom: 42 };
    const depthMinKm = 0;
    const depthMaxKm = 12;
    const sy = (value) => margin.top + ((value - depthMinKm) / (depthMaxKm - depthMinKm)) * (height - margin.top - margin.bottom);
    const clutterVisible = movingState.surfaceApparentDepthKm >= depthMinKm && movingState.surfaceApparentDepthKm <= depthMaxKm;
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Selected clutter apparent depth at fixed PRF while the aircraft moves through time">
      <defs><linearGradient id="blur-block" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9b3d3f" stop-opacity=".10"></stop><stop offset=".5" stop-color="#9b3d3f" stop-opacity="${movingState.overlapsTarget ? '.50' : '.30'}"></stop><stop offset="1" stop-color="#9b3d3f" stop-opacity=".10"></stop></linearGradient></defs>`;

    svg += `<text class="blur-title-text" x="${margin.left}" y="18">fixed PRF: ${fmt(effectivePrfHz, 1)} Hz</text>`;
    svg += `<text class="blur-title-text" x="${margin.left}" y="35">flyby time: ${signed(flyby.timeS, 1)} s</text>`;
    for (let index = 0; index < 6; index += 1) {
      const value = depthMinKm + ((depthMaxKm - depthMinKm) * index) / 5;
      const y = sy(value);
      svg += `<line class="blur-grid" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line>`;
      svg += `<text class="blur-label" x="${margin.left - 10}" y="${y + 4}" text-anchor="end">${fmt(value, 1)}</text>`;
    }
    svg += `<line class="blur-axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>`;
    svg += `<rect class="blur-target-window" x="${margin.left}" y="${sy(model.targetDepthKm - model.depthToleranceKm)}" width="${width - margin.left - margin.right}" height="${sy(model.targetDepthKm + model.depthToleranceKm) - sy(model.targetDepthKm - model.depthToleranceKm)}"></rect>`;
    svg += `<line class="blur-target-depth" x1="${margin.left}" y1="${sy(model.targetDepthKm)}" x2="${width - margin.right}" y2="${sy(model.targetDepthKm)}"></line>`;
    svg += `<text class="blur-title-text" x="${width - margin.right}" y="${sy(model.targetDepthKm) - 7}" text-anchor="end">target ${fmt(model.targetDepthKm, 2)} km ± ${fmt(model.depthToleranceKm, 2)} km</text>`;

    if (clutterVisible) {
      const clutterTop = sy(movingState.surfaceApparentDepthKm - model.depthToleranceKm);
      const clutterBottom = sy(movingState.surfaceApparentDepthKm + model.depthToleranceKm);
      svg += `<rect class="blur-layer-block" x="${margin.left}" y="${clutterTop}" width="${width - margin.left - margin.right}" height="${Math.max(1, clutterBottom - clutterTop)}"></rect>`;
      svg += `<line class="blur-layer-edge" x1="${margin.left}" y1="${sy(movingState.surfaceApparentDepthKm)}" x2="${width - margin.right}" y2="${sy(movingState.surfaceApparentDepthKm)}"></line>`;
      svg += `<text class="blur-title-text" x="${margin.left + 10}" y="${clutterTop - 8}">surface clutter echo ${fmt(movingState.surfaceApparentDepthKm, 2)} km</text>`;
    } else {
      svg += `<text class="blur-title-text" x="${margin.left + (width - margin.left - margin.right) / 2}" y="${margin.top + 35}" text-anchor="middle">surface clutter echo is outside the 0-12 km view</text>`;
    }

    svg += `<text class="blur-title-text" transform="translate(17 ${margin.top + (height - margin.top - margin.bottom) / 2}) rotate(-90)" text-anchor="middle">apparent depth (km, downward)</text>`;
    svg += '</svg>';
    blurPlot.innerHTML = svg;
  }

  function renderDopplerBins(movingState) {
    if (!dopplerBinsPlot) return;
    const width = 900;
    const height = 315;
    const margin = { left: 70, right: 38, top: 38, bottom: 45 };
    const plotWidth = width - margin.left - margin.right;
    const prf = movingState.effectivePrfHz;
    const trueMinOrder = Math.floor((Math.min(movingState.surfaceTrueDopplerHz, movingState.targetTrueDopplerHz) - prf) / prf);
    const trueMaxOrder = Math.ceil((Math.max(movingState.surfaceTrueDopplerHz, movingState.targetTrueDopplerHz) + prf) / prf);
    const trueMin = trueMinOrder * prf - prf / 2;
    const trueMax = trueMaxOrder * prf + prf / 2;
    const sxTrue = (value) => margin.left + ((value - trueMin) / (trueMax - trueMin)) * plotWidth;
    const sxAlias = (value) => margin.left + ((value + prf / 2) / prf) * plotWidth;
    const trueY = 94;
    const aliasY = 212;
    const binHeight = 54;
    const binStep = prf / 8;
    const targetLeft = sxAlias(movingState.targetAliasHz - model.dopplerToleranceHz);
    const targetRight = sxAlias(movingState.targetAliasHz + model.dopplerToleranceHz);
    const foldText = movingState.foldOrder === 0
      ? 'no fold: surface true Doppler is already inside the sampled interval'
      : `fold order ${movingState.foldOrder}: surface Doppler is shifted by ${signed(movingState.foldOrder * prf, 1)} Hz into the sampled interval`;
    const overlapText = movingState.overlapsTarget
      ? 'alias overlap: surface and target land in the same Doppler-depth cell'
      : 'separate bins/cells: clutter is not on the target response';

    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Doppler bin visualization for one surface clutter return and one subsurface target">
      <defs>
        <marker id="fold-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" class="bin-arrow-head"></path></marker>
      </defs>`;
    svg += `<text class="bin-title" x="${margin.left}" y="18">${foldText}</text>`;
    svg += `<text class="${movingState.overlapsTarget ? 'bin-danger' : 'bin-note'}" x="${width - margin.right}" y="18" text-anchor="end">${overlapText}</text>`;

    for (let order = trueMinOrder; order <= trueMaxOrder; order += 1) {
      const left = sxTrue(order * prf - prf / 2);
      const right = sxTrue(order * prf + prf / 2);
      svg += `<rect class="${order === 0 ? 'bin-zero-band' : 'bin-repeat-band'}" x="${left}" y="${trueY - binHeight / 2}" width="${Math.max(1, right - left)}" height="${binHeight}"></rect>`;
      svg += `<line class="bin-grid" x1="${left}" y1="${trueY - binHeight / 2}" x2="${left}" y2="${trueY + binHeight / 2}"></line>`;
      svg += `<text class="bin-label" x="${(left + right) / 2}" y="${trueY + binHeight / 2 + 15}" text-anchor="middle">order ${order}</text>`;
    }

    for (let value = -prf / 2; value <= prf / 2 + 0.001; value += binStep) {
      const x = sxAlias(value);
      svg += `<line class="bin-grid" x1="${x}" y1="${aliasY - binHeight / 2}" x2="${x}" y2="${aliasY + binHeight / 2}"></line>`;
      if (Math.abs(value % (prf / 2)) < 0.001 || Math.abs(value) < 0.001) {
        svg += `<text class="bin-label" x="${x}" y="${aliasY + binHeight / 2 + 15}" text-anchor="middle">${signed(value, 0)}</text>`;
      }
    }

    svg += `<rect class="bin-zero-band" x="${margin.left}" y="${aliasY - binHeight / 2}" width="${plotWidth}" height="${binHeight}"></rect>`;
    svg += `<rect class="bin-target-window" x="${Math.min(targetLeft, targetRight)}" y="${aliasY - binHeight / 2}" width="${Math.max(2, Math.abs(targetRight - targetLeft))}" height="${binHeight}"></rect>`;
    svg += `<line class="bin-axis" x1="${margin.left}" y1="${trueY}" x2="${width - margin.right}" y2="${trueY}"></line>`;
    svg += `<line class="bin-axis" x1="${margin.left}" y1="${aliasY}" x2="${width - margin.right}" y2="${aliasY}"></line>`;
    svg += `<text class="bin-lane-label" x="${margin.left - 12}" y="${trueY + 4}" text-anchor="end">true Doppler</text>`;
    svg += `<text class="bin-lane-label" x="${margin.left - 12}" y="${aliasY + 4}" text-anchor="end">sampled bin</text>`;
    svg += `<path class="bin-fold-link" d="M ${sxTrue(movingState.surfaceTrueDopplerHz)} ${trueY + 8} C ${sxTrue(movingState.surfaceTrueDopplerHz)} 145, ${sxAlias(movingState.surfaceAliasHz)} 160, ${sxAlias(movingState.surfaceAliasHz)} ${aliasY - 10}" marker-end="url(#fold-arrow)"></path>`;

    svg += `<circle class="bin-surface-marker" cx="${sxTrue(movingState.surfaceTrueDopplerHz)}" cy="${trueY}" r="7"></circle>`;
    svg += `<text class="bin-note" x="${sxTrue(movingState.surfaceTrueDopplerHz) + 10}" y="${trueY - 10}">surface true ${signed(movingState.surfaceTrueDopplerHz, 1)} Hz</text>`;
    svg += `<rect class="bin-target-marker" x="${sxTrue(movingState.targetTrueDopplerHz) - 6}" y="${trueY - 6}" width="12" height="12" transform="rotate(45 ${sxTrue(movingState.targetTrueDopplerHz)} ${trueY})"></rect>`;
    svg += `<text class="bin-note" x="${sxTrue(movingState.targetTrueDopplerHz) + 10}" y="${trueY + 21}">target true ${signed(movingState.targetTrueDopplerHz, 1)} Hz</text>`;

    svg += `<circle class="bin-surface-marker ${movingState.overlapsTarget ? 'overlap' : ''}" cx="${sxAlias(movingState.surfaceAliasHz)}" cy="${aliasY}" r="8"></circle>`;
    svg += `<text class="bin-note" x="${sxAlias(movingState.surfaceAliasHz) + 10}" y="${aliasY - 12}">surface alias ${signed(movingState.surfaceAliasHz, 1)} Hz</text>`;
    svg += `<rect class="bin-target-marker ${movingState.overlapsTarget ? 'overlap' : ''}" x="${sxAlias(movingState.targetAliasHz) - 7}" y="${aliasY - 7}" width="14" height="14" transform="rotate(45 ${sxAlias(movingState.targetAliasHz)} ${aliasY})"></rect>`;
    svg += `<text class="bin-note" x="${sxAlias(movingState.targetAliasHz) + 10}" y="${aliasY + 24}">target alias ${signed(movingState.targetAliasHz, 1)} Hz</text>`;
    svg += `<text class="bin-label" x="${margin.left + plotWidth / 2}" y="${height - 8}" text-anchor="middle">fixed PRF bin window: -PRF/2 to +PRF/2 (${fmt(prf, 1)} Hz wide)</text>`;
    svg += '</svg>';
    dopplerBinsPlot.innerHTML = svg;
  }

  function deterministicUnit(seedA, seedB = 0) {
    const value = Math.sin(seedA * 12.9898 + seedB * 78.233) * 43758.5453;
    return value - Math.floor(value);
  }

  function rickerWavelet(depthOffsetKm, widthKm) {
    const normalized = depthOffsetKm / widthKm;
    return (1 - normalized ** 2) * Math.exp(-0.5 * normalized ** 2);
  }

  function addRadarEcho(rows, traceIndex, depthKm, amplitude, widthKm, depthMinKm, depthMaxKm) {
    if (depthKm < depthMinKm - 4 * widthKm || depthKm > depthMaxKm + 4 * widthKm) return;
    const depthStepKm = (depthMaxKm - depthMinKm) / (rows.length - 1);
    const centerIndex = (depthKm - depthMinKm) / depthStepKm;
    const radius = Math.max(2, Math.ceil((4 * widthKm) / depthStepKm));
    const firstIndex = Math.max(0, Math.floor(centerIndex) - radius);
    const lastIndex = Math.min(rows.length - 1, Math.ceil(centerIndex) + radius);
    for (let depthIndex = firstIndex; depthIndex <= lastIndex; depthIndex += 1) {
      const sampleDepthKm = depthMinKm + depthIndex * depthStepKm;
      rows[depthIndex][traceIndex] += amplitude * rickerWavelet(sampleDepthKm - depthKm, widthKm);
    }
  }

  // Build a variable-density B-scan from trace-by-trace slant-range delays.
  // The target and every surface cell generate a band-limited radar pulse. The
  // surface-cell amplitude is the response of the target's zero-Doppler filter,
  // evaluated after that cell's Doppler has been folded by the selected PRF.
  // Several neighboring cells pass together, so their coherent range responses
  // form a thick, speckled clutter tail instead of a decorative horizontal band.
  function buildLiveBScan(options) {
    const traceCount = 193;
    const depthBins = 361;
    const xMinKm = -40;
    const xMaxKm = 40;
    // Keep the ordinary radar echoes and the PRF-selected clutter response in
    // separate signal buffers. They are still generated by the same delayed
    // wavelets, but separate buffers let the display apply realistic AGC to a
    // weak folded return without letting the strong surface echo hide it.
    const baseRows = Array.from({ length: depthBins }, () => new Float32Array(traceCount));
    const foldRows = Array.from({ length: depthBins }, () => new Float32Array(traceCount));
    const dopplerBinHz = Math.max(model.dopplerToleranceHz, options.effectivePrfHz / PROCESSING_TRACE_COUNT);
    const filterSigmaHz = Math.max(12, dopplerBinHz * 0.48);
    const targetOpticalHeightKm = model.altitudeKm + model.iceIndex * model.targetDepthKm;
    const surfaceCellCount = 81;
    const foldDopplerHz = options.foldBand ? options.foldBand.order * options.effectivePrfHz : null;
    const foldSinTheta = Number.isFinite(foldDopplerHz)
      ? foldDopplerHz * wavelengthM / (2 * model.velocityKmS * 1000)
      : null;
    const activeFoldSurfaceXKm = Number.isFinite(foldSinTheta) && foldSinTheta > 0 && foldSinTheta < 1
      ? model.altitudeKm * foldSinTheta / Math.sqrt(1 - foldSinTheta ** 2)
      : null;

    for (let traceIndex = 0; traceIndex < traceCount; traceIndex += 1) {
      const alongTrackKm = xMinKm + (traceIndex / (traceCount - 1)) * (xMaxKm - xMinKm);

      // A strong surface reflection and three weak interfaces give the B-scan
      // normal radargram context without determining the alias result.
      const surfaceDepthKm = 0.12 + 0.025 * Math.sin(alongTrackKm * 0.24);
      addRadarEcho(baseRows, traceIndex, surfaceDepthKm, 0.95, 0.055, options.depthMinKm, options.depthMaxKm);
      [
        { depthKm: 1.75 + 0.08 * Math.sin(alongTrackKm * 0.12), amplitude: 0.10, widthKm: 0.075 },
        { depthKm: 3.55 + 0.13 * Math.sin(alongTrackKm * 0.08 + 1.2), amplitude: -0.075, widthKm: 0.085 },
        { depthKm: 9.65 + 0.16 * Math.sin(alongTrackKm * 0.07 - 0.8), amplitude: 0.065, widthKm: 0.10 }
      ].forEach((layer) => {
        addRadarEcho(baseRows, traceIndex, layer.depthKm, layer.amplitude, layer.widthKm, options.depthMinKm, options.depthMaxKm);
      });

      // One fixed subsurface point target. Its delay migrates with platform
      // position, so it appears as a localized hyperbola with a 6.74 km apex.
      const targetOpticalRangeKm = Math.hypot(targetOpticalHeightKm, alongTrackKm);
      const targetApparentDepthKm = (targetOpticalRangeKm - model.altitudeKm) / model.iceIndex;
      const targetBeamWeight = Math.exp(-0.5 * (alongTrackKm / 18) ** 2);
      addRadarEcho(
        baseRows,
        traceIndex,
        targetApparentDepthKm,
        0.62 * targetBeamWeight,
        0.085,
        options.depthMinKm,
        options.depthMaxKm
      );

      // Positive-Doppler continuous surface cells. Only cells whose aliased
      // Doppler falls inside the target cell contribute strongly. Their slant-
      // range histories create the moving clutter hyperbola/blur seen below.
      for (let cellIndex = 0; cellIndex < surfaceCellCount; cellIndex += 1) {
        const surfaceXKm = 5 + (cellIndex / (surfaceCellCount - 1)) * (model.spreadKm - 5);
        const centerRangeKm = Math.hypot(model.altitudeKm, surfaceXKm);
        const trueDopplerHz = (2 * model.velocityKmS * 1000 / wavelengthM) * (surfaceXKm / centerRangeKm);
        const aliasedDopplerHz = alias(trueDopplerHz, options.effectivePrfHz);
        const dopplerCellWeight = Math.exp(-0.5 * (aliasedDopplerHz / filterSigmaHz) ** 2);
        if (dopplerCellWeight < 0.008) continue;

        const slantRangeKm = Math.hypot(model.altitudeKm, surfaceXKm - alongTrackKm);
        const apparentDepthKm = (slantRangeKm - model.altitudeKm) / model.iceIndex;
        const reflectivity = 0.58 + 0.42 * deterministicUnit(cellIndex + 1, 7);
        const footprintWeight = 1 / (1 + 0.0016 * (surfaceXKm - alongTrackKm) ** 2);
        const polarity = deterministicUnit(cellIndex + 3, 11) > 0.34 ? 1 : -0.72;
        const amplitude = 0.58 * reflectivity * footprintWeight * dopplerCellWeight * polarity;
        for (let facetIndex = 0; facetIndex < 3; facetIndex += 1) {
          const facetSeed = cellIndex * 3 + facetIndex + 1;
          const depthJitterKm = (deterministicUnit(facetSeed, 31) - 0.5) * 0.20;
          const facetScale = 0.24 + 0.20 * deterministicUnit(facetSeed, 37);
          const facetPolarity = deterministicUnit(facetSeed, 41) > 0.22 ? 1 : -0.65;
          const pulseWidthKm = 0.085 + 0.045 * deterministicUnit(facetSeed, 43);
          addRadarEcho(
            foldRows,
            traceIndex,
            apparentDepthKm + depthJitterKm,
            amplitude * facetScale * facetPolarity,
            pulseWidthKm,
            options.depthMinKm,
            options.depthMaxKm
          );
        }
      }

      // Resolve the continuous surface cell at fD = order × PRF directly.
      // This keeps the visible smear centered on the same fold depth reported
      // by the analytic graph, so dragging PRF visibly moves the radargram echo.
      if (Number.isFinite(activeFoldSurfaceXKm)) {
        for (let facetIndex = 0; facetIndex < 17; facetIndex += 1) {
          const normalizedFacet = (facetIndex - 8) / 8;
          const facetSeed = facetIndex + 101;
          const surfaceOffsetKm = normalizedFacet * 1.45
            + (deterministicUnit(facetSeed, 47) - 0.5) * 0.16;
          const facetXKm = activeFoldSurfaceXKm + surfaceOffsetKm;
          const facetRangeKm = Math.hypot(model.altitudeKm, facetXKm - alongTrackKm);
          const facetDepthKm = (facetRangeKm - model.altitudeKm) / model.iceIndex;
          const rangeJitterKm = (deterministicUnit(facetSeed, 53) - 0.5) * 0.24;
          const surfaceSpreadWeight = Math.exp(-0.5 * (surfaceOffsetKm / 0.78) ** 2);
          const footprintWeight = 1 / (1 + 0.0016 * (facetXKm - alongTrackKm) ** 2);
          const facetPolarity = deterministicUnit(facetSeed, 59) > 0.28 ? 1 : -0.70;
          const facetAmplitude = 0.085 * surfaceSpreadWeight * footprintWeight * facetPolarity;
          const facetWidthKm = 0.10 + 0.05 * deterministicUnit(facetSeed, 61);
          addRadarEcho(
            foldRows,
            traceIndex,
            facetDepthKm + rangeJitterKm,
            facetAmplitude,
            facetWidthKm,
            options.depthMinKm,
            options.depthMaxKm
          );
        }

        // The finite synthetic aperture cannot resolve those neighboring
        // facets individually at the center trace. Their range-compressed
        // responses form the localized blur patch that crosses the target as
        // PRF moves the fold depth.
        // The range-migrating hyperbola above is the unfocused trace history.
        // After range migration/stacking, its neighboring samples concentrate
        // into a short clutter patch at the analytic fold-band center. A small
        // residual curvature prevents the patch from looking like a drawn
        // straight line while keeping its vertical position identical to the
        // PRF fold-band graph and status readout.
        const focusedFoldDepthKm = options.foldBand.centerDepthKm
          + 0.0015 * alongTrackKm ** 2;
        const apertureWeight = Math.exp(-0.5 * (alongTrackKm / 8.0) ** 2);
        for (let blurFacetIndex = 0; blurFacetIndex < 13; blurFacetIndex += 1) {
          const blurSeed = blurFacetIndex + 211;
          const blurDepthJitterKm = (deterministicUnit(blurSeed, 67) - 0.5) * 0.62;
          const blurPolarity = 0.72 + 0.28 * deterministicUnit(blurSeed, 71);
          const blurAmplitude = 0.13 * apertureWeight
            * (0.62 + 0.38 * deterministicUnit(blurSeed, 73))
            * blurPolarity;
          const blurWidthKm = 0.12 + 0.07 * deterministicUnit(blurSeed, 79);
          addRadarEcho(
            foldRows,
            traceIndex,
            focusedFoldDepthKm + blurDepthJitterKm,
            blurAmplitude,
            blurWidthKm,
            options.depthMinKm,
            options.depthMaxKm
          );
        }
      }

      // Weak distributed point returns make the background recognizably
      // radar-like. They are deterministic synthetic scatterers, not a visual
      // texture painted after the signal is formed.
      for (let scattererIndex = 0; scattererIndex < 18; scattererIndex += 1) {
        const scattererXKm = -36 + 72 * deterministicUnit(scattererIndex + 1, 19);
        const scattererDepthKm = 1.0 + 10.0 * deterministicUnit(scattererIndex + 1, 23);
        const opticalHeightKm = model.altitudeKm + model.iceIndex * scattererDepthKm;
        const opticalRangeKm = Math.hypot(opticalHeightKm, alongTrackKm - scattererXKm);
        const apparentDepthKm = (opticalRangeKm - model.altitudeKm) / model.iceIndex;
        const amplitude = (deterministicUnit(scattererIndex + 1, 29) - 0.5) * 0.09;
        addRadarEcho(baseRows, traceIndex, apparentDepthKm, amplitude, 0.065, options.depthMinKm, options.depthMaxKm);
      }
    }

    return { baseRows, foldRows, traceCount, depthBins, xMinKm, xMaxKm };
  }

  function robustSignalClip(rows, percentile, minimum) {
    const absoluteSamples = [];
    rows.forEach((row) => row.forEach((value) => {
      const absoluteValue = Math.abs(value);
      if (absoluteValue > 1e-7) absoluteSamples.push(absoluteValue);
    }));
    if (!absoluteSamples.length) return minimum;
    absoluteSamples.sort((a, b) => a - b);
    const sampleIndex = Math.min(
      absoluteSamples.length - 1,
      Math.floor(absoluteSamples.length * percentile)
    );
    return Math.max(minimum, absoluteSamples[sampleIndex]);
  }

  function liveBScanTextureUrl(options) {
    const bScan = buildLiveBScan(options);
    const pixelWidth = bScan.traceCount;
    const pixelHeight = bScan.depthBins;
    const canvas = document.createElement('canvas');
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const image = context.createImageData(pixelWidth, pixelHeight);
    const data = image.data;
    // Radar displays normally use gain/AGC because surface power can exceed a
    // weak subsurface or aliased return by orders of magnitude. Normalize the
    // generated base and folded signal channels independently, then combine
    // them. This changes display gain only; it does not paint a blur overlay.
    const baseClipValue = robustSignalClip(bScan.baseRows, 0.985, 0.08);
    const foldClipValue = robustSignalClip(bScan.foldRows, 0.970, 0.025);

    for (let depthIndex = 0; depthIndex < bScan.depthBins; depthIndex += 1) {
      const timeGain = 0.92 + 0.34 * (depthIndex / (bScan.depthBins - 1));
      for (let traceIndex = 0; traceIndex < bScan.traceCount; traceIndex += 1) {
        const coherentNoise = 0.018 * (deterministicUnit(depthIndex + 1, traceIndex + 37) - 0.5);
        const traceStripe = 0.008 * Math.sin(traceIndex * 0.93 + depthIndex * 0.03);
        const baseSample = bScan.baseRows[depthIndex][traceIndex] * timeGain;
        const foldSample = bScan.foldRows[depthIndex][traceIndex] * timeGain;
        const baseNormalized = Math.tanh(baseSample / (baseClipValue * 0.76));
        const foldNormalized = Math.tanh(foldSample / (foldClipValue * 0.62));
        const gray = Math.max(18, Math.min(248, Math.round(
          202 - baseNormalized * 82 - foldNormalized * 96 - (coherentNoise + traceStripe) * 105
        )));
        const pixelIndex = (depthIndex * pixelWidth + traceIndex) * 4;
        data[pixelIndex] = gray;
        data[pixelIndex + 1] = gray;
        data[pixelIndex + 2] = gray;
        data[pixelIndex + 3] = 255;
      }
    }

    context.putImageData(image, 0, 0);
    return canvas.toDataURL('image/png');
  }

  function renderBScanRadargram(container, effectivePrfHz, foldBand, overlapsTarget, options = {}) {
    const width = 900;
    const height = 455;
    const margin = { left: 72, right: 24, top: 42, bottom: 52 };
    const xMinKm = -40;
    const xMaxKm = 40;
    const depthMinKm = 0;
    const depthMaxKm = Math.max(12, Math.ceil(model.targetDepthKm + 4));
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const sx = (value) => margin.left + ((value - xMinKm) / (xMaxKm - xMinKm)) * plotWidth;
    const sy = (value) => margin.top + ((value - depthMinKm) / (depthMaxKm - depthMinKm)) * plotHeight;
    const xTicks = [-40, -20, 0, 20, 40];
    const yTicks = [0, 3, 6, 9, 12].filter((value) => value <= depthMaxKm);
    const aliasHz = alias(selectedFoldingPoint.trueDopplerHz, effectivePrfHz);
    const textureUrl = liveBScanTextureUrl({
      depthMinKm,
      depthMaxKm,
      foldBand,
      effectivePrfHz,
      aliasHz,
      overlapsTarget
    });
    const referenceRangeText = effectivePrfHz <= REASON_PRF_MAX_HZ
      ? 'within published PRF range'
      : 'reference only: above published PRF range';
    const readout = options.reference
      ? `Doppler-unaliased reference ${fmt(effectivePrfHz, 1)} Hz · Nyquist ±${fmt(effectivePrfHz / 2, 1)} Hz · ${referenceRangeText}`
      : `Aliased PRF ${fmt(effectivePrfHz, 1)} Hz · clutter alias ${signed(aliasHz, 1)} Hz · fold depth ${foldBand ? `${fmt(foldBand.centerDepthKm, 2)} km` : 'outside model'}`;
    const ariaLabel = options.reference
      ? 'Synthetic variable-density B-scan at a Doppler-unaliased reference sampling rate, showing a clear fixed subsurface target hyperbola without a folded surface-clutter tail'
      : 'Synthetic variable-density B-scan with a surface return, a fixed subsurface target hyperbola, and a PRF-selected surface-clutter tail';
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${ariaLabel}">`;

    svg += `<image class="bscan-radargram-texture" href="${textureUrl}" x="${margin.left}" y="${margin.top}" width="${plotWidth}" height="${plotHeight}" preserveAspectRatio="none"></image>`;
    xTicks.forEach((value) => {
      const x = sx(value);
      svg += `<line class="bscan-tick" x1="${x}" y1="${height - margin.bottom}" x2="${x}" y2="${height - margin.bottom + 6}"></line>`;
      svg += `<text class="bscan-label" x="${x}" y="${height - margin.bottom + 22}" text-anchor="middle">${signed(value, 0)}</text>`;
    });
    yTicks.forEach((value) => {
      const y = sy(value);
      svg += `<line class="bscan-tick" x1="${margin.left - 6}" y1="${y}" x2="${margin.left}" y2="${y}"></line>`;
      svg += `<text class="bscan-label" x="${margin.left - 11}" y="${y + 4}" text-anchor="end">${fmt(value, 0)}</text>`;
    });
    svg += `<rect class="bscan-frame" x="${margin.left}" y="${margin.top}" width="${plotWidth}" height="${plotHeight}"></rect>`;
    svg += `<text class="bscan-title" x="${margin.left}" y="18">${readout}</text>`;
    svg += `<text class="bscan-label" x="${margin.left + plotWidth / 2}" y="${height - 8}" text-anchor="middle">along-track position (km)</text>`;
    svg += `<text class="bscan-label" transform="translate(18 ${margin.top + plotHeight / 2}) rotate(-90)" text-anchor="middle">apparent depth (km, downward)</text>`;
    svg += '</svg>';
    container.innerHTML = svg;
  }

  function renderLiveRadargram(effectivePrfHz, foldBand, overlapsTarget) {
    renderBScanRadargram(liveRadargramPlot, effectivePrfHz, foldBand, overlapsTarget);
  }

  function renderReferenceRadargram() {
    const maximumSurfaceDopplerHz = 2 * model.velocityKmS * 1000 / wavelengthM;
    const noFoldPrfHz = maximumSurfaceDopplerHz * 2.1;
    const referencePrfHz = Math.max(originalPrfHz, noFoldPrfHz);
    const cacheKey = [
      model.altitudeKm,
      model.velocityKmS,
      model.targetDepthKm,
      model.iceIndex,
      referencePrfHz
    ].join('|');
    if (cacheKey === referenceRadargramCacheKey && referenceRadargramPlot.firstChild) return;
    renderBScanRadargram(referenceRadargramPlot, referencePrfHz, null, false, { reference: true });
    referenceRadargramCacheKey = cacheKey;
  }

  // Check 1: compare only the selected clutter trace against the fixed target
  // trace. The moving marker follows the current plane time; overlap requires
  // the two returns to share both fast-time delay and folded Doppler bin.
  function renderTraceCheck(movingState) {
    const width = 560;
    const height = 350;
    const margin = { left: 62, right: 24, top: 55, bottom: 42 };
    const xMinKm = -model.spreadKm;
    const xMaxKm = model.spreadKm;
    const depthMinKm = 0;
    const depthMaxKm = 12;
    const sx = (value) => margin.left + ((value - xMinKm) / (xMaxKm - xMinKm)) * (width - margin.left - margin.right);
    const sy = (value) => margin.top + ((value - depthMinKm) / (depthMaxKm - depthMinKm)) * (height - margin.top - margin.bottom);
    const pathFor = (depthAtX) => Array.from({ length: 181 }, (_, index) => {
      const xKm = xMinKm + ((xMaxKm - xMinKm) * index) / 180;
      return `${index ? 'L' : 'M'} ${sx(xKm).toFixed(2)} ${sy(depthAtX(xKm)).toFixed(2)}`;
    }).join(' ');
    const clutterTraceDepth = (platformXKm) => {
      const curvatureHeightKm = model.altitudeKm;
      const depthRiseAtCrossingKm = (
        Math.hypot(curvatureHeightKm, movingState.surfaceXKm) - curvatureHeightKm
      ) / model.iceIndex;
      const apexDepthKm = model.targetDepthKm - depthRiseAtCrossingKm;
      return apexDepthKm + (
        Math.hypot(curvatureHeightKm, platformXKm - movingState.surfaceXKm) - curvatureHeightKm
      ) / model.iceIndex;
    };
    const targetEquivalentRangeKm = model.altitudeKm + model.iceIndex * model.targetDepthKm;
    const targetTraceDepth = (platformXKm) => (
      Math.hypot(targetEquivalentRangeKm, platformXKm) - model.altitudeKm
    ) / model.iceIndex;
    const intersectionX = sx(0);
    const intersectionY = sy(model.targetDepthKm);
    const stateLabel = movingState.overlapsTarget ? 'same delay + folded Doppler' : 'delay or folded Doppler separated';
    const currentXKm = Math.max(xMinKm, Math.min(xMaxKm, movingState.planeXKm));
    const currentX = sx(currentXKm);
    const clutterY = sy(clutterTraceDepth(currentXKm));
    const targetCurrentY = sy(targetTraceDepth(currentXKm));
    const movingLabelAnchor = currentXKm >= 0 ? 'start' : 'end';
    const movingLabelX = currentX + (currentXKm >= 0 ? 10 : -10);
    const movingLabelY = clutterY + (movingState.overlapsTarget ? 20 : -9);
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Selected clutter trace and fixed target trace crossing at 6.74 kilometers apparent depth">
      <defs><clipPath id="trace-check-clip"><rect x="${margin.left}" y="${margin.top}" width="${width - margin.left - margin.right}" height="${height - margin.top - margin.bottom}"></rect></clipPath></defs>`;

    svg += `<line class="check-clutter-curve selected" x1="${margin.left}" y1="16" x2="${margin.left + 28}" y2="16"></line>`;
    svg += `<text class="check-title" x="${margin.left + 35}" y="20">surface clutter hyperbola</text>`;
    svg += `<line class="check-target-curve" x1="${margin.left + 230}" y1="16" x2="${margin.left + 258}" y2="16"></line>`;
    svg += `<text class="check-title" x="${margin.left + 265}" y="20">subsurface target hyperbola</text>`;
    svg += `<text class="${movingState.overlapsTarget ? 'check-danger' : 'check-title'}" x="${margin.left}" y="40">current trace: ${stateLabel}</text>`;

    [0, 3, 6, 9, 12].forEach((value) => {
      const y = sy(value);
      svg += `<line class="check-grid-line" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line>`;
      svg += `<text class="check-label" x="${margin.left - 9}" y="${y + 4}" text-anchor="end">${fmt(value, 0)}</text>`;
    });
    [-60, -30, 0, 30, 60].forEach((value) => {
      const x = sx(value);
      svg += `<line class="check-grid-line" x1="${x}" y1="${margin.top}" x2="${x}" y2="${height - margin.bottom}"></line>`;
      svg += `<text class="check-label" x="${x}" y="${height - margin.bottom + 17}" text-anchor="middle">${fmt(value, 0)}</text>`;
    });
    svg += `<rect class="check-target-window" x="${margin.left}" y="${sy(model.targetDepthKm - model.depthToleranceKm)}" width="${width - margin.left - margin.right}" height="${sy(model.targetDepthKm + model.depthToleranceKm) - sy(model.targetDepthKm - model.depthToleranceKm)}"></rect>`;
    svg += `<line class="check-guide" x1="${intersectionX}" y1="${margin.top}" x2="${intersectionX}" y2="${height - margin.bottom}"></line>`;
    svg += `<g clip-path="url(#trace-check-clip)">`;
    svg += `<path class="check-clutter-curve selected" d="${pathFor(clutterTraceDepth)}"><title>Selected surface clutter range trace</title></path>`;
    svg += `<path class="check-target-curve" d="${pathFor(targetTraceDepth)}"><title>Fixed subsurface target range trace</title></path>`;
    svg += '</g>';
    svg += `<line class="check-motion-guide" x1="${currentX}" y1="${margin.top}" x2="${currentX}" y2="${height - margin.bottom}"></line>`;
    svg += `<rect class="check-trace-target-marker" x="${intersectionX - 5}" y="${intersectionY - 5}" width="10" height="10" transform="rotate(45 ${intersectionX} ${intersectionY})"><title>Fixed subsurface target crossing</title></rect>`;
    svg += `<rect class="check-trace-target-marker" x="${currentX - 5}" y="${targetCurrentY - 5}" width="10" height="10" transform="rotate(45 ${currentX} ${targetCurrentY})"><title>Target at current plane trace</title></rect>`;
    svg += `<circle class="check-moving-clutter${movingState.overlapsTarget ? ' overlap' : ''}" cx="${currentX}" cy="${clutterY}" r="6"><title>Selected clutter: ${signed(movingState.surfaceAliasHz, 1)} Hz folded Doppler</title></circle>`;
    svg += `<text class="${movingState.overlapsTarget ? 'check-danger' : 'check-title'}" x="${movingLabelX}" y="${movingLabelY}" text-anchor="${movingLabelAnchor}">moving clutter dot</text>`;
    svg += `<text class="${movingState.overlapsTarget ? 'check-danger' : 'check-title'}" x="${intersectionX + 10}" y="${intersectionY - 9}">${fmt(model.targetDepthKm, 2)} km zero-time crossing</text>`;
    svg += `<line class="check-axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>`;
    svg += `<line class="check-axis" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"></line>`;
    svg += `<text class="check-title" x="${margin.left + (width - margin.left - margin.right) / 2}" y="${height - 5}" text-anchor="middle">along-track position (km)</text>`;
    svg += `<text class="check-title" transform="translate(17 ${margin.top + (height - margin.top - margin.bottom) / 2}) rotate(-90)" text-anchor="middle">apparent depth / fast time (km)</text>`;
    svg += '</svg>';
    traceCheckPlot.innerHTML = svg;
  }

  // Check 2: show the target resolution cell in fast-time × Doppler space.
  // The selected clutter ellipse moves horizontally as its true Doppler aliases.
  function renderFastTimeDopplerCheck(movingState) {
    const width = 560;
    const height = 350;
    const margin = { left: 68, right: 25, top: 55, bottom: 48 };
    const dopplerCenterHz = (movingState.surfaceAliasHz + movingState.targetAliasHz) / 2;
    const dopplerHalfSpanHz = Math.max(60, Math.abs(movingState.surfaceAliasHz - movingState.targetAliasHz) / 2 + 45);
    const dopplerMinHz = dopplerCenterHz - dopplerHalfSpanHz;
    const dopplerMaxHz = dopplerCenterHz + dopplerHalfSpanHz;
    const depthCenterKm = (movingState.surfaceApparentDepthKm + movingState.targetApparentDepthKm) / 2;
    const depthHalfSpanKm = Math.max(0.55, Math.abs(movingState.surfaceApparentDepthKm - movingState.targetApparentDepthKm) / 2 + 0.34);
    const depthMinKm = Math.max(0, depthCenterKm - depthHalfSpanKm);
    const depthMaxKm = depthCenterKm + depthHalfSpanKm;
    const sx = (value) => margin.left + ((value - dopplerMinHz) / (dopplerMaxHz - dopplerMinHz)) * (width - margin.left - margin.right);
    const sy = (value) => margin.top + ((value - depthMinKm) / (depthMaxKm - depthMinKm)) * (height - margin.top - margin.bottom);
    // Each response gets half the combined overlap tolerance. Their visible
    // tails touch exactly when the center-to-center tolerance is reached.
    const tailRadiusX = Math.abs(sx(model.dopplerToleranceHz / 2) - sx(0));
    const tailRadiusY = Math.abs(sy(movingState.targetApparentDepthKm + model.depthToleranceKm / 2) - sy(movingState.targetApparentDepthKm));
    const aliasLabel = signed(movingState.surfaceAliasHz, 1);
    const stateLabel = movingState.overlapsTarget ? 'folded tails overlap the target response' : 'folded tails remain separated from the target response';
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Fast-time by aliased Doppler check at ${fmt(movingState.effectivePrfHz, 1)} hertz; ${stateLabel}">
      <defs>
        <clipPath id="doppler-check-clip"><rect x="${margin.left}" y="${margin.top}" width="${width - margin.left - margin.right}" height="${height - margin.top - margin.bottom}"></rect></clipPath>
        <radialGradient id="clutter-tail"><stop offset="0" stop-color="#9b3d3f" stop-opacity=".55"></stop><stop offset=".55" stop-color="#d98473" stop-opacity=".25"></stop><stop offset="1" stop-color="#d98473" stop-opacity=".03"></stop></radialGradient>
        <radialGradient id="target-tail"><stop offset="0" stop-color="#2f6f73" stop-opacity=".50"></stop><stop offset=".58" stop-color="#2f6f73" stop-opacity=".20"></stop><stop offset="1" stop-color="#2f6f73" stop-opacity=".03"></stop></radialGradient>
      </defs>`;

    svg += `<text class="check-title" x="${margin.left}" y="18">selected clutter alias: ${aliasLabel} Hz</text>`;
    svg += `<text class="${movingState.overlapsTarget ? 'check-danger' : 'check-title'}" x="${margin.left}" y="39">${stateLabel}</text>`;
    Array.from({ length: 5 }, (_, index) => dopplerMinHz + (index * (dopplerMaxHz - dopplerMinHz)) / 4).forEach((value) => {
      const x = sx(value);
      svg += `<line class="check-grid-line" x1="${x}" y1="${margin.top}" x2="${x}" y2="${height - margin.bottom}"></line>`;
      svg += `<text class="check-label" x="${x}" y="${height - margin.bottom + 17}" text-anchor="middle">${signed(value, 0)}</text>`;
    });
    Array.from({ length: 6 }, (_, index) => depthMinKm + (index * (depthMaxKm - depthMinKm)) / 5).forEach((value) => {
      const y = sy(value);
      svg += `<line class="check-grid-line" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line>`;
      svg += `<text class="check-label" x="${margin.left - 9}" y="${y + 4}" text-anchor="end">${fmt(value, 1)}</text>`;
    });
    svg += `<g clip-path="url(#doppler-check-clip)">`;
    svg += `<rect class="check-target-window" x="${sx(movingState.targetAliasHz - model.dopplerToleranceHz)}" y="${sy(movingState.targetApparentDepthKm - model.depthToleranceKm)}" width="${sx(movingState.targetAliasHz + model.dopplerToleranceHz) - sx(movingState.targetAliasHz - model.dopplerToleranceHz)}" height="${sy(movingState.targetApparentDepthKm + model.depthToleranceKm) - sy(movingState.targetApparentDepthKm - model.depthToleranceKm)}"></rect>`;
    svg += `<line class="check-target-line" x1="${sx(movingState.targetAliasHz)}" y1="${margin.top}" x2="${sx(movingState.targetAliasHz)}" y2="${height - margin.bottom}"></line>`;
    svg += `<line class="check-target-line" x1="${margin.left}" y1="${sy(movingState.targetApparentDepthKm)}" x2="${width - margin.right}" y2="${sy(movingState.targetApparentDepthKm)}"></line>`;
    svg += `<ellipse class="check-target-tail" cx="${sx(movingState.targetAliasHz)}" cy="${sy(movingState.targetApparentDepthKm)}" rx="${tailRadiusX}" ry="${tailRadiusY}"></ellipse>`;
    svg += `<ellipse class="check-clutter-tail" cx="${sx(movingState.surfaceAliasHz)}" cy="${sy(movingState.surfaceApparentDepthKm)}" rx="${tailRadiusX}" ry="${tailRadiusY}"><title>Selected clutter: ${aliasLabel} Hz at ${fmt(movingState.surfaceApparentDepthKm, 2)} km</title></ellipse>`;
    svg += '</g>';
    svg += `<circle class="check-clutter-center" cx="${sx(movingState.surfaceAliasHz)}" cy="${sy(movingState.surfaceApparentDepthKm)}" r="5"></circle>`;
    svg += `<rect class="check-target-center" x="${sx(movingState.targetAliasHz) - 5}" y="${sy(movingState.targetApparentDepthKm) - 5}" width="10" height="10" transform="rotate(45 ${sx(movingState.targetAliasHz)} ${sy(movingState.targetApparentDepthKm)})"></rect>`;
    svg += `<line class="check-axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>`;
    svg += `<line class="check-axis" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"></line>`;
    svg += `<text class="check-title" x="${margin.left + (width - margin.left - margin.right) / 2}" y="${height - 7}" text-anchor="middle">aliased Doppler (Hz)</text>`;
    svg += `<text class="check-title" transform="translate(17 ${margin.top + (height - margin.top - margin.bottom) / 2}) rotate(-90)" text-anchor="middle">apparent depth / fast time (km)</text>`;
    svg += '</svg>';
    dopplerCheckPlot.innerHTML = svg;
  }

  const processingModel = {
    traceCount: PROCESSING_TRACE_COUNT,
    depthBins: PROCESSING_DEPTH_BINS,
    maxDepthKm: PROCESSING_MAX_DEPTH_KM,
    depthSigmaKm: 0.14,
    zoomDepthMinKm: 5.95,
    zoomDepthMaxKm: 7.55,
    zoomDopplerHz: 220
  };

  function fftComplex(input, inverse = false) {
    const n = input.length;
    const outputValues = input.map((value) => ({ re: value.re, im: value.im }));
    for (let i = 1, j = 0; i < n; i += 1) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        const temporary = outputValues[i];
        outputValues[i] = outputValues[j];
        outputValues[j] = temporary;
      }
    }
    for (let length = 2; length <= n; length <<= 1) {
      const halfLength = length >> 1;
      const angle = (inverse ? 2 : -2) * Math.PI / length;
      const stepRe = Math.cos(angle);
      const stepIm = Math.sin(angle);
      for (let start = 0; start < n; start += length) {
        let wRe = 1;
        let wIm = 0;
        for (let offset = 0; offset < halfLength; offset += 1) {
          const even = outputValues[start + offset];
          const odd = outputValues[start + offset + halfLength];
          const rotatedRe = odd.re * wRe - odd.im * wIm;
          const rotatedIm = odd.re * wIm + odd.im * wRe;
          outputValues[start + offset] = {
            re: even.re + rotatedRe,
            im: even.im + rotatedIm
          };
          outputValues[start + offset + halfLength] = {
            re: even.re - rotatedRe,
            im: even.im - rotatedIm
          };
          const nextWRe = wRe * stepRe - wIm * stepIm;
          wIm = wRe * stepIm + wIm * stepRe;
          wRe = nextWRe;
        }
      }
    }
    if (inverse) {
      outputValues.forEach((value) => {
        value.re /= n;
        value.im /= n;
      });
    }
    return outputValues;
  }

  function transformRows(matrix, inverse = false) {
    return matrix.map((row) => fftComplex(row, inverse));
  }

  function magnitudeRows(matrix) {
    return matrix.map((row) => row.map((value) => Math.hypot(value.re, value.im)));
  }

  function shiftedSpectrum(specRows, prfHz, xMinHz = -prfHz / 2, xMaxHz = prfHz / 2) {
    const length = specRows[0].length;
    const half = length / 2;
    const shiftedIndexes = Array.from({ length }, (_, index) => (index + half) % length);
    const frequencies = shiftedIndexes.map((sourceIndex, shiftedIndex) => ({
      sourceIndex,
      frequencyHz: (shiftedIndex - half) * prfHz / length
    })).filter((entry) => entry.frequencyHz >= xMinHz && entry.frequencyHz <= xMaxHz);
    return {
      xMinHz,
      xMaxHz,
      data: specRows.map((row) => frequencies.map((entry) => row[entry.sourceIndex])),
      frequencies: frequencies.map((entry) => entry.frequencyHz)
    };
  }

  function surfaceScatterersForProcessing() {
    return fixedPoints.map((point) => {
      const selected = foldingIndexes.has(point.index);
      const mirrorOfSelected = !selected && Math.abs(point.trueDopplerHz + selectedFoldingPoint.trueDopplerHz) < 2;
      const angleWeight = 0.24 + 0.46 * Math.exp(-0.5 * ((Math.abs(point.xKm) - Math.abs(selectedFoldingPoint.xKm)) / 20) ** 2);
      return {
        kind: 'surface',
        label: selected ? `selected surface ${point.index + 1}` : `surface ${point.index + 1}`,
        depthKm: point.apparentDepthKm,
        dopplerHz: point.trueDopplerHz,
        amplitude: selected || mirrorOfSelected ? 1.0 : angleWeight,
        depthSigmaKm: processingModel.depthSigmaKm,
        phase: selected ? 0 : point.index * 0.71
      };
    });
  }

  function buildTraceMatrix(samplePrfHz) {
    const depthStepKm = processingModel.maxDepthKm / (processingModel.depthBins - 1);
    const scatterers = [
      ...surfaceScatterersForProcessing(),
      {
        kind: 'target',
        label: 'fixed subsurface target',
        depthKm: model.targetDepthKm,
        dopplerHz: 0,
        amplitude: 0.32,
        depthSigmaKm: 0.08,
        phase: 0
      }
    ];
    return Array.from({ length: processingModel.depthBins }, (_, depthIndex) => {
      const depthKm = depthIndex * depthStepKm;
      return Array.from({ length: processingModel.traceCount }, (_, traceIndex) => {
        let re = 0;
        let im = 0;
        scatterers.forEach((scatterer) => {
          const envelope = Math.exp(-0.5 * ((depthKm - scatterer.depthKm) / scatterer.depthSigmaKm) ** 2);
          if (envelope < 1e-4) return;
          const phase = 2 * Math.PI * (scatterer.dopplerHz / samplePrfHz) * traceIndex + scatterer.phase;
          const amplitude = scatterer.amplitude * envelope;
          re += amplitude * Math.cos(phase);
          im += amplitude * Math.sin(phase);
        });
        re += 0.012 * Math.sin(0.31 * depthIndex + 0.17 * traceIndex);
        im += 0.012 * Math.cos(0.23 * depthIndex - 0.11 * traceIndex);
        return { re, im };
      });
    });
  }

  function downsampleMatrix(matrix, step) {
    return matrix.map((row) => row.filter((_, traceIndex) => traceIndex % step === 0));
  }

  function zeroDopplerOnly(specRows) {
    return specRows.map((row) => row.map((value, index) => (
      index === 0 ? { re: value.re, im: value.im } : { re: 0, im: 0 }
    )));
  }

  function heatColor(value, maxValue, tint = 'red') {
    const normalized = maxValue > 0 ? Math.log1p(value) / Math.log1p(maxValue) : 0;
    const alpha = Math.max(0.02, Math.min(0.86, 0.04 + normalized * 0.82));
    if (tint === 'teal') return `rgba(47, 111, 115, ${alpha.toFixed(3)})`;
    if (tint === 'copper') return `rgba(184, 135, 52, ${alpha.toFixed(3)})`;
    return `rgba(155, 61, 63, ${alpha.toFixed(3)})`;
  }

  function valuesInDepthRange(data, depthMinKm, depthMaxKm) {
    const depthStepKm = processingModel.maxDepthKm / (processingModel.depthBins - 1);
    return data.map((row, depthIndex) => ({
      row,
      depthKm: depthIndex * depthStepKm
    })).filter((entry) => entry.depthKm >= depthMinKm && entry.depthKm <= depthMaxKm);
  }

  function maxFromPanels(panels) {
    return panels.reduce((currentMax, panel) => Math.max(
      currentMax,
      ...panel.visibleRows.flatMap((entry) => entry.row)
    ), 0);
  }

  function renderSingleProcessingHeatmap(container, options) {
    const width = 560;
    const height = 365;
    const margin = { left: 68, right: 25, top: 48, bottom: 46 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const visibleRows = valuesInDepthRange(options.data, options.depthMinKm, options.depthMaxKm);
    const columnCount = visibleRows[0].row.length;
    const maxValue = Math.max(...visibleRows.flatMap((entry) => entry.row));
    const sx = (value) => margin.left + ((value - options.xMin) / (options.xMax - options.xMin)) * plotWidth;
    const sy = (value) => margin.top + ((value - options.depthMinKm) / (options.depthMaxKm - options.depthMinKm)) * plotHeight;
    const cellWidth = plotWidth / columnCount;
    const cellHeight = plotHeight / visibleRows.length;
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${options.ariaLabel}">`;
    svg += `<text class="processing-title" x="${margin.left}" y="18">${options.title}</text>`;
    svg += `<text class="processing-note" x="${margin.left}" y="36">${options.note}</text>`;
    options.yTicks.forEach((value) => {
      const y = sy(value);
      svg += `<line class="processing-grid-line" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line>`;
      svg += `<text class="processing-label" x="${margin.left - 9}" y="${y + 4}" text-anchor="end">${fmt(value, 1)}</text>`;
    });
    options.xTicks.forEach((value) => {
      const x = sx(value);
      svg += `<line class="processing-grid-line" x1="${x}" y1="${margin.top}" x2="${x}" y2="${height - margin.bottom}"></line>`;
      svg += `<text class="processing-label" x="${x}" y="${height - margin.bottom + 17}" text-anchor="middle">${options.formatX(value)}</text>`;
    });
    svg += `<rect class="processing-frame" x="${margin.left}" y="${margin.top}" width="${plotWidth}" height="${plotHeight}"></rect>`;
    visibleRows.forEach((entry, rowIndex) => {
      entry.row.forEach((value, columnIndex) => {
        svg += `<rect class="processing-cell" x="${(margin.left + columnIndex * cellWidth).toFixed(2)}" y="${(margin.top + rowIndex * cellHeight).toFixed(2)}" width="${(cellWidth + 0.25).toFixed(2)}" height="${(cellHeight + 0.25).toFixed(2)}" fill="${heatColor(value, maxValue, options.tint)}"></rect>`;
      });
    });
    if (options.showZero) {
      svg += `<line class="processing-zero-line" x1="${sx(0)}" y1="${margin.top}" x2="${sx(0)}" y2="${height - margin.bottom}"></line>`;
    }
    svg += `<rect class="processing-target-window" x="${margin.left}" y="${sy(model.targetDepthKm - model.depthToleranceKm)}" width="${plotWidth}" height="${Math.max(1, sy(model.targetDepthKm + model.depthToleranceKm) - sy(model.targetDepthKm - model.depthToleranceKm))}"></rect>`;
    svg += `<line class="processing-target-line" x1="${margin.left}" y1="${sy(model.targetDepthKm)}" x2="${width - margin.right}" y2="${sy(model.targetDepthKm)}"></line>`;
    if (options.marker) {
      svg += `<circle class="processing-marker" cx="${sx(options.marker.x)}" cy="${sy(options.marker.depthKm)}" r="5"><title>${options.marker.label}</title></circle>`;
    }
    if (options.targetMarker) {
      svg += `<rect class="processing-target-marker" x="${sx(options.targetMarker.x) - 5}" y="${sy(model.targetDepthKm) - 5}" width="10" height="10" transform="rotate(45 ${sx(options.targetMarker.x)} ${sy(model.targetDepthKm)})"><title>subsurface target</title></rect>`;
    }
    svg += `<line class="processing-axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>`;
    svg += `<line class="processing-axis" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"></line>`;
    svg += `<text class="processing-title" x="${margin.left + plotWidth / 2}" y="${height - 6}" text-anchor="middle">${options.xLabel}</text>`;
    svg += `<text class="processing-title" transform="translate(17 ${margin.top + plotHeight / 2}) rotate(-90)" text-anchor="middle">apparent depth (km)</text>`;
    svg += '</svg>';
    container.innerHTML = svg;
  }

  function renderStackedProcessingHeatmaps(container, options) {
    const width = 560;
    const height = 430;
    const margin = { left: 66, right: 25, top: 34, bottom: 45 };
    const gap = 10;
    const plotWidth = width - margin.left - margin.right;
    const panelHeight = (height - margin.top - margin.bottom - gap * (options.panels.length - 1)) / options.panels.length;
    const panels = options.panels.map((panel) => ({
      ...panel,
      visibleRows: valuesInDepthRange(panel.data, options.depthMinKm, options.depthMaxKm)
    }));
    const maxValue = maxFromPanels(panels);
    const sx = (value) => margin.left + ((value - options.xMin) / (options.xMax - options.xMin)) * plotWidth;
    const sy = (value, top) => top + ((value - options.depthMinKm) / (options.depthMaxKm - options.depthMinKm)) * panelHeight;
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${options.ariaLabel}">`;
    svg += `<text class="processing-title" x="${margin.left}" y="16">${options.title}</text>`;
    panels.forEach((panel, panelIndex) => {
      const top = margin.top + panelIndex * (panelHeight + gap);
      const columnCount = panel.visibleRows[0].row.length;
      const cellWidth = plotWidth / columnCount;
      const cellHeight = panelHeight / panel.visibleRows.length;
      svg += `<text class="${panel.danger ? 'processing-danger' : 'processing-title'}" x="${margin.left + 7}" y="${top + 13}" text-anchor="start">${panel.label}</text>`;
      options.yTicks.forEach((value) => {
        const y = sy(value, top);
        svg += `<line class="processing-grid-line" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line>`;
      });
      options.xTicks.forEach((value) => {
        const x = sx(value);
        svg += `<line class="processing-grid-line" x1="${x}" y1="${top}" x2="${x}" y2="${top + panelHeight}"></line>`;
      });
      svg += `<rect class="processing-frame" x="${margin.left}" y="${top}" width="${plotWidth}" height="${panelHeight}"></rect>`;
      panel.visibleRows.forEach((entry, rowIndex) => {
        entry.row.forEach((value, columnIndex) => {
          svg += `<rect class="processing-cell" x="${(margin.left + columnIndex * cellWidth).toFixed(2)}" y="${(top + rowIndex * cellHeight).toFixed(2)}" width="${(cellWidth + 0.25).toFixed(2)}" height="${(cellHeight + 0.25).toFixed(2)}" fill="${heatColor(value, maxValue, panel.tint || options.tint)}"></rect>`;
        });
      });
      if (options.showZero) {
        svg += `<line class="processing-zero-line" x1="${sx(0)}" y1="${top}" x2="${sx(0)}" y2="${top + panelHeight}"></line>`;
      }
      svg += `<rect class="processing-target-window" x="${margin.left}" y="${sy(model.targetDepthKm - model.depthToleranceKm, top)}" width="${plotWidth}" height="${Math.max(1, sy(model.targetDepthKm + model.depthToleranceKm, top) - sy(model.targetDepthKm - model.depthToleranceKm, top))}"></rect>`;
      svg += `<line class="processing-target-line" x1="${margin.left}" y1="${sy(model.targetDepthKm, top)}" x2="${width - margin.right}" y2="${sy(model.targetDepthKm, top)}"></line>`;
      if (panel.note) {
        svg += `<text class="${panel.danger ? 'processing-danger' : 'processing-note'}" x="${width - margin.right}" y="${top + 13}" text-anchor="end">${panel.note}</text>`;
      }
    });
    options.xTicks.forEach((value) => {
      const x = sx(value);
      svg += `<text class="processing-label" x="${x}" y="${height - margin.bottom + 17}" text-anchor="middle">${options.formatX(value)}</text>`;
    });
    options.yTicks.forEach((value) => {
      const y = sy(value, margin.top + panelHeight + gap);
      svg += `<text class="processing-label" x="${margin.left - 9}" y="${y + 4}" text-anchor="end">${fmt(value, 1)}</text>`;
    });
    svg += `<line class="processing-axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>`;
    svg += `<line class="processing-axis" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"></line>`;
    svg += `<text class="processing-title" x="${margin.left + plotWidth / 2}" y="${height - 6}" text-anchor="middle">${options.xLabel}</text>`;
    svg += `<text class="processing-title" transform="translate(17 ${margin.top + (height - margin.top - margin.bottom) / 2}) rotate(-90)" text-anchor="middle">apparent depth (km)</text>`;
    svg += '</svg>';
    container.innerHTML = svg;
  }

  function processingExperiment() {
    const rawMatrix = buildTraceMatrix(originalPrfHz);
    const nonTunedOriginalPrfHz = originalPrfHz * 0.93;
    const nonTunedMatrix = buildTraceMatrix(nonTunedOriginalPrfHz);
    const cases = [
      { label: 'all', step: 1, prfHz: originalPrfHz, matrix: rawMatrix },
      { label: 'every 2nd', step: 2, prfHz: originalPrfHz / 2, matrix: downsampleMatrix(rawMatrix, 2) },
      { label: '4th tuned', step: 4, prfHz: originalPrfHz / 4, matrix: downsampleMatrix(rawMatrix, 4) },
      { label: '4th non-tuned', step: 4, prfHz: nonTunedOriginalPrfHz / 4, matrix: downsampleMatrix(nonTunedMatrix, 4) }
    ].map((entry) => ({
      ...entry,
      spectrum: transformRows(entry.matrix)
    }));
    return {
      rawMatrix,
      rawMagnitude: magnitudeRows(rawMatrix),
      cases,
      nonTunedOriginalPrfHz
    };
  }

  function renderProcessingExperiment() {
    const experiment = processingExperiment();
    const allCase = experiment.cases[0];
    const fullSpectrum = shiftedSpectrum(allCase.spectrum, allCase.prfHz);
    const selectedAliasEveryFour = alias(selectedFoldingPoint.trueDopplerHz, originalPrfHz / 4);

    renderSingleProcessingHeatmap(radargramPlot, {
      data: experiment.rawMagnitude,
      depthMinKm: 0,
      depthMaxKm: processingModel.maxDepthKm,
      xMin: 0,
      xMax: processingModel.traceCount - 1,
      xTicks: [0, 16, 32, 48, 63],
      yTicks: [0, 6, 12, 18, 24],
      tint: 'teal',
      title: 'synthetic radargram: 64 traces, 12 surface points, one target',
      note: 'selected and mirror surface points are comparable; other points use angle weighting',
      xLabel: 'trace number',
      ariaLabel: 'Generated complex radargram with twelve surface scatterers and one fixed subsurface target',
      formatX: (value) => fmt(value, 0),
      targetMarker: { x: 32 }
    });

    renderSingleProcessingHeatmap(fftPlot, {
      data: magnitudeRows(fullSpectrum.data),
      depthMinKm: 0,
      depthMaxKm: processingModel.maxDepthKm,
      xMin: fullSpectrum.xMinHz,
      xMax: fullSpectrum.xMaxHz,
      xTicks: [-originalPrfHz / 2, -selectedFoldingPoint.trueDopplerHz, 0, selectedFoldingPoint.trueDopplerHz, originalPrfHz / 2],
      yTicks: [0, 6, 12, 18, 24],
      tint: 'copper',
      title: `pre-decimation Doppler image at ${fmt(originalPrfHz, 1)} Hz sampling`,
      note: `selected clutter is at true Doppler ${signed(selectedFoldingPoint.trueDopplerHz, 1)} Hz, not yet at 0 Hz`,
      xLabel: 'Doppler frequency (Hz)',
      ariaLabel: 'Original all-trace along-track FFT before trace deletion',
      formatX: (value) => signed(value, 0),
      showZero: true,
      marker: {
        x: selectedFoldingPoint.trueDopplerHz,
        depthKm: selectedFoldingPoint.apparentDepthKm,
        label: 'selected surface clutter true Doppler'
      },
      targetMarker: { x: 0 }
    });

    renderStackedProcessingHeatmaps(decimatedFftPlot, {
      panels: experiment.cases.map((entry) => {
        const zoomSpectrum = shiftedSpectrum(
          entry.spectrum,
          entry.prfHz,
          -processingModel.zoomDopplerHz,
          processingModel.zoomDopplerHz
        );
        const selectedAliasHz = alias(selectedFoldingPoint.trueDopplerHz, entry.prfHz);
        return {
          label: entry.label,
          data: magnitudeRows(zoomSpectrum.data),
          danger: Math.abs(selectedAliasHz) < 1,
          note: `selected alias ${signed(selectedAliasHz, 1)} Hz`,
          tint: Math.abs(selectedAliasHz) < 1 ? 'red' : 'copper'
        };
      }),
      depthMinKm: processingModel.zoomDepthMinKm,
      depthMaxKm: processingModel.zoomDepthMaxKm,
      xMin: -processingModel.zoomDopplerHz,
      xMax: processingModel.zoomDopplerHz,
      xTicks: [-200, -100, 0, 100, 200],
      yTicks: [6.0, model.targetDepthKm, 7.5],
      tint: 'red',
      title: 'trace decimation FFT: tuned fold plus non-tuned check',
      xLabel: 'aliased Doppler near target cell (Hz)',
      ariaLabel: 'Recalculated FFTs after keeping all traces every second trace and every fourth trace',
      formatX: (value) => signed(value, 0),
      showZero: true
    });

    renderStackedProcessingHeatmaps(reconstructionPlot, {
      panels: experiment.cases.map((entry) => {
        const zeroOnly = zeroDopplerOnly(entry.spectrum);
        const reconstructed = magnitudeRows(transformRows(zeroOnly, true));
        const selectedAliasHz = alias(selectedFoldingPoint.trueDopplerHz, entry.prfHz);
        return {
          label: entry.label,
          data: reconstructed,
          danger: Math.abs(selectedAliasHz) < 1,
          note: Math.abs(selectedAliasHz) < 1
            ? 'folded clutter reconstructs at target depth'
            : 'target only in 0-Hz cell',
          tint: Math.abs(selectedAliasHz) < 1 ? 'red' : 'teal'
        };
      }),
      depthMinKm: processingModel.zoomDepthMinKm,
      depthMaxKm: processingModel.zoomDepthMaxKm,
      xMin: 0,
      xMax: 1,
      xTicks: [0, 0.25, 0.5, 0.75, 1],
      yTicks: [6.0, model.targetDepthKm, 7.5],
      tint: 'teal',
      title: `zero-Doppler reconstruction; tuned every-4 alias = ${signed(selectedAliasEveryFour, 1)} Hz`,
      xLabel: 'normalized along-track aperture',
      ariaLabel: 'Inverse FFT reconstruction of the zero Doppler cell after trace deletion',
      formatX: (value) => `${fmt(value * 100, 0)}%`,
      showZero: false
    });
  }

  function draw(effectivePrfHz) {
    const { points, foldingReturn } = calculate(effectivePrfHz);
    const movingState = movingTwoReturnState(effectivePrfHz);
    const targetOverlap = movingState.overlapsTarget;
    const width = 560;
    const height = 350;
    const surfaceY = 138;
    const left = 64;
    const right = 38;
    const targetDepthRangeKm = 12;
    const sx = (xKm) => left + ((xKm + model.spreadKm) / (2 * model.spreadKm)) * (width - left - right);
    const targetX = sx(0);
    const aircraftY = 34;
    const aircraftX = Math.max(left + 22, Math.min(width - right - 22, sx(movingState.planeXKm)));
    const aircraftLabelAnchor = aircraftX > width - right - 135 ? 'end' : 'start';
    const aircraftLabelX = aircraftLabelAnchor === 'end' ? aircraftX - 26 : aircraftX + 27;
    const depthToY = (depthKm) => surfaceY + (depthKm / targetDepthRangeKm) * 145;
    const targetY = depthToY(model.targetDepthKm);
    const clutterDepthVisible = movingState.surfaceApparentDepthKm <= targetDepthRangeKm && movingState.surfaceApparentDepthKm >= 0;
    const blurTopY = clutterDepthVisible ? depthToY(Math.max(0, movingState.surfaceApparentDepthKm - model.depthToleranceKm)) : null;
    const blurBottomY = clutterDepthVisible ? depthToY(Math.min(targetDepthRangeKm, movingState.surfaceApparentDepthKm + model.depthToleranceKm)) : null;
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Moving plane over twelve fixed surface clutter points and one fixed subsurface target; PRF stays fixed while time changes Doppler folding">
      <defs>
        <radialGradient id="target-blur"><stop offset="0" stop-color="#9b3d3f" stop-opacity=".44"></stop><stop offset=".45" stop-color="#d98473" stop-opacity=".16"></stop><stop offset="1" stop-color="#d98473" stop-opacity="0"></stop></radialGradient>
        <linearGradient id="fold-band" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9b3d3f" stop-opacity="0"></stop><stop offset=".5" stop-color="#9b3d3f" stop-opacity=".30"></stop><stop offset="1" stop-color="#9b3d3f" stop-opacity="0"></stop></linearGradient>
      </defs>`;
    svg += `<line class="geometry-surface" x1="${left}" y1="${surfaceY}" x2="${width - right}" y2="${surfaceY}"></line>`;
    svg += `<line class="geometry-depth-guide" x1="${targetX}" y1="${surfaceY}" x2="${targetX}" y2="${targetY}"></line>`;
    svg += `<line class="geometry-target-ray" x1="${aircraftX}" y1="${aircraftY + 10}" x2="${targetX}" y2="${targetY - 10}"></line>`;
    svg += `<line class="geometry-ray ${targetOverlap ? 'overlap' : ''}" x1="${aircraftX}" y1="${aircraftY + 10}" x2="${sx(foldingReturn.xKm)}" y2="${surfaceY - 7}"></line>`;
    if (clutterDepthVisible) {
      svg += `<rect class="geometry-fold-band" x="${left}" y="${blurTopY}" width="${width - left - right}" height="${Math.max(1, blurBottomY - blurTopY)}"></rect>`;
      svg += `<line class="geometry-fold-line" x1="${left}" y1="${depthToY(movingState.surfaceApparentDepthKm)}" x2="${width - right}" y2="${depthToY(movingState.surfaceApparentDepthKm)}"></line>`;
    }
    if (targetOverlap) svg += `<circle class="geometry-blur" cx="${targetX}" cy="${targetY}" r="56"></circle>`;
    svg += `<g class="geometry-plane" transform="translate(${aircraftX} ${aircraftY})">
        <path class="geometry-plane-wing" d="M -3 -5 L 9 -25 L 15 -23 L 8 -4 Z"></path>
        <path class="geometry-plane-wing" d="M -3 5 L 9 25 L 15 23 L 8 4 Z"></path>
        <path class="geometry-plane-tail" d="M -15 -4 L -25 -15 L -20 -2 Z"></path>
        <path class="geometry-plane-tail" d="M -15 4 L -25 15 L -20 2 Z"></path>
        <path class="geometry-plane-body" d="M -22 0 C -12 -8 8 -8 23 0 C 8 8 -12 8 -22 0 Z"></path>
        <circle class="geometry-plane-window" cx="10" cy="0" r="2.7"></circle>
      </g>`;
    svg += `<text class="geometry-value" x="${aircraftLabelX}" y="${aircraftY - 12}" text-anchor="${aircraftLabelAnchor}">moving plane</text>`;
    svg += `<text class="geometry-title" x="${left}" y="${surfaceY - 23}">surface clutter - 12 fixed points</text>`;
    svg += `<text class="geometry-title" x="${targetX + 16}" y="${targetY + 33}">one fixed subsurface target</text>`;
    points.forEach((point) => {
      const isFoldingPoint = foldingIndexes.has(point.index);
      const css = isFoldingPoint ? (targetOverlap ? 'overlap' : 'closest') : '';
      svg += `<circle class="geometry-surface-point ${css}" cx="${sx(point.xKm)}" cy="${surfaceY}" r="${isFoldingPoint ? 8 : 6}"><title>Clutter ${point.index + 1}: aliased Doppler ${fmt(point.aliasedDopplerHz, 1)} Hz</title></circle>`;
    });
    svg += `<rect class="geometry-target ${targetOverlap ? 'overlap' : ''}" x="${targetX - 8}" y="${targetY - 8}" width="16" height="16" transform="rotate(45 ${targetX} ${targetY})"><title>Single fixed subsurface target at ${fmt(model.targetDepthKm, 2)} km</title></rect>`;
    if (clutterDepthVisible) {
      svg += `<text class="geometry-value" x="${left + 12}" y="${blurTopY - 8}">selected surface echo: ${fmt(movingState.surfaceApparentDepthKm, 2)} km, alias ${signed(movingState.surfaceAliasHz, 1)} Hz</text>`;
    } else {
      svg += `<text class="geometry-value" x="${left + 12}" y="${surfaceY + 24}">selected surface echo is outside the 0-12 km view</text>`;
    }
    if (targetOverlap) {
      svg += `<text class="geometry-danger" x="${targetX}" y="${targetY + 56}" text-anchor="middle">CLUTTER / TARGET OVERLAP</text>`;
    }
    svg += `<text class="geometry-label" x="${targetX + 16}" y="${(surfaceY + targetY) / 2}">target depth ${fmt(model.targetDepthKm, 2)} km</text>`;
    svg += '</svg>';
    plot.innerHTML = svg;

    renderFoldDepthBlock(effectivePrfHz, movingState);
    renderDopplerBins(movingState);
    renderTraceCheck(movingState);
    renderFastTimeDopplerCheck(movingState);
    if (!processingRendered) {
      if (radargramPlot && fftPlot && decimatedFftPlot && reconstructionPlot) {
        renderProcessingExperiment();
      }
      processingRendered = true;
    }
    const listenWindowUs = targetEchoUs + SIMPLE_LISTEN_MARGIN_US;
    const timingIsSafe = basePriUs > listenWindowUs;
    const prfWithinPublishedRange = originalPrfHz >= REASON_PRF_MIN_HZ && originalPrfHz <= REASON_PRF_MAX_HZ;
    const baseCaseIsValid = timingIsSafe && prfWithinPublishedRange;
    originalPrfText.className = baseCaseIsValid ? '' : 'is-warning';
    originalPrfText.textContent = `Play moves the plane through time; PRF stays fixed unless you move this slider. Base trace PRF: ${fmt(originalPrfHz, 1)} Hz (${prfWithinPublishedRange ? 'within' : 'outside'} published 50–3,000 Hz range); PRI ${fmt(basePriUs, 1)} µs ${timingIsSafe ? '>' : '<'} echo ${fmt(targetEchoUs, 1)} µs + ${fmt(SIMPLE_LISTEN_MARGIN_US, 0)} µs assumed margin.`;
    output.textContent = `${fmt(effectivePrfHz, 1)} Hz`;
    if (timeOutput) timeOutput.textContent = `${signed(flyby.timeS, 1)} s`;
    status.className = `prf-status${targetOverlap ? ' is-overlap' : ''}`;
    if (targetOverlap) {
      status.textContent = `Overlap at ${signed(flyby.timeS, 1)} s with PRF fixed at ${fmt(effectivePrfHz, 1)} Hz: surface clutter ${signed(movingState.surfaceAliasHz, 1)} Hz folds into the target bin ${signed(movingState.targetAliasHz, 1)} Hz at ${fmt(movingState.surfaceApparentDepthKm, 2)} km.`;
    } else {
      status.textContent = `No overlap at ${signed(flyby.timeS, 1)} s with PRF fixed at ${fmt(effectivePrfHz, 1)} Hz: aliased Doppler separation is ${fmt(movingState.dopplerDeltaHz, 1)} Hz and apparent-depth separation is ${fmt(movingState.depthDeltaKm, 2)} km.`;
    }
  }

  [speedSlider, altitudeSlider, depthSlider].filter(Boolean).forEach((input) => {
    input.addEventListener('input', () => {
      stopPlayback();
      model.velocityKmS = Number(speedSlider.value);
      model.altitudeKm = Number(altitudeSlider.value);
      model.targetDepthKm = Number(depthSlider.value);
      processingRendered = false;
      refreshDerivedModel(true);
      draw(Number(prfSlider.value));
    });
  });
  refreshDerivedModel(true);
  if (prfPlayButton) {
    prfPlayButton.addEventListener('click', () => {
      if (playbackFrameId === null) startPlayback();
      else stopPlayback();
    });
  }
  prfSlider.addEventListener('input', () => {
    stopPlayback();
    draw(Number(prfSlider.value));
  });
  if (timeSlider) {
    timeSlider.addEventListener('input', () => {
      stopPlayback();
      flyby.timeS = Number(timeSlider.value);
      draw(Number(prfSlider.value));
    });
  }
  draw(Number(prfSlider.value));
})();
