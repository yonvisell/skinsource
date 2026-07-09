The repository contains the data for the toolbox released as part of the publication “SkinSource: A Data-Driven Toolbox for Predicting Touch-Elicited Vibrations in the Upper Limb.” The toolbox and installation and usage instructions can be found on GitHub here: https://github.com/neelitummala/skinsource. If you use these data or our toolbox please cite our publication.

Full citation: “Tummala, N., Reardon, G., Fani, S., Goetz, D., Bianchi, M., and Visell, Y. (2024) SkinSource: A Data-Driven Toolbox for Predicting Touch-Elicited Vibrations in the Upper Limb. IEEE Haptics Symposium 2024.” 

## Abstract From Manuscript

Vibrations transmitted throughout the hand and arm during touch contact play a central role in haptic science and engineering but are challenging to model or experimentally characterize. Here, we present SkinSource, a data-driven toolbox for predicting skin vibrations across the upper limb in response to user-specified input forces. The toolbox leverages impulse response measurements that encode the physics of vibration transmission across the hands and arms of four participants and provides software tools for analyzing the predicted skin responses. We show that the SkinSource predictions closely match experimental measurements and confirm the underlying assumption of linear vibration transmission in the skin. We also demonstrate through several usage examples how SkinSource can act as a versatile computational platform for haptic research applications, such as characterizing vibrotactile transmission in the skin, engineering haptic interfaces, and investigating touch perception.

## Dataset Description

This dataset comprises experimental data of 3-axis surface acceleration at 72 locations on the skin in response to unit impulsive forces supplied at 20 different input locations on the palmar hand surface. For details on our experimental procedure, please see our publication. This data is intended to be used as part of the SkinSource toolbox, which can be found here: https://github.com/neelitummala/skinsource.

## Data Fields

The data is provided as a .mat file. This file contains a single variable “dataTable” of variable type “table.” The table contains 80 rows, each corresponding to a unique experimental condition (4 participants x 20 input locations), and contains the following fields:

**Data** (522x72x3) - 3D array containing the 3-axis skin acceleration at 522 time points (impulse responses) for each of 72 accelerometers. Please see the GitHub code and documentation (https://github.com/neelitummala/skinsource) for the accelerometer locations on the dorsal surface of the upper limb.

**Model** - The upper limb model number. This number specifies the participant that data was taken on.

**Location** - Number designating which input location on the palmar hand surface the data corresponds to. Please see the GitHub code and documentation (https://github.com/neelitummala/skinsource) for input location number mapping.