/**
 * v4.2.18 (B.4): MultiPhotoUploader
 * - Up to N photos (default 4)
 * - Each photo: capture GPS via navigator.geolocation
 * - EXIF timestamp captured at upload time
 * - Configurable slot labels (Sebelum / Sesudah / Lokasi / Material)
 * - Auto-compress to 1280px max @ 0.7 quality
 * - GPS metadata stored di attachment.metadata
 */

import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Camera, X, Loader2, MapPin, AlertTriangle, CheckCircle2 } from "lucide-react";

export interface PhotoSlot {
  type: string;
  label: string;
  required?: boolean;
}

export const DEFAULT_PHOTO_SLOTS: PhotoSlot[] = [
  { type: "before",    label: "Sebelum",  required: false },
  { type: "during",    label: "Proses",   required: false },
  { type: "after",     label: "Sesudah",  required: false },
  { type: "material",  label: "Material", required: false },
];

interface UploadedPhoto {
  id?: number;          // backend evidence ID after upload
  type: string;
  dataUrl: string;
  gpsLat: number | null;
  gpsLng: number | null;
  capturedAt: string;
  uploading: boolean;
  error?: string;
}

function getGps(timeoutMs = 10000): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}

async function compress(file: File, maxSize = 1280, quality = 0.72): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Gagal baca file"));
    reader.readAsDataURL(file);
  });
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height);
        width = Math.round(width * ratio); height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d")?.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export function MultiPhotoUploader({
  ticketId, slots = DEFAULT_PHOTO_SLOTS, maxCount, requireGPS = true,
  initialPhotos = [], onChange,
}: {
  ticketId: number;
  slots?: PhotoSlot[];
  maxCount?: number;
  requireGPS?: boolean;
  initialPhotos?: Array<{ id: number; type: string; photoData?: string | null; hasPhoto?: boolean; lat: number | null; lng: number | null; capturedAt: string | null }>;
  onChange?: (ids: number[]) => void;
}) {
  const [photos, setPhotos] = useState<UploadedPhoto[]>(
    initialPhotos.map(p => ({
      id: p.id, type: p.type,
      // Foto tersimpan di server → stream via endpoint (base64 legacy juga dilayani endpoint yang sama).
      dataUrl: (p.hasPhoto || p.photoData) ? `/api/tickets/${ticketId}/evidence/${p.id}/photo` : "",
      gpsLat: p.lat, gpsLng: p.lng,
      capturedAt: p.capturedAt ?? new Date().toISOString(),
      uploading: false,
    })),
  );
  const [activeSlot, setActiveSlot] = useState<string>(slots[0]?.type ?? "during");
  const fileRef = useRef<HTMLInputElement>(null);

  const max = maxCount ?? slots.length;

  const uploadMut = useMutation({
    mutationFn: async (data: { type: string; photoData: string; lat: number | null; lng: number | null; capturedAt: string }) => {
      return api.post<any>(`/tickets/${ticketId}/evidence`, {
        type: data.type, photoData: data.photoData,
        lat: data.lat, lng: data.lng,
        notes: JSON.stringify({ capturedAt: data.capturedAt }),
      });
    },
  });

  async function handleFile(file: File) {
    if (photos.length >= max) {
      toast.error(`Maksimal ${max} foto`);
      return;
    }
    // Capture GPS first (kalau required)
    let gps: { lat: number; lng: number } | null = null;
    if (requireGPS) {
      gps = await getGps();
      if (!gps) toast.warning("GPS tidak tersedia - foto tetap diupload tanpa lokasi");
    }
    const capturedAt = new Date().toISOString();
    let preview = "";
    try {
      preview = await compress(file, 1280, 0.72);
    } catch (e: any) {
      toast.error(e.message || "Gagal proses foto");
      return;
    }
    // Add preview to state
    const tempIdx = photos.length;
    setPhotos((p) => [...p, {
      type: activeSlot, dataUrl: preview,
      gpsLat: gps?.lat ?? null, gpsLng: gps?.lng ?? null,
      capturedAt, uploading: true,
    }]);
    // Upload
    try {
      const r = await uploadMut.mutateAsync({
        type: activeSlot, photoData: preview,
        lat: gps?.lat ?? null, lng: gps?.lng ?? null,
        capturedAt,
      });
      const id = r?.id ?? r?.data?.id;
      setPhotos((p) => {
        const next = [...p];
        if (next[tempIdx]) {
          next[tempIdx] = { ...next[tempIdx], id, uploading: false };
        }
        // Notify parent of all current evidence IDs
        if (onChange) onChange(next.filter(x => x.id).map(x => x.id!));
        return next;
      });
      toast.success(`Foto "${slots.find(s => s.type === activeSlot)?.label || activeSlot}" terupload`);
    } catch (e: any) {
      setPhotos((p) => {
        const next = [...p];
        if (next[tempIdx]) {
          next[tempIdx] = { ...next[tempIdx], uploading: false, error: e.message };
        }
        return next;
      });
      toast.error(e.message || "Upload gagal");
    }
  }

  function removePhoto(idx: number) {
    const photo = photos[idx];
    setPhotos((p) => {
      const next = p.filter((_, i) => i !== idx);
      if (onChange) onChange(next.filter(x => x.id).map(x => x.id!));
      return next;
    });
    // Note: ngga delete dari server untuk simplicity. Bisa ditambah DELETE /evidence/:id endpoint nanti.
  }

  return (
    <div className="space-y-2">
      {/* Slot picker */}
      {slots.length > 1 && (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mr-1">Slot:</span>
          {slots.map(s => (
            <button
              key={s.type}
              type="button"
              onClick={() => setActiveSlot(s.type)}
              className={cn(
                "text-[11px] px-2 py-0.5 rounded font-semibold border transition-colors",
                activeSlot === s.type
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card hover:bg-muted",
                s.required && "ring-1 ring-rose-200",
              )}
            >
              {s.label}{s.required ? " *" : ""}
            </button>
          ))}
        </div>
      )}

      {/* Grid thumbnails */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {photos.map((p, idx) => (
          <div key={idx} className="relative aspect-square rounded-md overflow-hidden border bg-muted group">
            {p.dataUrl && <img src={p.dataUrl} alt="" className="w-full h-full object-cover" />}
            {p.uploading && (
              <div className="absolute inset-0 bg-black/40 grid place-items-center">
                <Loader2 className="w-5 h-5 animate-spin text-white" />
              </div>
            )}
            {p.error && (
              <div className="absolute inset-0 bg-rose-500/80 grid place-items-center text-white text-[10px] p-2 text-center">
                <AlertTriangle className="w-4 h-4 mb-1" />
                <span>{p.error.slice(0, 30)}</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => removePhoto(idx)}
              className="absolute top-1 right-1 p-1 rounded-full bg-rose-500 text-white opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="w-3 h-3" />
            </button>
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent text-white text-[9px] font-bold uppercase tracking-wider px-1.5 py-1 flex items-center justify-between">
              <span>{slots.find(s => s.type === p.type)?.label || p.type}</span>
              {p.gpsLat != null && <MapPin className="w-2.5 h-2.5" />}
            </div>
            {p.id && !p.uploading && !p.error && (
              <div className="absolute top-1 left-1 p-1 rounded-full bg-emerald-500 text-white">
                <CheckCircle2 className="w-2.5 h-2.5" />
              </div>
            )}
          </div>
        ))}
        {/* Add button */}
        {photos.length < max && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="aspect-square rounded-md border-2 border-dashed border-muted-foreground/30 hover:border-primary hover:bg-primary/5 grid place-items-center transition-colors"
          >
            <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
              <Camera className="w-5 h-5" />
              <span className="text-[10px] font-semibold uppercase tracking-wider">Ambil Foto</span>
              <span className="text-[9px]">{slots.find(s => s.type === activeSlot)?.label || activeSlot}</span>
            </div>
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
      />

      <div className="text-[10px] text-muted-foreground">
        {photos.length}/{max} foto · auto-compressed 1280px · GPS {requireGPS ? "wajib" : "opsional"}
      </div>
    </div>
  );
}
