/** Teamspace v5.0 — Halaman Tim: hub ber-tab (FR-305/307).
 *  Tab mengikuti enabledViews tim: Ringkasan · Tugas (board) · Chat · Jadwal ·
 *  Pertanyaan · Dokumen. Fase 2 melengkapi 4 panel terakhir. */
import { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useTeam, useTeamMutations } from "@/hooks/useTeamspace";
import { PageHeader } from "@/components/ui/page-header";
import { PageContainer, PageSection } from "@/components/ui/page-container";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AssigneePicker } from "@/components/pipelines/AssigneePicker";
import { ChatPanel } from "@/components/teamspace/ChatPanel";
import { SchedulePanel } from "@/components/teamspace/SchedulePanel";
import { CheckinPanel } from "@/components/teamspace/CheckinPanel";
import { DocsPanel } from "@/components/teamspace/DocsPanel";
import { AnnouncementsPanel } from "@/components/teamspace/AnnouncementsPanel";
import { TeamReportPanel } from "@/components/teamspace/TeamReportPanel";
import {
  UsersRound, CheckSquare, AlertTriangle, ClipboardList, Kanban, UserPlus, Shield, ShieldOff,
  UserMinus, FolderKanban, Archive, LayoutDashboard, MessageCircle, CalendarDays, MessagesSquare, FolderClosed, Megaphone,
} from "lucide-react";
import { toast } from "sonner";

type TabKey = "summary" | "chat" | "schedule" | "checkins" | "docs" | "announcements";

const TAB_META: Record<string, { label: string; icon: any }> = {
  summary: { label: "Ringkasan", icon: LayoutDashboard },
  tasks: { label: "Tugas", icon: Kanban },
  chat: { label: "Chat", icon: MessageCircle },
  schedule: { label: "Jadwal", icon: CalendarDays },
  checkins: { label: "Pertanyaan", icon: MessagesSquare },
  docs: { label: "Dokumen", icon: FolderClosed },
  announcements: { label: "Pengumuman", icon: Megaphone },
};

function initialTab(): TabKey {
  try {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && t !== "tasks" && t in TAB_META) return t as TabKey;
  } catch { /* ignore */ }
  return "summary";
}

export default function TeamPage() {
  const [, params] = useRoute("/teamspace/teams/:id");
  const teamId = params ? Number(params.id) : null;
  const [, navigate] = useLocation();

  const { data: team, isLoading, refetch, isRefetching } = useTeam(teamId);
  const m = useTeamMutations();

  const [tab, setTab] = useState<TabKey>(initialTab);
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberIds, setNewMemberIds] = useState<string[]>([]);
  const [confirmArchive, setConfirmArchive] = useState(false);

  // Sinkronkan ?tab= di URL (deep-link dari notifikasi).
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (tab === "summary") url.searchParams.delete("tab");
      else url.searchParams.set("tab", tab);
      window.history.replaceState(null, "", url.toString());
    } catch { /* ignore */ }
  }, [tab]);

  const openBoard = () => {
    if (team?.taskPipelineId) navigate(`/teamspace/boards/${team.taskPipelineId}`);
  };

  const addMembers = async () => {
    if (!team || newMemberIds.length === 0) return;
    try {
      for (const uid of newMemberIds) {
        await m.addMember.mutateAsync({ teamId: team.id, userId: Number(uid), role: "member" });
      }
      toast.success(`${newMemberIds.length} anggota ditambahkan`);
      setShowAddMember(false);
      setNewMemberIds([]);
    } catch (e: any) {
      toast.error(e?.message || "Gagal menambah anggota");
    }
  };

  const toggleRole = async (userId: number, currentRole: string) => {
    if (!team) return;
    const role = currentRole === "manager" ? "member" : "manager";
    try {
      await m.setMemberRole.mutateAsync({ teamId: team.id, userId, role });
      toast.success(role === "manager" ? "Dijadikan manager" : "Dijadikan member");
    } catch (e: any) {
      toast.error(e?.message || "Gagal mengubah role");
    }
  };

  const removeMember = async (userId: number, name: string) => {
    if (!team) return;
    try {
      await m.removeMember.mutateAsync({ teamId: team.id, userId });
      toast.success(`${name} dikeluarkan dari tim`);
    } catch (e: any) {
      toast.error(e?.message || "Gagal mengeluarkan anggota");
    }
  };

  const archiveTeam = async () => {
    if (!team) return;
    if (!confirmArchive) { setConfirmArchive(true); return; }
    try {
      await m.archiveTeam.mutateAsync({ id: team.id, archived: true });
      toast.success(`Tim "${team.name}" diarsipkan`);
      navigate("/teamspace/teams");
    } catch (e: any) {
      toast.error(e?.message || "Gagal mengarsipkan tim");
    }
  };

  if (isLoading) {
    return (
      <PageContainer>
        <div className="space-y-4">
          <div className="h-24 animate-pulse rounded-xl bg-muted" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />)}
          </div>
        </div>
      </PageContainer>
    );
  }

  if (!team) {
    return (
      <PageContainer>
        <EmptyState
          icon={UsersRound}
          title="Tim tidak ditemukan"
          description="Tim mungkin sudah diarsipkan, atau Anda bukan anggotanya."
          action={{ label: "Kembali ke Tim Saya", onClick: () => navigate("/teamspace/teams"), variant: "outline" }}
        />
      </PageContainer>
    );
  }

  const TypeIcon = team.type === "PROJECT" ? FolderKanban : UsersRound;
  const pct = team.taskSummary.total > 0 ? Math.round((team.taskSummary.done / team.taskSummary.total) * 100) : 0;
  const views = team.enabledViews.length > 0 ? team.enabledViews : ["summary", "tasks"];

  return (
    <PageContainer>
      <PageHeader
        icon={TypeIcon}
        title={team.name}
        description={team.description || (team.type === "PROJECT" ? "Proyek" : "Tim / divisi")}
        accent="violet"
        breadcrumbs={[{ label: "Tim Saya", path: "/teamspace/teams" }, { label: team.name }]}
        onRefresh={() => refetch()}
        refreshing={isRefetching}
        actions={
          team.myRole
            ? <StatusBadge variant={team.myRole === "manager" ? "info" : "neutral"} label={team.myRole === "manager" ? "Manager" : "Member"} appearance="subtle" />
            : undefined
        }
      >
        {/* Tab chips sesuai enabledViews (FR-305) */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
          {views.map((v) => {
            const meta = TAB_META[v];
            if (!meta) return null;
            const Icon = meta.icon;
            const isActive = v === tab;
            const isTasks = v === "tasks";
            const badge = v === "chat" && team.unreadChat > 0 ? team.unreadChat : null;
            return (
              <button
                key={v}
                type="button"
                onClick={() => (isTasks ? openBoard() : setTab(v as TabKey))}
                aria-current={isActive ? "page" : undefined}
                className={`relative inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors
                  ${isActive ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
              >
                <Icon className="size-3.5" /> {meta.label}
                {badge != null && (
                  <span className="ml-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-white">
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </PageHeader>

      {tab === "chat" ? (
        <ChatPanel teamId={team.id} canManage={team.canManage} active={tab === "chat"} />
      ) : tab === "schedule" ? (
        <SchedulePanel teamId={team.id} canManage={team.canManage} active={tab === "schedule"} />
      ) : tab === "checkins" ? (
        <CheckinPanel teamId={team.id} canManage={team.canManage} active={tab === "checkins"} />
      ) : tab === "docs" ? (
        <DocsPanel teamId={team.id} canManage={team.canManage} active={tab === "docs"} />
      ) : tab === "announcements" ? (
        <AnnouncementsPanel teamId={team.id} canManage={team.canManage} active={tab === "announcements"} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile icon={UsersRound} label="Anggota" value={String(team.memberCount)} accent="violet" />
            <StatTile icon={ClipboardList} label="Total Tugas" value={String(team.taskSummary.total)} accent="primary" onClick={openBoard} />
            <StatTile icon={CheckSquare} label="Selesai" value={String(team.taskSummary.done)} description={`${pct}% dari total`} accent="success" />
            <StatTile
              icon={AlertTriangle}
              label="Terlambat"
              value={String(team.taskSummary.overdue)}
              accent={team.taskSummary.overdue > 0 ? "danger" : "neutral"}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" leftIcon={<Kanban className="size-4" />} onClick={openBoard} disabled={!team.taskPipelineId}>
              Buka Board Tugas
            </Button>
          </div>

          {/* Laporan gaya Cicle: rekap status + penghambat + per-list + poin tugas */}
          <TeamReportPanel teamId={team.id} teamName={team.name} />

          <PageSection
            title="Anggota Tim"
            description="Manager dapat mengelola anggota dan pengaturan tim"
            actions={team.canManage ? (
              <Button size="sm" variant="outline-primary" leftIcon={<UserPlus className="size-4" />} onClick={() => setShowAddMember(true)}>
                Tambah Anggota
              </Button>
            ) : undefined}
          >
            {team.members.length === 0 ? (
              <EmptyState icon={UsersRound} title="Belum ada anggota" description="Tambahkan anggota dari daftar staff." size="sm" />
            ) : (
              <Card padding="none" className="divide-y overflow-hidden">
                {team.members.map((mb) => (
                  <div key={mb.userId} className="flex items-center gap-3 px-4 py-2.5">
                    <span
                      className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: team.color }}
                      aria-hidden="true"
                    >
                      {(mb.name || mb.username).slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {mb.name || mb.username}
                        {mb.isActive === 0 && <span className="ml-1.5 text-[10px] text-muted-foreground">(nonaktif)</span>}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">@{mb.username}</p>
                    </div>
                    <StatusBadge
                      variant={mb.teamRole === "manager" ? "info" : "neutral"}
                      label={mb.teamRole === "manager" ? "Manager" : "Member"}
                      size="sm"
                      appearance={mb.teamRole === "manager" ? "solid" : "subtle"}
                    />
                    {team.canManage && (
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button" variant="ghost" size="icon-sm"
                          aria-label={mb.teamRole === "manager" ? "Jadikan member" : "Jadikan manager"}
                          title={mb.teamRole === "manager" ? "Jadikan member" : "Jadikan manager"}
                          onClick={() => toggleRole(mb.userId, mb.teamRole)}
                        >
                          {mb.teamRole === "manager" ? <ShieldOff className="size-4" /> : <Shield className="size-4" />}
                        </Button>
                        <Button
                          type="button" variant="ghost" size="icon-sm"
                          className="text-destructive hover:text-destructive"
                          aria-label="Keluarkan dari tim" title="Keluarkan dari tim"
                          onClick={() => removeMember(mb.userId, mb.name || mb.username)}
                        >
                          <UserMinus className="size-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </Card>
            )}
          </PageSection>

          {team.canManage && (
            <PageSection title="Zona Arsip" description="Tim terarsip hilang dari daftar namun datanya tetap tersimpan">
              <Button
                variant={confirmArchive ? "destructive" : "outline"}
                size="sm"
                className={confirmArchive ? "" : "border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"}
                leftIcon={<Archive className="size-4" />}
                loading={m.archiveTeam.isPending}
                onClick={archiveTeam}
                onBlur={() => setConfirmArchive(false)}
              >
                {confirmArchive ? "Yakin? Arsipkan Tim" : "Arsipkan Tim"}
              </Button>
            </PageSection>
          )}
        </>
      )}

      {showAddMember && (
        <Dialog open onOpenChange={(o) => { if (!o) setShowAddMember(false); }}>
          <DialogContent className="max-w-md w-[calc(100vw-2rem)]">
            <DialogTitle>Tambah Anggota — {team.name}</DialogTitle>
            <div className="space-y-4">
              <AssigneePicker
                mode="multi"
                showSourceToggle={false}
                value={newMemberIds}
                excludeIds={team.members.map((mb) => mb.userId)}
                onChange={setNewMemberIds}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowAddMember(false)}>Batal</Button>
                <Button onClick={addMembers} loading={m.addMember.isPending} disabled={newMemberIds.length === 0}>
                  Tambahkan
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </PageContainer>
  );
}
