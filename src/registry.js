// -----------------------------------------------------------------------------
// The devices the user declared with the configuration buttons.
//
// Stored through setConfig() under REGISTRY_KEY, a key outside the
// config_schema: the configuration lives in the Gladys database, so the
// declarations follow the Gladys backups (/data does not). A change is applied
// in memory only once Gladys saved it: a failed save never leaves the
// integration with devices Gladys forgot.
// -----------------------------------------------------------------------------

import { REGISTRY_KEY } from './config.js';
import { normalizeGroupAddress } from './knx/address.js';
import { KINDS, normalizeDefinition } from './devices.js';

// Far beyond a house, well under the 2,000 devices of a discovery list.
export const MAX_DEVICES = 1000;

export class RegistryError extends Error {
  constructor(key, params = {}) {
    super(key);
    this.key = key;
    this.params = params;
  }
}

/**
 * @description Read the stored declarations.
 * @param {*} stored - The REGISTRY_KEY value (an array, or its JSON).
 * @param {object} [logger] - Logger.
 * @returns {object[]} Normalized definitions.
 */
export function parseRegistry(stored, logger) {
  let list = stored;
  if (typeof stored === 'string') {
    try {
      list = JSON.parse(stored);
    } catch {
      logger?.warn('KNX: the stored device declarations are not valid JSON, ignored');
      return [];
    }
  }
  if (!Array.isArray(list)) {
    return [];
  }
  const seen = new Set();
  const definitions = [];
  for (const raw of list) {
    const definition = normalizeDefinition(raw);
    const key = definition && `${definition.kind}:${definition.id}`;
    if (!definition || seen.has(key)) {
      logger?.warn(`KNX: stored device declaration ignored: ${JSON.stringify(raw)?.slice(0, 200)}`);
      continue;
    }
    seen.add(key);
    definitions.push(definition);
  }
  return definitions;
}

/**
 * @description The registry of declared devices.
 * @param {object} gladys - SDK client (setConfig).
 * @param {object} [logger] - Logger.
 * @returns {object} The registry.
 */
export function createRegistry(gladys, logger) {
  let definitions = [];
  let writing = Promise.resolve();

  // One change at a time, computed from the previous one once it is saved:
  // two quick buttons never lose a declaration.
  const serial = (change) => {
    const run = writing.then(async () => {
      const { next, result } = change(definitions);
      await gladys.setConfig({ [REGISTRY_KEY]: next });
      definitions = next;
      return result;
    });
    writing = run.catch(() => {});
    return run;
  };

  const registry = {
    /** @param {object} config - `gladys.config`. */
    load(config) {
      definitions = parseRegistry(config?.[REGISTRY_KEY], logger);
      return definitions;
    },

    list: () => definitions,

    /**
     * @description The definition of a Gladys device.
     * @param {string} externalId - Device external id `ext:<selector>:<kind>:<id>`.
     * @returns {object|undefined} The definition.
     */
    byExternalId(externalId) {
      const [kind, id] = String(externalId ?? '')
        .split(':')
        .slice(-2);
      return definitions.find((definition) => definition.kind === kind && definition.id === id);
    },

    /**
     * @description Add or replace a declaration (same kind and main address =
     * the same device: its external id does not change).
     * @param {object} definition - From definitionFromFields.
     * @returns {Promise<boolean>} True when created, false when updated.
     */
    upsert(definition) {
      return serial((current) => {
        const index = current.findIndex(
          (existing) => existing.kind === definition.kind && existing.id === definition.id,
        );
        const taken = current.find(
          (existing) => existing.id === definition.id && existing.kind !== definition.kind,
        );
        if (taken) {
          throw new RegistryError('registryAddressTaken', {
            address: definition.id.replaceAll('-', '/'),
            name: taken.name,
            kind: taken.kind,
          });
        }
        if (index === -1 && current.length >= MAX_DEVICES) {
          throw new RegistryError('registryFull', { max: MAX_DEVICES });
        }
        const next =
          index === -1
            ? [...current, definition]
            : current.map((existing, position) => (position === index ? definition : existing));
        return { next, result: index === -1 };
      });
    },

    /**
     * @description Find the declarations matching a name or a main group address.
     * @param {string} query - Name (any case) or group address.
     * @returns {object[]} The matches.
     */
    find(query) {
      const value = String(query ?? '').trim();
      const address = normalizeGroupAddress(value);
      if (address) {
        const id = address.replaceAll('/', '-');
        const byAddress = definitions.filter((definition) => definition.id === id);
        if (byAddress.length > 0) {
          return byAddress;
        }
      }
      const lower = value.toLowerCase();
      return definitions.filter((definition) => definition.name.toLowerCase() === lower);
    },

    /**
     * @description Remove a declaration.
     * @param {object} definition - One of the list.
     * @returns {Promise<void>} Resolved once saved.
     */
    remove(definition) {
      return serial((current) => ({
        next: current.filter(
          (existing) => existing.kind !== definition.kind || existing.id !== definition.id,
        ),
      }));
    },
  };
  return registry;
}

/**
 * @description The main group address of a definition, for the lists.
 * @param {object} definition - Definition.
 * @returns {string} "1/2/3".
 */
export function mainAddress(definition) {
  return KINDS[definition.kind].main(definition.addresses);
}
