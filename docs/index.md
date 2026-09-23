# SuperSplat User Guide

Welcome to the SuperSplat User Guide.

SuperSplat is an open source, browser-based 3D Gaussian Splat Editor. You can use it to view, inspect, transform, combine, crop, clean up and optimize 3D Gaussian Splats.

## Installing SuperSplat

SuperSplat is a web app so you do not need to install it. Simply point your browser at:

https://playcanvas.com/supersplat/editor

However, for your convenience, you can also install SuperSplat as a PWA (Progressive Web App). This will make SuperSplat appear and behave more like a native application. An app icon for SuperSplat will be generated on your desktop or home screen. Furthermore, .ply files will be associated with the SuperSplat PWA, enabling you to launch SuperSplat more quickly.

## Loading Splats

SuperSplat loads splats from .ply files. Only .ply files containing 3D Gaussian Splat data can be loaded. If you attempt to load any other type of data from a .ply file, it will fail.

There are three ways that you can load a .ply file:

1. Drag and drop one or more .ply files from your file system into SuperSplat's client area.
2. Select the `Scene` > `Open` menu item and select one or more .ply files from your file system.
3. Use the `load` query parameter. This is in the form: `https://playcanvas.com/supersplat/editor?load=<PLY_URL>`. An example would be:

    https://playcanvas.com/supersplat/editor?load=https://raw.githubusercontent.com/willeastcott/assets/main/dragon.compressed.ply

    This is a useful mechanism for sharing splats with other people (say on social platforms like X and LinkedIn).

## Saving Splats

To save the currently loaded scene, select the `Scene` > `Save` or `Save As` menu items. This will save a `.ply` file to your file system.

SuperSplat can also export to two additional formats via the `Scene` > `Export` sub-menu:

* **Compressed Ply**: A lightweight, compressed format that is far smaller than the equivalent uncompressed .ply file. It quantizes splat data and drops spherical harmonics from the output file. See [this article](https://blog.playcanvas.com/compressing-gaussian-splats/) for more details on the format.
* **Splat File**: Another compressed format, although not as efficient as the compressed ply format.

## Controlling the Camera

The camera controls in SuperSplat are as follows:

| Control                                         | Description                     |
| ----------------------------------------------- | ------------------------------- |
| Left Mouse Button<br>Shift + Right Mouse Button | Orbit camera                    |
| Middle Mouse Button<br>Alt + Right Mouse Button | Dolly camera                    |
| Right Mouse Button                              | Pan camera                      |
| Left/Right Arrow Keys                           | Strafe camera left/right        |
| Up/Down Arrow Keys                              | Dolly camera forwards/backwards |
| F Key                                           | Frame selection                 |

To set the target point for orbiting the camera, double click anywhere in the 3D view.

## Visualizing Splats

Splats can be rendered in two 'modes':

* **Centers Mode**: A blue dot is rendered at the center of each Gaussian.
* **Rings Mode**: A ring is rendered at the outer boundary of each Gaussian.

You can disable rendering of the centers or rings (depending on the active mode) by pressing Space. This allows you to view the scene as it would normally appear.

You can control the pixel size of the center dots in the VIEW OPTIONS panel.

## Viewing in VR

SuperSplat can display the current scene on a WebXR headset such as the Meta Quest 3. When a
headset is detected, a VR button appears in the vertical toolbar on the right of the 3D view.
Click it to enter VR, and click it again (or use the headset's own exit gesture) to return to
the editor.

VR is a viewing mode: the scene is shown exactly as it will look once published, without the
grid, gizmos, bounding boxes or selection highlights. Any edits you have made, including hidden
and deleted splats, are reflected immediately. Leaving VR returns you to the editor with the
desktop camera exactly where you left it.

### Running on a Meta Quest 3

Open SuperSplat in the headset's own browser (Meta Quest Browser). WebXR requires a secure
context, so the page must be served over `https://` — the hosted editor at
https://superspl.at/editor already is. If you are testing a local build, use an https tunnel or
port forwarding rather than plain `http://`, otherwise no headset will be detected.

A tethered PC headset works too: open SuperSplat in a desktop browser that supports WebXR and
the VR button will appear once the runtime reports a device.

### VR Controls

| Control                        | Description                                                  |
| ------------------------------ | ------------------------------------------------------------ |
| Left thumbstick                | Move around, relative to the direction you are looking        |
| Right thumbstick left/right    | Turn (snap by default)                                        |
| Right thumbstick up/down       | Move up and down                                              |
| Either trigger                 | Hold to move three times faster                               |
| One grip                       | Grab the scene and drag it around                             |
| Both grips                     | Grab with both hands to move, turn and scale the scene        |
| A / X button                   | Re-frame the scene in front of you                            |
| B / Y button                   | Return to 1:1 scale, so one scene unit is one real metre      |

Moving, turning and scaling change where *you* are, not the scene, so nothing you do in VR can
modify the document.

### VR Performance

Gaussian splats are expensive to draw, and a headset has to draw the scene twice at high
resolution. The VR section of the VIEW OPTIONS panel controls the trade-off. Changes to
resolution scale and refresh rate apply the next time you enter VR; the rest apply immediately.

| Setting          | Description                                                                                                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resolution Scale | Fraction of the headset's native per-eye resolution to render at. Lower it first if the view judders. Defaults to 0.8 on a Quest 3.                                          |
| Foveation        | How aggressively to reduce shading towards the edges of the display. Higher is faster, at the cost of some blur in your peripheral vision. Defaults to 0.75 on a Quest 3.    |
| Refresh Rate     | Target display refresh rate. A lower rate gives each frame more GPU time, which splat scenes usually need more than they need smoothness. Defaults to 72Hz on a Quest 3.     |
| VR SH Bands      | Spherical harmonic bands evaluated in VR. 0 is fastest and makes splats look flat from every angle; 3 is the full view-dependent lighting. Defaults to 1 on a Quest 3.       |
| Movement Speed   | Thumbstick locomotion speed, in real metres per second.                                                                                                                     |
| Snap Turn        | Turn increment for the right thumbstick. Snap turning is much easier on the stomach than smooth turning; choose Smooth only if you are comfortable with it.                  |

The settings are stored in your browser, so they persist between sessions. Defaults are chosen
from the headset reported by the browser, so a Quest 3 starts out more conservative than a
tethered PC headset.

If the scene is still too heavy after turning these down, the most effective remaining step is
to reduce the splat count itself: delete the splats you do not need, or export a compressed
version of the scene and load that.

## Selecting and Deleting Splats

Cropping splats or deleting unwanted Gaussians is a key function of SuperSplat. To help with this, there are 3 selection tools available:

* **Picker Select**: Click to select, or click + drag to rect select.
* **Brush Select**: Click and drag a selection circle. Change the brush size with the `[` and `]` keys.
* **Sphere Select**: Activate a sphere volume to add or remove splats from the current selection. Double click on any splat to reposition the sphere volume.

Once you are happy with your selection, you can delete it with the Delete key.

## Transforming Splats

SuperSplat can translate, rotate and scale splats. To do this, select a splat in the Scene Manager and activate one of the gizmos via the horizontal icon bar.

To achieve fine grain control over the transform of the selected splat, you can use the TRANSFORM panel (below the SCENE MANAGER panel).

To set the origin of the currently active gizmo, double click anywhere in the 3D view.

## Merging Splats

It is possible to merge multiple .ply files together and output a single, combine .ply file. Simply load any number of .ply files into Scene Manager, perform whatever transformations and edits you require, and then save the result via the `Scene` > `Save` menu item.

## Inspecting Splat Data

The Data Panel can be used to analyze the contents of your splat scenes. Initially, it is collapsed at the bottom of the application's window. To open it, click on the panel's header or press the 'D' key.

The Data Panel plots various scene properties on a histogram display. You can select splats directly by dragging on the histogram view. Use the Shift key to add to the current selection and the Ctrl key to remove from the current selection.
