import { XRSPACE_LOCAL, XRSPACE_LOCALFLOOR } from 'playcanvas';

// reference spaces offered by VR mode. 'local-floor' puts the world origin at the user's
// floor which is what every standalone headset (Quest included) reports most accurately.
type XrSpaceType = typeof XRSPACE_LOCAL | typeof XRSPACE_LOCALFLOOR;

type XrSettings = {
    // XRWebGLLayer framebuffer scale. 1 renders at the headset's native per-eye resolution
    resolutionScale: number;

    // fixed foveated rendering level, 0 (off) to 1 (maximum). Reduces shading rate towards
    // the edge of the display, which is where gaussian splat overdraw hurts most
    foveation: number;

    // requested display refresh rate in Hz. 0 leaves the runtime default alone. The closest
    // rate the session actually supports is used
    targetFrameRate: number;

    // number of spherical harmonic bands evaluated while in VR. Each band adds per-gaussian
    // vertex work and texture reads, so this is the single biggest quality/speed dial
    shBands: number;

    // thumbstick locomotion speed in metres per second, measured in headset space
    movementSpeed: number;

    // snap turn increment in degrees. 0 selects smooth turning
    snapTurnAngle: number;

    // reference space requested when the session starts
    spaceType: XrSpaceType;
};

type XrDeviceProfile = 'quest3' | 'standalone' | 'desktop';

// Meta Quest Browser reports the headset model in the UA string, for example:
// 'Mozilla/5.0 (X11; Linux x86_64; Quest 3) ... OculusBrowser/33.0 ... Chrome/... VR Safari/537.36'
const detectDeviceProfile = (): XrDeviceProfile => {
    const ua = navigator.userAgent ?? '';

    if (/Quest\s*(?:3|Pro)/i.test(ua)) {
        return 'quest3';
    }

    // any other standalone android-class headset (Quest 1/2, Pico, ...)
    if (/OculusBrowser|Pico|VR Safari|Wolvic/i.test(ua)) {
        return 'standalone';
    }

    return 'desktop';
};

// Per-device defaults. Gaussian splats are overwhelmingly fill-rate and vertex bound, so the
// standalone presets trade resolution and spherical harmonics for headroom, while a tethered
// PC headset can afford native resolution.
const presets: Record<XrDeviceProfile, XrSettings> = {
    // Quest 3 / Quest Pro: Snapdragon XR2 Gen 2, 2064x2208 per eye at up to 120Hz
    quest3: {
        resolutionScale: 0.8,
        foveation: 0.75,
        targetFrameRate: 72,
        shBands: 1,
        movementSpeed: 1.5,
        snapTurnAngle: 30,
        spaceType: XRSPACE_LOCALFLOOR
    },
    // older / weaker standalone headsets
    standalone: {
        resolutionScale: 0.7,
        foveation: 1,
        targetFrameRate: 72,
        shBands: 0,
        movementSpeed: 1.5,
        snapTurnAngle: 30,
        spaceType: XRSPACE_LOCALFLOOR
    },
    // PC-tethered headset backed by a desktop GPU
    desktop: {
        resolutionScale: 1,
        foveation: 0,
        targetFrameRate: 90,
        shBands: 2,
        movementSpeed: 1.5,
        snapTurnAngle: 30,
        spaceType: XRSPACE_LOCALFLOOR
    }
};

const storageKey = 'supersplat.xr.settings';

const clamp = (value: number, min: number, max: number) => {
    return Math.max(min, Math.min(max, value));
};

// coerce an arbitrary stored/user supplied value into a valid settings object
const sanitizeXrSettings = (value: any, base: XrSettings): XrSettings => {
    const num = (key: keyof XrSettings, min: number, max: number) => {
        const v = value?.[key];
        return typeof v === 'number' && isFinite(v) ? clamp(v, min, max) : base[key] as number;
    };

    return {
        resolutionScale: num('resolutionScale', 0.3, 1.5),
        foveation: num('foveation', 0, 1),
        targetFrameRate: num('targetFrameRate', 0, 144),
        shBands: Math.round(num('shBands', 0, 3)),
        movementSpeed: num('movementSpeed', 0.1, 20),
        snapTurnAngle: Math.round(num('snapTurnAngle', 0, 90)),
        spaceType: value?.spaceType === XRSPACE_LOCAL ? XRSPACE_LOCAL : XRSPACE_LOCALFLOOR
    };
};

const defaultXrSettings = (): XrSettings => {
    return { ...presets[detectDeviceProfile()] };
};

const loadXrSettings = (): XrSettings => {
    const defaults = defaultXrSettings();

    try {
        const stored = window.localStorage?.getItem(storageKey);
        if (stored) {
            return sanitizeXrSettings(JSON.parse(stored), defaults);
        }
    } catch (e) {
        // storage unavailable (private browsing, blocked cookies) - fall back to defaults
    }

    return defaults;
};

const saveXrSettings = (settings: XrSettings) => {
    try {
        window.localStorage?.setItem(storageKey, JSON.stringify(settings));
    } catch (e) {
        // storage unavailable - settings simply won't persist across reloads
    }
};

export { defaultXrSettings, detectDeviceProfile, loadXrSettings, sanitizeXrSettings, saveXrSettings };
export type { XrDeviceProfile, XrSettings, XrSpaceType };
