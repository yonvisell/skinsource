% GENERATE_MATLAB_VISUAL_REFERENCE Create a simple MATLAB reference surface PNG.
%
% Run from the repository root:
%   /Applications/MATLAB_R2026a.app/bin/matlab -batch "run('scripts/generate_matlab_visual_reference.m')"

clearvars;

rootDir = fileparts(fileparts(mfilename('fullpath')));
datasetPath = fullfile(rootDir, 'dataset', 'impulseResponses.mat');
upstreamDir = fullfile(rootDir, 'tmp', 'skinsource-upstream');
outDir = fullfile(rootDir, 'verification', 'matlab');
if ~isfolder(outDir)
    mkdir(outDir);
end

loaded = load(datasetPath, 'dataTable');
dataTable = loaded.dataTable;
visDir = fullfile(upstreamDir, 'source', 'visualization');
outputLocationsData = load(fullfile(visDir, 'outputLocations.mat'));
surfaceData = load(fullfile(visDir, 'surface.mat'));
outputLocations = outputLocationsData.outputLocations;

fs = 1300;
model = 1;
location = 7;
frequencyHz = 100;
durationMs = 250;
nSamples = floor(durationMs / 1000 * fs);
t = (0:nSamples - 1) / fs;
stimulus = sin(2 * pi * frequencyHz .* t)';

row = dataTable(dataTable.Model == model & dataTable.Location == location, :);
impulseResponses = row.Data{1};
response = zeros(size(impulseResponses, 1) + nSamples - 1, ...
    size(impulseResponses, 2), size(impulseResponses, 3));
for axisIdx = 1:size(impulseResponses, 3)
    response(:, :, axisIdx) = conv2(impulseResponses(:, :, axisIdx), stimulus, 'full');
end
scaleFactor = max(response, [], 'all', 'omitnan');
if scaleFactor == 0
    scaleFactor = 1;
end
response = response / scaleFactor;

projected = sqrt(sum(response .^ 2, 3));
rmsValues = squeeze(rms(projected, 1));
rmsDb = 20 * log10(max(realmin, rmsValues ./ max(rmsValues)));

valid = all(~isnan(outputLocations), 2);

fig = figure('Visible', 'off', 'Color', [0.06 0.08 0.11], ...
    'Position', [100 100 900 1200]);
ax = axes(fig);
hold(ax, 'on');
if isfield(surfaceData, 'surface') && isa(surfaceData.surface, 'polyshape')
    plot(ax, surfaceData.surface, 'FaceColor', 'none', ...
        'EdgeColor', [0.55 0.60 0.68], 'LineWidth', 1.5);
end
scatter(ax, outputLocations(valid, 1), outputLocations(valid, 2), 52, ...
    rmsDb(valid), 'filled', 'MarkerEdgeColor', [0.9 0.95 1]);
scatter(ax, outputLocations(20, 1), outputLocations(20, 2), 120, ...
    rmsDb(20), 'filled', 'MarkerEdgeColor', [1 0.94 0.64], 'LineWidth', 2);
axis(ax, 'equal');
axis(ax, 'off');
colormap(ax, parula);
caxis(ax, [-50 0]);
title(ax, 'MATLAB reference: Model 1, Location 7, 100 Hz, magnitude RMS', ...
    'Color', [0.95 0.96 0.98]);
exportgraphics(fig, fullfile(outDir, 'model1_location7_sine100_surface.png'), ...
    'Resolution', 160);
close(fig);

fprintf('Wrote MATLAB visual reference to %s\n', outDir);
