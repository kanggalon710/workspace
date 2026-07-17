# Chatwoot Integration — Foundation (Batch 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each tenant connect its own Chatwoot account to Workspace — config + permissions + backend proxy + connection test + "Open in Chatwoot" — with isolation enforced by per-account tokens.

**Architecture:** Per-mitra config lives in the existing `mitra_integrations` table (no new table). A backend proxy (`server/chatwoot.ts` + routes registered on the main authed `router`) holds the account-scoped token and talks to Chatwoot; the browser never sees the token. Two new 3-level permissions (`chatwoot`, `chatwoot_settings`) gate everything. Pure logic (config resolution, deep-link building) sits in tested `shared/` modules.

**Tech Stack:** Express 5 + Drizzle (MySQL) · React 18 + TanStack Query + Wouter + shadcn/ui · `node:test` via `npx tsx --test`.

**Spec:** `docs/superpowers/specs/2026-06-13-chatwoot-integration-foundation-design.md`

**Branch:** Work on `dev`. Do not push/deploy (user does that).

---

## Plan-level corrections to the spec

- The spec said "sub-router mounted in `server/index.ts`". **Override:** the auth + `tenantContext` middleware lives on the main `router` (`server/routes.ts:281`). A separate `app.use()` in `index.ts` would bypass it. Instead, `server/chatwoot-routes.ts` exports `registerChatwootRoutes(router)` which is **called from `server/routes.ts`** after `authMiddleware`. This keeps the file separate (maintainable) while inheriting auth + tenant scoping.
- Permission group label: `"Komunikasi"` (new group in the role matrix — renders automatically from `ALL_PERMISSIONS`).

---

## File structure

| File | Responsibility |
|---|---|
| `shared/chatwootConfig.ts` (+ `.test.ts`) | Pure: resolve raw settings → typed config; mask helpers; `isConfigured`/`isEnabled` |
| `shared/chatwootLinks.ts` (+ `.test.ts`) | Pure: build Chatwoot deep-link URLs |
| `shared/schema.ts` | `ALL_PERMISSIONS` += `chatwoot`, `chatwoot_settings` |
| `server/storage.ts` | `seedMitraIntegrationDefaults` += 4 chatwoot keys |
| `server/chatwoot.ts` | HTTP client: `getChatwootConfigForMitra`, `chatwootFetch`, `testConnection` |
| `server/chatwoot-routes.ts` | `registerChatwootRoutes(router)`: settings GET/PUT, test-connection, status |
| `server/routes.ts` | call `registerChatwootRoutes(router)` |
| `client/lib/chatwoot.ts` | typed API wrappers |
| `client/hooks/useChatwoot.ts` | `useChatwootSettings`, `useChatwootStatus` |
| `client/components/chatwoot/ChatwootStatusBadge.tsx` | status badge |
| `client/components/chatwoot/OpenInChatwootButton.tsx` | deep-link button (self-contained) |
| `client/components/chatwoot/ChatwootSettingsForm.tsx` | settings form |
| `client/pages/ChatwootSettingsPage.tsx` | settings page at `/integrations/chatwoot` |
| `client/App.tsx` | lazy route |
| `client/pages/IntegrationPage.tsx` | Chatwoot card → link to page |
| `client/pages/CustomersPage.tsx` | drop `OpenInChatwootButton` in customer detail |

---

## Task 1: Pure config module `shared/chatwootConfig.ts`

**Files:**
- Create: `shared/chatwootConfig.ts`
- Test: `shared/chatwootConfig.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// shared/chatwootConfig.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveChatwootConfig, isConfigured, isEnabled, isMaskedToken, MASK } from "./chatwootConfig.js";

test("resolveChatwootConfig normalizes raw settings", () => {
  const c = resolveChatwootConfig({
    chatwoot_enabled: "true",
    chatwoot_base_url: "https://omni.jabnet.id/",
    chatwoot_account_id: "3",
    chatwoot_api_token: "tok_abc",
  });
  assert.equal(c.enabled, true);
  assert.equal(c.baseUrl, "https://omni.jabnet.id"); // trailing slash trimmed
  assert.equal(c.accountId, 3);
  assert.equal(c.hasToken, true);
});

test("defaults: empty map → disabled, default base url, no token", () => {
  const c = resolveChatwootConfig({});
  assert.equal(c.enabled, false);
  assert.equal(c.baseUrl, "https://omni.jabnet.id");
  assert.equal(c.accountId, null);
  assert.equal(c.hasToken, false);
});

test("isConfigured requires enabled + baseUrl + accountId + token", () => {
  assert.equal(isConfigured(resolveChatwootConfig({})), false);
  assert.equal(isConfigured(resolveChatwootConfig({
    chatwoot_enabled: "true", chatwoot_account_id: "1", chatwoot_api_token: "t",
  })), true);
  // disabled but fully filled → not configured (because disabled)
  assert.equal(isEnabled(resolveChatwootConfig({ chatwoot_enabled: "false" })), false);
});

test("masked token detection (so PUT can skip re-writing the placeholder)", () => {
  assert.equal(isMaskedToken(MASK), true);
  assert.equal(isMaskedToken("real_token"), false);
  assert.equal(isMaskedToken(""), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test shared/chatwootConfig.test.ts`
Expected: FAIL — `Cannot find module './chatwootConfig.js'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// shared/chatwootConfig.ts
/** Pure config resolution for the Chatwoot integration. No I/O — testable. */

export const MASK = "••••••••";
export const DEFAULT_BASE_URL = "https://omni.jabnet.id";

export type ChatwootConfig = {
  enabled: boolean;
  baseUrl: string;
  accountId: number | null;
  hasToken: boolean;
};

function trimSlash(s: string): string {
  return s.replace(/\/+$/, "");
}

/** Build a ChatwootConfig from raw mitra_integrations key/value strings. */
export function resolveChatwootConfig(map: Record<string, string | null | undefined>): ChatwootConfig {
  const baseRaw = (map.chatwoot_base_url ?? "").trim() || DEFAULT_BASE_URL;
  const accRaw = (map.chatwoot_account_id ?? "").trim();
  const accNum = accRaw ? Number(accRaw) : NaN;
  const token = (map.chatwoot_api_token ?? "").trim();
  return {
    enabled: (map.chatwoot_enabled ?? "").trim().toLowerCase() === "true",
    baseUrl: trimSlash(baseRaw),
    accountId: Number.isFinite(accNum) && accNum > 0 ? accNum : null,
    hasToken: token.length > 0 && token !== MASK,
  };
}

export function isEnabled(c: ChatwootConfig): boolean {
  return c.enabled;
}

/** Fully usable: enabled AND has the pieces needed to call Chatwoot. */
export function isConfigured(c: ChatwootConfig): boolean {
  return c.enabled && !!c.baseUrl && c.accountId != null && c.hasToken;
}

/** True when a submitted token is just the masked placeholder (don't overwrite the stored token). */
export function isMaskedToken(v: string): boolean {
  return v === MASK;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test shared/chatwootConfig.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add shared/chatwootConfig.ts shared/chatwootConfig.test.ts
git commit -m "feat(chatwoot): pure config resolver + mask helpers (shared)"
```

---

## Task 2: Pure deep-link module `shared/chatwootLinks.ts`

**Files:**
- Create: `shared/chatwootLinks.ts`
- Test: `shared/chatwootLinks.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// shared/chatwootLinks.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { chatwootAccountUrl, chatwootContactsUrl, chatwootContactUrl } from "./chatwootLinks.js";

test("account dashboard url", () => {
  assert.equal(chatwootAccountUrl("https://omni.jabnet.id", 3), "https://omni.jabnet.id/app/accounts/3/dashboard");
});

test("contacts list url, trailing slash on base is safe", () => {
  assert.equal(chatwootContactsUrl("https://omni.jabnet.id/", 3), "https://omni.jabnet.id/app/accounts/3/contacts");
});

test("single contact url (used by batch 2)", () => {
  assert.equal(chatwootContactUrl("https://omni.jabnet.id", 3, 42), "https://omni.jabnet.id/app/accounts/3/contacts/42");
});

test("null when base or account missing", () => {
  assert.equal(chatwootAccountUrl("", 3), null);
  assert.equal(chatwootAccountUrl("https://x", null), null);
  assert.equal(chatwootContactUrl("https://x", 3, null), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test shared/chatwootLinks.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// shared/chatwootLinks.ts
/** Pure builders for Chatwoot deep-link URLs. No I/O — testable. */

function base(baseUrl: string | null | undefined, accountId: number | null | undefined): string | null {
  if (!baseUrl || accountId == null) return null;
  return `${baseUrl.replace(/\/+$/, "")}/app/accounts/${accountId}`;
}

export function chatwootAccountUrl(baseUrl: string | null | undefined, accountId: number | null | undefined): string | null {
  const b = base(baseUrl, accountId);
  return b ? `${b}/dashboard` : null;
}

export function chatwootContactsUrl(baseUrl: string | null | undefined, accountId: number | null | undefined): string | null {
  const b = base(baseUrl, accountId);
  return b ? `${b}/contacts` : null;
}

export function chatwootContactUrl(
  baseUrl: string | null | undefined,
  accountId: number | null | undefined,
  contactId: number | null | undefined,
): string | null {
  const b = base(baseUrl, accountId);
  return b && contactId != null ? `${b}/contacts/${contactId}` : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test shared/chatwootLinks.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add shared/chatwootLinks.ts shared/chatwootLinks.test.ts
git commit -m "feat(chatwoot): pure deep-link url builders (shared)"
```

---

## Task 3: Permissions + per-mitra seed defaults

**Files:**
- Modify: `shared/schema.ts` (the `ALL_PERMISSIONS` array, near line 1541)
- Modify: `server/storage.ts` (`seedMitraIntegrationDefaults`, near line 6934)
- Test: `shared/chatwootPermissions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// shared/chatwootPermissions.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_PERMISSION_KEYS } from "./schema.js";

test("chatwoot permission keys are registered", () => {
  assert.ok(ALL_PERMISSION_KEYS.includes("chatwoot"));
  assert.ok(ALL_PERMISSION_KEYS.includes("chatwoot_settings"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test shared/chatwootPermissions.test.ts`
Expected: FAIL — assertion: `chatwoot` not in keys.

- [ ] **Step 3a: Add permission keys**

In `shared/schema.ts`, inside the `ALL_PERMISSIONS` array, add two entries (place them together, e.g. just before the closing `]`):

```ts
  { key: "chatwoot", label: "Chatwoot", group: "Komunikasi" },
  { key: "chatwoot_settings", label: "Chatwoot — Pengaturan", group: "Komunikasi" },
```

- [ ] **Step 3b: Seed per-mitra defaults**

In `server/storage.ts`, in `seedMitraIntegrationDefaults`, add to the `defaults` array (after the `genieacs_*` block):

```ts
      { key: "chatwoot_enabled", value: "false", isSecret: 0 },
      { key: "chatwoot_base_url", value: "https://omni.jabnet.id", isSecret: 0 },
      { key: "chatwoot_account_id", value: "", isSecret: 0 },
      { key: "chatwoot_api_token", value: "", isSecret: 1 },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test shared/chatwootPermissions.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add shared/schema.ts server/storage.ts shared/chatwootPermissions.test.ts
git commit -m "feat(chatwoot): register chatwoot/chatwoot_settings permissions + seed mitra defaults"
```

> Note: on next server start, `upgradePermissionsV412()` auto-grants both keys to all roles (Admin/System-Admin forced `write`). No DDL needed — `mitra_integrations` already exists; defaults are `INSERT IGNORE` (idempotent).

---

## Task 4: Backend Chatwoot client `server/chatwoot.ts`

**Files:**
- Create: `server/chatwoot.ts`

No unit test (network I/O — follows the `server/genieacs.ts` precedent; verified manually in Task 10). Pure logic it depends on is already tested in Task 1.

- [ ] **Step 1: Write the module**

```ts
// server/chatwoot.ts
/** Chatwoot NBI client. Token is account-scoped → isolation enforced by Chatwoot.
 *  Mirrors server/genieacs.ts patterns (timeout, friendly error mapping). */
import { storage } from "./storage.js";
import { resolveChatwootConfig, isConfigured } from "../shared/chatwootConfig.js";

export type ChatwootRuntimeConfig = { baseUrl: string; accountId: number; token: string };

/** Read the active mitra's config from mitra_integrations. Returns null unless fully configured + enabled. */
export async function getChatwootConfigForMitra(): Promise<ChatwootRuntimeConfig | null> {
  const [enabled, baseUrl, accountId, token] = await Promise.all([
    storage.getMitraSetting("chatwoot_enabled", { fallbackToGlobal: false }),
    storage.getMitraSetting("chatwoot_base_url", { fallbackToGlobal: false }),
    storage.getMitraSetting("chatwoot_account_id", { fallbackToGlobal: false }),
    storage.getMitraSetting("chatwoot_api_token", { fallbackToGlobal: false }),
  ]);
  const cfg = resolveChatwootConfig({
    chatwoot_enabled: enabled, chatwoot_base_url: baseUrl,
    chatwoot_account_id: accountId, chatwoot_api_token: token,
  });
  if (!isConfigured(cfg) || !token) return null;
  return { baseUrl: cfg.baseUrl, accountId: cfg.accountId!, token };
}

/** Core fetch: account-scoped path like "/conversations". Always prefixes /api/v1/accounts/{id}. */
export async function chatwootFetch(
  cfg: ChatwootRuntimeConfig,
  method: string,
  path: string,
  body?: any,
  timeoutMs = 12000,
): Promise<{ status: number; data: any }> {
  const url = `${cfg.baseUrl}/api/v1/accounts/${cfg.accountId}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const opts: RequestInit = {
      method,
      headers: { api_access_token: cfg.token, "Content-Type": "application/json" },
      signal: controller.signal,
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    const text = await res.text();
    let data: any;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: res.status, data };
  } catch (err: any) {
    if (err.name === "AbortError") throw new Error(`Chatwoot timeout: ${cfg.baseUrl} tidak merespon dalam ${timeoutMs / 1000}s`);
    if (err.cause?.code === "ECONNREFUSED") throw new Error(`Chatwoot unreachable: koneksi ditolak oleh ${cfg.baseUrl}`);
    if (err.cause?.code === "ENOTFOUND") throw new Error(`Chatwoot DNS error: host tidak ditemukan`);
    throw new Error(`Chatwoot error: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

/** Verify token + account by reading the account. Returns ok + account name (best-effort). */
export async function testConnection(cfg: ChatwootRuntimeConfig): Promise<{ ok: boolean; accountName?: string; error?: string }> {
  try {
    // Account-scoped token: GET the account itself.
    const { status, data } = await chatwootFetch(cfg, "GET", "", undefined, 10000);
    if (status === 401 || status === 403) return { ok: false, error: "Token ditolak (401/403) — periksa API token & account ID" };
    if (status >= 400) return { ok: false, error: `Chatwoot HTTP ${status}` };
    const name = (data && (data.name || data.account_name)) || undefined;
    return { ok: true, accountName: name };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add server/chatwoot.ts
git commit -m "feat(chatwoot): backend NBI client (config resolve, fetch, testConnection)"
```

> Open risk (resolve here if test fails in Task 10): if `GET /api/v1/accounts/{id}` is not valid for an account-scoped token, switch `testConnection` to `GET /api/v1/profile` and read `data.account_id` / `data.accounts`.

---

## Task 5: Routes `server/chatwoot-routes.ts` + register in `routes.ts`

**Files:**
- Create: `server/chatwoot-routes.ts`
- Modify: `server/routes.ts` (call `registerChatwootRoutes(router)` after `router.use(authMiddleware)` / near other route definitions)

- [ ] **Step 1: Write the routes module**

```ts
// server/chatwoot-routes.ts
/** /api/chatwoot/* — registered on the MAIN authed router (inherits auth + tenantContext).
 *  All routes tenant-scoped (active mitra), permission-gated, audited. Token never leaves backend. */
import type { Router, Request, Response } from "express";
import { storage } from "./storage.js";
import { resolveChatwootConfig, isConfigured, MASK, isMaskedToken } from "../shared/chatwootConfig.js";
import { getChatwootConfigForMitra, testConnection } from "./chatwoot.js";

// Simple in-memory rate limit for test-connection: max 10 / minute / mitra.
const testHits = new Map<number, number[]>();
function rateLimited(mitraId: number, max = 10, windowMs = 60_000): boolean {
  const now = Date.now();
  const arr = (testHits.get(mitraId) ?? []).filter((t) => now - t < windowMs);
  arr.push(now);
  testHits.set(mitraId, arr);
  return arr.length > max;
}

export function registerChatwootRoutes(
  router: Router,
  helpers: {
    requirePermission: (req: Request, res: Response, f: string) => boolean;
    requireWritePermission: (req: Request, res: Response, f: string) => boolean;
    sendSuccess: (res: Response, data: any) => void;
    sendError: (res: Response, msg: string, code?: number) => void;
  },
) {
  const { requirePermission, requireWritePermission, sendSuccess, sendError } = helpers;

  async function readSettingsMap() {
    const [enabled, baseUrl, accountId, token] = await Promise.all([
      storage.getMitraSetting("chatwoot_enabled", { fallbackToGlobal: false }),
      storage.getMitraSetting("chatwoot_base_url", { fallbackToGlobal: false }),
      storage.getMitraSetting("chatwoot_account_id", { fallbackToGlobal: false }),
      storage.getMitraSetting("chatwoot_api_token", { fallbackToGlobal: false }),
    ]);
    return { enabled, baseUrl, accountId, token };
  }

  // GET settings — token masked.
  router.get("/api/chatwoot/settings", async (req: Request, res: Response) => {
    if (!requirePermission(req, res, "chatwoot_settings")) return;
    try {
      const m = await readSettingsMap();
      const cfg = resolveChatwootConfig({
        chatwoot_enabled: m.enabled, chatwoot_base_url: m.baseUrl,
        chatwoot_account_id: m.accountId, chatwoot_api_token: m.token,
      });
      sendSuccess(res, {
        enabled: cfg.enabled,
        baseUrl: cfg.baseUrl,
        accountId: cfg.accountId,
        // never return the real token; signal whether one is stored
        tokenMasked: cfg.hasToken ? MASK : "",
        hasToken: cfg.hasToken,
      });
    } catch (e: any) { sendError(res, e.message, 500); }
  });

  // PUT settings — persist; skip token write if masked.
  router.put("/api/chatwoot/settings", async (req: Request, res: Response) => {
    if (!requireWritePermission(req, res, "chatwoot_settings")) return;
    try {
      const { enabled, baseUrl, accountId, apiToken } = req.body ?? {};
      await storage.setMitraSetting("chatwoot_enabled", enabled ? "true" : "false");
      await storage.setMitraSetting("chatwoot_base_url", String(baseUrl ?? "").trim() || "https://omni.jabnet.id");
      await storage.setMitraSetting("chatwoot_account_id", String(accountId ?? "").trim());
      const tokenChanged = typeof apiToken === "string" && apiToken.length > 0 && !isMaskedToken(apiToken);
      if (tokenChanged) {
        await storage.setMitraSetting("chatwoot_api_token", apiToken.trim(), { isSecret: true });
      }
      await storage.createAuditLog({
        userId: req.authUser!.id, username: req.authUser!.username, userName: req.authUser!.name,
        action: "UPDATE", entityType: "chatwoot_settings", entityId: null, entityName: "Chatwoot",
        details: JSON.stringify({ enabled: !!enabled, accountId: String(accountId ?? ""), tokenChanged }),
        createdAt: new Date().toISOString(),
      } as any);
      sendSuccess(res, { ok: true });
    } catch (e: any) { sendError(res, e.message, 500); }
  });

  // POST test-connection — server-side, rate-limited.
  router.post("/api/chatwoot/test-connection", async (req: Request, res: Response) => {
    if (!requirePermission(req, res, "chatwoot_settings")) return;
    const mitraId = req.authUser!.activeMitraId ?? 1;
    if (rateLimited(mitraId)) return sendError(res, "Terlalu banyak percobaan tes koneksi. Coba lagi sebentar.", 429);
    try {
      const cfg = await getChatwootConfigForMitra();
      if (!cfg) return sendSuccess(res, { ok: false, error: "Belum dikonfigurasi (aktifkan + isi account ID & token)" });
      const result = await testConnection(cfg);
      await storage.createAuditLog({
        userId: req.authUser!.id, username: req.authUser!.username, userName: req.authUser!.name,
        action: "UPDATE", entityType: "chatwoot_test", entityId: null, entityName: "Chatwoot",
        details: JSON.stringify({ ok: result.ok, error: result.error ?? null }),
        createdAt: new Date().toISOString(),
      } as any);
      sendSuccess(res, result);
    } catch (e: any) { sendError(res, e.message, 500); }
  });

  // GET status — for badges + Open in Chatwoot. Never returns token.
  router.get("/api/chatwoot/status", async (req: Request, res: Response) => {
    if (!requirePermission(req, res, "chatwoot")) return;
    try {
      const m = await readSettingsMap();
      const cfg = resolveChatwootConfig({
        chatwoot_enabled: m.enabled, chatwoot_base_url: m.baseUrl,
        chatwoot_account_id: m.accountId, chatwoot_api_token: m.token,
      });
      sendSuccess(res, {
        enabled: cfg.enabled,
        configured: isConfigured(cfg),
        baseUrl: cfg.baseUrl,
        accountId: cfg.accountId,
      });
    } catch (e: any) { sendError(res, e.message, 500); }
  });
}
```

- [ ] **Step 2: Register on the main router**

In `server/routes.ts`, add the import near the other local imports at the top:

```ts
import { registerChatwootRoutes } from "./chatwoot-routes.js";
```

Then, after `router.use(globalWriteGuard);` (line ~399), add:

```ts
registerChatwootRoutes(router, { requirePermission, requireWritePermission, sendSuccess, sendError });
```

> `requirePermission`, `requireWritePermission`, `sendSuccess`, `sendError` are all defined in `routes.ts` already — pass them in (avoids circular imports).

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add server/chatwoot-routes.ts server/routes.ts
git commit -m "feat(chatwoot): /api/chatwoot settings/test/status routes (tenant-scoped, audited, rate-limited)"
```

---

## Task 6: Client API wrappers + hooks

**Files:**
- Create: `client/lib/chatwoot.ts`
- Create: `client/hooks/useChatwoot.ts`

- [ ] **Step 1: Write the API wrapper**

```ts
// client/lib/chatwoot.ts
import { api } from "@/lib/api";

export type ChatwootSettings = {
  enabled: boolean;
  baseUrl: string;
  accountId: number | null;
  tokenMasked: string;
  hasToken: boolean;
};
export type ChatwootStatus = {
  enabled: boolean;
  configured: boolean;
  baseUrl: string;
  accountId: number | null;
};
export type ChatwootTestResult = { ok: boolean; accountName?: string; error?: string };

export const chatwootApi = {
  getSettings: () => api.get<ChatwootSettings>("/chatwoot/settings"),
  saveSettings: (body: { enabled: boolean; baseUrl: string; accountId: string; apiToken?: string }) =>
    api.put<{ ok: boolean }>("/chatwoot/settings", body),
  testConnection: () => api.post<ChatwootTestResult>("/chatwoot/test-connection", {}),
  getStatus: () => api.get<ChatwootStatus>("/chatwoot/status"),
};
```

- [ ] **Step 2: Write the hooks**

```ts
// client/hooks/useChatwoot.ts
import { useQuery } from "@tanstack/react-query";
import { chatwootApi, type ChatwootSettings, type ChatwootStatus } from "@/lib/chatwoot";

export function useChatwootSettings(enabled = true) {
  return useQuery<ChatwootSettings>({
    queryKey: ["chatwoot-settings"],
    queryFn: () => chatwootApi.getSettings(),
    enabled,
    staleTime: 10_000,
  });
}

/** Lightweight status for badges + Open-in-Chatwoot. Used widely (customer detail). */
export function useChatwootStatus() {
  return useQuery<ChatwootStatus>({
    queryKey: ["chatwoot-status"],
    queryFn: () => chatwootApi.getStatus(),
    staleTime: 60_000,
    retry: 0,
  });
}
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add client/lib/chatwoot.ts client/hooks/useChatwoot.ts
git commit -m "feat(chatwoot): client api wrappers + query hooks"
```

---

## Task 7: Reusable components

**Files:**
- Create: `client/components/chatwoot/ChatwootStatusBadge.tsx`
- Create: `client/components/chatwoot/OpenInChatwootButton.tsx`

- [ ] **Step 1: Status badge**

```tsx
// client/components/chatwoot/ChatwootStatusBadge.tsx
import { StatusBadge } from "@/components/ui/status-badge";
import { useChatwootStatus } from "@/hooks/useChatwoot";

export function ChatwootStatusBadge() {
  const { data, isLoading } = useChatwootStatus();
  if (isLoading) return <StatusBadge variant="neutral" label="Memuat…" appearance="subtle" />;
  if (!data?.enabled) return <StatusBadge variant="neutral" label="Nonaktif" appearance="subtle" />;
  if (!data.configured) return <StatusBadge variant="warning" label="Belum lengkap" appearance="subtle" />;
  return <StatusBadge variant="success" label="Aktif" appearance="subtle" />;
}
```

> Verify the exact `StatusBadge` import path + props against an existing usage (`grep -rn "StatusBadge" client/components | head`). Match the real `variant`/`appearance` prop names.

- [ ] **Step 2: Open-in-Chatwoot button (self-contained)**

```tsx
// client/components/chatwoot/OpenInChatwootButton.tsx
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChatwootStatus } from "@/hooks/useChatwoot";
import { chatwootAccountUrl, chatwootContactsUrl } from "@shared/chatwootLinks";

/** Opens the active mitra's Chatwoot account. `target="contacts"` opens the contacts list.
 *  Hidden unless Chatwoot is enabled + configured (permission already gated server-side on /status). */
export function OpenInChatwootButton({ target = "dashboard", size = "sm" }: {
  target?: "dashboard" | "contacts";
  size?: "xs" | "sm" | "default";
}) {
  const { data } = useChatwootStatus();
  if (!data?.enabled || !data.configured) return null;
  const url = target === "contacts"
    ? chatwootContactsUrl(data.baseUrl, data.accountId)
    : chatwootAccountUrl(data.baseUrl, data.accountId);
  if (!url) return null;
  return (
    <Button type="button" variant="outline" size={size as any} onClick={() => window.open(url, "_blank", "noopener,noreferrer")}>
      <MessageSquare className="size-3.5 mr-1.5" aria-hidden="true" /> Buka di Chatwoot
    </Button>
  );
}
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: 0 errors. (If `StatusBadge`/`Button` prop names differ, fix to match.)

- [ ] **Step 4: Commit**

```bash
git add client/components/chatwoot/
git commit -m "feat(chatwoot): ChatwootStatusBadge + OpenInChatwootButton components"
```

---

## Task 8: Settings form, page, route, integration card

**Files:**
- Create: `client/components/chatwoot/ChatwootSettingsForm.tsx`
- Create: `client/pages/ChatwootSettingsPage.tsx`
- Modify: `client/App.tsx`
- Modify: `client/pages/IntegrationPage.tsx`

- [ ] **Step 1: Settings form**

```tsx
// client/components/chatwoot/ChatwootSettingsForm.tsx
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, FormRow } from "@/components/ui/form-field";
import { SkeletonCard } from "@/components/ui/skeleton";
import { chatwootApi } from "@/lib/chatwoot";
import { useChatwootSettings } from "@/hooks/useChatwoot";
import { MASK } from "@shared/chatwootConfig";

export function ChatwootSettingsForm() {
  const { data, isLoading } = useChatwootSettings();
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(false);
  const [baseUrl, setBaseUrl] = useState("https://omni.jabnet.id");
  const [accountId, setAccountId] = useState("");
  const [apiToken, setApiToken] = useState(""); // empty unless user types a new one
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (data) {
      setEnabled(data.enabled);
      setBaseUrl(data.baseUrl || "https://omni.jabnet.id");
      setAccountId(data.accountId != null ? String(data.accountId) : "");
      setApiToken(data.hasToken ? MASK : "");
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () => chatwootApi.saveSettings({ enabled, baseUrl, accountId, apiToken: apiToken === MASK ? undefined : apiToken }),
    onSuccess: () => { toast.success("Pengaturan Chatwoot tersimpan"); qc.invalidateQueries({ queryKey: ["chatwoot-settings"] }); qc.invalidateQueries({ queryKey: ["chatwoot-status"] }); },
    onError: (e: any) => toast.error(e.message || "Gagal menyimpan"),
  });

  const test = useMutation({
    mutationFn: () => chatwootApi.testConnection(),
    onSuccess: (r) => setTestMsg({ ok: r.ok, text: r.ok ? `Terhubung${r.accountName ? ` — ${r.accountName}` : ""}` : (r.error || "Gagal") }),
    onError: (e: any) => setTestMsg({ ok: false, text: e.message || "Gagal" }),
  });

  if (isLoading) return <SkeletonCard />;

  return (
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Aktifkan integrasi Chatwoot
      </label>
      <FormRow cols={2}>
        <FormField label="Chatwoot URL" htmlFor="cw-url">
          <Input id="cw-url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://omni.jabnet.id" />
        </FormField>
        <FormField label="Account ID" htmlFor="cw-acc">
          <Input id="cw-acc" value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="mis. 3" inputMode="numeric" />
        </FormField>
      </FormRow>
      <FormField label="API Token" htmlFor="cw-token" hint="Token akun Chatwoot (account-scoped). Tidak ditampilkan penuh setelah disimpan.">
        <Input id="cw-token" type="password" value={apiToken} onChange={(e) => setApiToken(e.target.value)} placeholder="api_access_token" />
      </FormField>
      <div className="flex flex-wrap gap-2 items-center">
        <Button type="submit" loading={save.isPending}>Simpan</Button>
        <Button type="button" variant="outline" loading={test.isPending} onClick={() => test.mutate()}>Tes Koneksi</Button>
        {testMsg && (
          <span className={`text-sm ${testMsg.ok ? "text-success" : "text-destructive"}`}>{testMsg.text}</span>
        )}
      </div>
    </form>
  );
}
```

> Verify `FormField`/`FormRow`/`Input`/`Button` import paths + prop names against existing usages (`grep -rn "FormField" client/pages | head`). The toast import is `sonner` here — match whatever the repo uses (`grep -rn "import { toast }" client | head`).

- [ ] **Step 2: Settings page**

```tsx
// client/pages/ChatwootSettingsPage.tsx
import { MessageSquare } from "lucide-react";
import { PageContainer, PageHeader, PageSection } from "@/components/ui/page";
import { Card, CardContent } from "@/components/ui/card";
import { ChatwootSettingsForm } from "@/components/chatwoot/ChatwootSettingsForm";
import { ChatwootStatusBadge } from "@/components/chatwoot/ChatwootStatusBadge";

export default function ChatwootSettingsPage() {
  return (
    <PageContainer>
      <PageHeader icon={MessageSquare} title="Chatwoot" description="Integrasi omnichannel per-tenant" accent="info" actions={<ChatwootStatusBadge />} />
      <PageSection title="Koneksi" description="Hubungkan Workspace dengan Chatwoot account milik tenant ini.">
        <Card><CardContent className="p-6"><ChatwootSettingsForm /></CardContent></Card>
      </PageSection>
    </PageContainer>
  );
}
```

> Verify `PageContainer`/`PageHeader`/`PageSection` import paths + props against an existing page (e.g. `client/pages/IntegrationPage.tsx`). Match the real component API.

- [ ] **Step 3: Lazy route in `client/App.tsx`**

Add near the other lazy imports:

```tsx
const ChatwootSettingsPage = lazy(() => import("@/pages/ChatwootSettingsPage"));
```

Add a route alongside the existing protected routes (match the surrounding `<Route>` + permission-guard pattern used for `/integrations`):

```tsx
<Route path="/integrations/chatwoot" component={ChatwootSettingsPage} />
```

> Match the exact route registration pattern in `App.tsx` (it may wrap routes in a permission/layout guard — follow the same shape as the existing `/integrations` route, gating on `chatwoot_settings`).

- [ ] **Step 4: Card on IntegrationPage**

In `client/pages/IntegrationPage.tsx`, add a navigational card (use the page's existing router hook — `useLocation` from `wouter`). Place near the top of the returned card list:

```tsx
{/* Chatwoot integration entry */}
<Card>
  <CardContent className="p-6 flex items-center justify-between gap-4">
    <div className="flex items-center gap-3">
      <MessageSquare className="size-6 text-info" aria-hidden="true" />
      <div>
        <h3 className="font-semibold text-lg">Chatwoot</h3>
        <p className="text-sm text-muted-foreground">Omnichannel chat per-tenant</p>
      </div>
    </div>
    <div className="flex items-center gap-3">
      <ChatwootStatusBadge />
      <Button type="button" variant="outline" size="sm" onClick={() => setLocation("/integrations/chatwoot")}>Buka</Button>
    </div>
  </CardContent>
</Card>
```

Add imports at the top of `IntegrationPage.tsx` if missing: `import { MessageSquare } from "lucide-react";`, `import { ChatwootStatusBadge } from "@/components/chatwoot/ChatwootStatusBadge";`, and ensure `useLocation` from `wouter` is imported (`const [, setLocation] = useLocation();`).

- [ ] **Step 5: Verify typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 errors, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add client/components/chatwoot/ChatwootSettingsForm.tsx client/pages/ChatwootSettingsPage.tsx client/App.tsx client/pages/IntegrationPage.tsx
git commit -m "feat(chatwoot): settings page + form + /integrations card + lazy route"
```

---

## Task 9: Customer detail — Open in Chatwoot

**Files:**
- Modify: `client/pages/CustomersPage.tsx`

- [ ] **Step 1: Add the button to the customer detail area**

Import at the top:

```tsx
import { OpenInChatwootButton } from "@/components/chatwoot/OpenInChatwootButton";
```

In the customer detail drawer/dialog action area (where other per-customer action buttons live — search for the customer detail header actions), drop in:

```tsx
<OpenInChatwootButton target="contacts" size="sm" />
```

The component self-hides when Chatwoot is disabled/unconfigured, so no extra guards are needed. (Per-contact deep-link arrives with contact-sync in Batch 2; for now it opens the account's contacts page.)

- [ ] **Step 2: Verify typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 errors, build succeeds.

- [ ] **Step 3: Commit**

```bash
git add client/pages/CustomersPage.tsx
git commit -m "feat(chatwoot): Open in Chatwoot button on customer detail"
```

---

## Task 10: Full verification + manual smoke test

**Files:** none (verification only)

- [ ] **Step 1: Run the full suite**

Run: `npm run typecheck && npx tsx --test shared/*.test.ts server/*.test.ts && npm run build`
Expected: 0 type errors · all tests pass (includes the 3 new chatwoot test files) · build succeeds.

- [ ] **Step 2: Manual smoke (local, per [[reference-local-ui-testing]])**

Start the prod bundle (`node dist/index.mjs` — NOT from source, to avoid the stale `server/public` shadow), log in as JABNET admin, then verify:
1. `/integrations` shows the **Chatwoot card** with a "Nonaktif" badge.
2. Open `/integrations/chatwoot` → form loads (skeleton → empty fields, base URL prefilled).
3. Enter account ID + token, enable, **Simpan** → reload → token shows masked (`••••••••`), badge → "Aktif"/"Belum lengkap".
4. **Tes Koneksi** → shows result (against a real Chatwoot, or note the error mapping works). If it errors with the account path, apply the Task 4 fallback (`/api/v1/profile`).
5. Customer detail → **Buka di Chatwoot** button appears and opens `{baseUrl}/app/accounts/{id}/contacts` in a new tab.
6. **Isolation check:** switch to a second mitra (mitra switcher) → `/integrations/chatwoot` shows **blank** config (no JABNET token leak).
7. **Permission check:** a role without `chatwoot_settings` gets 403 on the settings page/API; a role without `chatwoot` doesn't see the Open-in-Chatwoot button.

- [ ] **Step 3: Final commit (if any fixes were needed during smoke)**

```bash
git add -A && git commit -m "fix(chatwoot): smoke-test adjustments"
```

---

## Self-review notes

- **Spec coverage:** §1 config → T3; §2 pure modules → T1,T2; §3 backend client+proxy → T4,T5; §4 permissions → T3; §5 frontend → T6,T7,T8,T9; §6 security (mask, proxy-only, rate-limit, audit) → T4,T5; §7 audit → T5; §8 testing → T1,T2,T3,T10. All covered.
- **Deferred to Batch 2 (out of scope here):** contact/agent/conversation sync, webhook receiver, `/communications` page, customer-detail Communication section, sync toggles in settings.
- **Verify-before-use flagged** for UI primitive prop names (`StatusBadge`, `FormField`, `PageHeader`, toast lib, wouter route guard) — these vary across the codebase; the steps tell the implementer to grep an existing usage and match.
