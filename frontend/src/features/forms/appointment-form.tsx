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
import { api } from "@/lib/api";
import { APPOINTMENT_TYPES } from "@/lib/constants";
import { localInputToISO } from "@/lib/format";

function defaultStart(): string {
  const date = new Date(Date.now() + 3600 * 1000);
  date.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:00`;
}

export function AppointmentFormDialog({
  open,
  onOpenChange,
  customerId,
  vehicleId,
  defaultDate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId?: string;
  vehicleId?: string;
  defaultDate?: string; // YYYY-MM-DD
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [type, setType] = useState("visita");
  const [customer, setCustomer] = useState<string | null>(customerId ?? null);
  const [vehicle, setVehicle] = useState<string | null>(vehicleId ?? null);
  const [start, setStart] = useState(defaultStart());
  const [end, setEnd] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setTitle("");
      setType("visita");
      setCustomer(customerId ?? null);
      setVehicle(vehicleId ?? null);
      setStart(defaultDate ? `${defaultDate}T10:00` : defaultStart());
      setEnd("");
      setLocation("");
      setNotes("");
    }
  }, [open, customerId, vehicleId, defaultDate]);

  const mutation = useMutation({
    mutationFn: () =>
      api.post("/appointments", {
        title: title.trim(),
        type,
        customer_id: customer,
        vehicle_id: vehicle,
        starts_at: localInputToISO(start),
        ends_at: end ? localInputToISO(end) : null,
        location: location.trim() || null,
        notes: notes.trim() || null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["appointments"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Cita agendada");
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva cita</DialogTitle>
          <DialogDescription>Visitas, test drives, entregas y reuniones.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Título" required>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Visita de Juan — Corolla" autoFocus />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tipo">
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(APPOINTMENT_TYPES).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Lugar">
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Sucursal Centro" />
            </Field>
            <Field label="Comienza" required>
              <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="Termina">
              <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
            </Field>
            <Field label="Cliente">
              <CustomerPicker value={customer} onChange={setCustomer} />
            </Field>
            <Field label="Vehículo">
              <VehiclePicker value={vehicle} onChange={setVehicle} onlyAvailable={false} />
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
          <Button onClick={() => mutation.mutate()} disabled={!title.trim() || !start || mutation.isPending}>
            {mutation.isPending ? "Agendando…" : "Agendar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
