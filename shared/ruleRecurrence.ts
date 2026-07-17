/** Pure helpers for per-rule recurrence — no I/O, unit-testable. */
export type RuleRecurrence = "once" | "on_reenter" | "always";

export const RECURRENCE_MODES: { mode: RuleRecurrence; label: string; hint: string }[] = [
  { mode: "once",       label: "Sekali",                 hint: "Fire sekali seumur kartu (default)." },
  { mode: "on_reenter", label: "Saat masuk ulang stage", hint: "Fire lagi tiap kartu masuk ulang ke stage pemicu." },
  { mode: "always",     label: "Setiap kali",            hint: "Fire tiap kali kartu masuk stage pemicu." },
];

const VALID = new Set<string>(RECURRENCE_MODES.map((m) => m.mode));
export function parseRecurrence(raw: string | null | undefined): RuleRecurrence {
  return typeof raw === "string" && VALID.has(raw) ? (raw as RuleRecurrence) : "once";
}
/** Check hasRuleFired (skip when already fired) before firing? False only for always. */
export function dedupBeforeFire(mode: RuleRecurrence): boolean { return mode !== "always"; }
/** Record a fire after a successful run? False only for always. */
export function recordAfterFire(mode: RuleRecurrence): boolean { return mode !== "always"; }
