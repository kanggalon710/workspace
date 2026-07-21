/** Pure Teamspace RBAC resolution - no React, no DB. Shared by client + server + tests.
 *  Resolusi 3 lapis (PRD-JABNET-TEAMSPACE.md §9):
 *    1. Admin (System-Admin/Administrator) → full.
 *    2. Role per-tim (teamMembers.role): manager → kelola tim + full board; member → kerja standar.
 *    3. Item "Rahasia" (isPrivate) → hanya creator/assignee/follower/admin.
 *  Board tugas tim memakai PipelineCapability yang sama dengan engine pipelines
 *  supaya seluruh guard endpoint eksisting bekerja tanpa cabang khusus. */

import type { PipelineCapability } from "./pipelineCapabilities.js";
import { ALL_PIPELINE_CAPABILITIES, ACTION_CAPABILITIES } from "./pipelineCapabilities.js";

export type TeamRole = "manager" | "member";
export type PermKeyLevel = "none" | "read" | "write";

/** Parse nilai role membership dari DB (unknown → member). */
export function parseTeamRole(raw: string | null | undefined): TeamRole {
  return raw === "manager" ? "manager" : "member";
}

/** Kapabilitas working-set untuk anggota tim biasa dengan team_tasks=write:
 *  kelola kartu + aksi turunannya, TANPA kelola struktur board (stages/fields/automation/manage/delete). */
const MEMBER_WRITE_CAPS: PipelineCapability[] = ["view", "cards", ...ACTION_CAPABILITIES];

/** Resolusi kapabilitas seorang user atas pipeline MILIK TIM (pipelines.teamId != null).
 *  Berbeda dengan pipeline ops: keanggotaan tim adalah gerbang utama - pemegang izin
 *  `pipelines` ops yang bukan anggota TIDAK mendapat akses (isolasi dua arah, NFR-012). */
export function resolveTeamPipelineCapabilities(args: {
  isAdmin: boolean;
  /** pembuat pipeline (== pembuat tim saat provisioning) */
  isCreator: boolean;
  /** null = bukan anggota tim */
  teamRole: TeamRole | null;
  /** level permission key `team_tasks` milik user */
  keyLevel: PermKeyLevel;
}): Set<PipelineCapability> {
  const { isAdmin, isCreator, teamRole, keyLevel } = args;
  if (isAdmin || isCreator) return new Set(ALL_PIPELINE_CAPABILITIES);
  if (teamRole === null) return new Set();               // bukan anggota - tidak lihat apa pun
  if (teamRole === "manager") return new Set(ALL_PIPELINE_CAPABILITIES);
  if (keyLevel === "write") return new Set(MEMBER_WRITE_CAPS);
  if (keyLevel === "read") return new Set<PipelineCapability>(["view"]);
  return new Set();
}

/** Boleh kelola tim (edit tim, kelola anggota/manager, atur views, arsip tim ini)? */
export function canManageTeam(args: { isAdmin: boolean; teamsKeyLevel: PermKeyLevel; teamRole: TeamRole | null }): boolean {
  if (args.isAdmin) return true;
  if (args.teamsKeyLevel === "write") return true;       // admin ops dengan write pada key `teams`
  return args.teamRole === "manager";
}

/** Boleh MEMBUAT tim baru? Hanya admin / pemegang write key `teams` (Open Question #2 → default konservatif). */
export function canCreateTeam(args: { isAdmin: boolean; teamsKeyLevel: PermKeyLevel }): boolean {
  return args.isAdmin || args.teamsKeyLevel === "write";
}

/** Visibilitas kartu "Rahasia" (isPrivate=1): creator, assignee (primer/sekunder), follower, admin.
 *  Manager tim TIDAK otomatis lihat - konsisten dengan semantik Cicle (penerima eksplisit). */
export function canSeePrivateCard(args: {
  isAdmin: boolean;
  userId: number;
  createdBy: number;
  assigneeIds: number[];
  followerIds: number[];
}): boolean {
  if (args.isAdmin) return true;
  if (args.userId === args.createdBy) return true;
  if (args.assigneeIds.includes(args.userId)) return true;
  return args.followerIds.includes(args.userId);
}

// -- Move permission per list (FR-403) --------------------------------------

export interface StageMovePermission {
  userIds: number[];
  roleIds: number[];
}

/** Parse JSON move_permission dari DB. NULL/invalid/kosong → null (= semua boleh). */
export function parseMovePermission(raw: string | null | undefined): StageMovePermission | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    const userIds = Array.isArray(o?.userIds) ? o.userIds.map(Number).filter((n: number) => Number.isFinite(n) && n > 0) : [];
    const roleIds = Array.isArray(o?.roleIds) ? o.roleIds.map(Number).filter((n: number) => Number.isFinite(n) && n > 0) : [];
    if (userIds.length === 0 && roleIds.length === 0) return null;
    return { userIds, roleIds };
  } catch {
    return null;
  }
}

/** Cek boleh memindahkan kartu MELIBATKAN stage ini (asal ATAU tujuan).
 *  Admin & manager tim selalu boleh (mereka yang mengatur aturannya). */
export function canMoveWithStage(args: {
  movePermission: StageMovePermission | null;
  isAdmin: boolean;
  isManager: boolean;
  userId: number;
  roleId: number | null;
}): boolean {
  if (args.movePermission === null) return true;
  if (args.isAdmin || args.isManager) return true;
  if (args.movePermission.userIds.includes(args.userId)) return true;
  return args.roleId != null && args.movePermission.roleIds.includes(args.roleId);
}

// -- Enabled views ----------------------------------------------------------

export const TEAM_VIEW_KEYS = ["summary", "tasks", "chat", "docs", "announcements", "schedule", "checkins"] as const;
export type TeamViewKey = typeof TEAM_VIEW_KEYS[number];

/** Parse enabled_views JSON → array valid berurut. NULL/invalid → default Fase 1. */
export function parseEnabledViews(raw: string | null | undefined): TeamViewKey[] {
  const fallback: TeamViewKey[] = ["summary", "tasks"];
  if (!raw) return fallback;
  try {
    const a = JSON.parse(raw);
    if (!Array.isArray(a)) return fallback;
    const valid = a.filter((x): x is TeamViewKey => (TEAM_VIEW_KEYS as readonly string[]).includes(x));
    // dedupe sambil pertahankan urutan
    const out: TeamViewKey[] = [];
    for (const v of valid) if (!out.includes(v)) out.push(v);
    return out.length > 0 ? out : fallback;
  } catch {
    return fallback;
  }
}
