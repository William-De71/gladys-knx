// -----------------------------------------------------------------------------
// The integration: every Gladys handler, registered before connect().
//
//   bus telegram ──> bindings (group address -> features) ──> states.js
//                └─> monitor (widget)  └─> scene trigger telegram_received
//   Gladys command ──> devices.js (feature -> telegram) ──> bus.write
//   configuration buttons ──> registry.js (declared devices) ──> Discover tab
//
// The connection: the configured interface, or the one found by a scan when
// the address is left empty. At each connection, the status addresses of the
// declared devices are read (GroupValueRead), then again every
// `sync_interval_minutes`.
//
// The tests drive it with the fake Gladys of the SDK and a fake bus
// (test/app.test.js).
// -----------------------------------------------------------------------------

import { logger as sdkLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig, sameConnection } from './config.js';
import { buildDevice, CommandError, definitionFromFields, featureSpecs, KINDS } from './devices.js';
import { t, text, truncateAll } from './i18n.js';
import { matchesPattern, normalizeGroupAddress, parseAddressPatterns } from './knx/address.js';
import { createBus, describe } from './knx/bus.js';
import { buildSearchRequest, KNX_PORT, parseScanResults } from './knx/discovery.js';
import { canEncode, decode, encodedHex, isKnownDpt, parseValue, scalarValue } from './knx/dpt.js';
import { createMonitor } from './monitor.js';
import { createRegistry, mainAddress, RegistryError } from './registry.js';
import { createEventLimiter, SCENE_ACTIONS, telegramEventData, TRIGGERS } from './scenes.js';
import { createStatePublisher } from './states.js';
import { buildBusWidget, WIDGET_ACTIONS, WIDGET_KEY } from './widgets.js';

export const ACTIONS = {
  TEST: 'test_connection',
  DISCOVER: 'discover_gateways',
  LIST: 'list_devices',
  REMOVE: 'remove_device',
};

const MINUTE = 60 * 1000;
const RESCAN_MS = 5 * MINUTE;
const WIDGET_REFRESH_SPACING_MS = 11 * 1000;
const MAX_MESSAGE = 1800;
const OWN_ECHO_MS = 3000;

/**
 * @description Wire the integration.
 * @param {object} gladys - SDK client (or the fake one of the tests).
 * @param {object} [deps] - Dependencies.
 * @param {Function} [deps.createBus] - `({ logger }) => bus` (src/knx/bus.js).
 * @param {object} [deps.logger] - Logger.
 * @param {Function} [deps.now] - Clock (ms).
 * @param {number} [deps.readSpacingMs] - Delay between two read requests.
 * @param {number} [deps.readTimeoutMs] - Wait of the read_value scene action.
 * @returns {object} `{ start, stop, readAll, handleTelegram, … }`.
 */
export function createApp(
  gladys,
  {
    createBus: busFactory = createBus,
    logger = sdkLogger,
    now = Date.now,
    readSpacingMs = 50,
    readTimeoutMs = 5000,
  } = {},
) {
  let config = normalizeConfig(gladys.config ?? {});
  let connection = null;
  let lastReason = '';
  let everConnected = false;
  let lostAt = null;
  let syncTimer = null;
  let rescanTimer = null;
  let lastWidgetRefresh = 0;
  let pendingWidgetRefresh = null;
  let bindings = new Map();
  const created = new Set();
  const readQueue = new Set();
  let readTimer = null;
  const waiters = new Map();
  // Telegrams this integration sent, by `<address>|<data hex or "read">`: an
  // interface or a router that sends them back (multicast loopback, some
  // tunnel servers) must never start a scene (loop risk).
  const sent = new Map();

  const registry = createRegistry(gladys, logger);
  const monitor = createMonitor({ now });
  const limiter = createEventLimiter({ now, logger });
  const states = createStatePublisher(gladys, {
    logger,
    now,
    isCreated: (externalId) => created.has(externalId),
  });
  const bus = busFactory({ logger });

  const safely = (promise, what) =>
    Promise.resolve()
      .then(promise)
      .catch((error) => logger.warn(`KNX: ${what} failed: ${error?.message ?? error}`));

  const lang = () => config.language;

  // --- Bindings: group address -> features ----------------------------------------

  const rebuildBindings = () => {
    const next = new Map();
    for (const definition of registry.list()) {
      const ids = gladys.externalIds(definition.kind, definition.id);
      for (const spec of featureSpecs(definition)) {
        for (const address of spec.listen) {
          const list = next.get(address) ?? [];
          list.push({ definition, spec, featureId: ids.feature(spec.key) });
          next.set(address, list);
        }
      }
    }
    bindings = next;
  };

  const readAddressesOf = (definition) =>
    featureSpecs(definition)
      .map((spec) => spec.read)
      .filter(Boolean);

  // --- Read requests (GroupValueRead), spaced to spare the bus ----------------------

  const pumpReads = () => {
    if (readTimer || readQueue.size === 0) {
      return;
    }
    readTimer = setTimeout(() => {
      readTimer = null;
      const [address] = readQueue;
      readQueue.delete(address);
      if (bus.isConnected()) {
        try {
          bus.read(address);
          remember(address, 'read');
        } catch (error) {
          logger.debug(`KNX: read ${address} failed: ${error.message}`);
        }
        pumpReads();
      } else {
        readQueue.clear();
      }
    }, readSpacingMs);
    readTimer.unref?.();
  };

  const queueReads = (addresses) => {
    if (!bus.isConnected()) {
      return 0;
    }
    const before = readQueue.size;
    addresses.forEach((address) => readQueue.add(address));
    pumpReads();
    return readQueue.size - before;
  };

  const readAll = () => {
    const addresses = new Set(registry.list().flatMap(readAddressesOf));
    queueReads([...addresses]);
    return addresses.size;
  };

  // --- Own telegrams ---------------------------------------------------------------

  const remember = (address, data) => {
    const current = now();
    for (const [key, at] of sent) {
      if (current - at > OWN_ECHO_MS) {
        sent.delete(key);
      }
    }
    sent.set(`${address}|${data}`, current);
  };

  const isOwn = (telegram) => {
    const data = telegram.type === 'read' ? 'read' : (telegram.data?.toString('hex') ?? '');
    const at = sent.get(`${telegram.destination}|${data}`);
    return (
      (at !== undefined && now() - at <= OWN_ECHO_MS) ||
      (connection?.individualAddress && telegram.source === connection.individualAddress)
    );
  };

  // --- Telegrams --------------------------------------------------------------------

  const displayOf = (spec, value) => {
    if (value === null || value === undefined) {
      return null;
    }
    // Words of the Gladys meaning: a closed window is 1 in Gladys, 0 on the bus.
    if (spec.category === 'opening-sensor') {
      return { kind: 'word', key: value === 1 ? 'valueClosed' : 'valueOpen' };
    }
    if (spec.key === 'state' && (spec.category === 'shutter' || spec.category === 'curtain')) {
      const words = { 1: 'valueUp', 0: 'valueStop', '-1': 'valueDown' };
      return { kind: 'word', key: words[value] };
    }
    if (spec.min === 0 && spec.max === 1 && !spec.unit) {
      return { kind: 'bool', value: value === 1 };
    }
    return { kind: 'number', value, unit: spec.unit };
  };

  const handleTelegram = (telegram) => {
    const targets = telegram.type === 'read' ? [] : (bindings.get(telegram.destination) ?? []);
    let label = null;
    let display = null;
    let featureValue = null;
    for (const { definition, spec, featureId } of targets) {
      const value = spec.decode(telegram.data, telegram.destination);
      label ??= definition.name;
      if (value === null || value === undefined) {
        continue;
      }
      display ??= displayOf(spec, value);
      featureValue ??= value;
      states.push(featureId, value);
    }

    const pattern = config.events.find((entry) => matchesPattern(entry, telegram.destination));
    // Without a DPT after the address: the value of the Gladys feature bound to it.
    let eventValue = featureValue;
    if (pattern?.dpt && telegram.data) {
      eventValue = decode(pattern.dpt, telegram.data);
      display = eventValue === null ? display : { kind: 'text', value: scalarValue(eventValue) };
    }
    monitor.record(telegram, { label, display });

    if (telegram.type !== 'read') {
      for (const resolve of waiters.get(telegram.destination) ?? []) {
        resolve(telegram);
      }
      waiters.delete(telegram.destination);
    }

    if (pattern && !isOwn(telegram) && limiter.allow()) {
      const data = {
        ...telegramEventData(telegram, eventValue),
        numeric_value: numericOf(eventValue),
      };
      safely(() => gladys.publishSceneEvent(TRIGGERS.TELEGRAM, data), 'scene event');
    }
  };

  // --- Connection status and scene triggers -----------------------------------------

  const publishStatus = (connected, message) =>
    safely(() => gladys.setConnectionStatus(connected, truncateAll(message, 500)), 'status');

  const refreshWidget = () => {
    const wait = lastWidgetRefresh + WIDGET_REFRESH_SPACING_MS - now();
    if (wait <= 0) {
      lastWidgetRefresh = now();
      safely(() => gladys.requestWidgetRefresh(WIDGET_KEY), 'widget refresh');
    } else if (!pendingWidgetRefresh) {
      pendingWidgetRefresh = setTimeout(() => {
        pendingWidgetRefresh = null;
        refreshWidget();
      }, wait);
      pendingWidgetRefresh.unref?.();
    }
  };

  const scheduleSync = () => {
    clearInterval(syncTimer);
    syncTimer = null;
    if (config.syncIntervalMs > 0) {
      syncTimer = setInterval(() => {
        if (bus.isConnected()) {
          readAll();
        }
      }, config.syncIntervalMs);
      syncTimer.unref?.();
    }
  };

  bus.on('telegram', (telegram) => {
    try {
      handleTelegram(telegram);
    } catch (error) {
      logger.warn(`KNX: telegram ${telegram?.destination} not handled: ${error.message}`);
    }
  });

  bus.on('connected', () => {
    const gateway = describe(connection);
    lastReason = '';
    publishStatus(true, t('statusConnected', { gateway }));
    if (everConnected && lostAt !== null) {
      // The data is built now: the event is sent after this handler returns.
      const data = { gateway, downtime_seconds: Math.round((now() - lostAt) / 1000) };
      safely(() => gladys.publishSceneEvent(TRIGGERS.RESTORED, data), 'scene event');
    }
    everConnected = true;
    lostAt = null;
    if (config.syncStates) {
      readAll();
    }
    refreshWidget();
  });

  bus.on('disconnected', (reason) => {
    lastReason = String(reason ?? '');
    if (reason === 'stopped' || reason === 'reconfigured') {
      return;
    }
    const gateway = describe(connection);
    publishStatus(false, t('statusDisconnected', { gateway, reason: lastReason }));
    if (everConnected && lostAt === null) {
      lostAt = now();
      const data = { gateway, reason: lastReason.slice(0, 200) };
      safely(() => gladys.publishSceneEvent(TRIGGERS.LOST, data), 'scene event');
    }
    refreshWidget();
  });

  // --- Gateway discovery --------------------------------------------------------------

  const scan = async () => {
    const results = await gladys.scanNetwork('udp-active-broadcast', {
      port: KNX_PORT,
      payload: buildSearchRequest(),
      timeoutSeconds: 3,
    });
    return parseScanResults(results);
  };

  /** The connection to open: the configured one, or the interface a scan finds. */
  const resolveConnection = async () => {
    clearTimeout(rescanTimer);
    rescanTimer = null;
    if (!config.connection) {
      const problem = config.problems.map((key) => t(key));
      publishStatus(false, t('statusConfigProblem', { problem: problem[0] ?? '' }));
      return null;
    }
    if (!config.needsScan) {
      return config.connection;
    }
    let gateways = [];
    try {
      gateways = await scan();
    } catch (error) {
      logger.warn(`KNX: gateway scan failed: ${error.message}`);
    }
    const tcp = config.connection.mode === 'tunnel_tcp';
    const gateway =
      gateways.find((candidate) => candidate.tunnelling && (!tcp || candidate.secure)) ??
      gateways.find((candidate) => candidate.tunnelling) ??
      gateways[0];
    if (!gateway) {
      publishStatus(false, t('statusNoGateway'));
      rescanTimer = setTimeout(() => safely(connect, 'connection'), RESCAN_MS);
      rescanTimer.unref?.();
      return null;
    }
    logger.info(
      `KNX: interface found by the scan: ${gateway.name} ${gateway.host}:${gateway.port}`,
    );
    return { ...config.connection, host: gateway.host, port: gateway.port };
  };

  const connect = async () => {
    const next = await resolveConnection();
    connection = next;
    if (next) {
      publishStatus(false, t('statusConnecting', { gateway: describe(next) }));
    }
    await bus.start(next);
  };

  // --- Handlers -------------------------------------------------------------------------

  const discovered = () =>
    registry.list().map((definition) => buildDevice(gladys, definition, lang()));

  const publishDiscovered = () =>
    safely(() => gladys.publishDiscoveredDevices(discovered()), 'discovery');

  gladys.onScanRequest(async () => {
    await gladys.publishDiscoveredDevices(discovered());
  });

  const errorText = (error) =>
    error instanceof CommandError || error instanceof RegistryError
      ? text(error.key, lang(), error.params)
      : error.message;

  const write = (address, value, dpt) => {
    if (!bus.isConnected()) {
      throw new Error(text('errorNotConnected', lang()));
    }
    bus.write(address, value, dpt);
    remember(address, encodedHex(dpt, value));
  };

  gladys.onSetValue(async (device, feature, value) => {
    const definition = registry.byExternalId(device.external_id);
    if (!definition) {
      throw new Error(text('errorUnknownDevice', lang()));
    }
    const key = String(feature.external_id).split(':').pop();
    const spec = featureSpecs(definition).find((candidate) => candidate.key === key);
    if (!spec?.command) {
      throw new Error(text('errorReadOnly', lang()));
    }
    let telegram;
    try {
      telegram = spec.command.cover
        ? KINDS.cover.coverCommand(definition, Number(value))
        : { ...spec.command, value: spec.command.encode(Number(value)) };
    } catch (error) {
      throw new Error(errorText(error), { cause: error });
    }
    write(telegram.address, telegram.value, telegram.dpt);
    if (!spec.has_feedback) {
      // Gladys saves the commanded value itself: the next telegram must be
      // published even if it equals the last one we sent.
      states.forget(feature.external_id);
    }
  });

  const deviceEvent = (handler) => async (device) => {
    if (device?.external_id) {
      handler(device.external_id);
    }
  };

  gladys.onDeviceCreated(
    deviceEvent((externalId) => {
      created.add(externalId);
      states.republish(externalId);
      const definition = registry.byExternalId(externalId);
      if (definition) {
        queueReads(readAddressesOf(definition));
      }
      refreshWidget();
    }),
  );
  gladys.onDeviceUpdated(
    deviceEvent((externalId) => {
      created.add(externalId);
      states.republish(externalId);
    }),
  );
  gladys.onDeviceDeleted(
    deviceEvent((externalId) => {
      created.delete(externalId);
      states.forget(externalId);
      refreshWidget();
    }),
  );

  gladys.onConfigUpdated(async (raw) => {
    const previous = config;
    config = normalizeConfig(raw ?? {});
    if (previous.language !== config.language) {
      await publishDiscovered();
    }
    if (previous.syncIntervalMs !== config.syncIntervalMs) {
      scheduleSync();
    }
    if (
      !sameConnection(previous.connection, config.connection) ||
      previous.needsScan !== config.needsScan ||
      !bus.isConnected()
    ) {
      await connect();
    }
  });

  // --- Configuration buttons ---------------------------------------------------------------

  for (const [kind, spec] of Object.entries(KINDS)) {
    gladys.onAction(spec.action, async (fields) => {
      let definition;
      try {
        definition = definitionFromFields(kind, fields ?? {});
        const isNew = await registry.upsert(definition);
        rebuildBindings();
        await publishDiscovered();
        queueReads(readAddressesOf(definition));
        return t(isNew ? 'deviceAdded' : 'deviceUpdated', { name: definition.name });
      } catch (error) {
        if (error instanceof CommandError || error instanceof RegistryError) {
          return t(error.key, error.params);
        }
        return t('saveFailed', { error: error.message });
      }
    });
  }

  gladys.onAction(ACTIONS.LIST, async () => {
    const definitions = registry.list();
    if (definitions.length === 0) {
      return t('listEmpty');
    }
    const message = {};
    for (const language of ['en', 'fr', 'de', 'es']) {
      const list = definitions
        .map(
          (definition) =>
            `${definition.name} (${text(`kind_${definition.kind}`, language)}, ${mainAddress(definition)})`,
        )
        .join(' ; ');
      message[language] = text('listHeader', language, { count: definitions.length, list });
    }
    return truncateAll(message, MAX_MESSAGE);
  });

  gladys.onAction(ACTIONS.REMOVE, async (fields) => {
    const query = String(fields?.device ?? '').trim();
    const matches = registry.find(query);
    if (matches.length === 0) {
      return t('deviceNotFound', { query });
    }
    if (matches.length > 1) {
      return t('deviceAmbiguous', { query });
    }
    try {
      await registry.remove(matches[0]);
    } catch (error) {
      return t('saveFailed', { error: error.message });
    }
    rebuildBindings();
    await publishDiscovered();
    refreshWidget();
    return t('deviceRemoved', { name: matches[0].name });
  });

  gladys.onAction(ACTIONS.TEST, async () => {
    if (!config.connection) {
      return t('statusConfigProblem', { problem: t(config.problems[0] ?? 'configInvalidHost') });
    }
    if (!connection) {
      return t('statusNoGateway');
    }
    const gateway = describe(connection);
    if (bus.isConnected()) {
      return t('testConnected', {
        gateway,
        devices: registry.list().length,
        telegrams: monitor.perMinute(),
      });
    }
    return t('testNotConnected', { gateway, reason: lastReason || '…' });
  });

  gladys.onAction(ACTIONS.DISCOVER, async () => {
    let gateways;
    try {
      gateways = await scan();
    } catch (error) {
      if (error?.status === 429) {
        return t('discoverRateLimited');
      }
      throw error;
    }
    if (gateways.length === 0) {
      return t('discoverNone');
    }
    const list = gateways
      .map((gateway) => {
        const services = [
          gateway.tunnelling && 'tunnelling',
          gateway.routing && 'routing',
          gateway.secure && 'secure',
        ]
          .filter(Boolean)
          .join('/');
        return `${gateway.name || 'KNX IP'} ${gateway.host}:${gateway.port} (${gateway.individualAddress ?? '?'}, ${services || '?'})`;
      })
      .join(' ; ');
    return truncateAll(t('discoverFound', { list }), MAX_MESSAGE);
  });

  // --- Widget -----------------------------------------------------------------------------

  const snapshot = (settings = {}) => {
    const { patterns } = parseAddressPatterns(settings.group_filter ?? '');
    return {
      configured: Boolean(config.connection),
      connected: bus.isConnected(),
      gateway: connection ? describe(connection) : '',
      devices: registry.list().length,
      perMinute: monitor.perMinute(),
      telegrams: monitor.last({ limit: 8, patterns }),
    };
  };

  gladys.onWidgetGet(WIDGET_KEY, async ({ settings } = {}) =>
    buildBusWidget(snapshot(settings), settings),
  );

  gladys.onWidgetAction(WIDGET_KEY, async (actionKey) => {
    if (actionKey === WIDGET_ACTIONS.READ_ALL) {
      if (!bus.isConnected()) {
        return t('errorNotConnected');
      }
      return t('widgetReadSent', { count: readAll() });
    }
    if (actionKey === WIDGET_ACTIONS.RECONNECT) {
      safely(connect, 'reconnection');
      return t('widgetReconnecting');
    }
    return undefined;
  });

  // --- Scene actions ---------------------------------------------------------------------------

  const sceneAddress = (value) => {
    const address = normalizeGroupAddress(String(value ?? ''));
    if (!address) {
      throw new Error(
        text('errorInvalidAddress', lang(), { field: 'group_address', value: value ?? '' }),
      );
    }
    return address;
  };

  const sceneDpt = (value) => {
    const dpt = String(value ?? '').trim();
    if (!isKnownDpt(dpt)) {
      throw new Error(text('errorInvalidDpt', lang(), { dpt }));
    }
    return dpt;
  };

  gladys.onSceneAction(SCENE_ACTIONS.SEND, async (fields) => {
    const address = sceneAddress(fields.group_address);
    const dpt = sceneDpt(fields.dpt ?? '1.001');
    const value = parseValue(dpt, fields.value);
    if (value === undefined || !canEncode(dpt, value)) {
      throw new Error(text('errorInvalidValue', lang(), { value: fields.value ?? '', dpt }));
    }
    write(address, value, dpt);
    return undefined;
  });

  gladys.onSceneAction(SCENE_ACTIONS.SCENE, async (fields) => {
    const address = sceneAddress(fields.group_address);
    const scene = Number(fields.scene_number);
    if (!Number.isInteger(scene) || scene < 1 || scene > 64) {
      throw new Error(text('errorSceneNumber', lang()));
    }
    // ETS numbers scenes 1-64, the telegram carries 0-63 (DPT 17.001).
    write(address, scene - 1, '17.001');
    return undefined;
  });

  gladys.onSceneAction(SCENE_ACTIONS.READ, async (fields) => {
    const address = sceneAddress(fields.group_address);
    const dpt = sceneDpt(fields.dpt ?? '1.001');
    if (!bus.isConnected()) {
      throw new Error(text('errorNotConnected', lang()));
    }
    const answer = await new Promise((resolve, reject) => {
      const list = waiters.get(address) ?? [];
      const timer = setTimeout(() => {
        const remaining = (waiters.get(address) ?? []).filter((entry) => entry !== done);
        if (remaining.length > 0) {
          waiters.set(address, remaining);
        } else {
          waiters.delete(address);
        }
        reject(
          new Error(
            text('errorReadTimeout', lang(), {
              address,
              seconds: Math.round(readTimeoutMs / 1000),
            }),
          ),
        );
      }, readTimeoutMs);
      const done = (telegram) => {
        clearTimeout(timer);
        resolve(telegram);
      };
      list.push(done);
      waiters.set(address, list);
      try {
        bus.read(address);
        remember(address, 'read');
      } catch (error) {
        clearTimeout(timer);
        waiters.delete(address);
        reject(error);
      }
    });
    const value = decode(dpt, answer.data);
    const scalar = scalarValue(value);
    return {
      value: scalar === null ? '' : String(scalar),
      numeric_value: numericOf(value),
      raw: answer.data ? answer.data.toString('hex') : '',
    };
  });

  // --- Lifecycle ----------------------------------------------------------------------------------

  return {
    /** Load the declarations, publish them, connect to the bus. */
    async start() {
      config = normalizeConfig(gladys.config ?? {});
      registry.load(gladys.config ?? {});
      created.clear();
      (gladys.devices ?? []).forEach((device) => created.add(device.external_id));
      rebuildBindings();
      if (config.invalidEvents.length > 0) {
        logger.warn(`KNX: ignored scene group addresses: ${config.invalidEvents.join(', ')}`);
      }
      await publishDiscovered();
      scheduleSync();
      await connect();
    },

    async stop() {
      clearInterval(syncTimer);
      clearTimeout(rescanTimer);
      clearTimeout(readTimer);
      clearTimeout(pendingWidgetRefresh);
      readQueue.clear();
      states.stop();
      await bus.stop();
    },

    readAll,
    handleTelegram,
    flushStates: () => states.flush(),
    registry,
    monitor,
  };
}

/**
 * @description The number form of a value, for the `numeric_value` variable:
 * a boolean as 1 / 0, a finite number as is, anything else null.
 * @param {*} value - Decoded value.
 * @returns {number|null} The number.
 */
export function numericOf(value) {
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
