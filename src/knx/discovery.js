// -----------------------------------------------------------------------------
// Discovery of the KNX IP interfaces and routers (KNXnet/IP Core, SEARCH).
//
// The container runs in a bridge network: it cannot broadcast on the LAN. The
// Gladys core (host network) does it for us through the `udp-active-broadcast`
// scan of the manifest: we forge the SEARCH_REQUEST, the core broadcasts it
// on port 3671 and relays the unicast SEARCH_RESPONSEs. The request carries
// the "route back" endpoint 0.0.0.0:0 (NAT mode): the interfaces answer the
// address the request came from, whatever is behind it.
// -----------------------------------------------------------------------------

import { formatIndividualAddress } from './address.js';

export const KNX_PORT = 3671;

const SEARCH_REQUEST = 0x0201;
const SEARCH_RESPONSE = 0x0202;
const DIB_DEVICE_INFO = 0x01;
const DIB_SUPPORTED_SERVICES = 0x02;

// Service families of the DIB_SUPP_SVC_FAMILIES block.
const FAMILIES = {
  0x04: 'tunnelling',
  0x05: 'routing',
  0x09: 'secure',
};

/**
 * @description The SEARCH_REQUEST datagram (14 bytes): header + route-back HPAI.
 * @returns {Buffer} The datagram.
 */
export function buildSearchRequest() {
  return Buffer.from([
    0x06, // header length
    0x10, // protocol version 1.0
    SEARCH_REQUEST >> 8,
    SEARCH_REQUEST & 0xff,
    0x00,
    0x0e, // total length: 14
    0x08, // HPAI length
    0x01, // IPv4 UDP
    0x00,
    0x00,
    0x00,
    0x00, // 0.0.0.0: answer the sender
    0x00,
    0x00, // port 0
  ]);
}

/**
 * @description Parse a SEARCH_RESPONSE.
 * @param {Buffer} data - The datagram.
 * @param {string} [sourceIp] - Address it came from (the scan result).
 * @returns {object|null} `{ host, port, name, individualAddress, serial,
 * mac, tunnelling, routing, secure }`, or null when it is not one.
 */
export function parseSearchResponse(data, sourceIp) {
  if (!Buffer.isBuffer(data) || data.length < 14 || data[0] !== 0x06 || data[1] !== 0x10) {
    return null;
  }
  if (data.readUInt16BE(2) !== SEARCH_RESPONSE) {
    return null;
  }
  let offset = 6;
  const hpaiLength = data[offset];
  if (hpaiLength !== 8 || data.length < offset + hpaiLength) {
    return null;
  }
  const endpointIp = [...data.subarray(offset + 2, offset + 6)].join('.');
  const endpointPort = data.readUInt16BE(offset + 6);
  offset += hpaiLength;

  const gateway = {
    // Behind a NAT or with the route-back endpoint, the HPAI may say 0.0.0.0:
    // the source of the datagram is then the address to use.
    host: endpointIp !== '0.0.0.0' ? endpointIp : (sourceIp ?? null),
    port: endpointPort || KNX_PORT,
    name: '',
    individualAddress: null,
    serial: null,
    mac: null,
    tunnelling: false,
    routing: false,
    secure: false,
  };

  while (offset + 2 <= data.length) {
    const length = data[offset];
    const type = data[offset + 1];
    if (length < 2 || offset + length > data.length) {
      break;
    }
    const block = data.subarray(offset, offset + length);
    if (type === DIB_DEVICE_INFO && length >= 54) {
      gateway.individualAddress = formatIndividualAddress(block.readUInt16BE(4));
      gateway.serial = block.subarray(8, 14).toString('hex');
      gateway.mac = [...block.subarray(18, 24)]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join(':');
      gateway.name = block.subarray(24, 54).toString('latin1').replace(/\0.*$/s, '').trim();
    } else if (type === DIB_SUPPORTED_SERVICES) {
      for (let index = 2; index + 1 < length; index += 2) {
        const family = FAMILIES[block[index]];
        if (family) {
          gateway[family] = true;
        }
      }
    }
    offset += length;
  }
  if (!gateway.host) {
    return null;
  }
  return gateway;
}

/**
 * @description Parse the raw results of a scan, one gateway per serial number
 * (an interface may answer once per network interface).
 * @param {object[]} results - `[{ source_ip, payload_base64 }]`.
 * @returns {object[]} Gateways, sorted by address.
 */
export function parseScanResults(results) {
  const gateways = new Map();
  for (const result of results ?? []) {
    let data;
    try {
      data = Buffer.from(String(result?.payload_base64 ?? ''), 'base64');
    } catch {
      continue;
    }
    const gateway = parseSearchResponse(data, result?.source_ip);
    if (gateway) {
      gateways.set(gateway.serial ?? `${gateway.host}:${gateway.port}`, gateway);
    }
  }
  return [...gateways.values()].sort((a, b) =>
    a.host.localeCompare(b.host, 'en', { numeric: true }),
  );
}
