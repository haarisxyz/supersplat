import { XrMode } from './xr-mode';
import { XrSettings } from './xr-settings';
import { Events } from '../events';
import { Scene } from '../scene';
import { localize } from '../ui/localization';

const registerXrEvents = (scene: Scene, events: Events) => {
    const xrMode = new XrMode(scene, events);

    events.function('xr.supported', () => xrMode.supported);
    events.function('xr.active', () => xrMode.isActive);
    events.function('xr.settings', () => xrMode.getSettings());

    // must be fired straight from a user gesture handler
    events.on('xr.start', () => xrMode.start());
    events.on('xr.end', () => xrMode.end());
    events.on('xr.toggle', () => xrMode.toggle());

    events.on('xr.resetView', () => xrMode.resetView());
    events.on('xr.setSettings', (update: Partial<XrSettings>) => xrMode.setSettings(update));

    events.on('xr.error', (message: string) => {
        events.invoke('showPopup', {
            type: 'error',
            header: localize('popup.vr.error'),
            message: {
                'no-device': localize('popup.vr.no-device'),
                'busy': localize('popup.vr.busy')
            }[message] ?? `${localize('popup.vr.failed')} ${message ?? ''}`.trim()
        });
    });

    // initialize UI
    events.fire('xr.supported', xrMode.supported);
    events.fire('xr.settings', xrMode.getSettings());
};

export { registerXrEvents };
export type { XrSettings };
