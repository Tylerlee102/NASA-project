function check_multi_clutter_aliasing
% Independent MATLAB check for the browser multi-clutter fold model.

C = 299792458;
processingTraceCount = 64;
processingDepthBins = 96;
processingMaxDepthKm = 24;

model.altitudeKm = 25;
model.velocityKmS = 2.5;
model.frequencyMhz = 60;
model.targetDepthKm = 6.74;
model.iceIndex = 1.78;
model.spreadKm = 60;

flybyDurationS = 12;
wavelengthM = C / (model.frequencyMhz * 1e6);
depthToleranceKm = processingMaxDepthKm / (processingDepthBins - 1) / 2;

counts = [1 4 12 24 48];
timesS = [0 3 6 9 12];

rows = [];
sameDelayOffsetKm = sameDelaySurfaceOffset(model);
sameDelayDepthKm = apparentSurfaceDepth(model, sameDelayOffsetKm);
assert(abs(sameDelayDepthKm - model.targetDepthKm) < 1e-10, ...
  'same-delay surface point should match target apparent depth');

for count = counts
  points = computePoints(model, count);
  [~, selectedIdx] = min(abs([points.apparentDepthKm] - model.targetDepthKm) - 1e-12 * [points.xKm]);
  selectedPoint = points(selectedIdx);
  selectedFoldPrfHz = abs(selectedPoint.trueDopplerHz);
  originalPrfHz = 4 * selectedFoldPrfHz;
  dopplerToleranceHz = originalPrfHz / processingTraceCount / 2;

  for timeS = timesS
    planeXKm = (timeS - flybyDurationS / 2) * model.velocityKmS;
    targetState = targetAt(model, planeXKm, selectedFoldPrfHz, wavelengthM);
    surfaceStates = arrayfun(@(point) surfaceAt(model, point, planeXKm, selectedFoldPrfHz, wavelengthM, targetState, dopplerToleranceHz, depthToleranceKm), points);
    overlapCount = sum([surfaceStates.overlapsTarget]);
    [~, nearestIdx] = min([surfaceStates.normalizedDistance]);
    nearest = surfaceStates(nearestIdx);

    rows = [rows; struct( ...
      'point_count', count, ...
      'time_s', timeS, ...
      'selected_prf_hz', selectedFoldPrfHz, ...
      'same_delay_offset_km', sameDelayOffsetKm, ...
      'target_alias_hz', targetState.targetAliasHz, ...
      'nearest_surface_alias_hz', nearest.surfaceAliasHz, ...
      'nearest_surface_depth_km', nearest.surfaceApparentDepthKm, ...
      'nearest_doppler_delta_hz', nearest.dopplerDeltaHz, ...
      'nearest_depth_delta_km', nearest.depthDeltaKm, ...
      'overlap_count', overlapCount)];
  end

  if count == 1
    centerTarget = targetAt(model, 0, selectedFoldPrfHz, wavelengthM);
    centerSurface = surfaceAt(model, selectedPoint, 0, selectedFoldPrfHz, wavelengthM, centerTarget, dopplerToleranceHz, depthToleranceKm);
    assert(abs(centerSurface.surfaceAliasHz) < 1e-9, 'single clutter point should fold to zero alias at center time');
    assert(centerSurface.overlapsTarget, 'single clutter point should overlap the target at center time');
  end
end

summary = struct2table(rows);
outputPath = fullfile(fileparts(fileparts(mfilename('fullpath'))), 'outputs', 'multi_clutter_aliasing_matlab_summary.csv');
writetable(summary, outputPath);

fprintf('MATLAB multi-clutter aliasing check passed. Wrote %s\n', outputPath);
end

function xKm = sameDelaySurfaceOffset(model)
targetEquivalentRangeKm = model.altitudeKm + model.iceIndex * model.targetDepthKm;
xKm = sqrt(max(0, targetEquivalentRangeKm ^ 2 - model.altitudeKm ^ 2));
end

function depthKm = apparentSurfaceDepth(model, xKm)
depthKm = (hypot(model.altitudeKm, xKm) - model.altitudeKm) / model.iceIndex;
end

function points = computePoints(model, count)
foldCenterKm = sameDelaySurfaceOffset(model);
clusterHalfWidthKm = min(model.spreadKm * 0.22, max(3.5, model.targetDepthKm * 0.82));
points = repmat(struct('index', 0, 'xKm', 0, 'rangeKm', 0, 'trueDopplerHz', 0, 'apparentDepthKm', 0), 1, count);
for idx = 1:count
  if idx == 1
    xKm = foldCenterKm;
  else
    ring = ceil((idx - 1) / 2);
    ringCount = max(1, ceil((count - 1) / 2));
    if mod(idx - 1, 2) == 0
      side = 1;
    else
      side = -1;
    end
    xKm = foldCenterKm + side * (ring / ringCount) * clusterHalfWidthKm;
  end
  rangeKm = hypot(model.altitudeKm, xKm);
  points(idx).index = idx - 1;
  points(idx).xKm = xKm;
  points(idx).rangeKm = rangeKm;
  points(idx).trueDopplerHz = (2 * model.velocityKmS * 1000 / (299792458 / (model.frequencyMhz * 1e6))) * (xKm / rangeKm);
  points(idx).apparentDepthKm = (rangeKm - model.altitudeKm) / model.iceIndex;
end
end

function state = targetAt(model, planeXKm, prfHz, wavelengthM)
targetDxKm = -planeXKm;
targetOpticalHeightKm = model.altitudeKm + model.iceIndex * model.targetDepthKm;
targetRangeKm = hypot(targetOpticalHeightKm, targetDxKm);
targetTrueDopplerHz = (2 * model.velocityKmS * 1000 / wavelengthM) * (targetDxKm / targetRangeKm);
targetAliasHz = aliasHz(targetTrueDopplerHz, prfHz);
targetApparentDepthKm = (targetRangeKm - model.altitudeKm) / model.iceIndex;
state = struct( ...
  'targetTrueDopplerHz', targetTrueDopplerHz, ...
  'targetAliasHz', targetAliasHz, ...
  'targetApparentDepthKm', targetApparentDepthKm);
end

function state = surfaceAt(model, point, planeXKm, prfHz, wavelengthM, targetState, dopplerToleranceHz, depthToleranceKm)
surfaceDxKm = point.xKm - planeXKm;
surfaceRangeKm = hypot(model.altitudeKm, surfaceDxKm);
surfaceTrueDopplerHz = (2 * model.velocityKmS * 1000 / wavelengthM) * (surfaceDxKm / surfaceRangeKm);
surfaceAliasHz = aliasHz(surfaceTrueDopplerHz, prfHz);
surfaceApparentDepthKm = (surfaceRangeKm - model.altitudeKm) / model.iceIndex;
dopplerDeltaHz = abs(surfaceAliasHz - targetState.targetAliasHz);
depthDeltaKm = abs(surfaceApparentDepthKm - targetState.targetApparentDepthKm);
normalizedDistance = hypot(dopplerDeltaHz / max(1e-6, dopplerToleranceHz), depthDeltaKm / max(1e-6, depthToleranceKm));
state = struct( ...
  'surfaceAliasHz', surfaceAliasHz, ...
  'surfaceApparentDepthKm', surfaceApparentDepthKm, ...
  'dopplerDeltaHz', dopplerDeltaHz, ...
  'depthDeltaKm', depthDeltaKm, ...
  'normalizedDistance', normalizedDistance, ...
  'overlapsTarget', dopplerDeltaHz <= dopplerToleranceHz && depthDeltaKm <= depthToleranceKm);
end

function foldedHz = aliasHz(dopplerHz, prfHz)
foldedHz = mod(dopplerHz + prfHz / 2, prfHz) - prfHz / 2;
end
