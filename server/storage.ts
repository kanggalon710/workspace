import { eq, sql, desc, asc, and, gte, lte, or, inArray, isNull, isNotNull, count, like, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql, { type Pool as MySQLPool } from "mysql2/promise";

// FASE 1B (deferred refactor): legacy `this.sqlite` calls masih ada untuk backward-reference.
// Jangan dipakai di runtime - semua `this.sqlite.*` akan throw error.
// Lihat: docs handoff Phase 1B di CLAUDE.md.
type SqliteCompatShim = {
  prepare: (sql: string) => never;
  exec: (sql: string) => never;
  pragma: (cmd: string) => void;
  transaction: <T>(fn: T) => never;
};
import bcrypt from "bcryptjs";
import {
  pops, odcs, odps, odpPhotos, assetPhotos, customers, poles, cables,
  otbs, bestrays, splitters, cableCores, coreConnections,
  users, auditLogs,
  prospects, leads, leadActivities, canvassingSessions, canvassingLogs, odpScrapeCache,
  mikrotikRouters,
  TUBE_COLORS, CORE_COLORS,
  type Pop, type InsertPop,
  type Odc, type InsertOdc,
  type Odp, type InsertOdp,
  type OdpPhoto, type InsertOdpPhoto,
  type AssetPhoto,
  type Customer, type InsertCustomer,
  type Pole, type InsertPole,
  type Cable, type InsertCable,
  type Otb, type InsertOtb,
  type Bestray, type InsertBestray,
  type Splitter, type InsertSplitter,
  type CableCore, type InsertCableCore,
  type CoreConnection, type InsertCoreConnection,
  type User, type InsertUser,
  type AuditLog, type InsertAuditLog,
  type DashboardStats, type MapData,
  type Prospect, type InsertProspect,
  type Lead, type InsertLead,
  type LeadActivity, type InsertLeadActivity,
  type CanvassingSession, type InsertCanvassingSession,
  type CanvassingLog, type InsertCanvassingLog,
  type MikrotikRouter, type InsertMikrotikRouter,
  appSettings, type AppSetting,
  apiKeys, type ApiKey, apiKeyUsageLogs, type ApiKeyUsageLog,
  notifications, type Notification,
  announcements, type Announcement,
  bugReports, type BugReport, bugComments, type BugComment,
  ticketCategories, tickets, ticketActivities,
  ticketTeam, type TicketTeamMember,
  ticketEvidence, type TicketEvidenceItem,
  ticketGpsLogs, type TicketGpsLog,
  ticketStageTransitions, type TicketStageTransition,
  ticketCsat, type TicketCsat,
  ticketSlaEscalations, type TicketSlaEscalation,
  networkAlarms, type NetworkAlarm,
  ticketStageEditLog, type TicketStageEditLog,
  ticketComments, type TicketComment,
  ticketPauses, type TicketPause,
  ticketCheckpoints, type TicketCheckpoint,
  chatwootConfig, type ChatwootConfig,
  chatwootKeywordRules, type ChatwootKeywordRule,
  chatwootTicketLinks, type ChatwootTicketLink,
  chatwootAgentLinks, type ChatwootAgentLink,
  type TicketCategory, type InsertTicketCategory,
  type Ticket, type InsertTicket,
  type TicketActivity, type InsertTicketActivity,
  type WorkflowStage, DEFAULT_TICKET_WORKFLOW, WORKFLOW_PRESETS,
  type CheckpointAction, CHECKPOINT_ACTIONS, CHECKPOINT_ACTION_CONFIG,
  roles, type Role, type InsertRole,
  rolePresets, type RolePreset, type InsertRolePreset,
  buildPermissionMatrixFromPreset, PERMISSION_PRESETS,
  ALL_PERMISSION_KEYS, type PermissionLevel,
  collections, collectionActivities, collectionAssignees,
  collectionStages, DEFAULT_COLLECTION_STAGES, COLLECTION_STAGE_LABELS, COLLECTION_STAGE_COLORS,
  type Collection, type InsertCollection,
  type CollectionActivity, type InsertCollectionActivity,
  type CollectionStageRow, type CollectionStageRole,
  customerOtps, customerPortalSessions, trafficSnapshots,
  customerLoyalty, customerDiscounts, customerReferrals,
  pointTransactions, pointRedemptions,
  type PointTransaction, type InsertPointTransaction,
  type PointRedemption, type InsertPointRedemption,
  type CustomerLoyalty, type InsertCustomerLoyalty,
  type CustomerDiscount, type InsertCustomerDiscount,
  type CustomerReferral, type InsertCustomerReferral,
  type CustomerOtp, type InsertCustomerOtp,
  type CustomerPortalSession, type InsertCustomerPortalSession,
  type TrafficSnapshot, type InsertTrafficSnapshot,
  mpwaTemplates,
  type MpwaTemplate, type InsertMpwaTemplate,
  adCampaigns, type AdCampaign, type InsertAdCampaign,
  broadcastCampaigns, broadcastRecipients, broadcastSegments,
  type BroadcastCampaign, type InsertBroadcastCampaign,
  type BroadcastRecipient, type InsertBroadcastRecipient,
  type BroadcastSegment, type InsertBroadcastSegment,
  // v4.2.20: WhatsApp v2 (multi-device + resellers)
  waDevices, resellers,
  type WaDevice, type InsertWaDevice,
  type Reseller, type InsertReseller,
  // Phase B multi-tenant: mitras + user_mitras join
  mitras, userMitras,
  type Mitra, type InsertMitra,
  type UserMitra, type InsertUserMitra,
  // Phase F: per-tenant integration settings
  mitraIntegrations,
  type MitraIntegration, type InsertMitraIntegration,
  // v4.2.21: WA Inbox (webhook receiver)
  waInbox,
  type WaInboxMessage, type InsertWaInboxMessage,
  // v4.2.24: Phonebooks (custom contact lists)
  phonebooks, phonebookContacts,
  type Phonebook, type InsertPhonebook,
  type PhonebookContact, type InsertPhonebookContact,
  // Phase 1: Generic Pipelines Engine
  pipelines, pipelineStages, pipelineCards,
  pipelineCardComments, pipelineCardActivity, pipelineCardFollowers, pipelineCardAttachments, pipelineCardAssignees,
  type Pipeline, type PipelineStage, type PipelineCard,
  type PipelineCardComment, type PipelineCardActivity, type PipelineCardFollower, type PipelineCardAttachment, type PipelineCardAssignee,
  // Phase 2: Pipeline custom fields
  pipelineFields, pipelineCardValues,
  type PipelineField, type PipelineCardValue,
  // Phase 3: Pipeline access grants
  pipelineAccess,
  type PipelineAccess,
  // Phase 4a: Automation rules
  pipelineRules, pipelineRuleFires, pipelineRuleFieldMaps, pipelineRuleActions,
  type PipelineRule, type PipelineRuleFire, type PipelineRuleFieldMap, type PipelineRuleAction, type PipelineRuleActionType, type RuleTriggerType,
  // LP1: Lead card links
  leadCardLinks,
  type LeadCardLink,
  // Phase 5: Card relations
  cardRelations,
  type CardRelation,
  // Phase 5 (templates): pipeline_templates table
  pipelineTemplates,
  type PipelineTemplate,
  // SP2: Collection Config + Stage Map
  collectionConfig,
  collectionStageMap,
  type CollectionConfig,
  type CollectionStageMapRow,
  // MP1: Pipeline Metrics
  pipelineMetrics,
  type PipelineMetric,
  // Teamspace v5.0 Fase 1
  teams, teamMembers, pipelineLabels, cardLabels, cardChecklists, cardChecklistItems,
  type Team, type TeamMember, type PipelineLabel, type CardChecklist, type CardChecklistItem,
  TEAM_TASK_DEFAULT_STAGES, TEAM_DEFAULT_VIEWS,
  // Teamspace v5.0 Fase 2
  teamChatMessages, teamEvents, teamEventParticipants,
  checkinQuestions, checkinRecipients, checkinResponses,
  teamFolders, teamDocuments, teamFiles, contentRecipients,
  type TeamChatMessage, type TeamEvent, type CheckinQuestion, type CheckinResponse,
  type TeamFolder, type TeamDocument, type TeamFile,
  // Teamspace v5.0 Fase 3
  cheers, type Cheer,
  hrAttendance, hrLeaves, type HrAttendance, type HrLeave,
  hrAttendanceEvents, hrOfficeLocations, hrShifts, hrScheduleAssignments, hrHolidays,
  type HrAttendanceEvent, type HrShift,
  hrEmployeeProfiles, hrOrgUnits, hrPositions, hrOvertime, hrShiftRoster,
  hrSalaryComponents, hrPayslips, hrCashAdvances, hrReimbursements, hrLocationPings,
  hrClients, hrClientVisits, hrKpiForms, hrKpiAssessments, hrPettyCash,
  type HrLocationPing, type HrClient, type HrClientVisit, type HrKpiForm,
  type HrKpiAssessment, type HrPettyCash,
  type HrEmployeeProfile, type HrOvertime, type HrSalaryComponent, type HrPayslip,
  type HrCashAdvance, type HrReimbursement,
} from "../shared/schema.js";
import { BUILTIN_TEMPLATES, pipelineToTemplate, remapFieldConfig, remapTemplateRule, type TemplateDefinition } from "../shared/pipelineTemplate.js";
import { type CollectionConfigInput, type StageMapRow } from "../shared/collectionConfig.js";
import { getFieldTypeMeta } from "../shared/pipelineFieldTypes.js";
import { capabilitiesFromLevel, deriveLevel, parseCapabilities, type PipelineCapability } from "../shared/pipelineCapabilities.js";
import { getCachedPerms, setCachedPerms, invalidatePermCache, getCachedPermsAtMitra, setCachedPermsAtMitra, invalidatePermCacheAtMitra } from "./perm-cache";
import { gatePermissionsByFeatures } from "./feature-gate.js";
import { getMitraId, getMitraIdOrNull, isSuperAdmin, withMitra } from "./tenant-context.js";
import { saveBase64Photo, deletePhoto, ensureMitraDirs } from "./uploads.js";
import { computePeriodBuckets, assignCountToBuckets, lastValueInBuckets, buildExecutiveFlags, deltaPct, type Period } from "./reporting-helpers.js";
import { computeInsertPosition } from "./pipeline-helpers.js";
import { parseRecurrence } from "../shared/ruleRecurrence.js";
import { buildCollectionSnapshot, resolveCollectionStatus, type CollectionSnapshot } from "../shared/collectionMetrics.js";
import { decideSopAdvance, stageKeysForDivision, type SopStageMeta } from "../shared/collectionSop.js";
import { isCardCommentType } from "../shared/cardCommentTypes.js";
import { tablesToMirror, copyColumns, buildCopySql } from "./dev-db-sync.js";

// ==================== BILLING TYPES ====================

export interface BillingCustomerRecord {
  customer_id: string;
  nama_lengkap: string;
  no_telepon: string;
  email: string;
  alamat_pemasangan: string;
  kecamatan: string;
  kelurahan: string;
  lat: string;
  long: string;
  paket_layanan: string;
  harga_layanan: number;
  tgl_instalasi: string;
  status_pelanggan: string;
  is_isolir: boolean;
  status_invoice: string;
  username_pppoe: string;
  type_pelanggan: string;
  // v4.1.2 optional - whitelist fields untuk BillingSyncWorker
  due_date?: string | null;
  last_payment_date?: string | null;
  isolir_date?: string | null;
}

// ==================== INTERFACE ====================

export interface IStorage {
  // POP
  getPops(): Promise<Pop[]>;
  getPop(id: number): Promise<Pop | undefined>;
  createPop(data: InsertPop): Promise<Pop>;
  updatePop(id: number, data: Partial<InsertPop>): Promise<Pop | undefined>;
  deletePop(id: number): Promise<boolean>;

  // ODC
  getOdcs(): Promise<Odc[]>;
  getOdc(id: number): Promise<Odc | undefined>;
  createOdc(data: InsertOdc): Promise<Odc>;
  updateOdc(id: number, data: Partial<InsertOdc>): Promise<Odc | undefined>;
  deleteOdc(id: number): Promise<boolean>;

  // ODP
  getOdps(): Promise<Odp[]>;
  getOdp(id: number): Promise<Odp | undefined>;
  createOdp(data: InsertOdp): Promise<Odp>;
  updateOdp(id: number, data: Partial<InsertOdp>): Promise<Odp | undefined>;
  deleteOdp(id: number): Promise<boolean>;

  // Customer
  getCustomers(): Promise<Customer[]>;
  getCustomer(id: number): Promise<Customer | undefined>;
  createCustomer(data: InsertCustomer): Promise<Customer>;
  updateCustomer(id: number, data: Partial<InsertCustomer>): Promise<Customer | undefined>;
  deleteCustomer(id: number): Promise<boolean>;
  upsertCustomerFromBilling(data: BillingCustomerRecord): Promise<{ action: 'created' | 'updated' }>;
  getCustomerByBillingId(customerId: string): Promise<Customer | undefined>;

  // Pole
  getPoles(): Promise<Pole[]>;
  getPole(id: number): Promise<Pole | undefined>;
  createPole(data: InsertPole): Promise<Pole>;
  updatePole(id: number, data: Partial<InsertPole>): Promise<Pole | undefined>;
  deletePole(id: number): Promise<boolean>;

  // Cable
  getCables(): Promise<Cable[]>;
  getCable(id: number): Promise<Cable | undefined>;
  createCable(data: InsertCable): Promise<Cable>;
  updateCable(id: number, data: Partial<InsertCable>): Promise<Cable | undefined>;
  deleteCable(id: number): Promise<boolean>;

  // OTB
  getOtbs(): Promise<Otb[]>;
  getOtbsByPop(popId: number): Promise<Otb[]>;
  getOtb(id: number): Promise<Otb | undefined>;
  createOtb(data: InsertOtb): Promise<Otb>;
  updateOtb(id: number, data: Partial<InsertOtb>): Promise<Otb | undefined>;
  deleteOtb(id: number): Promise<boolean>;

  // Bestray
  getBestrays(): Promise<Bestray[]>;
  getBestraysByOdc(odcId: number): Promise<Bestray[]>;
  getBestray(id: number): Promise<Bestray | undefined>;
  createBestray(data: InsertBestray): Promise<Bestray>;
  updateBestray(id: number, data: Partial<InsertBestray>): Promise<Bestray | undefined>;
  deleteBestray(id: number): Promise<boolean>;

  // Splitter
  getSplitters(): Promise<Splitter[]>;
  getSplitter(id: number): Promise<Splitter | undefined>;
  createSplitter(data: InsertSplitter): Promise<Splitter>;
  updateSplitter(id: number, data: Partial<InsertSplitter>): Promise<Splitter | undefined>;
  deleteSplitter(id: number): Promise<boolean>;

  // Cable Core
  getCableCores(): Promise<CableCore[]>;
  getCableCoreByCable(cableId: number): Promise<CableCore[]>;
  getCableCore(id: number): Promise<CableCore | undefined>;
  createCableCore(data: InsertCableCore): Promise<CableCore>;
  updateCableCore(id: number, data: Partial<InsertCableCore>): Promise<CableCore | undefined>;
  deleteCableCore(id: number): Promise<boolean>;
  generateCableCores(cableId: number, totalCore: number, totalTube: number): Promise<CableCore[]>;
  autoGenerateCableCores(cableId: number, totalCore: number, totalTube: number): Promise<void>;

  // Core Connection
  getCoreConnections(): Promise<CoreConnection[]>;
  getCoreConnection(id: number): Promise<CoreConnection | undefined>;
  createCoreConnection(data: InsertCoreConnection): Promise<CoreConnection>;
  updateCoreConnection(id: number, data: Partial<InsertCoreConnection>): Promise<CoreConnection | undefined>;
  deleteCoreConnection(id: number): Promise<boolean>;
  getCoreConnectionsByEntity(entityType: string, entityId: number): Promise<CoreConnection[]>;

  // User
  getAllUsers(): Promise<User[]>;
  getUserIdsInMitra(mitraId: number): Promise<Set<number>>;
  getAssignableUsers(activeMitraId: number | null | undefined, allowCrossTenant: boolean): Promise<Array<{ id: number; name: string | null; username: string; role: string; mitraId: number | null; mitraName: string | null }>>;
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByToken(token: string): Promise<User | undefined>;
  createUser(data: InsertUser): Promise<User>;
  updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: number): Promise<boolean>;
  updateUserToken(id: number, token: string | null): Promise<void>;
  updateUserLastLogin(id: number): Promise<void>;
  seedAdminIfNeeded(): Promise<void>;

  // Audit Log
  createAuditLog(data: InsertAuditLog): Promise<void>;
  getAuditLogs(filter?: { limit?: number; userId?: number; action?: string; entityType?: string; since?: string; excludeAutoSync?: boolean }): Promise<AuditLog[]>;
  cleanupBillingSyncAuditLogs(): Promise<number>;
  getActivityStats(sinceDays?: number): Promise<any>;

  // Aggregated
  getDashboardStats(): Promise<DashboardStats>;
  getMapData(): Promise<MapData>;
  getMapInfra(): Promise<{ pops: any[]; odcs: any[]; odps: any[]; poles: any[]; cables: any[]; }>;
  getMapCustomersInBounds(bbox: { swLat: number; swLng: number; neLat: number; neLng: number; }, limit?: number): Promise<any[]>;

  // MikroTik Routers
  getMikrotikRouters(): Promise<MikrotikRouter[]>;
  getMikrotikRouter(id: number): Promise<MikrotikRouter | undefined>;
  createMikrotikRouter(data: InsertMikrotikRouter): Promise<MikrotikRouter>;
  updateMikrotikRouter(id: number, data: Partial<MikrotikRouter>): Promise<MikrotikRouter | undefined>;
  deleteMikrotikRouter(id: number): Promise<void>;

  // Roles (custom user-defined permission roles)
  seedDefaultRolesIfNeeded(): Promise<void>;
  getMitraNamesByUserIds(userIds: number[]): Promise<Map<number, string[]>>;
  getRoles(mitraId: number): Promise<Role[]>;
  getRoleById(id: number): Promise<Role | undefined>;
  getRoleByName(name: string, mitraId: number): Promise<Role | undefined>;
  createRole(data: InsertRole): Promise<Role>;
  updateRole(id: number, data: Partial<InsertRole>): Promise<Role | undefined>;
  deleteRole(id: number): Promise<boolean>;
  seedAdminRoleForMitra(mitraId: number): Promise<Role>;
  seedRolePresetsIfNeeded(): Promise<void>;
  getApplicablePresets(mitraId: number): Promise<RolePreset[]>;
  getManageablePresets(opts: { mitraId: number; isSystemAdmin: boolean }): Promise<RolePreset[]>;
  getRolePresetById(id: number): Promise<RolePreset | undefined>;
  createRolePreset(data: InsertRolePreset): Promise<RolePreset>;
  updateRolePreset(id: number, data: Partial<InsertRolePreset>): Promise<RolePreset | undefined>;
  deleteRolePreset(id: number): Promise<boolean>;
  setDefaultRolePreset(id: number): Promise<void>;
  getUserEffectivePermissions(userId: number): Promise<{ perms: Record<string, PermissionLevel>; canSeeAllData: boolean; roleName: string | null; isSystem: boolean }>;
  getUserEffectivePermissionsAtMitra(userId: number, mitraId: number): Promise<{ perms: Record<string, PermissionLevel>; canSeeAllData: boolean; roleName: string | null; isSystem: boolean }>;

  // Collections (v4.1.2)
  upsertCustomerFromBillingWhitelist(data: BillingCustomerRecord): Promise<{ action: 'created' | 'updated' | 'skipped'; customerId: number; transition: 'none' | 'became_suspended' | 'became_active_after_suspended' | 'payment_received'; before: Customer | null; after: Customer | null }>;
  getCollections(filter?: { stage?: string; assignedTo?: number; openOnly?: boolean; customerId?: number }): Promise<Collection[]>;
  getCollection(id: number): Promise<Collection | undefined>;
  getOpenCollectionByCustomer(customerId: number): Promise<Collection | undefined>;
  createCollection(data: InsertCollection): Promise<Collection>;
  updateCollection(id: number, data: Partial<InsertCollection>): Promise<Collection>;
  moveCollectionStage(id: number, stage: string, userId: number | null, extra?: Partial<InsertCollection>): Promise<Collection>;
  deleteCollection(id: number): Promise<void>;
  getCollectionActivities(collectionId: number): Promise<CollectionActivity[]>;
  createCollectionActivity(data: InsertCollectionActivity): Promise<CollectionActivity>;
  getCollectionStats(): Promise<{ total: number; byStage: Record<string, number>; totalOverdue: number; avgAgeDays: number }>;

  // Phase B multi-tenant - mitras + user_mitras membership
  listMitras(includeInactive?: boolean): Promise<Mitra[]>;
  getMitra(id: number): Promise<Mitra | undefined>;
  getMitraBySlug(slug: string): Promise<Mitra | undefined>;
  getUserMitras(userId: number): Promise<Array<Mitra & { isPrimary: boolean }>>;
  isUserMemberOfMitra(userId: number, mitraId: number): Promise<boolean>;
  getUserMitraMembership(userId: number, mitraId: number): Promise<UserMitra | null>;
  updateMitraMemberRole(mitraId: number, userId: number, roleId: number): Promise<UserMitra | null>;
  countSystemAdminsAtMitra1(): Promise<number>;
  setActiveMitra(userId: number, mitraId: number): Promise<Mitra | null>;
  getActiveMitraForUser(userId: number): Promise<Mitra | undefined>;
  addUserToMitra(userId: number, mitraId: number, isPrimary?: boolean, roleId?: number | null): Promise<void>;
  removeUserFromMitra(userId: number, mitraId: number): Promise<boolean>;
  // Phase F: per-tenant integration settings
  getMitraSetting(key: string, opts?: { fallbackToGlobal?: boolean }): Promise<string | null>;
  setMitraSetting(key: string, value: string | null, opts?: { isSecret?: boolean }): Promise<void>;
  listMitraSettings(opts?: { unmask?: boolean }): Promise<Array<{ key: string; value: string | null; isSecret: boolean; updatedAt: string | null }>>;
  seedMitraIntegrationDefaults(mitraId: number): Promise<{ inserted: number; skipped: number }>;
  backfillMitraIntegrationDefaults(): Promise<{ scanned: number; seeded: number }>;
  deleteMitraSetting(key: string): Promise<boolean>;
  // Slug cache helper untuk filesystem upload
  getMitraSlug(mitraId: number): Promise<string>;
  invalidateMitraSlugCache(mitraId?: number): void;
  // Asset photo gallery generik (odp/odc/pole, filesystem-backed)
  getAssetPhotos(assetType: string, assetId: number): Promise<AssetPhoto[]>;
  getAssetPhoto(photoId: number): Promise<AssetPhoto | undefined>;
  addAssetPhoto(input: { assetType: string; assetId: number; photoData: string; caption?: string | null; isCover?: boolean; userId: number }): Promise<AssetPhoto>;
  setAssetCoverPhoto(assetType: string, assetId: number, photoId: number): Promise<void>;
  deleteAssetPhoto(photoId: number): Promise<boolean>;
  deleteAssetPhotosForAsset(assetType: string, assetId: number): Promise<void>;
  // ODP photo gallery (delegator kompat - endpoint /api/odps/:id/photos)
  getOdpPhotosForOdp(odpId: number): Promise<OdpPhoto[]>;
  getOdpPhoto(photoId: number): Promise<OdpPhoto | undefined>;
  addOdpPhoto(input: { odpId: number; photoData: string; caption?: string | null; isCover?: boolean; userId: number }): Promise<OdpPhoto>;
  setOdpCoverPhoto(odpId: number, photoId: number): Promise<void>;
  deleteOdpPhoto(photoId: number): Promise<boolean>;
}

// ==================== DATABASE STORAGE ====================

export class DatabaseStorage implements IStorage {
  private db: ReturnType<typeof drizzle>;
  private pool: MySQLPool;
  /**
   * Legacy compatibility shim - TIDAK functional di MySQL.
   * Semua `this.sqlite.prepare/exec/transaction` calls akan throw saat dipanggil.
   * Refactor lengkap di Phase 1B.
   */
  private sqlite: SqliteCompatShim;

  constructor() {
    // Read MySQL connection from env (.env loaded by drizzle.config + server/index.ts).
    // DB_SOCKET (Unix socket) preferred when set - workaround untuk mysql2 v3.22 TCP handshake
    // hang issue di cPanel MySQL 8.0.42-cll-lve. Lihat CLAUDE.md gotcha #16.
    const socketPath = process.env.DB_SOCKET;
    this.pool = mysql.createPool({
      ...(socketPath
        ? { socketPath }
        : { host: process.env.DB_HOST ?? "127.0.0.1", port: Number(process.env.DB_PORT ?? 3306) }),
      user: process.env.DB_USER ?? "",
      password: process.env.DB_PASSWORD ?? "",
      database: process.env.DB_NAME ?? "jabnet_fiber",
      connectionLimit: Number(process.env.DB_POOL_LIMIT ?? 10),
      waitForConnections: true,
      enableKeepAlive: true,
      charset: "utf8mb4",
      dateStrings: true,  // simpan timestamp sebagai ISO string (kompat dgn kode existing)
    });
    this.db = drizzle(this.pool);
    this.sqlite = {
      prepare: (_sql: string): never => {
        throw new Error("[storage] this.sqlite.prepare() tidak support di MySQL. Refactor ke Drizzle query / db.execute(sql`...`). Lihat Phase 1B handoff di CLAUDE.md.");
      },
      exec: (_sql: string): never => {
        throw new Error("[storage] this.sqlite.exec() tidak support di MySQL. Refactor ke Drizzle query / db.execute(sql`...`). Lihat Phase 1B handoff di CLAUDE.md.");
      },
      pragma: (_cmd: string) => { /* no-op */ },
      transaction: (_fn: any): never => {
        throw new Error("[storage] this.sqlite.transaction() tidak support di MySQL. Refactor pakai pool.getConnection() + beginTransaction(). Lihat Phase 1B handoff di CLAUDE.md.");
      },
    };
    // -- Phase 1A: bootstrap dihapus. Schema dibuat lewat `drizzle-kit push`, data seed lewat tools/migrate-sqlite-to-mysql.mjs.
    // -- Phase 1B (deferred): refactor ~89 raw sqlite calls + 114 .returning() calls. Lihat handoff di CLAUDE.md.
  }

  /**
   * Phase A multi-tenant migration. Idempotent:
   * - Renames `resellers` -> `mitras` if not yet renamed
   * - Adds new columns to `mitras` (slug, display_name, logo_url, features, primary_contact_*)
   * - Adds `mitra_id INT NOT NULL DEFAULT 1` + index to 61 tenant-owned tables
   * - Seeds JABNET mitra (id=1)
   *
   * Safe to run on every boot. Errors 1060 (duplicate column) and 1061 (duplicate key) are ignored.
   */
  private async runMitraMigrations(): Promise<void> {
    // Step 1: Rename resellers -> mitras (idempotent)
    try {
      const [rows] = await this.pool.execute(
        `SELECT
           SUM(CASE WHEN table_name = 'resellers' THEN 1 ELSE 0 END) AS has_resellers,
           SUM(CASE WHEN table_name = 'mitras' THEN 1 ELSE 0 END) AS has_mitras
         FROM information_schema.tables
         WHERE table_schema = DATABASE() AND table_name IN ('resellers', 'mitras')`
      );
      const r: any = (rows as any[])[0] ?? {};
      const hasResellers = Number(r.has_resellers ?? 0) > 0;
      const hasMitras = Number(r.has_mitras ?? 0) > 0;
      if (hasResellers && !hasMitras) {
        await this.pool.execute(`RENAME TABLE resellers TO mitras`);
        console.log("[mitra-migration] Renamed resellers -> mitras");
      } else if (!hasResellers && !hasMitras) {
        // Fresh DB - create mitras minimally; full schema via drizzle-kit on first run
        await this.pool.execute(`CREATE TABLE mitras (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name TEXT NOT NULL,
          phone TEXT NOT NULL,
          is_active INT DEFAULT 1,
          created_at TEXT NOT NULL
        )`);
        console.log("[mitra-migration] Created fresh mitras table");
      }
    } catch (err: any) {
      console.warn(`[mitra-migration] rename/create mitras: ${err.message}`);
    }

    // Step 2: Add new columns to mitras (idempotent - errno 1060)
    const mitraCols: Array<[string, string]> = [
      ["slug",                  "VARCHAR(50) NULL"],
      ["display_name",          "TEXT NULL"],
      ["logo_url",              "TEXT NULL"],
      ["features",              "TEXT NULL"],
      ["primary_contact_name",  "TEXT NULL"],
      ["primary_contact_phone", "TEXT NULL"],
    ];
    for (const [name, def] of mitraCols) {
      try {
        await this.pool.execute(`ALTER TABLE mitras ADD COLUMN ${name} ${def}`);
        console.log(`[mitra-migration] Added mitras.${name}`);
      } catch (err: any) {
        if (err.errno !== 1060) console.warn(`[mitra-migration] mitras.${name}: ${err.message}`);
      }
    }

    // Unique index on mitras.slug
    try {
      await this.pool.execute(`CREATE UNIQUE INDEX idx_mitras_slug ON mitras(slug)`);
      console.log("[mitra-migration] Created idx_mitras_slug (UNIQUE)");
    } catch (err: any) {
      if (err.errno !== 1061) console.warn(`[mitra-migration] idx_mitras_slug: ${err.message}`);
    }

    // Step 3: Add mitra_id + index to 61 tenant-owned tables
    const tenantTables = [
      "pops", "odcs", "odps", "customers", "poles", "cables", "otbs", "bestrays",
      "splitters", "cable_cores", "core_connections", "odp_scrape_cache",
      "prospects", "canvassing_sessions", "canvassing_logs", "leads", "ad_campaigns",
      "lead_activities", "collections", "collection_activities",
      "customer_otps", "customer_portal_sessions", "traffic_snapshots", "customer_loyalty",
      "point_transactions", "point_redemptions", "customer_discounts", "customer_referrals",
      "mpwa_templates", "wa_devices", "wa_inbox", "phonebooks", "phonebook_contacts",
      "broadcast_campaigns", "broadcast_recipients", "broadcast_segments",
      "audit_logs", "mikrotik_routers", "api_keys", "api_key_usage_logs",
      "notifications", "announcements", "bug_reports", "bug_comments",
      "ticket_categories", "tickets", "ticket_activities", "ticket_team", "ticket_evidence",
      "ticket_gps_logs", "ticket_csat", "ticket_sla_escalations", "ticket_comments",
      "ticket_pauses", "ticket_stage_edit_log", "network_alarms", "ticket_stage_transitions",
      "ticket_checkpoints", "chatwoot_config", "chatwoot_keyword_rules", "chatwoot_ticket_links",
      "roles",  // v4.3.x: roles tenant-scoped per mitra (isolasi role/permission antar mitra)
    ];

    let added = 0;
    for (const t of tenantTables) {
      try {
        await this.pool.execute(`ALTER TABLE ${t} ADD COLUMN mitra_id INT NOT NULL DEFAULT 1`);
        added++;
        console.log(`[mitra-migration] Added ${t}.mitra_id`);
      } catch (err: any) {
        if (err.errno !== 1060 && err.errno !== 1146) {
          console.warn(`[mitra-migration] ${t}.mitra_id: ${err.message}`);
        }
      }
      try {
        await this.pool.execute(`CREATE INDEX idx_${t}_mitra ON ${t}(mitra_id)`);
        console.log(`[mitra-migration] Created idx_${t}_mitra`);
      } catch (err: any) {
        if (err.errno !== 1061 && err.errno !== 1146) {
          console.warn(`[mitra-migration] idx_${t}_mitra: ${err.message}`);
        }
      }
    }
    if (added > 0) console.log(`[mitra-migration] Added mitra_id to ${added} tables`);

    // Step 4: Seed JABNET mitra (id=1, idempotent)
    try {
      const features = JSON.stringify({
        broadcast: true, collections: true, loyalty: true, public_api: true,
        canvassing: true, prospects: true, marketing_ads: true, genieacs: true,
        chatwoot: true, mikrotik: true, sahabat: true, bug_reports: true, announcements: true,
      });
      await this.pool.execute(
        `INSERT INTO mitras (id, slug, display_name, name, phone, is_active, features, created_at)
         VALUES (1, 'jabnet', 'JABNET Garut', 'JABNET Garut', '-', 1, ?, NOW())
         ON DUPLICATE KEY UPDATE
           slug = COALESCE(slug, 'jabnet'),
           display_name = COALESCE(display_name, 'JABNET Garut'),
           features = COALESCE(features, VALUES(features))`,
        [features]
      );
      console.log("[mitra-migration] Seed JABNET mitra (id=1) ensured");
    } catch (err: any) {
      console.warn(`[mitra-migration] seed JABNET: ${err.message}`);
    }

    // -------- Phase B additions --------

    // Step 5: Add users.active_mitra_id column (idempotent)
    try {
      await this.pool.execute(`ALTER TABLE users ADD COLUMN active_mitra_id INT DEFAULT 1`);
      console.log("[mitra-migration] Added users.active_mitra_id");
    } catch (err: any) {
      if (err.errno !== 1060) console.warn(`[mitra-migration] users.active_mitra_id: ${err.message}`);
    }

    // Step 6: Create user_mitras join table (idempotent)
    try {
      await this.pool.execute(`CREATE TABLE IF NOT EXISTS user_mitras (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        mitra_id INT NOT NULL,
        is_primary INT DEFAULT 0,
        created_at TEXT NOT NULL,
        UNIQUE KEY unq_user_mitra (user_id, mitra_id),
        INDEX idx_user_mitras_user (user_id),
        INDEX idx_user_mitras_mitra (mitra_id)
      )`);
      console.log("[mitra-migration] Created user_mitras table");
    } catch (err: any) {
      console.warn(`[mitra-migration] user_mitras: ${err.message}`);
    }

    // Step 7: Backfill - HANYA user yatim (tanpa membership mitra apapun) di-assign ke mitra 1 (JABNET).
    // PENTING: cek "tidak punya membership SAMA SEKALI", BUKAN "tidak punya membership mitra 1".
    // Kalau cek mitra 1 saja, admin mitra lain (yang cuma punya membership mitra-nya sendiri) akan
    // dapat membership JABNET tiap restart → bisa switch ke JABNET lewat header (kebocoran tenant).
    try {
      const [result]: any = await this.pool.execute(`
        INSERT IGNORE INTO user_mitras (user_id, mitra_id, is_primary, created_at)
        SELECT u.id, 1, 1, NOW()
        FROM users u
        WHERE NOT EXISTS (SELECT 1 FROM user_mitras um WHERE um.user_id = u.id)
      `);
      const affected = Number(result?.affectedRows ?? 0);
      if (affected > 0) console.log(`[mitra-migration] Backfilled ${affected} orphan users into mitra 1`);
    } catch (err: any) {
      console.warn(`[mitra-migration] backfill user_mitras: ${err.message}`);
    }

    // Step 8 (Phase F): mitra_integrations table - per-tenant override of app_settings keys
    try {
      await this.pool.execute(`CREATE TABLE IF NOT EXISTS mitra_integrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        mitra_id INT NOT NULL,
        \`key\` VARCHAR(100) NOT NULL,
        value TEXT,
        is_secret INT DEFAULT 0,
        updated_at TEXT,
        UNIQUE KEY unq_mitra_key (mitra_id, \`key\`),
        INDEX idx_mitra_integrations_mitra (mitra_id)
      )`);
      console.log("[mitra-migration] Created mitra_integrations table");
    } catch (err: any) {
      console.warn(`[mitra-migration] mitra_integrations: ${err.message}`);
    }
  }

  /**
   * Idempotent index creation. Reads information_schema first to avoid
   * "Duplicate key name" errors on re-deploy. Safe to run on every boot.
   */
  private async runIndexMigrations(): Promise<void> {
    const indexes: Array<{ table: string; name: string; cols: string; unique?: boolean }> = [
      { table: "users",       name: "idx_users_token",          cols: "token(64)" },
      { table: "customers",   name: "idx_customers_odp_id",     cols: "odp_id" },
      { table: "customers",   name: "idx_customers_status",     cols: "status" },
      { table: "customers",   name: "idx_customers_lat_lng",    cols: "lat, lng" },
      { table: "audit_logs",  name: "idx_audit_logs_created",   cols: "created_at(20)" },
      { table: "audit_logs",  name: "idx_audit_logs_user",      cols: "user_id" },
      { table: "cable_cores", name: "idx_cable_cores_cable",    cols: "cable_id" },
      { table: "leads",       name: "idx_leads_lat_lng",        cols: "lat, lng" },
      { table: "collections", name: "idx_collections_status",   cols: "status" },
      { table: "tickets",     name: "idx_tickets_status",       cols: "status" },
      // Ticket hot-path indexes (v4.3.x perf): list/filter/stats + SLA escalation dedup.
      { table: "tickets",          name: "idx_tickets_mitra_status",   cols: "mitra_id, status" },
      { table: "tickets",          name: "idx_tickets_mitra_created",  cols: "mitra_id, created_at(20)" },
      { table: "tickets",          name: "idx_tickets_mitra_resolved", cols: "mitra_id, resolved_at(20)" },
      { table: "tickets",          name: "idx_tickets_odp",            cols: "odp_id" },
      { table: "tickets",          name: "idx_tickets_category",       cols: "category_id" },
      { table: "tickets",          name: "idx_tickets_assigned",       cols: "assigned_to" },
      { table: "tickets",          name: "idx_tickets_customer",       cols: "customer_id" },
      // Atomic ticket numbering: unique (mitra, number) → concurrent create races jadi error 1062 → retry.
      { table: "tickets",          name: "uniq_tickets_mitra_number",  cols: "mitra_id, ticket_number(40)", unique: true },
      { table: "ticket_activities",      name: "idx_ticket_activities_ticket", cols: "ticket_id" },
      { table: "ticket_team",            name: "idx_ticket_team_ticket",       cols: "ticket_id" },
      { table: "ticket_team",            name: "idx_ticket_team_user",         cols: "user_id" },
      { table: "ticket_evidence",        name: "idx_ticket_evidence_ticket",   cols: "ticket_id" },
      { table: "ticket_comments",        name: "idx_ticket_comments_ticket",   cols: "ticket_id" },
      { table: "ticket_checkpoints",     name: "idx_ticket_checkpoints_ticket", cols: "ticket_id" },
      { table: "ticket_csat",            name: "idx_ticket_csat_due",          cols: "status, scheduled_at(20)" },
      { table: "ticket_csat",            name: "idx_ticket_csat_resolved_by",  cols: "resolved_by_user_id" },
      { table: "ticket_sla_escalations", name: "idx_ticket_sla_esc_dedup",     cols: "ticket_id, level(20)" },
      { table: "pipeline_cards", name: "idx_pipeline_cards_master", cols: "mitra_id, master_card_id" },
      { table: "pipeline_card_values", name: "idx_pcv_mitra_field", cols: "mitra_id, field_id" },
    ];
    for (const ix of indexes) {
      try {
        const [rows] = await this.pool.execute(
          `SELECT COUNT(*) AS c FROM information_schema.statistics
           WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
          [ix.table, ix.name]
        );
        const exists = ((rows as any[])[0]?.c ?? 0) > 0;
        if (!exists) {
          await this.pool.execute(`CREATE ${ix.unique ? "UNIQUE " : ""}INDEX ${ix.name} ON ${ix.table}(${ix.cols})`);
          console.log(`[index-migration] Created ${ix.name} on ${ix.table}`);
        }
      } catch (err: any) {
        // Table might not exist yet (fresh DB) - log and continue
        console.warn(`[index-migration] Skipped ${ix.name}: ${err.message}`);
      }
    }
  }

  /**
   * Photo storage migration (idempotent):
   * 1. Tambah kolom photo_path ke canvassing_logs, bug_reports, lead_activities (legacy photo_data
   *    tetap dipertahankan sampai backfill manual + DROP COLUMN manual).
   * 2. Buat tabel odp_photos kalau belum ada.
   * 3. Provision upload dir untuk semua mitra aktif (ensureMitraDirs).
   */
  private async runPhotoStorageMigrations(): Promise<void> {
    const photoCols: Array<[string, string]> = [
      ["canvassing_logs", "photo_path"],
      ["bug_reports", "photo_path"],
      ["lead_activities", "photo_path"],
    ];
    for (const [table, col] of photoCols) {
      try {
        await this.pool.execute(`ALTER TABLE ${table} ADD COLUMN ${col} VARCHAR(255) NULL`);
        console.log(`[photo-migration] Added ${table}.${col}`);
      } catch (err: any) {
        if (err.errno !== 1060 && err.errno !== 1146) {
          console.warn(`[photo-migration] ${table}.${col}: ${err.message}`);
        }
      }
    }

    try {
      await this.pool.execute(`CREATE TABLE IF NOT EXISTS odp_photos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        mitra_id INT NOT NULL DEFAULT 1,
        odp_id INT NOT NULL,
        photo_path VARCHAR(255) NOT NULL,
        caption TEXT NULL,
        uploaded_by INT NOT NULL,
        is_cover INT NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        INDEX idx_odp_photos_mitra_odp (mitra_id, odp_id),
        INDEX idx_odp_photos_odp (odp_id)
      )`);
      console.log("[photo-migration] odp_photos table ensured");
    } catch (err: any) {
      console.warn(`[photo-migration] odp_photos: ${err.message}`);
    }

    // Galeri foto generik (odp/odc/pole). Sumber data tunggal - odp_photos di-migrasi ke sini.
    try {
      await this.pool.execute(`CREATE TABLE IF NOT EXISTS asset_photos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        mitra_id INT NOT NULL DEFAULT 1,
        asset_type VARCHAR(16) NOT NULL,
        asset_id INT NOT NULL,
        photo_path VARCHAR(255) NOT NULL,
        caption TEXT NULL,
        uploaded_by INT NOT NULL,
        is_cover INT NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        INDEX idx_asset_photos_mitra_type_asset (mitra_id, asset_type, asset_id)
      )`);
      // Backfill idempotent: salin odp_photos → asset_photos (asset_type='odp') untuk baris
      // yang belum tersalin. odp_photos TIDAK di-drop (disimpan sampai diverifikasi).
      const [bf]: any = await this.pool.execute(`
        INSERT INTO asset_photos (mitra_id, asset_type, asset_id, photo_path, caption, uploaded_by, is_cover, created_at)
        SELECT op.mitra_id, 'odp', op.odp_id, op.photo_path, op.caption, op.uploaded_by, op.is_cover, op.created_at
        FROM odp_photos op
        WHERE NOT EXISTS (
          SELECT 1 FROM asset_photos ap
          WHERE ap.asset_type = 'odp' AND ap.asset_id = op.odp_id AND ap.photo_path = op.photo_path
        )
      `);
      const migrated = Number(bf?.affectedRows ?? 0);
      console.log(`[photo-migration] asset_photos table ensured${migrated > 0 ? ` (+${migrated} foto ODP dimigrasi)` : ""}`);
    } catch (err: any) {
      console.warn(`[photo-migration] asset_photos: ${err.message}`);
    }

    // Chatwoot agent mapping (Batch 2c) - per-mitra user↔agent link.
    try {
      await this.pool.execute(`CREATE TABLE IF NOT EXISTS chatwoot_agent_links (
        id INT AUTO_INCREMENT PRIMARY KEY,
        mitra_id INT NOT NULL DEFAULT 1,
        user_id INT NOT NULL,
        chatwoot_agent_id VARCHAR(64) NOT NULL,
        agent_name TEXT NULL,
        agent_email TEXT NULL,
        created_at TEXT NULL,
        updated_at TEXT NULL,
        UNIQUE KEY uniq_chatwoot_agent_link (mitra_id, user_id)
      )`);
      console.log("[chatwoot-migration] chatwoot_agent_links table ensured");
    } catch (err: any) {
      console.warn(`[chatwoot-migration] chatwoot_agent_links: ${err.message}`);
    }

    // LP1: Lead event bus - card link tracking.
    try {
      await this.pool.execute(`CREATE TABLE IF NOT EXISTS lead_card_links (
        id INT AUTO_INCREMENT PRIMARY KEY,
        mitra_id INT NOT NULL DEFAULT 1,
        lead_id INT NOT NULL,
        card_id INT NOT NULL,
        rule_id INT NULL,
        created_at TEXT NOT NULL,
        KEY idx_lead_card_links_mitra_lead (mitra_id, lead_id),
        KEY idx_lead_card_links_card (card_id)
      )`);
      console.log("[leads-migration] lead_card_links table ensured");
    } catch (err: any) {
      console.warn(`[leads-migration] lead_card_links: ${err.message}`);
    }

    // Provision upload dirs per existing active mitra (idempotent - fs.mkdir recursive).
    try {
      const [rows]: any = await this.pool.execute(
        `SELECT slug FROM mitras WHERE is_active = 1 AND slug IS NOT NULL AND slug != ''`,
      );
      for (const r of rows as any[]) {
        try {
          await ensureMitraDirs(String(r.slug));
        } catch (e: any) {
          console.warn(`[photo-migration] ensureMitraDirs(${r.slug}): ${e.message}`);
        }
      }
      console.log(`[photo-migration] ensured upload dirs for ${(rows as any[]).length} active mitras`);
    } catch (err: any) {
      console.warn(`[photo-migration] enumerate mitras: ${err.message}`);
    }
  }

  /**
   * Loyalty edit/delete columns (v4.4.0) - idempotent.
   * Adds:
   *   - deleted_at (TEXT NULL) on customer_referrals, customer_discounts, point_redemptions for soft delete.
   *   - is_frozen / frozen_reason / frozen_at / frozen_by on customer_loyalty for admin freeze of reward issuance.
   * Also fixes earlier deploys that created deleted_at/frozen_at as TIMESTAMP - converts to TEXT so
   * ISO-8601 strings (new Date().toISOString()) round-trip cleanly, matching the rest of the codebase
   * (createdAt, editedAt, ticket_comments.deleted_at all stored as TEXT).
   */
  private async runLoyaltyEditMigrations(): Promise<void> {
    const loyaltyColumnAdditions: Array<{ table: string; column: string; ddl: string }> = [
      { table: "customer_referrals", column: "deleted_at", ddl: "TEXT NULL DEFAULT NULL" },
      { table: "customer_discounts", column: "deleted_at", ddl: "TEXT NULL DEFAULT NULL" },
      { table: "point_redemptions",  column: "deleted_at", ddl: "TEXT NULL DEFAULT NULL" },
      { table: "customer_loyalty",   column: "is_frozen",  ddl: "TINYINT NOT NULL DEFAULT 0" },
      { table: "customer_loyalty",   column: "frozen_reason", ddl: "VARCHAR(255) NULL" },
      { table: "customer_loyalty",   column: "frozen_at",  ddl: "TEXT NULL DEFAULT NULL" },
      { table: "customer_loyalty",   column: "frozen_by",  ddl: "INT NULL" },
      { table: "pipeline_cards", column: "master_card_id", ddl: "INT NULL" },
      { table: "pipeline_cards", column: "origin_card_id", ddl: "INT NULL" },
      { table: "pipeline_cards", column: "relation_type",  ddl: "VARCHAR(16) NULL" },
      { table: "pipeline_rules", column: "recurrence", ddl: "VARCHAR(16) NOT NULL DEFAULT 'once'" },
      { table: "pipeline_cards", column: "collection_cycle", ddl: "INT" },
      { table: "pipeline_metrics", column: "time_field",  ddl: "VARCHAR(24) NULL" },
      { table: "pipeline_metrics", column: "time_preset", ddl: "VARCHAR(16) NULL" },
      { table: "pipeline_metrics", column: "time_from",   ddl: "TEXT NULL" },
      { table: "pipeline_metrics", column: "time_to",     ddl: "TEXT NULL" },
      { table: "pipeline_metrics", column: "terms",       ddl: "TEXT NULL" },
      { table: "pipeline_metrics", column: "formula",     ddl: "VARCHAR(255) NULL" },
      { table: "customers",        column: "chatwoot_contact_id", ddl: "VARCHAR(64) NULL" },
      { table: "customers",        column: "chatwoot_synced_at",  ddl: "VARCHAR(40) NULL" },
      { table: "chatwoot_config",  column: "auto_sync_contacts",  ddl: "TINYINT NOT NULL DEFAULT 0" },
      { table: "leads", column: "campaign", ddl: "TEXT NULL" },
      { table: "leads", column: "ad_set",   ddl: "TEXT NULL" },
      { table: "leads", column: "ad_name",  ddl: "TEXT NULL" },
      { table: "pipeline_card_comments",    column: "type",       ddl: "VARCHAR(16) NOT NULL DEFAULT 'note'" },
      { table: "pipeline_card_attachments", column: "comment_id", ddl: "INT NULL" },
    ];
    for (const { table, column, ddl } of loyaltyColumnAdditions) {
      try {
        const [existsRows]: any = await this.pool.execute(
          `SELECT COUNT(*) AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
          [table, column],
        );
        const exists = Number((existsRows as any[])[0]?.c ?? 0) > 0;
        if (!exists) {
          await this.pool.execute(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${ddl}`);
          console.log(`[migration] Added ${table}.${column}`);
        }
      } catch (err: any) {
        if (err.errno !== 1146) {
          console.warn(`[migration] ${table}.${column}: ${err.message}`);
        }
      }
    }

    // Backfill card lineage: every existing card is its own master (idempotent via the WHERE guard).
    try {
      await this.pool.execute(
        `UPDATE pipeline_cards SET master_card_id = id WHERE master_card_id IS NULL`,
      );
    } catch (err: any) {
      if (err.errno !== 1146) console.warn(`[migration] pipeline_cards master backfill: ${err.message}`);
    }

    // Fixup pass: convert pre-existing TIMESTAMP columns to TEXT so ISO-8601 writes succeed.
    // (Earlier builds of this migration used TIMESTAMP NULL; MySQL strict mode rejects
    //  values like "2026-05-26T12:34:56.789Z" - only "YYYY-MM-DD HH:MM:SS" is accepted.)
    const timestampToTextFixups: Array<{ table: string; column: string }> = [
      { table: "customer_referrals", column: "deleted_at" },
      { table: "customer_discounts", column: "deleted_at" },
      { table: "point_redemptions",  column: "deleted_at" },
      { table: "customer_loyalty",   column: "frozen_at" },
    ];
    for (const { table, column } of timestampToTextFixups) {
      try {
        const [typeRows]: any = await this.pool.execute(
          `SELECT data_type FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
          [table, column],
        );
        const dataType = String((typeRows as any[])[0]?.data_type ?? "").toLowerCase();
        if (dataType === "timestamp") {
          await this.pool.execute(`ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` TEXT NULL DEFAULT NULL`);
          console.log(`[migration] Converted ${table}.${column} TIMESTAMP → TEXT`);
        }
      } catch (err: any) {
        if (err.errno !== 1146) {
          console.warn(`[migration] fixup ${table}.${column}: ${err.message}`);
        }
      }
    }

    // Widen action_type so longer action names (set_field_linked = 16 chars, etc.) fit. Idempotent.
    for (const table of ["pipeline_rules", "pipeline_rule_actions"]) {
      try {
        const [rows]: any = await this.pool.execute(
          `SELECT CHARACTER_MAXIMUM_LENGTH AS len FROM information_schema.columns
           WHERE table_schema = DATABASE() AND table_name = ? AND column_name = 'action_type'`,
          [table],
        );
        const len = Number((rows as any[])[0]?.len ?? 0);
        if (len > 0 && len < 32) {
          const def = table === "pipeline_rules" ? "VARCHAR(32) NOT NULL DEFAULT 'create_card'" : "VARCHAR(32) NOT NULL";
          await this.pool.execute(`ALTER TABLE \`${table}\` MODIFY action_type ${def}`);
          console.log(`[migration] widened ${table}.action_type to VARCHAR(32)`);
        }
      } catch (err: any) {
        if (err.errno !== 1146) console.warn(`[migration] ${table}.action_type widen: ${err.message}`);
      }
    }
  }

  // ---- POP ----
  async getPops(): Promise<Pop[]> {
    const mitraId = getMitraId();
    return this.db.select().from(pops).where(eq(pops.mitraId, mitraId));
  }
  async getPop(id: number): Promise<Pop | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(pops).where(and(eq(pops.id, id), eq(pops.mitraId, mitraId)));
    return row;
  }
  async createPop(data: InsertPop): Promise<Pop> {
    const mitraId = getMitraId();
    const result = await this.db.insert(pops).values({ ...data, mitraId });
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(pops).where(eq(pops.id, insertId));
    return row!;
  }
  async updatePop(id: number, data: Partial<InsertPop>): Promise<Pop | undefined> {
    const mitraId = getMitraId();
    await this.db.update(pops).set(data).where(and(eq(pops.id, id), eq(pops.mitraId, mitraId)));
    const [row] = await this.db.select().from(pops).where(and(eq(pops.id, id), eq(pops.mitraId, mitraId)));
    return row;
  }
  async deletePop(id: number): Promise<boolean> {
    const mitraId = getMitraId();
    const [result] = await this.db.delete(pops).where(and(eq(pops.id, id), eq(pops.mitraId, mitraId)));
    return (result as any).affectedRows > 0;
  }

  // ---- ODC ----
  async getOdcs(): Promise<Odc[]> {
    const mitraId = getMitraId();
    return this.db.select().from(odcs).where(eq(odcs.mitraId, mitraId));
  }
  async getOdc(id: number): Promise<Odc | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(odcs).where(and(eq(odcs.id, id), eq(odcs.mitraId, mitraId)));
    return row;
  }
  async createOdc(data: InsertOdc): Promise<Odc> {
    const mitraId = getMitraId();
    const result = await this.db.insert(odcs).values({ ...data, mitraId });
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(odcs).where(eq(odcs.id, insertId));
    return row!;
  }
  async updateOdc(id: number, data: Partial<InsertOdc>): Promise<Odc | undefined> {
    const mitraId = getMitraId();
    await this.db.update(odcs).set(data).where(and(eq(odcs.id, id), eq(odcs.mitraId, mitraId)));
    const [row] = await this.db.select().from(odcs).where(and(eq(odcs.id, id), eq(odcs.mitraId, mitraId)));
    return row;
  }
  async deleteOdc(id: number): Promise<boolean> {
    const mitraId = getMitraId();
    const [result] = await this.db.delete(odcs).where(and(eq(odcs.id, id), eq(odcs.mitraId, mitraId)));
    return (result as any).affectedRows > 0;
  }

  // ---- ODP ----
  async getOdps(): Promise<Odp[]> {
    // Compute usedCapacity real-time from customers table (both scoped to active mitra)
    const mitraId = getMitraId();
    const allOdps = await this.db.select().from(odps).where(eq(odps.mitraId, mitraId));
    const counts = await this.db
      .select({ odpId: customers.odpId, count: sql<number>`COUNT(${customers.id})` })
      .from(customers)
      .where(and(sql`${customers.odpId} IS NOT NULL`, eq(customers.mitraId, mitraId)))
      .groupBy(customers.odpId);
    const countMap = new Map<number, number>();
    for (const row of counts) {
      if (row.odpId !== null) countMap.set(row.odpId, row.count);
    }
    return allOdps.map((odp) => {
      const used = countMap.get(odp.id) ?? 0;
      return {
        ...odp,
        usedCapacity: used,
        portTersisa: (odp.capacity ?? 0) - used,
      };
    });
  }
  async getOdp(id: number): Promise<Odp | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(odps).where(and(eq(odps.id, id), eq(odps.mitraId, mitraId)));
    if (!row) return undefined;
    const [countRow] = await this.db
      .select({ count: sql<number>`COUNT(${customers.id})` })
      .from(customers)
      .where(and(eq(customers.odpId, id), eq(customers.mitraId, mitraId)));
    const used = countRow?.count ?? 0;
    return {
      ...row,
      usedCapacity: used,
      portTersisa: (row.capacity ?? 0) - used
    };
  }
  async getOdpsByIds(odpIds: number[]): Promise<Map<number, Odp>> {
    const map = new Map<number, Odp>();
    if (odpIds.length === 0) return map;
    const mitraId = getMitraId();
    const rows = await this.db.select().from(odps).where(and(inArray(odps.id, odpIds), eq(odps.mitraId, mitraId)));
    for (const r of rows) map.set(r.id, r);
    return map;
  }
  async createOdp(data: InsertOdp): Promise<Odp> {
    const mitraId = getMitraId();
    const result = await this.db.insert(odps).values({ ...data, mitraId });
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(odps).where(eq(odps.id, insertId));
    return row!;
  }
  async updateOdp(id: number, data: Partial<InsertOdp>): Promise<Odp | undefined> {
    const mitraId = getMitraId();
    await this.db.update(odps).set(data).where(and(eq(odps.id, id), eq(odps.mitraId, mitraId)));
    const [row] = await this.db.select().from(odps).where(and(eq(odps.id, id), eq(odps.mitraId, mitraId)));
    return row;
  }
  async deleteOdp(id: number): Promise<boolean> {
    const mitraId = getMitraId();
    // Bersihkan foto-foto ODP (file + row) dari galeri generik
    await this.deleteAssetPhotosForAsset("odp", id);
    const [result] = await this.db.delete(odps).where(and(eq(odps.id, id), eq(odps.mitraId, mitraId)));
    return (result as any).affectedRows > 0;
  }

  // ---- Asset Photos (galeri generik: odp/odc/pole) ----
  // Sumber data tunggal = asset_photos. Metode ODP lama di bawah = delegator (kompat route lama).

  /** type aset → tabel utk cek eksistensi + feature-dir uploads (whitelist). */
  private resolveAssetKind(assetType: string): { table: any; feature: string } {
    switch (assetType) {
      case "odp":  return { table: odps,  feature: "odps" };
      case "odc":  return { table: odcs,  feature: "odcs" };
      case "pole": return { table: poles, feature: "poles" };
      default: throw new Error(`Tipe aset tidak didukung: ${assetType}`);
    }
  }

  async getAssetPhotos(assetType: string, assetId: number): Promise<AssetPhoto[]> {
    this.resolveAssetKind(assetType); // validasi type
    const mitraId = getMitraId();
    return this.db.select().from(assetPhotos)
      .where(and(eq(assetPhotos.assetType, assetType), eq(assetPhotos.assetId, assetId), eq(assetPhotos.mitraId, mitraId)))
      .orderBy(desc(assetPhotos.isCover), desc(assetPhotos.createdAt));
  }

  async getAssetPhoto(photoId: number): Promise<AssetPhoto | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(assetPhotos)
      .where(and(eq(assetPhotos.id, photoId), eq(assetPhotos.mitraId, mitraId)));
    return row;
  }

  async addAssetPhoto(input: {
    assetType: string; assetId: number; photoData: string; caption?: string | null; isCover?: boolean; userId: number;
  }): Promise<AssetPhoto> {
    const { table, feature } = this.resolveAssetKind(input.assetType);
    const mitraId = getMitraId();
    // Pastikan aset exist + sama mitra
    const [asset] = await this.db.select({ id: table.id }).from(table)
      .where(and(eq(table.id, input.assetId), eq(table.mitraId, mitraId)));
    if (!asset) throw new Error(`Aset ${input.assetType} ${input.assetId} tidak ditemukan untuk mitra aktif`);
    const slug = await this.getMitraSlug(mitraId);
    const idHint = `${input.assetType}-${input.assetId}-${Date.now()}`;
    const photoPath = await saveBase64Photo(slug, feature, idHint, input.photoData);
    const now = new Date().toISOString();
    const wantCover = !!input.isCover;
    if (wantCover) {
      // Clear cover yang sudah ada (max 1 cover per aset)
      await this.db.update(assetPhotos)
        .set({ isCover: 0 })
        .where(and(eq(assetPhotos.assetType, input.assetType), eq(assetPhotos.assetId, input.assetId), eq(assetPhotos.mitraId, mitraId)));
    }
    const result = await this.db.insert(assetPhotos).values({
      mitraId,
      assetType: input.assetType,
      assetId: input.assetId,
      photoPath,
      caption: input.caption ?? null,
      uploadedBy: input.userId,
      isCover: wantCover ? 1 : 0,
      createdAt: now,
    });
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(assetPhotos).where(eq(assetPhotos.id, insertId));
    return row!;
  }

  async setAssetCoverPhoto(assetType: string, assetId: number, photoId: number): Promise<void> {
    this.resolveAssetKind(assetType);
    const mitraId = getMitraId();
    // Verify target photo exist + sama mitra + sama aset
    const [target] = await this.db.select({ id: assetPhotos.id }).from(assetPhotos)
      .where(and(eq(assetPhotos.id, photoId), eq(assetPhotos.assetType, assetType), eq(assetPhotos.assetId, assetId), eq(assetPhotos.mitraId, mitraId)));
    if (!target) throw new Error(`Foto ${photoId} bukan milik ${assetType} ${assetId}`);
    await this.db.update(assetPhotos)
      .set({ isCover: 0 })
      .where(and(eq(assetPhotos.assetType, assetType), eq(assetPhotos.assetId, assetId), eq(assetPhotos.mitraId, mitraId)));
    await this.db.update(assetPhotos)
      .set({ isCover: 1 })
      .where(and(eq(assetPhotos.id, photoId), eq(assetPhotos.mitraId, mitraId)));
  }

  async deleteAssetPhoto(photoId: number): Promise<boolean> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(assetPhotos)
      .where(and(eq(assetPhotos.id, photoId), eq(assetPhotos.mitraId, mitraId)));
    if (!row) return false;
    if (row.photoPath) await deletePhoto(row.photoPath);
    const [result] = await this.db.delete(assetPhotos)
      .where(and(eq(assetPhotos.id, photoId), eq(assetPhotos.mitraId, mitraId)));
    return (result as any).affectedRows > 0;
  }

  /** Hapus semua foto satu aset (file + row) - dipakai saat aset dihapus. */
  async deleteAssetPhotosForAsset(assetType: string, assetId: number): Promise<void> {
    const mitraId = getMitraId();
    const rows = await this.db.select({ photoPath: assetPhotos.photoPath }).from(assetPhotos)
      .where(and(eq(assetPhotos.assetType, assetType), eq(assetPhotos.assetId, assetId), eq(assetPhotos.mitraId, mitraId)));
    for (const r of rows) {
      if (r.photoPath) await deletePhoto(r.photoPath);
    }
    await this.db.delete(assetPhotos)
      .where(and(eq(assetPhotos.assetType, assetType), eq(assetPhotos.assetId, assetId), eq(assetPhotos.mitraId, mitraId)));
  }

  // ---- ODP Photos (delegator ke galeri generik - kompat endpoint /api/odps/:id/photos) ----
  private toOdpPhoto(p: AssetPhoto): OdpPhoto {
    return { id: p.id, mitraId: p.mitraId, odpId: p.assetId, photoPath: p.photoPath, caption: p.caption, uploadedBy: p.uploadedBy, isCover: p.isCover, createdAt: p.createdAt };
  }
  async getOdpPhotosForOdp(odpId: number): Promise<OdpPhoto[]> {
    return (await this.getAssetPhotos("odp", odpId)).map((p) => this.toOdpPhoto(p));
  }
  async getOdpPhoto(photoId: number): Promise<OdpPhoto | undefined> {
    const p = await this.getAssetPhoto(photoId);
    return p && p.assetType === "odp" ? this.toOdpPhoto(p) : undefined;
  }
  async addOdpPhoto(input: {
    odpId: number; photoData: string; caption?: string | null; isCover?: boolean; userId: number;
  }): Promise<OdpPhoto> {
    const p = await this.addAssetPhoto({ assetType: "odp", assetId: input.odpId, photoData: input.photoData, caption: input.caption, isCover: input.isCover, userId: input.userId });
    return this.toOdpPhoto(p);
  }
  async setOdpCoverPhoto(odpId: number, photoId: number): Promise<void> {
    return this.setAssetCoverPhoto("odp", odpId, photoId);
  }
  async deleteOdpPhoto(photoId: number): Promise<boolean> {
    return this.deleteAssetPhoto(photoId);
  }

  // ---- Customer ----
  async searchCustomersByName(q: string): Promise<Customer[]> {
    // Case-insensitive LIKE search on name/customerId/phone for ONT device matching
    const mitraId = getMitraId();
    const like = `%${q.toLowerCase()}%`;
    return this.db
      .select()
      .from(customers)
      .where(and(
        or(
          sql`lower(${customers.name}) LIKE ${like}`,
          sql`lower(${customers.customerId}) LIKE ${like}`,
          sql`lower(${customers.phone}) LIKE ${like}`,
        ),
        eq(customers.mitraId, mitraId)
      ))
      .limit(50);
  }
  async getCustomers(): Promise<Customer[]> {
    const mitraId = getMitraId();
    return this.db.select().from(customers).where(eq(customers.mitraId, mitraId));
  }
  async getCustomersByIds(ids: number[]): Promise<Map<number, Customer>> {
    const map = new Map<number, Customer>();
    if (ids.length === 0) return map;
    const mitraId = getMitraId();
    const rows = await this.db.select().from(customers).where(and(inArray(customers.id, ids), eq(customers.mitraId, mitraId)));
    for (const r of rows) map.set(r.id, r);
    return map;
  }
  async getCustomer(id: number): Promise<Customer | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(customers).where(and(eq(customers.id, id), eq(customers.mitraId, mitraId)));
    return row;
  }
  /** Simpan link customer↔Chatwoot contact setelah sync (tenant-scoped). */
  async updateCustomerChatwootLink(id: number, contactId: string, syncedAt: string): Promise<void> {
    const mitraId = getMitraId();
    await this.db.update(customers)
      .set({ chatwootContactId: contactId, chatwootSyncedAt: syncedAt })
      .where(and(eq(customers.id, id), eq(customers.mitraId, mitraId)));
  }

  /** Pelanggan yang terhubung ke satu ODP (tenant-scoped, pakai idx_customers_odp_id). */
  async getCustomersByOdp(odpId: number): Promise<Customer[]> {
    const mitraId = getMitraId();
    return this.db.select().from(customers)
      .where(and(eq(customers.mitraId, mitraId), eq(customers.odpId, odpId)))
      .orderBy(asc(customers.portNumber), asc(customers.name));
  }
  /** Cari pelanggan untuk map search (nama / customer_id), light projection, max `limit`. */
  async searchMapCustomers(q: string, limit = 15): Promise<Array<{ id: number; name: string; customerId: string; lat: number | null; lng: number | null; odpId: number | null; status: string | null; isIsolir: number | null }>> {
    const mitraId = getMitraId();
    const needle = `%${q}%`;
    return this.db.select({
      id: customers.id, name: customers.name, customerId: customers.customerId,
      lat: customers.lat, lng: customers.lng, odpId: customers.odpId,
      status: customers.status, isIsolir: customers.isIsolir,
    }).from(customers)
      .where(and(
        eq(customers.mitraId, mitraId),
        or(like(customers.name, needle), like(customers.customerId, needle)),
      ))
      .limit(limit);
  }
  async createCustomer(data: InsertCustomer): Promise<Customer> {
    const mitraId = getMitraId();
    const result = await this.db.insert(customers).values({ ...data, mitraId });
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(customers).where(eq(customers.id, insertId));
    return row!;
  }
  async updateCustomer(id: number, data: Partial<InsertCustomer>): Promise<Customer | undefined> {
    const mitraId = getMitraId();
    // Auto-detect manual overrides: any billing-synced field that user changes gets locked
    // SKIP kalau caller explicit provide manualOverrides (admin set manual lock list)
    const BILLING_SYNCED_FIELDS = [
      "name", "phone", "email", "address", "lat", "lng", "package",
      "district", "village", "customerType",
    ];
    const callerSetManualOverrides = (data as any).manualOverrides !== undefined;

    if (!callerSetManualOverrides) {
      const existing = await this.getCustomer(id);
      if (existing) {
        const existingOverrides: string[] = (() => {
          try { return JSON.parse((existing as any).manualOverrides ?? "[]"); }
          catch { return []; }
        })();
        const newOverrides = new Set(existingOverrides);
        for (const field of BILLING_SYNCED_FIELDS) {
          if ((data as any)[field] !== undefined) {
            const oldVal = (existing as any)[field];
            const newVal = (data as any)[field];
            // If user explicitly set a different value, lock it
            if (oldVal !== newVal && newVal !== "" && newVal !== null) {
              newOverrides.add(field);
            }
          }
        }
        (data as any).manualOverrides = JSON.stringify([...newOverrides]);
      }
    }
    await this.db.update(customers).set(data).where(and(eq(customers.id, id), eq(customers.mitraId, mitraId)));
    const [row] = await this.db.select().from(customers).where(and(eq(customers.id, id), eq(customers.mitraId, mitraId)));
    return row;
  }

  // Manually unlock a specific field (or all fields) from billing sync protection
  async clearCustomerOverrides(id: number, fields?: string[]): Promise<Customer | undefined> {
    const mitraId = getMitraId();
    const existing = await this.getCustomer(id);
    if (!existing) return undefined;
    let overrides: string[] = [];
    try { overrides = JSON.parse((existing as any).manualOverrides ?? "[]"); } catch { overrides = []; }
    if (fields && fields.length > 0) {
      overrides = overrides.filter(f => !fields.includes(f));
    } else {
      overrides = [];
    }
    await this.db.update(customers)
      .set({ manualOverrides: JSON.stringify(overrides) } as any)
      .where(and(eq(customers.id, id), eq(customers.mitraId, mitraId)));
    const [row] = await this.db.select().from(customers).where(and(eq(customers.id, id), eq(customers.mitraId, mitraId)));
    return row;
  }
  async deleteCustomer(id: number): Promise<boolean> {
    const mitraId = getMitraId();
    const [result] = await this.db.delete(customers).where(and(eq(customers.id, id), eq(customers.mitraId, mitraId)));
    return (result as any).affectedRows > 0;
  }

  async getCustomerByBillingId(customerId: string): Promise<Customer | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(customers).where(and(eq(customers.customerId, customerId), eq(customers.mitraId, mitraId)));
    return row;
  }

  async upsertCustomerFromBilling(data: BillingCustomerRecord): Promise<{ action: 'created' | 'updated' }> {
    const mitraId = getMitraId();
    // Map status
    let status: string;
    if (data.status_pelanggan === "aktif" && !data.is_isolir) {
      status = "active";
    } else if (data.is_isolir) {
      status = "suspended";
    } else {
      status = "inactive";
    }

    const billingFields: Record<string, any> = {
      name: data.nama_lengkap,
      phone: data.no_telepon,
      email: data.email,
      address: data.alamat_pemasangan,
      lat: data.lat ? parseFloat(data.lat) : null,
      lng: data.long ? parseFloat(data.long) : null,
      package: data.paket_layanan,
      status,
      pppoeUsername: data.username_pppoe,
      isIsolir: data.is_isolir ? 1 : 0,
      billingPrice: data.harga_layanan,
      installDate: data.tgl_instalasi,
      district: data.kecamatan,
      village: data.kelurahan,
      billingStatus: data.status_invoice,
      customerType: data.type_pelanggan,
      lastSyncAt: new Date().toISOString(),
    };

    const existing = await this.getCustomerByBillingId(data.customer_id);
    if (existing) {
      // Respect manual overrides: skip fields user has manually edited
      let overrides: string[] = [];
      try { overrides = JSON.parse((existing as any).manualOverrides ?? "[]"); } catch { overrides = []; }
      const protectedFields: Record<string, any> = { ...billingFields };
      for (const field of overrides) {
        delete protectedFields[field];
      }
      // Always update lastSyncAt and operational fields (status, billing info)
      // Note: status, isIsolir, billingPrice, billingStatus, installDate, pppoeUsername are NEVER protected
      // because these come from billing operations, not manual edits
      await this.db.update(customers).set(protectedFields).where(and(eq(customers.customerId, data.customer_id), eq(customers.mitraId, mitraId)));
      return { action: 'updated' };
    } else {
      await this.db.insert(customers).values({
        ...billingFields,
        customerId: data.customer_id,
        mitraId,
        odpId: null,
        portNumber: null,
      } as any);
      return { action: 'created' };
    }
  }

  /**
   * v4.1.2 - STRICT WHITELIST UPSERT untuk BillingSyncWorker.
   *
   * Berbeda dari upsertCustomerFromBilling yang respect manual_overrides,
   * method ini HANYA tulis 8 field kritis dan ignore semua field lain.
   * Field operasional (address, lat, lng, odp, package, phone, email, district, village)
   * TIDAK pernah di-overwrite - local app is source of truth.
   *
   * Return: diff dengan state transition untuk BillingSyncWorker:
   *   - became_suspended: active → isolir (trigger auto-open collection)
   *   - became_active_after_suspended: isolir → active (trigger auto-close collection)
   *   - payment_received: lastPaymentDate berubah tanpa status change
   *   - none: no relevant change
   */
  /**
   * v4.1.3+: Full sync dari billing JABNET - billing adalah source of truth.
   *
   * Field yang DI-SYNC (semua dari billing, overwrite setiap tick):
   *   name, phone, email, address, package, pppoeUsername, billingStatus,
   *   isIsolir, billingPrice, installDate, district, village, customerType,
   *   status (derived), dueDate, lastPaymentDate, isolirDate
   *
   * Field LOCAL ONLY (TIDAK pernah di-touch sync):
   *   lat, lng - koordinat peta (FTTH Tools yang manage)
   *   odpId, portNumber - ODP mapping (data jaringan, bukan billing)
   *   ontSerialNumber - SN device (tidak ada di billing)
   *   notes - catatan internal tim
   *   pppoePassword, pppoeRouterId, pppoeMikrotikId, pppoeProfile - data MikroTik (managed by MikroTik integration)
   *   leadId - traceability ke lead
   */
  async upsertCustomerFromBillingWhitelist(data: BillingCustomerRecord): Promise<{
    action: 'created' | 'updated' | 'skipped';
    customerId: number;
    transition: 'none' | 'became_suspended' | 'became_active_after_suspended' | 'payment_received';
    before: Customer | null;
    after: Customer | null;
  }> {
    const mitraId = getMitraId();
    // Guard: skip rows dengan data billing invalid (mencegah NOT NULL constraint crash)
    if (!data.customer_id || !data.nama_lengkap) {
      return { action: 'skipped', customerId: 0, transition: 'none', before: null, after: null };
    }

    const status: string = (data.status_pelanggan === "aktif" && !data.is_isolir) ? "active"
                         : data.is_isolir ? "suspended" : "inactive";

    // ============ FIELD CLASSIFICATION ============
    // CRITICAL billing fields - ALWAYS sync (billing API is source of truth):
    //   billingStatus, isIsolir, billingPrice, dueDate, lastPaymentDate, isolirDate, status
    // INFO fields - sync UNLESS local edit detected (preserve manual overrides):
    //   name, phone, email, address (pelanggan edit dari portal/CS update lokal)
    // ASSIGNMENT fields - billing source of truth tapi rare:
    //   package, pppoeUsername, district, village, customerType, installDate

    // Read manual_overrides JSON array (kalau ada) - list field name yang locked dari sync
    let lockedFields: string[] = [];
    const existing = await this.getCustomerByBillingId(data.customer_id);
    if (existing && (existing as any).manualOverrides) {
      try {
        const parsed = JSON.parse((existing as any).manualOverrides);
        if (Array.isArray(parsed)) lockedFields = parsed;
      } catch {}
    }

    const billingFields: Record<string, any> = {
      // CRITICAL - selalu sync, tidak respect lock (billing source of truth)
      billingStatus: data.status_invoice,
      status,
      isIsolir: data.is_isolir ? 1 : 0,
      billingPrice: data.harga_layanan,
      dueDate: data.due_date ?? null,
      lastPaymentDate: data.last_payment_date ?? null,
      isolirDate: data.isolir_date ?? null,
      lastSyncAt: new Date().toISOString(),
      billingSyncSource: "billing.jabnet.id",

      // INFO - respect lockedFields (admin/portal bisa override)
      name: lockedFields.includes("name") ? undefined : data.nama_lengkap,
      phone: lockedFields.includes("phone") ? undefined : (data.no_telepon ?? null),
      email: lockedFields.includes("email") ? undefined : (data.email ?? null),
      address: lockedFields.includes("address") ? undefined : (data.alamat_pemasangan ?? null),

      // ASSIGNMENT - billing source of truth tapi cek lockedFields juga
      package: lockedFields.includes("package") ? undefined : (data.paket_layanan ?? null),
      pppoeUsername: lockedFields.includes("pppoeUsername") ? undefined : (data.username_pppoe ?? null),
      installDate: lockedFields.includes("installDate") ? undefined : (data.tgl_instalasi ?? null),
      district: lockedFields.includes("district") ? undefined : (data.kecamatan ?? null),
      village: lockedFields.includes("village") ? undefined : (data.kelurahan ?? null),
      customerType: lockedFields.includes("customerType") ? undefined : (data.type_pelanggan ?? null),
    };

    // Strip undefined keys - biar Drizzle skip (tidak overwrite ke null)
    for (const k of Object.keys(billingFields)) {
      if (billingFields[k] === undefined) delete billingFields[k];
    }

    if (!existing) {
      // First-time insert: semua field billing dari data + local fields null (admin yang isi nanti)
      const insertResult = await this.db.insert(customers).values({
        ...billingFields,
        customerId: data.customer_id,
        mitraId,
        // Local fields NULL di insert awal
        lat: null, lng: null,
        odpId: null, portNumber: null,
        ontSerialNumber: null,
        notes: null,
      } as any);
      const newInsertId = Number((insertResult[0] as any).insertId);
      const [row] = await this.db.select().from(customers).where(eq(customers.id, newInsertId));
      const transition = row!.isIsolir === 1 ? 'became_suspended' : 'none';
      return { action: 'created', customerId: row!.id, transition, before: null, after: row! };
    }

    // Preserve local values jika billing return NULL/empty (jangan wipe data yang sudah ada)
    // Berguna untuk: billing API partial response, customer edit via portal, manual CS update
    const preserveIfEmpty = ["dueDate", "lastPaymentDate", "isolirDate", "phone", "email", "address", "name"];
    for (const f of preserveIfEmpty) {
      const billingVal = billingFields[f];
      const existingVal = (existing as any)[f];
      // Kalau billing return null/empty string DAN local punya value, pertahankan local
      if ((billingVal == null || billingVal === "") && existingVal != null && existingVal !== "") {
        billingFields[f] = existingVal;
      }
    }

    // Detect state transition BEFORE write (untuk collection pipeline)
    const wasIsolir = existing.isIsolir === 1;
    const willBeIsolir = !!data.is_isolir;
    const oldLastPayment = (existing as any).lastPaymentDate ?? null;
    const newLastPayment = billingFields.lastPaymentDate ?? null;

    let transition: 'none' | 'became_suspended' | 'became_active_after_suspended' | 'payment_received' = 'none';
    if (!wasIsolir && willBeIsolir) transition = 'became_suspended';
    else if (wasIsolir && !willBeIsolir) transition = 'became_active_after_suspended';
    else if (oldLastPayment !== newLastPayment && newLastPayment) transition = 'payment_received';

    // UPDATE: semua field billing OVERWRITE, local fields tetap (tidak ter-include di billingFields object)
    await this.db.update(customers).set(billingFields).where(and(eq(customers.customerId, data.customer_id), eq(customers.mitraId, mitraId)));
    const [after] = await this.db.select().from(customers).where(and(eq(customers.id, existing.id), eq(customers.mitraId, mitraId)));
    return { action: 'updated', customerId: existing.id, transition, before: existing, after };
  }

  /** Reconciliation pass: find customer-collection state mismatches and auto-fix.
   *  Cases:
   *  1. Customer is_isolir=1 but no open collection → open one
   *  2. Customer is_isolir=0 (paid) but has open collection → close it
   *  3. Customer billingStatus="lunas" but collection still open → close it
   *  Return list of fixes applied (untuk audit + admin visibility).
   */
  async reconcileCollectionState(): Promise<{
    customersChecked: number;
    mismatchesFound: number;
    fixesApplied: number;
    errors: number;
    details: Array<{ customerId: number; issue: string; action: string; ok: boolean }>;
  }> {
    const mitraId = getMitraId();
    const allCustomers = await this.getCustomers();
    const details: Array<{ customerId: number; issue: string; action: string; ok: boolean }> = [];
    let mismatches = 0, fixes = 0, errors = 0;

    // Batched: 1 query for all open collections, then group by customerId
    const allOpenCollections = await this.db.select().from(collections).where(and(sql`${collections.closedAt} IS NULL`, eq(collections.mitraId, mitraId)));
    const openByCustomerId = new Map<number, typeof allOpenCollections>();
    for (const col of allOpenCollections) {
      const arr = openByCustomerId.get(col.customerId);
      if (arr) arr.push(col);
      else openByCustomerId.set(col.customerId, [col]);
    }

    for (const c of allCustomers) {
      const isolir = c.isIsolir === 1;
      const billingStatus = (c as any).billingStatus;
      const customerName = c.name;
      const open = openByCustomerId.get(c.id) ?? [];

      // CASE 1: isolir tapi tidak ada open collection → open di stage 'new' (= Baru Isolir)
      if (isolir && open.length === 0) {
        mismatches++;
        try {
          await this.openCollectionFromCustomer(c.id, "reconcile_isolir_no_collection");
          details.push({ customerId: c.id, issue: `isolir tapi no open collection (${customerName})`, action: "auto-opened", ok: true });
          fixes++;
        } catch (e: any) {
          errors++;
          details.push({ customerId: c.id, issue: `isolir tapi no open collection (${customerName})`, action: `failed: ${e.message}`, ok: false });
        }
      }

      // CASE 1b: customer overdue tapi belum isolir + no open → open di stage 'suspend' (pre-isolir warning)
      // Detect overdue via billingStatus (case-insensitive 'overdue'/'tunggakan'/'menunggak') ATAU due_date sudah lewat
      else if (!isolir && open.length === 0) {
        const bs = String(billingStatus ?? "").toLowerCase();
        const dueDateStr = (c as any).dueDate;
        const isOverdue = bs === "overdue" || bs === "tunggakan" || bs === "menunggak"
          || (dueDateStr && new Date(dueDateStr).getTime() < Date.now() - 86400_000); // > 1 day past due
        if (isOverdue) {
          mismatches++;
          try {
            // 3-role model: overdue & isolir sama-sama masuk stage 'entry' (resolusi internal).
            await this.openCollectionFromCustomer(c.id, "reconcile_overdue_no_collection");
            details.push({ customerId: c.id, issue: `overdue tapi belum isolir (${customerName})`, action: "auto-opened entry", ok: true });
            fixes++;
          } catch (e: any) {
            errors++;
            details.push({ customerId: c.id, issue: `overdue tapi belum isolir (${customerName})`, action: `failed: ${e.message}`, ok: false });
          }
        }
      }

      // CASE 2: tidak isolir + lunas tapi ada open collection → close ke stage role 'paid'
      if (!isolir && billingStatus === "lunas" && open.length > 0) {
        mismatches++;
        try {
          const paidKey = (await this.getCollectionStageKeyByRole("paid")) ?? "paid";
          for (const col of open) {
            await this.db.update(collections).set({
              stage: paidKey,
              closedAt: new Date().toISOString(),
              closeReason: "reconcile_paid_but_open",
              closedLastPaymentDate: (c as any).lastPaymentDate ?? null,
              updatedAt: new Date().toISOString(),
            } as any).where(and(eq(collections.id, col.id), eq(collections.mitraId, mitraId)));
          }
          details.push({ customerId: c.id, issue: `lunas+aktif tapi ${open.length} open collection (${customerName})`, action: `auto-closed ${open.length}`, ok: true });
          fixes++;
        } catch (e: any) {
          errors++;
          details.push({ customerId: c.id, issue: `lunas+aktif tapi open (${customerName})`, action: `failed: ${e.message}`, ok: false });
        }
      }
    }

    return {
      customersChecked: allCustomers.length,
      mismatchesFound: mismatches,
      fixesApplied: fixes,
      errors,
      details: details.slice(0, 100), // cap response size
    };
  }

  /** Helper: open collection dari customer record (utk reconcile + manual trigger).
   *  Idempotent - kalau sudah ada open, return existing tanpa create baru.
   *  initialStage default 'new' (Baru Isolir). Pakai 'suspend' kalau overdue tapi belum isolir. */
  async openCollectionFromCustomer(customerId: number, reason: string = "manual", initialStage?: string): Promise<Collection | null> {
    const mitraId = getMitraId();
    const c = await this.getCustomer(customerId);
    if (!c) return null;
    // Stage awal = role 'entry' mitra (fallback "new"). 3-role model: isolir & overdue sama-sama masuk entry.
    const entryStage = initialStage ?? (await this.getCollectionStageKeyByRole("entry")) ?? "new";
    // Cek existing open collection - idempotent
    const existing = await this.db.select().from(collections).where(and(
      eq(collections.customerId, customerId),
      eq(collections.mitraId, mitraId),
      sql`${collections.closedAt} IS NULL`,
    )).limit(1);
    if (existing.length > 0) return existing[0];

    const now = new Date().toISOString();
    const colInsertResult = await this.db.insert(collections).values({
      customerId,
      mitraId,
      openedAt: now,
      openedBillingStatus: (c as any).billingStatus ?? null,
      openedDueDate: (c as any).dueDate ?? null,
      openedAmount: (c as any).billingPrice ?? null,
      openedIsolirDate: (c as any).isolirDate ?? null,
      stage: entryStage,
      priority: "medium",
      notes: `Auto-opened (${reason})`,
      createdAt: now,
    } as any);
    const colInsertId = Number((colInsertResult[0] as any).insertId);
    const [row] = await this.db.select().from(collections).where(eq(collections.id, colInsertId));
    return row!;
  }

  /** SOP churn→reaktivasi: auto-delegasi kartu yang lewat SLA stage-nya ke stage/divisi berikutnya.
   *  Dipanggil tiap cycle billing-sync + manual via /collections/run-thresholds.
   *  daysInStage dihitung dari stage_change terakhir (fallback openedAt). Idempotent-ish:
   *  hanya advance 1 langkah per run per kartu; run berikutnya lanjut kalau masih lewat SLA. */
  async runCollectionSopAdvance(): Promise<{ advanced: number; details: Array<{ collectionId: number; from: string; to: string; days: number }> }> {
    const mitraId = getMitraId();
    const now = Date.now();
    const details: Array<{ collectionId: number; from: string; to: string; days: number }> = [];

    const stageRows = await this.getCollectionStages();
    const byKey = new Map<string, SopStageMeta>(stageRows.map((s: any) => [s.key, s as SopStageMeta]));
    const terminalKeys = await this.getTerminalStageKeys();

    // Ada stage yang punya SLA+next? kalau tidak, skip total (hemat query).
    const hasFlow = stageRows.some((s: any) => Number(s.slaDays ?? 0) > 0 && s.nextStageKey);
    if (!hasFlow) return { advanced: 0, details };

    // Kartu open (belum closed).
    const openCols = await this.db.select().from(collections)
      .where(and(eq(collections.mitraId, mitraId), sql`${collections.closedAt} IS NULL`));
    if (openCols.length === 0) return { advanced: 0, details };

    // Batched: waktu stage_change terakhir per collection (1 query).
    const lastChangeRows: any = ((await this.db.execute(sql`
      SELECT collection_id AS cid, MAX(created_at) AS last_change
      FROM collection_activities
      WHERE mitra_id = ${mitraId} AND type = 'stage_change'
      GROUP BY collection_id
    `))[0] as any);
    const lastChangeByCid = new Map<number, string>();
    for (const r of (lastChangeRows ?? [])) lastChangeByCid.set(Number(r.cid), r.last_change);

    let advanced = 0;
    for (const col of openCols) {
      const anchorIso = lastChangeByCid.get(col.id) ?? col.openedAt;
      const anchorMs = new Date(anchorIso).getTime();
      if (isNaN(anchorMs)) continue;
      const daysInStage = (now - anchorMs) / 86400_000;
      const decision = decideSopAdvance(String(col.stage), daysInStage, byKey, terminalKeys);
      if (!decision.advance || !decision.toStage) continue;
      try {
        const fromLabel = byKey.get(decision.fromStage)?.label ?? decision.fromStage;
        const toMeta = byKey.get(decision.toStage);
        const toLabel = toMeta?.label ?? decision.toStage;
        const owner = (toMeta as any)?.ownerDivision ?? "";
        await this.moveCollectionStage(col.id, decision.toStage, null, {
          note: `Auto-delegasi SOP: "${fromLabel}" → "${toLabel}"${owner ? ` (divisi ${owner})` : ""} setelah ${Math.floor(daysInStage)} hari.`,
        } as any);
        advanced++;
        details.push({ collectionId: col.id, from: decision.fromStage, to: decision.toStage, days: Math.floor(daysInStage) });
      } catch (e: any) {
        console.error(`[SOP] auto-advance error collection #${col.id}:`, e.message);
      }
    }
    return { advanced, details: details.slice(0, 100) };
  }

  /** Sync health stats - untuk admin dashboard visibility */
  async getSyncHealthStats(): Promise<{
    customersTotal: number;
    customersWithLastSync: number;
    staleSyncCount: number; // > 30 menit tidak sync
    isolirCount: number;
    openCollectionsCount: number;
    expectedOpenCollections: number; // = isolir count
    drift: number; // |expected - actual|
    oldestStaleSync: string | null;
    lastSyncAt: string | null;
  }> {
    const mitraId = getMitraId();
    const staleTs = new Date(Date.now() - 30 * 60_000).toISOString();
    const rows: any = ((await this.db.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM customers WHERE mitra_id = ${mitraId}) AS total,
        (SELECT COUNT(*) FROM customers WHERE mitra_id = ${mitraId} AND last_sync_at IS NOT NULL) AS with_sync,
        (SELECT COUNT(*) FROM customers WHERE mitra_id = ${mitraId} AND last_sync_at IS NOT NULL AND last_sync_at < ${staleTs}) AS stale,
        (SELECT COUNT(*) FROM customers WHERE mitra_id = ${mitraId} AND is_isolir = 1) AS isolir,
        (SELECT COUNT(*) FROM collections WHERE mitra_id = ${mitraId} AND closed_at IS NULL) AS open_cols,
        (SELECT MIN(last_sync_at) FROM customers WHERE mitra_id = ${mitraId} AND last_sync_at IS NOT NULL) AS oldest,
        (SELECT MAX(last_sync_at) FROM customers WHERE mitra_id = ${mitraId} AND last_sync_at IS NOT NULL) AS newest
    `))[0] as any);
    const r = rows?.[0] ?? {};
    const isolir = Number(r.isolir ?? 0);
    const openCols = Number(r.open_cols ?? 0);
    return {
      customersTotal: Number(r.total ?? 0),
      customersWithLastSync: Number(r.with_sync ?? 0),
      staleSyncCount: Number(r.stale ?? 0),
      isolirCount: isolir,
      openCollectionsCount: openCols,
      expectedOpenCollections: isolir,
      drift: Math.abs(isolir - openCols),
      oldestStaleSync: r.oldest ?? null,
      lastSyncAt: r.newest ?? null,
    };
  }

  // ==================== COLLECTION PIPELINE (v4.1.2) ====================

  async getCollections(filter?: { stage?: string; assignedTo?: number; openOnly?: boolean; customerId?: number; ownerDivision?: string }): Promise<Collection[]> {
    const mitraId = getMitraId();
    const conds: any[] = [eq(collections.mitraId, mitraId)];
    if (filter?.stage) conds.push(eq(collections.stage, filter.stage));
    // Filter per-divisi penanggung jawab (view pipeline ter-scope CS/Marketing):
    // hanya kartu yang stage-nya dimiliki divisi tsb.
    if (filter?.ownerDivision) {
      const stageRows = await this.getCollectionStages();
      const keys = stageKeysForDivision(stageRows as any, filter.ownerDivision);
      if (keys.length === 0) return [];
      conds.push(inArray(collections.stage, keys));
    }
    if (filter?.assignedTo !== undefined) conds.push(eq(collections.assignedTo, filter.assignedTo));
    if (filter?.customerId) conds.push(eq(collections.customerId, filter.customerId));
    // openOnly: kartu OPEN (closed_at IS NULL) SELALU lengkap, PLUS kartu recently-closed
    // (<=7 hari) sebagai konfirmasi "baru lunas/write-off" - TAPI dibatasi keras (200).
    // Tanpa cap: sekali reconcile massal menutup puluhan ribu kartu (mis. import data
    // produksi -> reconcile_paid_but_open 134k kartu) query balikin >100k baris, lalu
    // getAssigneesByCollectionIds membangun IN(...) via sql.join dgn puluhan ribu fragment
    // -> "Maximum call stack size exceeded" -> board tampak KOSONG. (fix 2026-07-24)
    if (filter?.openOnly) {
      const openRows = await this.db.select().from(collections)
        .where(and(...conds, sql`${collections.closedAt} IS NULL`))
        .orderBy(desc(collections.createdAt));
      const cutoff = new Date(Date.now() - 7 * 86400_000).toISOString();
      const closedRows = await this.db.select().from(collections)
        .where(and(...conds, sql`${collections.closedAt} IS NOT NULL`, sql`${collections.closedAt} >= ${cutoff}`))
        .orderBy(desc(collections.closedAt))
        .limit(200);
      return [...openRows, ...closedRows];
    }
    return this.db.select().from(collections).where(and(...conds)).orderBy(desc(collections.createdAt));
  }

  async getCollection(id: number): Promise<Collection | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(collections).where(and(eq(collections.id, id), eq(collections.mitraId, mitraId)));
    return row;
  }

  async getOpenCollectionByCustomer(customerId: number): Promise<Collection | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(collections)
      .where(and(eq(collections.customerId, customerId), eq(collections.mitraId, mitraId), sql`${collections.closedAt} IS NULL`));
    return row;
  }

  async createCollection(data: InsertCollection): Promise<Collection> {
    const mitraId = getMitraId();
    const now = new Date().toISOString();
    const result = await this.db.insert(collections).values({
      ...data,
      mitraId,
      createdAt: data.createdAt ?? now,
      updatedAt: now,
      openedAt: data.openedAt ?? now,
    } as any);
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(collections).where(eq(collections.id, insertId));
    return row!;
  }

  async updateCollection(id: number, data: Partial<InsertCollection>): Promise<Collection> {
    const mitraId = getMitraId();
    await this.db.update(collections)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(and(eq(collections.id, id), eq(collections.mitraId, mitraId)));
    const [row] = await this.db.select().from(collections).where(and(eq(collections.id, id), eq(collections.mitraId, mitraId)));
    return row!;
  }

  async moveCollectionStage(id: number, stage: string, userId: number | null, extra?: Partial<InsertCollection>): Promise<Collection> {
    const mitraId = getMitraId();
    const existing = await this.getCollection(id);
    if (!existing) throw new Error("Collection tidak ditemukan");
    const now = new Date().toISOString();
    const patch: any = { stage, updatedAt: now, ...extra };
    // Terminal = stage pemegang role paid/writeoff (dinamis per-mitra; fallback legacy paid/written_off).
    const terminalKeys = await this.getTerminalStageKeys();
    if (terminalKeys.has(stage)) {
      patch.closedAt = now;
      if (!patch.closeReason) patch.closeReason = `manual_${stage}`;
    } else if (existing.closedAt && !terminalKeys.has(stage)) {
      // Pindah dari terminal kembali ke stage aktif → buka ulang (reopen).
      patch.closedAt = null;
      patch.closeReason = null;
    }
    await this.db.update(collections).set(patch).where(and(eq(collections.id, id), eq(collections.mitraId, mitraId)));
    const [row] = await this.db.select().from(collections).where(and(eq(collections.id, id), eq(collections.mitraId, mitraId)));
    await this.createCollectionActivity({
      collectionId: id,
      userId,
      type: "stage_change",
      content: JSON.stringify({ from: existing.stage, to: stage, ...extra }),
      createdAt: now,
    } as any);
    return row;
  }

  async deleteCollection(id: number): Promise<void> {
    const mitraId = getMitraId();
    await this.db.delete(collectionActivities).where(eq(collectionActivities.collectionId, id));
    await this.db.delete(collectionAssignees).where(and(eq(collectionAssignees.collectionId, id), eq(collectionAssignees.mitraId, mitraId)));
    await this.db.delete(collections).where(and(eq(collections.id, id), eq(collections.mitraId, mitraId)));
  }

  async getCollectionActivities(collectionId: number): Promise<CollectionActivity[]> {
    const mitraId = getMitraId();
    return this.db.select().from(collectionActivities)
      .where(and(eq(collectionActivities.collectionId, collectionId), eq(collectionActivities.mitraId, mitraId)))
      .orderBy(desc(collectionActivities.createdAt));
  }

  async createCollectionActivity(data: InsertCollectionActivity): Promise<CollectionActivity> {
    const mitraId = getMitraId();
    const result = await this.db.insert(collectionActivities).values({
      ...data,
      mitraId,
      createdAt: data.createdAt ?? new Date().toISOString(),
    } as any);
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(collectionActivities).where(eq(collectionActivities.id, insertId));
    return row!;
  }

  async getCollectionStats(): Promise<{ total: number; byStage: Record<string, number>; totalOverdue: number; avgAgeDays: number }> {
    const mitraId = getMitraId();
    const rows = await this.db.select().from(collections).where(and(sql`${collections.closedAt} IS NULL`, eq(collections.mitraId, mitraId)));
    const byStage: Record<string, number> = {};
    let totalOverdue = 0;
    let ageSum = 0;
    const now = Date.now();
    for (const r of rows) {
      byStage[r.stage ?? "new"] = (byStage[r.stage ?? "new"] ?? 0) + 1;
      totalOverdue += r.openedAmount ?? 0;
      ageSum += Math.floor((now - new Date(r.openedAt).getTime()) / 86400000);
    }
    return {
      total: rows.length,
      byStage,
      totalOverdue,
      avgAgeDays: rows.length > 0 ? Math.round(ageSum / rows.length) : 0,
    };
  }

  // ==================== COLLECTION STAGES (custom per-mitra pipeline) ====================

  /** List stage pipeline mitra aktif, urut posisi. */
  async getCollectionStages(): Promise<CollectionStageRow[]> {
    const mitraId = getMitraId();
    return this.db.select().from(collectionStages)
      .where(eq(collectionStages.mitraId, mitraId))
      .orderBy(asc(collectionStages.position), asc(collectionStages.id));
  }

  /** Resolve key stage pemegang role tertentu untuk mitra aktif. Fallback ke key legacy
   *  (new/paid/written_off) supaya otomasi tetap jalan kalau seed belum ada. */
  async getCollectionStageKeyByRole(role: CollectionStageRole, opts?: { fallback?: boolean }): Promise<string | null> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(collectionStages)
      .where(and(eq(collectionStages.mitraId, mitraId), eq(collectionStages.role, role)))
      .orderBy(asc(collectionStages.position)).limit(1);
    if (row) return row.key;
    // fallback default true (belt-and-suspenders untuk entry/paid pre-seed). writeoff opsional →
    // caller pakai fallback:false supaya auto write-off mati kalau mitra tak punya stage writeoff.
    if (opts?.fallback === false) return null;
    const fallback: Record<CollectionStageRole, string | null> =
      { entry: "new", paid: "paid", writeoff: "written_off", dismantel: "dismantel", none: null };
    return fallback[role];
  }

  /** Set keys yang dianggap "terminal" (role paid/writeoff/dismantel) - dipakai moveCollectionStage.
   *  Terminal = kartu ditutup (reaktivasi/lunas, dismantel/bongkar, atau loss/churn). */
  private async getTerminalStageKeys(): Promise<Set<string>> {
    const mitraId = getMitraId();
    const rows = await this.db.select().from(collectionStages)
      .where(and(eq(collectionStages.mitraId, mitraId), inArray(collectionStages.role, ["paid", "writeoff", "dismantel"])));
    const set = new Set(rows.map((r) => r.key));
    // Fallback legacy kalau belum ter-seed
    if (set.size === 0) { set.add("paid"); set.add("written_off"); set.add("dismantel"); }
    return set;
  }

  /** Seed pipeline default untuk 1 mitra. Mitra 1 dari konstanta DEFAULT_COLLECTION_STAGES;
   *  mitra lain di-clone dari pipeline mitra 1 (template "ambil dari JABNET"). Idempotent -
   *  skip kalau mitra sudah punya stage. */
  async seedCollectionStagesForMitra(mitraId: number): Promise<number> {
    const existing = await withMitra(mitraId, () => this.getCollectionStages());
    if (existing.length > 0) return 0;
    let template: Array<{ key: string; label: string; color: string; role: string; ownerDivision?: string | null; slaDays?: number | null; nextStageKey?: string | null }>;
    if (mitraId === 1) {
      template = DEFAULT_COLLECTION_STAGES.map((s) => ({ ...s }));
    } else {
      const jabnet = await withMitra(1, () => this.getCollectionStages());
      template = (jabnet.length > 0 ? jabnet : DEFAULT_COLLECTION_STAGES as any[]).map((s: any) => ({
        key: s.key, label: s.label, color: s.color, role: s.role,
        ownerDivision: s.ownerDivision ?? null, slaDays: s.slaDays ?? null, nextStageKey: s.nextStageKey ?? null,
      }));
    }
    const now = new Date().toISOString();
    let pos = 0;
    for (const s of template) {
      await this.db.insert(collectionStages).values({
        mitraId, key: s.key, label: s.label, color: s.color, position: pos++, role: s.role,
        ownerDivision: s.ownerDivision ?? null, slaDays: s.slaDays ?? null, nextStageKey: s.nextStageKey ?? null,
        createdAt: now,
      } as any);
    }
    return template.length;
  }

  /** Terapkan ladder SOP churn→reaktivasi ke stages 1 mitra - IDEMPOTENT & aman untuk data lama.
   *  - Tambah stage kerja divisi (delegasi_cs, cs_kunjungan, delegasi_marketing, mkt_visit) +
   *    terminal dismantel bila belum ada.
   *  - Set owner_division / sla_days / next_stage_key + label/color/position untuk key SOP yang
   *    dikenal. Stage custom (key di luar daftar) TIDAK disentuh. */
  async applyCollectionSopLadder(mitraId: number): Promise<{ inserted: number; updated: number }> {
    return withMitra(mitraId, async () => {
      const now = new Date().toISOString();
      const existing = await this.getCollectionStages();
      const byKey = new Map(existing.map((s) => [s.key, s]));
      let inserted = 0, updated = 0;

      // Role default per key SOP (dari template konstanta), supaya terminal dismantel dapat role
      // yang benar (dismantel) - bukan "none".
      const roleByKey = new Map(DEFAULT_COLLECTION_STAGES.map((s) => [s.key, s.role]));

      // 1. Pastikan stage kerja divisi + terminal dismantel ada (reaktivasi CS→Marketing + bongkar).
      for (const key of ["delegasi_cs", "cs_kunjungan", "delegasi_marketing", "mkt_visit", "dismantel"] as const) {
        if (byKey.has(key)) continue;
        await this.db.insert(collectionStages).values({
          mitraId, key,
          label: COLLECTION_STAGE_LABELS[key], color: COLLECTION_STAGE_COLORS[key],
          position: 999, role: (roleByKey.get(key) ?? "none"), createdAt: now,
        } as any);
        inserted++;
      }

      // 2. Set metadata + posisi untuk semua key SOP yang dikenal (urut = DEFAULT_COLLECTION_STAGES).
      let pos = 0;
      for (const def of DEFAULT_COLLECTION_STAGES) {
        pos++;
        const row = byKey.get(def.key) ?? (await this.getCollectionStages()).find((s) => s.key === def.key);
        if (!row) continue;
        await this.db.update(collectionStages).set({
          ownerDivision: def.ownerDivision ?? null,
          slaDays: def.slaDays ?? null,
          nextStageKey: def.nextStageKey ?? null,
          position: pos,
          updatedAt: now,
        } as any).where(and(eq(collectionStages.mitraId, mitraId), eq(collectionStages.key, def.key)));
        updated++;
      }
      return { inserted, updated };
    });
  }

  /** Seed built-in pipeline templates for a mitra. Idempotent - skips if name+is_builtin=1 already exists. */
  async seedBuiltinTemplates(mitraId: number): Promise<void> {
    const now = new Date().toISOString();
    for (const def of BUILTIN_TEMPLATES) {
      const [existing]: any = await this.pool.execute(
        `SELECT id FROM pipeline_templates WHERE mitra_id = ? AND name = ? AND is_builtin = 1 LIMIT 1`,
        [mitraId, def.pipeline.name],
      );
      if ((existing as any[]).length) continue;
      await this.pool.execute(
        `INSERT INTO pipeline_templates (mitra_id, name, description, icon, color, definition, is_builtin, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
        [mitraId, def.pipeline.name, def.pipeline.description, def.pipeline.icon, def.pipeline.color, JSON.stringify(def), now],
      );
    }
  }

  async createCollectionStage(data: { label: string; color?: string; role?: CollectionStageRole }): Promise<CollectionStageRow> {
    const mitraId = getMitraId();
    const existing = await this.getCollectionStages();
    // Generate key stabil dari label (slug), pastikan unik per mitra.
    const base = String(data.label).toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "stage";
    const usedKeys = new Set(existing.map((s) => s.key));
    let key = base;
    let n = 2;
    while (usedKeys.has(key)) key = `${base}_${n++}`;
    const role = data.role ?? "none";
    if (role === "entry" || role === "paid" || role === "writeoff" || role === "dismantel") {
      await this.clearCollectionStageRole(role);
    }
    const now = new Date().toISOString();
    const maxPos = existing.reduce((m, s) => Math.max(m, s.position), -1);
    const result = await this.db.insert(collectionStages).values({
      mitraId, key, label: data.label, color: data.color ?? "#6B7280",
      position: maxPos + 1, role, createdAt: now,
    } as any);
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(collectionStages).where(eq(collectionStages.id, insertId));
    return row!;
  }

  /** Kosongkan role tertentu (set ke 'none') untuk semua stage mitra aktif - supaya role unik. */
  private async clearCollectionStageRole(role: CollectionStageRole): Promise<void> {
    const mitraId = getMitraId();
    await this.db.update(collectionStages)
      .set({ role: "none", updatedAt: new Date().toISOString() })
      .where(and(eq(collectionStages.mitraId, mitraId), eq(collectionStages.role, role)));
  }

  async updateCollectionStage(id: number, data: { label?: string; color?: string; role?: CollectionStageRole; ownerDivision?: string | null; slaDays?: number | null; nextStageKey?: string | null }): Promise<CollectionStageRow> {
    const mitraId = getMitraId();
    const [target] = await this.db.select().from(collectionStages).where(and(eq(collectionStages.id, id), eq(collectionStages.mitraId, mitraId)));
    if (!target) throw new Error("Stage tidak ditemukan");
    // Role wajib (entry/paid) unik: kalau set role baru, kosongkan dulu pemegang lama.
    if (data.role && (data.role === "entry" || data.role === "paid" || data.role === "writeoff" || data.role === "dismantel")) {
      await this.clearCollectionStageRole(data.role);
    }
    const patch: any = { updatedAt: new Date().toISOString() };
    if (data.label !== undefined) patch.label = data.label;
    if (data.color !== undefined) patch.color = data.color;
    if (data.role !== undefined) patch.role = data.role;
    // SOP fields - null berarti "kosongkan" (dibedakan dari undefined = jangan sentuh).
    if (data.ownerDivision !== undefined) patch.ownerDivision = data.ownerDivision || null;
    if (data.slaDays !== undefined) patch.slaDays = (data.slaDays == null || Number(data.slaDays) <= 0) ? null : Number(data.slaDays);
    if (data.nextStageKey !== undefined) patch.nextStageKey = data.nextStageKey || null;
    await this.db.update(collectionStages).set(patch).where(and(eq(collectionStages.id, id), eq(collectionStages.mitraId, mitraId)));
    const [row] = await this.db.select().from(collectionStages).where(and(eq(collectionStages.id, id), eq(collectionStages.mitraId, mitraId)));
    return row!;
  }

  async reorderCollectionStages(orderedIds: number[]): Promise<CollectionStageRow[]> {
    const mitraId = getMitraId();
    const now = new Date().toISOString();
    let pos = 0;
    for (const id of orderedIds) {
      await this.db.update(collectionStages)
        .set({ position: pos++, updatedAt: now })
        .where(and(eq(collectionStages.id, id), eq(collectionStages.mitraId, mitraId)));
    }
    return this.getCollectionStages();
  }

  /** Hapus stage. mode 'migrate' → pindahkan kartu ke targetKey lebih dulu. mode 'purge' →
   *  hapus kartu (+ aktivitas + assignee) di stage tersebut. Stage pemegang role wajib
   *  (entry/paid) ditolak. Return jumlah kartu terdampak. */
  async deleteCollectionStage(id: number, opts: { mode: "migrate" | "purge"; targetKey?: string }): Promise<{ affectedCards: number }> {
    const mitraId = getMitraId();
    const [target] = await this.db.select().from(collectionStages).where(and(eq(collectionStages.id, id), eq(collectionStages.mitraId, mitraId)));
    if (!target) throw new Error("Stage tidak ditemukan");
    if (target.role === "entry" || target.role === "paid") {
      throw new Error(`Stage "${target.label}" memegang peran sistem (${target.role}). Pindahkan peran ke stage lain dulu sebelum menghapus.`);
    }
    const stages = await this.getCollectionStages();
    if (stages.length <= 1) throw new Error("Tidak bisa menghapus stage terakhir.");

    // Kartu (open collections) yang ada di stage ini
    const cards = await this.db.select().from(collections).where(and(eq(collections.mitraId, mitraId), eq(collections.stage, target.key)));
    const affectedCards = cards.length;
    const now = new Date().toISOString();

    if (opts.mode === "migrate") {
      const targetKey = opts.targetKey;
      if (!targetKey || targetKey === target.key) throw new Error("Pilih stage tujuan pemindahan kartu.");
      const dest = stages.find((s) => s.key === targetKey);
      if (!dest) throw new Error("Stage tujuan tidak valid.");
      for (const c of cards) {
        await this.db.update(collections).set({ stage: targetKey, updatedAt: now }).where(and(eq(collections.id, c.id), eq(collections.mitraId, mitraId)));
        await this.createCollectionActivity({
          collectionId: c.id, userId: null, type: "stage_change",
          content: JSON.stringify({ from: target.key, to: targetKey, reason: "stage_deleted_migrate" }),
          createdAt: now,
        } as any);
      }
    } else {
      // purge - hapus kartu beserta aktivitas + assignee
      for (const c of cards) {
        await this.db.delete(collectionActivities).where(eq(collectionActivities.collectionId, c.id));
        await this.db.delete(collectionAssignees).where(and(eq(collectionAssignees.collectionId, c.id), eq(collectionAssignees.mitraId, mitraId)));
        await this.db.delete(collections).where(and(eq(collections.id, c.id), eq(collections.mitraId, mitraId)));
      }
    }
    await this.db.delete(collectionStages).where(and(eq(collectionStages.id, id), eq(collectionStages.mitraId, mitraId)));
    return { affectedCards };
  }

  // ============================================================
  // ===== Pipelines Engine (Phase 1) - tenant-scoped =====
  // ============================================================

  async listPipelines(includeArchived = false): Promise<Pipeline[]> {
    const mitraId = getMitraId();
    const where = includeArchived
      ? eq(pipelines.mitraId, mitraId)
      : and(eq(pipelines.mitraId, mitraId), eq(pipelines.isArchived, 0));
    return this.db.select().from(pipelines).where(where)
      .orderBy(asc(pipelines.position), asc(pipelines.id));
  }

  async getPipeline(id: number): Promise<Pipeline | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(pipelines)
      .where(and(eq(pipelines.id, id), eq(pipelines.mitraId, mitraId)));
    return row;
  }

  async createPipeline(data: { name: string; description?: string; color?: string; icon?: string; }, userId: number): Promise<Pipeline> {
    const mitraId = getMitraId();
    const existing = await this.listPipelines(true);
    const maxPos = existing.reduce((m, p) => Math.max(m, p.position), -1);
    const now = new Date().toISOString();
    const result = await this.db.insert(pipelines).values({
      mitraId, name: data.name, description: data.description ?? null,
      color: data.color ?? "#0EA5E9", icon: data.icon ?? null,
      position: maxPos + 1, isArchived: 0, createdBy: userId, createdAt: now,
    } as any);
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(pipelines).where(and(eq(pipelines.id, insertId), eq(pipelines.mitraId, mitraId)));
    return row!;
  }

  async updatePipeline(id: number, data: { name?: string; description?: string; color?: string; icon?: string; isArchived?: number; }, userId: number): Promise<Pipeline> {
    const mitraId = getMitraId();
    const [target] = await this.db.select().from(pipelines)
      .where(and(eq(pipelines.id, id), eq(pipelines.mitraId, mitraId)));
    if (!target) throw new Error("Pipeline tidak ditemukan");
    const patch: any = { updatedAt: new Date().toISOString(), updatedBy: userId };
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description;
    if (data.color !== undefined) patch.color = data.color;
    if (data.icon !== undefined) patch.icon = data.icon;
    if (data.isArchived !== undefined) patch.isArchived = data.isArchived ? 1 : 0;
    await this.db.update(pipelines).set(patch)
      .where(and(eq(pipelines.id, id), eq(pipelines.mitraId, mitraId)));
    const [row] = await this.db.select().from(pipelines).where(and(eq(pipelines.id, id), eq(pipelines.mitraId, mitraId)));
    return row!;
  }

  async archivePipeline(id: number, userId: number): Promise<void> {
    const mitraId = getMitraId();
    await this.db.update(pipelines)
      .set({ isArchived: 1, updatedAt: new Date().toISOString(), updatedBy: userId })
      .where(and(eq(pipelines.id, id), eq(pipelines.mitraId, mitraId)));
  }

  async deletePipeline(id: number): Promise<void> {
    const mitraId = getMitraId();
    await this.db.transaction(async (tx) => {
      const cardRows = await tx.select({ id: pipelineCards.id }).from(pipelineCards)
        .where(and(eq(pipelineCards.mitraId, mitraId), eq(pipelineCards.pipelineId, id)));
      const cardIds = cardRows.map((c) => c.id);
      if (cardIds.length) {
        await tx.delete(pipelineCardComments).where(and(eq(pipelineCardComments.mitraId, mitraId), inArray(pipelineCardComments.cardId, cardIds)));
        await tx.delete(pipelineCardActivity).where(and(eq(pipelineCardActivity.mitraId, mitraId), inArray(pipelineCardActivity.cardId, cardIds)));
        await tx.delete(pipelineCardValues).where(and(eq(pipelineCardValues.mitraId, mitraId), inArray(pipelineCardValues.cardId, cardIds)));
        await tx.delete(pipelineCardFollowers).where(and(eq(pipelineCardFollowers.mitraId, mitraId), inArray(pipelineCardFollowers.cardId, cardIds)));
      }
      await tx.delete(pipelineCards).where(and(eq(pipelineCards.mitraId, mitraId), eq(pipelineCards.pipelineId, id)));

      const ruleRows = await tx.select({ id: pipelineRules.id }).from(pipelineRules)
        .where(and(eq(pipelineRules.mitraId, mitraId), eq(pipelineRules.pipelineId, id)));
      const ruleIds = ruleRows.map((r) => r.id);
      if (ruleIds.length) {
        await tx.delete(pipelineRuleFieldMaps).where(and(eq(pipelineRuleFieldMaps.mitraId, mitraId), inArray(pipelineRuleFieldMaps.ruleId, ruleIds)));
        await tx.delete(pipelineRuleFires).where(and(eq(pipelineRuleFires.mitraId, mitraId), inArray(pipelineRuleFires.ruleId, ruleIds)));
        await tx.delete(pipelineRuleActions).where(and(eq(pipelineRuleActions.mitraId, mitraId), inArray(pipelineRuleActions.ruleId, ruleIds)));
      }
      await tx.delete(pipelineRules).where(and(eq(pipelineRules.mitraId, mitraId), eq(pipelineRules.pipelineId, id)));
      await tx.delete(pipelineFields).where(and(eq(pipelineFields.mitraId, mitraId), eq(pipelineFields.pipelineId, id)));
      await tx.delete(pipelineAccess).where(and(eq(pipelineAccess.mitraId, mitraId), eq(pipelineAccess.pipelineId, id)));
      await tx.delete(pipelineStages).where(and(eq(pipelineStages.mitraId, mitraId), eq(pipelineStages.pipelineId, id)));
      await tx.delete(pipelines).where(and(eq(pipelines.mitraId, mitraId), eq(pipelines.id, id)));
    });
  }

  async reorderPipelines(orderedIds: number[]): Promise<void> {
    const mitraId = getMitraId();
    const now = new Date().toISOString();
    for (let i = 0; i < orderedIds.length; i++) {
      await this.db.update(pipelines).set({ position: i, updatedAt: now })
        .where(and(eq(pipelines.id, orderedIds[i]), eq(pipelines.mitraId, mitraId)));
    }
  }

  async listStages(pipelineId: number): Promise<PipelineStage[]> {
    const mitraId = getMitraId();
    return this.db.select().from(pipelineStages)
      .where(and(eq(pipelineStages.mitraId, mitraId), eq(pipelineStages.pipelineId, pipelineId)))
      .orderBy(asc(pipelineStages.position), asc(pipelineStages.id));
  }

  async createStage(pipelineId: number, data: { label: string; color?: string; description?: string | null }): Promise<PipelineStage> {
    const mitraId = getMitraId();
    const existing = await this.listStages(pipelineId);
    const maxPos = existing.reduce((m, s) => Math.max(m, s.position), -1);
    const now = new Date().toISOString();
    const result = await this.db.insert(pipelineStages).values({
      mitraId, pipelineId, label: data.label, color: data.color ?? "#6B7280",
      description: data.description ?? null,
      position: maxPos + 1, createdAt: now,
    } as any);
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(pipelineStages).where(and(eq(pipelineStages.id, insertId), eq(pipelineStages.mitraId, mitraId)));
    return row!;
  }

  /** Teamspace FR-403: set aturan siapa boleh memindahkan kartu pada list ini (JSON atau NULL = semua). */
  async setStageMovePermission(stageId: number, movePermissionJson: string | null): Promise<void> {
    const mitraId = getMitraId();
    await this.db.update(pipelineStages)
      .set({ movePermission: movePermissionJson, updatedAt: new Date().toISOString() } as any)
      .where(and(eq(pipelineStages.id, stageId), eq(pipelineStages.mitraId, mitraId)));
  }

  async updateStage(id: number, data: { label?: string; color?: string; description?: string | null }): Promise<PipelineStage> {
    const mitraId = getMitraId();
    const patch: any = { updatedAt: new Date().toISOString() };
    if (data.label !== undefined) patch.label = data.label;
    if (data.color !== undefined) patch.color = data.color;
    if (data.description !== undefined) patch.description = data.description;
    await this.db.update(pipelineStages).set(patch)
      .where(and(eq(pipelineStages.id, id), eq(pipelineStages.mitraId, mitraId)));
    const [row] = await this.db.select().from(pipelineStages)
      .where(and(eq(pipelineStages.id, id), eq(pipelineStages.mitraId, mitraId)));
    if (!row) throw new Error("Stage tidak ditemukan");
    return row;
  }

  async countCardsInStage(stageId: number): Promise<number> {
    const mitraId = getMitraId();
    const [row] = await this.db.select({ cnt: count() }).from(pipelineCards)
      .where(and(eq(pipelineCards.mitraId, mitraId), eq(pipelineCards.stageId, stageId)));
    return Number(row?.cnt ?? 0);
  }

  /** Throws if the stage still holds cards (guarded delete). */
  async deleteStage(id: number): Promise<void> {
    const mitraId = getMitraId();
    const count = await this.countCardsInStage(id);
    if (count > 0) throw new Error("Stage masih berisi kartu - pindahkan atau hapus kartu dulu");
    await this.db.delete(pipelineStages)
      .where(and(eq(pipelineStages.id, id), eq(pipelineStages.mitraId, mitraId)));
  }

  async reorderStages(pipelineId: number, orderedIds: number[]): Promise<void> {
    const mitraId = getMitraId();
    const now = new Date().toISOString();
    for (let i = 0; i < orderedIds.length; i++) {
      await this.db.update(pipelineStages).set({ position: i, updatedAt: now })
        .where(and(eq(pipelineStages.id, orderedIds[i]), eq(pipelineStages.mitraId, mitraId), eq(pipelineStages.pipelineId, pipelineId)));
    }
  }

  private async logCardActivity(cardId: number, actorId: number, type: string, detail?: unknown): Promise<void> {
    const mitraId = getMitraId();
    await this.db.insert(pipelineCardActivity).values({
      mitraId, cardId, actorId, type,
      detail: detail === undefined ? null : JSON.stringify(detail),
      createdAt: new Date().toISOString(),
    } as any);
  }

  /** Public audit hook for callers that mutate via low-level methods (e.g. bulk set_field). */
  async recordCardActivity(cardId: number, actorId: number, type: string, detail?: unknown): Promise<void> {
    await this.logCardActivity(cardId, actorId, type, detail);
  }

  async listCards(pipelineId: number, opts?: { q?: string; assigneeId?: number }): Promise<PipelineCard[]> {
    const mitraId = getMitraId();
    // Teamspace: kartu terarsip disembunyikan dari board (lihat listArchivedCards). Kartu ops
    // lama selalu archived_at NULL sehingga perilaku pipeline ops tidak berubah.
    let rows = await this.db.select().from(pipelineCards)
      .where(and(eq(pipelineCards.mitraId, mitraId), eq(pipelineCards.pipelineId, pipelineId), isNull(pipelineCards.archivedAt)))
      .orderBy(asc(pipelineCards.stageId), asc(pipelineCards.position), asc(pipelineCards.id));
    if (opts?.q) {
      const q = opts.q.toLowerCase();
      rows = rows.filter((c) => c.title.toLowerCase().includes(q));
    }
    if (opts?.assigneeId) rows = rows.filter((c) => c.assigneeId === opts.assigneeId);
    return rows;
  }

  async getCard(id: number): Promise<PipelineCard | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(pipelineCards)
      .where(and(eq(pipelineCards.id, id), eq(pipelineCards.mitraId, mitraId)));
    return row;
  }

  /** Live billing snapshot for a card via its linked customer (source_customer_id). null when unlinked. */
  async getCardCollectionSnapshot(cardId: number): Promise<CollectionSnapshot | null> {
    const card = await this.getCard(cardId);
    const custId = (card as any)?.sourceCustomerId;
    if (!card || !custId) return null;
    const rows = await this.db.select().from(customers)
      .where(and(eq(customers.id, custId), eq(customers.mitraId, getMitraId())));
    const c: any = (rows as any[])[0];
    if (!c) return null;
    const snap = buildCollectionSnapshot(
      { dueDate: c.dueDate, billingPrice: c.billingPrice, billingStatus: c.billingStatus, lastPaymentDate: c.lastPaymentDate },
      Date.now(),
    );
    // Fold in card-stage-derived status from the pipeline's collection config (SP3a).
    const { config } = await this.getCollectionConfig((card as any).pipelineId);
    const status = resolveCollectionStatus(
      (card as any).stageId,
      config ? { enabled: config.enabled === 1, paidStageId: config.paidStageId, writeoffStageId: config.writeoffStageId } : null,
    );
    snap.collectionStatus = status.collectionStatus;
    snap.writeoffStatus = status.writeoffStatus;
    return snap;
  }

  async getRelatedCards(cardId: number): Promise<Array<{
    id: number; pipelineId: number; pipelineName: string; stageId: number; stageLabel: string;
    title: string; relationType: string | null; originCardId: number | null;
  }>> {
    const mitraId = getMitraId();
    const [self] = await this.db.select().from(pipelineCards)
      .where(and(eq(pipelineCards.id, cardId), eq(pipelineCards.mitraId, mitraId)));
    if (!self) return [];
    const masterId = self.masterCardId ?? self.id;
    const rows = await this.db
      .select({
        id: pipelineCards.id,
        pipelineId: pipelineCards.pipelineId,
        pipelineName: pipelines.name,
        stageId: pipelineCards.stageId,
        stageLabel: pipelineStages.label,
        title: pipelineCards.title,
        relationType: pipelineCards.relationType,
        originCardId: pipelineCards.originCardId,
      })
      .from(pipelineCards)
      .innerJoin(pipelines, eq(pipelines.id, pipelineCards.pipelineId))
      .innerJoin(pipelineStages, eq(pipelineStages.id, pipelineCards.stageId))
      .where(and(
        eq(pipelineCards.mitraId, mitraId),
        eq(pipelineCards.masterCardId, masterId),
        ne(pipelineCards.id, cardId),
      ));
    return rows;
  }

  /** Most-recent card in `pipelineId` sharing `masterId` (excluding `excludeCardId`). Mitra-scoped. */
  async getSiblingCardInPipeline(masterId: number, pipelineId: number, excludeCardId?: number): Promise<PipelineCard | undefined> {
    const mitraId = getMitraId();
    const conds = [
      eq(pipelineCards.mitraId, mitraId),
      eq(pipelineCards.masterCardId, masterId),
      eq(pipelineCards.pipelineId, pipelineId),
    ];
    if (excludeCardId != null) conds.push(ne(pipelineCards.id, excludeCardId));
    const [row] = await this.db.select().from(pipelineCards)
      .where(and(...conds)).orderBy(desc(pipelineCards.id)).limit(1);
    return row;
  }

  async createCard(pipelineId: number, data: { stageId: number; title: string; description?: string; assigneeId?: number | null; priority?: string; dueDate?: string | null; tags?: string[] | null; sourceCustomerId?: number | null; sourceRuleId?: number | null; masterCardId?: number | null; originCardId?: number | null; relationType?: string | null; collectionCycle?: number | null; }, userId: number): Promise<PipelineCard> {
    const mitraId = getMitraId();
    const siblings = await this.db.select().from(pipelineCards)
      .where(and(eq(pipelineCards.mitraId, mitraId), eq(pipelineCards.stageId, data.stageId)));
    const maxPos = siblings.reduce((m, c) => Math.max(m, c.position), -1);
    const now = new Date().toISOString();
    const result = await this.db.insert(pipelineCards).values({
      mitraId, pipelineId, stageId: data.stageId, title: data.title,
      description: data.description ?? null, assigneeId: data.assigneeId ?? null,
      priority: data.priority ?? "medium", dueDate: data.dueDate ?? null,
      tags: data.tags ? JSON.stringify(data.tags) : null,
      sourceCustomerId: data.sourceCustomerId ?? null,
      sourceRuleId: data.sourceRuleId ?? null,
      masterCardId: data.masterCardId ?? null,
      originCardId: data.originCardId ?? null,
      relationType: data.relationType ?? null,
      collectionCycle: data.collectionCycle ?? null,
      position: maxPos + 1, createdBy: userId, createdAt: now, stageEnteredAt: now,
    } as any);
    const insertId = Number((result[0] as any).insertId);
    // Root card → its own master; spawned cards (SP3) pass masterCardId in.
    if (data.masterCardId == null) {
      await this.db.update(pipelineCards).set({ masterCardId: insertId })
        .where(and(eq(pipelineCards.id, insertId), eq(pipelineCards.mitraId, mitraId)));
    }
    await this.logCardActivity(insertId, userId, "created");
    const [row] = await this.db.select().from(pipelineCards).where(and(eq(pipelineCards.id, insertId), eq(pipelineCards.mitraId, mitraId)));
    return row!;
  }

  /** Set/replace a card's collection cycle number. Mitra-scoped. */
  async setCardCycle(cardId: number, cycle: number): Promise<void> {
    const mid = getMitraId();
    await this.db.update(pipelineCards).set({ collectionCycle: cycle })
      .where(and(eq(pipelineCards.id, cardId), eq(pipelineCards.mitraId, mid)));
  }

  async updateCard(id: number, data: { title?: string; description?: string; assigneeId?: number | null; priority?: string; dueDate?: string | null; tags?: string[] | null; }, userId: number): Promise<PipelineCard> {
    const mitraId = getMitraId();
    const before = await this.getCard(id);
    if (!before) throw new Error("Kartu tidak ditemukan");
    const patch: any = { updatedAt: new Date().toISOString(), updatedBy: userId };
    if (data.title !== undefined) patch.title = data.title;
    if (data.description !== undefined) patch.description = data.description;
    if (data.assigneeId !== undefined) patch.assigneeId = data.assigneeId;
    if (data.priority !== undefined) patch.priority = data.priority;
    if (data.dueDate !== undefined) patch.dueDate = data.dueDate;
    if (data.tags !== undefined) patch.tags = data.tags ? JSON.stringify(data.tags) : null;
    await this.db.update(pipelineCards).set(patch)
      .where(and(eq(pipelineCards.id, id), eq(pipelineCards.mitraId, mitraId)));
    if (data.assigneeId !== undefined && data.assigneeId !== before.assigneeId) {
      await this.logCardActivity(id, userId, "reassigned", { old: before.assigneeId, new: data.assigneeId });
    } else {
      await this.logCardActivity(id, userId, "edited");
    }
    const [row] = await this.db.select().from(pipelineCards).where(and(eq(pipelineCards.id, id), eq(pipelineCards.mitraId, mitraId)));
    return row!;
  }

  async moveCard(id: number, toStageId: number, toPosition: number | undefined, userId: number): Promise<PipelineCard> {
    const mitraId = getMitraId();
    const before = await this.getCard(id);
    if (!before) throw new Error("Kartu tidak ditemukan");
    const dest = (await this.db.select().from(pipelineCards)
      .where(and(eq(pipelineCards.mitraId, mitraId), eq(pipelineCards.stageId, toStageId))))
      .filter((c) => c.id !== id)
      .sort((a, b) => a.position - b.position);
    const insertAt = computeInsertPosition(dest.length, toPosition);
    const reordered = [...dest.slice(0, insertAt), { id }, ...dest.slice(insertAt)];
    const now = new Date().toISOString();
    const stageChanged = before.stageId !== toStageId;
    for (let i = 0; i < reordered.length; i++) {
      const patch: any = { position: i, stageId: toStageId, updatedAt: now, updatedBy: userId };
      if (stageChanged && reordered[i].id === id) patch.stageEnteredAt = now;
      await this.db.update(pipelineCards).set(patch)
        .where(and(eq(pipelineCards.id, reordered[i].id), eq(pipelineCards.mitraId, mitraId)));
    }
    if (stageChanged) {
      await this.logCardActivity(id, userId, "moved", { fromStage: before.stageId, toStage: toStageId });
    }
    const [row] = await this.db.select().from(pipelineCards).where(and(eq(pipelineCards.id, id), eq(pipelineCards.mitraId, mitraId)));
    return row!;
  }

  async deleteCard(id: number): Promise<void> {
    const mitraId = getMitraId();
    await this.db.delete(pipelineCardComments).where(and(eq(pipelineCardComments.cardId, id), eq(pipelineCardComments.mitraId, mitraId)));
    await this.db.delete(pipelineCardActivity).where(and(eq(pipelineCardActivity.cardId, id), eq(pipelineCardActivity.mitraId, mitraId)));
    await this.db.delete(pipelineCardFollowers).where(and(eq(pipelineCardFollowers.cardId, id), eq(pipelineCardFollowers.mitraId, mitraId)));
    await this.db.delete(pipelineCards).where(and(eq(pipelineCards.id, id), eq(pipelineCards.mitraId, mitraId)));
  }

  async listComments(cardId: number): Promise<PipelineCardComment[]> {
    const mitraId = getMitraId();
    return this.db.select().from(pipelineCardComments)
      .where(and(eq(pipelineCardComments.mitraId, mitraId), eq(pipelineCardComments.cardId, cardId)))
      .orderBy(asc(pipelineCardComments.createdAt), asc(pipelineCardComments.id));
  }

  async addComment(cardId: number, authorId: number, body: string, type?: string | null): Promise<PipelineCardComment> {
    const mitraId = getMitraId();
    const now = new Date().toISOString();
    const safeType = type && isCardCommentType(type) ? type : "note";
    const result = await this.db.insert(pipelineCardComments).values({
      mitraId, cardId, authorId, body, type: safeType, createdAt: now,
    } as any);
    const insertId = Number((result[0] as any).insertId);
    await this.logCardActivity(cardId, authorId, "commented");
    const [row] = await this.db.select().from(pipelineCardComments).where(and(eq(pipelineCardComments.id, insertId), eq(pipelineCardComments.mitraId, mitraId)));
    return row!;
  }

  async deleteComment(id: number): Promise<void> {
    const mitraId = getMitraId();
    await this.db.delete(pipelineCardComments)
      .where(and(eq(pipelineCardComments.id, id), eq(pipelineCardComments.mitraId, mitraId)));
  }

  /** File paths of a comment's attachments (so the route can unlink files), then delete those rows. */
  async deleteCommentAttachments(commentId: number): Promise<string[]> {
    const mitraId = getMitraId();
    const rows = await this.db.select().from(pipelineCardAttachments)
      .where(and(eq(pipelineCardAttachments.mitraId, mitraId), eq(pipelineCardAttachments.commentId, commentId)));
    const paths = rows.map((r) => r.filePath).filter(Boolean) as string[];
    if (rows.length) {
      await this.db.delete(pipelineCardAttachments)
        .where(and(eq(pipelineCardAttachments.mitraId, mitraId), eq(pipelineCardAttachments.commentId, commentId)));
    }
    return paths;
  }

  async addCardAttachment(data: {
    cardId: number; commentId?: number | null; pipelineId: number; fileName: string; filePath: string;
    mimeType: string; sizeBytes: number; kind: string; uploadedBy: number;
  }): Promise<PipelineCardAttachment> {
    const mitraId = getMitraId();
    const now = new Date().toISOString();
    const result = await this.db.insert(pipelineCardAttachments).values({
      mitraId, cardId: data.cardId, commentId: data.commentId ?? null, pipelineId: data.pipelineId,
      fileName: data.fileName, filePath: data.filePath, mimeType: data.mimeType,
      sizeBytes: data.sizeBytes, kind: data.kind, uploadedBy: data.uploadedBy, createdAt: now,
    } as any);
    const insertId = Number((result[0] as any).insertId);
    await this.logCardActivity(data.cardId, data.uploadedBy, "attachment_added", { fileName: data.fileName });
    const [row] = await this.db.select().from(pipelineCardAttachments)
      .where(and(eq(pipelineCardAttachments.id, insertId), eq(pipelineCardAttachments.mitraId, mitraId)));
    return row!;
  }

  async listCardAttachments(cardId: number): Promise<PipelineCardAttachment[]> {
    const mitraId = getMitraId();
    return this.db.select().from(pipelineCardAttachments)
      .where(and(
        eq(pipelineCardAttachments.mitraId, mitraId),
        eq(pipelineCardAttachments.cardId, cardId),
        isNull(pipelineCardAttachments.commentId),
      ))
      .orderBy(desc(pipelineCardAttachments.id));
  }

  /** All comment-linked attachments for a card, grouped by commentId. One query. */
  async getAttachmentsByCardGrouped(cardId: number): Promise<Map<number, PipelineCardAttachment[]>> {
    const mitraId = getMitraId();
    const rows = await this.db.select().from(pipelineCardAttachments)
      .where(and(
        eq(pipelineCardAttachments.mitraId, mitraId),
        eq(pipelineCardAttachments.cardId, cardId),
        isNotNull(pipelineCardAttachments.commentId),
      ))
      .orderBy(asc(pipelineCardAttachments.id));
    const map = new Map<number, PipelineCardAttachment[]>();
    for (const r of rows) {
      const cid = (r as any).commentId as number;
      if (!map.has(cid)) map.set(cid, []);
      map.get(cid)!.push(r);
    }
    return map;
  }

  async getCardAttachment(id: number): Promise<PipelineCardAttachment | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(pipelineCardAttachments)
      .where(and(eq(pipelineCardAttachments.id, id), eq(pipelineCardAttachments.mitraId, mitraId)));
    return row;
  }

  async deleteCardAttachment(id: number, actorId: number): Promise<number> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(pipelineCardAttachments)
      .where(and(eq(pipelineCardAttachments.id, id), eq(pipelineCardAttachments.mitraId, mitraId)));
    if (!row) return 0;
    const result: any = await this.db.delete(pipelineCardAttachments)
      .where(and(eq(pipelineCardAttachments.id, id), eq(pipelineCardAttachments.mitraId, mitraId)));
    await this.logCardActivity(row.cardId, actorId, "attachment_removed", { fileName: row.fileName });
    return Number(result?.[0]?.affectedRows ?? 0);
  }

  async getCommentPhotoMeta(id: number): Promise<{ id: number; cardId: number; photoPath: string | null; mitraId: number } | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db
      .select({
        id: pipelineCardComments.id,
        cardId: pipelineCardComments.cardId,
        photoPath: pipelineCardComments.photoPath,
        mitraId: pipelineCardComments.mitraId,
      })
      .from(pipelineCardComments)
      .where(and(eq(pipelineCardComments.id, id), eq(pipelineCardComments.mitraId, mitraId)));
    return row;
  }

  async getCommentCardId(commentId: number): Promise<number | null> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(pipelineCardComments)
      .where(and(eq(pipelineCardComments.id, commentId), eq(pipelineCardComments.mitraId, mitraId)));
    return row?.cardId ?? null;
  }

  async listActivity(cardId: number): Promise<PipelineCardActivity[]> {
    const mitraId = getMitraId();
    return this.db.select().from(pipelineCardActivity)
      .where(and(eq(pipelineCardActivity.mitraId, mitraId), eq(pipelineCardActivity.cardId, cardId)))
      .orderBy(asc(pipelineCardActivity.createdAt), asc(pipelineCardActivity.id));
  }

  async listFollowers(cardId: number): Promise<PipelineCardFollower[]> {
    const mitraId = getMitraId();
    return this.db.select().from(pipelineCardFollowers)
      .where(and(eq(pipelineCardFollowers.mitraId, mitraId), eq(pipelineCardFollowers.cardId, cardId)));
  }

  async addFollower(cardId: number, userId: number, actorId: number): Promise<void> {
    const mitraId = getMitraId();
    const existing = await this.db.select().from(pipelineCardFollowers)
      .where(and(eq(pipelineCardFollowers.mitraId, mitraId), eq(pipelineCardFollowers.cardId, cardId), eq(pipelineCardFollowers.userId, userId)));
    if (existing.length > 0) return;
    await this.db.insert(pipelineCardFollowers).values({
      mitraId, cardId, userId, createdAt: new Date().toISOString(),
    } as any);
    await this.logCardActivity(cardId, actorId, "follower_added", { userId });
  }

  async removeFollower(cardId: number, userId: number, actorId: number): Promise<void> {
    const mitraId = getMitraId();
    const existing = await this.db.select().from(pipelineCardFollowers)
      .where(and(eq(pipelineCardFollowers.mitraId, mitraId), eq(pipelineCardFollowers.cardId, cardId), eq(pipelineCardFollowers.userId, userId)));
    if (existing.length === 0) return;
    await this.db.delete(pipelineCardFollowers)
      .where(and(eq(pipelineCardFollowers.mitraId, mitraId), eq(pipelineCardFollowers.cardId, cardId), eq(pipelineCardFollowers.userId, userId)));
    await this.logCardActivity(cardId, actorId, "follower_removed", { userId });
  }

  async listCardAssignees(cardId: number): Promise<PipelineCardAssignee[]> {
    const mitraId = getMitraId();
    return this.db.select().from(pipelineCardAssignees)
      .where(and(eq(pipelineCardAssignees.mitraId, mitraId), eq(pipelineCardAssignees.cardId, cardId)));
  }

  async addCardAssignee(cardId: number, userId: number, actorId: number): Promise<void> {
    const mitraId = getMitraId();
    const existing = await this.db.select().from(pipelineCardAssignees)
      .where(and(eq(pipelineCardAssignees.mitraId, mitraId), eq(pipelineCardAssignees.cardId, cardId), eq(pipelineCardAssignees.userId, userId)));
    if (existing.length > 0) return;
    await this.db.insert(pipelineCardAssignees).values({ mitraId, cardId, userId, createdAt: new Date().toISOString() } as any);
    await this.logCardActivity(cardId, actorId, "assignee_added", { userId });
  }

  async removeCardAssignee(cardId: number, userId: number, actorId: number): Promise<void> {
    const mitraId = getMitraId();
    const existing = await this.db.select().from(pipelineCardAssignees)
      .where(and(eq(pipelineCardAssignees.mitraId, mitraId), eq(pipelineCardAssignees.cardId, cardId), eq(pipelineCardAssignees.userId, userId)));
    if (existing.length === 0) return;
    await this.db.delete(pipelineCardAssignees)
      .where(and(eq(pipelineCardAssignees.mitraId, mitraId), eq(pipelineCardAssignees.cardId, cardId), eq(pipelineCardAssignees.userId, userId)));
    await this.logCardActivity(cardId, actorId, "assignee_removed", { userId });
  }

  /** cardId -> secondary userIds[], batched for the board (anti-N+1). Mitra-scoped. */
  async getSecondaryAssigneesForCards(cardIds: number[]): Promise<Map<number, number[]>> {
    const map = new Map<number, number[]>();
    if (cardIds.length === 0) return map;
    const mitraId = getMitraId();
    const rows = await this.db.select().from(pipelineCardAssignees)
      .where(and(eq(pipelineCardAssignees.mitraId, mitraId), inArray(pipelineCardAssignees.cardId, cardIds)));
    for (const r of rows) {
      const arr = map.get(r.cardId) ?? [];
      arr.push(r.userId);
      map.set(r.cardId, arr);
    }
    return map;
  }

  // ==================== TEAMSPACE (v5.0 Fase 1) ====================
  // Tim internal + board tugas di atas engine pipelines (PRD-JABNET-TEAMSPACE.md).

  /** Semua tim di mitra aktif (untuk admin / pemegang teams:write). */
  async listTeams(includeArchived = false): Promise<Team[]> {
    const mitraId = getMitraId();
    const conds = [eq(teams.mitraId, mitraId)];
    if (!includeArchived) conds.push(isNull(teams.archivedAt));
    return this.db.select().from(teams).where(and(...conds)).orderBy(asc(teams.name));
  }

  /** Search All (gaya Cicle): cari tim + kartu board tim + dokumen tim - scoped keanggotaan.
   *  Kartu Rahasia hanya muncul untuk creator/penanggung jawab/admin. */
  async searchTeamspace(userId: number, q: string, opts?: { isAdmin?: boolean; limit?: number }): Promise<{
    teams: Array<{ id: number; name: string; color: string; icon: string | null; type: string }>;
    cards: Array<{ id: number; title: string; pipelineId: number; teamId: number; teamName: string }>;
    docs: Array<{ id: number; title: string; teamId: number; teamName: string }>;
  }> {
    const mitraId = getMitraId();
    const limit = Math.min(Math.max(opts?.limit ?? 6, 1), 20);
    const needle = q.toLowerCase();
    const pat = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const myTeams = opts?.isAdmin ? await this.listTeams(false) : await this.listTeamsForUser(userId, false);
    const teamNameById = new Map(myTeams.map((t) => [t.id, t.name]));
    const result = {
      teams: myTeams
        .filter((t) => `${t.name} ${t.description ?? ""}`.toLowerCase().includes(needle))
        .slice(0, limit)
        .map((t) => ({ id: t.id, name: t.name, color: t.color, icon: t.icon, type: t.type })),
      cards: [] as Array<{ id: number; title: string; pipelineId: number; teamId: number; teamName: string }>,
      docs: [] as Array<{ id: number; title: string; teamId: number; teamName: string }>,
    };
    const teamIds = myTeams.map((t) => t.id);
    if (teamIds.length === 0) return result;

    const boards = await this.db
      .select({ id: pipelines.id, teamId: pipelines.teamId })
      .from(pipelines)
      .where(and(eq(pipelines.mitraId, mitraId), inArray(pipelines.teamId, teamIds)));
    const teamByBoard = new Map(boards.map((b) => [b.id, b.teamId as number]));
    if (boards.length > 0) {
      const rows = await this.db
        .select({
          id: pipelineCards.id, title: pipelineCards.title, pipelineId: pipelineCards.pipelineId,
          isPrivate: pipelineCards.isPrivate, createdBy: pipelineCards.createdBy, assigneeId: pipelineCards.assigneeId,
        })
        .from(pipelineCards)
        .where(and(
          eq(pipelineCards.mitraId, mitraId),
          inArray(pipelineCards.pipelineId, boards.map((b) => b.id)),
          isNull(pipelineCards.archivedAt),
          like(pipelineCards.title, pat),
        ))
        .orderBy(desc(pipelineCards.id))
        .limit(limit * 4);
      result.cards = rows
        .filter((c) => !c.isPrivate || opts?.isAdmin || c.createdBy === userId || c.assigneeId === userId)
        .slice(0, limit)
        .map((c) => {
          const teamId = teamByBoard.get(c.pipelineId)!;
          return { id: c.id, title: c.title, pipelineId: c.pipelineId, teamId, teamName: teamNameById.get(teamId) ?? "" };
        });
    }

    const docRows = await this.db
      .select({ id: teamDocuments.id, title: teamDocuments.title, teamId: teamDocuments.teamId, isConfidential: teamDocuments.isConfidential, createdBy: teamDocuments.createdBy })
      .from(teamDocuments)
      .where(and(
        eq(teamDocuments.mitraId, mitraId),
        inArray(teamDocuments.teamId, teamIds),
        isNull(teamDocuments.archivedAt),
        like(teamDocuments.title, pat),
      ))
      .orderBy(desc(teamDocuments.updatedAt))
      .limit(limit * 2);
    result.docs = docRows
      // Dokumen Rahasia disembunyikan dari search kecuali pembuat/admin (aman-by-default,
      // penerima Rahasia tetap bisa akses lewat tab Dokumen).
      .filter((d) => !d.isConfidential || opts?.isAdmin || d.createdBy === userId)
      .slice(0, limit)
      .map((d) => ({ id: d.id, title: d.title, teamId: d.teamId, teamName: teamNameById.get(d.teamId) ?? "" }));
    return result;
  }

  /** Tim yang user ikuti, plus role membership-nya. */
  async listTeamsForUser(userId: number, includeArchived = false): Promise<Array<Team & { myRole: string }>> {
    const mitraId = getMitraId();
    const conds = [eq(teams.mitraId, mitraId), eq(teamMembers.userId, userId)];
    if (!includeArchived) conds.push(isNull(teams.archivedAt));
    const rows = await this.db
      .select({ team: teams, myRole: teamMembers.role })
      .from(teams)
      .innerJoin(teamMembers, eq(teamMembers.teamId, teams.id))
      .where(and(...conds))
      .orderBy(asc(teams.name));
    return rows.map((r) => ({ ...r.team, myRole: r.myRole }));
  }

  async getTeam(id: number): Promise<Team | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(teams)
      .where(and(eq(teams.id, id), eq(teams.mitraId, mitraId)));
    return row;
  }

  /** Tim pemilik sebuah pipeline (untuk resolusi kapabilitas board tim). */
  async getTeamByPipelineId(pipelineId: number): Promise<Team | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(teams)
      .where(and(eq(teams.taskPipelineId, pipelineId), eq(teams.mitraId, mitraId)));
    return row;
  }

  async getTeamMembership(teamId: number, userId: number): Promise<TeamMember | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId), eq(teamMembers.mitraId, mitraId)));
    return row;
  }

  /** Buat tim + provision board tugas (pipeline + 4 stage default Cicle-style) dalam satu alur.
   *  Pipeline tim ditandai team_id sehingga tersembunyi dari daftar pipeline ops (NFR-012). */
  async createTeam(
    data: { name: string; description?: string | null; icon?: string | null; color?: string | null; type?: string | null; parentId?: number | null },
    userId: number,
  ): Promise<Team> {
    const mitraId = getMitraId();
    const now = new Date().toISOString();
    const type = data.type === "PROJECT" ? "PROJECT" : "TEAM";
    const teamResult = await this.db.insert(teams).values({
      mitraId, name: data.name, description: data.description ?? null,
      icon: data.icon ?? null, color: data.color ?? "#8B5CF6", type,
      parentId: data.parentId ?? null,                      // FR-302: nested tree
      enabledViews: JSON.stringify(TEAM_DEFAULT_VIEWS),
      createdBy: userId, createdAt: now,
    } as any);
    const teamId = Number((teamResult[0] as any).insertId);

    // Board tugas: pipeline milik tim (ikon/warna mengikuti tim).
    const pipeline = await this.createPipeline(
      { name: `Tugas - ${data.name}`, description: `Board tugas tim ${data.name}`, color: data.color ?? "#8B5CF6", icon: data.icon ?? "ClipboardList" },
      userId,
    );
    await this.db.update(pipelines).set({ teamId })
      .where(and(eq(pipelines.id, pipeline.id), eq(pipelines.mitraId, mitraId)));
    for (let i = 0; i < TEAM_TASK_DEFAULT_STAGES.length; i++) {
      const s = TEAM_TASK_DEFAULT_STAGES[i];
      await this.db.insert(pipelineStages).values({
        mitraId, pipelineId: pipeline.id, label: s.label, color: s.color,
        semanticType: s.semanticType, position: i, createdAt: now,
      } as any);
    }
    await this.db.update(teams).set({ taskPipelineId: pipeline.id, updatedAt: now })
      .where(and(eq(teams.id, teamId), eq(teams.mitraId, mitraId)));

    // Pembuat otomatis jadi manager tim.
    await this.db.insert(teamMembers).values({ mitraId, teamId, userId, role: "manager", joinedAt: now } as any);

    const [row] = await this.db.select().from(teams).where(and(eq(teams.id, teamId), eq(teams.mitraId, mitraId)));
    return row!;
  }

  async updateTeam(
    id: number,
    data: { name?: string; description?: string | null; icon?: string | null; color?: string | null; type?: string; enabledViews?: string[]; parentId?: number | null },
  ): Promise<Team> {
    const mitraId = getMitraId();
    const before = await this.getTeam(id);
    if (!before) throw new Error("Tim tidak ditemukan");
    const patch: any = { updatedAt: new Date().toISOString() };
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description;
    if (data.icon !== undefined) patch.icon = data.icon;
    if (data.color !== undefined) patch.color = data.color;
    if (data.type !== undefined) patch.type = data.type === "PROJECT" ? "PROJECT" : "TEAM";
    if (data.enabledViews !== undefined) patch.enabledViews = JSON.stringify(data.enabledViews);
    if (data.parentId !== undefined) patch.parentId = data.parentId;   // FR-302
    await this.db.update(teams).set(patch).where(and(eq(teams.id, id), eq(teams.mitraId, mitraId)));
    // Sinkronkan kosmetik board dengan tim.
    if (before.taskPipelineId && (data.name !== undefined || data.color !== undefined || data.icon !== undefined)) {
      const pipePatch: any = { updatedAt: patch.updatedAt };
      if (data.name !== undefined) pipePatch.name = `Tugas - ${data.name}`;
      if (data.color !== undefined && data.color !== null) pipePatch.color = data.color;
      if (data.icon !== undefined && data.icon !== null) pipePatch.icon = data.icon;
      await this.db.update(pipelines).set(pipePatch)
        .where(and(eq(pipelines.id, before.taskPipelineId), eq(pipelines.mitraId, mitraId)));
    }
    const [row] = await this.db.select().from(teams).where(and(eq(teams.id, id), eq(teams.mitraId, mitraId)));
    return row!;
  }

  async setTeamArchived(id: number, archived: boolean): Promise<void> {
    const mitraId = getMitraId();
    await this.db.update(teams)
      .set({ archivedAt: archived ? new Date().toISOString() : null, updatedAt: new Date().toISOString() })
      .where(and(eq(teams.id, id), eq(teams.mitraId, mitraId)));
  }

  async listTeamMembers(teamId: number): Promise<Array<{ userId: number; teamRole: string; joinedAt: string; name: string; username: string; isActive: number | null }>> {
    const mitraId = getMitraId();
    const rows = await this.db
      .select({
        userId: teamMembers.userId, teamRole: teamMembers.role, joinedAt: teamMembers.joinedAt,
        name: users.name, username: users.username, isActive: users.isActive,
      })
      .from(teamMembers)
      .innerJoin(users, eq(users.id, teamMembers.userId))
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.mitraId, mitraId)))
      .orderBy(asc(users.name));
    return rows as any;
  }

  async addTeamMember(teamId: number, userId: number, role: "manager" | "member"): Promise<void> {
    const mitraId = getMitraId();
    const existing = await this.getTeamMembership(teamId, userId);
    if (existing) {
      if (existing.role !== role) {
        await this.db.update(teamMembers).set({ role })
          .where(and(eq(teamMembers.id, existing.id), eq(teamMembers.mitraId, mitraId)));
      }
      return;
    }
    await this.db.insert(teamMembers).values({ mitraId, teamId, userId, role, joinedAt: new Date().toISOString() } as any);
  }

  async removeTeamMember(teamId: number, userId: number): Promise<void> {
    const mitraId = getMitraId();
    await this.db.delete(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId), eq(teamMembers.mitraId, mitraId)));
  }

  /** teamId -> jumlah anggota, batched (anti-N+1 untuk grid Tim Saya). */
  async getTeamMemberCounts(teamIds: number[]): Promise<Map<number, number>> {
    const map = new Map<number, number>();
    if (teamIds.length === 0) return map;
    const mitraId = getMitraId();
    const rows = await this.db.select({ teamId: teamMembers.teamId, c: count() }).from(teamMembers)
      .where(and(eq(teamMembers.mitraId, mitraId), inArray(teamMembers.teamId, teamIds)))
      .groupBy(teamMembers.teamId);
    for (const r of rows) map.set(r.teamId, Number(r.c));
    return map;
  }

  /** pipelineId -> ringkasan tugas {total, done, overdue}, batched. done = stage done ATAU isCompleted. */
  async getTeamTaskSummaries(pipelineIds: number[]): Promise<Map<number, { total: number; done: number; overdue: number }>> {
    const map = new Map<number, { total: number; done: number; overdue: number }>();
    if (pipelineIds.length === 0) return map;
    const mitraId = getMitraId();
    const stageRows = await this.db.select().from(pipelineStages)
      .where(and(eq(pipelineStages.mitraId, mitraId), inArray(pipelineStages.pipelineId, pipelineIds)));
    const doneStages = new Set(stageRows.filter((s) => (s as any).semanticType === "done" || (s as any).semanticType === "cancelled").map((s) => s.id));
    const cards = await this.db.select().from(pipelineCards)
      .where(and(eq(pipelineCards.mitraId, mitraId), inArray(pipelineCards.pipelineId, pipelineIds), isNull(pipelineCards.archivedAt)));
    const nowIso = new Date().toISOString();
    for (const pid of pipelineIds) map.set(pid, { total: 0, done: 0, overdue: 0 });
    for (const c of cards) {
      const agg = map.get(c.pipelineId)!;
      agg.total++;
      const isDone = (c as any).isCompleted === 1 || doneStages.has(c.stageId);
      if (isDone) agg.done++;
      else if (c.dueDate && c.dueDate < nowIso) agg.overdue++;
    }
    return map;
  }

  /** Kartu non-arsip lintas pipeline (agregasi "Semua Tugas"), batched inArray. */
  async listCardsForPipelines(pipelineIds: number[]): Promise<PipelineCard[]> {
    if (pipelineIds.length === 0) return [];
    const mitraId = getMitraId();
    return this.db.select().from(pipelineCards)
      .where(and(eq(pipelineCards.mitraId, mitraId), inArray(pipelineCards.pipelineId, pipelineIds), isNull(pipelineCards.archivedAt)))
      .orderBy(asc(pipelineCards.pipelineId), asc(pipelineCards.stageId), asc(pipelineCards.position), asc(pipelineCards.id));
  }

  /** pipelineId -> stages[], batched. */
  async listStagesForPipelines(pipelineIds: number[]): Promise<Map<number, PipelineStage[]>> {
    const map = new Map<number, PipelineStage[]>();
    if (pipelineIds.length === 0) return map;
    const mitraId = getMitraId();
    const rows = await this.db.select().from(pipelineStages)
      .where(and(eq(pipelineStages.mitraId, mitraId), inArray(pipelineStages.pipelineId, pipelineIds)))
      .orderBy(asc(pipelineStages.position), asc(pipelineStages.id));
    for (const r of rows) {
      const arr = map.get(r.pipelineId) ?? [];
      arr.push(r);
      map.set(r.pipelineId, arr);
    }
    return map;
  }

  /** cardId -> follower userIds[], batched (untuk filter kartu Rahasia). */
  async getFollowersForCards(cardIds: number[]): Promise<Map<number, number[]>> {
    const map = new Map<number, number[]>();
    if (cardIds.length === 0) return map;
    const mitraId = getMitraId();
    const rows = await this.db.select().from(pipelineCardFollowers)
      .where(and(eq(pipelineCardFollowers.mitraId, mitraId), inArray(pipelineCardFollowers.cardId, cardIds)));
    for (const r of rows) {
      const arr = map.get(r.cardId) ?? [];
      arr.push(r.userId);
      map.set(r.cardId, arr);
    }
    return map;
  }

  // -- Labels berwarna scoped per board (FR-413) --

  async listLabels(pipelineId: number): Promise<PipelineLabel[]> {
    const mitraId = getMitraId();
    return this.db.select().from(pipelineLabels)
      .where(and(eq(pipelineLabels.mitraId, mitraId), eq(pipelineLabels.pipelineId, pipelineId)))
      .orderBy(asc(pipelineLabels.position), asc(pipelineLabels.id));
  }

  async createLabel(pipelineId: number, data: { name: string; colorHex?: string }): Promise<PipelineLabel> {
    const mitraId = getMitraId();
    const existing = await this.listLabels(pipelineId);
    const maxPos = existing.reduce((m, l) => Math.max(m, l.position), -1);
    const result = await this.db.insert(pipelineLabels).values({
      mitraId, pipelineId, name: data.name, colorHex: data.colorHex ?? "#0EA5E9",
      position: maxPos + 1, createdAt: new Date().toISOString(),
    } as any);
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(pipelineLabels)
      .where(and(eq(pipelineLabels.id, insertId), eq(pipelineLabels.mitraId, mitraId)));
    return row!;
  }

  async getLabel(id: number): Promise<PipelineLabel | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(pipelineLabels)
      .where(and(eq(pipelineLabels.id, id), eq(pipelineLabels.mitraId, mitraId)));
    return row;
  }

  async updateLabel(id: number, data: { name?: string; colorHex?: string }): Promise<PipelineLabel> {
    const mitraId = getMitraId();
    const patch: any = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.colorHex !== undefined) patch.colorHex = data.colorHex;
    if (Object.keys(patch).length > 0) {
      await this.db.update(pipelineLabels).set(patch)
        .where(and(eq(pipelineLabels.id, id), eq(pipelineLabels.mitraId, mitraId)));
    }
    const [row] = await this.db.select().from(pipelineLabels)
      .where(and(eq(pipelineLabels.id, id), eq(pipelineLabels.mitraId, mitraId)));
    if (!row) throw new Error("Label tidak ditemukan");
    return row;
  }

  async deleteLabel(id: number): Promise<void> {
    const mitraId = getMitraId();
    await this.db.delete(cardLabels).where(eq(cardLabels.labelId, id));
    await this.db.delete(pipelineLabels)
      .where(and(eq(pipelineLabels.id, id), eq(pipelineLabels.mitraId, mitraId)));
  }

  /** Replace seluruh label sebuah kartu (validasi scope pipeline dilakukan caller). */
  async setCardLabels(cardId: number, labelIds: number[], actorId: number): Promise<void> {
    await this.db.delete(cardLabels).where(eq(cardLabels.cardId, cardId));
    for (const labelId of labelIds) {
      await this.db.insert(cardLabels).values({ cardId, labelId } as any);
    }
    await this.logCardActivity(cardId, actorId, "labels_changed", { labelIds });
  }

  /** cardId -> label[], batched untuk board/list view. */
  async getLabelsForCards(cardIds: number[]): Promise<Map<number, PipelineLabel[]>> {
    const map = new Map<number, PipelineLabel[]>();
    if (cardIds.length === 0) return map;
    const rows = await this.db
      .select({ cardId: cardLabels.cardId, label: pipelineLabels })
      .from(cardLabels)
      .innerJoin(pipelineLabels, eq(pipelineLabels.id, cardLabels.labelId))
      .where(inArray(cardLabels.cardId, cardIds));
    for (const r of rows) {
      const arr = map.get(r.cardId) ?? [];
      arr.push(r.label);
      map.set(r.cardId, arr);
    }
    return map;
  }

  // -- Checklist bertingkat (FR-406) --

  async listChecklistsForCard(cardId: number): Promise<Array<CardChecklist & { items: CardChecklistItem[] }>> {
    const mitraId = getMitraId();
    const lists = await this.db.select().from(cardChecklists)
      .where(and(eq(cardChecklists.mitraId, mitraId), eq(cardChecklists.cardId, cardId)))
      .orderBy(asc(cardChecklists.position), asc(cardChecklists.id));
    if (lists.length === 0) return [];
    const items = await this.db.select().from(cardChecklistItems)
      .where(inArray(cardChecklistItems.checklistId, lists.map((l) => l.id)))
      .orderBy(asc(cardChecklistItems.position), asc(cardChecklistItems.id));
    const byList = new Map<number, CardChecklistItem[]>();
    for (const it of items) {
      const arr = byList.get(it.checklistId) ?? [];
      arr.push(it);
      byList.set(it.checklistId, arr);
    }
    return lists.map((l) => ({ ...l, items: byList.get(l.id) ?? [] }));
  }

  async getChecklist(id: number): Promise<CardChecklist | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(cardChecklists)
      .where(and(eq(cardChecklists.id, id), eq(cardChecklists.mitraId, mitraId)));
    return row;
  }

  async createChecklist(cardId: number, title: string, actorId: number): Promise<CardChecklist> {
    const mitraId = getMitraId();
    const existing = await this.db.select().from(cardChecklists)
      .where(and(eq(cardChecklists.mitraId, mitraId), eq(cardChecklists.cardId, cardId)));
    const maxPos = existing.reduce((m, l) => Math.max(m, l.position), -1);
    const result = await this.db.insert(cardChecklists).values({
      mitraId, cardId, title, position: maxPos + 1, createdAt: new Date().toISOString(),
    } as any);
    const insertId = Number((result[0] as any).insertId);
    await this.logCardActivity(cardId, actorId, "checklist_added", { title });
    const [row] = await this.db.select().from(cardChecklists)
      .where(and(eq(cardChecklists.id, insertId), eq(cardChecklists.mitraId, mitraId)));
    return row!;
  }

  async updateChecklist(id: number, title: string): Promise<void> {
    const mitraId = getMitraId();
    await this.db.update(cardChecklists).set({ title })
      .where(and(eq(cardChecklists.id, id), eq(cardChecklists.mitraId, mitraId)));
  }

  async deleteChecklist(id: number): Promise<void> {
    const mitraId = getMitraId();
    await this.db.delete(cardChecklistItems).where(eq(cardChecklistItems.checklistId, id));
    await this.db.delete(cardChecklists)
      .where(and(eq(cardChecklists.id, id), eq(cardChecklists.mitraId, mitraId)));
  }

  async getChecklistItem(id: number): Promise<CardChecklistItem | undefined> {
    const [row] = await this.db.select().from(cardChecklistItems).where(eq(cardChecklistItems.id, id));
    return row;
  }

  async addChecklistItem(checklistId: number, text: string): Promise<CardChecklistItem> {
    const existing = await this.db.select().from(cardChecklistItems)
      .where(eq(cardChecklistItems.checklistId, checklistId));
    const maxPos = existing.reduce((m, i) => Math.max(m, i.position), -1);
    const result = await this.db.insert(cardChecklistItems).values({
      checklistId, text, isChecked: 0, position: maxPos + 1, createdAt: new Date().toISOString(),
    } as any);
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(cardChecklistItems).where(eq(cardChecklistItems.id, insertId));
    return row!;
  }

  async updateChecklistItem(id: number, data: { text?: string; isChecked?: boolean }): Promise<void> {
    const patch: any = {};
    if (data.text !== undefined) patch.text = data.text;
    if (data.isChecked !== undefined) patch.isChecked = data.isChecked ? 1 : 0;
    if (Object.keys(patch).length === 0) return;
    await this.db.update(cardChecklistItems).set(patch).where(eq(cardChecklistItems.id, id));
  }

  async deleteChecklistItem(id: number): Promise<void> {
    await this.db.delete(cardChecklistItems).where(eq(cardChecklistItems.id, id));
  }

  /** cardId -> {done,total} progres checklist, batched untuk badge board. */
  async getChecklistProgressForCards(cardIds: number[]): Promise<Map<number, { done: number; total: number }>> {
    const map = new Map<number, { done: number; total: number }>();
    if (cardIds.length === 0) return map;
    const mitraId = getMitraId();
    const lists = await this.db.select().from(cardChecklists)
      .where(and(eq(cardChecklists.mitraId, mitraId), inArray(cardChecklists.cardId, cardIds)));
    if (lists.length === 0) return map;
    const listToCard = new Map(lists.map((l) => [l.id, l.cardId]));
    const items = await this.db.select().from(cardChecklistItems)
      .where(inArray(cardChecklistItems.checklistId, lists.map((l) => l.id)));
    for (const it of items) {
      const cardId = listToCard.get(it.checklistId);
      if (cardId == null) continue;
      const agg = map.get(cardId) ?? { done: 0, total: 0 };
      agg.total++;
      if (it.isChecked === 1) agg.done++;
      map.set(cardId, agg);
    }
    return map;
  }

  // -- Ekstensi kartu (FR-405/409/414) --

  async setCardCompleted(cardId: number, completed: boolean, userId: number): Promise<PipelineCard> {
    const mitraId = getMitraId();
    const now = new Date().toISOString();
    await this.db.update(pipelineCards)
      .set({ isCompleted: completed ? 1 : 0, completedAt: completed ? now : null, updatedAt: now, updatedBy: userId } as any)
      .where(and(eq(pipelineCards.id, cardId), eq(pipelineCards.mitraId, mitraId)));
    await this.logCardActivity(cardId, userId, completed ? "completed" : "uncompleted");
    const [row] = await this.db.select().from(pipelineCards)
      .where(and(eq(pipelineCards.id, cardId), eq(pipelineCards.mitraId, mitraId)));
    return row!;
  }

  async setCardPrivate(cardId: number, isPrivate: boolean, userId: number): Promise<PipelineCard> {
    const mitraId = getMitraId();
    await this.db.update(pipelineCards)
      .set({ isPrivate: isPrivate ? 1 : 0, updatedAt: new Date().toISOString(), updatedBy: userId } as any)
      .where(and(eq(pipelineCards.id, cardId), eq(pipelineCards.mitraId, mitraId)));
    await this.logCardActivity(cardId, userId, isPrivate ? "made_private" : "made_public");
    const [row] = await this.db.select().from(pipelineCards)
      .where(and(eq(pipelineCards.id, cardId), eq(pipelineCards.mitraId, mitraId)));
    return row!;
  }

  async setCardArchived(cardId: number, archived: boolean, userId: number): Promise<void> {
    const mitraId = getMitraId();
    await this.db.update(pipelineCards)
      .set({ archivedAt: archived ? new Date().toISOString() : null, updatedAt: new Date().toISOString(), updatedBy: userId } as any)
      .where(and(eq(pipelineCards.id, cardId), eq(pipelineCards.mitraId, mitraId)));
    await this.logCardActivity(cardId, userId, archived ? "archived" : "unarchived");
  }

  /** BUG-007: set/hapus cover image kartu (path relatif JABNET_UPLOAD_ROOT, NULL = hapus). */
  async setCardCover(cardId: number, coverPath: string | null, userId: number): Promise<void> {
    const mitraId = getMitraId();
    await this.db.update(pipelineCards)
      .set({ coverPath, updatedAt: new Date().toISOString(), updatedBy: userId } as any)
      .where(and(eq(pipelineCards.id, cardId), eq(pipelineCards.mitraId, mitraId)));
    await this.logCardActivity(cardId, userId, coverPath ? "cover_set" : "cover_removed");
  }

  async listArchivedCards(pipelineId: number): Promise<PipelineCard[]> {
    const mitraId = getMitraId();
    return this.db.select().from(pipelineCards)
      .where(and(eq(pipelineCards.mitraId, mitraId), eq(pipelineCards.pipelineId, pipelineId), isNotNull(pipelineCards.archivedAt)))
      .orderBy(desc(pipelineCards.archivedAt));
  }

  /** Salin kartu (FR-409): field dasar + label + checklist + secondary assignees + custom values.
   *  Komentar/lampiran/aktivitas TIDAK ikut (konsisten Trello/Cicle). */
  async duplicateCard(cardId: number, userId: number): Promise<PipelineCard> {
    const mitraId = getMitraId();
    const src = await this.getCard(cardId);
    if (!src) throw new Error("Kartu tidak ditemukan");
    const copy = await this.createCard(src.pipelineId, {
      stageId: src.stageId,
      title: `${src.title} (salinan)`,
      description: src.description ?? undefined,
      assigneeId: src.assigneeId ?? null,
      priority: src.priority,
      dueDate: src.dueDate ?? null,
      tags: src.tags ? (JSON.parse(src.tags) as string[]) : null,
    }, userId);
    // isPrivate ikut disalin (kartu rahasia tetap rahasia).
    if ((src as any).isPrivate === 1) {
      await this.db.update(pipelineCards).set({ isPrivate: 1 } as any)
        .where(and(eq(pipelineCards.id, copy.id), eq(pipelineCards.mitraId, mitraId)));
    }
    // Secondary assignees
    const secondary = await this.listCardAssignees(cardId);
    for (const a of secondary) {
      await this.db.insert(pipelineCardAssignees).values({ mitraId, cardId: copy.id, userId: a.userId, createdAt: new Date().toISOString() } as any);
    }
    // Labels
    const labelRows = await this.db.select().from(cardLabels).where(eq(cardLabels.cardId, cardId));
    for (const l of labelRows) {
      await this.db.insert(cardLabels).values({ cardId: copy.id, labelId: l.labelId } as any);
    }
    // Checklists + items
    const lists = await this.listChecklistsForCard(cardId);
    for (const l of lists) {
      const newList = await this.createChecklist(copy.id, l.title, userId);
      for (const it of l.items) {
        const created = await this.addChecklistItem(newList.id, it.text);
        if (it.isChecked === 1) await this.updateChecklistItem(created.id, { isChecked: true });
      }
    }
    // Custom field values
    const values = await this.db.select().from(pipelineCardValues)
      .where(and(eq(pipelineCardValues.mitraId, mitraId), eq(pipelineCardValues.cardId, cardId)));
    for (const v of values) {
      await this.db.insert(pipelineCardValues).values({
        mitraId, cardId: copy.id, fieldId: v.fieldId, value: v.value, createdAt: new Date().toISOString(),
      } as any);
    }
    await this.logCardActivity(copy.id, userId, "duplicated_from", { sourceCardId: cardId });
    const [row] = await this.db.select().from(pipelineCards)
      .where(and(eq(pipelineCards.id, copy.id), eq(pipelineCards.mitraId, mitraId)));
    return row!;
  }

  /** FR-408 "Ulangi": set aturan pengulangan kartu (JSON {freq,interval} atau NULL). */
  async setCardRecurrence(cardId: number, recurrenceJson: string | null, userId: number): Promise<void> {
    const mitraId = getMitraId();
    await this.db.update(pipelineCards)
      .set({ recurrenceRule: recurrenceJson, updatedAt: new Date().toISOString(), updatedBy: userId } as any)
      .where(and(eq(pipelineCards.id, cardId), eq(pipelineCards.mitraId, mitraId)));
    await this.logCardActivity(cardId, userId, "recurrence_changed", { rule: recurrenceJson });
  }

  /** FR-408: saat kartu berulang ditandai selesai → buat instance berikutnya.
   *  Instance baru: salinan (label/checklist/assignee/values) TANPA status selesai,
   *  checklist di-reset unchecked, tenggat digeser sesuai aturan, rule ikut terbawa. */
  async spawnRecurringCard(cardId: number, userId: number): Promise<PipelineCard | null> {
    const mitraId = getMitraId();
    const src = await this.getCard(cardId);
    if (!src || !(src as any).recurrenceRule) return null;
    let rule: { freq?: string; interval?: number } = {};
    try { rule = JSON.parse((src as any).recurrenceRule); } catch { return null; }
    const freq = rule.freq;
    if (freq !== "daily" && freq !== "weekly" && freq !== "monthly") return null;
    const interval = Number.isInteger(rule.interval) && (rule.interval as number) >= 1 ? (rule.interval as number) : 1;

    const base = src.dueDate ? new Date(src.dueDate) : new Date();
    let nextDue: Date;
    if (freq === "daily") nextDue = new Date(base.getTime() + interval * 86400_000);
    else if (freq === "weekly") nextDue = new Date(base.getTime() + interval * 7 * 86400_000);
    else {
      // monthly: tanggal sama bulan+interval; clamp ke akhir bulan bila tanggal tidak ada.
      const y = base.getFullYear(); const mo = base.getMonth() + interval;
      const lastDay = new Date(y, mo + 1, 0).getDate();
      nextDue = new Date(y, mo, Math.min(base.getDate(), lastDay), base.getHours(), base.getMinutes());
    }

    const copy = await this.duplicateCard(cardId, userId);
    const strippedTitle = copy.title.endsWith(" (salinan)") ? copy.title.slice(0, -" (salinan)".length) : copy.title;
    await this.db.update(pipelineCards).set({
      title: strippedTitle,
      dueDate: nextDue.toISOString(),
      isCompleted: 0, completedAt: null,
      recurrenceRule: (src as any).recurrenceRule,
      updatedAt: new Date().toISOString(), updatedBy: userId,
    } as any).where(and(eq(pipelineCards.id, copy.id), eq(pipelineCards.mitraId, mitraId)));
    // Reset checklist instance baru → unchecked semua.
    const lists = await this.db.select().from(cardChecklists)
      .where(and(eq(cardChecklists.mitraId, mitraId), eq(cardChecklists.cardId, copy.id)));
    if (lists.length > 0) {
      await this.db.update(cardChecklistItems).set({ isChecked: 0 } as any)
        .where(inArray(cardChecklistItems.checklistId, lists.map((l) => l.id)));
    }
    await this.logCardActivity(copy.id, userId, "recurring_spawned", { fromCardId: cardId, freq, interval });
    const [row] = await this.db.select().from(pipelineCards)
      .where(and(eq(pipelineCards.id, copy.id), eq(pipelineCards.mitraId, mitraId)));
    return row!;
  }

  // -- Teamspace Fase 2: Chat Grup (FR-5xx) --

  /** Pesan chat tim, cursor pagination mundur (beforeId) - hasil urut ASC untuk render. */
  async listChatMessages(teamId: number, opts?: { beforeId?: number; limit?: number }): Promise<TeamChatMessage[]> {
    const mitraId = getMitraId();
    const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);
    const conds = [eq(teamChatMessages.mitraId, mitraId), eq(teamChatMessages.teamId, teamId)];
    if (opts?.beforeId) conds.push(sql`${teamChatMessages.id} < ${opts.beforeId}` as any);
    const rows = await this.db.select().from(teamChatMessages)
      .where(and(...conds))
      .orderBy(desc(teamChatMessages.id))
      .limit(limit);
    return rows.reverse();
  }

  async getChatMessage(id: number): Promise<TeamChatMessage | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(teamChatMessages)
      .where(and(eq(teamChatMessages.id, id), eq(teamChatMessages.mitraId, mitraId)));
    return row;
  }

  async addChatMessage(data: {
    teamId: number; senderId: number; body?: string | null; replyToId?: number | null;
    attachmentPath?: string | null; attachmentName?: string | null; attachmentMime?: string | null; attachmentSize?: number | null;
  }): Promise<TeamChatMessage> {
    const mitraId = getMitraId();
    const result = await this.db.insert(teamChatMessages).values({
      mitraId, teamId: data.teamId, senderId: data.senderId,
      body: data.body ?? null, replyToId: data.replyToId ?? null,
      attachmentPath: data.attachmentPath ?? null, attachmentName: data.attachmentName ?? null,
      attachmentMime: data.attachmentMime ?? null, attachmentSize: data.attachmentSize ?? null,
      createdAt: new Date().toISOString(),
    } as any);
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(teamChatMessages)
      .where(and(eq(teamChatMessages.id, insertId), eq(teamChatMessages.mitraId, mitraId)));
    return row!;
  }

  /** Soft delete - bubble tetap tampil sebagai "pesan dihapus". */
  async softDeleteChatMessage(id: number): Promise<void> {
    const mitraId = getMitraId();
    await this.db.update(teamChatMessages)
      .set({ deletedAt: new Date().toISOString(), body: null, attachmentPath: null, attachmentName: null, attachmentMime: null, attachmentSize: null } as any)
      .where(and(eq(teamChatMessages.id, id), eq(teamChatMessages.mitraId, mitraId)));
  }

  /** Panel Media (FR-504): semua pesan ber-lampiran, terbaru dulu. */
  async listChatMedia(teamId: number, limit = 200): Promise<TeamChatMessage[]> {
    const mitraId = getMitraId();
    return this.db.select().from(teamChatMessages)
      .where(and(
        eq(teamChatMessages.mitraId, mitraId), eq(teamChatMessages.teamId, teamId),
        isNotNull(teamChatMessages.attachmentPath), isNull(teamChatMessages.deletedAt),
      ))
      .orderBy(desc(teamChatMessages.id))
      .limit(limit);
  }

  /** Tandai chat tim terbaca (unread marker per anggota). */
  async markChatRead(teamId: number, userId: number): Promise<void> {
    const mitraId = getMitraId();
    await this.db.update(teamMembers).set({ lastReadChatAt: new Date().toISOString() })
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId), eq(teamMembers.mitraId, mitraId)));
  }

  /** Read-by gaya Cicle: lastReadChatAt tiap anggota - client hitung siapa sudah baca pesan mana. */
  async getChatReadStates(teamId: number): Promise<Array<{ userId: number; name: string; lastReadChatAt: string | null }>> {
    const mitraId = getMitraId();
    const rows = await this.db
      .select({ userId: teamMembers.userId, name: users.name, lastReadChatAt: teamMembers.lastReadChatAt })
      .from(teamMembers)
      .innerJoin(users, eq(users.id, teamMembers.userId))
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.mitraId, mitraId)));
    return rows as any;
  }

  /** teamId -> jumlah pesan belum dibaca (pesan orang lain setelah lastReadChatAt), batched. */
  async getUnreadChatCounts(userId: number, teamIds: number[]): Promise<Map<number, number>> {
    const map = new Map<number, number>();
    if (teamIds.length === 0) return map;
    const mitraId = getMitraId();
    const placeholders = teamIds.map(() => "?").join(",");
    const [rows]: any = await this.pool.execute(
      `SELECT m.team_id AS teamId, COUNT(*) AS c
       FROM team_chat_messages m
       JOIN team_members tm ON tm.team_id = m.team_id AND tm.user_id = ? AND tm.mitra_id = ?
       WHERE m.mitra_id = ? AND m.team_id IN (${placeholders})
         AND m.deleted_at IS NULL AND m.sender_id <> ?
         AND (tm.last_read_chat_at IS NULL OR m.created_at > tm.last_read_chat_at)
       GROUP BY m.team_id`,
      [userId, mitraId, mitraId, ...teamIds, userId],
    );
    for (const r of rows as any[]) map.set(Number(r.teamId), Number(r.c));
    return map;
  }

  // -- Teamspace Fase 2: Jadwal (FR-7xx) --

  async listTeamEvents(teamId: number): Promise<TeamEvent[]> {
    const mitraId = getMitraId();
    return this.db.select().from(teamEvents)
      .where(and(eq(teamEvents.mitraId, mitraId), eq(teamEvents.teamId, teamId), isNull(teamEvents.archivedAt)))
      .orderBy(asc(teamEvents.startAt));
  }

  async getTeamEvent(id: number): Promise<TeamEvent | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(teamEvents)
      .where(and(eq(teamEvents.id, id), eq(teamEvents.mitraId, mitraId)));
    return row;
  }

  async createTeamEvent(data: {
    teamId: number; title: string; startAt: string; endAt: string;
    recurrence?: string | null; isConfidential?: boolean; notes?: string | null; participantIds?: number[];
  }, userId: number): Promise<TeamEvent> {
    const mitraId = getMitraId();
    const result = await this.db.insert(teamEvents).values({
      mitraId, teamId: data.teamId, title: data.title, startAt: data.startAt, endAt: data.endAt,
      recurrence: data.recurrence ?? null, isConfidential: data.isConfidential ? 1 : 0,
      notes: data.notes ?? null, createdBy: userId, createdAt: new Date().toISOString(),
    } as any);
    const insertId = Number((result[0] as any).insertId);
    if (data.participantIds?.length) await this.setEventParticipants(insertId, data.participantIds);
    const [row] = await this.db.select().from(teamEvents)
      .where(and(eq(teamEvents.id, insertId), eq(teamEvents.mitraId, mitraId)));
    return row!;
  }

  async updateTeamEvent(id: number, data: {
    title?: string; startAt?: string; endAt?: string; recurrence?: string | null;
    isConfidential?: boolean; notes?: string | null; participantIds?: number[];
  }): Promise<TeamEvent> {
    const mitraId = getMitraId();
    const patch: any = { updatedAt: new Date().toISOString() };
    if (data.title !== undefined) patch.title = data.title;
    if (data.startAt !== undefined) patch.startAt = data.startAt;
    if (data.endAt !== undefined) patch.endAt = data.endAt;
    if (data.recurrence !== undefined) patch.recurrence = data.recurrence;
    if (data.isConfidential !== undefined) patch.isConfidential = data.isConfidential ? 1 : 0;
    if (data.notes !== undefined) patch.notes = data.notes;
    await this.db.update(teamEvents).set(patch)
      .where(and(eq(teamEvents.id, id), eq(teamEvents.mitraId, mitraId)));
    if (data.participantIds !== undefined) await this.setEventParticipants(id, data.participantIds);
    const [row] = await this.db.select().from(teamEvents)
      .where(and(eq(teamEvents.id, id), eq(teamEvents.mitraId, mitraId)));
    if (!row) throw new Error("Event tidak ditemukan");
    return row;
  }

  async archiveTeamEvent(id: number): Promise<void> {
    const mitraId = getMitraId();
    await this.db.update(teamEvents)
      .set({ archivedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as any)
      .where(and(eq(teamEvents.id, id), eq(teamEvents.mitraId, mitraId)));
  }

  async setEventParticipants(eventId: number, userIds: number[]): Promise<void> {
    await this.db.delete(teamEventParticipants).where(eq(teamEventParticipants.eventId, eventId));
    for (const userId of [...new Set(userIds)]) {
      await this.db.insert(teamEventParticipants).values({ eventId, userId } as any);
    }
  }

  /** eventId -> participant userIds[], batched. */
  async getParticipantsForEvents(eventIds: number[]): Promise<Map<number, number[]>> {
    const map = new Map<number, number[]>();
    if (eventIds.length === 0) return map;
    const rows = await this.db.select().from(teamEventParticipants)
      .where(inArray(teamEventParticipants.eventId, eventIds));
    for (const r of rows) {
      const arr = map.get(r.eventId) ?? [];
      arr.push(r.userId);
      map.set(r.eventId, arr);
    }
    return map;
  }

  /** Ambil/generate token feed iCal personal (FR-703), revocable via regenerate. */
  async getOrCreateCalendarFeedToken(userId: number, regenerate = false): Promise<string> {
    const [u] = await this.db.select().from(users).where(eq(users.id, userId));
    const existing = (u as any)?.calendarFeedToken as string | null;
    if (existing && !regenerate) return existing;
    const token = (await import("crypto")).randomBytes(24).toString("hex");
    await this.db.update(users).set({ calendarFeedToken: token } as any).where(eq(users.id, userId));
    return token;
  }

  async getUserByCalendarFeedToken(token: string): Promise<User | undefined> {
    if (!token) return undefined;
    const [row] = await this.db.select().from(users).where(eq(users.calendarFeedToken, token));
    return row;
  }

  // -- Teamspace Fase 2: Check-in (FR-8xx) --

  async listCheckinQuestions(teamId: number): Promise<CheckinQuestion[]> {
    const mitraId = getMitraId();
    return this.db.select().from(checkinQuestions)
      .where(and(eq(checkinQuestions.mitraId, mitraId), eq(checkinQuestions.teamId, teamId)))
      .orderBy(desc(checkinQuestions.isActive), asc(checkinQuestions.sendTime), asc(checkinQuestions.id));
  }

  async getCheckinQuestion(id: number): Promise<CheckinQuestion | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(checkinQuestions)
      .where(and(eq(checkinQuestions.id, id), eq(checkinQuestions.mitraId, mitraId)));
    return row;
  }

  async createCheckinQuestion(data: {
    teamId: number; questionText: string; sendDays: number[]; sendTime: string;
    isConfidential?: boolean; recipientIds: number[];
  }, userId: number): Promise<CheckinQuestion> {
    const mitraId = getMitraId();
    const result = await this.db.insert(checkinQuestions).values({
      mitraId, teamId: data.teamId, questionText: data.questionText,
      sendDays: JSON.stringify(data.sendDays), sendTime: data.sendTime,
      isConfidential: data.isConfidential ? 1 : 0, isActive: 1,
      createdBy: userId, createdAt: new Date().toISOString(),
    } as any);
    const insertId = Number((result[0] as any).insertId);
    await this.setCheckinRecipients(insertId, data.recipientIds);
    const [row] = await this.db.select().from(checkinQuestions)
      .where(and(eq(checkinQuestions.id, insertId), eq(checkinQuestions.mitraId, mitraId)));
    return row!;
  }

  async updateCheckinQuestion(id: number, data: {
    questionText?: string; sendDays?: number[]; sendTime?: string;
    isConfidential?: boolean; isActive?: boolean; recipientIds?: number[];
  }): Promise<CheckinQuestion> {
    const mitraId = getMitraId();
    const patch: any = { updatedAt: new Date().toISOString() };
    if (data.questionText !== undefined) patch.questionText = data.questionText;
    if (data.sendDays !== undefined) patch.sendDays = JSON.stringify(data.sendDays);
    if (data.sendTime !== undefined) patch.sendTime = data.sendTime;
    if (data.isConfidential !== undefined) patch.isConfidential = data.isConfidential ? 1 : 0;
    if (data.isActive !== undefined) patch.isActive = data.isActive ? 1 : 0;
    await this.db.update(checkinQuestions).set(patch)
      .where(and(eq(checkinQuestions.id, id), eq(checkinQuestions.mitraId, mitraId)));
    if (data.recipientIds !== undefined) await this.setCheckinRecipients(id, data.recipientIds);
    const [row] = await this.db.select().from(checkinQuestions)
      .where(and(eq(checkinQuestions.id, id), eq(checkinQuestions.mitraId, mitraId)));
    if (!row) throw new Error("Pertanyaan tidak ditemukan");
    return row;
  }

  async deleteCheckinQuestion(id: number): Promise<void> {
    const mitraId = getMitraId();
    await this.db.delete(checkinRecipients).where(eq(checkinRecipients.questionId, id));
    await this.db.delete(checkinResponses).where(and(eq(checkinResponses.questionId, id), eq(checkinResponses.mitraId, mitraId)));
    await this.db.delete(checkinQuestions)
      .where(and(eq(checkinQuestions.id, id), eq(checkinQuestions.mitraId, mitraId)));
  }

  async setCheckinRecipients(questionId: number, userIds: number[]): Promise<void> {
    await this.db.delete(checkinRecipients).where(eq(checkinRecipients.questionId, questionId));
    for (const userId of [...new Set(userIds)]) {
      await this.db.insert(checkinRecipients).values({ questionId, userId } as any);
    }
  }

  /** questionId -> recipient userIds[], batched. */
  async getRecipientsForQuestions(questionIds: number[]): Promise<Map<number, number[]>> {
    const map = new Map<number, number[]>();
    if (questionIds.length === 0) return map;
    const rows = await this.db.select().from(checkinRecipients)
      .where(inArray(checkinRecipients.questionId, questionIds));
    for (const r of rows) {
      const arr = map.get(r.questionId) ?? [];
      arr.push(r.userId);
      map.set(r.questionId, arr);
    }
    return map;
  }

  /** Jawab instance check-in - upsert per (question, user, responseDate). */
  async upsertCheckinResponse(questionId: number, userId: number, responseDate: string, responseText: string): Promise<CheckinResponse> {
    const mitraId = getMitraId();
    const now = new Date().toISOString();
    const [existing] = await this.db.select().from(checkinResponses)
      .where(and(
        eq(checkinResponses.questionId, questionId), eq(checkinResponses.userId, userId),
        eq(checkinResponses.responseDate, responseDate), eq(checkinResponses.mitraId, mitraId),
      ));
    if (existing) {
      await this.db.update(checkinResponses).set({ responseText, submittedAt: now } as any)
        .where(and(eq(checkinResponses.id, existing.id), eq(checkinResponses.mitraId, mitraId)));
      const [row] = await this.db.select().from(checkinResponses)
        .where(and(eq(checkinResponses.id, existing.id), eq(checkinResponses.mitraId, mitraId)));
      return row!;
    }
    const result = await this.db.insert(checkinResponses).values({
      mitraId, questionId, userId, responseDate, responseText, submittedAt: now,
    } as any);
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(checkinResponses)
      .where(and(eq(checkinResponses.id, insertId), eq(checkinResponses.mitraId, mitraId)));
    return row!;
  }

  /** Rekap jawaban satu pertanyaan, terbaru dulu (group per tanggal di client). */
  async listCheckinResponses(questionId: number, limit = 500): Promise<CheckinResponse[]> {
    const mitraId = getMitraId();
    return this.db.select().from(checkinResponses)
      .where(and(eq(checkinResponses.questionId, questionId), eq(checkinResponses.mitraId, mitraId)))
      .orderBy(desc(checkinResponses.responseDate), asc(checkinResponses.submittedAt))
      .limit(limit);
  }

  /** WORKER (lintas-mitra, tanpa tenant context): semua pertanyaan aktif mentah. */
  async listActiveCheckinQuestionsAllMitra(): Promise<Array<{
    id: number; mitraId: number; teamId: number; questionText: string;
    sendDays: string; sendTime: string; isActive: number; lastSentDate: string | null; createdBy: number;
  }>> {
    const [rows]: any = await this.pool.execute(
      `SELECT id, mitra_id AS mitraId, team_id AS teamId, question_text AS questionText,
              send_days AS sendDays, send_time AS sendTime, is_active AS isActive,
              last_sent_date AS lastSentDate, created_by AS createdBy
       FROM checkin_questions WHERE is_active = 1`,
    );
    return rows as any[];
  }

  async markCheckinSent(questionId: number, dateStr: string): Promise<void> {
    await this.pool.execute(`UPDATE checkin_questions SET last_sent_date = ? WHERE id = ?`, [dateStr, questionId]);
  }

  // -- Teamspace Fase 2: Dokumen & File (FR-9xx) --

  async listTeamFolders(teamId: number): Promise<TeamFolder[]> {
    const mitraId = getMitraId();
    return this.db.select().from(teamFolders)
      .where(and(eq(teamFolders.mitraId, mitraId), eq(teamFolders.teamId, teamId)))
      .orderBy(asc(teamFolders.name));
  }

  async getTeamFolder(id: number): Promise<TeamFolder | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(teamFolders)
      .where(and(eq(teamFolders.id, id), eq(teamFolders.mitraId, mitraId)));
    return row;
  }

  async createTeamFolder(teamId: number, name: string, parentFolderId: number | null, userId: number): Promise<TeamFolder> {
    const mitraId = getMitraId();
    const result = await this.db.insert(teamFolders).values({
      mitraId, teamId, name, parentFolderId, createdBy: userId, createdAt: new Date().toISOString(),
    } as any);
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(teamFolders)
      .where(and(eq(teamFolders.id, insertId), eq(teamFolders.mitraId, mitraId)));
    return row!;
  }

  async renameTeamFolder(id: number, name: string): Promise<void> {
    const mitraId = getMitraId();
    await this.db.update(teamFolders).set({ name } as any)
      .where(and(eq(teamFolders.id, id), eq(teamFolders.mitraId, mitraId)));
  }

  /** Hapus folder - ditolak bila masih ada isi (subfolder/dokumen/file aktif). */
  async deleteTeamFolder(id: number): Promise<void> {
    const mitraId = getMitraId();
    const [subs, docs, files] = await Promise.all([
      this.db.select({ c: count() }).from(teamFolders).where(and(eq(teamFolders.parentFolderId, id), eq(teamFolders.mitraId, mitraId))),
      this.db.select({ c: count() }).from(teamDocuments).where(and(eq(teamDocuments.folderId, id), eq(teamDocuments.mitraId, mitraId), isNull(teamDocuments.archivedAt))),
      this.db.select({ c: count() }).from(teamFiles).where(and(eq(teamFiles.folderId, id), eq(teamFiles.mitraId, mitraId), isNull(teamFiles.archivedAt))),
    ]);
    if (Number(subs[0]?.c ?? 0) + Number(docs[0]?.c ?? 0) + Number(files[0]?.c ?? 0) > 0) {
      throw new Error("Folder masih berisi item - kosongkan dulu sebelum menghapus");
    }
    await this.db.delete(teamFolders).where(and(eq(teamFolders.id, id), eq(teamFolders.mitraId, mitraId)));
  }

  async listTeamDocuments(teamId: number, includeArchived = false): Promise<TeamDocument[]> {
    const mitraId = getMitraId();
    const conds = [eq(teamDocuments.mitraId, mitraId), eq(teamDocuments.teamId, teamId)];
    if (!includeArchived) conds.push(isNull(teamDocuments.archivedAt));
    return this.db.select().from(teamDocuments).where(and(...conds))
      .orderBy(desc(teamDocuments.updatedAt), desc(teamDocuments.id));
  }

  async getTeamDocument(id: number): Promise<TeamDocument | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(teamDocuments)
      .where(and(eq(teamDocuments.id, id), eq(teamDocuments.mitraId, mitraId)));
    return row;
  }

  async createTeamDocument(data: {
    teamId: number; folderId?: number | null; title: string; content?: string | null;
    isConfidential?: boolean; recipientIds?: number[];
  }, userId: number): Promise<TeamDocument> {
    const mitraId = getMitraId();
    const result = await this.db.insert(teamDocuments).values({
      mitraId, teamId: data.teamId, folderId: data.folderId ?? null, title: data.title,
      content: data.content ?? null, isConfidential: data.isConfidential ? 1 : 0,
      createdBy: userId, createdAt: new Date().toISOString(),
    } as any);
    const insertId = Number((result[0] as any).insertId);
    if (data.isConfidential && data.recipientIds) {
      await this.setContentRecipients("document", insertId, data.recipientIds);
    }
    const [row] = await this.db.select().from(teamDocuments)
      .where(and(eq(teamDocuments.id, insertId), eq(teamDocuments.mitraId, mitraId)));
    return row!;
  }

  async updateTeamDocument(id: number, data: {
    title?: string; content?: string | null; folderId?: number | null;
    isConfidential?: boolean; recipientIds?: number[];
  }, userId: number): Promise<TeamDocument> {
    const mitraId = getMitraId();
    const patch: any = { updatedAt: new Date().toISOString(), updatedBy: userId };
    if (data.title !== undefined) patch.title = data.title;
    if (data.content !== undefined) patch.content = data.content;
    if (data.folderId !== undefined) patch.folderId = data.folderId;
    if (data.isConfidential !== undefined) patch.isConfidential = data.isConfidential ? 1 : 0;
    await this.db.update(teamDocuments).set(patch)
      .where(and(eq(teamDocuments.id, id), eq(teamDocuments.mitraId, mitraId)));
    if (data.recipientIds !== undefined) {
      await this.setContentRecipients("document", id, data.recipientIds);
    }
    const [row] = await this.db.select().from(teamDocuments)
      .where(and(eq(teamDocuments.id, id), eq(teamDocuments.mitraId, mitraId)));
    if (!row) throw new Error("Dokumen tidak ditemukan");
    return row;
  }

  async setTeamDocumentArchived(id: number, archived: boolean): Promise<void> {
    const mitraId = getMitraId();
    await this.db.update(teamDocuments)
      .set({ archivedAt: archived ? new Date().toISOString() : null, updatedAt: new Date().toISOString() } as any)
      .where(and(eq(teamDocuments.id, id), eq(teamDocuments.mitraId, mitraId)));
  }

  async listTeamFiles(teamId: number, includeArchived = false): Promise<TeamFile[]> {
    const mitraId = getMitraId();
    const conds = [eq(teamFiles.mitraId, mitraId), eq(teamFiles.teamId, teamId)];
    if (!includeArchived) conds.push(isNull(teamFiles.archivedAt));
    return this.db.select().from(teamFiles).where(and(...conds))
      .orderBy(desc(teamFiles.id));
  }

  async getTeamFile(id: number): Promise<TeamFile | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(teamFiles)
      .where(and(eq(teamFiles.id, id), eq(teamFiles.mitraId, mitraId)));
    return row;
  }

  async addTeamFile(data: {
    teamId: number; folderId?: number | null; fileName: string; filePath: string;
    mimeType: string; sizeBytes: number;
  }, userId: number): Promise<TeamFile> {
    const mitraId = getMitraId();
    const result = await this.db.insert(teamFiles).values({
      mitraId, teamId: data.teamId, folderId: data.folderId ?? null,
      fileName: data.fileName, filePath: data.filePath, mimeType: data.mimeType,
      sizeBytes: data.sizeBytes, uploadedBy: userId, createdAt: new Date().toISOString(),
    } as any);
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(teamFiles)
      .where(and(eq(teamFiles.id, insertId), eq(teamFiles.mitraId, mitraId)));
    return row!;
  }

  async setTeamFileArchived(id: number, archived: boolean): Promise<void> {
    const mitraId = getMitraId();
    await this.db.update(teamFiles)
      .set({ archivedAt: archived ? new Date().toISOString() : null } as any)
      .where(and(eq(teamFiles.id, id), eq(teamFiles.mitraId, mitraId)));
  }

  // -- Teamspace Fase 3: Ops stats terpadu (FR-1006) --

  /** Output operasional per user pada periode - pembeda utama vs Cicle: kinerja tugas
   *  internal disandingkan dengan hasil ops nyata (tiket, lead, collection, canvassing). */
  async getOpsStatsForUsers(fromIso: string, toIso: string): Promise<Map<number, {
    ticketsResolved: number; leadsWon: number; collectionsClosed: number; canvassingReports: number;
  }>> {
    const mitraId = getMitraId();
    const map = new Map<number, { ticketsResolved: number; leadsWon: number; collectionsClosed: number; canvassingReports: number }>();
    const ensure = (uid: number) => {
      const cur = map.get(uid) ?? { ticketsResolved: 0, leadsWon: 0, collectionsClosed: 0, canvassingReports: 0 };
      map.set(uid, cur);
      return cur;
    };
    const [ticketRows, leadRows, collectionRows, canvassingRows] = await Promise.all([
      this.db.select({ uid: tickets.assignedTo, c: count() }).from(tickets)
        .where(and(eq(tickets.mitraId, mitraId), isNotNull(tickets.assignedTo), isNotNull(tickets.resolvedAt), gte(tickets.resolvedAt, fromIso), lte(tickets.resolvedAt, toIso)))
        .groupBy(tickets.assignedTo),
      // Proxy waktu konversi lead: updatedAt saat stage 'won' (tidak ada kolom wonAt).
      this.db.select({ uid: leads.assignedTo, c: count() }).from(leads)
        .where(and(eq(leads.mitraId, mitraId), eq(leads.stage, "won"), isNotNull(leads.assignedTo), isNotNull(leads.updatedAt), gte(leads.updatedAt, fromIso), lte(leads.updatedAt, toIso)))
        .groupBy(leads.assignedTo),
      this.db.select({ uid: collections.assignedTo, c: count() }).from(collections)
        .where(and(eq(collections.mitraId, mitraId), isNotNull(collections.assignedTo), isNotNull(collections.closedAt), gte(collections.closedAt, fromIso), lte(collections.closedAt, toIso)))
        .groupBy(collections.assignedTo),
      this.db.select({ uid: canvassingLogs.userId, c: count() }).from(canvassingLogs)
        .where(and(eq(canvassingLogs.mitraId, mitraId), gte(canvassingLogs.createdAt, fromIso), lte(canvassingLogs.createdAt, toIso)))
        .groupBy(canvassingLogs.userId),
    ]);
    for (const r of ticketRows) if (r.uid != null) ensure(r.uid).ticketsResolved = Number(r.c);
    for (const r of leadRows) if (r.uid != null) ensure(r.uid).leadsWon = Number(r.c);
    for (const r of collectionRows) if (r.uid != null) ensure(r.uid).collectionsClosed = Number(r.c);
    for (const r of canvassingRows) if (r.uid != null) ensure(r.uid).canvassingReports = Number(r.c);
    return map;
  }

  // -- Teamspace Fase 3: Cheers (FR-1203) --

  async createCheer(fromUserId: number, toUserId: number, message: string, cardId?: number | null): Promise<Cheer> {
    const mitraId = getMitraId();
    const result = await this.db.insert(cheers).values({
      mitraId, fromUserId, toUserId, message, cardId: cardId ?? null, createdAt: new Date().toISOString(),
    } as any);
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(cheers)
      .where(and(eq(cheers.id, insertId), eq(cheers.mitraId, mitraId)));
    return row!;
  }

  // ==================== SDM / HRD Fase 1 (v5.1) ====================

  /** Registry karyawan: akun user DALAM mitra aktif + flag isEmployee.
   *  QA BUG1: users tak punya kolom mitra_id - WAJIB filter via user_mitras
   *  supaya HR tidak melihat staf tenant lain (cross-tenant PII leak). */
  async listEmployees(): Promise<Array<{ id: number; name: string; username: string; role: string | null; isActive: number | null; isEmployee: number; position: string | null; department: string | null; employeeId: string | null }>> {
    const inMitra = await this.getUserIdsInMitra(getMitraId());
    const rows = await this.db.select({
      id: users.id, name: users.name, username: users.username, role: users.role, isActive: users.isActive,
      isEmployee: users.isEmployee, position: users.position, department: users.department, employeeId: users.employeeId,
    }).from(users).orderBy(asc(users.name));
    return (rows as any[]).filter((u) => inMitra.has(u.id)) as any;
  }

  /** QA BUG2: verifikasi target ada di mitra pemanggil sebelum menulis flag. */
  async setEmployeeFlag(userId: number, isEmployee: boolean): Promise<void> {
    const inMitra = await this.getUserIdsInMitra(getMitraId());
    if (!inMitra.has(userId)) throw new Error("User bukan anggota mitra ini");
    await this.db.update(users).set({ isEmployee: isEmployee ? 1 : 0 }).where(eq(users.id, userId));
  }

  /** Upsert kehadiran per user+tanggal (idempotent - HR bisa koreksi). */
  async upsertAttendance(rec: { userId: number; date: string; status: string; checkIn?: string | null; checkOut?: string | null; note?: string | null; createdBy: number }): Promise<void> {
    const mitraId = getMitraId();
    await this.pool.execute(
      `INSERT INTO hr_attendance (mitra_id, user_id, date, status, check_in, check_out, note, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status), check_in = VALUES(check_in),
         check_out = VALUES(check_out), note = VALUES(note), updated_at = VALUES(created_at)`,
      [mitraId, rec.userId, rec.date, rec.status, rec.checkIn ?? null, rec.checkOut ?? null, rec.note ?? null, rec.createdBy, new Date().toISOString()],
    );
  }

  async listAttendanceByDate(date: string): Promise<HrAttendance[]> {
    const mitraId = getMitraId();
    return this.db.select().from(hrAttendance)
      .where(and(eq(hrAttendance.mitraId, mitraId), eq(hrAttendance.date, date)));
  }

  /** Rekap bulanan: per user, hitung per status (month = "YYYY-MM"). */
  async attendanceSummary(month: string): Promise<Array<{ userId: number; status: string; c: number }>> {
    const mitraId = getMitraId();
    const [rows]: any = await this.pool.execute(
      `SELECT user_id AS userId, status, COUNT(*) AS c FROM hr_attendance
       WHERE mitra_id = ? AND date LIKE ? GROUP BY user_id, status`,
      [mitraId, `${month}-%`],
    );
    return (rows as any[]).map((r) => ({ userId: Number(r.userId), status: String(r.status), c: Number(r.c) }));
  }

  /** Statistik kehadiran per user untuk 1 bulan (dipakai KPI otomatis).
   *  attendanceRate = hadir/(hadir+alpha); punctualRate = onTime/hadir (checkIn <= lateThreshold). */
  async getAttendanceKpiStatsForMonth(month: string, lateThreshold = "08:15"): Promise<Map<number, {
    hadir: number; alpha: number; late: number; onTime: number; attendanceRate: number; punctualRate: number;
  }>> {
    const mitraId = getMitraId();
    const [rows]: any = await this.pool.execute(
      `SELECT user_id AS uid, status, check_in AS checkIn FROM hr_attendance WHERE mitra_id = ? AND date LIKE ?`,
      [mitraId, `${month}-%`],
    );
    const map = new Map<number, { hadir: number; alpha: number; late: number; onTime: number; attendanceRate: number; punctualRate: number }>();
    const ensure = (uid: number) => {
      let m = map.get(uid);
      if (!m) { m = { hadir: 0, alpha: 0, late: 0, onTime: 0, attendanceRate: 0, punctualRate: 0 }; map.set(uid, m); }
      return m;
    };
    for (const r of (rows as any[])) {
      const uid = Number(r.uid); const st = String(r.status);
      const ci = r.checkIn ? String(r.checkIn).slice(0, 5) : null;
      const m = ensure(uid);
      if (st === "hadir") {
        m.hadir++;
        if (ci && ci > lateThreshold) m.late++; else m.onTime++; // tanpa checkIn = tidak dihukum
      } else if (st === "alpha") m.alpha++;
    }
    for (const m of map.values()) {
      const denom = m.hadir + m.alpha;
      m.attendanceRate = denom > 0 ? Math.round((m.hadir / denom) * 100) : 100;
      m.punctualRate = m.hadir > 0 ? Math.round((m.onTime / m.hadir) * 100) : 100;
    }
    return map;
  }

  async createLeave(rec: { userId: number; startDate: string; endDate: string; type: string; reason?: string | null }): Promise<HrLeave> {
    const mitraId = getMitraId();
    // FR-HR-502: bila punya atasan langsung → tahap manager dulu, baru HR.
    const profile = await this.getEmployeeProfile(rec.userId);
    const stage = profile?.supervisorId ? "manager" : "hr";
    const result = await this.db.insert(hrLeaves).values({
      mitraId, userId: rec.userId, startDate: rec.startDate, endDate: rec.endDate,
      type: rec.type, reason: rec.reason ?? null, status: "pending", stage, createdAt: new Date().toISOString(),
    });
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(hrLeaves).where(eq(hrLeaves.id, insertId));
    return row!;
  }

  async listLeaves(opts?: { userId?: number; status?: string; limit?: number }): Promise<HrLeave[]> {
    const mitraId = getMitraId();
    const conds = [eq(hrLeaves.mitraId, mitraId)];
    if (opts?.userId != null) conds.push(eq(hrLeaves.userId, opts.userId));
    if (opts?.status) conds.push(eq(hrLeaves.status, opts.status));
    return this.db.select().from(hrLeaves).where(and(...conds))
      .orderBy(desc(hrLeaves.id)).limit(Math.min(opts?.limit ?? 200, 500));
  }

  async reviewLeave(id: number, status: "approved" | "rejected", reviewedBy: number, note?: string | null): Promise<HrLeave | undefined> {
    const mitraId = getMitraId();
    await this.db.update(hrLeaves)
      .set({ status, reviewedBy, reviewedAt: new Date().toISOString(), reviewNote: note ?? null })
      .where(and(eq(hrLeaves.id, id), eq(hrLeaves.mitraId, mitraId)));
    const [row] = await this.db.select().from(hrLeaves).where(and(eq(hrLeaves.id, id), eq(hrLeaves.mitraId, mitraId)));
    return row;
  }

  // -- PRD-HR HR-1a: presensi ESS, shift, lokasi kantor, libur, saldo cuti --

  async createAttendanceEvent(ev: { userId: number; date: string; kind: "in" | "out"; at: string; lat?: number | null; lng?: number | null; selfiePath?: string | null; ip?: string | null; withinRadius: boolean; approvalStatus: "approved" | "pending" }): Promise<HrAttendanceEvent> {
    const mitraId = getMitraId();
    const result = await this.db.insert(hrAttendanceEvents).values({
      mitraId, userId: ev.userId, date: ev.date, kind: ev.kind, at: ev.at,
      lat: ev.lat ?? null, lng: ev.lng ?? null, selfiePath: ev.selfiePath ?? null, ip: ev.ip ?? null,
      withinRadius: ev.withinRadius ? 1 : 0, approvalStatus: ev.approvalStatus,
    });
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(hrAttendanceEvents).where(eq(hrAttendanceEvents.id, insertId));
    return row!;
  }

  async listAttendanceEvents(opts: { date?: string; status?: string; userId?: number }): Promise<HrAttendanceEvent[]> {
    const mitraId = getMitraId();
    const conds = [eq(hrAttendanceEvents.mitraId, mitraId)];
    if (opts.date) conds.push(eq(hrAttendanceEvents.date, opts.date));
    if (opts.status) conds.push(eq(hrAttendanceEvents.approvalStatus, opts.status));
    if (opts.userId != null) conds.push(eq(hrAttendanceEvents.userId, opts.userId));
    return this.db.select().from(hrAttendanceEvents).where(and(...conds)).orderBy(desc(hrAttendanceEvents.id)).limit(300);
  }

  async getAttendanceEvent(id: number): Promise<HrAttendanceEvent | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(hrAttendanceEvents)
      .where(and(eq(hrAttendanceEvents.id, id), eq(hrAttendanceEvents.mitraId, mitraId)));
    return row;
  }

  async reviewAttendanceEvent(id: number, status: "approved" | "rejected", reviewedBy: number): Promise<void> {
    const mitraId = getMitraId();
    await this.db.update(hrAttendanceEvents).set({ approvalStatus: status, reviewedBy })
      .where(and(eq(hrAttendanceEvents.id, id), eq(hrAttendanceEvents.mitraId, mitraId)));
  }

  /** Terapkan event approved ke rekap hr_attendance (jam masuk/keluar + status hadir). */
  async applyAttendanceEvent(ev: HrAttendanceEvent, actorId: number): Promise<void> {
    const time = new Date(ev.at);
    const hhmm = `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`;
    const existing = (await this.listAttendanceByDate(ev.date)).find((a) => a.userId === ev.userId);
    await this.upsertAttendance({
      userId: ev.userId, date: ev.date, status: "hadir",
      checkIn: ev.kind === "in" ? hhmm : existing?.checkIn ?? null,
      checkOut: ev.kind === "out" ? hhmm : existing?.checkOut ?? null,
      note: existing?.note ?? null, createdBy: actorId,
    });
  }

  async listOfficeLocations(): Promise<Array<{ id: number; name: string; lat: number; lng: number; radiusM: number }>> {
    const mitraId = getMitraId();
    return this.db.select().from(hrOfficeLocations).where(eq(hrOfficeLocations.mitraId, mitraId)) as any;
  }

  async saveOfficeLocation(loc: { id?: number; name: string; lat: number; lng: number; radiusM: number }): Promise<void> {
    const mitraId = getMitraId();
    if (loc.id) await this.db.update(hrOfficeLocations).set({ name: loc.name, lat: loc.lat, lng: loc.lng, radiusM: loc.radiusM }).where(and(eq(hrOfficeLocations.id, loc.id), eq(hrOfficeLocations.mitraId, mitraId)));
    else await this.db.insert(hrOfficeLocations).values({ mitraId, name: loc.name, lat: loc.lat, lng: loc.lng, radiusM: loc.radiusM });
  }

  async deleteOfficeLocation(id: number): Promise<void> {
    const mitraId = getMitraId();
    await this.db.delete(hrOfficeLocations).where(and(eq(hrOfficeLocations.id, id), eq(hrOfficeLocations.mitraId, mitraId)));
  }

  async listShifts(): Promise<HrShift[]> {
    const mitraId = getMitraId();
    return this.db.select().from(hrShifts).where(eq(hrShifts.mitraId, mitraId));
  }

  async saveShift(s: { id?: number; name: string; startTime: string; endTime: string; lateToleranceMin: number; workDays: string }): Promise<void> {
    const mitraId = getMitraId();
    if (s.id) await this.db.update(hrShifts).set({ name: s.name, startTime: s.startTime, endTime: s.endTime, lateToleranceMin: s.lateToleranceMin, workDays: s.workDays }).where(and(eq(hrShifts.id, s.id), eq(hrShifts.mitraId, mitraId)));
    else await this.db.insert(hrShifts).values({ mitraId, name: s.name, startTime: s.startTime, endTime: s.endTime, lateToleranceMin: s.lateToleranceMin, workDays: s.workDays });
  }

  async listScheduleAssignments(): Promise<Array<{ userId: number; shiftId: number }>> {
    const mitraId = getMitraId();
    return this.db.select({ userId: hrScheduleAssignments.userId, shiftId: hrScheduleAssignments.shiftId })
      .from(hrScheduleAssignments).where(eq(hrScheduleAssignments.mitraId, mitraId));
  }

  async setScheduleAssignment(userId: number, shiftId: number | null): Promise<void> {
    const mitraId = getMitraId();
    if (shiftId == null) {
      await this.db.delete(hrScheduleAssignments).where(and(eq(hrScheduleAssignments.mitraId, mitraId), eq(hrScheduleAssignments.userId, userId)));
      return;
    }
    await this.pool.execute(
      `INSERT INTO hr_schedule_assignments (mitra_id, user_id, shift_id) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE shift_id = VALUES(shift_id)`, [mitraId, userId, shiftId]);
  }

  async listHolidays(year: string): Promise<Array<{ id: number; date: string; name: string }>> {
    const mitraId = getMitraId();
    return this.db.select({ id: hrHolidays.id, date: hrHolidays.date, name: hrHolidays.name })
      .from(hrHolidays).where(and(eq(hrHolidays.mitraId, mitraId), like(hrHolidays.date, `${year}-%`)))
      .orderBy(asc(hrHolidays.date)) as any;
  }

  async saveHoliday(date: string, name: string): Promise<void> {
    const mitraId = getMitraId();
    await this.pool.execute(
      `INSERT INTO hr_holidays (mitra_id, date, name) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)`,
      [mitraId, date, name]);
  }

  async deleteHoliday(id: number): Promise<void> {
    const mitraId = getMitraId();
    await this.db.delete(hrHolidays).where(and(eq(hrHolidays.id, id), eq(hrHolidays.mitraId, mitraId)));
  }

  /** Saldo cuti per jenis untuk 1 user pada tahun berjalan (kuota - approved days). */
  async leaveBalance(userId: number, year: string, quotas: Record<string, number>): Promise<Array<{ type: string; quota: number; used: number; remaining: number }>> {
    const mitraId = getMitraId();
    const [rows]: any = await this.pool.execute(
      `SELECT type, SUM(DATEDIFF(end_date, start_date) + 1) AS days FROM hr_leaves
       WHERE mitra_id = ? AND user_id = ? AND status = 'approved' AND start_date LIKE ? GROUP BY type`,
      [mitraId, userId, `${year}-%`]);
    const used = new Map((rows as any[]).map((r) => [String(r.type), Number(r.days)]));
    return Object.entries(quotas).map(([type, quota]) => {
      const u = used.get(type) ?? 0;
      return { type, quota, used: u, remaining: quota > 0 ? Math.max(0, quota - u) : -1 };  // -1 = tanpa kuota
    });
  }

  // -- HR-1b: profil karyawan, org unit, jabatan, lembur --

  async getEmployeeProfile(userId: number): Promise<HrEmployeeProfile | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(hrEmployeeProfiles)
      .where(and(eq(hrEmployeeProfiles.mitraId, mitraId), eq(hrEmployeeProfiles.userId, userId)));
    return row;
  }

  /** Upsert profil karyawan (wizard 3 langkah - partial patch aman). */
  async saveEmployeeProfile(userId: number, patch: Partial<HrEmployeeProfile>, updatedBy: number): Promise<HrEmployeeProfile> {
    const mitraId = getMitraId();
    const existing = await this.getEmployeeProfile(userId);
    const clean: any = { ...patch };
    delete clean.id; delete clean.mitraId; delete clean.userId;
    clean.updatedAt = new Date().toISOString();
    clean.updatedBy = updatedBy;
    if (existing) {
      await this.db.update(hrEmployeeProfiles).set(clean)
        .where(and(eq(hrEmployeeProfiles.mitraId, mitraId), eq(hrEmployeeProfiles.userId, userId)));
    } else {
      await this.db.insert(hrEmployeeProfiles).values({ mitraId, userId, ...clean });
    }
    return (await this.getEmployeeProfile(userId))!;
  }

  async listOrgUnits(): Promise<Array<{ id: number; name: string; parentId: number | null }>> {
    const mitraId = getMitraId();
    return this.db.select({ id: hrOrgUnits.id, name: hrOrgUnits.name, parentId: hrOrgUnits.parentId })
      .from(hrOrgUnits).where(eq(hrOrgUnits.mitraId, mitraId)).orderBy(asc(hrOrgUnits.name)) as any;
  }

  async saveOrgUnit(name: string, parentId?: number | null): Promise<void> {
    await this.db.insert(hrOrgUnits).values({ mitraId: getMitraId(), name, parentId: parentId ?? null });
  }

  async listPositions(): Promise<Array<{ id: number; name: string }>> {
    const mitraId = getMitraId();
    return this.db.select({ id: hrPositions.id, name: hrPositions.name })
      .from(hrPositions).where(eq(hrPositions.mitraId, mitraId)).orderBy(asc(hrPositions.name)) as any;
  }

  async savePosition(name: string): Promise<void> {
    await this.db.insert(hrPositions).values({ mitraId: getMitraId(), name });
  }

  // FR-HR-301: roster shift per tanggal (prioritas di atas jadwal tetap)
  async getRosterByDate(date: string): Promise<Array<{ userId: number; shiftId: number }>> {
    const mitraId = getMitraId();
    return this.db.select({ userId: hrShiftRoster.userId, shiftId: hrShiftRoster.shiftId })
      .from(hrShiftRoster).where(and(eq(hrShiftRoster.mitraId, mitraId), eq(hrShiftRoster.date, date)));
  }

  async setRoster(userId: number, date: string, shiftId: number | null): Promise<void> {
    const mitraId = getMitraId();
    if (shiftId == null) {
      await this.db.delete(hrShiftRoster).where(and(eq(hrShiftRoster.mitraId, mitraId), eq(hrShiftRoster.userId, userId), eq(hrShiftRoster.date, date)));
      return;
    }
    await this.pool.execute(
      `INSERT INTO hr_shift_roster (mitra_id, user_id, date, shift_id) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE shift_id = VALUES(shift_id)`, [mitraId, userId, date, shiftId]);
  }

  /** Shift efektif user pada tanggal: roster dulu, fallback jadwal tetap. */
  async effectiveShift(userId: number, date: string): Promise<HrShift | null> {
    const roster = (await this.getRosterByDate(date)).find((r) => r.userId === userId);
    const shifts = await this.listShifts();
    if (roster) return shifts.find((s) => s.id === roster.shiftId) ?? null;
    const assigns = await this.listScheduleAssignments();
    const fixed = assigns.find((a) => a.userId === userId);
    return fixed ? shifts.find((s) => s.id === fixed.shiftId) ?? null : null;
  }

  /** FR-HR-502: cuti pending yang menunggu keputusan SAYA sebagai atasan langsung. */
  async listLeavesForSupervisor(supervisorId: number): Promise<HrLeave[]> {
    const mitraId = getMitraId();
    const [rows]: any = await this.pool.execute(
      `SELECT l.* FROM hr_leaves l
       JOIN hr_employee_profiles p ON p.user_id = l.user_id AND p.mitra_id = l.mitra_id
       WHERE l.mitra_id = ? AND l.status = 'pending' AND l.stage = 'manager' AND p.supervisor_id = ?
       ORDER BY l.id DESC LIMIT 100`, [mitraId, supervisorId]);
    // snake_case → camelCase kolom penting saja
    return (rows as any[]).map((r) => ({
      ...r, userId: r.user_id, startDate: r.start_date, endDate: r.end_date,
      managerReviewedBy: r.manager_reviewed_by, reviewedBy: r.reviewed_by,
      reviewedAt: r.reviewed_at, reviewNote: r.review_note, createdAt: r.created_at, mitraId: r.mitra_id,
    })) as any;
  }

  async managerApproveLeave(id: number, managerId: number): Promise<void> {
    const mitraId = getMitraId();
    await this.db.update(hrLeaves).set({ stage: "hr", managerReviewedBy: managerId })
      .where(and(eq(hrLeaves.id, id), eq(hrLeaves.mitraId, mitraId)));
  }

  // -- HR-2: komponen gaji + slip --
  async getSalaryComponent(userId: number): Promise<HrSalaryComponent | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(hrSalaryComponents)
      .where(and(eq(hrSalaryComponents.mitraId, mitraId), eq(hrSalaryComponents.userId, userId)));
    return row;
  }

  async saveSalaryComponent(userId: number, c: { baseSalary: number; fixedAllowance: number; fixedDeduction: number; workingDays: number; enrollBpjsTk: boolean; enrollBpjsKes: boolean }): Promise<void> {
    const mitraId = getMitraId();
    await this.pool.execute(
      `INSERT INTO hr_salary_components (mitra_id, user_id, base_salary, fixed_allowance, fixed_deduction, working_days, enroll_bpjs_tk, enroll_bpjs_kes, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE base_salary=VALUES(base_salary), fixed_allowance=VALUES(fixed_allowance),
         fixed_deduction=VALUES(fixed_deduction), working_days=VALUES(working_days),
         enroll_bpjs_tk=VALUES(enroll_bpjs_tk), enroll_bpjs_kes=VALUES(enroll_bpjs_kes), updated_at=VALUES(updated_at)`,
      [mitraId, userId, c.baseSalary, c.fixedAllowance, c.fixedDeduction, c.workingDays, c.enrollBpjsTk ? 1 : 0, c.enrollBpjsKes ? 1 : 0, new Date().toISOString()]);
  }

  async listSalaryComponents(): Promise<HrSalaryComponent[]> {
    const mitraId = getMitraId();
    return this.db.select().from(hrSalaryComponents).where(eq(hrSalaryComponents.mitraId, mitraId));
  }

  async upsertPayslip(slip: { period: string; userId: number; detail: string; gross: number; totalAllowance: number; totalDeduction: number; takeHomePay: number; generatedBy: number }): Promise<void> {
    const mitraId = getMitraId();
    await this.pool.execute(
      // QA H3: slip yang SUDAH dibayar bersifat immutable - regenerate periode
      // tidak menimpa angka/rincian slip paid (jaga integritas historis + cegah
      // corruption reimburse/kasbon). Hanya slip 'ready' yang diperbarui.
      `INSERT INTO hr_payslips (mitra_id, period, user_id, detail, gross, total_allowance, total_deduction, take_home_pay, status, generated_by, generated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?)
       ON DUPLICATE KEY UPDATE
         detail=IF(status='paid',detail,VALUES(detail)),
         gross=IF(status='paid',gross,VALUES(gross)),
         total_allowance=IF(status='paid',total_allowance,VALUES(total_allowance)),
         total_deduction=IF(status='paid',total_deduction,VALUES(total_deduction)),
         take_home_pay=IF(status='paid',take_home_pay,VALUES(take_home_pay)),
         generated_by=IF(status='paid',generated_by,VALUES(generated_by)),
         generated_at=IF(status='paid',generated_at,VALUES(generated_at))`,
      [mitraId, slip.period, slip.userId, slip.detail, slip.gross, slip.totalAllowance, slip.totalDeduction, slip.takeHomePay, slip.generatedBy, new Date().toISOString()]);
  }

  async listPayslips(opts: { period?: string; userId?: number; paidOnly?: boolean }): Promise<HrPayslip[]> {
    const mitraId = getMitraId();
    const conds = [eq(hrPayslips.mitraId, mitraId)];
    if (opts.period) conds.push(eq(hrPayslips.period, opts.period));
    if (opts.userId != null) conds.push(eq(hrPayslips.userId, opts.userId));
    if (opts.paidOnly) conds.push(eq(hrPayslips.status, "paid"));
    return this.db.select().from(hrPayslips).where(and(...conds)).orderBy(desc(hrPayslips.id)).limit(500);
  }

  async setPayslipStatus(id: number, status: "ready" | "paid"): Promise<void> {
    const mitraId = getMitraId();
    await this.db.update(hrPayslips)
      .set({ status, paidAt: status === "paid" ? new Date().toISOString() : null })
      .where(and(eq(hrPayslips.id, id), eq(hrPayslips.mitraId, mitraId)));
  }

  /** QA H2: tandai efek uang (kasbon/reimburse) sudah diterapkan - sekali seumur slip. */
  async markPayslipEffectsApplied(id: number): Promise<void> {
    const mitraId = getMitraId();
    await this.db.update(hrPayslips).set({ effectsApplied: 1 })
      .where(and(eq(hrPayslips.id, id), eq(hrPayslips.mitraId, mitraId)));
  }

  // -- FR-HR-7xx: kasbon + reimburse --
  async createCashAdvance(rec: { userId: number; amount: number; months: number; reason?: string | null }): Promise<HrCashAdvance> {
    const mitraId = getMitraId();
    const monthly = Math.ceil(rec.amount / Math.max(1, rec.months));
    const result = await this.db.insert(hrCashAdvances).values({
      mitraId, userId: rec.userId, amount: rec.amount, months: rec.months,
      monthlyInstallment: monthly, remaining: rec.amount, reason: rec.reason ?? null,
      status: "pending", createdAt: new Date().toISOString(),
    });
    const [row] = await this.db.select().from(hrCashAdvances).where(eq(hrCashAdvances.id, Number((result[0] as any).insertId)));
    return row!;
  }

  async listCashAdvances(opts?: { userId?: number; status?: string }): Promise<HrCashAdvance[]> {
    const mitraId = getMitraId();
    const conds = [eq(hrCashAdvances.mitraId, mitraId)];
    if (opts?.userId != null) conds.push(eq(hrCashAdvances.userId, opts.userId));
    if (opts?.status) conds.push(eq(hrCashAdvances.status, opts.status));
    return this.db.select().from(hrCashAdvances).where(and(...conds)).orderBy(desc(hrCashAdvances.id)).limit(300);
  }

  async reviewCashAdvance(id: number, status: "approved" | "rejected", reviewedBy: number): Promise<void> {
    const mitraId = getMitraId();
    await this.db.update(hrCashAdvances).set({ status, reviewedBy })
      .where(and(eq(hrCashAdvances.id, id), eq(hrCashAdvances.mitraId, mitraId)));
  }

  /** Kurangi sisa kasbon saat slip DIBAYAR; settle otomatis di 0. */
  async payCashAdvanceInstallment(id: number, amount: number): Promise<void> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(hrCashAdvances).where(and(eq(hrCashAdvances.id, id), eq(hrCashAdvances.mitraId, mitraId)));
    if (!row) return;
    const remaining = Math.max(0, row.remaining - amount);
    await this.db.update(hrCashAdvances).set({ remaining, status: remaining <= 0 ? "settled" : row.status })
      .where(and(eq(hrCashAdvances.id, id), eq(hrCashAdvances.mitraId, mitraId)));
  }

  async createReimbursement(rec: { userId: number; date: string; category: string; amount: number; note?: string | null }): Promise<HrReimbursement> {
    const mitraId = getMitraId();
    const result = await this.db.insert(hrReimbursements).values({
      mitraId, userId: rec.userId, date: rec.date, category: rec.category, amount: rec.amount,
      note: rec.note ?? null, status: "pending", createdAt: new Date().toISOString(),
    });
    const [row] = await this.db.select().from(hrReimbursements).where(eq(hrReimbursements.id, Number((result[0] as any).insertId)));
    return row!;
  }

  async listReimbursements(opts?: { userId?: number; status?: string }): Promise<HrReimbursement[]> {
    const mitraId = getMitraId();
    const conds = [eq(hrReimbursements.mitraId, mitraId)];
    if (opts?.userId != null) conds.push(eq(hrReimbursements.userId, opts.userId));
    if (opts?.status) conds.push(eq(hrReimbursements.status, opts.status));
    return this.db.select().from(hrReimbursements).where(and(...conds)).orderBy(desc(hrReimbursements.id)).limit(300);
  }

  async setReimbursementStatus(id: number, status: "approved" | "rejected" | "paid", reviewedBy?: number): Promise<void> {
    const mitraId = getMitraId();
    const patch: any = { status };
    if (reviewedBy != null) patch.reviewedBy = reviewedBy;
    await this.db.update(hrReimbursements).set(patch)
      .where(and(eq(hrReimbursements.id, id), eq(hrReimbursements.mitraId, mitraId)));
  }

  async getPayslip(id: number): Promise<HrPayslip | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(hrPayslips).where(and(eq(hrPayslips.id, id), eq(hrPayslips.mitraId, mitraId)));
    return row;
  }

  // FR-HR-901: pelacakan lokasi
  async addLocationPing(userId: number, lat: number, lng: number, accuracy?: number | null): Promise<void> {
    const mitraId = getMitraId();
    await this.db.insert(hrLocationPings).values({ mitraId, userId, at: new Date().toISOString(), lat, lng, accuracy: accuracy ?? null });
    // Retensi 30 hari (NFR-HR-002) - bersihkan berkala secara murah (1% peluang per ping).
    if (Math.floor(lat * 1e6) % 100 === 0) {
      const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString();
      await this.pool.execute(`DELETE FROM hr_location_pings WHERE mitra_id = ? AND at < ?`, [mitraId, cutoff]);
    }
  }

  /** Posisi terakhir tiap karyawan hari ini + jumlah ping (buat peta dispatch). */
  async latestLocations(): Promise<Array<{ userId: number; at: string; lat: number; lng: number; pings: number }>> {
    const mitraId = getMitraId();
    const today = new Date().toISOString().slice(0, 10);
    const [rows]: any = await this.pool.execute(
      `SELECT p.user_id AS userId, p.at, p.lat, p.lng, c.pings FROM hr_location_pings p
       JOIN (SELECT user_id, MAX(id) AS max_id, COUNT(*) AS pings FROM hr_location_pings
             WHERE mitra_id = ? AND at LIKE ? GROUP BY user_id) c ON c.max_id = p.id`,
      [mitraId, `${today}%`]);
    return (rows as any[]).map((r) => ({ userId: Number(r.userId), at: r.at, lat: Number(r.lat), lng: Number(r.lng), pings: Number(r.pings) }));
  }

  async listUserPings(userId: number, date: string): Promise<HrLocationPing[]> {
    const mitraId = getMitraId();
    return this.db.select().from(hrLocationPings)
      .where(and(eq(hrLocationPings.mitraId, mitraId), eq(hrLocationPings.userId, userId), like(hrLocationPings.at, `${date}%`)))
      .orderBy(asc(hrLocationPings.id)).limit(500);
  }

  // FR-HR-1501/1502: agregasi Dashboard HR (demografi + kehadiran hari ini)
  async hrDashboard(date: string): Promise<{
    headcount: number; activeCount: number;
    todayAttendance: Record<string, number>;
    pending: { leaves: number; overtime: number; kasbon: number; reimburse: number; presensi: number };
    demographics: { religion: Array<{ k: string; c: number }>; education: Array<{ k: string; c: number }>; employment: Array<{ k: string; c: number }>; marital: Array<{ k: string; c: number }> };
  }> {
    const mitraId = getMitraId();
    const emps = (await this.listEmployees()).filter((e) => e.isEmployee === 1);
    const activeCount = emps.filter((e) => e.isActive !== 0).length;
    const empIds = new Set(emps.map((e) => e.id));

    const att = (await this.listAttendanceByDate(date)).filter((a) => empIds.has(a.userId));
    const todayAttendance: Record<string, number> = { hadir: 0, terlambat: 0, izin: 0, sakit: 0, cuti: 0, alpha: 0, libur: 0 };
    for (const a of att) {
      if (a.status === "hadir" && a.note?.includes("Terlambat")) todayAttendance.terlambat++;
      else todayAttendance[a.status] = (todayAttendance[a.status] ?? 0) + 1;
    }

    const pending = {
      leaves: (await this.listLeaves({ status: "pending", limit: 500 })).length,
      overtime: (await this.listOvertime({ status: "pending" })).length,
      kasbon: (await this.listCashAdvances({ status: "pending" })).length,
      reimburse: (await this.listReimbursements({ status: "pending" })).length,
      presensi: (await this.listAttendanceEvents({ status: "pending" })).length,
    };

    // Demografi dari profil karyawan
    const profiles = await this.db.select().from(hrEmployeeProfiles).where(eq(hrEmployeeProfiles.mitraId, mitraId));
    const tally = (vals: Array<string | null | undefined>) => {
      const m = new Map<string, number>();
      for (const v of vals) { const k = (v && String(v).trim()) || "-"; m.set(k, (m.get(k) ?? 0) + 1); }
      return [...m.entries()].map(([k, c]) => ({ k, c })).sort((a, b) => b.c - a.c);
    };
    const forEmp = profiles.filter((p) => empIds.has(p.userId));
    const demographics = {
      religion: tally(forEmp.map((p) => p.religion)),
      education: tally(forEmp.map((p) => p.educationLevel)),
      employment: tally(forEmp.map((p) => p.employmentStatus)),
      marital: tally(forEmp.map((p) => p.maritalStatus)),
    };
    return { headcount: emps.length, activeCount, todayAttendance, pending, demographics };
  }

  // FR-HR-902/903: klien + kunjungan
  async listClients(): Promise<HrClient[]> {
    const mitraId = getMitraId();
    return this.db.select().from(hrClients).where(eq(hrClients.mitraId, mitraId)).orderBy(asc(hrClients.name));
  }
  async saveClient(c: { id?: number; name: string; phone?: string | null; lat: number; lng: number; radiusM: number }): Promise<void> {
    const mitraId = getMitraId();
    if (c.id) await this.db.update(hrClients).set({ name: c.name, phone: c.phone ?? null, lat: c.lat, lng: c.lng, radiusM: c.radiusM }).where(and(eq(hrClients.id, c.id), eq(hrClients.mitraId, mitraId)));
    else await this.db.insert(hrClients).values({ mitraId, name: c.name, phone: c.phone ?? null, lat: c.lat, lng: c.lng, radiusM: c.radiusM });
  }
  async createVisit(v: { clientId: number; userId: number; lat: number; lng: number; withinRadius: boolean; note?: string | null }): Promise<HrClientVisit> {
    const mitraId = getMitraId();
    const result = await this.db.insert(hrClientVisits).values({
      mitraId, clientId: v.clientId, userId: v.userId, at: new Date().toISOString(),
      lat: v.lat, lng: v.lng, withinRadius: v.withinRadius ? 1 : 0, note: v.note ?? null,
    });
    const [row] = await this.db.select().from(hrClientVisits).where(eq(hrClientVisits.id, Number((result[0] as any).insertId)));
    return row!;
  }
  async listVisits(opts?: { userId?: number; clientId?: number }): Promise<HrClientVisit[]> {
    const mitraId = getMitraId();
    const conds = [eq(hrClientVisits.mitraId, mitraId)];
    if (opts?.userId != null) conds.push(eq(hrClientVisits.userId, opts.userId));
    if (opts?.clientId != null) conds.push(eq(hrClientVisits.clientId, opts.clientId));
    return this.db.select().from(hrClientVisits).where(and(...conds)).orderBy(desc(hrClientVisits.id)).limit(300);
  }

  // FR-HR-12xx: KPI
  async listKpiForms(): Promise<HrKpiForm[]> {
    const mitraId = getMitraId();
    return this.db.select().from(hrKpiForms).where(eq(hrKpiForms.mitraId, mitraId)).orderBy(desc(hrKpiForms.id));
  }
  async saveKpiForm(name: string, questions: string): Promise<void> {
    await this.db.insert(hrKpiForms).values({ mitraId: getMitraId(), name, questions, status: "active", createdAt: new Date().toISOString() });
  }
  async saveKpiAssessment(a: { formId: number; userId: number; assessorId: number; period: string; scores: string; total: number }): Promise<void> {
    await this.db.insert(hrKpiAssessments).values({ mitraId: getMitraId(), ...a, createdAt: new Date().toISOString() });
  }
  async listKpiAssessments(period?: string): Promise<HrKpiAssessment[]> {
    const mitraId = getMitraId();
    const conds = [eq(hrKpiAssessments.mitraId, mitraId)];
    if (period) conds.push(eq(hrKpiAssessments.period, period));
    return this.db.select().from(hrKpiAssessments).where(and(...conds)).orderBy(desc(hrKpiAssessments.id)).limit(500);
  }

  // FR-HR-703: petty cash
  async addPettyCash(rec: { holderId: number; kind: "topup" | "expense"; amount: number; note?: string | null; createdBy: number }): Promise<void> {
    await this.db.insert(hrPettyCash).values({ mitraId: getMitraId(), holderId: rec.holderId, kind: rec.kind, amount: rec.amount, note: rec.note ?? null, createdBy: rec.createdBy, createdAt: new Date().toISOString() });
  }
  async pettyCashLedger(): Promise<{ balances: Array<{ holderId: number; balance: number }>; entries: HrPettyCash[] }> {
    const mitraId = getMitraId();
    const entries = await this.db.select().from(hrPettyCash).where(eq(hrPettyCash.mitraId, mitraId)).orderBy(desc(hrPettyCash.id)).limit(200);
    const [rows]: any = await this.pool.execute(
      `SELECT holder_id AS holderId, SUM(CASE WHEN kind='topup' THEN amount ELSE -amount END) AS balance
       FROM hr_petty_cash WHERE mitra_id = ? GROUP BY holder_id`, [mitraId]);
    return { balances: (rows as any[]).map((r) => ({ holderId: Number(r.holderId), balance: Number(r.balance) })), entries };
  }

  async createOvertime(rec: { userId: number; date: string; hours: number; reason?: string | null }): Promise<HrOvertime> {
    const mitraId = getMitraId();
    const result = await this.db.insert(hrOvertime).values({
      mitraId, userId: rec.userId, date: rec.date, hours: rec.hours,
      reason: rec.reason ?? null, status: "pending", createdAt: new Date().toISOString(),
    });
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(hrOvertime).where(eq(hrOvertime.id, insertId));
    return row!;
  }

  async listOvertime(opts?: { userId?: number; status?: string }): Promise<HrOvertime[]> {
    const mitraId = getMitraId();
    const conds = [eq(hrOvertime.mitraId, mitraId)];
    if (opts?.userId != null) conds.push(eq(hrOvertime.userId, opts.userId));
    if (opts?.status) conds.push(eq(hrOvertime.status, opts.status));
    return this.db.select().from(hrOvertime).where(and(...conds)).orderBy(desc(hrOvertime.id)).limit(300);
  }

  async reviewOvertime(id: number, status: "approved" | "rejected", reviewedBy: number): Promise<HrOvertime | undefined> {
    const mitraId = getMitraId();
    await this.db.update(hrOvertime).set({ status, reviewedBy })
      .where(and(eq(hrOvertime.id, id), eq(hrOvertime.mitraId, mitraId)));
    const [row] = await this.db.select().from(hrOvertime).where(and(eq(hrOvertime.id, id), eq(hrOvertime.mitraId, mitraId)));
    return row;
  }

  async listCheersReceived(userId: number, limit = 100): Promise<Cheer[]> {
    const mitraId = getMitraId();
    return this.db.select().from(cheers)
      .where(and(eq(cheers.mitraId, mitraId), eq(cheers.toUserId, userId)))
      .orderBy(desc(cheers.id)).limit(limit);
  }

  async listCheersSent(userId: number, limit = 100): Promise<Cheer[]> {
    const mitraId = getMitraId();
    return this.db.select().from(cheers)
      .where(and(eq(cheers.mitraId, mitraId), eq(cheers.fromUserId, userId)))
      .orderBy(desc(cheers.id)).limit(limit);
  }

  /** Leaderboard penerima cheers pada periode. */
  async cheersLeaderboard(fromIso: string, toIso: string, limit = 10): Promise<Array<{ userId: number; count: number }>> {
    const mitraId = getMitraId();
    const rows = await this.db.select({ userId: cheers.toUserId, c: count() }).from(cheers)
      .where(and(eq(cheers.mitraId, mitraId), gte(cheers.createdAt, fromIso), lte(cheers.createdAt, toIso)))
      .groupBy(cheers.toUserId)
      .orderBy(desc(count()))
      .limit(limit);
    return rows.map((r) => ({ userId: r.userId, count: Number(r.c) }));
  }

  /** WORKER §14.4: upsert snapshot KPI Teamspace hari ini untuk SEMUA mitra ber-tim.
   *  Dipanggil berkala - tulisan terakhir hari itu = keadaan end-of-day. */
  async writeTeamspaceKpiSnapshots(): Promise<void> {
    const [mitraRows]: any = await this.pool.execute(`SELECT DISTINCT mitra_id AS mitraId FROM teams WHERE archived_at IS NULL`);
    const today = (() => { const d = new Date(); const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; })();
    const nowIso = new Date().toISOString();
    for (const row of mitraRows as any[]) {
      const mitraId = Number(row.mitraId);
      // Ringkasan tugas seluruh tim mitra ini (query langsung - di luar tenant ctx).
      const [pipeRows]: any = await this.pool.execute(
        `SELECT task_pipeline_id AS pid FROM teams WHERE mitra_id = ? AND archived_at IS NULL AND task_pipeline_id IS NOT NULL`, [mitraId]);
      const pids = (pipeRows as any[]).map((r) => Number(r.pid));
      let total = 0, done = 0, overdue = 0;
      if (pids.length > 0) {
        const ph = pids.map(() => "?").join(",");
        const [stat]: any = await this.pool.execute(
          `SELECT
             COUNT(*) AS total,
             SUM(CASE WHEN c.is_completed = 1 OR s.semantic_type IN ('done','cancelled') THEN 1 ELSE 0 END) AS done,
             SUM(CASE WHEN c.is_completed = 0 AND (s.semantic_type IS NULL OR s.semantic_type NOT IN ('done','cancelled'))
                       AND c.due_date IS NOT NULL AND c.due_date < ? THEN 1 ELSE 0 END) AS overdue
           FROM pipeline_cards c
           JOIN pipeline_stages s ON s.id = c.stage_id
           WHERE c.mitra_id = ? AND c.pipeline_id IN (${ph}) AND c.archived_at IS NULL`,
          [nowIso, mitraId, ...pids],
        );
        total = Number((stat as any[])[0]?.total ?? 0);
        done = Number((stat as any[])[0]?.done ?? 0);
        overdue = Number((stat as any[])[0]?.overdue ?? 0);
      }
      const [ciRows]: any = await this.pool.execute(
        `SELECT COUNT(*) AS c FROM checkin_responses WHERE mitra_id = ? AND response_date = ?`, [mitraId, today]);
      const checkinsToday = Number((ciRows as any[])[0]?.c ?? 0);
      await this.pool.execute(
        `INSERT INTO kpi_snapshots (mitra_id, snapshot_date, teamspace_tasks_total, teamspace_tasks_done, teamspace_tasks_overdue, teamspace_checkins_today, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           teamspace_tasks_total = VALUES(teamspace_tasks_total),
           teamspace_tasks_done = VALUES(teamspace_tasks_done),
           teamspace_tasks_overdue = VALUES(teamspace_tasks_overdue),
           teamspace_checkins_today = VALUES(teamspace_checkins_today)`,
        [mitraId, today, total, done, overdue, checkinsToday, nowIso],
      );
    }
  }

  // -- Penerima konten Rahasia (polymorphic, FR-1404) --

  async setContentRecipients(ownerType: string, ownerId: number, userIds: number[]): Promise<void> {
    await this.db.delete(contentRecipients)
      .where(and(eq(contentRecipients.ownerType, ownerType), eq(contentRecipients.ownerId, ownerId)));
    for (const userId of [...new Set(userIds)]) {
      await this.db.insert(contentRecipients).values({ ownerType, ownerId, userId } as any);
    }
  }

  async getContentRecipients(ownerType: string, ownerId: number): Promise<number[]> {
    const rows = await this.db.select().from(contentRecipients)
      .where(and(eq(contentRecipients.ownerType, ownerType), eq(contentRecipients.ownerId, ownerId)));
    return rows.map((r) => r.userId);
  }

  /** ownerId -> userIds[], batched per ownerType. */
  async getRecipientsForOwners(ownerType: string, ownerIds: number[]): Promise<Map<number, number[]>> {
    const map = new Map<number, number[]>();
    if (ownerIds.length === 0) return map;
    const rows = await this.db.select().from(contentRecipients)
      .where(and(eq(contentRecipients.ownerType, ownerType), inArray(contentRecipients.ownerId, ownerIds)));
    for (const r of rows) {
      const arr = map.get(r.ownerId) ?? [];
      arr.push(r.userId);
      map.set(r.ownerId, arr);
    }
    return map;
  }

  // ===== Pipeline Custom Fields (Phase 2) =====

  async listFields(pipelineId: number): Promise<PipelineField[]> {
    const mitraId = getMitraId();
    return this.db.select().from(pipelineFields)
      .where(and(eq(pipelineFields.mitraId, mitraId), eq(pipelineFields.pipelineId, pipelineId)))
      .orderBy(asc(pipelineFields.position), asc(pipelineFields.id));
  }

  async createField(pipelineId: number, data: { label: string; type: string; options?: string[] | null; required?: boolean; showOnCard?: boolean; config?: string | null; }): Promise<PipelineField> {
    const mitraId = getMitraId();
    const existing = await this.listFields(pipelineId);
    const base = String(data.label).toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "field";
    const used = new Set(existing.map((f) => f.key));
    let key = base; let n = 2;
    while (used.has(key)) key = `${base}_${n++}`;
    const maxPos = existing.reduce((m, f) => Math.max(m, f.position), -1);
    const now = new Date().toISOString();
    const result = await this.db.insert(pipelineFields).values({
      mitraId, pipelineId, key, label: data.label, type: data.type,
      options: data.options && data.options.length ? JSON.stringify(data.options) : null,
      required: data.required ? 1 : 0, showOnCard: data.showOnCard ? 1 : 0,
      config: data.config ?? null,
      position: maxPos + 1, createdAt: now,
    } as any);
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(pipelineFields).where(and(eq(pipelineFields.id, insertId), eq(pipelineFields.mitraId, mitraId)));
    return row!;
  }

  async updateField(id: number, data: { label?: string; options?: string[] | null; required?: boolean; showOnCard?: boolean; config?: string | null; }): Promise<PipelineField> {
    const mitraId = getMitraId();
    const patch: any = { updatedAt: new Date().toISOString() };
    if (data.label !== undefined) patch.label = data.label;
    if (data.options !== undefined) patch.options = data.options && data.options.length ? JSON.stringify(data.options) : null;
    if (data.required !== undefined) patch.required = data.required ? 1 : 0;
    if (data.showOnCard !== undefined) patch.showOnCard = data.showOnCard ? 1 : 0;
    if (data.config !== undefined) patch.config = data.config;
    await this.db.update(pipelineFields).set(patch).where(and(eq(pipelineFields.id, id), eq(pipelineFields.mitraId, mitraId)));
    const [row] = await this.db.select().from(pipelineFields).where(and(eq(pipelineFields.id, id), eq(pipelineFields.mitraId, mitraId)));
    if (!row) throw new Error("Field tidak ditemukan");
    return row;
  }

  async deleteField(id: number): Promise<void> {
    const mitraId = getMitraId();
    await this.db.delete(pipelineCardValues).where(and(eq(pipelineCardValues.fieldId, id), eq(pipelineCardValues.mitraId, mitraId)));
    await this.db.delete(pipelineFields).where(and(eq(pipelineFields.id, id), eq(pipelineFields.mitraId, mitraId)));
  }

  async reorderFields(pipelineId: number, orderedIds: number[]): Promise<void> {
    const mitraId = getMitraId();
    const now = new Date().toISOString();
    for (let i = 0; i < orderedIds.length; i++) {
      await this.db.update(pipelineFields).set({ position: i, updatedAt: now })
        .where(and(eq(pipelineFields.id, orderedIds[i]), eq(pipelineFields.mitraId, mitraId), eq(pipelineFields.pipelineId, pipelineId)));
    }
  }

  async getCardValues(cardId: number): Promise<Record<number, string>> {
    const mitraId = getMitraId();
    const rows = await this.db.select().from(pipelineCardValues)
      .where(and(eq(pipelineCardValues.mitraId, mitraId), eq(pipelineCardValues.cardId, cardId)));
    const out: Record<number, string> = {};
    for (const r of rows) out[r.fieldId] = r.value ?? "";
    return out;
  }

  async setCardValues(cardId: number, entries: { fieldId: number; value: string }[]): Promise<void> {
    const mitraId = getMitraId();
    const now = new Date().toISOString();
    for (const { fieldId, value } of entries) {
      const isEmpty = value === "" || value == null;
      const [existing] = await this.db.select().from(pipelineCardValues)
        .where(and(eq(pipelineCardValues.mitraId, mitraId), eq(pipelineCardValues.cardId, cardId), eq(pipelineCardValues.fieldId, fieldId)));
      if (isEmpty) {
        if (existing) await this.db.delete(pipelineCardValues)
          .where(and(eq(pipelineCardValues.id, existing.id), eq(pipelineCardValues.mitraId, mitraId)));
        continue;
      }
      if (existing) {
        await this.db.update(pipelineCardValues).set({ value, updatedAt: now })
          .where(and(eq(pipelineCardValues.id, existing.id), eq(pipelineCardValues.mitraId, mitraId)));
      } else {
        await this.db.insert(pipelineCardValues).values({ mitraId, cardId, fieldId, value, createdAt: now } as any);
      }
    }
  }

  /** cardId -> { fieldId: value } for show_on_card fields of a pipeline (board chips). */
  async getShowOnCardValues(pipelineId: number): Promise<Record<number, Record<number, string>>> {
    const mitraId = getMitraId();
    const fields = await this.db.select().from(pipelineFields)
      .where(and(eq(pipelineFields.mitraId, mitraId), eq(pipelineFields.pipelineId, pipelineId), eq(pipelineFields.showOnCard, 1)));
    const fieldIds = fields.map((f) => f.id);
    if (fieldIds.length === 0) return {};
    const rows = await this.db.select().from(pipelineCardValues)
      .where(and(eq(pipelineCardValues.mitraId, mitraId), inArray(pipelineCardValues.fieldId, fieldIds)));
    const out: Record<number, Record<number, string>> = {};
    for (const r of rows) { (out[r.cardId] ??= {})[r.fieldId] = r.value ?? ""; }
    return out;
  }

  /** Values for fields the board needs: shown-on-card OR searchable/filterable/sortable.
   *  Same shape as getShowOnCardValues: { [cardId]: { [fieldId]: value } }. */
  async getBoardCardValues(pipelineId: number): Promise<Record<number, Record<number, string>>> {
    const mitraId = getMitraId();
    const fields = await this.db.select().from(pipelineFields)
      .where(and(eq(pipelineFields.mitraId, mitraId), eq(pipelineFields.pipelineId, pipelineId)));
    const fieldIds = fields
      .filter((f) => {
        const meta = getFieldTypeMeta(f.type);
        return f.showOnCard === 1 || (meta && (meta.searchable || meta.filterable || meta.sortable));
      })
      .map((f) => f.id);
    if (fieldIds.length === 0) return {};
    const rows = await this.db.select().from(pipelineCardValues)
      .where(and(eq(pipelineCardValues.mitraId, mitraId), inArray(pipelineCardValues.fieldId, fieldIds)));
    const out: Record<number, Record<number, string>> = {};
    for (const r of rows) { (out[r.cardId] ??= {})[r.fieldId] = r.value ?? ""; }
    return out;
  }

  // ===== Pipeline Access Grants (Phase 3) =====

  async getPipelineAccess(pipelineId: number): Promise<{ restricted: boolean; grants: { roleId: number; capabilities: PipelineCapability[]; cardFilter: any | null }[] }> {
    const mitraId = getMitraId();
    const [p] = await this.db.select().from(pipelines).where(and(eq(pipelines.id, pipelineId), eq(pipelines.mitraId, mitraId)));
    const rows = await this.db.select().from(pipelineAccess)
      .where(and(eq(pipelineAccess.mitraId, mitraId), eq(pipelineAccess.pipelineId, pipelineId)));
    return {
      restricted: ((p as any)?.restricted ?? 0) === 1,
      grants: rows.map((r) => ({
        roleId: r.roleId,
        capabilities: (r as any).capabilities ? parseCapabilities((r as any).capabilities) : capabilitiesFromLevel(r.level),
        cardFilter: (() => { try { return (r as any).cardFilter ? JSON.parse((r as any).cardFilter) : null; } catch { return null; } })(),
      })),
    };
  }

  async setPipelineAccess(pipelineId: number, restricted: boolean, grants: { roleId: number; capabilities: PipelineCapability[]; cardFilter?: any | null }[]): Promise<void> {
    const mitraId = getMitraId();
    const now = new Date().toISOString();
    await this.db.update(pipelines).set({ restricted: restricted ? 1 : 0, updatedAt: now } as any)
      .where(and(eq(pipelines.id, pipelineId), eq(pipelines.mitraId, mitraId)));
    await this.db.delete(pipelineAccess).where(and(eq(pipelineAccess.mitraId, mitraId), eq(pipelineAccess.pipelineId, pipelineId)));
    for (const g of grants) {
      const caps = parseCapabilities(JSON.stringify(g.capabilities));
      if (caps.length === 0) continue;
      await this.db.insert(pipelineAccess).values({
        mitraId, pipelineId, roleId: g.roleId,
        level: deriveLevel(caps), capabilities: JSON.stringify(caps),
        cardFilter: g.cardFilter && Array.isArray(g.cardFilter) && g.cardFilter.length ? JSON.stringify(g.cardFilter) : null,
        createdAt: now,
      } as any);
    }
  }

  async getGrantLevelForRole(pipelineId: number, roleId: number): Promise<"none" | "view" | "edit"> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(pipelineAccess)
      .where(and(eq(pipelineAccess.mitraId, mitraId), eq(pipelineAccess.pipelineId, pipelineId), eq(pipelineAccess.roleId, roleId)));
    return (row?.level === "view" || row?.level === "edit") ? row.level : "none";
  }

  /** Can a user (by id) see (>= view) a pipeline? Mirrors the P3 resolver, non-request-scoped. */
  async canUserAccessPipeline(userId: number, pipelineId: number): Promise<boolean> {
    const mitraId = getMitraId();
    const pipe = await this.getPipeline(pipelineId);
    if (!pipe) return false;
    const eff = await this.getUserEffectivePermissionsAtMitra(userId, mitraId);
    // "Admin" (per-mitra, isSystem) ikut full-access - mirror isPipelineAdmin di routes.
    if ((eff.roleName === "System-Admin" || eff.roleName === "Admin" || eff.roleName === "admin (legacy)") && eff.isSystem) return true;
    const restricted = (pipe as any).restricted === 1;
    if (!restricted) return ((eff.perms as any)["pipelines"] ?? "none") !== "none";
    if (!eff.roleId) return false;
    return (await this.getGrantLevelForRole(pipelineId, eff.roleId)) !== "none";
  }

  /** Capabilities a role is granted on a pipeline (parsed, or derived from legacy level). */
  async getGrantCapabilitiesForRole(pipelineId: number, roleId: number): Promise<PipelineCapability[]> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(pipelineAccess)
      .where(and(eq(pipelineAccess.mitraId, mitraId), eq(pipelineAccess.pipelineId, pipelineId), eq(pipelineAccess.roleId, roleId)));
    if (!row) return [];
    return (row as any).capabilities ? parseCapabilities((row as any).capabilities) : capabilitiesFromLevel(row.level);
  }

  /** Card-level row filter for a specific role on a pipeline (null = no filtering). */
  async getCardFilterForRole(pipelineId: number, roleId: number): Promise<import("../shared/fieldRules.js").FieldRuleCondition[][] | null> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(pipelineAccess)
      .where(and(eq(pipelineAccess.mitraId, mitraId), eq(pipelineAccess.pipelineId, pipelineId), eq(pipelineAccess.roleId, roleId)));
    if (!row || !(row as any).cardFilter) return null;
    try { const g = JSON.parse((row as any).cardFilter); return Array.isArray(g) && g.length ? g : null; } catch { return null; }
  }

  /** All field values (not just showOnCard) keyed by cardId - for row-level filtering on the board. */
  async getAllCardValuesForPipeline(pipelineId: number): Promise<Map<number, Record<number, string>>> {
    const mitraId = getMitraId();
    const fields = await this.db.select({ id: pipelineFields.id }).from(pipelineFields)
      .where(and(eq(pipelineFields.mitraId, mitraId), eq(pipelineFields.pipelineId, pipelineId)));
    const fieldIds = fields.map((f) => f.id);
    const out = new Map<number, Record<number, string>>();
    if (fieldIds.length === 0) return out;
    const rows = await this.db.select().from(pipelineCardValues)
      .where(and(eq(pipelineCardValues.mitraId, mitraId), inArray(pipelineCardValues.fieldId, fieldIds)));
    for (const r of rows) { const m = out.get(r.cardId) ?? {}; m[r.fieldId] = r.value ?? ""; out.set(r.cardId, m); }
    return out;
  }

  /** Map pipelineId → granted capabilities for a role (for the list endpoint). */
  async getGrantCapabilitiesMapForRole(roleId: number): Promise<Record<number, PipelineCapability[]>> {
    const mitraId = getMitraId();
    const rows = await this.db.select().from(pipelineAccess)
      .where(and(eq(pipelineAccess.mitraId, mitraId), eq(pipelineAccess.roleId, roleId)));
    const out: Record<number, PipelineCapability[]> = {};
    for (const r of rows) out[r.pipelineId] = (r as any).capabilities ? parseCapabilities((r as any).capabilities) : capabilitiesFromLevel(r.level);
    return out;
  }

  /** All grants for a role across the mitra: pipelineId -> level. One query (for list filtering). */
  async getGrantsForRole(roleId: number): Promise<Record<number, "view" | "edit">> {
    const mitraId = getMitraId();
    const rows = await this.db.select().from(pipelineAccess)
      .where(and(eq(pipelineAccess.mitraId, mitraId), eq(pipelineAccess.roleId, roleId)));
    const out: Record<number, "view" | "edit"> = {};
    for (const r of rows) if (r.level === "view" || r.level === "edit") out[r.pipelineId] = r.level;
    return out;
  }

  // ===== Pipeline Automation Rules (Phase 4a) =====

  async listRules(pipelineId: number): Promise<PipelineRule[]> {
    const mitraId = getMitraId();
    return this.db.select().from(pipelineRules)
      .where(and(eq(pipelineRules.mitraId, mitraId), eq(pipelineRules.pipelineId, pipelineId)))
      .orderBy(asc(pipelineRules.id));
  }

  /** Enabled billing_sync rules for the current tenant. */
  async listBillingSyncRules(): Promise<PipelineRule[]> {
    const mitraId = getMitraId();
    return this.db.select().from(pipelineRules)
      .where(and(eq(pipelineRules.mitraId, mitraId), eq(pipelineRules.triggerType, "billing_sync"), eq(pipelineRules.enabled, 1)));
  }

  /** Cards previously created by a billing_sync rule (any stage), for dedup + resolve. */
  async getSourceCardsForRule(ruleId: number): Promise<PipelineCard[]> {
    const mitraId = getMitraId();
    return this.db.select().from(pipelineCards)
      .where(and(eq(pipelineCards.mitraId, mitraId), eq(pipelineCards.sourceRuleId, ruleId)));
  }

  /** Enabled rules dengan triggerType lead tertentu, tenant saat ini. */
  async listLeadRules(triggerType: RuleTriggerType): Promise<PipelineRule[]> {
    const mitraId = getMitraId();
    return this.db.select().from(pipelineRules)
      .where(and(eq(pipelineRules.mitraId, mitraId), eq(pipelineRules.triggerType, triggerType), eq(pipelineRules.enabled, 1)));
  }

  /** Link lead→card untuk satu lead (tenant-scoped). */
  async getLeadCardLinks(leadId: number): Promise<LeadCardLink[]> {
    const mitraId = getMitraId();
    return this.db.select().from(leadCardLinks)
      .where(and(eq(leadCardLinks.mitraId, mitraId), eq(leadCardLinks.leadId, leadId)));
  }

  /** Link untuk satu CARD (tenant-scoped) - null kalau kartu belum tertaut lead. */
  async getLeadCardLinkByCard(cardId: number): Promise<LeadCardLink | null> {
    const mitraId = getMitraId();
    const rows = await this.db.select().from(leadCardLinks)
      .where(and(eq(leadCardLinks.mitraId, mitraId), eq(leadCardLinks.cardId, cardId)));
    return rows[0] ?? null;
  }

  async createLeadCardLink(data: { leadId: number; cardId: number; ruleId: number | null }): Promise<void> {
    const mitraId = getMitraId();
    await this.db.insert(leadCardLinks).values({
      mitraId, leadId: data.leadId, cardId: data.cardId, ruleId: data.ruleId,
      createdAt: new Date().toISOString(),
    });
  }

  /** Card id (di pipeline tsb) yang punya value tertentu pada field tertentu - untuk dedup by phone. */
  async findCardIdsByFieldValue(pipelineId: number, fieldId: number, value: string): Promise<number[]> {
    const mitraId = getMitraId();
    const rows: any = (await this.db.execute(sql`
      SELECT v.card_id AS cardId
      FROM pipeline_card_values v
      JOIN pipeline_cards c ON c.id = v.card_id
      WHERE c.mitra_id = ${mitraId} AND c.pipeline_id = ${pipelineId}
        AND v.field_id = ${fieldId} AND v.value = ${value}
    `))[0];
    return (rows as any[]).map((r) => Number(r.cardId));
  }

  async createRule(pipelineId: number, data: { name?: string | null; triggerStageId?: number | null; triggerType?: RuleTriggerType; triggerConfig?: any | null; actionType?: PipelineRuleActionType; targetPipelineId?: number | null; targetStageId?: number | null; titleTemplate?: string | null; copyAssignee?: boolean; enabled?: boolean; actionConfig?: any | null; conditions?: any | null; recurrence?: string; fieldMaps?: { sourceFieldId: number; targetFieldId: number }[]; actions?: { actionType: string; actionConfig?: any | null; targetPipelineId?: number | null; targetStageId?: number | null; titleTemplate?: string | null; copyAssignee?: number; fieldMaps?: { sourceFieldId: number; targetFieldId: number }[] }[]; }, userId: number): Promise<PipelineRule> {
    const mitraId = getMitraId();
    const now = new Date().toISOString();
    const result = await this.db.insert(pipelineRules).values({
      mitraId, pipelineId, name: data.name ?? null, triggerStageId: data.triggerStageId ?? null,
      triggerType: data.triggerType ?? "stage_enter",
      triggerConfig: data.triggerConfig != null ? JSON.stringify(data.triggerConfig) : null,
      actionType: data.actionType ?? "create_card",
      targetPipelineId: data.targetPipelineId ?? null, targetStageId: data.targetStageId ?? null,
      titleTemplate: data.titleTemplate ?? null, copyAssignee: data.copyAssignee ? 1 : 0,
      enabled: data.enabled === false ? 0 : 1,
      actionConfig: data.actionConfig != null ? JSON.stringify(data.actionConfig) : null,
      conditions: data.conditions != null ? JSON.stringify(data.conditions) : null,
      recurrence: parseRecurrence(data.recurrence),
      createdBy: userId, createdAt: now,
    } as any);
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(pipelineRules).where(and(eq(pipelineRules.id, insertId), eq(pipelineRules.mitraId, mitraId)));
    if (data.actions) await this.setRuleActions(row!.id, data.actions);
    return row!;
  }

  async updateRule(id: number, data: { name?: string | null; triggerStageId?: number | null; triggerType?: RuleTriggerType; triggerConfig?: any | null; actionType?: PipelineRuleActionType; targetPipelineId?: number | null; targetStageId?: number | null; titleTemplate?: string | null; copyAssignee?: boolean; enabled?: boolean; actionConfig?: any | null; conditions?: any | null; recurrence?: string; fieldMaps?: { sourceFieldId: number; targetFieldId: number }[]; actions?: { actionType: string; actionConfig?: any | null; targetPipelineId?: number | null; targetStageId?: number | null; titleTemplate?: string | null; copyAssignee?: number; fieldMaps?: { sourceFieldId: number; targetFieldId: number }[] }[]; }): Promise<PipelineRule> {
    const mitraId = getMitraId();
    const patch: any = { updatedAt: new Date().toISOString() };
    if (data.name !== undefined) patch.name = data.name;
    if (data.triggerStageId !== undefined) patch.triggerStageId = data.triggerStageId;
    if (data.triggerType !== undefined) patch.triggerType = data.triggerType;
    if (data.triggerConfig !== undefined) patch.triggerConfig = data.triggerConfig != null ? JSON.stringify(data.triggerConfig) : null;
    if (data.actionType !== undefined) patch.actionType = data.actionType;
    if (data.targetPipelineId !== undefined) patch.targetPipelineId = data.targetPipelineId;
    if (data.targetStageId !== undefined) patch.targetStageId = data.targetStageId;
    if (data.titleTemplate !== undefined) patch.titleTemplate = data.titleTemplate;
    if (data.copyAssignee !== undefined) patch.copyAssignee = data.copyAssignee ? 1 : 0;
    if (data.enabled !== undefined) patch.enabled = data.enabled ? 1 : 0;
    if (data.actionConfig !== undefined) patch.actionConfig = data.actionConfig != null ? JSON.stringify(data.actionConfig) : null;
    if (data.conditions !== undefined) patch.conditions = data.conditions != null ? JSON.stringify(data.conditions) : null;
    if (data.recurrence !== undefined) patch.recurrence = parseRecurrence(data.recurrence);
    await this.db.update(pipelineRules).set(patch).where(and(eq(pipelineRules.id, id), eq(pipelineRules.mitraId, mitraId)));
    const [row] = await this.db.select().from(pipelineRules).where(and(eq(pipelineRules.id, id), eq(pipelineRules.mitraId, mitraId)));
    if (!row) throw new Error("Rule tidak ditemukan");
    if (data.actions !== undefined) await this.setRuleActions(id, data.actions);
    return row;
  }

  async deleteRule(id: number): Promise<void> {
    const mitraId = getMitraId();
    await this.db.delete(pipelineRuleFires).where(and(eq(pipelineRuleFires.ruleId, id), eq(pipelineRuleFires.mitraId, mitraId)));
    await this.db.delete(pipelineRuleFieldMaps).where(and(eq(pipelineRuleFieldMaps.ruleId, id), eq(pipelineRuleFieldMaps.mitraId, mitraId)));
    await this.db.delete(pipelineRuleActions).where(and(eq(pipelineRuleActions.ruleId, id), eq(pipelineRuleActions.mitraId, mitraId)));
    await this.db.delete(pipelineRules).where(and(eq(pipelineRules.id, id), eq(pipelineRules.mitraId, mitraId)));
  }

  async listRuleActions(ruleId: number): Promise<PipelineRuleAction[]> {
    const mitraId = getMitraId();
    return this.db.select().from(pipelineRuleActions)
      .where(and(eq(pipelineRuleActions.mitraId, mitraId), eq(pipelineRuleActions.ruleId, ruleId)))
      .orderBy(asc(pipelineRuleActions.position), asc(pipelineRuleActions.id));
  }

  async listRuleActionsByRuleIds(ruleIds: number[]): Promise<Map<number, PipelineRuleAction[]>> {
    const map = new Map<number, PipelineRuleAction[]>();
    if (ruleIds.length === 0) return map;
    const mitraId = getMitraId();
    const rows = await this.db.select().from(pipelineRuleActions)
      .where(and(eq(pipelineRuleActions.mitraId, mitraId), inArray(pipelineRuleActions.ruleId, ruleIds)))
      .orderBy(asc(pipelineRuleActions.position), asc(pipelineRuleActions.id));
    for (const r of rows) {
      const list = map.get(r.ruleId) ?? [];
      list.push(r);
      map.set(r.ruleId, list);
    }
    return map;
  }

  async getActionFieldMaps(actionId: number): Promise<PipelineRuleFieldMap[]> {
    const mitraId = getMitraId();
    return this.db.select().from(pipelineRuleFieldMaps)
      .where(and(eq(pipelineRuleFieldMaps.mitraId, mitraId), eq(pipelineRuleFieldMaps.actionId, actionId)));
  }

  /** Replace ALL actions (and their field-maps) for a rule. */
  async setRuleActions(ruleId: number, actions: {
    actionType: string; actionConfig?: any | null;
    targetPipelineId?: number | null; targetStageId?: number | null;
    titleTemplate?: string | null; copyAssignee?: number;
    fieldMaps?: { sourceFieldId: number; targetFieldId: number }[];
  }[]): Promise<void> {
    const mitraId = getMitraId();
    await this.db.delete(pipelineRuleFieldMaps).where(and(eq(pipelineRuleFieldMaps.mitraId, mitraId), eq(pipelineRuleFieldMaps.ruleId, ruleId)));
    await this.db.delete(pipelineRuleActions).where(and(eq(pipelineRuleActions.mitraId, mitraId), eq(pipelineRuleActions.ruleId, ruleId)));
    const now = new Date().toISOString();
    for (let i = 0; i < actions.length; i++) {
      const a = actions[i];
      const res = await this.db.insert(pipelineRuleActions).values({
        mitraId, ruleId, position: i,
        actionType: a.actionType,
        actionConfig: a.actionConfig != null ? JSON.stringify(a.actionConfig) : null,
        targetPipelineId: a.targetPipelineId ?? null,
        targetStageId: a.targetStageId ?? null,
        titleTemplate: a.titleTemplate ?? null,
        copyAssignee: a.copyAssignee ? 1 : 0,
        createdAt: now,
      } as any);
      const actionId = Number((res[0] as any).insertId);
      if (a.actionType === "create_card" && a.fieldMaps?.length) {
        for (const m of a.fieldMaps) {
          await this.db.insert(pipelineRuleFieldMaps).values({
            mitraId, ruleId, actionId, sourceFieldId: m.sourceFieldId, targetFieldId: m.targetFieldId, createdAt: now,
          } as any);
        }
      }
    }
  }

  async hasRuleFired(ruleId: number, sourceCardId: number): Promise<boolean> {
    const mitraId = getMitraId();
    const rows = await this.db.select().from(pipelineRuleFires)
      .where(and(eq(pipelineRuleFires.mitraId, mitraId), eq(pipelineRuleFires.ruleId, ruleId), eq(pipelineRuleFires.sourceCardId, sourceCardId)));
    return rows.length > 0;
  }

  async recordRuleFire(ruleId: number, sourceCardId: number): Promise<void> {
    const mitraId = getMitraId();
    try {
      await this.db.insert(pipelineRuleFires).values({ mitraId, ruleId, sourceCardId, firedAt: new Date().toISOString() } as any);
    } catch (e: any) {
      const dup = e?.code === "ER_DUP_ENTRY" || e?.errno === 1062 || String(e?.message).includes("Duplicate");
      if (!dup) console.warn(`[automation] recordRuleFire failed (rule ${ruleId}, card ${sourceCardId}): ${e?.message}`);
    }
  }

  /** Clear on_reenter fires for stage_enter rules whose trigger stage == fromStageId, for this card. */
  async clearReentryFires(cardId: number, fromStageId: number, pipelineId: number): Promise<number> {
    const mitraId = getMitraId();
    const rules = await this.db.select({ id: pipelineRules.id }).from(pipelineRules)
      .where(and(
        eq(pipelineRules.mitraId, mitraId), eq(pipelineRules.pipelineId, pipelineId),
        eq(pipelineRules.triggerType, "stage_enter"), eq(pipelineRules.triggerStageId, fromStageId),
        eq(pipelineRules.recurrence, "on_reenter"),
      ));
    if (!rules.length) return 0;
    const result: any = await this.db.delete(pipelineRuleFires).where(and(
      eq(pipelineRuleFires.mitraId, mitraId), eq(pipelineRuleFires.sourceCardId, cardId),
      inArray(pipelineRuleFires.ruleId, rules.map((r) => r.id)),
    ));
    return Number(result?.[0]?.affectedRows ?? 0);
  }

  /** Clear fires for ALL stage_enter rules on `stageId` for this card (manual retrigger, any recurrence). */
  async clearStageFires(cardId: number, stageId: number, pipelineId: number): Promise<number> {
    const mitraId = getMitraId();
    const rules = await this.db.select({ id: pipelineRules.id }).from(pipelineRules)
      .where(and(
        eq(pipelineRules.mitraId, mitraId), eq(pipelineRules.pipelineId, pipelineId),
        eq(pipelineRules.triggerType, "stage_enter"), eq(pipelineRules.triggerStageId, stageId),
      ));
    if (!rules.length) return 0;
    const result: any = await this.db.delete(pipelineRuleFires).where(and(
      eq(pipelineRuleFires.mitraId, mitraId), eq(pipelineRuleFires.sourceCardId, cardId),
      inArray(pipelineRuleFires.ruleId, rules.map((r) => r.id)),
    ));
    return Number(result?.[0]?.affectedRows ?? 0);
  }

  async getRuleFire(ruleId: number, sourceCardId: number): Promise<PipelineRuleFire | null> {
    const mitraId = getMitraId();
    const rows = await this.db.select().from(pipelineRuleFires)
      .where(and(eq(pipelineRuleFires.mitraId, mitraId), eq(pipelineRuleFires.ruleId, ruleId), eq(pipelineRuleFires.sourceCardId, sourceCardId)));
    return rows[0] ?? null;
  }

  /** All fire rows for a rule, keyed by sourceCardId - batches the per-card getRuleFire in the
   *  time-trigger sweep (one query per rule instead of one per card). */
  async getRuleFiresForRule(ruleId: number): Promise<Map<number, PipelineRuleFire>> {
    const mitraId = getMitraId();
    const map = new Map<number, PipelineRuleFire>();
    const rows = await this.db.select().from(pipelineRuleFires)
      .where(and(eq(pipelineRuleFires.mitraId, mitraId), eq(pipelineRuleFires.ruleId, ruleId)));
    for (const r of rows) map.set(r.sourceCardId, r);
    return map;
  }

  /** Insert a fire row, or bump firedAt if one exists (for recurring time triggers). */
  async recordOrTouchRuleFire(ruleId: number, sourceCardId: number): Promise<void> {
    const mitraId = getMitraId();
    const now = new Date().toISOString();
    const existing = await this.getRuleFire(ruleId, sourceCardId);
    if (existing) {
      await this.db.update(pipelineRuleFires).set({ firedAt: now })
        .where(and(eq(pipelineRuleFires.id, existing.id), eq(pipelineRuleFires.mitraId, mitraId)));
      return;
    }
    try {
      await this.db.insert(pipelineRuleFires).values({ mitraId, ruleId, sourceCardId, firedAt: now } as any);
    } catch (e: any) {
      const dup = e?.code === "ER_DUP_ENTRY" || e?.errno === 1062 || String(e?.message).includes("Duplicate");
      if (!dup) console.warn(`[automation] recordOrTouchRuleFire failed (rule ${ruleId}, card ${sourceCardId}): ${e?.message}`);
    }
  }

  /** ALL enabled time-trigger rules across every mitra (tenant-agnostic - caller scopes per row). */
  async listAllTimeRules(): Promise<PipelineRule[]> {
    return this.db.select().from(pipelineRules)
      .where(and(eq(pipelineRules.triggerType, "time"), eq(pipelineRules.enabled, 1)))
      .orderBy(asc(pipelineRules.mitraId), asc(pipelineRules.id));
  }

  // ==================== PIPELINE TEMPLATES ====================

  async listTemplates(): Promise<PipelineTemplate[]> {
    const mitraId = getMitraId();
    return this.db.select().from(pipelineTemplates)
      .where(eq(pipelineTemplates.mitraId, mitraId))
      .orderBy(desc(pipelineTemplates.isBuiltin), asc(pipelineTemplates.name));
  }

  async getTemplate(id: number): Promise<PipelineTemplate | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(pipelineTemplates)
      .where(and(eq(pipelineTemplates.id, id), eq(pipelineTemplates.mitraId, mitraId)));
    return row;
  }

  async deleteTemplate(id: number): Promise<number> {
    const mitraId = getMitraId();
    const result: any = await this.db.delete(pipelineTemplates)
      .where(and(eq(pipelineTemplates.id, id), eq(pipelineTemplates.mitraId, mitraId), eq(pipelineTemplates.isBuiltin, 0)));
    return Number(result?.[0]?.affectedRows ?? 0);
  }

  /** Snapshot a pipeline's full structure (stages + fields + rules+actions+fieldMaps) into a template.
   *  fieldMaps are loaded per action using getActionFieldMaps(actionId) - the existing per-action reader. */
  async createTemplateFromPipeline(pipelineId: number, data: { name: string; description?: string | null }, userId: number): Promise<PipelineTemplate> {
    const mitraId = getMitraId();
    const [pipe] = await this.db.select().from(pipelines).where(and(eq(pipelines.id, pipelineId), eq(pipelines.mitraId, mitraId)));
    if (!pipe) throw new Error("Pipeline tidak ditemukan");
    const stages = await this.listStages(pipelineId);
    const fields = await this.listFields(pipelineId);
    const rules = await this.listRules(pipelineId);
    const rulesFull = [];
    for (const r of rules) {
      const actions = await this.listRuleActions(r.id);
      const actsWithMaps = [];
      for (const a of actions) {
        const fieldMaps = await this.getActionFieldMaps(a.id);
        actsWithMaps.push({
          ...a,
          actionConfig: a.actionConfig ? JSON.parse(a.actionConfig) : null,
          fieldMaps: fieldMaps.map((m) => ({ sourceFieldId: m.sourceFieldId, targetFieldId: m.targetFieldId })),
        });
      }
      rulesFull.push({
        ...r,
        conditions: r.conditions ? JSON.parse(r.conditions) : null,
        triggerConfig: r.triggerConfig ? JSON.parse(r.triggerConfig) : null,
        actions: actsWithMaps,
      });
    }
    const def = pipelineToTemplate({
      pipeline: { name: pipe.name, description: pipe.description ?? null, color: pipe.color, icon: pipe.icon ?? null },
      stages: stages.map((s) => ({ ...s, description: s.description ?? null })),
      fields: fields.map((f) => ({ ...f, required: f.required ?? 0, showOnCard: f.showOnCard ?? 0 })),
      rules: rulesFull,
    });
    const now = new Date().toISOString();
    const result = await this.db.insert(pipelineTemplates).values({
      mitraId, name: data.name, description: data.description ?? null,
      icon: pipe.icon ?? null, color: pipe.color, definition: JSON.stringify(def), isBuiltin: 0, createdBy: userId, createdAt: now,
    } as any);
    const insertId = Number((result[0] as any).insertId);
    return (await this.getTemplate(insertId))!;
  }

  /** Instantiate a template: create a new pipeline with stages, fields, and rules cloned from the template.
   *  Two-pass field config remap: first pass may miss forward-references, second pass fixes them. */
  async instantiateTemplate(templateId: number, data: { name: string; color?: string; icon?: string }, userId: number): Promise<Pipeline> {
    const tpl = await this.getTemplate(templateId);
    if (!tpl) throw new Error("Template tidak ditemukan");
    const def = JSON.parse(tpl.definition) as TemplateDefinition;
    // 1. pipeline
    const pipeline = await this.createPipeline({
      name: data.name, description: def.pipeline.description ?? undefined,
      color: data.color ?? def.pipeline.color, icon: data.icon ?? def.pipeline.icon ?? undefined,
    }, userId);
    // 2. stages → key→id
    const stageKeyToId = new Map<string, number>();
    for (const s of def.stages) {
      const created = await this.createStage(pipeline.id, { label: s.label, color: s.color, description: s.description });
      stageKeyToId.set(s.key, created.id);
    }
    // 3. fields → key→id (config remapped with whatever keys are known so far)
    const fieldKeyToId = new Map<string, number>();
    for (const f of def.fields) {
      const created = await this.createField(pipeline.id, {
        label: f.label, type: f.type,
        options: f.options ? (JSON.parse(f.options) as string[]) : null,
        required: f.required === 1, showOnCard: f.showOnCard === 1,
        config: remapFieldConfig(f.config, fieldKeyToId, stageKeyToId),
      });
      fieldKeyToId.set(f.key, created.id);
    }
    // Second pass: fix any field configs that referenced later fields (forward-references).
    for (const f of def.fields) {
      if (!f.config) continue;
      const remapped = remapFieldConfig(f.config, fieldKeyToId, stageKeyToId);
      const fid = fieldKeyToId.get(f.key)!;
      await this.updateField(fid, { config: remapped });
    }
    // 4. rules
    for (const r of def.rules) {
      const ruleData = remapTemplateRule(r, fieldKeyToId, stageKeyToId);
      await this.createRule(pipeline.id, ruleData as any, userId);
    }
    return pipeline;
  }

  /** Batched assignee lookup untuk multiple collections (anti N+1).
   *  Return Map<collectionId, Array<{userId, userName, username}>>. */
  async getAssigneesByCollectionIds(collectionIds: number[]): Promise<Map<number, Array<{ userId: number; userName: string; username: string }>>> {
    const map = new Map<number, Array<{ userId: number; userName: string; username: string }>>();
    if (collectionIds.length === 0) return map;
    const mitraId = getMitraId();
    // Chunk IN(...): sql.join membangun 1 fragment per id, dan menyebar puluhan ribu
    // argumen ke builder -> "Maximum call stack size exceeded". Batasi 500/batch supaya
    // aman berapa pun jumlah id yang masuk. (fix 2026-07-24)
    const CHUNK = 500;
    for (let i = 0; i < collectionIds.length; i += CHUNK) {
      const batch = collectionIds.slice(i, i + CHUNK);
      const rows: any = ((await this.db.execute(sql`
        SELECT ca.collection_id AS collectionId, ca.user_id AS userId,
          COALESCE(u.name, u.username, 'unknown') AS userName,
          COALESCE(u.username, 'unknown') AS username,
          ca.assigned_at AS assignedAt
        FROM collection_assignees ca
        LEFT JOIN users u ON u.id = ca.user_id
        WHERE ca.mitra_id = ${mitraId} AND ca.collection_id IN (${sql.join(batch.map((id) => sql`${id}`), sql`, `)})
        ORDER BY ca.collection_id, ca.assigned_at ASC
      `))[0] as any);
      for (const r of rows as any[]) {
        const cid = Number(r.collectionId);
        const arr = map.get(cid) ?? [];
        arr.push({ userId: Number(r.userId), userName: String(r.userName), username: String(r.username) });
        map.set(cid, arr);
      }
    }
    return map;
  }

  async getCollectionAssignees(collectionId: number): Promise<Array<{ userId: number; userName: string; username: string }>> {
    const map = await this.getAssigneesByCollectionIds([collectionId]);
    return map.get(collectionId) ?? [];
  }

  /** Replace assignee set untuk 1 collection. byUserId = siapa yang melakukan assignment (untuk audit).
   *  Side effect: update collections.assigned_to = userIds[0] (primary) atau null kalau kosong.
   *  Return final list assignees + activity log. */
  async setCollectionAssignees(collectionId: number, userIds: number[], byUserId: number | null): Promise<Array<{ userId: number; userName: string; username: string }>> {
    const mitraId = getMitraId();
    const col = await this.getCollection(collectionId);
    if (!col) throw new Error("Collection tidak ditemukan");
    const now = new Date().toISOString();
    const cleanUserIds = Array.from(new Set(userIds.filter((u) => Number.isFinite(u) && u > 0)));

    const conn = await this.pool.getConnection();
    await conn.beginTransaction();
    try {
      const [currentRows]: any = await conn.execute(
        `SELECT user_id FROM collection_assignees WHERE collection_id = ? AND mitra_id = ?`,
        [collectionId, mitraId],
      );
      const currentIds = new Set<number>((currentRows as any[]).map((r) => Number(r.user_id)));
      const newSet = new Set<number>(cleanUserIds);
      const toAdd = cleanUserIds.filter((u) => !currentIds.has(u));
      const toRemove = Array.from(currentIds).filter((u) => !newSet.has(u));

      for (const uid of toAdd) {
        await conn.execute(
          `INSERT IGNORE INTO collection_assignees (mitra_id, collection_id, user_id, assigned_by, assigned_at) VALUES (?, ?, ?, ?, ?)`,
          [mitraId, collectionId, uid, byUserId, now],
        );
      }
      if (toRemove.length > 0) {
        await conn.execute(
          `DELETE FROM collection_assignees WHERE collection_id = ? AND mitra_id = ? AND user_id IN (${toRemove.map(() => "?").join(",")})`,
          [collectionId, mitraId, ...toRemove],
        );
      }
      // Update collections.assigned_to ke primary (= first/earliest assignee setelah update)
      // Pakai MAX(assigned_at)/MIN logic - ambil yang earliest assigned_at sebagai primary
      const [primaryRows]: any = await conn.execute(
        `SELECT user_id FROM collection_assignees WHERE collection_id = ? AND mitra_id = ? ORDER BY assigned_at ASC LIMIT 1`,
        [collectionId, mitraId],
      );
      const primary = (primaryRows as any[])[0]?.user_id ?? null;
      await conn.execute(
        `UPDATE collections SET assigned_to = ?, assigned_by = ?, assigned_at = ?, updated_at = ? WHERE id = ? AND mitra_id = ?`,
        [primary, byUserId, primary ? now : null, now, collectionId, mitraId],
      );
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    // Activity log (outside tx - fire-and-forget)
    await this.createCollectionActivity({
      collectionId,
      userId: byUserId,
      type: "assigned",
      content: JSON.stringify({ assigneeIds: cleanUserIds }),
      createdAt: now,
    } as any);

    return this.getCollectionAssignees(collectionId);
  }

  // ===== Card Relations (Phase 5) =====

  async listCardRelations(cardId: number): Promise<CardRelation[]> {
    const mitraId = getMitraId();
    return this.db.select().from(cardRelations)
      .where(and(eq(cardRelations.mitraId, mitraId), eq(cardRelations.cardId, cardId)))
      .orderBy(asc(cardRelations.id));
  }

  async entityExistsInMitra(entityType: string, entityId: number): Promise<boolean> {
    const mitraId = getMitraId();
    const tbl: any = entityType === "customer" ? customers
      : entityType === "lead" ? leads
      : entityType === "collection" ? collections
      : entityType === "odp" ? odps
      : entityType === "card" ? pipelineCards
      : null;
    if (!tbl) return false;
    const rows = await this.db.select({ id: tbl.id }).from(tbl)
      .where(and(eq(tbl.mitraId, mitraId), eq(tbl.id, entityId)));
    return rows.length > 0;
  }

  async addCardRelation(cardId: number, data: { entityType: string; entityId: number; label?: string | null }, userId: number): Promise<CardRelation> {
    const mitraId = getMitraId();
    const now = new Date().toISOString();
    const result = await this.db.insert(cardRelations).values({
      mitraId, cardId, entityType: data.entityType, entityId: data.entityId,
      label: data.label ?? null, createdBy: userId, createdAt: now,
    } as any);
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(cardRelations).where(and(eq(cardRelations.id, insertId), eq(cardRelations.mitraId, mitraId)));
    return row!;
  }

  async deleteCardRelation(cardId: number, relationId: number): Promise<number> {
    const mitraId = getMitraId();
    const result: any = await this.db.delete(cardRelations)
      .where(and(eq(cardRelations.id, relationId), eq(cardRelations.mitraId, mitraId), eq(cardRelations.cardId, cardId)));
    return Number(result?.[0]?.affectedRows ?? 0);
  }

  async resolveRelationLabels(
    relations: { entityType: string; entityId: number }[],
  ): Promise<Map<string, { label: string; subtitle: string | null; pipelineId: number | null }>> {
    const mitraId = getMitraId();
    const key = (t: string, id: number) => `${t}:${id}`;
    const out = new Map<string, { label: string; subtitle: string | null; pipelineId: number | null }>();
    const idsByType = new Map<string, number[]>();
    for (const r of relations) {
      if (!idsByType.has(r.entityType)) idsByType.set(r.entityType, []);
      idsByType.get(r.entityType)!.push(r.entityId);
    }

    const custIds = idsByType.get("customer") ?? [];
    if (custIds.length) {
      const rows = await this.db.select({ id: customers.id, name: customers.name, cid: customers.customerId })
        .from(customers).where(and(eq(customers.mitraId, mitraId), inArray(customers.id, custIds)));
      for (const r of rows) out.set(key("customer", r.id), { label: r.name ?? `Pelanggan #${r.id}`, subtitle: r.cid ?? null, pipelineId: null });
    }
    const leadIds = idsByType.get("lead") ?? [];
    if (leadIds.length) {
      const rows = await this.db.select({ id: leads.id, name: leads.name, phone: leads.phone })
        .from(leads).where(and(eq(leads.mitraId, mitraId), inArray(leads.id, leadIds)));
      for (const r of rows) out.set(key("lead", r.id), { label: r.name ?? `Lead #${r.id}`, subtitle: r.phone ?? null, pipelineId: null });
    }
    const odpIds = idsByType.get("odp") ?? [];
    if (odpIds.length) {
      const rows = await this.db.select({ id: odps.id, name: odps.name, code: odps.code })
        .from(odps).where(and(eq(odps.mitraId, mitraId), inArray(odps.id, odpIds)));
      for (const r of rows) out.set(key("odp", r.id), { label: r.name ?? `ODP #${r.id}`, subtitle: r.code ?? null, pipelineId: null });
    }
    const cardIds = idsByType.get("card") ?? [];
    if (cardIds.length) {
      const rows = await this.db.select({ id: pipelineCards.id, title: pipelineCards.title, pid: pipelineCards.pipelineId })
        .from(pipelineCards).where(and(eq(pipelineCards.mitraId, mitraId), inArray(pipelineCards.id, cardIds)));
      for (const r of rows) out.set(key("card", r.id), { label: r.title ?? `Kartu #${r.id}`, subtitle: null, pipelineId: r.pid });
    }
    const colIds = idsByType.get("collection") ?? [];
    if (colIds.length) {
      const cols = await this.db.select({ id: collections.id, customerId: collections.customerId, stage: collections.stage })
        .from(collections).where(and(eq(collections.mitraId, mitraId), inArray(collections.id, colIds)));
      const colCustIds = [...new Set(cols.map((c) => c.customerId).filter((x): x is number => x != null))];
      const custMap = new Map<number, string>();
      if (colCustIds.length) {
        const crows = await this.db.select({ id: customers.id, name: customers.name })
          .from(customers).where(and(eq(customers.mitraId, mitraId), inArray(customers.id, colCustIds)));
        for (const cr of crows) custMap.set(cr.id, cr.name ?? `Pelanggan #${cr.id}`);
      }
      for (const c of cols) {
        const name = c.customerId != null ? (custMap.get(c.customerId) ?? `Penagihan #${c.id}`) : `Penagihan #${c.id}`;
        out.set(key("collection", c.id), { label: name, subtitle: `Penagihan #${c.id}${c.stage ? ` · ${c.stage}` : ""}`, pipelineId: null });
      }
    }
    return out;
  }

  async searchRelatableEntities(entityType: string, q: string): Promise<{ id: number; label: string; subtitle: string | null; pipelineId?: number }[]> {
    const mitraId = getMitraId();
    const lk = `%${q}%`;
    if (entityType === "customer") {
      const rows = await this.db.select({ id: customers.id, name: customers.name, cid: customers.customerId })
        .from(customers).where(and(eq(customers.mitraId, mitraId), or(like(customers.name, lk), like(customers.customerId, lk)))).limit(20);
      return rows.map((r) => ({ id: r.id, label: r.name ?? `Pelanggan #${r.id}`, subtitle: r.cid ?? null }));
    }
    if (entityType === "lead") {
      const rows = await this.db.select({ id: leads.id, name: leads.name, phone: leads.phone })
        .from(leads).where(and(eq(leads.mitraId, mitraId), like(leads.name, lk))).limit(20);
      return rows.map((r) => ({ id: r.id, label: r.name ?? `Lead #${r.id}`, subtitle: r.phone ?? null }));
    }
    if (entityType === "odp") {
      const rows = await this.db.select({ id: odps.id, name: odps.name, code: odps.code })
        .from(odps).where(and(eq(odps.mitraId, mitraId), or(like(odps.name, lk), like(odps.code, lk)))).limit(20);
      return rows.map((r) => ({ id: r.id, label: r.name ?? `ODP #${r.id}`, subtitle: r.code ?? null }));
    }
    if (entityType === "card") {
      const rows = await this.db.select({ id: pipelineCards.id, title: pipelineCards.title, pid: pipelineCards.pipelineId })
        .from(pipelineCards).where(and(eq(pipelineCards.mitraId, mitraId), like(pipelineCards.title, lk))).limit(20);
      return rows.map((r) => ({ id: r.id, label: r.title ?? `Kartu #${r.id}`, subtitle: null, pipelineId: r.pid }));
    }
    if (entityType === "collection") {
      const rows = await this.db.select({ id: collections.id, customerId: collections.customerId })
        .from(collections).where(eq(collections.mitraId, mitraId)).limit(50);
      const custIds = [...new Set(rows.map((r) => r.customerId).filter((x): x is number => x != null))];
      const custMap = new Map<number, string>();
      if (custIds.length) {
        const crows = await this.db.select({ id: customers.id, name: customers.name })
          .from(customers).where(and(eq(customers.mitraId, mitraId), inArray(customers.id, custIds)));
        for (const cr of crows) custMap.set(cr.id, cr.name ?? "");
      }
      return rows
        .map((r) => ({ id: r.id, label: r.customerId != null ? (custMap.get(r.customerId) || `Penagihan #${r.id}`) : `Penagihan #${r.id}`, subtitle: `Penagihan #${r.id}` }))
        .filter((x) => x.label.toLowerCase().includes(q.toLowerCase()) || x.subtitle.toLowerCase().includes(q.toLowerCase()))
        .slice(0, 20);
    }
    return [];
  }

  // ==================== CUSTOMER PORTAL (v4.1.3) ====================

  // TODO Phase G: caller must pass mitraId from URL slug - defaults to 1 for legacy compat
  async getCustomerByBillingCustomerId(customerIdStr: string, mitraId: number = 1): Promise<Customer | undefined> {
    const [row] = await this.db.select().from(customers).where(and(eq(customers.customerId, customerIdStr), eq(customers.mitraId, mitraId))).limit(1);
    return row;
  }

  async createCustomerOtp(data: InsertCustomerOtp): Promise<CustomerOtp> {
    const mitraId = getMitraId();
    const result = await this.db.insert(customerOtps).values({
      ...data,
      mitraId,
      createdAt: data.createdAt ?? new Date().toISOString(),
    } as any);
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(customerOtps).where(eq(customerOtps.id, insertId));
    return row!;
  }

  async getCustomerOtp(id: number): Promise<CustomerOtp | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(customerOtps).where(and(eq(customerOtps.id, id), eq(customerOtps.mitraId, mitraId))).limit(1);
    return row;
  }

  async updateCustomerOtp(id: number, data: Partial<CustomerOtp>): Promise<CustomerOtp | undefined> {
    const mitraId = getMitraId();
    await this.db.update(customerOtps).set(data as any).where(and(eq(customerOtps.id, id), eq(customerOtps.mitraId, mitraId)));
    const [row] = await this.db.select().from(customerOtps).where(and(eq(customerOtps.id, id), eq(customerOtps.mitraId, mitraId)));
    return row;
  }

  async countRecentOtpRequests(customerId: number, sinceMinutes: number): Promise<number> {
    const mitraId = getMitraId();
    const since = new Date(Date.now() - sinceMinutes * 60_000).toISOString();
    const rows = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(customerOtps)
      .where(and(eq(customerOtps.customerId, customerId), eq(customerOtps.mitraId, mitraId), sql`${customerOtps.createdAt} > ${since}`));
    return Number(rows[0]?.count ?? 0);
  }

  async createCustomerPortalSession(data: InsertCustomerPortalSession): Promise<CustomerPortalSession> {
    const mitraId = getMitraId();
    const result = await this.db.insert(customerPortalSessions).values({
      ...data,
      mitraId,
      createdAt: data.createdAt ?? new Date().toISOString(),
    } as any);
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(customerPortalSessions).where(eq(customerPortalSessions.id, insertId));
    return row!;
  }

  async getCustomerPortalSessionByToken(token: string): Promise<CustomerPortalSession | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(customerPortalSessions)
      .where(and(eq(customerPortalSessions.token, token), eq(customerPortalSessions.mitraId, mitraId), sql`${customerPortalSessions.revokedAt} IS NULL`))
      .limit(1);
    return row;
  }

  async touchCustomerPortalSession(token: string): Promise<void> {
    const mitraId = getMitraId();
    await this.db.update(customerPortalSessions)
      .set({ lastActivityAt: new Date().toISOString() })
      .where(and(eq(customerPortalSessions.token, token), eq(customerPortalSessions.mitraId, mitraId)));
  }

  async revokeCustomerPortalSession(token: string): Promise<void> {
    const mitraId = getMitraId();
    await this.db.update(customerPortalSessions)
      .set({ revokedAt: new Date().toISOString() })
      .where(and(eq(customerPortalSessions.token, token), eq(customerPortalSessions.mitraId, mitraId)));
  }

  async addTrafficSnapshot(data: InsertTrafficSnapshot): Promise<TrafficSnapshot> {
    const mitraId = getMitraId();
    const result = await this.db.insert(trafficSnapshots).values({
      ...data,
      mitraId,
      timestamp: data.timestamp ?? new Date().toISOString(),
    } as any);
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(trafficSnapshots).where(eq(trafficSnapshots.id, insertId));
    return row!;
  }

  async getTrafficLast24h(customerId: number): Promise<TrafficSnapshot[]> {
    const mitraId = getMitraId();
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    return this.db.select().from(trafficSnapshots)
      .where(and(eq(trafficSnapshots.customerId, customerId), eq(trafficSnapshots.mitraId, mitraId), sql`${trafficSnapshots.timestamp} > ${since}`))
      .orderBy(trafficSnapshots.timestamp);
  }

  async cleanupOldTrafficSnapshots(retentionHours: number = 24): Promise<number> {
    const mitraId = getMitraId();
    const since = new Date(Date.now() - retentionHours * 3600_000).toISOString();
    const [result] = await this.db.delete(trafficSnapshots)
      .where(and(sql`${trafficSnapshots.timestamp} < ${since}`, eq(trafficSnapshots.mitraId, mitraId)));
    return (result as any).affectedRows ?? 0;
  }

  async countOntRestartsLastHour(customerId: number): Promise<number> {
    // auditLogs is a global table (no mitra_id) - no mitra filter here
    const since = new Date(Date.now() - 3600_000).toISOString();
    const rows = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(auditLogs)
      .where(and(
        eq(auditLogs.entityType, "portal_ont_restart"),
        eq(auditLogs.entityId, customerId),
        sql`${auditLogs.createdAt} > ${since}`,
      ));
    return Number(rows[0]?.count ?? 0);
  }

  // ==================== LOYALTY - JABNET SAHABAT (v4.1.9) ====================
  // Program resmi: 3 tier + 5 level (Perunggu/Perak/Emas/Platinum/Berlian)
  // Reward per referral sukses default: Voucher Indomaret Rp 50.000
  // Milestone bonus saat naik level.

  /** Map kode kecamatan Garut → 3-huruf kode Sahabat.
   *  Default "JBT" kalau kecamatan tidak dikenal. */
  private getKecamatanCode(area: string | null | undefined): string {
    if (!area) return "JBT";
    const a = String(area).toUpperCase();
    const map: Record<string, string> = {
      "TAROGONG KALER": "TRK", "TAROGONG KIDUL": "TRG", "GARUT KOTA": "GRT",
      "KARANGPAWITAN": "KPW", "BANYURESMI": "BYR", "WANARAJA": "WNR",
      "LELES": "LLS", "LEUWIGOONG": "LWG", "CIBIUK": "CBK", "KADUNGORA": "KDG",
      "CISURUPAN": "CSR", "CIKAJANG": "CKJ", "CILAWU": "CLW", "BAYONGBONG": "BYB",
      "SAMARANG": "SMR", "PASIRWANGI": "PSW", "BUNGBULANG": "BGB", "PAKENJENG": "PKJ",
      "CISOMPET": "CSM", "PAMEUNGPEUK": "PMP", "CIBALONG": "CBL", "SINGAJAYA": "SGJ",
      "BANJARWANGI": "BJW", "CIBATU": "CBT", "MALANGBONG": "MLB",
    };
    for (const k of Object.keys(map)) {
      if (a.includes(k)) return map[k];
    }
    // Fallback: ambil 3 huruf pertama
    return a.replace(/[^A-Z]/g, "").slice(0, 3).padEnd(3, "X");
  }

  /** Generate kode Sahabat format "SHB-XXX-NNN".
   *  XXX = kode kecamatan, NNN = sequence 3 digit per-kecamatan. */
  private async generateSahabatCode(customer: Customer): Promise<string> {
    const c = customer as any;
    // Cari dari berbagai field yg mungkin (district utama), fallback ke address parse
    const area = c.district ?? c.kecamatan ?? c.area ?? c.village ?? c.address ?? null;
    const kode = this.getKecamatanCode(area);
    // Count existing codes dengan prefix SHB-{kode}-
    const rows: any = (await this.db.execute(sql`
      SELECT COUNT(*) AS n FROM customer_loyalty
      WHERE sahabat_code LIKE ${`SHB-${kode}-%`}
    `))[0];
    let seq = Number(rows?.[0]?.n ?? 0) + 1;
    for (let attempt = 0; attempt < 20; attempt++) {
      const code = `SHB-${kode}-${String(seq).padStart(3, "0")}`;
      const [exists] = await this.db.select().from(customerLoyalty).where(eq(customerLoyalty.sahabatCode, code));
      if (!exists) return code;
      seq += 1;
    }
    return `SHB-${kode}-${Date.now().toString().slice(-4)}`;
  }

  /** Compute Sahabat level dari jumlah referral sukses.
   *  Program: 5=Perunggu, 10=Perak, 20=Emas, 30=Platinum, 50=Berlian (setelah itu Ambassador). */
  private computeSahabatLevel(successfulReferrals: number): {
    level: "new" | "perunggu" | "perak" | "emas" | "platinum" | "berlian" | "ambassador";
    nextThreshold: number | null;
  } {
    if (successfulReferrals >= 100) return { level: "ambassador", nextThreshold: null };
    if (successfulReferrals >= 50) return { level: "berlian", nextThreshold: 100 };
    if (successfulReferrals >= 30) return { level: "platinum", nextThreshold: 50 };
    if (successfulReferrals >= 20) return { level: "emas", nextThreshold: 30 };
    if (successfulReferrals >= 10) return { level: "perak", nextThreshold: 20 };
    if (successfulReferrals >= 5) return { level: "perunggu", nextThreshold: 10 };
    return { level: "new", nextThreshold: 5 };
  }

  /** Compute tenure (legacy, hanya untuk display "lama berlangganan"). */
  private computeTenureBadge(installDate: string | null | undefined): { badge: string; months: number } {
    if (!installDate) return { badge: "tetangga", months: 0 };
    const installMs = new Date(installDate).getTime();
    if (isNaN(installMs)) return { badge: "tetangga", months: 0 };
    const months = Math.floor((Date.now() - installMs) / (30.44 * 86400_000));
    let badge = "tetangga";                       // 0-11 bulan
    if (months >= 60) badge = "abadi";            // 5+ tahun
    else if (months >= 36) badge = "sahabat";     // 3-5 tahun
    else if (months >= 12) badge = "keluarga";    // 1-3 tahun
    return { badge, months };
  }

  /** Get or create loyalty record + auto-generate Sahabat code. */
  async getOrCreateCustomerLoyalty(customerId: number): Promise<CustomerLoyalty> {
    const mitraId = getMitraId();
    const [existing] = await this.db.select().from(customerLoyalty).where(eq(customerLoyalty.customerId, customerId));
    if (existing) {
      // Backfill kalau lama belum punya sahabatCode
      if (!(existing as any).sahabatCode) {
        const customer = await this.getCustomer(customerId);
        if (customer) {
          const sahabatCode = await this.generateSahabatCode(customer);
          await this.db.update(customerLoyalty)
            .set({ sahabatCode, referralCode: sahabatCode, updatedAt: new Date().toISOString() } as any)
            .where(eq(customerLoyalty.customerId, customerId));
          (existing as any).sahabatCode = sahabatCode;
          (existing as any).referralCode = sahabatCode;
        }
      }
      return existing;
    }
    const customer = await this.getCustomer(customerId);
    if (!customer) throw new Error("Customer tidak ditemukan");
    const sahabatCode = await this.generateSahabatCode(customer);
    const { badge, months } = this.computeTenureBadge((customer as any).installDate);
    const now = new Date().toISOString();
    await this.db.insert(customerLoyalty).values({
      customerId,
      mitraId,
      referralCode: sahabatCode,         // legacy field - simpan sama
      sahabatCode,
      sahabatTier: "pelanggan",
      sahabatLevel: "new",
      totalSuccessfulReferrals: 0,
      tenureBadge: badge,
      tenureMonths: months,
      createdAt: now,
      updatedAt: now,
    } as any);
    const [row] = await this.db.select().from(customerLoyalty).where(eq(customerLoyalty.customerId, customerId));
    return row!;
  }

  /** Refresh tenure months (legacy display). */
  async refreshTenureBadge(customerId: number): Promise<void> {
    const customer = await this.getCustomer(customerId);
    if (!customer) return;
    const { badge, months } = this.computeTenureBadge((customer as any).installDate);
    await this.db.update(customerLoyalty)
      .set({ tenureBadge: badge, tenureMonths: months, updatedAt: new Date().toISOString() })
      .where(eq(customerLoyalty.customerId, customerId));  // customer_loyalty PK is customerId - no mitraId filter needed (unique per customer)
  }

  /** Evaluasi payment untuk customer - update streak + generate discount kalau milestone + kirim MPWA.
   *  Dipanggil dari BillingSyncWorker saat ada transition "payment_received".
   */
  async evaluatePaymentForLoyalty(
    customerId: number,
    paymentDate: string,
    dueDate: string | null | undefined,
  ): Promise<{ streakChanged: boolean; newStreak: number; discountGenerated?: CustomerDiscount; milestoneKey?: string }> {
    const mitraId = getMitraId();
    const loyalty = await this.getOrCreateCustomerLoyalty(customerId);

    // Guard idempotency - kalau paymentDate sudah diproses, skip
    if (loyalty.lastPaymentEvaluatedDate === paymentDate) {
      return { streakChanged: false, newStreak: loyalty.onTimeStreak ?? 0 };
    }

    const paymentMs = new Date(paymentDate).getTime();
    const dueMs = dueDate ? new Date(dueDate).getTime() : NaN;
    const isOnTime = !isNaN(dueMs) ? paymentMs <= dueMs : true; // kalau tidak ada dueDate, anggap on-time (benefit of doubt)

    const now = new Date().toISOString();
    let newStreak = loyalty.onTimeStreak ?? 0;
    let newLongest = loyalty.longestStreak ?? 0;
    let totalOnTime = loyalty.totalOnTimePayments ?? 0;
    let totalLate = loyalty.totalLatePayments ?? 0;

    if (isOnTime) {
      newStreak += 1;
      if (newStreak > newLongest) newLongest = newStreak;
      totalOnTime += 1;
    } else {
      newStreak = 0;
      totalLate += 1;
    }

    await this.db.update(customerLoyalty)
      .set({
        onTimeStreak: newStreak,
        longestStreak: newLongest,
        totalOnTimePayments: totalOnTime,
        totalLatePayments: totalLate,
        lastPaymentEvaluatedDate: paymentDate,
        updatedAt: now,
      })
      .where(eq(customerLoyalty.customerId, customerId));

    // Generate discount untuk milestone
    let discountGenerated: CustomerDiscount | undefined;
    let milestoneKey: string | undefined;
    const milestones: Record<number, { value: number; desc: string; source: string }> = {
      3: { value: 5, desc: "Hadiah streak 3 bulan bayar tepat waktu", source: "streak_3" },
      6: { value: 10, desc: "Hadiah streak 6 bulan bayar tepat waktu", source: "streak_6" },
      12: { value: 50, desc: "Anniversary! 12 bulan bayar tepat waktu", source: "streak_12" },
      24: { value: 100, desc: "Pelanggan Setia! 24 bulan tanpa telat - GRATIS 1 bulan", source: "streak_24" },
    };
    if (milestones[newStreak]) {
      const m = milestones[newStreak];
      milestoneKey = m.source;
      // Eligible untuk bulan berikutnya (setelah paymentDate)
      const nextMonth = new Date(paymentMs);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      const period = nextMonth.toISOString().slice(0, 7); // "YYYY-MM"
      const expiresAt = new Date(Date.now() + 90 * 86400_000).toISOString();
      // Check kalau sudah pernah di-generate untuk milestone ini (biar tidak double)
      const [already] = await this.db.select().from(customerDiscounts).where(and(
        eq(customerDiscounts.customerId, customerId),
        eq(customerDiscounts.mitraId, mitraId),
        eq(customerDiscounts.source, m.source),
        sql`${customerDiscounts.status} IN ('pending', 'applied')`,
      ));
      if (!already) {
        const discountInsertResult = await this.db.insert(customerDiscounts).values({
          customerId,
          mitraId,
          source: m.source,
          discountType: "percent",
          discountValue: m.value,
          description: m.desc,
          eligibleForPeriod: period,
          status: "pending",
          expiresAt,
          createdAt: now,
        } as any);
        const discountInsertId = Number((discountInsertResult[0] as any).insertId);
        const [discountRow] = await this.db.select().from(customerDiscounts).where(eq(customerDiscounts.id, discountInsertId));
        discountGenerated = discountRow!;
        console.log(`[Loyalty] ✓ Customer #${customerId} hit milestone ${newStreak} bulan → discount ${m.value}% for ${period}`);
      }
    }

    return { streakChanged: true, newStreak, discountGenerated, milestoneKey };
  }

  /** Refresh tenure months (legacy display) - tetap di-panggil BillingSyncWorker. */
  async refreshTenureBadgeWithUpgradeCheck(customerId: number): Promise<{
    upgraded: boolean;
    fromBadge: string;
    toBadge: string;
    months: number;
  }> {
    const customer = await this.getCustomer(customerId);
    if (!customer) return { upgraded: false, fromBadge: "tetangga", toBadge: "tetangga", months: 0 };
    // customer_loyalty.customerId is PK - no mitra filter needed on select
    const [loyalty] = await this.db.select().from(customerLoyalty).where(eq(customerLoyalty.customerId, customerId));
    const fromBadge = loyalty?.tenureBadge ?? "tetangga";
    const { badge, months } = this.computeTenureBadge((customer as any).installDate);
    if (badge !== fromBadge) {
      await this.db.update(customerLoyalty)
        .set({ tenureBadge: badge, tenureMonths: months, updatedAt: new Date().toISOString() })
        .where(eq(customerLoyalty.customerId, customerId));
      const ORDER = ["tetangga", "keluarga", "sahabat", "abadi"];
      const upgraded = ORDER.indexOf(badge) > ORDER.indexOf(fromBadge);
      return { upgraded, fromBadge, toBadge: badge, months };
    }
    await this.db.update(customerLoyalty)
      .set({ tenureMonths: months, updatedAt: new Date().toISOString() })
      .where(eq(customerLoyalty.customerId, customerId));
    return { upgraded: false, fromBadge, toBadge: badge, months };
  }

  /** Refresh Sahabat level berdasar totalSuccessfulReferrals.
   *  Return { upgraded, fromLevel, toLevel, count } untuk trigger notif.
   *  Auto-generate milestone bonus saat naik level (kalau belum pernah). */
  async refreshSahabatLevelWithUpgradeCheck(customerId: number): Promise<{
    upgraded: boolean;
    fromLevel: string;
    toLevel: string;
    count: number;
    milestoneDiscount?: CustomerDiscount;
  }> {
    const mitraId = getMitraId();
    const loyalty = await this.getOrCreateCustomerLoyalty(customerId);
    const count = (loyalty as any).totalSuccessfulReferrals ?? 0;
    const fromLevel = (loyalty as any).sahabatLevel ?? "new";
    const { level: toLevel } = this.computeSahabatLevel(count);
    const LEVEL_ORDER = ["new", "perunggu", "perak", "emas", "platinum", "berlian", "ambassador"];
    const upgraded = LEVEL_ORDER.indexOf(toLevel) > LEVEL_ORDER.indexOf(fromLevel);

    if (toLevel !== fromLevel) {
      const updates: any = { sahabatLevel: toLevel, updatedAt: new Date().toISOString() };
      // Saat pertama kali naik ke "perunggu" = auto-upgrade tier jadi RT/RW (sesuai program)
      if (upgraded && toLevel === "perunggu" && (loyalty as any).sahabatTier === "pelanggan") {
        updates.sahabatTier = "rtrw";
      }
      await this.db.update(customerLoyalty)
        .set(updates)
        .where(eq(customerLoyalty.customerId, customerId));
    }

    // Generate milestone bonus sekali-saja per level (idempotent via check exists)
    let milestoneDiscount: CustomerDiscount | undefined;
    if (upgraded && toLevel !== "new") {
      const now = new Date().toISOString();
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      const period = nextMonth.toISOString().slice(0, 7);
      const expiresAt = new Date(Date.now() + 180 * 86400_000).toISOString();

      // Reward tabel sesuai program JABNET Sahabat (Panduan)
      const rewards: Record<string, { source: string; type: string; value: number; desc: string }> = {
        perunggu: {
          source: "sahabat_perunggu",
          type: "voucher_indomaret",
          value: 200_000,
          desc: "Naik level Perunggu (5 referral sukses) - Voucher Indomaret Rp 200.000 + Speed Boost 2x/minggu",
        },
        perak: {
          source: "sahabat_perak",
          type: "free_days",
          value: 365,
          desc: "Naik level Perak (10 referral sukses) - Internet GRATIS 12 bulan + Sertifikat Mitra",
        },
        emas: {
          source: "sahabat_emas",
          type: "free_days",
          value: 730,
          desc: "Naik level Emas (20 referral sukses) - Internet GRATIS 24 bulan + Upgrade speed 1 tier permanen",
        },
        platinum: {
          source: "sahabat_platinum",
          type: "cash_bonus",
          value: 2_000_000,
          desc: "Naik level Platinum (30 referral sukses) - Internet GRATIS 36 bulan + Komisi cash Rp 2jt + Status Ambassador",
        },
        berlian: {
          source: "sahabat_berlian",
          type: "cash_bonus",
          value: 5_000_000,
          desc: "Naik level Berlian (50 referral sukses) - Internet GRATIS 60 bulan + Komisi cash Rp 5jt + Trainer program",
        },
      };
      const reward = rewards[toLevel];
      if (reward) {
        const [already] = await this.db.select().from(customerDiscounts).where(and(
          eq(customerDiscounts.customerId, customerId),
          eq(customerDiscounts.mitraId, mitraId),
          eq(customerDiscounts.source, reward.source),
        ));
        if (!already) {
          const milestoneInsertResult = await this.db.insert(customerDiscounts).values({
            customerId,
            mitraId,
            source: reward.source,
            discountType: reward.type,
            discountValue: reward.value,
            description: reward.desc,
            eligibleForPeriod: period,
            status: "pending",
            expiresAt,
            createdAt: now,
          } as any);
          const milestoneInsertId = Number((milestoneInsertResult[0] as any).insertId);
          const [milestoneRow] = await this.db.select().from(customerDiscounts).where(eq(customerDiscounts.id, milestoneInsertId));
          milestoneDiscount = milestoneRow!;
          console.log(`[Sahabat] ✓ Customer #${customerId} naik level ${fromLevel} → ${toLevel} (${count} ref) - milestone bonus generated`);
        }
      }
    }

    return { upgraded, fromLevel, toLevel, count, milestoneDiscount };
  }

  /** Atomic points adjust dengan reason - block kalau result < 0.
   *  Tulis row di point_transactions source='manual_adjust'. */
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

  /** List pending/applied discounts untuk customer */
  async getCustomerDiscounts(
    customerId: number,
    options?: { status?: string; limit?: number; includeDeleted?: boolean },
  ): Promise<CustomerDiscount[]> {
    const mitraId = getMitraId();
    const conds: any[] = [eq(customerDiscounts.customerId, customerId), eq(customerDiscounts.mitraId, mitraId)];
    if (options?.status) conds.push(eq(customerDiscounts.status, options.status));
    if (!options?.includeDeleted) conds.push(isNull(customerDiscounts.deletedAt));
    return this.db.select().from(customerDiscounts)
      .where(and(...conds))
      .orderBy(desc(customerDiscounts.createdAt))
      .limit(options?.limit ?? 50);
  }

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

  /** Create referral invitation (customer input phone tetangga) */
  async createReferralInvitation(data: {
    referrerCustomerId: number;
    refereePhone?: string;
    refereeName?: string;
    notes?: string;
  }): Promise<CustomerReferral> {
    const mitraId = getMitraId();
    const loyalty = await this.getOrCreateCustomerLoyalty(data.referrerCustomerId);
    const refInsertResult = await this.db.insert(customerReferrals).values({
      referrerCustomerId: data.referrerCustomerId,
      mitraId,
      referralCode: loyalty.referralCode!,
      refereePhone: data.refereePhone ?? null,
      refereeName: data.refereeName ?? null,
      notes: data.notes ?? null,
      status: "invited",
      createdAt: new Date().toISOString(),
    } as any);
    const refInsertId = Number((refInsertResult[0] as any).insertId);
    const [row] = await this.db.select().from(customerReferrals).where(eq(customerReferrals.id, refInsertId));
    return row!;
  }

  async getReferralsByCustomer(customerId: number): Promise<CustomerReferral[]> {
    const mitraId = getMitraId();
    return this.db.select().from(customerReferrals)
      .where(and(eq(customerReferrals.referrerCustomerId, customerId), eq(customerReferrals.mitraId, mitraId)))
      .orderBy(desc(customerReferrals.createdAt));
  }

  async getReferralByCode(code: string): Promise<CustomerLoyalty | null> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(customerLoyalty).where(and(eq(customerLoyalty.referralCode, code), eq(customerLoyalty.mitraId, mitraId)));
    return row ?? null;
  }

  /** Auto-link pending referral ke customer yang baru terdaftar berdasarkan match phone.
   *  Dipanggil dari BillingSyncWorker saat ada customer baru (action=created).
   *  Return array of linked referrals. */
  async autoLinkPendingReferralsByPhone(customerId: number, customerPhone: string | null): Promise<CustomerReferral[]> {
    const mitraId = getMitraId();
    if (!customerPhone) return [];
    // Normalisasi phone: buang "-", " ", "+"
    const normalized = customerPhone.replace(/[\s\-+]/g, "");
    // Cari pending referral yang phone-nya cocok (exact atau suffix 10 digit terakhir untuk toleransi prefix 62/0)
    const rows = await this.db.select().from(customerReferrals).where(and(
      eq(customerReferrals.status, "invited"),
      eq(customerReferrals.mitraId, mitraId),
      sql`${customerReferrals.refereePhone} IS NOT NULL`,
    ));
    const linked: CustomerReferral[] = [];
    for (const r of rows) {
      const refNorm = (r.refereePhone ?? "").replace(/[\s\-+]/g, "");
      // Match kalau 9 digit terakhir sama (handle 08... vs 628...)
      const refSuffix = refNorm.slice(-9);
      const custSuffix = normalized.slice(-9);
      if (refSuffix && refSuffix === custSuffix) {
        await this.db.update(customerReferrals)
          .set({
            refereeCustomerId: customerId,
            status: "registered",
          })
          .where(eq(customerReferrals.id, r.id));
        // Juga update customer_loyalty.referred_by → referrer
        await this.getOrCreateCustomerLoyalty(customerId);
        await this.db.update(customerLoyalty)
          .set({
            referredByCustomerId: r.referrerCustomerId,
            referredAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
          .where(eq(customerLoyalty.customerId, customerId));
        linked.push({ ...r, refereeCustomerId: customerId, status: "registered" });
        console.log(`[Loyalty] ✓ Auto-linked referral #${r.id}: referrer ${r.referrerCustomerId} → referee ${customerId} (phone match)`);
      }
    }
    return linked;
  }

  /** Reward referral saat referee bayar pertama kali - SESUAI PROGRAM JABNET SAHABAT:
   *    - Referrer: Voucher Indomaret Rp 50.000 per referral sukses (default option)
   *    - Referee: Welcome bonus 7 hari gratis
   *    - Increment totalSuccessfulReferrals referrer + trigger level refresh
   *  Dipanggil dari BillingSyncWorker setelah payment_received.
   *  Return: array of referrals yang baru di-reward + list level upgrade events. */
  async rewardReferralsOnFirstPayment(customerId: number, paymentDate: string): Promise<{
    referrals: CustomerReferral[];
    levelUpgrades: Array<{ referrerCustomerId: number; fromLevel: string; toLevel: string; count: number }>;
  }> {
    const mitraId = getMitraId();
    const rows = await this.db.select().from(customerReferrals).where(and(
      eq(customerReferrals.refereeCustomerId, customerId),
      eq(customerReferrals.mitraId, mitraId),
      eq(customerReferrals.status, "registered"),
    ));
    const rewarded: CustomerReferral[] = [];
    const levelUpgrades: Array<{ referrerCustomerId: number; fromLevel: string; toLevel: string; count: number }> = [];
    const now = new Date().toISOString();
    const next = new Date(paymentDate);
    next.setMonth(next.getMonth() + 1);
    const period = next.toISOString().slice(0, 7);
    const expiresAt = new Date(Date.now() + 90 * 86400_000).toISOString();

    for (const r of rows) {
      // Frozen guard - skip reward issuance kalau referrer freeze (admin manual action)
      const [referrerCheck] = await this.db.select().from(customerLoyalty)
        .where(eq(customerLoyalty.customerId, r.referrerCustomerId));
      if (referrerCheck && Number((referrerCheck as any).isFrozen ?? 0) === 1) {
        console.log(`[Sahabat] ⏸ Referral #${r.id} skip reward - referrer #${r.referrerCustomerId} is frozen: ${(referrerCheck as any).frozenReason ?? "no reason"}`);
        continue;
      }

      await this.db.update(customerReferrals)
        .set({
          status: "rewarded",
          firstPaymentAt: paymentDate,
          rewardCreditedAt: now,
        })
        .where(eq(customerReferrals.id, r.id));

      // 1. Referrer - Voucher Indomaret Rp 50.000 per referral sukses (program Sahabat default)
      try {
        await this.db.insert(customerDiscounts).values({
          customerId: r.referrerCustomerId,
          mitraId,
          source: "ref_voucher_50k",
          discountType: "voucher_indomaret",
          discountValue: 50_000,
          description: `Voucher Indomaret Rp 50.000 - referral ${r.refereeName || "tetangga"} sukses aktif`,
          eligibleForPeriod: period,
          status: "pending",
          expiresAt,
          createdAt: now,
        } as any);
      } catch (e: any) { console.warn("[Sahabat] referrer voucher error:", e.message); }

      // 2. Referee - Welcome bonus gratis 7 hari
      try {
        await this.db.insert(customerDiscounts).values({
          customerId,
          mitraId,
          source: "referral_referee_welcome",
          discountType: "free_days",
          discountValue: 7,
          description: `Welcome bonus - gratis 7 hari (daftar via referral Sahabat)`,
          eligibleForPeriod: period,
          status: "pending",
          expiresAt,
          createdAt: now,
        } as any);
      } catch (e: any) { console.warn("[Sahabat] referee welcome error:", e.message); }

      // 3. Increment totalSuccessfulReferrals referrer + check level up
      const [referrerLoyalty] = await this.db.select().from(customerLoyalty)
        .where(eq(customerLoyalty.customerId, r.referrerCustomerId));
      if (referrerLoyalty) {
        const newCount = ((referrerLoyalty as any).totalSuccessfulReferrals ?? 0) + 1;
        await this.db.update(customerLoyalty)
          .set({ totalSuccessfulReferrals: newCount, updatedAt: now } as any)
          .where(eq(customerLoyalty.customerId, r.referrerCustomerId));
        const upgrade = await this.refreshSahabatLevelWithUpgradeCheck(r.referrerCustomerId);
        if (upgrade.upgraded) {
          levelUpgrades.push({
            referrerCustomerId: r.referrerCustomerId,
            fromLevel: upgrade.fromLevel,
            toLevel: upgrade.toLevel,
            count: upgrade.count,
          });
        }
      }

      rewarded.push({ ...r, status: "rewarded" });
      console.log(`[Sahabat] ✓ Referral #${r.id} rewarded: referrer ${r.referrerCustomerId} get Voucher 50K, referee ${customerId} get 7-day free`);
    }
    return { referrals: rewarded, levelUpgrades };
  }

  /** Admin manual link referee → customer */
  async linkReferralToCustomer(referralId: number, customerId: number, staffUserId: number): Promise<CustomerReferral> {
    const mitraId = getMitraId();
    const [r] = await this.db.select().from(customerReferrals).where(and(eq(customerReferrals.id, referralId), eq(customerReferrals.mitraId, mitraId)));
    if (!r) throw new Error("Referral tidak ditemukan");
    if (r.refereeCustomerId) throw new Error("Referral sudah di-link ke customer");
    await this.db.update(customerReferrals)
      .set({
        refereeCustomerId: customerId,
        status: "registered",
      })
      .where(eq(customerReferrals.id, referralId));
    // Set referredBy di loyalty record customer tsb
    await this.getOrCreateCustomerLoyalty(customerId);
    await this.db.update(customerLoyalty)
      .set({
        referredByCustomerId: r.referrerCustomerId,
        referredAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(customerLoyalty.customerId, customerId));
    await this.createAuditLog({
      userId: staffUserId, username: "staff", userName: "Staff",
      action: "LINK", entityType: "loyalty_referral", entityId: referralId,
      entityName: `→ customer #${customerId}`,
      details: JSON.stringify({ referralId, customerId }),
      createdAt: new Date().toISOString(),
    } as any);
    const [updated] = await this.db.select().from(customerReferrals).where(eq(customerReferrals.id, referralId));
    return updated;
  }

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

  // ====== LOYALTY ADMIN METHODS (staff dashboard) ======

  /** Dashboard summary untuk staff - breakdown tier/level Sahabat + pending items */
  async getLoyaltyAdminSummary(): Promise<any> {
    const mitraId = getMitraId();
    const rows: any = ((await this.db.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM customer_loyalty WHERE mitra_id = ${mitraId} AND on_time_streak >= 1) AS active_streaks,
        (SELECT COUNT(*) FROM customer_loyalty WHERE mitra_id = ${mitraId} AND sahabat_level = 'new') AS lv_new,
        (SELECT COUNT(*) FROM customer_loyalty WHERE mitra_id = ${mitraId} AND sahabat_level = 'perunggu') AS lv_perunggu,
        (SELECT COUNT(*) FROM customer_loyalty WHERE mitra_id = ${mitraId} AND sahabat_level = 'perak') AS lv_perak,
        (SELECT COUNT(*) FROM customer_loyalty WHERE mitra_id = ${mitraId} AND sahabat_level = 'emas') AS lv_emas,
        (SELECT COUNT(*) FROM customer_loyalty WHERE mitra_id = ${mitraId} AND sahabat_level = 'platinum') AS lv_platinum,
        (SELECT COUNT(*) FROM customer_loyalty WHERE mitra_id = ${mitraId} AND sahabat_level = 'berlian') AS lv_berlian,
        (SELECT COUNT(*) FROM customer_loyalty WHERE mitra_id = ${mitraId} AND sahabat_level = 'ambassador') AS lv_ambassador,
        (SELECT COUNT(*) FROM customer_loyalty WHERE mitra_id = ${mitraId} AND sahabat_tier = 'pelanggan') AS tier_pelanggan,
        (SELECT COUNT(*) FROM customer_loyalty WHERE mitra_id = ${mitraId} AND sahabat_tier = 'rtrw') AS tier_rtrw,
        (SELECT COUNT(*) FROM customer_loyalty WHERE mitra_id = ${mitraId} AND sahabat_tier = 'desa') AS tier_desa,
        (SELECT COUNT(*) FROM customer_loyalty WHERE mitra_id = ${mitraId} AND tenure_months >= 60) AS tenure_5y,
        (SELECT COUNT(*) FROM customer_loyalty WHERE mitra_id = ${mitraId} AND tenure_months >= 36 AND tenure_months < 60) AS tenure_3y,
        (SELECT COUNT(*) FROM customer_loyalty WHERE mitra_id = ${mitraId} AND tenure_months >= 12 AND tenure_months < 36) AS tenure_1y,
        (SELECT COUNT(*) FROM customer_discounts WHERE mitra_id = ${mitraId} AND status = 'pending') AS pending_discounts,
        (SELECT COUNT(*) FROM customer_discounts WHERE mitra_id = ${mitraId} AND status = 'applied') AS applied_discounts,
        (SELECT COUNT(*) FROM customer_referrals WHERE mitra_id = ${mitraId} AND status = 'invited') AS referrals_pending,
        (SELECT COUNT(*) FROM customer_referrals WHERE mitra_id = ${mitraId} AND status IN ('registered', 'rewarded')) AS referrals_converted,
        (SELECT MAX(on_time_streak) FROM customer_loyalty WHERE mitra_id = ${mitraId}) AS top_streak,
        (SELECT MAX(total_successful_referrals) FROM customer_loyalty WHERE mitra_id = ${mitraId}) AS top_referrals,
        (SELECT SUM(total_successful_referrals) FROM customer_loyalty WHERE mitra_id = ${mitraId}) AS total_successful_referrals,
        (SELECT SUM(total_on_time_payments) FROM customer_loyalty WHERE mitra_id = ${mitraId}) AS total_on_time,
        (SELECT SUM(total_late_payments) FROM customer_loyalty WHERE mitra_id = ${mitraId}) AS total_late
    `))[0] as any);
    const r = rows?.[0] ?? {};
    return {
      activeStreaks: Number(r.active_streaks ?? 0),
      byLevel: {
        new: Number(r.lv_new ?? 0),
        perunggu: Number(r.lv_perunggu ?? 0),
        perak: Number(r.lv_perak ?? 0),
        emas: Number(r.lv_emas ?? 0),
        platinum: Number(r.lv_platinum ?? 0),
        berlian: Number(r.lv_berlian ?? 0),
        ambassador: Number(r.lv_ambassador ?? 0),
      },
      byTier: {
        pelanggan: Number(r.tier_pelanggan ?? 0),
        rtrw: Number(r.tier_rtrw ?? 0),
        desa: Number(r.tier_desa ?? 0),
      },
      byTenure: {
        abadi: Number(r.tenure_5y ?? 0),       // 5+ tahun
        sahabat: Number(r.tenure_3y ?? 0),     // 3-5 tahun
        keluarga: Number(r.tenure_1y ?? 0),    // 1-3 tahun
      },
      discounts: {
        pending: Number(r.pending_discounts ?? 0),
        applied: Number(r.applied_discounts ?? 0),
      },
      referrals: {
        pending: Number(r.referrals_pending ?? 0),
        converted: Number(r.referrals_converted ?? 0),
        totalSuccessful: Number(r.total_successful_referrals ?? 0),
        topReferrals: Number(r.top_referrals ?? 0),
      },
      payments: {
        topStreak: Number(r.top_streak ?? 0),
        totalOnTime: Number(r.total_on_time ?? 0),
        totalLate: Number(r.total_late ?? 0),
      },
    };
  }

  /** List pending/applied discounts dengan customer info untuk admin queue */
  async listAllDiscountsAdmin(filter?: { status?: string; limit?: number; includeDeleted?: boolean }): Promise<any[]> {
    const mitraId = getMitraId();
    const status = filter?.status ?? "pending";
    const limit = filter?.limit ?? 200;
    const includeDeleted = filter?.includeDeleted ?? false;
    const rows: any = ((await this.db.execute(sql`
      SELECT
        d.id, d.customer_id AS customerId, d.source, d.discount_type AS discountType,
        d.discount_value AS discountValue, d.description,
        d.eligible_for_period AS eligibleForPeriod, d.status,
        d.expires_at AS expiresAt, d.applied_at AS appliedAt,
        d.applied_by_user_id AS appliedByUserId, d.invoice_ref AS invoiceRef,
        d.created_at AS createdAt, d.deleted_at AS deletedAt,
        c.name AS customerName, c.customer_id AS customerBillingId,
        c.phone AS customerPhone, c.billing_price AS billingPrice,
        l.on_time_streak AS currentStreak, l.tenure_badge AS tenureBadge,
        l.sahabat_level AS sahabatLevel, l.sahabat_tier AS sahabatTier,
        l.sahabat_code AS sahabatCode,
        l.total_successful_referrals AS totalRefs,
        u.name AS appliedByName
      FROM customer_discounts d
      LEFT JOIN customers c ON c.id = d.customer_id
      LEFT JOIN customer_loyalty l ON l.customer_id = d.customer_id
      LEFT JOIN users u ON u.id = d.applied_by_user_id
      WHERE d.status = ${status} AND d.mitra_id = ${mitraId}
        ${includeDeleted ? sql`` : sql`AND d.deleted_at IS NULL`}
      ORDER BY d.created_at DESC
      LIMIT ${limit}
    `))[0] as any);
    return (rows ?? []).map((r: any) => ({
      id: Number(r.id),
      customerId: Number(r.customerId),
      customerName: r.customerName ?? "-",
      customerBillingId: r.customerBillingId ?? null,
      customerPhone: r.customerPhone ?? null,
      billingPrice: r.billingPrice != null ? Number(r.billingPrice) : null,
      source: String(r.source),
      discountType: String(r.discountType),
      discountValue: Number(r.discountValue),
      description: r.description ?? null,
      eligibleForPeriod: r.eligibleForPeriod ?? null,
      status: String(r.status),
      expiresAt: r.expiresAt ?? null,
      appliedAt: r.appliedAt ?? null,
      appliedByName: r.appliedByName ?? null,
      invoiceRef: r.invoiceRef ?? null,
      createdAt: String(r.createdAt),
      deletedAt: r.deletedAt ?? null,
      currentStreak: r.currentStreak != null ? Number(r.currentStreak) : 0,
      tenureBadge: r.tenureBadge ?? "tetangga",
      sahabatLevel: r.sahabatLevel ?? "new",
      sahabatTier: r.sahabatTier ?? "pelanggan",
      sahabatCode: r.sahabatCode ?? null,
      totalSuccessfulReferrals: r.totalRefs != null ? Number(r.totalRefs) : 0,
    }));
  }

  /** Mark discount sebagai applied (oleh staff billing). */
  async applyDiscountByAdmin(
    discountId: number,
    staffUserId: number,
    invoiceRef?: string,
  ): Promise<CustomerDiscount> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(customerDiscounts).where(and(eq(customerDiscounts.id, discountId), eq(customerDiscounts.mitraId, mitraId)));
    if (!row) throw new Error("Discount tidak ditemukan");
    if (row.status !== "pending") throw new Error(`Discount status saat ini '${row.status}', tidak bisa di-apply`);
    await this.db.update(customerDiscounts)
      .set({
        status: "applied",
        appliedAt: new Date().toISOString(),
        appliedByUserId: staffUserId,
        invoiceRef: invoiceRef ?? null,
      })
      .where(and(eq(customerDiscounts.id, discountId), eq(customerDiscounts.mitraId, mitraId)));
    const [updated] = await this.db.select().from(customerDiscounts).where(and(eq(customerDiscounts.id, discountId), eq(customerDiscounts.mitraId, mitraId)));
    return updated;
  }

  /** Cancel discount (e.g. customer batal, fraud, dsb). */
  async cancelDiscountByAdmin(discountId: number, staffUserId: number, reason?: string): Promise<CustomerDiscount> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(customerDiscounts).where(and(eq(customerDiscounts.id, discountId), eq(customerDiscounts.mitraId, mitraId)));
    if (!row) throw new Error("Discount tidak ditemukan");
    if (row.status === "applied") throw new Error("Discount sudah diterapkan, tidak bisa dicancel");
    await this.db.update(customerDiscounts)
      .set({
        status: "cancelled",
        appliedByUserId: staffUserId,
        invoiceRef: reason ? `CANCELLED: ${reason}` : "CANCELLED",
      })
      .where(and(eq(customerDiscounts.id, discountId), eq(customerDiscounts.mitraId, mitraId)));
    const [updated] = await this.db.select().from(customerDiscounts).where(and(eq(customerDiscounts.id, discountId), eq(customerDiscounts.mitraId, mitraId)));
    return updated;
  }

  /** Update sahabat tier (manual upgrade: pelanggan → rtrw → desa). */
  async updateSahabatTier(customerId: number, tier: string, _staffUserId: number): Promise<void> {
    await this.getOrCreateCustomerLoyalty(customerId);
    const update: any = { sahabatTier: tier, updatedAt: new Date().toISOString() };
    // Kalau tier dinaikkan jadi rtrw atau desa dan belum ada contractSignedAt, set sekarang
    if ((tier === "rtrw" || tier === "desa")) {
      // customer_loyalty PK is customerId - unique, no mitra filter needed
      const [existing] = await this.db.select().from(customerLoyalty).where(eq(customerLoyalty.customerId, customerId));
      if (existing && !(existing as any).contractSignedAt) {
        update.contractSignedAt = new Date().toISOString();
      }
    }
    await this.db.update(customerLoyalty).set(update).where(eq(customerLoyalty.customerId, customerId));
  }

  /** Create manual discount (admin-issued ad-hoc reward) */
  async createManualDiscount(data: {
    customerId: number;
    discountType: string;
    discountValue: number;
    description: string;
    source: string;
    eligibleForPeriod: string | null;
    expiresAt: string;
    issuedBy: number;
    reason: string;
  }): Promise<any> {
    const mitraId = getMitraId();
    const now = new Date().toISOString();
    const result = await this.db.insert(customerDiscounts).values({
      customerId: data.customerId,
      mitraId,
      source: data.source,
      discountType: data.discountType,
      discountValue: data.discountValue,
      description: data.description,
      eligibleForPeriod: data.eligibleForPeriod,
      expiresAt: data.expiresAt,
      status: "pending",
      createdAt: now,
      notes: `issued_by=${data.issuedBy}; reason=${data.reason}`,
    } as any);
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(customerDiscounts).where(eq(customerDiscounts.id, insertId));
    return row!;
  }

  /** Detail Sahabat lengkap: loyalty + customer + referral history + reward history + payment stats */
  async getSahabatDetail(customerId: number): Promise<any | null> {
    const mitraId = getMitraId();
    const customer = await this.getCustomer(customerId);
    if (!customer) return null;
    const loyalty = await this.getOrCreateCustomerLoyalty(customerId);
    const refsMade = await this.getReferralsByCustomer(customerId);
    // Rewards received by this customer
    const rewardsRows: any = ((await this.db.execute(sql`
      SELECT * FROM customer_discounts WHERE customer_id = ${customerId} AND mitra_id = ${mitraId} ORDER BY created_at DESC LIMIT 100
    `))[0] as any);
    // Was this customer referred by someone? get referred_by
    const referredBy = (loyalty as any).referredByCustomerId
      ? await this.getCustomer((loyalty as any).referredByCustomerId)
      : null;
    // Level progress
    const thresholds: Record<string, number> = { new: 0, perunggu: 5, perak: 10, emas: 20, platinum: 30, berlian: 50, ambassador: 100 };
    const currentLevel = (loyalty as any).sahabatLevel ?? "new";
    const LEVEL_ORDER = ["new", "perunggu", "perak", "emas", "platinum", "berlian", "ambassador"];
    const currentIdx = LEVEL_ORDER.indexOf(currentLevel);
    const nextLevel = currentIdx < LEVEL_ORDER.length - 1 ? LEVEL_ORDER[currentIdx + 1] : null;
    const currentThreshold = thresholds[currentLevel] ?? 0;
    const nextThreshold = nextLevel ? thresholds[nextLevel] : currentThreshold;
    const refsCount = (loyalty as any).totalSuccessfulReferrals ?? 0;
    const progressPct = nextThreshold > currentThreshold
      ? Math.min(100, ((refsCount - currentThreshold) / (nextThreshold - currentThreshold)) * 100)
      : 100;
    return {
      customer: {
        id: customer.id,
        customerId: customer.customerId,
        name: customer.name,
        phone: customer.phone,
        address: customer.address,
        district: (customer as any).district,
        package: customer.package,
        billingPrice: customer.billingPrice,
        isIsolir: customer.isIsolir,
      },
      loyalty,
      referredBy: referredBy ? { id: referredBy.id, name: referredBy.name, customerId: referredBy.customerId } : null,
      referralsMade: refsMade,
      rewardsReceived: rewardsRows ?? [],
      levelProgress: {
        current: currentLevel,
        next: nextLevel,
        currentThreshold,
        nextThreshold,
        progressPct: Math.round(progressPct),
        remainingRefs: Math.max(0, nextThreshold - refsCount),
      },
    };
  }

  /**
   * Budget summary program Sahabat untuk periode (biasanya bulan ini).
   * Return breakdown per discount type + total Rp equivalent.
   */
  async getLoyaltyBudgetSummary(fromIso: string, toIso: string): Promise<{
    issuedTotal: number;              // Rp total issued (belum tentu applied)
    appliedTotal: number;             // Rp total yang sudah applied
    pendingTotal: number;             // Rp total yang pending
    issuedCount: number;
    appliedCount: number;
    pendingCount: number;
    byType: Record<string, { count: number; total: number }>;
  }> {
    const mitraId = getMitraId();
    const rows: any = ((await this.db.execute(sql`
      SELECT discount_type, discount_value, status, COUNT(*) as cnt
      FROM customer_discounts
      WHERE mitra_id = ${mitraId} AND created_at >= ${fromIso} AND created_at <= ${toIso}
      GROUP BY discount_type, status
    `))[0] as any);
    const byType: Record<string, { count: number; total: number }> = {};
    let issuedCount = 0, appliedCount = 0, pendingCount = 0;
    let issuedTotal = 0, appliedTotal = 0, pendingTotal = 0;
    // Ambil detail untuk nilai total - butuh full rows
    const details: any = ((await this.db.execute(sql`
      SELECT discount_type, discount_value, status
      FROM customer_discounts
      WHERE mitra_id = ${mitraId} AND created_at >= ${fromIso} AND created_at <= ${toIso}
    `))[0] as any);
    for (const d of (details ?? [])) {
      const type = d.discount_type || "other";
      const value = Number(d.discount_value) || 0;
      // Nilai Rp equivalent: voucher/cash = value langsung, percent = 0 (tidak countable tanpa konteks tagihan), free_days/speed_upgrade = 0
      const rpEquiv = (type === "voucher_indomaret" || type === "cash_bonus") ? value : 0;
      if (!byType[type]) byType[type] = { count: 0, total: 0 };
      byType[type].count++;
      byType[type].total += rpEquiv;
      issuedCount++;
      issuedTotal += rpEquiv;
      if (d.status === "applied") { appliedCount++; appliedTotal += rpEquiv; }
      else if (d.status === "pending") { pendingCount++; pendingTotal += rpEquiv; }
    }
    return { issuedTotal, appliedTotal, pendingTotal, issuedCount, appliedCount, pendingCount, byType };
  }

  /**
   * Funnel analytics: invited → registered → rewarded + per-cohort-month breakdown + time-to-reward.
   */
  async getLoyaltyFunnelAnalytics(): Promise<any> {
    const mitraId = getMitraId();
    const rows: any = ((await this.db.execute(sql`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status IN ('invited', 'registered', 'rewarded') THEN 1 ELSE 0 END) as invited,
        SUM(CASE WHEN status IN ('registered', 'rewarded') THEN 1 ELSE 0 END) as registered,
        SUM(CASE WHEN status = 'rewarded' THEN 1 ELSE 0 END) as rewarded,
        SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) as expired
      FROM customer_referrals
      WHERE mitra_id = ${mitraId}
    `))[0] as any);
    const r = rows?.[0] ?? {};
    const invited = Number(r.invited ?? 0);
    const registered = Number(r.registered ?? 0);
    const rewarded = Number(r.rewarded ?? 0);
    const funnel = {
      invited,
      registered,
      rewarded,
      expired: Number(r.expired ?? 0),
      invitedToRegisteredPct: invited > 0 ? Math.round((registered / invited) * 100) : 0,
      registeredToRewardedPct: registered > 0 ? Math.round((rewarded / registered) * 100) : 0,
      overallConversionPct: invited > 0 ? Math.round((rewarded / invited) * 100) : 0,
    };
    // Cohort by invite month - 6 last months
    const cohortRows: any = ((await this.db.execute(sql`
      SELECT
        substr(created_at, 1, 7) as month,
        COUNT(*) as invited,
        SUM(CASE WHEN status IN ('registered', 'rewarded') THEN 1 ELSE 0 END) as registered,
        SUM(CASE WHEN status = 'rewarded' THEN 1 ELSE 0 END) as rewarded
      FROM customer_referrals
      WHERE mitra_id = ${mitraId} AND created_at IS NOT NULL
      GROUP BY substr(created_at, 1, 7)
      ORDER BY month DESC
      LIMIT 6
    `))[0] as any);
    const cohorts = (cohortRows ?? []).map((c: any) => ({
      month: c.month,
      invited: Number(c.invited),
      registered: Number(c.registered),
      rewarded: Number(c.rewarded),
      conversionPct: Number(c.invited) > 0 ? Math.round((Number(c.rewarded) / Number(c.invited)) * 100) : 0,
    })).reverse();
    // Avg time-to-reward (hari dari invite → reward)
    const ttrRows: any = ((await this.db.execute(sql`
      SELECT AVG(
        (julianday(reward_credited_at) - julianday(created_at))
      ) as avg_days
      FROM customer_referrals
      WHERE mitra_id = ${mitraId} AND status = 'rewarded' AND reward_credited_at IS NOT NULL AND created_at IS NOT NULL
    `))[0] as any);
    const avgDaysToReward = ttrRows?.[0]?.avg_days ? Math.round(Number(ttrRows[0].avg_days)) : null;
    return { funnel, cohorts, avgDaysToReward };
  }

  /**
   * Deteksi pola referral mencurigakan.
   * Return list flags dengan reason + severity.
   */
  async getLoyaltyFraudChecks(): Promise<Array<{
    referralId: number;
    referrerName: string;
    refereeName: string | null;
    refereePhone: string | null;
    reason: string;
    severity: "high" | "medium" | "low";
    detail?: string;
  }>> {
    const mitraId = getMitraId();
    const flags: Array<any> = [];
    // 1. HP referee == HP customer existing (selain yang di-link sendiri)
    const rows1: any = ((await this.db.execute(sql`
      SELECT cr.id as refId, cr.referrer_customer_id as refrId, cr.referee_phone as refPhone, cr.referee_name as refName,
             rc.name as referrerName, c.name as existingName, c.id as existingCustId
      FROM customer_referrals cr
      LEFT JOIN customers rc ON rc.id = cr.referrer_customer_id AND rc.mitra_id = ${mitraId}
      LEFT JOIN customers c ON c.phone = cr.referee_phone AND c.mitra_id = ${mitraId}
      WHERE cr.mitra_id = ${mitraId} AND cr.status = 'invited'
        AND cr.referee_phone IS NOT NULL
        AND c.id IS NOT NULL
        AND c.id <> cr.referrer_customer_id
    `))[0] as any);
    for (const r of (rows1 ?? [])) {
      flags.push({
        referralId: r.refId,
        referrerName: r.referrerName ?? "-",
        refereeName: r.refName,
        refereePhone: r.refPhone,
        reason: "HP referee sudah jadi customer existing",
        severity: "high" as const,
        detail: `Nomor ini milik: ${r.existingName ?? "customer #" + r.existingCustId}`,
      });
    }
    // 2. HP referee sama dengan HP referrer (self-refer via nomor keluarga)
    const rows2: any = ((await this.db.execute(sql`
      SELECT cr.id as refId, cr.referrer_customer_id as refrId, cr.referee_phone as refPhone, cr.referee_name as refName,
             rc.name as referrerName, rc.phone as referrerPhone
      FROM customer_referrals cr
      LEFT JOIN customers rc ON rc.id = cr.referrer_customer_id AND rc.mitra_id = ${mitraId}
      WHERE cr.mitra_id = ${mitraId} AND cr.status IN ('invited', 'registered')
        AND cr.referee_phone IS NOT NULL
        AND rc.phone IS NOT NULL
        AND REPLACE(REPLACE(REPLACE(cr.referee_phone, '-', ''), ' ', ''), '+', '') = REPLACE(REPLACE(REPLACE(rc.phone, '-', ''), ' ', ''), '+', '')
    `))[0] as any);
    for (const r of (rows2 ?? [])) {
      flags.push({
        referralId: r.refId,
        referrerName: r.referrerName ?? "-",
        refereeName: r.refName,
        refereePhone: r.refPhone,
        reason: "HP referee sama dengan HP referrer",
        severity: "high" as const,
        detail: `Self-refer terdeteksi`,
      });
    }
    // 3. Circle refer: A refer B, B refer A
    const rows3: any = ((await this.db.execute(sql`
      SELECT a.id as refA, a.referrer_customer_id as A, a.referee_customer_id as B,
             b.id as refB, ca.name as nameA, cb.name as nameB
      FROM customer_referrals a
      JOIN customer_referrals b ON b.mitra_id = ${mitraId} AND b.referrer_customer_id = a.referee_customer_id AND b.referee_customer_id = a.referrer_customer_id
      LEFT JOIN customers ca ON ca.id = a.referrer_customer_id AND ca.mitra_id = ${mitraId}
      LEFT JOIN customers cb ON cb.id = a.referee_customer_id AND cb.mitra_id = ${mitraId}
      WHERE a.mitra_id = ${mitraId} AND a.referee_customer_id IS NOT NULL
    `))[0] as any);
    for (const r of (rows3 ?? [])) {
      flags.push({
        referralId: r.refA,
        referrerName: r.nameA ?? "-",
        refereeName: r.nameB,
        refereePhone: null,
        reason: "Referral circle (A↔B saling refer)",
        severity: "medium" as const,
        detail: `${r.nameA} refer ${r.nameB} dan sebaliknya (ref #${r.refA} ↔ ref #${r.refB})`,
      });
    }
    return flags;
  }

  /** Leaderboard Sahabat - urut by total referral sukses + streak sebagai tie-break */
  async getLoyaltyLeaderboard(limit: number = 20, sortBy: "referrals" | "streak" = "referrals"): Promise<any[]> {
    const mitraId = getMitraId();
    const orderClause = sortBy === "streak"
      ? sql`ORDER BY l.on_time_streak DESC, l.total_successful_referrals DESC, l.longest_streak DESC, l.tenure_months DESC`
      : sql`ORDER BY l.total_successful_referrals DESC, l.on_time_streak DESC, l.longest_streak DESC, l.tenure_months DESC`;
    const rows: any = ((await this.db.execute(sql`
      SELECT
        l.customer_id AS customerId,
        l.on_time_streak AS currentStreak,
        l.longest_streak AS longestStreak,
        l.total_on_time_payments AS totalOnTime,
        l.total_late_payments AS totalLate,
        l.tenure_badge AS tenureBadge,
        l.tenure_months AS tenureMonths,
        l.sahabat_level AS sahabatLevel,
        l.sahabat_tier AS sahabatTier,
        l.sahabat_code AS sahabatCode,
        l.total_successful_referrals AS totalRefs,
        c.name AS customerName,
        c.customer_id AS customerBillingId,
        c.phone AS customerPhone,
        c.billing_price AS billingPrice
      FROM customer_loyalty l
      LEFT JOIN customers c ON c.id = l.customer_id AND c.mitra_id = ${mitraId}
      WHERE l.mitra_id = ${mitraId} AND c.id IS NOT NULL
      ${orderClause}
      LIMIT ${limit}
    `))[0] as any);
    return (rows ?? []).map((r: any) => ({
      customerId: Number(r.customerId),
      customerName: r.customerName ?? "-",
      customerBillingId: r.customerBillingId ?? null,
      customerPhone: r.customerPhone ?? null,
      billingPrice: r.billingPrice != null ? Number(r.billingPrice) : null,
      currentStreak: Number(r.currentStreak ?? 0),
      longestStreak: Number(r.longestStreak ?? 0),
      totalOnTime: Number(r.totalOnTime ?? 0),
      totalLate: Number(r.totalLate ?? 0),
      tenureBadge: r.tenureBadge ?? "tetangga",
      tenureMonths: Number(r.tenureMonths ?? 0),
      sahabatLevel: r.sahabatLevel ?? "new",
      sahabatTier: r.sahabatTier ?? "pelanggan",
      sahabatCode: r.sahabatCode ?? null,
      totalSuccessfulReferrals: r.totalRefs != null ? Number(r.totalRefs) : 0,
    }));
  }

  /** List all referrals dengan referrer+referee info */
  async listAllReferralsAdmin(filter?: { status?: string; limit?: number; includeDeleted?: boolean }): Promise<any[]> {
    const mitraId = getMitraId();
    const limit = filter?.limit ?? 200;
    const includeDeleted = filter?.includeDeleted ? 1 : 0;
    const whereClause = filter?.status
      ? sql`WHERE r.mitra_id = ${mitraId} AND r.status = ${filter.status} AND (r.deleted_at IS NULL OR ${includeDeleted} = 1)`
      : sql`WHERE r.mitra_id = ${mitraId} AND (r.deleted_at IS NULL OR ${includeDeleted} = 1)`;
    const rows: any = ((await this.db.execute(sql`
      SELECT
        r.id, r.referrer_customer_id AS referrerCustomerId,
        r.referral_code AS referralCode,
        r.referee_phone AS refereePhone,
        r.referee_name AS refereeName,
        r.referee_customer_id AS refereeCustomerId,
        r.status,
        r.first_payment_at AS firstPaymentAt,
        r.reward_credited_at AS rewardCreditedAt,
        r.created_at AS createdAt, r.notes,
        r.deleted_at AS deletedAt,
        referrer.name AS referrerName, referrer.customer_id AS referrerBillingId,
        referee.name AS refereeCustomerName, referee.customer_id AS refereeBillingId,
        referee.is_isolir AS refereeIsIsolir,
        referee.status AS refereeCustomerStatusRaw,
        CASE
          WHEN r.referee_customer_id IS NULL THEN 'belum_daftar'
          WHEN referee.id IS NULL THEN 'non_aktif'
          WHEN COALESCE(referee.is_isolir, 0) = 0
               AND COALESCE(referee.status, 'active') = 'active' THEN 'aktif'
          ELSE 'non_aktif'
        END AS refereeStatus
      FROM customer_referrals r
      LEFT JOIN customers referrer ON referrer.id = r.referrer_customer_id AND referrer.mitra_id = ${mitraId}
      LEFT JOIN customers referee ON referee.id = r.referee_customer_id AND referee.mitra_id = ${mitraId}
      ${whereClause}
      ORDER BY r.created_at DESC
      LIMIT ${limit}
    `))[0] as any);
    return (rows ?? []).map((r: any) => ({
      id: Number(r.id),
      referrerCustomerId: Number(r.referrerCustomerId),
      referrerName: r.referrerName ?? "-",
      referrerBillingId: r.referrerBillingId ?? null,
      referralCode: String(r.referralCode),
      refereePhone: r.refereePhone ?? null,
      refereeName: r.refereeName ?? null,
      refereeCustomerId: r.refereeCustomerId != null ? Number(r.refereeCustomerId) : null,
      refereeCustomerName: r.refereeCustomerName ?? null,
      refereeBillingId: r.refereeBillingId ?? null,
      refereeIsIsolir: Number(r.refereeIsIsolir ?? 0) === 1,
      refereeCustomerStatusRaw: r.refereeCustomerStatusRaw ?? null,
      refereeStatus: String(r.refereeStatus) as "belum_daftar" | "aktif" | "non_aktif",
      status: String(r.status),
      firstPaymentAt: r.firstPaymentAt ?? null,
      rewardCreditedAt: r.rewardCreditedAt ?? null,
      createdAt: String(r.createdAt),
      notes: r.notes ?? null,
      deletedAt: r.deletedAt ?? null,
    }));
  }

  /** Admin manual adjust streak - untuk dispute / correction */
  async adjustLoyaltyStreak(customerId: number, newStreak: number, reason: string, staffUserId: number): Promise<void> {
    // customer_loyalty PK is customerId - WHERE on customerId is sufficient
    await this.db.update(customerLoyalty)
      .set({ onTimeStreak: newStreak, updatedAt: new Date().toISOString() })
      .where(eq(customerLoyalty.customerId, customerId));
    // Log via audit
    await this.createAuditLog({
      userId: staffUserId,
      username: "staff",
      userName: "Staff",
      action: "ADJUST",
      entityType: "loyalty",
      entityId: customerId,
      entityName: `streak → ${newStreak}`,
      details: JSON.stringify({ newStreak, reason }),
      createdAt: new Date().toISOString(),
    } as any);
  }

  // ==================== MPWA TEMPLATES (v4.1.3) ====================

  async getMpwaTemplates(filter?: { category?: string }): Promise<MpwaTemplate[]> {
    const mitraId = getMitraId();
    if (filter?.category) {
      return this.db.select().from(mpwaTemplates)
        .where(and(eq(mpwaTemplates.mitraId, mitraId), eq(mpwaTemplates.category, filter.category)))
        .orderBy(desc(mpwaTemplates.isSystem), mpwaTemplates.name);
    }
    return this.db.select().from(mpwaTemplates)
      .where(eq(mpwaTemplates.mitraId, mitraId))
      .orderBy(desc(mpwaTemplates.isSystem), mpwaTemplates.name);
  }

  async getMpwaTemplate(id: number): Promise<MpwaTemplate | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(mpwaTemplates).where(and(eq(mpwaTemplates.id, id), eq(mpwaTemplates.mitraId, mitraId)));
    return row;
  }

  async getMpwaTemplateByKey(key: string): Promise<MpwaTemplate | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(mpwaTemplates).where(and(eq(mpwaTemplates.key, key), eq(mpwaTemplates.mitraId, mitraId)));
    return row;
  }

  async createMpwaTemplate(data: InsertMpwaTemplate): Promise<MpwaTemplate> {
    const mitraId = getMitraId();
    const now = new Date().toISOString();
    const result = await this.db.insert(mpwaTemplates).values({
      ...data,
      mitraId,
      createdAt: data.createdAt ?? now,
      updatedAt: now,
    } as any);
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(mpwaTemplates).where(eq(mpwaTemplates.id, insertId));
    return row!;
  }

  async updateMpwaTemplate(id: number, data: Partial<InsertMpwaTemplate>): Promise<MpwaTemplate | undefined> {
    const mitraId = getMitraId();
    const existing = await this.getMpwaTemplate(id);
    if (!existing) return undefined;
    // System template: hanya boleh ubah content + description + placeholders (tidak key)
    const patch: any = { ...data, updatedAt: new Date().toISOString() };
    if (existing.isSystem === 1) {
      delete patch.key;
      delete patch.isSystem;
    }
    await this.db.update(mpwaTemplates).set(patch).where(and(eq(mpwaTemplates.id, id), eq(mpwaTemplates.mitraId, mitraId)));
    const [row] = await this.db.select().from(mpwaTemplates).where(and(eq(mpwaTemplates.id, id), eq(mpwaTemplates.mitraId, mitraId)));
    return row;
  }

  async deleteMpwaTemplate(id: number): Promise<boolean> {
    const mitraId = getMitraId();
    const existing = await this.getMpwaTemplate(id);
    if (!existing) return false;
    if (existing.isSystem === 1) return false; // system tidak bisa dihapus
    await this.db.delete(mpwaTemplates).where(and(eq(mpwaTemplates.id, id), eq(mpwaTemplates.mitraId, mitraId)));
    return true;
  }

  // ==================== AD CAMPAIGNS (v4.2.1) ====================
  async getAdCampaigns(filter?: { platform?: string; status?: string }): Promise<AdCampaign[]> {
    const mitraId = getMitraId();
    const conditions: any[] = [eq(adCampaigns.mitraId, mitraId)];
    if (filter?.platform) conditions.push(eq(adCampaigns.platform, filter.platform));
    if (filter?.status) conditions.push(eq(adCampaigns.status, filter.status));
    return await (this.db.select().from(adCampaigns) as any)
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .orderBy(desc(adCampaigns.updatedAt), desc(adCampaigns.id));
  }

  async getAdCampaign(id: number): Promise<AdCampaign | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(adCampaigns).where(and(eq(adCampaigns.id, id), eq(adCampaigns.mitraId, mitraId)));
    return row;
  }

  async getAdCampaignByExternalId(platform: string, externalId: string): Promise<AdCampaign | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(adCampaigns).where(
      and(eq(adCampaigns.platform, platform), eq(adCampaigns.externalId, externalId), eq(adCampaigns.mitraId, mitraId))
    );
    return row;
  }

  async createAdCampaign(data: InsertAdCampaign): Promise<AdCampaign> {
    const mitraId = getMitraId();
    const result = await this.db.insert(adCampaigns).values({ ...data, mitraId });
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(adCampaigns).where(eq(adCampaigns.id, insertId));
    return row!;
  }

  async updateAdCampaign(id: number, data: Partial<InsertAdCampaign>): Promise<AdCampaign | undefined> {
    const mitraId = getMitraId();
    await this.db.update(adCampaigns)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(and(eq(adCampaigns.id, id), eq(adCampaigns.mitraId, mitraId)));
    const [row] = await this.db.select().from(adCampaigns).where(and(eq(adCampaigns.id, id), eq(adCampaigns.mitraId, mitraId)));
    return row;
  }

  async deleteAdCampaign(id: number): Promise<boolean> {
    const mitraId = getMitraId();
    const [result] = await this.db.delete(adCampaigns).where(and(eq(adCampaigns.id, id), eq(adCampaigns.mitraId, mitraId)));
    return (result as any).affectedRows > 0;
  }

  /**
   * Upsert by external_id. Kalau (platform, external_id) sudah ada → update.
   * Kalau belum → insert. Dipakai oleh openclaw bot push harian dari Ads Manager.
   */
  async upsertAdCampaignByExternalId(platform: string, externalId: string, data: Partial<InsertAdCampaign>): Promise<{ campaign: AdCampaign; created: boolean }> {
    const existing = await this.getAdCampaignByExternalId(platform, externalId);
    const nowIso = new Date().toISOString();
    if (existing) {
      const updated = await this.updateAdCampaign(existing.id, {
        ...data,
        lastSyncedAt: nowIso,
      });
      return { campaign: updated!, created: false };
    }
    const created = await this.createAdCampaign({
      ...data,
      platform,
      externalId,
      campaignName: data.campaignName || `${platform}:${externalId}`,
      lastSyncedAt: nowIso,
      createdAt: nowIso,
    } as InsertAdCampaign);
    return { campaign: created, created: true };
  }

  /**
   * Aggregate leads per-source untuk auto-fill stats campaign yang belum punya data platform.
   * Return: { source: { total, thisMonth, won, conversionRate } }
   */
  async getAdsLeadsSummary(): Promise<Record<string, { total: number; thisMonth: number; won: number; conversionRate: number; converted: number }>> {
    const adSources = ["meta_ads", "tiktok_ads", "google_ads", "landing_page"];
    const allLeads = await this.getLeads({});
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const customers = await this.getCustomers();
    const out: Record<string, any> = {};
    for (const src of adSources) {
      const rows = allLeads.filter(l => l.source === src);
      const thisMonth = rows.filter(l => l.createdAt && l.createdAt >= monthStart).length;
      const won = rows.filter(l => l.stage === "won").length;
      const converted = customers.filter(c => {
        const lid = (c as any).leadId;
        return lid && rows.some(l => l.id === lid);
      }).length;
      out[src] = {
        total: rows.length,
        thisMonth,
        won,
        converted,
        conversionRate: rows.length > 0 ? Math.round((won / rows.length) * 100) : 0,
      };
    }
    return out;
  }

  // ============================================================
  //  POINTS & SPEED-ON-DEMAND (v4.2.2)
  // ============================================================

  /**
   * Parse customer_id format MMYYNNNNN (5 digit month-year + 5 digit sequence)
   * Examples:
   *   "052500014" → month=05, year=2025, seq=14   → joined May 2025
   *   "072400442" → month=07, year=2024, seq=442  → joined Jul 2024
   *   "012600020" → month=01, year=2026, seq=20   → joined Jan 2026
   * Return: { joinDate ISO string, tenureMonths } atau null kalau format tidak valid.
   */
  parseCustomerIdJoinDate(customerId: string): { joinDate: string; tenureMonths: number } | null {
    if (!customerId || !/^\d{8,9}$/.test(customerId)) return null;
    // Sometimes first digit is leading zero, sometimes not. Pad to 9.
    const padded = customerId.padStart(9, "0");
    const mm = parseInt(padded.slice(0, 2), 10);
    const yy = parseInt(padded.slice(2, 4), 10);
    if (mm < 1 || mm > 12) return null;
    if (yy > 60) return null; // sanity
    const fullYear = 2000 + yy;
    const joinDate = new Date(fullYear, mm - 1, 1);
    if (isNaN(joinDate.getTime())) return null;
    if (joinDate.getTime() > Date.now() + 86400_000) return null; // future date - invalid
    const now = new Date();
    const tenureMonths = (now.getFullYear() - fullYear) * 12 + (now.getMonth() - (mm - 1));
    return { joinDate: joinDate.toISOString(), tenureMonths: Math.max(0, tenureMonths) };
  }

  /**
   * Hitung initial loyalty points berdasarkan tenure (lama berlangganan).
   * Telco-grade tier formula:
   *   < 6 bln    : 0 pts (welcome bonus dari rules earn-on-time aja)
   *   6 - 11 bln : 250 pts (apresiasi awal)
   *   12 - 23 bln: 1000 pts
   *   24 - 35 bln: 2500 pts
   *   36 - 59 bln: 5000 pts
   *   60+ bln    : 10000 pts (premium loyalist 5+ tahun)
   */
  calculateInitialLoyaltyPoints(tenureMonths: number): number {
    if (tenureMonths < 6) return 0;
    if (tenureMonths < 12) return 250;
    if (tenureMonths < 24) return 1000;
    if (tenureMonths < 36) return 2500;
    if (tenureMonths < 60) return 5000;
    return 10000;
  }

  /**
   * Backfill initial loyalty points untuk semua customer existing.
   * Idempotent: kalau customer sudah punya transaction source='initial_loyalty_grant', skip.
   * Return: { processed, granted, skipped, totalPointsGranted, byTier }
   */
  async backfillInitialLoyaltyPoints(): Promise<{
    processed: number;
    granted: number;
    skipped: number;
    totalPointsGranted: number;
    byTier: Record<string, { count: number; pointsTotal: number }>;
  }> {
    const mitraId = getMitraId();
    const allCustomers = await this.getCustomers();
    let granted = 0, skipped = 0, totalPts = 0;
    const byTier: Record<string, { count: number; pointsTotal: number }> = {};
    const now = new Date().toISOString();

    // Batched idempotency: 1 query for all customers with existing initial_loyalty_grant
    const grantedRows = await this.db
      .select({ customerId: pointTransactions.customerId })
      .from(pointTransactions)
      .where(and(eq(pointTransactions.source, "initial_loyalty_grant"), eq(pointTransactions.mitraId, mitraId)));
    const grantedSet = new Set<number>(grantedRows.map(r => r.customerId));

    for (const c of allCustomers) {
      const parsed = this.parseCustomerIdJoinDate(c.customerId);
      if (!parsed) { skipped++; continue; }
      const points = this.calculateInitialLoyaltyPoints(parsed.tenureMonths);
      if (points === 0) { skipped++; continue; }

      if (grantedSet.has(c.id)) { skipped++; continue; }

      // Earn idempotent - pakai tenureMonths sebagai refId untuk uniqueness
      const tx = await this.earnPoints({
        customerId: c.id,
        amount: points,
        source: "initial_loyalty_grant",
        refId: parsed.tenureMonths,
        notes: `Loyalty bonus ${parsed.tenureMonths} bulan tenure (joined ${new Date(parsed.joinDate).toLocaleDateString("id-ID", { month: "short", year: "numeric" })})`,
      }).catch((e: any) => {
        console.warn(`[Backfill] earn error for customer ${c.id}:`, e.message);
        return null;
      });
      if (tx) {
        granted++;
        totalPts += points;
        const tierKey = parsed.tenureMonths < 12 ? "6-11_bulan"
          : parsed.tenureMonths < 24 ? "12-23_bulan"
          : parsed.tenureMonths < 36 ? "24-35_bulan"
          : parsed.tenureMonths < 60 ? "36-59_bulan"
          : "60_bulan_plus";
        if (!byTier[tierKey]) byTier[tierKey] = { count: 0, pointsTotal: 0 };
        byTier[tierKey].count++;
        byTier[tierKey].pointsTotal += points;
      } else {
        skipped++;
      }
    }
    await this.setSetting("points_backfill_last_run_at", now, "loyalty");
    return { processed: allCustomers.length, granted, skipped, totalPointsGranted: totalPts, byTier };
  }

  /**
   * Preview backfill (no insert) - buat admin lihat dulu sebelum execute.
   */
  async previewInitialLoyaltyBackfill(): Promise<{
    eligibleCount: number;
    totalPointsToGrant: number;
    alreadyGrantedCount: number;
    byTier: Record<string, { count: number; pointsPerCustomer: number }>;
    samples: Array<{ customerId: string; name: string; tenureMonths: number; points: number; alreadyGranted: boolean }>;
  }> {
    const mitraId = getMitraId();
    const allCustomers = await this.getCustomers();
    let eligible = 0, totalPts = 0, alreadyGranted = 0;
    const byTier: Record<string, { count: number; pointsPerCustomer: number }> = {};
    const samples: any[] = [];

    // Batched idempotency lookup - 1 query upfront instead of N
    const grantedRows = await this.db
      .select({ customerId: pointTransactions.customerId })
      .from(pointTransactions)
      .where(and(eq(pointTransactions.source, "initial_loyalty_grant"), eq(pointTransactions.mitraId, mitraId)));
    const grantedSet = new Set<number>(grantedRows.map(r => r.customerId));

    for (const c of allCustomers) {
      const parsed = this.parseCustomerIdJoinDate(c.customerId);
      if (!parsed) continue;
      const points = this.calculateInitialLoyaltyPoints(parsed.tenureMonths);
      if (points === 0) continue;
      const isGranted = grantedSet.has(c.id);
      if (isGranted) alreadyGranted++; else { eligible++; totalPts += points; }
      const tierKey = parsed.tenureMonths < 12 ? "6-11 bulan (250 pts)"
        : parsed.tenureMonths < 24 ? "12-23 bulan (1.000 pts)"
        : parsed.tenureMonths < 36 ? "24-35 bulan (2.500 pts)"
        : parsed.tenureMonths < 60 ? "36-59 bulan (5.000 pts)"
        : "60+ bulan (10.000 pts)";
      if (!byTier[tierKey]) byTier[tierKey] = { count: 0, pointsPerCustomer: points };
      if (!isGranted) byTier[tierKey].count++;
      if (samples.length < 10) samples.push({
        customerId: c.customerId,
        name: c.name,
        tenureMonths: parsed.tenureMonths,
        points,
        alreadyGranted: isGranted,
      });
    }
    return { eligibleCount: eligible, totalPointsToGrant: totalPts, alreadyGrantedCount: alreadyGranted, byTier, samples };
  }


  async getPointBalance(customerId: number): Promise<number> {
    const loyalty = await this.getOrCreateCustomerLoyalty(customerId);
    return (loyalty as any).pointsBalance ?? 0;
  }

  async getPointHistory(customerId: number, limit: number = 50): Promise<PointTransaction[]> {
    const mitraId = getMitraId();
    return this.db.select().from(pointTransactions)
      .where(and(eq(pointTransactions.customerId, customerId), eq(pointTransactions.mitraId, mitraId)))
      .orderBy(desc(pointTransactions.createdAt))
      .limit(limit);
  }

  /**
   * Atomic earn - increment balance + lifetimeEarned + insert transaction.
   * Idempotent kalau dipanggil dengan refId yg sama (di-skip kalau sudah ada).
   */
  async earnPoints(data: {
    customerId: number;
    amount: number;
    source: string;
    refId?: number | null;
    notes?: string | null;
    createdBy?: number | null;
  }): Promise<PointTransaction | null> {
    const mitraId = getMitraId();
    if (data.amount <= 0) throw new Error("amount harus > 0 untuk earn");
    // Idempotency check: refId+source+type unique per customer
    if (data.refId != null) {
      const existing: any = ((await this.db.execute(sql`
        SELECT id FROM point_transactions
        WHERE customer_id = ${data.customerId} AND mitra_id = ${mitraId} AND ref_id = ${data.refId}
          AND source = ${data.source} AND type = 'earn' LIMIT 1
      `))[0] as any);
      if ((existing ?? []).length > 0) return null;
    }
    const loyalty = await this.getOrCreateCustomerLoyalty(data.customerId);
    const currentBal = (loyalty as any).pointsBalance ?? 0;
    const lifetime = (loyalty as any).pointsLifetimeEarned ?? 0;
    const newBal = currentBal + data.amount;
    await this.db.update(customerLoyalty)
      .set({ pointsBalance: newBal, pointsLifetimeEarned: lifetime + data.amount, updatedAt: new Date().toISOString() } as any)
      .where(eq(customerLoyalty.customerId, data.customerId));
    const txResult = await this.db.insert(pointTransactions).values({
      customerId: data.customerId,
      mitraId,
      type: "earn",
      amount: data.amount,
      source: data.source,
      refId: data.refId ?? null,
      balanceAfter: newBal,
      notes: data.notes ?? null,
      createdBy: data.createdBy ?? null,
      createdAt: new Date().toISOString(),
    } as any);
    const txInsertId = Number((txResult[0] as any).insertId);
    const [tx] = await this.db.select().from(pointTransactions).where(eq(pointTransactions.id, txInsertId));
    return tx ?? null;
  }

  /**
   * Atomic redeem - deduct balance + lifetimeRedeemed + insert transaction + create redemption row.
   * Throw kalau balance kurang.
   */
  async redeemPoints(data: {
    customerId: number;
    rewardKey: string;
    rewardLabel: string;
    pointsCost: number;
    speedMultiplier: number;
    durationHours: number;
  }): Promise<PointRedemption> {
    const mitraId = getMitraId();
    const loyalty = await this.getOrCreateCustomerLoyalty(data.customerId);
    const currentBal = (loyalty as any).pointsBalance ?? 0;
    if (currentBal < data.pointsCost) {
      throw new Error(`Saldo point tidak cukup. Balance: ${currentBal}, butuh: ${data.pointsCost}`);
    }
    const newBal = currentBal - data.pointsCost;
    const lifetime = (loyalty as any).pointsLifetimeRedeemed ?? 0;
    const now = new Date().toISOString();
    // 1. Insert redemption
    const redemptionResult = await this.db.insert(pointRedemptions).values({
      customerId: data.customerId,
      mitraId,
      rewardKey: data.rewardKey,
      rewardLabel: data.rewardLabel,
      pointsCost: data.pointsCost,
      speedMultiplier: data.speedMultiplier,
      durationHours: data.durationHours,
      status: "pending",
      createdAt: now,
    } as any);
    const redemptionInsertId = Number((redemptionResult[0] as any).insertId);
    const [redemption] = await this.db.select().from(pointRedemptions).where(eq(pointRedemptions.id, redemptionInsertId));
    // 2. Update balance
    await this.db.update(customerLoyalty)
      .set({ pointsBalance: newBal, pointsLifetimeRedeemed: lifetime + data.pointsCost, updatedAt: now } as any)
      .where(eq(customerLoyalty.customerId, data.customerId));
    // 3. Audit transaction
    await this.db.insert(pointTransactions).values({
      customerId: data.customerId,
      mitraId,
      type: "redeem",
      amount: -data.pointsCost,
      source: "redemption",
      refId: redemption.id,
      balanceAfter: newBal,
      notes: `Redeem ${data.rewardLabel}`,
      createdBy: null,
      createdAt: now,
    } as any);
    return redemption;
  }

  /** Refund redemption - kembalikan points + tutup redemption sebagai rejected/cancelled. */
  async refundRedemption(redemptionId: number, reason: string, byUserId: number, status: "rejected" | "cancelled"): Promise<PointRedemption> {
    const mitraId = getMitraId();
    const [r] = await this.db.select().from(pointRedemptions).where(and(eq(pointRedemptions.id, redemptionId), eq(pointRedemptions.mitraId, mitraId)));
    if (!r) throw new Error("Redemption tidak ditemukan");
    if (r.status !== "pending" && r.status !== "active") {
      throw new Error(`Tidak bisa ${status === "rejected" ? "reject" : "cancel"} redemption status ${r.status}`);
    }
    const now = new Date().toISOString();
    const loyalty = await this.getOrCreateCustomerLoyalty(r.customerId);
    const currentBal = (loyalty as any).pointsBalance ?? 0;
    const newBal = currentBal + r.pointsCost;
    const lifetime = (loyalty as any).pointsLifetimeRedeemed ?? 0;
    // Refund balance
    await this.db.update(customerLoyalty)
      .set({ pointsBalance: newBal, pointsLifetimeRedeemed: Math.max(0, lifetime - r.pointsCost), updatedAt: now } as any)
      .where(eq(customerLoyalty.customerId, r.customerId));
    // Audit refund
    await this.db.insert(pointTransactions).values({
      customerId: r.customerId,
      mitraId,
      type: "refund",
      amount: r.pointsCost,
      source: "refund_redemption",
      refId: r.id,
      balanceAfter: newBal,
      notes: `Refund - ${status === "rejected" ? "rejected" : "cancelled"}: ${reason}`,
      createdBy: byUserId,
      createdAt: now,
    } as any);
    // Update redemption status
    await this.db.update(pointRedemptions).set({
      status,
      [status === "rejected" ? "rejectionReason" : "cancelledAt"]: status === "rejected" ? reason : now,
      cancelledAt: status === "cancelled" ? now : null,
      cancelledBy: status === "cancelled" ? byUserId : null,
      rejectionReason: status === "rejected" ? reason : null,
    } as any).where(and(eq(pointRedemptions.id, redemptionId), eq(pointRedemptions.mitraId, mitraId)));
    const [updated] = await this.db.select().from(pointRedemptions).where(and(eq(pointRedemptions.id, redemptionId), eq(pointRedemptions.mitraId, mitraId)));
    return updated;
  }

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
   *  Pending → auto-refund poin sebelum soft-delete.
   *  Cancelled/expired/rejected → langsung soft-delete (sudah di-refund saat lifecycle action). */
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
      // Refund poin yang sempat di-deduct saat create redemption.
      // Inline (bukan reuse refundRedemption) karena helper itu juga ganti status → cancelled,
      // sedangkan di sini kita mau soft-delete tanpa mengubah status semantic-nya.
      const now = new Date().toISOString();
      const loyalty = await this.getOrCreateCustomerLoyalty(existing.customerId);
      const currentBalance = Number((loyalty as any)?.pointsBalance ?? 0);
      const refundAmount = existing.pointsCost;
      const newBalance = currentBalance + refundAmount;
      const lifetime = Number((loyalty as any)?.pointsLifetimeRedeemed ?? 0);
      await this.db.update(customerLoyalty)
        .set({ pointsBalance: newBalance, pointsLifetimeRedeemed: Math.max(0, lifetime - refundAmount), updatedAt: now } as any)
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
        createdAt: now,
      } as any);
      refunded = true;
    }

    await this.db.update(pointRedemptions)
      .set({ deletedAt: new Date().toISOString() } as any)
      .where(eq(pointRedemptions.id, id));

    return { statusAtDelete: existing.status ?? "pending", refunded };
  }

  /** Verify (activate) pending redemption - set status active + startAt + endAt + audit. */
  async verifyRedemption(redemptionId: number, byUserId: number, opts?: { notes?: string; originalPppProfile?: string; boostedPppProfile?: string }): Promise<PointRedemption> {
    const mitraId = getMitraId();
    const [r] = await this.db.select().from(pointRedemptions).where(and(eq(pointRedemptions.id, redemptionId), eq(pointRedemptions.mitraId, mitraId)));
    if (!r) throw new Error("Redemption tidak ditemukan");
    if (r.status !== "pending") throw new Error(`Status saat ini: ${r.status}, hanya 'pending' yang bisa di-verify`);
    const now = new Date();
    const startAt = now.toISOString();
    const endAt = new Date(now.getTime() + r.durationHours * 3600_000).toISOString();
    await this.db.update(pointRedemptions).set({
      status: "active",
      startAt,
      endAt,
      verifiedBy: byUserId,
      verifiedAt: startAt,
      notes: opts?.notes ?? r.notes,
      originalPppProfile: opts?.originalPppProfile ?? null,
      boostedPppProfile: opts?.boostedPppProfile ?? null,
    } as any).where(and(eq(pointRedemptions.id, redemptionId), eq(pointRedemptions.mitraId, mitraId)));
    const [updated] = await this.db.select().from(pointRedemptions).where(and(eq(pointRedemptions.id, redemptionId), eq(pointRedemptions.mitraId, mitraId)));
    return updated;
  }

  /**
   * Get redemptions yang sudah lewat endAt dan masih active (perlu di-revert).
   * READ-ONLY - tidak mutate. Caller bertanggung-jawab panggil markRevertedAndExpired() per row
   * setelah sukses revert MikroTik.
   */
  async getOverdueActiveRedemptions(): Promise<PointRedemption[]> {
    const mitraId = getMitraId();
    const now = new Date().toISOString();
    const rows: any = ((await this.db.execute(sql`
      SELECT * FROM point_redemptions
      WHERE mitra_id = ${mitraId} AND status = 'active' AND end_at IS NOT NULL AND end_at < ${now}
      ORDER BY end_at ASC
    `))[0] as any);
    return (rows ?? []) as PointRedemption[];
  }

  /**
   * Mark redemption sebagai expired SETELAH revert MikroTik berhasil.
   * Set revertedAt + status=expired (atomic).
   */
  async markRevertedAndExpired(redemptionId: number): Promise<void> {
    const mitraId = getMitraId();
    const now = new Date().toISOString();
    await this.db.update(pointRedemptions).set({
      status: "expired",
      revertedAt: now,
      revertError: null,
    } as any).where(and(eq(pointRedemptions.id, redemptionId), eq(pointRedemptions.mitraId, mitraId)));
  }

  /**
   * Catat percobaan revert yang gagal - tetap status=active supaya retry next loop.
   * Increment revert_attempts + simpan error message untuk admin visibility.
   */
  async recordRevertFailure(redemptionId: number, errorMsg: string): Promise<number> {
    const mitraId = getMitraId();
    const row: any = ((await this.db.execute(sql`SELECT revert_attempts FROM point_redemptions WHERE id = ${redemptionId} AND mitra_id = ${mitraId}`))[0] as any);
    const attempts = Number(row?.[0]?.revert_attempts ?? 0) + 1;
    await this.db.update(pointRedemptions).set({
      revertError: errorMsg.slice(0, 500),
      revertAttempts: attempts,
    } as any).where(and(eq(pointRedemptions.id, redemptionId), eq(pointRedemptions.mitraId, mitraId)));
    return attempts;
  }

  /**
   * Force-expire (admin override): set status=expired tanpa revert MikroTik.
   * Untuk kasus extreme - admin sudah set profile manual lewat WinBox lalu mark sebagai selesai.
   */
  async forceExpireRedemption(redemptionId: number, byUserId: number, reason: string): Promise<PointRedemption | undefined> {
    const mitraId = getMitraId();
    const now = new Date().toISOString();
    await this.db.update(pointRedemptions).set({
      status: "expired",
      revertError: `FORCE EXPIRED by user #${byUserId}: ${reason}`,
    } as any).where(and(eq(pointRedemptions.id, redemptionId), eq(pointRedemptions.mitraId, mitraId)));
    const [row] = await this.db.select().from(pointRedemptions).where(and(eq(pointRedemptions.id, redemptionId), eq(pointRedemptions.mitraId, mitraId)));
    return row;
  }

  /** @deprecated - pakai getOverdueActiveRedemptions + per-row revert + markRevertedAndExpired */
  async expireOverdueRedemptions(): Promise<PointRedemption[]> {
    const mitraId = getMitraId();
    // Legacy method - kept for backwards compatibility tapi tidak revert MikroTik
    // Code path baru di server/index.ts pakai split flow.
    const now = new Date().toISOString();
    const overdueRows: any = ((await this.db.execute(sql`
      SELECT * FROM point_redemptions WHERE mitra_id = ${mitraId} AND status = 'active' AND end_at IS NOT NULL AND end_at < ${now}
    `))[0] as any);
    if (!overdueRows || overdueRows.length === 0) return [];
    const expired: PointRedemption[] = [];
    for (const row of overdueRows) {
      await this.db.update(pointRedemptions).set({ status: "expired" } as any).where(and(eq(pointRedemptions.id, row.id), eq(pointRedemptions.mitraId, mitraId)));
      expired.push({ ...row, status: "expired" } as PointRedemption);
    }
    return expired;
  }

  /** List redemptions with filter - admin */
  async getRedemptions(filter?: { status?: string; customerId?: number; limit?: number; includeDeleted?: boolean }): Promise<any[]> {
    const mitraId = getMitraId();
    const limit = filter?.limit ?? 200;
    let query: any = this.db.select({
      r: pointRedemptions,
      customerName: customers.name,
      customerBillingId: customers.customerId,
      customerPhone: customers.phone,
      customerPackage: customers.package,
    }).from(pointRedemptions)
      .leftJoin(customers, and(eq(pointRedemptions.customerId, customers.id), eq(customers.mitraId, mitraId)));
    const conds: any[] = [eq(pointRedemptions.mitraId, mitraId)];
    if (filter?.status) conds.push(eq(pointRedemptions.status, filter.status));
    if (filter?.customerId) conds.push(eq(pointRedemptions.customerId, filter.customerId));
    if (!filter?.includeDeleted) conds.push(isNull(pointRedemptions.deletedAt));
    query = query.where(and(...conds));
    const rows = await query.orderBy(desc(pointRedemptions.createdAt)).limit(limit);
    return rows.map((row: any) => ({
      ...row.r,
      customerName: row.customerName,
      customerBillingId: row.customerBillingId,
      customerPhone: row.customerPhone,
      customerPackage: row.customerPackage,
    }));
  }

  async getRedemption(id: number): Promise<PointRedemption | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(pointRedemptions).where(and(eq(pointRedemptions.id, id), eq(pointRedemptions.mitraId, mitraId)));
    return row;
  }

  async getRedemptionStats(): Promise<{ pending: number; active: number; expired: number; rejected: number; cancelled: number; pointsThisMonth: number }> {
    const mitraId = getMitraId();
    const monthStart = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString(); })();
    const rows: any = ((await this.db.execute(sql`
      SELECT
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) as expired,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
        (SELECT SUM(points_cost) FROM point_redemptions WHERE mitra_id = ${mitraId} AND created_at >= ${monthStart} AND status NOT IN ('rejected','cancelled')) as pointsThisMonth
      FROM point_redemptions
      WHERE mitra_id = ${mitraId}
    `))[0] as any);
    const r = rows?.[0] ?? {};
    return {
      pending: Number(r.pending) || 0,
      active: Number(r.active) || 0,
      expired: Number(r.expired) || 0,
      rejected: Number(r.rejected) || 0,
      cancelled: Number(r.cancelled) || 0,
      pointsThisMonth: Number(r.pointsThisMonth) || 0,
    };
  }

  /** Auto-seed 6 template default saat startup (idempotent) */
  // ==================== v4.2.19: BROADCAST ====================

  /** Evaluate audience: count + sample customers untuk preview */
  async evaluateBroadcastAudience(filter: any, limit = 5000): Promise<{
    count: number;
    sample: Array<{ id: number; name: string; phone: string | null; customerId: string; district: string | null; package: string | null }>;
  }> {
    const mitraId = getMitraId();
    const { buildAudienceWhere, validateAudienceFilter } = await import("./broadcast-audience.js");
    if (!validateAudienceFilter(filter)) return { count: 0, sample: [] };
    const built = buildAudienceWhere(filter);
    const mitraClause = built ? `WHERE ${built.sql} AND mitra_id = ?` : "WHERE mitra_id = ?";
    const mitraParams = [...(built?.params ?? []), mitraId];

    // Count
    const [countResult] = await this.pool.execute(
      `SELECT COUNT(*) as c FROM customers ${mitraClause}`,
      mitraParams
    );
    const countRow: any = (countResult as any[])[0];
    const count = Number(countRow?.c ?? 0);

    // Sample 10 preview
    const [sampleResult] = await this.pool.execute(
      `SELECT id, name, phone, customer_id as customerId, district, package FROM customers ${mitraClause} ORDER BY id DESC LIMIT 10`,
      mitraParams
    );
    const sample: any = sampleResult as any[];

    return { count: Math.min(count, limit), sample };
  }

  /** Load full audience list (id, phone, name) untuk enrol broadcast */
  async loadBroadcastAudience(filter: any, limit = 5000): Promise<Array<{ id: number; name: string; phone: string; customerId: string; package: string | null }>> {
    const mitraId = getMitraId();
    const { buildAudienceWhere, validateAudienceFilter } = await import("./broadcast-audience.js");
    if (!validateAudienceFilter(filter)) return [];
    const built = buildAudienceWhere(filter);
    const mitraClause = built
      ? `WHERE ${built.sql} AND phone IS NOT NULL AND phone != '' AND mitra_id = ?`
      : "WHERE phone IS NOT NULL AND phone != '' AND mitra_id = ?";
    const mitraParams = [...(built?.params ?? []), mitraId];
    const [rows] = await this.pool.execute(
      `SELECT id, name, phone, customer_id as customerId, package FROM customers ${mitraClause} LIMIT ${Math.max(1, limit)}`,
      mitraParams
    );
    return rows as any;
  }

  // Campaigns CRUD
  async listBroadcastCampaigns(filter?: { status?: string; limit?: number }): Promise<BroadcastCampaign[]> {
    const mitraId = getMitraId();
    const limit = filter?.limit ?? 200;
    if (filter?.status) {
      return this.db.select().from(broadcastCampaigns)
        .where(and(eq(broadcastCampaigns.mitraId, mitraId), eq(broadcastCampaigns.status, filter.status)))
        .orderBy(desc(broadcastCampaigns.createdAt))
        .limit(limit);
    }
    return this.db.select().from(broadcastCampaigns)
      .where(eq(broadcastCampaigns.mitraId, mitraId))
      .orderBy(desc(broadcastCampaigns.createdAt))
      .limit(limit);
  }

  async getBroadcastCampaign(id: number): Promise<BroadcastCampaign | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(broadcastCampaigns).where(and(eq(broadcastCampaigns.id, id), eq(broadcastCampaigns.mitraId, mitraId)));
    return row;
  }

  async createBroadcastCampaign(data: InsertBroadcastCampaign): Promise<BroadcastCampaign> {
    const mitraId = getMitraId();
    const nowIso = new Date().toISOString();
    const result = await this.db.insert(broadcastCampaigns).values({
      ...data,
      mitraId,
      createdAt: nowIso,
      updatedAt: nowIso,
    } as any);
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(broadcastCampaigns).where(eq(broadcastCampaigns.id, insertId));
    return row!;
  }

  async updateBroadcastCampaign(id: number, data: Partial<InsertBroadcastCampaign>): Promise<BroadcastCampaign | undefined> {
    const mitraId = getMitraId();
    const existing = await this.getBroadcastCampaign(id);
    if (!existing) return undefined;
    await this.db.update(broadcastCampaigns).set({
      ...data,
      updatedAt: new Date().toISOString(),
    } as any).where(and(eq(broadcastCampaigns.id, id), eq(broadcastCampaigns.mitraId, mitraId)));
    return this.getBroadcastCampaign(id);
  }

  async deleteBroadcastCampaign(id: number): Promise<boolean> {
    const mitraId = getMitraId();
    // Also delete recipients
    await this.db.delete(broadcastRecipients).where(and(eq(broadcastRecipients.campaignId, id), eq(broadcastRecipients.mitraId, mitraId)));
    await this.db.delete(broadcastCampaigns).where(and(eq(broadcastCampaigns.id, id), eq(broadcastCampaigns.mitraId, mitraId)));
    return true;
  }

  // Recipients
  async listBroadcastRecipients(campaignId: number, filter?: { status?: string; limit?: number; offset?: number }): Promise<BroadcastRecipient[]> {
    const mitraId = getMitraId();
    const limit = filter?.limit ?? 100;
    const offset = filter?.offset ?? 0;
    if (filter?.status) {
      return this.db.select().from(broadcastRecipients)
        .where(and(eq(broadcastRecipients.campaignId, campaignId), eq(broadcastRecipients.mitraId, mitraId), eq(broadcastRecipients.status, filter.status)))
        .limit(limit).offset(offset);
    }
    return this.db.select().from(broadcastRecipients)
      .where(and(eq(broadcastRecipients.campaignId, campaignId), eq(broadcastRecipients.mitraId, mitraId)))
      .limit(limit).offset(offset);
  }

  async countBroadcastRecipients(campaignId: number): Promise<{ total: number; pending: number; sent: number; failed: number; skipped: number }> {
    const mitraId = getMitraId();
    const [result] = await this.pool.execute(
      `SELECT status, COUNT(*) as c FROM broadcast_recipients WHERE campaign_id = ? AND mitra_id = ? GROUP BY status`,
      [campaignId, mitraId]
    );
    const rows = result as any[];
    const out = { total: 0, pending: 0, sent: 0, failed: 0, skipped: 0 } as any;
    for (const r of rows) {
      out.total += Number(r.c);
      if (r.status in out) out[r.status] = Number(r.c);
    }
    return out;
  }

  async bulkInsertRecipients(items: InsertBroadcastRecipient[]): Promise<number> {
    if (items.length === 0) return 0;
    const mitraId = getMitraId();
    const nowIso = new Date().toISOString();
    const conn = await this.pool.getConnection();
    await conn.beginTransaction();
    try {
      for (const r of items) {
        await conn.execute(
          `INSERT INTO broadcast_recipients (campaign_id, customer_id, phone, customer_name, rendered_message, status, retry_count, mitra_id, created_at) VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?)`,
          [r.campaignId, r.customerId ?? null, r.phone, r.customerName ?? null, r.renderedMessage ?? null, mitraId, nowIso]
        );
      }
      await conn.commit();
      return items.length;
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  async getNextPendingRecipient(campaignId: number): Promise<BroadcastRecipient | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(broadcastRecipients)
      .where(and(eq(broadcastRecipients.campaignId, campaignId), eq(broadcastRecipients.mitraId, mitraId), eq(broadcastRecipients.status, "pending")))
      .limit(1);
    return row;
  }

  async updateRecipientStatus(id: number, patch: Partial<{ status: string; sentAt: string | null; errorMessage: string | null; mpwaResponse: string | null; retryCount: number }>): Promise<void> {
    const mitraId = getMitraId();
    await this.db.update(broadcastRecipients).set(patch as any).where(and(eq(broadcastRecipients.id, id), eq(broadcastRecipients.mitraId, mitraId)));
  }

  // Segments
  async listBroadcastSegments(): Promise<BroadcastSegment[]> {
    const mitraId = getMitraId();
    return this.db.select().from(broadcastSegments)
      .where(eq(broadcastSegments.mitraId, mitraId))
      .orderBy(desc(broadcastSegments.isSystem), broadcastSegments.name);
  }

  async getBroadcastSegment(id: number): Promise<BroadcastSegment | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(broadcastSegments).where(and(eq(broadcastSegments.id, id), eq(broadcastSegments.mitraId, mitraId)));
    return row;
  }

  async createBroadcastSegment(data: InsertBroadcastSegment): Promise<BroadcastSegment> {
    const mitraId = getMitraId();
    const nowIso = new Date().toISOString();
    const result = await this.db.insert(broadcastSegments).values({
      ...data,
      mitraId,
      createdAt: nowIso,
      updatedAt: nowIso,
    } as any);
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(broadcastSegments).where(eq(broadcastSegments.id, insertId));
    return row!;
  }

  async updateBroadcastSegment(id: number, data: Partial<InsertBroadcastSegment>): Promise<BroadcastSegment | undefined> {
    const mitraId = getMitraId();
    await this.db.update(broadcastSegments).set({ ...data, updatedAt: new Date().toISOString() } as any).where(and(eq(broadcastSegments.id, id), eq(broadcastSegments.mitraId, mitraId)));
    return this.getBroadcastSegment(id);
  }

  async deleteBroadcastSegment(id: number): Promise<boolean> {
    const mitraId = getMitraId();
    const seg = await this.getBroadcastSegment(id);
    if (!seg) return false;
    if (seg.isSystem === 1) throw new Error("Segment system tidak bisa dihapus");
    await this.db.delete(broadcastSegments).where(and(eq(broadcastSegments.id, id), eq(broadcastSegments.mitraId, mitraId)));
    return true;
  }

  /** Seed system segments - dipanggil di startup */
  async seedDefaultBroadcastSegments(): Promise<void> {
    // Boot-time seed - no HTTP context, so wrap with withMitra(1, ...) to inject tenant context
    await withMitra(1, async () => {
      const { SYSTEM_SEGMENTS } = await import("./broadcast-audience.js");
      const existing = await this.listBroadcastSegments();
      const existingNames = new Set(existing.map(s => s.name));
      const nowIso = new Date().toISOString();
      for (const s of SYSTEM_SEGMENTS) {
        if (existingNames.has(s.name)) continue;
        await this.createBroadcastSegment({
          name: s.name,
          description: s.description,
          filter: JSON.stringify(s.filter),
          isSystem: 1,
          createdAt: nowIso,
        } as any);
      }
    });
  }

  // ==================== END v4.2.19: BROADCAST ====================

  // ==================== v4.2.20: WhatsApp v2 (Multi-device + Resellers) ====================

  // -- WA Devices --
  async listWaDevices(filter?: { active?: boolean }): Promise<WaDevice[]> {
    const mitraId = getMitraId();
    if (filter?.active === true) {
      return this.db.select().from(waDevices)
        .where(and(eq(waDevices.mitraId, mitraId), eq(waDevices.isActive, 1)))
        .orderBy(waDevices.name);
    }
    return this.db.select().from(waDevices)
      .where(eq(waDevices.mitraId, mitraId))
      .orderBy(waDevices.name);
  }

  async getWaDevice(id: number): Promise<WaDevice | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(waDevices).where(and(eq(waDevices.id, id), eq(waDevices.mitraId, mitraId)));
    return row;
  }

  async createWaDevice(data: InsertWaDevice): Promise<WaDevice> {
    const mitraId = getMitraId();
    const nowIso = new Date().toISOString();
    const result = await this.db.insert(waDevices).values({
      ...data,
      mitraId,
      createdAt: nowIso,
      updatedAt: nowIso,
    } as any);
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(waDevices).where(eq(waDevices.id, insertId));
    return row!;
  }

  async updateWaDevice(id: number, data: Partial<InsertWaDevice>): Promise<WaDevice | undefined> {
    const mitraId = getMitraId();
    await this.db.update(waDevices).set({ ...data, updatedAt: new Date().toISOString() } as any).where(and(eq(waDevices.id, id), eq(waDevices.mitraId, mitraId)));
    return this.getWaDevice(id);
  }

  async deleteWaDevice(id: number): Promise<boolean> {
    const mitraId = getMitraId();
    await this.db.delete(waDevices).where(and(eq(waDevices.id, id), eq(waDevices.mitraId, mitraId)));
    return true;
  }

  async markWaDeviceSuccess(id: number): Promise<void> {
    const mitraId = getMitraId();
    await this.db.update(waDevices).set({
      lastSuccessAt: new Date().toISOString(),
      lastError: null,
    } as any).where(and(eq(waDevices.id, id), eq(waDevices.mitraId, mitraId)));
  }

  async markWaDeviceError(id: number, error: string): Promise<void> {
    const mitraId = getMitraId();
    await this.db.update(waDevices).set({
      lastErrorAt: new Date().toISOString(),
      lastError: error,
    } as any).where(and(eq(waDevices.id, id), eq(waDevices.mitraId, mitraId)));
  }

  // -- Resellers --
  async listResellers(filter?: { active?: boolean; search?: string }): Promise<Reseller[]> {
    let query: any = this.db.select().from(resellers);
    const conds: any[] = [];
    if (filter?.active === true) conds.push(eq(resellers.isActive, 1));
    if (conds.length > 0) query = query.where(and(...conds));
    let rows: Reseller[] = await query.orderBy(resellers.name);
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      rows = rows.filter(r =>
        r.name.toLowerCase().includes(q) ||
        r.phone.toLowerCase().includes(q) ||
        (r.email ?? "").toLowerCase().includes(q)
      );
    }
    return rows;
  }

  async getReseller(id: number): Promise<Reseller | undefined> {
    const [row] = await this.db.select().from(resellers).where(eq(resellers.id, id));
    return row;
  }

  async createReseller(data: InsertReseller): Promise<Reseller> {
    const nowIso = new Date().toISOString();
    const result = await this.db.insert(resellers).values({
      ...data,
      createdAt: nowIso,
      updatedAt: nowIso,
    } as any);
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(resellers).where(eq(resellers.id, insertId));
    return row!;
  }

  async updateReseller(id: number, data: Partial<InsertReseller>): Promise<Reseller | undefined> {
    await this.db.update(resellers).set({ ...data, updatedAt: new Date().toISOString() } as any).where(eq(resellers.id, id));
    return this.getReseller(id);
  }

  async deleteReseller(id: number): Promise<boolean> {
    await this.db.delete(resellers).where(eq(resellers.id, id));
    return true;
  }

  // ---- v4.2.21: Device state (QR + connection + webhook) ----
  async patchWaDeviceState(id: number, patch: Partial<{
    connectionStatus: string;
    lastQrAt: string | null;
    lastQrData: string | null;
    webhookToken: string | null;
    webhookUrl: string | null;
    deviceInfo: string | null;
  }>): Promise<void> {
    const mitraId = getMitraId();
    await this.db.update(waDevices).set({
      ...patch,
      updatedAt: new Date().toISOString(),
    } as any).where(and(eq(waDevices.id, id), eq(waDevices.mitraId, mitraId)));
  }

  // NOTE: pre-auth webhook lookup - no mitra filter; caller wraps with withMitra after resolving device's mitra
  async getWaDeviceByWebhookToken(token: string): Promise<WaDevice | undefined> {
    const [row] = await this.db.select().from(waDevices).where(eq(waDevices.webhookToken, token));
    return row;
  }

  // ---- v4.2.21: WA Inbox (incoming messages dari webhook) ----
  async insertWaInboxMessage(data: InsertWaInboxMessage): Promise<WaInboxMessage> {
    const mitraId = getMitraId();
    const result = await this.db.insert(waInbox).values({ ...data, mitraId } as any);
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(waInbox).where(eq(waInbox.id, insertId));
    return row!;
  }

  async listWaInbox(filter: {
    deviceId?: number;
    status?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<WaInboxMessage[]> {
    const mitraId = getMitraId();
    const limit = filter.limit ?? 100;
    const offset = filter.offset ?? 0;
    const conds: any[] = [eq(waInbox.mitraId, mitraId)];
    if (filter.deviceId != null) conds.push(eq(waInbox.deviceId, filter.deviceId));
    if (filter.status) conds.push(eq(waInbox.status, filter.status));
    let query: any = this.db.select().from(waInbox);
    query = query.where(and(...conds));
    return query.orderBy(desc(waInbox.receivedAt)).limit(limit).offset(offset);
  }

  async countWaInboxNew(deviceId?: number): Promise<number> {
    const mitraId = getMitraId();
    const sqlStmt = deviceId != null
      ? `SELECT COUNT(*) as c FROM wa_inbox WHERE status = 'new' AND mitra_id = ? AND device_id = ?`
      : `SELECT COUNT(*) as c FROM wa_inbox WHERE status = 'new' AND mitra_id = ?`;
    const [result] = await this.pool.execute(sqlStmt, deviceId != null ? [mitraId, deviceId] : [mitraId]);
    const row: any = (result as any[])[0];
    return Number(row?.c ?? 0);
  }

  async updateWaInboxMessage(id: number, patch: Partial<{ status: string; repliedAt: string }>): Promise<void> {
    const mitraId = getMitraId();
    await this.db.update(waInbox).set(patch as any).where(and(eq(waInbox.id, id), eq(waInbox.mitraId, mitraId)));
  }

  // ---- v4.2.24: Phonebooks (custom contact lists) ----
  async listPhonebooks(): Promise<Array<Phonebook & { contactCount: number }>> {
    const mitraId = getMitraId();
    const [result] = await this.pool.execute(`
      SELECT p.*, COALESCE(c.cnt, 0) as actual_count
      FROM phonebooks p
      LEFT JOIN (SELECT phonebook_id, COUNT(*) as cnt FROM phonebook_contacts WHERE mitra_id = ? GROUP BY phonebook_id) c
        ON c.phonebook_id = p.id
      WHERE p.mitra_id = ?
      ORDER BY p.name
    `, [mitraId, mitraId]);
    const rows = result as any[];
    return rows.map((r: any) => ({
      id: r.id, mitraId: r.mitra_id ?? 1,
      name: r.name, description: r.description, color: r.color, icon: r.icon,
      contactCount: r.actual_count,
      createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
    }));
  }

  async getPhonebook(id: number): Promise<Phonebook | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(phonebooks).where(and(eq(phonebooks.id, id), eq(phonebooks.mitraId, mitraId)));
    return row;
  }

  async createPhonebook(data: InsertPhonebook): Promise<Phonebook> {
    const mitraId = getMitraId();
    const nowIso = new Date().toISOString();
    const result = await this.db.insert(phonebooks).values({
      ...data, mitraId, createdAt: nowIso, updatedAt: nowIso,
    } as any);
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(phonebooks).where(eq(phonebooks.id, insertId));
    return row!;
  }

  async updatePhonebook(id: number, data: Partial<InsertPhonebook>): Promise<Phonebook | undefined> {
    const mitraId = getMitraId();
    await this.db.update(phonebooks).set({ ...data, updatedAt: new Date().toISOString() } as any).where(and(eq(phonebooks.id, id), eq(phonebooks.mitraId, mitraId)));
    return this.getPhonebook(id);
  }

  async deletePhonebook(id: number): Promise<boolean> {
    const mitraId = getMitraId();
    // Cascade delete contacts (scoped to mitra for defense in depth)
    await this.db.delete(phonebookContacts).where(and(eq(phonebookContacts.phonebookId, id), eq(phonebookContacts.mitraId, mitraId)));
    await this.db.delete(phonebooks).where(and(eq(phonebooks.id, id), eq(phonebooks.mitraId, mitraId)));
    return true;
  }

  async _refreshPhonebookCount(phonebookId: number): Promise<void> {
    const mitraId = getMitraId();
    const [result] = await this.pool.execute(`SELECT COUNT(*) as c FROM phonebook_contacts WHERE phonebook_id = ? AND mitra_id = ?`, [phonebookId, mitraId]);
    const row: any = (result as any[])[0];
    await this.db.update(phonebooks).set({
      contactCount: Number(row?.c ?? 0),
      updatedAt: new Date().toISOString(),
    } as any).where(and(eq(phonebooks.id, phonebookId), eq(phonebooks.mitraId, mitraId)));
  }

  async listPhonebookContacts(phonebookId: number, filter?: { search?: string; limit?: number; offset?: number }): Promise<PhonebookContact[]> {
    const mitraId = getMitraId();
    const limit = filter?.limit ?? 200;
    const offset = filter?.offset ?? 0;
    let rows: PhonebookContact[] = await this.db.select().from(phonebookContacts)
      .where(and(eq(phonebookContacts.phonebookId, phonebookId), eq(phonebookContacts.mitraId, mitraId)))
      .orderBy(phonebookContacts.name)
      .limit(limit).offset(offset);
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      rows = rows.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        (c.email ?? "").toLowerCase().includes(q)
      );
    }
    return rows;
  }

  async getPhonebookContact(id: number): Promise<PhonebookContact | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(phonebookContacts).where(and(eq(phonebookContacts.id, id), eq(phonebookContacts.mitraId, mitraId)));
    return row;
  }

  async createPhonebookContact(data: InsertPhonebookContact): Promise<PhonebookContact> {
    const mitraId = getMitraId();
    const nowIso = new Date().toISOString();
    const result = await this.db.insert(phonebookContacts).values({
      ...data, mitraId, createdAt: nowIso, updatedAt: nowIso,
    } as any);
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(phonebookContacts).where(eq(phonebookContacts.id, insertId));
    await this._refreshPhonebookCount(data.phonebookId);
    return row!;
  }

  async bulkCreatePhonebookContacts(phonebookId: number, items: Array<Omit<InsertPhonebookContact, "phonebookId" | "createdAt">>): Promise<{ added: number; skipped: number; duplicates: string[] }> {
    if (items.length === 0) return { added: 0, skipped: 0, duplicates: [] };
    const mitraId = getMitraId();
    const nowIso = new Date().toISOString();
    // Check existing phones di phonebook (scoped to mitra)
    const [existingResult] = await this.pool.execute(`SELECT phone FROM phonebook_contacts WHERE phonebook_id = ? AND mitra_id = ?`, [phonebookId, mitraId]);
    const existingPhones = new Set((existingResult as any[]).map((r: any) => r.phone));

    const duplicates: string[] = [];
    const toInsert = items.filter(r => {
      if (existingPhones.has(r.phone)) {
        duplicates.push(r.phone);
        return false;
      }
      existingPhones.add(r.phone);
      return true;
    });

    if (toInsert.length > 0) {
      const conn = await this.pool.getConnection();
      await conn.beginTransaction();
      try {
        for (const r of toInsert) {
          await conn.execute(
            `INSERT INTO phonebook_contacts (phonebook_id, name, phone, email, address, notes, custom_fields, customer_id, tags, mitra_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              phonebookId, r.name, r.phone, r.email ?? null, (r as any).address ?? null,
              (r as any).notes ?? null,
              r.customFields ? (typeof r.customFields === "string" ? r.customFields : JSON.stringify(r.customFields)) : null,
              r.customerId ?? null,
              r.tags ? (typeof r.tags === "string" ? r.tags : JSON.stringify(r.tags)) : null,
              mitraId, nowIso, nowIso,
            ]
          );
        }
        await conn.commit();
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    }

    await this._refreshPhonebookCount(phonebookId);
    return { added: toInsert.length, skipped: duplicates.length, duplicates };
  }

  // v4.2.27: bulk add tags ke kontak (merge dengan tag existing)
  async bulkAddTagsToContacts(contactIds: number[], tagsToAdd: string[]): Promise<number> {
    if (contactIds.length === 0 || tagsToAdd.length === 0) return 0;
    const mitraId = getMitraId();
    const nowIso = new Date().toISOString();
    const conn = await this.pool.getConnection();
    await conn.beginTransaction();
    try {
      let updated = 0;
      for (const id of contactIds) {
        const [rowResult] = await conn.execute(`SELECT id, tags FROM phonebook_contacts WHERE id = ? AND mitra_id = ?`, [id, mitraId]);
        const row: any = (rowResult as any[])[0];
        if (!row) continue;
        let existing: string[] = [];
        try { existing = row.tags ? JSON.parse(row.tags) : []; } catch {}
        const merged = Array.from(new Set([...existing, ...tagsToAdd]));
        await conn.execute(`UPDATE phonebook_contacts SET tags = ?, updated_at = ? WHERE id = ? AND mitra_id = ?`, [JSON.stringify(merged), nowIso, id, mitraId]);
        updated++;
      }
      await conn.commit();
      return updated;
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  // v4.2.27: bulk remove tag dari kontak
  async bulkRemoveTagFromContacts(contactIds: number[], tagToRemove: string): Promise<number> {
    if (contactIds.length === 0) return 0;
    const mitraId = getMitraId();
    const nowIso = new Date().toISOString();
    const conn = await this.pool.getConnection();
    await conn.beginTransaction();
    try {
      let updated = 0;
      for (const id of contactIds) {
        const [rowResult] = await conn.execute(`SELECT id, tags FROM phonebook_contacts WHERE id = ? AND mitra_id = ?`, [id, mitraId]);
        const row: any = (rowResult as any[])[0];
        if (!row) continue;
        let existing: string[] = [];
        try { existing = row.tags ? JSON.parse(row.tags) : []; } catch {}
        const filtered = existing.filter(t => t !== tagToRemove);
        await conn.execute(`UPDATE phonebook_contacts SET tags = ?, updated_at = ? WHERE id = ? AND mitra_id = ?`, [filtered.length ? JSON.stringify(filtered) : null, nowIso, id, mitraId]);
        updated++;
      }
      await conn.commit();
      return updated;
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  // v4.2.27: list all distinct tags di sebuah phonebook (untuk dropdown filter)
  async listPhonebookTags(phonebookId: number): Promise<Array<{ tag: string; count: number }>> {
    const mitraId = getMitraId();
    const [result] = await this.pool.execute(`SELECT tags FROM phonebook_contacts WHERE phonebook_id = ? AND mitra_id = ? AND tags IS NOT NULL`, [phonebookId, mitraId]);
    const rows: any = result as any[];
    const counter = new Map<string, number>();
    for (const r of rows) {
      try {
        const tags: string[] = JSON.parse(r.tags);
        if (Array.isArray(tags)) {
          for (const t of tags) {
            if (typeof t === "string" && t.trim()) {
              counter.set(t, (counter.get(t) ?? 0) + 1);
            }
          }
        }
      } catch {}
    }
    return Array.from(counter.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }

  async updatePhonebookContact(id: number, data: Partial<InsertPhonebookContact>): Promise<PhonebookContact | undefined> {
    const mitraId = getMitraId();
    const existing = await this.getPhonebookContact(id);
    if (!existing) return undefined;
    await this.db.update(phonebookContacts).set({
      ...data,
      customFields: data.customFields !== undefined
        ? (typeof data.customFields === "string" ? data.customFields : JSON.stringify(data.customFields ?? null))
        : existing.customFields,
      updatedAt: new Date().toISOString(),
    } as any).where(and(eq(phonebookContacts.id, id), eq(phonebookContacts.mitraId, mitraId)));
    return this.getPhonebookContact(id);
  }

  async deletePhonebookContact(id: number): Promise<boolean> {
    const mitraId = getMitraId();
    const c = await this.getPhonebookContact(id);
    if (!c) return false;
    await this.db.delete(phonebookContacts).where(and(eq(phonebookContacts.id, id), eq(phonebookContacts.mitraId, mitraId)));
    await this._refreshPhonebookCount(c.phonebookId);
    return true;
  }

  async deletePhonebookContactsBulk(ids: number[]): Promise<number> {
    if (ids.length === 0) return 0;
    const mitraId = getMitraId();
    // Get phonebookIds yang affected supaya bisa refresh count (scoped to mitra)
    const placeholders = ids.map(() => "?").join(",");
    const [affectedResult] = await this.pool.execute(
      `SELECT DISTINCT phonebook_id FROM phonebook_contacts WHERE id IN (${placeholders}) AND mitra_id = ?`,
      [...ids, mitraId]
    );
    const affectedPhonebookIds: number[] = (affectedResult as any[]).map((r: any) => r.phonebook_id);

    const conn = await this.pool.getConnection();
    await conn.beginTransaction();
    try {
      let deleted = 0;
      for (const id of ids) {
        await conn.execute(`DELETE FROM phonebook_contacts WHERE id = ? AND mitra_id = ?`, [id, mitraId]);
        deleted++;
      }
      await conn.commit();
      for (const pid of affectedPhonebookIds) await this._refreshPhonebookCount(pid);
      return deleted;
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  // ==================== END v4.2.20 / v4.2.21 / v4.2.24 ====================

  async seedDefaultMpwaTemplates(): Promise<void> {
    const nowIso = new Date().toISOString();
    const defaults: InsertMpwaTemplate[] = [
      {
        key: "otp_login",
        name: "OTP Login Portal",
        description: "Kode OTP untuk login portal pelanggan",
        content: "*JABNET FTTH*\nKode OTP login: *{otp}*\nBerlaku {ttlMin} menit.\nJangan share kode ini ke siapapun.",
        placeholders: JSON.stringify(["otp", "ttlMin"]),
        category: "auth",
        isSystem: 1,
        createdAt: nowIso,
      },
      {
        key: "tagihan_reminder",
        name: "Reminder Tagihan",
        description: "Pengingat tagihan mendekati jatuh tempo (H-3 / H-1)",
        content: "*JABNET FTTH - Pengingat Tagihan*\nHalo {nama},\nTagihan bulan ini: Rp *{amount}*\nJatuh tempo: {dueDate}\nMohon segera dibayar agar layanan tidak terputus.\nTerima kasih.",
        placeholders: JSON.stringify(["nama", "amount", "dueDate"]),
        category: "billing",
        isSystem: 1,
        createdAt: nowIso,
      },
      {
        key: "isolir_notif",
        name: "Notifikasi Isolir",
        description: "Pemberitahuan layanan diisolir karena belum bayar",
        content: "*JABNET FTTH - Layanan Diisolir*\nHalo {nama},\nLayanan internet Anda telah diisolir karena belum menyelesaikan pembayaran tagihan sebesar Rp *{amount}*.\nSilakan hubungi CS via WhatsApp untuk info pembayaran.\nTerima kasih.",
        placeholders: JSON.stringify(["nama", "amount"]),
        category: "billing",
        isSystem: 1,
        createdAt: nowIso,
      },
      {
        key: "bayar_confirmation",
        name: "Konfirmasi Pembayaran",
        description: "Konfirmasi layanan aktif kembali setelah pembayaran",
        content: "*JABNET FTTH - Pembayaran Diterima*\nHalo {nama},\nPembayaran sebesar Rp *{amount}* telah kami terima. Layanan internet Anda sudah aktif kembali.\nTerima kasih atas kepercayaan Anda!",
        placeholders: JSON.stringify(["nama", "amount"]),
        category: "billing",
        isSystem: 1,
        createdAt: nowIso,
      },
      {
        key: "welcome_customer",
        name: "Welcome Pelanggan Baru",
        description: "Ucapan selamat datang pelanggan baru setelah instalasi",
        content: "*Selamat Datang di JABNET FTTH!* \nHalo {nama},\nLayanan internet Anda telah terpasang dengan sukses.\nCustomer ID: *{customerId}*\nPaket: {package}\n\nUntuk self-service (cek tagihan, ganti WiFi password, dll), akses portal:\nhttps://portal.jabnet.id\n\nTerima kasih sudah memilih JABNET.",
        placeholders: JSON.stringify(["nama", "customerId", "package"]),
        category: "general",
        isSystem: 1,
        createdAt: nowIso,
      },
      {
        key: "ont_offline",
        name: "Notifikasi ONT Offline",
        description: "Alert ketika ONT pelanggan terdeteksi offline > 30 menit",
        content: "*JABNET FTTH - Gangguan Koneksi*\nHalo {nama},\nKami mendeteksi perangkat ONT Anda offline sejak {offlineSince}.\nMohon coba:\n1. Cek lampu ONT\n2. Restart perangkat\n3. Hubungi CS jika masih offline\n\nTim teknis siap bantu 24/7.",
        placeholders: JSON.stringify(["nama", "offlineSince"]),
        category: "notification",
        isSystem: 1,
        createdAt: nowIso,
      },
      // ===== JABNET SAHABAT v4.1.9 =====
      {
        key: "sahabat_invite_recorded",
        name: "Sahabat - Referral Dicatat",
        description: "Notifikasi ke pengundang saat referral baru di-input (by system portal atau manual admin)",
        content: "*JABNET SAHABAT - Referral Tercatat*\nHalo {nama},\n\nReferral kamu sudah kami catat:\n *{refereeName}*{refereePhoneLine}\n\nLangkah berikutnya:\n• Tim akan follow-up saat {refereeName} daftar internet.\n• Kamu akan dikabari lagi saat beliau aktif \n• Voucher Rp 50.000 cair saat pembayaran pertama masuk.\n\nKode Sahabat kamu: *{sahabatCode}*\nTotal referral tercatat: *{totalInvited}*\n\nMakasih sudah ajak tetangga",
        placeholders: JSON.stringify(["nama", "refereeName", "refereePhoneLine", "sahabatCode", "totalInvited"]),
        category: "loyalty",
        isSystem: 1,
        createdAt: nowIso,
      },
      {
        key: "sahabat_invite_registered",
        name: "Sahabat - Referee Terdaftar",
        description: "Notifikasi ke pengundang saat referee daftar / di-link ke customer",
        content: "*JABNET SAHABAT - Tetangga Anda Daftar!*\nHalo {nama},\n\nKabar baik! *{refereeName}* sudah resmi terdaftar sebagai pelanggan JABNET \n\nSatu langkah lagi - tunggu pembayaran pertama beliau, dan *Voucher Indomaret Rp 50.000* langsung cair ke akun kamu.\n\n Progress: *{totalSuccessful}* referral sukses\n Level: *{level}*\n {nextInfo}\n\nKode Sahabat: *{sahabatCode}*",
        placeholders: JSON.stringify(["nama", "refereeName", "totalSuccessful", "level", "nextInfo", "sahabatCode"]),
        category: "loyalty",
        isSystem: 1,
        createdAt: nowIso,
      },
      {
        key: "sahabat_boost_activated",
        name: "Speed Boost - Diaktivasi",
        description: "Notif ke customer saat admin verify redemption Speed-on-Demand",
        content: "*JABNET BOOST AKTIF*\nHalo {nama},\n\n *{rewardLabel}* sudah aktif sekarang!\n\n• Speed kamu di-boost *{speedMultiplier}×* lipat\n• Berlaku selama *{durationHours} jam*\n• Mulai: *{startAt}*\n• Selesai: *{endAt}*\n\nCoba speedtest sekarang dan rasakan bedanya \nSetelah {durationHours} jam, speed otomatis kembali normal.\n\n_Saldo point sisa: *{balance} pts*_",
        placeholders: JSON.stringify(["nama", "rewardLabel", "speedMultiplier", "durationHours", "startAt", "endAt", "balance"]),
        category: "loyalty",
        isSystem: 1,
        createdAt: nowIso,
      },
      {
        key: "sahabat_boost_expired",
        name: "Speed Boost - Selesai",
        description: "Notif ke customer saat boost expired (durasi habis)",
        content: "*JABNET BOOST SELESAI*\nHalo {nama},\n\n *{rewardLabel}* sudah selesai sesuai durasi.\nSpeed kamu kembali ke paket normal - *{normalPackage}*.\n\nSemoga boost-nya bermanfaat! Kumpulin point lagi untuk redeem boost berikutnya \n\nTotal point earned: *{lifetimeEarned} pts*\nSaldo aktif: *{balance} pts*",
        placeholders: JSON.stringify(["nama", "rewardLabel", "normalPackage", "lifetimeEarned", "balance"]),
        category: "loyalty",
        isSystem: 1,
        createdAt: nowIso,
      },
      {
        key: "sahabat_boost_rejected",
        name: "Speed Boost - Ditolak",
        description: "Notif ke customer saat redemption ditolak admin (point dikembalikan)",
        content: "ℹ *JABNET BOOST - Permintaan Ditolak*\nHalo {nama},\n\nMohon maaf, permintaan boost *{rewardLabel}* tidak bisa diaktifkan saat ini.\n\nAlasan: _{reason}_\n\n *{pointsCost} pts* sudah dikembalikan ke saldo kamu.\nSaldo sekarang: *{balance} pts*\n\nKamu bisa redeem ulang nanti atau hubungi CS untuk info lebih lanjut.",
        placeholders: JSON.stringify(["nama", "rewardLabel", "reason", "pointsCost", "balance"]),
        category: "loyalty",
        isSystem: 1,
        createdAt: nowIso,
      },
      {
        key: "sahabat_monthly_statement",
        name: "Sahabat - Statement Bulanan",
        description: "Rekap bulanan referral + reward ke Sahabat aktif",
        content: "*JABNET SAHABAT - Statement {month}*\nHalo {nama},\n\nRingkasan program Sahabat bulan ini:\n\n Invite baru: *{thisMonthInvited}*\n Reward cair: *{thisMonthRewarded}*\n Total referral sukses: *{totalSuccessful}*\n Level: *{level}*\n Ranking: *{rank}*\n\nKode Sahabat: *{sahabatCode}*\n\nMakasih udah jadi bagian keluarga JABNET",
        placeholders: JSON.stringify(["nama", "month", "thisMonthInvited", "thisMonthRewarded", "totalSuccessful", "level", "rank", "sahabatCode"]),
        category: "loyalty",
        isSystem: 1,
        createdAt: nowIso,
      },
      {
        key: "sahabat_referral_rewarded",
        name: "Sahabat - Referral Sukses",
        description: "Notifikasi saat tetangga yang diajak aktif & bayar → Voucher Indomaret Rp 50K",
        content: "*JABNET SAHABAT - Referral Sukses!*\nHalo {nama},\n\n*{refereeName}* yang kamu ajak sudah resmi aktif di JABNET! Terima kasih sudah ajak tetangga \n\n *Voucher Indomaret Rp 50.000* sudah masuk ke akun kamu.\n\n Total referral sukses: *{totalRefs}*\n Level Sahabat: *{level}*\n {nextInfo}\n\nAjak lebih banyak - 5 referral = naik *Perunggu* dapat bonus Rp 200K + Speed Boost!\n\nKode Sahabat kamu: *{sahabatCode}*",
        placeholders: JSON.stringify(["nama", "refereeName", "totalRefs", "level", "nextInfo", "sahabatCode"]),
        category: "loyalty",
        isSystem: 1,
        createdAt: nowIso,
      },
      {
        key: "sahabat_perunggu",
        name: "Sahabat - Naik Level Perunggu",
        description: "5 referral sukses → Perunggu: Voucher Rp 200K + Speed Boost",
        content: "*SELAMAT! KAMU SAHABAT PERUNGGU* \nHalo {nama},\n\nKamu berhasil *ajak 5 tetangga* jadi pelanggan JABNET! \n\n Reward Perunggu:\n• *Voucher Indomaret Rp 200.000*\n• *Speed Boost 2x/minggu* (akhir pekan)\n• Status: Sahabat RT/RW resmi \n\n Target berikutnya: *10 referral = Perak* (Internet GRATIS 12 BULAN!)\n\nKode Sahabat: *{sahabatCode}*\nCek detail di portal: https://portal.jabnet.id",
        placeholders: JSON.stringify(["nama", "sahabatCode"]),
        category: "loyalty",
        isSystem: 1,
        createdAt: nowIso,
      },
      {
        key: "sahabat_perak",
        name: "Sahabat - Naik Level Perak",
        description: "10 referral sukses → Perak: Internet gratis 12 bulan",
        content: "*WOW, SAHABAT PERAK!* \nHalo {nama},\n\n*10 referral sukses* - kamu luar biasa! \n\n Reward Perak:\n• *Internet GRATIS 12 BULAN* \n• Sertifikat Mitra resmi JABNET\n• Upgrade eligibility ke program RT/RW\n\n Target berikutnya: *20 referral = Emas* (GRATIS 24 bulan + upgrade speed permanen!)\n\nKode Sahabat: *{sahabatCode}*\nHubungi CS untuk tanda tangan kontrak mitra resmi.",
        placeholders: JSON.stringify(["nama", "sahabatCode"]),
        category: "loyalty",
        isSystem: 1,
        createdAt: nowIso,
      },
      {
        key: "sahabat_emas",
        name: "Sahabat - Naik Level Emas",
        description: "20 referral sukses → Emas: Internet gratis 24 bulan + upgrade speed permanen",
        content: "*SAHABAT EMAS - KAMU JUARA!* \nHalo {nama},\n\n*20 referral sukses* - kamu top mitra RT/RW! \n\n Reward Emas:\n• *Internet GRATIS 24 BULAN* (2 tahun!)\n• *Upgrade speed 1 tier permanen*\n• Prioritas support VIP\n\n Target: *30 referral = Platinum* (GRATIS 3 tahun + CASH Rp 2jt + Ambassador)!\n\nKode: *{sahabatCode}*",
        placeholders: JSON.stringify(["nama", "sahabatCode"]),
        category: "loyalty",
        isSystem: 1,
        createdAt: nowIso,
      },
      {
        key: "sahabat_platinum",
        name: "Sahabat - Naik Level Platinum",
        description: "30 referral sukses → Platinum: gratis 36 bln + cash 2jt + Ambassador",
        content: "*SAHABAT PLATINUM - AMBASSADOR!* \nHalo {nama},\n\n*30 referral sukses* - kamu legendaris! \n\n Reward Platinum:\n• *Internet GRATIS 36 BULAN* (3 tahun!)\n• *Komisi cash Rp 2.000.000*\n• Status *Ambassador JABNET*\n• Undangan event eksklusif mitra\n\n Target akhir: *50 referral = Berlian* (GRATIS 5 tahun + CASH Rp 5jt + Trainer)!\n\nKode Sahabat: *{sahabatCode}*\nTim kami akan menghubungi untuk seremoni penyerahan reward",
        placeholders: JSON.stringify(["nama", "sahabatCode"]),
        category: "loyalty",
        isSystem: 1,
        createdAt: nowIso,
      },
      {
        key: "sahabat_berlian",
        name: "Sahabat - Naik Level Berlian",
        description: "50 referral sukses → Berlian: gratis 60 bln + cash 5jt + Trainer",
        content: "*SAHABAT BERLIAN - LEGEND!* \nHalo {nama},\n\n*50 REFERRAL SUKSES* - kamu ICON JABNET SAHABAT! \n\n Reward Berlian:\n• *Internet GRATIS 60 BULAN* (5 tahun!)\n• *Komisi cash Rp 5.000.000*\n• Status *Trainer program Sahabat*\n• Revenue share 15% untuk referral berikutnya (Ambassador status)\n\nKamu resmi jadi bagian elite JABNET. Terima kasih sudah percaya dan membangun bersama kami \n\nKode: *{sahabatCode}*",
        placeholders: JSON.stringify(["nama", "sahabatCode"]),
        category: "loyalty",
        isSystem: 1,
        createdAt: nowIso,
      },
      // v4.2.17: CSAT survey template - kirim 24 jam setelah ticket close
      {
        key: "csat_survey",
        name: "CSAT - Survey Pasca Resolusi",
        description: "Auto 24 jam setelah ticket close. Customer kasih rating 1-5 ke teknisi.",
        content: "Halo {nama},\n\nTerima kasih atas kepercayaan Anda menggunakan JABNET FTTH \n\nTiket *{ticketNumber}* sudah selesai dikerjakan oleh *{teknisi}*. Bagaimana pengalaman Anda?\n\n Beri rating + feedback singkat di:\n {csatUrl}\n\nMasukan Anda sangat berarti untuk peningkatan layanan kami.\n\n- *Tim JABNET*",
        placeholders: JSON.stringify(["nama", "ticketNumber", "teknisi", "csatUrl"]),
        category: "ticket",
        isSystem: 1,
        createdAt: nowIso,
      },
    ];

    // Boot-time seed - no HTTP context, so wrap with withMitra(1, ...) to inject tenant context
    await withMitra(1, async () => {
      let seeded = 0;
      for (const t of defaults) {
        const existing = await this.getMpwaTemplateByKey(t.key!);
        if (!existing) {
          try {
            await this.createMpwaTemplate(t);
            seeded++;
          } catch { /* race - safe */ }
        }
      }
      if (seeded > 0) {
        console.log(`[JABNET FTTH v4.1.3] Seeded ${seeded} MPWA default template(s)`);
      }
    });
  }

  // ---- Pole ----
  async getPoles(): Promise<Pole[]> {
    const mitraId = getMitraId();
    return this.db.select().from(poles).where(eq(poles.mitraId, mitraId));
  }
  async getPole(id: number): Promise<Pole | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(poles).where(and(eq(poles.id, id), eq(poles.mitraId, mitraId)));
    return row;
  }
  async createPole(data: InsertPole): Promise<Pole> {
    const mitraId = getMitraId();
    const result = await this.db.insert(poles).values({ ...data, mitraId });
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(poles).where(eq(poles.id, insertId));
    return row!;
  }
  async updatePole(id: number, data: Partial<InsertPole>): Promise<Pole | undefined> {
    const mitraId = getMitraId();
    await this.db.update(poles).set(data).where(and(eq(poles.id, id), eq(poles.mitraId, mitraId)));
    const [row] = await this.db.select().from(poles).where(and(eq(poles.id, id), eq(poles.mitraId, mitraId)));
    return row;
  }
  async deletePole(id: number): Promise<boolean> {
    const mitraId = getMitraId();
    const [result] = await this.db.delete(poles).where(and(eq(poles.id, id), eq(poles.mitraId, mitraId)));
    return (result as any).affectedRows > 0;
  }

  // ---- Cable ----
  async getCables(): Promise<Cable[]> {
    const mitraId = getMitraId();
    const allCables = await this.db.select().from(cables).where(eq(cables.mitraId, mitraId));
    return allCables.map(c => ({
      ...c,
      coreTersisa: (c.totalCore ?? 0) - (c.usedCore ?? 0)
    }));
  }
  async getCable(id: number): Promise<Cable | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(cables).where(and(eq(cables.id, id), eq(cables.mitraId, mitraId)));
    if (!row) return undefined;
    return { ...row, coreTersisa: (row.totalCore ?? 0) - (row.usedCore ?? 0) };
  }
  async createCable(data: InsertCable): Promise<Cable> {
    const mitraId = getMitraId();
    const result = await this.db.insert(cables).values({ ...data, mitraId });
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(cables).where(eq(cables.id, insertId));
    return row!;
  }
  async updateCable(id: number, data: Partial<InsertCable>): Promise<Cable | undefined> {
    const mitraId = getMitraId();
    await this.db.update(cables).set(data).where(and(eq(cables.id, id), eq(cables.mitraId, mitraId)));
    const [row] = await this.db.select().from(cables).where(and(eq(cables.id, id), eq(cables.mitraId, mitraId)));
    return row;
  }
  async deleteCable(id: number): Promise<boolean> {
    const mitraId = getMitraId();
    const [result] = await this.db.delete(cables).where(and(eq(cables.id, id), eq(cables.mitraId, mitraId)));
    return (result as any).affectedRows > 0;
  }

  // ---- OTB ----
  private async enrichOtbsWithUsage(rawOtbs: Otb[]): Promise<Otb[]> {
    // Menghitung jumlah koneksi core yang dari_type = 'otb' atau to_type = 'otb' untuk mengetahui port yang dipakai
    // (core_connections scoped to active mitra via getMitraId)
    const mitraId = getMitraId();
    const counts = await this.db.select({
      otbId: coreConnections.fromId,
      count: sql<number>`count(*)`
    }).from(coreConnections).where(and(eq(coreConnections.fromType, 'otb'), eq(coreConnections.mitraId, mitraId))).groupBy(coreConnections.fromId);

    // (Bisa juga toType = 'otb', tapi di JABNET OTB adalah origin/from)
    const countMap = new Map<number, number>();
    for (const row of counts) {
      countMap.set(row.otbId, row.count);
    }
    return rawOtbs.map(otb => {
      const used = countMap.get(otb.id) ?? 0;
      return {
        ...otb,
        coreTersisa: otb.totalCores - used
      };
    });
  }

  async getOtbs(): Promise<Otb[]> {
    const mitraId = getMitraId();
    const raw = await this.db.select().from(otbs).where(eq(otbs.mitraId, mitraId));
    return this.enrichOtbsWithUsage(raw);
  }
  async getOtbsByPop(popId: number): Promise<Otb[]> {
    const mitraId = getMitraId();
    const raw = await this.db.select().from(otbs).where(and(eq(otbs.popId, popId), eq(otbs.mitraId, mitraId)));
    return this.enrichOtbsWithUsage(raw);
  }
  async getOtb(id: number): Promise<Otb | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(otbs).where(and(eq(otbs.id, id), eq(otbs.mitraId, mitraId)));
    if (!row) return undefined;
    const enriched = await this.enrichOtbsWithUsage([row]);
    return enriched[0];
  }
  async createOtb(data: InsertOtb): Promise<Otb> {
    const mitraId = getMitraId();
    const result = await this.db.insert(otbs).values({ ...data, mitraId });
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(otbs).where(eq(otbs.id, insertId));
    return row!;
  }
  async updateOtb(id: number, data: Partial<InsertOtb>): Promise<Otb | undefined> {
    const mitraId = getMitraId();
    await this.db.update(otbs).set(data).where(and(eq(otbs.id, id), eq(otbs.mitraId, mitraId)));
    const [row] = await this.db.select().from(otbs).where(and(eq(otbs.id, id), eq(otbs.mitraId, mitraId)));
    return row;
  }
  async deleteOtb(id: number): Promise<boolean> {
    const mitraId = getMitraId();
    const [result] = await this.db.delete(otbs).where(and(eq(otbs.id, id), eq(otbs.mitraId, mitraId)));
    return (result as any).affectedRows > 0;
  }

  // ---- Bestray ----
  async getBestrays(): Promise<Bestray[]> {
    const mitraId = getMitraId();
    return this.db.select().from(bestrays).where(eq(bestrays.mitraId, mitraId));
  }
  async getBestraysByOdc(odcId: number): Promise<Bestray[]> {
    const mitraId = getMitraId();
    return this.db.select().from(bestrays).where(and(eq(bestrays.odcId, odcId), eq(bestrays.mitraId, mitraId)));
  }
  async getBestray(id: number): Promise<Bestray | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(bestrays).where(and(eq(bestrays.id, id), eq(bestrays.mitraId, mitraId)));
    return row;
  }
  async createBestray(data: InsertBestray): Promise<Bestray> {
    const mitraId = getMitraId();
    const result = await this.db.insert(bestrays).values({ ...data, mitraId });
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(bestrays).where(eq(bestrays.id, insertId));
    return row!;
  }
  async updateBestray(id: number, data: Partial<InsertBestray>): Promise<Bestray | undefined> {
    const mitraId = getMitraId();
    await this.db.update(bestrays).set(data).where(and(eq(bestrays.id, id), eq(bestrays.mitraId, mitraId)));
    const [row] = await this.db.select().from(bestrays).where(and(eq(bestrays.id, id), eq(bestrays.mitraId, mitraId)));
    return row;
  }
  async deleteBestray(id: number): Promise<boolean> {
    const mitraId = getMitraId();
    const [result] = await this.db.delete(bestrays).where(and(eq(bestrays.id, id), eq(bestrays.mitraId, mitraId)));
    return (result as any).affectedRows > 0;
  }

  // ---- Splitter ----
  async getSplitters(): Promise<Splitter[]> {
    const mitraId = getMitraId();
    return this.db.select().from(splitters).where(eq(splitters.mitraId, mitraId));
  }
  async getSplitter(id: number): Promise<Splitter | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(splitters).where(and(eq(splitters.id, id), eq(splitters.mitraId, mitraId)));
    return row;
  }
  async createSplitter(data: InsertSplitter): Promise<Splitter> {
    const mitraId = getMitraId();
    const result = await this.db.insert(splitters).values({ ...data, mitraId });
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(splitters).where(eq(splitters.id, insertId));
    return row!;
  }
  async updateSplitter(id: number, data: Partial<InsertSplitter>): Promise<Splitter | undefined> {
    const mitraId = getMitraId();
    await this.db.update(splitters).set(data).where(and(eq(splitters.id, id), eq(splitters.mitraId, mitraId)));
    const [row] = await this.db.select().from(splitters).where(and(eq(splitters.id, id), eq(splitters.mitraId, mitraId)));
    return row;
  }
  async deleteSplitter(id: number): Promise<boolean> {
    const mitraId = getMitraId();
    const [result] = await this.db.delete(splitters).where(and(eq(splitters.id, id), eq(splitters.mitraId, mitraId)));
    return (result as any).affectedRows > 0;
  }

  // ---- Cable Core ----
  async getCableCores(): Promise<CableCore[]> {
    const mitraId = getMitraId();
    return this.db.select().from(cableCores).where(eq(cableCores.mitraId, mitraId));
  }
  async getCableCoreByCable(cableId: number): Promise<CableCore[]> {
    const mitraId = getMitraId();
    return this.db.select().from(cableCores).where(and(eq(cableCores.cableId, cableId), eq(cableCores.mitraId, mitraId)));
  }
  async getCableCore(id: number): Promise<CableCore | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(cableCores).where(and(eq(cableCores.id, id), eq(cableCores.mitraId, mitraId)));
    return row;
  }
  async createCableCore(data: InsertCableCore): Promise<CableCore> {
    const mitraId = getMitraId();
    const result = await this.db.insert(cableCores).values({ ...data, mitraId });
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(cableCores).where(eq(cableCores.id, insertId));
    return row!;
  }
  async updateCableCore(id: number, data: Partial<InsertCableCore>): Promise<CableCore | undefined> {
    const mitraId = getMitraId();
    await this.db.update(cableCores).set(data).where(and(eq(cableCores.id, id), eq(cableCores.mitraId, mitraId)));
    const [row] = await this.db.select().from(cableCores).where(and(eq(cableCores.id, id), eq(cableCores.mitraId, mitraId)));
    return row;
  }
  async deleteCableCore(id: number): Promise<boolean> {
    const mitraId = getMitraId();
    const [result] = await this.db.delete(cableCores).where(and(eq(cableCores.id, id), eq(cableCores.mitraId, mitraId)));
    return (result as any).affectedRows > 0;
  }
  async generateCableCores(cableId: number, totalCore: number, totalTube: number): Promise<CableCore[]> {
    const mitraId = getMitraId();
    const tubeColors = ["biru", "orange", "hijau", "coklat", "abu-abu", "putih", "merah", "hitam"];
    const coreColors = ["biru", "orange", "hijau", "coklat", "abu-abu", "putih", "merah", "hitam", "kuning", "ungu", "pink", "tosca"];
    const coresPerTube = 12;
    const results: CableCore[] = [];

    for (let tube = 1; tube <= totalTube; tube++) {
      for (let core = 1; core <= coresPerTube; core++) {
        const globalCore = (tube - 1) * coresPerTube + core;
        if (globalCore > totalCore) break;
        const insertResult = await this.db.insert(cableCores).values({
          mitraId,
          cableId,
          tubeNumber: tube,
          tubeColor: tubeColors[(tube - 1) % tubeColors.length],
          coreNumber: core,
          coreColor: coreColors[(core - 1) % coreColors.length],
          globalCoreNumber: globalCore,
          status: "available",
        });
        const newCoreId = Number((insertResult[0] as any).insertId);
        const [row] = await this.db.select().from(cableCores).where(eq(cableCores.id, newCoreId));
        results.push(row!);
      }
    }
    return results;
  }

  async autoGenerateCableCores(cableId: number, totalCore: number, totalTube: number): Promise<void> {
    const coresPerTube = Math.ceil(totalCore / totalTube);

    for (let tube = 1; tube <= totalTube; tube++) {
      for (let core = 1; core <= coresPerTube; core++) {
        const globalCoreNum = (tube - 1) * coresPerTube + core;
        if (globalCoreNum > totalCore) break;

        // TIA-598 standard: 12 colors per tube
        const tubeColorIndex = (tube - 1) % TUBE_COLORS.length;
        const coreColorIndex = (core - 1) % CORE_COLORS.length;

        await this.createCableCore({
          cableId,
          tubeNumber: tube,
          coreNumber: core,
          tubeColor: TUBE_COLORS[tubeColorIndex],
          coreColor: CORE_COLORS[coreColorIndex],
          globalCoreNumber: globalCoreNum,
          status: "available",
        });
      }
    }
  }

  // ---- Core Connection ----
  async getCoreConnections(): Promise<CoreConnection[]> {
    const mitraId = getMitraId();
    return this.db.select().from(coreConnections).where(eq(coreConnections.mitraId, mitraId));
  }
  async getCoreConnection(id: number): Promise<CoreConnection | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(coreConnections).where(and(eq(coreConnections.id, id), eq(coreConnections.mitraId, mitraId)));
    return row;
  }
  async createCoreConnection(data: InsertCoreConnection): Promise<CoreConnection> {
    const mitraId = getMitraId();
    const result = await this.db.insert(coreConnections).values({ ...data, mitraId });
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(coreConnections).where(eq(coreConnections.id, insertId));
    return row!;
  }
  async updateCoreConnection(id: number, data: Partial<InsertCoreConnection>): Promise<CoreConnection | undefined> {
    const mitraId = getMitraId();
    await this.db.update(coreConnections).set(data).where(and(eq(coreConnections.id, id), eq(coreConnections.mitraId, mitraId)));
    const [row] = await this.db.select().from(coreConnections).where(and(eq(coreConnections.id, id), eq(coreConnections.mitraId, mitraId)));
    return row;
  }
  async deleteCoreConnection(id: number): Promise<boolean> {
    const mitraId = getMitraId();
    const [result] = await this.db.delete(coreConnections).where(and(eq(coreConnections.id, id), eq(coreConnections.mitraId, mitraId)));
    return (result as any).affectedRows > 0;
  }
  async getCoreConnectionsByEntity(entityType: string, entityId: number): Promise<CoreConnection[]> {
    const mitraId = getMitraId();
    return this.db.select().from(coreConnections).where(
      and(
        sql`(from_type = ${entityType} AND from_id = ${entityId}) OR (to_type = ${entityType} AND to_id = ${entityId})`,
        eq(coreConnections.mitraId, mitraId)
      )
    );
  }

  // ---- Users ----
  async getAllUsers(): Promise<User[]> {
    return this.db.select().from(users).orderBy(desc(users.id));
  }
  /**
   * Return user IDs that are members of a given mitra (via user_mitras join).
   * Used to scope /api/users + /api/roles for mitra admins (non-system-admin).
   * Tidak pakai tenant context - caller pass mitraId eksplisit karena ini
   * dipanggil dari endpoint user-management yang skip tenantContext middleware.
   */
  async getUserIdsInMitra(mitraId: number): Promise<Set<number>> {
    const rows: any = ((await this.db.execute(sql`
      SELECT DISTINCT user_id FROM user_mitras WHERE mitra_id = ${mitraId}
    `))[0] as any);
    const ids = new Set<number>();
    for (const r of rows ?? []) ids.add(Number(r.user_id));
    return ids;
  }
  async getAssignableUsers(
    activeMitraId: number | null | undefined,
    allowCrossTenant: boolean,
  ): Promise<Array<{ id: number; name: string | null; username: string; role: string; mitraId: number | null; mitraName: string | null }>> {
    let all = await this.getAllUsers();
    if (!allowCrossTenant && activeMitraId) {
      const memberIds = await this.getUserIdsInMitra(activeMitraId);
      all = all.filter((u) => memberIds.has(u.id));
    }
    // Resolve a "primary" mitra label per user (lowest user_mitras.id wins). One query, no N+1.
    const labels = new Map<number, { mitraId: number; mitraName: string | null }>();
    const rows: any = ((await this.db.execute(sql`
      SELECT um.user_id AS userId, um.mitra_id AS mitraId, m.name AS mitraName
      FROM user_mitras um LEFT JOIN mitras m ON m.id = um.mitra_id
      ORDER BY um.user_id, um.id
    `))[0] as any);
    for (const r of rows ?? []) {
      const uid = Number(r.userId);
      if (!labels.has(uid)) labels.set(uid, { mitraId: Number(r.mitraId), mitraName: r.mitraName ?? null });
    }
    return all.map((u) => {
      const lbl = labels.get(u.id);
      return { id: u.id, name: u.name ?? null, username: u.username, role: u.role ?? "", mitraId: lbl?.mitraId ?? null, mitraName: lbl?.mitraName ?? null };
    });
  }
  async getUser(id: number): Promise<User | undefined> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id));
    return row;
  }
  async getUserByUsername(username: string): Promise<User | undefined> {
    const [row] = await this.db.select().from(users).where(eq(users.username, username));
    return row;
  }
  async getUserByToken(token: string): Promise<User | undefined> {
    const [row] = await this.db.select().from(users).where(eq(users.token, token));
    return row;
  }
  async createUser(data: InsertUser): Promise<User> {
    const result = await this.db.insert(users).values(data);
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(users).where(eq(users.id, insertId));
    return row!;
  }
  async updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined> {
    await this.db.update(users).set(data).where(eq(users.id, id));
    // If roleId changed, propagate to ALL user_mitras memberships for this user.
    // getUserEffectivePermissionsAtMitra resolves user_mitras.role_id FIRST (falls through to
    // users.role_id only when NULL), so without this propagation, /users page role changes are
    // silently ignored for users with any mitra membership.
    // Per-mitra overrides can still be applied later via PATCH /api/mitras/:id/members/:userId.
    if (data.roleId !== undefined && data.roleId !== null) {
      try {
        await this.db.execute(sql`
          UPDATE user_mitras SET role_id = ${data.roleId} WHERE user_id = ${id}
        `);
      } catch (e: any) {
        console.warn("[updateUser] user_mitras.role_id propagation failed (column missing?):", e?.message);
      }
    }
    // Invalidate cache if role-related field changed
    if (data.roleId !== undefined || data.role !== undefined || data.isActive !== undefined) {
      invalidatePermCache(id);
      invalidatePermCacheAtMitra(id); // per-mitra cache: all mitras for this user
    }
    const [row] = await this.db.select().from(users).where(eq(users.id, id));
    return row;
  }
  async deleteUser(id: number): Promise<boolean> {
    const [result] = await this.db.delete(users).where(eq(users.id, id));
    invalidatePermCache(id);
    invalidatePermCacheAtMitra(id); // evict all mitra-scoped entries for this user
    return (result as any).affectedRows > 0;
  }
  async updateUserToken(id: number, token: string | null): Promise<void> {
    await this.db.update(users).set({ token }).where(eq(users.id, id));
  }
  async updateUserLastLogin(id: number): Promise<void> {
    await this.db.update(users).set({ lastLogin: new Date().toISOString() }).where(eq(users.id, id));
  }

  // ==================== Phase B: Mitras + User-Mitra membership ====================

  /** List all mitras. By default returns active ones; pass includeInactive=true to include all. */
  async listMitras(includeInactive = false): Promise<Mitra[]> {
    if (includeInactive) {
      return this.db.select().from(mitras).orderBy(mitras.id);
    }
    return this.db.select().from(mitras).where(eq(mitras.isActive, 1)).orderBy(mitras.id);
  }

  async getMitra(id: number): Promise<Mitra | undefined> {
    const [row] = await this.db.select().from(mitras).where(eq(mitras.id, id));
    return row;
  }

  async getMitraBySlug(slug: string): Promise<Mitra | undefined> {
    const [row] = await this.db.select().from(mitras).where(eq(mitras.slug, slug));
    return row;
  }

  // ---- Mitra slug cache (TTL 60s) untuk resolve mitraId → slug saat upload foto ----
  private mitraSlugCache: Map<number, { slug: string; expiresAt: number }> = new Map();
  /**
   * Resolve mitra slug dari id, cached 60s. Throw kalau mitra tidak ada atau slug kosong.
   */
  async getMitraSlug(mitraId: number): Promise<string> {
    const now = Date.now();
    const cached = this.mitraSlugCache.get(mitraId);
    if (cached && cached.expiresAt > now) return cached.slug;
    const m = await this.getMitra(mitraId);
    if (!m || !m.slug) throw new Error(`Mitra ${mitraId} tidak ditemukan / slug kosong`);
    this.mitraSlugCache.set(mitraId, { slug: m.slug, expiresAt: now + 60_000 });
    return m.slug;
  }

  /** Invalidate slug cache (panggil saat slug mitra di-update). */
  invalidateMitraSlugCache(mitraId?: number): void {
    if (mitraId !== undefined) this.mitraSlugCache.delete(mitraId);
    else this.mitraSlugCache.clear();
  }

  /** Get all mitras a user is a member of, ordered with primary first. */
  async getUserMitras(userId: number): Promise<Array<Mitra & { isPrimary: boolean }>> {
    const rows = ((await this.db.execute(sql`
      SELECT m.*, um.is_primary
      FROM user_mitras um
      JOIN mitras m ON m.id = um.mitra_id
      WHERE um.user_id = ${userId} AND m.is_active = 1
      ORDER BY um.is_primary DESC, m.id ASC
    `))[0] as unknown) as any[];
    return rows.map((r: any) => ({
      id: r.id,
      slug: r.slug,
      displayName: r.display_name,
      logoUrl: r.logo_url,
      features: r.features,
      primaryContactName: r.primary_contact_name,
      primaryContactPhone: r.primary_contact_phone,
      name: r.name,
      phone: r.phone,
      email: r.email,
      address: r.address,
      district: r.district,
      saldo: r.saldo,
      commissionRate: r.commission_rate,
      joinedAt: r.joined_at,
      isActive: r.is_active,
      notes: r.notes,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      isPrimary: Number(r.is_primary ?? 0) === 1,
    }));
  }

  /** Batched (anti-N+1): nama mitra yang bisa diakses tiap user. Map userId → ["JABNET Garut", ...].
   *  Dipakai di list /users untuk tampilkan "akses mitra" per user. Hanya mitra aktif. */
  async getMitraNamesByUserIds(userIds: number[]): Promise<Map<number, string[]>> {
    const map = new Map<number, string[]>();
    if (userIds.length === 0) return map;
    const rows: any = ((await this.db.execute(sql`
      SELECT um.user_id, COALESCE(m.display_name, m.name) AS nm
      FROM user_mitras um
      JOIN mitras m ON m.id = um.mitra_id
      WHERE um.user_id IN (${sql.join(userIds.map((id) => sql`${id}`), sql`, `)}) AND m.is_active = 1
      ORDER BY um.is_primary DESC, m.id ASC
    `))[0] as any);
    for (const r of (rows as any[]) ?? []) {
      const uid = Number(r.user_id);
      if (!map.has(uid)) map.set(uid, []);
      map.get(uid)!.push(String(r.nm));
    }
    return map;
  }

  /** Check if user is a member of the given mitra. */
  async isUserMemberOfMitra(userId: number, mitraId: number): Promise<boolean> {
    const rows = ((await this.db.execute(sql`
      SELECT 1 FROM user_mitras WHERE user_id = ${userId} AND mitra_id = ${mitraId} LIMIT 1
    `))[0] as unknown) as any[];
    return rows.length > 0;
  }

  /** Switch user's active mitra (validates membership). Returns new active mitra or null if invalid. */
  async setActiveMitra(userId: number, mitraId: number): Promise<Mitra | null> {
    const isMember = await this.isUserMemberOfMitra(userId, mitraId);
    if (!isMember) return null;
    const mitra = await this.getMitra(mitraId);
    if (!mitra || mitra.isActive !== 1) return null;
    await this.db.update(users).set({ activeMitraId: mitraId } as any).where(eq(users.id, userId));
    invalidatePermCache(userId);
    return mitra;
  }

  /** Get user's currently active mitra (returns JABNET id=1 as fallback if user has no activeMitraId). */
  async getActiveMitraForUser(userId: number): Promise<Mitra | undefined> {
    const [u] = await this.db.select().from(users).where(eq(users.id, userId));
    if (!u) return undefined;
    const targetId = (u as any).activeMitraId ?? 1;
    const mitra = await this.getMitra(targetId);
    if (mitra) return mitra;
    // Fallback to user's primary membership if activeMitraId invalid
    const memberships = await this.getUserMitras(userId);
    return memberships[0];
  }

  /** Add user to mitra (idempotent). */
  async addUserToMitra(userId: number, mitraId: number, isPrimary = false, roleId?: number | null): Promise<void> {
    try {
      if (roleId != null) {
        await this.db.execute(sql`
          INSERT IGNORE INTO user_mitras (user_id, mitra_id, is_primary, role_id, created_at)
          VALUES (${userId}, ${mitraId}, ${isPrimary ? 1 : 0}, ${roleId}, ${new Date().toISOString()})
        `);
      } else {
        await this.db.execute(sql`
          INSERT IGNORE INTO user_mitras (user_id, mitra_id, is_primary, created_at)
          VALUES (${userId}, ${mitraId}, ${isPrimary ? 1 : 0}, ${new Date().toISOString()})
        `);
      }
    } catch (err: any) {
      // ignore duplicate
    }
    invalidatePermCacheAtMitra(userId, mitraId); // new membership may change effective perms
  }

  /** Remove user from mitra membership. */
  async removeUserFromMitra(userId: number, mitraId: number): Promise<boolean> {
    const result: any = await this.db.execute(sql`
      DELETE FROM user_mitras WHERE user_id = ${userId} AND mitra_id = ${mitraId}
    `);
    invalidatePermCacheAtMitra(userId, mitraId); // evict stale resolved perms
    return Number(result?.[0]?.affectedRows ?? 0) > 0;
  }

  /** Fetch full user_mitras row for a specific (userId, mitraId) pair. Returns null if not found. */
  async getUserMitraMembership(userId: number, mitraId: number): Promise<UserMitra | null> {
    const rows: any = await this.db.execute(sql`
      SELECT * FROM user_mitras WHERE user_id = ${userId} AND mitra_id = ${mitraId} LIMIT 1
    `);
    return (rows[0] as any[])[0] ?? null;
  }

  /** Update the per-membership role for a user in a given mitra. Invalidates perm cache. */
  async updateMitraMemberRole(mitraId: number, userId: number, roleId: number): Promise<UserMitra | null> {
    try {
      await this.db.execute(sql`
        UPDATE user_mitras SET role_id = ${roleId}
        WHERE user_id = ${userId} AND mitra_id = ${mitraId}
      `);
    } catch (e: any) {
      console.error("[updateMitraMemberRole] failed:", e?.message);
      throw new Error("Tidak bisa update role membership (kolom role_id mungkin belum di-migrasi). Restart server.");
    }
    invalidatePermCacheAtMitra(userId, mitraId);
    return this.getUserMitraMembership(userId, mitraId);
  }

  /** Count how many System-Admin role members exist at mitra=1. Used to protect minimum-1 guard. */
  async countSystemAdminsAtMitra1(): Promise<number> {
    try {
      const rows: any = await this.db.execute(sql`
        SELECT COUNT(*) AS cnt FROM user_mitras um
        JOIN roles r ON r.id = um.role_id
        WHERE um.mitra_id = 1 AND r.name = 'System-Admin'
      `);
      return Number((rows[0] as any[])[0]?.cnt ?? 0);
    } catch (e: any) {
      // Column missing or join failed - return 0 so demote-guard doesn't false-block legit ops.
      console.warn("[countSystemAdminsAtMitra1] failed, returning 0:", e?.message);
      return 0;
    }
  }

  // ==================== Phase F: per-tenant integration settings ====================

  /**
   * Get a per-tenant config value. Resolution order:
   *   1. mitra_integrations row for active mitra + key
   *   2. fallback to app_settings (global) when allowed
   *   3. null
   *
   * Use this anywhere code previously called `storage.getSetting(key)` for integration
   * config (MPWA, Maps, MikroTik creds, billing endpoint). Caller must be inside tenant context.
   */
  async getMitraSetting(key: string, opts?: { fallbackToGlobal?: boolean }): Promise<string | null> {
    const mitraId = getMitraId();
    const fallback = opts?.fallbackToGlobal !== false; // default true
    const rows: any = ((await this.db.execute(sql`
      SELECT value FROM mitra_integrations WHERE mitra_id = ${mitraId} AND \`key\` = ${key} LIMIT 1
    `))[0] as any);
    const v = rows?.[0]?.value;
    if (v !== undefined && v !== null) return String(v);
    if (!fallback) return null;
    // Fallback to global app_settings
    return this.getSetting(key);
  }

  /**
   * Upsert a per-tenant config value. Marks `is_secret=1` for sensitive keys (tokens, passwords).
   */
  async setMitraSetting(key: string, value: string | null, opts?: { isSecret?: boolean }): Promise<void> {
    const mitraId = getMitraId();
    const isSecret = opts?.isSecret ? 1 : 0;
    const now = new Date().toISOString();
    await this.db.execute(sql`
      INSERT INTO mitra_integrations (mitra_id, \`key\`, value, is_secret, updated_at)
      VALUES (${mitraId}, ${key}, ${value}, ${isSecret}, ${now})
      ON DUPLICATE KEY UPDATE value = VALUES(value), is_secret = VALUES(is_secret), updated_at = VALUES(updated_at)
    `);
  }

  /** List all integration settings for current mitra. Secret values masked unless caller passes unmask=true. */
  async listMitraSettings(opts?: { unmask?: boolean }): Promise<Array<{ key: string; value: string | null; isSecret: boolean; updatedAt: string | null }>> {
    const mitraId = getMitraId();
    const rows: any = ((await this.db.execute(sql`
      SELECT \`key\`, value, is_secret AS isSecret, updated_at AS updatedAt
      FROM mitra_integrations WHERE mitra_id = ${mitraId} ORDER BY \`key\`
    `))[0] as any);
    return (rows ?? []).map((r: any) => ({
      key: String(r.key),
      value: r.isSecret && !opts?.unmask && r.value ? "••••••••" : (r.value ?? null),
      isSecret: !!r.isSecret,
      updatedAt: r.updatedAt ?? null,
    }));
  }

  /**
   * Seed default mitra_integrations rows untuk mitra baru.
   * Semua key di-seed dengan value="" (empty string) sehingga getMitraSetting() TIDAK fallback
   * ke app_settings JABNET - mitra baru lihat field KOSONG, bukan credentials JABNET.
   * Kecuali `mpwa_url` yang di-set ke shared MPWA endpoint JABNET.
   * Pakai INSERT IGNORE so re-seeding aman (idempotent).
   */
  async seedMitraIntegrationDefaults(mitraId: number): Promise<{ inserted: number; skipped: number }> {
    const defaults: Array<{ key: string; value: string; isSecret: 0 | 1 }> = [
      { key: "mpwa_url", value: "https://mpwa.jabnet.id", isSecret: 0 },
      { key: "mpwa_enabled", value: "false", isSecret: 0 },
      { key: "mpwa_token", value: "", isSecret: 1 },
      { key: "mpwa_sender_number", value: "", isSecret: 0 },
      { key: "mpwa_message_template", value: "", isSecret: 0 },
      { key: "google_maps_api_key", value: "", isSecret: 1 },
      // billing_api_url + billing_api_token = shared infra di .env (process.env.BILLING_API_URL/TOKEN), bukan per-mitra
      { key: "billing_reseller_id", value: "", isSecret: 0 },
      { key: "billing_reseller_nama", value: "", isSecret: 0 },
      { key: "billing_reseller_alamat", value: "", isSecret: 0 },
      { key: "billing_reseller_phone", value: "", isSecret: 0 },
      { key: "billing_reseller_email", value: "", isSecret: 0 },
      { key: "billing_reseller_password", value: "", isSecret: 1 },
      { key: "genieacs_host", value: "", isSecret: 0 },
      { key: "genieacs_port", value: "", isSecret: 0 },
      { key: "genieacs_username", value: "", isSecret: 0 },
      { key: "genieacs_password", value: "", isSecret: 1 },
      { key: "meta_pixel_id", value: "", isSecret: 0 },
      { key: "meta_access_token", value: "", isSecret: 1 },
      { key: "company_name", value: "", isSecret: 0 },
      { key: "company_wa_cs", value: "", isSecret: 0 },
      { key: "company_wa_finance", value: "", isSecret: 0 },
      { key: "customer_portal_url", value: "", isSecret: 0 },
    ];
    const now = new Date().toISOString();
    let inserted = 0, skipped = 0;
    for (const d of defaults) {
      const result: any = await this.db.execute(sql`
        INSERT IGNORE INTO mitra_integrations (mitra_id, \`key\`, value, is_secret, updated_at)
        VALUES (${mitraId}, ${d.key}, ${d.value}, ${d.isSecret}, ${now})
      `);
      const affected = Number(result?.[0]?.affectedRows ?? 0);
      if (affected > 0) inserted++; else skipped++;
    }
    return { inserted, skipped };
  }

  /**
   * Backfill: untuk mitra existing yang dibuat sebelum seeding ada, ensure semua key defaults exist.
   * Dipanggil di startup migration.
   */
  async backfillMitraIntegrationDefaults(): Promise<{ scanned: number; seeded: number }> {
    const rows: any = ((await this.db.execute(sql`
      SELECT id FROM mitras WHERE is_active = 1 AND id <> 1
    `))[0] as any);
    let seeded = 0;
    for (const r of rows ?? []) {
      const mitraId = Number(r.id);
      const result = await this.seedMitraIntegrationDefaults(mitraId);
      if (result.inserted > 0) seeded++;
    }
    return { scanned: (rows ?? []).length, seeded };
  }

  /** Delete a per-tenant setting (revert to app_settings fallback). */
  async deleteMitraSetting(key: string): Promise<boolean> {
    const mitraId = getMitraId();
    const result: any = await this.db.execute(sql`
      DELETE FROM mitra_integrations WHERE mitra_id = ${mitraId} AND \`key\` = ${key}
    `);
    return Number(result?.[0]?.affectedRows ?? 0) > 0;
  }

  /** Teamspace v5.0 Fase 1 - tim internal + board tugas di atas engine pipelines.
   *  Konvensi codebase: CREATE TABLE IF NOT EXISTS + ADD COLUMN via information_schema
   *  check, semuanya additive & idempotent (aman re-run tiap startup). */
  private async runTeamspaceMigrations(): Promise<void> {
    const tables: Array<{ name: string; ddl: string }> = [
      {
        name: "teams",
        ddl: `CREATE TABLE IF NOT EXISTS teams (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mitra_id INT NOT NULL DEFAULT 1,
          parent_id INT NULL,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          icon VARCHAR(64),
          color VARCHAR(16) NOT NULL DEFAULT '#8B5CF6',
          type VARCHAR(16) NOT NULL DEFAULT 'TEAM',
          task_pipeline_id INT NULL,
          enabled_views TEXT,
          archived_at TEXT NULL,
          created_by INT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT,
          KEY idx_teams_mitra (mitra_id, name)
        )`,
      },
      {
        name: "team_members",
        ddl: `CREATE TABLE IF NOT EXISTS team_members (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mitra_id INT NOT NULL DEFAULT 1,
          team_id INT NOT NULL,
          user_id INT NOT NULL,
          role VARCHAR(16) NOT NULL DEFAULT 'member',
          last_read_chat_at TEXT NULL,
          joined_at TEXT NOT NULL,
          UNIQUE KEY uniq_team_member (team_id, user_id),
          KEY idx_team_members_user (mitra_id, user_id)
        )`,
      },
      {
        name: "pipeline_labels",
        ddl: `CREATE TABLE IF NOT EXISTS pipeline_labels (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mitra_id INT NOT NULL DEFAULT 1,
          pipeline_id INT NOT NULL,
          name VARCHAR(100) NOT NULL,
          color_hex VARCHAR(16) NOT NULL DEFAULT '#0EA5E9',
          position INT NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          KEY idx_pipeline_labels_pipeline (mitra_id, pipeline_id, position)
        )`,
      },
      {
        name: "card_labels",
        ddl: `CREATE TABLE IF NOT EXISTS card_labels (
          id INT AUTO_INCREMENT PRIMARY KEY,
          card_id INT NOT NULL,
          label_id INT NOT NULL,
          UNIQUE KEY uniq_card_label (card_id, label_id),
          KEY idx_card_labels_label (label_id)
        )`,
      },
      {
        name: "card_checklists",
        ddl: `CREATE TABLE IF NOT EXISTS card_checklists (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mitra_id INT NOT NULL DEFAULT 1,
          card_id INT NOT NULL,
          title VARCHAR(255) NOT NULL,
          position INT NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          KEY idx_card_checklists_card (card_id)
        )`,
      },
      {
        name: "card_checklist_items",
        ddl: `CREATE TABLE IF NOT EXISTS card_checklist_items (
          id INT AUTO_INCREMENT PRIMARY KEY,
          checklist_id INT NOT NULL,
          text VARCHAR(500) NOT NULL,
          is_checked INT NOT NULL DEFAULT 0,
          position INT NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          KEY idx_card_checklist_items_checklist (checklist_id)
        )`,
      },
      // -- Fase 2: Chat, Jadwal, Check-in, Dokumen & File --
      {
        name: "team_chat_messages",
        ddl: `CREATE TABLE IF NOT EXISTS team_chat_messages (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mitra_id INT NOT NULL DEFAULT 1,
          team_id INT NOT NULL,
          sender_id INT NOT NULL,
          body TEXT,
          attachment_path VARCHAR(255) NULL,
          attachment_name VARCHAR(255) NULL,
          attachment_mime VARCHAR(128) NULL,
          attachment_size INT NULL,
          reply_to_id INT NULL,
          created_at TEXT NOT NULL,
          edited_at TEXT NULL,
          deleted_at TEXT NULL,
          KEY idx_team_chat_team (mitra_id, team_id, id)
        )`,
      },
      {
        name: "team_events",
        ddl: `CREATE TABLE IF NOT EXISTS team_events (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mitra_id INT NOT NULL DEFAULT 1,
          team_id INT NOT NULL,
          title VARCHAR(255) NOT NULL,
          start_at VARCHAR(32) NOT NULL,
          end_at VARCHAR(32) NOT NULL,
          recurrence TEXT NULL,
          is_confidential INT NOT NULL DEFAULT 0,
          notes TEXT NULL,
          created_by INT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NULL,
          archived_at TEXT NULL,
          KEY idx_team_events_team_start (mitra_id, team_id, start_at)
        )`,
      },
      {
        name: "team_event_participants",
        ddl: `CREATE TABLE IF NOT EXISTS team_event_participants (
          id INT AUTO_INCREMENT PRIMARY KEY,
          event_id INT NOT NULL,
          user_id INT NOT NULL,
          UNIQUE KEY uniq_event_participant (event_id, user_id)
        )`,
      },
      {
        name: "checkin_questions",
        ddl: `CREATE TABLE IF NOT EXISTS checkin_questions (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mitra_id INT NOT NULL DEFAULT 1,
          team_id INT NOT NULL,
          question_text TEXT NOT NULL,
          send_days TEXT NOT NULL,
          send_time VARCHAR(5) NOT NULL,
          is_confidential INT NOT NULL DEFAULT 0,
          is_active INT NOT NULL DEFAULT 1,
          last_sent_date VARCHAR(10) NULL,
          created_by INT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NULL,
          KEY idx_checkin_questions_team (mitra_id, team_id)
        )`,
      },
      {
        name: "checkin_recipients",
        ddl: `CREATE TABLE IF NOT EXISTS checkin_recipients (
          id INT AUTO_INCREMENT PRIMARY KEY,
          question_id INT NOT NULL,
          user_id INT NOT NULL,
          UNIQUE KEY uniq_checkin_recipient (question_id, user_id)
        )`,
      },
      {
        name: "checkin_responses",
        ddl: `CREATE TABLE IF NOT EXISTS checkin_responses (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mitra_id INT NOT NULL DEFAULT 1,
          question_id INT NOT NULL,
          user_id INT NOT NULL,
          response_date VARCHAR(10) NOT NULL,
          response_text TEXT NOT NULL,
          submitted_at TEXT NOT NULL,
          UNIQUE KEY uniq_checkin_response (question_id, user_id, response_date),
          KEY idx_checkin_responses_qdate (question_id, response_date)
        )`,
      },
      {
        name: "team_folders",
        ddl: `CREATE TABLE IF NOT EXISTS team_folders (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mitra_id INT NOT NULL DEFAULT 1,
          team_id INT NOT NULL,
          parent_folder_id INT NULL,
          name VARCHAR(255) NOT NULL,
          created_by INT NOT NULL,
          created_at TEXT NOT NULL,
          KEY idx_team_folders_team (mitra_id, team_id, parent_folder_id)
        )`,
      },
      {
        name: "team_documents",
        ddl: `CREATE TABLE IF NOT EXISTS team_documents (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mitra_id INT NOT NULL DEFAULT 1,
          team_id INT NOT NULL,
          folder_id INT NULL,
          title VARCHAR(255) NOT NULL,
          content MEDIUMTEXT NULL,
          is_confidential INT NOT NULL DEFAULT 0,
          archived_at TEXT NULL,
          created_by INT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NULL,
          updated_by INT NULL,
          KEY idx_team_documents_team (mitra_id, team_id, folder_id)
        )`,
      },
      {
        name: "team_files",
        ddl: `CREATE TABLE IF NOT EXISTS team_files (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mitra_id INT NOT NULL DEFAULT 1,
          team_id INT NOT NULL,
          folder_id INT NULL,
          file_name VARCHAR(255) NOT NULL,
          file_path VARCHAR(255) NOT NULL,
          mime_type VARCHAR(128) NOT NULL,
          size_bytes INT NOT NULL DEFAULT 0,
          uploaded_by INT NOT NULL,
          archived_at TEXT NULL,
          created_at TEXT NOT NULL,
          KEY idx_team_files_team (mitra_id, team_id, folder_id)
        )`,
      },
      {
        name: "cheers",
        ddl: `CREATE TABLE IF NOT EXISTS cheers (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mitra_id INT NOT NULL DEFAULT 1,
          from_user_id INT NOT NULL,
          to_user_id INT NOT NULL,
          message VARCHAR(500) NOT NULL,
          card_id INT NULL,
          created_at TEXT NOT NULL,
          KEY idx_cheers_to (mitra_id, to_user_id, id),
          KEY idx_cheers_from (mitra_id, from_user_id)
        )`,
      },
      {
        name: "content_recipients",
        ddl: `CREATE TABLE IF NOT EXISTS content_recipients (
          id INT AUTO_INCREMENT PRIMARY KEY,
          owner_type VARCHAR(16) NOT NULL,
          owner_id INT NOT NULL,
          user_id INT NOT NULL,
          UNIQUE KEY uniq_content_recipient (owner_type, owner_id, user_id),
          KEY idx_content_recipients_user (user_id)
        )`,
      },
      {
        name: "hr_attendance",
        ddl: `CREATE TABLE IF NOT EXISTS hr_attendance (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mitra_id INT NOT NULL DEFAULT 1,
          user_id INT NOT NULL,
          date VARCHAR(10) NOT NULL,
          status VARCHAR(12) NOT NULL,
          check_in VARCHAR(5) NULL,
          check_out VARCHAR(5) NULL,
          note VARCHAR(255) NULL,
          created_by INT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NULL,
          UNIQUE KEY uq_hr_att_user_date (mitra_id, user_id, date),
          KEY idx_hr_att_date (mitra_id, date)
        )`,
      },
      {
        name: "hr_attendance_events",
        ddl: `CREATE TABLE IF NOT EXISTS hr_attendance_events (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mitra_id INT NOT NULL DEFAULT 1,
          user_id INT NOT NULL,
          date VARCHAR(10) NOT NULL,
          kind VARCHAR(8) NOT NULL,
          at TEXT NOT NULL,
          lat DOUBLE NULL, lng DOUBLE NULL,
          selfie_path VARCHAR(255) NULL,
          ip VARCHAR(45) NULL,
          within_radius INT NOT NULL DEFAULT 1,
          approval_status VARCHAR(10) NOT NULL DEFAULT 'approved',
          reviewed_by INT NULL,
          note VARCHAR(255) NULL,
          KEY idx_hr_ev_date (mitra_id, date),
          KEY idx_hr_ev_user (mitra_id, user_id, date)
        )`,
      },
      {
        name: "hr_office_locations",
        ddl: `CREATE TABLE IF NOT EXISTS hr_office_locations (
          id INT AUTO_INCREMENT PRIMARY KEY, mitra_id INT NOT NULL DEFAULT 1,
          name VARCHAR(128) NOT NULL, lat DOUBLE NOT NULL, lng DOUBLE NOT NULL,
          radius_m INT NOT NULL DEFAULT 150
        )`,
      },
      {
        name: "hr_shifts",
        ddl: `CREATE TABLE IF NOT EXISTS hr_shifts (
          id INT AUTO_INCREMENT PRIMARY KEY, mitra_id INT NOT NULL DEFAULT 1,
          name VARCHAR(64) NOT NULL, start_time VARCHAR(5) NOT NULL, end_time VARCHAR(5) NOT NULL,
          late_tolerance_min INT NOT NULL DEFAULT 10,
          work_days VARCHAR(32) NOT NULL DEFAULT '1,2,3,4,5'
        )`,
      },
      {
        name: "hr_schedule_assignments",
        ddl: `CREATE TABLE IF NOT EXISTS hr_schedule_assignments (
          id INT AUTO_INCREMENT PRIMARY KEY, mitra_id INT NOT NULL DEFAULT 1,
          user_id INT NOT NULL, shift_id INT NOT NULL,
          UNIQUE KEY uq_hr_sched_user (mitra_id, user_id)
        )`,
      },
      {
        name: "hr_holidays",
        ddl: `CREATE TABLE IF NOT EXISTS hr_holidays (
          id INT AUTO_INCREMENT PRIMARY KEY, mitra_id INT NOT NULL DEFAULT 1,
          date VARCHAR(10) NOT NULL, name VARCHAR(128) NOT NULL,
          UNIQUE KEY uq_hr_holiday (mitra_id, date)
        )`,
      },
      {
        name: "hr_employee_profiles",
        ddl: `CREATE TABLE IF NOT EXISTS hr_employee_profiles (
          id INT AUTO_INCREMENT PRIMARY KEY, mitra_id INT NOT NULL DEFAULT 1, user_id INT NOT NULL,
          birth_place VARCHAR(64) NULL, marital_status VARCHAR(16) NULL, blood_type VARCHAR(4) NULL,
          religion VARCHAR(24) NULL, nationality VARCHAR(8) NULL DEFAULT 'WNI',
          id_type VARCHAR(12) NULL DEFAULT 'KTP', id_number VARCHAR(32) NULL, kk_number VARCHAR(32) NULL,
          address_ktp VARCHAR(255) NULL, address_domisili VARCHAR(255) NULL,
          education_level VARCHAR(24) NULL, education_institution VARCHAR(128) NULL, education_major VARCHAR(96) NULL,
          org_unit_id INT NULL, position_id INT NULL, \`rank\` VARCHAR(48) NULL,
          employment_status VARCHAR(16) NULL DEFAULT 'tetap', supervisor_id INT NULL, resign_date VARCHAR(10) NULL,
          bank_name VARCHAR(48) NULL, bank_account VARCHAR(32) NULL, npwp VARCHAR(25) NULL,
          ptkp_status VARCHAR(8) NULL, bpjs_tk_number VARCHAR(24) NULL, bpjs_kes_number VARCHAR(24) NULL,
          updated_at TEXT NULL, updated_by INT NULL,
          UNIQUE KEY uq_hr_profile_user (mitra_id, user_id)
        )`,
      },
      {
        name: "hr_org_units",
        ddl: `CREATE TABLE IF NOT EXISTS hr_org_units (
          id INT AUTO_INCREMENT PRIMARY KEY, mitra_id INT NOT NULL DEFAULT 1,
          name VARCHAR(96) NOT NULL, parent_id INT NULL
        )`,
      },
      {
        name: "hr_positions",
        ddl: `CREATE TABLE IF NOT EXISTS hr_positions (
          id INT AUTO_INCREMENT PRIMARY KEY, mitra_id INT NOT NULL DEFAULT 1, name VARCHAR(96) NOT NULL
        )`,
      },
      {
        name: "hr_shift_roster",
        ddl: `CREATE TABLE IF NOT EXISTS hr_shift_roster (
          id INT AUTO_INCREMENT PRIMARY KEY, mitra_id INT NOT NULL DEFAULT 1,
          user_id INT NOT NULL, date VARCHAR(10) NOT NULL, shift_id INT NOT NULL,
          UNIQUE KEY uq_hr_roster (mitra_id, user_id, date)
        )`,
      },
      {
        name: "hr_overtime",
        ddl: `CREATE TABLE IF NOT EXISTS hr_overtime (
          id INT AUTO_INCREMENT PRIMARY KEY, mitra_id INT NOT NULL DEFAULT 1,
          user_id INT NOT NULL, date VARCHAR(10) NOT NULL, hours DOUBLE NOT NULL,
          reason VARCHAR(255) NULL, status VARCHAR(10) NOT NULL DEFAULT 'pending',
          reviewed_by INT NULL, created_at TEXT NOT NULL,
          KEY idx_hr_ot_user (mitra_id, user_id, date), KEY idx_hr_ot_status (mitra_id, status)
        )`,
      },
      {
        name: "hr_salary_components",
        ddl: `CREATE TABLE IF NOT EXISTS hr_salary_components (
          id INT AUTO_INCREMENT PRIMARY KEY, mitra_id INT NOT NULL DEFAULT 1, user_id INT NOT NULL,
          base_salary DOUBLE NOT NULL DEFAULT 0, fixed_allowance DOUBLE NOT NULL DEFAULT 0,
          fixed_deduction DOUBLE NOT NULL DEFAULT 0, working_days INT NOT NULL DEFAULT 22,
          enroll_bpjs_tk INT NOT NULL DEFAULT 1, enroll_bpjs_kes INT NOT NULL DEFAULT 1,
          updated_at TEXT NULL,
          UNIQUE KEY uq_hr_salary_user (mitra_id, user_id)
        )`,
      },
      {
        name: "hr_payslips",
        ddl: `CREATE TABLE IF NOT EXISTS hr_payslips (
          id INT AUTO_INCREMENT PRIMARY KEY, mitra_id INT NOT NULL DEFAULT 1,
          period VARCHAR(7) NOT NULL, user_id INT NOT NULL, detail TEXT NOT NULL,
          gross DOUBLE NOT NULL, total_allowance DOUBLE NOT NULL, total_deduction DOUBLE NOT NULL,
          take_home_pay DOUBLE NOT NULL, status VARCHAR(10) NOT NULL DEFAULT 'ready',
          generated_by INT NOT NULL, generated_at TEXT NOT NULL, paid_at TEXT NULL,
          UNIQUE KEY uq_hr_payslip (mitra_id, period, user_id)
        )`,
      },
      {
        name: "hr_cash_advances",
        ddl: `CREATE TABLE IF NOT EXISTS hr_cash_advances (
          id INT AUTO_INCREMENT PRIMARY KEY, mitra_id INT NOT NULL DEFAULT 1, user_id INT NOT NULL,
          amount DOUBLE NOT NULL, months INT NOT NULL DEFAULT 1, monthly_installment DOUBLE NOT NULL,
          remaining DOUBLE NOT NULL, reason VARCHAR(255) NULL,
          status VARCHAR(10) NOT NULL DEFAULT 'pending', reviewed_by INT NULL, created_at TEXT NOT NULL,
          KEY idx_hr_ca_user (mitra_id, user_id), KEY idx_hr_ca_status (mitra_id, status)
        )`,
      },
      {
        name: "hr_reimbursements",
        ddl: `CREATE TABLE IF NOT EXISTS hr_reimbursements (
          id INT AUTO_INCREMENT PRIMARY KEY, mitra_id INT NOT NULL DEFAULT 1, user_id INT NOT NULL,
          date VARCHAR(10) NOT NULL, category VARCHAR(48) NOT NULL, amount DOUBLE NOT NULL,
          note VARCHAR(255) NULL, status VARCHAR(10) NOT NULL DEFAULT 'pending',
          reviewed_by INT NULL, created_at TEXT NOT NULL,
          KEY idx_hr_rb_user (mitra_id, user_id), KEY idx_hr_rb_status (mitra_id, status)
        )`,
      },
      {
        name: "hr_location_pings",
        ddl: `CREATE TABLE IF NOT EXISTS hr_location_pings (
          id INT AUTO_INCREMENT PRIMARY KEY, mitra_id INT NOT NULL DEFAULT 1,
          user_id INT NOT NULL, at TEXT NOT NULL, lat DOUBLE NOT NULL, lng DOUBLE NOT NULL,
          accuracy DOUBLE NULL,
          KEY idx_hr_ping_user (mitra_id, user_id, id)
        )`,
      },
      {
        name: "hr_clients",
        ddl: `CREATE TABLE IF NOT EXISTS hr_clients (
          id INT AUTO_INCREMENT PRIMARY KEY, mitra_id INT NOT NULL DEFAULT 1,
          name VARCHAR(128) NOT NULL, phone VARCHAR(24) NULL,
          lat DOUBLE NOT NULL, lng DOUBLE NOT NULL, radius_m INT NOT NULL DEFAULT 100
        )`,
      },
      {
        name: "hr_client_visits",
        ddl: `CREATE TABLE IF NOT EXISTS hr_client_visits (
          id INT AUTO_INCREMENT PRIMARY KEY, mitra_id INT NOT NULL DEFAULT 1,
          client_id INT NOT NULL, user_id INT NOT NULL, at TEXT NOT NULL,
          lat DOUBLE NOT NULL, lng DOUBLE NOT NULL, within_radius INT NOT NULL DEFAULT 1,
          note VARCHAR(255) NULL,
          KEY idx_hr_visit_client (mitra_id, client_id), KEY idx_hr_visit_user (mitra_id, user_id)
        )`,
      },
      {
        name: "hr_kpi_forms",
        ddl: `CREATE TABLE IF NOT EXISTS hr_kpi_forms (
          id INT AUTO_INCREMENT PRIMARY KEY, mitra_id INT NOT NULL DEFAULT 1,
          name VARCHAR(128) NOT NULL, questions TEXT NOT NULL,
          status VARCHAR(10) NOT NULL DEFAULT 'active', created_at TEXT NOT NULL
        )`,
      },
      {
        name: "hr_kpi_assessments",
        ddl: `CREATE TABLE IF NOT EXISTS hr_kpi_assessments (
          id INT AUTO_INCREMENT PRIMARY KEY, mitra_id INT NOT NULL DEFAULT 1,
          form_id INT NOT NULL, user_id INT NOT NULL, assessor_id INT NOT NULL,
          period VARCHAR(7) NOT NULL, scores TEXT NOT NULL, total DOUBLE NOT NULL,
          created_at TEXT NOT NULL,
          KEY idx_hr_kpi_user (mitra_id, user_id, period)
        )`,
      },
      {
        name: "hr_petty_cash",
        ddl: `CREATE TABLE IF NOT EXISTS hr_petty_cash (
          id INT AUTO_INCREMENT PRIMARY KEY, mitra_id INT NOT NULL DEFAULT 1,
          holder_id INT NOT NULL, kind VARCHAR(8) NOT NULL, amount DOUBLE NOT NULL,
          note VARCHAR(255) NULL, created_by INT NOT NULL, created_at TEXT NOT NULL,
          KEY idx_hr_pc_holder (mitra_id, holder_id)
        )`,
      },
      {
        name: "hr_leaves",
        ddl: `CREATE TABLE IF NOT EXISTS hr_leaves (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mitra_id INT NOT NULL DEFAULT 1,
          user_id INT NOT NULL,
          start_date VARCHAR(10) NOT NULL,
          end_date VARCHAR(10) NOT NULL,
          type VARCHAR(16) NOT NULL,
          reason VARCHAR(500) NULL,
          status VARCHAR(10) NOT NULL DEFAULT 'pending',
          reviewed_by INT NULL,
          reviewed_at TEXT NULL,
          review_note VARCHAR(255) NULL,
          created_at TEXT NOT NULL,
          KEY idx_hr_leaves_user (mitra_id, user_id, id),
          KEY idx_hr_leaves_status (mitra_id, status)
        )`,
      },
    ];
    // v5.1.1: rule intake lead default - lead canvassing/marketing OTOMATIS jadi kartu
    // di pipeline leads tanpa perlu setup manual di menu Otomasi (idempotent: hanya
    // seed bila belum ada rule lead_created aktif sama sekali).
    try {
      const [pl]: any = await this.pool.execute(
        `SELECT id FROM pipelines WHERE mitra_id = 1 AND team_id IS NULL AND LOWER(name) LIKE '%lead%' ORDER BY id LIMIT 1`);
      const leadsPipelineId = (pl as any[])[0]?.id;
      if (leadsPipelineId) {
        const [cnt]: any = await this.pool.execute(
          `SELECT COUNT(*) AS c FROM pipeline_rules WHERE mitra_id = 1 AND trigger_type = 'lead_created' AND enabled = 1`);
        if (Number((cnt as any[])[0]?.c ?? 0) === 0) {
          const [st]: any = await this.pool.execute(
            `SELECT id FROM pipeline_stages WHERE mitra_id = 1 AND pipeline_id = ? ORDER BY position, id LIMIT 1`, [leadsPipelineId]);
          const stageId = (st as any[])[0]?.id ?? null;
          const cfg = JSON.stringify({ sources: [], entryStageId: stageId, titleSource: "name", fieldMap: [], onDuplicate: "update", dedupBy: "phone" });
          await this.pool.execute(
            `INSERT INTO pipeline_rules (mitra_id, pipeline_id, name, action_type, target_stage_id, enabled, created_by, created_at, trigger_type, trigger_config, recurrence)
             VALUES (1, ?, 'Auto: Lead baru (canvassing/marketing) → pipeline', 'create_card', ?, 1, 1, ?, 'lead_created', ?, 'always')`,
            [leadsPipelineId, stageId, new Date().toISOString(), cfg]);
          console.log(`[migration] Seeded default lead_created intake rule → pipeline ${leadsPipelineId}`);
        }
      }
    } catch (err: any) {
      console.warn(`[migration] seed lead intake rule: ${err.message}`);
    }

    // FR-HR-1003: seed pipeline Rekrutmen Kandidat (pakai engine pipeline existing)
    try {
      const [pl]: any = await this.pool.execute(
        `SELECT id FROM pipelines WHERE mitra_id = 1 AND LOWER(name) LIKE '%rekrut%' LIMIT 1`);
      if (!(pl as any[]).length) {
        const now = new Date().toISOString();
        const [ins]: any = await this.pool.execute(
          `INSERT INTO pipelines (mitra_id, name, description, created_by, created_at) VALUES (1, 'Rekrutmen Kandidat', 'Pipeline kandidat pelamar (PRD-HR FR-HR-1003) - pindahkan kartu antar tahapan', 1, ?)`, [now]);
        const pid = (ins as any).insertId;
        const stages: Array<[string, string]> = [["Lamaran Masuk", "#0EA5E9"], ["Screening", "#F59E0B"], ["Interview", "#8B5CF6"], ["Offer", "#10B981"], ["Diterima", "#22C55E"], ["Ditolak", "#94A3B8"]];
        for (let i = 0; i < stages.length; i++) {
          await this.pool.execute(
            `INSERT INTO pipeline_stages (mitra_id, pipeline_id, label, color, position, created_at) VALUES (1, ?, ?, ?, ?, ?)`,
            [pid, stages[i][0], stages[i][1], i, now]);
        }
        console.log(`[migration] Seeded pipeline Rekrutmen Kandidat (#${pid})`);
      }
    } catch (err: any) { console.warn(`[migration] seed rekrutmen: ${err.message}`); }

    // QA H2: guard efek uang slip (kasbon/reimburse) - dijalankan sekali seumur slip
    try { await this.pool.execute(`ALTER TABLE hr_payslips ADD COLUMN effects_applied INT NOT NULL DEFAULT 0`); }
    catch (err: any) { if (err.errno !== 1060 && err.errno !== 1146) console.warn(`[migration] hr_payslips.effects_applied: ${err.message}`); }

    // HR-1c: kolom approval berjenjang di hr_leaves (idempotent errno 1060)
    for (const ddl of [
      `ALTER TABLE hr_leaves ADD COLUMN stage VARCHAR(10) NOT NULL DEFAULT 'hr'`,
      `ALTER TABLE hr_leaves ADD COLUMN manager_reviewed_by INT NULL`,
    ]) {
      try { await this.pool.execute(ddl); } catch (err: any) { if (err.errno !== 1060) console.warn(`[migration] hr_leaves alter: ${err.message}`); }
    }

    // v5.1 SDM: penanda karyawan pada akun user (HRD cek username = karyawan/bukan)
    try {
      await this.pool.execute(`ALTER TABLE users ADD COLUMN is_employee INT NOT NULL DEFAULT 0`);
      console.log("[migration] Added users.is_employee");
    } catch (err: any) {
      if (err.errno !== 1060) console.warn(`[migration] users.is_employee: ${err.message}`);
    }

    for (const t of tables) {
      try {
        await this.pool.execute(t.ddl);
      } catch (e: any) {
        console.warn(`[migration] teamspace create ${t.name} skipped: ${e.message}`);
      }
    }

    // Kolom baru pada tabel eksisting - cek via information_schema (pola p4cColAdds).
    const colAdds: Array<{ table: string; column: string; ddl: string }> = [
      { table: "pipelines", column: "team_id", ddl: "INT NULL" },
      { table: "pipeline_stages", column: "semantic_type", ddl: "VARCHAR(16) NULL" },
      { table: "pipeline_stages", column: "move_permission", ddl: "TEXT NULL" },
      { table: "pipeline_cards", column: "is_completed", ddl: "INT NOT NULL DEFAULT 0" },
      { table: "pipeline_cards", column: "completed_at", ddl: "TEXT NULL" },
      { table: "pipeline_cards", column: "cover_path", ddl: "VARCHAR(255) NULL" },
      { table: "pipeline_cards", column: "is_private", ddl: "INT NOT NULL DEFAULT 0" },
      { table: "pipeline_cards", column: "archived_at", ddl: "TEXT NULL" },
      { table: "pipeline_cards", column: "recurrence_rule", ddl: "TEXT NULL" },
      // Fase 2
      { table: "announcements", column: "team_id", ddl: "INT NULL" },
      { table: "announcements", column: "is_confidential", ddl: "INT DEFAULT 0" },
      { table: "announcements", column: "expires_at", ddl: "TEXT NULL" },
      { table: "users", column: "calendar_feed_token", ddl: "VARCHAR(64) NULL" },
      // Fase 3 - tren KPI harian Teamspace (§14.4)
      { table: "kpi_snapshots", column: "teamspace_tasks_total", ddl: "INT DEFAULT 0" },
      { table: "kpi_snapshots", column: "teamspace_tasks_done", ddl: "INT DEFAULT 0" },
      { table: "kpi_snapshots", column: "teamspace_tasks_overdue", ddl: "INT DEFAULT 0" },
      { table: "kpi_snapshots", column: "teamspace_checkins_today", ddl: "INT DEFAULT 0" },
    ];
    for (const { table, column, ddl } of colAdds) {
      try {
        const [rows]: any = await this.pool.execute(
          `SELECT COUNT(*) AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
          [table, column],
        );
        if (Number((rows as any[])[0]?.c ?? 0) === 0) {
          await this.pool.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
          console.log(`[migration] Added ${table}.${column} ✓`);
        }
      } catch (e: any) {
        console.warn(`[migration] ${table}.${column} add failed: ${e.message}`);
      }
    }
  }

  async seedAdminIfNeeded(): Promise<void> {
    // Phase A: multi-tenant schema migration (idempotent). Must run before index migrations
    // because indexes may reference mitra_id column.
    await this.runMitraMigrations();

    // 0. Ensure performance-critical indexes exist (idempotent, safe on every boot).
    //    Called here (instead of server/index.ts) to keep startup wiring centralised.
    await this.runIndexMigrations();

    // 0b. Photo storage migration (idempotent): add photo_path columns, create odp_photos,
    //     provision upload dirs per active mitra.
    try {
      await this.runPhotoStorageMigrations();
    } catch (e: any) {
      console.warn(`[startup] runPhotoStorageMigrations failed: ${e.message}`);
    }

    // 0c. Loyalty edit/delete migration (v4.4.0, idempotent): adds deleted_at soft-delete
    //     columns on referrals/discounts/redemptions + freeze fields on customer_loyalty.
    try {
      await this.runLoyaltyEditMigrations();
    } catch (e: any) {
      console.warn(`[startup] runLoyaltyEditMigrations failed: ${e.message}`);
    }

    // 0d. Phase B+C - auth scoping migration (2026-05-27)
    // Explicit column check (some MySQL builds choke on ADD COLUMN IF NOT EXISTS).
    try {
      const [rows]: any = await this.pool.execute(
        `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_mitras' AND COLUMN_NAME = 'role_id'`
      );
      const exists = Number((rows as any[])[0]?.cnt ?? 0) > 0;
      if (!exists) {
        await this.pool.execute(`ALTER TABLE user_mitras ADD COLUMN role_id INT NULL`);
        console.log("[migration] Added column user_mitras.role_id ✓");
      } else {
        console.log("[migration] user_mitras.role_id column exists ✓");
      }
    } catch (e) {
      console.error("[migration] FAILED to ensure user_mitras.role_id column:", (e as Error).message);
    }

    // 1. Seed default system roles first
    await this.seedDefaultRolesIfNeeded();
    await this.seedRolePresetsIfNeeded();

    // v4.1.2: Grant new permissions (collections + billing_sync) ke role existing yang sudah punya customers:write
    await this.upgradePermissionsV412();

    // v4.1.3: Seed MPWA default templates
    await this.seedDefaultMpwaTemplates();

    // v4.3.x: Backfill mitra_integrations defaults untuk mitra non-JABNET existing
    // (idempotent - INSERT IGNORE). Mitra baru kena auto-seed via /api/mitras endpoint;
    // ini handle mitra yang dibuat sebelum seeding existed (e.g. ASAKA mitra 3).
    try {
      const bf = await this.backfillMitraIntegrationDefaults();
      if (bf.seeded > 0) {
        console.log(`[startup] backfilled mitra_integrations for ${bf.seeded}/${bf.scanned} mitras`);
      }
    } catch (e: any) {
      console.warn(`[startup] backfillMitraIntegrationDefaults failed: ${e.message}`);
    }

    // Collections v4.3.x: multi-assignee table + stage migration
    // - drop legacy stage 'promised' → fold ke 'contacted' (promise_date column tetap dipertahankan)
    // - CREATE TABLE collection_assignees + backfill dari collections.assigned_to
    try {
      await this.pool.execute(`
        CREATE TABLE IF NOT EXISTS collection_assignees (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mitra_id INT NOT NULL DEFAULT 1,
          collection_id INT NOT NULL,
          user_id INT NOT NULL,
          assigned_by INT,
          assigned_at TEXT NOT NULL,
          UNIQUE KEY uniq_coll_user (collection_id, user_id),
          KEY idx_coll_assignees_mitra (mitra_id),
          KEY idx_coll_assignees_user (user_id)
        )
      `);
      await this.pool.execute(`UPDATE collections SET stage = 'contacted' WHERE stage = 'promised'`);
      const [bfResult]: any = await this.pool.execute(`
        INSERT IGNORE INTO collection_assignees (mitra_id, collection_id, user_id, assigned_by, assigned_at)
        SELECT mitra_id, id, assigned_to, assigned_by, COALESCE(assigned_at, created_at, NOW())
        FROM collections
        WHERE assigned_to IS NOT NULL
      `);
      const inserted = Number(bfResult?.affectedRows ?? 0);
      if (inserted > 0) console.log(`[migration] Backfilled ${inserted} collection_assignees row(s) from collections.assigned_to`);
    } catch (e: any) {
      console.warn(`[migration] collection_assignees setup failed: ${e.message}`);
    }

    // Collections custom pipeline (per-mitra): tabel collection_stages + seed.
    try {
      await this.pool.execute(`
        CREATE TABLE IF NOT EXISTS collection_stages (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mitra_id INT NOT NULL DEFAULT 1,
          \`key\` VARCHAR(64) NOT NULL,
          label VARCHAR(255) NOT NULL,
          color VARCHAR(16) NOT NULL DEFAULT '#6B7280',
          position INT NOT NULL DEFAULT 0,
          role VARCHAR(16) NOT NULL DEFAULT 'none',
          created_at TEXT NOT NULL,
          updated_at TEXT,
          UNIQUE KEY uniq_stage_mitra_key (mitra_id, \`key\`),
          KEY idx_collection_stages_mitra (mitra_id)
        )
      `);
      // SOP churn→reaktivasi (v5.3): kolom owner_division / sla_days / next_stage_key.
      for (const [col, ddl] of [
        ["owner_division", "ADD COLUMN owner_division VARCHAR(32)"],
        ["sla_days", "ADD COLUMN sla_days INT"],
        ["next_stage_key", "ADD COLUMN next_stage_key VARCHAR(64)"],
      ] as const) {
        try { await this.pool.execute(`ALTER TABLE collection_stages ${ddl}`); }
        catch (e: any) { if (e?.errno !== 1060) console.warn(`[migration] collection_stages ${col}: ${e.message}`); }
      }
      // Seed mitra 1 (JABNET) dari template default, lalu backfill semua mitra lain (clone dari mitra 1).
      await this.seedCollectionStagesForMitra(1);
      const [mitraRows]: any = await this.pool.execute(`SELECT id FROM mitras WHERE id <> 1`);
      let seededMitras = 0;
      for (const m of (mitraRows as any[])) {
        const before = await withMitra(Number(m.id), () => this.getCollectionStages());
        if (before.length === 0) {
          await this.seedCollectionStagesForMitra(Number(m.id));
          seededMitras++;
        }
      }
      if (seededMitras > 0) console.log(`[migration] Seeded collection_stages for ${seededMitras} non-JABNET mitra(s)`);
      // Terapkan ladder SOP (owner/sla/next + 2 stage delegasi) idempotent ke SEMUA mitra -
      // aman untuk data lama: hanya menambah stage baru + set metadata key yang dikenal.
      await this.applyCollectionSopLadder(1);
      for (const m of (mitraRows as any[])) {
        try { await this.applyCollectionSopLadder(Number(m.id)); }
        catch (e: any) { console.warn(`[migration] SOP ladder mitra ${m.id}: ${e.message}`); }
      }
      // Bersihkan emoji + artefak mojibake ("Lunas ?") dari label stage - tampilan profesional.
      try {
        const [allStageRows]: any = await this.pool.execute(`SELECT id, label FROM collection_stages`);
        const stripEmoji = (s: string) => s
          .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2705}\u{274C}\u{FE0F}\u{20E3}]/gu, "")
          .replace(/\s*\?\s*$/g, "")   // buang "?" artefak emoji yang gagal simpan (utf8mb4)
          .replace(/\s{2,}/g, " ").trim();
        for (const r of (allStageRows as any[])) {
          const cleaned = stripEmoji(String(r.label ?? ""));
          if (cleaned && cleaned !== r.label) {
            await this.pool.execute(`UPDATE collection_stages SET label = ? WHERE id = ?`, [cleaned, r.id]);
          }
        }
      } catch (e: any) { console.warn(`[migration] clean stage labels: ${e.message}`); }
    } catch (e: any) {
      console.warn(`[migration] collection_stages setup failed: ${e.message}`);
    }

    // kpi_snapshots - lazy daily KPI history for finance/subscriber trends
    try {
      await this.db.execute(sql`
        CREATE TABLE IF NOT EXISTS kpi_snapshots (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mitra_id INT NOT NULL DEFAULT 1,
          snapshot_date VARCHAR(10) NOT NULL,
          active_count INT NOT NULL DEFAULT 0,
          isolir_count INT NOT NULL DEFAULT 0,
          total_count INT NOT NULL DEFAULT 0,
          mrr BIGINT NOT NULL DEFAULT 0,
          arpu INT NOT NULL DEFAULT 0,
          revenue_at_risk BIGINT NOT NULL DEFAULT 0,
          new_activations INT NOT NULL DEFAULT 0,
          collections_open INT NOT NULL DEFAULT 0,
          collections_closed_today INT NOT NULL DEFAULT 0,
          outstanding_amount BIGINT NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          UNIQUE KEY uniq_kpi_snapshot_mitra_date (mitra_id, snapshot_date)
        )
      `);
    } catch (e: any) {
      console.warn(`[migration] kpi_snapshots setup failed: ${e.message}`);
    }

    // Generic Pipelines Engine (Phase 1) - additive, tenant-scoped. Tables created here
    // (codebase convention: new tables via CREATE TABLE IF NOT EXISTS on startup, not db:push).
    try {
      await this.db.execute(sql`
        CREATE TABLE IF NOT EXISTS pipelines (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mitra_id INT NOT NULL DEFAULT 1,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          color VARCHAR(16) NOT NULL DEFAULT '#0EA5E9',
          icon VARCHAR(64),
          position INT NOT NULL DEFAULT 0,
          is_archived INT NOT NULL DEFAULT 0,
          created_by INT NOT NULL,
          updated_by INT,
          created_at TEXT NOT NULL,
          updated_at TEXT,
          KEY idx_pipelines_mitra (mitra_id, position)
        )
      `);
      await this.db.execute(sql`
        CREATE TABLE IF NOT EXISTS pipeline_stages (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mitra_id INT NOT NULL DEFAULT 1,
          pipeline_id INT NOT NULL,
          label VARCHAR(255) NOT NULL,
          color VARCHAR(16) NOT NULL DEFAULT '#6B7280',
          position INT NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT,
          KEY idx_pipeline_stages_mitra_pipeline (mitra_id, pipeline_id, position)
        )
      `);
      await this.db.execute(sql`
        CREATE TABLE IF NOT EXISTS pipeline_cards (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mitra_id INT NOT NULL DEFAULT 1,
          pipeline_id INT NOT NULL,
          stage_id INT NOT NULL,
          title VARCHAR(255) NOT NULL,
          description TEXT,
          assignee_id INT,
          priority VARCHAR(16) NOT NULL DEFAULT 'medium',
          due_date TEXT,
          tags TEXT,
          position INT NOT NULL DEFAULT 0,
          stage_entered_at TEXT,
          created_by INT NOT NULL,
          updated_by INT,
          created_at TEXT NOT NULL,
          updated_at TEXT,
          KEY idx_pipeline_cards_mitra_pipeline_stage (mitra_id, pipeline_id, stage_id, position)
        )
      `);
      await this.db.execute(sql`
        CREATE TABLE IF NOT EXISTS pipeline_card_comments (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mitra_id INT NOT NULL DEFAULT 1,
          card_id INT NOT NULL,
          author_id INT NOT NULL,
          body TEXT NOT NULL,
          created_at TEXT NOT NULL,
          KEY idx_pipeline_card_comments_card (card_id)
        )
      `);
      await this.db.execute(sql`
        CREATE TABLE IF NOT EXISTS pipeline_card_activity (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mitra_id INT NOT NULL DEFAULT 1,
          card_id INT NOT NULL,
          actor_id INT NOT NULL,
          type VARCHAR(32) NOT NULL,
          detail TEXT,
          created_at TEXT NOT NULL,
          KEY idx_pipeline_card_activity_card (card_id)
        )
      `);
      await this.db.execute(sql`
        CREATE TABLE IF NOT EXISTS pipeline_card_followers (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mitra_id INT NOT NULL DEFAULT 1,
          card_id INT NOT NULL,
          user_id INT NOT NULL,
          created_at TEXT NOT NULL,
          UNIQUE KEY uniq_followers_card_user (card_id, user_id)
        )
      `);
      await this.db.execute(sql`
        CREATE TABLE IF NOT EXISTS pipeline_card_attachments (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mitra_id INT NOT NULL DEFAULT 1,
          card_id INT NOT NULL,
          pipeline_id INT NOT NULL,
          file_name VARCHAR(255) NOT NULL,
          file_path VARCHAR(255) NOT NULL,
          mime_type VARCHAR(128) NOT NULL,
          size_bytes INT NOT NULL,
          kind VARCHAR(8) NOT NULL DEFAULT 'file',
          uploaded_by INT NOT NULL,
          created_at TEXT NOT NULL,
          KEY idx_card_attachments_mitra_card (mitra_id, card_id)
        )
      `);
      await this.db.execute(sql`
        CREATE TABLE IF NOT EXISTS pipeline_card_assignees (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mitra_id INT NOT NULL DEFAULT 1,
          card_id INT NOT NULL,
          user_id INT NOT NULL,
          created_at TEXT NOT NULL,
          UNIQUE KEY uniq_card_assignee (card_id, user_id),
          KEY idx_card_assignees_mitra_card (mitra_id, card_id)
        )
      `);
    } catch (e: any) {
      console.warn(`[migration] pipelines engine setup failed: ${e.message}`);
    }

    // Pipelines Phase 2 - custom fields (EAV). Additive, idempotent.
    try {
      await this.db.execute(sql`
        CREATE TABLE IF NOT EXISTS pipeline_fields (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mitra_id INT NOT NULL DEFAULT 1,
          pipeline_id INT NOT NULL,
          \`key\` VARCHAR(64) NOT NULL,
          label VARCHAR(255) NOT NULL,
          type VARCHAR(16) NOT NULL,
          options TEXT,
          required INT NOT NULL DEFAULT 0,
          show_on_card INT NOT NULL DEFAULT 0,
          position INT NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT,
          UNIQUE KEY uniq_pipeline_field_key (pipeline_id, \`key\`),
          KEY idx_pipeline_fields_mitra_pipeline (mitra_id, pipeline_id, position)
        )
      `);
      await this.db.execute(sql`
        CREATE TABLE IF NOT EXISTS pipeline_card_values (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mitra_id INT NOT NULL DEFAULT 1,
          card_id INT NOT NULL,
          field_id INT NOT NULL,
          value TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT,
          UNIQUE KEY uniq_card_field (card_id, field_id),
          KEY idx_pipeline_card_values_mitra_card (mitra_id, card_id)
        )
      `);
    } catch (e: any) {
      console.warn(`[migration] pipelines custom fields setup failed: ${e.message}`);
    }

    // Pipelines Phase 3 - pipeline-level RBAC. Additive, idempotent.
    // NOTE: this DB chokes on `ADD COLUMN IF NOT EXISTS` - use an explicit column check
    // (mirrors the user_mitras.role_id migration above). Keep column + table in SEPARATE
    // try/catch so a failure in one cannot skip the other.
    try {
      const [colRows]: any = await this.pool.execute(
        `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pipelines' AND COLUMN_NAME = 'restricted'`
      );
      if (Number((colRows as any[])[0]?.cnt ?? 0) === 0) {
        await this.pool.execute(`ALTER TABLE pipelines ADD COLUMN restricted INT NOT NULL DEFAULT 0`);
        console.log("[migration] Added column pipelines.restricted ✓");
      }
    } catch (e: any) {
      console.warn(`[migration] pipelines.restricted add failed: ${e.message}`);
    }
    try {
      await this.db.execute(sql`
        CREATE TABLE IF NOT EXISTS pipeline_access (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mitra_id INT NOT NULL DEFAULT 1,
          pipeline_id INT NOT NULL,
          role_id INT NOT NULL,
          level VARCHAR(8) NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT,
          UNIQUE KEY uniq_pipeline_access_role (pipeline_id, role_id),
          KEY idx_pipeline_access_mitra_pipeline (mitra_id, pipeline_id)
        )
      `);
    } catch (e: any) {
      console.warn(`[migration] pipeline_access setup failed: ${e.message}`);
    }
    // Pipelines Phase 4a - automation rules. Additive, idempotent.
    try {
      await this.db.execute(sql`
        CREATE TABLE IF NOT EXISTS pipeline_rules (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mitra_id INT NOT NULL DEFAULT 1,
          pipeline_id INT NOT NULL,
          name VARCHAR(255),
          trigger_stage_id INT,
          trigger_type VARCHAR(16) NOT NULL DEFAULT 'stage_enter',
          trigger_config TEXT NULL,
          action_type VARCHAR(16) NOT NULL DEFAULT 'create_card',
          target_pipeline_id INT,
          target_stage_id INT,
          title_template VARCHAR(255),
          copy_assignee INT NOT NULL DEFAULT 0,
          enabled INT NOT NULL DEFAULT 1,
          created_by INT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT,
          KEY idx_pipeline_rules_mitra_pipeline (mitra_id, pipeline_id)
        )
      `);
    } catch (e: any) { console.warn(`[migration] pipeline_rules setup failed: ${e.message}`); }
    try {
      await this.db.execute(sql`
        CREATE TABLE IF NOT EXISTS pipeline_rule_fires (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mitra_id INT NOT NULL DEFAULT 1,
          rule_id INT NOT NULL,
          source_card_id INT NOT NULL,
          fired_at TEXT NOT NULL,
          UNIQUE KEY uniq_rule_fire_card (rule_id, source_card_id),
          KEY idx_rule_fires_mitra_rule (mitra_id, rule_id)
        )
      `);
    } catch (e: any) { console.warn(`[migration] pipeline_rule_fires setup failed: ${e.message}`); }

    try {
      await this.db.execute(sql`
        CREATE TABLE IF NOT EXISTS collection_config (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mitra_id INT NOT NULL DEFAULT 1,
          pipeline_id INT NOT NULL,
          enabled INT NOT NULL DEFAULT 0,
          entry_threshold_days INT NOT NULL DEFAULT 7,
          entry_mode VARCHAR(24) NOT NULL DEFAULT 'create_if_not_exists',
          entry_stage_id INT,
          paid_stage_id INT,
          writeoff_threshold_days INT,
          writeoff_action VARCHAR(16) NOT NULL DEFAULT 'move_stage',
          writeoff_stage_id INT,
          writeoff_rule_id INT,
          created_at TEXT NOT NULL,
          updated_at TEXT,
          UNIQUE KEY uniq_collection_config_pipeline (pipeline_id)
        )
      `);
    } catch (e: any) { console.warn(`[migration] collection_config setup failed: ${e.message}`); }

    try {
      await this.db.execute(sql`
        CREATE TABLE IF NOT EXISTS collection_stage_map (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mitra_id INT NOT NULL DEFAULT 1,
          pipeline_id INT NOT NULL,
          min_overdue_days INT NOT NULL,
          max_overdue_days INT,
          stage_id INT NOT NULL,
          position INT NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          KEY idx_collection_stage_map_pipeline (mitra_id, pipeline_id, position)
        )
      `);
    } catch (e: any) { console.warn(`[migration] collection_stage_map setup failed: ${e.message}`); }

    try {
      await this.db.execute(sql`
        CREATE TABLE IF NOT EXISTS pipeline_metrics (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mitra_id INT NOT NULL DEFAULT 1,
          pipeline_id INT NOT NULL,
          name VARCHAR(255) NOT NULL,
          description VARCHAR(255),
          icon VARCHAR(48),
          color VARCHAR(16) NOT NULL DEFAULT 'primary',
          type VARCHAR(16) NOT NULL DEFAULT 'number',
          source VARCHAR(16) NOT NULL DEFAULT 'card_count',
          aggregation VARCHAR(16) NOT NULL DEFAULT 'count',
          field_id INT,
          stage_ids TEXT,
          conditions TEXT,
          prefix VARCHAR(16),
          suffix VARCHAR(16),
          decimals INT,
          time_field VARCHAR(24) NULL,
          time_preset VARCHAR(16) NULL,
          time_from TEXT NULL,
          time_to TEXT NULL,
          terms TEXT NULL,
          formula VARCHAR(255) NULL,
          position INT NOT NULL DEFAULT 0,
          visible INT NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT,
          KEY idx_pipeline_metrics_mitra_pipeline (mitra_id, pipeline_id, position)
        )
      `);
    } catch (e: any) { console.warn(`[migration] pipeline_metrics setup failed: ${e.message}`); }

    try {
      await this.db.execute(sql`
        CREATE TABLE IF NOT EXISTS pipeline_rule_field_maps (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mitra_id INT NOT NULL DEFAULT 1,
          rule_id INT NOT NULL,
          source_field_id INT NOT NULL,
          target_field_id INT NOT NULL,
          created_at TEXT NOT NULL,
          UNIQUE KEY uniq_rule_field_map_source (rule_id, source_field_id),
          KEY idx_rule_field_maps_mitra_rule (mitra_id, rule_id)
        )
      `);
    } catch (e: any) { console.warn(`[migration] pipeline_rule_field_maps setup failed: ${e.message}`); }

    // Pipelines Phase 4b-1 - within-card actions + conditions. Additive, idempotent.
    // This DB chokes on `ADD COLUMN IF NOT EXISTS` - explicit info_schema check per column.
    const pipelineRuleColAdds: Array<{ column: string; ddl: string }> = [
      { column: "action_config", ddl: "TEXT NULL" },
      { column: "conditions", ddl: "TEXT NULL" },
    ];
    for (const { column, ddl } of pipelineRuleColAdds) {
      try {
        const [rows]: any = await this.pool.execute(
          `SELECT COUNT(*) AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'pipeline_rules' AND column_name = ?`,
          [column],
        );
        if (Number((rows as any[])[0]?.c ?? 0) === 0) {
          await this.pool.execute(`ALTER TABLE pipeline_rules ADD COLUMN ${column} ${ddl}`);
          console.log(`[migration] Added pipeline_rules.${column} ✓`);
        }
      } catch (e: any) {
        console.warn(`[migration] pipeline_rules.${column} add failed: ${e.message}`);
      }
    }
    // Relax legacy create_card-only target columns so non-create_card rules need no placeholder.
    // Idempotent: MODIFY to NULL on an already-nullable column is a harmless no-op.
    try {
      await this.pool.execute(`ALTER TABLE pipeline_rules MODIFY target_pipeline_id INT NULL`);
      await this.pool.execute(`ALTER TABLE pipeline_rules MODIFY target_stage_id INT NULL`);
    } catch (e: any) {
      console.warn(`[migration] pipeline_rules relax target NOT NULL failed: ${e.message}`);
    }

    // Pipelines Phase 4c - time-based trigger columns. Additive, idempotent.
    const p4cColAdds: Array<{ table: string; column: string; ddl: string }> = [
      { table: "pipeline_rules", column: "trigger_type", ddl: "VARCHAR(16) NOT NULL DEFAULT 'stage_enter'" },
      { table: "pipeline_rules", column: "trigger_config", ddl: "TEXT NULL" },
      { table: "pipeline_cards", column: "stage_entered_at", ddl: "TEXT NULL" },
      { table: "pipeline_cards", column: "source_customer_id", ddl: "INT NULL" },
      { table: "pipeline_cards", column: "source_rule_id", ddl: "INT NULL" },
      { table: "pipeline_fields", column: "config", ddl: "TEXT NULL" },
      { table: "pipeline_stages", column: "description", ddl: "TEXT NULL" },
      { table: "pipeline_access", column: "capabilities", ddl: "TEXT NULL" },
      { table: "pipeline_access", column: "card_filter", ddl: "TEXT NULL" },
    ];
    for (const { table, column, ddl } of p4cColAdds) {
      try {
        const [rows]: any = await this.pool.execute(
          `SELECT COUNT(*) AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
          [table, column],
        );
        if (Number((rows as any[])[0]?.c ?? 0) === 0) {
          await this.pool.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
          console.log(`[migration] Added ${table}.${column} ✓`);
        }
      } catch (e: any) {
        console.warn(`[migration] ${table}.${column} add failed: ${e.message}`);
      }
    }
    // Leads→pipeline import - photo evidence on card comments. Additive, idempotent.
    try {
      const [rows]: any = await this.pool.execute(
        `SELECT COUNT(*) AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'pipeline_card_comments' AND column_name = 'photo_path'`,
      );
      if (Number((rows as any[])[0]?.c ?? 0) === 0) {
        await this.pool.execute(`ALTER TABLE pipeline_card_comments ADD COLUMN photo_path VARCHAR(255)`);
        console.log(`[migration] Added pipeline_card_comments.photo_path ✓`);
      }
    } catch (e: any) {
      console.warn(`[migration] pipeline_card_comments.photo_path add failed: ${e.message}`);
    }
    // Relax trigger_stage_id to nullable so time-based rules need no stage reference.
    try {
      await this.pool.execute(`ALTER TABLE pipeline_rules MODIFY trigger_stage_id INT NULL`);
    } catch (e: any) {
      console.warn(`[migration] pipeline_rules relax trigger_stage_id skipped: ${e.message}`);
    }
    // Backfill stage_entered_at for existing cards that predate this column.
    try {
      const [r]: any = await this.pool.execute(
        `UPDATE pipeline_cards SET stage_entered_at = created_at WHERE stage_entered_at IS NULL`,
      );
      const n = Number((r as any)?.affectedRows ?? 0);
      if (n > 0) console.log(`[migration] Backfilled stage_entered_at for ${n} cards ✓`);
    } catch (e: any) {
      console.warn(`[migration] backfill stage_entered_at skipped: ${e.message}`);
    }

    // Pipelines Phase 4d-1 - multi-action: pipeline_rule_actions table + backfill + field-map index swap.
    try {
      await this.pool.execute(`CREATE TABLE IF NOT EXISTS pipeline_rule_actions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        mitra_id INT NOT NULL DEFAULT 1,
        rule_id INT NOT NULL,
        position INT NOT NULL DEFAULT 0,
        action_type VARCHAR(16) NOT NULL,
        action_config TEXT NULL,
        target_pipeline_id INT NULL,
        target_stage_id INT NULL,
        title_template VARCHAR(255) NULL,
        copy_assignee INT NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        INDEX idx_rule_actions_mitra_rule (mitra_id, rule_id, position)
      )`);
    } catch (e: any) { console.warn(`[migrate] create pipeline_rule_actions skipped: ${e?.message}`); }

    try {
      const [cnt]: any = await this.pool.execute(
        `SELECT COUNT(*) AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
        ["pipeline_rule_field_maps", "action_id"],
      );
      if (Number((cnt as any[])[0]?.c ?? 0) === 0) {
        await this.pool.execute("ALTER TABLE pipeline_rule_field_maps ADD COLUMN action_id INT NULL");
        console.log("[migrate] added pipeline_rule_field_maps.action_id ✓");
      }
    } catch (e: any) { console.warn(`[migrate] field_maps.action_id skipped: ${e?.message}`); }

    // Backfill: one action per rule that has none yet; repoint its field-maps.
    try {
      const [rules]: any = await this.pool.execute(
        `SELECT r.id, r.mitra_id, r.action_type, r.action_config, r.target_pipeline_id, r.target_stage_id, r.title_template, r.copy_assignee
         FROM pipeline_rules r
         LEFT JOIN pipeline_rule_actions a ON a.rule_id = r.id
         WHERE a.id IS NULL`,
      );
      const now = new Date().toISOString();
      for (const r of rules as any[]) {
        const [res]: any = await this.pool.execute(
          `INSERT INTO pipeline_rule_actions (mitra_id, rule_id, position, action_type, action_config, target_pipeline_id, target_stage_id, title_template, copy_assignee, created_at)
           VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
          [r.mitra_id, r.id, r.action_type ?? "create_card", r.action_config ?? null, r.target_pipeline_id ?? null, r.target_stage_id ?? null, r.title_template ?? null, r.copy_assignee ?? 0, now],
        );
        const actionId = Number((res as any).insertId);
        await this.pool.execute(
          "UPDATE pipeline_rule_field_maps SET action_id = ? WHERE rule_id = ? AND action_id IS NULL",
          [actionId, r.id],
        );
      }
      if ((rules as any[]).length) console.log(`[migrate] backfilled ${(rules as any[]).length} rule(s) into pipeline_rule_actions ✓`);
    } catch (e: any) { console.warn(`[migrate] backfill rule actions skipped: ${e?.message}`); }

    // Swap field-map unique index from (rule_id, source_field_id) → (action_id, source_field_id).
    try { await this.pool.execute("ALTER TABLE pipeline_rule_field_maps DROP INDEX uniq_rule_field_map_source"); }
    catch (e: any) { /* already dropped / never existed */ }
    try { await this.pool.execute("ALTER TABLE pipeline_rule_field_maps ADD UNIQUE uniq_action_field_map_source (action_id, source_field_id)"); }
    catch (e: any) { /* already added */ }

    // Pipelines Phase 5 - card_relations (entity links). Additive, idempotent.
    try {
      await this.pool.execute(`
        CREATE TABLE IF NOT EXISTS card_relations (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mitra_id INT NOT NULL DEFAULT 1,
          card_id INT NOT NULL,
          entity_type VARCHAR(16) NOT NULL,
          entity_id INT NOT NULL,
          label VARCHAR(255),
          created_by INT,
          created_at TEXT NOT NULL,
          KEY idx_card_relations_mitra_card (mitra_id, card_id),
          UNIQUE KEY uniq_card_relation (card_id, entity_type, entity_id)
        )
      `);
    } catch (e: any) {
      console.warn(`[migration] card_relations create skipped: ${e.message}`);
    }

    // Pipeline Templates (Phase 5) - reusable pipeline structure snapshots. Additive, idempotent.
    try {
      await this.pool.execute(`
        CREATE TABLE IF NOT EXISTS pipeline_templates (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mitra_id INT NOT NULL DEFAULT 1,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          icon VARCHAR(64),
          color VARCHAR(16) NOT NULL DEFAULT '#0EA5E9',
          definition TEXT NOT NULL,
          is_builtin INT NOT NULL DEFAULT 0,
          created_by INT,
          created_at TEXT NOT NULL,
          KEY idx_pipeline_templates_mitra (mitra_id)
        )
      `);
      // Seed built-in templates for mitra 1 (JABNET) + all other mitras.
      await this.seedBuiltinTemplates(1);
      const [tplMitraRows]: any = await this.pool.execute(`SELECT id FROM mitras WHERE id <> 1`);
      for (const m of (tplMitraRows as any[])) {
        await this.seedBuiltinTemplates(Number(m.id));
      }
    } catch (e: any) {
      console.warn(`[migration] pipeline_templates create skipped: ${e.message}`);
    }

    // Teamspace v5.0 Fase 1 - teams + board tugas (additive, idempotent).
    await this.runTeamspaceMigrations();

    // 2. Seed default admin user
    const existing = await this.db.select().from(users).limit(1);
    if (existing.length === 0) {
      const defaultPw = process.env.ADMIN_DEFAULT_PASSWORD || "Admin@1234";
      const hashedPassword = bcrypt.hashSync(defaultPw, 12);
      // Resolve System-Admin role id for the initial admin user (platform owner, mitra 1)
      const adminRole = await this.getRoleByName("System-Admin", 1);
      const adminInsert: any = await this.db.insert(users).values({
        username: "admin",
        password: hashedPassword,
        name: "Administrator",
        role: "admin",
        roleId: adminRole?.id ?? null,
        isActive: 1,
        createdAt: new Date().toISOString(),
      });
      const adminId = Number(adminInsert?.[0]?.insertId ?? 0);
      if (adminId > 0) await this.addUserToMitra(adminId, 1, true);
      console.log("[JABNET FTTH] Admin user created - segera ganti password default!");
    } else {
      // 3. Backfill roleId - HATI-HATI multi-tenant: users.role_id adalah fallback GLOBAL
      //    (dipakai computeAuthFlags untuk hitung isSystemAdmin di mitra 1). JANGAN set
      //    System-Admin ke semua role='admin' - itu meng-escalate SETIAP admin mitra jadi
      //    platform owner (bypass semua tenant scoping). Batasi ke platform owner asli saja.
      const adminRole = await this.getRoleByName("System-Admin", 1);
      const readOnlyRole = await this.getRoleByName("Read Only", 1);
      if (adminRole) {
        await this.db
          .update(users)
          .set({ roleId: adminRole.id })
          .where(sql`role = 'admin' AND role_id IS NULL AND (username IN ('yoga','admin') OR name LIKE '%Mikhail Yazid Bustomi%' OR name LIKE '%Bah Yus%')`);
      }
      // Untuk JABNET (mitra 1) members non-admin yang belum ada roleId, set ke Read Only agar
      // tidak kosong. JANGAN sentuh user mitra lain - fallback global mereka harus tetap kosong
      // (permission diresolve dari membership role per-mitra, bukan dari role mitra 1).
      if (readOnlyRole) {
        await this.db
          .update(users)
          .set({ roleId: readOnlyRole.id })
          .where(sql`role_id IS NULL AND role != 'admin' AND id IN (SELECT user_id FROM user_mitras WHERE mitra_id = 1)`);
      }
    }
  }

  // ---- Roles ----
  private buildPermsAllLevel(level: PermissionLevel): string {
    const obj: Record<string, PermissionLevel> = {};
    for (const key of ALL_PERMISSION_KEYS) obj[key] = level;
    return JSON.stringify(obj);
  }

  private buildPermsForPreset(writeFeatures: string[], readFeatures: string[] = []): string {
    const obj: Record<string, PermissionLevel> = {};
    for (const k of ALL_PERMISSION_KEYS) {
      if (writeFeatures.includes(k)) obj[k] = "write";
      else if (readFeatures.includes(k)) obj[k] = "read";
      else obj[k] = "none";
    }
    return JSON.stringify(obj);
  }

  async seedDefaultRolesIfNeeded(): Promise<void> {
    // === Phase B+C migration (2026-05-27) - idempotent, safe to re-run every startup ===

    // 1. Rename Administrator → System-Admin (no-op if already renamed or if DB is empty)
    try {
      await this.db.execute(sql`UPDATE roles SET name = 'System-Admin' WHERE name = 'Administrator'`);
    } catch (e) {
      console.warn("[seed-roles] rename Administrator→System-Admin:", (e as Error).message);
    }

    // 2. Backfill user_mitras.role_id dari users.role_id (per-membership default)
    try {
      await this.db.execute(sql`
        UPDATE user_mitras SET role_id = (SELECT role_id FROM users WHERE users.id = user_mitras.user_id)
        WHERE role_id IS NULL
      `);
    } catch (e) {
      console.warn("[seed-roles] backfill user_mitras.role_id:", (e as Error).message);
    }

    // 3. Preserve 4 known platform owners as System-Admin at mitra=1
    // (runs after rename so sysAdminId resolves correctly - on fresh DB this block
    //  safely no-ops because users don't exist yet)
    try {
      const sysAdminResult: any = await this.db.execute(sql`SELECT id FROM roles WHERE name = 'System-Admin' LIMIT 1`);
      const sysAdminId = (sysAdminResult[0] as any[])[0]?.id;
      if (sysAdminId) {
        // a. Ensure users.role_id = System-Admin for 4 known platform owners
        await this.db.execute(sql`
          UPDATE users SET role_id = ${sysAdminId}
          WHERE username IN ('yoga', 'admin')
             OR name LIKE '%Mikhail Yazid Bustomi%'
             OR name LIKE '%Bah Yus%'
        `);
        // b. Ensure they are members of mitra=1
        await this.db.execute(sql`
          INSERT IGNORE INTO user_mitras (user_id, mitra_id, is_primary, role_id, created_at)
          SELECT u.id, 1, 1, ${sysAdminId}, NOW()
          FROM users u
          WHERE (u.username IN ('yoga', 'admin')
                 OR u.name LIKE '%Mikhail Yazid Bustomi%'
                 OR u.name LIKE '%Bah Yus%')
            AND NOT EXISTS (SELECT 1 FROM user_mitras um WHERE um.user_id = u.id AND um.mitra_id = 1)
        `);
        // c. Upgrade existing memberships at mitra=1 to System-Admin
        await this.db.execute(sql`
          UPDATE user_mitras SET role_id = ${sysAdminId}
          WHERE mitra_id = 1
            AND user_id IN (
              SELECT id FROM users
              WHERE username IN ('yoga', 'admin')
                 OR name LIKE '%Mikhail Yazid Bustomi%'
                 OR name LIKE '%Bah Yus%'
            )
        `);
      }
    } catch (e) {
      console.warn("[seed-roles] preserve platform owners:", (e as Error).message);
    }

    // === Seed default roles (idempotent per-role by unique name) ===
    // NOTE: "Administrator" renamed to "System-Admin" above. "Admin" is the new intra-tenant role.
    const now = new Date().toISOString();
    const defaults: InsertRole[] = [
      {
        name: "System-Admin",
        description: "Akses penuh cross-tenant. Platform owner saja. Tidak bisa dihapus/diedit.",
        isSystem: 1,
        canSeeAllData: 1,
        permissions: this.buildPermsAllLevel("write"),
        createdAt: now,
      },
      {
        name: "Admin",
        description: "Akses penuh di satu mitra (intra-tenant). Tidak bisa dihapus/diedit.",
        isSystem: 1,
        canSeeAllData: 0,
        permissions: this.buildPermsAllLevel("write"),
        createdAt: now,
      },
      {
        name: "Read Only",
        description: "Hanya bisa lihat data, tidak bisa edit. Untuk audit atau demo.",
        isSystem: 1,
        canSeeAllData: 0,
        permissions: this.buildPermsAllLevel("read"),
        createdAt: now,
      },
      {
        name: "Operator Teknis",
        description: "CRUD aset jaringan + work order",
        isSystem: 1,
        canSeeAllData: 0,
        permissions: this.buildPermsForPreset([
          "dashboard","map","pops","odcs","odps","poles","cables","otbs","bestrays","splitters",
          "cable_cores","core_connections","splitter_chain","power_budget","export_import","customers","tickets",
        ]),
        createdAt: now,
      },
      {
        name: "Marketing",
        description: "Canvassing & lead pipeline (data sendiri)",
        isSystem: 1,
        canSeeAllData: 0,
        permissions: this.buildPermsForPreset([
          "dashboard","map","marketing_dashboard","canvassing","leads","contacts","prospects","marketing_ads",
        ]),
        createdAt: now,
      },
      {
        name: "Marketing Supervisor",
        description: "Supervisi marketing: lihat & assign semua lead",
        isSystem: 1,
        canSeeAllData: 1,
        permissions: this.buildPermsForPreset([
          "dashboard","map","marketing_dashboard","canvassing","leads","contacts","prospects","marketing_ads",
        ]),
        createdAt: now,
      },
      {
        name: "Viewer",
        description: "Dashboard & peta saja (read-only)",
        isSystem: 1,
        canSeeAllData: 0,
        permissions: this.buildPermsForPreset([], ["dashboard","map"]),
        createdAt: now,
      },
    ];
    // Default roles milik JABNET (mitra 1). Stamp mitra_id=1 eksplisit + cek per-mitra.
    const seededNames: string[] = [];
    for (const r of defaults) {
      const existing = await this.getRoleByName(r.name, 1);
      if (!existing) {
        try {
          await this.db.insert(roles).values({ ...r, mitraId: 1 } as any);
          seededNames.push(r.name);
        } catch (_) { /* likely race with unique index - safe ignore */ }
      }
    }
    if (seededNames.length > 0) {
      console.log(`[JABNET FTTH] Default roles seeded: ${seededNames.join(", ")}`);
    }

    // 4. Downgrade System-Admin → Admin in non-mitra-1 memberships, and globally for non-platform owners
    // NOTE: runs AFTER seed loop so Admin role is guaranteed to exist
    try {
      const adminResult: any = await this.db.execute(sql`SELECT id FROM roles WHERE name = 'Admin' LIMIT 1`);
      const sysAdminResult2: any = await this.db.execute(sql`SELECT id FROM roles WHERE name = 'System-Admin' LIMIT 1`);
      const adminId = (adminResult[0] as any[])[0]?.id;
      const sysAdminId2 = (sysAdminResult2[0] as any[])[0]?.id;
      if (adminId && sysAdminId2) {
        // Downgrade per-membership: any System-Admin membership outside mitra=1
        await this.db.execute(sql`
          UPDATE user_mitras SET role_id = ${adminId}
          WHERE role_id = ${sysAdminId2} AND mitra_id != 1
        `);
        // Downgrade users.role_id globally for non-platform owners
        await this.db.execute(sql`
          UPDATE users SET role_id = ${adminId}
          WHERE role_id = ${sysAdminId2}
            AND username NOT IN ('yoga', 'admin')
            AND name NOT LIKE '%Mikhail Yazid Bustomi%'
            AND name NOT LIKE '%Bah Yus%'
        `);
      }
    } catch (e) {
      console.warn("[seed-roles] downgrade non-platform users:", (e as Error).message);
    }

    // 5. Post-migration verification log (runs after downgrade so state is final)
    try {
      const verifyResult: any = await this.db.execute(sql`
        SELECT u.username, u.name FROM users u
        JOIN user_mitras um ON um.user_id = u.id AND um.mitra_id = 1
        JOIN roles r ON r.id = um.role_id
        WHERE r.name = 'System-Admin'
      `);
      const rows = (verifyResult[0] as any[]) ?? [];
      if (rows.length > 0) {
        console.log(`[seed-roles] Platform owners (System-Admin di mitra=1): ${rows.length}`);
        for (const u of rows) console.log(`  - ${u.username} (${u.name})`);
      }
    } catch (e) {
      console.warn("[seed-roles] verification log:", (e as Error).message);
    }

    // 6. v4.3.x TENANT-ISOLATE ROLES - tiap mitra ≠ 1 wajib punya Admin role sendiri,
    //    dan semua membership-nya harus mereferensikan role milik mitra itu (bukan role mitra lain).
    //    Memperbaiki data lama: mitra dibuat sebelum role per-mitra → admin-nya pakai Admin global (mitra 1).
    try {
      const mitraRows: any = await this.db.execute(sql`SELECT id FROM mitras WHERE id != 1`);
      const otherMitras = ((mitraRows[0] as any[]) ?? []).map((m) => Number(m.id));
      for (const m of otherMitras) {
        const adminRole = await this.seedAdminRoleForMitra(m);
        // Repoint membership mitra m yang menunjuk role milik mitra LAIN → Admin mitra m.
        await this.db.execute(sql`
          UPDATE user_mitras
          SET role_id = ${adminRole.id}
          WHERE mitra_id = ${m}
            AND role_id IS NOT NULL
            AND role_id NOT IN (SELECT id FROM roles WHERE mitra_id = ${m})
        `);
      }
      if (otherMitras.length > 0) {
        console.log(`[seed-roles] tenant-isolated roles untuk ${otherMitras.length} mitra non-JABNET (Admin role + repoint membership)`);
        invalidatePermCacheAtMitra();
      }
    } catch (e) {
      console.warn("[seed-roles] per-mitra Admin backfill:", (e as Error).message);
    }
  }

  /**
   * v4.1.2 auto-upgrade: grant new permissions (collections, billing_sync) ke role
   * yang sudah punya customers:write. Jalankan satu kali per deploy.
   */
  async upgradePermissionsV412(): Promise<void> {
    try {
      const allRoles = await this.db.select().from(roles);
      let changedCount = 0;
      for (const r of allRoles) {
        let perms: Record<string, PermissionLevel>;
        try { perms = JSON.parse(r.permissions); } catch { continue; }
        let changed = false;

        // Auto-add semua ALL_PERMISSION_KEYS yang belum ada di role ini.
        // Default value tergantung tipe role:
        //  - Administrator → "write" (akses penuh ke fitur baru)
        //  - Read Only → "read"
        //  - Role custom yang punya customers write → "read" untuk safety
        //  - Lainnya → "none"
        const defaultLevel: PermissionLevel =
          r.name === "System-Admin" || r.name === "Admin" ? "write" :
          r.name === "Read Only" ? "read" :
          (perms.customers === "write" ? "read" : "none");

        for (const key of ALL_PERMISSION_KEYS) {
          if (perms[key] === undefined) {
            perms[key] = defaultLevel;
            changed = true;
          }
        }

        // System-Admin/Admin: paksa SEMUA permission jadi "write" - akses penuh selalu (idempotent).
        // Ini handle case dimana fitur baru ditambah dan admin role tidak otomatis di-upgrade.
        if (r.name === "System-Admin" || r.name === "Admin") {
          for (const key of ALL_PERMISSION_KEYS) {
            if (perms[key] !== "write") {
              perms[key] = "write";
              changed = true;
            }
          }
        }

        if (changed) {
          await this.db.update(roles)
            .set({ permissions: JSON.stringify(perms), updatedAt: new Date().toISOString() })
            .where(eq(roles.id, r.id));
          changedCount++;
        }
      }
      if (changedCount > 0) {
        console.log(`[JABNET] Auto-synced ${changedCount} role(s) dengan permission keys terbaru`);
      }
    } catch (e: any) {
      console.warn("[Permission auto-sync] skipped:", e.message);
    }
  }

  async getRoles(mitraId: number): Promise<Role[]> {
    // Tenant-scoped: hanya role milik mitra ini (isolasi per-mitra).
    return this.db.select().from(roles)
      .where(eq(roles.mitraId, mitraId))
      .orderBy(desc(roles.isSystem), roles.name);
  }

  async getRoleById(id: number): Promise<Role | undefined> {
    const [row] = await this.db.select().from(roles).where(eq(roles.id, id)).limit(1);
    return row;
  }

  async getRoleByName(name: string, mitraId: number): Promise<Role | undefined> {
    // Tenant-scoped: nama role unik per (mitra_id, name), bukan global.
    const [row] = await this.db.select().from(roles)
      .where(and(eq(roles.name, name), eq(roles.mitraId, mitraId)))
      .limit(1);
    return row;
  }

  /** Buat (atau ambil) role "Admin" terkunci untuk satu mitra. Idempotent.
   *  Setiap mitra wajib punya minimal 1 role: Admin (isSystem=1, full write, tidak bisa diedit/hapus mitra admin). */
  async seedAdminRoleForMitra(mitraId: number): Promise<Role> {
    const existing = await this.getRoleByName("Admin", mitraId);
    if (existing) return existing;
    const now = new Date().toISOString();
    const result = await this.db.insert(roles).values({
      mitraId,
      name: "Admin",
      description: "Akses penuh di satu mitra (intra-tenant). Role bawaan terkunci - tidak bisa diedit/dihapus oleh admin mitra.",
      isSystem: 1,
      canSeeAllData: 0,
      permissions: this.buildPermsAllLevel("write"),
      createdAt: now,
      updatedAt: now,
    } as any);
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(roles).where(eq(roles.id, insertId));
    return row!;
  }

  async createRole(data: InsertRole): Promise<Role> {
    const now = new Date().toISOString();
    const result = await this.db.insert(roles).values({
      ...data,
      createdAt: now,
      updatedAt: now,
    });
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(roles).where(eq(roles.id, insertId));
    return row!;
  }

  async updateRole(id: number, data: Partial<InsertRole>): Promise<Role | undefined> {
    const existing = await this.getRoleById(id);
    if (!existing) return undefined;
    if (existing.isSystem === 1) {
      // System role: hanya izinkan update description dan permissions (nama dikunci)
      const allowed: any = {};
      if (data.description !== undefined) allowed.description = data.description;
      if (data.permissions !== undefined) allowed.permissions = data.permissions;
      if (data.canSeeAllData !== undefined && existing.name !== "System-Admin" && existing.name !== "Admin") allowed.canSeeAllData = data.canSeeAllData;
      allowed.updatedAt = new Date().toISOString();
      await this.db.update(roles).set(allowed).where(eq(roles.id, id));
      invalidatePermCache();           // clear all - any user with this role affected
      invalidatePermCacheAtMitra();    // clear per-mitra cache too
      const [row] = await this.db.select().from(roles).where(eq(roles.id, id));
      return row;
    }
    await this.db.update(roles).set({
      ...data,
      updatedAt: new Date().toISOString(),
    }).where(eq(roles.id, id));
    invalidatePermCache();           // clear all - any user with this role affected
    invalidatePermCacheAtMitra();    // clear per-mitra cache too
    const [row] = await this.db.select().from(roles).where(eq(roles.id, id));
    return row;
  }

  async deleteRole(id: number): Promise<boolean> {
    const existing = await this.getRoleById(id);
    if (!existing) return false;
    if (existing.isSystem === 1) return false; // cannot delete system role (termasuk Admin terkunci)
    // Role ini tenant-scoped, jadi semua referensi (users.role_id + user_mitras.role_id)
    // pasti milik mitra yang sama. Set NULL supaya resolusi permission fall-through ke
    // membership/empty (admin mitra reassign user ke role lain). Tidak sentuh mitra lain.
    await this.db.update(users).set({ roleId: null }).where(eq(users.roleId, id));
    await this.db.execute(sql`UPDATE user_mitras SET role_id = NULL WHERE role_id = ${id}`);
    await this.db.delete(roles).where(eq(roles.id, id));
    invalidatePermCache();           // clear all - users that had this role are reassigned
    invalidatePermCacheAtMitra();    // clear per-mitra cache too
    return true;
  }

  async seedRolePresetsIfNeeded(): Promise<void> {
    await this.db.execute(sql`
      CREATE TABLE IF NOT EXISTS role_presets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        mitra_id INT NOT NULL DEFAULT 1,
        scope VARCHAR(8) NOT NULL DEFAULT 'tenant',
        name VARCHAR(255) NOT NULL,
        description VARCHAR(255),
        icon VARCHAR(48),
        color VARCHAR(16) NOT NULL DEFAULT 'primary',
        permissions TEXT NOT NULL,
        is_system INT NOT NULL DEFAULT 0,
        is_active INT NOT NULL DEFAULT 1,
        is_default INT NOT NULL DEFAULT 0,
        created_by INT,
        updated_by INT,
        created_at TEXT NOT NULL,
        updated_at TEXT,
        KEY idx_role_presets_scope_mitra (scope, mitra_id, is_active)
      )
    `);
    const meta: Record<string, { icon: string; color: string; isDefault: number }> = {
      admin:     { icon: "shield",    color: "primary", isDefault: 1 },
      operator:  { icon: "wrench",    color: "info",    isDefault: 0 },
      marketing: { icon: "megaphone", color: "violet",  isDefault: 0 },
      billing:   { icon: "wallet",    color: "success", isDefault: 0 },
      viewer:    { icon: "eye",       color: "neutral", isDefault: 0 },
    };
    const now = new Date().toISOString();
    for (const key of Object.keys(PERMISSION_PRESETS)) {
      const def = PERMISSION_PRESETS[key];
      const existingRows: any = ((await this.db.execute(sql`
        SELECT id FROM role_presets WHERE scope = 'global' AND name = ${def.label} LIMIT 1
      `))[0] as any);
      if ((existingRows as any[])?.length) continue;
      const m = meta[key] ?? { icon: "shield", color: "primary", isDefault: 0 };
      await this.db.insert(rolePresets).values({
        mitraId: 1, scope: "global", name: def.label, description: null,
        icon: m.icon, color: m.color,
        permissions: JSON.stringify(buildPermissionMatrixFromPreset(key as any)),
        isSystem: 1, isActive: 1, isDefault: m.isDefault, createdBy: null, createdAt: now,
      });
    }
  }

  async getApplicablePresets(mitraId: number): Promise<RolePreset[]> {
    const rows = await this.db.select().from(rolePresets).where(
      and(
        eq(rolePresets.isActive, 1),
        or(
          eq(rolePresets.scope, "global"),
          and(eq(rolePresets.scope, "tenant"), eq(rolePresets.mitraId, mitraId)),
        ),
      ),
    );
    return this.sortPresets(rows);
  }

  async getManageablePresets(opts: { mitraId: number; isSystemAdmin: boolean }): Promise<RolePreset[]> {
    const rows = opts.isSystemAdmin
      ? await this.db.select().from(rolePresets).where(
          or(eq(rolePresets.scope, "global"), and(eq(rolePresets.scope, "tenant"), eq(rolePresets.mitraId, 1))),
        )
      : await this.db.select().from(rolePresets).where(
          and(eq(rolePresets.scope, "tenant"), eq(rolePresets.mitraId, opts.mitraId)),
        );
    return this.sortPresets(rows);
  }

  private sortPresets(rows: RolePreset[]): RolePreset[] {
    return [...rows].sort((a, b) =>
      (a.scope === b.scope ? 0 : a.scope === "global" ? -1 : 1) ||
      (b.isDefault - a.isDefault) ||
      a.name.localeCompare(b.name),
    );
  }

  async getRolePresetById(id: number): Promise<RolePreset | undefined> {
    const [row] = await this.db.select().from(rolePresets).where(eq(rolePresets.id, id));
    return row;
  }

  async createRolePreset(data: InsertRolePreset): Promise<RolePreset> {
    const now = new Date().toISOString();
    const result = await this.db.insert(rolePresets).values({ ...data, createdAt: now, updatedAt: now });
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(rolePresets).where(eq(rolePresets.id, insertId));
    return row!;
  }

  async updateRolePreset(id: number, data: Partial<InsertRolePreset>): Promise<RolePreset | undefined> {
    const existing = await this.getRolePresetById(id);
    if (!existing) return undefined;
    await this.db.update(rolePresets).set({ ...data, updatedAt: new Date().toISOString() }).where(eq(rolePresets.id, id));
    const [row] = await this.db.select().from(rolePresets).where(eq(rolePresets.id, id));
    return row;
  }

  async deleteRolePreset(id: number): Promise<boolean> {
    const result: any = await this.db.execute(sql`DELETE FROM role_presets WHERE id = ${id}`);
    return Number(result?.[0]?.affectedRows ?? 0) > 0;
  }

  async setDefaultRolePreset(id: number): Promise<void> {
    const target = await this.getRolePresetById(id);
    if (!target) return;
    // Clear siblings + set target atomically (so a partial failure can't leave 0 defaults).
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      if (target.scope === "global") {
        await conn.execute(`UPDATE role_presets SET is_default = 0 WHERE scope = 'global'`);
      } else {
        await conn.execute(`UPDATE role_presets SET is_default = 0 WHERE scope = 'tenant' AND mitra_id = ?`, [target.mitraId]);
      }
      await conn.execute(`UPDATE role_presets SET is_default = 1 WHERE id = ?`, [id]);
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  // Helper: resolve effective permissions (role-based) for a user
  async getUserEffectivePermissions(userId: number): Promise<{ perms: Record<string, PermissionLevel>; canSeeAllData: boolean; roleName: string | null; isSystem: boolean }> {
    const cached = getCachedPerms(userId);
    if (cached) return cached;

    const [u] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!u) {
      // Don't cache empty (user might be created later); just return
      return { perms: {}, canSeeAllData: false, roleName: null, isSystem: false };
    }
    let result: { perms: Record<string, PermissionLevel>; canSeeAllData: boolean; roleName: string | null; isSystem: boolean };
    if (u.roleId) {
      const role = await this.getRoleById(u.roleId);
      if (role) {
        let parsed: Record<string, PermissionLevel> = {};
        try { parsed = JSON.parse(role.permissions); } catch { parsed = {}; }
        result = {
          perms: parsed,
          canSeeAllData: role.canSeeAllData === 1,
          roleName: role.name,
          isSystem: role.isSystem === 1,
        };
        setCachedPerms(userId, result);
        return result;
      }
    }
    // Backward compat: user belum punya roleId, fallback ke role text
    if (u.role === "admin") {
      const obj: Record<string, PermissionLevel> = {};
      for (const k of ALL_PERMISSION_KEYS) obj[k] = "write";
      result = { perms: obj, canSeeAllData: true, roleName: "admin (legacy)", isSystem: true };
      setCachedPerms(userId, result);
      return result;
    }
    result = { perms: {}, canSeeAllData: false, roleName: u.role ?? null, isSystem: false };
    setCachedPerms(userId, result);
    return result;
  }

  // Helper: resolve effective permissions for a user in the context of a specific mitra.
  // Resolution order:
  //   1. user_mitras.role_id for (userId, mitraId) - per-membership role
  //   2. users.role_id - global default role
  //   3. users.role text === "admin" - legacy fallback
  async getUserEffectivePermissionsAtMitra(
    userId: number,
    mitraId: number
  ): Promise<{ perms: Record<string, PermissionLevel>; canSeeAllData: boolean; roleName: string | null; isSystem: boolean; roleId: number | null }> {
    const cacheKey = `${userId}:${mitraId}`;
    const cached = getCachedPermsAtMitra(cacheKey);
    if (cached) return { ...cached, roleId: cached.roleId ?? null };

    const result = await this._resolvePermsAtMitra(userId, mitraId);

    // Enforce per-mitra feature toggles: strip disabled features' permissions.
    // JABNET (mitra 1) is the owner and is never gated.
    let featuresJson: string | null = null;
    if (mitraId !== 1) {
      try {
        const rows: any = ((await this.db.execute(
          sql`SELECT features FROM mitras WHERE id = ${mitraId} LIMIT 1`,
        ))[0] as any);
        featuresJson = rows?.[0]?.features ?? null;
      } catch { featuresJson = null; }
    }
    const gated = { ...result, perms: gatePermissionsByFeatures(result.perms, featuresJson, mitraId) };
    setCachedPermsAtMitra(cacheKey, gated);
    return gated;
  }

  private async _resolvePermsAtMitra(
    userId: number,
    mitraId: number
  ): Promise<{ perms: Record<string, PermissionLevel>; canSeeAllData: boolean; roleName: string | null; isSystem: boolean; roleId: number | null }> {
    // 1. Try per-membership role_id at this mitra
    let roleId: number | null = null;
    try {
      const rows: any = ((await this.db.execute(sql`
        SELECT role_id FROM user_mitras WHERE user_id = ${userId} AND mitra_id = ${mitraId} LIMIT 1
      `))[0] as unknown as any[]);
      roleId = (rows as any[])[0]?.role_id ?? null;
    } catch (err: any) {
      console.warn("[perm-cache] user_mitras role_id lookup failed:", err?.message);
    }

    // 2. Fallback to users.role_id (global default) when membership has no role_id
    if (!roleId) {
      const [u] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!u) {
        const empty = { perms: {} as Record<string, PermissionLevel>, canSeeAllData: false, roleName: null, isSystem: false, roleId: null };
        return empty;
      }
      roleId = u.roleId ?? null;

      if (roleId) {
        const role = await this.getRoleById(roleId);
        if (role) {
          let parsed: Record<string, PermissionLevel> = {};
          try { parsed = JSON.parse(role.permissions); } catch { parsed = {}; }
          const result = {
            perms: parsed,
            canSeeAllData: role.canSeeAllData === 1,
            roleName: role.name,
            isSystem: role.isSystem === 1,
            roleId,
          };
          return result;
        }
      }

      // 3. Legacy fallback: users.role text === "admin"
      if (u.role === "admin") {
        const obj: Record<string, PermissionLevel> = {};
        for (const k of ALL_PERMISSION_KEYS) obj[k] = "write";
        const result = { perms: obj, canSeeAllData: true, roleName: "admin (legacy)", isSystem: true, roleId: null };
        return result;
      }

      const result = { perms: {} as Record<string, PermissionLevel>, canSeeAllData: false, roleName: u.role ?? null, isSystem: false, roleId: null };
      return result;
    }

    // We have a per-membership role_id - resolve it
    const role = await this.getRoleById(roleId);
    if (role) {
      let parsed: Record<string, PermissionLevel> = {};
      try { parsed = JSON.parse(role.permissions); } catch { parsed = {}; }
      const result = {
        perms: parsed,
        canSeeAllData: role.canSeeAllData === 1,
        roleName: role.name,
        isSystem: role.isSystem === 1,
        roleId,
      };
      return result;
    }

    // role_id set but role row missing (orphan) - return empty
    const empty = { perms: {} as Record<string, PermissionLevel>, canSeeAllData: false, roleName: null, isSystem: false, roleId: null };
    return empty;
  }

  // ---- Audit Logs ----
  async createAuditLog(data: InsertAuditLog): Promise<void> {
    try {
      // Use getMitraIdOrNull() ?? 1 - boot/seed code paths run outside request context
      const mitraId = getMitraIdOrNull() ?? 1;
      await this.db.insert(auditLogs).values({ ...data, mitraId });
    } catch (err) {
      // Audit log must never crash hot paths
      console.error("[audit-log] insert failed:", err);
    }
  }
  async getAuditLogs(filter?: {
    limit?: number;
    userId?: number;
    action?: string;
    entityType?: string;
    since?: string; // ISO date
    excludeAutoSync?: boolean; // exclude worker-auto SYNC billing entries
  }): Promise<AuditLog[]> {
    const mitraId = getMitraId();
    const limit = filter?.limit ?? 200;
    const conds: any[] = [eq(auditLogs.mitraId, mitraId)];
    if (filter?.userId !== undefined) conds.push(eq(auditLogs.userId, filter.userId));
    if (filter?.action) conds.push(eq(auditLogs.action, filter.action));
    if (filter?.entityType) conds.push(eq(auditLogs.entityType, filter.entityType));
    if (filter?.since) conds.push(sql`${auditLogs.createdAt} >= ${filter.since}`);
    if (filter?.excludeAutoSync !== false) {
      // Default: exclude billing sync worker auto logs (noisy) + semua portal customer entries
      // (log internal fokus ke staff saja - portal pelanggan terpisah di audit_logs dengan username='(portal)')
      conds.push(sql`NOT (${auditLogs.action} = 'SYNC' AND ${auditLogs.entityType} = 'billing' AND ${auditLogs.username} LIKE '(worker%')`);
      conds.push(sql`${auditLogs.username} != '(portal)'`);
    }
    return this.db.select().from(auditLogs).where(and(...conds)).orderBy(desc(auditLogs.id)).limit(limit);
  }

  /** Cleanup one-shot: hapus semua billing-sync worker audit rows (noise) */
  async cleanupBillingSyncAuditLogs(): Promise<number> {
    const mitraId = getMitraId();
    const result: any = await this.db.execute(sql`
      DELETE FROM audit_logs
      WHERE mitra_id = ${mitraId} AND action = 'SYNC' AND entity_type = 'billing' AND username LIKE '(worker%'
    `);
    return Number(result?.[0]?.affectedRows ?? 0);
  }

  /** Aggregate activity stats untuk dashboard productivity */
  async getActivityStats(sinceDays: number = 7): Promise<{
    totalActions: number;
    totalLogins: number;
    activeUsers: number;
    topUsers: Array<{ userId: number; username: string; userName: string; actionCount: number; loginCount: number; lastSeen: string | null }>;
    topFeatures: Array<{ entityType: string; action: string; count: number }>;
    dailyActivity: Array<{ date: string; actions: number; logins: number; uniqueUsers: number }>;
  }> {
    const mitraId = getMitraId();
    const since = new Date(Date.now() - sinceDays * 86400_000).toISOString();

    const [totalActionsRow]: any[] = await this.db.select({ c: sql<number>`count(*)` })
      .from(auditLogs)
      .where(sql`${auditLogs.mitraId} = ${mitraId} AND ${auditLogs.createdAt} >= ${since}
        AND NOT (${auditLogs.action} = 'SYNC' AND ${auditLogs.entityType} = 'billing' AND ${auditLogs.username} LIKE '(worker%')
        AND ${auditLogs.username} != '(portal)'`);

    const [totalLoginsRow]: any[] = await this.db.select({ c: sql<number>`count(*)` })
      .from(auditLogs)
      .where(sql`${auditLogs.mitraId} = ${mitraId} AND ${auditLogs.createdAt} >= ${since} AND ${auditLogs.action} = 'LOGIN' AND ${auditLogs.username} != '(portal)'`);

    const [activeUsersRow]: any[] = await this.db.select({ c: sql<number>`count(DISTINCT ${auditLogs.userId})` })
      .from(auditLogs)
      .where(sql`${auditLogs.mitraId} = ${mitraId} AND ${auditLogs.createdAt} >= ${since} AND ${auditLogs.userId} IS NOT NULL AND ${auditLogs.username} != '(portal)'`);

    // Top users by action count (staff only - exclude worker + portal entries)
    // MAX() wraps non-aggregated cols supaya compatible dengan MySQL ONLY_FULL_GROUP_BY mode
    // (username/user_name selalu sama untuk user_id yang sama, jadi MAX() = ANY_VALUE() semantically)
    const topUsersRaw = ((await this.db.execute(sql`
      SELECT
        al.user_id AS userId,
        COALESCE(MAX(al.username), 'unknown') AS username,
        COALESCE(MAX(al.user_name), MAX(al.username), 'unknown') AS userName,
        COUNT(*) AS actionCount,
        SUM(CASE WHEN al.action = 'LOGIN' THEN 1 ELSE 0 END) AS loginCount,
        MAX(al.created_at) AS lastSeen
      FROM audit_logs al
      WHERE al.mitra_id = ${mitraId}
        AND al.created_at >= ${since}
        AND al.user_id IS NOT NULL
        AND al.username != '(portal)'
        AND NOT (al.action = 'SYNC' AND al.entity_type = 'billing' AND al.username LIKE '(worker%')
      GROUP BY al.user_id
      ORDER BY actionCount DESC
      LIMIT 10
    `))[0] as any);
    const topUsers = (topUsersRaw ?? []).map((r: any) => ({
      userId: Number(r.userId),
      username: String(r.username),
      userName: String(r.userName),
      actionCount: Number(r.actionCount),
      loginCount: Number(r.loginCount),
      lastSeen: r.lastSeen ? String(r.lastSeen) : null,
    }));

    // Top features (entity_type + action combos) - staff internal only
    const topFeaturesRaw = ((await this.db.execute(sql`
      SELECT entity_type AS entityType, action, COUNT(*) AS count
      FROM audit_logs
      WHERE mitra_id = ${mitraId}
        AND created_at >= ${since}
        AND username != '(portal)'
        AND NOT (action = 'SYNC' AND entity_type = 'billing' AND username LIKE '(worker%')
      GROUP BY entity_type, action
      ORDER BY count DESC
      LIMIT 15
    `))[0] as any);
    const topFeatures = (topFeaturesRaw ?? []).map((r: any) => ({
      entityType: String(r.entityType ?? "unknown"),
      action: String(r.action),
      count: Number(r.count),
    }));

    // Daily activity buckets - staff internal only
    const dailyRaw = ((await this.db.execute(sql`
      SELECT
        DATE(created_at) AS date,
        COUNT(*) AS actions,
        SUM(CASE WHEN action = 'LOGIN' THEN 1 ELSE 0 END) AS logins,
        COUNT(DISTINCT user_id) AS uniqueUsers
      FROM audit_logs
      WHERE mitra_id = ${mitraId}
        AND created_at >= ${since}
        AND username != '(portal)'
        AND NOT (action = 'SYNC' AND entity_type = 'billing' AND username LIKE '(worker%')
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `))[0] as any);
    const dailyActivity = (dailyRaw ?? []).map((r: any) => ({
      date: String(r.date),
      actions: Number(r.actions),
      logins: Number(r.logins),
      uniqueUsers: Number(r.uniqueUsers),
    }));

    return {
      totalActions: Number(totalActionsRow?.c ?? 0),
      totalLogins: Number(totalLoginsRow?.c ?? 0),
      activeUsers: Number(activeUsersRow?.c ?? 0),
      topUsers,
      topFeatures,
      dailyActivity,
    };
  }

  // ---- Dashboard ----
  async getDashboardStats(): Promise<DashboardStats> {
    // PERF B1: consolidate ~13 sequential queries into 4 parallel queries.
    // Single aggregate SQL via subselects + cable-by-type aggregate in parallel
    // with getOdps()/getCables() (which feed the realtime port/core calculations).
    const mitraId = getMitraId();
    const isoDate7DaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const aggregateSql = `
      SELECT
        (SELECT COUNT(*) FROM pops WHERE mitra_id = ?) AS pop_total,
        (SELECT COUNT(*) FROM odcs WHERE mitra_id = ?) AS odc_total,
        (SELECT COUNT(*) FROM odps WHERE mitra_id = ?) AS odp_total,
        (SELECT COUNT(*) FROM customers WHERE mitra_id = ?) AS customer_total,
        (SELECT COUNT(*) FROM customers WHERE mitra_id = ? AND status = 'active' AND (is_isolir = 0 OR is_isolir IS NULL)) AS customer_active,
        (SELECT COUNT(*) FROM customers WHERE mitra_id = ? AND is_isolir = 1) AS customer_isolir,
        (SELECT COUNT(*) FROM poles WHERE mitra_id = ?) AS pole_total,
        (SELECT COUNT(*) FROM cables WHERE mitra_id = ?) AS cable_total,
        (SELECT COUNT(*) FROM cable_cores WHERE mitra_id = ?) AS core_total,
        (SELECT COUNT(*) FROM cable_cores WHERE mitra_id = ? AND status IN ('used', 'reserved')) AS core_used,
        (SELECT COUNT(*) FROM customers WHERE mitra_id = ? AND status = 'active' AND install_date >= ?) AS recent_active_7d
    `;

    const [aggregateResult, cableByType, allOdps, allCables] = await Promise.all([
      this.pool.execute(aggregateSql, [mitraId, mitraId, mitraId, mitraId, mitraId, mitraId, mitraId, mitraId, mitraId, mitraId, mitraId, isoDate7DaysAgo]),
      this.db.select({
        cableType: cables.cableType,
        totalMeters: sql<number>`COALESCE(SUM(length_meters), 0)`,
      }).from(cables).where(eq(cables.mitraId, mitraId)).groupBy(cables.cableType),
      this.getOdps(),    // compute usedCapacity realtime dari customer.odp_id
      this.getCables(),
    ]);

    const agg = (aggregateResult[0] as any[])[0] ?? {};

    const metersMap: Record<string, number> = {};
    for (const row of cableByType) {
      if (row.cableType) metersMap[row.cableType] = Number(row.totalMeters) || 0;
    }
    const cableMeters = {
      feeder: metersMap["feeder"] ?? 0,
      distribution: metersMap["distribution"] ?? 0,
      drop: metersMap["drop"] ?? 0,
      total: Object.values(metersMap).reduce((s, v) => s + v, 0),
    };

    // --- Capacity Planner & Port Usage (dihitung REALTIME dari ODP + customer count) ---
    // BUG FIX v4.1.7: dulu pakai pops.total_ports / pops.used_ports yang tidak pernah update.
    // Sekarang aggregate dari semua ODP active: total = SUM(capacity), used = SUM(actual customer count).
    let portTersediaTotal = 0;
    let odpKritisCount = 0;
    let totalPortCapacity = 0;
    let totalPortUsed = 0;
    for (const odp of allOdps) {
      if (odp.status === 'active') {
        const capacity = odp.capacity ?? 0;
        const used = odp.usedCapacity ?? 0;
        totalPortCapacity += capacity;
        // Clamp used ke capacity supaya tidak over-count kalau ada over-allocation
        totalPortUsed += Math.min(used, capacity);
        const remaining = capacity - used;
        if (remaining > 0) portTersediaTotal += remaining;

        const util = capacity > 0 ? used / capacity : 0;
        if (util >= 0.8) odpKritisCount++;
      }
    }
    const portUsage = { total: totalPortCapacity, used: totalPortUsed };

    // Core feeder - hitung realtime dari cable_cores.status (bukan cables.usedCore yang stale)
    const feederCableIds = allCables.filter(c => c.cableType === 'feeder').map(c => c.id);
    let coreFeederSisa = 0;
    if (feederCableIds.length > 0) {
      const [feederStats] = await this.db.select({
        total: sql<number>`COUNT(*)`,
        used: sql<number>`SUM(CASE WHEN status IN ('used', 'reserved') THEN 1 ELSE 0 END)`,
      }).from(cableCores).where(sql`${cableCores.cableId} IN (${sql.join(feederCableIds.map(id => sql`${id}`), sql`, `)})`);
      const total = Number(feederStats?.total ?? 0);
      const used = Number(feederStats?.used ?? 0);
      coreFeederSisa = Math.max(0, total - used);
    }

    // 7 days ago growth calculation - pakai aggregate dari consolidated SQL
    const recentActive7d = Number(agg.recent_active_7d ?? 0);
    let rataPertumbuhanHarian = recentActive7d / 7;

    let hariHinggaPenuh = 9999;
    if (rataPertumbuhanHarian > 0) {
      hariHinggaPenuh = Math.ceil(portTersediaTotal / rataPertumbuhanHarian);
    }

    return {
      totalPops: Number(agg.pop_total ?? 0),
      totalOdcs: Number(agg.odc_total ?? 0),
      totalOdps: Number(agg.odp_total ?? 0),
      totalCustomers: Number(agg.customer_total ?? 0),
      activeCustomers: Number(agg.customer_active ?? 0),
      isolirCustomers: Number(agg.customer_isolir ?? 0),
      totalPoles: Number(agg.pole_total ?? 0),
      totalCables: Number(agg.cable_total ?? 0),
      cableMeters,
      totalCoreUsage: { total: Number(agg.core_total ?? 0), used: Number(agg.core_used ?? 0) },
      totalPortUsage: { total: portUsage.total, used: portUsage.used },

      portTersediaTotal,
      odpKritisCount,
      coreFeederSisa,
      rataPertumbuhanHarian: Math.round(rataPertumbuhanHarian * 10) / 10,
      hariHinggaPenuh
    };
  }

  // ==================== MARKETING CRM ====================

  // -- Scrape Cache --
  async getScrapeCacheForOdp(odpId: number): Promise<{ radiusMeters: number; scrapedAt: string }[]> {
    const mitraId = getMitraId();
    return this.db.select({ radiusMeters: odpScrapeCache.radiusMeters, scrapedAt: odpScrapeCache.scrapedAt })
      .from(odpScrapeCache).where(and(eq(odpScrapeCache.odpId, odpId), eq(odpScrapeCache.mitraId, mitraId)));
  }
  async createScrapeCache(data: { odpId: number; radiusMeters: number; scrapedBy: number; placeCount: number }) {
    const mitraId = getMitraId();
    const now = new Date().toISOString();
    const result = await this.db.insert(odpScrapeCache).values({ ...data, mitraId, scrapedAt: now });
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(odpScrapeCache).where(eq(odpScrapeCache.id, insertId));
    return row!;
  }
  async getMaxScrapedRadius(odpId: number): Promise<number> {
    const mitraId = getMitraId();
    const rows = await this.db.select({ r: odpScrapeCache.radiusMeters }).from(odpScrapeCache).where(and(eq(odpScrapeCache.odpId, odpId), eq(odpScrapeCache.mitraId, mitraId)));
    return rows.length ? Math.max(...rows.map(r => r.r)) : 0;
  }

  // -- Prospects --
  async getProspectsByOdp(odpId: number): Promise<Prospect[]> {
    const mitraId = getMitraId();
    return this.db.select().from(prospects).where(and(eq(prospects.odpId, odpId), eq(prospects.mitraId, mitraId)));
  }
  async getProspectByPlaceId(placeId: string): Promise<Prospect | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(prospects).where(and(eq(prospects.placeId, placeId), eq(prospects.mitraId, mitraId)));
    return row;
  }
  async upsertProspect(data: InsertProspect): Promise<Prospect> {
    const mitraId = getMitraId();
    const existing = await this.getProspectByPlaceId(data.placeId);
    if (existing) return existing;
    const result = await this.db.insert(prospects).values({ ...data, mitraId });
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(prospects).where(eq(prospects.id, insertId));
    return row!;
  }
  async deleteProspectsByOdp(odpId: number): Promise<void> {
    const mitraId = getMitraId();
    await this.db.delete(prospects).where(and(eq(prospects.odpId, odpId), eq(prospects.mitraId, mitraId)));
    await this.db.delete(odpScrapeCache).where(and(eq(odpScrapeCache.odpId, odpId), eq(odpScrapeCache.mitraId, mitraId)));
  }

  // -- Canvassing Sessions --
  async getCanvassingSessions(userId?: number): Promise<CanvassingSession[]> {
    const mitraId = getMitraId();
    if (userId) return this.db.select().from(canvassingSessions).where(and(eq(canvassingSessions.userId, userId), eq(canvassingSessions.mitraId, mitraId))).orderBy(desc(canvassingSessions.startedAt));
    return this.db.select().from(canvassingSessions).where(eq(canvassingSessions.mitraId, mitraId)).orderBy(desc(canvassingSessions.startedAt));
  }
  async getActiveCanvassingSession(userId: number): Promise<CanvassingSession | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(canvassingSessions)
      .where(and(eq(canvassingSessions.userId, userId), eq(canvassingSessions.status, "active"), eq(canvassingSessions.mitraId, mitraId)));
    return row;
  }
  async createCanvassingSession(data: InsertCanvassingSession): Promise<CanvassingSession> {
    const mitraId = getMitraId();
    const result = await this.db.insert(canvassingSessions).values({ ...data, mitraId });
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(canvassingSessions).where(eq(canvassingSessions.id, insertId));
    return row!;
  }
  async updateCanvassingSession(id: number, data: Partial<CanvassingSession>): Promise<CanvassingSession> {
    const mitraId = getMitraId();
    await this.db.update(canvassingSessions).set(data).where(and(eq(canvassingSessions.id, id), eq(canvassingSessions.mitraId, mitraId)));
    const [row] = await this.db.select().from(canvassingSessions).where(eq(canvassingSessions.id, id));
    return row!;
  }
  async endCanvassingSession(id: number): Promise<CanvassingSession> {
    const mitraId = getMitraId();
    await this.db.update(canvassingSessions)
      .set({ status: "completed", endedAt: new Date().toISOString() })
      .where(and(eq(canvassingSessions.id, id), eq(canvassingSessions.mitraId, mitraId)));
    const [row] = await this.db.select().from(canvassingSessions).where(eq(canvassingSessions.id, id));
    return row!;
  }

  // -- Canvassing Logs --
  async getCanvassingLogs(sessionId?: number): Promise<CanvassingLog[]> {
    const mitraId = getMitraId();
    if (sessionId) return this.db.select().from(canvassingLogs).where(and(eq(canvassingLogs.sessionId, sessionId), eq(canvassingLogs.mitraId, mitraId))).orderBy(desc(canvassingLogs.createdAt));
    return this.db.select().from(canvassingLogs).where(eq(canvassingLogs.mitraId, mitraId)).orderBy(desc(canvassingLogs.createdAt));
  }
  async getCanvassingLogsByUser(userId: number): Promise<CanvassingLog[]> {
    const mitraId = getMitraId();
    return this.db.select().from(canvassingLogs).where(and(eq(canvassingLogs.userId, userId), eq(canvassingLogs.mitraId, mitraId))).orderBy(desc(canvassingLogs.createdAt));
  }
  async createCanvassingLog(data: InsertCanvassingLog): Promise<CanvassingLog> {
    const mitraId = getMitraId();
    // Decode + tulis foto ke filesystem dulu kalau ada photoData (base64)
    let photoPath: string | null = (data as any).photoPath ?? null;
    const photoDataRaw = (data as any).photoData;
    if (photoDataRaw && typeof photoDataRaw === "string" && !photoPath) {
      const slug = await this.getMitraSlug(mitraId);
      const idHint = `cnv-${Date.now()}`;
      photoPath = await saveBase64Photo(slug, "canvassing", idHint, photoDataRaw);
    }
    // Strip photoData biar tidak masuk ke DB lagi (legacy column kosong setelah migrasi)
    const insertData: any = { ...data, mitraId, photoPath, photoData: null };
    const result = await this.db.insert(canvassingLogs).values(insertData);
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(canvassingLogs).where(eq(canvassingLogs.id, insertId));
    return row!;
  }
  async deleteCanvassingSession(id: number): Promise<void> {
    const mitraId = getMitraId();
    // Hapus file foto dari semua log dalam sesi sebelum DELETE row
    const logs = await this.db.select({ photoPath: canvassingLogs.photoPath })
      .from(canvassingLogs)
      .where(and(eq(canvassingLogs.sessionId, id), eq(canvassingLogs.mitraId, mitraId)));
    for (const l of logs) {
      if (l.photoPath) await deletePhoto(l.photoPath);
    }
    await this.db.delete(canvassingLogs).where(and(eq(canvassingLogs.sessionId, id), eq(canvassingLogs.mitraId, mitraId)));
    await this.db.delete(canvassingSessions).where(and(eq(canvassingSessions.id, id), eq(canvassingSessions.mitraId, mitraId)));
  }
  async deleteCanvassingLog(id: number): Promise<void> {
    const mitraId = getMitraId();
    const [row] = await this.db.select({ photoPath: canvassingLogs.photoPath })
      .from(canvassingLogs)
      .where(and(eq(canvassingLogs.id, id), eq(canvassingLogs.mitraId, mitraId)));
    if (row?.photoPath) await deletePhoto(row.photoPath);
    await this.db.delete(canvassingLogs).where(and(eq(canvassingLogs.id, id), eq(canvassingLogs.mitraId, mitraId)));
  }

  /**
   * Enriched canvassing logs untuk dashboard Laporan Lapangan.
   * Include userName + odpName via JOIN. Support filter: tipe, severity, userId, date range, search keyword.
   * hasPhoto filter: true = hanya yang ada foto, false = tanpa foto, undefined = semua.
   */
  async getCanvassingReportsEnriched(filter?: {
    limit?: number;
    offset?: number;
    userId?: number;
    type?: string;
    severity?: string;
    hasPhoto?: boolean;
    since?: string; // ISO date
    until?: string;
    search?: string;
  }): Promise<Array<any>> {
    const mitraId = getMitraId();
    const limit = filter?.limit ?? 100;
    const offset = filter?.offset ?? 0;
    // Build WHERE clause dengan raw SQL yang refer ke alias `cl` (biar match SELECT)
    const whereParts: any[] = [sql`cl.mitra_id = ${mitraId}`];
    if (filter?.userId !== undefined) whereParts.push(sql`cl.user_id = ${filter.userId}`);
    if (filter?.type) whereParts.push(sql`cl.type = ${filter.type}`);
    if (filter?.severity) whereParts.push(sql`cl.severity = ${filter.severity}`);
    if (filter?.since) whereParts.push(sql`cl.created_at >= ${filter.since}`);
    if (filter?.until) whereParts.push(sql`cl.created_at <= ${filter.until}`);
    if (filter?.hasPhoto === true) whereParts.push(sql`(cl.photo_path IS NOT NULL AND cl.photo_path != '') OR (cl.photo_data IS NOT NULL AND cl.photo_data != '')`);
    if (filter?.hasPhoto === false) whereParts.push(sql`(cl.photo_path IS NULL OR cl.photo_path = '') AND (cl.photo_data IS NULL OR cl.photo_data = '')`);
    if (filter?.search) {
      const q = `%${filter.search.toLowerCase()}%`;
      whereParts.push(sql`(LOWER(cl.title) LIKE ${q} OR LOWER(COALESCE(cl.description, '')) LIKE ${q})`);
    }
    const whereClause = sql`WHERE ${sql.join(whereParts, sql` AND `)}`;

    const rows: any = ((await this.db.execute(sql`
      SELECT
        cl.id, cl.session_id AS sessionId, cl.user_id AS userId,
        cl.type, cl.title, cl.description,
        cl.lat, cl.lng, cl.odp_id AS odpId, cl.severity,
        cl.created_at AS createdAt,
        ((cl.photo_path IS NOT NULL AND cl.photo_path != '') OR (cl.photo_data IS NOT NULL AND cl.photo_data != '')) AS hasPhoto,
        u.name AS userName, u.username AS userUsername,
        o.name AS odpName, o.code AS odpCode
      FROM canvassing_logs cl
      LEFT JOIN users u ON u.id = cl.user_id
      LEFT JOIN odps o ON o.id = cl.odp_id
      ${whereClause}
      ORDER BY cl.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `))[0] as any);
    return (rows ?? []).map((r: any) => ({
      id: Number(r.id),
      sessionId: Number(r.sessionId),
      userId: Number(r.userId),
      type: String(r.type),
      title: String(r.title),
      description: r.description ? String(r.description) : null,
      lat: r.lat != null ? Number(r.lat) : null,
      lng: r.lng != null ? Number(r.lng) : null,
      odpId: r.odpId != null ? Number(r.odpId) : null,
      severity: r.severity ? String(r.severity) : "info",
      createdAt: String(r.createdAt),
      hasPhoto: Boolean(Number(r.hasPhoto)),
      userName: r.userName ? String(r.userName) : "-",
      userUsername: r.userUsername ? String(r.userUsername) : "",
      odpName: r.odpName ? String(r.odpName) : null,
      odpCode: r.odpCode ? String(r.odpCode) : null,
    }));
  }

  async getCanvassingReportPhoto(id: number): Promise<{ photoData: string | null; photoPath: string | null; userId: number } | null> {
    const mitraId = getMitraId();
    const rows: any = ((await this.db.execute(sql`
      SELECT photo_data AS photoData, photo_path AS photoPath, user_id AS userId
      FROM canvassing_logs WHERE id = ${id} AND mitra_id = ${mitraId} LIMIT 1
    `))[0] as any);
    if (!rows || rows.length === 0) return null;
    return {
      photoData: rows[0].photoData ?? null,
      photoPath: rows[0].photoPath ?? null,
      userId: Number(rows[0].userId),
    };
  }

  async getCanvassingReportStats(sinceDays: number = 30, userId?: number): Promise<any> {
    const mitraId = getMitraId();
    const since = new Date(Date.now() - sinceDays * 86400_000).toISOString();
    const userClause = userId ? sql` AND user_id = ${userId}` : sql``;
    const rows: any = ((await this.db.execute(sql`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN (photo_path IS NOT NULL AND photo_path != '') OR (photo_data IS NOT NULL AND photo_data != '') THEN 1 ELSE 0 END) AS withPhoto,
        SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) AS critical,
        SUM(CASE WHEN date(created_at) = date('now') THEN 1 ELSE 0 END) AS today,
        COUNT(DISTINCT user_id) AS uniqueReporters
      FROM canvassing_logs
      WHERE created_at >= ${since} AND mitra_id = ${mitraId}${userClause}
    `))[0] as any);
    const r = rows?.[0] ?? {};
    return {
      total: Number(r.total ?? 0),
      withPhoto: Number(r.withPhoto ?? 0),
      critical: Number(r.critical ?? 0),
      today: Number(r.today ?? 0),
      uniqueReporters: Number(r.uniqueReporters ?? 0),
    };
  }

  // -- Leads --
  async getLeads(filters?: { assignedTo?: number; stage?: string; source?: string }): Promise<Lead[]> {
    const mitraId = getMitraId();
    const conditions: any[] = [eq(leads.mitraId, mitraId)];
    if (filters?.assignedTo !== undefined) conditions.push(eq(leads.assignedTo, filters.assignedTo));
    if (filters?.stage) conditions.push(eq(leads.stage, filters.stage));
    if (filters?.source) conditions.push(eq(leads.source, filters.source));
    return (this.db.select().from(leads) as any).where(conditions.length === 1 ? conditions[0] : and(...conditions)).orderBy(desc(leads.createdAt));
  }
  async getLeadById(id: number): Promise<Lead | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(leads).where(and(eq(leads.id, id), eq(leads.mitraId, mitraId)));
    return row;
  }
  async createLead(data: InsertLead): Promise<Lead> {
    const mitraId = getMitraId();
    const now = new Date().toISOString();
    const result = await this.db.insert(leads).values({ ...data, mitraId, createdAt: now, updatedAt: now });
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(leads).where(eq(leads.id, insertId));
    return row!;
  }
  async updateLead(id: number, data: Partial<Lead>): Promise<Lead> {
    const mitraId = getMitraId();
    await this.db.update(leads).set({ ...data, updatedAt: new Date().toISOString() }).where(and(eq(leads.id, id), eq(leads.mitraId, mitraId)));
    const [row] = await this.db.select().from(leads).where(eq(leads.id, id));
    return row!;
  }
  async deleteLead(id: number): Promise<void> {
    const mitraId = getMitraId();
    await this.db.delete(leadActivities).where(eq(leadActivities.leadId, id));
    await this.db.delete(leads).where(and(eq(leads.id, id), eq(leads.mitraId, mitraId)));
  }
  async assignLead(id: number, assignedTo: number, assignedBy: number): Promise<Lead> {
    const mitraId = getMitraId();
    const now = new Date().toISOString();
    await this.db.update(leads)
      .set({ assignedTo, assignedBy, assignedAt: now, updatedAt: now })
      .where(and(eq(leads.id, id), eq(leads.mitraId, mitraId)));
    const [row] = await this.db.select().from(leads).where(eq(leads.id, id));
    return row!;
  }
  async moveLeadStage(id: number, stage: string, userId: number): Promise<Lead> {
    const mitraId = getMitraId();
    const lead = await this.getLeadById(id);
    if (!lead) throw new Error("Lead tidak ditemukan");
    const now = new Date().toISOString();
    await this.db.update(leads)
      .set({ stage, updatedAt: now, closedAt: (stage === "won" || stage === "lost") ? now : null })
      .where(and(eq(leads.id, id), eq(leads.mitraId, mitraId)));
    const [row] = await this.db.select().from(leads).where(eq(leads.id, id));
    // Log aktivitas
    await this.createLeadActivity({
      leadId: id, userId, type: "stage_change",
      content: JSON.stringify({ from: lead.stage, to: stage }),
      createdAt: now,
    });
    return row!;
  }

  // -- Lead Activities --
  async getLeadActivities(leadId: number): Promise<LeadActivity[]> {
    const mitraId = getMitraId();
    return this.db.select().from(leadActivities).where(and(eq(leadActivities.leadId, leadId), eq(leadActivities.mitraId, mitraId))).orderBy(desc(leadActivities.createdAt));
  }
  async getLeadActivitiesForLeads(leadIds: number[]): Promise<Map<number, LeadActivity[]>> {
    const mitraId = getMitraId();
    const map = new Map<number, LeadActivity[]>();
    if (leadIds.length === 0) return map;
    const rows = await this.db
      .select()
      .from(leadActivities)
      .where(and(inArray(leadActivities.leadId, leadIds), eq(leadActivities.mitraId, mitraId)))
      .orderBy(desc(leadActivities.createdAt));
    for (const r of rows) {
      const arr = map.get(r.leadId);
      if (arr) arr.push(r);
      else map.set(r.leadId, [r]);
    }
    return map;
  }
  async createLeadActivity(data: InsertLeadActivity): Promise<LeadActivity> {
    const mitraId = getMitraId();
    let photoPath: string | null = (data as any).photoPath ?? null;
    const photoDataRaw = (data as any).photoData;
    if (photoDataRaw && typeof photoDataRaw === "string" && !photoPath) {
      const slug = await this.getMitraSlug(mitraId);
      const idHint = `lead-${(data as any).leadId ?? "x"}-${Date.now()}`;
      photoPath = await saveBase64Photo(slug, "leads", idHint, photoDataRaw);
    }
    const insertData: any = {
      ...data,
      mitraId,
      photoPath,
      photoData: null,
      createdAt: data.createdAt || new Date().toISOString(),
    };
    const result = await this.db.insert(leadActivities).values(insertData);
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(leadActivities).where(eq(leadActivities.id, insertId));
    return row!;
  }
  async deleteLeadActivity(id: number): Promise<void> {
    const mitraId = getMitraId();
    const [row] = await this.db.select({ photoPath: leadActivities.photoPath })
      .from(leadActivities)
      .where(and(eq(leadActivities.id, id), eq(leadActivities.mitraId, mitraId)));
    if (row?.photoPath) await deletePhoto(row.photoPath);
    await this.db.delete(leadActivities).where(and(eq(leadActivities.id, id), eq(leadActivities.mitraId, mitraId)));
  }
  /**
   * Get photoPath (+legacy photoData) untuk lead activity by id. Untuk endpoint stream foto.
   */
  async getLeadActivityPhotoMeta(id: number): Promise<{ photoPath: string | null; photoData: string | null; leadId: number; userId: number } | null> {
    const mitraId = getMitraId();
    const rows: any = ((await this.db.execute(sql`
      SELECT photo_path AS photoPath, photo_data AS photoData, lead_id AS leadId, user_id AS userId
      FROM lead_activities WHERE id = ${id} AND mitra_id = ${mitraId} LIMIT 1
    `))[0] as any);
    if (!rows || rows.length === 0) return null;
    return {
      photoPath: rows[0].photoPath ?? null,
      photoData: rows[0].photoData ?? null,
      leadId: Number(rows[0].leadId),
      userId: Number(rows[0].userId),
    };
  }

  // ---- Map Data ----
  // Light column projection: only fields actually consumed by MapPage.tsx +
  // MapInfoWindow.tsx are selected. This drops pppoe credentials,
  // manualOverrides, notes, billing sync metadata, etc. - reducing
  // customer payload ~80-85% (~800B → ~120B per row).
  async getMapData(): Promise<MapData> {
    const mitraId = getMitraId();
    const [allPops, allOdcs, rawOdps, allCustomers, allPoles, allCables] = await Promise.all([
      this.db.select({
        id: pops.id,
        name: pops.name,
        code: pops.code,
        lat: pops.lat,
        lng: pops.lng,
        status: pops.status,
        address: pops.address,
        totalPorts: pops.totalPorts,
        usedPorts: pops.usedPorts,
        district: pops.district,
        village: pops.village,
      }).from(pops).where(eq(pops.mitraId, mitraId)),

      this.db.select({
        id: odcs.id,
        name: odcs.name,
        code: odcs.code,
        lat: odcs.lat,
        lng: odcs.lng,
        status: odcs.status,
        popId: odcs.popId,
        capacity: odcs.capacity,
        usedCapacity: odcs.usedCapacity,
        address: odcs.address,
        splitterType: odcs.splitterType,
        district: odcs.district,
        village: odcs.village,
      }).from(odcs).where(eq(odcs.mitraId, mitraId)),

      this.db.select({
        id: odps.id,
        name: odps.name,
        code: odps.code,
        lat: odps.lat,
        lng: odps.lng,
        status: odps.status,
        odcId: odps.odcId,
        capacity: odps.capacity,
        address: odps.address,
        splitterType: odps.splitterType,
        district: odps.district,
        village: odps.village,
      }).from(odps).where(eq(odps.mitraId, mitraId)),

      this.db.select({
        id: customers.id,
        name: customers.name,
        customerId: customers.customerId,
        lat: customers.lat,
        lng: customers.lng,
        status: customers.status,
        isIsolir: customers.isIsolir,
        odpId: customers.odpId,
        package: customers.package,
        phone: customers.phone,
        address: customers.address,
        portNumber: customers.portNumber,
        isStatic: customers.isStatic,
      }).from(customers).where(eq(customers.mitraId, mitraId)),

      this.db.select({
        id: poles.id,
        name: poles.name,
        code: poles.code,
        lat: poles.lat,
        lng: poles.lng,
        type: poles.type,
        height: poles.height,
        status: poles.status,
      }).from(poles).where(eq(poles.mitraId, mitraId)),

      this.db.select({
        id: cables.id,
        name: cables.name,
        code: cables.code,
        cableType: cables.cableType,
        pathCoordinates: cables.pathCoordinates,
        lengthMeters: cables.lengthMeters,
        usedCore: cables.usedCore,
        totalCore: cables.totalCore,
        usedTube: cables.usedTube,
        totalTube: cables.totalTube,
        status: cables.status,
      }).from(cables).where(eq(cables.mitraId, mitraId)),
    ]);
    // Compute usedCapacity real-time for ODPs (from customer counts)
    const countMap = new Map<number, number>();
    for (const c of allCustomers) {
      if (c.odpId !== null && c.odpId !== undefined) {
        countMap.set(c.odpId, (countMap.get(c.odpId) ?? 0) + 1);
      }
    }
    const allOdps = rawOdps.map((odp) => ({
      ...odp,
      usedCapacity: countMap.get(odp.id) ?? 0,
    }));
    return {
      pops: allPops,
      odcs: allOdcs,
      odps: allOdps,
      customers: allCustomers,
      poles: allPoles,
      cables: allCables,
    };
  }

  // Tier 1: infra-only (POPs, ODCs, ODPs, Poles, Cables) - no customers.
  // Used by viewport-based map loading (Task C1).
  async getMapInfra(): Promise<{
    pops: any[]; odcs: any[]; odps: any[]; poles: any[]; cables: any[];
  }> {
    const mitraId = getMitraId();
    const [allPops, allOdcs, rawOdps, customerOdpRefs, allPoles, allCables] = await Promise.all([
      this.db.select({
        id: pops.id,
        name: pops.name,
        code: pops.code,
        lat: pops.lat,
        lng: pops.lng,
        status: pops.status,
        address: pops.address,
        totalPorts: pops.totalPorts,
        usedPorts: pops.usedPorts,
        district: pops.district,
        village: pops.village,
      }).from(pops).where(eq(pops.mitraId, mitraId)),

      this.db.select({
        id: odcs.id,
        name: odcs.name,
        code: odcs.code,
        lat: odcs.lat,
        lng: odcs.lng,
        status: odcs.status,
        popId: odcs.popId,
        capacity: odcs.capacity,
        usedCapacity: odcs.usedCapacity,
        address: odcs.address,
        splitterType: odcs.splitterType,
        district: odcs.district,
        village: odcs.village,
      }).from(odcs).where(eq(odcs.mitraId, mitraId)),

      this.db.select({
        id: odps.id,
        name: odps.name,
        code: odps.code,
        lat: odps.lat,
        lng: odps.lng,
        status: odps.status,
        odcId: odps.odcId,
        capacity: odps.capacity,
        address: odps.address,
        splitterType: odps.splitterType,
        district: odps.district,
        village: odps.village,
      }).from(odps).where(eq(odps.mitraId, mitraId)),

      // Light: only odp_id, for usage count
      this.db.select({ odpId: customers.odpId }).from(customers).where(eq(customers.mitraId, mitraId)),

      this.db.select({
        id: poles.id,
        name: poles.name,
        code: poles.code,
        lat: poles.lat,
        lng: poles.lng,
        type: poles.type,
        height: poles.height,
        status: poles.status,
      }).from(poles).where(eq(poles.mitraId, mitraId)),

      this.db.select({
        id: cables.id,
        name: cables.name,
        code: cables.code,
        cableType: cables.cableType,
        pathCoordinates: cables.pathCoordinates,
        lengthMeters: cables.lengthMeters,
        usedCore: cables.usedCore,
        totalCore: cables.totalCore,
        usedTube: cables.usedTube,
        totalTube: cables.totalTube,
        status: cables.status,
      }).from(cables).where(eq(cables.mitraId, mitraId)),
    ]);

    const countMap = new Map<number, number>();
    for (const c of customerOdpRefs) {
      if (c.odpId !== null && c.odpId !== undefined) {
        countMap.set(c.odpId, (countMap.get(c.odpId) ?? 0) + 1);
      }
    }
    const allOdps = rawOdps.map((odp) => ({
      ...odp,
      usedCapacity: countMap.get(odp.id) ?? 0,
    }));

    return {
      pops: allPops,
      odcs: allOdcs,
      odps: allOdps,
      poles: allPoles,
      cables: allCables,
    };
  }

  // Tier 2: viewport-filtered customers (max 1000 hard cap).
  // Raw SQL: composite lat/lng BETWEEN + LIMIT placeholder via mysql2.
  // Uses idx_customers_lat_lng composite index (Phase A).
  async getMapCustomersInBounds(
    bbox: { swLat: number; swLng: number; neLat: number; neLng: number; },
    limit = 500,
  ): Promise<any[]> {
    const mitraId = getMitraId();
    const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 1000);
    const [rows] = await this.pool.execute(
      `SELECT
         id, name, customer_id AS customerId, lat, lng, status,
         is_isolir AS isIsolir, odp_id AS odpId,
         package, phone, address, port_number AS portNumber,
         is_static AS isStatic
       FROM customers
       WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ? AND mitra_id = ?
       LIMIT ?`,
      [bbox.swLat, bbox.neLat, bbox.swLng, bbox.neLng, mitraId, safeLimit],
    );
    return rows as any[];
  }

  // ---- MIKROTIK ROUTERS ----
  async getMikrotikRouters(): Promise<MikrotikRouter[]> {
    const mitraId = getMitraId();
    return this.db.select().from(mikrotikRouters).where(eq(mikrotikRouters.mitraId, mitraId));
  }
  async getMikrotikRouter(id: number): Promise<MikrotikRouter | undefined> {
    const mitraId = getMitraId();
    const rows = await this.db.select().from(mikrotikRouters).where(and(eq(mikrotikRouters.id, id), eq(mikrotikRouters.mitraId, mitraId)));
    return rows[0];
  }
  async createMikrotikRouter(data: InsertMikrotikRouter): Promise<MikrotikRouter> {
    const mitraId = getMitraId();
    const result = await this.db.insert(mikrotikRouters).values({ ...data, mitraId });
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(mikrotikRouters).where(eq(mikrotikRouters.id, insertId));
    return row!;
  }
  async updateMikrotikRouter(id: number, data: Partial<MikrotikRouter>): Promise<MikrotikRouter | undefined> {
    const mitraId = getMitraId();
    await this.db.update(mikrotikRouters).set(data).where(and(eq(mikrotikRouters.id, id), eq(mikrotikRouters.mitraId, mitraId)));
    const [row] = await this.db.select().from(mikrotikRouters).where(eq(mikrotikRouters.id, id));
    return row;
  }
  async deleteMikrotikRouter(id: number): Promise<void> {
    const mitraId = getMitraId();
    await this.db.delete(mikrotikRouters).where(and(eq(mikrotikRouters.id, id), eq(mikrotikRouters.mitraId, mitraId)));
  }
  // ---- TICKET TEAM ----
  async getTicketTeam(ticketId: number): Promise<TicketTeamMember[]> {
    return this.db.select().from(ticketTeam).where(eq(ticketTeam.ticketId, ticketId));
  }
  /** Team members + nama/role user via JOIN (hindari load getAllUsers untuk 1 tiket). */
  async getTicketTeamWithUsers(ticketId: number): Promise<Array<TicketTeamMember & { userName: string; userRole: string | null }>> {
    const rows: any = ((await this.db.execute(sql`
      SELECT tt.*, u.name AS u_name, u.username AS u_username, u.role AS u_role
      FROM ticket_team tt
      LEFT JOIN users u ON u.id = tt.user_id
      WHERE tt.ticket_id = ${ticketId}
    `))[0] as any);
    return (rows ?? []).map((r: any) => ({
      id: r.id, mitraId: r.mitra_id, ticketId: r.ticket_id, userId: r.user_id, role: r.role,
      checkInAt: r.check_in_at, checkOutAt: r.check_out_at,
      checkInLat: r.check_in_lat, checkInLng: r.check_in_lng,
      checkOutLat: r.check_out_lat, checkOutLng: r.check_out_lng,
      userName: r.u_name ?? r.u_username ?? `User #${r.user_id}`,
      userRole: r.u_role ?? null,
    }));
  }
  async addTicketTeamMember(data: { ticketId: number; userId: number; role: string }): Promise<TicketTeamMember> {
    const mitraId = getMitraId();
    const result = await this.db.insert(ticketTeam).values({ ...data, mitraId } as any);
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(ticketTeam).where(eq(ticketTeam.id, insertId));
    return row!;
  }
  async updateTicketTeamMember(id: number, data: Partial<TicketTeamMember>): Promise<TicketTeamMember | undefined> {
    await this.db.update(ticketTeam).set(data).where(eq(ticketTeam.id, id));
    const [row] = await this.db.select().from(ticketTeam).where(eq(ticketTeam.id, id));
    return row;
  }
  async removeTicketTeamMember(id: number): Promise<void> {
    await this.db.delete(ticketTeam).where(eq(ticketTeam.id, id));
  }

  // ---- TICKET EVIDENCE ----
  async getTicketEvidence(ticketId: number): Promise<TicketEvidenceItem[]> {
    return this.db.select().from(ticketEvidence).where(eq(ticketEvidence.ticketId, ticketId));
  }
  async addTicketEvidence(data: { ticketId: number; type: string; photoData?: string; lat?: number; lng?: number; capturedAt: string; capturedBy: number; notes?: string }): Promise<TicketEvidenceItem> {
    const mitraId = getMitraId();
    const result = await this.db.insert(ticketEvidence).values({ ...data, mitraId } as any);
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(ticketEvidence).where(eq(ticketEvidence.id, insertId));
    return row!;
  }
  async deleteTicketEvidence(id: number): Promise<void> {
    await this.db.delete(ticketEvidence).where(eq(ticketEvidence.id, id));
  }

  // ---- TICKET GPS LOGS ----
  async getTicketGpsLogs(ticketId: number): Promise<TicketGpsLog[]> {
    return this.db.select().from(ticketGpsLogs).where(eq(ticketGpsLogs.ticketId, ticketId)).orderBy(ticketGpsLogs.timestamp);
  }
  async addTicketGpsLog(data: { ticketId: number; userId: number; event: string; lat: number; lng: number; timestamp: string }): Promise<TicketGpsLog> {
    const mitraId = getMitraId();
    const result = await this.db.insert(ticketGpsLogs).values({ ...data, mitraId } as any);
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(ticketGpsLogs).where(eq(ticketGpsLogs.id, insertId));
    return row!;
  }

  // ====================  WORKFLOW STAGES (v4.2.4)  ====================
  // Per-kategori workflow flexible. Setiap advance stage:
  //   1. Tutup stage saat ini (set exited_at + duration_sec di transition row)
  //   2. Buat row baru di ticket_stage_transitions untuk stage berikutnya
  //   3. Update tickets.current_stage + stage_entered_at
  //   4. Kalau stage isFinal → auto status=resolved
  //   5. Kalau status=open + stage advance → auto status=in_progress

  /** Resolve workflow stages array untuk kategori. Fallback ke DEFAULT kalau ngga di-set. */
  getCategoryWorkflowStages(category: TicketCategory | null | undefined): WorkflowStage[] {
    if (!category?.workflowStages) return DEFAULT_TICKET_WORKFLOW;
    try {
      const parsed = JSON.parse(category.workflowStages);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Sort by sortOrder defensively
        return parsed.sort((a: WorkflowStage, b: WorkflowStage) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      }
    } catch {}
    return DEFAULT_TICKET_WORKFLOW;
  }

  /** Get stage definition by key (untuk validasi requirement: photo/note/gps). */
  findStageByKey(stages: WorkflowStage[], key: string): WorkflowStage | null {
    return stages.find(s => s.key === key) ?? null;
  }

  /** Stage berikutnya secara default (sequential by sortOrder). Caller bisa override kalau workflow branching. */
  nextStageDefault(stages: WorkflowStage[], currentKey: string | null | undefined): WorkflowStage | null {
    if (!currentKey) return stages[0] ?? null;
    const sorted = [...stages].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex(s => s.key === currentKey);
    if (idx === -1 || idx >= sorted.length - 1) return null;
    return sorted[idx + 1];
  }

  /** List stage transitions untuk satu tiket (chronological). */
  async getTicketStageTransitions(ticketId: number): Promise<TicketStageTransition[]> {
    const mitraId = getMitraId();
    return this.db.select().from(ticketStageTransitions)
      .where(and(eq(ticketStageTransitions.ticketId, ticketId), eq(ticketStageTransitions.mitraId, mitraId)))
      .orderBy(ticketStageTransitions.enteredAt);
  }

  /**
   * Advance ke stage berikutnya. Atomic - close stage saat ini + open stage baru + update tiket.
   * @param toStage Key stage tujuan. Kalau null/undefined, auto-detect berikutnya berdasarkan sortOrder.
   * @returns updated ticket atau throw kalau invalid (stage ngga ada di kategori, requirement ngga terpenuhi, dll)
   */
  async advanceTicketStage(
    ticketId: number,
    byUserId: number,
    opts: {
      toStage?: string | null;
      note?: string;
      evidenceId?: number | null;
      lat?: number | null;
      lng?: number | null;
      metadata?: Record<string, any> | null;  // v4.2.7: structured field values
      // Bypass requirement validation (admin/supervisor override)
      forceAdvance?: boolean;
    } = {},
  ): Promise<Ticket> {
    const ticket = await this.getTicket(ticketId);
    if (!ticket) throw new Error("Tiket tidak ditemukan");

    const category = ticket.categoryId ? await this.getTicketCategory(ticket.categoryId) : null;
    const stages = this.getCategoryWorkflowStages(category);
    if (stages.length === 0) throw new Error("Workflow kategori belum dikonfigurasi");

    // Resolve target stage
    // - Kalau opts.toStage di-provide: pakai itu (eksplisit, bisa back-track atau langsung ke final)
    // - Kalau current stage adalah final → target=current (akan handle as completion below)
    // - Selain itu: auto-advance ke next stage by sortOrder
    let target: WorkflowStage | null = null;
    if (opts.toStage) {
      target = this.findStageByKey(stages, opts.toStage);
      if (!target) throw new Error(`Stage '${opts.toStage}' tidak ada di workflow kategori ini`);
    } else {
      const currentDef = ticket.currentStage ? this.findStageByKey(stages, ticket.currentStage) : null;
      if (currentDef?.isFinal) {
        // Current adalah final - completion request, target = current
        target = currentDef;
      } else {
        target = this.nextStageDefault(stages, ticket.currentStage);
        if (!target) throw new Error("Tidak ada stage berikutnya - tiket sudah di stage final");
      }
    }

    // v4.2.18 (P1.3): Validate requirement → return structured error dengan missing[] list (HTTP 422)
    // Caller (routes.ts) inspect err.missingFields untuk balasin 422 instead of 500.
    if (!opts.forceAdvance) {
      const missing: Array<{ field: string; label: string; reason: string }> = [];
      if (target.requiresPhoto && !opts.evidenceId) {
        missing.push({ field: "evidenceId", label: "Foto bukti pekerjaan", reason: "minimal 1 foto" });
      }
      if (target.requiresGps && (opts.lat == null || opts.lng == null)) {
        missing.push({ field: "gps", label: "GPS lokasi", reason: "aktifkan location di HP" });
      }
      if (target.requiresNote && !opts.note?.trim()) {
        missing.push({ field: "note", label: "Catatan teknisi", reason: "wajib diisi" });
      }
      if (target.requiresSignature && !opts.metadata?.signature) {
        missing.push({ field: "signature", label: "Tanda tangan pelanggan", reason: "tanda tangan di canvas" });
      }
      // Custom fields validation (v4.2.7 schema)
      const customFields = (target as any).customFields ?? [];
      for (const cf of customFields) {
        if (cf.required) {
          const val = opts.metadata?.[cf.key];
          const isEmpty = val === undefined || val === null || (typeof val === "string" && val.trim() === "");
          if (isEmpty) {
            missing.push({ field: `metadata.${cf.key}`, label: cf.label, reason: "wajib diisi" });
          }
        }
      }
      if (missing.length > 0) {
        const err = new Error(`Field wajib belum lengkap untuk stage '${target.label}': ${missing.map(m => m.label).join(", ")}`) as any;
        err.code = "VALIDATION_FAILED";
        err.statusCode = 422;
        err.missingFields = missing;
        err.stage = target.key;
        err.stageLabel = target.label;
        throw err;
      }
    }

    const mitraId = getMitraId();
    const now = new Date().toISOString();
    // v4.2.6: Note/evidence/gps adalah DATA HASIL pengerjaan stage YANG SEDANG SELESAI,
    //         jadi attach ke CLOSING transition, bukan entering transition baru.
    const completionNote = opts.note?.trim() || null;
    const completionEvidence = opts.evidenceId ?? null;
    const completionLat = opts.lat ?? null;
    const completionLng = opts.lng ?? null;
    const completionMetadata = opts.metadata && Object.keys(opts.metadata).length > 0 ? JSON.stringify(opts.metadata) : null;

    // 1. Close current stage transition + lampirkan completion data
    if (ticket.currentStage && ticket.stageEnteredAt) {
      const enteredAt = new Date(ticket.stageEnteredAt).getTime();
      const exitedAt = Date.now();
      const durationSec = Math.max(0, Math.round((exitedAt - enteredAt) / 1000));
      await this.db.update(ticketStageTransitions).set({
        exitedAt: now,
        durationSec,
        note: completionNote,
        evidenceId: completionEvidence,
        lat: completionLat,
        lng: completionLng,
        metadata: completionMetadata,
      } as any)
        .where(and(
          eq(ticketStageTransitions.ticketId, ticketId),
          eq(ticketStageTransitions.toStage, ticket.currentStage),
          sql`exited_at IS NULL`,
        ));
    }

    // 2. Determine real target - kalau current stage adalah FINAL, ngga advance.
    //    Kita cuma close transition dengan data + mark resolved.
    const currentStageDef = ticket.currentStage ? this.findStageByKey(stages, ticket.currentStage) : null;
    const completingFinalStage = currentStageDef?.isFinal === true && (!opts.toStage || opts.toStage === ticket.currentStage);

    if (!completingFinalStage) {
      // Insert new transition row (entering next stage)
      await this.db.insert(ticketStageTransitions).values({
        ticketId,
        fromStage: ticket.currentStage ?? null,
        toStage: target.key,
        enteredAt: now,
        byUserId,
        mitraId,
      } as any);
    }

    // 3. Update ticket: stage + status auto-derive
    const updateData: any = { updatedAt: now };

    if (completingFinalStage) {
      // Tetap di final stage - mark resolved
      updateData.status = "resolved";
      updateData.resolvedAt = now;
      if (completionNote) updateData.resolution = completionNote;
    } else {
      updateData.currentStage = target.key;
      updateData.stageEnteredAt = now;
      // Kalau stage berikutnya adalah final → resolved langsung (rare case kalau client kirim toStage=final)
      if (target.isFinal) {
        updateData.status = "resolved";
        updateData.resolvedAt = now;
        if (completionNote) updateData.resolution = completionNote;
      } else if (ticket.status === "open" || ticket.status === "assigned") {
        updateData.status = "in_progress";
      }
    }

    await this.db.update(tickets).set(updateData).where(eq(tickets.id, ticketId));

    // v4.2.17: Auto-schedule CSAT kalau ticket resolved via stage advance
    if (updateData.status === "resolved") {
      try { await this.scheduleCsatForTicket(ticketId); } catch (e: any) { console.warn("[CSAT] auto-schedule fail:", e.message); }
    }

    // 4. Activity log
    await this.db.insert(ticketActivities).values({
      ticketId,
      userId: byUserId,
      type: "stage_advance",
      content: `${ticket.currentStage ?? "(start)"} → ${target.label}${opts.note ? ` · ${opts.note}` : ""}`,
      createdAt: now,
      mitraId,
    } as any);

    const [updated] = await this.db.select().from(tickets).where(eq(tickets.id, ticketId));
    return updated;
  }

  /**
   * Initialize tiket ke stage pertama (dipanggil saat tiket di-create atau saat di-dispatch).
   * Idempotent - kalau current_stage sudah set, no-op.
   */
  async initializeTicketStage(ticketId: number, byUserId: number): Promise<void> {
    const ticket = await this.getTicket(ticketId);
    if (!ticket || ticket.currentStage) return;
    const category = ticket.categoryId ? await this.getTicketCategory(ticket.categoryId) : null;
    const stages = this.getCategoryWorkflowStages(category);
    const first = stages[0];
    if (!first) return;

    const mitraId = getMitraId();
    const now = new Date().toISOString();
    await this.db.insert(ticketStageTransitions).values({
      ticketId,
      fromStage: null,
      toStage: first.key,
      enteredAt: now,
      byUserId,
      mitraId,
    } as any);
    await this.db.update(tickets).set({
      currentStage: first.key,
      stageEnteredAt: now,
      updatedAt: now,
    } as any).where(eq(tickets.id, ticketId));
  }

  /** Per-stage durations summary (analytics: di mana stuck-nya). */
  async getTicketStageDurations(ticketId: number): Promise<Array<{
    stage: string;
    label: string;
    enteredAt: string;
    exitedAt: string | null;
    durationSec: number | null;
    byUserId: number;
    note: string | null;
    evidenceId: number | null;
    lat: number | null;
    lng: number | null;
    metadata: Record<string, any> | null;
  }>> {
    const transitions = await this.getTicketStageTransitions(ticketId);
    const ticket = await this.getTicket(ticketId);
    const category = ticket?.categoryId ? await this.getTicketCategory(ticket.categoryId) : null;
    const stages = this.getCategoryWorkflowStages(category);
    return transitions.map((t: any) => {
      const stageDef = stages.find(s => s.key === t.toStage);
      // Kalau stage masih open (no exited_at), hitung live duration
      let durationSec: number | null = t.durationSec;
      if (durationSec == null && t.enteredAt) {
        durationSec = Math.max(0, Math.round((Date.now() - new Date(t.enteredAt).getTime()) / 1000));
      }
      let metadata: Record<string, any> | null = null;
      if (t.metadata) {
        try { metadata = JSON.parse(t.metadata); } catch {}
      }
      return {
        stage: t.toStage,
        label: stageDef?.label ?? t.toStage,
        enteredAt: t.enteredAt,
        exitedAt: t.exitedAt,
        durationSec,
        byUserId: t.byUserId,
        note: t.note,
        evidenceId: t.evidenceId,
        lat: t.lat,
        lng: t.lng,
        metadata,
      };
    });
  }

  /**
   * v4.2.7: Edit existing closed stage transition - supaya teknisi bisa koreksi data
   *         setelah submit (mis: ketik numeric salah, foto salah, dst).
   * Update note + evidenceId + lat + lng + metadata. Tidak ubah durasi atau stage flow.
   */
  async updateStageTransition(
    ticketId: number,
    stageKey: string,
    data: {
      note?: string | null;
      evidenceId?: number | null;
      lat?: number | null;
      lng?: number | null;
      metadata?: Record<string, any> | null;
    },
    byUserId: number,
  ): Promise<{ success: boolean; transition?: TicketStageTransition }> {
    const mitraId = getMitraId();
    // v4.2.18 (P1.4): fetch existing dulu untuk diff before/after audit
    const [existing] = await this.db.select().from(ticketStageTransitions)
      .where(and(
        eq(ticketStageTransitions.ticketId, ticketId),
        eq(ticketStageTransitions.toStage, stageKey),
        eq(ticketStageTransitions.mitraId, mitraId),
        sql`exited_at IS NOT NULL`,
      ));
    if (!existing) return { success: false };

    const updateData: any = {};
    if (data.note !== undefined) updateData.note = data.note;
    if (data.evidenceId !== undefined) updateData.evidenceId = data.evidenceId;
    if (data.lat !== undefined) updateData.lat = data.lat;
    if (data.lng !== undefined) updateData.lng = data.lng;
    if (data.metadata !== undefined) {
      updateData.metadata = data.metadata && Object.keys(data.metadata).length > 0
        ? JSON.stringify(data.metadata) : null;
    }

    await this.db.update(ticketStageTransitions).set(updateData)
      .where(eq(ticketStageTransitions.id, existing.id));
    const [updatedTransition] = await this.db.select().from(ticketStageTransitions)
      .where(eq(ticketStageTransitions.id, existing.id));

    if (!updatedTransition) {
      return { success: false };
    }

    // v4.2.18 (P1.4): write structured diff to ticket_stage_edit_log per field changed
    const now = new Date().toISOString();
    const editLogs: Array<{ field: string; oldValue: any; newValue: any }> = [];
    if (data.note !== undefined && existing.note !== data.note) {
      editLogs.push({ field: "note", oldValue: existing.note, newValue: data.note });
    }
    if (data.evidenceId !== undefined && existing.evidenceId !== data.evidenceId) {
      editLogs.push({ field: "evidenceId", oldValue: existing.evidenceId, newValue: data.evidenceId });
    }
    if (data.lat !== undefined && existing.lat !== data.lat) {
      editLogs.push({ field: "lat", oldValue: existing.lat, newValue: data.lat });
    }
    if (data.lng !== undefined && existing.lng !== data.lng) {
      editLogs.push({ field: "lng", oldValue: existing.lng, newValue: data.lng });
    }
    if (data.metadata !== undefined) {
      const oldMeta = (() => { try { return existing.metadata ? JSON.parse(existing.metadata as any) : {}; } catch { return {}; } })();
      const newMeta = data.metadata ?? {};
      const allKeys = new Set([...Object.keys(oldMeta), ...Object.keys(newMeta)]);
      for (const k of allKeys) {
        if (oldMeta[k] !== newMeta[k]) {
          editLogs.push({ field: `metadata.${k}`, oldValue: oldMeta[k], newValue: newMeta[k] });
        }
      }
    }
    for (const log of editLogs) {
      await this.db.insert(ticketStageEditLog).values({
        ticketId, stageKey, transitionId: existing.id,
        byUserId, field: log.field,
        oldValue: log.oldValue == null ? null : (typeof log.oldValue === "object" ? JSON.stringify(log.oldValue) : String(log.oldValue)),
        newValue: log.newValue == null ? null : (typeof log.newValue === "object" ? JSON.stringify(log.newValue) : String(log.newValue)),
        editedAt: now,
        mitraId,
      } as any);
    }

    // Activity log (high-level summary)
    await this.db.insert(ticketActivities).values({
      ticketId,
      userId: byUserId,
      type: "stage_edit",
      content: `Edit stage ${stageKey}: ${editLogs.length} field${editLogs.length === 1 ? "" : "s"} berubah`,
      createdAt: now,
      mitraId,
    } as any);

    return { success: true, transition: updatedTransition };
  }

  // ====================  v4.2.18 (B.6): Comments  ====================

  async getTicketComments(ticketId: number): Promise<Array<TicketComment & { authorName: string | null; authorRole: string | null }>> {
    const mitraId = getMitraId();
    const rows: any = ((await this.db.execute(sql`
      SELECT c.*, u.name as author_name, u.role as author_role
      FROM ticket_comments c
      LEFT JOIN users u ON u.id = c.author_id
      WHERE c.ticket_id = ${ticketId} AND c.mitra_id = ${mitraId} AND c.deleted_at IS NULL
      ORDER BY c.created_at ASC
    `))[0] as any);
    return (rows ?? []).map((r: any) => ({
      id: r.id, ticketId: r.ticket_id, authorId: r.author_id,
      content: r.content, mentions: r.mentions, attachmentUrl: r.attachment_url,
      isInternal: r.is_internal, createdAt: r.created_at,
      editedAt: r.edited_at, deletedAt: r.deleted_at,
      authorName: r.author_name, authorRole: r.author_role,
    }));
  }

  async createTicketComment(data: { ticketId: number; authorId: number; content: string; mentions?: number[]; isInternal?: boolean; attachmentUrl?: string | null }): Promise<TicketComment> {
    const mitraId = getMitraId();
    const result = await this.db.insert(ticketComments).values({
      ticketId: data.ticketId,
      authorId: data.authorId,
      content: data.content,
      mentions: data.mentions ? JSON.stringify(data.mentions) : null,
      attachmentUrl: data.attachmentUrl ?? null,
      isInternal: data.isInternal === false ? 0 : 1,
      createdAt: new Date().toISOString(),
      mitraId,
    } as any);
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(ticketComments).where(eq(ticketComments.id, insertId));
    return row!;
  }

  async deleteTicketComment(commentId: number): Promise<void> {
    await this.db.update(ticketComments).set({ deletedAt: new Date().toISOString() } as any)
      .where(eq(ticketComments.id, commentId));
  }

  // ====================  v4.2.18 (B.7 + C.1): Hold/Pause mechanism  ====================

  /** Get active (ongoing) pause untuk tiket - kalau ada → ticket sedang on_hold */
  async getActivePause(ticketId: number): Promise<TicketPause | null> {
    const [row] = await this.db.select().from(ticketPauses)
      .where(and(eq(ticketPauses.ticketId, ticketId), sql`ended_at IS NULL`));
    return row ?? null;
  }

  /** All pauses untuk tiket (history) */
  async getTicketPauses(ticketId: number): Promise<TicketPause[]> {
    return this.db.select().from(ticketPauses)
      .where(eq(ticketPauses.ticketId, ticketId))
      .orderBy(ticketPauses.startedAt);
  }

  async startTicketPause(data: { ticketId: number; reason: string; note?: string; userId: number }): Promise<TicketPause> {
    // Idempotent: kalau udah ada active pause, return existing
    const active = await this.getActivePause(data.ticketId);
    if (active) return active;
    const mitraId = getMitraId();
    const result = await this.db.insert(ticketPauses).values({
      ticketId: data.ticketId,
      reason: data.reason,
      note: data.note ?? null,
      startedAt: new Date().toISOString(),
      startedByUserId: data.userId,
      mitraId,
    } as any);
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(ticketPauses).where(eq(ticketPauses.id, insertId));
    return row!;
  }

  async endTicketPause(ticketId: number, userId: number): Promise<TicketPause | null> {
    const active = await this.getActivePause(ticketId);
    if (!active) return null;
    await this.db.update(ticketPauses).set({
      endedAt: new Date().toISOString(),
      endedByUserId: userId,
    } as any).where(eq(ticketPauses.id, active.id));
    const [row] = await this.db.select().from(ticketPauses).where(eq(ticketPauses.id, active.id));
    return row ?? null;
  }

  /** Total pause duration (seconds) sum dari semua completed pauses + ongoing pause */
  async getTotalPauseDuration(ticketId: number): Promise<number> {
    const pauses = await this.getTicketPauses(ticketId);
    let totalSec = 0;
    for (const p of pauses) {
      const start = new Date(p.startedAt).getTime();
      const end = p.endedAt ? new Date(p.endedAt).getTime() : Date.now();
      totalSec += Math.max(0, Math.round((end - start) / 1000));
    }
    return totalSec;
  }

  /** v4.2.18 (P1.4): Edit history per stage - buat tampilkan badge "edited Nx" + popover */
  async getStageEditHistory(ticketId: number, stageKey?: string): Promise<TicketStageEditLog[]> {
    if (stageKey) {
      return this.db.select().from(ticketStageEditLog)
        .where(and(eq(ticketStageEditLog.ticketId, ticketId), eq(ticketStageEditLog.stageKey, stageKey)))
        .orderBy(ticketStageEditLog.editedAt);
    }
    return this.db.select().from(ticketStageEditLog)
      .where(eq(ticketStageEditLog.ticketId, ticketId))
      .orderBy(ticketStageEditLog.editedAt);
  }

  // ---- MTTR CALCULATION ----
  async getTicketMTTR(ticketId: number): Promise<{ responseMinutes: number | null; workMinutes: number | null; totalMinutes: number | null }> {
    const ticket = await this.getTicket(ticketId);
    if (!ticket) return { responseMinutes: null, workMinutes: null, totalMinutes: null };
    const team = await this.getTicketTeam(ticketId);
    const firstCheckIn = team.filter(m => m.checkInAt).sort((a, b) => (a.checkInAt! > b.checkInAt! ? 1 : -1))[0];
    const lastCheckOut = team.filter(m => m.checkOutAt).sort((a, b) => (a.checkOutAt! < b.checkOutAt! ? 1 : -1))[0];

    let responseMinutes: number | null = null;
    let workMinutes: number | null = null;
    let totalMinutes: number | null = null;

    if (ticket.createdAt && firstCheckIn?.checkInAt) {
      responseMinutes = Math.round((new Date(firstCheckIn.checkInAt).getTime() - new Date(ticket.createdAt).getTime()) / 60000);
    }
    if (firstCheckIn?.checkInAt && lastCheckOut?.checkOutAt) {
      workMinutes = Math.round((new Date(lastCheckOut.checkOutAt).getTime() - new Date(firstCheckIn.checkInAt).getTime()) / 60000);
    }
    if (ticket.createdAt && ticket.resolvedAt) {
      totalMinutes = Math.round((new Date(ticket.resolvedAt).getTime() - new Date(ticket.createdAt).getTime()) / 60000);
    }
    return { responseMinutes, workMinutes, totalMinutes };
  }

  // ---- CUSTOMER ID AUTO-GENERATE ----
  // Format: YYMMCKKNNNNN (tanpa strip, contoh: 26041030001)
  // YY=tahun, MM=bulan, C=cycle billing (1=tgl 1-10, 2=tgl 11-15, 3=tgl 16+), KK=kode kecamatan, NNNNN=urut 5 digit
  static readonly DISTRICT_CODES: Record<string, string> = {
    "Tarogong Kidul": "01", "Karangpawitan": "02", "Garut Kota": "03",
    "Cilawu": "04", "Bayongbong": "05", "Kota Wetan": "06",
    "Tarogong Kaler": "07", "Leles": "08", "Banyuresmi": "09", "Samarang": "10",
  };

  async generateCustomerId(district?: string | null): Promise<string> {
    const mitraId = getMitraId();
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const day = now.getDate();
    const cycle = day <= 10 ? "1" : day <= 15 ? "2" : "3";
    const kk = (district && DatabaseStorage.DISTRICT_CODES[district]) || String(Math.floor(Math.random() * 10) + 1).padStart(2, "0");

    const prefix = `${yy}${mm}${cycle}${kk}`;
    // Find max sequence for this prefix (scoped to mitra - IDs unique per mitra)
    const allCustomers = await this.db.select({ customerId: customers.customerId }).from(customers).where(eq(customers.mitraId, mitraId));
    let maxSeq = 0;
    for (const c of allCustomers) {
      if (c.customerId && c.customerId.startsWith(prefix)) {
        const seqPart = c.customerId.slice(prefix.length);
        const num = parseInt(seqPart);
        if (!isNaN(num) && num > maxSeq) maxSeq = num;
      }
    }
    return `${prefix}${String(maxSeq + 1).padStart(4, "0")}`;
  }

  // ---- TICKETING / WORK ORDER ----
  async getTicketCategories(): Promise<TicketCategory[]> {
    const mitraId = getMitraId();
    return this.db.select().from(ticketCategories).where(eq(ticketCategories.mitraId, mitraId)).orderBy(ticketCategories.sortOrder);
  }
  async getTicketCategory(id: number): Promise<TicketCategory | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(ticketCategories).where(and(eq(ticketCategories.id, id), eq(ticketCategories.mitraId, mitraId)));
    return row;
  }
  async createTicketCategory(data: InsertTicketCategory): Promise<TicketCategory> {
    const mitraId = getMitraId();
    const result = await this.db.insert(ticketCategories).values({ ...data, mitraId, createdAt: new Date().toISOString() });
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(ticketCategories).where(eq(ticketCategories.id, insertId));
    return row!;
  }
  async updateTicketCategory(id: number, data: Partial<TicketCategory>): Promise<TicketCategory | undefined> {
    const mitraId = getMitraId();
    await this.db.update(ticketCategories).set(data).where(and(eq(ticketCategories.id, id), eq(ticketCategories.mitraId, mitraId)));
    const [row] = await this.db.select().from(ticketCategories).where(eq(ticketCategories.id, id));
    return row;
  }
  async deleteTicketCategory(id: number): Promise<void> {
    const mitraId = getMitraId();
    await this.db.delete(ticketCategories).where(and(eq(ticketCategories.id, id), eq(ticketCategories.mitraId, mitraId)));
  }

  async getNextTicketNumber(): Promise<string> {
    const mitraId = getMitraId();
    const year = new Date().getFullYear();
    const prefix = `TKT-${year}-`;
    const rows = await this.db.select().from(tickets).where(eq(tickets.mitraId, mitraId)).orderBy(desc(tickets.id)).limit(1);
    if (rows.length === 0) return `${prefix}0001`;
    const last = rows[0].ticketNumber;
    if (last.startsWith(prefix)) {
      const num = parseInt(last.replace(prefix, "")) + 1;
      return `${prefix}${String(num).padStart(4, "0")}`;
    }
    return `${prefix}0001`;
  }

  async getTickets(): Promise<Ticket[]> {
    const mitraId = getMitraId();
    return this.db.select().from(tickets).where(eq(tickets.mitraId, mitraId)).orderBy(desc(tickets.createdAt));
  }
  /**
   * List tiket dengan filter + paginasi + enrich nama (customer/assignee) via JOIN -
   * supaya client tidak perlu menarik seluruh tabel customers/users untuk resolve nama,
   * dan tidak mengirim seluruh tabel tiket ke browser.
   */
  async getTicketsPaginated(opts: {
    page?: number; pageSize?: number;
    search?: string; status?: string; categoryId?: number; priority?: string;
  }): Promise<{ items: Array<Ticket & { customerName: string | null; customerCode: string | null; assigneeName: string | null }>; total: number }> {
    const mitraId = getMitraId();
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(Math.max(1, opts.pageSize ?? 15), 1000);
    const offset = (page - 1) * pageSize;

    const conds = [eq(tickets.mitraId, mitraId)];
    if (opts.status) conds.push(eq(tickets.status, opts.status));
    if (opts.categoryId) conds.push(eq(tickets.categoryId, opts.categoryId));
    if (opts.priority) conds.push(eq(tickets.priority, opts.priority));
    if (opts.search && opts.search.trim()) {
      const q = `%${opts.search.trim()}%`;
      conds.push(or(like(tickets.ticketNumber, q), like(tickets.title, q), like(customers.name, q))!);
    }
    const whereExpr = and(...conds);

    const rows = await this.db.select({
      ticket: tickets,
      customerName: customers.name,
      customerCode: customers.customerId,
      assigneeName: users.name,
    }).from(tickets)
      .leftJoin(customers, eq(customers.id, tickets.customerId))
      .leftJoin(users, eq(users.id, tickets.assignedTo))
      .where(whereExpr)
      .orderBy(desc(tickets.createdAt))
      .limit(pageSize).offset(offset);

    const [cnt] = await this.db.select({ c: count() }).from(tickets)
      .leftJoin(customers, eq(customers.id, tickets.customerId))
      .where(whereExpr);

    return {
      items: rows.map(r => ({ ...r.ticket, customerName: r.customerName ?? null, customerCode: r.customerCode ?? null, assigneeName: r.assigneeName ?? null })),
      total: Number(cnt?.c ?? 0),
    };
  }
  async getTicketsByCustomerId(customerId: number): Promise<Ticket[]> {
    const mitraId = getMitraId();
    return this.db.select().from(tickets)
      .where(and(eq(tickets.customerId, customerId), eq(tickets.mitraId, mitraId)))
      .orderBy(desc(tickets.createdAt));
  }
  async getTicket(id: number): Promise<Ticket | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(tickets).where(and(eq(tickets.id, id), eq(tickets.mitraId, mitraId)));
    return row;
  }
  async createTicket(data: InsertTicket): Promise<Ticket> {
    const mitraId = getMitraId();
    const now = new Date().toISOString();
    // v4.2.4: Auto-set slaDeadline berdasarkan kategori.slaHours (kalau ngga di-pass manual)
    // v4.2.18 (C.3): kalau business hours calendar enabled, deadline pakai business-time
    const insertData: any = { ...data, mitraId, createdAt: now, updatedAt: now };
    if (!insertData.slaDeadline && insertData.categoryId) {
      const cat = await this.getTicketCategory(insertData.categoryId);
      if (cat?.slaHours && cat.slaHours > 0) {
        const cfg = await this.getBusinessHoursConfig();
        const { addBusinessHours } = await import("./business-hours.js");
        insertData.slaDeadline = new Date(addBusinessHours(Date.now(), cat.slaHours, cfg)).toISOString();
      }
    }
    // Atomic numbering: unique index (mitra_id, ticket_number) bikin race antar create
    // bersamaan jadi error 1062 - retry dengan nomor berikutnya, bukan menulis duplikat.
    let insertId = 0;
    for (let attempt = 0; ; attempt++) {
      if (!insertData.ticketNumber) insertData.ticketNumber = await this.getNextTicketNumber();
      try {
        const insertResult = await this.db.insert(tickets).values(insertData);
        insertId = Number((insertResult[0] as any).insertId);
        break;
      } catch (e: any) {
        const isDup = e?.code === "ER_DUP_ENTRY" || e?.errno === 1062;
        if (isDup && attempt < 4) {
          insertData.ticketNumber = await this.getNextTicketNumber();
          continue;
        }
        throw e;
      }
    }
    const [row] = await this.db.select().from(tickets).where(eq(tickets.id, insertId));
    // v4.2.4: Auto-initialize stage pertama dari workflow kategori
    try {
      await this.initializeTicketStage(row!.id, row!.createdBy);
      // Re-fetch untuk dapat stage info terbaru
      const refreshed = await this.getTicket(row!.id);
      return refreshed ?? row!;
    } catch (e: any) {
      console.warn("[Ticket] initializeTicketStage failed:", e.message);
      return row!;
    }
  }

  /**
   * v4.2.4: Find tiket aktif di ODP yang sama (untuk warning saat create tiket baru).
   * Active = status open/assigned/in_progress/pending.
   */
  async getActiveTicketsAtOdp(odpId: number, excludeTicketId?: number): Promise<Ticket[]> {
    const mitraId = getMitraId();
    const rows = await this.db.select().from(tickets)
      .where(and(
        eq(tickets.odpId, odpId),
        eq(tickets.mitraId, mitraId),
        sql`status IN ('open', 'assigned', 'in_progress', 'pending')`,
      ))
      .orderBy(desc(tickets.createdAt));
    if (excludeTicketId) return rows.filter(t => t.id !== excludeTicketId);
    return rows;
  }

  /**
   * v4.2.4: Past resolution patterns di ODP yang sama (untuk auto-suggest).
   * Return resolusi tiket-tiket sebelumnya yang sudah di-close di ODP ini.
   */
  async getOdpResolutionPatterns(odpId: number, limit = 5): Promise<Array<{ ticketNumber: string; title: string; resolution: string | null; resolvedAt: string | null; categoryId: number | null }>> {
    const mitraId = getMitraId();
    const rows = await this.db.select({
      ticketNumber: tickets.ticketNumber,
      title: tickets.title,
      resolution: tickets.resolution,
      resolvedAt: tickets.resolvedAt,
      categoryId: tickets.categoryId,
    }).from(tickets)
      .where(and(
        eq(tickets.odpId, odpId),
        eq(tickets.mitraId, mitraId),
        sql`status IN ('resolved', 'closed')`,
        sql`resolution IS NOT NULL AND resolution != ''`,
      ))
      .orderBy(desc(tickets.resolvedAt))
      .limit(limit);
    return rows;
  }

  // ==================== TICKET CHECKPOINTS (v4.2.5) ====================
  // Action-based - replace stage rigid. Teknisi tap action button = catat checkpoint.

  /**
   * Tambah checkpoint baru untuk tiket. Auto-update status tiket berdasarkan action:
   *   - depart/start_work → status=in_progress (kalau masih open/scheduled)
   *   - complete → status=resolved + resolvedAt + resolution (dari note)
   *   - escalate → status tetap, tapi tambah activity sebagai signal
   */
  async addTicketCheckpoint(data: {
    ticketId: number;
    action: CheckpointAction;
    byUserId: number;
    note?: string;
    evidenceId?: number;
    lat?: number;
    lng?: number;
    metadata?: Record<string, any>;
  }): Promise<TicketCheckpoint> {
    if (!CHECKPOINT_ACTIONS.includes(data.action)) {
      throw new Error(`Action '${data.action}' tidak valid`);
    }
    const config = CHECKPOINT_ACTION_CONFIG[data.action];
    if (config.requiresPhoto && !data.evidenceId) throw new Error(`Action '${config.label}' wajib upload foto`);
    if (config.requiresGps && (data.lat == null || data.lng == null)) throw new Error(`Action '${config.label}' wajib GPS`);
    if (config.requiresNote && !data.note?.trim()) throw new Error(`Action '${config.label}' wajib catatan`);

    const mitraId = getMitraId();
    const now = new Date().toISOString();
    const checkpointResult = await this.db.insert(ticketCheckpoints).values({
      ticketId: data.ticketId,
      action: data.action,
      byUserId: data.byUserId,
      timestamp: now,
      note: data.note?.trim() || null,
      evidenceId: data.evidenceId ?? null,
      lat: data.lat ?? null,
      lng: data.lng ?? null,
      metadata: data.metadata ? JSON.stringify(data.metadata) : null,
      mitraId,
    } as any);
    const checkpointId = Number((checkpointResult[0] as any).insertId);
    const [checkpoint] = await this.db.select().from(ticketCheckpoints).where(eq(ticketCheckpoints.id, checkpointId));

    // Auto-update status tiket
    const ticket = await this.getTicket(data.ticketId);
    if (ticket && config.setsStatus) {
      const updates: any = { status: config.setsStatus, updatedAt: now };
      if (config.setsStatus === "in_progress" && (ticket.status === "open" || ticket.status === "assigned" || ticket.status === "scheduled")) {
        // OK to update
      } else if (config.setsStatus === "resolved") {
        updates.resolvedAt = now;
        if (data.note?.trim()) updates.resolution = data.note.trim();
      } else {
        // Skip kalau status sudah lebih advance
        delete updates.status;
      }
      if (updates.status) {
        await this.db.update(tickets).set(updates).where(eq(tickets.id, data.ticketId));
      }
    }

    // Activity log untuk audit trail
    await this.db.insert(ticketActivities).values({
      ticketId: data.ticketId,
      userId: data.byUserId,
      type: `checkpoint:${data.action}`,
      content: `${config.label}${data.note ? ` · ${data.note}` : ""}`,
      createdAt: now,
      mitraId,
    } as any);

    return checkpoint;
  }

  /** List checkpoints untuk satu tiket (chronological ASC). */
  async getTicketCheckpoints(ticketId: number): Promise<TicketCheckpoint[]> {
    return this.db.select().from(ticketCheckpoints)
      .where(eq(ticketCheckpoints.ticketId, ticketId))
      .orderBy(ticketCheckpoints.timestamp);
  }

  /**
   * Time tracking metrics dari checkpoints - auto-derive durations.
   * - travelMinutes: depart → arrive
   * - setupMinutes: arrive → start_work
   * - workMinutes: start_work → complete (minus pause durations)
   * - pauseMinutes: total durasi pause
   * - totalMinutes: depart → complete (atau createdAt → complete)
   */
  async getTicketTimeMetrics(ticketId: number): Promise<{
    travelMinutes: number | null;
    setupMinutes: number | null;
    workMinutes: number | null;
    pauseMinutes: number;
    totalMinutes: number | null;
    checkpointCount: number;
  }> {
    const cps = await this.getTicketCheckpoints(ticketId);
    if (cps.length === 0) return { travelMinutes: null, setupMinutes: null, workMinutes: null, pauseMinutes: 0, totalMinutes: null, checkpointCount: 0 };

    const ticket = await this.getTicket(ticketId);
    const findFirst = (action: string) => cps.find(c => c.action === action);
    const findLast = (action: string) => [...cps].reverse().find(c => c.action === action);

    const depart = findFirst("depart");
    const arrive = findFirst("arrive");
    const startWork = findFirst("start_work");
    const complete = findLast("complete");

    const min = (a: string | null | undefined, b: string | null | undefined) =>
      a && b ? Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000) : null;

    // Total pause durasi: sum semua pasangan pause→resume
    let pauseMinutes = 0;
    let openPauseAt: string | null = null;
    for (const cp of cps) {
      if (cp.action === "pause") openPauseAt = cp.timestamp;
      else if (cp.action === "resume" && openPauseAt) {
        pauseMinutes += min(openPauseAt, cp.timestamp) ?? 0;
        openPauseAt = null;
      }
    }

    const workMinRaw = min(startWork?.timestamp, complete?.timestamp);
    const workMinutes = workMinRaw != null ? Math.max(0, workMinRaw - pauseMinutes) : null;

    return {
      travelMinutes: min(depart?.timestamp, arrive?.timestamp),
      setupMinutes: min(arrive?.timestamp, startWork?.timestamp),
      workMinutes,
      pauseMinutes,
      totalMinutes: min(ticket?.createdAt, complete?.timestamp),
      checkpointCount: cps.length,
    };
  }

  // ==================== CHATWOOT INTEGRATION (v4.2.5) ====================

  async getChatwootConfig(): Promise<ChatwootConfig | null> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(chatwootConfig).where(eq(chatwootConfig.mitraId, mitraId)).orderBy(chatwootConfig.id).limit(1);
    return row ?? null;
  }

  async updateChatwootConfig(data: Partial<ChatwootConfig>): Promise<ChatwootConfig> {
    const mitraId = getMitraId();
    const existing = await this.getChatwootConfig();
    const now = new Date().toISOString();
    if (existing) {
      await this.db.update(chatwootConfig).set({ ...data, updatedAt: now } as any).where(and(eq(chatwootConfig.id, existing.id), eq(chatwootConfig.mitraId, mitraId)));
      const [row] = await this.db.select().from(chatwootConfig).where(eq(chatwootConfig.id, existing.id));
      return row;
    }
    const insertResult = await this.db.insert(chatwootConfig).values({ ...data, mitraId, createdAt: now, updatedAt: now } as any);
    const insertId = Number((insertResult[0] as any).insertId);
    const [row] = await this.db.select().from(chatwootConfig).where(eq(chatwootConfig.id, insertId));
    return row!;
  }

  async listChatwootKeywordRules(): Promise<ChatwootKeywordRule[]> {
    const mitraId = getMitraId();
    return this.db.select().from(chatwootKeywordRules).where(eq(chatwootKeywordRules.mitraId, mitraId)).orderBy(chatwootKeywordRules.sortOrder);
  }

  async createChatwootKeywordRule(data: { keyword: string; categoryId: number; priority?: string; sortOrder?: number }): Promise<ChatwootKeywordRule> {
    const mitraId = getMitraId();
    const result = await this.db.insert(chatwootKeywordRules).values({
      mitraId,
      keyword: data.keyword,
      categoryId: data.categoryId,
      priority: data.priority ?? "medium",
      sortOrder: data.sortOrder ?? 0,
      isActive: 1,
      createdAt: new Date().toISOString(),
    } as any);
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(chatwootKeywordRules).where(eq(chatwootKeywordRules.id, insertId));
    return row!;
  }

  async updateChatwootKeywordRule(id: number, data: Partial<ChatwootKeywordRule>): Promise<ChatwootKeywordRule | undefined> {
    const mitraId = getMitraId();
    await this.db.update(chatwootKeywordRules).set(data as any).where(and(eq(chatwootKeywordRules.id, id), eq(chatwootKeywordRules.mitraId, mitraId)));
    const [row] = await this.db.select().from(chatwootKeywordRules).where(and(eq(chatwootKeywordRules.id, id), eq(chatwootKeywordRules.mitraId, mitraId)));
    return row;
  }

  async deleteChatwootKeywordRule(id: number): Promise<void> {
    const mitraId = getMitraId();
    await this.db.delete(chatwootKeywordRules).where(and(eq(chatwootKeywordRules.id, id), eq(chatwootKeywordRules.mitraId, mitraId)));
  }

  // -- Chatwoot agent links (Batch 2c) - per-mitra user↔agent mapping --
  async listChatwootAgentLinks(): Promise<ChatwootAgentLink[]> {
    const mitraId = getMitraId();
    return this.db.select().from(chatwootAgentLinks).where(eq(chatwootAgentLinks.mitraId, mitraId));
  }
  async setChatwootAgentLink(userId: number, agentId: string, name: string | null, email: string | null): Promise<void> {
    const mitraId = getMitraId();
    const now = new Date().toISOString();
    await this.db.execute(sql`
      INSERT INTO chatwoot_agent_links (mitra_id, user_id, chatwoot_agent_id, agent_name, agent_email, created_at, updated_at)
      VALUES (${mitraId}, ${userId}, ${agentId}, ${name}, ${email}, ${now}, ${now})
      ON DUPLICATE KEY UPDATE chatwoot_agent_id = VALUES(chatwoot_agent_id), agent_name = VALUES(agent_name), agent_email = VALUES(agent_email), updated_at = VALUES(updated_at)
    `);
  }
  async deleteChatwootAgentLink(userId: number): Promise<number> {
    const mitraId = getMitraId();
    const result: any = await this.db.execute(sql`DELETE FROM chatwoot_agent_links WHERE mitra_id = ${mitraId} AND user_id = ${userId}`);
    return Number(result?.[0]?.affectedRows ?? 0);
  }
  async getChatwootAgentLinkByUser(userId: number): Promise<ChatwootAgentLink | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(chatwootAgentLinks).where(and(eq(chatwootAgentLinks.mitraId, mitraId), eq(chatwootAgentLinks.userId, userId)));
    return row;
  }

  /** Match incoming message text ke rules → return rule yang cocok pertama (by sortOrder). */
  async matchChatwootKeywordRule(messageText: string): Promise<ChatwootKeywordRule | null> {
    const rules = await this.listChatwootKeywordRules();
    const lower = messageText.toLowerCase();
    for (const rule of rules) {
      if (!rule.isActive) continue;
      const patterns = rule.keyword.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
      if (patterns.some(p => lower.includes(p))) return rule;
    }
    return null;
  }

  async createChatwootTicketLink(data: { ticketId: number; conversationId: string; contactId?: string; inboxId?: string }): Promise<ChatwootTicketLink> {
    const mitraId = getMitraId();
    const result = await this.db.insert(chatwootTicketLinks).values({
      ...data,
      mitraId,
      createdAt: new Date().toISOString(),
    } as any);
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(chatwootTicketLinks).where(eq(chatwootTicketLinks.id, insertId));
    return row!;
  }

  async getChatwootLinkByTicket(ticketId: number): Promise<ChatwootTicketLink | undefined> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(chatwootTicketLinks).where(and(eq(chatwootTicketLinks.ticketId, ticketId), eq(chatwootTicketLinks.mitraId, mitraId)));
    return row;
  }

  /** NOTE: pre-auth webhook lookup - chatwoot calls this with just conversationId.
   *  Caller wraps with withMitra after resolving link's mitra. */
  async getChatwootLinkByConversation(conversationId: string): Promise<ChatwootTicketLink | undefined> {
    const [row] = await this.db.select().from(chatwootTicketLinks).where(eq(chatwootTicketLinks.conversationId, conversationId));
    return row;
  }

  async findCustomerByPhone(phone: string): Promise<Customer | null> {
    const mitraId = getMitraId();
    // Normalize phone - strip non-digits, try various formats
    const digits = phone.replace(/\D/g, "");
    if (!digits) return null;
    const candidates = [
      digits,
      digits.replace(/^0/, "62"),
      digits.replace(/^62/, "0"),
      digits.replace(/^628/, "8"),
      digits.replace(/^8/, "628"),
    ];
    for (const candidate of candidates) {
      const rows = await this.db.select().from(customers).where(and(
        sql`replace(replace(replace(phone, ' ', ''), '-', ''), '+', '') = ${candidate}`,
        eq(customers.mitraId, mitraId)
      )).limit(1);
      if (rows.length > 0) return rows[0];
    }
    return null;
  }

  async updateTicket(id: number, data: Partial<Ticket>): Promise<Ticket | undefined> {
    const mitraId = getMitraId();
    await this.db.update(tickets).set({ ...data, updatedAt: new Date().toISOString() }).where(and(eq(tickets.id, id), eq(tickets.mitraId, mitraId)));
    const [row] = await this.db.select().from(tickets).where(eq(tickets.id, id));
    return row;
  }
  async deleteTicket(id: number): Promise<void> {
    const mitraId = getMitraId();
    // Cascade semua tabel anak dalam 1 transaksi supaya tidak meninggalkan orphan
    // (UI menjanjikan "beserta semua aktivitas, tim, dan evidence").
    const childTables = [
      "ticket_activities", "ticket_team", "ticket_evidence", "ticket_gps_logs",
      "ticket_csat", "ticket_sla_escalations", "ticket_comments", "ticket_pauses",
      "ticket_stage_edit_log", "ticket_stage_transitions", "ticket_checkpoints",
    ];
    const conn = await this.pool.getConnection();
    await conn.beginTransaction();
    try {
      for (const tbl of childTables) {
        await conn.execute(`DELETE FROM ${tbl} WHERE ticket_id = ? AND mitra_id = ?`, [id, mitraId]);
      }
      // Alarm jaringan adalah sumber tiket, bukan anak - putuskan referensinya, jangan dihapus.
      await conn.execute(`UPDATE network_alarms SET ticket_id = NULL WHERE ticket_id = ? AND mitra_id = ?`, [id, mitraId]);
      await conn.execute(`DELETE FROM tickets WHERE id = ? AND mitra_id = ?`, [id, mitraId]);
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  async getTicketActivities(ticketId: number): Promise<TicketActivity[]> {
    const mitraId = getMitraId();
    return this.db.select().from(ticketActivities).where(and(eq(ticketActivities.ticketId, ticketId), eq(ticketActivities.mitraId, mitraId))).orderBy(desc(ticketActivities.createdAt));
  }

  /**
   * v4.2.18 (A.3): Get activities paginated + with user info enrichment.
   * @param filter optional filter by action type ("stage_started" | "stage_completed" | dst)
   */
  async getTicketActivitiesPaginated(ticketId: number, opts?: { limit?: number; offset?: number; types?: string[] }): Promise<{
    items: Array<TicketActivity & { actorName?: string | null; actorRole?: string | null }>;
    total: number;
  }> {
    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;
    let countQuery: any = sql`SELECT COUNT(*) as cnt FROM ticket_activities WHERE ticket_id = ${ticketId}`;
    let listQuery: any = sql`
      SELECT a.*, u.name as actor_name, u.role as actor_role
      FROM ticket_activities a
      LEFT JOIN users u ON u.id = a.user_id
      WHERE a.ticket_id = ${ticketId}
    `;
    if (opts?.types && opts.types.length > 0) {
      const inList = opts.types.map(t => `'${t.replace(/'/g, "''")}'`).join(",");
      countQuery = sql`SELECT COUNT(*) as cnt FROM ticket_activities WHERE ticket_id = ${ticketId} AND type IN (${sql.raw(inList)})`;
      listQuery = sql`
        SELECT a.*, u.name as actor_name, u.role as actor_role
        FROM ticket_activities a
        LEFT JOIN users u ON u.id = a.user_id
        WHERE a.ticket_id = ${ticketId} AND a.type IN (${sql.raw(inList)})
      `;
    }
    const totalRows: any = (await this.db.execute(countQuery))[0];
    const total = Number(totalRows?.[0]?.cnt ?? 0);
    const rows: any = ((await this.db.execute(sql`${listQuery} ORDER BY a.created_at DESC LIMIT ${limit} OFFSET ${offset}`))[0] as any);
    return {
      total,
      items: (rows ?? []).map((r: any) => ({
        id: r.id, ticketId: r.ticket_id, userId: r.user_id, type: r.type,
        content: r.content, createdAt: r.created_at,
        payloadJson: r.payload_json, ip: r.ip, userAgent: r.user_agent,
        gpsLat: r.gps_lat, gpsLng: r.gps_lng,
        actorName: r.actor_name, actorRole: r.actor_role,
      })),
    };
  }

  async createTicketActivity(data: InsertTicketActivity): Promise<TicketActivity> {
    const mitraId = getMitraId();
    const result = await this.db.insert(ticketActivities).values({ ...data, mitraId });
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(ticketActivities).where(eq(ticketActivities.id, insertId));
    return row!;
  }

  /**
   * v4.2.18 (A.3): logActivity - structured helper untuk audit log.
   * Capture IP, user-agent, GPS dari request automatically.
   * Action enum: "ticket.created" | "ticket.assigned" | "ticket.priority_changed" |
   *              "stage.started" | "stage.completed" | "stage.edited" |
   *              "comment.added" | "attachment.uploaded" | "status.changed" |
   *              "team.added" | "team.removed" | "ticket.held" | "ticket.escalated"
   */
  async logActivity(opts: {
    ticketId: number;
    actorId: number;
    action: string;
    payload?: any;
    ip?: string | null;
    userAgent?: string | null;
    gpsLat?: number | null;
    gpsLng?: number | null;
    summary?: string;     // human-readable for legacy `content` column
  }): Promise<TicketActivity> {
    const mitraId = getMitraId();
    const logResult = await this.db.insert(ticketActivities).values({
      ticketId: opts.ticketId,
      userId: opts.actorId,
      type: opts.action,
      content: opts.summary ?? (opts.payload ? JSON.stringify(opts.payload) : null),
      payloadJson: opts.payload ? JSON.stringify(opts.payload) : null,
      ip: opts.ip ?? null,
      userAgent: opts.userAgent ?? null,
      gpsLat: opts.gpsLat ?? null,
      gpsLng: opts.gpsLng ?? null,
      createdAt: new Date().toISOString(),
      mitraId,
    } as any);
    const logInsertId = Number((logResult[0] as any).insertId);
    const [row] = await this.db.select().from(ticketActivities).where(eq(ticketActivities.id, logInsertId));
    return row!;
  }

  async getTicketStats(): Promise<{ open: number; inProgress: number; pending: number; resolvedThisMonth: number; total: number }> {
    const mitraId = getMitraId();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    // Agregat di DB, bukan load full table lalu filter di JS.
    const rows: any = ((await this.db.execute(sql`
      SELECT
        SUM(status IN ('open','assigned'))                                              AS openCount,
        SUM(status = 'in_progress')                                                     AS inProgress,
        SUM(status = 'pending')                                                         AS pending,
        SUM((status IN ('resolved','closed')) AND resolved_at IS NOT NULL AND resolved_at >= ${monthStart}) AS resolvedThisMonth,
        COUNT(*)                                                                        AS total
      FROM tickets
      WHERE mitra_id = ${mitraId}
    `))[0] as any);
    const r = rows?.[0] ?? {};
    return {
      open: Number(r.openCount ?? 0),
      inProgress: Number(r.inProgress ?? 0),
      pending: Number(r.pending ?? 0),
      resolvedThisMonth: Number(r.resolvedThisMonth ?? 0),
      total: Number(r.total ?? 0),
    };
  }

  // v4.2.18 (C.4): SLA dashboard stats - compliance %, MTTR, breach trend (14 hari)
  async getSlaDashboardStats(): Promise<{
    complianceRate: number;        // % tiket resolved sebelum SLA breach (last 30 hari)
    mttrMinutes: number | null;    // mean time to resolution (last 30 hari)
    activeOverdue: number;         // tiket aktif yang sudah breach SLA sekarang
    activeAtRisk: number;          // tiket aktif < 1 jam menuju breach
    breachTrend14d: Array<{ date: string; resolved: number; breached: number }>;
    onHoldCount: number;
  }> {
    const mitraId = getMitraId();
    const now = Date.now();
    const dayStart = (offset: number) => {
      const d = new Date();
      d.setDate(d.getDate() - offset);
      d.setHours(0, 0, 0, 0);
      return d.toISOString();
    };
    const last30 = new Date(now - 30 * 24 * 3600_000).toISOString();

    // Resolved (last 30 days) untuk compliance + MTTR
    const resolved: any[] = ((await this.db.execute(sql`
      SELECT id, created_at, resolved_at, sla_deadline, status
      FROM tickets
      WHERE mitra_id = ${mitraId}
        AND (status = 'resolved' OR status = 'closed')
        AND resolved_at IS NOT NULL
        AND resolved_at >= ${last30}
    `))[0] as any);
    let onTime = 0;
    let breached = 0;
    let mttrTotal = 0;
    let mttrCount = 0;
    for (const t of resolved) {
      if (t.created_at && t.resolved_at) {
        const dur = Math.max(0, new Date(t.resolved_at).getTime() - new Date(t.created_at).getTime());
        mttrTotal += dur;
        mttrCount++;
      }
      if (t.sla_deadline && t.resolved_at) {
        if (new Date(t.resolved_at).getTime() <= new Date(t.sla_deadline).getTime()) onTime++;
        else breached++;
      } else {
        onTime++;
      }
    }
    const complianceRate = resolved.length > 0 ? Math.round((onTime / resolved.length) * 1000) / 10 : 100;
    const mttrMinutes = mttrCount > 0 ? Math.round(mttrTotal / mttrCount / 60_000) : null;

    // Active counts
    const active: any[] = ((await this.db.execute(sql`
      SELECT id, status, sla_deadline FROM tickets
      WHERE mitra_id = ${mitraId} AND status IN ('open', 'assigned', 'in_progress', 'pending', 'on_hold')
    `))[0] as any);
    let activeOverdue = 0;
    let activeAtRisk = 0;
    let onHoldCount = 0;
    for (const t of active) {
      if (t.status === "on_hold" || t.status === "pending") onHoldCount++;
      if (t.sla_deadline) {
        const remaining = new Date(t.sla_deadline).getTime() - now;
        if (remaining < 0) activeOverdue++;
        else if (remaining < 60 * 60_000) activeAtRisk++;
      }
    }

    // Breach trend last 14 days - 1 query untuk seluruh window, bucket di JS
    // (sebelumnya 14 query sekuensial, satu per hari).
    const windowStart = dayStart(13);
    const windowEnd = dayStart(-1); // besok tengah malam → cakup hari ini penuh
    const trendRows: any[] = ((await this.db.execute(sql`
      SELECT sla_deadline, resolved_at FROM tickets
      WHERE mitra_id = ${mitraId} AND resolved_at >= ${windowStart} AND resolved_at < ${windowEnd}
    `))[0] as any);
    const bins = [] as Array<{ date: string; startMs: number; endMs: number; resolved: number; breached: number }>;
    for (let i = 13; i >= 0; i--) {
      bins.push({
        date: dayStart(i).slice(0, 10),
        startMs: new Date(dayStart(i)).getTime(),
        endMs: new Date(dayStart(i - 1)).getTime(),
        resolved: 0, breached: 0,
      });
    }
    for (const t of (trendRows ?? [])) {
      if (!t.resolved_at) continue;
      const ms = new Date(t.resolved_at).getTime();
      const bin = bins.find(b => ms >= b.startMs && ms < b.endMs);
      if (!bin) continue;
      bin.resolved++;
      if (t.sla_deadline && new Date(t.resolved_at).getTime() > new Date(t.sla_deadline).getTime()) bin.breached++;
    }
    const breachTrend14d: Array<{ date: string; resolved: number; breached: number }> =
      bins.map(b => ({ date: b.date, resolved: b.resolved, breached: b.breached }));

    return {
      complianceRate,
      mttrMinutes,
      activeOverdue,
      activeAtRisk,
      breachTrend14d,
      onHoldCount,
    };
  }

  // v4.2.16: Workload per teknisi - total tiket di-assign + breakdown per status
  async getTechnicianWorkload(): Promise<Array<{
    userId: number; userName: string; userRole: string;
    totalAssigned: number; asLead: number; asHelper: number;
    open: number; inProgress: number; pending: number;
    resolvedThisMonth: number;
    avgWorkMinutes: number | null;
  }>> {
    const mitraId = getMitraId();
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const rows: any = ((await this.db.execute(sql`
      SELECT
        tt.user_id as userId,
        u.name as userName,
        u.role as userRole,
        tt.role as teamRole,
        t.status as ticketStatus,
        t.resolved_at as resolvedAt,
        tt.check_in_at as checkInAt,
        tt.check_out_at as checkOutAt
      FROM ticket_team tt
      INNER JOIN tickets t ON t.id = tt.ticket_id
      INNER JOIN users u ON u.id = tt.user_id
      WHERE tt.mitra_id = ${mitraId}
    `))[0] as any);
    const byUser = new Map<number, any>();
    for (const r of (rows ?? [])) {
      let entry = byUser.get(r.userId);
      if (!entry) {
        entry = {
          userId: r.userId, userName: r.userName, userRole: r.userRole,
          totalAssigned: 0, asLead: 0, asHelper: 0,
          open: 0, inProgress: 0, pending: 0, resolvedThisMonth: 0,
          _workMinutes: [] as number[],
        };
        byUser.set(r.userId, entry);
      }
      entry.totalAssigned++;
      if (r.teamRole === "lead") entry.asLead++; else entry.asHelper++;
      if (r.ticketStatus === "open" || r.ticketStatus === "assigned") entry.open++;
      else if (r.ticketStatus === "in_progress") entry.inProgress++;
      else if (r.ticketStatus === "pending") entry.pending++;
      else if ((r.ticketStatus === "resolved" || r.ticketStatus === "closed") && r.resolvedAt && r.resolvedAt >= monthStart) entry.resolvedThisMonth++;
      if (r.checkInAt && r.checkOutAt) {
        const mins = Math.round((new Date(r.checkOutAt).getTime() - new Date(r.checkInAt).getTime()) / 60000);
        if (mins > 0) entry._workMinutes.push(mins);
      }
    }
    return Array.from(byUser.values()).map((e: any) => ({
      userId: e.userId, userName: e.userName, userRole: e.userRole,
      totalAssigned: e.totalAssigned, asLead: e.asLead, asHelper: e.asHelper,
      open: e.open, inProgress: e.inProgress, pending: e.pending,
      resolvedThisMonth: e.resolvedThisMonth,
      avgWorkMinutes: e._workMinutes.length > 0 ? Math.round(e._workMinutes.reduce((a: number, b: number) => a + b, 0) / e._workMinutes.length) : null,
    })).sort((a, b) => b.totalAssigned - a.totalAssigned);
  }

  // ====================  v4.2.17: CSAT (Customer Satisfaction)  ====================

  /** Schedule CSAT survey 24 jam setelah ticket close. Idempotent - kalau sudah ada, no-op. */
  async scheduleCsatForTicket(ticketId: number): Promise<TicketCsat | null> {
    const mitraId = getMitraId();
    const existing = await this.db.select().from(ticketCsat).where(and(eq(ticketCsat.ticketId, ticketId), eq(ticketCsat.mitraId, mitraId)));
    if (existing.length > 0) return existing[0];
    const ticket = await this.getTicket(ticketId);
    if (!ticket || !ticket.customerId) return null;
    // Resolve "lead" teknisi yang close - fallback ke assignedTo
    const team = await this.getTicketTeam(ticketId);
    const lead = team.find(m => m.role === "lead") ?? team[0];
    const resolvedBy = lead?.userId ?? ticket.assignedTo ?? null;

    const token = (await import("crypto")).randomBytes(20).toString("hex");
    const scheduledAt = new Date(Date.now() + 24 * 3600_000).toISOString(); // 24 jam
    const now = new Date().toISOString();
    const csatResult = await this.db.insert(ticketCsat).values({
      ticketId, customerId: ticket.customerId, token,
      scheduledAt, resolvedByUserId: resolvedBy,
      status: "pending", createdAt: now, mitraId,
    } as any);
    const csatInsertId = Number((csatResult[0] as any).insertId);
    const [row] = await this.db.select().from(ticketCsat).where(eq(ticketCsat.id, csatInsertId));
    return row!;
  }

  /** Get CSAT yang siap di-send (status=pending dan scheduledAt sudah lewat). */
  async getDueCsatSurveys(limit = 50): Promise<TicketCsat[]> {
    const mitraId = getMitraId();
    const now = new Date().toISOString();
    return this.db.select().from(ticketCsat)
      .where(and(eq(ticketCsat.status, "pending"), eq(ticketCsat.mitraId, mitraId), sql`scheduled_at <= ${now}`))
      .limit(limit);
  }

  async markCsatSent(id: number): Promise<void> {
    await this.db.update(ticketCsat).set({
      sentAt: new Date().toISOString(), status: "sent",
    } as any).where(eq(ticketCsat.id, id));
  }

  async markCsatFailed(id: number, _err: string): Promise<void> {
    await this.db.update(ticketCsat).set({ status: "failed" } as any).where(eq(ticketCsat.id, id));
  }

  /** Get CSAT by token (public endpoint untuk customer respond).
   * NOTE: public token lookup - no mitra filter; token is globally unique (UUID-like).
   * Caller resolves ticket→mitra context from the returned row if needed. */
  async getCsatByToken(token: string): Promise<TicketCsat | null> {
    const [row] = await this.db.select().from(ticketCsat).where(eq(ticketCsat.token, token));
    return row ?? null;
  }

  async submitCsatResponse(token: string, rating: number, feedback?: string): Promise<TicketCsat | null> {
    // NOTE: public token lookup - no mitra filter; token is globally unique.
    const csat = await this.getCsatByToken(token);
    if (!csat) return null;
    if (csat.status === "responded") return csat; // already responded - idempotent
    await this.db.update(ticketCsat).set({
      rating, feedback: feedback || null,
      respondedAt: new Date().toISOString(), status: "responded",
    } as any).where(eq(ticketCsat.token, token));
    return await this.getCsatByToken(token);
  }

  /** CSAT aggregate per teknisi untuk laporan. */
  async getCsatPerTechnician(fromIso?: string): Promise<Array<{ userId: number; userName: string; totalResponses: number; avgRating: number; positiveCount: number; negativeCount: number }>> {
    const condClause = fromIso
      ? sql`responded_at IS NOT NULL AND responded_at >= ${fromIso}`
      : sql`responded_at IS NOT NULL`;
    const rows: any = ((await this.db.execute(sql`
      SELECT c.resolved_by_user_id as userId, u.name as userName,
             COUNT(*) as total, AVG(c.rating) as avgRating,
             SUM(CASE WHEN c.rating >= 4 THEN 1 ELSE 0 END) as positive,
             SUM(CASE WHEN c.rating <= 2 THEN 1 ELSE 0 END) as negative
      FROM ticket_csat c
      LEFT JOIN users u ON u.id = c.resolved_by_user_id
      WHERE c.resolved_by_user_id IS NOT NULL AND ${condClause}
      GROUP BY c.resolved_by_user_id
    `))[0] as any);
    return (rows ?? []).map((r: any) => ({
      userId: r.userId,
      userName: r.userName ?? `User #${r.userId}`,
      totalResponses: Number(r.total ?? 0),
      avgRating: Math.round(Number(r.avgRating ?? 0) * 10) / 10,
      positiveCount: Number(r.positive ?? 0),
      negativeCount: Number(r.negative ?? 0),
    }));
  }

  // ====================  v4.2.17: SLA Escalation  ====================

  /** Cek tiket aktif yang butuh escalation. Return + level yang perlu trigger. */
  async getTicketsNeedingSlaEscalation(): Promise<Array<{ ticket: Ticket; level: "warning_25pct" | "warning_10pct" | "breached" }>> {
    const mitraId = getMitraId();
    const now = Date.now();
    const result: Array<{ ticket: Ticket; level: any }> = [];
    const active: any = ((await this.db.execute(sql`
      SELECT * FROM tickets
      WHERE mitra_id = ${mitraId}
        AND status IN ('open', 'assigned', 'in_progress', 'pending')
        AND sla_deadline IS NOT NULL
    `))[0] as any);
    for (const t of (active ?? [])) {
      const deadline = new Date(t.sla_deadline).getTime();
      const created = new Date(t.created_at).getTime();
      const totalBudget = deadline - created;
      const remaining = deadline - now;
      const pctRemaining = totalBudget > 0 ? (remaining / totalBudget) * 100 : 0;

      let level: any = null;
      if (remaining < 0) level = "breached";
      else if (pctRemaining <= 10) level = "warning_10pct";
      else if (pctRemaining <= 25) level = "warning_25pct";
      if (!level) continue;

      // Cek udah pernah trigger level ini?
      const [exists] = await this.db.select().from(ticketSlaEscalations)
        .where(and(eq(ticketSlaEscalations.ticketId, t.id), eq(ticketSlaEscalations.level, level), eq(ticketSlaEscalations.mitraId, mitraId)));
      if (exists) continue;

      // Convert raw DB row to Ticket-shaped object
      const ticket: any = {
        id: t.id, ticketNumber: t.ticket_number, title: t.title,
        slaDeadline: t.sla_deadline, customerId: t.customer_id,
        odpId: t.odp_id, status: t.status, priority: t.priority,
        assignedTo: t.assigned_to, createdAt: t.created_at,
      };
      result.push({ ticket, level });
    }
    return result;
  }

  /** Mark escalation triggered supaya ngga di-fire ulang. */
  async recordSlaEscalation(ticketId: number, level: string, notifiedSupervisorIds: number[]): Promise<void> {
    const mitraId = getMitraId();
    await this.db.insert(ticketSlaEscalations).values({
      ticketId, level,
      triggeredAt: new Date().toISOString(),
      notifiedSupervisorIds: JSON.stringify(notifiedSupervisorIds),
      mitraId,
    } as any);
  }

  // ====================  v4.2.17: ODP Repeat Issue Detector  ====================

  /** ODP yang punya ≥3 tiket dalam 30 hari. Untuk heatmap + auto-investigate. */
  async getOdpRepeatIssues(thresholdCount = 3, daysBack = 30): Promise<Array<{ odpId: number; odpName: string; ticketCount: number; activeCount: number; lastTicketAt: string; sampleTitles: string[] }>> {
    const mitraId = getMitraId();
    const cutoff = new Date(Date.now() - daysBack * 86400_000).toISOString();
    const rows: any = ((await this.db.execute(sql`
      SELECT
        t.odp_id as odpId,
        o.name as odpName,
        COUNT(*) as ticketCount,
        SUM(CASE WHEN t.status IN ('open','assigned','in_progress','pending') THEN 1 ELSE 0 END) as activeCount,
        MAX(t.created_at) as lastTicketAt
      FROM tickets t
      INNER JOIN odps o ON o.id = t.odp_id
      WHERE t.mitra_id = ${mitraId} AND t.odp_id IS NOT NULL AND t.created_at >= ${cutoff}
      GROUP BY t.odp_id
      HAVING ticketCount >= ${thresholdCount}
      ORDER BY ticketCount DESC
    `))[0] as any);
    const result = [];
    for (const r of (rows ?? [])) {
      const samples: any = ((await this.db.execute(sql`
        SELECT title FROM tickets WHERE mitra_id = ${mitraId} AND odp_id = ${r.odpId} ORDER BY created_at DESC LIMIT 3
      `))[0] as any);
      result.push({
        odpId: r.odpId, odpName: r.odpName,
        ticketCount: Number(r.ticketCount), activeCount: Number(r.activeCount),
        lastTicketAt: r.lastTicketAt,
        sampleTitles: (samples ?? []).map((s: any) => s.title),
      });
    }
    return result;
  }

  // ====================  v4.2.17: Network Alarms (auto-ticket source)  ====================

  /** Insert alarm baru. Caller boleh pre-set correlation_key untuk grouping. */
  async insertNetworkAlarm(data: Partial<NetworkAlarm>): Promise<NetworkAlarm> {
    const mitraId = getMitraId();
    const result = await this.db.insert(networkAlarms).values({
      source: data.source!, alarmType: data.alarmType!,
      customerId: data.customerId ?? null, odpId: data.odpId ?? null,
      deviceId: data.deviceId ?? null, pppoeUsername: data.pppoeUsername ?? null,
      detail: data.detail ?? null,
      detectedAt: data.detectedAt ?? new Date().toISOString(),
      correlationKey: data.correlationKey ?? null,
      mitraId,
    } as any);
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(networkAlarms).where(eq(networkAlarms.id, insertId));
    return row!;
  }

  /** Cek alarm dengan correlation_key sama yang masih ongoing (resolved_at NULL). */
  async findOngoingAlarmsByKey(key: string): Promise<NetworkAlarm[]> {
    const mitraId = getMitraId();
    return this.db.select().from(networkAlarms)
      .where(and(eq(networkAlarms.correlationKey, key), eq(networkAlarms.mitraId, mitraId), sql`resolved_at IS NULL`));
  }

  /** Resolve alarms (mark resolved_at) - saat OLT report ONT online lagi. */
  async resolveAlarmsByKey(key: string): Promise<number> {
    const now = new Date().toISOString();
    const ongoing = await this.findOngoingAlarmsByKey(key);
    for (const a of ongoing) {
      await this.db.update(networkAlarms).set({ resolvedAt: now } as any).where(eq(networkAlarms.id, a.id));
    }
    return ongoing.length;
  }

  /** Link alarm ke ticket setelah auto-create ticket. */
  async linkAlarmToTicket(alarmId: number, ticketId: number): Promise<void> {
    await this.db.update(networkAlarms).set({ ticketId } as any).where(eq(networkAlarms.id, alarmId));
  }

  // ---- APP SETTINGS ----
  async getSettings(category?: string): Promise<AppSetting[]> {
    if (category) {
      return this.db.select().from(appSettings).where(eq(appSettings.category, category));
    }
    return this.db.select().from(appSettings);
  }
  async getSetting(key: string): Promise<string | null> {
    const rows = await this.db.select().from(appSettings).where(eq(appSettings.key, key));
    return rows[0]?.value ?? null;
  }
  async setSetting(key: string, value: string, category = "general", label?: string): Promise<void> {
    const existing = await this.db.select().from(appSettings).where(eq(appSettings.key, key));
    if (existing.length > 0) {
      await this.db.update(appSettings).set({ value, updatedAt: new Date().toISOString() }).where(eq(appSettings.key, key));
    } else {
      await this.db.insert(appSettings).values({ key, value, category, label, updatedAt: new Date().toISOString() });
    }
  }
  async deleteSetting(key: string): Promise<void> {
    await this.db.delete(appSettings).where(eq(appSettings.key, key));
  }

  // v4.2.18 (C.3): Business hours config helpers
  async getBusinessHoursConfig() {
    const { DEFAULT_BUSINESS_HOURS } = await import("./business-hours.js");
    const raw = await this.getSetting("business_hours_config");
    if (!raw) return DEFAULT_BUSINESS_HOURS;
    try {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_BUSINESS_HOURS, ...parsed };
    } catch {
      return DEFAULT_BUSINESS_HOURS;
    }
  }
  async setBusinessHoursConfig(cfg: any): Promise<void> {
    await this.setSetting("business_hours_config", JSON.stringify(cfg), "tickets", "Business Hours / SLA Calendar");
  }

  // ==================== PUBLIC API KEYS ====================

  async listApiKeys(): Promise<ApiKey[]> {
    const mitraId = getMitraId();
    return this.db.select().from(apiKeys).where(eq(apiKeys.mitraId, mitraId)).orderBy(desc(apiKeys.createdAt));
  }

  async getApiKey(id: number): Promise<ApiKey | null> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(apiKeys).where(and(eq(apiKeys.id, id), eq(apiKeys.mitraId, mitraId)));
    return row ?? null;
  }

  /** Find active key by prefix (used during verification before bcrypt compare).
   *  NOTE: pre-auth lookup - no mitra filter; caller wraps with withMitra after resolving key's mitra. */
  async findApiKeyCandidatesByPrefix(prefix: string): Promise<ApiKey[]> {
    return this.db.select().from(apiKeys).where(and(
      eq(apiKeys.keyPrefix, prefix),
      eq(apiKeys.enabled, 1),
    ));
  }

  async createApiKey(data: {
    name: string;
    keyPrefix: string;
    keyHash: string;
    scopes: string[];
    rateLimit?: number;
    expiresAt?: string | null;
    createdByUserId?: number;
  }): Promise<ApiKey> {
    const mitraId = getMitraId();
    const now = new Date().toISOString();
    const apiKeyResult = await this.db.insert(apiKeys).values({
      mitraId,
      name: data.name,
      keyPrefix: data.keyPrefix,
      keyHash: data.keyHash,
      scopes: JSON.stringify(data.scopes),
      rateLimit: data.rateLimit ?? 60,
      expiresAt: data.expiresAt ?? null,
      createdByUserId: data.createdByUserId ?? null,
      enabled: 1,
      totalRequests: 0,
      createdAt: now,
    } as any);
    const apiKeyInsertId = Number((apiKeyResult[0] as any).insertId);
    const [row] = await this.db.select().from(apiKeys).where(eq(apiKeys.id, apiKeyInsertId));
    return row!;
  }

  async updateApiKey(id: number, data: Partial<{
    name: string;
    scopes: string[];
    rateLimit: number;
    enabled: boolean;
    expiresAt: string | null;
  }>): Promise<ApiKey | null> {
    const mitraId = getMitraId();
    const updates: any = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.scopes !== undefined) updates.scopes = JSON.stringify(data.scopes);
    if (data.rateLimit !== undefined) updates.rateLimit = data.rateLimit;
    if (data.enabled !== undefined) updates.enabled = data.enabled ? 1 : 0;
    if (data.expiresAt !== undefined) updates.expiresAt = data.expiresAt;
    if (Object.keys(updates).length === 0) return this.getApiKey(id);
    await this.db.update(apiKeys).set(updates).where(and(eq(apiKeys.id, id), eq(apiKeys.mitraId, mitraId)));
    return this.getApiKey(id);
  }

  async revokeApiKey(id: number, reason?: string): Promise<void> {
    const mitraId = getMitraId();
    await this.db.update(apiKeys).set({
      enabled: 0,
      revokedAt: new Date().toISOString(),
      revokedReason: reason ?? null,
    } as any).where(and(eq(apiKeys.id, id), eq(apiKeys.mitraId, mitraId)));
  }

  async deleteApiKey(id: number): Promise<void> {
    const mitraId = getMitraId();
    // Hapus usage logs first (FK constraint) - scoped to mitra
    await this.db.delete(apiKeyUsageLogs).where(and(eq(apiKeyUsageLogs.apiKeyId, id), eq(apiKeyUsageLogs.mitraId, mitraId)));
    await this.db.delete(apiKeys).where(and(eq(apiKeys.id, id), eq(apiKeys.mitraId, mitraId)));
  }

  async touchApiKey(id: number, ip: string | null, userAgent: string | null): Promise<void> {
    const mitraId = getMitraId();
    await this.db.update(apiKeys).set({
      lastUsedAt: new Date().toISOString(),
      lastUsedIp: ip,
      lastUsedUserAgent: userAgent,
      totalRequests: sql`${apiKeys.totalRequests} + 1`,
    } as any).where(and(eq(apiKeys.id, id), eq(apiKeys.mitraId, mitraId)));
  }

  async logApiKeyUsage(data: {
    apiKeyId: number;
    endpoint: string;
    method: string;
    statusCode: number;
    responseMs: number;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<void> {
    const mitraId = getMitraIdOrNull() ?? 1;
    try {
      await this.db.insert(apiKeyUsageLogs).values({
        mitraId,
        apiKeyId: data.apiKeyId,
        endpoint: data.endpoint,
        method: data.method,
        statusCode: data.statusCode,
        responseMs: data.responseMs,
        ipAddress: data.ipAddress ?? null,
        userAgent: data.userAgent ?? null,
        createdAt: new Date().toISOString(),
      } as any);
    } catch (e: any) {
      console.warn("[ApiKey] Failed to log usage:", e.message);
    }
  }

  /** Rate limit: count requests in last 60 seconds */
  async countApiKeyRequestsLastMin(apiKeyId: number): Promise<number> {
    const mitraId = getMitraId();
    const since = new Date(Date.now() - 60_000).toISOString();
    const rows: any = ((await this.db.execute(sql`
      SELECT COUNT(*) AS n FROM api_key_usage_logs
      WHERE api_key_id = ${apiKeyId} AND mitra_id = ${mitraId} AND created_at >= ${since}
    `))[0] as any);
    return Number(rows?.[0]?.n ?? 0);
  }

  async getApiKeyRecentLogs(apiKeyId: number, limit = 50): Promise<ApiKeyUsageLog[]> {
    const mitraId = getMitraId();
    return this.db.select().from(apiKeyUsageLogs)
      .where(and(eq(apiKeyUsageLogs.apiKeyId, apiKeyId), eq(apiKeyUsageLogs.mitraId, mitraId)))
      .orderBy(desc(apiKeyUsageLogs.createdAt))
      .limit(limit);
  }

  async cleanupOldApiKeyLogs(olderThanDays: number = 30): Promise<number> {
    // System cleanup - runs across all mitras intentionally (no mitra filter)
    const cutoff = new Date(Date.now() - olderThanDays * 86400_000).toISOString();
    const rows: any = ((await this.db.execute(sql`
      SELECT COUNT(*) AS n FROM api_key_usage_logs WHERE created_at < ${cutoff}
    `))[0] as any);
    const n = Number(rows?.[0]?.n ?? 0);
    if (n > 0) {
      await this.db.execute(sql`DELETE FROM api_key_usage_logs WHERE created_at < ${cutoff}`);
    }
    return n;
  }

  // ==================== DAILY OPS REPORT (for Public API) ====================

  /**
   * Comprehensive daily report untuk external analysis (OpenClaude, BI, dll).
   * Input: date range. Default hari ini.
   * Output: dense JSON dengan summary per-domain.
   */
  async getDailyOpsReport(fromIso: string, toIso: string): Promise<any> {
    const mitraId = getMitraId();
    const rows: any = ((await this.db.execute(sql`
      SELECT
        -- Canvassing reports
        (SELECT COUNT(*) FROM canvassing_logs WHERE mitra_id = ${mitraId} AND created_at >= ${fromIso} AND created_at <= ${toIso}) AS canvassing_reports,
        (SELECT COUNT(*) FROM canvassing_logs WHERE mitra_id = ${mitraId} AND created_at >= ${fromIso} AND created_at <= ${toIso} AND type = 'check_in') AS canvassing_checkins,
        (SELECT COUNT(*) FROM canvassing_logs WHERE mitra_id = ${mitraId} AND created_at >= ${fromIso} AND created_at <= ${toIso} AND type = 'prospect_added') AS canvassing_prospects,
        (SELECT COUNT(*) FROM canvassing_logs WHERE mitra_id = ${mitraId} AND created_at >= ${fromIso} AND created_at <= ${toIso} AND type = 'field_report') AS canvassing_field_reports,

        -- Leads
        (SELECT COUNT(*) FROM leads WHERE mitra_id = ${mitraId} AND created_at >= ${fromIso} AND created_at <= ${toIso}) AS leads_created,
        (SELECT COUNT(*) FROM leads WHERE mitra_id = ${mitraId} AND closed_at >= ${fromIso} AND closed_at <= ${toIso} AND stage = 'won') AS leads_won,
        (SELECT COUNT(*) FROM leads WHERE mitra_id = ${mitraId} AND closed_at >= ${fromIso} AND closed_at <= ${toIso} AND stage = 'lost') AS leads_lost,
        (SELECT COUNT(*) FROM lead_activities WHERE mitra_id = ${mitraId} AND created_at >= ${fromIso} AND created_at <= ${toIso}) AS lead_activities,

        -- Collections
        (SELECT COUNT(*) FROM collections WHERE mitra_id = ${mitraId} AND opened_at >= ${fromIso} AND opened_at <= ${toIso}) AS collections_opened,
        (SELECT COUNT(*) FROM collections WHERE mitra_id = ${mitraId} AND closed_at >= ${fromIso} AND closed_at <= ${toIso} AND close_reason LIKE '%paid%') AS collections_resolved_paid,
        (SELECT COUNT(*) FROM collections WHERE mitra_id = ${mitraId} AND closed_at >= ${fromIso} AND closed_at <= ${toIso} AND close_reason LIKE '%written_off%') AS collections_written_off,
        (SELECT COUNT(*) FROM collection_activities WHERE mitra_id = ${mitraId} AND created_at >= ${fromIso} AND created_at <= ${toIso}) AS collection_activities,
        (SELECT COALESCE(SUM(opened_amount), 0) FROM collections WHERE mitra_id = ${mitraId} AND closed_at >= ${fromIso} AND closed_at <= ${toIso} AND close_reason LIKE '%paid%') AS collections_amount_recovered,

        -- Tickets
        (SELECT COUNT(*) FROM tickets WHERE mitra_id = ${mitraId} AND created_at >= ${fromIso} AND created_at <= ${toIso}) AS tickets_created,
        (SELECT COUNT(*) FROM tickets WHERE mitra_id = ${mitraId} AND resolved_at >= ${fromIso} AND resolved_at <= ${toIso}) AS tickets_resolved,
        (SELECT COUNT(*) FROM tickets WHERE mitra_id = ${mitraId} AND status IN ('open','assigned','in_progress')) AS tickets_open_now,

        -- Payments (from customer last_payment_date)
        (SELECT COUNT(*) FROM customers WHERE mitra_id = ${mitraId} AND last_payment_date >= ${fromIso} AND last_payment_date <= ${toIso}) AS payments_received,
        (SELECT COALESCE(SUM(billing_price), 0) FROM customers WHERE mitra_id = ${mitraId} AND last_payment_date >= ${fromIso} AND last_payment_date <= ${toIso}) AS payments_amount,

        -- Sahabat
        (SELECT COUNT(*) FROM customer_referrals WHERE mitra_id = ${mitraId} AND status = 'rewarded' AND reward_credited_at >= ${fromIso} AND reward_credited_at <= ${toIso}) AS sahabat_referrals_rewarded,
        (SELECT COUNT(*) FROM customer_referrals WHERE mitra_id = ${mitraId} AND created_at >= ${fromIso} AND created_at <= ${toIso}) AS sahabat_invites_created,

        -- Customer base
        (SELECT COUNT(*) FROM customers WHERE mitra_id = ${mitraId} AND status = 'active') AS customers_active,
        (SELECT COUNT(*) FROM customers WHERE mitra_id = ${mitraId} AND is_isolir = 1) AS customers_isolir
    `))[0] as any);

    // Lead stage breakdown
    const leadsByStage: any = ((await this.db.execute(sql`
      SELECT stage, COUNT(*) AS n FROM leads
      WHERE mitra_id = ${mitraId} AND (closed_at IS NULL OR closed_at = '')
      GROUP BY stage
    `))[0] as any);

    // Collection stage breakdown
    const colsByStage: any = ((await this.db.execute(sql`
      SELECT stage, COUNT(*) AS n FROM collections
      WHERE mitra_id = ${mitraId} AND (closed_at IS NULL OR closed_at = '')
      GROUP BY stage
    `))[0] as any);

    // Top performers today (leads + collections activities) - wrap in subquery to avoid HAVING-without-GROUP-BY issue
    // Joined with user_mitras so we only count users assigned to current mitra
    const topStaff: any = ((await this.db.execute(sql`
      SELECT * FROM (
        SELECT u.id, u.name, u.username,
          (SELECT COUNT(*) FROM lead_activities WHERE user_id = u.id AND mitra_id = ${mitraId} AND created_at >= ${fromIso} AND created_at <= ${toIso}) AS lead_acts,
          (SELECT COUNT(*) FROM collection_activities WHERE user_id = u.id AND mitra_id = ${mitraId} AND created_at >= ${fromIso} AND created_at <= ${toIso}) AS col_acts,
          (SELECT COUNT(*) FROM canvassing_logs WHERE user_id = u.id AND mitra_id = ${mitraId} AND created_at >= ${fromIso} AND created_at <= ${toIso}) AS canv_acts
        FROM users u
        INNER JOIN user_mitras um ON um.user_id = u.id AND um.mitra_id = ${mitraId}
        WHERE u.is_active = 1
      ) sub
      WHERE (lead_acts + col_acts + canv_acts) > 0
      ORDER BY (lead_acts + col_acts + canv_acts) DESC
      LIMIT 10
    `))[0] as any);

    const r = rows?.[0] ?? {};
    return {
      range: { from: fromIso, to: toIso },
      generatedAt: new Date().toISOString(),
      canvassing: {
        totalReports: Number(r.canvassing_reports ?? 0),
        checkIns: Number(r.canvassing_checkins ?? 0),
        prospectsAdded: Number(r.canvassing_prospects ?? 0),
        fieldReports: Number(r.canvassing_field_reports ?? 0),
      },
      leads: {
        created: Number(r.leads_created ?? 0),
        won: Number(r.leads_won ?? 0),
        lost: Number(r.leads_lost ?? 0),
        activities: Number(r.lead_activities ?? 0),
        byStageOpen: (leadsByStage ?? []).reduce((acc: any, row: any) => { acc[row.stage] = Number(row.n); return acc; }, {}),
      },
      collections: {
        opened: Number(r.collections_opened ?? 0),
        resolvedPaid: Number(r.collections_resolved_paid ?? 0),
        writtenOff: Number(r.collections_written_off ?? 0),
        activities: Number(r.collection_activities ?? 0),
        amountRecovered: Number(r.collections_amount_recovered ?? 0),
        byStageOpen: (colsByStage ?? []).reduce((acc: any, row: any) => { acc[row.stage] = Number(row.n); return acc; }, {}),
      },
      tickets: {
        created: Number(r.tickets_created ?? 0),
        resolved: Number(r.tickets_resolved ?? 0),
        openNow: Number(r.tickets_open_now ?? 0),
      },
      payments: {
        count: Number(r.payments_received ?? 0),
        totalAmount: Number(r.payments_amount ?? 0),
      },
      sahabat: {
        invitesCreated: Number(r.sahabat_invites_created ?? 0),
        referralsRewarded: Number(r.sahabat_referrals_rewarded ?? 0),
      },
      customerBase: {
        active: Number(r.customers_active ?? 0),
        isolir: Number(r.customers_isolir ?? 0),
      },
      topStaff: (topStaff ?? []).map((s: any) => ({
        id: Number(s.id),
        name: s.name,
        username: s.username,
        activities: {
          leads: Number(s.lead_acts),
          collections: Number(s.col_acts),
          canvassing: Number(s.canv_acts),
          total: Number(s.lead_acts) + Number(s.col_acts) + Number(s.canv_acts),
        },
      })),
    };
  }

  // ================================================================
  // MARKETING DEEP API (untuk OpenClaude / BI)
  // ================================================================

  /** ONE-SHOT overview untuk AI daily analysis - dense, include momentum vs previous period */
  /**
   * Marketing Daily Report - focused, structured per-day report untuk standup tim marketing.
   * Default: hari ini (00:00 - now). Bisa override via fromIso/toIso untuk hari spesifik.
   *
   * Return:
   *  - period: tanggal + label
   *  - summary: KPI ringkas (canvassing, leads, sahabat)
   *  - perStaff: breakdown per-canvasser & per-sales
   *  - hourly: distribusi aktivitas per-jam (heatmap productivity)
   *  - topPerformer: best of the day
   *  - pipeline: snapshot lead pipeline saat ini
   *  - sources: lead by source breakdown
   *  - leaderboard: hari ini vs cumulative bulan ini
   */
  async getMarketingDailyReport(fromIso: string, toIso: string): Promise<any> {
    const reportDate = new Date(fromIso);
    const dateLabel = reportDate.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    // Local date string (not UTC) - biar konsisten dengan label
    const localDateStr = `${reportDate.getFullYear()}-${String(reportDate.getMonth() + 1).padStart(2, "0")}-${String(reportDate.getDate()).padStart(2, "0")}`;
    const monthStart = new Date(reportDate.getFullYear(), reportDate.getMonth(), 1).toISOString();

    // -- Summary KPI hari ini --
    const summaryRow: any = ((await this.db.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM canvassing_sessions WHERE started_at >= ${fromIso} AND started_at <= ${toIso}) AS sessions_today,
        (SELECT COUNT(DISTINCT user_id) FROM canvassing_sessions WHERE started_at >= ${fromIso} AND started_at <= ${toIso}) AS canvassers_active,
        (SELECT COUNT(*) FROM canvassing_logs WHERE created_at >= ${fromIso} AND created_at <= ${toIso}) AS canvassing_reports,
        (SELECT COUNT(*) FROM canvassing_logs WHERE created_at >= ${fromIso} AND created_at <= ${toIso} AND type = 'check_in') AS check_ins,
        (SELECT COUNT(*) FROM canvassing_logs WHERE created_at >= ${fromIso} AND created_at <= ${toIso} AND type = 'prospect_added') AS prospects_added,
        (SELECT COUNT(*) FROM canvassing_logs WHERE created_at >= ${fromIso} AND created_at <= ${toIso} AND type = 'field_report') AS field_reports,
        (SELECT COUNT(*) FROM leads WHERE created_at >= ${fromIso} AND created_at <= ${toIso}) AS leads_created,
        (SELECT COUNT(*) FROM leads WHERE updated_at >= ${fromIso} AND updated_at <= ${toIso} AND stage = 'won' AND (closed_at >= ${fromIso} AND closed_at <= ${toIso})) AS leads_won,
        (SELECT COUNT(*) FROM leads WHERE updated_at >= ${fromIso} AND updated_at <= ${toIso} AND stage = 'lost' AND (closed_at >= ${fromIso} AND closed_at <= ${toIso})) AS leads_lost,
        (SELECT COUNT(*) FROM lead_activities WHERE created_at >= ${fromIso} AND created_at <= ${toIso}) AS lead_activities,
        (SELECT COUNT(*) FROM customer_referrals WHERE created_at >= ${fromIso} AND created_at <= ${toIso}) AS sahabat_invites,
        (SELECT COUNT(*) FROM customer_referrals WHERE reward_credited_at >= ${fromIso} AND reward_credited_at <= ${toIso}) AS sahabat_rewarded,
        -- Cumulative bulan ini (untuk konteks)
        (SELECT COUNT(*) FROM leads WHERE created_at >= ${monthStart} AND created_at <= ${toIso}) AS leads_this_month,
        (SELECT COUNT(*) FROM canvassing_logs WHERE created_at >= ${monthStart} AND created_at <= ${toIso}) AS canvassing_this_month,
        (SELECT COUNT(*) FROM customer_referrals WHERE created_at >= ${monthStart} AND created_at <= ${toIso}) AS sahabat_this_month
    `))[0] as any);
    const s = summaryRow?.[0] ?? {};

    // -- Per-canvasser breakdown today --
    const perCanvasser: any = ((await this.db.execute(sql`
      SELECT
        u.id, u.name, u.username,
        COUNT(DISTINCT s.id) AS sessions,
        COUNT(DISTINCT CASE WHEN s.ended_at IS NULL THEN s.id END) AS active_sessions,
        COALESCE(SUM(CASE WHEN s.ended_at IS NOT NULL AND s.started_at IS NOT NULL
          THEN (julianday(s.ended_at) - julianday(s.started_at)) * 24 END), 0) AS hours_logged,
        COUNT(cl.id) AS reports,
        COUNT(CASE WHEN cl.type = 'check_in' THEN 1 END) AS check_ins,
        COUNT(CASE WHEN cl.type = 'prospect_added' THEN 1 END) AS prospects,
        COUNT(CASE WHEN cl.type = 'field_report' THEN 1 END) AS field_reports
      FROM users u
      LEFT JOIN canvassing_sessions s ON s.user_id = u.id AND s.started_at >= ${fromIso} AND s.started_at <= ${toIso}
      LEFT JOIN canvassing_logs cl ON cl.user_id = u.id AND cl.created_at >= ${fromIso} AND cl.created_at <= ${toIso}
      WHERE u.is_active = 1
      GROUP BY u.id
      HAVING sessions > 0 OR reports > 0
      ORDER BY reports DESC, sessions DESC
    `))[0] as any);

    // -- Per-sales breakdown today --
    const perSales: any = ((await this.db.execute(sql`
      SELECT
        u.id, u.name, u.username,
        COUNT(DISTINCT CASE WHEN l.assigned_to = u.id AND l.updated_at >= ${fromIso} AND l.updated_at <= ${toIso} THEN l.id END) AS leads_handled,
        COUNT(DISTINCT CASE WHEN l.assigned_to = u.id AND l.stage = 'won' AND l.closed_at >= ${fromIso} AND l.closed_at <= ${toIso} THEN l.id END) AS leads_won,
        COUNT(la.id) AS activities,
        COUNT(DISTINCT CASE WHEN la.type = 'call' THEN la.id END) AS calls,
        COUNT(DISTINCT CASE WHEN la.type = 'whatsapp' THEN la.id END) AS whatsapps,
        COUNT(DISTINCT CASE WHEN la.type = 'visit' THEN la.id END) AS visits,
        COUNT(DISTINCT CASE WHEN la.type = 'note' THEN la.id END) AS notes
      FROM users u
      LEFT JOIN leads l ON l.assigned_to = u.id
      LEFT JOIN lead_activities la ON la.user_id = u.id AND la.created_at >= ${fromIso} AND la.created_at <= ${toIso}
      WHERE u.is_active = 1
      GROUP BY u.id
      HAVING activities > 0 OR leads_handled > 0
      ORDER BY leads_won DESC, activities DESC
    `))[0] as any);

    // -- Hourly distribution (productivity heatmap) --
    const hourlyRows: any = ((await this.db.execute(sql`
      SELECT
        CAST(strftime('%H', created_at) AS INTEGER) AS hour,
        COUNT(*) AS activity_count,
        SUM(CASE WHEN tbl = 'canv' THEN 1 ELSE 0 END) AS canvassing,
        SUM(CASE WHEN tbl = 'lead' THEN 1 ELSE 0 END) AS leads
      FROM (
        SELECT created_at, 'canv' AS tbl FROM canvassing_logs WHERE created_at >= ${fromIso} AND created_at <= ${toIso}
        UNION ALL
        SELECT created_at, 'lead' AS tbl FROM lead_activities WHERE created_at >= ${fromIso} AND created_at <= ${toIso}
      )
      GROUP BY hour
      ORDER BY hour
    `))[0] as any);

    // Fill missing hours with 0 (full 24h matrix)
    const hourlyMap: Record<number, any> = {};
    for (const h of (hourlyRows ?? [])) hourlyMap[Number(h.hour)] = h;
    const hourly = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      label: `${String(h).padStart(2, "0")}:00`,
      total: Number(hourlyMap[h]?.activity_count ?? 0),
      canvassing: Number(hourlyMap[h]?.canvassing ?? 0),
      leads: Number(hourlyMap[h]?.leads ?? 0),
    }));

    // -- Lead source breakdown today --
    const leadsBySource: any = ((await this.db.execute(sql`
      SELECT source, COUNT(*) AS n
      FROM leads
      WHERE created_at >= ${fromIso} AND created_at <= ${toIso}
      GROUP BY source
      ORDER BY n DESC
    `))[0] as any);

    // -- Lead pipeline snapshot (current state, not date-bound) --
    const pipelineRows: any = ((await this.db.execute(sql`
      SELECT stage, COUNT(*) AS n FROM leads
      WHERE closed_at IS NULL OR closed_at = ''
      GROUP BY stage
    `))[0] as any);
    const pipeline: Record<string, number> = {};
    for (const r of (pipelineRows ?? [])) pipeline[r.stage] = Number(r.n);

    // -- Top performer (highest combined activity) --
    let topPerformer: any = null;
    const allStaff = [
      ...((perCanvasser ?? []).map((s: any) => ({ ...s, role: "canvasser", score: Number(s.reports) + Number(s.sessions) * 2 }))),
      ...((perSales ?? []).map((s: any) => ({ ...s, role: "sales", score: Number(s.activities) + Number(s.leads_won) * 5 }))),
    ];
    if (allStaff.length > 0) {
      allStaff.sort((a, b) => b.score - a.score);
      topPerformer = allStaff[0];
    }

    // -- Coverage: districts dengan aktivitas hari ini --
    const districts: any = ((await this.db.execute(sql`
      SELECT COALESCE(NULLIF(district, ''), '(belum diisi)') AS district, COUNT(*) AS leads
      FROM leads WHERE created_at >= ${fromIso} AND created_at <= ${toIso}
      GROUP BY district
      ORDER BY leads DESC
    `))[0] as any);

    const leadsCreated = Number(s.leads_created ?? 0);
    const leadsWon = Number(s.leads_won ?? 0);
    const leadsLost = Number(s.leads_lost ?? 0);
    const conversionRate = (leadsWon + leadsLost) > 0 ? Math.round((leadsWon / (leadsWon + leadsLost)) * 100) : 0;

    return {
      period: {
        from: fromIso,
        to: toIso,
        date: localDateStr,
        label: dateLabel,
      },
      generatedAt: new Date().toISOString(),
      summary: {
        canvassing: {
          activeCanvassers: Number(s.canvassers_active ?? 0),
          sessionsToday: Number(s.sessions_today ?? 0),
          totalReports: Number(s.canvassing_reports ?? 0),
          checkIns: Number(s.check_ins ?? 0),
          prospectsAdded: Number(s.prospects_added ?? 0),
          fieldReports: Number(s.field_reports ?? 0),
        },
        leads: {
          createdToday: leadsCreated,
          wonToday: leadsWon,
          lostToday: leadsLost,
          activitiesToday: Number(s.lead_activities ?? 0),
          conversionRatePct: conversionRate,
        },
        sahabat: {
          invitesToday: Number(s.sahabat_invites ?? 0),
          referralsRewardedToday: Number(s.sahabat_rewarded ?? 0),
        },
        cumulativeMonth: {
          leadsCreated: Number(s.leads_this_month ?? 0),
          canvassingReports: Number(s.canvassing_this_month ?? 0),
          sahabatInvites: Number(s.sahabat_this_month ?? 0),
        },
      },
      topPerformer,
      perCanvasser: (perCanvasser ?? []).map((c: any) => ({
        userId: c.id,
        name: c.name,
        username: c.username,
        sessions: Number(c.sessions),
        activeSessions: Number(c.active_sessions),
        hoursLogged: Number(Number(c.hours_logged ?? 0).toFixed(1)),
        totalReports: Number(c.reports),
        checkIns: Number(c.check_ins),
        prospectsAdded: Number(c.prospects),
        fieldReports: Number(c.field_reports),
      })),
      perSales: (perSales ?? []).map((s: any) => ({
        userId: s.id,
        name: s.name,
        username: s.username,
        leadsHandled: Number(s.leads_handled),
        leadsWon: Number(s.leads_won),
        activities: Number(s.activities),
        breakdown: {
          calls: Number(s.calls),
          whatsapps: Number(s.whatsapps),
          visits: Number(s.visits),
          notes: Number(s.notes),
        },
      })),
      hourly,
      leadsBySource: (leadsBySource ?? []).map((l: any) => ({ source: l.source, count: Number(l.n) })),
      pipeline: {
        new: pipeline.new ?? 0,
        contacted: pipeline.contacted ?? 0,
        interested: pipeline.interested ?? 0,
        negotiation: pipeline.negotiation ?? 0,
        won: pipeline.won ?? 0,
        total: Object.values(pipeline).reduce((a, b) => a + (b as number), 0),
      },
      coverage: (districts ?? []).map((d: any) => ({ district: d.district, leads: Number(d.leads) })),
    };
  }

  async getMarketingOverview(fromIso: string, toIso: string): Promise<any> {
    // Previous period dengan durasi sama (untuk momentum)
    const durationMs = new Date(toIso).getTime() - new Date(fromIso).getTime();
    const prevTo = new Date(new Date(fromIso).getTime() - 1).toISOString();
    const prevFrom = new Date(new Date(fromIso).getTime() - 1 - durationMs).toISOString();

    const curr = await this._marketingPeriodStats(fromIso, toIso);
    const prev = await this._marketingPeriodStats(prevFrom, prevTo);

    // Hot spots: district dengan aktivitas tertinggi
    const hotSpots: any = ((await this.db.execute(sql`
      SELECT COALESCE(district, '(belum diisi)') AS district,
        COUNT(*) AS leads_created
      FROM leads
      WHERE created_at >= ${fromIso} AND created_at <= ${toIso}
      GROUP BY district
      ORDER BY leads_created DESC
      LIMIT 5
    `))[0] as any);

    // Top canvassers
    const topCanvassers: any = ((await this.db.execute(sql`
      SELECT u.id, u.name, u.username,
        COUNT(DISTINCT s.id) AS sessions,
        COUNT(cl.id) AS reports,
        COUNT(DISTINCT CASE WHEN cl.type = 'prospect_added' THEN cl.id END) AS prospects_logged
      FROM users u
      LEFT JOIN canvassing_sessions s ON s.user_id = u.id AND s.started_at >= ${fromIso} AND s.started_at <= ${toIso}
      LEFT JOIN canvassing_logs cl ON cl.user_id = u.id AND cl.created_at >= ${fromIso} AND cl.created_at <= ${toIso}
      WHERE u.is_active = 1
      GROUP BY u.id
      HAVING sessions + reports > 0
      ORDER BY reports DESC
      LIMIT 5
    `))[0] as any);

    // Top sales (leads assigned + converted)
    const topSales: any = ((await this.db.execute(sql`
      SELECT u.id, u.name, u.username,
        COUNT(l.id) AS leads_assigned,
        COUNT(CASE WHEN l.stage = 'won' AND l.closed_at >= ${fromIso} AND l.closed_at <= ${toIso} THEN 1 END) AS leads_won,
        COUNT(la.id) AS activities
      FROM users u
      LEFT JOIN leads l ON l.assigned_to = u.id AND l.updated_at >= ${fromIso} AND l.updated_at <= ${toIso}
      LEFT JOIN lead_activities la ON la.user_id = u.id AND la.created_at >= ${fromIso} AND la.created_at <= ${toIso}
      WHERE u.is_active = 1
      GROUP BY u.id
      HAVING activities > 0 OR leads_assigned > 0
      ORDER BY leads_won DESC, activities DESC
      LIMIT 5
    `))[0] as any);

    // Red flags - rule-based insights untuk AI
    const redFlags: string[] = [];
    const greens: string[] = [];
    const pct = (a: number, b: number) => b > 0 ? ((a - b) / b * 100) : (a > 0 ? 100 : 0);

    const leadTrendPct = pct(curr.leadsCreated, prev.leadsCreated);
    const canvTrendPct = pct(curr.canvassingReports, prev.canvassingReports);
    const convTrendPct = pct(curr.leadsWon, prev.leadsWon);
    const prospectTrendPct = pct(curr.prospectsAdded, prev.prospectsAdded);
    const referralTrendPct = pct(curr.sahabatInvitesCreated, prev.sahabatInvitesCreated);

    if (curr.canvassingReports === 0 && durationMs < 2 * 86400_000) redFlags.push("TIDAK ADA aktivitas canvassing hari ini");
    else if (canvTrendPct < -25) redFlags.push(`Aktivitas canvassing turun ${Math.abs(canvTrendPct).toFixed(0)}% vs periode sebelumnya`);

    if (curr.leadsCreated === 0 && durationMs < 2 * 86400_000) redFlags.push("TIDAK ADA lead baru hari ini");
    else if (leadTrendPct < -30) redFlags.push(`Leads baru turun ${Math.abs(leadTrendPct).toFixed(0)}% vs periode sebelumnya`);

    if (curr.leadsConversionRate < 10 && curr.leadsWon + curr.leadsLost > 3) {
      redFlags.push(`Conversion rate rendah: ${curr.leadsConversionRate.toFixed(1)}%`);
    }
    if (curr.avgLeadAgeDays > 14) redFlags.push(`Lead aging: rata-rata ${curr.avgLeadAgeDays.toFixed(0)} hari di pipeline (idealnya <10)`);

    if (leadTrendPct > 25) greens.push(`Leads baru naik ${leadTrendPct.toFixed(0)}% - momentum bagus`);
    if (convTrendPct > 50) greens.push(`Conversion meningkat ${convTrendPct.toFixed(0)}%`);
    if (referralTrendPct > 50) greens.push(`Program Sahabat ramai: invite naik ${referralTrendPct.toFixed(0)}%`);

    return {
      range: { from: fromIso, to: toIso, durationHours: Math.round(durationMs / 3600_000) },
      previous: { from: prevFrom, to: prevTo },
      generatedAt: new Date().toISOString(),

      current: curr,
      previousPeriod: prev,
      momentum: {
        leadsCreatedPct: +leadTrendPct.toFixed(1),
        canvassingReportsPct: +canvTrendPct.toFixed(1),
        leadsWonPct: +convTrendPct.toFixed(1),
        prospectsAddedPct: +prospectTrendPct.toFixed(1),
        sahabatInvitesPct: +referralTrendPct.toFixed(1),
      },

      hotSpots: (hotSpots ?? []).map((h: any) => ({
        district: h.district,
        leadsCreated: Number(h.leads_created),
      })),
      topCanvassers: (topCanvassers ?? []).map((t: any) => ({
        userId: Number(t.id), name: t.name, username: t.username,
        sessions: Number(t.sessions), reports: Number(t.reports),
        prospectsLogged: Number(t.prospects_logged),
      })),
      topSales: (topSales ?? []).map((t: any) => ({
        userId: Number(t.id), name: t.name, username: t.username,
        leadsAssigned: Number(t.leads_assigned),
        leadsWon: Number(t.leads_won),
        activities: Number(t.activities),
      })),

      insights: {
        redFlags,
        greenLights: greens,
        summary: `Period: ${curr.leadsCreated} leads baru, ${curr.canvassingReports} canvassing reports, ${curr.leadsWon} won (${curr.leadsConversionRate.toFixed(1)}% conversion). Momentum leads: ${leadTrendPct >= 0 ? "+" : ""}${leadTrendPct.toFixed(0)}% vs periode sebelumnya.`,
      },
    };
  }

  private async _marketingPeriodStats(fromIso: string, toIso: string): Promise<any> {
    const rows: any = ((await this.db.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM canvassing_sessions WHERE started_at >= ${fromIso} AND started_at <= ${toIso}) AS canvassing_sessions_started,
        (SELECT COUNT(*) FROM canvassing_sessions WHERE started_at >= ${fromIso} AND started_at <= ${toIso} AND status = 'active') AS canvassing_sessions_active,
        (SELECT COUNT(*) FROM canvassing_logs WHERE created_at >= ${fromIso} AND created_at <= ${toIso}) AS canvassing_reports,
        (SELECT COUNT(*) FROM canvassing_logs WHERE created_at >= ${fromIso} AND created_at <= ${toIso} AND severity = 'critical') AS canvassing_critical_reports,
        (SELECT COUNT(*) FROM prospects WHERE created_at >= ${fromIso} AND created_at <= ${toIso}) AS prospects_added,
        (SELECT COUNT(*) FROM leads WHERE created_at >= ${fromIso} AND created_at <= ${toIso}) AS leads_created,
        (SELECT COUNT(*) FROM leads WHERE closed_at >= ${fromIso} AND closed_at <= ${toIso} AND stage = 'won') AS leads_won,
        (SELECT COUNT(*) FROM leads WHERE closed_at >= ${fromIso} AND closed_at <= ${toIso} AND stage = 'lost') AS leads_lost,
        (SELECT COUNT(*) FROM lead_activities WHERE created_at >= ${fromIso} AND created_at <= ${toIso}) AS lead_activities,
        (SELECT COUNT(*) FROM customer_referrals WHERE created_at >= ${fromIso} AND created_at <= ${toIso}) AS sahabat_invites_created,
        (SELECT COUNT(*) FROM customer_referrals WHERE reward_credited_at >= ${fromIso} AND reward_credited_at <= ${toIso}) AS sahabat_referrals_rewarded,
        (SELECT COALESCE(AVG(julianday('now') - julianday(created_at)), 0) FROM leads WHERE closed_at IS NULL OR closed_at = '') AS avg_lead_age_days
    `))[0] as any);
    const r = rows?.[0] ?? {};
    const won = Number(r.leads_won ?? 0);
    const lost = Number(r.leads_lost ?? 0);
    return {
      canvassingSessionsStarted: Number(r.canvassing_sessions_started ?? 0),
      canvassingSessionsActive: Number(r.canvassing_sessions_active ?? 0),
      canvassingReports: Number(r.canvassing_reports ?? 0),
      canvassingCriticalReports: Number(r.canvassing_critical_reports ?? 0),
      prospectsAdded: Number(r.prospects_added ?? 0),
      leadsCreated: Number(r.leads_created ?? 0),
      leadsWon: won,
      leadsLost: lost,
      leadActivities: Number(r.lead_activities ?? 0),
      leadsConversionRate: won + lost > 0 ? +(won / (won + lost) * 100).toFixed(2) : 0,
      avgLeadAgeDays: +(Number(r.avg_lead_age_days ?? 0)).toFixed(1),
      sahabatInvitesCreated: Number(r.sahabat_invites_created ?? 0),
      sahabatReferralsRewarded: Number(r.sahabat_referrals_rewarded ?? 0),
    };
  }

  /** Canvassing sessions stats - aktif + rekap today/week */
  async getCanvassingSessionsStats(fromIso: string, toIso: string): Promise<any> {
    const active: any = ((await this.db.execute(sql`
      SELECT s.id, s.user_id AS userId, u.name AS userName, s.name, s.area_description AS areaDescription,
        s.started_at AS startedAt, s.center_lat AS centerLat, s.center_lng AS centerLng,
        s.lead_count AS leadCount, s.status,
        (julianday('now') - julianday(s.started_at)) * 1440 AS durationMinutes,
        (SELECT COUNT(*) FROM canvassing_logs WHERE session_id = s.id) AS reports
      FROM canvassing_sessions s
      LEFT JOIN users u ON u.id = s.user_id
      WHERE s.status = 'active'
      ORDER BY s.started_at DESC
    `))[0] as any);

    const range: any = ((await this.db.execute(sql`
      SELECT s.id, s.user_id AS userId, u.name AS userName, s.name, s.area_description AS areaDescription,
        s.started_at AS startedAt, s.ended_at AS endedAt, s.status, s.lead_count AS leadCount,
        COALESCE((julianday(COALESCE(s.ended_at, 'now')) - julianday(s.started_at)) * 1440, 0) AS durationMinutes,
        (SELECT COUNT(*) FROM canvassing_logs WHERE session_id = s.id) AS reports,
        (SELECT COUNT(*) FROM canvassing_logs WHERE session_id = s.id AND type = 'prospect_added') AS prospects,
        (SELECT COUNT(*) FROM canvassing_logs WHERE session_id = s.id AND type = 'check_in') AS checkIns
      FROM canvassing_sessions s
      LEFT JOIN users u ON u.id = s.user_id
      WHERE s.started_at >= ${fromIso} AND s.started_at <= ${toIso}
      ORDER BY s.started_at DESC
      LIMIT 100
    `))[0] as any);

    const perCanvasser: any = ((await this.db.execute(sql`
      SELECT u.id, u.name, u.username,
        COUNT(DISTINCT s.id) AS sessions,
        ROUND(COALESCE(SUM((julianday(COALESCE(s.ended_at, 'now')) - julianday(s.started_at)) * 1440), 0), 0) AS totalDurationMin,
        COUNT(cl.id) AS reports,
        SUM(CASE WHEN cl.type = 'check_in' THEN 1 ELSE 0 END) AS checkIns,
        SUM(CASE WHEN cl.type = 'prospect_added' THEN 1 ELSE 0 END) AS prospects,
        SUM(CASE WHEN cl.type NOT IN ('check_in', 'prospect_added') THEN 1 ELSE 0 END) AS fieldReports,
        SUM(CASE WHEN cl.severity = 'critical' THEN 1 ELSE 0 END) AS criticalReports
      FROM users u
      LEFT JOIN canvassing_sessions s ON s.user_id = u.id AND s.started_at >= ${fromIso} AND s.started_at <= ${toIso}
      LEFT JOIN canvassing_logs cl ON cl.session_id = s.id
      WHERE u.is_active = 1
      GROUP BY u.id
      HAVING sessions > 0 OR reports > 0
      ORDER BY reports DESC
    `))[0] as any);

    return {
      range: { from: fromIso, to: toIso },
      active: (active ?? []).map((a: any) => ({ ...a, durationMinutes: Math.round(Number(a.durationMinutes)), reports: Number(a.reports) })),
      sessionsInRange: (range ?? []).map((s: any) => ({
        id: Number(s.id), userId: Number(s.userId), userName: s.userName, name: s.name,
        areaDescription: s.areaDescription, startedAt: s.startedAt, endedAt: s.endedAt,
        status: s.status, leadCount: Number(s.leadCount),
        durationMinutes: Math.round(Number(s.durationMinutes)),
        reports: Number(s.reports), prospects: Number(s.prospects), checkIns: Number(s.checkIns),
      })),
      perCanvasser: (perCanvasser ?? []).map((p: any) => ({
        userId: Number(p.id), name: p.name, username: p.username,
        sessions: Number(p.sessions),
        totalDurationMinutes: Number(p.totalDurationMin),
        reports: Number(p.reports),
        checkIns: Number(p.checkIns),
        prospectsLogged: Number(p.prospects),
        fieldReports: Number(p.fieldReports),
        criticalReports: Number(p.criticalReports),
      })),
    };
  }

  /** Leads funnel: per-stage velocity + drop-off + top loss reasons */
  async getLeadsFunnel(fromIso: string, toIso: string): Promise<any> {
    const stages = ["new", "contacted", "interested", "negotiation", "won", "lost"];
    const byStage: Record<string, any> = {};

    // Count per stage (saat ini, open + closed dalam range)
    for (const st of stages) {
      const rows: any = ((await this.db.execute(sql`
        SELECT
          COUNT(*) AS count,
          COALESCE(AVG(julianday(COALESCE(closed_at, 'now')) - julianday(created_at)), 0) AS avg_days_in_pipeline
        FROM leads
        WHERE stage = ${st}
          AND created_at >= ${fromIso} AND created_at <= ${toIso}
      `))[0] as any);
      byStage[st] = {
        count: Number(rows?.[0]?.count ?? 0),
        avgDaysInPipeline: +(Number(rows?.[0]?.avg_days_in_pipeline ?? 0)).toFixed(1),
      };
    }

    // Drop-off: berapa banyak lead yang pernah contacted tapi stuck
    const totalCreated = Object.values(byStage).reduce((sum: number, s: any) => sum + s.count, 0);
    const won = byStage.won.count;
    const lost = byStage.lost.count;
    const open = totalCreated - won - lost;

    // Top loss reasons
    const lossReasons: any = ((await this.db.execute(sql`
      SELECT COALESCE(loss_reason, '(tidak diisi)') AS reason, COUNT(*) AS n
      FROM leads
      WHERE stage = 'lost' AND closed_at >= ${fromIso} AND closed_at <= ${toIso}
      GROUP BY reason
      ORDER BY n DESC
      LIMIT 10
    `))[0] as any);

    // Avg time from new → won
    const avgTimeToWin: any = ((await this.db.execute(sql`
      SELECT AVG(julianday(closed_at) - julianday(created_at)) AS avg_days
      FROM leads
      WHERE stage = 'won' AND closed_at >= ${fromIso} AND closed_at <= ${toIso}
    `))[0] as any);

    return {
      range: { from: fromIso, to: toIso },
      byStage,
      funnel: {
        totalInRange: totalCreated,
        open,
        won,
        lost,
        conversionRate: won + lost > 0 ? +(won / (won + lost) * 100).toFixed(2) : 0,
        avgDaysToWin: +(Number(avgTimeToWin?.[0]?.avg_days ?? 0)).toFixed(1),
      },
      topLossReasons: (lossReasons ?? []).map((l: any) => ({ reason: l.reason, count: Number(l.n) })),
    };
  }

  /** Leads attribution - source breakdown + conversion per source */
  async getLeadsAttribution(fromIso: string, toIso: string): Promise<any> {
    const bySource: any = ((await this.db.execute(sql`
      SELECT source,
        COUNT(*) AS total,
        SUM(CASE WHEN stage = 'won' THEN 1 ELSE 0 END) AS won,
        SUM(CASE WHEN stage = 'lost' THEN 1 ELSE 0 END) AS lost,
        SUM(CASE WHEN stage NOT IN ('won','lost') THEN 1 ELSE 0 END) AS open
      FROM leads
      WHERE created_at >= ${fromIso} AND created_at <= ${toIso}
      GROUP BY source
    `))[0] as any);

    return {
      range: { from: fromIso, to: toIso },
      bySource: (bySource ?? []).map((s: any) => {
        const won = Number(s.won), lost = Number(s.lost);
        return {
          source: s.source,
          total: Number(s.total),
          won, lost, open: Number(s.open),
          conversionRate: won + lost > 0 ? +(won / (won + lost) * 100).toFixed(2) : 0,
        };
      }),
    };
  }

  /** Per-staff marketing scorecard */
  async getLeadsPerformance(fromIso: string, toIso: string): Promise<any> {
    const rows: any = ((await this.db.execute(sql`
      SELECT u.id, u.name, u.username,
        COUNT(DISTINCT CASE WHEN l.assigned_at >= ${fromIso} AND l.assigned_at <= ${toIso} THEN l.id END) AS leads_assigned_in_range,
        COUNT(DISTINCT CASE WHEN l.assigned_to = u.id AND (l.closed_at IS NULL OR l.closed_at = '') THEN l.id END) AS leads_open_now,
        COUNT(DISTINCT CASE WHEN l.assigned_to = u.id AND l.stage = 'won' AND l.closed_at >= ${fromIso} AND l.closed_at <= ${toIso} THEN l.id END) AS leads_won,
        COUNT(DISTINCT CASE WHEN l.assigned_to = u.id AND l.stage = 'lost' AND l.closed_at >= ${fromIso} AND l.closed_at <= ${toIso} THEN l.id END) AS leads_lost,
        COUNT(la.id) AS activities,
        SUM(CASE WHEN la.type = 'call' THEN 1 ELSE 0 END) AS calls,
        SUM(CASE WHEN la.type = 'whatsapp' THEN 1 ELSE 0 END) AS whatsapps,
        SUM(CASE WHEN la.type = 'visit' THEN 1 ELSE 0 END) AS visits,
        SUM(CASE WHEN la.type = 'stage_change' THEN 1 ELSE 0 END) AS stage_changes
      FROM users u
      LEFT JOIN leads l ON l.assigned_to = u.id
      LEFT JOIN lead_activities la ON la.user_id = u.id AND la.created_at >= ${fromIso} AND la.created_at <= ${toIso}
      WHERE u.is_active = 1
      GROUP BY u.id
      HAVING leads_assigned_in_range > 0 OR leads_open_now > 0 OR activities > 0
      ORDER BY leads_won DESC, activities DESC
    `))[0] as any);

    return {
      range: { from: fromIso, to: toIso },
      staff: (rows ?? []).map((r: any) => {
        const won = Number(r.leads_won), lost = Number(r.leads_lost);
        return {
          userId: Number(r.id), name: r.name, username: r.username,
          leadsAssignedInRange: Number(r.leads_assigned_in_range),
          leadsOpenNow: Number(r.leads_open_now),
          leadsWon: won, leadsLost: lost,
          conversionRate: won + lost > 0 ? +(won / (won + lost) * 100).toFixed(2) : 0,
          activities: {
            total: Number(r.activities),
            calls: Number(r.calls),
            whatsapps: Number(r.whatsapps),
            visits: Number(r.visits),
            stageChanges: Number(r.stage_changes),
          },
        };
      }),
    };
  }

  /** Coverage per district - penetration analysis
   *  Note: canvassing_logs tidak punya district column, jadi kita pakai leads.district
   *  sebagai proxy "activity" (karena lead dari canvassing juga simpan district). */
  async getMarketingCoverage(fromIso: string, toIso: string): Promise<any> {
    // Full coverage matrix per district
    const matrix: any = ((await this.db.execute(sql`
      SELECT c.district,
        (SELECT COUNT(*) FROM leads WHERE district = c.district AND created_at >= ${fromIso} AND created_at <= ${toIso}) AS leads_created,
        (SELECT COUNT(*) FROM leads WHERE district = c.district AND stage = 'won' AND closed_at >= ${fromIso} AND closed_at <= ${toIso}) AS leads_won,
        (SELECT COUNT(*) FROM leads WHERE district = c.district AND stage = 'lost' AND closed_at >= ${fromIso} AND closed_at <= ${toIso}) AS leads_lost,
        (SELECT COUNT(*) FROM leads WHERE district = c.district AND (closed_at IS NULL OR closed_at = '')) AS leads_open_now,
        (SELECT COUNT(DISTINCT l.canvassing_session_id) FROM leads l WHERE l.district = c.district AND l.canvassing_session_id IS NOT NULL AND l.created_at >= ${fromIso} AND l.created_at <= ${toIso}) AS canvassing_sessions_in_area,
        (SELECT COUNT(*) FROM customers WHERE district = c.district AND status = 'active') AS active_customers,
        (SELECT COUNT(*) FROM customers WHERE district = c.district) AS total_customers_ever
      FROM customers c
      WHERE c.district IS NOT NULL AND c.district != ''
      GROUP BY c.district
      ORDER BY active_customers DESC
    `))[0] as any);

    return {
      range: { from: fromIso, to: toIso },
      note: "canvassingSessionsInArea = unique canvassing sessions yang menghasilkan leads di district ini",
      byDistrict: (matrix ?? []).map((m: any) => {
        const won = Number(m.leads_won ?? 0);
        const lost = Number(m.leads_lost ?? 0);
        return {
          district: m.district,
          canvassingSessionsInArea: Number(m.canvassing_sessions_in_area ?? 0),
          leadsCreated: Number(m.leads_created ?? 0),
          leadsWon: won,
          leadsLost: lost,
          leadsOpenNow: Number(m.leads_open_now ?? 0),
          conversionRate: won + lost > 0 ? +(won / (won + lost) * 100).toFixed(2) : 0,
          activeCustomers: Number(m.active_customers ?? 0),
          totalCustomersEver: Number(m.total_customers_ever ?? 0),
        };
      }),
    };
  }

  /** Prospects database filtered */
  async getProspectsList(filters: { category?: string; district?: string; hasOdp?: boolean; limit: number; offset: number }): Promise<any> {
    const categoryFilter = filters.category
      ? sql`AND p.category = ${filters.category}`
      : sql``;
    const odpFilter = filters.hasOdp === true ? sql`AND p.odp_id IS NOT NULL`
      : filters.hasOdp === false ? sql`AND p.odp_id IS NULL`
      : sql``;

    const allRows: any = ((await this.db.execute(sql`
      SELECT p.*, o.name AS odp_name FROM prospects p
      LEFT JOIN odps o ON o.id = p.odp_id
      WHERE 1=1 ${categoryFilter} ${odpFilter}
      ORDER BY p.created_at DESC
    `))[0] as any);

    const total = allRows.length;
    const page = allRows.slice(filters.offset, filters.offset + filters.limit);

    return {
      pagination: { limit: filters.limit, offset: filters.offset, total },
      data: page.map((p: any) => ({
        id: p.id, placeId: p.placeId ?? p.place_id,
        name: p.name, address: p.address, category: p.category,
        lat: p.lat, lng: p.lng,
        hasPhone: !!p.phone,
        odpId: p.odpId ?? p.odp_id, odpName: p.odp_name,
        distanceMeters: p.distanceMeters ?? p.distance_meters,
        createdAt: p.createdAt ?? p.created_at,
      })),
    };
  }

  /** Prospect stats: by category, district, distance bucket */
  async getProspectsStats(): Promise<any> {
    const byCategory: any = ((await this.db.execute(sql`
      SELECT COALESCE(category, '(tidak diisi)') AS category, COUNT(*) AS n
      FROM prospects GROUP BY category ORDER BY n DESC
    `))[0] as any);
    const byOdpStatus: any = ((await this.db.execute(sql`
      SELECT
        SUM(CASE WHEN odp_id IS NOT NULL THEN 1 ELSE 0 END) AS with_odp,
        SUM(CASE WHEN odp_id IS NULL THEN 1 ELSE 0 END) AS without_odp,
        COUNT(*) AS total
      FROM prospects
    `))[0] as any);
    const byDistance: any = ((await this.db.execute(sql`
      SELECT
        SUM(CASE WHEN distance_meters IS NULL THEN 1 ELSE 0 END) AS no_distance,
        SUM(CASE WHEN distance_meters <= 50 THEN 1 ELSE 0 END) AS within_50m,
        SUM(CASE WHEN distance_meters > 50 AND distance_meters <= 150 THEN 1 ELSE 0 END) AS within_150m,
        SUM(CASE WHEN distance_meters > 150 AND distance_meters <= 400 THEN 1 ELSE 0 END) AS within_400m,
        SUM(CASE WHEN distance_meters > 400 THEN 1 ELSE 0 END) AS over_400m
      FROM prospects
    `))[0] as any);
    const r = byOdpStatus?.[0] ?? {};
    const d = byDistance?.[0] ?? {};
    return {
      total: Number(r.total ?? 0),
      byCategory: (byCategory ?? []).map((c: any) => ({ category: c.category, count: Number(c.n) })),
      byOdpStatus: {
        withOdp: Number(r.with_odp ?? 0),
        withoutOdp: Number(r.without_odp ?? 0),
        coveragePct: r.total > 0 ? +((r.with_odp / r.total) * 100).toFixed(1) : 0,
      },
      byDistance: {
        within50m: Number(d.within_50m ?? 0),
        within150m: Number(d.within_150m ?? 0),
        within400m: Number(d.within_400m ?? 0),
        over400m: Number(d.over_400m ?? 0),
        noDistance: Number(d.no_distance ?? 0),
      },
    };
  }

  /** Sahabat referral funnel - invited → registered → rewarded */
  async getSahabatFunnel(fromIso: string, toIso: string): Promise<any> {
    const rows: any = ((await this.db.execute(sql`
      SELECT
        COUNT(*) AS total_invited,
        SUM(CASE WHEN status = 'registered' OR status = 'rewarded' THEN 1 ELSE 0 END) AS registered,
        SUM(CASE WHEN status = 'rewarded' THEN 1 ELSE 0 END) AS rewarded,
        SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) AS expired,
        SUM(CASE WHEN status = 'invited' THEN 1 ELSE 0 END) AS still_invited
      FROM customer_referrals
      WHERE created_at >= ${fromIso} AND created_at <= ${toIso}
    `))[0] as any);
    const r = rows?.[0] ?? {};
    const total = Number(r.total_invited ?? 0);
    const reg = Number(r.registered ?? 0);
    const rew = Number(r.rewarded ?? 0);

    // Top referrers in range
    const topRef: any = ((await this.db.execute(sql`
      SELECT cr.referrer_customer_id, c.name, c.customer_id AS billingId,
        COUNT(cr.id) AS invites,
        SUM(CASE WHEN cr.status = 'rewarded' THEN 1 ELSE 0 END) AS rewarded,
        cl.sahabat_code, cl.sahabat_level, cl.total_successful_referrals
      FROM customer_referrals cr
      LEFT JOIN customers c ON c.id = cr.referrer_customer_id
      LEFT JOIN customer_loyalty cl ON cl.customer_id = cr.referrer_customer_id
      WHERE cr.created_at >= ${fromIso} AND cr.created_at <= ${toIso}
      GROUP BY cr.referrer_customer_id
      ORDER BY invites DESC
      LIMIT 10
    `))[0] as any);

    return {
      range: { from: fromIso, to: toIso },
      funnel: {
        invited: total,
        registered: reg,
        rewarded: rew,
        expired: Number(r.expired ?? 0),
        stillPending: Number(r.still_invited ?? 0),
        invitedToRegisteredRate: total > 0 ? +((reg / total) * 100).toFixed(2) : 0,
        registeredToRewardedRate: reg > 0 ? +((rew / reg) * 100).toFixed(2) : 0,
        overallConversionRate: total > 0 ? +((rew / total) * 100).toFixed(2) : 0,
      },
      topReferrersInRange: (topRef ?? []).map((t: any) => ({
        customerId: Number(t.referrer_customer_id),
        name: t.name,
        billingId: t.billingId,
        sahabatCode: t.sahabat_code,
        sahabatLevel: t.sahabat_level,
        invitesInRange: Number(t.invites),
        rewardedInRange: Number(t.rewarded),
        totalLifetimeReferrals: Number(t.total_successful_referrals ?? 0),
      })),
    };
  }

  /** Heatmap - lat/lng untuk GIS viz */
  async getMarketingHeatmap(types: string[]): Promise<any> {
    const result: any = { points: [] };
    if (types.includes("prospects")) {
      const p: any = ((await this.db.execute(sql`
        SELECT id, lat, lng, name, category FROM prospects
        WHERE lat IS NOT NULL AND lng IS NOT NULL LIMIT 2000
      `))[0] as any);
      for (const pt of p ?? []) {
        result.points.push({ type: "prospect", id: Number(pt.id), lat: Number(pt.lat), lng: Number(pt.lng), label: pt.name, category: pt.category });
      }
    }
    if (types.includes("leads")) {
      const l: any = ((await this.db.execute(sql`
        SELECT id, lat, lng, name, stage FROM leads
        WHERE lat IS NOT NULL AND lng IS NOT NULL LIMIT 2000
      `))[0] as any);
      for (const pt of l ?? []) {
        result.points.push({ type: "lead", id: Number(pt.id), lat: Number(pt.lat), lng: Number(pt.lng), label: pt.name, stage: pt.stage });
      }
    }
    if (types.includes("canvassing")) {
      const c: any = ((await this.db.execute(sql`
        SELECT id, lat, lng, title, type, severity FROM canvassing_logs
        WHERE lat IS NOT NULL AND lng IS NOT NULL LIMIT 2000
      `))[0] as any);
      for (const pt of c ?? []) {
        result.points.push({ type: "canvassing", id: Number(pt.id), lat: Number(pt.lat), lng: Number(pt.lng), label: pt.title, reportType: pt.type, severity: pt.severity });
      }
    }
    result.count = result.points.length;
    return result;
  }

  // ================================================================
  // USER PRODUCTIVITY STATS (untuk user detail drawer)
  // ================================================================
  async getUserProductivityStats(userId: number): Promise<any> {
    const since30 = new Date(Date.now() - 30 * 86400_000).toISOString();
    const since7 = new Date(Date.now() - 7 * 86400_000).toISOString();

    const rows: any = ((await this.db.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM audit_logs WHERE user_id = ${userId} AND action = 'LOGIN') AS total_logins,
        (SELECT COUNT(*) FROM audit_logs WHERE user_id = ${userId} AND action = 'LOGIN' AND created_at >= ${since30}) AS logins_30d,
        (SELECT COUNT(*) FROM audit_logs WHERE user_id = ${userId} AND created_at >= ${since30}) AS actions_30d,
        (SELECT COUNT(*) FROM audit_logs WHERE user_id = ${userId} AND created_at >= ${since7}) AS actions_7d,
        (SELECT COUNT(*) FROM tickets WHERE assigned_to = ${userId}) AS tickets_assigned,
        (SELECT COUNT(*) FROM tickets WHERE assigned_to = ${userId} AND status = 'resolved') AS tickets_resolved,
        (SELECT COUNT(*) FROM leads WHERE assigned_to = ${userId}) AS leads_assigned,
        (SELECT COUNT(*) FROM leads WHERE assigned_to = ${userId} AND stage = 'won') AS leads_won,
        (SELECT COUNT(*) FROM collections WHERE assigned_to = ${userId}) AS collections_assigned,
        (SELECT COUNT(*) FROM canvassing_logs WHERE user_id = ${userId} AND created_at >= ${since30}) AS canvassing_reports_30d,
        (SELECT COUNT(*) FROM canvassing_sessions WHERE user_id = ${userId}) AS canvassing_sessions
    `))[0] as any);
    const r = rows?.[0] ?? {};
    return {
      totalLogins: Number(r.total_logins ?? 0),
      logins30d: Number(r.logins_30d ?? 0),
      actions30d: Number(r.actions_30d ?? 0),
      actions7d: Number(r.actions_7d ?? 0),
      tickets: {
        assigned: Number(r.tickets_assigned ?? 0),
        resolved: Number(r.tickets_resolved ?? 0),
      },
      leads: {
        assigned: Number(r.leads_assigned ?? 0),
        won: Number(r.leads_won ?? 0),
      },
      collections: {
        assigned: Number(r.collections_assigned ?? 0),
      },
      canvassing: {
        reports30d: Number(r.canvassing_reports_30d ?? 0),
        totalSessions: Number(r.canvassing_sessions ?? 0),
      },
    };
  }

  // ================================================================
  // NOTIFICATIONS
  // ================================================================

  async createNotification(data: {
    userId: number; type: string; title: string; message?: string;
    link?: string; entityType?: string; entityId?: number; fromUserId?: number;
  }): Promise<Notification> {
    const mitraId = getMitraIdOrNull() ?? 1;
    const now = new Date().toISOString();
    const notifResult = await this.db.insert(notifications).values({
      mitraId,
      userId: data.userId,
      type: data.type,
      title: data.title,
      message: data.message ?? null,
      link: data.link ?? null,
      entityType: data.entityType ?? null,
      entityId: data.entityId ?? null,
      fromUserId: data.fromUserId ?? null,
      createdAt: now,
    } as any);
    const notifInsertId = Number((notifResult[0] as any).insertId);
    const [row] = await this.db.select().from(notifications).where(eq(notifications.id, notifInsertId));
    return row!;
  }

  /** Broadcast ke semua active user di mitra ini. Return count created. */
  async broadcastNotification(data: {
    type: string; title: string; message?: string; link?: string;
    entityType?: string; entityId?: number; fromUserId?: number;
    excludeUserId?: number;
  }): Promise<number> {
    const mitraId = getMitraId();
    // Only target users who are members of this mitra (via user_mitras join)
    const rows: any = (await this.db.execute(sql`
      SELECT DISTINCT u.id FROM users u
      INNER JOIN user_mitras um ON um.user_id = u.id
      WHERE u.is_active = 1 AND um.mitra_id = ${mitraId}
      ${data.excludeUserId ? sql`AND u.id != ${data.excludeUserId}` : sql``}
    `))[0];
    const now = new Date().toISOString();
    let n = 0;
    for (const u of rows ?? []) {
      try {
        await this.db.insert(notifications).values({
          mitraId,
          userId: Number(u.id),
          type: data.type,
          title: data.title,
          message: data.message ?? null,
          link: data.link ?? null,
          entityType: data.entityType ?? null,
          entityId: data.entityId ?? null,
          fromUserId: data.fromUserId ?? null,
          createdAt: now,
        } as any);
        n++;
      } catch {}
    }
    return n;
  }

  async getNotifications(userId: number, limit = 50, offset = 0, unreadOnly = false): Promise<Notification[]> {
    const mitraId = getMitraId();
    const cond = unreadOnly
      ? sql`user_id = ${userId} AND mitra_id = ${mitraId} AND read_at IS NULL`
      : sql`user_id = ${userId} AND mitra_id = ${mitraId}`;
    return ((await this.db.execute(sql`
      SELECT * FROM notifications WHERE ${cond}
      ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}
    `))[0] as any);
  }

  async getUnreadNotificationCount(userId: number): Promise<number> {
    const mitraId = getMitraId();
    const rows: any = ((await this.db.execute(sql`
      SELECT COUNT(*) AS n FROM notifications WHERE user_id = ${userId} AND mitra_id = ${mitraId} AND read_at IS NULL
    `))[0] as any);
    return Number(rows?.[0]?.n ?? 0);
  }

  async markNotificationRead(id: number, userId: number): Promise<void> {
    const mitraId = getMitraId();
    await this.db.execute(sql`
      UPDATE notifications SET read_at = ${new Date().toISOString()}
      WHERE id = ${id} AND user_id = ${userId} AND mitra_id = ${mitraId} AND read_at IS NULL
    `);
  }

  async markAllNotificationsRead(userId: number): Promise<number> {
    const mitraId = getMitraId();
    const before = await this.getUnreadNotificationCount(userId);
    await this.db.execute(sql`
      UPDATE notifications SET read_at = ${new Date().toISOString()}
      WHERE user_id = ${userId} AND mitra_id = ${mitraId} AND read_at IS NULL
    `);
    return before;
  }

  async deleteNotification(id: number, userId: number): Promise<void> {
    const mitraId = getMitraId();
    await this.db.execute(sql`DELETE FROM notifications WHERE id = ${id} AND user_id = ${userId} AND mitra_id = ${mitraId}`);
  }

  /** Cleanup: hapus notif > 30 hari (cross-tenant - system maintenance) */
  async cleanupOldNotifications(daysToKeep = 30): Promise<number> {
    const cutoff = new Date(Date.now() - daysToKeep * 86400_000).toISOString();
    const rows: any = ((await this.db.execute(sql`SELECT COUNT(*) AS n FROM notifications WHERE created_at < ${cutoff}`))[0] as any);
    const n = Number(rows?.[0]?.n ?? 0);
    if (n > 0) await this.db.execute(sql`DELETE FROM notifications WHERE created_at < ${cutoff}`);
    return n;
  }

  // ================================================================
  // ANNOUNCEMENTS
  // ================================================================

  /** BUG-004: pengumuman milik SATU tim (announcements.team_id = teamId), terbaru dulu.
   *  Terpisah dari changelog company-wide (team_id NULL). */
  async listTeamAnnouncements(teamId: number): Promise<Announcement[]> {
    const mitraId = getMitraId();
    return this.db.select().from(announcements)
      .where(and(eq(announcements.mitraId, mitraId), eq(announcements.teamId, teamId)))
      .orderBy(desc(announcements.publishedAt), desc(announcements.id));
  }

  /** Teamspace Fase 2 (FR-601..603): set targeting pengumuman (Rahasia + expiry) tanpa
   *  menyentuh patch generic updateAnnouncement. */
  async setAnnouncementTargeting(id: number, data: { isConfidential?: boolean; expiresAt?: string | null }): Promise<void> {
    const mitraId = getMitraId();
    const patch: any = {};
    if (data.isConfidential !== undefined) patch.isConfidential = data.isConfidential ? 1 : 0;
    if (data.expiresAt !== undefined) patch.expiresAt = data.expiresAt;
    if (Object.keys(patch).length === 0) return;
    await this.db.update(announcements).set(patch)
      .where(and(eq(announcements.id, id), eq(announcements.mitraId, mitraId)));
  }

  async listAnnouncements(options?: { publishedOnly?: boolean; category?: string; limit?: number }): Promise<any[]> {
    const mitraId = getMitraId();
    const pubClause = options?.publishedOnly
      ? sql`AND a.published_at IS NOT NULL AND a.published_at <= ${new Date().toISOString()}`
      : sql``;
    const catClause = options?.category ? sql`AND a.category = ${options.category}` : sql``;
    const limit = options?.limit ?? 100;
    return ((await this.db.execute(sql`
      SELECT a.id, a.title, a.content, a.category, a.severity, a.version,
        a.author_id AS authorId, a.published_at AS publishedAt, a.pinned_until AS pinnedUntil,
        a.created_at AS createdAt, a.updated_at AS updatedAt,
        u.name AS authorName, u.username AS authorUsername
      FROM announcements a
      LEFT JOIN users u ON u.id = a.author_id
      WHERE a.mitra_id = ${mitraId} ${pubClause} ${catClause}
      ORDER BY
        CASE WHEN a.pinned_until IS NOT NULL AND a.pinned_until > ${new Date().toISOString()} THEN 0 ELSE 1 END,
        COALESCE(a.published_at, a.created_at) DESC
      LIMIT ${limit}
    `))[0] as any);
  }

  async getAnnouncement(id: number): Promise<Announcement | null> {
    const mitraId = getMitraId();
    const [row] = await this.db.select().from(announcements).where(and(eq(announcements.id, id), eq(announcements.mitraId, mitraId)));
    return row ?? null;
  }

  async createAnnouncement(data: {
    title: string; content: string; category: string; severity?: string;
    version?: string; authorId: number; publishedAt?: string | null; pinnedUntil?: string | null;
    isConfidential?: boolean; expiresAt?: string | null;
  }): Promise<Announcement> {
    const mitraId = getMitraId();
    const now = new Date().toISOString();
    const announcementResult = await this.db.insert(announcements).values({
      mitraId,
      title: data.title,
      content: data.content,
      category: data.category,
      severity: data.severity ?? "info",
      version: data.version ?? null,
      authorId: data.authorId,
      publishedAt: data.publishedAt ?? null,
      pinnedUntil: data.pinnedUntil ?? null,
      isConfidential: data.isConfidential ? 1 : 0,
      expiresAt: data.expiresAt ?? null,
      createdAt: now,
      updatedAt: now,
    } as any);
    const announcementInsertId = Number((announcementResult[0] as any).insertId);
    const [row] = await this.db.select().from(announcements).where(eq(announcements.id, announcementInsertId));
    return row!;
  }

  async updateAnnouncement(id: number, data: Partial<{
    title: string; content: string; category: string; severity: string;
    version: string; publishedAt: string | null; pinnedUntil: string | null;
  }>): Promise<Announcement | null> {
    const mitraId = getMitraId();
    const updates: any = { updatedAt: new Date().toISOString() };
    for (const k of ["title", "content", "category", "severity", "version", "publishedAt", "pinnedUntil"]) {
      if ((data as any)[k] !== undefined) updates[k] = (data as any)[k];
    }
    await this.db.update(announcements).set(updates).where(and(eq(announcements.id, id), eq(announcements.mitraId, mitraId)));
    return this.getAnnouncement(id);
  }

  async deleteAnnouncement(id: number): Promise<void> {
    const mitraId = getMitraId();
    await this.db.delete(announcements).where(and(eq(announcements.id, id), eq(announcements.mitraId, mitraId)));
  }

  // ================================================================
  // BUG REPORTS
  // ================================================================

  async listBugReports(filter?: { status?: string; severity?: string; reportedBy?: number; assignedTo?: number; limit?: number }): Promise<any[]> {
    const mitraId = getMitraId();
    const conds: any[] = [sql`b.mitra_id = ${mitraId}`];
    if (filter?.status) conds.push(sql`b.status = ${filter.status}`);
    if (filter?.severity) conds.push(sql`b.severity = ${filter.severity}`);
    if (filter?.reportedBy) conds.push(sql`b.reported_by_user_id = ${filter.reportedBy}`);
    if (filter?.assignedTo) conds.push(sql`b.assigned_to_user_id = ${filter.assignedTo}`);
    const whereClause = sql`WHERE ${sql.join(conds, sql` AND `)}`;
    const limit = filter?.limit ?? 200;
    return ((await this.db.execute(sql`
      SELECT b.*,
        r.name AS reporterName, r.username AS reporterUsername,
        a.name AS assignedName, a.username AS assignedUsername,
        (SELECT COUNT(*) FROM bug_comments WHERE bug_id = b.id AND mitra_id = ${mitraId}) AS commentCount
      FROM bug_reports b
      LEFT JOIN users r ON r.id = b.reported_by_user_id
      LEFT JOIN users a ON a.id = b.assigned_to_user_id
      ${whereClause}
      ORDER BY
        CASE b.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        b.created_at DESC
      LIMIT ${limit}
    `))[0] as any);
  }

  async getBugReport(id: number): Promise<any | null> {
    const mitraId = getMitraId();
    const rows: any = ((await this.db.execute(sql`
      SELECT b.*,
        r.name AS reporterName, r.username AS reporterUsername,
        a.name AS assignedName, a.username AS assignedUsername
      FROM bug_reports b
      LEFT JOIN users r ON r.id = b.reported_by_user_id
      LEFT JOIN users a ON a.id = b.assigned_to_user_id
      WHERE b.id = ${id} AND b.mitra_id = ${mitraId}
    `))[0] as any);
    return rows?.[0] ?? null;
  }

  async getBugStats(): Promise<any> {
    const mitraId = getMitraId();
    const rows: any = ((await this.db.execute(sql`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open,
        SUM(CASE WHEN status = 'triaged' THEN 1 ELSE 0 END) AS triaged,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS closed,
        SUM(CASE WHEN severity = 'critical' AND status NOT IN ('resolved','closed','duplicate','wontfix') THEN 1 ELSE 0 END) AS open_critical,
        SUM(CASE WHEN severity = 'high' AND status NOT IN ('resolved','closed','duplicate','wontfix') THEN 1 ELSE 0 END) AS open_high
      FROM bug_reports WHERE mitra_id = ${mitraId}
    `))[0] as any);
    const r = rows?.[0] ?? {};
    return {
      total: Number(r.total ?? 0),
      byStatus: {
        open: Number(r.open ?? 0),
        triaged: Number(r.triaged ?? 0),
        inProgress: Number(r.in_progress ?? 0),
        resolved: Number(r.resolved ?? 0),
        closed: Number(r.closed ?? 0),
      },
      openBySeverity: {
        critical: Number(r.open_critical ?? 0),
        high: Number(r.open_high ?? 0),
      },
    };
  }

  async createBugReport(data: {
    title: string; description?: string; stepsToReproduce?: string;
    severity?: string; affectedFeature?: string; browserInfo?: string;
    reportedByUserId: number; photoData?: string;
  }): Promise<BugReport> {
    const mitraId = getMitraId();
    const now = new Date().toISOString();
    let photoPath: string | null = null;
    if (data.photoData && typeof data.photoData === "string") {
      const slug = await this.getMitraSlug(mitraId);
      const idHint = `bug-${Date.now()}`;
      photoPath = await saveBase64Photo(slug, "bugs", idHint, data.photoData);
    }
    const bugResult = await this.db.insert(bugReports).values({
      mitraId,
      title: data.title,
      description: data.description ?? null,
      stepsToReproduce: data.stepsToReproduce ?? null,
      severity: data.severity ?? "medium",
      status: "open",
      affectedFeature: data.affectedFeature ?? null,
      browserInfo: data.browserInfo ?? null,
      reportedByUserId: data.reportedByUserId,
      photoData: null,
      photoPath,
      createdAt: now,
      updatedAt: now,
    } as any);
    const bugInsertId = Number((bugResult[0] as any).insertId);
    const [row] = await this.db.select().from(bugReports).where(eq(bugReports.id, bugInsertId));
    return row!;
  }

  /** Get foto path (+ legacy base64) untuk bug report by id, dengan ACL meta (reporter user id). */
  async getBugReportPhotoMeta(id: number): Promise<{ photoPath: string | null; photoData: string | null; reportedByUserId: number } | null> {
    const mitraId = getMitraId();
    const rows: any = ((await this.db.execute(sql`
      SELECT photo_path AS photoPath, photo_data AS photoData, reported_by_user_id AS reportedByUserId
      FROM bug_reports WHERE id = ${id} AND mitra_id = ${mitraId} LIMIT 1
    `))[0] as any);
    if (!rows || rows.length === 0) return null;
    return {
      photoPath: rows[0].photoPath ?? null,
      photoData: rows[0].photoData ?? null,
      reportedByUserId: Number(rows[0].reportedByUserId),
    };
  }

  async updateBugReport(id: number, data: Partial<{
    title: string; description: string; stepsToReproduce: string;
    severity: string; status: string; affectedFeature: string;
    assignedToUserId: number | null; resolution: string; resolvedAt: string | null;
  }>): Promise<BugReport | null> {
    const mitraId = getMitraId();
    const updates: any = { updatedAt: new Date().toISOString() };
    for (const k of ["title", "description", "stepsToReproduce", "severity", "status",
                     "affectedFeature", "assignedToUserId", "resolution", "resolvedAt"]) {
      if ((data as any)[k] !== undefined) updates[k] = (data as any)[k];
    }
    // Auto-set resolvedAt if transitioning to resolved
    if (data.status === "resolved" && !data.resolvedAt) updates.resolvedAt = new Date().toISOString();
    await this.db.update(bugReports).set(updates).where(and(eq(bugReports.id, id), eq(bugReports.mitraId, mitraId)));
    const [row] = await this.db.select().from(bugReports).where(and(eq(bugReports.id, id), eq(bugReports.mitraId, mitraId)));
    return row ?? null;
  }

  async deleteBugReport(id: number): Promise<void> {
    const mitraId = getMitraId();
    const [row] = await this.db.select({ photoPath: bugReports.photoPath })
      .from(bugReports)
      .where(and(eq(bugReports.id, id), eq(bugReports.mitraId, mitraId)));
    if (row?.photoPath) await deletePhoto(row.photoPath);
    await this.db.delete(bugComments).where(and(eq(bugComments.bugId, id), eq(bugComments.mitraId, mitraId)));
    await this.db.delete(bugReports).where(and(eq(bugReports.id, id), eq(bugReports.mitraId, mitraId)));
  }

  async getBugComments(bugId: number): Promise<any[]> {
    const mitraId = getMitraId();
    return ((await this.db.execute(sql`
      SELECT c.*, u.name AS userName, u.username
      FROM bug_comments c
      LEFT JOIN users u ON u.id = c.user_id
      WHERE c.bug_id = ${bugId} AND c.mitra_id = ${mitraId}
      ORDER BY c.created_at ASC
    `))[0] as any);
  }

  async createBugComment(bugId: number, userId: number, content: string): Promise<BugComment> {
    const mitraId = getMitraId();
    const now = new Date().toISOString();
    const result = await this.db.insert(bugComments).values({
      mitraId, bugId, userId, content, createdAt: now,
    } as any);
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(bugComments).where(eq(bugComments.id, insertId));
    return row!;
  }

  // ==================== FINANCE / SUBSCRIBER KPI (Public API) ====================

  /** Local (server TZ) date as YYYY-MM-DD. */
  private localDateStr(d: Date = new Date()): string {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  /**
   * Lazily write today's KPI snapshot for the active mitra if missing.
   * Cheap: one existence check + (at most once/day) one set of aggregates.
   */
  async ensureKpiSnapshotForToday(): Promise<void> {
    const mitraId = getMitraId();
    const today = this.localDateStr();
    const existing: any = ((await this.db.execute(
      sql`SELECT id FROM kpi_snapshots WHERE mitra_id = ${mitraId} AND snapshot_date = ${today} LIMIT 1`
    ))[0] as any);
    if ((existing as any[]).length > 0) return;

    const agg: any = ((await this.db.execute(sql`
      SELECT
        COUNT(*) AS total_count,
        SUM(is_isolir = 1) AS isolir_count,
        SUM(is_isolir = 0) AS active_count,
        COALESCE(SUM(CASE WHEN is_isolir = 0 THEN billing_price ELSE 0 END), 0) AS mrr,
        COALESCE(SUM(CASE WHEN is_isolir = 1 THEN billing_price ELSE 0 END), 0) AS revenue_at_risk,
        SUM(install_date LIKE ${today + "%"}) AS new_activations
      FROM customers WHERE mitra_id = ${mitraId}
    `))[0] as any)?.[0];

    const col: any = ((await this.db.execute(sql`
      SELECT
        SUM(closed_at IS NULL) AS open_count,
        COALESCE(SUM(CASE WHEN closed_at IS NULL THEN opened_amount ELSE 0 END), 0) AS outstanding,
        SUM(closed_at LIKE ${today + "%"}) AS closed_today
      FROM collections WHERE mitra_id = ${mitraId}
    `))[0] as any)?.[0];

    const activeCount = Number(agg.active_count ?? 0);
    const mrr = Number(agg.mrr ?? 0);
    await this.db.execute(sql`
      INSERT INTO kpi_snapshots
        (mitra_id, snapshot_date, active_count, isolir_count, total_count, mrr, arpu,
         revenue_at_risk, new_activations, collections_open, collections_closed_today, outstanding_amount, created_at)
      VALUES (${mitraId}, ${today}, ${activeCount}, ${Number(agg.isolir_count ?? 0)}, ${Number(agg.total_count ?? 0)},
         ${mrr}, ${activeCount > 0 ? Math.round(mrr / activeCount) : 0}, ${Number(agg.revenue_at_risk ?? 0)},
         ${Number(agg.new_activations ?? 0)}, ${Number(col.open_count ?? 0)}, ${Number(col.closed_today ?? 0)},
         ${Number(col.outstanding ?? 0)}, ${new Date().toISOString()})
      ON DUPLICATE KEY UPDATE id = id
    `);
  }

  async getFinanceOverview(): Promise<any> {
    const mitraId = getMitraId();
    const cur: any = ((await this.db.execute(sql`
      SELECT
        COUNT(*) AS total,
        SUM(is_isolir = 0) AS active,
        SUM(is_isolir = 1) AS isolir,
        COALESCE(SUM(CASE WHEN is_isolir = 0 THEN billing_price ELSE 0 END),0) AS mrr,
        COALESCE(SUM(CASE WHEN is_isolir = 1 THEN billing_price ELSE 0 END),0) AS risk
      FROM customers WHERE mitra_id = ${mitraId}
    `))[0] as any)?.[0];

    const prev: any = ((await this.db.execute(sql`
      SELECT mrr FROM kpi_snapshots WHERE mitra_id = ${mitraId} AND snapshot_date < ${this.localDateStr()}
      ORDER BY snapshot_date DESC LIMIT 1
    `))[0] as any)?.[0];

    const byStatus: any[] = ((await this.db.execute(sql`
      SELECT COALESCE(billing_status,'unknown') AS k, COUNT(*) AS n FROM customers WHERE mitra_id = ${mitraId} GROUP BY billing_status
    `))[0] as any) ?? [];
    const byPackage: any[] = ((await this.db.execute(sql`
      SELECT COALESCE(package,'-') AS k, COUNT(*) AS n, COALESCE(SUM(billing_price),0) AS mrr
      FROM customers WHERE mitra_id = ${mitraId} GROUP BY package ORDER BY n DESC
    `))[0] as any) ?? [];
    const byType: any[] = ((await this.db.execute(sql`
      SELECT COALESCE(customer_type,'-') AS k, COUNT(*) AS n FROM customers WHERE mitra_id = ${mitraId} GROUP BY customer_type
    `))[0] as any) ?? [];
    const byDistrict: any[] = ((await this.db.execute(sql`
      SELECT COALESCE(district,'-') AS k, COUNT(*) AS n, COALESCE(SUM(billing_price),0) AS mrr
      FROM customers WHERE mitra_id = ${mitraId} GROUP BY district ORDER BY n DESC
    `))[0] as any) ?? [];

    const active = Number(cur.active ?? 0);
    const mrr = Number(cur.mrr ?? 0);
    return {
      asOf: new Date().toISOString(),
      mrr, mrrPrev: prev ? Number(prev.mrr) : null,
      arpu: active > 0 ? Math.round(mrr / active) : 0,
      activeCount: active, isolirCount: Number(cur.isolir ?? 0), totalCount: Number(cur.total ?? 0),
      revenueAtRisk: Number(cur.risk ?? 0),
      billingStatus: Object.fromEntries(byStatus.map((r) => [r.k, Number(r.n)])),
      byPackage: byPackage.map((r) => ({ package: r.k, count: Number(r.n), mrr: Number(r.mrr) })),
      byType: byType.map((r) => ({ type: r.k, count: Number(r.n) })),
      byDistrict: byDistrict.map((r) => ({ district: r.k, count: Number(r.n), mrr: Number(r.mrr) })),
    };
  }

  async getCustomersOverview(): Promise<any> {
    const mitraId = getMitraId();
    const cur: any = ((await this.db.execute(sql`
      SELECT COUNT(*) AS total, SUM(is_isolir=0) AS active, SUM(is_isolir=1) AS isolir
      FROM customers WHERE mitra_id = ${mitraId}
    `))[0] as any)?.[0];

    const monthPrefix = this.localDateStr().slice(0, 7);
    const today = this.localDateStr();
    const acts: any = ((await this.db.execute(sql`
      SELECT
        SUM(install_date LIKE ${today + "%"}) AS today,
        SUM(install_date LIKE ${monthPrefix + "%"}) AS this_month
      FROM customers WHERE mitra_id = ${mitraId} AND install_date >= '2000-01-01'
    `))[0] as any)?.[0];

    const dims = async (col: string) =>
      (((await this.db.execute(sql`
        SELECT COALESCE(${sql.raw(col)},'-') AS k, COUNT(*) AS n FROM customers WHERE mitra_id = ${mitraId} GROUP BY ${sql.raw(col)} ORDER BY n DESC
      `))[0] as any) ?? []).map((r: any) => ({ key: r.k, count: Number(r.n) }));

    return {
      asOf: new Date().toISOString(),
      total: Number(cur.total ?? 0), active: Number(cur.active ?? 0), isolir: Number(cur.isolir ?? 0),
      newActivations: { today: Number(acts.today ?? 0), thisMonth: Number(acts.this_month ?? 0) },
      byPackage: await dims("package"), byType: await dims("customer_type"),
      byDistrict: await dims("district"), byVillage: await dims("village"),
    };
  }

  async getFinanceTimeseries(metric: "mrr" | "active" | "isolir" | "revenue_at_risk", period: Period, from?: string, to?: string): Promise<any> {
    const mitraId = getMitraId();
    const buckets = computePeriodBuckets(period, from, to);
    const col = { mrr: "mrr", active: "active_count", isolir: "isolir_count", revenue_at_risk: "revenue_at_risk" }[metric];
    const rows: any[] = ((await this.db.execute(sql`
      SELECT snapshot_date AS d, ${sql.raw(col)} AS v FROM kpi_snapshots
      WHERE mitra_id = ${mitraId} ORDER BY snapshot_date ASC
    `))[0] as any) ?? [];
    const before: any[] = ((await this.db.execute(sql`
      SELECT ${sql.raw(col)} AS v FROM kpi_snapshots
      WHERE mitra_id = ${mitraId} AND snapshot_date < ${buckets[0].start.slice(0, 10)}
      ORDER BY snapshot_date DESC LIMIT 1
    `))[0] as any) ?? [];
    const prior = before.length ? Number(before[0].v) : 0;
    const series = lastValueInBuckets(rows, (r) => r.d, (r) => Number(r.v), buckets, prior);
    return { metric, period, buckets: series, coverage: rows.length ? `from ${rows[0].d}` : "no snapshots yet" };
  }

  async getCustomersTimeseries(metric: "new_activations" | "active" | "net_adds", period: Period, from?: string, to?: string): Promise<any> {
    const mitraId = getMitraId();
    const buckets = computePeriodBuckets(period, from, to);

    if (metric === "new_activations") {
      const rows: any[] = ((await this.db.execute(sql`
        SELECT install_date AS t FROM customers WHERE mitra_id = ${mitraId} AND install_date >= '2000-01-01' AND install_date >= ${buckets[0].start.slice(0, 10)}
      `))[0] as any) ?? [];
      return { metric, period, buckets: assignCountToBuckets(rows, (r) => r.t, buckets), coverage: "from install_date" };
    }

    const snaps: any[] = ((await this.db.execute(sql`
      SELECT snapshot_date AS d, active_count AS v FROM kpi_snapshots WHERE mitra_id = ${mitraId} ORDER BY snapshot_date ASC
    `))[0] as any) ?? [];
    const before: any[] = ((await this.db.execute(sql`
      SELECT active_count AS v FROM kpi_snapshots
      WHERE mitra_id = ${mitraId} AND snapshot_date < ${buckets[0].start.slice(0, 10)}
      ORDER BY snapshot_date DESC LIMIT 1
    `))[0] as any) ?? [];
    const prior = before.length ? Number(before[0].v) : 0;
    const active = lastValueInBuckets(snaps, (r) => r.d, (r) => Number(r.v), buckets, prior);
    if (metric === "active") return { metric, period, buckets: active, coverage: snaps.length ? `from ${snaps[0].d}` : "no snapshots yet" };
    const net = active.map((b, i) => ({ key: b.key, value: b.value - (i === 0 ? prior : active[i - 1].value) }));
    return { metric, period, buckets: net, coverage: snaps.length ? `from ${snaps[0].d}` : "no snapshots yet" };
  }

  async getCollectionsFinance(period: Period, from?: string, to?: string): Promise<any> {
    const mitraId = getMitraId();
    const buckets = computePeriodBuckets(period, from, to);

    const all: any[] = ((await this.db.execute(sql`
      SELECT opened_at, closed_at, opened_amount, close_reason FROM collections
      WHERE mitra_id = ${mitraId} AND (closed_at IS NULL OR opened_at >= ${buckets[0].start.slice(0, 10)} OR closed_at >= ${buckets[0].start.slice(0, 10)})
    `))[0] as any) ?? [];

    const opened = assignCountToBuckets(all, (r) => r.opened_at, buckets);
    const closedRows = all.filter((r) => r.closed_at);
    const paidRows = closedRows.filter((r) => String(r.close_reason ?? "").includes("paid"));
    const paidByBucket = assignCountToBuckets(paidRows, (r) => r.closed_at, buckets);
    const recovery = buckets.map((b, i) => ({
      bucket: b.key, opened: opened[i].value, closed: paidByBucket[i].value,
      recoveryPct: opened[i].value > 0 ? Math.round((paidByBucket[i].value / opened[i].value) * 1000) / 10 : null,
    }));

    const open = all.filter((r) => !r.closed_at);
    const now = Date.now();
    const ageDays = (r: any) => Math.floor((now - new Date(r.opened_at).getTime()) / 86400000);
    const aging = { d0_7: 0, d8_30: 0, d31plus: 0 };
    let outstanding = 0;
    for (const r of open) {
      outstanding += Number(r.opened_amount ?? 0);
      const a = ageDays(r);
      if (a <= 7) aging.d0_7++; else if (a <= 30) aging.d8_30++; else aging.d31plus++;
    }

    const paid = paidRows.filter((r) => {
      const t = new Date(r.closed_at).getTime();
      return t >= new Date(buckets[0].start).getTime();
    });
    const avgDaysToPay = paid.length
      ? Math.round((paid.reduce((s, r) => s + (new Date(r.closed_at).getTime() - new Date(r.opened_at).getTime()) / 86400000, 0) / paid.length) * 10) / 10
      : null;

    return { period, openNow: open.length, outstandingAmount: outstanding, recovery, aging, avgDaysToPay };
  }

  async getExecutiveReport(period: Period, from?: string, to?: string): Promise<any> {
    const fin = await this.getFinanceOverview();
    const col = await this.getCollectionsFinance(period, from, to);
    const mrrTrend = await this.getFinanceTimeseries("mrr", period, from, to);
    const actTrend = await this.getCustomersTimeseries("new_activations", period, from, to);

    const ab = actTrend.buckets as { value: number }[];
    const actDelta = ab.length >= 2 ? deltaPct(ab[ab.length - 1].value, ab[ab.length - 2].value) : null;
    const rb = col.recovery as { recoveryPct: number | null }[];
    const recoveryPct = rb.length ? rb[rb.length - 1].recoveryPct : null;

    const flags = buildExecutiveFlags({
      mrr: fin.mrr, revenueAtRisk: fin.revenueAtRisk, isolirCount: fin.isolirCount,
      newActivationsDeltaPct: actDelta, recoveryPct,
    });

    return {
      period, range: { from: from ?? null, to: to ?? null },
      revenue: {
        mrr: { value: fin.mrr, prev: fin.mrrPrev, deltaPct: deltaPct(fin.mrr, fin.mrrPrev) },
        arpu: fin.arpu, revenueAtRisk: fin.revenueAtRisk, outstandingAmount: col.outstandingAmount,
      },
      subscribers: {
        active: fin.activeCount, isolir: fin.isolirCount,
        newActivations: { value: ab.length ? ab[ab.length - 1].value : 0, deltaPct: actDelta },
        churnNote: "needs accumulated snapshot history",
      },
      collections: { openNow: col.openNow, recoveryPct, avgDaysToPay: col.avgDaysToPay },
      operations: { note: "expanded in Fase 2 (operations:read)" },
      trend: { mrr: mrrTrend.buckets, newActivations: actTrend.buckets },
      redFlags: flags.redFlags, greenLights: flags.greenLights,
    };
  }

  /**
   * DEV-ONLY: copy every shared table from the production schema into the current (dev) DB.
   * Reads prod (SELECT only), TRUNCATE+INSERT into dev. Partial success: one bad table is
   * reported and the rest continue. Caller (route) must env-gate via devDbSyncAvailable().
   */
  async runDevDbSyncFromProd(prodDb: string): Promise<{
    tables: { table: string; rows: number; ok: boolean; error?: string }[];
    totalRows: number;
    durationMs: number;
  }> {
    const started = Date.now();
    const devDb = process.env.DB_NAME ?? "";
    if (!devDb) throw new Error("DB_NAME env var is not set");
    const results: { table: string; rows: number; ok: boolean; error?: string }[] = [];
    const conn = await this.pool.getConnection();
    try {
      await conn.query("SET FOREIGN_KEY_CHECKS=0");
      const [prodT]: any = await conn.query(
        "SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ? AND table_type = 'BASE TABLE'",
        [prodDb],
      );
      const [devT]: any = await conn.query(
        "SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ? AND table_type = 'BASE TABLE'",
        [devDb],
      );
      const tables = tablesToMirror(prodT.map((r: any) => r.t), devT.map((r: any) => r.t));
      for (const table of tables) {
        try {
          const [pc]: any = await conn.query(
            "SELECT column_name AS c FROM information_schema.columns WHERE table_schema = ? AND table_name = ?",
            [prodDb, table],
          );
          const [dc]: any = await conn.query(
            "SELECT column_name AS c FROM information_schema.columns WHERE table_schema = ? AND table_name = ?",
            [devDb, table],
          );
          const cols = copyColumns(pc.map((r: any) => r.c), dc.map((r: any) => r.c));
          if (cols.length === 0) {
            results.push({ table, rows: 0, ok: false, error: "no shared columns" });
            continue;
          }
          const [truncSql, insertSql] = buildCopySql(devDb, prodDb, table, cols);
          await conn.query(truncSql);
          const [ins]: any = await conn.query(insertSql);
          results.push({ table, rows: Number(ins.affectedRows ?? 0), ok: true });
        } catch (e: any) {
          results.push({ table, rows: 0, ok: false, error: e?.message ?? "error" });
        }
      }
    } finally {
      try { await conn.query("SET FOREIGN_KEY_CHECKS=1"); } catch { /* ignore */ }
      conn.release();
    }
    const totalRows = results.filter((r) => r.ok).reduce((a, r) => a + r.rows, 0);
    return { tables: results, totalRows, durationMs: Date.now() - started };
  }

  // ===== SP2: Collection Config + Stage Map =====

  async getCollectionConfig(pipelineId: number): Promise<{ config: CollectionConfig | null; stageMap: CollectionStageMapRow[] }> {
    const mid = getMitraId();
    const cfgRows = await this.db.select().from(collectionConfig)
      .where(and(eq(collectionConfig.pipelineId, pipelineId), eq(collectionConfig.mitraId, mid)));
    const mapRows = await this.db.select().from(collectionStageMap)
      .where(and(eq(collectionStageMap.pipelineId, pipelineId), eq(collectionStageMap.mitraId, mid)))
      .orderBy(collectionStageMap.position);
    return { config: (cfgRows as any[])[0] ?? null, stageMap: mapRows as CollectionStageMapRow[] };
  }

  /** Upsert config + replace the stage map for a pipeline, in one transaction. Mitra-scoped. */
  async upsertCollectionConfig(pipelineId: number, cfg: CollectionConfigInput, mapRows: StageMapRow[]): Promise<void> {
    const mid = getMitraId();
    const now = new Date().toISOString();
    const conn = await this.pool.getConnection();
    await conn.beginTransaction();
    try {
      const [existing]: any = await conn.query("SELECT id FROM collection_config WHERE pipeline_id = ? AND mitra_id = ?", [pipelineId, mid]);
      const vals = [cfg.enabled ? 1 : 0, cfg.entryThresholdDays, cfg.entryMode, cfg.entryStageId, cfg.paidStageId, cfg.writeoffThresholdDays, cfg.writeoffAction, cfg.writeoffStageId, cfg.writeoffRuleId];
      if ((existing as any[]).length) {
        await conn.query(
          "UPDATE collection_config SET enabled=?, entry_threshold_days=?, entry_mode=?, entry_stage_id=?, paid_stage_id=?, writeoff_threshold_days=?, writeoff_action=?, writeoff_stage_id=?, writeoff_rule_id=?, updated_at=? WHERE pipeline_id=? AND mitra_id=?",
          [...vals, now, pipelineId, mid]);
      } else {
        await conn.query(
          "INSERT INTO collection_config (mitra_id, pipeline_id, enabled, entry_threshold_days, entry_mode, entry_stage_id, paid_stage_id, writeoff_threshold_days, writeoff_action, writeoff_stage_id, writeoff_rule_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
          [mid, pipelineId, ...vals, now]);
      }
      await conn.query("DELETE FROM collection_stage_map WHERE pipeline_id = ? AND mitra_id = ?", [pipelineId, mid]);
      for (let i = 0; i < mapRows.length; i++) {
        const r = mapRows[i];
        await conn.query(
          "INSERT INTO collection_stage_map (mitra_id, pipeline_id, min_overdue_days, max_overdue_days, stage_id, position, created_at) VALUES (?,?,?,?,?,?,?)",
          [mid, pipelineId, r.minOverdueDays, r.maxOverdueDays, r.stageId, i, now]);
      }
      await conn.commit();
    } catch (e) { await conn.rollback(); throw e; }
    finally { conn.release(); }
  }

  /** All cards of a pipeline that carry a source_customer_id. Mitra-scoped. */
  async getCardsWithCustomer(pipelineId: number): Promise<PipelineCard[]> {
    const mid = getMitraId();
    const rows = await this.db.select().from(pipelineCards)
      .where(and(eq(pipelineCards.pipelineId, pipelineId), eq(pipelineCards.mitraId, mid), isNotNull(pipelineCards.sourceCustomerId)));
    return rows as PipelineCard[];
  }

  /** Pipeline ids (current mitra) that have an ENABLED collection config. */
  async listEnabledCollectionPipelineIds(): Promise<number[]> {
    const mid = getMitraId();
    const rows = await this.db.select().from(collectionConfig)
      .where(and(eq(collectionConfig.mitraId, mid), eq(collectionConfig.enabled, 1)));
    return (rows as any[]).map((r) => r.pipelineId);
  }

  // ==================== MP1: Pipeline Metrics ====================

  async listMetricDefs(pipelineId: number): Promise<PipelineMetric[]> {
    const mid = getMitraId();
    return await this.db.select().from(pipelineMetrics)
      .where(and(eq(pipelineMetrics.pipelineId, pipelineId), eq(pipelineMetrics.mitraId, mid)))
      .orderBy(pipelineMetrics.position) as PipelineMetric[];
  }

  async createMetricDef(pipelineId: number, data: any): Promise<PipelineMetric> {
    const mid = getMitraId(); const now = new Date().toISOString();
    const result = await this.db.insert(pipelineMetrics).values({
      mitraId: mid, pipelineId, name: data.name, description: data.description ?? null,
      icon: data.icon ?? null, color: data.color ?? "primary", type: data.type ?? "number",
      source: data.source ?? "card_count", aggregation: data.aggregation ?? "count",
      fieldId: data.fieldId ?? null, stageIds: data.stageIds ? JSON.stringify(data.stageIds) : null,
      conditions: data.conditions ? JSON.stringify(data.conditions) : null,
      prefix: data.prefix ?? null, suffix: data.suffix ?? null, decimals: data.decimals ?? null,
      timeField: data.timeField ?? null, timePreset: data.timePreset ?? null,
      timeFrom: data.timeFrom ?? null, timeTo: data.timeTo ?? null,
      terms: data.terms ? JSON.stringify(data.terms) : null,
      formula: data.formula ?? null,
      position: data.position ?? 0, visible: data.visible === false ? 0 : 1, createdAt: now,
    } as any);
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(pipelineMetrics).where(and(eq(pipelineMetrics.id, insertId), eq(pipelineMetrics.mitraId, mid)));
    return row!;
  }

  async updateMetricDef(metricId: number, data: any): Promise<void> {
    const mid = getMitraId();
    const patch: any = { updatedAt: new Date().toISOString() };
    for (const k of ["name", "description", "icon", "color", "type", "source", "aggregation", "fieldId", "prefix", "suffix", "decimals", "position", "timeField", "timePreset", "timeFrom", "timeTo", "formula"]) {
      if (data[k] !== undefined) patch[k] = data[k];
    }
    if (data.stageIds !== undefined) patch.stageIds = data.stageIds ? JSON.stringify(data.stageIds) : null;
    if (data.terms !== undefined) patch.terms = data.terms ? JSON.stringify(data.terms) : null;
    if (data.conditions !== undefined) patch.conditions = data.conditions ? JSON.stringify(data.conditions) : null;
    if (data.visible !== undefined) patch.visible = data.visible ? 1 : 0;
    await this.db.update(pipelineMetrics).set(patch).where(and(eq(pipelineMetrics.id, metricId), eq(pipelineMetrics.mitraId, mid)));
  }

  async deleteMetricDef(metricId: number): Promise<void> {
    const mid = getMitraId();
    await this.db.delete(pipelineMetrics).where(and(eq(pipelineMetrics.id, metricId), eq(pipelineMetrics.mitraId, mid)));
  }

  async getMetricDef(metricId: number): Promise<PipelineMetric | undefined> {
    const mid = getMitraId();
    const [row] = await this.db.select().from(pipelineMetrics).where(and(eq(pipelineMetrics.id, metricId), eq(pipelineMetrics.mitraId, mid)));
    return row as PipelineMetric | undefined;
  }

  /** All card values for a pipeline, grouped by card id. Mitra-scoped. Anti-N+1 for metrics. */
  async getCardValuesForPipeline(pipelineId: number): Promise<Map<number, Record<number, string>>> {
    const mid = getMitraId();
    const rows: any = (await this.db.execute(sql`
      SELECT v.card_id AS cardId, v.field_id AS fieldId, v.value AS value
      FROM pipeline_card_values v JOIN pipeline_cards c ON c.id = v.card_id
      WHERE c.pipeline_id = ${pipelineId} AND v.mitra_id = ${mid}
    `))[0];
    const map = new Map<number, Record<number, string>>();
    for (const r of (rows as any[])) {
      const cid = Number(r.cardId);
      if (!map.has(cid)) map.set(cid, {});
      map.get(cid)![Number(r.fieldId)] = String(r.value ?? "");
    }
    return map;
  }
}

export const storage = new DatabaseStorage();
