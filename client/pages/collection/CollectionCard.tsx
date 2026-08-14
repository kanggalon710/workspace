import { COLLECTION_ISSUE_LABELS, type CollectionIssueType, type Collection } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ChevronRight, Clock, Calendar } from "lucide-react";
import { useStages, fmtRp, fmtDate, daysSince, type CollectionStage, type CollectionWithCustomer } from "./shared";

export function CollectionCard({ c, onClick }: { c: CollectionWithCustomer; onClick: () => void; userById: Map<number, any> }) {
  const { color: stageColor } = useStages();
  const ageDays = daysSince(c.openedAt);
  const stage = (c.stage ?? "new") as CollectionStage;
  const assignees = c.assignees ?? [];
  const isUrgent = ageDays > 30;
  // Avatar stack: max 3 visible + "+N" overflow
  const VISIBLE = 3;
  const visibleAssignees = assignees.slice(0, VISIBLE);
  const overflowCount = Math.max(0, assignees.length - VISIBLE);

  return (
    /* Collection card (dipakai di kanban column DAN list view) */
    <Card data-section="collection-card" data-collection-id={c.id} data-stage={stage} onClick={onClick} className="cursor-pointer hover:shadow-md transition-shadow">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm truncate">{c.customerName}</div>
            <div className="text-[10px] text-muted-foreground truncate">
              {c.customerIdDisplay} {c.pppoeUsername ? `• ${c.pppoeUsername}` : ""}
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </div>

        <div className="flex items-center justify-between text-xs">
          <div className="font-semibold" style={{ color: stageColor(stage) }}>
            {fmtRp(c.openedAmount)}
          </div>
          <Badge variant="secondary" className={`text-[10px] ${isUrgent ? "bg-destructive/15 text-destructive" : ""}`}>
            <Clock className="h-3 w-3 mr-1" /> {ageDays}h
          </Badge>
        </div>

        {c.issueType && (
          <Badge variant="secondary" className="text-[10px] bg-destructive/15 text-destructive w-full justify-start">
            <AlertTriangle className="h-3 w-3 mr-1" /> {COLLECTION_ISSUE_LABELS[c.issueType as CollectionIssueType] ?? c.issueType}
          </Badge>
        )}

        {c.promiseDate && (
          <Badge variant="secondary" className="text-[10px] bg-warning/15 text-warning w-full justify-start">
            <Calendar className="h-3 w-3 mr-1" /> Janji: {fmtDate(c.promiseDate)}
          </Badge>
        )}

        {/* Overdue: dihitung server (lewat janji bayar / SLA stage). */}
        {c.overdue && (
          <Badge variant="secondary" className="text-[10px] bg-destructive text-white w-full justify-start">
            <AlertTriangle className="h-3 w-3 mr-1" /> Overdue{c.overdueReason === "sla" ? " (SLA)" : c.promiseDate ? ` — ${fmtDate(c.promiseDate)}` : ""}
          </Badge>
        )}

        {assignees.length > 0 && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground" title={assignees.map(a => a.userName).join(", ")}>
            <div className="flex -space-x-1.5">
              {visibleAssignees.map((a) => (
                <div key={a.userId}
                     className="h-5 w-5 rounded-full bg-gradient-to-br from-sky-500 to-blue-700 text-white flex items-center justify-center text-[9px] font-bold ring-2 ring-background">
                  {(a.userName || a.username || "?").charAt(0).toUpperCase()}
                </div>
              ))}
              {overflowCount > 0 && (
                <div className="h-5 w-5 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-[9px] font-semibold ring-2 ring-background">
                  +{overflowCount}
                </div>
              )}
            </div>
            <span className="truncate">{assignees.length === 1 ? assignees[0].userName : `${assignees.length} ditugaskan`}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

