(() => {
  'use strict';

  const data = window.E19_FLYBY;
  const C = 299792458;
  const RADAR_FREQUENCY_HZ = 60e6;
  const ICE_INDEX = 1.78;
  const WAVELENGTH_M = C / RADAR_FREQUENCY_HZ;
  const TWO_WAY_PHASE_PER_M = 4 * Math.PI * ICE_INDEX / WAVELENGTH_M;

  const timeSlider = document.getElementById('rough-time-slider');
  const timeOutput = document.getElementById('rough-time-output');
  const playButton = document.getElementById('rough-play-button');
  const closestButton = document.getElementById('rough-closest-button');
  const layerDepthSlider = document.getElementById('layer-depth-slider');
  const bumpHeightSlider = document.getElementById('bump-height-slider');
  const bumpWidthSlider = document.getElementById('bump-width-slider');
  const bumpSpacingSlider = document.getElementById('bump-spacing-slider');
  const layerDepthOutput = document.getElementById('layer-depth-output');
  const bumpHeightOutput = document.getElementById('bump-height-output');
  const bumpWidthOutput = document.getElementById('bump-width-output');
  const bumpSpacingOutput = document.getElementById('bump-spacing-output');
  const altitudeValue = document.getElementById('rough-altitude-value');
  const trackValue = document.getElementById('rough-track-value');
  const countValue = document.getElementById('rough-count-value');
  const phaseValue = document.getElementById('rough-phase-value');
  const coherenceValue = document.getElementById('rough-coherence-value');
  const noiseValue = document.getElementById('rough-noise-value');
  const status = document.getElementById('roughness-status');
  const bumpFieldPlot = document.getElementById('bump-field-plot');
  const layerProfilePlot = document.getElementById('layer-profile-plot');
  const phaseNoisePlot = document.getElementById('phase-noise-plot');

  if (!data || !Array.isArray(data.samples) || data.samples.length < 3) {
    if (status) {
      status.className = 'trajectory-status is-overlap';
      status.textContent = 'E19 trajectory data did not load.';
    }
    return;
  }

  const samples = data.samples;
  const sampleStart = data.flyby.sampleWindowS.start;
  const sampleEnd = data.flyby.sampleWindowS.end;
  const sampleStep = data.flyby.sampleWindowS.step;
  const trackStart = samples[0].groundTrackKm;
  const trackEnd = samples[samples.length - 1].groundTrackKm;
  const cilixSample = samples.reduce((best, row) => (
    Math.abs(row.offsetS - data.flyby.cilixClosestSample.offsetS)
      < Math.abs(best.offsetS - data.flyby.cilixClosestSample.offsetS) ? row : best
  ), samples[0]);

  const state = {
    timeS: 0,
    layerDepthKm: Number(layerDepthSlider.value),
    bumpHeightM: Number(bumpHeightSlider.value),
    bumpWidthKm: Number(bumpWidthSlider.value),
    bumpSpacingKm: Number(bumpSpacingSlider.value)
  };

  let bumps = [];
  let playbackFrameId = null;
  let playbackTimestamp = null;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, mix) => a + (b - a) * mix;
  const fmt = (value, digits = 1) => Number(value).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
  const signed = (value, digits = 0) => `${value > 0 ? '+' : ''}${fmt(value, digits)}`;
  const hash01 = (seed) => {
    const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453123;
    return value - Math.floor(value);
  };
  const gaussianUnit = (seed) => {
    const u1 = Math.max(1e-8, hash01(seed));
    const u2 = hash01(seed + 19.371);
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };

  function interpolateRow(offsetS) {
    const bounded = clamp(offsetS, sampleStart, sampleEnd);
    const floatingIndex = (bounded - sampleStart) / sampleStep;
    const lowerIndex = clamp(Math.floor(floatingIndex), 0, samples.length - 1);
    const upperIndex = clamp(lowerIndex + 1, 0, samples.length - 1);
    const mix = upperIndex === lowerIndex ? 0 : floatingIndex - lowerIndex;
    const lower = samples[lowerIndex];
    const upper = samples[upperIndex];
    const row = { offsetS: bounded };
    ['altitudeKm', 'groundTrackKm', 'latDeg', 'lonEastDeg', 'speedKmS'].forEach((key) => {
      row[key] = lerp(lower[key], upper[key], mix);
    });
    return row;
  }

  function satelliteIcon(x, y, size = 9) {
    const n = (value) => Number(value).toFixed(2);
    return `
      <g class="satellite-icon" transform="translate(${n(x)} ${n(y)}) rotate(-18)">
        <line class="satellite-boom" x1="${n(-size * 1.2)}" y1="0" x2="${n(size * 1.2)}" y2="0"></line>
        <rect class="satellite-panel" x="${n(-size * 2.0)}" y="${n(-size * .25)}" width="${n(size * .85)}" height="${n(size * .5)}" rx="1"></rect>
        <rect class="satellite-panel" x="${n(size * 1.15)}" y="${n(-size * .25)}" width="${n(size * .85)}" height="${n(size * .5)}" rx="1"></rect>
        <rect class="satellite-body" x="${n(-size * .45)}" y="${n(-size * .34)}" width="${n(size * .9)}" height="${n(size * .68)}" rx="1.5"></rect>
        <line class="satellite-antenna" x1="0" y1="${n(-size * .34)}" x2="0" y2="${n(-size * .84)}"></line>
        <circle class="satellite-node" cx="0" cy="${n(-size * .84)}" r="${n(size * .12)}"></circle>
      </g>
    `;
  }

  function buildBumps() {
    const padding = state.bumpWidthKm * 3;
    const start = trackStart - padding;
    const end = trackEnd + padding;
    const count = Math.max(4, Math.ceil((end - start) / state.bumpSpacingKm));
    const generated = [];

    for (let index = 0; index < count; index += 1) {
      const nominalX = start + (index + .5) * (end - start) / count;
      const jitterX = (hash01(index + 2.7) - .5) * state.bumpSpacingKm * .42;
      const y = (hash01(index + 47.3) - .5) * 220;
      generated.push({
        x: nominalX + jitterX,
        y,
        unitAmplitude: clamp(gaussianUnit(index + 101.9), -2.4, 2.4)
      });
    }

    const rms = Math.sqrt(generated.reduce((sum, bump) => (
      sum + bump.unitAmplitude * bump.unitAmplitude
    ), 0) / generated.length) || 1;
    bumps = generated.map((bump) => ({
      ...bump,
      unitAmplitude: bump.unitAmplitude / rms
    }));
  }

  function bumpHeightAt(xKm, yKm) {
    const sigma = Math.max(1, state.bumpWidthKm);
    const denominator = 2 * sigma * sigma;
    let heightM = 0;
    for (const bump of bumps) {
      const dx = xKm - bump.x;
      const dy = yKm - bump.y;
      const radialWeight = Math.exp(-(dx * dx + dy * dy) / denominator);
      heightM += state.bumpHeightM * bump.unitAmplitude * radialWeight;
    }
    return heightM;
  }

  function phaseStateAt(trackKm) {
    const footprintSigmaKm = 12;
    const alongOffsets = [-24, -16, -8, 0, 8, 16, 24];
    const crossOffsets = [-24, -16, -8, 0, 8, 16, 24];
    let real = 0;
    let imaginary = 0;
    let weightSum = 0;

    for (const dx of alongOffsets) {
      for (const dy of crossOffsets) {
        const weight = Math.exp(-(dx * dx + dy * dy) / (2 * footprintSigmaKm * footprintSigmaKm));
        const heightM = bumpHeightAt(trackKm + dx, dy);
        const phase = TWO_WAY_PHASE_PER_M * heightM;
        real += weight * Math.cos(phase);
        imaginary += weight * Math.sin(phase);
        weightSum += weight;
      }
    }

    const meanReal = real / weightSum;
    const meanImaginary = imaginary / weightSum;
    const coherence = clamp(Math.hypot(meanReal, meanImaginary), 0, 1);
    const noise = 1 - coherence;
    const phaseSpreadDeg = Math.min(180, Math.sqrt(Math.max(0, -2 * Math.log(Math.max(1e-8, coherence)))) * 180 / Math.PI);
    const meanPhaseDeg = Math.atan2(meanImaginary, meanReal) * 180 / Math.PI;
    return { coherence, noise, phaseSpreadDeg, meanPhaseDeg };
  }

  function chartScales(width, height, margin, xMin, xMax, yMin, yMax) {
    return {
      x: (value) => margin.left + (value - xMin) / (xMax - xMin) * (width - margin.left - margin.right),
      y: (value) => margin.top + (yMax - value) / (yMax - yMin) * (height - margin.top - margin.bottom)
    };
  }

  function renderAxis(svg, width, height, margin, scales, xTicks, yTicks, labels) {
    for (const value of yTicks) {
      const y = scales.y(value);
      svg.push(`<line class="grid" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line>`);
      svg.push(`<text class="label" x="${margin.left - 9}" y="${y + 4}" text-anchor="end">${labels.y(value)}</text>`);
    }
    for (const value of xTicks) {
      const x = scales.x(value);
      svg.push(`<line class="grid" x1="${x}" y1="${margin.top}" x2="${x}" y2="${height - margin.bottom}"></line>`);
      svg.push(`<text class="label" x="${x}" y="${height - margin.bottom + 19}" text-anchor="middle">${labels.x(value)}</text>`);
    }
    svg.push(`<line class="axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>`);
    svg.push(`<line class="axis" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"></line>`);
    svg.push(`<text class="label-strong" x="${margin.left + (width - margin.left - margin.right) / 2}" y="${height - 7}" text-anchor="middle">${labels.xTitle}</text>`);
    svg.push(`<text class="label-strong" transform="translate(17 ${margin.top + (height - margin.top - margin.bottom) / 2}) rotate(-90)" text-anchor="middle">${labels.yTitle}</text>`);
  }

  function linePath(rows, x, y, xKey, yKey) {
    return rows.map((row, index) => (
      `${index ? 'L' : 'M'} ${x(row[xKey]).toFixed(2)} ${y(row[yKey]).toFixed(2)}`
    )).join(' ');
  }

  function renderBumpField(row) {
    const width = 900;
    const height = 360;
    const margin = { left: 66, right: 28, top: 28, bottom: 48 };
    const xHalfSpan = 320;
    const xMin = row.groundTrackKm - xHalfSpan;
    const xMax = row.groundTrackKm + xHalfSpan;
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const yHalfSpan = xHalfSpan * plotHeight / plotWidth;
    const scales = chartScales(width, height, margin, xMin, xMax, -yHalfSpan, yHalfSpan);
    const kmToPx = plotWidth / (xMax - xMin);
    const visibleBumps = bumps.filter((bump) => (
      bump.x >= xMin - state.bumpWidthKm * 2
      && bump.x <= xMax + state.bumpWidthKm * 2
      && Math.abs(bump.y) <= yHalfSpan + state.bumpWidthKm * 2
    ));
    const svg = [];
    svg.push(`<svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="rough-field-title rough-field-desc">`);
    svg.push('<title id="rough-field-title">E19 groundtrack over isotropic layer bumps</title>');
    svg.push(`<desc id="rough-field-desc">A top view centered on the current E19 SPICE groundtrack position. Circular marks are radially symmetric Gaussian bumps in the subsurface layer.</desc>`);

    const xTicks = [-300, -150, 0, 150, 300].map((offset) => row.groundTrackKm + offset);
    const yTickStep = Math.max(20, Math.floor(yHalfSpan / 2 / 10) * 10);
    renderAxis(svg, width, height, margin, scales, xTicks, [-yTickStep * 2, -yTickStep, 0, yTickStep, yTickStep * 2], {
      x: (value) => signed(value - row.groundTrackKm, 0),
      y: (value) => signed(value, 0),
      xTitle: 'along-track distance from spacecraft (km)',
      yTitle: 'cross-track distance (km)'
    });

    const footprintRadiusPx = 24 * kmToPx;
    svg.push(`<rect class="rough-track-window" x="${scales.x(row.groundTrackKm - 24)}" y="${margin.top}" width="${48 * kmToPx}" height="${plotHeight}"></rect>`);
    for (const bump of visibleBumps) {
      const cx = scales.x(bump.x);
      const cy = scales.y(bump.y);
      const radius = state.bumpWidthKm * kmToPx;
      const sign = bump.unitAmplitude >= 0 ? 'raised' : 'depressed';
      svg.push(`<g><title>${sign} bump at ${signed(bump.x - row.groundTrackKm, 0)} km along track, ${signed(bump.y, 0)} km cross track</title>`);
      svg.push(`<circle class="rough-bump${bump.unitAmplitude < 0 ? ' is-depression' : ''}" cx="${cx}" cy="${cy}" r="${radius}"></circle>`);
      svg.push(`<circle class="rough-bump-core${bump.unitAmplitude < 0 ? ' is-depression' : ''}" cx="${cx}" cy="${cy}" r="${Math.max(2, radius * .34)}"></circle></g>`);
    }
    svg.push(`<line class="rough-track" x1="${margin.left}" y1="${scales.y(0)}" x2="${width - margin.right}" y2="${scales.y(0)}"></line>`);
    svg.push(`<circle class="rough-footprint" cx="${scales.x(row.groundTrackKm)}" cy="${scales.y(0)}" r="${footprintRadiusPx}"></circle>`);

    if (cilixSample.groundTrackKm >= xMin - 20 && cilixSample.groundTrackKm <= xMax + 20) {
      const cilixY = clamp(data.flyby.cilixClosestSample.distanceToCilixKm, -yHalfSpan + 12, yHalfSpan - 12);
      const cilixRadiusPx = Math.max(5, data.cilix.diameterKm * .5 * kmToPx);
      svg.push(`<circle class="rough-cilix" cx="${scales.x(cilixSample.groundTrackKm)}" cy="${scales.y(cilixY)}" r="${cilixRadiusPx}"></circle>`);
      svg.push(`<text class="label-danger" x="${scales.x(cilixSample.groundTrackKm) + 11}" y="${scales.y(cilixY) - 9}">Cilix</text>`);
    }

    svg.push(satelliteIcon(scales.x(row.groundTrackKm), scales.y(0), 10));
    svg.push(`<text class="label-strong" x="${scales.x(row.groundTrackKm) + 24}" y="${scales.y(0) - 13}">E19</text>`);
    svg.push(`<text class="label" x="${margin.left + 7}" y="${margin.top + 16}">circles use equal x/y scale: isotropic bump width ${fmt(state.bumpWidthKm, 0)} km</text>`);
    svg.push('</svg>');
    bumpFieldPlot.innerHTML = svg.join('');
  }

  function renderLayerProfile(row) {
    const width = 560;
    const height = 350;
    const margin = { left: 62, right: 24, top: 30, bottom: 48 };
    const xMin = row.groundTrackKm - 210;
    const xMax = row.groundTrackKm + 210;
    const profile = [];
    for (let index = 0; index <= 120; index += 1) {
      const xKm = lerp(xMin, xMax, index / 120);
      profile.push({ xKm, heightM: bumpHeightAt(xKm, 0) });
    }
    const maxAbs = Math.max(1, state.bumpHeightM * 1.6, ...profile.map((point) => Math.abs(point.heightM))) * 1.18;
    const scales = chartScales(width, height, margin, xMin, xMax, -maxAbs, maxAbs);
    const path = linePath(profile, scales.x, scales.y, 'xKm', 'heightM');
    const currentHeight = bumpHeightAt(row.groundTrackKm, 0);
    const zeroY = scales.y(0);
    const areaPath = `${path} L ${scales.x(xMax)} ${zeroY} L ${scales.x(xMin)} ${zeroY} Z`;
    const yTicks = [-maxAbs, -maxAbs / 2, 0, maxAbs / 2, maxAbs];
    const svg = [];
    svg.push(`<svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="rough-profile-title rough-profile-desc">`);
    svg.push('<title id="rough-profile-title">Cross-section through the isotropic rough layer</title>');
    svg.push(`<desc id="rough-profile-desc">A cross-track zero slice of the radial Gaussian bump field around the current E19 position. Positive and negative bump heights perturb the coherent radar phase.</desc>`);
    renderAxis(svg, width, height, margin, scales, [-200, -100, 0, 100, 200].map((offset) => row.groundTrackKm + offset), yTicks, {
      x: (value) => signed(value - row.groundTrackKm, 0),
      y: (value) => fmt(value, 1),
      xTitle: 'along-track distance from spacecraft (km)',
      yTitle: 'height from mean layer (m)'
    });
    svg.push(`<rect class="rough-footprint" x="${scales.x(row.groundTrackKm - 24)}" y="${margin.top}" width="${scales.x(row.groundTrackKm + 24) - scales.x(row.groundTrackKm - 24)}" height="${height - margin.top - margin.bottom}"></rect>`);
    svg.push(`<line class="rough-mean-layer" x1="${margin.left}" y1="${zeroY}" x2="${width - margin.right}" y2="${zeroY}"></line>`);
    svg.push(`<path class="rough-profile-area" d="${areaPath}"></path>`);
    svg.push(`<path class="rough-profile-line" d="${path}"></path>`);
    svg.push(`<circle class="rough-current-dot" cx="${scales.x(row.groundTrackKm)}" cy="${scales.y(currentHeight)}" r="5"></circle>`);
    svg.push(`<text class="label-strong" x="${margin.left + 7}" y="${margin.top + 16}">mean layer depth ${fmt(state.layerDepthKm, 1)} km</text>`);
    svg.push(`<text class="label" x="${margin.left + 7}" y="${margin.top + 32}">current phase-height perturbation ${signed(currentHeight, 2)} m</text>`);
    svg.push('</svg>');
    layerProfilePlot.innerHTML = svg.join('');
  }

  function renderPhaseNoise(row, currentPhase) {
    const width = 560;
    const height = 350;
    const margin = { left: 62, right: 24, top: 30, bottom: 48 };
    const xMin = row.groundTrackKm - 210;
    const xMax = row.groundTrackKm + 210;
    const series = [];
    for (let index = 0; index <= 84; index += 1) {
      const xKm = lerp(xMin, xMax, index / 84);
      series.push({ xKm, ...phaseStateAt(xKm) });
    }
    const scales = chartScales(width, height, margin, xMin, xMax, 0, 1);
    const coherencePath = linePath(series, scales.x, scales.y, 'xKm', 'coherence');
    const noisePath = linePath(series, scales.x, scales.y, 'xKm', 'noise');
    const svg = [];
    svg.push(`<svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="rough-noise-title rough-noise-desc">`);
    svg.push('<title id="rough-noise-title">Coherent return and roughness noise along the E19 groundtrack</title>');
    svg.push(`<desc id="rough-noise-desc">Coherence is the magnitude of the footprint-weighted complex phase sum. Roughness noise is one minus coherence.</desc>`);
    renderAxis(svg, width, height, margin, scales, [-200, -100, 0, 100, 200].map((offset) => row.groundTrackKm + offset), [0, .25, .5, .75, 1], {
      x: (value) => signed(value - row.groundTrackKm, 0),
      y: (value) => fmt(value, 2),
      xTitle: 'along-track distance from spacecraft (km)',
      yTitle: 'normalized return'
    });
    svg.push(`<path class="rough-coherence-line" d="${coherencePath}"></path>`);
    svg.push(`<path class="rough-noise-line" d="${noisePath}"></path>`);
    svg.push(`<line class="current-guide" x1="${scales.x(row.groundTrackKm)}" y1="${margin.top}" x2="${scales.x(row.groundTrackKm)}" y2="${height - margin.bottom}"></line>`);
    svg.push(`<circle class="rough-coherence-dot" cx="${scales.x(row.groundTrackKm)}" cy="${scales.y(currentPhase.coherence)}" r="5"></circle>`);
    svg.push(`<rect class="rough-noise-dot" x="${scales.x(row.groundTrackKm) - 4}" y="${scales.y(currentPhase.noise) - 4}" width="8" height="8"></rect>`);
    svg.push(`<line class="rough-legend-coherence" x1="${margin.left + 8}" y1="${margin.top + 13}" x2="${margin.left + 35}" y2="${margin.top + 13}"></line>`);
    svg.push(`<text class="label-strong" x="${margin.left + 42}" y="${margin.top + 17}">coherence</text>`);
    svg.push(`<line class="rough-legend-noise" x1="${margin.left + 130}" y1="${margin.top + 13}" x2="${margin.left + 157}" y2="${margin.top + 13}"></line>`);
    svg.push(`<text class="label-strong" x="${margin.left + 164}" y="${margin.top + 17}">phase noise</text>`);
    svg.push('</svg>');
    phaseNoisePlot.innerHTML = svg.join('');
  }

  function updateOutputs(row, currentPhase) {
    timeOutput.textContent = `${signed(state.timeS, 0)} s`;
    layerDepthOutput.textContent = `${fmt(state.layerDepthKm, 1)} km`;
    bumpHeightOutput.textContent = `${fmt(state.bumpHeightM, 1)} m`;
    bumpWidthOutput.textContent = `${fmt(state.bumpWidthKm, 0)} km`;
    bumpSpacingOutput.textContent = `${fmt(state.bumpSpacingKm, 0)} km`;
    altitudeValue.textContent = `${fmt(row.altitudeKm, 1)} km`;
    trackValue.textContent = `${signed(row.groundTrackKm, 1)} km`;
    countValue.textContent = `${bumps.length} radial bumps`;
    phaseValue.textContent = `${fmt(currentPhase.phaseSpreadDeg, 1)} deg`;
    coherenceValue.textContent = fmt(currentPhase.coherence, 3);
    noiseValue.textContent = fmt(currentPhase.noise, 3);
    const severityClass = currentPhase.noise >= .5 ? ' is-overlap' : currentPhase.noise >= .2 ? ' is-margin' : '';
    status.className = `trajectory-status${severityClass}`;
    status.textContent = `At ${signed(state.timeS, 0)} s, the 60 MHz coherent footprint has ${fmt(currentPhase.coherence * 100, 1)}% coherence and ${fmt(currentPhase.noise * 100, 1)}% roughness noise from the isotropic layer bumps.`;
  }

  function draw() {
    const row = interpolateRow(state.timeS);
    const currentPhase = phaseStateAt(row.groundTrackKm);
    updateOutputs(row, currentPhase);
    renderBumpField(row);
    renderLayerProfile(row);
    renderPhaseNoise(row, currentPhase);
  }

  function stopPlayback() {
    if (playbackFrameId !== null) cancelAnimationFrame(playbackFrameId);
    playbackFrameId = null;
    playbackTimestamp = null;
    playButton.textContent = 'Play flyby';
    playButton.setAttribute('aria-pressed', 'false');
  }

  function playbackStep(timestamp) {
    if (playbackTimestamp === null) playbackTimestamp = timestamp;
    const elapsedS = (timestamp - playbackTimestamp) / 1000;
    playbackTimestamp = timestamp;
    state.timeS += elapsedS * 22;
    if (state.timeS >= sampleEnd) {
      state.timeS = sampleEnd;
      timeSlider.value = String(state.timeS);
      draw();
      stopPlayback();
      return;
    }
    timeSlider.value = String(Math.round(state.timeS));
    draw();
    playbackFrameId = requestAnimationFrame(playbackStep);
  }

  function startPlayback() {
    if (state.timeS >= sampleEnd) state.timeS = sampleStart;
    playButton.textContent = 'Pause flyby';
    playButton.setAttribute('aria-pressed', 'true');
    playbackFrameId = requestAnimationFrame(playbackStep);
  }

  timeSlider.min = String(sampleStart);
  timeSlider.max = String(sampleEnd);
  timeSlider.step = '1';

  timeSlider.addEventListener('input', () => {
    state.timeS = Number(timeSlider.value);
    draw();
  });
  playButton.addEventListener('click', () => {
    if (playbackFrameId === null) startPlayback();
    else stopPlayback();
  });
  closestButton.addEventListener('click', () => {
    stopPlayback();
    state.timeS = 0;
    timeSlider.value = '0';
    draw();
  });

  const roughnessInputs = [layerDepthSlider, bumpHeightSlider, bumpWidthSlider, bumpSpacingSlider];
  roughnessInputs.forEach((input) => {
    input.addEventListener('input', () => {
      state.layerDepthKm = Number(layerDepthSlider.value);
      state.bumpHeightM = Number(bumpHeightSlider.value);
      state.bumpWidthKm = Number(bumpWidthSlider.value);
      state.bumpSpacingKm = Number(bumpSpacingSlider.value);
      buildBumps();
      draw();
    });
  });

  buildBumps();
  draw();
})();
