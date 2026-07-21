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

### Expanded MATLAB Validation Slice

- Added `scripts/generate_matlab_validation_fixtures.m`.
- Generated compact MATLAB fixtures for:
  - `sine_m1_l7_z`: selected z-axis traces
  - `sine_m1_l7_mag`: selected vector-magnitude traces
  - `sine_m1_l7_rms`: selected RMS-energy-axis traces
  - `superposition_m3_l8_l13_x`: two-input raw x traces
  - `taps_m3_l7_l8_l9_l10_mag`: multi-location tap magnitude traces
  - `noise_m2_l5_x_spectra`: deterministic-noise one-sided spectra
  - `sine_m1_l7_mag_interpolated_surface`: direct MATLAB natural-neighbor surface interpolation
- Expanded `src/lib/skinsource.test.ts` to compare:
  - full rendered response for the original sine case
  - selected time-domain traces across several signals, locations, and displayed quantities
  - frequency-domain spectra and frequency bins
  - browser sparse interpolation output against direct MATLAB `surfaceinterpolation`

Commands:

```bash
/Applications/MATLAB_R2026a.app/bin/matlab -batch "run('scripts/generate_matlab_validation_fixtures.m')"
npm run build
npm run test
```

Results:

- MATLAB wrote 7 validation cases.
- Production build passed.
- Vitest passed: 3 files, 10 tests.

Implementation note:

- MATLAB fixture generation uses the explicit browser Hanning-window formula for tap fixtures, avoiding a mismatch with MATLAB `hanning()` defaults.

### Final UI Polish And Browser QA

- Adjusted selected-output labels so multi-selected neighboring points fan out slightly instead of sharing one offset.
- Added wrapping protection for long selected-output metric values.

Commands:

```bash
npm run test
npm run build
```

Results:

- Vitest passed: 3 files, 10 tests.
- Production build passed.

Desktop browser inspection:

- Reloaded `http://127.0.0.1:5174/`.
- Loaded `Fig. 2F sine`, applied rows, rendered, and switched to `Interpolated`.
- Verified title is `SkinSource`.
- Verified no visible `Projection` label and no `Sum components` option.
- Verified compact colorbar and interpolated surface fill are present.
- Verified selected outputs `19`, `21`, `24`, and `32` are visible and slightly less crowded after label offset adjustment.
- Verified footer links/citation are present.

Mobile browser inspection:

- Temporarily set viewport to `390 x 844`.
- Reloaded the app and verified no horizontal overflow.
- Confirmed setup/stimulus/stimulus-array controls stack cleanly.
- Reset browser viewport after the check.

Final browser log check:

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

## 2026-07-10 Revision Pass: UI Corrections, WAV Portability, Downloads Rail

Implemented a follow-up UI and functionality revision based on visual inspection notes.

Changes:

- Replaced the previous generated input-location outline with the user-provided `stimulation_small.png`, served as `public/assets/stimulation-locations.png`.
- Added static image-coordinate overlays for input-location selection; a browser check measured the displayed image ratio as `0.635`, matching the asset ratio `635/1000`.
- Added the user-provided dorsal hand sensor image as `public/assets/hand-sensors-inset.jpg`.
- Made the sensor inset smaller, frameless, and shifted right within the surface panel.
- Moved downloads/export controls into the left control rail.
- Renamed UI sections and labels:
  - `Input signal`
  - `Upper-limb recording`
  - `Multiple-input rows`
  - `Stimuli to render`
  - `Downloads`
- Changed upper-limb dropdown options to `Limb N · male/female` and removed unexplained hand-length text from the UI.
- Added selectable surface color-scale controls:
  - `Surface scale floor`
  - `Surface scale ceiling`
- Changed the surface colorbar title to `Normalized RMS acceleration` and simplified labels to the selected dB endpoints.
- Propagated the selected dB range through sensor colors, interpolated surface colors, Surface PNG export, and Surface WebM frames.
- Reworked the panel density, button sizes, slider weight, border contrast, and link styling.
- Replaced `Dataset ready` UI wording with `SkinSource data ready`.
- Kept paper/GitHub links visible and styled as standard underlined links.

WAV import portability:

- Browser QA found that Chrome rejects `OfflineAudioContext(1, n, 1300)` because 1300 Hz is below the allowed browser sample-rate range.
- Replaced the Web Audio offline resampling path with a deterministic browser-side windowed-sinc resampler to 1300 Hz.
- Confirmed the test WAV `test-assets/skinsourcesim_100hz_1s_48khz.wav` imports as `1300 samples at 1300 Hz, resampled from 48000 Hz`.

Commands:

```bash
npm run test
npm run build
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --headless=new --disable-gpu --window-size=1440,960 --screenshot=tmp/skinsourcesim-ui-user-comments-pass.png 'http://127.0.0.1:5173/?v=user-comments-pass'
```

Browser automation and visual checks:

- Captured default desktop UI: `tmp/skinsourcesim-ui-user-comments-pass.png`.
- Rendered the default 100 Hz sinusoid at input location 7 and captured `tmp/skinsourcesim-rendered-left-downloads.png`.
- Verified after render:
  - `Downloads` section opens automatically.
  - `Time-domain WAV` export button is visible.
  - colorbar title reads `Normalized RMS acceleration`.
  - color-scale controls are present.
  - input image displayed ratio is `0.635`.
  - sensor inset is smaller and frameless.
- Confirmed Surface PNG download via headless Chrome:
  - `tmp/downloads/skinsourcesim-model1-surface.png`
  - dimensions `1200 x 1600`
  - black background, compact dB colorbar, no selected-output highlight.
- Captured mobile layouts and inspected computed layout width; document scroll width matched viewport width at `390 px`.

Verification results:

- Vitest passed: 3 files, 10 tests.
- Production build passed.

Remaining notes:

- Chrome headless screenshots at very tall artificial mobile viewports can stretch auto grid rows; computed layout checks showed no horizontal overflow.
- The user-provided `new/` intake folder is intentionally left untracked; deployable copies live under `public/assets/`.

## 2026-07-10 Revision Pass: Compact Inputs, Auto Render, Collapsible Controls

Implemented the next UI and interaction cleanup pass.

Changes:

- Replaced the older multiple-input rows workflow with compact `Add input` and `Replace` buttons.
- Renamed the current input list to `Simulation inputs`.
- Renamed the location selector to `Input contact location`.
- Removed the manual render button; the app now re-renders automatically when simulation inputs, upper-limb recording, or displayed quantity changes.
- Confirmed `Displayed quantity` is a response-view setting: it updates the surface, time-domain, and frequency-domain views using the existing simulation inputs without changing the input list.
- Merged controls, simulation inputs, and downloads into one compact left rail.
- Added a more prominent controls hide/show button; when hidden, the analysis area expands.
- Kept input-location markers as clickable outline discs aligned over the hand-location image.
- Added an interpolated-surface checkbox to show or hide output sensor locations and selected-output numbering.
- Removed the extra time-domain panel glyph and made time/frequency panel subtitles sit on the title line.
- Shifted the surface inset slightly right/up, removed the colorbar outline, tightened sliders/buttons, and made multiple-output plots taller and scrollable.
- Added a compact `Movie WebM` export button for short surface-response animations.

Verification:

```bash
npm run build
npm run test
```

Results:

- Production build passed.
- Vitest passed: 3 files, 10 tests.

Browser automation:

- Confirmed clicking input location `14` on the hand image updates the selected input location.
- Confirmed `Add input` adds a simulation input and triggers an automatic render.
- Confirmed changing `Displayed quantity` to normal acceleration re-renders the current input as `Normal acceleration` without changing the input list.
- Confirmed interpolated mode can hide output sensor markers, selected-output circle, and selected-output number.
- Confirmed the controls rail collapse expands the analysis area from about `1118 px` to about `1376 px` at the tested desktop viewport.
- Captured desktop interaction screenshot: `tmp/skinsourcesim-interaction-pass-2.png`.
- Captured mobile layout screenshot: `tmp/skinsourcesim-mobile-add-replace.png`.

Remaining notes:

- The user-provided `new/` intake folder remains intentionally untracked; app-ready copies are already in `public/assets/`.

## 2026-07-10 Revision Pass: Overlay Alignment, Session Load, Spectrum Axes

Implemented another UI/behavior revision.

Changes:

- Rebuilt input-location selection as an SVG overlay sharing the exact `0 0 635 1000` coordinate system with the stimulation-location bitmap.
- Verified the selectable ring center for input location `14` maps to the same screen coordinate as the image-space point.
- Changed the Surface Response default mode to `Interpolated`.
- Added a self-contained session JSON load path.
- Updated saved session JSON to include surface settings, selected outputs, color scale, and stimulus signal samples.
- Replaced separate surface scale floor/ceiling sliders with one paired range control.
- Added compact `x log` and `y log` toggles for the frequency plot.
- Renamed visible plot headings to `Time` and `Frequency`.
- Reduced surface sensor-number labels and plot `Output NN` labels.
- Lightened major plot grid lines.
- Made the paper citation bold in the footer, converted the corrected shortened paper title itself to the DOI link, shortened the GitHub label, and added bold lower-right contact information.
- Reordered the controls into input controls, simulation inputs, output controls, then session/downloads.
- Added a subtle Surface Response border flash after successful automatic renders.
- Updated root and in-app README text to remove the old batch-row workflow and mention session load/log axes.
- Added `.github/workflows/pages.yml` so a pushed GitHub repository can deploy the self-contained Vite build to GitHub Pages.

Verification:

```bash
npm run build
npm run test
```

Results:

- Production build passed.
- Vitest passed: 3 files, 10 tests.

Browser automation:

- Used temporary headless Chrome CDP with a `1440 x 980` viewport.
- Confirmed default surface mode is `Interpolated`.
- Confirmed input marker `14` center equals the SVG-transformed image coordinate, with image ratio `0.635`.
- Confirmed clicking input marker `14` selects input contact location `14`.
- Confirmed `Add input` automatically renders: `Rendered 1 input: 846 samples, Vector magnitude`.
- Confirmed both frequency log-axis toggles enter the active state.
- Confirmed synthetic session JSON load restores model `2`, displayed quantity `z`, hidden interpolated sensors, and one loaded input.
- Captured visual screenshot: `tmp/skinsourcesim-revision-desktop-cdp.png`.

GitHub publication check:

- No GitHub remote is configured for this local repository.
- `gh` is not installed.
- No `GITHUB_TOKEN` or `GH_TOKEN` is present in the environment.
- `git credential fill` did not return a GitHub credential.
- SSH authentication to `git@github.com:yonvisell/skinsource.git` and `git@github.com:yonvisell/yonvisell.github.io.git` failed with `Permission denied (publickey)`.
- The GitHub connector exposed repository-content tools but no repository-creation or Pages-configuration tool in this session.
- Result: app is prepared for GitHub Pages, but creating/pushing the new GitHub repository was blocked by missing usable GitHub write credentials/tooling.

Remaining notes:

- `new/` remains untracked intake material.

### Minor UI Hint Update

- Added `shift-click to add` below both `click to select` hints.
- Input-location shift-click now adds the currently configured stimulus at the clicked input location, matching the hint.

## 2026-07-21 Revision Pass: Human-Factors and Responsive Plot Layout

Implemented the title, content hierarchy, responsive behavior, and multi-output visualization revision.

Changes:

- Renamed the application and browser title to `SkinSource 2.0`.
- Replaced the browser-facing Markdown README with a styled, relative-path-safe `public/readme.html`; retained the root Markdown README for repository presentation.
- Changed defaults to normal acceleration (`z`) and selected outputs 29 and 52.
- Renamed and regrouped controls as `Add 1 or more input signals`, `Current input signals`, `SkinSource Outputs`, and `Export, load, and save`.
- Removed the visible `Displayed quantity` label while retaining an accessible name and explanatory mouseover text on the quantity selector.
- Moved the current-response summary into `SkinSource Outputs`.
- Integrated session loading as the final item in the two-column export grid and gave response-export actions a consistent subtle blue treatment.
- Added a shared `Stack`/`Overlay` plot-layout control and persisted it in session JSON.
- Added consistent, accessible output colors across time and frequency legends and plotted signals.
- Removed per-chart boxes, compressed stacked plots, shared amplitude ranges, and showed the horizontal axis only on the final stacked row.
- Centered the time/frequency quantity descriptions and placed compact output legends at the right of each panel header.
- Clarified the frequency label as a one-sided acceleration amplitude spectrum in `m/s²`.
- Aligned the input and surface headings, raised the surface hand-photo inset to the vertical midpoint, slightly increased surface-number size, differentiated selection guidance, and removed bold weight from the colorbar title.
- Lightened panel borders and separators throughout.
- Corrected the broken intermediate-width control layout: controls now use four columns on small desktops, two on tablets, and one on phones.
- Constrained the two-map row at intermediate widths to prevent portrait-image intrinsic sizing from expanding it beyond 1300 px.
- Defaulted controls to collapsed on phone-sized initial loads and exposed a visible `Show controls` action, placing the input map within the first viewport.

Verification:

```bash
npm run test
npm run build
git diff --check
```

Results:

- Vitest passed: 3 files, 10 tests.
- Production build passed.
- No browser console errors or warnings were reported.

Browser interaction and visual checks:

- Confirmed the default quantity is `z`, outputs 29 and 52 are selected on the surface, and both plot legends use matching teal/yellow identities.
- Added a 100 Hz sinusoid at input 7 and confirmed automatic rendering of 846 samples at 1300 Hz.
- Confirmed stacked mode creates two compact charts per analysis panel and overlay mode creates one shared chart per panel.
- At `1440 x 900`, the map row measured 432 px high, both map headings had the same top coordinate, and the inset top was exactly 50% of the surface-stage height.
- At `1000 x 800`, controls used four equal columns and the corrected map row measured 448 px instead of approximately 1348 px.
- At `390 x 844`, the initial control panel was collapsed, the input map began at 221 px, and document width remained below the viewport width.
- Expanded mobile controls successfully into one readable column without horizontal overflow.
- Opened and visually inspected the static HTML guide at `/readme.html`; it contained five sections and no horizontal overflow.
