// -----------------------------------------------------------------------------
// Bus monitor: the last telegrams and the traffic of the last minute, for the
// `bus` widget and the "Test the connection" button. Memory only, bounded.
// -----------------------------------------------------------------------------

import { matchesPattern } from './knx/address.js';

const KEEP = 50;
const MINUTE = 60 * 1000;

/**
 * @description Create the monitor.
 * @param {object} [deps] - Dependencies.
 * @param {Function} [deps.now] - Clock (ms).
 * @returns {object} The monitor.
 */
export function createMonitor({ now = Date.now } = {}) {
  const telegrams = [];
  const stamps = [];

  const trim = () => {
    const limit = now() - MINUTE;
    while (stamps.length > 0 && stamps[0] < limit) {
      stamps.shift();
    }
  };

  return {
    /**
     * @description Record a telegram.
     * @param {object} telegram - `{ destination, source, type, data }`.
     * @param {object} [extra] - `{ display, label }`: decoded value (see
     * widgets.js#displayValue), name of the declared device.
     */
    record(telegram, extra = {}) {
      const at = now();
      stamps.push(at);
      trim();
      telegrams.unshift({
        at,
        destination: telegram.destination,
        source: telegram.source,
        type: telegram.type,
        raw: telegram.data ? telegram.data.toString('hex') : '',
        display: extra.display ?? null,
        label: extra.label ?? null,
      });
      telegrams.length = Math.min(telegrams.length, KEEP);
    },

    /** @returns {number} Telegrams received in the last minute. */
    perMinute() {
      trim();
      return stamps.length;
    },

    /**
     * @description The last telegrams, newest first.
     * @param {object} [options] - `{ limit, patterns }`: group address
     * patterns (parseAddressPatterns), none = every telegram.
     * @returns {object[]} Telegrams.
     */
    last({ limit = 10, patterns = [] } = {}) {
      return telegrams
        .filter(
          (telegram) =>
            patterns.length === 0 ||
            patterns.some((pattern) => matchesPattern(pattern, telegram.destination)),
        )
        .slice(0, limit);
    },
  };
}
