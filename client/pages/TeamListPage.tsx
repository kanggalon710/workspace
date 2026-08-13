/** Teamspace v5.0 - Tim Saya: grid tim yang diikuti + buat tim (FR-303/304 subset Fase 1). */
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
import { Combobox } from "@/components/ui/combobox";
import { AssigneePicker } from "@/components/pipelines/AssigneePicker";
import { IconPicker, resolvePipelineIcon } from "@/components/pipelines/pipelineIcon";
import { useAuth } from "@/context/AuthContext";
import { UsersRound, Plus, CheckSquare, FolderKanban, Pencil, Palette } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";

/** Latar kartu tim dari warna hex: gradient lembut beralfa supaya tetap terbaca di light & dark.
 *  Mengembalikan style kosong bila warna tidak valid (kartu default). */
function cardBgStyle(hex: string | null | undefined): React.CSSProperties {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return {};
  return {
    background: `linear-gradient(135deg, ${hex}2E 0%, ${hex}12 100%)`,
    borderColor: `${hex}55`,
  };
}

/** Ikon tim: pakai ikon tersimpan bila ada, jika tidak fallback ke default per-tipe. */
function teamIcon(icon: string | null | undefined, type: string): LucideIcon {
  if (icon) return resolvePipelineIcon(icon);
  return type === "PROJECT" ? FolderKanban : UsersRound;
}

/** Baris pemilih warna aksen (ikon + progress). */
function AccentColorRow({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {TEAM_COLOR_PALETTE.map((c) => (
        <button
          key={c} type="button" aria-label={`Warna ${c}`} onClick={() => onChange(c)}
          className={`size-7 rounded-full transition-transform ${value === c ? "scale-110 ring-2 ring-primary ring-offset-2" : "hover:scale-105"}`}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}

/** Baris pemilih warna latar kartu (null = kartu default tanpa warna). */
function CardBgRow({ value, onChange }: { value: string | null; onChange: (c: string | null) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button" aria-label="Tanpa latar" onClick={() => onChange(null)}
        className={`flex size-7 items-center justify-center rounded-full border bg-background text-xs font-semibold text-muted-foreground transition-transform ${value == null ? "scale-110 ring-2 ring-primary ring-offset-2" : "hover:scale-105"}`}
        title="Tanpa latar (default)"
      >
        &times;
      </button>
      {TEAM_COLOR_PALETTE.map((c) => (
        <button
          key={c} type="button" aria-label={`Latar ${c}`} onClick={() => onChange(c)}
          className={`size-7 rounded-full border transition-transform ${value === c ? "scale-110 ring-2 ring-primary ring-offset-2" : "hover:scale-105"}`}
          style={{ background: `linear-gradient(135deg, ${c}2E, ${c}12)`, borderColor: `${c}55` }}
        />
      ))}
    </div>
  );
}

function TeamCard({ t, parentName, canManage, onOpen, onEdit }: {
  t: TeamSummary;
  parentName?: string | null;
  canManage: boolean;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const pct = t.taskSummary.total > 0 ? Math.round((t.taskSummary.done / t.taskSummary.total) * 100) : 0;
  const Icon = teamIcon(t.icon, t.type);
  return (
    <Card
      variant="elevated"
      className="group relative flex cursor-pointer flex-col overflow-hidden p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-elev-lg"
      style={cardBgStyle(t.cardBgColor)}
      onClick={onOpen}
    >
      {/* Aksen warna tim di sisi kiri kartu */}
      <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: t.color }} aria-hidden="true" />

      {/* Edit tim (manager/admin) - stopPropagation supaya tak membuka tim */}
      {canManage && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="absolute right-3 top-3 z-10 flex size-8 items-center justify-center rounded-lg border border-border/60 bg-background/70 text-muted-foreground opacity-100 backdrop-blur transition-all hover:border-primary/40 hover:bg-background hover:text-primary sm:opacity-0 sm:group-hover:opacity-100"
          aria-label={`Edit tim ${t.name}`}
          title="Edit tim"
        >
          <Pencil className="size-3.5" />
        </button>
      )}

      {/* FR-302 nested: penanda sub-tim */}
      {parentName && (
        <p className="mb-2 truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">↳ Sub-tim dari <b className="font-semibold">{parentName}</b></p>
      )}

      <div className="flex items-start gap-3.5">
        <span
          className="flex size-12 shrink-0 items-center justify-center rounded-2xl shadow-sm ring-1 ring-inset ring-white/10"
          style={{ backgroundColor: `${t.color}1F`, color: t.color }}
          aria-hidden="true"
        >
          <Icon className="size-6" />
        </span>
        <div className="min-w-0 flex-1 pr-8">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="truncate text-[15px] font-bold tracking-tight-display">{t.name}</h3>
            {t.myRole === "manager" && <StatusBadge variant="info" label="Manager" size="sm" appearance="subtle" />}
            {t.unreadChat > 0 && (
              <span className="inline-flex min-w-4 shrink-0 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-white" title={`${t.unreadChat} pesan chat belum dibaca`}>
                {t.unreadChat > 99 ? "99+" : t.unreadChat}
              </span>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {t.description || (t.type === "PROJECT" ? "Proyek" : "Tim / Divisi")}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
        <span className="inline-flex items-center gap-1 rounded-full bg-muted/70 px-2 py-0.5">
          <UsersRound className="size-3" /> {t.memberCount} anggota
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-muted/70 px-2 py-0.5">
          <CheckSquare className="size-3" /> {t.taskSummary.done}/{t.taskSummary.total} tugas
        </span>
        {t.taskSummary.overdue > 0 && (
          <StatusBadge variant="danger" size="sm" appearance="subtle" label={`${t.taskSummary.overdue} telat`} />
        )}
      </div>

      <div className="mt-3 space-y-1.5">
        <div className="flex items-center justify-between text-[10px] font-semibold tabular-nums">
          <span className="text-muted-foreground">Progres tugas</span>
          <span style={{ color: t.color }}>{pct}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: t.color }} />
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

  const canManageTeam = (t: TeamSummary) => t.myRole === "manager" || Boolean(user?.isSystemAdmin) || canWrite("teams");

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [type, setType] = useState<"TEAM" | "PROJECT">("TEAM");
  const [color, setColor] = useState(TEAM_COLOR_PALETTE[0]);
  const [icon, setIcon] = useState<string>("");
  const [cardBg, setCardBg] = useState<string | null>(null);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [managerIds, setManagerIds] = useState<string[]>([]);
  const [parentId, setParentId] = useState<string>("");   // FR-302: tim induk (opsional)

  const [editTeam, setEditTeam] = useState<TeamSummary | null>(null);

  const resetCreate = () => { setName(""); setDesc(""); setType("TEAM"); setColor(TEAM_COLOR_PALETTE[0]); setIcon(""); setCardBg(null); setMemberIds([]); setManagerIds([]); setParentId(""); };

  // FR-302: urutkan hierarki - root diikuti sub-timnya (depth-first); yatim (induk tak
  // terlihat, mis. bukan anggota induknya) tampil sebagai root.
  const ordered = (() => {
    const list = teamsData ?? [];
    const byParent = new Map<number | null, TeamSummary[]>();
    const ids = new Set(list.map((t) => t.id));
    for (const t of list) {
      const key = t.parentId != null && ids.has(t.parentId) ? t.parentId : null;
      const arr = byParent.get(key) ?? [];
      arr.push(t);
      byParent.set(key, arr);
    }
    const nameById = new Map(list.map((t) => [t.id, t.name]));
    const out: Array<{ t: TeamSummary; parentName: string | null }> = [];
    const walk = (parent: number | null) => {
      for (const t of byParent.get(parent) ?? []) {
        out.push({ t, parentName: parent != null ? (nameById.get(parent) ?? null) : null });
        walk(t.id);
      }
    };
    walk(null);
    return out;
  })();

  const onCreate = async () => {
    if (!name.trim()) return;
    try {
      const t: any = await createTeam.mutateAsync({
        name: name.trim(),
        description: desc.trim() || undefined,
        type, color,
        icon: icon || undefined,
        cardBgColor: cardBg,
        memberIds: memberIds.map(Number),
        managerIds: managerIds.map(Number),
        parentId: parentId ? Number(parentId) : null,
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
        description="Ruang kerja kolaborasi per tim/divisi - board tugas, anggota, dan progres"
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
            ? "Buat tim pertama untuk divisi Anda - board tugas 4 list (To Do List, Dikerjakan, Selesai, Batal) langsung siap dipakai."
            : "Minta manager atau admin menambahkan Anda ke sebuah tim."}
          action={canCreate ? { label: "Buat Tim", onClick: () => setShowCreate(true) } : undefined}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ordered.map(({ t, parentName }) => (
            <TeamCard
              key={t.id}
              t={t}
              parentName={parentName}
              canManage={canManageTeam(t)}
              onOpen={() => navigate(`/teamspace/teams/${t.id}`)}
              onEdit={() => setEditTeam(t)}
            />
          ))}
        </div>
      )}

      {editTeam && (
        <EditTeamDialog team={editTeam} onClose={() => setEditTeam(null)} />
      )}

      {showCreate && (
        <Dialog open onOpenChange={(o) => { if (!o) setShowCreate(false); }}>
          <DialogContent className="max-w-lg dialog-w max-h-[90vh] overflow-y-auto">
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
                <span className="mb-1 block text-xs font-medium">Warna aksen</span>
                <AccentColorRow value={color} onChange={setColor} />
              </div>
              <div>
                <span className="mb-1.5 block text-xs font-medium">Ikon</span>
                <IconPicker value={icon} onChange={setIcon} color={color} />
              </div>
              <div>
                <span className="mb-1 flex items-center gap-1.5 text-xs font-medium"><Palette className="size-3.5" /> Warna latar kartu</span>
                <CardBgRow value={cardBg} onChange={setCardBg} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium" htmlFor="team-desc">Deskripsi (opsional)</label>
                <Textarea id="team-desc" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Fokus kerja tim ini…" rows={2} />
              </div>
              <div>
                <span className="mb-1 block text-xs font-medium">Tim induk (opsional)</span>
                <Combobox
                  placeholder="Tanpa induk (root)"
                  options={(teamsData ?? []).map((t) => ({ value: String(t.id), label: t.name }))}
                  value={parentId}
                  onChange={(v) => setParentId(v ?? "")}
                />
                <p className="mt-1 text-[10px] text-muted-foreground">Untuk struktur bertingkat: Divisi → Tim → Proyek (FR-302).</p>
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

/** Dialog edit tim: nama, deskripsi, warna aksen, ikon, dan warna latar kartu. */
function EditTeamDialog({ team, onClose }: { team: TeamSummary; onClose: () => void }) {
  const { updateTeam } = useTeamMutations();
  const [name, setName] = useState(team.name);
  const [desc, setDesc] = useState(team.description ?? "");
  const [color, setColor] = useState(team.color || TEAM_COLOR_PALETTE[0]);
  const [icon, setIcon] = useState(team.icon ?? "");
  const [cardBg, setCardBg] = useState<string | null>(team.cardBgColor ?? null);

  const PreviewIcon = teamIcon(icon || null, team.type);

  const onSave = async () => {
    if (!name.trim()) return;
    try {
      await updateTeam.mutateAsync({
        id: team.id,
        name: name.trim(),
        description: desc.trim() || null,
        color,
        icon: icon || null,
        cardBgColor: cardBg,
      });
      toast.success("Tim diperbarui");
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Gagal memperbarui tim");
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg dialog-w max-h-[90vh] overflow-y-auto">
        <DialogTitle>Edit Tim</DialogTitle>
        <div className="space-y-4">
          {/* Pratinjau kartu langsung */}
          <div className="rounded-lg border p-4" style={cardBgStyle(cardBg)}>
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl shadow-sm ring-1 ring-inset ring-white/10" style={{ backgroundColor: `${color}1F`, color }}>
                <PreviewIcon className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold tracking-tight-display">{name || "Nama tim"}</p>
                <p className="line-clamp-1 text-xs text-muted-foreground">{desc || (team.type === "PROJECT" ? "Proyek" : "Tim / Divisi")}</p>
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium" htmlFor="edit-team-name">Nama tim <span className="text-destructive">*</span></label>
            <Input id="edit-team-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium" htmlFor="edit-team-desc">Deskripsi</label>
            <Textarea id="edit-team-desc" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Fokus kerja tim ini…" rows={2} />
          </div>
          <div>
            <span className="mb-1 block text-xs font-medium">Warna aksen</span>
            <AccentColorRow value={color} onChange={setColor} />
          </div>
          <div>
            <span className="mb-1.5 block text-xs font-medium">Ikon</span>
            <IconPicker value={icon} onChange={setIcon} color={color} />
          </div>
          <div>
            <span className="mb-1 flex items-center gap-1.5 text-xs font-medium"><Palette className="size-3.5" /> Warna latar kartu</span>
            <CardBgRow value={cardBg} onChange={setCardBg} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Batal</Button>
            <Button onClick={onSave} loading={updateTeam.isPending} disabled={!name.trim()}>
              Simpan
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
