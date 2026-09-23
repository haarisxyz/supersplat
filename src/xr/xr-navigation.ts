import {
    math,
    XRPAD_A,
    XRPAD_B,
    XRPAD_SQUEEZE,
    XRPAD_STICK_X,
    XRPAD_STICK_Y,
    XRPAD_TRIGGER,
    BoundingBox,
    Entity,
    Quat,
    Vec3,
    XrInputSource,
    XrManager
} from 'playcanvas';

import { XrSettings } from './xr-settings';

// work globals
const va = new Vec3();
const vb = new Vec3();
const vc = new Vec3();
const quat = new Quat();

const STICK_DEADZONE = 0.15;
const SNAP_ENGAGE = 0.7;
const SNAP_RELEASE = 0.35;
const SMOOTH_TURN_SPEED = 90;       // degrees per second when snap turning is disabled
const SPRINT_MULTIPLIER = 3;
const MIN_SCALE = 1e-4;
const MAX_SCALE = 1e4;

// radius, in metres of headset space, the scene bounding sphere is fitted to on reset
const FIT_RADIUS = 1.5;

// distance from scene centre to viewer on reset, as a multiple of the scene radius
const FIT_DISTANCE = 2.5;

const applyDeadzone = (value: number) => {
    return Math.abs(value) < STICK_DEADZONE ? 0 : value;
};

// project a direction onto the horizontal plane. Returns false if the direction is (near)
// vertical, in which case the result is left untouched.
const flatten = (dir: Vec3, result: Vec3) => {
    const len = Math.sqrt(dir.x * dir.x + dir.z * dir.z);
    if (len < 1e-3) {
        return false;
    }
    result.set(dir.x / len, 0, dir.z / len);
    return true;
};

// yaw of a horizontal vector in degrees, matching a rotation about +Y
const yawOf = (v: Vec3) => {
    return Math.atan2(v.x, v.z) * math.RAD_TO_DEG;
};

type Hand = 'left' | 'right';

type Grab = {
    source: XrInputSource;
    // grip position in tracking (rig local) space at the moment the grab started
    start: Vec3;
};

/**
 * Moves the user through the scene during a VR session.
 *
 * The XR runtime owns the headset camera's *local* transform, so all locomotion is applied to
 * the rig entity the camera is parented to. Position, yaw and a uniform scale are tracked here
 * rather than read back off the entity so grabs and snap turns stay exact.
 *
 * Rig scale is the inverse of the apparent world scale: a bigger rig makes the user bigger and
 * the scene correspondingly smaller. Keeping scale on the rig rather than on the content means
 * the clip planes, the tracked play space and the guardian all stay in real headset metres.
 */
class XrNavigation {
    private rig: Entity;
    private cameraEntity: Entity;

    private position = new Vec3();
    private yaw = 0;
    private scale = 1;

    // grabs currently in progress
    private grabs = new Map<Hand, Grab>();

    // rig transform captured when the current set of grabs was established
    private grabPosition = new Vec3();
    private grabYaw = 0;
    private grabScale = 1;

    private snapLatched = false;
    private resetLatched = false;
    private trueScaleLatched = false;

    /** invoked when the user asks to re-frame the scene */
    onResetView: () => void = null;

    constructor(rig: Entity, cameraEntity: Entity) {
        this.rig = rig;
        this.cameraEntity = cameraEntity;
    }

    /**
     * Rotate and scale a tracking-space offset into world space, without translating it.
     * Combined with the rig position this maps tracking space to world space.
     */
    private rigOffset(local: Vec3, result: Vec3, yaw = this.yaw, scale = this.scale) {
        result.copy(local).mulScalar(scale);
        quat.setFromEulerAngles(0, yaw, 0).transformVector(result, result);
        return result;
    }

    /** move the rig so the headset ends up at the given world position */
    private placeHeadAt(target: Vec3) {
        this.position.copy(target).sub(this.rigOffset(this.cameraEntity.getLocalPosition(), va));
    }

    /**
     * World position of the headset derived from the tracked rig state rather than read back
     * off the entity, whose transform is only flushed once per frame in apply().
     */
    private headWorld(result: Vec3) {
        return this.rigOffset(this.cameraEntity.getLocalPosition(), result).add(this.position);
    }

    /** rotate a head-local direction into world space using the tracked rig yaw */
    private headBasis(dir: Vec3, result: Vec3) {
        this.cameraEntity.getLocalRotation().transformVector(dir, result);
        quat.setFromEulerAngles(0, this.yaw, 0).transformVector(result, result);
        return result;
    }

    /** push the tracked transform onto the rig entity */
    private apply() {
        this.rig.setLocalPosition(this.position);
        this.rig.setLocalEulerAngles(0, this.yaw, 0);
        this.rig.setLocalScale(this.scale, this.scale, this.scale);
    }

    /**
     * Place the user so the whole scene sits comfortably in front of them, without changing
     * the direction they are facing.
     */
    resetView(bound: BoundingBox) {
        const radius = Math.max(1e-4, bound.halfExtents.length());

        this.scale = math.clamp(radius / FIT_RADIUS, MIN_SCALE, MAX_SCALE);

        // horizontal direction the user is currently looking in
        if (!flatten(this.headBasis(Vec3.FORWARD, vb), vb)) {
            vb.set(0, 0, -1);
        }

        // step back from the scene centre along the view direction
        vc.copy(bound.center).sub(vb.mulScalar(radius * FIT_DISTANCE));

        this.placeHeadAt(vc);

        this.grabs.clear();
        this.apply();
    }

    /** reset the rig to 1:1, so one unit in the scene is one metre to the user */
    trueScale() {
        this.setScaleAbout(1, this.headWorld(vc));
        this.apply();
    }

    /** change the rig scale while keeping the given world point pinned in place */
    private setScaleAbout(scale: number, pivot: Vec3) {
        const next = math.clamp(scale, MIN_SCALE, MAX_SCALE);
        if (next === this.scale) {
            return;
        }

        // world-space offset from the rig origin to the pivot, normalised by the old scale
        va.copy(pivot).sub(this.position).mulScalar(1 / this.scale);
        this.scale = next;
        this.position.copy(pivot).sub(va.mulScalar(this.scale));
    }

    /** yaw the rig while keeping the given world point (normally the head) pinned in place */
    private turnAbout(degrees: number, pivot: Vec3) {
        this.yaw = (this.yaw + degrees) % 360;
        this.placeHeadAt(pivot);
    }

    /** classify the connected controllers, tolerating headsets that report no handedness */
    private classify(sources: XrInputSource[]) {
        let left: XrInputSource = null;
        let right: XrInputSource = null;
        const unknown: XrInputSource[] = [];

        for (const source of sources) {
            if (!source.gamepad) {
                continue;
            }
            if (source.handedness === 'left' && !left) {
                left = source;
            } else if (source.handedness === 'right' && !right) {
                right = source;
            } else {
                unknown.push(source);
            }
        }

        // fill any gap with unclassified sources so single-controller setups still work
        for (const source of unknown) {
            if (!left) {
                left = source;
            } else if (!right) {
                right = source;
            }
        }

        return { left, right };
    }

    update(deltaTime: number, xr: XrManager, settings: XrSettings) {
        const { left, right } = this.classify(xr.input.inputSources);

        this.updateGrabs(left, right);

        // grabbing takes over the rig entirely - mixing it with stick input fights the user
        if (this.grabs.size === 0) {
            this.updateLocomotion(deltaTime, left, right, settings);
            this.updateTurn(deltaTime, right ?? left, settings);
        }

        this.updateButtons(left, right);

        this.apply();
    }

    private updateLocomotion(deltaTime: number, left: XrInputSource, right: XrInputSource, settings: XrSettings) {
        const stick = left?.gamepad;
        if (!stick) {
            return;
        }

        const x = applyDeadzone(stick.axes[XRPAD_STICK_X] ?? 0);
        const y = applyDeadzone(stick.axes[XRPAD_STICK_Y] ?? 0);

        // right stick vertical flies up and down, which beats walking around a scanned scene
        const lift = applyDeadzone(right?.gamepad?.axes[XRPAD_STICK_Y] ?? 0);

        if (x === 0 && y === 0 && lift === 0) {
            return;
        }

        va.set(0, 0, 0);

        // move relative to where the user is looking, flattened so looking down doesn't drag
        // them into the floor
        if (y !== 0 && flatten(this.headBasis(Vec3.FORWARD, vb), vb)) {
            va.add(vb.mulScalar(-y));
        }
        if (x !== 0 && flatten(this.headBasis(Vec3.RIGHT, vb), vb)) {
            va.add(vb.mulScalar(x));
        }

        va.y -= lift;

        const len = va.length();
        if (len < 1e-6) {
            return;
        }

        // squeezing either trigger sprints
        const sprint = (left?.gamepad?.buttons[XRPAD_TRIGGER]?.pressed ||
                        right?.gamepad?.buttons[XRPAD_TRIGGER]?.pressed) ? SPRINT_MULTIPLIER : 1;

        // movementSpeed is in headset metres, so scale it up into world units
        const speed = settings.movementSpeed * sprint * this.scale * Math.min(len, 1) / len;

        this.position.add(va.mulScalar(speed * deltaTime));
    }

    private updateTurn(deltaTime: number, source: XrInputSource, settings: XrSettings) {
        const x = applyDeadzone(source?.gamepad?.axes[XRPAD_STICK_X] ?? 0);

        let delta = 0;

        if (settings.snapTurnAngle > 0) {
            // snap turning fires once per stick flick, which is far easier on the stomach
            if (Math.abs(x) >= SNAP_ENGAGE) {
                if (!this.snapLatched) {
                    this.snapLatched = true;
                    delta = -Math.sign(x) * settings.snapTurnAngle;
                }
            } else if (Math.abs(x) < SNAP_RELEASE) {
                this.snapLatched = false;
            }
        } else if (x !== 0) {
            delta = -x * SMOOTH_TURN_SPEED * deltaTime;
        }

        if (delta !== 0) {
            this.turnAbout(delta, this.headWorld(vc));
        }
    }

    private updateGrabs(left: XrInputSource, right: XrInputSource) {
        const held = (source: XrInputSource) => {
            return !!source?.grip &&
                   !!source.gamepad?.buttons[XRPAD_SQUEEZE]?.pressed &&
                   !!source.getLocalPosition();
        };

        const wanted: [Hand, XrInputSource][] = [];
        if (held(left)) wanted.push(['left', left]);
        if (held(right)) wanted.push(['right', right]);

        // (re)anchor whenever the set of grabbing hands changes, so adding or dropping a hand
        // never snaps the scene
        const changed = wanted.length !== this.grabs.size ||
                        wanted.some(([hand, source]) => this.grabs.get(hand)?.source !== source);

        if (changed) {
            this.grabs.clear();
            for (const [hand, source] of wanted) {
                this.grabs.set(hand, { source, start: source.getLocalPosition().clone() });
            }
            this.grabPosition.copy(this.position);
            this.grabYaw = this.yaw;
            this.grabScale = this.scale;
            return;
        }

        if (this.grabs.size === 1) {
            this.updateSingleGrab(this.grabs.values().next().value as Grab);
        } else if (this.grabs.size === 2) {
            this.updateDoubleGrab();
        }
    }

    /** one hand drags the scene around without rotating or resizing it */
    private updateSingleGrab(grab: Grab) {
        const current = grab.source.getLocalPosition();
        if (!current) {
            return;
        }

        this.yaw = this.grabYaw;
        this.scale = this.grabScale;

        // t = t0 + s0 * q0 * (start - current)
        va.copy(grab.start).sub(current);
        this.position.copy(this.grabPosition).add(this.rigOffset(va, vb, this.grabYaw, this.grabScale));
    }

    /** two hands translate, yaw and scale the scene together */
    private updateDoubleGrab() {
        const grabL = this.grabs.get('left');
        const grabR = this.grabs.get('right');

        const currL = grabL?.source.getLocalPosition();
        const currR = grabR?.source.getLocalPosition();

        if (!currL || !currR) {
            return;
        }

        const spanStart = va.copy(grabR.start).sub(grabL.start);
        const spanCurr = vb.copy(currR).sub(currL);

        const lenStart = spanStart.length();
        const lenCurr = spanCurr.length();

        if (lenStart < 1e-4 || lenCurr < 1e-4) {
            return;
        }

        // pulling the hands apart makes the scene look bigger, so the rig gets smaller
        this.scale = math.clamp(this.grabScale * lenStart / lenCurr, MIN_SCALE, MAX_SCALE);
        this.yaw = (this.grabYaw + yawOf(spanStart) - yawOf(spanCurr)) % 360;

        // pin the midpoint between the hands: t = t0 + s0*q0*m0 - s1*q1*m1
        va.copy(grabL.start).add(grabR.start).mulScalar(0.5);
        this.rigOffset(va, vc, this.grabYaw, this.grabScale);

        vb.copy(currL).add(currR).mulScalar(0.5);
        this.rigOffset(vb, va);

        this.position.copy(this.grabPosition).add(vc).sub(va);
    }

    private updateButtons(left: XrInputSource, right: XrInputSource) {
        const pressed = (index: number) => {
            return !!left?.gamepad?.buttons[index]?.pressed ||
                   !!right?.gamepad?.buttons[index]?.pressed;
        };

        // A / X re-frames the scene
        const reset = pressed(XRPAD_A);
        if (reset && !this.resetLatched) {
            this.onResetView?.();
        }
        this.resetLatched = reset;

        // B / Y returns to 1:1 scale
        const trueScale = pressed(XRPAD_B);
        if (trueScale && !this.trueScaleLatched) {
            this.trueScale();
        }
        this.trueScaleLatched = trueScale;
    }

    /** apparent size of the world: 2 means the scene looks twice life size */
    get worldScale() {
        return 1 / this.scale;
    }
}

export { XrNavigation };
