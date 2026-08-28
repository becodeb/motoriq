import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { useNavigate } from "react-router";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api } from "@/lib/api";
import { relative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Notification } from "@/types/api";

const TYPE_EMOJI: Record<string, string> = {
  lead_nuevo: "🆕",
  seguimiento_vencido: "⏰",
  seguimiento_hoy: "🕑",
  lead_caliente: "🔥",
  sin_respuesta: "👻",
  match_nuevo: "🎯",
  oportunidad_stock: "💰",
  tarea_vencida: "📌",
  sistema: "🔔",
};

export function notificationTarget(notification: Notification): string | null {
  if (notification.entity_type === "customer" && notification.entity_id)
    return `/clientes/${notification.entity_id}`;
  if (notification.entity_type === "vehicle" && notification.entity_id)
    return `/vehiculos/${notification.entity_id}`;
  if (notification.entity_type === "task") return "/tareas";
  return null;
}

export function useUnreadCount() {
  return useQuery({
    queryKey: ["notifications-unread"],
    queryFn: () => api.get<{ count: number }>("/notifications/unread-count"),
    refetchInterval: 30_000,
    meta: { silent: true },
  });
}

export function NotificationsBell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const unread = useUnreadCount();
  const list = useQuery({
    queryKey: ["notifications", "recent"],
    queryFn: () => api.get<Notification[]>("/notifications", { limit: 12 }),
    refetchInterval: 60_000,
    meta: { silent: true },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    void queryClient.invalidateQueries({ queryKey: ["notifications-unread"] });
  };

  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: invalidate,
  });
  const markAll = useMutation({
    mutationFn: () => api.post("/notifications/read-all"),
    onSuccess: invalidate,
  });

  const count = unread.data?.count ?? 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="relative" aria-label={`Notificaciones (${count} sin leer)`}>
          <Bell />
          {count > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-pops px-1 text-[10px] font-bold leading-4 text-pops-foreground nums">
              {count > 99 ? "99+" : count}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 max-w-[calc(100vw-2rem)] p-0" align="end">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-semibold">Notificaciones</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => markAll.mutate()}
            disabled={markAll.isPending || count === 0}
          >
            <CheckCheck /> Marcar leídas
          </Button>
        </div>
        <div className="max-h-96 overflow-y-auto scrollbar-thin">
          {list.data?.length ? (
            list.data.map((notification) => {
              const target = notificationTarget(notification);
              return (
                <button
                  key={notification.id}
                  className={cn(
                    "flex w-full items-start gap-2.5 border-b px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-accent/60 outline-none focus-visible:bg-accent",
                    !notification.read_at && "bg-pops-soft/40",
                  )}
                  onClick={() => {
                    if (!notification.read_at) markRead.mutate(notification.id);
                    if (target) navigate(target);
                  }}
                >
                  <span className="mt-0.5 text-base leading-none">{TYPE_EMOJI[notification.type] ?? "🔔"}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{notification.title}</span>
                    {notification.body ? (
                      <span className="block truncate text-xs text-muted-foreground">{notification.body}</span>
                    ) : null}
                    <span className="block text-[11px] text-muted-foreground">{relative(notification.created_at)}</span>
                  </span>
                  {!notification.read_at ? <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-pops" /> : null}
                </button>
              );
            })
          ) : (
            <EmptyState title="Estás al día 🎉" description="Cuando pase algo importante te avisamos acá." className="py-8" />
          )}
        </div>
        <div className="border-t p-1.5">
          <Button variant="ghost" size="sm" className="w-full" onClick={() => navigate("/notificaciones")}>
            Ver todas
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
