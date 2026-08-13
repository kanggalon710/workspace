import { useState } from "react";
import { toast } from "sonner";
import { Plus, X, CheckCircle2, AlertTriangle } from "lucide-react";
import { LEAD_CATEGORY_LABELS, type LeadCategory } from "@shared/schema";
import { reverseGeocode } from "@/lib/geocode";
import { T, CAT_ICONS, CAT_COLORS, findNearestOdp, type Odp } from "./shared";

export function AddLeadForm({ lat, lng, odps, sessionId, onSave, onCancel, isSaving }: {
  lat: number; lng: number; odps: Odp[]; sessionId: number;
  onSave: (data: any) => void; onCancel: () => void; isSaving: boolean;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [category, setCategory] = useState<LeadCategory>("rumahan");
  const [notes, setNotes] = useState("");
  const nearest = findNearestOdp(lat, lng, odps);
  const isFar = nearest && nearest.distance > 500;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="rounded-t-2xl md:rounded-2xl shadow-2xl p-5 w-full max-w-sm mx-auto overflow-y-auto max-h-[90vh]" style={{ background: T.bg }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: T.accent + "15" }}>
              <Plus className="h-4 w-4" style={{ color: T.accent }} />
            </div>
            <h3 className="font-bold text-sm" style={{ color: T.deep }}>Tambah Prospek</h3>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-lg" style={{ background: T.surfaceHi }}>
            <X className="h-4 w-4" style={{ color: T.secondary }} />
          </button>
        </div>
        {nearest && (
          <div className="flex items-center gap-2 text-xs rounded-xl px-3 py-2 mb-3"
            style={{
              background: isFar ? "#F59E0B12" : "#22C55E12",
              border: `1px solid ${isFar ? "#F59E0B30" : "#22C55E30"}`,
              color: isFar ? "#B45309" : "#15803D",
            }}>
            {isFar ? <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> : <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
            {nearest.odp.name} - {nearest.distance}m
          </div>
        )}
        <div className="space-y-3">
          <input autoFocus type="text" placeholder="Nama prospek *"
            value={name} onChange={e => setName(e.target.value)}
            className="w-full text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2"
            style={{ background: T.surface, border: "none", color: T.textSoft }} />
          <input type="tel" placeholder="No. HP (opsional)"
            value={phone} onChange={e => setPhone(e.target.value)}
            className="w-full text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2"
            style={{ background: T.surface, border: "none", color: T.textSoft }} />
          <div className="grid grid-cols-5 gap-1.5">
            {(Object.keys(CAT_COLORS) as LeadCategory[]).map(cat => {
              const Icon = CAT_ICONS[cat];
              const active = category === cat;
              return (
                <button key={cat} onClick={() => setCategory(cat)}
                  className="flex flex-col items-center gap-0.5 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all"
                  style={active
                    ? { background: T.accent + "15", color: T.accent, border: `1px solid ${T.accent}30` }
                    : { background: T.surface, color: T.secondary, border: "1px solid transparent" }
                  }>
                  <Icon className="h-3.5 w-3.5" />
                  {LEAD_CATEGORY_LABELS[cat].split("/")[0].slice(0, 5)}
                </button>
              );
            })}
          </div>
          <textarea rows={2} placeholder="Catatan (opsional)"
            value={notes} onChange={e => setNotes(e.target.value)}
            className="w-full text-sm rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2"
            style={{ background: T.surface, border: "none", color: T.textSoft }} />
          <div className="flex gap-2">
            <button
              onClick={async () => {
                if (!name.trim()) return toast.error("Nama wajib diisi");
                // Reverse geocode untuk auto-fill district + village (non-blocking, 2.5s timeout)
                let district: string | undefined; let village: string | undefined; let address: string | undefined;
                try {
                  const geoPromise = reverseGeocode(lat, lng);
                  const timeout = new Promise<null>((r) => setTimeout(() => r(null), 2500));
                  const geo = await Promise.race([geoPromise, timeout]);
                  if (geo) {
                    district = geo.district || undefined;
                    village = geo.village || undefined;
                    address = geo.formatted || undefined;
                  }
                } catch { /* diam - save tetap jalan */ }
                onSave({
                  name: name.trim(), phone: phone.trim() || undefined,
                  category, notes: notes.trim() || undefined,
                  lat, lng, source: "canvassing", canvassingSessionId: sessionId,
                  odpId: nearest?.odp.id, distanceMeters: nearest?.distance,
                  district, village, address,
                });
              }}
              disabled={isSaving}
              className="flex-1 py-2.5 text-sm text-white rounded-xl font-bold disabled:opacity-50"
              style={{ background: T.accent }}
            >
              {isSaving ? "Menyimpan..." : "Simpan Prospek"}
            </button>
            <button onClick={onCancel}
              className="px-4 py-2.5 text-sm rounded-xl font-medium"
              style={{ background: T.surfaceHi, color: T.secondary }}>
              Batal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// -- Field Report Form (BI) ------------------------------------------------
