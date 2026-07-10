# SkinSourceSim

SkinSourceSim is a static browser workbench for the SkinSource dataset and toolbox. It predicts dynamic tactile signals in the hand and arm by convolving user-defined vibration stimuli with the SkinSource impulse-response measurements, then superposing responses from one or more input locations.

## What the app does

- Select one of the SkinSource upper-limb datasets.
- Assign generated stimuli or imported WAV signals to numbered input locations on the hand.
- Specify multiple input stimuli at once with compact batch rows.
- Render output acceleration quantities at dorsal sensor locations.
- View the RMS surface response as measured sensor values or as an interpolated MATLAB-style surface fill.
- Compare selected output points in time-domain and frequency-domain strips.
- Export time-domain CSV, frequency-domain CSV, RMS surface CSV, session JSON, surface PNG, and short surface WebM video.

The browser implementation keeps the dataset local to the static site and uses portable JavaScript signal-processing routines. No MATLAB installation is required for app use; MATLAB is used during development to validate numerical agreement with the original toolbox.

## References

N. Tummala et al., "SkinSource: A Dataset of Whole-Arm Skin Vibrations for Tactile Rendering", IEEE Haptics Symposium 2024. DOI: https://doi.org/10.1109/HAPTICS59260.2024.10520852

Original toolbox: https://github.com/neelitummala/skinsource
