import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calculator, AlertTriangle, CheckCircle2 } from "lucide-react";
import { type Odp } from "@shared/schema";

export function CapacityCalculatorModal({ odps }: { odps: Odp[] }) {
  const [district, setDistrict] = useState<string>("");
  const [targetCustomers, setTargetCustomers] = useState<number>(50);

  // Dapatkan daftar kecamatan unik dari ODP
  const districts = Array.from(new Set(odps.map(o => (o as any).district?.trim() || "").filter(Boolean))).sort();

  // Kalkulasi sisa kapasitas
  const odpsInDistrict = odps.filter(o => ((o as any).district?.trim() || "") === district);
  const totalCapacity = odpsInDistrict.reduce((acc, o) => acc + (o.capacity || 0), 0);
  const totalUsed = odpsInDistrict.reduce((acc, o) => acc + ((o as any).usedPorts || 0), 0);
  const availablePorts = totalCapacity - totalUsed;
  
  const projectedRemaining = availablePorts - targetCustomers;
  const isDanger = projectedRemaining < 0;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs font-semibold gap-2 border-primary/30 text-primary bg-primary/5 hover:bg-primary/10 transition-colors shadow-sm rounded-lg hidden md:flex">
          <Calculator className="h-3.5 w-3.5" />
          Kalkulator Kapasitas
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            Simulasi Kapasitas Area
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4 mt-2">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Target Area Eksspansi (Kecamatan)</label>
            <Select value={district} onValueChange={setDistrict}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih wilayah kecamatan..." />
              </SelectTrigger>
              <SelectContent>
                {districts.map(d => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Target Penambahan Pelanggan Baru</label>
            <Input 
              type="number" 
              value={targetCustomers} 
              onChange={(e) => setTargetCustomers(parseInt(e.target.value) || 0)}
              min={1}
            />
          </div>

          {district && (
            <div className="mt-6 p-4 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-in fade-in duration-300">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 border-b pb-2">Hasil Prediksi</h4>
              
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-[10px] text-muted-foreground">Kapasitas Port Saat Ini</p>
                  <p className="font-bold">{totalCapacity} port</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Port Kosong (Tersedia)</p>
                  <p className="font-bold text-blue-600 dark:text-blue-400">{availablePorts} port</p>
                </div>
              </div>

              <div className={`mt-2 p-3 rounded-md flex items-start gap-3 border transition-colors duration-300 ${
                isDanger 
                  ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-900 dark:text-red-400' 
                  : 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-400'
              }`}>
                {isDanger ? <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" /> : <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />}
                <div>
                  <p className="font-bold text-sm">{isDanger ? 'Bahaya (Kapasitas Kurang)' : 'Aman (Kapasitas Cukup)'}</p>
                  <p className="text-xs mt-1 leading-snug opacity-90">
                    {isDanger 
                      ? `Target penetrasi melebihi kapasitas yang ada! Anda kekurangan ${Math.abs(projectedRemaining)} port. Segera rencanakan pemasangan ODP baru di ${district}.`
                      : `Akses target pelanggan baru bisa terpenuhi langsung. Sisa port kosong di wilayah ini setelah ekspansi: ${projectedRemaining} port.`}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
