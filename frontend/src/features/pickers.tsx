import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { SearchableSelect } from "@/components/shared/searchable-select";
import { useDebounce } from "@/hooks/use-debounce";
import { useTeam } from "@/hooks/use-org";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import type { Customer, Page, Vehicle } from "@/types/api";

export function CustomerPicker({
  value,
  onChange,
  placeholder = "Elegir cliente…",
  initialLabel,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  initialLabel?: string;
}) {
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 250);

  const query = useQuery({
    queryKey: ["customer-picker", debounced],
    queryFn: () =>
      api.get<Page<Customer>>("/customers", { q: debounced || undefined, page_size: 12, order_by: "-last_contact_at" }),
    meta: { silent: true },
  });

  const options = (query.data?.items ?? []).map((c) => ({
    value: c.id,
    label: c.full_name,
    sublabel: [c.phone, `${c.lead_score}/99`].filter(Boolean).join(" · "),
  }));
  if (value && initialLabel && !options.some((o) => o.value === value)) {
    options.unshift({ value, label: initialLabel, sublabel: "" });
  }

  return (
    <SearchableSelect
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      searchPlaceholder="Buscar por nombre o teléfono…"
      onSearchChange={setSearch}
      loading={query.isFetching}
      emptyText="No encontramos clientes"
    />
  );
}

export function VehiclePicker({
  value,
  onChange,
  placeholder = "Elegir vehículo…",
  onlyAvailable = true,
  initialLabel,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  onlyAvailable?: boolean;
  initialLabel?: string;
}) {
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 250);

  const query = useQuery({
    queryKey: ["vehicle-picker", debounced, onlyAvailable],
    queryFn: () =>
      api.get<Page<Vehicle>>("/vehicles", {
        q: debounced || undefined,
        status: onlyAvailable ? "disponible" : undefined,
        page_size: 12,
      }),
    meta: { silent: true },
  });

  const options = (query.data?.items ?? []).map((v) => ({
    value: v.id,
    label: `${v.title} ${v.year}`,
    sublabel: money(v.price),
  }));
  if (value && initialLabel && !options.some((o) => o.value === value)) {
    options.unshift({ value, label: initialLabel, sublabel: "" });
  }

  return (
    <SearchableSelect
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      searchPlaceholder="Buscar por marca, modelo o patente…"
      onSearchChange={setSearch}
      loading={query.isFetching}
      emptyText="No encontramos vehículos"
    />
  );
}

export function SellerPicker({
  value,
  onChange,
  placeholder = "Vendedor…",
  includeManagers = false,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  includeManagers?: boolean;
}) {
  const team = useTeam();
  const options = (team.data ?? [])
    .filter((u) => u.is_active && (includeManagers || u.role === "vendedor"))
    .map((u) => ({ value: u.id, label: u.full_name, sublabel: u.role }));
  return (
    <SearchableSelect
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      emptyText="Sin usuarios"
    />
  );
}
