import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CarFront,
  ImagePlus,
  Pencil,
  Target,
  Trash2,
  TrendingUp,
  Users,
} from "lucide-react";
import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";

import { VehicleStatusBadge } from "@/components/shared/badges";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Field } from "@/components/shared/field";
import { ScoreRing } from "@/components/shared/score-ring";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
import { VehicleFormDialog } from "@/features/forms/vehicle-form";
import { CustomerPicker } from "@/features/pickers";
import { api } from "@/lib/api";
import { BODY_TYPES, FUELS, TRANSMISSIONS, VEHICLE_STATUS } from "@/lib/constants";
import { dateFull, money, num } from "@/lib/format";
import { cn } from "@/lib/utils";
import { isManager, useAuth } from "@/stores/auth";
import type { Match, Vehicle, VehicleStats } from "@/types/api";

export function VehicleDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuth((s) => s.user);
  const manager = isManager(user);
  const fileInput = useRef<HTMLInputElement>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
  const [activeImage, setActiveImage] = useState(0);

  const vehicleQuery = useQuery({
    queryKey: ["vehicle", id],
    queryFn: () => api.get<Vehicle>(`/vehicles/${id}`),
  });
  const vehicle = vehicleQuery.data;

  const stats = useQuery({
    queryKey: ["vehicle-stats", id],
    queryFn: () => api.get<VehicleStats>(`/vehicles/${id}/stats`),
    enabled: Boolean(vehicle),
  });

  const matches = useQuery({
    queryKey: ["matches", "vehicle", id],
    queryFn: () => api.get<Match[]>("/matches", { vehicle_id: id, limit: 20 }),
    enabled: Boolean(vehicle),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["vehicle", id] });
    void queryClient.invalidateQueries({ queryKey: ["vehicles"] });
    void queryClient.invalidateQueries({ queryKey: ["vehicle-stats", id] });
  };

  const statusMutation = useMutation({
    mutationFn: (payload: { status: string; sold_price?: number; buyer_customer_id?: string | null }) =>
      api.post<Vehicle>(`/vehicles/${id}/status`, payload),
    onSuccess: (updated) => {
      toast.success(`Estado actualizado: ${VEHICLE_STATUS[updated.status]?.label ?? updated.status}`);
      invalidate();
      setSellOpen(false);
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => api.upload<Vehicle>(`/vehicles/${id}/images`, file),
    onSuccess: () => {
      toast.success("Foto agregada");
      invalidate();
    },
  });

  const deleteImage = useMutation({
    mutationFn: (imageId: string) => api.delete(`/vehicles/${id}/images/${imageId}`),
    onSuccess: () => {
      setActiveImage(0);
      invalidate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/vehicles/${id}`),
    onSuccess: () => {
      toast.success("Vehículo eliminado");
      navigate("/vehiculos");
      void queryClient.invalidateQueries({ queryKey: ["vehicles"] });
    },
  });

  if (vehicleQuery.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 rounded-xl" />
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    );
  }
  if (!vehicle) {
    return (
      <EmptyState
        icon={CarFront}
        title="Vehículo no encontrado"
        action={<Button onClick={() => navigate("/vehiculos")}>Volver al stock</Button>}
        className="py-24"
      />
    );
  }

  const margin = manager && vehicle.cost ? vehicle.price - vehicle.cost : null;
  const images = vehicle.images.length ? vehicle.images : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon-sm" onClick={() => navigate(-1)} aria-label="Volver">
          <ArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-bold tracking-tight">
              {vehicle.title} {vehicle.year}
            </h1>
            <VehicleStatusBadge status={vehicle.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {num(vehicle.km)} km · {TRANSMISSIONS[vehicle.transmission]} · {FUELS[vehicle.fuel]} ·{" "}
            {BODY_TYPES[vehicle.body_type]}
            {vehicle.plate ? ` · ${vehicle.plate}` : ""}
          </p>
        </div>
        {manager ? (
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={vehicle.status}
              onValueChange={(status) => {
                if (status === "vendido") setSellOpen(true);
                else statusMutation.mutate({ status });
              }}
            >
              <SelectTrigger size="sm" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(VEHICLE_STATUS).map(([value, meta]) => (
                  <SelectItem key={value} value={value}>
                    {meta.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil /> Editar
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Eliminar" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="text-destructive" />
            </Button>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* Columna principal */}
        <div className="space-y-4">
          {/* Galería */}
          <Card className="overflow-hidden p-0">
            <div className="relative aspect-[16/9] bg-muted">
              {images ? (
                <img
                  src={images[Math.min(activeImage, images.length - 1)]!.url}
                  alt={vehicle.title}
                  className="size-full object-cover"
                />
              ) : (
                <div className="flex size-full items-center justify-center text-muted-foreground">
                  <CarFront className="size-16 opacity-40" />
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 overflow-x-auto p-3 scrollbar-thin">
              {(images ?? []).map((image, index) => (
                <div key={image.id} className="group relative shrink-0">
                  <button
                    className={cn(
                      "block h-14 w-20 overflow-hidden rounded-md border-2",
                      index === activeImage ? "border-pops" : "border-transparent opacity-70 hover:opacity-100",
                    )}
                    onClick={() => setActiveImage(index)}
                  >
                    <img src={image.url} alt="" className="size-full object-cover" />
                  </button>
                  {manager ? (
                    <button
                      className="absolute -right-1 -top-1 hidden rounded-full bg-destructive p-0.5 text-white group-hover:block"
                      onClick={() => deleteImage.mutate(image.id)}
                      aria-label="Borrar foto"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  ) : null}
                </div>
              ))}
              {manager ? (
                <button
                  className="flex h-14 w-20 shrink-0 items-center justify-center rounded-md border-2 border-dashed text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
                  onClick={() => fileInput.current?.click()}
                  disabled={uploadMutation.isPending}
                  aria-label="Agregar foto"
                >
                  <ImagePlus className="size-5" />
                </button>
              ) : null}
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadMutation.mutate(file);
                  e.target.value = "";
                }}
              />
            </div>
          </Card>

          {/* Inteligencia Motor IQ (§21) */}
          {stats.data?.demand_text ? (
            <Card className="flex-row items-center gap-3 border-pops/30 px-4 py-3">
              <TrendingUp className="size-5 shrink-0 text-pops" />
              <p className="text-sm">{stats.data.demand_text}</p>
            </Card>
          ) : null}

          {/* Interesados */}
          <Card className="gap-3">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Users className="size-4 text-muted-foreground" /> Interesados
                {stats.data ? (
                  <span className="text-sm font-normal text-muted-foreground nums">
                    {stats.data.inquiries} consulta{stats.data.inquiries === 1 ? "" : "s"}
                  </span>
                ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {stats.isPending ? (
                <Skeleton className="h-24" />
              ) : stats.data?.interested_customers.length ? (
                stats.data.interested_customers.map((customer) => (
                  <Link
                    key={customer.id}
                    to={`/clientes/${customer.id}`}
                    className="flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors hover:border-ring/50"
                  >
                    <ScoreRing score={customer.lead_score} label={customer.score_label} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{customer.full_name}</span>
                      <span className="block text-xs text-muted-foreground">{customer.phone ?? customer.status}</span>
                    </span>
                  </Link>
                ))
              ) : (
                <EmptyState title="Sin consultas todavía" description="Cuando un cliente pregunte por este vehículo, aparece acá." className="py-6" />
              )}
            </CardContent>
          </Card>

          {/* Matching (§25) */}
          <Card className="gap-3">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="size-4 text-pops" /> Clientes compatibles según Motor IQ
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {matches.isPending ? (
                <Skeleton className="h-20" />
              ) : matches.data?.length ? (
                matches.data.slice(0, 8).map((match) => (
                  <Link
                    key={match.id}
                    to={`/clientes/${match.customer.id}`}
                    className="flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors hover:border-pops/50"
                  >
                    <span className="font-display w-11 shrink-0 text-lg font-bold text-pops nums">{match.score}%</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{match.customer.full_name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{match.reasons.slice(0, 3).join(" · ")}</span>
                    </span>
                    <ScoreRing score={match.customer.lead_score} label={match.customer.score_label} size="sm" />
                  </Link>
                ))
              ) : (
                <EmptyState
                  title="Sin matches por ahora"
                  description="Motor IQ compara este vehículo contra las preferencias de todos los clientes activos."
                  className="py-6"
                />
              )}
            </CardContent>
          </Card>

          {vehicle.description ? (
            <Card className="gap-2 px-4 py-3.5">
              <CardTitle className="text-sm">Descripción</CardTitle>
              <p className="text-sm text-muted-foreground">{vehicle.description}</p>
              {manager && vehicle.observations ? (
                <p className="rounded-md bg-muted px-2.5 py-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Interno:</span> {vehicle.observations}
                </p>
              ) : null}
            </Card>
          ) : null}
        </div>

        {/* Rail derecho */}
        <div className="space-y-4">
          <Card className="gap-3 px-4 py-4">
            <p className="font-display text-3xl font-bold nums">{money(vehicle.price)}</p>
            {vehicle.status === "vendido" && vehicle.sold_price ? (
              <p className="text-sm text-muted-foreground nums">
                Vendido por {money(vehicle.sold_price)} el {dateFull(vehicle.sold_at)}
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-muted px-3 py-2">
                <p className="text-xs text-muted-foreground">Días en stock</p>
                <p className="font-semibold nums">
                  {vehicle.days_in_stock}
                  {stats.data?.avg_days_fleet ? (
                    <span className="text-xs font-normal text-muted-foreground"> / prom. {stats.data.avg_days_fleet}</span>
                  ) : null}
                </p>
              </div>
              <div className="rounded-lg bg-muted px-3 py-2">
                <p className="text-xs text-muted-foreground">Consultas</p>
                <p className="font-semibold nums">{stats.data?.inquiries ?? "…"}</p>
              </div>
              {manager && margin !== null ? (
                <>
                  <div className="rounded-lg bg-muted px-3 py-2">
                    <p className="text-xs text-muted-foreground">Costo</p>
                    <p className="font-semibold nums">{money(vehicle.cost)}</p>
                  </div>
                  <div className="rounded-lg bg-muted px-3 py-2">
                    <p className="text-xs text-muted-foreground">Margen</p>
                    <p className={cn("font-semibold nums", margin > 0 ? "text-score-cierre" : "text-destructive")}>
                      {money(margin)}
                      {stats.data?.margin_percent != null ? (
                        <span className="text-xs font-normal"> ({stats.data.margin_percent}%)</span>
                      ) : null}
                    </p>
                  </div>
                </>
              ) : null}
              <div className="rounded-lg bg-muted px-3 py-2">
                <p className="text-xs text-muted-foreground">Oportunidades</p>
                <p className="font-semibold nums">{stats.data?.opportunities_count ?? "…"}</p>
              </div>
              <div className="rounded-lg bg-muted px-3 py-2">
                <p className="text-xs text-muted-foreground">Conversión</p>
                <p className="font-semibold nums">
                  {stats.data?.conversion_rate != null ? `${Math.round(stats.data.conversion_rate * 100)}%` : "—"}
                </p>
              </div>
            </div>
          </Card>

          <Card className="gap-2 px-4 py-3.5">
            <CardTitle className="text-sm">Ficha</CardTitle>
            <div className="divide-y text-sm">
              {[
                ["Marca", vehicle.brand],
                ["Modelo", vehicle.model],
                ["Versión", vehicle.version ?? "—"],
                ["Año", String(vehicle.year)],
                ["Kilometraje", `${num(vehicle.km)} km`],
                ["Color", vehicle.color ?? "—"],
                ["Puertas", vehicle.doors != null ? String(vehicle.doors) : "—"],
                ["Ubicación", vehicle.location ?? "—"],
                ["Ingreso", dateFull(vehicle.entry_date)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between py-1.5">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <span className="font-medium">{value}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <VehicleFormDialog open={editOpen} onOpenChange={setEditOpen} vehicle={vehicle} onSaved={invalidate} />
      <SellDialog
        open={sellOpen}
        onOpenChange={setSellOpen}
        vehicle={vehicle}
        busy={statusMutation.isPending}
        onConfirm={(soldPrice, buyerId) =>
          statusMutation.mutate({ status: "vendido", sold_price: soldPrice, buyer_customer_id: buyerId })
        }
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`¿Eliminar ${vehicle.title}?`}
        description="Solo se puede eliminar si no tiene oportunidades abiertas."
        confirmLabel="Eliminar"
        destructive
        onConfirm={() => deleteMutation.mutateAsync().then(() => undefined)}
      />
    </div>
  );
}

function SellDialog({
  open,
  onOpenChange,
  vehicle,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle: Vehicle;
  busy: boolean;
  onConfirm: (soldPrice: number | undefined, buyerId: string | null) => void;
}) {
  const [price, setPrice] = useState(String(vehicle.price));
  const [buyerId, setBuyerId] = useState<string | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Marcar como vendido</DialogTitle>
          <DialogDescription>
            {vehicle.title} {vehicle.year} — si la venta salió de una oportunidad, mejor movela a “Vendido” en el
            pipeline para que quede todo vinculado.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Precio final">
            <Input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric" />
          </Field>
          <Field label="Comprador (opcional)">
            <CustomerPicker value={buyerId} onChange={setBuyerId} placeholder="Buscar cliente…" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button
            variant="pops"
            disabled={busy}
            onClick={() => {
              const parsed = Number(price.replace(/[^\d.]/g, ""));
              onConfirm(Number.isFinite(parsed) && parsed > 0 ? parsed : undefined, buyerId);
            }}
          >
            {busy ? "Guardando…" : "Confirmar venta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
