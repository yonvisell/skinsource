# SkinSourceSim Worklog

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
