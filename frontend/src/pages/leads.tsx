import { useQuery } from "@tanstack/react-query";
import { Inbox, MessageSquare, Timer } from "lucide-react";
import { useNavigate } from "react-router";

import { SourceBadge } from "@/components/shared/badges";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { ScoreRing } from "@/components/shared/score-ring";
import { UserChip } from "@/components/shared/user-chip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { relative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Customer, Page } from "@/types/api";

/** Bandeja de leads entrantes (§33): lo más nuevo arriba, con tiempo sin responder. */
export function LeadsPage() {
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["leads-inbox"],
    queryFn: () =>
      api.get<Page<Customer>>("/customers", { status: "lead", order_by: "-created_at", page_size: 50 }),
    refetchInterval: 30_000,
  });

  const waitingBadge = (customer: Customer) => {
    if (!customer.awaiting_reply || !customer.last_inbound_at) return null;
    const minutes = Math.floor(
      (Date.now() - new Date(customer.last_inbound_at + (customer.last_inbound_at.endsWith("Z") ? "" : "Z")).getTime()) / 60_000,
    );
    const label = minutes < 60 ? `${minutes} min` : minutes < 2880 ? `${Math.floor(minutes / 60)} h` : `${Math.floor(minutes / 1440)} días`;
    const urgent = minutes >= 30;
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold nums",
          urgent ? "bg-destructive/12 text-destructive" : "bg-score-cierre/12 text-score-cierre",
        )}
      >
        <Timer className="size-3" /> {label} sin responder
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Leads entrantes"
        subtitle="El tiempo de primera respuesta define cuántos de estos se convierten en ventas."
      />

      {query.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : query.data?.items.length ? (
        <div className="space-y-2">
          {query.data.items.map((customer) => (
            <Card
              key={customer.id}
              className={cn(
                "cursor-pointer flex-row items-center gap-4 px-4 py-3 transition-colors hover:border-ring/40",
                customer.awaiting_reply && "border-pops/40",
              )}
              onClick={() => navigate(`/clientes/${customer.id}`)}
            >
              <ScoreRing score={customer.lead_score} label={customer.score_label} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{customer.full_name}</p>
                  <SourceBadge source={customer.source} />
                  {waitingBadge(customer)}
                </div>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                  {customer.interested_vehicle
                    ? `Consulta por ${customer.interested_vehicle.title} ${customer.interested_vehicle.year}`
                    : "Sin vehículo identificado"}
                  {" · entró "}
                  {relative(customer.created_at)}
                </p>
              </div>
              <div className="hidden sm:block">
                <UserChip user={customer.assigned_user} />
              </div>
              <Button
                size="sm"
                variant={customer.awaiting_reply ? "pops" : "secondary"}
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/clientes/${customer.id}`);
                }}
              >
                <MessageSquare /> {customer.awaiting_reply ? "Responder" : "Ver"}
              </Button>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Inbox}
          title="Sin leads nuevos por ahora"
          description="Cuando entren consultas desde WhatsApp, Mercado Libre o la web, aparecen acá con su tiempo de respuesta."
          className="py-20"
        />
      )}
    </div>
  );
}
