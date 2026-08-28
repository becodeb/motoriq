import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CheckSquare, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { PriorityBadge } from "@/components/shared/badges";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Pager } from "@/components/shared/pager";
import { UserChip } from "@/components/shared/user-chip";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TaskFormDialog } from "@/features/forms/task-form";
import { useTeam } from "@/hooks/use-org";
import { api } from "@/lib/api";
import { TASK_TYPES } from "@/lib/constants";
import { dateTime, relative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { isManager, useAuth } from "@/stores/auth";
import type { Page, Task } from "@/types/api";

const VIEWS = [
  { value: "hoy", label: "Hoy" },
  { value: "proximas", label: "Próximas" },
  { value: "vencidas", label: "Vencidas" },
  { value: "completadas", label: "Completadas" },
] as const;

export function TasksPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuth((s) => s.user);
  const team = useTeam();
  const [view, setView] = useState("hoy");
  const [page, setPage] = useState(1);
  const [userFilter, setUserFilter] = useState(isManager(user) ? "all" : (user?.id ?? "all"));
  const [createOpen, setCreateOpen] = useState(false);

  const query = useQuery({
    queryKey: ["tasks", view, userFilter, page],
    queryFn: () =>
      api.get<Page<Task>>("/tasks", {
        view,
        user_id: userFilter === "all" ? undefined : userFilter,
        page,
        page_size: 30,
      }),
    placeholderData: (prev) => prev,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const complete = useMutation({
    mutationFn: (id: string) => api.post(`/tasks/${id}/complete`),
    onSuccess: () => {
      toast.success("Tarea completada");
      invalidate();
    },
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api.delete(`/tasks/${id}`),
    onSuccess: () => {
      toast("Tarea cancelada");
      invalidate();
    },
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tareas"
        actions={
          <>
            {isManager(user) ? (
              <Select value={userFilter} onValueChange={(v) => { setUserFilter(v); setPage(1); }}>
                <SelectTrigger size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todo el equipo</SelectItem>
                  {(team.data ?? [])
                    .filter((u) => u.is_active)
                    .map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.full_name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            ) : null}
            <Button size="sm" variant="pops" onClick={() => setCreateOpen(true)}>
              <Plus /> Nueva tarea
            </Button>
          </>
        }
      />

      <Tabs value={view} onValueChange={(v) => { setView(v); setPage(1); }}>
        <TabsList>
          {VIEWS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {query.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : query.data?.items.length ? (
        <div className="space-y-2">
          {query.data.items.map((task) => (
            <div
              key={task.id}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-3 py-2.5",
                task.is_overdue && "border-destructive/40 bg-destructive/5",
                task.status !== "pendiente" && "opacity-60",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{task.title}</p>
                <p className="text-xs text-muted-foreground">
                  {TASK_TYPES[task.type] ?? task.type}
                  {task.customer ? (
                    <>
                      {" · "}
                      <button className="hover:underline" onClick={() => navigate(`/clientes/${task.customer!.id}`)}>
                        {task.customer.full_name}
                      </button>
                    </>
                  ) : null}
                  {task.origin !== "manual" ? " · creada por Motor IQ" : ""}
                </p>
                {task.due_at ? (
                  <p className={cn("text-xs nums", task.is_overdue ? "font-medium text-destructive" : "text-muted-foreground")}>
                    {dateTime(task.due_at)} · {relative(task.due_at)}
                  </p>
                ) : null}
              </div>
              <div className="hidden sm:block">
                <UserChip user={task.user} />
              </div>
              <PriorityBadge priority={task.priority} />
              {task.status === "pendiente" ? (
                <div className="flex gap-1">
                  <Button size="sm" variant="secondary" onClick={() => complete.mutate(task.id)}>
                    <Check /> Completar
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Cancelar tarea" onClick={() => cancel.mutate(task.id)}>
                    <Trash2 />
                  </Button>
                </div>
              ) : (
                <span className="text-xs capitalize text-muted-foreground">{task.status}</span>
              )}
            </div>
          ))}
          <Pager page={page} pageSize={30} total={query.data.total} onPageChange={setPage} />
        </div>
      ) : (
        <EmptyState
          icon={CheckSquare}
          title={view === "vencidas" ? "Sin tareas vencidas 💪" : "No hay tareas acá"}
          description="Creá tareas rápidas para lo operativo del día a día."
          className="py-16"
        />
      )}

      <TaskFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
