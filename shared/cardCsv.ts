/** Pure helpers for card CSV export/import. No DB, no I/O. */

export interface ExportColumn { key: string; label: string }
export interface CsvField { id: number; label?: string; type: string; options?: string | null; config?: string | null }

const BASE_COLUMNS: ExportColumn[] = [
  { key: "title", label: "Judul" },
  { key: "stage", label: "Stage" },
  { key: "assignee", label: "Assignee" },
  { key: "priority", label: "Prioritas" },
  { key: "created", label: "Dibuat" },
];

export function buildExportColumns(fields: CsvField[]): ExportColumn[] {
  return [...BASE_COLUMNS, ...fields.map((f) => ({ key: `f_${f.id}`, label: f.label ?? `Field ${f.id}` }))];
}

/** Flat row keyed by ExportColumn keys. Custom field values are the RAW stored string (round-trip-safe);
 *  only stage/assignee are resolved (passed in by the caller). */
export function formatCardForExport(
  card: { title: string; priority: string; createdAt: string; values?: Record<number, string> },
  fields: CsvField[],
  stageLabel: string,
  assigneeName: string,
): Record<string, string> {
  const row: Record<string, string> = {
    title: card.title ?? "",
    stage: stageLabel,
    assignee: assigneeName,
    priority: card.priority ?? "",
    created: card.createdAt ?? "",
  };
  for (const f of fields) row[`f_${f.id}`] = (card.values?.[f.id] ?? "") + "";
  return row;
}

export interface MappedImportRow { title?: string; stage?: string; assignee?: string; priority?: string; values: Record<number, string> }
export interface ImportCtx {
  stageByLabel: Map<string, number>;   // lowercased label → stageId
  userByName: Map<string, number>;     // lowercased name/username → userId
  fieldsById: Map<number, CsvField>;
  firstStageId: number;
}
export interface CardDraft { stageId: number; title: string; assigneeId: number | null; priority: string; values: { fieldId: number; value: string }[] }

const PRIORITIES = new Set(["low", "medium", "high", "urgent"]);

export function resolveImportRow(
  row: MappedImportRow,
  ctx: ImportCtx,
  validateValue: (field: CsvField, value: string) => string | null,
): { ok: true; draft: CardDraft } | { ok: false; error: string } {
  const title = (row.title ?? "").trim();
  if (!title) return { ok: false, error: "Judul wajib diisi" };

  let stageId = ctx.firstStageId;
  if (row.stage && row.stage.trim()) {
    const found = ctx.stageByLabel.get(row.stage.trim().toLowerCase());
    if (found != null) stageId = found;
  }

  let assigneeId: number | null = null;
  if (row.assignee && row.assignee.trim()) {
    assigneeId = ctx.userByName.get(row.assignee.trim().toLowerCase()) ?? null;
  }

  const priority = row.priority && PRIORITIES.has(row.priority.trim().toLowerCase()) ? row.priority.trim().toLowerCase() : "medium";

  const values: { fieldId: number; value: string }[] = [];
  for (const [fid, raw] of Object.entries(row.values ?? {})) {
    const field = ctx.fieldsById.get(Number(fid));
    if (!field) continue;
    const value = String(raw ?? "");
    if (value.trim() === "") continue;
    const err = validateValue(field, value);
    if (err) return { ok: false, error: `${field.label ?? `Field ${fid}`}: ${err}` };
    values.push({ fieldId: Number(fid), value });
  }
  return { ok: true, draft: { stageId, title, assigneeId, priority, values } };
}
