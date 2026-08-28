import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, MoreHorizontal, Sparkles, X } from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { PriorityBadge } from "@/components/shared/badges";
import { UserChip } from "@/components/shared/user-chip";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";
import { FOLLOWUP_TYPES } from "@/lib/constants";
import { dateTime, relative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Followup } from "@/types/api";

export function useFollowupActions() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["followups"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    void queryClient.invalidateQueries({ queryKey: ["customer"] });
    void queryClient.invalidateQueries({ queryKey: ["customers"] });
  };

  const complete = useMutation({
    mutationFn: (id: string) => api.post(`/followups/${id}/complete`),
    onSuccess: () => {
      toast.success("Seguimiento completado");
      invalidate();
    },
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api.post(`/followups/${id}/cancel`),
    onSuccess: () => {
      toast("Seguimiento cancelado");
      invalidate();
    },
  });
  const accept = useMutation({
    mutationFn: (id: string) => api.post(`/followups/${id}/accept`),
    onSuccess: () => {
      toast.success("Sugerencia aceptada — seguimiento agendado");
      invalidate();
    },
  });
  const discard = useMutation({
    mutationFn: (id: string) => api.post(`/followups/${id}/discard`),
    onSuccess: () => {
      toast("Sugerencia descartada");
      invalidate();
    },
  });

  return { complete, cancel, accept, discard };
}

export function FollowupRow({
  followup,
  showCustomer = true,
  actions,
}: {
  followup: Followup;
  showCustomer?: boolean;
  actions: ReturnType<typeof useFollowupActions>;
}) {
  const navigate = useNavigate();
  const suggested = followup.status === "sugerido";
  const done = followup.status === "completado";

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
        followup.is_overdue && "border-destructive/40 bg-destructive/5",
        suggested && "border-pops/40 bg-pops-soft/40",
        done && "opacity-60",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {showCustomer ? (
            <button
              className="truncate text-sm font-semibold hover:underline"
              onClick={() => navigate(`/clientes/${followup.customer.id}`)}
            >
              {followup.customer.full_name}
            </button>
          ) : null}
          <span className="text-xs text-muted-foreground">{FOLLOWUP_TYPES[followup.type] ?? followup.type}</span>
          {suggested ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-pops">
              <Sparkles className="size-3" /> sugerido por Motor IQ
            </span>
          ) : null}
        </div>
        <p className="truncate text-sm text-muted-foreground">{followup.suggested_reason ?? followup.note ?? "—"}</p>
        <p className={cn("text-xs nums", followup.is_overdue ? "font-medium text-destructive" : "text-muted-foreground")}>
          {dateTime(followup.due_at)} · {relative(followup.due_at)}
        </p>
      </div>
      <div className="hidden sm:block">
        <UserChip user={followup.user} />
      </div>
      <PriorityBadge priority={followup.priority} />
      {suggested ? (
        <div className="flex gap-1">
          <Button size="sm" variant="pops" onClick={() => actions.accept.mutate(followup.id)}>
            <Check /> Aceptar
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Descartar" onClick={() => actions.discard.mutate(followup.id)}>
            <X />
          </Button>
        </div>
      ) : followup.status === "pendiente" ? (
        <div className="flex gap-1">
          <Button size="sm" variant="secondary" onClick={() => actions.complete.mutate(followup.id)}>
            <Check /> Completar
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon-sm" variant="ghost" aria-label="Más acciones">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate(`/clientes/${followup.customer.id}`)}>
                Ver cliente
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => actions.cancel.mutate(followup.id)}>
                Cancelar seguimiento
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : (
        <span className="text-xs capitalize text-muted-foreground">{followup.status}</span>
      )}
    </div>
  );
}
