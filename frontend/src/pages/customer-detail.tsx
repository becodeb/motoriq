import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  FileText,
  Kanban,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Phone,
  Pin,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  UserRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";

import { ColorBadge, CustomerStatusBadge, HealthDot, SourceBadge, StageBadge } from "@/components/shared/badges";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Field } from "@/components/shared/field";
import { ScoreRingExplained } from "@/components/shared/score-ring";
import { UserChip } from "@/components/shared/user-chip";
import { VehicleThumb } from "@/components/shared/vehicle-thumb";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { FinancingSection, QuotesSection, TradeInSection } from "@/features/commerce-sections";
import { ConversationThread } from "@/features/conversations/thread";
import { FollowupRow, useFollowupActions } from "@/features/followups/followup-row";
import { CustomerFormDialog } from "@/features/forms/customer-form";
import { AppointmentFormDialog } from "@/features/forms/appointment-form";
import { FollowupFormDialog } from "@/features/forms/followup-form";
import { OpportunityFormDialog } from "@/features/forms/opportunity-form";
import { CustomerPicker } from "@/features/pickers";
import { useStageMover } from "@/features/opportunities/stage-move";
import { useStages } from "@/hooks/use-org";
import { api, ApiError } from "@/lib/api";
import { BODY_TYPES, SCORE_LABELS } from "@/lib/constants";
import { dateFull, money, relative, timelineDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { isManager, useAuth } from "@/stores/auth";
import type {
  Customer,
  CustomerNote,
  Followup,
  NextBestAction,
  Opportunity,
  Page,
  RecommendedVehicle,
  ScoreHistoryEntry,
  TimelineItem,
} from "@/types/api";

const TIMELINE_ICON: Record<string, typeof MessageSquare> = {
  mensaje: MessageSquare,
  nota: Pencil,
  seguimiento: Check,
  etapa: Kanban,
  score: TrendingUp,
  cotizacion: FileText,
  cita: Calendar,
};

export function CustomerDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuth((s) => s.user);
  const [tab, setTab] = useState("actividad");
  const [editOpen, setEditOpen] = useState(false);
  const [followupOpen, setFollowupOpen] = useState(false);
  const [opportunityOpen, setOpportunityOpen] = useState(false);
  const [appointmentOpen, setAppointmentOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const customerQuery = useQuery({
    queryKey: ["customer", id],
    queryFn: () => api.get<Customer>(`/customers/${id}`),
  });
  const customer = customerQuery.data;

  const nba = useQuery({
    queryKey: ["customer-nba", id],
    queryFn: () => api.get<NextBestAction>(`/customers/${id}/next-best-action`),
    enabled: Boolean(customer),
  });

  const invalidateCustomer = () => {
    void queryClient.invalidateQueries({ queryKey: ["customer", id] });
    void queryClient.invalidateQueries({ queryKey: ["customers"] });
    void queryClient.invalidateQueries({ queryKey: ["customer-nba", id] });
    void queryClient.invalidateQueries({ queryKey: ["customer-timeline", id] });
  };

  const summaryMutation = useMutation({
    mutationFn: () => api.post<Customer>(`/customers/${id}/ai-summary`),
    meta: { silent: true },
    onSuccess: () => {
      toast.success("Resumen actualizado");
      invalidateCustomer();
    },
    onError: (error) => {
      if (error instanceof ApiError && (error.code === "AI_NOT_CONFIGURED" || error.code === "AI_DISABLED")) {
        toast.error(error.message, {
          action: { label: "Configurar", onClick: () => navigate("/configuracion/ia") },
        });
      } else {
        toast.error(error instanceof Error ? error.message : "No se pudo generar el resumen");
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/customers/${id}`),
    onSuccess: () => {
      toast.success("Cliente eliminado");
      navigate("/clientes");
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
  });

  const handleNBAAction = (action: NextBestAction) => {
    switch (action.action) {
      case "responder":
      case "retomar":
      case "ofrecer_match":
      case "ofrecer_alternativas":
        setTab("conversacion");
        break;
      case "enviar_financiacion":
      case "cotizar_permuta":
      case "confirmar_reserva":
        setTab("comercial");
        break;
      case "completar_seguimiento":
        setTab("seguimientos");
        break;
      case "proponer_visita":
        setAppointmentOpen(true);
        break;
      case "agendar_seguimiento":
      case "mantener":
        setFollowupOpen(true);
        break;
      case "cerrar_perdido":
        setTab("oportunidades");
        break;
      default:
        setTab("actividad");
    }
  };

  if (customerQuery.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-xl" />
        <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    );
  }
  if (!customer) {
    return (
      <EmptyState
        icon={UserRound}
        title="Cliente no encontrado"
        action={<Button onClick={() => navigate("/clientes")}>Volver a clientes</Button>}
        className="py-24"
      />
    );
  }

  const waNumber = (customer.whatsapp ?? customer.phone ?? "").replace(/\D/g, "");

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start gap-4">
        <Button variant="ghost" size="icon-sm" onClick={() => navigate(-1)} aria-label="Volver">
          <ArrowLeft />
        </Button>
        <ScoreRingExplained
          score={customer.lead_score}
          label={customer.score_label}
          reason={customer.score_reason}
          factors={customer.score_factors}
          size="lg"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-bold tracking-tight">{customer.full_name}</h1>
            <CustomerStatusBadge status={customer.status} />
            {customer.awaiting_reply ? (
              <span className="text-xs font-semibold text-pops">● esperando respuesta</span>
            ) : null}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {SCORE_LABELS[customer.score_label]?.emoji} {SCORE_LABELS[customer.score_label]?.label}
            {customer.interested_vehicle ? (
              <>
                {" · Interesado en "}
                <Link to={`/vehiculos/${customer.interested_vehicle.id}`} className="text-foreground hover:underline">
                  {customer.interested_vehicle.title} {customer.interested_vehicle.year}
                </Link>
              </>
            ) : null}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {customer.tags.map((tag) => (
              <ColorBadge key={tag.id} color={tag.color}>
                {tag.name}
              </ColorBadge>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {waNumber ? (
            <Button variant="pops" size="sm" asChild>
              <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noreferrer">
                <Phone /> Contactar
              </a>
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => setFollowupOpen(true)}>
            <Plus /> Seguimiento
          </Button>
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil /> Editar
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Más acciones">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setOpportunityOpen(true)}>Nueva oportunidad</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setAppointmentOpen(true)}>Agendar cita</DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  api.post(`/customers/${id}/recalculate-score`).then(() => {
                    toast.success("Score recalculado");
                    invalidateCustomer();
                  })
                }
              >
                <RefreshCw /> Recalcular score
              </DropdownMenuItem>
              {isManager(user) ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setMergeOpen(true)}>Fusionar duplicado</DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                    <Trash2 /> Eliminar cliente
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Resumen Motor IQ (§19) + NBA (§13) */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="gap-2 px-4 py-3.5">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Sparkles className="size-3.5 text-pops" /> Resumen Motor IQ
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => summaryMutation.mutate()}
              disabled={summaryMutation.isPending}
            >
              <RefreshCw className={cn(summaryMutation.isPending && "animate-spin")} />
              {customer.ai_summary ? "Actualizar" : "Generar"}
            </Button>
          </div>
          {customer.ai_summary ? (
            <>
              <p className="text-sm leading-relaxed">{customer.ai_summary}</p>
              <p className="text-[11px] text-muted-foreground">Actualizado {relative(customer.ai_summary_at)}</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Generá un resumen ejecutivo del cliente con IA: qué busca, presupuesto, permuta y próximo paso.
              Requiere un proveedor de IA configurado.
            </p>
          )}
        </Card>

        <Card className="gap-2 border-pops/30 px-4 py-3.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Próxima mejor acción</p>
          {nba.isPending ? (
            <Skeleton className="h-12" />
          ) : nba.data ? (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">{nba.data.label}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{nba.data.reason}</p>
              </div>
              <Button
                variant={nba.data.urgency === "alta" ? "pops" : "secondary"}
                size="sm"
                className="shrink-0"
                onClick={() => handleNBAAction(nba.data)}
              >
                Ir <ArrowRight />
              </Button>
            </div>
          ) : null}
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_330px]">
        {/* Columna principal */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="actividad">Actividad</TabsTrigger>
            <TabsTrigger value="conversacion">Conversación</TabsTrigger>
            <TabsTrigger value="seguimientos">Seguimientos</TabsTrigger>
            <TabsTrigger value="oportunidades">Oportunidades</TabsTrigger>
            <TabsTrigger value="comercial">Comercial</TabsTrigger>
            <TabsTrigger value="notas">Notas</TabsTrigger>
          </TabsList>

          <TabsContent value="actividad">
            <TimelineTab customerId={id} />
          </TabsContent>
          <TabsContent value="conversacion">
            <Card className="overflow-hidden p-0">
              <ConversationThread customerId={id} channel={customer.source} compact />
            </Card>
          </TabsContent>
          <TabsContent value="seguimientos">
            <FollowupsTab customerId={id} onCreate={() => setFollowupOpen(true)} />
          </TabsContent>
          <TabsContent value="oportunidades">
            <OpportunitiesTab customerId={id} onCreate={() => setOpportunityOpen(true)} />
          </TabsContent>
          <TabsContent value="comercial" className="space-y-4">
            <QuotesSection customer={customer} />
            <FinancingSection customer={customer} />
            <TradeInSection customer={customer} />
          </TabsContent>
          <TabsContent value="notas">
            <NotesTab customerId={id} />
          </TabsContent>
        </Tabs>

        {/* Rail derecho */}
        <div className="space-y-4">
          <InfoCard customer={customer} />
          <RecommendedVehiclesCard customerId={id} />
          <ScoreHistoryCard customerId={id} />
        </div>
      </div>

      <CustomerFormDialog open={editOpen} onOpenChange={setEditOpen} customer={customer} onSaved={invalidateCustomer} />
      <FollowupFormDialog
        open={followupOpen}
        onOpenChange={setFollowupOpen}
        customerId={id}
        customerLabel={customer.full_name}
      />
      <OpportunityFormDialog
        open={opportunityOpen}
        onOpenChange={setOpportunityOpen}
        customerId={id}
        customerLabel={customer.full_name}
      />
      <AppointmentFormDialog open={appointmentOpen} onOpenChange={setAppointmentOpen} customerId={id} />
      <MergeDialog open={mergeOpen} onOpenChange={setMergeOpen} target={customer} onMerged={invalidateCustomer} />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`¿Eliminar a ${customer.full_name}?`}
        description="El cliente deja de aparecer en listas y métricas. Esta acción la puede revertir un administrador desde la base de datos."
        confirmLabel="Eliminar"
        destructive
        onConfirm={() => deleteMutation.mutateAsync().then(() => undefined)}
      />
    </div>
  );
}

/* ── Tabs ── */

function TimelineTab({ customerId }: { customerId: string }) {
  const timeline = useQuery({
    queryKey: ["customer-timeline", customerId],
    queryFn: () => api.get<TimelineItem[]>(`/customers/${customerId}/timeline`),
  });

  if (timeline.isPending)
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    );
  if (!timeline.data?.length)
    return <EmptyState title="Sin actividad todavía" description="Los mensajes, notas y cambios van a aparecer acá." className="py-12" />;

  return (
    <div className="relative space-y-0 pl-1">
      {timeline.data.map((item, index) => {
        const Icon = item.kind === "score" && item.icon === "trending-down" ? TrendingDown : (TIMELINE_ICON[item.kind] ?? MessageSquare);
        const isPops = item.actor === "Motor IQ";
        return (
          <div key={item.id} className="relative flex gap-3 pb-4">
            {index < timeline.data.length - 1 ? (
              <span className="absolute left-[13px] top-8 h-full w-px bg-border" aria-hidden />
            ) : null}
            <span
              className={cn(
                "z-10 mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border bg-card",
                isPops && "border-pops/40 bg-pops-soft text-pops",
              )}
            >
              <Icon className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <p className={cn("text-sm font-medium", isPops && "text-pops")}>{item.title}</p>
                <span className="text-[11px] text-muted-foreground nums">{timelineDate(item.created_at)}</span>
              </div>
              {item.body ? (
                <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-muted-foreground">{item.body}</p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FollowupsTab({ customerId, onCreate }: { customerId: string; onCreate: () => void }) {
  const actions = useFollowupActions();
  const followups = useQuery({
    queryKey: ["followups", "customer", customerId],
    queryFn: () => api.get<Page<Followup>>("/followups", { customer_id: customerId, view: "todos", page_size: 50 }),
  });

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={onCreate}>
          <Plus /> Nuevo seguimiento
        </Button>
      </div>
      {followups.isPending ? (
        <Skeleton className="h-40" />
      ) : followups.data?.items.length ? (
        followups.data.items.map((followup) => (
          <FollowupRow key={followup.id} followup={followup} showCustomer={false} actions={actions} />
        ))
      ) : (
        <EmptyState
          title="Sin seguimientos programados"
          description="Agendá el próximo contacto para que este cliente no se enfríe."
          action={
            <Button variant="pops" size="sm" onClick={onCreate}>
              <Plus /> Crear seguimiento
            </Button>
          }
          className="py-10"
        />
      )}
    </div>
  );
}

function OpportunitiesTab({ customerId, onCreate }: { customerId: string; onCreate: () => void }) {
  const stages = useStages();
  const mover = useStageMover();
  const all = useQuery({
    queryKey: ["opportunities", "by-customer", customerId],
    queryFn: async () => {
      const page = await api.get<Page<Opportunity>>("/opportunities", { customer_id: customerId, page_size: 20 });
      return page.items;
    },
  });

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={onCreate}>
          <Plus /> Nueva oportunidad
        </Button>
      </div>
      {all.isPending ? (
        <Skeleton className="h-32" />
      ) : all.data?.length ? (
        all.data.map((opportunity) => (
          <div key={opportunity.id} className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5">
            <HealthDot health={opportunity.health} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {opportunity.vehicle ? (
                  <Link to={`/vehiculos/${opportunity.vehicle.id}`} className="hover:underline">
                    {opportunity.vehicle.title}
                  </Link>
                ) : (
                  "Sin vehículo definido"
                )}
              </p>
              <p className="text-xs text-muted-foreground nums">
                {money(opportunity.expected_value)} · {opportunity.probability ?? 0}% ·{" "}
                {relative(opportunity.updated_at)}
              </p>
            </div>
            <StageBadge stage={opportunity.stage} />
            {opportunity.status === "abierta" ? (
              <Select
                value={opportunity.stage.id}
                onValueChange={(stageId) => {
                  const stage = stages.data?.find((s) => s.id === stageId);
                  if (stage) mover.requestMove(opportunity, stage);
                }}
              >
                <SelectTrigger size="sm" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(stages.data ?? []).map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      {stage.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="text-xs capitalize text-muted-foreground">
                {opportunity.status}
                {opportunity.lost_reason ? ` · ${opportunity.lost_reason}` : ""}
              </span>
            )}
          </div>
        ))
      ) : (
        <EmptyState
          title="Sin oportunidades"
          description="Creá una oportunidad para seguir esta posible venta en el pipeline."
          className="py-10"
        />
      )}
      {mover.dialogs}
    </div>
  );
}

function NotesTab({ customerId }: { customerId: string }) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const notes = useQuery({
    queryKey: ["customer-notes", customerId],
    queryFn: () => api.get<CustomerNote[]>(`/customers/${customerId}/notes`),
  });

  const create = useMutation({
    mutationFn: (pinned: boolean) => api.post(`/customers/${customerId}/notes`, { body: body.trim(), pinned }),
    onSuccess: () => {
      setBody("");
      void queryClient.invalidateQueries({ queryKey: ["customer-notes", customerId] });
      void queryClient.invalidateQueries({ queryKey: ["customer-timeline", customerId] });
    },
  });
  const remove = useMutation({
    mutationFn: (noteId: string) => api.delete(`/customers/${customerId}/notes/${noteId}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["customer-notes", customerId] }),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Escribí una nota interna…"
          rows={2}
        />
        <div className="flex flex-col gap-1">
          <Button size="sm" disabled={!body.trim() || create.isPending} onClick={() => create.mutate(false)}>
            Guardar
          </Button>
          <Button size="sm" variant="outline" disabled={!body.trim() || create.isPending} onClick={() => create.mutate(true)}>
            <Pin /> Fijar
          </Button>
        </div>
      </div>
      {notes.data?.length ? (
        notes.data.map((note) => (
          <div key={note.id} className={cn("group rounded-lg border p-3", note.pinned && "border-pops/40 bg-pops-soft/30")}>
            <div className="flex items-start justify-between gap-2">
              <p className="whitespace-pre-wrap text-sm">{note.body}</p>
              <button
                className="opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => remove.mutate(note.id)}
                aria-label="Borrar nota"
              >
                <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {note.pinned ? "📌 " : ""}
              {note.user?.full_name ?? "—"} · {timelineDate(note.created_at)}
            </p>
          </div>
        ))
      ) : (
        <EmptyState title="Sin notas" description="Las notas internas del equipo aparecen acá." className="py-8" />
      )}
    </div>
  );
}

/* ── Rail derecho ── */

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right text-sm font-medium">{children}</span>
    </div>
  );
}

function InfoCard({ customer }: { customer: Customer }) {
  const interest = [
    customer.interest_brand,
    customer.interest_model,
    customer.interest_body_type ? BODY_TYPES[customer.interest_body_type] : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Card className="gap-2 px-4 py-3.5">
      <CardTitle className="text-sm">Información</CardTitle>
      <div className="divide-y">
        <InfoRow label="Teléfono">{customer.phone ?? "—"}</InfoRow>
        <InfoRow label="Email">
          <span className="break-all">{customer.email ?? "—"}</span>
        </InfoRow>
        <InfoRow label="Origen">
          <SourceBadge source={customer.source} />
        </InfoRow>
        <InfoRow label="Vendedor">
          <UserChip user={customer.assigned_user} />
        </InfoRow>
        <InfoRow label="Presupuesto">{money(customer.budget)}</InfoRow>
        <InfoRow label="Financiación">{customer.financing_interest ? "Le interesa" : "No consultó"}</InfoRow>
        <InfoRow label="Permuta">{customer.has_trade_in ? "Tiene usado" : "No"}</InfoRow>
        {interest ? <InfoRow label="Busca">{interest}</InfoRow> : null}
        {customer.interest_year_min || customer.interest_year_max ? (
          <InfoRow label="Años">
            {customer.interest_year_min ?? "…"}–{customer.interest_year_max ?? "…"}
          </InfoRow>
        ) : null}
        <InfoRow label="Último contacto">{relative(customer.last_contact_at)}</InfoRow>
        <InfoRow label="Próx. seguimiento">{relative(customer.next_followup_at)}</InfoRow>
        <InfoRow label="Alta">{dateFull(customer.created_at)}</InfoRow>
      </div>
      {customer.notes ? (
        <p className="rounded-md bg-muted px-2.5 py-2 text-xs text-muted-foreground">{customer.notes}</p>
      ) : null}
    </Card>
  );
}

function RecommendedVehiclesCard({ customerId }: { customerId: string }) {
  const navigate = useNavigate();
  const recommended = useQuery({
    queryKey: ["recommended-vehicles", customerId],
    queryFn: () => api.get<RecommendedVehicle[]>(`/customers/${customerId}/recommended-vehicles`),
  });

  return (
    <Card className="gap-2 px-4 py-3.5">
      <CardTitle className="text-sm">Vehículos recomendados</CardTitle>
      {recommended.isPending ? (
        <Skeleton className="h-24" />
      ) : recommended.data?.length ? (
        <div className="space-y-2">
          {recommended.data.slice(0, 4).map(({ vehicle, score, reasons }) => (
            <button
              key={vehicle.id}
              className="flex w-full items-center gap-2.5 rounded-lg border p-2 text-left transition-colors hover:border-pops/50"
              onClick={() => navigate(`/vehiculos/${vehicle.id}`)}
            >
              <VehicleThumb url={vehicle.thumbnail_url} title={vehicle.title} className="h-10 w-14" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {vehicle.title} {vehicle.year}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{reasons.slice(0, 2).join(" · ")}</span>
              </span>
              <span className="font-display text-sm font-bold text-pops nums">{score}%</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Sin matches con el stock actual. Cargá preferencias de búsqueda para que Motor IQ recomiende.
        </p>
      )}
    </Card>
  );
}

function ScoreHistoryCard({ customerId }: { customerId: string }) {
  const history = useQuery({
    queryKey: ["score-history", customerId],
    queryFn: () => api.get<ScoreHistoryEntry[]>(`/customers/${customerId}/score-history`),
  });
  const entries = useMemo(() => (history.data ?? []).slice(0, 6), [history.data]);

  if (!entries.length) return null;
  return (
    <Card className="gap-2 px-4 py-3.5">
      <CardTitle className="text-sm">Evolución del score</CardTitle>
      <div className="space-y-2">
        {entries.map((entry) => {
          const up = entry.new_score > entry.old_score;
          return (
            <div key={entry.id} className="flex items-center gap-2 text-sm">
              {up ? (
                <TrendingUp className="size-3.5 shrink-0 text-score-cierre" />
              ) : (
                <TrendingDown className="size-3.5 shrink-0 text-destructive" />
              )}
              <span className="font-medium nums">
                {entry.old_score} → {entry.new_score}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{entry.reason}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{relative(entry.created_at)}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function MergeDialog({
  open,
  onOpenChange,
  target,
  onMerged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: Customer;
  onMerged: () => void;
}) {
  const [sourceId, setSourceId] = useState<string | null>(null);
  const merge = useMutation({
    mutationFn: () => api.post<Customer>(`/customers/${target.id}/merge`, { source_customer_id: sourceId }),
    onSuccess: () => {
      toast.success("Clientes fusionados");
      onOpenChange(false);
      onMerged();
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Fusionar duplicado</DialogTitle>
          <DialogDescription>
            Toda la actividad del cliente elegido se mueve a {target.full_name} y el duplicado se desactiva.
          </DialogDescription>
        </DialogHeader>
        <Field label="Cliente duplicado (origen)">
          <CustomerPicker value={sourceId} onChange={setSourceId} placeholder="Buscar el duplicado…" />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={!sourceId || sourceId === target.id || merge.isPending}
            onClick={() => merge.mutate()}
          >
            {merge.isPending ? "Fusionando…" : "Fusionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
