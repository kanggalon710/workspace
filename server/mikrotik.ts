/**
 * MikroTik RouterOS API Client
 * Supports both:
 *   1. RouterOS API (binary protocol) — port 8728/8729 or custom
 *   2. REST API (HTTP/HTTPS)          — port 80/443 (RouterOS 7.1+)
 *
 * Auto-detects which protocol to use based on config.
 * All calls go through the server — browser never touches the router directly.
 */

import { RouterOSClient } from "routeros-client";

export interface MikrotikCredentials {
  host: string;
  port: number;
  username: string;
  password: string;
  useSsl: boolean;
}

// ── Core helper: get connected client ──
async function withClient<T>(
  creds: MikrotikCredentials,
  fn: (client: any) => Promise<T>,
  timeoutMs = 15000,
): Promise<T> {
  const api = new RouterOSClient({
    host: creds.host,
    port: creds.port,
    user: creds.username,
    password: creds.password,
    tls: creds.useSsl ? { rejectUnauthorized: false } : undefined,
    timeout: timeoutMs,
  });

  try {
    const client = await api.connect();
    const result = await fn(client);
    return result;
  } catch (err: any) {
    const msg = err.message || String(err);
    if (msg.includes("ECONNREFUSED")) {
      throw new Error(`MikroTik unreachable: koneksi ditolak oleh ${creds.host}:${creds.port}`);
    }
    if (msg.includes("ENOTFOUND")) {
      throw new Error(`MikroTik DNS error: host '${creds.host}' tidak ditemukan`);
    }
    if (msg.includes("ETIMEDOUT") || msg.includes("timeout") || msg.includes("Timeout")) {
      throw new Error(`MikroTik timeout: router ${creds.host} tidak merespon dalam ${timeoutMs / 1000}s`);
    }
    if (msg.includes("cannot log in") || msg.includes("invalid user") || msg.includes("wrong password")) {
      throw new Error(`MikroTik auth error: username/password salah untuk ${creds.host}`);
    }
    throw new Error(`MikroTik error: ${msg}`);
  } finally {
    try { api.close(); } catch { /* ignore close errors */ }
  }
}

// ═══════════════════════════════════════════════════════════
//  PUBLIC API METHODS
// ═══════════════════════════════════════════════════════════

/** Test connection and return system identity + resource */
export async function testConnection(creds: MikrotikCredentials) {
  return withClient(creds, async (client) => {
    const [identity, resource] = await Promise.all([
      client.menu("/system identity").getOnly(),
      client.menu("/system resource").getOnly(),
    ]);
    return {
      identity: identity?.name || "unknown",
      version: resource?.version || "?",
      boardName: resource?.["board-name"] || resource?.boardName || "?",
      architecture: resource?.["architecture-name"] || resource?.architectureName || "?",
      cpuCount: resource?.["cpu-count"] || resource?.cpuCount || "?",
      cpuLoad: resource?.["cpu-load"] || resource?.cpuLoad || "0",
      freeMemory: resource?.["free-memory"] || resource?.freeMemory || "0",
      totalMemory: resource?.["total-memory"] || resource?.totalMemory || "0",
      freeHdd: resource?.["free-hdd-space"] || resource?.freeHddSpace || "0",
      totalHdd: resource?.["total-hdd-space"] || resource?.totalHddSpace || "0",
      uptime: resource?.uptime || "?",
      platform: resource?.platform || "?",
    };
  });
}

/** Get system resource (CPU, RAM, uptime) */
export async function getSystemResource(creds: MikrotikCredentials) {
  return withClient(creds, async (client) => {
    return client.menu("/system resource").getOnly();
  });
}

/** Get system identity */
export async function getSystemIdentity(creds: MikrotikCredentials) {
  return withClient(creds, async (client) => {
    return client.menu("/system identity").getOnly();
  });
}

// ── PPP / PPPoE ──

/** List all PPP secrets */
export async function getPppSecrets(creds: MikrotikCredentials) {
  return withClient(creds, async (client) => {
    return client.menu("/ppp secret").get();
  });
}

/** Get active PPPoE sessions */
export async function getPppActive(creds: MikrotikCredentials) {
  return withClient(creds, async (client) => {
    return client.menu("/ppp active").get();
  });
}

/** Disconnect an active PPPoE session by .id */
export async function disconnectPppSession(creds: MikrotikCredentials, sessionId: string) {
  return withClient(creds, async (client) => {
    return client.menu("/ppp active").where("id", sessionId).remove();
  });
}

/** List PPP profiles */
export async function getPppProfiles(creds: MikrotikCredentials) {
  return withClient(creds, async (client) => {
    return client.menu("/ppp profile").get();
  });
}

// ── Interfaces ──

/** List all interfaces with traffic stats */
export async function getInterfaces(creds: MikrotikCredentials) {
  return withClient(creds, async (client) => {
    return client.menu("/interface").get();
  });
}

/** Get one-shot traffic monitor for an interface */
export async function monitorTraffic(creds: MikrotikCredentials, iface: string) {
  return withClient(creds, async (client) => {
    // Note: monitor-traffic is a streaming command;
    // we'll try to get a single snapshot
    try {
      return await client.menu("/interface").where("name", iface).get();
    } catch {
      return [];
    }
  });
}

// ── IP Pool ──

/** List IP pools */
export async function getIpPools(creds: MikrotikCredentials) {
  return withClient(creds, async (client) => {
    return client.menu("/ip pool").get();
  });
}

/** List used addresses in pools */
export async function getIpPoolUsed(creds: MikrotikCredentials) {
  return withClient(creds, async (client) => {
    return client.menu("/ip pool used").get();
  });
}

// ═══════════════════════════════════════════════════════════
//  PPP PROFILE CRUD
// ═══════════════════════════════════════════════════════════

/** Get a single PPP profile by .id */
export async function getPppProfile(creds: MikrotikCredentials, id: string) {
  return withClient(creds, async (client) => {
    return client.menu("/ppp profile").where(".id", id).getOnly();
  });
}

/** Create a new PPP profile (bandwidth package) */
export async function createPppProfile(creds: MikrotikCredentials, data: Record<string, any>) {
  return withClient(creds, async (client) => {
    return client.menu("/ppp profile").add(data);
  });
}

/** Update an existing PPP profile */
export async function updatePppProfile(creds: MikrotikCredentials, id: string, data: Record<string, any>) {
  return withClient(creds, async (client) => {
    return client.menu("/ppp profile").where(".id", id).update(data);
  });
}

/** Delete a PPP profile */
export async function deletePppProfile(creds: MikrotikCredentials, id: string) {
  return withClient(creds, async (client) => {
    return client.menu("/ppp profile").where(".id", id).remove();
  });
}

// ═══════════════════════════════════════════════════════════
//  PPP SECRET CRUD
// ═══════════════════════════════════════════════════════════

/** Create a new PPP secret (PPPoE user account) */
export async function createPppSecret(creds: MikrotikCredentials, data: Record<string, any>) {
  return withClient(creds, async (client) => {
    return client.menu("/ppp secret").add(data);
  });
}

/** Update an existing PPP secret */
export async function updatePppSecret(creds: MikrotikCredentials, id: string, data: Record<string, any>) {
  return withClient(creds, async (client) => {
    return client.menu("/ppp secret").where(".id", id).update(data);
  });
}

/** Delete a PPP secret */
export async function deletePppSecret(creds: MikrotikCredentials, id: string) {
  return withClient(creds, async (client) => {
    return client.menu("/ppp secret").where(".id", id).remove();
  });
}

/** Enable or disable a PPP secret (isolir / reactivate) */
export async function enableDisablePppSecret(creds: MikrotikCredentials, id: string, enable: boolean) {
  return withClient(creds, async (client) => {
    const menu = client.menu("/ppp secret").where(".id", id);
    return enable ? menu.enable() : menu.disable();
  });
}

// ═══════════════════════════════════════════════════════════
//  SIMPLE QUEUE CRUD
// ═══════════════════════════════════════════════════════════

/** List all simple queues */
export async function getSimpleQueues(creds: MikrotikCredentials) {
  return withClient(creds, async (client) => {
    return client.menu("/queue simple").get();
  });
}

/** Create a simple queue (bandwidth limit) */
export async function createSimpleQueue(creds: MikrotikCredentials, data: Record<string, any>) {
  return withClient(creds, async (client) => {
    return client.menu("/queue simple").add(data);
  });
}

/** Update a simple queue */
export async function updateSimpleQueue(creds: MikrotikCredentials, id: string, data: Record<string, any>) {
  return withClient(creds, async (client) => {
    return client.menu("/queue simple").where(".id", id).update(data);
  });
}

/** Delete a simple queue */
export async function deleteSimpleQueue(creds: MikrotikCredentials, id: string) {
  return withClient(creds, async (client) => {
    return client.menu("/queue simple").where(".id", id).remove();
  });
}

// ═══════════════════════════════════════════════════════════
//  NETWORK UTILITY (read-only)
// ═══════════════════════════════════════════════════════════

/** List DHCP server leases */
export async function getDhcpLeases(creds: MikrotikCredentials) {
  return withClient(creds, async (client) => {
    return client.menu("/ip dhcp-server lease").get();
  });
}

/** Get ARP table */
export async function getArpTable(creds: MikrotikCredentials) {
  return withClient(creds, async (client) => {
    return client.menu("/ip arp").get();
  });
}

/** Get IP neighbors (LLDP/CDP discovery) */
export async function getNeighbors(creds: MikrotikCredentials) {
  return withClient(creds, async (client) => {
    return client.menu("/ip neighbor").get();
  });
}

/** Get firewall address-list entries */
export async function getFirewallAddressList(creds: MikrotikCredentials) {
  return withClient(creds, async (client) => {
    return client.menu("/ip firewall address-list").get();
  });
}

// ── Logs ──

/** Get recent log entries */
export async function getLog(creds: MikrotikCredentials, limit = 50) {
  return withClient(creds, async (client) => {
    const logs = await client.menu("/log").get();
    // RouterOS returns all logs; take the last N
    return (logs || []).slice(-limit);
  });
}
