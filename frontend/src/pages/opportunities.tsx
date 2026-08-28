import { useQuery } from "@tanstack/react-query";
import { Plus, Target } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";

import { HealthDot, StageBadge } from "@/components/shared/badges";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Pager } from "@/components/shared/pager";
import { UserChip } from "@/components/shared/user-chip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { OpportunityFormDialog } from "@/features/forms/opportunity-form";
import { useDebounce } from "@/hooks/use-debounce";
import { useStages, useTeam } from "@/hooks/use-org";
import { api } from "@/lib/api";
import { dateShort, money, relative } from "@/lib/format";
import type { Opportunity, Page } from "@/types/api";

export function OpportunitiesPage() {
  const navigate = useNavigate();
  const stages = useStages();
  const team = useTeam();
  const [status, setStatus] = useState("abierta");
  const [stageId, setStageId] = useState("all");
  const [owner, setOwner] = useState("all");
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 300);
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  const query = useQuery({
    queryKey: ["opportunities", status, stageId, owner, debounced, page],
    queryFn: () =>
      api.get<Page<Opportunity>>("/opportunities", {
        status: status === "all" ? undefined : status,
        stage_id: stageId === "all" ? undefined : stageId,
        owner_user_id: owner === "all" ? undefined : owner,
        q: debounced || undefined,
        page,
        page_size: 25,
      }),
    placeholderData: (prev) => prev,
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Oportunidades"
        subtitle={query.data ? `${query.data.total} operaciones` : undefined}
        actions={
          <Button size="sm" variant="pops" onClick={() => setCreateOpen(true)}>
            <Plus /> Nueva oportunidad
          </Button>
        }
      />

      <Card className="gap-0 p-0">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Buscar por cliente…"
            className="w-56"
          />
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="abierta">Abiertas</SelectItem>
              <SelectItem value="ganada">Ganadas</SelectItem>
              <SelectItem value="perdida">Perdidas</SelectItem>
            </SelectContent>
          </Select>
          <Select value={stageId} onValueChange={(v) => { setStageId(v); setPage(1); }}>
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las etapas</SelectItem>
              {(stages.data ?? []).map((stage) => (
                <SelectItem key={stage.id} value={stage.id}>
                  {stage.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={owner} onValueChange={(v) => { setOwner(v); setPage(1); }}>
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
        </div>

        {query.isPending ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
        ) : query.data?.items.length ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Vehículo</TableHead>
                  <TableHead>Etapa</TableHead>
                  <TableHead>Salud</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Prob.</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Cierre est.</TableHead>
                  <TableHead>Actualizada</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.items.map((opportunity) => (
                  <TableRow
                    key={opportunity.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/clientes/${opportunity.customer.id}`)}
                  >
                    <TableCell className="font-medium">{opportunity.customer.full_name}</TableCell>
                    <TableCell className="max-w-48 truncate text-muted-foreground">
                      {opportunity.vehicle?.title ?? "—"}
                    </TableCell>
                    <TableCell>
                      <StageBadge stage={opportunity.stage} />
                    </TableCell>
                    <TableCell>
                      <HealthDot health={opportunity.health} withLabel />
                    </TableCell>
                    <TableCell className="nums">{money(opportunity.expected_value)}</TableCell>
                    <TableCell className="nums">{opportunity.probability ?? 0}%</TableCell>
                    <TableCell>
                      <UserChip user={opportunity.owner} />
                    </TableCell>
                    <TableCell className="text-muted-foreground nums">
                      {dateShort(opportunity.expected_close_date)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{relative(opportunity.updated_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="px-3 pb-3">
              <Pager page={page} pageSize={25} total={query.data.total} onPageChange={setPage} />
            </div>
          </>
        ) : (
          <EmptyState
            icon={Target}
            title="Sin oportunidades con estos filtros"
            description="Las oportunidades siguen cada posible venta a través del pipeline."
            className="py-16"
          />
        )}
      </Card>

      <OpportunityFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
