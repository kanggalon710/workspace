/**
 * v4.2.19: Template Editor - konten + placeholder + footer + buttons + media
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Plus, Trash2, Save, Loader2, Image as ImageIcon, Video, FileText, MessageSquare, ExternalLink, Phone } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";

export interface MpwaButton {
  // Sesuai spec MPWA /public/send-button:
  //   reply (quick reply) | call (telepon) | url (link) | copy (paste-to-clipboard)
  type: "reply" | "call" | "url" | "copy";
  label: string;
  payload?: string;
}

export interface TemplateData {
  id?: number;
  key: string;
  name: string;
  description?: string | null;
  content: string;
  category?: string;
  isSystem?: number;
  footer?: string | null;
  buttons?: string | null;          // JSON string
  mediaUrl?: string | null;
  mediaType?: string | null;
}

const COMMON_VARS = [
  { key: "nama",       desc: "Nama pelanggan" },
  { key: "customerId", desc: "ID pelanggan (058500012)" },
  { key: "package",    desc: "Nama paket internet" },
  { key: "amount",     desc: "Nominal tagihan (Rp)" },
  { key: "dueDate",    desc: "Tanggal jatuh tempo" },
  { key: "cs",         desc: "Nama CS / signature" },
];

export function TemplateEditor({
  open, onClose, template, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  template?: TemplateData | null;        // null = create mode, object = edit
  onSaved?: (t: TemplateData) => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!template?.id;

  const [data, setData] = useState<TemplateData>(() => ({
    key: template?.key ?? "",
    name: template?.name ?? "",
    description: template?.description ?? "",
    content: template?.content ?? "",
    category: template?.category ?? "broadcast",
    footer: template?.footer ?? "",
    mediaUrl: template?.mediaUrl ?? "",
    mediaType: template?.mediaType ?? "",
    isSystem: template?.isSystem ?? 0,
  }));
  const [buttons, setButtons] = useState<MpwaButton[]>(() => {
    try { return template?.buttons ? JSON.parse(template.buttons) : []; }
    catch { return []; }
  });

  useEffect(() => {
    if (template) {
      setData({
        id: template.id,
        key: template.key,
        name: template.name,
        description: template.description ?? "",
        content: template.content,
        category: template.category ?? "broadcast",
        footer: template.footer ?? "",
        mediaUrl: template.mediaUrl ?? "",
        mediaType: template.mediaType ?? "",
        isSystem: template.isSystem,
      });
      try { setButtons(template.buttons ? JSON.parse(template.buttons) : []); }
      catch { setButtons([]); }
    } else {
      setData({ key: "", name: "", description: "", content: "", category: "broadcast", footer: "", mediaUrl: "", mediaType: "", isSystem: 0 });
      setButtons([]);
    }
  }, [template, open]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload: any = {
        ...data,
        buttons: buttons.length > 0 ? JSON.stringify(buttons) : null,
      };
      if (isEdit) {
        return api.put(`/mpwa/templates/${template!.id}`, payload);
      }
      return api.post("/mpwa/templates", payload);
    },
    onSuccess: (t: any) => {
      toast.success(isEdit ? "Template tersimpan" : "Template dibuat");
      qc.invalidateQueries({ queryKey: ["mpwa-templates"] });
      onSaved?.(t);
      onClose();
    },
    onError: (e: any) => toast.error(e.message || "Gagal simpan"),
  });

  function insertVar(key: string) {
    setData(d => ({ ...d, content: (d.content ?? "") + `{${key}}` }));
  }

  function addButton() {
    if (buttons.length >= 5) {
      toast.warning("Max 5 button per pesan (spec MPWA send-button)");
      return;
    }
    setButtons([...buttons, { type: "reply", label: "Tombol Baru", payload: "" }]);
  }
  function updateButton(idx: number, patch: Partial<MpwaButton>) {
    setButtons(buttons.map((b, i) => i === idx ? { ...b, ...patch } : b));
  }
  function removeButton(idx: number) {
    setButtons(buttons.filter((_, i) => i !== idx));
  }

  function handleSubmit() {
    if (!data.name.trim()) { toast.error("Name wajib"); return; }
    if (!data.content.trim()) { toast.error("Content wajib"); return; }
    if (!isEdit && !data.key.trim()) { toast.error("Key wajib (untuk identify template)"); return; }
    saveMut.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            {isEdit ? `Edit Template: ${template?.name}` : "Buat Template Baru"}
          </DialogTitle>
          <DialogDescription>
            Template pesan WhatsApp dengan placeholder, footer, button interaktif, dan media attachment.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          {/* Basic info */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider">Key (identifier)</label>
              <Input
                value={data.key}
                onChange={(e) => setData(d => ({ ...d, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") }))}
                placeholder="contoh: promo_lebaran"
                disabled={isEdit}
                className="text-sm font-mono mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider">Nama Display</label>
              <Input
                value={data.name}
                onChange={(e) => setData(d => ({ ...d, name: e.target.value }))}
                placeholder="Promo Lebaran 2026"
                className="text-sm mt-1"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider">Deskripsi (opsional)</label>
            <Input
              value={data.description ?? ""}
              onChange={(e) => setData(d => ({ ...d, description: e.target.value }))}
              placeholder="Untuk broadcast saat Ramadhan"
              className="text-sm mt-1"
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider">Kategori</label>
            <select
              value={data.category ?? "broadcast"}
              onChange={(e) => setData(d => ({ ...d, category: e.target.value }))}
              className="w-full mt-1 px-3 py-2 rounded-md border bg-background text-sm"
            >
              <option value="broadcast">Broadcast</option>
              <option value="general">General</option>
              <option value="billing">Billing</option>
              <option value="notification">Notification</option>
              <option value="auth">Auth (OTP)</option>
            </select>
          </div>

          {/* Content */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider">Isi Pesan</label>
            <Textarea
              value={data.content}
              onChange={(e) => setData(d => ({ ...d, content: e.target.value }))}
              placeholder="Halo {nama}, ada promo spesial Lebaran nih!..."
              rows={6}
              className="text-sm mt-1 font-mono"
            />
            <div className="mt-1.5 flex flex-wrap gap-1 items-center">
              <span className="text-[10px] text-muted-foreground">Klik untuk insert placeholder:</span>
              {COMMON_VARS.map(v => (
                <button
                  key={v.key}
                  onClick={() => insertVar(v.key)}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 font-mono"
                  title={v.desc}
                >
                  {`{${v.key}}`}
                </button>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider">Footer (opsional)</label>
            <Input
              value={data.footer ?? ""}
              onChange={(e) => setData(d => ({ ...d, footer: e.target.value }))}
              placeholder="JABNET - Internet Cepat & Stabil"
              className="text-sm mt-1"
              maxLength={60}
            />
            <p className="text-[10px] text-muted-foreground mt-0.5">Teks kecil di bagian bawah pesan (max 60 char)</p>
          </div>

          {/* Buttons */}
          <div className="rounded-md border bg-muted/20 p-3">
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider">Tombol Interaktif</div>
                <p className="text-[10px] text-muted-foreground">Max 5 tombol · type: Reply, Call, URL, atau Copy</p>
              </div>
              <Button size="xs" variant="ghost-primary" onClick={addButton} leftIcon={<Plus className="h-3 w-3" />}>
                Tambah Tombol
              </Button>
            </div>

            {/* Info: native button butuh image */}
            <div className="mb-2 px-2.5 py-1.5 rounded bg-sky-50 border border-sky-200 text-[10px] text-sky-900 leading-snug">
              <strong> Cara kerja MPWA send-button:</strong> Native button interaktif HANYA muncul kalau template
              juga punya <strong>image attachment</strong> (image header wajib di MPWA spec). Kalau template
              gak punya image, button otomatis di-render sebagai <em>formatted text</em> di body pesan (selalu muncul).
            </div>
            {!data.mediaUrl && buttons.length > 0 && (
              <div className="mb-2 px-2.5 py-1.5 rounded bg-amber-50 border border-amber-200 text-[10px] text-amber-900 leading-snug">
                <strong> Mode Fallback Aktif:</strong> Template ini punya button tapi belum punya image -
                button akan dikirim sebagai <strong>text format</strong>. Untuk native button interaktif,
                tambahkan Image URL di section Media Attachment di bawah.
              </div>
            )}
            {buttons.length === 0 ? (
              <div className="text-[11px] text-muted-foreground italic text-center py-3">
                Belum ada tombol. Pesan akan dikirim sebagai teks biasa.
              </div>
            ) : (
              <div className="space-y-1.5">
                {buttons.map((b, i) => (
                  <div key={i} className="grid grid-cols-12 gap-1.5 items-center bg-background rounded p-1.5 border">
                    <select
                      value={b.type}
                      onChange={(e) => updateButton(i, { type: e.target.value as any })}
                      className="col-span-2 px-1.5 py-1.5 rounded border bg-background text-xs"
                    >
                      <option value="reply">Reply</option>
                      <option value="url">URL</option>
                      <option value="call">Call</option>
                      <option value="copy">Copy</option>
                    </select>
                    <Input
                      placeholder="Label tombol (ex: 'Bayar Sekarang')"
                      value={b.label}
                      onChange={(e) => updateButton(i, { label: e.target.value })}
                      className="col-span-4 text-xs h-8"
                      maxLength={20}
                    />
                    <Input
                      placeholder={
                        b.type === "url" ? "https://pay.jabnet.id" :
                        b.type === "call" ? "628xxx (nomor tujuan)" :
                        b.type === "copy" ? "Text yang di-copy (ex: PROMO50)" :
                        "payload-id (optional)"
                      }
                      value={b.payload ?? ""}
                      onChange={(e) => updateButton(i, { payload: e.target.value })}
                      className="col-span-5 text-xs h-8 font-mono"
                    />
                    <button
                      onClick={() => removeButton(i)}
                      className="col-span-1 h-8 grid place-items-center text-rose-600 hover:bg-rose-50 rounded"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Media */}
          <div className="rounded-md border bg-muted/20 p-3">
            <div className="text-xs font-bold uppercase tracking-wider mb-2">Media Attachment (opsional)</div>
            <div className="grid grid-cols-12 gap-1.5">
              <select
                value={data.mediaType ?? ""}
                onChange={(e) => setData(d => ({ ...d, mediaType: e.target.value }))}
                className="col-span-3 px-1.5 py-1.5 rounded border bg-background text-xs"
              >
                <option value="">Tidak ada</option>
                <option value="image">Image</option>
                <option value="video">Video</option>
                <option value="document">Document (PDF)</option>
              </select>
              <Input
                placeholder="https://cdn.jabnet.id/promo.jpg"
                value={data.mediaUrl ?? ""}
                onChange={(e) => setData(d => ({ ...d, mediaUrl: e.target.value }))}
                className="col-span-9 text-xs h-8 font-mono"
                disabled={!data.mediaType}
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              URL harus public-accessible. Kalau set, pesan dikirim sebagai media dengan caption = isi pesan.
            </p>
          </div>

          {/* Preview - sesuai render aktual di HP */}
          {(() => {
            const useNativeButton = buttons.length > 0 && data.mediaType === "image" && !!data.mediaUrl;
            return (
              <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50/40 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                     Preview pesan WhatsApp
                  </div>
                  {buttons.length > 0 && (
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${
                      useNativeButton ? "bg-emerald-200 text-emerald-800" : "bg-amber-200 text-amber-800"
                    }`}>
                      Mode: {useNativeButton ? "Native Button ✓" : "Text Fallback"}
                    </span>
                  )}
                </div>
                <div className="bg-white rounded-lg p-3 shadow-sm max-w-sm">
                  {data.mediaUrl && data.mediaType && (
                    <div className="mb-2 rounded bg-zinc-100 grid place-items-center aspect-video text-zinc-400 text-xs">
                      {data.mediaType === "image" && <ImageIcon className="h-6 w-6" />}
                      {data.mediaType === "video" && <Video className="h-6 w-6" />}
                      {data.mediaType === "document" && <FileText className="h-6 w-6" />}
                      <span className="text-[10px] ml-1">{data.mediaType.toUpperCase()}</span>
                    </div>
                  )}
                  <div className="text-sm whitespace-pre-wrap leading-snug font-mono">
                    {data.content || <span className="text-muted-foreground italic">(belum ada isi)</span>}
                    {/* Kalau native button (ada image) → render sebagai tombol React; kalau enggak → text */}
                    {buttons.length > 0 && !useNativeButton && (
                      <>
                        {"\n\n---------------"}
                        {buttons.map((b, i) => {
                          const icon = b.type === "url" ? "" :
                                       b.type === "call" ? "" :
                                       b.type === "copy" ? "" : "▶";
                          let actionLine = "";
                          if (b.type === "url" && b.payload) actionLine = `\n   ${b.payload}`;
                          else if (b.type === "call" && b.payload) actionLine = `\n   https://wa.me/${b.payload.replace(/\D/g, "")}`;
                          else if (b.type === "copy" && b.payload) actionLine = `\n   Kode: *${b.payload}* _(copy manual)_`;
                          else if (b.payload) actionLine = `\n   _Balas: ${b.payload}_`;
                          return (
                            <span key={i}>{`\n${icon} `}<strong>{b.label}</strong>{actionLine}</span>
                          );
                        })}
                        {"\n---------------"}
                      </>
                    )}
                  </div>
                  {data.footer && (
                    <div className="text-[11px] text-muted-foreground mt-2 italic">{data.footer}</div>
                  )}
                  {/* Native button render - kotak tombol di bawah pesan */}
                  {buttons.length > 0 && useNativeButton && (
                    <div className="mt-2 pt-2 border-t flex flex-col gap-1">
                      {buttons.map((b, i) => {
                        const Icon =
                          b.type === "url"  ? ExternalLink :
                          b.type === "call" ? Phone :
                          b.type === "copy" ? FileText :
                          MessageSquare;
                        return (
                          <div key={i} className="text-xs text-sky-600 font-semibold py-1.5 border rounded text-center cursor-pointer hover:bg-sky-50 flex items-center justify-center gap-1.5">
                            <Icon className="h-3 w-3" />
                            {b.label}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-emerald-700 mt-2 italic">
                  {useNativeButton
                    ? "Native button: tap-able langsung di WhatsApp dengan image header."
                    : "Text fallback: link URL & wa.me tetap tap-able. Tambah Image URL untuk native button."}
                </p>
              </div>
            );
          })()}
        </div>

        <DialogFooter className="mt-3">
          <Button variant="ghost" onClick={onClose} disabled={saveMut.isPending}>Batal</Button>
          <Button
            onClick={handleSubmit}
            loading={saveMut.isPending}
            leftIcon={<Save className="h-3.5 w-3.5" />}
          >
            {isEdit ? "Simpan Perubahan" : "Buat Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
