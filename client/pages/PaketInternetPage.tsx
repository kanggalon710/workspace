import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Package, Plus, Edit, Trash2, Loader2,
  ArrowUpFromLine, ArrowDownFromLine,
  Network, Globe, Server, Gauge,
} from "lucide-react";

interface SafeRouter {
  id: number;
  name: string;
  host: string;
}

interface PppProfile {
  id: string;
  name: string;
  rateLimit?: string;
  localAddress?: string;
  remoteAddress?: string;
  dnsServer?: string;
  changeTcpMss?: string;
  [key: string]: any;
}

const EMPTY_FORM = {
  name: "",
  rateLimit: "",
  localAddress: "",
  remoteAddress: "",
  dnsServer: "",
  changeTcpMss: false,
};

function formatRateLimit(rateLimit?: string): { upload: string; download: string } {
  if (!rateLimit) return { upload: "\u2014", download: "\u2014" };
  const parts = rateLimit.split("/");
  return { upload: parts[0] || "\u2014", download: parts[1] || parts[0] || "\u2014" };
}

export default function PaketInternetPage() {
  const queryClient = useQueryClient();
  const [selectedRouterId, setSelectedRouterId] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editProfile, setEditProfile] = useState<PppProfile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PppProfile | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  // Fetch all routers for the selector
  const { data: routers, isLoading: routersLoading } = useQuery<SafeRouter[]>({
    queryKey: ["/api/mikrotik/routers"],
    queryFn: () => api.get<SafeRouter[]>("/mikrotik/routers"),
  });

  // Fetch PPP profiles for the selected router
  const { data: profiles, isLoading: profilesLoading } = useQuery<PppProfile[]>({
    queryKey: ["/api/mikrotik/routers", selectedRouterId, "ppp/profile"],
    queryFn: () => api.get<PppProfile[]>(`/mikrotik/routers/${selectedRouterId}/ppp/profile`),
    enabled: !!selectedRouterId,
  });

  const createMut = useMutation({
    mutationFn: (d: any) => api.post(`/mikrotik/routers/${selectedRouterId}/ppp/profile`, d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mikrotik/routers", selectedRouterId, "ppp/profile"] });
      toast.success("Paket internet berhasil ditambahkan");
      setDialogOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ profileId, ...d }: any) =>
      api.put(`/mikrotik/routers/${selectedRouterId}/ppp/profile/${profileId}`, d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mikrotik/routers", selectedRouterId, "ppp/profile"] });
      toast.success("Paket internet berhasil diupdate");
      setDialogOpen(false);
      setEditProfile(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (profileId: string) =>
      api.delete(`/mikrotik/routers/${selectedRouterId}/ppp/profile/${profileId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mikrotik/routers", selectedRouterId, "ppp/profile"] });
      toast.success("Paket internet berhasil dihapus");
      setDeleteTarget(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const setField = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  const openCreate = () => {
    setEditProfile(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (p: PppProfile) => {
    setEditProfile(p);
    setForm({
      name: p.name,
      rateLimit: p.rateLimit || "",
      localAddress: p.localAddress || "",
      remoteAddress: p.remoteAddress || "",
      dnsServer: p.dnsServer || "",
      changeTcpMss: p.changeTcpMss === "yes",
    });
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      return toast.error("Nama paket wajib diisi");
    }
    const payload: any = {
      name: form.name.trim(),
      rateLimit: form.rateLimit.trim() || undefined,
      localAddress: form.localAddress.trim() || undefined,
      remoteAddress: form.remoteAddress.trim() || undefined,
      dnsServer: form.dnsServer.trim() || undefined,
      changeTcpMss: form.changeTcpMss ? "yes" : "no",
    };
    if (editProfile) {
      updateMut.mutate({ profileId: editProfile.id, ...payload });
    } else {
      createMut.mutate(payload);
    }
  };

  const selectedRouter = routers?.find(r => String(r.id) === selectedRouterId);

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">Paket Internet</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Kelola PPP Profile (paket bandwidth) di router MikroTik.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2 shrink-0" disabled={!selectedRouterId}>
          <Plus className="h-4 w-4" /> Tambah Paket
        </Button>
      </div>

      {/* Router Selector */}
      <Card className="border-border/60">
        <CardContent className="p-3 md:p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
              Pilih Router
            </Label>
            <Select value={selectedRouterId} onValueChange={setSelectedRouterId}>
              <SelectTrigger className="w-full sm:w-[300px] h-9">
                <SelectValue placeholder={routersLoading ? "Memuat router..." : "Pilih router MikroTik"} />
              </SelectTrigger>
              <SelectContent>
                {routers?.map(r => (
                  <SelectItem key={r.id} value={String(r.id)}>
                    <span className="flex items-center gap-2">
                      <Server className="h-3.5 w-3.5 text-muted-foreground" />
                      {r.name}
                      <span className="text-muted-foreground font-mono text-xs">({r.host})</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedRouter && (
              <p className="text-[11px] text-muted-foreground sm:ml-2">
                Menampilkan profil dari <span className="font-semibold text-foreground">{selectedRouter.name}</span>
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Content Area */}
      {!selectedRouterId ? (
        /* No router selected */
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <Server className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">Pilih router terlebih dahulu untuk melihat paket internet.</p>
          </CardContent>
        </Card>
      ) : profilesLoading ? (
        /* Loading state */
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-5">
                <div className="h-32 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !profiles || profiles.length === 0 ? (
        /* Empty state */
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <Package className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground mb-3">Belum ada paket internet di router ini.</p>
            <Button onClick={openCreate} variant="outline" className="gap-2">
              <Plus className="h-4 w-4" /> Tambah Paket Pertama
            </Button>
          </CardContent>
        </Card>
      ) : (
        /* Profile Grid */
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {profiles.map(p => {
            const rate = formatRateLimit(p.rateLimit);
            return (
              <Card key={p.id} className="border-border/60 transition-all hover:shadow-md">
                <CardContent className="p-5 space-y-3">
                  {/* Profile Name */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <Gauge className="h-5 w-5 text-primary" />
                      </div>
                      <h3 className="font-semibold text-foreground truncate text-sm">{p.name}</h3>
                    </div>
                    {p.rateLimit && (
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {p.rateLimit}
                      </Badge>
                    )}
                  </div>

                  {/* Rate Limit Display */}
                  <div className="bg-muted/40 rounded-lg p-3 grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-2">
                      <ArrowUpFromLine className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Upload</p>
                        <p className="text-sm font-bold text-foreground truncate">{rate.upload}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <ArrowDownFromLine className="h-3.5 w-3.5 text-green-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Download</p>
                        <p className="text-sm font-bold text-foreground truncate">{rate.download}</p>
                      </div>
                    </div>
                  </div>

                  {/* Details */}
                  <div className="space-y-1.5 text-xs">
                    {p.localAddress && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Network className="h-3 w-3 shrink-0" />
                        <span>Local: <span className="font-medium text-foreground font-mono">{p.localAddress}</span></span>
                      </div>
                    )}
                    {p.remoteAddress && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Network className="h-3 w-3 shrink-0" />
                        <span>Remote: <span className="font-medium text-foreground font-mono">{p.remoteAddress}</span></span>
                      </div>
                    )}
                    {p.dnsServer && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Globe className="h-3 w-3 shrink-0" />
                        <span>DNS: <span className="font-medium text-foreground font-mono">{p.dnsServer}</span></span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1.5 pt-2 border-t border-border/60">
                    <Button
                      variant="outline" size="sm" className="flex-1 h-8 text-xs gap-1.5"
                      onClick={() => openEdit(p)}
                    >
                      <Edit className="h-3 w-3" /> Edit
                    </Button>
                    <Button
                      variant="outline" size="sm"
                      className="h-8 w-8 p-0 text-red-500 hover:bg-red-500/10"
                      onClick={() => setDeleteTarget(p)}
                      title="Hapus"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) { setDialogOpen(false); setEditProfile(null); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editProfile ? <Edit className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {editProfile ? `Edit: ${editProfile.name}` : "Tambah Paket Internet"}
            </DialogTitle>
            <DialogDescription>
              {editProfile
                ? "Ubah konfigurasi PPP Profile di router MikroTik."
                : "Buat PPP Profile baru untuk paket bandwidth pelanggan."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Nama Paket <span className="text-red-500">*</span></Label>
              <Input
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
                placeholder="contoh: 10Mbps, Paket-Gold"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Rate Limit</Label>
              <Input
                value={form.rateLimit}
                onChange={(e) => setField("rateLimit", e.target.value)}
                placeholder="10M/25M (upload/download)"
              />
              <p className="text-[11px] text-muted-foreground">
                Format: upload/download (contoh: 10M/25M, 5M/10M, 1M/3M)
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Local Address</Label>
                <Input
                  value={form.localAddress}
                  onChange={(e) => setField("localAddress", e.target.value)}
                  placeholder="10.0.0.1 (opsional)"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Remote Address</Label>
                <Input
                  value={form.remoteAddress}
                  onChange={(e) => setField("remoteAddress", e.target.value)}
                  placeholder="pppoe-pool (opsional)"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">DNS Server</Label>
              <Input
                value={form.dnsServer}
                onChange={(e) => setField("dnsServer", e.target.value)}
                placeholder="8.8.8.8,8.8.4.4 (opsional)"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="changeTcpMss"
                checked={form.changeTcpMss}
                onChange={(e) => setField("changeTcpMss", e.target.checked)}
                className="rounded"
              />
              <Label htmlFor="changeTcpMss" className="text-xs cursor-pointer">
                Change TCP MSS
              </Label>
            </div>

            <div className="flex gap-2 justify-end pt-2 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => { setDialogOpen(false); setEditProfile(null); }}
              >
                Batal
              </Button>
              <Button
                type="submit"
                disabled={createMut.isPending || updateMut.isPending}
                className="gap-2"
              >
                {(createMut.isPending || updateMut.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
                {editProfile ? "Simpan" : "Tambah"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteTarget !== null} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-500" /> Hapus Paket Internet?
            </DialogTitle>
            <DialogDescription>
              Paket <b>{deleteTarget?.name}</b> akan dihapus dari router.
              Pelanggan yang menggunakan profil ini mungkin akan terpengaruh.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Batal</Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
              disabled={deleteMut.isPending}
              className="gap-2"
            >
              {deleteMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Hapus
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
