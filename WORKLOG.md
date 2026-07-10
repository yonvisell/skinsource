# SkinSourceSim Worklog

## 2026-07-10

### Revision Planning

- Green-lit a second implementation pass focused on correcting labels and displayed quantities, adding MATLAB-faithful color/interpolation behavior, completing WAV/video/array workflows, broadening MATLAB validation, and slimming the UI.
- Recorded that runtime interpolation must remain portable and installation-free: MATLAB may generate static interpolation assets during development, but the browser must consume bundled assets directly.
- Updated `SPEC.md` and `ACCEPTANCE.md` to remove sum-of-components, rename projection-oriented wording to displayed quantities, require compact colorbar/MATLAB colormap, require input hand outline, add multi-output selection, add stimulus array and WAV workflows, and expand validation beyond RMS-only checks.

### Correction Slice: Labels, Colormap, Colorbar, Hand Outline

- Removed the non-invariant sum-of-components displayed quantity from the TypeScript mode union, compute projection function, and UI selector.
- Renamed the app title to `SkinSource`, changed UI labels from projection/model-oriented wording to `Displayed quantity` and `Upper-limb model`, and added unobtrusive DOI/GitHub/Zenodo links.
- Added MATLAB-generated static visual assets:
  - `public/data/matlab-parula.json` from `parula(256)`
  - `public/data/input-hand-outline.png` from the upstream input-location reference, keeping only the hand drawing on transparency
- Updated the browser surface map and surface PNG export to use the MATLAB colormap table.
- Added a compact in-panel colorbar with fixed `-50 dB` to `0 dB` scale labels.

Commands:

```bash
/Applications/MATLAB_R2026a.app/bin/matlab -batch "run('scripts/convert_skinsource_assets.m')"
npm run test
npm run build
npm run dev -- --port 5173
```

Results:

- MATLAB conversion succeeded and regenerated `public/data/manifest.json`.
- Vitest passed: 3 files, 7 tests.
- Production build passed.
- Vite started on `http://127.0.0.1:5174/` because `5173` was already occupied.

Browser inspection:

- Verified page title and H1 are `SkinSource`.
- Verified `Displayed quantity` options are `Vector magnitude`, `Normal acceleration (z)`, `Raw x acceleration`, `Raw y acceleration`, and `RMS-energy axis`.
- Verified no visible `Projection` label and no `Sum components` option remain.
- Verified input panel displays the hand outline behind volar locations.
- Verified surface panel displays the compact MATLAB-colorbar.
- Rendered the default 100 Hz sinusoid at input 7; selected output 20 remained `-16.1 dB`, now shown with the MATLAB colormap.
- Current 5174 browser logs had no warnings/errors. The log reader still showed two older 5173 React hot-reload warnings from the prior session.

### Interpolation Slice

- Extended `scripts/convert_skinsource_assets.m` to generate static sparse interpolation operators for each upper-limb model.
- The operators are derived from the upstream MATLAB `surfaceinterpolation` natural-neighbor basis with boundary extrapolation, using model-specific scale factors, masks, dorsal output locations, surface vertices, and adjacency matrices.
- Runtime remains installation-free: the browser loads `rowPtr`, output index, and weight arrays and multiplies them by the current 72 output values.
- Added `public/data/interpolation/manifest.json` plus per-model binary sparse arrays.
- Added a `Sensors` / `Interpolated` toggle to the surface panel. Measured dorsal sensors remain visible and selectable over the interpolated fill.

Asset size check:

```bash
du -sh public/data/interpolation public/data/interpolation/* | sort -h
```

Results:

- `public/data/interpolation`: `4.0M`
- Per-model nonzeros:
  - Model 1: `151287`
  - Model 2: `134646`
  - Model 3: `169012`
  - Model 4: `134646`

Commands:

```bash
/Applications/MATLAB_R2026a.app/bin/matlab -batch "run('scripts/convert_skinsource_assets.m')"
npm run test
npm run build
```

Results:

- MATLAB conversion succeeded and wrote interpolation assets.
- Vitest passed: 3 files, 7 tests.
- Production build passed.
- Sparse interpolation integrity check showed active-pixel weight sums near 1.0:
  - Model 1: `0.999999..1.000000`
  - Model 2: `0.999998..1.000000`
  - Model 3: `0.999999..1.000000`
  - Model 4: `0.999998..1.000000`

Browser inspection:

- Reloaded `http://127.0.0.1:5174/`.
- Verified the `Interpolated` toggle is present and disabled only until the active model interpolation asset loads.
- Rendered the default 100 Hz sinusoid at input 7, switched to `Interpolated`, and verified an interpolated surface image is generated.
- Visual check: interpolated fill aligns with dorsal sensor locations and the high-response region appears near the expected hand/finger region.
- Current 5174 browser logs had no warnings/errors.

### Multi-Output And Equation Slice

- Replaced single selected output state with ordered multi-output selection.
- Output-map behavior:
  - normal click selects one output
  - Shift, Option, or Command-click toggles additional outputs
  - selected outputs remain highlighted and labeled on the surface map
- Added stacked small-multiple charts for selected outputs in both time-domain and frequency views.
- Renamed the time view to `Time domain` and added a displayed-quantity equation strip above the time-domain plots.
- Session JSON export now records both the primary output and the selected output array.

Commands:

```bash
npm run test
npm run build
```

Results:

- Vitest passed: 3 files, 7 tests.
- Production build passed.

Browser inspection:

- Reloaded `http://127.0.0.1:5174/`.
- Rendered the default 100 Hz sinusoid at input 7.
- Shift-clicked outputs 21 and 22 in addition to the default output 20.
- Verified output labels `20`, `21`, and `22` are visible.
- Verified `Time domain` displays three stacked charts plus the equation for vector magnitude.
- Verified `Frequency` displays three stacked one-sided magnitude spectra.
- Current 5174 browser logs had no warnings/errors.
- UI note for cleanup: adjacent selected output labels can crowd each other when nearby dorsal points are selected.

### Stimulus Array And WAV Import Slice

- Added `WAV file` as a stimulus signal mode.
- WAV import behavior:
  - uses browser Web Audio `decodeAudioData`
  - mixes multichannel audio to mono
  - resamples to the SkinSource sample rate, `1300 Hz`, via `OfflineAudioContext` when needed
  - normalizes imported samples to peak amplitude before the existing SkinSource response-scaling step
- Added a compact `Stimulus Array` panel:
  - row format: `location,signal,value,scale`
  - supported row signals: `sinusoid`, `tap`, `impulse`, `noise`
  - rows can be comma, tab, or space separated
  - blank rows and `#` comments are ignored
- Added presets based on upstream examples:
  - `Fig. 2E taps`
  - `Fig. 2F sine`
  - `Noise spectra`
- Presets can also update model, displayed quantity, duration, and selected output arrays to match the example workflow.

Commands:

```bash
npm run test
npm run build
```

Results:

- Vitest passed: 3 files, 7 tests.
- Production build passed.

Browser inspection:

- Reloaded `http://127.0.0.1:5174/`.
- Loaded the `Fig. 2F sine` preset.
- Applied rows and verified assigned inputs at locations 8 and 13, both labeled `200 Hz sine`.
- Rendered successfully: `Rendered 2 inputs: 586 samples, Raw x acceleration`.
- Verified selected outputs `19`, `21`, `24`, and `32` were active.
- Current 5174 browser logs had no warnings/errors.

WAV verification note:

- Created a tiny local synthetic WAV under `tmp/` for testing and did not commit it.
- The embedded browser automation surface does not expose file upload, and its page-evaluation sandbox lacks enough binary/browser constructors to synthesize a file-input event reliably. The WAV import code is type/build verified, and it uses standard browser APIs, but a manual file-picker verification is still pending for the final visual QA pass.

### Surface Video Export Slice

- Added `Surface WebM` export.
- Video export animates the current displayed quantity over time, using the current surface mode:
  - sensor map when `Sensors` is active
  - MATLAB-style fill when `Interpolated` is active and the model interpolation asset is loaded
- Export uses browser `canvas.captureStream()` and `MediaRecorder`, with WebM MIME fallback among VP9, VP8, and generic WebM.
- Frames are capped to keep exports short and local.

Commands:

```bash
npm run test
npm run build
```

Results:

- Vitest passed: 3 files, 7 tests.
- Production build passed.

Browser inspection:

- Reloaded `http://127.0.0.1:5174/`.
- Rendered the default 100 Hz sinusoid at input 7.
- Opened the export view and verified `Surface WebM` appears with the other export buttons.
- Clicked `Surface WebM`; browser status reported `Downloaded skinsourcesim-model1-surface.webm`.
- Current 5174 browser logs had no warnings/errors.

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
