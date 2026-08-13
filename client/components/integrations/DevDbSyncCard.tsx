import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Database, AlertTriangle, DownloadCloud } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useDevDbSync, type DevDbSyncResult } from "@/hooks/useDevDbSync";

/**
 * Prominent dev-only card: "Tarik Data dari Production".
 * Renders ONLY when /api/public-config reports devDbSync === true (i.e. on the dev environment).
 * Production users never see it. Clicking copies prod data INTO this dev DB (overwrites dev).
 */
export function DevDbSyncCard() {
  const [available, setAvailable] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [result, setResult] = useState<DevDbSyncResult | null>(null);
  const sync = useDevDbSync();

  useEffect(() => {
    let alive = true;
    api.get<{ devDbSync?: boolean }>("/public-config")
      .then((cfg) => { if (alive) setAvailable(cfg?.devDbSync === true); })
      .catch(() => { /* not available */ });
    return () => { alive = false; };
  }, []);

  if (!available) return null;

  const run = () => {
    setResult(null); // clear any previous summary before a fresh run
    sync.mutate(undefined, {
      onSuccess: (r) => {
        setResult(r);
        setConfirmOpen(false);
        setPhrase("");
        const msg = `${r.tablesCopied} tabel · ${r.totalRows.toLocaleString("id-ID")} baris · ${(r.durationMs / 1000).toFixed(1)}s`;
        const skipped = r.skippedMissingInProd?.length ?? 0;
        if (r.failed.length) toast.warning(`${msg} · ${r.failed.length} tabel gagal`);
        else if (skipped) toast.warning(`${msg} · ${skipped} tabel dilewati (tak ada di production)`);
        else toast.success(`Data production tersalin: ${msg}`);
      },
      onError: (e: any) => {
        // Close + reset the dialog on failure so it doesn't sit open with a stale phrase.
        setConfirmOpen(false);
        setPhrase("");
        toast.error(e?.message || "Sinkronisasi gagal");
      },
    });
  };

  return (
    <div className="rounded-xl border-2 border-warning/30 bg-warning/10 p-4 sm:p-5 shadow-elev-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <div className="shrink-0 w-10 h-10 rounded-xl bg-warning/20 flex items-center justify-center">
            <Database className="h-5 w-5 text-warning" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 rounded-full bg-warning text-white text-[10px] font-bold uppercase tracking-wide px-2 py-0.5">
                <AlertTriangle className="h-3 w-3" /> Lingkungan: Development
              </span>
            </div>
            <h3 className="mt-1 text-base font-bold text-warning">Tarik Data dari Production</h3>
            <p className="mt-0.5 text-sm text-warning/90">
              Menyalin SEMUA data production ke database dev ini. Data testing di dev akan ditimpa.
              Production tidak diubah.
            </p>
          </div>
        </div>
        <Button
          size="lg"
          className="w-full sm:w-auto shrink-0 bg-warning hover:brightness-95 text-white"
          onClick={() => setConfirmOpen(true)}
          loading={sync.isPending}
        >
          <DownloadCloud className="size-4 mr-1.5" /> Salin data prod → dev
        </Button>
      </div>

      {result && (
        <div className="mt-3 space-y-1 text-xs text-warning/80">
          <div>
            Terakhir: {result.tablesCopied} tabel · {result.totalRows.toLocaleString("id-ID")} baris
            {result.failed.length > 0 && (
              <span className="text-destructive"> · gagal: {result.failed.map((f) => f.table).join(", ")}</span>
            )}
          </div>
          {result.skippedMissingInProd?.length > 0 && (
            <div className="rounded-md border border-warning/30 bg-warning/60 p-2">
              <span className="font-semibold">{result.skippedMissingInProd.length} tabel dilewati</span> — ada di dev tapi tidak di database production ini,
              jadi tak bisa disalin (cek <code className="font-mono">PROD_DB_NAME</code>):
              <span className="mt-0.5 block break-words font-mono text-[11px]">{result.skippedMissingInProd.join(", ")}</span>
            </div>
          )}
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={(o) => { if (!o) { setConfirmOpen(false); setPhrase(""); } }}>
        <DialogContent className="max-w-md dialog-w">
          <DialogHeader>
            <DialogTitle>Salin data production ke dev?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>Seluruh isi database dev ini akan <strong>ditimpa</strong> dengan data production terkini
              (pelanggan, pipelines, mitra, user, dll). Semua perubahan testing di dev akan hilang.</p>
            <p className="text-muted-foreground">Ketik <strong>SALIN</strong> untuk melanjutkan.</p>
            <Input value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder="SALIN" autoCapitalize="characters" autoFocus />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => { setConfirmOpen(false); setPhrase(""); }} disabled={sync.isPending}>
              Batal
            </Button>
            <Button
              className="bg-warning hover:brightness-95 text-white"
              disabled={phrase.trim().toUpperCase() !== "SALIN" || sync.isPending}
              loading={sync.isPending}
              onClick={run}
            >
              Ya, salin sekarang
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
