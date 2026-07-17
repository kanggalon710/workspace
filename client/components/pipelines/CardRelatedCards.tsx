import { Link2, ArrowUpRight } from "lucide-react";
import { useRelatedCards } from "@/hooks/usePipelines";
import { relationTypeLabel } from "@shared/cardIdentity";

export function CardRelatedCards({ cardId }: { cardId: number }): JSX.Element | null {
  const { data: items = [], isLoading } = useRelatedCards(cardId);
  if (isLoading || items.length === 0) return null; // hidden until siblings exist (SP3 creates them)
  return (
    <section>
      <h4 className="mb-2 text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
        <Link2 className="size-3.5" /> Kartu Terkait
      </h4>
      <div className="space-y-1.5">
        {items.map((r) => (
          <a key={r.id} href={`/pipelines/${r.pipelineId}?card=${r.id}`}
            className="flex items-center gap-2 rounded-md border border-border/40 px-2.5 py-1.5 hover:bg-muted/40">
            {r.relationType && (
              <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-2xs font-medium text-primary">
                {relationTypeLabel(r.relationType)}
              </span>
            )}
            <span className="flex-1 min-w-0 truncate text-xs">{r.title}</span>
            <span className="shrink-0 text-2xs text-muted-foreground">{r.pipelineName} · {r.stageLabel}</span>
            <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" />
          </a>
        ))}
      </div>
    </section>
  );
}
