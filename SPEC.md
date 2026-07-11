# SkinSource Specification

## Purpose

SkinSource is a static browser application for exploring SkinSource impulse-response data without MATLAB at runtime. It ports and extends the practical workflow of the SkinSource MATLAB toolbox into a compact, dark, responsive workbench suitable for GitHub Pages.

The application lets users choose an upper-limb recording, add or replace stimulus signals at one or more hand input locations, automatically update predicted skin acceleration responses, inspect surface maps, time-domain signals, and frequency spectra, and export local analysis artifacts.

## Source Contract

Primary implementation references are the upstream GitHub README and Zenodo dataset description.

- Upstream code: `https://github.com/neelitummala/skinsource`
- Dataset DOI: `https://doi.org/10.5281/zenodo.10547601`
- Raw dataset file: `dataset/impulseResponses.mat`
- Raw table variable: `dataTable`
- Conditions: 80 rows, corresponding to 4 models x 20 input locations
- Condition fields: `Data`, `Model`, `Location`
- `Data` shape: 522 time samples x 72 output locations x 3 axes
- Sample rate: 1300 Hz
- Axes: X/Y/Z accelerometer axes, with Z normal to the skin surface
- Model metadata:
  - Model 1: 175 mm hand length, M
  - Model 2: 165 mm hand length, F
  - Model 3: 185 mm hand length, M
  - Model 4: 165 mm hand length, F

## Architecture

The selected architecture is Vite + React + TypeScript as a static GitHub Pages app with `base: './'`.

MATLAB is allowed only during development for data conversion and validation. End users should not need MATLAB, Python, a server, or a preprocessing step.

The app will use time-domain browser assets, not precomputed impulse-response FFTs. Benchmarking indicated that precomputed FFT assets would be much larger and runtime FFT cost is acceptable. Browser assets should be loaded eagerly or prefetched aggressively so interaction remains fluid after startup.

## Runtime Data Plan

Development conversion uses MATLAB R2026a when available:

1. Load `dataset/impulseResponses.mat`.
2. Validate `dataTable` row count, fields, model/location coverage, dimensions, and sample rate assumptions.
3. Convert each `(model, location)` impulse-response tensor to a browser-readable float32 binary chunk.
4. Generate a JSON manifest with chunk paths, dimensions, checksums, scale metadata, source DOI, and citation text.
5. Convert visualization assets from the upstream repository to JSON/binary assets where needed.

The app should support two loading modes during development:

- full eager load/cache of all chunks
- lazy required load with background prefetch

The default product target is eager/background loading for a smooth working session.

## Compute Plan

Use established numerical bindings/libraries where practical. Do not hand-roll FFT internals.

Core operations:

- Generate sinusoid, tap/impulse approximation, white-noise, and custom uploaded signal inputs.
- Compute full linear convolution using an optimized portable JS FFT library.
- Cache impulse-response FFTs per active chunk and FFT length during the session.
- Sum independently rendered input-location responses by superposition.
- Support displayed quantities corresponding to scientifically meaningful MATLAB behavior: single axes, vector magnitude, PCA-like projection if feasible, and RMS-energy axis projection. Do not expose sum-of-components because it is not invariant.
- Treat the displayed quantity as a response-view setting: changing it updates the map and plots for the current simulation inputs without altering those inputs.
- Compute one-sided frequency magnitude spectra with documented normalization. The first implementation uses the next power-of-two FFT length because practical browser FFT libraries are power-of-two oriented; MATLAB validation for spectra should use the same padded length unless a robust arbitrary-length browser FFT is adopted later.

Critical convention checks:

- MATLAB column-major data export vs JavaScript typed-array indexing
- FFT normalization
- full convolution length
- sample indexing and millisecond labels
- one-sided spectrum doubling rules and chosen FFT length
- window definitions
- RMS and dB conventions

Displayed quantity labels should be explicit and readable:

- `Normal acceleration (z)`: \(u_z(x,t)\)
- `Vector magnitude`: \(\|u(x,t)\| = \sqrt{u_x^2 + u_y^2 + u_z^2}\)
- `RMS-energy axis`: \(u(x,t) \cdot e_{\mathrm{rms}}\)
- `Raw x` and `Raw y`, labeled as local accelerometer axes

## User Experience

The first screen is the actual workbench, not a landing page.

The UI should be dark, modern, compact, and fast. It should feel closer to a focused data-science dashboard than a marketing site. Controls remain available in a collapsible rail while users inspect analysis views; when the rail is hidden, the surface and plots should expand into the recovered width.

Expected controls:

- upper-limb recording selector
- input-location map with contact-type cues
- signal builder with compact add/replace controls
- automatic render status
- displayed-quantity selector
- paired surface color-scale range control
- output-location selection
- frequency-axis log toggles for spectrum inspection
- session JSON save/load controls
- export/download controls in the main control rail

Primary analysis views:

- Surface: RMS or selected-time response over the upper limb, defaulting to interpolated mode with sensor mode available
- Time: selected output-location signals, including multi-output small multiples
- Frequency: selected output-location spectra with optional log-scaled axes
- Simulation inputs: compact list of current stimulus inputs
- Downloads: data, images, and short video from the rendered response

The main surface, time-domain, and frequency-domain views should remain simultaneously visible when practical. The first implementation keeps persistent context controls and avoids burying core workflow.

## Exports

Initial export targets:

- rendered response data as JSON or CSV
- selected time-domain signals and spectra as CSV
- selected output time-domain signal as WAV
- surface/time-domain/spectrum images as PNG where implemented
- self-contained project/session settings as JSON, with load support
- short surface playback as WebM video where supported
- animated GIF for short/compact exports if practical

Potential later export:

- richer publication-style figure export and higher-quality video controls

## Validation Strategy

MATLAB is the reference implementation for numerical correctness.

Validation should compare web compute outputs against MATLAB outputs for representative examples:

- impulse response selection
- sinusoidal response
- sinusoid superposition
- multi-location taps
- white-noise spectra

Visual validation should compare browser views against MATLAB-generated reference plots where practical, focusing on qualitative correctness, orientation, color scaling, selected locations, and trace/spectrum shape.

Surface interpolation should be MATLAB-faithful without runtime installation requirements. MATLAB may generate static interpolation assets during development/conversion, but the browser must apply them directly using bundled assets.

Stimulus input should support quick single-input editing and multi-input construction without a manual render step:

- add the current signal at the selected input location
- replace existing signals at the selected input location
- show a compact removable list of simulation inputs
- automatically recompute the response when inputs, upper-limb recording, or displayed quantity changes
- possible later CSV/JSON import if a compact text workflow becomes more useful than the current add/replace controls
- custom WAV import with browser-side resampling to 1300 Hz when needed

## Assumptions

- The app may include converted dataset assets in the static site bundle; the raw `.mat` remains local source data.
- Typical interactive stimulus duration is expected to be no more than about 4 seconds, though the app may allow longer durations if performance remains acceptable.
- Time-domain float32 impulse responses are sufficiently precise for browser analysis; validation will quantify tolerances.
- If exact MATLAB PCA projection parity becomes costly, it can be staged after single-axis, vector magnitude, and RMS-energy projection.
- The paper is secondary context. GitHub README, Zenodo description, and upstream MATLAB behavior define the practical product contract.
