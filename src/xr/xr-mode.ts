import { XRTYPE_VR, Color, Entity } from 'playcanvas';

import { XrNavigation } from './xr-navigation';
import { loadXrSettings, sanitizeXrSettings, saveXrSettings, XrSettings } from './xr-settings';
import { Events } from '../events';
import { Scene } from '../scene';

// clip planes are expressed in headset metres, not scene units, because the rig carries the
// scene scale. 5cm to 1km comfortably covers a scene fitted to arm's length.
const NEAR_CLIP = 0.05;
const FAR_CLIP = 1000;

/**
 * Immersive VR mode.
 *
 * The editor renders through a hand-rolled chain of frame passes into an offscreen HDR target
 * which is then blitted to the canvas. That pipeline is fixed to one viewport and one
 * projection, so it cannot serve a stereo headset. Instead VR mode parks the editor camera and
 * renders the splat layer with a second camera through the engine's standard (multi-view aware)
 * path, straight into the XR framebuffer.
 *
 *     xrRig      - locomotion: position, yaw and uniform world scale
 *       xrCamera - local transform is owned by the XR runtime (the headset pose)
 */
class XrMode {
    private scene: Scene;
    private events: Events;

    private rig: Entity;
    private cameraEntity: Entity;
    private nav: XrNavigation;

    private settings: XrSettings;

    private active = false;
    private starting = false;

    // the scene is framed on the first frame that carries a real headset pose
    private framed = false;

    // editor state stashed for the duration of the session
    private savedBands = 0;
    private savedOverlays = true;

    constructor(scene: Scene, events: Events) {
        this.scene = scene;
        this.events = events;
        this.settings = loadXrSettings();

        const { app } = scene;

        this.rig = new Entity('xrRig');
        this.cameraEntity = new Entity('xrCamera');
        this.cameraEntity.addComponent('camera', {
            // splats only: grid, gizmos and selection overlays are editor affordances and each
            // one costs a layer traversal per eye
            layers: [scene.splatLayer.id],
            clearColorBuffer: true,
            clearDepthBuffer: true,
            // the graphics device is created without a stencil buffer, so never ask for the clear
            clearStencilBuffer: false,
            nearClip: NEAR_CLIP,
            farClip: FAR_CLIP
        });

        this.rig.addChild(this.cameraEntity);
        app.root.addChild(this.rig);

        // stays out of the layer composition until a session starts
        this.rig.enabled = false;

        this.nav = new XrNavigation(this.rig, this.cameraEntity);
        this.nav.onResetView = () => this.resetView();

        this.applyClearColor();
        this.applyToneMapping();
        events.on('bgClr', () => this.applyClearColor());
        events.on('camera.tonemapping', () => this.applyToneMapping());

        if (app.xr) {
            app.xr.on(`available:${XRTYPE_VR}`, (available: boolean) => {
                events.fire('xr.supported', available);
            });
            app.xr.on('start', () => this.onSessionStart());
            app.xr.on('end', () => this.onSessionEnd());
            app.xr.on('update', () => this.onXrFrame());
            app.xr.on('error', (error: Error) => {
                events.fire('xr.error', error?.message ?? String(error));
            });
        }

        // rig locomotion runs as part of the regular scene update, after the elements have
        // updated but before anything is rendered
        events.on('update', (deltaTime: number) => {
            if (this.active) {
                this.nav.update(deltaTime, app.xr, this.settings);
            }
        });
    }

    get supported() {
        return !!this.scene.app.xr?.isAvailable(XRTYPE_VR);
    }

    get isActive() {
        return this.active;
    }

    getSettings(): XrSettings {
        return { ...this.settings };
    }

    setSettings(update: Partial<XrSettings>) {
        this.settings = sanitizeXrSettings({ ...this.settings, ...update }, this.settings);
        saveXrSettings(this.settings);

        // foveation is the only setting that can be re-applied mid session. Resolution scale,
        // reference space and frame rate are all fixed when the session is created.
        if (this.active) {
            this.applyFoveation();
            this.applyBands(this.settings.shBands);
        }

        this.events.fire('xr.settings', this.getSettings());
    }

    /**
     * Request an immersive session. Must be called directly from a user gesture - the browser
     * rejects session requests made from timers or promise continuations.
     */
    start() {
        const { app } = this.scene;

        if (this.active || this.starting) {
            return;
        }

        if (!app.xr?.isAvailable(XRTYPE_VR)) {
            this.events.fire('xr.error', 'no-device');
            return;
        }

        // a video capture drives the editor camera frame by frame and would fight the session
        if (this.scene.lockedRenderMode) {
            this.events.fire('xr.error', 'busy');
            return;
        }

        this.starting = true;

        // drop to the VR band count now so the splat shaders recompile on the flat screen
        // rather than as a stall inside the headset
        this.savedBands = this.events.invoke('view.bands') ?? 0;
        this.applyBands(this.settings.shBands);

        this.applyClearColor();
        this.applyToneMapping();

        app.xr.start(this.cameraEntity.camera, XRTYPE_VR, this.settings.spaceType, {
            framebufferScaleFactor: this.settings.resolutionScale,
            callback: (error: Error | null) => {
                this.starting = false;
                if (error) {
                    // the session never came up, so put the editor back as it was
                    this.applyBands(this.savedBands);
                    this.events.fire('xr.error', error.message ?? String(error));
                }
            }
        });
    }

    end() {
        this.scene.app.xr?.end();
    }

    toggle() {
        if (this.active) {
            this.end();
        } else {
            this.start();
        }
    }

    /** re-frame the scene in front of the user */
    resetView() {
        if (this.active) {
            this.nav.resetView(this.scene.bound);
        }
    }

    private applyClearColor() {
        const clr = this.events.invoke('bgClr') as Color;
        if (clr) {
            this.cameraEntity.camera.clearColor = new Color(clr.r, clr.g, clr.b, 1);
        }
    }

    /**
     * Match the editor camera's tone mapping. The splat shader bakes tone mapping and gamma in
     * from the camera's shader params, so a mismatch here shows up as a brightness shift
     * between the desktop view and the headset.
     */
    private applyToneMapping() {
        this.cameraEntity.camera.toneMapping = this.scene.camera.camera.toneMapping;
    }

    private applyBands(bands: number) {
        this.events.fire('view.setBands', bands);
    }

    private applyFoveation() {
        const { xr } = this.scene.app;
        if (xr?.active && xr.fixedFoveation !== null) {
            xr.fixedFoveation = this.settings.foveation;
        }
    }

    /**
     * Ask the runtime for the closest refresh rate it actually supports. Quest 3 typically
     * offers 72, 80, 90 and 120Hz; a lower target gives each frame a bigger slice of GPU time,
     * which splat scenes need far more than they need headroom.
     */
    private applyFrameRate() {
        const { xr } = this.scene.app;
        const wanted = this.settings.targetFrameRate;
        const rates = xr?.supportedFrameRates;

        if (!xr || !wanted || !rates?.length) {
            return;
        }

        const target = rates.reduce((best, rate) => {
            return Math.abs(rate - wanted) < Math.abs(best - wanted) ? rate : best;
        }, rates[0]);

        if (xr.frameRate !== target) {
            xr.updateTargetFrameRate(target, (error?: Error) => {
                if (error) {
                    console.warn(`failed to set xr frame rate to ${target}Hz: ${error.message}`);
                }
            });
        }
    }

    private onSessionStart() {
        const { scene } = this;

        this.active = true;
        this.starting = false;
        this.framed = false;

        // hand rendering over to the XR camera
        this.rig.enabled = true;
        scene.camera.mainCamera.enabled = false;

        // suppress selection tint, rings and outlines - they read as artefacts in stereo
        this.savedOverlays = scene.camera.renderOverlays;
        scene.camera.renderOverlays = false;

        this.applyFoveation();
        this.applyFrameRate();

        this.events.fire('xr.active', true);
    }

    private onSessionEnd() {
        const { scene } = this;

        this.active = false;
        this.starting = false;

        this.rig.enabled = false;
        scene.camera.mainCamera.enabled = true;
        scene.camera.renderOverlays = this.savedOverlays;

        this.applyBands(this.savedBands);

        // the XR manager resized the canvas backing store to the headset framebuffer and does
        // not put it back, so restore it from the layout or the editor renders at headset
        // resolution from here on
        const container = document.getElementById('canvas-container');
        if (container) {
            const pixelRatio = window.devicePixelRatio;
            scene.canvasResize = {
                width: Math.max(1, Math.ceil(container.clientWidth * pixelRatio)),
                height: Math.max(1, Math.ceil(container.clientHeight * pixelRatio))
            };
        }

        scene.forceRender = true;

        this.events.fire('xr.active', false);
    }

    /**
     * Fired once per headset frame, before the scene update, and only when the runtime handed
     * us a real viewer pose.
     */
    private onXrFrame() {
        if (!this.active) {
            return;
        }

        // the editor only renders when something changed; a headset needs every frame
        this.scene.forceRender = true;

        if (!this.framed) {
            this.framed = true;
            this.nav.resetView(this.scene.bound);
        }
    }
}

export { XrMode };
