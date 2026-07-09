# AGENTS.md — AutoxVision

## Mission
Build **SkinSourceSim**, an application and UI frontend to a toolbox based on my lab's SkinSource project.  The original project is on github.  This is the github page, which includes a readme: https://github.com/neelitummala/skinsource

Work in the CWD.  Check out a local copy of skinsource.  We won't be modifying that directly, but will be replicating it in a more modern UI and application.  The original was in Matlab.

The application used a dataset stored on Zenodo: https://doi.org/10.5281/zenodo.10547601

Download it to the cwd.  The dataset is just under 70 MB in size.

Create and work in a local repository if needed.

## Implementation choice
Consider options and implement the best available version.  I want to make it useable, portable, and self contained.  Ideally installation free, so that I can share it.  

One option would be a Browser application, possibly Vite + React + TypeScript using efficient but portable (installation-free) bindings.  This would be served from my github via yonvisell.github.io/skinsourcesim, with dataset embedded/downloaded when the static page is served. Keep runtime dependencies minimal.

Do not add preprocessing as a required step. The application should include functionality that builds on our simpler matlab version, and allows for export of spatiotemporal data and images and possibly video to local files on the computer browsing the site.

## Development rules
- Create `SPEC.md` and `ACCEPTANCE.md` files before coding.
- Plan for slice based development.
- If ambiguity remains, make the smallest product-faithful assumption and record it in `WORKLOG.md`; do not stop for clarification.
- Use atomic commits after meaningful slices.
- Keep the UI dark, modern, compact, and fast. No modal confirmations, `alert()`, or `confirm()`.
- Put any vendored runtime library files in `vendor/`. Prefer no vendored libraries and no CDN imports.
- Keep GitHub Pages deployment simple; Vite `base: './'` is preferred.

## Required verification before handoff
Run the best available local verifications and validations:

Plan a scheme for testing functionality.

Then visually inspect the localhost app. Test with any short local video available; do not commit large video files. If browser automation is available, use it to capture/inspect the main states. 

Use any means necessary.

Update `WORKLOG.md` with what was built, commands run, results, visual-inspection notes, and any remaining issues.
