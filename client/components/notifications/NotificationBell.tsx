import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatRelative as fmtRelative } from "@/lib/dateFormat";
import {
  Bell, BellOff, Check, CheckCheck, X, Loader2,
  Ticket as TicketIcon, Users, Megaphone, Bug, MessageCircle, AlertTriangle,
} from "lucide-react";

interface Notification {
  id: number;
  type: string;
  title: string;
  message?: string | null;
  link?: string | null;
  entityType?: string | null;
  entityId?: number | null;
  readAt?: string | null;
  createdAt: string;
}

/** Fixed top-right bell with dropdown. Polls unread count every 30s. */
export default function NotificationBell() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const { data: countData } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    queryFn: () => api.get<{ count: number }>("/notifications/unread-count"),
    enabled: !!user,
    refetchInterval: 30_000,
  });
  const unreadCount = countData?.count ?? 0;

  const { data: notifs = [], isLoading } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    queryFn: () => api.get<Notification[]>("/notifications?limit=30"),
    enabled: !!user && open,
  });

  const markReadMut = useMutation({
    mutationFn: (id: number) => api.post(`/notifications/${id}/read`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/notifications"] });
      qc.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const markAllMut = useMutation({
    mutationFn: () => api.post("/notifications/read-all", {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/notifications"] });
      qc.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/notifications/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/notifications"] });
      qc.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!user) return null;

  const handleNotifClick = (n: Notification) => {
    if (!n.readAt) markReadMut.mutate(n.id);
    if (n.link) {
      setLocation(n.link);
      setOpen(false);
    }
  };

  return (
    <div ref={dropdownRef} className="relative">
      {/* Bell button - inline within TopBar */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative h-9 w-9 rounded-md hover:bg-accent flex items-center justify-center transition-colors"
        aria-label={`Notifikasi${unreadCount > 0 ? ` (${unreadCount} belum dibaca)` : ""}`}
        aria-expanded={open}
      >
        <Bell
          className={`h-[18px] w-[18px] transition-colors ${
            unreadCount > 0 ? "text-primary" : "text-muted-foreground"
          }`}
          strokeWidth={unreadCount > 0 ? 2.25 : 2}
        />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-destructive text-white text-[10px] font-bold leading-none tabular-nums ring-2 ring-background">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute top-full right-0 mt-2 z-50 w-[calc(100vw-2rem)] max-w-sm bg-popover border border-border rounded-xl shadow-elev-lg overflow-hidden animate-pop-in"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              <h3 className="font-semibold text-sm">Notifikasi</h3>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 bg-rose-500 text-white text-[10px] font-bold rounded-full leading-none">
                  {unreadCount} baru
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllMut.mutate()}
                  disabled={markAllMut.isPending}
                  className="p-1.5 rounded-md hover:bg-muted text-xs text-muted-foreground inline-flex items-center gap-1"
                  title="Tandai semua sudah dibaca"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">Semua dibaca</span>
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-md hover:bg-muted"
                aria-label="Tutup"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[70vh] md:max-h-[480px] overflow-y-auto">
            {isLoading ? (
              <div className="py-12 text-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto" />
              </div>
            ) : notifs.length === 0 ? (
              <div className="py-12 text-center">
                <BellOff className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm font-medium">Tidak ada notifikasi</p>
                <p className="text-xs text-muted-foreground mt-1">Kami akan kirim notifikasi kalau ada tugas baru</p>
              </div>
            ) : (
              <ul className="divide-y">
                {notifs.map((n) => (
                  <NotificationItem
                    key={n.id}
                    n={n}
                    onClick={() => handleNotifClick(n)}
                    onMarkRead={() => markReadMut.mutate(n.id)}
                    onDelete={() => deleteMut.mutate(n.id)}
                  />
                ))}
              </ul>
            )}
          </div>

          {notifs.length > 0 && (
            <div className="px-4 py-2 border-t bg-muted/20 text-center">
              <button
                onClick={() => { setLocation("/notifications"); setOpen(false); }}
                className="text-xs text-sky-600 dark:text-sky-400 hover:underline"
              >
                Lihat semua notifikasi
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NotificationItem({ n, onClick, onMarkRead, onDelete }: any) {
  const isUnread = !n.readAt;
  const icon = getIconForType(n.type);
  return (
    <li
      className={`px-4 py-3 hover:bg-muted/50 cursor-pointer transition-colors group relative ${
        isUnread ? "bg-sky-50/50 dark:bg-sky-950/20" : ""
      }`}
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${icon.bg}`}>
          <icon.Icon className={`h-4 w-4 ${icon.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h4 className={`text-sm leading-tight ${isUnread ? "font-semibold" : ""}`}>{n.title}</h4>
            {isUnread && <div className="w-2 h-2 rounded-full bg-sky-500 mt-1 shrink-0" />}
          </div>
          {n.message && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>}
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[10px] text-muted-foreground">{fmtRelative(n.createdAt)}</span>
          </div>
        </div>
      </div>

      {/* Actions - hover */}
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
        {isUnread && (
          <button
            onClick={(e) => { e.stopPropagation(); onMarkRead(); }}
            className="p-1 rounded hover:bg-background shadow-sm"
            title="Tandai dibaca"
          >
            <Check className="h-3 w-3" />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1 rounded hover:bg-background shadow-sm text-rose-500"
          title="Hapus"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </li>
  );
}

function getIconForType(type: string): { Icon: any; color: string; bg: string } {
  switch (type) {
    case "ticket_assigned":
      return { Icon: TicketIcon, color: "text-sky-600 dark:text-sky-400", bg: "bg-sky-100 dark:bg-sky-950/40" };
    case "lead_assigned":
      return { Icon: Users, color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-100 dark:bg-violet-950/40" };
    case "collection_assigned":
      return { Icon: AlertTriangle, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-950/40" };
    case "announcement":
      return { Icon: Megaphone, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-950/40" };
    case "bug_report":
    case "bug_update":
    case "bug_assigned":
      return { Icon: Bug, color: "text-rose-600 dark:text-rose-400", bg: "bg-rose-100 dark:bg-rose-950/40" };
    case "bug_comment":
    case "mention":
      return { Icon: MessageCircle, color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-100 dark:bg-indigo-950/40" };
    default:
      return { Icon: Bell, color: "text-slate-600 dark:text-slate-400", bg: "bg-slate-100 dark:bg-slate-900" };
  }
}

// v4.2.18 (P1.1): fmtRelative now imported from @/lib/dateFormat (guaranteed safe - no "Invalid Date")
