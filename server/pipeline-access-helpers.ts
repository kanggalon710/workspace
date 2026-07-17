/** Pure helper for pipeline-level RBAC — no DB. */
export type PipelineLevel = "none" | "view" | "edit";

export function resolvePipelineLevel(args: {
  isAdmin: boolean;
  restricted: boolean;
  keyLevel: "none" | "read" | "write";
  grantLevel: PipelineLevel;
}): PipelineLevel {
  const { isAdmin, restricted, keyLevel, grantLevel } = args;
  if (isAdmin) return "edit";
  if (!restricted) {
    if (keyLevel === "write") return "edit";
    if (keyLevel === "read") return "view";
    return "none";
  }
  return grantLevel === "edit" || grantLevel === "view" ? grantLevel : "none";
}
