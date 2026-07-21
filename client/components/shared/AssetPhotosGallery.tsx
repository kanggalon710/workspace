// Galeri foto aset generik - dipakai oleh ODP/ODC/Tiang di halaman aset (grid) & panel /map (scroll).
// Backend: GET/POST/DELETE /api/asset-photos/:type/:id (+ /cover). Penyimpanan filesystem via server/uploads.ts.
// Sumber data tunggal tabel asset_photos (odp_photos lama sudah dimigrasi).
import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { compressImage, formatBytes } from "@/lib/imageCompress";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

export type AssetPhotoKind = "odp" | "odc" | "pole";

interface AssetPhotoMeta {
  id: number;
  caption: string | null;
  uploadedBy: number;
  isCover: boolean;
  createdAt: string;
}

// Tipe aset → permission key tulis (selaras gating server di /api/asset-photos).
const FEATURE_BY_KIND: Record<AssetPhotoKind, string> = { odp: "odps", odc: "odcs", pole: "poles" };

/** layout:
 *  - "grid"   → 3 kolom (default, dipakai di halaman aset; aksi muncul saat hover - konteks desktop).
 *  - "scroll" → satu baris geser horizontal (dipakai di panel /map yang sempit & mobile-heavy;
 *               aksi selalu tampil agar bisa ditekan di layar sentuh). */
export function AssetPhotosGallery({
  assetType,
  assetId,
  layout = "grid",
}: {
  assetType: AssetPhotoKind;
  assetId: number;
  layout?: "grid" | "scroll";
}) {
  const qc = useQueryClient();
  const { canWrite } = useAuth();
  // Lihat foto cukup login; upload/ubah/hapus butuh izin tulis sesuai tipe aset (selaras server).
  const canEdit = canWrite(FEATURE_BY_KIND[assetType]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const base = `/asset-photos/${assetType}/${assetId}`;
  const photosKey = ["/api/asset-photos", assetType, assetId, "photos"];

  const { data: photos = [], isLoading } = useQuery<AssetPhotoMeta[]>({
    queryKey: photosKey,
    queryFn: () => api.get<AssetPhotoMeta[]>(base),
    enabled: assetId > 0,
  });

  const uploadMutation = useMutation({
    mutationFn: async (input: { photoData: string; isCover: boolean; caption?: string }) =>
      api.post<AssetPhotoMeta>(base, input),
    onSuccess: () => {
      toast.success("Foto berhasil diupload");
      qc.invalidateQueries({ queryKey: photosKey });
    },
    onError: (e: any) => toast.error(e?.message ?? "Gagal upload foto"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (photoId: number) =>
      api.delete<{ deleted: boolean }>(`${base}/${photoId}`),
    onSuccess: () => {
      toast.success("Foto dihapus");
      qc.invalidateQueries({ queryKey: photosKey });
    },
    onError: (e: any) => toast.error(e?.message ?? "Gagal hapus foto"),
  });

  const coverMutation = useMutation({
    mutationFn: async (photoId: number) =>
      api.post<{ ok: boolean }>(`${base}/${photoId}/cover`, {}),
    onSuccess: () => {
      toast.success("Foto cover di-update");
      qc.invalidateQueries({ queryKey: photosKey });
    },
    onError: (e: any) => toast.error(e?.message ?? "Gagal set cover"),
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // reset agar bisa pilih file sama 2x
    if (!file.type.startsWith("image/")) {
      toast.error("File harus berupa gambar");
      return;
    }
    setUploading(true);
    try {
      const result = await compressImage(file);
      const ratio = result.originalBytes > 0
        ? Math.round((1 - result.compressedBytes / result.originalBytes) * 100)
        : 0;
      if (ratio > 5) {
        toast.message(`Foto di-compress ${formatBytes(result.originalBytes)} → ${formatBytes(result.compressedBytes)}`);
      }
      await uploadMutation.mutateAsync({
        photoData: result.dataUrl,
        isCover: photos.length === 0, // foto pertama otomatis jadi cover
      });
    } catch (err: any) {
      toast.error(err?.message ?? "Gagal proses foto");
    } finally {
      setUploading(false);
    }
  };

  const isScroll = layout === "scroll";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">
          Foto {photos.length > 0 && <span className="text-muted-foreground font-normal">({photos.length})</span>}
        </Label>
        {canEdit && (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? "Mengunggah..." : "+ Tambah Foto"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileSelect}
            />
          </>
        )}
      </div>

      {isLoading ? (
        <div className="text-xs text-muted-foreground">Memuat foto...</div>
      ) : photos.length === 0 ? (
        <div className="text-xs text-muted-foreground border border-dashed rounded-md p-4 text-center">
          {canEdit
            ? "Belum ada foto. Upload foto untuk dokumentasi (depan, dalam, splitter, sticker)."
            : "Belum ada foto."}
        </div>
      ) : (
        <div
          className={cn(
            isScroll
              ? "flex gap-2 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-1 -mx-1 px-1"
              : "grid grid-cols-3 gap-2",
          )}
        >
          {photos.map((p) => (
            <div
              key={p.id}
              className={cn(
                "relative rounded-md overflow-hidden border border-border bg-muted",
                isScroll ? "snap-start shrink-0 w-28" : "group",
              )}
            >
              {/* Tap/klik gambar → buka full-size di tab baru (preview) */}
              <a href={`/api${base}/${p.id}`} target="_blank" rel="noopener noreferrer" className="block">
                <img
                  src={`/api${base}/${p.id}`}
                  alt={p.caption ?? `Foto ${assetType} ${p.id}`}
                  className="w-full h-24 object-cover"
                  loading="lazy"
                />
              </a>
              {p.isCover && (
                <span className="absolute top-1 left-1 text-[10px] px-1.5 py-0.5 rounded bg-primary text-primary-foreground font-semibold pointer-events-none">
                  Cover
                </span>
              )}

              {!canEdit ? null : isScroll ? (
                /* Mobile/panel sempit: aksi selalu tampil (hover tidak ada di layar sentuh) */
                <div className="flex border-t border-border/60">
                  {!p.isCover && (
                    <button
                      type="button"
                      className="flex-1 text-[10px] py-1 text-primary hover:bg-primary/10 transition-colors"
                      onClick={() => coverMutation.mutate(p.id)}
                    >
                      Cover
                    </button>
                  )}
                  <button
                    type="button"
                    className="flex-1 text-[10px] py-1 text-destructive hover:bg-destructive/10 transition-colors"
                    onClick={() => {
                      if (confirm("Hapus foto ini?")) deleteMutation.mutate(p.id);
                    }}
                  >
                    Hapus
                  </button>
                </div>
              ) : (
                /* Desktop halaman aset: overlay muncul saat hover */
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-black/60 flex flex-col items-center justify-center gap-1 transition-opacity">
                  {!p.isCover && (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="h-6 text-[10px]"
                      onClick={() => coverMutation.mutate(p.id)}
                    >
                      Set Cover
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    className="h-6 text-[10px]"
                    onClick={() => {
                      if (confirm("Hapus foto ini?")) deleteMutation.mutate(p.id);
                    }}
                  >
                    Hapus
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
