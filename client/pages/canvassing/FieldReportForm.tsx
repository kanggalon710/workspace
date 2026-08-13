import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { X, CircleDot, FileText } from "lucide-react";
import { compressImage, formatBytes } from "@/lib/imageCompress";
import { T, LOG_TYPES, LOG_TYPE_MAP, SEVERITY_OPTIONS, findNearestOdp, type Odp } from "./shared";

export function FieldReportForm({ lat, lng, odps, sessionId, onSave, onCancel, isSaving }: {
  lat: number; lng: number; odps: Odp[]; sessionId: number;
  onSave: (data: any) => void; onCancel: () => void; isSaving: boolean;
}) {
  const [logType, setLogType] = useState("area_sepi");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("info");
  const [photoData, setPhotoData] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const nearest = findNearestOdp(lat, lng, odps);

  // Auto-generate title based on type
  useEffect(() => {
    const cfg = LOG_TYPE_MAP[logType];
    if (cfg) setTitle(cfg.label);
  }, [logType]);

  const [photoCompressing, setPhotoCompressing] = useState(false);
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset biar bisa pilih file sama lagi
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("File harus berupa gambar");
      return;
    }
    // Auto-compress tanpa ada batasan size - user kasih foto 20MB pun oke,
    // akan otomatis di-resize ke 1280px + JPEG q=0.72 (~200KB)
    setPhotoCompressing(true);
    try {
      const result = await compressImage(file);
      setPhotoData(result.dataUrl);
      // Info saja kalau hasil kecil banget (bukan error)
      const ratio = result.originalBytes > 0
        ? Math.round((1 - result.compressedBytes / result.originalBytes) * 100)
        : 0;
      if (ratio > 30) {
        toast.success(`Foto di-compress ${formatBytes(result.originalBytes)} → ${formatBytes(result.compressedBytes)}`, { duration: 2000 });
      }
    } catch (err: any) {
      toast.error(err?.message || "Gagal proses foto");
    } finally {
      setPhotoCompressing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="rounded-t-2xl md:rounded-2xl shadow-2xl p-5 w-full max-w-sm mx-auto overflow-y-auto max-h-[90vh]"
        style={{ background: T.bg }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: "#3B82F615" }}>
              <FileText className="h-4 w-4" style={{ color: "#3B82F6" }} />
            </div>
            <div>
              <h3 className="font-bold text-sm" style={{ color: T.deep }}>Laporan Lapangan</h3>
              <p className="text-[10px]" style={{ color: T.secondary }}>Catat kondisi area untuk analisis</p>
            </div>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-lg" style={{ background: T.surfaceHi }}>
            <X className="h-4 w-4" style={{ color: T.secondary }} />
          </button>
        </div>

        {/* Nearest ODP indicator */}
        {nearest && (
          <div className="flex items-center gap-2 text-xs rounded-xl px-3 py-2 mb-3"
            style={{ background: T.surface, color: T.secondary }}>
            <CircleDot className="h-3.5 w-3.5 shrink-0" style={{ color: T.accent }} />
            <span>ODP terdekat: <strong style={{ color: T.deep }}>{nearest.odp.name}</strong> ({nearest.distance}m)</span>
          </div>
        )}

        <div className="space-y-3">
          {/* Log type selector */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: T.outline }}>Jenis Laporan</p>
            <div className="grid grid-cols-3 gap-2">
              {LOG_TYPES.map(lt => {
                const Icon = lt.icon;
                const active = logType === lt.key;
                return (
                  <button key={lt.key} onClick={() => { setLogType(lt.key); setTitle(lt.label); }}
                    className="flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl text-center transition-all"
                    style={active
                      ? { background: lt.color + "15", border: `1px solid ${lt.color}30`, color: lt.color }
                      : { background: T.surface, border: "1px solid transparent", color: T.secondary }
                    }>
                    <Icon className="h-4 w-4" />
                    <span className="text-[9px] font-bold uppercase tracking-widest leading-tight">{lt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Severity */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: T.outline }}>Tingkat</p>
            <div className="flex gap-2">
              {SEVERITY_OPTIONS.map(s => (
                <button key={s.key} onClick={() => setSeverity(s.key)}
                  className="flex-1 py-2 text-xs font-bold rounded-xl transition-all text-center"
                  style={severity === s.key
                    ? { background: s.color, color: "white" }
                    : { background: T.surface, color: T.secondary }
                  }>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <input type="text" placeholder="Judul laporan *"
            value={title} onChange={e => setTitle(e.target.value)}
            className="w-full text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2"
            style={{ background: T.surface, border: "none", color: T.textSoft }} />

          {/* Description */}
          <textarea rows={3} placeholder="Deskripsi kondisi area, permasalahan yang ditemui, saran..."
            value={description} onChange={e => setDescription(e.target.value)}
            className="w-full text-sm rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2"
            style={{ background: T.surface, border: "none", color: T.textSoft }} />

          {/* Photo capture - realtime camera OR pick from gallery (auto-compress) */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: T.outline }}>
              Bukti Foto {photoData ? "✓" : "(opsional)"}
            </p>
            {photoCompressing ? (
              <div className="w-full h-48 rounded-xl flex flex-col items-center justify-center gap-2 animate-pulse" style={{ background: T.surface }}>
                <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: T.outlineV, borderTopColor: T.accent }} />
                <span className="text-[11px]" style={{ color: T.secondary }}>Memproses foto...</span>
              </div>
            ) : photoData ? (
              <div className="relative">
                <img src={photoData} alt="Bukti laporan" className="w-full h-48 object-cover rounded-xl" />
                <button
                  onClick={() => setPhotoData(null)}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 backdrop-blur-sm text-white flex items-center justify-center hover:bg-red-500"
                  type="button"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  className="absolute bottom-2 right-2 text-[10px] bg-black/60 backdrop-blur-sm text-white rounded-full px-3 py-1.5 font-bold uppercase tracking-widest hover:bg-black/80"
                  type="button"
                >
                  Foto Ulang
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  type="button"
                  className="flex flex-col items-center justify-center gap-1.5 py-4 rounded-xl border-2 border-dashed transition-colors hover:bg-accent/10"
                  style={{ borderColor: T.outlineV, color: T.accent }}
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-[10px] font-bold uppercase tracking-widest">Kamera</span>
                </button>
                <button
                  onClick={() => galleryInputRef.current?.click()}
                  type="button"
                  className="flex flex-col items-center justify-center gap-1.5 py-4 rounded-xl border-2 border-dashed transition-colors hover:bg-accent/10"
                  style={{ borderColor: T.outlineV, color: T.secondary }}
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-[10px] font-bold uppercase tracking-widest">Galeri</span>
                </button>
              </div>
            )}
            {/* Hidden inputs - camera uses capture="environment" (back camera), gallery tanpa capture */}
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoSelect} />
            <input ref={galleryInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (!title.trim()) return toast.error("Judul wajib diisi");
                onSave({
                  sessionId, type: logType, title: title.trim(),
                  description: description.trim() || undefined,
                  lat, lng, odpId: nearest?.odp.id, severity,
                  photoData: photoData || undefined,
                });
              }}
              disabled={isSaving}
              className="flex-1 py-2.5 text-sm text-white rounded-xl font-bold disabled:opacity-50"
              style={{ background: "#3B82F6" }}
            >
              {isSaving ? "Menyimpan..." : "Simpan Laporan"}
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

// -- Main Page --------------------------------------------------------------
