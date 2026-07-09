% GENERATE_MATLAB_REFERENCE_OUTPUTS Build small fixtures for web parity tests.
%
% Run from the repository root:
%   /Applications/MATLAB_R2026a.app/bin/matlab -batch "run('scripts/generate_matlab_reference_outputs.m')"

clearvars;

rootDir = fileparts(fileparts(mfilename('fullpath')));
datasetPath = fullfile(rootDir, 'dataset', 'impulseResponses.mat');
outDir = fullfile(rootDir, 'tests', 'fixtures', 'matlab');
if ~isfolder(outDir)
    mkdir(outDir);
end

loaded = load(datasetPath, 'dataTable');
dataTable = loaded.dataTable;

fs = 1300;
model = 1;
location = 7;
frequencyHz = 100;
durationMs = 100;
targetAmplitude = 1;
nSamples = floor(durationMs / 1000 * fs);
t = (0:nSamples - 1) / fs;
stimulus = sin(2 * pi * frequencyHz .* t)';

row = dataTable(dataTable.Model == model & dataTable.Location == location, :);
if height(row) ~= 1
    error('Expected one row for model %d location %d.', model, location);
end
impulseResponses = row.Data{1};

response = zeros(size(impulseResponses, 1) + nSamples - 1, ...
    size(impulseResponses, 2), size(impulseResponses, 3));
for axis = 1:size(impulseResponses, 3)
    response(:, :, axis) = conv2(impulseResponses(:, :, axis), stimulus, 'full');
end

scaleFactor = max(response, [], 'all', 'omitnan');
if scaleFactor == 0
    scaleFactor = 1;
end
response = targetAmplitude * response / scaleFactor;

fixtureName = 'model1_location7_sine100_100ms_response.f32';
fixturePath = fullfile(outDir, fixtureName);
writeFloat32(fixturePath, single(response));

meta = struct();
meta.fixture = fixtureName;
meta.model = model;
meta.location = location;
meta.frequencyHz = frequencyHz;
meta.durationMs = durationMs;
meta.targetAmplitude = targetAmplitude;
meta.sampleRateHz = fs;
meta.stimulusSamples = nSamples;
meta.impulseResponseSamples = size(impulseResponses, 1);
meta.responseShape = size(response);
meta.layout = 'matlab-column-major-time-output-axis';
meta.md5 = md5File(fixturePath);
writeJson(fullfile(outDir, 'model1_location7_sine100_100ms_response.json'), meta);

fprintf('Wrote MATLAB reference fixture %s\n', fixturePath);

function writeFloat32(path, data)
    fid = fopen(path, 'w', 'ieee-le');
    if fid < 0
        error('Failed to open %s for writing.', path);
    end
    cleaner = onCleanup(@() fclose(fid));
    written = fwrite(fid, data(:), 'single');
    if written ~= numel(data)
        error('Expected to write %d values, wrote %d.', numel(data), written);
    end
end

function writeJson(path, value)
    try
        encoded = jsonencode(value, 'PrettyPrint', true);
    catch
        encoded = jsonencode(value);
    end
    fid = fopen(path, 'w');
    if fid < 0
        error('Failed to open %s for writing.', path);
    end
    cleaner = onCleanup(@() fclose(fid));
    fprintf(fid, '%s\n', encoded);
end

function digest = md5File(path)
    quoted = strrep(path, '"', '\"');
    [status, output] = system(sprintf('md5 -q "%s"', quoted));
    if status ~= 0
        error('md5 failed for %s: %s', path, output);
    end
    digest = strtrim(output);
end
