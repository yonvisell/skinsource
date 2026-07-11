# SkinSourceSim

SkinSourceSim is a static browser workbench for the SkinSource dataset and toolbox. It predicts dynamic tactile signals in the hand and arm by convolving user-defined vibration stimuli with the SkinSource impulse-response measurements, then superposing responses from one or more input locations.

## What the app does

- Select one of the SkinSource upper-limb datasets.
- Add or replace generated stimuli or imported WAV signals at numbered input locations on the hand.
- Build multi-input simulations from the compact simulation-input list.
- Render output acceleration quantities at dorsal sensor locations.
- View the RMS surface response as an interpolated MATLAB-style surface fill or measured sensor values.
- Compare selected output points in time and frequency strips, including optional log-scaled frequency axes.
- Save and reload self-contained session JSON files.
- Export time-domain CSV, frequency-domain CSV, RMS surface CSV, surface PNG, and short surface WebM video.

The browser implementation keeps the dataset local to the static site and uses portable JavaScript signal-processing routines. No MATLAB installation is required for app use; MATLAB is used during development to validate numerical agreement with the original toolbox.

## References

N. Tummala et al., "SkinSource: A Data-Driven Toolbox for Predicting Touch-Elicited Vibrations...", IEEE Haptics Symp. 2024. DOI: https://doi.org/10.1109/HAPTICS59260.2024.10520852

Original toolbox: https://github.com/neelitummala/skinsource
