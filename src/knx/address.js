// -----------------------------------------------------------------------------
// KNX addresses.
//
// Group addresses are 16-bit numbers written in three styles in ETS:
// three-level "1/2/3" (main 0-31 / middle 0-7 / sub 0-255, the default),
// two-level "1/515" (main / sub 0-2047) and free "4611". Everything is
// normalized to the three-level form, the one the bus monitor and the docs
// show, so "1/515" and "1/2/3" are the same address.
//
// Individual addresses (area.line.device) identify a device or a tunnel:
// "1.1.254".
// -----------------------------------------------------------------------------

/**
 * @description The 16-bit number of a group address.
 * @param {string} text - "1/2/3", "1/515" or "4611".
 * @returns {number|null} The address, or null when invalid.
 */
export function groupAddressNumber(text) {
  if (typeof text !== 'string') {
    return null;
  }
  const value = text.trim();
  if (!/^\d+(\/\d+){0,2}$/.test(value)) {
    return null;
  }
  const parts = value.split('/').map(Number);
  let number;
  if (parts.length === 3) {
    const [main, middle, sub] = parts;
    if (main > 31 || middle > 7 || sub > 255) {
      return null;
    }
    number = (main << 11) | (middle << 8) | sub;
  } else if (parts.length === 2) {
    const [main, sub] = parts;
    if (main > 31 || sub > 2047) {
      return null;
    }
    number = (main << 11) | sub;
  } else {
    [number] = parts;
    if (number > 0xffff) {
      return null;
    }
  }
  // 0/0/0 is the broadcast address: never a device's group address.
  return number === 0 ? null : number;
}

/**
 * @description The three-level form of a group address number.
 * @param {number} number - 16-bit address.
 * @returns {string} "main/middle/sub".
 */
export function formatGroupAddress(number) {
  return `${(number >> 11) & 0x1f}/${(number >> 8) & 0x07}/${number & 0xff}`;
}

/**
 * @description Normalize a group address to its three-level form.
 * @param {string} text - Any of the three ETS styles.
 * @returns {string|null} "main/middle/sub", or null when invalid.
 */
export function normalizeGroupAddress(text) {
  const number = groupAddressNumber(text);
  return number === null ? null : formatGroupAddress(number);
}

/**
 * @description Normalize an individual address.
 * @param {string} text - "area.line.device".
 * @returns {string|null} The address, or null when invalid.
 */
export function normalizeIndividualAddress(text) {
  if (typeof text !== 'string') {
    return null;
  }
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(text.trim());
  if (!match) {
    return null;
  }
  const [area, line, device] = match.slice(1).map(Number);
  if (area > 15 || line > 15 || device > 255) {
    return null;
  }
  return `${area}.${line}.${device}`;
}

/**
 * @description Format a 16-bit individual address.
 * @param {number} number - Address.
 * @returns {string} "area.line.device".
 */
export function formatIndividualAddress(number) {
  return `${(number >> 12) & 0x0f}.${(number >> 8) & 0x0f}.${number & 0xff}`;
}

/**
 * @description Parse a list of group address patterns: "1/2/3", "1/2/*",
 * "1/*" or "*", separated by commas, semicolons or spaces. A pattern may end
 * with ":<dpt>" to decode the telegrams of its addresses ("1/0/*:1.001").
 * @param {string} text - The list, as typed in the configuration.
 * @returns {{ patterns: object[], invalid: string[] }} Parsed patterns
 * (`{ text, main, middle, sub, dpt }`, null = any) and the rejected entries.
 */
export function parseAddressPatterns(text) {
  const patterns = [];
  const invalid = [];
  for (const entry of String(text ?? '')
    .split(/[\s,;]+/)
    .filter(Boolean)) {
    const [address, dpt = null, extra] = entry.split(':');
    if (extra !== undefined || (dpt !== null && !/^\d{1,3}\.\d{3}$/.test(dpt))) {
      invalid.push(entry);
      continue;
    }
    const pattern = parsePattern(address);
    if (pattern) {
      patterns.push({ ...pattern, text: address, dpt });
    } else {
      invalid.push(entry);
    }
  }
  return { patterns, invalid };
}

function parsePattern(address) {
  if (address === '*') {
    return { main: null, middle: null, sub: null };
  }
  const parts = address.split('/');
  if (parts.length < 2 || parts.length > 3 || parts.at(-1) !== '*') {
    const normalized = normalizeGroupAddress(address);
    if (!normalized) {
      return null;
    }
    const [main, middle, sub] = normalized.split('/').map(Number);
    return { main, middle, sub };
  }
  const fixed = parts.slice(0, -1);
  if (!fixed.every((part) => /^\d+$/.test(part))) {
    return null;
  }
  const [main, middle = null] = fixed.map(Number);
  if (main > 31 || (middle !== null && middle > 7)) {
    return null;
  }
  return { main, middle, sub: null };
}

/**
 * @description Whether a three-level group address matches a pattern.
 * @param {object} pattern - From parseAddressPatterns.
 * @param {string} address - "main/middle/sub".
 * @returns {boolean} True when it matches.
 */
export function matchesPattern(pattern, address) {
  const [main, middle, sub] = address.split('/').map(Number);
  return (
    (pattern.main === null || pattern.main === main) &&
    (pattern.middle === null || pattern.middle === middle) &&
    (pattern.sub === null || pattern.sub === sub)
  );
}

/**
 * @description The id of a group address inside an external id: slashes have
 * no place there ("1/2/3" -> "1-2-3").
 * @param {string} address - Three-level group address.
 * @returns {string} The id.
 */
export function addressId(address) {
  return address.replaceAll('/', '-');
}
