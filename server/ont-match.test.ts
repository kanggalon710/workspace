import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDeviceIndexes, matchCustomerDevice, buildIdentifierQuery } from "./ont-match.js";

const devices = [
  { deviceId: "d1", pppoeUsername: "yoga01", serialNumber: "ZTEG1234", ponSerialNumber: "ZXICC1234567", status: "online", rxPower: "-21.5" },
  { deviceId: "d2", pppoeUsername: "", serialNumber: "FHTT9999", ponSerialNumber: "FHTT00AB12CD", status: "offline", rxPower: "" },
];

test("match by pppoe username (case-insensitive) wins first", () => {
  const idx = buildDeviceIndexes(devices as any);
  const m = matchCustomerDevice({ pppoeUsername: "YOGA01", ontSerialNumber: "FHTT9999" }, idx);
  assert.equal(m.matchBy, "pppoe");
  assert.equal(m.device?.deviceId, "d1");
});

test("fallback to factory serial then PON serial", () => {
  const idx = buildDeviceIndexes(devices as any);
  assert.equal(matchCustomerDevice({ ontSerialNumber: "fhtt9999" }, idx).matchBy, "sn");
  assert.equal(matchCustomerDevice({ ontSerialNumber: "FHTT00AB12CD" }, idx).matchBy, "pon_sn");
});

test("no match → null device", () => {
  const idx = buildDeviceIndexes(devices as any);
  const m = matchCustomerDevice({ pppoeUsername: "nobody" }, idx);
  assert.equal(m.device, null);
  assert.equal(m.matchBy, null);
});

test("buildIdentifierQuery: null saat tidak ada identifier", () => {
  assert.equal(buildIdentifierQuery({}), null);
  assert.equal(buildIdentifierQuery({ serials: [null, "", undefined], pppoeUsernames: [] }), null);
});

test("buildIdentifierQuery: single clause (no $or) saat hanya serial", () => {
  const q = buildIdentifierQuery({ serials: ["ZTEG1234", "ZTEG1234"] }) as any;
  assert.deepEqual(q, { "_deviceId._SerialNumber": { $in: ["ZTEG1234"] } }); // dedupe
});

test("buildIdentifierQuery: $or pppoe meliputi VirtualParameters + WANPPPConnection .1/.2", () => {
  const q = buildIdentifierQuery({ serials: ["S1"], pppoeUsernames: ["u1", "u2"] }) as any;
  assert.ok(Array.isArray(q.$or));
  assert.equal(q.$or.length, 4); // 1 serial + 3 pppoe paths
  const keys = q.$or.flatMap((c: any) => Object.keys(c));
  assert.ok(keys.includes("VirtualParameters.pppoeUsername._value"));
  assert.ok(keys.includes("InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.2.Username._value"));
});
