import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useQuery } from "@tanstack/react-query";
import { Kanban } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";

import { HealthDot } from "@/components/shared/badges";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { ScoreRing } from "@/components/shared/score-ring";
import { UserAvatar } from "@/components/shared/user-chip";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useStageMover } from "@/features/opportunities/stage-move";
import { useStages, useTeam } from "@/hooks/use-org";
import { api } from "@/lib/api";
import { COLOR_BADGE } from "@/lib/constants";
import { money, relative } from "@/lib/format";
import { cn, normalizeText } from "@/lib/utils";
import type { Opportunity, Stage } from "@/types/api";

function OpportunityCard({
  opportunity,
  dragging = false,
  onClick,
}: {
  opportunity: Opportunity;
  dragging?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      className={cn(
        "cursor-grab space-y-2 rounded-lg border bg-card p-3 transition-shadow",
        dragging ? "rotate-2 shadow-xl" : "hover:border-ring/40",
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-semibold">{opportunity.customer.full_name}</p>
        <ScoreRing score={opportunity.customer.lead_score} label={opportunity.customer.score_label} size="sm" />
      </div>
      <p className="truncate text-xs text-muted-foreground">
        {opportunity.vehicle ? opportunity.vehicle.title : "Sin vehículo definido"}
      </p>
      <div className="flex items-center justify-between gap-2">
        <span className="font-display text-sm font-bold nums">{money(opportunity.expected_value, true)}</span>
        <div className="flex items-center gap-1.5">
          <HealthDot health={opportunity.health} />
          {opportunity.owner ? <UserAvatar user={opportunity.owner} className="size-5 text-[8px]" /> : null}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">Actualizada {relative(opportunity.updated_at)}</p>
    </div>
  );
}

function DraggableCard({ opportunity }: { opportunity: Opportunity }) {
  const navigate = useNavigate();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: opportunity.id,
    data: { opportunity },
    disabled: opportunity.status !== "abierta",
  });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={cn(isDragging && "opacity-30")}>
      <OpportunityCard
        opportunity={opportunity}
        onClick={() => {
          if (!isDragging) navigate(`/clientes/${opportunity.customer.id}`);
        }}
      />
    </div>
  );
}

function Column({ stage, opportunities }: { stage: Stage; opportunities: Opportunity[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id, data: { stage } });
  const total = opportunities.reduce((sum, o) => sum + (o.expected_value ?? 0), 0);

  return (
    <div className="flex w-[270px] shrink-0 flex-col">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className={cn("rounded-md border px-2 py-0.5 text-xs font-semibold", COLOR_BADGE[stage.color] ?? COLOR_BADGE.zinc)}>
          {stage.name}
        </span>
        <span className="text-xs text-muted-foreground nums">{opportunities.length}</span>
        <span className="ml-auto text-xs text-muted-foreground nums">{money(total, true)}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-32 flex-1 flex-col gap-2 rounded-xl border border-dashed border-transparent bg-muted/50 p-2 transition-colors",
          isOver && "border-pops bg-pops-soft/40",
        )}
      >
        {opportunities.map((opportunity) => (
          <DraggableCard key={opportunity.id} opportunity={opportunity} />
        ))}
        {!opportunities.length ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Arrastrá una tarjeta acá</p>
        ) : null}
      </div>
    </div>
  );
}

export function PipelinePage() {
  const stages = useStages();
  const team = useTeam();
  const mover = useStageMover();
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<Opportunity | null>(null);

  const kanban = useQuery({
    queryKey: ["kanban"],
    queryFn: () => api.get<Opportunity[]>("/opportunities/kanban"),
    refetchInterval: 60_000,
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const filtered = useMemo(() => {
    let items = kanban.data ?? [];
    if (ownerFilter !== "all") items = items.filter((o) => o.owner?.id === ownerFilter);
    if (search.trim()) {
      const q = normalizeText(search);
      items = items.filter(
        (o) =>
          normalizeText(o.customer.full_name).includes(q) ||
          (o.vehicle && normalizeText(o.vehicle.title).includes(q)),
      );
    }
    return items;
  }, [kanban.data, ownerFilter, search]);

  const byStage = useMemo(() => {
    const map = new Map<string, Opportunity[]>();
    for (const opportunity of filtered) {
      const list = map.get(opportunity.stage.id) ?? [];
      list.push(opportunity);
      map.set(opportunity.stage.id, list);
    }
    return map;
  }, [filtered]);

  const handleDragStart = (event: DragStartEvent) => {
    setActive((event.active.data.current?.opportunity as Opportunity) ?? null);
  };
  const handleDragEnd = (event: DragEndEvent) => {
    setActive(null);
    const opportunity = event.active.data.current?.opportunity as Opportunity | undefined;
    const stage = event.over?.data.current?.stage as Stage | undefined;
    if (opportunity && stage) mover.requestMove(opportunity, stage);
  };

  const openValue = filtered.filter((o) => o.status === "abierta").reduce((s, o) => s + (o.expected_value ?? 0), 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pipeline"
        subtitle={
          kanban.data
            ? `${filtered.filter((o) => o.status === "abierta").length} oportunidades abiertas · ${money(openValue)} en juego`
            : undefined
        }
        actions={
          <>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filtrar por cliente o vehículo…" className="w-56" />
            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
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
          </>
        }
      />

      {stages.isPending || kanban.isPending ? (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-96 w-[270px] shrink-0 rounded-xl" />
          ))}
        </div>
      ) : stages.data?.length ? (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-thin">
            {stages.data.map((stage) => (
              <Column key={stage.id} stage={stage} opportunities={byStage.get(stage.id) ?? []} />
            ))}
          </div>
          <DragOverlay>{active ? <OpportunityCard opportunity={active} dragging /> : null}</DragOverlay>
        </DndContext>
      ) : (
        <EmptyState icon={Kanban} title="Sin etapas configuradas" description="Configurá el pipeline en Configuración → Pipeline." />
      )}
      {mover.dialogs}
    </div>
  );
}
