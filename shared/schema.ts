import { mysqlTable, text, int, double, varchar, longtext, mediumtext, bigint, index, uniqueIndex } from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ==================== FIBER COLOR STANDARDS (TIA-598) ====================

export const TUBE_COLORS = [
  "biru", "orange", "hijau", "coklat", "abu-abu", "putih",
  "merah", "hitam",
] as const;

export const CORE_COLORS = [
  "biru", "orange", "hijau", "coklat", "abu-abu", "putih",
  "merah", "hitam", "kuning", "ungu", "pink", "tosca",
] as const;

// ==================== EXISTING TABLES ====================

export const pops = mysqlTable("pops", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  name: text("name").notNull(),
  code: text("code").notNull(),
  address: text("address"),
  lat: double("lat"),
  lng: double("lng"),
  totalPorts: int("total_ports").default(0),
  usedPorts: int("used_ports").default(0),
  status: varchar("status", { length: 255 }).default("active"),
  district: text("district"),
  village: text("village"),
  notes: text("notes"),
});

export const odcs = mysqlTable("odcs", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  name: text("name").notNull(),
  code: text("code").notNull(),
  popId: int("pop_id").references(() => pops.id),
  lat: double("lat"),
  lng: double("lng"),
  capacity: int("capacity").default(0),
  usedCapacity: int("used_capacity").default(0),
  splitterType: text("splitter_type"),
  status: varchar("status", { length: 255 }).default("active"),
  address: text("address"),
  district: text("district"),
  village: text("village"),
  notes: text("notes"),
});

export const odps = mysqlTable("odps", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  name: text("name").notNull(),
  code: text("code").notNull(),
  odcId: int("odc_id").references(() => odcs.id),
  lat: double("lat"),
  lng: double("lng"),
  capacity: int("capacity").default(8),
  usedCapacity: int("used_capacity").default(0),
  splitterType: text("splitter_type"),
  status: varchar("status", { length: 255 }).default("active"),
  address: text("address"),
  district: text("district"),   // kecamatan (auto-detect dari koordinat)
  village: text("village"),     // kelurahan/desa (auto-detect dari koordinat)
  notes: text("notes"),
});

// Foto bukti ODP (gallery, multi-angle: depan, dalam, splitter, sticker label)
export const odpPhotos = mysqlTable("odp_photos", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  odpId: int("odp_id").references(() => odps.id).notNull(),
  photoPath: varchar("photo_path", { length: 255 }).notNull(), // relatif ke JABNET_UPLOAD_ROOT
  caption: text("caption"),
  uploadedBy: int("uploaded_by").notNull(),
  isCover: int("is_cover").notNull().default(0), // 0/1, max 1 cover per odp (enforced di app layer)
  createdAt: text("created_at").notNull(),
});

// Galeri foto generik untuk aset jaringan (odp/odc/pole/…). Menggantikan odp_photos
// sebagai sumber data tunggal (odp_photos di-migrasi ke sini, lihat startup migration).
// Polymorphic by (assetType, assetId) — tidak pakai FK karena lintas tabel aset.
export const assetPhotos = mysqlTable("asset_photos", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  assetType: varchar("asset_type", { length: 16 }).notNull(), // 'odp' | 'odc' | 'pole'
  assetId: int("asset_id").notNull(),
  photoPath: varchar("photo_path", { length: 255 }).notNull(), // relatif ke JABNET_UPLOAD_ROOT
  caption: text("caption"),
  uploadedBy: int("uploaded_by").notNull(),
  isCover: int("is_cover").notNull().default(0), // 0/1, max 1 cover per aset (enforced di app layer)
  createdAt: text("created_at").notNull(),
});

export const customers = mysqlTable("customers", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  name: text("name").notNull(),
  customerId: text("customer_id").notNull(),
  odpId: int("odp_id").references(() => odps.id),
  portNumber: int("port_number"),
  address: text("address"),
  lat: double("lat"),
  lng: double("lng"),
  package: text("package"),
  status: varchar("status", { length: 255 }).default("active"),
  phone: text("phone"),
  notes: text("notes"),
  email: text("email"),
  pppoeUsername: text("pppoe_username"),
  pppoePassword: text("pppoe_password"),
  pppoeProfile: text("pppoe_profile"),
  pppoeRouterId: int("pppoe_router_id"),
  pppoeMikrotikId: text("pppoe_mikrotik_id"), // .id from MikroTik PPP secret
  ontSerialNumber: text("ont_serial_number"), // SN perangkat ONT dari GenieACS
  isIsolir: int("is_isolir").default(0),
  billingPrice: int("billing_price"),
  installDate: text("install_date"),
  district: text("district"),
  village: text("village"),
  billingStatus: text("billing_status"),
  customerType: text("customer_type"),
  lastSyncAt: text("last_sync_at"),
  isStatic: int("is_static").default(0),
  manualOverrides: text("manual_overrides"), // JSON array of field names locked from billing sync
  leadId: int("lead_id"), // FK to leads table — traceability: lead mana yang jadi pelanggan ini
  // Billing whitelist fields (v4.1.2) — disync oleh BillingSyncWorker, TIDAK ditimpa field lain
  dueDate: text("due_date"),                   // Jatuh tempo invoice aktif
  lastPaymentDate: text("last_payment_date"),  // Tanggal pembayaran terakhir
  isolirDate: text("isolir_date"),             // Kapan diisolir (kalau isIsolir=1)
  billingSyncSource: varchar("billing_sync_source", { length: 255 }).default("billing.jabnet.id"),
  chatwootContactId: text("chatwoot_contact_id"),  // Chatwoot contact id setelah contact sync
  chatwootSyncedAt: text("chatwoot_synced_at"),    // ISO timestamp sync terakhir
});

export const poles = mysqlTable("poles", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  name: text("name").notNull(),
  code: text("code").notNull(),
  lat: double("lat"),
  lng: double("lng"),
  type: text("type"),
  height: double("height"),
  status: varchar("status", { length: 255 }).default("active"),
  notes: text("notes"),
});

export const cables = mysqlTable("cables", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  name: text("name").notNull(),
  code: text("code").notNull(),
  cableType: text("cable_type"),
  totalCore: int("total_core").default(0),
  usedCore: int("used_core").default(0),
  totalTube: int("total_tube").default(0),
  usedTube: int("used_tube").default(0),
  lengthMeters: double("length_meters"),
  startPoint: text("start_point"),
  endPoint: text("end_point"),
  pathCoordinates: text("path_coordinates"),
  status: varchar("status", { length: 255 }).default("active"),
  notes: text("notes"),
});

// ==================== NEW TABLES: CORE MANAGEMENT ====================

// OTB — Optical Termination Box (hanya di POP)
export const otbs = mysqlTable("otbs", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  popId: int("pop_id").references(() => pops.id).notNull(),
  name: text("name").notNull(),
  totalCores: int("total_cores").notNull(), // 12, 24, 48, 96
  status: varchar("status", { length: 255 }).default("active"),
  notes: text("notes"),
});

// Bestray — Slot di dalam ODC
export const bestrays = mysqlTable("bestrays", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  odcId: int("odc_id").references(() => odcs.id).notNull(),
  slotNumber: int("slot_number").notNull(),
  label: text("label"),
  totalPorts: int("total_ports").notNull(), // 4, 8, 12
  status: varchar("status", { length: 255 }).default("active"),
  notes: text("notes"),
});

// Splitter — bisa di OTB, ODC, ODP, atau lapangan
export const splitters = mysqlTable("splitters", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  name: text("name").notNull(),
  ratio: text("ratio").notNull(), // "1:4", "1:8", "1:16", "1:32"
  locationType: text("location_type").notNull(), // "otb", "odc", "odp", "field"
  locationId: int("location_id").notNull(),
  inputCoreId: int("input_core_id"), // FK ke cable_cores
  lat: double("lat"),
  lng: double("lng"),
  status: varchar("status", { length: 255 }).default("active"),
  notes: text("notes"),
});

// Cable Cores — setiap core individu dalam kabel
export const cableCores = mysqlTable("cable_cores", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  cableId: int("cable_id").references(() => cables.id).notNull(),
  tubeNumber: int("tube_number").notNull(),
  tubeColor: text("tube_color").notNull(),
  coreNumber: int("core_number").notNull(), // 1-12 per tube
  coreColor: text("core_color").notNull(),
  globalCoreNumber: int("global_core_number").notNull(), // 1-96 (tube*12 + core)
  status: varchar("status", { length: 255 }).default("available"), // available, used, reserved, broken
  notes: text("notes"),
});

// Core Connections — koneksi antar perangkat per core
export const coreConnections = mysqlTable("core_connections", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  label: text("label"),
  fromType: text("from_type").notNull(), // "otb", "bestray", "splitter_output", "odp"
  fromId: int("from_id").notNull(),
  fromPort: int("from_port").notNull(),
  toType: text("to_type").notNull(), // "bestray", "splitter_input", "odp", "customer"
  toId: int("to_id").notNull(),
  toPort: int("to_port"),
  cableCoreId: int("cable_core_id").references(() => cableCores.id),
  splitterId: int("splitter_id").references(() => splitters.id),
  notes: text("notes"),
});

// ==================== MARKETING CRM TABLES ====================

// Cache scraping per ODP+radius → hemat Google Places API quota
export const odpScrapeCache = mysqlTable("odp_scrape_cache", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  odpId: int("odp_id").references(() => odps.id).notNull(),
  radiusMeters: int("radius_meters").notNull(),
  scrapedBy: int("scraped_by"),
  scrapedAt: text("scraped_at").notNull(),
  placeCount: int("place_count").default(0),
});

// Prospek dari Google Places (disimpan permanen, deduplikasi by place_id)
export const prospects = mysqlTable("prospects", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  placeId: text("place_id").notNull(),   // Google Maps place_id (unique)
  name: text("name").notNull(),
  address: text("address"),
  category: text("category"),            // korporat | pendidikan | kesehatan | komersial | pemerintah
  lat: double("lat"),
  lng: double("lng"),
  phone: text("phone"),                  // disimpan, di-hide di UI sampai di-assign
  website: text("website"),
  odpId: int("odp_id").references(() => odps.id),
  distanceMeters: int("distance_meters"),
  cacheId: int("cache_id").references(() => odpScrapeCache.id),
  createdAt: text("created_at").notNull(),
});

// Sesi canvassing (marketing turun lapangan)
export const canvassingSessions = mysqlTable("canvassing_sessions", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  userId: int("user_id").notNull(),
  name: text("name"),                    // opsional: "Canvassing Tarogong - 3 Apr"
  areaDescription: text("area_description"),
  centerLat: double("center_lat"),
  centerLng: double("center_lng"),
  startedAt: text("started_at").notNull(),
  endedAt: text("ended_at"),             // null = sesi masih aktif
  leadCount: int("lead_count").default(0),
  status: varchar("status", { length: 255 }).default("active"), // active | completed
  notes: text("notes"),
});

// Laporan lapangan canvassing (Business Intelligence)
export const canvassingLogs = mysqlTable("canvassing_logs", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  sessionId: int("session_id").references(() => canvassingSessions.id).notNull(),
  userId: int("user_id").notNull(),
  type: text("type").notNull(), // "area_sepi" | "akses_sulit" | "kompetitor" | "infrastruktur" | "potensi_tinggi" | "lainnya"
  title: text("title").notNull(),
  description: text("description"),
  lat: double("lat"),
  lng: double("lng"),
  odpId: int("odp_id").references(() => odps.id),
  severity: varchar("severity", { length: 255 }).default("info"), // "info" | "warning" | "critical"
  photoData: text("photo_data"),              // DEPRECATED: legacy base64 (di-backfill ke filesystem, drop manual via SQL setelah verify)
  photoPath: varchar("photo_path", { length: 255 }), // relatif ke JABNET_UPLOAD_ROOT, e.g. "jabnet/canvassing/2026/05/142-7a3b1c9d.jpg"
  createdAt: text("created_at").notNull(),
});

// Lead pipeline (dari prospect finder ATAU canvassing)
export const leads = mysqlTable("leads", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),

  // Asal data
  source: text("source").notNull(),      // prospect_finder | canvassing | referral | inbound | meta_ads | tiktok_ads
  prospectId: int("prospect_id").references(() => prospects.id), // null kalau dari canvasing

  // Info kontak (phone & address di-hide sampai di-assign)
  name: text("name").notNull(),
  phone: text("phone"),
  address: text("address"),
  category: text("category"),            // rumahan | bisnis | perkantoran | sekolah | lainnya
  notes: text("notes"),

  // Lokasi
  lat: double("lat"),
  lng: double("lng"),
  odpId: int("odp_id").references(() => odps.id),
  distanceMeters: int("distance_meters"),
  district: text("district"),
  village: text("village"),

  // Pipeline
  stage: varchar("stage", { length: 255 }).default("new"),   // new | contacted | interested | negotiation | won | lost
  priority: varchar("priority", { length: 255 }).default("medium"), // low | medium | high
  lossReason: text("loss_reason"),

  // Assignment
  assignedTo: int("assigned_to"),    // user_id marketing, null = pool
  assignedBy: int("assigned_by"),
  assignedAt: text("assigned_at"),

  // Canvassing link
  canvassingSessionId: int("canvassing_session_id").references(() => canvassingSessions.id),

  // Meta
  createdBy: int("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
  closedAt: text("closed_at"),

  // Ads attribution (LP2b)
  campaign: text("campaign"),
  adSet: text("ad_set"),
  adName: text("ad_name"),
});

// ==================== MARKETING ADS CAMPAIGNS (v4.2.1) ====================
// Push-friendly: tabel untuk menyimpan data campaign Meta/TikTok/Google Ads
// yang di-push via Public API oleh eksternal (mis. bot openclaw di Telegram).
// Metrik (spend, impressions, clicks, leads, conversions) disimpan sebagai
// snapshot point-in-time. Untuk time-series granular, push harian per row baru
// atau update row yang existing via external_id (one-per-campaign semantic).
export const adCampaigns = mysqlTable("ad_campaigns", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  platform: text("platform").notNull(),              // meta_ads | tiktok_ads | google_ads | landing_page | other
  campaignName: text("campaign_name").notNull(),
  externalId: text("external_id"),                   // ID campaign di platform ads (unique per platform)
  status: varchar("status", { length: 255 }).default("active"),          // active | paused | ended
  objective: text("objective"),                      // leadgen | traffic | awareness | conversion
  audience: text("audience"),                        // describe singkat target audience
  dateStart: text("date_start"),                     // YYYY-MM-DD
  dateEnd: text("date_end"),                         // YYYY-MM-DD | null untuk ongoing
  budgetDaily: int("budget_daily"),              // Rp harian
  budgetTotal: int("budget_total"),              // Rp total lifetime
  spendTotal: int("spend_total").default(0),     // Rp total sudah terpakai
  impressions: int("impressions").default(0),
  clicks: int("clicks").default(0),
  leadsFromAd: int("leads_from_ad").default(0),  // reported by platform / pixel
  conversions: int("conversions").default(0),    // become paying customer
  revenue: int("revenue").default(0),            // Rp total revenue attributed
  utmSource: text("utm_source"),                     // utm_source=meta
  utmCampaign: text("utm_campaign"),                 // utm_campaign=<external_id>
  linkUrl: text("link_url"),                         // landing page URL
  thumbnailUrl: text("thumbnail_url"),               // creative preview URL
  notes: text("notes"),
  // Source tracking — dari API key mana pushed-nya
  createdByApiKeyId: int("created_by_api_key_id"),
  lastSyncedAt: text("last_synced_at"),              // terakhir di-push/update via API
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
});

export const insertAdCampaignSchema = createInsertSchema(adCampaigns);
export type AdCampaign = typeof adCampaigns.$inferSelect;
export type InsertAdCampaign = z.infer<typeof insertAdCampaignSchema>;

// Timeline aktivitas per lead
export const leadActivities = mysqlTable("lead_activities", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  leadId: int("lead_id").references(() => leads.id).notNull(),
  userId: int("user_id").notNull(),
  type: text("type").notNull(),          // note | call | whatsapp | visit | stage_change | assigned | photo
  content: text("content"),             // teks catatan atau JSON {"from":"new","to":"contacted"}
  photoData: text("photo_data"),         // DEPRECATED: legacy base64 (di-backfill ke filesystem)
  photoPath: varchar("photo_path", { length: 255 }), // relatif ke JABNET_UPLOAD_ROOT
  createdAt: text("created_at").notNull(),
});

// ==================== COLLECTION PIPELINE (v4.1.2) ====================
// Pelanggan yang isolir otomatis masuk ke pipeline collection untuk penagihan.
// Saat berhasil bayar (detect dari billing sync), auto-close ke stage=paid.

export const collections = mysqlTable("collections", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  customerId: int("customer_id").references(() => customers.id).notNull(),
  // Snapshot billing saat record dibuka (immutable)
  openedAt: text("opened_at").notNull(),
  openedBillingStatus: text("opened_billing_status"),
  openedDueDate: text("opened_due_date"),
  openedAmount: int("opened_amount"),            // billingPrice saat open
  openedIsolirDate: text("opened_isolir_date"),
  // Pipeline state
  stage: varchar("stage", { length: 255 }).default("new"),               // new | contacted | promised | issue | paid | written_off
  issueType: text("issue_type"),                      // no_contact | no_answer | promise_broken | financial_difficulty | moved_out | service_complaint | billing_dispute | lainnya
  promiseDate: text("promise_date"),                  // user input: janji bayar
  assignedTo: int("assigned_to"),
  assignedBy: int("assigned_by"),
  assignedAt: text("assigned_at"),
  // Close state
  closedAt: text("closed_at"),
  closeReason: text("close_reason"),                  // auto_paid | manual_paid | written_off_<reason>
  closedLastPaymentDate: text("closed_last_payment_date"),
  // Meta
  priority: varchar("priority", { length: 255 }).default("medium"),       // low | medium | high
  notes: text("notes"),
  createdBy: int("created_by"),                   // null = worker
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
});

export const collectionActivities = mysqlTable("collection_activities", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  collectionId: int("collection_id").references(() => collections.id).notNull(),
  userId: int("user_id"),                          // null = sistem/worker
  type: text("type").notNull(),                        // note | call | whatsapp | visit | stage_change | issue_set | promise_made | auto_opened | auto_closed | payment_detected
  content: text("content"),                            // teks atau JSON {"from":"new","to":"contacted"}
  photoData: text("photo_data"),                       // base64 (optional evidence foto kunjungan)
  createdAt: text("created_at").notNull(),
});

// Per-mitra collection pipeline — admin bisa CRUD stage (label, warna, urutan, tambah/hapus).
// `key` adalah slug stabil yang ditunjuk oleh collections.stage (immutable setelah dibuat).
// `role` menandai stage untuk otomasi billing: entry (target auto-open), paid (terminal sukses,
// auto-close saat lunas), writeoff (terminal gagal, auto write-off), none (stage menengah biasa).
export const collectionStages = mysqlTable("collection_stages", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  key: varchar("key", { length: 64 }).notNull(),         // slug stabil, unique per mitra
  label: varchar("label", { length: 255 }).notNull(),    // judul tampilan (editable)
  color: varchar("color", { length: 16 }).notNull().default("#6B7280"),
  position: int("position").notNull().default(0),        // urutan drag-drop
  role: varchar("role", { length: 16 }).notNull().default("none"), // none | entry | paid | writeoff
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
});

export const collectionConfig = mysqlTable("collection_config", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  pipelineId: int("pipeline_id").notNull(),
  enabled: int("enabled").notNull().default(0),
  entryThresholdDays: int("entry_threshold_days").notNull().default(7),
  entryMode: varchar("entry_mode", { length: 24 }).notNull().default("create_if_not_exists"),
  entryStageId: int("entry_stage_id"),
  paidStageId: int("paid_stage_id"),
  writeoffThresholdDays: int("writeoff_threshold_days"),
  writeoffAction: varchar("writeoff_action", { length: 16 }).notNull().default("move_stage"),
  writeoffStageId: int("writeoff_stage_id"),
  writeoffRuleId: int("writeoff_rule_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
}, (t) => ({ uniqPipeline: uniqueIndex("uniq_collection_config_pipeline").on(t.pipelineId) }));

export const collectionStageMap = mysqlTable("collection_stage_map", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  pipelineId: int("pipeline_id").notNull(),
  minOverdueDays: int("min_overdue_days").notNull(),
  maxOverdueDays: int("max_overdue_days"),
  stageId: int("stage_id").notNull(),
  position: int("position").notNull().default(0),
  createdAt: text("created_at").notNull(),
}, (t) => ({ byPipeline: index("idx_collection_stage_map_pipeline").on(t.mitraId, t.pipelineId, t.position) }));

export type CollectionConfig = typeof collectionConfig.$inferSelect;
export type CollectionStageMapRow = typeof collectionStageMap.$inferSelect;

// ===== Generic Pipelines Engine (Phase 1) — separate from leads/collections =====
export const pipelines = mysqlTable("pipelines", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  color: varchar("color", { length: 16 }).notNull().default("#0EA5E9"),
  icon: varchar("icon", { length: 64 }),
  position: int("position").notNull().default(0),
  isArchived: int("is_archived").notNull().default(0),
  restricted: int("restricted").notNull().default(0),
  teamId: int("team_id"),                    // Teamspace: pipeline milik tim (NULL = pipeline ops biasa)
  createdBy: int("created_by").notNull(),
  updatedBy: int("updated_by"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
}, (t) => ({
  byMitra: index("idx_pipelines_mitra").on(t.mitraId, t.position),
}));

export const pipelineStages = mysqlTable("pipeline_stages", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  pipelineId: int("pipeline_id").notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  description: text("description"),
  color: varchar("color", { length: 16 }).notNull().default("#6B7280"),
  position: int("position").notNull().default(0),
  semanticType: varchar("semantic_type", { length: 16 }),   // Teamspace: todo|in_progress|done|cancelled|custom (untuk laporan kinerja)
  movePermission: text("move_permission"),                  // Teamspace: JSON {userIds:[],roleIds:[]} — siapa boleh pindahkan kartu di list ini (NULL = semua)
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
}, (t) => ({
  byMitraPipeline: index("idx_pipeline_stages_mitra_pipeline").on(t.mitraId, t.pipelineId, t.position),
}));

export const pipelineCards = mysqlTable("pipeline_cards", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  pipelineId: int("pipeline_id").notNull(),
  stageId: int("stage_id").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  assigneeId: int("assignee_id"),
  priority: varchar("priority", { length: 16 }).notNull().default("medium"),
  dueDate: text("due_date"),
  tags: text("tags"),
  position: int("position").notNull().default(0),
  createdBy: int("created_by").notNull(),
  updatedBy: int("updated_by"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
  stageEnteredAt: text("stage_entered_at"),
  sourceCustomerId: int("source_customer_id"),
  sourceRuleId: int("source_rule_id"),
  masterCardId: int("master_card_id"),
  originCardId: int("origin_card_id"),
  relationType: varchar("relation_type", { length: 16 }),
  collectionCycle: int("collection_cycle"),
  // Teamspace (v5.0 Fase 1):
  isCompleted: int("is_completed").notNull().default(0),    // checkbox selesai (FR-405)
  completedAt: text("completed_at"),                        // timestamp selesai — dasar on-time rate
  coverPath: varchar("cover_path", { length: 255 }),        // cover image relatif JABNET_UPLOAD_ROOT
  isPrivate: int("is_private").notNull().default(0),        // "Rahasiakan" — hanya creator/assignee/follower/admin
  archivedAt: text("archived_at"),                          // arsip kartu (FR-409/414)
  recurrenceRule: text("recurrence_rule"),                  // FR-408 "Ulangi": JSON {freq,interval} — instance baru saat selesai
}, (t) => ({
  byMitraPipelineStage: index("idx_pipeline_cards_mitra_pipeline_stage").on(t.mitraId, t.pipelineId, t.stageId, t.position),
  byMaster: index("idx_pipeline_cards_master").on(t.mitraId, t.masterCardId),
}));

export const pipelineCardComments = mysqlTable("pipeline_card_comments", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  cardId: int("card_id").notNull(),
  authorId: int("author_id").notNull(),
  body: text("body").notNull(),
  type: varchar("type", { length: 16 }).notNull().default("note"), // note|call|whatsapp|visit|activity
  photoPath: varchar("photo_path", { length: 255 }),
  createdAt: text("created_at").notNull(),
}, (t) => ({
  byCard: index("idx_pipeline_card_comments_card").on(t.cardId),
}));

export const pipelineCardActivity = mysqlTable("pipeline_card_activity", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  cardId: int("card_id").notNull(),
  actorId: int("actor_id").notNull(),
  type: varchar("type", { length: 32 }).notNull(),
  detail: text("detail"),
  createdAt: text("created_at").notNull(),
}, (t) => ({
  byCard: index("idx_pipeline_card_activity_card").on(t.cardId),
}));

export const pipelineCardFollowers = mysqlTable("pipeline_card_followers", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  cardId: int("card_id").notNull(),
  userId: int("user_id").notNull(),
  createdAt: text("created_at").notNull(),
}, (t) => ({
  uniqCardUser: uniqueIndex("uniq_followers_card_user").on(t.cardId, t.userId),
}));

export const pipelineCardAssignees = mysqlTable("pipeline_card_assignees", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  cardId: int("card_id").notNull(),
  userId: int("user_id").notNull(),
  createdAt: text("created_at").notNull(),
}, (t) => ({
  uniqCardUser: uniqueIndex("uniq_card_assignee").on(t.cardId, t.userId),
  byMitraCard: index("idx_card_assignees_mitra_card").on(t.mitraId, t.cardId),
}));

export type PipelineCardAssignee = typeof pipelineCardAssignees.$inferSelect;

export const pipelineCardAttachments = mysqlTable("pipeline_card_attachments", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  cardId: int("card_id").notNull(),
  commentId: int("comment_id"), // NULL = card-level attachment; set = belongs to a comment
  pipelineId: int("pipeline_id").notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  filePath: varchar("file_path", { length: 255 }).notNull(),
  mimeType: varchar("mime_type", { length: 128 }).notNull(),
  sizeBytes: int("size_bytes").notNull(),
  kind: varchar("kind", { length: 8 }).notNull().default("file"),
  uploadedBy: int("uploaded_by").notNull(),
  createdAt: text("created_at").notNull(),
}, (t) => ({
  byCard: index("idx_card_attachments_mitra_card").on(t.mitraId, t.cardId),
}));

export type PipelineCardAttachment = typeof pipelineCardAttachments.$inferSelect;

export const cardRelations = mysqlTable("card_relations", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  cardId: int("card_id").notNull(),
  entityType: varchar("entity_type", { length: 16 }).notNull(),
  entityId: int("entity_id").notNull(),
  label: varchar("label", { length: 255 }),
  createdBy: int("created_by"),
  createdAt: text("created_at").notNull(),
}, (t) => ({
  byCard: index("idx_card_relations_mitra_card").on(t.mitraId, t.cardId),
  uniqCardEntity: uniqueIndex("uniq_card_relation").on(t.cardId, t.entityType, t.entityId),
}));

export type CardRelation = typeof cardRelations.$inferSelect;

// Pipeline Templates (Phase 5) — reusable pipeline structure snapshots.
export const pipelineTemplates = mysqlTable("pipeline_templates", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  icon: varchar("icon", { length: 64 }),
  color: varchar("color", { length: 16 }).notNull().default("#0EA5E9"),
  definition: text("definition").notNull(),
  isBuiltin: int("is_builtin").notNull().default(0),
  createdBy: int("created_by"),
  createdAt: text("created_at").notNull(),
}, (t) => ({ byMitra: index("idx_pipeline_templates_mitra").on(t.mitraId) }));

export type PipelineTemplate = typeof pipelineTemplates.$inferSelect;

export type Pipeline = typeof pipelines.$inferSelect;
export type PipelineStage = typeof pipelineStages.$inferSelect;
export type PipelineCard = typeof pipelineCards.$inferSelect;
export type PipelineCardComment = typeof pipelineCardComments.$inferSelect;
export type PipelineCardActivity = typeof pipelineCardActivity.$inferSelect;
export type PipelineCardFollower = typeof pipelineCardFollowers.$inferSelect;
export type PipelineCardPriority = "low" | "medium" | "high" | "urgent";

export const pipelineFields = mysqlTable("pipeline_fields", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  pipelineId: int("pipeline_id").notNull(),
  key: varchar("key", { length: 64 }).notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  type: varchar("type", { length: 16 }).notNull(),
  options: text("options"),
  config: text("config"),
  required: int("required").notNull().default(0),
  showOnCard: int("show_on_card").notNull().default(0),
  position: int("position").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
}, (t) => ({
  byPipeline: index("idx_pipeline_fields_mitra_pipeline").on(t.mitraId, t.pipelineId, t.position),
  uniqKey: uniqueIndex("uniq_pipeline_field_key").on(t.pipelineId, t.key),
}));

export const pipelineCardValues = mysqlTable("pipeline_card_values", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  cardId: int("card_id").notNull(),
  fieldId: int("field_id").notNull(),
  value: text("value"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
}, (t) => ({
  byCard: index("idx_pipeline_card_values_mitra_card").on(t.mitraId, t.cardId),
  byField: index("idx_pcv_mitra_field").on(t.mitraId, t.fieldId),
  uniqCardField: uniqueIndex("uniq_card_field").on(t.cardId, t.fieldId),
}));

export const pipelineAccess = mysqlTable("pipeline_access", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  pipelineId: int("pipeline_id").notNull(),
  roleId: int("role_id").notNull(),
  level: varchar("level", { length: 8 }).notNull(), // "view" | "edit" (legacy/coarse)
  capabilities: text("capabilities"), // JSON array of PipelineCapability; null → derive from level
  cardFilter: text("card_filter"), // JSON FieldRuleCondition[][] — restricts which cards this role sees
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
}, (t) => ({
  byPipeline: index("idx_pipeline_access_mitra_pipeline").on(t.mitraId, t.pipelineId),
  uniqPipelineRole: uniqueIndex("uniq_pipeline_access_role").on(t.pipelineId, t.roleId),
}));

export type PipelineAccess = typeof pipelineAccess.$inferSelect;
export type PipelineAccessLevel = "view" | "edit";

export const pipelineRules = mysqlTable("pipeline_rules", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  pipelineId: int("pipeline_id").notNull(),
  name: varchar("name", { length: 255 }),
  triggerStageId: int("trigger_stage_id"),
  actionType: varchar("action_type", { length: 32 }).notNull().default("create_card"),
  targetPipelineId: int("target_pipeline_id"),
  targetStageId: int("target_stage_id"),
  titleTemplate: varchar("title_template", { length: 255 }),
  copyAssignee: int("copy_assignee").notNull().default(0),
  enabled: int("enabled").notNull().default(1),
  createdBy: int("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
  actionConfig: text("action_config"),
  conditions: text("conditions"),
  triggerType: varchar("trigger_type", { length: 16 }).notNull().default("stage_enter"),
  triggerConfig: text("trigger_config"),
  recurrence: varchar("recurrence", { length: 16 }).notNull().default("once"),
}, (t) => ({
  byPipeline: index("idx_pipeline_rules_mitra_pipeline").on(t.mitraId, t.pipelineId),
}));

export const pipelineRuleFires = mysqlTable("pipeline_rule_fires", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  ruleId: int("rule_id").notNull(),
  sourceCardId: int("source_card_id").notNull(),
  firedAt: text("fired_at").notNull(),
}, (t) => ({
  uniqRuleCard: uniqueIndex("uniq_rule_fire_card").on(t.ruleId, t.sourceCardId),
  byRule: index("idx_rule_fires_mitra_rule").on(t.mitraId, t.ruleId),
}));

/** Traceability lead → card. Satu lead bisa menurunkan banyak card (mis. conversion bundle). */
export const leadCardLinks = mysqlTable("lead_card_links", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  leadId: int("lead_id").notNull(),
  cardId: int("card_id").notNull(),
  ruleId: int("rule_id"),
  createdAt: text("created_at").notNull(),
}, (t) => ({
  byMitraLead: index("idx_lead_card_links_mitra_lead").on(t.mitraId, t.leadId),
  byCard: index("idx_lead_card_links_card").on(t.cardId),
}));

export type LeadCardLink = typeof leadCardLinks.$inferSelect;
export type InsertLeadCardLink = typeof leadCardLinks.$inferInsert;

export const pipelineRuleFieldMaps = mysqlTable("pipeline_rule_field_maps", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  ruleId: int("rule_id").notNull(),
  sourceFieldId: int("source_field_id").notNull(),
  targetFieldId: int("target_field_id").notNull(),
  actionId: int("action_id"),
  createdAt: text("created_at").notNull(),
}, (t) => ({
  uniqRuleSource: uniqueIndex("uniq_rule_field_map_source").on(t.ruleId, t.sourceFieldId),
  byRule: index("idx_rule_field_maps_mitra_rule").on(t.mitraId, t.ruleId),
}));

export type PipelineRuleFieldMap = typeof pipelineRuleFieldMaps.$inferSelect;

export const pipelineRuleActions = mysqlTable("pipeline_rule_actions", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  ruleId: int("rule_id").notNull(),
  position: int("position").notNull().default(0),
  actionType: varchar("action_type", { length: 32 }).notNull(),
  actionConfig: text("action_config"),
  targetPipelineId: int("target_pipeline_id"),
  targetStageId: int("target_stage_id"),
  titleTemplate: varchar("title_template", { length: 255 }),
  copyAssignee: int("copy_assignee").notNull().default(0),
  createdAt: text("created_at").notNull(),
}, (t) => ({
  byRule: index("idx_rule_actions_mitra_rule").on(t.mitraId, t.ruleId, t.position),
}));

export type PipelineRuleAction = typeof pipelineRuleActions.$inferSelect;

export type PipelineRule = typeof pipelineRules.$inferSelect;
export type PipelineRuleFire = typeof pipelineRuleFires.$inferSelect;
export type PipelineRuleActionType = "create_card" | "set_field" | "move_stage" | "assign" | "notify" | "move_linked" | "set_field_linked" | "assign_linked";
export type RuleRecurrence = "once" | "on_reenter" | "always";
export type NotifyConfig = {
  channels: ("bell" | "webhook")[];
  bellTarget?: "assignee" | "user" | "creator";
  bellUserId?: number;
  bellTitle?: string;
  bellMessage?: string;
  webhookUrl?: string;
};
export type RuleTriggerType = "stage_enter" | "time" | "billing_sync" | "card_updated" | "assignee_changed" | "field_updated"
  | "lead_created" | "lead_updated" | "lead_assigned" | "lead_stage_changed" | "lead_converted";
export type TimeAnchor = "stage_entered" | "card_created" | "field_date";
export type TimeOffsetUnit = "hours" | "days";
export type TimeDirection = "after" | "before";
export type TimeRepeat = "once" | "every";
export type TimeTriggerConfig = {
  anchor: TimeAnchor;
  fieldId?: number;
  offsetN: number;
  offsetUnit: TimeOffsetUnit;
  direction: TimeDirection;
  repeat: TimeRepeat;
  repeatEveryN?: number;
};

export type RuleConditionOp = "eq" | "neq" | "contains" | "gt" | "lt" | "empty" | "not_empty";
// `source` defaults to "field" (legacy rows have no source). "billing" rows use `attr` (a
// CollectionAttrKey) instead of `fieldId`; "stage" rows (other consumers) carry the stage id in `fieldId`.
// "lead" rows use `attr` (a LeadConditionAttr key) evaluated against the intake lead object.
export type RuleCondition = {
  source?: "field" | "stage" | "billing" | "lead";
  fieldId?: number;
  attr?: string;
  op: RuleConditionOp;
  value?: string;
};
export type RuleConditionGroup = RuleCondition[]; // AND within a group; rule passes if ANY group passes

export type SetFieldConfig = { fieldId: number; value: string };
export type MoveStageConfig = { stageId: number };
export type AssignConfig = { assigneeId: number | null };

export type PipelineField = typeof pipelineFields.$inferSelect;
export type PipelineCardValue = typeof pipelineCardValues.$inferSelect;

// MP1: Per-pipeline configurable metrics
export const pipelineMetrics = mysqlTable("pipeline_metrics", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  pipelineId: int("pipeline_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: varchar("description", { length: 255 }),
  icon: varchar("icon", { length: 48 }),
  color: varchar("color", { length: 16 }).notNull().default("primary"),
  type: varchar("type", { length: 16 }).notNull().default("number"),
  source: varchar("source", { length: 16 }).notNull().default("card_count"),
  aggregation: varchar("aggregation", { length: 16 }).notNull().default("count"),
  fieldId: int("field_id"),
  stageIds: text("stage_ids"),
  conditions: text("conditions"),
  prefix: varchar("prefix", { length: 16 }),
  suffix: varchar("suffix", { length: 16 }),
  decimals: int("decimals"),
  timeField: varchar("time_field", { length: 24 }),   // null/"none" = timeless; "created"|"updated"|"field:<id>"
  timePreset: varchar("time_preset", { length: 16 }), // null = "all"
  timeFrom: text("time_from"),                          // custom range start (YYYY-MM-DD)
  timeTo: text("time_to"),                              // custom range end (YYYY-MM-DD)
  terms: text("terms"),                                 // formula source: JSON FormulaTerm[]
  formula: varchar("formula", { length: 255 }),         // formula source: expression string
  position: int("position").notNull().default(0),
  visible: int("visible").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
}, (t) => ({ byPipeline: index("idx_pipeline_metrics_mitra_pipeline").on(t.mitraId, t.pipelineId, t.position) }));
export type PipelineMetric = typeof pipelineMetrics.$inferSelect;

export type PipelineFieldType =
  | "text" | "textarea" | "number" | "currency" | "date"
  | "dropdown" | "multiselect" | "checkbox" | "user" | "phone" | "url" | "coordinate";
export const PIPELINE_FIELD_TYPES: PipelineFieldType[] =
  ["text","textarea","number","currency","date","dropdown","multiselect","checkbox","user","phone","url","coordinate"];

export const kpiSnapshots = mysqlTable("kpi_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  snapshotDate: varchar("snapshot_date", { length: 10 }).notNull(), // YYYY-MM-DD local
  activeCount: int("active_count").notNull().default(0),
  isolirCount: int("isolir_count").notNull().default(0),
  totalCount: int("total_count").notNull().default(0),
  mrr: bigint("mrr", { mode: "number" }).notNull().default(0),
  arpu: int("arpu").notNull().default(0),
  revenueAtRisk: bigint("revenue_at_risk", { mode: "number" }).notNull().default(0),
  newActivations: int("new_activations").notNull().default(0),
  collectionsOpen: int("collections_open").notNull().default(0),
  collectionsClosedToday: int("collections_closed_today").notNull().default(0),
  outstandingAmount: bigint("outstanding_amount", { mode: "number" }).notNull().default(0),
  // Teamspace v5.0 Fase 3 (§14.4): tren harian tugas internal — upsert oleh teamspace-worker
  teamspaceTasksTotal: int("teamspace_tasks_total").default(0),
  teamspaceTasksDone: int("teamspace_tasks_done").default(0),
  teamspaceTasksOverdue: int("teamspace_tasks_overdue").default(0),
  teamspaceCheckinsToday: int("teamspace_checkins_today").default(0),
  createdAt: text("created_at").notNull(),
});

export type KpiSnapshot = typeof kpiSnapshots.$inferSelect;

// Multi-user assignment per collection — semua assignee equal (siapa pun bisa edit/update).
// collections.assigned_to tetap di-maintain sebagai "primary" (= first/earliest assignee) untuk backwards compat.
export const collectionAssignees = mysqlTable("collection_assignees", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  collectionId: int("collection_id").references(() => collections.id).notNull(),
  userId: int("user_id").notNull(),
  assignedBy: int("assigned_by"),                      // null = sistem/migration backfill
  assignedAt: text("assigned_at").notNull(),
});

// ==================== CUSTOMER PORTAL (v4.1.3) ====================
// Self-service portal untuk pelanggan: login via customerId + OTP WhatsApp,
// lihat traffic, ganti WiFi, restart ONT, lihat tagihan, lapor kendala.

export const customerOtps = mysqlTable("customer_otps", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  customerId: int("customer_id").references(() => customers.id).notNull(),
  otpCodeHash: text("otp_code_hash").notNull(),    // bcrypt hash 6-digit code
  phone: text("phone").notNull(),                   // untuk audit (masked di UI)
  expiresAt: text("expires_at").notNull(),          // ISO timestamp, TTL 5 menit
  verifiedAt: text("verified_at"),
  attempts: int("attempts").default(0),
  status: varchar("status", { length: 255 }).default("pending"),        // pending | verified | expired | locked
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: text("created_at").notNull(),
});

export const customerPortalSessions = mysqlTable("customer_portal_sessions", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  customerId: int("customer_id").references(() => customers.id).notNull(),
  token: text("token").notNull(),                   // 96-char hex (generateSecureToken)
  phoneMasked: text("phone_masked"),                // untuk display
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),          // TTL 2 jam, extend on activity
  lastActivityAt: text("last_activity_at"),
  revokedAt: text("revoked_at"),                    // logout
});

export const trafficSnapshots = mysqlTable("traffic_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  customerId: int("customer_id").references(() => customers.id).notNull(),
  timestamp: text("timestamp").notNull(),           // ISO
  pppoeUsername: text("pppoe_username"),
  routerId: int("router_id"),
  ipAddress: text("ip_address"),
  bytesIn: int("bytes_in").default(0),
  bytesOut: int("bytes_out").default(0),
  uptimeSeconds: int("uptime_seconds").default(0),
  sessionId: text("session_id"),
});

// ==================== LOYALTY — JABNET SAHABAT (v4.1.9) ====================
// Aligned ke program resmi "JABNET Sahabat" (3 tier + 5 level Perunggu→Berlian).
// Reward struktur:
//   - Tier 1 Sahabat Pelanggan (auto-enroll, semua customer):
//       per referral sukses → Voucher Indomaret Rp 50K / Potongan Tagihan Rp 75K / kumpul 3 = +5 Mbps permanen
//       milestone 3 ref = voucher Rp 150K, 5 = 1 bln gratis, 10 = 3 bln gratis, 20 = upgrade ke Tier 2
//   - Tier 2 Sahabat RT/RW (kontrak legal) — 5 level by referral count:
//       Perunggu (5), Perak (10), Emas (20), Platinum (30), Berlian (50) → reward cash + internet gratis
//       Setelah Berlian → Ambassador (15% rev share)
//   - Tier 3 Sahabat Desa (BUMDes) — kantor gratis + 10% rev share ke BUMDes
// Streak tepat-waktu tetap tracked untuk internal insight (tidak diekspos sbg reward utama).

/** Per-customer loyalty state — auto-computed via BillingSyncWorker + admin upgrade manual */
export const customerLoyalty = mysqlTable("customer_loyalty", {
  customerId: int("customer_id").primaryKey().references(() => customers.id),
  mitraId: int("mitra_id").notNull().default(1),
  // Streak metrics (tetap di-track internal, untuk insight bukan reward utama)
  onTimeStreak: int("on_time_streak").default(0),         // bulan berturut bayar tepat waktu
  longestStreak: int("longest_streak").default(0),        // rekor tertinggi
  totalOnTimePayments: int("total_on_time_payments").default(0),
  totalLatePayments: int("total_late_payments").default(0),
  lastPaymentEvaluatedDate: text("last_payment_evaluated_date"), // lastPaymentDate terakhir yang diproses
  // Referral
  referralCode: varchar("referral_code", { length: 32 }).unique(), // legacy alias — simpan sama dgn sahabatCode
  sahabatCode: varchar("sahabat_code", { length: 32 }).unique(),   // JABNET format "SHB-TRG-001" (kecamatan 3-huruf + seq)
  referredByCustomerId: int("referred_by_customer_id"),   // FK ke customers.id, kalau customer ini masuk via referral
  referredAt: text("referred_at"),                            // ISO saat daftar via referral
  // Sahabat tier & level
  sahabatTier: varchar("sahabat_tier", { length: 255 }).default("pelanggan"),     // pelanggan | rtrw | desa
  sahabatLevel: varchar("sahabat_level", { length: 255 }).default("new"),         // new | perunggu | perak | emas | platinum | berlian | ambassador
  totalSuccessfulReferrals: int("total_successful_referrals").default(0), // count status="rewarded"
  contractSignedAt: text("contract_signed_at"),               // ISO — saat tanda tangan kontrak Tier 2 (naik ke RT/RW)
  // Tenure tracking (masih berguna utk "lama berlangganan" display — legacy v4.1.8)
  tenureBadge: varchar("tenure_badge", { length: 255 }).default("tetangga"),      // tetangga | keluarga | sahabat | abadi (display only)
  tenureMonths: int("tenure_months").default(0),
  // v4.2.2 — Points & Speed-on-Demand
  pointsBalance: int("points_balance").default(0),                     // current redeemable points
  pointsLifetimeEarned: int("points_lifetime_earned").default(0),
  pointsLifetimeRedeemed: int("points_lifetime_redeemed").default(0),
  // Admin freeze (v4.4.0)
  isFrozen: int("is_frozen").notNull().default(0),                 // 0/1 — block reward issuance
  frozenReason: varchar("frozen_reason", { length: 255 }),
  frozenAt: text("frozen_at"),
  frozenBy: int("frozen_by"),                                       // user_id staff
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
});

/**
 * Point ledger — append-only audit trail untuk earn/redeem/adjust.
 */
export const pointTransactions = mysqlTable("point_transactions", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  customerId: int("customer_id").notNull().references(() => customers.id),
  type: text("type").notNull(),                // earn | redeem | adjust | refund
  amount: int("amount").notNull(),         // positive (earn) atau negative (redeem)
  source: text("source").notNull(),            // on_time_payment | early_payment | redemption | manual_adjust | refund_redemption
  refId: int("ref_id"),                    // FK ke point_redemptions.id atau lainnya
  balanceAfter: int("balance_after").notNull(),
  notes: text("notes"),
  createdBy: int("created_by"),            // user_id staff (kalau manual) atau null (kalau auto)
  createdAt: text("created_at").notNull(),
});

export const insertPointTransactionSchema = createInsertSchema(pointTransactions);
export type PointTransaction = typeof pointTransactions.$inferSelect;
export type InsertPointTransaction = z.infer<typeof insertPointTransactionSchema>;

/**
 * Point redemption — request + lifecycle Speed-on-Demand boost.
 */
export const pointRedemptions = mysqlTable("point_redemptions", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  customerId: int("customer_id").notNull().references(() => customers.id),
  rewardKey: text("reward_key").notNull(),         // boost_2x_6h, boost_3x_24h, dst
  rewardLabel: text("reward_label").notNull(),
  pointsCost: int("points_cost").notNull(),
  speedMultiplier: int("speed_multiplier").notNull(), // 2 = 2x, 3 = 3x
  durationHours: int("duration_hours").notNull(),
  status: varchar("status", { length: 255 }).default("pending"),       // pending | active | expired | cancelled | rejected
  // Lifecycle timestamps
  startAt: text("start_at"),                       // di-set saat verify
  endAt: text("end_at"),                           // di-set saat verify (startAt + durationHours)
  verifiedBy: int("verified_by"),              // user_id staff
  verifiedAt: text("verified_at"),
  rejectionReason: text("rejection_reason"),
  cancelledAt: text("cancelled_at"),
  cancelledBy: int("cancelled_by"),
  notes: text("notes"),
  // PPP profile tracking (untuk auto-revert)
  originalPppProfile: text("original_ppp_profile"),
  boostedPppProfile: text("boosted_ppp_profile"),
  // Revert health (v4.2.3+) — track auto-revert success saat expire
  revertedAt: text("reverted_at"),                  // null = belum di-revert
  revertError: text("revert_error"),                // pesan error terakhir kalau gagal
  revertAttempts: int("revert_attempts").default(0),
  deletedAt: text("deleted_at"),                    // soft delete
  createdAt: text("created_at").notNull(),
});

export const insertPointRedemptionSchema = createInsertSchema(pointRedemptions);
export type PointRedemption = typeof pointRedemptions.$inferSelect;
export type InsertPointRedemption = z.infer<typeof insertPointRedemptionSchema>;

/** Diskon entitlement — auto-generate dari streak milestone atau referral reward.
 *  Status flow: pending → applied_to_invoice (oleh billing manual atau otomatis) → done
 *              atau pending → expired (kalau lewat 3 bulan tidak di-apply)
 */
export const customerDiscounts = mysqlTable("customer_discounts", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  customerId: int("customer_id").notNull().references(() => customers.id),
  source: text("source").notNull(),               // Sahabat: ref_voucher_50k | ref_bill_75k | ref_speed_boost_5mbps | milestone_3ref | milestone_5ref | milestone_10ref | milestone_20ref | sahabat_perunggu | sahabat_perak | sahabat_emas | sahabat_platinum | sahabat_berlian | referral_referee_welcome | streak_* (legacy) | seasonal
  discountType: text("discount_type").notNull(),  // percent | free_days | voucher_indomaret | cash_bonus | speed_upgrade
  discountValue: int("discount_value").notNull(), // percent: 5/10/50 • free_days: 7/30/90/365/730/1095 • voucher: nominal Rp • cash: nominal Rp • speed: Mbps
  description: text("description"),
  eligibleForPeriod: text("eligible_for_period"), // "YYYY-MM" — bulan target apply
  status: varchar("status", { length: 255 }).default("pending"),      // pending | applied | expired | cancelled
  expiresAt: text("expires_at"),                  // ISO — default 90 hari dari generate
  appliedAt: text("applied_at"),
  appliedByUserId: int("applied_by_user_id"), // staff yang manual apply
  invoiceRef: text("invoice_ref"),                // referensi invoice kalau ada
  deletedAt: text("deleted_at"),                    // soft delete
  createdAt: text("created_at").notNull(),
});

/** Referral tracking — customer invite tetangga */
export const customerReferrals = mysqlTable("customer_referrals", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  referrerCustomerId: int("referrer_customer_id").notNull().references(() => customers.id),
  referralCode: text("referral_code").notNull(),
  // Referee info (mungkin belum jadi customer)
  refereePhone: text("referee_phone"),            // nomor HP calon pelanggan (untuk track pre-daftar)
  refereeName: text("referee_name"),              // nama calon (optional, dari referrer input)
  refereeCustomerId: int("referee_customer_id"), // diisi saat mereka terdaftar jadi customer
  status: varchar("status", { length: 255 }).default("invited"),      // invited | registered | rewarded | expired
  firstPaymentAt: text("first_payment_at"),       // saat referee bayar pertama
  rewardCreditedAt: text("reward_credited_at"),   // saat kedua belah pihak dapet reward
  notes: text("notes"),
  deletedAt: text("deleted_at"),                    // soft delete
  createdAt: text("created_at").notNull(),
});

export const insertCustomerLoyaltySchema = createInsertSchema(customerLoyalty);
export const insertCustomerDiscountSchema = createInsertSchema(customerDiscounts).omit({ id: true });
export const insertCustomerReferralSchema = createInsertSchema(customerReferrals).omit({ id: true });
export type CustomerLoyalty = typeof customerLoyalty.$inferSelect;
export type InsertCustomerLoyalty = z.infer<typeof insertCustomerLoyaltySchema>;
export type CustomerDiscount = typeof customerDiscounts.$inferSelect;
export type InsertCustomerDiscount = z.infer<typeof insertCustomerDiscountSchema>;
export type CustomerReferral = typeof customerReferrals.$inferSelect;
export type InsertCustomerReferral = z.infer<typeof insertCustomerReferralSchema>;

// v4.1.3: MPWA Message Templates — reusable untuk OTP, notif tagihan, isolir, dll
// v4.2.19: Extended dengan footer + buttons + media untuk broadcast
// v4.2.20: Extended dengan templateType (pelanggan/reseller/system), customerFilter,
//           shareToReseller, dan content sebagai rich-text HTML
export const mpwaTemplates = mysqlTable("mpwa_templates", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  key: text("key").notNull(),                       // unique code: "otp_login", "tagihan_reminder"
  name: text("name").notNull(),                     // display: "OTP Login Portal"
  description: text("description"),
  content: text("content").notNull(),               // template dengan {placeholder} (rich-text HTML untuk v2)
  placeholders: text("placeholders"),               // JSON array ["otp", "ttlMin"] untuk UI hint
  category: varchar("category", { length: 255 }).default("general"),    // auth | billing | notification | general | broadcast
  isSystem: int("is_system").default(0),        // 1 = tidak bisa dihapus (template inti)
  // v4.2.19: Broadcast extensions
  footer: text("footer"),                           // Footer text (small grey text di bawah message)
  buttons: text("buttons"),                         // JSON array of buttons [{type, label, payload}]
  mediaUrl: text("media_url"),                      // URL gambar / video untuk attach
  mediaType: text("media_type"),                    // "image" | "video" | "document"
  // v4.2.20: PRD WA Feature v2 — template type + customer filter + reseller share
  templateType: varchar("template_type", { length: 255 }).default("pelanggan"),    // pelanggan | reseller | system
  templateChannel: varchar("template_channel", { length: 255 }).default("unofficial"), // unofficial | official (mengikuti tab di PRD)
  customerFilter: varchar("customer_filter", { length: 255 }).default("all"),      // all | unpaid (saat broadcast pelanggan)
  shareToReseller: int("share_to_reseller").default(0),    // toggle "Tampilkan ke seluruh reseller"
  // v4.2.23: Compatibility mode untuk handle "versi WA tidak mendukung" issue
  // native = MPWA /send-button (interactive, butuh image)
  // text-link = render button sebagai text + clickable link (universal, kompatibel semua WA)
  compatMode: varchar("compat_mode", { length: 255 }).default("native"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
});

// v4.2.20: WhatsApp Devices — multi-device dengan 12 provider gateway support
export const waDevices = mysqlTable("wa_devices", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  name: text("name").notNull(),                              // "885 - MPWA MORIZT"
  phone: text("phone").notNull(),                            // "6289630599885"
  provider: text("provider").notNull(),                      // mpwa | wablas | fonnte | starsender | watzap | wachayo | mekari_qontak | mobichat | halo_ai | pancake | kommo | bales_otomatis
  providerChannel: varchar("provider_channel", { length: 255 }).default("unofficial"), // unofficial | official
  // Provider-specific config (JSON) — apiKey, url, token, secret, dst.
  config: text("config"),                                    // JSON: { apiKey, url, token, secret, ... }
  delaySeconds: int("delay_seconds").default(2),         // 1-30, jeda antar pesan
  isActive: int("is_active").default(1),
  lastSuccessAt: text("last_success_at"),
  lastErrorAt: text("last_error_at"),
  lastError: text("last_error"),
  // v4.2.21: MPWA-specific device state (QR scanning + connection)
  connectionStatus: varchar("connection_status", { length: 255 }).default("unknown"),  // unknown | connected | disconnect | qr_pending
  lastQrAt: text("last_qr_at"),
  lastQrData: text("last_qr_data"),                                 // base64 QR untuk re-show kalau belum di-scan
  webhookToken: text("webhook_token"),                              // random token unik per device, untuk validasi webhook
  webhookUrl: text("webhook_url"),                                  // URL webhook yang di-set di MPWA panel
  deviceInfo: text("device_info"),                                  // cache JSON dari /info-devices terakhir
  createdBy: int("created_by"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
});

// v4.2.21: Incoming WhatsApp messages (dari webhook MPWA / provider lain)
export const waInbox = mysqlTable("wa_inbox", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  deviceId: int("device_id").notNull(),                  // FK wa_devices.id
  fromNumber: text("from_number").notNull(),                 // pengirim (62xxx)
  fromName: text("from_name"),                               // display name dari WA
  message: text("message"),                                  // text body / caption
  mediaType: text("media_type"),                             // image | video | audio | document | sticker
  mediaUrl: text("media_url"),                               // kalau ada media (server saved)
  isGroup: int("is_group").default(0),
  participant: text("participant"),                           // kalau group, sender asli
  rawPayload: text("raw_payload"),                           // full JSON dari webhook (debug)
  status: varchar("status", { length: 255 }).default("new"),                     // new | read | replied | archived
  repliedAt: text("replied_at"),
  receivedAt: text("received_at").notNull(),
});

// v4.2.24: Phonebooks — group/list of contacts (custom, terpisah dari customers)
// Untuk broadcast ke list yang user bikin sendiri (reseller VIP, tim internal, calon pelanggan, dll)
export const phonebooks = mysqlTable("phonebooks", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  name: text("name").notNull(),
  description: text("description"),
  color: varchar("color", { length: 255 }).default("#7367f0"),         // hex color untuk badge
  icon: text("icon"),                              // lucide icon name (opsional)
  contactCount: int("contact_count").default(0), // cached count
  createdBy: int("created_by"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
});

// v4.2.24: Phonebook contacts — kontak per phonebook
export const phonebookContacts = mysqlTable("phonebook_contacts", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  phonebookId: int("phonebook_id").notNull(),  // FK phonebooks.id
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  address: text("address"),
  notes: text("notes"),
  // Custom fields fleksibel — JSON object untuk additional data (e.g. {paket: "20M", referer: "Bu Ani"})
  customFields: text("custom_fields"),             // JSON
  // Auto-link ke customer kalau ada (untuk akses 28 params pelanggan saat broadcast)
  customerId: int("customer_id"),              // FK customers.id (opsional)
  // v4.2.27: tags untuk kategorisasi per kontak (e.g. ["VIP", "Reseller", "Pelanggan Lama"])
  tags: text("tags"),                              // JSON array of strings
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
});

export const insertPhonebookSchema = createInsertSchema(phonebooks).omit({ id: true });
export const insertPhonebookContactSchema = createInsertSchema(phonebookContacts).omit({ id: true });
export type Phonebook = typeof phonebooks.$inferSelect;
export type InsertPhonebook = z.infer<typeof insertPhonebookSchema>;
export type PhonebookContact = typeof phonebookContacts.$inferSelect;
export type InsertPhonebookContact = z.infer<typeof insertPhonebookContactSchema>;

// Multi-tenant root: ISP partner companies using JABNET platform.
// Note: previously named `resellers` (broadcast targets); migrated to `mitras` in Phase A.
// Old broadcast-resellers fields (saldo, commission_rate, joined_at) kept for backward compat.
export const mitras = mysqlTable("mitras", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 50 }),
  displayName: text("display_name"),
  logoUrl: text("logo_url"),
  features: text("features"),
  primaryContactName: text("primary_contact_name"),
  primaryContactPhone: text("primary_contact_phone"),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  address: text("address"),
  district: text("district"),
  saldo: int("saldo").default(0),
  commissionRate: int("commission_rate").default(0),
  joinedAt: text("joined_at"),
  isActive: int("is_active").default(1),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
});

// Backward-compat aliases for broadcast-resellers feature (Phase A rename).
// All existing code using `resellers` / `Reseller` continues working.
export const resellers = mitras;

export const insertMpwaTemplateSchemaNew = createInsertSchema(mpwaTemplates).omit({ id: true });
export const insertWaDeviceSchema = createInsertSchema(waDevices).omit({ id: true });
export const insertMitraSchema = createInsertSchema(mitras).omit({ id: true });
export const insertResellerSchema = insertMitraSchema;
export const insertWaInboxSchema = createInsertSchema(waInbox).omit({ id: true });
export type WaDevice = typeof waDevices.$inferSelect;
export type InsertWaDevice = z.infer<typeof insertWaDeviceSchema>;
export type Mitra = typeof mitras.$inferSelect;
export type Reseller = Mitra;
export type InsertMitra = z.infer<typeof insertMitraSchema>;
export type InsertReseller = InsertMitra;
export type WaInboxMessage = typeof waInbox.$inferSelect;
export type InsertWaInboxMessage = z.infer<typeof insertWaInboxSchema>;

// v4.2.20: 12 WhatsApp Providers (6 unofficial + 6 official) sesuai PRD
export const WA_PROVIDERS = {
  // === UNOFFICIAL (6) ===
  mpwa:            { label: "MPWA",            channel: "unofficial", fields: ["apiKey", "url"] },
  starsender:      { label: "Starsender",      channel: "unofficial", fields: ["apiKey", "deviceId"] },
  watzap:          { label: "Watzap",          channel: "unofficial", fields: ["apiKey", "numberKey"] },
  wablas:          { label: "Wablas",          channel: "unofficial", fields: ["token", "secret", "url"] },
  fonnte:          { label: "Fonnte",          channel: "unofficial", fields: ["token"] },
  wachayo:         { label: "WACHAYO",         channel: "unofficial", fields: ["apiKey", "url"] },
  // === OFFICIAL (6) ===
  mekari_qontak:   { label: "Mekari Qontak",   channel: "official",   fields: ["apiKey", "url", "channelId"] },
  mobichat:        { label: "Mobichat",        channel: "official",   fields: ["apiKey", "channelId"] },
  halo_ai:         { label: "Halo AI",         channel: "official",   fields: ["apiKey", "url"] },
  pancake:         { label: "Pancake",         channel: "official",   fields: ["apiKey", "pageId"] },
  kommo:           { label: "Kommo",           channel: "official",   fields: ["apiKey", "subdomain"] },
  bales_otomatis:  { label: "Bales Otomatis",  channel: "official",   fields: ["apiKey"] },
} as const;
export type WaProviderKey = keyof typeof WA_PROVIDERS;

// v4.2.19: Broadcast Campaign — single send job ke segment audience
export const broadcastCampaigns = mysqlTable("broadcast_campaigns", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  name: text("name").notNull(),
  description: text("description"),
  templateId: int("template_id").notNull(),     // FK mpwa_templates.id
  // Audience: filter JSON ATAU savedSegmentId
  audienceFilter: text("audience_filter"),          // JSON: { rules: [...], combine: "all"|"any" }
  savedSegmentId: int("saved_segment_id"),      // FK broadcast_segments.id (optional)
  audienceCount: int("audience_count").default(0),
  // Optional override (kalau mau pakai konten beda dari template default)
  contentOverride: text("content_override"),
  footerOverride: text("footer_override"),
  buttonsOverride: text("buttons_override"),
  // Scheduling
  status: varchar("status", { length: 255 }).notNull().default("draft"), // draft | scheduled | running | completed | cancelled | failed
  scheduledAt: text("scheduled_at"),                // ISO — kalau dijadwalkan
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  // Rate limit (override default 2 detik)
  rateLimitMs: int("rate_limit_ms").default(2000),
  // Stats
  sentCount: int("sent_count").default(0),
  failedCount: int("failed_count").default(0),
  skippedCount: int("skipped_count").default(0),
  // v4.2.20: PRD WA v2
  deviceId: int("device_id"),                                // FK wa_devices.id
  targetType: varchar("target_type", { length: 255 }).default("pelanggan"),          // pelanggan | reseller
  // v4.2.20 fix: direct recipients (bypass filter) — JSON array of {phone,name,customerId?,resellerId?}
  directRecipients: text("direct_recipients"),
  // v4.2.20 fix: manual inputs (untuk substitute {{input_manual_text}} / {{input_manual_tanggal}})
  manualText: text("manual_text"),
  manualDate: text("manual_date"),
  // Meta
  createdBy: int("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
});

// v4.2.19: Broadcast Recipients — per-customer per-campaign tracking
export const broadcastRecipients = mysqlTable("broadcast_recipients", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  campaignId: int("campaign_id").notNull(),
  customerId: int("customer_id"),               // nullable: broadcast bisa juga ke non-customer
  phone: text("phone").notNull(),                   // snapshot saat enrolled
  customerName: text("customer_name"),              // snapshot nama
  renderedMessage: text("rendered_message"),       // konten setelah substitusi placeholder
  status: varchar("status", { length: 255 }).notNull().default("pending"), // pending | sending | sent | failed | skipped
  sentAt: text("sent_at"),
  errorMessage: text("error_message"),
  mpwaResponse: text("mpwa_response"),              // JSON response dari MPWA (untuk debug)
  retryCount: int("retry_count").default(0),
  createdAt: text("created_at").notNull(),
});

// v4.2.19: Saved Audience Segments — reusable filter sets
export const broadcastSegments = mysqlTable("broadcast_segments", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  name: text("name").notNull(),
  description: text("description"),
  filter: text("filter").notNull(),                 // JSON { rules: [...], combine: "all"|"any" }
  lastCount: int("last_count").default(0),      // last evaluated count
  lastEvaluatedAt: text("last_evaluated_at"),
  isSystem: int("is_system").default(0),        // segment built-in (semua aktif, isolir, dll)
  createdBy: int("created_by"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
});

export const insertBroadcastCampaignSchema = createInsertSchema(broadcastCampaigns).omit({ id: true });
export const insertBroadcastRecipientSchema = createInsertSchema(broadcastRecipients).omit({ id: true });
export const insertBroadcastSegmentSchema = createInsertSchema(broadcastSegments).omit({ id: true });
export type BroadcastCampaign = typeof broadcastCampaigns.$inferSelect;
export type InsertBroadcastCampaign = z.infer<typeof insertBroadcastCampaignSchema>;
export type BroadcastRecipient = typeof broadcastRecipients.$inferSelect;
export type InsertBroadcastRecipient = z.infer<typeof insertBroadcastRecipientSchema>;
export type BroadcastSegment = typeof broadcastSegments.$inferSelect;
export type InsertBroadcastSegment = z.infer<typeof insertBroadcastSegmentSchema>;

export const insertCustomerOtpSchema = createInsertSchema(customerOtps).omit({ id: true });
export const insertCustomerPortalSessionSchema = createInsertSchema(customerPortalSessions).omit({ id: true });
export const insertTrafficSnapshotSchema = createInsertSchema(trafficSnapshots).omit({ id: true });
export const insertMpwaTemplateSchema = createInsertSchema(mpwaTemplates).omit({ id: true });
export type CustomerOtp = typeof customerOtps.$inferSelect;
export type InsertCustomerOtp = typeof customerOtps.$inferInsert;
export type CustomerPortalSession = typeof customerPortalSessions.$inferSelect;
export type InsertCustomerPortalSession = typeof customerPortalSessions.$inferInsert;
export type TrafficSnapshot = typeof trafficSnapshots.$inferSelect;
export type InsertTrafficSnapshot = typeof trafficSnapshots.$inferInsert;
export type MpwaTemplate = typeof mpwaTemplates.$inferSelect;
export type InsertMpwaTemplate = typeof mpwaTemplates.$inferInsert;

// Permission key baru untuk MPWA
export const MPWA_TEMPLATE_CATEGORIES = ["auth", "billing", "notification", "general"] as const;
export type MpwaTemplateCategory = typeof MPWA_TEMPLATE_CATEGORIES[number];
export const MPWA_TEMPLATE_CATEGORY_LABELS: Record<MpwaTemplateCategory, string> = {
  auth: "Autentikasi",
  billing: "Tagihan",
  notification: "Notifikasi",
  general: "Umum",
};

// Stage order = display order di Kanban. `suspend` = pre-isolir warning (overdue tapi belum isolir).
// `promised` di-deprecated → di-migrate ke `contacted` (promise_date tetap di kolom collections.promise_date).
export const COLLECTION_STAGES = ["suspend", "new", "contacted", "dikunjungi", "issue", "paid", "written_off"] as const;
export type CollectionStage = typeof COLLECTION_STAGES[number];

export const COLLECTION_STAGE_LABELS: Record<CollectionStage, string> = {
  suspend: "Suspend",
  new: "Baru Isolir",
  contacted: "Sudah Dihubungi",
  dikunjungi: "Sudah Dikunjungi",
  issue: "Bermasalah",
  paid: "Lunas ✅",
  written_off: "Write-Off ❌",
};

export const COLLECTION_STAGE_COLORS: Record<CollectionStage, string> = {
  suspend: "#F59E0B",
  new: "#EF4444",
  contacted: "#3B82F6",
  dikunjungi: "#8B5CF6",
  issue: "#DC2626",
  paid: "#22C55E",
  written_off: "#6B7280",
};

// Template default pipeline collection — dipakai untuk seed mitra 1 (JABNET) saat migrasi,
// lalu di-clone ke tiap mitra lain/baru. Urutan = posisi awal. Role menandai stage untuk
// otomasi billing (entry=auto-open target, paid=auto-close, writeoff=auto write-off).
export const DEFAULT_COLLECTION_STAGES: Array<{ key: string; label: string; color: string; role: CollectionStageRole }> =
  COLLECTION_STAGES.map((key) => ({
    key,
    label: COLLECTION_STAGE_LABELS[key],
    color: COLLECTION_STAGE_COLORS[key],
    role: key === "new" ? "entry" : key === "paid" ? "paid" : key === "written_off" ? "writeoff" : "none",
  }));

export const COLLECTION_ISSUE_TYPES = [
  "no_contact",
  "no_answer",
  "promise_broken",
  "financial_difficulty",
  "moved_out",
  "service_complaint",
  "billing_dispute",
  "lainnya",
] as const;
export type CollectionIssueType = typeof COLLECTION_ISSUE_TYPES[number];

export const COLLECTION_ISSUE_LABELS: Record<CollectionIssueType, string> = {
  no_contact: "Tidak Ada Kontak",
  no_answer: "Tidak Menjawab",
  promise_broken: "Janji Dilanggar",
  financial_difficulty: "Kesulitan Finansial",
  moved_out: "Pindah / Tidak Tinggal",
  service_complaint: "Komplain Layanan",
  billing_dispute: "Dispute Tagihan",
  lainnya: "Lainnya",
};

// ==================== AUTH TABLES ====================

// Users
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  username: varchar("username", { length: 64 }).notNull().unique(),
  password: text("password").notNull(), // bcrypt hashed
  name: text("name").notNull(),
  role: varchar("role", { length: 255 }).default("operator"), // Legacy text tier — masih dipakai untuk backward compat; roleId adalah source of truth
  roleId: int("role_id"),             // FK ke roles.id — source of truth permission (v4.1.1+)
  isActive: int("is_active").default(1),
  token: text("token"),
  createdAt: text("created_at"),
  lastLogin: text("last_login"),
  // Team / HR fields (all optional — filled progressively)
  isEmployee: int("is_employee").notNull().default(0),   // v5.1 SDM: akun ini karyawan resmi (dasar rekap HRD)
  email: text("email"),
  phone: text("phone"),
  employeeId: text("employee_id"),       // NIK / NIP
  position: text("position"),            // Jabatan (e.g. "Teknisi Lapangan")
  department: text("department"),        // Divisi (e.g. "NOC", "Sales", "Teknik")
  branch: text("branch"),                // Cabang / POP area (e.g. "Garut Kota")
  address: text("address"),              // Alamat domisili
  joinDate: text("join_date"),           // Tanggal bergabung tim
  birthDate: text("birth_date"),         // Tanggal lahir
  emergencyContact: text("emergency_contact"),  // "Nama - HP"
  notes: text("notes"),                  // Catatan internal (admin only)
  permissions: text("permissions"),       // DEPRECATED: JSON array per-user override; sekarang di roles.permissions
  // v4.2.1 — Profile photo + Telegram integration
  photoUrl: text("photo_url"),                    // base64 data URL (256x256 square) atau null
  telegramChatId: text("telegram_chat_id"),       // Chat ID Telegram setelah pairing (string utk safe JSON)
  telegramUsername: text("telegram_username"),    // @handle Telegram (display only)
  telegramLinkedAt: text("telegram_linked_at"),
  // Teamspace v5.0 Fase 2 (FR-703): token feed iCal personal (webcal), revocable
  calendarFeedToken: varchar("calendar_feed_token", { length: 64 }),
  telegramPrefs: text("telegram_prefs"),          // JSON: { lead_assigned, lead_hot, canvassing_report, sahabat_referral, collection_promise, ticket_assigned }
  // Phase B multi-tenant: active mitra context for this user's session
  activeMitraId: int("active_mitra_id").default(1),
});

// Phase B multi-tenant: user ↔ mitra membership (many-to-many).
// Staff bisa multi-tenant (mis. teknisi shared antar mitra). isPrimary=1 = default mitra at login.
export const userMitras = mysqlTable("user_mitras", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  mitraId: int("mitra_id").notNull(),
  isPrimary: int("is_primary").default(0),
  roleId: int("role_id"),     // per-membership role (nullable; fallback ke users.role_id global)
  createdAt: text("created_at").notNull(),
});

export const insertUserMitraSchema = createInsertSchema(userMitras).omit({ id: true });
export type UserMitra = typeof userMitras.$inferSelect;
export type InsertUserMitra = z.infer<typeof insertUserMitraSchema>;

// Phase F: per-tenant integration settings (MPWA URL/token, Google Maps key, MikroTik creds, etc.).
// Falls back to app_settings if no row for this mitra+key combination.
export const mitraIntegrations = mysqlTable("mitra_integrations", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull(),
  key: varchar("key", { length: 100 }).notNull(),
  value: text("value"),
  isSecret: int("is_secret").default(0),
  updatedAt: text("updated_at"),
});

export const insertMitraIntegrationSchema = createInsertSchema(mitraIntegrations).omit({ id: true });
export type MitraIntegration = typeof mitraIntegrations.$inferSelect;
export type InsertMitraIntegration = z.infer<typeof insertMitraIntegrationSchema>;

// Roles — custom user-defined roles with per-feature read/write permissions (v4.1.1)
export const roles = mysqlTable("roles", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),  // Tenant scope — roles isolated per mitra (v4.3.x). name unik per (mitra_id, name).
  name: text("name").notNull(),                // Custom name e.g. "Teknisi Senior", "CS Koordinator"
  description: text("description"),
  isSystem: int("is_system").default(0),   // 1 untuk role bawaan (Administrator, Read Only) — tidak bisa dihapus
  canSeeAllData: int("can_see_all_data").default(0), // 1 = supervisor mode (lihat data semua user, bukan hanya milik sendiri)
  permissions: text("permissions").notNull(),  // JSON object: { "dashboard": "read|write|none", "customers": "write", ... }
  createdBy: int("created_by"),
  createdAt: text("created_at"),
  updatedAt: text("updated_at"),
});

export const insertRoleSchema = createInsertSchema(roles);
export type Role = typeof roles.$inferSelect;
export type InsertRole = typeof roles.$inferInsert;

// Role Presets — DB-managed templates that pre-fill the permission matrix when creating a new role
export const rolePresets = mysqlTable("role_presets", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  scope: varchar("scope", { length: 8 }).notNull().default("tenant"),
  name: varchar("name", { length: 255 }).notNull(),
  description: varchar("description", { length: 255 }),
  icon: varchar("icon", { length: 48 }),
  color: varchar("color", { length: 16 }).notNull().default("primary"),
  permissions: text("permissions").notNull(),
  isSystem: int("is_system").notNull().default(0),
  isActive: int("is_active").notNull().default(1),
  isDefault: int("is_default").notNull().default(0),
  createdBy: int("created_by"),
  updatedBy: int("updated_by"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
});
export type RolePreset = typeof rolePresets.$inferSelect;
export type InsertRolePreset = typeof rolePresets.$inferInsert;

// Permission level helper
export type PermissionLevel = "none" | "read" | "write";
export function checkPermLevel(perms: Record<string, PermissionLevel> | undefined, feature: string, need: "read" | "write"): boolean {
  if (!perms) return false;
  const level = perms[feature] || "none";
  if (level === "none") return false;
  if (need === "read") return level === "read" || level === "write";
  if (need === "write") return level === "write";
  return false;
}

// ── Permission definitions ──
export const ALL_PERMISSIONS = [
  { key: "dashboard", label: "Dashboard", group: "NOC" },
  { key: "map", label: "Peta Jaringan", group: "Teknik" },
  { key: "pops", label: "POP", group: "Teknik" },
  { key: "odcs", label: "ODC", group: "Teknik" },
  { key: "odps", label: "ODP", group: "Teknik" },
  { key: "poles", label: "Tiang", group: "Teknik" },
  { key: "cables", label: "Kabel", group: "Teknik" },
  { key: "otbs", label: "OTB Manager", group: "Teknik" },
  { key: "bestrays", label: "Bestray", group: "Teknik" },
  { key: "splitters", label: "Splitter", group: "Teknik" },
  { key: "cable_cores", label: "Core Manager", group: "Teknik" },
  { key: "core_connections", label: "Koneksi Core", group: "Teknik" },
  { key: "marketing_dashboard", label: "Dashboard Marketing", group: "Marketing" },
  { key: "canvassing", label: "Canvassing", group: "Marketing" },
  { key: "leads", label: "Lead Pipeline", group: "Marketing" },
  { key: "contacts", label: "Kontak", group: "Marketing" },
  { key: "prospects", label: "Prospect Finder", group: "Marketing" },
  { key: "marketing_ads", label: "Marketing Ads", group: "Marketing" },
  { key: "splitter_chain", label: "Splitter Chain", group: "Teknik" },
  { key: "power_budget", label: "Power Budget", group: "Teknik" },
  { key: "export_import", label: "Export / Import", group: "Teknik" },
  { key: "customers", label: "Pelanggan", group: "Layanan Pelanggan" },
  { key: "packages", label: "Paket Internet", group: "Keuangan" },
  { key: "sessions", label: "Sesi Aktif PPPoE", group: "NOC" },
  { key: "devices", label: "Perangkat ONT", group: "NOC" },
  { key: "tickets", label: "Work Order", group: "Teknik" },
  { key: "collections", label: "Collection Pipeline", group: "Keuangan" },
  { key: "billing_sync", label: "Billing Sync Worker", group: "Keuangan" },
  { key: "monitoring", label: "Monitoring", group: "NOC" },
  { key: "routers", label: "Router MikroTik", group: "NOC" },
  { key: "integrations", label: "Integrasi API", group: "Integrasi & Tools" },
  { key: "audit_logs", label: "Log Aktivitas", group: "HRD" },
  { key: "user_management", label: "Manajemen User", group: "Pengaturan" },
  { key: "customer_portal_admin", label: "Admin Portal Pelanggan", group: "Layanan Pelanggan" },
  { key: "loyalty_admin", label: "Manajemen Loyalitas Pelanggan", group: "Layanan Pelanggan" },
  { key: "mpwa", label: "MPWA WhatsApp Gateway (Legacy)", group: "Integrasi & Tools" },
  { key: "broadcast", label: "Broadcast Pelanggan (Legacy)", group: "Integrasi & Tools" },
  // v4.2.20: WhatsApp v2 — multi-device + template + broadcast pelanggan/reseller
  { key: "whatsapp", label: "WhatsApp (Nomor / Template / Broadcast)", group: "Layanan Pelanggan" },
  // v4.2.24: Phonebook — custom contact list untuk broadcast
  { key: "phonebooks", label: "Phonebook (Daftar Kontak Custom)", group: "Layanan Pelanggan" },
  { key: "resellers", label: "Manajemen Reseller", group: "Layanan Pelanggan" },
  { key: "api_keys", label: "Public API Keys (Open API)", group: "Integrasi & Tools" },
  { key: "announcements_admin", label: "Kelola Pengumuman (News)", group: "Integrasi & Tools" },
  { key: "bug_reports", label: "Bug Reports (lapor bug)", group: "Integrasi & Tools" },
  { key: "pipelines", label: "Pipelines (Kanban)", group: "Pipelines" },
  // Phase E multi-tenant — owner-level mitra CRUD + feature toggles
  { key: "mitra_admin", label: "Kelola Mitra (Owner Only)", group: "Owner" },
  { key: "chatwoot", label: "Chatwoot", group: "Layanan Pelanggan" },
  { key: "chatwoot_settings", label: "Chatwoot — Pengaturan", group: "Layanan Pelanggan" },
  // v5.0 Teamspace — kolaborasi tim internal
  { key: "teams", label: "Tim (kelola tim & anggota)", group: "Teamspace" },
  { key: "team_tasks", label: "Tugas Tim", group: "Teamspace" },
  { key: "team_chat", label: "Chat Tim", group: "Teamspace" },
  { key: "team_schedule", label: "Jadwal Tim", group: "Teamspace" },
  { key: "team_checkins", label: "Pertanyaan / Check-in", group: "Teamspace" },
  { key: "team_docs", label: "Dokumen & File Tim", group: "Teamspace" },
  { key: "team_announcements", label: "Pengumuman Tim", group: "Teamspace" },
  { key: "performance_reports", label: "Laporan Kinerja", group: "Teamspace" },
  { key: "cheers", label: "Cheers (Apresiasi)", group: "Teamspace" },
  // v5.1 SDM/HRD — kehadiran, absensi, cuti (adaptasi SDM_Jabnet.xlsx)
  { key: "hr_sdm", label: "SDM (Kehadiran, Absensi, Cuti)", group: "HRD" },
] as const;

// Phase E: feature flags per mitra (stored in mitras.features JSON column)
export const ALL_FEATURES = [
  { key: "broadcast", label: "Broadcast WhatsApp" },
  { key: "collections", label: "Collection Pipeline" },
  { key: "loyalty", label: "JABNET Sahabat (Loyalty)" },
  { key: "public_api", label: "Open API (Public Keys)" },
  { key: "canvassing", label: "Canvassing & Prospects" },
  { key: "marketing_ads", label: "Marketing Ads" },
  { key: "genieacs", label: "GenieACS / TR-069" },
  { key: "chatwoot", label: "Omnichannel Integration" },
  { key: "mikrotik", label: "MikroTik Management" },
  { key: "bug_reports", label: "Bug Reports" },
  { key: "announcements", label: "Announcements" },
  { key: "customer_portal", label: "Customer Portal" },
  { key: "pipelines", label: "Pipelines (Kanban)" },
  { key: "teamspace", label: "Teamspace (Kolaborasi Tim)" },
] as const;

export type FeatureKey = typeof ALL_FEATURES[number]["key"];

// Which permission keys each feature gates. Disabling a feature for a mitra strips these
// permissions at per-mitra resolution (see server/feature-gate.ts). Keys map to ALL_PERMISSIONS.
export const FEATURE_PERMISSIONS: Record<string, string[]> = {
  loyalty: ["loyalty_admin"],
  collections: ["collections"],
  public_api: ["api_keys"],
  marketing_ads: ["marketing_ads"],
  bug_reports: ["bug_reports"],
  announcements: ["announcements_admin"],
  broadcast: ["broadcast", "whatsapp", "phonebooks"],
  canvassing: ["canvassing", "prospects"],
  mikrotik: ["routers", "monitoring"],
  genieacs: ["devices"],
  customer_portal: ["customer_portal_admin"],
  chatwoot: ["chatwoot", "chatwoot_settings"],
  pipelines: ["pipelines"],
  teamspace: ["teams", "team_tasks", "team_chat", "team_schedule", "team_checkins", "team_docs", "team_announcements", "performance_reports", "cheers"],
};

export const ALL_PERMISSION_KEYS = ALL_PERMISSIONS.map(p => p.key);

export const PERMISSION_GROUPS = [...new Set(ALL_PERMISSIONS.map(p => p.group))];

// Preset templates. `level` = the grant level applied to every listed permission key
// when the preset is applied (default "write"; "read" for read-only presets).
export const PERMISSION_PRESETS: Record<string, { label: string; level?: PermissionLevel; permissions: string[] }> = {
  admin: { label: "Admin (Semua Akses)", permissions: [...ALL_PERMISSION_KEYS] },
  operator: { label: "Operator Teknis", permissions: ["dashboard", "map", "pops", "odcs", "odps", "poles", "cables", "otbs", "bestrays", "splitters", "cable_cores", "core_connections", "splitter_chain", "power_budget", "export_import", "customers", "tickets"] },
  marketing: { label: "Marketing", permissions: ["dashboard", "map", "marketing_dashboard", "canvassing", "leads", "contacts", "prospects", "marketing_ads"] },
  billing: { label: "Billing & NOC", permissions: ["dashboard", "map", "customers", "packages", "sessions", "devices", "tickets", "collections", "billing_sync", "monitoring", "routers"] },
  viewer: { label: "Viewer (Hanya Lihat)", level: "read", permissions: ["dashboard", "map"] },
};

/**
 * Build a full permission matrix (every canonical key → level) from a preset.
 * Listed keys get the preset's `level` (default "write"); all other keys are "none".
 * Pure — used by the role form to apply a preset, and reusable wherever a preset
 * needs to materialise into a `Record<key, level>`.
 */
export function buildPermissionMatrixFromPreset(
  presetKey: keyof typeof PERMISSION_PRESETS,
): Record<string, PermissionLevel> {
  const def = PERMISSION_PRESETS[presetKey];
  const level: PermissionLevel = def?.level ?? "write";
  const matrix: Record<string, PermissionLevel> = {};
  for (const k of ALL_PERMISSION_KEYS) matrix[k] = "none";
  if (def) for (const k of def.permissions) matrix[k] = level;
  return matrix;
}

/**
 * Normalise an arbitrary permissions object into a full matrix: every canonical key present,
 * values constrained to "none"|"read"|"write", unknown keys dropped. Shared by role + preset
 * create/update so the cleanse logic lives in exactly one place.
 */
export function cleansePermissionMatrix(
  permissions: unknown,
): Record<string, PermissionLevel> {
  const out: Record<string, PermissionLevel> = {};
  const src = permissions && typeof permissions === "object" ? (permissions as Record<string, unknown>) : {};
  for (const key of ALL_PERMISSION_KEYS) {
    const v = src[key];
    out[key] = v === "read" || v === "write" ? v : "none";
  }
  return out;
}

// Audit Logs
export const auditLogs = mysqlTable("audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  userId: int("user_id"),
  username: text("username").notNull(),
  userName: text("user_name").notNull(),
  action: text("action").notNull(), // "CREATE" | "UPDATE" | "DELETE"
  entityType: text("entity_type").notNull(), // "pop", "odc", "odp", etc.
  entityId: int("entity_id"),
  entityName: text("entity_name"),
  details: text("details"), // JSON string
  createdAt: text("created_at"),
});

// ==================== ZOD SCHEMAS ====================

export const insertPopSchema = createInsertSchema(pops).omit({ id: true });
export const insertOdcSchema = createInsertSchema(odcs).omit({ id: true });
export const insertOdpSchema = createInsertSchema(odps, {
  name: z.string().min(1, "Nama ODP wajib diisi"),
  district: z.string().min(1, "Kecamatan wajib diisi"),
  lat: z.number({ required_error: "Koordinat Latitude wajib diisi" }).min(-90).max(90),
  lng: z.number({ required_error: "Koordinat Longitude wajib diisi" }).min(-180).max(180),
  splitterType: z.string().min(1, "Tipe splitter wajib dipilih")
}).omit({ id: true });

export const insertCustomerSchema = createInsertSchema(customers, {
  name: z.string().min(1, "Nama Pelanggan wajib diisi"),
  district: z.string().min(1, "Kecamatan wajib diisi")
}).omit({ id: true });

export const insertPoleSchema = createInsertSchema(poles).omit({ id: true });

export const insertCableSchema = createInsertSchema(cables, {
  name: z.string().min(1, "Nama Kabel FO wajib diisi"),
  cableType: z.enum(["feeder", "distribusi", "drop"], { 
    required_error: "Tipe kabel wajib dipilih",
    invalid_type_error: "Tipe kabel harus feeder, distribusi, atau drop"
  })
}).omit({ id: true });

export const insertOdpPhotoSchema = createInsertSchema(odpPhotos).omit({ id: true });
export const insertAssetPhotoSchema = createInsertSchema(assetPhotos).omit({ id: true });
export const insertOtbSchema = createInsertSchema(otbs).omit({ id: true });
export const insertBestraySchema = createInsertSchema(bestrays).omit({ id: true });
export const insertSplitterSchema = createInsertSchema(splitters).omit({ id: true });
export const insertCableCoreSchema = createInsertSchema(cableCores).omit({ id: true });
export const insertCoreConnectionSchema = createInsertSchema(coreConnections).omit({ id: true });

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true });
export const insertProspectSchema = createInsertSchema(prospects).omit({ id: true });
export const insertLeadSchema = createInsertSchema(leads).omit({ id: true });
export const insertLeadActivitySchema = createInsertSchema(leadActivities).omit({ id: true });
export const insertCollectionSchema = createInsertSchema(collections).omit({ id: true });
export const insertCollectionActivitySchema = createInsertSchema(collectionActivities).omit({ id: true });
export const insertCanvassingSessionSchema = createInsertSchema(canvassingSessions).omit({ id: true });
export const insertCanvassingLogSchema = createInsertSchema(canvassingLogs).omit({ id: true });
export const insertOdpScrapeCacheSchema = createInsertSchema(odpScrapeCache).omit({ id: true });

// ==================== TYPES ====================

export type Pop = typeof pops.$inferSelect;
export type InsertPop = z.infer<typeof insertPopSchema>;

export type Odc = typeof odcs.$inferSelect;
export type InsertOdc = z.infer<typeof insertOdcSchema>;

export type Odp = typeof odps.$inferSelect & { portTersisa?: number };
export type InsertOdp = z.infer<typeof insertOdpSchema>;

export type OdpPhoto = typeof odpPhotos.$inferSelect;
export type AssetPhoto = typeof assetPhotos.$inferSelect;
export type InsertAssetPhoto = z.infer<typeof insertAssetPhotoSchema>;
export type InsertOdpPhoto = z.infer<typeof insertOdpPhotoSchema>;

export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;

export type Pole = typeof poles.$inferSelect;
export type InsertPole = z.infer<typeof insertPoleSchema>;

export type Cable = typeof cables.$inferSelect & { coreTersisa?: number };
export type InsertCable = z.infer<typeof insertCableSchema>;

export type Otb = typeof otbs.$inferSelect & { coreTersisa?: number };
export type InsertOtb = z.infer<typeof insertOtbSchema>;

export type Bestray = typeof bestrays.$inferSelect;
export type InsertBestray = z.infer<typeof insertBestraySchema>;

export type Splitter = typeof splitters.$inferSelect;
export type InsertSplitter = z.infer<typeof insertSplitterSchema>;

export type CableCore = typeof cableCores.$inferSelect;
export type InsertCableCore = z.infer<typeof insertCableCoreSchema>;

export type CoreConnection = typeof coreConnections.$inferSelect;
export type InsertCoreConnection = z.infer<typeof insertCoreConnectionSchema>;

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;

export type Prospect = typeof prospects.$inferSelect;
export type InsertProspect = z.infer<typeof insertProspectSchema>;
export type Lead = typeof leads.$inferSelect;
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type LeadActivity = typeof leadActivities.$inferSelect;
export type InsertLeadActivity = z.infer<typeof insertLeadActivitySchema>;
export type Collection = typeof collections.$inferSelect;
export type InsertCollection = z.infer<typeof insertCollectionSchema>;
export type CollectionActivity = typeof collectionActivities.$inferSelect;
export type InsertCollectionActivity = z.infer<typeof insertCollectionActivitySchema>;
export type CollectionStageRow = typeof collectionStages.$inferSelect;
export type CollectionStageRole = "none" | "entry" | "paid" | "writeoff";
export type CanvassingSession = typeof canvassingSessions.$inferSelect;
export type InsertCanvassingSession = z.infer<typeof insertCanvassingSessionSchema>;
export type CanvassingLog = typeof canvassingLogs.$inferSelect;
export type InsertCanvassingLog = z.infer<typeof insertCanvassingLogSchema>;
export type OdpScrapeCache = typeof odpScrapeCache.$inferSelect;

// Lead pipeline stages
export const LEAD_STAGES = ["new","contacted","interested","negotiation","won","lost"] as const;
export type LeadStage = typeof LEAD_STAGES[number];
export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  new: "Prospek Baru",
  contacted: "Dihubungi",
  interested: "Tertarik",
  negotiation: "Negosiasi",
  won: "Closing ✅",
  lost: "Tidak Jadi ❌",
};
export const LEAD_STAGE_COLORS: Record<LeadStage, string> = {
  new: "#6B7280",
  contacted: "#3B82F6",
  interested: "#8B5CF6",
  negotiation: "#F59E0B",
  won: "#22C55E",
  lost: "#EF4444",
};

export const LEAD_CATEGORIES = ["rumahan","bisnis","perkantoran","sekolah","lainnya"] as const;
export type LeadCategory = typeof LEAD_CATEGORIES[number];
export const LEAD_CATEGORY_LABELS: Record<LeadCategory, string> = {
  rumahan: "Rumahan",
  bisnis: "Bisnis/Toko",
  perkantoran: "Perkantoran",
  sekolah: "Sekolah/Kampus",
  lainnya: "Lainnya",
};

// ==================== MIKROTIK ROUTER TABLE ====================

export const mikrotikRouters = mysqlTable("mikrotik_routers", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  name: text("name").notNull(),
  host: text("host").notNull(),
  port: int("port").default(443),
  username: text("username").notNull(),
  password: text("password").notNull(),   // encrypted at rest
  useSsl: int("use_ssl").default(1),
  isActive: int("is_active").default(1),
  routerOsVersion: text("router_os_version"),
  boardName: text("board_name"),
  identity: text("identity"),
  lastSeen: text("last_seen"),
  notes: text("notes"),
  createdAt: text("created_at"),
});

export const insertMikrotikRouterSchema = createInsertSchema(mikrotikRouters).omit({ id: true });
export type MikrotikRouter = typeof mikrotikRouters.$inferSelect;
export type InsertMikrotikRouter = z.infer<typeof insertMikrotikRouterSchema>;

// ==================== APP SETTINGS ====================

export const appSettings = mysqlTable("app_settings", {
  key: varchar("key", { length: 191 }).primaryKey(),
  value: text("value"),
  category: varchar("category", { length: 255 }).default("general"), // google_maps, mikrotik, billing, app
  label: text("label"),
  updatedAt: text("updated_at"),
});

export type AppSetting = typeof appSettings.$inferSelect;

// ==================== PUBLIC API KEYS (v4.1.9) ====================
// Untuk integrasi eksternal (OpenClaude / AI analyst / BI tool) — read-only endpoints
// dengan scoped access + rate limit + audit trail.

export const apiKeys = mysqlTable("api_keys", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  name: text("name").notNull(),                        // "OpenClaude Daily", "Grafana", dst
  keyPrefix: varchar("key_prefix", { length: 32 }).notNull(),             // 8 char plaintext prefix untuk tampil di UI (e.g. "jbk_live_Ab3Cd4")
  keyHash: text("key_hash").notNull(),                 // bcrypt hash full key
  scopes: text("scopes").notNull(),                    // JSON array: ["reports:read","leads:read","collections:read","sahabat:read"]
  rateLimit: int("rate_limit").default(60),        // req/min (default 60)
  enabled: int("enabled").default(1),
  expiresAt: text("expires_at"),                       // null = never
  createdByUserId: int("created_by_user_id"),
  createdAt: text("created_at").notNull(),
  // Usage tracking
  lastUsedAt: text("last_used_at"),
  lastUsedIp: text("last_used_ip"),
  lastUsedUserAgent: text("last_used_user_agent"),
  totalRequests: int("total_requests").default(0),
  revokedAt: text("revoked_at"),
  revokedReason: text("revoked_reason"),
});

export const apiKeyUsageLogs = mysqlTable("api_key_usage_logs", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  apiKeyId: int("api_key_id").references(() => apiKeys.id).notNull(),
  endpoint: text("endpoint").notNull(),
  method: text("method").notNull(),
  statusCode: int("status_code"),
  responseMs: int("response_ms"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: text("created_at").notNull(),
});

export const insertApiKeySchema = createInsertSchema(apiKeys).omit({ id: true });
export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = z.infer<typeof insertApiKeySchema>;
export type ApiKeyUsageLog = typeof apiKeyUsageLogs.$inferSelect;

// ==================== NOTIFICATIONS, ANNOUNCEMENTS, BUG REPORTS (v4.1.10) ====================

/** Per-user notification (bell icon). Triggered saat ticket/lead/collection di-assign,
 *  bug status update, announcement published, dll. */
export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  userId: int("user_id").notNull(),                // recipient
  type: text("type").notNull(),                        // ticket_assigned | lead_assigned | collection_assigned | announcement | bug_update | bug_assigned | mention
  title: text("title").notNull(),
  message: text("message"),
  link: text("link"),                                  // opsional: /tickets/123 untuk jump
  entityType: text("entity_type"),                     // ticket | lead | collection | announcement | bug | comment
  entityId: int("entity_id"),
  fromUserId: int("from_user_id"),                 // trigger user (null = system)
  readAt: text("read_at"),
  createdAt: text("created_at").notNull(),
});

/** Announcements/News feed — admin post, semua staff lihat */
export const announcements = mysqlTable("announcements", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  title: text("title").notNull(),
  content: text("content").notNull(),                  // markdown-friendly text
  category: text("category").notNull(),                // feature_update | bug_fix | announcement | maintenance | training
  severity: varchar("severity", { length: 255 }).default("info"),          // info | warning | critical
  version: text("version"),                            // e.g. "v4.1.10"
  authorId: int("author_id").notNull(),
  publishedAt: text("published_at"),                   // null = draft
  pinnedUntil: text("pinned_until"),                   // opsional: pin sampai tanggal X
  // Teamspace v5.0 Fase 2 (FR-6xx): scoping tim + penerima terpilih + expiry otomatis
  teamId: int("team_id"),                              // NULL = company-wide (perilaku lama)
  isConfidential: int("is_confidential").default(0),   // 1 = hanya penerima di content_recipients
  expiresAt: text("expires_at"),                       // lewat ini → status expired/arsip
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
});

/** Bug reports — staff lapor, admin triage */
export const bugReports = mysqlTable("bug_reports", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  title: text("title").notNull(),
  description: text("description"),
  stepsToReproduce: text("steps_to_reproduce"),
  severity: varchar("severity", { length: 255 }).default("medium"),        // low | medium | high | critical
  status: varchar("status", { length: 255 }).default("open"),              // open | triaged | in_progress | resolved | closed | duplicate | wontfix
  affectedFeature: text("affected_feature"),           // canvassing | collections | billing | ...
  browserInfo: text("browser_info"),                   // auto-capture userAgent
  reportedByUserId: int("reported_by_user_id").notNull(),
  assignedToUserId: int("assigned_to_user_id"),
  photoData: text("photo_data"),                       // DEPRECATED: legacy base64 screenshot
  photoPath: varchar("photo_path", { length: 255 }),   // relatif ke JABNET_UPLOAD_ROOT
  resolution: text("resolution"),
  resolvedAt: text("resolved_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
});

/** Bug report comments */
export const bugComments = mysqlTable("bug_comments", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  bugId: int("bug_id").references(() => bugReports.id).notNull(),
  userId: int("user_id").notNull(),
  content: text("content").notNull(),
  createdAt: text("created_at").notNull(),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true });
export const insertAnnouncementSchema = createInsertSchema(announcements).omit({ id: true });
export const insertBugReportSchema = createInsertSchema(bugReports).omit({ id: true });
export const insertBugCommentSchema = createInsertSchema(bugComments).omit({ id: true });
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Announcement = typeof announcements.$inferSelect;
export type InsertAnnouncement = z.infer<typeof insertAnnouncementSchema>;
export type BugReport = typeof bugReports.$inferSelect;
export type InsertBugReport = z.infer<typeof insertBugReportSchema>;
export type BugComment = typeof bugComments.$inferSelect;
export type InsertBugComment = z.infer<typeof insertBugCommentSchema>;

// ==================== TICKETING / WORK ORDER ====================

export const ticketCategories = mysqlTable("ticket_categories", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  name: text("name").notNull(),
  color: varchar("color", { length: 255 }).default("#3B82F6"),
  icon: varchar("icon", { length: 255 }).default("wrench"),
  isActive: int("is_active").default(1),
  sortOrder: int("sort_order").default(0),
  checklistTemplate: text("checklist_template"), // JSON array: ["Verifikasi port ODP", "Tarik kabel drop", ...]
  slaHours: int("sla_hours"), // SLA target dalam jam (e.g. 4 = harus selesai dalam 4 jam)
  /**
   * v4.2.4: workflow template — stages flexible per kategori.
   * JSON array of WorkflowStage objects: { key, label, icon, color, requiresPhoto, requiresGps, requiresNote, requiresSignature, slaMinutes, isFinal, sortOrder }
   * Kalau null, fallback ke DEFAULT_WORKFLOW (prep/travel/onsite/done).
   */
  workflowStages: text("workflow_stages"),
  createdAt: text("created_at"),
});

export const insertTicketCategorySchema = createInsertSchema(ticketCategories).omit({ id: true });
export type TicketCategory = typeof ticketCategories.$inferSelect;
export type InsertTicketCategory = z.infer<typeof insertTicketCategorySchema>;

export const tickets = mysqlTable("tickets", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  ticketNumber: text("ticket_number").notNull(),
  categoryId: int("category_id"),
  customerId: int("customer_id"),
  title: text("title").notNull(),
  description: text("description"),
  priority: varchar("priority", { length: 255 }).default("medium"),
  status: varchar("status", { length: 255 }).default("open"),
  assignedTo: int("assigned_to"),
  createdBy: int("created_by").notNull(),
  scheduledDate: text("scheduled_date"),
  scheduledTime: text("scheduled_time"),
  deadline: text("deadline"),
  estimatedDuration: int("estimated_duration"),
  actualDuration: int("actual_duration"),
  address: text("address"),
  lat: double("lat"),
  lng: double("lng"),
  odpId: int("odp_id"),
  popId: int("pop_id"),
  odcId: int("odc_id"),
  checklist: text("checklist"), // JSON: [{ item: "...", done: bool, evidence: bool }]
  slaDeadline: text("sla_deadline"), // kapan SLA habis
  dispatchedAt: text("dispatched_at"), // waktu tiket di-dispatch ke teknisi
  resolution: text("resolution"),
  /**
   * v4.2.18 (D.1): Resolution code enum — kategori penyebab/solusi.
   * Values: FIBER_REPAIR | ONT_REPLACE | CONNECTOR_REPLACE | CABLE_REROUTE | CONFIG_CHANGE | OTHER | CUSTOMER_SIDE | NO_ISSUE_FOUND
   */
  resolutionCode: text("resolution_code"),
  /**
   * v4.2.18 (D.2): Material yang dipakai (JSON array of {name, qty, unit, sku?, cost?}).
   * Dipakai juga utk billing per work order kalau perlu.
   */
  materialUsed: text("material_used"),
  /**
   * v4.2.18 (D.4): URL/data BAST PDF generated saat resolved.
   */
  bastPdfUrl: text("bast_pdf_url"),
  bastNumber: text("bast_number"),
  resolvedAt: text("resolved_at"),
  closedAt: text("closed_at"),
  /**
   * v4.2.4: stage saat ini di workflow (sesuai workflowStages di kategori).
   * Auto-derive status (open/in_progress/resolved/closed) dari stage.isFinal.
   */
  currentStage: text("current_stage"),
  stageEnteredAt: text("stage_entered_at"), // kapan stage saat ini di-masuk-i (untuk live duration)
  /**
   * v4.2.18 (A.1): Tiket resolved/closed yang ngga melewati workflow stages lengkap.
   * True = ditutup secara manual lewat /status endpoint, bukan via advance-stage sampai final.
   * UI tampilkan banner "Tiket lama: ditutup tanpa workflow" + counter pakai "—" instead of misleading angka.
   */
  legacyResolution: int("legacy_resolution").default(0), // 0=normal, 1=legacy
  createdAt: text("created_at"),
  updatedAt: text("updated_at"),
});

export const insertTicketSchema = createInsertSchema(tickets).omit({ id: true });
export type Ticket = typeof tickets.$inferSelect;
export type InsertTicket = z.infer<typeof insertTicketSchema>;

export const ticketActivities = mysqlTable("ticket_activities", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  ticketId: int("ticket_id").notNull(),
  userId: int("user_id").notNull(),         // alias: actorId
  type: text("type").notNull(),                  // alias: action
  content: text("content"),                      // legacy free-text (kept for backward compat)
  createdAt: text("created_at").notNull(),
  // v4.2.18 (A.3): structured activity log for audit
  payloadJson: text("payload_json"),             // structured data per action type
  ip: text("ip"),                                 // request IP
  userAgent: text("user_agent"),                  // browser/app info
  gpsLat: double("gps_lat"),                        // GPS lat saat aksi (kalau dikirim)
  gpsLng: double("gps_lng"),                        // GPS lng
});

export const insertTicketActivitySchema = createInsertSchema(ticketActivities).omit({ id: true });
export type TicketActivity = typeof ticketActivities.$inferSelect;
export type InsertTicketActivity = z.infer<typeof insertTicketActivitySchema>;

// ── Ticket Team (multi-technician per work order) ──
export const ticketTeam = mysqlTable("ticket_team", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  ticketId: int("ticket_id").notNull(),
  userId: int("user_id").notNull(),
  role: varchar("role", { length: 255 }).default("helper"), // "lead" (senior) | "helper" (junior)
  checkInAt: text("check_in_at"),
  checkOutAt: text("check_out_at"),
  checkInLat: double("check_in_lat"),
  checkInLng: double("check_in_lng"),
  checkOutLat: double("check_out_lat"),
  checkOutLng: double("check_out_lng"),
});
export type TicketTeamMember = typeof ticketTeam.$inferSelect;

// ── Ticket Evidence (photos, documents) ──
export const ticketEvidence = mysqlTable("ticket_evidence", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  ticketId: int("ticket_id").notNull(),
  type: text("type").notNull(), // "before" | "during" | "after" | "power_meter" | "ont_serial" | "signature"
  photoData: text("photo_data"), // base64 encoded image
  lat: double("lat"),
  lng: double("lng"),
  capturedAt: text("captured_at"),
  capturedBy: int("captured_by"),
  notes: text("notes"),
});
export type TicketEvidenceItem = typeof ticketEvidence.$inferSelect;

// ── Ticket GPS Log (location tracking during work) ──
export const ticketGpsLogs = mysqlTable("ticket_gps_logs", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  ticketId: int("ticket_id").notNull(),
  userId: int("user_id").notNull(),
  event: text("event").notNull(), // "depart" | "arrive" | "check_in" | "check_out" | "location_update"
  lat: double("lat"),
  lng: double("lng"),
  timestamp: text("timestamp").notNull(),
});
export type TicketGpsLog = typeof ticketGpsLogs.$inferSelect;

// v4.2.17: CSAT (Customer Satisfaction) response — auto-trigger 24h setelah ticket close
export const ticketCsat = mysqlTable("ticket_csat", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  ticketId: int("ticket_id").notNull(),
  customerId: int("customer_id"),
  token: varchar("token", { length: 64 }).notNull().unique(),     // public token untuk customer respond tanpa login
  scheduledAt: text("scheduled_at").notNull(), // kapan worker harus kirim
  sentAt: text("sent_at"),                     // kapan WhatsApp template sukses kirim
  respondedAt: text("responded_at"),           // kapan customer kirim feedback
  rating: int("rating"),                   // 1-5 stars
  feedback: text("feedback"),                  // free text dari customer
  resolvedByUserId: int("resolved_by_user_id"), // teknisi yang close ticket → buat join report
  status: varchar("status", { length: 255 }).default("pending"),   // pending | sent | responded | failed | expired
  createdAt: text("created_at").notNull(),
});
export type TicketCsat = typeof ticketCsat.$inferSelect;

// v4.2.17: SLA escalation tracker — supaya satu ticket ngga di-escalate berkali-kali
export const ticketSlaEscalations = mysqlTable("ticket_sla_escalations", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  ticketId: int("ticket_id").notNull(),
  level: text("level").notNull(),               // "warning_25pct" | "warning_10pct" | "breached"
  triggeredAt: text("triggered_at").notNull(),
  notifiedSupervisorIds: text("notified_supervisor_ids"), // JSON array of user IDs
});
export type TicketSlaEscalation = typeof ticketSlaEscalations.$inferSelect;

// v4.2.18 (B.6): Internal comments / chat per ticket
export const ticketComments = mysqlTable("ticket_comments", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  ticketId: int("ticket_id").notNull(),
  authorId: int("author_id").notNull(),
  content: text("content").notNull(),
  mentions: text("mentions"),                         // JSON array of user IDs di-mention
  attachmentUrl: text("attachment_url"),               // optional file URL
  isInternal: int("is_internal").default(1),       // 1=internal only, 0=visible to customer
  createdAt: text("created_at").notNull(),
  editedAt: text("edited_at"),
  deletedAt: text("deleted_at"),
});
export type TicketComment = typeof ticketComments.$inferSelect;

// v4.2.18 (B.7): Hold/Pause mechanism — pause SLA timer
export const ticketPauses = mysqlTable("ticket_pauses", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  ticketId: int("ticket_id").notNull(),
  reason: text("reason").notNull(),                    // WAIT_CUSTOMER | WAIT_MATERIAL | WAIT_3RD_PARTY | OUT_OF_HOURS | OTHER
  note: text("note"),                                  // free text catatan
  startedAt: text("started_at").notNull(),
  endedAt: text("ended_at"),                           // null = ongoing pause
  startedByUserId: int("started_by_user_id").notNull(),
  endedByUserId: int("ended_by_user_id"),
});
export type TicketPause = typeof ticketPauses.$inferSelect;

// v4.2.18 (P1.4): Stage edit audit log — track every koreksi data setelah submit
// Tujuan: transparency + bisa lihat history kalau teknisi/admin edit field
export const ticketStageEditLog = mysqlTable("ticket_stage_edit_log", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  ticketId: int("ticket_id").notNull(),
  stageKey: text("stage_key").notNull(),
  transitionId: int("transition_id"),
  byUserId: int("by_user_id").notNull(),
  field: text("field").notNull(),                  // "note" | "evidenceId" | "lat" | "lng" | "metadata.<key>"
  oldValue: text("old_value"),                     // JSON string atau plain text
  newValue: text("new_value"),
  editedAt: text("edited_at").notNull(),
});
export type TicketStageEditLog = typeof ticketStageEditLog.$inferSelect;

// v4.2.17: Network alarm event — dari GenieACS/MikroTik, diolah jadi tickets
export const networkAlarms = mysqlTable("network_alarms", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  source: text("source").notNull(),             // "genieacs" | "mikrotik" | "manual"
  alarmType: text("alarm_type").notNull(),      // "ont_offline" | "ont_los" | "ppp_timeout" | "low_rx_power" | "high_temp"
  customerId: int("customer_id"),
  odpId: int("odp_id"),
  deviceId: text("device_id"),                  // GenieACS deviceId atau PPPoE username
  pppoeUsername: text("pppoe_username"),
  detail: text("detail"),                       // JSON: { rxPower, lastSeen, etc }
  detectedAt: text("detected_at").notNull(),
  resolvedAt: text("resolved_at"),              // null = ongoing alarm
  ticketId: int("ticket_id"),               // FK ke ticket yang ke-create dari alarm ini
  correlationKey: text("correlation_key"),      // grouping key (e.g. odpId+date) untuk de-dup
});
export type NetworkAlarm = typeof networkAlarms.$inferSelect;

// ── Legacy stage transitions (v4.2.4) — kept for backward compat, replaced by checkpoints di v4.2.5 ──
export const ticketStageTransitions = mysqlTable("ticket_stage_transitions", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  ticketId: int("ticket_id").notNull(),
  fromStage: text("from_stage"),
  toStage: text("to_stage").notNull(),
  enteredAt: text("entered_at").notNull(),
  exitedAt: text("exited_at"),
  durationSec: int("duration_sec"),
  byUserId: int("by_user_id").notNull(),
  note: text("note"),
  evidenceId: int("evidence_id"),
  lat: double("lat"),
  lng: double("lng"),
  /**
   * v4.2.7: Structured field values per stage (JSON) — supaya bisa di-edit kemudian.
   * Format: { numeric, barcode, signature, speedDownload, speedUpload, speedLatency, rating, custom: { fieldKey: value, ... } }
   */
  metadata: text("metadata"),
});
export type TicketStageTransition = typeof ticketStageTransitions.$inferSelect;

// ── Ticket Checkpoints (v4.2.5 — action-based, redesigned dari stage rigid) ──
// Daripada workflow stage yang rigid sequential, teknisi log "checkpoint" yang flexible.
// 8 action types: depart | arrive | start_work | progress | pause | resume | escalate | complete
// Time tracking auto-derive: depart→arrive = travel time, arrive→start_work = setup time, dst.
export const ticketCheckpoints = mysqlTable("ticket_checkpoints", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  ticketId: int("ticket_id").notNull(),
  action: text("action").notNull(),               // depart|arrive|start_work|progress|pause|resume|escalate|complete|note
  byUserId: int("by_user_id").notNull(),
  timestamp: text("timestamp").notNull(),
  note: text("note"),                             // catatan teknisi (optional kecuali complete + escalate)
  evidenceId: int("evidence_id"),             // FK ke ticket_evidence (foto opsional)
  lat: double("lat"),
  lng: double("lng"),
  metadata: text("metadata"),                     // JSON: pause_reason, escalate_to, signature_data, dst.
});
export type TicketCheckpoint = typeof ticketCheckpoints.$inferSelect;

// Catatan: tabel ticket_stage_transitions dari v4.2.4 ditinggalkan untuk backward compat
// (data historis tetap utuh), tapi semua flow baru pakai ticket_checkpoints.

/** Action types yang valid untuk checkpoint */
export const CHECKPOINT_ACTIONS = [
  "depart",      // 🚗 Berangkat
  "arrive",      // 📍 Sampai lokasi
  "start_work",  // 🔧 Mulai Kerja
  "progress",    // 📷 Foto progress
  "pause",       // ⏸ Jeda
  "resume",      // ▶ Lanjut
  "escalate",    // 🚨 Eskalasi (perlu bantuan)
  "complete",    // ✅ Selesai
  "note",        // 📝 Catatan saja (no state change)
] as const;
export type CheckpointAction = typeof CHECKPOINT_ACTIONS[number];

/** Konfigurasi action untuk frontend rendering */
export interface CheckpointActionConfig {
  key: CheckpointAction;
  label: string;
  icon: string;       // lucide icon name
  color: string;      // hex
  description: string;
  requiresGps?: boolean;
  requiresPhoto?: boolean;
  requiresNote?: boolean;
  /** Status tiket yang otomatis di-set saat action ini di-log */
  setsStatus?: "in_progress" | "resolved";
}

export const CHECKPOINT_ACTION_CONFIG: Record<CheckpointAction, CheckpointActionConfig> = {
  depart:     { key: "depart",     label: "Berangkat",     icon: "Navigation",   color: "#8B5CF6", description: "Otw dari kantor/rumah", requiresGps: true, setsStatus: "in_progress" },
  arrive:     { key: "arrive",     label: "Sampai",        icon: "MapPin",       color: "#06B6D4", description: "Sudah di lokasi customer", requiresGps: true },
  start_work: { key: "start_work", label: "Mulai Kerja",   icon: "Wrench",       color: "#F59E0B", description: "Setup selesai, mulai pengerjaan", setsStatus: "in_progress" },
  progress:   { key: "progress",   label: "Foto Progress", icon: "Camera",       color: "#0EA5E9", description: "Update progress dengan foto", requiresPhoto: true },
  pause:      { key: "pause",      label: "Jeda",          icon: "Pause",        color: "#EAB308", description: "Berhenti sementara (istirahat, cari spare part)", requiresNote: true },
  resume:     { key: "resume",     label: "Lanjut",        icon: "Play",         color: "#22C55E", description: "Lanjut kerja setelah jeda" },
  escalate:   { key: "escalate",   label: "Eskalasi",      icon: "AlertTriangle", color: "#EF4444", description: "Perlu bantuan / tidak bisa selesai sendiri", requiresNote: true },
  complete:   { key: "complete",   label: "Selesai",       icon: "CheckCircle",  color: "#10B981", description: "Pengerjaan tuntas, tiket resolved", requiresPhoto: true, requiresNote: true, setsStatus: "resolved" },
  note:       { key: "note",       label: "Catatan",       icon: "FileText",     color: "#6B7280", description: "Tambah catatan tanpa ubah status", requiresNote: true },
};

// ──────────── CHATWOOT INTEGRATION (v4.2.5) ────────────

// Konfigurasi koneksi Chatwoot — single row (id=1)
export const chatwootConfig = mysqlTable("chatwoot_config", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  enabled: int("enabled").default(0),
  baseUrl: text("base_url"),                      // https://app.chatwoot.com atau self-hosted
  accountId: text("account_id"),                  // Chatwoot account ID
  apiAccessToken: text("api_access_token"),       // bot/agent API token
  webhookSecret: text("webhook_secret"),          // untuk verify incoming webhook payload
  autoCreateOnKeyword: int("auto_create_on_keyword").default(1),
  autoNotifyOnResolve: int("auto_notify_on_resolve").default(1),
  autoSyncContacts: int("auto_sync_contacts").default(0),   // Batch 2f: worker auto-sync contact ON/OFF
  defaultCategoryId: int("default_category_id"),  // fallback kategori kalau ngga match keyword
  createdAt: text("created_at"),
  updatedAt: text("updated_at"),
});
export type ChatwootConfig = typeof chatwootConfig.$inferSelect;

// Keyword → kategori + priority mapping (configurable per admin)
export const chatwootKeywordRules = mysqlTable("chatwoot_keyword_rules", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  keyword: text("keyword").notNull(),             // comma-separated patterns: "gangguan,tidak bisa,mati"
  categoryId: int("category_id").notNull(),
  priority: varchar("priority", { length: 255 }).default("medium"),   // low|medium|high|urgent
  isActive: int("is_active").default(1),
  sortOrder: int("sort_order").default(0),
  createdAt: text("created_at"),
});
export type ChatwootKeywordRule = typeof chatwootKeywordRules.$inferSelect;

// Link tiket ↔ Chatwoot conversation (untuk reverse-lookup)
export const chatwootTicketLinks = mysqlTable("chatwoot_ticket_links", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  ticketId: int("ticket_id").notNull(),
  conversationId: text("conversation_id").notNull(),  // Chatwoot conversation ID (string supaya safe)
  contactId: text("contact_id"),                      // Chatwoot contact ID
  inboxId: text("inbox_id"),                          // inbox source (WhatsApp, Web, dst)
  createdAt: text("created_at"),
});
export type ChatwootTicketLink = typeof chatwootTicketLinks.$inferSelect;

// Pemetaan Workspace user ↔ Chatwoot agent (per-mitra; agent per-account).
export const chatwootAgentLinks = mysqlTable("chatwoot_agent_links", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  userId: int("user_id").notNull(),
  chatwootAgentId: varchar("chatwoot_agent_id", { length: 64 }).notNull(),
  agentName: text("agent_name"),
  agentEmail: text("agent_email"),
  createdAt: text("created_at"),
  updatedAt: text("updated_at"),
});
export type ChatwootAgentLink = typeof chatwootAgentLinks.$inferSelect;

// ==================== TEAMSPACE (v5.0) ====================
// Modul kolaborasi tim internal (PRD-JABNET-TEAMSPACE.md).
// Fase 1: teams + members + board tugas di atas engine pipelines eksisting.

/** Tim/divisi internal (NOC, Marketing, Finance, dst) atau Proyek.
 *  Setiap tim punya tepat SATU pipeline tugas (taskPipelineId) yang di-provision
 *  otomatis saat tim dibuat — board Kanban reuse engine pipelines. */
export const teams = mysqlTable("teams", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  parentId: int("parent_id"),                              // nested tree (Fase 2) — NULL = root
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  icon: varchar("icon", { length: 64 }),                   // nama ikon lucide
  color: varchar("color", { length: 16 }).notNull().default("#8B5CF6"),
  type: varchar("type", { length: 16 }).notNull().default("TEAM"),   // TEAM | PROJECT
  taskPipelineId: int("task_pipeline_id"),                 // FK pipelines.id (board tugas tim)
  enabledViews: text("enabled_views"),                     // JSON array berurut, default ["summary","tasks"]
  archivedAt: text("archived_at"),
  createdBy: int("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
}, (t) => ({
  byMitra: index("idx_teams_mitra").on(t.mitraId, t.name),
}));

export const teamMembers = mysqlTable("team_members", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  teamId: int("team_id").notNull(),
  userId: int("user_id").notNull(),
  role: varchar("role", { length: 16 }).notNull().default("member"),  // manager | member
  lastReadChatAt: text("last_read_chat_at"),               // unread chat marker (Fase 2)
  joinedAt: text("joined_at").notNull(),
}, (t) => ({
  uniqTeamUser: uniqueIndex("uniq_team_member").on(t.teamId, t.userId),
  byUser: index("idx_team_members_user").on(t.mitraId, t.userId),
}));

/** Label berwarna scoped per pipeline/board (FR-413) — pengganti tags bebas untuk board tim. */
export const pipelineLabels = mysqlTable("pipeline_labels", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  pipelineId: int("pipeline_id").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  colorHex: varchar("color_hex", { length: 16 }).notNull().default("#0EA5E9"),
  position: int("position").notNull().default(0),
  createdAt: text("created_at").notNull(),
}, (t) => ({
  byPipeline: index("idx_pipeline_labels_pipeline").on(t.mitraId, t.pipelineId, t.position),
}));

export const cardLabels = mysqlTable("card_labels", {
  id: int("id").autoincrement().primaryKey(),
  cardId: int("card_id").notNull(),
  labelId: int("label_id").notNull(),
}, (t) => ({
  uniqCardLabel: uniqueIndex("uniq_card_label").on(t.cardId, t.labelId),
  byLabel: index("idx_card_labels_label").on(t.labelId),
}));

/** Checklist bertingkat pada kartu (FR-406): checklist → items, progress bar dari rasio checked. */
export const cardChecklists = mysqlTable("card_checklists", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  cardId: int("card_id").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  position: int("position").notNull().default(0),
  createdAt: text("created_at").notNull(),
}, (t) => ({
  byCard: index("idx_card_checklists_card").on(t.cardId),
}));

export const cardChecklistItems = mysqlTable("card_checklist_items", {
  id: int("id").autoincrement().primaryKey(),
  checklistId: int("checklist_id").notNull(),
  text: varchar("text", { length: 500 }).notNull(),
  isChecked: int("is_checked").notNull().default(0),
  position: int("position").notNull().default(0),
  createdAt: text("created_at").notNull(),
}, (t) => ({
  byChecklist: index("idx_card_checklist_items_checklist").on(t.checklistId),
}));

// ── Fase 2: Chat, Jadwal, Check-in, Dokumen & File ──

/** Chat grup per tim (FR-5xx) — 1 tim = 1 room (tanpa tabel room terpisah). */
export const teamChatMessages = mysqlTable("team_chat_messages", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  teamId: int("team_id").notNull(),
  senderId: int("sender_id").notNull(),
  body: text("body"),
  attachmentPath: varchar("attachment_path", { length: 255 }),
  attachmentName: varchar("attachment_name", { length: 255 }),
  attachmentMime: varchar("attachment_mime", { length: 128 }),
  attachmentSize: int("attachment_size"),
  replyToId: int("reply_to_id"),
  createdAt: text("created_at").notNull(),
  editedAt: text("edited_at"),
  deletedAt: text("deleted_at"),                           // soft delete — bubble "pesan dihapus"
}, (t) => ({
  byTeam: index("idx_team_chat_team").on(t.mitraId, t.teamId, t.id),
}));

/** Event jadwal tim (FR-7xx). Recurrence JSON sederhana (shared/eventRecurrence). */
export const teamEvents = mysqlTable("team_events", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  teamId: int("team_id").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  // ISO 8601 timestamp — varchar (bukan text) supaya bisa masuk composite index di bawah
  // (MySQL/MariaDB menolak index TEXT tanpa prefix length). Panjang 32 cukup untuk ISO+offset.
  startAt: varchar("start_at", { length: 32 }).notNull(),
  endAt: varchar("end_at", { length: 32 }).notNull(),
  recurrence: text("recurrence"),                          // JSON {freq,interval,until} — NULL = sekali
  isConfidential: int("is_confidential").notNull().default(0),
  notes: text("notes"),
  createdBy: int("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
  archivedAt: text("archived_at"),
}, (t) => ({
  byTeamStart: index("idx_team_events_team_start").on(t.mitraId, t.teamId, t.startAt),
}));

export const teamEventParticipants = mysqlTable("team_event_participants", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("event_id").notNull(),
  userId: int("user_id").notNull(),
}, (t) => ({
  uniqEventUser: uniqueIndex("uniq_event_participant").on(t.eventId, t.userId),
}));

/** Pertanyaan rutin / check-in (FR-8xx). Jadwal DOW ISO 1=Senin..7=Minggu + jam "HH:mm". */
export const checkinQuestions = mysqlTable("checkin_questions", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  teamId: int("team_id").notNull(),
  questionText: text("question_text").notNull(),
  sendDays: text("send_days").notNull(),                   // JSON array [1..7]
  sendTime: varchar("send_time", { length: 5 }).notNull(), // "HH:mm"
  isConfidential: int("is_confidential").notNull().default(0), // jawaban hanya visible pembuat+admin
  isActive: int("is_active").notNull().default(1),
  lastSentDate: varchar("last_sent_date", { length: 10 }), // dedup harian worker (YYYY-MM-DD)
  createdBy: int("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
}, (t) => ({
  byTeam: index("idx_checkin_questions_team").on(t.mitraId, t.teamId),
}));

export const checkinRecipients = mysqlTable("checkin_recipients", {
  id: int("id").autoincrement().primaryKey(),
  questionId: int("question_id").notNull(),
  userId: int("user_id").notNull(),
}, (t) => ({
  uniqQuestionUser: uniqueIndex("uniq_checkin_recipient").on(t.questionId, t.userId),
}));

export const checkinResponses = mysqlTable("checkin_responses", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  questionId: int("question_id").notNull(),
  userId: int("user_id").notNull(),
  responseDate: varchar("response_date", { length: 10 }).notNull(), // tanggal instance (= lastSentDate saat dikirim)
  responseText: text("response_text").notNull(),
  submittedAt: text("submitted_at").notNull(),
}, (t) => ({
  uniqInstanceUser: uniqueIndex("uniq_checkin_response").on(t.questionId, t.userId, t.responseDate),
  byQuestionDate: index("idx_checkin_responses_qdate").on(t.questionId, t.responseDate),
}));

/** Folder untuk Dokumen & File (FR-903) — nested via parentFolderId. */
export const teamFolders = mysqlTable("team_folders", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  teamId: int("team_id").notNull(),
  parentFolderId: int("parent_folder_id"),
  name: varchar("name", { length: 255 }).notNull(),
  createdBy: int("created_by").notNull(),
  createdAt: text("created_at").notNull(),
}, (t) => ({
  byTeam: index("idx_team_folders_team").on(t.mitraId, t.teamId, t.parentFolderId),
}));

/** Dokumen native (markdown) per tim (FR-901b/902). */
export const teamDocuments = mysqlTable("team_documents", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  teamId: int("team_id").notNull(),
  folderId: int("folder_id"),
  title: varchar("title", { length: 255 }).notNull(),
  content: mediumtext("content"),                          // markdown
  isConfidential: int("is_confidential").notNull().default(0),
  archivedAt: text("archived_at"),
  createdBy: int("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
  updatedBy: int("updated_by"),
}, (t) => ({
  byTeam: index("idx_team_documents_team").on(t.mitraId, t.teamId, t.folderId),
}));

/** File upload per tim (FR-901a). filePath relatif JABNET_UPLOAD_ROOT. */
export const teamFiles = mysqlTable("team_files", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  teamId: int("team_id").notNull(),
  folderId: int("folder_id"),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  filePath: varchar("file_path", { length: 255 }).notNull(),
  mimeType: varchar("mime_type", { length: 128 }).notNull(),
  sizeBytes: int("size_bytes").notNull().default(0),
  uploadedBy: int("uploaded_by").notNull(),
  archivedAt: text("archived_at"),
  createdAt: text("created_at").notNull(),
}, (t) => ({
  byTeam: index("idx_team_files_team").on(t.mitraId, t.teamId, t.folderId),
}));

/** Cheers / apresiasi antar-rekan (FR-1203, Fase 3). */
export const cheers = mysqlTable("cheers", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  fromUserId: int("from_user_id").notNull(),
  toUserId: int("to_user_id").notNull(),
  message: varchar("message", { length: 500 }).notNull(),
  cardId: int("card_id"),                                  // opsional: cheers atas tugas tertentu
  createdAt: text("created_at").notNull(),
}, (t) => ({
  byTo: index("idx_cheers_to").on(t.mitraId, t.toUserId, t.id),
  byFrom: index("idx_cheers_from").on(t.mitraId, t.fromUserId),
}));

export type Cheer = typeof cheers.$inferSelect;

// ── v5.1 SDM / HRD (adaptasi SDM_Jabnet.xlsx Fase 1) ──────────────────────
// Kehadiran harian per karyawan (upsert per user+tanggal) + pengajuan cuti.
export const hrAttendance = mysqlTable("hr_attendance", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  userId: int("user_id").notNull(),
  date: varchar("date", { length: 10 }).notNull(),           // YYYY-MM-DD
  status: varchar("status", { length: 12 }).notNull(),       // hadir|izin|sakit|cuti|alpha|libur
  checkIn: varchar("check_in", { length: 5 }),               // HH:MM
  checkOut: varchar("check_out", { length: 5 }),
  note: varchar("note", { length: 255 }),
  createdBy: int("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
}, (t) => ({
  uniqUserDate: uniqueIndex("uq_hr_att_user_date").on(t.mitraId, t.userId, t.date),
  byDate: index("idx_hr_att_date").on(t.mitraId, t.date),
}));

export const hrLeaves = mysqlTable("hr_leaves", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  userId: int("user_id").notNull(),
  startDate: varchar("start_date", { length: 10 }).notNull(),
  endDate: varchar("end_date", { length: 10 }).notNull(),
  type: varchar("type", { length: 16 }).notNull(),           // tahunan|sakit|izin|khusus
  reason: varchar("reason", { length: 500 }),
  status: varchar("status", { length: 10 }).notNull().default("pending"),  // pending|approved|rejected
  reviewedBy: int("reviewed_by"),
  reviewedAt: text("reviewed_at"),
  reviewNote: varchar("review_note", { length: 255 }),
  createdAt: text("created_at").notNull(),
}, (t) => ({
  byUser: index("idx_hr_leaves_user").on(t.mitraId, t.userId, t.id),
  byStatus: index("idx_hr_leaves_status").on(t.mitraId, t.status),
}));

export type HrAttendance = typeof hrAttendance.$inferSelect;
export type HrLeave = typeof hrLeaves.$inferSelect;

export const HR_ATTENDANCE_STATUSES = ["hadir", "izin", "sakit", "cuti", "alpha", "libur"] as const;
export const HR_LEAVE_TYPES = ["tahunan", "sakit", "izin", "khusus"] as const;

/** Penerima konten "Rahasia" — SATU tabel polymorphic untuk announcement/document/event/checkin (FR-1404). */
export const contentRecipients = mysqlTable("content_recipients", {
  id: int("id").autoincrement().primaryKey(),
  ownerType: varchar("owner_type", { length: 16 }).notNull(), // announcement|document|event|checkin
  ownerId: int("owner_id").notNull(),
  userId: int("user_id").notNull(),
}, (t) => ({
  uniqOwnerUser: uniqueIndex("uniq_content_recipient").on(t.ownerType, t.ownerId, t.userId),
  byUser: index("idx_content_recipients_user").on(t.userId),
}));

export type Team = typeof teams.$inferSelect;
export type TeamMember = typeof teamMembers.$inferSelect;
export type PipelineLabel = typeof pipelineLabels.$inferSelect;
export type CardLabel = typeof cardLabels.$inferSelect;
export type CardChecklist = typeof cardChecklists.$inferSelect;
export type CardChecklistItem = typeof cardChecklistItems.$inferSelect;
export type TeamChatMessage = typeof teamChatMessages.$inferSelect;
export type TeamEvent = typeof teamEvents.$inferSelect;
export type CheckinQuestion = typeof checkinQuestions.$inferSelect;
export type CheckinResponse = typeof checkinResponses.$inferSelect;
export type TeamFolder = typeof teamFolders.$inferSelect;
export type TeamDocument = typeof teamDocuments.$inferSelect;
export type TeamFile = typeof teamFiles.$inferSelect;

export const insertTeamSchema = createInsertSchema(teams, {
  name: z.string().min(1, "Nama tim wajib diisi").max(255),
}).omit({ id: true, mitraId: true, taskPipelineId: true, createdBy: true, createdAt: true, updatedAt: true, archivedAt: true });

/** Default views saat tim dibuat — Fase 2 lengkap (bisa di-pin/lepas via pengaturan tim). */
export const TEAM_DEFAULT_VIEWS = ["summary", "tasks", "chat", "schedule", "checkins", "docs", "announcements"] as const;
/** Stage default board tugas tim — copywriting mengikuti Cicle agar zero learning curve. */
export const TEAM_TASK_DEFAULT_STAGES = [
  { label: "To Do List", color: "#64748B", semanticType: "todo" },
  { label: "Dikerjakan", color: "#F59E0B", semanticType: "in_progress" },
  { label: "Selesai", color: "#22C55E", semanticType: "done" },
  { label: "Batal", color: "#94A3B8", semanticType: "cancelled" },
] as const;
export type StageSemanticType = "todo" | "in_progress" | "done" | "cancelled" | "custom";

// ── Workflow Stage Type (di-store sebagai JSON di ticket_categories.workflow_stages) ──
// v4.2.6: re-aligned dengan design Jabnet Work Order — fields array berisi field types
//   yang harus di-collect teknisi di setiap stage. Field types yang valid:
//   "photo" | "checklist" | "notes" | "numeric" | "speedtest" | "barcode"
//   | "signature" | "gps" | "eta" | "rating"
export type StageFieldType = "photo" | "checklist" | "notes" | "numeric" | "speedtest" | "barcode" | "signature" | "gps" | "eta" | "rating";

/**
 * v4.2.7: Custom field definition — admin bisa bikin field arbitrary per stage.
 * Built-in fields (StageFieldType) punya specialized behavior (camera, GPS API, dst);
 * custom fields generic input/textarea/select/checkbox/number.
 */
export type CustomFieldType = "text" | "number" | "textarea" | "select" | "checkbox" | "date";

export interface CustomField {
  key: string;                    // unique key dalam stage (auto-slug dari label)
  label: string;                  // display label
  type: CustomFieldType;
  required?: boolean;
  hint?: string;                  // helper text
  placeholder?: string;
  options?: string[];             // untuk type=select
  unit?: string;                  // untuk type=number (mis: "Mbps", "dBm")
  min?: number;                   // untuk type=number
  max?: number;                   // untuk type=number
}

export interface WorkflowStage {
  key: string;                    // "prep" | "survey" | dst (unique per kategori)
  label: string;                  // "Persiapan Peralatan"
  description?: string;           // hint untuk teknisi
  fields?: StageFieldType[];      // v4.2.6: built-in field types
  customFields?: CustomField[];   // v4.2.7: admin-defined custom fields
  // Legacy v4.2.4 props — kept for backward compat:
  icon?: string;
  color?: string;
  requiresPhoto?: boolean;
  requiresGps?: boolean;
  requiresNote?: boolean;
  requiresSignature?: boolean;
  slaMinutes?: number;
  isFinal?: boolean;
  sortOrder: number;
}

// Default workflow kalau kategori belum punya custom stages
export const DEFAULT_TICKET_WORKFLOW: WorkflowStage[] = [
  { key: "prep",     label: "Persiapan",        icon: "PackageCheck", color: "#0EA5E9", sortOrder: 1, slaMinutes: 30, requiresPhoto: false },
  { key: "travel",   label: "Perjalanan",       icon: "Navigation",   color: "#8B5CF6", sortOrder: 2, slaMinutes: 60, requiresGps: true },
  { key: "onsite",   label: "Pengerjaan",       icon: "Wrench",       color: "#F59E0B", sortOrder: 3, slaMinutes: 120, requiresPhoto: true },
  { key: "verify",   label: "Verifikasi",       icon: "CheckCircle",  color: "#22C55E", sortOrder: 4, slaMinutes: 30, requiresPhoto: true },
  { key: "done",     label: "Selesai",          icon: "Flag",         color: "#10B981", sortOrder: 5, isFinal: true, requiresNote: true },
];

// Workflow preset — re-aligned dengan design Jabnet Work Order (chat reference)
// Setiap stage punya `fields` array yang menentukan FieldCard apa saja muncul di mobile teknisi.
export const WORKFLOW_PRESETS: Record<string, WorkflowStage[]> = {
  /** PSB — Pemasangan Baru (8 stages, full lifecycle) */
  psb: [
    { key: "prep",         label: "Persiapan",         description: "Cek tools & material",            fields: ["checklist", "photo"],                       sortOrder: 1, slaMinutes: 30 },
    { key: "travel",       label: "Dalam Perjalanan",  description: "Menuju lokasi pelanggan",         fields: ["gps", "eta"],                               sortOrder: 2, slaMinutes: 60 },
    { key: "survey",       label: "Survey Lokasi",     description: "Pengecekan lokasi & rute kabel",  fields: ["photo", "notes", "gps"],                    sortOrder: 3, slaMinutes: 30 },
    { key: "pull_cable",   label: "Penarikan Kabel",   description: "Tarik drop core dari ODP",        fields: ["photo", "numeric", "notes"],                sortOrder: 4, slaMinutes: 90 },
    { key: "install",      label: "Instalasi Perangkat", description: "Pasang ONT & router",           fields: ["barcode", "photo", "notes"],                sortOrder: 5, slaMinutes: 45 },
    { key: "measurement",  label: "Pengukuran Signal", description: "Test redaman & speed",            fields: ["numeric", "speedtest"],                     sortOrder: 6, slaMinutes: 15 },
    { key: "activation",   label: "Aktivasi & Testing", description: "Aktivasi layanan",                fields: ["speedtest", "checklist"],                   sortOrder: 7, slaMinutes: 15 },
    { key: "completion",   label: "Penyelesaian",      description: "Tanda tangan & dokumentasi",      fields: ["signature", "photo", "rating"],             sortOrder: 8, slaMinutes: 10, isFinal: true },
  ],
  /** Gangguan — Maintenance Corrective (6 stages, focus diagnose+repair) */
  gangguan: [
    { key: "diagnose_remote", label: "Diagnosa Awal",     description: "Remote check dari NOC",            fields: ["notes", "numeric"],                  sortOrder: 1, slaMinutes: 15 },
    { key: "dispatch",        label: "Dispatch Teknisi",  description: "Assign & berangkat",               fields: ["gps", "eta"],                        sortOrder: 2, slaMinutes: 45 },
    { key: "investigate",     label: "Investigasi On-site", description: "Identifikasi sumber masalah",    fields: ["photo", "notes", "numeric"],         sortOrder: 3, slaMinutes: 30 },
    { key: "repair",          label: "Perbaikan",         description: "Eksekusi perbaikan",               fields: ["photo", "notes", "barcode"],         sortOrder: 4, slaMinutes: 90 },
    { key: "verify",          label: "Verifikasi",        description: "Test koneksi & signal",            fields: ["speedtest", "numeric"],              sortOrder: 5, slaMinutes: 15 },
    { key: "confirm",         label: "Konfirmasi Pelanggan", description: "Pelanggan setuju selesai",      fields: ["signature", "rating"],               sortOrder: 6, slaMinutes: 10, isFinal: true },
  ],
  /** Maintenance Preventive (6 stages) */
  preventive: [
    { key: "schedule",     label: "Penjadwalan",          description: "Kontak pelanggan",                 fields: ["notes"],                              sortOrder: 1, slaMinutes: 15 },
    { key: "visit",        label: "Kunjungan Lokasi",     description: "Tiba di lokasi",                   fields: ["gps", "photo"],                       sortOrder: 2, slaMinutes: 45 },
    { key: "inspection",   label: "Inspeksi Perangkat",   description: "Cek ONT, router, kabel",           fields: ["checklist", "photo"],                 sortOrder: 3, slaMinutes: 30 },
    { key: "performance",  label: "Pengukuran Performance", description: "Signal & speed test",            fields: ["numeric", "speedtest"],               sortOrder: 4, slaMinutes: 15 },
    { key: "tuning",       label: "Cleaning & Tuning",    description: "Pembersihan & optimasi",           fields: ["photo", "checklist"],                 sortOrder: 5, slaMinutes: 30 },
    { key: "report",       label: "Laporan",              description: "Dokumentasi & TTD",                fields: ["signature", "notes"],                 sortOrder: 6, slaMinutes: 10, isFinal: true },
  ],
  /** Relokasi — Pindah lokasi pelanggan */
  relokasi: [
    { key: "survey_new",   label: "Survey Lokasi Baru",   description: "Cek feasibility",                  fields: ["photo", "gps", "notes"],              sortOrder: 1, slaMinutes: 45 },
    { key: "dismantle",    label: "Dismantle Lokasi Lama", description: "Lepas perangkat lama",            fields: ["photo", "barcode"],                   sortOrder: 2, slaMinutes: 30 },
    { key: "mobilize",     label: "Mobilisasi",           description: "Pindah ke lokasi baru",            fields: ["gps"],                                sortOrder: 3, slaMinutes: 60 },
    { key: "install_new",  label: "Instalasi Lokasi Baru", description: "Pasang ulang",                    fields: ["photo", "barcode", "numeric"],        sortOrder: 4, slaMinutes: 90 },
    { key: "test_new",     label: "Testing & Aktivasi",   description: "Verifikasi koneksi",               fields: ["speedtest"],                          sortOrder: 5, slaMinutes: 15 },
    { key: "complete",     label: "Penyelesaian",         description: "TTD pelanggan",                    fields: ["signature"],                          sortOrder: 6, slaMinutes: 10, isFinal: true },
  ],
  /** Upgrade Paket */
  upgrade: [
    { key: "verify_order",  label: "Verifikasi Order",    description: "Cek kelayakan upgrade",            fields: ["notes"],                              sortOrder: 1, slaMinutes: 30 },
    { key: "provisioning",  label: "Provisioning",        description: "Update profile di OLT",            fields: ["notes"],                              sortOrder: 2, slaMinutes: 15 },
    { key: "speedtest",     label: "Speed Test",          description: "Verifikasi bandwidth baru",        fields: ["speedtest"],                          sortOrder: 3, slaMinutes: 10 },
    { key: "notify",        label: "Konfirmasi",          description: "Notifikasi ke pelanggan",          fields: ["notes"],                              sortOrder: 4, slaMinutes: 10, isFinal: true },
  ],
  /** Dismantle — Berhenti berlangganan */
  dismantle: [
    { key: "visit",        label: "Kunjungan Lokasi",     description: "Tiba di pelanggan",                fields: ["gps"],                                sortOrder: 1, slaMinutes: 60 },
    { key: "remove_device", label: "Lepas Perangkat",     description: "Ambil ONT & accessories",          fields: ["photo", "barcode"],                   sortOrder: 2, slaMinutes: 30 },
    { key: "remove_cable", label: "Lepas Kabel",          description: "Cabut drop core",                  fields: ["photo"],                              sortOrder: 3, slaMinutes: 30 },
    { key: "ba",           label: "Berita Acara",         description: "TTD pelanggan",                    fields: ["signature", "photo"],                 sortOrder: 4, slaMinutes: 15, isFinal: true },
  ],
  /** Survey only — singkat (legacy alias) */
  survey: [
    { key: "travel",   label: "Perjalanan",       fields: ["gps", "eta"],                  sortOrder: 1, slaMinutes: 60 },
    { key: "survey",   label: "Survey Onsite",    fields: ["photo", "notes", "gps"],       sortOrder: 2, slaMinutes: 30 },
    { key: "report",   label: "Buat Laporan",     fields: ["signature", "notes"],          sortOrder: 3, isFinal: true, slaMinutes: 10 },
  ],
  /** Migrasi (legacy alias to relokasi) */
  migrasi: [
    { key: "prep",     label: "Persiapan",        fields: ["checklist"],                   sortOrder: 1, slaMinutes: 20 },
    { key: "travel",   label: "Perjalanan",       fields: ["gps", "eta"],                  sortOrder: 2, slaMinutes: 45 },
    { key: "before",   label: "Foto Awal",        fields: ["photo"],                       sortOrder: 3, slaMinutes: 10 },
    { key: "execute",  label: "Eksekusi",         fields: ["photo", "notes"],              sortOrder: 4, slaMinutes: 90 },
    { key: "verify",   label: "Test & Aktivasi",  fields: ["speedtest", "numeric"],        sortOrder: 5, slaMinutes: 20 },
    { key: "done",     label: "Selesai",          fields: ["signature", "notes"],          sortOrder: 6, isFinal: true, slaMinutes: 10 },
  ],
  /** Install (legacy alias to psb) */
  install: [
    { key: "survey",     label: "Survey Lokasi",       fields: ["photo", "gps"],          sortOrder: 1, slaMinutes: 60 },
    { key: "prep",       label: "Siapkan ONT+Kabel",   fields: ["photo", "checklist"],    sortOrder: 2, slaMinutes: 30 },
    { key: "pull_cable", label: "Tarik Kabel",         fields: ["photo", "numeric"],      sortOrder: 3, slaMinutes: 120 },
    { key: "install",    label: "Pasang ONT",          fields: ["barcode", "photo"],      sortOrder: 4, slaMinutes: 60 },
    { key: "activate",   label: "Aktivasi",            fields: ["speedtest", "checklist"], sortOrder: 5, slaMinutes: 30 },
    { key: "handover",   label: "Serah Terima",        fields: ["signature", "rating"],   sortOrder: 6, isFinal: true, slaMinutes: 10 },
  ],
};

// ==================== DASHBOARD TYPES ====================

export interface DashboardStats {
  totalPops: number;
  totalOdcs: number;
  totalOdps: number;
  totalCustomers: number;
  activeCustomers: number;
  isolirCustomers: number;
  totalPoles: number;
  totalCables: number;
  cableMeters: { feeder: number; distribution: number; drop: number; total: number };
  totalCoreUsage: { total: number; used: number };
  totalPortUsage: { total: number; used: number };
  
  // Realtime Capacity Metrics
  portTersediaTotal: number;
  odpKritisCount: number;
  coreFeederSisa: number;
  rataPertumbuhanHarian: number;
  hariHinggaPenuh: number;
}

// Light projections for /api/map-data — drop heavy fields (pppoe creds,
// manualOverrides, notes, billing sync metadata, etc.) to reduce payload ~80%.
// Keep only fields actually read by MapPage.tsx + MapInfoWindow.tsx.
export type MapPop = Pick<Pop, "id" | "name" | "code" | "lat" | "lng" | "status" | "address" | "totalPorts" | "usedPorts" | "district" | "village">;
export type MapOdc = Pick<Odc, "id" | "name" | "code" | "lat" | "lng" | "status" | "popId" | "capacity" | "usedCapacity" | "address" | "splitterType" | "district" | "village">;
export type MapOdp = Pick<Odp, "id" | "name" | "code" | "lat" | "lng" | "status" | "odcId" | "capacity" | "address" | "splitterType" | "district" | "village"> & { usedCapacity: number };
export type MapCustomer = Pick<Customer, "id" | "name" | "customerId" | "lat" | "lng" | "status" | "isIsolir" | "odpId" | "package" | "phone" | "address" | "portNumber" | "isStatic">;
export type MapPole = Pick<Pole, "id" | "name" | "code" | "lat" | "lng" | "type" | "height" | "status">;
export type MapCable = Pick<Cable, "id" | "name" | "code" | "cableType" | "pathCoordinates" | "lengthMeters" | "usedCore" | "totalCore" | "usedTube" | "totalTube" | "status">;

export interface MapData {
  pops: MapPop[];
  odcs: MapOdc[];
  odps: MapOdp[];
  customers: MapCustomer[];
  poles: MapPole[];
  cables: MapCable[];
}

// ==================== POWER BUDGET ====================

export const POWER_BUDGET = {
  gponOutput: 8, // dBm
  fiberLossPerKm: 0.35, // dB/km
  spliceLoss: 0.1, // dB per splice
  connectorLoss: 0.5, // dB per connector
  splitterLoss: {
    "1:2": 3.5,
    "1:4": 7.0,
    "1:8": 10.5,
    "1:16": 13.5,
    "1:32": 17.0,
  } as Record<string, number>,
  rxSensitivity: -28, // dBm (GPON ONT)
  rxMaxTarget: -22, // dBm (recommended max for margin)
};

export function calculatePowerBudget(segments: {
  fiberKm: number;
  splices: number;
  connectors: number;
  splitters: string[]; // e.g. ["1:4", "1:8"]
}): { totalLoss: number; rxPower: number; status: "ok" | "warning" | "fail" } {
  let loss = 0;
  loss += segments.fiberKm * POWER_BUDGET.fiberLossPerKm;
  loss += segments.splices * POWER_BUDGET.spliceLoss;
  loss += segments.connectors * POWER_BUDGET.connectorLoss;
  for (const s of segments.splitters) {
    loss += POWER_BUDGET.splitterLoss[s] || 0;
  }
  const rxPower = POWER_BUDGET.gponOutput - loss;
  const status = rxPower >= POWER_BUDGET.rxMaxTarget ? "ok"
    : rxPower >= POWER_BUDGET.rxSensitivity ? "warning" : "fail";
  return { totalLoss: Math.round(loss * 1000) / 1000, rxPower: Math.round(rxPower * 1000) / 1000, status };
}
