// -----------------------------------------------------------------------------
// The `bus` dashboard widget: the state of the connection, the traffic and
// the last telegrams of the bus (a small group monitor), with two buttons.
//
// Pure: buildBusWidget() turns a snapshot into a content, so the tests and
// docs/illustrations/gen.mjs use the exact code Gladys gets. Every text is
// multi-language: Gladys caches the content per language.
// -----------------------------------------------------------------------------

import { LANGUAGES, t, truncate, truncateAll } from './i18n.js';

export const WIDGET_KEY = 'bus';
export const WIDGET_ACTIONS = { READ_ALL: 'read_all', RECONNECT: 'reconnect' };
export const DEFAULT_MAX_TELEGRAMS = 6;
export const TTL_SECONDS = 15;

const UNIT_SYMBOLS = {
  celsius: '°C',
  percent: '%',
  lux: 'lx',
  ppm: 'ppm',
  hPa: 'hPa',
  'meter-per-second': 'm/s',
  watt: 'W',
  'kilowatt-hour': 'kWh',
  volt: 'V',
  ampere: 'A',
};

/**
 * @description The badge text of a telegram value.
 * @param {object|null} display - `{ kind: 'bool' | 'number' | 'text', value, unit }`
 * or `{ kind: 'word', key }` (an i18n key: open, closed, up, down, stop).
 * @param {string} raw - Hex data, shown when the value is unknown.
 * @returns {string|object} A string, or a multi-language object (on / off).
 */
export function displayValue(display, raw) {
  if (!display) {
    return raw ? `0x${truncate(raw, 13)}` : '–';
  }
  if (display.kind === 'bool') {
    return display.value ? t('valueOn') : t('valueOff');
  }
  if (display.kind === 'word') {
    return t(display.key);
  }
  if (display.kind === 'number') {
    const unit = UNIT_SYMBOLS[display.unit] ?? display.unit ?? '';
    // Decimal separator of each language: "20.6 °C", "20,6 °C".
    return Object.fromEntries(
      LANGUAGES.map((language) => {
        const number = new Intl.NumberFormat(language, { maximumFractionDigits: 3 }).format(
          display.value,
        );
        return [language, truncate(`${number}${unit ? ` ${unit}` : ''}`, 16)];
      }),
    );
  }
  return truncate(String(display.value), 16);
}

/**
 * @description Build the widget content.
 * @param {object} snapshot - `{ configured, connected, gateway, devices,
 * perMinute, telegrams: [{ at, destination, source, type, raw, label,
 * display }] }`.
 * @param {object} [settings] - `{ max_telegrams }`.
 * @returns {object} The widget content.
 */
export function buildBusWidget(snapshot, settings = {}) {
  const max = Math.min(8, Math.max(1, Number(settings.max_telegrams) || DEFAULT_MAX_TELEGRAMS));
  let state;
  if (!snapshot.configured) {
    state = { value: t('widgetNotConfigured'), color: 'warning' };
  } else if (snapshot.connected) {
    state = { value: t('widgetConnected'), color: 'success' };
  } else {
    state = { value: t('widgetDisconnected'), color: 'danger' };
  }
  const items = [{ label: t('widgetConnection'), value: state.value, color: state.color }];
  if (snapshot.gateway) {
    items.push({ label: t('widgetGateway'), value: truncate(snapshot.gateway, 40) });
  }

  const components = [
    { type: 'status', items },
    {
      type: 'value',
      value: snapshot.perMinute,
      label: t('widgetTelegrams'),
      icon: 'activity',
      color: 'primary',
    },
    { type: 'value', value: snapshot.devices, label: t('widgetDevices'), icon: 'cpu' },
  ];

  const telegrams = (snapshot.telegrams ?? []).slice(0, max);
  if (telegrams.length > 0) {
    components.push({
      type: 'card-list',
      display: 'list',
      items: telegrams.map((telegram) => ({
        title: truncate(
          telegram.label ? `${telegram.destination} · ${telegram.label}` : telegram.destination,
          60,
        ),
        date: new Date(telegram.at).toISOString(),
        badge: {
          text: displayValue(telegram.display, telegram.raw),
          color: telegram.type === 'read' ? 'neutral' : 'info',
        },
        description: truncateAll(
          t('telegramDetail', {
            source: telegram.source ?? '?',
            type: t(`type_${telegram.type}`),
            raw: telegram.raw ? `0x${telegram.raw}` : '–',
          }),
          300,
        ),
      })),
    });
  } else {
    components.push({ type: 'text', text: t('widgetNoTelegram'), variant: 'caption' });
  }

  components.push(
    {
      type: 'button',
      label: t('widgetReadAll'),
      icon: 'refresh-cw',
      style: 'secondary',
      action: { key: WIDGET_ACTIONS.READ_ALL },
    },
    {
      type: 'button',
      label: t('widgetReconnect'),
      icon: 'power',
      style: 'secondary',
      action: { key: WIDGET_ACTIONS.RECONNECT, confirm: true },
    },
  );
  return { version: 1, ttl_seconds: TTL_SECONDS, components };
}
