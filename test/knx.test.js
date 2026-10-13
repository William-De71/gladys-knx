// The KNX layer: addresses, datapoint types, the interface search and the
// connection loop, with a fake KNXUltimate client. No network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import {
  addressId,
  matchesPattern,
  normalizeGroupAddress,
  normalizeIndividualAddress,
  parseAddressPatterns,
} from '../src/knx/address.js';
import { clientOptions, createBus, describe, toTelegram } from '../src/knx/bus.js';
import { buildSearchRequest, parseScanResults, parseSearchResponse } from '../src/knx/discovery.js';
import { canEncode, decode, isKnownDpt, parseValue, scalarValue } from '../src/knx/dpt.js';
import { buildSearchResponse, encode, flush, silentLogger } from './helpers.js';

test('group addresses: the three ETS styles, normalized to three levels', () => {
  assert.equal(normalizeGroupAddress('1/2/3'), '1/2/3');
  assert.equal(normalizeGroupAddress(' 1/515 '), '1/2/3');
  assert.equal(normalizeGroupAddress('2563'), '1/2/3');
  assert.equal(normalizeGroupAddress('31/7/255'), '31/7/255');
  for (const invalid of [
    '0/0/0',
    '32/0/0',
    '1/8/0',
    '1/2/256',
    '1/2048',
    '65536',
    'a/b/c',
    '',
    '1.2.3',
  ]) {
    assert.equal(normalizeGroupAddress(invalid), null, invalid);
  }
  assert.equal(addressId('1/2/3'), '1-2-3');
});

test('individual addresses', () => {
  assert.equal(normalizeIndividualAddress('1.1.254'), '1.1.254');
  assert.equal(normalizeIndividualAddress('15.15.255'), '15.15.255');
  assert.equal(normalizeIndividualAddress('16.1.1'), null);
  assert.equal(normalizeIndividualAddress('1/1/1'), null);
});

test('address patterns: exact, wildcards, an optional DPT, invalid entries reported', () => {
  const { patterns, invalid } = parseAddressPatterns('1/0/*, 2/1/5:9.001; 3/* 4/1/2:x *');
  assert.deepEqual(
    patterns.map((pattern) => [pattern.text, pattern.dpt]),
    [
      ['1/0/*', null],
      ['2/1/5', '9.001'],
      ['3/*', null],
      ['*', null],
    ],
  );
  assert.deepEqual(invalid, ['4/1/2:x']);
  const [middle, exact, main] = patterns;
  assert.ok(matchesPattern(middle, '1/0/200'));
  assert.ok(!matchesPattern(middle, '1/1/0'));
  assert.ok(matchesPattern(exact, '2/1/5'));
  assert.ok(!matchesPattern(exact, '2/1/6'));
  assert.ok(matchesPattern(main, '3/7/1'));
  assert.deepEqual(parseAddressPatterns('').patterns, []);
});

test('datapoint types: decode never throws, a wrong size reads as null', () => {
  assert.equal(decode('1.001', encode('1.001', true)), true);
  assert.equal(decode('9.001', encode('9.001', 21.5)), 21.5);
  assert.equal(decode('9.001', Buffer.from([1])), null);
  assert.equal(decode('9.001', null), null);
  assert.equal(decode('99.999', Buffer.from([1])), null);
  assert.ok(isKnownDpt('232.600'));
  assert.ok(!isKnownDpt('99.999'));
  assert.ok(!isKnownDpt('9'));
  assert.ok(canEncode('5.001', 42));
  assert.ok(!canEncode('5.001', 300));
  assert.ok(!canEncode('9.001', Number.NaN));
});

test('values typed in a scene: the form each DPT expects', () => {
  assert.equal(parseValue('1.001', 'on'), true);
  assert.equal(parseValue('1.001', 'OFF'), false);
  assert.equal(parseValue('1.001', 'maybe'), undefined);
  assert.equal(parseValue('1.008', 'up'), false, 'DPT 1.008: 0 = up');
  assert.equal(parseValue('1.008', 'down'), true);
  assert.equal(parseValue('1.009', 'close'), true);
  assert.equal(parseValue('9.001', '21,5'), 21.5);
  assert.equal(parseValue('9.001', ''), undefined);
  assert.deepEqual(parseValue('232.600', '#FF8000'), { red: 255, green: 128, blue: 0 });
  assert.deepEqual(parseValue('232.600', '10, 20, 30'), { red: 10, green: 20, blue: 30 });
  assert.equal(parseValue('232.600', '#ff80'), undefined);
  assert.deepEqual(parseValue('18.001', '5'), { save_recall: 0, scenenumber: 5 });
  assert.deepEqual(parseValue('3.007', 'up 3'), { decr_incr: 1, data: 3 });
  assert.equal(parseValue('16.000', ' Hello '), 'Hello');
  assert.equal(scalarValue({ red: 255, green: 128, blue: 0 }), '#ff8000');
  assert.equal(scalarValue(1 / 3), 0.333);
  assert.equal(scalarValue(undefined), null);
});

test('interface search: the request, a response, duplicates merged', () => {
  assert.equal(buildSearchRequest().toString('hex'), '06100201000e0801000000000000');
  const response = buildSearchResponse({ host: '192.168.1.50', name: 'MDT SCN-IP100.03' });
  assert.deepEqual(parseSearchResponse(response), {
    host: '192.168.1.50',
    port: 3671,
    name: 'MDT SCN-IP100.03',
    individualAddress: '1.1.250',
    serial: '0083497f1a2b',
    mac: '00:24:6d:01:02:03',
    tunnelling: true,
    routing: true,
    secure: false,
  });
  // Route-back HPAI: the address the datagram came from.
  const natted = buildSearchResponse({ host: '0.0.0.0', families: [0x04, 0x09] });
  const gateway = parseSearchResponse(natted, '10.0.0.9');
  assert.equal(gateway.host, '10.0.0.9');
  assert.equal(gateway.secure, true);
  assert.equal(parseSearchResponse(Buffer.from('garbage')), null);
  const results = parseScanResults([
    {
      source_ip: '192.168.1.60',
      payload_base64: buildSearchResponse({
        host: '192.168.1.60',
        serial: '000000000002',
      }).toString('base64'),
    },
    { source_ip: '192.168.1.50', payload_base64: response.toString('base64') },
    { source_ip: '192.168.1.50', payload_base64: response.toString('base64') },
    { source_ip: '192.168.1.70', payload_base64: 'not a datagram' },
  ]);
  assert.deepEqual(
    results.map((result) => result.host),
    ['192.168.1.50', '192.168.1.60'],
  );
});

test('KNXClient options: UDP, TCP with KNX IP Secure, routing', () => {
  assert.deepEqual(
    clientOptions({
      mode: 'tunnel_udp',
      host: '192.168.1.50',
      port: 3671,
      individualAddress: null,
      secure: null,
    }),
    {
      hostProtocol: 'TunnelUDP',
      ipAddr: '192.168.1.50',
      ipPort: 3671,
      loglevel: 'disable',
      autoReconnect: false,
    },
  );
  const secure = clientOptions({
    mode: 'tunnel_tcp',
    host: 'knx.local',
    port: 3671,
    individualAddress: null,
    secure: {
      tunnelAddress: '1.1.254',
      userId: 3,
      password: 'secret',
      deviceAuthentication: 'auth',
    },
  });
  assert.equal(secure.hostProtocol, 'TunnelTCP');
  assert.equal(secure.isSecureKNXEnabled, true);
  assert.deepEqual(secure.secureTunnelConfig, {
    tunnelInterfaceIndividualAddress: '1.1.254',
    tunnelUserId: 3,
    tunnelUserPassword: 'secret',
    deviceAuthenticationPassword: 'auth',
  });
  const routing = clientOptions({
    mode: 'routing',
    host: null,
    port: 3671,
    individualAddress: '1.1.250',
    secure: null,
  });
  assert.equal(routing.hostProtocol, 'Multicast');
  assert.equal(routing.ipAddr, '224.0.23.12');
  assert.equal(routing.physAddr, '1.1.250');
  assert.equal(
    describe({ mode: 'tunnel_tcp', host: 'knx.local', port: 3671, secure: {} }),
    'knx.local:3671 (TCP, Secure)',
  );
});

/** A KNXUltimate indication datagram, as the library emits it. */
function indication({
  destination,
  source = 0x110c,
  write = true,
  response = false,
  data = Buffer.from([1]),
}) {
  return {
    cEMIMessage: {
      dstAddress: { get: () => destination },
      srcAddress: { get: () => source },
      npdu: {
        isGroupWrite: write,
        isGroupResponse: response,
        isGroupRead: !write && !response,
        dataValue: data,
      },
    },
  };
}

test('telegrams: group writes, responses and reads, nothing else', () => {
  assert.deepEqual(toTelegram(indication({ destination: 0x0a03 })), {
    destination: '1/2/3',
    source: '1.1.12',
    type: 'write',
    data: Buffer.from([1]),
  });
  assert.equal(
    toTelegram(indication({ destination: 0x0a03, write: false, response: true })).type,
    'response',
  );
  const read = toTelegram(indication({ destination: 0x0a03, write: false }));
  assert.equal(read.type, 'read');
  assert.equal(read.data, null);
  assert.equal(toTelegram({}), null);
});

/** A fake KNXClient. */
function fakeClientFactory() {
  const clients = [];
  const create = (options) => {
    const client = new EventEmitter();
    client.options = options;
    client.connected = false;
    client.writes = [];
    client.Connect = () => {};
    client.Disconnect = async () => {
      client.connected = false;
    };
    client.isConnected = () => client.connected;
    client.write = (address, value, dpt) => client.writes.push({ address, value, dpt });
    client.read = () => {};
    client.accept = () => {
      client.connected = true;
      client.emit('connected');
    };
    clients.push(client);
    return client;
  };
  return { clients, create };
}

test('the bus: connects, relays telegrams, writes only when connected', async () => {
  const { clients, create } = fakeClientFactory();
  const bus = createBus({ logger: silentLogger, createClient: create });
  const events = [];
  bus.on('connected', () => events.push('connected'));
  bus.on('disconnected', (reason) => events.push(`disconnected:${reason}`));
  bus.on('telegram', (telegram) => events.push(`telegram:${telegram.destination}`));
  const connection = {
    mode: 'tunnel_udp',
    host: '192.168.1.50',
    port: 3671,
    individualAddress: null,
    secure: null,
  };
  await bus.start(connection);
  assert.throws(() => bus.write('1/2/3', true, '1.001'), /not connected/);
  clients[0].accept();
  clients[0].emit('indication', indication({ destination: 0x0a03 }));
  bus.write('1/2/3', true, '1.001');
  assert.deepEqual(clients[0].writes, [{ address: '1/2/3', value: true, dpt: '1.001' }]);
  await bus.stop();
  assert.deepEqual(events, ['connected', 'telegram:1/2/3', 'disconnected:stopped']);
});

test('the bus: a lost connection is retried with a new client, stale clients are ignored', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { clients, create } = fakeClientFactory();
  const bus = createBus({ logger: silentLogger, createClient: create });
  const events = [];
  bus.on('connected', () => events.push('connected'));
  bus.on('disconnected', (reason) => events.push(`disconnected:${reason}`));
  await bus.start({
    mode: 'tunnel_udp',
    host: '192.168.1.50',
    port: 3671,
    individualAddress: null,
    secure: null,
  });
  clients[0].accept();
  clients[0].connected = false;
  clients[0].emit('disconnected', 'heartbeat timeout');
  assert.equal(clients.length, 1, 'waits before retrying');
  t.mock.timers.tick(5000);
  await flush();
  t.mock.timers.tick(0);
  await flush();
  assert.equal(clients.length, 2, 'a new client after 5 s');
  clients[0].emit('connected'); // the old client: ignored
  clients[1].accept();
  assert.deepEqual(events, ['connected', 'disconnected:heartbeat timeout', 'connected']);
  await bus.stop();
});
