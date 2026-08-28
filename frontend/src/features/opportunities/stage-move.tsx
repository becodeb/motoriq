import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import type { Opportunity, Stage } from "@/types/api";

interface PendingMove {
  opportunity: Opportunity;
  stage: Stage;
}

/** Flujo compartido de movimiento de etapa (§10, §96): vendido pide precio final,
 *  perdido pide motivo; el resto se mueve directo. Usado por el kanban y el perfil. */
export function useStageMover() {
  const queryClient = useQueryClient();
  const [pendingWon, setPendingWon] = useState<PendingMove | null>(null);
  const [pendingLost, setPendingLost] = useState<PendingMove | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["kanban"] });
    void queryClient.invalidateQueries({ queryKey: ["opportunities"] });
    void queryClient.invalidateQueries({ queryKey: ["customer"] });
    void queryClient.invalidateQueries({ queryKey: ["customers"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    void queryClient.invalidateQueries({ queryKey: ["vehicles"] });
  };

  const mutation = useMutation({
    mutationFn: (payload: { id: string; stage_id: string; lost_reason?: string; sold_price?: number }) =>
      api.post<Opportunity>(`/opportunities/${payload.id}/move`, {
        stage_id: payload.stage_id,
        lost_reason: payload.lost_reason,
        sold_price: payload.sold_price,
      }),
    onSuccess: (opportunity) => {
      invalidate();
      if (opportunity.status === "ganada") toast.success(`🎉 Venta registrada: ${opportunity.customer.full_name}`);
      else if (opportunity.status === "perdida") toast(`Oportunidad cerrada como perdida`);
      else toast.success(`Movida a ${opportunity.stage.name}`);
    },
  });

  const requestMove = (opportunity: Opportunity, stage: Stage) => {
    if (stage.id === opportunity.stage.id) return;
    if (stage.is_won) setPendingWon({ opportunity, stage });
    else if (stage.is_lost) setPendingLost({ opportunity, stage });
    else mutation.mutate({ id: opportunity.id, stage_id: stage.id });
  };

  const dialogs = (
    <>
      <WonDialog
        pending={pendingWon}
        busy={mutation.isPending}
        onClose={() => setPendingWon(null)}
        onConfirm={(soldPrice) => {
          if (pendingWon)
            mutation.mutate(
              { id: pendingWon.opportunity.id, stage_id: pendingWon.stage.id, sold_price: soldPrice },
              { onSuccess: () => setPendingWon(null) },
            );
        }}
      />
      <LostDialog
        pending={pendingLost}
        busy={mutation.isPending}
        onClose={() => setPendingLost(null)}
        onConfirm={(reason) => {
          if (pendingLost)
            mutation.mutate(
              { id: pendingLost.opportunity.id, stage_id: pendingLost.stage.id, lost_reason: reason },
              { onSuccess: () => setPendingLost(null) },
            );
        }}
      />
    </>
  );

  return { requestMove, dialogs, moving: mutation.isPending };
}

function WonDialog({
  pending,
  busy,
  onClose,
  onConfirm,
}: {
  pending: PendingMove | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (soldPrice: number | undefined) => void;
}) {
  const [price, setPrice] = useState("");
  const suggested = pending?.opportunity.expected_value ?? pending?.opportunity.vehicle?.price ?? null;

  return (
    <Dialog open={Boolean(pending)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>🎉 Registrar venta</DialogTitle>
          <DialogDescription>
            {pending?.opportunity.customer.full_name}
            {pending?.opportunity.vehicle ? ` — ${pending.opportunity.vehicle.title}` : ""}. El vehículo pasa a
            vendido y el cliente a comprador.
          </DialogDescription>
        </DialogHeader>
        <Field label="Precio final de venta" hint={suggested ? `Sugerido: ${money(suggested)}` : undefined}>
          <Input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder={suggested ? String(suggested) : "0"}
            inputMode="numeric"
            autoFocus
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button
            variant="pops"
            disabled={busy}
            onClick={() => {
              const parsed = Number(price.replace(/[^\d.]/g, ""));
              onConfirm(Number.isFinite(parsed) && parsed > 0 ? parsed : undefined);
              setPrice("");
            }}
          >
            {busy ? "Registrando…" : "Confirmar venta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LostDialog({
  pending,
  busy,
  onClose,
  onConfirm,
}: {
  pending: PendingMove | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");

  return (
    <Dialog open={Boolean(pending)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cerrar como perdida</DialogTitle>
          <DialogDescription>
            {pending?.opportunity.customer.full_name} — el motivo alimenta los analytics de pérdidas.
          </DialogDescription>
        </DialogHeader>
        <Field label="Motivo" required>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Compró en otra agencia, postergó la compra…"
            rows={2}
            autoFocus
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={busy || !reason.trim()}
            onClick={() => {
              onConfirm(reason.trim());
              setReason("");
            }}
          >
            {busy ? "Cerrando…" : "Cerrar oportunidad"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
