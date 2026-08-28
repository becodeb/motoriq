import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { z } from "zod";

import { Field } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SellerPicker, VehiclePicker } from "@/features/pickers";
import { BODY_TYPES, FUELS, SOURCES, TRANSMISSIONS } from "@/lib/constants";
import { api, ApiError } from "@/lib/api";
import { isManager, useAuth } from "@/stores/auth";
import type { Customer } from "@/types/api";

const schema = z.object({
  first_name: z.string().min(1, "El nombre es obligatorio"),
  last_name: z.string(),
  phone: z.string(),
  whatsapp: z.string(),
  email: z.union([z.literal(""), z.string().email("Email inválido")]),
  source: z.string(),
  budget: z.string(),
  notes: z.string(),
  interest_brand: z.string(),
  interest_model: z.string(),
  interest_year_min: z.string(),
  interest_year_max: z.string(),
});

type FormValues = z.infer<typeof schema>;

function numberOrNull(value: string): number | null {
  const cleaned = value.replace(/[^\d.,]/g, "").replace(",", ".");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function CustomerFormDialog({
  open,
  onOpenChange,
  customer,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer?: Customer;
  onSaved?: (customer: Customer) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuth((s) => s.user);
  const editing = Boolean(customer);

  const [assignedUserId, setAssignedUserId] = useState<string | null>(null);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [bodyType, setBodyType] = useState<string | null>(null);
  const [transmission, setTransmission] = useState<string | null>(null);
  const [fuel, setFuel] = useState<string | null>(null);
  const [financing, setFinancing] = useState(false);
  const [tradeIn, setTradeIn] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      first_name: "", last_name: "", phone: "", whatsapp: "", email: "", source: "whatsapp",
      budget: "", notes: "", interest_brand: "", interest_model: "", interest_year_min: "", interest_year_max: "",
    },
  });

  useEffect(() => {
    if (!open) return;
    setDuplicateWarning(null);
    if (customer) {
      form.reset({
        first_name: customer.first_name,
        last_name: customer.last_name,
        phone: customer.phone ?? "",
        whatsapp: customer.whatsapp ?? "",
        email: customer.email ?? "",
        source: customer.source,
        budget: customer.budget != null ? String(customer.budget) : "",
        notes: customer.notes ?? "",
        interest_brand: customer.interest_brand ?? "",
        interest_model: customer.interest_model ?? "",
        interest_year_min: customer.interest_year_min != null ? String(customer.interest_year_min) : "",
        interest_year_max: customer.interest_year_max != null ? String(customer.interest_year_max) : "",
      });
      setAssignedUserId(customer.assigned_user?.id ?? null);
      setVehicleId(customer.interested_vehicle?.id ?? null);
      setBodyType(customer.interest_body_type);
      setTransmission(customer.interest_transmission);
      setFuel(customer.interest_fuel);
      setFinancing(customer.financing_interest);
      setTradeIn(customer.has_trade_in);
    } else {
      form.reset();
      setAssignedUserId(null);
      setVehicleId(null);
      setBodyType(null);
      setTransmission(null);
      setFuel(null);
      setFinancing(false);
      setTradeIn(false);
    }
  }, [open, customer, form]);

  const buildPayload = (values: FormValues, force: boolean) => ({
    first_name: values.first_name.trim(),
    last_name: values.last_name.trim(),
    phone: values.phone.trim() || null,
    whatsapp: values.whatsapp.trim() || null,
    email: values.email.trim() || null,
    source: values.source,
    assigned_user_id: assignedUserId,
    interested_vehicle_id: vehicleId,
    budget: numberOrNull(values.budget),
    financing_interest: financing,
    has_trade_in: tradeIn,
    interest_brand: values.interest_brand.trim() || null,
    interest_model: values.interest_model.trim() || null,
    interest_body_type: bodyType,
    interest_year_min: numberOrNull(values.interest_year_min),
    interest_year_max: numberOrNull(values.interest_year_max),
    interest_transmission: transmission,
    interest_fuel: fuel,
    notes: values.notes.trim() || null,
    force,
  });

  const mutation = useMutation({
    mutationFn: async ({ values, force }: { values: FormValues; force: boolean }) => {
      if (editing && customer) {
        const { force: _f, ...payload } = buildPayload(values, force);
        return api.patch<Customer>(`/customers/${customer.id}`, payload);
      }
      return api.post<Customer>("/customers", buildPayload(values, force));
    },
    meta: { silent: true },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      void queryClient.invalidateQueries({ queryKey: ["customer", saved.id] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(editing ? "Cliente actualizado" : `${saved.full_name} creado`);
      onOpenChange(false);
      if (onSaved) onSaved(saved);
      else if (!editing) navigate(`/clientes/${saved.id}`);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "CUSTOMER_DUPLICATE") {
        setDuplicateWarning(error.message);
        return;
      }
      toast.error(error instanceof Error ? error.message : "No se pudo guardar el cliente");
    },
  });

  const submit = (force: boolean) =>
    form.handleSubmit((values) => mutation.mutate({ values, force }))();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>{editing ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Actualizá los datos y las preferencias de búsqueda."
              : "Con el interés cargado, Motor IQ calcula score y matching automáticamente."}
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit(false);
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre" required error={form.formState.errors.first_name?.message}>
              <Input {...form.register("first_name")} placeholder="Juan" autoFocus />
            </Field>
            <Field label="Apellido">
              <Input {...form.register("last_name")} placeholder="Pérez" />
            </Field>
            <Field label="Teléfono">
              <Input {...form.register("phone")} placeholder="+54 9 11 …" />
            </Field>
            <Field label="WhatsApp">
              <Input {...form.register("whatsapp")} placeholder="Igual al teléfono" />
            </Field>
            <Field label="Email" error={form.formState.errors.email?.message}>
              <Input {...form.register("email")} placeholder="juan@mail.com" />
            </Field>
            <Field label="Origen">
              <Controller
                control={form.control}
                name="source"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(SOURCES).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            {isManager(user) ? (
              <Field label="Vendedor asignado" hint="Vacío = distribución automática">
                <SellerPicker value={assignedUserId} onChange={setAssignedUserId} />
              </Field>
            ) : null}
            <Field label="Vehículo de interés">
              <VehiclePicker
                value={vehicleId}
                onChange={setVehicleId}
                initialLabel={customer?.interested_vehicle ? `${customer.interested_vehicle.title} ${customer.interested_vehicle.year}` : undefined}
              />
            </Field>
            <Field label="Presupuesto">
              <Input {...form.register("budget")} placeholder="22000" inputMode="numeric" />
            </Field>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Label className="cursor-pointer font-normal">
              <Checkbox checked={financing} onCheckedChange={(v) => setFinancing(v === true)} /> Le interesa
              financiación
            </Label>
            <Label className="cursor-pointer font-normal">
              <Checkbox checked={tradeIn} onCheckedChange={(v) => setTradeIn(v === true)} /> Tiene vehículo para
              permuta
            </Label>
          </div>

          <fieldset className="rounded-lg border p-3">
            <legend className="px-1 text-xs font-medium text-muted-foreground">
              Preferencias de búsqueda (alimentan el matching)
            </legend>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Marca">
                <Input {...form.register("interest_brand")} placeholder="Toyota" />
              </Field>
              <Field label="Modelo">
                <Input {...form.register("interest_model")} placeholder="Corolla" />
              </Field>
              <Field label="Carrocería">
                <Select value={bodyType ?? "any"} onValueChange={(v) => setBodyType(v === "any" ? null : v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Cualquiera</SelectItem>
                    {Object.entries(BODY_TYPES).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Año desde">
                <Input {...form.register("interest_year_min")} placeholder="2019" inputMode="numeric" />
              </Field>
              <Field label="Año hasta">
                <Input {...form.register("interest_year_max")} placeholder="2024" inputMode="numeric" />
              </Field>
              <Field label="Transmisión">
                <Select
                  value={transmission ?? "any"}
                  onValueChange={(v) => setTransmission(v === "any" ? null : v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Cualquiera</SelectItem>
                    {Object.entries(TRANSMISSIONS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Combustible" className="sm:col-span-1">
                <Select value={fuel ?? "any"} onValueChange={(v) => setFuel(v === "any" ? null : v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Cualquiera</SelectItem>
                    {Object.entries(FUELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </fieldset>

          <Field label="Notas">
            <Textarea {...form.register("notes")} placeholder="Contexto del cliente…" rows={2} />
          </Field>

          {duplicateWarning ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <div className="flex-1">
                <p className="font-medium">{duplicateWarning}</p>
                <p className="text-muted-foreground">
                  Revisá antes de crear un duplicado, o creá el registro igual si es otra persona.
                </p>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            {duplicateWarning ? (
              <Button type="button" variant="secondary" disabled={mutation.isPending} onClick={() => submit(true)}>
                Crear de todos modos
              </Button>
            ) : null}
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Guardando…" : editing ? "Guardar cambios" : "Crear cliente"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
