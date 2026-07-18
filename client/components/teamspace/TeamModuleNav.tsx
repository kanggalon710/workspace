/** Bar navigasi modul tim (gaya Cicle): selalu terlihat di halaman board Tugas tim,
 *  sehingga dari board bisa langsung pindah ke Ringkasan/Chat/Jadwal/Pertanyaan/
 *  Dokumen/Pengumuman tanpa jalan buntu (feedback user: "susah kembali").  */
import { useLocation } from "wouter";
import {
  ArrowLeft, LayoutDashboard, Kanban, MessageCircle, CalendarDays, MessagesSquare,
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
  /** view yang sedang aktif (di board = "tasks") */
  active: string;
}

export function TeamModuleNav({ team, active }: Props) {
  const [, navigate] = useLocation();
  const TypeIcon = team.type === "PROJECT" ? FolderKanban : UsersRound;
  const go = (v: string) => {
    if (v === "tasks") return;   // sudah di board
    navigate(v === "summary" ? `/teamspace/teams/${team.id}` : `/teamspace/teams/${team.id}?tab=${v}`);
  };
  return (
    <div className="mb-3 flex items-center gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
      <button
        type="button"
        aria-label="Kembali ke halaman tim"
        onClick={() => navigate(`/teamspace/teams/${team.id}`)}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border text-muted-foreground transition-colors hover:bg-muted"
      >
        <ArrowLeft className="size-4" />
      </button>
      <span className="inline-flex shrink-0 items-center gap-1.5 pr-1">
        <span className="flex size-6 items-center justify-center rounded-md" style={{ backgroundColor: `${team.color}1A` }} aria-hidden="true">
          <TypeIcon className="size-3.5" style={{ color: team.color }} />
        </span>
        <span className="max-w-40 truncate text-sm font-semibold">{team.name}</span>
      </span>
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
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors
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
  );
}
