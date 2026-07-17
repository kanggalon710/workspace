/** Pure helpers for pipeline custom fields — no DB, fully unit-testable. */
import { parseCoordinate } from "../shared/pipelineFieldTypes.js";

export type Validation = { ok: true } | { ok: false; error: string };

export function validateFieldValue(
  type: string,
  value: string,
  options?: string[],
  opts?: { multiple?: boolean },
): Validation {
  if (value === "" || value == null) return { ok: true }; // soft-required: empty always allowed
  switch (type) {
    case "number":
    case "currency":
      return Number.isFinite(Number(value)) ? { ok: true } : { ok: false, error: "Harus berupa angka" };
    case "checkbox":
      return value === "0" || value === "1" ? { ok: true } : { ok: false, error: "Checkbox harus 0/1" };
    case "date":
      return Number.isNaN(Date.parse(value)) ? { ok: false, error: "Tanggal tidak valid" } : { ok: true };
    case "user": {
      if (opts?.multiple) {
        let arr: unknown;
        try { arr = JSON.parse(value); } catch { return { ok: false, error: "Format assignee tidak valid" }; }
        if (!Array.isArray(arr)) return { ok: false, error: "Format assignee tidak valid" };
        return arr.every((v) => /^\d+$/.test(String(v))) ? { ok: true } : { ok: false, error: "User tidak valid" };
      }
      return /^\d+$/.test(value) ? { ok: true } : { ok: false, error: "User tidak valid" };
    }
    case "dropdown":
      return (options ?? []).includes(value) ? { ok: true } : { ok: false, error: "Pilihan tidak valid" };
    case "multiselect": {
      let arr: unknown;
      try { arr = JSON.parse(value); } catch { return { ok: false, error: "Format multiselect tidak valid" }; }
      if (!Array.isArray(arr)) return { ok: false, error: "Format multiselect tidak valid" };
      const opts = options ?? [];
      return arr.every((v) => opts.includes(String(v))) ? { ok: true } : { ok: false, error: "Pilihan tidak valid" };
    }
    case "coordinate":
      return parseCoordinate(value) ? { ok: true } : { ok: false, error: "Koordinat tidak valid" };
    case "text": case "textarea": case "phone": case "url":
    default:
      return value.length <= 5000 ? { ok: true } : { ok: false, error: "Terlalu panjang" };
  }
}

export function encodeFieldValue(type: string, raw: unknown): string {
  if (type === "multiselect") return JSON.stringify(Array.isArray(raw) ? raw.map(String) : []);
  if (raw == null) return "";
  return String(raw);
}

export function decodeFieldValue(type: string, stored: string | null): unknown {
  if (type === "multiselect") {
    if (!stored) return [];
    try { const a = JSON.parse(stored); return Array.isArray(a) ? a.map(String) : []; } catch { return []; }
  }
  return stored ?? "";
}

export function formatChipValue(type: string, stored: string | null, options?: string[]): string {
  if (stored == null || stored === "") return "";
  switch (type) {
    case "checkbox": return stored === "1" ? "Ya" : "Tidak";
    case "currency": return "Rp " + Number(stored).toLocaleString("id-ID");
    case "number": return Number(stored).toLocaleString("id-ID");
    case "multiselect": {
      try { const a = JSON.parse(stored); return Array.isArray(a) ? a.join(", ") : String(stored); } catch { return String(stored); }
    }
    case "coordinate": {
      const c = parseCoordinate(stored);
      return c ? `${c.lat}, ${c.lng}` : "";
    }
    default: return String(stored);
  }
}
