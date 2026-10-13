// Shared test doubles: a fake KNX bus, telegram builders and a clock the tests
// move by hand. Nothing here touches the network.

import { EventEmitter } from 'node:events';
import knx from 'knxultimate';

const { dptlib } = knx;

/**
 * @description A fake bus, with the interface of src/knx/bus.js.
 * @returns {object} The bus: `writes`, `reads`, `starts`, `connect()`,
 * `drop(reason)`, `receive(telegram)`.
 */
export function fakeBus() {
  const bus = new EventEmitter();
  let connected = false;
  bus.writes = [];
  bus.reads = [];
  bus.starts = [];
  bus.autoConnect = true;
  bus.start = async (connection) => {
    bus.starts.push(connection);
    if (connected) {
      connected = false;
      bus.emit('disconnected', 'reconfigured');
    }
    if (connection && bus.autoConnect) {
      bus.connect();
    }
  };
  bus.stop = async () => {
    if (connected) {
      connected = false;
      bus.emit('disconnected', 'stopped');
    }
  };
  bus.reconnect = () => bus.start(bus.starts.at(-1) ?? null);
  bus.isConnected = () => connected;
  bus.connect = () => {
    connected = true;
    bus.emit('connected');
  };
  bus.drop = (reason = 'timeout') => {
    connected = false;
    bus.emit('disconnected', reason);
  };
  bus.write = (address, value, dpt) => {
    if (!connected) {
      throw new Error('KNX bus not connected');
    }
    bus.writes.push({ address, value, dpt });
  };
  bus.read = (address) => {
    if (!connected) {
      throw new Error('KNX bus not connected');
    }
    bus.reads.push(address);
  };
  bus.receive = (telegram) => bus.emit('telegram', telegram);
  return bus;
}

/**
 * @description The data of a value, encoded like a KNX device would.
 * @param {string} dpt - Datapoint type.
 * @param {*} value - Value.
 * @returns {Buffer} The telegram data.
 */
export function encode(dpt, value) {
  const apdu = {};
  dptlib.populateAPDU(value, apdu, dpt);
  return apdu.data;
}

/**
 * @description A group telegram.
 * @param {string} destination - "1/2/3".
 * @param {string|null} dpt - Datapoint type, or null for a read request.
 * @param {*} [value] - Value.
 * @param {object} [extra] - `{ type, source }`.
 * @returns {object} The telegram, like src/knx/bus.js emits it.
 */
export function telegram(destination, dpt, value, extra = {}) {
  return {
    destination,
    source: extra.source ?? '1.1.12',
    type: extra.type ?? (dpt ? 'write' : 'read'),
    data: dpt ? encode(dpt, value) : null,
  };
}

/**
 * @description A clock moved by hand.
 * @param {number} [start] - Start instant (ms).
 * @returns {{ now: Function, advance: Function }} The clock.
 */
export function fakeClock(start = Date.parse('2026-10-15T08:00:00Z')) {
  let current = start;
  return {
    now: () => current,
    advance: (ms) => {
      current += ms;
    },
  };
}

/** A no-op logger. */
export const silentLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child: () => silentLogger,
};

/** Wait for the pending promises and the timers of zero delay. */
export const flush = () => new Promise((resolve) => setImmediate(resolve));

/** Wait a few milliseconds (the read queue of the app is spaced by 1 ms in tests). */
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @description A KNXnet/IP SEARCH_RESPONSE, as an interface answers.
 * @param {object} [options] - `{ host, port, name, address, serial, families }`.
 * @returns {Buffer} The datagram.
 */
export function buildSearchResponse({
  host = '192.168.1.50',
  port = 3671,
  name = 'KNX IP Interface',
  address = 0x11fa, // 1.1.250
  serial = '0083497f1a2b',
  families = [0x02, 0x03, 0x04, 0x05],
} = {}) {
  const hpai = Buffer.from([0x08, 0x01, ...host.split('.').map(Number), port >> 8, port & 0xff]);
  const device = Buffer.alloc(54);
  device[0] = 54;
  device[1] = 0x01; // DEVICE_INFO
  device[2] = 0x02; // TP1
  device.writeUInt16BE(address, 4);
  Buffer.from(serial, 'hex').copy(device, 8);
  Buffer.from([224, 0, 23, 12]).copy(device, 14);
  Buffer.from([0x00, 0x24, 0x6d, 0x01, 0x02, 0x03]).copy(device, 18);
  device.write(name, 24, 30, 'latin1');
  const services = Buffer.from([2 + families.length * 2, 0x02, ...families.flatMap((f) => [f, 1])]);
  const body = Buffer.concat([hpai, device, services]);
  const header = Buffer.from([0x06, 0x10, 0x02, 0x02, 0, 0]);
  header.writeUInt16BE(6 + body.length, 4);
  return Buffer.concat([header, body]);
}
