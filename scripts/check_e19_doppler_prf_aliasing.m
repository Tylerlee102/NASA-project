% check_e19_doppler_prf_aliasing.m
%
% Check where E19 Cilix Doppler is most likely to fold or alias for a set of
% candidate PRFs. The input is the SPICE-derived E19 sample file used by the
% website: docs/data/e19-flyby.js.
%
% Definitions used here:
%   Doppler aliasing: abs(two-way Doppler) is larger than PRF / 2.
%   Near-zero fold: aliased Doppler is within one half FFT bin of zero,
%   using 64 traces, so tolerance = PRF / (2 * 64).

clear; clc;

scriptDir = fileparts(mfilename("fullpath"));
repoDir = fullfile(scriptDir, "..");
dataFile = fullfile(repoDir, "docs", "data", "e19-flyby.js");
outDir = fullfile(repoDir, "outputs");
if ~exist(outDir, "dir")
  mkdir(outDir);
end

raw = fileread(dataFile);
raw = regexprep(raw, "^\s*window\.E19_FLYBY\s*=\s*", "");
raw = regexprep(raw, ";\s*$", "");
e19 = jsondecode(raw);

c = 299792458;
carrierHz = 60e6;
lambdaM = c / carrierHz;
traceCount = 64;
prfsHz = [737.7; 1000; 1500; 2200; 3000];

samples = e19.samples;
offsetS = [samples.offsetS]';
distanceToCilixKm = [samples.distanceToCilixKm]';
altitudeKm = [samples.altitudeKm]';
incidenceDeg = [samples.incidenceDeg]';
groundTrackKm = [samples.groundTrackKm]';
latDeg = [samples.latDeg]';
lonEastDeg = [samples.lonEastDeg]';

timeS = (min(offsetS):0.5:max(offsetS))';
distanceFineKm = interp1(offsetS, distanceToCilixKm, timeS, "linear");
altitudeFineKm = interp1(offsetS, altitudeKm, timeS, "linear");
incidenceFineDeg = interp1(offsetS, incidenceDeg, timeS, "linear");
groundTrackFineKm = interp1(offsetS, groundTrackKm, timeS, "linear");
latFineDeg = interp1(offsetS, latDeg, timeS, "linear");
lonFineDeg = interp1(offsetS, lonEastDeg, timeS, "linear");

rangeRateKmS = gradient(distanceFineKm, timeS);
dopplerHz = -2 * rangeRateKmS * 1000 / lambdaM;
unaliasedPrfFloorHz = 2 * max(abs(dopplerHz));

summaryRows = table();
windowRows = table();
timeSeries = table(timeS, altitudeFineKm, incidenceFineDeg, distanceFineKm, ...
  groundTrackFineKm, latFineDeg, lonFineDeg, rangeRateKmS, dopplerHz);

for k = 1:numel(prfsHz)
  prfHz = prfsHz(k);
  nyquistHz = prfHz / 2;
  nearZeroToleranceHz = prfHz / (2 * traceCount);
  aliasHz = aliasDoppler(dopplerHz, prfHz);
  foldOrder = round((dopplerHz - aliasHz) / prfHz);
  aliasMask = abs(dopplerHz) > nyquistHz;
  nearZeroMask = abs(aliasHz) <= nearZeroToleranceHz & foldOrder ~= 0;

  [~, peakIndex] = max(abs(dopplerHz));
  foldedIndexes = find(foldOrder ~= 0);
  [~, closestLocalIndex] = min(abs(aliasHz(foldedIndexes)));
  closestIndex = foldedIndexes(closestLocalIndex);

  aliasStarts = timeS(aliasMask);
  if isempty(aliasStarts)
    aliasStartS = NaN;
    aliasEndS = NaN;
  else
    aliasStartS = aliasStarts(1);
    aliasEndS = aliasStarts(end);
  end

  row = table(prfHz, nyquistHz, nearZeroToleranceHz, unaliasedPrfFloorHz, ...
    100 * nnz(aliasMask) / numel(aliasMask), aliasStartS, aliasEndS, ...
    timeS(peakIndex), dopplerHz(peakIndex), ...
    timeS(closestIndex), dopplerHz(closestIndex), aliasHz(closestIndex), ...
    foldOrder(closestIndex), altitudeFineKm(closestIndex), ...
    distanceFineKm(closestIndex), groundTrackFineKm(closestIndex), ...
    latFineDeg(closestIndex), lonFineDeg(closestIndex), 'VariableNames', ...
    {'prfHz', 'nyquistHz', 'nearZeroToleranceHz', 'unaliasedPrfFloorHz', ...
    'aliasedPercent', 'aliasStartS', 'aliasEndS', 'peakDopplerTimeS', ...
    'peakDopplerHz', 'closestZeroFoldTimeS', ...
    'closestZeroTrueDopplerHz', 'closestZeroAliasHz', ...
    'closestZeroFoldOrder', 'closestZeroAltitudeKm', ...
    'closestZeroDistanceToCilixKm', 'closestZeroGroundTrackKm', ...
    'closestZeroLatDeg', 'closestZeroLonEastDeg'});
  summaryRows = [summaryRows; row]; %#ok<AGROW>

  windows = maskWindows(nearZeroMask, timeS, dopplerHz, aliasHz, foldOrder, ...
    altitudeFineKm, distanceFineKm, groundTrackFineKm, latFineDeg, lonFineDeg);
  if ~isempty(windows)
    windows.prfHz = repmat(prfHz, height(windows), 1);
    windows = movevars(windows, "prfHz", "Before", 1);
    windowRows = [windowRows; windows]; %#ok<AGROW>
  end

  safeName = matlab.lang.makeValidName("aliasHz_prf_" + string(prfHz));
  orderName = matlab.lang.makeValidName("foldOrder_prf_" + string(prfHz));
  timeSeries.(safeName) = aliasHz;
  timeSeries.(orderName) = foldOrder;
end

writetable(summaryRows, fullfile(outDir, "e19_doppler_prf_aliasing_summary.csv"));
writetable(windowRows, fullfile(outDir, "e19_doppler_prf_zero_fold_windows.csv"));
writetable(timeSeries, fullfile(outDir, "e19_doppler_prf_timeseries.csv"));

fprintf("Peak abs Doppler: %.1f Hz at %+0.1f s\n", ...
  summaryRows.peakDopplerHz(1), summaryRows.peakDopplerTimeS(1));
fprintf("Unaliased PRF floor for this E19 Cilix check: %.1f Hz\n", ...
  unaliasedPrfFloorHz);
fprintf("Wrote E19 PRF aliasing CSVs to %s\n", outDir);

function aliasHz = aliasDoppler(dopplerHz, prfHz)
  aliasHz = mod(dopplerHz + prfHz / 2, prfHz) - prfHz / 2;
end

function windows = maskWindows(mask, timeS, dopplerHz, aliasHz, foldOrder, ...
    altitudeKm, distanceKm, groundTrackKm, latDeg, lonEastDeg)
  starts = [];
  ends = [];
  closestTimeS = [];
  closestTrueDopplerHz = [];
  closestAliasHz = [];
  closestFoldOrder = [];
  closestAltitudeKm = [];
  closestDistanceToCilixKm = [];
  closestGroundTrackKm = [];
  closestLatDeg = [];
  closestLonEastDeg = [];

  activeStart = NaN;
  for i = 1:numel(mask)
    if mask(i) && isnan(activeStart)
      activeStart = i;
    elseif ~mask(i) && ~isnan(activeStart)
      [starts, ends, closestTimeS, closestTrueDopplerHz, closestAliasHz, ...
        closestFoldOrder, closestAltitudeKm, closestDistanceToCilixKm, ...
        closestGroundTrackKm, closestLatDeg, closestLonEastDeg] = addWindow( ...
        activeStart, i - 1, starts, ends, closestTimeS, closestTrueDopplerHz, ...
        closestAliasHz, closestFoldOrder, closestAltitudeKm, ...
        closestDistanceToCilixKm, closestGroundTrackKm, closestLatDeg, ...
        closestLonEastDeg, timeS, dopplerHz, aliasHz, foldOrder, altitudeKm, ...
        distanceKm, groundTrackKm, latDeg, lonEastDeg);
      activeStart = NaN;
    end
  end

  if ~isnan(activeStart)
    [starts, ends, closestTimeS, closestTrueDopplerHz, closestAliasHz, ...
      closestFoldOrder, closestAltitudeKm, closestDistanceToCilixKm, ...
      closestGroundTrackKm, closestLatDeg, closestLonEastDeg] = addWindow( ...
      activeStart, numel(mask), starts, ends, closestTimeS, ...
      closestTrueDopplerHz, closestAliasHz, closestFoldOrder, ...
      closestAltitudeKm, closestDistanceToCilixKm, closestGroundTrackKm, ...
      closestLatDeg, closestLonEastDeg, timeS, dopplerHz, aliasHz, ...
      foldOrder, altitudeKm, distanceKm, groundTrackKm, latDeg, lonEastDeg);
  end

  windows = table(starts, ends, ends - starts, closestTimeS, ...
    closestTrueDopplerHz, closestAliasHz, closestFoldOrder, ...
    closestAltitudeKm, closestDistanceToCilixKm, closestGroundTrackKm, ...
    closestLatDeg, closestLonEastDeg, 'VariableNames', {'startS', 'endS', ...
    'durationS', 'closestTimeS', 'closestTrueDopplerHz', 'closestAliasHz', ...
    'closestFoldOrder', 'closestAltitudeKm', 'closestDistanceToCilixKm', ...
    'closestGroundTrackKm', 'closestLatDeg', 'closestLonEastDeg'});
end

function [starts, ends, closestTimeS, closestTrueDopplerHz, closestAliasHz, ...
    closestFoldOrder, closestAltitudeKm, closestDistanceToCilixKm, ...
    closestGroundTrackKm, closestLatDeg, closestLonEastDeg] = addWindow( ...
    startIndex, endIndex, starts, ends, closestTimeS, closestTrueDopplerHz, ...
    closestAliasHz, closestFoldOrder, closestAltitudeKm, ...
    closestDistanceToCilixKm, closestGroundTrackKm, closestLatDeg, ...
    closestLonEastDeg, timeS, dopplerHz, aliasHz, foldOrder, altitudeKm, ...
    distanceKm, groundTrackKm, latDeg, lonEastDeg)
  indexes = startIndex:endIndex;
  [~, localIndex] = min(abs(aliasHz(indexes)));
  bestIndex = indexes(localIndex);

  starts(end + 1, 1) = timeS(startIndex);
  ends(end + 1, 1) = timeS(endIndex);
  closestTimeS(end + 1, 1) = timeS(bestIndex);
  closestTrueDopplerHz(end + 1, 1) = dopplerHz(bestIndex);
  closestAliasHz(end + 1, 1) = aliasHz(bestIndex);
  closestFoldOrder(end + 1, 1) = foldOrder(bestIndex);
  closestAltitudeKm(end + 1, 1) = altitudeKm(bestIndex);
  closestDistanceToCilixKm(end + 1, 1) = distanceKm(bestIndex);
  closestGroundTrackKm(end + 1, 1) = groundTrackKm(bestIndex);
  closestLatDeg(end + 1, 1) = latDeg(bestIndex);
  closestLonEastDeg(end + 1, 1) = lonEastDeg(bestIndex);
end
