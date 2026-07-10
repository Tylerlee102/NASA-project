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
    surfaceClutterBand: 12,
    falseLayerEnabled: true,
    falseLayerCount: 3,
    falseLayerDepthFraction: 0.68,
    falseLayerStrength: -16,
    receiverAmbiguityDb: 3
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
    { key: 'boundaryUncertainty', label: 'Boundary uncertainty', unit: 'm', min: 0, max: 5000, step: 100 },
    { key: 'falseLayerEnabled', label: 'Simulated false reflectors enabled', type: 'checkbox' },
    { key: 'falseLayerCount', label: 'False layer count', min: 0, max: 8, step: 1 },
    { key: 'falseLayerDepthFraction', label: 'False-reflector depth fraction', unit: 'of shell', min: 0.35, max: 0.9, step: 0.01 },
    { key: 'falseLayerStrength', label: 'False layer strength', unit: 'dB', min: -30, max: 0, step: 1 },
    { key: 'receiverAmbiguityDb', label: 'Ambiguity window', unit: 'dB', min: 1, max: 8, step: 0.5 }
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
  function delayUsFromPathM(pathM, p) { return 2 * pathM / p.c * 1000000; }
  function delayUsInIce(depthM, p) { return 2 * p.n * depthM / p.c * 1000000; }

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
      // Geometry distances are in km until converted to meters for apparent depth and delay.
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
        flatDelay: delayUsFromPathM(deltaR, p),
        hNadir, hTarget, rNadirTopo, rOffTopo, deltaTopo, topoDepth,
        topoDelay: delayUsFromPathM(deltaTopo, p),
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
      // Layer delays are two-way travel times through ice: 2 * n * depth_m / c.
      r.upperDelay = delayUsInIce(r.upperDepth, p);
      r.lensDelay = delayUsInIce(r.lensDepth, p);
      r.oceanDelay = delayUsInIce(r.oceanDepth, p);
      // Echo terms are relative power dB. The attenuation input is one-way dB/km,
      // so the round-trip loss uses -2 * attenuation * depth_km.
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
      const angleResidualDeg = 0.18 * sin(2 * pi * m.x / 37) + 0.05 * cos(2 * pi * m.x / 19);
      const measuredDopplerAngle = dopplerAngle + angleResidualDeg;
      const cosTheta = cos(rad(dopplerAngle));
      const measuredCosTheta = cos(rad(measuredDopplerAngle));
      const rawOceanSlant = s.oceanDepth / cosTheta;
      const rawLensSlant = s.lensDepth / cosTheta;
      const rawUpperSlant = s.upperDepth / cosTheta;
      const correctedOceanDepth = rawOceanSlant * measuredCosTheta;
      return {
        x: m.x,
        dopplerAngle,
        measuredDopplerAngle,
        angleResidualDeg,
        geometryAngle: m.lookAngle,
        trueOceanDepth: s.oceanDepth,
        rawOceanSlant,
        correctedOceanDepth,
        uncorrectedOceanError: rawOceanSlant - s.oceanDepth,
        correctedOceanError: correctedOceanDepth - s.oceanDepth,
        correctedLensDepth: rawLensSlant * measuredCosTheta,
        correctedUpperDepth: rawUpperSlant * measuredCosTheta
      };
    });
  }

  function computeFalseLayerResponse(subRows, p) {
    const enabled = Boolean(p.falseLayerEnabled) && p.falseLayerCount > 0;
    const layerCount = enabled ? Math.max(1, p.falseLayerCount) : 0;
    const stackGain = enabled ? 2.2 * Math.log2(layerCount + 1) : 0;
    return subRows.map((r) => {
      const depthRipple = 0.04 * sin(2 * pi * r.x / 52) + 0.025 * cos(2 * pi * r.x / 21);
      const fraction = clamp(p.falseLayerDepthFraction + depthRipple, 0.22, 0.94);
      const rawFalseDepth = r.oceanDepth * fraction;
      const falseDepth = clamp(rawFalseDepth, r.lensDepth + 350, r.oceanDepth - 450);
      const falseDelay = delayUsInIce(falseDepth, p);
      const interference = enabled ? 1.6 * sin(2 * pi * r.x / 34) + 0.7 * cos(2 * pi * r.x / 21) : 0;
      const falseEcho = enabled
        ? p.falseLayerStrength + stackGain + interference - 2 * p.attenuation * (falseDepth / 1000)
        : -999;
      const falseMargin = falseEcho - p.detectionThreshold;
      const oceanMargin = r.oceanMargin;
      const falseMinusOcean = falseEcho - r.oceanEcho;
      const surfaceClutterMargin = p.shallowEcho + p.surfaceClutterBand * 0.28 + 2 * sin(2 * pi * r.x / 28) - p.detectionThreshold;
      const oceanDetected = oceanMargin >= 0;
      const falseDetected = falseMargin >= 0;
      let decision = 'Weak/no deep detection';
      let selectedDepth = null;
      let selectedDelay = null;
      let decisionCode = 0;
      let confidence = 18;
      let reaction = 'Keep collecting echoes; no confident deep boundary is selected.';

      if (falseDetected && falseMinusOcean > p.receiverAmbiguityDb) {
        decision = oceanDetected ? 'False boundary selected' : 'False layer only visible';
        selectedDepth = falseDepth;
        selectedDelay = falseDelay;
        decisionCode = 3;
        confidence = clamp(58 + falseMinusOcean * 2.1 + falseMargin * 0.25 - (oceanDetected ? 0 : 12), 0, 100);
        reaction = 'The strongest deep return points to the false layer; processing should flag it for frequency and continuity checks.';
      } else if (falseDetected && oceanDetected && Math.abs(falseMinusOcean) <= p.receiverAmbiguityDb) {
        decision = 'Ambiguous double return';
        selectedDepth = (falseDepth + r.oceanDepth) / 2;
        selectedDelay = (falseDelay + r.oceanDelay) / 2;
        decisionCode = 2;
        confidence = clamp(48 - Math.abs(falseMinusOcean) * 5 + Math.min(falseMargin, oceanMargin) * 0.2, 0, 100);
        reaction = 'Two deep echoes are too close in strength; the result should be labeled ambiguous rather than trusted as ocean.';
      } else if (oceanDetected) {
        decision = 'Ocean boundary likely';
        selectedDepth = r.oceanDepth;
        selectedDelay = r.oceanDelay;
        decisionCode = 1;
        confidence = clamp(70 + (-falseMinusOcean) * 1.7 + oceanMargin * 0.35, 0, 100);
        reaction = 'The ocean echo remains the strongest deep return; the receiver can keep the ice-ocean boundary interpretation.';
      } else if (falseDetected) {
        decision = 'False layer only visible';
        selectedDepth = falseDepth;
        selectedDelay = falseDelay;
        decisionCode = 3;
        confidence = clamp(44 + falseMargin * 0.45, 0, 100);
        reaction = 'Only the false layer clears threshold; an automatic strongest-echo read would report the wrong depth.';
      }

      return {
        x: r.x,
        oceanDepth: r.oceanDepth,
        falseDepth,
        selectedDepth,
        depthError: selectedDepth == null ? null : selectedDepth - r.oceanDepth,
        oceanDelay: r.oceanDelay,
        falseDelay,
        selectedDelay,
        oceanMargin,
        falseMargin,
        surfaceClutterMargin,
        falseMinusOcean,
        decision,
        decisionCode,
        confidence,
        reaction
      };
    });
  }

  function pts(rows, xKey, yKey) {
    return rows.map(r => [round(r[xKey]), r[yKey] == null ? null : round(r[yKey])]);
  }

  function round(v) {
    return Number.isFinite(v) ? Number(v.toFixed(6)) : null;
  }

  function chart(id, section, title, yLabel, series, note, kind, options) {
    const extra = options || {};
    return {
      id,
      section,
      sourceSheet: 'Live JS model',
      title,
      note: note || '',
      xLabel: extra.xLabel || 'Along-track position (km)',
      yLabel,
      kind: kind || 'line',
      formulaNote: extra.formulaNote || '',
      series: series.map(s => ({ name: s.name, points: s.points }))
    };
  }

  function scenarioRows(p, scenario) {
    const rows = [];
    for (let i = 0; i < rowCount; i += 1) {
      const t = i / (rowCount - 1);
      const x = scenario.xMin + t * (scenario.xMax - scenario.xMin);
      const z = scenario.z0 + scenario.delta * (x / scenario.edge) ** 2;
      const rOff = slantRange(z, x, p.y, p, 0);
      const extraPathM = (rOff - z) * 1000;
      rows.push({
        x,
        depth: extraPathM / p.n,
        delay: delayUsFromPathM(extraPathM, p),
        altitude: z
      });
    }
    return rows;
  }

  function buildCharts(modelRows, subRows, dopplerRows, falseRows, p) {
    const scenarios = [
      { name: 'Custom 400 km / 120 km pass', z0: p.z0, xMin: p.xMin, xMax: p.xMax, edge: p.xEdge, delta: p.deltaZEdge },
      { name: 'Paper low-altitude 35 km / 800 km pass', z0: 35, xMin: -400, xMax: 400, edge: 400, delta: 365 },
      { name: 'Paper ice-ocean 35 km / 1600 km pass', z0: 35, xMin: -800, xMax: 800, edge: 800, delta: 965 },
      { name: 'Operating 25 km / 1600 km pass', z0: 25, xMin: -800, xMax: 800, edge: 800, delta: 975 }
    ].map(s => ({ name: s.name, rows: scenarioRows(p, s) }));

    const charts = [
      chart('live-surface-height', 'Surface and motion', 'Surface Height: Off-Nadir Target vs Nadir Reference Terrain', 'Surface elevation (m)', [
        { name: 'Off-nadir target terrain', points: pts(modelRows, 'x', 'hTarget') },
        { name: 'Nadir terrain', points: pts(modelRows, 'x', 'hNadir') }
      ], 'Compares the side-offset target path with the nadir reference terrain used in the topography-adjusted range calculation.'),
      chart('live-scenario-depth', 'Surface and motion', 'Apparent Depth: Spacecraft Motion Distortion by Run', 'Apparent depth (m)', scenarios.map(s => ({ name: s.name, points: pts(s.rows, 'x', 'depth') })), 'Recomputed apparent depth for the custom pass and paper-derived pass overlays.'),
      chart('live-terrain-error', 'Surface and motion', 'Terrain Baseline: Surface-Height Equivalent Error', 'Surface-height equivalent error (m)', [
        { name: 'Total radar elevation error - custom parabolic', points: pts(modelRows, 'x', 'apparentSurfaceHeight') }
      ], 'Terrain-caused apparent elevation shift from the flat baseline.'),
      chart('live-doppler-flat-topo', 'Surface and motion', 'Doppler: Flat Geometry vs Topography', 'Doppler shift (Hz)', [
        { name: 'Flat VHF Doppler (Hz)', points: pts(modelRows, 'x', 'vhfDoppler') },
        { name: 'Topo VHF Doppler (Hz)', points: pts(modelRows, 'x', 'vhfDopplerTopo') },
        { name: 'Flat HF Doppler (Hz)', points: pts(modelRows, 'x', 'hfDoppler') },
        { name: 'Topo HF Doppler (Hz)', points: pts(modelRows, 'x', 'hfDopplerTopo') }
      ], 'Flat and topography-adjusted Doppler shifts for VHF and HF.'),
      chart('live-scenario-delay', 'Surface and motion', 'Scenario Two-Way Extra Delay: Flat Surface', 'Two-way extra delay (us)', scenarios.map(s => ({ name: s.name, points: pts(s.rows, 'x', 'delay') })), 'Uses 2 * extra path / c, in microseconds, for each scenario pass.'),
      chart('live-delay-flat-topo', 'Surface and motion', 'Custom Pass Two-Way Extra Delay: Flat vs Generated Topography', 'Two-way extra delay (us)', [
        { name: 'Flat surface pass', points: pts(modelRows, 'x', 'flatDelay') },
        { name: 'Topography-adjusted pass', points: pts(modelRows, 'x', 'topoDelay') }
      ], 'Compares the flat off-nadir extra delay with the generated-terrain delay for the active baseline pass.')
    ];

    charts.push(
      chart('live-icy-layers', 'Subsurface model', 'Subsurface Truth Model: Icy Layers', 'Elevation relative to model reference (m)', [
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
        { name: '0 dB threshold', points: subRows.map(r => [round(r.x), 0]) }
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
        { name: '0 dB threshold', points: subRows.map(r => [round(r.x), 0]) }
      ], 'Positive values clear the simple detection threshold.'),
      chart('live-materials', 'Subsurface model', 'Reflection Strength by Material / Interface', 'Relative reflector strength (dB)', [
        { name: 'Material/interface strength', points: [['Cold clean ice', -18], ['Salt-rich ice', -14], ['Briny lens', -10], ['Dirty ice mix', -6], ['Ice-ocean boundary', -2]] }
      ], 'Relative assumed reflector strength by material or interface.', 'bar', { xLabel: 'Material / interface' }),
      chart('live-evidence', 'Subsurface model', 'Cross-Instrument Evidence Score', 'Support (%)', [
        { name: 'Evidence support score', points: [['Radar', p.radarSupport], ['Thermal', p.thermalSupport], ['Composition', p.compositionSupport], ['Magnetic/plasma', p.magneticSupport]] }
      ], 'Simple support scores for radar, thermal, composition, and magnetic/plasma evidence.', 'bar', { xLabel: 'Instrument' })
    );

    const decisionCounts = [
      ['Ocean likely', falseRows.filter(r => r.decision === 'Ocean boundary likely').length],
      ['Ambiguous', falseRows.filter(r => r.decision === 'Ambiguous double return').length],
      ['False picked', falseRows.filter(r => r.decision === 'False boundary selected' || r.decision === 'False layer only visible').length],
      ['Weak/no deep detection', falseRows.filter(r => r.decision === 'Weak/no deep detection').length]
    ].map(([label, count]) => [label, round(100 * count / falseRows.length)]);

    charts.push(
      chart('live-false-echo-race', 'False-layer response', 'Competing Echo Margins: Receiver Signal Strength', 'Margin above threshold (dB)', [
        { name: 'Surface clutter margin', points: pts(falseRows, 'x', 'surfaceClutterMargin') },
        { name: 'False layer margin', points: pts(falseRows, 'x', 'falseMargin') },
        { name: 'Ocean boundary margin', points: pts(falseRows, 'x', 'oceanMargin') },
        { name: '0 dB threshold', points: falseRows.map(r => [round(r.x), 0]) }
      ], 'Shows which echo rises above the receiver threshold and which one is stronger.'),
      chart('live-false-picked-depth', 'False-layer response', 'Picked Boundary Depth vs True Ocean Depth', 'Depth below local surface (m)', [
        { name: 'True ocean boundary', points: pts(falseRows, 'x', 'oceanDepth') },
        { name: 'False layer depth', points: pts(falseRows, 'x', 'falseDepth') },
        { name: 'Receiver selected boundary', points: pts(falseRows, 'x', 'selectedDepth') }
      ], 'If the selected boundary follows the false layer instead of the ocean, the rule selects the internal reflector.'),
      chart('live-false-delay', 'False-layer response', 'Return Timing: False Layer Arrives Before Ocean', 'Two-way delay in ice (us)', [
        { name: 'False layer return', points: pts(falseRows, 'x', 'falseDelay') },
        { name: 'Ocean boundary return', points: pts(falseRows, 'x', 'oceanDelay') },
        { name: 'Receiver selected return', points: pts(falseRows, 'x', 'selectedDelay') }
      ], 'A false layer is shallower, so its echo arrives earlier than the true ocean-boundary echo.'),
      chart('live-false-depth-error', 'False-layer response', 'Depth Error If the Receiver Picks the Wrong Layer', 'Depth error (m)', [
        { name: 'Selected minus true ocean', points: pts(falseRows, 'x', 'depthError') },
        { name: 'No error line', points: falseRows.map(r => [round(r.x), 0]) }
      ], 'Negative error means the radar interpretation is too shallow because it locked onto an internal layer.'),
      chart('live-false-decision-code', 'False-layer response', 'Satellite Receiver Decision Along Track', 'Decision code', [
        { name: '0 weak, 1 ocean, 2 ambiguous, 3 false', points: pts(falseRows, 'x', 'decisionCode') }
      ], 'Decision code summarizes how the simplified receiver classifies each along-track point.'),
      chart('live-false-decision-share', 'False-layer response', 'Receiver Outcome Share for This Flyby', 'Percent of along-track samples', [
        { name: 'Share of samples', points: decisionCounts }
      ], 'Converts the along-track receiver decisions into percent shares for the active false-layer setting.', 'bar', { xLabel: 'Receiver outcome' })
    );

    charts.push(
      chart('live-doppler-angle', 'Doppler depth correction', 'Doppler-Inverted Look Angle vs Existing Geometry', 'Look angle (deg)', [
        { name: 'Doppler angle from VHF shift', points: pts(dopplerRows, 'x', 'dopplerAngle') },
        { name: 'Angle used after residual', points: pts(dopplerRows, 'x', 'measuredDopplerAngle') },
        { name: 'Existing model geometry angle', points: pts(dopplerRows, 'x', 'geometryAngle') }
      ], 'Doppler-derived look angle compared with geometry. A small deterministic residual is included to avoid a perfect inversion.'),
      chart('live-slant-depth', 'Doppler depth correction', 'Raw Slant Depth vs Doppler-Corrected Ocean Depth', 'Depth below local surface (m)', [
        { name: 'True simulated ocean depth', points: pts(dopplerRows, 'x', 'trueOceanDepth') },
        { name: 'Raw slant depth from echo delay', points: pts(dopplerRows, 'x', 'rawOceanSlant') },
        { name: 'Doppler-corrected depth estimate', points: pts(dopplerRows, 'x', 'correctedOceanDepth') }
      ], 'Controlled correction from slant depth to vertical depth; residual angle error keeps the result illustrative, not perfect.'),
      chart('live-depth-error', 'Doppler depth correction', 'Depth Error Before and After Angle Correction', 'Depth error (m)', [
        { name: 'Uncorrected slant-depth error', points: pts(dopplerRows, 'x', 'uncorrectedOceanError') },
        { name: 'Corrected depth residual', points: pts(dopplerRows, 'x', 'correctedOceanError') }
      ], 'Error drops after applying the Doppler angle correction, but a small residual remains in the controlled simulation.'),
      chart('live-corrected-layers', 'Doppler depth correction', 'Corrected Layer Depths From Doppler Angle', 'Depth below local surface (m)', [
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
    const falseRows = computeFalseLayerResponse(subRows, p);
    const mid = modelRows[Math.floor(modelRows.length / 2)];
    const subMid = subRows[Math.floor(subRows.length / 2)];
    const falseMid = falseRows[Math.floor(falseRows.length / 2)];
    const maxTopoDoppler = Math.max(...modelRows.map(r => Math.abs(r.vhfDopplerTopo)));
    const avgBottom = mean(subRows.map(r => r.oceanDepth));
    const bestOcean = Math.max(...subRows.map(r => r.oceanMargin));
    const bestLens = Math.max(...subRows.map(r => r.lensMargin));
    const visibleOcean = subRows.filter(r => r.oceanMargin >= 0).length;
    const clearOceanCount = falseRows.filter(r => r.decision === 'Ocean boundary likely').length;
    const ambiguousCount = falseRows.filter(r => r.decision === 'Ambiguous double return').length;
    const falsePickedCount = falseRows.filter(r => r.decision === 'False boundary selected' || r.decision === 'False layer only visible').length;
    const weakCount = falseRows.filter(r => r.decision === 'Weak/no deep detection').length;
    const pct = (count) => 100 * count / falseRows.length;
    const depthErrors = falseRows.map(r => r.depthError).filter(Number.isFinite);
    const worstDepthError = depthErrors.length ? Math.max(...depthErrors.map(v => Math.abs(v))) : 0;
    const midDepthError = Number.isFinite(falseMid.depthError) ? falseMid.depthError : '';
    const evidenceWeight = p.radarWeight + p.thermalWeight + p.compositionWeight + p.magneticWeight;
    const evidence = (p.radarSupport * p.radarWeight + p.thermalSupport * p.thermalWeight + p.compositionSupport * p.compositionWeight + p.magneticSupport * p.magneticWeight) / evidenceWeight;
    const dopplerMeanRaw = mean(dopplerRows.map(r => r.uncorrectedOceanError));
    const dopplerMeanCorrected = mean(dopplerRows.map(r => Math.abs(r.correctedOceanError)));
    const maxDopplerAngle = Math.max(...dopplerRows.map(r => r.dopplerAngle));
    const layersOrdered = subRows.every(r => r.upperDepth < r.lensDepth && r.lensDepth < r.oceanDepth);
    const depthsPositive = subRows.every(r => r.upperDepth > 0 && r.lensDepth > 0 && r.oceanDepth > 0);
    const lensStrengthValid = subRows.every(r => r.lensStrength >= 0 && r.lensStrength <= 1);
    const echoesFinite = subRows.every(r => [r.upperEcho, r.lensEcho, r.oceanEcho].every(Number.isFinite));
    const marginsFinite = subRows.every(r => [r.lensMargin, r.oceanMargin].every(Number.isFinite));
    const evidenceWeightsPositive = [p.radarWeight, p.thermalWeight, p.compositionWeight, p.magneticWeight].every(value => Number.isFinite(value) && value > 0);
    const prfs = [p.prf1, p.prf2, p.prf3].map(prf => ({
      prfHz: prf,
      pulseIntervalMs: 1000 / prf,
      spacingM: p.speed * 1000 / prf,
      unambiguousRangeKm: p.c / (2 * prf) / 1000,
      pulsesInAir: (2 * p.z0 * 1000 / p.c) * prf,
      status: prf >= 2 * maxTopoDoppler ? 'Above simple Doppler sampling floor' : 'Below simple Doppler sampling floor'
    }));
    return {
      source: { workbook: 'Baseline live sensitivity model', workbookPath: 'assets/v19.xlsx', generatedFrom: 'browser-side baseline formulas' },
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
        { label: 'Simple minimum PRF with topo', value: 2 * maxTopoDoppler, unit: 'Hz', meaning: 'Nyquist-style floor from twice the max modeled VHF Doppler; not a complete radar PRF design rule.' }
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
      falseResponse: [
        { label: 'Mid-pass receiver decision', value: falseMid.decision, unit: '', meaning: falseMid.reaction },
        { label: 'Mid-pass heuristic score', value: falseMid.confidence, unit: '%', meaning: 'Heuristic score from the simplified receiver rule after comparing false and ocean echoes.' },
        { label: 'Mid-pass false minus ocean', value: falseMid.falseMinusOcean, unit: 'dB', meaning: 'Positive means the false layer is brighter than the ocean return.' },
        { label: 'Mid-pass picked-depth error', value: midDepthError, unit: 'm', meaning: 'Selected boundary depth minus true ocean depth at mid-pass.' },
        { label: 'Ocean-boundary likely', value: pct(clearOceanCount), unit: '%', meaning: 'Share of samples where the ocean echo remains the best deep return.' },
        { label: 'Ambiguous double return', value: pct(ambiguousCount), unit: '%', meaning: 'Share where the false layer and ocean are too close in strength.' },
        { label: 'False-boundary selected', value: pct(falsePickedCount), unit: '%', meaning: 'Share where a simple strongest-deep-echo rule would pick the false layer.' },
        { label: 'Weak/no deep detection', value: pct(weakCount), unit: '%', meaning: 'Share where neither deep return is strong enough for a confident boundary.' },
        { label: 'Worst fooled-depth error', value: worstDepthError, unit: 'm', meaning: 'Largest absolute depth error if the selected return is treated as the ocean boundary.' }
      ],
      falseSteps: [
        { step: '1. Pulse enters ice', satelliteResponse: 'Record all returned echoes', result: 'Surface clutter arrives first, then internal layers, then possible ocean boundary.' },
        { step: '2. Threshold check', satelliteResponse: 'Drop weak returns', result: 'Echoes below the detection threshold are not trusted as boundaries.' },
        { step: '3. Deep echo ranking', satelliteResponse: 'Compare false layer vs ocean return', result: 'The model compares false-minus-ocean dB for every along-track sample.' },
        { step: '4. Ambiguity rule', satelliteResponse: 'Flag close returns', result: `If returns are within ${formatDb(p.receiverAmbiguityDb)}, the model labels the point ambiguous.` },
        { step: '5. Boundary pick', satelliteResponse: 'Choose or withhold interpretation', result: 'Ocean likely, false selected, ambiguous, or weak/no deep lock.' }
      ],
      realism: window.V19_RESULTS.realism,
      doppler: [
        { label: 'Mean raw slant error', value: dopplerMeanRaw, unit: 'm' },
        { label: 'Mean corrected residual', value: dopplerMeanCorrected, unit: 'm' },
        { label: 'Max Doppler angle', value: maxDopplerAngle, unit: 'deg' },
        { label: 'Depth correction status', value: dopplerMeanCorrected < 35 ? 'OK (controlled residual)' : 'REVIEW', unit: '' }
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
        { check: 'PRF high vs simple sampling floor', status: p.prf3 >= 2 * maxTopoDoppler ? 'OK' : 'CHECK', formula: 'PRF_3 should exceed 2 * max(abs(VHF Doppler)); this is a Nyquist-style floor only.' },
        { check: 'Subsurface layer order', status: subMid.upperDepth < subMid.lensDepth && subMid.lensDepth < subMid.oceanDepth ? 'OK' : 'CHECK', formula: 'Upper layer < lens < ocean at mid-pass.' }
      ],
      subsurfaceChecks: [
        { check: 'Layer order across pass', status: layersOrdered ? 'OK' : 'CHECK', why: 'Requires upper layer < lens < ocean at every modeled position.' },
        { check: 'Positive depths across pass', status: depthsPositive ? 'OK' : 'CHECK', why: 'All modeled layer depths must stay below the local surface.' },
        { check: 'Lens strength in range', status: lensStrengthValid ? 'OK' : 'CHECK', why: 'Lens strength must remain between 0 and 1.' },
        { check: 'Echo values finite', status: echoesFinite ? 'OK' : 'CHECK', why: 'All relative echo estimates must remain numeric.' },
        { check: 'Detection threshold numeric', status: Number.isFinite(p.detectionThreshold) ? 'OK' : 'CHECK', why: 'Detection threshold must be a finite relative dB value.' },
        { check: 'Detectability margins finite', status: marginsFinite ? 'OK' : 'CHECK', why: 'Lens and ocean margins must remain numeric.' },
        { check: 'Boundary uncertainty valid', status: Number.isFinite(p.boundaryUncertainty) && p.boundaryUncertainty >= 0 ? 'OK' : 'CHECK', why: 'Boundary uncertainty must be finite and nonnegative.' },
        { check: 'Evidence weights positive', status: evidenceWeightsPositive ? 'OK' : 'CHECK', why: 'Every evidence channel needs a positive weight.' },
        { check: 'Model claim boundary', status: 'REVIEW', why: 'Synthetic sensitivity output; not measured Europa data or a mission-validated inversion.' }
      ],
      audit: window.V19_RESULTS.audit,
      charts: buildCharts(modelRows, subRows, dopplerRows, falseRows, p)
    };
  }

  function formatDb(value) {
    return `${round(value)} dB`;
  }

  window.V19_LIVE_MODEL = {
    defaults,
    controls,
    compute
  };
})();

(function () {
  const pi = Math.PI;
  const c = 299792458;
  const rowCount = 181;

  const defaults = {
    z0: 25,
    deltaZEdge: 975,
    xMin: -500,
    xMax: 500,
    xEdge: 500,
    speed: 4.6,
    iceIndex: 1.78,
    targetDepthM: 6000,
    pulseLengthUs: 200,
    maxUsablePrfHz: 3000,
    prfCapHz: 3000,
    wavelengthM: 5,
    prfUpdateIntervalMs: 500,
    cpiMs: 500,
    safetyFactor: 1.25,
    surfaceScatteringDb: -10,
    dirtyIceClutterBoostDb: 4,
    targetSignalDb: -24,
    listenGuardUs: 5,
    receiverDeadTimeUs: 10
  };

  const controls = [
    { key: 'z0', label: 'Closest altitude', unit: 'km', min: 25, max: 1000, step: 5 },
    { key: 'deltaZEdge', label: 'Altitude rise at edge', unit: 'km', min: 0, max: 1000, step: 25 },
    { key: 'speed', label: 'Flyby speed', unit: 'km/s', min: 1, max: 12, step: 0.1 },
    { key: 'targetDepthM', label: 'Target depth', unit: 'm', min: 1000, max: 30000, step: 250 },
    { key: 'pulseLengthUs', label: 'Pulse length', unit: 'us', min: 5, max: 200, step: 5 },
    { key: 'maxUsablePrfHz', label: 'Max usable PRF', unit: 'Hz', min: 100, max: 8000, step: 50 },
    { key: 'wavelengthM', label: 'Radar wavelength', unit: 'm', min: 3, max: 35, step: 0.5 },
    { key: 'prfUpdateIntervalMs', label: 'PRF update interval', unit: 'ms', min: 10, max: 500, step: 10 },
    { key: 'cpiMs', label: 'CPI / dwell time', unit: 'ms', min: 10, max: 500, step: 10 },
    { key: 'safetyFactor', label: 'Safety factor', unit: 'x', min: 1, max: 2, step: 0.05 },
    { key: 'surfaceScatteringDb', label: 'Surface scattering', unit: 'dB', min: -35, max: 5, step: 1 },
    { key: 'dirtyIceClutterBoostDb', label: 'Dirty-ice clutter boost', unit: 'dB', min: 0, max: 15, step: 0.5 },
    { key: 'listenGuardUs', label: 'Listen/processing guard', unit: 'us', min: 0, max: 100, step: 1 },
    { key: 'receiverDeadTimeUs', label: 'Receiver dead time', unit: 'us', min: 0, max: 250, step: 5 },
    { key: 'targetSignalDb', label: 'Target signal', unit: 'dB', min: -45, max: 0, step: 1 }
  ];

  function clamp(value, min = 0, max = 1) {
    return Math.max(min, Math.min(max, value));
  }

  function round(value, digits = 6) {
    if (!Number.isFinite(value)) return null;
    const scale = 10 ** digits;
    return Math.round(value * scale) / scale;
  }

  function db(value) {
    return 10 * Math.log10(Math.max(value, 1e-12));
  }

  function altitudeAt(x, p) {
    const edge = Math.max(Math.abs(p.xEdge || 60), 1);
    return p.z0 + p.deltaZEdge * (x / edge) ** 2;
  }

  function timingBudget(zKm, depthM, p) {
    const pulseSec = Math.max(p.pulseLengthUs, 0) * 1e-6;
    const guardSec = Math.max(p.listenGuardUs, 0) * 1e-6;
    const deadTimeSec = Math.max(p.receiverDeadTimeUs || 0, 0) * 1e-6;
    const pathM = zKm * 1000 + Math.max(p.iceIndex, 0.1) * Math.max(depthM, 0);
    const twoWayTravelSec = 2 * pathM / c;
    const listenSec = pulseSec + guardSec + deadTimeSec + twoWayTravelSec;
    return {
      pulseUs: pulseSec * 1e6,
      guardUs: guardSec * 1e6,
      receiverDeadTimeUs: deadTimeSec * 1e6,
      twoWayTravelUs: twoWayTravelSec * 1e6,
      totalListenUs: listenSec * 1e6,
      prfHz: 1 / Math.max(listenSec, 1e-9)
    };
  }

  function pulseLimitedPrf(zKm, depthM, p) {
    return timingBudget(zKm, depthM, p).prfHz;
  }

  function apparentDepthForOffset(zKm, offsetKm, p) {
    return (Math.sqrt(zKm ** 2 + offsetKm ** 2) - zKm) * 1000 / p.iceIndex;
  }

  function offNadirForDepth(zKm, depthM, p) {
    const rangeKm = zKm + p.iceIndex * depthM / 1000;
    return Math.sqrt(Math.max(rangeKm ** 2 - zKm ** 2, 0));
  }

  function targetDelayClutterGeometry(zKm, depthM, p) {
    const iceIndex = Math.max(p.iceIndex, 0.1);
    const rangeKm = zKm + iceIndex * Math.max(depthM, 0) / 1000;
    const offsetKm = Math.sqrt(Math.max(rangeKm ** 2 - zKm ** 2, 0));
    const sinTheta = rangeKm > 0 ? clamp(offsetKm / rangeKm, 0, 0.999999) : 0;
    return {
      rangeKm,
      offsetKm,
      angleDeg: Math.asin(sinTheta) * 180 / pi
    };
  }

  function dopplerFromAngle(speedKmS, wavelengthM, angleDeg) {
    const speedMps = Math.max(speedKmS, 0) * 1000;
    const lambda = Math.max(wavelengthM, 0.01);
    const losVelocityMps = speedMps * Math.sin(degToRad(angleDeg));
    return {
      losVelocityMps,
      maxDopplerShiftHz: 2 * Math.abs(losVelocityMps) / lambda
    };
  }

  function surfaceDoppler(offsetKm, zKm, p) {
    const rangeKm = Math.sqrt(zKm ** 2 + offsetKm ** 2);
    const sinTheta = rangeKm > 0 ? offsetKm / rangeKm : 0;
    return 2 * p.speed * 1000 * sinTheta / Math.max(p.wavelengthM, 0.01);
  }

  function aliasFrequency(frequencyHz, prfHz) {
    const prf = Math.max(prfHz, 1);
    return ((((frequencyHz + prf / 2) % prf) + prf) % prf) - prf / 2;
  }

  function usablePrfLimit(p) {
    return Math.max(p.maxUsablePrfHz ?? p.prfCapHz ?? defaults.maxUsablePrfHz, 1);
  }

  function effectiveSurfaceScatteringDb(p) {
    const baseSurfaceDb = safeNumber(p.surfaceScatteringDb, defaults.surfaceScatteringDb, -80, 40);
    const dirtyBoostDb = safeNumber(p.dirtyIceClutterBoostDb, defaults.dirtyIceClutterBoostDb, 0, 30);
    return baseSurfaceDb + dirtyBoostDb;
  }

  function degToRad(value) {
    return value * pi / 180;
  }

  function safeNumber(value, fallback, min, max) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return clamp(numeric, min, max);
  }

  function prfRiskState(margin) {
    if (margin > 1.25) return 'SAFE';
    if (margin >= 1) return 'WARNING';
    return 'ALIASING/FOLDING RISK';
  }

  function displayBreakdownSpeed(value) {
    if (!Number.isFinite(value)) return 'No crossing for current target-delay geometry';
    return round(value, 2);
  }

  function computeBreakdownPoint(speedKmS, params) {
    const p = { ...defaults, ...params };
    const speed = safeNumber(speedKmS, defaults.speed, 0, 40);
    const wavelengthM = Math.max(safeNumber(p.wavelengthM, defaults.wavelengthM, 0.01, 100), 0.01);
    const altitudeKm = safeNumber(p.z0, defaults.z0, 1, 3000);
    const targetDepthM = safeNumber(p.targetDepthM, defaults.targetDepthM, 1, 50000);
    const safetyFactor = safeNumber(p.safetyFactor, defaults.safetyFactor, 1, 4);
    const cpiMs = safeNumber(p.cpiMs, defaults.cpiMs, 1, 2000);
    const prfUpdateIntervalMs = safeNumber(p.prfUpdateIntervalMs, defaults.prfUpdateIntervalMs, 1, 2000);
    const targetDelayGeometry = targetDelayClutterGeometry(altitudeKm, targetDepthM, { ...p, iceIndex: p.iceIndex });
    const delayClutterAngleDeg = safeNumber(targetDelayGeometry.angleDeg, 0, 0, 89.5);
    const speedMps = speed * 1000;
    const targetDelayDoppler = dopplerFromAngle(speed, wavelengthM, delayClutterAngleDeg);

    // Main false-layer geometry: surface clutter with the same round-trip
    // delay as the selected nadir target on a flat surface. At low altitude
    // this clutter ring can be far off-nadir even when true nadir Doppler is
    // near zero.
    const losVelocityMps = targetDelayDoppler.losVelocityMps;
    const maxDopplerShiftHz = targetDelayDoppler.maxDopplerShiftHz;
    const surfaceDopplerBandwidthHz = 2 * maxDopplerShiftHz;
    const flatAliasThresholdPrfHz = surfaceDopplerBandwidthHz;
    const firstZeroFoldPrfHz = maxDopplerShiftHz;

    // Nyquist-style stress-test floor: usable PRF should exceed the two-sided
    // flat-surface Doppler bandwidth, padded by a user-selected safety factor.
    const requiredPrfHz = flatAliasThresholdPrfHz * safetyFactor;
    const timing = timingBudget(altitudeKm, targetDepthM, { ...p, wavelengthM });
    const pulsePrfHz = timing.prfHz;
    const rawUsablePrfHz = Math.min(usablePrfLimit(p), pulsePrfHz);

    // This educational model treats a PRF schedule slower than the current CPI
    // as a reduced usable window, rather than claiming the PRF itself cannot
    // change instantaneously in real flight software.
    const scheduleAdaptationFactor = clamp(cpiMs / Math.max(prfUpdateIntervalMs, cpiMs, 1), 0.25, 1);
    const effectivePrfHz = rawUsablePrfHz * scheduleAdaptationFactor;
    const sampledHalfBandHz = effectivePrfHz / 2;
    const aliasAtEffectivePrfHz = aliasFrequency(maxDopplerShiftHz, effectivePrfHz);
    const prfMargin = effectivePrfHz / Math.max(requiredPrfHz, 1e-6);
    const aliasMargin = effectivePrfHz / Math.max(flatAliasThresholdPrfHz, 1e-6);
    const centerFrequencyMhz = c / wavelengthM / 1000000;
    const cpiDistanceM = speedMps * cpiMs / 1000;
    const surfaceClutterDb = effectiveSurfaceScatteringDb(p);
    const clutterToTargetDb = surfaceClutterDb - safeNumber(p.targetSignalDb, defaults.targetSignalDb, -120, 80);

    return {
      speedKmS: speed,
      altitudeKm,
      wavelengthM,
      centerFrequencyMhz,
      delayClutterAngleDeg,
      targetDelayOffsetKm: targetDelayGeometry.offsetKm,
      targetDelayRangeKm: targetDelayGeometry.rangeKm,
      losVelocityMps,
      maxDopplerShiftHz,
      surfaceDopplerBandwidthHz,
      flatAliasThresholdPrfHz,
      firstZeroFoldPrfHz,
      requiredPrfHz,
      pulsePrfHz,
      rawUsablePrfHz,
      scheduleAdaptationFactor,
      effectivePrfHz,
      sampledHalfBandHz,
      aliasAtEffectivePrfHz,
      prfMargin,
      aliasMargin,
      cpiDistanceM,
      pulseUs: timing.pulseUs,
      guardUs: timing.guardUs,
      receiverDeadTimeUs: timing.receiverDeadTimeUs,
      twoWayTravelUs: timing.twoWayTravelUs,
      totalListenUs: timing.totalListenUs,
      surfaceClutterDb,
      clutterToTargetDb,
      riskState: prfRiskState(prfMargin)
    };
  }

  function breakdownSpeedWhereMarginOne(p) {
    const atOneKmS = computeBreakdownPoint(1, p);
    if (atOneKmS.requiredPrfHz <= 1e-6) return Infinity;
    return atOneKmS.effectivePrfHz / atOneKmS.requiredPrfHz;
  }

  function zeroFoldDepths(zKm, effectivePrf, maxDepthM, p) {
    const vMps = Math.max(p.speed * 1000, 1);
    const lambda = Math.max(p.wavelengthM, 0.01);
    const maxOffsetKm = offNadirForDepth(zKm, maxDepthM, p);
    const maxDoppler = surfaceDoppler(maxOffsetKm, zKm, p);
    const maxOrder = Math.floor(maxDoppler / Math.max(effectivePrf, 1));
    const folds = [];
    for (let order = 1; order <= maxOrder; order += 1) {
      const sinTheta = order * effectivePrf * lambda / (2 * vMps);
      if (sinTheta <= 0 || sinTheta >= 0.995) continue;
      const rangeKm = zKm / Math.sqrt(1 - sinTheta ** 2);
      const depthM = (rangeKm - zKm) * 1000 / p.iceIndex;
      if (depthM >= 0 && depthM <= maxDepthM * 1.05) {
        folds.push({ order, depthM });
      }
    }
    return folds;
  }

  function chart(id, title, yLabel, series, note, kind = 'line', options = {}) {
    return {
      id,
      section: 'PRF Doppler folding',
      sourceSheet: 'ClutterFold JS model',
      title,
      note,
      xLabel: options.xLabel || 'Along-track position (km)',
      yLabel,
      kind,
      formulaNote: options.formulaNote || '',
      series
    };
  }

  function computeRows(p) {
    const rows = [];
    const pulseDepthWindowM = Math.max(150, c * Math.max(p.pulseLengthUs, 0) * 1e-6 / (2 * Math.max(p.iceIndex, 0.1)));
    for (let i = 0; i < rowCount; i += 1) {
      const t = rowCount === 1 ? 0.5 : i / (rowCount - 1);
      const x = p.xMin + t * (p.xMax - p.xMin);
      const z = altitudeAt(x, p);
      const timing = timingBudget(z, p.targetDepthM, p);
      const pulsePrf = timing.prfHz;
      const effectivePrf = Math.max(1, Math.min(usablePrfLimit(p), pulsePrf));
      const delayGeometry = targetDelayClutterGeometry(z, p.targetDepthM, p);
      const maxOffsetKm = delayGeometry.offsetKm;
      const delayClutterAngleDeg = delayGeometry.angleDeg;
      const targetDelayDoppler = dopplerFromAngle(p.speed, p.wavelengthM, delayClutterAngleDeg);
      const safetyFactor = safeNumber(p.safetyFactor, defaults.safetyFactor, 1, 4);
      const maxSurfaceDopplerHz = targetDelayDoppler.maxDopplerShiftHz;
      const aliasThresholdPrfHz = 2 * maxSurfaceDopplerHz;
      const requiredNyquistPrfHz = aliasThresholdPrfHz * safetyFactor;
      const sampledHalfBandHz = effectivePrf / 2;
      const firstZeroFoldPrfHz = maxSurfaceDopplerHz;
      const aliasAtEffectivePrfHz = aliasFrequency(maxSurfaceDopplerHz, effectivePrf);
      const folds = zeroFoldDepths(z, effectivePrf, p.targetDepthM, p);
      let nearest = null;
      folds.forEach((fold) => {
        const gap = Math.abs(fold.depthM - p.targetDepthM);
        if (!nearest || gap < nearest.depthGapM) {
          nearest = { ...fold, depthGapM: gap };
        }
      });
      const overlapScore = nearest ? clamp(1 - nearest.depthGapM / pulseDepthWindowM, 0, 1) : 0;
      const aliasDeficit = Math.max(requiredNyquistPrfHz / effectivePrf - 1, 0);
      const deficitScore = clamp(aliasDeficit / 3, 0, 1);
      const surfaceClutterDb = effectiveSurfaceScatteringDb(p);
      const scatterScore = clamp((surfaceClutterDb + 35) / 45, 0.04, 1);
      const riskScore = nearest ? 100 * overlapScore * (0.35 + 0.65 * deficitScore) * scatterScore : 0;
      const foldedClutterDb = nearest ? surfaceClutterDb + db(Math.max(riskScore / 100, 0.001)) : null;
      rows.push({
        x,
        z,
        pulsePrf,
        effectivePrf,
        requiredNyquistPrfHz,
        aliasThresholdPrfHz,
        sampledHalfBandHz,
        maxSurfaceDopplerHz,
        firstZeroFoldPrfHz,
        aliasAtEffectivePrfHz,
        maxOffsetKm,
        delayClutterAngleDeg,
        targetDelayRangeKm: delayGeometry.rangeKm,
        prfMargin: effectivePrf / Math.max(requiredNyquistPrfHz, 1e-6),
        aliasMargin: effectivePrf / Math.max(aliasThresholdPrfHz, 1e-6),
        pulseDepthWindowM,
        twoWayTravelUs: timing.twoWayTravelUs,
        totalListenUs: timing.totalListenUs,
        timingOverheadUs: timing.pulseUs + timing.guardUs + timing.receiverDeadTimeUs,
        foldCount: folds.length,
        nearestFoldOrder: nearest ? nearest.order : null,
        nearestFoldDepthM: nearest ? nearest.depthM : null,
        foldDepthGapM: nearest ? nearest.depthGapM : null,
        riskScore,
        aliasDeficitPercent: clamp((requiredNyquistPrfHz / effectivePrf - 1) * 100, 0, 400),
        surfaceClutterDb,
        foldedClutterDb,
        clutterToTargetDb: foldedClutterDb == null ? null : foldedClutterDb - p.targetSignalDb
      });
    }
    return rows;
  }

  function prfSweep(mid) {
    const prfMin = Math.max(100, Math.min(600, mid.firstZeroFoldPrfHz * 0.45));
    const prfMax = Math.max(4500, mid.requiredNyquistPrfHz * 1.18, mid.effectivePrf * 1.5);
    const rows = [];
    for (let i = 0; i <= 160; i += 1) {
      const prf = prfMin + (prfMax - prfMin) * i / 160;
      rows.push({
        prf,
        sampledHalfBandHz: prf / 2,
        flatDopplerEdgeHz: mid.maxSurfaceDopplerHz,
        aliasAtPrfHz: aliasFrequency(mid.maxSurfaceDopplerHz, prf),
        zeroHz: 0
      });
    }
    const yMax = Math.max(prfMax / 2, mid.maxSurfaceDopplerHz * 1.28);
    return { rows, yMax };
  }

  function prfPts(rows, key, digits = 6) {
    return rows.map((row) => [round(row.prf, 3), row[key] == null ? null : round(row[key], digits)]);
  }

  function traceRemovalRows(mid, p) {
    const dopplerEdgeHz = Math.max(Math.abs(mid.maxSurfaceDopplerHz || 0), 0);
    const activeDoppler = dopplerEdgeHz > 1e-6;
    const cpiSec = Math.max(safeNumber(p.cpiMs, defaults.cpiMs, 1, 2000), 1) / 1000;
    const zeroBinWidthHz = Math.max(1 / cpiSec, 1e-6);
    const basePrfHz = Math.max(4 * dopplerEdgeHz, 1);
    return [
      { label: 'All traces', keepEvery: 1 },
      { label: 'Every 2nd trace', keepEvery: 2 },
      { label: 'Every 4th trace', keepEvery: 4 }
    ].map((item) => {
      const prfHz = basePrfHz / item.keepEvery;
      const aliasPlusHz = activeDoppler ? aliasFrequency(dopplerEdgeHz, prfHz) : 0;
      const aliasMinusHz = activeDoppler ? aliasFrequency(-dopplerEdgeHz, prfHz) : 0;
      const closestZeroHz = Math.min(Math.abs(aliasPlusHz), Math.abs(aliasMinusHz));
      const zeroOverlapScore = activeDoppler ? 100 * Math.exp(-0.5 * (closestZeroHz / zeroBinWidthHz) ** 2) : 0;
      return {
        ...item,
        prfHz,
        sampledHalfBandHz: prfHz / 2,
        aliasPlusHz,
        aliasMinusHz,
        closestZeroHz,
        zeroOverlapScore,
        zeroHz: 0,
        zeroBinWidthHz
      };
    });
  }

  function tracePts(rows, key, digits = 6) {
    return rows.map((row) => [row.label, row[key] == null ? null : round(row[key], digits)]);
  }

  function surfaceDopplerForDepth(altitudeKm, depthKm, p) {
    const iceIndex = Math.max(safeNumber(p.iceIndex, defaults.iceIndex, 0.1, 5), 0.1);
    const rangeKm = altitudeKm + iceIndex * Math.max(depthKm, 0);
    const offsetKm = Math.sqrt(Math.max(rangeKm ** 2 - altitudeKm ** 2, 0));
    const sinTheta = rangeKm > 0 ? offsetKm / rangeKm : 0;
    const speedMps = Math.max(safeNumber(p.speed, defaults.speed, 0, 40), 0) * 1000;
    const wavelengthM = Math.max(safeNumber(p.wavelengthM, defaults.wavelengthM, 0.01, 100), 0.01);
    return 2 * speedMps * sinTheta / wavelengthM;
  }

  function buildPointTargetVisual(p, currentBreakdown) {
    const altitudeKm = safeNumber(p.z0, defaults.z0, 1, 3000);
    const targetDepthKm = safeNumber(p.targetDepthM, defaults.targetDepthM, 1, 50000) / 1000;
    const iceIndex = Math.max(safeNumber(p.iceIndex, defaults.iceIndex, 0.1, 5), 0.1);
    const speedKmS = safeNumber(p.speed, defaults.speed, 0, 40);
    const wavelengthM = Math.max(safeNumber(p.wavelengthM, defaults.wavelengthM, 0.01, 100), 0.01);
    const maxDepthKm = Math.max(10, targetDepthKm * 1.65);
    const currentPrfHz = Math.max(currentBreakdown.effectivePrfHz, 1);
    const zeroPrfHz = Math.max(currentBreakdown.firstZeroFoldPrfHz, 1);
    const highPrfHz = Math.max(4000, currentBreakdown.flatAliasThresholdPrfHz * 1.35);
    const zeroBinWidthHz = Math.max(8, zeroPrfHz / 160);
    const depths = [];

    for (let i = 0; i <= 240; i += 1) {
      depths.push(maxDepthKm * i / 240);
    }
    depths.push(targetDepthKm);
    depths.sort((a, b) => a - b);

    let lastDepth = null;
    const uniqueDepths = depths.filter((depth) => {
      if (lastDepth !== null && Math.abs(depth - lastDepth) < 1e-6) return false;
      lastDepth = depth;
      return true;
    });

    const rows = uniqueDepths.map((depthKm) => {
      const positiveDopplerHz = surfaceDopplerForDepth(altitudeKm, depthKm, p);
      const zeroAliasHz = aliasFrequency(positiveDopplerHz, zeroPrfHz);
      const zeroOverlapPower = Math.exp(-0.5 * (Math.abs(zeroAliasHz) / zeroBinWidthHz) ** 2);
      return {
        depthKm: round(depthKm, 4),
        positiveDopplerHz: round(positiveDopplerHz, 4),
        negativeDopplerHz: round(-positiveDopplerHz, 4),
        highAliasPositiveHz: round(aliasFrequency(positiveDopplerHz, highPrfHz), 4),
        highAliasNegativeHz: round(aliasFrequency(-positiveDopplerHz, highPrfHz), 4),
        currentAliasPositiveHz: round(aliasFrequency(positiveDopplerHz, currentPrfHz), 4),
        currentAliasNegativeHz: round(aliasFrequency(-positiveDopplerHz, currentPrfHz), 4),
        zeroAliasPositiveHz: round(zeroAliasHz, 4),
        zeroAliasNegativeHz: round(aliasFrequency(-positiveDopplerHz, zeroPrfHz), 4),
        zeroOverlapPower: round(zeroOverlapPower, 6)
      };
    });

    const maxPower = Math.max(...rows.map((row) => row.zeroOverlapPower), 1e-6);
    rows.forEach((row) => {
      row.zeroOverlapPower = round(row.zeroOverlapPower / maxPower, 6);
    });

    return {
      altitudeKm: round(altitudeKm, 4),
      targetDepthKm: round(targetDepthKm, 4),
      iceIndex: round(iceIndex, 4),
      speedKmS: round(speedKmS, 4),
      wavelengthM: round(wavelengthM, 4),
      maxDepthKm: round(maxDepthKm, 4),
      highPrfHz: round(highPrfHz, 4),
      currentPrfHz: round(currentPrfHz, 4),
      zeroPrfHz: round(zeroPrfHz, 4),
      aliasStartPrfHz: round(currentBreakdown.flatAliasThresholdPrfHz, 4),
      sameDelayDopplerHz: round(currentBreakdown.maxDopplerShiftHz, 4),
      currentSameDelayAliasHz: round(currentBreakdown.aliasAtEffectivePrfHz, 4),
      surfaceOffsetKm: round(currentBreakdown.targetDelayOffsetKm, 4),
      lookAngleDeg: round(currentBreakdown.delayClutterAngleDeg, 4),
      zeroBinWidthHz: round(zeroBinWidthHz, 4),
      rows
    };
  }

  function verticalPrfLine(prfHz, yMax) {
    return [[round(prfHz, 3), 0], [round(prfHz, 3), round(yMax, 3)]];
  }

  function verticalPrfSpan(prfHz, yMin, yMax) {
    return [[round(prfHz, 3), round(yMin, 3)], [round(prfHz, 3), round(yMax, 3)]];
  }

  function buildCharts(rows, p) {
    const mid = rows[Math.floor(rows.length / 2)];
    const sweep = prfSweep(mid);
    const aliasAbsMax = Math.max(
      mid.maxSurfaceDopplerHz,
      ...sweep.rows.map((row) => Math.abs(row.aliasAtPrfHz || 0))
    ) * 1.08;
    const traceRows = traceRemovalRows(mid, p);
    return [
      chart('folding-flat-prf-threshold', 'Flat PRF Alias Threshold Sweep', 'Doppler frequency (Hz)', [
        { name: 'PRF/2 sampled half-band', points: prfPts(sweep.rows, 'sampledHalfBandHz', 3) },
        { name: 'Flat same-delay Doppler edge', points: prfPts(sweep.rows, 'flatDopplerEdgeHz', 3) },
        { name: 'Current effective PRF', role: 'reference', points: verticalPrfLine(mid.effectivePrf, sweep.yMax) },
        { name: 'Flat alias threshold PRF', role: 'reference', points: verticalPrfLine(mid.aliasThresholdPrfHz, sweep.yMax) },
        { name: 'Safety-factor PRF target', role: 'reference', points: verticalPrfLine(mid.requiredNyquistPrfHz, sweep.yMax) }
      ], 'Mid-pass flat-surface sweep: aliasing begins where PRF/2 drops below the same-delay surface Doppler edge.', 'line', {
        xLabel: 'PRF (Hz)',
        formulaNote: 'Flat case: R = altitude + n x targetDepth, offset = sqrt(R^2 - altitude^2), fD = 2 x speed x sin(theta) / wavelength, and aliasing starts when PRF < 2 x |fD|.'
      }),
      chart('folding-flat-alias-landing', 'Flat Alias Landing vs PRF', 'Aliased Doppler (Hz)', [
        { name: 'Aliased +Doppler edge', points: prfPts(sweep.rows, 'aliasAtPrfHz', 3) },
        { name: 'Zero Doppler reference', points: prfPts(sweep.rows, 'zeroHz', 3) },
        { name: 'Current effective PRF', role: 'reference', points: verticalPrfSpan(mid.effectivePrf, -aliasAbsMax, aliasAbsMax) },
        { name: 'First zero-Doppler fold PRF', role: 'reference', points: verticalPrfSpan(mid.firstZeroFoldPrfHz, -aliasAbsMax, aliasAbsMax) }
      ], 'Shows where the flat-surface Doppler edge appears after PRF aliasing. Exact nadir-bin overlap happens near the first zero-Doppler fold PRF.', 'line', {
        xLabel: 'PRF (Hz)',
        formulaNote: 'Aliased Doppler is wrapped into [-PRF/2, +PRF/2] with ((fD + PRF/2) mod PRF) - PRF/2.'
      }),
      chart('folding-trace-removal-alias-landing', 'Trace Removal Alias Landing', 'Aliased Doppler (Hz)', [
        { name: 'Aliased +Doppler edge', points: tracePts(traceRows, 'aliasPlusHz', 3) },
        { name: 'Aliased -Doppler edge', points: tracePts(traceRows, 'aliasMinusHz', 3) },
        { name: 'Zero Doppler reference', role: 'reference', points: tracePts(traceRows, 'zeroHz', 3) }
      ], 'The original trace stream stays at PRF = 4 x |fD|. Post-processing keeps every Nth reading, so only the effective along-track sampling PRF falls to original PRF / N.', 'line', {
        xLabel: 'Trace selection',
        formulaNote: 'For this live trace-removal check: PRF_all = 4 x |fD|, PRF_keepN = PRF_all / N, and f_alias = ((+/-fD + PRF_keepN/2) mod PRF_keepN) - PRF_keepN/2.'
      }),
      chart('folding-trace-removal-false-layer-score', 'Trace Removal False-Layer Score', 'Zero-Doppler overlap (%)', [
        { name: 'Surface clutter in zero-Doppler bin', points: tracePts(traceRows, 'zeroOverlapScore', 3) }
      ], 'A high score means the same-delay flat-surface clutter aliases into the zero-Doppler bin where a nadir subsurface target would be read.', 'bar', {
        xLabel: 'Trace selection',
        formulaNote: 'Score = exp(-0.5 x (closestZeroHz / deltaF)^2) x 100, where closestZeroHz = min(|alias(+fD)|, |alias(-fD)|) and deltaF = 1 / CPI_seconds.'
      })
    ];
  }

  function reasonBands() {
    return [
      { id: 'hf', name: 'HF', frequencyMhz: 9, wavelengthM: c / (9 * 1000000) },
      { id: 'vhf', name: 'VHF', frequencyMhz: 60, wavelengthM: c / (60 * 1000000) }
    ];
  }

  function prfWindowAtDepth(p, band, depthM) {
    const altitudeKm = safeNumber(p.z0, defaults.z0, 1, 3000);
    const targetDepthM = safeNumber(depthM, defaults.targetDepthM, 0, 50000);
    const safetyFactor = safeNumber(p.safetyFactor, defaults.safetyFactor, 1, 4);
    const speedMps = safeNumber(p.speed, defaults.speed, 0, 40) * 1000;
    const timing = timingBudget(altitudeKm, targetDepthM, p);
    const geometry = targetDelayClutterGeometry(altitudeKm, targetDepthM, p);
    const sinTheta = Math.sin(degToRad(geometry.angleDeg));
    const dopplerEdgeHz = 2 * speedMps * sinTheta / Math.max(band.wavelengthM, 0.01);
    const minPrfHz = 2 * dopplerEdgeHz * safetyFactor;
    const maxPrfHz = Math.min(usablePrfLimit(p), timing.prfHz);
    return {
      altitudeKm: round(altitudeKm, 4),
      depthM: round(targetDepthM, 4),
      lookAngleDeg: round(geometry.angleDeg, 4),
      dopplerEdgeHz: round(dopplerEdgeHz, 4),
      minPrfHz: round(minPrfHz, 4),
      maxPrfHz: round(maxPrfHz, 4),
      twoWayUs: round(timing.twoWayTravelUs, 4),
      listenWindowUs: round(timing.totalListenUs, 4),
      usable: minPrfHz <= maxPrfHz
    };
  }

  function prfWindowForDepthSweep(p, band, maxDepthM = 30000) {
    const stepM = 250;
    const rows = [];
    for (let depthM = 0; depthM <= maxDepthM; depthM += stepM) {
      rows.push(prfWindowAtDepth(p, band, depthM));
    }
    if (rows[rows.length - 1].depthM !== maxDepthM) rows.push(prfWindowAtDepth(p, band, maxDepthM));
    const hardest = rows.reduce((best, row) => row.minPrfHz > best.minPrfHz ? row : best, rows[0]);
    const tightest = rows.reduce((best, row) => row.maxPrfHz < best.maxPrfHz ? row : best, rows[0]);
    const deepestUsable = rows
      .filter((row) => row.usable)
      .reduce((best, row) => Math.max(best, row.depthM), null);
    return {
      ...hardest,
      depthM: round(maxDepthM, 4),
      minPrfHz: hardest.minPrfHz,
      maxPrfHz: tightest.maxPrfHz,
      hardestDepthM: hardest.depthM,
      tightestDepthM: tightest.depthM,
      deepestUsableDepthM: deepestUsable,
      usable: hardest.minPrfHz <= tightest.maxPrfHz
    };
  }

  function traceRemovalRowsForWindow(item, maxKeepEvery = 16) {
    const rows = [];
    const basePrfHz = Math.max(item.maxPrfHz, 1);
    const minPrfHz = Math.max(item.minPrfHz, 0);
    for (let keepEvery = 1; keepEvery <= maxKeepEvery; keepEvery += 1) {
      const effectivePrfHz = basePrfHz / keepEvery;
      const usable = item.usable && effectivePrfHz >= minPrfHz;
      rows.push({
        keepEvery,
        keepLabel: keepEvery === 1 ? 'all' : `${keepEvery}`,
        removedPercent: round(100 * (1 - 1 / keepEvery), 4),
        effectivePrfHz: round(effectivePrfHz, 4),
        minPrfHz: round(minPrfHz, 4),
        margin: minPrfHz > 0 ? round(effectivePrfHz / minPrfHz, 6) : Infinity,
        usable
      });
      if (!usable) break;
    }
    return rows;
  }

  function buildTraceRemovalUsability(p) {
    const maxSweepDepthM = 30000;
    const bands = reasonBands();
    const cases = [
      {
        id: 'target-depth',
        title: 'Selected target depth',
        depthLabel: `${round(p.targetDepthM / 1000, 2)} km`,
        windowForBand: (band) => prfWindowAtDepth(p, band, p.targetDepthM)
      },
      {
        id: 'full-depth',
        title: 'Full 0-30 km depth sweep',
        depthLabel: '0-30 km',
        windowForBand: (band) => prfWindowForDepthSweep(p, band, maxSweepDepthM)
      }
    ].map((caseSpec) => {
      const bandRows = bands.map((band) => {
        const prfWindow = caseSpec.windowForBand(band);
        const traceRows = traceRemovalRowsForWindow(prfWindow);
        const usableRows = traceRows.filter((row) => row.usable);
        const firstUnusable = traceRows.find((row) => !row.usable) || null;
        const lastUsable = usableRows[usableRows.length - 1] || null;
        return {
          band,
          ...prfWindow,
          optimalPrfHz: prfWindow.usable ? prfWindow.maxPrfHz : null,
          lastUsableKeepEvery: lastUsable ? lastUsable.keepEvery : null,
          maxRemovedPercent: lastUsable ? lastUsable.removedPercent : 0,
          firstUnusableKeepEvery: firstUnusable ? firstUnusable.keepEvery : null,
          firstUnusablePrfHz: firstUnusable ? firstUnusable.effectivePrfHz : null,
          traceRows
        };
      });
      return {
        id: caseSpec.id,
        title: caseSpec.title,
        depthLabel: caseSpec.depthLabel,
        bandRows
      };
    });

    return {
      altitudeKm: round(safeNumber(p.z0, defaults.z0, 1, 3000), 4),
      speedKmS: round(safeNumber(p.speed, defaults.speed, 0, 40), 4),
      iceIndex: round(safeNumber(p.iceIndex, defaults.iceIndex, 0.1, 5), 4),
      pulseUs: round(safeNumber(p.pulseLengthUs, defaults.pulseLengthUs, 0, 10000), 4),
      guardDeadUs: round(
        safeNumber(p.listenGuardUs, defaults.listenGuardUs, 0, 1000) +
        safeNumber(p.receiverDeadTimeUs, defaults.receiverDeadTimeUs, 0, 1000),
        4
      ),
      safetyFactor: round(safeNumber(p.safetyFactor, defaults.safetyFactor, 1, 4), 4),
      cases
    };
  }

  function traceDecimationStatus(effectivePrfHz, minSafePrfHz, rawAliasThresholdHz) {
    if (effectivePrfHz >= minSafePrfHz) return 'clean';
    if (effectivePrfHz >= rawAliasThresholdHz) return 'margin gone';
    return 'folding blur';
  }

  function traceKeepName(keepEvery) {
    return keepEvery === 1 ? 'keep all' : `keep every ${keepEvery}${keepEvery === 2 ? 'nd' : keepEvery === 3 ? 'rd' : 'th'}`;
  }

  function buildTraceDecimationBlurRecreation(p) {
    const bands = reasonBands();
    const hf = bands.find((band) => band.id === 'hf');
    const vhf = bands.find((band) => band.id === 'vhf');
    const selectedDepthM = safeNumber(p.targetDepthM, defaults.targetDepthM, 1000, 30000);
    const maxSweepDepthM = 30000;
    const cases = [
      {
        id: 'hf-selected-target',
        title: 'HF selected target',
        band: hf,
        depthLabel: `${round(selectedDepthM / 1000, 2)} km`,
        keepEveryValues: [1, 2, 3, 4, 5, 6],
        window: prfWindowAtDepth(p, hf, selectedDepthM)
      },
      {
        id: 'hf-full-depth',
        title: 'HF full-depth sweep',
        band: hf,
        depthLabel: '0-30 km',
        keepEveryValues: [1, 2, 3, 4],
        window: prfWindowForDepthSweep(p, hf, maxSweepDepthM)
      },
      {
        id: 'vhf-shallow-edge',
        title: 'VHF shallow edge',
        band: vhf,
        depthLabel: '2.25 km',
        keepEveryValues: [1, 2, 3, 4],
        window: prfWindowAtDepth(p, vhf, 2250)
      },
      {
        id: 'vhf-selected-target',
        title: 'VHF selected target',
        band: vhf,
        depthLabel: `${round(selectedDepthM / 1000, 2)} km`,
        keepEveryValues: [1, 2, 3, 4],
        window: prfWindowAtDepth(p, vhf, selectedDepthM)
      }
    ];

    return {
      altitudeKm: round(safeNumber(p.z0, defaults.z0, 1, 3000), 4),
      speedKmS: round(safeNumber(p.speed, defaults.speed, 0, 40), 4),
      iceIndex: round(safeNumber(p.iceIndex, defaults.iceIndex, 0.1, 5), 4),
      pulseUs: round(safeNumber(p.pulseLengthUs, defaults.pulseLengthUs, 0, 10000), 4),
      guardDeadUs: round(
        safeNumber(p.listenGuardUs, defaults.listenGuardUs, 0, 1000) +
        safeNumber(p.receiverDeadTimeUs, defaults.receiverDeadTimeUs, 0, 1000),
        4
      ),
      safetyFactor: round(safeNumber(p.safetyFactor, defaults.safetyFactor, 1, 4), 4),
      cases: cases.map((caseSpec) => {
        const prfWindow = caseSpec.window;
        const rawAliasThresholdHz = prfWindow.minPrfHz / Math.max(safeNumber(p.safetyFactor, defaults.safetyFactor, 1, 4), 1);
        const rows = caseSpec.keepEveryValues.map((keepEvery) => {
          const effectivePrfHz = prfWindow.maxPrfHz / keepEvery;
          const status = traceDecimationStatus(effectivePrfHz, prfWindow.minPrfHz, rawAliasThresholdHz);
          const aliasLandingHz = aliasFrequency(prfWindow.dopplerEdgeHz, effectivePrfHz);
          return {
            keepEvery,
            keepLabel: keepEvery === 1 ? 'all' : `${keepEvery}x`,
            keepName: traceKeepName(keepEvery),
            removedPercent: round(100 * (1 - 1 / keepEvery), 4),
            effectivePrfHz: round(effectivePrfHz, 4),
            alongTrackSpacingM: round(safeNumber(p.speed, defaults.speed, 0, 40) * 1000 / Math.max(effectivePrfHz, 1), 4),
            aliasLandingHz: round(aliasLandingHz, 4),
            zeroFoldGapHz: round(Math.abs(aliasLandingHz), 4),
            status
          };
        });
        const lastClean = rows.filter((row) => row.status === 'clean').pop() || null;
        const firstMarginGone = rows.find((row) => row.status === 'margin gone') || null;
        const firstBlur = rows.find((row) => row.status === 'folding blur') || null;
        let takeaway = 'All shown trace selections remain clean.';
        if (firstBlur && firstBlur.keepEvery === 1) {
          takeaway = 'Already folding with all traces under this timing window.';
        } else if (firstBlur) {
          takeaway = `Folding blur starts at ${firstBlur.keepName}.`;
        } else if (firstMarginGone) {
          takeaway = `Safety margin first disappears at ${firstMarginGone.keepName}.`;
        }
        return {
          id: caseSpec.id,
          title: caseSpec.title,
          band: caseSpec.band,
          depthLabel: caseSpec.depthLabel,
          basePrfHz: round(prfWindow.maxPrfHz, 4),
          minSafePrfHz: round(prfWindow.minPrfHz, 4),
          rawAliasThresholdHz: round(rawAliasThresholdHz, 4),
          dopplerEdgeHz: round(prfWindow.dopplerEdgeHz, 4),
          windowUsableBeforeRemoval: prfWindow.usable,
          lastCleanKeepEvery: lastClean ? lastClean.keepEvery : null,
          firstMarginGoneKeepEvery: firstMarginGone ? firstMarginGone.keepEvery : null,
          firstBlurKeepEvery: firstBlur ? firstBlur.keepEvery : null,
          takeaway,
          rows
        };
      })
    };
  }

  function riskLabel(value) {
    if (value >= 60) return 'High';
    if (value >= 25) return 'Moderate';
    if (value > 0) return 'Low';
    return 'None in this simplified view';
  }

  function compute(params) {
    const p = { ...defaults, ...params };
    p.maxUsablePrfHz = usablePrfLimit(p);
    p.prfCapHz = p.maxUsablePrfHz;
    const rows = computeRows(p);
    const worst = rows.reduce((best, row) => row.riskScore > best.riskScore ? row : best, rows[0]);
    const closest = rows
      .filter((row) => Number.isFinite(row.foldDepthGapM))
      .reduce((best, row) => !best || row.foldDepthGapM < best.foldDepthGapM ? row : best, null);
    const mid = rows[Math.floor(rows.length / 2)];
    const riskRows = rows.filter((row) => row.riskScore >= 25);
    const effectiveMin = Math.min(...rows.map((row) => row.effectivePrf));
    const requiredMax = Math.max(...rows.map((row) => row.requiredNyquistPrfHz));
    const pulsePrfMin = Math.min(...rows.map((row) => row.pulsePrf));
    const targetGap = closest && Number.isFinite(closest.foldDepthGapM) ? closest.foldDepthGapM : null;
    const targetOverlapPct = 100 * riskRows.length / rows.length;
    const depthText = closest && Number.isFinite(closest.nearestFoldDepthM)
      ? `${round(closest.nearestFoldDepthM, 1)} m apparent depth, ${round(closest.foldDepthGapM, 1)} m from the target window`
      : 'No zero-Doppler fold inside the current receive window';
    const currentBreakdown = computeBreakdownPoint(p.speed, p);
    const breakdownSpeedKmS = breakdownSpeedWhereMarginOne(p);
    const displayedCharts = buildCharts(rows, p);
    const scheduleText = currentBreakdown.scheduleAdaptationFactor >= 0.999
      ? 'PRF schedule fits within the current dwell/CPI.'
      : 'PRF schedule interval is longer than the dwell/CPI, so the stress test reduces the usable PRF window.';
    const effectiveSurfaceDb = effectiveSurfaceScatteringDb(p);
    const timingOverheadUs = mid.timingOverheadUs;

    return {
      source: { workbook: 'ClutterFold browser model', generatedFrom: 'simple PRF-Doppler folding formulas' },
      summary: [
        { label: 'Worst zero-fold overlap risk', value: worst.riskScore, unit: '%', meaning: `${riskLabel(worst.riskScore)} nadir-bin overlap proxy for the current knobs.` },
        { label: 'Depth of strongest fold', value: worst.nearestFoldDepthM, unit: 'm', meaning: 'Apparent depth where folded surface clutter is strongest in this simplified pass.' },
        { label: 'Target depth', value: p.targetDepthM, unit: 'm', meaning: 'Depth of the single nadir subsurface target.' },
        { label: 'Closest fold-target gap', value: targetGap, unit: 'm', meaning: 'Small values mean folded surface clutter lands near the target depth.' },
        { label: 'Safety PRF peak', value: requiredMax, unit: 'Hz', meaning: 'Flat same-delay surface Doppler requirement, including the safety factor.' },
        { label: 'Pulse-limited PRF floor', value: pulsePrfMin, unit: 'Hz', meaning: 'Fastest PRF allowed by pulse length plus two-way listening time.' },
        { label: 'Effective PRF minimum', value: effectiveMin, unit: 'Hz', meaning: 'The smaller of max usable PRF and pulse/listen-time PRF.' },
        { label: 'Affected flyby samples', value: targetOverlapPct, unit: '%', meaning: 'Share of along-track samples with moderate or high folded-clutter risk.' }
      ],
      answers: [
        { question: 'How bad is it?', answer: `${riskLabel(worst.riskScore)} for exact zero-Doppler overlap in this run; the peak overlap proxy is ${round(worst.riskScore, 1)}%.` },
        { question: 'What depth does it occur at?', answer: depthText },
        { question: 'How does pulse length affect it?', answer: `The ${round(p.pulseLengthUs, 1)} us pulse helps set a ${round(mid.pulsePrf, 1)} Hz mid-pass PRF ceiling; longer pulses lower that ceiling and widen the depth window.` },
        { question: 'How does surface brightness affect it?', answer: `It does not change the Doppler Nyquist requirement directly. It raises severity: base surface scattering ${round(p.surfaceScatteringDb, 1)} dB plus dirty-ice boost ${round(p.dirtyIceClutterBoostDb, 1)} dB gives ${round(effectiveSurfaceDb, 1)} dB before folding.` },
        { question: 'Under which conditions?', answer: `Closest altitude ${round(p.z0, 1)} km, speed ${round(p.speed, 2)} km/s, target depth ${round(p.targetDepthM, 0)} m, wavelength ${round(p.wavelengthM, 2)} m. The Doppler angle is the flat same-delay surface angle.` },
        { question: 'Will adding this data improve the prediction?', answer: `Yes for trend accuracy: the model now separates geometry/timing inputs that decide whether aliasing happens from scattering inputs that decide how visible the folded clutter becomes.` },
        { question: 'Can we get around it?', answer: 'This page sets up the effect. Next tests would compare staggered PRFs, shallower receive windows, masking predicted fold depths, or multi-channel angle filtering.' }
      ],
      conditions: [
        { label: 'Mid-pass altitude', value: mid.z, unit: 'km' },
        { label: 'Mid-pass effective PRF', value: mid.effectivePrf, unit: 'Hz' },
        { label: 'Mid-pass Nyquist PRF needed', value: mid.requiredNyquistPrfHz, unit: 'Hz' },
        { label: 'Mid-pass two-way travel time', value: mid.twoWayTravelUs, unit: 'us' },
        { label: 'Pulse + guard + dead time', value: timingOverheadUs, unit: 'us' },
        { label: 'Total listen window', value: mid.totalListenUs, unit: 'us' },
        { label: 'Mid-pass sampled half-band', value: mid.sampledHalfBandHz, unit: 'Hz' },
        { label: 'Mid-pass flat same-delay angle', value: mid.delayClutterAngleDeg, unit: 'deg' },
        { label: 'Mid-pass flat Doppler edge', value: mid.maxSurfaceDopplerHz, unit: 'Hz' },
        { label: 'Mid-pass flat alias threshold', value: mid.aliasThresholdPrfHz, unit: 'Hz' },
        { label: 'Mid-pass alias landing', value: mid.aliasAtEffectivePrfHz, unit: 'Hz' },
        { label: 'Surface offset at target delay', value: mid.maxOffsetKm, unit: 'km' },
        { label: 'Pulse depth window', value: mid.pulseDepthWindowM, unit: 'm' },
        { label: 'Effective surface clutter', value: effectiveSurfaceDb, unit: 'dB' },
        { label: 'Nearest fold order', value: mid.nearestFoldOrder || '', unit: 'k' },
        { label: 'Folded clutter-to-target proxy', value: mid.clutterToTargetDb, unit: 'dB' }
      ],
      accuracyDrivers: [
        { input: 'Flyby trajectory', added: 'altitude, speed, target depth, flat same-delay clutter angle', effect: 'Sets LOS velocity and the surface Doppler bandwidth for clutter that can land at the same delay as the target.' },
        { input: 'Radar timing', added: 'pulse length, listen guard, receiver dead time, target-depth travel time', effect: 'Sets the pulse/listen PRF ceiling before any max usable PRF cap.' },
        { input: 'Sampling schedule', added: 'max usable PRF, PRF update interval, CPI/dwell time, safety factor', effect: 'Turns ideal PRF into the effective usable PRF margin.' },
        { input: 'Surface strength', added: 'surface scattering plus dirty-ice clutter boost', effect: 'Does not cause aliasing by itself; increases how visible folded clutter becomes.' },
        { input: 'False-layer severity', added: 'target depth, target signal, folded clutter-to-target dB', effect: 'Shows whether folded surface clutter could compete with the nadir subsurface target.' }
      ],
      breakdown: {
        summary: [
          { label: 'Risk state', value: currentBreakdown.riskState, unit: '', meaning: 'SAFE above 1.25, WARNING from 1.00-1.25, and aliasing/folding risk below 1.00.' },
          { label: 'Flat PRF margin', value: currentBreakdown.prfMargin, unit: 'x', meaning: 'Effective usable PRF divided by the safety-factor PRF target.' },
          { label: 'Flat alias margin', value: currentBreakdown.aliasMargin, unit: 'x', meaning: 'Effective usable PRF divided by the flat alias threshold without safety padding.' },
          { label: 'Flat alias threshold', value: currentBreakdown.flatAliasThresholdPrfHz, unit: 'Hz', meaning: '2 x flat same-delay Doppler edge; aliasing starts below this PRF.' },
          { label: 'Safety PRF target', value: currentBreakdown.requiredPrfHz, unit: 'Hz', meaning: 'Flat alias threshold multiplied by the selected safety factor.' },
          { label: 'Effective usable PRF', value: currentBreakdown.effectivePrfHz, unit: 'Hz', meaning: 'Usable cap after pulse/listen timing and CPI schedule guard.' },
          { label: 'Breakdown speed', value: displayBreakdownSpeed(breakdownSpeedKmS), unit: Number.isFinite(breakdownSpeedKmS) ? 'km/s' : '', meaning: 'Speed where target-delay margin crosses below 1.0 for the current altitude and target depth.' },
          { label: 'Flat same-delay angle', value: currentBreakdown.delayClutterAngleDeg, unit: 'deg', meaning: 'Off-nadir angle of flat surface clutter with the same delay as the selected target depth.' },
          { label: 'Max Doppler shift', value: currentBreakdown.maxDopplerShiftHz, unit: 'Hz', meaning: 'Monostatic Doppler edge from target-delay clutter LOS velocity.' },
          { label: 'Sampled half-band', value: currentBreakdown.sampledHalfBandHz, unit: 'Hz', meaning: 'Effective usable PRF divided by 2.' },
          { label: 'Current alias landing', value: currentBreakdown.aliasAtEffectivePrfHz, unit: 'Hz', meaning: 'Where the positive flat Doppler edge wraps inside the sampled PRF band.' },
          { label: 'Total listen window', value: currentBreakdown.totalListenUs, unit: 'us', meaning: 'Pulse length plus receive/guard/dead time and two-way travel time.' },
          { label: 'Schedule factor', value: currentBreakdown.scheduleAdaptationFactor, unit: 'x', meaning: scheduleText }
        ],
        outputs: [
          { label: 'Wavelength', value: currentBreakdown.wavelengthM, unit: 'm', meaning: 'Radar wavelength used for the Doppler calculation.' },
          { label: 'Radar center frequency', value: currentBreakdown.centerFrequencyMhz, unit: 'MHz', meaning: 'Derived from c / wavelength.' },
          { label: 'Flat same-delay clutter angle', value: currentBreakdown.delayClutterAngleDeg, unit: 'deg', meaning: 'Off-nadir angle for flat surface clutter arriving at the same delay as the nadir target.' },
          { label: 'Surface offset at target delay', value: currentBreakdown.targetDelayOffsetKm, unit: 'km', meaning: 'Horizontal surface distance from nadir that has the same round-trip delay as the selected subsurface target.' },
          { label: 'Estimated line-of-sight velocity', value: currentBreakdown.losVelocityMps, unit: 'm/s', meaning: 'Flyby speed projected into the target-delay clutter edge angle.' },
          { label: 'Flat Doppler edge', value: currentBreakdown.maxDopplerShiftHz, unit: 'Hz', meaning: 'Monostatic target-delay clutter Doppler edge: 2 x LOS velocity / wavelength.' },
          { label: 'Surface Doppler bandwidth', value: currentBreakdown.surfaceDopplerBandwidthHz, unit: 'Hz', meaning: 'Two-sided simplified clutter bandwidth: 2 x max Doppler shift.' },
          { label: 'Flat alias threshold PRF', value: currentBreakdown.flatAliasThresholdPrfHz, unit: 'Hz', meaning: 'PRF where the sampled half-band equals the flat Doppler edge.' },
          { label: 'First zero-Doppler fold PRF', value: currentBreakdown.firstZeroFoldPrfHz, unit: 'Hz', meaning: 'PRF where the positive flat Doppler edge aliases exactly to zero Doppler.' },
          { label: 'Current alias landing', value: currentBreakdown.aliasAtEffectivePrfHz, unit: 'Hz', meaning: 'Aliased Doppler value at the current effective PRF.' },
          { label: 'Safety-factor PRF target', value: currentBreakdown.requiredPrfHz, unit: 'Hz', meaning: 'Flat alias threshold PRF multiplied by the selected safety factor.' },
          { label: 'Effective/usable PRF', value: currentBreakdown.effectivePrfHz, unit: 'Hz', meaning: 'Minimum of max usable PRF and pulse/listen ceiling, adjusted by the dwell/CPI schedule guard.' },
          { label: 'Safety PRF margin', value: currentBreakdown.prfMargin, unit: 'x', meaning: 'Effective/usable PRF divided by the safety-factor PRF target.' },
          { label: 'Alias threshold margin', value: currentBreakdown.aliasMargin, unit: 'x', meaning: 'Effective/usable PRF divided by the flat alias threshold without safety padding.' },
          { label: 'Breakdown speed', value: displayBreakdownSpeed(breakdownSpeedKmS), unit: Number.isFinite(breakdownSpeedKmS) ? 'km/s' : '', meaning: 'Speed where target-delay margin drops below 1.0 under the current settings.' },
          { label: 'Risk state', value: currentBreakdown.riskState, unit: '', meaning: 'Margin > 1.25 = SAFE; 1.00 to 1.25 = WARNING; < 1.00 = ALIASING/FOLDING RISK.' },
          { label: 'Pulse length', value: currentBreakdown.pulseUs, unit: 'us', meaning: 'Transmit pulse duration included in the timing window.' },
          { label: 'Two-way travel/listen time', value: currentBreakdown.twoWayTravelUs, unit: 'us', meaning: 'Round-trip time through altitude plus the selected target depth.' },
          { label: 'Receiver guard + dead time', value: currentBreakdown.guardUs + currentBreakdown.receiverDeadTimeUs, unit: 'us', meaning: 'Extra simplified timing overhead before the next pulse can be sent.' },
          { label: 'Total listen window', value: currentBreakdown.totalListenUs, unit: 'us', meaning: 'Pulse plus overhead plus round-trip travel time; its inverse is the pulse/listen PRF ceiling.' },
          { label: 'Effective surface clutter', value: currentBreakdown.surfaceClutterDb, unit: 'dB', meaning: 'Surface scattering plus dirty-ice boost; used only for severity, not the PRF Nyquist requirement.' },
          { label: 'Surface clutter minus target', value: currentBreakdown.clutterToTargetDb, unit: 'dB', meaning: 'How bright the surface clutter proxy is relative to the nadir target before folding loss.' },
          { label: 'Distance moved during CPI', value: currentBreakdown.cpiDistanceM, unit: 'm', meaning: 'Flyby distance covered inside the current coherent processing / dwell window.' }
        ],
        charts: []
      },
      livePointTarget: buildPointTargetVisual(p, currentBreakdown),
      traceRemovalUsability: buildTraceRemovalUsability(p),
      traceDecimationBlur: buildTraceDecimationBlurRecreation(p),
      preview: {
        xMin: p.xMin,
        xMax: p.xMax,
        depthMax: Math.max(p.targetDepthM + mid.pulseDepthWindowM * 1.6, ...rows.map((row) => row.nearestFoldDepthM || 0), 1000),
        targetDepthM: p.targetDepthM,
        pulseDepthWindowM: mid.pulseDepthWindowM,
        rows: rows.map((row, index) => ({
          x: row.x,
          targetDepthM: p.targetDepthM,
          foldedDepthM: row.nearestFoldDepthM,
          riskScore: row.riskScore,
          showPoint: index % 3 === 0 || row.riskScore >= 25
        }))
      },
      charts: displayedCharts,
      allCharts: displayedCharts
    };
  }

  window.PRF_FOLDING_MODEL = {
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
  const titleFresnelLooks = 'Fresnel-zone coherent look count';
  const titleFrequencyWashout = 'Windowed chirp response: frequency washout';
  const confidenceTitle = 'HF 9 MHz Mid-Shell Confidence vs Ambiguity';
  const workbookDepthTitle = 'HF 9 MHz Workbook-Depth Outcomes';
  const clutterStressTitle = 'VHF 60 MHz Shallow Clutter Stress Test';
  const materialTitle = 'Reflection Strength by Material / Interface';
  const evidenceTitle = 'Cross-Instrument Evidence Score';
  const chartAliases = new Map([
    ['Surface Height: Generated Topography Reference Floor, Target, and Nadir', 'Surface Height: Off-Nadir Target vs Nadir Reference Terrain']
  ]);

  const liveModel = window.V19_LIVE_MODEL;
  const liveDefaults = liveModel ? liveModel.defaults : {};
  const liveControls = liveModel ? liveModel.controls : [];

  const signalDefaults = {
    iceIndex: 1.78,
    alongTrackSpacingM: 500,
    pulseLengthUs: 20,
    windowLossDb: -1.3444034312785926,
    hfBandwidthMhz: 1,
    vhfBandwidthMhz: 10,
    coherenceApertureM: 2000,
    phaseDecorrelationDeg: 12,
    baseReflectivityDb: 0,
    frequencySlopeDbPerOctave: -2,
    referenceFrequencyMhz: 9,
    dirtyIceLevel: 0.55,
    surfaceClutterLevel: 0.35
  };

  const defaults = {
    ...liveDefaults,
    ...signalDefaults,
    n: signalDefaults.iceIndex
  };

  const geometryControlKeys = new Set([
    'z0',
    'y',
    'deltaZEdge',
    'topographyOn',
    'terrainSeed',
    'ridgeHeight',
    'craterDepth',
    'nominalIceShell',
    'lensMeanDepth',
    'attenuation',
    'detectionThreshold',
    'boundaryUncertainty'
  ]);

  const controls = [
    ...liveControls.filter((control) => geometryControlKeys.has(control.key)),
    { key: 'iceIndex', label: 'Ice refractive index', min: 1.2, max: 2.2, step: 0.01 },
    { key: 'alongTrackSpacingM', label: 'Along-track spacing', unit: 'm', min: 50, max: 1500, step: 25 },
    { key: 'pulseLengthUs', label: 'Pulse length', unit: 'us', min: 5, max: 100, step: 5 },
    { key: 'windowLossDb', label: 'Window loss', unit: 'dB', min: -6, max: 0, step: 0.1 },
    { key: 'hfBandwidthMhz', label: 'HF bandwidth', unit: 'MHz', min: 0.2, max: 5, step: 0.1 },
    { key: 'vhfBandwidthMhz', label: 'VHF bandwidth', unit: 'MHz', min: 1, max: 20, step: 0.5 },
    { key: 'coherenceApertureM', label: 'Coherence aperture cap', unit: 'm', min: 100, max: 5000, step: 50 },
    { key: 'phaseDecorrelationDeg', label: 'Phase decorrelation', unit: 'deg rms', min: 0, max: 90, step: 1 },
    { key: 'baseReflectivityDb', label: 'Base reflectivity', unit: 'dB', min: -20, max: 10, step: 0.5 },
    { key: 'frequencySlopeDbPerOctave', label: 'Frequency slope', unit: 'dB/oct', min: -8, max: 4, step: 0.25 },
    { key: 'referenceFrequencyMhz', label: 'Reference frequency', unit: 'MHz', min: 3, max: 30, step: 1 },
    { key: 'dirtyIceLevel', label: 'Dirty water / impurity level', min: 0, max: 1, step: 0.05 },
    { key: 'surfaceClutterLevel', label: 'Surface clutter strength', min: 0, max: 1, step: 0.05 }
  ];

  function round(value, digits = 6) {
    if (!Number.isFinite(value)) return null;
    const scale = 10 ** digits;
    return Math.round(value * scale) / scale;
  }

  function clamp(value, min = 0, max = 1) {
    return Math.max(min, Math.min(max, value));
  }

  function db(value) {
    // Power-like ratios use 10*log10. Use 20*log10 only for amplitude ratios.
    return 10 * Math.log10(Math.max(value, 1e-12));
  }

  function log2(value) {
    return Math.log(Math.max(value, 1e-12)) / Math.log(2);
  }

  function pulseGain(lengthUs, windowLossDb, bandwidthMhz = 1) {
    const timeBandwidth = Math.max(lengthUs * bandwidthMhz, 0.1);
    return db(timeBandwidth) + windowLossDb;
  }

  function percentShare(value) {
    return round(clamp(value) * 100, 3);
  }

  function getChart(baseData, title) {
    return baseData && baseData.charts ? baseData.charts.find((chart) => chart.title === title) : null;
  }

  function fallbackChart(id, title, xLabel, yLabel, kind = 'line') {
    return {
      id,
      section: 'Advanced sensitivity',
      sourceSheet: 'Browser model',
      title,
      note: 'Interactive browser sensitivity model; not an independent mission processor or full workbook rerun.',
      xLabel,
      yLabel,
      kind,
      series: []
    };
  }

  function withSeries(source, fallback, series, meta) {
    const chart = source || fallback;
    const overrides = meta || {};
    return {
      ...chart,
      ...overrides,
      sourceSheet: 'Browser model',
      section: 'Advanced sensitivity',
      note: overrides.note || 'Interactive browser sensitivity model; not an independent mission processor or full workbook rerun.',
      series
    };
  }

  function replacePointY(point, y) {
    const next = [point[0], round(y)];
    if (point.length > 2) next.push(point[2]);
    return next;
  }

  function findSeriesByName(chart, matcher) {
    if (!chart || !chart.series) return null;
    const re = matcher instanceof RegExp ? matcher : new RegExp(String(matcher), 'i');
    return chart.series.find((series) => re.test(series.name || '')) || null;
  }

  function sourceXPoints(params, liveData, source) {
    const liveDepthChart = liveChartForTitle('Raw Slant Depth vs Doppler-Corrected Ocean Depth', liveData);
    const liveDepthSeries = findSeriesByName(liveDepthChart, /true simulated ocean depth/i);
    if (liveDepthSeries && liveDepthSeries.points.length) return liveDepthSeries.points;
    const correctedChart = liveChartForTitle('Corrected Layer Depths From Doppler Angle', liveData);
    const correctedSeries = findSeriesByName(correctedChart, /ocean boundary/i);
    if (correctedSeries && correctedSeries.points.length) return correctedSeries.points;
    if (source && source.series && source.series[0] && source.series[0].points.length) {
      return source.series[0].points.map((point) => [point[0], params.nominalIceShell || signalDefaults.nominalIceShell || 15000]);
    }
    return Array.from({ length: 241 }, (_, index) => {
      const x = -60 + index * 120 / 240;
      return [round(x), params.nominalIceShell || signalDefaults.nominalIceShell || 15000];
    });
  }

  function fresnelMetrics(depthM, frequencyMhz, params) {
    const depth = Math.max(depthM || params.nominalIceShell || 1, 1);
    const wavelengthIceM = params.c / (Math.max(frequencyMhz, 0.1) * 1000000) / Math.max(params.iceIndex, 0.1);
    const radiusM = Math.sqrt(Math.max(wavelengthIceM * depth / 2, 0));
    const diameterM = 2 * radiusM;
    const spacingM = Math.max(params.alongTrackSpacingM, 1);
    const fresnelLooks = Math.max(1, Math.floor(diameterM / spacingM) + 1);
    const apertureLooks = Math.max(1, Math.floor(Math.max(params.coherenceApertureM, spacingM) / spacingM) + 1);
    const rawLooks = Math.min(fresnelLooks, apertureLooks);
    const phaseSigmaRad = Math.max(params.phaseDecorrelationDeg || 0, 0) * Math.PI / 180;
    const coherence = Math.exp(-0.5 * phaseSigmaRad * phaseSigmaRad);
    const effectiveLooks = 1 + (rawLooks - 1) * coherence;
    return {
      radiusM,
      diameterM,
      fresnelLooks,
      apertureLooks,
      effectiveLooks,
      gainDb: db(effectiveLooks)
    };
  }

  function frequencySlopeOffsetDb(frequencyMhz, params) {
    return params.frequencySlopeDbPerOctave * log2(frequencyMhz / Math.max(params.referenceFrequencyMhz, 0.1));
  }

  function hammingWeight(t) {
    return 0.54 - 0.46 * Math.cos(2 * Math.PI * t);
  }

  function windowedFrequencyResponse(centerMhz, bandwidthMhz, params) {
    const center = Math.max(centerMhz, 0.1);
    const half = Math.max(bandwidthMhz, 0.01) / 2;
    const lo = Math.max(0.1, center - half);
    const hi = Math.max(lo + 0.01, center + half);
    const samples = 97;
    let weightSum = 0;
    let powerSum = 0;
    let minDb = Infinity;
    let maxDb = -Infinity;
    for (let i = 0; i < samples; i += 1) {
      const t = samples === 1 ? 0.5 : i / (samples - 1);
      const f = lo + (hi - lo) * t;
      const weight = hammingWeight(t);
      const responseDb = frequencySlopeOffsetDb(f, params);
      minDb = Math.min(minDb, responseDb);
      maxDb = Math.max(maxDb, responseDb);
      powerSum += weight * (10 ** (responseDb / 10));
      weightSum += weight;
    }
    const windowedDb = db(powerSum / Math.max(weightSum, 1e-12));
    const centerDb = frequencySlopeOffsetDb(center, params);
    return {
      centerDb,
      windowedDb,
      washoutDeltaDb: windowedDb - centerDb,
      edgeSpanDb: maxDb - minDb
    };
  }

  function buildPulseChart(params, source) {
    const lengths = source && source.series.length
      ? source.series[0].points.map((point) => point[0])
      : [5, 10, 20, 50, 100];
    const hf = lengths.map((length) => [length, round(pulseGain(length, params.windowLossDb, params.hfBandwidthMhz))]);
    const vhf = lengths.map((length) => [length, round(pulseGain(length, params.windowLossDb, params.vhfBandwidthMhz))]);
    const selected = [
      [params.pulseLengthUs, round(pulseGain(params.pulseLengthUs, params.windowLossDb, params.hfBandwidthMhz))],
      [params.pulseLengthUs, round(pulseGain(params.pulseLengthUs, params.windowLossDb, params.vhfBandwidthMhz))]
    ];
    return withSeries(
      source,
      fallbackChart('v30-live-pulse-gain', titlePulse, 'Pulse length (us)', 'dB'),
      [
        { name: 'HF pulse gain', points: hf },
        { name: 'VHF pulse gain', points: vhf },
        { name: 'Selected pulse setting', points: selected }
      ],
      { note: 'Pulse-compression sensitivity proxy: 10log10(pulse length * bandwidth) plus scalar window loss.' }
    );
  }

  function buildGeometricChart(params, source) {
    const baseSeries = source ? source.series : [];
    const rangeScale = Math.max(params.z0 || defaults.z0, 1) / Math.max(defaults.z0, 1);
    const altitudeShift = db((1 / rangeScale) ** 4);
    const series = baseSeries.map((item, index) => ({
      name: index === 0 ? 'HF geometric power' : 'VHF topo geometric power',
      points: item.points.map((point) => replacePointY(point, point[1] + params.baseReflectivityDb + altitudeShift))
    }));
    return withSeries(
      source,
      fallbackChart('v30-live-geometric-power', titleGeometric, 'Along-track position (km)', 'dB'),
      series,
      { note: 'Two-way geometric spreading uses a power ratio, so the altitude sensitivity uses 10log10((R0/R)^4).' }
    );
  }

  function buildCoherentChart(params, source, liveData) {
    const depthPoints = sourceXPoints(params, liveData, source);
    const hf = depthPoints.map((point) => {
      const metric = fresnelMetrics(point[1], 9, params);
      return [point[0], round(metric.gainDb)];
    });
    const vhf = depthPoints.map((point) => {
      const metric = fresnelMetrics(point[1], 60, params);
      return [point[0], round(metric.gainDb)];
    });
    return withSeries(
      source,
      fallbackChart('v30-live-coherent-gain', titleCoherent, 'Along-track position (km)', 'dB'),
      [
        { name: 'HF coherent gain from Fresnel looks', points: hf },
        { name: 'VHF coherent gain from Fresnel looks', points: vhf }
      ],
      { note: 'Coherent gain is now computed from first-Fresnel-zone diameter, along-track spacing, coherence aperture cap, and phase-decorrelation loss.' }
    );
  }

  function buildFresnelLookChart(params, liveData, source) {
    const depthPoints = sourceXPoints(params, liveData, source);
    const hf = depthPoints.map((point) => [point[0], round(fresnelMetrics(point[1], 9, params).effectiveLooks, 3)]);
    const vhf = depthPoints.map((point) => [point[0], round(fresnelMetrics(point[1], 60, params).effectiveLooks, 3)]);
    const apertureCap = depthPoints.map((point) => [point[0], fresnelMetrics(point[1], 9, params).apertureLooks]);
    return withSeries(
      null,
      fallbackChart('v30-live-fresnel-look-count', titleFresnelLooks, 'Along-track position (km)', 'Coherent looks (count)'),
      [
        { name: 'HF effective coherent looks', points: hf },
        { name: 'VHF effective coherent looks', points: vhf },
        { name: 'Aperture cap in samples', points: apertureCap }
      ],
      { note: 'Counts the effective coherent samples available across the first Fresnel-zone diameter after aperture and phase-decorrelation limits.' }
    );
  }

  function buildFrequencyWashoutChart(params) {
    const hf = windowedFrequencyResponse(9, params.hfBandwidthMhz, params);
    const vhf = windowedFrequencyResponse(60, params.vhfBandwidthMhz, params);
    const hfPulse = pulseGain(params.pulseLengthUs, params.windowLossDb, params.hfBandwidthMhz);
    const vhfPulse = pulseGain(params.pulseLengthUs, params.windowLossDb, params.vhfBandwidthMhz);
    return withSeries(
      null,
      fallbackChart('v30-live-windowed-chirp-washout', titleFrequencyWashout, 'Radar band', 'dB', 'bar'),
      [
        { name: 'Center-frequency reflectivity offset', points: [['HF 9 MHz', round(hf.centerDb)], ['VHF 60 MHz', round(vhf.centerDb)]] },
        { name: 'Windowed chirp-average reflectivity', points: [['HF 9 MHz', round(hf.windowedDb)], ['VHF 60 MHz', round(vhf.windowedDb)]] },
        { name: 'Windowed response plus pulse gain', points: [['HF 9 MHz', round(hf.windowedDb + hfPulse)], ['VHF 60 MHz', round(vhf.windowedDb + vhfPulse)]] },
        { name: 'Window washout delta', points: [['HF 9 MHz', round(hf.washoutDeltaDb)], ['VHF 60 MHz', round(vhf.washoutDeltaDb)]] }
      ],
      { note: 'Samples each chirp band with a Hamming weight, applies the frequency-slope reflectivity in linear power, averages it, and adds time-bandwidth pulse gain for the total response series.' }
    );
  }

  function buildTotalVhfChart(params, source, geometricChart, coherentChart) {
    const geom = geometricChart.series[1] || geometricChart.series[0] || { points: [] };
    const coherent = coherentChart.series[1] || coherentChart.series[0] || { points: [] };
    const selectedPulseGain = pulseGain(params.pulseLengthUs, params.windowLossDb, params.vhfBandwidthMhz);
    const frequencyResponse = windowedFrequencyResponse(60, params.vhfBandwidthMhz, params).windowedDb;
    const representativeDepthKm = Math.max(params.nominalIceShell || defaults.nominalIceShell || 0, 0) / 1000;
    const attenuationPenalty = -2 * Math.max(params.attenuation || 0, 0) * representativeDepthKm;
    const constantPoints = geom.points.map((point, index) => {
      const coherentGain = coherent.points[index] ? coherent.points[index][1] : 0;
      return replacePointY(point, point[1] + coherentGain + selectedPulseGain + attenuationPenalty);
    });
    const frequencyPoints = constantPoints.map((point) => replacePointY(point, point[1] + frequencyResponse));
    return withSeries(
      source,
      fallbackChart('v30-live-total-vhf-db', titleTotalVhf, 'Along-track position (km)', 'dB'),
      [
        { name: 'Constant reflectivity', points: constantPoints },
        { name: 'Frequency-dependent reflectivity', points: frequencyPoints }
      ],
      { note: 'Combines geometric power, Fresnel-zone coherent gain, pulse time-bandwidth gain, two-way attenuation, and a Hamming-windowed frequency-response term.' }
    );
  }

  function categoryLabels(source, fallback) {
    if (!source || !source.series.length) return fallback;
    return source.series[0].points.map((point) => point[0]);
  }

  function scenarioStress(label, params) {
    const text = String(label).toLowerCase();
    let dirty = params.dirtyIceLevel;
    let clutter = params.surfaceClutterLevel;
    if (text.includes('clean')) dirty *= 0.05;
    if (text.includes('salt')) dirty *= 0.25;
    if (text.includes('near-surface')) dirty *= 0.55;
    if (text.includes('warm')) dirty *= 0.65;
    if (text.includes('briny') || text.includes('mushy')) dirty *= 0.9;
    if (text.includes('stacked')) dirty *= 1.15;
    if (text.includes('complex')) dirty *= 1.25;
    if (text.includes('rough')) clutter *= 1.3;
    if (text.includes('clutter')) clutter *= 1.45;
    const signalGain = (pulseGain(params.pulseLengthUs, params.windowLossDb, params.hfBandwidthMhz) - pulseGain(signalDefaults.pulseLengthUs, signalDefaults.windowLossDb, signalDefaults.hfBandwidthMhz)) / 15;
    const thresholdRelief = ((signalDefaults.detectionThreshold || -45) - (params.detectionThreshold || -45)) / 80;
    const attenuationStress = Math.max((params.attenuation || 0.9) - 0.9, 0) / 2.5;
    return {
      dirty: clamp(dirty),
      clutter: clamp(clutter),
      signal: signalGain + thresholdRelief - attenuationStress
    };
  }

  function buildConfidenceChart(params, source) {
    const labels = categoryLabels(source, [
      'Clean ice',
      'Salt layers',
      'Near-surface brine',
      'Warm impure ice',
      'Briny/mushy lens',
      'Stacked dirty layers',
      'Complex dirty ice',
      'Rough surface clutter',
      'Complex + clutter'
    ]);
    const confidence = [];
    const ambiguous = [];
    labels.forEach((label) => {
      const stress = scenarioStress(label, params);
      const ambiguity = clamp(0.08 + stress.dirty * 0.72 + stress.clutter * 0.44 - stress.signal * 0.22);
      const score = clamp(1 - ambiguity + stress.signal * 0.18, 0, 1) * 100;
      confidence.push([label, round(score, 3)]);
      ambiguous.push([label, percentShare(ambiguity)]);
    });
    return withSeries(
      source,
      fallbackChart('v30-live-confidence', confidenceTitle, 'Scenario', 'Percent / score (0-100)', 'bar'),
      [
        { name: 'Median confidence', points: confidence },
        { name: 'Ambiguous/false %', points: ambiguous }
      ],
      { yLabel: 'Percent / score (0-100)', note: 'Confidence is a 0-100 score; ambiguous/false values are converted from share to percent.' }
    );
  }

  function buildWorkbookDepthChart(params, source) {
    const labels = categoryLabels(source, [
      'Clean ice',
      'Salt layers',
      'Near-surface brine',
      'Warm impure ice',
      'Briny/mushy lens',
      'Stacked dirty layers',
      'Complex dirty ice'
    ]);
    const clear = [];
    const falseRisk = [];
    const weak = [];
    labels.forEach((label) => {
      const stress = scenarioStress(label, params);
      const falseShare = clamp(stress.dirty * 0.55 + stress.clutter * 0.15 - stress.signal * 0.12);
      const weakShare = clamp(0.05 + stress.dirty * 0.25 + Math.max((params.attenuation || 0.9) - 0.9, 0) * 0.18 - stress.signal * 0.08);
      const clearShare = clamp(1 - falseShare - weakShare);
      clear.push([label, percentShare(clearShare)]);
      falseRisk.push([label, percentShare(falseShare)]);
      weak.push([label, percentShare(clamp(1 - clearShare - falseShare))]);
    });
    return withSeries(
      source,
      fallbackChart('v30-live-workbook-depth', workbookDepthTitle, 'Scenario', 'Percent (0-100)', 'bar'),
      [
        { name: 'Clear ocean', points: clear },
        { name: 'Deep false risk', points: falseRisk },
        { name: 'Weak/no deep', points: weak }
      ],
      { yLabel: 'Percent (0-100)', note: 'Outcome shares are shown as percent to avoid mixing 0-1 shares with 0-100 scores.' }
    );
  }

  function buildClutterStressChart(params, source) {
    const labels = categoryLabels(source, ['Clean ice', 'Near-surface brine', 'Rough surface clutter', 'Complex + clutter']);
    const surface = [];
    const internal = [];
    const outside = [];
    const weak = [];
    labels.forEach((label) => {
      const stress = scenarioStress(label, params);
      const surfaceClutter = clamp(stress.clutter * 0.75 + stress.dirty * 0.15);
      const internalFeature = clamp(stress.dirty * 0.55 + stress.signal * 0.06);
      const weakDetection = clamp(0.08 + Math.max((params.attenuation || 0.9) - 0.9, 0) * 0.22 - stress.signal * 0.1);
      const outsideWindow = clamp(1 - surfaceClutter - internalFeature - weakDetection);
      surface.push([label, percentShare(surfaceClutter)]);
      internal.push([label, percentShare(internalFeature)]);
      outside.push([label, percentShare(outsideWindow)]);
      weak.push([label, percentShare(weakDetection)]);
    });
    return withSeries(
      source,
      fallbackChart('v30-live-clutter-stress', clutterStressTitle, 'Scenario', 'Percent (0-100)', 'bar'),
      [
        { name: 'Surface clutter', points: surface },
        { name: 'Internal feature', points: internal },
        { name: 'Outside shallow window', points: outside },
        { name: 'Weak/no detection', points: weak }
      ],
      { yLabel: 'Percent (0-100)', note: 'All clutter-stress shares are converted to percent for consistent chart scale.' }
    );
  }

  function buildMaterialChart(params, source) {
    const dirtyPenalty = params.dirtyIceLevel * 8;
    const clutterPenalty = params.surfaceClutterLevel * 4;
    const signalBoost = pulseGain(params.pulseLengthUs, params.windowLossDb, params.hfBandwidthMhz) - pulseGain(signalDefaults.pulseLengthUs, signalDefaults.windowLossDb, signalDefaults.hfBandwidthMhz);
    const points = [
      ['Cold clean ice', round(-18 - dirtyPenalty * 0.2 + signalBoost * 0.15)],
      ['Salt-rich ice', round(-14 - dirtyPenalty * 0.45 + signalBoost * 0.12)],
      ['Briny lens', round(-10 - dirtyPenalty * 0.7 - clutterPenalty * 0.2 + signalBoost * 0.1)],
      ['Dirty ice mix', round(-6 - dirtyPenalty * 0.95 - clutterPenalty * 0.35 + signalBoost * 0.08)],
      ['Ice-ocean boundary', round(-2 - dirtyPenalty * 1.15 - clutterPenalty * 0.5 + signalBoost * 0.05)]
    ];
    return withSeries(
      source,
      fallbackChart('v30-live-materials', materialTitle, 'Material / interface', 'Relative reflector strength (dB)', 'bar'),
      [{ name: 'Material/interface strength', points }],
      { kind: 'bar', xLabel: 'Material / interface', yLabel: 'Relative reflector strength (dB)' }
    );
  }

  function buildEvidenceChart(params, source) {
    const signalBoost = pulseGain(params.pulseLengthUs, params.windowLossDb, params.hfBandwidthMhz) - pulseGain(signalDefaults.pulseLengthUs, signalDefaults.windowLossDb, signalDefaults.hfBandwidthMhz);
    const radar = clamp((72 - params.dirtyIceLevel * 35 - params.surfaceClutterLevel * 22 + signalBoost * 1.4) / 100, 0, 1) * 100;
    const thermal = clamp((42 + params.dirtyIceLevel * 18) / 100, 0, 1) * 100;
    const composition = clamp((48 + params.dirtyIceLevel * 28) / 100, 0, 1) * 100;
    const magnetic = clamp((52 - params.surfaceClutterLevel * 8) / 100, 0, 1) * 100;
    return withSeries(
      source,
      fallbackChart('v30-live-evidence', evidenceTitle, 'Instrument', 'Support (%)', 'bar'),
      [{
        name: 'Evidence support score',
        points: [
          ['Radar', round(radar, 3)],
          ['Thermal', round(thermal, 3)],
          ['Composition', round(composition, 3)],
          ['Magnetic/plasma', round(magnetic, 3)]
        ]
      }],
      { kind: 'bar', xLabel: 'Instrument', yLabel: 'Support (%)' }
    );
  }

  function liveChartForTitle(title, liveData) {
    if (!liveData || !liveData.charts) return null;
    const lookupTitle = chartAliases.get(title) || title;
    return liveData.charts.find((chart) => chart.title === lookupTitle) || null;
  }

  function adaptLiveChart(baseChart, liveChart) {
    if (!liveChart) return null;
    return {
      ...baseChart,
      title: liveChart.title,
      sourceSheet: 'Browser model',
      section: 'Advanced sensitivity',
      kind: liveChart.kind,
      xLabel: liveChart.xLabel,
      yLabel: liveChart.yLabel,
      note: 'Interactive browser sensitivity model; not an independent mission processor or full workbook rerun.',
      series: liveChart.series
    };
  }

  function dedupeCharts(charts) {
    const seenTitles = new Set();
    return charts.filter((chart) => {
      const key = chart.title || chart.id;
      if (seenTitles.has(key)) return false;
      seenTitles.add(key);
      return true;
    });
  }

  function compute(params, baseData) {
    const base = baseData || window.V30_RESULTS;
    if (!base || !base.charts) return base;
    const p = { ...defaults, ...params };
    p.n = p.iceIndex;
    const liveData = liveModel ? liveModel.compute(p) : null;
    const pulseChart = buildPulseChart(p, getChart(base, titlePulse));
    const geometricChart = buildGeometricChart(p, getChart(base, titleGeometric));
    const coherentChart = buildCoherentChart(p, getChart(base, titleCoherent), liveData);
    const totalVhfChart = buildTotalVhfChart(p, getChart(base, titleTotalVhf), geometricChart, coherentChart);
    const fresnelLookChart = buildFresnelLookChart(p, liveData, getChart(base, titleCoherent));
    const frequencyWashoutChart = buildFrequencyWashoutChart(p);
    const charts = base.charts.map((chart) => {
      if (chart.title === titlePulse) return pulseChart;
      if (chart.title === titleGeometric) return geometricChart;
      if (chart.title === titleCoherent) return coherentChart;
      if (chart.title === titleTotalVhf) return totalVhfChart;
      if (chart.title === confidenceTitle) return buildConfidenceChart(p, chart);
      if (chart.title === workbookDepthTitle) return buildWorkbookDepthChart(p, chart);
      if (chart.title === clutterStressTitle) return buildClutterStressChart(p, chart);
      if (chart.title === materialTitle) return buildMaterialChart(p, chart);
      if (chart.title === evidenceTitle) return buildEvidenceChart(p, chart);
      if (chart.title === 'Terrain Baseline: Total Radar Elevation Error') {
        return {
          ...chart,
          yLabel: 'Surface-height equivalent error (m)',
          note: 'Expanded workbook terrain-error chart; values are surface-height-equivalent meters in this sensitivity view.'
        };
      }
      return adaptLiveChart(chart, liveChartForTitle(chart.title, liveData)) || chart;
    });
    return {
      ...base,
      charts: dedupeCharts([...charts, fresnelLookChart, frequencyWashoutChart])
    };
  }

  window.V30_LIVE_MODEL = {
    defaults,
    controls,
    compute
  };
})();
