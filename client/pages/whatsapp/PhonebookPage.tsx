/**
 * v4.2.24: Phonebook page — custom contact lists untuk broadcast.
 * v4.2.27: + tags untuk kategorisasi + smart filter customers + cross-phonebook import
 *
 * Features:
 *   - List view: semua phonebook dengan counter + color/icon
 *   - Detail view: contacts table dengan CRUD + bulk actions + tags column
 *   - Add contact: manual (form), import dari customers (multi-select), CSV upload
 *   - Tags per kontak: badge chip, bulk-add tag, filter by tag
 *   - Smart filter customers saat import (paket / kecamatan / status)
 *   - Import dari phonebook lain (cross-phonebook copy)
 *   - URL state persistence (refresh tetap di view yang sama)
 */

import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  BookUser, Plus, Trash2, Edit3, Loader2, Search, ChevronRight, ArrowLeft, Save,
  Upload, Download, Users, Phone, Check, X, FileSpreadsheet, MessageCircle,
  Tag, Filter, Copy as CopyIcon, Sparkles,
} from "lucide-react";

interface Phonebook {
  id: number; name: string; description: string | null;
  color: string | null; icon: string | null;
  contactCount: number;
  createdAt: string;
}

interface Contact {
  id: number; phonebookId: number;
  name: string; phone: string;
  email: string | null; address: string | null; notes: string | null;
  customFields: string | null;
  customerId: number | null;
  tags: string | null;  // JSON string array
  createdAt: string;
}

interface Customer { id: number; name: string; customerId: string; phone: string | null; district: string | null; package: string | null; }

interface CustomerForImport {
  id: number; customerId: string; name: string; phone: string;
  district: string | null; package: string | null;
  isIsolir: boolean; billingStatus: string | null;
}

interface CustomerFilters { paket: string[]; kecamatan: string[]; status: string[]; }

interface TagWithCount { tag: string; count: number; }

// Parse tags dari JSON string field
function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(t => typeof t === "string" && t.trim()) : [];
  } catch { return []; }
}

// Color palette untuk tag chip (deterministic by tag string)
const TAG_COLORS = [
  { bg: "bg-violet-50",  text: "text-violet-700",  border: "border-violet-200" },
  { bg: "bg-sky-50",     text: "text-sky-700",     border: "border-sky-200" },
  { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200" },
  { bg: "bg-rose-50",    text: "text-rose-700",    border: "border-rose-200" },
  { bg: "bg-cyan-50",    text: "text-cyan-700",    border: "border-cyan-200" },
  { bg: "bg-fuchsia-50", text: "text-fuchsia-700", border: "border-fuchsia-200" },
  { bg: "bg-orange-50",  text: "text-orange-700", border: "border-orange-200" },
];

function tagColor(tag: string) {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return TAG_COLORS[h % TAG_COLORS.length];
}

const COLOR_PRESETS = ["#7367f0", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4"];

// URL state
function readUrl(): { view: "list" | "detail"; id: number | null } {
  if (typeof window === "undefined") return { view: "list", id: null };
  const sp = new URLSearchParams(window.location.search);
  const id = sp.get("pb");
  return { view: id ? "detail" : "list", id: id ? Number(id) : null };
}
function writeUrl(view: "list" | "detail", id: number | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("pb");
  if (view === "detail" && id) url.searchParams.set("pb", String(id));
  window.history.replaceState({}, "", url.toString());
}

export default function PhonebookPage() {
  const init = useMemo(() => readUrl(), []);
  const [view, setView] = useState<"list" | "detail">(init.view);
  const [selectedId, setSelectedId] = useState<number | null>(init.id);

  useEffect(() => {
    writeUrl(view, selectedId);
  }, [view, selectedId]);

  if (view === "detail" && selectedId) {
    return <PhonebookDetail phonebookId={selectedId} onBack={() => { setView("list"); setSelectedId(null); }} />;
  }
  return <PhonebookList onOpen={(id) => { setSelectedId(id); setView("detail"); }} />;
}

// ─────────────────────────────────────────────────────────────────
// LIST VIEW
// ─────────────────────────────────────────────────────────────────
function PhonebookList({ onOpen }: { onOpen: (id: number) => void }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Phonebook | null>(null);

  const { data: phonebooks = [], isLoading } = useQuery<Phonebook[]>({
    queryKey: ["phonebooks"],
    queryFn: () => api.get("/phonebooks"),
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return phonebooks;
    const q = search.toLowerCase();
    return phonebooks.filter(p => p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q));
  }, [phonebooks, search]);

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/phonebooks/${id}`),
    onSuccess: () => { toast.success("Phonebook dihapus"); qc.invalidateQueries({ queryKey: ["phonebooks"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4 max-w-7xl">
      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
        <MessageCircle className="h-3 w-3" />
        <span>Whatsapp</span>
        <ChevronRight className="h-3 w-3" />
        <span className="font-bold">Phonebook</span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-gradient-to-br from-violet-100 to-purple-200 p-2.5">
            <BookUser className="h-5 w-5 text-violet-700" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight-display">Phonebook</h1>
            <p className="text-sm text-muted-foreground">Daftar kontak custom untuk broadcast — bukan pelanggan/reseller</p>
          </div>
        </div>
        <Button onClick={() => { setEditing(null); setCreateOpen(true); }} className="bg-violet-600 hover:bg-violet-700" leftIcon={<Plus className="h-3.5 w-3.5" />}>
          Phonebook Baru
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input placeholder="Cari phonebook..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 text-sm" />
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid place-items-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border bg-card py-16 text-center">
          <BookUser className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
          <div className="font-bold">{search ? "Tidak ada phonebook match" : "Belum ada phonebook"}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {search ? "Coba ubah pencarian." : "Buat phonebook pertama untuk simpan daftar kontak custom."}
          </div>
          {!search && (
            <Button onClick={() => setCreateOpen(true)} className="mt-3 bg-violet-600 hover:bg-violet-700" size="sm">
              Buat Phonebook Pertama
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(pb => (
            <div key={pb.id} className="rounded-lg border bg-card hover:shadow-md transition overflow-hidden group">
              <button onClick={() => onOpen(pb.id)} className="w-full text-left p-4 block">
                <div className="flex items-start gap-3 mb-2">
                  <div className="h-10 w-10 rounded-lg grid place-items-center shrink-0" style={{ background: pb.color ?? "#7367f0" }}>
                    <BookUser className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate">{pb.name}</div>
                    {pb.description && (
                      <div className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{pb.description}</div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <Users className="h-3 w-3 text-muted-foreground" />
                  <span className="font-bold tabular-nums">{pb.contactCount}</span>
                  <span className="text-muted-foreground">kontak</span>
                </div>
              </button>
              <div className="px-4 pb-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                <Button size="xs" variant="ghost" onClick={(e) => { e.stopPropagation(); setEditing(pb); setCreateOpen(true); }} leftIcon={<Edit3 className="h-3 w-3" />}>
                  Edit
                </Button>
                <Button
                  size="xs" variant="ghost"
                  onClick={(e) => { e.stopPropagation(); if (confirm(`Hapus phonebook "${pb.name}" beserta ${pb.contactCount} kontak?`)) deleteMut.mutate(pb.id); }}
                  className="text-rose-600"
                  leftIcon={<Trash2 className="h-3 w-3" />}
                >
                  Hapus
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <PhonebookFormDialog
        open={createOpen}
        existing={editing}
        onClose={() => { setCreateOpen(false); setEditing(null); }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// FORM DIALOG (create/edit)
// ─────────────────────────────────────────────────────────────────
function PhonebookFormDialog({ open, existing, onClose }: {
  open: boolean; existing: Phonebook | null; onClose: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!existing;
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [color, setColor] = useState(existing?.color ?? "#7367f0");

  useEffect(() => {
    if (open) {
      setName(existing?.name ?? "");
      setDescription(existing?.description ?? "");
      setColor(existing?.color ?? "#7367f0");
    }
  }, [open, existing]);

  const saveMut = useMutation({
    mutationFn: () => {
      const body = { name, description, color };
      return isEdit
        ? api.put(`/phonebooks/${existing!.id}`, body)
        : api.post("/phonebooks", body);
    },
    onSuccess: () => {
      toast.success(isEdit ? "Phonebook diperbarui" : "Phonebook dibuat");
      qc.invalidateQueries({ queryKey: ["phonebooks"] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Phonebook" : "Buat Phonebook Baru"}</DialogTitle>
          <DialogDescription>Group/list kontak custom untuk broadcast.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider">Nama <span className="text-rose-600">*</span></label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Reseller VIP, Tim Internal, Calon Pelanggan" className="text-sm mt-1" />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider">Deskripsi (opsional)</label>
            <Textarea value={description ?? ""} onChange={(e) => setDescription(e.target.value)} placeholder="Catatan internal untuk identify phonebook ini" rows={2} className="text-sm mt-1" />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block">Warna</label>
            <div className="flex items-center gap-1.5">
              {COLOR_PRESETS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={cn(
                    "h-8 w-8 rounded transition",
                    color === c ? "ring-2 ring-offset-2 ring-foreground/40" : "hover:scale-110"
                  )}
                  style={{ background: c }}
                />
              ))}
              <Input value={color} onChange={(e) => setColor(e.target.value)} className="w-24 text-xs font-mono h-8" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Batal</Button>
          <Button onClick={() => saveMut.mutate()} disabled={!name.trim() || saveMut.isPending} loading={saveMut.isPending}>
            {isEdit ? "Simpan" : "Buat Phonebook"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────
// DETAIL VIEW (contacts table)
// ─────────────────────────────────────────────────────────────────
function PhonebookDetail({ phonebookId, onBack }: { phonebookId: number; onBack: () => void }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const [bulkTagOpen, setBulkTagOpen] = useState(false);

  const { data: phonebook } = useQuery<Phonebook>({
    queryKey: ["phonebook", phonebookId],
    queryFn: () => api.get(`/phonebooks/${phonebookId}`),
  });

  const { data: allContacts = [], isLoading } = useQuery<Contact[]>({
    queryKey: ["phonebook-contacts", phonebookId, search],
    queryFn: () => api.get(`/phonebooks/${phonebookId}/contacts${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  });

  // v4.2.27: tag filter (client-side filter karena tags disimpan JSON di field)
  const contacts = useMemo(() => {
    if (!activeTagFilter) return allContacts;
    return allContacts.filter(c => parseTags(c.tags).includes(activeTagFilter));
  }, [allContacts, activeTagFilter]);

  // v4.2.27: load distinct tags untuk filter chip
  const { data: phonebookTags = [] } = useQuery<TagWithCount[]>({
    queryKey: ["phonebook-tags", phonebookId],
    queryFn: () => api.get(`/phonebooks/${phonebookId}/tags`),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/phonebooks/contacts/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["phonebook-contacts", phonebookId] }); qc.invalidateQueries({ queryKey: ["phonebooks"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const bulkDeleteMut = useMutation({
    mutationFn: () => api.post("/phonebooks/contacts/bulk-delete", { ids: Array.from(selectedIds) }),
    onSuccess: (data: any) => {
      toast.success(`${data?.deleted ?? selectedIds.size} kontak dihapus`);
      qc.invalidateQueries({ queryKey: ["phonebook-contacts", phonebookId] });
      qc.invalidateQueries({ queryKey: ["phonebook-tags", phonebookId] });
      qc.invalidateQueries({ queryKey: ["phonebooks"] });
      setSelectedIds(new Set());
    },
    onError: (e: any) => toast.error(e.message),
  });

  // v4.2.27: bulk add tag mutation
  const bulkAddTagMut = useMutation({
    mutationFn: (tags: string[]) => api.post("/phonebooks/contacts/bulk-add-tags", {
      contactIds: Array.from(selectedIds), tags,
    }),
    onSuccess: (data: any) => {
      toast.success(`✓ ${data?.updated ?? selectedIds.size} kontak diberi tag: ${data?.tagsAdded?.join(", ") ?? ""}`);
      qc.invalidateQueries({ queryKey: ["phonebook-contacts", phonebookId] });
      qc.invalidateQueries({ queryKey: ["phonebook-tags", phonebookId] });
      setBulkTagOpen(false);
      setSelectedIds(new Set());
    },
    onError: (e: any) => toast.error(e.message),
  });

  function toggleSelect(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function selectAll() {
    setSelectedIds(new Set(contacts.map(c => c.id)));
  }
  function exportCsv() {
    if (contacts.length === 0) return toast.error("Tidak ada kontak untuk export");
    const header = ["name", "phone", "email", "address", "notes"];
    const rows = contacts.map(c => [
      c.name, c.phone, c.email ?? "", c.address ?? "", c.notes ?? ""
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${phonebook?.name ?? "phonebook"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV downloaded");
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4 max-w-7xl">
      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
        <MessageCircle className="h-3 w-3" />
        <span>Whatsapp</span>
        <ChevronRight className="h-3 w-3" />
        <button onClick={onBack} className="hover:text-foreground">Phonebook</button>
        <ChevronRight className="h-3 w-3" />
        <span className="font-bold">{phonebook?.name ?? "..."}</span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="rounded-md hover:bg-muted p-2 -ml-2"><ArrowLeft className="h-4 w-4" /></button>
          <div className="h-10 w-10 rounded-lg grid place-items-center shrink-0" style={{ background: phonebook?.color ?? "#7367f0" }}>
            <BookUser className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight-display">{phonebook?.name ?? "Loading..."}</h1>
            <p className="text-sm text-muted-foreground">
              {phonebook?.contactCount ?? 0} kontak{phonebook?.description ? ` · ${phonebook.description}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={exportCsv} leftIcon={<Download className="h-3.5 w-3.5" />}>
            Export CSV
          </Button>
          <Button size="sm" variant="ghost-primary" onClick={() => setImportOpen(true)} leftIcon={<Upload className="h-3.5 w-3.5" />}>
            Import
          </Button>
          <Button onClick={() => { setEditContact(null); setAddContactOpen(true); }} className="bg-violet-600 hover:bg-violet-700" size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />}>
            Tambah Kontak
          </Button>
        </div>
      </div>

      {/* Search + bulk action */}
      <div className="rounded-xl border bg-card p-3 flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Cari nama / phone / email..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 text-sm h-9" />
        </div>
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <span className="font-bold">{selectedIds.size} dipilih</span>
            <Button size="xs" variant="ghost-primary" onClick={() => setBulkTagOpen(true)} leftIcon={<Tag className="h-3 w-3" />}>
              Tambah Tag
            </Button>
            <Button size="xs" variant="ghost" onClick={() => { if (confirm(`Hapus ${selectedIds.size} kontak?`)) bulkDeleteMut.mutate(); }} loading={bulkDeleteMut.isPending} className="text-rose-600" leftIcon={<Trash2 className="h-3 w-3" />}>
              Hapus
            </Button>
            <Button size="xs" variant="ghost" onClick={() => setSelectedIds(new Set())}>Clear</Button>
          </div>
        )}
      </div>

      {/* v4.2.27: Tag filter chips */}
      {phonebookTags.length > 0 && (
        <div className="rounded-xl border bg-card p-3">
          <div className="flex items-center gap-2 mb-2">
            <Filter className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Filter by Tag</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setActiveTagFilter(null)}
              className={cn(
                "px-2.5 py-1 rounded-full text-[11px] font-semibold border transition",
                !activeTagFilter
                  ? "bg-foreground text-background border-foreground"
                  : "bg-muted/40 text-muted-foreground border-transparent hover:bg-muted"
              )}
            >
              Semua ({allContacts.length})
            </button>
            {phonebookTags.map(t => {
              const col = tagColor(t.tag);
              const active = activeTagFilter === t.tag;
              return (
                <button
                  key={t.tag}
                  onClick={() => setActiveTagFilter(active ? null : t.tag)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-[11px] font-semibold border transition",
                    active
                      ? `${col.bg} ${col.text} ${col.border} ring-2 ring-offset-1 ring-current`
                      : `${col.bg} ${col.text} ${col.border} hover:opacity-80`
                  )}
                >
                  <Tag className="h-2.5 w-2.5 inline mr-1" />
                  {t.tag} <span className="opacity-60">({t.count})</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Contacts table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        {isLoading ? (
          <div className="grid place-items-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : contacts.length === 0 ? (
          <div className="py-16 text-center">
            <Phone className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <div className="font-bold">Belum ada kontak</div>
            <div className="text-xs text-muted-foreground mt-1">Klik "Tambah Kontak" atau "Import" untuk mulai.</div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
              <tr>
                <th className="px-3 py-2 w-8">
                  <input type="checkbox" checked={selectedIds.size === contacts.length && contacts.length > 0} onChange={() => selectedIds.size === contacts.length ? setSelectedIds(new Set()) : selectAll()} className="h-3 w-3" />
                </th>
                <th className="px-3 py-2 text-left w-10">NO</th>
                <th className="px-3 py-2 text-left">NAMA</th>
                <th className="px-3 py-2 text-left">PHONE</th>
                <th className="px-3 py-2 text-left">TAGS</th>
                <th className="px-3 py-2 text-left">ALAMAT</th>
                <th className="px-3 py-2 text-right">AKSI</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {contacts.map((c, i) => {
                const cTags = parseTags(c.tags);
                return (
                  <tr key={c.id} className={cn("hover:bg-muted/30 transition", selectedIds.has(c.id) && "bg-violet-50/40")}>
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelect(c.id)} className="h-3 w-3" />
                    </td>
                    <td className="px-3 py-2 text-muted-foreground tabular-nums">{i + 1}</td>
                    <td className="px-3 py-2">
                      <div className="font-semibold">{c.name}</div>
                      {c.email && <div className="text-[10px] text-muted-foreground">{c.email}</div>}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{c.phone}</td>
                    <td className="px-3 py-2">
                      {cTags.length > 0 ? (
                        <div className="flex items-center gap-1 flex-wrap">
                          {cTags.slice(0, 3).map(t => {
                            const col = tagColor(t);
                            return (
                              <span key={t} className={cn("px-1.5 py-0.5 rounded text-[10px] font-semibold border", col.bg, col.text, col.border)}>
                                {t}
                              </span>
                            );
                          })}
                          {cTags.length > 3 && (
                            <span className="text-[10px] text-muted-foreground">+{cTags.length - 3}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/40">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-xs">{c.address ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <Button size="icon-xs" variant="ghost" onClick={() => { setEditContact(c); setAddContactOpen(true); }}>
                        <Edit3 className="h-3 w-3 text-blue-600" />
                      </Button>
                      <Button size="icon-xs" variant="ghost" onClick={() => { if (confirm(`Hapus kontak "${c.name}"?`)) deleteMut.mutate(c.id); }}>
                        <Trash2 className="h-3 w-3 text-rose-600" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <ContactFormDialog
        open={addContactOpen}
        phonebookId={phonebookId}
        existing={editContact}
        onClose={() => { setAddContactOpen(false); setEditContact(null); }}
      />
      <ImportDialog
        open={importOpen}
        phonebookId={phonebookId}
        onClose={() => setImportOpen(false)}
      />
      <BulkAddTagDialog
        open={bulkTagOpen}
        existingTags={phonebookTags.map(t => t.tag)}
        selectedCount={selectedIds.size}
        loading={bulkAddTagMut.isPending}
        onSubmit={(tags) => bulkAddTagMut.mutate(tags)}
        onClose={() => setBulkTagOpen(false)}
      />
    </div>
  );
}

// v4.2.27: Bulk add tag dialog
function BulkAddTagDialog({ open, existingTags, selectedCount, loading, onSubmit, onClose }: {
  open: boolean;
  existingTags: string[];
  selectedCount: number;
  loading: boolean;
  onSubmit: (tags: string[]) => void;
  onClose: () => void;
}) {
  const [newTag, setNewTag] = useState("");
  const [chosen, setChosen] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) { setNewTag(""); setChosen(new Set()); }
  }, [open]);

  function addNew() {
    const t = newTag.trim();
    if (!t) return;
    setChosen(prev => new Set([...prev, t]));
    setNewTag("");
  }

  function toggleExisting(t: string) {
    setChosen(prev => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  }

  function handleSubmit() {
    if (chosen.size === 0) {
      toast.error("Pilih atau bikin minimal 1 tag");
      return;
    }
    onSubmit(Array.from(chosen));
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Tambah Tag ke {selectedCount} Kontak</DialogTitle>
          <DialogDescription>Pilih tag yang ada atau bikin tag baru. Tag akan di-merge dengan tag existing kontak.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block">Tag baru</label>
            <div className="flex gap-2">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="mis. VIP, Reseller, Cilawu..."
                className="text-sm"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNew(); } }}
              />
              <Button size="sm" onClick={addNew} disabled={!newTag.trim()} leftIcon={<Plus className="h-3.5 w-3.5" />}>
                Tambah
              </Button>
            </div>
          </div>

          {existingTags.length > 0 && (
            <div>
              <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block">Atau pilih tag yang sudah ada</label>
              <div className="flex items-center gap-1.5 flex-wrap rounded-md border bg-muted/20 p-2 max-h-32 overflow-y-auto">
                {existingTags.map(t => {
                  const col = tagColor(t);
                  const isChosen = chosen.has(t);
                  return (
                    <button
                      key={t}
                      onClick={() => toggleExisting(t)}
                      className={cn(
                        "px-2 py-1 rounded text-[11px] font-semibold border transition flex items-center gap-1",
                        col.bg, col.text, col.border,
                        isChosen && "ring-2 ring-current"
                      )}
                    >
                      {isChosen ? <Check className="h-3 w-3" /> : <Tag className="h-3 w-3" />}
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {chosen.size > 0 && (
            <div className="rounded-md border-2 border-dashed border-violet-300 bg-violet-50/40 p-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-violet-700 mb-1.5">
                Akan ditambahkan ({chosen.size}):
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                {Array.from(chosen).map(t => {
                  const col = tagColor(t);
                  return (
                    <span key={t} className={cn("px-2 py-0.5 rounded text-[11px] font-semibold border flex items-center gap-1", col.bg, col.text, col.border)}>
                      {t}
                      <button onClick={() => toggleExisting(t)} className="hover:opacity-70">
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Batal</Button>
          <Button onClick={handleSubmit} disabled={loading || chosen.size === 0} loading={loading}>
            Terapkan ke {selectedCount} Kontak
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────
// CONTACT FORM (add/edit single)
// ─────────────────────────────────────────────────────────────────
function ContactFormDialog({ open, phonebookId, existing, onClose }: {
  open: boolean; phonebookId: number; existing: Contact | null; onClose: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!existing;
  const [name, setName] = useState(existing?.name ?? "");
  const [phone, setPhone] = useState(existing?.phone ?? "");
  const [email, setEmail] = useState(existing?.email ?? "");
  const [address, setAddress] = useState(existing?.address ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [tags, setTags] = useState<string[]>(existing ? parseTags(existing.tags) : []);
  const [newTag, setNewTag] = useState("");

  // Autocomplete dari billing pelanggan: ketik Nama/Phone → cari di list pelanggan → klik isi otomatis.
  const [lookupField, setLookupField] = useState<null | "name" | "phone">(null);
  const [lookupTerm, setLookupTerm] = useState("");      // term yang di-debounce untuk query
  const [picked, setPicked] = useState(false);           // true setelah user pilih saran (sembunyikan dropdown)

  const { data: phonebookTags = [] } = useQuery<TagWithCount[]>({
    queryKey: ["phonebook-tags", phonebookId],
    queryFn: () => api.get(`/phonebooks/${phonebookId}/tags`),
    enabled: open,
  });

  // Debounce: term lookup mengikuti field yang aktif diketik
  const activeValue = lookupField === "name" ? name : lookupField === "phone" ? phone : "";
  useEffect(() => {
    if (lookupField === null) return;
    const t = setTimeout(() => setLookupTerm(activeValue.trim()), 250);
    return () => clearTimeout(t);
  }, [activeValue, lookupField]);

  const { data: custLookup } = useQuery<{ items: CustomerForImport[] }>({
    queryKey: ["phonebook-customer-lookup", lookupTerm],
    queryFn: () => api.get(`/phonebook-import/customers?search=${encodeURIComponent(lookupTerm)}`),
    enabled: open && !picked && lookupField !== null && lookupTerm.length >= 2,
  });
  const suggestions = (custLookup?.items ?? []).slice(0, 6);

  function pickCustomer(c: CustomerForImport) {
    setName(c.name ?? "");
    setPhone(c.phone ?? "");
    setPicked(true);
    setLookupField(null);
  }

  const CustomerSuggestions = lookupField !== null && !picked && suggestions.length > 0 ? (
    <div className="absolute z-50 left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg max-h-56 overflow-y-auto">
      <div className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground border-b bg-muted/40">
        Pelanggan cocok di billing — klik untuk isi otomatis
      </div>
      {suggestions.map((c) => (
        <button
          key={c.id}
          type="button"
          onMouseDown={(e) => { e.preventDefault(); pickCustomer(c); }}
          className="w-full text-left px-3 py-2 hover:bg-muted/60 border-b last:border-b-0 flex items-center justify-between gap-2"
        >
          <div className="min-w-0">
            <div className="font-semibold text-sm truncate">{c.name}</div>
            <div className="text-[11px] text-muted-foreground font-mono truncate">
              {c.phone} · {c.customerId}{c.district ? ` · ${c.district}` : ""}
            </div>
          </div>
          {c.isIsolir && <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 shrink-0">Isolir</span>}
        </button>
      ))}
    </div>
  ) : null;

  useEffect(() => {
    if (open) {
      setName(existing?.name ?? "");
      setPhone(existing?.phone ?? "");
      setEmail(existing?.email ?? "");
      setAddress(existing?.address ?? "");
      setNotes(existing?.notes ?? "");
      setTags(existing ? parseTags(existing.tags) : []);
      setNewTag("");
      setLookupField(null);
      setLookupTerm("");
      setPicked(false);
    }
  }, [open, existing]);

  const saveMut = useMutation({
    mutationFn: () => {
      const body = { name, phone, email, address, notes, tags };
      return isEdit
        ? api.put(`/phonebooks/contacts/${existing!.id}`, body)
        : api.post(`/phonebooks/${phonebookId}/contacts`, body);
    },
    onSuccess: () => {
      toast.success(isEdit ? "Kontak diperbarui" : "Kontak ditambahkan");
      qc.invalidateQueries({ queryKey: ["phonebook-contacts", phonebookId] });
      qc.invalidateQueries({ queryKey: ["phonebook-tags", phonebookId] });
      qc.invalidateQueries({ queryKey: ["phonebooks"] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  function addTag(t: string) {
    const clean = t.trim();
    if (!clean) return;
    if (!tags.includes(clean)) setTags([...tags, clean]);
    setNewTag("");
  }
  function removeTag(t: string) {
    setTags(tags.filter(x => x !== t));
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Kontak" : "Tambah Kontak"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <label className="text-xs font-bold uppercase tracking-wider">Nama <span className="text-rose-600">*</span></label>
            <Input
              value={name}
              onChange={(e) => { setName(e.target.value); setPicked(false); setLookupField("name"); }}
              onFocus={() => { if (name.trim().length >= 2) setLookupField("name"); }}
              onBlur={() => setTimeout(() => setLookupField((f) => (f === "name" ? null : f)), 150)}
              placeholder="Ketik nama untuk cari pelanggan..."
              className="text-sm mt-1"
              autoComplete="off"
            />
            {lookupField === "name" && CustomerSuggestions}
          </div>
          <div className="relative">
            <label className="text-xs font-bold uppercase tracking-wider">Phone <span className="text-rose-600">*</span></label>
            <Input
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setPicked(false); setLookupField("phone"); }}
              onFocus={() => { if (phone.trim().length >= 2) setLookupField("phone"); }}
              onBlur={() => setTimeout(() => setLookupField((f) => (f === "phone" ? null : f)), 150)}
              placeholder="Ketik nomor untuk cari pelanggan..."
              className="text-sm font-mono mt-1"
              autoComplete="off"
            />
            {lookupField === "phone" && CustomerSuggestions}
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider">Email</label>
            <Input value={email ?? ""} onChange={(e) => setEmail(e.target.value)} type="email" className="text-sm mt-1" />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider">Alamat</label>
            <Input value={address ?? ""} onChange={(e) => setAddress(e.target.value)} className="text-sm mt-1" />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider">Tags <span className="text-muted-foreground font-normal normal-case">(kategori)</span></label>
            <div className="flex gap-2 mt-1">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="VIP, Reseller, Cilawu..."
                className="text-sm"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(newTag); } }}
              />
              <Button size="sm" onClick={() => addTag(newTag)} disabled={!newTag.trim()} leftIcon={<Plus className="h-3 w-3" />}>Add</Button>
            </div>
            {tags.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap mt-2">
                {tags.map(t => {
                  const col = tagColor(t);
                  return (
                    <span key={t} className={cn("px-2 py-0.5 rounded text-[11px] font-semibold border flex items-center gap-1", col.bg, col.text, col.border)}>
                      {t}
                      <button onClick={() => removeTag(t)} className="hover:opacity-70">
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            {phonebookTags.length > 0 && (
              <div className="mt-2">
                <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Saran tag (yang sudah ada):</div>
                <div className="flex items-center gap-1 flex-wrap">
                  {phonebookTags.filter(pt => !tags.includes(pt.tag)).slice(0, 8).map(pt => {
                    const col = tagColor(pt.tag);
                    return (
                      <button
                        key={pt.tag}
                        onClick={() => addTag(pt.tag)}
                        className={cn("px-2 py-0.5 rounded text-[10px] font-semibold border opacity-60 hover:opacity-100", col.bg, col.text, col.border)}
                      >
                        + {pt.tag}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider">Notes</label>
            <Textarea value={notes ?? ""} onChange={(e) => setNotes(e.target.value)} rows={2} className="text-sm mt-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Batal</Button>
          <Button onClick={() => saveMut.mutate()} disabled={!name.trim() || !phone.trim() || saveMut.isPending} loading={saveMut.isPending}>
            {isEdit ? "Simpan" : "Tambah"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────
// IMPORT DIALOG (3 mode: from customers / CSV / paste text)
// ─────────────────────────────────────────────────────────────────
function ImportDialog({ open, phonebookId, onClose }: { open: boolean; phonebookId: number; onClose: () => void }) {
  const qc = useQueryClient();
  type Mode = "customers" | "phonebook" | "csv" | "paste";
  const [mode, setMode] = useState<Mode>("customers");
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<Set<number>>(new Set());
  const [selectedContactIds, setSelectedContactIds] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [csvText, setCsvText] = useState("");
  const [pasteText, setPasteText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // v4.2.27: smart filter state untuk customers mode
  const [paketFilter, setPaketFilter] = useState("all");
  const [kecamatanFilter, setKecamatanFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // v4.2.27: source phonebook untuk cross-import
  const [sourcePhonebookId, setSourcePhonebookId] = useState<number | null>(null);

  // v4.2.27: tags to apply saat import
  const [importTags, setImportTags] = useState<string[]>([]);
  const [importTagInput, setImportTagInput] = useState("");

  // Load customers via smart filter endpoint
  const { data: customerData } = useQuery<{ items: CustomerForImport[]; total: number }>({
    queryKey: ["customers-for-import", paketFilter, kecamatanFilter, statusFilter, search],
    queryFn: () => api.get(`/phonebook-import/customers?paket=${paketFilter}&kecamatan=${kecamatanFilter}&status=${statusFilter}&search=${encodeURIComponent(search)}`),
    enabled: open && mode === "customers",
  });
  const customers = customerData?.items ?? [];

  // Load filter options (paket + kecamatan list)
  const { data: customerFilters } = useQuery<CustomerFilters>({
    queryKey: ["phonebooks-customer-filters"],
    queryFn: () => api.get("/phonebook-import/customer-filters"),
    enabled: open && mode === "customers",
  });

  // Load all phonebooks untuk source picker
  const { data: allPhonebooks = [] } = useQuery<Phonebook[]>({
    queryKey: ["phonebooks-list-for-import", open],
    queryFn: () => api.get("/phonebooks"),
    enabled: open && mode === "phonebook",
  });

  // Load contacts dari source phonebook
  const { data: sourceContacts = [] } = useQuery<Contact[]>({
    queryKey: ["phonebook-source-contacts", sourcePhonebookId],
    queryFn: () => api.get(`/phonebooks/${sourcePhonebookId}/contacts`),
    enabled: open && mode === "phonebook" && sourcePhonebookId !== null,
  });

  // Load tags untuk autocomplete
  const { data: existingTags = [] } = useQuery<TagWithCount[]>({
    queryKey: ["phonebook-tags", phonebookId],
    queryFn: () => api.get(`/phonebooks/${phonebookId}/tags`),
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      setMode("customers");
      setSelectedCustomerIds(new Set());
      setSelectedContactIds(new Set());
      setSearch("");
      setCsvText("");
      setPasteText("");
      setPaketFilter("all");
      setKecamatanFilter("all");
      setStatusFilter("all");
      setSourcePhonebookId(null);
      setImportTags([]);
      setImportTagInput("");
    }
  }, [open]);

  const filteredCustomers = useMemo(() => customers.slice(0, 500), [customers]);

  const filteredSourceContacts = useMemo(() => {
    if (!search.trim()) return sourceContacts;
    const q = search.toLowerCase();
    return sourceContacts.filter(c => c.name.toLowerCase().includes(q) || c.phone.includes(q));
  }, [sourceContacts, search]);

  const importMut = useMutation({
    mutationFn: async () => {
      // Tags yang akan diaplikasi (kalau ada)
      const tagsToApply = importTags.length > 0 ? importTags : undefined;

      if (mode === "customers") {
        const contacts = customers.filter(c => selectedCustomerIds.has(c.id)).map(c => ({
          name: c.name,
          phone: c.phone,
          customerId: c.id,
          customFields: { package: c.package, district: c.district, customerCode: c.customerId },
          tags: tagsToApply,
        }));
        if (contacts.length === 0) throw new Error("Tidak ada customer yang dipilih");
        return api.post<{ added: number; skipped: number; duplicates: string[] }>(`/phonebooks/${phonebookId}/contacts/bulk`, { contacts });
      }

      if (mode === "phonebook") {
        if (!sourcePhonebookId) throw new Error("Pilih source phonebook dulu");
        const ids = selectedContactIds.size > 0 ? Array.from(selectedContactIds) : undefined;
        if (selectedContactIds.size === 0 && sourceContacts.length === 0) {
          throw new Error("Phonebook sumber kosong");
        }
        return api.post<{ added: number; skipped: number; duplicates: string[]; total: number }>(`/phonebooks/${phonebookId}/import-from-phonebook`, {
          sourcePhonebookId,
          contactIds: ids,
          addTags: tagsToApply,
        });
      }

      // CSV / paste
      const raw = mode === "csv" ? csvText : pasteText;
      const lines = raw.split(/\r?\n/).filter(l => l.trim());
      let startIdx = 0;
      if (lines[0] && /name|nama|phone|telepon/i.test(lines[0])) startIdx = 1;
      const contacts: any[] = [];
      for (let i = startIdx; i < lines.length; i++) {
        const cells = lines[i].split(/[,;\t]/).map(c => c.replace(/^"|"$/g, "").trim());
        if (cells.length < 2) continue;
        const [name, phone, email = "", address = "", notes = ""] = cells;
        if (!name || !phone) continue;
        contacts.push({ name, phone, email: email || undefined, address: address || undefined, notes: notes || undefined, tags: tagsToApply });
      }
      if (contacts.length === 0) throw new Error("Tidak ada kontak valid untuk di-import");
      return api.post<{ added: number; skipped: number; duplicates: string[] }>(`/phonebooks/${phonebookId}/contacts/bulk`, { contacts });
    },
    onSuccess: (data: any) => {
      toast.success(`✓ ${data?.added ?? 0} kontak ditambahkan${data?.skipped ? ` · ${data.skipped} duplicate di-skip` : ""}`);
      qc.invalidateQueries({ queryKey: ["phonebook-contacts", phonebookId] });
      qc.invalidateQueries({ queryKey: ["phonebook-tags", phonebookId] });
      qc.invalidateQueries({ queryKey: ["phonebooks"] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  async function handleFileUpload(file: File) {
    const text = await file.text();
    setCsvText(text);
    toast.success(`File loaded: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
  }

  function addImportTag(t: string) {
    const clean = t.trim();
    if (!clean) return;
    if (!importTags.includes(clean)) setImportTags([...importTags, clean]);
    setImportTagInput("");
  }
  function removeImportTag(t: string) {
    setImportTags(importTags.filter(x => x !== t));
  }

  const canSubmit = !importMut.isPending && (
    (mode === "customers" && selectedCustomerIds.size > 0) ||
    (mode === "phonebook" && sourcePhonebookId !== null && (selectedContactIds.size > 0 || sourceContacts.length > 0)) ||
    (mode === "csv" && csvText.trim()) ||
    (mode === "paste" && pasteText.trim())
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Kontak</DialogTitle>
          <DialogDescription>Bulk import dari sumber data yang ada. Tag opsional untuk kategorisasi.</DialogDescription>
        </DialogHeader>

        {/* Mode tabs */}
        <div className="flex gap-1 border-b overflow-x-auto">
          {([
            { val: "customers" as const, label: "Dari Customers", icon: Users },
            { val: "phonebook" as const, label: "Phonebook Lain", icon: BookUser },
            { val: "csv" as const,       label: "Upload CSV",     icon: FileSpreadsheet },
            { val: "paste" as const,     label: "Paste Text",     icon: Edit3 },
          ]).map(t => {
            const Icon = t.icon;
            return (
              <button key={t.val} onClick={() => setMode(t.val)} className={cn(
                "px-3 py-2 text-xs font-bold uppercase tracking-wider transition border-b-2 flex items-center gap-1.5 whitespace-nowrap",
                mode === t.val ? "border-violet-600 text-violet-600" : "border-transparent text-muted-foreground hover:text-foreground"
              )}>
                <Icon className="h-3 w-3" />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="mt-3 space-y-3">
          {mode === "customers" && (
            <>
              {/* Smart filter row */}
              <div className="rounded-lg border bg-sky-50/40 border-sky-200 p-3 space-y-2">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-sky-700">
                  <Sparkles className="h-3 w-3" />
                  Smart Filter — Kategori per pelanggan
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Paket</label>
                    <select
                      value={paketFilter}
                      onChange={(e) => { setPaketFilter(e.target.value); setSelectedCustomerIds(new Set()); }}
                      className="w-full mt-0.5 px-2 py-1.5 rounded border bg-background text-xs"
                    >
                      <option value="all">Semua Paket</option>
                      {customerFilters?.paket?.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Kecamatan</label>
                    <select
                      value={kecamatanFilter}
                      onChange={(e) => { setKecamatanFilter(e.target.value); setSelectedCustomerIds(new Set()); }}
                      className="w-full mt-0.5 px-2 py-1.5 rounded border bg-background text-xs"
                    >
                      <option value="all">Semua Kecamatan</option>
                      {customerFilters?.kecamatan?.map(k => <option key={k} value={k}>{k}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Status</label>
                    <select
                      value={statusFilter}
                      onChange={(e) => { setStatusFilter(e.target.value); setSelectedCustomerIds(new Set()); }}
                      className="w-full mt-0.5 px-2 py-1.5 rounded border bg-background text-xs"
                    >
                      <option value="all">Semua Status</option>
                      <option value="active">Aktif</option>
                      <option value="isolir">Isolir</option>
                      <option value="overdue">Overdue</option>
                    </select>
                  </div>
                </div>
                {(paketFilter !== "all" || kecamatanFilter !== "all" || statusFilter !== "all") && (
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-sky-700 font-semibold">
                      Filter aktif: {[
                        paketFilter !== "all" && `Paket ${paketFilter}`,
                        kecamatanFilter !== "all" && `Kec. ${kecamatanFilter}`,
                        statusFilter !== "all" && `Status ${statusFilter}`,
                      ].filter(Boolean).join(" · ")}
                    </span>
                    <button onClick={() => { setPaketFilter("all"); setKecamatanFilter("all"); setStatusFilter("all"); }} className="text-rose-600 font-bold hover:underline">
                      Clear filter
                    </button>
                  </div>
                )}
              </div>

              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Cari nama / customer ID / phone..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 text-sm" />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold">{selectedCustomerIds.size} dipilih dari {filteredCustomers.length} {customerData?.total && customerData.total > filteredCustomers.length ? `(total ${customerData.total})` : ""}</span>
                <div className="flex gap-1">
                  <Button size="xs" variant="ghost" onClick={() => setSelectedCustomerIds(new Set(filteredCustomers.map(c => c.id)))}>Pilih Semua Yang Terlihat</Button>
                  {selectedCustomerIds.size > 0 && (
                    <Button size="xs" variant="ghost" onClick={() => setSelectedCustomerIds(new Set())}>Clear</Button>
                  )}
                </div>
              </div>
              <div className="rounded-md border max-h-[280px] overflow-y-auto divide-y">
                {filteredCustomers.length === 0 ? (
                  <div className="py-6 text-center text-xs text-muted-foreground">Tidak ada customer dengan filter ini</div>
                ) : filteredCustomers.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCustomerIds(prev => {
                      const next = new Set(prev);
                      if (next.has(c.id)) next.delete(c.id); else next.add(c.id);
                      return next;
                    })}
                    className={cn(
                      "w-full text-left px-3 py-1.5 flex items-center gap-2 text-xs hover:bg-muted/40",
                      selectedCustomerIds.has(c.id) && "bg-violet-50"
                    )}
                  >
                    <div className={cn("h-4 w-4 rounded border-2 grid place-items-center shrink-0",
                      selectedCustomerIds.has(c.id) ? "bg-violet-600 border-violet-600" : "border-zinc-300"
                    )}>
                      {selectedCustomerIds.has(c.id) && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate flex items-center gap-1.5">
                        {c.name}
                        {c.isIsolir && <span className="px-1 py-0 rounded bg-rose-100 text-rose-700 text-[9px] font-bold">ISOLIR</span>}
                      </div>
                      <div className="text-[10px] text-muted-foreground">#{c.customerId} · {c.phone}{c.package && ` · 📦 ${c.package}`}{c.district && ` · 🗺️ ${c.district}`}</div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {mode === "phonebook" && (
            <>
              <div className="rounded-lg border bg-violet-50/40 border-violet-200 p-3 space-y-2">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-violet-700">
                  <CopyIcon className="h-3 w-3" />
                  Cross-Phonebook Copy — Ambil dari phonebook lain
                </div>
                <select
                  value={sourcePhonebookId ?? ""}
                  onChange={(e) => { setSourcePhonebookId(e.target.value ? Number(e.target.value) : null); setSelectedContactIds(new Set()); }}
                  className="w-full px-2 py-1.5 rounded border bg-background text-xs"
                >
                  <option value="">— Pilih phonebook sumber —</option>
                  {allPhonebooks.filter(p => p.id !== phonebookId).map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.contactCount} kontak)</option>
                  ))}
                </select>
              </div>

              {sourcePhonebookId && (
                <>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input placeholder="Cari kontak..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 text-sm" />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold">
                      {selectedContactIds.size === 0
                        ? `Semua (${filteredSourceContacts.length})`
                        : `${selectedContactIds.size} dipilih dari ${filteredSourceContacts.length}`}
                    </span>
                    <div className="flex gap-1">
                      <Button size="xs" variant="ghost" onClick={() => setSelectedContactIds(new Set(filteredSourceContacts.map(c => c.id)))}>Pilih Semua</Button>
                      {selectedContactIds.size > 0 && (
                        <Button size="xs" variant="ghost" onClick={() => setSelectedContactIds(new Set())}>Clear</Button>
                      )}
                    </div>
                  </div>
                  <div className="rounded-md border max-h-[280px] overflow-y-auto divide-y">
                    {filteredSourceContacts.length === 0 ? (
                      <div className="py-6 text-center text-xs text-muted-foreground">Tidak ada kontak</div>
                    ) : filteredSourceContacts.map(c => {
                      const cTags = parseTags(c.tags);
                      return (
                        <button
                          key={c.id}
                          onClick={() => setSelectedContactIds(prev => {
                            const next = new Set(prev);
                            if (next.has(c.id)) next.delete(c.id); else next.add(c.id);
                            return next;
                          })}
                          className={cn(
                            "w-full text-left px-3 py-1.5 flex items-center gap-2 text-xs hover:bg-muted/40",
                            selectedContactIds.has(c.id) && "bg-violet-50"
                          )}
                        >
                          <div className={cn("h-4 w-4 rounded border-2 grid place-items-center shrink-0",
                            selectedContactIds.has(c.id) ? "bg-violet-600 border-violet-600" : "border-zinc-300"
                          )}>
                            {selectedContactIds.has(c.id) && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold truncate">{c.name}</div>
                            <div className="text-[10px] text-muted-foreground flex items-center gap-1 flex-wrap">
                              <span>{c.phone}</span>
                              {cTags.slice(0, 3).map(t => {
                                const col = tagColor(t);
                                return <span key={t} className={cn("px-1 py-0 rounded text-[8px] font-bold", col.bg, col.text)}>{t}</span>;
                              })}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="text-[10px] text-muted-foreground italic">
                    💡 Tip: kalau ngga pilih spesifik, akan import SEMUA kontak dari phonebook sumber.
                  </div>
                </>
              )}
            </>
          )}

          {mode === "csv" && (
            <>
              <div className="rounded-md border-2 border-dashed p-6 text-center cursor-pointer hover:border-violet-400" onClick={() => fileRef.current?.click()}>
                <FileSpreadsheet className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                <div className="text-sm font-bold">Klik untuk pilih file CSV</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Format: name, phone, email, address, notes (semua kolom opsional kecuali name + phone)</div>
                <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileUpload(f);
                  if (fileRef.current) fileRef.current.value = "";
                }} />
              </div>
              {csvText && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Preview ({csvText.split(/\r?\n/).length} baris):</div>
                  <Textarea value={csvText} onChange={(e) => setCsvText(e.target.value)} rows={8} className="text-xs font-mono" />
                </div>
              )}
            </>
          )}

          {mode === "paste" && (
            <>
              <div className="text-xs text-muted-foreground">
                Paste daftar kontak format CSV (1 baris per kontak):
                <div className="mt-1 font-mono bg-muted/40 p-2 rounded text-[10px]">name,phone,email,address,notes</div>
              </div>
              <Textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Budi Santoso,628111222333,budi@example.com,Jl. Sudirman 1,VIP customer&#10;Ani Susanti,628444555666,ani@email.com,,"
                rows={10}
                className="text-xs font-mono"
              />
            </>
          )}

          {/* v4.2.27: Tags to apply during import */}
          <div className="rounded-lg border bg-emerald-50/30 border-emerald-200 p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Tag className="h-3 w-3 text-emerald-700" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                Tag untuk Kategori (opsional)
              </span>
            </div>
            <div className="flex gap-2">
              <Input
                value={importTagInput}
                onChange={(e) => setImportTagInput(e.target.value)}
                placeholder="VIP, Cilawu, Paket 20M..."
                className="text-sm h-8"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addImportTag(importTagInput); } }}
              />
              <Button size="xs" onClick={() => addImportTag(importTagInput)} disabled={!importTagInput.trim()}>
                + Tag
              </Button>
            </div>
            {importTags.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap mt-2">
                {importTags.map(t => {
                  const col = tagColor(t);
                  return (
                    <span key={t} className={cn("px-2 py-0.5 rounded text-[11px] font-semibold border flex items-center gap-1", col.bg, col.text, col.border)}>
                      {t}
                      <button onClick={() => removeImportTag(t)} className="hover:opacity-70">
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            {existingTags.length > 0 && (
              <div className="mt-2">
                <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Saran:</div>
                <div className="flex items-center gap-1 flex-wrap">
                  {existingTags.filter(et => !importTags.includes(et.tag)).slice(0, 6).map(et => {
                    const col = tagColor(et.tag);
                    return (
                      <button
                        key={et.tag}
                        onClick={() => addImportTag(et.tag)}
                        className={cn("px-2 py-0.5 rounded text-[10px] font-semibold border opacity-60 hover:opacity-100", col.bg, col.text, col.border)}
                      >
                        + {et.tag}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="text-[10px] text-emerald-700/70 mt-2">
              ✨ Tag akan diaplikasi ke SEMUA kontak yang diimport. Cocok buat kategorisasi cepet.
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Batal</Button>
          <Button
            onClick={() => importMut.mutate()}
            disabled={!canSubmit}
            loading={importMut.isPending}
            leftIcon={<Save className="h-3.5 w-3.5" />}
          >
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
