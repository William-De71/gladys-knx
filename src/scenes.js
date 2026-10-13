// -----------------------------------------------------------------------------
// Scene triggers and actions (manifest `scene_triggers` / `scene_actions`).
//
// Triggers fire on what HAPPENS on the bus, never on a periodic snapshot:
//   - telegram_received: a telegram on a group address of the configuration
//     field "Group addresses for scenes" (a wall push button, a central
//     function, an alarm — what is not a device in Gladys);
//   - connection_lost / connection_restored: the link to the interface.
//
// Actions are operations with parameters: send a value, read a value, recall
// a KNX scene. A value written by an action is never echoed as a trigger (the
// interface does not send our own telegrams back).
// -----------------------------------------------------------------------------

import { scalarValue } from './knx/dpt.js';

export const TRIGGERS = {
  TELEGRAM: 'telegram_received',
  LOST: 'connection_lost',
  RESTORED: 'connection_restored',
};

export const SCENE_ACTIONS = {
  SEND: 'send_value',
  READ: 'read_value',
  SCENE: 'recall_scene',
};

// Gladys accepts 300 scene events a minute per integration.
const EVENTS_PER_MINUTE = 250;
const MAX_STRING = 1000;

/**
 * @description The data of a telegram_received event (flat scalars).
 * @param {object} telegram - `{ destination, source, type, data }`.
 * @param {*} value - Decoded value, or null.
 * @returns {object} The event data.
 */
export function telegramEventData(telegram, value) {
  const scalar = scalarValue(value);
  return {
    group_address: telegram.destination,
    source_address: telegram.source ?? '',
    telegram_type: telegram.type,
    value: scalar === null ? '' : String(scalar).slice(0, MAX_STRING),
    raw: telegram.data ? telegram.data.toString('hex').slice(0, MAX_STRING) : '',
  };
}

/**
 * @description A sliding one-minute window counter: the scene events beyond
 * the budget are dropped (and logged once per minute) rather than refused by
 * Gladys.
 * @param {object} deps - `{ now, logger }`.
 * @returns {{ allow: Function }} The limiter.
 */
export function createEventLimiter({ now = Date.now, logger }) {
  const stamps = [];
  let warnedAt = 0;
  return {
    allow() {
      const current = now();
      while (stamps.length > 0 && stamps[0] <= current - 60000) {
        stamps.shift();
      }
      if (stamps.length >= EVENTS_PER_MINUTE) {
        if (current - warnedAt > 60000) {
          warnedAt = current;
          logger?.warn('KNX: more than 250 scene events in a minute, the next ones are dropped');
        }
        return false;
      }
      stamps.push(current);
      return true;
    },
  };
}
