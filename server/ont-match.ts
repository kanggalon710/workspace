/** DRY device↔customer matching shared by /api/customers/ont-status (all customers)
 *  and /api/odps/:id/ont-status (per-ODP panel). Pure - testable without GenieACS. */
import type { ParsedDevice } from "./genieacs.js";

export type DeviceIndexes = {
  byPppoe: Map<string, ParsedDevice>;
  bySn: Map<string, ParsedDevice>;
  byPonSn: Map<string, ParsedDevice>;
};

export function buildDeviceIndexes(devices: ParsedDevice[]): DeviceIndexes {
  const byPppoe = new Map<string, ParsedDevice>();
  const bySn = new Map<string, ParsedDevice>();
  const byPonSn = new Map<string, ParsedDevice>();
  for (const d of devices) {
    if (d.pppoeUsername) byPppoe.set(d.pppoeUsername.toLowerCase(), d);
    if (d.serialNumber) bySn.set(d.serialNumber.toLowerCase(), d);
    if (d.ponSerialNumber) byPonSn.set(d.ponSerialNumber.toLowerCase(), d);
  }
  return { byPppoe, bySn, byPonSn };
}

/** Bangun query NBI GenieACS untuk fetch HANYA device milik sekumpulan pelanggan
 *  (mis. satu ODP), bukan seluruh device (~10k). Pure → testable tanpa GenieACS.
 *  Match by factory SN (`_deviceId._SerialNumber`) + PPPoE username (VirtualParameters
 *  ATAU WANPPPConnection.1/.2 - ZTE F660 dkk simpan di WANPPPConnection.2).
 *  CATATAN: match PON-serial (derived dari PonMac) tidak bisa di-query NBI; butuh full
 *  list (cache warm). Returns null kalau tidak ada identifier → caller skip fetch. */
export function buildIdentifierQuery(ids: { serials?: (string | null | undefined)[]; pppoeUsernames?: (string | null | undefined)[] }): Record<string, any> | null {
  const serials = Array.from(new Set((ids.serials ?? []).filter((s): s is string => !!s)));
  const pppoes = Array.from(new Set((ids.pppoeUsernames ?? []).filter((s): s is string => !!s)));
  const or: Record<string, any>[] = [];
  if (serials.length) or.push({ "_deviceId._SerialNumber": { $in: serials } });
  if (pppoes.length) {
    or.push({ "VirtualParameters.pppoeUsername._value": { $in: pppoes } });
    or.push({ "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username._value": { $in: pppoes } });
    or.push({ "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.2.Username._value": { $in: pppoes } });
  }
  if (or.length === 0) return null;
  return or.length === 1 ? or[0] : { $or: or };
}

export type OntMatchBy = "pppoe" | "sn" | "pon_sn" | null;

export function matchCustomerDevice(
  c: { pppoeUsername?: string | null; ontSerialNumber?: string | null },
  idx: DeviceIndexes,
): { device: ParsedDevice | null; matchBy: OntMatchBy } {
  if (c.pppoeUsername) {
    const d = idx.byPppoe.get(c.pppoeUsername.toLowerCase());
    if (d) return { device: d, matchBy: "pppoe" };
  }
  if (c.ontSerialNumber) {
    const sn = c.ontSerialNumber.toLowerCase();
    const d = idx.bySn.get(sn);
    if (d) return { device: d, matchBy: "sn" };
    const dp = idx.byPonSn.get(sn);
    if (dp) return { device: dp, matchBy: "pon_sn" };
  }
  return { device: null, matchBy: null };
}
