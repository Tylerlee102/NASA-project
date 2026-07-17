function check_equal_distance_clutter_aliasing
% Independent MATLAB check for the equal-distance clutter subsection.

C = 299792458;
processingTraceCount = 64;
processingDepthBins = 96;
processingMaxDepthKm = 24;

model.altitudeKm = 25;
model.velocityKmS = 2.5;
model.frequencyMhz = 60;
model.targetDepthKm = 6.74;
model.iceIndex = 1.78;
model.pointCount = 12;
model.spreadKm = 60;

flybyDurationS = 12;
wavelengthM = C / (model.frequencyMhz * 1e6);
depthToleranceKm = processingMaxDepthKm / (processingDepthBins - 1) / 2;

basePoints = fixedSurfacePoints(model, model.pointCount, wavelengthM);
[~, selectedIdx] = sortrows([[abs([basePoints.apparentDepthKm] - model.targetDepthKm)].' -[basePoints.xKm].']);
selectedPoint = basePoints(selectedIdx(1));
selectedFoldPrfHz = abs(selectedPoint.trueDopplerHz);
originalPrfHz = 4 * selectedFoldPrfHz;
dopplerToleranceHz = originalPrfHz / processingTraceCount / 2;

counts = [1 12 24 48 64];
timesS = [0 3 6 9 12];
rows = [];

for count = counts
  points = equalDistanceFoldPatch(model, selectedPoint.xKm, count, depthToleranceKm, wavelengthM);
  spacingKm = spacingForFoldPatch(model, selectedPoint.xKm, depthToleranceKm);
  assert(count == 1 || max(abs(diff([points.xKm]) - spacingKm)) < 1e-10, ...
    'surface clutter points must be equal-distance');

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
      'equal_spacing_km', spacingKm, ...
      'selected_prf_hz', selectedFoldPrfHz, ...
      'target_alias_hz', targetState.targetAliasHz, ...
      'nearest_surface_x_km', nearest.xKm, ...
      'nearest_surface_alias_hz', nearest.surfaceAliasHz, ...
      'nearest_surface_depth_km', nearest.surfaceApparentDepthKm, ...
      'nearest_doppler_delta_hz', nearest.dopplerDeltaHz, ...
      'nearest_depth_delta_km', nearest.depthDeltaKm, ...
      'overlap_count', overlapCount)];
  end
end

centerRows = rows([rows.time_s] == 6);
center48 = centerRows([centerRows.point_count] == 48);
assert(center48.overlap_count >= 2, '48 equal-distance points should create multiple target-cell clutter aliases at center time');

summary = struct2table(rows);
outputPath = fullfile(fileparts(fileparts(mfilename('fullpath'))), 'outputs', 'equal_distance_clutter_aliasing_matlab_summary.csv');
writetable(summary, outputPath);

fprintf('MATLAB equal-distance clutter aliasing check passed. Wrote %s\n', outputPath);
end

function points = fixedSurfacePoints(model, count, wavelengthM)
points = repmat(emptyPoint(), 1, count);
for idx = 1:count
  if count == 1
    xKm = 0;
  else
    xKm = -model.spreadKm + (2 * model.spreadKm * (idx - 1)) / (count - 1);
  end
  points(idx) = pointForX(model, xKm, idx - 1, wavelengthM);
end
end

function points = equalDistanceFoldPatch(model, centerXKm, count, depthToleranceKm, wavelengthM)
spacingKm = spacingForFoldPatch(model, centerXKm, depthToleranceKm);
startXKm = centerXKm - spacingKm * (count - 1) / 2;
points = repmat(emptyPoint(), 1, count);
for idx = 1:count
  xKm = startXKm + spacingKm * (idx - 1);
  points(idx) = pointForX(model, xKm, idx - 1, wavelengthM);
end
end

function spacingKm = spacingForFoldPatch(model, centerXKm, depthToleranceKm)
rangeKm = hypot(model.altitudeKm, centerXKm);
if abs(centerXKm) > 0.001
  depthSlope = abs(centerXKm) / (model.iceIndex * rangeKm);
else
  depthSlope = 1 / model.iceIndex;
end
spacingKm = max(0.08, (depthToleranceKm / max(0.05, depthSlope)) * 0.45);
end

function point = pointForX(model, xKm, index, wavelengthM)
rangeKm = hypot(model.altitudeKm, xKm);
point = struct( ...
  'index', index, ...
  'xKm', xKm, ...
  'rangeKm', rangeKm, ...
  'trueDopplerHz', (2 * model.velocityKmS * 1000 / wavelengthM) * (xKm / rangeKm), ...
  'apparentDepthKm', (rangeKm - model.altitudeKm) / model.iceIndex);
end

function point = emptyPoint
point = struct('index', 0, 'xKm', 0, 'rangeKm', 0, 'trueDopplerHz', 0, 'apparentDepthKm', 0);
end

function state = targetAt(model, planeXKm, prfHz, wavelengthM)
targetDxKm = -planeXKm;
targetOpticalHeightKm = model.altitudeKm + model.iceIndex * model.targetDepthKm;
targetRangeKm = hypot(targetOpticalHeightKm, targetDxKm);
targetTrueDopplerHz = (2 * model.velocityKmS * 1000 / wavelengthM) * (targetDxKm / targetRangeKm);
state = struct( ...
  'targetTrueDopplerHz', targetTrueDopplerHz, ...
  'targetAliasHz', aliasHz(targetTrueDopplerHz, prfHz), ...
  'targetApparentDepthKm', (targetRangeKm - model.altitudeKm) / model.iceIndex);
end

function state = surfaceAt(model, point, planeXKm, prfHz, wavelengthM, targetState, dopplerToleranceHz, depthToleranceKm)
surfaceDxKm = point.xKm - planeXKm;
surfaceRangeKm = hypot(model.altitudeKm, surfaceDxKm);
surfaceTrueDopplerHz = (2 * model.velocityKmS * 1000 / wavelengthM) * (surfaceDxKm / surfaceRangeKm);
surfaceAliasHz = aliasHz(surfaceTrueDopplerHz, prfHz);
surfaceApparentDepthKm = (surfaceRangeKm - model.altitudeKm) / model.iceIndex;
dopplerDeltaHz = abs(aliasHz(surfaceAliasHz - targetState.targetAliasHz, prfHz));
depthDeltaKm = abs(surfaceApparentDepthKm - targetState.targetApparentDepthKm);
normalizedDistance = hypot(dopplerDeltaHz / max(1e-6, dopplerToleranceHz), depthDeltaKm / max(1e-6, depthToleranceKm));
state = struct( ...
  'xKm', point.xKm, ...
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
