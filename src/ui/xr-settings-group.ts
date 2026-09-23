import { Container, Label, SelectInput, SliderInput } from '@playcanvas/pcui';

import { i18n } from './localization';
import { Events } from '../events';
import { XrSettings } from '../xr';

const row = (labelKey: string, control: Container | SliderInput | SelectInput) => {
    const container = new Container({ class: 'settings-panel-row' });
    const label = new Label({
        class: 'settings-panel-row-label'
    });
    i18n.bindText(label, labelKey);
    container.append(label);
    container.append(control as any);
    return container;
};

/**
 * VR tuning controls, appended to the settings panel.
 *
 * Resolution scale, refresh rate and reference space are baked into the XRSession when it is
 * created, so changing them takes effect the next time VR is entered. Foveation and SH bands
 * apply immediately.
 *
 * The whole group stays hidden until the browser reports an immersive-vr capable device.
 */
class XrSettingsGroup extends Container {
    constructor(events: Events, args = {}) {
        args = {
            ...args,
            id: 'xr-settings-group',
            hidden: true
        };

        super(args);

        const header = new Label({
            class: 'settings-panel-group-header'
        });
        i18n.bindText(header, 'panel.settings.vr');

        const resolutionSlider = new SliderInput({
            class: 'settings-panel-row-slider',
            min: 0.4,
            max: 1.2,
            step: 0.05,
            precision: 2,
            value: 0.8
        });

        const foveationSlider = new SliderInput({
            class: 'settings-panel-row-slider',
            min: 0,
            max: 1,
            step: 0.25,
            precision: 2,
            value: 0.75
        });

        const frameRateSelect = new SelectInput({
            class: 'settings-panel-row-select',
            defaultValue: '72'
        });
        i18n.bindOptions(frameRateSelect, () => [
            { v: '0', t: i18n.t('panel.settings.vr.refresh-rate.auto') },
            { v: '72', t: '72 Hz' },
            { v: '90', t: '90 Hz' },
            { v: '120', t: '120 Hz' }
        ]);

        const shBandsSlider = new SliderInput({
            class: 'settings-panel-row-slider',
            min: 0,
            max: 3,
            precision: 0,
            value: 1
        });

        const speedSlider = new SliderInput({
            class: 'settings-panel-row-slider',
            min: 0.25,
            max: 8,
            step: 0.25,
            precision: 2,
            value: 1.5
        });

        const snapTurnSelect = new SelectInput({
            class: 'settings-panel-row-select',
            defaultValue: '30'
        });
        i18n.bindOptions(snapTurnSelect, () => [
            { v: '0', t: i18n.t('panel.settings.vr.snap-turn.smooth') },
            { v: '15', t: '15°' },
            { v: '30', t: '30°' },
            { v: '45', t: '45°' }
        ]);

        this.append(header);
        this.append(row('panel.settings.vr.resolution-scale', resolutionSlider));
        this.append(row('panel.settings.vr.foveation', foveationSlider));
        this.append(row('panel.settings.vr.refresh-rate', frameRateSelect));
        this.append(row('panel.settings.vr.sh-bands', shBandsSlider));
        this.append(row('panel.settings.vr.movement-speed', speedSlider));
        this.append(row('panel.settings.vr.snap-turn', snapTurnSelect));

        // guard against the change events we raise ourselves when pushing state into the
        // controls feeding straight back into the settings store
        let updating = false;

        const set = (update: Partial<XrSettings>) => {
            if (!updating) {
                events.fire('xr.setSettings', update);
            }
        };

        events.on('xr.supported', (supported: boolean) => {
            this.hidden = !supported;
        });

        events.on('xr.settings', (settings: XrSettings) => {
            updating = true;
            resolutionSlider.value = settings.resolutionScale;
            foveationSlider.value = settings.foveation;
            frameRateSelect.value = `${settings.targetFrameRate}`;
            shBandsSlider.value = settings.shBands;
            speedSlider.value = settings.movementSpeed;
            snapTurnSelect.value = `${settings.snapTurnAngle}`;
            updating = false;
        });

        resolutionSlider.on('change', (value: number) => set({ resolutionScale: value }));
        foveationSlider.on('change', (value: number) => set({ foveation: value }));
        frameRateSelect.on('change', (value: string) => set({ targetFrameRate: parseInt(value, 10) }));
        shBandsSlider.on('change', (value: number) => set({ shBands: value }));
        speedSlider.on('change', (value: number) => set({ movementSpeed: value }));
        snapTurnSelect.on('change', (value: string) => set({ snapTurnAngle: parseInt(value, 10) }));
    }
}

export { XrSettingsGroup };
