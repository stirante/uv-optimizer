# Blockbench UV Optimization Plugin

Welcome to the UV Optimization plugin. Please refer to the guide below for details.

This plugin automatically optimizes UVs, supports gap settings, merges similar faces and intelligently compresses textures.

# Usage Guide

## Download

The latest tool can be found in Releases. Download the `uv_optimizer.js` file from there.

## Installation

1. Open Blockbench and go to **File -> Plugins** to open the plugin interface.
![Image text](https://nie.res.netease.com/r/pic/20250507/39d03786-2587-4953-8094-e366dfbca73f.png)
2. Click **"Load Plugin from File"**, select the downloaded JS file and wait for the installation to finish.
![Image text](https://nie.res.netease.com/r/pic/20250507/dfebe45a-ca18-496f-8c27-bb5aba2938f8.png)

## Usage

### Preparation

1. Open the model you want to optimize.
![Image text](https://nie.res.netease.com/r/pic/20250507/583089e1-fd05-4a97-b05d-c4712871f9f7.png)
2. **Change the model's UV mode to Per-Face UV**. You can do this manually or use the new **"Set Per-Face UV"** option from the Tools menu.
![Image text](https://nie.res.netease.com/r/pic/20250507/5fd76a7f-34c4-4811-9bf6-ee39f8ae0e30.png)
3. A new **"UV Optimize"** button will appear in the Tools menu.
![Image text](https://nie.res.netease.com/r/pic/20250507/47427afe-8e57-4f22-8cb8-12dbee07b30a.png)

### Optimize UVs

1. Open the UV optimization window via **Tools -> UV Optimize**.
![Image text](https://nie.res.netease.com/r/pic/20250507/f638bc69-6eaa-43d0-a46b-b614bacc9308.png)
2. In most cases you can keep the default parameters. After clicking confirm, the program may freeze for a moment. Please wait until it finishes.

### Check

1. **A designer should verify that the optimized model looks correct before saving.**
2. If problems are found, **close the project and reopen it** to restore the model before optimization.

## Effect Showcase

Before optimization:
![Image text](https://nie.res.netease.com/r/pic/20250507/f4d6f85b-978c-45e5-982c-6f226fbcb9fd.png)

After optimization:
![Image text](https://nie.res.netease.com/r/pic/20250507/74c7da24-1488-46eb-91a3-5ce2c61b0c10.png)

## Parameter Explanation

- **Gap between faces:** Default is 0. Set 1 if you need 1 pixel of empty space between textures.
- **Pixel similarity threshold:** Higher values reduce texture reuse (faces that could share one texture may not). Increase up to 100 if textures are replaced incorrectly.
- **Ignore faces below valid pixel percentage:** Skip faces whose visible pixels are below this percentage. For example a 100x100 area with only one non-transparent pixel can be ignored.
- **Texture downsize similarity threshold:** Influences how much textures are downscaled (max 100). Downscaling is an important way to reduce resolution. Increase this value if textures look different after optimization.

# Notes

- The plugin currently has no history. Undo will not revert the changes.
- If the result is unsatisfactory, adjust **Pixel similarity threshold** and **Texture downsize similarity threshold**.
- Models that use multiple textures are **not supported**. If you must use it, optimize the first texture and manually adjust the others based on it.

# Contribution

If you discover improvements or want to add new features, feel free to submit a branch and leave your name. Thank you for your contribution!
