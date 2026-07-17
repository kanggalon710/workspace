# JABNET Workspace — Design System

> **Versi:** v4.1.11 · **Tema:** Fiber Operations Premium · **Updated:** 2026-04-23

---

## 1. Filosofi

**Target perception:** "setara Biznet Home, Indihome Smart, Vodafone Business, Telkomsel MyAds Pro"

Prinsip design:
- **Clarity first** — data telco padat tapi scannable
- **Operational confidence** — status visual selalu visible (traffic lights)
- **Professional restraint** — gradient dipakai untuk accent, bukan dekorasi
- **Mobile parity** — field tech harus bisa pakai full dengan satu tangan

---

## 2. Design Tokens

### 2.1 Color System
Semua warna dari CSS custom properties di [client/index.css](../client/index.css), auto-adaptif light/dark.

**Brand & Neutral**
- `primary` — Sky 500 (brand anchor) · `sidebar` — Navy 900 (deep)
- `background`, `foreground`, `card`, `muted`, `border`, `input`

**Semantic Status**
- `success` — Emerald (operational, active, paid)
- `warning` — Amber (degraded, pending, attention)
- `destructive` — Red (outage, isolir, critical)
- `info` — Sky (informational)

**Chart Palette** (`--chart-1` … `--chart-8`): sky, emerald, amber, violet, red, teal, orange, purple — perceptually distinct.

**Asset Topology** (`bg-asset-pop`, `asset-odc`, `asset-odp`, `asset-pole`, `asset-cable`): konsisten di peta, sidebar, list, bottom sheet.

### 2.2 Typography
- **Sans:** Inter 400-900 + font-feature cv11, ss01, ss03
- **Mono:** JetBrains Mono untuk IDs, kode, timestamp
- **Tracking:** -0.025em (h1), -0.02em (h2), -0.015em (h3) — display tracking untuk presentasi enterprise
- **Tabular nums:** otomatis pada text-bold/black untuk KPI

### 2.3 Elevation
- `shadow-elev-sm` — list cards
- `shadow-elev-md` — interactive hover, dialogs, user menu
- `shadow-elev-lg` — modals, FAB

### 2.4 Utility Classes
- `.text-gradient-brand` — sky → blue → violet gradient
- `.bg-grid-pattern` / `.bg-dot-pattern` / `.bg-mesh` — hero sections
- `.shine-effect` — CTA button shimmer
- `.pulse-ring-success/warning/danger` — live indicators
- `.font-mono-tight` — tight mono for IDs
- `.surface-elevated` / `.surface-elevated-hover` — premium cards

---

## 3. Component Library

### 3.1 Foundation
Location: [client/components/ui/](../client/components/ui/)

| Component | Purpose | Key Props |
|-----------|---------|-----------|
| `<Button>` | 9 variants × 7 sizes + loading + icons | `variant` (gradient, outline-primary, ghost-primary, success, warning), `size` (xs/sm/md/lg/xl/icon), `loading`, `leftIcon`, `rightIcon` |
| `<Input>` | Sized, icon slot, error state | `inputSize`, `leftIcon`, `rightIcon`, `error` |
| `<Card>` | 6 variants × interactive × padding | `variant` (flat/elevated/ghost/glass/gradient), `interactive`, `padding` |
| `<CardHeader/Title/Description/Content/Footer>` | Structured card |
| `<Badge>` | shadcn base (use StatusBadge for semantic states) |
| `<Dialog>`, `<AlertDialog>`, `<Tooltip>` | Radix primitives |
| `<Select>`, `<Label>`, `<Textarea>` | Form primitives |

### 3.2 Enterprise Components
Dibuat khusus untuk tema telco.

| Component | Purpose | Usage |
|-----------|---------|-------|
| `<StatTile>` | KPI card with icon + label + trend + loading | Dashboard, analytics pages |
| `<StatusBadge>` | 6 variants × 4 appearances (subtle/solid/outline/dot) | Status indicators (aktif/isolir/degraded) |
| `<SystemStatusDot>` | Pulsing operational/degraded/outage dot | TopBar, sidebars |
| `<EmptyState>` | Icon + title + description + CTA | "No data" states |
| `<PageHeader>` | Icon + title + description + breadcrumb + actions + refresh | Top of every page |
| `<PageContainer>` / `<PageSection>` | Max-width + consistent spacing wrapper | Page layout |
| `<Skeleton>` + 6 variants | Loading placeholders | `SkeletonCard`, `SkeletonTable`, `SkeletonKPIGrid`, `SkeletonChart`, `SkeletonList`, `SkeletonText` |
| `<ErrorBoundary>` | Recovery UI when component crashes | Wraps routes |

### 3.3 Layout
| Component | Purpose |
|-----------|---------|
| `<Sidebar>` | Collapsible nav w/ gradient logo, groups, profile, status, version footer |
| `<TopBar>` | Breadcrumb, Cmd+K search, traffic lights, bell, theme, user menu |
| `<BottomNav>` | Mobile nav w/ gradient active indicator + icon containers |
| `<BottomSheet>` | Premium modal-from-bottom w/ spring animation + swipe-dismiss |
| `<Layout>` | Orchestrator: Sidebar + TopBar + content (dot pattern bg) + BottomNav |

---

## 4. Layout Architecture

### 4.1 Desktop
```
┌────────────┬─────────────────────────────────────┐
│            │ TopBar: breadcrumb · search · 🟢🟢🟢 · 🔔 · 🌙 · 👤 │
│  Sidebar   ├─────────────────────────────────────┤
│  (navy     │                                     │
│   gradient │  Content area (dot pattern bg)      │
│   header,  │                                     │
│   groups,  │                                     │
│   profile, │                                     │
│   version) │                                     │
└────────────┴─────────────────────────────────────┘
```

### 4.2 Mobile
```
┌─────────────────────────────┐
│ TopBar: ≡ · Dashboard · 🔔 🌙 👤 │
├─────────────────────────────┤
│                             │
│  Content area               │
│                             │
├─────────────────────────────┤
│ Home · Peta · Aset · 👥 · 🔧 │ ← BottomNav
└─────────────────────────────┘
```
Hamburger buka sidebar full-height overlay. Aset/Tools buka BottomSheet.

---

## 5. Key Pages

### 5.1 Login
- Left hero: gradient mesh + grid + live status + hero headline (text gradient) + feature pills + 3 stat columns + SSL badge
- Right form: Staff Portal badge + welcome back + inputs (show/hide password) + gradient CTA with shine + "atau" divider + coverage check card + footer

### 5.2 Dashboard
- PageHeader dengan Gauge icon + time filter
- Billing Sync banner (danger variant) conditional
- 4 StatTile cards (Port Tersedia / ODP Kritis / Core Feeder Sisa / Kapasitas Baru) dengan semantic accent
- Network Health Score + Alerts + Activity + 2×2 chart grid

### 5.3 Lists (Users, Roles, Customers, etc.)
- PageHeader dengan icon + title + description + actions
- Sticky filter row
- SkeletonTable saat loading
- EmptyState saat 0 results
- StatusBadge untuk row states
- Detail drawer/dialog dengan tabs

---

## 6. Responsive Breakpoints

| BP | min-width | Target |
|----|-----------|--------|
| base | 0 | Mobile portrait |
| sm | 640px | Mobile landscape |
| md | 768px | Tablet |
| lg | 1024px | Desktop small |
| xl | 1280px | Desktop |
| 2xl | 1536px | Desktop large |

Sidebar + BottomNav toggle di `md`. Hero split-pane di `lg`. Traffic lights di TopBar muncul di `xl`.

---

## 7. Accessibility

- WCAG focus ring (2px primary outline + offset)
- `prefers-reduced-motion` respected via CSS (animations tidak blocking UX)
- Semantic HTML (`<nav>`, `<header>`, `<main>`, `<aside>`)
- `aria-label` pada icon buttons, `aria-current` pada active nav
- Skeleton pakai `role="status"` untuk screen reader
- Color contrast ≥ 4.5:1 untuk text (WCAG AA)
- Keyboard shortcuts: Cmd+K (search), Cmd+M (map), Cmd+D (dashboard), Esc (close dialogs)

---

## 8. Component Adoption Pattern

### Sebelum (inconsistent, hardcoded)
```tsx
<div className="p-4 rounded-lg bg-white border border-slate-200 shadow-sm">
  <p className="text-[11px] text-slate-500 uppercase">Port Tersedia</p>
  <h3 className="text-2xl font-black">1,234</h3>
  <span className="text-emerald-600">🟢 Longgar</span>
</div>
```

### Sesudah (theme-aware, maintainable)
```tsx
<StatTile
  icon={Plug}
  label="Port Tersedia"
  value="1,234"
  description="dari 2,000 port · 62%"
  accent="success"
/>
```

Dark mode adaptif, konsisten di seluruh app, trend indicator built-in, loading state built-in.

---

## 9. Roadmap Phase 3 (Future)

- **Command Palette** (Cmd+K) — fuzzy search routes + entities
- **DataTable** — sortable, paginated, virtualized (react-table + react-virtual)
- **FormField** — wrapper react-hook-form + zod schema + error UI
- **Combobox** — searchable select (untuk ODP/router selection)
- **RadioGroup / CheckboxGroup** — semantic form inputs
- **Tabs** — shadcn radix tabs (untuk split forms)
- **Timeline** — vertical timeline for audit logs / activity

---

## 10. File Index

**Design tokens**
- [client/index.css](../client/index.css) — CSS variables, utilities, patterns, animations
- [tailwind.config.ts](../tailwind.config.ts) — color mapping, fonts, spacing
- [client/lib/chartColors.ts](../client/lib/chartColors.ts) — Recharts color utility
- [client/lib/assetColors.ts](../client/lib/assetColors.ts) — Map marker colors

**Components**
- [client/components/ui/button.tsx](../client/components/ui/button.tsx)
- [client/components/ui/input.tsx](../client/components/ui/input.tsx)
- [client/components/ui/card.tsx](../client/components/ui/card.tsx)
- [client/components/ui/skeleton.tsx](../client/components/ui/skeleton.tsx)
- [client/components/ui/empty-state.tsx](../client/components/ui/empty-state.tsx)
- [client/components/ui/page-header.tsx](../client/components/ui/page-header.tsx)
- [client/components/ui/page-container.tsx](../client/components/ui/page-container.tsx)
- [client/components/ui/status-badge.tsx](../client/components/ui/status-badge.tsx)
- [client/components/ui/system-status-dot.tsx](../client/components/ui/system-status-dot.tsx)
- [client/components/ui/stat-tile.tsx](../client/components/ui/stat-tile.tsx)
- [client/components/ui/error-boundary.tsx](../client/components/ui/error-boundary.tsx)

**Layout**
- [client/components/layout/Layout.tsx](../client/components/layout/Layout.tsx)
- [client/components/layout/Sidebar.tsx](../client/components/layout/Sidebar.tsx)
- [client/components/layout/TopBar.tsx](../client/components/layout/TopBar.tsx)
- [client/components/layout/BottomNav.tsx](../client/components/layout/BottomNav.tsx)
- [client/components/shared/BottomSheet.tsx](../client/components/shared/BottomSheet.tsx)

**Pages (fully adopted)**
- [client/pages/LoginPage.tsx](../client/pages/LoginPage.tsx) — premium hero, gradient CTA
- [client/pages/Dashboard.tsx](../client/pages/Dashboard.tsx) — PageHeader + StatTile + theme-aware charts

---

_Design System versi v4.1.11 — fondasi siap untuk scale ke 50+ halaman._
