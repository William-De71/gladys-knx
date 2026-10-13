// Device kinds, configuration, registry and state publication, unit by unit.
// The Discover tab pitfalls of the Gladys core are checked here: a single
// invalid feature makes the whole discovery list refused, and a missing
// min / max / read_only / has_feedback only fails when the user clicks "Add".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { DEVICE_FEATURE_UNITS } from '@gladysassistant/integration-sdk';

import { normalizeConfig, REGISTRY_KEY, sameConnection } from '../src/config.js';
import {
  BINARY_SENSOR_TYPES,
  buildDevice,
  COVER,
  CommandError,
  definitionFromFields,
  featureSpecs,
  KINDS,
  normalizeDefinition,
  SENSOR_TYPES,
} from '../src/devices.js';
import { createRegistry, parseRegistry, RegistryError } from '../src/registry.js';
import { createStatePublisher } from '../src/states.js';
import { encode, fakeClock, silentLogger } from './helpers.js';

// Category / type pairs labeled by the Gladys front (deviceFeatureCategory in
// front/src/config/i18n/en.json, checked on v5.1.1 and v5.1.4): a pair outside
// this list shows "Device (undefined)" and no icon.
const LABELED_PAIRS = new Set([
  'co2-sensor/integer',
  'counter-sensor/integer',
  'curtain/position',
  'curtain/state',
  'energy-sensor/current',
  'energy-sensor/index',
  'energy-sensor/power',
  'energy-sensor/voltage',
  'humidity-sensor/decimal',
  'leak-sensor/binary',
  'level-sensor/decimal',
  'light-sensor/decimal',
  'light/binary',
  'light/brightness',
  'light/color',
  'light/temperature',
  'motion-sensor/binary',
  'opening-sensor/binary',
  'presence-sensor/binary',
  'pressure-sensor/decimal',
  'rain-sensor/binary',
  'shutter/position',
  'shutter/state',
  'smoke-sensor/binary',
  'speed-sensor/decimal',
  'switch/binary',
  'temperature-sensor/decimal',
  'thermostat/target-temperature',
  'unknown/binary',
]);

const EVERY_ADDRESS = {
  address: '1/1/1',
  state_address: '1/1/2',
  brightness_address: '1/1/3',
  brightness_state_address: '1/1/4',
  color_address: '1/1/5',
  color_state_address: '1/1/6',
  color_temperature_address: '1/1/7',
  color_temperature_state_address: '1/1/8',
  up_down_address: '1/2/1',
  stop_address: '1/2/2',
  position_address: '1/2/3',
  position_state_address: '1/2/4',
  target_temperature_address: '1/3/1',
  target_temperature_state_address: '1/3/2',
  temperature_address: '1/3/3',
};

/** Every variant of every kind, with every address filled. */
function everyVariant() {
  const variants = [];
  for (const kind of Object.keys(KINDS)) {
    const types =
      kind === 'sensor'
        ? Object.keys(SENSOR_TYPES)
        : kind === 'binary_sensor'
          ? Object.keys(BINARY_SENSOR_TYPES)
          : [undefined];
    for (const sensorType of types) {
      for (const coverType of kind === 'cover' ? ['shutter', 'curtain'] : [undefined]) {
        variants.push(
          definitionFromFields(kind, {
            ...EVERY_ADDRESS,
            name: `${kind} ${sensorType ?? coverType ?? ''}`,
            sensor_type: sensorType,
            cover_type: coverType,
          }),
        );
      }
    }
  }
  return variants;
}

test('every feature: a labeled category/type pair, bounds, read_only and has_feedback', () => {
  const gladys = createFakeGladys();
  const units = new Set(Object.values(DEVICE_FEATURE_UNITS));
  for (const definition of everyVariant()) {
    const device = buildDevice(gladys, definition, 'en');
    assert.equal(device.should_poll, false, 'KNX pushes: no poll_frequency, no should_poll');
    assert.equal(device.poll_frequency, undefined);
    for (const feature of device.features) {
      const where = `${definition.kind} ${feature.external_id}`;
      assert.ok(LABELED_PAIRS.has(`${feature.category}/${feature.type}`), where);
      for (const key of ['min', 'max']) {
        assert.equal(typeof feature[key], 'number', `${where} ${key}`);
      }
      assert.ok(feature.min < feature.max, where);
      assert.equal(typeof feature.read_only, 'boolean', `${where} read_only`);
      assert.equal(typeof feature.has_feedback, 'boolean', `${where} has_feedback`);
      if (feature.unit !== undefined) {
        assert.ok(units.has(feature.unit), `${where} unit ${feature.unit}`);
      }
      assert.ok(feature.name.startsWith(definition.name), 'distinguishable by the device name');
    }
  }
});

test('the whole discovery list of every variant is accepted by the fake Gladys', async () => {
  const gladys = createFakeGladys();
  await gladys.connect();
  const devices = everyVariant().map((definition, index) =>
    buildDevice(gladys, { ...definition, id: `${definition.id}-${index}` }, 'de'),
  );
  const result = await gladys.publishDiscoveredDevices(devices);
  assert.equal(result.count, devices.length);
});

test('external ids: kind and main group address, never the name', () => {
  const gladys = createFakeGladys();
  const light = definitionFromFields('light', { name: 'Salon', address: '1/515' });
  assert.equal(buildDevice(gladys, light, 'en').external_id, 'ext:test-integration:light:1-2-3');
  const renamed = definitionFromFields('light', { name: 'Séjour', address: '1/2/3' });
  assert.equal(buildDevice(gladys, renamed, 'en').external_id, 'ext:test-integration:light:1-2-3');
  const cover = definitionFromFields('cover', { name: 'Volet', position_address: '4/0/3' });
  assert.equal(cover.id, '4-0-3', 'a cover without up/down address: the position address');
  assert.throws(() => definitionFromFields('cover', { name: 'Volet' }), CommandError);
  assert.throws(
    () => definitionFromFields('climate', { name: 'Séjour', temperature_address: '1/1/1' }),
    CommandError,
  );
});

test('decoders: light, cover, thermostat, binary sensors', () => {
  const specs = (kind, fields) =>
    Object.fromEntries(
      featureSpecs(definitionFromFields(kind, { name: 'x', ...fields })).map((spec) => [
        spec.key,
        spec,
      ]),
    );
  const light = specs('light', {
    address: '1/1/1',
    color_state_address: '1/1/6',
    color_temperature_state_address: '1/1/8',
    min_kelvin: 2000,
    max_kelvin: 6500,
  });
  assert.equal(light.color.decode(encode('232.600', { red: 255, green: 128, blue: 0 })), 0xff8000);
  assert.equal(light.color.read_only, true, 'status only: read only');
  assert.equal(light.color_temperature.decode(encode('7.600', 4000)), 250);
  assert.equal(light.color_temperature.min, 154);
  assert.equal(light.color_temperature.max, 500);

  const cover = specs('cover', {
    up_down_address: '4/0/1',
    stop_address: '4/0/2',
    position_state_address: '4/0/4',
  });
  assert.equal(cover.state.decode(encode('1.008', true), '4/0/1'), COVER.CLOSE);
  assert.equal(cover.state.decode(encode('1.008', false), '4/0/1'), COVER.OPEN);
  assert.equal(cover.state.decode(encode('1.010', true), '4/0/2'), COVER.STOP);
  assert.equal(
    cover.position.decode(encode('5.001', 100)),
    0,
    'KNX 100 % closed = Gladys 0 % open',
  );
  assert.equal(cover.position.read_only, true);

  const inverted = specs('cover', { position_address: '4/0/3', invert_position: true });
  assert.equal(inverted.position.decode(encode('5.001', 100)), 100);

  const contact = specs('binary_sensor', { address: '3/1/1', sensor_type: 'opening' });
  assert.equal(contact.value.decode(encode('1.019', true)), 0, 'open window = 0 in Gladys');
  const invertedContact = specs('binary_sensor', {
    address: '3/1/1',
    sensor_type: 'opening',
    invert: true,
  });
  assert.equal(invertedContact.value.decode(encode('1.019', true)), 1);
  const motion = specs('binary_sensor', { address: '3/1/2', sensor_type: 'motion' });
  assert.equal(motion.value.decode(encode('1.001', true)), 1);

  const climate = specs('climate', {
    target_temperature_address: '5/0/1',
    temperature_address: '5/0/3',
    min_temperature: 30,
    max_temperature: 10,
  });
  assert.equal(climate.target_temperature.min, 10, 'bounds put back in order');
  assert.equal(climate.target_temperature.max, 30);
  assert.equal(climate.target_temperature.step, 0.5);
  assert.equal(climate.target_temperature.command.encode(35), 30, 'a setpoint stays in its bounds');
  assert.equal(climate.temperature.decode(encode('14.068', 19.25)), 19.25);
});

test('cover commands: up/down first, a position otherwise, stop needs its address', () => {
  const both = definitionFromFields('cover', {
    name: 'x',
    up_down_address: '4/0/1',
    position_address: '4/0/3',
  });
  assert.deepEqual(KINDS.cover.coverCommand(both, COVER.OPEN), {
    address: '4/0/1',
    dpt: '1.008',
    value: false,
  });
  assert.throws(() => KINDS.cover.coverCommand(both, COVER.STOP), /errorNoStopAddress/);
  const position = definitionFromFields('cover', { name: 'x', position_address: '4/0/3' });
  assert.deepEqual(KINDS.cover.coverCommand(position, COVER.CLOSE), {
    address: '4/0/3',
    dpt: '5.001',
    value: 100,
  });
  assert.deepEqual(KINDS.cover.coverCommand(position, COVER.OPEN), {
    address: '4/0/3',
    dpt: '5.001',
    value: 0,
  });
});

test('stored definitions: read back, completed, bad entries skipped', () => {
  const good = definitionFromFields('switch', { name: 'Prise', address: '2/0/1' });
  const parsed = parseRegistry(
    JSON.stringify([
      good,
      good,
      { kind: 'toaster', name: 'x' },
      { kind: 'sensor', name: 'Old', addresses: { address: '3/0/1' } },
    ]),
    silentLogger,
  );
  assert.deepEqual(
    parsed.map((definition) => [definition.kind, definition.id, definition.options]),
    [
      ['switch', '2-0-1', { invert: false }],
      ['sensor', '3-0-1', { sensor_type: 'temperature' }],
    ],
  );
  assert.deepEqual(parseRegistry('{not json', silentLogger), []);
  assert.equal(normalizeDefinition({ kind: 'light', name: 'x', addresses: {} }), null);
});

test('the registry saves through setConfig and keeps memory and Gladys in step', async () => {
  const gladys = createFakeGladys();
  await gladys.connect();
  const registry = createRegistry(gladys, silentLogger);
  registry.load({});
  const plug = definitionFromFields('switch', { name: 'Prise', address: '2/0/1' });
  const light = definitionFromFields('light', { name: 'Salon', address: '1/1/1' });
  // Two quick buttons: both kept, in order.
  await Promise.all([registry.upsert(plug), registry.upsert(light)]);
  assert.deepEqual(
    gladys.fake.config[REGISTRY_KEY].map((definition) => definition.name),
    ['Prise', 'Salon'],
  );
  await assert.rejects(
    registry.upsert(definitionFromFields('sensor', { name: 'x', address: '2/0/1' })),
    RegistryError,
  );
  assert.equal(registry.byExternalId('ext:test-integration:switch:2-0-1').name, 'Prise');

  gladys.setConfig = async () => {
    throw new Error('Gladys is restarting');
  };
  await assert.rejects(registry.remove(plug), /restarting/);
  assert.equal(registry.list().length, 2, 'a failed save changes nothing');
});

test('configuration: defaults, routing and secure requirements, patterns', () => {
  const defaults = normalizeConfig({});
  assert.deepEqual(defaults.connection, {
    mode: 'tunnel_udp',
    host: null,
    port: 3671,
    individualAddress: null,
    secure: null,
  });
  assert.equal(defaults.needsScan, true);
  assert.equal(defaults.syncIntervalMs, 60 * 60 * 1000);
  assert.equal(defaults.language, 'en');

  const typed = normalizeConfig({
    gateway_host: ' 192.168.1.50 ',
    gateway_port: '3672',
    sync_interval_minutes: '0',
    individual_address: '1.1.300',
  });
  assert.equal(typed.connection.host, '192.168.1.50');
  assert.equal(typed.connection.port, 3672);
  assert.equal(typed.needsScan, false);
  assert.equal(typed.syncIntervalMs, 0);
  assert.deepEqual(typed.problems, ['configInvalidIndividualAddress'], 'reported, not blocking');

  assert.equal(normalizeConfig({ gateway_host: '999.1.1.1' }).connection, null);
  assert.equal(
    normalizeConfig({ gateway_host: 'knx-gateway.local' }).connection.host,
    'knx-gateway.local',
  );
  const routing = normalizeConfig({ connection_mode: 'routing' });
  assert.equal(routing.connection, null);
  assert.deepEqual(routing.problems, ['configRoutingAddress']);
  assert.equal(
    normalizeConfig({ connection_mode: 'routing', individual_address: '1.1.250' }).needsScan,
    false,
  );

  const secure = normalizeConfig({
    connection_mode: 'tunnel_tcp',
    gateway_host: '192.168.1.50',
    secure: true,
    secure_tunnel_address: '1.1.254',
    secure_password: 'p',
    secure_user_id: '4',
  });
  assert.deepEqual(secure.connection.secure, {
    tunnelAddress: '1.1.254',
    userId: 4,
    password: 'p',
    deviceAuthentication: null,
  });
  assert.deepEqual(normalizeConfig({ secure: true, gateway_host: 'x.local' }).problems, [
    'configSecureTunnelAddress',
    'configSecurePassword',
  ]);
  assert.deepEqual(normalizeConfig({ event_addresses: '1/0/*, nope' }).invalidEvents, ['nope']);
  assert.ok(
    sameConnection(normalizeConfig({}).connection, normalizeConfig({ language: 'fr' }).connection),
  );
});

test('state publication: coalesced, only created devices, paused on a 429', async () => {
  const gladys = createFakeGladys();
  await gladys.connect();
  const clock = fakeClock();
  const created = new Set(['ext:test-integration:sensor:3-0-1']);
  const states = createStatePublisher(gladys, {
    logger: silentLogger,
    now: clock.now,
    isCreated: (id) => created.has(id),
  });
  states.push('ext:test-integration:sensor:3-0-1:value', 20);
  states.push('ext:test-integration:sensor:3-0-1:value', 21);
  states.push('ext:test-integration:sensor:3-0-2:value', 5);
  assert.equal(states.pendingCount(), 1, 'newest value only, created devices only');
  assert.equal(await states.flush(), 1);
  assert.equal(gladys.fake.lastState('ext:test-integration:sensor:3-0-1:value'), 21);

  const original = gladys.publishChangedStates.bind(gladys);
  gladys.publishChangedStates = async () => {
    const error = new Error('Too many requests');
    error.status = 429;
    throw error;
  };
  states.push('ext:test-integration:sensor:3-0-1:value', 22);
  assert.equal(await states.flush(), 0);
  gladys.publishChangedStates = original;
  assert.equal(await states.flush(), 0, 'paused');
  clock.advance(31000);
  assert.equal(await states.flush(), 1, 'sent after the pause');

  created.add('ext:test-integration:sensor:3-0-2');
  states.republish('ext:test-integration:sensor:3-0-2');
  assert.equal(await states.flush(), 1, 'the value known before the creation');
  assert.equal(gladys.fake.lastState('ext:test-integration:sensor:3-0-2:value'), 5);
  states.stop();
});
