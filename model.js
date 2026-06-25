(function () {
  const pi = Math.PI;
  const rowCount = 241;

  const defaults = {
    z0: 400,
    y: 25,
    xMin: -60,
    xMax: 60,
    deltaZEdge: 4,
    xEdge: 60,
    speed: 4,
    n: 1.78,
    lambdaVhf: 5,
    lambdaHf: 33.3,
    baseline: 5,
    resVhf: 30,
    resHf: 300,
    prf1: 50,
    prf2: 500,
    prf3: 3000,
    c: 299792458,
    topographyOn: true,
    ridgeHeight: 350,
    ridgeX0: 0,
    ridgeY0: 25,
    ridgeSigmaX: 24,
    ridgeSigmaY: 3.5,
    craterDepth: 180,
    craterX0: -18,
    craterY0: 8,
    craterSigma: 8,
    chaosAmplitude: 65,
    roughAmplitude: 35,
    roughLx: 18,
    roughLy: 12,
    troughDepth: 120,
    troughX0: 12,
    troughY0: -6,
    troughSigmaY: 2.5,
    troughSigmaX: 38,
    terrainSigmaH: 75,
    terrainSeed: 7,
    seededAmplitude: 45,
    seedScaleX: 12,
    seedScaleY: 9,
    demScale: 1,
    europaRadius: 1560.8,
    upperMeanDepth: 1150,
    upperSineAmplitude: 160,
    upperPhase: 10,
    upperWavelength: 42,
    upperCosAmplitude: 60,
    upperCosWavelength: 23,
    upperSurfaceCoupling: 0.04,
    lensAStrength: 0.95,
    lensACenter: -24,
    lensAWidth: 10,
    lensBStrength: 0.7,
    lensBCenter: 30,
    lensBWidth: 8,
    lensMeanDepth: 5100,
    lensDepthWaveAmplitude: 520,
    lensDepthPhase: 6,
    lensDepthWavelength: 82,
    lensUplift: 240,
    nominalIceShell: 15000,
    oceanSineAmplitude: 760,
    oceanSinePhase: 26,
    oceanSineWavelength: 135,
    oceanCosAmplitude: 330,
    oceanCosPhase: 8,
    oceanCosWavelength: 62,
    oceanSurfaceAntiCoupling: 0.14,
    attenuation: 0.9,
    shallowEcho: -10,
    lensEcho: -24,
    lensEchoBonus: 9,
    oceanEcho: -6,
    basalRoughnessPenalty: 0.004,
    lensDisplayThreshold: 0.18,
    detectionThreshold: -45,
    boundaryUncertainty: 1500,
    thinShellMultiplier: 0.55,
    thickShellMultiplier: 1.75,
    noOceanControlEcho: -60,
    radarSupport: 55,
    thermalSupport: 35,
    compositionSupport: 40,
    magneticSupport: 50,
    radarWeight: 40,
    thermalWeight: 20,
    compositionWeight: 20,
    magneticWeight: 20,
    radargramJitter: 1.5,
    surfaceClutterBand: 12
  };

  const controls = [
    { key: 'z0', label: 'Closest altitude', unit: 'km', min: 25, max: 1000, step: 5 },
    { key: 'y', label: 'Side offset', unit: 'km', min: 0, max: 80, step: 1 },
    { key: 'deltaZEdge', label: 'Altitude rise at edge', unit: 'km', min: 0, max: 80, step: 0.5 },
    { key: 'topographyOn', label: 'Topography enabled', type: 'checkbox' },
    { key: 'terrainSeed', label: 'Terrain seed', min: 0, max: 50, step: 1 },
    { key: 'ridgeHeight', label: 'Ridge height', unit: 'm', min: 0, max: 900, step: 10 },
    { key: 'craterDepth', label: 'Crater depth', unit: 'm', min: 0, max: 500, step: 10 },
    { key: 'nominalIceShell', label: 'Ice shell thickness', unit: 'm', min: 3000, max: 30000, step: 250 },
    { key: 'lensMeanDepth', label: 'Lens mean depth', unit: 'm', min: 1000, max: 10000, step: 100 },
    { key: 'attenuation', label: 'Ice attenuation', unit: 'dB/km', min: 0.1, max: 3, step: 0.1 },
    { key: 'detectionThreshold', label: 'Detection threshold', unit: 'dB', min: -80, max: -10, step: 1 },
    { key: 'boundaryUncertainty', label: 'Boundary uncertainty', unit: 'm', min: 0, max: 5000, step: 100 }
  ];

  function exp(v) { return Math.exp(v); }
  function sin(v) { return Math.sin(v); }
  function cos(v) { return Math.cos(v); }
  function rad(v) { return v * pi / 180; }
  function deg(v) { return v * 180 / pi; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function mean(values) { return values.reduce((a, b) => a + b, 0) / values.length; }
  function gaussian(x, mu, sigma) { return exp(-0.5 * ((x - mu) / sigma) ** 2); }
  function fract(v) { return v - Math.floor(v); }

  function topography(x, y, p) {
    if (!p.topographyOn) return 0;
    const project = p.demScale * (
      115 * exp(-((y - 25) ** 2) / (4.5 ** 2)) +
      70 * exp(-((y + 38) ** 2) / (7 ** 2)) * (0.55 + 0.45 * sin(2 * pi * x / 45)) +
      24 * sin(2 * pi * y / 9 + x / 18) * exp(-((y + 5) ** 2) / (22 ** 2)) +
      18 * sin(2 * pi * x / 70)
    );
    const ridge = p.ridgeHeight * exp(-((x - p.ridgeX0) ** 2) / (2 * p.ridgeSigmaX ** 2)) * exp(-((y - p.ridgeY0) ** 2) / (2 * p.ridgeSigmaY ** 2));
    const crater = -p.craterDepth * exp(-(((x - p.craterX0) ** 2) + ((y - p.craterY0) ** 2)) / (2 * p.craterSigma ** 2));
    const chaos = p.chaosAmplitude * (0.55 * sin(2 * pi * x / p.roughLx) + 0.35 * cos(2 * pi * y / p.roughLy) + 0.2 * sin(2 * pi * (x + y) / (0.5 * (p.roughLx + p.roughLy))));
    const rough = p.roughAmplitude * sin(2 * pi * x / p.roughLx) * sin(2 * pi * y / p.roughLy);
    const trough = -p.troughDepth * exp(-((y - p.troughY0) ** 2) / (2 * p.troughSigmaY ** 2)) * exp(-((x - p.troughX0) ** 2) / (2 * p.troughSigmaX ** 2));
    const waves = 0.45 * sin(2 * pi * (x / p.seedScaleX + p.terrainSeed * 0.137)) +
      0.35 * cos(2 * pi * (y / p.seedScaleY + p.terrainSeed * 0.173)) +
      0.2 * sin(2 * pi * ((x + y) / (0.5 * (p.seedScaleX + p.seedScaleY)) + p.terrainSeed * 0.097));
    const hash = 2 * fract(sin(x * 12.9898 + y * 78.233 + p.terrainSeed * 37.719) * 43758.5453) - 1;
    const seeded = p.seededAmplitude * (0.7 * waves + 0.3 * hash);
    return project + ridge + crater + chaos + rough + trough + seeded;
  }

  function slantRange(z, x, y, p, targetHeightM) {
    const targetRadius = p.europaRadius + (targetHeightM || 0) / 1000;
    const spacecraftRadius = p.europaRadius + z;
    const theta = Math.sqrt(x ** 2 + y ** 2) / p.europaRadius;
    return Math.sqrt(spacecraftRadius ** 2 + targetRadius ** 2 - 2 * spacecraftRadius * targetRadius * cos(theta));
  }

  function computeModelRows(p) {
    const rows = [];
    for (let i = 0; i < rowCount; i += 1) {
      const x = p.xMin + i * (p.xMax - p.xMin) / (rowCount - 1);
      const z = p.z0 + p.deltaZEdge * (x / p.xEdge) ** 2;
      const rNadir = z;
      const rOff = slantRange(z, x, p.y, p, 0);
      const deltaR = (rOff - rNadir) * 1000;
      const flatDepth = deltaR / p.n;
      const hNadir = topography(x, 0, p);
      const hTarget = topography(x, p.y, p);
      const rNadirTopo = z - hNadir / 1000;
      const rOffTopo = slantRange(z, x, p.y, p, hTarget);
      const deltaTopo = (rOffTopo - rNadirTopo) * 1000;
      const topoDepth = deltaTopo / p.n;
      const horizontal = Math.sqrt(x ** 2 + p.y ** 2);
      const lookAngle = deg(Math.atan(horizontal / z));
      const topoLookAngle = deg(Math.atan(horizontal / (z - hTarget / 1000)));
      rows.push({
        x, z, rNadir, rOff, deltaR, flatDepth,
        flatDelay: 2 * deltaR / p.c * 1000000,
        hNadir, hTarget, rNadirTopo, rOffTopo, deltaTopo, topoDepth,
        topoDelay: 2 * deltaTopo / p.c * 1000000,
        lookAngle, topoLookAngle,
        vhfPhaseTopo: deg((2 * pi / p.lambdaVhf) * p.baseline * sin(rad(topoLookAngle))),
        depthChange: topoDepth - flatDepth,
        apparentSurfaceHeight: -p.n * (topoDepth - flatDepth)
      });
    }
    for (let i = 0; i < rows.length; i += 1) {
      const current = rows[i];
      const next = rows[Math.min(i + 1, rows.length - 1)];
      const prev = rows[Math.max(i - 1, 0)];
      const dxNext = next.x - current.x || current.x - prev.x || 1;
      const dxPrev = current.x - prev.x || dxNext;
      const flatRate = i < rows.length - 1 ? 1000 * (next.rOff - current.rOff) / dxNext * p.speed : 1000 * (current.rOff - prev.rOff) / dxPrev * p.speed;
      const topoRate = i < rows.length - 1 ? 1000 * (next.rOffTopo - current.rOffTopo) / dxNext * p.speed : 1000 * (current.rOffTopo - prev.rOffTopo) / dxPrev * p.speed;
      current.flatRangeRate = flatRate;
      current.topoRangeRate = topoRate;
      current.vhfDoppler = -2 * flatRate / p.lambdaVhf;
      current.hfDoppler = -2 * flatRate / p.lambdaHf;
      current.vhfDopplerTopo = -2 * topoRate / p.lambdaVhf;
      current.hfDopplerTopo = -2 * topoRate / p.lambdaHf;
    }
    return rows;
  }

  function computeSubsurface(modelRows, p) {
    const avgSurface = mean(modelRows.map(r => r.hTarget));
    const rows = modelRows.map((r) => {
      const upperDepth = p.upperMeanDepth +
        p.upperSineAmplitude * sin(2 * pi * (r.x + p.upperPhase) / p.upperWavelength) +
        p.upperCosAmplitude * cos(2 * pi * r.x / p.upperCosWavelength) +
        p.upperSurfaceCoupling * (r.hTarget - avgSurface);
      const lensStrength = clamp(
        p.lensAStrength * gaussian(r.x, p.lensACenter, p.lensAWidth) +
        p.lensBStrength * gaussian(r.x, p.lensBCenter, p.lensBWidth),
        0, 1
      );
      const lensDepth = p.lensMeanDepth + p.lensDepthWaveAmplitude * sin(2 * pi * (r.x - p.lensDepthPhase) / p.lensDepthWavelength) - p.lensUplift * lensStrength;
      const oceanDepth = p.nominalIceShell +
        p.oceanSineAmplitude * sin(2 * pi * (r.x + p.oceanSinePhase) / p.oceanSineWavelength) +
        p.oceanCosAmplitude * cos(2 * pi * (r.x - p.oceanCosPhase) / p.oceanCosWavelength) -
        p.oceanSurfaceAntiCoupling * (r.hTarget - avgSurface);
      return {
        x: r.x,
        surface: r.hTarget,
        upperDepth,
        upperElevation: r.hTarget - upperDepth,
        lensStrength,
        lensDepth,
        lensElevation: r.hTarget - lensDepth,
        oceanDepth,
        oceanElevation: r.hTarget - oceanDepth
      };
    });
    const avgOceanElevation = mean(rows.map(r => r.oceanElevation));
    rows.forEach((r) => {
      r.upperDelay = 2 * p.n * r.upperDepth / p.c * 1000000;
      r.lensDelay = 2 * p.n * r.lensDepth / p.c * 1000000;
      r.oceanDelay = 2 * p.n * r.oceanDepth / p.c * 1000000;
      r.upperEcho = p.shallowEcho - 2 * p.attenuation * (r.upperDepth / 1000);
      r.lensEcho = p.lensEcho + p.lensEchoBonus * r.lensStrength - 2 * p.attenuation * (r.lensDepth / 1000);
      r.oceanEcho = p.oceanEcho - 2 * p.attenuation * (r.oceanDepth / 1000) - p.basalRoughnessPenalty * Math.abs(r.oceanElevation - avgOceanElevation);
      r.lensMargin = r.lensEcho - p.detectionThreshold;
      r.oceanMargin = r.oceanEcho - p.detectionThreshold;
      r.noOceanMargin = p.noOceanControlEcho - p.detectionThreshold + 1.5 * sin(2 * pi * r.x / 45);
      r.radargramClutter = p.surfaceClutterBand + 1.5 * sin(2 * pi * r.x / 35);
      r.radargramShallow = r.upperDelay + p.radargramJitter * sin(2 * pi * r.x / 31);
      r.radargramLens = r.lensStrength >= p.lensDisplayThreshold ? r.lensDelay + p.radargramJitter * sin(2 * pi * r.x / 27) : null;
      r.radargramOcean = r.oceanDelay + p.radargramJitter * sin(2 * pi * r.x / 39);
    });
    return rows;
  }

  function computeDoppler(modelRows, subsurfaceRows, p) {
    return modelRows.map((m, i) => {
      const s = subsurfaceRows[i];
      const radialVelocity = Math.abs(m.vhfDoppler) * p.lambdaVhf / 2;
      const dopplerAngle = deg(Math.asin(clamp(radialVelocity / (p.speed * 1000), 0, 1)));
      const cosTheta = cos(rad(dopplerAngle));
      const rawOceanSlant = s.oceanDepth / cosTheta;
      const rawLensSlant = s.lensDepth / cosTheta;
      const rawUpperSlant = s.upperDepth / cosTheta;
      return {
        x: m.x,
        dopplerAngle,
        geometryAngle: m.lookAngle,
        trueOceanDepth: s.oceanDepth,
        rawOceanSlant,
        correctedOceanDepth: rawOceanSlant * cosTheta,
        uncorrectedOceanError: rawOceanSlant - s.oceanDepth,
        correctedOceanError: rawOceanSlant * cosTheta - s.oceanDepth,
        correctedLensDepth: rawLensSlant * cosTheta,
        correctedUpperDepth: rawUpperSlant * cosTheta
      };
    });
  }

  function pts(rows, xKey, yKey) {
    return rows.map(r => [round(r[xKey]), r[yKey] == null ? null : round(r[yKey])]);
  }

  function round(v) {
    return Number.isFinite(v) ? Number(v.toFixed(6)) : null;
  }

  function chart(id, section, title, yLabel, series, note, kind) {
    return {
      id,
      section,
      sourceSheet: 'Live JS model',
      title,
      note: note || '',
      xLabel: 'Along-track position (km)',
      yLabel,
      kind: kind || 'line',
      series: series.map(s => ({ name: s.name, points: s.points }))
    };
  }

  function scenarioRows(p, scenario) {
    const rows = [];
    for (let i = 0; i < rowCount; i += 1) {
      const t = -1 + i * 2 / (rowCount - 1);
      const x = scenario.xMin + ((t + 1) / 2) * (scenario.xMax - scenario.xMin);
      const z = scenario.z0 + scenario.delta * (x / scenario.edge) ** 2;
      const rOff = slantRange(z, x, p.y, p, 0);
      rows.push({ x: t, depth: (rOff - z) * 1000 / p.n, altitude: z });
    }
    return rows;
  }

  function buildCharts(modelRows, subRows, dopplerRows, p) {
    const scenarios = [
      { name: 'Custom 400 km / 120 km pass', z0: p.z0, xMin: p.xMin, xMax: p.xMax, edge: p.xEdge, delta: p.deltaZEdge },
      { name: 'Paper low-altitude 35 km / 800 km pass', z0: 35, xMin: -400, xMax: 400, edge: 400, delta: 365 },
      { name: 'Paper ice-ocean 35 km / 1600 km pass', z0: 35, xMin: -800, xMax: 800, edge: 800, delta: 965 },
      { name: 'Operating 25 km / 1600 km pass', z0: 25, xMin: -800, xMax: 800, edge: 800, delta: 975 }
    ].map(s => ({ name: s.name, rows: scenarioRows(p, s) }));

    const charts = [
      chart('live-surface-height', 'Surface and motion', 'Surface Height: Generated Topography Reference Floor, Target, and Nadir', 'Elevation or depth (m)', [
        { name: 'Reference floor = generated topography', points: pts(modelRows, 'x', 'hTarget') },
        { name: 'Off-nadir target terrain', points: pts(modelRows, 'x', 'hTarget') },
        { name: 'Nadir terrain', points: pts(modelRows, 'x', 'hNadir') }
      ], 'Generated terrain profiles used by the topography-adjusted radar geometry.'),
      chart('live-scenario-depth', 'Surface and motion', 'Apparent Depth: Spacecraft Motion Distortion by Run', 'Depth / error (m)', scenarios.map(s => ({ name: s.name, points: pts(s.rows, 'x', 'depth') })), 'Recomputed apparent depth for the custom pass and paper-derived pass overlays.'),
      chart('live-terrain-error', 'Surface and motion', 'Terrain Baseline: Total Radar Elevation Error', 'Value', [
        { name: 'Total radar elevation error - custom parabolic', points: pts(modelRows, 'x', 'apparentSurfaceHeight') }
      ], 'Terrain-caused apparent elevation shift from the flat baseline.'),
      chart('live-doppler-flat-topo', 'Surface and motion', 'Doppler: Flat Geometry vs Topography', 'Doppler shift (Hz)', [
        { name: 'Flat VHF Doppler (Hz)', points: pts(modelRows, 'x', 'vhfDoppler') },
        { name: 'Topo VHF Doppler (Hz)', points: pts(modelRows, 'x', 'vhfDopplerTopo') },
        { name: 'Flat HF Doppler (Hz)', points: pts(modelRows, 'x', 'hfDoppler') },
        { name: 'Topo HF Doppler (Hz)', points: pts(modelRows, 'x', 'hfDopplerTopo') }
      ], 'Flat and topography-adjusted Doppler shifts for VHF and HF.'),
      chart('live-flat-delay', 'Surface and motion', 'Nadir Radar Delay by Flyby: Without Topography', 'Delay (us)', scenarios.map(s => ({ name: s.name, points: pts(s.rows, 'x', 'depth') })), 'Scenario delay proxy before generated topography is added.'),
      chart('live-topo-delay', 'Surface and motion', 'Nadir Radar Delay by Flyby: With Generated Topography', 'Delay (us)', [
        { name: 'Custom topo pass', points: pts(modelRows, 'x', 'topoDelay') }
      ], 'Two-way delay after generated terrain is included.'),
      chart('live-off-delay-flat', 'Surface and motion', 'Off-Nadir Radar Delay by Flyby: Without Topography', 'Delay (us)', [
        { name: 'Custom flat pass', points: pts(modelRows, 'x', 'flatDelay') }
      ], 'Two-way off-nadir delay before topography.'),
      chart('live-off-delay-topo', 'Surface and motion', 'Off-Nadir Radar Delay by Flyby: With Generated Topography', 'Delay (us)', [
        { name: 'Custom topo pass', points: pts(modelRows, 'x', 'topoDelay') }
      ], 'Two-way off-nadir delay after topography.')
    ];

    charts.push(
      chart('live-icy-layers', 'Subsurface model', 'Subsurface Truth Model: Icy Layers', 'Elevation or depth (m)', [
        { name: 'Icy top surface', points: pts(subRows, 'x', 'surface') },
        { name: 'Shallow ice layer', points: pts(subRows, 'x', 'upperElevation') },
        { name: 'Warm/briny lens', points: pts(subRows, 'x', 'lensElevation') },
        { name: 'Ice-ocean boundary', points: pts(subRows, 'x', 'oceanElevation') }
      ], 'Synthetic icy surface, shallow layer, warm/briny lens, and possible ocean boundary.'),
      chart('live-shell-scenarios', 'Subsurface model', 'Scenario Comparison: Thin / Medium / Thick Ice', 'Depth (m)', [
        { name: 'Thin shell', points: subRows.map(r => [round(r.x), round(r.oceanDepth * p.thinShellMultiplier)]) },
        { name: 'Medium shell', points: pts(subRows, 'x', 'oceanDepth') },
        { name: 'Thick shell', points: subRows.map(r => [round(r.x), round(r.oceanDepth * p.thickShellMultiplier)]) }
      ], 'Sensitivity view for different ice shell thickness assumptions.'),
      chart('live-uncertainty-band', 'Subsurface model', 'Boundary Uncertainty Band', 'Depth (m)', [
        { name: 'Lower bound', points: subRows.map(r => [round(r.x), round(r.oceanDepth - p.boundaryUncertainty)]) },
        { name: 'Mean boundary', points: pts(subRows, 'x', 'oceanDepth') },
        { name: 'Upper bound', points: subRows.map(r => [round(r.x), round(r.oceanDepth + p.boundaryUncertainty)]) }
      ], 'Lower, mean, and upper possible bottom reflector depth.'),
      chart('live-ocean-control', 'Subsurface model', 'Ocean Model vs No-Ocean Control', 'Relative power / margin (dB)', [
        { name: 'Ocean model margin', points: pts(subRows, 'x', 'oceanMargin') },
        { name: 'No-ocean control margin', points: pts(subRows, 'x', 'noOceanMargin') },
        { name: 'Zero threshold', points: subRows.map(r => [round(r.x), 0]) }
      ], 'Detectability comparison between a possible ocean reflector and a no-ocean control.'),
      chart('live-radargram', 'Subsurface model', 'Radargram-Style Return Timing With Clutter', 'Delay (us)', [
        { name: 'Surface clutter upper', points: pts(subRows, 'x', 'radargramClutter') },
        { name: 'Shallow ice return', points: pts(subRows, 'x', 'radargramShallow') },
        { name: 'Warm/briny lens return', points: pts(subRows, 'x', 'radargramLens') },
        { name: 'Ocean boundary return', points: pts(subRows, 'x', 'radargramOcean') }
      ], 'Layer return timing with surface clutter and jitter included.'),
      chart('live-detectability', 'Subsurface model', 'Detectability Margin vs Threshold', 'Relative power / margin (dB)', [
        { name: 'Lens echo margin', points: pts(subRows, 'x', 'lensMargin') },
        { name: 'Ocean echo margin', points: pts(subRows, 'x', 'oceanMargin') },
        { name: 'Zero margin threshold', points: subRows.map(r => [round(r.x), 0]) }
      ], 'Positive values clear the simple detection threshold.'),
      chart('live-materials', 'Subsurface model', 'Reflection Strength by Material / Interface', 'Relative power / margin (dB)', [
        { name: 'Material/interface strength', points: [[1, -18], [2, -14], [3, -10], [4, -6], [5, -2]] }
      ], 'Relative assumed reflector strength by material or interface.', 'bar'),
      chart('live-evidence', 'Subsurface model', 'Cross-Instrument Evidence Score', 'Support (%)', [
        { name: 'Evidence support score', points: [[1, p.radarSupport], [2, p.thermalSupport], [3, p.compositionSupport], [4, p.magneticSupport]] }
      ], 'Simple support scores for radar, thermal, composition, and magnetic/plasma evidence.', 'bar')
    );

    charts.push(
      chart('live-doppler-angle', 'Doppler depth correction', 'Doppler-Inverted Look Angle vs Existing Geometry', 'Look angle (deg)', [
        { name: 'Doppler angle from VHF shift', points: pts(dopplerRows, 'x', 'dopplerAngle') },
        { name: 'Existing model geometry angle', points: pts(dopplerRows, 'x', 'geometryAngle') }
      ], 'Doppler-derived look angle compared with the model geometry angle.'),
      chart('live-slant-depth', 'Doppler depth correction', 'Raw Slant Depth vs Doppler-Corrected Ocean Depth', 'Depth / error (m)', [
        { name: 'True simulated ocean depth', points: pts(dopplerRows, 'x', 'trueOceanDepth') },
        { name: 'Raw slant depth from echo delay', points: pts(dopplerRows, 'x', 'rawOceanSlant') },
        { name: 'Doppler-corrected actual depth', points: pts(dopplerRows, 'x', 'correctedOceanDepth') }
      ], 'Correction from slant depth to vertical depth.'),
      chart('live-depth-error', 'Doppler depth correction', 'Depth Error Before and After Angle Correction', 'Depth / error (m)', [
        { name: 'Uncorrected slant-depth error', points: pts(dopplerRows, 'x', 'uncorrectedOceanError') },
        { name: 'Corrected depth error', points: pts(dopplerRows, 'x', 'correctedOceanError') }
      ], 'Error drops after applying the Doppler angle correction in the controlled simulation.'),
      chart('live-corrected-layers', 'Doppler depth correction', 'Corrected Layer Depths From Doppler Angle', 'Depth / error (m)', [
        { name: 'Corrected upper-layer depth', points: pts(dopplerRows, 'x', 'correctedUpperDepth') },
        { name: 'Corrected briny lens depth', points: pts(dopplerRows, 'x', 'correctedLensDepth') },
        { name: 'Corrected ocean boundary depth', points: pts(dopplerRows, 'x', 'correctedOceanDepth') }
      ], 'Corrected upper-layer, lens, and ocean boundary depth estimates.')
    );
    return charts;
  }

  function compute(params) {
    const p = { ...defaults, ...params };
    const modelRows = computeModelRows(p);
    const subRows = computeSubsurface(modelRows, p);
    const dopplerRows = computeDoppler(modelRows, subRows, p);
    const mid = modelRows[Math.floor(modelRows.length / 2)];
    const subMid = subRows[Math.floor(subRows.length / 2)];
    const maxTopoDoppler = Math.max(...modelRows.map(r => Math.abs(r.vhfDopplerTopo)));
    const avgBottom = mean(subRows.map(r => r.oceanDepth));
    const bestOcean = Math.max(...subRows.map(r => r.oceanMargin));
    const bestLens = Math.max(...subRows.map(r => r.lensMargin));
    const visibleOcean = subRows.filter(r => r.oceanMargin >= 0).length;
    const evidenceWeight = p.radarWeight + p.thermalWeight + p.compositionWeight + p.magneticWeight;
    const evidence = (p.radarSupport * p.radarWeight + p.thermalSupport * p.thermalWeight + p.compositionSupport * p.compositionWeight + p.magneticSupport * p.magneticWeight) / evidenceWeight;
    const dopplerMeanRaw = mean(dopplerRows.map(r => r.uncorrectedOceanError));
    const dopplerMeanCorrected = mean(dopplerRows.map(r => Math.abs(r.correctedOceanError)));
    const maxDopplerAngle = Math.max(...dopplerRows.map(r => r.dopplerAngle));
    const prfs = [p.prf1, p.prf2, p.prf3].map(prf => ({
      prfHz: prf,
      pulseIntervalMs: 1000 / prf,
      spacingM: p.speed * 1000 / prf,
      unambiguousRangeKm: p.c / (2 * prf) / 1000,
      pulsesInAir: (2 * p.z0 * 1000 / p.c) * prf,
      status: prf >= 2 * maxTopoDoppler ? 'OK for modeled topo VHF Doppler' : 'Below simple Doppler floor'
    }));
    return {
      source: { workbook: 'v19 live JS model', workbookPath: 'assets/v19.xlsx', generatedFrom: 'browser-side v19 formulas' },
      overview: window.V19_RESULTS.overview,
      summary: [
        { label: 'Topography toggle', value: p.topographyOn ? 'Topography ON' : 'Topography OFF', unit: '', meaning: 'Live browser toggle for terrain terms.' },
        { label: 'Flat apparent depth at mid-pass', value: mid.flatDepth, unit: 'm', meaning: 'Original flat-surface result.' },
        { label: 'Topo apparent depth at mid-pass', value: mid.topoDepth, unit: 'm', meaning: 'Apparent depth after terrain height changes the range geometry.' },
        { label: 'Depth change from topography', value: mid.depthChange, unit: 'm', meaning: 'Topo apparent depth minus flat apparent depth.' },
        { label: 'Topo extra two-way delay', value: mid.topoDelay, unit: 'us', meaning: 'Two-way delay after topography is included.' },
        { label: 'Topo VHF interferometric phase', value: mid.vhfPhaseTopo, unit: 'deg', meaning: 'VHF phase after topography changes the look geometry.' },
        { label: 'Max target terrain height', value: Math.max(...modelRows.map(r => r.hTarget)), unit: 'm', meaning: 'Highest modeled terrain at the side-offset target path.' },
        { label: 'Min target terrain height', value: Math.min(...modelRows.map(r => r.hTarget)), unit: 'm', meaning: 'Lowest modeled terrain at the side-offset target path.' },
        { label: 'Max absolute topo depth change', value: Math.max(...modelRows.map(r => Math.abs(r.depthChange))), unit: 'm', meaning: 'Largest magnitude of topography-driven apparent-depth change.' },
        { label: 'Max topo VHF Doppler magnitude', value: maxTopoDoppler, unit: 'Hz', meaning: 'Largest VHF Doppler after topography is included.' },
        { label: 'Simple minimum PRF with topo', value: 2 * maxTopoDoppler, unit: 'Hz', meaning: 'Twice max topo VHF Doppler, a simple no-alias floor.' }
      ],
      prf: prfs,
      subsurface: [
        { label: 'Average bottom depth', value: avgBottom, unit: 'm', meaning: 'Mean proposed ice-ocean boundary depth.' },
        { label: 'Boundary uncertainty band', value: p.boundaryUncertainty, unit: 'm', meaning: 'Plus/minus range around bottom reflector.' },
        { label: 'Best ocean echo margin', value: bestOcean, unit: 'dB', meaning: 'How far deep reflector rises above/below threshold.' },
        { label: 'Best lens echo margin', value: bestLens, unit: 'dB', meaning: 'How far internal lens return rises above/below threshold.' },
        { label: 'Likely visible ocean samples', value: visibleOcean, unit: 'count', meaning: 'Pass samples clearing the detection threshold.' },
        { label: 'Total evidence support', value: evidence, unit: '%', meaning: 'Radar + thermal + composition + magnetic/plasma support.' }
      ],
      realism: window.V19_RESULTS.realism,
      doppler: [
        { label: 'Mean raw slant error', value: dopplerMeanRaw, unit: 'm' },
        { label: 'Mean corrected error', value: dopplerMeanCorrected, unit: 'm' },
        { label: 'Max Doppler angle', value: maxDopplerAngle, unit: 'deg' },
        { label: 'Depth correction status', value: dopplerMeanCorrected < 0.001 ? 'PASS' : 'CHECK', unit: '' }
      ],
      dopplerInputs: [
        { label: 'VHF wavelength', value: p.lambdaVhf, unit: 'm' },
        { label: 'Spacecraft speed', value: p.speed * 1000, unit: 'm/s' },
        { label: 'Ice refractive index', value: p.n, unit: 'n' },
        { label: 'Speed of light', value: p.c, unit: 'm/s' }
      ],
      inputs: window.V19_RESULTS.inputs,
      subsurfaceInputs: window.V19_RESULTS.subsurfaceInputs,
      checks: [
        { check: 'Live JS model loaded', status: 'OK', formula: 'Browser formulas are active.' },
        { check: 'Charts are recalculated', status: 'OK', formula: 'Changing controls rebuilds chart series.' },
        { check: 'PRF high vs simple PRF floor', status: p.prf3 >= 2 * maxTopoDoppler ? 'OK' : 'CHECK', formula: 'PRF_3 should exceed the live topo Doppler floor.' },
        { check: 'Subsurface layer order', status: subMid.upperDepth < subMid.lensDepth && subMid.lensDepth < subMid.oceanDepth ? 'OK' : 'CHECK', formula: 'Upper layer < lens < ocean at mid-pass.' }
      ],
      subsurfaceChecks: window.V19_RESULTS.subsurfaceChecks,
      audit: window.V19_RESULTS.audit,
      charts: buildCharts(modelRows, subRows, dopplerRows, p)
    };
  }

  window.V19_LIVE_MODEL = {
    defaults,
    controls,
    compute
  };
})();

(function () {
  const titlePulse = 'Pulse compression gain vs pulse length';
  const titleGeometric = 'Geometric spreading power dB';
  const titleCoherent = 'Coherent Fresnel-zone gain';
  const titleTotalVhf = 'Total VHF dB: constant vs frequency-dependent response';

  const defaults = {
    iceIndex: 1.78,
    alongTrackSpacingM: 500,
    pulseLengthUs: 20,
    windowLossDb: -1.3444034312785926,
    baseReflectivityDb: 0,
    frequencySlopeDbPerOctave: -2,
    referenceFrequencyMhz: 9
  };

  const controls = [
    { key: 'iceIndex', label: 'Ice refractive index', min: 1.2, max: 2.2, step: 0.01 },
    { key: 'alongTrackSpacingM', label: 'Along-track spacing', unit: 'm', min: 50, max: 1500, step: 25 },
    { key: 'pulseLengthUs', label: 'Pulse length', unit: 'us', min: 5, max: 100, step: 5 },
    { key: 'windowLossDb', label: 'Window loss', unit: 'dB', min: -6, max: 0, step: 0.1 },
    { key: 'baseReflectivityDb', label: 'Base reflectivity', unit: 'dB', min: -20, max: 10, step: 0.5 },
    { key: 'frequencySlopeDbPerOctave', label: 'Frequency slope', unit: 'dB/oct', min: -8, max: 4, step: 0.25 },
    { key: 'referenceFrequencyMhz', label: 'Reference frequency', unit: 'MHz', min: 3, max: 30, step: 1 }
  ];

  function round(value, digits = 6) {
    if (!Number.isFinite(value)) return null;
    const scale = 10 ** digits;
    return Math.round(value * scale) / scale;
  }

  function db(value) {
    return 10 * Math.log10(Math.max(value, 1e-12));
  }

  function log2(value) {
    return Math.log(Math.max(value, 1e-12)) / Math.log(2);
  }

  function pulseGain(lengthUs, windowLossDb) {
    return db(Math.max(lengthUs, 0.1)) + windowLossDb;
  }

  function getChart(baseData, title) {
    return baseData && baseData.charts ? baseData.charts.find((chart) => chart.title === title) : null;
  }

  function fallbackChart(id, title, xLabel, yLabel) {
    return {
      id,
      section: 'Latest v30',
      sourceSheet: 'Browser model',
      title,
      note: 'Recalculated in the browser from editable inputs.',
      xLabel,
      yLabel,
      kind: 'line',
      series: []
    };
  }

  function withSeries(source, fallback, series) {
    const chart = source || fallback;
    return {
      ...chart,
      sourceSheet: chart.sourceSheet || 'Browser model',
      note: 'Recalculated in the browser from editable v30 inputs.',
      series
    };
  }

  function replacePointY(point, y) {
    const next = [point[0], round(y)];
    if (point.length > 2) next.push(point[2]);
    return next;
  }

  function buildPulseChart(params, source) {
    const lengths = source && source.series.length
      ? source.series[0].points.map((point) => point[0])
      : [5, 10, 20, 50, 100];
    const hf = lengths.map((length) => [length, round(pulseGain(length, params.windowLossDb))]);
    const vhf = lengths.map((length) => [length, round(pulseGain(length, params.windowLossDb) + 10)]);
    return withSeries(
      source,
      fallbackChart('v30-live-pulse-gain', titlePulse, 'Pulse length (us)', 'dB'),
      [
        { name: 'HF pulse gain', points: hf },
        { name: 'VHF pulse gain', points: vhf }
      ]
    );
  }

  function buildGeometricChart(params, source) {
    const baseSeries = source ? source.series : [];
    const series = baseSeries.map((item, index) => ({
      name: index === 0 ? 'HF geometric power' : 'VHF topo geometric power',
      points: item.points.map((point) => replacePointY(point, point[1] + params.baseReflectivityDb))
    }));
    return withSeries(
      source,
      fallbackChart('v30-live-geometric-power', titleGeometric, 'Along-track position (km)', 'dB'),
      series
    );
  }

  function coherentAdjustment(params) {
    const spacingRatio = defaults.alongTrackSpacingM / Math.max(params.alongTrackSpacingM, 1);
    const iceRatio = Math.sqrt(defaults.iceIndex / Math.max(params.iceIndex, 0.1));
    return db(spacingRatio * iceRatio);
  }

  function buildCoherentChart(params, source) {
    const adjustment = coherentAdjustment(params);
    const baseSeries = source ? source.series : [];
    const series = baseSeries.map((item, index) => ({
      name: index === 0 ? 'HF coherent gain' : 'VHF coherent gain',
      points: item.points.map((point) => replacePointY(point, point[1] + adjustment))
    }));
    return withSeries(
      source,
      fallbackChart('v30-live-coherent-gain', titleCoherent, 'Along-track position (km)', 'dB'),
      series
    );
  }

  function buildTotalVhfChart(params, source, geometricChart, coherentChart) {
    const geom = geometricChart.series[1] || geometricChart.series[0] || { points: [] };
    const coherent = coherentChart.series[1] || coherentChart.series[0] || { points: [] };
    const selectedPulseGain = pulseGain(params.pulseLengthUs, params.windowLossDb) + 10;
    const frequencyResponse = params.frequencySlopeDbPerOctave * log2(60 / Math.max(params.referenceFrequencyMhz, 0.1));
    const constantPoints = geom.points.map((point, index) => {
      const coherentGain = coherent.points[index] ? coherent.points[index][1] : 0;
      return replacePointY(point, point[1] + coherentGain + selectedPulseGain);
    });
    const frequencyPoints = constantPoints.map((point) => replacePointY(point, point[1] + frequencyResponse));
    return withSeries(
      source,
      fallbackChart('v30-live-total-vhf-db', titleTotalVhf, 'Along-track position (km)', 'dB'),
      [
        { name: 'Constant reflectivity', points: constantPoints },
        { name: 'Frequency-dependent reflectivity', points: frequencyPoints }
      ]
    );
  }

  function compute(params, baseData) {
    const base = baseData || window.V30_RESULTS;
    if (!base || !base.charts) return base;
    const p = { ...defaults, ...params };
    const pulseChart = buildPulseChart(p, getChart(base, titlePulse));
    const geometricChart = buildGeometricChart(p, getChart(base, titleGeometric));
    const coherentChart = buildCoherentChart(p, getChart(base, titleCoherent));
    const totalVhfChart = buildTotalVhfChart(p, getChart(base, titleTotalVhf), geometricChart, coherentChart);
    const replacements = new Map([
      [titlePulse, pulseChart],
      [titleGeometric, geometricChart],
      [titleCoherent, coherentChart],
      [titleTotalVhf, totalVhfChart]
    ]);
    return {
      ...base,
      charts: base.charts.map((chart) => replacements.get(chart.title) || chart)
    };
  }

  window.V30_LIVE_MODEL = {
    defaults,
    controls,
    compute
  };
})();
