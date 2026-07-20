(() => {
  'use strict';

  const data = window.E19_FLYBY;
  const C = 299792458;
  const RADAR_FREQUENCY_MHZ = 60;
  const WAVELENGTH_M = C / (RADAR_FREQUENCY_MHZ * 1e6);

  const slider = document.getElementById('time-slider');
  const timeOutput = document.getElementById('time-output');
  const playButton = document.getElementById('play-button');
  const closestButton = document.getElementById('closest-button');
  const altitudeValue = document.getElementById('altitude-value');
  const trackValue = document.getElementById('track-value');
  const subpointValue = document.getElementById('subpoint-value');
  const speedValue = document.getElementById('speed-value');
  const incidenceValue = document.getElementById('incidence-value');
  const cilixValue = document.getElementById('cilix-value');
  const aliasRiskValue = document.getElementById('alias-risk-value');
  const status = document.getElementById('trajectory-status');
  const e19DataPlot = document.getElementById('e19-data-plot');
  const geometryPlot = document.getElementById('geometry-plot');
  const foldPlot = document.getElementById('fold-plot');
  const tracePlot = document.getElementById('trace-plot');
  const dopplerPlot = document.getElementById('doppler-plot');
  const tablePlot = document.getElementById('flyby-radargram-plot');

  if (!data || !Array.isArray(data.samples) || data.samples.length < 3) {
    if (status) {
      status.className = 'trajectory-status is-overlap';
      status.textContent = 'E19 trajectory data did not load. Check docs/data/e19-flyby.js.';
    }
    return;
  }

  const samples = data.samples;
  const sampleStart = data.flyby.sampleWindowS.start;
  const sampleEnd = data.flyby.sampleWindowS.end;
  const sampleStep = data.flyby.sampleWindowS.step;
  const coreWindow = data.flyby.coreReconableWindow;
  const closest = data.flyby.closestApproach;
  const cilix = data.cilix;
  const closestDate = new Date(`${data.flyby.closestApproachUtc}Z`);
  let currentOffset = 0;
  let playbackFrameId = null;
  let lastPlaybackTimestamp = null;
  let lastRenderedSecond = null;
  const playbackRate = 18;
  const aliasAnalysis = {
    source: 'MATLAB R2026a',
    prfFloorHz: 3416.36346301951,
    broadAliasSector: {
      startS: -99.5,
      endS: 144,
      label: '3000 Hz still aliases'
    },
    zeroFoldSectors: [
      {
        prfHz: 737.7,
        startS: -104,
        endS: -102.5,
        centerS: -103.5,
        aliasHz: -2.02209045164466,
        foldOrder: -2,
        label: '737.7 Hz fold'
      },
      {
        prfHz: 737.7,
        startS: 152,
        endS: 155.5,
        centerS: 153.5,
        aliasHz: -0.821259708891489,
        foldOrder: -2,
        label: 'strongest 737.7 Hz fold',
        strongest: true
      },
      {
        prfHz: 1500,
        startS: -101.5,
        endS: -98,
        centerS: -99.5,
        aliasHz: -1.63884376303804,
        foldOrder: -1,
        label: '1500 Hz fold'
      },
      {
        prfHz: 1500,
        startS: 140,
        endS: 148,
        centerS: 144,
        aliasHz: -0.237874563227706,
        foldOrder: -1,
        label: 'long 1500 Hz fold'
      }
    ]
  };

  slider.min = sampleStart;
  slider.max = sampleEnd;
  slider.step = 1;
  slider.value = 0;

  const fmt = (value, digits = 1) => Number(value).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
  const signed = (value, digits = 1) => `${value > 0 ? '+' : ''}${fmt(Math.abs(value) < 0.0005 ? 0 : value, digits)}`;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const escapeHtml = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  function satelliteIcon(x, y, size = 8) {
    const bodyW = size * 0.9;
    const bodyH = size * 0.68;
    const panelW = size * 0.95;
    const panelH = size * 0.42;
    const boom = size * 0.45;
    const antenna = size * 0.45;
    const n = (value) => Number(value).toFixed(2);
    return `
      <g class="satellite-icon" transform="translate(${n(x)} ${n(y)}) rotate(-18)">
        <line class="satellite-boom" x1="${n(-bodyW / 2 - boom)}" y1="0" x2="${n(bodyW / 2 + boom)}" y2="0"></line>
        <rect class="satellite-panel" x="${n(-bodyW / 2 - boom - panelW)}" y="${n(-panelH / 2)}" width="${n(panelW)}" height="${n(panelH)}" rx="1"></rect>
        <rect class="satellite-panel" x="${n(bodyW / 2 + boom)}" y="${n(-panelH / 2)}" width="${n(panelW)}" height="${n(panelH)}" rx="1"></rect>
        <rect class="satellite-body" x="${n(-bodyW / 2)}" y="${n(-bodyH / 2)}" width="${n(bodyW)}" height="${n(bodyH)}" rx="1.5"></rect>
        <line class="satellite-antenna" x1="0" y1="${n(-bodyH / 2)}" x2="0" y2="${n(-bodyH / 2 - antenna)}"></line>
        <circle class="satellite-node" cx="0" cy="${n(-bodyH / 2 - antenna)}" r="${n(size * 0.12)}"></circle>
      </g>
    `;
  }

  function utcForOffset(offsetS) {
    return new Date(closestDate.getTime() + offsetS * 1000).toISOString().replace('.000Z', 'Z');
  }

  function interpolateRow(offsetS) {
    const bounded = clamp(offsetS, sampleStart, sampleEnd);
    const floatingIndex = (bounded - sampleStart) / sampleStep;
    const lowerIndex = clamp(Math.floor(floatingIndex), 0, samples.length - 1);
    const upperIndex = clamp(lowerIndex + 1, 0, samples.length - 1);
    const lower = samples[lowerIndex];
    const upper = samples[upperIndex];
    const mix = upperIndex === lowerIndex ? 0 : floatingIndex - lowerIndex;
    const row = { offsetS: bounded, utc: utcForOffset(bounded) };
    [
      'latDeg',
      'lonEastDeg',
      'altitudeKm',
      'speedKmS',
      'radialSpeedKmS',
      'incidenceDeg',
      'distanceToCilixKm',
      'groundTrackKm'
    ].forEach((key) => {
      row[key] = lerp(lower[key], upper[key], mix);
    });
    row.reconableCore = row.altitudeKm >= 50 && row.altitudeKm <= 100
      && row.incidenceDeg >= 30 && row.incidenceDeg <= 60;
    row.reconableMargin = row.altitudeKm >= 35 && row.altitudeKm <= 105
      && row.incidenceDeg >= 20 && row.incidenceDeg <= 60;
    return row;
  }

  function derivedLook(row) {
    const lookAngleDeg = Math.atan2(row.distanceToCilixKm, row.altitudeKm) * 180 / Math.PI;
    const slantRangeKm = Math.hypot(row.altitudeKm, row.distanceToCilixKm);
    const before = interpolateRow(row.offsetS - 1);
    const after = interpolateRow(row.offsetS + 1);
    const rangeRateKmS = (after.distanceToCilixKm - before.distanceToCilixKm) / 2;
    const dopplerHz = -2 * rangeRateKmS * 1000 / WAVELENGTH_M;
    return { lookAngleDeg, slantRangeKm, rangeRateKmS, dopplerHz };
  }

  function chartScales(width, height, margin, xMin, xMax, yMin, yMax) {
    return {
      x: (value) => margin.left + ((value - xMin) / (xMax - xMin)) * (width - margin.left - margin.right),
      y: (value) => margin.top + ((value - yMin) / (yMax - yMin)) * (height - margin.top - margin.bottom)
    };
  }

  function pathFor(rows, scales, xKey, yKey) {
    return rows.map((row, index) => (
      `${index ? 'L' : 'M'} ${scales.x(row[xKey]).toFixed(2)} ${scales.y(row[yKey]).toFixed(2)}`
    )).join(' ');
  }

  function linePath(rows, x, y, pointFor) {
    return rows.map((row, index) => {
      const point = pointFor(row);
      return `${index ? 'L' : 'M'} ${x(point.x).toFixed(2)} ${y(point.y).toFixed(2)}`;
    }).join(' ');
  }

  function axis(svg, width, height, margin, scales, xTicks, yTicks, labels) {
    yTicks.forEach((value) => {
      const y = scales.y(value);
      svg.push(`<line class="grid" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line>`);
      svg.push(`<text class="label" x="${margin.left - 9}" y="${y + 4}" text-anchor="end">${labels.y(value)}</text>`);
    });
    xTicks.forEach((value) => {
      const x = scales.x(value);
      svg.push(`<line class="grid" x1="${x}" y1="${margin.top}" x2="${x}" y2="${height - margin.bottom}"></line>`);
      svg.push(`<text class="label" x="${x}" y="${height - margin.bottom + 19}" text-anchor="middle">${labels.x(value)}</text>`);
    });
    svg.push(`<line class="axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>`);
    svg.push(`<line class="axis" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"></line>`);
    svg.push(`<text class="label-strong" x="${margin.left + (width - margin.left - margin.right) / 2}" y="${height - 7}" text-anchor="middle">${labels.xTitle}</text>`);
    svg.push(`<text class="label-strong" transform="translate(17 ${margin.top + (height - margin.top - margin.bottom) / 2}) rotate(-90)" text-anchor="middle">${labels.yTitle}</text>`);
  }

  function rowsInWindow(windowInfo) {
    if (!windowInfo) return [];
    return samples.filter((row) => row.offsetS >= windowInfo.startOffsetS && row.offsetS <= windowInfo.endOffsetS);
  }

  function rowsInSector(sector) {
    const rows = [
      interpolateRow(sector.startS),
      ...samples.filter((entry) => entry.offsetS > sector.startS && entry.offsetS < sector.endS),
      interpolateRow(sector.endS)
    ];
    return rows.sort((a, b) => a.offsetS - b.offsetS);
  }

  function activePrfSector(offsetS) {
    const fold = aliasAnalysis.zeroFoldSectors.find((sector) => (
      offsetS >= sector.startS && offsetS <= sector.endS
    ));
    if (fold) return { ...fold, kind: 'fold' };
    const broad = aliasAnalysis.broadAliasSector;
    if (offsetS >= broad.startS && offsetS <= broad.endS) {
      return { ...broad, kind: 'alias' };
    }
    return null;
  }

  function renderAliasBands(svg, sx, y, height, options = {}) {
    const { showBroad = true, labelStrongest = false } = options;
    if (showBroad) {
      const broad = aliasAnalysis.broadAliasSector;
      const x0 = sx(broad.startS);
      const x1 = sx(broad.endS);
      svg.push(`<rect class="alias-sector is-broad" x="${x0}" y="${y}" width="${Math.max(1, x1 - x0)}" height="${height}"></rect>`);
      if (options.labelBroad) {
        svg.push(`<text class="label-warning" x="${Math.min(x1 - 104, x0 + 6)}" y="${y + 14}">${broad.label}</text>`);
      }
    }
    aliasAnalysis.zeroFoldSectors.forEach((sector) => {
      const x0 = sx(sector.startS);
      const x1 = sx(sector.endS);
      const className = `alias-sector${sector.strongest ? ' is-strongest' : ''}`;
      svg.push(`<rect class="${className}" x="${x0}" y="${y}" width="${Math.max(2, x1 - x0)}" height="${height}"></rect>`);
      svg.push(`<line class="alias-sector-center" x1="${sx(sector.centerS)}" y1="${y}" x2="${sx(sector.centerS)}" y2="${y + height}"></line>`);
      if (sector.strongest && labelStrongest) {
        svg.push(`<text class="label-danger" x="${Math.max(78, sx(sector.centerS) - 118)}" y="${y + 30}">${sector.label}</text>`);
      }
    });
  }

  function renderE19DataPlot(row) {
    if (!e19DataPlot) return;
    const width = 860;
    const height = 440;
    const margin = { left: 78, right: 34, top: 42, bottom: 48 };
    const laneHeight = 82;
    const laneGap = 28;
    const lanes = [
      {
        key: 'altitudeKm',
        label: 'Altitude',
        unit: 'km',
        min: 0,
        max: 360,
        top: margin.top,
        className: 'data-altitude-line',
        value: (entry) => `${fmt(entry.altitudeKm, 1)} km`
      },
      {
        key: 'incidenceDeg',
        label: 'Incidence',
        unit: 'deg',
        min: 0,
        max: 80,
        top: margin.top + laneHeight + laneGap,
        className: 'data-incidence-line',
        value: (entry) => `${fmt(entry.incidenceDeg, 1)} deg`
      },
      {
        key: 'distanceToCilixKm',
        label: 'Cilix distance',
        unit: 'km',
        min: 0,
        max: 1600,
        top: margin.top + 2 * (laneHeight + laneGap),
        className: 'data-distance-line',
        value: (entry) => `${fmt(entry.distanceToCilixKm, 1)} km`
      }
    ];
    const plotLeft = margin.left;
    const plotRight = width - margin.right;
    const plotBottom = height - margin.bottom;
    const sx = (value) => margin.left + ((value - sampleStart) / (sampleEnd - sampleStart)) * (plotRight - margin.left);
    const sy = (value, lane) => lane.top + ((lane.max - value) / (lane.max - lane.min)) * laneHeight;
    const pathForLane = (lane) => samples.map((entry, index) => (
      `${index ? 'L' : 'M'} ${sx(entry.offsetS).toFixed(2)} ${sy(entry[lane.key], lane).toFixed(2)}`
    )).join(' ');
    const svg = [`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="E19 flyby sampled data plotted against time">`];

    if (coreWindow) {
      const x0 = sx(coreWindow.startOffsetS);
      const x1 = sx(coreWindow.endOffsetS);
      svg.push(`<rect class="reconable-window" x="${x0}" y="${margin.top - 16}" width="${x1 - x0}" height="${plotBottom - margin.top + 16}"></rect>`);
      svg.push(`<text class="label" x="${x0 + 6}" y="${margin.top - 22}">core window</text>`);
    }

    renderAliasBands(svg, sx, margin.top - 16, plotBottom - margin.top + 16);

    [-240, -120, 0, 120, 240].forEach((tick) => {
      const x = sx(tick);
      svg.push(`<line class="grid" x1="${x}" y1="${margin.top - 16}" x2="${x}" y2="${plotBottom}"></line>`);
      svg.push(`<text class="label" x="${x}" y="${height - 19}" text-anchor="middle">${signed(tick, 0)}</text>`);
    });

    svg.push(`<line class="closest-approach-line" x1="${sx(0)}" y1="${margin.top - 16}" x2="${sx(0)}" y2="${plotBottom}"></line>`);
    svg.push(`<text class="label-strong" x="${sx(0) + 7}" y="${margin.top - 3}">closest approach</text>`);

    const cilixNearest = data.flyby.cilixClosestSample;
    svg.push(`<line class="nearest-marker-line" x1="${sx(cilixNearest.offsetS)}" y1="${margin.top - 16}" x2="${sx(cilixNearest.offsetS)}" y2="${plotBottom}"></line>`);
    svg.push(`<text class="label" x="${sx(cilixNearest.offsetS) + 7}" y="${plotBottom - 8}">nearest Cilix marker</text>`);

    lanes.forEach((lane) => {
      const y0 = sy(lane.min, lane);
      const yMid = sy((lane.min + lane.max) / 2, lane);
      const y1 = sy(lane.max, lane);
      [y1, yMid, y0].forEach((y) => {
        svg.push(`<line class="grid" x1="${plotLeft}" y1="${y}" x2="${plotRight}" y2="${y}"></line>`);
      });
      svg.push(`<line class="axis" x1="${plotLeft}" y1="${y0}" x2="${plotRight}" y2="${y0}"></line>`);
      svg.push(`<text class="data-lane-label" x="${plotLeft - 12}" y="${lane.top + laneHeight / 2 - 8}" text-anchor="end">${lane.label}</text>`);
      svg.push(`<text class="label" x="${plotLeft - 12}" y="${lane.top + laneHeight / 2 + 10}" text-anchor="end">${lane.unit}</text>`);
      svg.push(`<text class="label" x="${plotLeft - 9}" y="${y1 + 4}" text-anchor="end">${fmt(lane.max, 0)}</text>`);
      svg.push(`<text class="label" x="${plotLeft - 9}" y="${y0 + 4}" text-anchor="end">${fmt(lane.min, 0)}</text>`);
      svg.push(`<path class="${lane.className}" d="${pathForLane(lane)}"></path>`);
      svg.push(satelliteIcon(sx(row.offsetS), sy(row[lane.key], lane), 6.2));
      svg.push(`<text class="label-strong" x="${plotRight}" y="${lane.top + 12}" text-anchor="end">${lane.value(row)}</text>`);
    });

    const xNow = sx(row.offsetS);
    svg.push(`<line class="current-guide" x1="${xNow}" y1="${margin.top - 16}" x2="${xNow}" y2="${plotBottom}"></line>`);
    svg.push(`<text class="label-strong" x="${Math.min(plotRight - 64, xNow + 8)}" y="${height - 19}">t ${signed(row.offsetS, 0)} s</text>`);
    svg.push(`<text class="label-strong" x="${plotLeft + (plotRight - plotLeft) / 2}" y="${height - 7}" text-anchor="middle">time from E19 closest approach (s)</text>`);
    svg.push('</svg>');
    e19DataPlot.innerHTML = svg.join('');
  }

  function renderGroundTrack(row) {
    if (!geometryPlot) return;
    const width = 720;
    const height = 360;
    const margin = { left: 62, right: 26, top: 42, bottom: 48 };
    const lonMin = Math.floor(Math.min(...samples.map((entry) => entry.lonEastDeg), cilix.lonEastDeg) - 4);
    const lonMax = Math.ceil(Math.max(...samples.map((entry) => entry.lonEastDeg), cilix.lonEastDeg) + 4);
    const latMin = Math.floor(Math.min(...samples.map((entry) => entry.latDeg), cilix.latDeg) - 1.2);
    const latMax = Math.ceil(Math.max(...samples.map((entry) => entry.latDeg), cilix.latDeg) + 1.2);
    const scales = chartScales(width, height, margin, lonMin, lonMax, latMax, latMin);
    const coreRows = rowsInWindow(coreWindow);
    const currentX = scales.x(row.lonEastDeg);
    const currentY = scales.y(row.latDeg);
    const cilixRadiusDeg = (cilix.diameterKm / 2) / data.body.meanRadiusKm * 180 / Math.PI;
    const svg = [`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="E19 groundtrack over the Cilix crater region">`];
    axis(svg, width, height, margin, scales, [150, 170, 190, 210, 230], [-3, -1, 1, 3], {
      x: (value) => `${fmt(value, 0)}E`,
      y: (value) => signed(value, 0),
      xTitle: 'east longitude (deg)',
      yTitle: 'planetocentric latitude (deg)'
    });
    svg.push(`<path class="groundtrack-line" d="${pathFor(samples, scales, 'lonEastDeg', 'latDeg')}"></path>`);
    svg.push(`<path class="groundtrack-alias-broad" d="${pathFor(rowsInSector(aliasAnalysis.broadAliasSector), scales, 'lonEastDeg', 'latDeg')}"></path>`);
    aliasAnalysis.zeroFoldSectors.forEach((sector) => {
      svg.push(`<path class="groundtrack-alias-sector${sector.strongest ? ' is-strongest' : ''}" d="${pathFor(rowsInSector(sector), scales, 'lonEastDeg', 'latDeg')}"></path>`);
    });
    if (coreRows.length) {
      svg.push(`<path class="groundtrack-reconable" d="${pathFor(coreRows, scales, 'lonEastDeg', 'latDeg')}"></path>`);
    }
    const cilixR = Math.max(5, Math.abs(scales.x(cilix.lonEastDeg + cilixRadiusDeg) - scales.x(cilix.lonEastDeg)));
    svg.push(`<circle class="cilix-marker" cx="${scales.x(cilix.lonEastDeg)}" cy="${scales.y(cilix.latDeg)}" r="${cilixR.toFixed(2)}"></circle>`);
    svg.push(`<text class="label-strong" x="${scales.x(cilix.lonEastDeg) + 10}" y="${scales.y(cilix.latDeg) - 8}">Cilix marker</text>`);
    svg.push(`<rect class="closest-marker" x="${scales.x(closest.lonEastDeg) - 6}" y="${scales.y(closest.latDeg) - 6}" width="12" height="12" transform="rotate(45 ${scales.x(closest.lonEastDeg)} ${scales.y(closest.latDeg)})"></rect>`);
    svg.push(`<text class="label" x="${scales.x(closest.lonEastDeg) + 10}" y="${scales.y(closest.latDeg) + 18}">closest approach</text>`);
    svg.push(satelliteIcon(currentX, currentY, 9));
    svg.push(`<text class="label-strong" x="${Math.min(width - margin.right - 88, currentX + 11)}" y="${currentY - 11}">t ${signed(row.offsetS, 0)} s</text>`);
    if (coreWindow) {
      svg.push(`<text class="label-danger" x="${margin.left}" y="22">core reconable: ${fmt(coreWindow.groundLengthKm, 1)} km</text>`);
    }
    svg.push('</svg>');
    geometryPlot.innerHTML = svg.join('');
  }

  function renderCriteria(row) {
    if (!foldPlot) return;
    const width = 720;
    const height = 360;
    const margin = { left: 64, right: 26, top: 42, bottom: 48 };
    const mid = 178;
    const laneHeight = 112;
    const sx = (value) => margin.left + ((value - sampleStart) / (sampleEnd - sampleStart)) * (width - margin.left - margin.right);
    const syAlt = (value) => margin.top + ((360 - value) / 360) * laneHeight;
    const syInc = (value) => mid + ((80 - value) / 80) * laneHeight;
    const svg = [`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Altitude and solar incidence against E19 reconability criteria">`];
    [-240, -120, 0, 120, 240].forEach((tick) => {
      const x = sx(tick);
      svg.push(`<line class="grid" x1="${x}" y1="${margin.top}" x2="${x}" y2="${height - margin.bottom}"></line>`);
      svg.push(`<text class="label" x="${x}" y="${height - margin.bottom + 19}" text-anchor="middle">${signed(tick, 0)}</text>`);
    });
    [50, 100].forEach((value) => {
      svg.push(`<line class="criterion-line" x1="${margin.left}" y1="${syAlt(value)}" x2="${width - margin.right}" y2="${syAlt(value)}"></line>`);
      svg.push(`<text class="label" x="${width - margin.right}" y="${syAlt(value) - 5}" text-anchor="end">${value} km</text>`);
    });
    [30, 60].forEach((value) => {
      svg.push(`<line class="criterion-line" x1="${margin.left}" y1="${syInc(value)}" x2="${width - margin.right}" y2="${syInc(value)}"></line>`);
      svg.push(`<text class="label" x="${width - margin.right}" y="${syInc(value) - 5}" text-anchor="end">${value} deg</text>`);
    });
    if (coreWindow) {
      const x0 = sx(coreWindow.startOffsetS);
      const x1 = sx(coreWindow.endOffsetS);
      svg.push(`<rect class="reconable-window" x="${x0}" y="${margin.top}" width="${x1 - x0}" height="${height - margin.top - margin.bottom}"></rect>`);
    }
    renderAliasBands(svg, sx, margin.top, height - margin.top - margin.bottom);
    svg.push(`<path class="altitude-line" d="${samples.map((entry, index) => `${index ? 'L' : 'M'} ${sx(entry.offsetS).toFixed(2)} ${syAlt(entry.altitudeKm).toFixed(2)}`).join(' ')}"></path>`);
    svg.push(`<path class="incidence-line" d="${samples.map((entry, index) => `${index ? 'L' : 'M'} ${sx(entry.offsetS).toFixed(2)} ${syInc(entry.incidenceDeg).toFixed(2)}`).join(' ')}"></path>`);
    const xNow = sx(row.offsetS);
    svg.push(`<line class="current-guide" x1="${xNow}" y1="${margin.top}" x2="${xNow}" y2="${height - margin.bottom}"></line>`);
    svg.push(satelliteIcon(xNow, syAlt(row.altitudeKm), 8));
    svg.push(`<circle class="response-center" cx="${xNow}" cy="${syInc(row.incidenceDeg)}" r="5"></circle>`);
    svg.push(`<text class="label-strong" x="${margin.left}" y="22">altitude: ${fmt(row.altitudeKm, 1)} km</text>`);
    svg.push(`<text class="label-danger" x="${margin.left}" y="${mid - 15}">incidence: ${fmt(row.incidenceDeg, 1)} deg</text>`);
    svg.push(`<text class="label-strong" x="${margin.left + (width - margin.left - margin.right) / 2}" y="${height - 7}" text-anchor="middle">time from closest approach (s)</text>`);
    svg.push(`<text class="label" x="${margin.left}" y="${height - margin.bottom + 40}">shaded: 50-100 km altitude and 30-60 deg incidence</text>`);
    svg.push('</svg>');
    foldPlot.innerHTML = svg.join('');
  }

  function renderMotion(row) {
    if (!tracePlot) return;
    const width = 720;
    const height = 360;
    const margin = { left: 66, right: 26, top: 42, bottom: 48 };
    const groundMin = Math.floor(Math.min(...samples.map((entry) => entry.groundTrackKm)) / 100) * 100;
    const groundMax = Math.ceil(Math.max(...samples.map((entry) => entry.groundTrackKm)) / 100) * 100;
    const altMax = Math.ceil(Math.max(...samples.map((entry) => entry.altitudeKm)) / 100) * 100;
    const scales = chartScales(width, height, margin, groundMin, groundMax, altMax, 0);
    const coreRows = rowsInWindow(coreWindow);
    const coreStart = coreWindow ? interpolateRow(coreWindow.startOffsetS) : null;
    const coreEnd = coreWindow ? interpolateRow(coreWindow.endOffsetS) : null;
    const svg = [`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Local side view of E19 altitude over groundtrack distance">`];
    axis(svg, width, height, margin, scales, [-1000, -500, 0, 500, 1000], [0, 100, 200, 300], {
      x: (value) => signed(value, 0),
      y: (value) => fmt(value, 0),
      xTitle: 'surface groundtrack from closest approach (km)',
      yTitle: 'altitude above mean Europa (km)'
    });
    svg.push(`<line class="surface" x1="${margin.left}" y1="${scales.y(0)}" x2="${width - margin.right}" y2="${scales.y(0)}"></line>`);
    svg.push(`<path class="trajectory-line" fill="none" d="${pathFor(samples, scales, 'groundTrackKm', 'altitudeKm')}"></path>`);
    if (coreRows.length) {
      svg.push(`<path class="trajectory-reconable" d="${pathFor(coreRows, scales, 'groundTrackKm', 'altitudeKm')}"><title>Core SPICE window: ${signed(coreStart.groundTrackKm, 1)} to ${signed(coreEnd.groundTrackKm, 1)} km; ${signed(coreWindow.startOffsetS, 0)} to ${signed(coreWindow.endOffsetS, 0)} s</title></path>`);
      [coreStart, coreEnd].forEach((point, index) => {
        svg.push(`<circle class="trajectory-window-end" cx="${scales.x(point.groundTrackKm)}" cy="${scales.y(point.altitudeKm)}" r="4.2"><title>${index ? 'Core end' : 'Core start'}: ${signed(point.groundTrackKm, 1)} km, ${fmt(point.altitudeKm, 1)} km altitude, ${fmt(point.incidenceDeg, 1)} deg incidence</title></circle>`);
      });
      svg.push(`<text class="label-warning" x="${margin.left}" y="38">core window ${signed(coreStart.groundTrackKm, 0)} to ${signed(coreEnd.groundTrackKm, 0)} km from SPICE altitude/incidence criteria</text>`);
    }
    svg.push(`<line class="current-guide" x1="${scales.x(row.groundTrackKm)}" y1="${margin.top}" x2="${scales.x(row.groundTrackKm)}" y2="${height - margin.bottom}"></line>`);
    svg.push(satelliteIcon(scales.x(row.groundTrackKm), scales.y(row.altitudeKm), 11));
    svg.push(`<text class="label-strong" x="${Math.min(width - margin.right - 150, scales.x(row.groundTrackKm) + 12)}" y="${scales.y(row.altitudeKm) - 12}">Europa Clipper</text>`);
    svg.push(`<text class="label" x="${margin.left}" y="22">closest altitude ${fmt(closest.altitudeKm, 1)} km, speed ${fmt(closest.speedKmS, 3)} km/s</text>`);
    svg.push('</svg>');
    tracePlot.innerHTML = svg.join('');
  }

  function renderLook(row) {
    if (!dopplerPlot) return;
    const width = 720;
    const height = 360;
    const margin = { left: 74, right: 28, top: 42, bottom: 48 };
    const lookRows = samples.map((entry) => ({ ...entry, ...derivedLook(entry) }));
    const dopplerMax = Math.ceil(Math.max(...lookRows.map((entry) => Math.abs(entry.dopplerHz))) / 100) * 100 || 100;
    const scales = chartScales(width, height, margin, sampleStart, sampleEnd, dopplerMax, -dopplerMax);
    const look = derivedLook(row);
    const cilixNearest = data.flyby.cilixClosestSample;
    const nearestLook = derivedLook(interpolateRow(cilixNearest.offsetS));
    const svg = [`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="E19 60 MHz Doppler derived from flat Cilix marker range rate">`];
    axis(svg, width, height, margin, scales, [-240, -120, 0, 120, 240], [-dopplerMax, 0, dopplerMax], {
      x: (value) => signed(value, 0),
      y: (value) => fmt(value, 0),
      xTitle: 'time from closest approach (s)',
      yTitle: '60 MHz two-way Doppler (Hz)'
    });
    renderAliasBands(svg, scales.x, margin.top, height - margin.top - margin.bottom, {
      labelBroad: true,
      labelStrongest: true
    });
    const lowPrfNyquistHz = aliasAnalysis.zeroFoldSectors[0].prfHz / 2;
    const bandTop = scales.y(lowPrfNyquistHz);
    const bandBottom = scales.y(-lowPrfNyquistHz);
    svg.push(`<rect class="alias-sampled-band" x="${margin.left}" y="${bandTop}" width="${width - margin.left - margin.right}" height="${bandBottom - bandTop}"></rect>`);
    svg.push(`<line class="criterion-line" x1="${margin.left}" y1="${scales.y(0)}" x2="${width - margin.right}" y2="${scales.y(0)}"></line>`);
    svg.push(`<path class="look-range-line" d="${linePath(lookRows, scales.x, scales.y, (entry) => ({ x: entry.offsetS, y: entry.dopplerHz }))}"></path>`);
    aliasAnalysis.zeroFoldSectors.forEach((sector) => {
      const sectorLook = derivedLook(interpolateRow(sector.centerS));
      svg.push(`<circle class="alias-sector-dot${sector.strongest ? ' is-strongest' : ''}" cx="${scales.x(sector.centerS)}" cy="${scales.y(sectorLook.dopplerHz)}" r="${sector.strongest ? 6 : 4.8}"></circle>`);
    });
    svg.push(`<line class="current-guide" x1="${scales.x(row.offsetS)}" y1="${margin.top}" x2="${scales.x(row.offsetS)}" y2="${height - margin.bottom}"></line>`);
    svg.push(satelliteIcon(scales.x(row.offsetS), scales.y(look.dopplerHz), 9));
    svg.push(`<rect class="closest-marker" x="${scales.x(cilixNearest.offsetS) - 5}" y="${scales.y(nearestLook.dopplerHz) - 5}" width="10" height="10" transform="rotate(45 ${scales.x(cilixNearest.offsetS)} ${scales.y(nearestLook.dopplerHz)})"></rect>`);
    svg.push(`<text class="label" x="${scales.x(cilixNearest.offsetS) + 8}" y="${scales.y(nearestLook.dopplerHz) - 8}">nearest Cilix marker</text>`);
    svg.push(`<text class="label-strong" x="${margin.left}" y="22">range rate ${signed(look.rangeRateKmS, 3)} km/s, look angle ${fmt(look.lookAngleDeg, 1)} deg</text>`);
    svg.push(`<text class="label-danger" x="${width - margin.right}" y="22" text-anchor="end">Doppler ${signed(look.dopplerHz, 1)} Hz</text>`);
    svg.push('</svg>');
    dopplerPlot.innerHTML = svg.join('');
  }

  function sampleRow(label, row) {
    return `
      <tr>
        <th scope="row">${escapeHtml(label)}</th>
        <td>${signed(row.offsetS, 0)} s</td>
        <td>${fmt(row.altitudeKm, 1)} km</td>
        <td>${fmt(row.latDeg, 2)}, ${fmt(row.lonEastDeg, 2)}E</td>
        <td>${fmt(row.incidenceDeg, 1)} deg</td>
        <td>${fmt(row.distanceToCilixKm, 1)} km</td>
      </tr>
    `;
  }

  function renderTable(row) {
    if (!tablePlot) return;
    const cilixNearest = data.flyby.cilixClosestSample;
    const coreStart = coreWindow ? interpolateRow(coreWindow.startOffsetS) : null;
    const coreEnd = coreWindow ? interpolateRow(coreWindow.endOffsetS) : null;
    const rows = [
      sampleRow('Current slider', row),
      sampleRow('Closest approach', interpolateRow(0)),
      sampleRow('Nearest Cilix marker', interpolateRow(cilixNearest.offsetS))
    ];
    if (coreStart && coreEnd) {
      rows.push(sampleRow('Reconable start', coreStart));
      rows.push(sampleRow('Reconable end', coreEnd));
    }
    const strongestFold = aliasAnalysis.zeroFoldSectors.find((sector) => sector.strongest);
    tablePlot.innerHTML = `
      <div class="source-summary">
        <div><strong>${escapeHtml(data.flyby.name)}</strong><span>${escapeHtml(data.flyby.rank)}</span></div>
        <div><strong>${fmt(coreWindow?.groundLengthKm || 0, 1)} km</strong><span>core reconable window in this sample</span></div>
        <div><strong>${fmt(aliasAnalysis.prfFloorHz, 1)} Hz</strong><span>MATLAB no-alias PRF floor</span></div>
        <div><strong>${signed(strongestFold.centerS, 1)} s</strong><span>strongest ${fmt(strongestFold.prfHz, 1)} Hz fold sector</span></div>
      </div>
      <div class="table-wrap">
        <table class="sample-table">
          <thead>
            <tr>
              <th scope="col">Sample</th>
              <th scope="col">Time</th>
              <th scope="col">Altitude</th>
              <th scope="col">Lat, lon</th>
              <th scope="col">Incidence</th>
              <th scope="col">Cilix marker</th>
            </tr>
          </thead>
          <tbody>${rows.join('')}</tbody>
        </table>
      </div>
    `;
  }

  function updateReadouts(row) {
    const look = derivedLook(row);
    timeOutput.textContent = `${signed(row.offsetS, 0)} s`;
    altitudeValue.textContent = `${fmt(row.altitudeKm, 1)} km`;
    trackValue.textContent = `${signed(row.groundTrackKm, 1)} km`;
    subpointValue.textContent = `${fmt(row.latDeg, 2)}, ${fmt(row.lonEastDeg, 2)}E`;
    speedValue.textContent = `${fmt(row.speedKmS, 3)} km/s`;
    incidenceValue.textContent = `${fmt(row.incidenceDeg, 1)} deg`;
    cilixValue.textContent = `${fmt(row.distanceToCilixKm, 1)} km`;
    const activeSector = activePrfSector(row.offsetS);
    if (aliasRiskValue) {
      aliasRiskValue.className = '';
      if (activeSector?.kind === 'fold') {
        aliasRiskValue.textContent = `${fmt(activeSector.prfHz, 1)} Hz fold`;
        aliasRiskValue.classList.add('is-risk-hot');
      } else if (activeSector?.kind === 'alias') {
        aliasRiskValue.textContent = '3000 Hz aliases';
        aliasRiskValue.classList.add('is-risk-warm');
      } else {
        aliasRiskValue.textContent = 'lower';
      }
    }
    status.className = `trajectory-status${row.reconableCore ? '' : row.reconableMargin ? ' is-margin' : ' is-overlap'}`;
    if (row.reconableCore) {
      status.textContent = `Core window: ${signed(row.offsetS, 0)} s`;
    } else if (row.reconableMargin) {
      status.textContent = `Margin window: ${signed(row.offsetS, 0)} s`;
    } else {
      status.textContent = `Outside window: ${signed(row.offsetS, 0)} s`;
    }
  }

  function setSliderOffset(offsetS) {
    currentOffset = clamp(Number(offsetS) || 0, sampleStart, sampleEnd);
    slider.value = String(Math.round(currentOffset));
    return currentOffset;
  }

  function draw(offsetS = currentOffset) {
    const row = interpolateRow(offsetS);
    updateReadouts(row);
    renderMotion(row);
  }

  function drawAt(offsetS, force = false) {
    const nextOffset = setSliderOffset(offsetS);
    const renderSecond = Math.round(nextOffset);
    if (!force && renderSecond === lastRenderedSecond) return;
    lastRenderedSecond = renderSecond;
    draw(nextOffset);
  }

  function setPlaying(isPlaying) {
    playButton.textContent = isPlaying ? 'Pause flyby' : 'Play flyby';
    playButton.setAttribute('aria-pressed', String(isPlaying));
  }

  function stopPlayback() {
    if (playbackFrameId !== null) {
      cancelAnimationFrame(playbackFrameId);
      playbackFrameId = null;
    }
    lastPlaybackTimestamp = null;
    setPlaying(false);
  }

  function playbackStep(timestamp) {
    if (lastPlaybackTimestamp === null) lastPlaybackTimestamp = timestamp;
    const elapsedS = Math.min(0.08, (timestamp - lastPlaybackTimestamp) / 1000);
    lastPlaybackTimestamp = timestamp;
    let next = currentOffset + elapsedS * playbackRate;
    if (next > sampleEnd) next = sampleStart;
    drawAt(next);
    playbackFrameId = requestAnimationFrame(playbackStep);
  }

  playButton.addEventListener('click', () => {
    if (playbackFrameId !== null) {
      stopPlayback();
      return;
    }
    setPlaying(true);
    playbackFrameId = requestAnimationFrame(playbackStep);
  });

  closestButton.addEventListener('click', () => {
    stopPlayback();
    drawAt(0, true);
  });

  slider.addEventListener('input', () => {
    stopPlayback();
    drawAt(Number(slider.value), true);
  });

  drawAt(0, true);
})();
