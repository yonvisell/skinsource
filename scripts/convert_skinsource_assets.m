% CONVERT_SKINSOURCE_ASSETS Convert SkinSource MATLAB data to static web assets.
%
% Run from the repository root:
%   /Applications/MATLAB_R2026a.app/bin/matlab -batch "run('scripts/convert_skinsource_assets.m')"

clearvars;

rootDir = fileparts(fileparts(mfilename('fullpath')));
datasetPath = fullfile(rootDir, 'dataset', 'impulseResponses.mat');
upstreamDir = fullfile(rootDir, 'tmp', 'skinsource-upstream');
outDir = fullfile(rootDir, 'public', 'data');
chunkDir = fullfile(outDir, 'impulse-responses');
referenceDir = fullfile(rootDir, 'public', 'reference');

if ~isfile(datasetPath)
    error('Missing %s. Download the Zenodo dataset before conversion.', datasetPath);
end

if ~isfolder(upstreamDir)
    error('Missing upstream reference checkout at %s.', upstreamDir);
end

if ~isfolder(chunkDir)
    mkdir(chunkDir);
end
if ~isfolder(referenceDir)
    mkdir(referenceDir);
end

fprintf('Loading %s\n', datasetPath);
loaded = load(datasetPath, 'dataTable');
if ~isfield(loaded, 'dataTable')
    error('Expected variable dataTable in %s.', datasetPath);
end
dataTable = loaded.dataTable;

expectedRows = 80;
expectedShape = [522, 72, 3];
sampleRateHz = 1300;
models = 1:4;
locations = 1:20;
handLengthsMm = [175, 165, 185, 165];
pixelHandLength = 398.1017;

if height(dataTable) ~= expectedRows
    error('Expected %d dataTable rows, found %d.', expectedRows, height(dataTable));
end

requiredVariables = {'Data', 'Model', 'Location'};
for idx = 1:numel(requiredVariables)
    if ~ismember(requiredVariables{idx}, dataTable.Properties.VariableNames)
        error('Missing dataTable variable %s.', requiredVariables{idx});
    end
end

chunks = repmat(struct( ...
    'model', 0, ...
    'location', 0, ...
    'path', '', ...
    'dtype', 'float32', ...
    'shape', expectedShape, ...
    'layout', 'matlab-column-major-time-output-axis', ...
    'bytes', 0, ...
    'md5', ''), expectedRows, 1);

chunkIndex = 0;
for model = models
    modelRows = dataTable(dataTable.Model == model, :);
    if height(modelRows) ~= numel(locations)
        error('Model %d expected %d rows, found %d.', model, numel(locations), height(modelRows));
    end

    for location = locations
        row = modelRows(modelRows.Location == location, :);
        if height(row) ~= 1
            error('Model %d location %d expected one row, found %d.', model, location, height(row));
        end

        data = row.Data{1};
        if ~isequal(size(data), expectedShape)
            error('Model %d location %d shape mismatch: [%s].', ...
                model, location, num2str(size(data)));
        end

        chunkIndex = chunkIndex + 1;
        relPath = sprintf('impulse-responses/model-%d-location-%02d.f32', model, location);
        outPath = fullfile(outDir, relPath);
        writeFloat32(outPath, single(data));

        info = dir(outPath);
        chunks(chunkIndex).model = model;
        chunks(chunkIndex).location = location;
        chunks(chunkIndex).path = relPath;
        chunks(chunkIndex).bytes = info.bytes;
        chunks(chunkIndex).md5 = md5File(outPath);
    end
end

fprintf('Converted %d impulse-response chunks.\n', numel(chunks));

visualization = convertVisualizationAssets(upstreamDir, outDir);
visualization.colormap = writeMatlabColormap(outDir);
visualization.inputHandOutlineImage = writeInputHandOutline(upstreamDir, outDir);
copyfile(fullfile(upstreamDir, 'documentation', 'inputLocations.png'), ...
    fullfile(referenceDir, 'inputLocations.png'));
copyfile(fullfile(upstreamDir, 'documentation', 'outputLocations.png'), ...
    fullfile(referenceDir, 'outputLocations.png'));

manifest = struct();
manifest.schemaVersion = 1;
manifest.generatedAt = char(datetime('now', 'TimeZone', 'local', 'Format', 'yyyy-MM-dd''T''HH:mm:ssZZZZZ'));
manifest.source = struct( ...
    'name', 'SkinSource', ...
    'datasetDoi', '10.5281/zenodo.10547601', ...
    'publicationDoi', '10.1109/HAPTICS59260.2024.10520852', ...
    'rawFile', 'dataset/impulseResponses.mat', ...
    'rawFileBytes', dir(datasetPath).bytes, ...
    'rawFileMd5', md5File(datasetPath));
manifest.sampleRateHz = sampleRateHz;
manifest.impulseResponseSamples = expectedShape(1);
manifest.outputLocations = expectedShape(2);
manifest.axes = {'x', 'y', 'z'};
manifest.models = makeModels(models, handLengthsMm, pixelHandLength);
manifest.inputLocations = makeInputLocationMetadata(locations);
manifest.chunks = chunks;
manifest.visualization = visualization;
manifest.layoutNotes = [ ...
    "Each .f32 file stores single(Data(:)) from MATLAB. " + ...
    "For dimensions [time, output, axis], zero-based JS offset is " + ...
    "time + 522 * (output + 72 * axis)." ...
];
manifest.citation = ['Tummala, N., Reardon, G., Fani, S., Goetz, D., ', ...
    'Bianchi, M., and Visell, Y. (2024) SkinSource: A Data-Driven ', ...
    'Toolbox for Predicting Touch-Elicited Vibrations in the Upper Limb. ', ...
    'IEEE Haptics Symposium 2024. DOI: 10.1109/HAPTICS59260.2024.10520852'];

writeJson(fullfile(outDir, 'manifest.json'), manifest);

fprintf('Wrote %s\n', fullfile(outDir, 'manifest.json'));
fprintf('Conversion complete.\n');

function writeFloat32(path, data)
    fid = fopen(path, 'w', 'ieee-le');
    if fid < 0
        error('Failed to open %s for writing.', path);
    end
    cleaner = onCleanup(@() fclose(fid));
    written = fwrite(fid, data(:), 'single');
    if written ~= numel(data)
        error('Expected to write %d values to %s, wrote %d.', numel(data), path, written);
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

function models = makeModels(modelIds, handLengthsMm, pixelHandLength)
    models = repmat(struct( ...
        'id', 0, ...
        'label', '', ...
        'handLengthMm', 0, ...
        'sex', '', ...
        'pixelToMmScale', 0), numel(modelIds), 1);
    sexes = {'M', 'F', 'M', 'F'};
    for idx = 1:numel(modelIds)
        models(idx).id = modelIds(idx);
        models(idx).label = sprintf('Model %d', modelIds(idx));
        models(idx).handLengthMm = handLengthsMm(idx);
        models(idx).sex = sexes{idx};
        models(idx).pixelToMmScale = handLengthsMm(idx) / pixelHandLength;
    end
end

function locations = makeInputLocationMetadata(locationIds)
    locations = repmat(struct( ...
        'id', 0, ...
        'label', '', ...
        'contactType', '', ...
        'description', ''), numel(locationIds), 1);
    for idx = 1:numel(locationIds)
        locationId = locationIds(idx);
        locations(idx).id = locationId;
        locations(idx).label = sprintf('Location %d', locationId);
        if locationId <= 5
            locations(idx).contactType = 'in-axis';
            locations(idx).description = 'In-axis stimulation site from upstream SkinSource map.';
        else
            locations(idx).contactType = 'perpendicular';
            locations(idx).description = 'Perpendicular stimulation site from upstream SkinSource map.';
        end
    end
end

function visualization = convertVisualizationAssets(upstreamDir, outDir)
    visDir = fullfile(upstreamDir, 'source', 'visualization');

    inputLocations = load(fullfile(visDir, 'inputLocations.mat'));
    outputLocations = load(fullfile(visDir, 'outputLocations.mat'));
    adjacencyMatrix = load(fullfile(visDir, 'adjacencyMatrix.mat'));
    surfaceData = load(fullfile(visDir, 'surface.mat'));

    visualization = struct();
    visualization.path = 'visualization.json';
    visualization.inputLocations = inputLocations.inputLocations;
    visualization.outputLocations = outputLocations.outputLocations;
    visualization.adjacencyMatrix = adjacencyMatrix.adjacencyMatrix;

    if isfield(surfaceData, 'surface') && isa(surfaceData.surface, 'polyshape')
        visualization.surfaceVertices = surfaceData.surface.Vertices;
    else
        visualization.surfaceVertices = [];
    end

    masks = cell(4, 1);
    for model = 1:4
        maskData = load(fullfile(visDir, sprintf('mask%d.mat', model)));
        masks{model} = uint8(maskData.mask ~= 0);
    end
    visualization.masks = masks;

    writeJson(fullfile(outDir, visualization.path), visualization);

    visualization = struct( ...
        'path', visualization.path, ...
        'inputMapImage', '../reference/inputLocations.png', ...
        'outputMapImage', '../reference/outputLocations.png');
end

function relPath = writeMatlabColormap(outDir)
    relPath = 'matlab-parula.json';
    payload = struct();
    payload.name = 'parula';
    payload.source = 'MATLAB parula(256), matching the SkinSource MATLAB GUI default colormap.';
    payload.values = parula(256);
    writeJson(fullfile(outDir, relPath), payload);
end

function relPath = writeInputHandOutline(upstreamDir, outDir)
    relPath = 'input-hand-outline.png';
    imagePath = fullfile(upstreamDir, 'documentation', 'inputLocations.png');
    image = im2double(imread(imagePath));
    rgbSpread = max(image, [], 3) - min(image, [], 3);
    grayLevel = mean(image, 3);
    keep = rgbSpread < 0.075 & grayLevel > 0.42 & grayLevel < 0.92;

    % Keep the hand drawing, not the lower legend illustrations.
    keep(round(size(keep, 1) * 0.73):end, :) = false;
    [rows, cols] = find(keep);
    pad = 72;
    rowRange = max(1, min(rows) - pad):min(size(keep, 1), max(rows) + pad);
    colRange = max(1, min(cols) - pad):min(size(keep, 2), max(cols) + pad);
    keep = keep(rowRange, colRange);

    outline = zeros([size(keep), 3], 'uint8');
    outline(:, :, 1) = uint8(151);
    outline(:, :, 2) = uint8(164);
    outline(:, :, 3) = uint8(178);

    alpha = uint8(zeros(size(keep)));
    alpha(keep) = uint8(150);
    imwrite(outline, fullfile(outDir, relPath), 'Alpha', alpha);
end
