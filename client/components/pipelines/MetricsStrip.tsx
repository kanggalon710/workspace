import { useState } from "react";
import { Settings2, Plus } from "lucide-react";
import { StatTile } from "@/components/ui/stat-tile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { usePipelineMetrics, type MetricTimeCtx } from "@/hooks/usePipelines";
import { TIME_PRESETS } from "@shared/metricTimeWindow";
import { METRIC_ICON_MAP } from "./metricIcons";

export function MetricsStrip({ pipelineId, canManage, onManage }: { pipelineId: number; canManage: boolean; onManage: () => void }) {
  const [preset, setPreset] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const ctx: MetricTimeCtx | null = preset === "all" ? null : { preset, from, to };
  const { data: metrics } = usePipelineMetrics(pipelineId, ctx);
  const list = metrics ?? [];

  if (list.length === 0) {
    if (!canManage) return null;
    return (
      <div className="px-4 md:px-6 pt-2">
        <Button variant="outline" size="sm" onClick={onManage}><Plus className="size-3.5 mr-1" /> Tambah metrik</Button>
      </div>
    );
  }

  return (
    <section aria-label="Metrik pipeline" className="px-4 md:px-6 pt-2 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Combobox
          size="sm"
          className="w-36"
          options={TIME_PRESETS.map((p) => ({ value: p.preset, label: p.label }))}
          value={preset}
          onChange={(v) => setPreset(v || "all")}
          clearable={false}
        />
        {preset === "custom" && (
          <>
            <Input inputSize="sm" type="date" aria-label="Dari tanggal" className="w-36" value={from} onChange={(e) => setFrom(e.target.value)} />
            <Input inputSize="sm" type="date" aria-label="Sampai tanggal" className="w-36" value={to} onChange={(e) => setTo(e.target.value)} />
          </>
        )}
        {canManage && (
          <Button variant="ghost" size="icon-sm" aria-label="Kelola metrik" className="ml-auto" onClick={onManage}><Settings2 className="size-4" /></Button>
        )}
      </div>
      {/* Mobile: satu baris horizontal-scroll (pattern filter-pills) supaya banyak metrik
          tidak memenuhi layar dan mendorong board ke bawah fold; ≥sm: grid seperti semula. */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1 snap-x sm:mx-0 sm:px-0 sm:pb-0 sm:grid sm:grid-cols-3 lg:grid-cols-4 sm:overflow-visible">
        {list.map((mtr) => (
          <div key={mtr.id} className="w-44 shrink-0 snap-start sm:w-auto sm:shrink">
            <StatTile icon={METRIC_ICON_MAP[mtr.icon ?? ""] ?? undefined} label={mtr.name} value={mtr.formatted} description={mtr.description ?? undefined} accent={(mtr.color as any) ?? "primary"} />
          </div>
        ))}
      </div>
    </section>
  );
}
