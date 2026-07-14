% compile_oib_radargram_for_site.m
%
% Rebuild the public radargram image used by docs/radargram.html.
%
% Source:
%   CReSIS / Open Polar Radar, Radar Depth Sounder data products
%   NASA Operation IceBridge 2011 Greenland P-3
%   Data frame: 20110329_01_033
%
% Why this script exists:
%   The website uses a small rendered radargram JPG so GitHub Pages loads fast.
%   This MATLAB script documents how to fetch the public source product and
%   export the exact lightweight image asset used by the browser demo.
%
% Boundary:
%   The red PRF-folding overlays in the website are synthetic teaching overlays.
%   They are not measured artifacts in this Greenland radargram.

clear; clc;

sourceImageUrl = [
  "https://data.cresis.ku.edu/data/rds/2011_Greenland_P3/images/" + ...
  "20110329_01/20110329_01_033_1echo.jpg"
];

% Optional raw-style MATLAB product from the same CReSIS example family.
% This file is much larger than the rendered JPG, so the website does not
% store it. Uncomment if you want to inspect the MATLAB variables directly.
% sourceMatUrl = [
%   "https://data.cresis.ku.edu/data/rds/OIB_internal_layer_example/" + ...
%   "2011_Greenland_P3/20110329_01/" + ...
%   "Data_20110329_01_033_wf_1_adc_13_block_13.mat"
% ];
% matFile = fullfile(tempdir, "Data_20110329_01_033_wf_1_adc_13_block_13.mat");
% websave(matFile, sourceMatUrl);
% radarData = load(matFile);
% disp(fieldnames(radarData));

outDir = fullfile(fileparts(mfilename("fullpath")), "..", "docs", "assets");
if ~exist(outDir, "dir")
  mkdir(outDir);
end

tmpImage = fullfile(tempdir, "oib_20110329_01_033_1echo_source.jpg");
outImage = fullfile(outDir, "oib_20110329_01_033_1echo.jpg");

fprintf("Downloading source radargram image...\n");
websave(tmpImage, sourceImageUrl);

I = imread(tmpImage);

% Keep the full CReSIS figure, including the depth/distance axes, because the
% browser overlay uses those axes as the visual reference.
imwrite(I, outImage, "jpg", "Quality", 92);

fprintf("Wrote %s\n", outImage);
fprintf("Image size: %d columns x %d rows\n", size(I, 2), size(I, 1));

figure("Color", "w");
imshow(I);
title("CReSIS / Operation IceBridge radargram: 20110329\_01\_033", "Interpreter", "none");
