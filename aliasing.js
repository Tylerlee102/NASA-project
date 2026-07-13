(() => {
  'use strict';

  const C = 299792458;
  const model = {
    altitudeKm: 25,
    velocityKmS: 4.6,
    frequencyMhz: 60,
    targetDepthKm: 6.74,
    iceIndex: 1.78,
    spreadKm: 60,
    dopplerToleranceHz: 25,
    depthToleranceKm: 0.15
  };

  const prfSlider = document.getElementById('effective-prf-slider');
  const output = document.getElementById('effective-prf-output');
  const originalPrfText = document.getElementById('original-prf');
  const status = document.getElementById('trace-status');
  const plot = document.getElementById('horizontal-plot');
  const blurPlot = document.getElementById('blur-plot');
  const traceCheckPlot = document.getElementById('trace-check-plot');
  const dopplerCheckPlot = document.getElementById('doppler-check-plot');
  const wavelengthM = C / (model.frequencyMhz * 1e6);
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

  // The simplified model contains exactly two radar returns: one surface
  // clutter point and one subsurface target. Choose the surface point's slant
  // range so its apparent depth is exactly the target depth.
  const surfaceRangeKm = model.altitudeKm + model.iceIndex * model.targetDepthKm;
  const surfaceXKm = Math.sqrt(surfaceRangeKm ** 2 - model.altitudeKm ** 2);
  const surfaceClutterPoint = {
    index: 0,
    xKm: surfaceXKm,
    rangeKm: surfaceRangeKm,
    trueDopplerHz: (2 * model.velocityKmS * 1000 / wavelengthM) * (surfaceXKm / surfaceRangeKm),
    apparentDepthKm: (surfaceRangeKm - model.altitudeKm) / model.iceIndex
  };
  const fixedPoints = [surfaceClutterPoint];

  document.getElementById('given-altitude').textContent = `${fmt(model.altitudeKm, 0)} km`;
  document.getElementById('given-speed').textContent = `${fmt(model.velocityKmS, 1)} km/s`;
  document.getElementById('given-frequency').textContent = `${fmt(model.frequencyMhz, 0)} MHz`;
  document.getElementById('given-depth').textContent = `${fmt(model.targetDepthKm, 2)} km`;
  document.getElementById('given-index').textContent = fmt(model.iceIndex, 2);

  function calculate(effectivePrfHz) {
    const surfaceReturn = {
      ...surfaceClutterPoint,
      aliasedDopplerHz: alias(surfaceClutterPoint.trueDopplerHz, effectivePrfHz)
    };
    const depthDifferenceKm = surfaceReturn.apparentDepthKm - model.targetDepthKm;
    const targetOverlap = Math.abs(surfaceReturn.aliasedDopplerHz) <= model.dopplerToleranceHz
      && Math.abs(depthDifferenceKm) <= model.depthToleranceKm;
    return {
      points: [surfaceReturn],
      foldingPair: [surfaceReturn],
      surfaceReturn,
      depthDifferenceKm,
      targetOverlap,
      effectivePrfHz
    };
  }

  function renderDepthAlignment(effectivePrfHz, surfaceReturn, overlapsTarget) {
    const width = 560;
    const height = 350;
    const margin = { left: 68, right: 25, top: 50, bottom: 42 };
    const depthMinKm = 6.2;
    const depthMaxKm = 7.3;
    const sy = (value) => margin.top + ((value - depthMinKm) / (depthMaxKm - depthMinKm)) * (height - margin.top - margin.bottom);
    const clutterTop = sy(surfaceReturn.apparentDepthKm - model.depthToleranceKm);
    const clutterBottom = sy(surfaceReturn.apparentDepthKm + model.depthToleranceKm);
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Depth alignment of one surface clutter return and one subsurface target">`;

    svg += `<text class="blur-title-text" x="${margin.left}" y="18">surface clutter depth: ${fmt(surfaceReturn.apparentDepthKm, 2)} km</text>`;
    svg += `<text class="blur-title-text" x="${margin.left}" y="35">current surface alias: ${signed(surfaceReturn.aliasedDopplerHz, 1)} Hz at PRF ${fmt(effectivePrfHz, 1)} Hz</text>`;
    for (let index = 0; index < 6; index += 1) {
      const value = depthMinKm + ((depthMaxKm - depthMinKm) * index) / 5;
      const y = sy(value);
      svg += `<line class="blur-grid" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line>`;
      svg += `<text class="blur-label" x="${margin.left - 10}" y="${y + 4}" text-anchor="end">${fmt(value, 2)}</text>`;
    }
    svg += `<line class="blur-axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>`;
    svg += `<rect class="blur-target-window" x="${margin.left}" y="${sy(model.targetDepthKm - model.depthToleranceKm)}" width="${width - margin.left - margin.right}" height="${sy(model.targetDepthKm + model.depthToleranceKm) - sy(model.targetDepthKm - model.depthToleranceKm)}"></rect>`;
    svg += `<line class="blur-target-depth" x1="${margin.left}" y1="${sy(model.targetDepthKm)}" x2="${width - margin.right}" y2="${sy(model.targetDepthKm)}"></line>`;
    svg += `<rect class="depth-clutter-band${overlapsTarget ? ' overlap' : ''}" x="${margin.left}" y="${clutterTop}" width="${width - margin.left - margin.right}" height="${Math.max(1, clutterBottom - clutterTop)}"></rect>`;
    svg += `<line class="depth-clutter-center" x1="${margin.left}" y1="${sy(surfaceReturn.apparentDepthKm)}" x2="${width - margin.right}" y2="${sy(surfaceReturn.apparentDepthKm)}"></line>`;
    svg += `<text class="blur-title-text" x="${width - margin.right}" y="${sy(model.targetDepthKm) - 9}" text-anchor="end">target and surface return: ${fmt(model.targetDepthKm, 2)} km</text>`;
    svg += `<text class="${overlapsTarget ? 'check-danger' : 'blur-title-text'}" x="${margin.left + 10}" y="${clutterBottom + 18}">${overlapsTarget ? 'depth + Doppler overlap' : 'depth matches; Doppler remains separated'}</text>`;

    svg += `<text class="blur-title-text" transform="translate(17 ${margin.top + (height - margin.top - margin.bottom) / 2}) rotate(-90)" text-anchor="middle">apparent depth (km, downward)</text>`;
    svg += '</svg>';
    blurPlot.innerHTML = svg;
  }

  // Check 1: plot the two real returns directly against PRF. This replaces the
  // earlier schematic hyperbolas with motion that is caused by the alias
  // equation itself: the surface return moves while the target stays at 0 Hz.
  function renderPrfTrace(effectivePrfHz, surfaceReturn, overlapsTarget) {
    const width = 560;
    const height = 350;
    const margin = { left: 68, right: 25, top: 55, bottom: 48 };
    const prfMinHz = Number(prfSlider.min);
    const prfMaxHz = Number(prfSlider.max);
    const aliasMinHz = -35;
    const aliasMaxHz = 35;
    const sx = (value) => margin.left + ((value - prfMinHz) / (prfMaxHz - prfMinHz)) * (width - margin.left - margin.right);
    const sy = (value) => margin.top + ((aliasMaxHz - value) / (aliasMaxHz - aliasMinHz)) * (height - margin.top - margin.bottom);
    const surfacePath = Array.from({ length: 221 }, (_, index) => {
      const prfHz = prfMinHz + ((prfMaxHz - prfMinHz) * index) / 220;
      const aliasedDopplerHz = alias(surfaceClutterPoint.trueDopplerHz, prfHz);
      return `${index ? 'L' : 'M'} ${sx(prfHz).toFixed(2)} ${sy(aliasedDopplerHz).toFixed(2)}`;
    }).join(' ');
    const currentX = sx(effectivePrfHz);
    const surfaceY = sy(surfaceReturn.aliasedDopplerHz);
    const targetY = sy(0);
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Aliased Doppler versus PRF for one surface clutter return and one fixed subsurface target">`;

    svg += `<text class="check-title" x="${margin.left}" y="18">surface clutter</text>`;
    svg += `<text class="check-title" x="${margin.left + 130}" y="18">target: 0 Hz</text>`;
    svg += `<text class="${overlapsTarget ? 'check-danger' : 'check-title'}" x="${margin.left}" y="39">current alias: ${signed(surfaceReturn.aliasedDopplerHz, 1)} Hz</text>`;
    [-30, -15, 0, 15, 30].forEach((value) => {
      const y = sy(value);
      svg += `<line class="check-grid-line" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line>`;
      svg += `<text class="check-label" x="${margin.left - 9}" y="${y + 4}" text-anchor="end">${signed(value, 0)}</text>`;
    });
    [1330, 1340, 1350, 1360, 1370, 1385].forEach((value) => {
      const x = sx(value);
      svg += `<line class="check-grid-line" x1="${x}" y1="${margin.top}" x2="${x}" y2="${height - margin.bottom}"></line>`;
      svg += `<text class="check-label" x="${x}" y="${height - margin.bottom + 17}" text-anchor="middle">${fmt(value, 0)}</text>`;
    });
    svg += `<rect class="prf-trace-window" x="${margin.left}" y="${sy(model.dopplerToleranceHz)}" width="${width - margin.left - margin.right}" height="${sy(-model.dopplerToleranceHz) - sy(model.dopplerToleranceHz)}"></rect>`;
    svg += `<path class="prf-trace-target" d="M ${margin.left} ${targetY} L ${width - margin.right} ${targetY}"></path>`;
    svg += `<path class="prf-trace-surface" d="${surfacePath}"></path>`;
    svg += `<line class="prf-trace-current" x1="${currentX}" y1="${margin.top}" x2="${currentX}" y2="${height - margin.bottom}"></line>`;
    svg += `<circle class="prf-trace-surface-point" cx="${currentX}" cy="${surfaceY}" r="6"></circle>`;
    svg += `<rect class="prf-trace-target-point" x="${currentX - 5}" y="${targetY - 5}" width="10" height="10" transform="rotate(45 ${currentX} ${targetY})"></rect>`;
    svg += `<line class="check-axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>`;
    svg += `<line class="check-axis" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"></line>`;
    svg += `<text class="check-title" x="${margin.left + (width - margin.left - margin.right) / 2}" y="${height - 7}" text-anchor="middle">effective sampling PRF (Hz)</text>`;
    svg += `<text class="check-title" transform="translate(17 ${margin.top + (height - margin.top - margin.bottom) / 2}) rotate(-90)" text-anchor="middle">aliased Doppler (Hz)</text>`;
    svg += '</svg>';
    traceCheckPlot.innerHTML = svg;
  }

  // Check 2: show the target resolution cell in fast-time × Doppler space.
  // The clutter ellipses move horizontally as their true Dopplers alias.
  function renderFastTimeDopplerCheck(effectivePrfHz, foldingPair, overlapsTarget) {
    const width = 560;
    const height = 350;
    const margin = { left: 68, right: 25, top: 55, bottom: 48 };
    const dopplerMinHz = -60;
    const dopplerMaxHz = 60;
    const depthMinKm = 6.2;
    const depthMaxKm = 7.3;
    const sx = (value) => margin.left + ((value - dopplerMinHz) / (dopplerMaxHz - dopplerMinHz)) * (width - margin.left - margin.right);
    const sy = (value) => margin.top + ((value - depthMinKm) / (depthMaxKm - depthMinKm)) * (height - margin.top - margin.bottom);
    // Each response gets half the combined overlap tolerance. Their visible
    // tails touch exactly when the center-to-center tolerance is reached.
    const tailRadiusX = Math.abs(sx(model.dopplerToleranceHz / 2) - sx(0));
    const tailRadiusY = Math.abs(sy(model.targetDepthKm + model.depthToleranceKm / 2) - sy(model.targetDepthKm));
    const clutterAliasHz = foldingPair[0].aliasedDopplerHz;
    const stateLabel = overlapsTarget ? 'folded tails overlap the target response' : 'folded tails remain separated from the target response';
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Fast-time by aliased Doppler check at ${fmt(effectivePrfHz, 1)} hertz; ${stateLabel}">
      <defs>
        <clipPath id="doppler-check-clip"><rect x="${margin.left}" y="${margin.top}" width="${width - margin.left - margin.right}" height="${height - margin.top - margin.bottom}"></rect></clipPath>
        <radialGradient id="clutter-tail"><stop offset="0" stop-color="#9b3d3f" stop-opacity=".55"></stop><stop offset=".55" stop-color="#d98473" stop-opacity=".25"></stop><stop offset="1" stop-color="#d98473" stop-opacity=".03"></stop></radialGradient>
        <radialGradient id="target-tail"><stop offset="0" stop-color="#2f6f73" stop-opacity=".50"></stop><stop offset=".58" stop-color="#2f6f73" stop-opacity=".20"></stop><stop offset="1" stop-color="#2f6f73" stop-opacity=".03"></stop></radialGradient>
      </defs>`;

    svg += `<text class="check-title" x="${margin.left}" y="18">surface alias: ${signed(clutterAliasHz, 1)} Hz</text>`;
    svg += `<text class="${overlapsTarget ? 'check-danger' : 'check-title'}" x="${margin.left}" y="39">${stateLabel}</text>`;
    [-50, -25, 0, 25, 50].forEach((value) => {
      const x = sx(value);
      svg += `<line class="check-grid-line" x1="${x}" y1="${margin.top}" x2="${x}" y2="${height - margin.bottom}"></line>`;
      svg += `<text class="check-label" x="${x}" y="${height - margin.bottom + 17}" text-anchor="middle">${signed(value, 0)}</text>`;
    });
    [6.3, 6.5, 6.7, 6.9, 7.1, 7.3].forEach((value) => {
      const y = sy(value);
      svg += `<line class="check-grid-line" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line>`;
      svg += `<text class="check-label" x="${margin.left - 9}" y="${y + 4}" text-anchor="end">${fmt(value, 1)}</text>`;
    });
    svg += `<g clip-path="url(#doppler-check-clip)">`;
    svg += `<rect class="check-target-window" x="${sx(-model.dopplerToleranceHz)}" y="${sy(model.targetDepthKm - model.depthToleranceKm)}" width="${sx(model.dopplerToleranceHz) - sx(-model.dopplerToleranceHz)}" height="${sy(model.targetDepthKm + model.depthToleranceKm) - sy(model.targetDepthKm - model.depthToleranceKm)}"></rect>`;
    svg += `<line class="check-target-line" x1="${sx(0)}" y1="${margin.top}" x2="${sx(0)}" y2="${height - margin.bottom}"></line>`;
    svg += `<line class="check-target-line" x1="${margin.left}" y1="${sy(model.targetDepthKm)}" x2="${width - margin.right}" y2="${sy(model.targetDepthKm)}"></line>`;
    svg += `<ellipse class="check-target-tail" cx="${sx(0)}" cy="${sy(model.targetDepthKm)}" rx="${tailRadiusX}" ry="${tailRadiusY}"></ellipse>`;
    foldingPair.forEach((point) => {
      svg += `<ellipse class="check-clutter-tail" cx="${sx(point.aliasedDopplerHz)}" cy="${sy(point.apparentDepthKm)}" rx="${tailRadiusX}" ry="${tailRadiusY}"><title>Surface clutter: ${signed(point.aliasedDopplerHz, 1)} Hz at ${fmt(point.apparentDepthKm, 2)} km</title></ellipse>`;
    });
    svg += '</g>';
    foldingPair.forEach((point) => {
      svg += `<circle class="check-clutter-center" cx="${sx(point.aliasedDopplerHz)}" cy="${sy(point.apparentDepthKm)}" r="5"></circle>`;
    });
    svg += `<rect class="check-target-center" x="${sx(0) - 5}" y="${sy(model.targetDepthKm) - 5}" width="10" height="10" transform="rotate(45 ${sx(0)} ${sy(model.targetDepthKm)})"></rect>`;
    svg += `<line class="check-axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>`;
    svg += `<line class="check-axis" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"></line>`;
    svg += `<text class="check-title" x="${margin.left + (width - margin.left - margin.right) / 2}" y="${height - 7}" text-anchor="middle">aliased Doppler (Hz)</text>`;
    svg += `<text class="check-title" transform="translate(17 ${margin.top + (height - margin.top - margin.bottom) / 2}) rotate(-90)" text-anchor="middle">apparent depth / fast time (km)</text>`;
    svg += '</svg>';
    dopplerCheckPlot.innerHTML = svg;
  }

  function draw(effectivePrfHz) {
    const { points, foldingPair, surfaceReturn, depthDifferenceKm, targetOverlap } = calculate(effectivePrfHz);
    const width = 560;
    const height = 350;
    const surfaceY = 138;
    const satelliteX = width / 2;
    const satelliteY = 34;
    const left = 64;
    const right = 38;
    const targetDepthRangeKm = 12;
    const sx = (xKm) => left + ((xKm + model.spreadKm) / (2 * model.spreadKm)) * (width - left - right);
    const depthToY = (depthKm) => surfaceY + (depthKm / targetDepthRangeKm) * 145;
    const targetY = depthToY(model.targetDepthKm);
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="One fixed surface clutter point and one fixed subsurface target viewed from a fixed geometry snapshot">
      <defs>
        <radialGradient id="target-blur"><stop offset="0" stop-color="#9b3d3f" stop-opacity=".44"></stop><stop offset=".45" stop-color="#d98473" stop-opacity=".16"></stop><stop offset="1" stop-color="#d98473" stop-opacity="0"></stop></radialGradient>
        <marker id="velocity-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#17494d"></path></marker>
      </defs>`;
    svg += `<line class="geometry-surface" x1="${left}" y1="${surfaceY}" x2="${width - right}" y2="${surfaceY}"></line>`;
    svg += `<line class="geometry-depth-guide" x1="${satelliteX}" y1="${surfaceY}" x2="${satelliteX}" y2="${targetY}"></line>`;
    svg += `<line class="geometry-nadir" x1="${satelliteX}" y1="${satelliteY + 9}" x2="${satelliteX}" y2="${targetY - 10}"></line>`;
    foldingPair.forEach((point) => {
      svg += `<line class="geometry-ray ${targetOverlap ? 'overlap' : ''}" x1="${satelliteX}" y1="${satelliteY + 9}" x2="${sx(point.xKm)}" y2="${surfaceY - 7}"></line>`;
    });
    if (targetOverlap) svg += `<circle class="geometry-blur" cx="${satelliteX}" cy="${targetY}" r="56"></circle>`;
    svg += `<circle class="geometry-satellite" cx="${satelliteX}" cy="${satelliteY}" r="8"></circle>`;
    svg += `<line class="geometry-velocity" x1="${satelliteX + 12}" y1="${satelliteY}" x2="${satelliteX + 82}" y2="${satelliteY}" marker-end="url(#velocity-arrow)"></line>`;
    svg += `<text class="geometry-value" x="${satelliteX + 18}" y="${satelliteY - 13}">satellite and geometry fixed</text>`;
    svg += `<text class="geometry-title" x="${left}" y="${surfaceY - 23}">one surface clutter point</text>`;
    svg += `<text class="geometry-title" x="${satelliteX + 16}" y="${targetY + 33}">one fixed subsurface target</text>`;
    points.forEach((point) => {
      const css = targetOverlap ? 'overlap' : 'closest';
      svg += `<circle class="geometry-surface-point ${css}" cx="${sx(point.xKm)}" cy="${surfaceY}" r="8"><title>Surface clutter: aliased Doppler ${fmt(point.aliasedDopplerHz, 1)} Hz</title></circle>`;
    });
    svg += `<rect class="geometry-target ${targetOverlap ? 'overlap' : ''}" x="${satelliteX - 8}" y="${targetY - 8}" width="16" height="16" transform="rotate(45 ${satelliteX} ${targetY})"><title>Single fixed subsurface target: 0 Hz at ${fmt(model.targetDepthKm, 2)} km</title></rect>`;
    svg += `<text class="geometry-value" x="${left + 12}" y="${surfaceY + 24}">surface alias: ${signed(surfaceReturn.aliasedDopplerHz, 1)} Hz</text>`;
    if (targetOverlap) {
      svg += `<text class="geometry-danger" x="${satelliteX}" y="${targetY + 56}" text-anchor="middle">CLUTTER / TARGET OVERLAP</text>`;
    }
    svg += `<text class="geometry-label" x="${satelliteX + 16}" y="${(surfaceY + targetY) / 2}">target depth ${fmt(model.targetDepthKm, 2)} km</text>`;
    svg += '</svg>';
    plot.innerHTML = svg;

    renderDepthAlignment(effectivePrfHz, surfaceReturn, targetOverlap);
    renderPrfTrace(effectivePrfHz, surfaceReturn, targetOverlap);
    renderFastTimeDopplerCheck(effectivePrfHz, foldingPair, targetOverlap);
    originalPrfText.textContent = `Surface true Doppler: ${fmt(surfaceClutterPoint.trueDopplerHz, 1)} Hz. Only the effective sampling PRF moves.`;
    output.textContent = `${fmt(effectivePrfHz, 1)} Hz`;
    status.className = `prf-status${targetOverlap ? ' is-overlap' : ''}`;
    if (targetOverlap) {
      status.textContent = `Overlap at ${fmt(effectivePrfHz, 1)} Hz: the surface return aliases to ${signed(surfaceReturn.aliasedDopplerHz, 1)} Hz in the target's ${fmt(model.targetDepthKm, 2)} km cell.`;
    } else {
      status.textContent = `No overlap at ${fmt(effectivePrfHz, 1)} Hz: the two returns match in depth (Δ ${signed(depthDifferenceKm, 2)} km), but the surface return is ${signed(surfaceReturn.aliasedDopplerHz, 1)} Hz from the target.`;
    }
  }

  prfSlider.addEventListener('input', () => draw(Number(prfSlider.value)));
  draw(Number(prfSlider.value));
})();
