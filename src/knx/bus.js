// -----------------------------------------------------------------------------
// The connection to the KNX bus, through a KNX IP interface or router.
//
// A thin layer over KNXUltimate's KNXClient: one client per connection
// attempt, our own reconnection loop (5 s, doubling up to 2 min: an interface
// only has a handful of tunnels, hammering it would lock the others out), and
// telegrams reduced to what the integration needs:
//
//   { destination: '1/2/3', source: '1.1.12', type: 'write' | 'response' |
//     'read', data: Buffer | null }
//
// Events: `telegram`, `connected`, `disconnected` (reason). Everything the
// rest of the code calls is in the object returned by createBus(), so the
// tests replace it with test/helpers.js#fakeBus.
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';
import knx from 'knxultimate';
import { formatGroupAddress, formatIndividualAddress } from './address.js';

const { KNXClient } = knx;

const RECONNECT_MIN_MS = 5 * 1000;
const RECONNECT_MAX_MS = 2 * 60 * 1000;
// A connection attempt that neither connects nor fails (an interface that
// drops the CONNECT_REQUEST) is abandoned after this delay.
const CONNECT_TIMEOUT_MS = 20 * 1000;

export const PROTOCOLS = {
  tunnel_udp: 'TunnelUDP',
  tunnel_tcp: 'TunnelTCP',
  routing: 'Multicast',
};

/**
 * @description The KNXClient options of a normalized connection (config.js).
 * @param {object} connection - `{ mode, host, port, individualAddress, secure }`.
 * @returns {object} KNXClient options.
 */
export function clientOptions(connection) {
  const options = {
    hostProtocol: PROTOCOLS[connection.mode],
    ipAddr: connection.mode === 'routing' ? '224.0.23.12' : connection.host,
    ipPort: connection.port,
    loglevel: process.env.KNX_LOG_LEVEL || 'disable',
    autoReconnect: false,
  };
  if (connection.individualAddress) {
    options.physAddr = connection.individualAddress;
  }
  if (connection.secure) {
    options.isSecureKNXEnabled = true;
    options.secureTunnelConfig = {
      tunnelInterfaceIndividualAddress: connection.secure.tunnelAddress,
      tunnelUserId: connection.secure.userId,
      tunnelUserPassword: connection.secure.password,
    };
    if (connection.secure.deviceAuthentication) {
      options.secureTunnelConfig.deviceAuthenticationPassword =
        connection.secure.deviceAuthentication;
    }
  }
  return options;
}

/**
 * @description Reduce a KNXUltimate indication to a telegram.
 * @param {object} packet - The `indication` datagram.
 * @returns {object|null} The telegram, or null when it is not a group telegram.
 */
export function toTelegram(packet) {
  const cemi = packet?.cEMIMessage;
  const npdu = cemi?.npdu;
  if (!npdu || typeof cemi.dstAddress?.get !== 'function') {
    return null;
  }
  let type;
  if (npdu.isGroupWrite) {
    type = 'write';
  } else if (npdu.isGroupResponse) {
    type = 'response';
  } else if (npdu.isGroupRead) {
    type = 'read';
  } else {
    return null;
  }
  const data = type === 'read' ? null : (npdu.dataValue ?? null);
  return {
    destination: formatGroupAddress(cemi.dstAddress.get()),
    source:
      typeof cemi.srcAddress?.get === 'function'
        ? formatIndividualAddress(cemi.srcAddress.get())
        : null,
    type,
    data: Buffer.isBuffer(data) ? Buffer.from(data) : null,
  };
}

/**
 * @description Create the bus connection.
 * @param {object} deps - Dependencies.
 * @param {object} deps.logger - Logger.
 * @param {Function} [deps.createClient] - `(options) => KNXClient`, for tests.
 * @returns {object} The bus (an EventEmitter).
 */
export function createBus({ logger, createClient = (options) => new KNXClient(options) }) {
  const bus = new EventEmitter();
  let client = null;
  let connection = null;
  let reconnectTimer = null;
  let connectTimer = null;
  let delay = RECONNECT_MIN_MS;
  let stopped = true;
  let connected = false;
  let attempt = 0;

  const clearTimers = () => {
    clearTimeout(reconnectTimer);
    clearTimeout(connectTimer);
    reconnectTimer = null;
    connectTimer = null;
  };

  const dropClient = async () => {
    const current = client;
    client = null;
    if (!current) {
      return;
    }
    current.removeAllListeners();
    // A late error of the closing socket must not crash the process.
    current.on('error', () => {});
    try {
      if (current.isConnected()) {
        await Promise.race([
          current.Disconnect(),
          new Promise((resolve) => setTimeout(resolve, 3000).unref?.()),
        ]);
      }
    } catch (error) {
      logger.debug(`KNX: disconnect error: ${error.message}`);
    }
  };

  const setDisconnected = (reason) => {
    if (connected) {
      connected = false;
      bus.emit('disconnected', reason);
    }
  };

  const scheduleReconnect = (reason) => {
    if (stopped || reconnectTimer) {
      return;
    }
    setDisconnected(reason);
    logger.warn(`KNX: connection lost or refused (${reason}), retry in ${delay / 1000} s`);
    const wait = delay;
    delay = Math.min(delay * 2, RECONNECT_MAX_MS);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      dropClient().then(open);
    }, wait);
    reconnectTimer.unref?.();
  };

  const open = () => {
    if (stopped || !connection) {
      return;
    }
    attempt += 1;
    const current = attempt;
    let instance;
    try {
      instance = createClient(clientOptions(connection));
    } catch (error) {
      scheduleReconnect(error.message);
      return;
    }
    client = instance;
    const stale = () => current !== attempt || client !== instance;
    instance.on('connected', () => {
      if (stale()) {
        return;
      }
      clearTimeout(connectTimer);
      delay = RECONNECT_MIN_MS;
      connected = true;
      logger.info(`KNX: connected to ${describe(connection)}`);
      bus.emit('connected');
    });
    instance.on('disconnected', (reason) => {
      if (!stale()) {
        scheduleReconnect(String(reason ?? 'disconnected'));
      }
    });
    instance.on('error', (error) => {
      if (!stale()) {
        logger.debug(`KNX: ${error?.message ?? error}`);
        if (!instance.isConnected()) {
          scheduleReconnect(error?.message ?? String(error));
        }
      }
    });
    instance.on('indication', (packet) => {
      if (stale()) {
        return;
      }
      const telegram = toTelegram(packet);
      if (telegram) {
        bus.emit('telegram', telegram);
      }
    });
    connectTimer = setTimeout(() => {
      if (!stale() && !connected) {
        scheduleReconnect('timeout');
      }
    }, CONNECT_TIMEOUT_MS);
    connectTimer.unref?.();
    try {
      instance.Connect();
    } catch (error) {
      scheduleReconnect(error.message);
    }
  };

  /**
   * @description (Re)connect with a new connection, or stop when null.
   * @param {object|null} next - Normalized connection (config.js).
   */
  bus.start = async (next) => {
    stopped = false;
    connection = next;
    clearTimers();
    delay = RECONNECT_MIN_MS;
    await dropClient();
    setDisconnected('reconfigured');
    if (connection) {
      open();
    } else {
      stopped = true;
    }
  };

  bus.stop = async () => {
    stopped = true;
    clearTimers();
    await dropClient();
    setDisconnected('stopped');
  };

  /** Force a new connection now (widget button), with the same settings. */
  bus.reconnect = () => bus.start(connection);

  bus.isConnected = () => connected;

  const ready = () => {
    if (!connected || !client) {
      throw new Error('KNX bus not connected');
    }
    return client;
  };

  /**
   * @description Send a GroupValueWrite.
   * @param {string} address - Group address.
   * @param {*} value - Value in the dptlib form.
   * @param {string} dpt - Datapoint type.
   */
  bus.write = (address, value, dpt) => {
    ready().write(address, value, dpt);
  };

  /**
   * @description Send a GroupValueRead (the answer arrives as a `response` telegram).
   * @param {string} address - Group address.
   */
  bus.read = (address) => {
    ready().read(address);
  };

  return bus;
}

/**
 * @description Human form of a connection, for the logs and the widget.
 * @param {object} connection - Normalized connection.
 * @returns {string} "192.168.1.10:3671 (UDP tunnelling)".
 */
export function describe(connection) {
  if (!connection) {
    return '';
  }
  if (connection.mode === 'routing') {
    return '224.0.23.12:3671 (routing)';
  }
  const mode = connection.mode === 'tunnel_tcp' ? 'TCP' : 'UDP';
  return `${connection.host}:${connection.port} (${mode}${connection.secure ? ', Secure' : ''})`;
}
