// -----------------------------------------------------------------------------
// KNX device kinds: what a declared device is made of, and how its group
// addresses map to Gladys features.
//
// KNX has no device discovery: a group address is a number, its meaning lives
// in the ETS project. The user declares each device with a configuration
// button (one per kind, the `add_<kind>` actions of the manifest), the
// declarations are kept by src/registry.js, and every declared device is
// offered in the Discover tab like a discovered one.
//
// For each feature, a kind says:
//   - the Gladys feature (category, type, unit, bounds);
//   - `listen`: the group addresses whose telegrams update it (the status
//     address AND the command address: a wall switch writing on the command
//     address changes the state too, like Home Assistant does);
//   - `read`: the status address read at startup (GroupValueRead);
//   - `decode`: telegram data -> Gladys value (null: ignore the telegram);
//   - `command`: Gladys value -> one telegram (address, DPT, value), or null
//     for a read-only feature.
//
// The external ids are `ext:<selector>:<kind>:<main group address>` (slashes
// as dashes) and `…:<feature key>`: never change a kind key, a feature key or
// the main address of a kind.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
  DEVICE_FEATURE_UNITS as U,
} from '@gladysassistant/integration-sdk';
import { addressId, normalizeGroupAddress } from './knx/address.js';
import { decode } from './knx/dpt.js';
import { featureName } from './i18n.js';

// Gladys cover states (core constant COVER_STATE).
export const COVER = { OPEN: 1, STOP: 0, CLOSE: -1 };

// --- Decoders ------------------------------------------------------------------

const bool =
  (invert = false) =>
  (data) => {
    const value = decode('1.001', data);
    return typeof value === 'boolean' ? Number(value !== invert) : null;
  };

const percent = (data) => {
  const value = decode('5.001', data);
  return typeof value === 'number' ? Math.round(value) : null;
};

/**
 * @description A decoder choosing the DPT from the data size: a temperature
 * is a 2-byte float (DPT 9) on most devices, a 4-byte one (DPT 14) on some.
 * @param {object} bySize - `{ <bytes>: [dpt, factor] }`.
 * @param {number} [decimals] - Rounding.
 * @returns {Function} The decoder.
 */
const sized =
  (bySize, decimals = 2) =>
  (data) => {
    const entry = Buffer.isBuffer(data) ? bySize[data.length] : undefined;
    if (!entry) {
      return null;
    }
    const [dpt, factor = 1] = entry;
    const value = decode(dpt, data);
    if (typeof value !== 'number') {
      return null;
    }
    const scale = 10 ** decimals;
    return Math.round(value * factor * scale) / scale;
  };

// --- Sensor and binary sensor types ------------------------------------------------

// `dpt`: the DPT documented in the configuration (and used by the scene
// variables); `decode`: what the integration accepts on the bus.
export const SENSOR_TYPES = {
  temperature: {
    dpt: '9.001',
    category: C.TEMPERATURE_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.CELSIUS,
    min: -50,
    max: 150,
    decode: sized({ 2: ['9.001'], 4: ['14.068'] }),
  },
  humidity: {
    dpt: '9.007',
    category: C.HUMIDITY_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.PERCENT,
    min: 0,
    max: 100,
    decode: sized({ 1: ['5.001'], 2: ['9.007'] }),
  },
  illuminance: {
    dpt: '9.004',
    category: C.LIGHT_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.LUX,
    min: 0,
    max: 200000,
    decode: sized({ 2: ['9.004'], 4: ['14.076'] }, 0),
  },
  co2: {
    dpt: '9.008',
    category: C.CO2_SENSOR,
    type: T.SENSOR.INTEGER,
    unit: U.PPM,
    min: 0,
    max: 10000,
    decode: sized({ 2: ['9.008'], 4: ['14.000'] }, 0),
  },
  pressure: {
    dpt: '9.006',
    category: C.PRESSURE_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.HECTO_PASCAL,
    min: 0,
    max: 2000,
    // KNX sends pascals.
    decode: sized({ 2: ['9.006', 0.01], 4: ['14.058', 0.01] }, 1),
  },
  wind_speed: {
    dpt: '9.005',
    category: C.SPEED_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.METER_PER_SECOND,
    min: 0,
    max: 100,
    decode: sized({ 2: ['9.005'], 4: ['14.065'] }, 1),
  },
  power: {
    dpt: '14.056',
    category: C.ENERGY_SENSOR,
    type: T.ENERGY_SENSOR.POWER,
    unit: U.WATT,
    // Signed: a production meter or a grid exchange goes below zero.
    min: -1000000,
    max: 1000000,
    // 4 bytes: DPT 14.056 (W); 2 bytes: DPT 9.024 (kW).
    decode: sized({ 2: ['9.024', 1000], 4: ['14.056'] }, 1),
  },
  energy: {
    dpt: '13.013',
    category: C.ENERGY_SENSOR,
    type: T.ENERGY_SENSOR.INDEX,
    unit: U.KILOWATT_HOUR,
    min: 0,
    max: 1000000000,
    decode: sized({ 4: ['13.013'] }, 3),
  },
  energy_wh: {
    dpt: '13.010',
    category: C.ENERGY_SENSOR,
    type: T.ENERGY_SENSOR.INDEX,
    unit: U.KILOWATT_HOUR,
    min: 0,
    max: 1000000000,
    decode: sized({ 4: ['13.010', 0.001] }, 3),
  },
  voltage: {
    dpt: '14.027',
    category: C.ENERGY_SENSOR,
    type: T.ENERGY_SENSOR.VOLTAGE,
    unit: U.VOLT,
    min: 0,
    max: 1000,
    // 4 bytes: DPT 14.027 (V); 2 bytes: DPT 9.020 (mV).
    decode: sized({ 2: ['9.020', 0.001], 4: ['14.027'] }, 1),
  },
  current: {
    dpt: '14.019',
    category: C.ENERGY_SENSOR,
    type: T.ENERGY_SENSOR.CURRENT,
    unit: U.AMPERE,
    min: 0,
    max: 1000,
    // 4 bytes: DPT 14.019 (A); 2 bytes: DPT 7.012 (mA).
    decode: sized({ 2: ['7.012', 0.001], 4: ['14.019'] }, 3),
  },
  percent: {
    dpt: '5.001',
    category: C.LEVEL_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.PERCENT,
    min: 0,
    max: 100,
    decode: sized({ 1: ['5.001'], 2: ['9.007'] }, 1),
  },
  counter: {
    dpt: '12.001',
    category: C.COUNTER_SENSOR,
    type: T.SENSOR.INTEGER,
    min: 0,
    max: 4294967295,
    decode: sized({ 1: ['5.010'], 2: ['7.001'], 4: ['12.001'] }, 0),
  },
};

// KNX contacts say 1 = open (DPT 1.019); a Gladys opening sensor says 1 = closed.
export const BINARY_SENSOR_TYPES = {
  motion: { category: C.MOTION_SENSOR, type: T.SENSOR.BINARY, invert: false },
  presence: { category: C.PRESENCE_SENSOR, type: T.SENSOR.BINARY, invert: false },
  opening: { category: C.OPENING_SENSOR, type: T.SENSOR.BINARY, invert: true },
  smoke: { category: C.SMOKE_SENSOR, type: T.SENSOR.BINARY, invert: false },
  leak: { category: C.LEAK_SENSOR, type: T.SENSOR.BINARY, invert: false },
  rain: { category: C.RAIN_SENSOR, type: T.SENSOR.BINARY, invert: false },
  generic: { category: C.UNKNOWN, type: T.SENSOR.BINARY, invert: false },
};

export const COVER_TYPES = ['shutter', 'curtain'];

// --- Kinds -----------------------------------------------------------------------------

const MIRED = 1000000;

const bounded = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * @description Read a number field of a form.
 * @param {*} value - Field value.
 * @param {number} fallback - Default.
 * @returns {number} The number.
 */
const numberField = (value, fallback) => {
  const number = Number(value);
  return value === '' || value === null || value === undefined || !Number.isFinite(number)
    ? fallback
    : number;
};

/**
 * Every kind: the action that declares it, its address fields (the keys of
 * the action form, stored as is), the required ones, the main address (the
 * external id), its options and its features.
 */
export const KINDS = {
  switch: {
    action: 'add_switch',
    addresses: ['address', 'state_address'],
    required: ['address'],
    main: (a) => a.address,
    options: (fields) => ({ invert: fields.invert === true }),
    features: ({ addresses: a, options: o }) => [
      {
        key: 'switch',
        category: C.SWITCH,
        type: T.SWITCH.BINARY,
        min: 0,
        max: 1,
        read_only: false,
        has_feedback: Boolean(a.state_address),
        listen: [a.state_address, a.address],
        read: a.state_address,
        decode: bool(o.invert),
        command: { address: a.address, dpt: '1.001', encode: (v) => (v === 1) !== o.invert },
      },
    ],
  },

  light: {
    action: 'add_light',
    addresses: [
      'address',
      'state_address',
      'brightness_address',
      'brightness_state_address',
      'color_address',
      'color_state_address',
      'color_temperature_address',
      'color_temperature_state_address',
    ],
    required: ['address'],
    main: (a) => a.address,
    options: (fields) => {
      const minKelvin = bounded(Math.round(numberField(fields.min_kelvin, 2700)), 1000, 10000);
      const maxKelvin = bounded(Math.round(numberField(fields.max_kelvin, 6000)), 1000, 10000);
      return {
        min_kelvin: Math.min(minKelvin, maxKelvin),
        max_kelvin: Math.max(minKelvin, maxKelvin),
      };
    },
    features: ({ addresses: a, options: o }) => {
      const features = [
        {
          key: 'switch',
          category: C.LIGHT,
          type: T.LIGHT.BINARY,
          min: 0,
          max: 1,
          read_only: false,
          has_feedback: Boolean(a.state_address),
          listen: [a.state_address, a.address],
          read: a.state_address,
          decode: bool(),
          command: { address: a.address, dpt: '1.001', encode: (v) => v === 1 },
        },
      ];
      if (a.brightness_address || a.brightness_state_address) {
        features.push({
          key: 'brightness',
          category: C.LIGHT,
          type: T.LIGHT.BRIGHTNESS,
          unit: U.PERCENT,
          min: 0,
          max: 100,
          read_only: !a.brightness_address,
          has_feedback: Boolean(a.brightness_state_address),
          listen: [a.brightness_state_address, a.brightness_address],
          read: a.brightness_state_address,
          decode: percent,
          command: a.brightness_address
            ? {
                address: a.brightness_address,
                dpt: '5.001',
                encode: (v) => bounded(Math.round(v), 0, 100),
              }
            : null,
        });
      }
      if (a.color_address || a.color_state_address) {
        features.push({
          key: 'color',
          category: C.LIGHT,
          type: T.LIGHT.COLOR,
          min: 0,
          max: 16777215,
          read_only: !a.color_address,
          has_feedback: Boolean(a.color_state_address),
          listen: [a.color_state_address, a.color_address],
          read: a.color_state_address,
          decode: (data) => {
            const value = decode('232.600', data);
            return value && typeof value === 'object'
              ? (value.red << 16) | (value.green << 8) | value.blue
              : null;
          },
          command: a.color_address
            ? {
                address: a.color_address,
                dpt: '232.600',
                encode: (v) => {
                  const rgb = bounded(Math.round(v), 0, 16777215);
                  return { red: rgb >> 16, green: (rgb >> 8) & 0xff, blue: rgb & 0xff };
                },
              }
            : null,
        });
      }
      if (a.color_temperature_address || a.color_temperature_state_address) {
        // Gladys light temperatures are in mireds (1,000,000 / kelvins).
        const minMired = Math.round(MIRED / o.max_kelvin);
        const maxMired = Math.round(MIRED / o.min_kelvin);
        features.push({
          key: 'color_temperature',
          category: C.LIGHT,
          type: T.LIGHT.TEMPERATURE,
          min: minMired,
          max: maxMired,
          read_only: !a.color_temperature_address,
          has_feedback: Boolean(a.color_temperature_state_address),
          listen: [a.color_temperature_state_address, a.color_temperature_address],
          read: a.color_temperature_state_address,
          decode: (data) => {
            const kelvin = decode('7.600', data);
            return typeof kelvin === 'number' && kelvin > 0
              ? bounded(Math.round(MIRED / kelvin), minMired, maxMired)
              : null;
          },
          command: a.color_temperature_address
            ? {
                address: a.color_temperature_address,
                dpt: '7.600',
                encode: (v) =>
                  bounded(Math.round(MIRED / Math.max(1, v)), o.min_kelvin, o.max_kelvin),
              }
            : null,
        });
      }
      return features;
    },
  },

  cover: {
    action: 'add_cover',
    addresses: ['up_down_address', 'stop_address', 'position_address', 'position_state_address'],
    required: [],
    oneOf: ['up_down_address', 'position_address'],
    main: (a) => a.up_down_address ?? a.position_address,
    options: (fields) => ({
      cover_type: COVER_TYPES.includes(fields.cover_type) ? fields.cover_type : 'shutter',
      invert_position: fields.invert_position === true,
    }),
    features: ({ addresses: a, options: o }) => {
      const category = o.cover_type === 'curtain' ? C.CURTAIN : C.SHUTTER;
      const types = o.cover_type === 'curtain' ? T.CURTAIN : T.SHUTTER;
      // KNX positions: 0 % = open, 100 % = closed. Gladys: 100 = open.
      const toKnx = (v) => (o.invert_position ? v : 100 - v);
      const features = [
        {
          key: 'state',
          category,
          type: types.STATE,
          min: COVER.CLOSE,
          max: COVER.OPEN,
          read_only: false,
          has_feedback: false,
          listen: [a.up_down_address, a.stop_address],
          read: null,
          decode: (data, address) => {
            if (address === a.stop_address && address !== a.up_down_address) {
              return COVER.STOP;
            }
            const down = decode('1.008', data);
            if (typeof down !== 'boolean') {
              return null;
            }
            return down ? COVER.CLOSE : COVER.OPEN;
          },
          command: { cover: true },
        },
      ];
      if (a.position_address || a.position_state_address) {
        features.push({
          key: 'position',
          category,
          type: types.POSITION,
          unit: U.PERCENT,
          min: 0,
          max: 100,
          read_only: !a.position_address,
          has_feedback: Boolean(a.position_state_address),
          listen: [a.position_state_address, a.position_address],
          read: a.position_state_address,
          decode: (data) => {
            const value = percent(data);
            return value === null ? null : bounded(toKnx(value), 0, 100);
          },
          command: a.position_address
            ? {
                address: a.position_address,
                dpt: '5.001',
                encode: (v) => bounded(Math.round(toKnx(v)), 0, 100),
              }
            : null,
        });
      }
      return features;
    },
    /**
     * The open / close / stop command: up/down address, else a position.
     * @returns {object} `{ address, dpt, value }`.
     */
    coverCommand: ({ addresses: a, options: o }, value) => {
      if (value === COVER.STOP) {
        if (!a.stop_address) {
          throw new CommandError('errorNoStopAddress');
        }
        // DPT 1.007 (step) or 1.010 (stop): any telegram stops a moving cover.
        return { address: a.stop_address, dpt: '1.010', value: true };
      }
      if (a.up_down_address) {
        return { address: a.up_down_address, dpt: '1.008', value: value === COVER.CLOSE };
      }
      const open = value === COVER.OPEN;
      const knxPosition = o.invert_position ? (open ? 100 : 0) : open ? 0 : 100;
      return { address: a.position_address, dpt: '5.001', value: knxPosition };
    },
  },

  sensor: {
    action: 'add_sensor',
    addresses: ['address'],
    required: ['address'],
    main: (a) => a.address,
    options: (fields) => ({
      sensor_type: SENSOR_TYPES[fields.sensor_type] ? fields.sensor_type : 'temperature',
    }),
    features: ({ addresses: a, options: o }) => {
      const spec = SENSOR_TYPES[o.sensor_type];
      return [
        {
          key: 'value',
          name: o.sensor_type,
          category: spec.category,
          type: spec.type,
          unit: spec.unit,
          min: spec.min,
          max: spec.max,
          read_only: true,
          has_feedback: true,
          listen: [a.address],
          read: a.address,
          decode: spec.decode,
          command: null,
        },
      ];
    },
  },

  binary_sensor: {
    action: 'add_binary_sensor',
    addresses: ['address'],
    required: ['address'],
    main: (a) => a.address,
    options: (fields) => ({
      sensor_type: BINARY_SENSOR_TYPES[fields.sensor_type] ? fields.sensor_type : 'generic',
      invert: fields.invert === true,
    }),
    features: ({ addresses: a, options: o }) => {
      const spec = BINARY_SENSOR_TYPES[o.sensor_type];
      return [
        {
          key: 'value',
          name: o.sensor_type,
          category: spec.category,
          type: spec.type,
          min: 0,
          max: 1,
          read_only: true,
          has_feedback: true,
          listen: [a.address],
          read: a.address,
          decode: bool(spec.invert !== o.invert),
          command: null,
        },
      ];
    },
  },

  climate: {
    action: 'add_climate',
    addresses: [
      'temperature_address',
      'target_temperature_address',
      'target_temperature_state_address',
    ],
    required: ['target_temperature_address'],
    main: (a) => a.target_temperature_address,
    options: (fields) => {
      const min = bounded(numberField(fields.min_temperature, 7), -20, 60);
      const max = bounded(numberField(fields.max_temperature, 30), -20, 60);
      const step = bounded(numberField(fields.temperature_step, 0.5), 0.1, 5);
      return {
        min_temperature: Math.min(min, max),
        max_temperature: Math.max(min, max),
        temperature_step: step,
      };
    },
    features: ({ addresses: a, options: o }) => {
      const features = [
        {
          key: 'target_temperature',
          category: C.THERMOSTAT,
          type: T.THERMOSTAT.TARGET_TEMPERATURE,
          unit: U.CELSIUS,
          min: o.min_temperature,
          max: o.max_temperature,
          step: o.temperature_step,
          read_only: false,
          has_feedback: Boolean(a.target_temperature_state_address),
          listen: [a.target_temperature_state_address, a.target_temperature_address],
          read: a.target_temperature_state_address,
          decode: sized({ 2: ['9.001'], 4: ['14.068'] }),
          command: {
            address: a.target_temperature_address,
            dpt: '9.001',
            encode: (v) => bounded(v, o.min_temperature, o.max_temperature),
          },
        },
      ];
      if (a.temperature_address) {
        features.unshift({
          key: 'temperature',
          category: C.TEMPERATURE_SENSOR,
          type: T.SENSOR.DECIMAL,
          unit: U.CELSIUS,
          min: -50,
          max: 150,
          read_only: true,
          has_feedback: true,
          listen: [a.temperature_address],
          read: a.temperature_address,
          decode: sized({ 2: ['9.001'], 4: ['14.068'] }),
          command: null,
        });
      }
      return features;
    },
  },
};

/** An error whose message is an i18n key (shown in the user's language). */
export class CommandError extends Error {
  constructor(key, params = {}) {
    super(key);
    this.key = key;
    this.params = params;
  }
}

/**
 * @description Build a definition from the fields of an `add_<kind>` form.
 * @param {string} kind - Kind key.
 * @param {object} fields - Form values.
 * @returns {object} The definition `{ kind, id, name, addresses, options }`.
 * @throws {CommandError} On a missing name, a missing or invalid address.
 */
export function definitionFromFields(kind, fields = {}) {
  const spec = KINDS[kind];
  const name = typeof fields.name === 'string' ? fields.name.trim().slice(0, 100) : '';
  if (!name) {
    throw new CommandError('errorNameRequired');
  }
  const addresses = {};
  for (const key of spec.addresses) {
    const raw = typeof fields[key] === 'string' ? fields[key].trim() : '';
    if (!raw) {
      continue;
    }
    const address = normalizeGroupAddress(raw);
    if (!address) {
      throw new CommandError('errorInvalidAddress', { field: key, value: raw });
    }
    addresses[key] = address;
  }
  for (const key of spec.required) {
    if (!addresses[key]) {
      throw new CommandError('errorAddressRequired', { field: key });
    }
  }
  if (spec.oneOf && !spec.oneOf.some((key) => addresses[key])) {
    throw new CommandError('errorAddressRequired', { field: spec.oneOf.join(' / ') });
  }
  const main = spec.main(addresses);
  return { kind, id: addressId(main), name, addresses, options: spec.options(fields) };
}

/**
 * @description Check and complete a stored definition (registry.js reads them
 * back from the configuration: they may come from an older version).
 * @param {object} raw - Stored definition.
 * @returns {object|null} The definition, or null when unusable.
 */
export function normalizeDefinition(raw) {
  const spec = KINDS[raw?.kind];
  if (!spec || typeof raw.name !== 'string' || !raw.name) {
    return null;
  }
  const addresses = {};
  for (const key of spec.addresses) {
    const address = normalizeGroupAddress(raw.addresses?.[key] ?? '');
    if (address) {
      addresses[key] = address;
    }
  }
  if (spec.required.some((key) => !addresses[key])) {
    return null;
  }
  if (spec.oneOf && !spec.oneOf.some((key) => addresses[key])) {
    return null;
  }
  const id = typeof raw.id === 'string' && raw.id ? raw.id : addressId(spec.main(addresses));
  return {
    kind: raw.kind,
    id,
    name: raw.name,
    addresses,
    options: spec.options(raw.options ?? {}),
  };
}

/**
 * @description The features of a definition, with their bindings.
 * @param {object} definition - Normalized definition.
 * @returns {object[]} Feature specs (see the header).
 */
export function featureSpecs(definition) {
  return KINDS[definition.kind].features(definition).map((spec) => ({
    ...spec,
    listen: [...new Set(spec.listen.filter(Boolean))],
    read: spec.read ?? null,
  }));
}

/**
 * @description The Gladys device of a definition.
 * @param {object} gladys - SDK client (externalIds).
 * @param {object} definition - Normalized definition.
 * @param {string} language - Language of the feature names.
 * @returns {object} The device, in the Gladys format.
 */
export function buildDevice(gladys, definition, language) {
  const ids = gladys.externalIds(definition.kind, definition.id);
  const features = featureSpecs(definition).map((spec) => {
    const feature = {
      name: `${definition.name} - ${featureName(spec.name ?? spec.key, language)}`,
      external_id: ids.feature(spec.key),
      category: spec.category,
      type: spec.type,
      min: spec.min,
      max: spec.max,
      read_only: spec.read_only,
      has_feedback: spec.has_feedback,
      keep_history: true,
    };
    if (spec.unit) {
      feature.unit = spec.unit;
    }
    if (spec.step) {
      feature.step = spec.step;
    }
    return feature;
  });
  const params = Object.entries(definition.addresses).map(([key, address]) => ({
    name: `KNX_${key.toUpperCase()}`,
    value: address,
  }));
  return {
    name: definition.name,
    external_id: ids.device,
    // KNX pushes every change: nothing to poll.
    should_poll: false,
    features,
    params,
  };
}
