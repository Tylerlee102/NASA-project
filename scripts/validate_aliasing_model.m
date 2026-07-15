% validate_aliasing_model.m
%
% Independent MATLAB reference for the browser Doppler-aliasing laboratory.
% It uses only base MATLAB. The script checks the flat-surface geometry,
% modulo-PRF alias rule, apparent-depth mapping, FFT bin locations after trace
% deletion, and the zero-Doppler reconstruction used by the teaching plots.

clear; close all; clc;

scriptDir = fileparts(mfilename("fullpath"));
repoDir = fileparts(scriptDir);
outDir = fullfile(repoDir, "outputs", "matlab_validation");
if ~exist(outDir, "dir")
    mkdir(outDir);
end

% Browser-default teaching case. The 2.5 km/s default keeps the constructed
% four-times-Doppler base PRF below REASON's published 3 kHz upper range.
c = 299792458;
hKm = 25;
vKmS = 2.5;
fcHz = 60e6;
lambdaM = c / fcHz;
nIce = 1.78;
targetDepthKm = 6.74;
pointCount = 12;
spreadKm = 60;
traceCount = 64;
depthBins = 96;
maxDepthKm = 24;
instrumentPrfMaxHz = 3000;
listenMarginUs = 25;

% Twelve discrete flat-surface clutter points.
xKm = linspace(-spreadKm, spreadKm, pointCount);
rangeKm = hypot(hKm, xKm);
surfaceDepthKm = (rangeKm - hKm) / nIce;
surfaceDopplerHz = (2 * vKmS * 1000 / lambdaM) .* (xKm ./ rangeKm);

% Match the browser tie-break: closest delay/depth, then the positive branch.
depthErrorKm = abs(surfaceDepthKm - targetDepthKm);
minimumError = min(depthErrorKm);
candidateIndex = find(abs(depthErrorKm - minimumError) < 1e-12);
[~, positiveTie] = max(xKm(candidateIndex));
selectedIndex = candidateIndex(positiveTie);
selectedXKm = xKm(selectedIndex);
selectedDepthKm = surfaceDepthKm(selectedIndex);
selectedDopplerHz = surfaceDopplerHz(selectedIndex);

% Continuous same-delay surface solution used by the analytic fold band.
sameDelayRangeKm = hKm + nIce * targetDepthKm;
sameDelayXKm = sqrt(max(sameDelayRangeKm^2 - hKm^2, 0));
sameDelaySinTheta = sameDelayXKm / sameDelayRangeKm;
sameDelayDopplerHz = (2 * vKmS * 1000 / lambdaM) * sameDelaySinTheta;

basePrfHz = 4 * selectedDopplerHz;
foldPrfHz = selectedDopplerHz;
dopplerBinWidthHz = basePrfHz / traceCount;
dopplerToleranceHz = dopplerBinWidthHz / 2;
depthBinWidthKm = maxDepthKm / (depthBins - 1);
depthToleranceKm = depthBinWidthKm / 2;
sliderHalfWindowHz = max(28, 0.55 * dopplerToleranceHz);
sliderLowHz = floor(foldPrfHz - sliderHalfWindowHz);
sliderHighHz = ceil(foldPrfHz + sliderHalfWindowHz);
testPrfHz = [sliderLowHz, foldPrfHz, sliderHighHz];

% PRF-to-depth sweep and three exact browser comparison states.
sweepPrfHz = linspace(sliderLowHz, sliderHighHz, 301);
sweepDepthKm = arrayfun(@(prf) apparentDepthForDoppler(prf, hKm, vKmS, lambdaM, nIce), sweepPrfHz);
stateAliasHz = arrayfun(@(prf) aliasFrequency(selectedDopplerHz, prf), testPrfHz);
stateDepthKm = arrayfun(@(prf) apparentDepthForDoppler(prf, hKm, vKmS, lambdaM, nIce), testPrfHz);
stateMinDepthKm = arrayfun(@(prf) apparentDepthForDoppler(max(0, prf - dopplerToleranceHz), hKm, vKmS, lambdaM, nIce), testPrfHz);
stateMaxDepthKm = arrayfun(@(prf) apparentDepthForDoppler(prf + dopplerToleranceHz, hKm, vKmS, lambdaM, nIce), testPrfHz);

% Single-tone FFT check. The test reproduces keeping all, every second, and
% every fourth trace. No anti-alias filter is applied because the experiment
% intentionally demonstrates the alias created by sample deletion.
caseLabel = ["all traces", "every 2nd", "every 4th tuned", "every 4th non-tuned"]';
step = [1, 2, 4, 4]';
sourcePrfHz = [basePrfHz, basePrfHz, basePrfHz, 0.93 * basePrfHz]';
effectivePrfHz = sourcePrfHz ./ step;
expectedAliasHz = arrayfun(@(prf) aliasFrequency(selectedDopplerHz, prf), effectivePrfHz);
measuredPeakHz = zeros(size(step));
fftBinHz = zeros(size(step));
toneSpectra = cell(size(step));
toneFrequencyAxes = cell(size(step));
for k = 1:numel(step)
    fullTraceIndex = 0:(traceCount - 1);
    fullTone = exp(1i * 2 * pi * selectedDopplerHz * fullTraceIndex / sourcePrfHz(k));
    keptTone = fullTone(1:step(k):end);
    sampleCount = numel(keptTone);
    spectrum = fftshift(fft(keptTone));
    frequencyHz = (-sampleCount/2:(sampleCount/2 - 1)) * effectivePrfHz(k) / sampleCount;
    [~, peakIndex] = max(abs(spectrum));
    measuredPeakHz(k) = frequencyHz(peakIndex);
    fftBinHz(k) = effectivePrfHz(k) / sampleCount;
    toneSpectra{k} = abs(spectrum) / sampleCount;
    toneFrequencyAxes{k} = frequencyHz;
end

% Build the same local constant-Doppler complex trace matrix used by the
% browser processing check, then compare the DC reconstruction before and
% after the intentionally tuned every-fourth trace deletion.
depthAxisKm = linspace(0, maxDepthKm, depthBins)';
rawMatrix = buildTraceMatrix(depthAxisKm, xKm, surfaceDepthKm, surfaceDopplerHz, ...
    selectedIndex, selectedXKm, selectedDopplerHz, targetDepthKm, basePrfHz, traceCount);
allSpectrum = fft(rawMatrix, [], 2);
everyFourMatrix = rawMatrix(:, 1:4:end);
everyFourSpectrum = fft(everyFourMatrix, [], 2);
allDcOnly = zeros(size(allSpectrum));
allDcOnly(:, 1) = allSpectrum(:, 1);
fourDcOnly = zeros(size(everyFourSpectrum));
fourDcOnly(:, 1) = everyFourSpectrum(:, 1);
allReconstruction = abs(ifft(allDcOnly, [], 2));
fourReconstruction = abs(ifft(fourDcOnly, [], 2));
allDcProfile = mean(allReconstruction, 2);
fourDcProfile = mean(fourReconstruction, 2);
[~, targetBin] = min(abs(depthAxisKm - targetDepthKm));
dcGainAtTarget = fourDcProfile(targetBin) / max(allDcProfile(targetBin), eps);

targetEchoUs = 2 * (hKm * 1000 + nIce * targetDepthKm * 1000) / c * 1e6;
basePriUs = 1e6 / basePrfHz;
simpleSafePrfHz = 1e6 / (targetEchoUs + listenMarginUs);

% Machine-readable validation summary.
metric = [
    "wavelength_m"
    "continuous_same_delay_x_km"
    "continuous_same_delay_doppler_hz"
    "selected_discrete_x_km"
    "selected_discrete_depth_km"
    "selected_discrete_doppler_hz"
    "selected_depth_error_km"
    "selected_doppler_error_hz"
    "base_prf_hz"
    "instrument_prf_max_hz"
    "base_prf_below_instrument_max"
    "target_echo_us"
    "base_pri_us"
    "simple_safe_prf_hz"
    "base_prf_simple_timing_safe"
    "doppler_bin_width_hz"
    "doppler_half_bin_tolerance_hz"
    "depth_bin_width_km"
    "depth_half_bin_tolerance_km"
    "tuned_alias_hz"
    "tuned_fold_depth_km"
    "fft_all_peak_error_hz"
    "fft_every2_peak_error_hz"
    "fft_every4_peak_error_hz"
    "fft_nontuned_peak_error_hz"
    "every4_to_all_dc_gain_at_target"
    ];
value = [
    lambdaM
    sameDelayXKm
    sameDelayDopplerHz
    selectedXKm
    selectedDepthKm
    selectedDopplerHz
    abs(selectedDepthKm - targetDepthKm)
    abs(selectedDopplerHz - sameDelayDopplerHz)
    basePrfHz
    instrumentPrfMaxHz
    double(basePrfHz <= instrumentPrfMaxHz)
    targetEchoUs
    basePriUs
    simpleSafePrfHz
    double(basePrfHz <= simpleSafePrfHz)
    dopplerBinWidthHz
    dopplerToleranceHz
    depthBinWidthKm
    depthToleranceKm
    abs(aliasFrequency(selectedDopplerHz, foldPrfHz))
    apparentDepthForDoppler(foldPrfHz, hKm, vKmS, lambdaM, nIce)
    abs(measuredPeakHz(1) - expectedAliasHz(1))
    abs(measuredPeakHz(2) - expectedAliasHz(2))
    abs(measuredPeakHz(3) - expectedAliasHz(3))
    abs(measuredPeakHz(4) - expectedAliasHz(4))
    dcGainAtTarget
    ];

validation = table(metric, value);
writetable(validation, fullfile(outDir, "aliasing_matlab_validation.csv"));

states = table(testPrfHz', stateAliasHz', stateDepthKm', stateMinDepthKm', stateMaxDepthKm', ...
    'VariableNames', {'prf_hz', 'selected_alias_hz', 'fold_center_depth_km', 'fold_min_depth_km', 'fold_max_depth_km'});
writetable(states, fullfile(outDir, "aliasing_matlab_prf_states.csv"));

fftCases = table(caseLabel, step, sourcePrfHz, effectivePrfHz, expectedAliasHz, measuredPeakHz, fftBinHz);
writetable(fftCases, fullfile(outDir, "aliasing_matlab_fft_cases.csv"));

save(fullfile(outDir, "aliasing_matlab_validation.mat"), "validation", "states", "fftCases", ...
    "rawMatrix", "depthAxisKm", "allDcProfile", "fourDcProfile");

% Control-range sweep: every continuous same-delay solution must fold back to
% its requested target depth. Discrete 12-point mismatch and PRF/timing flags
% are reported rather than hidden, because those are physical limitations of
% a selected control setting rather than numerical failures.
speedGridKmS = [1.5, 2.5, 6.0];
altitudeGridKm = [10, 25, 60];
targetGridKm = [2.0, 6.74, 12.0];
gridRows = [];
for gridSpeed = speedGridKmS
    for gridAltitude = altitudeGridKm
        for gridTargetDepth = targetGridKm
            gridRangeKm = gridAltitude + nIce * gridTargetDepth;
            gridXKm = sqrt(max(gridRangeKm^2 - gridAltitude^2, 0));
            gridDopplerHz = (2 * gridSpeed * 1000 / lambdaM) * (gridXKm / gridRangeKm);
            gridFoldDepthKm = apparentDepthForDoppler(gridDopplerHz, gridAltitude, gridSpeed, lambdaM, nIce);
            gridPointXKm = linspace(-spreadKm, spreadKm, pointCount);
            gridPointRangeKm = hypot(gridAltitude, gridPointXKm);
            gridPointDepthKm = (gridPointRangeKm - gridAltitude) / nIce;
            [gridDiscreteErrorKm, gridPointIndex] = min(abs(gridPointDepthKm - gridTargetDepth));
            if gridPointXKm(gridPointIndex) < 0
                mirrorIndex = pointCount + 1 - gridPointIndex;
                if abs(gridPointDepthKm(mirrorIndex) - gridTargetDepth) <= gridDiscreteErrorKm + 1e-12
                    gridPointIndex = mirrorIndex;
                end
            end
            gridPointDopplerHz = (2 * gridSpeed * 1000 / lambdaM) ...
                * (gridPointXKm(gridPointIndex) / gridPointRangeKm(gridPointIndex));
            gridBasePrfHz = 4 * abs(gridPointDopplerHz);
            gridEchoUs = 2 * (gridAltitude * 1000 + nIce * gridTargetDepth * 1000) / c * 1e6;
            gridSimpleLimitHz = 1e6 / (gridEchoUs + listenMarginUs);
            gridRows = [gridRows; gridSpeed, gridAltitude, gridTargetDepth, gridDopplerHz, ... %#ok<AGROW>
                gridFoldDepthKm, abs(gridFoldDepthKm - gridTargetDepth), gridDiscreteErrorKm, ...
                gridBasePrfHz, double(gridBasePrfHz <= instrumentPrfMaxHz), ...
                double(gridBasePrfHz <= gridSimpleLimitHz)];
        end
    end
end
controlSweep = array2table(gridRows, 'VariableNames', {
    'speed_km_s', 'altitude_km', 'target_depth_km', 'continuous_fold_prf_hz', ...
    'recovered_fold_depth_km', 'continuous_depth_error_km', 'nearest_discrete_depth_error_km', ...
    'constructed_base_prf_hz', 'base_prf_within_published_range', 'base_prf_simple_timing_safe'});
writetable(controlSweep, fullfile(outDir, "aliasing_matlab_control_sweep.csv"));
assert(all(controlSweep.continuous_depth_error_km < 1e-10), ...
    'A control-range same-delay solution failed to recover its target depth.');

% Four-panel visual audit generated directly by MATLAB.
fig = figure('Visible', 'off', 'Color', 'w', 'Position', [80 80 1500 980]);
layout = tiledlayout(fig, 2, 2, 'TileSpacing', 'compact', 'Padding', 'compact');
title(layout, 'MATLAB reference: PRF folding and trace deletion');

nexttile;
plot(sweepPrfHz, sweepDepthKm, 'LineWidth', 2); hold on;
yline(targetDepthKm, '--', 'Target depth');
scatter(testPrfHz, stateDepthKm, 50, 'filled');
set(gca, 'YDir', 'reverse'); grid on;
xlabel('Effective Doppler sampling PRF (Hz)'); ylabel('Apparent fold depth (km)');
title('Analytic zero-Doppler fold depth');

nexttile; hold on;
for k = 1:numel(step)
    plot(toneFrequencyAxes{k}, toneSpectra{k}, 'LineWidth', 1.6, 'DisplayName', caseLabel(k));
end
xlim([-800 800]); grid on;
xlabel('Aliased Doppler (Hz)'); ylabel('Normalized FFT magnitude');
title('Single-tone FFT after trace deletion'); legend('Location', 'best');

nexttile;
imagesc(0:(traceCount - 1), depthAxisKm, abs(rawMatrix));
set(gca, 'YDir', 'reverse'); colormap(gca, gray(256));
xlabel('Trace number'); ylabel('Apparent depth (km)');
title('Generated 12-point complex trace matrix'); colorbar;

nexttile; hold on;
plot(allDcProfile, depthAxisKm, 'LineWidth', 1.8, 'DisplayName', 'All traces');
plot(fourDcProfile, depthAxisKm, 'LineWidth', 1.8, 'DisplayName', 'Every 4th trace');
yline(targetDepthKm, '--', 'Target depth');
set(gca, 'YDir', 'reverse'); grid on;
xlabel('Zero-Doppler reconstruction magnitude'); ylabel('Apparent depth (km)');
title('DC-cell reconstruction'); legend('Location', 'best');

exportgraphics(fig, fullfile(outDir, "aliasing_matlab_validation.png"), 'Resolution', 180);
close(fig);

% Fail loudly if the reference model does not satisfy its core invariants.
assert(abs(selectedDepthKm - targetDepthKm) <= depthToleranceKm, ...
    'The selected discrete clutter point is outside one modeled depth bin.');
assert(abs(aliasFrequency(selectedDopplerHz, foldPrfHz)) < 1e-9, ...
    'The tuned PRF does not place the selected clutter tone at zero Doppler.');
assert(all(diff(stateDepthKm) > 0), ...
    'Fold depth must increase monotonically across the selected PRF window.');
assert(basePrfHz <= instrumentPrfMaxHz, ...
    'Constructed base PRF exceeds the published 3 kHz REASON range.');
assert(basePrfHz <= simpleSafePrfHz, ...
    'Constructed base PRF fails the stated simple listening-window check.');
assert(all(abs(measuredPeakHz - expectedAliasHz) <= fftBinHz / 2 + 1e-9), ...
    'A MATLAB FFT peak does not agree with the modulo-PRF alias prediction.');

fprintf('MATLAB validation PASS\n');
fprintf('Selected surface point: x = %.6f km, depth = %.6f km, Doppler = %.6f Hz\n', ...
    selectedXKm, selectedDepthKm, selectedDopplerHz);
fprintf('PRF states: %.1f Hz -> %.3f km, %.3f Hz -> %.3f km, %.1f Hz -> %.3f km\n', ...
    testPrfHz(1), stateDepthKm(1), testPrfHz(2), stateDepthKm(2), testPrfHz(3), stateDepthKm(3));
fprintf('Outputs: %s\n', outDir);

function aliasedHz = aliasFrequency(dopplerHz, prfHz)
    aliasedHz = mod(dopplerHz + prfHz / 2, prfHz) - prfHz / 2;
end

function depthKm = apparentDepthForDoppler(dopplerHz, hKm, vKmS, lambdaM, nIce)
    sinTheta = abs(dopplerHz) * lambdaM / (2 * vKmS * 1000);
    if sinTheta <= 0 || sinTheta >= 1
        depthKm = NaN;
        return;
    end
    rangeKm = hKm / sqrt(1 - sinTheta^2);
    depthKm = (rangeKm - hKm) / nIce;
end

function matrix = buildTraceMatrix(depthAxisKm, xKm, surfaceDepthKm, surfaceDopplerHz, ...
    selectedIndex, selectedXKm, selectedDopplerHz, targetDepthKm, samplePrfHz, traceCount)
    matrix = complex(zeros(numel(depthAxisKm), traceCount));
    for pointIndex = 1:numel(xKm)
        isSelected = pointIndex == selectedIndex;
        isMirror = ~isSelected && abs(surfaceDopplerHz(pointIndex) + selectedDopplerHz) < 2;
        angleWeight = 0.24 + 0.46 * exp(-0.5 * ((abs(xKm(pointIndex)) - abs(selectedXKm)) / 20)^2);
        amplitude = angleWeight;
        if isSelected || isMirror
            amplitude = 1.0;
        end
        phaseOffset = (pointIndex - 1) * 0.71;
        if isSelected
            phaseOffset = 0;
        end
        envelope = exp(-0.5 * ((depthAxisKm - surfaceDepthKm(pointIndex)) / 0.14).^2);
        tracePhase = 2 * pi * (surfaceDopplerHz(pointIndex) / samplePrfHz) * (0:(traceCount - 1)) + phaseOffset;
        matrix = matrix + amplitude * envelope * exp(1i * tracePhase);
    end
    targetEnvelope = exp(-0.5 * ((depthAxisKm - targetDepthKm) / 0.08).^2);
    matrix = matrix + 0.32 * targetEnvelope * ones(1, traceCount);
    [depthIndex, traceIndex] = ndgrid(0:(numel(depthAxisKm) - 1), 0:(traceCount - 1));
    matrix = matrix + 0.012 * sin(0.31 * depthIndex + 0.17 * traceIndex) ...
        + 1i * 0.012 * cos(0.23 * depthIndex - 0.11 * traceIndex);
end
