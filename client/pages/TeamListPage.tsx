/** Teamspace v5.0 — Tim Saya: grid tim yang diikuti + buat tim (FR-303/304 subset Fase 1). */
import { useState } from "react";
import { useLocation } from "wouter";
import { useMyTeams, useTeamMutations, TEAM_COLOR_PALETTE, type TeamSummary } from "@/hooks/useTeamspace";
import { PageHeader } from "@/components/ui/page-header";
import { PageContainer } from "@/components/ui/page-container";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AssigneePicker } from "@/components/pipelines/AssigneePicker";
import { useAuth } from "@/context/AuthContext";
import { UsersRound, Plus, CheckSquare, FolderKanban } from "lucide-react";
import { toast } from "sonner";

function TeamCard({ t, onOpen }: { t: TeamSummary; onOpen: () => void }) {
  const pct = t.taskSummary.total > 0 ? Math.round((t.taskSummary.done / t.taskSummary.total) * 100) : 0;
  return (
    <Card
      variant="elevated"
      className="cursor-pointer transition-shadow hover:shadow-elev-md"
      onClick={onOpen}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${t.color}1A` }} aria-hidden="true">
          {t.type === "PROJECT"
            ? <FolderKanban className="size-5" style={{ color: t.color }} />
            : <UsersRound className="size-5" style={{ color: t.color }} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold">{t.name}</h3>
            {t.myRole === "manager" && <StatusBadge variant="info" label="Manager" size="sm" appearance="subtle" />}
          </div>
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
            {t.description || (t.type === "PROJECT" ? "Proyek" : "Tim")} · {t.memberCount} anggota
          </p>
        </div>
      </div>
      <div className="mt-3 space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <CheckSquare className="size-3.5" /> {t.taskSummary.done}/{t.taskSummary.total} tugas selesai
          </span>
          {t.taskSummary.overdue > 0 && (
            <StatusBadge variant="danger" size="sm" appearance="subtle" label={`${t.taskSummary.overdue} terlambat`} />
          )}
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: t.color }} />
        </div>
      </div>
    </Card>
  );
}

export default function TeamListPage() {
  const [, navigate] = useLocation();
  const { canWrite, user } = useAuth();
  const canCreate = Boolean(user?.isSystemAdmin) || canWrite("teams");

  const [showAll, setShowAll] = useState(false);
  const { data: teamsData, isLoading, refetch, isRefetching } = useMyTeams({ all: showAll });
  const { createTeam } = useTeamMutations();

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [type, setType] = useState<"TEAM" | "PROJECT">("TEAM");
  const [color, setColor] = useState(TEAM_COLOR_PALETTE[0]);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [managerIds, setManagerIds] = useState<string[]>([]);

  const resetCreate = () => { setName(""); setDesc(""); setType("TEAM"); setColor(TEAM_COLOR_PALETTE[0]); setMemberIds([]); setManagerIds([]); };

  const onCreate = async () => {
    if (!name.trim()) return;
    try {
      const t: any = await createTeam.mutateAsync({
        name: name.trim(),
        description: desc.trim() || undefined,
        type, color,
        memberIds: memberIds.map(Number),
        managerIds: managerIds.map(Number),
      });
      toast.success(`Tim "${name.trim()}" dibuat`);
      setShowCreate(false);
      resetCreate();
      if (t?.id) navigate(`/teamspace/teams/${t.id}`);
    } catch (e: any) {
      toast.error(e?.message || "Gagal membuat tim");
    }
  };

  return (
    <PageContainer>
      <PageHeader
        icon={UsersRound}
        title="Tim Saya"
        description="Ruang kerja kolaborasi per tim/divisi — board tugas, anggota, dan progres"
        accent="violet"
        onRefresh={() => refetch()}
        refreshing={isRefetching}
        actions={
          <div className="flex items-center gap-2">
            {canCreate && (
              <Button size="sm" leftIcon={<Plus className="size-4" />} onClick={() => setShowCreate(true)}>
                Buat Tim
              </Button>
            )}
          </div>
        }
      >
        {canCreate && (
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setShowAll(false)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${!showAll ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
            >
              Tim saya
            </button>
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${showAll ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
            >
              Semua tim
            </button>
          </div>
        )}
      </PageHeader>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-36 animate-pulse rounded-xl bg-muted" />)}
        </div>
      ) : !teamsData || teamsData.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title={showAll ? "Belum ada tim dibuat" : "Anda belum tergabung di tim mana pun"}
          description={canCreate
            ? "Buat tim pertama untuk divisi Anda — board tugas 4 list (To Do List, Dikerjakan, Selesai, Batal) langsung siap dipakai."
            : "Minta manager atau admin menambahkan Anda ke sebuah tim."}
          action={canCreate ? { label: "Buat Tim", onClick: () => setShowCreate(true) } : undefined}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {teamsData.map((t) => (
            <TeamCard key={t.id} t={t} onOpen={() => navigate(`/teamspace/teams/${t.id}`)} />
          ))}
        </div>
      )}

      {showCreate && (
        <Dialog open onOpenChange={(o) => { if (!o) setShowCreate(false); }}>
          <DialogContent className="max-w-lg w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
            <DialogTitle>Buat Tim Baru</DialogTitle>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium" htmlFor="team-name">Nama tim <span className="text-destructive">*</span></label>
                <Input id="team-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="cth: NOC, Marketing, Finance" autoFocus />
              </div>
              <div>
                <span className="mb-1 block text-xs font-medium">Tipe</span>
                <div className="flex gap-1.5">
                  {(["TEAM", "PROJECT"] as const).map((tp) => (
                    <button
                      key={tp}
                      type="button"
                      onClick={() => setType(tp)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${type === tp ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
                    >
                      {tp === "TEAM" ? "Tim / Divisi" : "Proyek"}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="mb-1 block text-xs font-medium">Warna</span>
                <div className="flex flex-wrap gap-1.5">
                  {TEAM_COLOR_PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`Warna ${c}`}
                      onClick={() => setColor(c)}
                      className={`size-7 rounded-full transition-transform ${color === c ? "ring-2 ring-offset-2 ring-primary scale-110" : "hover:scale-105"}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium" htmlFor="team-desc">Deskripsi (opsional)</label>
                <Textarea id="team-desc" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Fokus kerja tim ini…" rows={2} />
              </div>
              <div>
                <span className="mb-1 block text-xs font-medium">Anggota</span>
                <AssigneePicker mode="multi" showSourceToggle={false} value={memberIds} onChange={setMemberIds} />
              </div>
              <div>
                <span className="mb-1 block text-xs font-medium">Manager tim</span>
                <AssigneePicker mode="multi" showSourceToggle={false} value={managerIds} onChange={setManagerIds} />
                <p className="mt-1 text-[10px] text-muted-foreground">Anda otomatis menjadi manager. Manager dapat mengelola anggota, list, dan pengaturan tim.</p>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setShowCreate(false)}>Batal</Button>
                <Button onClick={onCreate} loading={createTeam.isPending} disabled={!name.trim()}>
                  Buat Tim
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </PageContainer>
  );
}
