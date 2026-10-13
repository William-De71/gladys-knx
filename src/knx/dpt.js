// -----------------------------------------------------------------------------
// Datapoint types (DPT): how the bytes of a telegram read as a value.
//
// The codecs are the ones of KNXUltimate (`dptlib`, hundreds of DPTs); this
// module only adds what Gladys needs around them: a decode that never throws
// (a telegram of the wrong size reads as null), the text form of a value typed
// in a scene action ("on", "21.5", "#ff8000"), and the scalar form of a
// decoded value for scene variables and the bus monitor.
// -----------------------------------------------------------------------------

import knx from 'knxultimate';
import { setLogLevel } from 'knxultimate/build/KnxLog.js';

const { dptlib } = knx;

// The library logs every codec warning on the console (a telegram of the wrong
// size, a value out of range): the integration reports those itself.
setLogLevel(process.env.KNX_LOG_LEVEL || 'disable');

/**
 * @description Whether KNXUltimate knows a datapoint type.
 * @param {string} dpt - "9.001".
 * @returns {boolean} True when it can encode and decode it.
 */
export function isKnownDpt(dpt) {
  if (typeof dpt !== 'string' || !/^\d{1,3}\.\d{3}$/.test(dpt)) {
    return false;
  }
  try {
    return Boolean(dptlib.resolve(dpt));
  } catch {
    return false;
  }
}

/**
 * @description Decode the data of a telegram.
 * @param {string} dpt - Datapoint type.
 * @param {Buffer} data - Telegram data (the APDU payload).
 * @returns {*} The value, or null when the data does not fit the DPT.
 */
export function decode(dpt, data) {
  if (!Buffer.isBuffer(data)) {
    return null;
  }
  try {
    const value = dptlib.fromBuffer(data, dptlib.resolve(dpt));
    if (value === undefined || (typeof value === 'number' && !Number.isFinite(value))) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

/**
 * @description Check that a value can be encoded (KNXUltimate throws or
 * writes zeros on a bad one, the bus must never receive that).
 * @param {string} dpt - Datapoint type.
 * @param {*} value - Value in the dptlib form.
 * @returns {boolean} True when it encodes.
 */
export function canEncode(dpt, value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return false;
  }
  try {
    const apdu = {};
    dptlib.populateAPDU(value, apdu, dpt);
    return Buffer.isBuffer(apdu.data);
  } catch {
    return false;
  }
}

/**
 * @description The data of a value as hex (to recognize our own telegrams).
 * @param {string} dpt - Datapoint type.
 * @param {*} value - Value in the dptlib form.
 * @returns {string} Hex data, or an empty string.
 */
export function encodedHex(dpt, value) {
  try {
    const apdu = {};
    dptlib.populateAPDU(value, apdu, dpt);
    return Buffer.isBuffer(apdu.data) ? apdu.data.toString('hex') : '';
  } catch {
    return '';
  }
}

const TRUE_WORDS = new Set(['1', 'true', 'on', 'yes', 'up', 'open', 'start', 'enable']);
const FALSE_WORDS = new Set(['0', 'false', 'off', 'no', 'down', 'close', 'stop', 'disable']);

/**
 * @description Read the text of a value typed by a user (scene action) in the
 * form the codec of the DPT expects.
 * @param {string} dpt - Datapoint type.
 * @param {string|number|boolean} input - "on", "21.5", "#ff8000", "3"…
 * @returns {*} The value, or undefined when it cannot be read for that DPT.
 */
export function parseValue(dpt, input) {
  const text = String(input ?? '').trim();
  const main = Number(dpt.split('.')[0]);
  if (main === 1) {
    if (typeof input === 'boolean') {
      return input;
    }
    const word = text.toLowerCase();
    // DPT 1.008 (up/down) and 1.009 (open/close): 0 = up / open, 1 = down / close.
    if (dpt === '1.008' || dpt === '1.009') {
      if (['0', 'false', 'up', 'open'].includes(word)) {
        return false;
      }
      if (['1', 'true', 'down', 'close'].includes(word)) {
        return true;
      }
      return undefined;
    }
    if (TRUE_WORDS.has(word)) {
      return true;
    }
    if (FALSE_WORDS.has(word)) {
      return false;
    }
    return undefined;
  }
  if (main === 16 || main === 24 || main === 28) {
    return text;
  }
  if (main === 232) {
    return parseColor(text);
  }
  if (main === 18) {
    const scene = Number(text);
    return Number.isInteger(scene) && scene >= 1 && scene <= 64
      ? { save_recall: 0, scenenumber: scene }
      : undefined;
  }
  if (main === 3) {
    const match = /^(up|down|increase|decrease|stop)(?:\s+(\d))?$/i.exec(text);
    if (!match) {
      return undefined;
    }
    const word = match[1].toLowerCase();
    if (word === 'stop') {
      return { decr_incr: 0, data: 0 };
    }
    const step = match[2] === undefined ? 1 : Number(match[2]);
    return { decr_incr: word === 'up' || word === 'increase' ? 1 : 0, data: step };
  }
  if (text === '') {
    return undefined;
  }
  const number = Number(text.replace(',', '.'));
  return Number.isFinite(number) ? number : undefined;
}

/**
 * @description "#ff8000", "ff8000" or "255,128,0" -> `{ red, green, blue }`.
 * @param {string} text - Color.
 * @returns {object|undefined} The color, or undefined.
 */
export function parseColor(text) {
  const hex = /^#?([0-9a-f]{6})$/i.exec(text);
  if (hex) {
    const value = Number.parseInt(hex[1], 16);
    return { red: value >> 16, green: (value >> 8) & 0xff, blue: value & 0xff };
  }
  const parts = text.split(/[\s,;]+/).map(Number);
  if (
    parts.length === 3 &&
    parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
  ) {
    const [red, green, blue] = parts;
    return { red, green, blue };
  }
  return undefined;
}

/**
 * @description The scalar form of a decoded value (scene variables, bus
 * monitor): booleans and numbers as is, a color as "#rrggbb", any other
 * object as compact JSON.
 * @param {*} value - Decoded value.
 * @returns {string|number|boolean|null} The scalar.
 */
export function scalarValue(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null;
  }
  if (typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'object' && 'red' in value && 'green' in value && 'blue' in value) {
    return `#${[value.red, value.green, value.blue]
      .map((part) => Number(part).toString(16).padStart(2, '0'))
      .join('')}`;
  }
  return JSON.stringify(value);
}

/**
 * @description The unit KNXUltimate knows for a DPT ("°C", "%", "lux"…).
 * @param {string} dpt - Datapoint type.
 * @returns {string} The unit, or an empty string.
 */
export function dptUnit(dpt) {
  try {
    return dptlib.resolve(dpt)?.subtype?.unit ?? '';
  } catch {
    return '';
  }
}
