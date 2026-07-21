# Loyalty Edit & Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable admins with `loyalty_admin` write permission to edit and soft-delete referrals/discounts/redemptions, plus adjust points/level/code/freeze on Sahabat profiles, all gated by state-aware backend guards and audited.

**Architecture:** Per-table `deleted_at TIMESTAMP NULL` for referrals/discounts/redemptions. New `is_frozen/frozen_reason/frozen_at/frozen_by` on `customer_loyalty`. List endpoints filter `WHERE deleted_at IS NULL` by default with `?includeDeleted=true` override. State guards block destructive actions on terminal-state rows (applied discount, active redemption, rewarded referral). All write endpoints call `logAudit()`. Frontend renders edit/delete controls conditionally on `canWrite("loyalty_admin")`.

**Tech Stack:** Express 5, Drizzle ORM (MySQL), React 18 + TypeScript, TanStack Query 5, shadcn/ui. No automated test suite - verification via `npx tsc --noEmit`, `npm run build`, `curl` smoke tests, browser UI walkthrough.

**Spec:** `docs/superpowers/specs/2026-05-25-loyalty-edit-delete-design.md`

---

## File Structure

**Files modified (no new files):**

| File | Responsibility |
|---|---|
| `shared/schema.ts` (~489-613) | Add columns to `customerLoyalty`, `customerReferrals`, `customerDiscounts`, `pointRedemptions` |
| `server/storage.ts` startup ALTER block (~580-600 area) | Idempotent ALTER for 7 new columns |
| `server/storage.ts` (storage methods) | 9 new methods (3× update*, 3× softDelete*, 4× sahabat profile) + filter `deletedAt IS NULL` in 3 existing get* methods + frozen guard in `rewardReferralsOnFirstPayment` (line ~2003) |
| `server/routes.ts` (~3849-4602) | 10 new endpoints (PUT/DELETE for referrals/discounts/redemptions + 4 sahabat) |
| `client/pages/LoyaltyAdminPage.tsx` (~1008 DiscountRow, ~1219 ReferralsTable, ~1585 PointRedemptionsTab + tab toggles ~340-376) | Edit/Delete dialogs + "Tampilkan terhapus" toggle on 3 tabs |
| `client/components/sahabat/SahabatDetailDrawer.tsx` | "Admin Actions" accordion with 4 sub-forms |

**State machines this plan touches:**
- `customer_referrals.status`: `invited → registered → rewarded` (edit/delete only `invited|registered`)
- `customer_discounts.status`: `pending → applied|cancelled|expired` (edit only `pending`, delete blocks `applied`)
- `point_redemptions.status`: `pending → active → expired` or `pending → cancelled|rejected` (edit only `pending`, delete blocks `active`)

---

## Task 1: Schema columns

**Files:**
- Modify: `shared/schema.ts:489-613`
- Modify: `server/storage.ts` (ALTER block near line ~580-600)

- [ ] **Step 1: Add columns to Drizzle schema**

Edit `shared/schema.ts`:

Add to `customerLoyalty` definition (before `createdAt`):

```ts
  // Admin freeze (v4.4.0)
  isFrozen: int("is_frozen").notNull().default(0),                 // 0/1 - block reward issuance
  frozenReason: varchar("frozen_reason", { length: 255 }),
  frozenAt: text("frozen_at"),
  frozenBy: int("frozen_by"),                                       // user_id staff
```

Add to `pointRedemptions` definition (before `createdAt`):

```ts
  deletedAt: text("deleted_at"),                                    // soft delete
```

Add to `customerDiscounts` definition (before `createdAt`):

```ts
  deletedAt: text("deleted_at"),                                    // soft delete
```

Add to `customerReferrals` definition (before `createdAt`):

```ts
  deletedAt: text("deleted_at"),                                    // soft delete
```

- [ ] **Step 2: Add idempotent ALTER block in storage.ts**

In `server/storage.ts`, find the startup section that runs ALTER statements (near line 580-600 where `users.active_mitra_id` and similar ALTERs run inside the migration loop). Add a new block AFTER the existing ALTERs but BEFORE the seed step.

Pattern to follow - query `information_schema.columns` first to make it idempotent:

```ts
    // ====================
    // Loyalty edit/delete columns (v4.4.0)
    // ====================
    const loyaltyColumnAdditions: Array<{ table: string; column: string; ddl: string }> = [
      { table: "customer_referrals", column: "deleted_at", ddl: "TIMESTAMP NULL DEFAULT NULL" },
      { table: "customer_discounts", column: "deleted_at", ddl: "TIMESTAMP NULL DEFAULT NULL" },
      { table: "point_redemptions",  column: "deleted_at", ddl: "TIMESTAMP NULL DEFAULT NULL" },
      { table: "customer_loyalty",   column: "is_frozen",  ddl: "TINYINT NOT NULL DEFAULT 0" },
      { table: "customer_loyalty",   column: "frozen_reason", ddl: "VARCHAR(255) NULL" },
      { table: "customer_loyalty",   column: "frozen_at",  ddl: "TIMESTAMP NULL DEFAULT NULL" },
      { table: "customer_loyalty",   column: "frozen_by",  ddl: "INT NULL" },
    ];
    for (const { table, column, ddl } of loyaltyColumnAdditions) {
      const [existsRows]: any = await this.pool.execute(
        `SELECT COUNT(*) AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
        [table, column],
      );
      const exists = Number(existsRows[0]?.c ?? 0) > 0;
      if (!exists) {
        await this.pool.execute(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${ddl}`);
        console.log(`[migration] Added ${table}.${column}`);
      }
    }
```

Insert this block at the position right after the existing customer-loyalty/mitra ALTERs and before the seed/index creation calls. Search for an anchor like `await this.pool.execute(\`ALTER TABLE users ADD COLUMN active_mitra_id\`)` and place the new block after the broader ALTER section ends.

- [ ] **Step 3: Run typecheck**

```bash
cd /home/ygao-t580/Works/Jabnet/Website/ftth-tools
npx tsc --noEmit 2>&1 | tail -20
```

Expected: 0 errors.

- [ ] **Step 4: Run dev briefly to confirm migration applies**

```bash
npm run dev &
DEV_PID=$!
sleep 8
kill $DEV_PID 2>/dev/null
```

Expected: log lines `[migration] Added customer_referrals.deleted_at` etc. on first run. Second run: no log lines (idempotent).

- [ ] **Step 5: Commit**

```bash
git add shared/schema.ts server/storage.ts
git commit -m "$(cat <<'EOF'
feat(loyalty): schema columns for soft-delete + sahabat freeze

deleted_at on customer_referrals/customer_discounts/point_redemptions.
is_frozen + frozen_reason/at/by on customer_loyalty.
Idempotent ALTER via information_schema check.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Storage - referrals edit/soft-delete + filter

**Files:**
- Modify: `server/storage.ts` (near `linkReferralToCustomer` ~line 2088)

- [ ] **Step 1: Add update + soft-delete methods**

Locate `linkReferralToCustomer(referralId, customerId, staffUserId)` (around line 2088). Insert these two methods immediately AFTER it:

```ts
  /** Edit manual referral entry - block kalau status sudah 'rewarded' */
  async updateCustomerReferral(
    id: number,
    patch: { refereeName?: string | null; refereePhone?: string | null; notes?: string | null },
  ): Promise<CustomerReferral> {
    const mitraId = getMitraId();
    const [existing] = await this.db.select().from(customerReferrals)
      .where(and(eq(customerReferrals.id, id), eq(customerReferrals.mitraId, mitraId)));
    if (!existing) throw new Error("Referral tidak ditemukan");
    if (existing.status === "rewarded") throw new Error("Referral sudah di-reward, edit tidak diizinkan");

    const updates: Record<string, any> = {};
    if (patch.refereeName !== undefined) updates.refereeName = patch.refereeName;
    if (patch.refereePhone !== undefined) updates.refereePhone = patch.refereePhone;
    if (patch.notes !== undefined) updates.notes = patch.notes;
    if (Object.keys(updates).length === 0) return existing;

    await this.db.update(customerReferrals).set(updates).where(eq(customerReferrals.id, id));
    const [updated] = await this.db.select().from(customerReferrals).where(eq(customerReferrals.id, id));
    return updated!;
  }

  /** Soft delete manual referral - block kalau status sudah 'rewarded' */
  async softDeleteCustomerReferral(id: number): Promise<{ statusAtDelete: string }> {
    const mitraId = getMitraId();
    const [existing] = await this.db.select().from(customerReferrals)
      .where(and(eq(customerReferrals.id, id), eq(customerReferrals.mitraId, mitraId)));
    if (!existing) throw new Error("Referral tidak ditemukan");
    if (existing.status === "rewarded") throw new Error("Referral sudah di-reward, tidak bisa dihapus");

    await this.db.update(customerReferrals)
      .set({ deletedAt: new Date().toISOString() } as any)
      .where(eq(customerReferrals.id, id));
    return { statusAtDelete: existing.status ?? "invited" };
  }
```

- [ ] **Step 2: Add `deletedAt` filter to existing referral list method**

Search `server/storage.ts` for the function that serves `/api/loyalty/admin/referrals`. Likely named `listAdminReferrals` or similar. To find it precisely:

```bash
grep -nE "FROM customer_referrals" /home/ygao-t580/Works/Jabnet/Website/ftth-tools/server/storage.ts | head
```

Locate the admin list method (the one returning all referrals with referrer name lookup - around line 2509-2540 based on earlier grep showing `cr.mitra_id = ${mitraId}` joins).

In that method, find the `WHERE cr.mitra_id = ${mitraId}` clause and add `AND (cr.deleted_at IS NULL OR ${includeDeleted ? 1 : 0} = 1)`. Wrap method signature to accept `options?: { includeDeleted?: boolean }`:

```ts
async listAdminReferrals(options?: { includeDeleted?: boolean }): Promise<any[]> {
  const mitraId = getMitraId();
  const includeDeleted = options?.includeDeleted ? 1 : 0;
  const rows: any = await this.db.execute(sql`
    SELECT cr.id, cr.referrer_customer_id AS referrerCustomerId, ...existing fields...,
           cr.deleted_at AS deletedAt
    FROM customer_referrals cr
    LEFT JOIN customers c ON c.id = cr.referrer_customer_id
    WHERE cr.mitra_id = ${mitraId}
      AND (cr.deleted_at IS NULL OR ${includeDeleted} = 1)
    ORDER BY cr.created_at DESC
    LIMIT 500
  `);
  return rows[0] as any[];
}
```

**Note:** Preserve the exact existing SELECT field list - only add `cr.deleted_at AS deletedAt` and the `AND (cr.deleted_at IS NULL OR ${includeDeleted} = 1)` clause. Do not rewrite the rest of the query.

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit 2>&1 | tail -10
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add server/storage.ts
git commit -m "$(cat <<'EOF'
feat(loyalty): storage methods for referral edit + soft-delete

updateCustomerReferral blocks status='rewarded'. List method filters
deleted_at IS NULL by default with includeDeleted override.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Storage - discounts edit/soft-delete + filter

**Files:**
- Modify: `server/storage.ts` (near `getCustomerDiscounts` ~line 1907)

- [ ] **Step 1: Add update + soft-delete methods**

Locate `getCustomerDiscounts` (line 1907). Find the end of that method, then insert these two methods after it:

```ts
  /** Edit discount - hanya status 'pending' yang boleh edit */
  async updateCustomerDiscount(
    id: number,
    patch: {
      discountType?: "voucher_indomaret" | "free_days" | "percent" | "cash_bonus" | "speed_upgrade";
      discountValue?: number;
      source?: string;
      description?: string | null;
    },
  ): Promise<CustomerDiscount> {
    const mitraId = getMitraId();
    const [existing] = await this.db.select().from(customerDiscounts)
      .where(and(eq(customerDiscounts.id, id), eq(customerDiscounts.mitraId, mitraId)));
    if (!existing) throw new Error("Diskon tidak ditemukan");
    if (existing.status !== "pending") throw new Error(`Diskon status='${existing.status}' tidak bisa di-edit (hanya 'pending' yang boleh)`);

    const updates: Record<string, any> = {};
    if (patch.discountType !== undefined) updates.discountType = patch.discountType;
    if (patch.discountValue !== undefined) updates.discountValue = patch.discountValue;
    if (patch.source !== undefined) updates.source = patch.source;
    if (patch.description !== undefined) updates.description = patch.description;
    if (Object.keys(updates).length === 0) return existing;

    await this.db.update(customerDiscounts).set(updates).where(eq(customerDiscounts.id, id));
    const [updated] = await this.db.select().from(customerDiscounts).where(eq(customerDiscounts.id, id));
    return updated!;
  }

  /** Soft delete discount - block 'applied' (uang sudah keluar) */
  async softDeleteCustomerDiscount(id: number): Promise<{ statusAtDelete: string }> {
    const mitraId = getMitraId();
    const [existing] = await this.db.select().from(customerDiscounts)
      .where(and(eq(customerDiscounts.id, id), eq(customerDiscounts.mitraId, mitraId)));
    if (!existing) throw new Error("Diskon tidak ditemukan");
    if (existing.status === "applied") throw new Error("Diskon status='applied' tidak bisa dihapus (uang sudah keluar)");

    await this.db.update(customerDiscounts)
      .set({ deletedAt: new Date().toISOString() } as any)
      .where(eq(customerDiscounts.id, id));
    return { statusAtDelete: existing.status ?? "pending" };
  }
```

- [ ] **Step 2: Add `deletedAt` filter to `getCustomerDiscounts`**

In the existing `getCustomerDiscounts` method, modify the signature and `where` clause:

```ts
async getCustomerDiscounts(
  customerId: number,
  options?: { status?: string; limit?: number; includeDeleted?: boolean },
): Promise<CustomerDiscount[]> {
  // ...existing code with where clauses...
  const conds = [eq(customerDiscounts.customerId, customerId)];
  if (options?.status) conds.push(eq(customerDiscounts.status, options.status));
  if (!options?.includeDeleted) conds.push(isNull(customerDiscounts.deletedAt));
  // ...rest unchanged
}
```

Make sure `isNull` is imported from `drizzle-orm`. Check the current imports - likely already imported. If not, add `isNull` to the existing import line.

- [ ] **Step 3: Find and update admin discounts list method**

```bash
grep -nE "(listAdminDiscounts|getAdminDiscounts|getDiscountsAll|admin.*discount)" /home/ygao-t580/Works/Jabnet/Website/ftth-tools/server/storage.ts | head -10
```

Apply the same `includeDeleted` parameter pattern. If no separate admin list method exists and the route uses `getCustomerDiscounts` directly with no customerId filter, look at route handler at `routes.ts:3798` (`GET /api/loyalty/admin/discounts`) to see what storage method it calls. Apply filter accordingly.

- [ ] **Step 4: Typecheck + commit**

```bash
npx tsc --noEmit 2>&1 | tail -10
git add server/storage.ts
git commit -m "$(cat <<'EOF'
feat(loyalty): storage methods for discount edit + soft-delete

updateCustomerDiscount only allows status='pending'. softDelete blocks
'applied'. List filters deleted_at IS NULL with includeDeleted override.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Storage - redemptions edit/soft-delete + filter

**Files:**
- Modify: `server/storage.ts`

- [ ] **Step 1: Locate redemption methods**

```bash
grep -nE "async (verifyPointRedemption|cancelPointRedemption|rejectPointRedemption|listPointRedemptions|getPointRedemptions)" /home/ygao-t580/Works/Jabnet/Website/ftth-tools/server/storage.ts
```

Note the line numbers. The list/get method is where you'll add the `includeDeleted` filter; the cancel method holds the refund logic to reuse.

- [ ] **Step 2: Add update + soft-delete methods**

Insert after the existing cancel/reject methods:

```ts
  /** Edit redemption - hanya status 'pending' (sebelum verify → MikroTik apply) */
  async updatePointRedemption(
    id: number,
    patch: { rewardKey?: string; rewardLabel?: string; speedMultiplier?: number; durationHours?: number; pointsCost?: number; notes?: string | null },
  ): Promise<PointRedemption> {
    const mitraId = getMitraId();
    const [existing] = await this.db.select().from(pointRedemptions)
      .where(and(eq(pointRedemptions.id, id), eq(pointRedemptions.mitraId, mitraId)));
    if (!existing) throw new Error("Redemption tidak ditemukan");
    if (existing.status !== "pending") throw new Error(`Redemption status='${existing.status}' tidak bisa di-edit (hanya 'pending' yang boleh)`);

    const updates: Record<string, any> = {};
    if (patch.rewardKey !== undefined) updates.rewardKey = patch.rewardKey;
    if (patch.rewardLabel !== undefined) updates.rewardLabel = patch.rewardLabel;
    if (patch.speedMultiplier !== undefined) updates.speedMultiplier = patch.speedMultiplier;
    if (patch.durationHours !== undefined) updates.durationHours = patch.durationHours;
    if (patch.pointsCost !== undefined) updates.pointsCost = patch.pointsCost;
    if (patch.notes !== undefined) updates.notes = patch.notes;
    if (Object.keys(updates).length === 0) return existing;

    await this.db.update(pointRedemptions).set(updates).where(eq(pointRedemptions.id, id));
    const [updated] = await this.db.select().from(pointRedemptions).where(eq(pointRedemptions.id, id));
    return updated!;
  }

  /** Soft delete redemption - block status 'active'.
   * Pending → auto-refund poin sebelum soft-delete.
   * Cancelled/expired/rejected → langsung soft-delete (sudah di-refund saat lifecycle action). */
  async softDeletePointRedemption(
    id: number,
    staffUserId: number,
    reason?: string,
  ): Promise<{ statusAtDelete: string; refunded: boolean }> {
    const mitraId = getMitraId();
    const [existing] = await this.db.select().from(pointRedemptions)
      .where(and(eq(pointRedemptions.id, id), eq(pointRedemptions.mitraId, mitraId)));
    if (!existing) throw new Error("Redemption tidak ditemukan");
    if (existing.status === "active") throw new Error("Redemption 'active' tidak bisa dihapus - cancel dulu untuk revert MikroTik");

    let refunded = false;
    if (existing.status === "pending") {
      // Refund poin yang sempat di-deduct saat create redemption
      const [loyalty] = await this.db.select().from(customerLoyalty)
        .where(eq(customerLoyalty.customerId, existing.customerId));
      const currentBalance = Number((loyalty as any)?.pointsBalance ?? 0);
      const refundAmount = existing.pointsCost;
      const newBalance = currentBalance + refundAmount;
      await this.db.update(customerLoyalty)
        .set({ pointsBalance: newBalance, updatedAt: new Date().toISOString() } as any)
        .where(eq(customerLoyalty.customerId, existing.customerId));
      await this.db.insert(pointTransactions).values({
        mitraId,
        customerId: existing.customerId,
        type: "refund",
        amount: refundAmount,
        source: "refund_redemption",
        refId: id,
        balanceAfter: newBalance,
        notes: `Refund karena redemption #${id} dihapus admin. ${reason ?? ""}`.trim(),
        createdBy: staffUserId,
        createdAt: new Date().toISOString(),
      } as any);
      refunded = true;
    }

    await this.db.update(pointRedemptions)
      .set({ deletedAt: new Date().toISOString() } as any)
      .where(eq(pointRedemptions.id, id));

    return { statusAtDelete: existing.status ?? "pending", refunded };
  }
```

- [ ] **Step 3: Add filter to existing redemption list method**

Find the method serving `/api/loyalty/admin/points/redemptions` (likely `listPointRedemptionsAdmin` or similar - locate via `grep -n "FROM point_redemptions" server/storage.ts`). Add `includeDeleted` to its options:

```ts
async listPointRedemptionsAdmin(options?: { status?: string; includeDeleted?: boolean }): Promise<PointRedemption[]> {
  const mitraId = getMitraId();
  const conds = [eq(pointRedemptions.mitraId, mitraId)];
  if (options?.status) conds.push(eq(pointRedemptions.status, options.status));
  if (!options?.includeDeleted) conds.push(isNull(pointRedemptions.deletedAt));
  return await this.db.select().from(pointRedemptions).where(and(...conds)).orderBy(desc(pointRedemptions.createdAt)).limit(500);
}
```

If the existing method already takes `options` with `status` only - extend its signature with `includeDeleted` and add `if (!options?.includeDeleted) conds.push(isNull(pointRedemptions.deletedAt))` to the where conditions. Preserve all existing fields/joins.

Confirm `isNull` is imported from `drizzle-orm` at top of file. If not, add to existing import line.

- [ ] **Step 4: Typecheck + commit**

```bash
npx tsc --noEmit 2>&1 | tail -10
git add server/storage.ts
git commit -m "$(cat <<'EOF'
feat(loyalty): storage methods for redemption edit + soft-delete

updatePointRedemption only allows status='pending'. softDelete blocks
'active' (requires cancel for MikroTik revert). Pending soft-delete
auto-refunds points + records point_transactions row source=refund_redemption.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Storage - Sahabat profile (4 methods)

**Files:**
- Modify: `server/storage.ts`

- [ ] **Step 1: Locate Sahabat tier method as anchor**

```bash
grep -nE "async (setSahabatTier|upgradeSahabatTier|refreshSahabatLevel)" /home/ygao-t580/Works/Jabnet/Website/ftth-tools/server/storage.ts | head
```

Insert the 4 new methods after the existing tier/refresh-level methods (consolidated section).

- [ ] **Step 2: Add `adjustSahabatPoints` method**

```ts
  /** Atomic points adjust dengan reason - block kalau result < 0.
   * Tulis row di point_transactions source='manual_adjust'. */
  async adjustSahabatPoints(
    customerId: number,
    delta: number,
    reason: string,
    staffUserId: number,
  ): Promise<{ before: number; after: number }> {
    if (!Number.isFinite(delta) || delta === 0) throw new Error("Delta harus angka != 0");
    if (!reason || reason.trim().length < 3) throw new Error("Alasan wajib diisi (min 3 karakter)");

    const mitraId = getMitraId();
    await this.getOrCreateCustomerLoyalty(customerId);

    // Atomic guard: only succeed if result balance >= 0
    const result: any = await this.db.execute(sql`
      UPDATE customer_loyalty
      SET points_balance = points_balance + ${delta},
          updated_at = ${new Date().toISOString()}
      WHERE customer_id = ${customerId}
        AND mitra_id = ${mitraId}
        AND (points_balance + ${delta}) >= 0
    `);
    const affected = Number(result?.[0]?.affectedRows ?? 0);
    if (affected === 0) throw new Error("Balance tidak cukup untuk pengurangan ini");

    const [updated] = await this.db.select().from(customerLoyalty)
      .where(eq(customerLoyalty.customerId, customerId));
    const after = Number((updated as any).pointsBalance ?? 0);
    const before = after - delta;

    await this.db.insert(pointTransactions).values({
      mitraId,
      customerId,
      type: "adjust",
      amount: delta,
      source: "manual_adjust",
      balanceAfter: after,
      notes: reason.trim(),
      createdBy: staffUserId,
      createdAt: new Date().toISOString(),
    } as any);

    return { before, after };
  }
```

- [ ] **Step 3: Add `setSahabatLevel` method**

```ts
  /** Override sahabat level (admin manual). Tier tetap pakai endpoint tier existing. */
  async setSahabatLevel(
    customerId: number,
    level: "new" | "perunggu" | "perak" | "emas" | "platinum" | "berlian" | "ambassador",
    reason: string,
  ): Promise<{ from: string; to: string }> {
    const validLevels = ["new", "perunggu", "perak", "emas", "platinum", "berlian", "ambassador"];
    if (!validLevels.includes(level)) throw new Error(`Level '${level}' tidak valid`);
    if (!reason || reason.trim().length < 3) throw new Error("Alasan wajib diisi (min 3 karakter)");

    const mitraId = getMitraId();
    const loyalty = await this.getOrCreateCustomerLoyalty(customerId);
    const from = (loyalty as any).sahabatLevel ?? "new";

    await this.db.update(customerLoyalty)
      .set({ sahabatLevel: level, updatedAt: new Date().toISOString() } as any)
      .where(and(eq(customerLoyalty.customerId, customerId), eq(customerLoyalty.mitraId, mitraId)));

    return { from, to: level };
  }
```

- [ ] **Step 4: Add `setSahabatCode` method**

```ts
  /** Rename sahabatCode - validate regex + unique. Update referralCode legacy alias same value. */
  async setSahabatCode(
    customerId: number,
    newCode: string,
  ): Promise<{ from: string | null; to: string }> {
    const codeRegex = /^SHB-[A-Z]{3}-\d{3}$/;
    if (!codeRegex.test(newCode)) throw new Error("Format kode harus SHB-XXX-NNN (XXX = 3 huruf kapital, NNN = 3 digit)");

    const mitraId = getMitraId();
    const loyalty = await this.getOrCreateCustomerLoyalty(customerId);
    const from = (loyalty as any).sahabatCode ?? null;
    if (from === newCode) return { from, to: newCode };

    // Unique check (skip current customer)
    const [conflict] = await this.db.select().from(customerLoyalty)
      .where(and(eq(customerLoyalty.sahabatCode, newCode)));
    if (conflict && (conflict as any).customerId !== customerId) {
      throw new Error(`Kode ${newCode} sudah dipakai customer lain`);
    }

    await this.db.update(customerLoyalty)
      .set({ sahabatCode: newCode, referralCode: newCode, updatedAt: new Date().toISOString() } as any)
      .where(and(eq(customerLoyalty.customerId, customerId), eq(customerLoyalty.mitraId, mitraId)));

    return { from, to: newCode };
  }
```

- [ ] **Step 5: Add `setSahabatFrozen` method**

```ts
  /** Toggle freeze. Saat frozen=true, reward issuance flow akan skip akun ini. */
  async setSahabatFrozen(
    customerId: number,
    frozen: boolean,
    reason: string | null,
    staffUserId: number,
  ): Promise<{ wasFrozen: boolean; isFrozen: boolean }> {
    if (frozen && (!reason || reason.trim().length < 3)) {
      throw new Error("Alasan wajib diisi saat freeze (min 3 karakter)");
    }

    const mitraId = getMitraId();
    const loyalty = await this.getOrCreateCustomerLoyalty(customerId);
    const wasFrozen = Number((loyalty as any).isFrozen ?? 0) === 1;

    await this.db.update(customerLoyalty)
      .set({
        isFrozen: frozen ? 1 : 0,
        frozenReason: frozen ? reason!.trim() : null,
        frozenAt: frozen ? new Date().toISOString() : null,
        frozenBy: frozen ? staffUserId : null,
        updatedAt: new Date().toISOString(),
      } as any)
      .where(and(eq(customerLoyalty.customerId, customerId), eq(customerLoyalty.mitraId, mitraId)));

    return { wasFrozen, isFrozen: frozen };
  }
```

- [ ] **Step 6: Typecheck + commit**

```bash
npx tsc --noEmit 2>&1 | tail -10
git add server/storage.ts
git commit -m "$(cat <<'EOF'
feat(loyalty): storage methods for sahabat profile admin actions

adjustSahabatPoints (atomic, blocks negative balance, writes
point_transactions). setSahabatLevel, setSahabatCode (regex + unique),
setSahabatFrozen (with reason guard).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Frozen guard - block reward issuance

**Files:**
- Modify: `server/storage.ts:2003-2085` (function `rewardReferralsOnFirstPayment`)

- [ ] **Step 1: Add frozen guard inside referral reward loop**

In `rewardReferralsOnFirstPayment`, between the `for (const r of rows)` start and the existing `await this.db.update(customerReferrals)` (line 2022), add a frozen check. The referrer is `r.referrerCustomerId`:

```ts
    for (const r of rows) {
      // Frozen guard - skip reward issuance kalau referrer freeze (admin manual action)
      const [referrerCheck] = await this.db.select().from(customerLoyalty)
        .where(eq(customerLoyalty.customerId, r.referrerCustomerId));
      if (referrerCheck && Number((referrerCheck as any).isFrozen ?? 0) === 1) {
        console.log(`[Sahabat] ⏸ Referral #${r.id} skip reward - referrer #${r.referrerCustomerId} is frozen: ${(referrerCheck as any).frozenReason ?? "no reason"}`);
        continue;
      }

      // ...existing code unchanged starting at: await this.db.update(customerReferrals)...
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit 2>&1 | tail -10
git add server/storage.ts
git commit -m "$(cat <<'EOF'
feat(loyalty): skip referral reward issuance for frozen accounts

rewardReferralsOnFirstPayment checks customer_loyalty.is_frozen for
referrer; if frozen, log + continue (referee tetap registered, tapi
voucher referrer + welcome bonus referee tidak issue).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Routes - referrals PUT/DELETE

**Files:**
- Modify: `server/routes.ts` (insert after `POST /api/loyalty/admin/referrals/:id/link` at line ~3941-3955)

- [ ] **Step 1: Add 2 new endpoints**

Insert immediately after the closing brace of `router.post("/api/loyalty/admin/referrals/:id/link", ...)`:

```ts
/** PUT /api/loyalty/admin/referrals/:id - edit referee name/phone/notes (block rewarded) */
router.put("/api/loyalty/admin/referrals/:id", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  if (!hasWritePermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak (write)", 403);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return sendError(res, "ID invalid", 400);
  try {
    const { refereeName, refereePhone, notes } = req.body || {};
    const updated = await storage.updateCustomerReferral(id, { refereeName, refereePhone, notes });
    await logAudit(req, "UPDATE", "loyalty_referral", id, updated.refereeName ?? `#${id}`, {
      refereeName, refereePhone, notes,
    });
    res.json(updated);
  } catch (e: any) {
    const status = String(e?.message ?? "").includes("tidak diizinkan") ? 409 :
                   String(e?.message ?? "").includes("tidak ditemukan") ? 404 : 400;
    sendError(res, e?.message ?? "Update gagal", status);
  }
});

/** DELETE /api/loyalty/admin/referrals/:id - soft delete (block rewarded) */
router.delete("/api/loyalty/admin/referrals/:id", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  if (!hasWritePermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak (write)", 403);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return sendError(res, "ID invalid", 400);
  try {
    const reason = String(req.body?.reason ?? "").trim() || null;
    const { statusAtDelete } = await storage.softDeleteCustomerReferral(id);
    await logAudit(req, "DELETE", "loyalty_referral", id, `#${id}`, { reason, statusAtDelete });
    res.json({ success: true });
  } catch (e: any) {
    const status = String(e?.message ?? "").includes("tidak bisa dihapus") ? 409 :
                   String(e?.message ?? "").includes("tidak ditemukan") ? 404 : 400;
    sendError(res, e?.message ?? "Hapus gagal", status);
  }
});
```

- [ ] **Step 2: Update existing list endpoint to pass `includeDeleted`**

Find `router.get("/api/loyalty/admin/referrals", ...)` (~line 3849). Modify the storage call:

```ts
router.get("/api/loyalty/admin/referrals", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  if (!hasPermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak", 403);
  try {
    const includeDeleted = req.query.includeDeleted === "true";
    const rows = await storage.listAdminReferrals({ includeDeleted });
    res.json(rows);
  } catch (e: any) {
    sendError(res, e?.message ?? "Gagal load referrals");
  }
});
```

Adjust storage method name if you used a different one in Task 2.

- [ ] **Step 3: Typecheck + smoke test with curl**

```bash
npx tsc --noEmit 2>&1 | tail -10
npm run dev &
DEV_PID=$!
sleep 8

# Get admin token (assuming admin/Admin@1234 default)
TOKEN=$(curl -sS -X POST http://localhost:3002/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"Admin@1234"}' | grep -oE '"token":"[^"]+"' | cut -d'"' -f4)
echo "Token: $TOKEN"

# List referrals (default - no deleted)
curl -sS http://localhost:3002/api/loyalty/admin/referrals \
  -H "Authorization: Bearer $TOKEN" | head -c 500
echo

# Try edit on non-existent ID → expect 404
curl -sS -X PUT http://localhost:3002/api/loyalty/admin/referrals/999999 \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"refereeName":"Test"}'
echo

kill $DEV_PID 2>/dev/null
```

Expected: list works, edit/delete on missing ID → 404 with error message.

- [ ] **Step 4: Commit**

```bash
git add server/routes.ts
git commit -m "$(cat <<'EOF'
feat(loyalty): PUT/DELETE /api/loyalty/admin/referrals/:id

Edit blocks status='rewarded' (409). Soft delete same guard.
List endpoint accepts ?includeDeleted=true.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Routes - discounts PUT/DELETE

**Files:**
- Modify: `server/routes.ts` (insert after `POST /api/loyalty/admin/discounts/:id/cancel` at line ~3824-3836)

- [ ] **Step 1: Add 2 new endpoints**

Insert after the `/cancel` route closes:

```ts
/** PUT /api/loyalty/admin/discounts/:id - edit type/value/source/description (status='pending' only) */
router.put("/api/loyalty/admin/discounts/:id", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  if (!hasWritePermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak (write)", 403);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return sendError(res, "ID invalid", 400);
  try {
    const { discountType, discountValue, source, description } = req.body || {};
    const updated = await storage.updateCustomerDiscount(id, { discountType, discountValue, source, description });
    await logAudit(req, "UPDATE", "loyalty_discount", id, `#${id}`, {
      discountType, discountValue, source, description,
    });
    res.json(updated);
  } catch (e: any) {
    const status = String(e?.message ?? "").includes("tidak bisa di-edit") ? 409 :
                   String(e?.message ?? "").includes("tidak ditemukan") ? 404 : 400;
    sendError(res, e?.message ?? "Update gagal", status);
  }
});

/** DELETE /api/loyalty/admin/discounts/:id - soft delete (block status='applied') */
router.delete("/api/loyalty/admin/discounts/:id", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  if (!hasWritePermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak (write)", 403);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return sendError(res, "ID invalid", 400);
  try {
    const reason = String(req.body?.reason ?? "").trim() || null;
    const { statusAtDelete } = await storage.softDeleteCustomerDiscount(id);
    await logAudit(req, "DELETE", "loyalty_discount", id, `#${id}`, { reason, statusAtDelete });
    res.json({ success: true });
  } catch (e: any) {
    const status = String(e?.message ?? "").includes("tidak bisa dihapus") ? 409 :
                   String(e?.message ?? "").includes("tidak ditemukan") ? 404 : 400;
    sendError(res, e?.message ?? "Hapus gagal", status);
  }
});
```

- [ ] **Step 2: Update existing discounts list endpoint to support `includeDeleted`**

Find `router.get("/api/loyalty/admin/discounts", ...)` (~line 3798). Add query param pass-through:

```ts
router.get("/api/loyalty/admin/discounts", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  if (!hasPermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak", 403);
  try {
    const status = String(req.query.status ?? "");
    const includeDeleted = req.query.includeDeleted === "true";
    // Adjust storage call to match actual method signature - pass includeDeleted
    const rows = await storage.listAdminDiscounts({ status: status || undefined, includeDeleted });
    res.json(rows);
  } catch (e: any) {
    sendError(res, e?.message ?? "Gagal load discounts");
  }
});
```

If the existing route calls a different storage method (e.g., raw SQL inline), modify that method to accept `includeDeleted` and apply `AND (deleted_at IS NULL OR <includeDeleted> = 1)` in its where clause.

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit 2>&1 | tail -10
git add server/routes.ts server/storage.ts
git commit -m "$(cat <<'EOF'
feat(loyalty): PUT/DELETE /api/loyalty/admin/discounts/:id

Edit only 'pending'. Soft delete blocks 'applied'. List accepts
?includeDeleted=true for audit recovery.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Routes - redemptions PUT/DELETE

**Files:**
- Modify: `server/routes.ts` (insert after `POST .../points/redemptions/:id/cancel` at line ~4331-4350)

- [ ] **Step 1: Add 2 new endpoints**

```ts
/** PUT /api/loyalty/admin/points/redemptions/:id - edit boost params (status='pending' only) */
router.put("/api/loyalty/admin/points/redemptions/:id", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  if (!hasWritePermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak (write)", 403);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return sendError(res, "ID invalid", 400);
  try {
    const { rewardKey, rewardLabel, speedMultiplier, durationHours, pointsCost, notes } = req.body || {};
    const updated = await storage.updatePointRedemption(id, { rewardKey, rewardLabel, speedMultiplier, durationHours, pointsCost, notes });
    await logAudit(req, "UPDATE", "loyalty_redemption", id, updated.rewardLabel ?? `#${id}`, {
      rewardKey, rewardLabel, speedMultiplier, durationHours, pointsCost, notes,
    });
    res.json(updated);
  } catch (e: any) {
    const status = String(e?.message ?? "").includes("tidak bisa di-edit") ? 409 :
                   String(e?.message ?? "").includes("tidak ditemukan") ? 404 : 400;
    sendError(res, e?.message ?? "Update gagal", status);
  }
});

/** DELETE /api/loyalty/admin/points/redemptions/:id - soft delete (block 'active', auto-refund pending) */
router.delete("/api/loyalty/admin/points/redemptions/:id", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  if (!hasWritePermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak (write)", 403);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return sendError(res, "ID invalid", 400);
  try {
    const reason = String(req.body?.reason ?? "").trim() || null;
    const { statusAtDelete, refunded } = await storage.softDeletePointRedemption(id, req.authUser!.id, reason ?? undefined);
    await logAudit(req, "DELETE", "loyalty_redemption", id, `#${id}`, { reason, statusAtDelete, refunded });
    res.json({ success: true, refunded });
  } catch (e: any) {
    const status = String(e?.message ?? "").includes("tidak bisa dihapus") || String(e?.message ?? "").includes("'active'") ? 409 :
                   String(e?.message ?? "").includes("tidak ditemukan") ? 404 : 400;
    sendError(res, e?.message ?? "Hapus gagal", status);
  }
});
```

- [ ] **Step 2: Update existing list endpoint**

Find `router.get("/api/loyalty/admin/points/redemptions", ...)` (~line 4231). Modify to thread `includeDeleted`:

```ts
router.get("/api/loyalty/admin/points/redemptions", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  if (!hasPermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak", 403);
  try {
    const status = String(req.query.status ?? "");
    const includeDeleted = req.query.includeDeleted === "true";
    const rows = await storage.listPointRedemptionsAdmin({ status: status || undefined, includeDeleted });
    res.json(rows);
  } catch (e: any) {
    sendError(res, e?.message ?? "Gagal load redemptions");
  }
});
```

Match the actual storage method name from Task 4 Step 3.

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit 2>&1 | tail -10
git add server/routes.ts server/storage.ts
git commit -m "$(cat <<'EOF'
feat(loyalty): PUT/DELETE /api/loyalty/admin/points/redemptions/:id

Edit only 'pending'. Soft delete blocks 'active' (must cancel first
for MikroTik revert). Pending soft-delete auto-refunds points.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Routes - Sahabat profile 4 endpoints

**Files:**
- Modify: `server/routes.ts` (insert after `POST .../sahabat/:customerId/tier` at line ~4195-4218)

- [ ] **Step 1: Add 4 endpoints**

Insert after the closing brace of the `/tier` route:

```ts
/** POST /api/loyalty/admin/sahabat/:customerId/points-adjust - adjust points balance (delta + reason) */
router.post("/api/loyalty/admin/sahabat/:customerId/points-adjust", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  if (!hasWritePermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak (write)", 403);
  const customerId = Number(req.params.customerId);
  if (!Number.isFinite(customerId)) return sendError(res, "Customer ID invalid", 400);
  try {
    const delta = Number(req.body?.delta);
    const reason = String(req.body?.reason ?? "").trim();
    if (!Number.isFinite(delta) || delta === 0) return sendError(res, "Delta harus angka != 0", 400);
    if (reason.length < 3) return sendError(res, "Alasan wajib (min 3 karakter)", 400);
    const result = await storage.adjustSahabatPoints(customerId, delta, reason, req.authUser!.id);
    await logAudit(req, "ADJUST", "sahabat_points", customerId, `#${customerId}`, {
      delta, reason, before: result.before, after: result.after,
    });
    res.json(result);
  } catch (e: any) {
    const status = String(e?.message ?? "").includes("Balance tidak cukup") ? 409 : 400;
    sendError(res, e?.message ?? "Adjust gagal", status);
  }
});

/** POST /api/loyalty/admin/sahabat/:customerId/level - override sahabat level */
router.post("/api/loyalty/admin/sahabat/:customerId/level", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  if (!hasWritePermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak (write)", 403);
  const customerId = Number(req.params.customerId);
  if (!Number.isFinite(customerId)) return sendError(res, "Customer ID invalid", 400);
  try {
    const level = String(req.body?.level ?? "");
    const reason = String(req.body?.reason ?? "").trim();
    const result = await storage.setSahabatLevel(customerId, level as any, reason);
    await logAudit(req, "UPDATE", "sahabat_level", customerId, `#${customerId}`, {
      from: result.from, to: result.to, reason,
    });
    res.json(result);
  } catch (e: any) {
    sendError(res, e?.message ?? "Set level gagal", 400);
  }
});

/** POST /api/loyalty/admin/sahabat/:customerId/code - rename sahabatCode */
router.post("/api/loyalty/admin/sahabat/:customerId/code", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  if (!hasWritePermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak (write)", 403);
  const customerId = Number(req.params.customerId);
  if (!Number.isFinite(customerId)) return sendError(res, "Customer ID invalid", 400);
  try {
    const sahabatCode = String(req.body?.sahabatCode ?? "");
    const result = await storage.setSahabatCode(customerId, sahabatCode);
    await logAudit(req, "UPDATE", "sahabat_code", customerId, `#${customerId}`, {
      from: result.from, to: result.to,
    });
    res.json(result);
  } catch (e: any) {
    const status = String(e?.message ?? "").includes("sudah dipakai") ? 409 : 400;
    sendError(res, e?.message ?? "Set code gagal", status);
  }
});

/** POST /api/loyalty/admin/sahabat/:customerId/freeze - toggle freeze flag */
router.post("/api/loyalty/admin/sahabat/:customerId/freeze", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  if (!hasWritePermission(req, "loyalty_admin")) return sendError(res, "Akses ditolak (write)", 403);
  const customerId = Number(req.params.customerId);
  if (!Number.isFinite(customerId)) return sendError(res, "Customer ID invalid", 400);
  try {
    const frozen = Boolean(req.body?.frozen);
    const reason = req.body?.reason ? String(req.body.reason).trim() : null;
    const result = await storage.setSahabatFrozen(customerId, frozen, reason, req.authUser!.id);
    await logAudit(req, frozen ? "FREEZE" : "UNFREEZE", "sahabat_account", customerId, `#${customerId}`, { reason });
    res.json(result);
  } catch (e: any) {
    sendError(res, e?.message ?? "Toggle freeze gagal", 400);
  }
});
```

- [ ] **Step 2: Typecheck + smoke test**

```bash
npx tsc --noEmit 2>&1 | tail -10
npm run dev &
DEV_PID=$!
sleep 8

TOKEN=$(curl -sS -X POST http://localhost:3002/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"Admin@1234"}' | grep -oE '"token":"[^"]+"' | cut -d'"' -f4)

# Find a customer ID with loyalty record
CUSTID=$(curl -sS "http://localhost:3002/api/loyalty/admin/leaderboard?limit=1" \
  -H "Authorization: Bearer $TOKEN" | grep -oE '"customerId":[0-9]+' | head -1 | cut -d: -f2)
echo "Test customer: $CUSTID"

# Adjust points +100
curl -sS -X POST "http://localhost:3002/api/loyalty/admin/sahabat/$CUSTID/points-adjust" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"delta":100,"reason":"test smoke +100"}'
echo

# Adjust -50
curl -sS -X POST "http://localhost:3002/api/loyalty/admin/sahabat/$CUSTID/points-adjust" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"delta":-50,"reason":"test smoke -50"}'
echo

# Freeze
curl -sS -X POST "http://localhost:3002/api/loyalty/admin/sahabat/$CUSTID/freeze" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"frozen":true,"reason":"smoke test freeze"}'
echo

# Unfreeze
curl -sS -X POST "http://localhost:3002/api/loyalty/admin/sahabat/$CUSTID/freeze" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"frozen":false}'
echo

kill $DEV_PID 2>/dev/null
```

Expected: 4 successful JSON responses. Verify in mysql: `SELECT points_balance, is_frozen FROM customer_loyalty WHERE customer_id=$CUSTID` shows +50 (net) and `is_frozen=0` after roundtrip.

- [ ] **Step 3: Commit**

```bash
git add server/routes.ts
git commit -m "$(cat <<'EOF'
feat(loyalty): sahabat profile admin endpoints

POST points-adjust, level, code, freeze. All hasWritePermission
loyalty_admin, all audited with diff payload.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Frontend - DiscountRow edit/delete

**Files:**
- Modify: `client/pages/LoyaltyAdminPage.tsx:1008-1100` (DiscountRow function) + parent at ~115-180 (state + mutations)

- [ ] **Step 1: Add edit/delete state to parent component**

In `LoyaltyAdminPage` function (top, near `applyFor`/`cancelFor` state at lines 115-117), add:

```tsx
  const [editDiscountFor, setEditDiscountFor] = useState<any | null>(null);
  const [deleteDiscountFor, setDeleteDiscountFor] = useState<any | null>(null);
  const [editDiscountForm, setEditDiscountForm] = useState({ discountType: "", discountValue: 0, source: "", description: "" });
  const [deleteDiscountReason, setDeleteDiscountReason] = useState("");
```

Near existing `applyMut`/`cancelMut` mutations (lines 154-172), add:

```tsx
  const editDiscountMut = useMutation({
    mutationFn: (data: { id: number; patch: any }) =>
      api.put(`/loyalty/admin/discounts/${data.id}`, data.patch),
    onSuccess: () => {
      toast.success("Diskon diperbarui");
      qc.invalidateQueries({ queryKey: ["loyalty-discounts"] });
      setEditDiscountFor(null);
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? "Gagal update"),
  });

  const deleteDiscountMut = useMutation({
    mutationFn: (data: { id: number; reason?: string }) =>
      api.delete(`/loyalty/admin/discounts/${data.id}`, { data: { reason: data.reason } }),
    onSuccess: () => {
      toast.success("Diskon dihapus");
      qc.invalidateQueries({ queryKey: ["loyalty-discounts"] });
      setDeleteDiscountFor(null);
      setDeleteDiscountReason("");
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? "Gagal hapus"),
  });
```

Note: confirm the existing `qc` variable name (likely `queryClient`) - match what the file uses. Same for `api.put`/`api.delete` patterns - check existing mutations for the actual helper.

- [ ] **Step 2: Pass props to DiscountRow + wire up trigger**

Find the JSX in the discounts tab (~line 356) where `<DiscountRow>` is rendered:

```tsx
<DiscountRow key={d.id} d={d} canEdit={canEdit}
  onApply={() => { setApplyFor(d); setInvoiceRef(""); }}
  onCancel={() => { setCancelFor(d); setCancelReason(""); }}
/>
```

Change to:

```tsx
<DiscountRow key={d.id} d={d} canEdit={canEdit}
  onApply={() => { setApplyFor(d); setInvoiceRef(""); }}
  onCancel={() => { setCancelFor(d); setCancelReason(""); }}
  onEdit={() => {
    setEditDiscountFor(d);
    setEditDiscountForm({
      discountType: d.discountType ?? "",
      discountValue: d.discountValue ?? 0,
      source: d.source ?? "",
      description: d.description ?? "",
    });
  }}
  onDelete={() => { setDeleteDiscountFor(d); setDeleteDiscountReason(""); }}
/>
```

- [ ] **Step 3: Update DiscountRow function signature and add icon buttons**

Find `function DiscountRow({ d, canEdit, onApply, onCancel }: any)` at line 1008. Change signature:

```tsx
function DiscountRow({ d, canEdit, onApply, onCancel, onEdit, onDelete }: any) {
```

Inside the row, find the existing Apply/Cancel button block (search for the JSX with `onApply`/`onCancel` callbacks). Add Edit + Delete icon buttons:

```tsx
{canEdit && d.status === "pending" && (
  <Button size="icon-xs" variant="ghost" onClick={onEdit} title="Edit diskon">
    <Pencil className="h-3.5 w-3.5" />
  </Button>
)}
{canEdit && (
  <Button
    size="icon-xs"
    variant="ghost"
    onClick={onDelete}
    disabled={d.status === "applied"}
    title={d.status === "applied" ? "Sudah dipakai customer, tidak bisa dihapus" : "Hapus diskon"}
  >
    <Trash2 className="h-3.5 w-3.5 text-destructive" />
  </Button>
)}
```

Verify `Pencil` and `Trash2` are imported from `lucide-react` at top of file - if not, add to existing import.

- [ ] **Step 4: Add edit dialog at bottom of LoyaltyAdminPage return JSX**

Near the existing `applyFor` dialog (~line 378-415), add:

```tsx
<Dialog open={!!editDiscountFor} onOpenChange={(o) => !o && setEditDiscountFor(null)}>
  <DialogContent className="max-w-md">
    <DialogHeader>
      <DialogTitle>Edit Diskon</DialogTitle>
      <DialogDescription>
        Hanya diskon status 'pending' yang bisa di-edit.
      </DialogDescription>
    </DialogHeader>
    <div className="space-y-3">
      <div>
        <label className="text-sm font-medium">Tipe</label>
        <Select value={editDiscountForm.discountType} onValueChange={(v) => setEditDiscountForm(f => ({ ...f, discountType: v }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="voucher_indomaret">Voucher Indomaret (Rp)</SelectItem>
            <SelectItem value="free_days">Gratis hari (jumlah hari)</SelectItem>
            <SelectItem value="percent">Persen diskon (%)</SelectItem>
            <SelectItem value="cash_bonus">Cash bonus (Rp)</SelectItem>
            <SelectItem value="speed_upgrade">Speed upgrade (Mbps)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="text-sm font-medium">Nilai</label>
        <Input type="number" value={editDiscountForm.discountValue}
          onChange={(e) => setEditDiscountForm(f => ({ ...f, discountValue: Number(e.target.value) }))} />
      </div>
      <div>
        <label className="text-sm font-medium">Source</label>
        <Input value={editDiscountForm.source}
          onChange={(e) => setEditDiscountForm(f => ({ ...f, source: e.target.value }))} />
      </div>
      <div>
        <label className="text-sm font-medium">Deskripsi</label>
        <Textarea value={editDiscountForm.description}
          onChange={(e) => setEditDiscountForm(f => ({ ...f, description: e.target.value }))} />
      </div>
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={() => setEditDiscountFor(null)}>Batal</Button>
        <Button
          className="flex-1"
          loading={editDiscountMut.isPending}
          onClick={() => editDiscountMut.mutate({ id: editDiscountFor.id, patch: editDiscountForm })}
        >
          Simpan
        </Button>
      </div>
    </div>
  </DialogContent>
</Dialog>

<AlertDialog open={!!deleteDiscountFor} onOpenChange={(o) => !o && setDeleteDiscountFor(null)}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Hapus Diskon?</AlertDialogTitle>
      <AlertDialogDescription>
        Diskon Rp {deleteDiscountFor?.discountValue?.toLocaleString("id-ID") ?? "-"} akan disembunyikan dari list.
        Soft delete - masih bisa di-restore via SQL admin kalau perlu.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <div className="my-2">
      <Textarea
        placeholder="Alasan hapus (opsional)"
        value={deleteDiscountReason}
        onChange={(e) => setDeleteDiscountReason(e.target.value)}
      />
    </div>
    <AlertDialogFooter>
      <AlertDialogCancel>Batal</AlertDialogCancel>
      <AlertDialogAction
        className="bg-destructive hover:bg-destructive/90"
        onClick={() => deleteDiscountMut.mutate({ id: deleteDiscountFor.id, reason: deleteDiscountReason || undefined })}
      >
        Hapus
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

Confirm `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem`, `Textarea` imports are present at top of file. If not, add them from existing `@/components/ui/...` paths.

- [ ] **Step 5: Typecheck + manual UI test**

```bash
npx tsc --noEmit 2>&1 | tail -10
npm run dev
```

Open browser http://localhost:3002 → login admin → /loyalty → tab Diskon → pick a pending discount → click Edit icon → change value → Simpan → verify toast + row refreshed. Then click Trash icon → confirm dialog → Hapus → verify row hilang.

Try edit on `applied` row → expect Edit button hidden (`d.status === "pending"` guard). Try delete on `applied` row → expect tombol disabled with tooltip.

- [ ] **Step 6: Commit**

```bash
git add client/pages/LoyaltyAdminPage.tsx
git commit -m "$(cat <<'EOF'
feat(loyalty): UI edit + delete for discount rows

Pencil + Trash2 icon buttons in DiscountRow. Edit dialog with select
for discountType. Soft-delete AlertDialog with optional reason. Both
gated by canWrite('loyalty_admin') and state guards.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Frontend - ReferralsTable edit/delete

**Files:**
- Modify: `client/pages/LoyaltyAdminPage.tsx:1219-1450` (ReferralsTable function)

- [ ] **Step 1: Add state + mutations**

In `ReferralsTable` function (line 1219), the function has its own scope. Check whether it uses parent state or local state - likely local. Add local state at top of function body:

```tsx
function ReferralsTable({ referrals, loading }: any) {
  const { canWrite } = useAuth();
  const canEdit = canWrite("loyalty_admin");
  const qc = useQueryClient();
  const [editFor, setEditFor] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ refereeName: "", refereePhone: "", notes: "" });
  const [deleteFor, setDeleteFor] = useState<any | null>(null);
  const [deleteReason, setDeleteReason] = useState("");

  const editMut = useMutation({
    mutationFn: (data: { id: number; patch: any }) =>
      api.put(`/loyalty/admin/referrals/${data.id}`, data.patch),
    onSuccess: () => {
      toast.success("Referral diperbarui");
      qc.invalidateQueries({ queryKey: ["loyalty-referrals"] });
      setEditFor(null);
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? "Gagal update"),
  });
  const deleteMut = useMutation({
    mutationFn: (data: { id: number; reason?: string }) =>
      api.delete(`/loyalty/admin/referrals/${data.id}`, { data: { reason: data.reason } }),
    onSuccess: () => {
      toast.success("Referral dihapus");
      qc.invalidateQueries({ queryKey: ["loyalty-referrals"] });
      setDeleteFor(null);
      setDeleteReason("");
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? "Gagal hapus"),
  });
  // ...rest of existing component
```

Confirm query key matches the existing one used by the parent's `referrals` useQuery. Check the parent's useQuery call to get the exact key.

- [ ] **Step 2: Add Aksi column to table**

Find the table header row (search for `<th>` or `<TableHead>` inside `ReferralsTable`). Add a new column header at the end:

```tsx
<TableHead className="w-[80px]">Aksi</TableHead>
```

Find the row mapping (search for `referrals.map` or similar). At the end of each row's cells, add:

```tsx
<TableCell>
  {canEdit && (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon-xs" variant="ghost"><MoreHorizontal className="h-4 w-4" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          disabled={r.status === "rewarded"}
          onClick={() => {
            setEditFor(r);
            setEditForm({
              refereeName: r.refereeName ?? "",
              refereePhone: r.refereePhone ?? "",
              notes: r.notes ?? "",
            });
          }}
        >
          <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={r.status === "rewarded"}
          className="text-destructive"
          onClick={() => { setDeleteFor(r); setDeleteReason(""); }}
        >
          <Trash2 className="h-3.5 w-3.5 mr-2" /> Hapus
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )}
</TableCell>
```

Add imports if missing: `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem` from `@/components/ui/dropdown-menu`. `MoreHorizontal` from `lucide-react`.

- [ ] **Step 3: Add edit + delete dialogs**

Before the closing tag of `ReferralsTable`'s root JSX (find `</div>` or `</Card>` that wraps the whole component), add:

```tsx
{/* Edit dialog */}
<Dialog open={!!editFor} onOpenChange={(o) => !o && setEditFor(null)}>
  <DialogContent className="max-w-md">
    <DialogHeader>
      <DialogTitle>Edit Referral</DialogTitle>
      <DialogDescription>
        Edit info referee. Tidak bisa edit kalau status sudah 'rewarded'.
      </DialogDescription>
    </DialogHeader>
    <div className="space-y-3">
      <div>
        <label className="text-sm font-medium">Nama Referee</label>
        <Input value={editForm.refereeName}
          onChange={(e) => setEditForm(f => ({ ...f, refereeName: e.target.value }))} />
      </div>
      <div>
        <label className="text-sm font-medium">Nomor HP</label>
        <Input value={editForm.refereePhone}
          onChange={(e) => setEditForm(f => ({ ...f, refereePhone: e.target.value }))} />
      </div>
      <div>
        <label className="text-sm font-medium">Catatan</label>
        <Textarea value={editForm.notes}
          onChange={(e) => setEditForm(f => ({ ...f, notes: e.target.value }))} />
      </div>
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={() => setEditFor(null)}>Batal</Button>
        <Button
          className="flex-1"
          loading={editMut.isPending}
          onClick={() => editMut.mutate({ id: editFor.id, patch: editForm })}
        >
          Simpan
        </Button>
      </div>
    </div>
  </DialogContent>
</Dialog>

{/* Delete confirm */}
<AlertDialog open={!!deleteFor} onOpenChange={(o) => !o && setDeleteFor(null)}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Hapus Referral?</AlertDialogTitle>
      <AlertDialogDescription>
        Referral ke <strong>{deleteFor?.refereeName ?? "-"}</strong> akan disembunyikan (soft delete).
      </AlertDialogDescription>
    </AlertDialogHeader>
    <div className="my-2">
      <Textarea placeholder="Alasan hapus (opsional)" value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} />
    </div>
    <AlertDialogFooter>
      <AlertDialogCancel>Batal</AlertDialogCancel>
      <AlertDialogAction className="bg-destructive hover:bg-destructive/90"
        onClick={() => deleteMut.mutate({ id: deleteFor.id, reason: deleteReason || undefined })}>
        Hapus
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

- [ ] **Step 4: Typecheck + UI test + commit**

```bash
npx tsc --noEmit 2>&1 | tail -10
# UI: /loyalty → tab Referrals → pick non-rewarded referral → dropdown Edit → ubah nama → Simpan
# verify toast + row update. Hapus → confirm → row hilang.
git add client/pages/LoyaltyAdminPage.tsx
git commit -m "$(cat <<'EOF'
feat(loyalty): UI edit + soft-delete for referrals

DropdownMenu Aksi column with Edit/Hapus items. Disabled for
status='rewarded'. Dialog edits refereeName/Phone/notes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Frontend - PointRedemptionsTab edit/delete

**Files:**
- Modify: `client/pages/LoyaltyAdminPage.tsx:1585-1980` (PointRedemptionsTab function)

- [ ] **Step 1: Add state + mutations + UI**

Within `PointRedemptionsTab` function (line 1585), add local state at top similar to Task 12 Step 1:

```tsx
  const [editFor, setEditFor] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ speedMultiplier: 2, durationHours: 6, pointsCost: 0, notes: "" });
  const [deleteFor, setDeleteFor] = useState<any | null>(null);
  const [deleteReason, setDeleteReason] = useState("");

  const editMut = useMutation({
    mutationFn: (data: { id: number; patch: any }) =>
      api.put(`/loyalty/admin/points/redemptions/${data.id}`, data.patch),
    onSuccess: () => {
      toast.success("Redemption diperbarui");
      qc.invalidateQueries({ queryKey: ["loyalty-redemptions"] });
      setEditFor(null);
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? "Gagal update"),
  });
  const deleteMut = useMutation({
    mutationFn: (data: { id: number; reason?: string }) =>
      api.delete(`/loyalty/admin/points/redemptions/${data.id}`, { data: { reason: data.reason } }),
    onSuccess: (resp: any) => {
      toast.success(resp?.refunded ? "Redemption dihapus + poin di-refund" : "Redemption dihapus");
      qc.invalidateQueries({ queryKey: ["loyalty-redemptions"] });
      qc.invalidateQueries({ queryKey: ["loyalty-points-stats"] });
      setDeleteFor(null);
      setDeleteReason("");
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? "Gagal hapus"),
  });
```

- [ ] **Step 2: Add Edit + Hapus buttons in each redemption row**

Find the row JSX inside the redemptions list rendering (search for `redemption.map`, `redemptions.map`, or similar). Near existing verify/reject/cancel buttons (line ~1817 / ~1974 has `canEdit` blocks), add:

```tsx
{canEdit && r.status === "pending" && (
  <Button size="icon-xs" variant="ghost" title="Edit"
    onClick={() => {
      setEditFor(r);
      setEditForm({
        speedMultiplier: r.speedMultiplier ?? 2,
        durationHours: r.durationHours ?? 6,
        pointsCost: r.pointsCost ?? 0,
        notes: r.notes ?? "",
      });
    }}
  >
    <Pencil className="h-3.5 w-3.5" />
  </Button>
)}
{canEdit && (
  <Button
    size="icon-xs"
    variant="ghost"
    disabled={r.status === "active"}
    title={r.status === "active" ? "Boost masih jalan - cancel dulu" : "Hapus"}
    onClick={() => { setDeleteFor(r); setDeleteReason(""); }}
  >
    <Trash2 className="h-3.5 w-3.5 text-destructive" />
  </Button>
)}
```

- [ ] **Step 3: Add edit + delete dialogs**

Before the component's root closing tag, add:

```tsx
<Dialog open={!!editFor} onOpenChange={(o) => !o && setEditFor(null)}>
  <DialogContent className="max-w-md">
    <DialogHeader>
      <DialogTitle>Edit Redemption</DialogTitle>
      <DialogDescription>Hanya status 'pending' yang bisa di-edit.</DialogDescription>
    </DialogHeader>
    <div className="space-y-3">
      <div>
        <label className="text-sm font-medium">Speed multiplier (x)</label>
        <Input type="number" value={editForm.speedMultiplier}
          onChange={(e) => setEditForm(f => ({ ...f, speedMultiplier: Number(e.target.value) }))} />
      </div>
      <div>
        <label className="text-sm font-medium">Durasi (jam)</label>
        <Input type="number" value={editForm.durationHours}
          onChange={(e) => setEditForm(f => ({ ...f, durationHours: Number(e.target.value) }))} />
      </div>
      <div>
        <label className="text-sm font-medium">Biaya poin</label>
        <Input type="number" value={editForm.pointsCost}
          onChange={(e) => setEditForm(f => ({ ...f, pointsCost: Number(e.target.value) }))} />
      </div>
      <div>
        <label className="text-sm font-medium">Catatan</label>
        <Textarea value={editForm.notes}
          onChange={(e) => setEditForm(f => ({ ...f, notes: e.target.value }))} />
      </div>
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={() => setEditFor(null)}>Batal</Button>
        <Button className="flex-1" loading={editMut.isPending}
          onClick={() => editMut.mutate({ id: editFor.id, patch: editForm })}>Simpan</Button>
      </div>
    </div>
  </DialogContent>
</Dialog>

<AlertDialog open={!!deleteFor} onOpenChange={(o) => !o && setDeleteFor(null)}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Hapus Redemption?</AlertDialogTitle>
      <AlertDialogDescription>
        {deleteFor?.status === "pending"
          ? "Status 'pending' - poin akan otomatis di-refund saat hapus."
          : "Row akan disembunyikan dari list (soft delete)."}
      </AlertDialogDescription>
    </AlertDialogHeader>
    <div className="my-2">
      <Textarea placeholder="Alasan hapus (opsional)" value={deleteReason}
        onChange={(e) => setDeleteReason(e.target.value)} />
    </div>
    <AlertDialogFooter>
      <AlertDialogCancel>Batal</AlertDialogCancel>
      <AlertDialogAction className="bg-destructive hover:bg-destructive/90"
        onClick={() => deleteMut.mutate({ id: deleteFor.id, reason: deleteReason || undefined })}>
        Hapus
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

- [ ] **Step 4: Typecheck + UI test + commit**

```bash
npx tsc --noEmit 2>&1 | tail -10
# UI: /loyalty → tab Points → row pending → Edit (change pointsCost) → Simpan → toast OK
# Delete pending → confirm → row hilang + toast "poin di-refund"
# Try delete on 'active' row → button disabled with tooltip
git add client/pages/LoyaltyAdminPage.tsx
git commit -m "$(cat <<'EOF'
feat(loyalty): UI edit + soft-delete for point redemptions

Edit only 'pending' (Pencil icon). Delete disabled on 'active' with
tooltip. Pending delete shows refund hint in confirm dialog.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Frontend - SahabatDetailDrawer admin actions

**Files:**
- Modify: `client/components/sahabat/SahabatDetailDrawer.tsx`

- [ ] **Step 1: Inspect existing drawer to find content area + auth hook**

```bash
grep -nE "useAuth|canWrite|customerId|sahabatLevel|pointsBalance" /home/ygao-t580/Works/Jabnet/Website/ftth-tools/client/components/sahabat/SahabatDetailDrawer.tsx | head -20
wc -l /home/ygao-t580/Works/Jabnet/Website/ftth-tools/client/components/sahabat/SahabatDetailDrawer.tsx
```

Note the line count + key sections.

- [ ] **Step 2: Add state + mutations + accordion section**

Inside the drawer component function body, near top, add:

```tsx
  const { canWrite } = useAuth();
  const canEdit = canWrite("loyalty_admin");
  const qc = useQueryClient();

  const [pointsDelta, setPointsDelta] = useState(0);
  const [pointsReason, setPointsReason] = useState("");

  const [newLevel, setNewLevel] = useState("");
  const [levelReason, setLevelReason] = useState("");

  const [newCode, setNewCode] = useState("");
  const [codeConfirmOpen, setCodeConfirmOpen] = useState(false);

  const [freezeReason, setFreezeReason] = useState("");

  const adjustPointsMut = useMutation({
    mutationFn: (data: { delta: number; reason: string }) =>
      api.post(`/loyalty/admin/sahabat/${customerId}/points-adjust`, data),
    onSuccess: () => {
      toast.success("Poin disesuaikan");
      qc.invalidateQueries({ queryKey: ["sahabat-detail", customerId] });
      setPointsDelta(0); setPointsReason("");
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? "Gagal adjust"),
  });
  const setLevelMut = useMutation({
    mutationFn: (data: { level: string; reason: string }) =>
      api.post(`/loyalty/admin/sahabat/${customerId}/level`, data),
    onSuccess: () => {
      toast.success("Level diubah");
      qc.invalidateQueries({ queryKey: ["sahabat-detail", customerId] });
      setNewLevel(""); setLevelReason("");
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? "Gagal set level"),
  });
  const setCodeMut = useMutation({
    mutationFn: (data: { sahabatCode: string }) =>
      api.post(`/loyalty/admin/sahabat/${customerId}/code`, data),
    onSuccess: () => {
      toast.success("Kode diubah");
      qc.invalidateQueries({ queryKey: ["sahabat-detail", customerId] });
      setNewCode(""); setCodeConfirmOpen(false);
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? "Gagal set kode"),
  });
  const freezeMut = useMutation({
    mutationFn: (data: { frozen: boolean; reason?: string }) =>
      api.post(`/loyalty/admin/sahabat/${customerId}/freeze`, data),
    onSuccess: () => {
      toast.success("Status freeze diubah");
      qc.invalidateQueries({ queryKey: ["sahabat-detail", customerId] });
      setFreezeReason("");
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? "Gagal toggle"),
  });
```

Confirm `customerId` is in scope - it's likely a prop. Confirm exact useQuery key from existing detail fetch in this file; match it.

- [ ] **Step 3: Add "Admin Actions" accordion at end of drawer body**

Inside the drawer body JSX, after the existing tabs/content, add a conditional section:

```tsx
{canEdit && (
  <Accordion type="single" collapsible className="mt-4 border-t pt-4">
    <AccordionItem value="admin">
      <AccordionTrigger className="text-sm font-medium">
        <span className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-warning" />
          Admin Actions
        </span>
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-4 pt-2">

          {/* Freeze banner */}
          {detail?.loyalty?.isFrozen === 1 && (
            <div className="p-3 rounded-md bg-warning/10 border border-warning/30 text-warning text-sm">
              <strong>Akun di-freeze</strong> {detail.loyalty.frozenAt ? `pada ${new Date(detail.loyalty.frozenAt).toLocaleString("id-ID")}` : ""}
              {detail.loyalty.frozenReason && <div className="mt-1">Alasan: {detail.loyalty.frozenReason}</div>}
            </div>
          )}

          {/* 1. Adjust Points */}
          <div className="p-3 rounded-md border bg-card">
            <h4 className="text-sm font-semibold mb-2">Adjust Points</h4>
            <div className="text-xs text-muted-foreground mb-2">
              Saat ini: <strong>{detail?.loyalty?.pointsBalance ?? 0}</strong> poin
              {pointsDelta !== 0 && (
                <> → Akan jadi: <strong>{(detail?.loyalty?.pointsBalance ?? 0) + pointsDelta}</strong></>
              )}
            </div>
            <Input type="number" placeholder="Delta (+/-)" value={pointsDelta}
              onChange={(e) => setPointsDelta(Number(e.target.value))} className="mb-2" />
            <Textarea placeholder="Alasan (min 3 huruf)" value={pointsReason}
              onChange={(e) => setPointsReason(e.target.value)} className="mb-2" />
            {Math.abs(pointsDelta) > 10000 && (
              <div className="text-xs text-warning mb-2"> Adjustment besar (&gt; 10.000 poin)</div>
            )}
            <Button size="sm" className="w-full"
              disabled={pointsDelta === 0 || pointsReason.trim().length < 3}
              loading={adjustPointsMut.isPending}
              onClick={() => adjustPointsMut.mutate({ delta: pointsDelta, reason: pointsReason })}>
              Adjust
            </Button>
          </div>

          {/* 2. Set Level */}
          <div className="p-3 rounded-md border bg-card">
            <h4 className="text-sm font-semibold mb-2">Set Sahabat Level</h4>
            <div className="text-xs text-muted-foreground mb-2">
              Current: <strong>{detail?.loyalty?.sahabatLevel ?? "new"}</strong>
            </div>
            <Select value={newLevel} onValueChange={setNewLevel}>
              <SelectTrigger className="mb-2"><SelectValue placeholder="Pilih level" /></SelectTrigger>
              <SelectContent>
                {["new", "perunggu", "perak", "emas", "platinum", "berlian", "ambassador"].map(l => (
                  <SelectItem key={l} value={l}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea placeholder="Alasan" value={levelReason}
              onChange={(e) => setLevelReason(e.target.value)} className="mb-2" />
            <Button size="sm" className="w-full"
              disabled={!newLevel || levelReason.trim().length < 3}
              loading={setLevelMut.isPending}
              onClick={() => setLevelMut.mutate({ level: newLevel, reason: levelReason })}>
              Simpan Level
            </Button>
          </div>

          {/* 3. Edit Sahabat Code */}
          <div className="p-3 rounded-md border bg-card">
            <h4 className="text-sm font-semibold mb-2">Sahabat Code</h4>
            <div className="text-xs text-muted-foreground mb-2 font-mono-tight">
              Current: <strong>{detail?.loyalty?.sahabatCode ?? "(belum)"}</strong>
            </div>
            <Input placeholder="SHB-XXX-NNN" value={newCode}
              onChange={(e) => setNewCode(e.target.value.toUpperCase())}
              className="mb-2 font-mono-tight" />
            <div className="text-xs text-muted-foreground mb-2">Format: SHB-(3 huruf)-(3 digit)</div>
            <Button size="sm" className="w-full"
              disabled={!/^SHB-[A-Z]{3}-\d{3}$/.test(newCode)}
              onClick={() => setCodeConfirmOpen(true)}>
              Simpan Code
            </Button>
            <AlertDialog open={codeConfirmOpen} onOpenChange={setCodeConfirmOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Ubah Sahabat Code?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Kode lama <code>{detail?.loyalty?.sahabatCode ?? "-"}</code> akan diganti dengan <code>{newCode}</code>.
                    Customer perlu diberi tahu untuk pakai kode baru.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Batal</AlertDialogCancel>
                  <AlertDialogAction onClick={() => setCodeMut.mutate({ sahabatCode: newCode })}>Ya, Ganti</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {/* 4. Freeze / Unfreeze */}
          <div className="p-3 rounded-md border bg-card">
            <h4 className="text-sm font-semibold mb-2">
              {detail?.loyalty?.isFrozen === 1 ? "Unfreeze Akun" : "Freeze Akun"}
            </h4>
            <div className="text-xs text-muted-foreground mb-2">
              {detail?.loyalty?.isFrozen === 1
                ? "Aktifkan kembali - referral reward akan kembali jalan normal."
                : "Stop reward issuance untuk akun ini (referral inbound tetap di-record tapi tidak generate voucher)."}
            </div>
            {detail?.loyalty?.isFrozen !== 1 && (
              <Textarea placeholder="Alasan freeze (wajib)" value={freezeReason}
                onChange={(e) => setFreezeReason(e.target.value)} className="mb-2" />
            )}
            <Button size="sm" className="w-full"
              variant={detail?.loyalty?.isFrozen === 1 ? "default" : "destructive"}
              disabled={detail?.loyalty?.isFrozen !== 1 && freezeReason.trim().length < 3}
              loading={freezeMut.isPending}
              onClick={() => freezeMut.mutate({
                frozen: detail?.loyalty?.isFrozen !== 1,
                reason: detail?.loyalty?.isFrozen === 1 ? undefined : freezeReason,
              })}>
              {detail?.loyalty?.isFrozen === 1 ? "Unfreeze" : "Freeze Akun"}
            </Button>
          </div>

        </div>
      </AccordionContent>
    </AccordionItem>
  </Accordion>
)}
```

Required imports (check if already present, add if missing): `Accordion`, `AccordionItem`, `AccordionTrigger`, `AccordionContent` from `@/components/ui/accordion`; `Shield` from `lucide-react`.

- [ ] **Step 3a: Ensure detail query returns the new freeze fields**

Test in browser/devtools after refresh: `detail?.loyalty?.isFrozen` should resolve. If undefined, the backend storage method `getSahabatDetail()` may need updating to SELECT the new columns. Find that method:

```bash
grep -nE "(getSahabatDetail|sahabat/:customerId|/sahabat/.*detail)" /home/ygao-t580/Works/Jabnet/Website/ftth-tools/server/storage.ts /home/ygao-t580/Works/Jabnet/Website/ftth-tools/server/routes.ts
```

If the method uses `SELECT *` from customer_loyalty via Drizzle, the new columns will surface automatically. If it uses an explicit column list in raw SQL, add `is_frozen AS isFrozen, frozen_reason AS frozenReason, frozen_at AS frozenAt, frozen_by AS frozenBy, points_balance AS pointsBalance, sahabat_level AS sahabatLevel, sahabat_code AS sahabatCode`.

- [ ] **Step 4: Typecheck + UI test + commit**

```bash
npx tsc --noEmit 2>&1 | tail -10
# UI: /loyalty → leaderboard → click row → drawer opens → expand Admin Actions
# Test: adjust +500, set level perunggu, change code (cancel out), freeze + unfreeze
git add client/components/sahabat/SahabatDetailDrawer.tsx server/storage.ts
git commit -m "$(cat <<'EOF'
feat(loyalty): admin actions accordion in SahabatDetailDrawer

4 sub-forms: adjust points (with preview + >10k warning), set level,
edit code (regex + confirm dialog), freeze/unfreeze (banner shows
current state + reason). Gated by canWrite('loyalty_admin').

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Frontend - "Tampilkan terhapus" toggle

**Files:**
- Modify: `client/pages/LoyaltyAdminPage.tsx` (3 places: discounts ~340, referrals ~370, redemptions ~1585)

- [ ] **Step 1: Add toggle state for each tab + thread query param**

In the parent `LoyaltyAdminPage` component (top, near other state), add:

```tsx
  const [showDeletedDiscounts, setShowDeletedDiscounts] = useState(false);
  const [showDeletedReferrals, setShowDeletedReferrals] = useState(false);
  const [showDeletedRedemptions, setShowDeletedRedemptions] = useState(false);
```

Find the 3 `useQuery` calls for discounts/referrals/redemptions (search for `queryKey: ["loyalty-discounts"]`, `["loyalty-referrals"]`, `["loyalty-redemptions"]` - confirm the exact strings used). Update each:

**Discounts:**
```tsx
const { data: discounts, isLoading: discLoading } = useQuery({
  queryKey: ["loyalty-discounts", statusFilter, showDeletedDiscounts],
  queryFn: () => api.get(`/loyalty/admin/discounts?status=${statusFilter}${showDeletedDiscounts ? "&includeDeleted=true" : ""}`),
});
```

**Referrals:**
```tsx
const { data: referrals, isLoading: refLoading } = useQuery({
  queryKey: ["loyalty-referrals", showDeletedReferrals],
  queryFn: () => api.get(`/loyalty/admin/referrals${showDeletedReferrals ? "?includeDeleted=true" : ""}`),
});
```

**Redemptions:** (likely lives inside `PointRedemptionsTab` - see Task 13). Update its useQuery similarly with `showDeletedRedemptions` flag passed as prop from parent.

- [ ] **Step 2: Add toggle pills in each tab header**

In the discounts tab section (~line 340-360 area), before the discounts list, add:

```tsx
<div className="flex items-center gap-2 mb-3">
  <Switch checked={showDeletedDiscounts} onCheckedChange={setShowDeletedDiscounts} id="show-deleted-discounts" />
  <label htmlFor="show-deleted-discounts" className="text-xs text-muted-foreground cursor-pointer">
    Tampilkan terhapus
  </label>
</div>
```

Mirror the same in referrals tab (pass `showDeletedReferrals` + setter as props to `<ReferralsTable>` and have it render the toggle, OR keep the toggle in parent above the table). Pick whichever fits the existing structure better - keeping the toggle in parent is simpler.

For redemptions, add the toggle inside `PointRedemptionsTab` since it's a separate component. Add a prop `showDeleted: boolean; onShowDeletedChange: (v: boolean) => void` from parent.

- [ ] **Step 3: Style deleted rows with strikethrough**

In `DiscountRow`, `ReferralsTable` row, and redemption row: at the row wrapper element, add `opacity-50 line-through` conditional class:

```tsx
<TableRow className={r.deletedAt ? "opacity-50 line-through" : ""}>
```

Also add a "Dihapus" badge after the status badge for deleted rows:

```tsx
{r.deletedAt && (
  <span className="ml-2 text-2xs px-1.5 py-0.5 rounded-md bg-destructive/15 text-destructive">
    Dihapus
  </span>
)}
```

- [ ] **Step 4: Typecheck + UI test + commit**

```bash
npx tsc --noEmit 2>&1 | tail -10
# UI: hapus 1 discount → toggle "Tampilkan terhapus" ON → row muncul dengan strikethrough + badge
# Toggle OFF → row hilang lagi
git add client/pages/LoyaltyAdminPage.tsx
git commit -m "$(cat <<'EOF'
feat(loyalty): show-deleted toggle for discounts/referrals/redemptions

Switch pill per tab, threads ?includeDeleted=true to backend. Deleted
rows render opacity-50 line-through + 'Dihapus' badge for audit recovery.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck full project**

```bash
cd /home/ygao-t580/Works/Jabnet/Website/ftth-tools
npx tsc --noEmit
```

Expected: `0 errors`.

- [ ] **Step 2: Build**

```bash
npm run build 2>&1 | tail -30
```

Expected: Vite build + esbuild server bundle complete. No errors.

- [ ] **Step 3: Full smoke walkthrough**

```bash
npm run dev &
DEV_PID=$!
sleep 8
TOKEN=$(curl -sS -X POST http://localhost:3002/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"Admin@1234"}' | grep -oE '"token":"[^"]+"' | cut -d'"' -f4)
```

Open browser to http://localhost:3002 → login admin → /loyalty:

- [ ] Tab **Diskon**: edit 1 pending discount (change value) → toast OK → row update. Delete pending discount → confirm → hilang. Toggle "Tampilkan terhapus" → muncul lagi dengan strikethrough.
- [ ] Tab **Diskon**: delete `applied` row → button disabled with tooltip.
- [ ] Tab **Referrals**: edit non-rewarded referral nama → simpan → row update. Hapus → confirm → hilang.
- [ ] Tab **Referrals**: rewarded row → dropdown items disabled.
- [ ] Tab **Points**: edit pending redemption (change durationHours) → simpan. Delete pending → confirm → "poin di-refund" toast. Delete `active` → tombol disabled.
- [ ] **Drawer Sahabat**: click leaderboard row → drawer → expand "Admin Actions":
  - Adjust +500 → balance update di banner.
  - Set level → confirm.
  - Edit code → fill SHB-TST-001 → confirm dialog → simpan.
  - Freeze + alasan "smoke test" → banner kuning muncul. Buat referral inbound dummy via direct SQL atau API + simulate first payment → confirm tidak ada voucher di-create (check `customer_discounts` count tidak naik).
  - Unfreeze → banner hilang.

```bash
kill $DEV_PID 2>/dev/null
```

- [ ] **Step 4: DB spot-check**

```bash
mysql -u jabnet_crm_user -p'Galon@12345' jabnet_fiber <<'SQL'
DESCRIBE customer_referrals;
DESCRIBE customer_discounts;
DESCRIBE point_redemptions;
DESCRIBE customer_loyalty;
SELECT id, action, entity_type, entity_id, details
FROM audit_logs
WHERE entity_type LIKE 'loyalty_%' OR entity_type LIKE 'sahabat_%'
ORDER BY id DESC LIMIT 20;
SQL
```

Expected:
- All 4 tables show new columns (`deleted_at`, `is_frozen`, `frozen_*`)
- Audit log entries for UPDATE/DELETE/ADJUST/FREEZE/UNFREEZE captured during smoke

- [ ] **Step 5: No-test-suite manual confirmation**

This project has no automated test suite. Validation is:
- `npx tsc --noEmit` ✓
- `npm run build` ✓
- UI smoke per Step 3 ✓
- DB schema check per Step 4 ✓
- Audit log check per Step 4 ✓

Update `CLAUDE.md` `What's NOT Yet Done` section: remove the "loyalty edit/delete" item (if listed) or skip if not listed. Actually CLAUDE.md doesn't list this - no doc update needed.

- [ ] **Step 6: Push to remote (only after user explicit OK)**

```bash
git log --oneline origin/main..HEAD
```

Expected: ~15 commits ready to push. Stop here. Per CLAUDE.md rule: "NEVER deploy to production tanpa user explicit OK". Surface the list to user for review before `git push`.

---

## Open Questions for Implementation Time

1. **`pointRedemptions.durationHours` vs `durationDays`** - spec mentioned days, but schema column is `duration_hours`. Plan uses hours. Confirm with spec author if days was intentional → would need additional column. Current plan: hours.
2. **`customer_discounts.discountType` enum** - spec listed `[credit|voucher|service]`. Schema reality: `voucher_indomaret|free_days|percent|cash_bonus|speed_upgrade`. Plan uses schema reality.
3. **Sahabat detail query** - `getSahabatDetail()` may need to be updated to surface new freeze fields. Verify at Task 14 Step 3a.
4. **Admin discounts list method name** - Task 8 Step 2 assumes a method exists; if route uses raw SQL inline, refactor to thread `includeDeleted` into the query directly.
5. **Existing query key names** - Tasks 11/12/13 assume `["loyalty-discounts"]`, `["loyalty-referrals"]`, `["loyalty-redemptions"]`. Verify and match exact strings during implementation.

These are confirm-at-implementation items, not blockers - the plan is complete enough to execute and pivot on the actual call sites.
