// -----------------------------------------------------------------------------
// Integration configuration: the `config_schema` values of the manifest,
// normalized so the rest of the code never deals with strings from a form,
// `undefined` or a half-typed address.
//
// The connection is null when nothing usable is configured; `problems` then
// says why, in the words of the configuration screen (i18n keys).
// -----------------------------------------------------------------------------

import { normalizeIndividualAddress, parseAddressPatterns } from './knx/address.js';
import { KNX_PORT } from './knx/discovery.js';

export const MODES = ['tunnel_udp', 'tunnel_tcp', 'routing'];
export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Defaults: they MUST stay consistent with the `default` values of the
// manifest `config_schema` (test/manifest.test.js checks it).
export const DEFAULTS = {
  connection_mode: 'tunnel_udp',
  gateway_port: KNX_PORT,
  secure: false,
  secure_user_id: 2,
  sync_states: true,
  sync_interval_minutes: 60,
  language: 'en',
};

// Key stored through setConfig() OUTSIDE the config_schema: the devices
// declared with the configuration buttons, as JSON (src/registry.js). The
// configuration lives in the Gladys database, so the devices are part of the
// Gladys backups, unlike /data.
export const REGISTRY_KEY = 'knx_devices';

const HOSTNAME =
  /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/**
 * @description Whether a text is an IPv4 address or a host name.
 * @param {string} host - Text.
 * @returns {boolean} True when usable as a host.
 */
export function isValidHost(host) {
  const ip = IPV4.exec(host);
  if (ip) {
    return ip.slice(1).every((part) => Number(part) <= 255);
  }
  return HOSTNAME.test(host) && !/^[\d.]+$/.test(host);
}

const BLOCKING = [
  'configInvalidHost',
  'configSecureTunnelAddress',
  'configSecurePassword',
  'configRoutingAddress',
  'configSecureRouting',
];

const text = (value) => (typeof value === 'string' ? value.trim() : '');

const integer = (value, fallback, min, max) => {
  const number = Number(value);
  if (value === '' || value === null || value === undefined || !Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(number)));
};

/**
 * @description Normalize the configuration.
 * @param {object} raw - `gladys.config`.
 * @returns {object} `{ connection, problems, syncStates, syncIntervalMs,
 * events, invalidEvents, language }`; `connection` is `{ mode, host, port,
 * individualAddress, secure }` or null.
 */
export function normalizeConfig(raw = {}) {
  const problems = [];
  const mode = MODES.includes(raw.connection_mode) ? raw.connection_mode : DEFAULTS.connection_mode;
  const host = text(raw.gateway_host);
  const port = integer(raw.gateway_port, DEFAULTS.gateway_port, 1, 65535);

  let individualAddress = null;
  if (text(raw.individual_address)) {
    individualAddress = normalizeIndividualAddress(raw.individual_address);
    if (!individualAddress) {
      problems.push('configInvalidIndividualAddress');
    }
  }

  let secure = null;
  if (raw.secure === true && mode !== 'routing') {
    const tunnelAddress = normalizeIndividualAddress(text(raw.secure_tunnel_address));
    const password = typeof raw.secure_password === 'string' ? raw.secure_password : '';
    if (!tunnelAddress) {
      problems.push('configSecureTunnelAddress');
    }
    if (!password) {
      problems.push('configSecurePassword');
    }
    secure = {
      tunnelAddress,
      userId: integer(raw.secure_user_id, DEFAULTS.secure_user_id, 1, 127),
      password,
      deviceAuthentication:
        typeof raw.secure_device_authentication === 'string' && raw.secure_device_authentication
          ? raw.secure_device_authentication
          : null,
    };
  } else if (raw.secure === true) {
    problems.push('configSecureRouting');
  }

  if (host && !isValidHost(host)) {
    problems.push('configInvalidHost');
  }
  if (mode === 'routing' && !individualAddress) {
    problems.push('configRoutingAddress');
  }

  // An invalid individual address of a tunnel is ignored (the interface
  // assigns one): only these problems prevent connecting.
  const usable = !problems.some((problem) => BLOCKING.includes(problem));

  const { patterns, invalid } = parseAddressPatterns(raw.event_addresses);
  return {
    connection: usable
      ? {
          mode,
          // An empty host means "the interface found by the scan" (app.js).
          host: mode === 'routing' ? null : host || null,
          port: mode === 'routing' ? KNX_PORT : port,
          individualAddress,
          secure,
        }
      : null,
    problems,
    // A secure TCP tunnel needs the address of the interface: no scan.
    needsScan: usable && mode !== 'routing' && !host,
    syncStates: raw.sync_states !== false,
    syncIntervalMs:
      integer(raw.sync_interval_minutes, DEFAULTS.sync_interval_minutes, 0, 1440) * 60 * 1000,
    events: patterns,
    invalidEvents: invalid,
    language: LANGUAGES.includes(raw.language) ? raw.language : DEFAULTS.language,
  };
}

/**
 * @description Whether two normalized connections are the same (a
 * configuration save that changes nothing must not drop the tunnel).
 * @param {object|null} a - Connection.
 * @param {object|null} b - Connection.
 * @returns {boolean} True when identical.
 */
export function sameConnection(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
