/** Pure helper for pipeline-level RBAC - no DB. */
export type PipelineLevel = "none" | "view" | "edit";

export function resolvePipelineLevel(args: {
  isAdmin: boolean;
  restricted: boolean;
  keyLevel: "none" | "read" | "write" | "delete";
  grantLevel: PipelineLevel;
}): PipelineLevel {
  const { isAdmin, restricted, keyLevel, grantLevel } = args;
  if (isAdmin) return "edit";
  if (!restricted) {
    // delete adalah superset dari write -> tetap "edit".
    if (keyLevel === "write" || keyLevel === "delete") return "edit";
    if (keyLevel === "read") return "view";
    return "none";
  }
  return grantLevel === "edit" || grantLevel === "view" ? grantLevel : "none";
}
