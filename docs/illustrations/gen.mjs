// Widget contents for the generated illustrations, built by the real code of
// the integration: the app itself (src/app.js) wired to the fake Gladys of the
// SDK and a fake bus, devices declared with the configuration buttons, then
// telegrams on a made-up morning (Thursday 15 October 2026, Paris time).
// Written as JSON for render.js: node gen.mjs <repo> <out.json>

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (file) => import(pathToFileURL(join(repo, file)).href);
const { createApp } = await load('src/app.js');
const { LANGUAGES } = await load('src/i18n.js');
const { createFakeGladys } = await import(
  pathToFileURL(join(repo, 'node_modules/@gladysassistant/integration-sdk/lib/testing.js')).href
);
const { fakeBus, telegram } = await load('test/helpers.js');

const manifest = JSON.parse(readFileSync(join(repo, 'gladys-assistant-integration.json'), 'utf8'));
const silent = { debug() {}, info() {}, warn() {}, error() {}, child: () => silent };

const NAMES = {
  living: { en: 'Living room', fr: 'Salon', de: 'Wohnzimmer', es: 'Salón' },
  kitchen: { en: 'Kitchen', fr: 'Cuisine', de: 'Küche', es: 'Cocina' },
  bedroom: {
    en: 'Bedroom shutter',
    fr: 'Volet chambre',
    de: 'Rollladen Schlafzimmer',
    es: 'Persiana dormitorio',
  },
  outside: { en: 'Outdoor', fr: 'Extérieur', de: 'Außen', es: 'Exterior' },
  thermostat: { en: 'Living room', fr: 'Séjour', de: 'Wohnzimmer', es: 'Salón' },
  window: {
    en: 'Kitchen window',
    fr: 'Fenêtre cuisine',
    de: 'Küchenfenster',
    es: 'Ventana cocina',
  },
};

/**
 * @description One language: an installation of a dozen declared devices and
 * the last telegrams of the morning.
 * @param {string} language - Language.
 * @returns {Promise<object>} The widget content.
 */
async function content(language) {
  let now = Date.parse('2026-10-15T06:40:00Z');
  const gladys = createFakeGladys({
    config: {
      gateway_host: '192.168.1.50',
      language,
      event_addresses: '0/0/*',
    },
  });
  const bus = fakeBus();
  const app = createApp(gladys, {
    createBus: () => bus,
    logger: silent,
    now: () => now,
    readSpacingMs: 1,
  });
  await gladys.connect();
  await app.start();
  const name = (key) => NAMES[key][language];
  const declare = (action, fields) => gladys.fake.action(action, fields);
  await declare('add_light', { name: name('living'), address: '1/1/1', state_address: '1/1/2' });
  await declare('add_light', {
    name: name('kitchen'),
    address: '1/2/1',
    brightness_address: '1/2/3',
    brightness_state_address: '1/2/4',
  });
  await declare('add_cover', {
    name: name('bedroom'),
    up_down_address: '4/0/1',
    position_address: '4/0/3',
    position_state_address: '4/0/4',
  });
  await declare('add_sensor', {
    name: name('outside'),
    sensor_type: 'temperature',
    address: '3/0/1',
  });
  await declare('add_climate', {
    name: name('thermostat'),
    target_temperature_address: '5/0/1',
    target_temperature_state_address: '5/0/2',
    temperature_address: '5/0/3',
  });
  await declare('add_binary_sensor', {
    name: name('window'),
    sensor_type: 'opening',
    address: '3/1/1',
  });
  for (let index = 0; index < 18; index += 1) {
    await declare('add_switch', {
      name: `${name('kitchen')} ${index + 1}`,
      address: `6/0/${index + 1}`,
    });
  }
  await new Promise((resolve) => setTimeout(resolve, 20));

  // Background traffic of the last minute (sensors sending cyclically).
  now = Date.parse('2026-10-15T06:40:15Z');
  for (let index = 0; index < 31; index += 1) {
    bus.receive(telegram(`7/0/${index}`, '9.001', 20 + index / 10, { source: '1.1.50' }));
  }
  const at = (time, frame) => {
    now = Date.parse(`2026-10-15T${time}Z`);
    bus.receive(frame);
  };
  at('06:40:05', telegram('3/0/1', '9.001', 9.4, { source: '1.1.40' }));
  at('06:40:21', telegram('5/0/3', '9.001', 20.6, { source: '1.1.41' }));
  at('06:40:32', telegram('5/0/2', '9.001', 21, { source: '1.1.41', type: 'response' }));
  at('06:40:40', telegram('3/1/1', '1.019', false, { source: '1.1.33' }));
  at('06:40:51', telegram('4/0/4', '5.001', 35, { source: '1.1.20' }));
  at('06:41:03', telegram('1/2/4', '5.001', 80, { source: '1.1.21' }));
  at('06:41:12', telegram('1/1/2', '1.001', true, { source: '1.1.30', type: 'response' }));

  const ack = await gladys.fake.widgetGet('bus', { settings: {}, language });
  await app.stop();
  return ack.data.content;
}

const contents = {};
for (const language of LANGUAGES) {
  contents[language] = { bus: await content(language) };
}

const [widget] = manifest.widgets;
writeFileSync(
  out,
  JSON.stringify({
    contents,
    images: {},
    cards: { bus: { icon: widget.icon, label: widget.label } },
  }),
);
