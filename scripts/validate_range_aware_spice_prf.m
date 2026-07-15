function results = validate_range_aware_spice_prf()
%VALIDATE_RANGE_AWARE_SPICE_PRF Independently check the website PRF model.
%   Recomputes the headline fixed/adaptive overlap counts from the checked-in
%   SPICE state artifact, then checks the timing and Doppler conventions with
%   Radar Toolbox and Phased Array System Toolbox functions.

repoRoot = fileparts(fileparts(mfilename('fullpath')));
dataPath = fullfile(repoRoot, 'docs', 'data', 'clipper-flyby.js');
raw = fileread(dataPath);
jsonToken = regexp(raw, '(?s)window\.CLIPPER_SPICE_FLYBY\s*=\s*(\{.*\});\s*$', ...
    'tokens', 'once');
assert(~isempty(jsonToken), 'Could not parse %s.', dataPath);
flyby = jsondecode(jsonToken{1});

model.c = physconst('LightSpeed');
model.frequencyHz = 60e6;
model.lambdaM = model.c / model.frequencyHz;
model.iceIndex = 1.78;
model.targetDepthKm = 6.74;
model.dopplerToleranceHz = 25;
model.depthToleranceKm = 0.15;
model.timeMinS = -10;
model.timeMaxS = 10;
model.radarTickS = 0.01;
model.blockTicks = 10;
model.predictionTicks = 9;
model.candidatePrfsHz = [1150, 1325, 1525, 1725];
model.clutterArcMinKm = -240;
model.clutterArcMaxKm = 240;
model.clutterSearchStepKm = 1;
model.refinementIterations = 10;
model.scoreTieEpsilon = 1e-8;
model.europaMeanRadiusKm = flyby.body.meanRadiusKm;
model.europaRadiiKm = reshape(flyby.body.radiiKm, 1, []);
model.radialBasis = normalizeRow(flyby.localBasis.radial);
model.alongTrackBasis = normalizeRow(flyby.localBasis.alongTrack);

sampleTimesS = reshape([flyby.samples.offsetSeconds], [], 1);
samplePositionsKm = reshape([flyby.samples.positionKm], 3, []).';
sampleVelocitiesKmS = reshape([flyby.samples.velocityKmS], 3, []).';
tickTimesS = (model.timeMinS:model.radarTickS:model.timeMaxS).';
positionsKm = interp1(sampleTimesS, samplePositionsKm, tickTimesS, 'linear');
velocitiesKmS = interp1(sampleTimesS, sampleVelocitiesKmS, tickTimesS, 'linear');

targetSurfaceRadiusKm = ellipsoidRadius(model.radialBasis, model.europaRadiiKm);
targetSurfacePositionKm = model.radialBasis * targetSurfaceRadiusKm;
targetPhysicalPositionKm = model.radialBasis * ...
    (targetSurfaceRadiusKm - model.targetDepthKm);
targetSurfaceNormal = normalizeRow(targetSurfacePositionKm ./ model.europaRadiiKm.^2);

clutterArcsKm = (model.clutterArcMinKm:model.clutterSearchStepKm: ...
    model.clutterArcMaxKm).';
clutterDirections = surfaceDirections(clutterArcsKm, model);
clutterRadiiKm = ellipsoidRadius(clutterDirections, model.europaRadiiKm);
clutterPositionsKm = clutterDirections .* clutterRadiiKm;

tickCount = numel(tickTimesS);
arcCount = numel(clutterArcsKm);
surfaceRangesKm = zeros(tickCount, arcCount);
surfaceDopplerHz = zeros(tickCount, arcCount);
targetRangesKm = zeros(tickCount, 1);
targetDopplerHz = zeros(tickCount, 1);
targetApparentDepthKm = zeros(tickCount, 1);
ellipsoidAltitudesKm = zeros(tickCount, 1);
meanSphereAltitudesKm = zeros(tickCount, 1);

for tickIndex = 1:tickCount
    positionKm = positionsKm(tickIndex, :);
    velocityKmS = velocitiesKmS(tickIndex, :);
    centerDistanceKm = norm(positionKm);
    radialDirection = positionKm / centerDistanceKm;
    localSurfaceRadiusKm = ellipsoidRadius(radialDirection, model.europaRadiiKm);
    altitudeKm = centerDistanceKm - localSurfaceRadiusKm;
    ellipsoidAltitudesKm(tickIndex) = altitudeKm;
    meanSphereAltitudesKm(tickIndex) = centerDistanceKm - model.europaMeanRadiusKm;

    [targetRangeKm, targetRangeRateKmS] = targetMeasurement(positionKm, ...
        velocityKmS, targetPhysicalPositionKm, targetSurfaceNormal, model);
    targetRangesKm(tickIndex) = targetRangeKm;
    targetDopplerHz(tickIndex) = -2 * targetRangeRateKmS * 1000 / model.lambdaM;
    targetApparentDepthKm(tickIndex) = (targetRangeKm - altitudeKm) / model.iceIndex;

    lineOfSightKm = clutterPositionsKm - positionKm;
    rangesKm = vecnorm(lineOfSightKm, 2, 2);
    rangeRatesKmS = -sum(lineOfSightKm .* velocityKmS, 2) ./ rangesKm;
    surfaceRangesKm(tickIndex, :) = rangesKm.';
    surfaceDopplerHz(tickIndex, :) = ...
        (-2 * rangeRatesKmS * 1000 / model.lambdaM).';
end

closestTick = find(abs(tickTimesS) < 1e-12, 1);
sameDelayArcKm = solveSameDelayArc(positionsKm(closestTick, :), ...
    targetRangesKm(closestTick), model);
pointArcsKm = linspace(-sameDelayArcKm * 11 / 5, sameDelayArcKm * 11 / 5, 12).';
[pointRangesKm, pointDopplerHz] = measureSurfaceArcs(pointArcsKm, ...
    positionsKm(closestTick, :), velocitiesKmS(closestTick, :), model);
pointApparentDepthKm = ...
    (pointRangesKm - ellipsoidAltitudesKm(closestTick)) / model.iceIndex;
[~, nearestOrder] = sort(abs(pointApparentDepthKm - targetApparentDepthKm(closestTick)));
foldingPair = nearestOrder(1:2);
fixedBadPrfHz = mean(abs(pointDopplerHz(foldingPair) - targetDopplerHz(closestTick)));

allPrfsHz = [model.candidatePrfsHz, fixedBadPrfHz];
scoreByPrf = zeros(tickCount, numel(allPrfsHz));
overlapByPrf = false(tickCount, numel(allPrfsHz));
for tickIndex = 1:tickCount
    for prfIndex = 1:numel(allPrfsHz)
        score = minimumThreatScore(tickIndex, allPrfsHz(prfIndex), ...
            positionsKm, velocitiesKmS, surfaceRangesKm, surfaceDopplerHz, ...
            targetRangesKm, targetDopplerHz, clutterArcsKm, model);
        scoreByPrf(tickIndex, prfIndex) = score;
        overlapByPrf(tickIndex, prfIndex) = score <= 1 + model.scoreTieEpsilon;
    end
end

blockCount = round((model.timeMaxS - model.timeMinS) / ...
    (model.radarTickS * model.blockTicks));
selectedIndexes = zeros(blockCount, 1);
selectedPrfsHz = zeros(blockCount, 1);
previousSelectedIndex = 0;
for blockIndex = 1:blockCount
    startTickIndex = (blockIndex - 1) * model.blockTicks + 1;
    predictionIndexes = startTickIndex + (1:model.predictionTicks);
    minimumScores = min(scoreByPrf(predictionIndexes, 1:4), [], 1);
    overlapTicks = sum(overlapByPrf(predictionIndexes, 1:4), 1);
    fewestOverlaps = min(overlapTicks);
    eligible = find(overlapTicks == fewestOverlaps);
    bestScore = max(minimumScores(eligible));
    tied = eligible(abs(minimumScores(eligible) - bestScore) <= model.scoreTieEpsilon);
    if any(tied == previousSelectedIndex)
        selectedIndex = previousSelectedIndex;
    else
        selectedIndex = tied(1);
    end
    selectedIndexes(blockIndex) = selectedIndex;
    selectedPrfsHz(blockIndex) = model.candidatePrfsHz(selectedIndex);
    previousSelectedIndex = selectedIndex;
end

adaptiveOverlapTicks = 0;
for tickIndex = 1:tickCount
    blockIndex = min(blockCount, floor((tickIndex - 1) / model.blockTicks) + 1);
    adaptiveOverlapTicks = adaptiveOverlapTicks + ...
        overlapByPrf(tickIndex, selectedIndexes(blockIndex));
end
fixedOverlapTicks = sum(overlapByPrf(:, 5));
candidateBlockCounts = arrayfun(@(index) sum(selectedIndexes == index), 1:4);
switchCount = sum(diff(selectedIndexes) ~= 0);

unambiguousRangesKm = model.c ./ (2 * model.candidatePrfsHz) / 1000;
commonSampleRateHz = 11153850;
samplesPerPri = commonSampleRateHz ./ model.candidatePrfsHz;
assert(all(abs(samplesPerPri - round(samplesPerPri)) < eps(commonSampleRateHz)));
waveformSampleCounts = zeros(1, 4);
for prfIndex = 1:4
    waveform = phased.LinearFMWaveform( ...
        'SampleRate', commonSampleRateHz, ...
        'PulseWidth', 200 / commonSampleRateHz, ...
        'PRF', model.candidatePrfsHz(prfIndex), ...
        'SweepBandwidth', 1e6, ...
        'OutputFormat', 'Pulses', ...
        'NumPulses', 1);
    pulse = waveform();
    waveformSampleCounts(prfIndex) = numel(pulse);
    release(waveform);
end

testRangeRateKmS = -0.723456;
formulaDopplerHz = -2 * testRangeRateKmS * 1000 / model.lambdaM;
toolboxDopplerHz = 2 * speed2dop(-testRangeRateKmS * 1000, model.lambdaM);
dopplerConventionErrorHz = abs(formulaDopplerHz - toolboxDopplerHz);
rangeRoundTripErrorM = max(abs(time2range(range2time( ...
    unambiguousRangesKm * 1000, model.c), model.c) - unambiguousRangesKm * 1000));

results = struct( ...
    'fixedBadPrfHz', fixedBadPrfHz, ...
    'fixedOverlapTicks', fixedOverlapTicks, ...
    'adaptiveOverlapTicks', adaptiveOverlapTicks, ...
    'tickCount', tickCount, ...
    'candidateBlockCounts', candidateBlockCounts, ...
    'switchCount', switchCount, ...
    'meanSphereClosestAltitudeKm', meanSphereAltitudesKm(closestTick), ...
    'ellipsoidClosestAltitudeKm', ellipsoidAltitudesKm(closestTick), ...
    'altitudeCorrectionKm', ellipsoidAltitudesKm(closestTick) - ...
        meanSphereAltitudesKm(closestTick), ...
    'unambiguousRangesKm', unambiguousRangesKm, ...
    'commonSampleRateHz', commonSampleRateHz, ...
    'samplesPerPri', samplesPerPri, ...
    'waveformSampleCounts', waveformSampleCounts, ...
    'dopplerConventionErrorHz', dopplerConventionErrorHz, ...
    'rangeRoundTripErrorM', rangeRoundTripErrorM);

assert(abs(results.fixedBadPrfHz - 1401.117927) < 1e-3);
assert(results.fixedOverlapTicks == 175);
assert(results.adaptiveOverlapTicks == 0);
assert(isequal(results.candidateBlockCounts, [12, 96, 15, 77]));
assert(results.switchCount == 10);
assert(abs(results.ellipsoidClosestAltitudeKm - 24.999888) < 1e-5);
assert(results.dopplerConventionErrorHz < 1e-10);
assert(results.rangeRoundTripErrorM < 1e-9);
assert(isequal(results.waveformSampleCounts, round(results.samplesPerPri)));

fprintf('%s\n', jsonencode(results, PrettyPrint=true));
end

function directions = surfaceDirections(arcsKm, model)
angles = arcsKm / model.europaMeanRadiusKm;
directions = cos(angles) .* model.radialBasis + ...
    sin(angles) .* model.alongTrackBasis;
directions = directions ./ vecnorm(directions, 2, 2);
end

function radiusKm = ellipsoidRadius(direction, radiiKm)
radiusKm = 1 ./ sqrt(sum((direction ./ radiiKm).^2, 2));
end

function row = normalizeRow(row)
row = reshape(row, 1, []);
row = row / norm(row);
end

function wrapped = symmetricWrap(value, period)
wrapped = mod(value + period / 2, period) - period / 2;
end

function [rangeKm, rangeRateKmS] = targetMeasurement(positionKm, velocityKmS, ...
        targetPositionKm, targetSurfaceNormal, model)
opticalRange = @(spacecraftPositionKm) targetOpticalRange(spacecraftPositionKm, ...
    targetPositionKm, targetSurfaceNormal, model);
rangeKm = opticalRange(positionKm);
derivativeStepS = 0.001;
rangeRateKmS = (opticalRange(positionKm + velocityKmS * derivativeStepS) - ...
    opticalRange(positionKm - velocityKmS * derivativeStepS)) / ...
    (2 * derivativeStepS);
end

function opticalRangeKm = targetOpticalRange(positionKm, targetPositionKm, ...
        targetSurfaceNormal, model)
lineFromTargetKm = positionKm - targetPositionKm;
geometricRangeKm = norm(lineFromTargetKm);
lineUnit = lineFromTargetKm / geometricRangeKm;
cosAir = max(0.05, min(1, abs(dot(lineUnit, targetSurfaceNormal))));
sinAir = sqrt(max(0, 1 - cosAir^2));
sinIce = min(0.999999, sinAir / model.iceIndex);
cosIce = sqrt(1 - sinIce^2);
refractiveDelayKm = (model.iceIndex - 1) * model.targetDepthKm / cosIce;
opticalRangeKm = geometricRangeKm + refractiveDelayKm;
end

function [rangesKm, dopplerHz] = measureSurfaceArcs(arcsKm, positionKm, ...
        velocityKmS, model)
directions = surfaceDirections(arcsKm, model);
radiiKm = ellipsoidRadius(directions, model.europaRadiiKm);
surfacePositionsKm = directions .* radiiKm;
lineOfSightKm = surfacePositionsKm - positionKm;
rangesKm = vecnorm(lineOfSightKm, 2, 2);
rangeRatesKmS = -sum(lineOfSightKm .* velocityKmS, 2) ./ rangesKm;
dopplerHz = -2 * rangeRatesKmS * 1000 / model.lambdaM;
end

function sameDelayArcKm = solveSameDelayArc(positionKm, targetRangeKm, model)
lowKm = 0;
highKm = model.clutterArcMaxKm;
for iteration = 1:48
    middleKm = (lowKm + highKm) / 2;
    middleRangeKm = measureSurfaceArcs(middleKm, positionKm, [0, 0, 0], model);
    if middleRangeKm < targetRangeKm
        lowKm = middleKm;
    else
        highKm = middleKm;
    end
end
sameDelayArcKm = (lowKm + highKm) / 2;
end

function score = minimumThreatScore(tickIndex, prfHz, positionsKm, ...
        velocitiesKmS, surfaceRangesKm, surfaceDopplerHz, targetRangesKm, ...
        targetDopplerHz, clutterArcsKm, model)
unambiguousRangeKm = model.c / (2 * prfHz) / 1000;
aliasHz = symmetricWrap(surfaceDopplerHz(tickIndex, :) - ...
    targetDopplerHz(tickIndex), prfHz);
rangeAliasKm = symmetricWrap(surfaceRangesKm(tickIndex, :) - ...
    targetRangesKm(tickIndex), unambiguousRangeKm);
scores = max(abs(aliasHz) / model.dopplerToleranceHz, ...
    abs(rangeAliasKm / model.iceIndex) / model.depthToleranceKm);
score = min(scores);

leftScores = [Inf, scores(1:end-1)];
rightScores = [scores(2:end), Inf];
localMinimumIndexes = find(scores <= leftScores & scores <= rightScores);
for index = localMinimumIndexes
    lowKm = max(model.clutterArcMinKm, ...
        clutterArcsKm(index) - model.clutterSearchStepKm);
    highKm = min(model.clutterArcMaxKm, ...
        clutterArcsKm(index) + model.clutterSearchStepKm);
    for iteration = 1:model.refinementIterations
        leftKm = lowKm + (highKm - lowKm) / 3;
        rightKm = highKm - (highKm - lowKm) / 3;
        leftScore = scoreAtArc(leftKm, tickIndex, prfHz, positionsKm, ...
            velocitiesKmS, targetRangesKm, targetDopplerHz, model);
        rightScore = scoreAtArc(rightKm, tickIndex, prfHz, positionsKm, ...
            velocitiesKmS, targetRangesKm, targetDopplerHz, model);
        if leftScore <= rightScore
            highKm = rightKm;
        else
            lowKm = leftKm;
        end
    end
    refinedScore = scoreAtArc((lowKm + highKm) / 2, tickIndex, prfHz, ...
        positionsKm, velocitiesKmS, targetRangesKm, targetDopplerHz, model);
    if refinedScore < score
        score = refinedScore;
    end
end
end

function score = scoreAtArc(arcKm, tickIndex, prfHz, positionsKm, ...
        velocitiesKmS, targetRangesKm, targetDopplerHz, model)
[rangeKm, dopplerHz] = measureSurfaceArcs(arcKm, ...
    positionsKm(tickIndex, :), velocitiesKmS(tickIndex, :), model);
unambiguousRangeKm = model.c / (2 * prfHz) / 1000;
aliasHz = symmetricWrap(dopplerHz - targetDopplerHz(tickIndex), prfHz);
rangeAliasKm = symmetricWrap(rangeKm - targetRangesKm(tickIndex), ...
    unambiguousRangeKm);
score = max(abs(aliasHz) / model.dopplerToleranceHz, ...
    abs(rangeAliasKm / model.iceIndex) / model.depthToleranceKm);
end
