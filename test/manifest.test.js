// The manifest and the code agree: every declared action, trigger, widget and
// configuration key has its code, every version says the same thing, and the
// manifest respects what the store and the Gladys core expect.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ACTIONS } from '../src/app.js';
import { DEFAULTS, LANGUAGES, MODES } from '../src/config.js';
import { BINARY_SENSOR_TYPES, COVER_TYPES, KINDS, SENSOR_TYPES } from '../src/devices.js';
import { KNX_PORT } from '../src/knx/discovery.js';
import { SCENE_ACTIONS, TRIGGERS } from '../src/scenes.js';
import { DEFAULT_MAX_TELEGRAMS, WIDGET_KEY } from '../src/widgets.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const manifest = JSON.parse(read('gladys-assistant-integration.json'));
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));

test('one version everywhere, image of this repository', () => {
  assert.equal(manifest.version, pkg.version);
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.equal(manifest.docker_image, `ghcr.io/william-de71/gladys-knx:${pkg.version}`);
  assert.equal(pkg.license, 'Apache-2.0');
  assert.match(
    manifest.cover_image,
    /^https:\/\/raw\.githubusercontent\.com\/William-De71\/gladys-knx\/main\/cover\.jpg$/,
  );
});

test('store rules: type, Gladys version, transports, categories, permissions', () => {
  assert.equal(manifest.type, 'device');
  // widgets and scene_* need 5.1.0; 5.1.1 fixes the widget card dates.
  assert.equal(manifest.gladys_version, '>=5.1.1');
  // The interface is on the local network: nothing leaves it.
  assert.deepEqual(manifest.transports, ['local']);
  assert.deepEqual(manifest.categories, ['protocols', 'lighting', 'climate']);
  assert.equal(manifest.name, 'KNX');
  // Only the permission the code uses: the search of the KNX IP interfaces.
  assert.deepEqual(manifest.network_discovery, [
    { type: 'udp-active-broadcast', ports: [KNX_PORT] },
  ]);
  for (const key of ['location', 'network_wake', 'containers', 'webhooks']) {
    assert.equal(manifest[key], undefined, key);
  }
});

test('configuration: keys, defaults and choices of the code', () => {
  const fields = Object.fromEntries(manifest.config_schema.map((field) => [field.key, field]));
  const values = (field) => field.options.map((option) => option.value);
  assert.deepEqual(values(fields.connection_mode), MODES);
  assert.deepEqual(values(fields.language), LANGUAGES);
  for (const [key, value] of Object.entries(DEFAULTS)) {
    assert.equal(fields[key].default, value, key);
  }
  assert.equal(fields.secure_password.type, 'secret');
  assert.equal(fields.secure_device_authentication.type, 'secret');
  // `text` / `password` are refused by the store.
  for (const field of manifest.config_schema) {
    assert.ok(
      ['string', 'number', 'boolean', 'select', 'secret', 'section'].includes(field.type),
      field.key,
    );
  }
  assert.equal(fields.knx_devices, undefined, 'the registry key stays outside the schema');
});

test('the declaration buttons: one per kind, the address fields of the code', () => {
  const actions = Object.fromEntries(manifest.actions.map((action) => [action.key, action]));
  assert.deepEqual(
    Object.keys(actions).sort(),
    [...Object.values(ACTIONS), ...Object.values(KINDS).map((kind) => kind.action)].sort(),
  );
  for (const kind of Object.values(KINDS)) {
    const fields = Object.fromEntries(actions[kind.action].fields.map((f) => [f.key, f]));
    assert.equal(fields.name.required, true, `${kind.action} name`);
    for (const key of kind.addresses) {
      assert.equal(fields[key]?.type, 'string', `${kind.action}.${key}`);
      assert.equal(
        Boolean(fields[key].required),
        kind.required.includes(key),
        `${kind.action}.${key}`,
      );
    }
  }
  const options = (action, key) =>
    actions[action].fields.find((field) => field.key === key).options.map((option) => option.value);
  assert.deepEqual(options('add_sensor', 'sensor_type'), Object.keys(SENSOR_TYPES));
  assert.deepEqual(options('add_binary_sensor', 'sensor_type'), Object.keys(BINARY_SENSOR_TYPES));
  assert.deepEqual(options('add_cover', 'cover_type'), COVER_TYPES);
});

test('scene triggers: the keys the code fires, their filters in the event data', () => {
  const triggers = Object.fromEntries(
    manifest.scene_triggers.map((trigger) => [trigger.key, trigger]),
  );
  assert.deepEqual(Object.keys(triggers).sort(), Object.values(TRIGGERS).sort());
  const data = {
    telegram_received: [
      'group_address',
      'source_address',
      'telegram_type',
      'value',
      'numeric_value',
      'raw',
    ],
    connection_lost: ['gateway', 'reason'],
    connection_restored: ['gateway', 'downtime_seconds'],
  };
  for (const [key, keys] of Object.entries(data)) {
    assert.deepEqual(
      triggers[key].variables.map((variable) => variable.key),
      keys,
      `${key} variables`,
    );
    for (const field of triggers[key].fields ?? []) {
      assert.ok(keys.includes(field.key), `${key} filter ${field.key} is in the event data`);
    }
  }
});

test('scene actions and the widget: the keys of the code', () => {
  assert.deepEqual(
    manifest.scene_actions.map((action) => action.key).sort(),
    Object.values(SCENE_ACTIONS).sort(),
  );
  const read = manifest.scene_actions.find((action) => action.key === SCENE_ACTIONS.READ);
  assert.deepEqual(
    read.outputs.map((output) => output.key),
    ['value', 'numeric_value', 'raw'],
  );
  assert.deepEqual(
    manifest.widgets.map((widget) => widget.key),
    [WIDGET_KEY],
  );
  const settings = Object.fromEntries(manifest.widgets[0].settings.map((s) => [s.key, s]));
  assert.equal(settings.max_telegrams.default, DEFAULT_MAX_TELEGRAMS);
  assert.equal(settings.max_telegrams.max, 8);
});
