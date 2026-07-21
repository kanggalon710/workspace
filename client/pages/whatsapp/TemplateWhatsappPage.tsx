/**
 * v4.2.20 (PRD WA Feature v2): Template Whatsapp
 *
 * Fitur sesuai PRD:
 * - Tabs Unofficial / Official
 * - Tombol Tambah Baru dengan dropdown (Template Pelanggan / Template Reseller)
 * - Filter: Seluruh Template / Pelanggan / Reseller
 * - Form: Nama Template, Tampilkan Pelanggan (Seluruh / Belum Bayar)
 * - Editor WYSIWYG B/I/U + preview real-time WhatsApp bubble
 * - Modal "Petunjuk Pengisian Parameter Whatsapp" dengan 28 params
 * - Toggle "Tampilkan Template Keseluruh Reseller"
 */

import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  Plus, Trash2, Edit3, MessageSquare, Loader2, Search, ChevronDown, ChevronRight,
  ArrowLeft, Save, Info, Bold, Italic, Underline, MessageCircle, Eye, X,
  Image as ImageIcon, Phone, ExternalLink, Copy as CopyIcon, MessageSquare as ReplyIcon,
  Link2,
} from "lucide-react";

interface Template {
  id: number;
  key: string;
  name: string;
  description: string | null;
  content: string;
  category: string;
  isSystem: number;
  templateType: string; // pelanggan | reseller | system
  templateChannel: string; // unofficial | official
  customerFilter: string; // all | unpaid
  shareToReseller: number;
  createdAt: string;
  // v4.2.22: button + media untuk MPWA send-button
  footer?: string | null;
  buttons?: string | null; // JSON array
  mediaUrl?: string | null;
  mediaType?: string | null; // image | video | document
}

interface ParamInfo {
  param: string;
  desc: string;
}

// v4.2.22: 4 button types sesuai MPWA spec
interface MpwaButton {
  type: "reply" | "call" | "url" | "copy";
  displayText: string;
  phoneNumber?: string;
  url?: string;
  copyText?: string;
  id?: string;
}

type Tab = "unofficial" | "official";
type FilterType = "all" | "pelanggan" | "reseller";

// v4.2.23: URL helpers — supaya view state survive page refresh
function readUrlState(): {
  view: "list" | "form-pelanggan" | "form-reseller";
  editingId: number | null;
} {
  if (typeof window === "undefined") return { view: "list", editingId: null };
  const sp = new URLSearchParams(window.location.search);
  const action = sp.get("action"); // "new" | "edit"
  const type = sp.get("type"); // "pelanggan" | "reseller"
  const id = sp.get("id");
  if (action === "new" && (type === "pelanggan" || type === "reseller")) {
    return { view: `form-${type}` as any, editingId: null };
  }
  if (action === "edit" && id) {
    // type will be derived from loaded template
    return { view: "form-pelanggan", editingId: Number(id) };
  }
  return { view: "list", editingId: null };
}
function writeUrlState(view: "list" | "form-pelanggan" | "form-reseller", editingId: number | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("action");
  url.searchParams.delete("type");
  url.searchParams.delete("id");
  if (view === "form-pelanggan" && editingId) {
    url.searchParams.set("action", "edit");
    url.searchParams.set("id", String(editingId));
  } else if (view === "form-pelanggan") {
    url.searchParams.set("action", "new");
    url.searchParams.set("type", "pelanggan");
  } else if (view === "form-reseller" && editingId) {
    url.searchParams.set("action", "edit");
    url.searchParams.set("id", String(editingId));
  } else if (view === "form-reseller") {
    url.searchParams.set("action", "new");
    url.searchParams.set("type", "reseller");
  }
  window.history.replaceState({}, "", url.toString());
}

export default function TemplateWhatsappPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("unofficial");
  // v4.2.23: init from URL — supaya refresh tetap di form
  const initialState = useMemo(() => readUrlState(), []);
  const [view, setView] = useState<"list" | "form-pelanggan" | "form-reseller">(initialState.view);
  const [editing, setEditing] = useState<Template | null>(null);
  const [pendingEditId, setPendingEditId] = useState<number | null>(initialState.editingId);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [showAddDropdown, setShowAddDropdown] = useState(false);

  const { data: templates = [], isLoading } = useQuery<Template[]>({
    queryKey: ["wa-templates-v2"],
    queryFn: () => api.get("/mpwa/templates"),
  });

  // v4.2.23: kalau URL minta edit id tertentu, load template begitu data ready
  useEffect(() => {
    if (pendingEditId && templates.length > 0) {
      const tpl = templates.find(t => t.id === pendingEditId);
      if (tpl) {
        setEditing(tpl);
        setView(tpl.templateType === "reseller" ? "form-reseller" : "form-pelanggan");
      }
      setPendingEditId(null);
    }
  }, [pendingEditId, templates]);

  // v4.2.23: sync URL setiap view/editing berubah
  useEffect(() => {
    writeUrlState(view, editing?.id ?? null);
  }, [view, editing?.id]);

  const filtered = useMemo(() => {
    let list = templates;
    // Filter by tab (channel)
    list = list.filter(t => (t.templateChannel ?? "unofficial") === tab);
    // Filter by type
    if (filterType !== "all") list = list.filter(t => t.templateType === filterType);
    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t => t.name.toLowerCase().includes(q) || t.key.toLowerCase().includes(q));
    }
    return list;
  }, [templates, tab, filterType, search]);

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/mpwa/templates/${id}`),
    onSuccess: () => { toast.success("Template dihapus"); qc.invalidateQueries({ queryKey: ["wa-templates-v2"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  if (view === "form-pelanggan" || view === "form-reseller") {
    return (
      <TemplateForm
        template={editing}
        type={view === "form-pelanggan" ? "pelanggan" : "reseller"}
        onBack={() => { setView("list"); setEditing(null); }}
      />
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4 max-w-7xl">
      {/* Breadcrumb */}
      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
        <MessageCircle className="h-3 w-3" />
        <span>Whatsapp</span>
        <ChevronRight className="h-3 w-3" />
        <span>Template Whatsapp</span>
        <ChevronRight className="h-3 w-3" />
        <span className="font-bold">List</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-gradient-to-br from-violet-100 to-purple-200 p-2.5">
            <MessageSquare className="h-5 w-5 text-violet-700" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight-display">Template Whatsapp</h1>
            <p className="text-sm text-muted-foreground">Kelola template pesan untuk pelanggan dan reseller</p>
          </div>
        </div>

        {/* Split button: Tambah Baru + caret dropdown */}
        <div className="relative inline-flex">
          <Button
            onClick={() => { setEditing(null); setView("form-pelanggan"); }}
            className="bg-violet-600 hover:bg-violet-700 rounded-r-none"
            leftIcon={<Plus className="h-3.5 w-3.5" />}
          >
            Tambah Baru
          </Button>
          <Button
            onClick={() => setShowAddDropdown(v => !v)}
            className="bg-violet-700 hover:bg-violet-800 rounded-l-none border-l border-violet-500 px-2"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
          {showAddDropdown && (
            <div className="absolute right-0 top-full mt-1 rounded-md border bg-card shadow-lg overflow-hidden z-10 min-w-[200px]">
              <button
                onClick={() => { setEditing(null); setView("form-pelanggan"); setShowAddDropdown(false); }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
              >
                <MessageSquare className="h-3.5 w-3.5" /> Template Pelanggan
              </button>
              <button
                onClick={() => { setEditing(null); setView("form-reseller"); setShowAddDropdown(false); }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2 border-t"
              >
                <MessageSquare className="h-3.5 w-3.5" /> Template Reseller
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <div className="flex gap-1">
          {(["unofficial", "official"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-4 py-2 text-sm font-bold uppercase tracking-wider transition border-b-2",
                tab === t ? "border-violet-600 text-violet-600" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t === "unofficial" ? "Unofficial" : "Official"}
            </button>
          ))}
        </div>
      </div>

      {/* Card */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-bold text-sm">List Template Whatsapp {tab === "unofficial" ? "Unofficial" : "Official"}</h2>
          <div className="flex items-center gap-2">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as FilterType)}
              className="px-2 py-1.5 rounded-md border bg-background text-xs"
            >
              <option value="all">Seluruh Template</option>
              <option value="pelanggan">Pelanggan</option>
              <option value="reseller">Reseller</option>
            </select>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Cari..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 text-sm w-56 h-8"
              />
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="grid place-items-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <div className="font-bold">Belum ada template</div>
            <div className="text-xs text-muted-foreground mt-1">Klik dropdown "Tambah Baru" → Template Pelanggan/Reseller.</div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left w-12">NO</th>
                <th className="px-4 py-2 text-left">NAMA TEMPLATE</th>
                <th className="px-4 py-2 text-left">TIPE TEMPLATE</th>
                <th className="px-4 py-2 text-left">CREATED AT</th>
                <th className="px-4 py-2 text-right">AKSI</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((t, i) => (
                <tr key={t.id} className="hover:bg-muted/20 transition">
                  <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{i + 1}</td>
                  <td className="px-4 py-2.5 font-semibold uppercase">{t.name}</td>
                  <td className="px-4 py-2.5">
                    <span className={cn(
                      "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded",
                      t.templateType === "reseller" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                    )}>
                      {t.templateType}
                    </span>
                    {t.shareToReseller === 1 && (
                      <span className="ml-1 text-[10px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-emerald-100 text-emerald-700">
                        Shared
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {new Date(t.createdAt).toLocaleString("id-ID", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Button
                      size="icon-xs" variant="ghost"
                      onClick={() => { setEditing(t); setView(t.templateType === "reseller" ? "form-reseller" : "form-pelanggan"); }}
                      title="Edit"
                    >
                      <Edit3 className="h-3.5 w-3.5 text-orange-600" />
                    </Button>
                    {t.isSystem !== 1 && (
                      <Button
                        size="icon-xs" variant="ghost"
                        onClick={() => { if (confirm(`Hapus template "${t.name}"?`)) deleteMut.mutate(t.id); }}
                        title="Hapus"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Form Template
// ─────────────────────────────────────────────────────────────────
function TemplateForm({ template, type, onBack }: {
  template: Template | null;
  type: "pelanggan" | "reseller";
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!template;
  const [name, setName] = useState(template?.name ?? "");
  const [content, setContent] = useState(template?.content ?? "");
  const [customerFilter, setCustomerFilter] = useState<"all" | "unpaid">((template?.customerFilter as any) ?? "all");
  const [shareToReseller, setShareToReseller] = useState(template?.shareToReseller === 1);
  // v4.2.22: button + media + footer
  const [footer, setFooter] = useState(template?.footer ?? "");
  const [imageUrl, setImageUrl] = useState(template?.mediaUrl ?? "");
  // v4.2.23: upload progress + compatibility mode
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // v4.2.23: Compatibility mode — Native Button default (tap-able), Text+Link fallback kalau ada issue
  const [compatMode, setCompatMode] = useState<"native" | "text-link">(
    (template as any)?.compatMode === "text-link" ? "text-link" : "native"
  );
  const [buttons, setButtons] = useState<MpwaButton[]>(() => {
    if (!template?.buttons) return [];
    try {
      const parsed = JSON.parse(template.buttons);
      if (!Array.isArray(parsed)) return [];
      // Migration: legacy "phone" → "call"
      return parsed.map((b: any) => ({
        ...b,
        type: b.type === "phone" ? "call" : b.type,
        displayText: b.displayText ?? b.label ?? "",
      }));
    } catch { return []; }
  });
  const [showParamModal, setShowParamModal] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  const { data: params = [] } = useQuery<ParamInfo[]>({
    queryKey: ["template-params", type],
    queryFn: () => api.get(`/whatsapp/template-params?type=${type}`),
  });

  const saveMut = useMutation({
    mutationFn: () => {
      const key = template?.key ?? `${type}_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 30)}_${Date.now()}`;
      const body: any = {
        key,
        name,
        content,
        category: "broadcast",
        templateType: type,
        templateChannel: "unofficial",
        customerFilter: type === "pelanggan" ? customerFilter : "all",
        shareToReseller: type === "pelanggan" && shareToReseller ? 1 : 0,
        // v4.2.22: button + media + footer (MPWA send-button)
        footer: footer?.trim() || null,
        mediaUrl: imageUrl?.trim() || null,
        mediaType: imageUrl?.trim() ? "image" : null,
        buttons: buttons.length > 0 ? JSON.stringify(buttons.map(b => sanitizeButton(b))) : null,
        // v4.2.23: compat mode
        compatMode,
      };
      return isEdit
        ? api.put(`/mpwa/templates/${template!.id}`, body)
        : api.post("/mpwa/templates", body);
    },
    onSuccess: () => {
      toast.success(isEdit ? "Template diperbarui" : "Template dibuat");
      qc.invalidateQueries({ queryKey: ["wa-templates-v2"] });
      onBack();
    },
    onError: (e: any) => toast.error(e.message || "Gagal simpan"),
  });

  // v4.2.23: image upload helper
  async function handleImageUpload(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast.error(`File terlalu besar (${(file.size / 1024 / 1024).toFixed(2)} MB, max 5 MB)`);
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("File harus image (JPG/PNG/GIF/WebP)");
      return;
    }
    setUploading(true);
    try {
      // Convert file ke base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Gagal baca file"));
        reader.readAsDataURL(file);
      });
      const result: any = await api.post("/whatsapp/upload-image", {
        filename: file.name,
        base64,
      });
      // Pakai fullUrl supaya MPWA bisa fetch (absolute URL)
      const url = result?.fullUrl ?? result?.url;
      setImageUrl(url);
      toast.success(`Image uploaded (${result?.sizeKb ?? "?"} KB)`);
    } catch (e: any) {
      toast.error(e.message || "Upload gagal");
    } finally {
      setUploading(false);
    }
  }

  // v4.2.22: button helpers
  function addButton() {
    if (buttons.length >= 5) {
      toast.warning("Max 5 button per pesan (spec MPWA send-button)");
      return;
    }
    setButtons([...buttons, { type: "reply", displayText: "Tombol Baru" }]);
  }
  function updateButton(idx: number, patch: Partial<MpwaButton>) {
    setButtons(buttons.map((b, i) => i === idx ? { ...b, ...patch } : b));
  }
  function removeButton(idx: number) {
    setButtons(buttons.filter((_, i) => i !== idx));
  }
  function sanitizeButton(b: MpwaButton): any {
    const out: any = { type: b.type, displayText: b.displayText };
    if (b.type === "call" && b.phoneNumber) out.phoneNumber = b.phoneNumber.replace(/\D/g, "");
    else if (b.type === "url" && b.url) out.url = b.url;
    else if (b.type === "copy" && b.copyText) out.copyText = b.copyText;
    else if (b.type === "reply" && b.id) out.id = b.id;
    return out;
  }

  function insertAtCursor(text: string) {
    const ta = contentRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const next = content.slice(0, start) + text + content.slice(end);
    setContent(next);
    // restore cursor
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + text.length, start + text.length);
    }, 0);
  }

  function wrapFormatting(prefix: string, suffix: string) {
    const ta = contentRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = content.slice(start, end);
    const wrapped = prefix + (selected || "text") + suffix;
    const next = content.slice(0, start) + wrapped + content.slice(end);
    setContent(next);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + prefix.length, start + prefix.length + (selected || "text").length);
    }, 0);
  }

  // Real-time preview render — WhatsApp markdown supports *bold* _italic_ ~strike~ ```mono```
  const previewHtml = useMemo(() => {
    let html = content
      .replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/\*([^\*\n]+)\*/g, "<strong>$1</strong>")
      .replace(/_([^_\n]+)_/g, "<em>$1</em>")
      .replace(/~([^~\n]+)~/g, "<s>$1</s>")
      .replace(/\n/g, "<br/>");
    // Highlight {{params}}
    html = html.replace(/\{\{(\w+)\}\}/g, '<span class="text-blue-600 bg-blue-50 px-1 rounded font-mono text-xs">{{$1}}</span>');
    return html;
  }, [content]);

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4 max-w-7xl">
      {/* Breadcrumb */}
      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
        <MessageCircle className="h-3 w-3" />
        <span>Whatsapp</span>
        <ChevronRight className="h-3 w-3" />
        <button onClick={onBack} className="hover:text-foreground">Template Whatsapp</button>
        <ChevronRight className="h-3 w-3" />
        <span className="font-bold">Form Template {type === "pelanggan" ? "Pelanggan" : "Reseller"}</span>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={onBack} className="rounded-md hover:bg-muted p-2 -ml-2"><ArrowLeft className="h-4 w-4" /></button>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight-display">
          {isEdit ? `Edit Template: ${template!.name}` : `Buat Template ${type === "pelanggan" ? "Pelanggan" : "Reseller"}`}
        </h1>
      </div>

      {/* Section 1: Form Template */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <h2 className="font-bold text-sm">Form Template {type === "pelanggan" ? "Pelanggan" : "Reseller"}</h2>
        <div>
          <label className="text-xs font-bold uppercase tracking-wider">Nama Template <span className="text-rose-600">*</span></label>
          <Input
            placeholder="Masukkan nama template.."
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="text-sm mt-1"
          />
        </div>
        {type === "pelanggan" && (
          <div>
            <label className="text-xs font-bold uppercase tracking-wider">Tampilkan Pelanggan saat memilih template</label>
            <select
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value as any)}
              className="w-full mt-1 px-3 py-2 rounded-md border bg-background text-sm"
            >
              <option value="all">Seluruh Pelanggan</option>
              <option value="unpaid">Pelanggan Yang Belum Membayar Tagihan</option>
            </select>
            <p className="text-[10px] text-muted-foreground mt-0.5">Filter pelanggan yang muncul di picker saat broadcast pakai template ini.</p>
          </div>
        )}
      </div>

      {/* Section 2: Preview Template */}
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-sm">Preview Template</h2>
          <Button size="xs" variant="ghost-primary" onClick={() => setShowParamModal(true)} leftIcon={<Info className="h-3 w-3" />}>
            Petunjuk Pengisian Parameter Whatsapp
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* LEFT: Editor */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Isi Pesan</div>
            <div className="rounded-md border bg-muted/10 overflow-hidden">
              {/* Toolbar */}
              <div className="px-2 py-1.5 border-b bg-muted/30 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => wrapFormatting("*", "*")}
                  className="h-7 w-7 rounded grid place-items-center hover:bg-muted text-sm font-bold"
                  title="Bold (*teks*)"
                >
                  <Bold className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => wrapFormatting("_", "_")}
                  className="h-7 w-7 rounded grid place-items-center hover:bg-muted text-sm italic"
                  title="Italic (_teks_)"
                >
                  <Italic className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => wrapFormatting("~", "~")}
                  className="h-7 w-7 rounded grid place-items-center hover:bg-muted text-sm"
                  title="Strikethrough (~teks~)"
                >
                  <Underline className="h-3.5 w-3.5" />
                </button>
              </div>
              <Textarea
                ref={contentRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={12}
                placeholder="Tulis isi pesan WhatsApp di sini... gunakan {{nama_pelanggan}} dst untuk parameter dinamis."
                className="border-0 rounded-none focus-visible:ring-0 font-mono text-sm resize-none"
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">
              Format WhatsApp: <code>*tebal*</code>, <code>_miring_</code>, <code>~coret~</code>. Pakai <code>{`{{param}}`}</code> untuk variabel.
            </p>
          </div>

          {/* RIGHT: WhatsApp bubble preview */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Contoh Pesan Whatsapp</div>
            <div
              className="rounded-md border p-4 min-h-[300px]"
              style={{
                background: "#e5ddd5",
                backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2260%22 viewBox=%220 0 60 60%22%3E%3Cg fill=%22%23dad0c4%22 fill-opacity=%220.4%22%3E%3Cpath d=%22M30 0c-3 5 0 10 5 10s5 5 0 10-5 5 0 10 5 5 0 10-5 5 0 10z%22/%3E%3C/g%3E%3C/svg%3E")',
              }}
            >
              <div className="bg-white rounded-lg p-3 shadow-sm max-w-[300px] relative" style={{ borderTopLeftRadius: 0 }}>
                {/* Tail */}
                <div className="absolute -left-2 top-0 w-0 h-0" style={{
                  borderTop: "0 solid transparent",
                  borderRight: "8px solid #fff",
                  borderBottom: "10px solid transparent",
                }} />
                <div
                  className="text-sm leading-snug whitespace-pre-wrap"
                  dangerouslySetInnerHTML={{ __html: previewHtml || '<span class="text-muted-foreground italic">(preview pesan akan muncul di sini)</span>' }}
                />
                <div className="text-right text-[9px] text-muted-foreground mt-1">
                  {new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Toggle share to reseller (only for pelanggan type) */}
        {type === "pelanggan" && (
          <div className="mt-3 pt-3 border-t flex items-center gap-2">
            <input
              type="checkbox"
              id="share-reseller"
              checked={shareToReseller}
              onChange={(e) => setShareToReseller(e.target.checked)}
              className="h-4 w-4"
            />
            <label htmlFor="share-reseller" className="text-sm cursor-pointer">
              Tampilkan Template Keseluruh Reseller
              <span className="block text-[10px] text-muted-foreground">Template ini akan dishare ke semua reseller dan bisa mereka pakai untuk broadcast.</span>
            </label>
          </div>
        )}
      </div>

      {/* v4.2.22: Section 3 — Tombol Interaktif + Image (MPWA send-button) */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-start gap-2">
          <Link2 className="h-4 w-4 text-violet-600 mt-0.5" />
          <div className="flex-1">
            <h2 className="font-bold text-sm">Tombol Interaktif & Image (Opsional)</h2>
            <p className="text-[11px] text-muted-foreground">
              Tambahkan tombol Reply / Call / URL / Copy + image header untuk broadcast yang lebih engaging.
              Image <strong>wajib</strong> kalau ingin tombol muncul native di WhatsApp (spec MPWA <code>/send-button</code>).
            </p>
          </div>
        </div>

        {/* Image upload — v4.2.23 */}
        <div>
          <label className="text-xs font-bold uppercase tracking-wider">
            <ImageIcon className="inline h-3 w-3 mr-1" />
            Image Header
          </label>
          <div className="mt-1">
            {imageUrl ? (
              <>
                <div className="relative rounded-md border bg-muted/10 p-2">
                  <div className="flex items-center gap-3">
                    <div className="w-20 h-20 rounded bg-muted/50 overflow-hidden grid place-items-center shrink-0">
                      {/* eslint-disable-next-line jsx-a11y/alt-text */}
                      <img
                        src={imageUrl.startsWith("http") || imageUrl.startsWith("/") ? imageUrl : `/${imageUrl}`}
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-mono text-muted-foreground truncate">{imageUrl}</div>
                      <div className="flex items-center gap-1 mt-1">
                        <Button size="xs" variant="ghost-primary" onClick={() => fileInputRef.current?.click()}>
                          Ganti
                        </Button>
                        <Button size="xs" variant="ghost" onClick={() => setImageUrl("")} className="text-rose-600">
                          Hapus
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
                {/* v4.2.23: warning kalau image localhost — MPWA gak bisa fetch */}
                {/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.|10\.)/i.test(imageUrl) && (
                  <div className="mt-2 rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-[11px] text-rose-900 leading-snug">
                    <strong> Image localhost terdeteksi:</strong> URL <code className="font-mono text-[10px]">{imageUrl}</code> hanya bisa diakses dari komputer Galon — <strong>MPWA server di internet tidak bisa fetch image ini</strong>.
                    Saat broadcast, sistem otomatis skip image (pesan tetap kirim tanpa image header).
                    <div className="mt-1 font-semibold">Solusi:</div>
                    <ul className="list-disc ml-4 mt-0.5">
                      <li>Upload ke <a href="https://imgur.com/upload" target="_blank" rel="noreferrer" className="text-rose-700 underline">imgur</a> atau CDN public, paste URL via "URL custom" di bawah</li>
                      <li>Atau deploy JABNET ke production dengan domain publik (mis. fiber-tools.arkanova.id)</li>
                      <li>Atau pakai mode <strong>Text + Link</strong> (image tidak wajib)</li>
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-violet-500", "bg-violet-50/30"); }}
                onDragLeave={(e) => { e.currentTarget.classList.remove("border-violet-500", "bg-violet-50/30"); }}
                onDrop={async (e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove("border-violet-500", "bg-violet-50/30");
                  const file = e.dataTransfer.files?.[0];
                  if (file) await handleImageUpload(file);
                }}
                className={cn(
                  "rounded-md border-2 border-dashed p-6 text-center cursor-pointer transition",
                  uploading ? "border-violet-400 bg-violet-50/40" : "border-muted-foreground/20 hover:border-violet-400 hover:bg-violet-50/20"
                )}
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-8 w-8 mx-auto text-violet-500 animate-spin mb-2" />
                    <div className="text-xs text-muted-foreground">Uploading...</div>
                  </>
                ) : (
                  <>
                    <ImageIcon className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                    <div className="text-sm font-semibold">Upload Image</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      Klik atau drag-drop file (JPG, PNG, GIF, WebP · max 5 MB)
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1 italic">
                      atau paste URL eksternal di field "URL Custom" di bawah
                    </div>
                  </>
                )}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) await handleImageUpload(file);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
            />
          </div>

          {/* Custom URL input — opsional kalau mau pakai image yang sudah di-host */}
          <details className="mt-2">
            <summary className="text-[10px] text-muted-foreground cursor-pointer">Atau paste URL custom (CDN/imgur)</summary>
            <Input
              placeholder="https://example.com/promo.jpg"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              className="text-xs font-mono mt-1.5"
            />
          </details>
        </div>

        {/* Footer */}
        <div>
          <label className="text-xs font-bold uppercase tracking-wider">Footer Text (Opsional, max 60 char)</label>
          <Input
            placeholder="JABNET — Internet Cepat & Stabil"
            value={footer}
            onChange={(e) => setFooter(e.target.value)}
            maxLength={60}
            className="text-sm mt-1"
          />
        </div>

        {/* v4.2.23: Compatibility Mode */}
        <div className="rounded-md border bg-muted/10 p-3">
          <label className="text-xs font-bold uppercase tracking-wider mb-2 block">Mode Pengiriman</label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {/* Native Button — tap-able tombol */}
            <label className={cn(
              "rounded-md border-2 p-2.5 cursor-pointer transition",
              compatMode === "native" ? "border-violet-500 bg-violet-50/40 ring-2 ring-violet-200" : "border-muted hover:border-foreground/30"
            )}>
              <input type="radio" name="compat-mode" checked={compatMode === "native"} onChange={() => setCompatMode("native")} className="sr-only" />
              <div className="flex items-start gap-2">
                <div className={cn("h-3.5 w-3.5 rounded-full border-2 mt-0.5 shrink-0",
                  compatMode === "native" ? "border-violet-600 bg-violet-600 ring-2 ring-violet-200" : "border-muted-foreground"
                )} />
                <div className="flex-1">
                  <div className="text-sm font-bold">Native Button</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    Tombol interaktif <strong>tap-able</strong> di WhatsApp. Pakai MPWA <code>/send-button</code>.
                    Butuh image header dengan URL <strong>public</strong> (imgur/CDN).
                  </div>
                  <div className="text-[10px] text-violet-700 mt-1 font-semibold">
                     Tip: Pakai tipe URL/Call/Copy lebih reliable dari Reply. Image WAJIB public URL.
                  </div>
                </div>
              </div>
            </label>
            {/* Text + Link — fallback */}
            <label className={cn(
              "rounded-md border-2 p-2.5 cursor-pointer transition",
              compatMode === "text-link" ? "border-emerald-500 bg-emerald-50/40 ring-2 ring-emerald-200" : "border-muted hover:border-foreground/30"
            )}>
              <input type="radio" name="compat-mode" checked={compatMode === "text-link"} onChange={() => setCompatMode("text-link")} className="sr-only" />
              <div className="flex items-start gap-2">
                <div className={cn("h-3.5 w-3.5 rounded-full border-2 mt-0.5 shrink-0",
                  compatMode === "text-link" ? "border-emerald-600 bg-emerald-600 ring-2 ring-emerald-200" : "border-muted-foreground"
                )} />
                <div className="flex-1">
                  <div className="text-sm font-bold flex items-center gap-1.5">
                    Text + Link
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-200 text-emerald-800">FALLBACK</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    Tombol jadi teks + link di body pesan. <strong>100% kompatibel</strong> semua versi WA.
                    Pilih ini kalau pelanggan ada yg dapat "versi tidak mendukung".
                  </div>
                </div>
              </div>
            </label>
          </div>
          {compatMode === "native" && (
            <div className="mt-2 rounded-md bg-violet-50 border border-violet-200 px-3 py-2 text-[11px] text-violet-900 leading-snug">
              <strong> Tips supaya native button reliable:</strong>
              <ul className="list-disc ml-4 mt-1 space-y-0.5">
                <li>Image header WAJIB pakai <strong>URL public</strong> — host di imgur/CDN, bukan localhost/intranet</li>
                <li><strong>Tipe URL/Call/Copy</strong> lebih sering diterima WA dibanding Reply</li>
                <li>Beberapa WA versi tertentu (terutama yang sangat baru/lama) mungkin tetap menolak — kalau itu kejadian massal, switch ke <em>Text + Link</em></li>
              </ul>
            </div>
          )}
        </div>

        {/* Button list */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold uppercase tracking-wider">
              Tombol ({buttons.length}/5)
            </label>
            <Button size="xs" variant="ghost-primary" onClick={addButton} leftIcon={<Plus className="h-3 w-3" />}>
              Tambah Tombol
            </Button>
          </div>

          {!imageUrl && buttons.length > 0 && (
            <div className="mb-2 px-2.5 py-1.5 rounded bg-sky-50 border border-sky-200 text-[11px] text-sky-900 leading-snug">
              ℹ <strong>Image kosong:</strong> Saat broadcast, sistem otomatis pakai{" "}
              <strong>default banner JABNET</strong> sebagai image header, jadi tombol tetap muncul native di WhatsApp.
              Isi URL Gambar di atas kalau mau pakai image custom.
              <span className="block mt-1 opacity-70">(Admin bisa set default image global di /integrations)</span>
            </div>
          )}

          {buttons.length === 0 ? (
            <div className="text-[11px] text-muted-foreground italic text-center py-4 border border-dashed rounded">
              Belum ada tombol. Pesan dikirim sebagai teks biasa.
            </div>
          ) : (
            <div className="space-y-1.5">
              {buttons.map((b, i) => (
                <div key={i} className="grid grid-cols-12 gap-1.5 items-center bg-muted/30 rounded p-1.5">
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
                    value={b.displayText}
                    onChange={(e) => updateButton(i, { displayText: e.target.value })}
                    className="col-span-4 text-xs h-8"
                    maxLength={20}
                  />
                  {b.type === "url" && (
                    <Input
                      placeholder="https://pay.jabnet.id"
                      value={b.url ?? ""}
                      onChange={(e) => updateButton(i, { url: e.target.value })}
                      className="col-span-5 text-xs h-8 font-mono"
                    />
                  )}
                  {b.type === "call" && (
                    <Input
                      placeholder="628xxx (nomor tujuan)"
                      value={b.phoneNumber ?? ""}
                      onChange={(e) => updateButton(i, { phoneNumber: e.target.value })}
                      className="col-span-5 text-xs h-8 font-mono"
                    />
                  )}
                  {b.type === "copy" && (
                    <Input
                      placeholder="Text yang di-copy (PROMO50)"
                      value={b.copyText ?? ""}
                      onChange={(e) => updateButton(i, { copyText: e.target.value })}
                      className="col-span-5 text-xs h-8 font-mono"
                    />
                  )}
                  {b.type === "reply" && (
                    <Input
                      placeholder="payload-id (optional)"
                      value={b.id ?? ""}
                      onChange={(e) => updateButton(i, { id: e.target.value })}
                      className="col-span-5 text-xs h-8 font-mono"
                    />
                  )}
                  <button
                    onClick={() => removeButton(i)}
                    className="col-span-1 h-8 grid place-items-center text-rose-600 hover:bg-rose-50 rounded"
                    title="Hapus tombol"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Preview tombol — sesuai render di HP */}
          {buttons.length > 0 && (
            <div className="mt-3 rounded-md border-2 border-emerald-200 bg-emerald-50/40 p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 mb-2 flex items-center gap-1.5">
                Preview Tombol
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-200 text-emerald-800">
                  ✓ Native Button
                </span>
                {!imageUrl && (
                  <span className="text-[9px] font-normal px-1.5 py-0.5 rounded bg-sky-100 text-sky-700">
                    pakai default banner JABNET
                  </span>
                )}
              </div>
              <div className="bg-white rounded-lg p-3 shadow-sm max-w-sm">
                <div className="mb-2 rounded bg-gradient-to-br from-violet-500 to-purple-600 grid place-items-center aspect-video overflow-hidden">
                  {imageUrl ? (
                    /* eslint-disable-next-line jsx-a11y/alt-text */
                    <img src={imageUrl} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  ) : (
                    <div className="text-white font-black text-2xl tracking-tight-display">JABNET</div>
                  )}
                </div>
                <div className="text-xs whitespace-pre-wrap leading-snug" dangerouslySetInnerHTML={{ __html: previewHtml || "<em>(belum ada isi)</em>" }} />
                {footer && <div className="text-[10px] text-muted-foreground mt-2 italic">{footer}</div>}
                <div className="mt-2 pt-2 border-t flex flex-col gap-1">
                  {buttons.map((b, i) => {
                    const Icon =
                      b.type === "url" ? ExternalLink :
                      b.type === "call" ? Phone :
                      b.type === "copy" ? CopyIcon :
                      ReplyIcon;
                    return (
                      <div key={i} className="text-xs text-sky-600 font-semibold py-1.5 border rounded text-center flex items-center justify-center gap-1.5">
                        <Icon className="h-3 w-3" />
                        {b.displayText || "(label kosong)"}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 sticky bottom-0 bg-background/95 backdrop-blur py-3 -mx-1 px-1 border-t z-10">
        <Button
          onClick={() => {
            if (!name.trim()) return toast.error("Nama template wajib");
            if (!content.trim()) return toast.error("Isi pesan wajib");
            saveMut.mutate();
          }}
          loading={saveMut.isPending}
          className="bg-violet-600 hover:bg-violet-700"
          leftIcon={<Save className="h-3.5 w-3.5" />}
        >
          Simpan Template
        </Button>
        <Button variant="ghost" onClick={onBack} className="text-rose-600">Kembali</Button>
      </div>

      {/* Param Modal */}
      <Dialog open={showParamModal} onOpenChange={(o) => { if (!o) setShowParamModal(false); }}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Petunjuk Pengisian Parameter Whatsapp</DialogTitle>
            <DialogDescription>
              Klik parameter untuk auto-insert di kursor editor. Total {params.length} parameter untuk template {type}.
            </DialogDescription>
          </DialogHeader>
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-[10px] uppercase tracking-wider font-bold">
              <tr>
                <th className="px-3 py-2 text-left">Parameter</th>
                <th className="px-3 py-2 text-left">Keterangan</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {params.map(p => (
                <tr
                  key={p.param}
                  onClick={() => { insertAtCursor(p.param); }}
                  className="cursor-pointer hover:bg-muted/30 transition"
                >
                  <td className="px-3 py-1.5">
                    <code className="text-xs font-mono px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">{p.param}</code>
                  </td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">{p.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowParamModal(false)}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
