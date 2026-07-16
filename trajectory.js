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
  const status = document.getElementById('trajectory-status');
  const sourceStatus = document.getElementById('source-status');
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
  let playbackFrameId = null;
  let lastPlaybackTimestamp = null;
  const playbackRate = 18;

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

  function renderGroundTrack(row) {
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
    if (coreRows.length) {
      svg.push(`<path class="groundtrack-reconable" d="${pathFor(coreRows, scales, 'lonEastDeg', 'latDeg')}"></path>`);
    }
    const cilixR = Math.max(5, Math.abs(scales.x(cilix.lonEastDeg + cilixRadiusDeg) - scales.x(cilix.lonEastDeg)));
    svg.push(`<circle class="cilix-marker" cx="${scales.x(cilix.lonEastDeg)}" cy="${scales.y(cilix.latDeg)}" r="${cilixR.toFixed(2)}"></circle>`);
    svg.push(`<text class="label-strong" x="${scales.x(cilix.lonEastDeg) + 10}" y="${scales.y(cilix.latDeg) - 8}">Cilix marker</text>`);
    svg.push(`<rect class="closest-marker" x="${scales.x(closest.lonEastDeg) - 6}" y="${scales.y(closest.latDeg) - 6}" width="12" height="12" transform="rotate(45 ${scales.x(closest.lonEastDeg)} ${scales.y(closest.latDeg)})"></rect>`);
    svg.push(`<text class="label" x="${scales.x(closest.lonEastDeg) + 10}" y="${scales.y(closest.latDeg) + 18}">closest approach</text>`);
    svg.push(`<circle class="satellite" cx="${currentX}" cy="${currentY}" r="7"></circle>`);
    svg.push(`<text class="label-strong" x="${Math.min(width - margin.right - 88, currentX + 11)}" y="${currentY - 11}">t ${signed(row.offsetS, 0)} s</text>`);
    if (coreWindow) {
      svg.push(`<text class="label-danger" x="${margin.left}" y="22">core reconable: ${fmt(coreWindow.groundLengthKm, 1)} km</text>`);
    }
    svg.push('</svg>');
    geometryPlot.innerHTML = svg.join('');
  }

  function renderCriteria(row) {
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
    svg.push(`<path class="altitude-line" d="${samples.map((entry, index) => `${index ? 'L' : 'M'} ${sx(entry.offsetS).toFixed(2)} ${syAlt(entry.altitudeKm).toFixed(2)}`).join(' ')}"></path>`);
    svg.push(`<path class="incidence-line" d="${samples.map((entry, index) => `${index ? 'L' : 'M'} ${sx(entry.offsetS).toFixed(2)} ${syInc(entry.incidenceDeg).toFixed(2)}`).join(' ')}"></path>`);
    const xNow = sx(row.offsetS);
    svg.push(`<line class="current-guide" x1="${xNow}" y1="${margin.top}" x2="${xNow}" y2="${height - margin.bottom}"></line>`);
    svg.push(`<circle class="satellite" cx="${xNow}" cy="${syAlt(row.altitudeKm)}" r="6"></circle>`);
    svg.push(`<circle class="response-center" cx="${xNow}" cy="${syInc(row.incidenceDeg)}" r="5"></circle>`);
    svg.push(`<text class="label-strong" x="${margin.left}" y="22">altitude: ${fmt(row.altitudeKm, 1)} km</text>`);
    svg.push(`<text class="label-danger" x="${margin.left}" y="${mid - 15}">incidence: ${fmt(row.incidenceDeg, 1)} deg</text>`);
    svg.push(`<text class="label-strong" x="${margin.left + (width - margin.left - margin.right) / 2}" y="${height - 7}" text-anchor="middle">time from closest approach (s)</text>`);
    svg.push(`<text class="label" x="${margin.left}" y="${height - margin.bottom + 40}">shaded: 50-100 km altitude and 30-60 deg incidence</text>`);
    svg.push('</svg>');
    foldPlot.innerHTML = svg.join('');
  }

  function renderMotion(row) {
    const width = 720;
    const height = 360;
    const margin = { left: 66, right: 26, top: 42, bottom: 48 };
    const groundMin = Math.floor(Math.min(...samples.map((entry) => entry.groundTrackKm)) / 100) * 100;
    const groundMax = Math.ceil(Math.max(...samples.map((entry) => entry.groundTrackKm)) / 100) * 100;
    const altMax = Math.ceil(Math.max(...samples.map((entry) => entry.altitudeKm)) / 100) * 100;
    const scales = chartScales(width, height, margin, groundMin, groundMax, altMax, 0);
    const coreRows = rowsInWindow(coreWindow);
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
      svg.push(`<path class="trajectory-reconable" d="${pathFor(coreRows, scales, 'groundTrackKm', 'altitudeKm')}"></path>`);
    }
    svg.push(`<line class="current-guide" x1="${scales.x(row.groundTrackKm)}" y1="${margin.top}" x2="${scales.x(row.groundTrackKm)}" y2="${height - margin.bottom}"></line>`);
    svg.push(`<circle class="satellite" cx="${scales.x(row.groundTrackKm)}" cy="${scales.y(row.altitudeKm)}" r="8"></circle>`);
    svg.push(`<text class="label-strong" x="${Math.min(width - margin.right - 150, scales.x(row.groundTrackKm) + 12)}" y="${scales.y(row.altitudeKm) - 12}">Europa Clipper</text>`);
    svg.push(`<text class="label" x="${margin.left}" y="22">closest altitude ${fmt(closest.altitudeKm, 1)} km, speed ${fmt(closest.speedKmS, 3)} km/s</text>`);
    svg.push('</svg>');
    tracePlot.innerHTML = svg.join('');
  }

  function renderLook(row) {
    const width = 720;
    const height = 360;
    const margin = { left: 70, right: 28, top: 42, bottom: 48 };
    const lookRows = samples.map((entry) => ({ ...entry, ...derivedLook(entry) }));
    const rangeMax = Math.ceil(Math.max(...lookRows.map((entry) => entry.slantRangeKm)) / 100) * 100;
    const scales = chartScales(width, height, margin, sampleStart, sampleEnd, rangeMax, 0);
    const look = derivedLook(row);
    const cilixNearest = data.flyby.cilixClosestSample;
    const nearestRange = Math.hypot(cilixNearest.altitudeKm, cilixNearest.distanceToCilixKm);
    const svg = [`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Line of sight range from E19 to the Cilix marker through the sampled flyby">`];
    axis(svg, width, height, margin, scales, [-240, -120, 0, 120, 240], [0, 250, 500, 750, 1000], {
      x: (value) => signed(value, 0),
      y: (value) => fmt(value, 0),
      xTitle: 'time from closest approach (s)',
      yTitle: 'flat-surface range to Cilix marker (km)'
    });
    svg.push(`<path class="look-range-line" d="${linePath(lookRows, scales.x, scales.y, (entry) => ({ x: entry.offsetS, y: entry.slantRangeKm }))}"></path>`);
    svg.push(`<line class="current-guide" x1="${scales.x(row.offsetS)}" y1="${margin.top}" x2="${scales.x(row.offsetS)}" y2="${height - margin.bottom}"></line>`);
    svg.push(`<circle class="satellite" cx="${scales.x(row.offsetS)}" cy="${scales.y(look.slantRangeKm)}" r="7"></circle>`);
    svg.push(`<rect class="closest-marker" x="${scales.x(cilixNearest.offsetS) - 5}" y="${scales.y(nearestRange) - 5}" width="10" height="10" transform="rotate(45 ${scales.x(cilixNearest.offsetS)} ${scales.y(nearestRange)})"></rect>`);
    svg.push(`<text class="label" x="${scales.x(cilixNearest.offsetS) + 8}" y="${scales.y(nearestRange) - 8}">nearest Cilix marker</text>`);
    svg.push(`<text class="label-strong" x="${margin.left}" y="22">look angle ${fmt(look.lookAngleDeg, 1)} deg, range rate ${signed(look.rangeRateKmS, 3)} km/s</text>`);
    svg.push(`<text class="label-danger" x="${width - margin.right}" y="22" text-anchor="end">60 MHz Doppler ${signed(look.dopplerHz, 1)} Hz</text>`);
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
    tablePlot.innerHTML = `
      <div class="source-summary">
        <div><strong>${escapeHtml(data.flyby.name)}</strong><span>${escapeHtml(data.flyby.rank)}</span></div>
        <div><strong>${fmt(coreWindow?.groundLengthKm || 0, 1)} km</strong><span>core reconable window in this sample</span></div>
        <div><strong>${fmt(cilixNearest.distanceToCilixKm, 1)} km</strong><span>closest sampled distance to Cilix marker</span></div>
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
    status.className = `trajectory-status${row.reconableCore ? '' : row.reconableMargin ? ' is-margin' : ' is-overlap'}`;
    if (row.reconableCore) {
      status.textContent = `E19 is inside the core reconable window at ${signed(row.offsetS, 0)} s: altitude ${fmt(row.altitudeKm, 1)} km, incidence ${fmt(row.incidenceDeg, 1)} deg, flat Cilix look angle ${fmt(look.lookAngleDeg, 1)} deg.`;
    } else if (row.reconableMargin) {
      status.textContent = `E19 is inside the looser margin at ${signed(row.offsetS, 0)} s, but outside the core 50-100 km and 30-60 deg window.`;
    } else {
      status.textContent = `E19 is outside the core reconable window at ${signed(row.offsetS, 0)} s; move toward closest approach to see the NASA-reference pass enter the Cilix-region window.`;
    }
    sourceStatus.textContent = `NAIF trajectory sample: ${row.utc}. 3D Cilix DTM intentionally not used.`;
  }

  function draw() {
    const row = interpolateRow(Number(slider.value));
    updateReadouts(row);
    renderGroundTrack(row);
    renderCriteria(row);
    renderMotion(row);
    renderLook(row);
    renderTable(row);
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
    const elapsedS = Math.min(0.05, (timestamp - lastPlaybackTimestamp) / 1000);
    lastPlaybackTimestamp = timestamp;
    let next = Number(slider.value) + elapsedS * playbackRate;
    if (next > sampleEnd) next = sampleStart;
    slider.value = String(next);
    draw();
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
    slider.value = '0';
    draw();
  });

  slider.addEventListener('input', () => {
    stopPlayback();
    draw();
  });

  draw();
})();
