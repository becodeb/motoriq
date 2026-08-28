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
import { CustomerPicker, SellerPicker } from "@/features/pickers";
import { api } from "@/lib/api";
import { FOLLOWUP_TYPES, PRIORITIES } from "@/lib/constants";
import { localInputToISO } from "@/lib/format";
import { isManager, useAuth } from "@/stores/auth";

function defaultDue(): string {
  const date = new Date(Date.now() + 24 * 3600 * 1000);
  date.setHours(10, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function FollowupFormDialog({
  open,
  onOpenChange,
  customerId,
  customerLabel,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId?: string;
  customerLabel?: string;
  onSaved?: () => void;
}) {
  const queryClient = useQueryClient();
  const user = useAuth((s) => s.user);
  const [customer, setCustomer] = useState<string | null>(customerId ?? null);
  const [due, setDue] = useState(defaultDue());
  const [type, setType] = useState("llamada");
  const [priority, setPriority] = useState("media");
  const [assignee, setAssignee] = useState<string | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) {
      setCustomer(customerId ?? null);
      setDue(defaultDue());
      setType("llamada");
      setPriority("media");
      setAssignee(null);
      setNote("");
    }
  }, [open, customerId]);

  const mutation = useMutation({
    mutationFn: () =>
      api.post("/followups", {
        customer_id: customer,
        due_at: localInputToISO(due),
        type,
        priority,
        note: note.trim() || null,
        user_id: assignee,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["followups"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["customer"] });
      toast.success("Seguimiento creado");
      onOpenChange(false);
      onSaved?.();
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo seguimiento</DialogTitle>
          <DialogDescription>Definí cuándo y cómo retomar el contacto.</DialogDescription>
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
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fecha y hora" required>
              <Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
            </Field>
            <Field label="Tipo">
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(FOLLOWUP_TYPES).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Prioridad">
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITIES).map(([value, meta]) => (
                    <SelectItem key={value} value={value}>
                      {meta.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {isManager(user) ? (
              <Field label="Responsable" hint="Vacío = vendedor asignado al cliente">
                <SellerPicker value={assignee} onChange={setAssignee} />
              </Field>
            ) : null}
          </div>
          <Field label="Nota">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Qué hay que hacer…" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!customer || !due || mutation.isPending}>
            {mutation.isPending ? "Creando…" : "Crear seguimiento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
