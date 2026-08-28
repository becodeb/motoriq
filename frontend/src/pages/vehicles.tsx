import { useQuery } from "@tanstack/react-query";
import { CarFront, Download, Plus, Upload } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { VehicleStatusBadge } from "@/components/shared/badges";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Pager } from "@/components/shared/pager";
import { VehicleThumb } from "@/components/shared/vehicle-thumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { VehicleFormDialog } from "@/features/forms/vehicle-form";
import { ImportDialog } from "@/features/import-dialog";
import { useDebounce } from "@/hooks/use-debounce";
import { api } from "@/lib/api";
import { BODY_TYPES, VEHICLE_STATUS } from "@/lib/constants";
import { money, num } from "@/lib/format";
import { isManager, useAuth } from "@/stores/auth";
import type { Page, Vehicle } from "@/types/api";

export function VehiclesPage() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 300);
  const [status, setStatus] = useState("disponible");
  const [bodyType, setBodyType] = useState("all");
  const [brand, setBrand] = useState("all");
  const [orderBy, setOrderBy] = useState("-created_at");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const brands = useQuery({
    queryKey: ["vehicle-brands"],
    queryFn: () => api.get<string[]>("/vehicles/brands"),
  });

  const query = useQuery({
    queryKey: ["vehicles", debounced, status, bodyType, brand, orderBy, page],
    queryFn: () =>
      api.get<Page<Vehicle>>("/vehicles", {
        q: debounced || undefined,
        status: status === "all" ? undefined : status,
        body_type: bodyType === "all" ? undefined : bodyType,
        brand: brand === "all" ? undefined : brand,
        order_by: orderBy,
        page,
        page_size: 24,
      }),
    placeholderData: (prev) => prev,
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Vehículos"
        subtitle={query.data ? `${query.data.total} unidades` : undefined}
        actions={
          <>
            {isManager(user) ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                  <Upload /> Importar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    api.download("/vehicles/export", "vehiculos.csv").then(
                      () => toast.success("Exportación descargada"),
                      () => toast.error("No se pudo exportar"),
                    )
                  }
                >
                  <Download /> Exportar
                </Button>
                <Button size="sm" variant="pops" onClick={() => setCreateOpen(true)}>
                  <Plus /> Nuevo vehículo
                </Button>
              </>
            ) : null}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Buscar por marca, modelo o patente…"
          className="w-64"
        />
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {Object.entries(VEHICLE_STATUS).map(([value, meta]) => (
              <SelectItem key={value} value={value}>
                {meta.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={brand} onValueChange={(v) => { setBrand(v); setPage(1); }}>
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las marcas</SelectItem>
            {(brands.data ?? []).map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={bodyType} onValueChange={(v) => { setBodyType(v); setPage(1); }}>
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las carrocerías</SelectItem>
            {Object.entries(BODY_TYPES).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={orderBy} onValueChange={setOrderBy}>
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="-created_at">Más recientes</SelectItem>
            <SelectItem value="price">Menor precio</SelectItem>
            <SelectItem value="-price">Mayor precio</SelectItem>
            <SelectItem value="-year">Más nuevos</SelectItem>
            <SelectItem value="km">Menos km</SelectItem>
            <SelectItem value="entry_date">Más días en stock</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {query.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : query.data?.items.length ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {query.data.items.map((vehicle) => (
              <button
                key={vehicle.id}
                className="group overflow-hidden rounded-xl border bg-card text-left transition-colors hover:border-ring/50"
                onClick={() => navigate(`/vehiculos/${vehicle.id}`)}
              >
                <div className="relative aspect-[16/10] overflow-hidden bg-muted">
                  <VehicleThumb
                    url={vehicle.thumbnail_url}
                    title={vehicle.title}
                    className="size-full rounded-none object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                  <div className="absolute left-2 top-2">
                    <VehicleStatusBadge status={vehicle.status} />
                  </div>
                  {vehicle.status === "disponible" && vehicle.days_in_stock >= 60 ? (
                    <span className="absolute right-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white nums">
                      {vehicle.days_in_stock} días
                    </span>
                  ) : null}
                </div>
                <div className="space-y-1 p-3">
                  <p className="truncate font-semibold">
                    {vehicle.brand} {vehicle.model}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {vehicle.version ?? ""} · {vehicle.year} · {num(vehicle.km)} km
                  </p>
                  <p className="font-display text-lg font-bold nums">{money(vehicle.price)}</p>
                </div>
              </button>
            ))}
          </div>
          <Pager page={page} pageSize={24} total={query.data.total} onPageChange={setPage} />
        </>
      ) : (
        <EmptyState
          icon={CarFront}
          title="No hay vehículos con estos filtros"
          description={
            status === "all"
              ? "Cuando ingreses vehículos van a aparecer acá."
              : "Probá cambiar el estado o limpiar los filtros."
          }
          action={
            isManager(user) ? (
              <Button variant="pops" onClick={() => setCreateOpen(true)}>
                <Plus /> Ingresar vehículo
              </Button>
            ) : undefined
          }
          className="py-20"
        />
      )}

      <VehicleFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ImportDialog entity="vehicles" open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
