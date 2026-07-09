# SkinSourceSim Specification

## Purpose

SkinSourceSim is a static browser application for exploring SkinSource impulse-response data without MATLAB at runtime. It ports the practical workflow of the SkinSource MATLAB toolbox into a compact, dark, responsive workbench suitable for GitHub Pages.

The application lets users choose an upper-limb model, assign stimulus signals to one or more hand input locations, render predicted skin acceleration responses, inspect surface maps/traces/spectra, and export local analysis artifacts.

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
- Support axis selection and projection modes corresponding to MATLAB behavior: single axes, magnitude, PCA-like projection if feasible, RMS-energy projection, and sum of components.
- Compute one-sided frequency magnitude spectra with MATLAB-compatible normalization.

Critical convention checks:

- MATLAB column-major data export vs JavaScript typed-array indexing
- FFT normalization
- full convolution length
- sample indexing and millisecond labels
- one-sided spectrum doubling rules
- window definitions
- RMS and dB conventions

## User Experience

The first screen is the actual workbench, not a landing page.

The UI should be dark, modern, compact, and fast. It should feel closer to a focused data-science dashboard than a marketing site. Controls remain visible while users switch between analysis views.

Expected controls:

- model selector
- input-location map with contact-type cues
- signal builder with reusable assigned inputs
- render/status controls
- axis/projection selector
- output-location selection
- export controls

Possible analysis views:

- Surface: RMS or selected-time response over upper limb
- Traces: selected output-location time traces
- Spectrum: selected output-location frequency spectra
- Inputs: assigned stimulus previews
- Export: data, images, and possibly video/GIF

Tabbed layout is allowed if it improves flow. The first implementation should keep persistent context controls and avoid burying core workflow.

## Exports

Initial export targets:

- rendered response data as JSON or CSV
- selected traces/spectra as CSV
- surface/traces/spectrum images as PNG
- project/session settings as JSON

Potential later export:

- short surface playback as video or animated image

## Validation Strategy

MATLAB is the reference implementation for numerical correctness.

Validation should compare web compute outputs against MATLAB outputs for representative examples:

- impulse response selection
- sinusoidal response
- sinusoid superposition
- multi-location taps
- white-noise spectra

Visual validation should compare browser views against MATLAB-generated reference plots where practical, focusing on qualitative correctness, orientation, color scaling, selected locations, and trace/spectrum shape.

## Assumptions

- The app may include converted dataset assets in the static site bundle; the raw `.mat` remains local source data.
- Typical interactive stimulus duration is expected to be no more than about 4 seconds, though the app may allow longer durations if performance remains acceptable.
- Time-domain float32 impulse responses are sufficiently precise for browser analysis; validation will quantify tolerances.
- If exact MATLAB PCA projection parity becomes costly, it can be staged after single-axis, magnitude, RMS-energy, and sum-of-components projection.
- The paper is secondary context. GitHub README, Zenodo description, and upstream MATLAB behavior define the practical product contract.
