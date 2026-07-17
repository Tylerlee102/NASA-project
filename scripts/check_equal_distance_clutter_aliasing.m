function check_equal_distance_clutter_aliasing
% Independent MATLAB check for the equal-distance clutter page.

C = 299792458;
processingTraceCount = 64;
processingDepthBins = 96;
processingMaxDepthKm = 24;

model.altitudeKm = 25;
model.velocityKmS = 2.5;
model.frequencyMhz = 60;
model.targetDepthKm = 6.74;
model.iceIndex = 1.78;
model.pointCount = 17;

flybyDurationS = 12;
wavelengthM = C / (model.frequencyMhz * 1e6);
depthToleranceKm = processingMaxDepthKm / (processingDepthBins - 1) / 2;

centerXKm = sameDelayOffsetKm(model);
model.surfaceWindowKm = max(18, min(54, centerXKm * 0.9));
selectedFoldPrfHz = abs(dopplerForDx(model, centerXKm, model.altitudeKm, wavelengthM));
dopplerToleranceHz = max(3, selectedFoldPrfHz / 32);

counts = [1 17 33 65 96];
timesS = [0 3 6 9 12];
rows = [];

for count = counts
  points = equalDistanceSurfacePoints(model, centerXKm, count, wavelengthM);
  spacingKm = spacingForCount(model, count);
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
      'surface_window_km', model.surfaceWindowKm, ...
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
center17 = centerRows([centerRows.point_count] == 17);
assert(center17.overlap_count == 1, '17 equal-distance points should put the center clutter point in the target cell');
center96 = centerRows([centerRows.point_count] == 96);
assert(center96.overlap_count >= 2, '96 equal-distance points should create multiple target-cell clutter aliases at center time');

summary = struct2table(rows);
outputDir = fullfile(fileparts(fileparts(mfilename('fullpath'))), 'outputs');
if ~exist(outputDir, 'dir')
  mkdir(outputDir);
end
outputPath = fullfile(outputDir, 'equal_distance_clutter_aliasing_matlab_summary.csv');
writetable(summary, outputPath);

fprintf('MATLAB equal-distance clutter aliasing check passed. Wrote %s\n', outputPath);
end

function offsetKm = sameDelayOffsetKm(model)
targetOpticalHeightKm = model.altitudeKm + model.iceIndex * model.targetDepthKm;
offsetKm = sqrt(max(0, targetOpticalHeightKm ^ 2 - model.altitudeKm ^ 2));
end

function points = equalDistanceSurfacePoints(model, centerXKm, count, wavelengthM)
spacingKm = spacingForCount(model, count);
startXKm = centerXKm - model.surfaceWindowKm / 2;
points = repmat(emptyPoint(), 1, count);
for idx = 1:count
  if count == 1
    xKm = centerXKm;
  else
    xKm = startXKm + spacingKm * (idx - 1);
  end
  points(idx) = pointForX(model, xKm, idx - 1, wavelengthM);
end
end

function spacingKm = spacingForCount(model, count)
if count <= 1
  spacingKm = 0;
else
  spacingKm = model.surfaceWindowKm / (count - 1);
end
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

function dopplerHz = dopplerForDx(model, dxKm, verticalKm, wavelengthM)
rangeKm = hypot(verticalKm, dxKm);
dopplerHz = (2 * model.velocityKmS * 1000 / wavelengthM) * (dxKm / rangeKm);
end

function point = emptyPoint
point = struct('index', 0, 'xKm', 0, 'rangeKm', 0, 'trueDopplerHz', 0, 'apparentDepthKm', 0);
end

function state = targetAt(model, planeXKm, prfHz, wavelengthM)
targetDxKm = -planeXKm;
targetOpticalHeightKm = model.altitudeKm + model.iceIndex * model.targetDepthKm;
targetRangeKm = hypot(targetOpticalHeightKm, targetDxKm);
targetTrueDopplerHz = dopplerForDx(model, targetDxKm, targetOpticalHeightKm, wavelengthM);
state = struct( ...
  'targetTrueDopplerHz', targetTrueDopplerHz, ...
  'targetAliasHz', aliasHz(targetTrueDopplerHz, prfHz), ...
  'targetApparentDepthKm', (targetRangeKm - model.altitudeKm) / model.iceIndex);
end

function state = surfaceAt(model, point, planeXKm, prfHz, wavelengthM, targetState, dopplerToleranceHz, depthToleranceKm)
surfaceDxKm = point.xKm - planeXKm;
surfaceRangeKm = hypot(model.altitudeKm, surfaceDxKm);
surfaceTrueDopplerHz = dopplerForDx(model, surfaceDxKm, model.altitudeKm, wavelengthM);
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
