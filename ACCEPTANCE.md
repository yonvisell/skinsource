# SkinSource Acceptance Criteria

## Planning

- `SPEC.md`, `ACCEPTANCE.md`, and `WORKLOG.md` exist before application coding begins.
- Ambiguities are recorded in `WORKLOG.md` with smallest product-faithful assumptions.
- Work proceeds in meaningful slices with git commits after stable checkpoints.

## Data

- Zenodo `README.md` and `impulseResponses.mat` are downloaded locally under `dataset/`.
- Downloaded files match Zenodo metadata:
  - `impulseResponses.mat` size `69367862`
  - `impulseResponses.mat` MD5 `9226dcefe3f80809a06376fbaa42ae91`
  - `README.md` size `3022`
  - `README.md` MD5 `c07587a6f5d43a4b8765f5941a9da96d`
- MATLAB conversion validates:
  - `dataTable` exists
  - 80 rows
  - complete model coverage 1-4
  - complete input-location coverage 1-20 per model
  - each `Data` tensor has shape `522 x 72 x 3`
- Converted browser assets have manifest metadata, dimensions, checksums, and source attribution.

## Compute

- Runtime uses time-domain data chunks and a portable optimized FFT library for convolution.
- Full convolution output length equals `stimulusSamples + 522 - 1`.
- Superposition sums multiple independently scaled input-location responses.
- Signal builders include at least sinusoid, tap/impulse approximation, white noise, and custom WAV import with resampling when needed.
- Displayed quantities include at least normal acceleration `z`, vector magnitude, raw `x`, raw `y`, and RMS-energy axis projection.
- Sum-of-components is not exposed as a displayed quantity.
- One-sided frequency spectra follow documented normalization and FFT-length rules; if zero-padded browser spectra are used, MATLAB validation uses the same padded length.
- Numerical comparisons against MATLAB reference outputs pass within documented tolerance for representative examples.
- Stimulus arrays can be specified more efficiently than one-by-one UI assignment, either through a table, presets, import, or equivalent compact workflow.

## UI

- App is a static Vite build with GitHub Pages-friendly relative base paths.
- First screen is the usable workbench.
- UI is dark, compact, responsive, and data-workflow oriented.
- No `alert()`, `confirm()`, or modal confirmation flows.
- App title is `SkinSource`.
- UI uses clear labels such as `Upper-limb model` and `Displayed quantity`.
- Small unobtrusive citation and links to DOI/GitHub/Zenodo are present.
- Buttons, font sizes, spacing, and labels are consistent and compact.
- Mouseover hints are available for key controls.
- Core workflow is available:
  - choose upper-limb model
  - choose/input one or more stimulus locations
  - configure signal
  - render output
  - inspect surface response, time-domain traces, and frequency-domain spectra
  - export at least one data format and one image format

## Visualization

- Surface view shows upper-limb response with both sensor-map and interpolated-surface modes.
- Surface view has a compact colorbar using the MATLAB colormap and numeric scale labels.
- Input-location view shows the hand outline.
- Output locations can be selected directly; multiple output locations can be selected.
- Selected output locations drive time-domain traces.
- Selected output locations drive frequency-domain spectra.
- Time-domain view displays the equation for the selected displayed quantity.
- Multi-output time-domain traces can be shown as stacked small multiples.
- Visual orientation, labels, color scaling, and selected-point behavior are verified against MATLAB or upstream reference assets.

## Verification

- `npm run build` succeeds.
- Best available automated tests pass.
- MATLAB validation scripts run and record results.
- Local browser app is visually inspected.
- Browser automation captures/inspects main states if available.
- `WORKLOG.md` records commands run, results, visual-inspection notes, and remaining issues.
- MATLAB validation covers several signals, locations, displayed quantities, time-domain traces, and interpolated-surface outputs; validation is not limited to RMS summaries.

## Delivery

- Large raw source data is not accidentally committed unless explicitly chosen.
- Generated static browser assets required by the app are either committed or documented with an app-compatible fetch strategy.
- Final handoff reports what was built, what was verified, and known limitations.
