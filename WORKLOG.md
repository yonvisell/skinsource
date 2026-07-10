# SkinSourceSim Worklog

## 2026-07-10

### Revision Planning

- Green-lit a second implementation pass focused on correcting labels and displayed quantities, adding MATLAB-faithful color/interpolation behavior, completing WAV/video/array workflows, broadening MATLAB validation, and slimming the UI.
- Recorded that runtime interpolation must remain portable and installation-free: MATLAB may generate static interpolation assets during development, but the browser must consume bundled assets directly.
- Updated `SPEC.md` and `ACCEPTANCE.md` to remove sum-of-components, rename projection-oriented wording to displayed quantities, require compact colorbar/MATLAB colormap, require input hand outline, add multi-output selection, add stimulus array and WAV workflows, and expand validation beyond RMS-only checks.

## 2026-07-09

### Planning Inputs

- Read `AGENTS.md`.
- Inspected upstream SkinSource checkout at `tmp/skinsource-upstream`.
- Prioritized GitHub README and Zenodo dataset description over paper details for implementation planning.
- Confirmed MATLAB installations:
  - `/Applications/MATLAB_R2026a.app/bin/matlab`
  - `/Applications/MATLAB_R2017a.app/bin/matlab`

### Dataset Download

Downloaded from Zenodo record `10.5281/zenodo.10547601`:

```bash
mkdir -p dataset
curl -L --fail --retry 3 --continue-at - -o dataset/README.md https://zenodo.org/api/records/10547601/files/README.md/content
curl -L --fail --retry 3 --continue-at - -o dataset/impulseResponses.mat https://zenodo.org/api/records/10547601/files/impulseResponses.mat/content
```

Verification:

```bash
md5 -r dataset/impulseResponses.mat dataset/README.md
wc -c dataset/impulseResponses.mat dataset/README.md
```

Results:

- `dataset/impulseResponses.mat`: `69367862` bytes, MD5 `9226dcefe3f80809a06376fbaa42ae91`
- `dataset/README.md`: `3022` bytes, MD5 `c07587a6f5d43a4b8765f5941a9da96d`

### Implementation Decisions

- Static browser app using Vite + React + TypeScript.
- MATLAB allowed for development conversion and validation only.
- Store browser runtime data in time-domain float32 assets, not precomputed FFT assets.
- Use a portable optimized JS FFT library for runtime convolution.
- Cache impulse-response FFTs per chunk and FFT length during a session.
- Test eager/full data load and lazy/background-prefetch loading; default target is smooth interaction after startup.

### Assumptions Recorded

- Raw Zenodo `.mat` is local source data and should stay out of normal git commits.
- Converted browser assets may be committed if size remains acceptable for GitHub Pages.
- Typical stimulus duration target is up to about 4 seconds.
- Exact PCA projection parity can be staged if other MATLAB-compatible projection modes are available first.

### Data Conversion

Created `scripts/convert_skinsource_assets.m` and ran:

```bash
/Applications/MATLAB_R2026a.app/bin/matlab -batch "run('scripts/convert_skinsource_assets.m')"
```

Results:

- MATLAB loaded `dataset/impulseResponses.mat`.
- Validated `dataTable` exists, has 80 rows, and contains required fields `Data`, `Model`, and `Location`.
- Validated every model/location condition has `Data` shape `522 x 72 x 3`.
- Wrote 80 float32 chunks under `public/data/impulse-responses/`.
- Wrote `public/data/manifest.json`.
- Wrote `public/data/visualization.json`.
- Copied upstream reference maps to `public/reference/`.

Generated asset sizes:

```bash
du -sh public public/data public/data/impulse-responses public/reference
```

- `public`: 41 MB
- `public/data`: 40 MB
- `public/data/impulse-responses`: 35 MB
- `public/reference`: 960 KB

Chunk validation:

```bash
node -e "<manifest md5/coverage check>"
```

Result:

- 80 chunks
- complete `4 x 20` coverage
- all chunk byte counts and MD5 hashes match the manifest

Note: `public/data/visualization.json` is currently 5.6 MB because it stores masks and adjacency data as JSON. This is acceptable for the first implementation, but it can be made more compact if startup load becomes a problem.

### App Scaffold

Created a Vite + React + TypeScript static app with relative asset base paths for GitHub Pages.

Dependencies selected:

- `fft.js` for portable FFT operations
- `uplot` for fast scientific traces
- `lucide-react` for compact icon controls

Commands:

```bash
npm install
npm run build
```

Result:

- Dependencies installed with 0 reported vulnerabilities.
- Initial scaffold build passed.

### Compute Core

Implemented TypeScript modules for:

- manifest/chunk loading
- signal generation
- FFT-based full convolution via `fft.js`
- SkinSource-style per-input scaling and superposition
- axis/projection helpers
- RMS and one-sided padded spectra

Important convention:

- `fft.js` inverse transforms are already normalized. An initial extra `1/N` scaling caused a failing convolution unit test and was removed.
- Runtime convolution uses zero-padded power-of-two FFTs and crops to the full linear convolution length.
- Runtime spectra currently use the next power-of-two FFT length. This is documented in `SPEC.md` and `ACCEPTANCE.md`; MATLAB spectrum parity should use the same padded length unless a robust arbitrary-length browser FFT backend is added later.

Briefly evaluated `kissfft-js` for arbitrary FFT lengths, but did not keep it because the package real transform only accepts even sizes and its complex inverse path failed in this environment.

Created `scripts/generate_matlab_reference_outputs.m` and ran:

```bash
/Applications/MATLAB_R2026a.app/bin/matlab -batch "run('scripts/generate_matlab_reference_outputs.m')"
```

Generated fixture:

- `tests/fixtures/matlab/model1_location7_sine100_100ms_response.f32`
- MATLAB reference shape `651 x 72 x 3`
- fixture MD5 `7c375b073bc1909a1b97f0ed665cc905`

Verification:

```bash
npm run test
npm run build
```

Results:

- Vitest passed: 3 files, 7 tests.
- Production build passed.

### Workbench UI

Implemented the first usable browser workbench:

- manifest and visualization geometry loading
- concurrent background preloading of converted impulse-response chunks
- model selector
- projection selector
- input-location selector and interactive input map
- signal builder for sinusoid, impulse, tap, and white noise
- assigned-input list with remove controls
- render workflow using the TypeScript compute core
- dorsal output sensor map with RMS color coding
- selected-output readout
- trace and spectrum tabs using `uplot`
- export tab placeholder for the next slice

Commands:

```bash
npm run test
npm run build
npm run dev
```

Browser inspection:

- Opened `http://127.0.0.1:5173/` in the in-app browser.
- Verified dataset preload reached `80/80`.
- Assigned default 100 Hz sinusoid at input location 7.
- Rendered one input successfully: `846` samples with `mag` projection.
- Verified RMS surface map updated.
- Verified trace tab rendered one chart for output 20.
- Verified spectrum tab rendered one chart using a `1024` point FFT.
- Browser console check returned no warnings or errors.

Visual notes:

- Layout is compact and dark as intended.
- Render button is low in the left rail at the default 1280x720 viewport but remains reachable; revisit after export controls land.
- Sensor-map visualization is currently point-based rather than interpolated surface fill.

### Export Slice

Added local export actions:

- selected trace CSV
- selected spectrum CSV
- surface RMS CSV
- session metadata JSON
- current surface sensor-map PNG

Commands:

```bash
npm run test
npm run build
```

Results:

- Vitest passed: 3 files, 7 tests.
- Production build passed.

Browser inspection:

- Reloaded the app, assigned the default 100 Hz input, rendered, and opened the Export tab.
- Verified export buttons: Trace CSV, Spectrum CSV, Surface RMS CSV, Session JSON, Surface PNG.
- Clicked Trace CSV; no new browser console warnings or errors were produced.
- Browser download event was not observed by the automation runtime for the blob download, but the click path executed without app errors.

### Final Verification Pass

Commands:

```bash
npm run test
npm run build
/Applications/MATLAB_R2026a.app/bin/matlab -batch "run('scripts/generate_matlab_visual_reference.m')"
```

Results:

- Vitest passed: 3 files, 7 tests.
- Production build passed.
- MATLAB wrote `verification/matlab/model1_location7_sine100_surface.png`.

MATLAB visual reference:

- Added `scripts/generate_matlab_visual_reference.m`.
- Generated a reference point-map for Model 1, input location 7, 100 Hz sinusoid, 250 ms, magnitude RMS.
- Visual comparison against the browser surface map showed matching orientation and qualitative response pattern: strongest response near the stimulated finger region with decay along the forearm.

Clean browser run:

- Restarted the Vite dev server.
- Opened a fresh app tab.
- Assigned the default 100 Hz sinusoid at location 7 and rendered.
- Browser state reported `Rendered 1 input: 846 samples, projection mag`.
- Selected output 20 RMS remained `-16.1 dB`.
- Browser log reader still contained two old Vite hot-reload React root warnings from before the reusable-root patch; no new warnings appeared during the fresh run.

Remaining issues:

- Surface visualization is a point map, not MATLAB natural-neighbor interpolation.
- Runtime spectra use next-power-of-two padded FFTs; this is documented and should be validated with the same MATLAB convention when spectrum parity tests are expanded.
- Custom `.wav` import and video/GIF export are not yet implemented.
