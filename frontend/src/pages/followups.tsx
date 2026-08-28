import { useQuery } from "@tanstack/react-query";
import { ListChecks, Plus } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Pager } from "@/components/shared/pager";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FollowupRow, useFollowupActions } from "@/features/followups/followup-row";
import { FollowupFormDialog } from "@/features/forms/followup-form";
import { useTeam } from "@/hooks/use-org";
import { api } from "@/lib/api";
import { isManager, useAuth } from "@/stores/auth";
import type { Followup, Page } from "@/types/api";

const VIEWS = [
  { value: "hoy", label: "Hoy" },
  { value: "vencidos", label: "Vencidos" },
  { value: "proximos", label: "Próximos" },
  { value: "sugeridos", label: "Sugeridos por Motor IQ" },
  { value: "completados", label: "Completados" },
] as const;

export function FollowupsPage() {
  const [params, setParams] = useSearchParams();
  const view = params.get("view") ?? "hoy";
  const user = useAuth((s) => s.user);
  const team = useTeam();
  const actions = useFollowupActions();
  const [page, setPage] = useState(1);
  const [userFilter, setUserFilter] = useState(isManager(user) ? "all" : (user?.id ?? "all"));
  const [createOpen, setCreateOpen] = useState(false);

  const query = useQuery({
    queryKey: ["followups", view, userFilter, page],
    queryFn: () =>
      api.get<Page<Followup>>("/followups", {
        view,
        user_id: userFilter === "all" ? undefined : userFilter,
        page,
        page_size: 30,
      }),
    placeholderData: (prev) => prev,
  });

  const emptyCopy: Record<string, { title: string; description: string }> = {
    hoy: { title: "No hay seguimientos para hoy 🎉", description: "Agenda despejada. Podés adelantar los próximos." },
    vencidos: { title: "Sin seguimientos vencidos 💪", description: "Todo el equipo está al día." },
    proximos: { title: "Nada agendado hacia adelante", description: "Programá los próximos contactos para no perder el hilo." },
    sugeridos: {
      title: "Sin sugerencias pendientes",
      description: "Cuando un cliente escriba algo como “hablame la semana que viene”, Motor IQ sugiere el seguimiento acá.",
    },
    completados: { title: "Todavía no completaste seguimientos", description: "Los completados quedan registrados acá." },
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Seguimientos"
        subtitle="El sistema que evita que se pierdan oportunidades por falta de seguimiento."
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
              <Plus /> Nuevo seguimiento
            </Button>
          </>
        }
      />

      <Tabs
        value={view}
        onValueChange={(v) => {
          setPage(1);
          setParams({ view: v }, { replace: true });
        }}
      >
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
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : query.data?.items.length ? (
        <div className="space-y-2">
          {query.data.items.map((followup) => (
            <FollowupRow key={followup.id} followup={followup} actions={actions} />
          ))}
          <Pager page={page} pageSize={30} total={query.data.total} onPageChange={setPage} />
        </div>
      ) : (
        <EmptyState
          icon={ListChecks}
          title={emptyCopy[view]?.title ?? "Sin seguimientos"}
          description={emptyCopy[view]?.description}
          className="py-16"
        />
      )}

      <FollowupFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
