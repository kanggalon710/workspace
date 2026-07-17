/**
 * GenieACS NBI (North Bound Interface) API Client
 * TR-069 Auto Configuration Server integration
 * API docs: https://github.com/genieacs/genieacs/wiki/API-Reference
 */

import { buildIdentifierQuery } from "./ont-match.js";

export interface GenieAcsConfig {
  host: string;
  port: number;
  username: string;
  password: string;
}

export interface WanConnection {
  type: string;         // PPPoE, IP, Bridge
  name: string;
  status: string;       // Connected, Disconnected, Unknown
  externalIp: string;
  gateway: string;
  dns: string;
  username: string;     // PPPoE username
  uptime: string;
  macAddress: string;
  binding: string;
  lastError: string;
}

export interface ConnectedHost {
  ipAddress: string;
  macAddress: string;
  hostName: string;
  interfaceType: string;
  active: boolean;
}

export interface WifiInterface {
  index: number;
  ssid: string;
  password: string;
  enabled: boolean;
  securityMode: string;
}

export interface ParsedDevice {
  deviceId: string;
  serialNumber: string;       // Factory serial dari _deviceId._SerialNumber (TR-069)
  ponSerialNumber: string;    // PON Serial format (vendor prefix + 8 hex MAC) — yang OLT pakai
  ponMac: string;             // MAC PON port (sumber derive ponSerialNumber)
  manufacturer: string;
  oui: string;
  productClass: string;
  macAddress: string;
  hardwareVersion: string;
  softwareVersion: string;
  status: "online" | "offline";
  lastInform: string | null;
  registeredAt: string | null;
  lastBootstrap: string | null;
  ipAddress: string;
  ipTr069: string;
  uptime: number;
  pppoeUsername: string;
  rxPower: string;
  txPower: string;
  temperature: string;
  wifiSsid: string[];
  wifiInterfaces: WifiInterface[];
  connectedDevices: number;
  connectedHosts: ConnectedHost[];
  wanConnections: WanConnection[];
  tags: string[];
  _raw?: any;
}

// ── Helper: safe deep get from TR-069 nested structure ──
function deepGet(obj: any, path: string): any {
  const parts = path.split(".");
  let cur = obj;
  for (const p of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}

function val(obj: any, path: string): any {
  const node = deepGet(obj, path);
  if (node === undefined || node === null) return undefined;
  if (typeof node === "object" && "_value" in node) return node._value;
  // If it's still an object (no _value), it's a container node, not a leaf — return undefined
  if (typeof node === "object") return undefined;
  return node;
}

// ── Core fetch helper ──
async function genieFetch(
  config: GenieAcsConfig,
  method: string,
  path: string,
  body?: any,
  timeoutMs = 15000,
): Promise<{ status: number; data: any }> {
  const url = `http://${config.host}:${config.port}${path}`;
  const auth = Buffer.from(`${config.username}:${config.password}`).toString("base64");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const opts: RequestInit = {
      method,
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    };
    if (body !== undefined) opts.body = JSON.stringify(body);

    const res = await fetch(url, opts);
    const text = await res.text();
    let data: any;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }

    return { status: res.status, data };
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error(`GenieACS timeout: server ${config.host} tidak merespon dalam ${timeoutMs / 1000}s`);
    }
    if (err.cause?.code === "ECONNREFUSED") {
      throw new Error(`GenieACS unreachable: koneksi ditolak oleh ${config.host}:${config.port}`);
    }
    if (err.cause?.code === "ENOTFOUND") {
      throw new Error(`GenieACS DNS error: host '${config.host}' tidak ditemukan`);
    }
    throw new Error(`GenieACS error: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

// ── PON Serial Number deriver ──
// OLT register ONT pakai PON Serial Number, bukan factory hardware serial.
// Format: [VENDOR_PREFIX 4 chars ASCII] + [8 hex dari last 4 bytes MAC PON port]
// Contoh ZTE: PonMac=08:a5:ae:e7:f7:2f → "ZXIC" + "AEE7F72F" = "ZXICAEE7F72F"
// Contoh Huawei: prefix=HWTC, FiberHome: prefix=FHTT
const VENDOR_PREFIX_MAP: Record<string, string> = {
  ZTE: "ZXIC",
  HUAWEI: "HWTC",
  FIBERHOME: "FHTT",
  ALCATEL: "ALCL",
  NOKIA: "ALCL",
  TPLINK: "TPLG",
  GPON: "GPON",
};
function derivePonSerial(manufacturer: string, ponMac: string, productClass?: string): string {
  if (!ponMac) return "";
  const cleanMac = ponMac.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
  if (cleanMac.length < 8) return "";
  const last4Bytes = cleanMac.slice(-8);
  // Resolve vendor prefix dari manufacturer (case-insensitive)
  const mfgUpper = (manufacturer || "").toUpperCase();
  const prefix = Object.entries(VENDOR_PREFIX_MAP).find(([k]) => mfgUpper.includes(k))?.[1];
  if (!prefix) return "";
  return `${prefix}${last4Bytes}`;
}

// ── Device parser: TR-069 raw → simple flat object ──
export function parseDevice(raw: any): ParsedDevice {
  const deviceId = raw._id || "";
  const devId = raw._deviceId || {};

  // Serial & identifiers
  const serialNumber = devId._SerialNumber || "";
  const manufacturer = devId._Manufacturer || "";
  const oui = devId._OUI || "";
  const productClass = devId._ProductClass || "";

  // MAC address
  let macAddress = devId._MACAddress || "";
  if (!macAddress && oui && serialNumber) {
    // Construct from OUI + last bytes of serial
    const cleanOui = oui.replace(/[^a-fA-F0-9]/g, "");
    macAddress = cleanOui.length >= 6
      ? `${cleanOui.slice(0,2)}:${cleanOui.slice(2,4)}:${cleanOui.slice(4,6)}:??:??:??`
      : "";
  }

  // v4.2.10: PON Serial Number — yang OLT register-kan
  const ponMac = String(val(raw, "VirtualParameters.PonMac") || "").trim();
  const ponSerialNumber = derivePonSerial(manufacturer, ponMac, productClass);

  // Versions
  const hardwareVersion = val(raw, "InternetGatewayDevice.DeviceInfo.HardwareVersion") || "";
  const softwareVersion = val(raw, "InternetGatewayDevice.DeviceInfo.SoftwareVersion") || "";

  // Online status: lastInform within 5 minutes
  const lastInformRaw = raw._lastInform;
  let lastInform: string | null = null;
  let status: "online" | "offline" = "offline";
  if (lastInformRaw) {
    const ts = typeof lastInformRaw === "string" ? lastInformRaw : lastInformRaw.$date || lastInformRaw;
    lastInform = new Date(ts).toISOString();
    const diffMs = Date.now() - new Date(ts).getTime();
    status = diffMs < 300000 ? "online" : "offline"; // 5 minutes
  }

  // Registration + bootstrap dates
  let registeredAt: string | null = null;
  const regRaw = raw._registered;
  if (regRaw) { const ts = typeof regRaw === "string" ? regRaw : regRaw.$date || regRaw; try { registeredAt = new Date(ts).toISOString(); } catch {} }

  let lastBootstrap: string | null = null;
  const bootRaw = raw._lastBootstrap;
  if (bootRaw) { const ts = typeof bootRaw === "string" ? bootRaw : bootRaw.$date || bootRaw; try { lastBootstrap = new Date(ts).toISOString(); } catch {} }

  // IP from ConnectionRequestURL
  let ipAddress = "";
  const connUrl = val(raw, "InternetGatewayDevice.ManagementServer.ConnectionRequestURL") || "";
  if (connUrl) {
    const match = connUrl.match(/http:\/\/(\d+\.\d+\.\d+\.\d+)/);
    if (match) ipAddress = match[1];
  }

  // Uptime
  const uptime = Number(val(raw, "InternetGatewayDevice.DeviceInfo.UpTime")) || 0;

  // PPPoE username — v4.2.11: prioritas VirtualParameters.pppoeUsername (paling reliable),
  // lalu scan WANConnectionDevice 1-8 × WANPPPConnection 1-4 (ZTE F660 pakai WANPPPConnection.2 bukan .1)
  let pppoeUsername = "";
  const vpPppoe = val(raw, "VirtualParameters.pppoeUsername");
  if (vpPppoe && typeof vpPppoe === "string" && vpPppoe.length > 0) {
    pppoeUsername = vpPppoe;
  } else {
    outer: for (let i = 1; i <= 8; i++) {
      for (let j = 1; j <= 4; j++) {
        const u = val(raw, `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${i}.WANPPPConnection.${j}.Username`);
        if (u && typeof u === "string" && u.length > 0) {
          pppoeUsername = u;
          break outer;
        }
      }
    }
  }

  // RX Power (optical)
  let rxPower = "";
  const rxRaw = val(raw, "VirtualParameters.RXPower")
    || val(raw, "InternetGatewayDevice.WANDevice.1.X_CT-COM_EponInterfaceConfig.RXPower");
  if (rxRaw !== undefined && rxRaw !== null && rxRaw !== "") {
    const num = Number(rxRaw);
    if (!isNaN(num)) {
      rxPower = num > 100 ? ((num / 100) - 40).toFixed(2) : String(num);
    } else {
      rxPower = String(rxRaw);
    }
  }

  // TX Power (optical) — same decode rule as RX (value > 100 → (n/100) - 40 dBm)
  let txPower = "";
  const txRaw = val(raw, "VirtualParameters.TXPower")
    || val(raw, "InternetGatewayDevice.WANDevice.1.X_CT-COM_EponInterfaceConfig.TXPower");
  if (txRaw !== undefined && txRaw !== null && txRaw !== "") {
    const num = Number(txRaw);
    if (!isNaN(num)) {
      txPower = num > 100 ? ((num / 100) - 40).toFixed(2) : String(num);
    } else {
      txPower = String(txRaw);
    }
  }

  // Temperature
  let temperature = "";
  const tempRaw = val(raw, "VirtualParameters.gettemp")
    || val(raw, "VirtualParameters.Temperature")
    || val(raw, "InternetGatewayDevice.WANDevice.1.X_CT-COM_EponInterfaceConfig.TransceiverTemperature");
  if (tempRaw !== undefined && tempRaw !== null && tempRaw !== "") {
    const num = Number(tempRaw);
    if (!isNaN(num)) {
      temperature = num > 1000 ? (num / 256).toFixed(1) : String(num);
    }
  }

  // Full TR-069 URL
  const ipTr069 = connUrl || "";

  // WiFi SSIDs + full interfaces
  const wifiSsid: string[] = [];
  const wifiInterfaces: WifiInterface[] = [];
  const lanDev = deepGet(raw, "InternetGatewayDevice.LANDevice.1.WLANConfiguration");
  if (lanDev && typeof lanDev === "object") {
    for (const key of Object.keys(lanDev)) {
      if (key.startsWith("_")) continue;
      const ssid = lanDev[key]?.SSID?._value || "";
      const password = lanDev[key]?.KeyPassphrase?._value || lanDev[key]?.PreSharedKey?.["1"]?.KeyPassphrase?._value || "";
      const enabled = lanDev[key]?.Enable?._value;
      const secMode = lanDev[key]?.BeaconType?._value || "";
      if (ssid) {
        wifiSsid.push(ssid);
        wifiInterfaces.push({ index: Number(key), ssid, password, enabled: enabled !== false, securityMode: secMode });
      }
    }
  }

  // WAN Connections (PPPoE + IP)
  // v4.2.12: nested 8×4 — ZTE F660 register PPPoE di WANPPPConnection.2 (slot .1 dipakai DHCP TR-069)
  const wanConnections: WanConnection[] = [];
  for (let i = 1; i <= 8; i++) {
    for (let j = 1; j <= 4; j++) {
      // PPPoE connections
      const pppBase = `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${i}.WANPPPConnection.${j}`;
      const pppName = val(raw, `${pppBase}.Name`);
      const pppIp = val(raw, `${pppBase}.ExternalIPAddress`);
      const pppUser = val(raw, `${pppBase}.Username`);
      let pppStatus = val(raw, `${pppBase}.ConnectionStatus`);
      if (!pppStatus) {
        const enabled = val(raw, `${pppBase}.Enable`);
        pppStatus = enabled === true ? "Connected" : enabled === false ? "Disconnected" : undefined;
      }
      if (pppName || pppIp || pppUser) {
        wanConnections.push({
          type: "PPPoE",
          name: String(pppName || `WAN_PPP_${i}_${j}`),
          status: String(pppStatus || "Unknown"),
          externalIp: String(pppIp || "—"),
          gateway: String(val(raw, `${pppBase}.RemoteIPAddress`) || val(raw, `${pppBase}.DefaultGateway`) || "—"),
          dns: String(val(raw, `${pppBase}.DNSServers`) || "—"),
          username: String(pppUser || "—"),
          uptime: String(val(raw, `${pppBase}.Uptime`) || "—"),
          macAddress: String(val(raw, `${pppBase}.MACAddress`) || "—"),
          binding: String(val(raw, `${pppBase}.X_CT-COM_LanInterface`) || "—"),
          lastError: String(val(raw, `${pppBase}.LastConnectionError`) || "—"),
        });
      }
      // IP connections
      const ipBase = `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${i}.WANIPConnection.${j}`;
      const ipName = val(raw, `${ipBase}.Name`);
      const ipAddr = val(raw, `${ipBase}.ExternalIPAddress`);
      let ipStatus = val(raw, `${ipBase}.ConnectionStatus`);
      if (!ipStatus) {
        const enabled = val(raw, `${ipBase}.Enable`);
        ipStatus = enabled === true ? "Connected" : enabled === false ? "Disconnected" : undefined;
      }
      if (ipName || ipAddr) {
        wanConnections.push({
          type: "IP",
          name: String(ipName || `WAN_IP_${i}_${j}`),
          status: String(ipStatus || "Unknown"),
          externalIp: String(ipAddr || "—"),
          gateway: String(val(raw, `${ipBase}.DefaultGateway`) || "—"),
          dns: String(val(raw, `${ipBase}.DNSServers`) || "—"),
          username: "—",
          uptime: String(val(raw, `${ipBase}.Uptime`) || "—"),
          macAddress: String(val(raw, `${ipBase}.MACAddress`) || "—"),
          binding: String(val(raw, `${ipBase}.X_CT-COM_LanInterface`) || "—"),
          lastError: "—",
        });
      }
    }
  }

  // Connected hosts
  const connectedHosts: ConnectedHost[] = [];
  const hosts = deepGet(raw, "InternetGatewayDevice.LANDevice.1.Hosts.Host");
  if (hosts && typeof hosts === "object") {
    for (const key of Object.keys(hosts)) {
      if (key.startsWith("_")) continue;
      const h = hosts[key];
      const hip = h?.IPAddress?._value;
      const hmac = h?.MACAddress?._value;
      if (hip || hmac) {
        connectedHosts.push({
          ipAddress: hip || "—",
          macAddress: hmac || "—",
          hostName: h?.HostName?._value || "",
          interfaceType: h?.InterfaceType?._value || "Unknown",
          active: h?.Active?._value !== false,
        });
      }
    }
  }
  const connectedDevices = connectedHosts.length;

  // Tags
  const tags: string[] = Array.isArray(raw._tags) ? raw._tags : [];

  return {
    deviceId, serialNumber, ponSerialNumber, ponMac,
    manufacturer, oui, productClass,
    macAddress, hardwareVersion, softwareVersion,
    status, lastInform, registeredAt, lastBootstrap, ipAddress, ipTr069, uptime,
    pppoeUsername, rxPower, txPower, temperature,
    wifiSsid, wifiInterfaces, connectedDevices, connectedHosts,
    wanConnections, tags,
  };
}

// ═══════════════════════════════════════════════════════════
//  PUBLIC API METHODS
// ═══════════════════════════════════════════════════════════

/** Test connection to GenieACS NBI.
 *  Jujur: HTTP 200 saja TIDAK cukup — endpoint UI GenieACS / reverse-proxy juga balas 200
 *  dengan HTML. NBI asli WAJIB mengembalikan array device. Plus laporkan jumlah device riil
 *  supaya "terhubung tapi 0 device" langsung kelihatan, bukan false-positive hijau. */
export async function testConnection(config: GenieAcsConfig) {
  const { status, data } = await genieFetch(config, "GET", "/devices/?limit=1", undefined, 10000);
  if (status === 401) throw new Error("GenieACS auth gagal: username/password salah");
  if (status >= 400) throw new Error(`GenieACS error: HTTP ${status}`);
  if (!Array.isArray(data)) {
    throw new Error("Endpoint merespon tapi bukan NBI GenieACS (tidak mengembalikan array device). Cek host/port — NBI default port 7557, bukan port UI GenieACS.");
  }
  // Hitung jumlah device sebenarnya (bukan cuma "1+") agar status mencerminkan kondisi riil.
  const stats = await getDeviceStats(config);
  return { connected: true, deviceCount: stats.total, online: stats.online, offline: stats.offline };
}

/** Light parser for list view — skips heavy WAN/WiFi/hosts parsing */
export function parseDeviceLight(raw: any): ParsedDevice {
  const deviceId = raw._id || "";
  const devId = raw._deviceId || {};
  const serialNumber = devId._SerialNumber || "";
  const manufacturer = devId._Manufacturer || "";
  const oui = devId._OUI || "";
  const productClass = devId._ProductClass || "";
  const macAddress = devId._MACAddress || "";
  // v4.2.10: PON serial — derive dari PonMac
  const ponMac = String(val(raw, "VirtualParameters.PonMac") || "").trim();
  const ponSerialNumber = derivePonSerial(manufacturer, ponMac, productClass);
  const hardwareVersion = val(raw, "InternetGatewayDevice.DeviceInfo.HardwareVersion") || "";
  const softwareVersion = val(raw, "InternetGatewayDevice.DeviceInfo.SoftwareVersion") || "";

  const lastInformRaw = raw._lastInform;
  let lastInform: string | null = null;
  let status: "online" | "offline" = "offline";
  if (lastInformRaw) {
    const ts = typeof lastInformRaw === "string" ? lastInformRaw : lastInformRaw.$date || lastInformRaw;
    lastInform = new Date(ts).toISOString();
    status = (Date.now() - new Date(ts).getTime()) < 300000 ? "online" : "offline";
  }

  // Registration + bootstrap dates
  let registeredAt: string | null = null;
  const regRaw = raw._registered;
  if (regRaw) { const ts = typeof regRaw === "string" ? regRaw : regRaw.$date || regRaw; try { registeredAt = new Date(ts).toISOString(); } catch {} }

  let lastBootstrap: string | null = null;
  const bootRaw = raw._lastBootstrap;
  if (bootRaw) { const ts = typeof bootRaw === "string" ? bootRaw : bootRaw.$date || bootRaw; try { lastBootstrap = new Date(ts).toISOString(); } catch {} }

  let ipAddress = "";
  const connUrl = val(raw, "InternetGatewayDevice.ManagementServer.ConnectionRequestURL") || "";
  if (connUrl) { const m = connUrl.match(/http:\/\/(\d+\.\d+\.\d+\.\d+)/); if (m) ipAddress = m[1]; }

  const uptime = Number(val(raw, "InternetGatewayDevice.DeviceInfo.UpTime")) || 0;

  // v4.2.11: prioritas VirtualParameters.pppoeUsername, lalu nested 4x4 (ZTE F660 di WANPPPConnection.2)
  let pppoeUsername = "";
  const vpPppoe = val(raw, "VirtualParameters.pppoeUsername");
  if (vpPppoe && typeof vpPppoe === "string" && vpPppoe.length > 0) {
    pppoeUsername = vpPppoe;
  } else {
    outer: for (let i = 1; i <= 4; i++) {
      for (let j = 1; j <= 4; j++) {
        const u = val(raw, `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${i}.WANPPPConnection.${j}.Username`);
        if (u && typeof u === "string" && u.length > 0) { pppoeUsername = u; break outer; }
      }
    }
  }

  let rxPower = "";
  const rxRaw = val(raw, "VirtualParameters.RXPower") || val(raw, "InternetGatewayDevice.WANDevice.1.X_CT-COM_EponInterfaceConfig.RXPower");
  if (rxRaw !== undefined && rxRaw !== null && rxRaw !== "") {
    const num = Number(rxRaw);
    if (!isNaN(num)) rxPower = num > 100 ? ((num / 100) - 40).toFixed(2) : String(num);
  }

  // TX Power — same decode rule as RX
  let txPower = "";
  const txRaw = val(raw, "VirtualParameters.TXPower") || val(raw, "InternetGatewayDevice.WANDevice.1.X_CT-COM_EponInterfaceConfig.TXPower");
  if (txRaw !== undefined && txRaw !== null && txRaw !== "") {
    const num = Number(txRaw);
    if (!isNaN(num)) txPower = num > 100 ? ((num / 100) - 40).toFixed(2) : String(num);
  }

  let temperature = "";
  const tempRaw = val(raw, "VirtualParameters.gettemp") || val(raw, "VirtualParameters.Temperature");
  if (tempRaw !== undefined && tempRaw !== null) {
    const num = Number(tempRaw);
    if (!isNaN(num)) temperature = num > 1000 ? (num / 256).toFixed(1) : String(num);
  }

  const wifiSsid: string[] = [];
  const ssid1 = val(raw, "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID");
  if (ssid1) wifiSsid.push(ssid1);

  const tags: string[] = Array.isArray(raw._tags) ? raw._tags : [];

  return {
    deviceId, serialNumber, ponSerialNumber, ponMac,
    manufacturer, oui, productClass,
    macAddress, hardwareVersion, softwareVersion,
    status, lastInform, registeredAt, lastBootstrap, ipAddress, ipTr069: connUrl, uptime,
    pppoeUsername, rxPower, txPower, temperature,
    wifiSsid, wifiInterfaces: [], connectedDevices: 0, connectedHosts: [],
    wanConnections: [], tags,
  };
}

/** Get devices with optional query, pagination — uses LIGHT parser for speed */
export async function getDevices(config: GenieAcsConfig, query: any = {}, limit = 50, skip = 0) {
  const params = new URLSearchParams();
  if (Object.keys(query).length > 0) params.set("query", JSON.stringify(query));
  params.set("limit", String(limit));
  params.set("skip", String(skip));

  const { status, data } = await genieFetch(config, "GET", `/devices/?${params}`, undefined, 30000);
  if (status >= 400) throw new Error(`GenieACS error: HTTP ${status}`);
  if (!Array.isArray(data)) {
    // Bukan array = bukan NBI GenieACS (mis. salah ke port UI). Lempar agar UI tampilkan
    // sebab sebenarnya, bukan "list kosong" yang menyesatkan.
    throw new Error("Respon GenieACS bukan array device — cek host/port (NBI default 7557, bukan port UI GenieACS).");
  }
  return data.map((d: any) => parseDeviceLight(d));
}

/** Targeted fetch: HANYA device milik sekumpulan pelanggan (mis. satu ODP) via query NBI,
 *  bukan fetch SEMUA device (~10k) tiap klik ODP. Payload kecil → cepat. LIGHT parser.
 *  Match PON-serial (derived) tidak ter-cover di sini (butuh full list) — lihat buildIdentifierQuery. */
export async function getDevicesByIdentifiers(
  config: GenieAcsConfig,
  ids: { serials?: (string | null | undefined)[]; pppoeUsernames?: (string | null | undefined)[] },
  timeoutMs = 12000,
): Promise<ParsedDevice[]> {
  const query = buildIdentifierQuery(ids);
  if (!query) return [];
  const serialCount = (ids.serials ?? []).filter(Boolean).length;
  const pppoeCount = (ids.pppoeUsernames ?? []).filter(Boolean).length;

  const params = new URLSearchParams();
  params.set("query", JSON.stringify(query));
  // satu pelanggan bisa cocok di >1 device (jarang); kasih kepala ruang.
  params.set("limit", String(serialCount + pppoeCount + 10));

  const { status, data } = await genieFetch(config, "GET", `/devices/?${params}`, undefined, timeoutMs);
  if (status >= 400) throw new Error(`GenieACS error: HTTP ${status}`);
  if (!Array.isArray(data)) return [];
  return data.map((d: any) => parseDeviceLight(d));
}

/** Get single device by ID */
export async function getDevice(config: GenieAcsConfig, deviceId: string) {
  const query = JSON.stringify({ _id: deviceId });
  const { status, data } = await genieFetch(config, "GET", `/devices/?query=${encodeURIComponent(query)}`, undefined, 15000);
  if (status >= 400) throw new Error(`GenieACS error: HTTP ${status}`);
  if (!Array.isArray(data) || data.length === 0) return null;
  const parsed = parseDevice(data[0]);
  parsed._raw = data[0]; // Include raw for detail view
  return parsed;
}

/** Get device count stats — lightweight, only fetches _id and _lastInform */
export async function getDeviceStats(config: GenieAcsConfig) {
  // Use projection to only get _lastInform — much faster for 700+ devices
  const { status, data } = await genieFetch(config, "GET",
    "/devices/?projection=_lastInform&limit=10000", undefined, 30000);
  if (status >= 400) throw new Error(`GenieACS error: HTTP ${status}`);
  if (!Array.isArray(data)) {
    // Jujur: non-array berarti bukan NBI GenieACS — lempar supaya badge "Terhubung"
    // tidak false-positive hijau saat host/port salah (mis. mengarah ke UI/proxy HTML).
    throw new Error("Respon GenieACS bukan array device — cek host/port (NBI default 7557, bukan port UI GenieACS).");
  }

  const now = Date.now();
  let online = 0;
  let offline = 0;
  for (const d of data) {
    const li = d._lastInform;
    if (li) {
      const ts = typeof li === "string" ? li : li.$date || li;
      if ((now - new Date(ts).getTime()) < 300000) online++; else offline++;
    } else {
      offline++;
    }
  }
  return { total: data.length, online, offline };
}

/** Summon device (force TR-069 connection request) */
export async function summonDevice(config: GenieAcsConfig, deviceId: string) {
  const encoded = encodeURIComponent(deviceId);
  const { status } = await genieFetch(config, "POST", `/devices/${encoded}/tasks?connection_request`, {}, 10000);
  if (status >= 400 && status !== 202) throw new Error(`Summon gagal: HTTP ${status}`);
  return { summoned: true };
}

/** Refresh device VirtualParameters */
export async function refreshDevice(config: GenieAcsConfig, deviceId: string) {
  const encoded = encodeURIComponent(deviceId);
  const { status } = await genieFetch(config, "POST",
    `/devices/${encoded}/tasks?timeout=3000&connection_request`,
    { name: "refreshObject", objectName: "VirtualParameters" },
    15000,
  );
  if (status >= 400 && status !== 202) throw new Error(`Refresh gagal: HTTP ${status}`);
  return { refreshed: true };
}

/** Reboot device */
export async function rebootDevice(config: GenieAcsConfig, deviceId: string) {
  const encoded = encodeURIComponent(deviceId);
  const { status } = await genieFetch(config, "POST",
    `/devices/${encoded}/tasks?timeout=3000&connection_request`,
    { name: "reboot" },
    15000,
  );
  if (status >= 400 && status !== 202) throw new Error(`Reboot gagal: HTTP ${status}`);
  return { rebooted: true };
}

/** Add tag to device */
export async function addTag(config: GenieAcsConfig, deviceId: string, tag: string) {
  const encoded = encodeURIComponent(deviceId);
  const { status } = await genieFetch(config, "POST", `/devices/${encoded}/tags/${encodeURIComponent(tag)}`);
  if (status >= 400) throw new Error(`Add tag gagal: HTTP ${status}`);
  return { tagged: true };
}

/** Remove tag from device */
export async function removeTag(config: GenieAcsConfig, deviceId: string, tag: string) {
  const encoded = encodeURIComponent(deviceId);
  const { status } = await genieFetch(config, "DELETE", `/devices/${encoded}/tags/${encodeURIComponent(tag)}`);
  if (status >= 400) throw new Error(`Remove tag gagal: HTTP ${status}`);
  return { untagged: true };
}

/** Set arbitrary parameters on device via TR-069 */
export async function setDeviceParameters(config: GenieAcsConfig, deviceId: string, parameterValues: [string, string | boolean | number, string][]) {
  const encoded = encodeURIComponent(deviceId);
  const { status } = await genieFetch(config, "POST",
    `/devices/${encoded}/tasks?timeout=5000&connection_request`,
    { name: "setParameterValues", parameterValues },
    20000,
  );
  if (status >= 400 && status !== 202) throw new Error(`Set parameters gagal: HTTP ${status}`);
  return { updated: true };
}

/** Add a new WAN PPPoE connection on device */
export async function addWanConnection(config: GenieAcsConfig, deviceId: string, wanIndex: number, params: {
  name?: string; username?: string; password?: string; enabled?: boolean;
  vlanId?: number; serviceList?: string;
}) {
  const base = `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${wanIndex}.WANPPPConnection.1`;
  const parameterValues: [string, string | boolean | number, string][] = [];
  if (params.name) parameterValues.push([`${base}.Name`, params.name, "xsd:string"]);
  if (params.username) parameterValues.push([`${base}.Username`, params.username, "xsd:string"]);
  if (params.password) parameterValues.push([`${base}.Password`, params.password, "xsd:string"]);
  if (params.enabled !== undefined) parameterValues.push([`${base}.Enable`, params.enabled, "xsd:boolean"]);
  if (params.serviceList) parameterValues.push([`${base}.X_CT-COM_ServiceList`, params.serviceList, "xsd:string"]);
  if (parameterValues.length === 0) throw new Error("Tidak ada parameter WAN yang diisi");
  return setDeviceParameters(config, deviceId, parameterValues);
}

/** Edit existing WAN connection parameters */
export async function editWanConnection(config: GenieAcsConfig, deviceId: string, wanIndex: number, connectionType: "ppp" | "ip", params: {
  name?: string; username?: string; password?: string; enabled?: boolean;
}) {
  const connType = connectionType === "ppp" ? "WANPPPConnection" : "WANIPConnection";
  const base = `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${wanIndex}.${connType}.1`;
  const parameterValues: [string, string | boolean | number, string][] = [];
  if (params.name) parameterValues.push([`${base}.Name`, params.name, "xsd:string"]);
  if (params.username) parameterValues.push([`${base}.Username`, params.username, "xsd:string"]);
  if (params.password) parameterValues.push([`${base}.Password`, params.password, "xsd:string"]);
  if (params.enabled !== undefined) parameterValues.push([`${base}.Enable`, params.enabled, "xsd:boolean"]);
  if (parameterValues.length === 0) throw new Error("Tidak ada parameter yang diubah");
  return setDeviceParameters(config, deviceId, parameterValues);
}

/** Set WiFi parameters on device */
export async function setWifiParams(config: GenieAcsConfig, deviceId: string, wlanIndex: number, ssid: string, password: string) {
  const encoded = encodeURIComponent(deviceId);
  const params: [string, string, string][] = [];
  if (ssid) params.push([`InternetGatewayDevice.LANDevice.1.WLANConfiguration.${wlanIndex}.SSID`, ssid, "xsd:string"]);
  if (password) params.push([`InternetGatewayDevice.LANDevice.1.WLANConfiguration.${wlanIndex}.KeyPassphrase`, password, "xsd:string"]);
  const { status } = await genieFetch(config, "POST",
    `/devices/${encoded}/tasks?timeout=5000&connection_request`,
    { name: "setParameterValues", parameterValues: params },
    20000,
  );
  if (status >= 400 && status !== 202) throw new Error(`Set WiFi gagal: HTTP ${status}`);
  return { updated: true };
}

/** Delete device from GenieACS */
export async function deleteDevice(config: GenieAcsConfig, deviceId: string) {
  const encoded = encodeURIComponent(deviceId);
  const { status } = await genieFetch(config, "DELETE", `/devices/${encoded}`);
  if (status >= 400) throw new Error(`Delete gagal: HTTP ${status}`);
  return { deleted: true };
}
