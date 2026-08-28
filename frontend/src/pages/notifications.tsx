import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { useNavigate } from "react-router";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { notificationTarget } from "@/layout/notifications-popover";
import { api } from "@/lib/api";
import { relative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Notification } from "@/types/api";

export function NotificationsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["notifications", "all"],
    queryFn: () => api.get<Notification[]>("/notifications", { limit: 100 }),
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

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="Notificaciones"
        actions={
          <Button variant="outline" size="sm" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
            <CheckCheck /> Marcar todas como leídas
          </Button>
        }
      />

      {query.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : query.data?.length ? (
        <Card className="gap-0 p-0">
          {query.data.map((notification) => {
            const target = notificationTarget(notification);
            return (
              <button
                key={notification.id}
                className={cn(
                  "flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors last:border-0 hover:bg-accent/60",
                  !notification.read_at && "bg-pops-soft/30",
                )}
                onClick={() => {
                  if (!notification.read_at) markRead.mutate(notification.id);
                  if (target) navigate(target);
                }}
              >
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", notification.read_at ? "bg-border" : "bg-pops")} />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{notification.title}</span>
                  {notification.body ? (
                    <span className="block text-sm text-muted-foreground">{notification.body}</span>
                  ) : null}
                  <span className="block text-xs text-muted-foreground">{relative(notification.created_at)}</span>
                </span>
              </button>
            );
          })}
        </Card>
      ) : (
        <EmptyState
          icon={Bell}
          title="Nada por acá 🎉"
          description="Cuando haya leads nuevos, seguimientos vencidos o clientes calientes, te avisamos."
          className="py-20"
        />
      )}
    </div>
  );
}
