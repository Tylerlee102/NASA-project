% generate_fake_radargram_assets.m
%
% Create lightweight, fake radargram textures for the teaching website.
%
% These are not measured NASA radargrams. They are synthetic image backdrops
% that make the browser demos look more like radar data: speckle, weak
% horizontal reflectors, trace-to-trace striping, and a bright target-like echo.
% The browser still computes and draws the moving PRF-fold blur overlay live.

clear; clc;
rng(42);

scriptDir = fileparts(mfilename("fullpath"));
outDir = fullfile(scriptDir, "..", "docs", "assets");
if ~exist(outDir, "dir")
  mkdir(outDir);
end

aliasingTexture = radargramTexture(380, 1200, "aliasing");
flybyTexture = radargramTexture(430, 1200, "flyby");

aliasingOut = fullfile(outDir, "fake_radargram_aliasing_texture.png");
flybyOut = fullfile(outDir, "fake_radargram_flyby_texture.png");

imwrite(aliasingTexture, aliasingOut);
imwrite(flybyTexture, flybyOut);

fprintf("Wrote %s\n", aliasingOut);
fprintf("Wrote %s\n", flybyOut);

function rgb = radargramTexture(rows, cols, mode)
  [x, y] = meshgrid(linspace(0, 1, cols), linspace(0, 1, rows));

  speckle = 0.035 * randn(rows, cols);
  lowFreq = smooth2(randn(rows, cols), 19);
  fineFreq = smooth2(randn(rows, cols), 5);
  traceStripe = 0.018 * sin(2 * pi * x * cols / 11) + 0.010 * sin(2 * pi * x * cols / 31);

  power = 0.44 + speckle + 0.060 * lowFreq + 0.030 * fineFreq + traceStripe;

  if mode == "aliasing"
    layers = [
      0.12, 0.018, 0.14;
      0.32, 0.015, 0.12;
      0.50, 0.020, 0.20;
      0.61, 0.025, 0.24;
      0.86, 0.018, 0.10
    ];
    targetY = 0.55;
    targetX = 0.50;
    power = power + targetEcho(x, y, targetX, targetY, 0.030, 0.020, 0.50);
  else
    layers = [
      0.11, 0.018, 0.12;
      0.29, 0.014, 0.10;
      0.47, 0.022, 0.18;
      0.63, 0.020, 0.16;
      0.80, 0.018, 0.10
    ];
    targetCurve = 0.47 + 0.24 * (2 * x - 1).^2;
    power = power + 0.20 * exp(-((y - targetCurve).^2) / (2 * 0.006^2));
    power = power + targetEcho(x, y, 0.50, 0.47, 0.025, 0.019, 0.55);
  end

  for k = 1:size(layers, 1)
    y0 = layers(k, 1);
    width = layers(k, 2);
    amp = layers(k, 3);
    waviness = 0.010 * sin(2 * pi * (x * (1.2 + 0.25 * k) + 0.13 * k));
    layer = exp(-((y - (y0 + waviness)).^2) / (2 * width^2));
    power = power + amp * layer .* (0.78 + 0.22 * smooth2(rand(rows, cols), 7));
  end

  % A weak surface return and mild attenuation with depth.
  surface = 0.22 * exp(-((y - 0.035).^2) / (2 * 0.010^2));
  power = power + surface;
  power = power .* (1.02 - 0.32 * y);

  power = max(0, min(1, power));
  power = power .^ 0.72;

  % Warm grayscale radargram palette: dark brown signal on a light paper field.
  paper = cat(3, 0.985 * ones(rows, cols), 0.965 * ones(rows, cols), 0.905 * ones(rows, cols));
  echo = cat(3, 0.250 * ones(rows, cols), 0.185 * ones(rows, cols), 0.125 * ones(rows, cols));
  rgb = paper .* (1 - power) + echo .* power;

  % A faint teal target response baked into the fake texture.
  if mode == "aliasing"
    teal = targetEcho(x, y, 0.50, 0.55, 0.045, 0.018, 1.0);
  else
    teal = targetEcho(x, y, 0.50, 0.47, 0.045, 0.018, 1.0);
  end
  tealColor = cat(3, 0.075 * ones(rows, cols), 0.315 * ones(rows, cols), 0.330 * ones(rows, cols));
  rgb = rgb .* (1 - 0.28 * teal) + tealColor .* (0.28 * teal);
  rgb = max(0, min(1, rgb));
end

function echo = targetEcho(x, y, x0, y0, sx, sy, amp)
  echo = amp * exp(-((x - x0).^2) / (2 * sx^2) - ((y - y0).^2) / (2 * sy^2));
end

function out = smooth2(img, radius)
  radius = max(1, round(radius));
  t = -radius:radius;
  sigma = max(1, radius / 2.5);
  kernel = exp(-(t .^ 2) / (2 * sigma ^ 2));
  kernel = kernel / sum(kernel);
  out = conv2(conv2(img, kernel, "same"), kernel', "same");
end
