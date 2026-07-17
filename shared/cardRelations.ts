/** Pure catalog + helpers for card relations. No DB, no I/O. */

export type RelationEntityType = "customer" | "lead" | "collection" | "odp" | "card";

export interface RelationTypeDef { type: RelationEntityType; label: string }

export const RELATION_ENTITY_TYPES: RelationTypeDef[] = [
  { type: "customer", label: "Pelanggan" },
  { type: "lead", label: "Lead" },
  { type: "collection", label: "Penagihan" },
  { type: "odp", label: "ODP" },
  { type: "card", label: "Kartu" },
];

const VALID = new Set(RELATION_ENTITY_TYPES.map((t) => t.type));

export function isValidEntityType(t: string): t is RelationEntityType {
  return VALID.has(t as RelationEntityType);
}

/** Client route for an entity. `card` needs the related card's pipelineId. */
export function relationHref(type: string, entityId: number, ctx?: { pipelineId?: number }): string {
  switch (type) {
    case "customer": return "/customers";
    case "lead": return "/leads";
    case "collection": return "/collections";
    case "odp": return "/odps";
    case "card": return ctx?.pipelineId ? `/pipelines/${ctx.pipelineId}?card=${entityId}` : "/pipelines";
    default: return "/pipelines";
  }
}

export function dedupeRelations<T extends { entityType: string; entityId: number }>(list: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of list) {
    const k = `${r.entityType}:${r.entityId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}
