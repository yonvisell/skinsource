% GENERATE_MATLAB_VALIDATION_FIXTURES Build MATLAB fixtures for JS parity tests.
%
% Run from the repository root:
%   /Applications/MATLAB_R2026a.app/bin/matlab -batch "run('scripts/generate_matlab_validation_fixtures.m')"

clearvars;

rootDir = fileparts(fileparts(mfilename('fullpath')));
datasetPath = fullfile(rootDir, 'dataset', 'impulseResponses.mat');
upstreamDir = fullfile(rootDir, 'tmp', 'skinsource-upstream');
outDir = fullfile(rootDir, 'tests', 'fixtures', 'matlab');
if ~isfolder(outDir)
    mkdir(outDir);
end

addpath(fullfile(upstreamDir, 'source', 'visualization'));

loaded = load(datasetPath, 'dataTable');
dataTable = loaded.dataTable;
fs = 1300;

cases = {};

% Case 1: single sinusoid, several displayed quantities.
sineSignal = makeSinusoidSignal(100, 100, fs);
sineResponse = renderReference(dataTable, 1, 7, {sineSignal}, 1);
writeResponseFixture(outDir, 'model1_location7_sine100_100ms_response', sineResponse, struct( ...
    'model', 1, 'locations', 7, 'durationMs', 100, 'sampleRateHz', fs));
selected = [20, 24, 32];
for mode = ["z", "mag", "rms"]
    projected = projectReference(sineResponse, char(mode));
    fixture = sprintf('model1_location7_sine100_100ms_%s_outputs.f32', mode);
    writeFloat32(fullfile(outDir, fixture), single(projected(:, selected)));
    cases{end + 1} = struct( ...
        'id', sprintf('sine_m1_l7_%s', mode), ...
        'kind', 'traces', ...
        'fixture', fixture, ...
        'model', 1, ...
        'locations', 7, ...
        'signal', 'sinusoid', ...
        'frequencyHz', 100, ...
        'durationMs', 100, ...
        'targetAmplitude', 1, ...
        'displayedQuantity', char(mode), ...
        'selectedOutputs', selected, ...
        'shape', size(projected(:, selected)));
end

% Case 2: two-location sinusoid superposition, raw x.
superSignal = makeSinusoidSignal(50, 200, fs);
superResponse = renderReference(dataTable, 3, [8, 13], {superSignal, superSignal}, [1, 1]);
superProjected = projectReference(superResponse, 'x');
superSelected = [19, 21, 24, 32];
superFixture = 'model3_locations8_13_sine200_50ms_x_outputs.f32';
writeFloat32(fullfile(outDir, superFixture), single(superProjected(:, superSelected)));
cases{end + 1} = struct( ...
    'id', 'superposition_m3_l8_l13_x', ...
    'kind', 'traces', ...
    'fixture', superFixture, ...
    'model', 3, ...
    'locations', [8, 13], ...
    'signal', 'sinusoid', ...
    'frequencyHz', 200, ...
    'durationMs', 50, ...
    'targetAmplitude', [1, 1], ...
    'displayedQuantity', 'x', ...
    'selectedOutputs', superSelected, ...
    'shape', size(superProjected(:, superSelected)));

% Case 3: multi-location taps, magnitude.
tapSignal = makeTapSignal(100, 12, fs);
tapResponse = renderReference(dataTable, 3, [7, 8, 9, 10], ...
    {tapSignal, tapSignal, tapSignal, tapSignal}, [1, 1, 1, 1]);
tapProjected = projectReference(tapResponse, 'mag');
tapSelected = [20, 21, 22, 24];
tapFixture = 'model3_locations7_8_9_10_taps_100ms_mag_outputs.f32';
writeFloat32(fullfile(outDir, tapFixture), single(tapProjected(:, tapSelected)));
cases{end + 1} = struct( ...
    'id', 'taps_m3_l7_l8_l9_l10_mag', ...
    'kind', 'traces', ...
    'fixture', tapFixture, ...
    'model', 3, ...
    'locations', [7, 8, 9, 10], ...
    'signal', 'tap', ...
    'tapTimeMs', 12, ...
    'durationMs', 100, ...
    'targetAmplitude', [1, 1, 1, 1], ...
    'displayedQuantity', 'mag', ...
    'selectedOutputs', tapSelected, ...
    'shape', size(tapProjected(:, tapSelected)));

% Case 4: deterministic noise signal fixture plus one-sided spectra.
noiseSignal = deterministicNoise(1000);
noiseResponse = renderReference(dataTable, 2, 5, {noiseSignal}, 1);
noiseProjected = projectReference(noiseResponse, 'x');
noiseSelected = [1, 6, 8, 9, 48, 49, 72];
[frequencies, spectra] = selectedSpectra(noiseProjected(:, noiseSelected), fs);
noiseSignalFixture = 'noise_signal_1000_samples.f32';
noiseSpectrumFixture = 'model2_location5_noise1000_x_spectra.f32';
noiseFrequencyFixture = 'model2_location5_noise1000_x_frequencies.f32';
writeFloat32(fullfile(outDir, noiseSignalFixture), single(noiseSignal));
writeFloat32(fullfile(outDir, noiseSpectrumFixture), single(spectra));
writeFloat32(fullfile(outDir, noiseFrequencyFixture), single(frequencies));
cases{end + 1} = struct( ...
    'id', 'noise_m2_l5_x_spectra', ...
    'kind', 'spectra', ...
    'fixture', noiseSpectrumFixture, ...
    'frequencyFixture', noiseFrequencyFixture, ...
    'signalFixture', noiseSignalFixture, ...
    'model', 2, ...
    'locations', 5, ...
    'signal', 'fixture', ...
    'durationSamples', numel(noiseSignal), ...
    'targetAmplitude', 1, ...
    'displayedQuantity', 'x', ...
    'selectedOutputs', noiseSelected, ...
    'shape', size(spectra), ...
    'fftLength', (numel(frequencies) - 1) * 2);

% Case 5: direct MATLAB surface interpolation for browser sparse-operator parity.
projectedMag = projectReference(sineResponse, 'mag');
rmsDb = dbRelativeToMax(sqrt(mean(projectedMag.^2, 1)));
[surfaceField, interpMeta] = directSurfaceInterpolation(upstreamDir, 1, rmsDb);
surfaceFixture = 'model1_location7_sine100_100ms_mag_interpolated_surface.f32';
writeFloat32(fullfile(outDir, surfaceFixture), single(surfaceField));
cases{end + 1} = struct( ...
    'id', 'sine_m1_l7_mag_interpolated_surface', ...
    'kind', 'interpolation', ...
    'fixture', surfaceFixture, ...
    'model', 1, ...
    'sourceCase', 'sine_m1_l7_mag', ...
    'width', interpMeta.width, ...
    'height', interpMeta.height, ...
    'displayedQuantity', 'mag');

manifest = struct();
manifest.schemaVersion = 1;
manifest.generatedAt = char(datetime('now', 'TimeZone', 'local', 'Format', 'yyyy-MM-dd''T''HH:mm:ssZZZZZ'));
manifest.sampleRateHz = fs;
manifest.cases = cases;
writeJson(fullfile(outDir, 'validation_cases.json'), manifest);

fprintf('Wrote %d MATLAB validation cases to %s\n', numel(cases), outDir);

function response = renderReference(dataTable, model, locations, signals, amplitudes)
    row = dataTable(dataTable.Model == model & dataTable.Location == locations(1), :);
    impulse = row.Data{1};
    response = zeros(size(impulse, 1) + numel(signals{1}) - 1, size(impulse, 2), size(impulse, 3));

    for idx = 1:numel(locations)
        row = dataTable(dataTable.Model == model & dataTable.Location == locations(idx), :);
        if height(row) ~= 1
            error('Expected one row for model %d location %d.', model, locations(idx));
        end
        impulse = row.Data{1};
        contribution = zeros(size(impulse, 1) + numel(signals{idx}) - 1, size(impulse, 2), size(impulse, 3));
        for axis = 1:size(impulse, 3)
            contribution(:, :, axis) = conv2(impulse(:, :, axis), signals{idx}, 'full');
        end
        scaleFactor = max(contribution, [], 'all', 'omitnan');
        if scaleFactor == 0
            scaleFactor = 1;
        end
        response = response + amplitudes(idx) * contribution / scaleFactor;
    end
end

function projected = projectReference(response, mode)
    if strcmp(mode, 'x')
        projected = response(:, :, 1);
    elseif strcmp(mode, 'y')
        projected = response(:, :, 2);
    elseif strcmp(mode, 'z')
        projected = response(:, :, 3);
    elseif strcmp(mode, 'mag')
        projected = sqrt(sum(response.^2, 3));
    elseif strcmp(mode, 'rms')
        projected = zeros(size(response, 1), size(response, 2));
        energies = squeeze(sqrt(mean(response.^2, 1)));
        norms = vecnorm(energies, 2, 2);
        norms(norms == 0) = 1;
        axes = energies ./ norms;
        for output = 1:size(response, 2)
            projected(:, output) = squeeze(response(:, output, :)) * axes(output, :)';
        end
    else
        error('Unsupported displayed quantity %s.', mode);
    end
end

function signal = makeSinusoidSignal(durationMs, frequencyHz, fs)
    nSamples = floor(durationMs / 1000 * fs);
    t = (0:nSamples - 1)' / fs;
    signal = sin(2 * pi * frequencyHz .* t);
end

function signal = makeTapSignal(durationMs, tapTimeMs, fs)
    nSamples = floor(durationMs / 1000 * fs);
    signal = zeros(nSamples, 1);
    tap = zeros(21, 1);
    for idx = 1:numel(tap)
        tap(idx) = 0.5 - 0.5 * cos(2 * pi * (idx - 1) / (numel(tap) - 1));
    end
    center = round(tapTimeMs / 1000 * fs) + 1;
    startIndex = center - floor(numel(tap) / 2);
    for idx = 1:numel(tap)
        sample = startIndex + idx - 1;
        if sample >= 1 && sample <= nSamples
            signal(sample) = tap(idx);
        end
    end
end

function signal = deterministicNoise(samples)
    signal = zeros(samples, 1);
    state = uint32(1);
    for idx = 1:samples
        [u1, state] = lcgNext(state);
        [u2, state] = lcgNext(state);
        u1 = max(realmin, u1);
        signal(idx) = sqrt(-2 * log(u1)) * cos(2 * pi * u2);
    end
    signal = signal ./ max(abs(signal));
end

function [value, state] = lcgNext(state)
    state = uint32(mod(uint64(1664525) * uint64(state) + uint64(1013904223), uint64(2)^32));
    value = double(state) / double(uint64(2)^32);
end

function [frequencies, spectra] = selectedSpectra(traces, fs)
    n = size(traces, 1);
    fftLength = 2^nextpow2(n);
    bins = fftLength / 2 + 1;
    frequencies = ((0:bins - 1)' * fs) / fftLength;
    spectra = zeros(bins, size(traces, 2));
    for output = 1:size(traces, 2)
        values = fft(traces(:, output), fftLength);
        magnitudes = abs(values(1:bins)) / fftLength;
        magnitudes(2:end - 1) = magnitudes(2:end - 1) * 2;
        spectra(:, output) = magnitudes;
    end
end

function values = dbRelativeToMax(values)
    maxValue = max(abs(values), [], 'all', 'omitnan');
    if maxValue == 0
        values(:) = -Inf;
    else
        values = 20 * log10(max(realmin, abs(values) ./ maxValue));
    end
end

function [field, meta] = directSurfaceInterpolation(upstreamDir, model, values)
    handLengthsMm = [175, 165, 185, 165];
    pixelHandLength = 398.1017;
    scaleFactor = handLengthsMm(model) / pixelHandLength;
    visDir = fullfile(upstreamDir, 'source', 'visualization');
    surfaceData = load(fullfile(visDir, 'surface.mat'));
    outputLocationsData = load(fullfile(visDir, 'outputLocations.mat'));
    adjacencyData = load(fullfile(visDir, 'adjacencyMatrix.mat'));
    maskData = load(fullfile(visDir, sprintf('mask%d.mat', model)));

    surface = scale(surfaceData.surface, scaleFactor);
    vertices = surface.Vertices;
    outputLocations = outputLocationsData.outputLocations * scaleFactor;
    adjacencyMatrix = adjacencyData.adjacencyMatrix * scaleFactor;
    [interpX, interpY] = meshgrid(min(vertices(:, 1)):max(vertices(:, 1)), min(vertices(:, 2)):max(vertices(:, 2)));
    field = surfaceinterpolation(values', outputLocations, interpX, interpY, vertices, adjacencyMatrix, logical(maskData.mask), 'natural');
    meta = struct('height', size(field, 1), 'width', size(field, 2));
end

function writeResponseFixture(outDir, stem, response, meta)
    fixture = [stem '.f32'];
    writeFloat32(fullfile(outDir, fixture), single(response));
    meta.fixture = fixture;
    meta.responseShape = size(response);
    meta.layout = 'matlab-column-major-time-output-axis';
    writeJson(fullfile(outDir, [stem '.json']), meta);
end

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
