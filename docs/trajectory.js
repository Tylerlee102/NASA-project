(() => {
  'use strict';

  const C = 299792458;
  const model = {
    europaRadiusKm: 1560.8,
    closestAltitudeKm: 25,
    velocityKmS: 4.5,
    frequencyMhz: 60,
    iceIndex: 1.78,
    targetDepthKm: 6.74,
    pointCount: 12,
    dopplerToleranceHz: 25,
    depthToleranceKm: 0.15,
    timeMinS: -10,
    timeMaxS: 10
  };

  const wavelengthM = C / (model.frequencyMhz * 1e6);
  const tangentRadiusKm = model.europaRadiusKm + model.closestAltitudeKm;
  const targetEquivalentRadiusKm = model.europaRadiusKm - model.iceIndex * model.targetDepthKm;
  const requiredSurfaceRangeKm = model.closestAltitudeKm + model.iceIndex * model.targetDepthKm;
  const targetSurfaceArcKm = model.europaRadiusKm * Math.acos(
    (tangentRadiusKm ** 2 + model.europaRadiusKm ** 2 - requiredSurfaceRangeKm ** 2)
      / (2 * tangentRadiusKm * model.europaRadiusKm)
  );
  // Choose the spread so points 4 and 9 land at the target's apparent depth
  // at closest approach. With 12 evenly spaced points, those points are at
  // +/-5/11 of the total half-spread.
  const clutterSpreadKm = targetSurfaceArcKm * 11 / 5;
  const pointArcsKm = Array.from({ length: model.pointCount }, (_, index) => (
    -clutterSpreadKm + (2 * clutterSpreadKm * index) / (model.pointCount - 1)
  ));

  const slider = document.getElementById('time-slider');
  const timeOutput = document.getElementById('time-output');
  const playButton = document.getElementById('play-button');
  const closestButton = document.getElementById('closest-button');
  const altitudeValue = document.getElementById('altitude-value');
  const trackValue = document.getElementById('track-value');
  const prfValue = document.getElementById('prf-value');
  const status = document.getElementById('trajectory-status');
  const geometryPlot = document.getElementById('geometry-plot');
  const foldPlot = document.getElementById('fold-plot');
  const tracePlot = document.getElementById('trace-plot');
  const dopplerPlot = document.getElementById('doppler-plot');
  const flybyRadargramPlot = document.getElementById('flyby-radargram-plot');

  const mod = (value, divisor) => ((value % divisor) + divisor) % divisor;
  const alias = (frequencyHz, prfHz) => mod(frequencyHz + prfHz / 2, prfHz) - prfHz / 2;
  const fmt = (value, digits = 1) => Number(value).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
  const signed = (value, digits = 1) => `${value > 0 ? '+' : ''}${fmt(Math.abs(value) < 0.0005 ? 0 : value, digits)}`;
  const linePath = (rows, x, y, accessor) => rows.map((row, index) => {
    const point = accessor(row);
    return `${index ? 'L' : 'M'} ${x(point.x).toFixed(2)} ${y(point.y).toFixed(2)}`;
  }).join(' ');

  function spacecraftAt(timeS) {
    const xKm = model.velocityKmS * timeS;
    const centerDistanceKm = Math.hypot(xKm, tangentRadiusKm);
    return {
      xKm,
      yKm: tangentRadiusKm,
      altitudeKm: centerDistanceKm - model.europaRadiusKm
    };
  }

  function measureFixedPoint(timeS, radiusKm, surfaceArcKm) {
    const spacecraft = spacecraftAt(timeS);
    const angle = surfaceArcKm / model.europaRadiusKm;
    const pointXKm = radiusKm * Math.sin(angle);
    const pointYKm = radiusKm * Math.cos(angle);
    const dxKm = pointXKm - spacecraft.xKm;
    const dyKm = pointYKm - spacecraft.yKm;
    const rangeKm = Math.hypot(dxKm, dyKm);
    // Range-rate for a fixed point and a spacecraft moving along +x.
    const rangeRateKmS = ((spacecraft.xKm - pointXKm) * model.velocityKmS) / rangeKm;
    return {
      surfaceArcKm,
      pointXKm,
      pointYKm,
      rangeKm,
      apparentDepthKm: (rangeKm - spacecraft.altitudeKm) / model.iceIndex,
      trueDopplerHz: -2 * rangeRateKmS * 1000 / wavelengthM
    };
  }

  function targetAt(timeS) {
    return measureFixedPoint(timeS, targetEquivalentRadiusKm, 0);
  }

  const closestTarget = targetAt(0);
  const closestPoints = pointArcsKm.map((surfaceArcKm, index) => ({
    index,
    ...measureFixedPoint(0, model.europaRadiusKm, surfaceArcKm)
  }));
  const foldingIndexes = new Set(
    [...closestPoints]
      .sort((a, b) => Math.abs(a.apparentDepthKm - closestTarget.apparentDepthKm)
        - Math.abs(b.apparentDepthKm - closestTarget.apparentDepthKm))
      .slice(0, 2)
      .map((point) => point.index)
  );
  const closestFoldingPair = closestPoints.filter((point) => foldingIndexes.has(point.index));
  const effectivePrfHz = closestFoldingPair.reduce((sum, point) => (
    sum + Math.abs(point.trueDopplerHz - closestTarget.trueDopplerHz)
  ), 0) / closestFoldingPair.length;

  function relativeAliasHz(point, target) {
    return alias(point.trueDopplerHz - target.trueDopplerHz, effectivePrfHz);
  }

  function continuousFoldBands(timeS, target) {
    const groups = [];
    let active = null;
    let activeFoldOrder = null;
    const stepKm = 0.25;
    for (let surfaceArcKm = -240; surfaceArcKm <= 240 + 1e-9; surfaceArcKm += stepKm) {
      const point = measureFixedPoint(timeS, model.europaRadiusKm, surfaceArcKm);
      const relativeDopplerHz = point.trueDopplerHz - target.trueDopplerHz;
      const foldOrder = Math.round(relativeDopplerHz / effectivePrfHz);
      const residualHz = Math.abs(relativeDopplerHz - foldOrder * effectivePrfHz);
      // k = 0 is the unfurled zero-Doppler surface response. A true PRF fold
      // requires a nonzero integer multiple of PRF.
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

  function stateAt(timeS) {
    const spacecraft = spacecraftAt(timeS);
    const target = targetAt(timeS);
    const points = pointArcsKm.map((surfaceArcKm, index) => {
      const point = measureFixedPoint(timeS, model.europaRadiusKm, surfaceArcKm);
      return { index, ...point, relativeAliasHz: relativeAliasHz(point, target) };
    });
    const foldingPair = points.filter((point) => foldingIndexes.has(point.index));
    const bands = continuousFoldBands(timeS, target);
    const band = bands.length ? bands.reduce((best, candidate) => (
      Math.abs(candidate.centerDepthKm - target.apparentDepthKm)
        < Math.abs(best.centerDepthKm - target.apparentDepthKm) ? candidate : best
    )) : null;
    const discreteOverlap = foldingPair.some((point) => (
      Math.abs(point.relativeAliasHz) <= model.dopplerToleranceHz
      && Math.abs(point.apparentDepthKm - target.apparentDepthKm) <= model.depthToleranceKm
    ));
    const continuousOverlap = bands.some((candidate) => (
      candidate.maxDepthKm >= target.apparentDepthKm - model.depthToleranceKm
      && candidate.minDepthKm <= target.apparentDepthKm + model.depthToleranceKm
    ));
    return {
      timeS,
      spacecraft,
      target,
      points,
      foldingPair,
      bands,
      band,
      overlap: discreteOverlap && continuousOverlap
    };
  }

  const timeline = Array.from({ length: 121 }, (_, index) => (
    stateAt(model.timeMinS + ((model.timeMaxS - model.timeMinS) * index) / 120)
  ));

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

  function renderGeometry(state) {
    const width = 600;
    const height = 360;
    const margin = { left: 58, right: 24, top: 42, bottom: 46 };
    // Geometry uses the physical sign convention: positive values are above
    // the surface and negative values are below it. Reversing the y-domain
    // puts positive altitude at the top of the screen while retaining the
    // mathematical coordinates used by the model.
    const scales = chartScales(width, height, margin, -68, 68, 30, -10);
    // In a surface-relative frame, a straight tangent flyby appears as a
    // shallow parabola because Europa curves away beneath the spacecraft.
    const trajectoryRows = Array.from({ length: 137 }, (_, index) => {
      const xKm = -68 + index;
      return {
        x: xKm,
        y: Math.hypot(xKm, tangentRadiusKm) - model.europaRadiusKm
      };
    });
    const trajectoryPath = linePath(trajectoryRows, scales.x, scales.y, (row) => row);
    const spacecraftYKm = state.spacecraft.altitudeKm;
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Moving satellite on a locally parabolic closest-approach path above twelve fixed surface clutter points and one fixed subsurface target">`;
    svg += axes(width, height, margin, scales, [-60, -30, 0, 30, 60], [-10, 0, 10, 20, 30], 'along-track distance (km)', 'height above (+) / depth below (-) surface (km)', signed, signed);
    svg += `<line class="surface" x1="${scales.x(-68)}" y1="${scales.y(0)}" x2="${scales.x(68)}" y2="${scales.y(0)}"></line>`;
    // Keep the trajectory strictly as a stroked line. The explicit SVG
    // attribute prevents any browser or stale stylesheet from closing the open
    // path and painting a dark polygon beneath it.
    svg += `<path class="trajectory-line" fill="none" d="${trajectoryPath}"></path>`;
    state.foldingPair.forEach((point) => {
      svg += `<line class="ray" x1="${scales.x(state.spacecraft.xKm)}" y1="${scales.y(spacecraftYKm)}" x2="${scales.x(point.pointXKm)}" y2="${scales.y(0)}"></line>`;
    });
    state.points.forEach((point) => {
      const fold = foldingIndexes.has(point.index) ? ' fold' : '';
      svg += `<circle class="surface-point${fold}" cx="${scales.x(point.pointXKm)}" cy="${scales.y(0)}" r="${fold ? 6.5 : 4.5}"><title>Fixed clutter point ${point.index + 1}</title></circle>`;
    });
    const targetX = scales.x(0);
    // Draw the target at its physical depth. The refractive index is used only
    // in the fast-time/equivalent-range calculation, not in its drawn location.
    const targetY = scales.y(-model.targetDepthKm);
    svg += `<rect class="target" x="${targetX - 6}" y="${targetY - 6}" width="12" height="12" transform="rotate(45 ${targetX} ${targetY})"></rect>`;
    svg += `<circle class="satellite" cx="${scales.x(state.spacecraft.xKm)}" cy="${scales.y(spacecraftYKm)}" r="8"><title>Moving satellite at ${signed(state.timeS, 2)} seconds</title></circle>`;
    svg += `<text class="label-strong" x="${scales.x(state.spacecraft.xKm) + 11}" y="${scales.y(spacecraftYKm) - 10}">moving satellite: t = ${signed(state.timeS, 2)} s</text>`;
    svg += `<text class="label" x="${scales.x(-65)}" y="${scales.y(27.4)}">locally parabolic flyby path</text>`;
    svg += `<text class="label" x="${scales.x(-65)}" y="${scales.y(0) - 8}">Europa surface: 0 km</text>`;
    svg += `<text class="label-strong" x="${targetX + 12}" y="${targetY + 4}">fixed subsurface target: -${fmt(model.targetDepthKm, 2)} km</text>`;
    if (state.overlap) {
      svg += `<text class="label-danger" x="${width - margin.right}" y="24" text-anchor="end">folding overlap at closest approach</text>`;
    }
    svg += '</svg>';
    geometryPlot.innerHTML = svg;
  }

  const timelineDepthValues = timeline.flatMap((row) => [
    row.target.apparentDepthKm,
    ...row.bands.flatMap((band) => [band.minDepthKm, band.maxDepthKm]),
    ...row.foldingPair.map((point) => point.apparentDepthKm)
  ]).filter(Number.isFinite);
  const timelineDepthMin = Math.max(0, Math.floor(Math.min(...timelineDepthValues) - 0.5));
  const timelineDepthMax = Math.ceil(Math.max(...timelineDepthValues) + 0.5);
  const foldOrders = [...new Set(timeline.flatMap((row) => row.bands.map((band) => band.foldOrder)))]
    .sort((a, b) => a - b);

  function foldOrderSegments(order) {
    const segments = [];
    let active = [];
    timeline.forEach((row) => {
      const orderBand = row.bands.find((band) => band.foldOrder === order);
      if (orderBand) {
        active.push({ ...row, orderBand });
      } else if (active.length) {
        segments.push(active);
        active = [];
      }
    });
    if (active.length) segments.push(active);
    return segments;
  }

  function areaPath(rows, scales, lowAccessor, highAccessor) {
    const valid = rows.filter((row) => Number.isFinite(lowAccessor(row)) && Number.isFinite(highAccessor(row)));
    const top = valid.map((row, index) => `${index ? 'L' : 'M'} ${scales.x(row.timeS).toFixed(2)} ${scales.y(lowAccessor(row)).toFixed(2)}`).join(' ');
    const bottom = [...valid].reverse().map((row) => `L ${scales.x(row.timeS).toFixed(2)} ${scales.y(highAccessor(row)).toFixed(2)}`).join(' ');
    return `${top} ${bottom} Z`;
  }

  function renderFoldTimeline(state) {
    const width = 600;
    const height = 360;
    const margin = { left: 64, right: 24, top: 38, bottom: 48 };
    const scales = chartScales(width, height, margin, model.timeMinS, model.timeMaxS, timelineDepthMin, timelineDepthMax);
    const yTicks = Array.from({ length: 5 }, (_, index) => timelineDepthMin + ((timelineDepthMax - timelineDepthMin) * index) / 4);
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="All nonzero integer PRF fold orders and target depth through the NASA-reference flyby">`;
    svg += axes(width, height, margin, scales, [-10, -5, 0, 5, 10], yTicks, 'time from closest approach (s)', 'apparent depth (km, downward)', signed, (v) => fmt(v, 1));
    svg += `<path class="target-cell" d="${areaPath(timeline, scales, (row) => row.target.apparentDepthKm - model.depthToleranceKm, (row) => row.target.apparentDepthKm + model.depthToleranceKm)}"></path>`;
    foldOrders.forEach((order) => {
      const higherOrderClass = Math.abs(order) > 1 ? ' is-higher-order' : '';
      foldOrderSegments(order).forEach((segment) => {
        svg += `<path class="fold-band${higherOrderClass}" d="${areaPath(segment, scales, (row) => row.orderBand.minDepthKm, (row) => row.orderBand.maxDepthKm)}"></path>`;
        svg += `<path class="fold-center${higherOrderClass}" d="${linePath(segment, scales.x, scales.y, (row) => ({ x: row.timeS, y: row.orderBand.centerDepthKm }))}"></path>`;
      });
    });
    svg += `<path class="target-trace" d="${linePath(timeline, scales.x, scales.y, (row) => ({ x: row.timeS, y: row.target.apparentDepthKm }))}"></path>`;
    svg += `<line class="current-guide" x1="${scales.x(state.timeS)}" y1="${margin.top}" x2="${scales.x(state.timeS)}" y2="${height - margin.bottom}"></line>`;
    const currentBandGroups = [];
    [...state.bands].sort((a, b) => a.centerDepthKm - b.centerDepthKm).forEach((band) => {
      const existing = currentBandGroups.find((group) => Math.abs(group.centerDepthKm - band.centerDepthKm) < 0.06);
      if (existing) {
        existing.orders.push(band.foldOrder);
      } else {
        currentBandGroups.push({ centerDepthKm: band.centerDepthKm, orders: [band.foldOrder] });
      }
    });
    const bandLabelAnchor = state.timeS > 6 ? 'end' : 'start';
    const bandLabelX = scales.x(state.timeS) + (state.timeS > 6 ? -8 : 8);
    currentBandGroups.forEach((group) => {
      const orderLabel = group.orders.map((order) => signed(order, 0)).join(', ');
      svg += `<circle class="response-center" cx="${scales.x(state.timeS)}" cy="${scales.y(group.centerDepthKm)}" r="5"><title>Fold order k = ${orderLabel}</title></circle>`;
      svg += `<text class="label-danger" x="${bandLabelX}" y="${scales.y(group.centerDepthKm) - 7}" text-anchor="${bandLabelAnchor}">k = ${orderLabel}</text>`;
    });
    svg += `<rect class="target" x="${scales.x(state.timeS) - 5}" y="${scales.y(state.target.apparentDepthKm) - 5}" width="10" height="10" transform="rotate(45 ${scales.x(state.timeS)} ${scales.y(state.target.apparentDepthKm)})"></rect>`;
    svg += `<text class="label-danger" x="${margin.left + 8}" y="22">red: fold orders k = ${foldOrders.map((order) => signed(order, 0)).join(', ')}</text>`;
    svg += `<text class="label-strong" x="${width - margin.right}" y="22" text-anchor="end">teal: target fast-time trace</text>`;
    svg += '</svg>';
    foldPlot.innerHTML = svg;
  }

  function renderTraceTimeline(state) {
    const width = 600;
    const height = 360;
    const margin = { left: 64, right: 24, top: 42, bottom: 48 };
    const scales = chartScales(width, height, margin, model.timeMinS, model.timeMaxS, timelineDepthMin, timelineDepthMax);
    const yTicks = Array.from({ length: 5 }, (_, index) => timelineDepthMin + ((timelineDepthMax - timelineDepthMin) * index) / 4);
    const pairIndexes = [...foldingIndexes];
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Individual fast-time traces for the two folding clutter points and the subsurface target">`;
    svg += axes(width, height, margin, scales, [-10, -5, 0, 5, 10], yTicks, 'time from closest approach (s)', 'apparent depth / fast time (km)', signed, (v) => fmt(v, 1));
    svg += `<rect class="overlap-window" x="${scales.x(-0.12)}" y="${margin.top}" width="${scales.x(0.12) - scales.x(-0.12)}" height="${height - margin.top - margin.bottom}"></rect>`;
    const traceA = timeline.map((row) => ({ timeS: row.timeS, point: row.points[pairIndexes[0]] }));
    const traceB = timeline.map((row) => ({ timeS: row.timeS, point: row.points[pairIndexes[1]] }));
    svg += `<path class="clutter-trace-a" d="${linePath(traceA, scales.x, scales.y, (row) => ({ x: row.timeS, y: row.point.apparentDepthKm }))}"></path>`;
    svg += `<path class="clutter-trace-b" d="${linePath(traceB, scales.x, scales.y, (row) => ({ x: row.timeS, y: row.point.apparentDepthKm }))}"></path>`;
    svg += `<path class="target-trace" d="${linePath(timeline, scales.x, scales.y, (row) => ({ x: row.timeS, y: row.target.apparentDepthKm }))}"></path>`;
    svg += `<line class="current-guide" x1="${scales.x(state.timeS)}" y1="${margin.top}" x2="${scales.x(state.timeS)}" y2="${height - margin.bottom}"></line>`;
    svg += `<circle class="satellite" cx="${scales.x(state.timeS)}" cy="${margin.top - 10}" r="7"><title>Moving satellite/current radar sample</title></circle>`;
    svg += `<text class="label-strong" x="${Math.min(width - margin.right - 70, scales.x(state.timeS) + 10)}" y="${margin.top - 7}">satellite now</text>`;
    state.foldingPair.forEach((point) => {
      svg += `<circle class="response-center" cx="${scales.x(state.timeS)}" cy="${scales.y(point.apparentDepthKm)}" r="5"></circle>`;
    });
    svg += `<rect class="target" x="${scales.x(state.timeS) - 5}" y="${scales.y(state.target.apparentDepthKm) - 5}" width="10" height="10" transform="rotate(45 ${scales.x(state.timeS)} ${scales.y(state.target.apparentDepthKm)})"></rect>`;
    svg += `<text class="label" x="${margin.left + 7}" y="18">solid: fixed clutter points ${pairIndexes.map((index) => index + 1).join(' and ')}</text>`;
    svg += `<text class="label-strong" x="${width - margin.right}" y="18" text-anchor="end">dashed: fixed target's measured trace</text>`;
    svg += '</svg>';
    tracePlot.innerHTML = svg;
  }

  function renderDopplerDepth(state) {
    const width = 600;
    const height = 360;
    const margin = { left: 66, right: 24, top: 52, bottom: 48 };
    const xMin = -400;
    const xMax = 400;
    const scales = chartScales(width, height, margin, xMin, xMax, timelineDepthMin, timelineDepthMax);
    const yTicks = Array.from({ length: 5 }, (_, index) => timelineDepthMin + ((timelineDepthMax - timelineDepthMin) * index) / 4);
    const radiusX = Math.abs(scales.x(model.dopplerToleranceHz / 2) - scales.x(0));
    const radiusY = Math.abs(scales.y(state.target.apparentDepthKm + model.depthToleranceKm / 2) - scales.y(state.target.apparentDepthKm));
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Aliased clutter Doppler relative to the target and apparent depth at the current flyby time">`;
    svg += axes(width, height, margin, scales, [-400, -200, 0, 200, 400], yTicks, 'aliased Doppler relative to target (Hz)', 'apparent depth / fast time (km)', signed, (v) => fmt(v, 1));
    svg += `<rect class="target-cell" x="${scales.x(-model.dopplerToleranceHz)}" y="${scales.y(state.target.apparentDepthKm - model.depthToleranceKm)}" width="${scales.x(model.dopplerToleranceHz) - scales.x(-model.dopplerToleranceHz)}" height="${scales.y(state.target.apparentDepthKm + model.depthToleranceKm) - scales.y(state.target.apparentDepthKm - model.depthToleranceKm)}"></rect>`;
    svg += `<line class="guide" x1="${scales.x(0)}" y1="${margin.top}" x2="${scales.x(0)}" y2="${height - margin.bottom}"></line>`;
    svg += `<line class="guide" x1="${margin.left}" y1="${scales.y(state.target.apparentDepthKm)}" x2="${width - margin.right}" y2="${scales.y(state.target.apparentDepthKm)}"></line>`;
    svg += `<ellipse class="target-tail" cx="${scales.x(0)}" cy="${scales.y(state.target.apparentDepthKm)}" rx="${radiusX}" ry="${radiusY}"></ellipse>`;
    state.foldingPair.forEach((point) => {
      const visibleAlias = Math.max(xMin, Math.min(xMax, point.relativeAliasHz));
      svg += `<ellipse class="response-tail" cx="${scales.x(visibleAlias)}" cy="${scales.y(point.apparentDepthKm)}" rx="${radiusX}" ry="${radiusY}"></ellipse>`;
      svg += `<circle class="response-center" cx="${scales.x(visibleAlias)}" cy="${scales.y(point.apparentDepthKm)}" r="5"></circle>`;
    });
    svg += `<rect class="target" x="${scales.x(0) - 5}" y="${scales.y(state.target.apparentDepthKm) - 5}" width="10" height="10" transform="rotate(45 ${scales.x(0)} ${scales.y(state.target.apparentDepthKm)})"></rect>`;
    const aliases = state.foldingPair.map((point) => signed(point.relativeAliasHz, 1)).join(' Hz, ');
    svg += `<text class="${state.overlap ? 'label-danger' : 'label-strong'}" x="${margin.left}" y="21">${state.overlap ? 'OVERLAP' : 'separated'} at t = ${signed(state.timeS, 2)} s</text>`;
    svg += `<text class="label" x="${margin.left}" y="39">clutter aliases relative to target: ${aliases} Hz</text>`;
    svg += '</svg>';
    dopplerPlot.innerHTML = svg;
  }

  function renderFlybyRadargram(state) {
    const width = 720;
    const height = 340;
    const margin = { left: 66, right: 25, top: 38, bottom: 48 };
    const radarDepthValues = timeline.flatMap((row) => [
      row.target.apparentDepthKm,
      ...(row.band ? [row.band.minDepthKm, row.band.maxDepthKm] : []),
      ...row.foldingPair.map((point) => point.apparentDepthKm)
    ]).filter(Number.isFinite);
    const depthMinKm = Math.max(0, Math.floor((Math.min(...radarDepthValues) - 0.6) * 10) / 10);
    const depthMaxKm = Math.ceil((Math.max(...radarDepthValues) + 0.8) * 10) / 10;
    const scales = chartScales(width, height, margin, model.timeMinS, model.timeMaxS, depthMinKm, depthMaxKm);
    const yTicks = Array.from({ length: 5 }, (_, index) => depthMinKm + ((depthMaxKm - depthMinKm) * index) / 4);
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const nearestBandSegments = [];
    let active = [];
    let previousBand = null;
    timeline.forEach((row) => {
      if (!row.band) {
        if (active.length) nearestBandSegments.push(active);
        active = [];
        previousBand = null;
        return;
      }
      const discontinuity = previousBand
        && (previousBand.foldOrder !== row.band.foldOrder
          || Math.abs(previousBand.centerDepthKm - row.band.centerDepthKm) > 1.7);
      if (discontinuity && active.length) {
        nearestBandSegments.push(active);
        active = [];
      }
      active.push(row);
      previousBand = row.band;
    });
    if (active.length) nearestBandSegments.push(active);

    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Simplified synthetic flyby radargram with target trace and folded clutter blur">
      <defs>
        <filter id="flyby-radargram-soften" x="-8%" y="-80%" width="116%" height="260%"><feGaussianBlur stdDeviation="5"></feGaussianBlur></filter>
        <linearGradient id="flyby-radargram-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#285f64" stop-opacity=".035"></stop>
          <stop offset=".5" stop-color="#285f64" stop-opacity=".015"></stop>
          <stop offset="1" stop-color="#974143" stop-opacity=".035"></stop>
        </linearGradient>
      </defs>`;
    svg += `<rect class="radargram-bg" x="${margin.left}" y="${margin.top}" width="${plotWidth}" height="${plotHeight}"></rect>`;
    svg += `<rect x="${margin.left}" y="${margin.top}" width="${plotWidth}" height="${plotHeight}" fill="url(#flyby-radargram-bg)"></rect>`;
    for (let timeS = model.timeMinS; timeS <= model.timeMaxS + 1e-9; timeS += 1) {
      const x = scales.x(timeS);
      svg += `<rect class="radargram-trace-column" x="${x - 1}" y="${margin.top}" width="2" height="${plotHeight}"></rect>`;
    }
    [state.target.apparentDepthKm - 0.6, state.target.apparentDepthKm + 0.5, depthMinKm + 0.25, depthMaxKm - 0.3]
      .filter((depthKm) => depthKm > depthMinKm && depthKm < depthMaxKm)
      .forEach((depthKm, index) => {
        svg += `<rect class="radargram-layer" x="${margin.left}" y="${scales.y(depthKm) - 3}" width="${plotWidth}" height="6" opacity="${index < 2 ? 0.16 : 0.10}"></rect>`;
      });
    svg += axes(width, height, margin, scales, [-10, -5, 0, 5, 10], yTicks, 'time from closest approach (s)', 'apparent depth / fast time (km)', signed, (v) => fmt(v, 1));
    svg += `<path class="target-cell" d="${areaPath(timeline, scales, (row) => row.target.apparentDepthKm - model.depthToleranceKm, (row) => row.target.apparentDepthKm + model.depthToleranceKm)}"></path>`;
    nearestBandSegments.forEach((segment) => {
      svg += `<path class="radargram-fold-smear" filter="url(#flyby-radargram-soften)" d="${areaPath(segment, scales, (row) => row.band.minDepthKm - 0.10, (row) => row.band.maxDepthKm + 0.10)}"></path>`;
      svg += `<path class="radargram-fold-core" d="${areaPath(segment, scales, (row) => row.band.minDepthKm, (row) => row.band.maxDepthKm)}"></path>`;
      svg += `<path class="radargram-fold-line" d="${linePath(segment, scales.x, scales.y, (row) => ({ x: row.timeS, y: row.band.centerDepthKm }))}"></path>`;
    });
    svg += `<path class="target-trace" d="${linePath(timeline, scales.x, scales.y, (row) => ({ x: row.timeS, y: row.target.apparentDepthKm }))}"></path>`;
    svg += `<line class="current-guide" x1="${scales.x(state.timeS)}" y1="${margin.top}" x2="${scales.x(state.timeS)}" y2="${height - margin.bottom}"></line>`;
    if (state.band) {
      const bandY = scales.y(state.band.centerDepthKm);
      svg += `<ellipse class="radargram-current-blur" cx="${scales.x(state.timeS)}" cy="${bandY}" rx="34" ry="13" filter="url(#flyby-radargram-soften)"></ellipse>`;
      svg += `<circle class="response-center" cx="${scales.x(state.timeS)}" cy="${bandY}" r="5"></circle>`;
      svg += `<text class="${state.overlap ? 'label-danger' : 'label'}" x="${Math.min(width - margin.right - 120, scales.x(state.timeS) + 10)}" y="${bandY - 11}">folded clutter blur</text>`;
    }
    svg += `<rect class="target" x="${scales.x(state.timeS) - 5}" y="${scales.y(state.target.apparentDepthKm) - 5}" width="10" height="10" transform="rotate(45 ${scales.x(state.timeS)} ${scales.y(state.target.apparentDepthKm)})"></rect>`;
    svg += `<text class="label-danger" x="${margin.left + 8}" y="22">red: simplified folded-clutter smear</text>`;
    svg += `<text class="label-strong" x="${width - margin.right}" y="22" text-anchor="end">teal dashed: fixed subsurface target trace</text>`;
    svg += '</svg>';
    flybyRadargramPlot.innerHTML = svg;
  }

  function draw(timeS) {
    const state = stateAt(timeS);
    timeOutput.textContent = `${signed(timeS, 2)} s`;
    altitudeValue.textContent = `${fmt(state.spacecraft.altitudeKm, 2)} km`;
    trackValue.textContent = `${signed(state.spacecraft.xKm, 2)} km`;
    prfValue.textContent = `${fmt(effectivePrfHz, 1)} Hz`;
    status.className = `trajectory-status${state.overlap ? ' is-overlap' : ''}`;
    if (state.overlap) {
      status.textContent = `FOLDING OVERLAP: at closest approach, clutter points ${state.foldingPair.map((point) => point.index + 1).join(' and ')} occupy the target's Doppler-plus-depth cell.`;
    } else {
      const nearest = state.foldingPair.reduce((best, point) => (
        Math.abs(point.relativeAliasHz) < Math.abs(best.relativeAliasHz) ? point : best
      ));
      status.textContent = `No overlap: the nearest selected clutter return is ${signed(nearest.relativeAliasHz, 1)} Hz from the target and ${signed(nearest.apparentDepthKm - state.target.apparentDepthKm, 2)} km away in apparent depth.`;
    }
    renderGeometry(state);
    renderFoldTimeline(state);
    renderTraceTimeline(state);
    renderDopplerDepth(state);
    renderFlybyRadargram(state);
  }

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
    }, 40);
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

  draw(0);
})();
