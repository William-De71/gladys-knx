// The whole integration against the fake Gladys of the SDK
// (`@gladysassistant/integration-sdk/testing`) and a fake KNX bus
// (test/helpers.js): declaration, discovery, telegrams -> states, commands
// -> telegrams, scenes, widget, connection.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import { createApp } from '../src/app.js';
import { REGISTRY_KEY } from '../src/config.js';
import { COVER } from '../src/devices.js';
import {
  buildSearchResponse,
  encode,
  fakeBus,
  fakeClock,
  flush,
  silentLogger,
  sleep,
  telegram,
} from './helpers.js';

const MANIFEST = JSON.parse(
  readFileSync(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

const CONFIG = { gateway_host: '192.168.1.50', connection_mode: 'tunnel_udp', language: 'fr' };

const LIGHT = {
  name: 'Salon',
  address: '1/1/1',
  state_address: '1/1/2',
  brightness_address: '1/1/3',
  brightness_state_address: '1/1/4',
};

const ext = (suffix) => `ext:test-integration:${suffix}`;

/**
 * @description An integration wired to the fake Gladys and a fake bus.
 * @param {object} [options] - `{ config, devices, scanResults, connect }`.
 * @returns {Promise<object>} `{ gladys, fake, app, bus, clock }`.
 */
async function setup({ config = CONFIG, devices = [], scanResults, connect = true } = {}) {
  const gladys = createFakeGladys({ config: structuredClone(config), devices, scanResults });
  const bus = fakeBus();
  bus.autoConnect = connect;
  const clock = fakeClock();
  const app = createApp(gladys, {
    createBus: () => bus,
    logger: silentLogger,
    now: clock.now,
    readSpacingMs: 1,
    readTimeoutMs: 50,
  });
  await gladys.connect();
  await app.start();
  await flush();
  return { gladys, fake: gladys.fake, app, bus, clock };
}

/** A device as Gladys stores it once the user added it from Discover. */
const createdDevice = (fake, externalId) =>
  structuredClone(fake.discoveredDevices.find((device) => device.external_id === externalId));

const ok = (ack) => {
  assert.equal(ack.success, true, ack.error);
  return ack.data;
};

/** The message of a configuration button or a widget button. */
const msg = (ack) => ok(ack).message;

test('a light declared with the button is offered in the Discover tab and stored in the config', async () => {
  const { fake, app } = await setup();
  try {
    const message = msg(await fake.action('add_light', LIGHT));
    assert.match(message.fr, /« Salon » déclaré/);
    assert.equal(Object.keys(message).length, 4, 'four languages');

    const stored = fake.config[REGISTRY_KEY];
    assert.equal(stored.length, 1);
    assert.deepEqual(stored[0].addresses, LIGHT_ADDRESSES);

    const device = fake.discoveredDevices.find((d) => d.external_id === ext('light:1-1-1'));
    assert.ok(device, 'published in discovery');
    assert.equal(device.should_poll, false);
    assert.deepEqual(
      device.features.map((feature) => [feature.external_id, feature.category, feature.type]),
      [
        [ext('light:1-1-1:switch'), 'light', 'binary'],
        [ext('light:1-1-1:brightness'), 'light', 'brightness'],
      ],
    );
    assert.equal(
      device.features[0].name,
      'Salon - Marche/arrêt',
      'feature names in the config language',
    );
    assert.ok(
      device.params.some((param) => param.name === 'KNX_STATE_ADDRESS' && param.value === '1/1/2'),
    );
  } finally {
    await app.stop();
  }
});

const LIGHT_ADDRESSES = {
  address: '1/1/1',
  state_address: '1/1/2',
  brightness_address: '1/1/3',
  brightness_state_address: '1/1/4',
};

test('the same main address updates the declaration, an invalid address is refused', async () => {
  const { fake, app } = await setup();
  try {
    msg(await fake.action('add_light', LIGHT));
    const updated = msg(await fake.action('add_light', { ...LIGHT, name: 'Salon bis' }));
    assert.match(updated.en, /updated/);
    assert.equal(fake.config[REGISTRY_KEY].length, 1);
    assert.equal(fake.config[REGISTRY_KEY][0].name, 'Salon bis');

    const refused = msg(await fake.action('add_switch', { name: 'Prise', address: '32/0/0' }));
    assert.match(refused.en, /not a group address/);
    const missing = msg(await fake.action('add_switch', { name: 'Prise' }));
    assert.match(missing.fr, /obligatoire/);
    const taken = msg(await fake.action('add_switch', { name: 'Prise', address: '1/1/1' }));
    assert.match(taken.en, /already the one of “Salon bis”/);
    assert.equal(fake.config[REGISTRY_KEY].length, 1, 'nothing stored on a refusal');
  } finally {
    await app.stop();
  }
});

test('the declarations survive a restart (read back from the config)', async () => {
  const first = await setup();
  msg(await first.fake.action('add_switch', { name: 'Prise', address: '2/0/1' }));
  const stored = structuredClone(first.fake.config);
  await first.app.stop();

  const second = await setup({ config: stored });
  try {
    const list = msg(await second.fake.action('list_devices'));
    assert.match(list.en, /1 declared devices: Prise \(switch, 2\/0\/1\)/);
    assert.ok(second.fake.discoveredDevices.some((d) => d.external_id === ext('switch:2-0-1')));
  } finally {
    await second.app.stop();
  }
});

test('telegrams update only the devices the user added, with every known value at creation', async () => {
  const { fake, app, bus } = await setup();
  try {
    msg(await fake.action('add_light', LIGHT));
    bus.receive(telegram('1/1/2', '1.001', true, { type: 'response' }));
    bus.receive(telegram('1/1/4', '5.001', 42));
    await app.flushStates();
    assert.equal(fake.states.length, 0, 'not created yet: nothing sent to Gladys');

    const device = createdDevice(fake, ext('light:1-1-1'));
    fake.devices.push(device);
    await fake.deviceCreated(device);
    await app.flushStates();
    assert.equal(fake.lastState(ext('light:1-1-1:switch')), 1);
    assert.equal(fake.lastState(ext('light:1-1-1:brightness')), 42);

    // A wall switch writes on the command address: the state follows.
    bus.receive(telegram('1/1/1', '1.001', false, { source: '1.1.30' }));
    await app.flushStates();
    assert.equal(fake.lastState(ext('light:1-1-1:switch')), 0);

    const count = fake.states.length;
    bus.receive(telegram('1/1/1', '1.001', false));
    await app.flushStates();
    assert.equal(fake.states.length, count, 'an unchanged value is not published again');
  } finally {
    await app.stop();
  }
});

test('the status addresses are read at connection and when a device is added', async () => {
  const { fake, app, bus } = await setup();
  try {
    msg(await fake.action('add_light', LIGHT));
    msg(
      await fake.action('add_sensor', {
        name: 'Météo',
        sensor_type: 'temperature',
        address: '3/0/1',
      }),
    );
    await sleep(20);
    bus.reads.length = 0;
    bus.drop();
    bus.connect();
    await sleep(20);
    assert.deepEqual(bus.reads.sort(), ['1/1/2', '1/1/4', '3/0/1']);
  } finally {
    await app.stop();
  }
});

test('commands become telegrams with the right datapoint types', async () => {
  const { fake, app, bus } = await setup();
  try {
    ok(
      await fake.action('add_light', {
        ...LIGHT,
        color_address: '1/1/5',
        color_temperature_address: '1/1/6',
      }),
    );
    ok(
      await fake.action('add_cover', {
        name: 'Volet',
        up_down_address: '4/0/1',
        stop_address: '4/0/2',
        position_address: '4/0/3',
        position_state_address: '4/0/4',
      }),
    );
    msg(await fake.action('add_climate', { name: 'Séjour', target_temperature_address: '5/0/1' }));
    msg(await fake.action('add_switch', { name: 'Pompe', address: '6/0/1', invert: true }));
    const light = createdDevice(fake, ext('light:1-1-1'));
    const cover = createdDevice(fake, ext('cover:4-0-1'));
    const climate = createdDevice(fake, ext('climate:5-0-1'));
    const pump = createdDevice(fake, ext('switch:6-0-1'));
    const feature = (device, key) => device.features.find((f) => f.external_id.endsWith(`:${key}`));

    ok(await fake.setValue(light, feature(light, 'switch'), 1));
    ok(await fake.setValue(light, feature(light, 'brightness'), 42));
    ok(await fake.setValue(light, feature(light, 'color'), 0xff8000));
    ok(await fake.setValue(light, feature(light, 'color_temperature'), 250));
    ok(await fake.setValue(cover, feature(cover, 'state'), COVER.CLOSE));
    ok(await fake.setValue(cover, feature(cover, 'state'), COVER.OPEN));
    ok(await fake.setValue(cover, feature(cover, 'state'), COVER.STOP));
    ok(await fake.setValue(cover, feature(cover, 'position'), 30));
    ok(await fake.setValue(climate, feature(climate, 'target_temperature'), 21.5));
    ok(await fake.setValue(pump, feature(pump, 'switch'), 1));

    assert.deepEqual(bus.writes, [
      { address: '1/1/1', value: true, dpt: '1.001' },
      { address: '1/1/3', value: 42, dpt: '5.001' },
      { address: '1/1/5', value: { red: 255, green: 128, blue: 0 }, dpt: '232.600' },
      { address: '1/1/6', value: 4000, dpt: '7.600' },
      { address: '4/0/1', value: true, dpt: '1.008' },
      { address: '4/0/1', value: false, dpt: '1.008' },
      { address: '4/0/2', value: true, dpt: '1.010' },
      // Gladys 30 % open = KNX 70 % closed.
      { address: '4/0/3', value: 70, dpt: '5.001' },
      { address: '5/0/1', value: 21.5, dpt: '9.001' },
      { address: '6/0/1', value: false, dpt: '1.001' },
    ]);
  } finally {
    await app.stop();
  }
});

test('a command fails clearly: bus down, read-only feature, device no longer declared', async () => {
  const { fake, app, bus } = await setup();
  try {
    msg(
      await fake.action('add_sensor', {
        name: 'Météo',
        sensor_type: 'temperature',
        address: '3/0/1',
      }),
    );
    msg(await fake.action('add_switch', { name: 'Prise', address: '2/0/1' }));
    const sensor = createdDevice(fake, ext('sensor:3-0-1'));
    const plug = createdDevice(fake, ext('switch:2-0-1'));

    const readOnly = await fake.setValue(sensor, sensor.features[0], 1);
    assert.equal(readOnly.success, false);
    assert.match(readOnly.error, /lecture seule/);

    bus.drop();
    const down = await fake.setValue(plug, plug.features[0], 1);
    assert.equal(down.success, false);
    assert.match(down.error, /n’est pas connecté/);

    bus.connect();
    msg(await fake.action('remove_device', { device: 'Prise' }));
    const gone = await fake.setValue(plug, plug.features[0], 1);
    assert.equal(gone.success, false);
    assert.match(gone.error, /plus déclaré/);
  } finally {
    await app.stop();
  }
});

test('a feature without feedback: the next telegram is published even if equal to the last one', async () => {
  const { fake, app, bus } = await setup();
  try {
    msg(await fake.action('add_switch', { name: 'Prise', address: '2/0/1' }));
    const plug = createdDevice(fake, ext('switch:2-0-1'));
    fake.devices.push(plug);
    await fake.deviceCreated(plug);
    bus.receive(telegram('2/0/1', '1.001', false));
    await app.flushStates();
    const before = fake.states.length;

    // Gladys turns it on (and saves 1 itself: no feedback), the wall switch turns it off.
    ok(await fake.setValue(plug, plug.features[0], 1));
    bus.receive(telegram('2/0/1', '1.001', false));
    await app.flushStates();
    assert.equal(fake.states.length, before + 1);
    assert.equal(fake.lastState(ext('switch:2-0-1:switch')), 0);
  } finally {
    await app.stop();
  }
});

test('sensors: sizes, units and conversions', async () => {
  const { fake, app, bus } = await setup();
  try {
    const sensors = [
      ['temperature', '3/0/1', '9.001', 21.5, 21.5],
      ['pressure', '3/0/2', '9.006', 101325, 1012.5],
      ['power', '3/0/3', '9.024', 1.5, 1500],
      ['energy_wh', '3/0/4', '13.010', 123456, 123.456],
      ['co2', '3/0/5', '9.008', 612, 612],
    ];
    for (const [type, address] of sensors) {
      msg(await fake.action('add_sensor', { name: `S ${type}`, sensor_type: type, address }));
    }
    msg(
      await fake.action('add_binary_sensor', {
        name: 'Fenêtre',
        sensor_type: 'opening',
        address: '3/1/1',
      }),
    );
    for (const device of [...fake.discoveredDevices]) {
      fake.devices.push(structuredClone(device));
      await fake.deviceCreated(device);
    }
    for (const [, address, dpt, value] of sensors) {
      bus.receive(telegram(address, dpt, value));
    }
    // A 4-byte temperature (DPT 14.068) on a temperature sensor.
    bus.receive(telegram('3/0/1', '14.068', 22.25));
    bus.receive(telegram('3/1/1', '1.019', true)); // window open
    await app.flushStates();
    assert.equal(fake.lastState(ext('sensor:3-0-1:value')), 22.25);
    assert.equal(
      fake.lastState(ext('sensor:3-0-2:value')),
      1012.5,
      'DPT 9 keeps 3 significant digits',
    );
    assert.equal(fake.lastState(ext('sensor:3-0-3:value')), 1500);
    assert.equal(fake.lastState(ext('sensor:3-0-4:value')), 123.456);
    assert.equal(fake.lastState(ext('sensor:3-0-5:value')), 612);
    assert.equal(fake.lastState(ext('binary_sensor:3-1-1:value')), 0, 'Gladys: 0 = open');

    const states = fake.states.length;
    bus.receive({ destination: '3/0/2', source: '1.1.1', type: 'write', data: Buffer.from([1]) });
    await app.flushStates();
    assert.equal(fake.states.length, states, 'a telegram of the wrong size is ignored');
  } finally {
    await app.stop();
  }
});

test('the state publication stays under the Gladys rate limit', async () => {
  const { fake, app, bus } = await setup();
  try {
    for (let index = 1; index <= 150; index += 1) {
      const address = `7/${Math.floor(index / 100)}/${index % 100}`;
      msg(
        await fake.action('add_sensor', { name: `T${index}`, sensor_type: 'temperature', address }),
      );
    }
    for (const device of [...fake.discoveredDevices]) {
      fake.devices.push(structuredClone(device));
      await fake.deviceCreated(device);
    }
    fake.requests.length = 0;
    for (let index = 1; index <= 150; index += 1) {
      bus.receive(
        telegram(`7/${Math.floor(index / 100)}/${index % 100}`, '9.001', 20 + index / 10),
      );
    }
    const first = await app.flushStates();
    assert.ok(first <= 100, `${first} states in one go`);
    const second = await app.flushStates();
    assert.ok(first + second < 150, 'the rest waits for the bucket to refill');
  } finally {
    await app.stop();
  }
});

test('telegram_received fires for the configured addresses only, with the decoded value', async () => {
  const { fake, app, bus } = await setup({
    config: { ...CONFIG, event_addresses: '1/0/*, 2/1/5:9.001' },
  });
  try {
    bus.receive(telegram('1/0/7', '1.001', true, { source: '1.1.40' }));
    bus.receive(telegram('2/1/5', '9.001', 18.5));
    bus.receive(telegram('2/1/6', '9.001', 18.5));
    // Our own telegram sent back by the interface: never a trigger (loop risk).
    ok(await fake.sceneAction('send_value', { group_address: '1/0/8', dpt: '1.001', value: 'on' }));
    bus.receive(telegram('1/0/8', '1.001', true));
    await flush();
    assert.deepEqual(
      fake.sceneEvents
        .filter((event) => event.key === 'telegram_received')
        .map((event) => event.data),
      [
        {
          group_address: '1/0/7',
          source_address: '1.1.40',
          telegram_type: 'write',
          value: '',
          numeric_value: null,
          raw: '01',
        },
        {
          group_address: '2/1/5',
          source_address: '1.1.12',
          telegram_type: 'write',
          value: '18.5',
          numeric_value: 18.5,
          raw: encode('9.001', 18.5).toString('hex'),
        },
      ],
    );
  } finally {
    await app.stop();
  }
});

test('connection lost and restored fire once each, after a first connection', async () => {
  const { fake, app, bus, clock } = await setup();
  try {
    bus.drop('timeout');
    bus.drop('timeout');
    clock.advance(42000);
    bus.connect();
    await flush();
    const events = fake.sceneEvents.map((event) => [event.key, event.data]);
    assert.deepEqual(events, [
      ['connection_lost', { gateway: '192.168.1.50:3671 (UDP)', reason: 'timeout' }],
      ['connection_restored', { gateway: '192.168.1.50:3671 (UDP)', downtime_seconds: 42 }],
    ]);
    assert.equal(fake.connectionStatus.connected, true);
    assert.match(fake.connectionStatus.message.fr, /Connecté au bus KNX via 192\.168\.1\.50/);
  } finally {
    await app.stop();
  }
});

test('scene actions: send a value, recall a scene, read a value', async () => {
  const { fake, app, bus } = await setup();
  try {
    ok(await fake.sceneAction('send_value', { group_address: '1/0/1', dpt: '1.001', value: 'on' }));
    ok(
      await fake.sceneAction('send_value', { group_address: '1/515', dpt: '9.001', value: '21,5' }),
    );
    ok(
      await fake.sceneAction('send_value', {
        group_address: '1/0/3',
        dpt: '232.600',
        value: '#ff8000',
      }),
    );
    ok(await fake.sceneAction('recall_scene', { group_address: '0/0/9', scene_number: 5 }));
    assert.deepEqual(bus.writes, [
      { address: '1/0/1', value: true, dpt: '1.001' },
      { address: '1/2/3', value: 21.5, dpt: '9.001' },
      { address: '1/0/3', value: { red: 255, green: 128, blue: 0 }, dpt: '232.600' },
      { address: '0/0/9', value: 4, dpt: '17.001' },
    ]);

    const badDpt = await fake.sceneAction('send_value', {
      group_address: '1/0/1',
      dpt: '99.999',
      value: '1',
    });
    assert.equal(badDpt.success, false);
    const badValue = await fake.sceneAction('send_value', {
      group_address: '1/0/1',
      dpt: '9.001',
      value: 'warm',
    });
    assert.equal(badValue.success, false);
    assert.match(badValue.error, /warm/);
    const badScene = await fake.sceneAction('recall_scene', {
      group_address: '0/0/9',
      scene_number: 65,
    });
    assert.equal(badScene.success, false);

    const reading = fake.sceneAction('read_value', { group_address: '3/0/1', dpt: '9.001' });
    await flush();
    assert.deepEqual(bus.reads.slice(-1), ['3/0/1']);
    bus.receive(telegram('3/0/1', '9.001', 19.5, { type: 'response' }));
    const answer = ok(await reading);
    assert.deepEqual(answer, {
      outputs: { value: '19.5', numeric_value: 19.5, raw: encode('9.001', 19.5).toString('hex') },
    });

    const silent = await fake.sceneAction('read_value', { group_address: '3/0/2', dpt: '9.001' });
    assert.equal(silent.success, false);
    assert.match(silent.error, /Pas de réponse de 3\/0\/2/);
  } finally {
    await app.stop();
  }
});

test('the bus widget: valid content, monitor with device names, buttons', async () => {
  const { fake, app, bus } = await setup();
  try {
    msg(await fake.action('add_light', LIGHT));
    bus.receive(telegram('1/1/2', '1.001', true, { type: 'response' }));
    bus.receive(telegram('9/9/9', '5.001', 10));
    for (const language of ['en', 'fr', 'de', 'es']) {
      const { content } = ok(await fake.widgetGet('bus', { settings: {}, language }));
      assert.deepEqual(validateWidgetContent(content), [], language);
    }
    const { content } = ok(await fake.widgetGet('bus', { settings: { group_filter: '1/*' } }));
    const cards = content.components.find((component) => component.type === 'card-list');
    assert.deepEqual(
      cards.items.map((item) => item.title),
      ['1/1/2 · Salon'],
    );
    assert.equal(cards.items[0].badge.text.fr, 'On');

    bus.reads.length = 0;
    const toast = msg(await fake.widgetAction('bus', 'read_all'));
    assert.match(toast.en, /2 group addresses/);
    const reconnect = msg(await fake.widgetAction('bus', 'reconnect'));
    assert.match(reconnect.fr, /Reconnexion/);
  } finally {
    await app.stop();
  }
});

test('an empty interface address: the scan finds the interface', async () => {
  const response = buildSearchResponse({ host: '192.168.1.77', name: 'MDT IP Interface' });
  const { fake, app, bus } = await setup({
    config: { connection_mode: 'tunnel_udp' },
    scanResults: {
      'udp-active-broadcast': [
        {
          source_ip: '192.168.1.77',
          source_port: 3671,
          payload_base64: response.toString('base64'),
        },
      ],
    },
  });
  try {
    assert.equal(fake.scans[0].type, 'udp-active-broadcast');
    assert.equal(fake.scans[0].port, 3671);
    assert.equal(
      Buffer.from(fake.scans[0].payload_base64, 'base64').toString('hex'),
      '06100201000e0801000000000000',
    );
    assert.equal(bus.starts.at(-1).host, '192.168.1.77');
    const found = msg(await fake.action('discover_gateways'));
    assert.match(
      found.en,
      /MDT IP Interface 192\.168\.1\.77:3671 \(1\.1\.250, tunnelling\/routing\)/,
    );
  } finally {
    await app.stop();
  }
});

test('no interface found, or an incomplete configuration: an explicit connection status', async () => {
  const empty = await setup({ config: { connection_mode: 'tunnel_udp' } });
  try {
    assert.equal(empty.fake.connectionStatus.connected, false);
    assert.match(empty.fake.connectionStatus.message.en, /No KNX IP interface found/);
    assert.equal(empty.bus.starts.at(-1), null);
    const discover = msg(await empty.fake.action('discover_gateways'));
    assert.match(discover.en, /No KNX IP interface answered/);
  } finally {
    await empty.app.stop();
  }

  const secure = await setup({
    config: { connection_mode: 'tunnel_tcp', gateway_host: '192.168.1.50', secure: true },
  });
  try {
    assert.match(secure.fake.connectionStatus.message.en, /individual address of the tunnel/);
    const test = msg(await secure.fake.action('test_connection'));
    assert.match(test.fr, /Configuration à compléter/);
  } finally {
    await secure.app.stop();
  }
});

test('a configuration change reconnects only when the connection changes', async () => {
  const { fake, app, bus } = await setup();
  try {
    const starts = bus.starts.length;
    await fake.configUpdated({ ...CONFIG, sync_interval_minutes: 30 });
    assert.equal(bus.starts.length, starts, 'same connection: the tunnel stays');
    await fake.configUpdated({ ...CONFIG, gateway_host: '192.168.1.60' });
    assert.equal(bus.starts.at(-1).host, '192.168.1.60');
    const test = msg(await fake.action('test_connection'));
    assert.match(test.en, /Connected to 192\.168\.1\.60:3671/);
  } finally {
    await app.stop();
  }
});

test('remove a declared device by name or address', async () => {
  const { fake, app } = await setup();
  try {
    msg(await fake.action('add_switch', { name: 'Prise', address: '2/0/1' }));
    msg(await fake.action('add_switch', { name: 'Prise', address: '2/0/2' }));
    assert.match(msg(await fake.action('remove_device', { device: 'prise' })).en, /Several/);
    assert.match(
      msg(await fake.action('remove_device', { device: '2/2' })).en,
      /“Prise” is no longer/,
    );
    assert.match(
      msg(await fake.action('remove_device', { device: 'Cuisine' })).en,
      /No declared device/,
    );
    assert.deepEqual(
      fake.config[REGISTRY_KEY].map((definition) => definition.id),
      ['2-0-1'],
    );
    assert.deepEqual(
      fake.discoveredDevices.map((device) => device.external_id),
      [ext('switch:2-0-1')],
    );
  } finally {
    await app.stop();
  }
});

test('every action, scene action and widget of the manifest has a handler', async () => {
  const { fake, app } = await setup();
  try {
    for (const action of MANIFEST.actions) {
      const ack = await fake.action(action.key, {});
      assert.notEqual(ack.error, 'not implemented', action.key);
    }
    for (const action of MANIFEST.scene_actions) {
      const ack = await fake.sceneAction(action.key, {});
      assert.notEqual(ack.error, 'not implemented', action.key);
    }
    for (const widget of MANIFEST.widgets) {
      assert.equal((await fake.widgetGet(widget.key, { settings: {} })).success, true);
    }
  } finally {
    await app.stop();
  }
});
