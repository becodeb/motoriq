import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { z } from "zod";

import { EmptyState } from "@/components/shared/empty-state";
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
import { api } from "@/lib/api";
import { BODY_TYPES, FUELS, TRANSMISSIONS } from "@/lib/constants";
import { isManager, useAuth } from "@/stores/auth";
import type { Vehicle } from "@/types/api";
import { ShieldAlert } from "lucide-react";

const schema = z.object({
  brand: z.string().min(1, "La marca es obligatoria"),
  model: z.string().min(1, "El modelo es obligatorio"),
  version: z.string(),
  year: z.string().regex(/^\d{4}$/, "Año inválido"),
  km: z.string(),
  price: z.string().min(1, "El precio es obligatorio"),
  cost: z.string(),
  plate: z.string(),
  color: z.string(),
  location: z.string(),
  doors: z.string(),
  fuel: z.string(),
  transmission: z.string(),
  body_type: z.string(),
  description: z.string(),
  observations: z.string(),
});

type FormValues = z.infer<typeof schema>;

const toNumber = (value: string): number | null => {
  const cleaned = value.replace(/[^\d.,]/g, "").replace(/\./g, "").replace(",", ".");
  if (!cleaned) return null;
  const direct = Number(value.replace(/[^\d.]/g, ""));
  const parsed = Number.isFinite(direct) && direct > 0 ? direct : Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

export function VehicleFormDialog({
  open,
  onOpenChange,
  vehicle,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle?: Vehicle;
  onSaved?: (vehicle: Vehicle) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuth((s) => s.user);
  const manager = isManager(user);
  const editing = Boolean(vehicle);
  const [saving, setSaving] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      brand: "", model: "", version: "", year: "", km: "0", price: "", cost: "", plate: "",
      color: "", location: "", doors: "", fuel: "nafta", transmission: "manual", body_type: "sedan",
      description: "", observations: "",
    },
  });

  useEffect(() => {
    if (!open) return;
    if (vehicle) {
      form.reset({
        brand: vehicle.brand,
        model: vehicle.model,
        version: vehicle.version ?? "",
        year: String(vehicle.year),
        km: String(vehicle.km),
        price: String(vehicle.price),
        cost: vehicle.cost != null ? String(vehicle.cost) : "",
        plate: vehicle.plate ?? "",
        color: vehicle.color ?? "",
        location: vehicle.location ?? "",
        doors: vehicle.doors != null ? String(vehicle.doors) : "",
        fuel: vehicle.fuel,
        transmission: vehicle.transmission,
        body_type: vehicle.body_type,
        description: vehicle.description ?? "",
        observations: vehicle.observations ?? "",
      });
    } else {
      form.reset();
    }
  }, [open, vehicle, form]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = {
        brand: values.brand.trim(),
        model: values.model.trim(),
        version: values.version.trim() || null,
        year: Number(values.year),
        km: toNumber(values.km) ?? 0,
        price: toNumber(values.price),
        cost: toNumber(values.cost),
        plate: values.plate.trim() || null,
        fuel: values.fuel,
        transmission: values.transmission,
        color: values.color.trim() || null,
        location: values.location.trim() || null,
        body_type: values.body_type,
        doors: toNumber(values.doors),
        description: values.description.trim() || null,
        observations: values.observations.trim() || null,
      };
      if (payload.price === null) throw new Error("Precio inválido");
      if (editing && vehicle) return api.patch<Vehicle>(`/vehicles/${vehicle.id}`, payload);
      return api.post<Vehicle>("/vehicles", payload);
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      void queryClient.invalidateQueries({ queryKey: ["vehicle", saved.id] });
      void queryClient.invalidateQueries({ queryKey: ["matches"] });
      toast.success(
        editing ? "Vehículo actualizado" : `${saved.title} ingresado — Motor IQ ya busca clientes compatibles`,
      );
      onOpenChange(false);
      if (onSaved) onSaved(saved);
      else if (!editing) navigate(`/vehiculos/${saved.id}`);
    },
    onSettled: () => setSaving(false),
    meta: { silent: false },
  });

  if (!manager) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo vehículo</DialogTitle>
            <DialogDescription>Gestión de stock</DialogDescription>
          </DialogHeader>
          <EmptyState
            icon={ShieldAlert}
            title="Necesitás permisos de gerencia"
            description="La carga y edición de vehículos está reservada a administradores y gerentes."
          />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>{editing ? `Editar ${vehicle?.title}` : "Nuevo vehículo"}</DialogTitle>
          <DialogDescription>
            Al ingresar un vehículo, Motor IQ busca automáticamente clientes compatibles (§25).
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4"
          onSubmit={form.handleSubmit((values) => {
            setSaving(true);
            mutation.mutate(values);
          })}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Marca" required error={form.formState.errors.brand?.message}>
              <Input {...form.register("brand")} placeholder="Toyota" autoFocus />
            </Field>
            <Field label="Modelo" required error={form.formState.errors.model?.message}>
              <Input {...form.register("model")} placeholder="Corolla" />
            </Field>
            <Field label="Versión">
              <Input {...form.register("version")} placeholder="XEI 2.0 CVT" />
            </Field>
            <Field label="Año" required error={form.formState.errors.year?.message}>
              <Input {...form.register("year")} placeholder="2022" inputMode="numeric" />
            </Field>
            <Field label="Kilometraje">
              <Input {...form.register("km")} placeholder="45000" inputMode="numeric" />
            </Field>
            <Field label="Patente">
              <Input {...form.register("plate")} placeholder="AB123CD" />
            </Field>
            <Field label="Precio" required error={form.formState.errors.price?.message}>
              <Input {...form.register("price")} placeholder="23500" inputMode="numeric" />
            </Field>
            <Field label="Costo" hint="Visible solo para gerencia">
              <Input {...form.register("cost")} placeholder="20500" inputMode="numeric" />
            </Field>
            <Field label="Puertas">
              <Input {...form.register("doors")} placeholder="5" inputMode="numeric" />
            </Field>
            <Field label="Carrocería">
              <Controller
                control={form.control}
                name="body_type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(BODY_TYPES).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field label="Transmisión">
              <Controller
                control={form.control}
                name="transmission"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TRANSMISSIONS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field label="Combustible">
              <Controller
                control={form.control}
                name="fuel"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(FUELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field label="Color">
              <Input {...form.register("color")} placeholder="Blanco" />
            </Field>
            <Field label="Ubicación" className="sm:col-span-2">
              <Input {...form.register("location")} placeholder="Sucursal Centro" />
            </Field>
          </div>

          <Field label="Descripción">
            <Textarea {...form.register("description")} rows={2} placeholder="Estado, servicios, extras…" />
          </Field>
          <Field label="Observaciones internas">
            <Textarea {...form.register("observations")} rows={2} placeholder="Solo visible para el equipo" />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || mutation.isPending}>
              {mutation.isPending ? "Guardando…" : editing ? "Guardar cambios" : "Ingresar vehículo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
