/** Pure catalog of pipeline card comment/entry types. No DB, no I/O, no JSX.
 *  `icon` is a Lucide component name resolved in the UI; `color` is a Tailwind text token. */
export interface CardCommentType {
  key: string;
  label: string;
  icon: string;   // lucide-react export name
  color: string;  // tailwind text-* token (must exist in the design system)
}

export const CARD_COMMENT_TYPES: CardCommentType[] = [
  { key: "note",     label: "Catatan",   icon: "FileText",      color: "text-muted-foreground" },
  { key: "call",     label: "Telepon",   icon: "Phone",         color: "text-info" },
  { key: "whatsapp", label: "WhatsApp",  icon: "MessageSquare", color: "text-success" },
  { key: "visit",    label: "Kunjungan", icon: "MapPin",        color: "text-warning" },
  { key: "activity", label: "Aktivitas", icon: "Activity",      color: "text-primary" },
];

export const CARD_COMMENT_TYPE_KEYS = CARD_COMMENT_TYPES.map((t) => t.key);

const BY_KEY: Record<string, CardCommentType> = Object.fromEntries(
  CARD_COMMENT_TYPES.map((t) => [t.key, t]),
);

/** Lookup with a safe fallback to "note" (the default column value). */
export function cardCommentType(key: string | null | undefined): CardCommentType {
  return (key && BY_KEY[key]) || BY_KEY["note"];
}

export function isCardCommentType(key: string): boolean {
  return key in BY_KEY;
}
