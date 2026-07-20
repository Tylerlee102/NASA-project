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
    bumpHeightKm: 1.2,
    dopplerToleranceHz: 0,
    depthToleranceKm: 0
  };
  const flyby = {
    timeS: 0,
    durationS: 12,
    playbackSpeed: 2
  };
  const YOUTUBE_PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
  const pageParams = new URLSearchParams(window.location.search);
  const isPowerPointCapture = pageParams.get('capture') === 'powerpoint';
  document.body.classList.toggle('is-powerpoint-capture', isPowerPointCapture);

  const prfSlider = document.getElementById('effective-prf-slider');
  const prfPlayButton = document.getElementById('prf-play-button');
  const timeSlider = document.getElementById('flyby-time-slider');
  const timeOutput = document.getElementById('flyby-time-output');
  const foldingIndicator = document.getElementById('folding-indicator');
  const foldingIndicatorText = document.getElementById('folding-indicator-text');
  const timeMinLabel = document.getElementById('time-min-label');
  const timeMaxLabel = document.getElementById('time-max-label');
  const playbackSpeedButton = document.getElementById('playback-speed-button');
  const playbackSpeedOutput = document.getElementById('playback-speed-output');
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
  const traceCheckPlot = document.getElementById('trace-check-plot');
  const dopplerCheckPlot = document.getElementById('doppler-check-plot');
  const recordingHorizontalPlot = document.getElementById('recording-horizontal-plot');
  const recordingTraceCheckPlot = document.getElementById('recording-trace-check-plot');
  const multiClutterCountSlider = document.getElementById('multi-clutter-count-slider');
  const multiClutterCountOutput = document.getElementById('multi-clutter-count-output');
  const bumpHeightSlider = document.getElementById('bump-height-slider');
  const bumpHeightOutput = document.getElementById('bump-height-output');
  const multiClutterStatus = document.getElementById('multi-clutter-status');
  const multiClutterGeometryPlot = document.getElementById('multi-clutter-geometry-plot');
  const multiClutterDopplerPlot = document.getElementById('multi-clutter-doppler-plot');
  const phaseSolutionStatus = document.getElementById('phase-solution-status');
  const phaseGeometryPlot = document.getElementById('phase-geometry-plot');
  const phaseCellPlot = document.getElementById('phase-cell-plot');
  const phasePhasorPlot = document.getElementById('phase-phasor-plot');
  const phasePowerPlot = document.getElementById('phase-power-plot');
  const phaseSweepPlot = document.getElementById('phase-sweep-plot');
  const phaseValidationStatus = document.getElementById('phase-validation-status');
  const phaseErrorSlider = document.getElementById('phase-error-slider');
  const phaseErrorOutput = document.getElementById('phase-error-output');
  const amplitudeErrorSlider = document.getElementById('amplitude-error-slider');
  const amplitudeErrorOutput = document.getElementById('amplitude-error-output');
  const validationNoiseSlider = document.getElementById('validation-noise-slider');
  const validationNoiseOutput = document.getElementById('validation-noise-output');
  const criticalWindowPlot = document.getElementById('critical-window-plot');
  const truthEstimatePlot = document.getElementById('truth-estimate-plot');
  const phaseErrorMap = document.getElementById('phase-error-map');
  const uncertaintyTrialsPlot = document.getElementById('uncertainty-trials-plot');
  const summaryObservedPower = document.getElementById('summary-observed-power');
  const summaryObservedError = document.getElementById('summary-observed-error');
  const summaryPowerOnly = document.getElementById('summary-power-only');
  const summaryPowerOnlyError = document.getElementById('summary-power-only-error');
  const summaryPhaseAware = document.getElementById('summary-phase-aware');
  const summaryPhaseAwareError = document.getElementById('summary-phase-aware-error');
  const summaryTargetAbsent = document.getElementById('summary-target-absent');
  const summaryTargetAbsentError = document.getElementById('summary-target-absent-error');
  const phaseValidation = {
    phaseErrorDeg: 10,
    amplitudeErrorFraction: 0.10,
    noiseRms: 0.08,
    comparisonTimesS: [5.5, 6.0, 6.5],
    trialCount: 240
  };
  const usesMultiClutterState = Boolean(
    multiClutterGeometryPlot ||
    multiClutterDopplerPlot ||
    phaseGeometryPlot ||
    phaseCellPlot ||
    phasePhasorPlot ||
    phasePowerPlot ||
    phaseSweepPlot ||
    criticalWindowPlot ||
    truthEstimatePlot ||
    phaseErrorMap ||
    uncertaintyTrialsPlot
  );
  const isMultiClutterView = Boolean(multiClutterGeometryPlot && multiClutterDopplerPlot);
  const radargramPlot = document.getElementById('radargram-plot');
  const fftPlot = document.getElementById('fft-plot');
  const decimatedFftPlot = document.getElementById('decimated-fft-plot');
  const reconstructionPlot = document.getElementById('reconstruction-plot');
  const wavelengthM = C / (model.frequencyMhz * 1e6);
  const TWO_PI = Math.PI * 2;
  let processingRendered = false;
  const mod = (value, divisor) => ((value % divisor) + divisor) % divisor;
  const alias = (dopplerHz, prfHz) => mod(dopplerHz + prfHz / 2, prfHz) - prfHz / 2;
  const periodicIntervalSegments = (centerHz, halfWidthHz, periodHz) => {
    const lowerHz = -periodHz / 2;
    const upperHz = periodHz / 2;
    const center = alias(centerHz, periodHz);
    const start = center - halfWidthHz;
    const end = center + halfWidthHz;
    if (start < lowerHz) return [[lowerHz, end], [start + periodHz, upperHz]];
    if (end > upperHz) return [[start, upperHz], [lowerHz, end - periodHz]];
    return [[start, end]];
  };
  const fmt = (value, digits = 0) => Number(value).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
  const signed = (value, digits = 1) => {
    const cleaned = Math.abs(value) < 0.05 ? 0 : value;
    return `${cleaned > 0 ? '+' : ''}${fmt(cleaned, digits)}`;
  };
  const phaseWrap = (phaseRad) => mod(phaseRad + Math.PI, TWO_PI) - Math.PI;
  const phaseDeg = (phaseRad) => phaseWrap(phaseRad) * 180 / Math.PI;
  const phaseColor = (phaseRad) => {
    const normalized = (phaseWrap(phaseRad) + Math.PI) / TWO_PI;
    const hue = 210 - normalized * 220;
    return `hsl(${hue.toFixed(1)} 62% 43%)`;
  };
  const stackOffset = (index, count, radiusPx = 5) => {
    if (count <= 1) return { x: 0, y: 0 };
    const angle = -Math.PI / 2 + (2 * Math.PI * index) / count;
    return {
      x: Math.cos(angle) * radiusPx,
      y: Math.sin(angle) * radiusPx
    };
  };
  const plotStack = (items, item, xFor, yFor, tolerancePx = 1.2, radiusPx = 5) => {
    const itemX = xFor(item);
    const itemY = yFor(item);
    const group = items.filter((other) => (
      Math.hypot(xFor(other) - itemX, yFor(other) - itemY) <= tolerancePx
    ));
    const index = Math.max(0, group.findIndex((other) => other.index === item.index));
    return {
      ...stackOffset(index, group.length, radiusPx),
      count: group.length,
      index
    };
  };
  const formatPlaybackSpeed = (value) => {
    if (value === 1) return 'Normal';
    return `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}x`;
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function updatePlaybackSpeedControl() {
    if (playbackSpeedOutput) playbackSpeedOutput.textContent = formatPlaybackSpeed(flyby.playbackSpeed);
    if (playbackSpeedButton) {
      playbackSpeedButton.setAttribute('aria-label', `Playback speed ${formatPlaybackSpeed(flyby.playbackSpeed)}`);
    }
  }

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

    const timeMax = Number(timeSlider.max);
    let nextTime = flyby.timeS + flyby.playbackSpeed * elapsedSeconds;

    if (nextTime >= timeMax) {
      nextTime = timeMax;
    }

    flyby.timeS = nextTime;
    timeSlider.value = flyby.timeS.toFixed(2);
    draw(Number(prfSlider.value));
    if (flyby.timeS >= timeMax) {
      stopPlayback();
      return;
    }
    playbackFrameId = requestAnimationFrame(playbackStep);
  }

  function startPlayback() {
    if (playbackFrameId !== null) return;
    if (flyby.timeS >= Number(timeSlider.max)) {
      flyby.timeS = Number(timeSlider.min);
      timeSlider.value = flyby.timeS.toFixed(2);
      draw(Number(prfSlider.value));
    }
    lastPlaybackTime = null;
    setPlaybackActive(true);
    playbackFrameId = requestAnimationFrame(playbackStep);
  }

  function syncRecordingPair() {
    if (recordingHorizontalPlot && plot) recordingHorizontalPlot.innerHTML = plot.innerHTML;
    if (recordingTraceCheckPlot && traceCheckPlot) recordingTraceCheckPlot.innerHTML = traceCheckPlot.innerHTML;
  }

  function setFlybyFrame(timeS, effectivePrfHz = Number(prfSlider.value)) {
    stopPlayback();
    const minTime = Number(timeSlider?.min || 0);
    const maxTime = Number(timeSlider?.max || flyby.durationS);
    flyby.timeS = clamp(Number(timeS), minTime, maxTime);
    if (timeSlider) timeSlider.value = flyby.timeS.toFixed(2);
    if (Number.isFinite(effectivePrfHz)) prfSlider.value = String(effectivePrfHz);
    draw(Number(prfSlider.value));
    return {
      timeS: flyby.timeS,
      effectivePrfHz: Number(prfSlider.value)
    };
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
  let lastPlaybackTime = null;
  let multiClutterPointCount = 12;

  function updateModelControlOutputs() {
    const outputs = {
      'model-speed-output': `${fmt(model.velocityKmS, 1)} km/s`,
      'model-altitude-output': `${fmt(model.altitudeKm, 0)} km`,
      'model-depth-output': `${fmt(model.targetDepthKm, 2)} km`,
      'bump-height-output': `${fmt(model.bumpHeightKm, 1)} km`
    };
    Object.entries(outputs).forEach(([id, text]) => {
      const outputEl = document.getElementById(id);
      if (outputEl) outputEl.textContent = text;
    });
  }

  function surfaceBumpElevationKm(xKm) {
    if (model.bumpHeightKm <= 0) return 0;
    const roughness =
      0.48 * Math.sin((xKm + 18) * 0.16) +
      0.33 * Math.sin((xKm - 7) * 0.31) +
      0.19 * Math.cos((xKm + 3) * 0.49);
    return model.bumpHeightKm * roughness;
  }

  function surfaceRangeState(xKm, planeXKm = 0) {
    const elevationKm = surfaceBumpElevationKm(xKm);
    const surfaceDxKm = xKm - planeXKm;
    const verticalKm = Math.max(1, model.altitudeKm - elevationKm);
    const surfaceRangeKm = Math.hypot(verticalKm, surfaceDxKm);
    return {
      xKm,
      elevationKm,
      surfaceDxKm,
      verticalKm,
      surfaceRangeKm,
      surfaceApparentDepthKm: (surfaceRangeKm - model.altitudeKm) / model.iceIndex,
      surfaceTrueDopplerHz: (2 * model.velocityKmS * 1000 / wavelengthM) * (surfaceDxKm / surfaceRangeKm)
    };
  }

  function surfaceSlopeAtKm(xKm) {
    const sampleKm = 0.25;
    return (
      surfaceBumpElevationKm(xKm + sampleKm) -
      surfaceBumpElevationKm(xKm - sampleKm)
    ) / (2 * sampleKm);
  }

  function surfaceReturnPowerRatio(surfaceState, targetRangeKm) {
    const rangeRatio = targetRangeKm / Math.max(surfaceState.surfaceRangeKm, 1e-6);
    const rangePower = clamp(rangeRatio ** 4, 0.25, 6);
    const slope = surfaceSlopeAtKm(surfaceState.xKm);
    const normalCos = clamp(
      (surfaceState.verticalKm + slope * surfaceState.surfaceDxKm) /
      (surfaceState.surfaceRangeKm * Math.hypot(1, slope)),
      0,
      1
    );
    const heightRatio = model.bumpHeightKm > 0 ? surfaceState.elevationKm / model.bumpHeightKm : 0;
    const heightPower = clamp(1 + 0.35 * heightRatio, 0.55, 1.35);
    const facetPower = 0.34 + 0.92 * normalCos ** 2;
    return clamp(0.42 * rangePower * heightPower * facetPower, 0.04, 4.5);
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
    timeSlider.min = '0';
    timeSlider.max = flyby.durationS.toFixed(2);
    if (resetTime || flyby.timeS < 0 || flyby.timeS > flyby.durationS) {
      flyby.timeS = 0;
    }
    timeSlider.value = flyby.timeS.toFixed(2);
    if (timeOutput) timeOutput.textContent = `${fmt(flyby.timeS, 1)} s`;
    if (timeMinLabel) timeMinLabel.textContent = '0 s';
    if (timeMaxLabel) timeMaxLabel.textContent = `${fmt(flyby.durationS, 0)} s`;
    updatePlaybackSpeedControl();
  }

  function movingTwoReturnState(effectivePrfHz) {
    const planeXKm = (flyby.timeS - flyby.durationS / 2) * model.velocityKmS;
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

  function flybyHalfDistanceKm() {
    return (flyby.durationS / 2) * model.velocityKmS;
  }

  function currentGeometryHalfWidthKm() {
    return Math.ceil(Math.max(
      model.spreadKm,
      flybyHalfDistanceKm(),
      Math.abs(selectedFoldingPoint?.xKm || 0)
    ) / 10) * 10;
  }

  function currentFastTimeDepthMaxKm() {
    const halfDistanceKm = flybyHalfDistanceKm();
    const selectedXKm = selectedFoldingPoint?.xKm || 0;
    const maxSurfaceDxKm = Math.max(
      Math.abs(selectedXKm - (-halfDistanceKm)),
      Math.abs(selectedXKm - halfDistanceKm)
    );
    const maxSurfaceDepthKm = (Math.hypot(model.altitudeKm, maxSurfaceDxKm) - model.altitudeKm) / model.iceIndex;
    const targetOpticalHeightKm = model.altitudeKm + model.iceIndex * model.targetDepthKm;
    const maxTargetDepthKm = (Math.hypot(targetOpticalHeightKm, halfDistanceKm) - model.altitudeKm) / model.iceIndex;
    return Math.ceil(Math.max(12, model.targetDepthKm, maxSurfaceDepthKm, maxTargetDepthKm) + 1);
  }

  function multiClutterGeometryDepthMaxKm() {
    const halfDistanceKm = flybyHalfDistanceKm();
    const maxSurfaceDepthKm = equalDistanceClutterPoints(multiClutterPointCount).reduce((maxDepthKm, point) => {
      const maxSurfaceDxKm = Math.max(
        Math.abs(point.xKm + halfDistanceKm),
        Math.abs(point.xKm - halfDistanceKm)
      );
      const verticalKm = Math.max(1, model.altitudeKm - point.elevationKm);
      const depthKm = (Math.hypot(verticalKm, maxSurfaceDxKm) - model.altitudeKm) / model.iceIndex;
      return Math.max(maxDepthKm, depthKm);
    }, 0);
    const targetOpticalHeightKm = model.altitudeKm + model.iceIndex * model.targetDepthKm;
    const maxTargetDepthKm = (
      Math.hypot(targetOpticalHeightKm, halfDistanceKm) - model.altitudeKm
    ) / model.iceIndex;
    return Math.ceil(Math.max(12, model.targetDepthKm, maxSurfaceDepthKm, maxTargetDepthKm) + 1);
  }

  function apparentDepthForDopplerHz(dopplerHz) {
    const sinTheta = Math.abs(dopplerHz) * wavelengthM / (2 * model.velocityKmS * 1000);
    if (sinTheta <= 0 || sinTheta >= 1) return null;
    const rangeKm = model.altitudeKm / Math.sqrt(1 - sinTheta ** 2);
    return (rangeKm - model.altitudeKm) / model.iceIndex;
  }

  // Search all physically possible alias orders. A continuous surface return
  // lies at zero aliased Doppler when |fD| = order x effectivePRF. The returned
  // band converts the stated +/- Doppler tolerance into an apparent-depth span.
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
    if (resetPrf && usesMultiClutterState) {
      const recommendedStart = recommendedMultiClutterStart(sliderMinHz, sliderMaxHz);
      if (recommendedStart) {
        prfSlider.value = recommendedStart.prfHz.toFixed(1);
        flyby.timeS = recommendedStart.timeS;
      }
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
    updateFlybyControl(resetPrf && !usesMultiClutterState);
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
    if (!blurPlot) return;
    const width = 560;
    const height = 350;
    const margin = { left: 68, right: 25, top: 50, bottom: 42 };
    const depthMinKm = 0;
    const depthMaxKm = currentFastTimeDepthMaxKm();
    const sy = (value) => margin.top + ((value - depthMinKm) / (depthMaxKm - depthMinKm)) * (height - margin.top - margin.bottom);
    const clutterVisible = movingState.surfaceApparentDepthKm >= depthMinKm && movingState.surfaceApparentDepthKm <= depthMaxKm;
    const targetApparentDepthKm = movingState.targetApparentDepthKm;
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Selected clutter apparent depth at fixed PRF while the aircraft moves through time">
      <defs><linearGradient id="blur-block" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9b3d3f" stop-opacity=".10"></stop><stop offset=".5" stop-color="#9b3d3f" stop-opacity="${movingState.overlapsTarget ? '.50' : '.30'}"></stop><stop offset="1" stop-color="#9b3d3f" stop-opacity=".10"></stop></linearGradient></defs>`;

    svg += `<text class="blur-title-text" x="${margin.left}" y="18">fixed PRF: ${fmt(effectivePrfHz, 1)} Hz</text>`;
    svg += `<text class="blur-title-text" x="${margin.left}" y="35">flyby time: ${fmt(flyby.timeS, 1)} s</text>`;
    for (let index = 0; index < 6; index += 1) {
      const value = depthMinKm + ((depthMaxKm - depthMinKm) * index) / 5;
      const y = sy(value);
      svg += `<line class="blur-grid" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line>`;
      svg += `<text class="blur-label" x="${margin.left - 10}" y="${y + 4}" text-anchor="end">${fmt(value, 1)}</text>`;
    }
    svg += `<line class="blur-axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>`;
    svg += `<rect class="blur-target-window" x="${margin.left}" y="${sy(targetApparentDepthKm - model.depthToleranceKm)}" width="${width - margin.left - margin.right}" height="${sy(targetApparentDepthKm + model.depthToleranceKm) - sy(targetApparentDepthKm - model.depthToleranceKm)}"></rect>`;
    svg += `<line class="blur-target-depth" x1="${margin.left}" y1="${sy(targetApparentDepthKm)}" x2="${width - margin.right}" y2="${sy(targetApparentDepthKm)}"></line>`;
    svg += `<text class="blur-title-text" x="${width - margin.right}" y="${sy(targetApparentDepthKm) - 7}" text-anchor="end">target apparent echo ${fmt(targetApparentDepthKm, 2)} km +/- ${fmt(model.depthToleranceKm, 2)} km</text>`;

    if (clutterVisible) {
      const clutterTop = sy(movingState.surfaceApparentDepthKm - model.depthToleranceKm);
      const clutterBottom = sy(movingState.surfaceApparentDepthKm + model.depthToleranceKm);
      svg += `<rect class="blur-layer-block" x="${margin.left}" y="${clutterTop}" width="${width - margin.left - margin.right}" height="${Math.max(1, clutterBottom - clutterTop)}"></rect>`;
      svg += `<line class="blur-layer-edge" x1="${margin.left}" y1="${sy(movingState.surfaceApparentDepthKm)}" x2="${width - margin.right}" y2="${sy(movingState.surfaceApparentDepthKm)}"></line>`;
      svg += `<text class="blur-title-text" x="${margin.left + 10}" y="${clutterTop - 8}">surface clutter echo ${fmt(movingState.surfaceApparentDepthKm, 2)} km</text>`;
    } else {
      svg += `<text class="blur-title-text" x="${margin.left + (width - margin.left - margin.right) / 2}" y="${margin.top + 35}" text-anchor="middle">surface clutter echo is outside the current depth view</text>`;
    }

    svg += `<text class="blur-title-text" transform="translate(17 ${margin.top + (height - margin.top - margin.bottom) / 2}) rotate(-90)" text-anchor="middle">apparent depth (km, downward)</text>`;
    svg += '</svg>';
    blurPlot.innerHTML = svg;
  }

  function renderDopplerBins(movingState, clusterState = null) {
    if (!dopplerBinsPlot) return;
    const width = 900;
    const height = 315;
    const margin = { left: 70, right: 38, top: 38, bottom: 45 };
    const plotWidth = width - margin.left - margin.right;
    const prf = movingState.effectivePrfHz;
    const clusterPoints = clusterState?.points || [];
    const clusterCount = clusterPoints.length;
    const trueDopplers = [
      movingState.surfaceTrueDopplerHz,
      movingState.targetTrueDopplerHz,
      ...clusterPoints.map((point) => point.surfaceTrueDopplerHz)
    ];
    const trueMinOrder = Math.floor((Math.min(...trueDopplers) - prf) / prf);
    const trueMaxOrder = Math.ceil((Math.max(...trueDopplers) + prf) / prf);
    const trueMin = trueMinOrder * prf - prf / 2;
    const trueMax = trueMaxOrder * prf + prf / 2;
    const sxTrue = (value) => margin.left + ((value - trueMin) / (trueMax - trueMin)) * plotWidth;
    const sxAlias = (value) => margin.left + ((value + prf / 2) / prf) * plotWidth;
    const trueY = 94;
    const aliasY = 212;
    const binHeight = 54;
    const binStep = prf / 8;
    const overlapCount = movingState.overlapCount || (movingState.overlapsTarget ? 1 : 0);
    const foldText = movingState.foldOrder === 0
      ? 'no fold: surface true Doppler is already inside the sampled interval'
      : `fold order ${movingState.foldOrder}: surface Doppler is shifted by ${signed(movingState.foldOrder * prf, 1)} Hz into the sampled interval`;
    const overlapText = overlapCount > 1
      ? `${fmt(overlapCount, 0)} clutter points land in the target Doppler-depth cell`
      : movingState.overlapsTarget
      ? 'alias overlap: surface and target land in the same Doppler-depth cell'
      : 'separate bins/cells: clutter is not on the target response';

    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Doppler bin visualization for one surface clutter return and one subsurface target">
      <defs>
        <marker id="fold-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" class="bin-arrow-head"></path></marker>
      </defs>`;
    svg += `<text class="bin-title" x="${margin.left}" y="18">${foldText}</text>`;
    svg += `<text class="${movingState.overlapsTarget ? 'bin-danger' : 'bin-note'}" x="${width - margin.right}" y="18" text-anchor="end">${overlapText}</text>`;
    if (clusterCount) {
      const clusterLabel = overlapCount > 1
        ? `All ${fmt(clusterCount, 0)} bumpy-surface aliases shown against one subsurface object; ${fmt(overlapCount, 0)} red markers hit the target cell`
        : `All ${fmt(clusterCount, 0)} bumpy-surface aliases shown against one subsurface object`;
      svg += `<text class="bin-cluster-label" x="${margin.left}" y="34">${clusterLabel}</text>`;
    }

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
    periodicIntervalSegments(movingState.targetAliasHz, model.dopplerToleranceHz, prf).forEach(([startHz, endHz]) => {
      svg += `<rect class="bin-target-window" x="${sxAlias(startHz)}" y="${aliasY - binHeight / 2}" width="${Math.max(2, sxAlias(endHz) - sxAlias(startHz))}" height="${binHeight}"></rect>`;
    });
    svg += `<line class="bin-axis" x1="${margin.left}" y1="${trueY}" x2="${width - margin.right}" y2="${trueY}"></line>`;
    svg += `<line class="bin-axis" x1="${margin.left}" y1="${aliasY}" x2="${width - margin.right}" y2="${aliasY}"></line>`;
    svg += `<text class="bin-lane-label" x="${margin.left - 12}" y="${trueY + 4}" text-anchor="end">true Doppler</text>`;
    svg += `<text class="bin-lane-label" x="${margin.left - 12}" y="${aliasY + 4}" text-anchor="end">sampled bin</text>`;
    clusterPoints.forEach((point) => {
      const aliasStack = plotStack(
        clusterPoints,
        point,
        (entry) => sxAlias(entry.surfaceAliasHz),
        () => aliasY,
        1.2,
        6
      );
      svg += `<path class="bin-cluster-fold-link ${point.overlapsTarget ? 'overlap' : ''}" d="M ${sxTrue(point.surfaceTrueDopplerHz)} ${trueY + 7} C ${sxTrue(point.surfaceTrueDopplerHz)} 139, ${sxAlias(point.surfaceAliasHz) + aliasStack.x} 162, ${sxAlias(point.surfaceAliasHz) + aliasStack.x} ${aliasY - 9}"><title>Point ${point.index + 1} folds from ${signed(point.surfaceTrueDopplerHz, 1)} Hz to ${signed(point.surfaceAliasHz, 1)} Hz</title></path>`;
    });
    clusterPoints.forEach((point) => {
      const isSelected = Math.abs(point.xKm - movingState.surfaceXKm) < 1e-6;
      const css = point.overlapsTarget ? 'overlap' : isSelected ? 'selected' : '';
      const aliasStack = plotStack(
        clusterPoints,
        point,
        (entry) => sxAlias(entry.surfaceAliasHz),
        () => aliasY,
        1.2,
        6
      );
      svg += `<circle class="bin-cluster-marker ${css}" cx="${sxTrue(point.surfaceTrueDopplerHz)}" cy="${trueY}" r="${isSelected ? 5 : 3.2}"><title>Cluster point ${point.index + 1}: true ${signed(point.surfaceTrueDopplerHz, 1)} Hz</title></circle>`;
      svg += `<circle class="bin-cluster-marker ${css}" cx="${sxAlias(point.surfaceAliasHz) + aliasStack.x}" cy="${aliasY + aliasStack.y}" r="${isSelected ? 5.4 : 3.4}"><title>Cluster point ${point.index + 1}: alias ${signed(point.surfaceAliasHz, 1)} Hz</title></circle>`;
      if (aliasStack.count > 1 && aliasStack.index === 0) {
        svg += `<text class="bin-stack-label" x="${sxAlias(point.surfaceAliasHz) + 9}" y="${aliasY - 11}">${fmt(aliasStack.count, 0)} pts</text>`;
      }
    });
    if (!clusterCount) {
      svg += `<path class="bin-fold-link" d="M ${sxTrue(movingState.surfaceTrueDopplerHz)} ${trueY + 8} C ${sxTrue(movingState.surfaceTrueDopplerHz)} 145, ${sxAlias(movingState.surfaceAliasHz)} 160, ${sxAlias(movingState.surfaceAliasHz)} ${aliasY - 10}" marker-end="url(#fold-arrow)"></path>`;
    }

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

  // Check 1: compare the equal-distance clutter traces against the fixed target
  // trace. The highlighted cluster point is the same one used in the bin check.
  function renderTraceCheck(movingState, clusterState = null) {
    if (!traceCheckPlot) return;
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
    const bandPathFor = (depthAtX, halfWidthKm) => {
      const samples = Array.from({ length: 181 }, (_, index) => xMinKm + ((xMaxKm - xMinKm) * index) / 180);
      const upper = samples.map((xKm, index) => `${index ? 'L' : 'M'} ${sx(xKm).toFixed(2)} ${sy(depthAtX(xKm) - halfWidthKm).toFixed(2)}`);
      const lower = [...samples].reverse().map((xKm) => `L ${sx(xKm).toFixed(2)} ${sy(depthAtX(xKm) + halfWidthKm).toFixed(2)}`);
      return `${upper.join(' ')} ${lower.join(' ')} Z`;
    };
    const clusterPoints = clusterState?.points || [];
    const clusterCount = clusterPoints.length;
    const clutterTraceDepthFor = (surfaceXKm) => (platformXKm) => (
      surfaceRangeState(surfaceXKm, platformXKm).surfaceRangeKm - model.altitudeKm
    ) / model.iceIndex;
    const clutterTraceDepth = clutterTraceDepthFor(movingState.surfaceXKm);
    const targetEquivalentRangeKm = model.altitudeKm + model.iceIndex * model.targetDepthKm;
    const targetTraceDepth = (platformXKm) => (
      Math.hypot(targetEquivalentRangeKm, platformXKm) - model.altitudeKm
    ) / model.iceIndex;
    const traceIntersectionFor = (surfaceXKm) => {
      if (Math.abs(surfaceXKm) < 1e-9) return null;
      const verticalKm = Math.max(1, model.altitudeKm - surfaceBumpElevationKm(surfaceXKm));
      return (verticalKm ** 2 + surfaceXKm ** 2 - targetEquivalentRangeKm ** 2) / (2 * surfaceXKm);
    };
    const targetApexX = sx(0);
    const targetApexY = sy(model.targetDepthKm);
    const overlapCount = movingState.overlapCount || (movingState.overlapsTarget ? 1 : 0);
    const overlapGroup = clusterPoints.filter((point) => point.overlapsTarget);
    const powerSummary = (points) => {
      const powers = points
        .map((point) => point.surfacePowerRatio)
        .filter(Number.isFinite);
      if (!powers.length) return '';
      if (powers.length === 1) return `; power ${fmt(powers[0], 2)}x`;
      const sorted = [...powers].sort((a, b) => a - b);
      if (powers.length === 2) return `; powers ${fmt(sorted[0], 2)}x / ${fmt(sorted[1], 2)}x`;
      return `; powers ${fmt(sorted[0], 2)}-${fmt(sorted[sorted.length - 1], 2)}x`;
    };
    const stateLabel = overlapCount > 1
      ? `${fmt(overlapCount, 0)} clutter traces have both range and folded Doppler match`
      : movingState.overlapsTarget ? 'range and folded Doppler both match' : 'range or folded Doppler remains separated';
    const clusterLabel = clusterCount
      ? `${fmt(clusterCount, 0)} surface traces; ${fmt(overlapCount, 0)} highlighted return${overlapCount === 1 ? '' : 's'} match${powerSummary(overlapGroup)}`
      : `current trace: ${stateLabel}`;
    const currentXKm = Math.max(xMinKm, Math.min(xMaxKm, movingState.planeXKm));
    const currentX = sx(currentXKm);
    const clutterY = sy(clutterTraceDepth(currentXKm));
    const movingLabelAnchor = currentXKm >= 0 ? 'start' : 'end';
    const movingLabelX = currentX + (currentXKm >= 0 ? 10 : -10);
    const movingLabelY = clutterY + (movingState.overlapsTarget ? 20 : -9);
    const currentStackForPoint = (point) => (
      point.overlapsTarget && overlapGroup.length > 1
        ? {
          ...stackOffset(
            Math.max(0, overlapGroup.findIndex((entry) => entry.index === point.index)),
            overlapGroup.length,
            5.8
          ),
          count: overlapGroup.length
        }
        : { x: 0, y: 0, count: 1 }
    );
    const visibleTraceIntersections = clusterPoints.map((point) => {
      const intersectionKm = traceIntersectionFor(point.xKm);
      if (!Number.isFinite(intersectionKm) || intersectionKm < xMinKm || intersectionKm > xMaxKm) return null;
      const intersectionDepthKm = targetTraceDepth(intersectionKm);
      if (intersectionDepthKm < depthMinKm || intersectionDepthKm > depthMaxKm) return null;
      return {
        point,
        intersectionKm,
        intersectionDepthKm,
        plotX: sx(intersectionKm),
        plotY: sy(intersectionDepthKm)
      };
    }).filter(Boolean);
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Physical range histories for the bumpy equal-distance surface clutter points and one fixed subsurface target">
      <defs><clipPath id="trace-check-clip"><rect x="${margin.left}" y="${margin.top}" width="${width - margin.left - margin.right}" height="${height - margin.top - margin.bottom}"></rect></clipPath></defs>`;

    svg += `<line class="check-clutter-curve selected" x1="${margin.left}" y1="16" x2="${margin.left + 28}" y2="16"></line>`;
    svg += `<text class="check-title" x="${margin.left + 35}" y="20">surface clutter hyperbola</text>`;
    svg += `<line class="check-target-curve" x1="${margin.left + 230}" y1="16" x2="${margin.left + 258}" y2="16"></line>`;
    svg += `<text class="check-title" x="${margin.left + 265}" y="20">subsurface target hyperbola</text>`;
    svg += `<text class="${movingState.overlapsTarget ? 'check-danger' : 'check-title'}" x="${margin.left}" y="40">${clusterLabel}</text>`;

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
    svg += `<line class="check-guide" x1="${targetApexX}" y1="${margin.top}" x2="${targetApexX}" y2="${height - margin.bottom}"></line>`;
    svg += `<g clip-path="url(#trace-check-clip)">`;
    svg += `<path class="check-target-window" d="${bandPathFor(targetTraceDepth, model.depthToleranceKm)}"></path>`;
    if (clusterCount) {
      clusterPoints.forEach((point) => {
        const isSelected = Math.abs(point.xKm - movingState.surfaceXKm) < 1e-6;
        const overlapIndex = overlapGroup.findIndex((entry) => entry.index === point.index);
        const traceClass = point.overlapsTarget
          ? `overlap ${isSelected ? 'selected' : 'secondary'}`
          : 'cluster';
        const returnPower = Number.isFinite(point.surfacePowerRatio) ? point.surfacePowerRatio : 1;
        const traceWidth = point.overlapsTarget ? 1.8 + 1.8 * Math.min(1, Math.sqrt(returnPower / 2.4)) : null;
        const traceOpacity = point.overlapsTarget ? 0.55 + 0.4 * Math.min(1, returnPower / 2.4) : null;
        const traceStyle = point.overlapsTarget ? ` style="stroke-width:${traceWidth.toFixed(2)};opacity:${traceOpacity.toFixed(2)}"` : '';
        svg += `<path class="check-clutter-curve ${traceClass}" data-point-index="${point.index}" data-target-match="${point.overlapsTarget}" data-return-power="${returnPower}" d="${pathFor(clutterTraceDepthFor(point.xKm))}"${traceStyle}><title>Surface point ${point.index + 1} range trace; bump power ${fmt(returnPower, 2)}x target${point.overlapsTarget ? `; target-cell match ${overlapIndex + 1} of ${overlapGroup.length}` : ''}</title></path>`;
      });
    } else {
      svg += `<path class="check-clutter-curve selected" d="${pathFor(clutterTraceDepth)}"><title>Selected surface clutter range trace</title></path>`;
    }
    svg += `<path class="check-target-curve" d="${pathFor(targetTraceDepth)}"><title>Fixed subsurface target range trace</title></path>`;
    clusterPoints.forEach((point) => {
      const isSelected = Math.abs(point.xKm - movingState.surfaceXKm) < 1e-6;
      if (isSelected) return;
      const currentStack = currentStackForPoint(point);
      const returnPower = Number.isFinite(point.surfacePowerRatio) ? point.surfacePowerRatio : 1;
      const radius = point.overlapsTarget ? 3.4 + 2.5 * Math.min(1, Math.sqrt(returnPower / 2.4)) : 2.7;
      svg += `<circle class="check-cluster-dot ${point.overlapsTarget ? 'overlap' : ''}" cx="${currentX + currentStack.x}" cy="${sy(clutterTraceDepthFor(point.xKm)(currentXKm)) + currentStack.y}" r="${radius}"><title>Cluster point ${point.index + 1}: alias ${signed(point.surfaceAliasHz, 1)} Hz, bump power ${fmt(returnPower, 2)}x target</title></circle>`;
    });
    visibleTraceIntersections.forEach((entry) => {
      const stack = plotStack(
        visibleTraceIntersections.map((item) => ({ ...item.point, plotX: item.plotX, plotY: item.plotY })),
        { ...entry.point, plotX: entry.plotX, plotY: entry.plotY },
        (item) => item.plotX,
        (item) => item.plotY,
        1.4,
        5
      );
      const isSelected = Math.abs(entry.point.xKm - movingState.surfaceXKm) < 1e-6;
      svg += `<circle class="check-trace-intersection${isSelected ? ' selected' : ''}" cx="${entry.plotX + stack.x}" cy="${entry.plotY + stack.y}" r="${isSelected ? 4.2 : 2.8}"><title>Range-only crossing for point ${entry.point.index + 1} at along-track ${fmt(entry.intersectionKm, 2)} km</title></circle>`;
      if (stack.count > 1 && stack.index === 0) {
        svg += `<text class="check-stack-label" x="${entry.plotX + 10}" y="${entry.plotY - 10}">${fmt(stack.count, 0)} crossings</text>`;
      }
    });
    svg += '</g>';
    svg += `<line class="check-motion-guide" x1="${currentX}" y1="${margin.top}" x2="${currentX}" y2="${height - margin.bottom}"></line>`;
    const selectedCurrentPoint = clusterPoints.find((point) => point.index === movingState.selectedPointIndex);
    const selectedStack = selectedCurrentPoint ? currentStackForPoint(selectedCurrentPoint) : { x: 0, y: 0, count: 1 };
    const selectedPower = Number.isFinite(movingState.surfacePowerRatio) ? movingState.surfacePowerRatio : selectedCurrentPoint?.surfacePowerRatio;
    const selectedPowerText = Number.isFinite(selectedPower) ? `, bump power ${fmt(selectedPower, 2)}x target` : '';
    svg += `<circle class="check-moving-clutter${movingState.overlapsTarget ? ' overlap' : ''}" cx="${currentX + selectedStack.x}" cy="${clutterY + selectedStack.y}" r="6"><title>Selected clutter: ${signed(movingState.surfaceAliasHz, 1)} Hz folded Doppler${selectedPowerText}</title></circle>`;
    if (overlapCount > 1) {
      svg += `<text class="check-stack-label" x="${currentX + 13}" y="${Math.min(height - margin.bottom - 8, clutterY + 27)}">${fmt(overlapCount, 0)} matching echoes, unequal power</text>`;
    } else {
      svg += `<text class="${movingState.overlapsTarget ? 'check-danger' : 'check-title'}" x="${movingLabelX}" y="${movingLabelY}" text-anchor="${movingLabelAnchor}">current selected surface point</text>`;
    }
    svg += `<rect class="check-trace-target-marker" data-fixed-depth-km="${model.targetDepthKm}" x="${targetApexX - 6}" y="${targetApexY - 6}" width="12" height="12" transform="rotate(45 ${targetApexX} ${targetApexY})"><title>Fixed subsurface object at ${fmt(model.targetDepthKm, 2)} km physical depth</title></rect>`;
    svg += `<text class="check-title" x="${targetApexX - 12}" y="${targetApexY - 13}" text-anchor="end">fixed target ${fmt(model.targetDepthKm, 2)} km</text>`;
    svg += `<line class="check-axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>`;
    svg += `<line class="check-axis" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"></line>`;
    svg += `<text class="check-title" x="${margin.left + (width - margin.left - margin.right) / 2}" y="${height - 5}" text-anchor="middle">along-track position (km)</text>`;
    svg += `<text class="check-title" transform="translate(17 ${margin.top + (height - margin.top - margin.bottom) / 2}) rotate(-90)" text-anchor="middle">apparent depth / fast time (km)</text>`;
    svg += '</svg>';
    traceCheckPlot.innerHTML = svg;
  }

  // Check 2: show the target resolution cell in fast-time x folded-Doppler
  // space. Doppler is plotted relative to the target so the PRF boundary wraps.
  function renderFastTimeDopplerCheck(movingState, clusterState = null) {
    if (!dopplerCheckPlot) return;
    const width = 560;
    const height = 350;
    const margin = { left: 68, right: 25, top: clusterState?.points?.length ? 72 : 55, bottom: 48 };
    const clusterPoints = clusterState?.points || [];
    const clusterCount = clusterPoints.length;
    const prf = movingState.effectivePrfHz;
    const relativeDopplerHz = (valueHz) => alias(valueHz - movingState.targetAliasHz, prf);
    const selectedRelativeHz = relativeDopplerHz(movingState.surfaceAliasHz);
    const dopplerMinHz = -prf / 2;
    const dopplerMaxHz = prf / 2;
    const depthMinKm = 0;
    const depthMaxKm = Math.ceil(Math.max(
      12,
      movingState.targetApparentDepthKm + 1,
      movingState.surfaceApparentDepthKm + 1,
      ...clusterPoints.map((point) => point.surfaceApparentDepthKm)
    ));
    const sx = (value) => margin.left + ((value - dopplerMinHz) / (dopplerMaxHz - dopplerMinHz)) * (width - margin.left - margin.right);
    const sy = (value) => margin.top + ((value - depthMinKm) / (depthMaxKm - depthMinKm)) * (height - margin.top - margin.bottom);
    const overlapCount = movingState.overlapCount || (movingState.overlapsTarget ? 1 : 0);
    const overlapGroup = clusterPoints.filter((point) => point.overlapsTarget);
    const stackForPoint = (point) => plotStack(
      clusterPoints,
      point,
      (entry) => sx(relativeDopplerHz(entry.surfaceAliasHz)),
      (entry) => sy(entry.surfaceApparentDepthKm),
      1.4,
      point.overlapsTarget && overlapGroup.length > 1 ? 5.8 : 4.2
    );
    const aliasLabel = signed(movingState.surfaceAliasHz, 1);
    const stateLabel = overlapCount > 1
      ? `${fmt(overlapCount, 0)} clutter points are inside the target resolution cell`
      : movingState.overlapsTarget
      ? '1 clutter point is inside the target resolution cell'
      : `${clusterCount ? '0' : 'Selected'} clutter points are inside the target resolution cell`;
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Fast-time by aliased Doppler check at ${fmt(movingState.effectivePrfHz, 1)} hertz; ${stateLabel}">
      <defs>
        <clipPath id="doppler-check-clip"><rect x="${margin.left}" y="${margin.top}" width="${width - margin.left - margin.right}" height="${height - margin.top - margin.bottom}"></rect></clipPath>
      </defs>`;

    svg += `<text class="check-title" x="${margin.left}" y="18">${clusterCount ? `All ${fmt(clusterCount, 0)} bumpy-surface aliases against one target cell` : `selected alias ${aliasLabel} Hz; target-relative ${signed(selectedRelativeHz, 1)} Hz`}</text>`;
    svg += `<text class="${movingState.overlapsTarget ? 'check-danger' : 'check-title'}" x="${margin.left}" y="39">${stateLabel}</text>`;
    if (clusterCount) {
      svg += `<text class="check-title" x="${width - margin.right}" y="58" text-anchor="end">circles = bumpy surface, diamond = one target</text>`;
    }
    [-prf / 2, -prf / 4, 0, prf / 4, prf / 2].forEach((value) => {
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
    const targetCell = {
      targetAliasHz: movingState.targetAliasHz,
      targetApparentDepthKm: movingState.targetApparentDepthKm,
      overlapsSurface: movingState.overlapsTarget
    };
    periodicIntervalSegments(relativeDopplerHz(targetCell.targetAliasHz), model.dopplerToleranceHz, prf).forEach(([startHz, endHz]) => {
      svg += `<rect class="check-target-window ${targetCell.overlapsSurface ? 'overlap' : ''}" x="${sx(startHz)}" y="${sy(targetCell.targetApparentDepthKm - model.depthToleranceKm)}" width="${Math.max(2, sx(endHz) - sx(startHz))}" height="${Math.max(2, sy(targetCell.targetApparentDepthKm + model.depthToleranceKm) - sy(targetCell.targetApparentDepthKm - model.depthToleranceKm))}"></rect>`;
    });
    svg += `<line class="check-target-line" x1="${sx(0)}" y1="${margin.top}" x2="${sx(0)}" y2="${height - margin.bottom}"></line>`;
    svg += `<line class="check-target-line" x1="${margin.left}" y1="${sy(movingState.targetApparentDepthKm)}" x2="${width - margin.right}" y2="${sy(movingState.targetApparentDepthKm)}"></line>`;
    clusterPoints.forEach((point) => {
      const css = point.overlapsTarget ? 'overlap' : point.index === movingState.selectedPointIndex ? 'selected' : '';
      const stack = stackForPoint(point);
      const returnPower = Number.isFinite(point.surfacePowerRatio) ? point.surfacePowerRatio : 1;
      const radius = point.overlapsTarget ? 3.3 + 2.4 * Math.min(1, Math.sqrt(returnPower / 2.4)) : point.index === movingState.selectedPointIndex ? 3.8 : 3;
      svg += `<circle class="check-cluster-sample ${css}" cx="${sx(relativeDopplerHz(point.surfaceAliasHz)) + stack.x}" cy="${sy(point.surfaceApparentDepthKm) + stack.y}" r="${radius}"><title>Surface point ${point.index + 1}: target-relative Doppler ${signed(relativeDopplerHz(point.surfaceAliasHz), 1)} Hz at ${fmt(point.surfaceApparentDepthKm, 2)} km, bump power ${fmt(returnPower, 2)}x target</title></circle>`;
    });
    svg += '</g>';
    if (!clusterCount) {
      svg += `<circle class="check-clutter-center ${movingState.overlapsTarget ? 'overlap' : ''}" cx="${sx(selectedRelativeHz)}" cy="${sy(movingState.surfaceApparentDepthKm)}" r="5"><title>Selected clutter center</title></circle>`;
    }
    svg += `<rect class="check-target-center" x="${sx(0) - 5}" y="${sy(movingState.targetApparentDepthKm) - 5}" width="10" height="10" transform="rotate(45 ${sx(0)} ${sy(movingState.targetApparentDepthKm)})"><title>Target resolution-cell center</title></rect>`;
    if (overlapCount > 1) {
      svg += `<text class="check-stack-label" x="${sx(0) + 12}" y="${sy(movingState.targetApparentDepthKm) + 23}">${fmt(overlapCount, 0)} stacked echoes</text>`;
    }
    svg += `<line class="check-axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>`;
    svg += `<line class="check-axis" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"></line>`;
    svg += `<text class="check-title" x="${margin.left + (width - margin.left - margin.right) / 2}" y="${height - 7}" text-anchor="middle">folded Doppler relative to target (Hz)</text>`;
    svg += `<text class="check-title" transform="translate(17 ${margin.top + (height - margin.top - margin.bottom) / 2}) rotate(-90)" text-anchor="middle">apparent depth / fast time (km)</text>`;
    svg += '</svg>';
    dopplerCheckPlot.innerHTML = svg;
  }

  function equalDistanceClutterPoints(count) {
    const safeCount = Math.max(1, Math.round(count));
    const spacingKm = safeCount > 1 ? (2 * model.spreadKm) / (safeCount - 1) : 0;
    return Array.from({ length: safeCount }, (_, index) => {
      const xKm = safeCount === 1
        ? (selectedFoldingPoint?.xKm || 0)
        : -model.spreadKm + spacingKm * index;
      const rangeState = surfaceRangeState(xKm, 0);
      return {
        index,
        xKm,
        elevationKm: rangeState.elevationKm,
        rangeKm: rangeState.surfaceRangeKm,
        trueDopplerHz: rangeState.surfaceTrueDopplerHz,
        apparentDepthKm: rangeState.surfaceApparentDepthKm
      };
    });
  }

  function targetStateForPlane(planeXKm, effectivePrfHz) {
    const targetDxKm = -planeXKm;
    const targetOpticalHeightKm = model.altitudeKm + model.iceIndex * model.targetDepthKm;
    const targetRangeKm = Math.hypot(targetOpticalHeightKm, targetDxKm);
    const targetTrueDopplerHz = (2 * model.velocityKmS * 1000 / wavelengthM) * (targetDxKm / targetRangeKm);
    return {
      index: 0,
      xKm: 0,
      targetDxKm,
      targetRangeKm,
      targetTrueDopplerHz,
      targetAliasHz: alias(targetTrueDopplerHz, effectivePrfHz),
      targetApparentDepthKm: (targetRangeKm - model.altitudeKm) / model.iceIndex
    };
  }

  function clutterStateForPoint(point, planeXKm, effectivePrfHz, targetState) {
    const surfaceState = surfaceRangeState(point.xKm, planeXKm);
    const surfaceDxKm = surfaceState.surfaceDxKm;
    const surfaceRangeKm = surfaceState.surfaceRangeKm;
    const surfaceTrueDopplerHz = surfaceState.surfaceTrueDopplerHz;
    const surfaceAliasHz = alias(surfaceTrueDopplerHz, effectivePrfHz);
    const surfaceApparentDepthKm = surfaceState.surfaceApparentDepthKm;
    const surfacePowerRatio = surfaceReturnPowerRatio(surfaceState, targetState.targetRangeKm);
    const surfaceAmplitudeRatio = Math.sqrt(surfacePowerRatio);
    const dopplerDeltaHz = Math.abs(alias(surfaceAliasHz - targetState.targetAliasHz, effectivePrfHz));
    const depthDeltaKm = Math.abs(surfaceApparentDepthKm - targetState.targetApparentDepthKm);
    const normalizedDistance = Math.hypot(
      dopplerDeltaHz / Math.max(1e-6, model.dopplerToleranceHz),
      depthDeltaKm / Math.max(1e-6, model.depthToleranceKm)
    );
    return {
      ...point,
      elevationKm: surfaceState.elevationKm,
      verticalKm: surfaceState.verticalKm,
      surfaceDxKm,
      surfaceRangeKm,
      surfaceTrueDopplerHz,
      surfaceAliasHz,
      surfaceApparentDepthKm,
      surfacePowerRatio,
      surfaceAmplitudeRatio,
      targetState,
      dopplerDeltaHz,
      depthDeltaKm,
      normalizedDistance,
      foldOrder: Math.round((surfaceTrueDopplerHz - surfaceAliasHz) / effectivePrfHz),
      overlapsTarget: dopplerDeltaHz <= model.dopplerToleranceHz && depthDeltaKm <= model.depthToleranceKm
    };
  }

  function multiClutterStateAt(timeS, effectivePrfHz) {
    const planeXKm = (timeS - flyby.durationS / 2) * model.velocityKmS;
    const targetState = targetStateForPlane(planeXKm, effectivePrfHz);
    const points = equalDistanceClutterPoints(multiClutterPointCount)
      .map((point) => clutterStateForPoint(point, planeXKm, effectivePrfHz, targetState));
    const overlappingPoints = points.filter((point) => point.overlapsTarget);
    const nearestPoint = points.reduce((best, point) => (
      point.normalizedDistance < best.normalizedDistance ? point : best
    ), points[0]);
    return {
      effectivePrfHz,
      planeXKm,
      targetState: {
        ...targetState,
        overlapsSurface: overlappingPoints.length > 0,
        matchingSurfaceIndexes: overlappingPoints.map((point) => point.index)
      },
      points,
      overlappingPoints,
      nearestPoint
    };
  }

  function multiClutterState(effectivePrfHz) {
    return multiClutterStateAt(flyby.timeS, effectivePrfHz);
  }

  function recommendedMultiClutterStart(prfMinHz, prfMaxHz) {
    let best = null;
    for (let timeS = 0; timeS <= flyby.durationS + 1e-9; timeS += 0.05) {
      for (let prfHz = prfMinHz; prfHz <= prfMaxHz + 1e-9; prfHz += 0.1) {
        const state = multiClutterStateAt(timeS, prfHz);
        const overlapCount = state.overlappingPoints.length;
        const distanceScore = state.nearestPoint ? state.nearestPoint.normalizedDistance : 999;
        const centeredTimePenalty = Math.abs(timeS - flyby.durationS / 2) * 0.05;
        const score = overlapCount * 1000 - distanceScore - centeredTimePenalty;
        if (!best || score > best.score) {
          best = {
            score,
            overlapCount,
            timeS,
            prfHz,
            nearestDistance: distanceScore
          };
        }
      }
    }
    return best && best.overlapCount > 0 ? best : null;
  }

  function diagnosticStateFromMultiClutter(state) {
    const selectedPoint = state.overlappingPoints[0] || state.nearestPoint;
    const selectedTarget = state.targetState;
    return {
      effectivePrfHz: state.effectivePrfHz,
      planeXKm: state.planeXKm,
      surfaceXKm: selectedPoint.xKm,
      surfaceElevationKm: selectedPoint.elevationKm,
      surfaceDxKm: selectedPoint.surfaceDxKm,
      surfaceRangeKm: selectedPoint.surfaceRangeKm,
      surfaceTrueDopplerHz: selectedPoint.surfaceTrueDopplerHz,
      surfaceAliasHz: selectedPoint.surfaceAliasHz,
      surfaceApparentDepthKm: selectedPoint.surfaceApparentDepthKm,
      surfacePowerRatio: selectedPoint.surfacePowerRatio,
      targetXKm: selectedTarget.xKm,
      targetTrueDopplerHz: selectedTarget.targetTrueDopplerHz,
      targetAliasHz: selectedTarget.targetAliasHz,
      targetApparentDepthKm: selectedTarget.targetApparentDepthKm,
      dopplerDeltaHz: selectedPoint.dopplerDeltaHz,
      depthDeltaKm: selectedPoint.depthDeltaKm,
      foldOrder: selectedPoint.foldOrder,
      overlapsTarget: selectedPoint.overlapsTarget,
      overlapCount: state.overlappingPoints.length,
      selectedPointIndex: selectedPoint.index
    };
  }

  function renderMultiClutterGeometry(state) {
    if (!multiClutterGeometryPlot) return;
    const width = 560;
    const height = 350;
    const left = 62;
    const right = 32;
    const surfaceY = 138;
    const aircraftY = 76;
    const depthMaxKm = multiClutterGeometryDepthMaxKm();
    const furthestPointKm = Math.max(
      ...state.points.map((point) => Math.abs(point.xKm)),
      Math.abs(state.targetState.xKm)
    );
    const geometryHalfWidthKm = Math.ceil(Math.max(model.spreadKm, flybyHalfDistanceKm(), Math.abs(state.planeXKm), furthestPointKm) / 10) * 10;
    const sx = (xKm) => left + ((xKm + geometryHalfWidthKm) / (2 * geometryHalfWidthKm)) * (width - left - right);
    const surfaceYFor = (xKm) => surfaceY - surfaceBumpElevationKm(xKm) * 9;
    const depthToY = (depthKm) => surfaceY + (depthKm / depthMaxKm) * 160;
    const targetX = sx(state.targetState.xKm);
    const targetY = depthToY(model.targetDepthKm);
    const aircraftX = sx(state.planeXKm);
    const nearest = state.overlappingPoints[0] || state.nearestPoint;
    const nearestDepthY = depthToY(Math.min(depthMaxKm, nearest.surfaceApparentDepthKm));
    const labelClass = state.overlappingPoints.length ? 'geometry-danger' : 'geometry-value';
    const surfaceSamples = Array.from({ length: 161 }, (_, index) => -geometryHalfWidthKm + (2 * geometryHalfWidthKm * index) / 160);
    const surfacePath = surfaceSamples.map((xKm, index) => (
      `${index ? 'L' : 'M'} ${sx(xKm).toFixed(2)} ${surfaceYFor(xKm).toFixed(2)}`
    )).join(' ');
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Equal-distance bumpy surface clutter points and one physically fixed subsurface target" data-target-y="${targetY}" data-target-depth-km="${model.targetDepthKm}">`;
    svg += `<line class="geometry-surface" x1="${left}" y1="${surfaceY}" x2="${width - right}" y2="${surfaceY}"></line>`;
    svg += `<path class="geometry-bumpy-surface" d="${surfacePath}"></path>`;
    svg += `<line class="geometry-depth-guide" x1="${targetX}" y1="${surfaceY}" x2="${targetX}" y2="${targetY}"></line>`;
    svg += `<line class="geometry-target-ray" x1="${aircraftX}" y1="${aircraftY + 10}" x2="${targetX}" y2="${targetY - 10}"></line>`;
    state.overlappingPoints.forEach((point) => {
      svg += `<line class="multi-clutter-ray" x1="${aircraftX}" y1="${aircraftY + 10}" x2="${sx(point.xKm)}" y2="${surfaceYFor(point.xKm) - 7}"></line>`;
    });
    svg += `<g class="geometry-plane" transform="translate(${aircraftX} ${aircraftY})">
        <path class="geometry-plane-wing" d="M -3 -5 L 9 -25 L 15 -23 L 8 -4 Z"></path>
        <path class="geometry-plane-wing" d="M -3 5 L 9 25 L 15 23 L 8 4 Z"></path>
        <path class="geometry-plane-tail" d="M -15 -4 L -25 -15 L -20 -2 Z"></path>
        <path class="geometry-plane-tail" d="M -15 4 L -25 15 L -20 2 Z"></path>
        <path class="geometry-plane-body" d="M -22 0 C -12 -8 8 -8 23 0 C 8 8 -12 8 -22 0 Z"></path>
        <circle class="geometry-plane-window" cx="10" cy="0" r="2.7"></circle>
      </g>`;
    svg += `<text class="geometry-title" x="${left}" y="${surfaceY - 23}">${fmt(multiClutterPointCount, 0)} equally spaced bumpy surface points across ${fmt(2 * model.spreadKm, 0)} km</text>`;
    svg += `<text class="geometry-title" x="${left}" y="${surfaceY + 178}">one fixed subsurface object</text>`;
    state.points.forEach((point) => {
      const css = point.overlapsTarget ? 'overlap' : point.index === nearest.index ? 'nearest' : '';
      const radius = point.overlapsTarget ? 7.4 : point.index === nearest.index ? 6.6 : 4.8;
      svg += `<circle class="multi-clutter-point ${css}" cx="${sx(point.xKm)}" cy="${surfaceYFor(point.xKm)}" r="${radius}"><title>Surface point ${point.index + 1}: x=${fmt(point.xKm, 1)} km, bump ${signed(point.elevationKm, 2)} km, power ${fmt(point.surfacePowerRatio, 2)}x target, alias ${signed(point.surfaceAliasHz, 1)} Hz, apparent depth ${fmt(point.surfaceApparentDepthKm, 2)} km</title></circle>`;
    });
    svg += `<rect class="geometry-target ${state.targetState.overlapsSurface ? 'overlap' : ''}" x="${targetX - 8}" y="${targetY - 8}" width="16" height="16" transform="rotate(45 ${targetX} ${targetY})"><title>One fixed subsurface target: physical depth ${fmt(model.targetDepthKm, 2)} km; current apparent echo ${fmt(state.targetState.targetApparentDepthKm, 2)} km</title></rect>`;
    svg += `<line class="geometry-fold-line" x1="${left}" y1="${nearestDepthY}" x2="${width - right}" y2="${nearestDepthY}"></line>`;
    svg += `<text class="${labelClass}" x="${left}" y="20">${fmt(state.overlappingPoints.length, 0)} / ${fmt(multiClutterPointCount, 0)} bumpy surface returns alias into the one target cell</text>`;
    svg += `<text class="geometry-value" x="${left}" y="38">nearest surface x=${fmt(nearest.xKm, 1)} km, bump ${signed(nearest.elevationKm, 2)} km, df ${fmt(nearest.dopplerDeltaHz, 1)} Hz, ddepth ${fmt(nearest.depthDeltaKm, 2)} km</text>`;
    svg += `<text class="geometry-label" x="${targetX + 14}" y="${targetY + 31}">single subsurface object</text>`;
    svg += '</svg>';
    multiClutterGeometryPlot.innerHTML = svg;
  }

  function renderMultiClutterDoppler(state) {
    if (!multiClutterDopplerPlot) return;
    const width = 560;
    const height = 350;
    const margin = { left: 68, right: 28, top: 48, bottom: 48 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const prf = state.effectivePrfHz;
    const targetState = state.targetState;
    const depthMinKm = Math.floor(Math.min(
      0,
      targetState.targetApparentDepthKm,
      ...state.points.map((point) => point.surfaceApparentDepthKm)
    ) * 10) / 10;
    const depthMaxKm = Math.ceil(Math.max(
      12,
      targetState.targetApparentDepthKm + 1,
      ...state.points.map((point) => point.surfaceApparentDepthKm)
    ));
    const sx = (value) => margin.left + ((value + prf / 2) / prf) * plotWidth;
    const sy = (value) => margin.top + ((value - depthMinKm) / (depthMaxKm - depthMinKm)) * plotHeight;
    const nearest = state.overlappingPoints[0] || state.nearestPoint;
    const stackForPoint = (point) => plotStack(
      state.points,
      point,
      (entry) => sx(entry.surfaceAliasHz),
      (entry) => sy(entry.surfaceApparentDepthKm),
      1.4,
      5.8
    );
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Equal-distance bumpy surface clutter points plotted by folded Doppler and apparent depth">`;
    [-prf / 2, -prf / 4, 0, prf / 4, prf / 2].forEach((value) => {
      const x = sx(value);
      svg += `<line class="check-grid-line" x1="${x}" y1="${margin.top}" x2="${x}" y2="${height - margin.bottom}"></line>`;
      svg += `<text class="check-label" x="${x}" y="${height - margin.bottom + 17}" text-anchor="middle">${signed(value, 0)}</text>`;
    });
    Array.from({ length: 5 }, (_, index) => depthMinKm + (index * (depthMaxKm - depthMinKm)) / 4).forEach((value) => {
      const y = sy(value);
      svg += `<line class="check-grid-line" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line>`;
      svg += `<text class="check-label" x="${margin.left - 9}" y="${y + 4}" text-anchor="end">${fmt(value, 1)}</text>`;
    });
    const targetTop = sy(targetState.targetApparentDepthKm - model.depthToleranceKm);
    const targetBottom = sy(targetState.targetApparentDepthKm + model.depthToleranceKm);
    periodicIntervalSegments(targetState.targetAliasHz, model.dopplerToleranceHz, prf).forEach(([startHz, endHz]) => {
      svg += `<rect class="check-target-window ${targetState.overlapsSurface ? 'overlap' : ''}" x="${sx(startHz)}" y="${targetTop}" width="${Math.max(2, sx(endHz) - sx(startHz))}" height="${Math.max(2, targetBottom - targetTop)}"></rect>`;
    });
    svg += `<line class="check-target-line" x1="${sx(targetState.targetAliasHz)}" y1="${margin.top}" x2="${sx(targetState.targetAliasHz)}" y2="${height - margin.bottom}"></line>`;
    svg += `<line class="check-target-line" x1="${margin.left}" y1="${sy(targetState.targetApparentDepthKm)}" x2="${width - margin.right}" y2="${sy(targetState.targetApparentDepthKm)}"></line>`;
    state.points.forEach((point) => {
      const css = point.overlapsTarget ? 'overlap' : point.index === nearest.index ? 'nearest' : '';
      const radius = point.overlapsTarget ? 5.6 : point.index === nearest.index ? 5 : 3.5;
      const stack = stackForPoint(point);
      svg += `<circle class="multi-clutter-point ${css}" cx="${sx(point.surfaceAliasHz) + stack.x}" cy="${sy(point.surfaceApparentDepthKm) + stack.y}" r="${radius}"><title>Surface point ${point.index + 1}: alias ${signed(point.surfaceAliasHz, 1)} Hz, apparent depth ${fmt(point.surfaceApparentDepthKm, 2)} km, bump ${signed(point.elevationKm, 2)} km, power ${fmt(point.surfacePowerRatio, 2)}x target</title></circle>`;
      if (stack.count > 1 && stack.index === 0) {
        svg += `<text class="check-stack-label" x="${sx(point.surfaceAliasHz) + 11}" y="${sy(point.surfaceApparentDepthKm) - 10}">${fmt(stack.count, 0)} stacked</text>`;
      }
    });
    svg += `<rect class="check-target-center" x="${sx(targetState.targetAliasHz) - 5}" y="${sy(targetState.targetApparentDepthKm) - 5}" width="10" height="10" transform="rotate(45 ${sx(targetState.targetAliasHz)} ${sy(targetState.targetApparentDepthKm)})"><title>One subsurface target cell</title></rect>`;
    svg += `<text class="${state.overlappingPoints.length ? 'check-danger' : 'check-title'}" x="${margin.left}" y="18">${fmt(state.overlappingPoints.length, 0)} bumpy surface point${state.overlappingPoints.length === 1 ? '' : 's'} folding into one subsurface object</text>`;
    svg += `<text class="check-title" x="${margin.left}" y="36">nearest surface alias ${signed(nearest.surfaceAliasHz, 1)} Hz; target alias ${signed(targetState.targetAliasHz, 1)} Hz</text>`;
    svg += `<line class="check-axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>`;
    svg += `<line class="check-axis" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"></line>`;
    svg += `<text class="check-title" x="${margin.left + plotWidth / 2}" y="${height - 7}" text-anchor="middle">aliased Doppler (Hz)</text>`;
    svg += `<text class="check-title" transform="translate(17 ${margin.top + plotHeight / 2}) rotate(-90)" text-anchor="middle">apparent depth (km)</text>`;
    svg += '</svg>';
    multiClutterDopplerPlot.innerHTML = svg;
  }

  function renderMultiClutterSweep(effectivePrfHz) {
    if (!usesMultiClutterState) return null;
    const state = multiClutterState(effectivePrfHz);
    if (multiClutterCountOutput) multiClutterCountOutput.textContent = fmt(multiClutterPointCount, 0);
    if (bumpHeightOutput) bumpHeightOutput.textContent = `${fmt(model.bumpHeightKm, 1)} km`;
    if (multiClutterStatus) {
      const nearest = state.overlappingPoints[0] || state.nearestPoint;
      const overlapPowers = state.overlappingPoints
        .map((point) => point.surfacePowerRatio)
        .filter(Number.isFinite)
        .sort((a, b) => a - b);
      const powerRange = overlapPowers.length > 1
        ? ` Relative bump powers span ${fmt(overlapPowers[0], 2)}-${fmt(overlapPowers[overlapPowers.length - 1], 2)}x target.`
        : overlapPowers.length === 1
        ? ` Relative bump power is ${fmt(overlapPowers[0], 2)}x target.`
        : '';
      multiClutterStatus.className = `multi-clutter-status${state.overlappingPoints.length ? ' is-overlap' : ''}`;
      multiClutterStatus.textContent = state.overlappingPoints.length
        ? `${fmt(state.overlappingPoints.length, 0)} bumpy surface point${state.overlappingPoints.length === 1 ? '' : 's'} alias into the one subsurface object at ${fmt(flyby.timeS, 1)} s.${powerRange}`
        : `No bumpy surface point is in the one target cell at ${fmt(flyby.timeS, 1)} s; nearest is ${fmt(nearest.dopplerDeltaHz, 1)} Hz and ${fmt(nearest.depthDeltaKm, 2)} km away.`;
    }
    renderMultiClutterGeometry(state);
    renderMultiClutterDoppler(state);
    return state;
  }

  function phaseSolutionState(state) {
    if (!state) return null;
    const targetPhaseRad = phaseWrap(4 * Math.PI * state.targetState.targetRangeKm * 1000 / wavelengthM);
    const dopplerSigmaHz = Math.max(model.dopplerToleranceHz, 1e-6);
    const depthSigmaKm = Math.max(model.depthToleranceKm, 1e-6);
    const points = state.points.map((point) => {
      const absolutePhaseRad = phaseWrap(4 * Math.PI * point.surfaceRangeKm * 1000 / wavelengthM);
      const relativePhaseRad = phaseWrap(absolutePhaseRad - targetPhaseRad);
      const cellWeight = Math.exp(-0.5 * (
        (point.dopplerDeltaHz / dopplerSigmaHz) ** 2 +
        (point.depthDeltaKm / depthSigmaKm) ** 2
      ));
      const surfaceAmplitudeRatio = Number.isFinite(point.surfaceAmplitudeRatio)
        ? point.surfaceAmplitudeRatio
        : 1;
      const surfacePowerRatio = Number.isFinite(point.surfacePowerRatio)
        ? point.surfacePowerRatio
        : surfaceAmplitudeRatio ** 2;
      const cellAmplitude = cellWeight * surfaceAmplitudeRatio;
      const cellPower = cellAmplitude ** 2;
      return {
        ...point,
        phaseRad: relativePhaseRad,
        phaseDeg: phaseDeg(relativePhaseRad),
        cellWeight,
        surfacePowerRatio,
        surfaceAmplitudeRatio,
        cellAmplitude,
        cellPower,
        coherentRe: cellAmplitude * Math.cos(relativePhaseRad),
        coherentIm: cellAmplitude * Math.sin(relativePhaseRad)
      };
    });
    const overlappingPoints = points.filter((point) => point.overlapsTarget);
    const surfaceSum = points.reduce((sum, point) => ({
      re: sum.re + point.coherentRe,
      im: sum.im + point.coherentIm
    }), { re: 0, im: 0 });
    const incoherentSurfacePower = points.reduce((sum, point) => sum + point.cellPower, 0);
    const combined = {
      re: 1 + surfaceSum.re,
      im: surfaceSum.im
    };
    const vectorInfo = (vector) => {
      const magnitude = Math.hypot(vector.re, vector.im);
      return {
        ...vector,
        magnitude,
        phaseRad: magnitude < 1e-6 ? 0 : phaseWrap(Math.atan2(vector.im, vector.re))
      };
    };
    const targetVector = vectorInfo({ re: 1, im: 0 });
    const surfaceVector = vectorInfo(surfaceSum);
    const combinedVector = vectorInfo(combined);
    const residualVector = vectorInfo({
      re: combined.re - surfaceSum.re,
      im: combined.im - surfaceSum.im
    });
    const targetPower = targetVector.magnitude ** 2;
    const coherentSurfacePower = surfaceVector.magnitude ** 2;
    const surfaceCrossPower = coherentSurfacePower - incoherentSurfacePower;
    const targetSurfaceInterferencePower = 2 * (
      targetVector.re * surfaceVector.re + targetVector.im * surfaceVector.im
    );
    const observedPower = combinedVector.magnitude ** 2;
    const interferencePower = targetSurfaceInterferencePower + surfaceCrossPower;
    const residualPower = residualVector.magnitude ** 2;
    return {
      ...state,
      points,
      overlappingPoints,
      targetPhaseRad,
      targetVector,
      surfaceVector,
      combinedVector,
      residualVector,
      targetPower,
      surfacePower: incoherentSurfacePower,
      incoherentSurfacePower,
      coherentSurfacePower,
      surfaceCrossPower,
      targetSurfaceInterferencePower,
      interferencePower,
      observedPower,
      residualPower,
      powerOnlyResidual: observedPower - incoherentSurfacePower,
      removedPower: observedPower - residualPower,
      powerClosureError: observedPower - (targetPower + incoherentSurfacePower + interferencePower)
    };
  }

  function renderPhaseGeometry(solution) {
    if (!phaseGeometryPlot || !solution) return;
    const width = 560;
    const height = 350;
    const left = 62;
    const right = 32;
    const surfaceY = 138;
    const aircraftY = 76;
    const depthMaxKm = Math.max(
      12,
      currentFastTimeDepthMaxKm(),
      solution.targetState.targetApparentDepthKm + 1,
      model.targetDepthKm + 1,
      ...solution.points.map((point) => point.surfaceApparentDepthKm + 1)
    );
    const furthestPointKm = Math.max(
      ...solution.points.map((point) => Math.abs(point.xKm)),
      Math.abs(solution.planeXKm),
      Math.abs(solution.targetState.xKm)
    );
    const geometryHalfWidthKm = Math.ceil(Math.max(model.spreadKm, flybyHalfDistanceKm(), furthestPointKm) / 10) * 10;
    const sx = (xKm) => left + ((xKm + geometryHalfWidthKm) / (2 * geometryHalfWidthKm)) * (width - left - right);
    const surfaceYFor = (xKm) => surfaceY - surfaceBumpElevationKm(xKm) * 9;
    const depthToY = (depthKm) => surfaceY + (depthKm / depthMaxKm) * 160;
    const targetX = sx(solution.targetState.xKm);
    const targetY = depthToY(model.targetDepthKm);
    const aircraftX = sx(solution.planeXKm);
    const surfaceSamples = Array.from({ length: 161 }, (_, index) => -geometryHalfWidthKm + (2 * geometryHalfWidthKm * index) / 160);
    const surfacePath = surfaceSamples.map((xKm, index) => (
      `${index ? 'L' : 'M'} ${sx(xKm).toFixed(2)} ${surfaceYFor(xKm).toFixed(2)}`
    )).join(' ');
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Bumpy surface points colored by two-way phase relative to the subsurface target">`;
    svg += `<line class="geometry-surface" x1="${left}" y1="${surfaceY}" x2="${width - right}" y2="${surfaceY}"></line>`;
    svg += `<path class="geometry-bumpy-surface" d="${surfacePath}"></path>`;
    svg += `<line class="geometry-target-ray" x1="${aircraftX}" y1="${aircraftY + 10}" x2="${targetX}" y2="${targetY - 10}"></line>`;
    solution.overlappingPoints.forEach((point) => {
      svg += `<line class="multi-clutter-ray" x1="${aircraftX}" y1="${aircraftY + 10}" x2="${sx(point.xKm)}" y2="${surfaceYFor(point.xKm) - 7}"></line>`;
    });
    svg += `<g class="geometry-plane" transform="translate(${aircraftX} ${aircraftY})">
        <path class="geometry-plane-wing" d="M -3 -5 L 9 -25 L 15 -23 L 8 -4 Z"></path>
        <path class="geometry-plane-wing" d="M -3 5 L 9 25 L 15 23 L 8 4 Z"></path>
        <path class="geometry-plane-tail" d="M -15 -4 L -25 -15 L -20 -2 Z"></path>
        <path class="geometry-plane-tail" d="M -15 4 L -25 15 L -20 2 Z"></path>
        <path class="geometry-plane-body" d="M -22 0 C -12 -8 8 -8 23 0 C 8 8 -12 8 -22 0 Z"></path>
        <circle class="geometry-plane-window" cx="10" cy="0" r="2.7"></circle>
      </g>`;
    solution.points.forEach((point) => {
      const amplitude = Math.min(1.8, point.cellAmplitude);
      const radius = point.overlapsTarget ? 5.2 + 3.4 * Math.sqrt(amplitude / 1.8) : 4.3 + 3.8 * Math.sqrt(Math.min(1, point.cellWeight));
      const css = point.overlapsTarget ? 'overlap' : point.cellPower > 0.12 ? 'weighted' : '';
      svg += `<circle class="phase-surface-point ${css}" cx="${sx(point.xKm)}" cy="${surfaceYFor(point.xKm)}" r="${radius}" style="fill:${phaseColor(point.phaseRad)}"><title>Surface point ${point.index + 1}: phase ${signed(point.phaseDeg, 0)} deg, cell response ${fmt(point.cellWeight, 2)}, bump power ${fmt(point.surfacePowerRatio, 2)}x target, cell power ${fmt(point.cellPower, 2)}x, alias ${signed(point.surfaceAliasHz, 1)} Hz</title></circle>`;
    });
    svg += `<rect class="geometry-target ${solution.targetState.overlapsSurface ? 'overlap' : ''}" x="${targetX - 8}" y="${targetY - 8}" width="16" height="16" transform="rotate(45 ${targetX} ${targetY})"><title>Target phase reference: 0 deg</title></rect>`;
    svg += `<text class="geometry-title" x="${left}" y="20">color = phase relative to target echo</text>`;
    svg += `<text class="geometry-value" x="${left}" y="38">${fmt(solution.points.length, 0)} surface returns, ${fmt(solution.overlappingPoints.length, 0)} in the target cell</text>`;
    svg += `<text class="geometry-label" x="${targetX + 14}" y="${targetY + 31}">target phase 0 deg</text>`;
    svg += '</svg>';
    phaseGeometryPlot.innerHTML = svg;
  }

  function renderPhaseCell(solution) {
    if (!phaseCellPlot || !solution) return;
    const width = 560;
    const height = 350;
    const margin = { left: 68, right: 28, top: 48, bottom: 48 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const prf = solution.effectivePrfHz;
    const targetState = solution.targetState;
    const relativeDopplerHz = (valueHz) => alias(valueHz - targetState.targetAliasHz, prf);
    const depthMinKm = Math.floor(Math.min(
      0,
      targetState.targetApparentDepthKm,
      ...solution.points.map((point) => point.surfaceApparentDepthKm)
    ) * 10) / 10;
    const depthMaxKm = Math.ceil(Math.max(
      12,
      targetState.targetApparentDepthKm + 1,
      ...solution.points.map((point) => point.surfaceApparentDepthKm)
    ));
    const sx = (value) => margin.left + ((value + prf / 2) / prf) * plotWidth;
    const sy = (value) => margin.top + ((value - depthMinKm) / (depthMaxKm - depthMinKm)) * plotHeight;
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Folded Doppler and apparent depth cell with surface points colored by phase">`;
    [-prf / 2, -prf / 4, 0, prf / 4, prf / 2].forEach((value) => {
      const x = sx(value);
      svg += `<line class="check-grid-line" x1="${x}" y1="${margin.top}" x2="${x}" y2="${height - margin.bottom}"></line>`;
      svg += `<text class="check-label" x="${x}" y="${height - margin.bottom + 17}" text-anchor="middle">${signed(value, 0)}</text>`;
    });
    Array.from({ length: 5 }, (_, index) => depthMinKm + (index * (depthMaxKm - depthMinKm)) / 4).forEach((value) => {
      const y = sy(value);
      svg += `<line class="check-grid-line" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line>`;
      svg += `<text class="check-label" x="${margin.left - 9}" y="${y + 4}" text-anchor="end">${fmt(value, 1)}</text>`;
    });
    periodicIntervalSegments(0, model.dopplerToleranceHz, prf).forEach(([startHz, endHz]) => {
      svg += `<rect class="check-target-window ${targetState.overlapsSurface ? 'overlap' : ''}" x="${sx(startHz)}" y="${sy(targetState.targetApparentDepthKm - model.depthToleranceKm)}" width="${Math.max(2, sx(endHz) - sx(startHz))}" height="${Math.max(2, sy(targetState.targetApparentDepthKm + model.depthToleranceKm) - sy(targetState.targetApparentDepthKm - model.depthToleranceKm))}"></rect>`;
    });
    svg += `<line class="check-target-line" x1="${sx(0)}" y1="${margin.top}" x2="${sx(0)}" y2="${height - margin.bottom}"></line>`;
    svg += `<line class="check-target-line" x1="${margin.left}" y1="${sy(targetState.targetApparentDepthKm)}" x2="${width - margin.right}" y2="${sy(targetState.targetApparentDepthKm)}"></line>`;
    solution.points.forEach((point) => {
      const x = sx(relativeDopplerHz(point.surfaceAliasHz));
      const y = sy(point.surfaceApparentDepthKm);
      const radius = 3 + 6 * Math.sqrt(Math.min(1.8, point.cellPower) / 1.8);
      const css = point.overlapsTarget ? 'overlap' : point.cellPower > 0.12 ? 'weighted' : '';
      svg += `<circle class="phase-cell-point ${css}" cx="${x}" cy="${y}" r="${radius}" style="fill:${phaseColor(point.phaseRad)}"><title>Surface point ${point.index + 1}: phase ${signed(point.phaseDeg, 0)} deg, cell response ${fmt(point.cellWeight, 2)}, bump power ${fmt(point.surfacePowerRatio, 2)}x target, cell power ${fmt(point.cellPower, 2)}x, relative Doppler ${signed(relativeDopplerHz(point.surfaceAliasHz), 1)} Hz</title></circle>`;
    });
    svg += `<rect class="check-target-center" x="${sx(0) - 5}" y="${sy(targetState.targetApparentDepthKm) - 5}" width="10" height="10" transform="rotate(45 ${sx(0)} ${sy(targetState.targetApparentDepthKm)})"><title>Target phase reference: 0 deg</title></rect>`;
    svg += `<text class="check-title" x="${margin.left}" y="18">dot color = wrapped carrier phase, dot size = weighted bump power</text>`;
    svg += `<text class="${solution.overlappingPoints.length ? 'check-danger' : 'check-title'}" x="${margin.left}" y="36">${fmt(solution.overlappingPoints.length, 0)} phase-weighted surface return${solution.overlappingPoints.length === 1 ? '' : 's'} in the target cell</text>`;
    svg += `<line class="check-axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>`;
    svg += `<line class="check-axis" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"></line>`;
    svg += `<text class="check-title" x="${margin.left + plotWidth / 2}" y="${height - 7}" text-anchor="middle">folded Doppler relative to target (Hz)</text>`;
    svg += `<text class="check-title" transform="translate(17 ${margin.top + plotHeight / 2}) rotate(-90)" text-anchor="middle">apparent depth / fast time (km)</text>`;
    svg += '</svg>';
    phaseCellPlot.innerHTML = svg;
  }

  function renderPhasePhasor(solution) {
    if (!phasePhasorPlot || !solution) return;
    const width = 900;
    const height = 315;
    const centerX = 180;
    const centerY = 158;
    const circleRadius = 96;
    const maxMagnitude = Math.max(1, solution.surfaceVector.magnitude, solution.combinedVector.magnitude);
    const vectorScale = circleRadius * 0.82 / maxMagnitude;
    const endpoint = (vector) => ({
      x: centerX + vector.re * vectorScale,
      y: centerY - vector.im * vectorScale
    });
    const targetEnd = endpoint(solution.targetVector);
    const surfaceEnd = endpoint(solution.surfaceVector);
    const combinedEnd = endpoint(solution.combinedVector);
    const barX = 410;
    const barWidth = 330;
    const barScale = barWidth / Math.max(1, solution.combinedVector.magnitude, solution.surfaceVector.magnitude);
    const barRows = [
      { label: 'target', vector: solution.targetVector, css: 'target' },
      { label: 'surface sum', vector: solution.surfaceVector, css: 'surface' },
      { label: 'target + surface', vector: solution.combinedVector, css: 'combined' }
    ];
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Coherent phase sum of the target and weighted bumpy surface clutter returns">
      <defs>
        <marker id="phase-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" class="phase-arrow-head"></path></marker>
      </defs>`;
    svg += `<circle class="phase-unit-circle" cx="${centerX}" cy="${centerY}" r="${circleRadius}"></circle>`;
    svg += `<line class="phase-axis-line" x1="${centerX - circleRadius - 12}" y1="${centerY}" x2="${centerX + circleRadius + 12}" y2="${centerY}"></line>`;
    svg += `<line class="phase-axis-line" x1="${centerX}" y1="${centerY - circleRadius - 12}" x2="${centerX}" y2="${centerY + circleRadius + 12}"></line>`;
    svg += `<text class="phase-label" x="${centerX + circleRadius + 18}" y="${centerY + 4}">0 deg</text>`;
    svg += `<text class="phase-label" x="${centerX - 6}" y="${centerY - circleRadius - 18}" text-anchor="end">+90</text>`;
    solution.points.forEach((point) => {
      if (point.cellAmplitude < 0.02) return;
      const end = endpoint({ re: point.coherentRe, im: point.coherentIm });
      const css = point.overlapsTarget ? 'overlap' : 'surface';
      const strokeWidth = 1 + 3 * Math.sqrt(Math.min(1.8, point.cellPower) / 1.8);
      svg += `<line class="phase-vector ${css}" x1="${centerX}" y1="${centerY}" x2="${end.x}" y2="${end.y}" style="stroke:${phaseColor(point.phaseRad)};stroke-width:${strokeWidth.toFixed(2)}"><title>Surface point ${point.index + 1}: phase ${signed(point.phaseDeg, 0)} deg, bump power ${fmt(point.surfacePowerRatio, 2)}x target, cell amplitude ${fmt(point.cellAmplitude, 2)}</title></line>`;
      svg += `<circle class="phase-vector-tip ${css}" cx="${end.x}" cy="${end.y}" r="${2.5 + 2.5 * Math.sqrt(Math.min(1.8, point.cellPower) / 1.8)}" style="fill:${phaseColor(point.phaseRad)}"></circle>`;
    });
    svg += `<line class="phase-vector target" x1="${centerX}" y1="${centerY}" x2="${targetEnd.x}" y2="${targetEnd.y}" marker-end="url(#phase-arrow)"></line>`;
    svg += `<line class="phase-vector sum" x1="${centerX}" y1="${centerY}" x2="${surfaceEnd.x}" y2="${surfaceEnd.y}" marker-end="url(#phase-arrow)"></line>`;
    svg += `<line class="phase-vector combined" x1="${centerX}" y1="${centerY}" x2="${combinedEnd.x}" y2="${combinedEnd.y}" marker-end="url(#phase-arrow)"></line>`;
    svg += `<text class="phase-title" x="38" y="22">coherent vector plane</text>`;
    svg += `<text class="phase-note" x="38" y="40">${fmt(solution.overlappingPoints.length, 0)} target-cell surface phasor${solution.overlappingPoints.length === 1 ? '' : 's'} weighted by cell match and bump power</text>`;
    barRows.forEach((row, index) => {
      const y = 84 + index * 58;
      const length = Math.max(1, row.vector.magnitude * barScale);
      svg += `<text class="phase-title" x="${barX}" y="${y - 10}">${row.label}</text>`;
      svg += `<rect class="phase-bar-track" x="${barX}" y="${y}" width="${barWidth}" height="12"></rect>`;
      svg += `<rect class="phase-bar ${row.css}" x="${barX}" y="${y}" width="${length}" height="12"></rect>`;
      svg += `<text class="phase-note" x="${barX + barWidth + 16}" y="${y + 10}">${fmt(row.vector.magnitude, 2)} at ${signed(phaseDeg(row.vector.phaseRad), 0)} deg</text>`;
    });
    svg += `<text class="phase-title" x="${barX}" y="260">cell equation</text>`;
    svg += `<text class="phase-note" x="${barX}" y="280">target vector + weighted surface vectors = coherent return in the target cell</text>`;
    svg += '</svg>';
    phasePhasorPlot.innerHTML = svg;
  }

  function renderPhasePower(solution) {
    if (!phasePowerPlot || !solution) return;
    const width = 900;
    const height = 430;
    const left = 78;
    const right = 36;
    const plotWidth = width - left - right;
    const zeroX = left + plotWidth * 0.28;
    const maxPositivePower = Math.max(
      1,
      solution.targetPower,
      solution.surfacePower,
      solution.incoherentSurfacePower,
      solution.coherentSurfacePower,
      solution.observedPower,
      solution.residualPower,
      solution.interferencePower,
      solution.removedPower
    );
    const maxNegativePower = Math.max(0, -solution.interferencePower, -solution.removedPower);
    const axisMagnitude = Math.max(maxPositivePower, maxNegativePower * 2.4, 1);
    const positiveWidth = width - right - 64 - zeroX;
    const negativeWidth = zeroX - left;
    const sx = (value) => value >= 0
      ? zeroX + (value / axisMagnitude) * positiveWidth
      : zeroX + (value / axisMagnitude) * negativeWidth;
    const powerRows = [
      { label: 'target self-power', value: solution.targetPower, css: 'target' },
      { label: 'summed bump power', value: solution.incoherentSurfacePower, css: 'surface' },
      { label: 'phase cross-terms', value: solution.interferencePower, css: 'interference' },
      { label: 'observed overlap', value: solution.observedPower, css: 'observed' }
    ];
    const rowStartY = 78;
    const rowGap = 46;
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Power budget before and after coherent phase subtraction of surface clutter"
      data-target-power="${solution.targetPower}"
      data-surface-power="${solution.incoherentSurfacePower}"
      data-coherent-surface-power="${solution.coherentSurfacePower}"
      data-surface-cross-power="${solution.surfaceCrossPower}"
      data-target-surface-interference-power="${solution.targetSurfaceInterferencePower}"
      data-interference-power="${solution.interferencePower}"
      data-observed-power="${solution.observedPower}"
      data-power-only-residual="${solution.powerOnlyResidual}"
      data-residual-power="${solution.residualPower}"
      data-power-closure-error="${solution.powerClosureError}">`;
    svg += `<text class="phase-title" x="${left}" y="22">power in the target Doppler/depth cell, normalized to target-only power</text>`;
    svg += `<text class="phase-note" x="${left}" y="41">observed = target power + individual bump powers + coherent phase cross-terms</text>`;
    svg += `<line class="phase-power-zero" x1="${zeroX}" y1="56" x2="${zeroX}" y2="${rowStartY + (powerRows.length - 1) * rowGap + 17}"></line>`;
    svg += `<text class="phase-label" x="${zeroX}" y="69" text-anchor="middle">0</text>`;
    powerRows.forEach((row, index) => {
      const y = rowStartY + index * rowGap;
      const endX = sx(row.value);
      const barX = Math.min(zeroX, endX);
      const barWidth = Math.max(1, Math.abs(endX - zeroX));
      const valueAnchor = row.value >= 0 ? 'start' : 'end';
      const valueX = row.value >= 0 ? endX + 9 : endX - 9;
      svg += `<text class="phase-title" x="${left}" y="${y - 8}">${row.label}</text>`;
      svg += `<rect class="phase-power-bar ${row.css}" x="${barX}" y="${y}" width="${barWidth}" height="15"></rect>`;
      svg += `<text class="phase-note" x="${valueX}" y="${y + 12}" text-anchor="${valueAnchor}">${signed(row.value, 2)} x</text>`;
    });

    const dividerY = 270;
    const comparisonTop = 300;
    const comparisonSplitX = width / 2;
    svg += `<line class="phase-power-divider" x1="${left}" y1="${dividerY}" x2="${width - right}" y2="${dividerY}"></line>`;
    svg += `<line class="phase-power-comparison-line" x1="${comparisonSplitX}" y1="${comparisonTop - 13}" x2="${comparisonSplitX}" y2="${height - 22}"></line>`;
    svg += `<text class="phase-title" x="${left}" y="${comparisonTop}">power-only subtraction</text>`;
    svg += `<text class="phase-note" x="${left}" y="${comparisonTop + 23}">observed power - summed bump powers</text>`;
    svg += `<text class="phase-power-comparison-value warning" x="${left}" y="${comparisonTop + 58}">${fmt(solution.observedPower, 2)} - ${fmt(solution.incoherentSurfacePower, 2)} = ${fmt(solution.powerOnlyResidual, 2)} x</text>`;
    svg += `<text class="phase-note" x="${left}" y="${comparisonTop + 83}">wrong by ${signed(solution.powerOnlyResidual - solution.targetPower, 2)} x because phase interference remains</text>`;
    svg += `<text class="phase-title" x="${comparisonSplitX + 34}" y="${comparisonTop}">phase-aware subtraction</text>`;
    svg += `<text class="phase-note" x="${comparisonSplitX + 34}" y="${comparisonTop + 23}">|observed phasor - surface phasor| squared</text>`;
    svg += `<text class="phase-power-comparison-value success" x="${comparisonSplitX + 34}" y="${comparisonTop + 58}">${fmt(solution.residualPower, 2)} x</text>`;
    svg += `<text class="phase-note" x="${comparisonSplitX + 34}" y="${comparisonTop + 83}">target-only power recovered</text>`;
    svg += '</svg>';
    phasePowerPlot.innerHTML = svg;
  }

  function renderPhaseSweep(solution) {
    if (!phaseSweepPlot || !solution) return;
    const width = 900;
    const height = 380;
    const margin = { left: 72, right: 28, top: 68, bottom: 52 };
    const sampleCount = 61;
    const samples = Array.from({ length: sampleCount }, (_, index) => {
      const timeS = (flyby.durationS * index) / (sampleCount - 1);
      const sampleSolution = phaseSolutionState(multiClutterStateAt(timeS, solution.effectivePrfHz));
      return {
        timeS,
        observedPower: sampleSolution.observedPower,
        powerOnlyResidual: sampleSolution.powerOnlyResidual,
        coherentResidual: sampleSolution.residualPower,
        overlapCount: sampleSolution.overlappingPoints.length
      };
    });
    const minPower = Math.min(0, ...samples.map((sample) => sample.powerOnlyResidual));
    const maxPower = Math.max(1, ...samples.flatMap((sample) => [sample.observedPower, sample.powerOnlyResidual]));
    const padding = Math.max(0.35, (maxPower - minPower) * 0.08);
    const yMin = Math.floor((minPower - padding) * 2) / 2;
    const yMax = Math.ceil((maxPower + padding) * 2) / 2;
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const sx = (timeS) => margin.left + (timeS / flyby.durationS) * plotWidth;
    const sy = (power) => margin.top + ((yMax - power) / (yMax - yMin)) * plotHeight;
    const pathFor = (key) => samples.map((sample, index) => (
      `${index ? 'L' : 'M'} ${sx(sample.timeS).toFixed(2)} ${sy(sample[key]).toFixed(2)}`
    )).join(' ');
    const currentSample = {
      timeS: flyby.timeS,
      observedPower: solution.observedPower,
      powerOnlyResidual: solution.powerOnlyResidual,
      coherentResidual: solution.residualPower
    };
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Observed, power-only residual, and phase-aware residual target-cell power across the full flyby"
      data-current-observed-power="${solution.observedPower}"
      data-current-power-only-residual="${solution.powerOnlyResidual}"
      data-current-coherent-residual="${solution.residualPower}">`;
    svg += `<line class="phase-sweep-observed" x1="${margin.left}" y1="18" x2="${margin.left + 26}" y2="18"></line>`;
    svg += `<text class="phase-note" x="${margin.left + 34}" y="22">observed cell power</text>`;
    svg += `<line class="phase-sweep-power-only" x1="${margin.left + 195}" y1="18" x2="${margin.left + 221}" y2="18"></line>`;
    svg += `<text class="phase-note" x="${margin.left + 229}" y="22">power-only subtraction</text>`;
    svg += `<line class="phase-sweep-coherent" x1="${margin.left + 410}" y1="18" x2="${margin.left + 436}" y2="18"></line>`;
    svg += `<text class="phase-note" x="${margin.left + 444}" y="22">phase-aware residual</text>`;
    svg += `<rect class="phase-sweep-overlap-band" x="${margin.left + 635}" y="10" width="20" height="12"></rect>`;
    svg += `<text class="phase-note" x="${margin.left + 663}" y="22">clutter in target cell</text>`;
    svg += `<text class="phase-title" x="${margin.left}" y="47">current ${fmt(flyby.timeS, 1)} s: power-only ${fmt(solution.powerOnlyResidual, 2)} x; phase-aware ${fmt(solution.residualPower, 2)} x</text>`;
    samples.forEach((sample, index) => {
      if (!sample.overlapCount) return;
      const halfStepS = flyby.durationS / (sampleCount - 1) / 2;
      const startS = Math.max(0, sample.timeS - halfStepS);
      const endS = Math.min(flyby.durationS, sample.timeS + halfStepS);
      svg += `<rect class="phase-sweep-overlap-band" x="${sx(startS)}" y="${margin.top}" width="${Math.max(1, sx(endS) - sx(startS))}" height="${plotHeight}"><title>${sample.overlapCount} clutter return${sample.overlapCount === 1 ? '' : 's'} in the target cell at ${fmt(sample.timeS, 1)} s</title></rect>`;
    });
    const yTicks = 5;
    Array.from({ length: yTicks }, (_, index) => yMin + (index * (yMax - yMin)) / (yTicks - 1)).forEach((value) => {
      const y = sy(value);
      svg += `<line class="check-grid-line" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line>`;
      svg += `<text class="check-label" x="${margin.left - 10}" y="${y + 4}" text-anchor="end">${fmt(value, 1)}</text>`;
    });
    [0, 3, 6, 9, 12].forEach((value) => {
      const x = sx(value);
      svg += `<line class="check-grid-line" x1="${x}" y1="${margin.top}" x2="${x}" y2="${height - margin.bottom}"></line>`;
      svg += `<text class="check-label" x="${x}" y="${height - margin.bottom + 18}" text-anchor="middle">${fmt(value, 0)}</text>`;
    });
    svg += `<path class="phase-sweep-observed" d="${pathFor('observedPower')}"><title>Observed target-cell power across the flyby</title></path>`;
    svg += `<path class="phase-sweep-power-only" d="${pathFor('powerOnlyResidual')}"><title>Residual after subtracting surface power without phase</title></path>`;
    svg += `<path class="phase-sweep-coherent" d="${pathFor('coherentResidual')}"><title>Residual after coherent surface phasor subtraction</title></path>`;
    const currentX = sx(currentSample.timeS);
    svg += `<line class="phase-sweep-current" x1="${currentX}" y1="${margin.top}" x2="${currentX}" y2="${height - margin.bottom}"></line>`;
    [
      { key: 'observedPower', css: 'observed' },
      { key: 'powerOnlyResidual', css: 'power-only' },
      { key: 'coherentResidual', css: 'coherent' }
    ].forEach((entry) => {
      svg += `<circle class="phase-sweep-marker ${entry.css}" cx="${currentX}" cy="${sy(currentSample[entry.key])}" r="5"></circle>`;
    });
    svg += `<line class="check-axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>`;
    svg += `<line class="check-axis" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"></line>`;
    svg += `<text class="phase-title" x="${margin.left + plotWidth / 2}" y="${height - 8}" text-anchor="middle">flyby time (s)</text>`;
    svg += `<text class="phase-title" transform="translate(18 ${margin.top + plotHeight / 2}) rotate(-90)" text-anchor="middle">normalized target-cell power</text>`;
    svg += '</svg>';
    phaseSweepPlot.innerHTML = svg;
  }

  function phaseVectorInfo(vector) {
    const magnitude = Math.hypot(vector.re, vector.im);
    return {
      ...vector,
      magnitude,
      phaseRad: magnitude < 1e-9 ? 0 : phaseWrap(Math.atan2(vector.im, vector.re)),
      power: magnitude ** 2
    };
  }

  function estimatedClutterVector(surfaceVector, phaseErrorDegValue, amplitudeErrorFractionValue) {
    const scale = Math.max(0, 1 + amplitudeErrorFractionValue);
    const angle = surfaceVector.phaseRad + phaseErrorDegValue * Math.PI / 180;
    return phaseVectorInfo({
      re: scale * surfaceVector.magnitude * Math.cos(angle),
      im: scale * surfaceVector.magnitude * Math.sin(angle)
    });
  }

  function representativeNoiseVector(noiseRms) {
    const angle = 35 * Math.PI / 180;
    return {
      re: noiseRms * Math.cos(angle),
      im: noiseRms * Math.sin(angle)
    };
  }

  function validationRecovery(solution, phaseErrorDegValue, amplitudeErrorFractionValue, noiseVector = { re: 0, im: 0 }) {
    const amplitudeScale = Math.max(0, 1 + amplitudeErrorFractionValue);
    const estimatedSurface = estimatedClutterVector(
      solution.surfaceVector,
      phaseErrorDegValue,
      amplitudeErrorFractionValue
    );
    const observed = phaseVectorInfo({
      re: solution.combinedVector.re + noiseVector.re,
      im: solution.combinedVector.im + noiseVector.im
    });
    const recovered = phaseVectorInfo({
      re: observed.re - estimatedSurface.re,
      im: observed.im - estimatedSurface.im
    });
    const recoveredWithoutTarget = phaseVectorInfo({
      re: solution.surfaceVector.re + noiseVector.re - estimatedSurface.re,
      im: solution.surfaceVector.im + noiseVector.im - estimatedSurface.im
    });
    const recoveryErrorVector = phaseVectorInfo({
      re: recovered.re - solution.targetVector.re,
      im: recovered.im - solution.targetVector.im
    });
    const estimatedSurfacePower = solution.incoherentSurfacePower * amplitudeScale ** 2;
    const powerOnlyResidual = observed.power - estimatedSurfacePower;
    return {
      solution,
      estimatedSurface,
      estimatedSurfacePower,
      observed,
      recovered,
      recoveredWithoutTarget,
      recoveryErrorVector,
      powerOnlyResidual,
      observedPowerError: Math.abs(observed.power - solution.targetPower),
      powerOnlyError: Math.abs(powerOnlyResidual - solution.targetPower),
      phaseAwarePowerError: Math.abs(recovered.power - solution.targetPower),
      targetAbsentError: recoveredWithoutTarget.power
    };
  }

  function renderCriticalWindow(solution) {
    if (!criticalWindowPlot || !solution) return;
    const width = 900;
    const height = 360;
    const margin = { left: 54, right: 24, top: 56, bottom: 58 };
    const panelGap = 24;
    const panelWidth = (width - margin.left - margin.right - panelGap * 2) / 3;
    const sampleRecoveries = phaseValidation.comparisonTimesS.map((timeS) => {
      const sample = phaseSolutionState(multiClutterStateAt(timeS, solution.effectivePrfHz));
      return {
        timeS,
        recovery: validationRecovery(
          sample,
          phaseValidation.phaseErrorDeg,
          phaseValidation.amplitudeErrorFraction,
          representativeNoiseVector(phaseValidation.noiseRms)
        )
      };
    });
    const maxValue = Math.max(5.5, ...sampleRecoveries.flatMap(({ recovery }) => [
      recovery.observed.power,
      recovery.powerOnlyResidual,
      recovery.recovered.power
    ]));
    const yTop = margin.top + 20;
    const yBottom = height - margin.bottom;
    const sy = (value) => yBottom - (Math.max(0, value) / maxValue) * (yBottom - yTop);
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Observed, power-only, and phase-aware target-cell power immediately before, during, and after the overlap">`;
    svg += `<text class="phase-title" x="${margin.left}" y="22">same axes in every panel; dashed line = target-only power 1.00 x</text>`;
    svg += `<text class="phase-note" x="${width - margin.right}" y="22" text-anchor="end">selected estimate bias plus one fixed noise realization</text>`;
    sampleRecoveries.forEach(({ timeS, recovery }, panelIndex) => {
      const panelX = margin.left + panelIndex * (panelWidth + panelGap);
      const isOverlap = recovery.solution.overlappingPoints.length > 0;
      const barData = [
        { label: 'observed', value: recovery.observed.power, css: 'observed' },
        { label: 'power only', value: recovery.powerOnlyResidual, css: 'power-only' },
        { label: 'phase aware', value: recovery.recovered.power, css: 'phase-aware' }
      ];
      svg += `<rect class="critical-panel-bg ${isOverlap ? 'overlap' : ''}" x="${panelX}" y="${margin.top}" width="${panelWidth}" height="${yBottom - margin.top}"></rect>`;
      svg += `<text class="critical-time" x="${panelX + panelWidth / 2}" y="${margin.top + 18}" text-anchor="middle">${fmt(timeS, 1)} s</text>`;
      svg += `<text class="${isOverlap ? 'check-danger' : 'phase-note'}" x="${panelX + panelWidth / 2}" y="${margin.top + 36}" text-anchor="middle">${isOverlap ? `${recovery.solution.overlappingPoints.length} clutter returns on target` : 'returns separated'}</text>`;
      const baselineY = sy(1);
      svg += `<line class="critical-target-line" x1="${panelX + 12}" y1="${baselineY}" x2="${panelX + panelWidth - 12}" y2="${baselineY}"></line>`;
      barData.forEach((bar, barIndex) => {
        const barWidth = 42;
        const barGap = 20;
        const totalWidth = barWidth * 3 + barGap * 2;
        const x = panelX + (panelWidth - totalWidth) / 2 + barIndex * (barWidth + barGap);
        const y = sy(bar.value);
        const visibleBottom = sy(0);
        svg += `<rect class="critical-bar ${bar.css}" x="${x}" y="${Math.min(y, visibleBottom)}" width="${barWidth}" height="${Math.max(2, Math.abs(visibleBottom - y))}"></rect>`;
        svg += `<text class="phase-note" x="${x + barWidth / 2}" y="${Math.max(margin.top + 58, y - 7)}" text-anchor="middle">${fmt(bar.value, 2)}</text>`;
        svg += `<text class="critical-bar-label" x="${x + barWidth / 2}" y="${yBottom + 19}" text-anchor="middle">${bar.label}</text>`;
      });
    });
    svg += `<text class="phase-title" transform="translate(16 ${(yTop + yBottom) / 2}) rotate(-90)" text-anchor="middle">normalized power</text>`;
    svg += '</svg>';
    criticalWindowPlot.innerHTML = svg;
  }

  function renderTruthEstimate(solution) {
    if (!truthEstimatePlot || !solution) return;
    const recovery = validationRecovery(
      solution,
      phaseValidation.phaseErrorDeg,
      phaseValidation.amplitudeErrorFraction,
      representativeNoiseVector(phaseValidation.noiseRms)
    );
    const width = 560;
    const height = 350;
    const centerX = 174;
    const centerY = 176;
    const radius = 106;
    const maxMagnitude = Math.max(1, recovery.solution.surfaceVector.magnitude, recovery.estimatedSurface.magnitude, recovery.recovered.magnitude);
    const scale = radius * 0.78 / maxMagnitude;
    const end = (vector) => ({ x: centerX + vector.re * scale, y: centerY - vector.im * scale });
    const trueEnd = end(recovery.solution.surfaceVector);
    const estimateEnd = end(recovery.estimatedSurface);
    const recoveredEnd = end(recovery.recovered);
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="True clutter phasor compared with the biased phase and amplitude estimate">
      <defs>
        <marker id="validation-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" class="phase-arrow-head"></path></marker>
      </defs>`;
    svg += `<circle class="phase-unit-circle" cx="${centerX}" cy="${centerY}" r="${radius}"></circle>`;
    svg += `<line class="phase-axis-line" x1="${centerX - radius - 10}" y1="${centerY}" x2="${centerX + radius + 10}" y2="${centerY}"></line>`;
    svg += `<line class="phase-axis-line" x1="${centerX}" y1="${centerY - radius - 10}" x2="${centerX}" y2="${centerY + radius + 10}"></line>`;
    svg += `<line class="validation-vector truth" x1="${centerX}" y1="${centerY}" x2="${trueEnd.x}" y2="${trueEnd.y}" marker-end="url(#validation-arrow)"></line>`;
    svg += `<line class="validation-vector estimate" x1="${centerX}" y1="${centerY}" x2="${estimateEnd.x}" y2="${estimateEnd.y}" marker-end="url(#validation-arrow)"></line>`;
    svg += `<line class="validation-vector recovered" x1="${centerX}" y1="${centerY}" x2="${recoveredEnd.x}" y2="${recoveredEnd.y}" marker-end="url(#validation-arrow)"></line>`;
    svg += `<line class="validation-error-vector" x1="${estimateEnd.x}" y1="${estimateEnd.y}" x2="${trueEnd.x}" y2="${trueEnd.y}"></line>`;
    const labelX = 342;
    [
      { y: 82, label: 'true clutter C', value: `${fmt(recovery.solution.surfaceVector.magnitude, 2)} at ${signed(phaseDeg(recovery.solution.surfaceVector.phaseRad), 0)} deg`, css: 'truth' },
      { y: 146, label: 'estimated clutter C-hat', value: `${fmt(recovery.estimatedSurface.magnitude, 2)} at ${signed(phaseDeg(recovery.estimatedSurface.phaseRad), 0)} deg`, css: 'estimate' },
      { y: 210, label: 'recovered target T-hat', value: `${fmt(recovery.recovered.magnitude, 2)} at ${signed(phaseDeg(recovery.recovered.phaseRad), 0)} deg`, css: 'recovered' },
      { y: 274, label: 'complex recovery error', value: `${fmt(recovery.recoveryErrorVector.magnitude * 100, 1)}% of target amplitude`, css: 'error' }
    ].forEach((row) => {
      svg += `<line class="validation-legend ${row.css}" x1="${labelX}" y1="${row.y}" x2="${labelX + 26}" y2="${row.y}"></line>`;
      svg += `<text class="phase-title" x="${labelX + 36}" y="${row.y - 5}">${row.label}</text>`;
      svg += `<text class="phase-note" x="${labelX + 36}" y="${row.y + 14}">${row.value}</text>`;
    });
    svg += '</svg>';
    truthEstimatePlot.innerHTML = svg;
  }

  function validationErrorColor(relativeAmplitudeError) {
    const normalized = Math.min(1, Math.max(0, relativeAmplitudeError / 1.25));
    const hue = 184 - normalized * 178;
    const lightness = 86 - normalized * 40;
    return `hsl(${hue.toFixed(0)} 52% ${lightness.toFixed(0)}%)`;
  }

  function renderPhaseErrorMap(solution) {
    if (!phaseErrorMap || !solution) return;
    const width = 560;
    const height = 350;
    const margin = { left: 74, right: 28, top: 35, bottom: 60 };
    const phaseValues = Array.from({ length: 19 }, (_, index) => -45 + index * 5);
    const amplitudeValues = Array.from({ length: 21 }, (_, index) => -0.5 + index * 0.05);
    const cellWidth = (width - margin.left - margin.right) / phaseValues.length;
    const cellHeight = (height - margin.top - margin.bottom) / amplitudeValues.length;
    const selectedError = validationRecovery(
      solution,
      phaseValidation.phaseErrorDeg,
      phaseValidation.amplitudeErrorFraction
    ).recoveryErrorVector.magnitude;
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Recovered target amplitude error for phase and clutter amplitude estimation errors">
      <defs><linearGradient id="validation-error-gradient" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="hsl(184 52% 86%)"></stop><stop offset="1" stop-color="hsl(6 52% 46%)"></stop></linearGradient></defs>`;
    amplitudeValues.forEach((amplitudeError, rowIndex) => {
      phaseValues.forEach((phaseError, columnIndex) => {
        const error = validationRecovery(solution, phaseError, amplitudeError).recoveryErrorVector.magnitude;
        const x = margin.left + columnIndex * cellWidth;
        const y = margin.top + (amplitudeValues.length - rowIndex - 1) * cellHeight;
        svg += `<rect x="${x}" y="${y}" width="${cellWidth + 0.4}" height="${cellHeight + 0.4}" fill="${validationErrorColor(error)}"><title>${signed(phaseError, 0)} deg, ${signed(amplitudeError * 100, 0)}% amplitude: ${fmt(error * 100, 1)}% target-amplitude error</title></rect>`;
      });
    });
    [-45, -20, 0, 20, 45].forEach((value) => {
      const x = margin.left + ((value + 45) / 90) * (width - margin.left - margin.right);
      svg += `<text class="check-label" x="${x}" y="${height - margin.bottom + 20}" text-anchor="middle">${signed(value, 0)}</text>`;
    });
    [-50, -25, 0, 25, 50].forEach((value) => {
      const y = margin.top + ((50 - value) / 100) * (height - margin.top - margin.bottom);
      svg += `<text class="check-label" x="${margin.left - 10}" y="${y + 4}" text-anchor="end">${signed(value, 0)}%</text>`;
    });
    const selectedX = margin.left + ((phaseValidation.phaseErrorDeg + 45) / 90) * (width - margin.left - margin.right);
    const selectedY = margin.top + ((0.5 - phaseValidation.amplitudeErrorFraction) / 1.0) * (height - margin.top - margin.bottom);
    svg += `<circle class="validation-map-marker" cx="${selectedX}" cy="${selectedY}" r="7"><title>Selected errors: ${fmt(selectedError * 100, 1)}% target-amplitude error</title></circle>`;
    svg += `<rect x="${width - 174}" y="9" width="116" height="10" fill="url(#validation-error-gradient)"></rect>`;
    svg += `<text class="phase-note" x="${width - 182}" y="18" text-anchor="end">low</text>`;
    svg += `<text class="phase-note" x="${width - 50}" y="18">high</text>`;
    svg += `<text class="phase-title" x="${margin.left + (width - margin.left - margin.right) / 2}" y="${height - 9}" text-anchor="middle">phase estimate error (deg)</text>`;
    svg += `<text class="phase-title" transform="translate(18 ${margin.top + (height - margin.top - margin.bottom) / 2}) rotate(-90)" text-anchor="middle">amplitude estimate error</text>`;
    svg += `<text class="phase-title" x="${margin.left}" y="19">color = target recovery error</text>`;
    svg += '</svg>';
    phaseErrorMap.innerHTML = svg;
  }

  function seededRandom(seed) {
    let state = seed >>> 0;
    return () => {
      state = (1664525 * state + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function gaussianSample(random) {
    const u1 = Math.max(1e-12, random());
    const u2 = random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(TWO_PI * u2);
  }

  function percentile(values, fraction) {
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * fraction)));
    return sorted[index];
  }

  function uncertaintyTrialSummary(solution) {
    const random = seededRandom(20260719);
    const metrics = {
      observed: [],
      powerOnly: [],
      phaseAware: [],
      targetAbsent: []
    };
    for (let index = 0; index < phaseValidation.trialCount; index += 1) {
      const trialPhaseError = phaseValidation.phaseErrorDeg + gaussianSample(random) * 5;
      const trialAmplitudeError = phaseValidation.amplitudeErrorFraction + gaussianSample(random) * 0.05;
      const componentSigma = phaseValidation.noiseRms / Math.sqrt(2);
      const noiseVector = {
        re: gaussianSample(random) * componentSigma,
        im: gaussianSample(random) * componentSigma
      };
      const recovery = validationRecovery(solution, trialPhaseError, trialAmplitudeError, noiseVector);
      metrics.observed.push(recovery.observedPowerError);
      metrics.powerOnly.push(recovery.powerOnlyError);
      metrics.phaseAware.push(recovery.phaseAwarePowerError);
      metrics.targetAbsent.push(recovery.targetAbsentError);
    }
    return Object.fromEntries(Object.entries(metrics).map(([key, values]) => [key, {
      median: percentile(values, 0.5),
      p95: percentile(values, 0.95)
    }]));
  }

  function renderUncertaintyTrials(solution) {
    if (!uncertaintyTrialsPlot || !solution) return;
    const summary = uncertaintyTrialSummary(solution);
    const width = 900;
    const height = 330;
    const margin = { left: 205, right: 42, top: 70, bottom: 48 };
    const rows = [
      { label: 'No correction', values: summary.observed, css: 'observed' },
      { label: 'Power-only subtraction', values: summary.powerOnly, css: 'power-only' },
      { label: 'Phase-aware estimate', values: summary.phaseAware, css: 'phase-aware' },
      { label: 'Target absent: false residual', values: summary.targetAbsent, css: 'target-absent' }
    ];
    const xMax = Math.max(0.5, ...rows.map((row) => row.values.p95)) * 1.12;
    const sx = (value) => margin.left + (value / xMax) * (width - margin.left - margin.right);
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Median and 95th percentile target recovery error across deterministic Monte Carlo trials">`;
    svg += `<text class="phase-title" x="${margin.left}" y="22">${phaseValidation.trialCount} trials at 6.0 s: 5 deg and 5% random scatter around the selected estimate bias</text>`;
    svg += `<text class="phase-note" x="${margin.left}" y="43">bar = 95th percentile error; dark segment = median error; receiver noise is complex Gaussian</text>`;
    rows.forEach((row, index) => {
      const y = margin.top + index * 52;
      svg += `<text class="phase-title" x="${margin.left - 18}" y="${y + 16}" text-anchor="end">${row.label}</text>`;
      svg += `<rect class="uncertainty-track" x="${margin.left}" y="${y}" width="${width - margin.left - margin.right}" height="20"></rect>`;
      svg += `<rect class="uncertainty-bar ${row.css}" x="${margin.left}" y="${y}" width="${Math.max(2, sx(row.values.p95) - margin.left)}" height="20"></rect>`;
      svg += `<rect class="uncertainty-median ${row.css}" x="${margin.left}" y="${y + 5}" width="${Math.max(2, sx(row.values.median) - margin.left)}" height="10"></rect>`;
      svg += `<text class="phase-note" x="${Math.min(width - margin.right, sx(row.values.p95) + 9)}" y="${y + 15}">p95 ${fmt(row.values.p95, 2)} x</text>`;
    });
    [0, xMax / 4, xMax / 2, 3 * xMax / 4, xMax].forEach((value) => {
      const x = sx(value);
      svg += `<line class="check-grid-line" x1="${x}" y1="${margin.top - 8}" x2="${x}" y2="${height - margin.bottom}"></line>`;
      svg += `<text class="check-label" x="${x}" y="${height - margin.bottom + 18}" text-anchor="middle">${fmt(value, 1)}</text>`;
    });
    svg += `<text class="phase-title" x="${margin.left + (width - margin.left - margin.right) / 2}" y="${height - 8}" text-anchor="middle">absolute normalized power error</text>`;
    svg += '</svg>';
    uncertaintyTrialsPlot.innerHTML = svg;
  }

  function renderPhaseValidation(solution) {
    if (!criticalWindowPlot && !truthEstimatePlot && !phaseErrorMap && !uncertaintyTrialsPlot) return;
    const overlapSolution = phaseSolutionState(multiClutterStateAt(6.0, solution.effectivePrfHz));
    const recovery = validationRecovery(
      overlapSolution,
      phaseValidation.phaseErrorDeg,
      phaseValidation.amplitudeErrorFraction,
      representativeNoiseVector(phaseValidation.noiseRms)
    );
    if (phaseValidationStatus) {
      phaseValidationStatus.className = `multi-clutter-status${overlapSolution.overlappingPoints.length ? ' is-overlap' : ''}`;
      phaseValidationStatus.textContent = `At 6.0 s, ${overlapSolution.overlappingPoints.length} clutter returns overlap the target. With ${signed(phaseValidation.phaseErrorDeg, 0)} deg phase error, ${signed(phaseValidation.amplitudeErrorFraction * 100, 0)}% amplitude error, and ${fmt(phaseValidation.noiseRms, 2)} x noise RMS, the recovered target power is ${fmt(recovery.recovered.power, 2)} x and the target-absent false residual is ${fmt(recovery.recoveredWithoutTarget.power, 2)} x.`;
    }
    if (phaseErrorOutput) phaseErrorOutput.textContent = `${signed(phaseValidation.phaseErrorDeg, 0)} deg`;
    if (amplitudeErrorOutput) amplitudeErrorOutput.textContent = `${signed(phaseValidation.amplitudeErrorFraction * 100, 0)}%`;
    if (validationNoiseOutput) validationNoiseOutput.textContent = `${fmt(phaseValidation.noiseRms, 2)} x`;
    if (summaryObservedPower) summaryObservedPower.textContent = `${fmt(recovery.observed.power, 2)} x`;
    if (summaryObservedError) summaryObservedError.textContent = `${signed((recovery.observed.power - 1) * 100, 0)}%`;
    if (summaryPowerOnly) summaryPowerOnly.textContent = `${fmt(recovery.powerOnlyResidual, 2)} x`;
    if (summaryPowerOnlyError) summaryPowerOnlyError.textContent = `${signed((recovery.powerOnlyResidual - 1) * 100, 0)}%`;
    if (summaryPhaseAware) summaryPhaseAware.textContent = `${fmt(recovery.recovered.power, 2)} x`;
    if (summaryPhaseAwareError) summaryPhaseAwareError.textContent = `${signed((recovery.recovered.power - 1) * 100, 0)}%`;
    if (summaryTargetAbsent) summaryTargetAbsent.textContent = `${fmt(recovery.recoveredWithoutTarget.power, 2)} x`;
    if (summaryTargetAbsentError) summaryTargetAbsentError.textContent = `${fmt(recovery.recoveredWithoutTarget.power * 100, 0)}% of target power`;
    renderCriticalWindow(solution);
    renderTruthEstimate(overlapSolution);
    renderPhaseErrorMap(overlapSolution);
    renderUncertaintyTrials(overlapSolution);
  }

  function renderPhaseSolution(state) {
    if (!phaseGeometryPlot && !phaseCellPlot && !phasePhasorPlot && !phasePowerPlot && !phaseSweepPlot && !criticalWindowPlot && !truthEstimatePlot && !phaseErrorMap && !uncertaintyTrialsPlot) return;
    const solution = phaseSolutionState(state);
    if (!solution) return;
    if (phaseSolutionStatus) {
      const overlapPowers = solution.overlappingPoints
        .map((point) => point.surfacePowerRatio)
        .filter(Number.isFinite)
        .sort((a, b) => a - b);
      const powerSpread = overlapPowers.length > 1
        ? ` Individual bump powers span ${fmt(overlapPowers[0], 2)}-${fmt(overlapPowers[overlapPowers.length - 1], 2)}x target.`
        : overlapPowers.length === 1
        ? ` Individual bump power is ${fmt(overlapPowers[0], 2)}x target.`
        : '';
      const surfaceSummary = solution.surfaceVector.magnitude < 0.005
        ? 'coherent surface sum is below 0.01'
        : `coherent surface sum is ${fmt(solution.surfaceVector.magnitude, 2)} at ${signed(phaseDeg(solution.surfaceVector.phaseRad), 0)} deg`;
      const overlapText = solution.overlappingPoints.length
        ? `${fmt(solution.overlappingPoints.length, 0)} surface return${solution.overlappingPoints.length === 1 ? '' : 's'} are in the target Doppler/depth cell`
        : 'No surface returns are in the target Doppler/depth cell';
      phaseSolutionStatus.className = `multi-clutter-status phase-solution-status${solution.overlappingPoints.length ? ' is-overlap' : ''}`;
      phaseSolutionStatus.textContent = `${overlapText}.${powerSpread} The ${surfaceSummary}; observed cell power is ${fmt(solution.observedPower, 2)} x target. Power-only subtraction leaves ${fmt(solution.powerOnlyResidual, 2)} x, while phase-aware subtraction recovers ${fmt(solution.residualPower, 2)} x.`;
    }
    renderPhaseGeometry(solution);
    renderPhaseCell(solution);
    renderPhasePhasor(solution);
    renderPhasePower(solution);
    renderPhaseSweep(solution);
    renderPhaseValidation(solution);
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
    const geometryHalfWidthKm = currentGeometryHalfWidthKm();
    const sx = (xKm) => left + ((xKm + geometryHalfWidthKm) / (2 * geometryHalfWidthKm)) * (width - left - right);
    const targetX = sx(0);
    const aircraftY = 34;
    const aircraftX = sx(movingState.planeXKm);
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
      const currentDxKm = point.xKm - movingState.planeXKm;
      const currentRangeKm = Math.hypot(model.altitudeKm, currentDxKm);
      const currentDopplerHz = (2 * model.velocityKmS * 1000 / wavelengthM) * (currentDxKm / currentRangeKm);
      const currentAliasHz = alias(currentDopplerHz, effectivePrfHz);
      svg += `<circle class="geometry-surface-point ${css}" cx="${sx(point.xKm)}" cy="${surfaceY}" r="${isFoldingPoint ? 8 : 6}"><title>Clutter ${point.index + 1}: current aliased Doppler ${fmt(currentAliasHz, 1)} Hz</title></circle>`;
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
    if (plot) plot.innerHTML = svg;

    renderFoldDepthBlock(effectivePrfHz, movingState);
    const multiState = renderMultiClutterSweep(effectivePrfHz);
    const diagnosticState = multiState ? diagnosticStateFromMultiClutter(multiState) : movingState;
    renderDopplerBins(diagnosticState, multiState);
    renderTraceCheck(diagnosticState, multiState);
    renderFastTimeDopplerCheck(diagnosticState, multiState);
    syncRecordingPair();
    renderPhaseSolution(multiState);
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
    if (originalPrfText) {
      originalPrfText.className = baseCaseIsValid ? '' : 'is-warning';
      originalPrfText.textContent = `Base trace PRF: ${fmt(originalPrfHz, 1)} Hz; PRI ${fmt(basePriUs, 1)} us ${timingIsSafe ? '>' : '<'} echo ${fmt(targetEchoUs, 1)} us + ${fmt(SIMPLE_LISTEN_MARGIN_US, 0)} us assumed margin.`;
    }
    output.textContent = `${fmt(effectivePrfHz, 1)} Hz`;
    if (timeOutput) timeOutput.textContent = `${fmt(flyby.timeS, 1)} s`;
    if (status) {
      status.className = `prf-status${targetOverlap ? ' is-overlap' : ''}`;
      if (targetOverlap) {
        status.textContent = `Overlap at ${fmt(flyby.timeS, 1)} s with PRF fixed at ${fmt(effectivePrfHz, 1)} Hz: surface clutter ${signed(movingState.surfaceAliasHz, 1)} Hz folds into the target bin ${signed(movingState.targetAliasHz, 1)} Hz at ${fmt(movingState.surfaceApparentDepthKm, 2)} km.`;
      } else {
        status.textContent = `No overlap at ${fmt(flyby.timeS, 1)} s with PRF fixed at ${fmt(effectivePrfHz, 1)} Hz: aliased Doppler separation is ${fmt(movingState.dopplerDeltaHz, 1)} Hz and apparent-depth separation is ${fmt(movingState.depthDeltaKm, 2)} km.`;
      }
    }
    if (foldingIndicator && foldingIndicatorText) {
      const controlOverlap = multiState ? multiState.overlappingPoints.length > 0 : targetOverlap;
      const overlapCount = multiState ? multiState.overlappingPoints.length : 0;
      foldingIndicator.classList.toggle('is-overlap', controlOverlap);
      foldingIndicatorText.textContent = controlOverlap
        ? (multiState ? `${fmt(overlapCount, 0)} clutter point${overlapCount === 1 ? '' : 's'} on target` : 'folding on target')
        : 'outside target fold';
      foldingIndicator.setAttribute(
        'aria-label',
        controlOverlap
          ? (multiState
            ? `${fmt(overlapCount, 0)} surface clutter point${overlapCount === 1 ? '' : 's'} are in the target Doppler and depth cell`
            : 'PRF folding overlap is active: folded clutter is in the target Doppler and depth cell')
          : 'PRF folding overlap is not active: clutter and target are separated'
      );
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
  if (pageParams.has('time') && timeSlider) {
    const initialTime = Number(pageParams.get('time'));
    if (Number.isFinite(initialTime)) {
      flyby.timeS = clamp(initialTime, Number(timeSlider.min), Number(timeSlider.max));
      timeSlider.value = flyby.timeS.toFixed(2);
    }
  }
  if (pageParams.has('prf')) {
    const initialPrf = Number(pageParams.get('prf'));
    if (Number.isFinite(initialPrf)) prfSlider.value = String(initialPrf);
  }
  window.setAliasingCaptureTime = setFlybyFrame;
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
  if (playbackSpeedButton) {
    playbackSpeedButton.addEventListener('click', () => {
      const currentIndex = YOUTUBE_PLAYBACK_SPEEDS.findIndex((speed) => speed === flyby.playbackSpeed);
      const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % YOUTUBE_PLAYBACK_SPEEDS.length;
      flyby.playbackSpeed = YOUTUBE_PLAYBACK_SPEEDS[nextIndex];
      updatePlaybackSpeedControl();
    });
  }
  if (multiClutterCountSlider) {
    multiClutterPointCount = Math.round(Number(multiClutterCountSlider.value));
    if (multiClutterCountOutput) multiClutterCountOutput.textContent = fmt(multiClutterPointCount, 0);
    multiClutterCountSlider.addEventListener('input', () => {
      multiClutterPointCount = Math.round(Number(multiClutterCountSlider.value));
      if (multiClutterCountOutput) multiClutterCountOutput.textContent = fmt(multiClutterPointCount, 0);
      draw(Number(prfSlider.value));
    });
  }
  if (bumpHeightSlider) {
    model.bumpHeightKm = Number(bumpHeightSlider.value);
    if (bumpHeightOutput) bumpHeightOutput.textContent = `${fmt(model.bumpHeightKm, 1)} km`;
    bumpHeightSlider.addEventListener('input', () => {
      model.bumpHeightKm = Number(bumpHeightSlider.value);
      if (bumpHeightOutput) bumpHeightOutput.textContent = `${fmt(model.bumpHeightKm, 1)} km`;
      draw(Number(prfSlider.value));
    });
  }
  [phaseErrorSlider, amplitudeErrorSlider, validationNoiseSlider].filter(Boolean).forEach((input) => {
    input.addEventListener('input', () => {
      phaseValidation.phaseErrorDeg = Number(phaseErrorSlider.value);
      phaseValidation.amplitudeErrorFraction = Number(amplitudeErrorSlider.value) / 100;
      phaseValidation.noiseRms = Number(validationNoiseSlider.value);
      draw(Number(prfSlider.value));
    });
  });
  draw(Number(prfSlider.value));
})();
