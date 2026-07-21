/** Pure pipeline RBAC capability model - no React, no DB. Shared by client + server + tests. */

export type PipelineCapability = "view" | "cards" | "stages" | "fields" | "automation" | "manage" | "delete" | "comment" | "assign" | "export" | "import";

export const ALL_PIPELINE_CAPABILITIES: PipelineCapability[] = [
  "view", "cards", "stages", "fields", "automation", "manage", "delete", "comment", "assign", "export", "import",
];

export const PIPELINE_CAPABILITY_LABELS: Record<PipelineCapability, string> = {
  view: "Lihat",
  cards: "Kelola Kartu",
  stages: "Kelola Stage",
  fields: "Kelola Field",
  automation: "Kelola Otomasi",
  manage: "Kelola Pipeline",
  delete: "Hapus Pipeline",
  comment: "Komentar",
  assign: "Tugaskan",
  export: "Export",
  import: "Import",
};

/** Fine-grained card actions that the `cards` capability supersets. */
export const ACTION_CAPABILITIES: PipelineCapability[] = ["comment", "assign", "export", "import"];

// Caps that imply the coarse legacy "edit" level (anything beyond read-only view).
const EDIT_CLASS: PipelineCapability[] = ["cards", "stages", "fields", "automation", "manage", "delete"];

/** Legacy bridge: a stored view/edit level → capability list. */
export function capabilitiesFromLevel(level: string): PipelineCapability[] {
  if (level === "edit") return [...ALL_PIPELINE_CAPABILITIES];
  if (level === "view") return ["view"];
  return [];
}

/** Coarse legacy level from a capability set (keeps board `writable` + legacy readers working). */
export function deriveLevel(caps: PipelineCapability[]): "none" | "view" | "edit" {
  if (caps.some((c) => EDIT_CLASS.includes(c))) return "edit";
  if (caps.includes("view")) return "view";
  return "none";
}

/** Parse a stored capabilities JSON string to a clean PipelineCapability[] (unknown keys dropped). */
export function parseCapabilities(json: string | null | undefined): PipelineCapability[] {
  if (!json) return [];
  try {
    const a = JSON.parse(json);
    if (!Array.isArray(a)) return [];
    return a.filter((x): x is PipelineCapability => (ALL_PIPELINE_CAPABILITIES as string[]).includes(x));
  } catch {
    return [];
  }
}

/** Resolve a user's effective capabilities on one pipeline. */
export function resolvePipelineCapabilities(args: {
  isAdmin: boolean;
  isCreator: boolean;
  restricted: boolean;
  keyLevel: "none" | "read" | "write";
  grantCapabilities: PipelineCapability[];
}): Set<PipelineCapability> {
  const { isAdmin, isCreator, restricted, keyLevel, grantCapabilities } = args;
  if (isAdmin || isCreator) return new Set(ALL_PIPELINE_CAPABILITIES);
  if (!restricted) {
    if (keyLevel === "write") return new Set(ALL_PIPELINE_CAPABILITIES);
    if (keyLevel === "read") return new Set<PipelineCapability>(["view"]);
    return new Set<PipelineCapability>();
  }
  const s = new Set<PipelineCapability>(grantCapabilities);
  if (s.size > 0) s.add("view");
  if (s.has("cards")) for (const a of ACTION_CAPABILITIES) s.add(a);
  return s;
}

/** Roles whose pipeline access is FIXED at full and cannot be granted/reduced per-pipeline:
 *  the seeded per-mitra "Admin" and JABNET "System-Admin" (both isSystem). Mirrors the
 *  server-side isPipelineAdmin(req) short-circuit - grants for these roles are meaningless. */
export function isAdminLockedRole(role: { name?: string | null; isSystem?: number | null }): boolean {
  return (role.isSystem ?? 0) === 1 && (role.name === "Admin" || role.name === "System-Admin");
}
