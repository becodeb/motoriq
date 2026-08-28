import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CustomerPicker, VehiclePicker } from "@/features/pickers";
import { useStages } from "@/hooks/use-org";
import { api } from "@/lib/api";
import { localInputToISO } from "@/lib/format";

export function OpportunityFormDialog({
  open,
  onOpenChange,
  customerId,
  customerLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId?: string;
  customerLabel?: string;
}) {
  const queryClient = useQueryClient();
  const stages = useStages();
  const [customer, setCustomer] = useState<string | null>(customerId ?? null);
  const [vehicle, setVehicle] = useState<string | null>(null);
  const [stageId, setStageId] = useState<string>("");
  const [value, setValue] = useState("");
  const [closeDate, setCloseDate] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setCustomer(customerId ?? null);
      setVehicle(null);
      setStageId("");
      setValue("");
      setCloseDate("");
      setNotes("");
    }
  }, [open, customerId]);

  const openStages = (stages.data ?? []).filter((s) => !s.is_won && !s.is_lost);

  const mutation = useMutation({
    mutationFn: () =>
      api.post("/opportunities", {
        customer_id: customer,
        vehicle_id: vehicle,
        stage_id: stageId || null,
        expected_value: value ? Number(value.replace(/[^\d.]/g, "")) : null,
        expected_close_date: closeDate ? localInputToISO(`${closeDate}T12:00`) : null,
        notes: notes.trim() || null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["opportunities"] });
      void queryClient.invalidateQueries({ queryKey: ["kanban"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Oportunidad creada");
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva oportunidad</DialogTitle>
          <DialogDescription>Una posible operación para seguir en el pipeline.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {!customerId ? (
            <Field label="Cliente" required>
              <CustomerPicker value={customer} onChange={setCustomer} />
            </Field>
          ) : (
            <p className="text-sm text-muted-foreground">
              Para <span className="font-medium text-foreground">{customerLabel}</span>
            </p>
          )}
          <Field label="Vehículo">
            <VehiclePicker value={vehicle} onChange={setVehicle} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Etapa inicial">
              <Select value={stageId || "auto"} onValueChange={(v) => setStageId(v === "auto" ? "" : v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Primera etapa</SelectItem>
                  {openStages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      {stage.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Valor estimado" hint="Vacío = precio del vehículo">
              <Input value={value} onChange={(e) => setValue(e.target.value)} inputMode="numeric" placeholder="23500" />
            </Field>
            <Field label="Cierre estimado">
              <Input type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} />
            </Field>
          </div>
          <Field label="Notas">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!customer || mutation.isPending}>
            {mutation.isPending ? "Creando…" : "Crear oportunidad"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
