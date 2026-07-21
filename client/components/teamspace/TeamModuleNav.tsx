/** Navigasi modul tim gaya Cicle (v5.1 - feedback user):
 *  baris 1: breadcrumb "Tim Saya › <nama tim>" (tanpa blok judul besar duplikat),
 *  baris 2: tab bar underline tipis dengan ikon STATIS (hanya warna/garis bawah
 *  yang berubah saat aktif) + slot aksi di kanan. Dipakai di halaman tim DAN
 *  board Tugas supaya identik di mana pun. */
import type { ReactNode } from "react";
import { useLocation } from "wouter";
import {
  ChevronRight, LayoutDashboard, Kanban, MessageCircle, CalendarDays, MessagesSquare,
  FolderClosed, Megaphone, UsersRound, FolderKanban,
} from "lucide-react";

const VIEW_META: Record<string, { label: string; icon: any }> = {
  summary: { label: "Ringkasan", icon: LayoutDashboard },
  tasks: { label: "Tugas", icon: Kanban },
  chat: { label: "Chat", icon: MessageCircle },
  schedule: { label: "Jadwal", icon: CalendarDays },
  checkins: { label: "Pertanyaan", icon: MessagesSquare },
  docs: { label: "Dokumen", icon: FolderClosed },
  announcements: { label: "Pengumuman", icon: Megaphone },
};

interface Props {
  team: { id: number; name: string; color: string; type?: string; enabledViews: string[]; unreadChat?: number };
  /** view yang sedang aktif ("summary" | "tasks" | …) */
  active: string;
  /** handler pilih tab - bila absen, default navigasi URL (dipakai board) */
  onSelect?: (v: string) => void;
  /** aksi di ujung kanan tab bar (mis. Pilih + menu board, badge role) */
  trailing?: ReactNode;
}

export function TeamModuleNav({ team, active, onSelect, trailing }: Props) {
  const [, navigate] = useLocation();
  const TypeIcon = team.type === "PROJECT" ? FolderKanban : UsersRound;
  const go = (v: string) => {
    if (v === active) return;
    if (onSelect) return onSelect(v);
    navigate(v === "summary" ? `/teamspace/teams/${team.id}` : `/teamspace/teams/${team.id}?tab=${v}`);
  };
  return (
    <div className="mb-3">
      {/* Breadcrumb - pengganti judul besar (nama tim cukup tampil sekali di sini) */}
      <div className="flex items-center gap-1.5 pt-1 text-sm">
        <button type="button" onClick={() => navigate("/teamspace/teams")} className="text-muted-foreground transition-colors hover:text-foreground">
          Tim Saya
        </button>
        <ChevronRight className="size-3.5 text-muted-foreground/60" aria-hidden="true" />
        <span className="flex size-5 items-center justify-center rounded" style={{ backgroundColor: `${team.color}1A` }} aria-hidden="true">
          <TypeIcon className="size-3" style={{ color: team.color }} />
        </span>
        <span className="max-w-56 truncate font-semibold">{team.name}</span>
      </div>

      {/* Tab bar underline - ikon statis, hanya warna + garis bawah yang berubah */}
      <div className="mt-1.5 flex items-center border-b">
        <nav aria-label="Modul tim" className="-mb-px flex flex-1 items-center overflow-x-auto no-scrollbar">
          {team.enabledViews.map((v) => {
            const meta = VIEW_META[v];
            if (!meta) return null;
            const Icon = meta.icon;
            const isActive = v === active;
            const badge = v === "chat" && (team.unreadChat ?? 0) > 0 ? team.unreadChat! : null;
            return (
              <button
                key={v}
                type="button"
                onClick={() => go(v)}
                aria-current={isActive ? "page" : undefined}
                className={`inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors
                  ${isActive ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                <Icon className="size-4" aria-hidden="true" /> {meta.label}
                {badge != null && (
                  <span className="ml-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-white">
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        {trailing && <div className="ml-2 flex shrink-0 items-center gap-1 pb-1">{trailing}</div>}
      </div>
    </div>
  );
}
