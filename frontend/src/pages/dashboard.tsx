import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  Check,
  CheckSquare,
  Clock,
  Flame,
  ListChecks,
  PartyPopper,
  Target,
} from "lucide-react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

import { ScoreRing } from "@/components/shared/score-ring";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { api } from "@/lib/api";
import { currentHourInOrgTz, longDate, timeOnly } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAuth } from "@/stores/auth";
import type { AgendaItem, Dashboard, PriorityCard } from "@/types/api";

function greeting(): string {
  const hour = currentHourInOrgTz();
  if (hour < 13) return "Buen día";
  if (hour < 20) return "Buenas tardes";
  return "Buenas noches";
}

const PRIORITY_ICON = {
  fire: { icon: Flame, className: "bg-pops-soft text-pops" },
  warning: { icon: AlertTriangle, className: "bg-amber-500/12 text-amber-600 dark:text-amber-400" },
  clock: { icon: Clock, className: "bg-blue-500/12 text-blue-600 dark:text-blue-400" },
  target: { icon: Target, className: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" },
} as const;

function CountChip({
  label,
  value,
  to,
  tone = "default",
}: {
  label: string;
  value: number;
  to: string;
  tone?: "default" | "danger" | "pops";
}) {
  return (
    <Link
      to={to}
      className={cn(
        "group flex min-w-0 flex-col gap-0.5 rounded-xl border bg-card px-4 py-3 transition-colors hover:border-ring/40",
        tone === "danger" && value > 0 && "border-destructive/40 bg-destructive/5",
        tone === "pops" && value > 0 && "border-pops/40 bg-pops-soft/50",
      )}
    >
      <span
        className={cn(
          "font-display text-2xl font-bold nums leading-none",
          tone === "danger" && value > 0 && "text-destructive",
          tone === "pops" && value > 0 && "text-pops",
        )}
      >
        {value}
      </span>
      <span className="truncate text-xs font-medium text-muted-foreground">{label}</span>
    </Link>
  );
}

function PriorityCardView({ card }: { card: PriorityCard }) {
  const navigate = useNavigate();
  const meta = PRIORITY_ICON[card.icon] ?? PRIORITY_ICON.clock;
  const Icon = meta.icon;
  return (
    <Card
      className="cursor-pointer gap-3 px-4 py-3.5 transition-colors hover:border-ring/40"
      onClick={() => navigate(`/clientes/${card.customer.id}`)}
    >
      <div className="flex items-start gap-3">
        <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", meta.className)}>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate font-semibold">{card.customer.full_name}</p>
            <ScoreRing score={card.customer.lead_score} label={card.customer.score_label} size="sm" />
          </div>
          <p className="truncate text-sm text-muted-foreground">{card.headline}</p>
        </div>
      </div>
      <ul className="space-y-1 pl-1">
        {card.reasons.map((reason, i) => (
          <li key={i} className="flex items-start gap-1.5 text-[13px] text-muted-foreground">
            <span className="mt-[7px] size-1 shrink-0 rounded-full bg-pops/70" />
            {reason}
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-2">
        {card.assigned_to ? (
          <span className="truncate text-xs text-muted-foreground">{card.assigned_to}</span>
        ) : (
          <span />
        )}
        <Button
          size="sm"
          variant={card.icon === "fire" ? "pops" : "secondary"}
          onClick={(e) => {
            e.stopPropagation();
            navigate(
              card.action_kind === "responder"
                ? `/conversaciones?cliente=${card.customer.id}`
                : `/clientes/${card.customer.id}`,
            );
          }}
        >
          {card.action_label} <ArrowRight />
        </Button>
      </div>
    </Card>
  );
}

const AGENDA_ICON: Record<AgendaItem["kind"], typeof Clock> = {
  followup: ListChecks,
  appointment: Calendar,
  task: CheckSquare,
};

function AgendaRow({ item }: { item: AgendaItem }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const Icon = AGENDA_ICON[item.kind];
  const past = new Date(item.time.endsWith("Z") ? item.time : item.time + "Z").getTime() < Date.now();

  const complete = useMutation({
    mutationFn: () =>
      item.kind === "followup"
        ? api.post(`/followups/${item.id}/complete`)
        : api.post(`/tasks/${item.id}/complete`),
    onSuccess: () => {
      toast.success(item.kind === "followup" ? "Seguimiento completado" : "Tarea completada");
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["followups"] });
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  return (
    <div
      className={cn(
        "group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent/60",
        item.customer_id && "cursor-pointer",
      )}
      onClick={() => item.customer_id && navigate(`/clientes/${item.customer_id}`)}
    >
      <span className={cn("w-11 shrink-0 text-right text-[13px] font-semibold nums", past ? "text-pops" : "text-muted-foreground")}>
        {timeOnly(item.time)}
      </span>
      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted">
        <Icon className="size-3.5 text-muted-foreground" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.title}</p>
        {item.subtitle ? <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p> : null}
      </div>
      {item.kind !== "appointment" ? (
        <Button
          variant="ghost"
          size="icon-sm"
          className="opacity-0 transition-opacity group-hover:opacity-100"
          aria-label="Marcar como completado"
          disabled={complete.isPending}
          onClick={(e) => {
            e.stopPropagation();
            complete.mutate();
          }}
        >
          <Check />
        </Button>
      ) : null}
    </div>
  );
}

export function DashboardPage() {
  const user = useAuth((s) => s.user);
  const query = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get<Dashboard>("/dashboard"),
    refetchInterval: 60_000,
  });
  const data = query.data;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-[26px] font-bold tracking-tight">
          {greeting()}, {user?.first_name} <span className="text-pops">·</span>
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{longDate()}</p>
      </div>

      {query.isPending ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[74px] rounded-xl" />
          ))}
        </div>
      ) : data ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <CountChip label="Clientes para contactar hoy" value={data.counts.to_contact_today} to="/clientes?followup=vencido" tone="pops" />
          <CountChip label="Seguimientos de hoy" value={data.counts.pending_followups_today} to="/seguimientos?view=hoy" />
          <CountChip label="Seguimientos vencidos" value={data.counts.overdue_followups} to="/seguimientos?view=vencidos" tone="danger" />
          <CountChip label="Esperando respuesta" value={data.counts.awaiting_reply} to="/conversaciones?esperando=1" />
          <CountChip label="Posibles cierres" value={data.counts.probable_closes} to="/pipeline" />
          <CountChip label="Leads nuevos hoy" value={data.counts.new_leads_today} to="/leads" />
        </div>
      ) : null}

      {data && data.new_vehicle_matches > 0 ? (
        <Link
          to="/inteligencia"
          className="flex items-center gap-3 rounded-xl border border-pops/40 bg-pops-soft/60 px-4 py-3 transition-colors hover:border-pops"
        >
          <Target className="size-5 shrink-0 text-pops" />
          <p className="text-sm">
            <span className="font-semibold">
              {data.new_vehicle_matches} cliente{data.new_vehicle_matches === 1 ? "" : "s"} compatible
              {data.new_vehicle_matches === 1 ? "" : "s"}
            </span>{" "}
            con vehículos que ingresaron esta semana.
          </p>
          <ArrowRight className="ml-auto size-4 text-pops" />
        </Link>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Prioridades de Motor IQ</h2>
            <Link to="/inteligencia" className="text-sm text-pops hover:underline">
              Ver radar completo
            </Link>
          </div>
          {query.isPending ? (
            <div className="grid gap-3 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-44 rounded-xl" />
              ))}
            </div>
          ) : data?.priorities.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {data.priorities.map((card) => (
                <PriorityCardView key={card.customer.id} card={card} />
              ))}
            </div>
          ) : (
            <Card>
              <EmptyState
                icon={PartyPopper}
                title="Nada urgente por ahora"
                description="Cuando haya clientes calientes, respuestas pendientes o seguimientos vencidos, van a aparecer acá."
              />
            </Card>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold">Agenda de hoy</h2>
          <Card className="gap-1 px-2 py-2">
            {query.isPending ? (
              <div className="space-y-2 p-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10" />
                ))}
              </div>
            ) : data?.agenda.length ? (
              data.agenda.map((item) => <AgendaRow key={`${item.kind}-${item.id}`} item={item} />)
            ) : (
              <EmptyState
                icon={Calendar}
                title="Agenda libre 🎉"
                description="No tenés seguimientos, citas ni tareas para hoy."
                className="py-10"
              />
            )}
          </Card>
        </section>
      </div>
    </div>
  );
}
